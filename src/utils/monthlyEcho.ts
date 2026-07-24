export type MonthlyEchoStatus = 'disabled' | 'empty' | 'generating' | 'ready' | 'pushed' | 'stale' | 'failed';

export type MonthlyEchoContentState = 'ready' | 'partial' | 'fallback';
export type MonthlyEchoEmotionPattern = 'stable_positive' | 'stable_low' | 'stable_neutral' | 'improving' | 'declining' | 'fluctuating' | 'mixed' | 'unclear';
export type MonthlyEchoIconHint = 'express' | 'pause' | 'organize' | 'refuse' | 'try' | 'persist' | 'adjust' | 'restart' | 'askHelp' | 'record' | 'exercise' | 'create' | 'accompany' | 'clean' | 'repair' | 'boundary' | 'other';
export type MonthlyEchoOccurrence = { date: string; scene: string; evidence: string; text: string; evidenceIds: string[] };
export type MonthlyEchoMoment = { date: string; title: string; event: string; meaning: string; evidence: string; text: string; evidenceIds: string[] };
export type MonthlyEchoAction = { date: string; action: string; scene: string; meaning: string; evidence: string; iconHint: MonthlyEchoIconHint; text: string; evidenceIds: string[] };
export type MonthlyEchoSideTheme = { date: string; title: string; scene: string; meaning: string; evidence: string; text: string; evidenceIds: string[] };
export type MonthlyEchoEmotion = { emotion: string; dates: string[]; evidence: string; event?: string; eventEvidence?: string; eventEvidenceIds?: string[]; meaning: string; text: string; evidenceIds: string[] };
export type MonthlyEchoPageBase = { contentState: MonthlyEchoContentState; fallbackMessage?: string };

export type MonthlyEchoRenderPayload = {
  schemaVersion: 2;
  monthKey: string;
  pages: {
    entrance: MonthlyEchoPageBase & { month: string; monthEn: string; diaryCount: number };
    overview: MonthlyEchoPageBase & { emotionArc: string; emotionPattern: MonthlyEchoEmotionPattern; emotions: MonthlyEchoEmotion[]; fallback: boolean; initialQuestion: string; occurrences: MonthlyEchoOccurrence[]; evolvedQuestion: string; mainArc: string; conclusion: string };
    map: MonthlyEchoPageBase & { mainArc: string; sideThemes: MonthlyEchoSideTheme[]; summary: string };
    moments: MonthlyEchoPageBase & { items: MonthlyEchoMoment[]; summary: string };
    actions: MonthlyEchoPageBase & { items: MonthlyEchoAction[]; summary: string };
    recurring: MonthlyEchoPageBase & { lead: string; question: string; occurrences: MonthlyEchoOccurrence[]; evolvedQuestion: string; turnDate: string; conclusion: string };
    letter: MonthlyEchoPageBase & { salutation: string; paragraphs: string[]; finalInsight: string; signature: string };
  };
};

export type MonthlyEchoSections = {
  opening?: string | null;
  mainArcSection?: string | null;
  keyMomentsSection?: string | null;
  actionTrajectorySection?: string | null;
  repeatedThemeSection?: string | null;
  unfinishedSection?: string | null;
  nextMonthQuestion?: string | null;
  finalInsightSentence?: string | null;
  posterQuote?: string | null;
  posterThemeLine?: string | null;
};

export type MonthlyEchoPayload = {
  status: MonthlyEchoStatus | string;
  monthKey: string;
  title?: string | null;
  fullText?: string | null;
  sections?: MonthlyEchoSections | null;
  generatedAt?: string | null;
  viewedAt?: string | null;
  pushedAt?: string | null;
  entryCount?: number;
  message?: string;
  retryable?: boolean;
  progress?: {
    completed: number;
    total: number;
    attempt: number;
  };
  report?: MonthlyEchoRenderPayload | null;
};

export function normalizeMonthKey(value: string | null | undefined, now = new Date()): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return getCurrentMonthKey(now);
}

export function getCurrentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyToLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  return `${match[1]}年${Number(match[2])}月`;
}

export function getMonthlyEchoSearchMonthKey(keyword: string, now = new Date()): string {
  const raw = keyword.trim();
  const explicit = raw.match(/(20\d{2})[-/.年\s]*(0?[1-9]|1[0-2])\s*(?:月|月份)?/);
  if (explicit) {
    return `${explicit[1]}-${String(Number(explicit[2])).padStart(2, '0')}`;
  }

  const monthOnly = raw.match(/(^|[^\d])(0?[1-9]|1[0-2])\s*月/);
  if (monthOnly) {
    return `${now.getFullYear()}-${String(Number(monthOnly[2])).padStart(2, '0')}`;
  }

  return getCurrentMonthKey(now);
}

export function matchesMonthlyEchoSearch(keyword: string, now = new Date()): boolean {
  const raw = keyword.trim();
  if (!raw) return false;
  if (/月之回响|月之回響|月度回声|月度回聲|月回声|月回聲|月报|月報/.test(raw)) return true;
  if (/(20\d{2})[-/.年\s]*(0?[1-9]|1[0-2])\s*(?:月)?\s*(?:月之回响|月之回響|回声|回聲|月度回声|月度回聲|月报|月報)/.test(raw)) return true;
  const currentMonth = now.getMonth() + 1;
  const monthOnly = raw.match(/^(0?[1-9]|1[0-2])\s*月\s*(?:月之回响|月之回響|回声|回聲|月度回声|月度回聲|月报|月報)$/);
  return Boolean(monthOnly && Number(monthOnly[1]) >= 1 && Number(monthOnly[1]) <= 12 && currentMonth >= 1);
}
