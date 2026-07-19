import React from 'react';
import type { MonthlyEchoPageBase, MonthlyEchoRenderPayload } from '../../utils/monthlyEcho';

type ScrollToPage = (index: number) => void;

const artwork = {
  entrance: '/monthly-echo/monthly-echo-cover-clean-v2.png?v=20260717-monthly-echo-cover-clean',
  overview: '/monthly-echo/monthly-echo-story-textless-v2.png',
  map: '/monthly-echo/monthly-echo-map-textless-v3.png?v=20260719-flat-arrow-area',
  moments: '/monthly-echo/monthly-echo-moments-textless-v3.png?v=20260719-flat-arrow-area',
  actions: '/monthly-echo/monthly-echo-actions-textless-v3.png?v=20260718-flat-arrow-area',
  recurring: '/monthly-echo/monthly-echo-theme-textless-v3.png?v=20260719-flat-arrow-area',
  letter: '/monthly-echo/monthly-echo-letter-textless-v2.png',
  letterReference: '/monthly-echo/monthly-echo-letter-reference.png',
};

function shortDate(date: string): string {
  const match = /\d{4}-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[1]}.${match[2]}` : date.slice(-5).replace('-', '.');
}

export interface OverviewOccurrenceSummary {
  dates: string[];
  context: string;
}

/** Groups the recurring dates and turns the existing lead sentence into a shared context phrase. */
export function buildOverviewOccurrenceSummary(
  occurrences: Array<{ date: string }>,
  recurringLead: string,
  fallbackQuestion: string,
): OverviewOccurrenceSummary {
  const dates = Array.from(new Set(
    occurrences.slice(0, 3).map(item => shortDate(item.date)).filter(Boolean),
  ));
  const lead = String(recurringLead || '').replace(/\s+/g, '').trim();
  const conditionalContext = /^当(.+?)时(?:[，,].*)?$/.exec(lead)?.[1] || '';
  const context = (conditionalContext || lead.replace(/[，,](?:你会|你开始|你往往).*$/, '') || fallbackQuestion)
    .replace(/^你/, '')
    .replace(/[。；;，,：:！？!?]+$/, '')
    .trim();

  return { dates, context };
}

/** Keeps the recurring lead visually stable even when the model returns it as one sentence. */
export function buildRecurringLeadLines(lead: string): [string, string] {
  const normalized = String(lead || '').replace(/\s+/g, '').trim();
  const condition = /^(当.+?时)(?:[，,].*)?$/.exec(normalized)?.[1]
    || normalized.replace(/[，,]?(?:你会|你很快会|你开始).*$/, '').replace(/[。；;，,：:！？!?]+$/, '');
  return [condition ? `${condition}，` : '', '你会很快开始问：'];
}

function recurringDensity(page: MonthlyEchoRenderPayload['pages']['recurring']): 'normal' | 'compact' | 'dense' {
  const total = [page.lead, page.question, page.evolvedQuestion, page.conclusion, ...page.occurrences.map(item => item.scene)]
    .reduce((sum, text) => sum + Array.from(String(text || '').replace(/\s+/g, '')).length, 0);
  if (total > 270 || Array.from(page.conclusion || '').length > 90) return 'dense';
  if (total > 190 || Array.from(page.conclusion || '').length > 48) return 'compact';
  return 'normal';
}

function clamp(lines: number): React.CSSProperties {
  return { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
}

function overviewDensity(
  page: MonthlyEchoRenderPayload['pages']['overview'],
  summary: OverviewOccurrenceSummary,
): 'normal' | 'compact' | 'dense' {
  const total = [
    page.initialQuestion,
    page.evolvedQuestion,
    page.conclusion || page.mainArc,
    summary.dates.join('、'),
    summary.context,
  ].reduce((sum, text) => sum + Array.from(String(text || '').replace(/\s+/g, '')).length, 0);
  if (total > 220) return 'dense';
  if (total > 145) return 'compact';
  return 'normal';
}

function letterDensity(page: MonthlyEchoRenderPayload['pages']['letter']): 'normal' | 'compact' | 'dense' | 'extra-dense' {
  const total = [page.salutation, ...page.paragraphs, page.finalInsight]
    .reduce((sum, text) => sum + Array.from(String(text || '').replace(/\s+/g, '')).length, 0);
  if (total > 700) return 'extra-dense';
  if (total > 450) return 'dense';
  if (total > 420) return 'compact';
  return 'normal';
}

function momentsSummaryDensity(text: string): 'normal' | 'compact' | 'dense' {
  const length = Array.from(String(text || '').replace(/\s+/g, '')).length;
  if (length > 90) return 'dense';
  if (length > 45) return 'compact';
  return 'normal';
}

function fallback(page: MonthlyEchoPageBase): string {
  return page.contentState === 'ready' ? '' : page.fallbackMessage || '这个月的记录还不够，小象先不替你下结论。';
}

function ExactPage({ index, name, src, className, onNext, children }: {
  index: number;
  name: string;
  src: string;
  className: string;
  onNext?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`echo-frame exact-echo-page ${className}`} data-page-index={index} data-name={name}>
      <div className="exact-artboard">
        <img src={src} alt="" draggable={false} />
        {children}
        {onNext && <span className="exact-next-repair" style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />}
      </div>
      {onNext && (
        <button type="button" className="exact-next" onClick={onNext} aria-label="下一页">
          <span className="exact-next-visual" aria-hidden="true">
            <svg className="exact-next-arrow exact-next-arrow-trail" viewBox="0 0 20 12">
              <path d="M3 3.5 10 10l7-6.5" />
            </svg>
            <svg className="exact-next-arrow exact-next-arrow-main" viewBox="0 0 20 12">
              <path d="M3 3.5 10 10l7-6.5" />
            </svg>
          </span>
        </button>
      )}
    </section>
  );
}

function Entrance({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.entrance;
  return (
    <ExactPage index={0} name="PAGE 1 / 入口页" src={artwork.entrance} className="exact-entrance" onNext={onNext}>
      <div className="exact-patch cover-month-patch">
        <strong>{page.monthEn}</strong>
        <span>本月共记录 {page.diaryCount} 篇</span>
        <i />
      </div>
    </ExactPage>
  );
}

function Overview({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.overview;
  const occurrenceSummary = buildOverviewOccurrenceSummary(
    page.occurrences,
    report.pages.recurring.lead,
    page.initialQuestion,
  );
  const density = overviewDensity(page, occurrenceSummary);
  return (
    <ExactPage index={1} name="PAGE 2 / 月度封面" src={artwork.overview} className={`exact-overview overview-density-${density}`} onNext={onNext}>
      <div className="exact-patch overview-header"><strong>{report.pages.entrance.month}的回响</strong><span>{report.pages.entrance.monthEn}</span><i /></div>
      <div className="exact-patch overview-intro">这个月，<br />你反复遇见一个问题：</div>
      <div className="exact-patch exact-wash-gold overview-question">{page.initialQuestion ? `「${page.initialQuestion}」` : fallback(page)}</div>
      <div className="exact-patch overview-events">
        {occurrenceSummary.dates.length > 0 ? (
          <>
            <p>它出现在</p>
            <p className="overview-event-dates">{occurrenceSummary.dates.join('、')}。</p>
            <p className="overview-event-context">每一次都和“{occurrenceSummary.context}”有关。</p>
          </>
        ) : fallback(page)}
      </div>
      <div className="exact-patch overview-turn">但到月底，<br />另一个问题开始出现：</div>
      <div className="exact-patch exact-wash-green overview-evolved">{page.evolvedQuestion ? `「${page.evolvedQuestion}」` : fallback(page)}</div>
      <div className="exact-patch exact-paper-white overview-conclusion">{page.conclusion || page.mainArc || fallback(page)}</div>
    </ExactPage>
  );
}

function MapPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.map;
  const themeCount = Math.min(3, page.sideThemes.length);
  return (
    <ExactPage index={2} name="PAGE 3 / 本月地图" src={artwork.map} className={`exact-map map-count-${themeCount}`} onNext={onNext}>
      <svg className="map-line-repair" viewBox="0 0 475 844" aria-hidden="true">
        <path d="M 173.7 275.2 C 190 279, 217 298, 224.6 311.1" />
      </svg>
      <div className="exact-patch exact-wash-green map-main-patch"><span style={clamp(4)}>{page.mainArc || fallback(page)}</span></div>
      {page.sideThemes.slice(0, 3).map((item, index) => (
        <div className={`exact-patch map-node-patch map-node-patch-${index + 1}`} key={`${item.date}-${item.title}`}>
          <strong>{item.title}</strong><b>{shortDate(item.date)}</b><p style={clamp(3)}>{item.scene || item.meaning}</p>
        </div>
      ))}
      <div className="exact-patch exact-paper-white map-summary-patch" style={clamp(4)}>{page.summary || fallback(page)}</div>
    </ExactPage>
  );
}

function Moments({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.moments;
  const summary = page.summary || fallback(page);
  const summaryDensity = momentsSummaryDensity(summary);
  return (
    <ExactPage index={3} name="PAGE 4 / 三个关键时刻" src={artwork.moments} className={`exact-moments moments-summary-${summaryDensity}`} onNext={onNext}>
      {page.items.slice(0, 3).map((item, index) => (
        <React.Fragment key={`${item.date}-${item.title}`}>
          <div className={`exact-patch exact-paper-white moment-date-patch moment-date-patch-${index + 1}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{shortDate(item.date)}</span></div>
          <div className={`exact-patch exact-paper-white moment-copy-patch moment-copy-patch-${index + 1}`}><h3>{item.title || item.event}</h3><p style={clamp(4)}>{item.meaning || item.event}</p></div>
        </React.Fragment>
      ))}
      <div className="exact-patch exact-paper-aged moments-summary-patch">{summary}</div>
    </ExactPage>
  );
}

function Actions({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.actions;
  const items = page.items.slice(0, 5);
  return (
    <ExactPage index={4} name="PAGE 5 / 行动轨迹" src={artwork.actions} className="exact-actions" onNext={onNext}>
      {items.map((item, index) => (
        <div className={`exact-patch action-copy-patch action-copy-patch-${index + 1}`} key={`${item.date}-${item.action}`}>
          <b>{shortDate(item.date)}</b><h3 style={clamp(2)}>{item.action}</h3><p style={clamp(3)}>{item.scene || item.meaning}</p>
        </div>
      ))}
      {items.length === 0 && <div className="exact-patch action-empty-patch">{fallback(page)}</div>}
      <div className="exact-patch exact-paper-white actions-summary-patch"><span style={clamp(5)}>{page.summary || fallback(page)}</span></div>
    </ExactPage>
  );
}

function Recurring({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.recurring;
  const occurrenceCount = Math.min(3, page.occurrences.length);
  const [leadContext, leadPrompt] = buildRecurringLeadLines(page.lead);
  const density = recurringDensity(page);
  return (
    <ExactPage index={5} name="PAGE 6 / 反复主题" src={artwork.recurring} className={`exact-recurring recurring-count-${occurrenceCount} recurring-density-${density}`} onNext={onNext}>
      <div className="recurring-lower-cover" aria-hidden="true" />
      <img className="recurring-lower-artwork" src={artwork.recurring} alt="" aria-hidden="true" />
      <div className="recurring-conclusion-cover" aria-hidden="true" />
      <img className="recurring-conclusion-artwork" src={artwork.recurring} alt="" aria-hidden="true" />
      <h2 className="exact-patch recurring-title-patch">这个月，<br />有一个问题反复出现：</h2>
      <div className="exact-patch recurring-lead-patch">
        {leadContext ? <><span>{leadContext}</span><span>{leadPrompt}</span></> : fallback(page)}
      </div>
      <div className="exact-patch exact-wash-gold recurring-question-patch">{page.question ? `「${page.question}」` : fallback(page)}</div>
      <div className="exact-patch recurring-events-patch">{page.occurrences.slice(0, 3).map(item => (
        <p key={`${item.date}-${item.scene}`}><i aria-hidden="true" /><b>{shortDate(item.date)}</b><span>{item.scene}</span></p>
      ))}</div>
      <div className="exact-patch recurring-turn-patch">
        但这个月的不同在于，<br />
        {page.turnDate && <>到 <b>{shortDate(page.turnDate)}</b>，<br /></>}
        你开始问另一个问题：
      </div>
      <div className="exact-patch exact-wash-green recurring-evolved-patch">{page.evolvedQuestion ? `「${page.evolvedQuestion}」` : fallback(page)}</div>
      <div className="exact-patch exact-paper-white recurring-conclusion-patch">{page.conclusion || fallback(page)}</div>
    </ExactPage>
  );
}

function Letter({ report }: { report: MonthlyEchoRenderPayload }) {
  const page = report.pages.letter;
  const density = letterDensity(page);
  const paragraphs = page.paragraphs.map(text => text.trim()).filter(Boolean);
  const finalParagraph = page.finalInsight.trim() || (paragraphs.length === 0 ? fallback(page) : '');
  if (finalParagraph && paragraphs.at(-1) !== finalParagraph) paragraphs.push(finalParagraph);
  return (
    <ExactPage index={6} name="PAGE 7 / 回声信" src={artwork.letter} className={`exact-letter letter-density-${density}`}>
      <img className="letter-photo-artwork" src={artwork.letter} alt="" aria-hidden="true" draggable={false} />
      <img className="letter-flower-artwork" src={artwork.letter} alt="" aria-hidden="true" draggable={false} />
      <div className="letter-insight-source-cover" aria-hidden="true" />
      <img className="letter-signature-text-artwork" src={artwork.letterReference} alt={page.signature} draggable={false} />
      <img className="letter-signature-elephant-artwork" src={artwork.letterReference} alt="" aria-hidden="true" draggable={false} />
      <div className="exact-patch exact-paper-white letter-salutation-patch">{page.salutation}</div>
      <div className="exact-patch exact-paper-white letter-body-patch">
        {paragraphs.map((text, index) => <p key={`${index}-${text.slice(0, 8)}`}>{text}</p>)}
      </div>
    </ExactPage>
  );
}

export function buildMonthlyEchoExactPages(report: MonthlyEchoRenderPayload, scrollToPage: ScrollToPage): React.ReactElement[] {
  return [
    <Entrance key="entrance" report={report} onNext={() => scrollToPage(1)} />,
    <Overview key="overview" report={report} onNext={() => scrollToPage(2)} />,
    <MapPage key="map" report={report} onNext={() => scrollToPage(3)} />,
    <Moments key="moments" report={report} onNext={() => scrollToPage(4)} />,
    <Actions key="actions" report={report} onNext={() => scrollToPage(5)} />,
    <Recurring key="recurring" report={report} onNext={() => scrollToPage(6)} />,
    <Letter key="letter" report={report} />,
  ];
}

export function MonthlyEchoExactStyle() {
  return <style>{`
    .echo-frame.exact-echo-page{--exact-next-artboard-width:429px;--exact-next-artboard-height:762px;background:linear-gradient(180deg,#f7ecdc 0%,#f9f1e3 100%)!important}.echo-frame.exact-entrance{--exact-next-artboard-width:390px;--exact-next-artboard-height:684px;background:linear-gradient(180deg,#f2e9dc 0%,#eee4d8 100%)!important}.echo-frame.exact-map,.echo-frame.exact-actions,.echo-frame.exact-recurring{--exact-next-artboard-width:475px;--exact-next-artboard-height:844px}.echo-frame.exact-moments{--exact-next-artboard-width:390px;--exact-next-artboard-height:693px;background:#f3eadf!important;box-shadow:0 0 0 100px #f3eadf!important}.echo-frame.exact-actions{background:#f2e8dc!important;box-shadow:0 0 0 100px #f2e8dc!important}.echo-frame.exact-recurring{background:#f5eadd!important;box-shadow:0 0 0 100px #f5eadd!important}.echo-frame.exact-letter{background:#f7efe5!important;box-shadow:0 0 0 100px #f7efe5!important}.exact-artboard{position:absolute;left:0;top:75.5px;width:390px;height:693px;overflow:hidden}.exact-entrance .exact-artboard{left:0;top:50%;width:390px;height:auto;aspect-ratio:947/1661;transform:translateY(-50%)}.exact-moments .exact-artboard{left:0;top:calc(50% - 10px);width:390px;height:auto;aspect-ratio:941/1672;transform:translateY(-50%)}.exact-map .exact-artboard,.exact-actions .exact-artboard,.exact-recurring .exact-artboard,.exact-letter .exact-artboard{left:195px;top:0;width:475px;height:844px;transform:translateX(-50%)}.exact-letter .exact-artboard{left:205px}.exact-letter .exact-artboard:after{content:"";position:absolute;z-index:29;left:50%;bottom:0;width:50px;height:38px;transform:translateX(-50%);background:#f3e9dd;pointer-events:none}.exact-overview .exact-artboard{left:50%;top:41px;width:429px;height:762px;transform:translateX(-50%)}.exact-map .exact-artboard>img{clip-path:inset(16px)}.exact-artboard>img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;user-select:none;-webkit-user-drag:none}.exact-next{position:absolute;z-index:30;left:0;bottom:0;width:100%;height:70px;padding:0;border:0;background:transparent;cursor:pointer;touch-action:manipulation}.exact-next-repair{position:absolute;left:50%;bottom:0;width:44px;height:30px;transform:translateX(-50%);background-repeat:no-repeat;background-size:var(--exact-next-artboard-width) var(--exact-next-artboard-height);background-position:calc(50% + 32px) bottom;pointer-events:none}.exact-next-visual{position:absolute;left:50%;bottom:12px;width:40px;height:34px;transform:translateX(-50%);display:grid;place-items:center;pointer-events:none}.exact-next-arrow{position:absolute;width:20px;height:12px;overflow:visible;fill:none;stroke:#315936;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.exact-next-arrow-main{animation:exact-next-main 2.2s ease-in-out infinite}.exact-next-arrow-trail{animation:exact-next-trail 2.2s ease-in-out infinite}@keyframes exact-next-main{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(4px);opacity:.85}}@keyframes exact-next-trail{0%,100%{transform:translateY(-6px);opacity:0}50%{transform:translateY(2px);opacity:.22}}@media (prefers-reduced-motion:reduce){.exact-next-arrow-main{animation:none;transform:translateY(0);opacity:.7}.exact-next-arrow-trail{display:none;animation:none}}
    .echo-frame.exact-entrance{background:linear-gradient(90deg,#ece0d4 0%,#f1e7dd 20%,#f3eae0 55%,#f1e8dd 100%) top/100% 9.5% no-repeat,linear-gradient(180deg,#f2e9dc 0%,#eee4d8 100%)!important}
    .monthly-echo-slot:has(.exact-entrance),.monthly-v2-demo-slot:has(.exact-entrance){background:linear-gradient(180deg,#f2e9dc 0%,#ece0d4 9.5%,#f1e7dd 19.3%,#f4ebe1 29%,#f5ece3 38.8%,#f5ece2 48.5%,#f4ebe1 68.1%,#f3eadf 77.8%,#f3eae0 87.6%,#f3eadf 90.5%,#eee4d8 100%) left/50% 100% no-repeat,linear-gradient(180deg,#f2e9dc 0%,#f1e8dd 9.5%,#f5ece2 19.3%,#f6ede3 29%,#f1e8de 40.5%,#ede3da 48.5%,#ece2d9 58.3%,#ede4db 68.1%,#e8dcd0 77.8%,#eee4d9 81.5%,#f0e6db 87.6%,#f0e6dc 90.5%,#eee4d8 100%) right/50% 100% no-repeat}
    .exact-entrance:before{content:"";position:absolute;left:0;top:0;z-index:0;width:100%;height:80px;background-image:radial-gradient(circle at 8px 13px,rgba(93,73,50,.12) 0 .45px,transparent .8px),radial-gradient(circle at 21px 31px,rgba(255,255,255,.5) 0 .5px,transparent .9px);background-size:29px 37px,41px 47px;opacity:.22;pointer-events:none}.exact-entrance .exact-artboard{z-index:1}
    .exact-entrance .exact-artboard>img{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 12px);mask-image:linear-gradient(to bottom,transparent 0,#000 12px)}
    .monthly-echo-slot:has(.exact-entrance),.monthly-v2-demo-slot:has(.exact-entrance){position:relative}.monthly-echo-slot:has(.exact-entrance)>div,.monthly-v2-demo-slot:has(.exact-entrance)>div{position:relative;z-index:1}.monthly-echo-slot:has(.exact-entrance):after,.monthly-v2-demo-slot:has(.exact-entrance):after{content:"";position:absolute;top:0;right:0;bottom:0;z-index:0;width:max(0px,calc((100% - 46.2085308dvh)/2));background-image:radial-gradient(circle at 7px 17px,rgba(93,73,50,.11) 0 .45px,transparent .8px),radial-gradient(circle at 19px 29px,rgba(255,255,255,.48) 0 .5px,transparent .9px);background-size:31px 43px,47px 53px;opacity:.2;pointer-events:none}
    .exact-next-repair{z-index:29;width:48px;height:46px;background-position:calc(50% + 50px) calc(100% + 24px);-webkit-mask-image:radial-gradient(ellipse 70% 55% at 50% 35%,#000 48%,transparent 100%);mask-image:radial-gradient(ellipse 70% 55% at 50% 35%,#000 48%,transparent 100%)}
    .exact-moments .exact-artboard>img{clip-path:inset(0 0 4% 0)}
    .exact-moments .exact-next-repair{display:none}
    .exact-map .exact-next-repair{display:none}
    .exact-actions .exact-next-repair{display:none}
    .exact-overview .exact-next-repair{background-image:none!important;background-color:#faf0e2}
    .exact-recurring .exact-next-repair{display:none}
    .map-line-repair path{stroke:#67713f;stroke-width:1}
    .exact-patch{position:absolute;z-index:5;box-sizing:border-box;color:#1d3823;font-family:"Noto Serif SC","Songti SC","SimSun",serif}
    .cover-month-patch{left:10%;top:25.5%;width:30%;height:11%;display:flex;flex-direction:column;justify-content:center}.cover-month-patch strong{color:#a9782e;font-size:27px;font-weight:500}.cover-month-patch span{margin-top:4px;color:#8a7654;font:11px/16px "Noto Sans SC",sans-serif}.cover-month-patch i{display:block;width:70px;height:1px;background:#b58b4b;margin-top:8px}.cover-month-patch:before{content:"";position:absolute;inset:0;z-index:-1;background:#f7efe2;box-shadow:0 0 5px 3px #f7efe2;border-radius:6px}
    .overview-header{left:8%;top:6%;width:52%;height:14%}.overview-header strong{display:block;font-size:29px}.overview-header span{display:block;color:#a66c24;font-size:21px;margin-top:5px}.overview-header i{display:block;width:30px;height:1px;background:#918349;margin-top:10px}.overview-intro{left:8%;top:22%;width:60%;height:9%;font-size:16px;line-height:1.7}.overview-question{left:13%;top:30.5%;width:74%;height:auto;min-height:8%;max-height:10.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:5px 10px;font-size:17px;line-height:1.45;overflow:hidden}.overview-events{left:8%;top:41.5%;width:73%;height:auto;min-height:13%;max-height:15%;font-size:13px;line-height:1.7;overflow:hidden}.overview-events p{margin:0}.overview-event-dates{margin-bottom:4px!important}.overview-event-context{margin-top:2px!important}.overview-turn{left:8%;top:56%;width:62%;height:auto;min-height:9%;max-height:10%;font-size:15px;line-height:1.65}.overview-evolved{left:12%;top:67%;width:76%;height:auto;min-height:9%;max-height:11.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:5px 9px;font-size:16px;line-height:1.45;overflow:hidden;transform:translate(-6px,-7px)}.overview-conclusion{left:27%;top:79.5%;width:60%;height:auto;min-height:10.5%;max-height:12.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:7px 14px;font-size:12.5px;line-height:1.6;overflow:hidden}.overview-density-compact .overview-question{font-size:15.5px;line-height:1.4}.overview-density-compact .overview-events{font-size:11.5px;line-height:1.5}.overview-density-compact .overview-evolved{font-size:14.5px;line-height:1.4}.overview-density-compact .overview-conclusion{font-size:11.5px;line-height:1.5}.overview-density-dense .overview-question{font-size:14px;line-height:1.35}.overview-density-dense .overview-events{font-size:10px;line-height:1.42}.overview-density-dense .overview-turn{font-size:13.5px;line-height:1.5}.overview-density-dense .overview-evolved{font-size:13px;line-height:1.35}.overview-density-dense .overview-conclusion{font-size:10.5px;line-height:1.4;padding:5px 12px}
    .map-line-repair{position:absolute;inset:0;z-index:3;width:100%;height:100%;pointer-events:none}.map-line-repair path{fill:none;stroke:#5d6e3d;stroke-width:1.1;stroke-linecap:round}.map-main-patch{left:8%;top:16%;width:69%;height:13.5%;display:flex;align-items:center;justify-content:center;text-align:center;padding:7px 10px;font-size:13px;line-height:1.55;overflow:hidden}.map-main-patch span{width:100%}.map-node-patch{width:34%;height:auto;min-height:15%;max-height:20%;font-size:12px;line-height:1.5;overflow:hidden;overflow-wrap:anywhere}.map-node-patch strong{display:block;font-size:14px;line-height:1.45}.map-node-patch b{display:block;font-size:17px;margin-top:5px}.map-node-patch p{margin:6px 0 0}.map-node-patch-1{left:12%;top:33.5%}.map-node-patch-2{left:56%;top:46%;width:31%}.map-node-patch-3{left:18%;top:60%}.map-count-2 .map-node-patch-1{top:35%;width:36%}.map-count-2 .map-node-patch-2{left:55%;top:49%;width:34%}.map-summary-patch{left:22%;top:78%;width:64%;height:auto;min-height:12%;max-height:16%;display:grid;place-items:center;text-align:center;padding:8px 14px;font-size:13px;line-height:1.65;overflow:hidden}
    .moment-date-patch{left:8.5%;width:18%;height:auto;min-height:15.5%;max-height:18.5%;display:flex;flex-direction:column;justify-content:center;text-align:center;overflow:hidden}.moment-date-patch strong{font-size:30px;font-weight:500}.moment-date-patch span{font-size:17px;margin-top:4px}.moment-copy-patch{left:26%;width:48%;height:auto;min-height:15.5%;max-height:18.5%;display:flex;flex-direction:column;justify-content:center;padding:10px 12px;overflow:hidden;overflow-wrap:anywhere}.moment-copy-patch h3{margin:0;font:600 14px/1.45 "Noto Sans SC",sans-serif;color:#262a25}.moment-copy-patch p{margin:7px 0 0;font-size:12px;line-height:1.6;color:#4d4e48}.moment-date-patch-1,.moment-copy-patch-1{top:16.2%}.moment-date-patch-2,.moment-copy-patch-2{top:39.1%}.moment-date-patch-3,.moment-copy-patch-3{top:62%}.moments-summary-patch{left:15%;top:auto;bottom:7.5%;width:65%;height:auto;min-height:10.5%;max-height:14.5%;display:grid;place-items:center;text-align:center;padding:10px 18px 12px;font-size:13px;line-height:1.65;overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere;overscroll-behavior:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}.moments-summary-compact .moments-summary-patch{padding:8px 16px 10px;font-size:11.5px;line-height:1.55}.moments-summary-dense .moments-summary-patch{padding:7px 14px 9px;font-size:10.5px;line-height:1.45}.moments-summary-patch::-webkit-scrollbar{display:none}
    .action-copy-patch{left:29%;width:54%;height:auto;min-height:10%;max-height:13%;padding:4px 6px;overflow:visible}.action-copy-patch b{display:block;position:relative;top:-18px;margin-bottom:-18px;font-size:17px;font-weight:500}.action-copy-patch h3{margin:3px 0 0;font:600 14px/1.45 "Noto Sans SC",sans-serif}.action-copy-patch p{margin:3px 0 0;font-size:12px;line-height:1.55;color:#55564f}.action-copy-patch-1{top:17%}.action-copy-patch-2{top:30%}.action-copy-patch-3{top:43%}.action-copy-patch-4{top:54%}.action-copy-patch-5{top:63%}.actions-summary-patch{left:27%;top:76%;width:57%;height:17%;display:grid;place-items:center;text-align:center;padding:8px 13px;font-size:13px;line-height:1.65;overflow:hidden}.actions-summary-patch span{width:100%;transform:translateY(-16px)}
    .recurring-lower-cover,.recurring-lower-artwork,.recurring-conclusion-cover,.recurring-conclusion-artwork{display:none}.recurring-count-2 .recurring-lower-cover{display:block;position:absolute;left:0;top:68%;z-index:2;width:100%;height:14%;background:#f5eadd url("/monthly-echo/monthly-echo-theme-textless-v2.png") center -456px/475px 844px no-repeat}.recurring-count-2 .recurring-lower-artwork{display:block!important;z-index:3;clip-path:inset(68% 0 18% 0);transform:translateY(-9%);pointer-events:none}.recurring-count-2 .recurring-conclusion-cover{display:block;position:absolute;left:0;top:82%;z-index:2;width:100%;height:12%;background:#f5eadd url("/monthly-echo/monthly-echo-theme-textless-v2.png") center -456px/475px 844px no-repeat}.recurring-count-2 .recurring-conclusion-artwork{display:block!important;z-index:3;clip-path:inset(82% 0 6% 0);transform:translateY(-7%);pointer-events:none}.recurring-title-patch{left:11%;top:4%;width:58%;margin:0;font-size:18px;line-height:1.55;font-weight:500}.recurring-lead-patch{left:11%;top:13%;width:68%;height:auto;min-height:9%;max-height:12%;display:flex;flex-direction:column;justify-content:center;font-size:14px;line-height:1.65;overflow-y:auto;scrollbar-width:none}.recurring-lead-patch span{display:block}.recurring-question-patch{left:11%;top:25%;width:76%;height:auto;min-height:8%;max-height:10%;display:grid;place-items:center;text-align:center;padding:8px 12px;font-size:15px;line-height:1.55;overflow-y:auto;scrollbar-width:none}.recurring-events-patch{left:14%;top:35.5%;width:72%;height:auto;min-height:21%;max-height:24%;font-size:13px;line-height:1.55;overflow-y:auto;scrollbar-width:none}.recurring-events-patch p{position:relative;margin:0;display:grid;grid-template-columns:18px 54px 1fr;column-gap:7px;align-items:start;padding-bottom:12px}.recurring-events-patch p:last-child{padding-bottom:0}.recurring-events-patch p:not(:last-child):after{content:"";position:absolute;left:7px;top:15px;bottom:-1px;width:1px;background:rgba(76,104,51,.48)}.recurring-events-patch i{position:relative;z-index:1;width:10px;height:10px;margin-top:6px;border-radius:50%;background:#59783d;box-shadow:0 0 0 3px #f5eadd}.recurring-events-patch b{font-size:16px;line-height:1.45}.recurring-events-patch span{overflow-wrap:anywhere}.recurring-turn-patch{left:11%;top:60.5%;width:67%;height:auto;min-height:9%;max-height:10%;font-size:14px;line-height:1.65;overflow-y:auto;scrollbar-width:none}.recurring-turn-patch b{font-size:1.05em;font-weight:600}.recurring-evolved-patch{left:11%;top:71%;width:76%;height:auto;min-height:9%;max-height:11%;display:grid;place-items:center;text-align:center;padding:8px 12px;font-size:15px;line-height:1.55;overflow-y:auto;scrollbar-width:none}.recurring-conclusion-patch{left:25%;top:83%;width:52%;height:auto;min-height:9%;max-height:11.5%;display:grid;place-items:center;text-align:center;padding:8px 12px 10px;font-size:13px;line-height:1.6;overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere;overscroll-behavior:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}.recurring-lead-patch::-webkit-scrollbar,.recurring-question-patch::-webkit-scrollbar,.recurring-events-patch::-webkit-scrollbar,.recurring-turn-patch::-webkit-scrollbar,.recurring-evolved-patch::-webkit-scrollbar,.recurring-conclusion-patch::-webkit-scrollbar{display:none}.recurring-density-compact .recurring-lead-patch,.recurring-density-compact .recurring-turn-patch{font-size:12.5px;line-height:1.55}.recurring-density-compact .recurring-question-patch,.recurring-density-compact .recurring-evolved-patch{font-size:13.5px;line-height:1.48}.recurring-density-compact .recurring-events-patch{font-size:11.8px;line-height:1.48}.recurring-density-compact .recurring-events-patch b{font-size:14.5px}.recurring-density-compact .recurring-conclusion-patch{font-size:11.5px;line-height:1.55}.recurring-density-dense .recurring-lead-patch,.recurring-density-dense .recurring-turn-patch{font-size:11.5px;line-height:1.48}.recurring-density-dense .recurring-question-patch,.recurring-density-dense .recurring-evolved-patch{font-size:12.5px;line-height:1.42}.recurring-density-dense .recurring-events-patch{font-size:10.8px;line-height:1.42}.recurring-density-dense .recurring-events-patch b{font-size:13.5px}.recurring-density-dense .recurring-conclusion-patch{font-size:10.5px;line-height:1.45}.recurring-count-2 .recurring-events-patch{min-height:18%;max-height:18.5%}.recurring-count-2 .recurring-turn-patch{top:54.5%;min-height:7.5%;max-height:8%}.recurring-count-2 .recurring-evolved-patch{top:63%}.recurring-count-2 .recurring-conclusion-patch{top:79%;max-height:12.5%}
    .recurring-count-2 .recurring-events-patch{min-height:16.5%;max-height:17%}.recurring-count-2 .recurring-turn-patch{top:53%}
    .recurring-count-3 .recurring-question-patch{top:22.8%;height:9.8%;min-height:0;max-height:none;overflow:hidden}.recurring-count-3 .recurring-turn-patch{top:58%}.recurring-count-3 .recurring-evolved-patch{top:68.4%;height:11.4%;min-height:0;max-height:none;overflow:hidden}
    .exact-artboard>.letter-photo-artwork{z-index:3;clip-path:inset(7% 0 59% 52%);transform:translateX(-5.5%);pointer-events:none}.exact-artboard>.letter-flower-artwork{z-index:3;clip-path:inset(38% 0 21% 63%);transform:translateX(-5.5%);pointer-events:none}.letter-insight-source-cover{position:absolute;left:12%;top:78.5%;z-index:2;width:74%;height:13%;background:#f6efe6 url("/monthly-echo/monthly-echo-letter-textless-v2.png") -70px -772px/660px 1173px no-repeat;box-shadow:0 0 22px 16px #f6efe6;-webkit-mask-image:radial-gradient(ellipse 76% 88% at center,#000 62%,transparent 100%);mask-image:radial-gradient(ellipse 76% 88% at center,#000 62%,transparent 100%)}.exact-artboard>.letter-signature-text-artwork,.exact-artboard>.letter-signature-elephant-artwork{z-index:4;right:auto;width:450px;pointer-events:none}.exact-artboard>.letter-signature-text-artwork{clip-path:inset(90.4% 0 2.5% 55%)}.exact-artboard>.letter-signature-elephant-artwork{clip-path:inset(88.7% 0 2.5% 81.5%)}.letter-salutation-patch{left:17%;top:7.2%;width:45%;height:auto;min-height:5%;max-height:7%;display:flex;align-items:center;font-size:16.5px;line-height:1.5;overflow:hidden}.letter-body-patch{left:17%;top:14.5%;width:68%;height:auto;min-height:52%;max-height:72.5%;font-size:13.2px;line-height:1.75;overflow:hidden;overflow-wrap:anywhere}.letter-body-patch:before{content:"";float:right;width:43%;height:540px;margin-left:12px;shape-outside:polygon(0 0,100% 0,100% 100%,55% 100%,45% 65%,25% 45%,0 38%)}.letter-body-patch p{margin:0 0 18px}.letter-body-patch p:last-child{margin-bottom:0}.letter-density-compact .letter-body-patch{font-size:12.4px;line-height:1.56}.letter-density-compact .letter-body-patch p{margin-bottom:10px}.letter-density-dense .letter-salutation-patch{font-size:15.5px}.letter-density-dense .letter-body-patch{font-size:11.8px;line-height:1.5}.letter-density-dense .letter-body-patch p{margin-bottom:9px}.letter-density-extra-dense .letter-salutation-patch{font-size:15px}.letter-density-extra-dense .letter-body-patch{font-size:10.8px;line-height:1.42}.letter-density-extra-dense .letter-body-patch p{margin-bottom:6px}
    .action-empty-patch{left:29%;top:27%;width:54%;min-height:30%;display:grid;place-items:center;padding:14px;text-align:center;font-size:14px;line-height:1.75;color:#55564f}
  `}</style>;
}
