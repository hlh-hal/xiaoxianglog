# 2026-06-11 小象回声 Auto Research

## 背景

用户明确取消旧 Prompt Lab 手动 A/B 方向，认为页面仍需要过多人工参与，要求完全舍弃当前本地 Prompt Lab，改为 Auto Research：AI 自动生成、独立评分、自动改 prompt、棘轮择优，最后只让人看最佳版本和报告。

## 本轮变更

- 删除旧本地 Prompt Lab 入口文件：`scripts/echo-prompt-lab/server.mjs`、`scripts/echo-prompt-lab/public/index.html`，并移除 `npm run lab:echo-prompt`。
- 新增 `scripts/echo-prompt-research/run.mjs`，作为本地自动 prompt 研究工具。
- 新增 npm 命令：
  - `npm run research:echo-prompt:quick`
  - `npm run research:echo-prompt`
  - `npm run research:echo-prompt:expanded`
- 新增产物目录忽略规则：`artifacts/echo-prompt-research/`。
- 线上安全保持不变：`src/services/aiService.ts` 的线上 baseline 不会被自动替换；Auto Research 只写 `best.prompt.txt` 等本地研究产物。

## Auto Research 机制

- 生成器只看 prompt + 日记输入。
- 评分器只看评分标准 + 日记输入 + 输出 + 可选参考答案，不看 prompt。
- 改进器只看当前 prompt、分数、扣分原因、失败方向，不参与评分。
- 棘轮器只在新分数不低于 best，且硬闸失败数、隐私泄漏数不增加时 keep；否则 discard，并把失败 prompt 写入 `discarded/`。
- 固定评分维度为：贴近日记、洞察深度、温柔分寸、自然表达、隐私安全、完成度。

## 产物

每次运行写入：

```text
artifacts/echo-prompt-research/runs/<runId>/
  best.prompt.txt
  iterations.jsonl
  scoreboard.tsv
  report.html
  run-options.json
  discarded/
```

## 验证结果

- `node --check scripts/echo-prompt-research/run.mjs` 通过。
- `npm run research:echo-prompt:quick -- --dry-run --rounds=2 --limit=2` 通过，生成 `best.prompt.txt`、`iterations.jsonl`、`scoreboard.tsv`、`report.html`；dry-run 分数从 3.820 经棘轮提升到 4.100。
- `npm run test:daily-echo-quality` 通过。
- `npm run test:echo-memory-eval` 通过。
- `npm run lint` 通过。

## 接手提示

- 不要再维护 `http://localhost:3010/lab`；旧 Lab 已下线，3010 也没有监听服务。
- 若用户要真实优化 prompt，优先运行 quick 小样本确认模型配置，再跑 sample/expanded。
- 研究结果不能自动进入线上 prompt；只有用户明确说“采用最佳 prompt”时，才把 `best.prompt.txt` 人工固化到 `src/services/aiService.ts`。

## 可视化与 Git 版本系统补充

- 2026-06-11 后续按用户要求补齐文章方法论里的版本管理：新增本地操作台 `http://localhost:3010/research`，入口命令 `npm run research:echo-prompt:ui`。
- Auto Research 核心已拆到 `scripts/echo-prompt-research/core.mjs`；CLI 入口为 `run.mjs`，本地服务为 `server.mjs`，页面为 `public/index.html`。
- 新增独立 Prompt Git 仓库 `artifacts/echo-prompt-research/prompt-history/`，这是嵌套本地仓库，只记录 prompt、评分摘要和版本元数据，不保存真实日记正文，也不进入主项目 Git。
- 每轮都会生成 `v001`、`v002` 这样的版本号；baseline、keep、discard 都提交 Git。discard 会保留到历史，但不会覆盖 `current/best.prompt.txt`。
- 页面可保存本地手动样本、启动研究、通过 SSE + 状态轮询看实时版本曲线、查看版本表、点击版本查看 prompt/diff/commit，并下载本轮最佳 prompt。
- 验证结果：`v011` dry-run 故意截断被 discard，`current/best.json` 仍指向上一版 best；真实小米模型冒烟生成 `v021`/`v022` 并完成 keep；浏览器烟测能完成 dry-run、显示曲线和下载入口。
- 仍然不要自动把最佳 prompt 写入 `src/services/aiService.ts`；采用线上版本必须由用户明确确认。

## 2026-06-11 原始 Prompt 输入与历史版本查看修复

- 用户反馈 `http://localhost:3010/research` 无法输入原始 prompt，且版本详情里的 Prompt 原文为空/历史版本不好查看。
- 已在可视化页面的“研究设置”增加“自定义原始 prompt”模式，支持直接输入本轮 v001/baseline；并增加“载入 baseline / 载入 candidate / 载入当前 best / 清空”按钮，方便快速启动新一轮研究。
- 服务端新增 `GET /api/research/seed-prompts`，页面可读取源码里的 baseline/candidate prompt 模板，不要求用户去命令行或源码里复制。
- 已优化历史版本读取性能：`listPromptVersions()` 改为一次性解析 prompt-history Git 日志得到版本 commit map；`getPromptVersionDetail(version)` 改为直接读取指定版本的 `prompt.txt`、`meta.json` 和 diff，不再为了打开一个版本遍历全量历史。
- 页面版本列表的版本号改为可点击按钮；点击后会显示加载状态、Prompt 原文、与上一版 diff、评分摘要和 commit，失败时显示中文错误。
- 浏览器验证：打开 `http://localhost:3010/research`，点击“载入 baseline”后原始 prompt 输入框有内容；点击 `v001` 后 Prompt 原文可显示；输入自定义 prompt 后启动 dry-run 能生成新版本并写入历史。
