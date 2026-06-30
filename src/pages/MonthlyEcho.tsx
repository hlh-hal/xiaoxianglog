import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { Loader2, Sparkle } from 'lucide-react';
import { monthlyEchoService } from '../services/monthlyEchoService';
import { canUseAndroidImageSaver, savePngDataUrlToAndroidGallery } from '../services/androidImageSaver';
import { useOptionalAuth } from '../contexts/AuthContext';
import { AppToast } from '../components/AppToast';
import { sanitizeModernColors } from '../utils/exportImage';
import { downloadBlob } from '../utils/exportFile';
import {
  monthKeyToLabel,
  normalizeMonthKey,
  type MonthlyEchoPayload,
  type MonthlyEchoSections,
} from '../utils/monthlyEcho';

const storyFont = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Inter", sans-serif';
const serifFont = '"Noto Serif SC", "Songti SC", "SimSun", serif';
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const entranceCoverBackground = '/monthly-echo/entrance-cover.png?v=20260623-entry-cover';
const chineseMonthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const actionIcons = ['说', 'Ⅱ', '记', '心', '芽'];
const storyPages = ['cover', 'map', 'moments', 'actions', 'theme', 'letter'] as const;

type StoryPage = typeof storyPages[number];

type DerivedStoryData = {
  coverIntro: string;
  coverQuoteA: string;
  coverQuoteB: string;
  mapHeadline: string;
  mapNodes: Array<{ title: string; text: string }>;
  mapSummary: string;
  moments: Array<{ dateLabel: string; title: string; body: string }>;
  momentsSummary: string;
  actions: string[];
  actionSummary: string;
  repeatedLead: string;
  repeatedQuestion: string;
  repeatedTurn: string;
  nextQuestion: string;
  letterText: string;
  letterQuote: string;
  posterThemeLine: string;
};

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(response => response.blob());
}

function cleanText(text?: string | null): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function textChars(text: string): string[] {
  return Array.from(text);
}

function truncateText(text: string, maxLength: number): string {
  const value = cleanText(text);
  const chars = textChars(value);
  if (chars.length <= maxLength) return value;
  return `${chars.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

function formatDisplayName(nickname?: string | null): string {
  const value = String(nickname || '').trim();
  if (!value) return '你';
  const chars = textChars(value);
  if (chars.length <= 12) return value;
  return chars.slice(0, 12).join('');
}

function splitLetterParagraphs(text: string): string[] {
  const normalized = String(text || '')
    .replace(/^\s*亲爱的[^：:]{0,24}[：:]\s*/u, '')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return ['这个月，你已经被好好看见。小象想把这份温柔留给你，也陪你慢慢走进下一个月。'];

  const rawParagraphs = normalized
    .split(/\n{2,}|(?<=。)\s*(?=这个月|你也|那些|愿你|小象|后来|当|但|也正是|从)/u)
    .map(item => cleanText(item))
    .filter(Boolean);

  const paragraphs: string[] = [];
  for (const paragraph of rawParagraphs) {
    const chars = textChars(paragraph);
    for (let index = 0; index < chars.length; index += 120) {
      paragraphs.push(chars.slice(index, index + 120).join(''));
      if (paragraphs.length >= 4) return paragraphs;
    }
  }
  return paragraphs.slice(0, 4);
}

function stripLeadingMarker(text: string): string {
  return cleanText(text)
    .replace(/^(?:[-*•]\s*|\d+[.、]\s*|第[一二三四五六七八九十]+(?:个)?(?:时刻)?[,，、：:\s]*)/, '')
    .trim();
}

function splitTextItems(text?: string | null, maxItems = 5): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const withBreaks = raw
    .replace(/\r/g, '\n')
    .replace(/([。！？!?；;])\s*/g, '$1\n')
    .replace(/(?:第一|第二|第三|第四|第五)个(?:时刻)?[,，、：:]/g, '\n$&');

  const chunks = withBreaks
    .split(/\n+|(?<=。)\s+/)
    .map(stripLeadingMarker)
    .filter(Boolean);

  const deduped: string[] = [];
  for (const chunk of chunks) {
    if (!deduped.some(item => item === chunk)) deduped.push(chunk);
    if (deduped.length >= maxItems) break;
  }
  return deduped;
}

function extractQuotedText(text?: string | null): string[] {
  const value = cleanText(text);
  return Array.from(value.matchAll(/[「“](.*?)[」”]/g))
    .map(match => cleanText(match[1]))
    .filter(Boolean);
}

function getMonthNumber(monthKey: string): number {
  const month = Number(/^(\d{4})-(\d{2})$/.exec(monthKey)?.[2] || new Date().getMonth() + 1);
  return Math.min(12, Math.max(1, month));
}

function formatMonthTitle(monthKey: string): string {
  return `${chineseMonthNames[getMonthNumber(monthKey) - 1] || `${getMonthNumber(monthKey)}月`}的回响`;
}

function getEnglishMonth(monthKey: string): string {
  return monthNames[getMonthNumber(monthKey) - 1] || 'Month';
}

function getMomentDateLabel(text: string, monthKey: string, index: number): string {
  const clean = cleanText(text);
  const month = String(getMonthNumber(monthKey)).padStart(2, '0');
  const isoMatch = clean.match(/\b20\d{2}[-/.年](0?[1-9]|1[0-2])[-/.月](0?[1-9]|[12]\d|3[01])/);
  if (isoMatch) {
    return `${String(Number(isoMatch[1])).padStart(2, '0')}.${String(Number(isoMatch[2])).padStart(2, '0')}`;
  }
  const chineseMatch = clean.match(/(0?[1-9]|1[0-2])\s*月\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?/);
  if (chineseMatch) {
    return `${String(Number(chineseMatch[1])).padStart(2, '0')}.${String(Number(chineseMatch[2])).padStart(2, '0')}`;
  }
  const dottedMatch = clean.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (dottedMatch) {
    return `${String(Number(dottedMatch[1])).padStart(2, '0')}.${String(Number(dottedMatch[2])).padStart(2, '0')}`;
  }
  const fallbackDays = [8, 16, 24];
  return `${month}.${String(fallbackDays[index] || fallbackDays[0]).padStart(2, '0')}`;
}

function stripMomentDate(text: string): string {
  return cleanText(text)
    .replace(/\b20\d{2}[-/.年](0?[1-9]|1[0-2])[-/.月](0?[1-9]|[12]\d|3[01])\s*[日号]?/, '')
    .replace(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/, '')
    .replace(/(0?[1-9]|1[0-2])\s*月\s*(0?[1-9]|[12]\d|3[01])\s*[日号]?/, '')
    .replace(/^[,，、:：\s-]+/, '')
    .trim();
}

function buildMomentStory(raw: string, monthKey: string, index: number, fallbackTitle: string, fallbackBody: string) {
  const withoutDate = stripMomentDate(raw);
  const sentenceParts = withoutDate
    .split(/(?<=[。！？!?])\s*/)
    .map(item => cleanText(item))
    .filter(Boolean);
  const title = cleanText(sentenceParts[0] || withoutDate || fallbackTitle);
  const bodySource = sentenceParts.slice(1).join(' ') || fallbackBody;
  return {
    dateLabel: getMomentDateLabel(raw, monthKey, index),
    title,
    body: cleanText(bodySource),
  };
}

function pickQuoteCandidates(sections: MonthlyEchoSections, payload?: MonthlyEchoPayload | null): string[] {
  const quoted = [
    ...extractQuotedText(sections.posterQuote),
    ...extractQuotedText(sections.repeatedThemeSection),
    ...extractQuotedText(sections.nextMonthQuestion),
    ...extractQuotedText(sections.opening),
    ...extractQuotedText(payload?.fullText),
  ];
  const raw = [
    sections.posterQuote,
    sections.finalInsightSentence,
    sections.posterThemeLine,
    sections.nextMonthQuestion,
  ].map(item => cleanText(item));

  const deduped: string[] = [];
  for (const item of [...quoted, ...raw]) {
    if (item && !deduped.includes(item)) deduped.push(item);
  }
  return deduped;
}

function buildLetterText(payload: MonthlyEchoPayload | null, sections: MonthlyEchoSections): string {
  const fullText = String(payload?.fullText || '').trim();
  if (fullText) return fullText;
  const fallback = [
    '亲爱的自己：',
    '',
    '回头看这个月，你走得很踏实。',
    sections.finalInsightSentence || sections.posterThemeLine || '',
  ].filter(Boolean);
  return fallback.join('\n');
}

function deriveStoryData(payload: MonthlyEchoPayload | null, sections: MonthlyEchoSections): DerivedStoryData {
  const monthKey = payload?.monthKey || new Date().toISOString().slice(0, 7);
  const quotes = pickQuoteCandidates(sections, payload);
  const openingItems = splitTextItems(sections.opening, 3);
  const mainArcItems = splitTextItems(sections.mainArcSection || sections.opening, 5);
  const keyMomentItems = splitTextItems(sections.keyMomentsSection, 6);
  const actionItems = splitTextItems(sections.actionTrajectorySection, 8);
  const repeatedItems = splitTextItems(sections.repeatedThemeSection, 5);
  const repeatedQuotes = extractQuotedText(`${sections.repeatedThemeSection || ''}\n${sections.nextMonthQuestion || ''}`);
  const posterThemeLine = truncateText(sections.posterThemeLine || sections.finalInsightSentence || payload?.title || '这个月，已经被好好看见', 24);

  return {
    coverIntro: truncateText(openingItems[0] || '这个月，你其实一直在练习：', 28),
    coverQuoteA: truncateText(quotes[0] || posterThemeLine || '我够不够好', 13),
    coverQuoteB: truncateText(quotes[1] || sections.nextMonthQuestion || '我真正想守住什么', 16),
    mapHeadline: truncateText(sections.posterThemeLine || mainArcItems[0] || '你在学习用不那么消耗自己的方式，继续往前走。', 35),
    mapNodes: [
      {
        title: '工作 / 学习',
        text: truncateText(mainArcItems[1] || actionItems[0] || '你在高要求里重新确认自己的节奏。', 28),
      },
      {
        title: '关系',
        text: truncateText(mainArcItems[2] || repeatedItems[0] || '你开始分辨期待与自我保护。', 28),
      },
      {
        title: '自我状态',
        text: truncateText(mainArcItems[3] || sections.finalInsightSentence || '你在反复寻找一种更稳的感觉。', 31),
      },
    ],
    mapSummary: truncateText(sections.finalInsightSentence || mainArcItems[4] || '这些支线并不是分散的。它们都指向同一件事：你开始把注意力慢慢放回自己身上。', 45),
    moments: [
      buildMomentStory(
        keyMomentItems[0] || '',
        monthKey,
        0,
        '你没有立刻否定自己的那一天',
        '那天你很累，但你没有把疲惫解释成“我不行”。',
      ),
      buildMomentStory(
        keyMomentItems[1] || '',
        monthKey,
        1,
        '你意识到自己其实很在意那段关系的那一天',
        '你在靠近和保护自己之间，慢慢寻找一个位置。',
      ),
      buildMomentStory(
        keyMomentItems[2] || '',
        monthKey,
        2,
        '你重新开始做那件小事的那一天',
        '它看起来不大，但说明你没有放弃那个想靠近的方向。',
      ),
    ],
    momentsSummary: truncateText(sections.finalInsightSentence || '它们看起来都不算惊天动地。但它们说明：你并没有停在原地。', 42),
    actions: [
      truncateText(actionItems[0] || '你表达过一次不舒服。', 24),
      truncateText(actionItems[1] || '你在很累的时候停下来过。', 24),
      truncateText(actionItems[2] || '你重新整理过一个计划。', 24),
      truncateText(actionItems[3] || '你没有像以前那样马上责怪自己。', 27),
      truncateText(actionItems[4] || '你重新开始靠近一件想做的事。', 27),
    ],
    actionSummary: truncateText(actionItems[5] || sections.finalInsightSentence || '这些行动都很小。但小象知道，它们不是没有重量。', 42),
    repeatedLead: truncateText(repeatedItems[0] || '当你很在意一段关系，或很想做好一件事时，你会很快开始问：', 45),
    repeatedQuestion: truncateText(repeatedQuotes[0] || sections.posterQuote || '我是不是做得还不够？', 24),
    repeatedTurn: truncateText(repeatedItems[1] || '但这个月的不同在于，你已经开始停下来问自己：', 34),
    nextQuestion: truncateText(repeatedQuotes[1] || sections.nextMonthQuestion || '这真的是我想要的吗，还是我又在回应别人的期待？', 38),
    letterText: buildLetterText(payload, sections),
    letterQuote: truncateText(sections.posterQuote || sections.finalInsightSentence || '真正的温柔力，是先学会拥抱自己。', 62),
    posterThemeLine,
  };
}

function clampStyle(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function getFrameScale(): number {
  if (typeof window === 'undefined') return 1;
  const widthScale = window.innerWidth / 390;
  const heightScale = window.innerHeight / 844;
  return Math.max(0.72, Math.min(widthScale, heightScale));
}

function getFrameWidth(): number {
  if (typeof window === 'undefined') return 390;
  if (window.innerWidth <= 640) {
    return Math.max(390, Math.min(window.innerWidth, 480));
  }
  return 390;
}

function PaperNoise() {
  return <div className="paper-noise" aria-hidden="true" />;
}

function EchoRings({
  left,
  top,
  sizes = [58, 76, 94, 112, 130],
}: {
  left: number;
  top: number;
  sizes?: number[];
}) {
  const max = Math.max(...sizes);
  return (
    <div className="echo-rings" style={{ left, top, width: max, height: max }} aria-hidden="true">
      {sizes.map((size, index) => (
        <span
          key={`${size}-${index}`}
          style={{
            width: size,
            height: size,
            left: (max - size) / 2,
            top: (max - size) / 2,
            opacity: 0.031 + index * 0.006,
          }}
        />
      ))}
    </div>
  );
}

function DryFlower({ className = '', scale = 1 }: { className?: string; scale?: number }) {
  return (
    <div className={`dry-flower ${className}`} style={{ transform: `scale(${scale})` }} aria-hidden="true">
      <span className="stem" />
      <span className="branch branch-a" />
      <span className="branch branch-b" />
      <span className="bud bud-a" />
      <span className="bud bud-b" />
      <span className="bud bud-c" />
    </div>
  );
}

function PressedFlowerDecor() {
  return (
    <div className="pressed-flower" aria-hidden="true">
      <span className="soft soft-pink" />
      <span className="soft soft-green" />
      <span className="flower-line line-main" />
      <span className="flower-line line-a" />
      <span className="flower-line line-b" />
      <span className="petal petal-a" />
      <span className="petal petal-b" />
      <span className="petal petal-c" />
      <span className="leaf leaf-a" />
      <span className="leaf leaf-b" />
    </div>
  );
}

function EntranceCoverFrame({
  monthKey,
  onNext,
}: {
  monthKey: string;
  onNext: () => void;
}) {
  return (
    <section
      className="echo-frame entrance-cover-frame"
      data-page-index={0}
      data-name="PAGE 1 / 入口页"
      aria-label={`${getEnglishMonth(monthKey)} 月之回响入口页`}
    >
      <button type="button" className="entrance-cover-next" onClick={onNext} aria-label="继续查看月之回响" />
    </section>
  );
}

function EntranceFloralDecor() {
  return (
    <div className="entrance-floral" aria-hidden="true">
      <div className="flower-spray top-spray">
        <span className="spray-line spray-main" />
        <span className="spray-line spray-branch-a" />
        <span className="spray-line spray-branch-b" />
        <span className="spray-leaf spray-leaf-a" />
        <span className="spray-leaf spray-leaf-b" />
        <span className="spray-leaf spray-leaf-c" />
        <span className="spray-petal spray-petal-a" />
        <span className="spray-petal spray-petal-b" />
        <span className="spray-petal spray-petal-c" />
        <span className="spray-petal spray-petal-d" />
        <span className="spray-core spray-core-a" />
        <span className="spray-core spray-core-b" />
      </div>
      <div className="flower-spray right-spray">
        <span className="spray-line right-main" />
        <span className="spray-line right-branch-a" />
        <span className="spray-line right-branch-b" />
        <span className="spray-leaf right-leaf-a" />
        <span className="spray-leaf right-leaf-b" />
        <span className="spray-petal right-petal-a" />
        <span className="spray-petal right-petal-b" />
        <span className="spray-core right-core" />
      </div>
      <div className="flower-spray bottom-spray">
        <span className="spray-line bottom-main" />
        <span className="spray-line bottom-branch-a" />
        <span className="spray-line bottom-branch-b" />
        <span className="spray-line bottom-branch-c" />
        <span className="spray-leaf bottom-leaf-a" />
        <span className="spray-leaf bottom-leaf-b" />
        <span className="spray-leaf bottom-leaf-c" />
        <span className="spray-petal bottom-petal-a" />
        <span className="spray-petal bottom-petal-b" />
        <span className="spray-petal bottom-petal-c" />
        <span className="spray-core bottom-core-a" />
        <span className="spray-core bottom-core-b" />
      </div>
      <span className="falling-petal petal-fall-a" />
      <span className="falling-petal petal-fall-b" />
      <span className="falling-petal petal-fall-c" />
      <span className="falling-petal petal-fall-d" />
      <span className="soft-dot soft-dot-a" />
      <span className="soft-dot soft-dot-b" />
      <span className="soft-dot soft-dot-c" />
    </div>
  );
}

function BrushQuote({
  children,
  className = '',
  green = false,
  width = 244,
}: {
  children: React.ReactNode;
  className?: string;
  green?: boolean;
  width?: number | string;
}) {
  return (
    <div className={`brush-quote ${green ? 'brush-quote-green' : ''} ${className}`} style={{ width }}>
      <span className="wash wash-base" />
      <span className="wash wash-top" />
      <span className="wash wash-bottom" />
      <span className="brush-text">{children}</span>
    </div>
  );
}

function DownCue({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="down-cue" onClick={onClick} aria-label="下一屏">
      ∨
    </button>
  );
}

function EchoStoryFrame({
  children,
  index,
  name,
}: {
  children: React.ReactNode;
  index: number;
  onBack?: () => void;
  name: string;
}) {
  return (
    <section className="echo-frame" data-page-index={index} data-name={name}>
      <PaperNoise />
      {children}
    </section>
  );
}

function MomentCard({
  index,
  moment,
  top,
  rotate,
}: {
  index: number;
  moment: { dateLabel: string; title: string; body: string };
  top: number;
  rotate: number;
}) {
  return (
    <div className="moment-card" style={{ top, transform: `rotate(${rotate}deg)` }}>
      <span className="moment-tape" />
      <div className="moment-stamp">
        <span className="moment-num">{String(index + 1).padStart(2, '0')}</span>
        <span className="moment-date">{moment.dateLabel}</span>
      </div>
      <span className="moment-line" />
      <div className="moment-content">
        <p className="moment-title">{moment.title}</p>
        <p className="moment-body">{moment.body}</p>
      </div>
      <span className="clip-mark">⌒</span>
    </div>
  );
}

function ActionTrail({ actions }: { actions: string[] }) {
  return (
    <div className="action-trail">
      {actions.slice(0, 5).map((action, index) => (
        <div className="action-row" style={{ top: index * 70 }} key={`${index}-${action}`}>
          <span className="action-foot" style={{ left: index % 2 === 0 ? 0 : 12 }} />
          <span className="action-icon-bg">
            <span>{actionIcons[index] || '记'}</span>
          </span>
          <p className="action-text" style={clampStyle(index > 2 ? 2 : 1)}>{action}</p>
        </div>
      ))}
    </div>
  );
}

function MonthlyEchoPoster({
  payload,
  storyData,
  displayName,
}: {
  payload: MonthlyEchoPayload;
  storyData: DerivedStoryData;
  displayName: string;
}) {
  return (
    <div className="echo-frame poster-frame" data-ready="true">
      <PaperNoise />
      <PressedFlowerDecor />
      <div className="poster-month">{formatMonthTitle(payload.monthKey)}</div>
      <div className="poster-english">{getEnglishMonth(payload.monthKey)}</div>
      <div className="poster-line" />
      <p className="poster-theme" style={clampStyle(4)}>{storyData.posterThemeLine}</p>
      {storyData.letterQuote && (
        <div className="poster-quote">
          「{storyData.letterQuote}」
        </div>
      )}
      <div className="poster-owner">{displayName} / {monthKeyToLabel(payload.monthKey)}</div>
      <div className="poster-sign">爱你的小象</div>
    </div>
  );
}

function StatusStoryFrame({
  title,
  message,
  loading,
}: {
  title: string;
  message: string;
  loading?: boolean;
  onBack?: () => void;
}) {
  return (
    <section className="echo-frame status-frame">
      <PaperNoise />
      <EchoRings left={205} top={36} />
      <div className="status-content">
        {loading ? <Loader2 className="status-icon animate-spin" /> : <Sparkle className="status-icon" />}
        <h1>{title}</h1>
        <p>{message}</p>
      </div>
    </section>
  );
}

function StoryStyle() {
  return (
    <style>
      {`
        .monthly-echo-root {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: #f6efe2;
          color: #1b3c21;
          font-family: ${storyFont};
        }
        .monthly-echo-scroll {
          height: 100dvh;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-snap-type: y mandatory;
          overscroll-behavior: contain;
          scrollbar-width: none;
          background: #f6efe2;
        }
        .monthly-echo-scroll::-webkit-scrollbar {
          display: none;
        }
        .monthly-echo-slot {
          height: 100dvh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          overflow: hidden;
          background: #f6efe2;
        }
        .echo-scale-box {
          transform-origin: top center;
        }
        .echo-frame {
          box-sizing: border-box;
          position: relative;
          width: var(--echo-frame-width, 390px);
          height: 844px;
          --echo-page-pad: 26px;
          --echo-content-width: calc(var(--echo-frame-width, 390px) - (var(--echo-page-pad) * 2));
          overflow: hidden;
          background: #f6efe2;
          border: 0;
          box-shadow: none;
          border-radius: 0;
          color: #1b3c21;
          flex: none;
        }
        .paper-noise {
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: 0.38;
          background-image:
            radial-gradient(circle at 18px 38px, rgba(56, 51, 45, 0.04) 0 0.8px, transparent 1px),
            radial-gradient(circle at 88px 152px, rgba(56, 51, 45, 0.035) 0 0.9px, transparent 1.1px),
            radial-gradient(circle at 254px 104px, rgba(56, 51, 45, 0.038) 0 0.8px, transparent 1px),
            radial-gradient(circle at 312px 286px, rgba(56, 51, 45, 0.034) 0 1px, transparent 1.2px),
            radial-gradient(circle at 42px 442px, rgba(56, 51, 45, 0.032) 0 0.8px, transparent 1px),
            radial-gradient(circle at 286px 666px, rgba(56, 51, 45, 0.034) 0 0.9px, transparent 1.1px);
          background-size: 390px 844px, 190px 240px, 210px 280px, 170px 220px, 230px 310px, 250px 350px;
        }
        .down-cue {
          position: absolute;
          z-index: 12;
          width: 100%;
          height: 24px;
          left: 0;
          top: 792px;
          border: 0;
          background: transparent;
          color: #2f5c37;
          font-size: 22px;
          line-height: 22px;
          font-weight: 500;
          text-align: center;
          cursor: pointer;
        }
        .echo-rings {
          pointer-events: none;
          position: absolute;
          z-index: 1;
        }
        .echo-rings span {
          box-sizing: border-box;
          position: absolute;
          border: 1px solid #1b3c21;
          border-radius: 999px;
        }
        .dry-flower {
          pointer-events: none;
          position: absolute;
          width: 118px;
          height: 118px;
          transform-origin: top left;
        }
        .dry-flower .stem,
        .dry-flower .branch {
          position: absolute;
          height: 0;
          border-top: 1px solid rgba(191, 156, 99, 0.45);
          transform-origin: left center;
        }
        .dry-flower .stem {
          width: 104px;
          left: 46px;
          top: 76px;
          transform: rotate(75.96deg);
        }
        .dry-flower .branch-a {
          width: 38px;
          left: 30px;
          top: 35px;
          opacity: 0.8;
          transform: rotate(140.6deg);
        }
        .dry-flower .branch-b {
          width: 40px;
          left: 66px;
          top: 22px;
          opacity: 0.8;
          transform: rotate(36.25deg);
        }
        .dry-flower .bud {
          position: absolute;
          width: 7.4px;
          height: 7.4px;
          border-radius: 999px;
          background: rgba(191, 156, 99, 0.22);
        }
        .dry-flower .bud-a { left: 26px; top: 10px; }
        .dry-flower .bud-b { left: 96px; top: -5px; }
        .dry-flower .bud-c { left: 75px; top: -25px; opacity: 0.8; }
        .pressed-flower {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 1;
        }
        .pressed-flower .soft {
          position: absolute;
          border-radius: 999px;
          filter: blur(14px);
        }
        .pressed-flower .soft-pink {
          width: 178px;
          height: 106px;
          left: 5px;
          top: 54px;
          background: rgba(233, 200, 184, 0.18);
        }
        .pressed-flower .soft-green {
          width: 120px;
          height: 150px;
          left: 270px;
          top: 152px;
          background: rgba(221, 235, 207, 0.2);
        }
        .pressed-flower .flower-line {
          position: absolute;
          height: 0;
          border-top: 1px solid rgba(143, 174, 122, 0.22);
          transform-origin: left center;
        }
        .pressed-flower .line-main {
          width: 146px;
          left: 34px;
          top: 110px;
          transform: rotate(10deg);
        }
        .pressed-flower .line-a {
          width: 60px;
          left: 64px;
          top: 79px;
          transform: rotate(-24deg);
        }
        .pressed-flower .line-b {
          width: 72px;
          left: 101px;
          top: 109px;
          transform: rotate(31deg);
        }
        .pressed-flower .petal,
        .pressed-flower .leaf {
          position: absolute;
          border-radius: 999px 999px 999px 2px;
        }
        .pressed-flower .petal {
          width: 8px;
          height: 15px;
          background: rgba(243, 214, 201, 0.44);
          border: 0.6px solid rgba(215, 169, 137, 0.1);
        }
        .pressed-flower .petal-a { left: 56px; top: 101px; transform: rotate(84deg); }
        .pressed-flower .petal-b { left: 68px; top: 107px; transform: rotate(24deg); }
        .pressed-flower .petal-c { left: 118px; top: 91px; transform: rotate(20deg); }
        .pressed-flower .leaf {
          width: 10px;
          height: 23px;
          background: rgba(175, 199, 155, 0.27);
          border: 0.7px solid rgba(143, 174, 122, 0.12);
        }
        .pressed-flower .leaf-a { left: 34px; top: 99px; transform: rotate(45deg); }
        .pressed-flower .leaf-b { left: 104px; top: 93px; transform: rotate(19deg); }
        .brush-quote {
          position: absolute;
          height: 56px;
          z-index: 4;
        }
        .brush-quote .wash {
          position: absolute;
          border-radius: 6px;
          background: rgba(233, 226, 208, 0.58);
        }
        .brush-quote-green .wash {
          background: rgba(221, 235, 207, 0.72);
        }
        .brush-quote .wash-base {
          width: 100%;
          height: 38px;
          left: 0;
          top: 7px;
          transform: rotate(0.6deg);
        }
        .brush-quote .wash-top {
          width: calc(100% - 20px);
          height: 24px;
          left: 10px;
          top: -3px;
          opacity: 0.38;
          transform: rotate(-1.1deg);
        }
        .brush-quote .wash-bottom {
          width: calc(100% - 12px);
          height: 25px;
          left: 6px;
          top: 28px;
          opacity: 0.32;
          transform: rotate(1deg);
        }
        .brush-quote .brush-text {
          position: absolute;
          inset: 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1b3c21;
          font-weight: 800;
          text-align: center;
          white-space: normal;
          word-break: break-word;
        }
        .entrance-cover-frame {
          width: 100vw;
          height: 100dvh;
          background-color: #f6efe2;
          background-image: url("${entranceCoverBackground}");
          background-position: center center;
          background-repeat: no-repeat;
          background-size: 100% 100%;
          font-family: ${serifFont};
        }
        .entrance-cover-next {
          position: absolute;
          z-index: 20;
          left: 0;
          bottom: 0;
          width: 100%;
          height: 150px;
          border: 0;
          background: transparent;
          cursor: pointer;
          touch-action: manipulation;
        }
        .entrance-wash {
          pointer-events: none;
          position: absolute;
          border-radius: 999px;
          filter: blur(18px);
          z-index: 0;
        }
        .entrance-wash-top {
          width: 340px;
          height: 240px;
          left: -80px;
          top: -75px;
          background: rgba(255, 248, 234, 0.28);
          opacity: 0.58;
        }
        .entrance-wash-bottom {
          width: 380px;
          height: 300px;
          left: 92px;
          top: 568px;
          background: rgba(239, 226, 204, 0.22);
          opacity: 0.48;
          filter: blur(21px);
        }
        .entrance-cover-frame .paper-noise {
          opacity: 0.34;
        }
        .entrance-cover-frame .echo-rings {
          z-index: 1;
        }
        .entrance-cover-frame .echo-rings span {
          border-color: rgba(27, 58, 34, 0.08);
        }
        .entrance-title {
          position: absolute;
          z-index: 4;
          width: 250px;
          height: 48px;
          left: 48px;
          top: 150px;
          margin: 0;
          font-family: ${serifFont};
          font-size: 40px;
          line-height: 48px;
          font-weight: 500;
          letter-spacing: 0.02em;
          color: #1b3a22;
        }
        .entrance-month {
          position: absolute;
          z-index: 4;
          width: 112px;
          height: 30px;
          left: 52px;
          top: 205px;
          font-family: ${serifFont};
          font-size: 24px;
          line-height: 30px;
          font-weight: 400;
          color: rgba(191, 160, 106, 0.92);
        }
        .entrance-divider {
          position: absolute;
          z-index: 4;
          width: 54px;
          height: 1.2px;
          left: 50px;
          top: 259px;
          border-radius: 999px;
          background: rgba(191, 160, 106, 0.32);
        }
        .entrance-copy {
          position: absolute;
          z-index: 4;
          width: 260px;
          height: 156px;
          left: 50px;
          top: 301px;
          margin: 0;
          font-family: ${serifFont};
          font-size: 24px;
          line-height: 39px;
          font-weight: 400;
          letter-spacing: 0.01em;
          color: #6f675f;
        }
        .entrance-blessing {
          position: absolute;
          z-index: 4;
          width: 245px;
          height: 66px;
          left: 176px;
          top: 708px;
          margin: 0;
          font-family: ${serifFont};
          font-size: 20px;
          line-height: 33px;
          font-weight: 400;
          letter-spacing: 0.005em;
          color: rgba(27, 58, 34, 0.78);
        }
        .entrance-cover-frame .down-cue {
          top: 780px;
          font-family: ${serifFont};
          font-size: 26px;
          line-height: 28px;
          color: rgba(191, 160, 106, 0.54);
        }
        .entrance-floral {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 2;
        }
        .flower-spray,
        .spray-line,
        .spray-leaf,
        .spray-petal,
        .spray-core,
        .falling-petal,
        .soft-dot {
          position: absolute;
          display: block;
        }
        .spray-line {
          height: 0;
          border-top: 1px solid rgba(143, 174, 122, 0.22);
          transform-origin: left center;
        }
        .spray-leaf {
          border-radius: 999px 999px 999px 4px;
          background: rgba(175, 199, 155, 0.24);
          border: 0.7px solid rgba(143, 174, 122, 0.1);
        }
        .spray-petal,
        .falling-petal {
          border-radius: 999px 999px 999px 3px;
          background: rgba(243, 214, 201, 0.34);
          border: 0.6px solid rgba(215, 169, 137, 0.08);
        }
        .spray-core,
        .soft-dot {
          border-radius: 999px;
          background: rgba(191, 160, 106, 0.5);
        }
        .top-spray {
          width: 151px;
          height: 74px;
          left: 34px;
          top: 73px;
          opacity: 0.9;
        }
        .spray-main {
          width: 146px;
          left: 0;
          top: 37px;
          transform: rotate(10deg);
          border-top-width: 1.15px;
          border-color: rgba(143, 174, 122, 0.27);
        }
        .spray-branch-a {
          width: 60px;
          left: 30px;
          top: 6px;
          transform: rotate(-24deg);
          border-color: rgba(143, 174, 122, 0.19);
        }
        .spray-branch-b {
          width: 72px;
          left: 67px;
          top: 36px;
          transform: rotate(31deg);
          border-color: rgba(143, 174, 122, 0.18);
        }
        .spray-leaf-a { width: 10px; height: 23px; left: 0; top: 25px; transform: rotate(45deg); }
        .spray-leaf-b { width: 9px; height: 21px; left: 48px; top: 12px; transform: rotate(-25deg); }
        .spray-leaf-c { width: 12px; height: 25px; left: 71px; top: 20px; transform: rotate(19deg); }
        .spray-petal-a { width: 8px; height: 15px; left: 22px; top: 33px; transform: rotate(84deg); }
        .spray-petal-b { width: 8px; height: 15px; left: 33px; top: 35px; transform: rotate(40deg); }
        .spray-petal-c { width: 7px; height: 13px; left: 78px; top: 17px; transform: rotate(20deg); background: rgba(234, 211, 232, 0.38); }
        .spray-petal-d { width: 7px; height: 10px; left: 123px; top: 33px; transform: rotate(-18deg); background: rgba(233, 200, 184, 0.3); }
        .spray-core-a { width: 5px; height: 5px; left: 37px; top: 43px; }
        .spray-core-b { width: 4px; height: 4px; left: 86px; top: 26px; }
        .right-spray {
          width: 54px;
          height: 188px;
          left: 308px;
          top: 245px;
          opacity: 0.72;
        }
        .right-main {
          width: 102px;
          left: 0;
          top: 90px;
          transform: rotate(106deg);
          border-color: rgba(143, 174, 122, 0.19);
        }
        .right-branch-a { width: 48px; left: 13px; top: 59px; transform: rotate(45deg); border-color: rgba(143, 174, 122, 0.14); }
        .right-branch-b { width: 44px; left: 0; top: 64px; transform: rotate(150deg); border-color: rgba(143, 174, 122, 0.13); }
        .right-leaf-a { width: 9px; height: 20px; left: 0; top: 41px; transform: rotate(24deg); opacity: 0.72; }
        .right-leaf-b { width: 8px; height: 19px; left: 35px; top: 27px; transform: rotate(-34deg); opacity: 0.62; }
        .right-petal-a { width: 6px; height: 11px; left: 9px; top: 6px; transform: rotate(81deg); }
        .right-petal-b { width: 6px; height: 11px; left: 16px; top: 8px; transform: rotate(37deg); }
        .right-core { width: 3.5px; height: 3.5px; left: 19px; top: 13px; }
        .bottom-spray {
          width: 150px;
          height: 236px;
          left: 16px;
          top: 668px;
          opacity: 0.78;
        }
        .bottom-main {
          width: 132px;
          left: 58px;
          top: 114px;
          transform: rotate(67deg);
          border-top-width: 1.1px;
          border-color: rgba(143, 174, 122, 0.27);
        }
        .bottom-branch-a { width: 70px; left: 54px; top: 74px; transform: rotate(27deg); border-color: rgba(143, 174, 122, 0.2); }
        .bottom-branch-b { width: 65px; left: 39px; top: 70px; transform: rotate(132deg); border-color: rgba(143, 174, 122, 0.19); }
        .bottom-branch-c { width: 50px; left: 96px; top: 46px; transform: rotate(38deg); border-color: rgba(143, 174, 122, 0.16); }
        .bottom-leaf-a { width: 12px; height: 25px; left: 59px; top: 46px; transform: rotate(25deg); }
        .bottom-leaf-b { width: 11px; height: 22px; left: 94px; top: 23px; transform: rotate(-34deg); }
        .bottom-leaf-c { width: 10px; height: 22px; left: 46px; top: 69px; transform: rotate(-38deg); opacity: 0.7; }
        .bottom-petal-a { width: 8px; height: 15px; left: 72px; top: 10px; transform: rotate(70deg); }
        .bottom-petal-b { width: 8px; height: 15px; left: 84px; top: 13px; transform: rotate(26deg); background: rgba(240, 205, 191, 0.34); }
        .bottom-petal-c { width: 6px; height: 12px; left: 116px; top: 38px; transform: rotate(46deg); background: rgba(231, 214, 234, 0.34); }
        .bottom-core-a { width: 5px; height: 5px; left: 86px; top: 20px; }
        .bottom-core-b { width: 4px; height: 4px; left: 119px; top: 44px; }
        .falling-petal {
          opacity: 0.34;
        }
        .petal-fall-a { width: 9px; height: 17px; left: 22px; top: 265px; transform: rotate(32deg); }
        .petal-fall-b { width: 8px; height: 15px; left: 324px; top: 379px; transform: rotate(-20deg); }
        .petal-fall-c { width: 7px; height: 13px; left: 70px; top: 540px; transform: rotate(-48deg); }
        .petal-fall-d { width: 7px; height: 13px; left: 210px; top: 671px; transform: rotate(-34deg); }
        .soft-dot-a { width: 8px; height: 8px; left: 299px; top: 205px; background: rgba(191, 160, 106, 0.24); }
        .soft-dot-b { width: 8px; height: 8px; left: 278px; top: 586px; background: rgba(221, 235, 207, 0.25); }
        .soft-dot-c { width: 6px; height: 6px; left: 304px; top: 764px; background: rgba(221, 235, 207, 0.22); }
        .cover-title {
          position: absolute;
          left: 46px;
          top: 176px;
          font-size: 28px;
          line-height: 34px;
          font-weight: 800;
          color: #1b3c21;
        }
        .cover-month-en {
          position: absolute;
          left: 98px;
          top: 229px;
          font-size: 20px;
          line-height: 20px;
          color: #bf9c63;
        }
        .cover-intro {
          position: absolute;
          width: 260px;
          left: 46px;
          top: 300px;
          font-size: 16px;
          line-height: 30px;
          color: #38332d;
          white-space: pre-line;
        }
        .cover-slow {
          position: absolute;
          left: 45px;
          top: 505px;
          font-size: 16px;
          line-height: 22px;
          color: #38332d;
        }
        .map-lead {
          position: absolute;
          left: var(--echo-page-pad);
          top: 56px;
          width: var(--echo-content-width);
          color: #38332d;
          font-size: 14px;
          line-height: 20px;
        }
        .map-label {
          position: absolute;
          left: var(--echo-page-pad);
          top: 108px;
          width: 120px;
          color: #8f8374;
          font-size: 14px;
          line-height: 20px;
          font-weight: 600;
        }
        .map-headline {
          position: absolute;
          left: var(--echo-page-pad);
          top: 136px;
          width: var(--echo-content-width);
          color: #1b3c21;
          font-size: 19px;
          line-height: 28px;
          font-weight: 600;
        }
        .map-route {
          position: absolute;
          inset: 0;
          width: 390px;
          height: 844px;
          pointer-events: none;
          transform: translateY(-44px);
        }
        .map-route svg {
          position: absolute;
          left: 0;
          top: 0;
          width: 390px;
          height: 844px;
          overflow: visible;
        }
        .map-dot {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: #2f5c37;
        }
        .map-title {
          position: absolute;
          margin: 0;
          color: #1b3c21;
          font-size: 15px;
          line-height: 20px;
          font-weight: 700;
        }
        .map-desc {
          position: absolute;
          margin: 0;
          color: #38332d;
          font-size: 12px;
          line-height: 17px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .map-desc-two {
          -webkit-line-clamp: 2;
        }
        .map-desc-three {
          -webkit-line-clamp: 3;
        }
        .map-summary {
          position: absolute;
          left: var(--echo-page-pad);
          top: 636px;
          width: var(--echo-content-width);
          height: 92px;
          box-sizing: border-box;
          padding: 18px 23px 14px 24px;
          border-radius: 3px;
          background: rgba(233, 226, 208, 0.5);
          box-shadow: 0 5px 14px rgba(46, 31, 13, 0.06);
          color: #38332d;
          font-size: 13px;
          line-height: 20px;
        }
        .moments-lead {
          position: absolute;
          left: var(--echo-page-pad);
          top: 78px;
          width: var(--echo-content-width);
          color: #38332d;
          font-size: 17px;
          line-height: 32px;
        }
        .moment-card {
          position: absolute;
          left: var(--echo-page-pad);
          width: var(--echo-content-width);
          min-height: 158px;
          border-radius: 8px;
          background: rgba(255, 252, 246, 0.96);
          box-shadow: 0 9px 20px rgba(56, 41, 20, 0.09);
          transform-origin: center center;
        }
        .moment-tape {
          position: absolute;
          width: 68px;
          height: 14px;
          left: 0;
          top: -7px;
          border-radius: 2px;
          background: rgba(237, 229, 213, 0.82);
        }
        .moment-stamp {
          position: absolute;
          left: 21px;
          top: 23px;
          width: 52px;
          min-height: 52px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
        }
        .moment-num,
        .moment-date {
          display: block;
          color: #2f5a35;
          font-weight: 800;
        }
        .moment-num {
          font-size: 19px;
          line-height: 22px;
          letter-spacing: 0.02em;
        }
        .moment-date {
          margin-top: 4px;
          font-size: 13px;
          line-height: 16px;
          letter-spacing: 0.04em;
        }
        .moment-line {
          position: absolute;
          left: 21px;
          top: 80px;
          width: 48px;
          height: 1px;
          background: rgba(47, 90, 53, 0.65);
        }
        .moment-content {
          position: absolute;
          left: 104px;
          top: 22px;
          width: calc(100% - 132px);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .moment-title {
          margin: 0;
          color: #38332d;
          font-size: 14px;
          line-height: 20px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .moment-body {
          margin: 0;
          color: rgba(56, 51, 45, 0.88);
          font-size: 11.5px;
          line-height: 17px;
          font-weight: 500;
          overflow-wrap: anywhere;
        }
        .clip-mark {
          position: absolute;
          right: 18px;
          top: 13px;
          color: #c8a978;
          font-size: 30px;
          line-height: 26px;
          font-family: ${serifFont};
          opacity: 0.78;
        }
        .moments-end {
          position: absolute;
          width: var(--echo-content-width);
          left: var(--echo-page-pad);
          top: 690px;
          color: #38332d;
          font-size: 15px;
          line-height: 26px;
          font-weight: 800;
          white-space: pre-line;
        }
        .actions-title {
          position: absolute;
          width: var(--echo-content-width);
          left: var(--echo-page-pad);
          top: 78px;
          color: #1b3c21;
          font-size: 22px;
          line-height: 34px;
          font-weight: 800;
        }
        .action-trail {
          position: absolute;
          left: 50px;
          top: 196px;
          width: calc(var(--echo-frame-width, 390px) - 70px);
          height: 350px;
        }
        .action-row {
          position: absolute;
          left: 0;
          width: 100%;
          min-height: 42px;
        }
        .action-foot {
          position: absolute;
          width: 10px;
          height: 18px;
          left: 0;
          top: 9px;
          border-radius: 999px;
          background: rgba(200, 169, 120, 0.18);
        }
        .action-icon-bg {
          position: absolute;
          width: 32px;
          height: 32px;
          left: 38px;
          top: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(221, 235, 207, 0.78);
        }
        .action-icon-bg span {
          color: #2f5a35;
          font-size: 13px;
          line-height: 13px;
          font-weight: 800;
        }
        .action-text {
          position: absolute;
          left: 104px;
          top: 3px;
          width: calc(100% - 104px);
          margin: 0;
          color: #38332d;
          font-size: 15px;
          line-height: 24px;
        }
        .action-paper {
          position: absolute;
          width: var(--echo-content-width);
          min-height: 106px;
          left: var(--echo-page-pad);
          top: 628px;
          box-sizing: border-box;
          padding: 29px 66px 24px 48px;
          background: rgba(255, 252, 246, 0.72);
          box-shadow: 0 6px 16px rgba(56, 41, 20, 0.06);
          border-radius: 3px;
          color: #38332d;
          font-size: 15px;
          line-height: 27px;
          white-space: pre-line;
        }
        .action-paper .stamp {
          position: absolute;
          right: 18px;
          bottom: 22px;
          color: #c8a978;
          font-size: 16px;
          font-weight: 800;
        }
        .theme-lead {
          position: absolute;
          width: var(--echo-content-width);
          left: var(--echo-page-pad);
          top: 78px;
          color: #1b3c21;
          font-size: 24px;
          line-height: 42px;
          font-weight: 800;
        }
        .theme-desc {
          position: absolute;
          width: var(--echo-content-width);
          left: var(--echo-page-pad);
          top: 218px;
          color: #38332d;
          font-size: 18px;
          line-height: 36px;
          white-space: pre-line;
        }
        .theme-turn {
          position: absolute;
          width: var(--echo-content-width);
          left: var(--echo-page-pad);
          top: 510px;
          color: #38332d;
          font-size: 18px;
          line-height: 32px;
          white-space: pre-line;
        }
        .letter-card {
          position: absolute;
          width: var(--echo-content-width);
          height: 690px;
          left: var(--echo-page-pad);
          top: 62px;
          box-sizing: border-box;
          padding: 52px 28px 40px;
          overflow: hidden;
          background:
            radial-gradient(circle at 86% 7%, rgba(191, 160, 106, 0.12) 0 22px, transparent 23px),
            radial-gradient(circle at 88% 4%, rgba(255, 252, 244, 0.92) 0 18px, transparent 19px),
            rgba(255, 252, 244, 0.86);
          box-shadow: 0 18px 48px rgba(92, 72, 45, 0.08);
          border: 1px solid rgba(248, 240, 226, 0.72);
          border-radius: 22px;
        }
        .letter-card::before {
          content: '';
          position: absolute;
          right: -38px;
          top: -78px;
          width: 260px;
          height: 260px;
          border-radius: 999px;
          background:
            repeating-radial-gradient(circle, transparent 0 26px, rgba(191, 160, 106, 0.16) 27px 28px, transparent 29px 42px);
          opacity: 0.58;
          pointer-events: none;
        }
        .letter-card::after {
          content: '';
          position: absolute;
          right: 42px;
          bottom: 40px;
          width: 92px;
          height: 184px;
          border-right: 1.5px solid rgba(176, 149, 102, 0.34);
          border-radius: 50% 0 0 0;
          transform: rotate(-13deg);
          opacity: 0.72;
          pointer-events: none;
        }
        .letter-greeting {
          position: relative;
          z-index: 2;
          color: #1b3c21;
          font-size: 17px;
          line-height: 25px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .letter-body {
          position: relative;
          z-index: 2;
          margin-top: 26px;
          width: 100%;
          height: 444px;
          overflow: hidden;
          color: #38332d;
          font-size: 15px;
          line-height: 28px;
          font-weight: 500;
        }
        .letter-body p {
          margin: 0 0 14px;
        }
        .letter-sign {
          position: absolute;
          z-index: 2;
          right: 38px;
          bottom: 78px;
          color: #c8a978;
          font-size: 20px;
          line-height: 28px;
          font-weight: 800;
        }
        .letter-date {
          position: absolute;
          z-index: 2;
          right: 38px;
          bottom: 48px;
          color: rgba(191, 160, 106, 0.68);
          font-size: 13px;
          line-height: 18px;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        .poster-frame {
          font-family: ${serifFont};
        }
        .poster-month {
          position: absolute;
          left: 48px;
          top: 150px;
          font-size: 40px;
          line-height: 48px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: #1b3a22;
        }
        .poster-english {
          position: absolute;
          left: 52px;
          top: 205px;
          font-size: 24px;
          line-height: 30px;
          color: rgba(191, 160, 106, 0.92);
        }
        .poster-line {
          position: absolute;
          width: 54px;
          height: 1.2px;
          left: 50px;
          top: 259px;
          border-radius: 999px;
          background: rgba(191, 160, 106, 0.32);
        }
        .poster-theme {
          position: absolute;
          width: 260px;
          left: 50px;
          top: 300px;
          margin: 0;
          color: #6f675f;
          font-size: 24px;
          line-height: 39px;
          letter-spacing: 0.01em;
        }
        .poster-quote {
          position: absolute;
          left: 50px;
          top: 510px;
          width: 286px;
          box-sizing: border-box;
          padding: 18px 20px;
          border-left: 4px solid #2f5a35;
          background: rgba(237, 229, 213, 0.52);
          color: #38332d;
          font-family: ${storyFont};
          font-size: 17px;
          line-height: 30px;
          font-weight: 800;
        }
        .poster-owner {
          position: absolute;
          left: 50px;
          top: 680px;
          color: rgba(27, 58, 34, 0.7);
          font-size: 15px;
          font-family: ${storyFont};
        }
        .poster-sign {
          position: absolute;
          right: 48px;
          top: 720px;
          color: rgba(191, 160, 106, 0.92);
          font-size: 24px;
          font-weight: 700;
        }
        .status-content {
          position: absolute;
          left: 46px;
          top: 248px;
          width: 292px;
          color: #1b3c21;
        }
        .status-icon {
          width: 32px;
          height: 32px;
          margin-bottom: 26px;
          color: #2f5a35;
        }
        .status-content h1 {
          margin: 0;
          font-size: 30px;
          line-height: 40px;
          font-weight: 800;
        }
        .status-content p {
          margin: 24px 0 0;
          color: #38332d;
          font-size: 16px;
          line-height: 30px;
        }
      `}
    </style>
  );
}

export default function MonthlyEcho() {
  const [params] = useSearchParams();
  const monthKey = normalizeMonthKey(params.get('monthKey'));
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const [payload, setPayload] = useState<MonthlyEchoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [frameScale, setFrameScale] = useState(getFrameScale);
  const [frameWidth, setFrameWidth] = useState(getFrameWidth);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const posterRef = useRef<HTMLDivElement | null>(null);

  const displayName = formatDisplayName(auth?.user?.nickname);
  const sections: MonthlyEchoSections = payload?.sections || {};
  const storyData = useMemo(() => deriveStoryData(payload, sections), [payload, sections]);
  const letterParagraphs = useMemo(() => splitLetterParagraphs(storyData.letterText), [storyData.letterText]);
  const hasReadableEcho = Boolean(
    payload && (payload.fullText || sections.mainArcSection || sections.keyMomentsSection || sections.finalInsightSentence),
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = async () => {
    setLoading(true);
    try {
      setPayload(await monthlyEchoService.loadMonthlyEcho(monthKey));
    } catch (error: any) {
      console.error('Failed to load monthly echo:', error);
      showToast(error?.message || '月之回响暂时不可用');
      setPayload({ status: 'failed', monthKey, message: error?.message || '月之回响暂时不可用' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [monthKey]);

  useEffect(() => {
    const onResize = () => {
      setFrameScale(getFrameScale());
      setFrameWidth(getFrameWidth());
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollToPage = (index: number) => {
    const next = Math.min(storyPages.length - 1, Math.max(0, index));
    pageRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      setPayload(await monthlyEchoService.regenerateMonthlyEcho(monthKey));
      showToast('小象开始重新整理这个月了');
    } catch (error: any) {
      console.error('Failed to regenerate monthly echo:', error);
      showToast(error?.message || '重新整理失败，请稍后再试');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSavePoster = async () => {
    if (!payload || !posterRef.current || saving) return;
    const el = posterRef.current.firstElementChild as HTMLElement | null;
    if (!el) return;
    setSaving(true);
    const restoreColors = sanitizeModernColors(el);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        scale: 2,
        width: 390,
        height: 844,
        windowWidth: 390,
        windowHeight: 844,
      });
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl || dataUrl === 'data:,') throw new Error('Monthly echo poster export failed');
      const fileName = `xiaoxiang-monthly-echo-${payload.monthKey}.png`;
      if (canUseAndroidImageSaver()) {
        await savePngDataUrlToAndroidGallery(dataUrl, fileName);
        showToast('月之回响海报已保存到图库');
      } else {
        downloadBlob(fileName, await dataUrlToBlob(dataUrl));
        showToast('月之回响海报已下载');
      }
    } catch (error) {
      console.error('Failed to save monthly echo poster:', error);
      showToast('海报保存失败');
    } finally {
      restoreColors();
      setSaving(false);
    }
  };

  const commonFrameProps = {
    onBack: () => navigate(-1),
  };

  const renderReadablePages = () => (
    <>
      <EntranceCoverFrame monthKey={payload!.monthKey} onNext={() => scrollToPage(1)} />

      <EchoStoryFrame index={1} name="PAGE 2 / 02 本月地图" {...commonFrameProps}>
        <p className="map-lead">如果把这个月看成一张地图</p>
        <div className="map-label">本月主线</div>
        <h2 className="map-headline" style={clampStyle(3)}>{storyData.mapHeadline}</h2>
        <div className="map-route">
          <svg viewBox="0 0 390 844" fill="none" aria-hidden="true">
            <path
              d="M60 336C120 300 150 350 166 356C218 374 226 432 176 456C132 478 126 538 138 572C152 612 112 632 98 650"
              stroke="#DBECCC"
              strokeOpacity="0.25"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M58 336.888C118.984 300.989 149.477 350.848 165.739 356.831C218.592 374.78 226.723 432.616 175.903 456.548C131.181 478.486 125.083 538.317 137.28 572.221C151.509 612.107 110.853 632.051 96.623 650"
              stroke="#DBECCC"
              strokeOpacity="0.9"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
          <span className="map-dot" style={{ left: 157, top: 351, opacity: 0.88 }} />
          <span className="map-dot" style={{ left: 170, top: 452, opacity: 0.74 }} />
          <span className="map-dot" style={{ left: 130, top: 564, opacity: 0.58 }} />
        </div>
        <h3 className="map-title" style={{ left: 188, top: 293, width: 140 }}>{storyData.mapNodes[0].title}</h3>
        <p className="map-desc map-desc-two" style={{ left: 188, top: 318, width: 145 }}>{storyData.mapNodes[0].text}</p>
        <h3 className="map-title" style={{ left: 132, top: 394, width: 80 }}>{storyData.mapNodes[1].title}</h3>
        <p className="map-desc map-desc-two" style={{ left: 78, top: 422, width: 145 }}>{storyData.mapNodes[1].text}</p>
        <h3 className="map-title" style={{ left: 174, top: 504, width: 110 }}>{storyData.mapNodes[2].title}</h3>
        <p className="map-desc map-desc-three" style={{ left: 174, top: 530, width: 155 }}>{storyData.mapNodes[2].text}</p>
        <div className="map-summary" style={clampStyle(3)}>{storyData.mapSummary}</div>
        <DownCue onClick={() => scrollToPage(2)} />
      </EchoStoryFrame>

      <EchoStoryFrame index={2} name="PAGE 3 / 03 三个关键时刻" {...commonFrameProps}>
        <EchoRings left={196} top={63} />
        <p className="moments-lead">这个月，<br />小象想帮你留下三个时刻：</p>
        {storyData.moments.map((moment, index) => (
          <MomentCard
            key={`${index}-${moment.dateLabel}-${moment.title}`}
            index={index}
            moment={moment}
            top={[154, 326, 498][index]}
            rotate={[0.5, -0.7, 0.6][index]}
          />
        ))}
        <p className="moments-end" style={clampStyle(3)}>{storyData.momentsSummary}</p>
        <DownCue onClick={() => scrollToPage(3)} />
      </EchoStoryFrame>

      <EchoStoryFrame index={3} name="PAGE 4 / 04 行动轨迹" {...commonFrameProps}>
        <h2 className="actions-title">这个月，<br />你不是只是在想。</h2>
        <ActionTrail actions={storyData.actions} />
        <div className="action-paper" style={clampStyle(3)}>
          {storyData.actionSummary}
          <span className="stamp">小象</span>
        </div>
        <DownCue onClick={() => scrollToPage(4)} />
      </EchoStoryFrame>

      <EchoStoryFrame index={4} name="PAGE 5 / 05 反复主题" {...commonFrameProps}>
        <EchoRings left={222} top={48} sizes={[60, 80, 100, 120, 140]} />
        <EchoRings left={257} top={244} sizes={[70, 90, 110, 130, 150]} />
        <h2 className="theme-lead">这个月，<br />有一个问题一再出现：</h2>
        <p className="theme-desc" style={clampStyle(3)}>{storyData.repeatedLead}</p>
        <BrushQuote className="left-[34px] top-[378px] text-[22px] leading-[29px]" width="calc(var(--echo-frame-width, 390px) - 68px)">
          「{storyData.repeatedQuestion}」
        </BrushQuote>
        <p className="theme-turn" style={clampStyle(2)}>{storyData.repeatedTurn}</p>
        <BrushQuote className="left-[34px] top-[636px] text-[19px] leading-[29px]" width="calc(var(--echo-frame-width, 390px) - 68px)" green>
          「{storyData.nextQuestion}」
        </BrushQuote>
        <DownCue onClick={() => scrollToPage(5)} />
      </EchoStoryFrame>

      <EchoStoryFrame index={5} name="PAGE 6 / 06 回声信" {...commonFrameProps}>
        <div className="letter-card">
          <div className="letter-greeting">亲爱的 {displayName}：</div>
          <div className="letter-body">
            {letterParagraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 8)}`}>{paragraph}</p>
            ))}
          </div>
          <div className="letter-sign">爱你的小象</div>
          <div className="letter-date">{payload!.monthKey.replace('-', ' · ')}</div>
        </div>
      </EchoStoryFrame>
    </>
  );

  const renderStatusPage = () => {
    if (loading) {
      return <StatusStoryFrame title="月之回响" message="小象正在翻看这个月的回声。" loading onBack={() => navigate(-1)} />;
    }

    if (payload?.status === 'disabled') {
      return <StatusStoryFrame title="月之回响已关闭" message="你可以在设置里重新打开。已经生成过的历史回响会继续留在这里。" onBack={() => navigate(-1)} />;
    }

    if (!hasReadableEcho && payload?.status === 'empty') {
      return (
        <StatusStoryFrame
          title={`${monthKeyToLabel(monthKey)}月之回响`}
          message={payload.message || '这个月还没有足够的日记。等这里多几页文字，小象再慢慢读给你听。'}
          onBack={() => navigate(-1)}
        />
      );
    }

    return (
      <StatusStoryFrame
        title={`${monthKeyToLabel(monthKey)}月之回响`}
        message={payload?.message || '已经加入生成队列。你可以先去写日记，整理好后再回来。'}
        loading
        onBack={() => navigate(-1)}
      />
    );
  };

  const renderSlot = (content: React.ReactNode, index: number, isEntrancePage = false) => {
    if (isEntrancePage) {
      return (
        <div
          key={index}
          ref={node => {
            pageRefs.current[index] = node;
          }}
          className="monthly-echo-slot monthly-echo-entrance-slot"
        >
          {content}
        </div>
      );
    }

    return (
      <div
        key={index}
        ref={node => {
          pageRefs.current[index] = node;
        }}
        className="monthly-echo-slot"
      >
        <div style={{ width: frameWidth * frameScale, height: 844 * frameScale }}>
          <div
            className="echo-scale-box"
            style={{
              transform: `scale(${frameScale})`,
              '--echo-frame-width': `${frameWidth}px`,
            } as React.CSSProperties}
          >
            {content}
          </div>
        </div>
      </div>
    );
  };

  const storyContent = hasReadableEcho && payload
    ? React.Children.toArray(renderReadablePages().props.children)
    : [renderStatusPage()];

  return (
    <div className="monthly-echo-root">
      <StoryStyle />
      <div ref={scrollerRef} className="monthly-echo-scroll">
        {storyContent.map((content, index) => renderSlot(content, index, Boolean(hasReadableEcho && payload && index === 0)))}
      </div>
      <div ref={posterRef} className="pointer-events-none fixed left-[-9999px] top-0">
        {payload && hasReadableEcho && (
          <MonthlyEchoPoster payload={payload} storyData={storyData} displayName={displayName} />
        )}
      </div>
      <AppToast message={toast} />
    </div>
  );
}
