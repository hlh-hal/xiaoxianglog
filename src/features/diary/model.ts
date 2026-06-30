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

/**
 * 日记领域模型。Vault 路径和旧 blocks/backgroundId 字段属于本地兼容数据，
 * 是否进入云端由 diary sync contract 显式决定。
 */
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

export type DiaryEntryCreateInput = Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: EntryStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type DiaryEntrySaveOptions = {
  saveHistory?: boolean;
  triggerSync?: boolean;
  immediateSync?: boolean;
};

export interface DiaryEntryWriter {
  createEntry(data: DiaryEntryCreateInput, options?: DiaryEntrySaveOptions): Promise<DiaryEntry>;
  updateEntry(id: string, patch: Partial<DiaryEntry>, options?: DiaryEntrySaveOptions): Promise<DiaryEntry | undefined>;
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
