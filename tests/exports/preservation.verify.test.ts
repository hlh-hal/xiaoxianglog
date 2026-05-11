/**
 * Preservation verification runner（bugfix workflow Task 3.6）
 *
 * 目的：**不**修改 preservation.test.ts / harness / baseline 任何文件；
 *       在**修复后**代码上重跑 Task 2 的 5 个 preservation case，用
 *       固化在 tests/fixtures/export-baseline/P{1..5}.png 的 baseline 做像素比对，
 *       验证 Preservation 属性未回归。
 *
 * 容差（与 design.md + tasks.md 3.6 完全对齐）：
 *   - 宽高必须完全一致；
 *   - 单像素 RGB 最大通道差 <= 2；
 *   - 整图差异像素比例 <= 1%；
 *   - 文件名 / 目录 / 下载方式（源码静态检查）必须未改动。
 *
 * 运行方式：
 *   1) 先 `npm run dev`（Vite :3000）
 *   2) `npm run test:preservation:verify`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const HARNESS_URL = 'http://localhost:3000/tests/exports/harness.html';
const EDITOR_SRC_PATH = 'src/pages/Editor.tsx';
const CASES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
type CaseId = (typeof CASES)[number];

interface PreservationResult {
  caseId: CaseId;
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

interface DiffResult {
  widthNew: number;
  heightNew: number;
  widthBase: number;
  heightBase: number;
  dimsMatch: boolean;
  totalPixels: number;
  diffPixels: number;
  diffPixelRatio: number;
  maxChannelDiff: number;
  error?: string;
}

const MAX_CHANNEL_DIFF = 2;
const MAX_DIFF_RATIO = 0.01;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_DIR = path.resolve(REPO_ROOT, 'tests', 'fixtures', 'export-baseline');

async function waitForHarnessReady(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: timeoutMs });
}

async function runHarnessCase(page: Page, caseId: CaseId): Promise<PreservationResult> {
  const result = await page.evaluate(async (id) => {
    if (!window.__runPreservationCase) {
      return {
        caseId: id,
        ok: false,
        errorMessage: 'window.__runPreservationCase missing',
        elapsedMs: 0,
      };
    }
    return window.__runPreservationCase(id as any);
  }, caseId);
  return result as PreservationResult;
}

/**
 * 在浏览器里把两张 base64 PNG 都解码成 ImageData，逐像素比较。
 *
 * 设计理由：
 *   - 避免引入 pngjs / sharp 等新依赖；
 *   - 浏览器 <img> + <canvas> + getImageData 是零成本解码路径；
 *   - 像素比较逻辑简单，不需要 pixelmatch 之类更复杂的 anti-alias detection：
 *     diffPixel = 任一 RGB 通道差 > maxChannelDiff。
 */
async function diffInBrowser(
  page: Page,
  newBase64: string,
  baseBase64: string,
  maxChannelDiff: number,
): Promise<DiffResult> {
  return (await page.evaluate(
    async (newB64, baseB64, threshold) => {
      async function decode(b64: string): Promise<ImageData> {
        const dataUrl = 'data:image/png;base64,' + b64;
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('image decode failed'));
          img.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d context unavailable');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      try {
        const [a, b] = await Promise.all([decode(newB64), decode(baseB64)]);
        const dimsMatch = a.width === b.width && a.height === b.height;
        if (!dimsMatch) {
          return {
            widthNew: a.width,
            heightNew: a.height,
            widthBase: b.width,
            heightBase: b.height,
            dimsMatch: false,
            totalPixels: 0,
            diffPixels: 0,
            diffPixelRatio: 0,
            maxChannelDiff: 0,
          };
        }
        const aData = a.data;
        const bData = b.data;
        const totalPixels = a.width * a.height;
        let diffPixels = 0;
        let maxChannel = 0;
        // 只比较 RGB（忽略 alpha，避免 PNG 背景 alpha 合成带来的噪声）；
        // 但如果 alpha 本身差异很大，也纳入 "diff pixel" 计数。
        for (let i = 0; i < aData.length; i += 4) {
          const dR = Math.abs(aData[i] - bData[i]);
          const dG = Math.abs(aData[i + 1] - bData[i + 1]);
          const dB = Math.abs(aData[i + 2] - bData[i + 2]);
          const dA = Math.abs(aData[i + 3] - bData[i + 3]);
          const m = Math.max(dR, dG, dB, dA);
          if (m > maxChannel) maxChannel = m;
          if (dR > threshold || dG > threshold || dB > threshold || dA > threshold) {
            diffPixels++;
          }
        }
        return {
          widthNew: a.width,
          heightNew: a.height,
          widthBase: b.width,
          heightBase: b.height,
          dimsMatch: true,
          totalPixels,
          diffPixels,
          diffPixelRatio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
          maxChannelDiff: maxChannel,
        };
      } catch (err: any) {
        return {
          widthNew: 0,
          heightNew: 0,
          widthBase: 0,
          heightBase: 0,
          dimsMatch: false,
          totalPixels: 0,
          diffPixels: 0,
          diffPixelRatio: 0,
          maxChannelDiff: 0,
          error: err?.message ?? String(err),
        };
      }
    },
    newBase64,
    baseBase64,
    maxChannelDiff,
  )) as DiffResult;
}

interface StaticCheck {
  key: string;
  pattern: RegExp;
  ok: boolean;
  sample?: string;
}

function runStaticChecks(): StaticCheck[] {
  const absPath = path.join(REPO_ROOT, EDITOR_SRC_PATH);
  const src = fs.readFileSync(absPath, 'utf8');
  const checks: Array<{ key: string; pattern: RegExp }> = [
    {
      key: 'filename(Web <a download>) 保持 小象日志_${format(displayDate, \'yyyy-MM-dd\')}.png',
      pattern: /link\.download\s*=\s*`小象日志_\$\{format\(displayDate,\s*'yyyy-MM-dd'\)\}\.png`/,
    },
    {
      key: 'filename(Capacitor Filesystem) 保持 小象日志_${format(displayDate, \'yyyy-MM-dd\')}.png',
      pattern: /const fileName\s*=\s*`小象日志_\$\{format\(displayDate,\s*'yyyy-MM-dd'\)\}\.png`/,
    },
    {
      key: 'directory(Capacitor) 保持 Directory.Documents',
      pattern: /directory:\s*Directory\.Documents/,
    },
    {
      key: 'download way(Web) 保持 <a>.click() 触发下载',
      pattern: /document\.createElement\('a'\)[\s\S]{0,200}link\.click\(\)/,
    },
  ];
  return checks.map(({ key, pattern }) => {
    const m = pattern.exec(src);
    return { key, pattern, ok: m !== null, sample: m ? m[0].slice(0, 120) : undefined };
  });
}

interface CaseSummary {
  caseId: CaseId;
  ok: boolean;
  reason?: string;
  widthMatch: boolean;
  heightMatch: boolean;
  width?: number;
  height?: number;
  baseWidth?: number;
  baseHeight?: number;
  totalPixels?: number;
  diffPixels?: number;
  diffPixelRatio?: number;
  maxChannelDiff?: number;
  elapsedMs: number;
  newSha256?: string;
  baseSha256?: string;
}

async function main(): Promise<void> {
  // 1) dev server 存活检查（exit code 2 = 未运行，与 exploration/preservation 约定一致）
  try {
    const resp = await fetch(HARNESS_URL, { method: 'GET' });
    if (!resp.ok) throw new Error(`dev server returned ${resp.status}`);
  } catch (err: any) {
    console.error(
      `[preservation-verify] dev server 未在 ${HARNESS_URL} 上运行，请先 \`npm run dev\`。原始错误：`,
      err?.message ?? err,
    );
    process.exitCode = 2;
    return;
  }

  // 2) baseline 文件存在性检查
  const missingBaselines: string[] = [];
  for (const c of CASES) {
    const p = path.join(BASELINE_DIR, `${c}.png`);
    if (!fs.existsSync(p)) missingBaselines.push(path.relative(REPO_ROOT, p));
  }
  if (missingBaselines.length > 0) {
    console.error(
      `[preservation-verify] 以下 baseline 文件缺失，请先跑 Task 2（\`npm run test:preservation\`）生成：\n${missingBaselines.map((x) => '  - ' + x).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  // 3) 源码静态检查
  console.log('[preservation-verify] === 源码静态检查（filename / directory / download way）===');
  const staticChecks = runStaticChecks();
  let staticAllOk = true;
  for (const c of staticChecks) {
    if (c.ok) {
      console.log(`  ✅ ${c.key}`);
    } else {
      staticAllOk = false;
      console.error(`  ❌ ${c.key}（未在 ${EDITOR_SRC_PATH} 中找到匹配模式）`);
    }
  }
  if (!staticAllOk) {
    console.error(
      '[preservation-verify] 静态检查失败 —— 导出链路的文件名 / 目录 / 下载方式疑似被修改，记 Preservation 违规。',
    );
  }

  // 4) 浏览器端像素比对
  let browser: Browser | undefined;
  const summaries: CaseSummary[] = [];
  const consoleMsgs: Array<{ text: string }> = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      const type: string = msg.type();
      if (type === 'error' || type === 'warning' || type === 'warn') {
        consoleMsgs.push({ text: `[${type}] ${msg.text()}` });
      }
    });
    page.on('pageerror', (err) => {
      const m = err instanceof Error ? err.message : String(err);
      consoleMsgs.push({ text: `[pageerror] ${m}` });
    });

    page.setDefaultNavigationTimeout(30000);
    await page.goto(HARNESS_URL, { waitUntil: 'networkidle0' });
    await waitForHarnessReady(page);

    // tsx/esbuild 在打包 evaluate 回调时会注入 `__name(fn, 'name')` helper（keepNames=true 行为），
    // 但 helper 本身只在 Node 侧存在；Puppeteer 把函数体序列化到浏览器时，浏览器里没有 `__name`
    // 就会抛 "__name is not defined"。在这里给 page 注入一个等价 shim 即可。
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__name = (fn: unknown) => fn;
    });

    for (const caseId of CASES) {
      console.log(`[preservation-verify] running case ${caseId} ...`);
      const r = await runHarnessCase(page, caseId);

      const baselinePngPath = path.join(BASELINE_DIR, `${caseId}.png`);
      const baselineShaPath = path.join(BASELINE_DIR, `${caseId}.sha256`);
      const baseBuffer = fs.readFileSync(baselinePngPath);
      const baseBase64 = baseBuffer.toString('base64');
      const baseSha256 = fs.existsSync(baselineShaPath)
        ? fs.readFileSync(baselineShaPath, 'utf8').trim()
        : undefined;

      if (!r.ok || !r.dataUrlBase64) {
        const reason = r.assertion
          ? `前置断言失败: ${r.assertion}`
          : `harness 返回失败: ${r.errorMessage ?? '(unknown)'}`;
        console.error(`[preservation-verify] ${caseId} ❌ ${reason}`);
        summaries.push({
          caseId,
          ok: false,
          reason,
          widthMatch: false,
          heightMatch: false,
          elapsedMs: Math.round(r.elapsedMs),
          baseSha256,
        });
        continue;
      }

      const diff = await diffInBrowser(page, r.dataUrlBase64, baseBase64, MAX_CHANNEL_DIFF);

      if (diff.error) {
        console.error(`[preservation-verify] ${caseId} ❌ diff 失败: ${diff.error}`);
        summaries.push({
          caseId,
          ok: false,
          reason: `diff 解码失败: ${diff.error}`,
          widthMatch: false,
          heightMatch: false,
          width: r.width,
          height: r.height,
          elapsedMs: Math.round(r.elapsedMs),
          newSha256: r.sha256,
          baseSha256,
        });
        continue;
      }

      const widthMatch = diff.widthNew === diff.widthBase;
      const heightMatch = diff.heightNew === diff.heightBase;
      const ratioOk = diff.diffPixelRatio <= MAX_DIFF_RATIO;
      const channelOk = diff.maxChannelDiff <= MAX_CHANNEL_DIFF;
      const ok = widthMatch && heightMatch && ratioOk && channelOk;

      const reasons: string[] = [];
      if (!widthMatch) reasons.push(`width ${diff.widthNew}≠${diff.widthBase}`);
      if (!heightMatch) reasons.push(`height ${diff.heightNew}≠${diff.heightBase}`);
      if (!ratioOk) reasons.push(`diffRatio ${(diff.diffPixelRatio * 100).toFixed(3)}% > ${(MAX_DIFF_RATIO * 100).toFixed(1)}%`);
      if (!channelOk) reasons.push(`maxChannelDiff ${diff.maxChannelDiff} > ${MAX_CHANNEL_DIFF}`);

      if (ok) {
        console.log(
          `[preservation-verify] ${caseId} ✅ ${diff.widthNew}x${diff.heightNew}, diffPixels=${diff.diffPixels}/${diff.totalPixels} (${(diff.diffPixelRatio * 100).toFixed(4)}%), maxChannelDiff=${diff.maxChannelDiff}`,
        );
      } else {
        console.error(`[preservation-verify] ${caseId} ❌ ${reasons.join('; ')}`);
      }

      summaries.push({
        caseId,
        ok,
        reason: ok ? undefined : reasons.join('; '),
        widthMatch,
        heightMatch,
        width: diff.widthNew,
        height: diff.heightNew,
        baseWidth: diff.widthBase,
        baseHeight: diff.heightBase,
        totalPixels: diff.totalPixels,
        diffPixels: diff.diffPixels,
        diffPixelRatio: diff.diffPixelRatio,
        maxChannelDiff: diff.maxChannelDiff,
        elapsedMs: Math.round(r.elapsedMs),
        newSha256: r.sha256,
        baseSha256,
      });
    }
  } finally {
    if (browser) await browser.close();
  }

  // 5) 汇总
  console.log('\n[preservation-verify] === 汇总（像素比对）===');
  console.log(
    '| caseId | ok | new (w×h) | base (w×h) | diffPixels | diffRatio | maxΔ | elapsed ms |',
  );
  console.log('|--------|----|-----------|------------|------------|-----------|------|------------|');
  for (const s of summaries) {
    const newDim = s.width && s.height ? `${s.width}x${s.height}` : '-';
    const baseDim = s.baseWidth && s.baseHeight ? `${s.baseWidth}x${s.baseHeight}` : '-';
    const diffPx = typeof s.diffPixels === 'number' ? String(s.diffPixels) : '-';
    const ratio =
      typeof s.diffPixelRatio === 'number' ? `${(s.diffPixelRatio * 100).toFixed(4)}%` : '-';
    const maxCh = typeof s.maxChannelDiff === 'number' ? String(s.maxChannelDiff) : '-';
    console.log(
      `| ${s.caseId} | ${s.ok ? '✅' : '❌'} | ${newDim} | ${baseDim} | ${diffPx} | ${ratio} | ${maxCh} | ${s.elapsedMs} |`,
    );
  }

  // 不一致的 case 打印原因
  const failed = summaries.filter((s) => !s.ok);
  if (failed.length > 0) {
    console.error('\n[preservation-verify] 失败 case 细节：');
    for (const s of failed) {
      console.error(`  - ${s.caseId}: ${s.reason ?? '(no reason)'}`);
    }
  }

  if (consoleMsgs.length > 0) {
    console.log('\n[preservation-verify] === 浏览器控制台错误/警告（仅参考） ===');
    for (const e of consoleMsgs.slice(0, 20)) console.log(e.text);
    if (consoleMsgs.length > 20) console.log(`... (${consoleMsgs.length - 20} more)`);
  }

  const pixelAllOk = summaries.every((s) => s.ok);

  // 6) 最终结论
  console.log('\n[preservation-verify] === 结论 ===');
  console.log(`  像素一致性：${pixelAllOk ? '✅ 5/5 全部通过' : `❌ ${failed.length}/${summaries.length} 失败`}`);
  console.log(`  源码静态检查：${staticAllOk ? '✅ 文件名 / 目录 / 下载方式未改动' : '❌ 发现改动，见上方日志'}`);

  if (pixelAllOk && staticAllOk) {
    console.log('\n[preservation-verify] ✅ Task 3.6：Preservation 属性未回归，修复后产物与 baseline 在容差内一致。');
    process.exitCode = 0;
  } else {
    console.error('\n[preservation-verify] ❌ Task 3.6：Preservation 检查失败，详情见上方。');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[preservation-verify] 顶层异常：', err);
  process.exitCode = 1;
});
