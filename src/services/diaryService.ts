/**
 * 日记服务 - 前后端一体版
 * 策略：对于日记(Entries)，使用本地优先(Local-First) + syncWithServer 推拉同步
 * 对于其他数据(模板/聊天/历史)，使用在线优先+本地兜底
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { api, isAuthenticated } from './apiClient';

export type EntryStatus = 'active' | 'draft' | 'trashed';

export interface DiaryEntry {
  id: string;
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
  syncVersion?: number;
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

export const diaryService = {
  getCachedActiveEntries(): DiaryEntry[] | null {
    return activeEntriesCache;
  },

  async init(): Promise<void> {
    await initDB();
    await this.getActiveEntries();
    this.triggerSync();
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
    localStorage.removeItem('xiang_last_sync_time');
    localStorage.removeItem('xiang_last_push_time');
    localStorage.removeItem('xiang_welcome_created');
  },

  triggerSync() {
    if (!useApi()) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.syncWithServer().catch(console.error);
    }, 1000);
  },

  async syncWithServer(): Promise<void> {
    if (!useApi()) return;
    try {
      const db = await initDB();
      const lastSync = localStorage.getItem('xiang_last_sync_time') || '';
      
      // 1. Pull changes from server
      const url = lastSync ? `/sync/pull?since=${encodeURIComponent(lastSync)}` : '/sync/pull';
      const pullData = await api.get<{ entries: DiaryEntry[], serverTime: string }>(url);
      
      if (pullData.entries && pullData.entries.length > 0) {
        const tx = db.transaction('entries', 'readwrite');
        for (const entry of pullData.entries) {
          await tx.store.put(entry);
        }
        await tx.done;
        activeEntriesCache = null; // Invalidate cache
      }
      
      if (pullData.serverTime) {
        localStorage.setItem('xiang_last_sync_time', pullData.serverTime);
      }

      // 2. Push local changes
      const lastPush = localStorage.getItem('xiang_last_push_time') || '';
      const allLocal = await db.getAll('entries');
      const toPush = lastPush 
        ? allLocal.filter(e => {
            const upTime = new Date(e.updatedAt).getTime();
            const trTime = e.trashedAt ? new Date(e.trashedAt).getTime() : 0;
            const pushTime = new Date(lastPush).getTime();
            return upTime > pushTime || trTime > pushTime;
          })
        : allLocal;

      if (toPush.length > 0) {
        const pushResult = await api.post<{ serverTime: string }>('/sync/push', { entries: toPush });
        if (pushResult.serverTime) {
          localStorage.setItem('xiang_last_push_time', pushResult.serverTime);
          localStorage.setItem('xiang_last_sync_time', pushResult.serverTime);
        }
      }
    } catch (err) {
      console.warn('Sync with server failed (offline or network error):', err);
    }
  },

  async getAllEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    return db.getAllFromIndex('entries', 'by-date');
  },

  async getActiveEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'active');
    const result = entries.filter((e: DiaryEntry) => !e.isHidden).sort((a: DiaryEntry, b: DiaryEntry) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.diaryDate).getTime() - new Date(a.diaryDate).getTime();
    });
    activeEntriesCache = result;
    return result;
  },

  async getDraftEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'draft');
    return entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getTrashEntries(): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'trashed');
    return entries.sort((a, b) => new Date(b.trashedAt || b.updatedAt).getTime() - new Date(a.trashedAt || a.updatedAt).getTime());
  },

  async searchEntries(keyword: string): Promise<DiaryEntry[]> {
    const db = await initDB();
    const entries = await db.getAllFromIndex('entries', 'by-status', 'active');
    const lk = keyword.toLowerCase();
    return entries.filter((e: DiaryEntry) => !e.isHidden && ((e.title && e.title.toLowerCase().includes(lk)) || (e.content && e.content.toLowerCase().includes(lk)) || (e.blocks && e.blocks.some((b: any) => (b.title && b.title.toLowerCase().includes(lk)) || (b.content && b.content.toLowerCase().includes(lk)))))).sort((a: DiaryEntry, b: DiaryEntry) => new Date(b.diaryDate).getTime() - new Date(a.diaryDate).getTime());
  },

  async getEntryById(id: string): Promise<DiaryEntry | undefined> {
    const db = await initDB();
    return db.get('entries', id);
  },

  async createEntry(data: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { id?: string; status?: EntryStatus; createdAt?: string; updatedAt?: string }): Promise<DiaryEntry> {
    const now = new Date().toISOString();
    const entry: DiaryEntry = { ...data, id: data.id || crypto.randomUUID(), createdAt: data.createdAt || now, updatedAt: data.updatedAt || now, status: data.status || 'active' };
    const db = await initDB(); 
    await db.put('entries', entry);
    activeEntriesCache = null; 
    this.triggerSync();
    return entry;
  },

  async updateEntry(id: string, patch: Partial<DiaryEntry>): Promise<DiaryEntry | undefined> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (!entry) return undefined;
    const updatedEntry = { ...entry, ...patch, updatedAt: new Date().toISOString() };
    await db.put('entries', updatedEntry);
    activeEntriesCache = null; 
    this.triggerSync();
    return updatedEntry;
  },

  async moveToTrash(id: string, reason: 'deleted' | 'abandoned'): Promise<void> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (entry) { 
      entry.status = 'trashed'; 
      entry.trashReason = reason; 
      entry.trashedAt = new Date().toISOString(); 
      await db.put('entries', entry); 
      activeEntriesCache = null; 
      this.triggerSync();
    }
  },

  async restoreEntry(id: string): Promise<void> {
    const db = await initDB();
    const entry = await db.get('entries', id);
    if (entry) { 
      entry.status = 'active'; 
      delete entry.trashReason; 
      delete entry.trashedAt; 
      entry.updatedAt = new Date().toISOString(); // Update timestamp to trigger push
      await db.put('entries', entry); 
      activeEntriesCache = null; 
      this.triggerSync();
    }
  },

  async permanentlyDeleteEntry(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/diary/entries/${id}/permanent`); } catch (e) { console.warn('后端永久删除失败:', e); } }
    const db = await initDB(); await db.delete('entries', id);
  },

  async clearTrash(): Promise<void> {
    if (useApi()) { try { await api.post('/diary/trash/clear'); } catch (e) { console.warn('后端清空回收站失败:', e); } }
    const db = await initDB();
    const tx = db.transaction('entries', 'readwrite');
    const index = tx.store.index('by-status');
    let cursor = await index.openCursor('trashed');
    while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
    await tx.done;
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
    else { t = { ...template, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; }
    await db.put('templates', t); return t;
  },

  async deleteTemplate(id: string): Promise<void> {
    if (useApi()) { try { await api.delete(`/templates/${id}`); } catch (e) { console.warn('后端删除模板失败:', e); } }
    const db = await initDB(); await db.delete('templates', id);
  },

  // 编辑历史
  async getHistoryForEntry(entryId: string): Promise<EditHistory[]> {
    if (useApi()) { try { return await withTimeout(api.get<EditHistory[]>(`/history/${entryId}`)); } catch (e) { console.warn('后端获取历史失败:', e); } }
    const db = await initDB();
    const history = await db.getAllFromIndex('history', 'by-entry', entryId);
    return history.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  },

  async saveHistory(history: Omit<EditHistory, 'id' | 'summary'>): Promise<void> {
    if (useApi()) { try { await withTimeout(api.post('/history', history)); return; } catch (e) { console.warn('后端保存历史失败:', e); } }
    const db = await initDB();
    const c = history.content || '';
    const newH: EditHistory = { ...history, id: crypto.randomUUID(), summary: c.substring(0, 50) + (c.length > 50 ? '...' : '') };
    await db.put('history', newH);
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

  // 自定义字体（纯本地）
  async saveCustomFont(font: StoredFont): Promise<void> { const db = await initDB(); await db.put('customFonts', font); },
  async getCustomFonts(): Promise<StoredFont[]> { const db = await initDB(); return db.getAll('customFonts'); },
  async deleteCustomFont(id: string): Promise<void> { const db = await initDB(); await db.delete('customFonts', id); },
};
