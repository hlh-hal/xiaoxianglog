import {
  enqueueDueMonthEndJobs,
  processDueMonthlyPushes,
  processPendingMonthlyJobs,
  processPendingTraceNodes,
} from './monthlyEchoService.js';

const CHECK_INTERVAL_MS = 60 * 1000;
let schedulerStarted = false;

export async function runMonthlyEchoSchedulerTick() {
  const [traceCount, queuedMonthEnd] = await Promise.all([
    processPendingTraceNodes(),
    enqueueDueMonthEndJobs(),
  ]);
  const jobCount = await processPendingMonthlyJobs();
  const pushedCount = await processDueMonthlyPushes();
  return { traceCount, queuedMonthEnd, jobCount, pushedCount };
}

export function startMonthlyEchoScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const run = () => {
    runMonthlyEchoSchedulerTick().catch((error) => {
      console.warn('[monthly-echo] scheduler failed:', error?.message || error);
    });
  };

  run();
  setInterval(run, CHECK_INTERVAL_MS);
}
