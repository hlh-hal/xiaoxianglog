import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { stripAllMarkdown } from '../lib/utils';
import { Check, Share, Copy, MoreVertical, Image as ImageIcon, Undo, Redo, Highlighter, Bold, Quote, List, ListOrdered, X, ArrowLeft, Trash2, History, FileText, XCircle, ChevronRight, Plus, Star, Download, Palette, Minimize2, Maximize2 } from 'lucide-react';
import { diaryService, DiaryEntry, DiaryTemplate, EditHistory, DailyEcho } from '../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import BackgroundSelector from '../components/BackgroundSelector';
import { getThemeById, calculateContrastColor } from '../config/themes';
import { ShareCard } from '../components/ShareCard';
import * as htmlToImage from 'html-to-image';
import html2canvas from 'html2canvas';
import { useTheme } from '../contexts/ThemeContext';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeModernColors, measureExportCard, pickExportScale, decodeErrorReason, waitForExportRenderReady, renderExportCanvas } from '../utils/exportImage';
import { DiaryTheme, allThemes } from '../types/theme';
import { api, getAccessToken, isAuthenticated } from '../services/apiClient';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import ImageViewer from '../components/ImageViewer';
import { AppToast } from '../components/AppToast';
import { SafeImage } from '../components/SafeImage';
import { settingsService } from '../services/settingsService';
import { createClientId } from '../utils/id';
import { generateDiaryEcho } from '../services/aiService';
import { DailyEchoExportCard, DailyEchoFloatingCard } from '../components/DailyEchoCard';
import {
  type DailyEchoCompletionStats,
  buildDailyEchoCompletionStats,
  countDiaryTextCharacters,
  createWritingActivityState,
  getActiveWritingSeconds,
  pauseWritingActivity,
  recordWritingInput,
} from '../utils/dailyEchoCompletionStats';
import { parseDailyEchoContent } from '../utils/dailyEchoQuote';
import { createAdjustedDiaryDateKey, parseDiaryDateKey } from '../utils/diaryDate';

const DiaryInlineImage = TiptapNode.create({
  name: 'diaryInlineImage',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: '日记图片',
      },
      imageKey: {
        default: null,
        parseHTML: element => element.getAttribute('data-image-key'),
        renderHTML: attributes => (
          attributes.imageKey ? { 'data-image-key': attributes.imageKey } : {}
        ),
      },
      displaySize: {
        default: 'full',
        parseHTML: element => element.getAttribute('data-display-size') === 'small' ? 'small' : 'full',
        renderHTML: attributes => ({
          'data-display-size': attributes.displaySize === 'small' ? 'small' : 'full',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-diary-inline-image]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        'data-diary-inline-image': 'true',
        class: 'diary-inline-image',
      }),
    ];
  },
});

function getInlineImageSources(html: string): Set<string> {
  const sources = new Set<string>();
  if (!html || typeof DOMParser === 'undefined') return sources;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLImageElement>('img[data-diary-inline-image]').forEach((img) => {
      if (img.src) sources.add(img.getAttribute('src') || img.src);
    });
  } catch (error) {
    console.warn('Failed to parse inline diary images:', error);
  }

  return sources;
}

const INLINE_IMAGE_REF_PREFIX = 'diary-image-ref:';

function createInlineImageRef(key: string): string {
  return `${INLINE_IMAGE_REF_PREFIX}${encodeURIComponent(key)}`;
}

function parseInlineImageRef(src?: string | null): string {
  if (!src || !src.startsWith(INLINE_IMAGE_REF_PREFIX)) return '';
  try {
    return decodeURIComponent(src.slice(INLINE_IMAGE_REF_PREFIX.length));
  } catch {
    return src.slice(INLINE_IMAGE_REF_PREFIX.length);
  }
}

function createInlineImageKey(src: string): string {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `img_${(hash >>> 0).toString(36)}_${src.length.toString(36)}`;
}

function getInlineImageKeys(html: string): Set<string> {
  const keys = new Set<string>();
  if (!html || typeof DOMParser === 'undefined') return keys;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLImageElement>('img[data-diary-inline-image]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const key = img.getAttribute('data-image-key') || parseInlineImageRef(src) || (
        src.startsWith('data:image/') ? createInlineImageKey(src) : ''
      );
      if (key) keys.add(key);
    });
  } catch (error) {
    console.warn('Failed to parse inline diary image keys:', error);
  }

  return keys;
}

function normalizeInlineImagesForStorage(
  html: string,
  getKeyForSrc: (src: string, existingKey: string) => string,
): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLImageElement>('img[data-diary-inline-image]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const existingKey = img.getAttribute('data-image-key') || parseInlineImageRef(src);
      const key = getKeyForSrc(src, existingKey);
      if (!key) return;

      img.setAttribute('data-image-key', key);
      img.setAttribute('src', createInlineImageRef(key));
    });
    return doc.body.innerHTML;
  } catch (error) {
    console.warn('Failed to normalize inline diary images:', error);
    return html;
  }
}

function hydrateInlineImagesForEditor(
  html: string,
  resolveSrc: (src: string, key: string) => string,
): string {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLImageElement>('img[data-diary-inline-image]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const key = img.getAttribute('data-image-key') || parseInlineImageRef(src) || (
        src.startsWith('data:image/') ? createInlineImageKey(src) : ''
      );
      const resolved = resolveSrc(src, key);
      if (key) img.setAttribute('data-image-key', key);
      if (resolved) img.setAttribute('src', resolved);
    });
    return doc.body.innerHTML;
  } catch (error) {
    console.warn('Failed to hydrate inline diary images:', error);
    return html;
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const [meta, data] = dataUrl.split(',');
  if (!meta || !data) return null;
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

type InlineImageDisplaySize = 'full' | 'small';

type InlineImageToolbarState = {
  pos: number;
  src: string;
  imageKey?: string;
  displaySize: InlineImageDisplaySize;
  top: number;
  left: number;
  width: number;
};

type CloseInlineImageToolbarOptions = {
  clearSelection?: boolean;
  blur?: boolean;
  focusAt?: { x: number; y: number };
};

type InlineImagePreviewSnapshot = {
  content: string;
  images: string[];
  src: string;
  hadUnsavedChanges: boolean;
  scrollTop: number;
};

type TextSelectionScrollGuard = {
  scrollTop: number;
  scrollLeft: number;
  windowScrollX: number;
  windowScrollY: number;
  pointerId: number | null;
  startX: number;
  startY: number;
  startedAt: number;
  frame: number | null;
  releaseTimer: number | null;
};

export const DiaryExportCard = ({ entry, theme, htmlContent, images }: { entry: DiaryEntry | { diaryDate: number }, theme: DiaryTheme, htmlContent: string, images: string[] }) => {
  const date = parseDiaryDateKey(entry.diaryDate);
  const day = date.getDate();
  const yearMonth = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}`;
  const weekDay = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];

  const [topBgUrl, setTopBgUrl] = useState<string | null>(null);
  const [middleBgUrl, setMiddleBgUrl] = useState<string | null>(null);
  const [bottomBgUrl, setBottomBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!theme.backgroundImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Important for html2canvas to not taint
    img.onload = () => {
      // 鎻愬崌娓叉煋绮惧害锛屾弧瓒冲鍑烘椂 scale: 3 鐨勯珮娓呰姹?
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
        // 姝ｅ悜缁樺埗
        sliceCtx.drawImage(coverCanvas, 0, startSrcY, targetW, srcHeight, 0, 0, targetW, srcHeight + 1);
        // 鍨傜洿闀滃儚缁樺埗锛屽疄鐜版棤缂?
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
      {/* 鍒嗙寮忕殑鍜岃皭鑳屾櫙灞傛瀯寤猴紝纭繚涓嶄細鍥犳媺浼镐骇鐢熷壊瑁傛劅 */}
      {theme.backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          display: 'flex', flexDirection: 'column'
        }}>
          {/* 椤堕儴鍘熷鍥炬櫙 */}
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
          {/* 涓棿閲嶅骞抽摵闀滃儚鍒囩墖锛屽疄鐜扮湡姝ｇ殑骞抽摵鍜岃皭杩炵画锛屾棤璁哄闀块兘涓嶄細鏈夊壊瑁傛垨鎷変几鍙樺舰 */}
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
          {/* 搴曢儴鍘熷鍥炬櫙 */}
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

      {/* 鑳屾櫙鍙犲姞灞?*/}
      {theme.backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          backgroundColor: theme.paperOverlay || 'transparent',
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1, flex: 1,
        display: 'flex', flexDirection: 'column' }}>

        {/* 鏃ユ湡鍖哄煙 */}
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

          {/* 鐭垎鍓茬嚎 */}
          <div style={{
            width: 44,
            height: 1,
            backgroundColor: theme.textColor.toLowerCase() === '#ffffff' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.15)',
            margin: '20px auto 0 auto',
            borderRadius: 1,
          }} />
        </div>

        {/* 姝ｆ枃鍐呭 */}
        <div style={{
          flex: 1,
          padding: '0 24px',
          color: theme.textColor,
        }}>
          <div 
            data-export-content="true"
            className={`ProseMirror prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary max-w-none text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${theme.textColor.toLowerCase() === '#ffffff' ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`}
            style={{ 
               fontFamily: 'var(--diary-font-family)',
               color: 'inherit',
               lineHeight: 'var(--diary-line-height)',
               wordBreak: 'break-word',
               overflowWrap: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
          />
        </div>

        {/* 鍥剧墖鍖哄煙锛堟湁鍥炬椂鏄剧ず锛?*/}
        {images.length > 0 && (
          <div style={{
            padding: '32px 24px 0',
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

        {/* 搴曢儴鍝佺墝鏍?*/}
        <div style={{
          padding: '24px 24px 32px',
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

type PersistReason = 'autosave' | 'manual' | 'back' | 'visibility' | 'pagehide' | 'freeze' | 'unmount' | 'abandon';

type PersistCurrentEntryOptions = {
  reason: PersistReason;
  saveHistory?: boolean;
  updateState?: boolean;
  navigateToSaved?: boolean;
  markClean?: boolean;
};

function makeEntrySignature(content: string, images: string[], backgroundId?: string, themeId?: string | null): string {
  return JSON.stringify({
    content,
    images,
    backgroundId: backgroundId || null,
    themeId: themeId || null,
  });
}

function getLocalDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/);

  paragraphs.forEach((paragraph, index) => {
    let line = '';
    Array.from(paragraph).forEach(char => {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    if (index < paragraphs.length - 1) lines.push('');
  });

  return lines;
}

function renderDailyEchoFallbackCanvas(echo: DailyEcho, date: Date) {
  const scale = 2;
  const width = 760;
  const minHeight = 1060;
  const paddingX = 72;
  const paddingTop = 68;
  const paddingBottom = 58;
  const parsedEcho = parseDailyEchoContent(echo.content);
  const quote = parsedEcho.quote;
  const content = parsedEcho.body.trim();
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Daily echo fallback canvas context unavailable');

  const contentLength = Array.from(content).length;
  const bodyFontSize = contentLength > 520 ? 21 : contentLength > 420 ? 22 : contentLength > 330 ? 24 : contentLength > 240 ? 26 : contentLength > 150 ? 30 : 34;
  const bodyLineHeight = Math.round(bodyFontSize * (contentLength > 420 ? 1.68 : contentLength > 260 ? 1.76 : 1.82));
  measureCtx.font = '700 34px "Microsoft YaHei", sans-serif';
  const quoteLines = wrapCanvasText(measureCtx, quote, width - paddingX * 2);
  const quoteLineHeight = 49;
  measureCtx.font = `${bodyFontSize}px "Microsoft YaHei", sans-serif`;
  const lines = wrapCanvasText(measureCtx, content, width - paddingX * 2);
  const bodyHeight = lines.length * bodyLineHeight;
  const quoteHeight = quoteLines.length * quoteLineHeight;
  const height = Math.max(minHeight, paddingTop + quoteHeight + 18 + 2 + 22 + 18 + 48 + bodyHeight + 96 + paddingBottom);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Daily echo fallback canvas context unavailable');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#FFFDF7';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(68,103,51,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const dateText = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  ctx.fillStyle = '#31402E';
  ctx.font = '700 34px "Microsoft YaHei", sans-serif';
  let y = paddingTop + 34;
  quoteLines.forEach(line => {
    if (line) ctx.fillText(line, paddingX, y);
    y += quoteLineHeight;
  });
  ctx.fillStyle = 'rgba(68,103,51,0.35)';
  ctx.fillRect(paddingX, y - 14, 56, 2);
  ctx.fillStyle = '#7D8876';
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText(dateText, paddingX, y + 20);

  ctx.fillStyle = '#31402E';
  ctx.font = `${bodyFontSize}px "Microsoft YaHei", sans-serif`;
  y += 20 + 48 + bodyFontSize;
  lines.forEach(line => {
    if (line) ctx.fillText(line, paddingX, y);
    y += bodyLineHeight;
  });

  const footerY = height - paddingBottom;
  ctx.fillStyle = '#7D8876';
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText('小象日志', paddingX, footerY);
  ctx.fillStyle = 'rgba(68,103,51,0.35)';
  ctx.fillRect(width - paddingX - 48, footerY - 8, 48, 2);

  return canvas;
}

export default function Editor() {
  const navigate = useNavigate();
  const location = useLocation();
  const keyboardInset = useKeyboardInset();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [existingJournal, setExistingJournal] = useState<DiaryEntry | null>(null);
  const existingJournalRef = useRef<DiaryEntry | null>(null);
  const activeEntryIdRef = useRef<string>(id || createClientId());
  const routeEntryIdRef = useRef<string | null>(id);
  const draftDiaryDateRef = useRef<string | null>(null);
  const lastPersistedSignatureRef = useRef<string>('');
  const autosaveHistoryBaselineSavedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  
  const [content, setContent] = useState('');
  const contentRef = useRef('');
  const [updateTick, setUpdateTick] = useState(0);
  const hasUnsavedChanges = useRef(false);
  const [images, setImages] = useState<string[]>([]);
  const imagesRef = useRef<string[]>([]);
  const inlineImageObjectUrlsRef = useRef<Map<string, string>>(new Map());
  const inlineImageObjectUrlKeysRef = useRef<Map<string, string>>(new Map());
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(!id);
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);
  const isEditingRef = useRef(!id);
  const backgroundIdRef = useRef<string | undefined>(undefined);
  const selectedThemeRef = useRef<DiaryTheme | null>(null);
  const templatesRef = useRef<DiaryTemplate[]>([]);
  const suppressNextEditorClickRef = useRef(false);
  const previewEntryClickGuardUntilRef = useRef(id ? Date.now() + 600 : 0);
  const previewEditorPointerDownAtRef = useRef(0);
  const keepInlineImageToolbarOnBlurRef = useRef(false);
  const inlineImageToolbarRef = useRef<InlineImageToolbarState | null>(null);
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
  const textSelectionScrollGuardRef = useRef<TextSelectionScrollGuard | null>(null);

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
  const [inlineImageToolbar, setInlineImageToolbar] = useState<InlineImageToolbarState | null>(null);
  const [previewImagesOverride, setPreviewImagesOverride] = useState<string[] | null>(null);

  const previewHashActive = location.hash === '#preview';
  const [displayIndex, setDisplayIndex] = useState<number | null>(null);
  const [nextIndex, setNextIndex] = useState<number | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const isNavigatingToPreview = useRef(false);
  const inlinePreviewSnapshotRef = useRef<InlineImagePreviewSnapshot | null>(null);

  const setImagesWithRef = useCallback((nextImages: string[] | ((prev: string[]) => string[])) => {
    const next = typeof nextImages === 'function'
      ? nextImages(imagesRef.current)
      : nextImages;
    imagesRef.current = next;
    setImages(next);
    return next;
  }, []);

  const findImageByInlineKey = useCallback((key: string, sourceImages = imagesRef.current) => {
    if (!key) return '';
    return sourceImages.find(src => createInlineImageKey(src) === key) || '';
  }, []);

  const registerInlineImageObjectUrl = useCallback((key: string, url: string) => {
    if (!key || !url.startsWith('blob:')) return;
    const previous = inlineImageObjectUrlsRef.current.get(key);
    if (previous && previous !== url) {
      URL.revokeObjectURL(previous);
      inlineImageObjectUrlKeysRef.current.delete(previous);
    }
    inlineImageObjectUrlsRef.current.set(key, url);
    inlineImageObjectUrlKeysRef.current.set(url, key);
  }, []);

  const resolveInlineImageForEditor = useCallback((
    src: string,
    key = '',
    sourceImages = imagesRef.current,
  ) => {
    const imageKey = key || parseInlineImageRef(src);
    const attachmentSrc = imageKey ? findImageByInlineKey(imageKey, sourceImages) : '';
    const resolvedSrc = attachmentSrc || (src.startsWith(INLINE_IMAGE_REF_PREFIX) ? '' : src);
    if (!resolvedSrc) return '';

    if (resolvedSrc.startsWith('data:image/')) {
      const stableKey = imageKey || createInlineImageKey(resolvedSrc);
      const existing = inlineImageObjectUrlsRef.current.get(stableKey);
      if (existing) return existing;

      const blob = dataUrlToBlob(resolvedSrc);
      if (!blob) return resolvedSrc;
      const objectUrl = URL.createObjectURL(blob);
      registerInlineImageObjectUrl(stableKey, objectUrl);
      return objectUrl;
    }

    if (resolvedSrc.startsWith('blob:') && imageKey) {
      inlineImageObjectUrlKeysRef.current.set(resolvedSrc, imageKey);
    }
    return resolvedSrc;
  }, [findImageByInlineKey, registerInlineImageObjectUrl]);

  const hydrateContentForEditor = useCallback((html: string, sourceImages = imagesRef.current) => (
    hydrateInlineImagesForEditor(html, (src, key) => (
      resolveInlineImageForEditor(src, key, sourceImages)
    ))
  ), [resolveInlineImageForEditor]);

  const normalizeContentForStorage = useCallback((html: string) => (
    normalizeInlineImagesForStorage(html, (src, existingKey) => {
      if (
        src
        && !src.startsWith('blob:')
        && !src.startsWith('data:image/')
        && !src.startsWith(INLINE_IMAGE_REF_PREFIX)
      ) {
        return '';
      }
      if (existingKey) return existingKey;
      const objectKey = inlineImageObjectUrlKeysRef.current.get(src);
      if (objectKey) return objectKey;
      if (src.startsWith('data:image/')) return createInlineImageKey(src);
      const attachment = imagesRef.current.find(imageSrc => imageSrc === src);
      return attachment ? createInlineImageKey(attachment) : '';
    })
  ), []);

  const getDefaultDisplayImagesForContent = useCallback((html: string, sourceImages: string[]) => {
    const inlineImageSources = getInlineImageSources(html);
    const inlineImageKeys = getInlineImageKeys(html);
    inlineImageSources.forEach(src => {
      const key = inlineImageObjectUrlKeysRef.current.get(src) || parseInlineImageRef(src) || (
        src.startsWith('data:image/') ? createInlineImageKey(src) : ''
      );
      if (key) inlineImageKeys.add(key);
    });
    return sourceImages.filter(src => (
      !inlineImageSources.has(src) && !inlineImageKeys.has(createInlineImageKey(src))
    ));
  }, []);

  useEffect(() => () => {
    inlineImageObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    inlineImageObjectUrlsRef.current.clear();
    inlineImageObjectUrlKeysRef.current.clear();
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    routeEntryIdRef.current = id;
    if (id) {
      activeEntryIdRef.current = id;
    }
  }, [id]);

  useEffect(() => {
    existingJournalRef.current = existingJournal;
    if (existingJournal) {
      activeEntryIdRef.current = existingJournal.id;
      draftDiaryDateRef.current = existingJournal.diaryDate;
    }
  }, [existingJournal]);

  useEffect(() => {
    backgroundIdRef.current = backgroundId;
  }, [backgroundId]);

  useEffect(() => {
    selectedThemeRef.current = selectedTheme;
  }, [selectedTheme]);

  useEffect(() => {
    isEditingRef.current = isEditing && !previewHashActive;
  }, [isEditing, previewHashActive]);

  useEffect(() => {
    previewEntryClickGuardUntilRef.current = id ? Date.now() + 600 : 0;
  }, [id]);

  const getDraftDiaryDate = useCallback(() => {
    if (existingJournalRef.current?.diaryDate) {
      return existingJournalRef.current.diaryDate;
    }
    if (!draftDiaryDateRef.current) {
      const now = new Date();
      let autoAdjustTime = false;
      try {
        autoAdjustTime = settingsService.getSettings().autoAdjustTime;
      } catch (error) {
        console.warn('Failed to read diary time settings:', error);
      }
      draftDiaryDateRef.current = createAdjustedDiaryDateKey(now, autoAdjustTime);
    }
    return draftDiaryDateRef.current;
  }, []);

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

  const stopTextSelectionScrollGuard = useCallback(() => {
    const guard = textSelectionScrollGuardRef.current;
    if (!guard) return;

    if (guard.frame !== null) {
      window.cancelAnimationFrame(guard.frame);
    }
    if (guard.releaseTimer !== null) {
      window.clearTimeout(guard.releaseTimer);
    }
    textSelectionScrollGuardRef.current = null;
  }, []);

  const ensureTextSelectionScrollGuard = useCallback((
    pointerId: number | null,
    startX = 0,
    startY = 0,
  ) => {
    if (!isEditingRef.current) return null;

    const scrollEl = editorScrollRef.current;
    if (!scrollEl) return null;

    let guard = textSelectionScrollGuardRef.current;
    if (!guard) {
      guard = {
        scrollTop: scrollEl.scrollTop,
        scrollLeft: scrollEl.scrollLeft,
        windowScrollX: window.scrollX,
        windowScrollY: window.scrollY,
        pointerId,
        startX,
        startY,
        startedAt: Date.now(),
        frame: null,
        releaseTimer: null,
      };
      textSelectionScrollGuardRef.current = guard;
    } else {
      guard.pointerId = pointerId ?? guard.pointerId;
      guard.startX = startX || guard.startX;
      guard.startY = startY || guard.startY;
      if (guard.releaseTimer !== null) {
        window.clearTimeout(guard.releaseTimer);
        guard.releaseTimer = null;
      }
    }

    return guard;
  }, []);

  const getEditorTextSelectionRects = useCallback(() => {
    const editorDom = editorInstanceRef.current?.view.dom;
    const selection = window.getSelection();

    if (!editorDom || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode) return null;

    if (!editorDom.contains(anchorNode) || !editorDom.contains(focusNode)) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter(rect => (
      rect.width > 0 && rect.height > 0
    ));

    return rects.length > 0 ? rects : null;
  }, []);

  const isSelectionInsideScrollSafeArea = useCallback((rects: DOMRect[]) => {
    const scrollEl = editorScrollRef.current;
    if (!scrollEl) return false;

    const containerRect = scrollEl.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const visualTop = visualViewport?.offsetTop ?? 0;
    const visualBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : window.innerHeight;
    const topBoundary = Math.max(containerRect.top, visualTop) + 76;
    const bottomInset = keyboardInset > 0 ? 72 : 140;
    const bottomBoundary = Math.min(containerRect.bottom, visualBottom) - bottomInset;

    if (bottomBoundary <= topBoundary) return false;

    return rects.every(rect => (
      rect.top >= topBoundary && rect.bottom <= bottomBoundary
    ));
  }, [keyboardInset]);

  const restoreTextSelectionScrollGuard = useCallback(() => {
    const guard = textSelectionScrollGuardRef.current;
    const scrollEl = editorScrollRef.current;
    if (!guard || !scrollEl) return false;

    const rects = getEditorTextSelectionRects();
    if (!rects) return false;

    if (!isSelectionInsideScrollSafeArea(rects)) {
      return true;
    }

    if (scrollEl.scrollTop !== guard.scrollTop) {
      scrollEl.scrollTop = guard.scrollTop;
    }
    if (scrollEl.scrollLeft !== guard.scrollLeft) {
      scrollEl.scrollLeft = guard.scrollLeft;
    }
    if (window.scrollX !== guard.windowScrollX || window.scrollY !== guard.windowScrollY) {
      window.scrollTo(guard.windowScrollX, guard.windowScrollY);
    }

    return true;
  }, [getEditorTextSelectionRects, isSelectionInsideScrollSafeArea]);

  const scheduleTextSelectionScrollGuard = useCallback(() => {
    const guard = textSelectionScrollGuardRef.current;
    if (!guard) return false;

    if (guard.frame !== null) {
      window.cancelAnimationFrame(guard.frame);
      guard.frame = null;
    }

    let remainingFrames = 8;
    const restoreFrame = () => {
      const activeGuard = textSelectionScrollGuardRef.current;
      if (!activeGuard) return;

      restoreTextSelectionScrollGuard();
      remainingFrames -= 1;

      if (remainingFrames > 0) {
        activeGuard.frame = window.requestAnimationFrame(restoreFrame);
      } else {
        activeGuard.frame = null;
      }
    };

    restoreTextSelectionScrollGuard();
    guard.frame = window.requestAnimationFrame(restoreFrame);
    return true;
  }, [restoreTextSelectionScrollGuard]);

  const releaseTextSelectionScrollGuard = useCallback((delay = 700) => {
    const guard = textSelectionScrollGuardRef.current;
    if (!guard) return;

    if (guard.releaseTimer !== null) {
      window.clearTimeout(guard.releaseTimer);
    }
    guard.releaseTimer = window.setTimeout(() => {
      stopTextSelectionScrollGuard();
    }, delay);
  }, [stopTextSelectionScrollGuard]);

  const isEditorTextSelectionActive = useCallback(() => (
    getEditorTextSelectionRects() !== null
  ), [getEditorTextSelectionRects]);

  const startTextSelectionScrollGuard = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!isEditingRef.current) return;

    const target = e.target as HTMLElement;
    const editorEl = e.currentTarget.querySelector('.ProseMirror');
    const isEditorTextTarget = Boolean(editorEl?.contains(target));
    const isInteractiveTarget = Boolean(target.closest(
      'button,a,input,textarea,select,[role="button"],[data-inline-image-toolbar],img[data-diary-inline-image]',
    ));

    if (!isEditorTextTarget || isInteractiveTarget) return;

    ensureTextSelectionScrollGuard(e.pointerId, e.clientX, e.clientY);
  }, [ensureTextSelectionScrollGuard]);

  const handleTextSelectionPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const guard = textSelectionScrollGuardRef.current;
    if (!guard || (guard.pointerId !== null && guard.pointerId !== e.pointerId)) {
      return false;
    }

    const hasSelection = isEditorTextSelectionActive();
    if (hasSelection) {
      scheduleTextSelectionScrollGuard();
      return true;
    }

    const moved = Math.hypot(e.clientX - guard.startX, e.clientY - guard.startY);
    if (moved > 12 && Date.now() - guard.startedAt < 450) {
      stopTextSelectionScrollGuard();
    }

    return false;
  }, [isEditorTextSelectionActive, scheduleTextSelectionScrollGuard, stopTextSelectionScrollGuard]);

  const handleTextSelectionTouchMove = useCallback(() => {
    if (!textSelectionScrollGuardRef.current && !isEditorTextSelectionActive()) {
      return false;
    }

    if (!textSelectionScrollGuardRef.current) {
      ensureTextSelectionScrollGuard(null);
    }

    scheduleTextSelectionScrollGuard();
    releaseTextSelectionScrollGuard();
    return isEditorTextSelectionActive();
  }, [ensureTextSelectionScrollGuard, isEditorTextSelectionActive, releaseTextSelectionScrollGuard, scheduleTextSelectionScrollGuard]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!isEditingRef.current || !isEditorTextSelectionActive()) return;

      ensureTextSelectionScrollGuard(null);
      scheduleTextSelectionScrollGuard();
      releaseTextSelectionScrollGuard(1400);
    };

    const handleEditorScroll = () => {
      if (!textSelectionScrollGuardRef.current || !isEditorTextSelectionActive()) return;
      scheduleTextSelectionScrollGuard();
    };

    const scrollEl = editorScrollRef.current;
    document.addEventListener('selectionchange', handleSelectionChange);
    scrollEl?.addEventListener('scroll', handleEditorScroll, { passive: true });

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      scrollEl?.removeEventListener('scroll', handleEditorScroll);
    };
  }, [ensureTextSelectionScrollGuard, isEditorTextSelectionActive, releaseTextSelectionScrollGuard, scheduleTextSelectionScrollGuard]);

  const finishTapScrollLock = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const lock = tapScrollLockRef.current;
    if (!lock || lock.pointerId !== e.pointerId || lock.moved) return false;

    const target = e.target as HTMLElement;
    const inlineImageTarget = target.closest('img[data-diary-inline-image]');
    if (inlineImageTarget) {
      stopTapScrollLock();
      return false;
    }

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
  }, [focusEditorAtPointWithoutScroll, releaseTapScrollLock, restoreTapScrollLock, stopTapScrollLock]);

  useEffect(() => () => {
    stopInputScrollLock();
    stopTapScrollLock();
    stopTextSelectionScrollGuard();
  }, [stopInputScrollLock, stopTapScrollLock, stopTextSelectionScrollGuard]);

  const restoreInlinePreviewSnapshot = useCallback(() => {
    const snapshot = inlinePreviewSnapshotRef.current;
    if (!snapshot) return;

    inlinePreviewSnapshotRef.current = null;
    const activeEditor = editorInstanceRef.current;
    if (activeEditor && activeEditor.getHTML() !== snapshot.content) {
      activeEditor.commands.setContent(snapshot.content, { emitUpdate: false });
    }
    setContent(snapshot.content);
    setImagesWithRef(snapshot.images);
    hasUnsavedChanges.current = snapshot.hadUnsavedChanges;

    window.requestAnimationFrame(() => {
      if (editorScrollRef.current) {
        editorScrollRef.current.scrollTop = snapshot.scrollTop;
      }
    });
  }, [setImagesWithRef]);

  useEffect(() => {
    if (previewHashActive) {
      isNavigatingToPreview.current = false;
      return;
    }

    if (!isNavigatingToPreview.current) {
      restoreInlinePreviewSnapshot();
      if (displayIndex !== null) setDisplayIndex(null);
      if (previewImage !== null) setPreviewImage(null);
      if (previewImagesOverride !== null) setPreviewImagesOverride(null);
    }
  }, [previewHashActive, displayIndex, previewImage, previewImagesOverride, restoreInlinePreviewSnapshot]);

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
    restoreInlinePreviewSnapshot();
    if (location.hash === '#preview') {
      navigate(-1);
    } else {
      setDisplayIndex(null);
      setPreviewImage(null);
      setPreviewImagesOverride(null);
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
        // 濡傛灉瀹藉害鏀瑰彉锛堟瘮濡傛í绔栧睆鍒囨崲锛夛紝鎵嶆洿鏂伴珮搴︼紱鍗曠函楂樺害缂╁皬锛堟瘮濡傚脊绐楄緭鍏ユ硶锛変笉鏇存柊
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

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

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
      if (window.confirm('纭鍒犻櫎姝ゆā鏉匡紵')) {
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
  const [dailyEcho, setDailyEcho] = useState<DailyEcho | undefined>();
  const [isEchoGenerating, setIsEchoGenerating] = useState(false);
  const [isEchoImageSaving, setIsEchoImageSaving] = useState(false);
  const [dailyEchoCompletionStats, setDailyEchoCompletionStats] = useState<DailyEchoCompletionStats | null>(null);
  const [dailyEchoFloatEnabled, setDailyEchoFloatEnabled] = useState(
    () => settingsService.getSettings().dailyEchoFloatEnabled,
  );
  const [isEchoFloatMutedToday, setIsEchoFloatMutedToday] = useState(
    () => localStorage.getItem('daily_echo_float_muted_date') === getLocalDateKey(),
  );
  const [isEchoFloatScrollHidden, setIsEchoFloatScrollHidden] = useState(false);
  const echoFloatScrollTimerRef = useRef<number | null>(null);
  const echoGenerationTokenRef = useRef(0);
  const writingActivityRef = useRef(createWritingActivityState());
  const hasWritingActivitySinceManualSaveRef = useRef(false);
  const lastManualSaveSignatureRef = useRef('');
  const lastManualSaveWritingSecondsRef = useRef(0);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    setDailyEcho(existingJournal?.dailyEcho);
  }, [
    existingJournal?.id,
    existingJournal?.dailyEcho?.status,
    existingJournal?.dailyEcho?.generatedAt,
    existingJournal?.dailyEcho?.card?.renderedAt,
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const hideDailyEchoFloatBriefly = useCallback(() => {
    setIsEchoFloatScrollHidden(true);
    if (echoFloatScrollTimerRef.current) {
      window.clearTimeout(echoFloatScrollTimerRef.current);
    }
    echoFloatScrollTimerRef.current = window.setTimeout(() => {
      setIsEchoFloatScrollHidden(false);
      echoFloatScrollTimerRef.current = null;
    }, 900);
  }, []);

  const recordWritingActivity = useCallback(() => {
    writingActivityRef.current = recordWritingInput(writingActivityRef.current);
    hasWritingActivitySinceManualSaveRef.current = true;
    setDailyEchoCompletionStats(null);
  }, []);

  const pauseCurrentWritingActivity = useCallback(() => {
    writingActivityRef.current = pauseWritingActivity(writingActivityRef.current);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseCurrentWritingActivity();
      }
    };
    window.addEventListener('pagehide', pauseCurrentWritingActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', pauseCurrentWritingActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pauseCurrentWritingActivity]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'app_settings') {
        setDailyEchoFloatEnabled(settingsService.getSettings().dailyEchoFloatEnabled);
      }
      if (event.key === 'daily_echo_float_muted_date') {
        setIsEchoFloatMutedToday(event.newValue === getLocalDateKey());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (echoFloatScrollTimerRef.current) {
        window.clearTimeout(echoFloatScrollTimerRef.current);
      }
    };
  }, []);

  const getInlineImageToolbarPosition = useCallback((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const width = Math.min(336, window.innerWidth - 32);
    const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + rect.width / 2 - width / 2));
    const top = Math.max(
      88,
      Math.min(window.innerHeight - 74, rect.top + rect.height * 0.58),
    );
    return { top, left, width };
  }, []);

  const showInlineImageToolbar = useCallback((
    pos: number,
    attrs: { src?: string; imageKey?: string; displaySize?: string },
    img: HTMLImageElement,
  ) => {
    const position = getInlineImageToolbarPosition(img);
    const nextToolbar: InlineImageToolbarState = {
      pos,
      src: attrs.src || img.getAttribute('src') || '',
      imageKey: attrs.imageKey,
      displaySize: attrs.displaySize === 'small' ? 'small' : 'full',
      ...position,
    };
    inlineImageToolbarRef.current = nextToolbar;
    setInlineImageToolbar(nextToolbar);
  }, [getInlineImageToolbarPosition]);

  const refreshInlineImageToolbar = useCallback(() => {
    setInlineImageToolbar(current => {
      if (!current) {
        inlineImageToolbarRef.current = null;
        return null;
      }
      const activeEditor = editorInstanceRef.current;
      const node = activeEditor?.state.doc.nodeAt(current.pos);
      if (!node || node.type.name !== 'diaryInlineImage') {
        inlineImageToolbarRef.current = null;
        return null;
      }

      const selectedImg = activeEditor?.view.dom.querySelector<HTMLImageElement>(
        '.diary-inline-image.ProseMirror-selectednode',
      );
      const img = selectedImg || Array.from(
        activeEditor?.view.dom.querySelectorAll<HTMLImageElement>('.diary-inline-image') || [],
      ).find(candidate => candidate.getAttribute('src') === node.attrs.src);
      if (!img) {
        inlineImageToolbarRef.current = null;
        return null;
      }

      const nextToolbar: InlineImageToolbarState = {
        ...current,
        src: node.attrs.src || current.src,
        imageKey: node.attrs.imageKey || current.imageKey,
        displaySize: node.attrs.displaySize === 'small' ? 'small' : 'full',
        ...getInlineImageToolbarPosition(img),
      };
      inlineImageToolbarRef.current = nextToolbar;
      return nextToolbar;
    });
  }, [getInlineImageToolbarPosition]);

  const closeInlineImageToolbar = useCallback((options: CloseInlineImageToolbarOptions = {}) => {
    inlineImageToolbarRef.current = null;
    setInlineImageToolbar(null);

    if (!options.clearSelection) return;

    const activeEditor = editorInstanceRef.current;
    const view = activeEditor?.view;
    if (!activeEditor || !view) return;

    const { state } = activeEditor;
    const { selection, doc } = state;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'diaryInlineImage') {
      if (options.blur) {
        activeEditor.commands.blur();
      }
      return;
    }

    let nextSelection: ReturnType<typeof TextSelection.near> | null = null;
    const position = options.focusAt
      ? view.posAtCoords({ left: options.focusAt.x, top: options.focusAt.y })
      : null;

    try {
      if (position) {
        const safePos = Math.max(0, Math.min(position.pos, doc.content.size));
        nextSelection = TextSelection.near(doc.resolve(safePos));
      } else {
        const safePos = Math.max(0, Math.min(selection.to, doc.content.size));
        nextSelection = TextSelection.near(doc.resolve(safePos), 1);
      }
    } catch (error) {
      console.warn('Failed to clear inline image selection:', error);
    }

    if (nextSelection) {
      view.dispatch(state.tr.setSelection(nextSelection));
    }
    if (options.blur) {
      activeEditor.commands.blur();
    }
  }, []);

  const blurEditorForInlineImageToolbar = useCallback(() => {
    keepInlineImageToolbarOnBlurRef.current = true;
    setIsFocused(false);

    const activeEditor = editorInstanceRef.current;
    const activeElement = document.activeElement as HTMLElement | null;
    const editorDom = activeEditor?.view.dom as HTMLElement | undefined;
    activeEditor?.commands.blur();
    if (activeElement && editorDom?.contains(activeElement)) {
      activeElement.blur();
    }
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
    editorDom?.blur();
  }, []);

  const brieflySuppressEditorClick = useCallback(() => {
    suppressNextEditorClickRef.current = true;
    window.setTimeout(() => {
      suppressNextEditorClickRef.current = false;
    }, 120);
  }, []);

  const ensureInlineImageEditingMode = useCallback(() => {
    if (previewHashActive) return;
    const activeEditor = editorInstanceRef.current;
    isEditingRef.current = true;
    setIsEditing(true);
    activeEditor?.setEditable(true);
  }, [previewHashActive]);

  const findInlineImageNodePos = useCallback((img: HTMLImageElement) => {
    const activeEditor = editorInstanceRef.current;
    if (!activeEditor) return null;

    const doc = activeEditor.state.doc;
    const src = img.getAttribute('src') || img.src;
    const candidates: number[] = [];

    try {
      const domPos = activeEditor.view.posAtDOM(img, 0);
      candidates.push(domPos, domPos - 1, domPos + 1);
    } catch (error) {
      console.warn('Failed to resolve inline image DOM position:', error);
    }

    for (const pos of candidates) {
      if (pos < 0 || pos > doc.content.size) continue;
      const node = doc.nodeAt(pos);
      if (node?.type.name === 'diaryInlineImage' && (!src || node.attrs.src === src)) {
        return pos;
      }
    }

    let foundPos: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'diaryInlineImage' && (!src || node.attrs.src === src)) {
        foundPos = pos;
        return false;
      }
      return true;
    });

    return foundPos;
  }, []);

  const selectInlineImageFromElement = useCallback((img: HTMLImageElement) => {
    const activeEditor = editorInstanceRef.current;
    if (!activeEditor) return false;

    const pos = findInlineImageNodePos(img);
    if (pos === null) return false;

    const node = activeEditor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'diaryInlineImage') return false;

    ensureInlineImageEditingMode();

    const selection = activeEditor.state.selection;
    if (!(selection instanceof NodeSelection && selection.from === pos && selection.node.type.name === 'diaryInlineImage')) {
      activeEditor.view.dispatch(
        activeEditor.state.tr.setSelection(NodeSelection.create(activeEditor.state.doc, pos)),
      );
    }
    showInlineImageToolbar(pos, node.attrs, img);
    blurEditorForInlineImageToolbar();
    return true;
  }, [blurEditorForInlineImageToolbar, ensureInlineImageEditingMode, findInlineImageNodePos, showInlineImageToolbar]);

  const getActiveInlineImageForPreview = useCallback(() => {
    const activeEditor = editorInstanceRef.current;
    if (!activeEditor) return null;

    const getPreviewSrc = (attrs: any, fallbackSrc = '') => {
      const src = (attrs?.src as string | undefined) || fallbackSrc;
      const key = (attrs?.imageKey as string | undefined) || parseInlineImageRef(src);
      return resolveInlineImageForEditor(src || '', key || '');
    };

    const selection = activeEditor.state.selection;
    if (selection instanceof NodeSelection && selection.node.type.name === 'diaryInlineImage') {
      const src = getPreviewSrc(selection.node.attrs);
      if (src) return { pos: selection.from, src };
    }

    const selectedImg = activeEditor.view.dom.querySelector<HTMLImageElement>(
      'img[data-diary-inline-image].ProseMirror-selectednode',
    );
    if (selectedImg) {
      const pos = findInlineImageNodePos(selectedImg);
      const node = pos === null ? null : activeEditor.state.doc.nodeAt(pos);
      const src = getPreviewSrc(node?.attrs, selectedImg.getAttribute('src') || selectedImg.src);
      if (pos !== null && src) return { pos, src };
    }

    const toolbar = inlineImageToolbarRef.current;
    if (toolbar) {
      const node = activeEditor.state.doc.nodeAt(toolbar.pos);
      if (node?.type.name === 'diaryInlineImage' && node.attrs.src) {
        const src = getPreviewSrc(node.attrs, toolbar.src);
        if (src) return { pos: toolbar.pos, src };
      }
    }

    return null;
  }, [findInlineImageNodePos, resolveInlineImageForEditor]);

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
    const exportImages = getDefaultDisplayImagesForContent(htmlContent, images);

    // 涓存椂鎸傝浇鍒?body
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:0;left:-9999px;z-index:-1;pointer-events:none;';
    document.body.appendChild(wrapper);

    // 鐢?ReactDOM 娓叉煋瀵煎嚭鍗＄墖
    const root = createRoot(wrapper);
    root.render(
      <DiaryExportCard 
        entry={existingJournal || { diaryDate: displayDate.getTime() }} 
        theme={currentTheme} 
        htmlContent={htmlContent}
        images={exportImages}
      />
    );

    // 绛夊緟 React 娓叉煋
    await new Promise(r => setTimeout(r, 100));

    try {
      const el = wrapper.querySelector('#diary-export-card') as HTMLElement;
      if (!el) throw new Error('Export card not found');

      // 绛夊緟鍔ㄦ€佽儗鏅敓鎴愬畬姣?
      let attempts = 0;
      while (el.getAttribute('data-ready') !== 'true' && attempts < 50) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
      }

      // 绛夊緟鍥剧墖鍔犺浇瀹屾垚
      const imgElements = Array.from(el.querySelectorAll('img'));
      await Promise.all(imgElements.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // 棰濆绛夊緟涓€涓嬩互纭繚甯冨眬绋冲畾
      await waitForExportRenderReady(el);

      // bugfix: diary-export-long-text-fails (Requirement 2.1)
      // 1) 涓讳慨锛氬厛鎶?oklch/oklab/lab/lch 褰掍竴鍖栨垚 rgb锛岄伩鍏?html2canvas 瑙ｆ瀽澶辫触锛?
      // 2) 娆＄骇闃茬嚎锛氭寜鍗＄墖楂樺害鎸?scale锛堥粯璁?2锛岃繃楂樻椂闄嶇骇锛夛紝闃叉鐗╃悊 canvas 瓒呴檺锛?
      // 3) 鏃犺 html2canvas 鎴愬姛澶辫触锛宖inally 閲岄兘瑕?restoreColors() 鍥炴粴 inline style銆?
      const { cardH } = measureExportCard(el);
      const scale = pickExportScale(cardH);
      const restoreColors = sanitizeModernColors(el);

      let canvas: HTMLCanvasElement;
      try {
        canvas = await renderExportCanvas(el, html2canvas, scale);
      } finally {
        restoreColors();
      }

      // bugfix: diary-export-long-text-fails (Task 3.4锛孯equirement 2.3 棰勭暀)
      // 娆＄骇闃茬嚎鍏滃簳锛氳嫢 html2canvas 杩斿洖鐨?canvas 鏄┖鐨?/ toDataURL 杩斿洖 "data:,"锛?
      // 璇存槑鐗╃悊 canvas 灏哄 / 闈㈢Н瑙﹀強娴忚鍣ㄤ笂闄愶紙iOS Safari 4096px銆丄ndroid WebView 鏇翠綆锛夛紝
      // 鎶涘嚭鍚?"canvas size" 鐨勯敊璇蛋 decodeErrorReason 鈫?'oversize' 鈫?瀵瑰簲鐨?toast銆?
      const dataUrl = canvas.toDataURL('image/png');
      if (canvas.width === 0 || canvas.height === 0 || dataUrl === 'data:,') {
        throw new Error(
          `canvas size exceeded safe limit (width=${canvas.width}, height=${canvas.height})`
        );
      }

      root.unmount();
      document.body.removeChild(wrapper);

      // 鍏煎 Capacitor 鍘熺敓 App 鐜
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
          showToast('已保存到文件夹');
        } catch (capErr) {
          console.error('Capacitor 淇濆瓨澶辫触:', capErr);
          showToast('保存失败，请重试');
        }
      } else {
        // Web 娴忚鍣ㄧ幆澧冿細鐩存帴涓嬭浇
        const link = document.createElement('a');
        link.download = `小象日志_${format(displayDate, 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        link.click();
        showToast('图片已下载');
      }
    } catch (error) {
      console.error('瀵煎嚭鍥剧墖澶辫触:', error);
      const reason = decodeErrorReason(error);
      if (reason === 'unsupported_color') {
        showToast('导出失败：主题颜色不兼容');
      } else if (reason === 'oversize') {
        showToast('导出失败：内容过长');
      } else if (reason === 'io') {
        showToast('导出失败：存储权限不足');
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
    showToast('功能还在开发中，敬请期待');
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
      const data = await response.json().catch(() => ({ error: '鍥剧墖涓婁紶澶辫触' }));
      throw new Error(data.error || '鍥剧墖涓婁紶澶辫触');
    }

    const data = await response.json();
    return [...remoteImages, ...(data.urls || [])];
  };

  const shareToCircle = async () => {
    setShowShare(false);

    if (!user || !getAccessToken()) {
      alert('璇峰厛鐧诲綍鍚庡啀鍒嗕韩鍒版棩蹇楀湀');
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

    showToast('姝ｅ湪鍙戝竷鍒版棩蹇楀湀...');
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
  const preventInlineImageFocus = useCallback((event: Event, shouldPreventDefault = true) => {
    const target = event.target as HTMLElement | null;
    const img = target?.closest('img[data-diary-inline-image]') as HTMLImageElement | null;
    if (!img) return false;

    if (shouldPreventDefault && event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    return true;
  }, []);

  const selectInlineImageFromEvent = useCallback((event: Event, shouldPreventDefault = true) => {
    const target = event.target as HTMLElement | null;
    const img = target?.closest('img[data-diary-inline-image]') as HTMLImageElement | null;
    if (!img) return false;

    if (shouldPreventDefault && event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    brieflySuppressEditorClick();
    selectInlineImageFromElement(img);
    return true;
  }, [brieflySuppressEditorClick, selectInlineImageFromElement]);

  const lockEditorScrollDomEvents = {
    pointerdown: (_view: unknown, event: PointerEvent) => preventInlineImageFocus(event),
    mousedown: (_view: unknown, event: MouseEvent) => preventInlineImageFocus(event),
    touchstart: (_view: unknown, event: TouchEvent) => preventInlineImageFocus(event, false),
    pointerup: (_view: unknown, event: PointerEvent) => selectInlineImageFromEvent(event),
    click: (_view: unknown, event: MouseEvent) => selectInlineImageFromEvent(event),
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
      StarterKit.configure({
        trailingNode: false,
      }),
      Highlight.configure({
        HTMLAttributes: {
          class: 'bg-primary/20 text-primary rounded px-1',
        },
      }),
      Placeholder.configure({
        placeholder: '写点什么...',
      }),
      DiaryInlineImage,
      Markdown,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
      hasUnsavedChanges.current = true;
      recordWritingActivity();
      closeInlineImageToolbar();
      lockScrollForEditorInput();
    },
    onSelectionUpdate: ({ editor }) => {
      // Force re-render for toolbar formatting states when cursor moves
      setUpdateTick(t => t + 1);
      const selection = editor.state.selection;
      if (selection instanceof NodeSelection && selection.node.type.name === 'diaryInlineImage') {
        ensureInlineImageEditingMode();
        window.requestAnimationFrame(() => {
          const img = editor.view.dom.querySelector<HTMLImageElement>(
            '.diary-inline-image.ProseMirror-selectednode',
          );
          if (img) {
            showInlineImageToolbar(selection.from, selection.node.attrs, img);
            blurEditorForInlineImageToolbar();
          }
        });
      } else {
        closeInlineImageToolbar();
      }
    },
    onTransaction: () => {
      setUpdateTick(t => t + 1);
    },
    onFocus: () => {
      setIsFocused(true);
    },
    onBlur: () => {
      setIsFocused(false);
      pauseCurrentWritingActivity();
      if (keepInlineImageToolbarOnBlurRef.current) {
        keepInlineImageToolbarOnBlurRef.current = false;
        return;
      }
      closeInlineImageToolbar({ clearSelection: true, blur: true });
    },
    editorProps: {
      attributes: {
        class: `prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg max-w-none min-h-[60vh] focus:outline-none caret-primary text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${isDarkBg ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`,
      },
      handleDOMEvents: lockEditorScrollDomEvents,
      handleClickOn: (view, _pos, node, nodePos, event) => {
        if (node.type.name !== 'diaryInlineImage') return false;
        const target = event.target as HTMLElement | null;
        const img = target?.closest('img[data-diary-inline-image]') as HTMLImageElement | null;
        const nodeDom = view.nodeDOM(nodePos) as HTMLImageElement | null;
        const imageElement = img || nodeDom;
        if (!imageElement) return false;

        event.preventDefault();
        event.stopPropagation();
        brieflySuppressEditorClick();
        selectInlineImageFromElement(imageElement);
        return true;
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('img[data-diary-inline-image]') && !target?.closest('[data-inline-image-toolbar]')) {
          closeInlineImageToolbar({ clearSelection: true, focusAt: { x: event.clientX, y: event.clientY } });
        }
        return false;
      },
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
      editor.setEditable(isEditing && !previewHashActive);
      if (previewHashActive) {
        editor.commands.blur();
      }
    }
  }, [isEditing, previewHashActive, editor]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg max-w-none min-h-[60vh] focus:outline-none caret-primary text-[var(--diary-font-size)] leading-[var(--diary-line-height)] ${isDarkBg ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface'}`,
          },
          handleDOMEvents: lockEditorScrollDomEvents,
          handleClickOn: (view, _pos, node, nodePos, event) => {
            if (node.type.name !== 'diaryInlineImage') return false;
            const target = event.target as HTMLElement | null;
            const img = target?.closest('img[data-diary-inline-image]') as HTMLImageElement | null;
            const nodeDom = view.nodeDOM(nodePos) as HTMLImageElement | null;
            const imageElement = img || nodeDom;
            if (!imageElement) return false;

            event.preventDefault();
            event.stopPropagation();
            brieflySuppressEditorClick();
            selectInlineImageFromElement(imageElement);
            return true;
          },
          handleClick: (_view, _pos, event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest('img[data-diary-inline-image]') && !target?.closest('[data-inline-image-toolbar]')) {
              closeInlineImageToolbar({ clearSelection: true, focusAt: { x: event.clientX, y: event.clientY } });
            }
            return false;
          },
          handleScrollToSelection: () => true,
        }
      });
    }
  }, [isDarkBg, editor, closeInlineImageToolbar, brieflySuppressEditorClick, selectInlineImageFromElement, preventInlineImageFocus, selectInlineImageFromEvent]);

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
        if (existingJournalRef.current?.id === id) return;
        const data = await diaryService.getEntryById(id);
        if (data) {
          existingJournalRef.current = data;
          writingActivityRef.current = createWritingActivityState((data.activeWritingSeconds || 0) * 1_000);
          hasWritingActivitySinceManualSaveRef.current = false;
          activeEntryIdRef.current = data.id;
          draftDiaryDateRef.current = data.diaryDate;
          setExistingJournal(data);
          const loadedImages = data.images?.filter((img: string) => typeof img === 'string' && img.trim() !== '') || [];
          setImagesWithRef(loadedImages);
          let loadedContent = data.content || '';
          if (data.blocks && data.blocks.length > 0) {
            loadedContent = data.blocks.map(b => `<p><strong>${b.title}</strong></p><p>${b.content.replace(/\n/g, '<br>')}</p>`).join('<p><br></p>');
          }
          loadedContent = hydrateContentForEditor(loadedContent, loadedImages);
          contentRef.current = loadedContent;
          setContent(loadedContent);
          if (editor) {
            editor.commands.setContent(loadedContent, { emitUpdate: false });
          }
          lastPersistedSignatureRef.current = makeEntrySignature(
            normalizeContentForStorage(loadedContent),
            loadedImages,
            data.backgroundId,
            data.themeId,
          );
          lastManualSaveSignatureRef.current = lastPersistedSignatureRef.current;
          lastManualSaveWritingSecondsRef.current = data.activeWritingSeconds || 0;
          hasUnsavedChanges.current = false;
          autosaveHistoryBaselineSavedRef.current = false;
          backgroundIdRef.current = data.backgroundId;
          setBackgroundId(data.backgroundId);
          if (data.themeId) {
            const theme = allThemes.find(t => t.id === data.themeId);
            if (theme) {
              selectedThemeRef.current = theme;
              setSelectedTheme(theme);
            }
          } else {
            const defaultTheme = allThemes.find(t => t.id === 'warm-white');
            if (defaultTheme) {
              selectedThemeRef.current = defaultTheme;
              setSelectedTheme(defaultTheme);
            }
          }
        }
      };
      loadJournal();
    } else {
      if (existingJournalRef.current) return;
      // New diary, load preferred template
      const initNewDiary = async () => {
        writingActivityRef.current = createWritingActivityState();
        hasWritingActivitySinceManualSaveRef.current = false;
        lastManualSaveSignatureRef.current = '';
        lastManualSaveWritingSecondsRef.current = 0;
        draftDiaryDateRef.current = draftDiaryDateRef.current || getDraftDiaryDate();
        const lastThemeId = localStorage.getItem('lastUsedDiaryThemeId');
        const defaultTheme = allThemes.find(t => t.id === lastThemeId) || allThemes.find(t => t.id === 'warm-white');
        if (defaultTheme) {
          selectedThemeRef.current = defaultTheme;
          setSelectedTheme(defaultTheme);
        }

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
        contentRef.current = initialContent;
        setContent(initialContent);
        if (editor) {
          editor.commands.setContent(initialContent, { emitUpdate: false });
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
  }, [id, editor, getDraftDiaryDate, hydrateContentForEditor, normalizeContentForStorage, setImagesWithRef]);

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

      const currentContent = normalizeContentForStorage(editor?.getHTML() || content);
      // Skip if content is identical to last saved history snapshot
      if (currentContent === lastHistoryContentRef.current) return;
      // Skip if content is empty or just whitespace
      const plainText = stripAllMarkdown(currentContent).trim();
      if (!plainText && imagesRef.current.length === 0) return;

      // Save snapshot
      lastHistoryContentRef.current = currentContent;
      diaryService.saveHistory({
        entryId: existingJournal.id,
        content: currentContent,
        images: imagesRef.current,
        savedAt: new Date().toISOString(),
      }).catch(err => console.warn('Auto-save history failed:', err));
    }, INTERVAL_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [existingJournal?.id, isEditing, editor, content, normalizeContentForStorage]);

  // Save history on page hide / visibility change (user switches app or closes tab)
  useEffect(() => {
    if (!existingJournal || !isEditing) return;

    const saveOnHide = () => {
      if (!hasUnsavedChanges.current) return;
      const currentContent = normalizeContentForStorage(editor?.getHTML() || content);
      if (currentContent === lastHistoryContentRef.current) return;
      const plainText = stripAllMarkdown(currentContent).trim();
      if (!plainText && imagesRef.current.length === 0) return;

      lastHistoryContentRef.current = currentContent;
      // Use sendBeacon-style fire-and-forget
      diaryService.saveHistory({
        entryId: existingJournal.id,
        content: currentContent,
        images: imagesRef.current,
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
  }, [existingJournal?.id, isEditing, editor, content, normalizeContentForStorage]);

  const insertImageAfterCurrentBlock = useCallback((src: string, imageKey?: string) => {
    const activeEditor = editorInstanceRef.current;
    if (!activeEditor) return false;

    const { state, view } = activeEditor;
    const imageType = state.schema.nodes.diaryInlineImage;
    const paragraphType = state.schema.nodes.paragraph;
    if (!imageType || !paragraphType) return false;

    const imageNode = imageType.create({ src, imageKey: imageKey || null, alt: '日记图片' });
    const paragraphNode = paragraphType.create();
    const topLevelDepth = state.selection.$from.depth > 0 ? 1 : 0;
    const currentBlock = topLevelDepth > 0 ? state.selection.$from.node(topLevelDepth) : null;
    const isEmptyCurrentLine = currentBlock?.type.name === 'paragraph' && currentBlock.content.size === 0;
    const currentTextOffset = state.selection.$from.parentOffset;
    const currentTextSize = state.selection.$from.parent.content.size;
    let tr = state.tr;
    let imagePos = state.selection.from;
    let cursorPosAfterInsert: number | null = null;

    if (isEmptyCurrentLine && topLevelDepth > 0) {
      imagePos = state.selection.$from.before(topLevelDepth);
      tr = tr.replaceWith(imagePos, state.selection.$from.after(topLevelDepth), imageNode);
    } else if (topLevelDepth > 0 && currentBlock?.isTextblock) {
      if (currentTextOffset === 0) {
        imagePos = state.selection.$from.before(topLevelDepth);
        tr = tr.insert(imagePos, imageNode);
      } else if (currentTextOffset === currentTextSize) {
        imagePos = state.selection.$from.after(topLevelDepth);
        tr = tr.insert(imagePos, [imageNode, paragraphNode]);
        cursorPosAfterInsert = imagePos + imageNode.nodeSize + 1;
      } else {
        imagePos = state.selection.from;
        tr = tr.insert(imagePos, imageNode);
      }
    } else {
      tr = tr.insert(imagePos, [imageNode, paragraphNode]);
      cursorPosAfterInsert = imagePos + imageNode.nodeSize + 1;
    }

    try {
      let selectedImagePos = imagePos;
      if (cursorPosAfterInsert === null) {
        const insertedImagePositions: number[] = [];
        tr.doc.descendants((node, pos) => {
          if (node.type === imageType && (node.attrs.src === src || (imageKey && node.attrs.imageKey === imageKey))) {
            insertedImagePositions.push(pos);
          }
          return true;
        });

        if (insertedImagePositions.length > 0) {
          const mappedImagePos = tr.mapping.map(imagePos, 1);
          selectedImagePos = insertedImagePositions.reduce((closest, pos) => (
            Math.abs(pos - mappedImagePos) < Math.abs(closest - mappedImagePos) ? pos : closest
          ));
        }
      }

      tr.setSelection(
        cursorPosAfterInsert !== null
          ? TextSelection.create(tr.doc, cursorPosAfterInsert)
          : NodeSelection.create(tr.doc, selectedImagePos),
      );
    } catch (error) {
      console.warn('Failed to place cursor after inline diary image:', error);
    }

    view.dispatch(tr);
    view.focus();
    return true;
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const shouldInsertInline = settingsService.getSettings().inlineImagesInEditor;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const imageKey = createInlineImageKey(base64);
        const nextImages = [...imagesRef.current, base64];
        setImagesWithRef(nextImages);
        if (shouldInsertInline) {
          const objectUrl = URL.createObjectURL(file);
          registerInlineImageObjectUrl(imageKey, objectUrl);
          insertImageAfterCurrentBlock(objectUrl, imageKey);
        }
        hasUnsavedChanges.current = true;
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (indexToRemove: number) => {
    setImagesWithRef(prev => prev.filter((_, index) => index !== indexToRemove));
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

  const getPlainTextForPersist = useCallback((html: string) => {
    const editorText = editorInstanceRef.current?.getText()?.trim();
    return editorText || stripAllMarkdown(html).trim();
  }, []);

  const isNewEntryWithoutMeaningfulContent = useCallback((html: string, nextImages: string[]) => {
    if (nextImages.length > 0) return false;

    const plainText = getPlainTextForPersist(html);
    if (!plainText) return true;

    const systemText = SYSTEM_TEMPLATE.replace(/<[^>]*>?/gm, '').trim();
    if (plainText === systemText) return true;

    const prefId = localStorage.getItem('preferredTemplateId');
    if (prefId && prefId !== 'system') {
      const prefTpl = templatesRef.current.find(t => t.id === prefId);
      const prefText = prefTpl?.content.replace(/<[^>]*>?/gm, '').trim();
      if (prefText && plainText === prefText) return true;
    }

    return false;
  }, [getPlainTextForPersist]);

  const persistCurrentEntry = useCallback(async ({
    reason,
    saveHistory,
    updateState = true,
    navigateToSaved = true,
    markClean = true,
  }: PersistCurrentEntryOptions): Promise<DiaryEntry | undefined> => {
    if (!isEditingRef.current && reason !== 'manual' && reason !== 'back' && reason !== 'abandon') {
      return existingJournalRef.current || undefined;
    }

    const currentContent = normalizeContentForStorage(
      editorInstanceRef.current?.getHTML() || contentRef.current,
    );
    const currentImages = imagesRef.current.filter((img: string) => typeof img === 'string' && img.trim() !== '');
    const currentBackgroundId = backgroundIdRef.current;
    const currentThemeId = selectedThemeRef.current?.id;
    const existingEntry = existingJournalRef.current;
    const signature = makeEntrySignature(currentContent, currentImages, currentBackgroundId, currentThemeId);
    const finalizedWritingActivity = pauseWritingActivity(writingActivityRef.current);
    writingActivityRef.current = finalizedWritingActivity;
    const activeWritingSeconds = Math.max(
      existingEntry?.activeWritingSeconds || 0,
      getActiveWritingSeconds(finalizedWritingActivity),
    );

    if (!hasUnsavedChanges.current && existingEntry && signature === lastPersistedSignatureRef.current) {
      return existingEntry;
    }

    if (!existingEntry && isNewEntryWithoutMeaningfulContent(currentContent, currentImages)) {
      return undefined;
    }

    const shouldSaveHistory = saveHistory ?? (
      reason !== 'autosave' || Boolean(existingEntry && !autosaveHistoryBaselineSavedRef.current)
    );
    let savedEntry: DiaryEntry | undefined;

    if (existingEntry) {
      savedEntry = await diaryService.updateEntry(existingEntry.id, {
        content: currentContent,
        images: currentImages,
        backgroundId: currentBackgroundId,
        themeId: currentThemeId,
        activeWritingSeconds,
      }, {
        saveHistory: shouldSaveHistory,
        immediateSync: reason !== 'autosave',
      });
    } else {
      const entryId = activeEntryIdRef.current || createClientId();
      activeEntryIdRef.current = entryId;
      savedEntry = await diaryService.createEntry({
        id: entryId,
        content: currentContent,
        images: currentImages,
        diaryDate: getDraftDiaryDate(),
        backgroundId: currentBackgroundId,
        themeId: currentThemeId,
        activeWritingSeconds,
      }, {
        saveHistory: shouldSaveHistory,
        immediateSync: reason !== 'autosave',
      });
    }

    if (!savedEntry) return undefined;

    if (reason === 'autosave' && shouldSaveHistory) {
      autosaveHistoryBaselineSavedRef.current = true;
    }

    const latestContent = normalizeContentForStorage(
      editorInstanceRef.current?.getHTML() || contentRef.current,
    );
    const latestSignature = makeEntrySignature(
      latestContent,
      imagesRef.current,
      backgroundIdRef.current,
      selectedThemeRef.current?.id,
    );

    existingJournalRef.current = savedEntry;
    writingActivityRef.current = createWritingActivityState((savedEntry.activeWritingSeconds || activeWritingSeconds) * 1_000);
    activeEntryIdRef.current = savedEntry.id;
    draftDiaryDateRef.current = savedEntry.diaryDate;
    lastPersistedSignatureRef.current = signature;

    if (markClean && latestSignature === signature) {
      hasUnsavedChanges.current = false;
    } else if (latestSignature !== signature) {
      hasUnsavedChanges.current = true;
    }

    if (updateState && isMountedRef.current) {
      setExistingJournal(savedEntry);
      if (
        navigateToSaved
        && routeEntryIdRef.current !== savedEntry.id
        && document.visibilityState !== 'hidden'
      ) {
        routeEntryIdRef.current = savedEntry.id;
        navigate(`/editor?id=${savedEntry.id}`, { replace: true });
      }
    }

    return savedEntry;
  }, [getDraftDiaryDate, isNewEntryWithoutMeaningfulContent, navigate, normalizeContentForStorage]);

  const getEntryPlainText = (entry: DiaryEntry) => {
    if (typeof document === 'undefined') {
      return (entry.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const node = document.createElement('div');
    node.innerHTML = entry.content || '';
    return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const persistDailyEcho = async (nextEcho: DailyEcho): Promise<DiaryEntry | undefined> => {
    const entry = existingJournalRef.current;
    if (!entry) return undefined;
    const updated = await diaryService.updateEntry(entry.id, { dailyEcho: nextEcho }, {
      saveHistory: false,
      immediateSync: true,
    });
    if (updated) {
      existingJournalRef.current = updated;
      setExistingJournal(updated);
      setDailyEcho(updated.dailyEcho);
    }
    return updated;
  };

  const startDailyEchoGeneration = async (entry: DiaryEntry, force = false) => {
    const currentEcho = force ? dailyEcho || entry.dailyEcho : entry.dailyEcho;
    if (!force && (currentEcho?.status === 'saved' || currentEcho?.status === 'dismissed')) return;
    if (!force && currentEcho?.status === 'draft' && currentEcho.content && currentEcho.sourceEntryUpdatedAt === entry.updatedAt) {
      setDailyEcho(currentEcho);
      return;
    }
    if (getEntryPlainText(entry).length < 6) return;

    if (!isAuthenticated()) {
      setDailyEcho({
        status: 'failed',
        content: '需要登录后才可以生成小象回声。',
        styleId: 'gentle',
        generatedAt: new Date().toISOString(),
        sourceEntryUpdatedAt: entry.updatedAt,
        regenerateCount: currentEcho?.regenerateCount || 0,
      });
      showToast('登录后可生成小象回声');
      return;
    }

    const token = echoGenerationTokenRef.current + 1;
    echoGenerationTokenRef.current = token;
    setIsEchoGenerating(true);
    if (force || !currentEcho || currentEcho.status === 'failed') {
      setDailyEcho(undefined);
    }

    try {
      const nextRegenerateCount = force ? (currentEcho?.regenerateCount || 0) + 1 : (currentEcho?.regenerateCount || 0);
      const content = await generateDiaryEcho(entry, nextRegenerateCount);
      if (echoGenerationTokenRef.current !== token) return;
      setDailyEcho({
        status: 'draft',
        content,
        styleId: 'gentle',
        generatedAt: new Date().toISOString(),
        sourceEntryUpdatedAt: entry.updatedAt,
        regenerateCount: nextRegenerateCount,
      });
    } catch (error) {
      console.warn('Failed to generate daily echo:', error);
      if (echoGenerationTokenRef.current !== token) return;
      setDailyEcho({
        status: 'failed',
        content: '',
        styleId: 'gentle',
        generatedAt: new Date().toISOString(),
        sourceEntryUpdatedAt: entry.updatedAt,
        regenerateCount: currentEcho?.regenerateCount || 0,
      });
    } finally {
      if (echoGenerationTokenRef.current === token) {
        setIsEchoGenerating(false);
      }
    }
  };

  const handleSaveDailyEcho = async () => {
    if (!dailyEcho || dailyEcho.status === 'failed') return;
    await persistDailyEcho({ ...dailyEcho, status: 'saved' });
    showToast('小象回声已收进这篇');
  };

  const handleDismissDailyEcho = async () => {
    const entry = existingJournalRef.current;
    const now = new Date().toISOString();
    const dismissedEcho: DailyEcho = {
      status: 'dismissed',
      content: '',
      styleId: 'gentle',
      generatedAt: now,
      sourceEntryUpdatedAt: entry?.updatedAt || now,
      regenerateCount: dailyEcho?.regenerateCount || entry?.dailyEcho?.regenerateCount || 0,
    };
    if (entry) {
      await persistDailyEcho(dismissedEcho);
    } else {
      setDailyEcho(dismissedEcho);
    }
    showToast('这篇日记不会再生成小象回声');
  };

  const handleRegenerateDailyEcho = () => {
    const entry = existingJournalRef.current;
    if (!entry) return;
    void startDailyEchoGeneration(entry, true);
  };

  const handleContinueDailyEchoChat = () => {
    const entry = existingJournalRef.current;
    if (!entry || !dailyEcho?.content) return;
    navigate('/ai-chat', {
      state: {
        source: 'daily-echo',
        entryId: entry.id,
        entryDate: entry.diaryDate,
        diaryText: getEntryPlainText(entry).slice(0, 1800),
        echoText: dailyEcho.content,
      },
    });
  };

  const handleCloseDailyEchoNotebook = () => {
    setDailyEchoCompletionStats(null);
    navigate('/');
  };

  const handleSaveDailyEchoImage = async () => {
    const entry = existingJournalRef.current;
    const echo = dailyEcho;
    if (!entry || !echo || echo.status !== 'saved') return;

    setIsEchoImageSaving(true);
    setExporting(true);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.pointerEvents = 'none';
    document.body.appendChild(wrapper);
    const root = createRoot(wrapper);

    try {
      root.render(<DailyEchoExportCard echo={echo} date={parseDiaryDateKey(entry.diaryDate)} />);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const el = wrapper.firstElementChild as HTMLElement | null;
      if (!el) throw new Error('Daily echo export card is not ready');
      const restoreColors = sanitizeModernColors(el);
      let canvas: HTMLCanvasElement;
      try {
        const exportWidth = Math.ceil(el.scrollWidth || el.offsetWidth);
        const exportHeight = Math.ceil(el.scrollHeight || el.offsetHeight);
        try {
          canvas = await html2canvas(el, {
            useCORS: true,
            allowTaint: false,
            scale: exportHeight > 1400 || window.innerWidth < 480 ? 1.5 : 2,
            backgroundColor: null,
            logging: false,
            width: exportWidth,
            height: exportHeight,
            windowWidth: exportWidth,
            windowHeight: exportHeight,
          });
          if (canvas.width === 0 || canvas.height === 0) {
            throw new Error(`Daily echo html2canvas returned empty canvas (${canvas.width}x${canvas.height})`);
          }
        } catch (renderError) {
          console.warn('Daily echo html2canvas failed, using fallback canvas:', renderError);
          canvas = renderDailyEchoFallbackCanvas(echo, parseDiaryDateKey(entry.diaryDate));
        }
      } finally {
        restoreColors();
      }
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl || dataUrl === 'data:,') throw new Error('Daily echo image export failed');
      const nextEcho: DailyEcho = {
        ...echo,
        status: 'saved',
        card: {
          ...echo.card,
          localDataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
          renderedAt: new Date().toISOString(),
        },
      };
      await persistDailyEcho(nextEcho);
      showToast('小象回声图片已保存到图库');
    } catch (error) {
      console.error('Failed to save daily echo image:', error);
      showToast('小象回声图片保存失败');
    } finally {
      root.unmount();
      if (document.body.contains(wrapper)) {
        document.body.removeChild(wrapper);
      }
      setExporting(false);
      setIsEchoImageSaving(false);
    }
  };

  const handleSave = async (goBack = false) => {
    if (isSavingRef.current) return;
    const currentSignatureBeforeSave = makeEntrySignature(
      normalizeContentForStorage(editorInstanceRef.current?.getHTML() || contentRef.current),
      imagesRef.current.filter((img: string) => typeof img === 'string' && img.trim() !== ''),
      backgroundIdRef.current,
      selectedThemeRef.current?.id,
    );
    const pendingWritingSecondsBeforeSave = getActiveWritingSeconds(writingActivityRef.current);
    const hadManualWritingActivity = hasWritingActivitySinceManualSaveRef.current
      || pendingWritingSecondsBeforeSave > lastManualSaveWritingSecondsRef.current
      || currentSignatureBeforeSave !== lastManualSaveSignatureRef.current;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const savedEntry = await persistCurrentEntry({
        reason: goBack ? 'back' : 'manual',
        saveHistory: true,
        navigateToSaved: !goBack,
      });
      
      if (goBack) {
        goBackSafely();
      } else {
        setIsEditing(false);
        editor?.commands.blur();
        if (savedEntry) {
          const savedSignature = makeEntrySignature(
            savedEntry.content,
            savedEntry.images || [],
            savedEntry.backgroundId,
            savedEntry.themeId,
          );
          const savedWritingSeconds = savedEntry.activeWritingSeconds || 0;
          const shouldShowCompletionFeedback = hadManualWritingActivity
            || savedWritingSeconds > lastManualSaveWritingSecondsRef.current
            || savedSignature !== lastManualSaveSignatureRef.current;

          if (shouldShowCompletionFeedback && countDiaryTextCharacters(savedEntry.content) > 0) {
            writingActivityRef.current = pauseWritingActivity(writingActivityRef.current);
            const activeEntries = await diaryService.getActiveEntries();
            const stats = buildDailyEchoCompletionStats(savedEntry, activeEntries, writingActivityRef.current);
            setDailyEchoCompletionStats({
              ...stats,
              activeWritingMinutes: Math.max(1, stats.activeWritingMinutes),
            });
            hasWritingActivitySinceManualSaveRef.current = false;
          } else {
            setDailyEchoCompletionStats(null);
          }
          lastManualSaveSignatureRef.current = savedSignature;
          lastManualSaveWritingSecondsRef.current = savedWritingSeconds;
          void startDailyEchoGeneration(savedEntry);
        }
      }
    } catch (error) {
      console.error("Error saving diary:", error);
      showToast(error instanceof Error ? error.message : '淇濆瓨澶辫触锛岃閲嶈瘯');
      if (goBack) {
        goBackSafely();
      }
    } finally {
      isSavingRef.current = false;
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

        if (isEmptyOrTemplate() && !existingJournal && imagesRef.current.length === 0) {
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

  useEffect(() => {
    if (!isEditing || previewHashActive || !hasUnsavedChanges.current) return;

    const timer = window.setTimeout(() => {
      void persistCurrentEntry({
        reason: 'autosave',
        navigateToSaved: true,
      }).catch(error => console.warn('Diary entry autosave failed:', error));
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [backgroundId, content, images, isEditing, persistCurrentEntry, previewHashActive, selectedTheme?.id]);

  useEffect(() => {
    const flush = (reason: PersistReason) => {
      void persistCurrentEntry({
        reason,
        saveHistory: true,
        updateState: false,
        navigateToSaved: false,
        markClean: false,
      }).catch(error => console.warn(`Diary lifecycle save failed (${reason}):`, error));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush('visibility');
    };
    const handlePageHide = () => flush('pagehide');
    const handleFreeze = () => flush('freeze');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('freeze', handleFreeze);

    return () => {
      flush('unmount');
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('freeze', handleFreeze);
    };
  }, [persistCurrentEntry]);

  const displayDate = existingJournal
    ? parseDiaryDateKey(existingJournal.diaryDate)
    : parseDiaryDateKey(draftDiaryDateRef.current || Date.now());
  
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
  // bugfix: 杞敭鐩樺脊鍑烘椂锛宭ayout viewport 鍦ㄩ儴鍒嗗畨鍗撴祻瑙堝櫒涓笉浼氱缉灏忥紝
  // 瀵艰嚧 <main> 娌℃湁婧㈠嚭銆佸畬鍏ㄦ棤娉曟粴鍔紝鐭枃妗堟椂鍏夋爣浼氳杈撳叆娉曢伄鎸°€?
  // 杩欓噷鎶?keyboardInset 鍔犲埌搴曢儴 padding锛岀‘淇濇湁瓒冲鐨勫彲婊氬姩绌洪棿鎶婂厜鏍囨粴鍒板彲瑙嗗尯銆?
  // 棰濆鍔?40vh 鐨勭┖鐧斤紝璁╃敤鎴峰湪缂栬緫鏃跺厜鏍囦笅鏂瑰缁堟湁鑸掗€傜殑鐣欑櫧绌洪棿銆?
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
    ...(selectedTheme
      ? {
          backgroundColor: selectedTheme.backgroundImage ? 'transparent' : selectedTheme.toolbarColor,
          color: selectedTheme.textColor,
        }
      : {}),
  };
  const toolbarBottomOffset = keyboardInset > 0
    ? '8px'
    : 'max(8px, env(safe-area-inset-bottom))';
  const templateEditorBottomInset = keyboardInset > 0
    ? `${keyboardInset}px`
    : '0px';
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
  const defaultDisplayImages = getDefaultDisplayImagesForContent(content, images);
  const activePreviewImages = previewImagesOverride ?? images;
  const shouldShowInlineImageToolbar = Boolean(inlineImageToolbar && isEditing && !previewHashActive);
  const shouldHideDailyEchoForBlockingOverlay = !dailyEchoFloatEnabled
    || isEchoFloatMutedToday
    || showThemeBar
    || showShare
    || isMenuOpen
    || isTemplateModalOpen
    || isTemplateEditorOpen
    || isHistoryModalOpen
    || isAbandonConfirmOpen
    || isRestoreConfirmOpen
    || isBackgroundSelectorOpen
    || previewHashActive
    || shouldShowInlineImageToolbar
    || exporting;
  const shouldHideDailyEchoFloat = shouldHideDailyEchoForBlockingOverlay
    || keyboardInset > 0
    || isEchoFloatScrollHidden;
  const shouldHideDailyEchoCard = dailyEchoCompletionStats
    ? shouldHideDailyEchoForBlockingOverlay
    : shouldHideDailyEchoFloat;

  const toggleInlineImageSize = () => {
    if (!inlineImageToolbar || !editor) return;
    const node = editor.state.doc.nodeAt(inlineImageToolbar.pos);
    if (!node || node.type.name !== 'diaryInlineImage') {
      closeInlineImageToolbar({ clearSelection: true, blur: true });
      return;
    }

    const nextSize: InlineImageDisplaySize = node.attrs.displaySize === 'small' ? 'full' : 'small';
    const tr = editor.state.tr.setNodeMarkup(inlineImageToolbar.pos, undefined, {
      ...node.attrs,
      displaySize: nextSize,
    });
    tr.setSelection(NodeSelection.create(tr.doc, inlineImageToolbar.pos));
    editor.view.dispatch(tr);
    blurEditorForInlineImageToolbar();
    hasUnsavedChanges.current = true;
    setContent(editor.getHTML());
    setInlineImageToolbar(prev => prev ? { ...prev, displaySize: nextSize } : prev);
    window.requestAnimationFrame(refreshInlineImageToolbar);
  };

  const copyInlineImageToClipboard = async () => {
    if (!inlineImageToolbar?.src) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('clipboard image unsupported');
      }
      const copySrc = resolveInlineImageForEditor(
        inlineImageToolbar.src,
        inlineImageToolbar.imageKey || parseInlineImageRef(inlineImageToolbar.src),
      );
      const response = await fetch(copySrc);
      const blob = await response.blob();
      const type = blob.type || 'image/png';
      await navigator.clipboard.write([
        new ClipboardItem({ [type]: blob }),
      ]);
      showToast('图片已复制');
    } catch (error) {
      console.warn('Failed to copy inline image:', error);
      showToast('当前浏览器不支持复制图片');
    }
  };

  const openInlineImagePreview = () => {
    const activeInlineImage = getActiveInlineImageForPreview();
    const activeEditor = editorInstanceRef.current;
    if (!activeInlineImage || !activeEditor) return;

    const inlineSrc = activeInlineImage.src;
    const currentContent = activeEditor.getHTML();
    inlinePreviewSnapshotRef.current = {
      content: currentContent,
      images: [...imagesRef.current],
      src: inlineSrc,
      hadUnsavedChanges: hasUnsavedChanges.current,
      scrollTop: editorScrollRef.current?.scrollTop || 0,
    };
    setContent(currentContent);
    activeEditor.setEditable(false);
    activeEditor.commands.blur();
    closeInlineImageToolbar({ clearSelection: true, blur: true });
    blurEditorForInlineImageToolbar();
    setIsFocused(false);

    setPreviewImagesOverride([inlineSrc]);
    setDisplayIndex(0);
    setNextIndex(null);
    setIsCrossfading(false);
    if (location.hash !== '#preview' && !isNavigatingToPreview.current) {
      isNavigatingToPreview.current = true;
      navigate('#preview');
    }
  };

  const deleteInlineImage = () => {
    if (!inlineImageToolbar || !editor) return;
    const node = editor.state.doc.nodeAt(inlineImageToolbar.pos);
    if (!node || node.type.name !== 'diaryInlineImage') {
      closeInlineImageToolbar({ clearSelection: true, blur: true });
      return;
    }

    const inlineSrc = node.attrs.src || inlineImageToolbar.src || '';
    const inlineKey = node.attrs.imageKey
      || inlineImageToolbar.imageKey
      || parseInlineImageRef(inlineSrc)
      || inlineImageObjectUrlKeysRef.current.get(inlineSrc)
      || (inlineSrc.startsWith('data:image/') ? createInlineImageKey(inlineSrc) : '');
    const attachmentSrc = inlineKey
      ? findImageByInlineKey(inlineKey)
      : (imagesRef.current.includes(inlineSrc) ? inlineSrc : '');

    const tr = editor.state.tr.delete(inlineImageToolbar.pos, inlineImageToolbar.pos + node.nodeSize);
    editor.view.dispatch(tr);
    const nextContent = editor.getHTML();

    if (attachmentSrc) {
      const remainingInlineSources = getInlineImageSources(nextContent);
      const remainingInlineKeys = getInlineImageKeys(nextContent);
      remainingInlineSources.forEach(src => {
        const key = inlineImageObjectUrlKeysRef.current.get(src) || parseInlineImageRef(src) || (
          src.startsWith('data:image/') ? createInlineImageKey(src) : ''
        );
        if (key) remainingInlineKeys.add(key);
      });

      const stillReferenced = inlineKey
        ? remainingInlineKeys.has(inlineKey)
        : remainingInlineSources.has(attachmentSrc);

      if (!stillReferenced) {
        setImagesWithRef(prev => prev.filter(src => (
          inlineKey ? createInlineImageKey(src) !== inlineKey : src !== attachmentSrc
        )));
        if (inlineKey) {
          const objectUrl = inlineImageObjectUrlsRef.current.get(inlineKey);
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            inlineImageObjectUrlsRef.current.delete(inlineKey);
            inlineImageObjectUrlKeysRef.current.delete(objectUrl);
          }
        }
      }
    }

    blurEditorForInlineImageToolbar();
    hasUnsavedChanges.current = true;
    setContent(nextContent);
    closeInlineImageToolbar();
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
          {/* 鏃ц儗鏅贰鍑?*/}
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

          {/* 鏂拌儗鏅贰鍏?*/}
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
            {/* 鍙犲姞灞備篃鏈夎繃娓?*/}
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
          selectedTheme?.backgroundImage || selectedTheme?.toolbarColor === 'transparent' ? '' : 'backdrop-blur-xl'
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
        className={`fixed inset-x-0 top-0 bottom-0 z-10 overflow-y-auto overscroll-contain ${shouldShowInlineImageToolbar ? 'inline-image-toolbar-active' : ''}`}
        style={editorScrollStyle}
        onTouchMove={() => {
          hideDailyEchoFloatBriefly();
          if (handleTextSelectionTouchMove()) return;
          stopInputScrollLock();
          closeInlineImageToolbar({ clearSelection: true });
        }}
        onWheel={() => {
          hideDailyEchoFloatBriefly();
          stopInputScrollLock();
          closeInlineImageToolbar({ clearSelection: true, blur: true });
        }}
        onScroll={hideDailyEchoFloatBriefly}
        onPointerMove={(e) => {
          if (handleTextSelectionPointerMove(e)) return;
          updateTapScrollLockMove(e);
        }}
        onPointerDown={(e) => {
          const editorEl = (e.currentTarget as HTMLElement).querySelector('.ProseMirror');
          if (!isEditing && editorEl?.contains(e.target as Node)) {
            previewEditorPointerDownAtRef.current = Date.now();
          }
          startTextSelectionScrollGuard(e);
          startTapScrollLock(e);
        }}
        onPointerUp={(e) => {
          const img = (e.target as HTMLElement).closest('img[data-diary-inline-image]') as HTMLImageElement | null;
          if (img) {
            e.preventDefault();
            e.stopPropagation();
            brieflySuppressEditorClick();
            selectInlineImageFromElement(img);
            stopTapScrollLock();
            return;
          }
          if (isEditorTextSelectionActive()) {
            scheduleTextSelectionScrollGuard();
            releaseTextSelectionScrollGuard();
            stopTapScrollLock();
            return;
          }
          stopTextSelectionScrollGuard();
          finishTapScrollLock(e);
        }}
        onPointerCancel={() => {
          stopTextSelectionScrollGuard();
          stopTapScrollLock();
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const editorEl = (e.currentTarget as HTMLElement).querySelector('.ProseMirror');
          const isEditorTap = Boolean(editorEl && editorEl.contains(e.target as Node));
          const isBlankSurfaceTap = target === e.currentTarget || target.dataset.editorBlankSurface === 'true';
          const clickedInlineImage = target.closest('img[data-diary-inline-image]');
          if (showThemeBar) {
            setShowThemeBar(false);
          }
          if (isBackgroundSelectorOpen) {
            setIsBackgroundSelectorOpen(false);
          }
          if (clickedInlineImage) {
            e.preventDefault();
            e.stopPropagation();
            suppressNextEditorClickRef.current = false;
            selectInlineImageFromElement(clickedInlineImage as HTMLImageElement);
            blurEditorForInlineImageToolbar();
            return;
          }
          if (suppressNextEditorClickRef.current) {
            suppressNextEditorClickRef.current = false;
            return;
          }
          if (!isEditing) {
            const hasFreshEditorPointerDown = Date.now() - previewEditorPointerDownAtRef.current < 1000;
            if (!isEditorTap || (Date.now() < previewEntryClickGuardUntilRef.current && !hasFreshEditorPointerDown)) {
              closeInlineImageToolbar({ clearSelection: true });
              return;
            }
            closeInlineImageToolbar({ clearSelection: true, focusAt: { x: e.clientX, y: e.clientY } });
            setIsEditing(true);
            setTimeout(() => {
              if (!focusEditorAtPointWithoutScroll(e.clientX, e.clientY)) {
                editor?.commands.focus(undefined, { scrollIntoView: false });
              }
            }, 10);
          } else {
            // 鍙湁褰撶偣鍑诲彂鐢熷湪缂栬緫鍣ㄥ唴瀹瑰尯鍩熷唴鏃舵墠 re-focus锛?
            // 閬垮厤鐐瑰嚮搴曢儴绌虹櫧鍖哄煙鏃惰Е鍙?scrollIntoView 鎶婇〉闈㈣烦鍥炲厜鏍囦綅缃€?
            closeInlineImageToolbar({ clearSelection: true, focusAt: { x: e.clientX, y: e.clientY } });
            if (isEditorTap || isBlankSurfaceTap) {
              if (!focusEditorAtPointWithoutScroll(e.clientX, e.clientY)) {
                editor?.commands.focus(undefined, { scrollIntoView: false });
              }
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

              {defaultDisplayImages.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  {defaultDisplayImages.length === 1 ? (
                    <div 
                      style={{ margin: '8px 0', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                      className="group"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(images.indexOf(defaultDisplayImages[0]));
                      }}
                    >
                      <SafeImage src={defaultDisplayImages[0]} style={{
                        width: '100%', aspectRatio: '4/3',
                        objectFit: 'cover', display: 'block'
                      }} />
                      {isEditing && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(images.indexOf(defaultDisplayImages[0])); }}
                          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : defaultDisplayImages.length === 2 ? (
                    <div style={{ 
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '3px', margin: '8px 0',
                      borderRadius: '12px', overflow: 'hidden' 
                    }}>
                      {defaultDisplayImages.map((src) => {
                        const originalIndex = images.indexOf(src);
                        return (
                        <div 
                          key={src}
                          style={{ aspectRatio: '1/1', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                          className="group"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(originalIndex);
                          }}
                        >
                          <SafeImage src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {isEditing && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeImage(originalIndex); }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ 
                      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '3px', margin: '8px 0',
                      borderRadius: '12px', overflow: 'hidden' 
                    }}>
                      {defaultDisplayImages.map((src) => {
                        const originalIndex = images.indexOf(src);
                        return (
                        <div 
                          key={src}
                          style={{ aspectRatio: '1/1', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                          className="group"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(originalIndex);
                          }}
                        >
                          <SafeImage src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {isEditing && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeImage(originalIndex); }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full opacity-100 transition-opacity backdrop-blur-md z-10"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <DailyEchoFloatingCard
        echo={dailyEcho}
        isGenerating={isEchoGenerating}
        isSavingImage={isEchoImageSaving}
        completionStats={dailyEchoCompletionStats}
        hidden={shouldHideDailyEchoCard}
        onSave={dailyEcho?.status === 'draft' ? handleSaveDailyEcho : undefined}
        onRegenerate={existingJournal ? handleRegenerateDailyEcho : undefined}
        onDismiss={existingJournal ? handleDismissDailyEcho : undefined}
        onContinueChat={dailyEcho?.content ? handleContinueDailyEchoChat : undefined}
        onSaveImage={dailyEcho?.status === 'saved' ? handleSaveDailyEchoImage : undefined}
        onCloseDiary={handleCloseDailyEchoNotebook}
      />

      {shouldShowInlineImageToolbar && inlineImageToolbar && (
        <div
          data-inline-image-toolbar="true"
          data-testid="inline-image-toolbar"
          className="fixed z-[70] flex items-center justify-between rounded-[22px] border border-outline-variant/30 bg-white/95 px-3 py-2 text-[#3A3A3A] shadow-[0_4px_18px_rgba(0,0,0,0.16)] backdrop-blur-md"
          style={{
            top: inlineImageToolbar.top,
            left: inlineImageToolbar.left,
            width: inlineImageToolbar.width,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label={inlineImageToolbar.displaySize === 'small' ? '还原图片' : '缩小图片'}
            title={inlineImageToolbar.displaySize === 'small' ? '还原图片' : '缩小图片'}
            data-testid="inline-image-resize"
            className="flex h-11 w-11 items-center justify-center rounded-2xl active:bg-black/5"
            onClick={toggleInlineImageSize}
          >
            {inlineImageToolbar.displaySize === 'small'
              ? <Maximize2 className="h-6 w-6" />
              : <Minimize2 className="h-6 w-6" />}
          </button>
          <button
            type="button"
            aria-label="复制图片"
            title="复制图片"
            data-testid="inline-image-copy"
            className="flex h-11 w-11 items-center justify-center rounded-2xl active:bg-black/5"
            onClick={copyInlineImageToClipboard}
          >
            <Copy className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="预览图片"
            title="预览图片"
            data-testid="inline-image-preview"
            className="flex h-11 w-11 items-center justify-center rounded-2xl active:bg-black/5"
            onClick={openInlineImagePreview}
          >
            <ImageIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="删除图片"
            title="删除图片"
            data-testid="inline-image-delete"
            className="flex h-11 w-11 items-center justify-center rounded-2xl active:bg-black/5"
            onClick={deleteInlineImage}
          >
            <Trash2 className="h-6 w-6" />
          </button>
        </div>
      )}

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
        className="fixed left-[10px] right-[10px] z-50 transition-transform duration-300"
        style={{ 
          bottom: toolbarBottomOffset,
          transform: `translateY(-${keyboardInset}px)`,
          pointerEvents: isFocused && isEditing ? 'auto' : 'none',
        }}
      >
        {/* Markdown Toolbar */}
        <div 
          className="backdrop-blur-md border border-outline-variant/20 rounded-[24px] transition-all duration-300 overflow-hidden shadow-[0_4px_22px_rgba(0,0,0,0.10)]"
          style={{ 
            height: isFocused && isEditing ? '48px' : '0',
            opacity: isFocused && isEditing ? 1 : 0,
            backgroundColor: selectedTheme ? selectedTheme.toolbarColor : 'rgba(var(--color-surface), 0.95)' 
          }}
        >
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar px-2 w-full h-[48px] touch-pan-x overscroll-x-contain">
          {/* Group 1: Image */}
          <div className="flex">
            <button 
              onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              className="flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <ImageIcon className="w-[24px] h-[24px]" />
            </button>
          </div>
          
          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>
          
          {/* Group 2: Undo / Redo */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().undo().run(); }}
              disabled={!editor?.can().undo()}
              className="flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <Undo className="w-[24px] h-[24px]" />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().redo().run(); }}
              disabled={!editor?.can().redo()}
              className="flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
            >
              <Redo className="w-[24px] h-[24px]" />
            </button>
          </div>

          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>

          {/* Group 3: Formatting */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); handleToggleMark('highlight'); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('highlight') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Highlighter className="w-[24px] h-[24px]" />
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); handleToggleMark('bold'); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('bold') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Bold className="w-[24px] h-[24px]" />
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 1 }).run(); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[18px] ${editor?.isActive('heading', { level: 1 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              H1
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run(); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[18px] ${editor?.isActive('heading', { level: 2 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              H2
            </button>
            
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('blockquote') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <Quote className="w-[24px] h-[24px]" />
            </button>
          </div>

          <div className="w-px h-[18px] bg-outline-variant/30 mx-1 flex-shrink-0"></div>

          {/* Group 4: Lists */}
          <div className="flex gap-0">
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('orderedList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <ListOrdered className="w-[24px] h-[24px]" />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
              className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${editor?.isActive('bulletList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
            >
              <List className="w-[24px] h-[24px]" />
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
                  const currentContent = normalizeContentForStorage(editorInstanceRef.current?.getHTML() || contentRef.current);
                  const currentImages = imagesRef.current.filter((img: string) => typeof img === 'string' && img.trim() !== '');
                  const currentEntry = existingJournalRef.current;
                  if (currentEntry) {
                    await diaryService.updateEntry(currentEntry.id, {
                      content: currentContent,
                      images: currentImages,
                      backgroundId: backgroundIdRef.current,
                      themeId: selectedThemeRef.current?.id,
                      status: 'trashed',
                      trashReason: 'abandoned',
                      trashedAt: new Date().toISOString()
                    }, { saveHistory: true, immediateSync: true });
                  } else if (!isNewEntryWithoutMeaningfulContent(currentContent, currentImages)) {
                    await diaryService.createEntry({
                      id: activeEntryIdRef.current,
                      content: currentContent,
                      images: currentImages,
                      diaryDate: getDraftDiaryDate(),
                      backgroundId: backgroundIdRef.current,
                      themeId: selectedThemeRef.current?.id,
                      status: 'trashed',
                      trashReason: 'abandoned',
                      trashedAt: new Date().toISOString()
                    }, { saveHistory: true, immediateSync: true });
                  }
                  hasUnsavedChanges.current = false;
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
                      content: normalizeContentForStorage(editor?.getHTML() || content),
                      images: imagesRef.current,
                      savedAt: new Date().toISOString()
                    });
                    
                    // Restore
                    const restoredImages = selectedHistory.images || [];
                    const restoredContent = hydrateContentForEditor(selectedHistory.content, restoredImages);
                    setImagesWithRef(restoredImages);
                    setContent(restoredContent);
                    editor?.commands.setContent(restoredContent);
                    
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
          style={{ paddingBottom: templateEditorBottomInset }}
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
          <div
            className="px-[10px] pt-1"
            style={{
              paddingBottom: toolbarBottomOffset,
            }}
          >
            <div className="bg-surface/95 backdrop-blur-md border border-outline-variant/20 rounded-[24px] overflow-hidden shadow-[0_4px_22px_rgba(0,0,0,0.10)]">
            <div className="flex items-center justify-between overflow-x-auto no-scrollbar px-2 w-full h-[48px] touch-pan-x overscroll-x-contain">
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().undo().run(); }}
                disabled={!templateEditor?.can().undo()}
                className="flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
              >
                <Undo className="w-[24px] h-[24px]" />
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().redo().run(); }}
                disabled={!templateEditor?.can().redo()}
                className="flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50"
              >
                <Redo className="w-[24px] h-[24px]" />
              </button>

              <div className="w-px h-6 bg-outline-variant/30 mx-1 flex-shrink-0"></div>

              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHighlight().run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('highlight') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Highlighter className="w-[24px] h-[24px]" />
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBold().run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('bold') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Bold className="w-[24px] h-[24px]" />
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHeading({ level: 1 }).run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[18px] ${templateEditor?.isActive('heading', { level: 1 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                H1
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleHeading({ level: 2 }).run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors font-bold font-serif text-[18px] ${templateEditor?.isActive('heading', { level: 2 }) ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                H2
              </button>
              
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBlockquote().run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('blockquote') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <Quote className="w-[24px] h-[24px]" />
              </button>

              <div className="w-px h-6 bg-outline-variant/30 mx-1 flex-shrink-0"></div>

              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleOrderedList().run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('orderedList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <ListOrdered className="w-[24px] h-[24px]" />
              </button>
              <button 
                onMouseDown={(e) => { e.preventDefault(); templateEditor?.chain().focus().toggleBulletList().run(); }}
                className={`flex-shrink-0 w-[36px] h-[46px] flex items-center justify-center rounded-lg hover:bg-surface-container active:bg-surface-container-high transition-colors ${templateEditor?.isActive('bulletList') ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}
              >
                <List className="w-[24px] h-[24px]" />
              </button>
              <div className="w-1 flex-shrink-0"></div>
            </div>
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
            {/* 鎷栧姩鏉?*/}
            <div style={{ width: '36px', height: '4px', borderRadius: '2px',
              backgroundColor: isDark ? '#48484A' : '#E5E5EA', margin: '0 auto 16px' }} />

            {/* Sheet 鏍囬 */}
            <div style={{
              textAlign: 'center',
              fontSize: '15px',
              fontWeight: '600',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              padding: '16px 0 4px',
            }}>
              分享至
            </div>

            {/* 鍥炬爣鍖哄煙锛氫笁鍒楃瓑瀹斤紝閾烘弧鏁翠釜 Sheet 瀹藉害 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',  // 涓夊垪绛夊
              gap: '0',
              padding: '8px 16px 0',                 // 鍑忓皯宸﹀彸鍐呰竟璺?
              width: '100%',
            }}>
              {[
                { label: '微信好友', onClick: shareToWeChat, icon: (
                  <div style={{
                    width: '56px', height: '56px',
                    borderRadius: '16px',
                    backgroundColor: '#07C160',   // 寰俊鍝佺墝缁?
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
                    backgroundColor: '#446733',   // 鍝佺墝缁?
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
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {previewHashActive && displayIndex !== null && displayIndex >= 0 && displayIndex < activePreviewImages.length && (
            <ImageViewer
              images={activePreviewImages}
              initialIndex={displayIndex}
              onClose={closePreview}
              onChange={handleImageViewerChange}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}

      <AppToast message={toastMessage} />
    </div>
  );
}
