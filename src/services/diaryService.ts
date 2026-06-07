/**
 * 日记服务 - 前后端一体版
 * 策略：对于日记(Entries)，使用本地优先(Local-First) + syncWithServer 推拉同步
 * 对于其他数据(模板/聊天/历史)，使用在线优先+本地兜底
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { api, isAuthenticated, uploadImages } from './apiClient';
import { localVaultService, VaultSyncResult } from './localVaultService';
import { createClientId } from '../utils/id';
import { compareDiaryDateDesc, getDiaryDateKey } from '../utils/diaryDate';

/** 过滤掉 images 数组中的空字符串和无效值 */
function filterValidImages(images?: string[] | null): string[] {
  if (!images || !Array.isArray(images)) return [];
  return images.filter(img => typeof img === 'string' && img.trim() !== '');
}

function areImagesEqual(a?: string[] | null, b?: string[] | null): boolean {
  const left = filterValidImages(a);
  const right = filterValidImages(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function stripHistoryImagesAndTags(content: string): string {
  return (content || '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/&lt;img\b[\s\S]*?(?:&gt;|$)/gi, '')
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g, '')
    .replace(/diary-image-ref:[A-Za-z0-9_%.-]+/g, '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeHistorySummary(content: string): string {
  const summary = stripHistoryImagesAndTags(content);
  return summary.substring(0, 50) + (summary.length > 50 ? '...' : '');
}

export type EntryStatus = 'active' | 'draft' | 'trashed';

export type DailyEchoStatus = 'draft' | 'saved' | 'dismissed' | 'failed';

export interface DailyEcho {
  status: DailyEchoStatus;
  content: string;
  styleId: 'gentle';
  generatedAt: string;
  sourceEntryUpdatedAt: string;
  regenerateCount: number;
  card?: {
    imageUrl?: string;
    localDataUrl?: string;
    width: number;
    height: number;
    renderedAt: string;
  };
}

export interface DiaryEntry {
  id: string;
  userId?: string;
  title?: string;
  content: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
  diaryDate: string;
  status: EntryStatus;
  trashReason?: 'deleted' | 'abandoned';
  trashedAt?: string;
  isPinned?: boolean;
  isHidden?: boolean;
  mood?: string;
  weather?: string;
  tags?: string[];
  blocks?: { title: string; content: string }[];
  prompts?: any;
  backgroundId?: string;
  themeId?: string | null;
  dailyEcho?: DailyEcho;
  activeWritingSeconds?: number;
  syncVersion?: number;
  vaultPath?: string;
  vaultTrashPath?: string;
  attachmentPaths?: string[];
}

export interface DiaryTemplate {
  id: string;
  title: string;
  content: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EditHistory {
  id: string;
  entryId: string;
  content: string;
  images: string[];
  savedAt: string;
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  rawText?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  styleId?: string;
  pinned?: boolean;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredFont {
  id: string;
  label: string;
  fontFamily: string;
  fileData: ArrayBuffer;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface DiaryDB extends DBSchema {
  entries: {
    key: string;
    value: DiaryEntry;
    indexes: { 'by-date': string; 'by-status': string };
  };
  templates: {
    key: string;
    value: DiaryTemplate;
  };
  history: {
    key: string;
    value: EditHistory;
    indexes: { 'by-entry': string };
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-updated': string };
  };
  customFonts: {
    key: string;
    value: StoredFont;
  };
}

let dbPromise: Promise<IDBPDatabase<DiaryDB>> | null = null;

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<DiaryDB>('ethos-diary-db', 4, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' });
          store.createIndex('by-date', 'diaryDate');
          store.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-entry', 'entryId');
        }
        if (!db.objectStoreNames.contains('chatSessions')) {
          const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
          chatStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('customFonts')) {
          db.createObjectStore('customFonts', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

function useApi(): boolean {
  return isAuthenticated();
}

function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('request timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

let activeEntriesCache: DiaryEntry[] | null = null;
let syncTimeout: any = null;
let autoSyncStarted = false;
let syncInFlight: Promise<void> | null = null;

export const DIARY_SYNC_EVENT = 'xiang-diary-sync-complete';

type SyncOptions = {
  forceFullPull?: boolean;
  pushAll?: boolean;
  immediate?: boolean;
};

type EntrySaveOptions = {
  saveHistory?: boolean;
  triggerSync?: boolean;
  immediateSync?: boolean;
};

type VaultSyncAllOptions = {
  onProgress?: (done: number, total: number) => void;
  retryCount?: number;
};

type VaultSyncAllResult = {
  count: number;
  total: number;
  failCount: number;
};

const SESSION_KEY = 'app_session';
const LAST_SYNC_KEY = 'xiang_last_sync_time';
const LAST_PUSH_KEY = 'xiang_last_push_time';
const LAST_SYNC_ERROR_KEY = 'xiang_last_sync_error';
const SYNC_BATCH_SIZE = 50;

function getCurrentUserId(): string | null {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;
    const parsed = JSON.parse(session);
    return typeof parsed?.userId === 'string' && parsed.userId ? parsed.userId : null;
  } catch {
    return null;
  }
}

function syncStorageKey(baseKey: string, userId: string | null): string {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function isEntryForCurrentUser(entry: DiaryEntry, userId: string | null = getCurrentUserId()): boolean {
  if (!userId) return true;
  return !entry.userId || entry.userId === userId;
}

function stampEntryUser(entry: DiaryEntry, userId: string | null = getCurrentUserId()): DiaryEntry {
  if (!userId || entry.userId === userId) return entry;
  return { ...entry, userId };
}

function normalizeEntryForLocalAccount(entry: DiaryEntry, userId: string | null): DiaryEntry {
  return stampEntryUser({ ...entry, images: filterValidImages(entry.images) }, userId);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '同步失败');
}

function setSyncError(userId: string | null, message: string): void {
  localStorage.setItem(syncStorageKey(LAST_SYNC_ERROR_KEY, userId), message);
}

function clearSyncError(userId: string | null): void {
  localStorage.removeItem(syncStorageKey(LAST_SYNC_ERROR_KEY, userId));
}

function clearSyncStorageKeys(): void {
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(LAST_PUSH_KEY);
  localStorage.removeItem(LAST_SYNC_ERROR_KEY);
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith(`${LAST_SYNC_KEY}:`)
      || key.startsWith(`${LAST_PUSH_KEY}:`)
      || key.startsWith(`${LAST_SYNC_ERROR_KEY}:`)
    )) {
      localStorage.removeItem(key);
    }
  }
}

function emitDiarySyncEvent(changed: boolean, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || (!changed && !detail)) return;
  window.dispatchEvent(new CustomEvent(DIARY_SYNC_EVENT, { detail }));
}

function isDataImage(value: string): boolean {
  return value.trim().startsWith('data:image/');
}

function stripLocalOnlySyncAssets(entry: DiaryEntry): DiaryEntry {
  const nextEntry: DiaryEntry = {
    ...entry,
    images: filterValidImages(entry.images).filter(image => !isDataImage(image)),
  };

  if (nextEntry.dailyEcho?.card?.localDataUrl) {
    nextEntry.dailyEcho = {
      ...nextEntry.dailyEcho,
      card: {
        ...nextEntry.dailyEcho.card,
        localDataUrl: undefined,
      },
    };
  }

  return nextEntry;
}

const INLINE_IMAGE_REF_PREFIX = 'diary-image-ref:';

function createInlineImageKey(src: string): string {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `img_${(hash >>> 0).toString(36)}_${src.length.toString(36)}`;
}

function parseInlineImageRef(src?: string | null): string {
  if (!src || !src.startsWith(INLINE_IMAGE_REF_PREFIX)) return '';
  try {
    return decodeURIComponent(src.slice(INLINE_IMAGE_REF_PREFIX.length));
  } catch {
    return src.slice(INLINE_IMAGE_REF_PREFIX.length);
  }
}

function rewriteInlineImageRefs(content: string, uploadedByKey: Map<string, string>): string {
  if (!content || uploadedByKey.size === 0) return content;

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      let changed = false;
      doc.querySelectorAll<HTMLImageElement>('img[data-diary-inline-image]').forEach((img) => {
        const src = img.getAttribute('src') || '';
        const key = img.getAttribute('data-image-key') || parseInlineImageRef(src);
        const uploadedUrl = key ? uploadedByKey.get(key) : '';
        if (uploadedUrl) {
          img.setAttribute('src', uploadedUrl);
          changed = true;
        }
      });
      if (changed) return doc.body.innerHTML;
    } catch (error) {
      console.warn('Failed to rewrite inline image refs:', error);
    }
  }

  let nextContent = content;
  uploadedByKey.forEach((url, key) => {
    nextContent = nextContent.replaceAll(`${INLINE_IMAGE_REF_PREFIX}${encodeURIComponent(key)}`, url);
  });
  return nextContent;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const match = dataUrl.match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const mime = match[1];
  const binary = atob(match[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function extensionFromDataUrl(dataUrl: string): string {
  const mime = dataUrl.match(/^data:(image\/[^;,]+)/i)?.[1]?.toLowerCase();
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('webp')) return 'webp';
  if (mime?.includes('gif')) return 'gif';
  return 'jpg';
}

function parseEntryTime(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getEntryChangeTime(entry: DiaryEntry): number {
  return Math.max(parseEntryTime(entry.updatedAt), parseEntryTime(entry.trashedAt));
}

async function applyVaultSyncResult(entry: DiaryEntry, result: VaultSyncResult | null): Promise<DiaryEntry> {
  if (!result) return entry;

  const syncedEntry: DiaryEntry = {
    ...entry,
    vaultPath: result.vaultPath,
    vaultTrashPath: result.vaultTrashPath,
    attachmentPaths: result.attachmentPaths,
  };
  const db = await initDB();
  await db.put('entries', syncedEntry);
  return syncedEntry;
}

async function syncEntryToVault(entry: DiaryEntry): Promise<DiaryEntry> {
  try {
    return await applyVaultSyncResult(entry, await localVaultService.syncEntry(entry));
  } catch (error) {
    console.warn('Sync entry to local vault failed:', error);
    return entry;
  }
}

async function moveVaultEntryToTrash(entry: DiaryEntry): Promise<DiaryEntry> {
  try {
    return await applyVaultSyncResult(entry, await localVaultService.moveEntryToTrash(entry));
  } catch (error) {
    console.warn('Move local vault entry to trash failed:', error);
    return entry;
  }
}

async function restoreVaultEntry(entry: DiaryEntry): Promise<DiaryEntry> {
  try {
    return await applyVaultSyncResult(entry, await localVaultService.restoreEntry(entry));
  } catch (error) {
    console.warn('Restore local vault entry failed:', error);
    return entry;
  }
}

async function uploadEntryImagesForSync(db: IDBPDatabase<DiaryDB>, entry: DiaryEntry): Promise<{ entry: DiaryEntry; changed: boolean }> {
  const images = filterValidImages(entry.images);
  if (!images.some(isDataImage)) {
    const changed = images.length !== (entry.images || []).length;
    const normalizedEntry = { ...entry, images };
    const echoPrepared = await uploadDailyEchoCardForSync(normalizedEntry);
    if (changed || echoPrepared.changed) {
      await db.put('entries', echoPrepared.entry);
    }
    return { entry: echoPrepared.entry, changed: changed || echoPrepared.changed };
  }

  const nextImages: string[] = [];
  const uploadedByKey = new Map<string, string>();
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!isDataImage(image)) {
      nextImages.push(image);
      continue;
    }

    const ext = extensionFromDataUrl(image);
    const file = dataUrlToFile(image, `diary-${entry.id}-${index}.${ext}`);
    const [uploadedUrl] = await uploadImages([file]);
    uploadedByKey.set(createInlineImageKey(image), uploadedUrl);
    nextImages.push(uploadedUrl);
  }

  const syncedEntry: DiaryEntry = {
    ...entry,
    content: rewriteInlineImageRefs(entry.content, uploadedByKey),
    images: nextImages,
  };
  const echoPrepared = await uploadDailyEchoCardForSync(syncedEntry);
  await db.put('entries', echoPrepared.entry);
  return { entry: echoPrepared.entry, changed: true };
}

async function uploadDailyEchoCardForSync(entry: DiaryEntry): Promise<{ entry: DiaryEntry; changed: boolean }> {
  const echo = entry.dailyEcho;
  const localDataUrl = echo?.card?.localDataUrl;
  if (!echo || !echo.card || !localDataUrl || !isDataImage(localDataUrl)) {
    return { entry, changed: false };
  }

  const ext = extensionFromDataUrl(localDataUrl);
  const file = dataUrlToFile(localDataUrl, `diary-echo-${entry.id}.${ext}`);
  const [uploadedUrl] = await uploadImages([file]);
  return {
    entry: {
      ...entry,
      dailyEcho: {
        ...echo,
        card: {
          ...echo.card,
          imageUrl: uploadedUrl,
          localDataUrl: undefined,
        },
      },
    },
    changed: true,
  };
}

function toSyncPayload(entry: DiaryEntry): DiaryEntry {
  const { syncVersion: _syncVersion, userId: _userId, ...payload } = entry;
  payload.diaryDate = getDiaryDateKey(payload.diaryDate, new Date());
  if (payload.dailyEcho == null) {
    delete (payload as Partial<DiaryEntry>).dailyEcho;
  } else if (payload.dailyEcho.card) {
    payload.dailyEcho = {
      ...payload.dailyEcho,
      card: {
        ...payload.dailyEcho.card,
        localDataUrl: undefined,
      },
    };
  }
  return payload as DiaryEntry;
}

async function saveLocalHistorySnapshot(history: Omit<EditHistory, 'id' | 'summary'>): Promise<void> {
  const db = await initDB();
  const content = history.content || '';
  const images = filterValidImages(history.images);
  if (!content && images.length === 0) return;

  const existing = await db.getAllFromIndex('history', 'by-entry', history.entryId);
  if (existing.length > 0) {
    const sorted = existing.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    if (sorted[0].content === content && areImagesEqual(sorted[0].images, images)) return;
  }

  const newHistory: EditHistory = {
    ...history,
    content,
    images,
    id: createClientId(),
    summary: makeHistorySummary(content),
  };
  await db.put('history', newHistory);
}

function mergeHistoryLists(localHistory: EditHistory[], remoteHistory: EditHistory[]): EditHistory[] {
  const merged = new Map<string, EditHistory>();

  for (const history of [...localHistory, ...remoteHistory]) {
    const images = filterValidImages(history.images);
    const key = `${history.content || ''}\u0000${JSON.stringify(images)}`;
    const existing = merged.get(key);
    if (!existing || new Date(history.savedAt).getTime() > new Date(existing.savedAt).getTime()) {
      merged.set(key, { ...history, images });
    }
  }

  return Array.from(merged.values()).sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export const diaryService = {
  getCachedActiveEntries(): DiaryEntry[] | null {
    return activeEntriesCache ? activeEntriesCache.filter(entry => isEntryForCurrentUser(entry)) : null;
  },

  getSyncStatus(): { lastSyncAt: string | null; lastPushAt: string | null; lastError: string | null } {
    const userId = getCurrentUserId();
    return {
      lastSyncAt: localStorage.getItem(syncStorageKey(LAST_SYNC_KEY, userId)),
      lastPushAt: localStorage.getItem(syncStorageKey(LAST_PUSH_KEY, userId)),
      lastError: localStorage.getItem(syncStorageKey(LAST_SYNC_ERROR_KEY, userId)),
    };
  },

  async init(): Promise<void> {
    await initDB();
    await this.getActiveEntries();
    this.startAutoSync();
    this.triggerSync();
  },

  startAutoSync(): void {
    if (autoSyncStarted || typeof window === 'undefined') return;
    autoSyncStarted = true;

    const syncVisiblePage = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.triggerSync();
    };

    window.addEventListener('focus', syncVisiblePage);
    window.addEventListener('pageshow', syncVisiblePage);
    document.addEventListener('visibilitychange', syncVisiblePage);
    window.setInterval(syncVisiblePage, 15000);
  },

  async syncCurrentAccount(): Promise<void> {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    await this.syncWithServer({ forceFullPull: true, pushAll: true });
  },

  async syncAllEntriesToVault(options: VaultSyncAllOptions = {}): Promise<VaultSyncAllResult> {
    const db = await initDB();
    const entries = (await db.getAll('entries')).filter(entry => isEntryForCurrentUser(entry));
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const result = await localVaultService.syncEntries(entries, {
      onProgress: options.onProgress,
      retryCount: options.retryCount,
    });

    for (const syncedResult of result.entries) {
      const entry = entryById.get(syncedResult.entryId);
      if (entry) {
        await applyVaultSyncResult(entry, syncedResult);
      }
    }

    localVaultService.cleanupEmptyMarkdownFiles()
      .catch(error => console.warn('Cleanup local vault empty files failed:', error));
    activeEntriesCache = null;
    emitDiarySyncEvent(result.count > 0);
    return { count: result.count, total: result.total, failCount: result.failCount };
  },

  async clearLocalUserData(): Promise<void> {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    const db = await initDB();
    const tx = db.transaction(['entries', 'templates', 'history', 'chatSessions', 'customFonts'], 'readwrite');
    await Promise.all([
      tx.objectStore('entries').clear(),
      tx.objectStore('templates').clear(),
      tx.objectStore('history').clear(),
      tx.objectStore('chatSessions').clear(),
      tx.objectStore('customFonts').clear(),
    ]);
    await tx.done;

    activeEntriesCache = null;
    clearSyncStorageKeys();
    localStorage.removeItem('xiang_welcome_created');
  },

  triggerSync(options: SyncOptions = {}) {
    if (!useApi()) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    const run = () => {
      syncTimeout = null;
      this.syncWithServer(options).catch(console.error);
    };
    if (options.immediate) {
      run();
      return;
    }
    syncTimeout = setTimeout(run, 1000);
  },

  async syncWithServer(options: SyncOptions = {}): Promise<void> {
    if (!useApi()) return;
    if (syncInFlight) {
      await syncInFlight.catch(() => undefined);
      if (!options.forceFullPull && !options.pushAll) return;
    }

    const run = (async () => {
      const db = await initDB();
      const userId = getCurrentUserId();
      const lastSyncKey = syncStorageKey(LAST_SYNC_KEY, userId);
      const lastPushKey = syncStorageKey(LAST_PUSH_KEY, userId);
      const lastSync = options.forceFullPull ? '' : localStorage.getItem(lastSyncKey) || '';
      let localEntriesChanged = false;
      const acceptedEntryIds = new Set<string>();

      const applyRemoteEntries = async (entries: DiaryEntry[] = []): Promise<number> => {
        if (entries.length === 0) return 0;

        const tx = db.transaction('entries', 'readwrite');
        const acceptedEntries: DiaryEntry[] = [];
        for (const remoteEntry of entries) {
          const entry = normalizeEntryForLocalAccount(remoteEntry, userId);
          const localEntry = await tx.store.get(entry.id);
          if (
            localEntry
            && isEntryForCurrentUser(localEntry, userId)
            && getEntryChangeTime(localEntry) > getEntryChangeTime(entry)
          ) {
            continue;
          }
          await tx.store.put(entry);
          acceptedEntries.push(entry);
          acceptedEntryIds.add(entry.id);
        }
        await tx.done;

        await Promise.all(acceptedEntries.map(entry => syncEntryToVault(entry)));
        if (acceptedEntries.length > 0) {
          activeEntriesCache = null;
          localEntriesChanged = true;
        }
        return acceptedEntries.length;
      };

      const pullUrl = lastSync ? `/sync/pull?since=${encodeURIComponent(lastSync)}` : '/sync/pull';
      const pullData = await api.get<{ entries: DiaryEntry[], serverTime: string }>(pullUrl);
      await applyRemoteEntries(pullData.entries || []);

      if (pullData.serverTime) {
        localStorage.setItem(lastSyncKey, pullData.serverTime);
      }

      const lastPush = options.pushAll ? '' : localStorage.getItem(lastPushKey) || '';
      const pushTime = lastPush ? new Date(lastPush).getTime() : 0;
      const allLocal = await db.getAll('entries');
      const candidates = allLocal.filter(entry => (
        isEntryForCurrentUser(entry, userId)
        && (!lastPush || getEntryChangeTime(entry) > pushTime)
      ));
      const toPush: DiaryEntry[] = [];

      for (const entry of candidates) {
        if (acceptedEntryIds.has(entry.id)) continue;

        const ownedEntry = stampEntryUser(entry, userId);
        if (ownedEntry !== entry) {
          await db.put('entries', ownedEntry);
          activeEntriesCache = null;
          localEntriesChanged = true;
        }

        let prepared: { entry: DiaryEntry; changed: boolean };
        try {
          prepared = await uploadEntryImagesForSync(db, ownedEntry);
        } catch (error) {
          console.warn('Upload local diary images before sync failed; syncing text without local-only images:', error);
          const fallbackEntry = stripLocalOnlySyncAssets(ownedEntry);
          if (!areImagesEqual(fallbackEntry.images, ownedEntry.images) || fallbackEntry.dailyEcho !== ownedEntry.dailyEcho) {
            await db.put('entries', fallbackEntry);
            activeEntriesCache = null;
            localEntriesChanged = true;
          }
          prepared = { entry: fallbackEntry, changed: fallbackEntry !== ownedEntry };
        }
        if (prepared.changed) {
          activeEntriesCache = null;
          localEntriesChanged = true;
        }
        toPush.push(toSyncPayload(prepared.entry));
      }

      let latestPushServerTime = '';
      let skippedPushCount = 0;
      for (let index = 0; index < toPush.length; index += SYNC_BATCH_SIZE) {
        const batch = toPush.slice(index, index + SYNC_BATCH_SIZE);
        let pushResult: { serverTime: string; results?: { id: string; status: string; reason?: string }[] };
        try {
          pushResult = await api.post<{ serverTime: string; results?: { id: string; status: string; reason?: string }[] }>('/sync/push', { entries: batch });
        } catch (error) {
          const firstIds = batch
            .map(entry => entry.id)
            .filter(Boolean)
            .slice(0, 5)
            .join(',');
          throw new Error(`同步推送失败 batch=${Math.floor(index / SYNC_BATCH_SIZE) + 1} size=${batch.length} ids=${firstIds}: ${getErrorMessage(error)}`);
        }

        const skipped = (pushResult.results || []).filter(result => result.status === 'skipped');
        if (skipped.length > 0) {
          const skippedIds = skipped.map(result => result.id).filter(Boolean).slice(0, 5).join(',');
          skippedPushCount += skipped.length;
          console.warn(`同步推送跳过 ${skipped.length} 条异常日记，ids=${skippedIds}`);
        }

        if (pushResult.serverTime) {
          latestPushServerTime = pushResult.serverTime;
        }
      }

      if (latestPushServerTime) {
        if (skippedPushCount === 0) {
          localStorage.setItem(lastPushKey, latestPushServerTime);
        } else {
          setSyncError(userId, `同步跳过 ${skippedPushCount} 条异常日记，稍后会继续重试`);
        }

        const repullSince = pullData.serverTime || lastSync;
        const repullUrl = repullSince ? `/sync/pull?since=${encodeURIComponent(repullSince)}` : '/sync/pull';
        const repullData = await api.get<{ entries: DiaryEntry[], serverTime: string }>(repullUrl);
        await applyRemoteEntries(repullData.entries || []);
        localStorage.setItem(lastSyncKey, repullData.serverTime || latestPushServerTime);
      }

      if (skippedPushCount === 0) {
        clearSyncError(userId);
      }
      emitDiarySyncEvent(localEntriesChanged, { ok: true });
    })();

    syncInFlight = run;
    try {
      await run;
    } catch (err) {
      const userId = getCurrentUserId();
      const message = getErrorMessage(err);
      setSyncError(userId, message);
      emitDiarySyncEvent(false, { ok: false, error: message });
      console.warn('Sync with server failed:', err);
      throw err;
    } finally {
      if (syncInFlight === run) {
        syncInFlight = null;
      }
    }
  },

  async getAllEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-date');
    return entries.filter(entry => isEntryForCurrentUser(entry));
  },

  async getActiveEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'active');
    const result = entries.filter((e: DiaryEntry) => isEntryForCurrentUser(e) && !e.isHidden).sort((a: DiaryEntry, b: DiaryEntry) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return compareDiaryDateDesc(a.diaryDate, b.diaryDate);
    });
    // 过滤掉 images 中的空字符串/无效值，防止首页渲染空图片容器
    result.forEach(e => { e.images = filterValidImages(e.images); });
    activeEntriesCache = result;
    return result;
  },

  async getDraftEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'draft');
    return entries.filter(entry => isEntryForCurrentUser(entry)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getTrashEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'trashed');
    return entries.filter(entry => isEntryForCurrentUser(entry)).sort((a, b) => new Date(b.trashedAt || b.updatedAt).getTime() - new Date(a.trashedAt || a.updatedAt).getTime());
  },

  async searchEntries(keyword: string): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'active');
    const lk = keyword.toLowerCase();
    return entries.filter((e: DiaryEntry) => isEntryForCurrentUser(e) && !e.isHidden && ((e.title && e.title.toLowerCase().includes(lk)) || (e.content && e.content.toLowerCase().includes(lk)) || (e.blocks && e.blocks.some((b: any) => (b.title && b.title.toLowerCase().includes(lk)) || (b.content && b.content.toLowerCase().includes(lk)))))).sort((a: DiaryEntry, b: DiaryEntry) => compareDiaryDateDesc(a.diaryDate, b.diaryDate));
  },

  async getEntryById(id: string): Promise<DiaryEntry | undefined> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (entry && !isEntryForCurrentUser(entry)) return undefined;
    if (entry) entry.images = filterValidImages(entry.images);
    return entry;
  },

  async createEntry(data: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { id?: string; status?: EntryStatus; createdAt?: string; updatedAt?: string }, options: EntrySaveOptions = {}): Promise<DiaryEntry> {
    const now = new Date().toISOString();
    let entry: DiaryEntry = stampEntryUser({ ...data, images: filterValidImages(data.images), id: data.id || createClientId(), createdAt: data.createdAt || now, updatedAt: data.updatedAt || now, status: data.status || 'active' });
    const db = await initDB(); 
    await db.put('entries', entry);
    entry = await syncEntryToVault(entry);
    if (options.saveHistory !== false) {
      await saveLocalHistorySnapshot({
        entryId: entry.id,
        content: entry.content,
        images: entry.images,
        savedAt: entry.updatedAt || now,
      });
    }
    activeEntriesCache = null; 
    if (options.triggerSync !== false) {
      this.triggerSync({ immediate: options.immediateSync });
    }
    return entry;
  },

  async updateEntry(id: string, patch: Partial<DiaryEntry>, options: EntrySaveOptions = {}): Promise<DiaryEntry | undefined> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (!entry) return undefined;
    if (!isEntryForCurrentUser(entry)) return undefined;
    if (patch.images !== undefined) {
      patch.images = filterValidImages(patch.images);
    }
    const contentChanged = patch.content !== undefined && patch.content !== entry.content;
    const imagesChanged = patch.images !== undefined && !areImagesEqual(patch.images, entry.images);
    if (options.saveHistory !== false && (contentChanged || imagesChanged)) {
      await saveLocalHistorySnapshot({
        entryId: entry.id,
        content: entry.content,
        images: entry.images,
        savedAt: entry.updatedAt,
      });
    }
    let updatedEntry = stampEntryUser({ ...entry, ...patch, updatedAt: new Date().toISOString() });
    await db.put('entries', updatedEntry);
    updatedEntry = await syncEntryToVault(updatedEntry);
    activeEntriesCache = null; 
    if (options.triggerSync !== false) {
      this.triggerSync({ immediate: options.immediateSync });
    }
    return updatedEntry;
  },

  async moveToTrash(id: string, reason: 'deleted' | 'abandoned'): Promise<void> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (entry && isEntryForCurrentUser(entry)) {
      const now = new Date().toISOString();
      entry.status = 'trashed'; 
      entry.trashReason = reason; 
      entry.trashedAt = now; 
      entry.updatedAt = now;
      await db.put('entries', entry); 
      await moveVaultEntryToTrash(entry);
      activeEntriesCache = null; 
      this.triggerSync();
    }
  },

  async moveEntriesToTrash(ids: Iterable<string>, reason: 'deleted' | 'abandoned'): Promise<number> {
    const idSet = new Set(ids);
    if (idSet.size === 0) return 0;

    const db = await initDB();
    const now = new Date().toISOString();
    const trashedEntries: DiaryEntry[] = [];
    const tx = db.transaction('entries', 'readwrite');

    for (const id of idSet) {
      const entry = await tx.store.get(id);
      if (!entry || !isEntryForCurrentUser(entry)) continue;

      const trashedEntry: DiaryEntry = {
        ...entry,
        status: 'trashed',
        trashReason: reason,
        trashedAt: now,
        updatedAt: now,
      };
      await tx.store.put(trashedEntry);
      trashedEntries.push(trashedEntry);
    }

    await tx.done;

    if (trashedEntries.length === 0) return 0;

    activeEntriesCache = null;
    emitDiarySyncEvent(true, { reason: 'bulk-trash', count: trashedEntries.length });
    this.triggerSync();

    await Promise.allSettled(trashedEntries.map(entry => moveVaultEntryToTrash(entry)));
    return trashedEntries.length;
  },

  async restoreEntry(id: string): Promise<void> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (entry && isEntryForCurrentUser(entry)) {
      entry.status = 'active'; 
      delete entry.trashReason; 
      delete entry.trashedAt; 
      entry.updatedAt = new Date().toISOString(); // Update timestamp to trigger push
      await db.put('entries', entry); 
      await restoreVaultEntry(entry);
      activeEntriesCache = null; 
      this.triggerSync();
    }
  },

  async permanentlyDeleteEntry(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/diary/entries/${id}/permanent`); } catch (e) { console.warn('后端永久删除失败:', e); } }
    await localVaultService.deleteEntryFiles(id).catch(error => console.warn('Delete local vault entry failed:', error));
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (!entry || isEntryForCurrentUser(entry)) await db.delete('entries', id);
  },

  async clearTrash(): Promise<void> {
    if (useApi()) { try { await api.post('/diary/trash/clear'); } catch (e) { console.warn('后端清空回收站失败:', e); } }
    const db = await initDB();
    const trashedEntries = (await db.getAllFromIndex('entries', 'by-status', 'trashed')).filter(entry => isEntryForCurrentUser(entry));
    await Promise.all(trashedEntries.map(entry => localVaultService.deleteEntryFiles(entry.id).catch(error => console.warn('Delete local vault trash entry failed:', error))));
    await Promise.all(trashedEntries.map(entry => db.delete('entries', entry.id)));
  },

  // 模板
  async getTemplates(): Promise<DiaryTemplate[]> {
    if (useApi()) { try { return await api.get<DiaryTemplate[]>('/templates'); } catch (e) { console.warn('后端获取模板失败:', e); } }
    const db = await initDB();
    const templates = await db.getAll('templates');
    return templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async saveTemplate(template: Omit<DiaryTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DiaryTemplate> {
    if (useApi()) { try { return await api.post<DiaryTemplate>('/templates', template); } catch (e) { console.warn('后端保存模板失败:', e); } }
    const db = await initDB(); const now = new Date().toISOString();
    let t: DiaryTemplate;
    if (template.id) { const ex = await db.get('templates', template.id); t = ex ? { ...ex, ...template, updatedAt: now } : { ...template, id: template.id, createdAt: now, updatedAt: now }; }
    else { t = { ...template, id: createClientId(), createdAt: now, updatedAt: now }; }
    await db.put('templates', t); return t;
  },

  async deleteTemplate(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/templates/${id}`); } catch (e) { console.warn('后端删除模板失败:', e); } }
    const db = await initDB(); await db.delete('templates', id);
  },

  // 编辑历史
  async getHistoryForEntry(entryId: string): Promise<EditHistory[]> {
    const db = await initDB();
    const localHistory = await db.getAllFromIndex('history', 'by-entry', entryId);
    if (useApi()) {
      try {
        const remoteHistory = await withTimeout(api.get<EditHistory[]>(`/history/${entryId}`));
        await Promise.all(remoteHistory.map(history => db.put('history', { ...history, images: filterValidImages(history.images) })));
        return mergeHistoryLists(localHistory, remoteHistory);
      } catch (e) {
        console.warn('Failed to load remote edit history:', e);
      }
    }
    return localHistory.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  },

  async saveHistory(history: Omit<EditHistory, 'id' | 'summary'>): Promise<void> {
    await saveLocalHistorySnapshot(history);
    if (useApi()) {
      try {
        await withTimeout(api.post('/history', history));
      } catch (e) {
        console.warn('Failed to save remote edit history:', e);
      }
    }
  },

  // 聊天会话
  async getChatSessions(): Promise<ChatSession[]> {
    const db = await initDB();
    const localSessions = await db.getAllFromIndex('chatSessions', 'by-updated');
    let sessions = localSessions;
    if (useApi()) {
      try {
        const remoteSessions = await api.get<ChatSession[]>('/chat/sessions');
        const merged = new Map<string, ChatSession>();
        for (const s of localSessions) merged.set(s.id, s);
        for (const s of remoteSessions) {
          const existing = merged.get(s.id);
          if (!existing || new Date(s.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            merged.set(s.id, s);
          }
          await db.put('chatSessions', merged.get(s.id)!);
        }
        sessions = Array.from(merged.values());
      } catch (e) {
        console.warn('后端获取会话失败:', e);
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const db = await initDB();
    const localSession = await db.get('chatSessions', id);
    if (useApi()) {
      try {
        const remoteSession = await api.get<ChatSession>(`/chat/sessions/${id}`);
        if (!localSession || new Date(remoteSession.updatedAt).getTime() >= new Date(localSession.updatedAt).getTime()) {
          await db.put('chatSessions', remoteSession);
          return remoteSession;
        }
      } catch (e) {
        console.warn('后端获取会话失败:', e);
      }
    }
    return localSession;
  },

  async saveChatSession(session: ChatSession): Promise<void> {
    if (useApi()) { try { await api.post('/chat/sessions', session); } catch (e) { console.warn('后端保存会话失败:', e); } }
    const db = await initDB(); await db.put('chatSessions', session);
  },

  async deleteChatSession(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/chat/sessions/${id}`); } catch (e) { console.warn('后端删除会话失败:', e); } }
    const db = await initDB(); await db.delete('chatSessions', id);
  },

  async syncEntriesFromVault(): Promise<{ successCount: number; updatedCount: number; trashedCount: number; failCount: number; skippedEmptyCount: number }> {
    const scan = await localVaultService.scanEntriesFromVault();
    const db = await initDB();
    const existingEntries = (await db.getAll('entries')).filter(entry => isEntryForCurrentUser(entry));
    const existingIds = new Set(existingEntries.map(entry => entry.id));
    const existingVaultPaths = new Set(existingEntries.map(entry => entry.vaultPath).filter(Boolean));
    let successCount = 0;
    let updatedCount = 0;
    let trashedCount = 0;
    let failCount = 0;

    for (const vaultEntry of scan.entries) {
      try {
        if (!vaultEntry.id && existingVaultPaths.has(vaultEntry.vaultPath)) {
          continue;
        }

        const id = vaultEntry.id || createClientId();
        const existing = existingIds.has(id) ? await db.get('entries', id) : undefined;
        const now = new Date().toISOString();
        const updatedAt = vaultEntry.updatedAt || now;
        const entry: DiaryEntry = stampEntryUser({
          ...(existing || {}),
          id,
          title: vaultEntry.title,
          content: vaultEntry.content,
          images: existing?.images || [],
          createdAt: existing?.createdAt || now,
          updatedAt,
          diaryDate: vaultEntry.diaryDate,
          status: 'active',
          vaultPath: vaultEntry.vaultPath,
        });
        await db.put('entries', entry);
        await syncEntryToVault(entry);
        if (existing) {
          updatedCount += 1;
        } else {
          successCount += 1;
          existingIds.add(id);
          existingVaultPaths.add(vaultEntry.vaultPath);
        }
      } catch (error) {
        console.warn('Restore local vault entry failed:', error);
        failCount += 1;
      }
    }

    activeEntriesCache = null;
    emitDiarySyncEvent(successCount + updatedCount + trashedCount > 0);
    this.triggerSync({ immediate: true });
    return {
      successCount,
      updatedCount,
      trashedCount,
      failCount,
      skippedEmptyCount: scan.skippedEmptyCount,
    };
  },

  async restoreEntriesFromVault(): Promise<{ successCount: number; failCount: number }> {
    const result = await this.syncEntriesFromVault();
    return {
      successCount: result.successCount + result.updatedCount,
      failCount: result.failCount,
    };
  },

  // 自定义字体（纯本地）
  async saveCustomFont(font: StoredFont): Promise<void> { const db = await initDB(); await db.put('customFonts', font); },
  async getCustomFonts(): Promise<StoredFont[]> { const db = await initDB(); return db.getAll('customFonts'); },
  async deleteCustomFont(id: string): Promise<void> { const db = await initDB(); await db.delete('customFonts', id); },
};

