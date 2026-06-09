import assert from 'node:assert/strict';
import { api } from '../src/services/apiClient';
import {
  createEmptyInsightDraft,
  diaryService,
  isEmptyInsightDraft,
  normalizeInsightDraftForStorage,
  type DiaryEntry,
  type InsightDraft,
  type InsightDraftInput,
} from '../src/services/diaryService';
import { ensureInsightDraftUpdated } from '../src/services/aiService';

type AsyncTest = () => void | Promise<void>;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(id: string, diaryDate: string, content: string): DiaryEntry {
  return {
    id,
    content,
    images: [],
    createdAt: `${diaryDate}T08:00:00.000Z`,
    updatedAt: `${diaryDate}T08:00:00.000Z`,
    diaryDate,
    status: 'active',
  };
}

function draftPayload(label: string): InsightDraftInput {
  return {
    identity: {
      selfPerception: `我是一个会通过日记校准自己的记录者：${label}`,
      coreValues: ['真实', '复盘', '成长'],
      lifeStage: '正在让小象回声更懂自己的阶段',
    },
    patterns: {
      recurringThemes: ['产品判断', '表达节奏', '自我观察'],
      emotionalPattern: `会在推进功能时同时关注体验和长期连续性：${label}`,
      copingStyle: '通过写日记和复盘把模糊感受整理清楚',
    },
    recentContext: {
      lastInsight: `最近在把即时回声和长期模式分层处理：${label}`,
      ongoingStruggle: '担心记忆更新失败后，回声无法真正延续理解',
      recentGrowth: '开始用更稳定的测试验证记忆是否真实写入',
    },
    meta: {
      version: 0,
      diaryCount: 0,
      confidence: 0.2,
      lastUpdated: '2026-06-08T12:00:00.000Z',
    },
  };
}

const originalApiPost = api.post;
const originalDiaryMethods = {
  getInsightDraft: diaryService.getInsightDraft,
  saveInsightDraft: diaryService.saveInsightDraft,
  getActiveEntries: diaryService.getActiveEntries,
};

function installInsightDraftMocks(options: {
  activeEntries: DiaryEntry[];
  initialDraft?: InsightDraft;
  responses: Array<InsightDraftInput | Error>;
}) {
  let currentDraft = options.initialDraft;
  const savedDrafts: InsightDraft[] = [];
  const apiCalls: Array<{ path: string; body: any }> = [];
  const responses = [...options.responses];

  diaryService.getInsightDraft = async () => currentDraft;
  diaryService.getActiveEntries = async () => options.activeEntries;
  diaryService.saveInsightDraft = async (draft: InsightDraftInput) => {
    const normalized = normalizeInsightDraftForStorage(draft);
    savedDrafts.push(normalized);
    currentDraft = normalized;
    return normalized;
  };
  api.post = async <T = any>(path: string, body?: any): Promise<T> => {
    apiCalls.push({ path, body });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('No mocked AI response left');
    return { content: JSON.stringify(next) } as T;
  };

  return { savedDrafts, apiCalls };
}

function restoreMocks(): void {
  api.post = originalApiPost;
  diaryService.getInsightDraft = originalDiaryMethods.getInsightDraft;
  diaryService.saveInsightDraft = originalDiaryMethods.saveInsightDraft;
  diaryService.getActiveEntries = originalDiaryMethods.getActiveEntries;
}

await test('ensureInsightDraftUpdated saves a non-empty draft from valid AI JSON', async () => {
  const current = entry('current', '2026-06-08', '<p>今天写日志测试长期洞察写入，要确认它真的保存到了本机。</p>');
  const mocks = installInsightDraftMocks({
    activeEntries: [current],
    responses: [draftPayload('single-update')],
  });

  try {
    const result = await ensureInsightDraftUpdated(current, { source: 'settings-repair' });

    assert.equal(result.diagnostics.status, 'success');
    assert.equal(mocks.apiCalls.length, 1);
    assert.equal(mocks.savedDrafts.length, 1);
    assert.equal(isEmptyInsightDraft(mocks.savedDrafts[0]), false);
    assert.ok(mocks.savedDrafts[0].meta.version >= 1);
    assert.equal(mocks.savedDrafts[0].meta.diaryCount, 1);
  } finally {
    restoreMocks();
  }
});

await test('first run with historical diaries creates an initial draft before incremental update', async () => {
  const current = entry('current', '2026-06-08', '<p>今天继续验证长期洞察，从历史日志里提炼模式，再用当前日志更新。</p>');
  const historyA = entry('history-a', '2026-06-06', '<p>前天在思考小象回声要从功能走向陪伴。</p>');
  const historyB = entry('history-b', '2026-06-07', '<p>昨天记录了热层和冷层分工，近期记忆要条目级更新。</p>');
  const mocks = installInsightDraftMocks({
    activeEntries: [current, historyA, historyB],
    responses: [draftPayload('initial-from-history'), draftPayload('incremental-current')],
  });

  try {
    const result = await ensureInsightDraftUpdated(current, { source: 'manual-save' });

    assert.equal(result.diagnostics.status, 'success');
    assert.equal(result.diagnostics.localDiaryCount, 3);
    assert.equal(result.diagnostics.seedDiaryCount, 2);
    assert.equal(mocks.apiCalls.length, 2);
    assert.equal(mocks.savedDrafts.length, 2);
    assert.equal(isEmptyInsightDraft(mocks.savedDrafts[1]), false);
    assert.ok(mocks.savedDrafts[1].meta.version >= 2);
    assert.equal(mocks.savedDrafts[1].meta.diaryCount, 3);
  } finally {
    restoreMocks();
  }
});

await test('AI busy once is retried and still writes the insight draft', async () => {
  const current = entry('current', '2026-06-08', '<p>今天手动生成时 AI 第一次忙，也应该重试后把长期洞察写进去。</p>');
  const existing = createEmptyInsightDraft(new Date('2026-06-07T12:00:00.000Z'));
  existing.identity.selfPerception = '我是一个会持续复盘产品体验的人';
  existing.meta.version = 3;
  existing.meta.diaryCount = 8;
  existing.meta.confidence = 0.72;
  const mocks = installInsightDraftMocks({
    activeEntries: [current],
    initialDraft: existing,
    responses: [new Error('AI 正在忙，请稍后再试'), draftPayload('retried-after-busy')],
  });

  try {
    const result = await ensureInsightDraftUpdated(current, { source: 'settings-repair' });

    assert.equal(result.diagnostics.status, 'success');
    assert.equal(mocks.apiCalls.length, 2);
    assert.equal(mocks.savedDrafts.length, 1);
    assert.equal(isEmptyInsightDraft(mocks.savedDrafts[0]), false);
    assert.ok(mocks.savedDrafts[0].meta.version >= 4);
    assert.equal(mocks.savedDrafts[0].meta.diaryCount, 1);
  } finally {
    restoreMocks();
  }
});
