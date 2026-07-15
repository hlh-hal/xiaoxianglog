import type { DiaryEntry } from '../services/diaryService';
import {
  WRITING_IDLE_TIMEOUT_MS,
  closeSegment,
  createWritingTimeState,
  getWritingMinutesFromSeconds,
  getWritingSeconds,
  recordActivity,
  type WritingTimeState,
} from '../features/editor/writingTimeTracker';

// 保留旧导出名，避免已有内部调用一次性迁移；实际规则集中在 writingTimeTracker。
export const WRITING_ACTIVITY_WINDOW_MS = WRITING_IDLE_TIMEOUT_MS;
export type WritingActivityState = WritingTimeState;

export type DailyEchoCompletionStats = {
  wordCount: number;
  activeWritingMinutes: number;
  streakDays: number;
};

const TEMPLATE_LABELS = [
  '开心的事',
  '充实的事',
  '感谢的人',
  '改进的事',
  '今日思考',
  '今天思考',
  '不好的事',
];

const TEMPLATE_LABEL_PATTERN = TEMPLATE_LABELS.join('|');

export function createWritingActivityState(elapsedMs = 0): WritingActivityState {
  return createWritingTimeState(elapsedMs);
}

export function recordWritingInput(
  state: WritingActivityState,
  timestamp = Date.now(),
  activityWindowMs = WRITING_ACTIVITY_WINDOW_MS,
): WritingActivityState {
  return recordActivity(state, timestamp, activityWindowMs);
}

export function pauseWritingActivity(
  state: WritingActivityState,
  timestamp = Date.now(),
  activityWindowMs = WRITING_ACTIVITY_WINDOW_MS,
): WritingActivityState {
  return closeSegment(state, 'interruption', timestamp, activityWindowMs);
}

export function getActiveWritingMinutes(state: WritingActivityState, timestamp = Date.now()): number {
  return getWritingMinutesFromSeconds(getWritingSeconds(state, timestamp));
}

export function getActiveWritingSeconds(state: WritingActivityState, timestamp = Date.now()): number {
  return getWritingSeconds(state, timestamp);
}

export function stripHtmlToVisibleText(html: string): string {
  return (html || '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/&lt;img\b[\s\S]*?(?:&gt;|$)/gi, '')
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g, '')
    .replace(/diary-image-ref:[A-Za-z0-9_%.-]+/g, '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function removeDiaryTemplateLabels(text: string): string {
  const labelLine = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:${TEMPLATE_LABEL_PATTERN})\\s*[：:]?\\s*$`);
  const labelPrefix = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:${TEMPLATE_LABEL_PATTERN})\\s*[：:]\\s*`);

  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      if (labelLine.test(line)) return '';
      return line.replace(labelPrefix, '').trim();
    })
    .filter(Boolean)
    .join('\n');
}

export function countDiaryTextCharacters(htmlOrText: string): number {
  const text = removeDiaryTemplateLabels(stripHtmlToVisibleText(htmlOrText));
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches?.length || 0;
}

export function toLocalDateKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function calculateDiaryStreak(entries: DiaryEntry[], currentEntry: DiaryEntry): number {
  const currentDateKey = toLocalDateKey(currentEntry.diaryDate);
  if (!currentDateKey) return 1;

  const writtenDateKeys = new Set<string>();
  entries.forEach(entry => {
    if (entry.status !== 'active' || entry.isHidden) return;
    if (countDiaryTextCharacters(entry.content) <= 0) return;
    const key = toLocalDateKey(entry.diaryDate);
    if (key) writtenDateKeys.add(key);
  });

  if (countDiaryTextCharacters(currentEntry.content) > 0) {
    writtenDateKeys.add(currentDateKey);
  }

  let streak = 0;
  let cursor = currentDateKey;
  while (writtenDateKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return Math.max(1, streak);
}

export function buildDailyEchoCompletionStats(
  entry: DiaryEntry,
  entries: DiaryEntry[],
  activeWritingSeconds = entry.activeWritingSeconds || 0,
): DailyEchoCompletionStats {
  return {
    wordCount: countDiaryTextCharacters(entry.content),
    activeWritingMinutes: getWritingMinutesFromSeconds(activeWritingSeconds),
    streakDays: calculateDiaryStreak(entries, entry),
  };
}
