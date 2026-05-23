import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { stringArray } from '../utils/request.js';
import { repairLegacyImageUrls } from '../lib/imageRepair.js';
import { areStringArraysEqual, parseStoredStringArray, saveEditHistorySnapshot } from '../lib/editHistory.js';

const router = Router();
router.use(requireAuth);

function parseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  } catch {
    return [];
  }
}

function syncImageArray(value: unknown): string[] {
  if (Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim().startsWith('data:image/'))) {
    const error = new Error('Images must be uploaded before sync');
    (error as any).status = 400;
    throw error;
  }
  return stringArray(value, 20, 4096);
}

async function formatSyncEntry(entry: any) {
  return {
    ...entry,
    tags: entry.tags ? JSON.parse(entry.tags) : [],
    images: await repairLegacyImageUrls(parseJsonArray(entry.images)),
  };
}

router.get('/pull', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const since = typeof req.query.since === 'string' ? req.query.since : '';
    const where: any = { userId };
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        where.OR = [
          { updatedAt: { gt: sinceDate } },
          { images: { contains: 'data:image/' } },
        ];
      }
    }

    const entries = await prisma.diaryEntry.findMany({
      where,
      take: 1000,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });

    res.json({
      entries: await Promise.all(entries.map(formatSyncEntry)),
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('拉取同步数据失败:', err);
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 400 ? err.message : '同步失败' });
  }
});

router.post('/push', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Invalid sync payload: entries must be an array' });
      return;
    }

    if (entries.length > 500) {
      res.status(400).json({ error: 'Invalid sync payload: at most 500 entries per request' });
      return;
    }

    if (!Array.isArray(entries) || entries.length > 500) {
      res.status(400).json({ error: '无效的数据格式' });
      return;
    }

    const results: { id: string; status: 'created' | 'updated' | 'conflict' }[] = [];

    for (const entry of entries) {
      const id = String(entry.id || '');
      if (!id) continue;
      const nextImages = syncImageArray(entry.images);

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

          const nextContent = String(entry.content || '').slice(0, 200000);
          const contentChanged = nextContent !== existing.content;
          const imagesChanged = !areStringArraysEqual(nextImages, parseStoredStringArray(existing.images));
          if (contentChanged || imagesChanged) {
            await saveEditHistorySnapshot({
              entryId: existing.id,
              userId,
              content: existing.content,
              images: parseStoredStringArray(existing.images),
            });
          }

          await prisma.diaryEntry.update({
            where: { id: existing.id },
            data: {
              title: entry.title,
              content: nextContent,
              diaryDate: entry.diaryDate,
              status: entry.status,
              mood: entry.mood,
              weather: entry.weather,
              tags: entry.tags ? JSON.stringify(stringArray(entry.tags)) : null,
              themeId: entry.themeId,
              images: nextImages.length > 0 ? JSON.stringify(nextImages) : null,
              isPinned: Boolean(entry.isPinned),
              isHidden: Boolean(entry.isHidden),
              trashReason: entry.trashReason,
              trashedAt: entry.trashedAt ? new Date(entry.trashedAt) : null,
              syncVersion: { increment: 1 },
            },
          });
          results.push({ id, status: 'updated' });
        } else {
          const created = await prisma.diaryEntry.create({
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
              images: nextImages.length > 0 ? JSON.stringify(nextImages) : null,
              isPinned: Boolean(entry.isPinned),
              isHidden: Boolean(entry.isHidden),
              trashReason: entry.trashReason,
              trashedAt: entry.trashedAt ? new Date(entry.trashedAt) : null,
            },
          });
          await saveEditHistorySnapshot({
            entryId: created.id,
            userId,
            content: created.content,
            images: parseStoredStringArray(created.images),
          });
          results.push({ id, status: 'created' });
        }
      } catch (err: any) {
        if (err?.code === 'P2002') {
          results.push({ id, status: 'conflict' });
          continue;
        }

        throw err;
      }
    }

    res.json({ results, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('推送同步数据失败:', err);
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 400 ? err.message : '同步失败' });
  }
});

export default router;
