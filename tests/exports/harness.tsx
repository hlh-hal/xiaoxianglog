/**
 * Export harness —— 在真实浏览器（Vite dev server）里复现 saveToLocal 的
 * 浏览器原生排版导出链路，供 Puppeteer 通过 window.__runExportHarness /
 * window.__runPreservationCase 调用。
 *
 * - `__runExportHarness(H1..H8)` 覆盖结构、混排和超长正文。
 * - `__runPreservationCase(P1..P5)` 保留主题、图片和尺寸基线能力。
 *
 * 注意：此文件仅用于 bugfix 测试支持代码，不会被引入生产构建；
 * 导出必须调用生产代码中的 renderExportPng，避免测试与真实流程漂移。
 */

import { createRoot, type Root } from 'react-dom/client';
import * as htmlToImage from 'html-to-image';
import { DiaryExportCard } from '../../src/pages/Editor';
import { allThemes, type DiaryTheme } from '../../src/types/theme';
import {
  measureExportCard,
  pickExportScale,
  waitForExportRenderReady,
  renderExportPng,
  type ExportPngResult,
} from '../../src/utils/exportImage';

// 引入全局样式，保证 Tailwind v4 + @tailwindcss/typography 的 prose / preflight
// 规则在 harness 页面里也会生效 —— 这是产生 oklch computed style 的前提。
import '../../src/index.css';

// ========== Exploration (Task 1) ==========

type ExplorationCaseId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8';

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

const H5_HTML = `
<p>2026.5.27</p>
<p>开心：又加了一个象友，持续畅聊中。</p>
<p>充实：完成了英语的小测，写完一份实验报告。发现加了一门新的实验课，跟一个同学一起做实验，聊得还可以，配合算是默契，再观察几天，看看能不能加入组队名单里。</p>
<p>总结了杰给的ai skill创建流程，可以找个时间更新一下自己的skill了。</p>
<p>感谢：老己又活了一天，真好。</p>
`.trim();

const H6_HTML = `
<p>2026.5.29</p>
<p>充头：跟D老师生成完ai提示词，又去codebud使用提示词生成论文，明天改一改就能用了。</p>
<p>感谢：ha改完bug还跟我讲了，挺好的。杰跟我讲如何利用ai听课，但是我并不支持这个观点。</p>
<p>思考：明天要改论文，还有象友杯的辩论赛。今天晚上想了一下暑假干什么，然后做面试模拟skill和日程安排APP。</p>
`.trim();

const H7_HTML = `
<p>2026.6.29</p>
<p>开心：中文 English 123 都要清楚，AI中文、中文AI、版本v1.0.20都不能挤压。</p>
<p>感谢：所有跟我<span data-export-probe="mixed">聊天UU以及</span>坚强的老己。</p>
<p>思考：长单词 Supercalifragilisticexpialidocious需要正常换行，数字20260629也不能覆盖中文。</p>
<p>换行验证第一行<br>第二行 mixed中英123混排<br>第三行保持完整。</p>
`.trim();

const H8_HTML = Array.from({ length: 36 }, (_, index) => `
<p>${index + 1}. 长段落验证：中文English${index + 100}混排，聊天UU以及数字20260629都应保持正常字距、换行和行高。ThisIsAVeryLongUnbrokenEnglishTokenForWrapping${index}。</p>
`).join('');

const EXPLORATION_CASE_MAP: Record<ExplorationCaseId, string> = {
  H1: H1_HTML,
  H2: H2_HTML,
  H3: H3_HTML,
  H4: H4_HTML,
  H5: H5_HTML,
  H6: H6_HTML,
  H7: H7_HTML,
  H8: H8_HTML,
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
    await waitForExportRenderReady(el);

    // 镜像 saveToLocal：按卡片高度选倍率，再由浏览器原生排版生成 PNG。
    const { cardH } = measureExportCard(el);
    const scale = pickExportScale(cardH);
    const { dataUrl, width, height } = await renderExportPng(el, htmlToImage.toPng, scale);
    const ok =
      width > 0 &&
      height > 0 &&
      dataUrl.startsWith('data:image/png;base64,') &&
      !dataUrl.startsWith('data:,');

    return {
      caseId,
      ok,
      width,
      height,
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
    await waitForExportRenderReady(el);

    const { dataUrl, width, height } = await renderExportPng(el, htmlToImage.toPng, 2);
    if (
      width <= 0 ||
      height <= 0 ||
      !dataUrl.startsWith('data:image/png;base64,') ||
      dataUrl === 'data:,'
    ) {
      return {
        caseId,
        ok: false,
        errorMessage: `invalid PNG data (width=${width}, height=${height}, dataUrlPrefix=${dataUrl.slice(0, 24)})`,
        elapsedMs: performance.now() - startedAt,
      };
    }

    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    const sha256 = await sha256HexFromBase64(base64);

    return {
      caseId,
      ok: true,
      width,
      height,
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

interface TypographyPreviewOptions {
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
}

let previewRoot: Root | null = null;

async function renderExportPreview(
  caseId: ExplorationCaseId,
  typography: TypographyPreviewOptions = {},
): Promise<void> {
  const rootEl = document.getElementById('harness-root');
  if (!rootEl) throw new Error('#harness-root missing');

  previewRoot?.unmount();
  previewRoot = null;
  rootEl.innerHTML = '';
  rootEl.style.cssText = 'padding: 24px; background: #e9e7df; min-height: 100vh;';

  const documentStyle = document.documentElement.style;
  documentStyle.setProperty('--diary-font-size', `${typography.fontSize ?? 16}px`);
  documentStyle.setProperty('--diary-line-height', String(typography.lineHeight ?? 1.7));
  documentStyle.setProperty(
    '--diary-font-family',
    typography.fontFamily ?? '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  );

  const preview = document.createElement('div');
  preview.style.cssText = 'width:375px;margin:0 auto;background:#faf9f5;';
  rootEl.appendChild(preview);

  previewRoot = createRoot(preview);
  previewRoot.render(
    <DiaryExportCard
      entry={{ diaryDate: Date.UTC(2026, 4, 28) }}
      theme={pickWarmWhiteTheme()}
      htmlContent={EXPLORATION_CASE_MAP[caseId]}
      images={[]}
    />
  );

  await new Promise((r) => setTimeout(r, 100));
  const el = preview.querySelector('#diary-export-card') as HTMLElement | null;
  if (!el) throw new Error('#diary-export-card missing');
  await waitForDataReady(el, 20, 50);
  await waitForExportRenderReady(el);
}

async function exportCurrentPreview(scale: 1 | 1.5 | 2 = 2): Promise<ExportPngResult> {
  const el = document.querySelector<HTMLElement>('#diary-export-card');
  if (!el) throw new Error('#diary-export-card missing');
  return renderExportPng(el, htmlToImage.toPng, scale);
}

// ========== Global registration ==========

declare global {
  interface Window {
    __runExportHarness?: (caseId: ExplorationCaseId) => Promise<ExplorationResult>;
    __runPreservationCase?: (caseId: PreservationCaseId) => Promise<PreservationResult>;
    __renderExportPreview?: (caseId: ExplorationCaseId, typography?: TypographyPreviewOptions) => Promise<void>;
    __exportCurrentPreview?: (scale?: 1 | 1.5 | 2) => Promise<ExportPngResult>;
    __harnessReady?: boolean;
  }
}

window.__runExportHarness = runExportHarness;
window.__runPreservationCase = runPreservationCase;
window.__renderExportPreview = renderExportPreview;
window.__exportCurrentPreview = exportCurrentPreview;
window.__harnessReady = true;

// 页面里一个最小可见提示，便于手动打开 harness.html 时看状态。
const rootEl = document.getElementById('harness-root');
if (rootEl) {
  rootEl.textContent =
    'export harness ready (use window.__runExportHarness("H1"..."H8") or window.__runPreservationCase("P1"..."P5"))';
  rootEl.style.cssText = 'font-family: monospace; padding: 16px;';
}
