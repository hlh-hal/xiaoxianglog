/**
 * 排行榜路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendNotificationPush } from '../lib/push.js';
import { paramString } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

function diaryDayKey(diaryDate: string) {
  const rawDate = String(diaryDate || '').trim();
  if (!rawDate) return null;
  const datePart = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

async function createLeaderboardLikeNotification(userId: string, fromUserId: string) {
  if (userId === fromUserId) return;

  const notification = await prisma.notification.create({
    data: {
      userId,
      fromUserId,
      type: 'like',
    },
    include: {
      sender: { select: { nickname: true } },
    },
  });
  sendNotificationPush(notification).catch(error => console.warn('推送排行榜点赞通知失败:', error));
}

// 获取当前用户的获赞汇总：社区帖子赞 + 评论赞 + 排行榜赞
router.get('/me/received-likes', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [communityPostLikes, comments, commentLikeRows, leaderboardLikes] = await Promise.all([
      prisma.postLike.count({
        where: {
          post: {
            userId,
            status: 'published',
          },
        },
      }),
      prisma.postComment.findMany({
        where: { userId },
        select: {
          id: true,
          likes: true,
          _count: { select: { likedBy: true } },
        },
      }),
      prisma.postCommentLike.count({
        where: {
          comment: { userId },
        },
      }),
      prisma.leaderboardLike.count({
        where: { userId },
      }),
    ]);

    const commentLikes = comments.reduce((sum, comment) => {
      return sum + Math.max(0, comment.likes || 0, comment._count.likedBy || 0);
    }, 0);

    res.json({
      totalLikes: communityPostLikes + commentLikes + leaderboardLikes,
      communityPostLikes,
      commentLikes,
      commentLikeRows,
      leaderboardLikes,
    });
  } catch (err: any) {
    console.error('获取获赞汇总失败', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取排行榜
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 获取好友列表
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' },
        ],
      },
    });
    const friendIds = friendships.map(f =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );
    // 包含自己
    const allUserIds = [...friendIds, userId];

    // 统计每个用户本月有日志的天数：一天多篇只算一天
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, nickname: true, avatarUrl: true },
    });

    const monthEntries = await prisma.diaryEntry.findMany({
      where: {
        userId: { in: allUserIds },
        status: 'active',
        isHidden: false,
        diaryDate: { startsWith: currentYearMonth },
      },
      select: { userId: true, diaryDate: true },
    });
    const countMap = new Map<string, number>();
    const daysByUser = new Map<string, Set<string>>();

    monthEntries.forEach(entry => {
      const dayKey = diaryDayKey(entry.diaryDate);
      if (!dayKey) return;
      const days = daysByUser.get(entry.userId) || new Set<string>();
      days.add(dayKey);
      daysByUser.set(entry.userId, days);
    });

    allUserIds.forEach(uid => {
      countMap.set(uid, daysByUser.get(uid)?.size || 0);
    });

    // 统计每个用户获得的点赞数
    const likeCounts = await Promise.all(
      allUserIds.map(async (uid) => {
        const likes = await prisma.leaderboardLike.findMany({
          where: { userId: uid },
          include: { fromUser: { select: { id: true, nickname: true } } },
          orderBy: { createdAt: 'desc' }
        });
        return { 
          userId: uid, 
          likes: likes.length,
          likedBy: likes.map(l => l.fromUser.nickname),
          likedByMe: likes.some(l => l.fromUser.id === userId)
        };
      })
    );
    const likeMap = new Map(likeCounts.map(l => [l.userId, l]));

    const leaderboard = users
      .map(u => {
        const likeInfo = likeMap.get(u.id);
        return {
          id: u.id,
          name: u.nickname,
          avatar: u.avatarUrl,
          monthCount: countMap.get(u.id) || 0,
          likes: likeInfo?.likes || 0,
          likedBy: likeInfo?.likedBy || [],
          likedByMe: likeInfo?.likedByMe || false,
          isCurrentUser: u.id === userId,
        };
      })
      .sort((a, b) => b.monthCount - a.monthCount);

    res.json(leaderboard);
  } catch (err: any) {
    console.error('获取排行榜失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 排行榜点赞/取消点赞
router.post('/:id/like', async (req: Request, res: Response) => {
  try {
    const targetUserId = paramString(req, 'id');
    const fromUserId = req.user!.userId;
    const action = typeof req.body?.action === 'string' ? req.body.action : 'toggle';

    if (!targetUserId) {
      res.status(400).json({ error: '缺少目标用户' });
      return;
    }

    if (!['like', 'unlike', 'toggle'].includes(action)) {
      res.status(400).json({ error: '无效的点赞操作' });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const existing = await prisma.leaderboardLike.findUnique({
      where: { userId_fromUserId: { userId: targetUserId, fromUserId } }
    });

    if (action === 'like') {
      if (!existing) {
        await prisma.leaderboardLike.create({
          data: { userId: targetUserId, fromUserId }
        });
        await createLeaderboardLikeNotification(targetUserId, fromUserId);
      }
      res.json({ liked: true });
      return;
    }

    if (action === 'unlike') {
      if (existing) {
        await prisma.leaderboardLike.delete({
          where: { id: existing.id }
        });
      }
      res.json({ liked: false });
      return;
    }

    if (existing) {
      await prisma.leaderboardLike.delete({
        where: { id: existing.id }
      });
      res.json({ liked: false });
    } else {
      await prisma.leaderboardLike.create({
        data: { userId: targetUserId, fromUserId }
      });
      await createLeaderboardLikeNotification(targetUserId, fromUserId);
      res.json({ liked: true });
    }
  } catch (err: any) {
    console.error('排行榜点赞操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

export default router;
