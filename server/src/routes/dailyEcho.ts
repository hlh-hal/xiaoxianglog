import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit, userOrIpKey } from '../middleware/rateLimit.js';
import {
  enqueueDailyEchoJob,
  getDailyEchoJobSnapshot,
  getLatestDailyEchoJobSnapshot,
  isDailyEchoBackgroundEnabled,
  type DailyEchoJobSnapshot,
} from '../lib/dailyEchoService.js';
import { subscribeDailyEchoSnapshot } from '../lib/dailyEchoEvents.js';
import { kickDailyEchoScheduler } from '../lib/dailyEchoScheduler.js';
import { paramString, stringArray } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

const createRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.DAILY_ECHO_RATE_LIMIT_PER_MINUTE || 6),
  keyPrefix: 'daily-echo-create',
  keyGenerator: userOrIpKey,
  message: '每日回声生成得太频繁了，请稍后再试。',
});

function cleanRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function writeSnapshot(res: Response, snapshot: DailyEchoJobSnapshot): void {
  res.json(snapshot);
}

router.post('/jobs', createRateLimit, async (req: Request, res: Response) => {
  if (!isDailyEchoBackgroundEnabled()) {
    res.status(503).json({ error: '每日回声后台生成暂未开放' });
    return;
  }

  const body = req.body || {};
  const entryId = cleanRequiredString(body.entryId, 160);
  const diaryDate = cleanRequiredString(body.diaryDate, 10);
  const diaryText = typeof body.diaryText === 'string' ? body.diaryText.trim() : '';
  const sourceEntryUpdatedAt = cleanRequiredString(body.sourceEntryUpdatedAt, 80);
  const regenerateCount = Number(body.regenerateCount);
  const memoryContext = typeof body.memoryContext === 'string' ? body.memoryContext : '';
  const modelId = typeof body.modelId === 'string' && body.modelId.trim().length <= 120
    ? body.modelId.trim()
    : undefined;

  if (
    !entryId
    || !diaryDate
    || !/^\d{4}-\d{2}-\d{2}$/.test(diaryDate)
    || diaryText.length < 6
    || diaryText.length > 50_000
    || !sourceEntryUpdatedAt
    || !Number.isInteger(regenerateCount)
    || regenerateCount < 0
    || regenerateCount > 100
  ) {
    res.status(400).json({ error: '每日回声任务参数不正确' });
    return;
  }

  try {
    const snapshot = await enqueueDailyEchoJob({
      userId: req.user!.userId,
      entryId,
      diaryDate,
      diaryText,
      sourceEntryUpdatedAt,
      regenerateCount,
      memoryContext,
      selectedMemoryEntryIds: stringArray(body.selectedMemoryEntryIds, 2, 160),
      modelId,
    });
    kickDailyEchoScheduler();
    res.status(202).json(snapshot);
  } catch (error) {
    console.error('[daily-echo] enqueue failed:', error);
    res.status(500).json({ error: '暂时无法开始生成，请稍后再试' });
  }
});

router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  const snapshot = await getDailyEchoJobSnapshot(req.user!.userId, paramString(req, 'jobId'));
  if (!snapshot) {
    res.status(404).json({ error: '每日回声任务不存在' });
    return;
  }
  writeSnapshot(res, snapshot);
});

router.get('/entries/:entryId/latest', async (req: Request, res: Response) => {
  const entryId = paramString(req, 'entryId');
  if (!entryId) {
    res.status(400).json({ error: '缺少日记 ID' });
    return;
  }
  const job = await getLatestDailyEchoJobSnapshot(req.user!.userId, entryId);
  res.json({ job });
});

router.get('/jobs/:jobId/events', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const jobId = paramString(req, 'jobId');
  const initial = await getDailyEchoJobSnapshot(userId, jobId);
  if (!initial) {
    res.status(404).json({ error: '每日回声任务不存在' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const send = (snapshot: unknown) => {
    if (closed || res.writableEnded) return;
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    const status = (snapshot as { status?: string })?.status;
    if (status === 'succeeded' || status === 'failed' || status === 'stale') close();
  };
  const unsubscribe = subscribeDailyEchoSnapshot(jobId, send);
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': heartbeat\n\n');
  }, 15_000);
  heartbeat.unref?.();

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  }

  req.on('close', close);

  // Subscribe first and then re-read to avoid missing a terminal transition.
  const current = await getDailyEchoJobSnapshot(userId, jobId);
  if (!current) {
    close();
    return;
  }
  send(current);
});

export default router;
