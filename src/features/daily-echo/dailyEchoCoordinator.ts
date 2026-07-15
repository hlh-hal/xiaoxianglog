import type { DailyEcho, DiaryEntry } from '../diary/model';
import { diaryService, isEmptyInsightDraft } from '../../services/diaryService';
import type { CreateDailyEchoJobInput } from '../../services/dailyEchoService';
import {
  buildPromptMemoryPack,
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

/**
 * Select the smallest relevant local memory pack before enqueueing. Raw hot-memory
 * records stay on-device; the durable job receives only the prompt context and ids.
 */
export async function buildDailyEchoJobInput(
  entry: DiaryEntry,
  regenerateCount: number,
): Promise<CreateDailyEchoJobInput> {
  const diaryText = getDiaryPlainText(entry);
  const hotMemory = await diaryService.getEchoHotMemory();
  const memoryPack = buildPromptMemoryPack(diaryText, hotMemory);
  return {
    entryId: entry.id,
    diaryText,
    diaryDate: entry.diaryDate,
    sourceEntryUpdatedAt: entry.updatedAt,
    regenerateCount,
    memoryContext: memoryPack.context,
    selectedMemoryEntryIds: memoryPack.selectedEntryIds,
  };
}

/** Mark only memory entries that were actually attached to a successful server job. */
export async function markDailyEchoMemoryEntriesUsed(
  selectedEntryIds: string[],
  usedAt = new Date().toISOString(),
): Promise<void> {
  if (selectedEntryIds.length === 0) return;
  const hotMemory = await diaryService.getEchoHotMemory();
  if (!hotMemory) return;

  const selected = new Set(selectedEntryIds);
  let changed = false;
  const entries = hotMemory.entries.map(entry => {
    if (!selected.has(entry.id)) return entry;
    if (entry.lastUsedInPromptAt && entry.lastUsedInPromptAt >= usedAt) return entry;
    changed = true;
    return { ...entry, lastUsedInPromptAt: usedAt };
  });
  if (!changed) return;

  await diaryService.saveEchoHotMemory({
    ...hotMemory,
    version: hotMemory.version + 1,
    updatedAt: usedAt,
    entries,
  });
}

/** Local-only compatibility path. It remains foreground-bound by design. */
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
