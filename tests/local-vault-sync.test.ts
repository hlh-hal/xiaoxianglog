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
    for (const entry of this.directories) yield entry;
    for (const entry of this.files) yield entry;
  }
}

const yearRoot = new MemoryDirectoryHandle('2026');
(globalThis as any).window = {
  isSecureContext: true,
  showDirectoryPicker: async () => yearRoot,
};

const status = await localVaultService.chooseVaultDirectory();
assert.equal(status.available, true);

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

const exportDir = yearRoot.directories.get('导出文件');
assert.ok(exportDir, 'vault structure should still keep export files separate');
exportDir.files.set('backup.md', new MemoryFileHandle('backup.md', '# backup'));

const files = await localVaultService.listMarkdownFiles('用户日志/2026');
assert.deepEqual(files.map((file) => file.path), ['用户日志/2026/2026-05-23.md']);

console.log('local vault year-folder sync passed');
