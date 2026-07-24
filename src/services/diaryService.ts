/**
 * 日记服务 - 前后端一体版
 * 策略：对于日记(Entries)，使用本地优先(Local-First) + syncWithServer 推拉同步
 * 对于其他数据(模板/聊天/历史)，使用在线优先+本地兜底
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { api, isAuthenticated, uploadImages } from './apiClient';
import { localVaultService, VaultSyncResult } from './localVaultService';
import { createClientId } from '../utils/id';
import { compareDiaryDateDesc, compareDiaryEntryDesc, getDiaryDateKey } from '../utils/diaryDate';
import type { AnnualEchoDigest } from '../utils/annualEcho';
import type {
  ChatSession,
  DailyEcho,
  DiaryEntry,
  DiaryEntryCreateInput,
  DiaryEntrySaveOptions,
  DiaryTemplate,
  EditHistory,
  EntryStatus,
  StoredFont,
} from '../features/diary/model';
import { toDiarySyncEntryDto, type DiarySyncEntryDto } from '../features/diary/syncContract';
import {
  DiaryPostCommitCoordinator,
  type DiaryChangeKind,
  type DiaryPostCommitEffect,
} from '../features/diary/postCommitCoordinator';
import { createIndexedDbDiaryRepository } from '../features/diary/indexedDbDiaryRepository';
import {
  readAllWritingTimeCheckpoints,
  removeStoredWritingTimeCheckpoint,
} from '../features/editor/writingTimeTracker';

export type {
  ChatMessage,
  ChatSession,
  DailyEcho,
  DailyEchoStatus,
  DiaryEntry,
  DiaryEntryCreateInput,
  DiaryEntrySaveOptions,
  DiaryEntryWriter,
  DiaryTemplate,
  EditHistory,
  EntryStatus,
  StoredFont,
} from '../features/diary/model';

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

export interface InsightDraft {
  identity: {
    selfPerception: string;
    coreValues: string[];
    lifeStage: string;
  };
  patterns: {
    recurringThemes: string[];
    emotionalPattern: string;
    copingStyle: string;
  };
  recentContext: {
    lastInsight: string;
    ongoingStruggle: string;
    recentGrowth: string;
  };
  meta: {
    version: number;
    lastUpdated: Date;
    diaryCount: number;
    confidence: number;
  };
}

export type EchoMemoryEntrySource = 'user_explicit' | 'user_implicit' | 'ai_inferred';
export type EchoMemoryEntryStatus = 'active' | 'fading' | 'archived';
export type EchoMemoryEntryKind =
  | 'detail'
  | 'theme'
  | 'unfinished_question'
  | 'growth_shift'
  | 'tone_preference'
  | 'boundary'
  | 'sensitive_context';
export type EchoMemoryEntryVisibility = 'direct' | 'tone_only' | 'never_echo';
export type EchoMemoryEntrySensitivity = 'low' | 'medium' | 'high';
export type EchoMemoryEntryFeedback = 'accepted' | 'rejected' | 'suppressed' | 'unreviewed';

export interface EchoMemoryEntry {
  id: string;
  content: string;
  source: EchoMemoryEntrySource;
  sourceDiaryIds: string[];
  createdAt: string;
  lastReinforcedAt: string;
  reinforceCount: number;
  status: EchoMemoryEntryStatus;
  kind: EchoMemoryEntryKind;
  visibility: EchoMemoryEntryVisibility;
  sensitivity: EchoMemoryEntrySensitivity;
  expiresAt?: string;
  lastUsedInPromptAt?: string;
  userFeedback: EchoMemoryEntryFeedback;
  counterEvidenceDiaryIds: string[];
}

export interface EchoHotMemory {
  version: number;
  seed: string;
  entries: EchoMemoryEntry[];
  updatedAt: string;
}

export interface EchoMemorySnapshot {
  id: string;
  hotMemory: EchoHotMemory;
  insightDraft?: InsightDraft | null;
  createdAt: string;
  trigger: 'diary_save' | 'manual' | 'migration';
}

export type InsightDraftInput = Partial<{
  identity: Partial<InsightDraft['identity']>;
  patterns: Partial<InsightDraft['patterns']>;
  recentContext: Partial<InsightDraft['recentContext']>;
  meta: Partial<Omit<InsightDraft['meta'], 'lastUpdated'> & { lastUpdated: Date | string }>;
}>;

interface StoredInsightDraft extends Omit<InsightDraft, 'meta'> {
  id: string;
  meta: Omit<InsightDraft['meta'], 'lastUpdated'> & { lastUpdated: Date | string };
}

interface StoredEchoHotMemory extends EchoHotMemory {
  id: string;
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
  insightDrafts: {
    key: string;
    value: StoredInsightDraft;
  };
  echoHotMemories: {
    key: string;
    value: StoredEchoHotMemory;
  };
  echoMemorySnapshots: {
    key: string;
    value: EchoMemorySnapshot;
    indexes: { 'by-created': string };
  };
  annualEchoDigests: {
    key: string;
    value: AnnualEchoDigest;
  };
}

let dbPromise: Promise<IDBPDatabase<DiaryDB>> | null = null;

const INSIGHT_DRAFT_ID = 'daily-echo';
export const ECHO_HOT_MEMORY_CONTEXT_LIMIT = 2200;
export const ECHO_HOT_MEMORY_MAX_ENTRIES = 10;
export const ECHO_HOT_MEMORY_SEED_MAX_LENGTH = 30;
export const ECHO_HOT_MEMORY_ENTRY_MAX_LENGTH = 150;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeInsightString(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function normalizeInsightStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizeInsightString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function sliceChars(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join('');
}

function normalizeInsightDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(fallback.getTime());
}

export function createEmptyInsightDraft(lastUpdated = new Date()): InsightDraft {
  return {
    identity: {
      selfPerception: '',
      coreValues: [],
      lifeStage: '',
    },
    patterns: {
      recurringThemes: [],
      emotionalPattern: '',
      copingStyle: '',
    },
    recentContext: {
      lastInsight: '',
      ongoingStruggle: '',
      recentGrowth: '',
    },
    meta: {
      version: 0,
      lastUpdated: new Date(lastUpdated.getTime()),
      diaryCount: 0,
      confidence: 0.3,
    },
  };
}

export function getEchoHotMemoryStorageId(userId: string | null = getCurrentUserId()): string {
  return `daily-echo:${userId || 'anonymous'}`;
}

function normalizeEchoMemoryIsoDate(value: unknown, fallback: Date): string {
  return normalizeInsightDate(value, fallback).toISOString();
}

function normalizeEchoMemorySource(value: unknown): EchoMemoryEntrySource {
  return value === 'user_explicit' || value === 'user_implicit' || value === 'ai_inferred'
    ? value
    : 'ai_inferred';
}

function normalizeEchoMemoryStatus(value: unknown): EchoMemoryEntryStatus {
  return value === 'active' || value === 'fading' || value === 'archived'
    ? value
    : 'active';
}

function normalizeEchoMemoryKind(value: unknown): EchoMemoryEntryKind {
  return value === 'detail'
    || value === 'theme'
    || value === 'unfinished_question'
    || value === 'growth_shift'
    || value === 'tone_preference'
    || value === 'boundary'
    || value === 'sensitive_context'
    ? value
    : 'theme';
}

function normalizeEchoMemoryVisibility(value: unknown): EchoMemoryEntryVisibility {
  return value === 'direct' || value === 'tone_only' || value === 'never_echo'
    ? value
    : 'direct';
}

function normalizeEchoMemorySensitivity(value: unknown): EchoMemoryEntrySensitivity {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : 'low';
}

function normalizeEchoMemoryFeedback(value: unknown): EchoMemoryEntryFeedback {
  return value === 'accepted' || value === 'rejected' || value === 'suppressed' || value === 'unreviewed'
    ? value
    : 'unreviewed';
}

function normalizeEchoMemoryStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim())))
    .slice(0, limit);
}

function normalizeOptionalEchoMemoryIsoDate(value: unknown, fallbackDate: Date): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeEchoMemoryIsoDate(value, fallbackDate);
}

export function createEmptyEchoHotMemory(now = new Date()): EchoHotMemory {
  return {
    version: 0,
    seed: '',
    entries: [],
    updatedAt: now.toISOString(),
  };
}

export function normalizeEchoMemoryEntry(
  value: Partial<EchoMemoryEntry> | null | undefined,
  fallbackDate = new Date(),
): EchoMemoryEntry | null {
  const content = sliceChars(typeof value?.content === 'string' ? value.content.trim() : '', ECHO_HOT_MEMORY_ENTRY_MAX_LENGTH);
  if (!content) return null;
  const id = typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : createClientId();
  const sourceDiaryIds = normalizeEchoMemoryStringArray(value?.sourceDiaryIds, 12);
  const counterEvidenceDiaryIds = normalizeEchoMemoryStringArray(value?.counterEvidenceDiaryIds, 12);
  const sensitivity = normalizeEchoMemorySensitivity(value?.sensitivity);

  return {
    id,
    content,
    source: normalizeEchoMemorySource(value?.source),
    sourceDiaryIds,
    createdAt: normalizeEchoMemoryIsoDate(value?.createdAt, fallbackDate),
    lastReinforcedAt: normalizeEchoMemoryIsoDate(value?.lastReinforcedAt, fallbackDate),
    reinforceCount: Math.max(0, Math.floor(clampNumber(value?.reinforceCount, 0, Number.MAX_SAFE_INTEGER, 0))),
    status: normalizeEchoMemoryStatus(value?.status),
    kind: normalizeEchoMemoryKind(value?.kind),
    visibility: sensitivity === 'high' ? 'never_echo' : normalizeEchoMemoryVisibility(value?.visibility),
    sensitivity,
    expiresAt: normalizeOptionalEchoMemoryIsoDate(value?.expiresAt, fallbackDate),
    lastUsedInPromptAt: normalizeOptionalEchoMemoryIsoDate(value?.lastUsedInPromptAt, fallbackDate),
    userFeedback: normalizeEchoMemoryFeedback(value?.userFeedback),
    counterEvidenceDiaryIds,
  };
}

export function normalizeEchoHotMemoryForStorage(value?: Partial<EchoHotMemory> | null, fallbackDate = new Date()): EchoHotMemory {
  const fallback = createEmptyEchoHotMemory(fallbackDate);
  const source = value || {};
  const seenIds = new Set<string>();
  const entries = (Array.isArray(source.entries) ? source.entries : [])
    .map(entry => normalizeEchoMemoryEntry(entry, fallbackDate))
    .filter((entry): entry is EchoMemoryEntry => Boolean(entry))
    .filter((entry) => {
      if (seenIds.has(entry.id)) return false;
      seenIds.add(entry.id);
      return true;
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0;
      return new Date(b.lastReinforcedAt).getTime() - new Date(a.lastReinforcedAt).getTime();
    })
    .slice(0, ECHO_HOT_MEMORY_MAX_ENTRIES);

  return {
    version: Math.max(0, Math.floor(clampNumber(source.version, 0, Number.MAX_SAFE_INTEGER, fallback.version))),
    seed: sliceChars(typeof source.seed === 'string' ? source.seed.trim() : '', ECHO_HOT_MEMORY_SEED_MAX_LENGTH),
    entries,
    updatedAt: normalizeEchoMemoryIsoDate(source.updatedAt, fallbackDate),
  };
}

export function isEmptyEchoHotMemory(value?: Partial<EchoHotMemory> | null): boolean {
  const memory = normalizeEchoHotMemoryForStorage(value);
  return !memory.seed && memory.entries.length === 0;
}

export function normalizeInsightDraftForStorage(value?: InsightDraftInput | null, fallbackDate = new Date()): InsightDraft {
  const fallback = createEmptyInsightDraft(fallbackDate);
  const source = value || {};

  return {
    identity: {
      selfPerception: normalizeInsightString(source.identity?.selfPerception),
      coreValues: normalizeInsightStringArray(source.identity?.coreValues, 3),
      lifeStage: normalizeInsightString(source.identity?.lifeStage),
    },
    patterns: {
      recurringThemes: normalizeInsightStringArray(source.patterns?.recurringThemes, 8),
      emotionalPattern: normalizeInsightString(source.patterns?.emotionalPattern),
      copingStyle: normalizeInsightString(source.patterns?.copingStyle),
    },
    recentContext: {
      lastInsight: normalizeInsightString(source.recentContext?.lastInsight),
      ongoingStruggle: normalizeInsightString(source.recentContext?.ongoingStruggle),
      recentGrowth: normalizeInsightString(source.recentContext?.recentGrowth),
    },
    meta: {
      version: Math.max(0, Math.floor(clampNumber(source.meta?.version, 0, Number.MAX_SAFE_INTEGER, fallback.meta.version))),
      lastUpdated: normalizeInsightDate(source.meta?.lastUpdated, fallback.meta.lastUpdated),
      diaryCount: Math.max(0, Math.floor(clampNumber(source.meta?.diaryCount, 0, Number.MAX_SAFE_INTEGER, fallback.meta.diaryCount))),
      confidence: Number(clampNumber(source.meta?.confidence, 0, 1, fallback.meta.confidence).toFixed(3)),
    },
  };
}

export function isEmptyInsightDraft(value?: InsightDraftInput | null): boolean {
  if (!value) return true;
  const draft = normalizeInsightDraftForStorage(value);
  return !draft.identity.selfPerception
    && draft.identity.coreValues.length === 0
    && !draft.identity.lifeStage
    && draft.patterns.recurringThemes.length === 0
    && !draft.patterns.emotionalPattern
    && !draft.patterns.copingStyle
    && !draft.recentContext.lastInsight
    && !draft.recentContext.ongoingStruggle
    && !draft.recentContext.recentGrowth;
}

function toStoredInsightDraft(draft: InsightDraftInput): StoredInsightDraft {
  const normalized = normalizeInsightDraftForStorage(draft);
  return {
    id: INSIGHT_DRAFT_ID,
    identity: normalized.identity,
    patterns: normalized.patterns,
    recentContext: normalized.recentContext,
    meta: {
      ...normalized.meta,
      lastUpdated: normalized.meta.lastUpdated.toISOString(),
    },
  };
}

function toStoredEchoHotMemory(memory: Partial<EchoHotMemory>, userId: string | null = getCurrentUserId()): StoredEchoHotMemory {
  const normalized = normalizeEchoHotMemoryForStorage(memory);
  return {
    id: getEchoHotMemoryStorageId(userId),
    ...normalized,
  };
}

export function normalizeEchoMemorySnapshot(snapshot: EchoMemorySnapshot): EchoMemorySnapshot {
  const now = new Date();
  return {
    id: snapshot.id || `echo-memory-snapshot-${Date.now()}`,
    hotMemory: normalizeEchoHotMemoryForStorage(snapshot.hotMemory, now),
    insightDraft: snapshot.insightDraft ? normalizeInsightDraftForStorage(snapshot.insightDraft, now) : null,
    createdAt: normalizeEchoMemoryIsoDate(snapshot.createdAt, now),
    trigger: snapshot.trigger === 'manual' || snapshot.trigger === 'migration' ? snapshot.trigger : 'diary_save',
  };
}

export async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<DiaryDB>('ethos-diary-db', 7, {
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
        if (!db.objectStoreNames.contains('insightDrafts')) {
          db.createObjectStore('insightDrafts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('echoHotMemories')) {
          db.createObjectStore('echoHotMemories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('echoMemorySnapshots')) {
          const snapshotStore = db.createObjectStore('echoMemorySnapshots', { keyPath: 'id' });
          snapshotStore.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('annualEchoDigests')) {
          db.createObjectStore('annualEchoDigests', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

const entryRepository = createIndexedDbDiaryRepository(initDB);

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
const diaryPostCommitCoordinator = new DiaryPostCommitCoordinator();

export const DIARY_SYNC_EVENT = 'xiang-diary-sync-complete';

type SyncOptions = {
  forceFullPull?: boolean;
  pushAll?: boolean;
  immediate?: boolean;
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

async function recoverWritingTimeCheckpoints(): Promise<number> {
  const checkpoints = readAllWritingTimeCheckpoints();
  if (checkpoints.length === 0) return 0;

  const currentUserId = getCurrentUserId();
  let recoveredCount = 0;

  for (const { storageKey, checkpoint } of checkpoints) {
    // 其他账号的检查点留给对应账号恢复；anonymous 检查点可归入当前未标记账号的本地日记。
    if (checkpoint.ownerId && checkpoint.ownerId !== currentUserId) continue;

    try {
      const entry = await entryRepository.getById(checkpoint.entryId);
      if (!entry) {
        removeStoredWritingTimeCheckpoint(storageKey);
        continue;
      }
      if (!isEntryForCurrentUser(entry, currentUserId)) continue;

      const recoveredSeconds = checkpoint.totalElapsedMs > 0
        ? Math.max(1, Math.ceil(checkpoint.totalElapsedMs / 1_000))
        : 0;
      if (recoveredSeconds <= (entry.activeWritingSeconds || 0)) {
        removeStoredWritingTimeCheckpoint(storageKey);
        continue;
      }

      await entryRepository.put(stampEntryUser({
        ...entry,
        activeWritingSeconds: recoveredSeconds,
        updatedAt: new Date().toISOString(),
      }, currentUserId));
      removeStoredWritingTimeCheckpoint(storageKey);
      recoveredCount += 1;
    } catch (error) {
      // 保留失败检查点，下次启动继续恢复，避免一次 IndexedDB 故障造成永久丢失。
      console.warn('Recover writing time checkpoint failed:', error);
    }
  }

  if (recoveredCount > 0) activeEntriesCache = null;
  return recoveredCount;
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

  const db = await initDB();
  const latestEntry = await db.get('entries', entry.id);
  if (!latestEntry) return entry;
  const syncedEntry: DiaryEntry = {
    ...latestEntry,
    vaultPath: result.vaultPath,
    vaultTrashPath: result.vaultTrashPath,
    attachmentPaths: result.attachmentPaths,
  };
  await db.put('entries', syncedEntry);
  activeEntriesCache = null;
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

async function mirrorEntryToVault(entry: DiaryEntry): Promise<void> {
  const result = await localVaultService.syncEntry(entry);
  await applyVaultSyncResult(entry, result);
}

async function mirrorEntryToVaultTrash(entry: DiaryEntry): Promise<void> {
  const result = await localVaultService.moveEntryToTrash(entry);
  await applyVaultSyncResult(entry, result);
}

async function mirrorEntryToVaultRestore(entry: DiaryEntry): Promise<void> {
  const result = await localVaultService.restoreEntry(entry);
  await applyVaultSyncResult(entry, result);
}

function scheduleEntryPostCommit(
  kind: DiaryChangeKind,
  entry: DiaryEntry,
  previousEntry: DiaryEntry | undefined,
  options: DiaryEntrySaveOptions,
  vaultEffect: (entry: DiaryEntry) => Promise<void> = mirrorEntryToVault,
): void {
  const effects: DiaryPostCommitEffect[] = [
    {
      name: 'local-vault',
      run: async () => vaultEffect(entry),
    },
  ];

  if (options.triggerSync !== false && useApi()) {
    effects.push({
      name: 'cloud-sync',
      run: async () => {
        if (options.immediateSync) {
          await diaryService.syncWithServer({ immediate: true });
          return;
        }
        diaryService.triggerSync();
      },
    });
  }

  diaryPostCommitCoordinator.schedule({ kind, entry, previousEntry }, effects);
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

export function buildSyncPushPayload(entries: DiaryEntry[]): { entries: DiarySyncEntryDto[] } {
  return { entries: entries.map(toDiarySyncEntryDto) };
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
  createEmptyInsightDraft,
  createEmptyEchoHotMemory,

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

  getPostCommitStatus() {
    return diaryPostCommitCoordinator.getStatus();
  },

  async flushPostCommitEffects() {
    return diaryPostCommitCoordinator.flush();
  },

  async init(): Promise<void> {
    await initDB();
    await recoverWritingTimeCheckpoints();
    await this.getActiveEntries();
    this.startAutoSync();
    this.triggerSync();
  },

  async getInsightDraft(): Promise<InsightDraft | undefined> {
    const db = await initDB();
    const stored = await db.get('insightDrafts', INSIGHT_DRAFT_ID);
    return stored ? normalizeInsightDraftForStorage(stored) : undefined;
  },

  async saveInsightDraft(draft: InsightDraftInput): Promise<InsightDraft> {
    const db = await initDB();
    const normalized = normalizeInsightDraftForStorage(draft);
    await db.put('insightDrafts', toStoredInsightDraft(normalized));
    return normalized;
  },

  async clearInsightDraft(): Promise<void> {
    const db = await initDB();
    await db.delete('insightDrafts', INSIGHT_DRAFT_ID);
  },

  async getEchoHotMemory(userId: string | null = getCurrentUserId()): Promise<EchoHotMemory | undefined> {
    const db = await initDB();
    const stored = await db.get('echoHotMemories', getEchoHotMemoryStorageId(userId));
    return stored ? normalizeEchoHotMemoryForStorage(stored) : undefined;
  },

  async saveEchoHotMemory(memory: Partial<EchoHotMemory>, userId: string | null = getCurrentUserId()): Promise<EchoHotMemory> {
    const db = await initDB();
    const stored = toStoredEchoHotMemory(memory, userId);
    await db.put('echoHotMemories', stored);
    return normalizeEchoHotMemoryForStorage(stored);
  },

  async clearEchoHotMemory(userId: string | null = getCurrentUserId()): Promise<void> {
    const db = await initDB();
    await db.delete('echoHotMemories', getEchoHotMemoryStorageId(userId));
  },

  async saveEchoMemorySnapshot(snapshot: EchoMemorySnapshot): Promise<EchoMemorySnapshot> {
    const db = await initDB();
    const normalized = normalizeEchoMemorySnapshot(snapshot);
    await db.put('echoMemorySnapshots', normalized);
    return normalized;
  },

  async getAnnualEchoDigest(year: number): Promise<AnnualEchoDigest | undefined> {
    const db = await initDB();
    return db.get('annualEchoDigests', `annual-echo:${year}`);
  },

  async saveAnnualEchoDigest(digest: AnnualEchoDigest): Promise<AnnualEchoDigest> {
    const db = await initDB();
    await db.put('annualEchoDigests', digest);
    return digest;
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
    const tx = db.transaction(['entries', 'templates', 'history', 'chatSessions', 'customFonts', 'insightDrafts', 'echoHotMemories', 'echoMemorySnapshots'], 'readwrite');
    await Promise.all([
      tx.objectStore('entries').clear(),
      tx.objectStore('templates').clear(),
      tx.objectStore('history').clear(),
      tx.objectStore('chatSessions').clear(),
      tx.objectStore('customFonts').clear(),
      tx.objectStore('insightDrafts').clear(),
      tx.objectStore('echoHotMemories').clear(),
      tx.objectStore('echoMemorySnapshots').clear(),
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
        toPush.push(prepared.entry);
      }

      let latestPushServerTime = '';
      let skippedPushCount = 0;
      for (let index = 0; index < toPush.length; index += SYNC_BATCH_SIZE) {
        const batch = toPush.slice(index, index + SYNC_BATCH_SIZE);
        let pushResult: { serverTime: string; results?: { id: string; status: string; reason?: string }[] };
        try {
          pushResult = await api.post<{ serverTime: string; results?: { id: string; status: string; reason?: string }[] }>('/sync/push', buildSyncPushPayload(batch));
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
    const entries = await entryRepository.getAllByDate();
    return entries.filter(entry => isEntryForCurrentUser(entry));
  },

  async getActiveEntries(): Promise<DiaryEntry[]> {
    const entries = await entryRepository.getByStatus('active');
    const result = entries.filter((e: DiaryEntry) => isEntryForCurrentUser(e) && !e.isHidden).sort((a: DiaryEntry, b: DiaryEntry) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return compareDiaryEntryDesc(a, b);
    });
    // 过滤掉 images 中的空字符串/无效值，防止首页渲染空图片容器
    result.forEach(e => { e.images = filterValidImages(e.images); });
    activeEntriesCache = result;
    return result;
  },

  async getDraftEntries(): Promise<DiaryEntry[]> {
    const entries = await entryRepository.getByStatus('draft');
    return entries.filter(entry => isEntryForCurrentUser(entry)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getTrashEntries(): Promise<DiaryEntry[]> {
    const entries = await entryRepository.getByStatus('trashed');
    return entries.filter(entry => isEntryForCurrentUser(entry)).sort((a, b) => new Date(b.trashedAt || b.updatedAt).getTime() - new Date(a.trashedAt || a.updatedAt).getTime());
  },

  async searchEntries(keyword: string): Promise<DiaryEntry[]> {
    const entries = await entryRepository.getByStatus('active');
    const lk = keyword.toLowerCase();
    return entries.filter((e: DiaryEntry) => isEntryForCurrentUser(e) && !e.isHidden && ((e.title && e.title.toLowerCase().includes(lk)) || (e.content && e.content.toLowerCase().includes(lk)) || (e.blocks && e.blocks.some((b: any) => (b.title && b.title.toLowerCase().includes(lk)) || (b.content && b.content.toLowerCase().includes(lk)))))).sort((a: DiaryEntry, b: DiaryEntry) => compareDiaryDateDesc(a.diaryDate, b.diaryDate));
  },

  async getEntryById(id: string): Promise<DiaryEntry | undefined> {
    const entry = await entryRepository.getById(id);
    if (entry && !isEntryForCurrentUser(entry)) return undefined;
    if (entry) entry.images = filterValidImages(entry.images);
    return entry;
  },

  async createEntry(data: DiaryEntryCreateInput, options: DiaryEntrySaveOptions = {}): Promise<DiaryEntry> {
    const now = new Date().toISOString();
    let entry: DiaryEntry = stampEntryUser({ ...data, images: filterValidImages(data.images), id: data.id || createClientId(), createdAt: data.createdAt || now, updatedAt: data.updatedAt || now, status: data.status || 'active' });
    await entryRepository.put(entry);
    if (options.saveHistory !== false) {
      await saveLocalHistorySnapshot({
        entryId: entry.id,
        content: entry.content,
        images: entry.images,
        savedAt: entry.updatedAt || now,
      });
    }
    activeEntriesCache = null;
    scheduleEntryPostCommit('created', entry, undefined, options);
    return entry;
  },

  async updateEntry(id: string, patch: Partial<DiaryEntry>, options: DiaryEntrySaveOptions = {}): Promise<DiaryEntry | undefined> {
    const entry = await entryRepository.getById(id);
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
    await entryRepository.put(updatedEntry);
    activeEntriesCache = null;
    scheduleEntryPostCommit('updated', updatedEntry, entry, options);
    return updatedEntry;
  },

  async moveToTrash(id: string, reason: 'deleted' | 'abandoned'): Promise<void> {
    const entry = await entryRepository.getById(id);
    if (entry && isEntryForCurrentUser(entry)) {
      const now = new Date().toISOString();
      entry.status = 'trashed'; 
      entry.trashReason = reason; 
      entry.trashedAt = now; 
      entry.updatedAt = now;
      await entryRepository.put(entry);
      activeEntriesCache = null;
      scheduleEntryPostCommit('trashed', entry, undefined, {}, mirrorEntryToVaultTrash);
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
    trashedEntries.forEach(entry => {
      scheduleEntryPostCommit('trashed', entry, undefined, { triggerSync: false }, mirrorEntryToVaultTrash);
    });
    return trashedEntries.length;
  },

  async restoreEntry(id: string): Promise<void> {
    const entry = await entryRepository.getById(id);
    if (entry && isEntryForCurrentUser(entry)) {
      entry.status = 'active'; 
      delete entry.trashReason; 
      delete entry.trashedAt; 
      entry.updatedAt = new Date().toISOString(); // Update timestamp to trigger push
      await entryRepository.put(entry);
      activeEntriesCache = null;
      scheduleEntryPostCommit('restored', entry, undefined, {}, mirrorEntryToVaultRestore);
    }
  },

  async permanentlyDeleteEntry(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/diary/entries/${id}/permanent`); } catch (e) { console.warn('后端永久删除失败:', e); } }
    await localVaultService.deleteEntryFiles(id).catch(error => console.warn('Delete local vault entry failed:', error));
    const entry = await entryRepository.getById(id);
    if (!entry || isEntryForCurrentUser(entry)) await entryRepository.delete(id);
  },

  async clearTrash(): Promise<void> {
    if (useApi()) { try { await api.post('/diary/trash/clear'); } catch (e) { console.warn('后端清空回收站失败:', e); } }
    const trashedEntries = (await entryRepository.getByStatus('trashed')).filter(entry => isEntryForCurrentUser(entry));
    await Promise.all(trashedEntries.map(entry => localVaultService.deleteEntryFiles(entry.id).catch(error => console.warn('Delete local vault trash entry failed:', error))));
    await Promise.all(trashedEntries.map(entry => entryRepository.delete(entry.id)));
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

