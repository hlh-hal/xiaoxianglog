import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { DIARY_SYNC_EVENT, diaryService, DiaryEntry } from '../services/diaryService';
import { format, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Trash2, Check, Pin } from 'lucide-react';
import { TimelineList } from '../components/diary-lists/TimelineList';
import { CardFlowList } from '../components/diary-lists/CardFlowList';
import { BriefingList } from '../components/diary-lists/BriefingList';
import { MagazineList } from '../components/diary-lists/MagazineList';

export type HomeOutletContext = {
  selectedDate: Date | null;
  listStyle: string;
  isDrawerOpen?: boolean;
};

type HomeViewProps = {
  context: HomeOutletContext;
  isBackdrop?: boolean;
};

export function HomeView({ context, isBackdrop = false }: HomeViewProps) {
  const [journals, setJournals] = useState<DiaryEntry[]>(() => diaryService.getCachedActiveEntries() || []);
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
  const selectedDate = context?.selectedDate || null;
  const listStyle = context?.listStyle || 'timeline';
  const isDrawerOpen = context?.isDrawerOpen || false;
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNavigateTime = useRef<number>(0);

  // Action Menu State
  const [actionMenuJournal, setActionMenuJournal] = useState<DiaryEntry | null>(null);
  
  // Multi-select State
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedJournals, setSelectedJournals] = useState<Set<string>>(new Set());

  const loadData = async () => {
    const data = await diaryService.getActiveEntries();
    setJournals(data);
  };

  useEffect(() => {
    if (!isDrawerOpen && !isBackdrop) {
      loadData();
    }
  }, [isDrawerOpen, isBackdrop]);

  useEffect(() => {
    if (isBackdrop) return;

    const reload = () => {
      if (!isDrawerOpen) {
        loadData();
      }
    };

    window.addEventListener(DIARY_SYNC_EVENT, reload);
    window.addEventListener('focus', reload);
    window.addEventListener('pageshow', reload);
    return () => {
      window.removeEventListener(DIARY_SYNC_EVENT, reload);
      window.removeEventListener('focus', reload);
      window.removeEventListener('pageshow', reload);
    };
  }, [isBackdrop, isDrawerOpen]);

  // Restore scroll position after data is loaded
  useLayoutEffect(() => {
    if (isBackdrop) return;
    if (isDrawerOpen) {
      if (sessionStorage.getItem('suppressHomeScrollRestoreOnce') === 'true') {
        sessionStorage.removeItem('suppressHomeScrollRestoreOnce');
        window.scrollTo({ top: 0, behavior: 'instant' });
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        });
        setHasRestoredScroll(true);
      }
      return;
    }

    if (journals.length > 0 && !hasRestoredScroll) {
      const saved = sessionStorage.getItem('timeline_scroll');
      if (saved) {
        window.scrollTo({ top: Number(saved), behavior: 'instant' });
      }
      setHasRestoredScroll(true);
    }
  }, [journals, hasRestoredScroll, isBackdrop, isDrawerOpen]);

  // Save scroll position when navigating away
  const handleNavigate = (path: string) => {
    if (isBackdrop) return;

    const now = Date.now();
    if (now - lastNavigateTime.current < 400) return;
    lastNavigateTime.current = now;

    sessionStorage.setItem('timeline_scroll', String(window.scrollY));
    navigate(path);
  };

  // Scroll to selected date
  useEffect(() => {
    if (isBackdrop || isDrawerOpen) return;

    if (selectedDate && journals.length > 0) {
      const targetDateStr = format(selectedDate, 'yyyy-MM-dd');
      let element = document.querySelector(`[data-date="${targetDateStr}"]`);
      
      if (!element) {
        // If exact date not found, find the closest previous date
        const closestJournal = journals.find(j => new Date(j.diaryDate).getTime() <= selectedDate.getTime());
        if (closestJournal) {
          element = document.querySelector(`[data-date="${format(new Date(closestJournal.diaryDate), 'yyyy-MM-dd')}"]`);
        } else {
          // If no previous date, scroll to the oldest available one (last in array)
          element = document.querySelector(`[data-date="${format(new Date(journals[journals.length - 1].diaryDate), 'yyyy-MM-dd')}"]`);
        }
      }

      if (element) {
        // Scroll with an offset for the top header
        const y = element.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
  }, [selectedDate, journals, isBackdrop, isDrawerOpen]);

  // Long Press Logic
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const isScrollingRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent, journal: DiaryEntry) => {
    isLongPressRef.current = false;
    isScrollingRef.current = false;
    if (isMultiSelectMode) return;
    
    // VERY IMPORTANT: Clear any existing timer. 
    // Touch and pointer events could both fire, duplicating the timeout.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    if ('touches' in e) {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      startPos.current = { x: (e as React.PointerEvent).clientX, y: (e as React.PointerEvent).clientY };
    }

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setActionMenuJournal(journal);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent | React.TouchEvent) => {
    if (e.type === 'touchcancel' || e.type === 'pointercancel') {
      isScrollingRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    let currentX, currentY;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
      } else {
        return;
      }
    } else {
      currentX = (e as React.PointerEvent).clientX;
      currentY = (e as React.PointerEvent).clientY;
    }
    
    const dx = Math.abs(currentX - startPos.current.x);
    const dy = Math.abs(currentY - startPos.current.y);
    
    // Distinguish between a tap/long-press and scrolling.
    if (dx > 10 || dy > 10) {
      isScrollingRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePointerUp = (journal: DiaryEntry) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // If user scrolled, do not trigger tap navigation
    if (isScrollingRef.current) {
      return;
    }

    if (!isLongPressRef.current) {
      if (isMultiSelectMode) {
        toggleSelection(journal.id);
      } else {
        handleNavigate(`/editor?id=${journal.id}`);
      }
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedJournals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    const allIds = journals.map(j => j.id);
    setSelectedJournals(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedJournals(new Set());
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  const isAllSelected = journals.length > 0 && selectedJournals.size === journals.length;

  // Action Handlers
  const handleCopy = (journal: DiaryEntry) => {
    let text = journal.title ? `${journal.title}\n` : '';
    if (journal.blocks && journal.blocks.length > 0) {
      text += journal.blocks.map(b => `${b.title}\n${b.content}`).join('\n\n');
    } else {
      text += journal.content;
    }
    navigator.clipboard.writeText(text);
    setActionMenuJournal(null);
  };

  const handleHide = async (journal: DiaryEntry) => {
    await diaryService.updateEntry(journal.id, { isHidden: true });
    loadData();
    setActionMenuJournal(null);
  };

  const handleMultiSelect = (journal: DiaryEntry) => {
    setIsMultiSelectMode(true);
    setSelectedJournals(new Set([journal.id]));
    setActionMenuJournal(null);
  };

  const handlePin = async (journal: DiaryEntry) => {
    await diaryService.updateEntry(journal.id, { isPinned: !journal.isPinned });
    loadData();
    setActionMenuJournal(null);
  };

  const handleTrash = async (journal: DiaryEntry) => {
    await diaryService.moveToTrash(journal.id, 'deleted');
    loadData();
    setActionMenuJournal(null);
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedJournals) {
      await diaryService.moveToTrash(id, 'deleted');
    }
    setIsMultiSelectMode(false);
    setSelectedJournals(new Set());
    loadData();
  };

  return (
    <div className="app-reading-container pt-3 pb-0">
      {/* Multi-select Top Bar */}
      {isMultiSelectMode && (
        <div className="app-main-fixed-header app-safe-header fixed top-0 bg-surface z-50 flex items-center justify-between px-4 md:px-6 shadow-sm animate-in slide-in-from-top">
          <button 
            onClick={() => {
              setIsMultiSelectMode(false);
              clearSelection();
            }} 
            className="text-on-surface-variant p-2 font-medium w-16 text-left"
          >
            取消
          </button>
          <span className="font-medium text-on-surface flex-1 text-center">已选择 {selectedJournals.size} 项</span>
          <div className="flex items-center justify-end w-auto gap-2">
            <button 
              onClick={toggleSelectAll}
              disabled={journals.length === 0}
              className="text-primary p-2 font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {isAllSelected ? '取消全选' : '全选'}
            </button>
            <button 
              onClick={handleDeleteSelected} 
              disabled={selectedJournals.size === 0}
              className="text-error p-2 flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
            >
              <Trash2 size={20} />
              删除
            </button>
          </div>
        </div>
      )}

      {listStyle === 'timeline' && (
        <TimelineList 
          journals={journals} 
          isMultiSelectMode={isMultiSelectMode} 
          selectedJournals={selectedJournals} 
          handlePointerDown={handlePointerDown} 
          handlePointerMove={handlePointerMove} 
          handlePointerUp={handlePointerUp} 
        />
      )}
      {listStyle === 'card_flow' && (
        <CardFlowList 
          journals={journals} 
          isMultiSelectMode={isMultiSelectMode} 
          selectedJournals={selectedJournals} 
          handlePointerDown={handlePointerDown} 
          handlePointerMove={handlePointerMove} 
          handlePointerUp={handlePointerUp} 
        />
      )}
      {listStyle === 'briefing' && (
        <BriefingList 
          journals={journals} 
          isMultiSelectMode={isMultiSelectMode} 
          selectedJournals={selectedJournals} 
          handlePointerDown={handlePointerDown} 
          handlePointerMove={handlePointerMove} 
          handlePointerUp={handlePointerUp} 
        />
      )}
      {listStyle === 'magazine' && (
        <MagazineList 
          journals={journals} 
          isMultiSelectMode={isMultiSelectMode} 
          selectedJournals={selectedJournals} 
          handlePointerDown={handlePointerDown} 
          handlePointerMove={handlePointerMove} 
          handlePointerUp={handlePointerUp} 
        />
      )}

      {journals.length === 0 && (
        <div className="text-center py-20 text-outline">
          <p>还没有记录，开始写下第一篇日记吧。</p>
        </div>
      )}

      {/* Action Menu Modal */}
      {actionMenuJournal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in" 
          onClick={() => setActionMenuJournal(null)}
        >
          <div 
            className="bg-surface w-64 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95" 
            onClick={e => e.stopPropagation()}
          >
            <button className="w-full text-left px-6 py-4 text-on-surface hover:bg-surface-variant transition-colors font-medium" onClick={() => handleCopy(actionMenuJournal)}>复制内容</button>
            <button className="w-full text-left px-6 py-4 text-on-surface hover:bg-surface-variant transition-colors font-medium" onClick={() => handleMultiSelect(actionMenuJournal)}>多选</button>
            <button className="w-full text-left px-6 py-4 text-on-surface hover:bg-surface-variant transition-colors font-medium" onClick={() => handlePin(actionMenuJournal)}>
              {actionMenuJournal.isPinned ? '取消置顶' : '置顶'}
            </button>
            <button className="w-full text-left px-6 py-4 text-error hover:bg-error/10 transition-colors font-medium" onClick={() => handleTrash(actionMenuJournal)}>移入回收站</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const context = useOutletContext<HomeOutletContext>();
  return <HomeView context={context} />;
}
