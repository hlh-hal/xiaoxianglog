import React from 'react';
import {
  Ban,
  CircleHelp,
  Dumbbell,
  Footprints,
  HandHeart,
  Leaf,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Palette,
  Pause,
  RotateCcw,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type {
  MonthlyEchoAction,
  MonthlyEchoIconHint,
  MonthlyEchoPageBase,
  MonthlyEchoRenderPayload,
} from '../../utils/monthlyEcho';

type ScrollToPage = (index: number) => void;

const iconMap: Record<MonthlyEchoIconHint, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  express: MessageCircle,
  pause: Pause,
  organize: ListChecks,
  refuse: Ban,
  try: Sparkles,
  persist: Footprints,
  adjust: ListChecks,
  restart: RotateCcw,
  askHelp: CircleHelp,
  record: NotebookPen,
  exercise: Dumbbell,
  create: Palette,
  accompany: HandHeart,
  clean: Leaf,
  repair: Wrench,
  boundary: Shield,
  other: Leaf,
};

function shortDate(date: string): string {
  const match = /\d{4}-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[1]}.${match[2]}` : date.slice(-5).replace('-', '.');
}

function clamp(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function PaperNoise() {
  return <span className="dynamic-paper-noise" aria-hidden="true" />;
}

function Rings() {
  return <span className="dynamic-rings" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

function Down({ onClick }: { onClick?: () => void }) {
  if (!onClick) return <span className="dynamic-down" aria-hidden="true">⌄</span>;
  return <button type="button" className="dynamic-down dynamic-down-button" onClick={onClick} aria-label="下一页">⌄</button>;
}

function Fallback({ page }: { page: MonthlyEchoPageBase }) {
  if (page.contentState === 'ready') return null;
  return <p className="dynamic-fallback">{page.fallbackMessage}</p>;
}

function Page({ index, name, className = '', children }: { index: number; name: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`echo-frame dynamic-echo-page ${className}`} data-page-index={index} data-name={name}>
      <PaperNoise />
      {children}
    </section>
  );
}

function EntrancePage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.entrance;
  return (
    <Page index={0} name="PAGE 1 / 入口页" className="dynamic-entrance">
      <Rings />
      <div className="dynamic-entrance-copy">
        <h1>月之回响</h1>
        <p className="dynamic-month-en">{page.monthEn}</p>
        <p className="dynamic-diary-count">本月共记录 {page.diaryCount} 篇</p>
        <span className="dynamic-rule" />
        <p className="dynamic-cover-poem">一份温柔的<br />自我回望笔记，<br />陪你在时光里<br />慢慢靠近自己。</p>
      </div>
      <div className="dynamic-book" aria-hidden="true">
        <span className="book-left" />
        <span className="book-right" />
        <span className="book-spine" />
        <span className="book-flower" />
      </div>
      <p className="dynamic-cover-wish">愿你每个月都可以<br />收到自我回响</p>
      <Down onClick={onNext} />
    </Page>
  );
}

function OverviewPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.overview;
  return (
    <Page index={1} name="PAGE 2 / 月度封面" className="dynamic-overview">
      <Rings />
      <header className="dynamic-page-header">
        <h2>{report.pages.entrance.month}的回响</h2>
        <p>{report.pages.entrance.monthEn}</p>
        <span />
      </header>
      <div className="overview-intro">这个月，<br />你反复遇见一个问题：</div>
      {page.initialQuestion && <div className="dynamic-brush dynamic-brush-gold">「{page.initialQuestion}」</div>}
      <div className="overview-occurrences">
        {page.occurrences.slice(0, 3).map(item => <p key={`${item.date}-${item.scene}`}><b>{shortDate(item.date)}</b>{item.scene}</p>)}
      </div>
      {page.evolvedQuestion && <><p className="overview-turn">但到月底，另一个问题开始出现：</p><div className="dynamic-brush dynamic-brush-green">「{page.evolvedQuestion}」</div></>}
      <div className="dynamic-note overview-note" style={clamp(3)}>{page.conclusion || page.mainArc}</div>
      <Fallback page={page} />
      <Down onClick={onNext} />
    </Page>
  );
}

function MapPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.map;
  return (
    <Page index={2} name="PAGE 3 / 本月地图" className="dynamic-map">
      <h2>如果把这个月看成一张地图</h2>
      <span className="map-rule" />
      <p className="map-label">本月主线</p>
      <div className="dynamic-brush dynamic-brush-green map-main" style={clamp(2)}>{page.mainArc}</div>
      <svg className="map-path" viewBox="0 0 320 390" aria-hidden="true"><path d="M45 20 C250 20 250 145 180 175 C75 218 35 257 65 330 C95 392 230 330 292 382" /></svg>
      {page.sideThemes.slice(0, 3).map((item, index) => (
        <article className={`map-node map-node-${index + 1}`} key={`${item.date}-${item.title}`}>
          <span className="map-dot" />
          <h3>{item.title}</h3>
          <b>{shortDate(item.date)}</b>
          <p style={clamp(3)}>{item.scene || item.meaning}</p>
        </article>
      ))}
      <div className="dynamic-note map-summary" style={clamp(4)}>{page.summary}</div>
      <Fallback page={page} />
      <Down onClick={onNext} />
    </Page>
  );
}

function MomentsPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.moments;
  return (
    <Page index={3} name="PAGE 4 / 三个关键时刻" className="dynamic-moments">
      <h2>这个月，<br />小象想帮你留下三个时刻：</h2>
      <div className="moment-stack">
        {page.items.slice(0, 3).map((item, index) => (
          <article className="dynamic-moment-card" key={`${item.date}-${item.title}`}>
            <div className="moment-index"><strong>{String(index + 1).padStart(2, '0')}</strong><span>{shortDate(item.date)}</span></div>
            <div className="moment-copy"><h3 style={clamp(2)}>{item.title || item.event}</h3><p style={clamp(3)}>{item.meaning || item.event}</p></div>
            <span className={`moment-photo moment-photo-${index + 1}`} aria-hidden="true" />
            <span className="moment-clip" aria-hidden="true" />
          </article>
        ))}
      </div>
      <div className="dynamic-note moment-summary" style={clamp(3)}>{page.summary}</div>
      <Fallback page={page} />
      <Down onClick={onNext} />
    </Page>
  );
}

function ActionIcon({ item }: { item: MonthlyEchoAction }) {
  const Icon = iconMap[item.iconHint] || Leaf;
  return <span className="action-icon"><Icon size={22} strokeWidth={1.8} /></span>;
}

function ActionsPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.actions;
  return (
    <Page index={4} name="PAGE 5 / 行动轨迹" className="dynamic-actions">
      <h2>这个月，<br />你不是只是在想。</h2>
      <div className="action-list">
        {page.items.slice(0, 6).map(item => (
          <article className="dynamic-action-row" key={`${item.date}-${item.action}`}>
            <ActionIcon item={item} />
            <div><b>{shortDate(item.date)}</b><h3 style={clamp(1)}>{item.action}</h3><p style={clamp(2)}>{item.scene || item.meaning}</p></div>
          </article>
        ))}
      </div>
      <span className="actions-flower" aria-hidden="true" />
      <div className="dynamic-note action-summary" style={clamp(4)}>{page.summary}</div>
      <Fallback page={page} />
      <Down onClick={onNext} />
    </Page>
  );
}

function RecurringPage({ report, onNext }: { report: MonthlyEchoRenderPayload; onNext: () => void }) {
  const page = report.pages.recurring;
  return (
    <Page index={5} name="PAGE 6 / 反复主题" className="dynamic-recurring">
      <Rings />
      <h2>这个月，<br />有一个问题反复出现：</h2>
      <p className="recurring-lead" style={clamp(3)}>{page.lead}</p>
      {page.question && <div className="dynamic-brush dynamic-brush-gold recurring-question">「{page.question}」</div>}
      <div className="recurring-list">
        {page.occurrences.slice(0, 3).map(item => <p key={`${item.date}-${item.scene}`}><i /><b>{shortDate(item.date)}</b><span style={clamp(2)}>{item.scene}</span></p>)}
      </div>
      {page.evolvedQuestion && <><p className="recurring-turn">但这个月的不同在于，你开始问另一个问题：</p><div className="dynamic-brush dynamic-brush-green recurring-evolved">「{page.evolvedQuestion}」</div></>}
      <div className="dynamic-note recurring-note" style={clamp(3)}>{page.conclusion}</div>
      <Fallback page={page} />
      <Down onClick={onNext} />
    </Page>
  );
}

function LetterPage({ report }: { report: MonthlyEchoRenderPayload }) {
  const page = report.pages.letter;
  return (
    <Page index={6} name="PAGE 7 / 回声信" className="dynamic-letter">
      <div className="letter-sheet">
        <span className="letter-tape letter-tape-left" /><span className="letter-tape letter-tape-right" />
        <span className="letter-photo" aria-hidden="true" />
        <span className="letter-flower" aria-hidden="true" />
        <h2>{page.salutation}</h2>
        <div className="letter-paragraphs" style={clamp(18)}>{page.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 8)}`}>{paragraph}</p>)}</div>
        {page.finalInsight && <div className="dynamic-brush dynamic-brush-green letter-insight" style={clamp(3)}>{page.finalInsight}</div>}
        <p className="letter-signature">{page.signature}</p>
      </div>
      <Fallback page={page} />
      <Down />
    </Page>
  );
}

export function buildMonthlyEchoDynamicPages(report: MonthlyEchoRenderPayload, scrollToPage: ScrollToPage): React.ReactElement[] {
  return [
    <EntrancePage key="entrance" report={report} onNext={() => scrollToPage(1)} />,
    <OverviewPage key="overview" report={report} onNext={() => scrollToPage(2)} />,
    <MapPage key="map" report={report} onNext={() => scrollToPage(3)} />,
    <MomentsPage key="moments" report={report} onNext={() => scrollToPage(4)} />,
    <ActionsPage key="actions" report={report} onNext={() => scrollToPage(5)} />,
    <RecurringPage key="recurring" report={report} onNext={() => scrollToPage(6)} />,
    <LetterPage key="letter" report={report} />,
  ];
}

export function MonthlyEchoDynamicStyle() {
  return <style>{`
    .dynamic-echo-page{font-family:"Noto Serif SC","Songti SC","SimSun",serif;background:#f7efe2;color:#183b24;padding:0;}
    .dynamic-paper-noise{position:absolute;inset:0;pointer-events:none;opacity:.38;background-image:radial-gradient(circle at 22px 38px,rgba(70,55,32,.08) 0 .55px,transparent .8px),radial-gradient(circle at 104px 173px,rgba(70,55,32,.06) 0 .6px,transparent .9px),radial-gradient(circle at 305px 94px,rgba(70,55,32,.05) 0 .7px,transparent 1px);background-size:180px 210px,230px 280px,200px 250px;mix-blend-mode:multiply;z-index:0}
    .dynamic-echo-page>*:not(.dynamic-paper-noise){position:absolute;z-index:1}.dynamic-echo-page h2,.dynamic-echo-page h3,.dynamic-echo-page p{margin:0}
    .dynamic-rings{right:-22px;top:36px;width:190px;height:190px}.dynamic-rings i{position:absolute;border:1px solid rgba(169,129,70,.13);border-radius:50%;inset:calc(var(--i,0)*14px)}.dynamic-rings i:nth-child(1){--i:0}.dynamic-rings i:nth-child(2){--i:1}.dynamic-rings i:nth-child(3){--i:2}.dynamic-rings i:nth-child(4){--i:3}.dynamic-rings i:nth-child(5){--i:4}
    .dynamic-down{left:0;bottom:12px;width:100%;text-align:center;color:#335d2a;font:30px/36px serif;z-index:30}.dynamic-down-button{border:0;background:transparent;cursor:pointer;height:58px;touch-action:manipulation}
    .dynamic-fallback{left:38px;right:38px;bottom:72px;padding:9px 14px;border-radius:8px;background:rgba(246,239,220,.92);color:#756b59;font:13px/20px "Noto Sans SC",sans-serif;text-align:center;box-shadow:0 4px 18px rgba(70,55,32,.08)}
    .dynamic-brush{display:flex;align-items:center;justify-content:center;text-align:center;padding:14px 18px;color:#754714;font-size:25px;line-height:1.35;background:rgba(230,195,132,.26);border-radius:45% 38% 44% 40%/38% 45% 36% 44%;filter:drop-shadow(0 1px 0 rgba(255,255,255,.6))}.dynamic-brush-green{background:rgba(172,186,121,.25);color:#204a28}.dynamic-brush-gold{background:rgba(232,193,124,.28)}
    .dynamic-note{background:rgba(255,253,247,.86);box-shadow:0 7px 20px rgba(79,58,28,.1);border:1px solid rgba(169,132,75,.08);padding:18px 22px;color:#292d27;font-size:16px;line-height:1.75}
    .dynamic-entrance-copy{left:42px;top:145px;z-index:3!important}.dynamic-entrance-copy h1{font-size:55px;line-height:1.1;font-weight:500;letter-spacing:8px}.dynamic-month-en{margin-top:22px!important;color:#ad7b31;font-size:28px}.dynamic-diary-count{margin-top:6px!important;color:#8a7654;font:12px/18px "Noto Sans SC",sans-serif}.dynamic-rule{display:block;width:68px;height:1px;background:#b98a44;margin-top:18px}.dynamic-cover-poem{margin-top:44px!important;font-size:21px;line-height:2.05;letter-spacing:4px}.dynamic-book{left:77px;right:-30px;top:445px;height:330px;transform:rotate(-4deg);z-index:1!important}.dynamic-book span{position:absolute}.book-left,.book-right{top:25px;width:54%;height:255px;background:linear-gradient(145deg,#fffdf5,#e9dfcf);box-shadow:0 14px 22px rgba(67,48,26,.2);border:1px solid rgba(110,80,40,.15)}.book-left{left:0;transform:skewY(6deg);border-radius:8px 30px 15px 4px}.book-right{right:0;transform:skewY(-6deg);border-radius:30px 8px 4px 15px}.book-spine{left:50%;top:22px;width:8px;height:290px;background:linear-gradient(90deg,#d4b471,#f1dfb8,#9b7233);transform:rotate(-1deg)}.book-flower{left:58%;top:65px;width:3px;height:250px;background:#b99055;transform:rotate(-11deg);box-shadow:10px 9px 0 -1px #cbb07a}.dynamic-cover-wish{bottom:48px;left:0;width:100%;text-align:center;font-size:16px;line-height:1.8;letter-spacing:3px}
    .dynamic-page-header{left:44px;top:66px}.dynamic-page-header h2{font-size:32px;font-weight:600}.dynamic-page-header p{color:#a56f24;font-size:22px;margin-top:8px!important}.dynamic-page-header span{display:block;width:38px;height:1px;background:#9b7a3d;margin-top:16px}.overview-intro{left:44px;top:190px;font-size:18px;line-height:1.8}.dynamic-overview>.dynamic-brush-gold{left:38px;right:38px;top:275px}.overview-occurrences{left:44px;right:44px;top:375px;font-size:14px;line-height:1.7}.overview-occurrences p{margin-bottom:5px}.overview-occurrences b{color:#315b34;margin-right:10px}.overview-turn{left:44px;top:485px;font-size:17px;line-height:1.8}.dynamic-overview>.dynamic-brush-green{left:38px;right:38px;top:552px}.overview-note{left:75px;right:38px;top:665px}.dynamic-overview .dynamic-fallback{bottom:70px}
    .dynamic-map h2{left:44px;top:56px;font-size:25px}.map-rule{left:44px;top:112px;width:34px;height:1px;background:#879452}.map-label{left:44px;top:142px;font-size:17px}.map-main{left:34px;right:34px;top:176px;font-size:16px!important;justify-content:flex-start!important;text-align:left!important}.map-path{left:44px;top:290px;width:310px;height:390px;overflow:visible}.map-path path{fill:none;stroke:#55733d;stroke-width:1.4}.map-node{width:132px}.map-node-1{left:54px;top:292px}.map-node-2{left:220px;top:410px}.map-node-3{left:86px;top:548px}.map-dot{position:absolute;left:-14px;top:2px;width:16px;height:16px;border:4px solid #f3ecd8;border-radius:50%;background:#55733d;box-shadow:0 0 0 1px #80934f}.map-node h3{font-size:17px}.map-node b{display:block;font-size:18px;margin-top:8px}.map-node p{font-size:13px;line-height:1.65;margin-top:8px!important;color:#30352f}.map-summary{left:70px;right:54px;top:690px;text-align:center;padding:12px 18px;font-size:14px}
    .dynamic-moments h2,.dynamic-actions h2,.dynamic-recurring h2{left:42px;top:54px;font-size:25px;line-height:1.55;font-weight:500}.moment-stack{left:36px;right:36px;top:145px;display:grid;gap:14px}.dynamic-moment-card{position:relative!important;height:165px;background:rgba(255,254,250,.9);box-shadow:0 8px 18px rgba(79,58,28,.11);border-radius:2px}.moment-index{position:absolute;left:20px;top:18px;width:60px;border-right:1px solid #d8cbb8;height:122px}.moment-index strong{display:block;font-size:31px;font-weight:500}.moment-index span{display:block;font-size:17px;margin-top:5px}.moment-copy{position:absolute;left:95px;right:104px;top:22px}.moment-copy h3{font:600 16px/1.55 "Noto Sans SC",sans-serif;color:#242b25}.moment-copy p{font-size:13px;line-height:1.7;margin-top:8px!important;color:#474943}.moment-photo{position:absolute;right:-10px;bottom:-10px;width:88px;height:104px;border:8px solid #f8f3e7;box-shadow:0 5px 12px rgba(60,45,28,.16);transform:rotate(8deg);background:linear-gradient(155deg,#ddd4c3,#aaa391 58%,#d8c9ae)}.moment-photo:after{content:"";position:absolute;left:42px;bottom:4px;width:2px;height:70px;background:#9f8356;transform:rotate(-16deg)}.moment-clip{position:absolute;right:14px;top:-13px;width:14px;height:42px;border:2px solid #9a7437;border-radius:10px;transform:rotate(22deg)}.moment-summary{left:66px;right:62px;top:684px;text-align:center;padding:12px 18px;font-size:14px}
    .action-list{left:72px;right:34px;top:150px}.action-list:before{content:"";position:absolute;left:0;top:20px;bottom:18px;width:1px;background:#708353}.dynamic-action-row{position:relative!important;min-height:82px;padding-left:55px}.action-icon{position:absolute;left:-25px;top:0;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#f7f0df;background:linear-gradient(145deg,#678b52,#3d6034);box-shadow:0 4px 9px rgba(53,79,42,.22)}.dynamic-action-row b{font-size:18px;font-weight:500}.dynamic-action-row h3{font:600 14px/1.45 "Noto Sans SC",sans-serif;margin-top:3px!important}.dynamic-action-row p{font-size:12px;line-height:1.55;color:#55574f;margin-top:2px!important}.actions-flower{left:24px;bottom:105px;width:82px;height:190px;border-left:2px solid #b29159;transform:rotate(-17deg)}.actions-flower:before,.actions-flower:after{content:"";position:absolute;width:35px;height:1px;background:#b29159;transform-origin:left}.actions-flower:before{top:40px;transform:rotate(-36deg)}.actions-flower:after{top:90px;transform:rotate(28deg)}.action-summary{left:110px;right:36px;bottom:62px;padding:14px 18px;font-size:14px}
    .dynamic-recurring>.dynamic-rings{right:-35px;top:12px}.dynamic-recurring h2{top:42px}.recurring-lead{left:42px;right:42px;top:137px;font-size:17px;line-height:1.75}.recurring-question{left:34px;right:34px;top:250px}.recurring-list{left:78px;right:42px;top:355px}.recurring-list:before{content:"";position:absolute;left:-22px;top:10px;bottom:10px;width:1px;background:#81916b}.recurring-list p{position:relative!important;display:grid;grid-template-columns:70px 1fr;min-height:70px;font-size:14px;line-height:1.55}.recurring-list i{position:absolute;left:-28px;top:4px;width:12px;height:12px;border-radius:50%;background:#4d703c}.recurring-list b{font-size:17px}.recurring-turn{left:42px;right:42px;top:565px;font-size:16px;line-height:1.7}.recurring-evolved{left:34px;right:34px;top:632px;font-size:20px}.recurring-note{left:93px;right:62px;top:737px;padding:10px 16px;font-size:13px;text-align:center}
    .letter-sheet{left:30px;right:30px;top:42px;bottom:58px;padding:48px 42px 32px;background:rgba(255,254,249,.9);border-radius:40% 5px 12px 5px/18px 8px 12px 8px;box-shadow:0 12px 24px rgba(78,58,29,.13)}.letter-sheet h2{font-size:19px;font-weight:500}.letter-paragraphs{top:105px;left:42px;right:42px;font-size:14px;line-height:1.7;color:#2d322d}.letter-paragraphs p{margin-bottom:12px!important}.letter-paragraphs p:nth-child(-n+2){max-width:180px}.letter-photo{position:absolute;right:24px;top:58px;width:115px;height:155px;border:10px solid #f5efe3;box-shadow:0 5px 13px rgba(66,48,27,.18);transform:rotate(-5deg);background:linear-gradient(#9f9687 0 58%,#777269 59% 66%,#aaa397 67% 74%,#6f6b64 75%)}.letter-photo:before{content:"";position:absolute;left:56px;top:31px;width:18px;height:28px;border-radius:50%;box-shadow:6px 0 0 0 #f4e7ca;transform:rotate(-12deg)}.letter-flower{right:47px;top:300px;width:2px;height:270px;background:#a9854f;transform:rotate(-7deg)}.letter-flower:before,.letter-flower:after{content:"";position:absolute;width:40px;height:1px;background:#a9854f;transform-origin:left}.letter-flower:before{top:55px;transform:rotate(-40deg)}.letter-flower:after{top:125px;transform:rotate(33deg)}.letter-insight{left:34px;right:34px;bottom:55px;font-size:17px!important}.letter-signature{right:25px;bottom:18px;color:#9c671c;font-size:17px}.letter-tape{width:62px;height:18px;background:rgba(211,183,119,.45);transform:rotate(-18deg)}.letter-tape-left{left:-14px;top:5px}.letter-tape-right{right:-12px;top:37px;transform:rotate(14deg)}
  `}</style>;
}
