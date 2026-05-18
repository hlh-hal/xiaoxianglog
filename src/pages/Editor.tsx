import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { stripAllMarkdown } from '../lib/utils';
import { Check, Share, Copy, MoreVertical, Image as ImageIcon, Undo, Redo, Highlighter, Bold, Quote, List, ListOrdered, X, ArrowLeft, Trash2, History, FileText, XCircle, ChevronRight, Plus, Star, Download, Palette } from 'lucide-react';
import { diaryService, DiaryEntry, DiaryTemplate, EditHistory } from '../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { TextSelection } from '@tiptap/pm/state';
import BackgroundSelector from '../components/BackgroundSelector';
import { getThemeById, calculateContrastColor } from '../config/themes';
import { ShareCard } from '../components/ShareCard';
import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import { useTheme } from '../contexts/ThemeContext';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeModernColors, measureExportCard, pickExportScale, decodeErrorReason } from '../utils/exportImage';
import { DiaryTheme, allThemes } from '../types/theme';
import { api, getAccessToken } from '../services/apiClient';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'motion/react';
import ImageViewer from '../components/ImageViewer';
import { SafeImage } from '../components/SafeImage';

export const DiaryExportCard = ({ entry, theme, htmlContent, images }: { entry: DiaryEntry | { diaryDate: number }, theme: DiaryTheme, htmlContent: string, images: string[] }) => {
  const date = new Date(entry.diaryDate);
  const day = date.getDate();
  const yearMonth = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}`;
  const weekDay = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][date.getDay()];

  const [topBgUrl, setTopBgUrl] = useState<string | null>(null);
  const [middleBgUrl, setMiddleBgUrl] = useState<string | null>(null);
  const [bottomBgUrl, setBottomBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!theme.backgroundImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Important for html2canvas to not taint
    img.onload = () => {
      // 提升渲染精度，满足导出时 scale: 3 的高清要求
      const renderScale = 3;
      const targetW = 375 * renderScale;
      const targetH = 812 * renderScale;
      
      // Compute cover metrics (to perfectly match CSS backgroundSize: cover, backgroundPosition: top center)
      const scale = Math.max(targetW / img.width, targetH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offsetX = (targetW - drawW) / 2;
      const offsetY = 0; // top center

      // 1. First render exactly how CSS 'cover' + 'top center' would render it on an 812px height screen
      const coverCanvas = document.createElement('canvas');
      coverCanvas.width = targetW;
      coverCanvas.height = targetH;
      const coverCtx = coverCanvas.getContext('2d');
      if (!coverCtx) return;
      coverCtx.imageSmoothingQuality = 'high';
      coverCtx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // --- Top Slice ---
      const topCanvas = document.createElement('canvas');
      const startSrcYTop = 0;
      const endSrcYTop = 350 * renderScale;
      const heightTop = endSrcYTop - startSrcYTop;
      topCanvas.width = targetW;
      topCanvas.height = heightTop;
      const topCtx = topCanvas.getContext('2d');
      if (topCtx) {
        topCtx.imageSmoothingQuality = 'high';
        topCtx.drawImage(coverCanvas, 0, startSrcYTop, targetW, heightTop, 0, 0, targetW, heightTop);
        setTopBgUrl(topCanvas.toDataURL('image/jpeg', 0.95)); // Use JPG for top/bottom to save memory
      }

      // --- Bottom Slice ---
      const bottomCanvas = document.createElement('canvas');
      const startSrcYBottom = targetH - 350 * renderScale;
      const endSrcYBottom = targetH;
      const heightBottom = endSrcYBottom - startSrcYBottom;
      bottomCanvas.width = targetW;
      bottomCanvas.height = heightBottom;
      const bottomCtx = bottomCanvas.getContext('2d');
      if (bottomCtx) {
        bottomCtx.imageSmoothingQuality = 'high';
        bottomCtx.drawImage(coverCanvas, 0, startSrcYBottom, targetW, heightBottom, 0, 0, targetW, heightBottom);
        setBottomBgUrl(bottomCanvas.toDataURL('image/jpeg', 0.95));
      }

      // --- Middle Slice ---
      const sliceCanvas = document.createElement('canvas');
      const startSrcY = 350 * renderScale;
      const endSrcY = 462 * renderScale;
      const srcHeight = endSrcY - startSrcY;
      
      sliceCanvas.width = targetW;
      sliceCanvas.height = srcHeight * 2;
      const sliceCtx = sliceCanvas.getContext('2d');
      if (sliceCtx) {
        sliceCtx.imageSmoothingQuality = 'high';
        // 正向绘制
        sliceCtx.drawImage(coverCanvas, 0, startSrcY, targetW, srcHeight, 0, 0, targetW, srcHeight + 1);
        // 垂直镜像绘制，实现无缝
        sliceCtx.save();
        sliceCtx.translate(0, srcHeight * 2);
        sliceCtx.scale(1, -1);
        sliceCtx.drawImage(coverCanvas, 0, startSrcY, targetW, srcHeight, 0, 0, targetW, srcHeight + 1);
        sliceCtx.restore();
        setMiddleBgUrl(sliceCanvas.toDataURL('image/png'));
      }
    };
    img.src = theme.backgroundImage;
  }, [theme.backgroundImage]);

  const isReady = !theme.backgroundImage || (middleBgUrl !== null && topBgUrl !== null && bottomBgUrl !== null);

  return (
    <div
      id="diary-export-card"
      data-ready={isReady ? "true" : "false"}
      style={{
        width: '375px',
        minHeight: '812px',
        position: 'relative',
        backgroundColor: theme.backgroundImage ? 'transparent' : (theme.backgroundColor || '#FAF9F5'),
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 分离式的和谐背景层构建，确保不会因拉伸产生割裂感 */}
      {theme.backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          display: 'flex', flexDirection: 'column'
        }}>
          {/* 顶部原始图景 */}
          <div style={{
            height: '350px',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: topBgUrl ? `url(${topBgUrl})` : 'none',
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}/>
          </div>
          {/* 中间重复平铺镜像切片，实现真正的平铺和谐连续，无论多长都不会有割裂或拉伸变形 */}
          <div style={{
            flex: 1,
            marginTop: '-1px',
            marginBottom: '-1px',
            backgroundImage: middleBgUrl ? `url(${middleBgUrl})` : 'none',
            backgroundSize: '100% auto',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'top center',
            position: 'relative',
            zIndex: 0,
          }} />
          {/* 底部原始图景 */}
          <div style={{
            height: '350px',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: bottomBgUrl ? `url(${bottomBgUrl})` : 'none',
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}/>
          </div>
        </div>
      )}

      {/* 背景叠加层 */}
      {theme.backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          backgroundColor: theme.paperOverlay || 'transparent',
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1, flex: 1,
        display: 'flex', flexDirection: 'column' }}>

        {/* 日期区域 */}
        <div style={{ textAlign: 'center', paddingTop: '12px', paddingBottom: '20px' }}>
          <div style={{
            display: 'block',
            fontSize: '72px',
            fontWeight: '900',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: theme.textColor,
            lineHeight: '1',
            marginBottom: '24px',
          }}>
            {day}
          </div>
          <div style={{
            fontSize: '15px',
            color: theme.secondaryColor,
            marginTop: '0px',
            letterSpacing: '1px',
          }}>
            {yearMonth}
          </div>
          <div style={{
            fontSize: '13px',
            color: theme.secondaryColor,
            marginTop: '6px',
            opacity: 0.8,
          }}>
            {weekDay}
          </div>

          {/* 短分割线 */}
          <div style={{
            width: 44,
            height: 1,
            backgroundColor: theme.backgroundImage ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.15)',
            margin: '20px auto 0 auto',
            borderRadius: 1,
          }} />
        </div>

        {/* 正文内容 */}
        <div style={{
          flex: 1,
          padding: '0 32px',
          color: theme.textColor,
        }}>
          <div 
            className={`ProseMirror prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary max-w-none text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${theme.textColor.toLowerCase() === '#ffffff' ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`}
            style={{ 
               fontFamily: 'var(--diary-font-family)',
               color: 'inherit',
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
          />
        </div>

        {/* 图片区域（有图时显示） */}
        {images.length > 0 && (
          <div style={{
            padding: '32px 32px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
          }}>
            {images.slice(0, 4).map((src, i) => (
              <div key={i} style={{
                borderRadius: '12px',
                aspectRatio: '1/1',
                backgroundImage: `url(${src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }} />
            ))}
          </div>
        )}

        {/* 底部品牌栏 */}
        <div style={{
          padding: '24px 32px 32px',
          marginTop: '40px',
          borderTop: `1px solid ${theme.backgroundImage
            ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '15px',
            fontWeight: '600',
            color: theme.textColor,
            letterSpacing: '1px',
          }}>
            小象日志
          </span>
          <span style={{
            fontSize: '12px',
            color: theme.secondaryColor,
            opacity: 0.7,
            letterSpacing: '1px',
          }}>
            记录生活的美好
          </span>
        </div>

      </div>
    </div>
  );
};

const SYSTEM_TEMPLATE = "## 开心的事：\n\n## 充实的事：\n\n## 感谢的人：\n\n## 改进的事：\n\n## 今日思考：\n\n";

export default function Editor() {
  const navigate = useNavigate();
  const location = useLocation();
  const keyboardInset = useKeyboardInset();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [existingJournal, setExistingJournal] = useState<DiaryEntry | null>(null);
  
  const [content, setContent] = useState('');
  const [updateTick, setUpdateTick] = useState(0);
  const hasUnsavedChanges = useRef(false);
  const [images, setImages] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(!id);
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);
  const isEditingRef = useRef(!id);
  const suppressNextEditorClickRef = useRef(false);
  const tapScrollLockRef = useRef<{
    scrollTop: number;
    scrollLeft: number;
    windowScrollX: number;
    windowScrollY: number;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    frame: number | null;
    releaseTimer: number | null;
  } | null>(null);
  const inputScrollLockRef = useRef<{
    scrollTop: number;
    scrollLeft: number;
    windowScrollX: number;
    windowScrollY: number;
    frame: number | null;
    timers: number[];
    remainingFrames: number;
  } | null>(null);

  // Menu and Modals State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAbandonConfirmOpen, setIsAbandonConfirmOpen] = useState(false);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [isBackgroundSelectorOpen, setIsBackgroundSelectorOpen] = useState(false);
  const [backgroundId, setBackgroundId] = useState<string | undefined>(undefined);
  
  // Theme Customization State
  const { isDark } = useTheme();
  const [showThemeBar, setShowThemeBar] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<DiaryTheme | null>(null);
  const [prevTheme, setPrevTheme] = useState<DiaryTheme | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [fixedViewportHeight, setFixedViewportHeight] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight : 0
  ));
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const previewHashActive = location.hash === '#preview';
  const [displayIndex, setDisplayIndex] = useState<number | null>(null);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const isNavigatingToPreview = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const restoreTapScrollLock = useCallback(() => {
    const lock = tapScrollLockRef.current;
    const scrollEl = editorScrollRef.current;
    if (!lock || !scrollEl) return;

    if (scrollEl.scrollTop !== lock.scrollTop) {
      scrollEl.scrollTop = lock.scrollTop;
    }
    if (scrollEl.scrollLeft !== lock.scrollLeft) {
      scrollEl.scrollLeft = lock.scrollLeft;
    }
    if (window.scrollX !== lock.windowScrollX || window.scrollY !== lock.windowScrollY) {
      window.scrollTo(lock.windowScrollX, lock.windowScrollY);
    }
  }, []);

  const restoreInputScrollLock = useCallback(() => {
    const lock = inputScrollLockRef.current;
    const scrollEl = editorScrollRef.current;
    if (!lock || !scrollEl) return;

    if (scrollEl.scrollTop !== lock.scrollTop) {
      scrollEl.scrollTop = lock.scrollTop;
    }
    if (scrollEl.scrollLeft !== lock.scrollLeft) {
      scrollEl.scrollLeft = lock.scrollLeft;
    }
    if (window.scrollX !== lock.windowScrollX || window.scrollY !== lock.windowScrollY) {
      window.scrollTo(lock.windowScrollX, lock.windowScrollY);
    }
  }, []);

  const stopInputScrollLock = useCallback(() => {
    const lock = inputScrollLockRef.current;
    if (!lock) return;

    if (lock.frame !== null) {
      window.cancelAnimationFrame(lock.frame);
    }
    lock.timers.forEach(timer => window.clearTimeout(timer));
    inputScrollLockRef.current = null;
  }, []);

  const lockScrollForEditorInput = useCallback(() => {
    if (!isEditingRef.current) return;

    const scrollEl = editorScrollRef.current;
    if (!scrollEl) return;

    let lock = inputScrollLockRef.current;
    if (!lock) {
      lock = {
        scrollTop: scrollEl.scrollTop,
        scrollLeft: scrollEl.scrollLeft,
        windowScrollX: window.scrollX,
        windowScrollY: window.scrollY,
        frame: null,
        timers: [],
        remainingFrames: 12,
      };
      inputScrollLockRef.current = lock;
    } else {
      if (lock.frame !== null) {
        window.cancelAnimationFrame(lock.frame);
      }
      lock.timers.forEach(timer => window.clearTimeout(timer));
      lock.timers = [];
      lock.remainingFrames = 12;
    }

    const restoreFrame = () => {
      const activeLock = inputScrollLockRef.current;
      if (!activeLock) return;

      restoreInputScrollLock();
      activeLock.remainingFrames -= 1;

      if (activeLock.remainingFrames > 0) {
        activeLock.frame = window.requestAnimationFrame(restoreFrame);
      } else {
        activeLock.frame = null;
      }
    };

    restoreInputScrollLock();
    lock.frame = window.requestAnimationFrame(restoreFrame);
    lock.timers = [40, 100, 180, 320, 520].map(delay => (
      window.setTimeout(() => {
        restoreInputScrollLock();
      }, delay)
    ));
    lock.timers.push(window.setTimeout(() => {
      stopInputScrollLock();
    }, 720));
  }, [restoreInputScrollLock, stopInputScrollLock]);

  const stopTapScrollLock = useCallback(() => {
    const lock = tapScrollLockRef.current;
    if (!lock) return;

    if (lock.frame !== null) {
      window.cancelAnimationFrame(lock.frame);
    }
    if (lock.releaseTimer !== null) {
      window.clearTimeout(lock.releaseTimer);
    }
    tapScrollLockRef.current = null;
  }, []);

  const startTapScrollLock = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!isEditingRef.current) return;

    const target = e.target as HTMLElement;
    if (target.closest('button,a,input,textarea,select,[role="button"]')) return;

    const scrollEl = editorScrollRef.current;
    if (!scrollEl) return;

    stopTapScrollLock();

    tapScrollLockRef.current = {
      scrollTop: scrollEl.scrollTop,
      scrollLeft: scrollEl.scrollLeft,
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      frame: null,
      releaseTimer: null,
    };

    const lockFrame = () => {
      const lock = tapScrollLockRef.current;
      if (!lock) return;
      restoreTapScrollLock();
      lock.frame = window.requestAnimationFrame(lockFrame);
    };

    tapScrollLockRef.current.frame = window.requestAnimationFrame(lockFrame);
  }, [restoreTapScrollLock, stopTapScrollLock]);

  const updateTapScrollLockMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const lock = tapScrollLockRef.current;
    if (!lock || lock.pointerId !== e.pointerId) return;

    if (Math.hypot(e.clientX - lock.startX, e.clientY - lock.startY) > 4) {
      lock.moved = true;
      stopInputScrollLock();
      stopTapScrollLock();
    }
  }, [stopInputScrollLock, stopTapScrollLock]);

  const releaseTapScrollLock = useCallback((delay = 500) => {
    const lock = tapScrollLockRef.current;
    if (!lock) return;

    if (lock.releaseTimer !== null) {
      window.clearTimeout(lock.releaseTimer);
    }

    lock.releaseTimer = window.setTimeout(() => {
      stopTapScrollLock();
    }, delay);
  }, [stopTapScrollLock]);

  const focusEditorAtPointWithoutScroll = useCallback((clientX: number, clientY: number) => {
    const editor = editorInstanceRef.current;
    const view = editor?.view;
    if (!view) return false;

    const scrollEl = editorScrollRef.current;
    const scrollTop = scrollEl?.scrollTop ?? 0;
    const scrollLeft = scrollEl?.scrollLeft ?? 0;
    const position = view.posAtCoords({ left: clientX, top: clientY });

    if (position) {
      const safePos = Math.max(0, Math.min(position.pos, view.state.doc.content.size));
      const selection = TextSelection.near(view.state.doc.resolve(safePos));
      view.dispatch(view.state.tr.setSelection(selection));
    }

    view.focus();

    if (scrollEl) {
      scrollEl.scrollTop = scrollTop;
      scrollEl.scrollLeft = scrollLeft;
    }
    restoreTapScrollLock();

    return Boolean(position);
  }, [restoreTapScrollLock]);

  const finishTapScrollLock = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const lock = tapScrollLockRef.current;
    if (!lock || lock.pointerId !== e.pointerId || lock.moved) return false;

    const target = e.target as HTMLElement;
    const editorEl = e.currentTarget.querySelector('.ProseMirror');
    const isEditorTap = Boolean(editorEl?.contains(target));
    const isBlankSurfaceTap = target === e.currentTarget || target.dataset.editorBlankSurface === 'true';

    if (!isEditorTap && !isBlankSurfaceTap) {
      releaseTapScrollLock(120);
      return false;
    }

    e.preventDefault();
    e.stopPropagation();
    suppressNextEditorClickRef.current = true;
    restoreTapScrollLock();

    const editor = editorInstanceRef.current;
    if (isEditorTap) {
      focusEditorAtPointWithoutScroll(e.clientX, e.clientY);
    } else {
      editor?.view.focus();
      restoreTapScrollLock();
    }

    releaseTapScrollLock(600);
    return true;
  }, [focusEditorAtPointWithoutScroll, releaseTapScrollLock, restoreTapScrollLock]);

  useEffect(() => () => {
    stopInputScrollLock();
    stopTapScrollLock();
  }, [stopInputScrollLock, stopTapScrollLock]);

  useEffect(() => {
    if (!previewHashActive) {
      if (displayIndex !== null) setDisplayIndex(null);
      if (previewImage !== null) setPreviewImage(null);
      isNavigatingToPreview.current = false;
    }
  }, [previewHashActive]);

  const openPreview = (index: number) => {
    if (displayIndex === index) return;
    setDisplayIndex(index);
    setNextIndex(null);
    setIsCrossfading(false);
    
    if (location.hash !== '#preview' && !isNavigatingToPreview.current) {
      isNavigatingToPreview.current = true;
      navigate('#preview');
    }
  };

  const closePreview = () => {
    if (location.hash === '#preview') {
      navigate(-1);
    } else {
      setDisplayIndex(null);
      setPreviewImage(null);
    }
  };

  const handleImageViewerChange = (idx: number) => {
    setDisplayIndex(idx);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let lastWidth = window.innerWidth;
      setFixedViewportHeight(window.innerHeight);

      const handleResize = () => {
        // 如果宽度改变（比如横竖屏切换），才更新高度；单纯高度缩小（比如弹窗输入法）不更新
        if (window.innerWidth !== lastWidth) {
          lastWidth = window.innerWidth;
          setFixedViewportHeight(window.innerHeight);
        }
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const selectTheme = async (theme: DiaryTheme) => {
    if (theme.id === selectedTheme?.id) return;
    
    // Preload image
    if (theme.backgroundImage) {
      const img = new Image();
      img.src = theme.backgroundImage;
    }

    setPrevTheme(selectedTheme);
    setSelectedTheme(theme);
    setTransitioning(true);
    hasUnsavedChanges.current = true;
    
    // Save as last used theme for new diaries
    localStorage.setItem('lastUsedDiaryThemeId', theme.id);

    if (existingJournal) {
      await diaryService.updateEntry(existingJournal.id, { themeId: theme.id });
    }

    setTimeout(() => {
      setPrevTheme(null);
      setTransitioning(false);
    }, 500);
  };

  // Templates State
  const [templates, setTemplates] = useState<DiaryTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'system' | 'custom'>('system');
  const [preferredTemplateId, setPreferredTemplateId] = useState<string | null>(localStorage.getItem('preferredTemplateId'));
  
  // Template Editor State
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ title: '', content: '' });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Long Press State
  const isLongPress = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (id: string) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (window.confirm('确认删除此模板？')) {
        diaryService.deleteTemplate(id).then(() => {
          setTemplates(prev => prev.filter(t => t.id !== id));
          if (preferredTemplateId === id) {
            setPreferredTemplateId(null);
            localStorage.removeItem('preferredTemplateId');
          }
        });
      }
    }, 800);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  // History State
  const [historyList, setHistoryList] = useState<EditHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<EditHistory | null>(null);

  // Auto-save history: periodic snapshots to prevent data loss
  const lastHistoryContentRef = useRef<string>('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const [exporting, setExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const saveToLocal = async () => {
    setShowShare(false);
    setExporting(true);

    const currentTheme = selectedTheme || allThemes[0];
    
    let htmlContent = '';
    if (editor) {
      htmlContent = editor.getHTML();
    } else {
      htmlContent = content;
    }

    // 临时挂载到 body
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:0;left:-9999px;z-index:-1;pointer-events:none;';
    document.body.appendChild(wrapper);

    // 用 ReactDOM 渲染导出卡片
    const root = createRoot(wrapper);
    root.render(
      <DiaryExportCard 
        entry={existingJournal || { diaryDate: displayDate.getTime() }} 
        theme={currentTheme} 
        htmlContent={htmlContent}
        images={images}
      />
    );

    // 等待 React 渲染
    await new Promise(r => setTimeout(r, 100));

    try {
      const el = wrapper.querySelector('#diary-export-card') as HTMLElement;
      if (!el) throw new Error('Export card not found');

      // 等待动态背景生成完毕
      let attempts = 0;
      while (el.getAttribute('data-ready') !== 'true' && attempts < 50) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
      }

      // 等待图片加载完成
      const imgElements = Array.from(el.querySelectorAll('img'));
      await Promise.all(imgElements.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // 额外等待一下以确保布局稳定
      await new Promise(r => setTimeout(r, 200));

      // bugfix: diary-export-long-text-fails (Requirement 2.1)
      // 1) 主修：先把 oklch/oklab/lab/lch 归一化成 rgb，避免 html2canvas 解析失败；
      // 2) 次级防线：按卡片高度挑 scale（默认 2，过高时降级），防止物理 canvas 超限；
      // 3) 无论 html2canvas 成功失败，finally 里都要 restoreColors() 回滚 inline style。
      const { cardH } = measureExportCard(el);
      const scale = pickExportScale(cardH);
      const restoreColors = sanitizeModernColors(el);

      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(el, {
          useCORS: true,
          allowTaint: false,
          scale,
          backgroundColor: null,
          logging: false,
          width: 375,
          windowWidth: 375,
        });
      } finally {
        restoreColors();
      }

      // bugfix: diary-export-long-text-fails (Task 3.4，Requirement 2.3 预留)
      // 次级防线兜底：若 html2canvas 返回的 canvas 是空的 / toDataURL 返回 "data:,"，
      // 说明物理 canvas 尺寸 / 面积触及浏览器上限（iOS Safari 4096px、Android WebView 更低），
      // 抛出含 "canvas size" 的错误走 decodeErrorReason → 'oversize' → 对应的 toast。
      const dataUrl = canvas.toDataURL('image/png');
      if (canvas.width === 0 || canvas.height === 0 || dataUrl === 'data:,') {
        throw new Error(
          `canvas size exceeded safe limit (width=${canvas.width}, height=${canvas.height})`
        );
      }

      root.unmount();
      document.body.removeChild(wrapper);

      // 兼容 Capacitor 原生 App 环境
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.()) {
        try {
          const capacitorFilesystem = '@capacitor/filesystem';
          const { Filesystem, Directory } = await import(/* @vite-ignore */ capacitorFilesystem);
          const base64Data = dataUrl.split(',')[1];
          const fileName = `小象日志_${format(displayDate, 'yyyy-MM-dd')}.png`;
          await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Documents,
          });
          showToast('已保存到文件夹 ✨');
        } catch (capErr) {
          console.error('Capacitor 保存失败:', capErr);
          showToast('保存失败，请重试');
        }
      } else {
        // Web 浏览器环境：直接下载
        const link = document.createElement('a');
        link.download = `小象日志_${format(displayDate, 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        showToast('图片已保存 ✨');
      }
    } catch (error) {
      console.error('导出图片失败:', error);
      const reason = decodeErrorReason(error);
      if (reason === 'unsupported_color') {
        showToast('暂时无法导出该内容，请稍后重试');
      } else if (reason === 'oversize') {
        showToast('日志内容较多，请精简或拆分后再导出');
      } else if (reason === 'io') {
        showToast('保存失败，请检查存储权限');
      } else {
        showToast('导出图片失败，请重试');
      }
      root.unmount();
      if (document.body.contains(wrapper)) {
        document.body.removeChild(wrapper);
      }
    } finally {
      setExporting(false);
    }
  };

  const shareToWeChat = () => {
    setShowShare(false);
    showToast('功能还在开发中，敬请期待～');
  };

  const compressImage = (base64Str: string, maxWidth = 800): Promise<string> => {
    return new Promise((resolve) => {
      if (!base64Str.startsWith('data:image/')) {
        resolve(base64Str);
        return;
      }
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const [meta, data] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  };

  const uploadCommunityImages = async (imageList: string[]): Promise<string[]> => {
    if (imageList.length === 0) return [];

    const formData = new FormData();
    const remoteImages = imageList.filter(img => !img.startsWith('data:'));
    imageList.forEach((img, index) => {
      if (img.startsWith('data:')) {
        formData.append('images', dataUrlToFile(img, `community-${Date.now()}-${index}.jpg`));
      }
    });

    if (Array.from(formData.keys()).length === 0) return remoteImages;

    const token = getAccessToken();
    const response = await fetch('/api/upload/images', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: '图片上传失败' }));
      throw new Error(data.error || '图片上传失败');
    }

    const data = await response.json();
    return [...remoteImages, ...(data.urls || [])];
  };

  const shareToCircle = async () => {
    setShowShare(false);

    if (!user || !getAccessToken()) {
      alert('请先登录后再分享到日志圈');
      navigate('/login');
      return;
    }
    
    // Save HTML to perfectly preserve Tiptap's structure (like empty <p></p> for blank lines)
    let communityContent = editor ? editor.getHTML() : content;
    communityContent = communityContent.trim();
    
    let plainText = stripAllMarkdown(communityContent);
    
    if (!plainText && images.length === 0) {
      alert('请先写点内容再分享哦');
      return;
    }

    showToast('正在发布到日志圈...');
    const compressedImages = await Promise.all(images.map(img => compressImage(img)));

    try {
      const uploadedImages = await uploadCommunityImages(compressedImages);
      const createdPost = await api.post('/community/posts', {
        content: communityContent,
        images: uploadedImages
      });
      navigate('/community', { state: { createdPost, refreshPosts: true } });
    } catch (e) {
      alert(e instanceof Error ? e.message : '分享失败，请重试');
    }
  };

  const bgConfig = getThemeById(backgroundId);
  const contrastColor = bgConfig.textColor || calculateContrastColor(bgConfig.value);
  const isDarkBg = selectedTheme 
    ? ['#E8EDF2', '#E8EEF8', '#FFFFFF'].includes(selectedTheme.textColor)
    : contrastColor === '#FFFFFF';
  const lockEditorScrollDomEvents = {
    beforeinput: () => {
      lockScrollForEditorInput();
      return false;
    },
    input: () => {
      lockScrollForEditorInput();
      return false;
    },
    compositionstart: () => {
      lockScrollForEditorInput();
      return false;
    },
    compositionupdate: () => {
      lockScrollForEditorInput();
      return false;
    },
    compositionend: () => {
      lockScrollForEditorInput();
      return false;
    },
    keydown: (_view: unknown, event: KeyboardEvent) => {
      const editingKey = event.key.length === 1
        || event.key === 'Enter'
        || event.key === 'Backspace'
        || event.key === 'Delete';

      if (editingKey) {
        lockScrollForEditorInput();
      }

      return false;
    },
  };

  const editor = useEditor({
    editable: isEditing,
    extensions: [
      StarterKit,
      Highlight.configure({
        HTMLAttributes: {
          class: 'bg-primary/20 text-primary rounded px-1',
        },
      }),
      Placeholder.configure({
        placeholder: '写点什么...',
      }),
      Markdown,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
      hasUnsavedChanges.current = true;
      lockScrollForEditorInput();
    },
    onSelectionUpdate: () => {
      // Force re-render for toolbar formatting states when cursor moves
      setUpdateTick(t => t + 1);
    },
    onTransaction: () => {
      setUpdateTick(t => t + 1);
    },
    onFocus: () => {
      setIsFocused(true);
    },
    onBlur: () => {
      setIsFocused(false);
    },
    editorProps: {
      attributes: {
        class: `prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg max-w-none min-h-[60vh] focus:outline-none caret-primary text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${isDarkBg ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`,
      },
      handleDOMEvents: lockEditorScrollDomEvents,
      handleScrollToSelection: () => true,
    },
  });

  editorInstanceRef.current = editor;

  const templateEditor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({
        HTMLAttributes: {
          class: 'bg-primary/20 text-primary rounded px-1',
        },
      }),
      Placeholder.configure({
        placeholder: '在此输入模板内容...',
      }),
      Markdown,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setTemplateForm(prev => ({ ...prev, content: editor.getHTML() }));
    },
    onSelectionUpdate: () => {
      setUpdateTick(t => t + 1);
    },
    onTransaction: () => {
      setUpdateTick(t => t + 1);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-headings:font-headline prose-headings:text-on-surface prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-strong:text-on-surface prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg max-w-none min-h-[40vh] focus:outline-none caret-primary',
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditing);
    }
  }, [isEditing, editor]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg max-w-none min-h-[60vh] focus:outline-none caret-primary text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${isDarkBg ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`,
          },
          handleDOMEvents: lockEditorScrollDomEvents,
          handleScrollToSelection: () => true,
        }
      });
    }
  }, [isDarkBg, editor]);

  // Ensure toolbar syncs with current selection
  // Removed custom useEffect handlers because onSelectionUpdate and onTransaction are initialized via useEditor

  // Ensure template toolbar syncs
  // Removed custom useEffect handlers because onSelectionUpdate and onTransaction are initialized via useEditor

  // Load Templates
  useEffect(() => {
    const loadTemplates = async () => {
      const loadedTemplates = await diaryService.getTemplates();
      setTemplates(loadedTemplates);
    };
    loadTemplates();
  }, []);

  useEffect(() => {
    if (id) {
      const loadJournal = async () => {
        const data = await diaryService.getEntryById(id);
        if (data) {
          setExistingJournal(data);
          let loadedContent = data.content || '';
          if (data.blocks && data.blocks.length > 0) {
            loadedContent = data.blocks.map(b => `<p><strong>${b.title}</strong></p><p>${b.content.replace(/\n/g, '<br>')}</p>`).join('<p><br></p>');
          }
          setContent(loadedContent);
          if (editor) {
            editor.commands.setContent(loadedContent);
          }
          
          if (data.images) {
            setImages(data.images);
          }
          if (data.backgroundId) {
            setBackgroundId(data.backgroundId);
          }
          if (data.themeId) {
            const theme = allThemes.find(t => t.id === data.themeId);
            if (theme) {
              setSelectedTheme(theme);
            }
          } else {
            const defaultTheme = allThemes.find(t => t.id === 'warm-white');
            if (defaultTheme) setSelectedTheme(defaultTheme);
          }
        }
      };
      loadJournal();
    } else {
      // New diary, load preferred template
      const initNewDiary = async () => {
        const lastThemeId = localStorage.getItem('lastUsedDiaryThemeId');
        const defaultTheme = allThemes.find(t => t.id === lastThemeId) || allThemes.find(t => t.id === 'warm-white');
        if (defaultTheme) setSelectedTheme(defaultTheme);

        let initialContent = '';
        const prefId = localStorage.getItem('preferredTemplateId');
        if (prefId) {
          if (prefId === 'system') {
            initialContent = SYSTEM_TEMPLATE.replace(/\n\n/g, '\n\n<p></p>\n\n');
          } else {
            const loadedTemplates = await diaryService.getTemplates();
            const prefTpl = loadedTemplates.find(t => t.id === prefId);
            if (prefTpl) {
              initialContent = prefTpl.content;
            }
          }
        }
        setContent(initialContent);
        if (editor) {
          editor.commands.setContent(initialContent);
          if (initialContent) {
            setTimeout(() => {
              editor.commands.focus('start');
              editor.commands.keyboardShortcut('ArrowDown');
            }, 100);
          }
        }
      };
      initNewDiary();
    }
  }, [id, editor]);

  // ===== Auto-save history: periodic snapshots every 30s while editing =====
  useEffect(() => {
    // Initialize lastHistoryContentRef with the loaded content
    if (existingJournal) {
      lastHistoryContentRef.current = existingJournal.content || '';
    }
  }, [existingJournal?.id]);

  useEffect(() => {
    if (!existingJournal || !isEditing) return;

    const INTERVAL_MS = 30_000; // 30 seconds

    autoSaveTimerRef.current = setInterval(() => {
      if (!hasUnsavedChanges.current) return;

      const currentContent = editor?.getHTML() || content;
      // Skip if content is identical to last saved history snapshot
      if (currentContent === lastHistoryContentRef.current) return;
      // Skip if content is empty or just whitespace
      const plainText = currentContent.replace(/<[^>]*>/g, '').trim();
      if (!plainText) return;

      // Save snapshot
      lastHistoryContentRef.current = currentContent;
      diaryService.saveHistory({
        entryId: existingJournal.id,
        content: currentContent,
        images: images,
        savedAt: new Date().toISOString(),
      }).catch(err => console.warn('Auto-save history failed:', err));
    }, INTERVAL_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [existingJournal?.id, isEditing, editor]);

  // Save history on page hide / visibility change (user switches app or closes tab)
  useEffect(() => {
    if (!existingJournal || !isEditing) return;

    const saveOnHide = () => {
      if (!hasUnsavedChanges.current) return;
      const currentContent = editor?.getHTML() || content;
      if (currentContent === lastHistoryContentRef.current) return;
      const plainText = currentContent.replace(/<[^>]*>/g, '').trim();
      if (!plainText) return;

      lastHistoryContentRef.current = currentContent;
      // Use sendBeacon-style fire-and-forget
      diaryService.saveHistory({
        entryId: existingJournal.id,
        content: currentContent,
        images: images,
        savedAt: new Date().toISOString(),
      }).catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveOnHide();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', saveOnHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', saveOnHide);
    };
  }, [existingJournal?.id, isEditing, editor]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setImages(prev => [...prev, base64]);
        hasUnsavedChanges.current = true;
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (indexToRemove: number) => {
    setImages(prev => prev.filter((_, index) => index !== indexToRemove));
    hasUnsavedChanges.current = true;
  };

  const goBackSafely = () => {
    // If the hash is still stuck on preview somehow, go back 2 steps
    if (location.hash === '#preview') {
      navigate(-2);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  const isEmptyOrTemplate = () => {
    const plainText = editor?.getText()?.trim() || '';
    if (!plainText) return true;
    
    // Check if it's just the system template
    const systemText = SYSTEM_TEMPLATE.replace(/<[^>]*>?/gm, '').trim();
    if (plainText === systemText) return true;

    // Check if it's just the preferred custom template
    const prefId = localStorage.getItem('preferredTemplateId');
    if (prefId && prefId !== 'system') {
      const prefTpl = templates.find(t => t.id === prefId);
      if (prefTpl) {
        const prefText = prefTpl.content.replace(/<[^>]*>?/gm, '').trim();
        if (plainText === prefText) return true;
      }
    }
    
    return false;
  };

  const handleSave = async (goBack = false) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const currentContent = editor?.getHTML() || content;

      if (!hasUnsavedChanges.current && existingJournal) {
        if (goBack) {
          goBackSafely();
        } else {
          setIsEditing(false);
          editor?.commands.blur();
        }
        return;
      }

      if (isEmptyOrTemplate() && !existingJournal && images.length === 0) {
        if (goBack) {
          goBackSafely();
        } else {
          setIsEditing(false);
          editor?.commands.blur();
        }
        return;
      }

      let savedEntry;
      if (existingJournal) {
        // Save current content as a history snapshot before overwriting
        const currentContent2 = currentContent;
        const plainCheck = currentContent2.replace(/<[^>]*>/g, '').trim();
        if (plainCheck && currentContent2 !== lastHistoryContentRef.current) {
          lastHistoryContentRef.current = currentContent2;
          diaryService.saveHistory({
              entryId: existingJournal.id,
              content: currentContent2,
              images: images,
              savedAt: new Date().toISOString()
            })
            .catch(error => console.warn('Failed to save edit history:', error));
        }

        savedEntry = await diaryService.updateEntry(existingJournal.id, {
          content: currentContent,
          images: images,
          backgroundId: backgroundId,
          themeId: selectedTheme?.id,
        });
        if (savedEntry) setExistingJournal(savedEntry);
        hasUnsavedChanges.current = false;
      } else {
        let diaryDate = new Date();
        const appSettingsStr = localStorage.getItem('app_settings');
        if (appSettingsStr) {
          try {
            const appSettings = JSON.parse(appSettingsStr);
            if (appSettings.autoAdjustTime && diaryDate.getHours() < 12) {
              diaryDate.setDate(diaryDate.getDate() - 1);
            }
          } catch (e) {}
        }

        savedEntry = await diaryService.createEntry({
          content: currentContent,
          images: images,
          diaryDate: diaryDate.toISOString(),
          backgroundId: backgroundId,
          themeId: selectedTheme?.id,
        });
        setExistingJournal(savedEntry);
        hasUnsavedChanges.current = false;
      }
      
      if (goBack) {
        goBackSafely();
      } else {
        setIsEditing(false);
        editor?.commands.blur();
        if (!existingJournal && savedEntry) {
          navigate(`/editor?id=${savedEntry.id}`, { replace: true });
        }
      }
    } catch (error) {
      console.error("Error saving diary:", error);
      showToast(error instanceof Error ? error.message : '保存失败，请重试');
      if (goBack) {
        goBackSafely();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = async () => {
    try {
      if (isEditing) {
        if (!hasUnsavedChanges.current && existingJournal) {
          goBackSafely();
          return;
        }

        if (isEmptyOrTemplate() && !existingJournal && images.length === 0) {
          goBackSafely();
          return;
        }
        
        const appSettingsStr = localStorage.getItem('app_settings');
        let saveOnExit = true;
        if (appSettingsStr) {
          try {
            const appSettings = JSON.parse(appSettingsStr);
            if (appSettings.saveOnExit === false) {
              saveOnExit = false;
            }
          } catch (e) {}
        }

        if (saveOnExit) {
          await handleSave(true);
        } else {
          setIsAbandonConfirmOpen(true);
        }
      } else {
        goBackSafely();
      }
    } catch (error) {
      console.error("Error in handleBack:", error);
      goBackSafely();
    }
  };

  const displayDate = existingJournal ? new Date(existingJournal.diaryDate) : new Date();
  
  const bgStyle = bgConfig.type === 'color' 
    ? { backgroundColor: bgConfig.value }
    : { backgroundImage: `url(${bgConfig.value})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' };

  const rootStyle = selectedTheme ? {
    minHeight: '100dvh',
    color: selectedTheme.textColor,
  } : { ...bgStyle, color: contrastColor, minHeight: '100dvh' };

  const fixedViewportHeightCss = fixedViewportHeight > 0 ? `${fixedViewportHeight}px` : '100vh';
  const editorChromeHeight = 'calc(64px + env(safe-area-inset-top))';
  const editorContentTopPadding = 'calc(76px + env(safe-area-inset-top))';
  // bugfix: 软键盘弹出时，layout viewport 在部分安卓浏览器中不会缩小，
  // 导致 <main> 没有溢出、完全无法滚动，短文案时光标会被输入法遮挡。
  // 这里把 keyboardInset 加到底部 padding，确保有足够的可滚动空间把光标滚到可视区。
  // 额外加 40vh 的空白，让用户在编辑时光标下方始终有舒适的留白空间。
  // Reserve scrollable space; the visible room is locked from the user's scroll.
  const editorBottomBreathingRoom = fixedViewportHeight > 0
    ? `${Math.max(260, Math.round(fixedViewportHeight * 0.4))}px`
    : '40vh';
  const editorContentBottomPadding = showThemeBar
    ? `calc(220px + ${editorBottomBreathingRoom} + env(safe-area-inset-bottom) + ${keyboardInset}px)`
    : `calc(160px + ${editorBottomBreathingRoom} + env(safe-area-inset-bottom) + ${keyboardInset}px)`;
  const editorTopFadeMask = [
    'linear-gradient(to bottom',
    'transparent 0px',
    'transparent calc(64px + env(safe-area-inset-top))',
    'rgba(0, 0, 0, 0.35) calc(70px + env(safe-area-inset-top))',
    '#000 calc(76px + env(safe-area-inset-top))',
    '#000 100%)',
  ].join(', ');
  const navStyle: React.CSSProperties = {
    height: editorChromeHeight,
    paddingTop: 'env(safe-area-inset-top)',
    ...(selectedTheme ? { backgroundColor: selectedTheme.toolbarColor, color: selectedTheme.textColor } : {}),
  };
  const editorScrollStyle: React.CSSProperties = {
    ...(selectedTheme ? { backgroundColor: selectedTheme.paperColor || 'transparent' } : {}),
    paddingTop: editorContentTopPadding,
    paddingBottom: editorContentBottomPadding,
    WebkitOverflowScrolling: 'touch',
    WebkitMaskImage: editorTopFadeMask,
    maskImage: editorTopFadeMask,
    scrollPaddingBottom: `calc(120px + ${editorBottomBreathingRoom})`,
    overflowAnchor: 'none',
  };

  const handleToggleMark = (markType: 'bold' | 'highlight') => {
    if (!editor) return;
    const { empty } = editor.state.selection;
    
    // On mobile devices, composition IME (especially Android CJK) ignores ProseMirror's stored marks 
    // when toggling mark at the end of a marked node. We inject a zero-width space after toggling
    // to force the IME into a new text node with the successfully updated mark.
    if (empty) {
      if (markType === 'bold') {
        editor.chain().focus().toggleBold().insertContent('\u200B').run();
      } else {
        editor.chain().focus().toggleHighlight().insertContent('\u200B').run();
      }
    } else {
      if (markType === 'bold') {
        editor.chain().focus().toggleBold().run();
      } else {
        editor.chain().focus().toggleHighlight().run();
      }
    }
  };

  return (
    <div className="min-h-screen font-body pb-40 transition-colors duration-500 relative" style={rootStyle} data-tick={updateTick}>
      {selectedTheme && (
        <>
          {/* 旧背景淡出 */}
          {prevTheme && transitioning && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0,
              height: fixedViewportHeightCss,
              zIndex: 0,
              backgroundImage: prevTheme.backgroundImage ? `url(${prevTheme.backgroundImage})` : 'none',
              backgroundColor: prevTheme.backgroundColor || '#FAF9F5',
              backgroundSize: 'cover',
              backgroundPosition: 'top center',
              animation: 'fadeOut 0.5s ease forwards',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundColor: prevTheme.paperOverlay || 'transparent',
              }} />
            </div>
          )}

          {/* 新背景淡入 */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            height: fixedViewportHeightCss,
            zIndex: 0,
            backgroundImage: selectedTheme.backgroundImage
              ? `url(${selectedTheme.backgroundImage})` : 'none',
            backgroundColor: selectedTheme.backgroundImage ? 'transparent' : (selectedTheme.backgroundColor || '#FAF9F5'),
            backgroundSize: 'cover',
            backgroundPosition: 'top center',
            transition: 'background-color 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            animation: transitioning ? 'fadeIn 0.5s ease forwards' : 'none',
          }}>
            {/* 叠加层也有过渡 */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: selectedTheme.paperOverlay || 'transparent',
              transition: 'background-color 0.5s ease',
            }} />
          </div>
        </>
      )}
      {selectedTheme && (
        <style>{`
          .prose { color: ${selectedTheme.textColor} !important; }
          .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6, .prose strong { color: ${selectedTheme.textColor} !important; }
        `}</style>
      )}
      {/* Subtle overlay for image backgrounds to improve text readability */}
      {!selectedTheme && bgConfig.type === 'image' && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none z-0"></div>
      )}
      
      {/* Top Navigation Bar */}
      <nav 
        className={`fixed top-0 w-full z-50 px-4 flex justify-between items-center ${
          selectedTheme?.toolbarColor === 'transparent' ? '' : 'backdrop-blur-xl'
        } ${!selectedTheme ? (isDarkBg ? 'bg-black/20 text-white' : 'bg-surface/80 text-on-surface') : ''}`}
        style={navStyle}
      >
        <div className="flex items-center">
          <button 
            onClick={(e) => {
              e.preventDefault();
              handleBack();
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors active:scale-95 mr-1 ${isDarkBg ? 'text-white' : 'text-on-surface-variant'}`}
            style={selectedTheme ? { color: selectedTheme.textColor } : undefined}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="ml-2 flex flex-col justify-center">
            <p 
              className={`font-label uppercase tracking-wide leading-tight mb-0.5 ${isDarkBg ? 'text-white' : 'text-on-surface'}`}
              style={{ 
                fontSize: '16px', 
                fontWeight: '600',
                ...(selectedTheme ? { color: selectedTheme.textColor } : {})
              }}
            >
              {format(displayDate, 'MM月dd日 · EEEE', { locale: zhCN })}
            </p>
            <p 
              className={`font-label font-medium leading-tight ${isDarkBg ? 'text-white/70' : 'text-outline'}`}
              style={{ 
                fontSize: '13px',
                ...(selectedTheme ? { color: selectedTheme.secondaryColor } : {})
              }}
            >
              {format(displayDate, 'a hh:mm', { locale: zhCN })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 relative">
          {isEditing ? (
            <button 
              onClick={(e) => {
                e.preventDefault();
                handleSave(false);
              }}
              disabled={isSaving}
              className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors active:scale-95 ${isDarkBg ? 'text-white' : 'text-primary'}`}
              style={selectedTheme ? { color: selectedTheme.textColor } : undefined}
            >
              {isSaving ? (
                <div className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Check className="w-6 h-6" />
              )}
            </button>
          ) : (
            <>
              <button 
                onClick={() => setShowShare(true)}
                className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors ${isDarkBg ? 'text-white' : 'text-on-surface-variant'}`}
                style={selectedTheme ? { color: selectedTheme.textColor } : undefined}
              >
                <Share className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowThemeBar(!showThemeBar)}
                className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors ${isDarkBg ? 'text-white' : 'text-on-surface-variant'}`}
                style={selectedTheme ? { color: selectedTheme.textColor } : undefined}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={selectedTheme ? selectedTheme.textColor : (isDarkBg ? "#FFFFFF" : "#1C1C1E")} strokeWidth="1.8"/>
                  <circle cx="8.5" cy="10" r="1.5" fill="#E8899A"/>
                  <circle cx="12" cy="7.5" r="1.5" fill="#F2C94C"/>
                  <circle cx="15.5" cy="10" r="1.5" fill="#6AAF52"/>
                  <circle cx="14" cy="14" r="1.5" fill="#7EB8F7"/>
                  <circle cx="10" cy="14" r="1.5" fill="#C4A0E8"/>
                </svg>
              </button>
            </>
          )}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors ${isDarkBg ? 'text-white' : 'text-on-surface-variant'}`}
            style={selectedTheme ? { color: selectedTheme.textColor } : undefined}
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* Three-dot Menu Dropdown */}
          {isMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute top-12 right-0 w-40 bg-surface-container-lowest rounded-2xl shadow-lg border border-surface-container-high py-2 z-50 overflow-hidden">
                <button 
                  onClick={() => { setIsMenuOpen(false); setIsTemplateModalOpen(true); }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-surface-container-low transition-colors text-[15px] text-on-surface"
                >
                  <FileText className="w-4 h-4 text-on-surface-variant" />
                  日记模板
                </button>
                <button 
                  onClick={() => { setIsMenuOpen(false); navigate('/trash'); }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-surface-container-low transition-colors text-[15px] text-on-surface"
                >
                  <Trash2 className="w-4 h-4 text-on-surface-variant" />
                  回收站
                </button>
                <button 
                  onClick={() => { 
                    setIsMenuOpen(false); 
                    if (existingJournal) {
                      const loadHistory = async () => {
                        try {
                          const history = await diaryService.getHistoryForEntry(existingJournal.id);
                          setHistoryList(history);
                        } catch (error) {
                          console.warn('Failed to load edit history:', error);
                          setHistoryList([]);
                          showToast('编辑记录加载失败');
                        } finally {
                          setIsHistoryModalOpen(true);
                        }
                      };
                      loadHistory();
                    } else {
                      setIsHistoryModalOpen(true);
                    }
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-surface-container-low transition-colors text-[15px] text-on-surface"
                >
                  <History className="w-4 h-4 text-on-surface-variant" />
                  编辑记录
                </button>
                <div className="h-px bg-surface-container-high my-1" />
                <button 
                  onClick={() => { setIsMenuOpen(false); setIsAbandonConfirmOpen(true); }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-red-50 transition-colors text-[15px] text-red-500 font-medium"
                >
                  <XCircle className="w-4 h-4" />
                  放弃编辑
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      <main
        ref={editorScrollRef}
        className="fixed inset-x-0 top-0 bottom-0 z-10 overflow-y-auto overscroll-contain"
        style={editorScrollStyle}
        onTouchMove={stopInputScrollLock}
        onWheel={stopInputScrollLock}
        onPointerMove={updateTapScrollLockMove}
        onPointerDown={(e) => {
          startTapScrollLock(e);
        }}
        onPointerUp={finishTapScrollLock}
        onPointerCancel={stopTapScrollLock}
        onClick={(e) => {
          if (showThemeBar) {
            setShowThemeBar(false);
          }
          if (isBackgroundSelectorOpen) {
            setIsBackgroundSelectorOpen(false);
          }
          if (suppressNextEditorClickRef.current) {
            suppressNextEditorClickRef.current = false;
            return;
          }
          if (!isEditing) {
            setIsEditing(true);
            editor?.commands.focus();
            setTimeout(() => editor?.commands.focus(), 10);
          } else {
            // 只有当点击发生在编辑器内容区域内时才 re-focus，
            // 避免点击底部空白区域时触发 scrollIntoView 把页面跳回光标位置。
            const editorEl = (e.currentTarget as HTMLElement).querySelector('.ProseMirror');
            if (editorEl && editorEl.contains(e.target as Node)) {
              editor?.commands.focus(undefined, { scrollIntoView: false });
            }
          }
        }}
      >
        <div
          id="diary-content-export"
          className="px-5 max-w-xl mx-auto"
          data-editor-blank-surface="true"
        >
          <div style={{ position: 'relative', zIndex: 1 }} data-editor-blank-surface="true">
            <section 
              className="space-y-6 cursor-text"
              style={{ fontFamily: 'var(--diary-font-family)' }}
              data-editor-blank-surface="true"
            >
              <EditorContent editor={editor} />

              {images.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  {images.length === 1 ? (
                    <div 
                      style={{ margin: '8px 0', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                      className="group"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(0);
                      }}
                    >
                      <SafeImage src={images[0]} style={{
                        width: '100%', aspectRatio: '4/3',
                        objectFit: 'cover', display: 'block'
                      }} />
                      {isEditing && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(0); }}
                          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : images.length === 2 ? (
                    <div style={{ 
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '3px', margin: '8px 0',
                      borderRadius: '12px', overflow: 'hidden' 
                    }}>
                      {images.map((src, idx) => (
                        <div 
                          key={idx} 
                          style={{ aspectRatio: '1/1', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                          className="group"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(idx);
                          }}
                        >
                          <SafeImage src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {isEditing && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ 
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '3px', margin: '8px 0',
                      borderRadius: '12px', overflow: 'hidden' 
                    }}>
                      {images.map((src, idx) => (
                        <div 
                          key={idx} 
                          style={{ aspectRatio: '1/1', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                          className="group"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(idx);
                          }}
                        >
                          <SafeImage src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {isEditing && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md z-10"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <input 
        type="file" 
        accept="image/*" 
        multiple
        className="hidden" 
        ref={fileInputRef}
        onChange={handleImageUpload}
      />

      {/* Toolbars Container */}
      <div 
        className="fixed left-0 right-0 z-50 transition-transform duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ 
          bottom: 0,
          transform: `translateY(-${keyboardInset}px)` 
        }}
      >
        {/* Markdown Toolbar */}
        <div 
          className="backdrop-blur-md border-t border-outline-variant/20 transition-all duration-300 overflow-hidden"
          style={{ 
            height: isFocused && isEditing ? '44px' : '0',
            opacity: isFocused && isEditing ? 1 : 0,
            backgroundColor: selectedTheme ? selectedTheme.toolbarColor : 'rgba(var(--color-surface), 0.95)' 
          }}
        >
          <div className="flex items-center justify-between px-2 py-1 w-full h-[44px]">
          {/* Group 1: Image */}
          <div className="flex">
            <button 
              onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              className="flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <ImageIcon className="w-[20px] h-[20px]" />
            </button>
          </div>
          
          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>
          
          {/* Group 2: Undo / Redo */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().undo().run(); }}
              disabled={!editor?.can().undo()}
              className="flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <Undo className="w-[20px] h-[20px]" />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().redo().run(); }}
              disabled={!editor?.can().redo()}
              className="flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <Redo className="w-[20px] h-[20px]" />
            </button>
          </div>

          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>

          {/* Group 3: Formatting */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); handleToggleMark('highlight'); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('highlight') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Highlighter className="w-[20px] h-[20px]" />
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); handleToggleMark('bold'); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('bold') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Bold className="w-[20px] h-[20px]" />
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 1 }).run(); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[15px] ${editor?.isActive('heading', { level: 1 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              H1
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run(); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[15px] ${editor?.isActive('heading', { level: 2 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              H2
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('blockquote') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Quote className="w-[20px] h-[20px]" />
            </button>
          </div>

          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>

          {/* Group 4: Lists */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('orderedList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <ListOrdered className="w-[20px] h-[20px]" />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
              className={`flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('bulletList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <List className="w-[20px] h-[20px]" />
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Templates Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface w-full sm:w-[480px] sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high">
              <h3 className="font-headline font-semibold text-lg text-on-surface">日记模板</h3>
              <button onClick={() => setIsTemplateModalOpen(false)} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex px-6 pt-4 gap-4 border-b border-surface-container-high">
              <button 
                onClick={() => setActiveTab('system')}
                className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'system' ? 'text-primary' : 'text-on-surface-variant'}`}
              >
                系统模板
                {activeTab === 'system' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('custom')}
                className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'custom' ? 'text-primary' : 'text-on-surface-variant'}`}
              >
                自定义模板
                {activeTab === 'custom' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'system' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl border border-surface-container-high bg-surface-container-lowest hover:border-primary/30 transition-colors cursor-pointer relative"
                       onClick={() => {
                         setPreferredTemplateId('system');
                         localStorage.setItem('preferredTemplateId', 'system');
                         
                         const currentHtml = editor?.getHTML() || '';
                         const systemHtml = SYSTEM_TEMPLATE.replace(/\n\n/g, '\n\n<p></p>\n\n');
                         const newHtml = currentHtml === '<p></p>' || !currentHtml ? systemHtml : currentHtml + systemHtml;
                         editor?.commands.setContent(newHtml);
                         setContent(newHtml);
                         setIsTemplateModalOpen(false);
                       }}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-on-surface">经典回顾</h4>
                        {preferredTemplateId === 'system' && (
                          <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> 默认
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded-md">系统</span>
                    </div>
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{SYSTEM_TEMPLATE.replace(/<[^>]*>?/gm, '')}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map(tpl => (
                    <div 
                      key={tpl.id} 
                      className="p-4 rounded-2xl border border-surface-container-high bg-surface-container-lowest hover:border-primary/30 transition-colors cursor-pointer relative select-none"
                      onTouchStart={() => handleTouchStart(tpl.id)}
                      onTouchEnd={handleTouchEnd}
                      onMouseDown={() => handleTouchStart(tpl.id)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onClick={() => {
                        if (isLongPress.current) return;
                        setPreferredTemplateId(tpl.id);
                        localStorage.setItem('preferredTemplateId', tpl.id);
                        
                        const currentHtml = editor?.getHTML() || '';
                        const newHtml = currentHtml === '<p></p>' || !currentHtml ? tpl.content : currentHtml + tpl.content;
                        editor?.commands.setContent(newHtml);
                        setContent(newHtml);
                        setIsTemplateModalOpen(false);
                      }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-on-surface">{tpl.title}</h4>
                          {preferredTemplateId === tpl.id && (
                            <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check className="w-3 h-3" /> 默认
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{tpl.content.replace(/<[^>]*>?/gm, '')}</p>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      setTemplateForm({ title: '', content: '' });
                      templateEditor?.commands.setContent('');
                      setIsTemplateEditorOpen(true);
                      setIsTemplateModalOpen(false);
                    }}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-surface-container-high text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex flex-col items-center justify-center gap-2"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-sm font-medium">新建自定义模板</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div 
          className="fixed inset-0 z-[200] flex flex-col bg-surface-container animate-in slide-in-from-bottom-full duration-300"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
        >
          {/* AppBar */}
          <div className="flex items-center justify-between px-4 h-14 shrink-0 bg-surface-container">
            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 -ml-2 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h3 className="font-headline font-bold text-[17px] text-on-surface">编辑记录</h3>
            <div className="w-10"></div> {/* Placeholder */}
          </div>
          
          <div className="flex-1 overflow-y-auto px-0 py-4">
            {historyList.length === 0 ? (
              <div className="text-center text-on-surface-variant py-8">暂无编辑记录</div>
            ) : (
              historyList.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()).map(history => {
                const pureText = stripAllMarkdown(history.content);
                const wordCount = pureText.replace(/\s/g, '').length;
                
                return (
                  <div key={history.id} className="mx-4 mb-3 p-4 rounded-2xl bg-surface-container-lowest shadow-sm border border-surface-container/50">
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-xs text-on-surface-variant">
                        编辑时间: {format(new Date(history.savedAt), 'yyyy-MM-dd HH:mm:ss')}  字数: {wordCount}
                      </span>
                      <button 
                        onClick={() => {
                          setSelectedHistory(history);
                          setIsHistoryModalOpen(false);
                          setIsRestoreConfirmOpen(true);
                        }}
                        className="text-[14px] text-primary bg-transparent border-none p-0 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        恢复
                      </button>
                    </div>
                    <div 
                      className="text-[15px] leading-[1.7] text-on-surface whitespace-pre-wrap break-words"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 6,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {pureText}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Abandon Confirm Modal */}
      {isAbandonConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="font-headline font-semibold text-xl text-on-surface mb-2">放弃此次编辑？</h3>
            <p className="text-on-surface-variant text-[15px] mb-6">当前未保留的修改将被移入回收站</p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsAbandonConfirmOpen(false)}
                className="px-5 py-2.5 rounded-full font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                继续编辑
              </button>
              <button 
                onClick={async () => {
                  setIsAbandonConfirmOpen(false);
                  if (existingJournal) {
                    await diaryService.updateEntry(existingJournal.id, {
                      content: content,
                      images: images,
                      status: 'trashed',
                      trashReason: 'abandoned',
                      trashedAt: new Date().toISOString()
                    });
                  } else {
                    await diaryService.createEntry({
                      content: content,
                      images: images,
                      diaryDate: new Date().toISOString(),
                      status: 'trashed',
                      trashReason: 'abandoned',
                      trashedAt: new Date().toISOString()
                    });
                  }
                  navigate(-1);
                }}
                className="px-5 py-2.5 rounded-full font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                放弃并移入回收站
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirm Modal */}
      {isRestoreConfirmOpen && selectedHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="font-headline font-semibold text-xl text-on-surface mb-2">恢复到这个版本？</h3>
            <p className="text-on-surface-variant text-[15px] mb-6">当前内容将被替换，但会作为新的历史记录保存。</p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsRestoreConfirmOpen(false)}
                className="px-5 py-2.5 rounded-full font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                取消
              </button>
              <button 
                onClick={async () => {
                  if (existingJournal) {
                    // Save current content to history first
                    await diaryService.saveHistory({
                      entryId: existingJournal.id,
                      content: content,
                      images: images,
                      savedAt: new Date().toISOString()
                    });
                    
                    // Restore
                    setContent(selectedHistory.content);
                    setImages(selectedHistory.images || []);
                    editor?.commands.setContent(selectedHistory.content);
                    
                    setIsRestoreConfirmOpen(false);
                    setIsHistoryModalOpen(false);
                  }
                }}
                className="px-5 py-2.5 rounded-full font-medium text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                恢复此版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {isTemplateEditorOpen && (
        <div 
          className="fixed inset-0 z-[60] flex flex-col bg-surface animate-in slide-in-from-bottom-full duration-300"
          style={{ paddingBottom: `${keyboardInset}px` }}
        >
          <div className="flex items-center justify-between px-4 h-14 border-b border-surface-container-high bg-surface/80 backdrop-blur-md">
            <button 
              onClick={() => setIsTemplateEditorOpen(false)}
              className="text-on-surface-variant text-[15px] px-2 py-1"
            >
              取消
            </button>
            <span className="font-medium text-on-surface">新建自定义模板</span>
            <button 
              onClick={() => {
                if (!templateForm.title.trim()) {
                  alert('请输入模板名称');
                  return;
                }
                diaryService.saveTemplate(templateForm).then(newTpl => {
                  setTemplates(prev => [newTpl, ...prev]);
                  setIsTemplateEditorOpen(false);
                  setIsTemplateModalOpen(true);
                });
              }}
              className="text-white bg-primary text-[15px] px-4 py-1.5 rounded-full font-medium"
            >
              保存
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto flex flex-col">
            <input
              type="text"
              placeholder="模板名称"
              value={templateForm.title}
              onChange={e => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-6 py-4 text-xl font-bold bg-transparent border-none outline-none text-on-surface placeholder:text-on-surface-variant/40"
            />
            <div className="px-6 flex-1 cursor-text" onClick={() => templateEditor?.commands.focus()}>
              <EditorContent editor={templateEditor} />
            </div>
          </div>

          {/* Template Editor Toolbar */}
          <div className="bg-surface/95 backdrop-blur-md border-t border-outline-variant/20 pb-safe">
            <div className="flex items-center overflow-x-auto no-scrollbar px-2 py-2 gap-1 w-full touch-pan-x overscroll-x-contain">
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().undo().run(); }}
                disabled={!templateEditor?.can().undo()}
                className="flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
              >
                <Undo className="w-[18px] h-[18px]" />
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().redo().run(); }}
                disabled={!templateEditor?.can().redo()}
                className="flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
              >
                <Redo className="w-[18px] h-[18px]" />
              </button>

              <div className="w-px h-6 bg-outline-variant/30 mx-1 flex-shrink-0"></div>

              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHighlight().run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('highlight') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Highlighter className="w-[18px] h-[18px]" />
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBold().run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('bold') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Bold className="w-[18px] h-[18px]" />
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHeading({ level: 1 }).run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[15px] ${templateEditor?.isActive('heading', { level: 1 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                H1
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHeading({ level: 2 }).run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[15px] ${templateEditor?.isActive('heading', { level: 2 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                H2
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBlockquote().run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('blockquote') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Quote className="w-[18px] h-[18px]" />
              </button>

              <div className="w-px h-6 bg-outline-variant/30 mx-1 flex-shrink-0"></div>

              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleOrderedList().run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('orderedList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <ListOrdered className="w-[18px] h-[18px]" />
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBulletList().run(); }}
                className={`flex-shrink-0 px-2 h-11 flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('bulletList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <List className="w-[18px] h-[18px]" />
              </button>
              <div className="w-1 flex-shrink-0"></div>
            </div>
          </div>
        </div>
      )}

      <BackgroundSelector 
        isOpen={isBackgroundSelectorOpen}
        onClose={() => setIsBackgroundSelectorOpen(false)}
        selectedId={backgroundId}
        onSelect={(id) => {
          setBackgroundId(id);
          setIsBackgroundSelectorOpen(false);
          // Auto-save when background changes if it's an existing journal
          if (existingJournal) {
            diaryService.updateEntry(existingJournal.id, {
              backgroundId: id
            });
          }
        }}
      />

      {/* Hidden Share Card for html-to-image */}
      <div className="fixed left-[-9999px] top-0 pointer-events-none">
        <ShareCard 
          ref={shareCardRef}
          contentHtml={editor?.getHTML() || content}
          images={images}
          date={displayDate}
          backgroundId={backgroundId}
        />
      </div>

      {/* Theme Selection Bottom Bar */}
      {showThemeBar && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          paddingTop: '12px',
          backgroundColor: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(8px)',
          zIndex: 50,
          pointerEvents: 'auto',
        }}>
          <div 
            className="no-scrollbar"
            style={{
              display: 'flex',
              gap: '10px',
              overflowX: 'auto',
              paddingLeft: '16px',
              paddingRight: '16px',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x',
              pointerEvents: 'auto',
            }}
            onWheel={(e) => {
              if (e.currentTarget) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
            {allThemes.map(theme => {
              const isSelected = selectedTheme?.id === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => selectTheme(theme)}
                  style={{
                    width: '64px',
                    height: '88px',
                    borderRadius: '14px',
                    flexShrink: 0,
                    backgroundColor: theme.backgroundColor || '#FAF9F5',
                    backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: isSelected ? '2.5px solid #F5A623' : '2px solid transparent',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Exporting Loading Overlay */}
      {exporting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(255,255,255,0.8)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-on-surface font-medium">正在生成图片...</p>
        </div>
      )}

      {/* Share Modal */}
      {showShare && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.4)',
        }} onClick={() => setShowShare(false)}>

          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: '24px 24px 0 0',
              padding: '12px 0 0',
            }}
          >
            {/* 拖动条 */}
            <div style={{ width: '36px', height: '4px', borderRadius: '2px',
              backgroundColor: isDark ? '#48484A' : '#E5E5EA', margin: '0 auto 16px' }} />

            {/* Sheet 标题 */}
            <div style={{
              textAlign: 'center',
              fontSize: '15px',
              fontWeight: '600',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              padding: '16px 0 4px',
            }}>
              分享至
            </div>

            {/* 图标区域：三列等宽，铺满整个 Sheet 宽度 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',  // 三列等宽
              gap: '0',
              padding: '8px 16px 0',                 // 减少左右内边距
              width: '100%',
            }}>
              {[
                { label: '微信好友', onClick: shareToWeChat, icon: (
                  <div style={{
                    width: '56px', height: '56px',
                    borderRadius: '16px',
                    backgroundColor: '#07C160',   // 微信品牌绿
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="34" height="28" viewBox="0 0 34 28" fill="none">
                      <ellipse cx="13" cy="14" rx="12" ry="9" fill="white" opacity="0.95"/>
                      <ellipse cx="24" cy="8" rx="9" ry="7" fill="white"/>
                      <circle cx="9.5" cy="13.5" r="1.5" fill="#07C160"/>
                      <circle cx="14.5" cy="13.5" r="1.5" fill="#07C160"/>
                      <circle cx="21" cy="7.5" r="1.3" fill="#07C160"/>
                      <circle cx="25.5" cy="7.5" r="1.3" fill="#07C160"/>
                      <path d="M8 21 L5 25 L12 22" fill="white" opacity="0.95"/>
                    </svg>
                  </div>
                )},
                { label: '日志圈', onClick: shareToCircle, icon: (
                  <div style={{
                    width: '56px', height: '56px',
                    borderRadius: '16px',
                    backgroundColor: '#446733',   // 品牌绿
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                      <circle cx="15" cy="15" r="12" stroke="white" strokeWidth="2" fill="none"/>
                      <circle cx="15" cy="11" r="3" fill="white"/>
                      <path d="M9 22c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="1.8"
                            strokeLinecap="round" fill="none"/>
                      <circle cx="8" cy="15" r="1.5" fill="white" opacity="0.6"/>
                      <circle cx="22" cy="15" r="1.5" fill="white" opacity="0.6"/>
                    </svg>
                  </div>
                )},
                { label: '保存到本地', onClick: saveToLocal, icon: (
                  <div style={{
                    width: '56px', height: '56px',
                    borderRadius: '16px',
                    backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                         stroke={isDark ? '#F2F2F7' : '#1C1C1E'}
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v13"/>
                      <path d="M7 11l5 5 5-5"/>
                      <path d="M3 18h18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1z" fill={isDark ? '#F2F2F7' : '#1C1C1E'} stroke="none"/>
                    </svg>
                  </div>
                )}
              ].map(option => (
                <button key={option.label} onClick={option.onClick} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '10px', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
                }}>
                  {option.icon}
                  <span style={{ fontSize: '13px', color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ height: 'max(env(safe-area-inset-bottom), 62px)' }} />
          </div>
        </div>
      )}

      {/* Full Screen Image Preview Modal */}
      <AnimatePresence>
        {previewHashActive && displayIndex !== null && displayIndex >= 0 && displayIndex < images.length && (
          <ImageViewer 
            images={images} 
            initialIndex={displayIndex} 
            onClose={closePreview} 
            onChange={handleImageViewerChange} 
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: isDark ? '#3A3A3C' : '#1C1C1E',
          color: '#FFFFFF',
          padding: '12px 24px',
          borderRadius: '24px',
          fontSize: '14px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
