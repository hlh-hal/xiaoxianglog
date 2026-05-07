/**
 * 社区帖子路由
 * GET    /api/community/posts     - 获取帖子列表
 * GET    /api/community/posts/:id - 获取单个帖子详情
 * POST   /api/community/posts     - 发表帖子
 * DELETE /api/community/posts/:id - 删除帖子
 * POST   /api/community/posts/:id/like   - 点赞/取消点赞
 * GET    /api/community/posts/:id/comments - 获取评论
 * POST   /api/community/posts/:id/comments - 发表评论
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// 获取帖子列表（推荐/好友）
router.get('/posts', optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const tab = (req.query.tab as string) || 'recommend';
    const offset = (page - 1) * limit;

    let where: any = { status: 'published' };

    // 好友 Tab：只显示好友的帖子
    if (tab === 'friends' && req.user) {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { requesterId: req.user.userId, status: 'accepted' },
            { addresseeId: req.user.userId, status: 'accepted' },
          ],
        },
      });
      const friendIds = friendships.map(f =>
        f.requesterId === req.user!.userId ? f.addresseeId : f.requesterId
      );
      // 也包含自己的帖子
      friendIds.push(req.user.userId);
      where.userId = { in: friendIds };
    }

    const [posts, total] = await Promise.all([
      prisma.communityPost.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.communityPost.count({ where }),
    ]);

    // 如果用户已登录，标记哪些帖子被当前用户点过赞
    let likedPostIds: Set<string> = new Set();
    if (req.user) {
      const likes = await prisma.postLike.findMany({
        where: { userId: req.user.userId, postId: { in: posts.map(p => p.id) } },
        select: { postId: true },
      });
      likedPostIds = new Set(likes.map(l => l.postId));
    }

    const result = posts.map(p => ({
      id: p.id,
      user: {
        id: p.user.id,
        name: p.user.nickname,
        avatar: p.user.avatarUrl,
        bio: p.user.bio,
        time: formatTime(p.createdAt),
      },
      content: p.content,
      images: p.images ? JSON.parse(p.images) : [],
      viewCount: p.viewCount,
      readCount: p.readCount,
      likes: p._count.likes,
      comments: p._count.comments,
      likedByMe: likedPostIds.has(p.id),
      createdAt: p.createdAt.toISOString(),
    }));

    res.json({ posts: result, total, page, limit });
  } catch (err: any) {
    console.error('获取帖子列表失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取单个帖子详情
router.get('/posts/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const post = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!post || post.status !== 'published') {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    // 增加浏览量
    await prisma.communityPost.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } },
    });

    let likedByMe = false;
    if (req.user) {
      const like = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: post.id, userId: req.user.userId } },
      });
      likedByMe = !!like;
    }

    // 获取点赞者列表
    const likedUsers = await prisma.postLike.findMany({
      where: { postId: post.id },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      id: post.id,
      user: {
        id: post.user.id,
        name: post.user.nickname,
        avatar: post.user.avatarUrl,
        bio: post.user.bio,
      },
      content: post.content,
      images: post.images ? JSON.parse(post.images) : [],
      viewCount: post.viewCount + 1,
      readCount: post.readCount,
      likes: post._count.likes,
      comments: post._count.comments,
      likedByMe,
      likedUsers: likedUsers.map(l => ({
        id: l.user.id,
        name: l.user.nickname,
        avatar: l.user.avatarUrl,
      })),
      createdAt: post.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error('获取帖子详情失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 发表帖子
router.post('/posts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { content, images, entryId } = req.body;
    if (!content && (!images || images.length === 0)) {
      res.status(400).json({ error: '请输入内容或添加图片' });
      return;
    }

    const post = await prisma.communityPost.create({
      data: {
        userId: req.user!.userId,
        content: content || '',
        images: images ? JSON.stringify(images) : null,
        entryId,
      },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
    });

    res.status(201).json({
      id: post.id,
      user: { id: post.user.id, name: post.user.nickname, avatar: post.user.avatarUrl },
      content: post.content,
      images: post.images ? JSON.parse(post.images) : [],
      createdAt: post.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error('发表帖子失败:', err);
    res.status(500).json({ error: '发表失败' });
  }
});

// 删除帖子
router.delete('/posts/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await prisma.communityPost.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { status: 'deleted' },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }
    res.json({ message: '已删除' });
  } catch (err: any) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 点赞/取消点赞
router.post('/posts/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.userId;

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      // 取消点赞
      await prisma.postLike.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      // 点赞
      await prisma.postLike.create({ data: { postId, userId } });

      // 如果点的不是自己的帖子，发送通知
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (post && post.userId !== userId) {
        await prisma.notification.create({
          data: {
            userId: post.userId,
            fromUserId: userId,
            type: 'like',
            refPostId: postId,
          },
        });
      }

      res.json({ liked: true });
    }
  } catch (err: any) {
    console.error('点赞操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取评论列表
router.get('/posts/:id/comments', optionalAuth, async (req: Request, res: Response) => {
  try {
    const comments = await prisma.postComment.findMany({
      where: { postId: req.params.id },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let likedCommentIds: Set<string> = new Set();
    if (req.user && comments.length > 0) {
      const commentLikes = await prisma.postCommentLike.findMany({
        where: {
          userId: req.user.userId,
          commentId: { in: comments.map(c => c.id) },
        },
        select: { commentId: true },
      });
      likedCommentIds = new Set(commentLikes.map(like => like.commentId));
    }

    res.json(comments.map(c => ({
      id: c.id,
      user: { id: c.user.id, name: c.user.nickname, avatar: c.user.avatarUrl },
      content: c.content,
      parentId: c.parentId,
      likes: c.likes,
      likedByMe: likedCommentIds.has(c.id),
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err: any) {
    res.status(500).json({ error: '获取评论失败' });
  }
});

// 发表评论
router.post('/posts/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { content, parentId } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: '评论内容不能为空' });
      return;
    }

    const postId = req.params.id;
    const userId = req.user!.userId;

    const comment = await prisma.postComment.create({
      data: { postId, userId, content, parentId },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
    });

    // 发送通知给帖子作者
    const post = await prisma.communityPost.findUnique({ where: { id: postId } });
    if (post && post.userId !== userId) {
      await prisma.notification.create({
        data: {
          userId: post.userId,
          fromUserId: userId,
          type: 'comment',
          content: content.substring(0, 100),
          refPostId: postId,
        },
      });
    }

    res.status(201).json({
      id: comment.id,
      user: { id: comment.user.id, name: comment.user.nickname, avatar: comment.user.avatarUrl },
      content: comment.content,
      parentId: comment.parentId,
      likes: comment.likes,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: '评论失败' });
  }
});

// 评论点赞/取消点赞
router.post('/comments/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const commentId = req.params.id as string;
    const userId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.findUnique({
        where: { id: commentId },
        select: { id: true, likes: true },
      });

      if (!comment) return null;

      const existing = await tx.postCommentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
      });

      if (existing) {
        await tx.postCommentLike.delete({ where: { id: existing.id } });
        const updated = await tx.postComment.update({
          where: { id: commentId },
          data: { likes: Math.max(0, comment.likes - 1) },
          select: { likes: true },
        });
        return { liked: false, likedByMe: false, likes: updated.likes };
      }

      await tx.postCommentLike.create({ data: { commentId, userId } });
      const updated = await tx.postComment.update({
        where: { id: commentId },
        data: { likes: { increment: 1 } },
        select: { likes: true },
      });
      return { liked: true, likedByMe: true, likes: updated.likes };
    });

    if (!result) {
      res.status(404).json({ error: '评论不存在' });
      return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 辅助函数：时间格式化
function formatTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default router;
