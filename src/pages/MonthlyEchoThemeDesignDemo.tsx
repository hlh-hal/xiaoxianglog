const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoThemeDesignDemo() {
  return (
    <div className="monthly-theme-demo-shell">
      <main className="monthly-theme-demo-stage" aria-label="反复主题">
        <img
          className="monthly-theme-demo-artwork"
          src="/monthly-echo/monthly-echo-theme-reference.png"
          alt="这个月，有一个问题反复出现"
          draggable={false}
        />
        <article className="monthly-theme-demo-accessible-copy">
          <h1>这个月，有一个问题反复出现。</h1>
          <p>当你很在意一段关系，或很想做好一件事时，你会很快开始问：我是不是做得还不够？</p>
          <p>到六月二十六日，你开始问：这真的是我想要的吗，还是我又在回应别人的期待？</p>
          <p>问题没有立刻消失，但你已经开始不再完全被它带着走。</p>
        </article>
      </main>
      <style>{`
        .monthly-theme-demo-shell { width: 100vw; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; overflow: hidden; background: #f2eadc; }
        .monthly-theme-demo-stage { position: relative; width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight})); height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth})); aspect-ratio: ${referenceWidth} / ${referenceHeight}; overflow: hidden; background: #f8f0e3; }
        .monthly-theme-demo-artwork { display: block; width: 100%; height: 100%; object-fit: fill; image-rendering: auto; user-select: none; -webkit-user-drag: none; }
        .monthly-theme-demo-accessible-copy { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      `}</style>
    </div>
  );
}
