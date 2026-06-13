import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const {
  buildDailyEchoPromptSet,
  countDailyEchoAnchorHits,
  extractDiaryEchoAnchors,
  validateDailyEchoContent,
} = await import('../src/services/aiService.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'daily-echo-eval');
const artifactsRoot = path.join(repoRoot, 'artifacts', 'echo-prompt-evals');

dotenv.config({ path: path.join(repoRoot, 'server', '.env') });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const dryRun = args.has('--dry-run');
const apiBaseArg = process.argv.find((arg) => arg.startsWith('--api-base='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const apiBase = (apiBaseArg?.split('=').slice(1).join('=') || process.env.ECHO_EVAL_API_BASE || 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const accessToken = process.env.ECHO_EVAL_ACCESS_TOKEN || '';
const xiaomiBaseUrl = (process.env.ECHO_EVAL_XIAOMI_BASE_URL || process.env.XIAOMI_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1').replace(/\/$/, '');
const xiaomiApiKey = process.env.ECHO_EVAL_XIAOMI_API_KEY || process.env.XIAOMI_API_KEY || process.env.AI_API_KEY || '';
const xiaomiModel = process.env.ECHO_EVAL_XIAOMI_MODEL || process.env.XIAOMI_MODEL || 'mimo-v2.5';
const useDirectXiaomi = Boolean(xiaomiApiKey);
const shouldCallModel = (useDirectXiaomi || Boolean(accessToken)) && !dryRun;
const modelMode = shouldCallModel ? (useDirectXiaomi ? 'direct-xiaomi' : 'authenticated-api') : 'prompt-only';
const maxCases = Number(limitArg?.split('=')[1] || (quick ? 8 : 0));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(artifactsRoot, runId);

function loadJsonl(filePath) {
  return fs.readFile(filePath, 'utf8')
    .then((text) => text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`${filePath}:${index + 1} is not valid JSONL: ${error.message}`);
        }
      }));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCase(raw, suite) {
  return {
    id: String(raw.id || `${suite}-${Math.random().toString(36).slice(2)}`),
    suite,
    diaryText: String(raw.diaryText || ''),
    diaryDate: String(raw.diaryDate || new Date().toISOString().slice(0, 10)),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    expectedAnchors: Array.isArray(raw.expectedAnchors) ? raw.expectedAnchors.map(String) : [],
    mustNotContain: Array.isArray(raw.mustNotContain) ? raw.mustNotContain.map(String) : [],
    notes: String(raw.notes || ''),
  };
}

async function requestCompletion(promptSet) {
  if (useDirectXiaomi) {
    return requestDirectXiaomiCompletion(promptSet);
  }

  const response = await fetch(`${apiBase}/chat/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      modelId: promptSet.modelId,
      temperature: promptSet.temperature,
      maxTokens: promptSet.maxTokens,
      messages: [
        { role: 'system', content: promptSet.systemPrompt },
        { role: 'user', content: promptSet.userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${body.slice(0, 300)}`.trim());
  }

  return response.json();
}

function buildXiaomiCompletionUrl() {
  if (xiaomiBaseUrl.endsWith('/chat/completions')) return xiaomiBaseUrl;
  return `${xiaomiBaseUrl}/chat/completions`;
}

async function requestDirectXiaomiCompletion(promptSet, overrides = {}) {
  const response = await fetch(buildXiaomiCompletionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${xiaomiApiKey}`,
    },
    body: JSON.stringify({
      model: xiaomiModel,
      temperature: overrides.temperature ?? promptSet.temperature,
      max_tokens: overrides.maxTokens ?? promptSet.maxTokens,
      response_format: overrides.responseFormat,
      messages: overrides.messages ?? [
        { role: 'system', content: promptSet.systemPrompt },
        { role: 'user', content: promptSet.userPrompt },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`xiaomi HTTP ${response.status} ${body.slice(0, 300)}`.trim());
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || '',
    finishReason: choice?.finish_reason || null,
  };
}

async function requestJudge(testCase, baseline, candidate) {
  if (!shouldCallModel || !baseline.output || !candidate.output) return heuristicJudge(baseline, candidate);

  const judgePrompt = `你是小象回声 prompt 评测员。请只输出 JSON，不要输出 Markdown。

任务：比较同一篇日记下 baseline 和 candidate 两个回声哪个更好。

评分维度每项 1-5：
- grounding：贴近日记真实细节
- insight：洞察深度
- tone：温柔分寸
- naturalness：自然表达
- privacy：隐私安全
- completeness：完成度

pairwise 只能是 baseline_win、candidate_win、tie、both_fail。
reasonTags 从 not_grounded、too_vague、memory_leak、too_report_like、too_long、format_error、better_insight、better_grounding、better_tone 中选择 1-4 个。

日记：
${testCase.diaryText}

baseline：
${baseline.output}

candidate：
${candidate.output}

JSON 形状：
{"pairwise":"tie","baselineScores":{"grounding":3,"insight":3,"tone":3,"naturalness":3,"privacy":3,"completeness":3},"candidateScores":{"grounding":3,"insight":3,"tone":3,"naturalness":3,"privacy":3,"completeness":3},"reasonTags":["better_grounding"],"reason":"一句中文原因"}`;

  try {
    if (useDirectXiaomi) {
      const data = await requestDirectXiaomiCompletion(baseline.promptSet, {
        temperature: 0,
        maxTokens: 600,
        responseFormat: { type: 'json_object' },
        messages: [{ role: 'user', content: judgePrompt }],
      });
      return normalizeJudge(JSON.parse(extractJsonObject(data.content || '')), false);
    }

    const response = await fetch(`${apiBase}/chat/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        modelId: baseline.promptSet.modelId,
        temperature: 0,
        maxTokens: 600,
        responseFormat: { type: 'json_object' },
        messages: [{ role: 'user', content: judgePrompt }],
      }),
    });
    if (!response.ok) throw new Error(`judge HTTP ${response.status}`);
    const data = await response.json();
    return normalizeJudge(JSON.parse(extractJsonObject(data.content || '')), false);
  } catch (error) {
    const fallback = heuristicJudge(baseline, candidate);
    return { ...fallback, judgeError: error instanceof Error ? error.message : String(error) };
  }
}

function extractJsonObject(value) {
  const trimmed = String(value || '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return trimmed;
  return trimmed.slice(first, last + 1);
}

function scoreSum(scores) {
  return Object.values(scores || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function defaultScores(pass) {
  const value = pass ? 3 : 1;
  return {
    grounding: value,
    insight: value,
    tone: value,
    naturalness: value,
    privacy: value,
    completeness: value,
  };
}

function normalizeJudge(raw, heuristic = false) {
  const allowed = new Set(['baseline_win', 'candidate_win', 'tie', 'both_fail']);
  const pairwise = allowed.has(raw?.pairwise) ? raw.pairwise : 'tie';
  return {
    pairwise,
    baselineScores: normalizeScores(raw?.baselineScores),
    candidateScores: normalizeScores(raw?.candidateScores),
    reasonTags: Array.isArray(raw?.reasonTags) ? raw.reasonTags.map(String).slice(0, 4) : [],
    reason: String(raw?.reason || ''),
    heuristic,
  };
}

function normalizeScores(scores) {
  const keys = ['grounding', 'insight', 'tone', 'naturalness', 'privacy', 'completeness'];
  return Object.fromEntries(keys.map((key) => [key, Math.max(1, Math.min(5, Number(scores?.[key] || 1)))]));
}

function heuristicJudge(baseline, candidate) {
  const baselineScores = defaultScores(baseline.validation.pass);
  const candidateScores = defaultScores(candidate.validation.pass);

  if (baseline.validation.pass) {
    baselineScores.grounding = Math.min(5, baselineScores.grounding + Math.min(2, baseline.anchorHits));
    baselineScores.completeness = baseline.charCount > 40 ? 4 : baselineScores.completeness;
  }
  if (candidate.validation.pass) {
    candidateScores.grounding = Math.min(5, candidateScores.grounding + Math.min(2, candidate.anchorHits));
    candidateScores.completeness = candidate.charCount > 40 ? 4 : candidateScores.completeness;
  }
  if (baseline.validation.reason === 'memory-leak') baselineScores.privacy = 1;
  if (candidate.validation.reason === 'memory-leak') candidateScores.privacy = 1;

  let pairwise = 'tie';
  if (baseline.validation.pass && !candidate.validation.pass) pairwise = 'baseline_win';
  else if (!baseline.validation.pass && candidate.validation.pass) pairwise = 'candidate_win';
  else if (!baseline.validation.pass && !candidate.validation.pass) pairwise = 'both_fail';
  else if (scoreSum(candidateScores) > scoreSum(baselineScores) + 1) pairwise = 'candidate_win';
  else if (scoreSum(baselineScores) > scoreSum(candidateScores) + 1) pairwise = 'baseline_win';

  return normalizeJudge({
    pairwise,
    baselineScores,
    candidateScores,
    reasonTags: [baseline.validation.reason, candidate.validation.reason].filter(Boolean),
    reason: shouldCallModel ? 'LLM judge 不可用，已回退到启发式评分。' : '未配置小米模型 key，使用 prompt-only/启发式评估。',
  }, true);
}

function hardValidate(output, testCase, finishReason) {
  if (!output) {
    return { pass: false, reason: shouldCallModel ? 'empty-output' : 'not-run', content: '' };
  }

  const forbidden = testCase.mustNotContain.find((term) => term && output.includes(term));
  if (forbidden) {
    return { pass: false, reason: `must-not-contain:${forbidden}`, content: '' };
  }

  const validation = validateDailyEchoContent(output, testCase.diaryText, finishReason);
  return {
    pass: Boolean(validation.content),
    reason: validation.reason || '',
    content: validation.content || '',
  };
}

async function evaluateVersion(version, testCase) {
  const promptSet = buildDailyEchoPromptSet(version, {
    diaryText: testCase.diaryText,
    diaryDate: testCase.diaryDate,
    regenerateCount: 0,
    retryReason: '',
    attempt: 0,
  });

  if (!shouldCallModel) {
    return {
      version,
      promptSet,
      output: '',
      finishReason: null,
      requestError: '',
      validation: hardValidate('', testCase),
      anchors: extractDiaryEchoAnchors(testCase.diaryText),
      anchorHits: 0,
      charCount: 0,
    };
  }

  try {
    const result = await requestCompletion(promptSet);
    const output = String(result.content || '');
    const anchors = extractDiaryEchoAnchors(testCase.diaryText);
    return {
      version,
      promptSet,
      output,
      finishReason: result.finishReason || null,
      requestError: '',
      validation: hardValidate(output, testCase, result.finishReason),
      anchors,
      anchorHits: countDailyEchoAnchorHits(output, anchors),
      charCount: [...output].length,
    };
  } catch (error) {
    return {
      version,
      promptSet,
      output: '',
      finishReason: null,
      requestError: error instanceof Error ? error.message : String(error),
      validation: { pass: false, reason: 'request-failed', content: '' },
      anchors: extractDiaryEchoAnchors(testCase.diaryText),
      anchorHits: 0,
      charCount: 0,
    };
  }
}

function sortPriority(row) {
  if (row.baseline.validation.pass && !row.candidate.validation.pass) return 1;
  if (row.judge.pairwise === 'baseline_win') return 2;
  if (!row.baseline.validation.pass && !row.candidate.validation.pass) return 3;
  if (row.baseline.charCount > 0 && row.candidate.charCount > row.baseline.charCount * 1.15) return 4;
  if (row.judge.pairwise === 'candidate_win') return 5;
  return 9;
}

function summarize(rows) {
  const suites = [...new Set(rows.map((row) => row.case.suite))];
  const bySuite = Object.fromEntries(suites.map((suite) => [suite, summarizeRows(rows.filter((row) => row.case.suite === suite))]));
  const all = summarizeRows(rows);
  return {
    runId,
    generatedAt: new Date().toISOString(),
    mode: modelMode,
    apiBase,
    quick,
    caseCount: rows.length,
    all,
    bySuite,
    adoption: buildAdoptionSummary(all, bySuite),
  };
}

function summarizeRows(rows) {
  const count = rows.length || 1;
  const tally = (key, value) => rows.filter((row) => row.judge[key] === value).length;
  const avg = (selector) => rows.reduce((sum, row) => sum + selector(row), 0) / count;
  const baselinePass = rows.filter((row) => row.baseline.validation.pass).length;
  const candidatePass = rows.filter((row) => row.candidate.validation.pass).length;

  return {
    cases: rows.length,
    baselinePass,
    candidatePass,
    baselinePassRate: baselinePass / count,
    candidatePassRate: candidatePass / count,
    baselineWin: tally('pairwise', 'baseline_win'),
    candidateWin: tally('pairwise', 'candidate_win'),
    tie: tally('pairwise', 'tie'),
    bothFail: tally('pairwise', 'both_fail'),
    avgBaselineChars: avg((row) => row.baseline.charCount),
    avgCandidateChars: avg((row) => row.candidate.charCount),
    avgBaselineInsight: avg((row) => row.judge.baselineScores.insight),
    avgCandidateInsight: avg((row) => row.judge.candidateScores.insight),
    avgBaselineGrounding: avg((row) => row.judge.baselineScores.grounding),
    avgCandidateGrounding: avg((row) => row.judge.candidateScores.grounding),
    avgBaselineTone: avg((row) => row.judge.baselineScores.tone),
    avgCandidateTone: avg((row) => row.judge.candidateScores.tone),
    avgBaselinePrivacy: avg((row) => row.judge.baselineScores.privacy),
    avgCandidatePrivacy: avg((row) => row.judge.candidateScores.privacy),
  };
}

function buildAdoptionSummary(all, bySuite) {
  const boundary = bySuite.boundary || {};
  const sample = bySuite.sample || {};
  const lengthGrowth = all.avgBaselineChars > 0
    ? (all.avgCandidateChars - all.avgBaselineChars) / all.avgBaselineChars
    : 0;
  const sampleWinDelta = sample.cases
    ? ((sample.candidateWin || 0) - (sample.baselineWin || 0)) / sample.cases
    : 0;
  const checks = [
    {
      label: 'boundary 硬闸不退化',
      pass: (boundary.candidatePassRate ?? 0) >= (boundary.baselinePassRate ?? 0),
    },
    {
      label: '真实分布胜率提升至少 10 个百分点',
      pass: sampleWinDelta >= 0.1,
    },
    {
      label: '洞察深度平均分提升至少 0.3',
      pass: all.avgCandidateInsight - all.avgBaselineInsight >= 0.3,
    },
    {
      label: '贴近日记、温柔分寸、隐私安全不下降',
      pass: all.avgCandidateGrounding >= all.avgBaselineGrounding
        && all.avgCandidateTone >= all.avgBaselineTone
        && all.avgCandidatePrivacy >= all.avgBaselinePrivacy,
    },
    {
      label: 'candidate 平均长度增长不超过 15%',
      pass: lengthGrowth <= 0.15,
    },
  ];

  return {
    readyToPromote: shouldCallModel && checks.every((check) => check.pass),
    checks,
    lengthGrowth,
    sampleWinDelta,
  };
}

function renderMetric(label, value) {
  const text = typeof value === 'number' ? value.toFixed(value <= 1 ? 2 : 1) : value;
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
}

function renderReport(rows, summary) {
  const sortedRows = [...rows].sort((a, b) => sortPriority(a) - sortPriority(b));
  const modeNote = shouldCallModel
    ? `已真实调用模型生成 baseline/candidate，并尝试 LLM judge。调用模式：${modelMode}。`
    : '未配置小米模型 key，本次是 prompt-only 报告：可检查 prompt 版本、fixture 和报告结构，不能据此决定上线。';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小象回声 Prompt 实验台 ${escapeHtml(runId)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #263126; background: #f7f4ec; }
    header { padding: 28px 36px 18px; background: #fffaf0; border-bottom: 1px solid #ded7ca; }
    h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: 0; }
    h2 { margin: 26px 0 12px; font-size: 18px; }
    main { padding: 20px 36px 48px; }
    .note { color: #5d6659; line-height: 1.7; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 18px 0; }
    .metric { padding: 12px 14px; background: #fff; border: 1px solid #ddd5c5; border-radius: 8px; }
    .metric span { display: block; color: #697064; font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 20px; }
    .checks { display: grid; gap: 8px; margin: 16px 0 24px; }
    .check { padding: 10px 12px; border-radius: 8px; background: #fff; border: 1px solid #ddd5c5; }
    .pass { color: #2f6b3d; }
    .fail { color: #9a3c2f; }
    .case { margin: 18px 0; padding: 18px; background: #fff; border: 1px solid #ddd5c5; border-radius: 8px; }
    .case-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; justify-content: space-between; }
    .case-title { font-weight: 700; }
    .tags { color: #6d6f67; font-size: 12px; }
    .diary { white-space: pre-wrap; margin: 12px 0; padding: 12px; background: #f8f7f3; border-left: 3px solid #bb8067; line-height: 1.65; }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .out { min-height: 130px; padding: 12px; background: #fbfbf8; border: 1px solid #e5dfd2; border-radius: 8px; white-space: pre-wrap; line-height: 1.65; }
    .small { color: #687062; font-size: 12px; line-height: 1.6; }
    .judge { margin-top: 12px; padding: 12px; background: #f4f7f1; border-radius: 8px; }
    code { background: #eee8db; padding: 2px 5px; border-radius: 4px; }
    @media (max-width: 860px) { main, header { padding-left: 16px; padding-right: 16px; } .cols { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>小象回声 Prompt 实验台</h1>
    <div class="note">${escapeHtml(modeNote)}</div>
    <div class="small">Run: <code>${escapeHtml(runId)}</code> | API: <code>${escapeHtml(apiBase)}</code></div>
  </header>
  <main>
    <h2>总览</h2>
    <div class="metrics">
      ${renderMetric('case 数', summary.caseCount)}
      ${renderMetric('baseline 通过率', summary.all.baselinePassRate)}
      ${renderMetric('candidate 通过率', summary.all.candidatePassRate)}
      ${renderMetric('candidate win', summary.all.candidateWin)}
      ${renderMetric('baseline win', summary.all.baselineWin)}
      ${renderMetric('both fail', summary.all.bothFail)}
      ${renderMetric('洞察分变化', summary.all.avgCandidateInsight - summary.all.avgBaselineInsight)}
      ${renderMetric('长度增长', summary.adoption.lengthGrowth)}
    </div>

    <h2>采用标准</h2>
    <div class="checks">
      ${summary.adoption.checks.map((check) => `<div class="check ${check.pass ? 'pass' : 'fail'}">${check.pass ? 'PASS' : 'FAIL'} · ${escapeHtml(check.label)}</div>`).join('')}
      <div class="check ${summary.adoption.readyToPromote ? 'pass' : 'fail'}">${summary.adoption.readyToPromote ? '可以进入人工抽检' : '暂不建议提升 candidate'} · ${shouldCallModel ? '基于本次结果' : 'prompt-only 模式不能决策上线'}</div>
    </div>

    <h2>Case 对比</h2>
    ${sortedRows.map((row) => renderCase(row)).join('')}
  </main>
</body>
</html>`;
}

function renderCase(row) {
  return `<section class="case">
    <div class="case-head">
      <div class="case-title">${escapeHtml(row.case.id)} <span class="tags">${escapeHtml(row.case.suite)} · ${escapeHtml(row.case.tags.join(', '))}</span></div>
      <div class="small">pairwise: <code>${escapeHtml(row.judge.pairwise)}</code></div>
    </div>
    <div class="diary">${escapeHtml(row.case.diaryText)}</div>
    <div class="cols">
      ${renderVersion('baseline', row.baseline)}
      ${renderVersion('candidate', row.candidate)}
    </div>
    <div class="judge">
      <div><strong>Judge:</strong> ${escapeHtml(row.judge.reason || '')}</div>
      <div class="small">tags: ${escapeHtml(row.judge.reasonTags.join(', ') || 'none')} ${row.judge.heuristic ? '· heuristic' : ''} ${row.judge.judgeError ? `· judgeError: ${escapeHtml(row.judge.judgeError)}` : ''}</div>
      <div class="small">baseline scores: ${escapeHtml(JSON.stringify(row.judge.baselineScores))}</div>
      <div class="small">candidate scores: ${escapeHtml(JSON.stringify(row.judge.candidateScores))}</div>
    </div>
  </section>`;
}

function renderVersion(label, result) {
  const passText = result.validation.pass ? 'PASS' : `FAIL ${result.validation.reason || ''}`;
  return `<div>
    <h3>${escapeHtml(label)}</h3>
    <div class="small">${escapeHtml(passText)} · anchors ${result.anchorHits}/${result.anchors.length} · chars ${result.charCount}${result.requestError ? ` · ${escapeHtml(result.requestError)}` : ''}</div>
    <div class="out">${escapeHtml(result.output || '未生成。配置 ECHO_EVAL_ACCESS_TOKEN 后会真实调用模型。')}</div>
  </div>`;
}

async function main() {
  const boundary = (await loadJsonl(path.join(fixtureDir, 'boundary.jsonl'))).map((item) => normalizeCase(item, 'boundary'));
  const sample = (await loadJsonl(path.join(fixtureDir, 'sample.redacted.jsonl'))).map((item) => normalizeCase(item, 'sample'));
  let cases = [...boundary, ...sample];
  if (maxCases > 0) cases = cases.slice(0, maxCases);

  await fs.mkdir(outDir, { recursive: true });

  const rows = [];
  for (const testCase of cases) {
    console.log(`[echo-eval] ${testCase.id}`);
    const baseline = await evaluateVersion('baseline', testCase);
    const candidate = await evaluateVersion('candidate', testCase);
    const judge = await requestJudge(testCase, baseline, candidate);
    rows.push({ case: testCase, baseline, candidate, judge });
  }

  const summary = summarize(rows);
  await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'cases.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await fs.writeFile(path.join(outDir, 'report.html'), renderReport(rows, summary), 'utf8');

  console.log(`[echo-eval] mode=${summary.mode}`);
  console.log(`[echo-eval] report=${path.join(outDir, 'report.html')}`);
  console.log(`[echo-eval] candidateWin=${summary.all.candidateWin} baselineWin=${summary.all.baselineWin} bothFail=${summary.all.bothFail}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
