import assert from 'node:assert/strict';
import { localVaultService } from '../src/services/localVaultService';

class EmptyWriteFileHandle {
  kind = 'file' as const;
  constructor(public name: string) {}

  async createWritable() {
    return {
      write: async () => undefined,
      close: async () => undefined,
    };
  }

  async getFile(): Promise<File> {
    return new File([''], this.name);
  }
}

class ProbeFailDirectoryHandle {
  kind = 'directory' as const;
  directories = new Map<string, ProbeFailDirectoryHandle>();
  files = new Map<string, EmptyWriteFileHandle>();

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.directories.get(name);
    if (existing) return existing;
    if (!options?.create) throw Object.assign(new Error('Directory not found'), { name: 'NotFoundError' });

    const created = new ProbeFailDirectoryHandle(name);
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw Object.assign(new Error('File not found'), { name: 'NotFoundError' });

    const created = new EmptyWriteFileHandle(name);
    this.files.set(name, created);
    return created;
  }

  async removeEntry(name: string) {
    this.files.delete(name);
    this.directories.delete(name);
  }
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36',
  },
});

(globalThis as any).window = {
  isSecureContext: true,
  showDirectoryPicker: async () => new ProbeFailDirectoryHandle('小象日志'),
};

assert.equal(localVaultService.getVaultCapability().mode, 'directory-sync');
await assert.rejects(
  () => localVaultService.chooseVaultDirectory(),
  /当前浏览器无法稳定写入所选文件夹/,
);

console.log('mobile PWA directory probe failure passed');
