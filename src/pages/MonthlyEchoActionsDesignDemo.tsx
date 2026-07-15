const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoActionsDesignDemo() {
  return (
    <div className="monthly-actions-demo-shell">
      <main className="monthly-actions-demo-stage" aria-label="行动轨迹">
        <img
          className="monthly-actions-demo-artwork"
          src="/monthly-echo/monthly-echo-actions-reference.png"
          alt="这个月，你不是只是在想。"
          draggable={false}
        />

        <article className="monthly-actions-demo-accessible-copy">
          <h1>这个月，你不是只是在想。</h1>
          <section>
            <h2>06.03</h2>
            <p>你表达过一次不舒服。那一次很小，但你没有完全压下自己的感受。</p>
          </section>
          <section>
            <h2>06.10</h2>
            <p>你在很累的时候停下来过。你没有继续硬撑，而是允许自己慢一点。</p>
          </section>
          <section>
            <h2>06.18</h2>
            <p>你重新整理过一个计划。混乱没有立刻消失，但事情开始重新变得可处理。</p>
          </section>
          <section>
            <h2>06.22</h2>
            <p>你没有像以前那样马上责怪自己。</p>
          </section>
          <section>
            <h2>06.27</h2>
            <p>你重新开始靠近一件想做的事。</p>
          </section>
          <p>这些行动都很小。小到如果不回头看，你可能会忘记。但小象知道，它们不是没有重量。</p>
        </article>
      </main>

      <style>{`
        .monthly-actions-demo-shell {
          width: 100vw;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #f2eadc;
        }

        .monthly-actions-demo-stage {
          position: relative;
          width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight}));
          height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth}));
          aspect-ratio: ${referenceWidth} / ${referenceHeight};
          overflow: hidden;
          background: #f8f0e3;
        }

        .monthly-actions-demo-artwork {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          image-rendering: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .monthly-actions-demo-accessible-copy {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
}
