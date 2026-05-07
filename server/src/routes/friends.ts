import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' },
        ],
      },
      include: {
        requester: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
        addressee: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
      },
    });

    const friends = friendships.map((friendship) => {
      const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      return {
        id: friend.id,
        name: friend.nickname,
        avatar: friend.avatarUrl,
        bio: friend.bio,
        friendshipId: friendship.id,
        since: friendship.createdAt,
      };
    });

    res.json(friends);
  } catch {
    res.status(500).json({ error: '获取好友列表失败' });
  }
});

router.post('/request', async (req: Request, res: Response) => {
  try {
    const { addresseeId, targetUserId, note } = req.body;
    const recipientId = String(addresseeId || targetUserId || '').trim();
    if (!recipientId) {
      res.status(400).json({ error: '缺少目标用户' });
      return;
    }

    const userId = req.user!.userId;
    if (recipientId === userId) {
      res.status(400).json({ error: '不能添加自己' });
      return;
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: recipientId },
          { requesterId: recipientId, addresseeId: userId },
        ],
      },
    });

    if (existing?.status === 'accepted') {
      res.json({ message: 'already friends', status: 'accepted' });
      return;
    }

    if (existing?.status === 'pending') {
      res.json({ message: 'request already pending', status: 'pending' });
      return;
    }

    if (existing) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          requesterId: userId,
          addresseeId: recipientId,
          note,
        },
      });
    } else {
      await prisma.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: recipientId,
          note,
          status: 'pending',
        },
      });
    }

    await prisma.notification.create({
      data: {
        userId: recipientId,
        fromUserId: userId,
        type: 'friend_request',
        content: note,
      },
    });

    res.json({ message: 'friend request sent', status: 'pending' });
  } catch (err) {
    console.error('send friend request failed:', err);
    res.status(500).json({ error: '发送失败' });
  }
});

router.put('/request/:id', async (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    const userId = req.user!.userId;
    const requestId = String(req.params.id || '');

    const friendship = await prisma.friendship.findFirst({
      where: { id: requestId, addresseeId: userId, status: 'pending' },
    });

    if (!friendship) {
      res.status(404).json({ error: '好友申请不存在' });
      return;
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await prisma.friendship.update({
      where: { id: requestId },
      data: { status: newStatus },
    });

    res.json({
      message: action === 'accept' ? '已接受' : '已拒绝',
      status: newStatus,
    });
  } catch {
    res.status(500).json({ error: '处理失败' });
  }
});

router.post('/:userId/accept', async (req: Request, res: Response) => {
  try {
    const requesterId = String(req.params.userId || '');
    const addresseeId = req.user!.userId;

    const friendship = await prisma.friendship.findFirst({
      where: { requesterId, addresseeId, status: 'pending' },
    });

    if (!friendship) {
      res.status(404).json({ error: '未找到待处理的好友申请' });
      return;
    }

    await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'accepted' },
    });

    res.json({ message: '已接受', status: 'accepted' });
  } catch {
    res.status(500).json({ error: '处理失败' });
  }
});

router.post('/:userId/decline', async (req: Request, res: Response) => {
  try {
    const requesterId = String(req.params.userId || '');
    const addresseeId = req.user!.userId;

    const friendship = await prisma.friendship.findFirst({
      where: { requesterId, addresseeId, status: 'pending' },
    });

    if (!friendship) {
      res.status(404).json({ error: '未找到待处理的好友申请' });
      return;
    }

    await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'declined' },
    });

    res.json({ message: '已拒绝', status: 'declined' });
  } catch {
    res.status(500).json({ error: '处理失败' });
  }
});

router.delete('/:friendId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const friendId = String(req.params.friendId || '');

    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
    });

    res.json({ message: '已删除好友' });
  } catch {
    res.status(500).json({ error: '删除失败' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const keyword = String(req.query.q || '').trim();
    if (!keyword) {
      res.json([]);
      return;
    }

    const currentUserId = req.user!.userId;
    const users = await prisma.user.findMany({
      where: {
        nickname: { contains: keyword },
        id: { not: currentUserId },
      },
      select: { id: true, nickname: true, avatarUrl: true, bio: true },
      take: 20,
    });

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: currentUserId, addresseeId: { in: users.map((user) => user.id) } },
          { addresseeId: currentUserId, requesterId: { in: users.map((user) => user.id) } },
        ],
      },
    });

    const statusMap = new Map<string, string>();
    friendships.forEach((friendship) => {
      const otherId = friendship.requesterId === currentUserId ? friendship.addresseeId : friendship.requesterId;
      statusMap.set(otherId, friendship.status);
    });

    res.json(users.map((user) => ({
      id: user.id,
      name: user.nickname,
      avatar: user.avatarUrl,
      bio: user.bio,
      friendStatus: statusMap.get(user.id) || 'none',
    })));
  } catch {
    res.status(500).json({ error: '搜索失败' });
  }
});

export default router;
