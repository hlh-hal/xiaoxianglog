# 小象日志工作日志

这份文档是旧交接日志和近期索引。新窗口先读 `AGENTS.md`、`vault/TODO.md`、`vault/agent/memory-workflow.md` 和相关 `vault/projects/*.md`，再读这里和相关 `.kiro/specs/...`。

维护原则：有长期价值的交接内容优先写入 `vault/`；这里只记录重大变更、关键坑、反复纠结过的问题和可复用模式索引。普通小改不写，避免变成流水账。

## 当前项目状态

- 项目定位：小象日志是偏移动端体验的图文日记应用，包含日记编辑、图片、主题背景、导出分享、历史版本、AI 聊天、社区、好友、通知、排行、账号和数据同步。
- 技术栈：Vite 6、React 19、TypeScript、Tailwind CSS 4、Tiptap、IndexedDB、本地优先同步；后端在 `server/`，使用 Express、TypeScript、Prisma、SQLite。
- 交接入口：稳定规则和持久记忆规则看 `AGENTS.md`；跨会话状态和待办看 `vault/`；单个复杂问题的完整分析看 `.kiro/specs/...`；最近发生过什么和哪些坑别重复踩可看本文件。

## 最近重大变更

### 2026-05-23 工作日志机制

- 新增本文件作为跨窗口交接总账，重点记录功能变更、踩坑记录、反复纠结的问题和模式总结。
- 维护频率采用“重大变更才更新”：核心功能、接口、数据库、部署、同步、认证、导出、线上配置或高影响 bug 变化时必须补充。
- `AGENTS.md` 放稳定开发规范和持久记忆规则，本文件记录近期上下文和经验沉淀，二者不要互相复制大段内容。

### 2026-05-23 日志导出长文失败定位与修复记录

- 影响范围：编辑器分享里的“保存到本地”导出 PNG 链路。
- 详细规格：`.kiro/specs/diary-export-long-text-fails/`。
- 关键结论：长日志失败的主因不是“内容太长”，而是长日志更容易包含标题、引用、列表、代码块、链接等元素，触发 Tailwind v4 / typography 的 `oklch(...)` 颜色；`html2canvas@1.4.1` 不支持解析 `oklch`，因此抛错。
- 已沉淀策略：导出前需要把现代 CSS 颜色函数预处理为 `rgb(...)` / `rgba(...)`，并保留长图 scale 降级作为次级防线。

### 2026-05-24 本地日志文件夹同步修复

- 影响范围：设置页“本地日志保存位置”、网页/Android 本地 Markdown 文件夹同步、回收站文件。
- 用户现象：Android 文件夹选择器停在手机根目录时提示“无法使用此文件夹”；已授权文件夹里出现 0B `.md` 空壳，且文件夹内容和网页里的日记内容不同步。
- 修复策略：网页文件系统写入后读回校验，失败时删除空壳；全量同步前清理“用户日志/回收站”中的 0B Markdown；移入/恢复回收站时按当前日记内容重新渲染 Markdown，不再搬运可能过期或为空的旧文件；Android 选择器默认引导到 Documents，减少停在不可选根目录的概率。
- 验证命令：`npx tsx tests/local-vault-sync.test.ts`、`npm run lint`、`npm run build`、`npx cap sync android`、临时设置 `JAVA_HOME=D:\java\.jdks\openjdk-23.0.2` 后运行 `android/gradlew.bat assembleDebug`。

### 2026-05-25 选择文件夹后历史日志同步卡住修复

- 影响范围：设置页选择“本地日志保存位置”后的历史日志全量同步。
- 用户现象：从系统文件夹选择器返回后，页面长期停在“处理中...”，用户无法判断同步是否还在进行。
- 修复策略：选择成功后显示明确进度 `正在同步历史日志 x/y`；`syncAllEntriesToVault` 支持进度回调和每篇重试 2 次；同步前不再递归清理 0B 文件，改为同步完成后非阻塞清理；已有 `vaultPath` / `vaultTrashPath` 时直接覆盖写入，减少目录扫描。
- 验证命令：`npx tsx tests/local-vault-sync.test.ts`、`npm run lint`、`npm run build`、`npx cap sync android`、临时设置 `JAVA_HOME=D:\java\.jdks\openjdk-23.0.2` 后运行 `android/gradlew.bat assembleDebug`；Puppeteer 模拟 3 篇历史日志和可写文件夹，截图 `codex-vault-history-sync-success.png`。

### 2026-05-26 历史日志批量同步提速与落盘校验

- 影响范围：设置页选择“本地日志保存位置”后的历史日志全量同步、网页/Android 本地 Markdown 文件夹写入。
- 用户现象：同步计数会走，但速度很慢；结束后用户查看授权文件夹为空，失败感知不明确。
- 修复策略：新增 `localVaultService.syncEntries()` 批量入口，一次读取/写入 manifest，并按年份缓存已有 Markdown 路径，避免每篇日志反复扫描目录和写 manifest；`diaryService.syncAllEntriesToVault()` 改走批量入口并回写每篇 `vaultPath` / `vaultTrashPath`；设置页把历史同步进度改为顶部常驻条，不再居中遮罩。
- 验证命令：`npx tsx tests/local-vault-sync.test.ts`、`npm run lint`、`npm run build`；Puppeteer 模拟 36 篇历史日志和可写年份文件夹，确认 36 个非空 Markdown 落盘，截图 `codex-vault-bulk-sync-success.png`。

## 踩坑记录

### Tailwind v4 的 `oklch` 与 `html2canvas`

- 现象：长日志或包含 Markdown 标题、引用、代码块的日志，点击“保存到本地”后提示“导出图片失败，请重试”。
- 容易误判：看起来像“长文本 canvas 超限”或“Android/Capacitor base64 太大”，但浏览器里也会复现，错误栈明确是 `Attempting to parse an unsupported color function "oklch"`。
- 根因：Tailwind v4 和 typography 运行时注入 `oklch(...)`，`html2canvas@1.4.1` 的颜色解析器不认识。
- 下次处理导出问题时：先看浏览器控制台错误栈，再判断是颜色解析、跨域图片、canvas 尺寸还是文件写入权限；不要只凭“长文失败”判断为长度问题。

### 中文文档和编码

- 项目中部分旧中文文档曾出现乱码；无关任务不要大面积重写，避免制造巨大 diff。
- 新增中文文档统一使用正常 UTF-8 中文。
- 如果读取时看到乱码，先确认读取命令的编码，再判断文件本身是否真的损坏。

### 线上 CPAMC / LongCat

- LongCat 线上不直连官方地址，线上小象后端只调本机 CPAMC：`http://127.0.0.1:8317/v1`。
- 如果 AI 调用失败，先确认 CPAMC 面板进程和 8317 端口，再跑 `npm run doctor:cpamc`。
- 具体命令和线上路径以 `AGENTS.md` 的“线上 CPAMC / CPA 面板”为准。

## 反复纠结的问题

### 工作日志到底记多细

- 当前决策：不做每日流水账，只记重大变更和容易影响后续判断的上下文。
- 必写内容：功能行为变化、接口/数据结构变化、部署方式变化、线上配置变化、高影响 bug、排查中被推翻的重要假设、以后要复用的验证方式。
- 不写内容：普通样式微调、无外部影响的小重构、未验证猜测、只对当前窗口有用的临时过程。

### `.kiro/specs` 和 `WORKLOG.md` 怎么分工

- `.kiro/specs/...`：记录某个问题的完整 requirements、design、tasks、counterexamples。
- `WORKLOG.md`：记录跨任务的结论和索引，让新窗口快速知道最近发生了什么。
- 复杂问题完成后，只把结论、坑、验证方式和 spec 路径摘到本文件，不复制完整设计。

### 什么时候更新 `AGENTS.md`

- `AGENTS.md` 放稳定规则、长期项目约定和持久记忆规则。
- `WORKLOG.md` 放近期上下文、坑和经验。
- 如果只是某次任务的经验，不要塞进 `AGENTS.md`；只有它变成长期通用规则时才同步过去。

## 模式总结

### 跨窗口交接模式

1. 新窗口先读 `AGENTS.md`，确认稳定开发规范、命令、线上配置和持久记忆规则。
2. 再读 `WORKLOG.md`，了解近期变化、踩坑和当前风险。
3. 如果任务对应已有 spec，再读 `.kiro/specs/<topic>/`。
4. 开始改代码前，仍要检查相关页面、service、route、schema，不能只凭文档记忆动手。

### 高影响 bug 排查模式

1. 先固定现象、平台、入口、错误栈。
2. 写下被推翻的假设，避免后续窗口重复绕路。
3. 把最小复现和用户真实案例分开记录。
4. 修复后记录验证命令、人工验证路径和残余风险。

### UI / 导出类验证模式

- UI 改动完成后要启动前端并做浏览器视觉验证，尤其是移动端尺寸、弹层、图片预览、编辑器和导出分享。
- 导出类问题不能只跑类型检查；需要实际生成产物，打开图片确认内容完整、样式正常、控制台无关键错误。

## 待办与风险

- 后续如果再次修改导出链路，需要回看 `.kiro/specs/diary-export-long-text-fails/`，不要重新纠结“长文失败是不是 canvas 超限”这个已判断过的问题。
- 如果未来打包 Android 后出现超长日志导出失败，再单独验证 Android WebView 的 canvas 尺寸、内存和 Capacitor 文件写入限制；当前浏览器问题的主因是 `oklch`。
- 现有工作区有多处源码改动，更新本文档时不要顺手格式化或重写无关代码。
# 2026-06-30 导出图片重叠回归最终修复

- 旧方案把重点放在中英边界断行补丁（`<wbr>` / `\u200B`），但回归说明它没有命中根因。真正的问题是 `html2canvas@1.4.1` 的文本测量会和浏览器 / Android WebView 的最终 fallback 字体排版漂移。
- 日记导出 PNG 现已改成 `html-to-image` 的 browser-native `foreignObject` 渲染；导出前等待字体和布局稳定，导出时内嵌当前自定义字体，并显式固定 `text-size-adjust`、换行和最小行高规则。
- 自动化新增 / 更新了 H7-H8 混排场景、typography 对比测试和 preservation 基线，命令集为：`npm run lint`、`npm run build`、`npx tsx src/utils/exportImage.test.ts`、`npm run test:exploration`、`npm run test:export-typography`、`npm run test:export-mojibake`、`npm run test:preservation`、`npm run test:preservation:verify`。
- Android APK 实测不是只看浏览器预览：用当前代码构建 `android/app/build/outputs/apk/debug/app-debug.apk`，在 `Pixel_8` 模拟器里通过正式“分享 → 保存到本地”导出，图库里生成了 `小象日志_2026-05-20 (1).png`、`小象日志_2026-06-29 (2).png` 和 `font_scale=1.3` 下的 `小象日志_2026-06-29 (3).png`。人工验图确认长中文段落和中英同线混排都无重叠、无裁切、无错位。
