import type { DailyEcho, DiaryEntry, EntryStatus } from './model';
import { getDiaryDateKey } from '../../utils/diaryDate';

/** 云同步明确支持的日记字段；本地兼容字段不会被意外带入 API。 */
export interface DiarySyncEntryDto {
  id: string;
  title?: string;
  content: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
  diaryDate: string;
  status: EntryStatus;
  trashReason?: 'deleted' | 'abandoned';
  trashedAt?: string;
  isPinned?: boolean;
  isHidden?: boolean;
  mood?: string;
  weather?: string;
  tags?: string[];
  themeId?: string | null;
  dailyEcho?: DailyEcho;
  activeWritingSeconds?: number;
}

export const DIARY_SYNCED_FIELDS = [
  'id',
  'title',
  'content',
  'images',
  'createdAt',
  'updatedAt',
  'diaryDate',
  'status',
  'trashReason',
  'trashedAt',
  'isPinned',
  'isHidden',
  'mood',
  'weather',
  'tags',
  'themeId',
  'dailyEcho',
  'activeWritingSeconds',
] as const;

function validImages(images: unknown): string[] {
  return Array.isArray(images)
    ? images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function copyDailyEchoForSync(echo?: DailyEcho): DailyEcho | undefined {
  if (!echo) return undefined;
  if (!echo.card) return echo;
  return {
    ...echo,
    card: {
      ...echo.card,
      localDataUrl: undefined,
    },
  };
}

/** 将领域模型映射到稳定的云端 DTO。 */
export function toDiarySyncEntryDto(entry: DiaryEntry): DiarySyncEntryDto {
  const payload: DiarySyncEntryDto = {
    id: entry.id,
    title: entry.title,
    content: entry.content || '',
    images: validImages(entry.images),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    diaryDate: getDiaryDateKey(entry.diaryDate, new Date()),
    status: entry.status,
  };

  if (entry.trashReason !== undefined) payload.trashReason = entry.trashReason;
  if (entry.trashedAt !== undefined) payload.trashedAt = entry.trashedAt;
  if (entry.isPinned !== undefined) payload.isPinned = entry.isPinned;
  if (entry.isHidden !== undefined) payload.isHidden = entry.isHidden;
  if (entry.mood !== undefined) payload.mood = entry.mood;
  if (entry.weather !== undefined) payload.weather = entry.weather;
  if (entry.tags !== undefined) payload.tags = [...entry.tags];
  if (entry.themeId !== undefined) payload.themeId = entry.themeId;
  if (entry.activeWritingSeconds !== undefined) payload.activeWritingSeconds = entry.activeWritingSeconds;
  if (entry.dailyEcho !== undefined) payload.dailyEcho = copyDailyEchoForSync(entry.dailyEcho);

  return payload;
}

/**
 * 用于契约测试和边界校验的归一化函数。生产拉取仍保留现有合并策略，
 * 避免本轮重构改变冲突语义。
 */
export function normalizeDiarySyncEntryDto(value: DiarySyncEntryDto): DiarySyncEntryDto {
  return toDiarySyncEntryDto({
    ...value,
    images: validImages(value.images),
  });
}
