import {
  dispatchPendingDailyEchoJobs,
  isDailyEchoBackgroundEnabled,
} from './dailyEchoService.js';

const CHECK_INTERVAL_MS = Math.max(1000, Number(process.env.DAILY_ECHO_SCHEDULER_INTERVAL_MS || 5000));
let schedulerStarted = false;
let tickPromise: Promise<number> | null = null;

/** Run one idempotent queue-dispatch pass. Concurrent kicks share one pass. */
export function runDailyEchoSchedulerTick(): Promise<number> {
  if (!isDailyEchoBackgroundEnabled()) return Promise.resolve(0);
  if (tickPromise) return tickPromise;

  tickPromise = dispatchPendingDailyEchoJobs()
    .finally(() => {
      tickPromise = null;
    });
  return tickPromise;
}

/** Enqueue paths call this to avoid waiting for the next five-second tick. */
export function kickDailyEchoScheduler(): void {
  void runDailyEchoSchedulerTick().catch((error) => {
    console.warn('[daily-echo] scheduler kick failed:', error instanceof Error ? error.message : error);
  });
}

export function startDailyEchoScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  kickDailyEchoScheduler();
  const timer = setInterval(kickDailyEchoScheduler, CHECK_INTERVAL_MS);
  timer.unref?.();
}
