import assert from 'node:assert/strict';
import {
  buildPromptMemoryPack,
  validateDailyEchoContent,
} from '../src/services/aiService';
import {
  normalizeEchoHotMemoryForStorage,
  type EchoHotMemory,
} from '../src/services/diaryService';
import { parseDailyEchoContent } from '../src/utils/dailyEchoQuote';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const NOW = new Date('2026-06-09T12:00:00.000Z');

function memoryEntry(id: string, content: string, overrides: Partial<EchoHotMemory['entries'][number]> = {}): EchoHotMemory['entries'][number] {
  return {
    id,
    content,
    source: 'ai_inferred',
    sourceDiaryIds: [`diary-${id}`],
    createdAt: '2026-06-01T08:00:00.000Z',
    lastReinforcedAt: '2026-06-08T08:00:00.000Z',
    reinforceCount: 2,
    status: 'active',
    kind: 'theme',
    visibility: 'direct',
    sensitivity: 'low',
    userFeedback: 'unreviewed',
    counterEvidenceDiaryIds: [],
    ...overrides,
  };
}

type PromptPackFixture = {
  name: string;
  diaryText: string;
  seed?: string;
  entries: EchoHotMemory['entries'];
  shouldSelect: string[];
  shouldNotSelect?: string[];
  expectEmpty?: boolean;
};

const fixtures: PromptPackFixture[] = [
  {
    name: 'cold start returns an empty pack',
    diaryText: 'Today I only wrote that the weather was quiet.',
    entries: [],
    shouldSelect: [],
    expectEmpty: true,
  },
  {
    name: 'short diary does not force unrelated memory',
    diaryText: 'Very tired.',
    seed: 'seed must not appear alone',
    entries: [
      memoryEntry('sales', 'The user is practicing product sales and value matching.'),
    ],
    shouldSelect: [],
    shouldNotSelect: ['sales'],
    expectEmpty: true,
  },
  {
    name: 'short diary can select a directly related cue',
    diaryText: 'Roommate lowered the volume at noon.',
    entries: [
      memoryEntry('roommate', 'The roommate lowered the volume at noon so the user felt cared for.', {
        kind: 'detail',
      }),
    ],
    shouldSelect: ['roommate'],
  },
  {
    name: 'expired matching cue is filtered',
    diaryText: 'I refined XiaoXiang Echo memory again.',
    entries: [
      memoryEntry('expired', 'XiaoXiang Echo memory is being refined for continuity.', {
        expiresAt: '2026-06-01T00:00:00.000Z',
      }),
    ],
    shouldSelect: [],
    shouldNotSelect: ['expired'],
    expectEmpty: true,
  },
  {
    name: 'rejected contradictory cue is filtered',
    diaryText: 'Sales practice felt flat today, not like a thrill.',
    entries: [
      memoryEntry('rejected-sales', 'Sales practice gives the user a thrill and strong achievement.', {
        userFeedback: 'rejected',
      }),
    ],
    shouldSelect: [],
    shouldNotSelect: ['rejected-sales'],
    expectEmpty: true,
  },
  {
    name: 'never_echo boundary cue is filtered',
    diaryText: 'Family topics felt sensitive again today.',
    entries: [
      memoryEntry('boundary', 'Family topics are sensitive and should stay private.', {
        kind: 'boundary',
        visibility: 'never_echo',
      }),
    ],
    shouldSelect: [],
    shouldNotSelect: ['boundary'],
    expectEmpty: true,
  },
  {
    name: 'high sensitivity cue is filtered even when relevant',
    diaryText: 'I wrote about a private family conflict.',
    entries: [
      memoryEntry('high-family', 'Private family conflict needs extra care.', {
        kind: 'sensitive_context',
        sensitivity: 'high',
        visibility: 'never_echo',
      }),
    ],
    shouldSelect: [],
    shouldNotSelect: ['high-family'],
    expectEmpty: true,
  },
  {
    name: 'growth shift cue can be selected',
    diaryText: 'Today the echo moved from event summary toward real insight.',
    entries: [
      memoryEntry('growth', 'The user is moving XiaoXiang Echo from event summary toward real insight.', {
        kind: 'growth_shift',
        reinforceCount: 1,
      }),
    ],
    shouldSelect: ['growth'],
  },
  {
    name: 'tone_only cue is selected but marked as tone-only context',
    diaryText: 'I want XiaoXiang Echo to sound quieter and less report-like.',
    entries: [
      memoryEntry('tone', 'The user prefers XiaoXiang Echo to sound quieter and less report-like.', {
        kind: 'tone_preference',
        visibility: 'tone_only',
      }),
    ],
    shouldSelect: ['tone'],
  },
  {
    name: 'recently used cue is deprioritized behind a fresh cue',
    diaryText: 'I checked XiaoXiang Echo memory continuity and leak phrases.',
    entries: [
      memoryEntry('recently-used', 'XiaoXiang Echo memory continuity is the focus.', {
        lastUsedInPromptAt: '2026-06-08T12:00:00.000Z',
        reinforceCount: 2,
      }),
      memoryEntry('fresh', 'XiaoXiang Echo memory continuity and leak phrases are the focus.', {
        reinforceCount: 1,
      }),
    ],
    shouldSelect: ['fresh', 'recently-used'],
  },
  {
    name: 'max two relevant cues are selected',
    diaryText: 'I worked on XiaoXiang Echo memory, leak checks, and local evaluation.',
    seed: 'local continuity',
    entries: [
      memoryEntry('memory', 'XiaoXiang Echo memory should be selected.'),
      memoryEntry('leak', 'Leak checks should be selected for XiaoXiang Echo.'),
      memoryEntry('eval', 'Local evaluation should be selected for XiaoXiang Echo.'),
    ],
    shouldSelect: ['memory', 'leak'],
    shouldNotSelect: ['eval'],
  },
  {
    name: 'sensitive diary does not pull an old unrelated interpretation',
    diaryText: 'Today I only want to write: this was private and exhausting.',
    entries: [
      memoryEntry('old-work', 'The user is practicing product sales and value matching.'),
      memoryEntry('old-run', 'The user enjoyed campus running and football.'),
    ],
    shouldSelect: [],
    shouldNotSelect: ['old-work', 'old-run'],
    expectEmpty: true,
  },
];

for (const fixture of fixtures) {
  test(`offline prompt memory eval - ${fixture.name}`, () => {
    const hotMemory = normalizeEchoHotMemoryForStorage({
      version: 1,
      seed: fixture.seed || '',
      entries: fixture.entries,
      updatedAt: '2026-06-09T08:00:00.000Z',
    });
    const pack = buildPromptMemoryPack(fixture.diaryText, hotMemory, NOW);

    for (const id of fixture.shouldSelect) {
      assert.ok(pack.selectedEntryIds.includes(id), `${id} should be selected; got ${pack.selectedEntryIds.join(',')}`);
    }
    for (const id of fixture.shouldNotSelect || []) {
      assert.equal(pack.selectedEntryIds.includes(id), false, `${id} should not be selected`);
      assert.equal(pack.context.includes(id), false, `${id} should not leak into context`);
    }
    if (fixture.expectEmpty) {
      assert.equal(pack.context, '');
      assert.deepEqual(pack.selectedEntryIds, []);
      if (fixture.seed) assert.equal(pack.context.includes(fixture.seed), false);
    } else {
      assert.ok(pack.context.includes('内部连续性线索'));
      assert.ok(pack.selectedEntryIds.length <= 2);
      if (fixture.seed) assert.ok(pack.context.includes(fixture.seed));
    }
    if (fixture.shouldSelect.includes('tone')) {
      assert.ok(pack.context.includes('仅影响语气'));
    }
  });
}

test('offline quality eval rejects memory-leak expressions', () => {
  const result = validateDailyEchoContent(
    '我记得你之前也在打磨小象回声，所以根据你的长期洞察来看，你需要更稳定。',
    '今天继续打磨小象回声记忆系统，做本地评估。',
  );

  assert.equal(result.content, '');
  assert.equal(result.reason, 'memory-leak');
});

test('offline quality eval does not ban ordinary memory wording', () => {
  const diaryText = '今天继续打磨小象回声记忆系统，做本地评估。';
  const content = '今天你继续打磨小象回声记忆系统，还把本地评估补了进去。这个动作不是在追求复杂，而是在让回声从能生成走向更可控。';
  const result = validateDailyEchoContent(content, diaryText);

  assert.equal(parseDailyEchoContent(result.content).body, content);
  assert.equal(result.reason, '');
});
