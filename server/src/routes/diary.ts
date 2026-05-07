/**
 * 日记 CRUD 路由
 * GET    /api/diary/entries       - 获取日记列表
 * GET    /api/diary/entries/:id   - 获取单篇日记
 * POST   /api/diary/entries       - 创建日记
 * PUT    /api/diary/entries/:id   - 更新日记
 * DELETE /api/diary/entries/:id   - 移入回收站
 * POST   /api/diary/entries/:id/restore - 恢复日记
 * DELETE /api/diary/entries/:id/permanent - 永久删除
 * POST   /api/diary/trash/clear   - 清空回收站
 * GET    /api/diary/search        - 搜索日记
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 所有日记接口都需要认证
router.use(requireAuth);

// 获取日记列表
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = (req.query.status as string) || 'active';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const where: any = { userId, status };

    // 活跃日记不显示隐藏的
    if (status === 'active') {
      where.isHidden = false;
    }

    const [entries, total] = await Promise.all([
      prisma.diaryEntry.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { diaryDate: 'desc' },
        ],
        skip: offset,
        take: limit,
      }),
      prisma.diaryEntry.count({ where }),
    ]);

    // 解析 JSON 字段
    const result = entries.map(e => ({
      ...e,
      tags: e.tags ? JSON.parse(e.tags) : [],
      images: e.images ? JSON.parse(e.images) : [],
    }));

    res.json({ entries: result, total, page, limit });
  } catch (err: any) {
    console.error('获取日记列表失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取单篇日记
router.get('/entries/:id', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.diaryEntry.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!entry) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    res.json({
      ...entry,
      tags: entry.tags ? JSON.parse(entry.tags) : [],
      images: entry.images ? JSON.parse(entry.images) : [],
    });
  } catch (err: any) {
    console.error('获取日记失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建日记
router.post('/entries', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id, title, content, diaryDate, status, mood, weather, tags, themeId, images, isPinned, isHidden } = req.body;

    const entry = await prisma.diaryEntry.create({
      data: {
        ...(id && { id }),
        userId,
        title,
        content: content || '',
        diaryDate: diaryDate || new Date().toISOString().split('T')[0],
        status: status || 'active',
        mood,
        weather,
        tags: tags ? JSON.stringify(tags) : null,
        themeId,
        images: images ? JSON.stringify(images) : null,
        isPinned: isPinned || false,
        isHidden: isHidden || false,
      },
    });

    res.status(201).json({
      ...entry,
      tags: entry.tags ? JSON.parse(entry.tags) : [],
      images: entry.images ? JSON.parse(entry.images) : [],
    });
  } catch (err: any) {
    console.error('创建日记失败:', err);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新日记
router.put('/entries/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { title, content, diaryDate, status, mood, weather, tags, themeId, images, isPinned, isHidden, syncVersion } = req.body;

    // 乐观锁检测
    if (syncVersion !== undefined) {
      const existing = await prisma.diaryEntry.findFirst({
        where: { id: req.params.id, userId },
      });
      if (existing && existing.syncVersion > syncVersion) {
        res.status(409).json({ error: '数据冲突，请刷新后重试', serverVersion: existing.syncVersion });
        return;
      }
    }

    const entry = await prisma.diaryEntry.updateMany({
      where: { id: req.params.id, userId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(diaryDate !== undefined && { diaryDate }),
        ...(status !== undefined && { status }),
        ...(mood !== undefined && { mood }),
        ...(weather !== undefined && { weather }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(themeId !== undefined && { themeId }),
        ...(images !== undefined && { images: JSON.stringify(images) }),
        ...(isPinned !== undefined && { isPinned }),
        ...(isHidden !== undefined && { isHidden }),
        syncVersion: { increment: 1 },
      },
    });

    if (entry.count === 0) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }

    const updated = await prisma.diaryEntry.findFirst({ where: { id: req.params.id, userId } });
    res.json({
      ...updated,
      tags: updated?.tags ? JSON.parse(updated.tags) : [],
      images: updated?.images ? JSON.parse(updated.images) : [],
    });
  } catch (err: any) {
    console.error('更新日记失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 移入回收站
router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    const reason = (req.query.reason as string) || 'deleted';
    const result = await prisma.diaryEntry.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: {
        status: 'trashed',
        trashReason: reason,
        trashedAt: new Date(),
      },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    res.json({ message: '已移入回收站' });
  } catch (err: any) {
    console.error('删除日记失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 恢复日记
router.post('/entries/:id/restore', async (req: Request, res: Response) => {
  try {
    const result = await prisma.diaryEntry.updateMany({
      where: { id: req.params.id, userId: req.user!.userId, status: 'trashed' },
      data: {
        status: 'active',
        trashReason: null,
        trashedAt: null,
      },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '日记不存在或不在回收站' });
      return;
    }
    res.json({ message: '已恢复' });
  } catch (err: any) {
    console.error('恢复日记失败:', err);
    res.status(500).json({ error: '恢复失败' });
  }
});

// 永久删除
router.delete('/entries/:id/permanent', async (req: Request, res: Response) => {
  try {
    const result = await prisma.diaryEntry.deleteMany({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    res.json({ message: '已永久删除' });
  } catch (err: any) {
    console.error('永久删除失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 清空回收站
router.post('/trash/clear', async (req: Request, res: Response) => {
  try {
    const result = await prisma.diaryEntry.deleteMany({
      where: { userId: req.user!.userId, status: 'trashed' },
    });
    res.json({ message: `已清空 ${result.count} 条` });
  } catch (err: any) {
    console.error('清空回收站失败:', err);
    res.status(500).json({ error: '清空失败' });
  }
});

// 搜索日记
router.get('/search', async (req: Request, res: Response) => {
  try {
    const keyword = (req.query.q as string) || '';
    if (!keyword.trim()) {
      res.json({ entries: [] });
      return;
    }

    const entries = await prisma.diaryEntry.findMany({
      where: {
        userId: req.user!.userId,
        status: 'active',
        isHidden: false,
        OR: [
          { title: { contains: keyword } },
          { content: { contains: keyword } },
        ],
      },
      orderBy: { diaryDate: 'desc' },
      take: 50,
    });

    res.json({
      entries: entries.map(e => ({
        ...e,
        tags: e.tags ? JSON.parse(e.tags) : [],
        images: e.images ? JSON.parse(e.images) : [],
      })),
    });
  } catch (err: any) {
    console.error('搜索日记失败:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

export default router;
