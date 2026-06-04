import assert from 'node:assert/strict';
import { getLeaderboardMonthKey, getLeaderboardMonthStart } from '../server/src/routes/leaderboard';

const mayEndInShanghai = new Date('2026-05-31T15:59:59.000Z');
assert.equal(getLeaderboardMonthKey(mayEndInShanghai), '2026-05');
assert.equal(getLeaderboardMonthStart(mayEndInShanghai).toISOString(), '2026-04-30T16:00:00.000Z');

const juneStartInShanghai = new Date('2026-05-31T16:00:00.000Z');
assert.equal(getLeaderboardMonthKey(juneStartInShanghai), '2026-06');
assert.equal(getLeaderboardMonthStart(juneStartInShanghai).toISOString(), '2026-05-31T16:00:00.000Z');

const juneLaterInShanghai = new Date('2026-06-30T15:59:59.000Z');
assert.equal(getLeaderboardMonthKey(juneLaterInShanghai), '2026-06');
assert.equal(getLeaderboardMonthStart(juneLaterInShanghai).toISOString(), '2026-05-31T16:00:00.000Z');

console.log('leaderboard monthly reset boundary ok');
