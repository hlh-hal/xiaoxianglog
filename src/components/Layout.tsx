import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, Search, MoreVertical, BookOpen, Compass, User, 
  Image as ImageIcon, Footprints, History, Moon, Sun, Cloud, 
  Trash2, Settings, HelpCircle, Plus, ChevronLeft, ChevronRight,
  Check, X, Download, RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { diaryService } from '../services/diaryService';
import { getDailyQuote } from '../utils/quotes';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from './UserAvatar';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { AppToast } from './AppToast';
import { getDiaryDateKey, parseDiaryDateKey } from '../utils/diaryDate';
import { currentVersion, latestRelease as bundledRelease, type AppRelease } from '../config/appRelease';
import {
  downloadAndInstallApkUpdate,
  getConfiguredDownloadUrl,
  getLatestRelease,
  markUpdateNoticePrompted,
  shouldAutoOpenUpdateNotice,
  shouldShowUpdateEntry,
  skipRelease,
} from '../services/updateNoticeService';

export type ListStyle = 'timeline' | 'card_flow' | 'briefing' | 'magazine';

function shouldEnableApkUpdateNotice(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  return true;
}

export default function Layout() {
  const shouldShowApkUpdateNotice = shouldEnableApkUpdateNotice();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const pwaInstall = usePwaInstall();
  const shouldShowPwaInstall = !Capacitor.isNativePlatform();
  const isLoggedIn = !!user;
  const location = useLocation();
  const navigate = useNavigate();
  const [optimisticNavPath, setOptimisticNavPath] = useState(location.pathname);
  const pendingBottomNavFrame = React.useRef<number | null>(null);
  const isReturningToDrawerRef = React.useRef(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(() => {
    const state = location.state as any;
    return !!(state && state.drawerOpen);
  });
  const [disableDrawerTransition, setDisableDrawerTransition] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const lastDrawerOpenTime = React.useRef<number>(0);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (location.pathname !== '/') return;

    const dateKey = getDiaryDateKey(new URLSearchParams(location.search).get('date'));
    if (dateKey) {
      setSelectedDate(parseDiaryDateKey(dateKey));
    }
  }, [location.pathname, location.search]);

  // Menu and List Style State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStyleSheetOpen, setIsStyleSheetOpen] = useState(false);
  const [isInstallSheetOpen, setIsInstallSheetOpen] = useState(false);
  const [isUpdateNoticeOpen, setIsUpdateNoticeOpen] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<AppRelease>(bundledRelease);
  const [showUpdateEntry, setShowUpdateEntry] = useState(() => shouldShowApkUpdateNotice && shouldShowUpdateEntry(bundledRelease));
  const [isUpdateDownloading, setIsUpdateDownloading] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [listStyle, setListStyle] = useState<ListStyle>(() => {
    return (localStorage.getItem('diary_list_style') as ListStyle) || 'timeline';
  });

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    const state = location.state as any;
    if (state && state.drawerOpen) {
      const newState = { ...state };
      delete newState.drawerOpen;
      navigate(location.pathname + location.search + location.hash, {
        replace: true,
        state: Object.keys(newState).length > 0 ? newState : null
      });
    }
  };

  const toggleDrawer = () => {
    if (isDrawerOpen) {
      handleCloseDrawer();
    } else {
      setIsDrawerOpen(true);
    }
  };
  const toggleCalendar = () => setIsCalendarOpen(!isCalendarOpen);
  const closeDrawer = () => handleCloseDrawer();

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (location.pathname === path) {
      e.preventDefault();
      handleCloseDrawer();
    }
  };

  const handleBottomNavPress = (path: string) => {
    if (pendingBottomNavFrame.current !== null) {
      cancelAnimationFrame(pendingBottomNavFrame.current);
      pendingBottomNavFrame.current = null;
    }

    setOptimisticNavPath(path);
    if (location.pathname === path) return;

    pendingBottomNavFrame.current = requestAnimationFrame(() => {
      pendingBottomNavFrame.current = null;
      navigate(path);
    });
  };

  const returnToDrawer = () => {
    if (isReturningToDrawerRef.current) return;

    isReturningToDrawerRef.current = true;
    sessionStorage.setItem('openDrawerOnNextMount', 'true');
    sessionStorage.setItem('suppressHomeScrollRestoreOnce', 'true');
    setDisableDrawerTransition(true);
    lastDrawerOpenTime.current = Date.now();
    navigate(-1);
  };

  const handleAvatarClick = () => {
    // Let the route change close the drawer if it's a new page
    handleCloseDrawer();
    
    if (isLoggedIn) {
      navigate('/profile/edit');
    } else {
      navigate('/login');
    }
  };

  // Header 区域颜色
  const drawerHeaderColors = {
    bg: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? '#3A3A3C' : '#F2F2F7',
    appName: isDark ? '#F2F2F7' : '#1C1C1E',
    quote: isDark ? '#636366' : '#A1A1A6',
    avatarBg: isDark ? '#3A3A3C' : '#F2F2F7',
    avatarIcon: isDark ? '#8E8E93' : '#A1A1A6',
  };

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isDrawerOpen]);

  // Ensure drawer and menus map state on navigation without visual flash
  React.useLayoutEffect(() => {
    const state = location.state as any;
    const shouldOpenFromSession = sessionStorage.getItem('openDrawerOnNextMount') === 'true';
    if (shouldOpenFromSession) sessionStorage.removeItem('openDrawerOnNextMount');

    if (shouldOpenFromSession || (state && state.drawerOpen)) {
      setDisableDrawerTransition(true);
      setIsDrawerOpen(true);
      lastDrawerOpenTime.current = Date.now();
      if (shouldOpenFromSession) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      
      requestAnimationFrame(() => {
        if (shouldOpenFromSession) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
        requestAnimationFrame(() => {
          setDisableDrawerTransition(false);
        });
      });
    } else {
      setIsDrawerOpen(false);
    }
    setIsMenuOpen(false);
    setIsStyleSheetOpen(false);
    setOptimisticNavPath(location.pathname);
    isReturningToDrawerRef.current = false;
  }, [location.pathname, location.state]);

  useEffect(() => {
    return () => {
      if (pendingBottomNavFrame.current !== null) {
        cancelAnimationFrame(pendingBottomNavFrame.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isCalendarOpen) {
      diaryService.getActiveEntries().then(data => {
        const dates = new Set(data.map(j => format(parseDiaryDateKey(j.diaryDate), 'yyyy-MM-dd')));
        setJournalDates(dates);
      });
    }
  }, [isCalendarOpen]);

  const handleDragEnd = (e: any, info: any) => {
    if (info.offset.x > 50) {
      setCurrentMonth(subMonths(currentMonth, 1));
    } else if (info.offset.x < -50) {
      setCurrentMonth(addMonths(currentMonth, 1));
    }
  };

  const handleStyleChange = (style: ListStyle) => {
    setListStyle(style);
    localStorage.setItem('diary_list_style', style);
    setIsStyleSheetOpen(false);
  };

  const openInstallSheet = () => {
    if (!shouldShowPwaInstall) return;
    setInstallMessage('');
    setIsMenuOpen(false);
    setIsInstallSheetOpen(true);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2000);
  };

  useEffect(() => {
    if (!shouldShowApkUpdateNotice) {
      setIsUpdateNoticeOpen(false);
      setShowUpdateEntry(false);
      return;
    }

    let cancelled = false;

    getLatestRelease().then(release => {
      if (cancelled) return;

      setReleaseInfo(release);
      setShowUpdateEntry(shouldShowUpdateEntry(release));

      if (location.pathname === '/' && shouldAutoOpenUpdateNotice(release)) {
        setIsUpdateNoticeOpen(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldShowApkUpdateNotice, location.pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (isUpdateNoticeOpen) {
        setIsUpdateNoticeOpen(false);
        return;
      }

      if (isInstallSheetOpen) {
        setIsInstallSheetOpen(false);
        return;
      }

      if (isStyleSheetOpen) {
        setIsStyleSheetOpen(false);
        return;
      }

      if (isCalendarOpen) {
        setIsCalendarOpen(false);
        return;
      }

      if (isMenuOpen) {
        setIsMenuOpen(false);
        return;
      }

      if (isDrawerOpen) {
        handleCloseDrawer();
        return;
      }

      if (location.pathname !== '/') {
        if (canGoBack) {
          navigate(-1);
        } else {
          navigate('/', { replace: true });
        }
        return;
      }

      CapacitorApp.exitApp();
    });

    return () => {
      listener.then(handle => handle.remove()).catch(() => undefined);
    };
  }, [
    isCalendarOpen,
    isDrawerOpen,
    isInstallSheetOpen,
    isMenuOpen,
    isStyleSheetOpen,
    isUpdateNoticeOpen,
    location.pathname,
    navigate,
  ]);

  const openUpdateNotice = () => {
    setIsUpdateNoticeOpen(true);
  };

  const closeUpdateNotice = () => {
    markUpdateNoticePrompted(releaseInfo.version);
    setIsUpdateNoticeOpen(false);
    setShowUpdateEntry(shouldShowApkUpdateNotice && shouldShowUpdateEntry(releaseInfo));
  };

  const handleSkipRelease = () => {
    skipRelease(releaseInfo.version);
    setIsUpdateNoticeOpen(false);
    setShowUpdateEntry(shouldShowApkUpdateNotice && shouldShowUpdateEntry(releaseInfo));
  };

  const handleDownloadUpdate = () => {
    const url = getConfiguredDownloadUrl(releaseInfo);
    if (!url) {
      showToast('新版下载地址还没配置好，稍后再来看看。');
      return;
    }

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      setIsUpdateDownloading(true);
      downloadAndInstallApkUpdate(releaseInfo)
        .then(status => {
          if (status === 'permission_required') {
            showToast('请允许小象日志安装应用，再回到这里点一次下载新版');
            return;
          }
          showToast('安装包已准备好，请按系统提示完成安装');
        })
        .catch(error => {
          console.warn('Failed to start native APK update flow, falling back to browser download', error);
          showToast('应用内安装未启动，已为你打开浏览器下载');
          const opened = window.open(url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            window.location.href = url;
          }
        })
        .finally(() => {
          setIsUpdateDownloading(false);
        });
      return;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
  };

  const handleCloudManageClick = () => {
    showToast('云盘管理功能正在开发中，敬请期待～');
  };

  const handlePromptInstall = async () => {
    setInstallMessage('');
    if (!pwaInstall.canPromptInstall) {
      if (pwaInstall.installMode === 'browser-menu') {
        setInstallMessage(`请打开 ${pwaInstall.browserDisplayName} 菜单，选择“${pwaInstall.manualActionLabel}”，按提示完成添加。`);
        return;
      }

      setInstallMessage('当前浏览器暂未提供可靠的安装入口。可以先收藏本页，或复制链接到 Chrome / Edge 后再添加到手机。');
      return;
    }

    const outcome = await pwaInstall.promptInstall();
    if (outcome === 'accepted') {
      setInstallMessage('安装已开始，请按浏览器提示完成。');
      return;
    }
    if (outcome === 'dismissed') {
      setInstallMessage('你刚才取消了安装。可以点“重新检测”后再试一次，或按下方步骤手动添加。');
      return;
    }
    setInstallMessage('当前浏览器没有开放一键安装弹窗，请按下方步骤从浏览器菜单添加到手机。');
  };

  const handleRefreshInstall = async () => {
    await pwaInstall.refreshInstallState();
    setInstallMessage('已重新检测。若仍无法弹出一键安装，请刷新页面，或按下方步骤从浏览器菜单添加。');
  };

  const installIntroText = (() => {
    if (pwaInstall.installMode === 'prompt') {
      return '当前浏览器支持一键安装。删除旧图标后，可以在这里重新触发安装。';
    }

    if (pwaInstall.installMode === 'browser-menu') {
      return `${pwaInstall.browserDisplayName} 支持从浏览器菜单添加到手机。当前没有开放一键安装弹窗，请按下面步骤操作。`;
    }

    if (pwaInstall.installMode === 'unsupported') {
      return '当前环境暂不满足 PWA 添加条件。可以先收藏网页，或用 Chrome / Edge 打开后再添加到手机。';
    }

    return '当前浏览器的安装能力无法完全判断。可以先按下面步骤尝试添加，或复制链接到 Chrome / Edge 再试。';
  })();

  const installPrimaryLabel = pwaInstall.installMode === 'prompt'
    ? '立即安装'
    : `查看${pwaInstall.manualActionLabel}步骤`;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const navItems = [
    { path: '/', icon: BookOpen, label: '首页' },
    { path: '/community', icon: Compass, label: '日志圈' },
    { path: '/profile', icon: User, label: '我的' },
  ];

  const isMainTabRoute = ['/', '/community', '/profile'].includes(location.pathname);

  const styleOptions: { id: ListStyle; name: string; preview: string }[] = [
    { id: 'timeline', name: '时间轴模式', preview: 'bg-surface-container-high border-l-2 border-primary' },
    { id: 'card_flow', name: '卡片流模式', preview: 'bg-surface-container-high rounded-xl' },
    { id: 'briefing', name: '简报模式', preview: 'bg-surface-container-high border-b border-outline-variant/30' },
    { id: 'magazine', name: '杂志模式', preview: 'bg-surface-container-high rounded-xl overflow-hidden' },
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-secondary-container">
      {/* Paper Texture Overlay */}
      <div className="fixed inset-0 paper-texture z-[-1]"></div>

      {/* Top App Bar (Only on Home) */}
      {location.pathname === '/' && (
        <header 
          className="app-main-topbar app-safe-header sticky top-0 left-0 w-full z-40 flex items-center justify-between bg-surface/80 backdrop-blur-md"
        >
          <div className="flex items-center">
            <button 
              onClick={toggleDrawer}
              className="hover:bg-surface-container-high transition-colors duration-300"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
              }}
            >
              <Menu className="w-6 h-6 text-primary" />
            </button>
          </div>
          
          <div 
            onClick={toggleCalendar}
            className="flex items-center justify-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-lowest/50 cursor-pointer hover:bg-surface-container-lowest transition-all duration-300 active:scale-95 shadow-sm"
            style={{
              height: '36px',
              padding: '0 16px',
              minWidth: '72px',
            }}
          >
            <h1 className="font-headline font-medium tracking-tight text-base text-primary">
              {format(currentMonth, 'M月', { locale: zhCN })}
            </h1>
          </div>

          <div className="flex items-center gap-1 relative">
            <button 
              onClick={() => navigate('/search')}
              className="hover:bg-surface-container-high transition-colors duration-300"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
              }}
            >
              <Search className="w-5 h-5 text-primary" />
            </button>
            <button 
              onClick={() => navigate('/ai-chat')}
              className="hover:bg-surface-container-high transition-colors duration-300 relative group"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
              }}
            >
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="w-5 h-5 text-primary transition-transform duration-300 group-hover:scale-110"
              >
                {/* Floating small spark */}
                <path 
                  d="M6 3 C6 3.5 6.5 4 7 4 C6.5 4 6 4.5 6 5 C6 4.5 5.5 4 5 4 C5.5 4 6 3.5 6 3 Z" 
                  fill="currentColor" 
                  stroke="none" 
                  className="animate-pulse"
                  style={{ animationDelay: '0.8s', animationDuration: '3s' }}
                />
                
                {/* Letter A */}
                <path d="M4 20L9 7L14 20" />
                <path d="M5.5 15.5H12.5" />
                
                {/* Letter i */}
                <path d="M19 20V12" />
                
                {/* Sparkle replacing dot of 'i' */}
                <path 
                  d="M19 5 C19 6.5 20 7.5 21.5 7.5 C20 7.5 19 8.5 19 10 C19 8.5 18 7.5 16.5 7.5 C18 7.5 19 6.5 19 5 Z" 
                  fill="currentColor" 
                  stroke="none" 
                  className="animate-pulse" 
                  style={{ transformOrigin: '19px 7.5px', animationDuration: '2s' }}
                />
              </svg>
            </button>
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="hover:bg-surface-container-high transition-colors duration-300"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
              }}
            >
              <MoreVertical className="w-5 h-5 text-primary" />
            </button>

            {/* Floating Dropdown Menu */}
            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80]" 
                    onClick={() => setIsMenuOpen(false)}
                  ></motion.div>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute top-12 right-0 w-44 bg-surface-container-lowest rounded-2xl shadow-xl z-[90] py-1 border border-outline-variant/20 overflow-hidden origin-top-right"
                  >
                    <div className="flex flex-col">
                      <button 
                        onClick={() => { setIsMenuOpen(false); navigate('/settings'); }}
                        className="flex items-center px-4 py-3.5 hover:bg-surface-container active:bg-surface-container-high transition-colors duration-200"
                      >
                        <span className="font-headline text-[15px] text-on-surface">设置</span>
                      </button>
                      {shouldShowPwaInstall && !pwaInstall.isInstalled && (
                        <>
                          <div className="h-[1px] bg-outline-variant/20 mx-4"></div>
                          <button
                            onClick={openInstallSheet}
                            className="flex items-center px-4 py-3.5 hover:bg-surface-container active:bg-surface-container-high transition-colors duration-200"
                          >
                            <span className="font-headline text-[15px] text-on-surface">安装到桌面</span>
                          </button>
                        </>
                      )}
                      <div className="h-[1px] bg-outline-variant/20 mx-4"></div>
                      <button 
                        onClick={() => { setIsMenuOpen(false); setIsStyleSheetOpen(true); }}
                        className="flex items-center px-4 py-3.5 hover:bg-surface-container active:bg-surface-container-high transition-colors duration-200"
                      >
                        <span className="font-headline text-[15px] text-on-surface">列表样式</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </header>
      )}

      {shouldShowApkUpdateNotice && location.pathname === '/' && showUpdateEntry && (
        <div className="app-main-topbar sticky top-[var(--app-total-header-height)] z-30 bg-surface/85 pb-2 backdrop-blur-md">
          <button
            type="button"
            onClick={openUpdateNotice}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-primary/15 bg-surface-container-lowest/90 px-4 py-3 text-left shadow-[0_8px_24px_rgba(68,103,51,0.08)] active:scale-[0.99] transition-transform"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/20">
              <img
                src="/icons/xiaoxiang-pwa-512.png"
                alt="小象日志"
                className="h-full w-full object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-on-surface">发现新版本 {releaseInfo.version}</span>
              <span className="block truncate text-xs leading-5 text-on-surface-variant">查看更新内容和修复说明</span>
            </span>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white">更新</span>
          </button>
        </div>
      )}

      {/* Calendar Overlay */}
      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center"
            style={{ paddingTop: 'calc(var(--app-total-header-height) + 16px)' }}
          >
            <div 
              className="absolute inset-0 bg-on-surface/20 -z-10"
              onClick={toggleCalendar}
            ></div>
            <motion.div 
              initial={{ y: -20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-[90%] max-w-md bg-surface-container-lowest rounded-2xl shadow-[0_20px_40px_rgba(47,52,46,0.06)] p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-lg font-medium tracking-tight">{format(currentMonth, 'yyyy年M月', { locale: zhCN })}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-7 mb-2">
                <div className="text-center text-xs text-on-surface-variant py-2">一</div>
                <div className="text-center text-xs text-on-surface-variant py-2">二</div>
                <div className="text-center text-xs text-on-surface-variant py-2">三</div>
                <div className="text-center text-xs text-on-surface-variant py-2">四</div>
                <div className="text-center text-xs text-on-surface-variant py-2">五</div>
                <div className="text-center text-xs text-on-surface-variant py-2">六</div>
                <div className="text-center text-xs text-on-surface-variant py-2 text-error/60">日</div>
              </div>
              
              <motion.div 
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className="grid grid-cols-7 gap-y-1"
              >
                {days.map(day => {
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);
                  const hasEntry = journalDates.has(format(day, 'yyyy-MM-dd'));
                  const isCurrentMonth = isSameMonth(day, currentMonth);

                  return (
                    <div 
                      key={day.toString()} 
                      className="h-12 flex flex-col items-center justify-center relative cursor-pointer"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDate(null);
                        } else {
                          setSelectedDate(day);
                        }
                        setIsCalendarOpen(false);
                      }}
                    >
                      {isSelected && <div className="absolute inset-0 m-1.5 bg-primary rounded-full"></div>}
                      {!isSelected && isTodayDate && <div className="absolute inset-0 m-1.5 bg-primary-container rounded-full"></div>}
                      
                      <span className={cn(
                        "text-sm relative z-10",
                        !isCurrentMonth && "text-outline-variant/40",
                        isSelected && "text-on-primary",
                        !isSelected && isTodayDate && "text-on-primary-container font-bold"
                      )}>
                        {format(day, 'd')}
                      </span>
                      
                      {hasEntry && (
                        <div className={cn(
                          "w-1 h-1 rounded-full mt-0.5 relative z-10",
                          isSelected ? "bg-on-primary/60" : "bg-primary/40"
                        )}></div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawer Overlay */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-on-surface/20 z-50 md:hidden animate-in fade-in duration-300"
          onClick={(e) => {
            // Prevent ghost clicks
            if (Date.now() - lastDrawerOpenTime.current < 400) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            toggleDrawer();
          }}
          onTouchMove={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
        ></div>
      )}

      {/* Navigation Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[60] w-72 h-full rounded-r-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col ease-in-out",
        !disableDrawerTransition && "transition-transform duration-500",
        isDrawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )} style={{ 
        backgroundColor: drawerHeaderColors.bg, 
        borderRight: `1px solid ${drawerHeaderColors.border}`,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch'
      }}>
        
        {/* 抽屉顶部 Header 区域 */}
        <div style={{
          padding: 'calc(var(--app-safe-top) + 28px) 20px 20px',
          borderBottom: `1px solid ${drawerHeaderColors.border}`,
          marginBottom: '8px',
        }}>

          {/* 第一行：APP名称 + 头像 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}>

            {/* 左侧：APP名称 */}
            <span style={{
              fontSize: '20px',
              fontWeight: '700',
              color: drawerHeaderColors.appName,
              fontFamily: 'inherit',
              letterSpacing: '-0.3px',
            }}>
              小象日志
            </span>

            {/* 右侧：头像按钮 */}
            <button
              onClick={handleAvatarClick}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: drawerHeaderColors.avatarBg,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isLoggedIn ? (
                <UserAvatar
                  userId={user?.userId}
                  src={user?.avatarUrl}
                  name={user?.nickname || '我'}
                  className="w-11 h-11 rounded-full"
                  fallbackClassName="bg-[#E8F0E3] flex items-center justify-center text-[#446733]"
                />
              ) : (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '26px', color: drawerHeaderColors.avatarIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <User size={26} />
                </span>
              )}
            </button>

          </div>

          {/* 第二行：每日寄语 */}
          <p style={{
            fontSize: '12px',
            color: drawerHeaderColors.quote,
            fontStyle: 'italic',
            lineHeight: '1.5',
            margin: 0,
            paddingRight: '48px',  // 不与头像重叠
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            "{getDailyQuote()}"
          </p>

        </div>

        <nav 
          className="flex flex-col gap-1 overflow-y-auto pr-6 py-2"
          onTouchMove={(e) => e.stopPropagation()}
        >
          <Link to="/gallery" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/gallery')} className="flex items-center gap-4 text-on-surface px-10 py-3.5 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <ImageIcon className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span>图库</span>
          </Link>
          <Link to="/walk" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/walk')} className="flex items-center gap-4 text-on-surface px-10 py-3.5 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <Footprints className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span>漫步</span>
          </Link>
          <Link to="/on-this-day" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/on-this-day')} className="flex items-center gap-4 text-on-surface px-10 py-3.5 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <History className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span>那年今日</span>
          </Link>

          <div className="my-6 mx-10 h-px bg-outline-variant/20"></div>

          <button onClick={toggleTheme} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            {isDark ? (
              <Sun className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            ) : (
              <Moon className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            )}
            <span className="text-[15px]">{isDark ? '日间模式' : '夜间模式'}</span>
            {isDark && <span className="ml-auto text-[13px] text-outline-variant pr-4">开启中</span>}
          </button>
          <button onClick={handleCloudManageClick} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <Cloud className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span className="text-[15px]">云盘管理</span>
          </button>
          {shouldShowPwaInstall && !pwaInstall.isInstalled && (
            <button onClick={openInstallSheet} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
              <Download className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
              <span className="text-[15px]">安装到桌面</span>
            </button>
          )}
          <Link to="/trash" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/trash')} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <Trash2 className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span className="text-[15px]">回收站</span>
          </Link>
          <Link to="/settings" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/settings')} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <Settings className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span className="text-[15px]">设置</span>
          </Link>
          <Link to="/help" state={{ fromDrawer: true }} onClick={(e) => handleNavClick(e, '/help')} className="flex items-center gap-4 text-on-surface px-10 py-3 hover:bg-surface-container-high rounded-r-full transition-all duration-300 group">
            <HelpCircle className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
            <span className="text-[15px]">帮助</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "app-route-scrollport md:ml-[var(--app-sidebar-width)] transition-all duration-500 flex flex-col relative",
        location.pathname === '/'
          ? "h-[calc(100dvh-var(--app-total-header-height))] overflow-hidden"
          : isMainTabRoute
            ? "h-dvh overflow-hidden"
            : "min-h-screen"
      )}>
        <div className="min-h-0 flex-1 w-full flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={false}
              animate={{ x: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-0 flex-1 flex flex-col bg-surface"
            >
              <Outlet context={{ selectedDate, listStyle, isDrawerOpen, openDrawer: () => setIsDrawerOpen(true), closeDrawer: handleCloseDrawer, toggleDrawer, returnToDrawer }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* List Style Bottom Sheet */}
      <AnimatePresence>
        {isStyleSheetOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" 
            onClick={() => setIsStyleSheetOpen(false)}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-surface w-full max-w-md rounded-t-3xl flex flex-col overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full"></div>
              </div>
              <div className="flex items-center justify-between px-6 py-2 border-b border-surface-container-high">
                <h3 className="font-headline font-semibold text-lg text-on-surface">列表样式</h3>
                <button onClick={() => setIsStyleSheetOpen(false)} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                {styleOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleStyleChange(option.id)}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200",
                      listStyle === option.id 
                        ? "border-primary bg-primary/5" 
                        : "border-surface-container hover:border-primary/30 hover:bg-surface-container-low"
                    )}
                  >
                    <div className={cn("w-full h-20 flex items-center justify-center", option.preview)}>
                      {/* Abstract preview shapes */}
                      <div className="w-3/4 h-1/2 bg-outline-variant/20 rounded"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[15px]">{option.name}</span>
                      {listStyle === option.id && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Bottom Sheet */}
      <AnimatePresence>
        {shouldShowPwaInstall && isInstallSheetOpen && !pwaInstall.isInstalled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40"
            onClick={() => setIsInstallSheetOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-surface w-full max-w-md rounded-t-3xl flex flex-col overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full"></div>
              </div>
              <div className="flex items-center justify-between px-6 py-2 border-b border-surface-container-high">
                <h3 className="font-headline font-semibold text-lg text-on-surface">安装到桌面</h3>
                <button onClick={() => setIsInstallSheetOpen(false)} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm leading-6 text-on-surface-variant">
                  {installIntroText}
                </div>

                {installMessage && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-on-surface">
                    {installMessage}
                  </div>
                )}

                <div className="space-y-2">
                  {pwaInstall.manualSteps.map((step, index) => (
                    <div key={step} className="flex gap-3 text-sm leading-6 text-on-surface">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-white">{index + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1">
                  <button
                    onClick={handlePromptInstall}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white active:scale-[0.98] transition-transform"
                  >
                    <Download className="w-4 h-4" />
                    {installPrimaryLabel}
                  </button>
                  <button
                    onClick={handleRefreshInstall}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-surface-container px-4 py-3 text-sm font-medium text-primary active:scale-[0.98] transition-transform"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新检测安装状态
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Notice Modal */}
      <AnimatePresence>
        {shouldShowApkUpdateNotice && isUpdateNoticeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 px-3 pb-0 pt-[calc(var(--app-safe-top)+12px)] backdrop-blur-sm sm:items-center sm:p-6"
            onClick={closeUpdateNotice}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 24 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex max-h-[min(86vh,720px)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4 sm:px-6">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-lowest shadow-[0_8px_20px_rgba(68,103,51,0.16)] ring-1 ring-outline-variant/20">
                  <img
                    src="/icons/xiaoxiang-pwa-512.png"
                    alt="小象日志"
                    className="h-full w-full object-cover"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-xl font-semibold text-on-surface">发现新版本</h2>
                  <p className="mt-0.5 text-sm text-on-surface-variant">小象日志 {releaseInfo.version}</p>
                </div>
                <button
                  type="button"
                  onClick={closeUpdateNotice}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                  aria-label="关闭更新公告"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-4">
                  <div>
                    <div className="text-base font-semibold text-primary">v{releaseInfo.version}</div>
                    <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                      当前版本 v{currentVersion}，新版本已准备好。发布日期：{releaseInfo.releasedAt}
                    </p>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl bg-primary-container/50 px-4 py-3 text-primary">
                    <Check className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium leading-6">v{releaseInfo.version} 已可下载，安装后即可体验新版。</p>
                  </div>

                  <div className="h-px bg-outline-variant/20"></div>

                  <section>
                    <h3 className="text-base font-semibold text-on-surface">更新内容</h3>
                    <div className="mt-3 space-y-3">
                      {releaseInfo.highlights.map(item => (
                        <div key={item} className="flex gap-3 text-sm leading-6 text-on-surface">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-base font-semibold text-on-surface">修复内容</h3>
                    <div className="mt-3 space-y-3">
                      {releaseInfo.fixes.map(item => (
                        <div key={item} className="flex gap-3 text-sm leading-6 text-on-surface">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-outline"></span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-outline-variant/15 bg-surface-container-low/80 px-5 py-4 sm:grid-cols-[1fr_1.15fr_1.35fr] sm:px-6">
                <button
                  type="button"
                  onClick={closeUpdateNotice}
                  className="rounded-2xl bg-surface-container-lowest px-4 py-3 text-sm font-medium text-on-surface shadow-sm active:scale-[0.98] transition-transform"
                >
                  稍后
                </button>
                <button
                  type="button"
                  onClick={handleSkipRelease}
                  className="rounded-2xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm font-medium text-on-surface-variant active:scale-[0.98] transition-transform"
                >
                  跳过此版本
                </button>
                <button
                  type="button"
                  onClick={handleDownloadUpdate}
                  disabled={isUpdateDownloading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(68,103,51,0.22)] transition-transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                >
                  {isUpdateDownloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isUpdateDownloading ? '正在准备安装包' : '下载新版'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (only on home) */}
      {location.pathname === '/' && (
        <button 
          onClick={() => {
            sessionStorage.removeItem('timeline_scroll');
            navigate('/editor');
          }}
          className="app-desktop-fab fixed bottom-28 right-6 w-14 h-14 rounded-2xl bg-primary text-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] flex items-center justify-center hover:bg-primary-dim active:scale-90 transition-all z-[40]"
          style={{ bottom: 'calc(7rem + var(--app-safe-bottom))' }}
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      {/* Bottom Navigation Bar */}
      {isMainTabRoute && (
        <nav 
          className="fixed bottom-0 left-0 w-full md:left-[var(--app-sidebar-width)] md:w-[calc(100%-var(--app-sidebar-width))] flex justify-around items-center px-4 bg-surface/90 backdrop-blur-xl z-50 rounded-t-[24px] shadow-[0_-10px_40px_rgba(0,0,0,0.03)] border-t border-outline-variant/10"
          style={{ paddingTop: '6px', paddingBottom: 'var(--app-safe-bottom)' }}
        >
          {navItems.map((item) => {
            const isActive = optimisticNavPath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  handleBottomNavPress(item.path);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  handleBottomNavPress(item.path);
                }}
                className={cn(
                  "flex flex-col items-center justify-center px-5 py-1 transition-colors duration-100",
                  isActive ? "text-primary" : "text-outline hover:text-primary"
                )}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon className={cn("w-[22px] h-[22px] mb-[2px]", isActive && "stroke-[2.25]")} />
                <span className="font-sans font-normal text-[11px] tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <AppToast message={toastMessage} />
    </div>
  );
}
