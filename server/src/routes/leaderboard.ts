/**
 * 排行榜路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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

    const counts = await Promise.all(
      allUserIds.map(async (uid) => {
        const entries = await prisma.diaryEntry.findMany({
          where: {
            userId: uid,
            status: 'active',
            diaryDate: { startsWith: currentYearMonth },
          },
          select: { diaryDate: true },
        });
        return {
          userId: uid,
          monthCount: new Set(entries.map(entry => entry.diaryDate.slice(0, 10))).size,
        };
      })
    );

    const countMap = new Map(counts.map(c => [c.userId, c.monthCount]));

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
    const targetUserId = req.params.id;
    const fromUserId = req.user!.userId;

    const existing = await prisma.leaderboardLike.findUnique({
      where: { userId_fromUserId: { userId: targetUserId, fromUserId } }
    });

    if (existing) {
      await prisma.leaderboardLike.delete({
        where: { id: existing.id }
      });
      res.json({ liked: false });
    } else {
      await prisma.leaderboardLike.create({
        data: { userId: targetUserId, fromUserId }
      });
      res.json({ liked: true });
    }
  } catch (err: any) {
    console.error('排行榜点赞操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

export default router;
