import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { paramString, stringArray } from '../utils/request.js';

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
    if (!entryId || !content) {
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

    const safeContent = String(content).slice(0, 200000);

    // Deduplication: skip if the most recent history entry has identical content
    const lastHistory = await prisma.editHistory.findFirst({
      where: { entryId: entry.id, userId: req.user!.userId },
      orderBy: { savedAt: 'desc' },
      select: { id: true, content: true },
    });
    if (lastHistory && lastHistory.content === safeContent) {
      // Content unchanged — no need to create a duplicate entry
      res.status(200).json({ id: lastHistory.id, deduplicated: true });
      return;
    }

    const summary = safeContent.substring(0, 50) + (safeContent.length > 50 ? '...' : '');
    const history = await prisma.editHistory.create({
      data: {
        entryId: entry.id,
        userId: req.user!.userId,
        content: safeContent,
        images: images ? JSON.stringify(stringArray(images, 20, 2000)) : null,
        summary,
      },
    });
    res.status(201).json(history);
  } catch {
    res.status(500).json({ error: '保存编辑历史失败' });
  }
});

export default router;
