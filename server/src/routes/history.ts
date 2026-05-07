/**
 * 编辑历史路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// 获取某篇日记的编辑历史
router.get('/:entryId', async (req: Request, res: Response) => {
  try {
    const histories = await prisma.editHistory.findMany({
      where: { entryId: req.params.entryId, userId: req.user!.userId },
      orderBy: { savedAt: 'desc' },
      take: 50,
    });
    res.json(histories.map(h => ({
      ...h,
      images: h.images ? JSON.parse(h.images) : [],
    })));
  } catch (err: any) {
    res.status(500).json({ error: '获取编辑历史失败' });
  }
});

// 保存编辑历史
router.post('/', async (req: Request, res: Response) => {
  try {
    const { entryId, content, images } = req.body;
    if (!entryId || !content) {
      res.status(400).json({ error: '缺少必要字段' });
      return;
    }

    const summary = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    const history = await prisma.editHistory.create({
      data: {
        entryId,
        userId: req.user!.userId,
        content,
        images: images ? JSON.stringify(images) : null,
        summary,
      },
    });
    res.status(201).json(history);
  } catch (err: any) {
    res.status(500).json({ error: '保存编辑历史失败' });
  }
});

export default router;
