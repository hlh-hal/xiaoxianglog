# 2026-06-10 小象回声 Prompt 实验台

## 背景

用户希望小象回声 prompt 调优不再靠主观感觉：每次改 prompt 后要能看到原版/改版并排对比，并用评测标准判断是变好还是变差。

## 本次落地

- 新增开发者本地工具 `scripts/eval-daily-echo-prompts.mjs`，不进入用户 App，不给普通用户看到。
- `src/services/aiService.ts` 新增 `DailyEchoPromptVersion`、`buildDailyEchoPromptSet()` 和 `CANDIDATE_DAILY_ECHO_SYSTEM_PROMPT`。线上 `generateDiaryEcho()` 仍显式使用 `baseline`；`candidate` 初始等同 baseline，后续只在实验台里调。
- 新增评测集：
  - `tests/fixtures/daily-echo-eval/boundary.jsonl`
  - `tests/fixtures/daily-echo-eval/sample.redacted.jsonl`
- 新增命令：
  - `npm run eval:daily-echo-prompt:quick`
  - `npm run eval:daily-echo-prompt`
- 评测输出在 `artifacts/echo-prompt-evals/<timestamp>/`，包含 `report.html`、`summary.json`、`cases.jsonl`；该目录已加入 `.gitignore`。

## 使用方式

- 2026-06-10 追加：实验台现在优先读取本地 `server/.env` / `.env` 的小米模型配置，直接调用小米 OpenAI-compatible `/chat/completions`，不再要求用户登录 token。
- 如果本地没有 `XIAOMI_API_KEY` / `AI_API_KEY`，才会退回 `ECHO_EVAL_ACCESS_TOKEN` 调用本地后端 `/api/chat/complete`。
- 如果两者都没有，命令会生成 prompt-only 报告，用于检查 fixture、版本化 prompt 和报告结构，不能用于决定上线。
- 正常本地使用：

```powershell
npm run eval:daily-echo-prompt:quick
```

- 可选覆盖小米模型配置：

```powershell
$env:ECHO_EVAL_XIAOMI_BASE_URL="https://token-plan-cn.xiaomimimo.com/v1"
$env:ECHO_EVAL_XIAOMI_MODEL="mimo-v2.5"
npm run eval:daily-echo-prompt:quick
```

## 验证

- `npm run test:daily-echo-quality`
- `npm run test:echo-memory-eval`
- `npm run eval:daily-echo-prompt -- --dry-run`
- `npm run eval:daily-echo-prompt:quick`
- `npm run eval:daily-echo-prompt:quick -- --limit=1`：已确认 `mode=direct-xiaomi`，真实调用模型成功。
- `npm run lint`

## 后续

- 每次 candidate 真实胜出或失败，都应把代表性样例补进 fixture，避免之后反复踩同类 prompt 坑。
- 如果要正式提升 candidate 为 baseline，必须先用真实模型跑完整评测，并人工抽检高风险样例；prompt-only 报告不能作为上线依据。

## 2026-06-10 交互版追加

- 用户明确不想使用 CLI，希望可视化修改 prompt 和评估维度。
- 新增本地交互页 `http://localhost:3010/lab`，由 `scripts/echo-prompt-lab/server.mjs` 提供服务。
- 页面能力：
  - 展示只读 baseline system prompt。
  - 可编辑 candidate system prompt，不会自动影响线上。
  - 可编辑评估维度 JSON 和硬性禁区 JSON。
  - 可选择 quick/boundary/sample/all 和 limit。
  - 一键运行 A/B，页面直接展示 baseline/candidate 输出、硬闸结果、judge 证据、问题和下一版 prompt 修改建议。
- 本地 session 保存到 `artifacts/echo-prompt-lab/session.json`，运行结果保存到 `artifacts/echo-prompt-lab/runs/<timestamp>/`；该目录已加入 `.gitignore`。
- 新增命令：`npm run lab:echo-prompt`。
- 验证：`GET /lab`、`GET /api/lab/state`、`POST /api/lab/evaluate` limit=1 均通过；limit=1 真实小米 A/B 约 45 秒。

## 2026-06-10 真实日志调优模式

- `http://localhost:3010/lab` 已新增“真实场景测试”区：可粘贴历史日志库和当前测试日志。
- 历史日志支持用单独一行 `---` 分隔，也支持空行分隔；Lab 会把历史日志构造成本地临时 `DiaryEntry[]`，不写入 App IndexedDB 或后端。
- 新增 `POST /api/lab/generate-insight-draft`：直接调用小米模型生成 `InsightDraft`，页面展示 JSON 草稿。线上严格解析失败时，Lab 会退回结构化归一化，保证短历史日志也能生成可共用草稿。
- `POST /api/lab/evaluate` 新增 `mode: "manual"`：只评测用户粘贴的当前日志；baseline 和 candidate 使用同一份 `InsightDraft`，结果里标记 `insightDraftShared` / `sharedInsightDraftUsed`。
- 页面下方文本框已加高：评估维度、硬性禁区、动态 user prompt 预览、结果输出都能容纳更多文字。
- 验证：`GET /lab`、`POST /api/lab/generate-insight-draft`、manual A/B、fixture quick/limit=1、`npm run test:daily-echo-quality`、`npm run test:echo-memory-eval`、`npm run lint` 均通过。

## 2026-06-10 可编辑预览与理解率统计

- 动态 user prompt 预览新增 `POST /api/lab/preview`，优先使用页面里的“当前测试日志”和共用 `InsightDraft`；当前测试日志为空时才回退 fixture。
- 页面新增“刷新预览”按钮，当前测试日志失焦后也会刷新预览，方便用户边改真实日记边看 baseline/candidate user prompt。
- 结果 summary 新增 `dimensionStats`，按评估维度统计 baseline 均分、candidate 均分、差值和百分比提升。
- 结果顶部新增“理解/洞察提升”指标，优先使用 `insight` / `理解` / `洞察` 维度，显示类似 `+0.30 / +10.0%` 的具体变化。
- 小米模型调用增加 `ECHO_PROMPT_LAB_MODEL_TIMEOUT_MS` 超时保护，默认 70 秒，避免页面长时间无响应。
- 验证：`POST /api/lab/preview` 用两篇不同当前日志返回不同 user prompt；`node --check scripts/echo-prompt-lab/server.mjs`、`npm run test:daily-echo-quality`、`npm run lint` 通过。

## 2026-06-10 页面简化与生成不完整修复

- Prompt Lab 页面重排为 4 个区块：提示词、测试日记、评估标准、对比结果；真实日记/评测集用一个模式选择控制，主按钮统一为“开始对比”。
- 删除常驻的大块 user prompt 预览和评估 JSON，占位改为折叠查看；页面文案改为正常中文，服务快速迭代。
- `FAIL truncated` 原因为模型返回 `finish_reason: "length"`；Lab 现在会对同版本自动重试 1 次，只提高 `maxTokens`，不改 prompt，保证 A/B 公平。
- `This operation was aborted` 原因为 Lab 请求超时；现在统一显示“模型请求超时，已中断”，并在结果里记录 `timeoutMs`、`requestErrorCode=model_timeout`。
- 每个版本输出新增 `attempts`、`retriedForTruncation`、`finalFailureReason`、`finalFailureText`、`generationStatus`；summary 新增 `completionRate`、`truncatedCount`、`timeoutCount`、`judgeTimeoutCount`。
- 验证：1ms 超时模式下 manual A/B 返回中文“请求超时”，`timeoutCount=2`；正常模式 `/lab` 200，`/api/lab/preview` 可用；`node --check scripts/echo-prompt-lab/server.mjs`、`npm run test:daily-echo-quality`、`npm run test:echo-memory-eval`、`npm run lint` 均通过。
