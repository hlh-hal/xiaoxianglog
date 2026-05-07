import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { extractImages } from '../utils/imageUtils';
import { getExcerpt } from '../utils/textUtils';
import { format, isValid } from 'date-fns';

const FOOTER_TEXTS = [
  '随 机 回 顾 时 光',
  '在 旧 日 子 里 漫 步',
  '时 光 不 会 消 失'
];

function getRelativeTime(dateStr: string | number | Date): string {
  try {
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return '未知时间';
    const diff = Date.now() - time;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return '今天';
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
  } catch (e) {
    return '未知时间';
  }
}

function getSafeDateStr(dateStr: string | number | Date): string {
  try {
    const date = new Date(dateStr);
    if (isValid(date)) {
      return format(date, 'yyyy / MM / dd');
    }
  } catch (e) {}
  return '未知日期';
}

function getTodayStr(): string {
  try {
    return format(new Date(), 'yyyy-MM-dd');
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

interface WanderEntry extends DiaryEntry {
  coverImage: string;
}

export default function Walk() {
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext<any>();
  const [entries, setEntries] = useState<WanderEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [footerText, setFooterText] = useState(FOOTER_TEXTS[0]);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const loadRandomEntries = async (excludeIds: string[] = []) => {
    try {
      const allEntries = await diaryService.getActiveEntries();
      
      const processedEntries: WanderEntry[] = allEntries.map(entry => {
        let fullContent = entry.content || '';
        if (entry.blocks && entry.blocks.length > 0) {
          fullContent = entry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
        }
        
        let urls: string[] = [];
        try {
          urls = extractImages(fullContent);
        } catch (e) {
          console.error("Error extracting images", e);
        }

        if (entry.images && entry.images.length > 0) {
          entry.images.forEach(imgUrl => {
            if (!urls.includes(imgUrl)) urls.push(imgUrl);
          });
        }
        
        return { ...entry, coverImage: urls.length > 0 ? urls[0] : '' };
      });

      if (processedEntries.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      let available = processedEntries;
      if (excludeIds.length > 0 && processedEntries.length > 7) {
        available = processedEntries.filter(e => !excludeIds.includes(e.id));
        if (available.length < 7) {
          available = processedEntries;
        }
      }

      const shuffled = [...available].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 7);
      
      setEntries(selected);
      setCurrentIndex(0);
      setFooterText(FOOTER_TEXTS[Math.floor(Math.random() * FOOTER_TEXTS.length)]);
      
      // Save for daily refresh
      try {
        localStorage.removeItem('walk_daily_entries');
        localStorage.setItem('walk_daily_ids', JSON.stringify(selected.map(e => e.id)));
        localStorage.setItem('walk_daily_date', getTodayStr());
        localStorage.setItem('walk_daily_index', "0");
      } catch (e) {
        console.error("Failed to save daily walk entries", e);
      }

      setLoading(false);
    } catch (e) {
      console.error("Failed to load entries for walk", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    const initWalk = async () => {
      try {
        const todayStr = getTodayStr();
        const savedDailyDate = localStorage.getItem('walk_daily_date');
        
        if (savedDailyDate === todayStr) {
          const savedDailyIdsStr = localStorage.getItem('walk_daily_ids');
          if (savedDailyIdsStr) {
            const savedDailyIds = JSON.parse(savedDailyIdsStr);
            if (Array.isArray(savedDailyIds) && savedDailyIds.length > 0) {
              const allEntries = await diaryService.getActiveEntries();
              const entryMap = new Map(allEntries.map(e => [e.id, e]));
              
              const selectedFromIds = savedDailyIds.map(id => entryMap.get(id)).filter(Boolean) as DiaryEntry[];
              
              if (selectedFromIds.length > 0) {
                const processed = selectedFromIds.map(entry => {
                  let fullContent = entry.content || '';
                  if (entry.blocks && entry.blocks.length > 0) {
                    fullContent = entry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
                  }
                  let urls: string[] = [];
                  try { urls = extractImages(fullContent); } catch (e) {}
                  if (entry.images && entry.images.length > 0) {
                    entry.images.forEach(imgUrl => {
                      if (!urls.includes(imgUrl)) urls.push(imgUrl);
                    });
                  }
                  return { ...entry, coverImage: urls.length > 0 ? urls[0] : '' };
                });
                
                setEntries(processed);
                
                const savedIndex = localStorage.getItem('walk_daily_index');
                const parsedIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
                setCurrentIndex(isNaN(parsedIndex) ? 0 : parsedIndex);
                
                setFooterText(FOOTER_TEXTS[Math.floor(Math.random() * FOOTER_TEXTS.length)]);
                setLoading(false);
                return;
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to load daily walk entries", e);
      }

      // Otherwise generate new entries
      loadRandomEntries();
    };

    initWalk();
  }, []);

  const handleRefresh = () => {
    if (entries.length === 0) return;
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
    loadRandomEntries(entries.map(e => e.id));
  };

  const goNext = () => {
    if (currentIndex < entries.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      try { localStorage.setItem('walk_daily_index', newIndex.toString()); } catch (e) {}
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      try { localStorage.setItem('walk_daily_index', newIndex.toString()); } catch (e) {}
    }
  };

  const pointerStartX = useRef<number | null>(null);
  const isSwiping = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartX.current = e.clientX;
    isSwiping.current = false;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStartX.current !== null) {
      if (Math.abs(e.clientX - pointerStartX.current) > 10) {
        isSwiping.current = true;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStartX.current === null) return;
    const deltaX = e.clientX - pointerStartX.current;

    if (deltaX < -50) {
      goNext();
    } else if (deltaX > 50) {
      goPrev();
    }
    
    pointerStartX.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    
    setTimeout(() => {
      isSwiping.current = false;
    }, 50);
  };

  const handleCardClick = (entry: WanderEntry, index: number) => {
    if (isSwiping.current) return;
    
    if (index === currentIndex) {
      navigate(`/editor?id=${entry.id}`);
    } else {
      setCurrentIndex(index);
      try { localStorage.setItem('walk_daily_index', index.toString()); } catch (e) {}
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-surface" />;
  }

  if (entries.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex flex-col font-sans">
        <header className="w-full z-50 flex items-center justify-between px-4 h-16 shrink-0 relative">
          <button 
            onClick={() => {
              if (location.state?.fromDrawer) {
                sessionStorage.setItem('openDrawerOnNextMount', 'true');
                navigate(-1);
              } else {
                navigate(-1);
              }
            }}
            className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors relative z-10"
          >
            <ArrowLeft className="w-[26px] h-[26px] text-on-surface" />
          </button>
          <h1 className="text-[17px] font-medium text-on-surface">漫步</h1>
          <div className="w-10" />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <p className="text-outline text-[16px] font-medium mb-2">还没有日记</p>
          <p className="text-outline text-[14px] text-center">写几篇日记，再来漫步吧</p>
        </div>
      </div>
    );
  }

  const currentEntry = entries[currentIndex];

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans overflow-hidden relative animate-in fade-in slide-in-from-right-8 duration-300 ease-out">
      <style>
        {`
          @keyframes wave {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}
      </style>

      {/* Animated Waves Bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[120px] overflow-hidden z-0 pointer-events-none opacity-30">
        <svg 
          className="absolute bottom-0 w-[200%] h-full" 
          style={{ animation: 'wave 15s linear infinite' }}
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
          <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-23.64V0Z" opacity=".5" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
          <path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
          
          {/* Second set for seamless loop */}
          <g transform="translate(1200, 0)">
            <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
            <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-23.64V0Z" opacity=".5" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
            <path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z" fill="#A1A1A6" transform="scale(1, -1) translate(0, -120)"></path>
          </g>
        </svg>
      </div>

      <header className="w-full z-50 flex items-center justify-between px-4 h-16 shrink-0 relative">
        <button 
          onClick={() => {
            if (location.state?.fromDrawer) {
              sessionStorage.setItem('openDrawerOnNextMount', 'true');
              navigate(-1);
            } else {
              navigate(-1);
            }
          }}
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors relative z-10"
        >
          <ArrowLeft className="w-[26px] h-[26px] text-on-surface" />
        </button>
        <h1 className="text-[17px] font-medium text-on-surface">漫步</h1>
        <button 
          onClick={handleRefresh}
          className="flex items-center gap-1 p-2 -mr-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} style={{ animationDuration: '500ms' }} />
          <span className="text-[14px]">换一组</span>
        </button>
      </header>

      <main className="flex-1 relative w-full flex flex-col justify-center pb-8 z-10">
        <div 
          ref={containerRef}
          className="relative w-full h-[65vh] max-h-[700px] flex items-center justify-center touch-none"
          style={{ perspective: '1000px' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {entries.map((entry, index) => {
            let fullContent = entry.content || '';
            if (entry.blocks && entry.blocks.length > 0) {
              fullContent = entry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
            }
            
            const dateStr = getSafeDateStr(entry.diaryDate);
            const relativeTime = getRelativeTime(entry.diaryDate);
            const excerpt = getExcerpt(fullContent, 200, true);

            const offset = index - currentIndex;
            const absOffset = Math.abs(offset);
            
            let transformStyle = '';
            let opacityStyle = 0;
            let zIndex = 0;
            
            if (absOffset <= 1) {
              const sign = Math.sign(offset);
              const translateX = sign * 25; // 25% overlap offset for next/prev cards
              const scale = 1 - absOffset * 0.15; // 1, 0.85
              transformStyle = `translateX(${translateX}%) scale(${scale})`;
              opacityStyle = absOffset === 0 ? 1 : 0.6;
              zIndex = 10 - absOffset;
            } else {
              transformStyle = `translateX(${Math.sign(offset) * 100}%) scale(0.7)`;
              opacityStyle = 0;
              zIndex = 0;
            }

            return (
              <div
                key={entry.id || index}
                className="absolute w-[75vw] max-w-[320px] h-full transition-all ease-out cursor-pointer"
                style={{
                  transform: transformStyle,
                  opacity: opacityStyle,
                  zIndex: zIndex,
                  transitionDuration: '400ms',
                  transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  pointerEvents: absOffset <= 2 ? 'auto' : 'none',
                }}
                onClick={() => handleCardClick(entry, index)}
              >
                <div className="w-full h-full rounded-[20px] overflow-hidden relative shadow-[0_8px_30px_rgba(0,0,0,0.12)] bg-surface-container-lowest select-none">
                  {entry.coverImage ? (
                    <>
                      {/* Background Image */}
                      <img 
                        src={entry.coverImage} 
                        alt="" 
                        className="absolute inset-0 w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                      
                      {/* Gradient Overlay */}
                      <div 
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.75) 100%)'
                        }}
                      />
                      
                      {/* Text Content overlay */}
                      <div className="absolute bottom-0 left-0 w-full p-[24px] px-[20px] flex flex-col justify-end">
                        <div className="w-full flex justify-end mb-2">
                          <span className="text-[13px] text-white/70 tracking-[2px] font-medium">
                            {dateStr}
                          </span>
                        </div>
                        
                        <p 
                          className="text-white text-[15px] leading-[1.7] mb-4 overflow-hidden"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 8,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {excerpt}
                        </p>
                        
                        <div className="flex">
                          <span className="bg-white/15 text-white text-[12px] px-[10px] py-[4px] rounded-[20px] backdrop-blur-sm">
                            {relativeTime}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Text Only Card */
                    <div className="w-full h-full p-[24px] flex flex-col relative">
                      <div className="w-full flex justify-between items-center mb-6">
                        <span className="bg-surface-container-high text-on-surface-variant text-[12px] px-[10px] py-[4px] rounded-[20px]">
                          {relativeTime}
                        </span>
                        <span className="text-[13px] text-outline tracking-[1px] font-medium">
                          {dateStr}
                        </span>
                      </div>
                      
                      <div className="flex-1 overflow-hidden flex flex-col justify-center">
                        <p 
                          className="text-on-surface text-[16px] leading-[1.8] font-medium text-center overflow-hidden"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 12,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {excerpt}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Progress Dots */}
        <div className="w-full flex justify-center gap-[6px] mt-8 mb-4">
          {entries.map((_, idx) => (
            <div 
              key={idx}
              className={`rounded-full transition-all duration-200 ${
                idx === currentIndex 
                  ? 'w-[6px] h-[6px] bg-primary transform scale-[1.3]' 
                  : 'w-[6px] h-[6px] bg-outline-variant'
              }`}
            />
          ))}
        </div>
        
        {/* Footer Text */}
        <div className="w-full text-center">
          <p className="text-outline text-[12px] tracking-[4px] transition-opacity duration-300">
            {footerText}
          </p>
        </div>
      </main>
    </div>
  );
}
