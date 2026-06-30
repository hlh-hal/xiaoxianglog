import type { DailyEcho, DiaryEntry } from '../diary/model';
import { diaryService, isEmptyInsightDraft } from '../../services/diaryService';
import {
  ensureEchoHotMemoryUpdated,
  ensureInsightDraftUpdated,
  generateDiaryEcho,
} from '../../services/aiService';

export function getDiaryPlainText(entry: DiaryEntry): string {
  if (typeof document === 'undefined') {
    return (entry.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const node = document.createElement('div');
  node.innerHTML = entry.content || '';
  return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
}

/** 汇集回声所需上下文并返回可直接持久化的领域对象。 */
export async function generateDailyEchoForEntry(
  entry: DiaryEntry,
  regenerateCount: number,
): Promise<DailyEcho> {
  const [draft, hotMemory, activeEntries] = await Promise.all([
    diaryService.getInsightDraft(),
    diaryService.getEchoHotMemory(),
    diaryService.getActiveEntries(),
  ]);
  const insightDraft = draft && !isEmptyInsightDraft(draft) ? draft : undefined;
  const recentDiaries = activeEntries.filter(item => item.id !== entry.id).slice(0, 8);
  const content = await generateDiaryEcho(entry, regenerateCount, insightDraft, recentDiaries, hotMemory);

  return {
    status: 'saved',
    content,
    styleId: 'gentle',
    generatedAt: new Date().toISOString(),
    sourceEntryUpdatedAt: entry.updatedAt,
    regenerateCount,
  };
}

/** 按既有顺序更新冷、热两层记忆；失败被报告但不会影响日记保存。 */
export async function refreshDailyEchoMemory(entry: DiaryEntry): Promise<{
  insightDraftError?: string;
  hotMemoryError?: string;
}> {
  const result: { insightDraftError?: string; hotMemoryError?: string } = {};
  const insightDraftResult = await ensureInsightDraftUpdated(entry, {
    forceRemotePull: true,
    source: 'manual-save',
  });
  if (insightDraftResult.diagnostics.status === 'failed') {
    result.insightDraftError = insightDraftResult.diagnostics.error;
  }

  const hotMemoryResult = await ensureEchoHotMemoryUpdated(entry);
  if (hotMemoryResult.status === 'failed') {
    result.hotMemoryError = hotMemoryResult.error;
  }
  return result;
}
