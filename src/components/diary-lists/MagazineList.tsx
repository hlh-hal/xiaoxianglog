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

export function MagazineList({ journals, isMultiSelectMode, selectedJournals, handlePointerDown, handlePointerMove, handlePointerUp }: ListProps) {
  return (
    <div className="flex flex-col gap-6">
      {journals.map((journal) => {
        const validImages = (journal.images || []).filter(img => typeof img === 'string' && img.trim() !== '');
        const hasImage = validImages.length > 0;
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
            data-date={format(parseDiaryDateKey(journal.diaryDate), 'yyyy-MM-dd')}
            className={`relative group cursor-pointer select-none rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-500 ${isMultiSelectMode && selectedJournals.has(journal.id) ? 'ring-2 ring-primary' : 'hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)]'}`}
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            onPointerDown={(e) => handlePointerDown(e, journal)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp(journal)}
            onPointerCancel={handlePointerMove}
            onContextMenu={(e) => e.preventDefault()}
          >
            {isMultiSelectMode && (
              <div className="absolute top-4 right-4 z-20">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedJournals.has(journal.id) ? 'bg-primary border-primary' : 'border-white/50 bg-black/20 backdrop-blur-sm'}`}>
                  {selectedJournals.has(journal.id) && <Check size={14} className="text-on-primary" />}
                </div>
              </div>
            )}

            {hasImage ? (
              <div className="relative aspect-[4/5] w-full bg-surface-container-high">
                <SafeImage
                  src={validImages[0]} 
                  alt="Cover" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                <div className="absolute bottom-0 left-0 w-full p-6 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="font-headline text-[22px] font-bold text-white leading-tight">
                      {format(parseDiaryDateKey(journal.diaryDate), 'MM月dd日', { locale: zhCN })}
                    </h3>
                    {journal.isPinned && <Pin size={16} className="text-white" />}
                  </div>
                  <p className="text-white/80 text-sm line-clamp-5 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'var(--diary-font-family)' }}>
                    {summary}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-8">
                <div className="flex items-center gap-3 mb-5">
                  <h3 className="font-headline text-[22px] font-bold text-on-surface leading-tight">
                    {format(parseDiaryDateKey(journal.diaryDate), 'MM月dd日', { locale: zhCN })}
                  </h3>
                  {journal.isPinned && <Pin size={16} className="text-primary" />}
                </div>
                <p className="text-[15px] font-light text-on-surface-variant leading-relaxed line-clamp-5 whitespace-pre-wrap" style={{ fontFamily: 'var(--diary-font-family)' }}>
                  {summary}
                </p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
