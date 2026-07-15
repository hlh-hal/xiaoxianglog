import {
  enqueueDueMonthEndJobs,
  processDueMonthlyPushes,
  processPendingMonthlyJobs,
  processPendingTraceNodes,
} from './monthlyEchoService.js';

const CHECK_INTERVAL_MS = 60 * 1000;
let schedulerStarted = false;
let schedulerRunning = false;

export async function runMonthlyEchoSchedulerTick() {
  if (schedulerRunning) {
    return { traceCount: 0, queuedMonthEnd: 0, jobCount: 0, pushedCount: 0, skipped: true };
  }
  schedulerRunning = true;
  try {
    // Interactive month jobs own their trace generation and must not wait behind
    // the global trace backlog.
    const jobCount = await processPendingMonthlyJobs();
    const traceCount = await processPendingTraceNodes();
    const queuedMonthEnd = await enqueueDueMonthEndJobs();
    const pushedCount = await processDueMonthlyPushes();
    return { traceCount, queuedMonthEnd, jobCount, pushedCount, skipped: false };
  } finally {
    schedulerRunning = false;
  }
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
