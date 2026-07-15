const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoLetterDesignDemo() {
  return (
    <div className="monthly-letter-demo-shell">
      <main className="monthly-letter-demo-stage" aria-label="回声信">
        <img
          className="monthly-letter-demo-artwork"
          src="/monthly-echo/monthly-echo-letter-reference.png"
          alt="亲爱的自己，这个月你已经开始看见自己真正想守住的东西"
          draggable={false}
        />
        <article className="monthly-letter-demo-accessible-copy">
          <h1>亲爱的自己：</h1>
          <p>回头看这个月，你走到也自己以为的那研究。</p>
          <p>你没有怪你自己很累的那一天，也在关系与想做的事里慢慢靠近自己。</p>
          <p>这个月并没有把所有问题都解决，但你已经不只在被这些问题推着走。你开始能停下来，看见它们，也看见自己真正想守住的东西。</p>
          <p>你不是在原地反复，而是在相似的日子里，一点点练习新的回应方式。爱你的小象。</p>
        </article>
      </main>
      <style>{`
        .monthly-letter-demo-shell { width: 100vw; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; overflow: hidden; background: #f2eadc; }
        .monthly-letter-demo-stage { position: relative; width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight})); height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth})); aspect-ratio: ${referenceWidth} / ${referenceHeight}; overflow: hidden; background: #f8f0e3; }
        .monthly-letter-demo-artwork { display: block; width: 100%; height: 100%; object-fit: fill; image-rendering: auto; user-select: none; -webkit-user-drag: none; }
        .monthly-letter-demo-accessible-copy { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      `}</style>
    </div>
  );
}
