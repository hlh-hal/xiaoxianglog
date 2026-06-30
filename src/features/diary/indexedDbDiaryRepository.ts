import type { IDBPDatabase } from 'idb';
import type { DiaryEntry, EntryStatus } from './model';

export interface DiaryEntryRepository {
  getAllByDate(): Promise<DiaryEntry[]>;
  getByStatus(status: EntryStatus): Promise<DiaryEntry[]>;
  getById(id: string): Promise<DiaryEntry | undefined>;
  put(entry: DiaryEntry): Promise<string>;
  delete(id: string): Promise<void>;
}

/**
 * IndexedDB 的窄适配器。数据库升级和跨 store 事务暂留兼容门面，普通日记
 * 读写不再让业务方法直接依赖 object store 名称。
 */
export function createIndexedDbDiaryRepository(
  getDatabase: () => Promise<IDBPDatabase<any>>,
): DiaryEntryRepository {
  return {
    async getAllByDate() {
      const db = await getDatabase();
      return db.getAllFromIndex('entries', 'by-date');
    },
    async getByStatus(status) {
      const db = await getDatabase();
      return db.getAllFromIndex('entries', 'by-status', status);
    },
    async getById(id) {
      const db = await getDatabase();
      return db.get('entries', id);
    },
    async put(entry) {
      const db = await getDatabase();
      return db.put('entries', entry);
    },
    async delete(id) {
      const db = await getDatabase();
      await db.delete('entries', id);
    },
  };
}
