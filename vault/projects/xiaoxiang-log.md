# 小象日志

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
