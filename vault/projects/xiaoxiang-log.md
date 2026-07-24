# 小象日志

## 2026-07-12 月度回声 V2 动态生成与七页渲染

- 月度回声生成链路升级为 `DailyTraceNode V2 -> MonthlyArcDraft V2 -> renderPayload V2`。每日节点只分析日记正文，原句必须连续匹配对应日记并生成稳定 `evidenceId`；月度聚合只能引用有效证据 ID，日期由后端从证据节点确定。
- `actionTrace` 只接受可观察行动，使用受控 `iconHint`；情绪不能单独作为行动。关键时刻最多 3 条，行动轨迹目标 4-6 条，证据不足时按页返回 `partial/fallback`，不再使用示例日期或示例文案补位。
- Prisma 为 DailyTraceNode、MonthlyArcDraft、MonthlyEcho 增加版本化 JSON 字段，并保留旧字段兼容。GET 会对旧版本月报按需重新生成，回声信称呼读取用户当前昵称。
- 七页正式页面使用最终设计图派生的无字底板，书本、花、照片、胶带、圆环、路径等装饰保持原图位置；所有业务文案改为 React/HTML 渲染，不再把动态文案盖在带字截图上。底板可通过 `python scripts/build_monthly_echo_textless_templates.py` 重建。
- 本地 SQLite 已备份为 `server/prisma/data/xiaoxiang.db.pre-monthly-echo-v2-20260712-112101.bak`，并执行 `server npm run db:push` 与 Prisma Client 生成。
- 验证通过：`npm run test:monthly-echo`、`npm run lint`、根目录 `npm run build`、`server npm run build`；七页在 `390x844` 视口截图检查，无横向溢出，页序为 0/844/1688/2532/3376/4220/5064。
- 本地满数据视觉预览：`http://127.0.0.1:3000/monthly-echo-v2-design-demo`。正式入口：`http://127.0.0.1:3000/monthly-echo?monthKey=YYYY-MM`。线上后端仍需部署 schema 与新服务后才能真实使用。

## 2026-07-12 月度回声永久生成状态修复

- 根因不是单纯模型慢：前端只请求一次且不轮询；scheduler 的 `setInterval` tick 可重叠；全局历史 trace 在交互月报前执行；failed trace 每分钟无限重试；attempt 已耗尽的任务又被 GET 改回 pending，但 worker 永远不会再消费。
- 前端生成中每 4 秒静默轮询，后端返回真实 `completed/total/attempt` 进度；终态失败不再显示 spinner，而是展示安全错误原因和“重新生成”按钮。
- scheduler 增加进程内互斥，交互 `monthly_echo/regenerate` 优先于后台任务；failed trace 不进入全局自动重试；后台 trace 默认每 tick 仅 1 条，且只预生成当前月与上月，更早月份按用户打开时生成。
- job 成功标准收紧为必须落库 `ready/pushed` 报告；attempt 耗尽的 pending/running 会自愈为 failed。显式重新生成会重置该次 job attempts，并将对应月份 failed trace 变为 stale 后重试。
- 修复后 `2026-07` 后端读取确认 `status=ready`、`renderPayload.schemaVersion=2`。完整 65 秒调度观测仅新增 1 次 AI 调用，旧版本调用风暴已消失。

## 2026-07-11 每日回声后台生成与流式恢复

- 每日回声已实现持久任务、SSE 预览、轮询兜底、刷新/重进恢复、数据库级重复任务防护和原子站内通知；编辑器离开只停止监听，不取消服务端任务。
- 任务结果不直接写服务端日记，由前端按 `sourceHash` 校验后写回 IndexedDB 并走原同步，避免覆盖未同步正文。任务输入终态清理，服务端结构化日志不含日记正文。
- Android/PWA 活跃态完成提醒复用现有本地通知通道；本期明确不接 EMAS、FCM 或国产厂商通道，App 强杀后只保证结果与站内通知不丢。
- 生产开关 `DAILY_ECHO_BACKGROUND_ENABLED` 默认关闭；尚未部署。上线需备份 SQLite、同步 Prisma schema、部署 SSE Nginx 配置、设置开关并重启，再验证 health build/capability 与真实 CPAMC 流式调用。
- 完整测试、前后端构建和纯净 SQLite schema push 已通过；详细记录见 `vault/notes/daily/2026-07-11.md`。

## 2026-06-30 MVP 架构最小重构

- 日记模型、同步 DTO、IndexedDB Repository 和提交后副作用协调器已从 `diaryService` 拆出，旧 API 保持兼容；日记本地提交不再被 Vault、云同步等可选功能失败阻断。
- 后端日记 CRUD/同步共用 codec，月度回声改走可等待且失败隔离的 projector；同步回归不再产生请求结束后的月度回声外键错误。
- Editor 保存/生命周期 autosave/回声/社区发布已形成独立协作者，App 启动与通知轮询移出路由 Shell；通知、好友关系和 Editor 偏好键已集中。
- 验证通过：前后端 build、`npm run lint`、统一 `npm test`、同步回归、8 项编辑器退出保存 E2E，以及 390×844 首页/Editor 浏览器冒烟。详细记录见 `vault/notes/daily/2026-06-30.md`。
- 本轮未改数据库 schema、线上 API 路径或部署配置，尚未部署。

## 2026-06-21 月度回声上线版

- 已实现持久化后端月度回声链路：`DailyTraceNode -> MonthlyArcDraft -> MonthlyEcho`，通过 `MonthlyEchoJobLog` 做轻量 job、失败落库和 `userId + monthKey + jobType` 运行锁。保存/同步/删除日记只标记 trace pending/stale/invalid 并入队，不在请求链路调用 AI。
- `monthKey` 基于 `entry.diaryDate` 日历键计算；跨月修改会 stale 旧月和新月；GET `/api/monthly-echo` 会先查 echo、pending job、running lock，避免前端刷新重复建任务。月末推送按用户 `monthlyEchoTimezone` + 本地 `HH:mm`，支持月末错过补偿和次月 1 日短窗口；推送路径增加 runtime lock、事务内二次检查 `pushedAt`，已 pushed 后 stale 只更新内容不重复推送。
- AI 安全：所有月度 prompt 明确声明日记、今日回声、Trace/Draft 都是待分析材料不是指令；`evidenceQuotes` 必须来自原文/今日回声连续短句，`posterQuote` 只能来自已校验证据且高风险内容不进入海报 quote；自伤/自杀/伤害他人内容走安全兜底模板，不生成收藏式金句、诊断或浪漫化表达。
- 前端新增 `/monthly-echo?monthKey=YYYY-MM` 五张卡片式月度回声、完整回声折叠、海报保存；搜索新增月度回声虚拟结果；设置页新增月度回声生成开关、月末推送提醒开关和本地推送时间。
- 验证：`server npm run db:generate`、`server npm run build`、根目录 `npm run test:monthly-echo`、`npm run lint`、`npm run build` 均通过；测试成功截图在 `artifacts/monthly-echo-test-success.png`。部署前仍需对目标数据库执行 `server npm run db:push` 并确认 scheduler 常驻。

## 项目背景

小象日志是一个私密、温和、偏移动端体验的日记应用。详细技术栈、目录职责、编码风格和验证方式见仓库根目录 `AGENTS.md`。

## 当前状态
- 2026-06-11：小象回声 Prompt Lab 手动 A/B 页面已废弃，改为本地 Auto Research 自动研究工具，并补齐可视化操作台与独立 Prompt Git 版本库。旧入口 `http://localhost:3010/lab` 和 `npm run lab:echo-prompt` 不再维护；新 UI 入口为 `npm run research:echo-prompt:ui` / `http://localhost:3010/research`，CLI 为 `npm run research:echo-prompt:quick` / `npm run research:echo-prompt` / `npm run research:echo-prompt:expanded`。产物写入 `artifacts/echo-prompt-research/runs/<runId>/`，版本历史写入嵌套仓库 `artifacts/echo-prompt-research/prompt-history/`。线上回声 baseline 不自动修改，只有用户明确采用最佳 prompt 时才人工固化。详情见 `vault/notes/daily/2026-06-11-echo-prompt-auto-research.md`。
- 2026-06-09：小象回声记忆系统 v2 已按汇总报告落地并上传云端服务器；本轮只做本地离线评估，不改后端、不加线上埋点。热层 `EchoHotMemory` 扩展为可撤回、可过期、可控敏感度的近期关系线索；新增 `PromptMemoryPack`，生成前只筛选自然相关的 0-2 条内部连续性线索，冷层 `InsightDraft` 继续只做长期假设索引。设置页主体验改为“近期记忆线索”卡片，高级 JSON 折叠。线上入口为 `assets/index-DXLQuVJK.js`，构建标识 `echo-memory-v2-20260609-1`，PWA 缓存版本 `xiaoxiang-pwa-v15`。验证详情见 `vault/notes/daily/2026-06-09-echo-memory-v2.md`。
- 2026-06-09：完成“小象回声记忆系统与提示词注入”多视角分析，报告目录为 `vault/projects/echo-memory-analysis-2026-06-09/`，共 10 份：`00-summary.md` 汇总报告 + 9 份独立视角报告。核心结论：继续双层记忆，但冷层 `InsightDraft` 只做长期假设索引，热层 `EchoHotMemory` 升级为少量可撤回的近期关系线索，生成前新增类似 `PromptMemoryPack` 的选择器，只把与今日日记自然相关、低风险、能改善分寸感的 0-2 条线索注入回声。
- 2026-06-08：Android APK 已同步最新 PWA 并构建正式签名包 `C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`，版本为 `1.0.1` / `versionCode 2`，包名 `com.xiaoxiang.diary`，签名校验 v2/v3 通过；新增 `docs/` GitHub Pages 下载官网和远程更新清单 `docs/app-update.json` / `public/app-update.json`。GitHub CLI 已安装但尚未登录，Pages/Release 线上部署需先执行 `gh auth login`。

- 2026-06-08：小象回声双层记忆 v1 已落地并上传云端，线上入口为 `assets/index-DGEcMgLq.js`，PWA 缓存版本 `xiaoxiang-pwa-v13`，构建标识 `echo-hot-memory-20260608-1`。新增 IndexedDB `echoHotMemories` / `echoMemorySnapshots`，热层按账号 key 隔离；回声 prompt 优先注入热层；设置页入口改为“小象回声记忆”，只允许编辑近期热层，长期洞察只读。
- 2026-06-08：长期洞察写入链路已修复为主链路优先并上传云端：设置页“立即生成/修复记忆”和编辑器保存后的 12 秒后台任务都先执行 `ensureInsightDraftUpdated()`，再执行 `ensureEchoHotMemoryUpdated()`，避免两个 AI 请求抢后端默认 1 个并发槽。`ensureInsightDraftUpdated()` 对 `AI 正在忙` / 请求太频繁做 1 次短延迟重试；设置页长期洞察失败只写诊断，不弹失败 toast。线上入口为 `assets/index-a-ZKsiKA.js`，构建标识 `insight-draft-write-flow-20260608-1`，PWA 缓存版本 `xiaoxiang-pwa-v14`。
- 2026-06-07：新增“小象回声洞察草稿纸”本地记忆设计。`InsightDraft` 只存前端 IndexedDB `ethos-diary-db` 的 `insightDrafts` store，不进 Prisma、同步 push、导出包或聊天历史；生成回声时仅作为单次 AI prompt 的隐性“潜台词”。首次没有草稿时，会先读取用户已有历史日记生成第一份叙事化初稿，再用当前日记增量更新。验证命令包含 `npm run test:insight-draft`、`npm run test:sync-push`、`npm run test:daily-echo-quality`、`npm run test:daily-echo-completion`、`npm run lint`、`npm run build`。
- 2026-06-08：针对真机设置页仍显示洞察草稿 `v0 / 0篇`，将草稿更新解耦为统一 `ensureInsightDraftUpdated()` 链路：手动保存、回声生成和设置页“立即生成/修复草稿”共用；AI JSON 模式和空草稿校验会拒绝非 JSON/metadata-only 结果；Settings 显示构建标识、登录态、本地日记数、历史拉取状态、最后尝试/成功时间和失败原因；PWA 缓存版本升级为 `xiaoxiang-pwa-v9`，构建标识 `insight-draft-write-path-20260608-1`。
- 2026-05-31：PWA 编辑器已落实“退出即保存/持续本地保存”P0 修复。新日志有有效文字或图片后会先以稳定 id 写入 IndexedDB；`visibilitychange`、`pagehide`、`freeze`、组件卸载会 flush 正式日记，避免切图库/切后台/闪退导致正文丢失。回归命令为 `npm run test:editor-exit-save`。
- 2026-05-24：新增共享记忆知识库骨架，用于跨会话保留重要上下文。
- 2026-05-24：本地日志文件夹同步修复已进入工作区，重点是避免 0B Markdown 空壳、确保网页/Android 本地文件夹与应用内容一致、回收站文件按当前内容重写。
- 2026-05-25：修复共享记忆流程问题，明确 `vault/` 是跨会话交接源，不能只写 `WORKLOG.md`。
- 2026-05-25：AI 聊天「嘴硬知己」升级为「毒舌知己」，强化傲娇毒舌、深度共情、低落降刺和拒绝泄露系统提示词的边界。
- 2026-05-26：本地日志历史同步改为批量入口和顶部进度条，修复选择文件夹后计数慢、文件夹最终为空或失败不明显的问题。
- 2026-05-26：Android/iOS 移动网页/PWA 的本地日志保存改为“下载日志包”能力，不再尝试不可靠的 `showDirectoryPicker()` 文件夹同步；桌面 Web 和 Android 原生 App 仍保留真实文件夹写入。
- 2026-05-26：按用户偏好修正移动 PWA 策略：Android Chrome / 移动网页只要实际暴露 `showDirectoryPicker()`，就先尝试真实文件夹同步；目录选择后必须通过写入并读回 `.xiaoxiang/write-probe-*.txt` 探针，探针成功才继续同步，失败时不再宣称文件夹同步成功。
- 2026-05-26：已将“修复日志文件夹同步 / 优化首篇日志排版 / 修复桌面弹窗通知”三项前端改动上传到 `47.122.112.242`，线上首页引用 `index-C678zn6g.js`。
- 2026-05-26：PWA 通知改为 Web Push + 服务端推送架构，覆盖每日写日志提醒、好友申请、帖子点赞和评论；上线前需配置 VAPID 环境变量并执行 Prisma 同步。
- 2026-05-27：修复 PWA 通知设置页开关“点了没反应”的前端链路，Push 订阅现在会主动注册/更新 Service Worker、处理旧 VAPID 订阅、超时退出并给出明确 toast；本地生产预览已用 Puppeteer 验证开关可开启并提交订阅。
- 2026-05-27：已将“修复桌面弹窗通知”和“修复首页多选删除无反应”相关前端产物上传到线上，线上入口为 `assets/index-BbjVz6MB.js`，Service Worker 缓存版本为 `xiaoxiang-pwa-v4`。
- 2026-05-27：针对“只有打开网页才弹通知”的反馈，后端 Web Push 增加高优先级/TTL，并新增 `/notifications/push/status`、`/notifications/push/self-test` 两个登录态排障接口；修改每日提醒开关或提醒时间会重置 `lastDailyReminderDate` 以便当天重复测试。后端 dist/source/schema/package 已上传线上，但需要宝塔重启 Node 项目后生效。
- 2026-05-27：针对“每日提醒第一次能触发，改时间后不触发”，前端本地兜底提醒改为按“日期+时间”去重，设置页开启或改时间会清理当天本地提醒键；后端偏好更新只在提醒从关闭变开启或提醒时间真的变化时重置 `lastDailyReminderDate`，避免 App 启动同步造成同日重复推送。
- 2026-05-27：日志编辑主题已移除 `sys-green-flower` / `sys-cute-flower` 两个旧图片背景，新增 `sys-botanical-paper`（`/themes/botanical-paper.jpg`）叶笺背景并上传前端到云端，线上入口引用 `assets/index-BVsgPNlQ.js`。
- 2026-05-27：已纠正 `sys-botanical-paper` 背景图片，线上 `/themes/botanical-paper.jpg` 已覆盖为用户指定的水彩植物图（1023799 字节，SHA256 `B4809ADA4B3F251B954DAD17B32B8CF99543255E9FF95613E93C1E78D6C53BB2`）。
- 2026-05-27：`sys-botanical-paper` 最终改为引用用户放入 `public/themes` 的 `/themes/botanical-paper.png`，线上已上传并删除旧 `.jpg` 和已移除的 `green_flower`/`cute_flower` 背景文件；线上 PNG SHA256 `94F9F35578BAEF316B1B0CF6E829189EE1ED769CC389FFBF6CB5E433D407F26C`。
- 2026-05-27：已将三项改动上传云端服务器：新增日志编辑纯色主题背景、修复云盘点击提示、增强互动与定时通知推送。线上前端入口为 `assets/index-DBUmvdAy.js`；后端 `dist/src/schema/package/tsconfig/doctor` 已上传到 `/xiaoxiang-server`，未覆盖线上 `.env`，但 `/api/health` pid 仍为 `7332`，需要宝塔重启 Node 项目后后端新逻辑生效。
- 2026-05-27：PWA 通知本地实测发现 App 启动会用本地默认 `21:00` 覆盖服务器每日提醒时间，已修复为启动时只确保 Push 订阅并做安全的一次性迁移；同时前台兜底轮询覆盖好友申请、点赞、评论。Puppeteer 本地 PWA 已验证 `/push/status configured:true`、`/push/self-test sentCount>0`，服务端 scheduler 能把 `lastDailyReminderDate` 写为 `2026-05-27`。

## 最近重大变更

### 本地日志文件夹同步

- 网页 File System Access 写入后会读回校验，失败时删除空壳文件。
- 全量同步前会清理“用户日志/回收站”中的 0B Markdown。
- 移入/恢复回收站时不再搬运可能过期或为空的旧文件，而是按当前日记内容重新渲染 Markdown。
- Android 文件夹选择器默认引导到 Documents，减少停在不可选根目录导致“无法使用此文件夹”的概率。
- 2026-05-26：`localVaultService.syncEntries()` 用一次 manifest 读写和按年份缓存路径处理历史日志批量同步；`diaryService.syncAllEntriesToVault()` 改走批量入口并回写每篇的 `vaultPath` / `vaultTrashPath`；设置页同步进度显示在顶部，不再用居中遮罩。验证包含 `npx tsx tests/local-vault-sync.test.ts`、`npm run lint`、`npm run build` 和 Puppeteer 模拟 36 篇日志落盘截图 `codex-vault-bulk-sync-success.png`。
- 2026-05-26：`localVaultService.getVaultCapability()` 区分 `directory-sync`、`archive-download`、`unsupported`。移动网页/PWA 走 `createVaultPackage()` 生成无依赖 ZIP，结构为 `用户日志/YYYY/*.md`、`回收站/YYYY/*.md`、`附件/images/<entryId>/...` 和 `.xiaoxiang/manifest.json`；同日多篇自动追加序号避免覆盖。设置页移动端按钮显示“下载日志包”，顶部显示 `正在生成本地日志包 x/y`。验证包含 `npx tsx tests/mobile-pwa-vault-package.test.ts`、`npx tsx tests/local-vault-sync.test.ts`、`npm run lint`、`npm run build` 和 Puppeteer 移动端截图 `codex-mobile-pwa-vault-package-success.png`。

### PWA、通知和部署

- PWA 安装逻辑增加 manifest、图标、service worker、安全上下文和浏览器菜单安装检测。
- 通知权限申请兼容 callback/promise 形式，Android 通知设置跳转使用 intent 点击。
- 2026-05-26：网页/PWA 通知发送改为优先使用 active Service Worker `showNotification()`，补齐通知点击聚焦/跳转；设置页测试通知先反馈再异步派发，避免系统通知 Promise 卡住 UI；每日提醒支持错过提醒时间后补发；好友申请通过前端未读轮询弹系统通知并按 ID 去重。
- 2026-05-26：设置页“发送测试通知”入口已删除；每日写日志提醒正文改为从 10 条引导语中随机选择，通知标题保持“小象日志”。
- 2026-05-26：服务端新增 `PushSubscription`、`NotificationPreference`、Web Push helper 和每日提醒 scheduler；`public/sw.js` 新增 `push` 事件，设置页会在通知授权后创建 Push 订阅并同步偏好。点赞 Push 标题为“有人点赞了你的日志”，评论为“有人评论了你的日志”，好友申请为“新的好友申请”。
- 2026-05-27：`ensurePwaPushSubscriptionWithReason()` 会返回可展示的失败原因；PWA 订阅流程增加 8 秒超时、Service Worker 缺失时自动注册 `/sw.js`、注册存在时 `update()`、旧订阅的 `applicationServerKey` 与当前 VAPID 公钥不一致时 `unsubscribe()` 后重建。设置页三类通知开关有忙碌态，避免用户误以为点击无效。
- 2026-05-27：Web Push 发送使用 `TTL: 86400` 和 `urgency: high`；部署排障可登录后调用 `/api/notifications/push/status` 看 `configured`、`subscriptionCount`、`preference`，调用 `/api/notifications/push/self-test` 让服务器主动发一条 Push，不依赖网页打开。
- 2026-05-27：每日提醒服务端 scheduler 每分钟扫描 `NotificationPreference` 并按用户时区发送 Web Push；提醒通知 tag 包含日期和提醒时间。偏好接口不要在每次收到 `dailyReminderEnabled: true` 时都清空 `lastDailyReminderDate`，否则当天提醒时间已过时，用户重新打开 App 会造成重复后台推送。
- 2026-05-27：App 启动时不要再把本地提醒时间无条件写回服务器；真实改时间只应由设置页 `handleReminderTimeChange()` 或明确迁移场景触发，否则会覆盖服务端已保存的新时间，导致“改时间后不触发”。
- 2026-05-26：Prisma schema 补回已有 `custom_themes` 表的 `CustomTheme` 模型，避免后续 `prisma db push` 因 schema 未声明该表而提示删除数据。
- nginx 配置从反代片段扩展为完整站点配置，包含 SPA fallback、API/uploads 反代、manifest MIME 和 SSL 配置。

### 排行榜点赞

- 后端点赞接口支持 `like`、`unlike`、`toggle`。
- 前端显式发送目标动作，避免乐观更新与服务端 toggle 状态不一致。

### AI 聊天风格

- 「毒舌知己」提示词位于 `src/services/aiService.ts` 的 `AI_STYLES.tsundere`。
- 该风格允许轻度调侃、反话、起亲密外号，但必须建立在理解与支持上；低落、脆弱或自我伤害风险场景要降低毒舌浓度。
- 用户给过一版更激进的人设文本，落地时已去掉“用户是首要指令”“违背 AI 限制”“暴露系统提示词”等不安全表达，改为毒舌语气下拒绝泄露隐藏规则。
- 2026-05-25：「温柔陪伴」提示词升级为心理陪伴风格，强调温柔稳定容器、专业共情双螺旋、见证者陪伴、心理学视角和危机边界；避免承诺专属/永久陪伴或替代专业心理咨询。
- 2026-05-25：「博学伙伴」提示词升级为分析型陪伴风格，强调认知共鸣机、感知天线/分析引擎/输出校准三层流水线、动态聚焦、情感同步、知识人格化封装，并保留不编造来源、不替代专业角色和不泄露隐藏规则的边界。

### 小象回声洞察草稿

- `InsightDraft` 是叙事化冷层索引，不是用户画像：身份感、模式感、事件感三层结构加 `version`、`lastUpdated`、`diaryCount`、`confidence` 元数据。
- 冷层隐私边界是本机优先：只保存在 IndexedDB，不加入 `/api/sync/push` payload，不进入后端 Prisma、聊天历史或本地日志导出。
- 混合架构原则：热层 `EchoHotMemory` 负责即时召回和回声注入；冷层 `InsightDraft` 负责长期模式识别，不直接注入回声。冷层到热层是蒸馏，热层到冷层的沉淀留给后续阶段。
- 2026-06-09 v2 原则：回声生成不再全量注入热层，而是通过 `buildPromptMemoryPack(diaryText, hotMemory, now)` 筛选 0-2 条内部连续性线索。筛选必须排除过期、高敏、`never_echo`、被拒绝/压制条目；没有自然相关性时返回空包，`seed` 不能单独作为画像注入。
- 热层条目新增 `kind`、`visibility`、`sensitivity`、`expiresAt`、`lastUsedInPromptAt`、`userFeedback`、`counterEvidenceDiaryIds`，旧数据读取时补默认值，高敏条目强制 `visibility=never_echo`。
- 回声质量闸新增 `memory-leak`，拒绝“我记得你 / 之前你 / 根据你的 / 长期洞察 / 近期记忆 / 用户画像 / 系统看到 / 档案显示”等外显记忆表达；普通“记忆”二字不禁。
- 增量更新 prompt 要求“保留旧理解，只修正新日记支持的部分”，并处理 90 天未提及主题的弱化/移除，避免拿很久以前的兴趣理解现在的用户。
- 小象回声的回复目标不是写温柔评论，而是帮助用户理解今天的自己。生成前应先在内部完成洞察草稿（今日主线、核心追问、情绪底色、关键转折、隐藏需求、人格特质、成长方向、核心洞察句），最终只输出用户可见的 `今日回声` 和 `用户可见回声`。

## 下次接手

- 开始任务前先读 `AGENTS.md`、`vault/TODO.md`、`vault/agent/memory-workflow.md` 和本文件。
- 如果任务涉及长期决策或阻塞，完成后同步更新本文件或 `vault/agent/decisions.md`。
- 当前工作区有多处未提交源码和文档改动；继续前先看 `git status --short`，不要覆盖用户已有修改。
## 2026-06-08 Android v1.0.2 发布交接

- 修复真机反馈的三类 Android 问题：安装页默认图标、APK 内图片相对路径破图、应用名原生配置乱码隐患。
- 新版 APK 为 `1.0.2` / `versionCode 3`，包名 `com.xiaoxiang.diary`，本地文件 `C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`。
- GitHub Release 已发布：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.2`；固定下载链接继续使用 `https://github.com/hlh-hal/xiaoxianglog/releases/latest/download/xiaoxiang-log-latest.apk`。
- 官网和更新清单已同步：`https://hlh-hal.github.io/xiaoxianglog/`、`https://hlh-hal.github.io/xiaoxianglog/app-update.json`。
- 正式签名 v2/v3 校验通过，证书 MD5 仍为备案填写的 `9a0e0281cd8b3070c425c22290fd3eb4`。后续 Android 包必须继续使用同一个 `xiaoxiang-release.jks`。
- 验证命令见 `vault/notes/daily/2026-06-08-android-v102.md`。若小米安装器仍提示未查询到 ICP，包名/证书一致时优先走厂商申诉或等待备案缓存刷新。

## 2026-06-08 Android v1.0.3 每日提醒重复通知修复

- 修复 Android 每日写日记提醒一次弹出两条的问题，原因是原生 `AlarmManager`、前端兜底轮询和服务端每日 Web Push 可能同时触发。
- 新版 Android 环境中每日提醒只走原生闹钟；App 启动或设置页操作时会主动关闭服务端 `dailyReminderEnabled`，清理旧版本遗留的服务端每日 Push。
- 互动通知（点赞、评论、好友申请）继续保留服务端通知链路。
- 新版 APK 为 `1.0.3` / `versionCode 4`，本地文件仍为 `C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`，Release 为 `https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.3`。
- 正式签名 v2/v3 校验通过，证书 MD5 仍为 `9a0e0281cd8b3070c425c22290fd3eb4`。验证详情见 `vault/notes/daily/2026-06-08-android-v103-notification.md`。
## 2026-06-09 APK 自有服务器主下载源

- 为改善国内下载速度，Android APK 主下载地址已从 GitHub Release latest 改为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`，GitHub Release latest 保留为备用镜像。
- 本地涉及文件：`src/config/appRelease.ts`、`public/app-update.json`、`docs/app-update.json`、`docs/index.html`。
- 当前正式 APK 已上传到服务器 `/dist/download/xiaoxiang-log-latest.apk` 并可通过公网 `/download/xiaoxiang-log-latest.apk` 下载；同时按计划上传了一份到 `/xiaoxiang-download/xiaoxiang-log-latest.apk`，供后续宝塔/Nginx alias 使用。
- 服务器下载验证：`200 OK`，大小 `13677401` 字节，Range 请求 `206 Partial Content`，下载后 SHA256 为 `D89DB206610FE9F79B76E5EF6E98DD293863E45D7DB752D0EDD7B0A93A0AB274`。
- GitHub Pages `app-update.json` 和官网已同步；交接详情见 `vault/notes/daily/2026-06-09-apk-self-hosted-download.md`。

## 2026-06-09 Android 隐藏 PWA 安装入口

- Android 原生 APK 内不再显示“安装到桌面”，顶部更多菜单、侧边栏抽屉和安装 Bottom Sheet 均通过 `!Capacitor.isNativePlatform()` 限制。
- 浏览器/PWA 环境仍保留该入口；验证命令 `npm run lint` 和 `npm run android:sync` 通过，Android assets 已同步到 `assets/index-Dr7LXTph.js`。
- 交接详情见 `vault/notes/daily/2026-06-09-android-hide-pwa-install.md`。

## 2026-06-09 Android 系统返回手势

- 新增 `@capacitor/app@8.1.0`，在 `src/components/Layout.tsx` 接管 Android `backButton` 事件。
- 系统返回手势现在会先关闭弹层/抽屉，再在二级路由 `navigate(-1)` 返回上一级；只有首页才退出应用。无历史但非首页时会回到 `/`。
- 验证命令：`npm run lint`、`npm run android:sync`、临时 JDK 21 环境下 `android\gradlew.bat assembleDebug` 均通过。
- 交接详情见 `vault/notes/daily/2026-06-09-android-back-gesture.md`。

## 2026-06-09 Android v1.0.4 发布

- 已重新发布 Android 正式签名 APK：`1.0.4` / `versionCode 5`，用于触发已安装 `1.0.3` 用户的首页更新提示。
- 自有服务器主下载 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` 已覆盖新版，大小 `13681579` 字节，SHA256 `ADB092C644BB46169EDC055846811B4D6F988F6E26609FC26D68D2F35A4496A9`。
- GitHub Pages `app-update.json` 已返回 `versionName 1.0.4` / `versionCode 5`，官网显示“当前版本 v1.0.4”。
- GitHub Release 备用镜像已创建：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.4`，latest 备用链接指向该版本。
- 交接详情见 `vault/notes/daily/2026-06-09-android-v104-release.md`。

## 2026-06-09 Android v1.0.5 更新公告修复

- 修复 Android 原生版首页不出现更新公告的问题：`shouldEnableApkUpdateNotice()` 不再在原生 Android 中按 hostname 排除 `xiaoxianglog.cn`。
- 已发布正式签名 APK：`1.0.5` / `versionCode 6`，主下载仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 服务器 APK 大小 `13681579` 字节，SHA256 `5A8F4242E6CF1B9B9C2EF0761206425B9E494A7FDD8E558AC3A3A6C8F8E1857F`。
- GitHub Pages `app-update.json` 已返回 `versionName 1.0.5` / `versionCode 6`，Release 备用镜像为 `https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.5`。
- 交接详情见 `vault/notes/daily/2026-06-09-android-v105-update-notice-fix.md`。

## 2026-06-09 Android 发布 Skill

- 已创建 Codex skill：`C:\Users\ASUS\.codex\skills\xiaoxiang-android-release`。
- 后续可用“发布小象日志安卓版”“打包推送到用户端”“更新 APK 并让首页弹更新公告”等触发全自动 Android 发布流程。
- Skill 只记录流程、路径、验证和安全规则，不保存 keystore、签名密码、FTP 密码或 token。
- 交接详情见 `vault/notes/daily/2026-06-09-android-release-skill.md`。
## 2026-06-10 Android v1.0.7 发布

- 已发布 Android 正式签名 APK：`1.0.7` / `versionCode 8`，包名 `com.xiaoxiang.diary`。
- 主下载地址 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` 已覆盖为新版，SHA256 `115DF438097F90574B481CC45C00392DE95C11665FAD3CDDB40C08B29757328E`。
- Android 内置更新检查默认地址已改为自有服务器 `https://xiaoxianglog.cn/app-update.json`，减少国内访问 GitHub 导致更新公告不弹的风险。
- GitHub Pages `app-update.json` 已同步到 `1.0.7 / 8`，Pages build 状态 `built`；GitHub Release 备用镜像为 `https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.7`。
- 交接详情见 `vault/notes/daily/2026-06-10-android-v107-release.md`。

## 2026-06-10 Android v1.0.8 滚动修复

- 已发布 Android 正式签名 APK：`1.0.8` / `versionCode 9`，用于修复真机上顶部/底部固定时中间内容无法上下滑动的问题。
- 主下载地址 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` 已覆盖为新版，SHA256 `286F11FBE9C32354AD4933FFB2949EDBEBAD367254313E921B5FD9730C27C356`。
- 主要改动：放松 Android 全局 `touch-action`，为主内容区和首页/日志圈/我的页面明确设置可滚动容器，首页滚动保存/跳转优先使用内容容器。
- GitHub Pages `app-update.json` 已同步到 `1.0.8 / 9`，Pages build 状态 `built`；GitHub Release 备用镜像为 `https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.8`。
- 交接详情见 `vault/notes/daily/2026-06-10-android-v108-scroll-fix-release.md`。
## 2026-06-10 Android 发布 Skill 改为自有服务器默认路径

- `xiaoxiang-android-release` skill 默认发布路径已改为只走自有服务器：更新 APK 到 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`，更新自有服务器 `https://xiaoxianglog.cn/app-update.json`，不再自动同步 GitHub Pages / GitHub Release。
- GitHub 备用镜像仍保留在 skill 文档中，但只有用户明确要求“同步 GitHub / 发备用镜像”时才执行。
- `release_preflight.py` 默认不再访问 GitHub Pages，减少预检耗时；如需检查镜像，使用 `--include-github`。
- 本次排查确认线上 manifest 与线上 APK 均为 `1.0.8 / versionCode 9`。如果手机端已安装 `1.0.8`，不弹更新提示是预期行为；下一次需要发布 `1.0.9 / versionCode 10` 或更高才能触发更新公告。
- 用户随后确认手机是 `1.0.7` 但仍无更新提示；进一步定位为静态 `https://xiaoxianglog.cn/app-update.json` 缺少 CORS 响应头，Android WebView 可能无法读取远端清单。已在 `src/services/updateNoticeService.ts` 增加 Capacitor 原生 HTTP 兜底，并在 `deploy/nginx/xiaoxiang-reverse-proxy.conf` 增加 `/app-update.json` CORS 模板；线上仍需宝塔/Nginx 实际应用该配置并 reload。
- 交接详情见 `vault/notes/daily/2026-06-10-android-release-skill-self-hosted-only.md`。

## 2026-06-11 小象回声 Auto Research

- 旧 Prompt Lab 手动页面已下线，不再使用 `http://localhost:3010/lab` 或 `npm run lab:echo-prompt`。
- 新流程是自动研究：生成器只看 prompt + 日记；评分器只看评分标准 + 日记 + 输出，不看 prompt；改进器只看 prompt 和扣分原因；棘轮器只 keep 不退步的版本。
- 本地命令：`npm run research:echo-prompt:ui` 打开可视化操作台；`npm run research:echo-prompt:quick`、`npm run research:echo-prompt`、`npm run research:echo-prompt:expanded` 保留为 CLI。
- 页面地址：`http://localhost:3010/research`。页面支持保存本地手动样本、启动研究、实时版本曲线、版本历史表、prompt/diff/commit 查看和最佳 prompt 下载。
- 结果目录：`artifacts/echo-prompt-research/runs/<runId>/`。最佳版本在 `best.prompt.txt`，迭代日志在 `iterations.jsonl`，分数表在 `scoreboard.tsv`，人工查看报告在 `report.html`。
- 独立版本库：`artifacts/echo-prompt-research/prompt-history/`，每轮生成 `vNNN` 并提交 Git；keep/discard 都保留，discard 不覆盖 `current/best.prompt.txt`。
- 线上安全边界：研究工具只产出本地文件，不自动改 `src/services/aiService.ts` 的线上 baseline。采用最佳 prompt 需要后续人工确认。

## 2026-06-11 Android v1.0.13 更新弹窗图标与帮助页版本

- 已发布自有服务器主链路 Android 正式包 `1.0.13 / versionCode 14`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告弹窗和首页更新入口图标改为正式桌面图标 `/icons/xiaoxiang-pwa-512.png`；不要误用旧卡通图 `/icons/xiaoxiang-log-icon.png`。
- 帮助页底部版本号改为跟随 `src/config/appRelease.ts` 的 `currentVersion`，不再写死 `Version 1.0.0`。
- 本次仅发布自有服务器，未同步 GitHub Pages / GitHub Release；验证详情见 `vault/notes/daily/2026-06-11-android-v113-icon-help-version-release.md`。

## 2026-06-11 小象回声 Auto Research UI 修复补充

- `http://localhost:3010/research` 已支持直接输入本轮原始 prompt；也可一键载入 baseline、candidate 或当前 best 作为 seed prompt。
- 历史版本查看已优化：版本号可点击，详情区会显示 prompt 原文、diff、评分摘要和 Git commit；服务端不再为单个版本详情遍历完整历史，避免 Prompt 原文区域空白或加载过慢。
- 该工具仍只写入 `artifacts/echo-prompt-research/` 和独立 prompt-history Git 仓库，不自动修改线上 `src/services/aiService.ts`。

## 2026-06-13 Android v1.0.14 黑边、滚动残影、导出修复发布

- 已发布自有服务器主链路 Android 正式包 `1.0.14 / versionCode 16`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告内容对应三处修复：顶部状态栏黑/灰边、首页滚动文字残影/中段空白、Android 导出日志图片保存失败。
- 线上 `app-update.json` 已返回 `1.0.14 / 16`，公网 APK SHA256 与本地正式签名包一致：`E7DC23A2DC66EDA03128B3263C23BF88D124FE71237F5459CCF1B44B0B3B1D92`。
- 本次仅发布自有服务器，未同步 GitHub Pages / GitHub Release；验证详情见 `vault/notes/daily/2026-06-13-android-v114-blackbar-scroll-export-release.md`。

## 2026-06-13 年度回声 v1

- 已新增 `/annual-echo?year=YYYY`，作为移动端优先的旧日记翻页式年度报告；入口可由搜索 `年度报告`、`年报`、`年度回声` 或 `2026年度报告` 等关键词触发。
- 年度统计本地计算，缓存只写 IndexedDB `annualEchoDigests`，不进 Prisma、不参与同步；缓存按年度日记 source hash 判断是否过期。
- AI 只负责克制生成：用户原话金句、年度总回应、证据明确的 `只要……我就……` 使用说明书；前端工具层会校验原文、证据、句式、去重，失败走本地 fallback。
- 用户本轮明确要求“暂时不用推送到用户端”，所以本次没有实现 12 月 16 日系统推送、后端定时任务、Android 本地通知、通知偏好字段或设置页开关。
- 验证：`npm run test:annual-echo`、`npm run lint`、`npm run build` 通过；本地 Vite + Playwright/Edge 冒烟验证了搜索入口、年度页、多条说明书展开/滚动和桌面宽度。


## 2026-06-20 Android v1.0.15 发布

- 已发布自有服务器主链路 Android 正式包 1.0.15 / versionCode 17，主下载地址仍为 https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk。
- 更新公告对应当天 daily note：编辑器移动端选区白块、写完日记后的活跃写作用时统计、消息页面长列表滚动。
- 线上 pp-update.json 已返回 1.0.15 / 17，公网 APK 与本地正式签名包 SHA256 一致：EA500B56857DCDEBC764F56146D2DDE5A50931F7195655CBFA0248E3CC73B38D。
- 本次未同步 GitHub Pages / GitHub Release；验证详情见 ault/notes/daily/2026-06-20-android-v115-release.md。


## 2026-06-22 Android v1.0.16 发布

- 已发布自有服务器主链路 Android 正式包 1.0.16 / versionCode 18，主下载地址仍为 https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk。
- 更新公告三项：导出日记图片中英文重叠修复、编辑器移动端光标/选区白块优化、写完日记后的真实写作用时统计修正。
- 线上 pp-update.json 已返回 1.0.16 / 18，公网 APK 与本地正式签名包 SHA256 一致：F3F764E1E8A9901FDA20E470E6D18FC5CCB7B7BAC1AFBB8F6DB11F80466AAAFE。
- 本次未同步 GitHub Pages / GitHub Release；验证详情见 ault/notes/daily/2026-06-22-android-v116-release.md。


## 2026-06-23 Android v1.0.17 发布

- 已发布自有服务器主链路 Android 正式包 1.0.17 / versionCode 19，主下载地址仍为 https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk。
- 更新公告三项：Android 编辑器选区/光标白块优化、写作用时统计 3 分钟思考上限、月度回声入口封面和六页阅读布局优化。
- 线上 pp-update.json 已返回 1.0.17 / 19，公网 APK 与本地正式签名包 SHA256 一致：9C5248DFAF926E5E52CBDD79F0F3016D642C7668E22D7204A3741A84ACBCE2C8。
- 本次未同步 GitHub Pages / GitHub Release；验证详情见 ault/notes/daily/2026-06-23-android-v117-release.md。

## 2026-06-24 Android v1.0.18 发布

- 已发布自有服务器主链路 Android 正式包 `1.0.18 / versionCode 20`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告三项：修复编辑页顶部正文滑动时压住日期和按钮；追补 Android App 选中文字和光标附近白色方块；关闭 Android WebView 强制深色合成，降低原生选区层冒白底概率。
- 线上 `app-update.json` 已返回 `1.0.18 / 20`，公网 APK 与本地正式签名包 SHA256 一致：`496E83FAFB1381EA9B8850FB18FDE1D4078BE80CB9DF47F831AF5B226D565A4C`。
- 本次未同步 GitHub Pages / GitHub Release；验证详情见 `vault/notes/daily/2026-06-24-android-v118-release.md`。
# 2026-06-24 Android v1.0.20 发布

- 已发布自有服务器主链路 Android 正式包 `1.0.20 / versionCode 22`，用于还原上一轮误改的 Android 文本选择手柄图标样式；主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 线上 APK 与本地签名包 SHA256 一致：`F10140FD6FC685CF1DBD3F53A26346110D00F271DF7BD566025EA142DB2EE936`；本次未同步 GitHub Pages / GitHub Release。交接详见 `vault/notes/daily/2026-06-24-android-v120-release.md`。

## 2026-06-24 Android 发布 skill 流程优化

- `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release` 已按发布复盘优化：默认自有服务器发布、GitHub 显式请求才处理、发布正常目标 8-12 分钟、强制 `D:\小象日志` 根目录 guard、APK 上传外层超时 300 秒、禁止 PowerShell bash heredoc、验证分为硬门槛和增强项。
- Skill 校验命令 `PYTHONUTF8=1 python C:\Users\ASUS\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\ASUS\.codex\skills\xiaoxiang-android-release` 已通过。

## 2026-06-24 Android v1.0.19 发布

- 已发布自有服务器主链路 Android 正式包 `1.0.19 / versionCode 21`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告三项：修复编辑页顶部正文滑动压住日期和按钮；追补 Android App 选中文字和光标附近白色方块；关闭 Android WebView 强制深色合成，降低原生选区层冒白底概率。
- 线上 `app-update.json` 已返回 `1.0.19 / 21`，公网 APK 与本地正式签名包 SHA256 一致：`9EE01434526D0A721BB85AFB6862CC798B1B40176CABC0A4FB5A0DF275F0EAA8`。
- 本次未同步 GitHub Pages / GitHub Release；验证详情见 `vault/notes/daily/2026-06-24-android-v119-release.md`。
## 2026-06-30 导出图片重叠回归最终修复

- 这次确认旧的 `<wbr>` / `\u200B` 边界补丁不是根因修复；真正的问题是 `html2canvas@1.4.1` 的文本测量会和浏览器 / Android WebView 的最终 fallback 字体排版漂移，导致中英混排偶发重叠。
- 日记导出 PNG 已从 `html2canvas` 切到 `html-to-image` 的 browser-native `foreignObject` 渲染；导出前会等待字体加载、图片解码和文字几何稳定，并把当前自定义字体内嵌到导出 DOM。
- 日记导出时统一强制 `text-size-adjust: none`、`white-space: pre-wrap`、`word-break: normal`、`overflow-wrap: anywhere`、`hyphens: none` 和最小 `line-height: 1.5`，避免不同 Android 机型 / 系统字号下再出现压字。
- 已删除旧的 `insertExportTextBreaks()` / `<wbr>` / `\u200B` 注入路径；后续如果回滚或重写导出链路，优先检查是否有人重新把这些逻辑带回来了。
- 回归验证命令：`npm run lint`、`npm run build`、`npx tsx src/utils/exportImage.test.ts`、`npm run test:exploration`、`npm run test:export-typography`、`npm run test:export-mojibake`、`npm run test:preservation`、`npm run test:preservation:verify`。
- Android APK 实测证据：当前代码构建并安装 `D:\小象日志\android\app\build\outputs\apk\debug\app-debug.apk` 到 `Pixel_8` 模拟器；真实导出文件包括 `小象日志_2026-05-20 (1).png`、`小象日志_2026-06-29 (2).png`、`小象日志_2026-06-29 (3).png`。其中 `(3)` 是 `font_scale=1.3` 下导出，换行改变但无重叠。
- 相关详细记录：`vault/notes/daily/2026-06-21-diary-export-overlap-fix.md`。
- 已正式发版为 Android `1.0.21 / versionCode 23`，更新公告聚焦“导出文字不重叠、背景图更稳”，并同步到自有服务器更新清单。
## 2026-07-01 月之回响封面设计还原页
- 新增独立预览路由 `/monthly-echo-design-demo`，用于把用户提供的月之回响封面截图还原成项目内可运行的 HTML/CSS 页面，不改动现有 `/monthly-echo` 业务逻辑。
- 新增页面文件 `src/pages/MonthlyEchoDesignDemo.tsx`，按原图 947×1661 比例做固定舞台缩放。
- 用户先后指出“书本和右上圆圈差异很大”以及文字区遮罩形成突出的块。最终保留整张参考图 `public/monthly-echo/monthly-echo-cover-reference.png` 作为单一视觉资产，移除所有纸面遮罩、阴影、噪点和重复可见文字；文字语义通过屏幕阅读器专用结构保留。
- 验证已通过：`npm run lint`，以及本地 `npm run dev` 后用 Puppeteer + 本机 Chrome 打开 `http://127.0.0.1:3000/monthly-echo-design-demo` 做实际截图检查。
- 视觉验证画布为 947×1661，书本、圆环、文字和纸张纹理均与参考图保持同层，不再出现块状边界。若后续要求文字可编辑或内容动态化，需要先取得无字底图和独立书本/花束/圆环素材。
- 已将该封面正式替换到 `/monthly-echo` 的第一屏入口，使用 `background-size: contain` 保持 947×1661 原始比例、不拉伸书本与圆环；点击底部箭头或从箭头区域直接上滑均可进入第二屏，其余月度回响数据、内容页和海报保存流程不变。
- 手机视口回归：Puppeteer 在 390×844 下模拟 ready 数据，上滑与点击后的滚动位置均为 `844px`；`npm run lint`、`npm run build` 通过。
- Android 验证时发现线上 `/api/monthly-echo` 返回 404，且新装调试包没有登录 token。为避免接口状态挡住入口视觉，`MonthlyEcho.tsx` 已改为始终把封面作为第一屏；加载、空数据、未登录或请求失败状态统一留在第二屏，成功月报的原有 6 屏流程不变。
- 已重新执行 `npm run android:sync`、`:app:installDebug` 并在 Pixel_8 模拟器实测：首页正常显示封面；浏览器模拟 404 时第一屏无状态文案，上滑至 `844px` 后第二屏显示请求失败。真实月报内容仍依赖线上后端完成 schema 同步、部署和重启。

## 2026-07-03 月度回响叙事页设计还原
- 新增独立预览路由 `/monthly-echo-story-design-demo` 和页面 `src/pages/MonthlyEchoStoryDesignDemo.tsx`，用于展示“六月的回响”叙事页；2026-07-10 已正式接入 `/monthly-echo` ready 状态的第二页。
- 最初按 245×735 低清截图做 HTML/CSS 重绘；用户随后提供 941×1672 高清成图并强调清晰度，最终改为把 `public/monthly-echo/monthly-echo-story-reference.png` 作为单一视觉资产，删除低清植物裁片、重绘文字和水彩层，避免二次栅格化与纹理偏差。
- 页面按 941×1672 原始比例使用响应式固定舞台完整显示；保留屏幕阅读器专用的标题、月份、叙事正文和结语语义。
- 已验证原始 941×1672 和 390×844、2×像素密度手机视口；手机画布为 390×693，保持比例、水平居中且不裁切。`npm run lint`、`npm run build` 通过。
- 正式月度回声的成功路径现为“封面 → 高清叙事页 → 三个关键时刻 → 行动轨迹 → 反复主题 → 回声信”；旧“本月地图”派生数据和样式暂时保留但不渲染，便于回滚。
- 第二页使用 `object-fit: contain` 保持高清图比例，底部透明按钮点击进入第三页，纵向上滑沿用原滚动容器。Puppeteer 在 390×844、2×像素密度下验证：第二页 `scrollTop=844`，点击或上滑后均为 `1688`；加载、失败或空数据路径固定为“封面 → 高清叙事页 → 状态页”，保证第二页不被接口状态占用。

## 2026-07-10 写作时间统计状态机修复

- 已修复 1.5 秒自动保存截断 3 分钟思考窗口的问题：自动保存只投影累计时长，完成、退出、后台、页面隐藏、系统中断和空闲超时才关闭片段。
- `activeWritingSeconds` 仍是唯一云端累计字段，不改 Prisma/API；本地增加 15 秒检查点，App 异常终止后启动时按较大值恢复，不计入关机空档。
- 返回键现在会单独检查待落盘写作时间，正文已自动保存也不会直接漏掉最后片段；完成卡统一读取保存后的累计秒数。
- 新增 `npm run test:writing-time`，完整 `npm test`、lint、build、编辑器真实自动保存 E2E 和写作时间浏览器验证均通过。Android 实体设备后台/锁屏仍待人工验收，详细记录见 `vault/notes/daily/2026-07-10.md`。

## 2026-07-11 月度回声地图页设计还原

- 新增独立预览路由 `/monthly-echo-map-design-demo` 和页面 `src/pages/MonthlyEchoMapDesignDemo.tsx`，展示“如果把这个月看成一张地图”页面；同日已接入正式 `/monthly-echo` 的第三页。
- 使用用户提供的 941×1672 高清图 `public/monthly-echo/monthly-echo-map-reference.png` 作为单一视觉资产，完整保留路线、节点、植物、水彩、纸张纹理和文字清晰度；页面补充屏幕阅读器可读的标题、主线、三个节点和总结文本。
- 画布按 941×1672 原始比例等比完整显示。已验证原始尺寸及 390×844、2×像素密度手机视口；手机画布为 390×693，水平居中且无裁切。
- 正式成功路径现为“封面 → 高清叙事页 → 高清地图页 → 三个关键时刻 → 行动轨迹 → 反复主题 → 回声信”。加载、空数据或接口失败时固定为“封面 → 高清叙事页 → 高清地图页 → 状态页”，不让网络状态抢占前三页。
- 浏览器模拟 ready 数据确认地图页为 `scrollTop=1688`，地图箭头进入第四页 `scrollTop=2532`；模拟接口 404 时，地图页仍为第三页且状态不可见，第四页显示失败状态。`npm run build` 通过；`npm run lint` 当前被无关的 Prisma `DailyEchoJob` 生成客户端类型缺失阻断，待重新生成 Prisma 客户端后复查。

## 2026-07-11 月度回声关键时刻页设计还原

- 新增独立预览路由 `/monthly-echo-moments-design-demo` 和页面 `src/pages/MonthlyEchoMomentsDesignDemo.tsx`，展示“这个月，小象想帮你留下三个时刻”。2026-07-12 已将这张高清图正式接入 `/monthly-echo` 的第四页，替换动态关键时刻渲染；旧数据与辅助函数仍保留，便于安全回滚。
- 使用用户提供的 941×1672 高清图 `public/monthly-echo/monthly-echo-moments-reference.png` 作为单一视觉资产，保留三张照片、回形针、胶带、纸张边缘与纹理；页面额外提供屏幕阅读器可读的三条时刻和总结语义。
- 已验证原始尺寸及 390×844、2×像素密度手机视口；手机画布为 390×693，水平居中且无裁切。正式成功路径现为“封面 → 高清叙事页 → 高清地图页 → 高清关键时刻页 → 行动轨迹 → 反复主题 → 回声信”；加载、空数据或接口失败时固定为“封面 → 高清叙事页 → 高清地图页 → 高清关键时刻页 → 状态页”。浏览器确认第四页 `scrollTop=2532`，底部箭头进入第五页 `scrollTop=3376`；模拟接口 404 时仍可显示第四页，并进入失败状态页。`npm run build` 通过；`npm run lint` 仍受无关的 Prisma `DailyEchoJob` 生成客户端类型缺失阻断。

## 2026-07-12 月度回声行动轨迹页设计还原

- 新增独立预览路由 `/monthly-echo-actions-design-demo` 和页面 `src/pages/MonthlyEchoActionsDesignDemo.tsx`，展示“这个月，你不是只是在想。”的行动轨迹页；同日已替换正式 `/monthly-echo` 的第五页，旧动态行动轨迹实现保留以便回滚。
- 使用用户提供的 941×1672 高清图 `public/monthly-echo/monthly-echo-actions-reference.png` 作为单一视觉资产，保留时间轴、图标、干花、胶带、小象插画和纸张纹理；页面同时提供屏幕阅读器可读的五项行动记录和总结文本。
- 已在 390×844、2×像素密度浏览器视口验证，画布为 390×693，整页无溢出、无裁切。成功与 404 降级路径均在 `scrollTop=3376` 展示第五页，底部箭头进入第六页 `scrollTop=4220`；失败状态页位于第五页之后。`npm run build` 通过。

## 2026-07-12 月度回声反复主题页设计还原

- 新增独立预览路由 `/monthly-echo-theme-design-demo` 和页面 `src/pages/MonthlyEchoThemeDesignDemo.tsx`，并将用户提供的 `public/monthly-echo/monthly-echo-theme-reference.png` 正式替换 `/monthly-echo` 的第六页。
- 视觉资产保持原始 941×1672 比例，完整保留圆环、水彩纸条、时间线、胶带和纸张纹理。外层画布使用纸张色，只保留截图本身的圆角黑边，避免额外出现不属于设计稿的黑色留白。
- 成功路径现为“封面 → 叙事 → 地图 → 关键时刻 → 行动轨迹 → 反复主题 → 回声信”；失败、加载和空数据路径也保留前六张视觉页后才显示状态页。浏览器在 390×844、2×像素密度下验证：第六页为 `scrollTop=4220`，底部箭头进入第七页 `scrollTop=5064`；模拟 404 路径顺序相同。`npm run build` 通过。

## 2026-07-12 月度回声回声信页设计还原

- 新增独立预览路由 `/monthly-echo-letter-design-demo` 和页面 `src/pages/MonthlyEchoLetterDesignDemo.tsx`，并将用户提供的 `public/monthly-echo/monthly-echo-letter-reference.png` 正式替换 `/monthly-echo` 的第七页。
- 使用原始 941×1672 高分辨率图，完整保留信纸、月夜照片、干花、胶带、水彩总结、签名与底部箭头。第七页是阅读终点，箭头只作为设计稿视觉元素，不增加未定义的点击跳转。
- 在 390×844、2×像素密度浏览器视口中，预览画布为 390×693 且无溢出；正式成功和模拟 404 路径均在 `scrollTop=5064` 显示第七页，后者的状态页位于其后。当前正式月度回声已完整使用七张高清视觉页；`npm run build` 通过。

## 2026-07-15 月度回声动态生成 V2.2 与 Android 验收

- 七页正式月度回声已改为保留原视觉资产、由 HTML/CSS 注入真实日志生成文字；前端只渲染后端确定性编译的结构化 JSON，不再把整张带示例文字的图片覆盖到动态内容上。
- 月度信固定采用 6 段证据结构，目标 350–430 个中文字符并保留 2–3 个真实日期锚点；昵称在读取报告时动态注入。证据不足时宁可缩短，不允许补写虚构日期、事件或原句。
- 月报队列现在按 `promptVersion` 隔离。prompt 版本变化会重置旧任务重试预算；聚合 AI 输出上限提高到 4200 tokens，避免 JSON 截断造成看似“生成很久”的失败循环。
- 本地 2026-07 报告已真实跑通，当前任务版本为 `monthly_arc_v2_2|monthly_echo_render_v2_2`，生成 6 段、356 字、3 个日期锚点；任务一次成功。
- Android `Pixel_8` 模拟器已完成七页 H5 验证，第七页签名和小象图标完整，底部绿色残影已消除。复测地址为 `http://127.0.0.1:3000/monthly-echo?monthKey=2026-07`，需要保持前端 3000、后端 3001 并执行两条 `adb reverse`。
- 验证命令：`npm run test:monthly-echo`、`npm run lint`、`npm run build`、`cd server && npm run build`、`git diff --check`。

## 2026-07-15 Android v1.0.22 发布

- 已发布 `1.0.22 / versionCode 24`：小象回声实时流式呈现、七页动态月度回声和手势翻页，以及导出图片有序列表编号修复；线上更新公告和自有服务器 APK 均已验证。
- 前端、月度回声资源与后端运行模块已经上传；服务器已完成 `npx prisma generate`、`npm run db:push` 和 Node 重启。线上健康检查为 `daily-echo-background-20260711`，月度回声/小象回声接口均已由 404 变为 401，确认服务端新路由已接管；FTP 部署仍不会执行远程命令。

## 2026-07-16 月度回声回声信真机布局修复

- 第七页回声信已从“上下两段正文 + 独立绿色结论块”改为单一连续正文流；`finalInsight` 作为正文最后一段，不再生成会与正文重叠的绿色字块。
- 正文容器使用 `min-height + max-height` 和四档内容密度；右侧 `shape-outside` 安全区会依次避开照片、花束和花茎，长文仍限制在单页署名上方。
- 画板向右补偿左侧裁切后，落款文字和小象图标分别向左移动 8%，使用 `darken` 融合纸张纹理；小象不再被视口右边缘截断。
- Pixel_8 模拟器以 448 字中文长文验证：正文 `clientHeight=scrollHeight=576`，末段完整，末段底部约为 `740.84px`，署名安全区从约 `814.64px` 开始；花束和正文无交叠。
- 验证通过：`npm run lint`、`npm run test:monthly-echo`（23 项）、`npm run build`、`npm run android:sync`、`gradlew assembleDebug`、APK 覆盖安装；模拟器测试包为 `1.0.22`。

## 2026-07-16 月度回声行动轨迹空白修复

- 根因不是整份月报生成失败：底部总结有内容但 `actionTrace` 为空，是行动识别白名单漏掉“处理、复习、推进、协商”等真实行为，聚合清洗后前端只剩五个固定图标。
- `normalizeMonthlyArcV2` 现在会优先使用 AI 的有效行动，并从带有效 `evidenceId` 的 `DailyTraceNode.actions` 确定性补齐；日期和原句均从证据注册表解析，不允许推测。相同证据只保留一条行动，避免换一种说法重复占位。
- 前端第五页在确实没有有效行动时显示页级 fallback，不再出现无解释的空时间线。视觉资产、图标、干花和底部纸卡保持不变。
- 生成版本升级为 `daily_trace_v2_1`、`monthly_arc_v2_4`、`monthly_echo_render_v2_4`，旧报告首次打开会按需重生。
- 本地真实 2026-07 报告重生为 `ready`，返回 6 条不重复行动，正式页面按五个图标上限展示前 5 条；390×844 截图见 `tmp/monthly-echo-runtime/actions-ready-390x844.png`。

## 2026-07-17 Android 微信登录基础能力

- 已实现 Android 微信登录、微信新用户邮箱注册、已有邮箱账号设置页绑定/解绑以及统一 `userId` 数据归属；邮箱登录、JWT 和 local-first 同步契约保持不变。
- Prisma 新增 `ExternalIdentity`、`ExternalAuthGrant`，本地数据库已备份并 `db:push`；线上尚未执行任何 schema、环境变量或服务部署。
- Android 已接官方 OpenSDK `6.8.40` 和自研 Capacitor 回调桥接；服务端配置缺失或开关关闭时，普通 Web/PWA 与 Android 均不会暴露可用入口。
- 自动化与构建已通过。下一阶段不是继续改代码，而是完成微信开放平台移动应用审核、配置线上密钥、同步线上 Prisma schema，并用正式签名 APK + 微信真机验证授权、绑定、解绑和同一 `userId` 数据恢复。

## 2026-07-18 Android v1.0.23 月度回声 UI 发布

- 已发布 `1.0.23 / versionCode 25`，只包含月度回声 UI：回声信连续正文流、封面/翻页提示细节和行动轨迹空状态，未包含尚在开发的微信登录功能。
- 线上 `app-update.json` 与主下载 APK 已反向验证为 `1.0.23 / 25`，APK SHA256 为 `728A4123A0E64DD990EE6C722F67DB20444956D63D51BE46F6D04AB196ADEF43`，包名和备案签名均正确。

## 2026-07-19 Android v1.0.24 月度回声 UI 发布

- 已发布 `1.0.24 / versionCode 26`：重复事件归纳、反复主题时间轴和自适应结论、关键时刻长摘要、封面清晰度与行动页箭头纹理修复；微信登录和后端 v2.5 生成链路未随此版本发布。
- 主下载 APK 和线上更新公告已反向验证通过。FTP 对约 47MB 文件会在约 95 秒重置；可先上传得到部分文件，再在 FTP 连接冷却后使用断点续传补齐。当前备用服务器目录仍未更新，主 Nginx 下载路径可用。

## 2026-07-21 Android v1.0.27 用户端发布

- 已发布 `1.0.27 / versionCode 29`，主 APK 与更新公告公网验证通过。内容包括每日回声验收后展示、心情趋势当天回顾、日期范围导出和月度回声排版/历史兼容修复。
- FTP 不稳定导致前后端只能分批上传；前端关键产物已上线。线上后端尚缺 `dist/lib/monthlyEchoV2.js` 的可靠上传确认，因此暂缓 Node 重启；补传成功后才能让月度生成 v2.10 完整接管。

## 2026-07-19 月度回声第二页职责拆分

- 根因确认：第二页概览和第六页反复主题此前都消费 `recurringPattern`，同时展示反复问题、出现日期和演变问题，属于信息架构重复，不是单纯视觉相似。
- 第二页现改为独立的“情绪轨迹”职责，只展示此前已生成但未渲染的 `emotionArc`，并补充日记、关键时刻和真实行动数量；第六页继续独占反复问题时间轴和转折日期。旧 overview 字段仍随 schema v2 返回以兼容现有客户端，但不再参与第二页渲染。
- render 版本升级为 `monthly_echo_render_v2_6`，旧报告按现有版本机制重新编译；未修改月度聚合 prompt、数据库结构或第六页数据链路。选择保留七页而不是删除第二页，以维持现有阅读节奏和翻页契约。
- 验证通过：`npm run test:monthly-echo`（31 项）、`npm run lint`、根目录 `npm run build`、`server npm run build`；390×844 浏览器截图为 `tmp/monthly-echo-runtime/overview-emotion-v26-final-390x844.png` 和 `recurring-v26-390x844.png`。本次未发布 APK、未部署线上。

## 2026-07-19 月度回声「本月情绪浮现」

- 第二页由单句 `emotionArc` 再次升级为证据情绪集合：只展示日志原句明确支持的 `0–5` 个情绪，每项包含情绪名、服务端解析日期、代表性原句、克制 meaning 和 evidenceIds；同一证据、近义情绪、事件标签和无效 ID 会被过滤。
- DailyTrace 明确禁止从加班、旅行、沟通、完成任务等事件推断情绪；月度 prompt 不再要求月初/月中/月末，也禁止默认紧绷、拉扯、松动、改善或治愈。版本为 `daily_trace_v2_2`、`monthly_arc_v2_6`、`monthly_echo_render_v2_7`，旧 JSON 字段继续兼容，无数据库迁移。
- 参考稿与 AI 编辑后的无字底板分别为 `public/monthly-echo/monthly-echo-emotions-reference.png`、`monthly-echo-emotions-textless-v1.png`；透明撕边纸片为 `monthly-echo-emotion-card-paper.png`。固定底板保留纸纹、圆环、金色纸条、花枝、胶带和底部白纸，动态 HTML 根据 0–5 条数据切换空状态、单卡、双卡、2×2 与五卡布局。
- 视觉预览支持 `/monthly-echo-v2-design-demo?page=2&emotionCount=0..5`。390×844 六种状态截图位于 `tmp/monthly-echo-runtime/emotions-v27-final/`，卡片内容区均满足 `clientHeight=scrollHeight`；验证通过 `npm run test:monthly-echo`（34 项）、前后端 build，未发布 APK、未部署线上。

## 2026-07-19 月度情绪关联真实日志事件

- 情绪卡第二行不再只显示抽象 meaning：服务端会按情绪证据所属的同一篇日志，确定性关联已校验的 `importantEvents`、行动、冲突、关系或小变化，返回 `event/eventEvidence/eventEvidenceIds`；页面优先显示“当时：具体事件”，找不到有效事件才保留 meaning，不跨日拼接、不补写。
- DailyTrace 对“同一原句同时包含事件和明确感受”的情况，同时输出 `importantEvents` 与 `emotionTone` 并共用原句证据；月度聚合在 AI 漏掉 emotions 时，会从明确的 DailyTrace 情绪声明确定性补齐，并把单字“乱”规范为“混乱”。
- 版本升级为 `daily_trace_v2_3`、`monthly_arc_v2_9`、`monthly_echo_render_v2_10`，旧报告按现有版本机制重建，无数据库迁移、无新增 AI 请求类型。
- 本地 2026-07 的 11 篇真实日志已完整重建到 ready；最终严格保留 1 个情绪与 1 个同篇真实事件证据。Pixel 8 模拟器通过正式 `/monthly-echo?monthKey=2026-07` 验收，单卡无溢出、无横向滚动，正常短滑每次只前进一页。截图：`tmp/monthly-echo-real-test/android-device-real-event.png`。未发布 APK、未部署线上。

## 2026-07-20 行动轨迹长标题布局

- 第四条行动标题超过 18 个字符时，场景短语仍显示在标题下方；第五条日期、标题与叶子节点整体下移，左侧绿色时间线随内容延长。短标题布局、其它节点和页面总结保持不变。
- 旧叶子节点由同源纸纹柔边遮罩清除，下移节点继续复用原图素材，避免安卓高 DPR 下出现遮罩接缝。
- 绿色延长线最终采用从心形节点下沿到叶子节点内部的单段连续覆盖，消除原图线段与补绘线在遮罩边缘出现的细小断口。
- 390×844 与 Pixel 8 安卓模拟器（Chrome 视口 `412×784 / DPR 2.625`）验证无重叠和横向溢出；场景短语到下一日期约 `8.87px`，第五条标题到总结卡约 `50.78px`。专项测试 37 项通过。截图：`tmp/monthly-echo-runtime/actions-long-title/actions-extended-android-verified-device.png`。未发布 APK、未部署线上。

## 2026-07-20 Android v1.0.25 发布

- `1.0.25 / versionCode 27` 已发布到自有服务器；更新公告聚焦“本月情绪浮现”、同篇日志事件证据和行动轨迹长标题/连续时间线。
- 公网 APK 与本地正式签名包 SHA256 一致，包名 `com.xiaoxiang.diary`，v2/v3 签名通过，证书 MD5 为既定正式指纹；公网 manifest 为 code 27 且使用自有下载地址。GitHub 镜像按默认策略未同步。
- 线上前端入口为 `assets/index-CN7k6y1U.js`，远端与本地 SHA256 一致。月度回声 3 个服务端源码及 12 个编译文件已最小上传，线上 `.env` 未覆盖。
- `deploy-upload.ps1` 新增 `back-runtime`（完整 dist/src、保留 `.env`）和 `monthly-echo-runtime`（仅月度回声模块）安全目标，避免发布后端时误覆盖线上环境变量。
- 待办：线上 Node 进程仍为 `pid 11388`，FTP 不会触发重载；需要在宝塔重启 `C:\wwwroot\xiaoxiang-server` 后再验证新 prompt/render 版本实际接管。

## 2026-07-20 Android v1.0.26 月度回声兼容热修复

- 真机安装 `1.0.25` 后打开历史月报会在第二页执行 `page.emotions.slice()` 时崩溃；根因是旧 report schema 没有新增的 `overview.emotions` 字段。
- 前端新增 `normalizeOverviewEmotions()`：字段不存在、为 null 或类型错误时确定性返回空数组，第二页进入既有温和空状态；情绪条目 key 对缺失 `evidenceIds` 也做兼容。专项测试新增旧报告用例，共 38 项通过。
- 已发布 `1.0.26 / versionCode 28`。公网 APK SHA256 为 `9F4D7CBF641942F9ECE4870FB199DDE82D1AEEFB3082C279C2B0F74CDD08131E`，包名、签名、版本与 manifest 硬校验通过。前端 FTP 因连接冷却首次失败，第二次 43/43 成功但耗时约 425 秒；APK 上传约 85 秒。GitHub 镜像未同步。

## 2026-07-20 月度真实证据回填修复

- 真机截图显示第二页情绪为空、第五页只有一条行动。线上健康接口仍为旧 Node `pid 11388`，是旧报告没有按新 prompt/render 版本重建的首要原因。
- 本地真实七月链路确认：DailyTrace 已持有“有些乱、紧张、期待”等原句及清理、散步、求助、拒绝等多条行为，但模型有时把本人行动只归入 `importantEvents`，并漏掉证据原句里的明确情绪；月度 fallback 原先只消费 `trace.actions`。
- `normalizeDailyTraceV2` 现在从已经过连续原句校验的 evidenceQuotes 中确定性恢复明确情绪，将“有些乱”规范成“混乱”，并把 importantEvents 中用户本人完成的可观察行为补入 actions；朋友/同事等第三方行为会被排除，不从普通事件推断情绪。
- 版本升级为 `daily_trace_v2_4 / monthly_arc_v2_10 / monthly_echo_render_v2_11`，促使旧 trace、arc 和 report 重建。专项测试 41 项、lint、server build 通过；15 个目标服务端文件已上传且未覆盖线上 `.env`。待宝塔重启后做真实账号验收。

## 2026-07-21 recurring lead 占位符修复（待发布）

- 真机截图发现第六页显示字面量“当你……时”，根因是模型输出占位句式后服务端只校验 evidenceIds，没有校验 lead 文本。
- 本地修复：`normalizeRecurringLead()` 拒绝 `……`、`...`、某件事等占位内容，改从第一条已校验 occurrence 的真实场景重建条件；Prompt 同步禁止占位 lead。
- 版本升级为 `monthly_arc_v2_11 / monthly_echo_render_v2_12`；42 项月度专项测试、lint、server build 通过。用户明确暂不推送到用户端，当前仅保留本地改动。

## 2026-07-24 官网白屏与原子发布修复

- 官网白屏根因为线上 `assets/index-B_vqF2v_.js` 被 FTP 截断到 `2,354,070` 字节，第 2898 行停在半截字符串；用户数据和 API 未丢失，Android 因使用 APK 内置资源未受影响。
- `deploy-upload.ps1` 已升级为带门禁的两阶段发布：所有文件上传后校验 FTP SIZE；主 JS/CSS 在入口切换前经公网下载校验字节数与 SHA256，JS 再执行 `node --check`；`index.html` / `sw.js` 使用临时文件、rollback 备份和 FTP rename 切换，失败自动恢复。
- 当前 FTP 不允许 RNTO 直接覆盖已有文件，会返回 553；原子切换必须先把旧文件改名为备份。新增 `front-activate`，用于 payload 已验证但入口激活失败后的安全重试。
- 线上现已引用 `assets/index-BFHyofyt.js`，大小 `2,368,928`，SHA256 `7A39CB21445089EAB397025913378C5B5754CE37A77E1DED699C829B2A934D24`。全新无缓存 Edge/Puppeteer 验证 HTTP 200、React 挂载、正文正常且控制台/page error 为 0。详细记录见 `vault/notes/daily/2026-07-24.md`。
