import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { DiaryEntry } from '../src/services/diaryService';
import { parseMarkdownFile } from '../src/utils/importExport';
import {
  buildMonotonePath,
  buildMoodDaySummary,
  buildMoodCurveSegments,
  buildMoodTrendDays,
  clampMoodScore,
  getDiaryTemplateMoodScores,
  mapExplicitMoodToScore,
  scoreDiaryMood,
  scoreToMoodLabel,
} from '../src/utils/moodTrend';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(
  diaryDate: string,
  content: string,
  mood?: string,
  blocks?: DiaryEntry['blocks'],
  id = `${diaryDate}-${content}`,
): DiaryEntry {
  return {
    id,
    content,
    images: [],
    createdAt: `${diaryDate}T09:00:00+08:00`,
    updatedAt: `${diaryDate}T09:00:00+08:00`,
    diaryDate,
    status: 'active',
    mood,
    blocks,
  };
}

await test('maps explicit English and Chinese moods and clamps abnormal scores', () => {
  assert.equal(mapExplicitMoodToScore('joyful'), 2);
  assert.equal(mapExplicitMoodToScore(' HAPPY '), 1.5);
  assert.equal(mapExplicitMoodToScore('焦虑'), -1.2);
  assert.equal(mapExplicitMoodToScore('悲伤'), -2);
  assert.equal(mapExplicitMoodToScore('unknown'), null);
  assert.equal(clampMoodScore(9), 2);
  assert.equal(clampMoodScore(-9), -2);
});

await test('uses explicit mood before text and only scores filled diary template sections', () => {
  assert.equal(scoreDiaryMood(entry('2026-07-20', '今天其实很难过', 'happy')), 1.5);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '## 开心的事：\n\n## 充实的事：\n\n项目复盘')), 0.8);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '## 开心的事：\n\n## 充实的事：\n\n## 感谢的人：')), null);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '', undefined, [
    { title: '开心的事', content: '今天很疲惫，也有一点焦虑' },
  ])), -1.1);
  assert.deepEqual(getDiaryTemplateMoodScores(entry('2026-07-20', '## 开心的事：\n\n无\n\n## 充实的事：\n\n完成产品复盘')), [0.8]);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '- **充实的事**：继续迭代月度回声')), 0.8);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '## 开心的事：\n\n暂无。')), null);
  assert.deepEqual(getDiaryTemplateMoodScores(entry('2026-07-20', '充实的事情很多，但这不是模板标题')), []);
});

await test('recognizes conservative positive self-reports and ignores negated mood words', () => {
  assert.equal(scoreDiaryMood(entry('2026-07-20', '和朋友聊天后，真是心情都美丽了，也带来了许多欢乐')), 1.5);
  assert.equal(scoreDiaryMood(entry('2026-07-20', '今天不焦虑了，下午和朋友一起散步')), null);
});

await test('applies fixed label thresholds', () => {
  assert.equal(scoreToMoodLabel(1.2), '愉悦');
  assert.equal(scoreToMoodLabel(0.5), '轻松');
  assert.equal(scoreToMoodLabel(-0.49), '平静');
  assert.equal(scoreToMoodLabel(-1), '疲惫');
  assert.equal(scoreToMoodLabel(-1.2), '低落');
});

await test('builds sorted seven-day data with equal per-entry averaging and true gaps', () => {
  const days = buildMoodTrendDays([
    entry('2026-07-18', '项目让我焦虑', 'anxious'),
    entry('2026-07-15', '项目完成', 'joyful'),
    entry('2026-07-17', '今天很疲惫，做了复盘'),
    entry('2026-07-15', '散步后很轻松', 'relaxed'),
    entry('2026-07-20', '## 开心的事：\n\n## 充实的事：\n\n## 今日思考：\n\n只是整理项目，没有描述心情'),
  ], { now: new Date(2026, 6, 20) });

  assert.deepEqual(days.map(({ date }) => date), [
    '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20',
  ]);
  assert.equal(days[1].score, 1.5);
  assert.equal(days[1].recordCount, 2);
  assert.equal(days[3].score, -1);
  assert.equal(days[4].score, -1.2);
  assert.equal(days[5].score, null);
  assert.equal(days[6].score, null);
  assert.equal(days[6].recordCount, 1);
  assert.ok(days[3].keywords.includes('复盘'));
  assert.deepEqual(days[1].entryIds, [
    '2026-07-15-项目完成',
    '2026-07-15-散步后很轻松',
  ]);
});

await test('keeps meaningful days from the real July 23 backup and leaves empty templates as gaps', () => {
  const backup = `**2026-07-23**

## 开心的事：

- 今天和谢启玥一起看电影和吃饭，聊得非常投机，真是心情都美丽了

## 充实的事：

- 接下来开始写简历，投公司，面试

## 感谢的人：

谢启玥给我带来了许多欢乐

**2026-07-20**

## 开心的事：
## 充实的事：
## 感谢的人：
## 改进的事：
## 今日思考：

**2026-07-19**

## 开心的事：
无
## 充实的事：
- 继续迭代月度回声
- 学了一些大模型的知识
## 感谢的人：
## 改进的事：
## 今日思考：

**2026-07-18**

## 开心的事：
- 今天打王者赢了好多把，哈哈开心

**2026-07-17**

## 开心的事：
## 充实的事：
## 感谢的人：
## 改进的事：
## 今日思考：`;
  const parsed = parseMarkdownFile(backup, '小象日志备份-2026-07-23.md');
  const importedEntries = parsed.map((item, index) => entry(item.date, item.content, undefined, undefined, `backup-${index}`));
  const days = buildMoodTrendDays(importedEntries, { now: new Date(2026, 6, 23) });
  const byDate = new Map(days.map((day) => [day.date, day]));

  assert.equal(byDate.get('2026-07-23')?.score, 1.5);
  assert.equal(byDate.get('2026-07-23')?.label, '愉悦');
  assert.equal(byDate.get('2026-07-19')?.score, 0.8);
  assert.equal(byDate.get('2026-07-19')?.label, '轻松');
  assert.equal(byDate.get('2026-07-18')?.score, 1.5);
  assert.equal(byDate.get('2026-07-20')?.score, null);
  assert.equal(byDate.get('2026-07-17')?.score, null);
});

await test('builds a short factual recap and cleans templates, HTML, and Markdown', () => {
  const summary = buildMoodDaySummary([{
    title: '今天的日记',
    content: '<h2>开心的事：</h2> **产品讨论进展顺利**，回家后和家人一起吃饭。',
    blocks: [],
  }], ['产品', '回家', '家人'], '愉悦');

  assert.equal(summary, '产品讨论进展顺利，回家后和家人一起吃饭。');
  assert.doesNotMatch(summary || '', /<|>|\*|开心的事|愉悦/);
  assert.ok((summary || '').length <= 40);
});

await test('preserves negation, never invents causality, and hides unreliable short text', () => {
  const summary = buildMoodDaySummary([{
    title: '',
    content: '今天不焦虑了，下午和朋友一起散步，晚上回家整理了房间。',
    blocks: [],
  }], ['朋友', '散步', '回家'], '平静');

  assert.match(summary || '', /不焦虑|朋友|散步|回家/);
  assert.doesNotMatch(summary || '', /因为|导致|所以/);
  assert.equal(buildMoodDaySummary([{ title: '', content: '晚安', blocks: [] }]), undefined);
});

await test('uses a neutral keyword fallback only when enough meaningful topics exist', () => {
  assert.equal(
    buildMoodDaySummary([{ title: '', content: '随便写写', blocks: [] }], ['产品', '同事', '回家']),
    '这一天记录了关于产品、同事和回家的内容。',
  );
  assert.equal(buildMoodDaySummary([], ['产品']), undefined);
});

await test('monotone controls remain inside each pair of real points', () => {
  const points = [
    { x: 0, y: 120 },
    { x: 100, y: 20 },
    { x: 200, y: 90 },
    { x: 300, y: 180 },
    { x: 400, y: 60 },
  ];
  const path = buildMonotonePath(points);
  const curves = [...path.matchAll(/C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/g)];
  assert.equal(curves.length, points.length - 1);
  curves.forEach((curve, index) => {
    const min = Math.min(points[index].y, points[index + 1].y);
    const max = Math.max(points[index].y, points[index + 1].y);
    assert.ok(Number(curve[2]) >= min && Number(curve[2]) <= max);
    assert.ok(Number(curve[4]) >= min && Number(curve[4]) <= max);
    assert.equal(Number(curve[5]), points[index + 1].x);
    assert.equal(Number(curve[6]), points[index + 1].y);
  });
});

await test('splits gaps, preserves repeated values, and handles a single point', () => {
  const segments = buildMoodCurveSegments([
    { index: 0, x: 0, y: 100 },
    { index: 1, x: 100, y: 100 },
    { index: 2, x: 200, y: null },
    { index: 3, x: 300, y: 220 },
  ], 240);

  assert.deepEqual(segments.map(({ key }) => key), ['0-1', '3-3']);
  assert.match(segments[0].path, /^M 0 100 C/);
  assert.equal(segments[1].path, 'M 300 220');
  assert.equal(segments[1].areaPath, '');
});

await test('supports default selection, keyboard selection, click, drag, and accessible gap labels', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/profile',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: window.Element });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: window.HTMLElement });
  Object.defineProperty(globalThis, 'SVGElement', { configurable: true, value: window.SVGElement });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: window.Node });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: window.getComputedStyle });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: clearTimeout });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });

  class TestPointerEvent extends window.MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number }) {
      super(type, init);
      this.pointerId = init.pointerId || 1;
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', { configurable: true, value: TestPointerEvent });
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dayBeforeYesterday = new Date(now);
  dayBeforeYesterday.setDate(now.getDate() - 2);
  const toKey = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const currentKey = toKey(now);
  const yesterdayKey = toKey(yesterday);
  const dayBeforeYesterdayKey = toKey(dayBeforeYesterday);
  const { MoodTrendChart } = await import('../src/components/MoodTrendChart');
  const container = window.document.getElementById('root')!;
  const root = createRoot(container);

  let openedDate = '';
  let openedEntryIds: string[] = [];
  await act(async () => {
    root.render(<MoodTrendChart
      detailAutoHideMs={500}
      onOpenEntries={(day) => {
        openedDate = day.date;
        openedEntryIds = day.entryIds;
      }}
      entries={[
      entry(dayBeforeYesterdayKey, '今天很平静'),
      entry(yesterdayKey, '今天很疲惫'),
      entry(currentKey, '今天很开心'),
      ]}
    />);
  });

  const markerDates = [...container.querySelectorAll<HTMLElement>('[data-mood-marker]')]
    .map((node) => node.dataset.moodMarker)
    .sort();
  assert.deepEqual(markerDates, [currentKey, yesterdayKey, dayBeforeYesterdayKey].sort());
  const unselectedMarkers = [...container.querySelectorAll<HTMLElement>('[data-mood-marker]:not([data-selected])')];
  assert.equal(unselectedMarkers.length, 2);
  assert.equal(unselectedMarkers[0].className, unselectedMarkers[1].className);

  const todayButton = container.querySelector<HTMLButtonElement>(`button[data-mood-date="${currentKey}"]`)!;
  assert.equal(todayButton.getAttribute('aria-pressed'), 'true');
  assert.match(todayButton.getAttribute('aria-label') || '', /周.+，愉悦/);
  assert.doesNotMatch(todayButton.getAttribute('aria-label') || '', /情绪指数|日志/);

  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button[data-mood-date]')];
  const firstButton = buttons[0];
  assert.match(firstButton.getAttribute('aria-label') || '', /暂无心情数据/);
  await act(async () => {
    firstButton.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  assert.equal(firstButton.getAttribute('aria-pressed'), 'true');
  assert.match(container.textContent || '', /当天没有可展示的心情记录/);

  await act(async () => {
    todayButton.click();
  });
  assert.equal(todayButton.getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(container.textContent || '', /情绪指数|共分析/);
  const openButton = container.querySelector<HTMLButtonElement>(`button[aria-label^="查看"][aria-label$="的日志"]`)!;
  assert.ok(openButton);
  await act(async () => {
    openButton.click();
  });
  assert.equal(openedDate, currentKey);
  assert.deepEqual(openedEntryIds, [`${currentKey}-今天很开心`]);

  const plot = container.querySelector<HTMLDivElement>('[data-testid="mood-trend-plot"]')!;
  Object.defineProperty(plot, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 700, height: 240, right: 700, bottom: 240, x: 0, y: 0, toJSON() {} }),
  });
  Object.defineProperty(plot, 'setPointerCapture', { configurable: true, value: () => {} });
  Object.defineProperty(plot, 'releasePointerCapture', { configurable: true, value: () => {} });
  await act(async () => {
    plot.dispatchEvent(new TestPointerEvent('pointerdown', { bubbles: true, clientX: 0, pointerId: 7 }));
    plot.dispatchEvent(new TestPointerEvent('pointermove', { bubbles: true, clientX: 700, pointerId: 7 }));
    plot.dispatchEvent(new TestPointerEvent('pointerup', { bubbles: true, clientX: 700, pointerId: 7 }));
  });
  assert.equal(todayButton.getAttribute('aria-pressed'), 'true');
  assert.ok(container.querySelector('[role="status"]'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 540));
  });
  assert.equal(container.querySelector('[role="status"]'), null);

  await act(async () => {
    root.render(<MoodTrendChart
      key="restored-selection"
      detailAutoHideMs={500}
      initialSelectedDate={yesterdayKey}
      entries={[
        entry(dayBeforeYesterdayKey, '今天很平静'),
        entry(yesterdayKey, '今天很疲惫'),
        entry(currentKey, '今天很开心'),
      ]}
    />);
  });
  const restoredButton = container.querySelector<HTMLButtonElement>(`button[data-mood-date="${yesterdayKey}"]`)!;
  assert.equal(restoredButton.getAttribute('aria-pressed'), 'true');
  assert.match(container.querySelector('[role="status"]')?.textContent || '', /疲惫/);

  await act(async () => root.unmount());
  dom.window.close();
});
