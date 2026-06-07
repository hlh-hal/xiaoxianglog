# 2026-06-05 DailyEcho 今日回声金句与分享卡升级

## 状态
- 已按用户方案让 DailyEcho 成为“分享的理由”：AI 生成链路最终输出 `今日回声：...` 和 `用户可见回声：...`。
- 今日回声定位为 12-24 字左右、贴近日记真实细节的温柔洞察；用户可见回声继续走既有质量闸。
- 本次只改前端生成提示词、解析、展示、导出和验证脚本；未改后端 provider、Prisma、同步协议或 `DailyEcho` 数据结构。

## 关键改动
- 新增 `src/utils/dailyEchoQuote.ts`：统一解析、序列化 `今日回声` 与正文；旧历史内容没有显式 quote 时，会从正文第一句派生兜底金句。
- `src/services/aiService.ts`：DailyEcho prompt 要求最终输出 `今日回声` 与 `用户可见回声`；质量闸仍只验证正文，quote 作为展示增强，不单独导致失败。
- `src/components/DailyEchoCard.tsx`：展开卡顶部删除旧图标 + “小象回声”标题，改为金句题签区；正文只显示用户可见回声，不重复展示 quote，不泄漏内部字段。
- `DailyEchoExportCard` 和 `src/pages/Editor.tsx` 的 `renderDailyEchoFallbackCanvas()` 同步升级，保存图片默认生成带金句、日期、正文的分享卡；移动端 canvas 兜底也保持一致样式。
- `scripts/verify-daily-echo-ai-success.mjs` 增加金句断言、旧标题消失断言、保存图片 dataUrl 断言，并输出页面成功截图与分享卡 PNG。脚本输入长日记改为对 ProseMirror 一次性触发文本插入，避免线上 Puppeteer 逐字输入超时。

## 验证
- `npm run test:daily-echo-quality`：通过。
- `npm run test:daily-echo-completion`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，仅保留既有 dynamic import / chunk size 警告。
- 本地浏览器验收：`ECHO_VERIFY_BASE_URL=http://127.0.0.1:3000 node scripts/verify-daily-echo-ai-success.mjs` 通过，`chatCompleteCalls: 1`、`failedTextVisible: false`、`leakedDraft: false`、`quoteVisible: true`、`oldHeaderVisible: false`、`savedImage.ok: true`。
- 本地截图：`artifacts/daily-echo-ai-success-2026-06-05.png`、`artifacts/daily-echo-share-card-2026-06-05.png`。

## 云端部署与线上验收
- 已执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，19/19 前端文件上传 OK。
- 线上首页引用 `assets/index-ouv2fiTe.js` 与 `assets/index-BSrSeMIR.css`。
- 远端 SHA256 与本地 `dist/` 一致：JS `07E7868B0D30F87BFA4E0510C9B90ABF52478BE453B469F6E29936D295CDFD81`；CSS `1E299FDAE67535312AD1DBF25D2A05B17DAF40FB60181127DF8FF8189ACAC316`。
- `https://www.xiaoxianglog.cn/api/health` 返回 `build: cpamc-only-20260520`、`pid: 7128`。
- 线上浏览器验收：`ECHO_VERIFY_BASE_URL=https://www.xiaoxianglog.cn node scripts/verify-daily-echo-ai-success.mjs` 通过，同样确认 1 次 AI 调用、无失败文案、无内部字段泄漏、无旧“小象回声”标题、保存图片成功。
- 线上截图：`artifacts/daily-echo-ai-success-online-2026-06-05.png`、`artifacts/daily-echo-share-card-online-2026-06-05.png`。
