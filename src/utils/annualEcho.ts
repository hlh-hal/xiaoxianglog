import type { DiaryEntry } from '../services/diaryService';
import { getDiaryDateKey, parseDiaryDateKey, toDiaryDateKey } from './diaryDate';
import { countDiaryTextCharacters } from './dailyEchoCompletionStats';
import { getKeywordSourceText, stripMarkdown } from './textUtils';

export type AnnualEchoQuote = {
  text: string;
  entryId: string;
  date: string;
};

export type AnnualEchoManualItem = {
  text: string;
  evidenceEntryIds: string[];
  evidenceDates: string[];
};

export type AnnualEchoBusiestMonth = {
  month: number;
  entryCount: number;
};

export type AnnualEchoStats = {
  year: number;
  rangeStart: string;
  rangeEnd: string;
  firstDiaryDate: string | null;
  acquaintanceDays: number;
  totalEntries: number;
  writingDays: number;
  totalWords: number;
  totalImages: number;
  activeWritingMinutes: number;
  perfectWeeks: number;
  busiestMonth: AnnualEchoBusiestMonth;
  monthlyEntryCounts: number[];
  sourceHash: string;
  eligibleForReminder: boolean;
};

export type AnnualEchoDigestStatus = 'generated' | 'fallback';

export type AnnualEchoDigest = {
  id: string;
  year: number;
  sourceHash: string;
  stats: AnnualEchoStats;
  quote: AnnualEchoQuote | null;
  quotes?: AnnualEchoQuote[];
  annualReply: string;
  manualItems: AnnualEchoManualItem[];
  status: AnnualEchoDigestStatus;
  generatedAt: string;
};

export type AnnualEchoQuoteCandidate = AnnualEchoQuote & {
  score: number;
};

export type AnnualEchoAiPayload = {
  quote?: Partial<AnnualEchoQuote> | null;
  quotes?: Array<Partial<AnnualEchoQuote>> | null;
  annualReply?: unknown;
  manualItems?: Array<Partial<AnnualEchoManualItem> & { evidenceEntryId?: string; evidenceDate?: string }> | null;
};

const ANNUAL_ECHO_SEARCH_WORDS = [
  '年度报告',
  '年报',
  '年度回声',
  '年度总结',
  '年度回顾',
];

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

export function getAnnualEchoSearchYear(keyword: string, now = new Date()): number {
  const match = keyword.match(/(20\d{2})/);
  if (!match) return now.getFullYear();
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : now.getFullYear();
}

export function matchesAnnualEchoSearch(keyword: string, now = new Date()): boolean {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return false;
  const year = getAnnualEchoSearchYear(keyword, now);
  if (ANNUAL_ECHO_SEARCH_WORDS.some(word => normalized.includes(word))) return true;
  return normalized.includes(`${year}年度报告`)
    || normalized.includes(`${year}年报`)
    || normalized.includes(`${year}年度回声`);
}

function dayDiffInclusive(startKey: string, endKey: string): number {
  const start = parseDiaryDateKey(startKey);
  const end = parseDiaryDateKey(endKey);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end.getTime() < start.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function isValidAnnualEntry(entry: DiaryEntry): boolean {
  if (entry.status !== 'active' || entry.isHidden) return false;
  const text = getKeywordSourceText(entry);
  return countDiaryTextCharacters(text) > 0 || (entry.images || []).length > 0;
}

export function getAnnualEchoRangeEnd(year: number, now = new Date()): string {
  if (year === now.getFullYear()) {
    return toDiaryDateKey(now);
  }
  return `${year}-12-31`;
}

export function getAnnualEchoEntries(entries: DiaryEntry[], year: number, now = new Date()): DiaryEntry[] {
  const rangeEnd = getAnnualEchoRangeEnd(year, now);
  return entries
    .filter(isValidAnnualEntry)
    .filter((entry) => {
      const key = getDiaryDateKey(entry.diaryDate);
      return key >= `${year}-01-01` && key <= rangeEnd;
    })
    .sort((a, b) => getDiaryDateKey(a.diaryDate).localeCompare(getDiaryDateKey(b.diaryDate)));
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildAnnualEchoSourceHash(entries: DiaryEntry[], year: number, now = new Date()): string {
  const annualEntries = getAnnualEchoEntries(entries, year, now);
  const signature = annualEntries
    .map(entry => [
      entry.id,
      getDiaryDateKey(entry.diaryDate),
      entry.updatedAt,
      entry.status,
      entry.isHidden ? 'hidden' : 'visible',
      countDiaryTextCharacters(getKeywordSourceText(entry)),
      entry.images?.length || 0,
      entry.activeWritingSeconds || 0,
    ].join(':'))
    .join('|');
  return `${year}-${checksum(signature)}`;
}

function addDays(dateKey: string, days: number): string {
  const date = parseDiaryDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDiaryDateKey(date);
}

function countPerfectWeeks(writtenDateKeys: Set<string>, year: number, rangeEnd: string): number {
  let cursor = `${year}-01-01`;
  const first = parseDiaryDateKey(cursor);
  const day = first.getDay();
  const offsetToMonday = day === 0 ? 1 : (8 - day) % 7;
  cursor = addDays(cursor, offsetToMonday);

  let total = 0;
  while (cursor <= rangeEnd) {
    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(cursor, index));
    const isFullWeekInYear = weekDates[0] >= `${year}-01-01` && weekDates[6] <= `${year}-12-31` && weekDates[6] <= rangeEnd;
    if (isFullWeekInYear && weekDates.every(dateKey => writtenDateKeys.has(dateKey))) {
      total += 1;
    }
    cursor = addDays(cursor, 7);
  }
  return total;
}

export function buildAnnualEchoStats(entries: DiaryEntry[], year: number, now = new Date()): AnnualEchoStats {
  const annualEntries = getAnnualEchoEntries(entries, year, now);
  const rangeStart = `${year}-01-01`;
  const rangeEnd = getAnnualEchoRangeEnd(year, now);
  const allValidEntries = entries
    .filter(isValidAnnualEntry)
    .map(entry => getDiaryDateKey(entry.diaryDate))
    .filter(Boolean)
    .sort();
  const firstDiaryDate = allValidEntries[0] || null;
  const writtenDateKeys = new Set<string>();
  const monthlyEntryCounts = new Array(12).fill(0);
  let totalWords = 0;
  let totalImages = 0;
  let totalActiveWritingSeconds = 0;

  annualEntries.forEach((entry) => {
    const key = getDiaryDateKey(entry.diaryDate);
    const date = parseDiaryDateKey(key);
    writtenDateKeys.add(key);
    monthlyEntryCounts[date.getMonth()] += 1;
    totalWords += countDiaryTextCharacters(getKeywordSourceText(entry));
    totalImages += entry.images?.length || 0;
    totalActiveWritingSeconds += entry.activeWritingSeconds || 0;
  });

  const busiestMonthIndex = monthlyEntryCounts.reduce((bestIndex, count, index) => (
    count > monthlyEntryCounts[bestIndex] ? index : bestIndex
  ), 0);

  return {
    year,
    rangeStart,
    rangeEnd,
    firstDiaryDate,
    acquaintanceDays: firstDiaryDate ? dayDiffInclusive(firstDiaryDate, rangeEnd) : 0,
    totalEntries: annualEntries.length,
    writingDays: writtenDateKeys.size,
    totalWords,
    totalImages,
    activeWritingMinutes: Math.round(totalActiveWritingSeconds / 60),
    perfectWeeks: countPerfectWeeks(writtenDateKeys, year, rangeEnd),
    busiestMonth: {
      month: busiestMonthIndex + 1,
      entryCount: monthlyEntryCounts[busiestMonthIndex] || 0,
    },
    monthlyEntryCounts,
    sourceHash: buildAnnualEchoSourceHash(entries, year, now),
    eligibleForReminder: writtenDateKeys.size >= 8,
  };
}

function isSensitiveQuote(value: string): boolean {
  return /(?:\d{4,}|@|手机|电话|地址|账号|密码|身份证|微信|想死|自杀|杀人|恨死)/.test(value);
}

function splitCandidateSentences(text: string): string[] {
  return stripMarkdown(text, true)
    .split(/[\n。！？!?；;]+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function scoreQuoteCandidate(value: string): number {
  const length = Array.from(value).length;
  const lengthScore = length >= 12 && length <= 32 ? 8 : length >= 8 && length <= 48 ? 5 : 1;
  const reflectiveScore = /(?:原来|终于|决定|勇敢|害怕|明白|发现|愿意|值得|生活|自己|以后|这一年|今天)/.test(value) ? 5 : 0;
  const firstPersonScore = /(?:我|自己)/.test(value) ? 2 : 0;
  return lengthScore + reflectiveScore + firstPersonScore;
}

export function extractAnnualQuoteCandidates(entries: DiaryEntry[], limit = 80): AnnualEchoQuoteCandidate[] {
  const candidates: AnnualEchoQuoteCandidate[] = [];
  const seen = new Set<string>();

  entries.forEach((entry) => {
    splitCandidateSentences(getKeywordSourceText(entry)).forEach((sentence) => {
      const chars = Array.from(sentence);
      if (chars.length < 8 || chars.length > 56) return;
      if (isSensitiveQuote(sentence)) return;
      const normalized = sentence.replace(/\s+/g, '');
      if (seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push({
        text: sentence,
        entryId: entry.id,
        date: getDiaryDateKey(entry.diaryDate),
        score: scoreQuoteCandidate(sentence),
      });
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, limit);
}

function normalizeAnnualReply(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function buildAnnualEchoFallbackDigest(stats: AnnualEchoStats, candidates: AnnualEchoQuoteCandidate[], now = new Date()): AnnualEchoDigest {
  const quotes = candidates.slice(0, 5).map(candidate => ({
    text: candidate.text,
    entryId: candidate.entryId,
    date: candidate.date,
  }));
  const quote = quotes[0] || null;

  return {
    id: `annual-echo:${stats.year}`,
    year: stats.year,
    sourceHash: stats.sourceHash,
    stats,
    quote,
    quotes,
    annualReply: stats.totalEntries > 0
      ? '这一年，你把生活一点点写成了可以回头看的路。'
      : '等这里攒起一些文字，年度回声会慢慢长出来。',
    manualItems: [],
    status: 'fallback',
    generatedAt: now.toISOString(),
  };
}

function normalizeEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))).slice(0, 12);
}

function normalizeEvidenceDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map(item => getDiaryDateKey(item))
    .filter(Boolean)))
    .slice(0, 12);
}

export function validateAnnualEchoAiPayload(
  payload: AnnualEchoAiPayload,
  stats: AnnualEchoStats,
  candidates: AnnualEchoQuoteCandidate[],
  entries: DiaryEntry[],
  now = new Date(),
): AnnualEchoDigest {
  const candidateByText = new Map(candidates.map(candidate => [candidate.text, candidate]));
  const entryIds = new Set(entries.map(entry => entry.id));
  const annualEntryDates = new Set(entries.map(entry => getDiaryDateKey(entry.diaryDate)));
  const fallback = buildAnnualEchoFallbackDigest(stats, candidates, now);
  const payloadQuotes = Array.isArray(payload.quotes) && payload.quotes.length > 0
    ? payload.quotes
    : payload.quote
      ? [payload.quote]
      : [];
  const seenQuotes = new Set<string>();
  const quotes = payloadQuotes
    .map((item) => {
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      const candidate = text ? candidateByText.get(text) : null;
      if (!candidate) return null;
      const key = candidate.text.replace(/\s+/g, '');
      if (seenQuotes.has(key)) return null;
      seenQuotes.add(key);
      return { text: candidate.text, entryId: candidate.entryId, date: candidate.date };
    })
    .filter((item): item is AnnualEchoQuote => Boolean(item))
    .slice(0, 5);
  const finalQuotes = quotes.length > 0 ? quotes : (fallback.quotes || []);
  const annualReply = normalizeAnnualReply(payload.annualReply) || fallback.annualReply;
  const seenManuals = new Set<string>();
  const manualItems = (payload.manualItems || [])
    .map((item) => {
      const text = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : '';
      if (!/^只要.+我就.+/.test(text)) return null;
      const evidenceEntryIds = normalizeEvidenceIds(item.evidenceEntryIds || (item.evidenceEntryId ? [item.evidenceEntryId] : []))
        .filter(id => entryIds.has(id));
      const evidenceDates = normalizeEvidenceDates(item.evidenceDates || (item.evidenceDate ? [item.evidenceDate] : []))
        .filter(date => annualEntryDates.has(date));
      if (evidenceEntryIds.length === 0 && evidenceDates.length === 0) return null;
      const key = text.replace(/\s+/g, '');
      if (seenManuals.has(key)) return null;
      seenManuals.add(key);
      return { text, evidenceEntryIds, evidenceDates };
    })
    .filter((item): item is AnnualEchoManualItem => Boolean(item));

  return {
    ...fallback,
    quote: finalQuotes[0] || fallback.quote,
    quotes: finalQuotes,
    annualReply,
    manualItems,
    status: 'generated',
    generatedAt: now.toISOString(),
  };
}
