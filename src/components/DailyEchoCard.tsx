import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, MessageCircle, RefreshCw, X } from 'lucide-react';
import type { DailyEcho } from '../services/diaryService';
import type { DailyEchoCompletionStats } from '../utils/dailyEchoCompletionStats';
import { parseDailyEchoContent } from '../utils/dailyEchoQuote';

type DailyEchoActions = {
  isSavingImage?: boolean;
  onSave?: () => void;
  onRegenerate?: () => void;
  onDismiss?: () => void;
  onContinueChat?: () => void;
  onSaveImage?: () => void;
};

type DailyEchoCardProps = DailyEchoActions & {
  echo?: DailyEcho;
  isGenerating?: boolean;
  streamingContent?: string;
  isRetrying?: boolean;
};

type DailyEchoFloatingCardProps = DailyEchoCardProps & {
  hidden?: boolean;
  completionStats?: DailyEchoCompletionStats | null;
  onCloseDiary?: () => void;
  openRequestKey?: string;
};

const DAILY_ECHO_MASCOT_SRC = '/icons/xiaoxiang-echo-mascot-float.png';

function getEchoTitle(echo?: DailyEcho, isGenerating = false) {
  if (isGenerating) return '小象正在轻轻读完这一页...';
  if (echo?.status === 'failed') return '这次小象没有读完整，点换一句再试。';
  const content = echo?.content?.trim();
  if (!content) return '小象听见了。';
  const quote = parseDailyEchoContent(content).quote;
  if (quote) return quote;
  const firstSentence = content.match(/^(.+?[。！？!?])/u)?.[1] || content.split(/\n+/)[0] || content;
  const chars = Array.from(firstSentence.trim());
  if (chars.length > 24) return '小象听见了。';
  return chars.join('');
}

function getCompleteEchoText(value?: string) {
  const content = value?.trim();
  if (!content) return '';
  if (/[。！？!?]$/.test(content)) return content;

  const chars = Array.from(content);
  let lastEnd = -1;
  for (let i = 0; i < chars.length; i += 1) {
    if (/[。！？!?]/.test(chars[i])) {
      lastEnd = i;
    }
  }

  return lastEnd >= 24 ? chars.slice(0, lastEnd + 1).join('').trim() : content;
}

function ElephantIllustration({ className = '' }: { className?: string }) {
  return (
    <img
      src={DAILY_ECHO_MASCOT_SRC}
      alt=""
      draggable={false}
      decoding="async"
      className={className}
      aria-hidden="true"
    />
  );
}

function DailyEchoPanel({
  echo,
  isGenerating = false,
  streamingContent = '',
  isRetrying = false,
  isSavingImage = false,
  onRegenerate,
  onDismiss,
  onContinueChat,
  onSaveImage,
}: DailyEchoCardProps) {
  const isSaved = echo?.status === 'saved';
  const isFailed = echo?.status === 'failed';
  const parsedEcho = parseDailyEchoContent(isGenerating ? streamingContent : echo?.content || '');
  const quote = isGenerating && !streamingContent.trim()
    ? '小象正在为今天提炼一句回声'
    : parsedEcho.quote;
  const content = isGenerating ? parsedEcho.body.trim() : getCompleteEchoText(parsedEcho.body);

  return (
    <div className="flex max-h-[min(78vh,680px)] flex-col overflow-hidden rounded-[18px] border border-[#446733]/15 bg-[#FFFDF7]/95 px-4 py-3.5 shadow-[0_10px_30px_rgba(68,103,51,0.10)] backdrop-blur-sm">
      <div className="mb-3 shrink-0">
        <div className="rounded-[14px] bg-[#446733]/8 px-4 py-3 text-center">
          <p data-testid="daily-echo-quote" className="font-serif text-[17px] font-semibold leading-7 text-[#31402E]">
            {quote}
          </p>
        </div>
      </div>

      {isGenerating ? (
        content ? (
          <p
            data-testid="daily-echo-streaming-content"
            aria-live="polite"
            className="min-h-0 max-h-[58vh] overflow-y-auto whitespace-pre-wrap pr-1 text-[13px] leading-6 text-[#3F4A3A] [scrollbar-width:thin]"
          >
            {content}
            <span className="ml-1 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-[#446733]/55" aria-hidden="true" />
          </p>
        ) : (
          <div className="flex items-center gap-3 py-2 text-[13px] leading-6 text-[#5F6B57]" aria-live="polite">
            <span className="h-4 w-4 rounded-full border-2 border-[#446733]/30 border-t-[#446733] animate-spin" />
            <span>{isRetrying ? '小象正在换个角度，再读一遍…' : '已在后台生成，离开页面也不会中断。'}</span>
          </div>
        )
      ) : isFailed ? (
        <p className="text-[13px] leading-6 text-[#5F6B57]">
          {content || '这次小象没有读完整，点换一句再试。'}
        </p>
      ) : (
        <p className="min-h-0 max-h-[58vh] overflow-y-auto whitespace-pre-wrap pr-1 text-[13px] leading-6 text-[#3F4A3A] [scrollbar-width:thin]">
          {content}
        </p>
      )}

      {!isGenerating && (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {!isFailed && onSaveImage && (
            <button
              type="button"
              onClick={onSaveImage}
              disabled={isSavingImage}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#446733] px-3.5 py-1.5 text-[12px] font-medium text-white active:scale-95 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {isSavingImage ? '保存中' : '保存图片'}
            </button>
          )}
          {onRegenerate && !isFailed && (
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#446733]/8 px-3 py-1.5 text-[12px] font-medium text-[#446733] active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              换一句
            </button>
          )}
          {onContinueChat && !isFailed && (
            <button
              type="button"
              onClick={onContinueChat}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#446733]/8 px-3 py-1.5 text-[12px] font-medium text-[#446733] active:scale-95"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              继续聊聊
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-[#7D8876] active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
              不再显示
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DailyEchoCompletionPanel({
  stats,
  onOpenEcho,
  onCloseDiary,
}: {
  stats: DailyEchoCompletionStats;
  onOpenEcho?: () => void;
  onCloseDiary?: () => void;
}) {
  return (
    <div
      data-testid="daily-echo-completion-card"
      className="mb-3 w-[min(318px,calc(100vw-108px))] rounded-[18px] border border-[#446733]/14 bg-[#FFFDF7] px-5 py-4 text-left text-[#31402E] shadow-[0_14px_34px_rgba(68,103,51,0.16)] animate-in fade-in slide-in-from-right-2 duration-300"
    >
      <div className="mb-3 flex justify-center text-[#446733]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#446733]/10">
          <BookOpen className="h-5 w-5" />
        </span>
      </div>
      <p className="text-center text-[18px] font-semibold leading-7 text-[#31402E]">
        今天的你，值得被看见
      </p>
      <p className="mt-3 text-center text-[13px] leading-6 text-[#6C7766]">
        今天你写了{stats.wordCount.toLocaleString('zh-CN')}字，用了{stats.activeWritingMinutes}分钟——这是你连续记录的第{stats.streakDays}天
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onOpenEcho}
          className="rounded-full bg-[#446733] px-3.5 py-2 text-[12px] font-medium text-white active:scale-95"
        >
          获取今日回声
        </button>
        <button
          type="button"
          onClick={onCloseDiary}
          className="rounded-full bg-[#446733]/8 px-3.5 py-2 text-[12px] font-medium text-[#446733] active:scale-95"
        >
          合上日记本
        </button>
      </div>
    </div>
  );
}

export function DailyEchoCard(props: DailyEchoCardProps) {
  if (!props.isGenerating && (!props.echo || props.echo.status === 'dismissed')) return null;

  return (
    <div
      data-testid="daily-echo-card"
      onClick={(event) => event.stopPropagation()}
      className="mt-7 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <DailyEchoPanel {...props} />
    </div>
  );
}

export function DailyEchoFloatingCard({
  echo,
  isGenerating = false,
  hidden = false,
  completionStats,
  onCloseDiary,
  openRequestKey,
  ...actions
}: DailyEchoFloatingCardProps) {
  const [mode, setMode] = useState<'completion' | 'peek' | 'docked' | 'expanded'>('docked');
  const title = useMemo(() => getEchoTitle(echo, isGenerating), [echo, isGenerating]);
  const signature = `${echo?.status || 'none'}:${echo?.generatedAt || ''}:${echo?.content || ''}:${isGenerating ? 'generating' : 'idle'}`;
  const completionSignature = completionStats
    ? `${completionStats.wordCount}:${completionStats.activeWritingMinutes}:${completionStats.streakDays}`
    : '';

  useEffect(() => {
    if (hidden || !completionStats) return;
    setMode('completion');
  }, [hidden, completionSignature, completionStats]);

  useEffect(() => {
    if (completionStats) return;
    if (hidden || (!isGenerating && (!echo || echo.status === 'dismissed'))) return;
    setMode('peek');
    if (echo?.status === 'failed') return;
    const timer = window.setTimeout(() => {
      setMode(current => (current === 'peek' ? 'docked' : current));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [hidden, signature, echo?.status, isGenerating, completionStats]);

  useEffect(() => {
    if (hidden) setMode('docked');
  }, [hidden]);

  useEffect(() => {
    if (hidden || !openRequestKey) return;
    setMode('expanded');
  }, [hidden, openRequestKey]);

  if (hidden || (!completionStats && !isGenerating && (!echo || echo.status === 'dismissed'))) return null;

  const isExpanded = mode === 'expanded';
  const isPeek = mode === 'peek';
  const isCompletion = mode !== 'expanded' && completionStats;

  return (
    <div
      data-testid="daily-echo-floating"
      className="fixed z-[45] w-[min(360px,calc(100vw-32px))] transition-all duration-300 ease-out"
      style={{
        right: 'max(16px, calc((100vw - 640px) / 2 + 16px))',
        bottom: 'calc(86px + env(safe-area-inset-bottom))',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {isExpanded && (
        <button
          type="button"
          aria-label="收起小象回声"
          className="fixed inset-0 -z-10 cursor-default bg-transparent"
          onClick={() => setMode('docked')}
        />
      )}

      {isExpanded ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <DailyEchoPanel echo={echo} isGenerating={isGenerating} {...actions} />
        </div>
      ) : (
        <div className={`flex items-end justify-end gap-2 ${isPeek || isCompletion ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-95'}`}>
          {isCompletion && (
            <DailyEchoCompletionPanel
              stats={completionStats}
              onOpenEcho={() => setMode('expanded')}
              onCloseDiary={onCloseDiary}
            />
          )}

          {isPeek && (
            <button
              type="button"
              data-testid="daily-echo-bubble"
              onClick={() => setMode('expanded')}
              className="mb-3 max-w-[230px] rounded-[18px] border border-[#446733]/14 bg-[#FFFDF7]/95 px-4 py-3 text-left text-[13px] leading-6 text-[#3F4A3A] shadow-[0_10px_26px_rgba(68,103,51,0.12)] backdrop-blur-sm animate-in fade-in slide-in-from-right-2 duration-300"
            >
              {title}
            </button>
          )}

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              aria-label="打开小象回声"
              data-testid="daily-echo-elephant"
              onClick={() => setMode(current => (current === 'expanded' ? 'docked' : 'expanded'))}
              className={`relative h-[62px] w-[68px] rounded-[22px] border border-[#446733]/12 bg-[#FFFDF7]/90 shadow-[0_10px_24px_rgba(68,103,51,0.14)] transition-transform duration-300 active:scale-95 ${isPeek ? 'translate-y-0' : 'translate-y-5'}`}
            >
              <span className="absolute -left-7 top-7 h-px w-8 rotate-[-10deg] bg-[#446733]/30" />
              <ElephantIllustration className="pointer-events-none absolute -left-7 -top-12 h-[122px] w-[122px] object-contain drop-shadow-[0_8px_12px_rgba(68,103,51,0.12)]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DailyEchoExportCard({ echo, date }: { echo: DailyEcho; date: Date }) {
  const dateText = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const parsedEcho = parseDailyEchoContent(echo.content);
  const quote = parsedEcho.quote;
  const content = parsedEcho.body.trim();
  const contentLength = Array.from(content).length;
  const bodyFontSize = contentLength > 520 ? 21 : contentLength > 420 ? 22 : contentLength > 330 ? 24 : contentLength > 240 ? 26 : contentLength > 150 ? 30 : 34;
  const bodyLineHeight = contentLength > 420 ? 1.68 : contentLength > 260 ? 1.76 : 1.82;

  return (
    <div
      data-ready="true"
      style={{
        width: 760,
        minHeight: 1060,
        background: '#FFFDF7',
        color: '#31402E',
        padding: '68px 72px 58px',
        boxSizing: 'border-box',
        fontFamily: '"Noto Serif SC", "Songti SC", "Microsoft YaHei", serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 72,
        border: '1px solid rgba(68,103,51,0.16)',
        overflow: 'visible',
      }}
    >
      <div>
        <div style={{ fontSize: 34, lineHeight: 1.45, color: '#31402E', marginBottom: 18, fontWeight: 700, letterSpacing: 0 }}>
          {quote}
        </div>
        <div style={{ width: 56, height: 2, background: '#446733', opacity: 0.35, marginBottom: 22 }} />
        <div style={{ fontSize: 18, color: '#7D8876', marginBottom: 48 }}>
          {dateText}
        </div>
        <div
          style={{
            width: '100%',
            fontSize: bodyFontSize,
            lineHeight: bodyLineHeight,
            letterSpacing: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {content}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#7D8876' }}>
        <span style={{ fontSize: 18 }}>小象日志</span>
        <span style={{ width: 48, height: 2, background: '#446733', opacity: 0.35 }} />
      </div>
    </div>
  );
}
