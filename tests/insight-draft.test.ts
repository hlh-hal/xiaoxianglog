import assert from 'node:assert/strict';
import type { DiaryEntry } from '../src/services/diaryService';
import {
  buildSyncPushPayload,
  createEmptyInsightDraft,
  isEmptyInsightDraft,
  normalizeInsightDraftForStorage,
} from '../src/services/diaryService';
import {
  buildInitialInsightDraftPrompt,
  buildInsightUpdatePrompt,
  parseGeneratedInsightDraftForTest,
} from '../src/services/aiService';

function test(name: string, fn: () => void): void {
  try {
    fn();
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

test('creates a low-confidence narrative draft shell', () => {
  const now = new Date('2026-06-07T12:00:00.000Z');
  const draft = createEmptyInsightDraft(now);

  assert.deepEqual(draft.identity, {
    selfPerception: '',
    coreValues: [],
    lifeStage: '',
  });
  assert.deepEqual(draft.patterns, {
    recurringThemes: [],
    emotionalPattern: '',
    copingStyle: '',
  });
  assert.equal(draft.meta.version, 0);
  assert.equal(draft.meta.confidence, 0.3);
  assert.equal(draft.meta.lastUpdated.toISOString(), now.toISOString());
});

test('treats persisted v0 shell as uninitialized insight draft', () => {
  const empty = createEmptyInsightDraft(new Date('2026-06-07T12:00:00.000Z'));
  assert.equal(isEmptyInsightDraft(empty), true);

  const generated = normalizeInsightDraftForStorage({
    ...empty,
    recentContext: {
      lastInsight: '今天真正卡住的是如何让回声从功能走向情感分享。',
    },
    meta: {
      version: 1,
      diaryCount: 148,
      confidence: 0.9,
      lastUpdated: '2026-06-07T13:30:00.000Z',
    },
  });

  assert.equal(isEmptyInsightDraft(generated), false);
});

test('treats metadata-only draft as uninitialized insight draft', () => {
  const metadataOnly = normalizeInsightDraftForStorage({
    meta: {
      version: 1,
      diaryCount: 148,
      confidence: 0.9,
      lastUpdated: '2026-06-07T13:30:00.000Z',
    },
  });

  assert.equal(isEmptyInsightDraft(metadataOnly), true);
  assert.equal(
    [
      metadataOnly.identity.selfPerception,
      ...metadataOnly.identity.coreValues,
      metadataOnly.identity.lifeStage,
      ...metadataOnly.patterns.recurringThemes,
      metadataOnly.patterns.emotionalPattern,
      metadataOnly.patterns.copingStyle,
      metadataOnly.recentContext.lastInsight,
      metadataOnly.recentContext.ongoingStruggle,
      metadataOnly.recentContext.recentGrowth,
    ].some(Boolean),
    false,
  );
});

test('rejects non-json insight draft responses', () => {
  assert.throws(() => parseGeneratedInsightDraftForTest('今天看起来很充实。', {
    diaryCount: 3,
    now: new Date('2026-06-07T12:00:00.000Z'),
    source: 'initial',
  }));
});

test('rejects empty-json and metadata-only insight draft responses', () => {
  assert.throws(() => parseGeneratedInsightDraftForTest('{}', {
    diaryCount: 3,
    now: new Date('2026-06-07T12:00:00.000Z'),
    source: 'initial',
  }));

  assert.throws(() => parseGeneratedInsightDraftForTest(JSON.stringify({
    meta: {
      version: 1,
      lastUpdated: '2026-06-07T12:00:00.000Z',
      diaryCount: 3,
      confidence: 0.42,
    },
  }), {
    diaryCount: 3,
    now: new Date('2026-06-07T12:00:00.000Z'),
    source: 'update',
  }));
});

test('accepts a generated narrative insight draft and enforces metadata', () => {
  const parsed = parseGeneratedInsightDraftForTest(JSON.stringify({
    identity: {
      selfPerception: '我正在把产品判断和真实感受慢慢接起来。',
      coreValues: ['真实', '表达', '成长'],
      lifeStage: '持续打磨小象日志的探索期',
    },
    patterns: {
      recurringThemes: ['产品体验', '复盘', '表达欲'],
      emotionalPattern: '疲惫和灵感并存',
      copingStyle: '通过写日记梳理自己真正卡住的地方',
    },
    recentContext: {
      lastInsight: '真正重要的不是导出按钮，而是被记录的冲动。',
      ongoingStruggle: '如何让工具性的功能变成用户愿意分享的瞬间',
      recentGrowth: '开始从功能实现走向体验共创',
    },
    meta: {
      version: 0,
      lastUpdated: '2026-06-01T00:00:00.000Z',
      diaryCount: 0,
      confidence: 0.1,
    },
  }), {
    diaryCount: 12,
    now: new Date('2026-06-07T12:00:00.000Z'),
    source: 'initial',
  });

  assert.equal(parsed.meta.version, 1);
  assert.equal(parsed.meta.diaryCount, 12);
  assert.ok(parsed.meta.confidence >= 0.7);
  assert.equal(isEmptyInsightDraft(parsed), false);
});

test('normalizes stored insight draft dates, arrays, version, and confidence', () => {
  const normalized = normalizeInsightDraftForStorage({
    identity: {
      selfPerception: '  我是一个总在复盘里找方向的人  ',
      coreValues: ['真实', '稳定', '成长', '多余'],
    },
    patterns: {
      recurringThemes: ['产品判断', '写作节奏'],
    },
    meta: {
      version: 2.8,
      lastUpdated: '2026-06-07T08:30:00.000Z',
      diaryCount: 12.4,
      confidence: 1.8,
    },
  });

  assert.equal(normalized.identity.selfPerception, '我是一个总在复盘里找方向的人');
  assert.deepEqual(normalized.identity.coreValues, ['真实', '稳定', '成长']);
  assert.equal(normalized.meta.version, 2);
  assert.equal(normalized.meta.diaryCount, 12);
  assert.equal(normalized.meta.confidence, 1);
  assert.equal(normalized.meta.lastUpdated.toISOString(), '2026-06-07T08:30:00.000Z');
});

test('initial draft prompt asks for first draft from existing diaries', () => {
  const prompt = buildInitialInsightDraftPrompt([
    entry('1', '2026-06-01', '<p>最近一直在调整小象回声，希望它更像懂我的朋友。</p>'),
    entry('2', '2026-06-02', '<p>今天有点累，但跑步之后清醒很多。</p>'),
  ], new Date('2026-06-07T12:00:00.000Z'));

  assert.ok(prompt.includes('第一份'));
  assert.ok(prompt.includes('叙事化理解草稿'));
  assert.ok(prompt.includes('不是用户画像'));
  assert.ok(prompt.includes('version 设为 1'));
  assert.ok(prompt.includes('diaryCount 设为 2'));
  assert.ok(prompt.includes('只输出完整 JSON'));
});

test('incremental prompt preserves old understanding and updates metadata', () => {
  const draft = createEmptyInsightDraft(new Date('2026-06-01T00:00:00.000Z'));
  draft.identity.selfPerception = '我是一个会通过写日记校准自己的人';
  draft.meta.version = 4;
  draft.meta.diaryCount = 9;
  draft.meta.confidence = 0.66;

  const prompt = buildInsightUpdatePrompt(draft, {
    title: '今天的小结',
    content: '继续迭代回声提示词，但提醒自己不要过度设计。',
    mood: '平静',
    tags: ['产品', '复盘'],
    diaryDate: '2026-06-07',
  }, new Date('2026-06-07T12:00:00.000Z'));

  assert.ok(prompt.includes('如果没有新信息，保持原字段不动'));
  assert.ok(prompt.includes('把 version 加 1'));
  assert.ok(prompt.includes('lastUpdated 更新为 2026-06-07T12:00:00.000Z'));
  assert.ok(prompt.includes('confidence'));
  assert.ok(prompt.includes('超过 90 天'));
  assert.ok(prompt.includes('只输出更新后的完整 JSON'));
});

test('sync push payload never includes local insight draft data', () => {
  const draft = createEmptyInsightDraft(new Date('2026-06-07T12:00:00.000Z'));
  draft.identity.selfPerception = '我是一个只应该留在本机的理解草稿';

  const payload = buildSyncPushPayload([
    {
      ...entry('private-entry', '2026-06-07', '<p>今天保存一篇日记。</p>'),
      userId: 'local-user',
      syncVersion: 12,
      dailyEcho: {
        status: 'saved',
        content: '看见你在慢慢整理自己。',
        styleId: 'gentle',
        generatedAt: '2026-06-07T12:00:00.000Z',
        sourceEntryUpdatedAt: '2026-06-07T12:00:00.000Z',
        regenerateCount: 0,
        card: {
          width: 1080,
          height: 1440,
          renderedAt: '2026-06-07T12:00:00.000Z',
          localDataUrl: 'data:image/png;base64,local-only',
        },
      },
      insightDraft: draft,
      echoHotMemory: {
        seed: '本机近期记忆',
        entries: [{
          content: '这段近期记忆也不应该同步到云端',
        }],
      },
    } as DiaryEntry & { insightDraft: unknown; echoHotMemory: unknown },
  ]);

  const serialized = JSON.stringify(payload);
  assert.ok(serialized.includes('"entries"'));
  assert.ok(!serialized.includes('insightDraft'));
  assert.ok(!serialized.includes('echoHotMemory'));
  assert.ok(!serialized.includes('只应该留在本机'));
  assert.ok(!serialized.includes('近期记忆也不应该同步'));
  assert.ok(!serialized.includes('local-only'));
  assert.ok(!serialized.includes('syncVersion'));
  assert.ok(!serialized.includes('local-user'));
});
