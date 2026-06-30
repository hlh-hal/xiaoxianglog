import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { stringArray } from '../utils/request.js';
import { areStringArraysEqual, parseStoredStringArray, saveEditHistorySnapshot } from '../lib/editHistory.js';
import {
  dateOrNull,
  formatDiaryEntry,
  normalizeActiveWritingSeconds,
  normalizeDailyEcho,
  normalizeDiaryDate,
  normalizeStatus,
  normalizeTrashReason,
  nullableString,
  syncImageArray,
} from '../modules/diary/diaryEntryCodec.js';
import { projectDiaryChange } from '../modules/diary/diaryChangeProjector.js';

const router = Router();
router.use(requireAuth);

type SyncResultStatus = 'created' | 'updated' | 'conflict' | 'skipped';
type SyncResult = { id: string; status: SyncResultStatus; reason?: string };

function isDuplicateIdError(error: any): boolean {
  return error?.code === 'P2002'
    && (
      !error?.meta?.target
      || (Array.isArray(error.meta.target) && error.meta.target.includes('id'))
    );
}

function isUnknownPrismaArgument(error: any, field: string): boolean {
  const message = String(error?.message || error || '');
  return message.includes(`Unknown argument \`${field}\``);
}

function omitWriteField<T extends Record<string, unknown>>(data: T, field: string): T {
  const next = { ...data };
  delete next[field];
  return next;
}

function omitUnknownWriteFields<T extends Record<string, unknown>>(data: T, error: any): T | null {
  const compatFields = ['dailyEcho', 'activeWritingSeconds'];
  const hasCompatUnknown = compatFields.some(field => isUnknownPrismaArgument(error, field));
  if (!hasCompatUnknown) return null;

  let next = { ...data };
  let changed = false;
  for (const field of compatFields) {
    if (Object.prototype.hasOwnProperty.call(next, field)) {
      delete next[field];
      changed = true;
    }
  }
  return changed ? next as T : null;
}

async function createDiaryEntryCompat(data: Record<string, unknown>) {
  try {
    return await prisma.diaryEntry.create({ data: data as any });
  } catch (err: any) {
    const retryData = omitUnknownWriteFields(data, err);
    if (!retryData) {
      throw err;
    }

    return prisma.diaryEntry.create({ data: retryData as any });
  }
}

async function updateDiaryEntryCompat(where: { id: string }, data: Record<string, unknown>) {
  try {
    return await prisma.diaryEntry.update({ where, data: data as any });
  } catch (err: any) {
    const retryData = omitUnknownWriteFields(data, err);
    if (!retryData) {
      throw err;
    }

    return prisma.diaryEntry.update({ where, data: retryData as any });
  }
}

async function saveSyncHistorySnapshot(params: {
  entryId: string;
  userId: string;
  content?: string | null;
  images?: string[] | null;
}) {
  try {
    await saveEditHistorySnapshot(params);
  } catch (err) {
    console.warn('保存同步历史快照失败，已跳过:', err);
  }
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
      entries: await Promise.all(entries.map(formatDiaryEntry)),
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

    const results: SyncResult[] = [];
    const projectionTasks: Promise<unknown>[] = [];

    for (const entry of entries) {
      const id = String(entry.id || '');
      if (!id) {
        results.push({ id: '', status: 'skipped', reason: 'missing_id' });
        continue;
      }

      try {
        const nextImages = syncImageArray(entry.images);
        const nextContent = String(entry.content || '').slice(0, 200000);
        const nextDiaryDate = normalizeDiaryDate(entry.diaryDate);
        const nextStatus = normalizeStatus(entry.status);
        const nextTags = Array.isArray(entry.tags) ? JSON.stringify(stringArray(entry.tags)) : null;
        const nextImagesValue = nextImages.length > 0 ? JSON.stringify(nextImages) : null;
        const nextCreatedAt = dateOrNull(entry.createdAt);
        const nextTrashedAt = dateOrNull(entry.trashedAt);
        const nextActiveWritingSeconds = normalizeActiveWritingSeconds(entry.activeWritingSeconds);

        const updateExisting = async (existing: any): Promise<SyncResult> => {
          if (existing.userId !== userId) {
            return { id, status: 'conflict', reason: 'owner_mismatch' };
          }

          if (entry.syncVersion !== undefined && existing.syncVersion > Number(entry.syncVersion)) {
            return { id, status: 'conflict', reason: 'stale_version' };
          }

          const contentChanged = nextContent !== existing.content;
          const imagesChanged = !areStringArraysEqual(nextImages, parseStoredStringArray(existing.images));
          if (contentChanged || imagesChanged) {
            await saveSyncHistorySnapshot({
              entryId: existing.id,
              userId,
              content: existing.content,
              images: parseStoredStringArray(existing.images),
            });
          }

          const updateData = {
            ...(entry.title !== undefined && { title: nullableString(entry.title) }),
            content: nextContent,
            diaryDate: nextDiaryDate,
            status: nextStatus,
            ...(entry.mood !== undefined && { mood: nullableString(entry.mood) }),
            ...(entry.weather !== undefined && { weather: nullableString(entry.weather) }),
            ...(entry.tags !== undefined && { tags: nextTags }),
            ...(entry.themeId !== undefined && { themeId: nullableString(entry.themeId) }),
            images: nextImagesValue,
            ...(entry.dailyEcho !== undefined && { dailyEcho: normalizeDailyEcho(entry.dailyEcho) }),
            activeWritingSeconds: Math.max(
              nextActiveWritingSeconds,
              normalizeActiveWritingSeconds(existing.activeWritingSeconds),
            ),
            isPinned: Boolean(entry.isPinned),
            isHidden: Boolean(entry.isHidden),
            trashReason: normalizeTrashReason(entry.trashReason),
            trashedAt: nextTrashedAt,
            syncVersion: { increment: 1 },
          };

          await updateDiaryEntryCompat({ id: existing.id }, updateData);
          projectionTasks.push(projectDiaryChange({
            type: 'changed',
            userId,
            entryId: existing.id,
            previousDiaryDate: existing.diaryDate,
          }));

          return { id, status: 'updated' };
        };

        const existing = await prisma.diaryEntry.findUnique({
          where: { id },
        });

        if (existing) {
          results.push(await updateExisting(existing));
        } else {
          let created: any;
          try {
            const createData = {
              id,
              userId,
              title: nullableString(entry.title),
              content: nextContent,
              ...(nextCreatedAt && { createdAt: nextCreatedAt }),
              diaryDate: nextDiaryDate,
              status: nextStatus,
              mood: nullableString(entry.mood),
              weather: nullableString(entry.weather),
              tags: nextTags,
              themeId: nullableString(entry.themeId),
              images: nextImagesValue,
              dailyEcho: normalizeDailyEcho(entry.dailyEcho),
              activeWritingSeconds: nextActiveWritingSeconds,
              isPinned: Boolean(entry.isPinned),
              isHidden: Boolean(entry.isHidden),
              trashReason: normalizeTrashReason(entry.trashReason),
              trashedAt: nextTrashedAt,
            };

            created = await createDiaryEntryCompat(createData);
          } catch (err: any) {
            if (!isDuplicateIdError(err)) throw err;

            const racedEntry = await prisma.diaryEntry.findUnique({ where: { id } });
            if (!racedEntry) {
              results.push({ id, status: 'skipped', reason: 'duplicate_unresolved' });
              continue;
            }

            results.push(await updateExisting(racedEntry));
            continue;
          }

          await saveSyncHistorySnapshot({
            entryId: created.id,
            userId,
            content: created.content,
            images: parseStoredStringArray(created.images),
          });
          projectionTasks.push(projectDiaryChange({ type: 'changed', userId, entryId: created.id }));
          results.push({ id, status: 'created' });
        }
      } catch (err: any) {
        if (err?.status === 400) {
          results.push({ id, status: 'skipped', reason: 'invalid_entry' });
          continue;
        }

        if (isDuplicateIdError(err)) {
          const existing = await prisma.diaryEntry.findUnique({ where: { id } });
          results.push({
            id,
            status: existing?.userId === userId ? 'conflict' : 'skipped',
            reason: 'duplicate_retry_failed',
          });
          continue;
        }

        throw err;
      }
    }

    await Promise.all(projectionTasks);
    res.json({ results, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('推送同步数据失败:', err);
    const status = err?.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 400 ? err.message : '同步失败' });
  }
});

export default router;
