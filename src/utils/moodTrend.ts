import type { DiaryEntry } from '../services/diaryService';
import { getDiaryDateKey, toDiaryDateKey } from './diaryDate';
import { removeDiaryTemplateLabels, stripHtmlToVisibleText } from './dailyEchoCompletionStats';
import { extractKeywords, stripMarkdown } from './textUtils';

export type MoodLevelLabel = '愉悦' | '轻松' | '平静' | '疲惫' | '低落';

export interface MoodTrendDay {
  date: string;
  weekday: string;
  score: number | null;
  label: MoodLevelLabel | null;
  keywords: string[];
  recordCount: number;
  summary?: string;
  entryIds: string[];
}

export interface MoodChartPoint {
  index: number;
  x: number;
  y: number | null;
}

export interface MoodCurveSegment {
  key: string;
  startIndex: number;
  endIndex: number;
  path: string;
  areaPath: string;
}

type MoodLexiconEntry = {
  term: string;
  score: number;
  english?: boolean;
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const MOOD_LEXICON: MoodLexiconEntry[] = [
  { term: 'joyful', score: 2, english: true },
  { term: 'happy', score: 1.5, english: true },
  { term: 'relaxed', score: 1, english: true },
  { term: 'calm', score: 0, english: true },
  { term: 'thoughtful', score: 0, english: true },
  { term: 'tired', score: -1, english: true },
  { term: 'anxious', score: -1.2, english: true },
  { term: 'sad', score: -2, english: true },
  { term: '愉悦', score: 2 },
  { term: '喜悦', score: 2 },
  { term: '心情美丽', score: 1.5 },
  { term: '开心', score: 1.5 },
  { term: '快乐', score: 1.5 },
  { term: '欢乐', score: 1.5 },
  { term: '高兴', score: 1.5 },
  { term: '愉快', score: 1.5 },
  { term: '轻松', score: 1 },
  { term: '放松', score: 1 },
  { term: '满足', score: 1 },
  { term: '充实', score: 0.8 },
  { term: '平静', score: 0 },
  { term: '宁静', score: 0 },
  { term: '思索', score: 0 },
  { term: '思考', score: 0 },
  { term: '疲惫', score: -1 },
  { term: '焦虑', score: -1.2 },
  { term: '压力', score: -1.2 },
  { term: '烦躁', score: -1.2 },
  { term: '低落', score: -2 },
  { term: '悲伤', score: -2 },
  { term: '难过', score: -2 },
  { term: '失落', score: -2 },
  { term: '累', score: -1 },
  { term: '困', score: -1 },
].sort((a, b) => b.term.length - a.term.length);

const EXACT_MOOD_SCORES = new Map(MOOD_LEXICON.map(({ term, score }) => [term.toLowerCase(), score]));
const EMOTION_KEYWORDS = new Set(MOOD_LEXICON.map(({ term }) => term.toLowerCase()));
const TOPIC_KEYWORDS = [
  '工作', '学习', '妈妈', '爸爸', '朋友', '家人', '同事', '老师', '项目', '产品', '设计', '代码',
  '散步', '跑步', '运动', '吃饭', '睡觉', '早睡', '回家', '聊天', '读书', '写作', '复盘', '计划',
  '生活', '成长', '目标', '灵感', '考试', '课程', '学校', '作业', '会议', '加班', '旅行', '电影', '整理',
];
const KEYWORD_STOP_WORDS = new Set([
  '做了', '只是', '没有', '描述', '心情', '情绪', '感觉', '今天', '有点', '一点',
  '日志', '日记', '记录', '事情', '内容',
]);
const SUMMARY_EVENT_WORDS = [
  '完成', '讨论', '沟通', '开会', '推进', '整理', '复盘', '学习', '工作', '下班', '回家', '聊天',
  '散步', '跑步', '吃饭', '做饭', '见面', '收到', '解决', '休息', '睡觉', '阅读', '写作', '购买',
];
const SUMMARY_GENERIC_TEXT = new Set(['无', '暂无', '随便写写', '记录一下', '今天的日记', '未命名']);
const TEMPLATE_SECTION_SCORES = new Map<string, number>([
  ['开心的事', 1.5],
  ['充实的事', 0.8],
  ['感谢的人', 1],
  ['不好的事', -1],
]);
const TEMPLATE_SECTION_LABELS = [
  ...TEMPLATE_SECTION_SCORES.keys(),
  '改进的事',
  '今日思考',
  '今天思考',
];
const EMPTY_TEMPLATE_SECTION_VALUES = new Set(['无', '暂无', '没有', '没什么', '无事', '无记录']);
const TEMPLATE_SECTION_PATTERN = new RegExp(
  `^\\s*(?:#{1,6}\\s*)?(${TEMPLATE_SECTION_LABELS.join('|')})(?:\\s*[：:]\\s*(.*)|\\s*)$`,
);

export function clampMoodScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-2, Math.min(2, value));
}

export function scoreToMoodLabel(score: number): MoodLevelLabel {
  const safeScore = clampMoodScore(score);
  if (safeScore >= 1.2) return '愉悦';
  if (safeScore >= 0.5) return '轻松';
  if (safeScore > -0.5) return '平静';
  if (safeScore > -1.2) return '疲惫';
  return '低落';
}

export function mapExplicitMoodToScore(mood: unknown): number | null {
  if (typeof mood !== 'string') return null;
  const normalized = mood.trim().toLowerCase();
  if (!normalized) return null;
  const score = EXACT_MOOD_SCORES.get(normalized);
  return score === undefined ? null : score;
}

function getEntryMoodSource(entry: Pick<DiaryEntry, 'content' | 'blocks'>): string {
  const blockText = Array.isArray(entry.blocks)
    ? entry.blocks.map((block) => block.content || '').filter(Boolean).join('\n')
    : '';
  return removeDiaryTemplateLabels(stripHtmlToVisibleText([entry.content || '', blockText].filter(Boolean).join('\n')));
}

function hasMeaningfulTemplateSectionContent(lines: string[]): boolean {
  const content = stripMarkdown(lines.join('\n'), true)
    .replace(/^[\s]*(?:[-*+]\s+|\d+[.)]\s*)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedPlaceholder = content.replace(/[。.!！]/g, '').trim();
  return Boolean(content) && !EMPTY_TEMPLATE_SECTION_VALUES.has(normalizedPlaceholder);
}

/** Extracts only user-filled semantic template sections; empty template headings never become mood evidence. */
export function getDiaryTemplateMoodScores(
  entry: Pick<DiaryEntry, 'content' | 'blocks'>,
): number[] {
  const sources = [
    entry.content || '',
    ...(entry.blocks || []).map((block) => `${block.title || ''}\n${block.content || ''}`),
  ].filter(Boolean);
  const sectionScores: number[] = [];

  sources.forEach((source) => {
    const lines = stripHtmlToVisibleText(source).split(/\r?\n/);
    let activeLabel: string | null = null;
    let activeLines: string[] = [];

    const flushSection = () => {
      const score = activeLabel ? TEMPLATE_SECTION_SCORES.get(activeLabel) : undefined;
      if (score !== undefined && hasMeaningfulTemplateSectionContent(activeLines)) {
        sectionScores.push(score);
      }
      activeLabel = null;
      activeLines = [];
    };

    lines.forEach((line) => {
      const match = stripMarkdown(line).match(TEMPLATE_SECTION_PATTERN);
      if (match) {
        flushSection();
        activeLabel = match[1];
        activeLines = match[2] ? [match[2]] : [];
        return;
      }
      if (activeLabel) activeLines.push(line);
    });
    flushSection();
  });

  return sectionScores;
}

function cleanSummarySource(value: string): string {
  const visibleText = removeDiaryTemplateLabels(stripHtmlToVisibleText(value || ''));
  return stripMarkdown(visibleText, true)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/data:image\/[^\s]+/gi, '')
    .replace(/^[\s]*(?:[-*+] |\d+[.)]\s*)/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function getSummaryFragments(value: string): string[] {
  return cleanSummarySource(value)
    .split(/[。！？!?；;\n]+/)
    .map((fragment) => fragment.replace(/^[，、,:：\s]+|[，、,:：\s]+$/g, '').trim())
    .filter(Boolean);
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length > 40) return `${normalized.slice(0, 39)}…`;
  if (normalized.length < 40 && !/[。！？…]$/.test(normalized)) return `${normalized}。`;
  return normalized;
}

function formatKeywordFallback(keywords: string[]): string | undefined {
  const meaningful = keywords
    .filter((keyword) => keyword && !KEYWORD_STOP_WORDS.has(keyword) && !EMOTION_KEYWORDS.has(keyword.toLowerCase()))
    .slice(0, 3);
  if (meaningful.length < 2) return undefined;
  const subject = meaningful.length === 2
    ? `${meaningful[0]}和${meaningful[1]}`
    : `${meaningful[0]}、${meaningful[1]}和${meaningful[2]}`;
  return `这一天记录了关于${subject}的内容。`;
}

export function buildMoodDaySummary(
  entries: Array<Pick<DiaryEntry, 'title' | 'content' | 'blocks'>>,
  keywords: string[] = [],
  label?: MoodLevelLabel | null,
): string | undefined {
  const candidates: Array<{ text: string; score: number }> = [];

  entries.forEach((entry) => {
    const contentSources = [
      entry.content || '',
      ...(entry.blocks || []).flatMap((block) => [block.title || '', block.content || '']),
    ];
    contentSources.flatMap(getSummaryFragments).forEach((originalText, index) => {
      const text = label && originalText.includes(label)
        ? originalText
          .split(/[，,]/)
          .filter((part) => !part.includes(label))
          .join('，')
          .trim()
        : originalText;
      if (text.length < 10 || SUMMARY_GENERIC_TEXT.has(text)) return;
      const keywordHits = keywords.filter((keyword) => text.includes(keyword)).length;
      const eventHits = SUMMARY_EVENT_WORDS.filter((word) => text.includes(word)).length;
      if (keywordHits === 0 && eventHits === 0) return;
      candidates.push({
        text,
        score: keywordHits * 4 + eventHits * 3 + Math.min(text.length, 40) / 20 - index * 0.1,
      });
    });

    getSummaryFragments(entry.title || '').forEach((text) => {
      if (text.length < 8 || SUMMARY_GENERIC_TEXT.has(text)) return;
      if (label && text.includes(label)) return;
      candidates.push({ text, score: 2 + Math.min(text.length, 24) / 24 });
    });
  });

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (best) return truncateSummary(best.text);
  return formatKeywordFallback(keywords);
}

function collectMoodScores(text: string): number[] {
  if (!text.trim()) return [];

  const normalized = text.toLowerCase();
  const occupied = new Uint8Array(normalized.length);
  const matches: Array<{ index: number; length: number; score: number }> = [];

  MOOD_LEXICON.forEach(({ term, score, english }) => {
    const needle = term.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < normalized.length) {
      const index = normalized.indexOf(needle, searchFrom);
      if (index < 0) break;
      searchFrom = index + Math.max(needle.length, 1);

      if (english) {
        const before = normalized[index - 1] || '';
        const after = normalized[index + needle.length] || '';
        if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue;
      }

      const nearbyPrefix = normalized.slice(Math.max(0, index - 6), index);
      if (/(?:不再|并不|没有|没再|未曾|不太|不怎么|不是很|没那么|不)(?:很|太|再)?$/.test(nearbyPrefix)) {
        continue;
      }

      matches.push({ index, length: needle.length, score });
    }
  });

  matches.sort((a, b) => b.length - a.length || a.index - b.index);
  const scores: number[] = [];
  matches.forEach((match) => {
    for (let offset = 0; offset < match.length; offset += 1) {
      if (occupied[match.index + offset]) return;
    }
    occupied.fill(1, match.index, match.index + match.length);
    scores.push(match.score);
  });
  return scores;
}

export function scoreDiaryMood(entry: Pick<DiaryEntry, 'content' | 'blocks' | 'mood'>): number | null {
  const explicitScore = mapExplicitMoodToScore(entry.mood);
  if (explicitScore !== null) return explicitScore;

  const scores = collectMoodScores(getEntryMoodSource(entry));
  if (scores.length > 0) {
    return clampMoodScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  const templateScores = getDiaryTemplateMoodScores(entry);
  if (templateScores.length === 0) return null;
  return clampMoodScore(templateScores.reduce((sum, score) => sum + score, 0) / templateScores.length);
}

function getDayKeywords(entries: DiaryEntry[]): string[] {
  const source = entries.map(getEntryMoodSource).filter(Boolean).join('\n');
  if (!source) return [];

  const knownTopics = TOPIC_KEYWORDS.filter((keyword) => source.includes(keyword));
  const extracted = extractKeywords(source)
    .map(({ text }) => text)
    .filter((keyword) => !EMOTION_KEYWORDS.has(keyword.toLowerCase()) && !KEYWORD_STOP_WORDS.has(keyword));
  return [...new Set([...knownTopics, ...extracted])].slice(0, 3);
}

export function buildMoodTrendDays(
  entries: DiaryEntry[],
  options: { now?: Date; days?: number } = {},
): MoodTrendDay[] {
  const now = options.now ? new Date(options.now) : new Date();
  now.setHours(0, 0, 0, 0);
  const dayCount = Math.max(1, Math.floor(options.days || 7));
  const entriesByDate = new Map<string, DiaryEntry[]>();

  entries.forEach((entry) => {
    const dateKey = getDiaryDateKey(entry.diaryDate);
    if (!dateKey) return;
    const dayEntries = entriesByDate.get(dateKey) || [];
    dayEntries.push(entry);
    entriesByDate.set(dateKey, dayEntries);
  });

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (dayCount - 1 - index));
    const dateKey = toDiaryDateKey(date);
    const dayEntries = entriesByDate.get(dateKey) || [];
    const validScores = dayEntries
      .map(scoreDiaryMood)
      .filter((score): score is number => score !== null);
    const score = validScores.length > 0
      ? clampMoodScore(validScores.reduce((sum, value) => sum + value, 0) / validScores.length)
      : null;
    const label = score === null ? null : scoreToMoodLabel(score);
    const keywords = getDayKeywords(dayEntries);

    return {
      date: dateKey,
      weekday: WEEKDAYS[date.getDay()],
      score,
      label,
      keywords,
      recordCount: dayEntries.length,
      summary: score === null ? undefined : buildMoodDaySummary(dayEntries, keywords, label),
      entryIds: [...new Set(dayEntries.map((entry) => entry.id).filter(Boolean))],
    };
  });
}

function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function buildMonotonePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)}`;

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return (next.y - point.y) / (next.x - point.x);
  });
  const tangents = new Array(points.length).fill(0);
  tangents[0] = slopes[0];
  tangents[points.length - 1] = slopes[slopes.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    tangents[index] = previousSlope * nextSlope <= 0
      ? 0
      : (2 * previousSlope * nextSlope) / (previousSlope + nextSlope);
  }

  slopes.forEach((slope, index) => {
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      return;
    }
    const leftRatio = tangents[index] / slope;
    const rightRatio = tangents[index + 1] / slope;
    const magnitude = Math.hypot(leftRatio, rightRatio);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * leftRatio * slope;
      tangents[index + 1] = scale * rightRatio * slope;
    }
  });

  let path = `M ${formatSvgNumber(points[0].x)} ${formatSvgNumber(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const width = next.x - current.x;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    const cp1Y = Math.max(minY, Math.min(maxY, current.y + (tangents[index] * width) / 3));
    const cp2Y = Math.max(minY, Math.min(maxY, next.y - (tangents[index + 1] * width) / 3));
    path += ` C ${formatSvgNumber(current.x + width / 3)} ${formatSvgNumber(cp1Y)}, ${formatSvgNumber(next.x - width / 3)} ${formatSvgNumber(cp2Y)}, ${formatSvgNumber(next.x)} ${formatSvgNumber(next.y)}`;
  }
  return path;
}

export function buildMoodCurveSegments(points: MoodChartPoint[], baselineY: number): MoodCurveSegment[] {
  const runs: MoodChartPoint[][] = [];
  let currentRun: MoodChartPoint[] = [];

  points.forEach((point) => {
    if (point.y === null) {
      if (currentRun.length > 0) runs.push(currentRun);
      currentRun = [];
      return;
    }
    currentRun.push(point);
  });
  if (currentRun.length > 0) runs.push(currentRun);

  return runs.map((run) => {
    const drawablePoints = run.map(({ x, y }) => ({ x, y: y as number }));
    const path = buildMonotonePath(drawablePoints);
    const first = drawablePoints[0];
    const last = drawablePoints[drawablePoints.length - 1];
    return {
      key: `${run[0].index}-${run[run.length - 1].index}`,
      startIndex: run[0].index,
      endIndex: run[run.length - 1].index,
      path,
      areaPath: drawablePoints.length > 1
        ? `${path} L ${formatSvgNumber(last.x)} ${formatSvgNumber(baselineY)} L ${formatSvgNumber(first.x)} ${formatSvgNumber(baselineY)} Z`
        : '',
    };
  });
}

export function formatMoodScore(score: number): string {
  const rounded = Math.round(clampMoodScore(score) * 10) / 10;
  return Object.is(rounded, -0) ? '0.0' : rounded.toFixed(1);
}

export function formatMoodScoreForAria(score: number): string {
  const formatted = formatMoodScore(score);
  if (formatted.startsWith('-')) return `负 ${formatted.slice(1)}`;
  return formatted;
}
