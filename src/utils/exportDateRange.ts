import type { DiaryEntry } from '../features/diary/model';
import { getDiaryDateKey, parseDiaryDateKey, toDiaryDateKey } from './diaryDate';

export type ExportRangeType = 'all' | 'custom';

export interface DiaryExportDateRange {
  type: ExportRangeType;
  startDate?: string;
  endDate?: string;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && getDiaryDateKey(value) === value);
}

export function validateExportDateRange(
  range: DiaryExportDateRange,
  today = new Date(),
): string | null {
  if (range.type === 'all') return null;

  if (!range.startDate || !range.endDate) {
    return '请选择开始日期和结束日期';
  }

  if (!isDateKey(range.startDate) || !isDateKey(range.endDate)) {
    return '请选择有效的日期';
  }

  if (range.startDate > range.endDate) {
    return '开始日期不能晚于结束日期';
  }

  if (range.endDate > toDiaryDateKey(today)) {
    return '结束日期不能晚于当前日期';
  }

  return null;
}

export function filterDiariesByDateRange<T extends Pick<DiaryEntry, 'diaryDate'>>(
  entries: T[],
  range: DiaryExportDateRange,
  today = new Date(),
): T[] {
  const validationError = validateExportDateRange(range, today);
  if (validationError) {
    throw new Error(validationError);
  }

  if (range.type === 'all') return entries;

  const start = parseDiaryDateKey(range.startDate);
  start.setHours(0, 0, 0, 0);

  const end = parseDiaryDateKey(range.endDate);
  end.setHours(23, 59, 59, 999);

  const startTime = start.getTime();
  const endTime = end.getTime();

  return entries.filter((entry) => {
    const diaryDateKey = getDiaryDateKey(entry.diaryDate);
    if (!diaryDateKey) return false;

    const diaryTime = parseDiaryDateKey(diaryDateKey).getTime();
    return diaryTime >= startTime && diaryTime <= endTime;
  });
}
