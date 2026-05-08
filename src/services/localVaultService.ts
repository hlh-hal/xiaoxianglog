import { Capacitor, registerPlugin } from '@capacitor/core';
import { format } from 'date-fns';
import type { DiaryEntry, EntryStatus } from './diaryService';
import { htmlToMarkdown } from '../utils/htmlToMarkdown';

export interface VaultStatus {
  supported: boolean;
  authorized: boolean;
  available: boolean;
  displayPath: string;
  treeUri?: string;
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

const LocalVault = registerPlugin<LocalVaultPlugin>('LocalVault');

const USER_LOG_DIR = '用户日志';
const EXPORT_DIR = '导出文件';
const ATTACHMENT_IMAGE_DIR = '附件/images';
const TRASH_DIR = '回收站';
const MANIFEST_PATH = '.xiaoxiang/manifest.json';

const emptyManifest = (): VaultManifest => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: {},
});

function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
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

async function getStatusOrUnavailable(): Promise<VaultStatus> {
  if (!isAndroid()) {
    return {
      supported: false,
      authorized: false,
      available: false,
      displayPath: '',
    };
  }

  try {
    return await LocalVault.getVaultStatus();
  } catch {
    return {
      supported: true,
      authorized: false,
      available: false,
      displayPath: '',
    };
  }
}

async function readManifest(): Promise<VaultManifest> {
  const status = await getStatusOrUnavailable();
  if (!status.available) return emptyManifest();

  try {
    const result = await LocalVault.readTextFile({ path: MANIFEST_PATH });
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

async function writeManifest(manifest: VaultManifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await LocalVault.writeTextFile({
    path: MANIFEST_PATH,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });
}

async function existingMarkdownPaths(root: string): Promise<Set<string>> {
  try {
    const result = await LocalVault.listMarkdownFiles({ root });
    return new Set((result.files || []).map((file) => normalizePath(file.path)));
  } catch {
    return new Set();
  }
}

async function uniqueEntryPath(entry: DiaryEntry, manifest: VaultManifest, root: string, preferredFileName?: string): Promise<string> {
  const dateKey = formatEntryDate(entry);
  const year = dateKey.slice(0, 4);
  const rootYear = `${root}/${year}`;
  const used = await existingMarkdownPaths(rootYear);

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

async function writeEntryImages(entry: DiaryEntry): Promise<string[]> {
  const paths: string[] = [];
  const images = entry.images || [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image || !image.startsWith('data:image/')) continue;

    const { extension, mimeType } = mimeExtensionFromDataUrl(image);
    const path = `${ATTACHMENT_IMAGE_DIR}/${entry.id}/${index + 1}.${extension}`;
    await LocalVault.writeBase64File({ path, base64: image, mimeType });
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
    return isAndroid();
  },

  async chooseVaultDirectory(): Promise<VaultStatus> {
    if (!isAndroid()) return getStatusOrUnavailable();
    return LocalVault.chooseVaultDirectory();
  },

  async getVaultStatus(): Promise<VaultStatus> {
    return getStatusOrUnavailable();
  },

  async writeTextFile(path: string, content: string): Promise<boolean> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return false;
    await LocalVault.writeTextFile({ path, content });
    return true;
  },

  async writeBase64File(path: string, base64: string, mimeType: string): Promise<boolean> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return false;
    await LocalVault.writeBase64File({ path, base64, mimeType });
    return true;
  },

  async listMarkdownFiles(root = USER_LOG_DIR): Promise<VaultMarkdownFile[]> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return [];
    const result = await LocalVault.listMarkdownFiles({ root });
    return result.files || [];
  },

  async readTextFile(path: string): Promise<string | null> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return null;
    const result = await LocalVault.readTextFile({ path });
    return result.content;
  },

  async exportBackup(filename: string, content: string): Promise<boolean> {
    return this.writeTextFile(`${EXPORT_DIR}/${filename}`, content);
  },

  async syncEntry(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return null;

    const manifest = await readManifest();
    const record = manifest.entries[entry.id] || { id: entry.id };
    const root = entry.status === 'trashed' ? TRASH_DIR : USER_LOG_DIR;
    let targetPath = entry.status === 'trashed' ? record.trashPath : record.path;

    if (!targetPath) {
      targetPath = await uniqueEntryPath(entry, manifest, root);
    }

    const attachmentPaths = await writeEntryImages(entry);
    const markdown = await renderEntryMarkdown(entry, targetPath, attachmentPaths);
    await LocalVault.writeTextFile({ path: targetPath, content: markdown });

    if (entry.status === 'trashed') {
      if (record.path && record.path !== targetPath) {
        await LocalVault.deleteFile({ path: record.path }).catch(() => undefined);
      }
      record.trashPath = targetPath;
      delete record.path;
    } else {
      if (record.trashPath && record.trashPath !== targetPath) {
        await LocalVault.deleteFile({ path: record.trashPath }).catch(() => undefined);
      }
      record.path = targetPath;
      delete record.trashPath;
    }

    record.attachmentPaths = attachmentPaths;
    record.diaryDate = entry.diaryDate;
    record.updatedAt = entry.updatedAt;
    record.status = entry.status;
    manifest.entries[entry.id] = record;
    await writeManifest(manifest);

    return {
      vaultPath: record.path,
      vaultTrashPath: record.trashPath,
      attachmentPaths,
    };
  },

  async moveEntryToTrash(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return null;

    const manifest = await readManifest();
    const record = manifest.entries[entry.id] || { id: entry.id };
    const sourcePath = record.path;
    const fileName = sourcePath?.split('/').pop();
    const targetPath = record.trashPath || (await uniqueEntryPath(entry, manifest, TRASH_DIR, fileName));

    if (sourcePath) {
      await LocalVault.moveFile({ fromPath: sourcePath, toPath: targetPath }).catch(async () => {
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
    await writeManifest(manifest);

    return {
      vaultTrashPath: targetPath,
      attachmentPaths: record.attachmentPaths || [],
    };
  },

  async restoreEntry(entry: DiaryEntry): Promise<VaultSyncResult | null> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return null;

    const manifest = await readManifest();
    const record = manifest.entries[entry.id] || { id: entry.id };
    const sourcePath = record.trashPath;
    const fileName = sourcePath?.split('/').pop();
    const targetPath = record.path || (await uniqueEntryPath(entry, manifest, USER_LOG_DIR, fileName));

    if (sourcePath) {
      await LocalVault.moveFile({ fromPath: sourcePath, toPath: targetPath }).catch(async () => {
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
    await writeManifest(manifest);

    return {
      vaultPath: targetPath,
      attachmentPaths: record.attachmentPaths || [],
    };
  },

  async deleteEntryFiles(entryId: string): Promise<void> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return;

    const manifest = await readManifest();
    const record = manifest.entries[entryId];
    if (!record) return;

    const paths = [record.path, record.trashPath, ...(record.attachmentPaths || [])].filter(Boolean) as string[];
    await Promise.all(paths.map((path) => LocalVault.deleteFile({ path }).catch(() => undefined)));
    delete manifest.entries[entryId];
    await writeManifest(manifest);
  },

  async readEntriesFromVault(): Promise<VaultImportedEntry[]> {
    const status = await getStatusOrUnavailable();
    if (!status.available) return [];

    const manifest = await readManifest();
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
