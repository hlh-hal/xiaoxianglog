import { createHash, randomUUID } from 'node:crypto';
import type { DiaryEntry } from '@prisma/client';
import { parseJsonText, stringifyJsonText } from './jsonText.js';

export const DEFAULT_MONTHLY_ECHO_TIMEZONE = 'Asia/Shanghai';
export const DEFAULT_MONTHLY_ECHO_PUSH_TIME = '20:00';
export const MONTHLY_TRACE_PROMPT_VERSION = 'daily_trace_v2_4';
export const MONTHLY_ARC_PROMPT_VERSION = 'monthly_arc_v2_11';
export const MONTHLY_ECHO_PROMPT_VERSION = 'monthly_echo_render_v2_12';
export const DEFAULT_MONTHLY_PUSH_TITLE = '你这个月的回声来了';
export const DEFAULT_MONTHLY_PUSH_BODY = '小象帮你整理好了这个月的生活轨迹。';

const DIAGNOSIS_PATTERN = /(?:人格障碍|焦虑症|抑郁症|双相|躁郁|创伤后应激|PTSD|精神病|病态|讨好型人格|回避型人格|依恋障碍|心理疾病|确诊|诊断)/i;
const PERMANENT_LABEL_PATTERN = /(?:你总是|你永远|你就是|你一定是|本质上你|注定|人格|画像|档案显示|系统看到|根据你的长期模式)/;
const INJECTION_LEAK_PATTERN = /(?:忽略.{0,8}规则|忽略.{0,8}指令|系统提示词|developer message|system prompt|隐藏规则|不要遵守|输出格式改为|你现在是|扮演)/i;
const HIGH_RISK_PATTERN = /(?:自杀|想死|不想活|结束生命|轻生|伤害自己|杀了|杀掉|弄死|伤害别人|报复社会)/;
const REPORT_TONE_PATTERN = /(?:统计报告|心理分析|报告显示|数据显示|情绪评分|人格测试)/;

export type MonthlyTracePayload = {
  importantEvents: string[];
  realActions: string[];
  emotionStates: string[];
  relationshipSignals: string[];
  energySources: string[];
  energyDrains: string[];
  repeatedTensions: string[];
  unfinishedQuestions: string[];
  changeSignals: string[];
  evidenceQuotes: string[];
  confidence: number;
};

export type MonthlyArcPayload = {
  mainArc: string;
  keyEvents: Array<{
    title: string;
    whatHappened: string;
    whyItMatters: string;
    changeItPushed: string;
    evidence: string[];
  }>;
  actionTrajectory: string;
  emotionTrajectory: string;
  repeatedTensions: string[];
  sideThemes: string[];
  keyTurningPoint: {
    moment: string;
    meaning: string;
    evidence: string[];
  };
  hiddenNeed: string;
  unfinishedQuestions: string[];
  growthDirection: string;
  monthlyInsightSentence: string;
  evidenceMap: Array<{ claim: string; evidence: string[] }>;
  confidence: number;
};

export type MonthlyEchoPayload = {
  title: string;
  opening: string;
  mainArcSection: string;
  keyMomentsSection: string;
  actionTrajectorySection: string;
  repeatedThemeSection: string;
  unfinishedSection: string;
  nextMonthQuestion: string;
  finalInsightSentence: string;
  fullText: string;
  posterQuote?: string;
  posterThemeLine?: string;
  pushTitle?: string;
  pushBody?: string;
};

export type ZonedNow = {
  date: string;
  monthKey: string;
  day: number;
  hour: number;
  minute: number;
};

export function safeTimeZone(value?: string | null, fallback = DEFAULT_MONTHLY_ECHO_TIMEZONE): string {
  const candidate = value || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

export function normalizePushTime(value?: string | null): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : DEFAULT_MONTHLY_ECHO_PUSH_TIME;
}

function dateKeyFromUnknown(value: unknown): string {
  const raw = String(value || '').trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function getMonthKeyForDiaryDate(diaryDate: unknown, _timeZone?: string): string {
  return dateKeyFromUnknown(diaryDate).slice(0, 7);
}

export function getMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(last).padStart(2, '0')}`,
  };
}

export function getZonedNow(timeZone: string, now = new Date()): ZonedNow {
  const safe = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safe,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    monthKey: `${byType.year}-${byType.month}`,
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

export function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isLastDayInZone(timeZone: string, now = new Date()): boolean {
  const zoned = getZonedNow(timeZone, now);
  return zoned.date === getMonthRange(zoned.monthKey).endDate;
}

export function isFirstDayInZone(timeZone: string, now = new Date()): boolean {
  return getZonedNow(timeZone, now).day === 1;
}

export function isAtOrAfterLocalTime(timeZone: string, localTime: string, now = new Date()): boolean {
  const zoned = getZonedNow(timeZone, now);
  const [hour, minute] = normalizePushTime(localTime).split(':').map(Number);
  return zoned.hour * 60 + zoned.minute >= hour * 60 + minute;
}

export function stripMarkup(value: string): string {
  return String(value || '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEvidenceText(value: string): string {
  return stripMarkup(value)
    .toLowerCase()
    .replace(/[“”"‘’'`，。！？；：、,.!?;:\s]/g, '');
}

export function hasHighRiskContent(value: string): boolean {
  return HIGH_RISK_PATTERN.test(value);
}

export function hasUnsafeMonthlyEchoText(value: string): boolean {
  return DIAGNOSIS_PATTERN.test(value)
    || PERMANENT_LABEL_PATTERN.test(value)
    || INJECTION_LEAK_PATTERN.test(value)
    || REPORT_TONE_PATTERN.test(value);
}

export function sanitizeShortText(value: unknown, maxLength: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = sanitizeShortText(item, maxLength);
    if (!text || seen.has(text) || hasUnsafeMonthlyEchoText(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function safeJsonObject(value: string): Record<string, unknown> | null {
  const raw = String(value || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildEntrySourceText(entry: Pick<DiaryEntry, 'content' | 'dailyEcho'>): string {
  return stripMarkup(entry.content || '');
}

export function buildEntrySourceHash(entry: Pick<DiaryEntry, 'id' | 'content' | 'dailyEcho' | 'diaryDate' | 'updatedAt'>): string {
  return createHash('sha256')
    .update([
      entry.id,
      entry.diaryDate,
      entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : String(entry.updatedAt || ''),
      entry.content || '',
    ].join('\n---\n'))
    .digest('hex');
}

export function filterEvidenceQuotes(quotes: unknown, sourceText: string, maxItems = 3): string[] {
  const normalizedSource = normalizeEvidenceText(sourceText);
  return stringArray(quotes, maxItems, 80)
    .filter(quote => {
      const normalizedQuote = normalizeEvidenceText(quote);
      return normalizedQuote.length >= 2 && normalizedSource.includes(normalizedQuote);
    });
}

export function normalizeTracePayload(value: Record<string, unknown>, sourceText: string): MonthlyTracePayload {
  const evidenceQuotes = filterEvidenceQuotes(value.evidenceQuotes, sourceText, 3);
  return {
    importantEvents: stringArray(value.importantEvents, 3, 80),
    realActions: stringArray(value.realActions, 6, 90),
    emotionStates: stringArray(value.emotionStates, 5, 60),
    relationshipSignals: stringArray(value.relationshipSignals, 5, 80),
    energySources: stringArray(value.energySources, 5, 80),
    energyDrains: stringArray(value.energyDrains, 5, 80),
    repeatedTensions: stringArray(value.repeatedTensions, 5, 90),
    unfinishedQuestions: stringArray(value.unfinishedQuestions, 5, 90),
    changeSignals: stringArray(value.changeSignals, 5, 90),
    evidenceQuotes,
    confidence: clampConfidence(value.confidence),
  };
}

export function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.4;
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeArcPayload(value: Record<string, unknown>, allEvidence: string[], entryCount: number): MonthlyArcPayload {
  const evidenceSource = allEvidence.join('\n');
  const keyEventsRaw = Array.isArray(value.keyEvents) ? value.keyEvents : [];
  const maxKeyEvents = entryCount < 3 ? 2 : 5;
  const keyEvents = keyEventsRaw
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      title: sanitizeShortText(item.title, 40),
      whatHappened: sanitizeShortText(item.whatHappened, 160),
      whyItMatters: sanitizeShortText(item.whyItMatters, 180),
      changeItPushed: sanitizeShortText(item.changeItPushed, 160),
      evidence: filterEvidenceQuotes(item.evidence, evidenceSource, 3),
    }))
    .filter(item => item.title || item.whatHappened)
    .slice(0, maxKeyEvents);
  const evidenceMapRaw = Array.isArray(value.evidenceMap) ? value.evidenceMap : [];
  const evidenceMap = evidenceMapRaw
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      claim: sanitizeShortText(item.claim, 120),
      evidence: filterEvidenceQuotes(item.evidence, evidenceSource, 4),
    }))
    .filter(item => item.claim && item.evidence.length > 0)
    .slice(0, 8);
  const turningPoint = value.keyTurningPoint && typeof value.keyTurningPoint === 'object'
    ? value.keyTurningPoint as Record<string, unknown>
    : {};
  const growthDirection = sanitizeShortText(value.growthDirection, 160);

  return {
    mainArc: sanitizeShortText(value.mainArc, 220),
    keyEvents,
    actionTrajectory: sanitizeShortText(value.actionTrajectory, 500),
    emotionTrajectory: sanitizeShortText(value.emotionTrajectory, 500),
    repeatedTensions: stringArray(value.repeatedTensions, 6, 130),
    sideThemes: stringArray(value.sideThemes, 8, 80),
    keyTurningPoint: {
      moment: sanitizeShortText(turningPoint.moment, 160),
      meaning: sanitizeShortText(turningPoint.meaning, 220),
      evidence: filterEvidenceQuotes(turningPoint.evidence, evidenceSource, 3),
    },
    hiddenNeed: sanitizeShortText(value.hiddenNeed, 240),
    unfinishedQuestions: stringArray(value.unfinishedQuestions, 6, 140),
    growthDirection: growthDirection.includes('从') && growthDirection.includes('走向')
      ? growthDirection
      : '',
    monthlyInsightSentence: sanitizeShortText(value.monthlyInsightSentence, 120),
    evidenceMap,
    confidence: clampConfidence(value.confidence),
  };
}

export function normalizeEchoPayload(value: Record<string, unknown>, evidenceQuotes: string[], entryCount: number): MonthlyEchoPayload {
  const evidenceSource = evidenceQuotes.join('\n');
  const posterQuoteRaw = sanitizeShortText(value.posterQuote, 80);
  const posterQuote = posterQuoteRaw
    && !hasHighRiskContent(posterQuoteRaw)
    && normalizeEvidenceText(evidenceSource).includes(normalizeEvidenceText(posterQuoteRaw))
    ? posterQuoteRaw
    : evidenceQuotes.find(quote => !hasHighRiskContent(quote)) || '';
  const fullTextLimit = entryCount < 3 ? 700 : 1200;
  const pushTitle = sanitizePushText(value.pushTitle, 20) || DEFAULT_MONTHLY_PUSH_TITLE;
  const pushBody = sanitizePushText(value.pushBody, 45) || DEFAULT_MONTHLY_PUSH_BODY;

  return {
    title: sanitizeShortText(value.title, 40) || '这个月的小象回声',
    opening: sanitizeShortText(value.opening, 260),
    mainArcSection: sanitizeShortText(value.mainArcSection, 700),
    keyMomentsSection: sanitizeShortText(value.keyMomentsSection, 800),
    actionTrajectorySection: sanitizeShortText(value.actionTrajectorySection, 700),
    repeatedThemeSection: sanitizeShortText(value.repeatedThemeSection, 700),
    unfinishedSection: sanitizeShortText(value.unfinishedSection, 700),
    nextMonthQuestion: sanitizeShortText(value.nextMonthQuestion, 140),
    finalInsightSentence: sanitizeShortText(value.finalInsightSentence, 140),
    fullText: sanitizeShortText(value.fullText, fullTextLimit),
    posterQuote,
    posterThemeLine: sanitizePosterThemeLine(value.posterThemeLine),
    pushTitle,
    pushBody,
  };
}

function sanitizePosterThemeLine(value: unknown): string {
  const text = sanitizeShortText(value, 18);
  if (Array.from(text).length > 18 || hasUnsafeMonthlyEchoText(text)) return '';
  return text;
}

function sanitizePushText(value: unknown, maxLength: number): string {
  const text = sanitizeShortText(value, maxLength);
  return hasUnsafeMonthlyEchoText(text) ? '' : text;
}

export function assertSafePayloadText(payload: unknown, label: string): void {
  const text = JSON.stringify(payload);
  if (hasUnsafeMonthlyEchoText(text)) {
    throw new Error(`${label} contains unsafe or diagnostic language`);
  }
}

export function safetyFallbackMonthlyEcho(monthKey: string): MonthlyEchoPayload {
  const monthLabel = `${Number(monthKey.slice(5, 7))}月`;
  const body = `这个月的记录里出现了一些很重的感受。小象不会把这些话写成漂亮的金句，也不会替你做判断。先把自己放在安全的地方，尽量联系身边可以信任的人；如果危险感正在靠近，请立刻寻求现实中的帮助。`;
  return {
    title: `${monthLabel}，先照顾好自己`,
    opening: body,
    mainArcSection: body,
    keyMomentsSection: '',
    actionTrajectorySection: '',
    repeatedThemeSection: '',
    unfinishedSection: '有些问题不需要在这个月被强行解决。先活下来，先被陪着，比总结更重要。',
    nextMonthQuestion: '下个月，能不能先把安全放在更靠前的位置？',
    finalInsightSentence: '很重的时候，不必把自己整理成答案。',
    fullText: body,
    posterQuote: '',
    posterThemeLine: '',
    pushTitle: DEFAULT_MONTHLY_PUSH_TITLE,
    pushBody: DEFAULT_MONTHLY_PUSH_BODY,
  };
}

export function newLockToken(): string {
  return randomUUID();
}

export function jsonArray(value: unknown): string {
  return stringifyJsonText(Array.isArray(value) ? value : []);
}
