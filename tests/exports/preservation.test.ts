/**
 * Preservation baseline runner（bugfix workflow Task 2）
 *
 * 目的：在**未修复**代码上，用 ¬isBugCondition 的 5 个 case 生成 PNG baseline，
 *       固化到 tests/fixtures/export-baseline/P{1..5}.{png,sha256}，供 Task 3.6
 *       在修复后代码上重跑同一组 case 做像素一致性比对。
 *
 * 期望：5 个 case 全部 ok=true，无 assertion 命中 oklch；生成 10 个 baseline 文件。
 *
 * 运行方式：
 *   1) 先 `npm run dev`（Vite :3000）
 *   2) `npm run test:preservation`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const HARNESS_URL = 'http://localhost:3000/tests/exports/harness.html';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// tests/exports/preservation.test.ts → repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_DIR = path.resolve(REPO_ROOT, 'tests', 'fixtures', 'export-baseline');

function resolveBrowserExecutable(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
}

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

interface BaselineSummary {
  caseId: CaseId;
  ok: boolean;
  width?: number;
  height?: number;
  sizeBytes?: number;
  sha256?: string;
  sha256Short?: string;
  elapsedMs: number;
  assertion?: string;
  errorMessage?: string;
}

async function main(): Promise<void> {
  try {
    const resp = await fetch(HARNESS_URL, { method: 'GET' });
    if (!resp.ok) {
      throw new Error(`dev server returned ${resp.status}`);
    }
  } catch (err: any) {
    console.error(
      `[preservation] dev server 未在 ${HARNESS_URL} 上运行，请先 \`npm run dev\`。原始错误：`,
      err?.message ?? err,
    );
    process.exitCode = 2;
    return;
  }

  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }

  let browser: Browser | undefined;
  const results: PreservationResult[] = [];
  const consoleErrors: Array<{ text: string }> = [];
  const summaries: BaselineSummary[] = [];
  const pendingWrites: Array<{ pngPath: string; shaPath: string; pngBuffer: Buffer; sha256: string }> = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: resolveBrowserExecutable(),
    });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      const type: string = msg.type();
      if (type === 'error' || type === 'warning' || type === 'warn') {
        consoleErrors.push({ text: `[${type}] ${msg.text()}` });
      }
    });
    page.on('pageerror', (err) => {
      const m = err instanceof Error ? err.message : String(err);
      consoleErrors.push({ text: `[pageerror] ${m}` });
    });

    page.setDefaultNavigationTimeout(30000);
    await page.goto(HARNESS_URL, { waitUntil: 'networkidle0' });
    await waitForHarnessReady(page);

    for (const caseId of CASES) {
      console.log(`[preservation] running case ${caseId} ...`);
      const r = await runHarnessCase(page, caseId);
      results.push(r);

      const summary: BaselineSummary = {
        caseId: r.caseId,
        ok: r.ok,
        width: r.width,
        height: r.height,
        elapsedMs: Math.round(r.elapsedMs),
        assertion: r.assertion,
        errorMessage: r.errorMessage,
      };

      if (r.ok && r.dataUrlBase64 && r.sha256) {
        const pngBuffer = Buffer.from(r.dataUrlBase64, 'base64');
        // Runner 自己独立算一次 sha256，和 harness 返回的对比（冗余校验）
        const runnerSha256 = createHash('sha256').update(pngBuffer).digest('hex');
        if (runnerSha256 !== r.sha256) {
          summary.ok = false;
          summary.errorMessage = `sha256 mismatch: harness=${r.sha256}, runner=${runnerSha256}`;
          console.error(`[preservation] ${r.caseId} ❌ sha256 mismatch`);
        } else {
          const pngPath = path.join(BASELINE_DIR, `${r.caseId}.png`);
          const shaPath = path.join(BASELINE_DIR, `${r.caseId}.sha256`);
          // 所有浏览器 case 完成后再落盘；否则 Vite 会因 fixture 变化刷新 harness，
          // 破坏下一次 page.evaluate 的 execution context。
          pendingWrites.push({ pngPath, shaPath, pngBuffer, sha256: r.sha256 });
          summary.sizeBytes = pngBuffer.byteLength;
          summary.sha256 = r.sha256;
          summary.sha256Short = r.sha256.slice(0, 12);
          console.log(
            `[preservation] ${r.caseId} ✅ ${r.width}x${r.height}, ${pngBuffer.byteLength} bytes, sha256=${r.sha256.slice(0, 12)}..., elapsed=${Math.round(r.elapsedMs)}ms`,
          );
          console.log(`  → queued ${path.relative(REPO_ROOT, pngPath)}`);
        }
      } else if (r.assertion) {
        console.error(`[preservation] ${r.caseId} ❌ 前置断言失败（命中 oklch）: ${r.assertion}`);
      } else {
        console.error(`[preservation] ${r.caseId} ❌ ok=false, errorMessage=${r.errorMessage ?? '(none)'}`);
      }

      summaries.push(summary);
    }

    for (const pending of pendingWrites) {
      fs.writeFileSync(pending.pngPath, pending.pngBuffer);
      fs.writeFileSync(pending.shaPath, pending.sha256 + '\n', 'utf8');
    }
  } finally {
    if (browser) await browser.close();
  }

  // 汇总表
  console.log('\n[preservation] === 汇总 ===');
  console.log(
    '| caseId | ok | 宽x高 | size (bytes) | sha256 前12位 | elapsed (ms) |',
  );
  console.log('|--------|----|-------|--------------|---------------|--------------|');
  for (const s of summaries) {
    const size = typeof s.sizeBytes === 'number' ? String(s.sizeBytes) : '-';
    const dims = s.width && s.height ? `${s.width}x${s.height}` : '-';
    const sha = s.sha256Short ?? '-';
    console.log(`| ${s.caseId} | ${s.ok ? '✅' : '❌'} | ${dims} | ${size} | ${sha} | ${s.elapsedMs} |`);
  }

  if (consoleErrors.length > 0) {
    console.log('\n[preservation] === 浏览器控制台错误/警告（仅参考） ===');
    for (const e of consoleErrors.slice(0, 20)) console.log(e.text);
    if (consoleErrors.length > 20) console.log(`... (${consoleErrors.length - 20} more)`);
  }

  console.log('\n[preservation] === 原始结果 JSON ===');
  // 注意：dataUrlBase64 很长，打印 JSON 时剥掉只保留长度信息，避免日志爆炸
  const trimmed = results.map((r) => ({
    ...r,
    dataUrlBase64: r.dataUrlBase64 ? `[base64 length=${r.dataUrlBase64.length}]` : undefined,
  }));
  console.log(JSON.stringify(trimmed, null, 2));

  const allOk = summaries.every((s) => s.ok);
  if (!allOk) {
    console.error('\n[preservation] ❌ 至少一个 case 未生成 baseline。');
    process.exitCode = 1;
  } else {
    console.log('\n[preservation] ✅ 所有 case baseline 已生成。');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('[preservation] 顶层异常：', err);
  process.exitCode = 1;
});
