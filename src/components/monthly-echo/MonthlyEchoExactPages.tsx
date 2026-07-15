import React from 'react';
import type { MonthlyEchoPageBase, MonthlyEchoRenderPayload } from '../../utils/monthlyEcho';

type ScrollToPage = (index: number) => void;

const artwork = {
  entrance: '/monthly-echo/monthly-echo-cover-reference.png',
  overview: '/monthly-echo/monthly-echo-story-textless-v2.png',
  map: '/monthly-echo/monthly-echo-map-textless-v2.png',
  moments: '/monthly-echo/monthly-echo-moments-textless-v2.png',
  actions: '/monthly-echo/monthly-echo-actions-textless-v2.png',
  recurring: '/monthly-echo/monthly-echo-theme-textless-v2.png',
  letter: '/monthly-echo/monthly-echo-letter-textless-v2.png',
  letterReference: '/monthly-echo/monthly-echo-letter-reference.png',
};

function shortDate(date: string): string {
  const match = /\d{4}-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[1]}.${match[2]}` : date.slice(-5).replace('-', '.');
}

function clamp(lines: number): React.CSSProperties {
  return { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
}

function overviewDensity(page: MonthlyEchoRenderPayload['pages']['overview']): 'normal' | 'compact' | 'dense' {
  const total = [
    page.initialQuestion,
    page.evolvedQuestion,
    page.conclusion || page.mainArc,
    ...page.occurrences.slice(0, 3).map(item => item.scene),
  ].reduce((sum, text) => sum + Array.from(String(text || '').replace(/\s+/g, '')).length, 0);
  if (total > 220) return 'dense';
  if (total > 145) return 'compact';
  return 'normal';
}

function letterDensity(page: MonthlyEchoRenderPayload['pages']['letter']): 'normal' | 'compact' | 'dense' {
  const total = [page.salutation, ...page.paragraphs, page.finalInsight]
    .reduce((sum, text) => sum + Array.from(String(text || '').replace(/\s+/g, '')).length, 0);
  if (total > 560) return 'dense';
  if (total > 420) return 'compact';
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
        {onNext && <button type="button" className="exact-next" onClick={onNext} aria-label="下一页" />}
      </div>
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
  const density = overviewDensity(page);
  return (
    <ExactPage index={1} name="PAGE 2 / 月度封面" src={artwork.overview} className={`exact-overview overview-density-${density}`} onNext={onNext}>
      <div className="exact-patch overview-header"><strong>{report.pages.entrance.month}的回响</strong><span>{report.pages.entrance.monthEn}</span><i /></div>
      <div className="exact-patch overview-intro">这个月，<br />你反复遇见一个问题：</div>
      <div className="exact-patch exact-wash-gold overview-question">{page.initialQuestion ? `「${page.initialQuestion}」` : fallback(page)}</div>
      <div className="exact-patch overview-events">
        {page.occurrences.slice(0, 3).map(item => <p key={`${item.date}-${item.scene}`}><b>{shortDate(item.date)}</b>{item.scene}</p>)}
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
        <path d="M 172 279 C 190 282, 212 296, 227 315" />
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
  return (
    <ExactPage index={3} name="PAGE 4 / 三个关键时刻" src={artwork.moments} className="exact-moments" onNext={onNext}>
      {page.items.slice(0, 3).map((item, index) => (
        <React.Fragment key={`${item.date}-${item.title}`}>
          <div className={`exact-patch exact-paper-white moment-date-patch moment-date-patch-${index + 1}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{shortDate(item.date)}</span></div>
          <div className={`exact-patch exact-paper-white moment-copy-patch moment-copy-patch-${index + 1}`}><h3 style={clamp(2)}>{item.title || item.event}</h3><p style={clamp(4)}>{item.meaning || item.event}</p></div>
        </React.Fragment>
      ))}
      <div className="exact-patch exact-paper-aged moments-summary-patch" style={clamp(3)}>{page.summary || fallback(page)}</div>
    </ExactPage>
  );
}

function Actions({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.actions;
  return (
    <ExactPage index={4} name="PAGE 5 / 行动轨迹" src={artwork.actions} className="exact-actions" onNext={onNext}>
      {page.items.slice(0, 5).map((item, index) => (
        <div className={`exact-patch action-copy-patch action-copy-patch-${index + 1}`} key={`${item.date}-${item.action}`}>
          <b>{shortDate(item.date)}</b><h3 style={clamp(2)}>{item.action}</h3><p style={clamp(3)}>{item.scene || item.meaning}</p>
        </div>
      ))}
      <div className="exact-patch exact-paper-white actions-summary-patch"><span style={clamp(5)}>{page.summary || fallback(page)}</span></div>
    </ExactPage>
  );
}

function Recurring({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.recurring;
  const occurrenceCount = Math.min(3, page.occurrences.length);
  return (
    <ExactPage index={5} name="PAGE 6 / 反复主题" src={artwork.recurring} className={`exact-recurring recurring-count-${occurrenceCount}`} onNext={onNext}>
      <div className="recurring-lower-cover" aria-hidden="true" />
      <img className="recurring-lower-artwork" src={artwork.recurring} alt="" aria-hidden="true" />
      <div className="recurring-conclusion-cover" aria-hidden="true" />
      <img className="recurring-conclusion-artwork" src={artwork.recurring} alt="" aria-hidden="true" />
      <h2 className="exact-patch recurring-title-patch">这个月，<br />有一个问题反复出现：</h2>
      <div className="exact-patch recurring-lead-patch" style={clamp(3)}>{page.lead || fallback(page)}</div>
      <div className="exact-patch exact-wash-gold recurring-question-patch" style={clamp(2)}>{page.question ? `「${page.question}」` : fallback(page)}</div>
      <div className="exact-patch recurring-events-patch">{page.occurrences.slice(0, 3).map(item => <p key={`${item.date}-${item.scene}`}><b>{shortDate(item.date)}</b>{item.scene}</p>)}</div>
      <div className="exact-patch recurring-turn-patch">但这个月的不同在于，<br />你开始问另一个问题：</div>
      <div className="exact-patch exact-wash-green recurring-evolved-patch" style={clamp(3)}>{page.evolvedQuestion ? `「${page.evolvedQuestion}」` : fallback(page)}</div>
      <div className="exact-patch exact-paper-white recurring-conclusion-patch" style={clamp(3)}>{page.conclusion || fallback(page)}</div>
    </ExactPage>
  );
}

function Letter({ report }: { report: MonthlyEchoRenderPayload }) {
  const page = report.pages.letter;
  const density = letterDensity(page);
  const splitIndex = page.paragraphs.length >= 5
    ? 3
    : Math.min(2, Math.max(1, Math.ceil(page.paragraphs.length / 2)));
  const topParagraphs = page.paragraphs.slice(0, splitIndex);
  const bottomParagraphs = page.paragraphs.slice(splitIndex);
  return (
    <ExactPage index={6} name="PAGE 7 / 回声信" src={artwork.letter} className={`exact-letter letter-density-${density}`}>
      <div className="letter-insight-source-cover" aria-hidden="true" />
      <div className="letter-insight-artwork" aria-hidden="true" />
      <img className="letter-signature-text-artwork" src={artwork.letterReference} alt={page.signature} draggable={false} />
      <img className="letter-signature-elephant-artwork" src={artwork.letterReference} alt="" aria-hidden="true" draggable={false} />
      <div className="exact-patch exact-paper-white letter-salutation-patch">{page.salutation}</div>
      <div className="exact-patch exact-paper-white letter-body-top-patch">{topParagraphs.map((text, index) => <p key={`${index}-${text.slice(0, 8)}`}>{text}</p>)}</div>
      <div className="exact-patch exact-paper-white letter-body-bottom-patch">{bottomParagraphs.map((text, index) => <p key={`${index}-${text.slice(0, 8)}`}>{text}</p>)}</div>
      <div className="exact-patch exact-wash-green letter-insight-patch"><span style={clamp(3)}>{page.finalInsight || fallback(page)}</span></div>
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
    .echo-frame.exact-echo-page{background:linear-gradient(180deg,#f7ecdc 0%,#f9f1e3 100%)!important}.echo-frame.exact-entrance{background:linear-gradient(180deg,#f2e9dc 0%,#eee4d8 100%)!important}.echo-frame.exact-map{background:linear-gradient(180deg,#f5ebe0 0%,#f7efe6 100%)!important}.echo-frame.exact-moments{background:#f3eadf!important;box-shadow:0 0 0 100px #f3eadf!important}.echo-frame.exact-actions{background:#f2e8dc!important;box-shadow:0 0 0 100px #f2e8dc!important}.echo-frame.exact-recurring{background:#f5eadd!important;box-shadow:0 0 0 100px #f5eadd!important}.echo-frame.exact-letter{background:#f7efe5!important;box-shadow:0 0 0 100px #f7efe5!important}.exact-artboard{position:absolute;left:0;top:75.5px;width:390px;height:693px;overflow:hidden}.exact-entrance .exact-artboard,.exact-map .exact-artboard,.exact-moments .exact-artboard,.exact-actions .exact-artboard,.exact-recurring .exact-artboard,.exact-letter .exact-artboard{left:195px;top:0;width:475px;height:844px;transform:translateX(-50%)}.exact-overview .exact-artboard{left:50%;top:41px;width:429px;height:762px;transform:translateX(-50%)}.exact-map .exact-artboard>img{clip-path:inset(16px)}.exact-artboard>img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;user-select:none;-webkit-user-drag:none}.exact-next{position:absolute;z-index:30;left:0;bottom:0;width:100%;height:70px;border:0;background:transparent;cursor:pointer;touch-action:manipulation}
    .exact-patch{position:absolute;z-index:5;box-sizing:border-box;color:#1d3823;font-family:"Noto Serif SC","Songti SC","SimSun",serif}
    .cover-month-patch{left:10%;top:25.5%;width:30%;height:11%;display:flex;flex-direction:column;justify-content:center}.cover-month-patch strong{color:#a9782e;font-size:27px;font-weight:500}.cover-month-patch span{margin-top:4px;color:#8a7654;font:11px/16px "Noto Sans SC",sans-serif}.cover-month-patch i{display:block;width:70px;height:1px;background:#b58b4b;margin-top:8px}.cover-month-patch:before{content:"";position:absolute;inset:-7px;z-index:-1;background:#f7efe2;box-shadow:0 0 12px 9px #f7efe2;border-radius:8px}
    .overview-header{left:8%;top:6%;width:52%;height:14%}.overview-header strong{display:block;font-size:29px}.overview-header span{display:block;color:#a66c24;font-size:21px;margin-top:5px}.overview-header i{display:block;width:30px;height:1px;background:#918349;margin-top:10px}.overview-intro{left:8%;top:22%;width:60%;height:9%;font-size:16px;line-height:1.7}.overview-question{left:13%;top:30.5%;width:74%;height:auto;min-height:8%;max-height:10.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:5px 10px;font-size:17px;line-height:1.45;overflow:hidden}.overview-events{left:8%;top:41.5%;width:73%;height:auto;min-height:13%;max-height:15%;font-size:13px;line-height:1.6;overflow:hidden}.overview-events p{margin:0 0 3px}.overview-events b{color:#315936;margin-right:9px}.overview-turn{left:8%;top:56%;width:62%;height:auto;min-height:9%;max-height:10%;font-size:15px;line-height:1.65}.overview-evolved{left:12%;top:67%;width:76%;height:auto;min-height:9%;max-height:11.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:5px 9px;font-size:16px;line-height:1.45;overflow:hidden;transform:translate(-6px,-7px)}.overview-conclusion{left:27%;top:79.5%;width:60%;height:auto;min-height:10.5%;max-height:12.5%;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;overflow-wrap:anywhere;padding:7px 14px;font-size:12.5px;line-height:1.6;overflow:hidden}.overview-density-compact .overview-question{font-size:15.5px;line-height:1.4}.overview-density-compact .overview-events{font-size:11.5px;line-height:1.5}.overview-density-compact .overview-evolved{font-size:14.5px;line-height:1.4}.overview-density-compact .overview-conclusion{font-size:11.5px;line-height:1.5}.overview-density-dense .overview-question{font-size:14px;line-height:1.35}.overview-density-dense .overview-events{font-size:10px;line-height:1.42}.overview-density-dense .overview-events b{margin-right:6px}.overview-density-dense .overview-turn{font-size:13.5px;line-height:1.5}.overview-density-dense .overview-evolved{font-size:13px;line-height:1.35}.overview-density-dense .overview-conclusion{font-size:10.5px;line-height:1.4;padding:5px 12px}
    .map-line-repair{position:absolute;inset:0;z-index:3;width:100%;height:100%;pointer-events:none}.map-line-repair path{fill:none;stroke:#5d6e3d;stroke-width:1;stroke-linecap:round}.map-main-patch{left:8%;top:16%;width:69%;height:13.5%;display:flex;align-items:center;justify-content:center;text-align:center;padding:7px 10px;font-size:13px;line-height:1.55;overflow:hidden}.map-main-patch span{width:100%}.map-node-patch{width:34%;height:auto;min-height:15%;max-height:20%;font-size:12px;line-height:1.5;overflow:hidden;overflow-wrap:anywhere}.map-node-patch strong{display:block;font-size:14px;line-height:1.45}.map-node-patch b{display:block;font-size:17px;margin-top:5px}.map-node-patch p{margin:6px 0 0}.map-node-patch-1{left:12%;top:31%}.map-node-patch-2{left:56%;top:46%;width:31%}.map-node-patch-3{left:18%;top:60%}.map-count-2 .map-node-patch-1{top:32%;width:36%}.map-count-2 .map-node-patch-2{left:55%;top:49%;width:34%}.map-summary-patch{left:22%;top:78%;width:64%;height:auto;min-height:12%;max-height:16%;display:grid;place-items:center;text-align:center;padding:8px 14px;font-size:13px;line-height:1.65;overflow:hidden}
    .moment-date-patch{left:10%;width:19%;height:auto;min-height:14%;max-height:17%;display:flex;flex-direction:column;justify-content:center;text-align:center;overflow:hidden}.moment-date-patch strong{font-size:30px;font-weight:500}.moment-date-patch span{font-size:17px;margin-top:4px}.moment-copy-patch{left:30%;width:44%;height:auto;min-height:14%;max-height:17%;display:flex;flex-direction:column;justify-content:center;padding:8px 7px;overflow:hidden}.moment-copy-patch h3{margin:0;font:600 14px/1.5 "Noto Sans SC",sans-serif;color:#262a25}.moment-copy-patch p{margin:7px 0 0;font-size:12px;line-height:1.65;color:#4d4e48}.moment-date-patch-1,.moment-copy-patch-1{top:18%}.moment-date-patch-2,.moment-copy-patch-2{top:38%}.moment-date-patch-3{top:59.5%}.moment-copy-patch-3{top:61.5%}.moments-summary-patch{left:17%;top:82%;width:59%;height:auto;min-height:10%;max-height:13%;display:grid;place-items:center;text-align:center;padding:7px 12px;font-size:13px;line-height:1.65;overflow:hidden}
    .action-copy-patch{left:29%;width:54%;height:auto;min-height:10%;max-height:13%;padding:4px 6px;overflow:visible}.action-copy-patch b{display:block;position:relative;top:-18px;margin-bottom:-18px;font-size:17px;font-weight:500}.action-copy-patch h3{margin:3px 0 0;font:600 14px/1.45 "Noto Sans SC",sans-serif}.action-copy-patch p{margin:3px 0 0;font-size:12px;line-height:1.55;color:#55564f}.action-copy-patch-1{top:17%}.action-copy-patch-2{top:30%}.action-copy-patch-3{top:43%}.action-copy-patch-4{top:54%}.action-copy-patch-5{top:63%}.actions-summary-patch{left:27%;top:76%;width:57%;height:17%;display:grid;place-items:center;text-align:center;padding:8px 13px;font-size:13px;line-height:1.65;overflow:hidden}.actions-summary-patch span{width:100%;transform:translateY(-16px)}
    .recurring-lower-cover,.recurring-lower-artwork,.recurring-conclusion-cover,.recurring-conclusion-artwork{display:none}.recurring-count-2 .recurring-lower-cover{display:block;position:absolute;left:0;top:68%;z-index:2;width:100%;height:14%;background:#f5eadd url("/monthly-echo/monthly-echo-theme-textless-v2.png") center -456px/475px 844px no-repeat}.recurring-count-2 .recurring-lower-artwork{display:block!important;z-index:3;clip-path:inset(68% 0 18% 0);transform:translateY(-9%);pointer-events:none}.recurring-count-2 .recurring-conclusion-cover{display:block;position:absolute;left:0;top:82%;z-index:2;width:100%;height:12%;background:#f5eadd url("/monthly-echo/monthly-echo-theme-textless-v2.png") center -456px/475px 844px no-repeat}.recurring-count-2 .recurring-conclusion-artwork{display:block!important;z-index:3;clip-path:inset(82% 0 6% 0);transform:translateY(-7%);pointer-events:none}.recurring-title-patch{left:11%;top:4%;width:58%;margin:0;font-size:18px;line-height:1.55;font-weight:500}.recurring-lead-patch{left:11%;top:13%;width:60%;height:12%;font-size:14px;line-height:1.65}.recurring-question-patch{left:11%;top:25%;width:76%;height:10%;display:grid;place-items:center;text-align:center;font-size:15px;line-height:1.55}.recurring-events-patch{left:17%;top:36%;width:66%;height:25%;font-size:13px;line-height:1.6}.recurring-events-patch p{margin:0 0 10px;display:grid;grid-template-columns:54px 1fr}.recurring-events-patch b{font-size:16px}.recurring-turn-patch{left:11%;top:60%;width:67%;height:10%;font-size:14px;line-height:1.65}.recurring-evolved-patch{left:11%;top:70%;width:76%;height:11%;display:grid;place-items:center;text-align:center;font-size:15px;line-height:1.55}.recurring-conclusion-patch{left:25%;top:83%;width:52%;height:9%;display:grid;place-items:center;text-align:center;padding:5px 12px;font-size:13px;line-height:1.6}.recurring-count-2 .recurring-turn-patch{top:51%}.recurring-count-2 .recurring-evolved-patch{top:61%}.recurring-count-2 .recurring-conclusion-patch{top:76%}
    .letter-insight-source-cover{position:absolute;left:14%;top:79.2%;z-index:2;width:70%;height:11.7%;background:#f8f2e9 url("/monthly-echo/monthly-echo-letter-textless-v2.png") -76px -430px/720px 844px no-repeat}.letter-insight-artwork{position:absolute;left:14%;top:69%;z-index:3;width:70%;height:11.2%;background:transparent url("/monthly-echo/monthly-echo-letter-textless-v2.png") -67px -680px/475px 844px no-repeat;pointer-events:none}.exact-artboard>.letter-signature-text-artwork{z-index:4;clip-path:inset(90.4% 15% 3.2% 58%);pointer-events:none}.exact-artboard>.letter-signature-elephant-artwork{z-index:4;clip-path:inset(88.7% 2.5% 3.2% 82%);pointer-events:none}.letter-salutation-patch{left:15%;top:7.2%;width:47%;height:auto;min-height:5%;max-height:7%;display:flex;align-items:center;font-size:16.5px;line-height:1.5;overflow:hidden}.letter-body-top-patch,.letter-body-bottom-patch{left:15%;height:auto;font-size:13.2px;line-height:1.78;overflow:hidden;overflow-wrap:anywhere}.letter-body-top-patch{top:14.5%;width:43%;min-height:24%;max-height:29%}.letter-body-bottom-patch{top:43%;width:50%;min-height:25%;max-height:25%}.letter-body-top-patch p,.letter-body-bottom-patch p{margin:0 0 18px}.letter-body-top-patch p:last-child,.letter-body-bottom-patch p:last-child{margin-bottom:0}.letter-insight-patch{left:14%;top:69%;width:70%;height:auto;min-height:9%;max-height:11.2%;display:grid;place-items:center;text-align:center;padding:7px 18px;font-size:14.5px;line-height:1.65;overflow:hidden}.letter-insight-patch span{width:100%}.letter-density-compact .letter-insight-artwork{top:73.5%}.letter-density-compact .letter-body-top-patch,.letter-density-compact .letter-body-bottom-patch{font-size:13px;line-height:1.7}.letter-density-compact .letter-body-top-patch{max-height:32%}.letter-density-compact .letter-body-bottom-patch{top:47%;max-height:29.5%}.letter-density-compact .letter-body-top-patch p,.letter-density-compact .letter-body-bottom-patch p{margin-bottom:14px}.letter-density-compact .letter-insight-patch{top:73.5%}.letter-density-dense .letter-insight-artwork{top:76%}.letter-density-dense .letter-salutation-patch{font-size:15.5px}.letter-density-dense .letter-body-top-patch,.letter-density-dense .letter-body-bottom-patch{font-size:12.4px;line-height:1.62}.letter-density-dense .letter-body-top-patch{max-height:33%}.letter-density-dense .letter-body-bottom-patch{top:48%;max-height:30%}.letter-density-dense .letter-body-top-patch p,.letter-density-dense .letter-body-bottom-patch p{margin-bottom:10px}.letter-density-dense .letter-insight-patch{top:76%;font-size:13.5px;line-height:1.55}
  `}</style>;
}
