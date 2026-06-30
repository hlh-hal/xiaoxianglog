import type { DiaryEntry } from './model';

export type DiaryChangeKind = 'created' | 'updated' | 'trashed' | 'restored';

export interface DiaryChange {
  kind: DiaryChangeKind;
  entry: DiaryEntry;
  previousEntry?: DiaryEntry;
}

export interface DiaryPostCommitEffect {
  name: string;
  run(change: DiaryChange): Promise<void>;
}

export interface DiaryPostCommitEffectResult {
  name: string;
  status: 'fulfilled' | 'rejected';
  error?: string;
}

export interface DiaryPostCommitReport {
  entryId: string;
  kind: DiaryChangeKind;
  effects: DiaryPostCommitEffectResult[];
  completedAt: string;
}

type CoordinatorLogger = Pick<Console, 'warn'>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

/**
 * 负责执行日记提交后的可选副作用。副作用失败会进入报告，但永远不会反向
 * 破坏已经完成的 IndexedDB 提交。
 */
export class DiaryPostCommitCoordinator {
  private readonly pending = new Set<Promise<DiaryPostCommitReport>>();
  private readonly entryQueues = new Map<string, Promise<DiaryPostCommitReport>>();
  private lastReport: DiaryPostCommitReport | null = null;

  constructor(private readonly logger: CoordinatorLogger = console) {}

  async execute(change: DiaryChange, effects: DiaryPostCommitEffect[]): Promise<DiaryPostCommitReport> {
    const results: DiaryPostCommitEffectResult[] = [];
    // Vault 必须先于云同步完成，避免两个适配器并行回写同一条 IndexedDB 记录。
    for (const effect of effects) {
      try {
        await effect.run(change);
        results.push({ name: effect.name, status: 'fulfilled' });
      } catch (error) {
        const message = errorMessage(error);
        this.logger.warn(`[diary-post-commit] ${effect.name} failed for ${change.entry.id}: ${message}`);
        results.push({ name: effect.name, status: 'rejected', error: message });
      }
    }

    const report: DiaryPostCommitReport = {
      entryId: change.entry.id,
      kind: change.kind,
      effects: results,
      completedAt: new Date().toISOString(),
    };
    this.lastReport = report;
    return report;
  }

  schedule(change: DiaryChange, effects: DiaryPostCommitEffect[]): void {
    const previous = this.entryQueues.get(change.entry.id);
    const task = previous
      ? previous.then(() => this.execute(change, effects))
      : this.execute(change, effects);
    this.entryQueues.set(change.entry.id, task);
    this.pending.add(task);
    void task.finally(() => {
      this.pending.delete(task);
      if (this.entryQueues.get(change.entry.id) === task) {
        this.entryQueues.delete(change.entry.id);
      }
    });
  }

  getStatus(): { pendingCount: number; lastReport: DiaryPostCommitReport | null } {
    return { pendingCount: this.pending.size, lastReport: this.lastReport };
  }

  async flush(): Promise<DiaryPostCommitReport[]> {
    return Promise.all([...this.pending]);
  }
}
