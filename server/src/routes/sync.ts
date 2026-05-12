import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { stringArray } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

router.get('/pull', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const since = typeof req.query.since === 'string' ? req.query.since : '';
    const where: any = { userId };
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        where.updatedAt = { gt: sinceDate };
      }
    }

    const entries = await prisma.diaryEntry.findMany({ where, take: 1000 });

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

router.post('/push', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length > 100) {
      res.status(400).json({ error: '无效的数据格式' });
      return;
    }

    const results: { id: string; status: 'created' | 'updated' | 'conflict' }[] = [];

    for (const entry of entries) {
      const id = String(entry.id || '');
      if (!id) continue;

      try {
        const existing = await prisma.diaryEntry.findUnique({
          where: { id },
        });

        if (existing) {
          if (existing.userId !== userId) {
            results.push({ id, status: 'conflict' });
            continue;
          }

          if (entry.syncVersion !== undefined && existing.syncVersion > Number(entry.syncVersion)) {
            results.push({ id, status: 'conflict' });
            continue;
          }

          await prisma.diaryEntry.update({
            where: { id: existing.id },
            data: {
              title: entry.title,
              content: String(entry.content || '').slice(0, 200000),
              diaryDate: entry.diaryDate,
              status: entry.status,
              mood: entry.mood,
              weather: entry.weather,
              tags: entry.tags ? JSON.stringify(stringArray(entry.tags)) : null,
              themeId: entry.themeId,
              images: entry.images ? JSON.stringify(stringArray(entry.images, 20, 2000)) : null,
              isPinned: Boolean(entry.isPinned),
              isHidden: Boolean(entry.isHidden),
              trashReason: entry.trashReason,
              trashedAt: entry.trashedAt ? new Date(entry.trashedAt) : null,
              syncVersion: { increment: 1 },
            },
          });
          results.push({ id, status: 'updated' });
        } else {
          await prisma.diaryEntry.create({
            data: {
              id,
              userId,
              title: entry.title,
              content: String(entry.content || '').slice(0, 200000),
              diaryDate: entry.diaryDate || new Date().toISOString().split('T')[0],
              status: entry.status || 'active',
              mood: entry.mood,
              weather: entry.weather,
              tags: entry.tags ? JSON.stringify(stringArray(entry.tags)) : null,
              themeId: entry.themeId,
              images: entry.images ? JSON.stringify(stringArray(entry.images, 20, 2000)) : null,
              isPinned: Boolean(entry.isPinned),
              isHidden: Boolean(entry.isHidden),
              trashReason: entry.trashReason,
              trashedAt: entry.trashedAt ? new Date(entry.trashedAt) : null,
            },
          });
          results.push({ id, status: 'created' });
        }
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          results.push({ id, status: 'conflict' });
          continue;
        }

        throw err;
      }
    }

    res.json({ results, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('推送同步数据失败:', err);
    res.status(500).json({ error: '同步失败' });
  }
});

export default router;
