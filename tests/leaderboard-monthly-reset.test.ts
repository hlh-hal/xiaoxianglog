import assert from 'node:assert/strict';
import {
  countDiaryDaysByUser,
  getLeaderboardMonthEntriesWhere,
  getLeaderboardMonthKey,
  getLeaderboardMonthStart,
} from '../server/src/routes/leaderboard';

const mayEndInShanghai = new Date('2026-05-31T15:59:59.000Z');
assert.equal(getLeaderboardMonthKey(mayEndInShanghai), '2026-05');
assert.equal(getLeaderboardMonthStart(mayEndInShanghai).toISOString(), '2026-04-30T16:00:00.000Z');

const juneStartInShanghai = new Date('2026-05-31T16:00:00.000Z');
assert.equal(getLeaderboardMonthKey(juneStartInShanghai), '2026-06');
assert.equal(getLeaderboardMonthStart(juneStartInShanghai).toISOString(), '2026-05-31T16:00:00.000Z');

const juneLaterInShanghai = new Date('2026-06-30T15:59:59.000Z');
assert.equal(getLeaderboardMonthKey(juneLaterInShanghai), '2026-06');
assert.equal(getLeaderboardMonthStart(juneLaterInShanghai).toISOString(), '2026-05-31T16:00:00.000Z');

const monthWhere = getLeaderboardMonthEntriesWhere(['self', 'friend'], '2026-06');
assert.deepEqual(monthWhere, {
  userId: { in: ['self', 'friend'] },
  status: 'active',
  diaryDate: { startsWith: '2026-06' },
});
assert.equal(Object.hasOwn(monthWhere, 'isHidden'), false);

const dayCounts = countDiaryDaysByUser([
  { userId: 'self', diaryDate: '2026-06-01' },
  { userId: 'friend', diaryDate: '2026-06-03' },
  { userId: 'friend', diaryDate: '2026-06-03T12:00:00.000Z' },
  { userId: 'friend', diaryDate: '2026-06-04' },
  { userId: 'friend', diaryDate: 'not-a-date' },
], ['self', 'friend', 'empty']);

assert.equal(dayCounts.get('self'), 1);
assert.equal(dayCounts.get('friend'), 2);
assert.equal(dayCounts.get('empty'), 0);

console.log('leaderboard monthly reset boundary ok');
