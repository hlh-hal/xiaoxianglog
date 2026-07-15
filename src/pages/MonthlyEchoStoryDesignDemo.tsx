const referenceWidth = 941;
const referenceHeight = 1672;

export default function MonthlyEchoStoryDesignDemo() {
  return (
    <div className="monthly-story-demo-shell">
      <main className="monthly-story-demo-stage" aria-label="六月的回响">
        <img
          className="monthly-story-demo-artwork"
          src="/monthly-echo/monthly-echo-story-reference.png"
          alt="六月的回响，记录从担心自己够不够好，到重新思考真正想守住什么"
          draggable={false}
        />

        <article className="monthly-story-demo-accessible-copy">
          <h1>六月的回响</h1>
          <p>June</p>
          <p>这个月，你反复遇见一个问题：我够不够好。</p>
          <p>它出现在 06.04、06.13、06.21。每一次都和“想做好”或“怕让人失望”有关。</p>
          <p>但到月底，另一个问题开始出现：我真正想守住什么。</p>
          <p>这不是突然变好了，而是你开始把注意力慢慢放回自己身上。</p>
        </article>
      </main>

      <style>{`
        .monthly-story-demo-shell {
          width: 100vw;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #f2eadc;
        }

        .monthly-story-demo-stage {
          position: relative;
          width: min(100vw, calc(100dvh * ${referenceWidth} / ${referenceHeight}));
          height: min(100dvh, calc(100vw * ${referenceHeight} / ${referenceWidth}));
          aspect-ratio: ${referenceWidth} / ${referenceHeight};
          overflow: hidden;
          background: #f8f0e3;
        }

        .monthly-story-demo-artwork {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: fill;
          image-rendering: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .monthly-story-demo-accessible-copy {
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
