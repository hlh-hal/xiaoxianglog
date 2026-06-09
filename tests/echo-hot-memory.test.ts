import assert from 'node:assert/strict';
import type { DiaryEntry, EchoHotMemory } from '../src/services/diaryService';
import {
  ECHO_HOT_MEMORY_ENTRY_MAX_LENGTH,
  ECHO_HOT_MEMORY_MAX_ENTRIES,
  ECHO_HOT_MEMORY_SEED_MAX_LENGTH,
  createEmptyEchoHotMemory,
  createEmptyInsightDraft,
  getEchoHotMemoryStorageId,
  normalizeEchoHotMemoryForStorage,
  normalizeEchoMemorySnapshot,
} from '../src/services/diaryService';
import {
  applyEchoHotMemoryOp,
  buildEchoHotMemoryUpdatePrompt,
  buildPromptMemoryPack,
} from '../src/services/aiService';
import {
  editEchoMemoryEntryContent,
  forgetEchoMemoryEntry,
  markEchoMemoryEntrySensitive,
  rejectEchoMemoryEntry,
} from '../src/services/echoMemoryControl';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(id = 'entry-1', content = '<p>Today I kept refining XiaoXiang Echo memory so it feels more continuous.</p>'): DiaryEntry {
  return {
    id,
    content,
    images: [],
    createdAt: '2026-06-08T08:00:00.000Z',
    updatedAt: '2026-06-08T08:00:00.000Z',
    diaryDate: '2026-06-08',
    status: 'active',
  };
}

function memoryEntry(index: number, overrides: Partial<EchoHotMemory['entries'][number]> = {}): EchoHotMemory['entries'][number] {
  return {
    id: `memory-${index}`,
    content: `Recent cue ${index}: user is refining XiaoXiang Echo memory.`,
    source: 'ai_inferred',
    sourceDiaryIds: [`diary-${index}`],
    createdAt: `2026-05-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
    lastReinforcedAt: `2026-05-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
    reinforceCount: index,
    status: 'active',
    kind: 'theme',
    visibility: 'direct',
    sensitivity: 'low',
    userFeedback: 'unreviewed',
    counterEvidenceDiaryIds: [],
    ...overrides,
  };
}

test('normalizes hot memory capacity, seed length, and entry length', () => {
  const longSeed = 'a person carefully turning echo memory into better continuity for diary reflection';
  const longContent = 'This is a very long recent cue about XiaoXiang Echo memory. '.repeat(20);
  const memory = normalizeEchoHotMemoryForStorage({
    version: 2.8,
    seed: longSeed,
    entries: Array.from({ length: 12 }, (_, index) => memoryEntry(index, index === 0 ? { content: longContent } : {})),
    updatedAt: '2026-06-08T08:00:00.000Z',
  });

  assert.equal(memory.version, 2);
  assert.ok(Array.from(memory.seed).length <= ECHO_HOT_MEMORY_SEED_MAX_LENGTH);
  assert.equal(memory.entries.length, ECHO_HOT_MEMORY_MAX_ENTRIES);
  assert.ok(memory.entries.every(item => Array.from(item.content).length <= ECHO_HOT_MEMORY_ENTRY_MAX_LENGTH));
});

test('normalizes legacy hot-memory entries with v2 defaults', () => {
  const memory = normalizeEchoHotMemoryForStorage({
    version: 1,
    seed: '',
    entries: [
      {
        id: 'legacy',
        content: 'Legacy cue without v2 fields.',
        source: 'ai_inferred',
        sourceDiaryIds: ['diary-legacy'],
        createdAt: '2026-06-01T08:00:00.000Z',
        lastReinforcedAt: '2026-06-01T08:00:00.000Z',
        reinforceCount: 1,
        status: 'active',
      },
      memoryEntry(2, {
        id: 'high-sensitive',
        sensitivity: 'high',
        visibility: 'direct',
      }),
    ] as EchoHotMemory['entries'],
    updatedAt: '2026-06-08T08:00:00.000Z',
  });

  const legacyEntry = memory.entries.find(item => item.id === 'legacy');
  assert.equal(legacyEntry?.kind, 'theme');
  assert.equal(legacyEntry?.visibility, 'direct');
  assert.equal(legacyEntry?.sensitivity, 'low');
  assert.equal(legacyEntry?.userFeedback, 'unreviewed');
  assert.deepEqual(legacyEntry?.counterEvidenceDiaryIds, []);

  const highSensitiveEntry = memory.entries.find(item => item.id === 'high-sensitive');
  assert.equal(highSensitiveEntry?.sensitivity, 'high');
  assert.equal(highSensitiveEntry?.visibility, 'never_echo');
});

test('applies add and reinforce as atomic hot-memory operations', () => {
  const now = new Date('2026-06-08T12:00:00.000Z');
  const added = applyEchoHotMemoryOp(createEmptyEchoHotMemory(now), {
    type: 'add',
    content: 'The user wants XiaoXiang Echo to feel like a friend who notices real changes.',
    source: 'user_implicit',
    kind: 'growth_shift',
    visibility: 'tone_only',
    sensitivity: 'medium',
    expiresAt: '2026-06-30T00:00:00.000Z',
  }, entry(), now);

  assert.equal(added.version, 1);
  assert.equal(added.entries.length, 1);
  assert.equal(added.entries[0].sourceDiaryIds.includes('entry-1'), true);
  assert.equal(added.entries[0].reinforceCount, 1);
  assert.equal(added.entries[0].kind, 'growth_shift');
  assert.equal(added.entries[0].visibility, 'tone_only');
  assert.equal(added.entries[0].sensitivity, 'medium');
  assert.equal(added.entries[0].expiresAt, '2026-06-30T00:00:00.000Z');

  const reinforced = applyEchoHotMemoryOp(added, {
    type: 'reinforce',
    entryId: added.entries[0].id,
  }, entry('entry-2'), new Date('2026-06-09T12:00:00.000Z'));

  assert.equal(reinforced.version, 2);
  assert.equal(reinforced.entries[0].reinforceCount, 2);
  assert.deepEqual(reinforced.entries[0].sourceDiaryIds.sort(), ['entry-1', 'entry-2']);
});

test('replace keeps v2 field controls and high sensitivity never echoes', () => {
  const base = normalizeEchoHotMemoryForStorage({
    version: 1,
    seed: '',
    entries: [memoryEntry(1, { content: 'Echo memory needs better continuity.' })],
    updatedAt: '2026-06-08T08:00:00.000Z',
  });

  const next = applyEchoHotMemoryOp(base, {
    type: 'replace',
    entryId: 'memory-1',
    content: 'This cue is now too sensitive to echo directly.',
    kind: 'sensitive_context',
    visibility: 'direct',
    sensitivity: 'high',
  }, entry('entry-2'), new Date('2026-06-09T08:00:00.000Z'));

  assert.equal(next.entries[0].kind, 'sensitive_context');
  assert.equal(next.entries[0].sensitivity, 'high');
  assert.equal(next.entries[0].visibility, 'never_echo');
});

test('rejects diagnostic or pathologizing hot-memory content', () => {
  assert.throws(() => applyEchoHotMemoryOp(createEmptyEchoHotMemory(), {
    type: 'add',
    content: 'The user has 讨好型人格 and low self worth.',
    source: 'ai_inferred',
  }, entry()), /diagnostic/i);
});

test('evicts the weakest entry when adding beyond the hot-memory limit', () => {
  const fullMemory = normalizeEchoHotMemoryForStorage({
    version: 4,
    seed: 'Echo tuning',
    entries: Array.from({ length: ECHO_HOT_MEMORY_MAX_ENTRIES }, (_, index) => memoryEntry(index, {
      status: index === 0 ? 'fading' : 'active',
      reinforceCount: index === 0 ? 0 : index + 1,
    })),
    updatedAt: '2026-06-08T08:00:00.000Z',
  });

  const next = applyEchoHotMemoryOp(fullMemory, {
    type: 'add',
    content: 'A new and more relevant change appeared today.',
    source: 'ai_inferred',
  }, entry('new-diary'), new Date('2026-06-08T12:00:00.000Z'));

  assert.equal(next.entries.length, ECHO_HOT_MEMORY_MAX_ENTRIES);
  assert.equal(next.entries.some(item => item.id === 'memory-0'), false);
  assert.equal(next.entries.some(item => item.sourceDiaryIds.includes('new-diary')), true);
});

test('builds prompt memory pack from only relevant usable entries', () => {
  const now = new Date('2026-06-09T08:00:00.000Z');
  const hotMemory = normalizeEchoHotMemoryForStorage({
    version: 4,
    seed: 'steady echo tone',
    updatedAt: '2026-06-08T08:00:00.000Z',
    entries: [
      memoryEntry(1, {
        id: 'related',
        content: 'The user is refining XiaoXiang Echo memory so it notices continuity without saying it remembers.',
        reinforceCount: 3,
      }),
      memoryEntry(2, {
        id: 'never',
        content: 'The user is refining XiaoXiang Echo memory but asked not to use this cue.',
        visibility: 'never_echo',
        reinforceCount: 9,
      }),
      memoryEntry(3, {
        id: 'rejected',
        content: 'The user is refining XiaoXiang Echo memory but rejected this interpretation.',
        userFeedback: 'rejected',
        reinforceCount: 9,
      }),
      memoryEntry(4, {
        id: 'expired',
        content: 'The user is refining XiaoXiang Echo memory but this cue expired.',
        expiresAt: '2026-06-01T00:00:00.000Z',
        reinforceCount: 9,
      }),
      memoryEntry(5, {
        id: 'high',
        content: 'The user is refining XiaoXiang Echo memory but this is highly sensitive.',
        sensitivity: 'high',
        visibility: 'never_echo',
        reinforceCount: 9,
      }),
      memoryEntry(6, {
        id: 'unrelated',
        content: 'The user is choosing lunch near campus.',
        reinforceCount: 9,
      }),
    ],
  });

  const pack = buildPromptMemoryPack('Today I refined XiaoXiang Echo memory and checked for leak phrases.', hotMemory, now);

  assert.deepEqual(pack.selectedEntryIds, ['related']);
  assert.ok(pack.context.includes('内部连续性线索'));
  assert.ok(pack.context.includes('steady echo tone'));
  assert.ok(pack.context.includes('notices continuity'));
  assert.equal(pack.context.includes('highly sensitive'), false);
  assert.equal(pack.context.includes('choosing lunch'), false);
});

test('prompt memory pack returns empty context when no natural overlap exists', () => {
  const hotMemory = normalizeEchoHotMemoryForStorage({
    version: 1,
    seed: 'do not inject seed alone',
    updatedAt: '2026-06-08T08:00:00.000Z',
    entries: [
      memoryEntry(1, {
        id: 'sales',
        content: 'The user is practicing product sales and value matching.',
        reinforceCount: 3,
      }),
    ],
  });

  const pack = buildPromptMemoryPack('Roommate lowered the volume at noon and I felt cared for.', hotMemory, new Date('2026-06-09T08:00:00.000Z'));
  assert.equal(pack.context, '');
  assert.deepEqual(pack.selectedEntryIds, []);
});

test('recently used entry is deprioritized when a fresh relevant cue exists', () => {
  const hotMemory = normalizeEchoHotMemoryForStorage({
    version: 1,
    seed: '',
    updatedAt: '2026-06-08T08:00:00.000Z',
    entries: [
      memoryEntry(1, {
        id: 'recently-used',
        content: 'XiaoXiang Echo memory work is focused on continuity.',
        reinforceCount: 2,
        lastUsedInPromptAt: '2026-06-08T12:00:00.000Z',
      }),
      memoryEntry(2, {
        id: 'fresh',
        content: 'XiaoXiang Echo memory work is focused on continuity and leak checks.',
        reinforceCount: 1,
      }),
    ],
  });

  const pack = buildPromptMemoryPack('Today I checked XiaoXiang Echo memory continuity and leak checks.', hotMemory, new Date('2026-06-09T08:00:00.000Z'));
  assert.equal(pack.selectedEntryIds[0], 'fresh');
});

test('settings memory card actions transform hot memory safely', () => {
  const now = new Date('2026-06-09T12:00:00.000Z');
  const base = normalizeEchoHotMemoryForStorage({
    version: 1,
    seed: '',
    updatedAt: '2026-06-09T08:00:00.000Z',
    entries: [
      memoryEntry(1, {
        id: 'card-action',
        content: 'Original card action cue.',
      }),
    ],
  });

  const edited = editEchoMemoryEntryContent(base, 'card-action', 'Edited card action cue.', now);
  assert.equal(edited.version, 2);
  assert.equal(edited.entries[0].content, 'Edited card action cue.');
  assert.equal(edited.entries[0].userFeedback, 'accepted');

  const rejected = rejectEchoMemoryEntry(edited, 'card-action', now);
  assert.equal(rejected.entries[0].userFeedback, 'rejected');
  assert.equal(rejected.entries[0].visibility, 'never_echo');

  const sensitive = markEchoMemoryEntrySensitive(rejected, 'card-action', now);
  assert.equal(sensitive.entries[0].sensitivity, 'high');
  assert.equal(sensitive.entries[0].visibility, 'never_echo');

  const forgotten = forgetEchoMemoryEntry(sensitive, 'card-action', now);
  assert.equal(forgotten.entries.length, 0);
});

test('uses account-scoped storage ids for hot memory', () => {
  assert.equal(getEchoHotMemoryStorageId('user-a'), 'daily-echo:user-a');
  assert.equal(getEchoHotMemoryStorageId('user-b'), 'daily-echo:user-b');
  assert.notEqual(getEchoHotMemoryStorageId('user-a'), getEchoHotMemoryStorageId('user-b'));
  assert.equal(getEchoHotMemoryStorageId(null), 'daily-echo:anonymous');
});

test('normalizes memory snapshots before persistence', () => {
  const snapshot = normalizeEchoMemorySnapshot({
    id: 'snapshot-1',
    hotMemory: {
      version: 1,
      seed: 'Echo tuning',
      entries: [memoryEntry(1)],
      updatedAt: '2026-06-08T08:00:00.000Z',
    },
    insightDraft: null,
    createdAt: '2026-06-08T09:00:00.000Z',
    trigger: 'manual',
  });

  assert.equal(snapshot.id, 'snapshot-1');
  assert.equal(snapshot.trigger, 'manual');
  assert.equal(snapshot.hotMemory.entries.length, 1);
  assert.equal(snapshot.hotMemory.entries[0].kind, 'theme');
  assert.equal(snapshot.createdAt, '2026-06-08T09:00:00.000Z');
});

test('hot-memory update prompt asks for one JSON operation and v2 fields', () => {
  const prompt = buildEchoHotMemoryUpdatePrompt(createEmptyEchoHotMemory(), entry(), new Date('2026-06-08T12:00:00.000Z'));

  assert.ok(prompt.includes('近期记忆维护者'));
  assert.ok(prompt.includes('请只做一个操作'));
  assert.ok(prompt.includes('add|replace|remove|reinforce|update_seed'));
  assert.ok(prompt.includes('只输出 JSON'));
  assert.ok(prompt.includes('kind'));
  assert.ok(prompt.includes('visibility'));
  assert.ok(prompt.includes('sensitivity'));
  assert.ok(prompt.includes('expiresAt'));
  assert.ok(prompt.includes('visibility=never_echo'));
});

test('hot-memory update prompt can distill from cold insight without full overwrite', () => {
  const draft = createEmptyInsightDraft(new Date('2026-06-08T12:00:00.000Z'));
  draft.patterns.recurringThemes = ['long product iteration', 'making echo feel like company'];
  draft.recentContext.lastInsight = 'The user is moving from full overwrites to entry-level memory operations.';
  draft.meta.version = 4;
  draft.meta.diaryCount = 24;
  draft.meta.confidence = 0.82;

  const prompt = buildEchoHotMemoryUpdatePrompt(createEmptyEchoHotMemory(), entry(), new Date('2026-06-08T12:00:00.000Z'), draft);

  assert.ok(prompt.includes('长期洞察索引'));
  assert.ok(prompt.includes('long product iteration'));
  assert.ok(prompt.includes('蒸馏成近期记忆条目'));
  assert.ok(prompt.includes('请只做一个操作'));
  assert.ok(prompt.includes('add|replace|remove|reinforce|update_seed'));
});
