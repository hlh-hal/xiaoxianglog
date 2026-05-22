import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { paramString, stringArray } from '../utils/request.js';
import { saveEditHistorySnapshot } from '../lib/editHistory.js';

const router = Router();
router.use(requireAuth);

router.get('/:entryId', async (req: Request, res: Response) => {
  try {
    const histories = await prisma.editHistory.findMany({
      where: { entryId: paramString(req, 'entryId'), userId: req.user!.userId },
      orderBy: { savedAt: 'desc' },
      take: 50,
    });
    res.json(histories.map(h => ({
      ...h,
      images: h.images ? JSON.parse(h.images) : [],
    })));
  } catch {
    res.status(500).json({ error: '获取编辑历史失败' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { entryId, content, images } = req.body;
    if (!entryId) {
      res.status(400).json({ error: '缺少必要字段' });
      return;
    }

    const entry = await prisma.diaryEntry.findFirst({
      where: { id: String(entryId), userId: req.user!.userId },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }

    const snapshot = await saveEditHistorySnapshot({
      entryId: entry.id,
      userId: req.user!.userId,
      content,
      images: stringArray(images, 20, 2000),
    });
    res.status(snapshot ? 201 : 200).json(snapshot || { skipped: true });
    return;
  } catch {
    res.status(500).json({ error: '保存编辑历史失败' });
  }
});

export default router;
