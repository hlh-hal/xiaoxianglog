import puppeteer, { type Browser, type Page } from 'puppeteer';

const HARNESS_URL = 'http://localhost:3000/tests/exports/harness.html';
const CASES = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'] as const;
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
  expect: 'pass';
  description: string;
}

const EXPECTATIONS: CaseExpectation[] = [
  { caseId: 'H1', expect: 'pass', description: 'long Markdown-like content with typography elements' },
  { caseId: 'H2', expect: 'pass', description: 'pre/code block' },
  { caseId: 'H3', expect: 'pass', description: 'blockquote' },
  { caseId: 'H4', expect: 'pass', description: 'plain paragraph' },
  { caseId: 'H5', expect: 'pass', description: 'mixed Chinese/English export text with ai skill phrase' },
  { caseId: 'H6', expect: 'pass', description: 'Edge mixed Chinese/Latin overlap regression text' },
];

const OKLCH_PATTERN = /Attempting to parse an unsupported color function/i;

async function waitForHarnessReady(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: timeoutMs });
}

async function runHarnessCase(page: Page, caseId: CaseId): Promise<HarnessResult> {
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
  try {
    const resp = await fetch(HARNESS_URL, { method: 'GET' });
    if (!resp.ok) throw new Error(`dev server returned ${resp.status}`);
  } catch (err: any) {
    console.error(`[exploration] dev server is not running at ${HARNESS_URL}; start npm run dev first.`, err?.message ?? err);
    process.exitCode = 2;
    return;
  }

  let browser: Browser | undefined;
  const results: HarnessResult[] = [];
  const consoleErrors: Array<{ text: string }> = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

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
      console.log(`[exploration] ${caseId} -> ${JSON.stringify(r)}`);
    }
  } finally {
    if (browser) await browser.close();
  }

  let allExpectationsMet = true;
  const report: string[] = [];
  for (const exp of EXPECTATIONS) {
    const r = results.find((x) => x.caseId === exp.caseId);
    if (!r) {
      allExpectationsMet = false;
      report.push(`- ${exp.caseId} (${exp.description}) failed: no result`);
      continue;
    }

    const hasValidPng = r.ok && r.dataUrlPrefix?.startsWith('data:image/png;base64,');
    const hasPositiveSize = (r.width ?? 0) > 0 && (r.height ?? 0) > 0;
    const withinTimeBudget = r.elapsedMs <= 15000;
    if (hasValidPng && hasPositiveSize && withinTimeBudget) {
      report.push(`- ${exp.caseId} (${exp.description}) passed (${r.width}x${r.height}, ${r.elapsedMs.toFixed(1)}ms)`);
    } else {
      allExpectationsMet = false;
      const reasons: string[] = [];
      if (!hasValidPng) reasons.push(`ok=${r.ok}, dataUrlPrefix=${r.dataUrlPrefix ?? '(none)'}, errorMessage=${r.errorMessage ?? '(none)'}`);
      if (!hasPositiveSize) reasons.push(`width=${r.width}, height=${r.height}`);
      if (!withinTimeBudget) reasons.push(`elapsedMs=${r.elapsedMs.toFixed(1)} > 15000`);
      report.push(`- ${exp.caseId} (${exp.description}) failed: ${reasons.join('; ')}`);
    }
  }

  const oklchInConsole = consoleErrors.filter((e) => OKLCH_PATTERN.test(e.text));
  if (oklchInConsole.length > 0) {
    allExpectationsMet = false;
    report.push(`- failed: browser console had ${oklchInConsole.length} oklch parse errors`);
  } else {
    report.push('- passed: no html2canvas oklch parse errors in browser console');
  }

  console.log('\n[exploration] === summary ===');
  for (const line of report) console.log(line);

  if (consoleErrors.length > 0) {
    console.log('\n[exploration] === browser warnings/errors ===');
    for (const e of consoleErrors.slice(0, 20)) console.log(e.text);
    if (consoleErrors.length > 20) console.log(`... (${consoleErrors.length - 20} more)`);
  }

  console.log('\n[exploration] === raw JSON ===');
  console.log(JSON.stringify(results, null, 2));

  if (!allExpectationsMet) {
    console.error('\n[exploration] failed: at least one case did not meet expectations.');
    process.exitCode = 1;
  } else {
    console.log('\n[exploration] passed: all cases exported valid PNG data.');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('[exploration] top-level error:', err);
  process.exitCode = 1;
});
