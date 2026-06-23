import assert from 'node:assert/strict';
import type { DiaryEntry } from '../src/services/diaryService';
import {
  buildAnnualEchoFallbackDigest,
  buildAnnualEchoStats,
  extractAnnualQuoteCandidates,
  getAnnualEchoEntries,
  getAnnualEchoSearchYear,
  matchesAnnualEchoSearch,
  validateAnnualEchoAiPayload,
} from '../src/utils/annualEcho';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(id: string, diaryDate: string, content: string, patch: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id,
    content,
    images: [],
    createdAt: `${diaryDate}T08:00:00.000Z`,
    updatedAt: `${diaryDate}T08:00:00.000Z`,
    diaryDate,
    status: 'active',
    ...patch,
  };
}

test('builds annual stats with current-year cutoff and active visible entries only', () => {
  const entries: DiaryEntry[] = [
    entry('first', '2025-12-31', '我开始写日记。'),
    ...Array.from({ length: 7 }, (_, index) => {
      const day = String(5 + index).padStart(2, '0');
      return entry(`jan-${day}`, `2026-01-${day}`, '今天认真写了一页。', {
        images: index === 0 ? ['local-image'] : [],
        activeWritingSeconds: 120,
      });
    }),
    entry('jan-12', '2026-01-12', '这个月继续写。'),
    entry('future', '2026-12-31', '未来的日记不应该算进截至今日。'),
    entry('hidden', '2026-01-13', '隐藏日记不统计。', { isHidden: true }),
    entry('trash', '2026-01-14', '回收站日记不统计。', { status: 'trashed' }),
  ];

  const stats = buildAnnualEchoStats(entries, 2026, new Date(2026, 5, 13));
  assert.equal(stats.totalEntries, 8);
  assert.equal(stats.writingDays, 8);
  assert.equal(stats.totalImages, 1);
  assert.equal(stats.activeWritingMinutes, 14);
  assert.equal(stats.perfectWeeks, 1);
  assert.deepEqual(stats.busiestMonth, { month: 1, entryCount: 8 });
  assert.equal(stats.firstDiaryDate, '2025-12-31');
  assert.equal(stats.acquaintanceDays, 165);
  assert.equal(stats.eligibleForReminder, true);
});

test('selects annual entries by diary date range', () => {
  const entries = [
    entry('old', '2025-12-31', '去年'),
    entry('current', '2026-06-13', '今年'),
    entry('future', '2026-06-14', '明天'),
  ];

  assert.deepEqual(
    getAnnualEchoEntries(entries, 2026, new Date(2026, 5, 13)).map(item => item.id),
    ['current'],
  );
});

test('validates AI digest against quote candidates and manual evidence', () => {
  const entries = [
    entry('a', '2026-01-05', '原来勇敢不是不怕，是怕着还是往前走。只要运动一小时，我就能专注很久。'),
    entry('b', '2026-01-06', '只要喝咖啡，我就会变得很话痨。'),
  ];
  const stats = buildAnnualEchoStats(entries, 2026, new Date(2026, 11, 31));
  const candidates = extractAnnualQuoteCandidates(entries);
  const quote = candidates.find(candidate => candidate.text === '原来勇敢不是不怕，是怕着还是往前走');
  assert.ok(quote);

  const digest = validateAnnualEchoAiPayload(
    {
      quotes: [
        { text: quote.text, entryId: quote.entryId, date: quote.date },
        { text: '只要运动一小时，我就能专注很久', entryId: 'a', date: '2026-01-05' },
      ],
      annualReply: '这一年，你慢慢把自己写清楚了一点。',
      manualItems: [
        { text: '只要运动一小时，我就能专注很久。', evidenceEntryIds: ['a'], evidenceDates: ['2026-01-05'] },
        { text: '只要喝咖啡，我就会变得很话痨。', evidenceEntryIds: ['b'] },
        { text: '如果天气好，我可能会开心。', evidenceEntryIds: ['a'] },
        { text: '只要没有证据，我就应该被过滤。', evidenceEntryIds: ['missing'] },
      ],
    },
    stats,
    candidates,
    entries,
    new Date(2026, 11, 31),
  );

  assert.equal(digest.quote?.text, quote.text);
  assert.deepEqual(digest.quotes?.map(item => item.text), [
    quote.text,
    '只要运动一小时，我就能专注很久',
  ]);
  assert.equal(digest.annualReply, '这一年，你慢慢把自己写清楚了一点。');
  assert.deepEqual(digest.manualItems.map(item => item.text), [
    '只要运动一小时，我就能专注很久。',
    '只要喝咖啡，我就会变得很话痨。',
  ]);
});

test('falls back when AI quote is not an original candidate', () => {
  const entries = [entry('a', '2026-01-05', '原来勇敢不是不怕，是怕着还是往前走。')];
  const stats = buildAnnualEchoStats(entries, 2026, new Date(2026, 11, 31));
  const candidates = extractAnnualQuoteCandidates(entries);
  const fallback = buildAnnualEchoFallbackDigest(stats, candidates, new Date(2026, 11, 31));
  const digest = validateAnnualEchoAiPayload(
    { quote: { text: 'AI 改写过的话', entryId: 'a', date: '2026-01-05' }, annualReply: '' },
    stats,
    candidates,
    entries,
    new Date(2026, 11, 31),
  );

  assert.equal(digest.quote?.text, fallback.quote?.text);
  assert.deepEqual(digest.quotes?.map(item => item.text), fallback.quotes?.map(item => item.text));
});

test('matches annual echo search aliases', () => {
  assert.equal(matchesAnnualEchoSearch('2026年度报告', new Date(2026, 5, 13)), true);
  assert.equal(matchesAnnualEchoSearch('年报', new Date(2026, 5, 13)), true);
  assert.equal(matchesAnnualEchoSearch('年度回声', new Date(2026, 5, 13)), true);
  assert.equal(matchesAnnualEchoSearch('普通日记', new Date(2026, 5, 13)), false);
  assert.equal(getAnnualEchoSearchYear('2025 年度报告', new Date(2026, 5, 13)), 2025);
});
