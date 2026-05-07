import React from 'react';
import { DiaryEntry } from '../../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, Pin } from 'lucide-react';
import { stripAllMarkdown } from '../../lib/utils';

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

export function TimelineList({ journals, isMultiSelectMode, selectedJournals, handlePointerDown, handlePointerMove, handlePointerUp }: ListProps) {
  return (
    <div className="relative">
      {/* Vertical Line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-primary/10 z-0"></div>

      {journals.map((journal) => (
        <article 
          key={journal.id} 
          data-date={format(new Date(journal.diaryDate), 'yyyy-MM-dd')}
          className="relative pl-10 group mb-8 cursor-pointer select-none"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          onPointerDown={(e) => handlePointerDown(e, journal)}
          onPointerMove={handlePointerMove}
          onPointerUp={() => handlePointerUp(journal)}
          onPointerCancel={handlePointerMove}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Timeline Dot or Checkbox */}
          <div className="absolute left-0 top-1.5 w-10 h-10 rounded-full bg-surface flex items-center justify-center z-10 transition-transform duration-300 group-hover:scale-110">
            {isMultiSelectMode ? (
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedJournals.has(journal.id) ? 'bg-primary border-primary' : 'border-outline'}`}>
                {selectedJournals.has(journal.id) && <Check size={14} className="text-on-primary" />}
              </div>
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary-container/30"></div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <header className="sticky top-16 left-0 w-full z-30 flex items-center justify-between py-2 bg-surface/80 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <time className="font-label text-xs font-semibold text-outline tracking-wider uppercase">
                  {format(new Date(journal.diaryDate), 'MM月dd日 · EEEE', { locale: zhCN })}
                </time>
                {journal.isPinned && <Pin size={12} className="text-primary" />}
              </div>
            </header>

            <div className={`bg-surface-container-lowest px-4 py-[14px] rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-500 ${isMultiSelectMode && selectedJournals.has(journal.id) ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04)]'}`}>
              {/* 
              {journal.title && (
                <h3 className="font-headline text-xl font-bold text-on-surface mb-3 leading-tight tracking-tight">
                  {journal.title}
                </h3>
              )}
              */}
              
              {(() => {
                const hasImage = journal.images && journal.images.length > 0;
                const maxLength = hasImage ? 60 : 150;
                let fullContent = '';
                if (journal.blocks && journal.blocks.length > 0) {
                  fullContent = journal.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
                } else {
                  fullContent = journal.content || '';
                }
                const summary = excerpt(fullContent, maxLength);

                return (
                  <p className="text-[15px] font-light text-on-surface-variant line-clamp-5 mb-4 whitespace-pre-wrap" style={{ fontFamily: 'var(--diary-font-family)', lineHeight: '1.7', letterSpacing: '0.01em' }}>
                    {summary}
                  </p>
                );
              })()}
              
              {journal.images && journal.images.length > 0 && (
                <div className={`mt-4 grid gap-2 ${
                  journal.images.length === 1 ? 'grid-cols-1' : 
                  journal.images.length === 2 ? 'grid-cols-2' :
                  journal.images.length === 4 ? 'grid-cols-2' : 'grid-cols-3'
                }`}>
                  {journal.images.map((img, idx) => (
                    <div key={idx} className={journal.images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}>
                      <img 
                        src={img} 
                        alt="Journal attachment" 
                        className={`w-full h-full object-cover transition-transform duration-700 ${journal.images.length === 1 ? 'rounded-2xl hover:scale-[1.02]' : 'rounded-[16px] hover:scale-105'} `} 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
