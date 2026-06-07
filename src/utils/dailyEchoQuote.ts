export type ParsedDailyEchoContent = {
  quote: string;
  body: string;
  hasExplicitQuote: boolean;
};

const SENTENCE_END_PATTERN = /[。！？!?]/u;

function stripSimpleMarkup(value: string) {
  return (value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function trimQuote(value: string) {
  return value
    .replace(/^["'“”‘’「」『』\s]+|["'“”‘’「」『』\s]+$/g, '')
    .replace(/[。！？!?；;，,、\s]+$/g, '')
    .trim();
}

function visibleLength(value: string) {
  return Array.from(value.replace(/\s+/g, '')).length;
}

function compactQuote(value: string, minLength = 12, maxLength = 24) {
  const cleaned = trimQuote(value);
  if (!cleaned) return '';
  if (visibleLength(cleaned) <= maxLength) return cleaned;

  const fragments = cleaned
    .split(/[，,；;、。！？!?\n]/)
    .map(trimQuote)
    .filter(fragment => visibleLength(fragment) >= minLength && visibleLength(fragment) <= maxLength);
  if (fragments.length > 0) return fragments[0];

  const chars = Array.from(cleaned.replace(/\s+/g, ''));
  return trimQuote(chars.slice(0, maxLength).join(''));
}

export function buildDailyEchoQuoteFallback(body: string) {
  const cleaned = stripSimpleMarkup(body)
    .replace(/^用户可见回声\s*[:：]\s*/i, '')
    .replace(/^小象回声\s*[:：]\s*/i, '')
    .replace(/^(分析如下|回应如下|我会这样回应)\s*[:：]\s*/i, '')
    .trim();
  if (!cleaned) return '今天的你，值得被看见';

  const firstSentence = cleaned.split(SENTENCE_END_PATTERN)[0] || cleaned.split(/\n+/)[0] || cleaned;
  const preferred = compactQuote(firstSentence);
  if (preferred) return preferred;

  return compactQuote(cleaned) || '今天的你，值得被看见';
}

export function parseDailyEchoContent(value: string): ParsedDailyEchoContent {
  const source = stripSimpleMarkup(value);
  if (!source) {
    return {
      quote: '今天的你，值得被看见',
      body: '',
      hasExplicitQuote: false,
    };
  }

  const quoteMatch = source.match(/今日回声\s*[:：]\s*([^\n]+)/);
  const visibleMatch = source.match(/用户可见回声\s*[:：]\s*([\s\S]*)/);
  const rawBody = (visibleMatch?.[1] || source)
    .replace(/今日回声\s*[:：]\s*[^\n]+/g, '')
    .replace(/^小象回声\s*[:：]\s*/i, '')
    .replace(/^(分析如下|回应如下|我会这样回应)\s*[:：]\s*/i, '')
    .replace(/^用户可见回声\s*[:：]\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const explicitQuote = quoteMatch ? compactQuote(quoteMatch[1]) : '';
  return {
    quote: explicitQuote || buildDailyEchoQuoteFallback(rawBody),
    body: rawBody,
    hasExplicitQuote: Boolean(explicitQuote),
  };
}

export function serializeDailyEchoContent(quote: string, body: string) {
  const finalQuote = compactQuote(quote) || buildDailyEchoQuoteFallback(body);
  return `今日回声：${finalQuote}\n\n用户可见回声：${body.trim()}`;
}
