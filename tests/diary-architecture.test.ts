import assert from 'node:assert/strict';
import type { DiaryEntry, DiaryEntryWriter } from '../src/features/diary/model';
import {
  DIARY_SYNCED_FIELDS,
  normalizeDiarySyncEntryDto,
  toDiarySyncEntryDto,
} from '../src/features/diary/syncContract';
import {
  DiaryPostCommitCoordinator,
  type DiaryPostCommitEffect,
} from '../src/features/diary/postCommitCoordinator';
import { runDiaryChangeProjectors } from '../server/src/modules/diary/diaryChangeProjector';
import { formatDiaryEntry } from '../server/src/modules/diary/diaryEntryCodec';
import { persistDiaryDraft } from '../src/features/editor/diaryPersistence';

function testEntry(): DiaryEntry {
  return {
    id: 'entry-contract-1',
    userId: 'local-user',
    title: '契约测试',
    content: '<p>今天完成了架构整理。</p>',
    images: ['', 'https://example.com/image.png'],
    createdAt: '2026-06-30T01:00:00.000Z',
    updatedAt: '2026-06-30T02:00:00.000Z',
    diaryDate: '2026-06-30T00:00:00.000Z',
    status: 'active',
    trashReason: undefined,
    isPinned: true,
    isHidden: false,
    mood: '平静',
    weather: '晴',
    tags: ['架构'],
    blocks: [{ title: '旧格式', content: '只在本地兼容' }],
    prompts: { localOnly: true },
    backgroundId: 'legacy-paper',
    themeId: 'sys-ink-plum',
    activeWritingSeconds: 120,
    syncVersion: 9,
    vaultPath: '用户日志/2026/2026-06-30.md',
    vaultTrashPath: undefined,
    attachmentPaths: ['附件/images/entry-contract-1/image.png'],
    dailyEcho: {
      status: 'saved',
      content: '你把混乱变成了边界。',
      styleId: 'gentle',
      generatedAt: '2026-06-30T02:01:00.000Z',
      sourceEntryUpdatedAt: '2026-06-30T02:00:00.000Z',
      regenerateCount: 0,
      card: {
        imageUrl: 'https://example.com/echo.png',
        localDataUrl: 'data:image/png;base64,LOCAL_ONLY',
        width: 1080,
        height: 1440,
        renderedAt: '2026-06-30T02:02:00.000Z',
      },
    },
  };
}

const dto = toDiarySyncEntryDto(testEntry());
assert.equal(dto.diaryDate, '2026-06-30');
assert.deepEqual(dto.images, ['https://example.com/image.png']);
assert.equal(dto.dailyEcho?.card?.localDataUrl, undefined);
assert.deepEqual(normalizeDiarySyncEntryDto(dto), dto);

const serialized = JSON.stringify(dto);
for (const localOnlyField of [
  'userId',
  'blocks',
  'prompts',
  'backgroundId',
  'syncVersion',
  'vaultPath',
  'vaultTrashPath',
  'attachmentPaths',
  'localDataUrl',
]) {
  assert.equal(serialized.includes(`"${localOnlyField}"`), false, `${localOnlyField} must stay local-only`);
}
assert.deepEqual(Object.keys(dto).sort(), DIARY_SYNCED_FIELDS.filter(field => dto[field] !== undefined).sort());

const warnings: string[] = [];
const coordinator = new DiaryPostCommitCoordinator({ warn: message => warnings.push(String(message)) });
let successfulEffectRan = false;
const effects: DiaryPostCommitEffect[] = [
  {
    name: 'local-vault',
    run: async () => {
      throw new Error('permission denied');
    },
  },
  {
    name: 'cloud-sync',
    run: async () => {
      successfulEffectRan = true;
    },
  },
];

const report = await coordinator.execute({ kind: 'created', entry: testEntry() }, effects);
assert.equal(successfulEffectRan, true);
assert.deepEqual(report.effects.map(item => item.status), ['rejected', 'fulfilled']);
assert.equal(report.effects[0].error, 'permission denied');
assert.equal(warnings.length, 1);

coordinator.schedule({ kind: 'updated', entry: testEntry() }, effects.slice(1));
assert.equal(coordinator.getStatus().pendingCount, 1);
await coordinator.flush();
assert.equal(coordinator.getStatus().pendingCount, 0);

const projectionWarnings: string[] = [];
const projectionReport = await runDiaryChangeProjectors(
  { type: 'changed', userId: 'user-1', entryId: 'entry-1' },
  [
    { name: 'monthly-echo', project: async () => { throw new Error('queue unavailable'); } },
    { name: 'audit', project: async () => undefined },
  ],
  { warn: message => projectionWarnings.push(String(message)) },
);
assert.deepEqual(projectionReport.results.map(item => item.status), ['rejected', 'fulfilled']);
assert.equal(projectionWarnings.length, 1);

const formattedServerEntry = await formatDiaryEntry({
  id: 'server-entry',
  tags: JSON.stringify(['架构']),
  images: JSON.stringify(['https://example.com/image.png']),
  dailyEcho: JSON.stringify({ status: 'saved', content: '回声' }),
});
assert.deepEqual(formattedServerEntry.tags, ['架构']);
assert.deepEqual(formattedServerEntry.images, ['https://example.com/image.png']);
assert.deepEqual(formattedServerEntry.dailyEcho, { status: 'saved', content: '回声' });

const writerCalls: string[] = [];
const writer: DiaryEntryWriter = {
  async createEntry(data) {
    writerCalls.push(`create:${data.id}`);
    return { ...testEntry(), ...data, id: data.id || 'generated', status: data.status || 'active' };
  },
  async updateEntry(id, patch) {
    writerCalls.push(`update:${id}`);
    return { ...testEntry(), ...patch, id };
  },
};
await persistDiaryDraft({
  writer,
  existingEntry: testEntry(),
  entryId: 'ignored-for-update',
  content: 'updated',
  images: [],
  diaryDate: '2026-06-30',
  createdAt: '2026-06-30T01:00:00.000Z',
  activeWritingSeconds: 121,
  saveOptions: { saveHistory: true },
});
await persistDiaryDraft({
  writer,
  entryId: 'new-entry',
  content: 'created',
  images: [],
  diaryDate: '2026-06-30',
  createdAt: '2026-06-30T01:00:00.000Z',
  activeWritingSeconds: 1,
  saveOptions: { immediateSync: true },
});
assert.deepEqual(writerCalls, ['update:entry-contract-1', 'create:new-entry']);

console.log('diary architecture contract passed');
