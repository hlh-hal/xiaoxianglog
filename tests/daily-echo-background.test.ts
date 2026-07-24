import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatInboxNotification,
  getInboxNotificationTarget,
  getInboxNotificationText,
} from '../src/pages/Inbox';
import { buildInteractionNotification } from '../src/features/app-shell/useAppBootstrap';
import {
  isDailyEchoJobActive,
  isDailyEchoJobTerminal,
  type DailyEchoJobSnapshot,
} from '../src/services/dailyEchoService';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const inboxSource = readFileSync(new URL('../src/pages/Inbox.tsx', import.meta.url), 'utf8');
const bootstrapSource = readFileSync(
  new URL('../src/features/app-shell/useAppBootstrap.ts', import.meta.url),
  'utf8',
);
const serviceWorkerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const dailyEchoServiceSource = readFileSync(
  new URL('../src/services/dailyEchoService.ts', import.meta.url),
  'utf8',
);
const editorSource = readFileSync(new URL('../src/pages/Editor.tsx', import.meta.url), 'utf8');
const backendServiceSource = readFileSync(
  new URL('../server/src/lib/dailyEchoService.ts', import.meta.url),
  'utf8',
);
const backendRouteSource = readFileSync(
  new URL('../server/src/routes/dailyEcho.ts', import.meta.url),
  'utf8',
);
const backendSchedulerSource = readFileSync(
  new URL('../server/src/lib/dailyEchoScheduler.ts', import.meta.url),
  'utf8',
);

function jobWithStatus(status: DailyEchoJobSnapshot['status']): DailyEchoJobSnapshot {
  return {
    id: `job-${status}`,
    entryId: 'entry-1',
    status,
    phase: status === 'queued' ? 'queued' : status === 'running' ? 'generating' : status === 'succeeded' ? 'ready' : status,
    sourceHash: 'source-hash',
    sourceEntryUpdatedAt: '2026-07-11T08:00:00.000Z',
    regenerateCount: 0,
    previewContent: '',
    content: status === 'succeeded' ? '今日回声：测试\n\n用户可见回声：测试内容。' : null,
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

test('daily echo inbox mapping uses Xiaoxiang as sender and opens the referenced diary', () => {
  const item = formatInboxNotification({
    id: 'echo-job-1',
    type: 'daily_echo_ready',
    fromUser: null,
    content: '你的「每日回声」已经生成，点击查看。',
    refDiaryId: 'diary/a b',
    createdAt: '2026-07-11T08:00:00.000Z',
    isRead: false,
  });

  assert.equal(item.sourceUser.nickname, '小象');
  assert.equal(getInboxNotificationText(item), '你的「每日回声」已经生成，点击查看。');
  assert.equal(getInboxNotificationTarget(item), '/editor?id=diary%2Fa%20b');
});

test('daily echo inbox mapping fails closed when a malformed notification has no diary reference', () => {
  const item = formatInboxNotification({
    id: 'echo-job-without-diary',
    type: 'daily_echo_ready',
    createdAt: '2026-07-11T08:00:00.000Z',
    isRead: false,
  });

  assert.equal(getInboxNotificationTarget(item), null);
  assert.equal(getInboxNotificationText(item), '每日回声已生成，点击查看');
});

test('app bootstrap builds a deterministic completion notification for PWA and active Android', () => {
  const payload = {
    id: 'echo-job-1',
    type: 'daily_echo_ready',
    content: '你的「每日回声」已经生成，点击查看。',
    refDiaryId: 'diary/a b',
    isRead: false,
  };

  const first = buildInteractionNotification(payload);
  const second = buildInteractionNotification(payload);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    title: '每日回声已生成',
    body: '你的「每日回声」已经生成，点击查看。',
    tag: 'xiang-daily-echo-ready-echo-job-1',
    url: '/editor?id=diary%2Fa%20b',
  });
});

test('completion polling includes daily echo and reuses unread-id dedupe plus browser notification delivery', () => {
  assert.match(bootstrapSource, /notifications\?type=friend_request,like,comment,daily_echo_ready/);
  assert.match(
    bootstrapSource,
    /if \(item\.isRead \|\| notifiedIds\.has\(item\.id\)\) continue;/,
  );
  assert.match(bootstrapSource, /sendBrowserNotification\(notification\.title, notification\.body/);
  assert.match(bootstrapSource, /data: \{ url: notification\.url \}/);
  assert.match(bootstrapSource, /CapacitorApp\.addListener\('appStateChange'/);
  assert.match(bootstrapSource, /if \(sent\) \{[\s\S]*notifiedIds\.add\(item\.id\)/);
});

test('inbox and PWA service worker keep daily echo routing markers intact', () => {
  assert.match(inboxSource, /types: \['like', 'comment', 'poke', 'daily_echo_ready'\]/);
  assert.match(inboxSource, /refDiaryId: item\.refDiaryId \|\| null/);
  assert.match(serviceWorkerSource, /const targetUrl = event\.notification\.data\?\.url \|\| '\/'/);
  assert.match(serviceWorkerSource, /client\.navigate\(absoluteTargetUrl\)/);
  assert.match(serviceWorkerSource, /self\.clients\.openWindow\(absoluteTargetUrl\)/);
});

test('frontend recognizes every durable job state and reconnects through latest snapshot plus polling', () => {
  assert.equal(isDailyEchoJobActive(jobWithStatus('queued')), true);
  assert.equal(isDailyEchoJobActive(jobWithStatus('running')), true);
  assert.equal(isDailyEchoJobActive(jobWithStatus('succeeded')), false);
  assert.equal(isDailyEchoJobTerminal(jobWithStatus('succeeded')), true);
  assert.equal(isDailyEchoJobTerminal(jobWithStatus('failed')), true);
  assert.equal(isDailyEchoJobTerminal(jobWithStatus('stale')), true);

  assert.match(dailyEchoServiceSource, /\/daily-echo\/entries\/\$\{encodeURIComponent\(entryId\)\}\/latest/);
  assert.match(dailyEchoServiceSource, /\/daily-echo\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/events/);
  assert.match(dailyEchoServiceSource, /Accept: 'text\/event-stream'/);
  assert.match(dailyEchoServiceSource, /return pollDailyEchoJob\(jobId, onSnapshot, signal, pollIntervalMs\)/);
  assert.match(editorSource, /getLatestDailyEchoJob\(entryId\)/);
});

test('leaving the editor only aborts its watcher and never cancels the durable server job', () => {
  assert.match(editorSource, /const stopDailyEchoWatcher = useCallback\(\(\) => \{[\s\S]*dailyEchoWatcherAbortRef\.current\?\.abort\(\)/);
  assert.match(editorSource, /return \(\) => \{[\s\S]*disposed = true;[\s\S]*stopDailyEchoWatcher\(\)/);
  assert.doesNotMatch(dailyEchoServiceSource, /daily-echo\/jobs\/[^\n]*cancel/i);
  assert.doesNotMatch(editorSource, /daily-echo\/jobs\/[^\n]*cancel/i);
});

test('backend exposes authenticated durable routes, recovery scheduler, and no remote native push', () => {
  assert.match(backendRouteSource, /router\.use\(requireAuth\)/);
  assert.match(backendRouteSource, /router\.post\('\/jobs'/);
  assert.match(backendRouteSource, /router\.get\('\/jobs\/:jobId\/events'/);
  assert.match(backendRouteSource, /X-Accel-Buffering/);
  assert.match(backendRouteSource, /Subscribe first and then re-read/);
  assert.match(backendSchedulerSource, /DAILY_ECHO_SCHEDULER_INTERVAL_MS.*5000/);
  assert.match(backendSchedulerSource, /kickDailyEchoScheduler\(\)/);
  assert.doesNotMatch(backendServiceSource, /sendPushToUser/);
});

test('successful completion creates the station notification only after the lock update succeeds', () => {
  assert.match(backendServiceSource, /const result = await tx\.dailyEchoJob\.updateMany/);
  assert.match(backendServiceSource, /if \(result\.count === 0\) return false;[\s\S]*await tx\.notification\.upsert/);
  assert.match(backendServiceSource, /id: job\.id,[\s\S]*type: 'daily_echo_ready'/);
});

test('unvalidated provider output never reaches snapshots and only a current succeeded result is replayed', () => {
  assert.doesNotMatch(backendServiceSource, /previewContent:\s*accumulated/);
  assert.doesNotMatch(backendServiceSource, /previewContent:\s*completion\.content/);
  assert.match(backendServiceSource, /status: 'succeeded',[\s\S]*previewContent: content,[\s\S]*finalContent: content/);
  assert.doesNotMatch(editorSource, /job\.previewContent/);
  assert.match(editorSource, /setDailyEchoStreamingContent\(''\);[\s\S]*setIsEchoGenerating\(true\);[\s\S]*setIsDailyEchoRetrying\(job\.phase === 'retrying'\)/);
  assert.match(editorSource, /if \(job\.status !== 'succeeded' \|\| !content\) \{/);
  assert.match(
    editorSource,
    /const sourceStillCurrent = currentSourceHash === job\.sourceHash[\s\S]*if \(!sourceStillCurrent\) \{[\s\S]*return;/,
  );
  assert.match(editorSource, /await persistDailyEcho\(nextEcho\)/);
  assert.match(editorSource, /revealValidatedDailyEcho\(nextEcho\.content\)/);
  assert.match(editorSource, /DAILY_ECHO_REVEAL_INTERVAL_MS = 35/);
  assert.match(editorSource, /DAILY_ECHO_REVEAL_CHARS_PER_TICK = 2/);
  assert.match(editorSource, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(editorSource, /entry\.updatedAt === job\.sourceEntryUpdatedAt/);
});

test('enqueue recovery is bounded and failed cards never ask the user to regenerate', () => {
  assert.match(editorSource, /DAILY_ECHO_ENQUEUE_RETRY_DELAYS_MS = \[2000, 5000\]/);
  assert.match(editorSource, /getLatestDailyEchoJob\(entry\.id\)[\s\S]*recovered\.sourceHash === currentSourceHash/);
  assert.match(editorSource, /dailyEcho\?\.status !== 'failed' \? handleRegenerateDailyEcho : undefined/);
});
