const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function isValidLocalDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
}

export function toDiaryDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function getDiaryDateKey(value: unknown, fallbackDate?: Date): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDiaryDateKey(value);
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return toDiaryDateKey(date);
    }
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    const match = DATE_KEY_RE.exec(raw);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (isValidLocalDate(year, month, day)) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
    }

    const parsed = raw ? new Date(raw) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return toDiaryDateKey(parsed);
    }
  }

  return fallbackDate ? toDiaryDateKey(fallbackDate) : '';
}

export function parseDiaryDateKey(value: unknown, fallbackDate = new Date()): Date {
  const key = getDiaryDateKey(value);
  if (key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(
    fallbackDate.getFullYear(),
    fallbackDate.getMonth(),
    fallbackDate.getDate(),
  );
}

export function compareDiaryDateDesc(a: unknown, b: unknown): number {
  return parseDiaryDateKey(b).getTime() - parseDiaryDateKey(a).getTime();
}

export function createAdjustedDiaryDateKey(now = new Date(), autoAdjustTime = false): string {
  const diaryDate = new Date(now);
  if (autoAdjustTime && diaryDate.getHours() < 12) {
    diaryDate.setDate(diaryDate.getDate() - 1);
  }
  return toDiaryDateKey(diaryDate);
}
