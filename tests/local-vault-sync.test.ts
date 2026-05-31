import assert from 'node:assert/strict';
import { localVaultService } from '../src/services/localVaultService';
import type { DiaryEntry } from '../src/services/diaryService';

type FileData = Blob | string;

class MemoryFileHandle {
  kind = 'file' as const;
  lastModified = Date.now();

  constructor(
    public name: string,
    private data: FileData = '',
  ) {}

  async createWritable() {
    return {
      write: async (data: FileData) => {
        this.data = data;
        this.lastModified = Date.now();
      },
      close: async () => undefined,
    };
  }

  async getFile(): Promise<File> {
    return new File([this.data], this.name, { lastModified: this.lastModified });
  }
}

class MemoryDirectoryHandle {
  kind = 'directory' as const;
  directories = new Map<string, MemoryDirectoryHandle>();
  files = new Map<string, MemoryFileHandle>();
  entriesWalkCount = 0;

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.directories.get(name);
    if (existing) return existing;
    if (!options?.create) throw Object.assign(new Error('Directory not found'), { name: 'NotFoundError' });

    const created = new MemoryDirectoryHandle(name);
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw Object.assign(new Error('File not found'), { name: 'NotFoundError' });

    const created = new MemoryFileHandle(name);
    this.files.set(name, created);
    return created;
  }

  async removeEntry(name: string) {
    this.files.delete(name);
    this.directories.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, MemoryDirectoryHandle | MemoryFileHandle]> {
    this.entriesWalkCount += 1;
    for (const entry of this.directories) yield entry;
    for (const entry of this.files) yield entry;
  }
}

const yearRoot = new MemoryDirectoryHandle('2026');
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
  },
});
(globalThis as any).window = {
  isSecureContext: true,
  showDirectoryPicker: async () => yearRoot,
};

assert.equal(localVaultService.getVaultCapability().mode, 'directory-sync');
assert.equal(localVaultService.isSupported(), true);
const status = await localVaultService.chooseVaultDirectory();
assert.equal(status.available, true);
assert.equal(
  [...(yearRoot.directories.get('.xiaoxiang')?.files.keys() || [])].some((name) => name.startsWith('write-probe-')),
  false,
);

const entry: DiaryEntry = {
  id: 'entry-2026-05-23',
  title: '同步测试',
  content: '<p>直接选择年份文件夹时也要写到当前文件夹</p>',
  images: [],
  createdAt: '2026-05-23T00:00:00.000Z',
  updatedAt: '2026-05-23T00:00:00.000Z',
  diaryDate: '2026-05-23T00:00:00.000Z',
  status: 'active',
};

const result = await localVaultService.syncEntry(entry);
assert.equal(result?.vaultPath, '用户日志/2026/2026-05-23.md');
assert.equal(yearRoot.directories.has('用户日志'), false);

const markdownFile = yearRoot.files.get('2026-05-23.md');
assert.ok(markdownFile, 'entry markdown should be written directly under the selected year folder');
assert.match(await (await markdownFile.getFile()).text(), /直接选择年份文件夹/);

const staleWritable = await markdownFile.createWritable();
await staleWritable.write('');
await staleWritable.close();

const trashed = await localVaultService.moveEntryToTrash({
  ...entry,
  content: '<p>网页里最新的内容要同步进回收站文件</p>',
  status: 'trashed',
  updatedAt: '2026-05-23T01:00:00.000Z',
  trashedAt: '2026-05-23T01:00:00.000Z',
});
assert.equal(trashed?.vaultTrashPath, '回收站/2026/2026-05-23.md');
assert.equal(yearRoot.files.has('2026-05-23.md'), false);

const trashYear = yearRoot.directories.get('回收站')?.directories.get('2026');
const trashFile = trashYear?.files.get('2026-05-23.md');
assert.ok(trashFile, 'trash markdown should be rewritten from current entry content');
const trashText = await (await trashFile.getFile()).text();
assert.match(trashText, /网页里最新的内容/);
assert.notEqual((await trashFile.getFile()).size, 0);

yearRoot.entriesWalkCount = 0;
const existingPathResult = await localVaultService.syncEntry({
  ...entry,
  id: 'entry-with-existing-path',
  content: '<p>已有路径时应该直接覆盖写入，不扫描目录</p>',
  vaultPath: '用户日志/2026/existing-path.md',
});
assert.equal(existingPathResult?.vaultPath, '用户日志/2026/existing-path.md');
assert.equal(yearRoot.entriesWalkCount, 0);
assert.match(await (await yearRoot.files.get('existing-path.md')!.getFile()).text(), /已有路径/);

const exportDir = yearRoot.directories.get('导出文件');
assert.ok(exportDir, 'vault structure should still keep export files separate');
exportDir.files.set('backup.md', new MemoryFileHandle('backup.md', '# backup'));
trashYear?.files.set('empty-shell.md', new MemoryFileHandle('empty-shell.md', ''));

const deletedEmptyCount = await localVaultService.cleanupEmptyMarkdownFiles();
assert.equal(deletedEmptyCount, 1);
assert.equal(trashYear?.files.has('empty-shell.md'), false);

const files = await localVaultService.listMarkdownFiles('用户日志/2026');
assert.deepEqual(files.map((file) => file.path), ['用户日志/2026/existing-path.md']);

const bulkEntries: DiaryEntry[] = [
  {
    ...entry,
    id: 'bulk-entry-2026-05-24',
    content: '<p>批量同步第一篇要写进文件夹</p>',
    diaryDate: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
  },
  {
    ...entry,
    id: 'bulk-entry-2026-05-25',
    content: '<p>批量同步第二篇也必须成功落盘</p>',
    diaryDate: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
  },
];
const progress: string[] = [];
const bulkResult = await localVaultService.syncEntries(bulkEntries, {
  onProgress: (done, total) => progress.push(`${done}/${total}`),
});
assert.equal(bulkResult.count, 2);
assert.equal(bulkResult.failCount, 0);
assert.equal(progress[0], '0/2');
assert.equal(progress[progress.length - 1], '2/2');
assert.match(await (await yearRoot.files.get('2026-05-24.md')!.getFile()).text(), /批量同步第一篇/);
assert.match(await (await yearRoot.files.get('2026-05-25.md')!.getFile()).text(), /批量同步第二篇/);

console.log('local vault year-folder sync passed');
