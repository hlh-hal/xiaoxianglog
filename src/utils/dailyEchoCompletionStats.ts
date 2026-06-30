import type { DiaryEntry } from '../services/diaryService';

export const WRITING_ACTIVITY_WINDOW_MS = 180_000;

export type WritingActivityState = {
  elapsedMs: number;
  lastInputAt: number | null;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
};

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
  return {
    elapsedMs: Math.max(0, elapsedMs),
    lastInputAt: null,
    sessionStartedAt: null,
    sessionEndedAt: null,
  };
}

export function recordWritingInput(
  state: WritingActivityState,
  timestamp = Date.now(),
  activityWindowMs = WRITING_ACTIVITY_WINDOW_MS,
): WritingActivityState {
  if (state.lastInputAt === null) {
    return {
      ...state,
      lastInputAt: timestamp,
      sessionStartedAt: state.sessionStartedAt ?? timestamp,
      sessionEndedAt: null,
    };
  }

  return {
    elapsedMs: state.elapsedMs + Math.max(0, Math.min(timestamp - state.lastInputAt, activityWindowMs)),
    lastInputAt: timestamp,
    sessionStartedAt: state.sessionStartedAt ?? timestamp,
    sessionEndedAt: null,
  };
}

export function pauseWritingActivity(
  state: WritingActivityState,
  timestamp = Date.now(),
  activityWindowMs = WRITING_ACTIVITY_WINDOW_MS,
): WritingActivityState {
  if (state.lastInputAt === null) return state;

  return {
    elapsedMs: state.elapsedMs + Math.max(0, Math.min(timestamp - state.lastInputAt, activityWindowMs)),
    lastInputAt: null,
    sessionStartedAt: state.sessionStartedAt,
    sessionEndedAt: timestamp,
  };
}

export function getActiveWritingMinutes(state: WritingActivityState, timestamp = Date.now()): number {
  const finalized = pauseWritingActivity(state, timestamp);
  const activeMinutes = finalized.elapsedMs > 0 ? Math.round(finalized.elapsedMs / 60_000) : 0;
  if (activeMinutes <= 0 && finalized.elapsedMs <= 0) return 0;
  return Math.max(1, activeMinutes);
}

export function getActiveWritingSeconds(state: WritingActivityState, timestamp = Date.now()): number {
  const finalized = pauseWritingActivity(state, timestamp);
  if (finalized.elapsedMs <= 0) return 0;
  return Math.max(1, Math.ceil(finalized.elapsedMs / 1_000));
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
  writingActivity: WritingActivityState,
  timestamp = Date.now(),
): DailyEchoCompletionStats {
  return {
    wordCount: countDiaryTextCharacters(entry.content),
    activeWritingMinutes: getActiveWritingMinutes(writingActivity, timestamp),
    streakDays: calculateDiaryStreak(entries, entry),
  };
}
