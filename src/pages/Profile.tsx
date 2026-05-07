import React, { useEffect, useMemo, useState } from 'react';
import { Mail, ChevronRight, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { stripMarkdown, extractKeywords } from '../utils/textUtils';
import { api } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';

type ProfileStats = {
  totalEntries: number;
  totalWords: number;
  totalPhotos: number;
  totalLikes: number;
  monthEntries: number;
  leaderboardRank: number | null;
};

type ReceivedLikesSummary = {
  totalLikes: number;
  communityPostLikes: number;
  commentLikes: number;
  commentLikeRows?: number;
  leaderboardLikes: number;
};

const emptyStats: ProfileStats = {
  totalEntries: 0,
  totalWords: 0,
  totalPhotos: 0,
  totalLikes: 0,
  monthEntries: 0,
  leaderboardRank: null,
};

let cachedEntries: DiaryEntry[] = [];
let cachedStats: ProfileStats = emptyStats;

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [entries, setEntries] = useState<DiaryEntry[]>(cachedEntries);
  const [stats, setStats] = useState<ProfileStats>(cachedStats);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeBar, setActiveBar] = useState<{
    monthIndex: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const data = await api.get<{ count?: number; unreadCount?: number }>('/notifications/unread-count');
        setUnreadCount(data.count ?? data.unreadCount ?? 0);
      } catch {
        setUnreadCount(0);
      }
    };

    loadUnreadCount();
    const clearUnreadCount = () => setUnreadCount(0);
    const loadWhenVisible = () => {
      if (document.visibilityState === 'visible') loadUnreadCount();
    };
    window.addEventListener('focus', loadUnreadCount);
    window.addEventListener('pageshow', loadUnreadCount);
    window.addEventListener('visibilitychange', loadWhenVisible);
    window.addEventListener('xiang-notifications-read', clearUnreadCount);
    return () => {
      window.removeEventListener('focus', loadUnreadCount);
      window.removeEventListener('pageshow', loadUnreadCount);
      window.removeEventListener('visibilitychange', loadWhenVisible);
      window.removeEventListener('xiang-notifications-read', clearUnreadCount);
    };
  }, [user?.userId]);

  useEffect(() => {
    const loadData = async () => {
      const activeEntries = await diaryService.getActiveEntries();
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let totalWords = 0;
      let totalPhotos = 0;
      const monthEntryDays = new Set<string>();

      activeEntries.forEach((entry) => {
        const text = stripMarkdown(entry.content || '');
        totalWords += text.replace(/\s/g, '').length;
        totalPhotos += entry.images?.length || 0;

        const entryDate = new Date(entry.diaryDate);
        if (entryDate.getFullYear() === currentYear && entryDate.getMonth() === currentMonth) {
          monthEntryDays.add(entry.diaryDate.slice(0, 10));
        }
      });

      let totalLikes = 0;
      let leaderboardRank: number | null = null;

      if (user) {
        try {
          const leaderboard = await api.get<Array<{
            id: string;
            likes?: number;
            isCurrentUser?: boolean;
          }>>('/leaderboard');
          const myIndex = leaderboard.findIndex((item) => item.isCurrentUser || item.id === user.userId);
          if (myIndex >= 0) {
            leaderboardRank = myIndex + 1;
          }
        } catch {
          leaderboardRank = null;
        }

        try {
          const likesSummary = await api.get<ReceivedLikesSummary>('/leaderboard/me/received-likes');
          totalLikes = likesSummary.totalLikes || 0;
        } catch {
          totalLikes = 0;
        }
      }

      const nextStats = {
        totalEntries: activeEntries.length,
        totalWords,
        totalPhotos,
        totalLikes,
        monthEntries: monthEntryDays.size,
        leaderboardRank,
      };

      cachedEntries = activeEntries;
      cachedStats = nextStats;
      setEntries(activeEntries);
      setStats(nextStats);
    };

    loadData();
    const loadWhenVisible = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    window.addEventListener('focus', loadData);
    window.addEventListener('pageshow', loadData);
    window.addEventListener('visibilitychange', loadWhenVisible);
    return () => {
      window.removeEventListener('focus', loadData);
      window.removeEventListener('pageshow', loadData);
      window.removeEventListener('visibilitychange', loadWhenVisible);
    };
  }, [user?.userId]);

  const keywords = useMemo(() => {
    const tagCounts: Record<string, number> = {};

    entries.forEach((entry) => {
      entry.tags?.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const allText = entries.map((entry) => entry.content || '').join('\n\n');
    extractKeywords(allText).forEach(({ text, value }) => {
      tagCounts[text] = (tagCounts[text] || 0) + value;
    });

    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [entries]);

  const monthlyData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const counts = new Array(12).fill(0);
    entries.forEach((entry) => {
      const date = new Date(entry.diaryDate);
      if (date.getFullYear() === currentYear) counts[date.getMonth()] += 1;
    });
    return counts;
  }, [entries]);

  const moodTrend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const labels = last7Days.map(d => dayNames[d.getDay()]);

    const points: {x: number, y: number, hasData: boolean}[] = [];
    let lastValidY = 50;

    last7Days.forEach((date, i) => {
      const dayEntries = entries.filter(e => {
        const ed = new Date(e.diaryDate);
        return ed.getDate() === date.getDate() && ed.getMonth() === date.getMonth() && ed.getFullYear() === date.getFullYear();
      });

      let y = 50;
      let hasData = false;

      if (dayEntries.length > 0) {
        hasData = true;
        const text = dayEntries.map(e => e.content + (e.blocks ? e.blocks.map((b: any) => b.content).join('') : '')).join('');
        const positiveWords = ['开心', '快乐', '喜悦', '感谢', '宁静', '美好', '希望', '充实', '阳光', '好'];
        const negativeWords = ['难过', '悲伤', '焦虑', '烦躁', '疲惫', '迷茫', '压力', '低落', '差', '累', '烦'];

        let posCount = 0;
        let negCount = 0;

        positiveWords.forEach(w => { if (text.includes(w)) posCount++; });
        negativeWords.forEach(w => { if (text.includes(w)) negCount++; });

        if (posCount > negCount) y = 20; // Joy
        else if (negCount > posCount) y = 80; // Thoughtful
        else y = 50; // Calm
        
        lastValidY = y;
      } else {
        y = lastValidY;
      }

      const seed = date.getDate();
      const variation = hasData ? ((seed % 10) - 5) : 0; 
      
      points.push({
        x: i * (100 / 6),
        y: Math.max(10, Math.min(90, y + variation)),
        hasData
      });
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;
      pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }

    return { labels, points, pathD };
  }, [entries]);

  const formattedWords = stats.totalWords >= 1000
    ? `${(stats.totalWords / 1000).toFixed(1)}k`
    : String(stats.totalWords);
  const rankText = stats.leaderboardRank ? `第 ${stats.leaderboardRank} 名` : '未上榜';

  return (
    <div className="bg-surface text-on-surface pb-4 pt-[72px] px-4 md:px-6 w-full max-w-[800px] mx-auto">
      <header className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl">
        <div className="flex justify-between items-center w-full px-4 md:px-6 py-4 max-w-[800px] mx-auto">
          <button className="relative" onClick={() => navigate('/inbox')}>
            <Mail className="w-7 h-7 text-on-surface" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-[#FF3B30] px-1 text-[10px] leading-4 text-white font-semibold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="space-y-8">
        <section
          onClick={() => navigate(user ? '/profile/edit' : '/login')}
          className="bg-surface-container-lowest/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-6 rounded-2xl flex items-center gap-4 group cursor-pointer hover:bg-surface-container-lowest transition-all duration-500"
        >
          <UserAvatar
            src={user?.avatarUrl}
            name={user?.nickname || '我'}
            className="w-16 h-16 rounded-full flex-shrink-0 ring-1 ring-black/5 shadow-sm"
            fallbackClassName="bg-surface-container-high flex items-center justify-center text-outline"
          />
          <div className="flex-grow">
            <h2 className="text-xl font-bold text-on-surface tracking-tight">{user?.nickname || '点击登录'}</h2>
            <p className="text-[13px] text-outline mt-0.5">{user?.bio || '无个性签名'}</p>
          </div>
          <ChevronRight className="w-6 h-6 text-outline/40 group-hover:translate-x-1 transition-transform" />
        </section>

        <section className="grid grid-cols-2 gap-4">
          <StatCard label="累计日志数" value={stats.totalEntries} />
          <StatCard label="总字数" value={formattedWords} />
          <StatCard label="照片数" value={stats.totalPhotos} />
          <StatCard label="获赞数" value={stats.totalLikes} />
        </section>

        <section
          onClick={() => navigate('/leaderboard')}
          className="bg-surface-container-lowest/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-5 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-surface-container-lowest transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-on-surface">日志排行</span>
          </div>
          <div className="text-right">
            <p className="text-primary font-bold text-base leading-tight">{rankText}</p>
            <p className="text-[10px] uppercase tracking-wider text-outline font-medium">
              本月 {stats.monthEntries} 篇
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle title="高频关键词" />
          <div className="bg-surface-container-lowest/40 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-6 rounded-2xl flex flex-wrap gap-x-4 gap-y-3 justify-center items-center min-h-[92px]">
            {keywords.length > 0 ? keywords.map((tag, index) => (
              <span key={tag} className={keywordStyles[index % keywordStyles.length]}>{tag}</span>
            )) : (
              <span className="text-outline/50 text-sm">多写点日记，这里会生成你的专属关键词</span>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 bg-primary rounded-full"></div>
              <h3 className="font-bold text-[17px] text-on-surface">心情趋势</h3>
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline">最近 7 天</span>
          </div>
          <div className="bg-surface-container-lowest shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-6 rounded-2xl relative">
            <div className="aspect-[16/9] w-full relative px-2">
              <div className="absolute inset-0 flex flex-col pt-2 pb-8">
                <div className="flex-1 relative">
                  <span className="absolute right-2 top-2 text-[9px] text-outline/40 font-bold">喜悦</span>
                  <div className="absolute bottom-0 w-full border-t border-dashed border-black/5"></div>
                </div>
                <div className="flex-1 relative">
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-outline/40 font-bold">平静</span>
                  <div className="absolute bottom-0 w-full border-t border-dashed border-black/5"></div>
                </div>
                <div className="flex-1 relative">
                  <span className="absolute right-2 bottom-2 text-[9px] text-outline/40 font-bold">思索</span>
                </div>
              </div>
              <div className="absolute inset-0 pt-2 pb-8">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d={moodTrend.pathD} fill="none" stroke="#446733" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  {moodTrend.points.map((p, i) => (
                    <circle 
                      key={i} 
                      cx={p.x} 
                      cy={p.y} 
                      r={p.hasData ? "2.5" : "1.5"} 
                      fill="#446733" 
                      stroke={p.hasData ? "white" : "none"} 
                      strokeWidth={p.hasData ? "1.5" : "0"} 
                      vectorEffect="non-scaling-stroke" 
                      className={p.hasData ? "opacity-100" : "opacity-40"}
                    />
                  ))}
                </svg>
              </div>
            </div>
            <div className="flex justify-between mt-2 px-2 text-[10px] text-outline font-medium">
              {moodTrend.labels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 bg-primary rounded-full"></div>
              <h3 className="font-bold text-[17px] text-on-surface">年度完成趋势</h3>
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline">{new Date().getFullYear()}年</span>
          </div>
          <div className="bg-surface-container-lowest/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-6 pt-12 rounded-2xl relative">
            <div className="flex gap-4 h-[220px]">
              <div className="flex flex-col justify-between text-[9px] text-outline/60 font-medium py-1">
                <span>16</span><span>12</span><span>8</span><span>4</span><span>0</span>
              </div>
              <div className="flex-grow relative mt-1">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-black/[0.03] w-full"></div>
                  <div className="border-t border-black/[0.03] w-full"></div>
                  <div className="border-t border-black/[0.03] w-full"></div>
                  <div className="border-t border-black/[0.03] w-full"></div>
                  <div className="border-t border-black/[0.06] w-full"></div>
                </div>
                <div className="absolute inset-0 flex items-end justify-between gap-1.5 px-2">
                  {monthlyData.map((count, idx) => {
                    const maxCount = Math.max(...monthlyData, 16);
                    const heightPercent = Math.max((count / maxCount) * 100, 5); // Minimum 5% height
                    // Alternate colors slightly for visual effect
                    const bgClass = count > 0 
                      ? (idx % 2 === 0 ? 'bg-primary' : 'bg-primary/80') 
                      : 'bg-primary-fixed-dim opacity-60';
                    
                    return (
                      <div
                        key={idx}
                        className={`flex-1 ${bgClass} rounded-t-[4px] relative cursor-pointer`}
                        style={{ height: `${heightPercent}%` }}
                        // PC 鼠标事件
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActiveBar({
                            monthIndex: idx,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setActiveBar(null)}
                        // 移动端触摸事件
                        onTouchStart={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActiveBar({
                            monthIndex: idx,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                          e.stopPropagation();
                        }}
                        onTouchEnd={() => {
                          setTimeout(() => setActiveBar(null), 1500); // 触摸后1.5秒消失
                        }}
                      ></div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-4 pl-10 pr-2 text-[9px] text-outline font-bold">
              <span>一月</span><span>四月</span><span>七月</span><span>十月</span><span>十二月</span>
            </div>
          </div>
        </section>
      </div>

      {activeBar && (
        <div
          style={{
            position: 'fixed',
            left: activeBar.x,
            top: activeBar.y - 52,
            transform: 'translateX(-50%)',
            backgroundColor: isDark ? '#3A3A3C' : '#1C1C1E',
            color: '#FFFFFF',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '13px',
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            animation: 'tooltipFadeIn 0.15s ease',
          }}
        >
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginBottom: '2px' }}>
            {activeBar.monthIndex + 1}月
          </div>
          <div>{activeBar.count > 0 ? `${activeBar.count} 篇日记` : '暂无记录'}</div>

          {/* 小三角箭头朝下 */}
          <div style={{
            position: 'absolute',
            bottom: -5,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${isDark ? '#3A3A3C' : '#1C1C1E'}`,
          }} />
        </div>
      )}
      <style>{`
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-container-lowest/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] p-5 rounded-2xl space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-outline">{label}</span>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
    </div>
  );
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const prev = points[index - 1];
    const controlX = prev.x + (point.x - prev.x) * 0.5;
    return `${path} C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-[3px] h-4 bg-primary rounded-full" />
      <h3 className="font-bold text-[17px] text-on-surface">{title}</h3>
    </div>
  );
}

const keywordStyles = [
  'text-primary font-bold text-2xl',
  'text-outline font-medium text-lg',
  'text-primary font-extrabold text-3xl',
  'text-outline/60 font-normal text-base',
  'text-primary/80 font-semibold text-xl',
  'text-outline/50 font-light text-[13px]',
];
