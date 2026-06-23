export type MonthlyEchoStatus = 'disabled' | 'empty' | 'generating' | 'ready' | 'pushed' | 'stale' | 'failed';

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
