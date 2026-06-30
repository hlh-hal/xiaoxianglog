import React from 'react';
import type { DiaryEntry } from '../../features/diary/model';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, Pin } from 'lucide-react';
import { stripAllMarkdown } from '../../lib/utils';
import { SafeImage } from '../SafeImage';
import { parseDiaryDateKey } from '../../utils/diaryDate';

function excerpt(raw: string, max = 60): string {
  const plain = stripAllMarkdown(raw);
  return plain.length > max ? plain.slice(0, max) + '...' : plain;
}

interface ListProps {
  journals: DiaryEntry[];
  isMultiSelectMode: boolean;
  selectedJournals: Set<string>;
  handlePointerDown: (e: React.PointerEvent | React.TouchEvent, journal: DiaryEntry) => void;
  handlePointerMove: (e: React.PointerEvent | React.TouchEvent) => void;
  handlePointerUp: (journal: DiaryEntry) => void;
}

export function BriefingList({ journals, isMultiSelectMode, selectedJournals, handlePointerDown, handlePointerMove, handlePointerUp }: ListProps) {
  return (
    <div className="flex flex-col">
      {journals.map((journal, index) => {
        const date = parseDiaryDateKey(journal.diaryDate);
        const day = format(date, 'd');
        const monthDay = format(date, 'MM月dd日 EEEE', { locale: zhCN });
        
        const hasImage = journal.images && journal.images.length > 0;
        const maxLength = hasImage ? 40 : 80;
        let fullContent = '';
        if (journal.blocks && journal.blocks.length > 0) {
          fullContent = journal.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
        } else {
          fullContent = journal.content || '';
        }
        const summary = excerpt(fullContent, maxLength);

        return (
          <article 
            key={journal.id} 
            data-date={format(date, 'yyyy-MM-dd')}
            className={`relative group cursor-pointer select-none py-4 ${index !== journals.length - 1 ? 'border-b border-outline-variant/20' : ''} ${isMultiSelectMode && selectedJournals.has(journal.id) ? 'bg-primary/5' : 'hover:bg-surface-container-lowest/50'} transition-colors`}
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            onPointerDown={(e) => handlePointerDown(e, journal)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp(journal)}
            onPointerCancel={handlePointerMove}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="flex items-start gap-4 px-2">
              {isMultiSelectMode ? (
                <div className="pt-2">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedJournals.has(journal.id) ? 'bg-primary border-primary' : 'border-outline'}`}>
                    {selectedJournals.has(journal.id) && <Check size={14} className="text-on-primary" />}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center min-w-[40px]">
                  <span className="font-headline text-2xl font-bold text-on-surface">{day}</span>
                  <span className="text-[10px] text-outline uppercase">{format(date, 'E', { locale: zhCN })}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-headline text-base font-bold text-on-surface truncate">
                    {monthDay}
                  </h3>
                  {journal.isPinned && <Pin size={12} className="text-primary flex-shrink-0" />}
                </div>
                <p className="text-[15px] font-light text-on-surface-variant leading-relaxed line-clamp-5 whitespace-pre-wrap" style={{ fontFamily: 'var(--diary-font-family)' }}>
                  {summary}
                </p>
              </div>

              {(() => {
                const validImages = (journal.images || []).filter(img => typeof img === 'string' && img.trim() !== '');
                if (validImages.length === 0) return null;
                return (
                  <div className="w-[60px] h-[60px] rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                    <SafeImage
                      src={validImages[0]} 
                      alt="Thumbnail" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                );
              })()}
            </div>
          </article>
        );
      })}
    </div>
  );
}
