import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { cleanText, paramString, positiveInt, queryString, stringArray } from '../utils/request.js';

const router = Router();

function parseJsonArray(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizePublicHtml(value: unknown) {
  const allowedTags = new Set([
    'p', 'br', 'strong', 'em', 's', 'u', 'blockquote', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'code', 'pre', 'span', 'mark',
  ]);

  return String(value || '')
    .slice(0, 20000)
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:.*?\2/gi, '')
    .replace(/<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>/gi, (tag, tagName: string) => {
      const normalized = tagName.toLowerCase();
      if (!allowedTags.has(normalized)) return '';
      return tag.startsWith('</') ? `</${normalized}>` : `<${normalized}>`;
    })
    .trim();
}

function formatPost(post: any, likedByMe = false) {
  return {
    id: post.id,
    user: {
      id: post.user.id,
      name: post.user.nickname,
      avatar: post.user.avatarUrl,
      bio: post.user.bio,
      time: post.createdAt ? formatTime(post.createdAt) : undefined,
    },
    content: post.content,
    images: parseJsonArray(post.images),
    viewCount: post.viewCount,
    readCount: post.readCount,
    likes: post._count?.likes || 0,
    comments: post._count?.comments || 0,
    likedByMe,
    createdAt: post.createdAt.toISOString(),
  };
}

router.get('/posts', optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = positiveInt(req.query.page, 1, 1000);
    const limit = positiveInt(req.query.limit, 20, 50);
    const tab = queryString(req, 'tab') || 'recommend';
    const offset = (page - 1) * limit;
    const where: any = { status: 'published' };

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

    let likedPostIds: Set<string> = new Set();
    if (req.user && posts.length > 0) {
      const likes = await prisma.postLike.findMany({
        where: { userId: req.user.userId, postId: { in: posts.map(p => p.id) } },
        select: { postId: true },
      });
      likedPostIds = new Set(likes.map(l => l.postId));
    }

    res.json({ posts: posts.map(p => formatPost(p, likedPostIds.has(p.id))), total, page, limit });
  } catch (err: any) {
    console.error('获取帖子列表失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

router.get('/posts/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const postId = paramString(req, 'id');
    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: 'published' },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    await prisma.communityPost.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } },
    });

    let likedByMe = false;
    if (req.user) {
      const like = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: post.id, userId: req.user.userId } },
      });
      likedByMe = !!like;
    }

    const likedUsers = await prisma.postLike.findMany({
      where: { postId: post.id },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      ...formatPost({ ...post, viewCount: post.viewCount + 1 }, likedByMe),
      likedUsers: likedUsers.map(l => ({
        id: l.user.id,
        name: l.user.nickname,
        avatar: l.user.avatarUrl,
      })),
    });
  } catch (err: any) {
    console.error('获取帖子详情失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

router.post('/posts', requireAuth, async (req: Request, res: Response) => {
  try {
    const content = sanitizePublicHtml(req.body.content);
    const images = stringArray(req.body.images, 9, 2000);
    const entryId = req.body.entryId ? String(req.body.entryId) : undefined;

    if (!content && images.length === 0) {
      res.status(400).json({ error: '请输入内容或添加图片' });
      return;
    }

    if (entryId) {
      const entry = await prisma.diaryEntry.findFirst({
        where: { id: entryId, userId: req.user!.userId },
        select: { id: true },
      });
      if (!entry) {
        res.status(403).json({ error: '无权分享该日记' });
        return;
      }
    }

    const post = await prisma.communityPost.create({
      data: {
        userId: req.user!.userId,
        content,
        images: images.length > 0 ? JSON.stringify(images) : null,
        entryId,
      },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true, bio: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    res.status(201).json(formatPost(post));
  } catch (err: any) {
    console.error('发表帖子失败:', err);
    res.status(500).json({ error: '发表失败' });
  }
});

router.delete('/posts/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await prisma.communityPost.updateMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
      data: { status: 'deleted' },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }
    res.json({ message: '已删除' });
  } catch {
    res.status(500).json({ error: '删除失败' });
  }
});

router.post('/posts/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = paramString(req, 'id');
    const userId = req.user!.userId;
    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: 'published' },
      select: { id: true, userId: true },
    });
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.postLike.delete({ where: { id: existing.id } });
      res.json({ liked: false });
      return;
    }

    await prisma.postLike.create({ data: { postId, userId } });
    if (post.userId !== userId) {
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
  } catch (err: any) {
    console.error('点赞操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

router.get('/posts/:id/comments', optionalAuth, async (req: Request, res: Response) => {
  try {
    const postId = paramString(req, 'id');
    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: 'published' },
      select: { id: true },
    });
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    const comments = await prisma.postComment.findMany({
      where: { postId },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
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
  } catch {
    res.status(500).json({ error: '获取评论失败' });
  }
});

router.post('/posts/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = paramString(req, 'id');
    const userId = req.user!.userId;
    const content = cleanText(req.body.content, 1000);
    const parentId = req.body.parentId ? String(req.body.parentId) : null;

    if (!content) {
      res.status(400).json({ error: '评论内容不能为空' });
      return;
    }

    const post = await prisma.communityPost.findFirst({
      where: { id: postId, status: 'published' },
      select: { id: true, userId: true },
    });
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    const comment = await prisma.postComment.create({
      data: { postId, userId, content, parentId },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
    });

    if (post.userId !== userId) {
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
  } catch {
    res.status(500).json({ error: '评论失败' });
  }
});

router.post('/comments/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const commentId = paramString(req, 'id');
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
  } catch {
    res.status(500).json({ error: '操作失败' });
  }
});

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
