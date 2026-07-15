import assert from 'node:assert/strict';
import {
  createDailyEchoSourceHash,
  isDailyEchoJobActive,
  isDailyEchoJobTerminal,
  normalizeDailyEchoSource,
  type DailyEchoJobSnapshot,
} from '../src/services/dailyEchoService';
import {
  buildDailyEchoDiaryExcerpt,
  computeDailyEchoSourceHash,
  DAILY_ECHO_MAX_DIARY_CHARS,
} from '../server/src/lib/dailyEchoCore';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function snapshot(status: DailyEchoJobSnapshot['status']): DailyEchoJobSnapshot {
  return {
    id: 'job-1',
    entryId: 'entry-1',
    status,
    phase: status === 'queued' ? 'queued' : status === 'running' ? 'generating' : status === 'succeeded' ? 'ready' : status,
    sourceHash: '00000000',
    sourceEntryUpdatedAt: '2026-07-11T08:00:00.000Z',
    regenerateCount: 0,
    previewContent: '',
    content: null,
    selectedMemoryEntryIds: [],
    promptVersion: 'daily_echo_v1',
    model: null,
    provider: null,
    attemptCount: 0,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    generatedAt: null,
    createdAt: '2026-07-11T08:00:00.000Z',
    updatedAt: '2026-07-11T08:00:00.000Z',
  };
}

test('normalizes date and diary whitespace exactly like the backend contract', () => {
  assert.equal(
    normalizeDailyEchoSource(' 2026-07-11 ', '  \u4eca\u5929\r\n  \u5199\u5b8c\u4e86\u65e5\u5fd7\u3002  '),
    '2026-07-11\n\u4eca\u5929 \u5199\u5b8c\u4e86\u65e5\u5fd7\u3002',
  );
});

test('hashes Chinese text with FNV-1a over UTF-16 code units', () => {
  assert.equal(
    createDailyEchoSourceHash(' 2026-07-11 ', '  \u4eca\u5929\r\n  \u5199\u5b8c\u4e86\u65e5\u5fd7\u3002  '),
    'cf538694',
  );
  assert.equal(
    createDailyEchoSourceHash('2026-07-11', 'emoji \ud83d\ude00 \u4e2d\u6587'),
    '780bedc3',
  );
});

test('frontend and backend source hashes stay identical for CRLF, Chinese, and emoji', () => {
  const cases = [
    [' 2026-07-11 ', '第一行\r\n第二行'],
    ['2026-07-11', 'emoji 😀 中文'],
    ['2026-07-11', '  多个    空格\n以及换行  '],
  ];
  for (const [date, text] of cases) {
    assert.equal(createDailyEchoSourceHash(date, text), computeDailyEchoSourceHash(date, text));
  }
});

test('durable prompt input keeps a bounded head and tail excerpt', () => {
  const source = `${'开'.repeat(1500)}中间${'尾'.repeat(1500)}`;
  const excerpt = buildDailyEchoDiaryExcerpt(source);
  assert.ok(Array.from(excerpt).length <= DAILY_ECHO_MAX_DIARY_CHARS);
  assert.ok(excerpt.startsWith('开'));
  assert.ok(excerpt.endsWith('尾'));
});

test('classifies durable job states for watcher lifecycle', () => {
  assert.equal(isDailyEchoJobActive(snapshot('queued')), true);
  assert.equal(isDailyEchoJobActive(snapshot('running')), true);
  assert.equal(isDailyEchoJobTerminal(snapshot('succeeded')), true);
  assert.equal(isDailyEchoJobTerminal(snapshot('failed')), true);
  assert.equal(isDailyEchoJobTerminal(snapshot('stale')), true);
  assert.equal(isDailyEchoJobTerminal(snapshot('running')), false);
});
