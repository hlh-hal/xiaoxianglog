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
import { paramString, positiveInt, queryString, stringArray } from '../utils/request.js';
import { deleteStoredUrls } from '../lib/objectStorage.js';
import { areStringArraysEqual, parseStoredStringArray, saveEditHistorySnapshot } from '../lib/editHistory.js';
import {
  dailyEchoImageUrls,
  formatDiaryEntry,
  normalizeActiveWritingSeconds,
  normalizeDailyEcho,
  normalizeDiaryDate,
  parseJsonArray,
} from '../modules/diary/diaryEntryCodec.js';
import { projectDiaryChange } from '../modules/diary/diaryChangeProjector.js';

const router = Router();

// 所有日记接口都需要认证
router.use(requireAuth);

// 获取日记列表
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = queryString(req, 'status') || 'active';
    const page = positiveInt(req.query.page, 1, 1000);
    const limit = positiveInt(req.query.limit, 50, 50);
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
    const result = await Promise.all(entries.map(formatDiaryEntry));

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
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
    });
    if (!entry) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    res.json(await formatDiaryEntry(entry));
  } catch (err: any) {
    console.error('获取日记失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建日记
router.post('/entries', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id, title, content, diaryDate, status, mood, weather, tags, themeId, images, dailyEcho, activeWritingSeconds, isPinned, isHidden } = req.body;

    const entry = await prisma.diaryEntry.create({
      data: {
        ...(id && { id }),
        userId,
        title,
        content: content || '',
        diaryDate: normalizeDiaryDate(diaryDate),
        status: status || 'active',
        mood,
        weather,
        tags: tags ? JSON.stringify(stringArray(tags)) : null,
        themeId,
        images: images ? JSON.stringify(stringArray(images, 20, 2000)) : null,
        dailyEcho: normalizeDailyEcho(dailyEcho),
        activeWritingSeconds: normalizeActiveWritingSeconds(activeWritingSeconds),
        isPinned: isPinned || false,
        isHidden: isHidden || false,
      },
    });

    await saveEditHistorySnapshot({
      entryId: entry.id,
      userId,
      content: entry.content,
      images: parseJsonArray(entry.images),
    });

    await projectDiaryChange({ type: 'changed', userId, entryId: entry.id });

    res.status(201).json(await formatDiaryEntry(entry));
  } catch (err: any) {
    console.error('创建日记失败:', err);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新日记
router.put('/entries/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const entryId = paramString(req, 'id');
    const { title, content, diaryDate, status, mood, weather, tags, themeId, images, dailyEcho, activeWritingSeconds, isPinned, isHidden, syncVersion } = req.body;
    const existingForHistory = await prisma.diaryEntry.findFirst({
      where: { id: entryId, userId },
    });

    if (!existingForHistory) {
      res.status(404).json({ error: 'Diary entry not found' });
      return;
    }

    // Optimistic lock check
    if (syncVersion !== undefined && existingForHistory.syncVersion > Number(syncVersion)) {
      res.status(409).json({ error: 'Data conflict, please refresh and retry', serverVersion: existingForHistory.syncVersion });
      return;
    }

    const nextImages = images !== undefined ? stringArray(images, 20, 2000) : undefined;
    const contentChanged = content !== undefined && String(content) !== existingForHistory.content;
    const imagesChanged = nextImages !== undefined && !areStringArraysEqual(nextImages, parseStoredStringArray(existingForHistory.images));
    if (contentChanged || imagesChanged) {
      await saveEditHistorySnapshot({
        entryId: existingForHistory.id,
        userId,
        content: existingForHistory.content,
        images: parseStoredStringArray(existingForHistory.images),
      });
    }

    const entry = await prisma.diaryEntry.updateMany({
      where: { id: entryId, userId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(diaryDate !== undefined && { diaryDate: normalizeDiaryDate(diaryDate) }),
        ...(status !== undefined && { status }),
        ...(mood !== undefined && { mood }),
        ...(weather !== undefined && { weather }),
        ...(tags !== undefined && { tags: JSON.stringify(stringArray(tags)) }),
        ...(themeId !== undefined && { themeId }),
        ...(images !== undefined && { images: JSON.stringify(stringArray(images, 20, 2000)) }),
        ...(dailyEcho !== undefined && { dailyEcho: normalizeDailyEcho(dailyEcho) }),
        ...(activeWritingSeconds !== undefined && {
          activeWritingSeconds: Math.max(
            normalizeActiveWritingSeconds(activeWritingSeconds),
            normalizeActiveWritingSeconds(existingForHistory.activeWritingSeconds),
          ),
        }),
        ...(isPinned !== undefined && { isPinned }),
        ...(isHidden !== undefined && { isHidden }),
        syncVersion: { increment: 1 },
      },
    });

    if (entry.count === 0) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }

    const updated = await prisma.diaryEntry.findFirst({ where: { id: entryId, userId } });
    if (!updated) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    await projectDiaryChange({
      type: 'changed',
      userId,
      entryId,
      previousDiaryDate: existingForHistory.diaryDate,
    });
    res.json(await formatDiaryEntry(updated));
  } catch (err: any) {
    console.error('更新日记失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 移入回收站
router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.diaryEntry.findFirst({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
      select: { id: true, images: true, dailyEcho: true, diaryDate: true },
    });
    const reason = queryString(req, 'reason') || 'deleted';
    const result = await prisma.diaryEntry.updateMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
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
    if (entry?.id) {
      await projectDiaryChange({
        type: 'deleted',
        userId: req.user!.userId,
        entryId: entry.id,
        diaryDate: entry.diaryDate,
      });
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
      where: { id: paramString(req, 'id'), userId: req.user!.userId, status: 'trashed' },
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
    await projectDiaryChange({
      type: 'changed',
      userId: req.user!.userId,
      entryId: paramString(req, 'id'),
    });
    res.json({ message: '已恢复' });
  } catch (err: any) {
    console.error('恢复日记失败:', err);
    res.status(500).json({ error: '恢复失败' });
  }
});

// 永久删除
router.delete('/entries/:id/permanent', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.diaryEntry.findFirst({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
      select: { id: true, images: true, dailyEcho: true, diaryDate: true },
    });
    const result = await prisma.diaryEntry.deleteMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '日记不存在' });
      return;
    }
    await deleteStoredUrls([
      ...(entry?.images ? JSON.parse(entry.images) : []),
      ...dailyEchoImageUrls(entry?.dailyEcho),
    ]);
    if (entry?.id) {
      await projectDiaryChange({
        type: 'deleted',
        userId: req.user!.userId,
        entryId: entry.id,
        diaryDate: entry.diaryDate,
      });
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
    const trashedEntries = await prisma.diaryEntry.findMany({
      where: { userId: req.user!.userId, status: 'trashed' },
      select: { id: true, images: true, dailyEcho: true, diaryDate: true },
    });
    const result = await prisma.diaryEntry.deleteMany({
      where: { userId: req.user!.userId, status: 'trashed' },
    });
    await deleteStoredUrls(trashedEntries.flatMap(entry => [
      ...(entry.images ? JSON.parse(entry.images) : []),
      ...dailyEchoImageUrls(entry.dailyEcho),
    ]));
    await Promise.all(trashedEntries.map(entry => projectDiaryChange({
      type: 'deleted',
      userId: req.user!.userId,
      entryId: entry.id,
      diaryDate: entry.diaryDate,
    })));
    res.json({ message: `已清空 ${result.count} 条` });
  } catch (err: any) {
    console.error('清空回收站失败:', err);
    res.status(500).json({ error: '清空失败' });
  }
});

// 搜索日记
router.get('/search', async (req: Request, res: Response) => {
  try {
    const keyword = queryString(req, 'q');
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
      entries: await Promise.all(entries.map(formatDiaryEntry)),
    });
  } catch (err: any) {
    console.error('搜索日记失败:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

export default router;
