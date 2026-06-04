import React from 'react';
import { DiaryEntry } from '../../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, Pin } from 'lucide-react';
import { stripAllMarkdown } from '../../lib/utils';
import { SafeImage } from '../SafeImage';

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

export function CardFlowList({ journals, isMultiSelectMode, selectedJournals, handlePointerDown, handlePointerMove, handlePointerUp }: ListProps) {
  return (
    <div className="flex flex-col gap-8">
      {journals.map((journal) => (
        <article 
          key={journal.id} 
          data-date={format(new Date(journal.diaryDate), 'yyyy-MM-dd')}
          className="relative group cursor-pointer select-none"
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          onPointerDown={(e) => handlePointerDown(e, journal)}
          onPointerMove={handlePointerMove}
          onPointerUp={() => handlePointerUp(journal)}
          onPointerCancel={handlePointerMove}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className={`bg-surface-container-lowest p-6 rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-500 ${isMultiSelectMode && selectedJournals.has(journal.id) ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04)]'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-medium">
                <time>
                  {format(new Date(journal.diaryDate), 'MM月dd日 EEEE', { locale: zhCN })}
                </time>
                {journal.isPinned && <Pin size={12} className="text-primary" />}
              </div>
              {isMultiSelectMode && (
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedJournals.has(journal.id) ? 'bg-primary border-primary' : 'border-outline'}`}>
                  {selectedJournals.has(journal.id) && <Check size={14} className="text-on-primary" />}
                </div>
              )}
            </div>

            {/*
            {journal.title && (
              <h3 className="font-headline text-xl font-bold text-on-surface mb-3 leading-tight tracking-tight">
                {journal.title}
              </h3>
            )}
            */}
            
            {(() => {
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
                <p className="text-[15px] font-light text-on-surface-variant leading-relaxed line-clamp-5 mb-4 whitespace-pre-wrap" style={{ fontFamily: 'var(--diary-font-family)' }}>
                  {summary}
                </p>
              );
            })()}
            
            {(() => {
              const validImages = (journal.images || []).filter(img => typeof img === 'string' && img.trim() !== '');
              if (validImages.length === 0) return null;
              return (
                <div className={`mt-4 grid gap-1.5 ${validImages.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {validImages.map((img, idx) => (
                    <div key={idx} className="aspect-square">
                      <SafeImage
                        src={img} 
                        alt="Journal attachment" 
                        className="w-full h-full rounded-[10px] object-cover transition-transform duration-700 hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </article>
      ))}
    </div>
  );
}
