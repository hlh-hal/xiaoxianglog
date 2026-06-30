import { repairLegacyImageUrls } from '../../lib/imageRepair.js';
import { stringArray } from '../../utils/request.js';

export function parseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(value?: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeDailyEcho(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = JSON.stringify(value);
  return raw.length <= 200000 ? raw : null;
}

export function normalizeActiveWritingSeconds(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function toLocalDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function normalizeDiaryDate(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);

  const parsed = raw ? new Date(raw) : new Date();
  if (!Number.isNaN(parsed.getTime())) return toLocalDateKey(parsed);
  return toLocalDateKey();
}

export function normalizeStatus(value: unknown): 'active' | 'draft' | 'trashed' {
  return value === 'draft' || value === 'trashed' ? value : 'active';
}

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeTrashReason(value: unknown): 'deleted' | 'abandoned' | null {
  return value === 'deleted' || value === 'abandoned' ? value : null;
}

export function syncImageArray(value: unknown): string[] {
  return stringArray(value, 20, 4096)
    .filter(item => !item.trim().startsWith('data:image/'));
}

export function dailyEchoImageUrls(value?: string | null): string[] {
  const parsed = parseJsonObject(value);
  const imageUrl = (parsed?.card as { imageUrl?: unknown } | undefined)?.imageUrl;
  return typeof imageUrl === 'string' && imageUrl.trim() ? [imageUrl] : [];
}

/** Prisma 日记记录到公开 API DTO 的唯一转换入口。 */
export async function formatDiaryEntry<T extends Record<string, any>>(entry: T): Promise<T & {
  tags: string[];
  images: string[];
  dailyEcho: Record<string, unknown> | null;
}> {
  return {
    ...entry,
    tags: parseJsonArray(entry.tags),
    images: await repairLegacyImageUrls(parseJsonArray(entry.images)),
    dailyEcho: parseJsonObject(entry.dailyEcho),
  };
}
