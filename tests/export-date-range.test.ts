import assert from 'node:assert/strict';
import {
  filterDiariesByDateRange,
  validateExportDateRange,
} from '../src/utils/exportDateRange';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const entries = [
  { id: 'before', diaryDate: '2026-07-09' },
  { id: 'start', diaryDate: '2026-07-10' },
  { id: 'middle', diaryDate: '2026-07-15' },
  { id: 'end', diaryDate: '2026-07-20' },
  { id: 'after', diaryDate: '2026-07-21' },
];

test('all-time range preserves every diary', () => {
  assert.deepEqual(
    filterDiariesByDateRange(entries, { type: 'all' }).map((entry) => entry.id),
    entries.map((entry) => entry.id),
  );
});

test('custom range includes both boundary days', () => {
  assert.deepEqual(
    filterDiariesByDateRange(
      entries,
      { type: 'custom', startDate: '2026-07-10', endDate: '2026-07-20' },
      new Date(2026, 6, 21, 12),
    ).map((entry) => entry.id),
    ['start', 'middle', 'end'],
  );
});

test('same-day range includes that diary', () => {
  assert.deepEqual(
    filterDiariesByDateRange(
      entries,
      { type: 'custom', startDate: '2026-07-15', endDate: '2026-07-15' },
      new Date(2026, 6, 21, 12),
    ).map((entry) => entry.id),
    ['middle'],
  );
});

test('start date later than end date is invalid', () => {
  assert.equal(
    validateExportDateRange(
      { type: 'custom', startDate: '2026-07-20', endDate: '2026-07-10' },
      new Date(2026, 6, 21, 12),
    ),
    '开始日期不能晚于结束日期',
  );
});

test('end date later than today is invalid', () => {
  assert.equal(
    validateExportDateRange(
      { type: 'custom', startDate: '2026-07-20', endDate: '2026-07-22' },
      new Date(2026, 6, 21, 12),
    ),
    '结束日期不能晚于当前日期',
  );
});

test('missing custom date is invalid', () => {
  assert.equal(
    validateExportDateRange(
      { type: 'custom', startDate: '', endDate: '2026-07-21' },
      new Date(2026, 6, 21, 12),
    ),
    '请选择开始日期和结束日期',
  );
});
