const referenceWidth = 947;
const referenceHeight = 1661;

export default function MonthlyEchoDesignDemo() {
  return (
    <div className="monthly-echo-demo-shell">
      <main className="monthly-echo-demo-stage" aria-label="月之回响设计还原页">
        <img
          className="monthly-echo-demo-artwork"
          src="/monthly-echo/monthly-echo-cover-reference.png"
          alt="月之回响六月自我回望封面，画面包含纸张、圆环、书本与干花"
          draggable={false}
        />

        <section className="monthly-echo-demo-accessible-copy">
          <h1>月之回响</h1>
          <p>June</p>
          <p>一份温柔的自我回望笔记，陪你在时光里慢慢靠近自己。</p>
          <p>愿你每个月都可以收到自我回响。</p>
        </section>
      </main>

      <style>{`
        .monthly-echo-demo-shell {
          width: 100vw;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #f6efe2;
        }

        .monthly-echo-demo-stage {
          position: relative;
          width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight}));
          height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth}));
          aspect-ratio: ${referenceWidth} / ${referenceHeight};
          overflow: hidden;
          background: #f7efe2;
        }

        .monthly-echo-demo-artwork {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          user-select: none;
          -webkit-user-drag: none;
        }

        .monthly-echo-demo-accessible-copy {
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
