import type {
  DiaryEntry,
  DiaryEntrySaveOptions,
  DiaryEntryWriter,
} from '../diary/model';

export type PersistReason =
  | 'autosave'
  | 'manual'
  | 'back'
  | 'visibility'
  | 'pagehide'
  | 'freeze'
  | 'unmount'
  | 'abandon';

export type PersistCurrentEntryOptions = {
  reason: PersistReason;
  saveHistory?: boolean;
  updateState?: boolean;
  navigateToSaved?: boolean;
  markClean?: boolean;
};

export interface PersistDiaryDraftInput {
  writer: DiaryEntryWriter;
  existingEntry?: DiaryEntry;
  entryId: string;
  content: string;
  images: string[];
  diaryDate: string;
  createdAt: string;
  backgroundId?: string;
  themeId?: string | null;
  activeWritingSeconds: number;
  saveOptions: DiaryEntrySaveOptions;
}

export function makeEntrySignature(
  content: string,
  images: string[],
  backgroundId?: string,
  themeId?: string | null,
): string {
  return JSON.stringify({
    content,
    images,
    backgroundId: backgroundId || null,
    themeId: themeId || null,
  });
}

/** Editor 到日记写入端口的唯一命令入口。 */
export async function persistDiaryDraft(input: PersistDiaryDraftInput): Promise<DiaryEntry | undefined> {
  const patch = {
    content: input.content,
    images: input.images,
    backgroundId: input.backgroundId,
    themeId: input.themeId,
    activeWritingSeconds: input.activeWritingSeconds,
  };

  if (input.existingEntry) {
    return input.writer.updateEntry(input.existingEntry.id, patch, input.saveOptions);
  }

  return input.writer.createEntry({
    id: input.entryId,
    ...patch,
    diaryDate: input.diaryDate,
    createdAt: input.createdAt,
  }, input.saveOptions);
}
