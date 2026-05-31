import assert from 'node:assert/strict';
import { localVaultService } from '../src/services/localVaultService';
import type { DiaryEntry } from '../src/services/diaryService';

const decoder = new TextDecoder();

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

async function unzipStoredFiles(blob: Blob): Promise<Map<string, string | Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = new Map<string, string | Uint8Array>();
  let offset = 0;

  while (offset + 30 <= bytes.length && readUint32(bytes, offset) === 0x04034b50) {
    const compressedSize = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    files.set(name, name.endsWith('.md') || name.endsWith('.json') ? decoder.decode(data) : data);
    offset = dataStart + compressedSize;
  }

  return files;
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
  },
});
(globalThis as any).window = {
  isSecureContext: true,
};

const capability = localVaultService.getVaultCapability();
assert.equal(capability.mode, 'archive-download');

const dataImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const baseEntry = {
  title: '日志包测试',
  content: '<p>今天记录一段可以写入 Markdown 的内容。</p>',
  images: [],
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
  diaryDate: '2026-05-24T08:00:00.000Z',
  status: 'active' as const,
};

const entries: DiaryEntry[] = [
  {
    ...baseEntry,
    id: 'entry-first',
    content: '<p>第一篇日志包内容必须非空。</p>',
    images: [dataImage],
  },
  {
    ...baseEntry,
    id: 'entry-duplicate-date',
    content: '<p>同一天第二篇不应该覆盖第一篇。</p>',
    updatedAt: '2026-05-24T09:00:00.000Z',
  },
  {
    ...baseEntry,
    id: 'entry-trash',
    content: '<p>回收站日志也要保留。</p>',
    diaryDate: '2026-05-25T08:00:00.000Z',
    updatedAt: '2026-05-25T08:00:00.000Z',
    status: 'trashed',
    trashedAt: '2026-05-25T09:00:00.000Z',
  },
];

const progress: string[] = [];
const result = await localVaultService.createVaultPackage(entries, {
  onProgress: (done, total) => progress.push(`${done}/${total}`),
});
const files = await unzipStoredFiles(result.blob);

assert.equal(result.entryCount, 3);
assert.equal(progress[0], '0/3');
assert.equal(progress[progress.length - 1], '3/3');
assert.ok(result.fileName.startsWith('小象日志本地日志包-'));
assert.ok(result.fileName.endsWith('.zip'));
assert.ok(files.has('用户日志/2026/2026-05-24.md'));
assert.ok(files.has('用户日志/2026/2026-05-24-2.md'));
assert.ok(files.has('回收站/2026/2026-05-25.md'));
assert.ok(files.has('附件/images/entry-first/1.png'));
assert.ok(files.has('.xiaoxiang/manifest.json'));

const firstMarkdown = files.get('用户日志/2026/2026-05-24.md');
assert.equal(typeof firstMarkdown, 'string');
assert.match(firstMarkdown as string, /第一篇日志包内容必须非空/);
assert.match(firstMarkdown as string, /\.\.\/\.\.\/附件\/images\/entry-first\/1\.png/);

const secondMarkdown = files.get('用户日志/2026/2026-05-24-2.md');
assert.equal(typeof secondMarkdown, 'string');
assert.match(secondMarkdown as string, /同一天第二篇不应该覆盖第一篇/);

const manifest = JSON.parse(files.get('.xiaoxiang/manifest.json') as string);
assert.equal(manifest.entries['entry-first'].path, '用户日志/2026/2026-05-24.md');
assert.equal(manifest.entries['entry-duplicate-date'].path, '用户日志/2026/2026-05-24-2.md');
assert.equal(manifest.entries['entry-trash'].trashPath, '回收站/2026/2026-05-25.md');

console.log('mobile PWA vault package passed');
