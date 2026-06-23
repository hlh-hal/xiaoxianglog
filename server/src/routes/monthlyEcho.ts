import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { paramString, queryString } from '../utils/request.js';
import {
  getMonthlyEchoApiPayload,
  regenerateMonthlyEcho,
} from '../lib/monthlyEchoService.js';
import { getZonedNow, safeTimeZone } from '../lib/monthlyEchoUtils.js';

const router = Router();
router.use(requireAuth);

function normalizeMonthKey(value: string): string | null {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const fallbackMonthKey = getZonedNow(safeTimeZone()).monthKey;
    const monthKey = normalizeMonthKey(queryString(req, 'monthKey')) || fallbackMonthKey;
    res.json(await getMonthlyEchoApiPayload(req.user!.userId, monthKey));
  } catch (error: any) {
    console.error('[monthly-echo] load failed:', error);
    res.status(500).json({ error: '获取月度回声失败' });
  }
});

router.post('/:monthKey/regenerate', async (req: Request, res: Response) => {
  try {
    const monthKey = normalizeMonthKey(paramString(req, 'monthKey'));
    if (!monthKey) {
      res.status(400).json({ error: '月份格式不正确' });
      return;
    }
    res.json(await regenerateMonthlyEcho(req.user!.userId, monthKey));
  } catch (error: any) {
    const message = error instanceof Error ? error.message : '重新生成月度回声失败';
    res.status(message.includes('次数') ? 429 : 500).json({ error: message });
  }
});

export default router;
