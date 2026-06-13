import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  DAILY_ECHO_SYSTEM_PROMPT,
  CANDIDATE_DAILY_ECHO_SYSTEM_PROMPT,
  buildDailyEchoPromptSet,
  countDailyEchoAnchorHits,
  extractDiaryEchoAnchors,
  validateDailyEchoContent,
} = await import('../../src/services/aiService.ts');

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(__dirname, '..', '..');
export const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'daily-echo-eval');
export const researchRoot = path.join(repoRoot, 'artifacts', 'echo-prompt-research');
export const runsRoot = path.join(researchRoot, 'runs');
export const datasetsRoot = path.join(researchRoot, 'datasets');
export const promptHistoryRoot = path.join(researchRoot, 'prompt-history');
export const manualDatasetPath = path.join(datasetsRoot, 'manual.jsonl');

dotenv.config({ path: path.join(repoRoot, 'server', '.env') });
dotenv.config({ path: path.join(repoRoot, '.env'), override: false });

const xiaomiBaseUrl = (process.env.ECHO_RESEARCH_XIAOMI_BASE_URL || process.env.XIAOMI_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1').replace(/\/$/, '');
const xiaomiApiKey = process.env.ECHO_RESEARCH_XIAOMI_API_KEY || process.env.XIAOMI_API_KEY || process.env.AI_API_KEY || '';
const xiaomiModel = process.env.ECHO_RESEARCH_XIAOMI_MODEL || process.env.XIAOMI_MODEL || 'mimo-v2.5';
const requestTimeoutMs = Number(process.env.ECHO_RESEARCH_TIMEOUT_MS || 90000);

export const dimensions = [
  { id: 'grounding', name: '贴近日记', weight: 1, description: '回应日记里的真实细节，而不是空泛安慰。' },
  { id: 'insight', name: '洞察深度', weight: 1, description: '帮助用户理解今天的自己，提供新的自我理解。' },
  { id: 'tone', name: '温柔分寸', weight: 1, description: '安静、克制、不说教、不诊断。' },
  { id: 'naturalness', name: '自然表达', weight: 1, description: '像小象回声，不像分析报告、清单或提示词痕迹。' },
  { id: 'privacy', name: '隐私安全', weight: 1, description: '不泄漏记忆、画像、长期洞察或内部字段。' },
  { id: 'completeness', name: '完成度', weight: 1, description: '格式完整、长度合适、没有半句、没有 Markdown 或列表。' },
];

const hardMemoryLeakPatterns = [
  '我记得你',
  '之前你',
  '根据你的长期洞察',
  '长期洞察',
  '用户画像',
  '近期记忆',
  '系统看到',
  '档案显示',
];

export function getDefaultOptions() {
  return {
    rounds: 50,
    dataset: 'sample',
    limit: 10,
    target: 4.6,
    patience: 8,
    seedPrompt: 'baseline',
    promptFile: '',
    seedPromptText: '',
    dryRun: false,
    dryRunRegressAt: 0,
  };
}

export function parseArgs(argv) {
  const args = getDefaultOptions();
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--rounds=')) args.rounds = Number(arg.slice('--rounds='.length));
    else if (arg.startsWith('--dataset=')) args.dataset = arg.slice('--dataset='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--target=')) args.target = Number(arg.slice('--target='.length));
    else if (arg.startsWith('--patience=')) args.patience = Number(arg.slice('--patience='.length));
    else if (arg.startsWith('--seed-prompt=')) args.seedPrompt = arg.slice('--seed-prompt='.length);
    else if (arg.startsWith('--prompt-file=')) args.promptFile = arg.slice('--prompt-file='.length);
    else if (arg.startsWith('--dry-run-regress-at=')) args.dryRunRegressAt = Number(arg.slice('--dry-run-regress-at='.length));
  }
  return normalizeOptions(args);
}

export function normalizeOptions(raw = {}) {
  const defaults = getDefaultOptions();
  return {
    ...defaults,
    ...raw,
    rounds: Math.max(0, Number(raw.rounds ?? defaults.rounds)),
    limit: Math.max(0, Number(raw.limit ?? defaults.limit)),
    target: Number(raw.target ?? defaults.target),
    patience: Math.max(1, Number(raw.patience ?? defaults.patience)),
    dataset: String(raw.dataset || defaults.dataset),
    seedPrompt: String(raw.seedPrompt || defaults.seedPrompt),
    promptFile: String(raw.promptFile || ''),
    seedPromptText: String(raw.seedPromptText || ''),
    dryRun: Boolean(raw.dryRun),
    dryRunRegressAt: Math.max(0, Number(raw.dryRunRegressAt || 0)),
    ...(raw.runId ? { runId: String(raw.runId) } : {}),
  };
}

export function getSeedPromptTemplates() {
  return {
    baseline: DAILY_ECHO_SYSTEM_PROMPT,
    candidate: CANDIDATE_DAILY_ECHO_SYSTEM_PROMPT,
  };
}

function buildCompletionUrl() {
  if (xiaomiBaseUrl.endsWith('/chat/completions')) return xiaomiBaseUrl;
  return `${xiaomiBaseUrl}/chat/completions`;
}

async function requestXiaomi({ messages, temperature = 0.4, maxTokens = 1200, responseFormat }) {
  if (!xiaomiApiKey) throw new Error('缺少 XIAOMI_API_KEY 或 AI_API_KEY，无法真实调用模型。可使用 --dry-run 验证流程。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(buildCompletionUrl(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${xiaomiApiKey}`,
      },
      body: JSON.stringify({
        model: xiaomiModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat,
        stream: false,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`小米模型 HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = await response.json();
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      finishReason: choice?.finish_reason || null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`模型请求超时，已中断（${Math.round(requestTimeoutMs / 1000)} 秒）`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function loadJsonl(filePath) {
  if (!fsSync.existsSync(filePath)) return [];
  return fsSync.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1} 不是合法 JSONL: ${error.message}`);
      }
    });
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
    referenceEcho: String(raw.referenceEcho || ''),
    mustHit: Array.isArray(raw.mustHit) ? raw.mustHit.map(String) : [],
    mustAvoid: Array.isArray(raw.mustAvoid) ? raw.mustAvoid.map(String) : [],
    rubricNotes: String(raw.rubricNotes || raw.notes || ''),
  };
}

export function loadCases(dataset, limit = 0) {
  const boundary = loadJsonl(path.join(fixtureDir, 'boundary.jsonl')).map((item) => normalizeCase(item, 'boundary'));
  const sample = loadJsonl(path.join(fixtureDir, 'sample.redacted.jsonl')).map((item) => normalizeCase(item, 'sample'));
  const expanded = loadJsonl(path.join(fixtureDir, 'expanded.redacted.jsonl')).map((item) => normalizeCase(item, 'expanded'));
  const manual = loadJsonl(manualDatasetPath).map((item) => normalizeCase(item, 'manual'));
  let cases;
  if (dataset === 'quick') cases = [...boundary, ...sample].slice(0, Math.max(1, limit || 2));
  else if (dataset === 'boundary') cases = boundary;
  else if (dataset === 'sample') cases = sample;
  else if (dataset === 'expanded') cases = expanded.length ? expanded : sample;
  else if (dataset === 'manual') cases = manual;
  else cases = [...boundary, ...sample, ...expanded, ...manual];
  if (!cases.length) throw new Error(`评测集 ${dataset} 为空`);
  return limit > 0 ? cases.slice(0, limit) : cases;
}

export async function getDatasetStats() {
  const names = ['quick', 'boundary', 'sample', 'expanded', 'manual', 'all'];
  return names.map((name) => {
    try {
      return { name, count: loadCases(name, 0).length };
    } catch {
      return { name, count: 0 };
    }
  });
}

export async function saveManualSamples(payload) {
  await fs.mkdir(datasetsRoot, { recursive: true });
  const entries = [];
  if (Array.isArray(payload?.items)) {
    entries.push(...payload.items);
  } else {
    entries.push(payload || {});
  }
  const records = entries
    .map((entry) => ({
      id: `manual-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 7)}`,
      diaryText: String(entry.diaryText || '').trim(),
      diaryDate: String(entry.diaryDate || new Date().toISOString().slice(0, 10)),
      referenceEcho: String(entry.referenceEcho || '').trim(),
      rubricNotes: String(entry.rubricNotes || entry.notes || '').trim(),
      tags: ['manual'],
    }))
    .filter((entry) => entry.diaryText);
  if (!records.length) throw new Error('请先填写日记正文');
  await fs.appendFile(manualDatasetPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
  return { saved: records.length, path: manualDatasetPath };
}

function buildPromptSet(prompt, testCase) {
  const base = buildDailyEchoPromptSet('baseline', {
    diaryText: testCase.diaryText,
    diaryDate: testCase.diaryDate,
    regenerateCount: 0,
    retryReason: '',
    attempt: 0,
  });
  return { ...base, systemPrompt: prompt };
}

async function loadSeedPrompt(options) {
  if (options.seedPrompt === 'text' || options.seedPrompt === 'custom') {
    const prompt = String(options.seedPromptText || '').trim();
    if (!prompt) throw new Error('选择自定义原始 prompt 时，必须填写 prompt 内容');
    return prompt;
  }
  if (options.seedPrompt.startsWith('file:')) {
    return fs.readFile(path.resolve(repoRoot, options.seedPrompt.slice('file:'.length)), 'utf8');
  }
  if (options.seedPrompt === 'file') {
    if (!options.promptFile) throw new Error('--seed-prompt=file 需要同时提供 --prompt-file=路径');
    return fs.readFile(path.resolve(repoRoot, options.promptFile), 'utf8');
  }
  if (options.seedPrompt === 'candidate') return CANDIDATE_DAILY_ECHO_SYSTEM_PROMPT;
  return DAILY_ECHO_SYSTEM_PROMPT;
}

function extractJsonObject(value) {
  const text = String(value || '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

function hardValidate(output, testCase, finishReason) {
  if (!output) return { pass: false, reason: 'empty-output', text: '输出为空' };
  if (finishReason === 'length') return { pass: false, reason: 'truncated', text: '模型输出被截断' };
  const forbidden = [...testCase.mustNotContain, ...testCase.mustAvoid, ...hardMemoryLeakPatterns]
    .find((term) => term && output.includes(term));
  if (forbidden) return { pass: false, reason: 'privacy-leak', text: `命中禁用表达：${forbidden}` };
  const validation = validateDailyEchoContent(output, testCase.diaryText, finishReason);
  if (!validation.content) return { pass: false, reason: validation.reason || 'quality-gate-failed', text: validation.reason || '质量硬闸失败' };
  return { pass: true, reason: '', text: '' };
}

async function generateEcho(prompt, testCase, options) {
  const promptSet = buildPromptSet(prompt, testCase);
  if (options.dryRun) {
    if (prompt.includes('DRY_RUN_FORCE_TRUNCATED')) {
      return {
        output: '这是一段故意触发截断的 dry-run 输出',
        finishReason: 'length',
        promptSet,
        roleIsolation: 'generator: prompt + diary only',
      };
    }
    const anchors = extractDiaryEchoAnchors(testCase.diaryText).slice(0, 2).join('、') || '今天的感受';
    return {
      output: `${anchors}在这一页里被认真留下了，小象先陪你把它轻轻放稳。`,
      finishReason: null,
      promptSet,
      roleIsolation: 'generator: prompt + diary only',
    };
  }
  const result = await requestXiaomi({
    messages: [
      { role: 'system', content: promptSet.systemPrompt },
      { role: 'user', content: promptSet.userPrompt },
    ],
    temperature: promptSet.temperature,
    maxTokens: promptSet.maxTokens,
  });
  return {
    output: String(result.content || ''),
    finishReason: result.finishReason,
    promptSet,
    roleIsolation: 'generator: prompt + diary only',
  };
}

function defaultScores(value) {
  return Object.fromEntries(dimensions.map((dimension) => [dimension.id, value]));
}

function normalizeScores(raw) {
  const scores = {};
  for (const dimension of dimensions) {
    scores[dimension.id] = Math.max(1, Math.min(5, Number(raw?.[dimension.id] || 1)));
  }
  return scores;
}

function weightedScore(scores) {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  return dimensions.reduce((sum, item) => sum + Number(scores[item.id] || 1) * item.weight, 0) / totalWeight;
}

function heuristicJudge(testCase, generated, hardGate, prompt, options) {
  const anchors = extractDiaryEchoAnchors(testCase.diaryText);
  const anchorHits = countDailyEchoAnchorHits(generated.output, anchors);
  const promptBoost = options.dryRun ? Math.min(0.6, (prompt.match(/改进|压缩|具体|密度|边界/g) || []).length * 0.08) : 0;
  const base = hardGate.pass ? Math.min(4.2, 2.8 + anchorHits * 0.35 + promptBoost) : 1;
  const scores = defaultScores(base);
  if (!hardGate.pass) {
    if (hardGate.reason === 'privacy-leak') scores.privacy = 1;
    if (hardGate.reason === 'truncated') scores.completeness = 1;
  }
  return {
    scores,
    score: weightedScore(scores),
    evidenceFromDiary: anchors.slice(0, 3),
    problems: hardGate.pass ? [] : [hardGate.text],
    suggestions: hardGate.pass ? ['继续观察该方向在更大样本上的稳定性。'] : ['先修复硬闸失败，再继续优化表达。'],
    reasonTags: hardGate.pass ? ['heuristic_pass'] : [hardGate.reason],
    judgeUsedPrompt: false,
  };
}

async function judgeOutput(testCase, generated, hardGate, prompt, options) {
  if (!hardGate.pass || options.dryRun) return heuristicJudge(testCase, generated, hardGate, prompt, options);
  const rubricText = dimensions.map((item) => `- ${item.id} / ${item.name}: ${item.description}`).join('\n');
  const promptText = `你是独立评分器。你不能看到、推测或引用生成 prompt；只根据评分标准、原始日记、生成结果和参考答案评分。

评分维度均为 1-5 分：
${rubricText}

原始日记：
${testCase.diaryText}

生成结果：
${generated.output}

参考答案（可为空）：
${testCase.referenceEcho}

必须命中（可为空）：${testCase.mustHit.join('、')}
必须避免（可为空）：${testCase.mustAvoid.join('、')}
补充评分说明：${testCase.rubricNotes}

只输出 JSON：
{
  "scores": {"grounding": 1, "insight": 1, "tone": 1, "naturalness": 1, "privacy": 1, "completeness": 1},
  "evidenceFromDiary": ["日记证据"],
  "problems": ["具体扣分点"],
  "suggestions": ["可执行修改建议"],
  "reasonTags": ["not_grounded|too_vague|memory_leak|too_report_like|too_long|format_error|better_insight"]
}`;
  try {
    const result = await requestXiaomi({
      messages: [{ role: 'user', content: promptText }],
      temperature: 0,
      maxTokens: 900,
      responseFormat: { type: 'json_object' },
    });
    const raw = JSON.parse(extractJsonObject(result.content));
    const scores = normalizeScores(raw.scores);
    return {
      scores,
      score: weightedScore(scores),
      evidenceFromDiary: Array.isArray(raw.evidenceFromDiary) ? raw.evidenceFromDiary.map(String) : [],
      problems: Array.isArray(raw.problems) ? raw.problems.map(String) : [],
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.map(String) : [],
      reasonTags: Array.isArray(raw.reasonTags) ? raw.reasonTags.map(String) : [],
      judgeUsedPrompt: false,
    };
  } catch (error) {
    return {
      ...heuristicJudge(testCase, generated, hardGate, prompt, options),
      judgeError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function evaluatePrompt(prompt, cases, options) {
  const rows = [];
  for (const testCase of cases) {
    let generated;
    try {
      generated = await generateEcho(prompt, testCase, options);
    } catch (error) {
      generated = {
        output: '',
        finishReason: null,
        promptSet: buildPromptSet(prompt, testCase),
        requestError: error instanceof Error ? error.message : String(error),
        roleIsolation: 'generator: prompt + diary only',
      };
    }
    const hardGate = generated.requestError
      ? { pass: false, reason: 'request_failed', text: generated.requestError }
      : hardValidate(generated.output, testCase, generated.finishReason);
    const judge = await judgeOutput(testCase, generated, hardGate, prompt, options);
    rows.push({
      id: testCase.id,
      suite: testCase.suite,
      output: generated.output,
      finishReason: generated.finishReason,
      requestError: generated.requestError || '',
      hardGate,
      judge,
      score: hardGate.pass ? judge.score : Math.min(1.5, judge.score),
      roleIsolation: {
        generator: generated.roleIsolation,
        judge: 'judge: rubric + diary + output + optional reference; prompt hidden',
      },
    });
  }
  const averageScore = rows.reduce((sum, row) => sum + row.score, 0) / (rows.length || 1);
  const hardFailures = rows.filter((row) => !row.hardGate.pass).length;
  const truncated = rows.filter((row) => row.hardGate.reason === 'truncated').length;
  const privacyLeaks = rows.filter((row) => row.hardGate.reason === 'privacy-leak').length;
  const dimensionAverages = {};
  for (const dimension of dimensions) {
    dimensionAverages[dimension.id] = rows.reduce((sum, row) => sum + Number(row.judge.scores?.[dimension.id] || 1), 0) / (rows.length || 1);
  }
  return { averageScore, hardFailures, truncated, privacyLeaks, dimensionAverages, rows };
}

function summarizeFailures(evaluation, includeExamples = false) {
  const tags = new Map();
  const examples = [];
  for (const row of evaluation.rows) {
    for (const tag of row.judge.reasonTags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
    if ((!row.hardGate.pass || row.score < 3.5) && includeExamples) {
      examples.push({
        id: row.id,
        score: row.score,
        reason: row.hardGate.text || row.judge.problems?.[0] || '低分',
        output: row.output.slice(0, 240),
      });
    }
  }
  return {
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    examples: examples.slice(0, 5),
  };
}

async function improvePrompt(bestPrompt, bestEval, context, options) {
  const failures = summarizeFailures(bestEval, true);
  if (options.dryRun) {
    if (options.dryRunRegressAt === context.round) {
      return {
        prompt: `${bestPrompt.trim()}\n\nDRY_RUN_FORCE_TRUNCATED`,
        direction: `dry-run-regress-${context.round}`,
        changeSummary: 'dry-run 故意制造截断失败，用于验证 discard 不覆盖 best。',
      };
    }
    return {
      prompt: `${bestPrompt.trim()}\n\n# Auto Research 改进 ${context.round}: 优先提高信息密度，避免空泛和截断。`,
      direction: `dry-run-improve-${context.round}`,
      changeSummary: 'dry-run 模拟改进：追加一条信息密度规则。',
    };
  }
  const improvePromptText = `你是 Prompt 改进器。你可以看到当前 prompt、独立评分结果和失败样例，但你不能给自己打分。

目标：生成下一版小象回声 system prompt。只输出 JSON。

当前最佳分数：${bestEval.averageScore.toFixed(3)}
硬闸失败数：${bestEval.hardFailures}
截断数：${bestEval.truncated}
隐私泄漏数：${bestEval.privacyLeaks}
维度均分：${JSON.stringify(bestEval.dimensionAverages)}
失败标签：${JSON.stringify(failures.tags)}
失败样例：${JSON.stringify(failures.examples)}
最近被丢弃方向：${context.discardedDirections.slice(-5).join('；') || '无'}

改进原则：
- 不要让 prompt 变成长篇规则堆砌，优先控制在 2-3KB。
- 最重要的 3 条规则放在开头。
- 如果某个方向刚被 discard，不要微调同方向，换路径。
- 覆盖率与简洁性冲突时，优先提高信息密度，而不是简单变长。
- 不要改变任务身份：小象回声仍然是温柔、克制、贴近日记的一段回声。

当前 prompt：
${bestPrompt}

只输出 JSON：
{
  "prompt": "完整新版 system prompt",
  "direction": "本轮改进方向，短句",
  "changeSummary": "具体改了什么"
}`;
  const result = await requestXiaomi({
    messages: [{ role: 'user', content: improvePromptText }],
    temperature: 0.35,
    maxTokens: 2200,
    responseFormat: { type: 'json_object' },
  });
  const parsed = JSON.parse(extractJsonObject(result.content));
  return {
    prompt: String(parsed.prompt || bestPrompt),
    direction: String(parsed.direction || '未说明方向'),
    changeSummary: String(parsed.changeSummary || ''),
  };
}

function shouldKeep(candidateEval, bestEval) {
  return candidateEval.averageScore >= bestEval.averageScore
    && candidateEval.hardFailures <= bestEval.hardFailures
    && candidateEval.privacyLeaks <= bestEval.privacyLeaks;
}

async function appendLine(filePath, line) {
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

function tsvEscape(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function git(args, options = {}) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: options.cwd || promptHistoryRoot,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch (error) {
    if (options.allowFailure) return (error.stdout || error.stderr || '').trim();
    throw error;
  }
}

export async function ensurePromptHistoryRepo() {
  await fs.mkdir(promptHistoryRoot, { recursive: true });
  if (!fsSync.existsSync(path.join(promptHistoryRoot, '.git'))) {
    await git(['init'], { cwd: promptHistoryRoot });
  }
  await git(['config', 'user.name', 'Xiaoxiang Prompt Research'], { cwd: promptHistoryRoot });
  await git(['config', 'user.email', 'prompt-research@local'], { cwd: promptHistoryRoot });
  await fs.mkdir(path.join(promptHistoryRoot, 'versions'), { recursive: true });
  await fs.mkdir(path.join(promptHistoryRoot, 'current'), { recursive: true });
  const readmePath = path.join(promptHistoryRoot, 'README.md');
  if (!fsSync.existsSync(readmePath)) {
    await fs.writeFile(readmePath, '# 小象回声 Prompt History\n\n独立本地 Git 仓库，只保存 prompt 版本和评分摘要，不保存真实日记正文。\n', 'utf8');
  }
  return promptHistoryRoot;
}

function formatVersion(number) {
  return `v${String(number).padStart(3, '0')}`;
}

export async function getNextVersionNumber() {
  await ensurePromptHistoryRepo();
  const versionsDir = path.join(promptHistoryRoot, 'versions');
  const dirs = fsSync.existsSync(versionsDir) ? await fs.readdir(versionsDir, { withFileTypes: true }) : [];
  const max = dirs
    .filter((item) => item.isDirectory() && /^v\d+$/.test(item.name))
    .map((item) => Number(item.name.slice(1)))
    .reduce((current, value) => Math.max(current, value), 0);
  return max + 1;
}

function sanitizeVersionMeta(record) {
  return {
    version: record.version,
    runId: record.runId,
    iteration: record.iteration,
    decision: record.decision,
    dataset: record.dataset,
    caseCount: record.caseCount,
    score: record.score,
    bestScore: record.bestScore,
    scoreDelta: record.scoreDelta,
    hardFailures: record.hardFailures,
    truncated: record.truncated,
    privacyLeaks: record.privacyLeaks,
    promptBytes: record.promptBytes,
    previousVersion: record.previousVersion,
    currentBestVersion: record.currentBestVersion,
    direction: record.direction,
    changeSummary: record.changeSummary,
    dimensionAverages: record.dimensionAverages,
    failureTags: record.failureTags || [],
    roleIsolation: record.roleIsolation,
    createdAt: record.createdAt,
  };
}

export async function writePromptVersion(record) {
  await ensurePromptHistoryRepo();
  const versionDir = path.join(promptHistoryRoot, 'versions', record.version);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.writeFile(path.join(versionDir, 'prompt.txt'), record.prompt, 'utf8');
  await fs.writeFile(path.join(versionDir, 'meta.json'), `${JSON.stringify(sanitizeVersionMeta(record), null, 2)}\n`, 'utf8');
  if (record.updateBest) {
    await fs.writeFile(path.join(promptHistoryRoot, 'current', 'best.prompt.txt'), record.prompt, 'utf8');
    await fs.writeFile(path.join(promptHistoryRoot, 'current', 'best.json'), `${JSON.stringify({
      version: record.version,
      runId: record.runId,
      score: record.score,
      decision: record.decision,
      updatedAt: record.createdAt,
    }, null, 2)}\n`, 'utf8');
  }
  await git(['add', '-A'], { cwd: promptHistoryRoot });
  const message = `${record.version} ${record.decision} score=${record.score.toFixed(3)} dataset=${record.dataset}`;
  await git(['commit', '-m', message], { cwd: promptHistoryRoot });
  const commitHash = await git(['rev-parse', 'HEAD'], { cwd: promptHistoryRoot });
  return commitHash;
}

async function getVersionCommitMap() {
  const output = await git(['log', '--format=commit:%H', '--name-only', '--', 'versions'], { cwd: promptHistoryRoot, allowFailure: true });
  const map = new Map();
  let currentCommit = '';
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('commit:')) {
      currentCommit = line.slice('commit:'.length);
      continue;
    }
    const match = line.match(/^versions\/(v\d+)\/prompt\.txt$/);
    if (match && currentCommit && !map.has(match[1])) map.set(match[1], currentCommit);
  }
  return map;
}

export async function listPromptVersions() {
  await ensurePromptHistoryRepo();
  const versionsDir = path.join(promptHistoryRoot, 'versions');
  const dirs = fsSync.existsSync(versionsDir) ? await fs.readdir(versionsDir, { withFileTypes: true }) : [];
  const commitMap = await getVersionCommitMap();
  const versions = [];
  for (const dir of dirs.filter((item) => item.isDirectory() && /^v\d+$/.test(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const metaPath = path.join(versionsDir, dir.name, 'meta.json');
    if (!fsSync.existsSync(metaPath)) continue;
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    const commitHash = commitMap.get(dir.name) || '';
    versions.push({ ...meta, commitHash });
  }
  return versions;
}

export async function getPromptHistoryState() {
  await ensurePromptHistoryRepo();
  const versions = await listPromptVersions();
  let best = null;
  const bestPath = path.join(promptHistoryRoot, 'current', 'best.json');
  if (fsSync.existsSync(bestPath)) best = JSON.parse(await fs.readFile(bestPath, 'utf8'));
  return {
    root: promptHistoryRoot,
    hasRepo: fsSync.existsSync(path.join(promptHistoryRoot, '.git')),
    versionCount: versions.length,
    best,
    latestVersion: versions.at(-1) || null,
  };
}

export async function getPromptVersionDetail(version) {
  await ensurePromptHistoryRepo();
  if (!/^v\d+$/.test(version)) throw new Error(`版本格式不合法：${version}`);
  const metaPath = path.join(promptHistoryRoot, 'versions', version, 'meta.json');
  if (!fsSync.existsSync(metaPath)) throw new Error(`版本不存在：${version}`);
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  const promptPath = path.join(promptHistoryRoot, 'versions', version, 'prompt.txt');
  const prompt = await fs.readFile(promptPath, 'utf8');
  const previousNumber = Number(version.slice(1)) - 1;
  const previousVersion = previousNumber > 0 ? formatVersion(previousNumber) : '';
  const previousPromptPath = previousVersion ? path.join(promptHistoryRoot, 'versions', previousVersion, 'prompt.txt') : '';
  let diff = '';
  if (previousPromptPath && fsSync.existsSync(previousPromptPath)) {
    diff = await git([
      'diff',
      '--no-index',
      '--no-color',
      `versions/${previousVersion}/prompt.txt`,
      `versions/${version}/prompt.txt`,
    ], { cwd: promptHistoryRoot, allowFailure: true });
  }
  const commitHash = await git(['log', '-n', '1', '--format=%H', '--', `versions/${version}/prompt.txt`], { cwd: promptHistoryRoot, allowFailure: true });
  return {
    ...meta,
    commitHash,
    prompt,
    previousVersion,
    diff,
  };
}

function buildCurveSvg(iterations) {
  if (!iterations.length) return '';
  const width = 880;
  const height = 260;
  const pad = 36;
  const scores = iterations.map((item) => item.score);
  const min = Math.max(0, Math.min(...scores, 4) - 0.15);
  const max = Math.min(5, Math.max(...scores, 5));
  const xFor = (index) => pad + (iterations.length === 1 ? 0 : (index / (iterations.length - 1)) * (width - pad * 2));
  const yFor = (score) => height - pad - ((score - min) / Math.max(0.01, max - min)) * (height - pad * 2);
  const line = iterations.map((item, index) => `${xFor(index)},${yFor(item.score)}`).join(' ');
  const dots = iterations.map((item, index) => {
    const color = item.decision === 'discard' ? '#b84a3f' : item.decision === 'baseline' ? '#2f6fdd' : '#2f8f4e';
    return `<g><circle cx="${xFor(index)}" cy="${yFor(item.score)}" r="5" fill="${color}" /><text x="${xFor(index) - 14}" y="${height - 10}" font-size="11">${escapeHtml(item.version || String(item.iteration))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="版本分数曲线">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#fffdf7" />
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#c9c0b2" />
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#c9c0b2" />
    <polyline points="${line}" fill="none" stroke="#315f3a" stroke-width="3" />
    ${dots}
  </svg>`;
}

function renderReport({ runId, options, best, iterations, summary }) {
  const rows = iterations.map((item) => `<tr>
    <td>${escapeHtml(item.version)}</td>
    <td>${escapeHtml(item.decision)}</td>
    <td>${item.score.toFixed(3)}</td>
    <td>${item.bestScore.toFixed(3)}</td>
    <td>${item.scoreDelta.toFixed(3)}</td>
    <td>${escapeHtml(item.commitHash || '')}</td>
    <td>${item.hardFailures}</td>
    <td>${item.truncated}</td>
    <td>${item.privacyLeaks}</td>
    <td>${escapeHtml(item.direction || '')}</td>
  </tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>小象回声 Auto Research ${escapeHtml(runId)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif; margin: 32px; color: #243023; background: #f6f3ec; }
    .panel { background: #fffdf7; border: 1px solid #ded7ca; border-radius: 10px; padding: 16px; margin: 16px 0; }
    table { border-collapse: collapse; width: 100%; background: #fffdf7; }
    th, td { border: 1px solid #ded7ca; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef4ea; }
    pre { white-space: pre-wrap; background: #fffdf7; border: 1px solid #ded7ca; padding: 12px; border-radius: 8px; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .card { border: 1px solid #d8d0c2; border-radius: 8px; padding: 12px; background: #fbfaf4; }
  </style>
</head>
<body>
  <h1>小象回声 Auto Research</h1>
  <p>runId: ${escapeHtml(runId)}；dataset: ${escapeHtml(options.dataset)}；rounds: ${options.rounds}；dryRun: ${options.dryRun}</p>
  <div class="panel">
    <h2>版本曲线</h2>
    ${buildCurveSvg(iterations)}
  </div>
  <div class="panel">
    <h2>最佳结果</h2>
    <p>bestVersion: ${escapeHtml(summary.bestVersion || '')}；bestScore: ${best.score.toFixed(3)}；bestCommit: ${escapeHtml(summary.bestCommit || '')}</p>
    <p>versionCount: ${summary.versionCount}；keepCount: ${summary.keepCount}；discardCount: ${summary.discardCount}</p>
  </div>
  <div class="panel">
    <h2>三环境隔离</h2>
    <div class="cards">
      <div class="card"><b>生成环境</b><br>只看 prompt + 日记输入，不看评分标准和历史决策。</div>
      <div class="card"><b>评分环境</b><br>只看评分标准 + 日记输入 + 输出，不看 prompt。</div>
      <div class="card"><b>迭代 Agent</b><br>只看 prompt + 分数 + 扣分原因，不参与评分。</div>
    </div>
  </div>
  <div class="panel">
    <h2>版本历史</h2>
    <table>
      <thead><tr><th>版本</th><th>决策</th><th>分数</th><th>最佳分</th><th>变化</th><th>commit</th><th>硬闸</th><th>截断</th><th>隐私</th><th>方向</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="panel">
    <h2>最佳 Prompt</h2>
    <pre>${escapeHtml(best.prompt)}</pre>
  </div>
</body>
</html>`;
}

async function writeReport(outDir, payload) {
  await fs.writeFile(path.join(outDir, 'report.html'), renderReport(payload), 'utf8');
}

function toVersionEvent(record) {
  return {
    type: 'version',
    version: record.version,
    iteration: record.iteration,
    decision: record.decision,
    score: record.score,
    bestScore: record.bestScore,
    scoreDelta: record.scoreDelta,
    commitHash: record.commitHash,
    hardFailures: record.hardFailures,
    truncated: record.truncated,
    privacyLeaks: record.privacyLeaks,
    direction: record.direction,
    changeSummary: record.changeSummary,
    roleIsolation: record.roleIsolation,
  };
}

export async function runResearch(rawOptions = {}, hooks = {}) {
  const options = normalizeOptions(rawOptions);
  const runId = rawOptions.runId || new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(runsRoot, runId);
  const discardedDir = path.join(outDir, 'discarded');
  await fs.mkdir(discardedDir, { recursive: true });
  await ensurePromptHistoryRepo();

  const cases = loadCases(options.dataset, options.limit);
  const iterationsPath = path.join(outDir, 'iterations.jsonl');
  const scoreboardPath = path.join(outDir, 'scoreboard.tsv');
  await fs.writeFile(scoreboardPath, 'iteration\tversion\tcommit\tdecision\tdataset\tcaseCount\tscore\tbestScore\tscoreDelta\tpromptBytes\thardFailures\ttruncated\tprivacyLeaks\tdirection\tchangeSummary\n', 'utf8');

  const iterations = [];
  const discardedDirections = [];
  let noKeepCount = 0;
  let versionNumber = await getNextVersionNumber();
  let previousVersion = '';

  const seedPrompt = await loadSeedPrompt(options);
  const seedEval = await evaluatePrompt(seedPrompt, cases, options);
  let best = { prompt: seedPrompt, score: seedEval.averageScore, evaluation: seedEval, version: formatVersion(versionNumber), commitHash: '' };

  const makeRecord = async ({ iteration, version, prompt, evaluation, decision, oldBestScore, direction, changeSummary, updateBest }) => {
    const scoreDelta = evaluation.averageScore - oldBestScore;
    const record = {
      runId,
      iteration,
      version,
      prompt,
      decision,
      dataset: options.dataset,
      caseCount: cases.length,
      score: evaluation.averageScore,
      bestScore: updateBest ? evaluation.averageScore : oldBestScore,
      scoreDelta,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      hardFailures: evaluation.hardFailures,
      truncated: evaluation.truncated,
      privacyLeaks: evaluation.privacyLeaks,
      dimensionAverages: evaluation.dimensionAverages,
      previousVersion,
      currentBestVersion: updateBest ? version : best.version,
      direction,
      changeSummary,
      failureTags: summarizeFailures(evaluation, false).tags,
      roleIsolation: {
        generator: 'prompt + diary only',
        judge: 'rubric + diary + output + optional reference; prompt hidden',
        improver: iteration === 0 ? 'not used on baseline' : 'prompt + scores + failure summary; no scoring permission',
      },
      updateBest,
      createdAt: new Date().toISOString(),
    };
    const commitHash = await writePromptVersion(record);
    record.commitHash = commitHash;
    delete record.prompt;
    iterations.push(record);
    await appendLine(iterationsPath, JSON.stringify(record));
    await appendLine(scoreboardPath, [
      iteration,
      version,
      commitHash,
      decision,
      options.dataset,
      cases.length,
      evaluation.averageScore.toFixed(3),
      record.bestScore.toFixed(3),
      scoreDelta.toFixed(3),
      record.promptBytes,
      evaluation.hardFailures,
      evaluation.truncated,
      evaluation.privacyLeaks,
      direction,
      changeSummary,
    ].map(tsvEscape).join('\t'));
    hooks.onEvent?.(toVersionEvent(record));
    previousVersion = version;
    return record;
  };

  hooks.onEvent?.({ type: 'start', runId, options, outDir, caseCount: cases.length });
  const baselineVersion = best.version;
  const baselineRecord = await makeRecord({
    iteration: 0,
    version: baselineVersion,
    prompt: seedPrompt,
    evaluation: seedEval,
    decision: 'baseline',
    oldBestScore: seedEval.averageScore,
    direction: options.seedPrompt,
    changeSummary: '初始 prompt 评分',
    updateBest: true,
  });
  best = { ...best, commitHash: baselineRecord.commitHash };
  await fs.writeFile(path.join(outDir, 'best.prompt.txt'), seedPrompt, 'utf8');

  for (let round = 1; round <= options.rounds; round += 1) {
    versionNumber += 1;
    const version = formatVersion(versionNumber);
    const improved = await improvePrompt(best.prompt, best.evaluation, { round, discardedDirections }, options);
    const candidateEval = await evaluatePrompt(improved.prompt, cases, options);
    const keep = shouldKeep(candidateEval, best.evaluation);
    const decision = keep ? 'keep' : 'discard';
    const oldBestScore = best.score;
    const record = await makeRecord({
      iteration: round,
      version,
      prompt: improved.prompt,
      evaluation: candidateEval,
      decision,
      oldBestScore,
      direction: improved.direction,
      changeSummary: improved.changeSummary,
      updateBest: keep,
    });

    if (keep) {
      best = {
        prompt: improved.prompt,
        score: candidateEval.averageScore,
        evaluation: candidateEval,
        version,
        commitHash: record.commitHash,
      };
      noKeepCount = 0;
      await fs.writeFile(path.join(outDir, 'best.prompt.txt'), improved.prompt, 'utf8');
    } else {
      noKeepCount += 1;
      discardedDirections.push(improved.direction);
      await fs.writeFile(path.join(discardedDir, `${version}.prompt.txt`), improved.prompt, 'utf8');
    }

    hooks.onEvent?.({ type: 'log', message: `[${round}/${options.rounds}] ${decision} ${version} score=${candidateEval.averageScore.toFixed(3)} best=${best.score.toFixed(3)}` });
    if (best.score >= options.target) break;
    if (noKeepCount >= options.patience) break;
  }

  const summary = {
    runId,
    outDir,
    options,
    bestVersion: best.version,
    bestCommit: best.commitHash,
    bestScore: best.score,
    versionCount: iterations.length,
    keepCount: iterations.filter((item) => item.decision === 'keep' || item.decision === 'baseline').length,
    discardCount: iterations.filter((item) => item.decision === 'discard').length,
    expandedScore: options.dataset === 'expanded' ? best.score : null,
    caseCount: cases.length,
    historyRoot: promptHistoryRoot,
    completedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(outDir, 'run-options.json'), `${JSON.stringify(options, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeReport(outDir, { runId, options, best, iterations, summary });
  hooks.onEvent?.({ type: 'done', summary });
  return { runId, outDir, best, iterations, summary };
}

export async function getRecentRuns(limit = 12) {
  if (!fsSync.existsSync(runsRoot)) return [];
  const dirs = await fs.readdir(runsRoot, { withFileTypes: true });
  const runs = [];
  for (const dir of dirs.filter((item) => item.isDirectory())) {
    const summaryPath = path.join(runsRoot, dir.name, 'summary.json');
    if (!fsSync.existsSync(summaryPath)) {
      runs.push({ runId: dir.name, hasSummary: false });
      continue;
    }
    runs.push(JSON.parse(await fs.readFile(summaryPath, 'utf8')));
  }
  return runs
    .sort((a, b) => String(b.completedAt || b.runId).localeCompare(String(a.completedAt || a.runId)))
    .slice(0, limit);
}

export function getRunBestPromptPath(runId) {
  return path.join(runsRoot, runId, 'best.prompt.txt');
}
