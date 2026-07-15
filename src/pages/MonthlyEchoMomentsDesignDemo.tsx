const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoMomentsDesignDemo() {
  return (
    <div className="monthly-moments-demo-shell">
      <main className="monthly-moments-demo-stage" aria-label="三个关键时刻">
        <img
          className="monthly-moments-demo-artwork"
          src="/monthly-echo/monthly-echo-moments-reference.png"
          alt="这个月，小象想帮你留下三个时刻"
          draggable={false}
        />

        <article className="monthly-moments-demo-accessible-copy">
          <h1>这个月，小象想帮你留下三个时刻：</h1>
          <section>
            <h2>01 · 06.08</h2>
            <p>你很累的那一天，没有立刻否定自己。你没有把疲惫解释成“我不行”，而是开始意识到，也许只是这段时间真的撑得太满。</p>
          </section>
          <section>
            <h2>02 · 06.16</h2>
            <p>你写到那段关系时，语气里有期待，也有克制。这不是矛盾，是你在靠近和保护自己之间，慢慢寻找一个位置。</p>
          </section>
          <section>
            <h2>03 · 06.24</h2>
            <p>你重新开始靠近那件想做的事。它看起来不大，但它说明你没有放弃那个想靠近的方向。</p>
          </section>
          <p>它们看起来都不算惊天动地。但它们说明：你并没有停在原地。</p>
        </article>
      </main>

      <style>{`
        .monthly-moments-demo-shell {
          width: 100vw;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #f2eadc;
        }

        .monthly-moments-demo-stage {
          position: relative;
          width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight}));
          height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth}));
          aspect-ratio: ${referenceWidth} / ${referenceHeight};
          overflow: hidden;
          background: #f8f0e3;
        }

        .monthly-moments-demo-artwork {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          image-rendering: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .monthly-moments-demo-accessible-copy {
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
