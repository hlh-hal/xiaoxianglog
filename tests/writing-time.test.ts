import assert from 'node:assert/strict';
import {
  closeSegment,
  createWritingTimeCheckpoint,
  createWritingTimeState,
  getWritingMinutesFromSeconds,
  getWritingSeconds,
  parseWritingTimeCheckpoint,
  projectTotal,
  recordActivity,
  restoreCheckpoint,
} from '../src/features/editor/writingTimeTracker';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('does not count page entry before the first editing activity', () => {
  const state = createWritingTimeState();
  assert.equal(projectTotal(state, 4 * 60_000), 0);
  assert.equal(getWritingSeconds(state, 4 * 60_000), 0);
});

test('counts one minute writing, two minutes thinking, and another minute writing', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = recordActivity(state, 60_000);
  state = recordActivity(state, 3 * 60_000);
  state = closeSegment(state, 'complete', 4 * 60_000);

  assert.equal(state.elapsedMs, 4 * 60_000);
  assert.equal(getWritingSeconds(state), 240);
  assert.equal(getWritingMinutesFromSeconds(getWritingSeconds(state)), 4);
});

test('caps a ten minute idle period at three minutes after the last activity', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = recordActivity(state, 60_000);
  state = closeSegment(state, 'exit', 11 * 60_000);

  assert.equal(state.elapsedMs, 4 * 60_000);
  assert.equal(state.lastClosedSegment?.endedAt, 4 * 60_000);
});

test('starts a new segment after an idle timeout instead of counting the gap', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = recordActivity(state, 60_000);
  state = recordActivity(state, 11 * 60_000);
  state = closeSegment(state, 'complete', 13 * 60_000);

  assert.equal(state.elapsedMs, 6 * 60_000);
  assert.equal(state.lastClosedSegment?.startedAt, 11 * 60_000);
});

test('an autosave projection does not close or rebase the active segment', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = recordActivity(state, 90_000);

  assert.equal(getWritingSeconds(state, 90_000), 90);
  assert.notEqual(state.activeSegment, null);

  state = recordActivity(state, 3 * 60_000);
  state = closeSegment(state, 'complete', 4 * 60_000);
  assert.equal(getWritingSeconds(state), 240);
});

test('background closes the segment and a later edit starts without counting the hour gap', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = closeSegment(state, 'background', 60_000);
  state = recordActivity(state, 61 * 60_000);
  state = closeSegment(state, 'complete', 63 * 60_000);

  assert.equal(getWritingSeconds(state), 180);
});

test('repeated lifecycle close events are idempotent', () => {
  let state = createWritingTimeState();
  state = recordActivity(state, 0);
  state = closeSegment(state, 'page_hidden', 60_000);
  const once = state;
  state = closeSegment(state, 'interruption', 120_000);
  state = closeSegment(state, 'exit', 180_000);

  assert.deepEqual(state, once);
  assert.equal(getWritingSeconds(state), 60);
});

test('sequential sessions keep the persisted baseline and ignore the break', () => {
  let first = createWritingTimeState();
  first = recordActivity(first, 0);
  first = recordActivity(first, 2 * 60_000);
  first = closeSegment(first, 'exit', 4 * 60_000);

  let second = createWritingTimeState(getWritingSeconds(first) * 1_000);
  second = recordActivity(second, 64 * 60_000);
  second = closeSegment(second, 'complete', 66 * 60_000);

  assert.equal(getWritingSeconds(second), 6 * 60);
});

test('checkpoint recovery uses the monotonic observed total without extrapolating downtime', () => {
  let state = createWritingTimeState(120_000);
  state = recordActivity(state, 1_000);
  const checkpoint = createWritingTimeCheckpoint('entry-1', 'user-1', state, 121_000);
  const restored = restoreCheckpoint(180_000, checkpoint);

  assert.equal(checkpoint.totalElapsedMs, 240_000);
  assert.equal(restored.elapsedMs, 240_000);
  assert.equal(restored.activeSegment, null);
  assert.equal(projectTotal(restored, 60 * 60_000), 240_000);
});

test('a newer persisted total wins over a stale checkpoint', () => {
  const checkpoint = createWritingTimeCheckpoint(
    'entry-2',
    null,
    createWritingTimeState(240_000),
    1_000,
  );
  const restored = restoreCheckpoint(300_000, checkpoint);
  assert.equal(restored.elapsedMs, 300_000);
});

test('malformed checkpoints and legacy zero duration remain safe', () => {
  assert.equal(parseWritingTimeCheckpoint({ version: 2 }), null);
  assert.equal(parseWritingTimeCheckpoint({
    version: 1,
    entryId: 'entry-3',
    ownerId: null,
    totalElapsedMs: -1,
    observedAt: 1,
    segmentStartedAt: null,
    lastActiveAt: null,
    endedAt: null,
    endReason: null,
  }), null);
  assert.equal(restoreCheckpoint(0, null).elapsedMs, 0);
});
