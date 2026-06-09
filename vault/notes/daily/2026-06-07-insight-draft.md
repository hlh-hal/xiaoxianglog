# 2026-06-07 小象回声洞察草稿纸

## Summary

- 新增 `InsightDraft` 本地草稿纸：三层叙事化结构（身份感、模式感、事件感）加版本、更新时间、累计日记数和置信度。
- 草稿只存在前端 IndexedDB `ethos-diary-db` 的 `insightDrafts` store；清空本地用户数据时会一起清理，但不会进入后端同步、Prisma、导出包或聊天历史。
- 手动保存日记后更新草稿，再带着更新后的草稿生成小象回声；如果用户第一次使用该功能且已有历史日记，会先读取历史日记生成第一份初稿，再用当前日记增量修正。
- 回声 prompt 把草稿作为隐性“潜台词”，要求叙事化、不要标签化，不输出“洞察草稿/用户画像/参考模块”等显性痕迹。
- 小象回声回复 prompt 升级：生成前先在内部完成“洞察草稿”（今日主线、核心追问、情绪底色、关键转折、隐藏需求、人格特质、成长方向、核心洞察句），但最终只输出 `今日回声` 和 `用户可见回声`。
- 用户可见回声不再是温柔评论，而是帮助用户理解今天的自己：必须指出真正卡住的地方，把具体事件升维成人格特质或成长能力，并包含“从……走向……”或“不是……而是……”式洞察句。
- 设置页新增“小象回声洞察草稿”底部 Sheet，可查看、手动修正、保存或清空重来，并说明本机保存、生成回声时参与单次 AI 请求。

## Files

- `src/services/diaryService.ts`
- `src/services/aiService.ts`
- `src/pages/Editor.tsx`
- `src/pages/Settings.tsx`
- `tests/insight-draft.test.ts`
- `tests/daily-echo-quality.test.ts`
- `package.json`

## Verification

- `npm run test:insight-draft`
- `npm run test:sync-push`
- `npm run test:daily-echo-quality`
- `npm run test:daily-echo-completion`
- `npm audit --audit-level=high`
- `npm run lint`
- `npm run build`

## Notes

- 2026-06-07 安全审查时先发现依赖审计有 high/moderate 漏洞，已执行 `npm audit fix`，更新 `package-lock.json` 中 `react-router` / `react-router-dom`、`express` / `body-parser` / `qs`、`protobufjs`、`brace-expansion` 等依赖锁定版本；复跑 `npm audit --audit-level=high` 显示 0 vulnerabilities。
- `buildSyncPushPayload()` 现在白名单化日记同步字段，测试覆盖即使 entry 临时挂上 `insightDraft`、`userId`、`syncVersion` 或回声卡 `localDataUrl`，最终 `/sync/push` JSON 也不会带出这些本地/内部字段。
- 更新草稿失败不阻塞日记保存；回声会退回到没有草稿的单篇生成路径。
- 本次没有做真实移动端浏览器视觉检查；上线前建议在移动尺寸打开设置页 Sheet 和编辑器回声浮窗确认安全区、滚动和按钮触达面积。
- 回声 prompt 测试已覆盖：system prompt 必须包含内部洞察草稿字段和“从……走向……”方向；user prompt 必须携带自检规则；质量测试仍要求最终解析只保留用户可见回声。

## Cloud Deploy

- 2026-06-07 已执行 `npm run build`，生成前端入口 `assets/index-DCIp7E_F.js` 和样式 `assets/index-vZeaWiW0.css`。
- 已执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，19/19 个前端文件上传 OK。
- 线上验证：`http://47.122.112.242/` 已引用 `assets/index-DCIp7E_F.js` 和 `assets/index-vZeaWiW0.css`；两个静态资源经 `curl -k -I -L` 验证返回 200；`/api/health` 返回 `build: cpamc-only-20260520`、`pid: 2984`。
- 成功截图：`screenshots/2026-06-07-cloud-deploy-success.png`。
- 本次只上传前端 `dist/`，没有上传后端、没有重启 Node。

## Follow-up Fix

- 用户截图显示回声已生成，但设置页洞察草稿仍为 `v0 / confidence 30% / diaryCount 0`，说明之前“草稿 AI 更新失败”会被静默吞掉，并可能保存空草稿壳。
- 修复：`isEmptyInsightDraft()` 改为按叙事字段判断，metadata-only 或 v0 空壳都视为未初始化；Editor 遇到空草稿会重新走初始化，并在初始化前尝试 `forceFullPull` 拉取云端历史日志；AI 草稿生成/更新失败时不再保存空草稿，只提示“回声已先生成”。
- 修复：Settings 保存空草稿时会清空本地草稿，不再把空 JSON 固化为真实草稿。
- 明确拒绝本地保守兜底草稿：草稿必须来自 AI 返回的有效 JSON，不能用本地关键词猜一份假草稿。
- 验证：`npm run test:insight-draft`、`npm run test:daily-echo-quality`、`npm run test:daily-echo-completion`、`npm run test:sync-push`、`npm run lint`、`npm audit --audit-level=high`、`npm run build`。
- 2026-06-07 已重新上传前端，线上入口为 `assets/index-CUtnmDhk.js`，样式仍为 `assets/index-vZeaWiW0.css`；成功截图：`screenshots/2026-06-07-insight-draft-fix-deploy.png`。
- 继续修复：首次初稿生成和回声最近上下文拆开，初稿最多读取 24 篇历史日志，回声潜台词仍只取最近 8 篇，避免“有 148 篇历史但初稿样本太少”。同时如果 AI 初稿返回空叙事字段，不保存空壳。
- 2026-06-07 再次构建上传，第一次 FTP 上传有 4 个图标超时，立即重跑后 19/19 全部 OK；线上入口更新为 `assets/index-Ci9hQ9hX.js`，成功截图：`screenshots/2026-06-07-insight-draft-history-fix-deploy.png`。
- 最终补边界：`换一句` 属于强制再生成，若本地已有有效草稿则不重复增量更新；但如果旧用户本地是 v0 空草稿，强制再生成也会重新初始化/更新草稿，避免继续卡在 v0。
- 2026-06-07 最终构建上传，前两次 FTP 有单文件超时，第三次 19/19 全部 OK；线上入口更新为 `assets/index-TcgEju9i.js`，成功截图：`screenshots/2026-06-07-insight-draft-final-deploy.png`。

## 2026-06-08 Write Path Fix

- 用户真机截图仍显示设置页草稿 `v0 / 0篇 / confidence 30%`，复查判断不是 Web IndexedDB 权限或必须打 APK，而是草稿更新仍依赖回声生成副作用、旧空草稿容易被当成真实展示、失败诊断不可见，另有 PWA 旧 JS 缓存风险。
- 新增统一入口 `ensureInsightDraftUpdated(entry, options)`：手动保存、回声生成和设置页“立即生成/修复草稿”共用同一条链路；会在需要时登录态 `forceFullPull` 拉取历史日志，初稿最多用 24 篇历史，回声上下文仍只取最近 8 篇。
- 手动保存成功后会先尝试更新洞察草稿，再把结果传给小象回声；即使当前日记已有 saved/dismissed 回声导致回声不再生成，草稿也不会被提前 return 阻断。
- AI 草稿请求新增 `responseFormat: { type: 'json_object' }`；非 JSON、空 JSON、只有 meta 的 metadata-only 草稿会被拒绝，不再写入空壳。
- Settings 洞察草稿 Sheet 新增“立即生成/修复草稿”、写入诊断、本地日记数、登录态、最近尝试/成功时间、失败原因和前端构建标识；无真实草稿时显示“尚未生成”，不再把 `createEmptyInsightDraft()` 当真实持久草稿。
- PWA `CACHE_VERSION` 升级到 `xiaoxiang-pwa-v9`，前端构建标识为 `insight-draft-write-path-20260608-1`，用于确认手机是否运行最新 JS。
- 本地验证：`npm run test:insight-draft`、`npm run test:daily-echo-quality`、`npm run test:daily-echo-completion`、`npm run test:sync-push`、`npm run lint`、`npm audit --audit-level=high`、`npm run build` 全部通过；构建产物为 `assets/index-BKfrrTA4.js`、`assets/index-BygPOeGp.css`。
- 云端上传：`powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 一次成功，19/19 前端文件 OK；线上首页已引用 `assets/index-BKfrrTA4.js` 和 `assets/index-BygPOeGp.css`，`/sw.js` 已包含 `xiaoxiang-pwa-v9`，线上 JS 已包含 `insight-draft-write-path-20260608-1`。
- 待真机验证：上传云端后在设置页确认构建标识为 `insight-draft-write-path-20260608-1`，点击“立即生成/修复草稿”，应从“尚未生成/v0 空壳”变成 `v1+` 且出现叙事字段；若失败，Sheet 会显示 AI/同步错误原因。

## 2026-06-08 Independent Page UX

- 用户希望“设置 > 小象回声洞察草稿”不再用底部 Sheet，而是独立页面，左上角返回，便于长草稿查阅和编辑。
- 新增 `src/pages/InsightDraftSettings.tsx` 独立页面，复用原草稿查看、立即生成/修复、写入诊断、JSON 编辑、保存草稿和清空重来能力；底部保存/清空按钮固定在安全区上方，正文区域可长滚动。
- `src/pages/Settings.tsx` 仅保留入口，点击跳转 `/settings/insight-draft`，并移除原 Sheet 状态和 JSX，避免同一能力双入口维护。
- `src/App.tsx` 注册 `settings/insight-draft` 路由；`public/sw.js` 缓存版本升级为 `xiaoxiang-pwa-v10`，减少真机 PWA 继续使用旧 Sheet JS 的概率。
- 验证：`npm run lint`、`npm run test:insight-draft`、`npm run build` 通过；构建产物 `assets/index-TRxkT04S.js`、`assets/index-BRDChRpq.css`。
- 云端上传：`powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 一次成功，19/19 前端文件 OK；线上首页引用新 JS/CSS，`/sw.js` 已包含 `xiaoxiang-pwa-v10`，线上 JS 已包含 `settings/insight-draft`。

## 2026-06-08 Daily Echo Not-grounded Fix

- 用户截图显示小象回声浮窗为“这次小象没有读完整，点换一句再试”，浏览器控制台实际错误是 `Daily echo did not pass quality check: not-grounded`；这不是 AI/后端完全无响应，而是前端回声质量校验误判后丢弃了 AI 返回内容。
- 根因：当前日记包含“销售练习、模拟客户成交、产品了解、挖掘需求、价值匹配、父母做饭、送我上车”等具体细节，但 `extractDiaryEchoAnchors()` 只抽到了 `AI`，导致自然回声即使回应了真实内容，也因锚点命中不足被判 `not-grounded`。
- 修复：扩展 `DAILY_ECHO_PHRASE_PATTERNS`，补充销售练习、成交爽感、产品/优惠/售卖基础、挖掘需求/价值匹配/打消疑虑/引导成交/情绪价值、父母支持等场景锚点。
- 新增回归测试 `accepts sales practice echo grounded in concrete diary details`，覆盖截图同类日记，要求能抽到销售练习、挖掘需求/价值匹配、父母/母亲，并通过 `validateDailyEchoContent()`。
- PWA `CACHE_VERSION` 升级到 `xiaoxiang-pwa-v11`，避免线上手机继续使用旧质检 JS。
- 验证：`npm run test:daily-echo-quality`、`npm run test:insight-draft`、`npm run test:daily-echo-completion`、`npm run lint`、`npm run build` 全部通过；构建产物 `assets/index-BYlYValz.js`、`assets/index-BRDChRpq.css`。
- 云端上传：`powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 一次成功，19/19 前端文件 OK；线上首页已引用 `assets/index-BYlYValz.js`，`/sw.js` 已包含 `xiaoxiang-pwa-v11`，线上 JS 已包含新增的销售/挖掘需求/价值匹配/送我上车锚点。
- 旁支噪音：截图中的上传图片 404、VAPID 未配置、nginx SSL handshake 日志与本次小象回声无响应无直接关系，但后续如果要修图片资源或通知可另开任务处理。

## 2026-06-08 Mobile Rate-limit Decoupling

- 用户手机截图显示 toast：`洞察草稿更新失败：AI 请求太频繁，请稍后再试`，但电脑网页端回声正常；说明不是回声接口整体不可用，而是手机端保存/换一句链路把“洞察草稿 AI 更新”和“回声 AI 生成”串得太紧，一次操作可能连续触发多次 AI 请求。
- 修复：`startDailyEchoGeneration()` 不再调用 `ensureInsightDraftUpdated()`；生成回声时只读取 IndexedDB 里已有的有效洞察草稿和最近 8 篇本地日记作为潜台词，不为回声临时新增草稿 AI 请求。
- 修复：手动保存后先生成/保存小象回声，再 `setTimeout(12000)` 后后台尝试 `ensureInsightDraftUpdated()`；后台草稿更新失败只写 `console.warn` 和诊断，不再弹 toast、不再让回声浮窗进入失败兜底。
- 保留：设置页“立即生成/修复草稿”仍可主动调用 AI 更新草稿；有效草稿仍会被回声自然注入。
- PWA `CACHE_VERSION` 升级到 `xiaoxiang-pwa-v12`，避免手机继续使用 v11 旧壳。
- 验证：`npm run test:daily-echo-quality`、`npm run test:insight-draft`、`npm run lint`、`npm run build` 通过；构建产物 `assets/index-CiY_2zi5.js`、`assets/index-BRDChRpq.css`。
- 云端上传：`powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 成功，19/19 前端文件 OK；线上首页引用 `assets/index-CiY_2zi5.js`，`/sw.js` 已包含 `xiaoxiang-pwa-v12`。
