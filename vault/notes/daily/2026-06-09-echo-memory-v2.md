# 2026-06-09 小象回声记忆系统 v2

## 本次变更

- 按 2026-06-09 多视角汇总报告落地“先筛选、再隐形注入”的小象回声记忆系统 v2；本轮不改后端、不加线上埋点、不部署。
- `EchoMemoryEntry` 增加 `kind`、`visibility`、`sensitivity`、`expiresAt`、`lastUsedInPromptAt`、`userFeedback`、`counterEvidenceDiaryIds`，旧热层数据读取时自动补默认值；`sensitivity=high` 会强制 `visibility=never_echo`。
- `aiService.ts` 新增 `buildPromptMemoryPack()`：只从 active、未过期、未拒绝、非高敏、非 `never_echo` 条目中按自然相关性选择 0-2 条；没有相关条目时返回空包，`seed` 不再单独注入。
- 选择器要求先有内容交集才允许强化次数加分，避免“强化次数高但不相关”的旧记忆被强行注入；英文停用词和中文 4 字窗口用于降低误召回、保留“小象回声提示词”与“小象回声”这类自然子短语匹配。
- 回声 prompt 使用“内部连续性线索”文案，要求只影响语气、分寸和自然连续性，不输出“我记得 / 之前你 / 系统看到 / 根据你的模式”等泄漏感表达。
- `validateDailyEchoContent()` 增加 `memory-leak` 拒绝原因，拦截“我记得你 / 之前你 / 根据你的 / 长期洞察 / 近期记忆 / 用户画像 / 系统看到 / 档案显示”等表达，但不禁普通“记忆”二字。
- 回声成功生成且使用了 `PromptMemoryPack` 条目后，会更新对应热层条目的 `lastUsedInPromptAt`；保存失败只写 console，不影响回声返回。
- 热层更新 prompt 允许 `add/replace` 返回 `kind`、`visibility`、`sensitivity`、`expiresAt`；前端校验病理化/诊断化词汇并拒绝写入，高敏条目强制不进入回声。
- 设置页主体验从 JSON textarea 改为“近期记忆线索”卡片；四个操作为“忘记 / 改一下 / 不再这样理解我 / 标记太敏感”，高级 JSON 编辑改为折叠入口。长期洞察区域改为状态说明和只读摘要。
- 新增 `src/services/echoMemoryControl.ts` 承载设置页四个卡片操作的纯函数，避免 UI handler 里散落状态变更逻辑。
- 新增本地离线评估 `tests/echo-memory-eval.test.ts`，覆盖冷启动、短日记、过期、拒绝、`never_echo`、高敏、矛盾/边界、成长变化、tone-only、近期复用降权、最多 2 条、敏感日记不强行解释、泄漏校验、普通“记忆”用词不过度拦截。

## 验证

- `npm run test:echo-hot-memory` 通过；包含旧数据归一化、热层操作、PromptMemoryPack 过滤、设置页卡片操作纯函数。
- `npm run test:daily-echo-quality` 通过；包含冷层不直接注入、热层隐形注入、低相关空包、`memory-leak` 拒绝。
- `npm run test:echo-memory-eval` 通过；共 12 个离线 prompt pack fixture + 2 个质量校验 fixture。
- `npm run test:insight-draft` 通过；冷层仍保持本地索引和同步隔离。
- `npm run lint` 通过。
- `npm run build` 通过；仅保留既有 `diaryService.ts` 动静态导入和大 chunk 警告。
- 本地 Vite + Chrome 移动视口打开 `/settings/insight-draft` 冒烟通过，文本包含“小象回声记忆 / 近期记忆线索 / 高级 JSON 编辑”，截图：`artifacts/echo-memory-v2-settings-mobile-debug-2026-06-09.png`。

## 云端上传

- 2026-06-09：按用户要求上传到云端服务器；本次只发布前端 `dist/`，没有上传后端、没有修改 Prisma、没有重启 Node。
- 发布前将前端构建标识更新为 `echo-memory-v2-20260609-1`，将 PWA 缓存版本更新为 `xiaoxiang-pwa-v15`。
- 重新验证并通过：`npm run test:echo-hot-memory`、`npm run test:daily-echo-quality`、`npm run test:echo-memory-eval`、`npm run test:insight-draft`、`npm run lint`、`npm run build`。
- 执行 `deploy-upload.ps1 -Target front`，20/20 个前端文件上传 OK。
- 线上首页 `https://www.xiaoxianglog.cn/` 已引用 `assets/index-DXLQuVJK.js` 和 `assets/index-CBNdLnOs.css`；线上 `sw.js` 已返回 `CACHE_VERSION = 'xiaoxiang-pwa-v15'`。
- 线上 JS `assets/index-DXLQuVJK.js` 与本地 `dist/assets/index-DXLQuVJK.js` 长度均为 `2142039`，SHA256 均为 `61BC5518DA67CDE5A9061416B86CDE8896A9CE591F312296D722EDEAABD037A9`。
- 线上 `/api/health` 返回 `build: cpamc-only-20260520`、`pid: 2984`，后端未变化。

## 后续注意

- 本轮没有新增 `MemoryEvidence` / `MemoryMutationLog` store，没有云端同步记忆，也没有线上行为埋点；后续如果要做评估，只能继续走本地离线或用户明确同意的本地诊断包。
- 设置页非空卡片的真实浏览器点击链路本轮改为用纯函数单测覆盖状态变更；空状态已做移动视口浏览器冒烟。
- 当前工作区已有大量本次之外的未提交改动；后续接手前先看 `git status --short`，不要误回滚 Android、通知、部署、旧文档等不相关变更。
