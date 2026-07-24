import { useEffect, useState } from 'react';
import { buildMonthlyEchoExactPages, MonthlyEchoExactStyle } from '../components/monthly-echo/MonthlyEchoExactPages';
import { monthlyEchoMockReport } from '../utils/monthlyEchoMock';

function getScale() {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.innerWidth / 390, window.innerHeight / 844);
}

export default function MonthlyEchoV2DesignDemo() {
  const [scale, setScale] = useState(getScale);
  const requestedEmotionCount = Number(new URLSearchParams(window.location.search).get('emotionCount'));
  const emotionCount = Number.isFinite(requestedEmotionCount)
    ? Math.max(0, Math.min(5, Math.floor(requestedEmotionCount)))
    : monthlyEchoMockReport.pages.overview.emotions.length;
  const report = {
    ...monthlyEchoMockReport,
    pages: {
      ...monthlyEchoMockReport.pages,
      overview: {
        ...monthlyEchoMockReport.pages.overview,
        emotions: monthlyEchoMockReport.pages.overview.emotions.slice(0, emotionCount),
        fallback: emotionCount === 0,
        contentState: emotionCount === 0 ? 'fallback' as const : emotionCount >= 3 ? 'ready' as const : 'partial' as const,
      },
    },
  };
  const pages = buildMonthlyEchoExactPages(report, index => {
    document.querySelectorAll<HTMLElement>('.monthly-v2-demo-slot')[index]?.scrollIntoView({ behavior: 'smooth' });
  });

  useEffect(() => {
    const update = () => setScale(getScale());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const requestedPage = Number(new URLSearchParams(window.location.search).get('page'));
    if (requestedPage >= 1 && requestedPage <= pages.length) {
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('.monthly-v2-demo-slot')[requestedPage - 1]?.scrollIntoView();
      });
    }
  }, [pages.length]);

  return (
    <div className="monthly-v2-demo-scroll">
      <MonthlyEchoExactStyle />
      {pages.map((page, index) => (
        <div className="monthly-v2-demo-slot" key={index}>
          <div style={{ width: 390 * scale, height: 844 * scale }}>
            <div className="monthly-v2-demo-scale" style={{ transform: `scale(${scale})` }}>{page}</div>
          </div>
        </div>
      ))}
      <style>{`
        html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}
        .monthly-v2-demo-scroll{height:100dvh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;background:#f6efe2;scrollbar-width:none}
        .monthly-v2-demo-scroll::-webkit-scrollbar{display:none}
        .monthly-v2-demo-slot{height:100dvh;display:grid;place-items:center;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden}
        .monthly-v2-demo-scale{width:390px;height:844px;transform-origin:top left}
        .monthly-v2-demo-scale .echo-frame{box-sizing:border-box;position:relative;width:390px;height:844px;overflow:hidden;background:#f6efe2;color:#1b3c21}
      `}</style>
    </div>
  );
}
