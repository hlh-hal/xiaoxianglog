type DailyEchoEventListener = (snapshot: unknown) => void;

const listenersByJob = new Map<string, Set<DailyEchoEventListener>>();

export function publishDailyEchoSnapshot(jobId: string, snapshot: unknown): void {
  const listeners = listenersByJob.get(jobId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[daily-echo] SSE listener failed:', error);
    }
  }
}

/** Disconnecting a listener only removes the subscription; it never owns a job. */
export function subscribeDailyEchoSnapshot(jobId: string, listener: DailyEchoEventListener): () => void {
  const listeners = listenersByJob.get(jobId) || new Set<DailyEchoEventListener>();
  listeners.add(listener);
  listenersByJob.set(jobId, listeners);

  return () => {
    const current = listenersByJob.get(jobId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByJob.delete(jobId);
  };
}
