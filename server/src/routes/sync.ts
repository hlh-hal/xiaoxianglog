/**
 * 数据同步路由
 * 用于客户端离线后恢复在线时的数据同步
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// 拉取服务端更新（增量同步）
router.get('/pull', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const since = req.query.since as string; // ISO 时间戳

    const where: any = { userId };
    if (since) {
      where.updatedAt = { gt: new Date(since) };
    }

    const entries = await prisma.diaryEntry.findMany({ where });

    res.json({
      entries: entries.map(e => ({
        ...e,
        tags: e.tags ? JSON.parse(e.tags) : [],
        images: e.images ? JSON.parse(e.images) : [],
      })),
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('拉取同步数据失败:', err);
    res.status(500).json({ error: '同步失败' });
  }
});

// 推送本地修改到服务端（批量）
router.post('/push', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      res.status(400).json({ error: '无效的数据格式' });
      return;
    }

    const results: { id: string; status: 'created' | 'updated' | 'conflict' }[] = [];

    for (const entry of entries) {
      const existing = await prisma.diaryEntry.findFirst({
        where: { id: entry.id, userId },
      });

      if (existing) {
        // 乐观锁冲突检测
        if (entry.syncVersion !== undefined && existing.syncVersion > entry.syncVersion) {
          results.push({ id: entry.id, status: 'conflict' });
          continue;
        }

        // 更新
        await prisma.diaryEntry.update({
          where: { id: existing.id },
          data: {
            title: entry.title,
            content: entry.content,
            diaryDate: entry.diaryDate,
            status: entry.status,
            mood: entry.mood,
            weather: entry.weather,
            tags: entry.tags ? JSON.stringify(entry.tags) : null,
            themeId: entry.themeId,
            images: entry.images ? JSON.stringify(entry.images) : null,
            isPinned: entry.isPinned,
            isHidden: entry.isHidden,
            trashReason: entry.trashReason,
            trashedAt: entry.trashedAt ? new Date(entry.trashedAt) : null,
            syncVersion: { increment: 1 },
          },
        });
        results.push({ id: entry.id, status: 'updated' });
      } else {
        // 创建
        await prisma.diaryEntry.create({
          data: {
            id: entry.id,
            userId,
            title: entry.title,
            content: entry.content || '',
            diaryDate: entry.diaryDate || new Date().toISOString().split('T')[0],
            status: entry.status || 'active',
            mood: entry.mood,
            weather: entry.weather,
            tags: entry.tags ? JSON.stringify(entry.tags) : null,
            themeId: entry.themeId,
            images: entry.images ? JSON.stringify(entry.images) : null,
            isPinned: entry.isPinned || false,
            isHidden: entry.isHidden || false,
          },
        });
        results.push({ id: entry.id, status: 'created' });
      }
    }

    res.json({ results, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('推送同步数据失败:', err);
    res.status(500).json({ error: '同步失败' });
  }
});

export default router;
