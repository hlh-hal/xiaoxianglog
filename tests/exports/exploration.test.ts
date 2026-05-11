/**
 * Bug condition exploration test（bugfix workflow Task 1）
 *
 * 目的：在**未修复**的代码上复现用户报的
 *   Editor.tsx:577 导出图片失败:
 *   Error: Attempting to parse an unsupported color function "oklch"
 *
 * 实现：Puppeteer 打开 Vite dev server 里的 harness 页面，
 *       依次调用 window.__runExportHarness('H1' | 'H2' | 'H3' | 'H4')
 *       并断言每个 case 的结果。
 *
 * 期望结果（未修复代码上）：
 *   - H1, H2, H3 → FAIL，errorMessage 含 "Attempting to parse an unsupported color function"
 *   - H4        → PASS（对照组，纯 <p>）
 *
 * 如果 H1/H2/H3 任一在未修复代码上 PASS（没有 oklch 错误），
 *   ⇒ bug 未被探测到（unexpected_pass 路径），需要停下来让上层决定。
 *
 * 运行方式：
 *   1) 先在另一个终端里 `npm run dev`（Vite :3000）
 *   2) `npm run test:exploration`
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';

const HARNESS_URL = 'http://localhost:3000/tests/exports/harness.html';
const CASES = ['H1', 'H2', 'H3', 'H4'] as const;
type CaseId = (typeof CASES)[number];

interface HarnessResult {
  caseId: CaseId;
  ok: boolean;
  errorMessage?: string;
  errorName?: string;
  width?: number;
  height?: number;
  dataUrlPrefix?: string;
  elapsedMs: number;
}

interface CaseExpectation {
  caseId: CaseId;
  expect: 'fail-with-oklch' | 'pass';
  description: string;
}

const EXPECTATIONS: CaseExpectation[] = [
  // Task 3.5：修复后期望所有 H1–H4 全部 PASS（含 oklch 命中子树），且控制台不再出现 oklch 错误。
  { caseId: 'H1', expect: 'pass', description: '用户截图 Markdown 长文（h1/h2/ul/blockquote/code/a）' },
  { caseId: 'H2', expect: 'pass', description: '最小复现：<pre><code>let x = 1;</code></pre> 代码块' },
  { caseId: 'H3', expect: 'pass', description: '最小复现：仅 <blockquote>Quote</blockquote>' },
  { caseId: 'H4', expect: 'pass', description: '对照组：纯 <p>段落文字</p>' },
];

const OKLCH_PATTERN = /Attempting to parse an unsupported color function/i;

async function waitForHarnessReady(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: timeoutMs });
}

async function runHarnessCase(page: Page, caseId: CaseId): Promise<HarnessResult> {
  // 单次 case 最长 20s（harness 自己有 15s 上限 + 一点 overhead）
  const result = await page.evaluate(async (id) => {
    if (!window.__runExportHarness) {
      return {
        caseId: id,
        ok: false,
        errorMessage: 'window.__runExportHarness missing',
        elapsedMs: 0,
      };
    }
    return window.__runExportHarness(id as any);
  }, caseId);
  return result as HarnessResult;
}

async function main(): Promise<void> {
  // 校验 dev server 在跑
  try {
    const resp = await fetch(HARNESS_URL, { method: 'GET' });
    if (!resp.ok) {
      throw new Error(`dev server returned ${resp.status}`);
    }
  } catch (err: any) {
    console.error(`[exploration] dev server 未在 ${HARNESS_URL} 上运行，请先 \`npm run dev\`。原始错误：`, err?.message ?? err);
    process.exitCode = 2;
    return;
  }

  let browser: Browser | undefined;
  const results: HarnessResult[] = [];
  const consoleErrors: Array<{ caseId?: CaseId; text: string }> = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      // 放宽 sandbox，兼容 Windows 上的默认安装
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // 捕获浏览器控制台输出，方便看到原始 oklch 错误栈
    page.on('console', (msg) => {
      const t = msg.type() as string;
      if (t === 'error' || t === 'warn' || t === 'warning') {
        consoleErrors.push({ text: `[${t}] ${msg.text()}` });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ text: `[pageerror] ${err.message}` });
    });

    page.setDefaultNavigationTimeout(30000);
    await page.goto(HARNESS_URL, { waitUntil: 'networkidle0' });
    await waitForHarnessReady(page);

    for (const caseId of CASES) {
      console.log(`[exploration] running case ${caseId} ...`);
      const r = await runHarnessCase(page, caseId);
      results.push(r);
      console.log(`[exploration] ${caseId} →`, JSON.stringify(r));
    }
  } finally {
    if (browser) await browser.close();
  }

  // 断言每个 case
  let allExpectationsMet = true;
  const report: string[] = [];
  for (const exp of EXPECTATIONS) {
    const r = results.find((x) => x.caseId === exp.caseId);
    if (!r) {
      allExpectationsMet = false;
      report.push(`- ${exp.caseId} (${exp.description}) ❌ 未拿到结果`);
      continue;
    }
    if (exp.expect === 'fail-with-oklch') {
      const matches = !r.ok && !!r.errorMessage && OKLCH_PATTERN.test(r.errorMessage);
      if (matches) {
        report.push(`- ${exp.caseId} (${exp.description}) ✅ 如期失败：${r.errorMessage}`);
      } else {
        allExpectationsMet = false;
        report.push(`- ${exp.caseId} (${exp.description}) ⚠️ 期望失败（含 oklch），实际：ok=${r.ok}, errorMessage=${r.errorMessage ?? '(none)'}`);
      }
    } else {
      // Task 3.5: expect = 'pass' —— 要同时满足：
      //   (1) ok === true
      //   (2) dataUrlPrefix 以 data:image/png;base64, 开头
      //   (3) width > 0 && height > 0
      //   (4) elapsedMs <= 15000
      const hasValidPng = r.ok && r.dataUrlPrefix?.startsWith('data:image/png;base64,');
      const hasPositiveSize = (r.width ?? 0) > 0 && (r.height ?? 0) > 0;
      const withinTimeBudget = r.elapsedMs <= 15000;
      if (hasValidPng && hasPositiveSize && withinTimeBudget) {
        report.push(`- ${exp.caseId} (${exp.description}) ✅ 如期成功 (${r.width}x${r.height}, ${r.dataUrlPrefix?.slice(0, 32)}..., ${r.elapsedMs.toFixed(1)}ms)`);
      } else {
        allExpectationsMet = false;
        const reasons: string[] = [];
        if (!hasValidPng) reasons.push(`ok=${r.ok}, dataUrlPrefix=${r.dataUrlPrefix ?? '(none)'}, errorMessage=${r.errorMessage ?? '(none)'}`);
        if (!hasPositiveSize) reasons.push(`width=${r.width}, height=${r.height}`);
        if (!withinTimeBudget) reasons.push(`elapsedMs=${r.elapsedMs.toFixed(1)} > 15000`);
        report.push(`- ${exp.caseId} (${exp.description}) ⚠️ 期望成功，实际：${reasons.join('; ')}`);
      }
    }
  }

  // Task 3.5 追加：全部 case 的浏览器控制台都不能出现 oklch 相关错误。
  const oklchInConsole = consoleErrors.filter((e) => OKLCH_PATTERN.test(e.text));
  if (oklchInConsole.length > 0) {
    allExpectationsMet = false;
    report.push(`- ⚠️ 浏览器控制台出现 ${oklchInConsole.length} 条 oklch 相关错误/警告，不符合 Task 3.5 要求`);
  } else {
    report.push('- ✅ 浏览器控制台未出现 "Attempting to parse an unsupported color function" 相关错误');
  }

  console.log('\n[exploration] === 结果摘要 ===');
  for (const line of report) console.log(line);

  if (consoleErrors.length > 0) {
    console.log('\n[exploration] === 浏览器控制台错误/警告（仅参考） ===');
    for (const e of consoleErrors.slice(0, 20)) console.log(e.text);
    if (consoleErrors.length > 20) console.log(`... (${consoleErrors.length - 20} more)`);
  }

  // 打印原始 JSON，便于 orchestrator 解析 / 写入 counterexamples.md
  console.log('\n[exploration] === 原始结果 JSON ===');
  console.log(JSON.stringify(results, null, 2));

  if (!allExpectationsMet) {
    console.error('\n[exploration] ❌ 至少一个 case 不符合 Task 3.5 修复后的期望结果。');
    process.exitCode = 1;
  } else {
    console.log('\n[exploration] ✅ 所有 case 都符合 Task 3.5 修复后的期望：oklch bug 已修复（H1/H2/H3/H4 全 PASS，console 无 oklch 错误）。');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('[exploration] 顶层异常：', err);
  process.exitCode = 1;
});
