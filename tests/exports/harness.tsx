/**
 * Export harness —— 在真实浏览器（Vite dev server）里复现 saveToLocal 的
 * html2canvas 链路，供 Puppeteer 通过 window.__runExportHarness /
 * window.__runPreservationCase 调用。
 *
 * - `__runExportHarness(H1..H4)` 服务于 Task 1 exploration test：
 *   在**未修复**代码上确认 oklch 命中、html2canvas 抛错。
 * - `__runPreservationCase(P1..P5)` 服务于 Task 2 preservation baseline：
 *   在**未修复**代码上，用 ¬isBugCondition 的输入生成 baseline PNG，
 *   供 Task 3.6 作像素一致性比对。
 *
 * 注意：此文件仅用于 bugfix 测试支持代码，不会被引入生产构建；
 * 不允许在这里重写业务逻辑（比如绕开 html2canvas 或做颜色预处理）。
 */

import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { DiaryExportCard } from '../../src/pages/Editor';
import { allThemes, type DiaryTheme } from '../../src/types/theme';
// Task 3.5: 与 saveToLocal 的最新实现保持同步 —— 把 oklch/oklab/lab/lch 归一化成 rgb，
// 按卡片高度挑 html2canvas 的 scale。harness 不是在"重写业务逻辑"，而是在"如实镜像
// saveToLocal 的导出链路"；saveToLocal 在 Task 3.2 接入了这两个工具，harness 也必须
// 接入，否则再跑这个 exploration test 实际测的是未修复路径，会永远失败。
import {
  sanitizeModernColors,
  measureExportCard,
  pickExportScale,
} from '../../src/utils/exportImage';

// 引入全局样式，保证 Tailwind v4 + @tailwindcss/typography 的 prose / preflight
// 规则在 harness 页面里也会生效 —— 这是产生 oklch computed style 的前提。
import '../../src/index.css';

// ========== Exploration (Task 1) ==========

type ExplorationCaseId = 'H1' | 'H2' | 'H3' | 'H4';

interface ExplorationResult {
  caseId: ExplorationCaseId;
  ok: boolean;
  errorMessage?: string;
  errorName?: string;
  width?: number;
  height?: number;
  dataUrlPrefix?: string;
  elapsedMs: number;
}

// H1：用户截图里那篇 SenseNova 模型对比长文的 Markdown → HTML 手写版
const H1_HTML = `
<h1>可用模型</h1>
<p><code>sensenova-6.7-flash-lite</code></p>
<h2>模型总览</h2>
<ul>
  <li><strong>SenseNova 6.7 Flash-Lite</strong>：轻量级文本模型，响应速度快。</li>
  <li><strong>SenseNova U1 Fast</strong>：通用模型，平衡延迟和质量。</li>
  <li><strong>DeepSeek V4 Flash</strong>：低延迟推理模型，适合移动端。</li>
</ul>
<blockquote>
  <p>参考信息：官网地址 <a href="https://example.com">https://example.com</a>；数据时间 2024-12。</p>
</blockquote>
<h2>官网地址</h2>
<p>详情请参考各自官方文档。</p>
<h2>数据时间</h2>
<p>以上数据采集于 2024 年 12 月。</p>
`.trim();

const H2_HTML = `<pre><code>let x = 1;</code></pre>`;
const H3_HTML = `<blockquote><p>Quote</p></blockquote>`;
const H4_HTML = `<p>这是一段普通正文，只有纯 p 标签。</p>`;

const EXPLORATION_CASE_MAP: Record<ExplorationCaseId, string> = {
  H1: H1_HTML,
  H2: H2_HTML,
  H3: H3_HTML,
  H4: H4_HTML,
};

// ========== Preservation (Task 2) ==========

type PreservationCaseId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

interface PreservationResult {
  caseId: PreservationCaseId;
  ok: boolean;
  assertion?: string;
  errorMessage?: string;
  errorName?: string;
  width?: number;
  height?: number;
  dataUrlBase64?: string;
  sha256?: string;
  elapsedMs: number;
}

// 约 200 字、严格只用 <p>：不含 h1/h2/ul/li/blockquote/code/pre/a/strong/em 等
// 会命中 @tailwindcss/typography prose oklch 规则的元素。
const PURE_P_200 = `
<p>今天天气很好，早晨起床后我简单收拾了一下，然后下楼买了早餐，顺便在楼下的便利店补了一瓶牛奶和一小包坚果。</p>
<p>上午在家整理了书桌和抽屉，把一堆过期的票据、旧笔和用完的本子一并清理掉，看着干净的桌面，心情也跟着舒展开来。</p>
<p>下午去附近的公园慢慢走了一圈，看到许多花和树，在长椅上坐了一会儿，晒了一点阳光，听到鸟叫，整个人都很安静。</p>
<p>晚上回家做了一份番茄炒蛋和一碗紫菜蛋花汤，吃得很暖，收拾完厨房之后随手把今天的心情简单记在这里，睡前读几页书就好。</p>
`.trim();

// 在 off-DOM canvas 上造一张纯色 PNG，返回 data URL；给 P2 / P4 做图片输入使用，
// 避免依赖远程资源，保证每次 baseline 都可复现。
function makeSolidPng(w: number, h: number, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('makeSolidPng: 2d context unavailable');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL('image/png');
}

// 预生成 4 张 300x300 纯色图 data URL（在 module init 阶段），P2 取前 2 张，P4 取全部。
const SOLID_PNGS: string[] = [
  makeSolidPng(300, 300, 'rgb(220, 80, 80)'),   // 红
  makeSolidPng(300, 300, 'rgb(70, 130, 220)'),  // 蓝
  makeSolidPng(300, 300, 'rgb(90, 180, 110)'),  // 绿
  makeSolidPng(300, 300, 'rgb(230, 190, 80)'),  // 黄
];

function pickWarmWhiteTheme(): DiaryTheme {
  return allThemes[0]; // id: 'warm-white'
}

function pickFirstBackgroundImageTheme(): DiaryTheme {
  const t = allThemes.find((x) => !!x.backgroundImage);
  if (!t) throw new Error('No theme with backgroundImage found in allThemes');
  return t;
}

interface PreservationCaseSpec {
  theme: () => DiaryTheme;
  images: () => string[];
  htmlContent: string;
  description: string;
}

const PRESERVATION_CASE_MAP: Record<PreservationCaseId, PreservationCaseSpec> = {
  P1: {
    theme: pickWarmWhiteTheme,
    images: () => [],
    htmlContent: PURE_P_200,
    description: 'ShortText-NoImage-PureColorTheme',
  },
  P2: {
    theme: pickWarmWhiteTheme,
    images: () => SOLID_PNGS.slice(0, 2),
    htmlContent: PURE_P_200,
    description: 'ShortText-TwoImages-PureColorTheme',
  },
  P3: {
    theme: pickFirstBackgroundImageTheme,
    images: () => [],
    htmlContent: PURE_P_200,
    description: 'ShortText-NoImage-BackgroundImageTheme',
  },
  P4: {
    theme: pickFirstBackgroundImageTheme,
    images: () => SOLID_PNGS.slice(0, 4),
    htmlContent: PURE_P_200,
    description: 'ShortText-FourImages-BackgroundImageTheme',
  },
  P5: {
    theme: pickWarmWhiteTheme,
    images: () => [],
    htmlContent: '',
    description: 'EmptyContent',
  },
};

// 需要检查的 CSS 属性集 —— 与 design.md 中 isBugCondition(el) 的属性清单对齐。
const MODERN_COLOR_PROPS: string[] = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'caret-color',
  'fill',
  'stroke',
  'column-rule-color',
  'box-shadow',
];

const MODERN_COLOR_PATTERN = /oklch\(|oklab\(|lab\(|lch\(/i;

/**
 * 遍历 root 子树，若任一节点的任一 MODERN_COLOR_PROPS 属性 computed 值命中
 * `oklch(|oklab(|lab(|lch(`，返回描述字符串；否则返回 null。
 */
function findModernColorHit(root: HTMLElement): string | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  // 根节点本身也要检查
  let node: Element | null = root;
  while (node) {
    const cs = getComputedStyle(node as HTMLElement);
    for (const prop of MODERN_COLOR_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && MODERN_COLOR_PATTERN.test(v)) {
        const tag = (node as HTMLElement).tagName;
        const cls = (node as HTMLElement).className || '';
        const trimmedCls = typeof cls === 'string' && cls.length > 60 ? cls.slice(0, 60) + '…' : cls;
        return `意外命中 oklch: <${tag}${trimmedCls ? ` class="${trimmedCls}"` : ''}>.${prop} = ${v.trim()}`;
      }
    }
    node = walker.nextNode() as Element | null;
  }
  return null;
}

async function sha256HexFromBase64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

// ========== Shared helpers ==========

function timeoutAfter<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`harness timeout after ${ms}ms`)), ms);
  });
}

async function waitForDataReady(el: HTMLElement, maxAttempts: number, intervalMs: number): Promise<boolean> {
  let attempts = 0;
  while (el.getAttribute('data-ready') !== 'true' && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, intervalMs));
    attempts++;
  }
  return el.getAttribute('data-ready') === 'true';
}

// ========== Exploration run (unchanged behavior for Task 1) ==========

async function runExplorationCase(caseId: ExplorationCaseId): Promise<ExplorationResult> {
  const startedAt = performance.now();
  const theme = allThemes[0]; // warm-white 纯色主题，保证不依赖远程背景图

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:0;left:-9999px;z-index:-1;pointer-events:none;';
  document.body.appendChild(wrapper);

  let root: Root | null = null;
  try {
    root = createRoot(wrapper);
    root.render(
      <DiaryExportCard
        entry={{ diaryDate: Date.UTC(2024, 11, 15) }}
        theme={theme}
        htmlContent={EXPLORATION_CASE_MAP[caseId]}
        images={[]}
      />
    );

    await new Promise((r) => setTimeout(r, 100));

    const el = wrapper.querySelector('#diary-export-card') as HTMLElement | null;
    if (!el) {
      return {
        caseId,
        ok: false,
        errorMessage: '#diary-export-card not found in harness wrapper',
        elapsedMs: performance.now() - startedAt,
      };
    }

    await waitForDataReady(el, 20, 50);
    await new Promise((r) => setTimeout(r, 100));

    // Task 3.5: 镜像 saveToLocal 在 Editor.tsx 里的最新导出链路：
    //   1) measureExportCard → pickExportScale（次级防线，默认 2）
    //   2) sanitizeModernColors（主修，把 oklch/oklab/lab/lch 归一化成 rgb）
    //   3) html2canvas 用 try/finally 确保 restoreColors() 被调用
    const { cardH } = measureExportCard(el);
    const scale = pickExportScale(cardH);
    const restoreColors = sanitizeModernColors(el);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        scale,
        backgroundColor: null,
        logging: false,
        width: 375,
        windowWidth: 375,
      });
    } finally {
      restoreColors();
    }

    const dataUrl = canvas.toDataURL('image/png');
    const ok =
      canvas.width > 0 &&
      canvas.height > 0 &&
      dataUrl.startsWith('data:image/png;base64,') &&
      !dataUrl.startsWith('data:,');

    return {
      caseId,
      ok,
      width: canvas.width,
      height: canvas.height,
      dataUrlPrefix: dataUrl.slice(0, 40),
      elapsedMs: performance.now() - startedAt,
    };
  } catch (err: any) {
    return {
      caseId,
      ok: false,
      errorName: err?.name ?? 'Error',
      errorMessage: err?.message ?? String(err),
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    try {
      root?.unmount();
    } catch {
      /* ignore */
    }
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
}

async function runExportHarness(caseId: ExplorationCaseId): Promise<ExplorationResult> {
  const RUN_TIMEOUT_MS = 15000;
  try {
    return await Promise.race<ExplorationResult>([
      runExplorationCase(caseId),
      timeoutAfter<ExplorationResult>(RUN_TIMEOUT_MS),
    ]);
  } catch (err: any) {
    return {
      caseId,
      ok: false,
      errorName: err?.name ?? 'Error',
      errorMessage: err?.message ?? String(err),
      elapsedMs: RUN_TIMEOUT_MS,
    };
  }
}

// ========== Preservation run (Task 2) ==========

async function runPreservationCaseImpl(caseId: PreservationCaseId): Promise<PreservationResult> {
  const startedAt = performance.now();
  const spec = PRESERVATION_CASE_MAP[caseId];
  if (!spec) {
    return { caseId, ok: false, errorMessage: `unknown preservation caseId ${caseId}`, elapsedMs: 0 };
  }
  const theme = spec.theme();
  const images = spec.images();
  const htmlContent = spec.htmlContent;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:0;left:-9999px;z-index:-1;pointer-events:none;';
  document.body.appendChild(wrapper);

  let root: Root | null = null;
  try {
    root = createRoot(wrapper);
    root.render(
      <DiaryExportCard
        entry={{ diaryDate: Date.UTC(2024, 11, 15) }}
        theme={theme}
        htmlContent={htmlContent}
        images={images}
      />
    );

    await new Promise((r) => setTimeout(r, 100));

    const el = wrapper.querySelector('#diary-export-card') as HTMLElement | null;
    if (!el) {
      return {
        caseId,
        ok: false,
        errorMessage: '#diary-export-card not found in harness wrapper',
        elapsedMs: performance.now() - startedAt,
      };
    }

    // 背景图主题需要等背景图加载完成（data-ready="true"）；最多 2s。
    const maxAttempts = theme.backgroundImage ? 40 : 20;
    const ready = await waitForDataReady(el, maxAttempts, 50);
    if (!ready) {
      return {
        caseId,
        ok: false,
        errorMessage: `data-ready=true 未在 ${maxAttempts * 50}ms 内到达（theme=${theme.id}）`,
        elapsedMs: performance.now() - startedAt,
      };
    }

    // 再稳一点布局
    await new Promise((r) => setTimeout(r, 150));

    // **前置断言**：在调用 html2canvas 之前验证 ¬isBugCondition。
    const hit = findModernColorHit(el);
    if (hit) {
      return {
        caseId,
        ok: false,
        assertion: `${caseId} ${hit}`,
        elapsedMs: performance.now() - startedAt,
      };
    }

    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: false,
      scale: 2,
      backgroundColor: null,
      logging: false,
      width: 375,
      windowWidth: 375,
    });

    const dataUrl = canvas.toDataURL('image/png');
    if (
      canvas.width <= 0 ||
      canvas.height <= 0 ||
      !dataUrl.startsWith('data:image/png;base64,') ||
      dataUrl === 'data:,'
    ) {
      return {
        caseId,
        ok: false,
        errorMessage: `invalid canvas / dataUrl (width=${canvas.width}, height=${canvas.height}, dataUrlPrefix=${dataUrl.slice(0, 24)})`,
        elapsedMs: performance.now() - startedAt,
      };
    }

    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    const sha256 = await sha256HexFromBase64(base64);

    return {
      caseId,
      ok: true,
      width: canvas.width,
      height: canvas.height,
      dataUrlBase64: base64,
      sha256,
      elapsedMs: performance.now() - startedAt,
    };
  } catch (err: any) {
    return {
      caseId,
      ok: false,
      errorName: err?.name ?? 'Error',
      errorMessage: err?.message ?? String(err),
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    try {
      root?.unmount();
    } catch {
      /* ignore */
    }
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
}

async function runPreservationCase(caseId: PreservationCaseId): Promise<PreservationResult> {
  // baseline case 允许稍大的 timeout（背景图主题 + 较大 canvas 渲染）
  const RUN_TIMEOUT_MS = 30000;
  try {
    return await Promise.race<PreservationResult>([
      runPreservationCaseImpl(caseId),
      timeoutAfter<PreservationResult>(RUN_TIMEOUT_MS),
    ]);
  } catch (err: any) {
    return {
      caseId,
      ok: false,
      errorName: err?.name ?? 'Error',
      errorMessage: err?.message ?? String(err),
      elapsedMs: RUN_TIMEOUT_MS,
    };
  }
}

// ========== Global registration ==========

declare global {
  interface Window {
    __runExportHarness?: (caseId: ExplorationCaseId) => Promise<ExplorationResult>;
    __runPreservationCase?: (caseId: PreservationCaseId) => Promise<PreservationResult>;
    __harnessReady?: boolean;
  }
}

window.__runExportHarness = runExportHarness;
window.__runPreservationCase = runPreservationCase;
window.__harnessReady = true;

// 页面里一个最小可见提示，便于手动打开 harness.html 时看状态。
const rootEl = document.getElementById('harness-root');
if (rootEl) {
  rootEl.textContent =
    'export harness ready (use window.__runExportHarness("H1"|"H2"|"H3"|"H4") or window.__runPreservationCase("P1"..."P5"))';
  rootEl.style.cssText = 'font-family: monospace; padding: 16px;';
}
