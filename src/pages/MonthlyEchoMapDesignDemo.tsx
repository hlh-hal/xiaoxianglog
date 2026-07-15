const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoMapDesignDemo() {
  return (
    <div className="monthly-map-demo-shell">
      <main className="monthly-map-demo-stage" aria-label="本月回响地图">
        <img
          className="monthly-map-demo-artwork"
          src="/monthly-echo/monthly-echo-map-reference.png"
          alt="本月回响地图，记录工作学习、关系和自我状态三条支线"
          draggable={false}
        />

        <article className="monthly-map-demo-accessible-copy">
          <h1>如果把这个月看成一张地图</h1>
          <h2>本月主线</h2>
          <p>你在学习用不那么消耗自己的方式，继续往前走。</p>
          <section>
            <h3>工作 / 学习 · 06.06</h3>
            <p>你在高要求里重新确认自己的节奏。</p>
          </section>
          <section>
            <h3>关系 · 06.16</h3>
            <p>你开始分辨期待与自我保护。</p>
          </section>
          <section>
            <h3>自我状态 · 06.24</h3>
            <p>你不是一直低落，而是在反复寻找一种更稳的感觉。</p>
          </section>
          <p>这些支线并不是分散的。它们都指向同一件事：你开始把注意力慢慢放回自己身上。</p>
        </article>
      </main>

      <style>{`
        .monthly-map-demo-shell {
          width: 100vw;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #f2eadc;
        }

        .monthly-map-demo-stage {
          position: relative;
          width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight}));
          height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth}));
          aspect-ratio: ${referenceWidth} / ${referenceHeight};
          overflow: hidden;
          background: #f8f0e3;
        }

        .monthly-map-demo-artwork {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          image-rendering: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .monthly-map-demo-accessible-copy {
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
