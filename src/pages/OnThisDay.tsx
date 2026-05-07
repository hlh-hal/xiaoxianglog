import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, SlidersHorizontal, History, ChevronLeft, ChevronRight, Flower2, Leaf, Snowflake } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { extractImages } from '../utils/imageUtils';
import { getExcerpt } from '../utils/textUtils';
import { format, subYears, subMonths, subDays, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useTheme } from '../contexts/ThemeContext';

type ReviewMode = 'years_1' | 'months_6' | 'days_100' | 'custom';
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// SVG Components
const LeafSVG = ({ color = '#D4845A', size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17 8C8 10 5.9 16.17 3.82 19.82L5.71 21l1-1.87C7.67 20 9.83 21 12 21c5.52 0 10-4.48 10-10C22 6 17 2 12 2c0 0 1 6-5 8 3 0 6 1 8 4-1-3-1-5 2-6z"/>
  </svg>
);

const GinkgoSVG = ({ color = '#E8C84A', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C8 2 4 5 4 9c0 2.5 1.5 4.5 3 6l-1 5h12l-1-5c1.5-1.5 3-3.5 3-6 0-4-4-7-8-7z"/>
  </svg>
);

const SnowflakeSVG = ({ color = '#A8C8E8', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} strokeWidth="1.5" fill="none">
    <line x1="12" y1="2" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <line x1="5" y1="5" x2="19" y2="19"/>
    <line x1="19" y1="5" x2="5" y2="19"/>
    <circle cx="12" cy="12" r="2" fill={color}/>
    <circle cx="12" cy="4" r="1.2" fill={color}/>
    <circle cx="12" cy="20" r="1.2" fill={color}/>
    <circle cx="4" cy="12" r="1.2" fill={color}/>
    <circle cx="20" cy="12" r="1.2" fill={color}/>
  </svg>
);

const PetalSVG = ({ color = '#F4A7B9', size = 10 }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" fill={color}>
    <ellipse cx="10" cy="14" rx="8" ry="12" opacity="0.85"/>
    <ellipse cx="10" cy="14" rx="5" ry="9" fill="white" opacity="0.3"/>
  </svg>
);

const DotSVG = ({ color = '#4CAF50', size = 6 }) => (
  <svg width={size*2} height={size*2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="6" fill={color} filter="blur(1px)"/>
    <circle cx="12" cy="12" r="3" fill="#fff" opacity="0.4"/>
  </svg>
);

type ParticleType = 'leaf' | 'ginkgo' | 'snow' | 'petal' | 'dot';

interface ParticleItem {
  id: number;
  left: string;
  duration: number;
  delay: number;
  size: number;
  color: string;
  type: ParticleType;
  opacity: number;
  animationName: string;
}

const SEASON_PARTICLE_CONFIG = {
  spring: {
    count: 54,
    size: { min: 8, max: 13 },
    duration: { min: 9, max: 15 },
    opacity: { min: 0.5, max: 0.7 },
    types: ['petal'] as ParticleType[],
    colors: ['#F4A7B9', '#F9C5D1', '#E8899A', '#FBD3DC', '#F2829A'],
    animation: 'floatPetal'
  },
  summer: {
    count: 36,
    size: { min: 3, max: 6 },
    duration: { min: 6, max: 10 },
    opacity: { min: 0.6, max: 0.8 },
    types: ['dot'] as ParticleType[],
    colors: ['#4CAF50', '#2E7D32', '#66BB6A'],
    animation: 'fallSnow'
  },
  autumn: {
    count: 58,
    size: { min: 10, max: 16 },
    duration: { min: 8, max: 14 },
    opacity: { min: 0.55, max: 0.8 },
    types: ['leaf', 'ginkgo'] as ParticleType[],
    colors: ['#D4845A', '#C4622D', '#A85832', '#E8A87C', '#8B4513', '#CD853F', '#F2C94C', '#E8B84A', '#D4A843', '#F9D66B'],
    animation: 'fallLeaf'
  },
  winter: {
    count: 74,
    size: { min: 8, max: 13 },
    duration: { min: 7, max: 12 },
    opacity: { min: 0.5, max: 0.75 },
    types: ['snow'] as ParticleType[],
    colors: ['#B8D4F0', '#C8DFF5', '#D8E8F8', '#A0C0E8'],
    animation: 'fallSnow'
  }
};

function getSeason(dateStr: string): Season {
  const month = new Date(dateStr).getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateParticles(season: Season): ParticleItem[] {
  const config = SEASON_PARTICLE_CONFIG[season];
  const segments = config.count;
  return Array.from({ length: config.count }, (_, i) => ({
    id: i,
    left: `${(i / segments) * 100 + Math.random() * (100 / segments)}%`,
    duration: randomBetween(config.duration.min, config.duration.max),
    delay: randomBetween(-config.duration.max, 0),
    size: randomBetween(config.size.min, config.size.max),
    color: config.colors[Math.floor(Math.random() * config.colors.length)],
    type: config.types[Math.floor(Math.random() * config.types.length)],
    opacity: randomBetween(config.opacity.min, config.opacity.max),
    animationName: config.animation,
  }));
}

const ParticleStyles = () => (
  <style>{`
    @keyframes fallLeaf {
      0% { transform: translateY(-15px) rotate(0deg) translateX(0px); opacity: 0; }
      8% { opacity: var(--opacity); }
      25% { transform: translateY(25vh) rotate(60deg) translateX(12px); }
      50% { transform: translateY(50vh) rotate(140deg) translateX(-8px); }
      75% { transform: translateY(75vh) rotate(240deg) translateX(10px); }
      92% { opacity: var(--opacity); }
      100% { transform: translateY(108vh) rotate(360deg) translateX(-5px); opacity: 0; }
    }
    @keyframes fallSnow {
      0% { transform: translateY(-10px) translateX(0px) rotate(0deg); opacity: 0; }
      10% { opacity: var(--opacity); }
      30% { transform: translateY(30vh) translateX(8px) rotate(45deg); }
      60% { transform: translateY(60vh) translateX(-6px) rotate(90deg); }
      90% { opacity: var(--opacity); }
      100% { transform: translateY(108vh) translateX(4px) rotate(180deg); opacity: 0; }
    }
    @keyframes floatPetal {
      0% { transform: translateY(-10px) rotate(0deg) translateX(0px); opacity: 0; }
      10% { opacity: var(--opacity); }
      20% { transform: translateY(20vh) rotate(30deg) translateX(18px); }
      40% { transform: translateY(40vh) rotate(-20deg) translateX(-12px); }
      60% { transform: translateY(60vh) rotate(50deg) translateX(15px); }
      80% { transform: translateY(80vh) rotate(-10deg) translateX(-8px); }
      90% { opacity: var(--opacity); }
      100% { transform: translateY(108vh) rotate(20deg) translateX(5px); opacity: 0; }
    }
  `}</style>
);

export default function OnThisDay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { openDrawer } = useOutletContext<any>();
  const { isDark } = useTheme();

  const c = {
    bg: isDark ? '#1C1C1E' : '#FAF9F5',
    card: isDark ? '#2C2C2E' : '#FFFFFF',
    textPrimary: isDark ? '#F2F2F7' : '#1C1C1E',
    textSecondary: isDark ? '#8E8E93' : '#6E6E73',
    textTertiary: isDark ? '#636366' : '#A1A1A6',
    border: isDark ? '#3A3A3C' : '#F2F2F7',
    dateNum: isDark ? 'rgba(242,242,247,0.18)' : 'rgba(28,28,30,0.18)',
    icon: isDark ? '#F2F2F7' : '#1C1C1E',
    emptyIcon: isDark ? '#48484A' : '#D1D5D4',
    appBarBg: isDark ? 'rgba(28,28,30,0.85)' : 'rgba(250,249,245,0.85)',
    bottomSheetBg: isDark ? '#2C2C2E' : '#FFFFFF',
    bottomSheetMask: 'rgba(0,0,0,0.5)',
  };

  const [loading, setLoading] = useState(true);
  const [allEntries, setAllEntries] = useState<DiaryEntry[]>([]);
  const [currentEntryIndex, setCurrentIndex] = useState(0);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isFading, setIsFading] = useState(false);
  
  const [reviewMode, setReviewMode] = useState<ReviewMode>(() => {
    return (localStorage.getItem('onThisDay_reviewMode') as ReviewMode) || 'years_1';
  });
  const [customDays, setCustomDays] = useState<number>(() => {
    const saved = localStorage.getItem('onThisDay_customDays');
    return saved ? parseInt(saved, 10) : 30;
  });

  // Animation state
  const [isAnimActive, setIsAnimActive] = useState(false);
  const [particles, setParticles] = useState<ParticleItem[]>([]);

  useEffect(() => {
    localStorage.setItem('onThisDay_reviewMode', reviewMode);
  }, [reviewMode]);

  useEffect(() => {
    localStorage.setItem('onThisDay_customDays', customDays.toString());
  }, [customDays]);

  useEffect(() => {
    const fetchEntries = async () => {
      const entries = await diaryService.getActiveEntries();
      setAllEntries(entries);
      setLoading(false);
    };
    fetchEntries();
  }, []);

  const displayDate = useMemo(() => {
    const today = new Date();
    if (reviewMode === 'years_1') return subYears(today, 1);
    if (reviewMode === 'months_6') return subMonths(today, 6);
    if (reviewMode === 'days_100') return subDays(today, 100);
    if (reviewMode === 'custom') return subDays(today, customDays || 0);
    return today;
  }, [reviewMode, customDays]);

  const targetMonth = displayDate.getMonth() + 1;
  const targetDay = displayDate.getDate();

  const displayEntries = useMemo(() => {
    const matched = allEntries.filter(entry => {
      const d = new Date(entry.diaryDate);
      return isSameDay(d, displayDate);
    });

    matched.sort((a, b) => new Date(b.diaryDate).getTime() - new Date(a.diaryDate).getTime());
    return matched;
  }, [allEntries, reviewMode, displayDate]);

  // Handle index reset when review mode changes manually,
  // but allow restoring from session storage after navigating back
  useEffect(() => {
    if (allEntries.length > 0) {
      const savedIndexStr = sessionStorage.getItem('onThisDay_restore_index');
      if (savedIndexStr) {
        const savedIndex = parseInt(savedIndexStr, 10);
        if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < displayEntries.length) {
          setCurrentIndex(savedIndex);
        }
        sessionStorage.removeItem('onThisDay_restore_index');
      } else {
        // Only reset if index is out of bounds
        if (currentEntryIndex >= displayEntries.length && displayEntries.length > 0) {
          setCurrentIndex(0);
        }
      }
    }
  }, [allEntries, displayEntries.length]);

  const handleReviewModeChange = (mode: ReviewMode) => {
    setReviewMode(mode);
    setCurrentIndex(0);
    setIsBottomSheetOpen(false);
  };

  const currentEntry = displayEntries[currentEntryIndex];
  const currentSeason = currentEntry ? getSeason(currentEntry.diaryDate) : getSeason(displayDate.toISOString());

  const toggleAnimation = () => {
    if (isAnimActive) {
      setIsAnimActive(false);
    } else {
      setParticles(generateParticles(currentSeason));
      setIsAnimActive(true);
    }
  };

  // Stop animation if season changes
  useEffect(() => {
    if (isAnimActive) {
      setIsAnimActive(false);
    }
  }, [currentSeason]);

  const handlePrev = () => {
    if (displayEntries.length <= 1) return;
    setIsFading(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev > 0 ? prev - 1 : displayEntries.length - 1));
      setIsFading(false);
    }, 300);
  };

  const handleNext = () => {
    if (displayEntries.length <= 1) return;
    setIsFading(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev < displayEntries.length - 1 ? prev + 1 : 0));
      setIsFading(false);
    }, 300);
  };

  const getSubtitle = () => {
    if (reviewMode === 'years_1') return '一年前的这一天，你写下了这些';
    if (reviewMode === 'months_6') return '半年前的这一天，你写下了这些';
    if (reviewMode === 'days_100') return '100天前的这一天，你写下了这些';
    if (reviewMode === 'custom') return `${customDays} 天前的这一天，你写下了这些`;
    return '';
  };

  const renderSeasonIcon = () => {
    const props = {
      className: `w-5 h-5 transition-colors`,
      style: { color: isAnimActive ? '#446733' : c.textSecondary }
    };
    
    switch (currentSeason) {
      case 'spring': return <Flower2 {...props} />;
      case 'summer': return <Leaf {...props} />;
      case 'autumn': return <span className={`text-lg leading-none transition-opacity ${isAnimActive ? 'opacity-100' : 'opacity-60 grayscale'}`}>🍂</span>;
      case 'winter': return <Snowflake {...props} />;
    }
  };

  const renderCard = () => {
    if (!currentEntry) {
      return (
        <div className="w-full flex flex-col items-center justify-center py-12">
          <History className="w-12 h-12 mb-4" style={{ color: c.emptyIcon }} />
          <p className="text-[14px] mb-1" style={{ color: c.textSecondary }}>还没有这一天的记忆</p>
          <p className="text-[14px]" style={{ color: c.textTertiary }}>继续写日记，明年的今天会相遇</p>
        </div>
      );
    }

    let fullContent = currentEntry.content || '';
    if (currentEntry.blocks && currentEntry.blocks.length > 0) {
      fullContent = currentEntry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
    }
    
    const urls = extractImages(fullContent);
    if (currentEntry.images && currentEntry.images.length > 0) {
      currentEntry.images.forEach(imgUrl => {
        if (!urls.includes(imgUrl)) urls.push(imgUrl);
      });
    }
    const imageUrl = urls.length > 0 ? urls[0] : null;
    
    const dateStr = format(new Date(currentEntry.diaryDate), 'yyyy年MM月dd日 EEEE', { locale: zhCN });
    const excerpt = getExcerpt(fullContent, 300, true);

    return (
      <div 
        onClick={() => {
          sessionStorage.setItem('onThisDay_restore_index', currentEntryIndex.toString());
          navigate(`/editor?id=${currentEntry.id}`);
        }}
        className={`relative w-full rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] min-h-[320px] cursor-pointer active:scale-[0.99] transition-all duration-150 flex flex-col overflow-hidden ${isFading ? 'opacity-0' : 'opacity-100'}`}
        style={{ backgroundColor: c.card }}
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
            
            <div className="relative z-10 flex flex-col h-full p-[24px] flex-1">
              <div className="text-[12px] mb-4 text-white/80">{dateStr}</div>
              <p 
                className="text-[15px] leading-relaxed overflow-hidden text-white drop-shadow-sm whitespace-pre-wrap break-words"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 14,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {excerpt}
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full p-[24px] flex-1">
            <div className="text-[12px] mb-4" style={{ color: c.textTertiary }}>{dateStr}</div>
            <p 
              className="text-[15px] leading-relaxed overflow-hidden whitespace-pre-wrap break-words"
              style={{
                color: c.textSecondary,
                display: '-webkit-box',
                WebkitLineClamp: 16,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {excerpt}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderRadioOption = (label: string, selected: boolean, onClick: () => void) => (
    <button 
      className="w-full py-4 px-4 flex items-center gap-3 transition-colors rounded-xl"
      style={{ backgroundColor: 'transparent' }}
      onClick={onClick}
    >
      <div 
        className="w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center"
        style={{ borderColor: selected ? '#446733' : c.border }}
      >
        {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#446733' }} />}
      </div>
      <span className="text-[16px]" style={{ color: c.textPrimary }}>{label}</span>
    </button>
  );

  if (loading) {
    return <div className="min-h-screen bg-surface" />;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: c.bg,
      position: 'relative',
      overflowX: 'hidden',
    }} className="flex flex-col font-sans animate-in fade-in slide-in-from-right-8 duration-300 ease-out">
      <ParticleStyles />
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'hidden',
        opacity: isAnimActive ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>
        {particles.map(p => (
          <span
            key={p.id}
            style={{
              position: 'absolute',
              left: p.left,
              top: '-20px',
              animation: `${p.animationName} ${p.duration}s ${p.delay}s linear infinite`,
              '--opacity': p.opacity,
              userSelect: 'none',
            } as React.CSSProperties}
          >
            {p.type === 'leaf' && <LeafSVG color={p.color} size={p.size} />}
            {p.type === 'ginkgo' && <GinkgoSVG color={p.color} size={p.size} />}
            {p.type === 'snow' && <SnowflakeSVG color={p.color} size={p.size} />}
            {p.type === 'petal' && <PetalSVG color={p.color} size={p.size} />}
            {p.type === 'dot' && <DotSVG color={p.color} size={p.size} />}
          </span>
        ))}
      </div>
      
      <header 
        className="w-full z-40 flex items-center justify-between px-4 h-16 shrink-0"
        style={{
          backgroundColor: c.appBarBg,
          backdropFilter: 'blur(12px)',
        }}
      >
        <button 
          onClick={() => {
            if (location.state?.fromDrawer) {
              sessionStorage.setItem('openDrawerOnNextMount', 'true');
              navigate(-1);
            } else {
              navigate(-1);
            }
          }}
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors"
        >
          <ArrowLeft className="w-6 h-6" style={{ color: c.icon }} />
        </button>
        <h1 className="text-[17px] font-medium absolute left-1/2 -translate-x-1/2" style={{ color: c.textPrimary }}>那年今日</h1>
        <div className="flex items-center gap-1 -mr-2">
          <button 
            onClick={toggleAnimation}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors flex items-center justify-center"
            title="切换季节特效"
          >
            {renderSeasonIcon()}
          </button>
          <button 
            onClick={() => setIsBottomSheetOpen(true)}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <SlidersHorizontal className="w-6 h-6" style={{ color: c.textSecondary }} />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[800px] mx-auto flex flex-col px-[16px] pt-4 pb-12 relative z-20">
        <div style={{
          padding: '24px 24px 20px',
          textAlign: 'center',
        }}>
          {/* 大日期数字 */}
          <div style={{
            fontSize: '48px',
            fontWeight: '800',
            color: isDark ? '#F2F2F7' : '#1C1C1E',
            lineHeight: 1,
            letterSpacing: '-2px',
            fontFamily: '"PingFang SC", "Microsoft YaHei", "SimHei", "Heiti SC", sans-serif',
          }}>
            {targetMonth}月{targetDay}日
          </div>

          {/* 年份小标签 */}
          <div style={{
            marginTop: '8px',
            fontSize: '13px',
            color: isDark ? '#636366' : '#A1A1A6',
          }}>
            {getSubtitle()}
          </div>
        </div>

        <div className="w-full flex-1 flex flex-col">
          {renderCard()}
          
          {displayEntries.length > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4 text-[13px]" style={{ color: c.textTertiary }}>
              <button onClick={handlePrev} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className={`transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                {new Date(currentEntry.diaryDate).getFullYear()}年 · 第{currentEntryIndex + 1}篇/共{displayEntries.length}篇
              </span>
              <button onClick={handleNext} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Sheet */}
      {isBottomSheetOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div 
            className="absolute inset-0 transition-opacity"
            style={{ backgroundColor: c.bottomSheetMask }}
            onClick={() => setIsBottomSheetOpen(false)}
          />
          <div 
            className="relative rounded-t-[24px] w-full max-w-[800px] mx-auto pb-8 animate-in slide-in-from-bottom-full duration-300"
            style={{ backgroundColor: c.bottomSheetBg }}
          >
            <div className="w-full flex justify-center pt-3 pb-4">
              <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: c.border }} />
            </div>
            <h3 className="text-center text-[16px] font-medium mb-4" style={{ color: c.textPrimary }}>选择回顾的时间跨度</h3>
            
            <div className="px-4 flex flex-col gap-1">
              {renderRadioOption('一年前', reviewMode === 'years_1', () => handleReviewModeChange('years_1'))}
              {renderRadioOption('半年前', reviewMode === 'months_6', () => handleReviewModeChange('months_6'))}
              {renderRadioOption('100天前', reviewMode === 'days_100', () => handleReviewModeChange('days_100'))}
              {renderRadioOption('自定义天数', reviewMode === 'custom', () => {
                setReviewMode('custom');
                setCurrentIndex(0);
              })}
              
              {reviewMode === 'custom' && (
                <div className="px-4 py-3 flex items-center gap-3 ml-8 animate-in fade-in slide-in-from-top-2">
                  <input 
                    type="number" 
                    value={customDays} 
                    onChange={e => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-2 rounded-lg text-[15px] outline-none focus:ring-2 focus:ring-primary/50"
                    style={{ backgroundColor: c.bg, color: c.textPrimary }}
                    min="1"
                  />
                  <span className="text-[15px]" style={{ color: c.textSecondary }}>天前</span>
                  <button 
                    onClick={() => setIsBottomSheetOpen(false)}
                    className="ml-auto px-4 py-2 text-white text-[14px] rounded-lg font-medium"
                    style={{ backgroundColor: '#446733' }}
                  >
                    确定
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
