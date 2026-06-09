import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Edit3, EyeOff, ShieldAlert, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppToast } from '../components/AppToast';
import { APP_BUILD_ID } from '../config/buildInfo';
import { isAuthenticated } from '../services/apiClient';
import {
  ensureEchoHotMemoryUpdated,
  ensureInsightDraftUpdated,
  getInsightDraftDiagnostics,
  type InsightDraftUpdateDiagnostics,
} from '../services/aiService';
import {
  diaryService,
  isEmptyEchoHotMemory,
  isEmptyInsightDraft,
  type EchoHotMemory,
  type EchoMemoryEntry,
  type InsightDraft,
} from '../services/diaryService';
import {
  editEchoMemoryEntryContent,
  forgetEchoMemoryEntry,
  markEchoMemoryEntrySensitive,
  rejectEchoMemoryEntry,
} from '../services/echoMemoryControl';

function stringifyEchoHotMemory(memory: EchoHotMemory) {
  return JSON.stringify(memory, null, 2);
}

const memoryKindLabels: Record<EchoMemoryEntry['kind'], string> = {
  detail: '具体细节',
  theme: '近期主题',
  unfinished_question: '未完成问题',
  growth_shift: '成长变化',
  tone_preference: '陪伴偏好',
  boundary: '边界提醒',
  sensitive_context: '敏感线索',
};

const memorySensitivityLabels: Record<EchoMemoryEntry['sensitivity'], string> = {
  low: '低敏',
  medium: '中敏',
  high: '高敏',
};

function canMemoryJoinEcho(entry: EchoMemoryEntry): boolean {
  if (entry.status !== 'active') return false;
  if (entry.visibility === 'never_echo') return false;
  if (entry.sensitivity === 'high') return false;
  if (entry.userFeedback === 'rejected' || entry.userFeedback === 'suppressed') return false;
  if (!entry.expiresAt) return true;
  const expiresAt = new Date(entry.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function formatInsightSummary(draft: InsightDraft | null): string[] {
  if (!draft || isEmptyInsightDraft(draft)) return ['长期洞察尚未生成。'];
  const lines = [
    draft.recentContext.lastInsight && `最近洞察：${draft.recentContext.lastInsight}`,
    draft.recentContext.ongoingStruggle && `仍在消化：${draft.recentContext.ongoingStruggle}`,
    draft.recentContext.recentGrowth && `近期变化：${draft.recentContext.recentGrowth}`,
    draft.patterns.recurringThemes.length > 0 && `反复主题：${draft.patterns.recurringThemes.join('、')}`,
  ].filter(Boolean) as string[];
  return lines.length > 0 ? lines : ['长期洞察已生成，但暂时没有可展示的摘要字段。'];
}

export default function InsightDraftSettings() {
  const navigate = useNavigate();
  const [hotMemory, setHotMemory] = useState<EchoHotMemory | null>(null);
  const [hotMemoryText, setHotMemoryText] = useState('');
  const [insightDraft, setInsightDraft] = useState<InsightDraft | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<InsightDraftUpdateDiagnostics | null>(null);
  const [localDiaryCount, setLocalDiaryCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  const loadInsightDraft = async () => {
    const [memory, draft, activeEntries] = await Promise.all([
      diaryService.getEchoHotMemory(),
      diaryService.getInsightDraft(),
      diaryService.getActiveEntries(),
    ]);
    const displayMemory = memory || diaryService.createEmptyEchoHotMemory();
    setHotMemory(memory || null);
    setHotMemoryText(stringifyEchoHotMemory(displayMemory));
    setInsightDraft(draft || null);
    setLocalDiaryCount(activeEntries.length);
    setDiagnostics(getInsightDraftDiagnostics());
  };

  const handleSaveHotMemory = async () => {
    setIsBusy(true);
    try {
      const parsed = JSON.parse(hotMemoryText);
      if (isEmptyEchoHotMemory(parsed)) {
        await diaryService.clearEchoHotMemory();
        const emptyMemory = diaryService.createEmptyEchoHotMemory();
        setHotMemory(null);
        setHotMemoryText(stringifyEchoHotMemory(emptyMemory));
        showToast('空近期记忆不会保存');
        return;
      }
      const saved = await diaryService.saveEchoHotMemory(parsed);
      setHotMemory(saved);
      setHotMemoryText(stringifyEchoHotMemory(saved));
      showToast('近期记忆已保存');
    } catch (error) {
      console.warn('Failed to save echo hot memory:', error);
      showToast('近期记忆格式不正确');
    } finally {
      setIsBusy(false);
    }
  };

  const saveHotMemory = async (memory: EchoHotMemory, message: string) => {
    const saved = await diaryService.saveEchoHotMemory(memory);
    setHotMemory(saved);
    setHotMemoryText(stringifyEchoHotMemory(saved));
    showToast(message);
  };

  const handleForgetMemoryEntry = async (entryId: string) => {
    if (!hotMemory) return;
    setIsBusy(true);
    try {
      await saveHotMemory(forgetEchoMemoryEntry(hotMemory, entryId), '这条近期记忆已忘记');
    } catch (error) {
      console.warn('Failed to forget echo hot memory entry:', error);
      showToast('近期记忆删除失败');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartEditMemory = (entry: EchoMemoryEntry) => {
    setEditingMemoryId(entry.id);
    setEditingMemoryText(entry.content);
  };

  const handleSaveMemoryEdit = async (entryId: string) => {
    const content = editingMemoryText.trim();
    if (!content) {
      showToast('近期记忆不能为空');
      return;
    }
    if (!hotMemory) return;
    setIsBusy(true);
    try {
      await saveHotMemory(editEchoMemoryEntryContent(hotMemory, entryId, content), '这条近期记忆已改好');
    } catch (error) {
      console.warn('Failed to edit echo hot memory entry:', error);
      showToast('近期记忆更新失败');
    } finally {
      setIsBusy(false);
    }
    setEditingMemoryId(null);
    setEditingMemoryText('');
  };

  const handleRejectMemoryEntry = async (entryId: string) => {
    if (!hotMemory) return;
    setIsBusy(true);
    try {
      await saveHotMemory(rejectEchoMemoryEntry(hotMemory, entryId), '小象不会再这样理解你');
    } catch (error) {
      console.warn('Failed to reject echo hot memory entry:', error);
      showToast('近期记忆更新失败');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkSensitiveMemoryEntry = async (entryId: string) => {
    if (!hotMemory) return;
    setIsBusy(true);
    try {
      await saveHotMemory(markEchoMemoryEntrySensitive(hotMemory, entryId), '已标记为敏感线索');
    } catch (error) {
      console.warn('Failed to mark echo hot memory entry sensitive:', error);
      showToast('近期记忆更新失败');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearHotMemory = async () => {
    if (!window.confirm('只清空近期记忆，不会删除日记、已保存回声或长期洞察。确定清空吗？')) return;
    setIsBusy(true);
    try {
      await diaryService.clearEchoHotMemory();
      const emptyMemory = diaryService.createEmptyEchoHotMemory();
      setHotMemory(null);
      setHotMemoryText(stringifyEchoHotMemory(emptyMemory));
      setDiagnostics(getInsightDraftDiagnostics());
      showToast('近期记忆已清空');
    } catch (error) {
      console.warn('Failed to clear echo hot memory:', error);
      showToast('近期记忆清空失败');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRepairInsightDraft = async () => {
    setIsBusy(true);
    try {
      const activeEntries = await diaryService.getActiveEntries();
      setLocalDiaryCount(activeEntries.length);
      const latestEntry = activeEntries.find(entry =>
        entry.status === 'active'
        && !entry.isHidden
        && (entry.content || '').replace(/<[^>]*>/g, ' ').trim().length >= 6,
      );
      if (!latestEntry) {
        showToast('暂无足够内容生成记忆');
        return;
      }

      const insightDraftResult = await ensureInsightDraftUpdated(latestEntry, {
        forceRemotePull: true,
        source: 'settings-repair',
      });
      const hotMemoryResult = await ensureEchoHotMemoryUpdated(latestEntry);
      await loadInsightDraft();
      setDiagnostics(getInsightDraftDiagnostics());
      const draftOk = insightDraftResult.diagnostics.status === 'success';
      if (draftOk) {
        showToast('小象回声记忆已生成/修复');
      }
      if (hotMemoryResult.status === 'failed') {
        console.warn('Echo hot memory repair failed after insight draft attempt:', hotMemoryResult.error);
      }
    } catch (error) {
      console.warn('Failed to repair echo memory:', error);
      setDiagnostics(getInsightDraftDiagnostics());
      showToast('记忆生成/修复失败');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    loadInsightDraft().catch(error => {
      console.warn('Failed to load insight draft:', error);
      showToast('洞察草稿读取失败');
    });
  }, []);

  const hasDraft = Boolean(insightDraft && !isEmptyInsightDraft(insightDraft));
  const hasHotMemory = Boolean(hotMemory && !isEmptyEchoHotMemory(hotMemory));
  const memoryEntries = hotMemory?.entries || [];
  const insightSummary = formatInsightSummary(insightDraft);

  return (
    <div className="min-h-screen bg-background text-on-surface pb-[calc(32px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex items-center justify-center bg-background/95 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 bottom-2 flex h-11 w-11 items-center justify-center rounded-full active:bg-surface-container-low"
          aria-label="返回设置"
        >
          <ArrowLeft className="h-7 w-7" />
        </button>
        <h1 className="text-[22px] font-bold tracking-wide">小象回声记忆</h1>
      </header>

      <main className="app-content-container settings-content-container space-y-4 pt-4">
        <section className="rounded-3xl bg-surface-container-lowest px-5 py-5 text-left shadow-[0_8px_26px_rgba(47,52,46,0.04)]">
          <p className="text-[16px] font-semibold text-on-surface">这是小象回声只保存在本机的记忆。</p>
          <p className="mt-3 text-[14px] leading-7 text-on-surface-variant">
            近期线索会在自然相关时轻轻影响回声，长期洞察只作为内部索引；它们不会进入云端同步、导出包或聊天历史。
          </p>
          <p className="mt-3 text-[12px] leading-5 text-on-surface-variant/80">
            {hasHotMemory
              ? `近期记忆 v${hotMemory!.version}，${hotMemory!.entries.length} 条，更新于 ${new Date(hotMemory!.updatedAt).toLocaleString()}。`
              : `近期记忆尚未生成。本机当前有 ${localDiaryCount} 篇日记。`}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-on-surface-variant/80">
            {hasDraft
              ? `长期洞察 v${insightDraft!.meta.version}，置信度 ${Math.round(insightDraft!.meta.confidence * 100)}%，累计 ${insightDraft!.meta.diaryCount} 篇。`
              : '长期洞察尚未生成。'}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-on-surface-variant/70">
            前端构建：{APP_BUILD_ID} · 登录态：{isAuthenticated() ? '已登录' : '未登录'}
          </p>
        </section>

        <section className="rounded-3xl bg-surface-container-low px-5 py-4 text-left text-[13px] leading-6 text-on-surface-variant">
          <p className="text-[15px] font-semibold text-on-surface">写入诊断</p>
          <p className="mt-2">近期记忆：{diagnostics?.hotMemoryStatus || '暂无记录'}；长期洞察：{diagnostics?.status || '暂无记录'}</p>
          <p>历史拉取：{diagnostics?.pulledRemote ? '成功' : '未执行/失败'}</p>
          <p>种子日记：{diagnostics?.seedDiaryCount ?? 0} 篇；回声上下文：{diagnostics?.recentDiaryCount ?? 0} 篇</p>
          {diagnostics?.hotMemoryVersion !== undefined && <p>近期记忆版本：v{diagnostics.hotMemoryVersion}；条目：{diagnostics.hotMemoryEntryCount ?? 0} 条</p>}
          {diagnostics?.lastAttemptAt && <p>最近尝试：{new Date(diagnostics.lastAttemptAt).toLocaleString()}</p>}
          {diagnostics?.lastSuccessAt && <p>最近成功：{new Date(diagnostics.lastSuccessAt).toLocaleString()}</p>}
          {diagnostics?.hotMemoryError && <p className="mt-1 text-error">近期记忆失败原因：{diagnostics.hotMemoryError}</p>}
          {diagnostics?.error && <p className="mt-1 text-error">失败原因：{diagnostics.error}</p>}
        </section>

        <button
          onClick={handleRepairInsightDraft}
          disabled={isBusy}
          className="w-full rounded-2xl bg-primary py-4 text-[16px] font-semibold text-white shadow-[0_8px_20px_rgba(68,103,51,0.18)] active:scale-[0.99] disabled:opacity-50"
        >
          {isBusy ? '生成中...' : '立即生成/修复记忆'}
        </button>

        <section className="space-y-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[16px] font-semibold text-on-surface">近期记忆线索</p>
              <p className="mt-1 text-[12px] text-on-surface-variant">你可以让小象忘记、改写，或别再这样理解你。</p>
            </div>
            <button
              onClick={handleClearHotMemory}
              disabled={isBusy || !hasHotMemory}
              className="rounded-full bg-surface-container-low px-4 py-2 text-[12px] font-medium text-on-surface active:scale-[0.99] disabled:opacity-50"
            >
              清空
            </button>
          </div>

          {memoryEntries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-surface-container-high px-5 py-8 text-center text-[14px] leading-7 text-on-surface-variant">
              近期线索尚未生成。写几篇日记后，小象会只在本机留下很少的连续性线索。
            </div>
          ) : (
            memoryEntries.map((entry) => {
              const canJoinEcho = canMemoryJoinEcho(entry);
              const isEditing = editingMemoryId === entry.id;
              return (
                <article key={entry.id} className="rounded-3xl bg-surface-container-lowest px-4 py-4 shadow-[0_8px_24px_rgba(47,52,46,0.04)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
                    <span className="rounded-full bg-surface-container-low px-2.5 py-1">{memoryKindLabels[entry.kind]}</span>
                    <span className="rounded-full bg-surface-container-low px-2.5 py-1">{memorySensitivityLabels[entry.sensitivity]}</span>
                    <span className={`rounded-full px-2.5 py-1 ${canJoinEcho ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>
                      {canJoinEcho ? '可参与回声' : '不会主动提起'}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={editingMemoryText}
                        onChange={(event) => setEditingMemoryText(event.target.value)}
                        className="min-h-28 w-full rounded-2xl border border-surface-container-high bg-surface-container-low p-3 text-[14px] leading-6 outline-none focus:border-primary"
                        maxLength={150}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingMemoryId(null);
                            setEditingMemoryText('');
                          }}
                          className="flex h-10 items-center gap-1 rounded-full bg-surface-container-low px-3 text-[13px]"
                        >
                          <X className="h-4 w-4" /> 取消
                        </button>
                        <button
                          onClick={() => handleSaveMemoryEdit(entry.id)}
                          disabled={isBusy}
                          className="flex h-10 items-center gap-1 rounded-full bg-primary px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-on-surface">{entry.content}</p>
                  )}

                  {!isEditing && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleStartEditMemory(entry)}
                        className="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-surface-container-low px-2 text-center text-[13px] font-medium leading-4"
                      >
                        <Edit3 className="h-4 w-4 shrink-0" /> 改一下
                      </button>
                      <button
                        onClick={() => handleForgetMemoryEntry(entry.id)}
                        disabled={isBusy}
                        className="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-surface-container-low px-2 text-center text-[13px] font-medium leading-4 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" /> 忘记
                      </button>
                      <button
                        onClick={() => handleRejectMemoryEntry(entry.id)}
                        disabled={isBusy}
                        className="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-surface-container-low px-2 text-center text-[13px] font-medium leading-4 disabled:opacity-50"
                      >
                        <EyeOff className="h-4 w-4 shrink-0" /> 不再这样理解我
                      </button>
                      <button
                        onClick={() => handleMarkSensitiveMemoryEntry(entry.id)}
                        disabled={isBusy}
                        className="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-surface-container-low px-2 text-center text-[13px] font-medium leading-4 disabled:opacity-50"
                      >
                        <ShieldAlert className="h-4 w-4 shrink-0" /> 标记太敏感
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        <section className="rounded-3xl bg-surface-container-low px-5 py-4 text-left">
          <p className="text-[15px] font-semibold text-on-surface">长期洞察索引</p>
          <p className="mt-2 text-[13px] leading-6 text-on-surface-variant">
            长期洞察只帮助整理近期线索，不会直接出现在回声里。
          </p>
          <div className="mt-3 space-y-2 text-[13px] leading-6 text-on-surface-variant">
            {insightSummary.map((line, index) => <p key={index}>{line}</p>)}
          </div>
        </section>

        <section className="rounded-3xl bg-surface-container-low px-5 py-4 text-left">
          <button
            onClick={() => setIsAdvancedOpen(value => !value)}
            className="flex w-full items-center justify-between text-[15px] font-semibold text-on-surface"
          >
            高级 JSON 编辑
            <span className="text-[12px] font-normal text-on-surface-variant">{isAdvancedOpen ? '收起' : '展开'}</span>
          </button>
          {isAdvancedOpen && (
            <div className="mt-4 space-y-3">
              <textarea
                value={hotMemoryText}
                onChange={(event) => setHotMemoryText(event.target.value)}
                spellCheck={false}
                className="min-h-[40vh] w-full rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 font-mono text-[12px] leading-6 text-on-surface outline-none focus:border-primary"
                placeholder="近期记忆会在第一次后台更新后出现。"
              />
              <button
                onClick={handleSaveHotMemory}
                disabled={isBusy || !hotMemoryText.trim()}
                className="w-full rounded-2xl bg-primary py-4 text-[15px] font-semibold text-white active:scale-[0.99] disabled:opacity-50"
              >
                {isBusy ? '保存中...' : '保存 JSON'}
              </button>
            </div>
          )}
        </section>
      </main>

      <AppToast message={toastMessage} />
    </div>
  );
}
