import { createHash } from 'node:crypto';
import { hasUnsafeMonthlyEchoText, normalizeEvidenceText, sanitizeShortText } from './monthlyEchoUtils.js';

export const MONTHLY_ECHO_SCHEMA_VERSION = 2 as const;
export const MONTHLY_ECHO_FALLBACK_MESSAGE = '这个月的记录还不够，小象先不替你下结论。';

export const ACTION_ICON_HINTS = [
  'express', 'pause', 'organize', 'refuse', 'try', 'persist', 'adjust', 'restart',
  'askHelp', 'record', 'exercise', 'create', 'accompany', 'clean', 'repair', 'boundary', 'other',
] as const;
export const EMOTION_PATTERNS = [
  'stable_positive', 'stable_low', 'stable_neutral', 'improving',
  'declining', 'fluctuating', 'mixed', 'unclear',
] as const;
export const MONTHLY_EMOTION_EMPTY_MESSAGE = '这个月更多是事件记录，情绪没有明显浮出';

export type ActionIconHint = typeof ACTION_ICON_HINTS[number];
export type EmotionPattern = typeof EMOTION_PATTERNS[number];
export type ContentState = 'ready' | 'partial' | 'fallback';

export type EvidenceQuoteV2 = {
  id: string;
  entryId: string;
  date: string;
  quote: string;
};

export type EvidenceClaimV2 = {
  text: string;
  evidenceIds: string[];
};

export type DailyActionV2 = EvidenceClaimV2 & {
  action: string;
  scene: string;
  iconHint: ActionIconHint;
};

export type DailyTracePayloadV2 = {
  schemaVersion: 2;
  date: string;
  importantEvents: EvidenceClaimV2[];
  emotionTone: EvidenceClaimV2[];
  actions: DailyActionV2[];
  conflicts: EvidenceClaimV2[];
  relationships: EvidenceClaimV2[];
  smallChange: EvidenceClaimV2 | null;
  unfinishedQuestions: EvidenceClaimV2[];
  evidenceQuotes: EvidenceQuoteV2[];
  confidence: number;
};

export type KeyMomentV2 = EvidenceClaimV2 & {
  date: string;
  title: string;
  event: string;
  meaning: string;
  evidence: string;
};

export type ActionTraceV2 = EvidenceClaimV2 & {
  date: string;
  action: string;
  scene: string;
  meaning: string;
  evidence: string;
  iconHint: ActionIconHint;
};

export type SideThemeV2 = EvidenceClaimV2 & {
  date: string;
  title: string;
  scene: string;
  meaning: string;
  evidence: string;
};

export type RecurringOccurrenceV2 = EvidenceClaimV2 & {
  date: string;
  scene: string;
  evidence: string;
};

export type MonthlyEmotionV2 = EvidenceClaimV2 & {
  emotion: string;
  dates: string[];
  evidence: string;
  event: string;
  eventEvidence: string;
  eventEvidenceIds: string[];
  meaning: string;
};

export type MonthlyArcPayloadV2 = {
  schemaVersion: 2;
  mainArc: EvidenceClaimV2 | null;
  keyMoments: KeyMomentV2[];
  actionTrace: ActionTraceV2[];
  emotionArc: EvidenceClaimV2 | null;
  emotionPattern?: EmotionPattern;
  emotions?: MonthlyEmotionV2[];
  recurringPattern: {
    lead: string;
    question: string;
    occurrences: RecurringOccurrenceV2[];
    evolvedQuestion: string;
    evolvedQuestionEvidenceIds: string[];
    evolvedDate: string;
    conclusion: string;
    evidenceIds: string[];
  } | null;
  sideThemes: SideThemeV2[];
  growthDirection: EvidenceClaimV2 | null;
  finalInsight: EvidenceClaimV2 | null;
  letter: Array<EvidenceClaimV2>;
  confidence: number;
};

type PageBase = { contentState: ContentState; fallbackMessage?: string };

export type MonthlyEchoRenderPayloadV2 = {
  schemaVersion: 2;
  monthKey: string;
  pages: {
    entrance: { month: string; monthEn: string; diaryCount: number } & PageBase;
    overview: {
      emotionArc: string;
      emotionPattern: EmotionPattern;
      emotions: MonthlyEmotionV2[];
      fallback: boolean;
      initialQuestion: string;
      occurrences: RecurringOccurrenceV2[];
      evolvedQuestion: string;
      mainArc: string;
      conclusion: string;
    } & PageBase;
    map: { mainArc: string; sideThemes: SideThemeV2[]; summary: string } & PageBase;
    moments: { items: KeyMomentV2[]; summary: string } & PageBase;
    actions: { items: ActionTraceV2[]; summary: string } & PageBase;
    recurring: {
      lead: string;
      question: string;
      occurrences: RecurringOccurrenceV2[];
      evolvedQuestion: string;
      turnDate: string;
      conclusion: string;
    } & PageBase;
    letter: { salutation: string; paragraphs: string[]; finalInsight: string; signature: string } & PageBase;
  };
};

type EvidenceRegistry = Map<string, EvidenceQuoteV2>;

function confidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.4;
  return Math.max(0, Math.min(1, parsed));
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown, maxItems: number, maxLength = 80): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => sanitizeShortText(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

function evidenceId(entryId: string, date: string, quote: string): string {
  return `ev_${createHash('sha256').update(`${entryId}\n${date}\n${quote}`).digest('hex').slice(0, 16)}`;
}

function exactQuotes(value: unknown, sourceText: string, entryId: string, date: string): EvidenceQuoteV2[] {
  const normalizedSource = normalizeEvidenceText(sourceText);
  return stringArray(value, 6, 100)
    .filter(quote => {
      const normalized = normalizeEvidenceText(quote);
      return normalized.length >= 2 && normalizedSource.includes(normalized) && !hasUnsafeMonthlyEchoText(quote);
    })
    .map(quote => ({ id: evidenceId(entryId, date, quote), entryId, date, quote }));
}

function evidenceLookup(quotes: EvidenceQuoteV2[]): Map<string, string> {
  return new Map(quotes.map(item => [normalizeEvidenceText(item.quote), item.id]));
}

function claimFromDaily(raw: Record<string, unknown>, lookup: Map<string, string>, maxLength: number): EvidenceClaimV2 | null {
  const text = sanitizeShortText(raw.text ?? raw.event ?? raw.question, maxLength);
  const ids = stringArray(raw.evidenceQuotes, 3, 100)
    .map(quote => lookup.get(normalizeEvidenceText(quote)))
    .filter((id): id is string => Boolean(id));
  if (!text || ids.length === 0 || hasUnsafeMonthlyEchoText(text)) return null;
  return { text, evidenceIds: Array.from(new Set(ids)) };
}

function dailyClaims(value: unknown, lookup: Map<string, string>, maxItems: number, maxLength: number): EvidenceClaimV2[] {
  return objectArray(value)
    .map(item => claimFromDaily(item, lookup, maxLength))
    .filter((item): item is EvidenceClaimV2 => Boolean(item))
    .slice(0, maxItems);
}

function normalizeIconHint(value: unknown): ActionIconHint {
  const hint = String(value || 'other') as ActionIconHint;
  return ACTION_ICON_HINTS.includes(hint) ? hint : 'other';
}

const ACTION_PATTERN = /(?:写|记录|停|休息|表达|告诉|沟通|打(?:了)?电话|发(?:了)?消息|回复|整理|规划|拒绝|尝试|坚持|调整|重新开始|求助|联系|运动|跑|走|散步|创作|画|陪伴|清理|修复|建立|完成|开始|继续|做|去|读|学习|练习|没有责怪|放慢)/;
const EMOTION_ONLY_PATTERN = /^(?:难过|开心|焦虑|害怕|担心|疲惫|累|失望|委屈|愤怒|平静|孤独|迷茫|紧张|兴奋|压抑|烦躁)[了。！!？?]*$/;

const ADDITIONAL_ACTION_PATTERN = /(?:处理|协商|复习|推进|安排|准备|确认|提交|修改|删除|关闭|打开|制定|拆分|检查|观察|收拾|申请|分享|约|制作|搭建|搜索|查找|观看|照顾)/;

export function isObservableAction(value: string): boolean {
  const text = sanitizeShortText(value, 80);
  return Boolean(text)
    && (ACTION_PATTERN.test(text) || ADDITIONAL_ACTION_PATTERN.test(text))
    && !EMOTION_ONLY_PATTERN.test(text);
}

export function normalizeDailyTraceV2(
  value: Record<string, unknown>,
  sourceText: string,
  entryId: string,
  date: string,
): DailyTracePayloadV2 {
  const quotes = exactQuotes(value.evidenceQuotes, sourceText, entryId, date);
  const lookup = evidenceLookup(quotes);
  const importantEvents = dailyClaims(value.importantEvents, lookup, 3, 90);
  const explicitActions = objectArray(value.actions)
    .map(item => {
      const claim = claimFromDaily({ text: item.action, evidenceQuotes: item.evidenceQuotes }, lookup, 50);
      const action = sanitizeShortText(item.action, 32);
      if (!claim || !isObservableAction(action)) return null;
      return {
        ...claim,
        action,
        scene: sanitizeShortText(item.scene, 70),
        iconHint: normalizeIconHint(item.iconHint),
      };
    })
    .filter((item): item is DailyActionV2 => Boolean(item));
  const actions = mergeDailyActions(explicitActions, actionsFromImportantEvents(importantEvents, quotes)).slice(0, 6);
  const emotionTone = mergeEvidenceClaims(
    dailyClaims(value.emotionTone, lookup, 4, 60),
    emotionClaimsFromEvidence(quotes),
  ).slice(0, 4);
  const smallChangeRaw = value.smallChange && typeof value.smallChange === 'object' && !Array.isArray(value.smallChange)
    ? value.smallChange as Record<string, unknown>
    : null;

  return {
    schemaVersion: MONTHLY_ECHO_SCHEMA_VERSION,
    date,
    importantEvents,
    emotionTone,
    actions,
    conflicts: dailyClaims(value.conflicts, lookup, 4, 90),
    relationships: dailyClaims(value.relationships, lookup, 4, 90),
    smallChange: smallChangeRaw ? claimFromDaily(smallChangeRaw, lookup, 90) : null,
    unfinishedQuestions: dailyClaims(value.unfinishedQuestions, lookup, 4, 100),
    evidenceQuotes: quotes,
    confidence: confidence(value.confidence),
  };
}

export function evidenceRegistryFromTraces(traces: DailyTracePayloadV2[]): EvidenceRegistry {
  return new Map(traces.flatMap(trace => trace.evidenceQuotes).map(item => [item.id, item]));
}

function validEvidenceIds(value: unknown, registry: EvidenceRegistry, max = 4): string[] {
  return stringArray(value, max, 80).filter(id => registry.has(id));
}

function claimFromArc(raw: Record<string, unknown>, registry: EvidenceRegistry, maxLength: number): EvidenceClaimV2 | null {
  const text = sanitizeShortText(raw.text ?? raw.summary ?? raw.insight, maxLength);
  const evidenceIds = validEvidenceIds(raw.evidenceIds, registry);
  if (!text || evidenceIds.length === 0 || hasUnsafeMonthlyEchoText(text)) return null;
  return { text, evidenceIds };
}

function resolveEvidence(ids: string[], registry: EvidenceRegistry): EvidenceQuoteV2 | null {
  return ids.map(id => registry.get(id)).find((item): item is EvidenceQuoteV2 => Boolean(item)) || null;
}

const EMOTION_LABEL_PATTERN = /(?:开心|快乐|期待|兴奋|满足|安心|平静|轻松|松一口气|疲惫|疲倦|累|焦虑|担心|不安|紧张|难过|低落|失落|沮丧|孤独|愤怒|生气|委屈|害怕|恐惧|压抑|烦躁|迷茫|混乱|心乱|迟疑|犹豫|遗憾|感动|温暖|释然|无聊|麻木|羞愧|内疚|嫉妒|羡慕|挫败|无力|踏实|笃定|惊喜|想念|在意)/;
const EMOTION_GROUPS: Array<[RegExp, string]> = [
  [/(?:疲惫|疲倦|累|无力)/, 'fatigue'],
  [/(?:焦虑|担心|不安|紧张)/, 'anxiety'],
  [/(?:难过|低落|失落|沮丧|压抑)/, 'low'],
  [/(?:愤怒|生气|烦躁)/, 'anger'],
  [/(?:害怕|恐惧)/, 'fear'],
  [/(?:迟疑|犹豫|迷茫|混乱|心乱)/, 'uncertainty'],
  [/(?:开心|快乐|兴奋|惊喜)/, 'joy'],
  [/(?:安心|平静|轻松|松一口气|踏实|笃定|释然)/, 'calm'],
  [/(?:期待|在意|想念|温暖|感动)/, 'connection'],
];

function normalizeEmotionLabel(value: unknown): string {
  const label = sanitizeShortText(value, 8);
  return /^(?:(?:心里|心中|感觉|感到|觉得|还是)?(?:有点|有些|很)?)?乱[了。！!？?]*$/.test(label)
    ? '混乱'
    : label;
}

const EXPLICIT_EMOTION_EVIDENCE: Array<[RegExp, string]> = [
  [/(?:有点|有些|心里|心中|感觉|感到|觉得|还是)乱/, '混乱'],
  [/(?:疲惫|疲倦|(?:真的|感觉|感到|觉得|很|好|有点|有些)累)/, '疲惫'],
  [/(?:焦虑|担心|不安|紧张|难过|低落|失落|沮丧|孤独|愤怒|生气|委屈|害怕|恐惧|压抑|烦躁|迷茫|迟疑|犹豫|遗憾|感动|温暖|释然|无聊|麻木|羞愧|内疚|嫉妒|羡慕|挫败|无力|踏实|笃定|惊喜|想念|在意|期待|兴奋|满足|安心|平静|轻松|开心|快乐)/, ''],
  [/松一口气/, '轻松'],
];

function emotionClaimsFromEvidence(quotes: EvidenceQuoteV2[]): EvidenceClaimV2[] {
  return quotes.flatMap(quote => {
    for (const [pattern, canonical] of EXPLICIT_EMOTION_EVIDENCE) {
      const match = pattern.exec(quote.quote);
      if (!match) continue;
      const before = quote.quote.slice(Math.max(0, match.index - 4), match.index);
      if (/(?:不|没|没有|并不|不再)$/.test(before)) continue;
      const text = normalizeEmotionLabel(canonical || match[0]);
      if (isExplicitEmotionLabel(text)) return [{ text, evidenceIds: [quote.id] }];
    }
    return [];
  });
}

function mergeEvidenceClaims(primary: EvidenceClaimV2[], fallback: EvidenceClaimV2[]): EvidenceClaimV2[] {
  const seenEvidence = new Set<string>();
  return [...primary, ...fallback].filter(item => {
    const key = item.evidenceIds[0];
    if (!key || seenEvidence.has(key)) return false;
    seenEvidence.add(key);
    return true;
  });
}

const THIRD_PARTY_ACTION_PATTERN = /^(?:朋友|同事|老师|导师|领导|对方|家人|父母|妈妈|爸爸|他|她|他们|她们|客户|医生|室友)(?:说|问|回复|告诉|指出|建议|要求|邀请|帮助|提醒|决定|安排)/;

function inferActionIcon(action: string): ActionIconHint {
  if (/(?:清理|收拾|删除)/.test(action)) return 'clean';
  if (/(?:整理|规划|安排|记录|写)/.test(action)) return 'organize';
  if (/(?:拒绝|边界)/.test(action)) return 'boundary';
  if (/(?:散步|走|跑|运动|拉伸)/.test(action)) return 'exercise';
  if (/(?:求助|请.*帮)/.test(action)) return 'askHelp';
  if (/(?:表达|告诉|沟通|回复)/.test(action)) return 'express';
  if (/(?:暂停|休息|停下|合上)/.test(action)) return 'pause';
  return 'other';
}

function actionsFromImportantEvents(events: EvidenceClaimV2[], quotes: EvidenceQuoteV2[]): DailyActionV2[] {
  const registry = new Map(quotes.map(item => [item.id, item]));
  return events.flatMap(event => {
    const action = sanitizeShortText(event.text, 32);
    const evidence = event.evidenceIds.map(id => registry.get(id)).find((item): item is EvidenceQuoteV2 => Boolean(item));
    if (!action || !evidence || !isObservableAction(action) || THIRD_PARTY_ACTION_PATTERN.test(action)) return [];
    return [{
      text: action,
      evidenceIds: event.evidenceIds,
      action,
      scene: sanitizeShortText(evidence.quote, 70),
      iconHint: inferActionIcon(action),
    }];
  });
}

function mergeDailyActions(primary: DailyActionV2[], fallback: DailyActionV2[]): DailyActionV2[] {
  const seenEvidence = new Set<string>();
  return [...primary, ...fallback].filter(item => {
    const key = item.evidenceIds[0];
    if (!key || seenEvidence.has(key)) return false;
    seenEvidence.add(key);
    return true;
  });
}

export function isExplicitEmotionLabel(value: string): boolean {
  const label = normalizeEmotionLabel(value);
  return Boolean(label) && EMOTION_LABEL_PATTERN.test(label) && !hasUnsafeMonthlyEchoText(label);
}

function emotionGroup(label: string): string {
  return EMOTION_GROUPS.find(([pattern]) => pattern.test(label))?.[1] || normalizeEvidenceText(label);
}

function normalizeEmotionPattern(value: unknown, emotions: MonthlyEmotionV2[]): EmotionPattern {
  const pattern = EMOTION_PATTERNS.includes(value as EmotionPattern) ? value as EmotionPattern : 'unclear';
  if (emotions.length === 0) return 'unclear';
  if (['improving', 'declining', 'fluctuating'].includes(pattern)) {
    const distinctDates = new Set(emotions.flatMap(item => item.dates));
    if (distinctDates.size < 3) return 'unclear';
  }
  return pattern;
}

function eventContextForEmotion(
  evidenceIds: string[],
  registry: EvidenceRegistry,
  traces: DailyTracePayloadV2[],
): Pick<MonthlyEmotionV2, 'event' | 'eventEvidence' | 'eventEvidenceIds'> {
  const emotionEvidence = evidenceIds.map(id => registry.get(id)).filter((item): item is EvidenceQuoteV2 => Boolean(item));
  const entryIds = new Set(emotionEvidence.map(item => item.entryId));
  const emotionIdSet = new Set(evidenceIds);
  const candidates = traces.flatMap(trace => {
    const claims = [
      ...trace.importantEvents.map(item => ({ text: item.text, evidenceIds: item.evidenceIds, priority: 0 })),
      ...trace.actions.map(item => ({ text: item.scene || item.action, evidenceIds: item.evidenceIds, priority: 1 })),
      ...trace.conflicts.map(item => ({ text: item.text, evidenceIds: item.evidenceIds, priority: 2 })),
      ...trace.relationships.map(item => ({ text: item.text, evidenceIds: item.evidenceIds, priority: 3 })),
      ...(trace.smallChange ? [{ text: trace.smallChange.text, evidenceIds: trace.smallChange.evidenceIds, priority: 4 }] : []),
    ];
    return claims.map((claim, claimIndex) => {
    const eventEvidenceIds = validEvidenceIds(claim.evidenceIds, registry, 3);
    const eventEvidence = resolveEvidence(eventEvidenceIds, registry);
    const event = sanitizeShortText(claim.text, 40);
    if (!event || !eventEvidence || !entryIds.has(eventEvidence.entryId) || hasUnsafeMonthlyEchoText(event)) return null;
    return {
      event,
      eventEvidence: eventEvidence.quote,
      eventEvidenceIds,
      isDistinctEvidence: eventEvidenceIds.some(id => !emotionIdSet.has(id)),
      date: eventEvidence.date,
      priority: claim.priority,
      claimIndex,
    };
    });
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => Number(b.isDistinctEvidence) - Number(a.isDistinctEvidence)
      || a.priority - b.priority
      || a.date.localeCompare(b.date)
      || a.claimIndex - b.claimIndex);
  const event = candidates[0];
  return event
    ? { event: event.event, eventEvidence: event.eventEvidence, eventEvidenceIds: event.eventEvidenceIds }
    : { event: '', eventEvidence: '', eventEvidenceIds: [] };
}

function normalizeMonthlyEmotions(
  value: unknown,
  registry: EvidenceRegistry,
  traces: DailyTracePayloadV2[],
): MonthlyEmotionV2[] {
  const seenEvidence = new Set<string>();
  const seenGroups = new Set<string>();
  const traceCandidates = traces.flatMap(trace => trace.emotionTone.map(item => ({
    emotion: item.text,
    meaning: '这份感受在这一天被明确写了下来。',
    evidenceIds: item.evidenceIds,
  })));
  return [...objectArray(value), ...traceCandidates].map(item => {
    const emotion = normalizeEmotionLabel(item.emotion);
    const meaning = sanitizeShortText(item.meaning, 40);
    if (!isExplicitEmotionLabel(emotion) || !meaning || hasUnsafeMonthlyEchoText(meaning)) return null;
    const group = emotionGroup(emotion);
    if (seenGroups.has(group)) return null;
    const evidenceIds = validEvidenceIds(item.evidenceIds, registry, 3).filter(id => !seenEvidence.has(id));
    const evidences = evidenceIds
      .map(id => registry.get(id))
      .filter((entry): entry is EvidenceQuoteV2 => Boolean(entry))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (evidences.length === 0) return null;
    evidenceIds.forEach(id => seenEvidence.add(id));
    seenGroups.add(group);
    const eventContext = eventContextForEmotion(evidenceIds, registry, traces);
    return {
      text: emotion,
      evidenceIds,
      emotion,
      dates: Array.from(new Set(evidences.map(entry => entry.date))),
      evidence: evidences[0].quote,
      ...eventContext,
      meaning,
    };
  }).filter((item): item is MonthlyEmotionV2 => Boolean(item))
    .sort((a, b) => (a.dates[0] || '').localeCompare(b.dates[0] || ''))
    .slice(0, 5);
}

function actionTraceFromDaily(
  traces: DailyTracePayloadV2[],
  registry: EvidenceRegistry,
): ActionTraceV2[] {
  return traces.flatMap(trace => trace.actions.map(item => {
    const action = sanitizeShortText(item.action, 32);
    const evidenceIds = validEvidenceIds(item.evidenceIds, registry);
    const evidence = resolveEvidence(evidenceIds, registry);
    if (!action || !evidence || !isObservableAction(action)) return null;
    return {
      text: action,
      evidenceIds,
      date: evidence.date,
      action,
      scene: sanitizeShortText(item.scene, 70),
      meaning: sanitizeShortText(item.text || action, 80),
      evidence: evidence.quote,
      iconHint: normalizeIconHint(item.iconHint),
    };
  })).filter((item): item is ActionTraceV2 => Boolean(item));
}

function mergeActionTrace(primary: ActionTraceV2[], fallback: ActionTraceV2[]): ActionTraceV2[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter(item => {
    const key = item.evidenceIds[0] || `${item.date}:${normalizeEvidenceText(item.action)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRecurringLead(value: unknown, occurrences: RecurringOccurrenceV2[]): string {
  const lead = sanitizeShortText(value, 110);
  const context = /^当你(.+?)时(?:[，,].*)?$/.exec(lead)?.[1] || '';
  const hasPlaceholder = /(?:…{2,}|\.{3,}|某件事|一些事情|某种情况|某些时候)/.test(context);
  if (context.length >= 2 && !hasPlaceholder) return lead;

  const source = sanitizeShortText(occurrences[0]?.scene || occurrences[0]?.evidence, 70)
    .replace(/^当你/, '')
    .replace(/^你(?:在)?/, '')
    .replace(/^在/, '');
  const beforeWhen = /^(.{2,36}?)时(?:[，,。.!！?？]|$)/.exec(source)?.[1];
  const condition = sanitizeShortText(beforeWhen || source.split(/[，,。.!！?？；;]/)[0], 36)
    .replace(/[，,。.!！?？；;：:]+$/, '');
  return condition ? `当你${condition}时，你会很快开始问：` : '';
}

export function normalizeMonthlyArcV2(
  value: Record<string, unknown>,
  registry: EvidenceRegistry,
  traces: DailyTracePayloadV2[] = [],
): MonthlyArcPayloadV2 {
  const mainArcRaw = value.mainArc && typeof value.mainArc === 'object' ? value.mainArc as Record<string, unknown> : {};
  const keyMoments = objectArray(value.keyMoments).map(item => {
    const claim = claimFromArc({ text: item.event, evidenceIds: item.evidenceIds }, registry, 100);
    const evidence = claim ? resolveEvidence(claim.evidenceIds, registry) : null;
    if (!claim || !evidence) return null;
    return {
      ...claim,
      date: evidence.date,
      title: sanitizeShortText(item.title, 32),
      event: sanitizeShortText(item.event, 90),
      meaning: sanitizeShortText(item.meaning, 100),
      evidence: evidence.quote,
    };
  }).filter((item): item is KeyMomentV2 => Boolean(item)).slice(0, 3);
  const normalizedActionTrace = objectArray(value.actionTrace).map(item => {
    const action = sanitizeShortText(item.action, 32);
    const claim = claimFromArc({ text: action, evidenceIds: item.evidenceIds }, registry, 40);
    const evidence = claim ? resolveEvidence(claim.evidenceIds, registry) : null;
    if (!claim || !evidence || !isObservableAction(action)) return null;
    return {
      ...claim,
      date: evidence.date,
      action,
      scene: sanitizeShortText(item.scene, 70),
      meaning: sanitizeShortText(item.meaning, 80),
      evidence: evidence.quote,
      iconHint: normalizeIconHint(item.iconHint),
    };
  }).filter((item): item is ActionTraceV2 => Boolean(item));
  const actionTrace = mergeActionTrace(
    normalizedActionTrace,
    actionTraceFromDaily(traces, registry),
  ).slice(0, 6);
  const sideThemes = objectArray(value.sideThemes).map(item => {
    const claim = claimFromArc({ text: item.title, evidenceIds: item.evidenceIds }, registry, 40);
    const evidence = claim ? resolveEvidence(claim.evidenceIds, registry) : null;
    if (!claim || !evidence) return null;
    return {
      ...claim,
      date: evidence.date,
      title: sanitizeShortText(item.title, 16),
      scene: sanitizeShortText(item.scene, 70),
      meaning: sanitizeShortText(item.meaning, 80),
      evidence: evidence.quote,
    };
  }).filter((item): item is SideThemeV2 => Boolean(item)).slice(0, 3);
  const recurringRaw = value.recurringPattern && typeof value.recurringPattern === 'object'
    ? value.recurringPattern as Record<string, unknown>
    : null;
  const occurrences = recurringRaw ? objectArray(recurringRaw.occurrences).map(item => {
    const evidenceIds = validEvidenceIds(item.evidenceIds, registry, 2);
    const evidence = resolveEvidence(evidenceIds, registry);
    const scene = sanitizeShortText(item.scene, 70);
    return evidence && scene ? { text: scene, evidenceIds, date: evidence.date, scene, evidence: evidence.quote } : null;
  }).filter((item): item is RecurringOccurrenceV2 => Boolean(item)).slice(0, 3) : [];
  const recurringEvidenceIds = recurringRaw ? validEvidenceIds(recurringRaw.evidenceIds, registry, 6) : [];
  const evolvedQuestionRaw = recurringRaw?.evolvedQuestion && typeof recurringRaw.evolvedQuestion === 'object'
    ? recurringRaw.evolvedQuestion as Record<string, unknown>
    : null;
  const evolvedQuestionClaim = evolvedQuestionRaw
    ? claimFromArc(evolvedQuestionRaw, registry, 80)
    : null;
  const evolvedQuestion = evolvedQuestionClaim?.text
    || (typeof recurringRaw?.evolvedQuestion === 'string'
      ? sanitizeShortText(recurringRaw.evolvedQuestion, 80)
      : '');
  const evolvedQuestionEvidence = evolvedQuestionClaim
    ? resolveEvidence(evolvedQuestionClaim.evidenceIds, registry)
    : null;
  const recurringPattern = recurringRaw && recurringEvidenceIds.length > 0
    ? {
        lead: normalizeRecurringLead(recurringRaw.lead, occurrences),
        question: sanitizeShortText(recurringRaw.question, 48),
        occurrences,
        evolvedQuestion,
        evolvedQuestionEvidenceIds: evolvedQuestionClaim?.evidenceIds || [],
        evolvedDate: evolvedQuestionEvidence?.date || '',
        conclusion: sanitizeShortText(recurringRaw.conclusion, 90),
        evidenceIds: recurringEvidenceIds,
      }
    : null;
  const emotionRaw = value.emotionArc && typeof value.emotionArc === 'object' ? value.emotionArc as Record<string, unknown> : {};
  const emotions = normalizeMonthlyEmotions(value.emotions, registry, traces);
  const legacyEmotionArc = claimFromArc(emotionRaw, registry, 140) || (emotions.length > 0
    ? {
        text: `这个月浮现过${emotions.map(item => item.emotion).join('、')}`,
        evidenceIds: Array.from(new Set(emotions.flatMap(item => item.evidenceIds))),
      }
    : null);
  const growthRaw = value.growthDirection && typeof value.growthDirection === 'object' ? value.growthDirection as Record<string, unknown> : {};
  const insightRaw = value.finalInsight && typeof value.finalInsight === 'object' ? value.finalInsight as Record<string, unknown> : {};
  const letter = objectArray(value.letter)
    .map(item => claimFromArc(item, registry, 120))
    .filter((item): item is EvidenceClaimV2 => Boolean(item))
    .slice(0, 7);

  return {
    schemaVersion: MONTHLY_ECHO_SCHEMA_VERSION,
    mainArc: claimFromArc(mainArcRaw, registry, 160),
    keyMoments,
    actionTrace,
    emotionArc: legacyEmotionArc,
    emotionPattern: normalizeEmotionPattern(value.emotionPattern, emotions),
    emotions,
    recurringPattern,
    sideThemes,
    growthDirection: claimFromArc(growthRaw, registry, 130),
    finalInsight: claimFromArc(insightRaw, registry, 100),
    letter,
    confidence: confidence(value.confidence),
  };
}

function state(count: number, readyAt: number): ContentState {
  if (count === 0) return 'fallback';
  return count >= readyAt ? 'ready' : 'partial';
}

function pageFallback(contentState: ContentState): Pick<PageBase, 'fallbackMessage'> {
  return contentState === 'ready' ? {} : { fallbackMessage: MONTHLY_ECHO_FALLBACK_MESSAGE };
}

const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHINESE_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

export function compileMonthlyEchoReport(
  monthKey: string,
  diaryCount: number,
  arc: MonthlyArcPayloadV2,
): MonthlyEchoRenderPayloadV2 {
  const monthIndex = Math.max(0, Math.min(11, Number(monthKey.slice(5, 7)) - 1));
  const emotions = arc.emotions || [];
  const overviewState = emotions.length === 0 ? 'fallback' : emotions.length >= 3 ? 'ready' : 'partial';
  const mapState = state(arc.sideThemes.length, 2);
  const momentsState = state(arc.keyMoments.length, 3);
  const actionsState = state(arc.actionTrace.length, 4);
  const recurringState = arc.recurringPattern
    && arc.recurringPattern.occurrences.length >= 2
    && Boolean(arc.recurringPattern.evolvedQuestion)
    && Boolean(arc.recurringPattern.evolvedDate)
    ? 'ready'
    : arc.recurringPattern ? 'partial' : 'fallback';
  const letterState = state(arc.letter.length, 6);
  const recurring = arc.recurringPattern;

  return {
    schemaVersion: MONTHLY_ECHO_SCHEMA_VERSION,
    monthKey,
    pages: {
      entrance: { contentState: 'ready', month: CHINESE_MONTHS[monthIndex], monthEn: ENGLISH_MONTHS[monthIndex], diaryCount },
      overview: {
        contentState: overviewState,
        ...(overviewState === 'fallback'
          ? { fallbackMessage: MONTHLY_EMOTION_EMPTY_MESSAGE }
          : pageFallback(overviewState)),
        emotionArc: arc.emotionArc?.text || '',
        emotionPattern: arc.emotionPattern || 'unclear',
        emotions,
        fallback: emotions.length === 0,
        // 旧字段继续随 schema v2 返回，避免破坏已接入的客户端；第二页不再渲染这些反复主题数据。
        initialQuestion: recurring?.question || '',
        occurrences: recurring?.occurrences || [],
        evolvedQuestion: recurring?.evolvedQuestion || '',
        mainArc: arc.mainArc?.text || '',
        conclusion: arc.growthDirection?.text || arc.finalInsight?.text || '',
      },
      map: {
        contentState: mapState,
        ...pageFallback(mapState),
        mainArc: arc.mainArc?.text || '',
        sideThemes: arc.sideThemes,
        summary: arc.growthDirection?.text || arc.finalInsight?.text || '',
      },
      moments: {
        contentState: momentsState,
        ...pageFallback(momentsState),
        items: arc.keyMoments,
        summary: arc.growthDirection?.text || arc.finalInsight?.text || '',
      },
      actions: {
        contentState: actionsState,
        ...pageFallback(actionsState),
        items: arc.actionTrace,
        summary: arc.finalInsight?.text || arc.growthDirection?.text || '',
      },
      recurring: {
        contentState: recurringState,
        ...pageFallback(recurringState),
        lead: recurring?.lead || '',
        question: recurring?.question || '',
        occurrences: recurring?.occurrences || [],
        evolvedQuestion: recurring?.evolvedQuestion || '',
        turnDate: recurring?.evolvedDate || '',
        conclusion: recurring?.conclusion || arc.growthDirection?.text || '',
      },
      letter: {
        contentState: letterState,
        ...pageFallback(letterState),
        salutation: '',
        paragraphs: arc.letter.map(item => item.text),
        finalInsight: arc.finalInsight?.text || '',
        signature: '爱你的小象',
      },
    },
  };
}

export function injectCurrentNickname(report: MonthlyEchoRenderPayloadV2, nickname: string): MonthlyEchoRenderPayloadV2 {
  const safeNickname = sanitizeShortText(nickname, 16) || '自己';
  return {
    ...report,
    pages: {
      ...report.pages,
      letter: { ...report.pages.letter, salutation: `亲爱的${safeNickname}：` },
    },
  };
}

export function isMonthlyEchoReportV2(value: unknown): value is MonthlyEchoRenderPayloadV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return report.schemaVersion === MONTHLY_ECHO_SCHEMA_VERSION && Boolean(report.pages);
}
