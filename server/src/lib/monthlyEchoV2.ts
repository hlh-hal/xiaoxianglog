import { createHash } from 'node:crypto';
import { hasUnsafeMonthlyEchoText, normalizeEvidenceText, sanitizeShortText } from './monthlyEchoUtils.js';

export const MONTHLY_ECHO_SCHEMA_VERSION = 2 as const;
export const MONTHLY_ECHO_FALLBACK_MESSAGE = '这个月的记录还不够，小象先不替你下结论。';

export const ACTION_ICON_HINTS = [
  'express', 'pause', 'organize', 'refuse', 'try', 'persist', 'adjust', 'restart',
  'askHelp', 'record', 'exercise', 'create', 'accompany', 'clean', 'repair', 'boundary', 'other',
] as const;

export type ActionIconHint = typeof ACTION_ICON_HINTS[number];
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

export type MonthlyArcPayloadV2 = {
  schemaVersion: 2;
  mainArc: EvidenceClaimV2 | null;
  keyMoments: KeyMomentV2[];
  actionTrace: ActionTraceV2[];
  emotionArc: EvidenceClaimV2 | null;
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
  const actions = objectArray(value.actions)
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
    .filter((item): item is DailyActionV2 => Boolean(item))
    .slice(0, 6);
  const smallChangeRaw = value.smallChange && typeof value.smallChange === 'object' && !Array.isArray(value.smallChange)
    ? value.smallChange as Record<string, unknown>
    : null;

  return {
    schemaVersion: MONTHLY_ECHO_SCHEMA_VERSION,
    date,
    importantEvents: dailyClaims(value.importantEvents, lookup, 3, 90),
    emotionTone: dailyClaims(value.emotionTone, lookup, 4, 60),
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
        lead: sanitizeShortText(recurringRaw.lead, 110),
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
    emotionArc: claimFromArc(emotionRaw, registry, 140),
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
  const overviewState = arc.mainArc && arc.recurringPattern ? 'ready' : arc.mainArc || arc.recurringPattern ? 'partial' : 'fallback';
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
        ...pageFallback(overviewState),
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
