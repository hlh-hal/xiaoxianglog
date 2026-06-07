import assert from 'node:assert/strict';
import {
  createAdjustedDiaryDateKey,
  getDiaryDateKey,
  parseDiaryDateKey,
  toDiaryDateKey,
} from '../src/utils/diaryDate';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('auto-adjust before noon saves previous local diary date', () => {
  assert.equal(
    createAdjustedDiaryDateKey(new Date(2026, 5, 6, 0, 57), true),
    '2026-06-05',
  );
});

test('auto-adjust does not change late night same-day entries', () => {
  assert.equal(
    createAdjustedDiaryDateKey(new Date(2026, 5, 4, 23, 50), true),
    '2026-06-04',
  );
});

test('date-only diary keys parse as local calendar days', () => {
  const date = parseDiaryDateKey('2026-06-05');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 5);
  assert.equal(date.getDate(), 5);
  assert.equal(toDiaryDateKey(date), '2026-06-05');
});

test('legacy ISO diary dates normalize by their stored calendar key', () => {
  assert.equal(getDiaryDateKey('2026-06-04T16:57:00.000Z'), '2026-06-04');
  assert.equal(toDiaryDateKey(parseDiaryDateKey('2026-06-04T16:57:00.000Z')), '2026-06-04');
});
