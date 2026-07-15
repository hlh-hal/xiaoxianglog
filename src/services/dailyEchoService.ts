import { api, ApiError, apiUrl, getAccessToken } from './apiClient';

export type DailyEchoJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';

export type DailyEchoJobSnapshot = {
  id: string;
  entryId: string;
  status: DailyEchoJobStatus;
  phase: 'queued' | 'generating' | 'retrying' | 'ready' | 'failed' | 'stale';
  sourceHash: string;
  sourceEntryUpdatedAt: string;
  regenerateCount: number;
  previewContent: string;
  content: string | null;
  selectedMemoryEntryIds: string[];
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

export type CreateDailyEchoJobInput = {
  entryId: string;
  diaryText: string;
  diaryDate: string;
  sourceEntryUpdatedAt: string;
  regenerateCount: number;
  memoryContext: string;
  selectedMemoryEntryIds: string[];
  modelId?: string;
};

type LatestDailyEchoJobResponse = DailyEchoJobSnapshot | { job: DailyEchoJobSnapshot | null } | null;

const TERMINAL_JOB_STATUSES = new Set<DailyEchoJobStatus>(['succeeded', 'failed', 'stale']);
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export function isDailyEchoJobActive(job?: DailyEchoJobSnapshot | null): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

export function isDailyEchoJobTerminal(job?: DailyEchoJobSnapshot | null): boolean {
  return Boolean(job && TERMINAL_JOB_STATUSES.has(job.status));
}

/**
 * Must stay byte-for-byte equivalent to the server source hash helper. The server
 * normalizes `${diaryDate.trim()}\n${plainText.replace(/\s+/g, ' ').trim()}` and
 * runs FNV-1a over JavaScript UTF-16 code units (not UTF-8 bytes).
 */
export function normalizeDailyEchoSource(diaryDate: string, plainText: string): string {
  const normalizedDate = diaryDate.trim();
  const normalizedText = plainText
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
  return `${normalizedDate}\n${normalizedText}`;
}

export function createDailyEchoSourceHash(diaryDate: string, plainText: string): string {
  const source = normalizeDailyEchoSource(diaryDate, plainText);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export async function createDailyEchoJob(input: CreateDailyEchoJobInput): Promise<DailyEchoJobSnapshot> {
  return api.post<DailyEchoJobSnapshot>('/daily-echo/jobs', input);
}

export async function getDailyEchoJob(jobId: string): Promise<DailyEchoJobSnapshot> {
  return api.get<DailyEchoJobSnapshot>(`/daily-echo/jobs/${encodeURIComponent(jobId)}`);
}

export async function getLatestDailyEchoJob(entryId: string): Promise<DailyEchoJobSnapshot | null> {
  try {
    const response = await api.get<LatestDailyEchoJobResponse>(
      `/daily-echo/entries/${encodeURIComponent(entryId)}/latest`,
    );
    if (response && typeof response === 'object' && 'job' in response) {
      return (response as { job: DailyEchoJobSnapshot | null }).job;
    }
    return response as DailyEchoJobSnapshot | null;
  } catch (error) {
    // A missing latest job is expected for entries that have never generated an echo.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function abortError(): DOMException {
  return new DOMException('Daily Echo watcher aborted', 'AbortError');
}

function waitForPollDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function parseSnapshotEvent(block: string): DailyEchoJobSnapshot | null {
  const lines = block.split(/\r?\n/);
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if ((eventName !== 'snapshot' && eventName !== 'message') || dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as DailyEchoJobSnapshot;
  } catch {
    return null;
  }
}

async function watchDailyEchoJobStream(
  jobId: string,
  onSnapshot: (snapshot: DailyEchoJobSnapshot) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<DailyEchoJobSnapshot | null> {
  const token = getAccessToken();
  const response = await fetch(apiUrl(`/daily-echo/jobs/${encodeURIComponent(jobId)}/events`), {
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    signal,
  });

  if (!response.ok || !response.body) {
    if ([401, 403, 404].includes(response.status)) {
      throw new ApiError(`Daily Echo stream unavailable (${response.status})`, response.status);
    }
    throw new Error(`Daily Echo stream unavailable (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latest: DailyEchoJobSnapshot | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const snapshot = parseSnapshotEvent(block);
      if (!snapshot) continue;
      latest = snapshot;
      await onSnapshot(snapshot);
      if (isDailyEchoJobTerminal(snapshot)) {
        void reader.cancel();
        return snapshot;
      }
    }

    if (done) {
      const trailingSnapshot = parseSnapshotEvent(buffer);
      if (trailingSnapshot) {
        latest = trailingSnapshot;
        await onSnapshot(trailingSnapshot);
      }
      return latest;
    }
  }
}

async function pollDailyEchoJob(
  jobId: string,
  onSnapshot: (snapshot: DailyEchoJobSnapshot) => void | Promise<void>,
  signal?: AbortSignal,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
): Promise<DailyEchoJobSnapshot> {
  let failureCount = 0;
  while (!signal?.aborted) {
    try {
      const snapshot = await getDailyEchoJob(jobId);
      failureCount = 0;
      await onSnapshot(snapshot);
      if (isDailyEchoJobTerminal(snapshot)) return snapshot;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw abortError();
      }
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) throw error;
      // Transient network failures should not detach the UI from the durable job.
      console.warn('Daily Echo polling temporarily failed:', error);
      failureCount += 1;
    }
    const delay = Math.min(15_000, intervalMs * Math.max(1, 2 ** Math.min(failureCount, 3)));
    await waitForPollDelay(delay, signal);
  }
  throw abortError();
}

/**
 * Watches the durable server job. SSE gives progressive previews while the page is
 * open; if that connection ends before a terminal snapshot, polling keeps recovery
 * working across proxies and older WebViews.
 */
export async function watchDailyEchoJob(
  jobId: string,
  onSnapshot: (snapshot: DailyEchoJobSnapshot) => void | Promise<void>,
  options: { signal?: AbortSignal; pollIntervalMs?: number } = {},
): Promise<DailyEchoJobSnapshot> {
  const { signal, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = options;
  if (signal?.aborted) throw abortError();

  try {
    const streamResult = await watchDailyEchoJobStream(jobId, onSnapshot, signal);
    if (streamResult && isDailyEchoJobTerminal(streamResult)) return streamResult;
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw abortError();
    }
    console.warn('Daily Echo stream ended; falling back to polling:', error);
  }

  return pollDailyEchoJob(jobId, onSnapshot, signal, pollIntervalMs);
}
