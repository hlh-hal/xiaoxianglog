/**
 * Strips both HTML tags and Markdown syntax from a string to return plain text.
 *
 * Order:
 * 1. Strip HTML tags using DOMParser (or regex as fallback)
 * 2. Strip Markdown syntax
 */
export function stripMarkdown(content: string, preserveNewlines = false): string {
  if (!content) return '';

  let text = content;

  // Remove formatting newlines between HTML tags to prevent extra blank lines.
  text = text.replace(/>\s*[\n\r]+\s*</g, '><');

  // Convert <ol> structure to include numbers before stripping tags.
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, inner) => {
    let liCount = 1;
    return inner.replace(/<li[^>]*>/gi, () => `<li>${liCount++}. `);
  });

  if (/<[a-z][\s\S]*>/i.test(text)) {
    try {
      if (preserveNewlines) {
        text = text.replace(/<\/p>\s*<\/li>/gi, '</li>');
        text = text.replace(/<\/div>\s*<\/li>/gi, '</li>');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p>/gi, '\n');
        text = text.replace(/<\/div>/gi, '\n');
        text = text.replace(/<\/h[1-6]>/gi, '\n');
        text = text.replace(/<\/li>/gi, '\n');
      }
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body.textContent || '';
    } catch {
      if (preserveNewlines) {
        text = text.replace(/<\/p>\s*<\/li>/gi, '</li>');
        text = text.replace(/<\/div>\s*<\/li>/gi, '</li>');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p>/gi, '\n');
        text = text.replace(/<\/div>/gi, '\n');
        text = text.replace(/<\/h[1-6]>/gi, '\n');
        text = text.replace(/<\/li>/gi, '\n');
      }
      text = text.replace(/<[^>]+>/g, ' ');
    }
  }

  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');

  if (!preserveNewlines) {
    text = text.replace(/^[\s]*[-*]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');
    text = text.replace(/^>\s?/gm, '');
  }

  text = text.replace(/!\[.*?\]\(.*?\)/g, '');
  text = text.replace(/\[([^\]]+)\]\(.*?\)/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/```[\s\S]*?```/g, '');

  if (preserveNewlines) {
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\n{2,}/g, ' ');
    text = text.replace(/\n/g, ' ');
    text = text.replace(/\s{2,}/g, ' ');
  }

  return text.trim();
}

/**
 * Gets a plain text excerpt from content with a specific length.
 */
export function getExcerpt(content: string, maxLength = 80, preserveNewlines = false): string {
  const plain = stripMarkdown(content, preserveNewlines);
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength) + '...';
}

/**
 * Truncates text to a specific length and adds ellipsis if needed.
 * @deprecated Use getExcerpt for markdown/html content
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

const TEMPLATE_WORDS = [
  '开心的事',
  '充实的事',
  '感恩的人',
  '改进的事',
  '今日思考',
  '开心',
  '充实',
  '感恩',
  '改进',
  '思考',
];

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '都', '而', '及', '与', '着', '或', '一个',
  '自己', '我们', '你们', '他们', '她们', '它们', '大家', '别人', '今天', '明天', '昨天', '现在',
  '这个', '那个', '这些', '那些', '可以', '觉得', '还是', '但是', '因为', '所以', '如果', '虽然',
  '不过', '然后', '怎么', '这么', '那么', '其实', '只是', '为了', '一样', '一起', '一点', '这种',
  '那种', '很多', '时候', '出来', '起来', '知道', '可能', '开始', '已经', '发现', '发生', '感觉',
  '需要', '应该', '希望', '喜欢', '非常', '比较', '特别', '真的', '还有', '没有', '什么', '哪怕',
  '也有', '不是', '就是', '时候', '一点', '一些', '一下', '一直', '也是', '还是',
  '关于', '对于', '至于', '除了', '此外', '另外', '总之', '例如', '比如', '结果', '终于', '接着',
  '随后', '过去', '未来', '以前', '以后', '后来',
]);

const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'he',
  'her', 'his', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that',
  'the', 'their', 'there', 'they', 'this', 'to', 'was', 'we', 'with', 'you', 'your',
  'loss', 'not', 'offer', 'what',
  'app', 'codex', 'do', 'happy', 'hermes', 'id', 'jd', 'ok', 'prompt', 'scanner', 'skill',
  'sop', 'taste', 'why', 'agent', 'leo', 'qq', 'uu',
]);

const ALLOWED_ENGLISH_KEYWORDS = new Set([
  'ai',
  'api',
  'css',
  'html',
  'java',
  'javascript',
  'js',
  'json',
  'pwa',
  'react',
  'typescript',
  'ts',
  'ui',
  'ux',
]);

const ENGLISH_DISPLAY_WORDS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  css: 'CSS',
  html: 'HTML',
  java: 'Java',
  js: 'JS',
  json: 'JSON',
  pwa: 'PWA',
  react: 'React',
  ts: 'TS',
  typescript: 'TypeScript',
  ui: 'UI',
  ux: 'UX',
};

const LOOSE_LIFE_THEME_KEYWORDS = [
  '工作', '学习', '妈妈', '爸爸', '朋友', '家人', '同事', '老师', '项目', '产品', '设计', '代码',
  '散步', '跑步', '运动', '吃饭', '睡觉', '早睡', '回家', '聊天', '读书', '写作', '复盘', '计划',
  '开心', '快乐', '平静', '焦虑', '难过', '生气', '压力', '疲惫', '温暖', '喜欢', '期待', '希望',
  '生活', '成长', '目标', '灵感', '考试', '课程', '学校', '作业', '会议', '加班', '旅行', '电影',
];

const MEANINGFUL_SINGLE_CHINESE_KEYWORDS = new Set([
  '累', '忙', '困', '烦', '痛', '哭', '笑', '爱', '家', '梦', '冷', '热', '饿', '怕',
]);

export interface KeywordCount {
  text: string;
  value: number;
}

type KeywordEntry = KeywordCount & {
  firstIndex: number;
};

export interface KeywordSourceEntry {
  content?: string | null;
  diaryDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  blocks?: { title?: string | null; content?: string | null }[] | null;
}

type NormalizedKeyword = {
  key: string;
  text: string;
  isEnglish: boolean;
  isChinesePhrase: boolean;
  isSensitiveLike: boolean;
};

type ScoredKeywordEntry = {
  text: string;
  totalCount: number;
  diaryIndexes: Set<number>;
  latestTime: number;
  firstIndex: number;
  isEnglish: boolean;
  isChinesePhrase: boolean;
  isSensitiveLike: boolean;
};

export const getCleanedContent = (content: string) => {
  let cleaned = content;

  TEMPLATE_WORDS.forEach((word) => {
    const regex = new RegExp(`${word}[:：]?`, 'g');
    cleaned = cleaned.replace(regex, '');
  });

  cleaned = stripMarkdown(cleaned);
  cleaned = cleaned.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');

  return cleaned;
};

const normalizeKeyword = (word: string): NormalizedKeyword | null => {
  const trimmed = word.trim();
  if (!trimmed || trimmed.length <= 1 || !Number.isNaN(Number(trimmed))) return null;

  if (/^[a-zA-Z0-9]+$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    const key = trimmed.toLowerCase();
    if (/\d/.test(key) || ENGLISH_STOP_WORDS.has(key) || !ALLOWED_ENGLISH_KEYWORDS.has(key)) return null;
    return {
      key,
      text: ENGLISH_DISPLAY_WORDS[key] || key,
      isEnglish: true,
      isChinesePhrase: false,
      isSensitiveLike: false,
    };
  }

  if (STOP_WORDS.has(trimmed)) return null;
  return {
    key: trimmed,
    text: trimmed,
    isEnglish: false,
    isChinesePhrase: /^[\u4e00-\u9fa5]{2,}$/.test(trimmed),
    isSensitiveLike: /(?:\d{4,}|@|手机|电话|地址|账号|密码|身份证|微信)/.test(trimmed),
  };
};

const isSensitiveLikeKeywordText = (value: string): boolean => (
  /(?:\d{4,}|@|手机|电话|地址|账号|密码|身份证|微信)/.test(value)
);

const extractNormalizedKeywords = (content: string): NormalizedKeyword[] => {
  if (!content) return [];

  const cleaned = getCleanedContent(content);
  const keywords: NormalizedKeyword[] = [];
  const addWord = (segment: string) => {
    const normalized = normalizeKeyword(segment);
    if (normalized) keywords.push(normalized);
  };
  const sensitivePattern = /(?:账号|手机|电话|地址|身份证|微信|密码)[a-zA-Z0-9]{2,}/g;
  const segmentSource = cleaned.replace(sensitivePattern, (match) => {
    addWord(match);
    return ' ';
  });

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    const segments = segmenter.segment(segmentSource);

    for (const { segment, isWordLike } of segments) {
      if (isWordLike) addWord(segment);
    }
  } else {
    const words = segmentSource.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{2,}/g) || [];
    words.forEach(addWord);
  }

  return keywords;
};

export const extractKeywords = (content: string): KeywordCount[] => {
  const wordCounts = new Map<string, KeywordEntry>();
  let firstIndex = 0;

  extractNormalizedKeywords(content).forEach((keyword) => {
    const existing = wordCounts.get(keyword.key);
    if (existing) {
      existing.value += 1;
      return;
    }

    wordCounts.set(keyword.key, {
      text: keyword.text,
      value: 1,
      firstIndex: firstIndex++,
    });
  });

  return Array.from(wordCounts.values())
    .sort((a, b) => b.value - a.value || a.firstIndex - b.firstIndex)
    .map(({ text, value }) => ({ text, value }));
};

const parseDateTime = (dateValue: string | Date | number | null | undefined, now = new Date()): number | null => {
  if (dateValue instanceof Date) {
    const time = dateValue.getTime();
    return Number.isNaN(time) ? null : time;
  }

  if (typeof dateValue === 'number') {
    return Number.isFinite(dateValue) ? dateValue : null;
  }

  const raw = String(dateValue || '').trim();
  if (!raw) return null;

  const direct = new Date(raw).getTime();
  if (!Number.isNaN(direct)) return direct;

  const dateMatch = raw.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dateMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = dateMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const time = date.getTime();
    return Number.isNaN(time) ? null : time;
  }

  const monthDayMatch = raw.match(/^(\d{1,2})月(\d{1,2})日?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (monthDayMatch) {
    const [, month, day, hour = '0', minute = '0', second = '0'] = monthDayMatch;
    const date = new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const time = date.getTime();
    return Number.isNaN(time) ? null : time;
  }

  return null;
};

const getEntryTime = (entry: KeywordSourceEntry, now: Date): number | null => (
  parseDateTime(entry.diaryDate, now)
  ?? parseDateTime(entry.createdAt, now)
  ?? parseDateTime(entry.updatedAt, now)
);

const isWithinRecentDays = (entry: KeywordSourceEntry, now: Date, days: number): boolean => {
  const time = getEntryTime(entry, now);
  if (time === null) return false;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return time >= start.getTime() && time <= end.getTime();
};

const scoreKeyword = (keyword: ScoredKeywordEntry, now: Date, days: number): number => {
  const dayMs = 24 * 60 * 60 * 1000;
  const daysSinceLatest = Math.max(0, (now.getTime() - keyword.latestTime) / dayMs);
  const recencyScore = Math.max(0, 1 - daysSinceLatest / days) * 1.8;
  const coverageScore = keyword.diaryIndexes.size * 2.4;
  const frequencyScore = Math.log1p(keyword.totalCount) * 1.2;
  const chinesePhraseBonus = keyword.isChinesePhrase ? (keyword.text.length >= 3 ? 1.2 : 0.8) : 0;
  const englishPenalty = keyword.isEnglish ? 1.4 : 0;
  const privacyPenalty = keyword.isSensitiveLike && keyword.diaryIndexes.size < 2 ? 2 : 0;

  return frequencyScore + coverageScore + recencyScore + chinesePhraseBonus - englishPenalty - privacyPenalty;
};

export const getKeywordSourceText = (entry: KeywordSourceEntry): string => {
  const blockText = Array.isArray(entry.blocks)
    ? entry.blocks
      .map((block) => [block.title, block.content].filter(Boolean).join(' '))
      .join('\n')
    : '';

  return [entry.content || '', blockText].filter(Boolean).join('\n');
};

const extractLooseChineseKeywords = (content: string): NormalizedKeyword[] => {
  if (!content) return [];

  const cleaned = getCleanedContent(content);
  const keywords: NormalizedKeyword[] = [];
  const seen = new Set<string>();
  const addChineseWord = (word: string) => {
    const trimmed = word.trim();
    if (!trimmed || seen.has(trimmed) || STOP_WORDS.has(trimmed) || isSensitiveLikeKeywordText(trimmed)) return;
    const isSingleMeaningful = /^[\u4e00-\u9fa5]$/.test(trimmed) && MEANINGFUL_SINGLE_CHINESE_KEYWORDS.has(trimmed);
    const isPhrase = /^[\u4e00-\u9fa5]{2,}$/.test(trimmed);
    if (!isSingleMeaningful && !isPhrase) return;
    seen.add(trimmed);
    keywords.push({
      key: trimmed,
      text: trimmed,
      isEnglish: false,
      isChinesePhrase: isPhrase,
      isSensitiveLike: false,
    });
  };

  const segmentSource = cleaned.replace(/(?:账号|手机|电话|地址|身份证|微信|密码)[a-zA-Z0-9]{2,}/g, ' ');

  LOOSE_LIFE_THEME_KEYWORDS.forEach((word) => {
    if (segmentSource.includes(word)) addChineseWord(word);
  });

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    for (const { segment, isWordLike } of segmenter.segment(segmentSource)) {
      if (isWordLike) addChineseWord(segment);
    }
  } else {
    (segmentSource.match(/[\u4e00-\u9fa5]{1,4}/g) || []).forEach(addChineseWord);
  }

  return keywords;
};

const extractRecentLooseChineseKeywords = (
  entries: KeywordSourceEntry[],
  now: Date,
  days: number,
  limit: number,
): string[] => {
  const wordCounts = new Map<string, ScoredKeywordEntry>();
  let firstIndex = 0;

  entries.forEach((entry, diaryIndex) => {
    if (!isWithinRecentDays(entry, now, days)) return;

    const entryTime = getEntryTime(entry, now) ?? now.getTime();
    extractLooseChineseKeywords(getKeywordSourceText(entry)).forEach((keyword) => {
      const existing = wordCounts.get(keyword.key);
      if (existing) {
        existing.totalCount += 1;
        existing.diaryIndexes.add(diaryIndex);
        existing.latestTime = Math.max(existing.latestTime, entryTime);
        return;
      }

      wordCounts.set(keyword.key, {
        text: keyword.text,
        totalCount: 1,
        diaryIndexes: new Set([diaryIndex]),
        latestTime: entryTime,
        firstIndex: firstIndex++,
        isEnglish: false,
        isChinesePhrase: keyword.isChinesePhrase,
        isSensitiveLike: false,
      });
    });
  });

  return Array.from(wordCounts.values())
    .sort((a, b) => scoreKeyword(b, now, days) - scoreKeyword(a, now, days) || b.totalCount - a.totalCount || a.firstIndex - b.firstIndex)
    .slice(0, limit)
    .map(({ text }) => text);
};

export const extractRecentDiaryKeywords = (
  entries: KeywordSourceEntry[],
  options: { days?: number; limit?: number; now?: Date } = {},
): string[] => {
  const days = options.days ?? 90;
  const limit = options.limit ?? 14;
  const now = options.now ?? new Date();
  const wordCounts = new Map<string, ScoredKeywordEntry>();
  let firstIndex = 0;

  entries.forEach((entry, diaryIndex) => {
    if (!isWithinRecentDays(entry, now, days)) return;

    const entryTime = getEntryTime(entry, now) ?? now.getTime();
    extractNormalizedKeywords(getKeywordSourceText(entry)).forEach((keyword) => {
      const existing = wordCounts.get(keyword.key);
      if (existing) {
        existing.totalCount += 1;
        existing.diaryIndexes.add(diaryIndex);
        existing.latestTime = Math.max(existing.latestTime, entryTime);
        existing.isSensitiveLike = existing.isSensitiveLike || keyword.isSensitiveLike;
        return;
      }

      wordCounts.set(keyword.key, {
        text: keyword.text,
        totalCount: 1,
        diaryIndexes: new Set([diaryIndex]),
        latestTime: entryTime,
        firstIndex: firstIndex++,
        isEnglish: keyword.isEnglish,
        isChinesePhrase: keyword.isChinesePhrase,
        isSensitiveLike: keyword.isSensitiveLike,
      });
    });
  });

  const ranked = Array.from(wordCounts.values())
    .filter((keyword) => !keyword.isSensitiveLike)
    .sort((a, b) => scoreKeyword(b, now, days) - scoreKeyword(a, now, days) || b.totalCount - a.totalCount || a.firstIndex - b.firstIndex);
  const lifeThemeKeywords = ranked.filter((keyword) => !keyword.isEnglish);
  const englishKeywords = ranked.filter((keyword) => keyword.isEnglish && (keyword.diaryIndexes.size >= 2 || keyword.totalCount >= 3));
  const englishLimit = lifeThemeKeywords.length > 0 ? Math.min(2, Math.max(0, limit - lifeThemeKeywords.length)) : 0;

  const primaryKeywords = [...lifeThemeKeywords.slice(0, limit), ...englishKeywords.slice(0, englishLimit)]
    .slice(0, limit)
    .map(({ text }) => text);

  if (primaryKeywords.length > 0) return primaryKeywords;

  return extractRecentLooseChineseKeywords(entries, now, days, limit);
};
