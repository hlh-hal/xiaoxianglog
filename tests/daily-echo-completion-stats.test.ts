import assert from 'node:assert/strict';
import type { DiaryEntry } from '../src/services/diaryService';
import {
  buildDailyEchoCompletionStats,
  calculateDiaryStreak,
  countDiaryTextCharacters,
  createWritingActivityState,
  getActiveWritingMinutes,
  getActiveWritingSeconds,
  pauseWritingActivity,
  recordWritingInput,
} from '../src/utils/dailyEchoCompletionStats';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(id: string, diaryDate: string, content: string): DiaryEntry {
  return {
    id,
    content,
    images: [],
    createdAt: `${diaryDate}T08:00:00.000Z`,
    updatedAt: `${diaryDate}T08:00:00.000Z`,
    diaryDate: `${diaryDate}T08:00:00.000Z`,
    status: 'active',
  };
}

test('counts user text while excluding diary template labels and punctuation', () => {
  const html = `
    <h2>开心的事：</h2>
    <p>无</p>
    <h2>充实的事：</h2>
    <p>继续迭代小象回声。</p>
    <h2>感谢的人：</h2>
    <p>室友调低声音，感谢！</p>
  `;
  assert.equal(countDiaryTextCharacters(html), 17);
});

test('caps active writing time at 30 seconds and ignores inactive gaps', () => {
  let activity = createWritingActivityState();
  activity = recordWritingInput(activity, 1_000);
  activity = recordWritingInput(activity, 11_000);
  activity = recordWritingInput(activity, 81_000);

  assert.equal(activity.elapsedMs, 40_000);
  assert.equal(getActiveWritingMinutes(activity, 82_000), 1);
});

test('pause stops background or blur time from accumulating', () => {
  let activity = createWritingActivityState();
  activity = recordWritingInput(activity, 1_000);
  activity = pauseWritingActivity(activity, 6_000);
  activity = recordWritingInput(activity, 600_000);
  activity = pauseWritingActivity(activity, 606_000);

  assert.equal(activity.elapsedMs, 11_000);
  assert.equal(activity.lastInputAt, null);
});

test('active writing minutes use complete minutes with a one minute minimum', () => {
  let activity = createWritingActivityState();
  activity = recordWritingInput(activity, 0);
  activity = recordWritingInput(activity, 30_000);
  activity = recordWritingInput(activity, 60_000);
  activity = recordWritingInput(activity, 90_000);

  assert.equal(getActiveWritingMinutes(activity, 91_000), 1);
  assert.equal(getActiveWritingSeconds(activity, 91_000), 91);
});

test('restores a persisted writing baseline and keeps accumulating across sessions', () => {
  let activity = createWritingActivityState(14 * 60_000);
  assert.equal(getActiveWritingMinutes(activity), 14);

  activity = recordWritingInput(activity, 1_000);
  activity = recordWritingInput(activity, 31_000);
  activity = pauseWritingActivity(activity, 61_000);

  assert.equal(getActiveWritingSeconds(activity), 14 * 60 + 60);
  assert.equal(getActiveWritingMinutes(activity), 15);
});

test('repeated reads without new input do not increase persisted writing time', () => {
  const activity = createWritingActivityState(14 * 60_000);
  assert.equal(getActiveWritingSeconds(activity, 1_000), 14 * 60);
  assert.equal(getActiveWritingSeconds(activity, 60_000), 14 * 60);
  assert.equal(getActiveWritingMinutes(activity, 60_000), 14);
});

test('calculates streak by local diary dates and deduplicates same-day entries', () => {
  const current = entry('today', '2026-06-05', '<p>今天写了小象回声</p>');
  const entries = [
    current,
    entry('same-day', '2026-06-05', '<p>同一天另一篇</p>'),
    entry('yesterday', '2026-06-04', '<p>昨天也记录</p>'),
    entry('before', '2026-06-03', '<p>前天也记录</p>'),
    entry('gap', '2026-06-01', '<p>更早记录</p>'),
  ];

  assert.equal(calculateDiaryStreak(entries, current), 3);
});

test('builds completion stats from saved entry, active writing, and entries', () => {
  const current = entry('today', '2026-06-05', '<p>今日思考：</p><p>提前写完日志</p>');
  const entries = [
    current,
    entry('yesterday', '2026-06-04', '<p>昨天记录</p>'),
  ];
  let activity = createWritingActivityState();
  activity = recordWritingInput(activity, 0);
  activity = recordWritingInput(activity, 20_000);

  const stats = buildDailyEchoCompletionStats(current, entries, activity, 21_000);
  assert.deepEqual(stats, {
    wordCount: 6,
    activeWritingMinutes: 1,
    streakDays: 2,
  });
});
