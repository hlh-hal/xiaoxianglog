import { useEffect, type MutableRefObject } from 'react';
import type { DiaryEntry } from '../diary/model';
import type { PersistCurrentEntryOptions, PersistReason } from './diaryPersistence';

type PersistEntry = (options: PersistCurrentEntryOptions) => Promise<DiaryEntry | undefined>;

interface UseDiaryLifecycleAutosaveOptions {
  isEditing: boolean;
  previewHashActive: boolean;
  hasUnsavedChanges: MutableRefObject<boolean>;
  content: string;
  images: string[];
  backgroundId?: string;
  themeId?: string;
  persistEntry: PersistEntry;
}

/** 统一管理编辑器的防抖自动保存与页面生命周期 flush。 */
export function useDiaryLifecycleAutosave({
  isEditing,
  previewHashActive,
  hasUnsavedChanges,
  content,
  images,
  backgroundId,
  themeId,
  persistEntry,
}: UseDiaryLifecycleAutosaveOptions): void {
  useEffect(() => {
    if (!isEditing || previewHashActive || !hasUnsavedChanges.current) return;

    const timer = window.setTimeout(() => {
      void persistEntry({
        reason: 'autosave',
        navigateToSaved: true,
      }).catch(error => console.warn('Diary entry autosave failed:', error));
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [backgroundId, content, hasUnsavedChanges, images, isEditing, persistEntry, previewHashActive, themeId]);

  useEffect(() => {
    const flush = (reason: PersistReason) => {
      void persistEntry({
        reason,
        saveHistory: true,
        updateState: false,
        navigateToSaved: false,
        markClean: false,
      }).catch(error => console.warn(`Diary lifecycle save failed (${reason}):`, error));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush('visibility');
    };
    const handlePageHide = () => flush('pagehide');
    const handleFreeze = () => flush('freeze');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('freeze', handleFreeze);

    return () => {
      flush('unmount');
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('freeze', handleFreeze);
    };
  }, [persistEntry]);
}
