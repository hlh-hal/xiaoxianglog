import {
  handleEntryChangedForMonthlyEcho,
  handleEntryDeletedForMonthlyEcho,
} from '../../lib/monthlyEchoService.js';

export type DiaryChangeEvent =
  | {
      type: 'changed';
      userId: string;
      entryId: string;
      previousDiaryDate?: string | null;
    }
  | {
      type: 'deleted';
      userId: string;
      entryId: string;
      diaryDate?: string | null;
    };

export interface DiaryChangeProjector {
  name: string;
  project(event: DiaryChangeEvent): Promise<void>;
}

export interface DiaryProjectionReport {
  event: DiaryChangeEvent;
  results: Array<{ name: string; status: 'fulfilled' | 'rejected'; error?: string }>;
}

const monthlyEchoProjector: DiaryChangeProjector = {
  name: 'monthly-echo',
  async project(event) {
    if (event.type === 'deleted') {
      await handleEntryDeletedForMonthlyEcho(event.userId, event.entryId, event.diaryDate);
      return;
    }
    await handleEntryChangedForMonthlyEcho({
      userId: event.userId,
      entryId: event.entryId,
      previousDiaryDate: event.previousDiaryDate,
    });
  },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

/** 等待所有投影完成并隔离失败，避免日记请求结束后遗留悬空任务。 */
export async function runDiaryChangeProjectors(
  event: DiaryChangeEvent,
  projectors: DiaryChangeProjector[],
  logger: Pick<Console, 'warn'> = console,
): Promise<DiaryProjectionReport> {
  const settled = await Promise.allSettled(projectors.map(projector => projector.project(event)));
  const results = settled.map((result, index) => {
    const name = projectors[index].name;
    if (result.status === 'fulfilled') return { name, status: 'fulfilled' as const };
    const error = getErrorMessage(result.reason);
    logger.warn(`[diary-projector] ${name} failed for ${event.entryId}: ${error}`);
    return { name, status: 'rejected' as const, error };
  });
  return { event, results };
}

export async function projectDiaryChange(event: DiaryChangeEvent): Promise<DiaryProjectionReport> {
  return runDiaryChangeProjectors(event, [monthlyEchoProjector]);
}
