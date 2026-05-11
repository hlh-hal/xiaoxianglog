/**
 * 通知路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { paramString, queryString } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

// 获取通知列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const type = queryString(req, 'type'); // 'friend_request' | 'like,comment,poke'

    const where: any = { userId };
    if (type) {
      const types = type.split(',');
      where.type = { in: types };
    }

    const notifications = await prisma.notification.findMany({
      where,
      include: {
        sender: { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(notifications.map(n => ({
      id: n.id,
      type: n.type,
      fromUser: n.sender ? {
        id: n.sender.id,
        name: n.sender.nickname,
        avatar: n.sender.avatarUrl,
      } : null,
      content: n.content,
      refPostId: n.refPostId,
      refDiaryId: n.refDiaryId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (err: any) {
    res.status(500).json({ error: '获取通知失败' });
  }
});

// 标记全部已读
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: '已全部标记为已读' });
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 标记单条已读
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
      data: { isRead: true },
    });
    res.json({ message: '已标记已读' });
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取未读数量
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false },
    });
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: '获取失败' });
  }
});

export default router;
