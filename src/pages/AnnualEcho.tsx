import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { BookOpen, Download } from 'lucide-react';
import { annualEchoService } from '../services/annualEchoService';
import type { AnnualEchoDigest, AnnualEchoManualItem, AnnualEchoQuote } from '../utils/annualEcho';
import { sanitizeModernColors } from '../utils/exportImage';
import { downloadBlob } from '../utils/exportFile';
import { canUseAndroidImageSaver, savePngDataUrlToAndroidGallery } from '../services/androidImageSaver';
import { AppToast } from '../components/AppToast';

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const storyFont = '"Arial Rounded MT Bold", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const titleStyle = { fontFamily: storyFont, fontWeight: 900, letterSpacing: '0.04em' };
const bodyStyle = { fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif', letterSpacing: '0.12em' };

type StoryTone = 'peach' | 'pink' | 'yellow' | 'green' | 'paper';

function formatPlainNumber(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

function parseYearParam(value: string | null): number {
  const year = Number(value);
  const nowYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > nowYear + 1) return nowYear;
  return year;
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(response => response.blob());
}

function getDigestQuotes(digest: AnnualEchoDigest): AnnualEchoQuote[] {
  if (Array.isArray(digest.quotes) && digest.quotes.length > 0) return digest.quotes.slice(0, 5);
  return digest.quote ? [digest.quote] : [];
}

function getAcquaintanceFontSize(value: number): number {
  const length = formatPlainNumber(value).length;
  if (length >= 5) return 94;
  if (length >= 4) return 108;
  return 136;
}

function ChevronHint({ hidden = false }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[26px] z-20 flex justify-center">
      <div className="h-8 w-8 rotate-45 border-b-[5px] border-r-[5px] border-[#5A473E]/35" />
    </div>
  );
}

function toneBackground(tone: StoryTone): React.CSSProperties {
  const base: Record<StoryTone, string> = {
    peach: 'radial-gradient(circle at 50% 44%, rgba(255,247,207,0.86) 0%, rgba(255,244,214,0.72) 20%, rgba(246,193,174,0.50) 62%, rgba(247,207,190,0.86) 100%)',
    pink: 'radial-gradient(circle at 52% 45%, rgba(255,250,214,0.9) 0%, rgba(255,244,214,0.72) 24%, rgba(250,201,189,0.55) 66%, rgba(249,212,200,0.92) 100%)',
    yellow: 'radial-gradient(circle at 53% 38%, rgba(255,251,207,0.94) 0%, rgba(250,236,152,0.73) 50%, rgba(230,236,170,0.80) 100%)',
    green: 'radial-gradient(circle at 53% 45%, rgba(255,250,208,0.93) 0%, rgba(235,233,172,0.72) 50%, rgba(218,226,190,0.82) 100%)',
    paper: 'radial-gradient(circle at 51% 42%, rgba(255,247,218,0.92) 0%, rgba(248,232,190,0.82) 52%, rgba(236,219,182,0.94) 100%)',
  };
  return {
    backgroundImage: [
      'repeating-linear-gradient(105deg, rgba(74,54,43,0.025) 0px, rgba(74,54,43,0.025) 1px, transparent 1px, transparent 6px)',
      'repeating-linear-gradient(13deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 7px)',
      base[tone],
    ].join(', '),
  };
}

function LeafShadow({ side = 'left' }: { side?: 'left' | 'right' }) {
  return (
    <div
      className={`pointer-events-none absolute z-0 h-[340px] w-[210px] opacity-30 blur-[2px] ${
        side === 'left' ? 'left-[-42px] top-[12vh]' : 'right-[-54px] top-[35vh]'
      }`}
      style={{
        background:
          'radial-gradient(ellipse at 44% 18%, rgba(89,112,74,0.20) 0 11%, transparent 12%), radial-gradient(ellipse at 62% 35%, rgba(89,112,74,0.18) 0 10%, transparent 11%), radial-gradient(ellipse at 36% 52%, rgba(89,112,74,0.16) 0 12%, transparent 13%), linear-gradient(105deg, transparent 0 47%, rgba(89,112,74,0.18) 48% 52%, transparent 53%)',
        transform: side === 'left' ? 'rotate(-18deg)' : 'rotate(20deg)',
      }}
    />
  );
}

function StorySection({
  tone,
  children,
  leaf,
  last,
}: {
  tone: StoryTone;
  children: React.ReactNode;
  leaf?: 'left' | 'right';
  last?: boolean;
}) {
  return (
    <section className="relative h-dvh snap-start snap-always overflow-hidden text-[#34241F]" style={toneBackground(tone)}>
      {leaf && <LeafShadow side={leaf} />}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[560px] flex-col px-9">
        {children}
      </div>
      <ChevronHint hidden={last} />
    </section>
  );
}

function DataLine({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-end gap-5">
      <span className="text-[74px] font-black leading-none text-[#34241F]" style={titleStyle}>{value}</span>
      <span className="pb-3 text-[24px] font-black leading-none text-[#34241F]" style={titleStyle}>{label}</span>
    </div>
  );
}

function ManualLine({ item, index }: { item: AnnualEchoManualItem; index: number }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-5 border-b border-[#8C755D]/22 pb-7 last:border-b-0">
      <div className="pt-1 text-[38px] italic leading-none text-[#9A7A53]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        {String(index + 1).padStart(2, '0')}
      </div>
      <p className="text-[24px] leading-[2.05] text-[#2F2B27]" style={bodyStyle}>{item.text}</p>
    </div>
  );
}

function AnnualEchoPoster({ digest }: { digest: AnnualEchoDigest }) {
  const stats = digest.stats;
  const quotes = getDigestQuotes(digest).slice(0, 4);
  const manual = digest.manualItems.slice(0, 5);
  return (
    <div
      data-ready="true"
      style={{
        width: 760,
        minHeight: 1060,
        boxSizing: 'border-box',
        padding: '82px 68px 64px',
        background: '#F7E3D2',
        color: '#34241F',
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 25, textAlign: 'center', marginBottom: 46, letterSpacing: '0.12em' }}>小象日志 · {stats.year} 年度回声</div>
        <div style={{ fontSize: 50, lineHeight: 1.35, fontWeight: 900, textAlign: 'center', marginBottom: 44 }}>
          收好这一页
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.8, textAlign: 'center', letterSpacing: '0.1em' }}>
          你写下的<br />都没有白白经过
        </div>
      </div>

      {quotes.length > 0 && (
        <div style={{ display: 'grid', gap: 20, fontSize: 24, lineHeight: 1.65 }}>
          {quotes.map(quote => <div key={quote.text}>• {quote.text}</div>)}
        </div>
      )}

      {manual.length > 0 && (
        <div style={{ display: 'grid', gap: 14, fontSize: 20, lineHeight: 1.58, color: '#403932' }}>
          {manual.map((item, index) => <div key={item.text}>{String(index + 1).padStart(2, '0')}  {item.text}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, fontSize: 18 }}>
        {[['日志', stats.totalEntries], ['天数', stats.writingDays], ['全勤周', stats.perfectWeeks], ['字数', stats.totalWords]].map(([label, value]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#73655A', marginBottom: 7 }}>{label}</div>
            <div style={{ fontSize: 27, fontWeight: 900 }}>{formatPlainNumber(Number(value))}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', color: '#34241F', fontSize: 22, fontWeight: 700 }}>小象日志</div>
    </div>
  );
}

export default function AnnualEcho() {
  const [params] = useSearchParams();
  const year = parseYearParam(params.get('year'));
  const [digest, setDigest] = useState<AnnualEchoDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    annualEchoService.loadAnnualEcho(year)
      .then(result => {
        if (!cancelled) setDigest(result);
      })
      .catch((error) => {
        console.error('Failed to load annual echo:', error);
        if (!cancelled) showToast('年度回声暂时没有读完整');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const handleSavePoster = async () => {
    if (!digest || !posterRef.current || saving) return;
    setSaving(true);
    const el = posterRef.current.firstElementChild as HTMLElement | null;
    if (!el) {
      setSaving(false);
      return;
    }

    const restoreColors = sanitizeModernColors(el);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        scale: 1.5,
        width: Math.ceil(el.scrollWidth || el.offsetWidth),
        height: Math.ceil(el.scrollHeight || el.offsetHeight),
        windowWidth: Math.ceil(el.scrollWidth || el.offsetWidth),
        windowHeight: Math.ceil(el.scrollHeight || el.offsetHeight),
      });
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl || dataUrl === 'data:,') throw new Error('Annual echo poster export failed');

      const fileName = `xiaoxiang-annual-echo-${digest.stats.year}.png`;
      if (canUseAndroidImageSaver()) {
        await savePngDataUrlToAndroidGallery(dataUrl, fileName);
        showToast('年度海报已保存到图库');
      } else {
        downloadBlob(fileName, await dataUrlToBlob(dataUrl));
        showToast('年度海报已下载');
      }
    } catch (error) {
      console.error('Failed to save annual echo poster:', error);
      showToast('年度海报保存失败');
    } finally {
      restoreColors();
      setSaving(false);
    }
  };

  const content = useMemo(() => {
    if (!digest) return null;
    const stats = digest.stats;
    const quotes = getDigestQuotes(digest);
    const visibleQuotes = quotes.length > 0
      ? quotes
      : [{ text: '今年还没有挑出足够可靠的原话。再多写一点，它会自己浮出来。', entryId: 'fallback', date: stats.rangeEnd }];
    const manualItems = digest.manualItems.length > 0
      ? digest.manualItems
      : [{ text: '只要继续写下去，我就能把这一年看得更清楚。', evidenceEntryIds: [], evidenceDates: [] }];
    const busiestMonthName = MONTH_NAMES[stats.busiestMonth.month - 1] || `${stats.busiestMonth.month}月`;

    return (
      <main data-annual-echo-scroll className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain bg-[#F3DFCF]">
        <StorySection tone="peach" leaf="left">
          <div className="flex flex-1 flex-col items-center justify-center pb-[8vh] text-center">
            <p className="mb-20 text-[25px] font-black leading-none text-[#34241F]" style={titleStyle}>小象日志</p>
            <h1 className="text-[38px] font-black leading-[1.66] text-[#34241F]" style={titleStyle}>
              今天，我们一起翻开<br />
              你的 {stats.year} 年度回声
            </h1>
            <p className="mt-14 text-[25px] leading-[1.8] text-[#3E3631]" style={bodyStyle}>
              那些被你写下来的日子<br />
              都在这里轻轻回响
            </p>
          </div>
        </StorySection>

        <StorySection tone="pink" leaf="right">
          <div className="flex flex-1 flex-col items-center justify-center pb-[4vh] text-center">
            <p className="text-[29px] font-black leading-[1.7] text-[#34241F]" style={titleStyle}>
              从第一篇有效日记到今天<br />
              小象陪你走过了
            </p>
            <div className="mt-12 flex items-end justify-center gap-5">
              <span
                className="font-black leading-none text-[#34241F]"
                style={{ ...titleStyle, fontSize: getAcquaintanceFontSize(stats.acquaintanceDays) }}
              >
                {formatPlainNumber(stats.acquaintanceDays)}
              </span>
              <span className="pb-5 text-[40px] font-black text-[#34241F]" style={titleStyle}>天</span>
            </div>
            <p className="mt-16 text-[27px] leading-[1.9] text-[#34241F]" style={bodyStyle}>
              不是每天都要完整<br />
              你留下来的这些<br />
              就是这一年的纹理
            </p>
          </div>
        </StorySection>

        <StorySection tone="yellow" leaf="right">
          <div className="relative flex flex-1 flex-col justify-center pb-[4vh] pl-8">
            <h2 className="mb-12 text-[34px] font-black leading-none text-[#34241F]" style={titleStyle}>这一年，你写下了</h2>
            <div className="space-y-10">
              <DataLine value={formatPlainNumber(stats.totalEntries)} label="篇日志" />
              <DataLine value={formatPlainNumber(stats.writingDays)} label="个记录日" />
              <DataLine value={formatPlainNumber(stats.totalWords)} label="个字" />
              <DataLine value={formatPlainNumber(stats.totalImages)} label="张图片" />
              <DataLine value={formatPlainNumber(stats.activeWritingMinutes)} label="分钟写作时间" />
            </div>
            <p className="absolute right-7 top-[39vh] text-[24px] leading-[1.8] text-[#5E524C] [writing-mode:vertical-rl]" style={bodyStyle}>
              是文字连接了我们
            </p>
          </div>
        </StorySection>

        <StorySection tone="green" leaf="left">
          <div className="flex flex-1 flex-col items-center justify-center pb-[3vh] text-center">
            <p className="text-[27px] font-black leading-none text-[#34241F]" style={titleStyle}>那些持续写下来的星期</p>
            <p className="mt-20 text-[48px] font-black leading-none text-[#34241F]" style={titleStyle}>你有</p>
            <div className="mt-6 text-[154px] font-black leading-none text-[#34241F]" style={titleStyle}>
              {formatPlainNumber(stats.perfectWeeks)}
            </div>
            <p className="mt-2 text-[50px] font-black leading-none text-[#34241F]" style={titleStyle}>个全勤周</p>
            <p className="mt-[52px] text-[24px] leading-[1.75] text-[#34241F]" style={bodyStyle}>
              一整周里<br />
              每天都和自己见了一面
            </p>
            <p className="mt-24 text-[24px] leading-[1.9] text-[#34241F]" style={bodyStyle}>
              {busiestMonthName}写得最多<br />
              一共 <span className="text-[36px] font-black" style={titleStyle}>{formatPlainNumber(stats.busiestMonth.entryCount)}</span> 篇
            </p>
          </div>
        </StorySection>

        <StorySection tone="peach" leaf="left">
          <div className="flex flex-1 flex-col justify-center pb-[2vh]">
            <h2 className="mb-16 text-center text-[38px] font-black leading-none text-[#241B19]" style={titleStyle}>你的成长金句</h2>
            <div className="mx-auto w-full max-w-[460px] rounded-[28px] border border-[#5B3D31]/10 bg-[#FFF2DF]/10 px-3 py-3">
              <ul className="space-y-10">
                {visibleQuotes.slice(0, 5).map(quote => (
                  <li key={`${quote.entryId}-${quote.text}`} className="grid grid-cols-[26px_1fr] gap-4 text-[#111]">
                    <span className="mt-4 h-3 w-3 rounded-full bg-[#111]" />
                    <span className="text-[29px] font-black leading-[1.72]" style={bodyStyle}>{quote.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </StorySection>

        <StorySection tone="pink" leaf="right">
          <div className="flex flex-1 flex-col items-center justify-center pb-[4vh] text-center">
            <p className="mb-24 text-[30px] font-black leading-none text-[#34241F]" style={titleStyle}>关于这一年的总回应</p>
            <p className="max-w-[450px] text-[42px] font-black leading-[1.7] text-[#34241F]" style={titleStyle}>
              {digest.annualReply}
            </p>
          </div>
        </StorySection>

        <StorySection tone="paper" leaf="right">
          <div className="flex flex-1 flex-col justify-center pb-[2vh]">
            <h2 className="mb-6 text-[45px] font-black leading-none text-[#34241F]" style={titleStyle}>你的使用说明书</h2>
            <div className="mb-11 h-[2px] w-[300px] bg-[#9A7A53]/65" />
            <div className="max-h-[68vh] space-y-7 overflow-y-auto pr-1">
              {manualItems.map((item, index) => (
                <ManualLine key={`${index}-${item.text}`} item={item} index={index} />
              ))}
            </div>
          </div>
        </StorySection>

        <StorySection tone="peach" leaf="left" last>
          <div className="flex flex-1 flex-col items-center justify-center pb-[4vh] text-center">
            <h2 className="text-[45px] font-black leading-none text-[#34241F]" style={titleStyle}>收好这一页</h2>
            <div className="my-9 text-[30px] leading-none">❤</div>
            <p className="text-[30px] leading-[1.9] text-[#2F2B27]" style={bodyStyle}>
              {stats.year} 年度回声<br />
              你写下的<br />
              都没有白白经过
            </p>
            <p className="mt-14 text-[30px] leading-[1.85] text-[#2F2B27]" style={bodyStyle}>
              保存这一年的回声<br />
              留给之后的自己
            </p>
            <button
              type="button"
              onClick={() => void handleSavePoster()}
              disabled={saving}
              className="mt-16 flex min-h-16 min-w-[270px] items-center justify-center gap-3 rounded-[14px] border border-[#D8AA98] bg-[#FFF4E9]/42 px-8 text-[24px] text-[#3B332F] disabled:opacity-60"
              style={bodyStyle}
            >
              <Download className="h-6 w-6" />
              {saving ? '正在保存' : '保存年度海报'}
            </button>
            <p className="mt-32 text-[25px] font-black tracking-[0.35em] text-[#2F2B27]" style={titleStyle}>小象日志</p>
          </div>
        </StorySection>
      </main>
    );
  }, [digest, saving]);

  return (
    <div className="fixed inset-0 z-[120] bg-[#F3DFCF] text-[#34241F]">
      {loading ? (
        <div className="flex h-dvh flex-col items-center justify-center bg-[#F3DFCF] text-[#34241F]" style={bodyStyle}>
          <span className="mb-4 h-8 w-8 rounded-full border-2 border-[#34241F]/20 border-t-[#34241F] animate-spin" />
          <p className="text-[16px]">正在翻开这一年的日记</p>
        </div>
      ) : !digest ? (
        <div className="flex h-dvh items-center justify-center bg-[#F3DFCF] px-10 text-center text-[16px]" style={bodyStyle}>
          年度回声暂时不可用
        </div>
      ) : digest.stats.totalEntries <= 0 ? (
        <div className="flex h-dvh flex-col items-center justify-center bg-[#F3DFCF] px-10 text-center" style={bodyStyle}>
          <BookOpen className="mb-6 h-10 w-10 text-[#34241F]" />
          <h1 className="text-[30px] font-black" style={titleStyle}>{year} 年度回声</h1>
          <p className="mt-5 text-[16px] leading-8">今年还没有足够的有效日记。等这里多几页文字，小象再慢慢读给你听。</p>
        </div>
      ) : content}

      <div ref={posterRef} className="fixed left-[-9999px] top-0 pointer-events-none">
        {digest && <AnnualEchoPoster digest={digest} />}
      </div>
      <AppToast message={toast} />
    </div>
  );
}
