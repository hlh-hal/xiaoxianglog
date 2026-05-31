import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { extractImages } from '../utils/imageUtils';
import { getExcerpt } from '../utils/textUtils';
import { format, isValid } from 'date-fns';
import { SafeImage } from '../components/SafeImage';

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
  const { returnToDrawer } = useOutletContext<any>();
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

  const goBack = () => {
    if (location.state?.fromDrawer && returnToDrawer) {
      returnToDrawer();
    } else {
      navigate(-1);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-surface" />;
  }

  if (entries.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex flex-col font-sans">
        <header className="app-safe-header w-full z-50 flex items-center justify-between px-4 shrink-0 relative">
          <button 
            onClick={goBack}
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

          @keyframes boatFloat {
            0%, 100% { transform: translateY(0) rotate(-1.5deg); }
            50% { transform: translateY(-6px) rotate(1.5deg); }
          }

          @keyframes fishJumpLeft {
            0%, 12% { opacity: 0; transform: translate(0, 18px) rotate(-18deg) scale(0.8); }
            24% { opacity: 0.5; transform: translate(16px, -10px) rotate(6deg) scale(1); }
            40% { opacity: 0.42; transform: translate(34px, 4px) rotate(24deg) scale(0.92); }
            52%, 100% { opacity: 0; transform: translate(46px, 22px) rotate(34deg) scale(0.78); }
          }

          @keyframes fishJumpRight {
            0%, 20% { opacity: 0; transform: translate(0, 18px) rotate(18deg) scale(0.8); }
            34% { opacity: 0.46; transform: translate(-16px, -12px) rotate(-8deg) scale(1); }
            50% { opacity: 0.4; transform: translate(-36px, 4px) rotate(-26deg) scale(0.92); }
            62%, 100% { opacity: 0; transform: translate(-50px, 22px) rotate(-36deg) scale(0.78); }
          }

          @keyframes fishSplash {
            0%, 18% { opacity: 0; transform: scaleX(0.5); }
            26% { opacity: 0.26; transform: scaleX(1); }
            42%, 100% { opacity: 0; transform: scaleX(1.25); }
          }
        `}
      </style>

      {/* Animated Waves Bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[220px] md:h-[170px] overflow-hidden z-0 pointer-events-none">
        <div className="absolute left-1/2 top-[132px] z-10 -translate-x-1/2 opacity-70">
          <svg
            className="block"
            width="52"
            height="32"
            viewBox="0 0 68 42"
            fill="none"
            style={{ animation: 'boatFloat 4.8s ease-in-out infinite' }}
            aria-hidden="true"
          >
            <path d="M14 28.5C20.5 34 47.5 34 54 28.5C50.5 35.5 44.5 39 34 39C23.5 39 17.5 35.5 14 28.5Z" fill="#8A9088" opacity="0.34" />
            <path d="M19 26.5H50.5C48.5 31.5 43.5 35 34.5 35C25.5 35 21 31.5 19 26.5Z" fill="#446733" opacity="0.28" />
            <path d="M34 7V26" stroke="#6F786B" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
            <path d="M35 9C41.5 13.5 45.5 18 48 25H35V9Z" fill="#E8EAE4" opacity="0.92" />
            <path d="M32.5 11C27.5 15 24.5 20 22.5 25H32.5V11Z" fill="#F5F5F1" opacity="0.95" />
            <path d="M22 25.5H49" stroke="#6F786B" strokeWidth="1.2" strokeLinecap="round" opacity="0.28" />
          </svg>
        </div>
        <div className="absolute left-[16%] top-[132px] z-10 opacity-80">
          <svg
            width="46"
            height="34"
            viewBox="0 0 46 34"
            fill="none"
            aria-hidden="true"
          >
            <g style={{ animation: 'fishJumpLeft 5.8s ease-in-out infinite' }}>
              <path d="M13.5 17.5C17.5 12.8 25.3 12.7 30 17.2C25.7 21.4 18.1 21.6 13.5 17.5Z" fill="#6F786B" opacity="0.45" />
              <path d="M13.8 17.4L8.6 13.8C8.2 16.8 8.3 18.8 9.1 21.7L13.8 17.4Z" fill="#6F786B" opacity="0.34" />
              <path d="M28.5 17.1C32.2 15.5 35 14.8 38.3 14.8C36.3 18.2 33.6 20 29.4 20.7" stroke="#6F786B" strokeWidth="1.2" strokeLinecap="round" opacity="0.34" />
              <circle cx="24.2" cy="16.5" r="0.8" fill="#5C605A" opacity="0.42" />
            </g>
            <path d="M4 29.5C8.5 28.2 13 28.2 17.5 29.5" stroke="#AEB4AC" strokeWidth="1" strokeLinecap="round" style={{ animation: 'fishSplash 5.8s ease-out infinite' }} />
            <path d="M14 29.5C18.5 28.3 23 28.3 27.5 29.5" stroke="#AEB4AC" strokeWidth="0.8" strokeLinecap="round" style={{ animation: 'fishSplash 5.8s ease-out infinite', animationDelay: '120ms' }} />
          </svg>
        </div>
        <div className="absolute right-[14%] top-[150px] z-10 opacity-75">
          <svg
            width="48"
            height="34"
            viewBox="0 0 48 34"
            fill="none"
            aria-hidden="true"
          >
            <g style={{ animation: 'fishJumpRight 7.2s ease-in-out infinite', animationDelay: '1.6s' }}>
              <path d="M34.5 17.5C30.3 12.9 22.9 12.9 18.2 17.1C22.5 21.4 30 21.6 34.5 17.5Z" fill="#6F786B" opacity="0.42" />
              <path d="M34.2 17.4L39.5 13.8C39.9 16.8 39.8 18.8 39 21.7L34.2 17.4Z" fill="#6F786B" opacity="0.32" />
              <path d="M19.6 17.1C16 15.6 13.2 14.8 10 14.8C12 18.2 14.6 20 18.8 20.7" stroke="#6F786B" strokeWidth="1.2" strokeLinecap="round" opacity="0.32" />
              <circle cx="23.8" cy="16.5" r="0.8" fill="#5C605A" opacity="0.4" />
            </g>
            <path d="M23 29.5C27.5 28.2 32 28.2 36.5 29.5" stroke="#AEB4AC" strokeWidth="1" strokeLinecap="round" style={{ animation: 'fishSplash 7.2s ease-out infinite', animationDelay: '1.6s' }} />
            <path d="M12 29.5C16.5 28.3 21 28.3 25.5 29.5" stroke="#AEB4AC" strokeWidth="0.8" strokeLinecap="round" style={{ animation: 'fishSplash 7.2s ease-out infinite', animationDelay: '1.72s' }} />
          </svg>
        </div>
        <svg 
          className="absolute bottom-0 w-[200%] h-full" 
          style={{ animation: 'wave 24s linear infinite' }}
          viewBox="0 0 1200 180" 
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="walk-water-fade" x1="0" y1="56" x2="0" y2="180" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E6E7E1" stopOpacity="0" />
              <stop offset="0.48" stopColor="#E0E2DC" stopOpacity="0.42" />
              <stop offset="1" stopColor="#D4D7D0" stopOpacity="0.74" />
            </linearGradient>
          </defs>
          <path d="M0 92C120 83 205 100 320 93C455 85 560 72 690 84C805 94 900 113 1040 101C1110 95 1160 85 1200 82V180H0V92Z" fill="url(#walk-water-fade)" />
          <path d="M0 124C92 116 190 128 280 124C408 118 500 101 628 109C748 116 846 136 970 128C1060 122 1134 111 1200 114V180H0V124Z" fill="#D9DBD5" opacity="0.42" />
          <path d="M0 154C110 145 210 151 320 153C454 156 540 141 662 143C814 146 904 165 1040 158C1100 155 1158 149 1200 150V180H0V154Z" fill="#CBCDCA" opacity="0.34" />
          <path d="M0 72C92 65 182 77 274 73C384 68 482 58 598 64C714 70 814 85 932 80C1030 76 1110 67 1200 70" stroke="#AEB4AC" strokeWidth="1.2" opacity="0.24" fill="none" />
          <path d="M0 90C110 82 202 94 310 90C438 85 532 73 664 81C784 88 878 101 1002 96C1078 93 1142 86 1200 88" stroke="#BAC0B7" strokeWidth="0.9" opacity="0.26" fill="none" />
          <path d="M0 110C96 103 178 115 284 111C418 106 518 94 648 101C780 108 874 123 1014 116C1090 112 1146 106 1200 108" stroke="#A9B0A7" strokeWidth="0.8" opacity="0.2" fill="none" />
          <path d="M0 132C118 124 216 136 336 131C448 127 552 117 676 123C804 130 910 144 1030 139C1100 136 1158 130 1200 131" stroke="#AEB4AC" strokeWidth="0.8" opacity="0.18" fill="none" />
          <path d="M0 150C110 144 214 155 326 151C454 147 542 137 666 143C786 149 890 160 1010 156C1090 153 1150 148 1200 149" stroke="#AEB4AC" strokeWidth="0.7" opacity="0.16" fill="none" />
          <g transform="translate(1200, 0)">
            <path d="M0 92C120 83 205 100 320 93C455 85 560 72 690 84C805 94 900 113 1040 101C1110 95 1160 85 1200 82V180H0V92Z" fill="url(#walk-water-fade)" />
            <path d="M0 124C92 116 190 128 280 124C408 118 500 101 628 109C748 116 846 136 970 128C1060 122 1134 111 1200 114V180H0V124Z" fill="#D9DBD5" opacity="0.42" />
            <path d="M0 154C110 145 210 151 320 153C454 156 540 141 662 143C814 146 904 165 1040 158C1100 155 1158 149 1200 150V180H0V154Z" fill="#CBCDCA" opacity="0.34" />
            <path d="M0 72C92 65 182 77 274 73C384 68 482 58 598 64C714 70 814 85 932 80C1030 76 1110 67 1200 70" stroke="#AEB4AC" strokeWidth="1.2" opacity="0.24" fill="none" />
            <path d="M0 90C110 82 202 94 310 90C438 85 532 73 664 81C784 88 878 101 1002 96C1078 93 1142 86 1200 88" stroke="#BAC0B7" strokeWidth="0.9" opacity="0.26" fill="none" />
            <path d="M0 110C96 103 178 115 284 111C418 106 518 94 648 101C780 108 874 123 1014 116C1090 112 1146 106 1200 108" stroke="#A9B0A7" strokeWidth="0.8" opacity="0.2" fill="none" />
            <path d="M0 132C118 124 216 136 336 131C448 127 552 117 676 123C804 130 910 144 1030 139C1100 136 1158 130 1200 131" stroke="#AEB4AC" strokeWidth="0.8" opacity="0.18" fill="none" />
            <path d="M0 150C110 144 214 155 326 151C454 147 542 137 666 143C786 149 890 160 1010 156C1090 153 1150 148 1200 149" stroke="#AEB4AC" strokeWidth="0.7" opacity="0.16" fill="none" />
          </g>
        </svg>
      </div>

      <header className="app-safe-header w-full z-50 flex items-center justify-between px-4 shrink-0 relative">
        <button 
          onClick={goBack}
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

      <main className="flex-1 relative w-full flex flex-col justify-start pt-2 pb-8 z-10">
        <div 
          ref={containerRef}
          className="relative w-full h-[65vh] max-h-[700px] mt-8 flex items-center justify-center touch-none"
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
            const excerpt = getExcerpt(fullContent, entry.coverImage ? 200 : 360, true);

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
                      <SafeImage
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
                            whiteSpace: 'pre-wrap',
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
                      <div className="w-full flex justify-between items-center mb-4">
                        <span className="bg-surface-container-high text-on-surface-variant text-[12px] px-[10px] py-[4px] rounded-[20px]">
                          {relativeTime}
                        </span>
                        <span className="text-[13px] text-outline tracking-[1px] font-medium">
                          {dateStr}
                        </span>
                      </div>
                      
                      <div className="flex-1 overflow-hidden flex flex-col justify-start">
                        <p 
                          className="text-on-surface text-[16px] leading-[1.8] font-medium text-left overflow-hidden"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 16,
                            WebkitBoxOrient: 'vertical',
                            whiteSpace: 'pre-wrap',
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
