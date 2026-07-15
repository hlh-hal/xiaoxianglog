import { randomUUID } from 'node:crypto';
import type { DailyEchoJob, Prisma } from '@prisma/client';
import prisma from './prisma.js';
import { AiProviderError, getDefaultAiModelId, streamAiText } from './aiProvider.js';
import { publishDailyEchoSnapshot } from './dailyEchoEvents.js';
import {
  buildDailyEchoDiaryExcerpt,
  buildDailyEchoPromptSet,
  computeDailyEchoSourceHash,
  DAILY_ECHO_MAX_ATTEMPTS,
  DAILY_ECHO_MAX_MEMORY_CHARS,
  DAILY_ECHO_MAX_MEMORY_ENTRIES,
  DAILY_ECHO_PROMPT_VERSION,
  type DailyEchoPromptInput,
  validateDailyEchoContent,
} from './dailyEchoCore.js';

export type DailyEchoJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';

export type DailyEchoJobSnapshot = {
  id: string;
  entryId: string;
  sourceHash: string;
  sourceEntryUpdatedAt: string;
  regenerateCount: number;
  status: DailyEchoJobStatus;
  phase: 'queued' | 'generating' | 'retrying' | 'ready' | 'failed' | 'stale';
  selectedMemoryEntryIds: string[];
  previewContent: string;
  content: string | null;
  promptVersion: string;
  model: string | null;
  provider: string | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueDailyEchoJobArgs = {
  userId: string;
  entryId: string;
  diaryText: string;
  diaryDate: string;
  sourceEntryUpdatedAt: string;
  regenerateCount: number;
  memoryContext?: string;
  selectedMemoryEntryIds?: string[];
  modelId?: string;
};

const ACTIVE_STATUSES: DailyEchoJobStatus[] = ['queued', 'running'];
const DAILY_ECHO_LOCK_MS = getPositiveEnvNumber('DAILY_ECHO_LOCK_MS', 3 * 60 * 1000);
const DAILY_ECHO_LOCK_RENEW_MS = Math.min(
  getPositiveEnvNumber('DAILY_ECHO_LOCK_RENEW_MS', 30 * 1000),
  Math.max(1000, Math.floor(DAILY_ECHO_LOCK_MS / 2)),
);
const DAILY_ECHO_PREVIEW_THROTTLE_MS = getPositiveEnvNumber('DAILY_ECHO_PREVIEW_THROTTLE_MS', 250);
const DAILY_ECHO_JOB_TIMEOUT_MS = getPositiveEnvNumber('DAILY_ECHO_JOB_TIMEOUT_MS', 180 * 1000);
const DAILY_ECHO_MAX_WORKERS = Math.max(1, Math.min(8, getPositiveEnvNumber('DAILY_ECHO_MAX_WORKERS', 4)));
const DAILY_ECHO_READY_CONTENT = '你的「每日回声」已经生成，点击查看。';

const locallyRunningJobIds = new Set<string>();
const locallyRunningUserIds = new Set<string>();

export function isDailyEchoBackgroundEnabled(): boolean {
  const configured = String(process.env.DAILY_ECHO_BACKGROUND_ENABLED || '').trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function getPositiveEnvNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function getSnapshotPhase(job: DailyEchoJob): DailyEchoJobSnapshot['phase'] {
  if (job.status === 'queued') return 'queued';
  if (job.status === 'succeeded') return 'ready';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'stale') return 'stale';
  return job.errorCode ? 'retrying' : 'generating';
}

export function toDailyEchoJobSnapshot(job: DailyEchoJob): DailyEchoJobSnapshot {
  return {
    id: job.id,
    entryId: job.entryId,
    sourceHash: job.sourceHash,
    sourceEntryUpdatedAt: job.sourceEntryUpdatedAt,
    regenerateCount: job.regenerateCount,
    status: job.status as DailyEchoJobStatus,
    phase: getSnapshotPhase(job),
    selectedMemoryEntryIds: parseStringArray(job.selectedMemoryEntryIds).slice(0, 2),
    previewContent: job.previewContent || '',
    content: job.finalContent,
    promptVersion: job.promptVersion,
    model: job.model,
    provider: job.provider,
    attemptCount: job.attemptCount,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt?.toISOString() || null,
    generatedAt: job.finishedAt?.toISOString() || null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function publishJob(jobId: string): Promise<DailyEchoJobSnapshot | null> {
  const job = await prisma.dailyEchoJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  const snapshot = toDailyEchoJobSnapshot(job);
  publishDailyEchoSnapshot(jobId, snapshot);
  return snapshot;
}

export async function getDailyEchoJobSnapshot(userId: string, jobId: string): Promise<DailyEchoJobSnapshot | null> {
  const job = await prisma.dailyEchoJob.findFirst({ where: { id: jobId, userId } });
  return job ? toDailyEchoJobSnapshot(job) : null;
}

export async function getLatestDailyEchoJobSnapshot(
  userId: string,
  entryId: string,
): Promise<DailyEchoJobSnapshot | null> {
  const job = await prisma.dailyEchoJob.findFirst({
    where: { userId, entryId },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  });
  return job ? toDailyEchoJobSnapshot(job) : null;
}

function isPrismaUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002');
}

export async function enqueueDailyEchoJob(args: EnqueueDailyEchoJobArgs): Promise<DailyEchoJobSnapshot> {
  const modelId = args.modelId || getDefaultAiModelId();
  const sourceHash = computeDailyEchoSourceHash(args.diaryDate, args.diaryText);
  const activeKey = `${args.userId}|${args.entryId}`;
  const dedupeKey = `${args.userId}|${args.entryId}|${sourceHash}|${args.regenerateCount}`;
  const promptInput: DailyEchoPromptInput = {
    diaryText: buildDailyEchoDiaryExcerpt(args.diaryText),
    diaryDate: args.diaryDate,
    memoryContext: String(args.memoryContext || '').slice(0, DAILY_ECHO_MAX_MEMORY_CHARS),
    modelId,
  };
  const selectedMemoryEntryIds = (args.selectedMemoryEntryIds || [])
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .slice(0, DAILY_ECHO_MAX_MEMORY_ENTRIES);
  let staleJobId: string | null = null;
  let reusedExisting = false;
  let job: DailyEchoJob | null = null;

  try {
    job = await prisma.$transaction(async (tx) => {
      const exact = await tx.dailyEchoJob.findUnique({ where: { dedupeKey } });
      if (exact) {
        reusedExisting = true;
        return exact;
      }

      const active = await tx.dailyEchoJob.findUnique({ where: { activeKey } });
      if (active) {
        // Repeated regenerate clicks for the same saved source reuse the active job.
        if (active.sourceHash === sourceHash) {
          reusedExisting = true;
          return active;
        }

        const staleResult = await tx.dailyEchoJob.updateMany({
          where: { id: active.id, activeKey, status: { in: ACTIVE_STATUSES } },
          data: {
            activeKey: null,
            runKey: null,
            status: 'stale',
            promptInput: null,
            previewContent: '',
            lockToken: null,
            lockedUntil: null,
            errorCode: 'source-changed',
            errorMessage: '日记内容已更新，这次生成已停止。',
            finishedAt: new Date(),
          },
        });
        if (staleResult.count > 0) staleJobId = active.id;
      }

      return tx.dailyEchoJob.create({
        data: {
          userId: args.userId,
          entryId: args.entryId,
          activeKey,
          dedupeKey,
          sourceHash,
          sourceEntryUpdatedAt: args.sourceEntryUpdatedAt,
          regenerateCount: args.regenerateCount,
          status: 'queued',
          promptInput: JSON.stringify(promptInput),
          selectedMemoryEntryIds: JSON.stringify(selectedMemoryEntryIds),
          promptVersion: DAILY_ECHO_PROMPT_VERSION,
          model: modelId,
        },
      });
    });
  } catch (error) {
    if (!isPrismaUniqueError(error)) throw error;
    job = await prisma.dailyEchoJob.findFirst({
      where: { OR: [{ dedupeKey }, { activeKey }] },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) throw error;
    reusedExisting = true;
  }

  if (!job) throw new Error('Daily Echo job was not created');
  if (staleJobId) await publishJob(staleJobId);
  const snapshot = toDailyEchoJobSnapshot(job);
  publishDailyEchoSnapshot(job.id, snapshot);
  console.log(`[daily-echo] event=enqueue-result job=${job.id} status=${job.status} dedupeHit=${reusedExisting}`);
  return snapshot;
}

function parsePromptInput(value: string | null): DailyEchoPromptInput | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DailyEchoPromptInput>;
    if (
      typeof parsed.diaryText !== 'string'
      || typeof parsed.diaryDate !== 'string'
      || typeof parsed.memoryContext !== 'string'
      || typeof parsed.modelId !== 'string'
    ) {
      return null;
    }
    return parsed as DailyEchoPromptInput;
  } catch {
    return null;
  }
}

async function acquireJobLock(jobId: string): Promise<{ job: DailyEchoJob; token: string } | null> {
  const candidate = await prisma.dailyEchoJob.findUnique({ where: { id: jobId } });
  if (!candidate) return null;

  const now = new Date();
  const token = randomUUID();
  let result: { count: number };
  try {
    result = await prisma.dailyEchoJob.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: 'queued' },
          {
            status: 'running',
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
          },
        ],
      },
      data: {
        status: 'running',
        runKey: candidate.userId,
        lockToken: token,
        lockedUntil: new Date(now.getTime() + DAILY_ECHO_LOCK_MS),
        startedAt: candidate.startedAt || now,
        finishedAt: null,
      },
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) return null;
    throw error;
  }
  if (result.count === 0) return null;

  const job = await prisma.dailyEchoJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  await publishJob(jobId);
  return { job, token };
}

async function stillOwnsJob(jobId: string, token: string): Promise<boolean> {
  const job = await prisma.dailyEchoJob.findUnique({
    where: { id: jobId },
    select: { status: true, lockToken: true },
  });
  return job?.status === 'running' && job.lockToken === token;
}

async function updateOwnedJob(
  jobId: string,
  token: string,
  data: Prisma.DailyEchoJobUpdateManyMutationInput,
  publish = true,
): Promise<boolean> {
  const result = await prisma.dailyEchoJob.updateMany({
    where: { id: jobId, status: 'running', lockToken: token },
    data,
  });
  if (result.count === 0) return false;
  if (publish) await publishJob(jobId);
  return true;
}

function getSafeProviderError(error: unknown): { code: string; message: string } {
  if (error instanceof AiProviderError) {
    if (error.status === 429) return { code: 'provider-busy', message: '生成服务正在忙，正在重试。' };
    if (error.status === 504) return { code: 'provider-timeout', message: '生成时间有点久，正在重试。' };
    if (error.status === 401 || error.status === 403 || error.status === 503) {
      return { code: 'provider-unavailable', message: '生成服务暂时不可用。' };
    }
  }
  return { code: 'request-failed', message: '生成服务暂时没有回应，正在重试。' };
}

function getTerminalFailureMessage(code: string): string {
  if (code === 'provider-unavailable') return '生成服务暂时不可用，请稍后再试。';
  if (code === 'provider-timeout') return '这次生成等得有点久，请稍后再试。';
  if (code === 'not-grounded' || code === 'vague' || code === 'memory-leak' || code === 'incomplete' || code === 'truncated') {
    return '这次小象没有读完整，请再试一次。';
  }
  return '每日回声生成失败，请稍后再试。';
}

async function finishJobFailed(jobId: string, token: string, code: string, message?: string): Promise<void> {
  const committed = await updateOwnedJob(jobId, token, {
    activeKey: null,
    runKey: null,
    status: 'failed',
    promptInput: null,
    previewContent: '',
    finalContent: null,
    lockToken: null,
    lockedUntil: null,
    errorCode: code,
    errorMessage: message || getTerminalFailureMessage(code),
    finishedAt: new Date(),
  });
  if (committed) console.warn(`[daily-echo] event=failed job=${jobId} errorCode=${code}`);
}

async function finishJobSucceeded(
  job: DailyEchoJob,
  token: string,
  content: string,
  aiModel: string,
  provider: string,
): Promise<boolean> {
  const now = new Date();
  const committed = await prisma.$transaction(async (tx) => {
    const result = await tx.dailyEchoJob.updateMany({
      where: { id: job.id, status: 'running', lockToken: token },
      data: {
        activeKey: null,
        runKey: null,
        status: 'succeeded',
        promptInput: null,
        previewContent: content,
        finalContent: content,
        model: aiModel,
        provider,
        lockToken: null,
        lockedUntil: null,
        errorCode: null,
        errorMessage: null,
        finishedAt: now,
      },
    });
    if (result.count === 0) return false;

    await tx.notification.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        userId: job.userId,
        type: 'daily_echo_ready',
        content: DAILY_ECHO_READY_CONTENT,
        refDiaryId: job.entryId,
      },
      update: {
        userId: job.userId,
        fromUserId: null,
        type: 'daily_echo_ready',
        content: DAILY_ECHO_READY_CONTENT,
        refPostId: null,
        refDiaryId: job.entryId,
      },
    });
    return true;
  });
  if (!committed) return false;

  await publishJob(job.id);
  return true;
}

async function waitBeforeRetry(attemptCount: number): Promise<void> {
  const delay = Math.min(1500, 350 * Math.max(1, attemptCount));
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function runLockedDailyEchoJob(jobId: string): Promise<boolean> {
  const lock = await acquireJobLock(jobId);
  if (!lock) return false;

  const { job, token } = lock;
  const input = parsePromptInput(job.promptInput);
  if (!input) {
    await finishJobFailed(job.id, token, 'invalid-job-input', '生成任务内容已失效，请重新生成。');
    return true;
  }

  let ownsLock = true;
  const renewLock = async () => {
    const renewed = await updateOwnedJob(job.id, token, {
      lockedUntil: new Date(Date.now() + DAILY_ECHO_LOCK_MS),
    }, false);
    if (!renewed) ownsLock = false;
  };
  const lockTimer = setInterval(() => {
    renewLock().catch((error) => {
      ownsLock = false;
      console.warn(`[daily-echo] lock renewal failed job=${job.id}:`, error?.message || error);
    });
  }, DAILY_ECHO_LOCK_RENEW_MS);
  lockTimer.unref?.();

  let rejectedReason = job.errorCode || '';
  let lastFailureCode = rejectedReason || 'request-failed';

  try {
    let currentAttemptCount = job.attemptCount;
    while (currentAttemptCount < DAILY_ECHO_MAX_ATTEMPTS && ownsLock) {
      const started = await updateOwnedJob(job.id, token, {
        attemptCount: { increment: 1 },
        previewContent: '',
        errorCode: null,
        errorMessage: null,
        lockedUntil: new Date(Date.now() + DAILY_ECHO_LOCK_MS),
      });
      if (!started) return true;
      currentAttemptCount += 1;

      const promptSet = buildDailyEchoPromptSet({
        diaryText: input.diaryText,
        diaryDate: input.diaryDate,
        regenerateCount: job.regenerateCount,
        memoryContext: input.memoryContext,
        retryReason: rejectedReason,
        attempt: currentAttemptCount - 1,
        modelId: input.modelId,
      });

      let lastPreviewPersistedAt = 0;
      let lastPreviewContent = '';
      const attemptStartedAt = Date.now();
      let firstChunkLogged = false;
      let completion: Awaited<ReturnType<typeof streamAiText>>;
      try {
        completion = await streamAiText({
          userId: job.userId,
          modelId: promptSet.modelId,
          temperature: promptSet.temperature,
          maxTokens: promptSet.maxTokens,
          timeoutMs: DAILY_ECHO_JOB_TIMEOUT_MS,
          messages: [
            { role: 'system', content: promptSet.systemPrompt },
            { role: 'user', content: promptSet.userPrompt },
          ],
           onDelta: async (_delta, accumulated) => {
             if (!ownsLock) throw new Error('Daily echo job lock was lost');
             const now = Date.now();
             if (!firstChunkLogged) {
               firstChunkLogged = true;
               console.log(
                 `[daily-echo] event=first-chunk job=${job.id} attempt=${currentAttemptCount} firstChunkMs=${now - attemptStartedAt}`,
               );
             }
             if (now - lastPreviewPersistedAt < DAILY_ECHO_PREVIEW_THROTTLE_MS) return;
            if (accumulated === lastPreviewContent) return;
            const persisted = await updateOwnedJob(job.id, token, {
              previewContent: accumulated,
              lockedUntil: new Date(now + DAILY_ECHO_LOCK_MS),
            });
            if (!persisted) {
              ownsLock = false;
              throw new Error('Daily echo job became stale');
            }
            lastPreviewPersistedAt = now;
            lastPreviewContent = accumulated;
          },
        });
      } catch (error) {
        if (!await stillOwnsJob(job.id, token)) return true;
        const safeError = getSafeProviderError(error);
        lastFailureCode = safeError.code;
        rejectedReason = safeError.code;
        console.warn(`[daily-echo] generation attempt failed job=${job.id} attempt=${currentAttemptCount}:`,
          error instanceof Error ? error.message : error);
        await updateOwnedJob(job.id, token, {
          previewContent: '',
          errorCode: safeError.code,
          errorMessage: currentAttemptCount < DAILY_ECHO_MAX_ATTEMPTS
            ? safeError.message
            : getTerminalFailureMessage(safeError.code),
        });
        if (currentAttemptCount < DAILY_ECHO_MAX_ATTEMPTS) await waitBeforeRetry(currentAttemptCount);
        continue;
      }

      if (completion.content !== lastPreviewContent) {
        const persisted = await updateOwnedJob(job.id, token, {
          previewContent: completion.content,
          model: completion.aiModel,
          provider: completion.provider,
        });
        if (!persisted) return true;
      }

      const validation = validateDailyEchoContent(completion.content, input.diaryText, completion.finishReason);
      if (validation.content) {
        const committed = await finishJobSucceeded(job, token, validation.content, completion.aiModel, completion.provider);
        if (committed) {
          const durationMs = Date.now() - (job.startedAt?.getTime() || Date.now());
          console.log(
            `[daily-echo] event=succeeded job=${job.id} attempt=${currentAttemptCount} provider=${completion.provider} durationMs=${durationMs}`,
          );
        }
        return true;
      }

      rejectedReason = validation.reason || 'quality-check-failed';
      lastFailureCode = rejectedReason;
      await updateOwnedJob(job.id, token, {
        previewContent: '',
        errorCode: rejectedReason,
        errorMessage: currentAttemptCount < DAILY_ECHO_MAX_ATTEMPTS
          ? '内容质量检查未通过，正在重试。'
          : getTerminalFailureMessage(rejectedReason),
      });
      if (currentAttemptCount < DAILY_ECHO_MAX_ATTEMPTS) await waitBeforeRetry(currentAttemptCount);
    }

    if (await stillOwnsJob(job.id, token)) {
      await finishJobFailed(job.id, token, lastFailureCode);
    }
    return true;
  } finally {
    clearInterval(lockTimer);
  }
}

export async function dispatchPendingDailyEchoJobs(): Promise<number> {
  const availableSlots = DAILY_ECHO_MAX_WORKERS - locallyRunningJobIds.size;
  if (availableSlots <= 0) return 0;

  const now = new Date();
  const candidates = await prisma.dailyEchoJob.findMany({
    where: {
      OR: [
        { status: 'queued' },
        {
          status: 'running',
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(availableSlots * 4, 8),
  });

  let launched = 0;
  for (const job of candidates) {
    if (launched >= availableSlots) break;
    if (locallyRunningJobIds.has(job.id) || locallyRunningUserIds.has(job.userId)) continue;
    locallyRunningJobIds.add(job.id);
    locallyRunningUserIds.add(job.userId);
    launched += 1;
    void runLockedDailyEchoJob(job.id)
      .catch((error) => {
        console.error(`[daily-echo] worker crashed job=${job.id}:`, error);
      })
      .finally(() => {
        locallyRunningJobIds.delete(job.id);
        locallyRunningUserIds.delete(job.userId);
      });
  }
  return launched;
}
