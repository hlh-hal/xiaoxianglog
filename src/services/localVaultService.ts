import { Capacitor, registerPlugin } from '@capacitor/core';
import { format } from 'date-fns';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DiaryEntry, EntryStatus } from './diaryService';
import { htmlToMarkdown } from '../utils/htmlToMarkdown';

export type VaultProvider = 'android-documents' | 'web-directory' | 'unsupported';

export interface VaultStatus {
  supported: boolean;
  authorized: boolean;
  available: boolean;
  displayPath: string;
  provider: VaultProvider;
  treeUri?: string;
  unavailableReason?: string;
}

export interface VaultMarkdownFile {
  path: string;
  name: string;
  lastModified?: number;
  size?: number;
}

export interface VaultImportedEntry {
  id?: string;
  title: string;
  content: string;
  diaryDate: string;
  vaultPath: string;
}

interface LocalVaultPlugin {
  chooseVaultDirectory(): Promise<VaultStatus>;
  getVaultStatus(): Promise<VaultStatus>;
  writeTextFile(options: { path: string; content: string }): Promise<{ path: string }>;
  writeBase64File(options: { path: string; base64: string; mimeType: string }): Promise<{ path: string }>;
  readTextFile(options: { path: string }): Promise<{ path: string; content: string }>;
  listMarkdownFiles(options: { root?: string }): Promise<{ files: VaultMarkdownFile[] }>;
  deleteFile(options: { path: string }): Promise<{ path: string; deleted: boolean }>;
  moveFile(options: { fromPath: string; toPath: string }): Promise<{ fromPath: string; toPath: string }>;
}

interface VaultBackend {
  isSupported(): boolean;
  chooseVaultDirectory(): Promise<VaultStatus>;
  getVaultStatus(): Promise<VaultStatus>;
  writeTextFile(path: string, content: string): Promise<{ path: string }>;
  writeBase64File(path: string, base64: string, mimeType: string): Promise<{ path: string }>;
  readTextFile(path: string): Promise<{ path: string; content: string }>;
  listMarkdownFiles(root?: string): Promise<{ files: VaultMarkdownFile[] }>;
  deleteFile(path: string): Promise<{ path: string; deleted: boolean }>;
  moveFile(fromPath: string, toPath: string): Promise<{ fromPath: string; toPath: string }>;
}

interface VaultEntryRecord {
  id: string;
  path?: string;
  trashPath?: string;
  attachmentPaths?: string[];
  diaryDate?: string;
  updatedAt?: string;
  status?: EntryStatus;
}

interface VaultManifest {
  version: 1;
  updatedAt: string;
  entries: Record<string, VaultEntryRecord>;
}

export interface VaultSyncResult {
  vaultPath?: string;
  vaultTrashPath?: string;
  attachmentPaths?: string[];
}

interface WebVaultDB extends DBSchema {
  handles: {
    key: string;
    value: {
      id: string;
      handle: FileSystemDirectoryHandle;
      updatedAt: string;
    };
  };
}

type WebFileSystemPermissionMode = 'read' | 'readwrite';
type FileSystemHandlePermissionDescriptor = { mode?: WebFileSystemPermissionMode };

interface FileSystemHandleWithPermissions extends FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface IterableFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  entries?(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface WebFileSystemWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: WebFileSystemPermissionMode }) => Promise<FileSystemDirectoryHandle>;
}

const LocalVault = registerPlugin<LocalVaultPlugin>('LocalVault');

const USER_LOG_DIR = '用户日志';
const EXPORT_DIR = '导出文件';
const ATTACHMENT_IMAGE_DIR = '附件/images';
const TRASH_DIR = '回收站';
const MANIFEST_PATH = '.xiaoxiang/manifest.json';
const WEB_VAULT_DB_NAME = 'xiaoxiang-local-vault';
const WEB_VAULT_DB_VERSION = 1;
const WEB_ROOT_HANDLE_ID = 'root';

let webRootHandle: FileSystemDirectoryHandle | null = null;
let webVaultDbPromise: Promise<IDBPDatabase<WebVaultDB>> | null = null;

const emptyManifest = (): VaultManifest => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: {},
});

function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

function getWebWindow(): WebFileSystemWindow | null {
  if (typeof window === 'undefined') return null;
  return window as WebFileSystemWindow;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function cleanSegments(path: string, allowEmpty = false): string[] {
  const normalized = normalizePath(path).replace(/\/+$/, '').trim();
  if (!normalized) {
    if (allowEmpty) return [];
    throw new Error('path is required');
  }

  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..' || segment.includes(':')) {
        throw new Error(`invalid path segment: ${segment}`);
      }
      return segment;
    });
}

function formatEntryDate(entry: Pick<DiaryEntry, 'diaryDate'>): string {
  const date = new Date(entry.diaryDate);
  if (Number.isNaN(date.getTime())) {
    return format(new Date(), 'yyyy-MM-dd');
  }
  return format(date, 'yyyy-MM-dd');
}

function stripMarkdownForTitle(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>\-[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildBodyMarkdown(entry: DiaryEntry): string {
  if (entry.blocks && entry.blocks.length > 0) {
    return entry.blocks
      .map((block) => {
        const title = block.title ? `## ${block.title.trim()}\n\n` : '';
        return `${title}${htmlToMarkdown(block.content || '')}`.trim();
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return htmlToMarkdown(entry.content || '');
}

function mimeExtensionFromDataUrl(dataUrl: string): { extension: string; mimeType: string } {
  const mimeType = dataUrl.match(/^data:([^;,]+)[;,]/)?.[1] || 'image/jpeg';
  const subtype = mimeType.split('/')[1] || 'jpeg';
  const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  return { extension, mimeType };
}

function relativePath(fromFilePath: string, toPath: string): string {
  const fromParts = normalizePath(fromFilePath).split('/').slice(0, -1);
  const toParts = normalizePath(toPath).split('/');
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => '..'), ...toParts].join('/');
}

function parseDateFromMarkdown(path: string, content: string): string {
  const firstLineDate = content.match(/^#\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  if (firstLineDate) return firstLineDate;
  const fileDate = path.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  return fileDate || format(new Date(), 'yyyy-MM-dd');
}

function removeDateHeading(content: string): string {
  return content.replace(/^#\s*\d{4}-\d{2}-\d{2}\s*\r?\n?/, '').trim();
}

function dataUrlToBlob(data: string, mimeType: string): Blob {
  const commaIndex = data.indexOf(',');
  const payload = (data.startsWith('data:') && commaIndex >= 0 ? data.slice(commaIndex + 1) : data).replace(/\s/g, '');
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function androidStatusUnavailable(message: string): VaultStatus {
  return {
    supported: true,
    authorized: false,
    available: false,
    displayPath: '',
    provider: 'android-documents',
    unavailableReason: message,
  };
}

function normalizeAndroidStatus(status: VaultStatus): VaultStatus {
  const unavailableReason = status.available
    ? undefined
    : status.authorized
      ? '本地日志文件夹不可用，请重新授权'
      : '尚未选择本地日志文件夹';

  return {
    ...status,
    supported: true,
    provider: 'android-documents',
    unavailableReason,
  };
}

function unsupportedWebStatus(unavailableReason?: string): VaultStatus {
  const webWindow = getWebWindow();
  const defaultReason = webWindow?.isSecureContext === false
    ? '需要使用 HTTPS 或 localhost 才能选择本地文件夹'
    : '当前浏览器不支持文件夹写入';

  return {
    supported: false,
    authorized: false,
    available: false,
    displayPath: '',
    provider: 'unsupported',
    unavailableReason: unavailableReason || defaultReason,
  };
}

function webStatus(partial: Partial<VaultStatus>): VaultStatus {
  return {
    supported: true,
    authorized: false,
    available: false,
    displayPath: '',
    provider: 'web-directory',
    ...partial,
  };
}

function supportsWebDirectoryPicker(): boolean {
  return typeof getWebWindow()?.showDirectoryPicker === 'function';
}

async function getWebVaultDB(): Promise<IDBPDatabase<WebVaultDB>> {
  if (!webVaultDbPromise) {
    webVaultDbPromise = openDB<WebVaultDB>(WEB_VAULT_DB_NAME, WEB_VAULT_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'id' });
        }
      },
    });
  }
  return webVaultDbPromise;
}

async function storeWebRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    const db = await getWebVaultDB();
    await db.put('handles', {
      id: WEB_ROOT_HANDLE_ID,
      handle,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Persist web vault handle failed:', error);
  }
}

async function getStoredWebRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (webRootHandle) return webRootHandle;

  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await getWebVaultDB();
    const record = await db.get('handles', WEB_ROOT_HANDLE_ID);
    webRootHandle = record?.handle || null;
    return webRootHandle;
  } catch (error) {
    console.warn('Read web vault handle failed:', error);
    return null;
  }
}

async function ensureWebPermission(handle: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const permissionHandle = handle as FileSystemHandleWithPermissions;
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };

  try {
    if (permissionHandle.queryPermission) {
      const permission = await permissionHandle.queryPermission(descriptor);
      if (permission === 'granted') return true;
      if (!request) return false;
    }

    if (request && permissionHandle.requestPermission) {
      return (await permissionHandle.requestPermission(descriptor)) === 'granted';
    }

    return !permissionHandle.queryPermission;
  } catch {
    return false;
  }
}

async function getAvailableWebRoot(requestPermission: boolean): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getStoredWebRootHandle();
  if (!handle) return null;

  const hasPermission = await ensureWebPermission(handle, requestPermission);
  if (!hasPermission) return null;

  return handle;
}

async function requireWebRoot(): Promise<FileSystemDirectoryHandle> {
  const handle = await getAvailableWebRoot(false);
  if (!handle) {
    throw new Error('请先选择本地日志文件夹');
  }
  return handle;
}

async function getOrCreateWebDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function findWebDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const segments = cleanSegments(path, true);
  if (segments.length === 0) return root;

  let current = root;
  for (const segment of segments) {
    try {
      current = await current.getDirectoryHandle(segment, { create });
    } catch {
      return null;
    }
  }
  return current;
}

async function getOrCreateWebFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = cleanSegments(path);
  const fileName = segments[segments.length - 1];
  const parent = await getOrCreateWebDirectory(root, segments.slice(0, -1));
  return parent.getFileHandle(fileName, { create: true });
}

async function findWebFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
  const segments = cleanSegments(path);
  const fileName = segments[segments.length - 1];
  const parent = await findWebDirectory(root, segments.slice(0, -1).join('/'), false);
  if (!parent) return null;

  try {
    return await parent.getFileHandle(fileName, { create: false });
  } catch {
    return null;
  }
}

async function ensureWebVaultStructure(root: FileSystemDirectoryHandle): Promise<void> {
  await getOrCreateWebDirectory(root, cleanSegments(USER_LOG_DIR));
  await getOrCreateWebDirectory(root, cleanSegments(EXPORT_DIR));
  await getOrCreateWebDirectory(root, cleanSegments(ATTACHMENT_IMAGE_DIR));
  await getOrCreateWebDirectory(root, cleanSegments(TRASH_DIR));
  await getOrCreateWebDirectory(root, cleanSegments('.xiaoxiang'));
}

async function walkWebMarkdownFiles(
  directory: FileSystemDirectoryHandle,
  relativeRoot: string,
  result: VaultMarkdownFile[],
): Promise<void> {
  const entries = (directory as IterableFileSystemDirectoryHandle).entries?.();
  if (!entries) return;

  for await (const [name, handle] of entries) {
    const childPath = relativeRoot ? `${relativeRoot}/${name}` : name;
    if (handle.kind === 'directory') {
      await walkWebMarkdownFiles(handle as FileSystemDirectoryHandle, childPath, result);
    } else if (name.toLowerCase().endsWith('.md')) {
      const file = await (handle as FileSystemFileHandle).getFile();
      result.push({
        path: childPath,
        name,
        lastModified: file.lastModified,
        size: file.size,
      });
    }
  }
}

const androidBackend: VaultBackend = {
  isSupported(): boolean {
    return isAndroid();
  },

  async chooseVaultDirectory(): Promise<VaultStatus> {
    if (!isAndroid()) return unsupportedWebStatus('当前环境不是 Android App');
    return normalizeAndroidStatus(await LocalVault.chooseVaultDirectory());
  },

  async getVaultStatus(): Promise<VaultStatus> {
    if (!isAndroid()) return unsupportedWebStatus('当前环境不是 Android App');

    try {
      return normalizeAndroidStatus(await LocalVault.getVaultStatus());
    } catch {
      return androidStatusUnavailable('本地日志文件夹不可用，请重新授权');
    }
  },

  writeTextFile(path: string, content: string): Promise<{ path: string }> {
    return LocalVault.writeTextFile({ path, content });
  },

  writeBase64File(path: string, base64: string, mimeType: string): Promise<{ path: string }> {
    return LocalVault.writeBase64File({ path, base64, mimeType });
  },

  readTextFile(path: string): Promise<{ path: string; content: string }> {
    return LocalVault.readTextFile({ path });
  },

  listMarkdownFiles(root?: string): Promise<{ files: VaultMarkdownFile[] }> {
    return LocalVault.listMarkdownFiles({ root });
  },

  deleteFile(path: string): Promise<{ path: string; deleted: boolean }> {
    return LocalVault.deleteFile({ path });
  },

  moveFile(fromPath: string, toPath: string): Promise<{ fromPath: string; toPath: string }> {
    return LocalVault.moveFile({ fromPath, toPath });
  },
};

const webDirectoryBackend: VaultBackend = {
  isSupported(): boolean {
    return supportsWebDirectoryPicker();
  },

  async chooseVaultDirectory(): Promise<VaultStatus> {
    const webWindow = getWebWindow();
    if (!supportsWebDirectoryPicker() || !webWindow?.showDirectoryPicker) {
      return unsupportedWebStatus();
    }

    try {
      const handle = await webWindow.showDirectoryPicker({ mode: 'readwrite' });
      const hasPermission = await ensureWebPermission(handle, true);
      if (!hasPermission) {
        return webStatus({
          authorized: true,
          unavailableReason: '未获得本地文件夹写入权限',
        });
      }

      webRootHandle = handle;
      await storeWebRootHandle(handle);
      await ensureWebVaultStructure(handle);

      return webStatus({
        authorized: true,
        available: true,
        displayPath: handle.name || '已选择的本地文件夹',
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('已取消文件夹选择');
      }
      throw error;
    }
  },

  async getVaultStatus(): Promise<VaultStatus> {
    if (!supportsWebDirectoryPicker()) {
      return unsupportedWebStatus();
    }

    const handle = await getStoredWebRootHandle();
    if (!handle) {
      return webStatus({
        unavailableReason: '尚未选择本地日志文件夹',
      });
    }

    const hasPermission = await ensureWebPermission(handle, false);
    if (!hasPermission) {
      return webStatus({
        authorized: true,
        displayPath: handle.name || '',
        unavailableReason: '需要重新授权本地日志文件夹',
      });
    }

    return webStatus({
      authorized: true,
      available: true,
      displayPath: handle.name || '已选择的本地文件夹',
    });
  },

  async writeTextFile(path: string, content: string): Promise<{ path: string }> {
    const root = await requireWebRoot();
    const handle = await getOrCreateWebFile(root, path);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return { path };
  },

  async writeBase64File(path: string, base64: string, mimeType: string): Promise<{ path: string }> {
    const root = await requireWebRoot();
    const handle = await getOrCreateWebFile(root, path);
    const writable = await handle.createWritable();
    await writable.write(dataUrlToBlob(base64, mimeType));
    await writable.close();
    return { path };
  },

  async readTextFile(path: string): Promise<{ path: string; content: string }> {
    const root = await requireWebRoot();
    const handle = await findWebFile(root, path);
    if (!handle) throw new Error('文件不存在');

    const file = await handle.getFile();
    return {
      path,
      content: await file.text(),
    };
  },

  async listMarkdownFiles(rootPath = USER_LOG_DIR): Promise<{ files: VaultMarkdownFile[] }> {
    const root = await requireWebRoot();
    const directory = await findWebDirectory(root, rootPath, false);
    const files: VaultMarkdownFile[] = [];
    if (directory) {
      await walkWebMarkdownFiles(directory, normalizePath(rootPath).replace(/\/+$/, ''), files);
    }
    return { files };
  },

  async deleteFile(path: string): Promise<{ path: string; deleted: boolean }> {
    const root = await requireWebRoot();
    const segments = cleanSegments(path);
    const fileName = segments[segments.length - 1];
    const parent = await findWebDirectory(root, segments.slice(0, -1).join('/'), false);
    if (!parent) return { path, deleted: true };

    try {
      await parent.removeEntry(fileName);
      return { path, deleted: true };
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        return { path, deleted: true };
      }
      throw error;
    }
  },

  async moveFile(fromPath: string, toPath: string): Promise<{ fromPath: string; toPath: string }> {
    const root = await requireWebRoot();
    const source = await findWebFile(root, fromPath);
    if (!source) throw new Error('源文件不存在');

    const target = await getOrCreateWebFile(root, toPath);
    const writable = await target.createWritable();
    await writable.write(await source.getFile());
    await writable.close();
    await this.deleteFile(fromPath);

    return { fromPath, toPath };
  },
};

function getBackend(): VaultBackend {
  return isAndroid() ? androidBackend : webDirectoryBackend;
}

async function getStatusOrUnavailable(backend = getBackend()): Promise<VaultStatus> {
  try {
    return await backend.getVaultStatus();
  } catch (error: any) {
    return {
      supported: backend.isSupported(),
      authorized: false,
      available: false,
      displayPath: '',
      provider: isAndroid() ? 'android-documents' : backend.isSupported() ? 'web-directory' : 'unsupported',
      unavailableReason: error?.message || '本地日志文件夹不可用',
    };
  }
}

async function readManifest(backend = getBackend()): Promise<VaultManifest> {
  const status = await getStatusOrUnavailable(backend);
  if (!status.available) return emptyManifest();

  try {
    const result = await backend.readTextFile(MANIFEST_PATH);
    const parsed = JSON.parse(result.content) as VaultManifest;
    return {
      version: 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      entries: parsed.entries || {},
    };
  } catch {
    return emptyManifest();
  }
}

async function writeManifest(manifest: VaultManifest, backend = getBackend()): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await backend.writeTextFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function existingMarkdownPaths(root: string, backend = getBackend()): Promise<Set<string>> {
  try {
    const result = await backend.listMarkdownFiles(root);
    return new Set((result.files || []).map((file) => normalizePath(file.path)));
  } catch {
    return new Set();
  }
}

async function uniqueEntryPath(
  entry: DiaryEntry,
  manifest: VaultManifest,
  root: string,
  backend: VaultBackend,
  preferredFileName?: string,
): Promise<string> {
  const dateKey = formatEntryDate(entry);
  const year = dateKey.slice(0, 4);
  const rootYear = `${root}/${year}`;
  const used = await existingMarkdownPaths(rootYear, backend);

  for (const record of Object.values(manifest.entries)) {
    if (record.id !== entry.id) {
      if (record.path) used.add(normalizePath(record.path));
      if (record.trashPath) used.add(normalizePath(record.trashPath));
    }
  }

  const baseName = preferredFileName || `${dateKey}.md`;
  const directPath = `${rootYear}/${baseName}`;
  if (!used.has(directPath)) {
    return directPath;
  }

  const stem = baseName.replace(/\.md$/i, '') || dateKey;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${rootYear}/${stem}-${index}.md`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return `${rootYear}/${stem}-${Date.now()}.md`;
}

async function writeEntryImages(entry: DiaryEntry, backend: VaultBackend): Promise<string[]> {
  const paths: string[] = [];
  const images = entry.images || [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image || !image.startsWith('data:image/')) continue;

    const { extension, mimeType } = mimeExtensionFromDataUrl(image);
    const path = `${ATTACHMENT_IMAGE_DIR}/${entry.id}/${index + 1}.${extension}`;
    await backend.writeBase64File(path, image, mimeType);
    paths.push(path);
  }

  return paths;
}

async function renderEntryMarkdown(entry: DiaryEntry, targetPath: string, attachmentPaths: string[]): Promise<string> {
  const dateKey = formatEntryDate(entry);
  const body = buildBodyMarkdown(entry);
  const imageMarkdown = attachmentPaths.map((path) => `![](${relativePath(targetPath, path)})`).join('\n\n');
  const remoteImageMarkdown = (entry.images || [])
    .filter((image) => image && !image.startsWith('data:image/'))
    .map((image) => `![](${image})`)
    .join('\n\n');

  const sections = [body, imageMarkdown, remoteImageMarkdown].filter((section) => section.trim().length > 0);
  return `# ${dateKey}\n\n${sections.join('\n\n').trim()}\n`;
}

export const localVaultService = {
  isSupported(): boolean {
    return getBackend().isSupported();
  },

  async chooseVaultDirectory(): Promise<VaultStatus> {
    return getBackend().chooseVaultDirectory();
  },

  async getVaultStatus(): Promise<VaultStatus> {
    return getStatusOrUnavailable();
  },

  async writeTextFile(path: string, content: string): Promise<boolean> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return false;
    await backend.writeTextFile(path, content);
    return true;
  },

  async writeBase64File(path: string, base64: string, mimeType: string): Promise<boolean> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return false;
    await backend.writeBase64File(path, base64, mimeType);
    return true;
  },

  async listMarkdownFiles(root = USER_LOG_DIR): Promise<VaultMarkdownFile[]> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return [];
    const result = await backend.listMarkdownFiles(root);
    return result.files || [];
  },

  async readTextFile(path: string): Promise<string | null> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return null;
    const result = await backend.readTextFile(path);
    return result.content;
  },

  async exportBackup(filename: string, content: string): Promise<boolean> {
    return this.writeTextFile(`${EXPORT_DIR}/${filename}`, content);
  },

  async syncEntry(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return null;

    const manifest = await readManifest(backend);
    const record = manifest.entries[entry.id] || { id: entry.id };
    const root = entry.status === 'trashed' ? TRASH_DIR : USER_LOG_DIR;
    let targetPath = entry.status === 'trashed' ? record.trashPath : record.path;

    if (!targetPath) {
      targetPath = await uniqueEntryPath(entry, manifest, root, backend);
    }

    const attachmentPaths = await writeEntryImages(entry, backend);
    const markdown = await renderEntryMarkdown(entry, targetPath, attachmentPaths);
    await backend.writeTextFile(targetPath, markdown);

    if (entry.status === 'trashed') {
      if (record.path && record.path !== targetPath) {
        await backend.deleteFile(record.path).catch(() => undefined);
      }
      record.trashPath = targetPath;
      delete record.path;
    } else {
      if (record.trashPath && record.trashPath !== targetPath) {
        await backend.deleteFile(record.trashPath).catch(() => undefined);
      }
      record.path = targetPath;
      delete record.trashPath;
    }

    record.attachmentPaths = attachmentPaths;
    record.diaryDate = entry.diaryDate;
    record.updatedAt = entry.updatedAt;
    record.status = entry.status;
    manifest.entries[entry.id] = record;
    await writeManifest(manifest, backend);

    return {
      vaultPath: record.path,
      vaultTrashPath: record.trashPath,
      attachmentPaths,
    };
  },

  async moveEntryToTrash(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return null;

    const manifest = await readManifest(backend);
    const record = manifest.entries[entry.id] || { id: entry.id };
    const sourcePath = record.path;
    const fileName = sourcePath?.split('/').pop();
    const targetPath = record.trashPath || (await uniqueEntryPath(entry, manifest, TRASH_DIR, backend, fileName));

    if (sourcePath) {
      await backend.moveFile(sourcePath, targetPath).catch(async () => {
        await this.syncEntry({ ...entry, status: 'trashed' });
      });
    } else {
      await this.syncEntry({ ...entry, status: 'trashed' });
    }

    record.trashPath = targetPath;
    delete record.path;
    record.diaryDate = entry.diaryDate;
    record.updatedAt = entry.updatedAt;
    record.status = 'trashed';
    manifest.entries[entry.id] = record;
    await writeManifest(manifest, backend);

    return {
      vaultTrashPath: targetPath,
      attachmentPaths: record.attachmentPaths || [],
    };
  },

  async restoreEntry(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return null;

    const manifest = await readManifest(backend);
    const record = manifest.entries[entry.id] || { id: entry.id };
    const sourcePath = record.trashPath;
    const fileName = sourcePath?.split('/').pop();
    const targetPath = record.path || (await uniqueEntryPath(entry, manifest, USER_LOG_DIR, backend, fileName));

    if (sourcePath) {
      await backend.moveFile(sourcePath, targetPath).catch(async () => {
        await this.syncEntry({ ...entry, status: 'active' });
      });
    } else {
      await this.syncEntry({ ...entry, status: 'active' });
    }

    record.path = targetPath;
    delete record.trashPath;
    record.diaryDate = entry.diaryDate;
    record.updatedAt = entry.updatedAt;
    record.status = 'active';
    manifest.entries[entry.id] = record;
    await writeManifest(manifest, backend);

    return {
      vaultPath: targetPath,
      attachmentPaths: record.attachmentPaths || [],
    };
  },

  async deleteEntryFiles(entryId: string): Promise<void> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return;

    const manifest = await readManifest(backend);
    const record = manifest.entries[entryId];
    if (!record) return;

    const paths = [record.path, record.trashPath, ...(record.attachmentPaths || [])].filter(Boolean) as string[];
    await Promise.all(paths.map((path) => backend.deleteFile(path).catch(() => undefined)));
    delete manifest.entries[entryId];
    await writeManifest(manifest, backend);
  },

  async readEntriesFromVault(): Promise<VaultImportedEntry[]> {
    const backend = getBackend();
    const status = await getStatusOrUnavailable(backend);
    if (!status.available) return [];

    const manifest = await readManifest(backend);
    const idByPath = new Map<string, string>();
    for (const record of Object.values(manifest.entries)) {
      if (record.path) idByPath.set(normalizePath(record.path), record.id);
    }

    const files = await this.listMarkdownFiles(USER_LOG_DIR);
    const entries: VaultImportedEntry[] = [];
    for (const file of files) {
      const content = await this.readTextFile(file.path);
      if (!content) continue;

      const date = parseDateFromMarkdown(file.path, content);
      const body = removeDateHeading(content);
      const title = stripMarkdownForTitle(body).slice(0, 30) || date;
      entries.push({
        id: idByPath.get(normalizePath(file.path)),
        title,
        content: body,
        diaryDate: new Date(date).toISOString(),
        vaultPath: file.path,
      });
    }
    return entries;
  },
};
