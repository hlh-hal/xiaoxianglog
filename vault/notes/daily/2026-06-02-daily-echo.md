# 2026-06-02 小象回声

## 状态

- 已实现“小象回声”v1：用户手动保存日记后，在日记底部出现轻量回声卡，不弹窗。
- 回声生成固定使用 AI 风格里的“温柔陪伴”，通过 `generateDiaryEcho()` 追加小象回声场景规则，限制 400 字以内、自然段输出、不做结构化字段展示。
- 回声数据保存到 `DiaryEntry.dailyEcho`，不混入正文，也不混入普通 `images`。

## 关键改动

- 前端新增 `DailyEchoCard` / `DailyEchoExportCard`，Editor 负责生成、收进这篇、换一句、不要分析这篇、继续聊聊、保存图片。
- “继续聊聊”会跳到 `/ai-chat`，带入当前日记和小象回声，并切到 gentle 风格作为一次性上下文。
- 图库聚合 `dailyEcho.card.imageUrl/localDataUrl`，用 `sourceType: echoCard` 标识，并在缩略图显示“回声”角标。
- 同步与后端增加 `dailyEcho` JSON 字段；登录同步时如果回声卡图片是本地 data URL，会先走现有图片上传通道，再把 `imageUrl` 同步到后端。
- 永久删除日记、清空回收站、注销账号时，会把已上传的小象回声图片一并纳入清理。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，只有既有 chunk size / dynamic import 警告。
- `cd server && npm run build`：通过。
- `cd server && npm run db:generate`：通过。
- `cd server && npm run db:push`：通过，本地 SQLite 已新增 `daily_echo`。
- 浏览器验证：启动 `npm run dev`，用 Puppeteer 种入演示日记，确认 Editor 展示回声卡、点击“保存图片”后图库出现“回声”图片。

## 截图

- `artifacts/daily-echo-editor.png`
- `artifacts/daily-echo-gallery.png`

## 注意

- 本次浏览器验证用的是本地演示数据 `codex-daily-echo-demo`，没有调用真实 AI 服务。
- `artifacts/` 为本次验证截图目录；如不想保留，可后续清理。

## 追加修复：API 代理与未登录保护

- 用户截图反馈 `/api/chat/complete` 返回 500。排查后发现本地只启动了前端 Vite，后端 `3001` 未监听，Vite 代理到空端口导致 500。
- 已启动 `cd server && npm run dev`，确认 `http://127.0.0.1:3001/api/health` 和 `http://127.0.0.1:3000/api/health` 都返回 200。
- 前端补了未登录保护：未登录保存日记时，小象回声不再请求 `/api/chat/complete`，而是提示“登录后可生成小象回声”。
- 回归验证：Puppeteer 未登录保存一篇本地日记，`apiCompleteCalls: 0`。

## 追加修复：小象回声导出图片右侧裁切

- 用户反馈图库预览里的小象回声导出图不完整，右侧文字被裁掉。
- 根因：回声卡本身已经改成 760px 宽，但保存图片时复用了日记长图的 `renderExportCanvas()`，该工具默认 `width/windowWidth` 为 375，导致 html2canvas 按窄画布截取宽卡片。
- 修复：`handleSaveDailyEchoImage()` 改为按回声导出元素的 `scrollWidth/scrollHeight` 调用 `html2canvas`，并传入匹配的 `width/height/windowWidth/windowHeight`。
- 验证：重新导出长文本回声 PNG，生成尺寸从错误的 `750 x 2120` 变为完整的 `1516 x 2116`，右侧文字和底部署名均未裁切。验证图：`artifacts/daily-echo-export-fixed-actual.png`。

## 追加实现：小象回声纸角浮窗

- 按 2026-06-02 多视角方案落地第一版“小象回声纸角浮窗”：保存/回看日记时，小象在右下纸角短暂出现，显示一句短回声；点击后展开完整小象回声卡。
- 保留 `DiaryEntry.dailyEcho` 数据结构、AI 生成、收进这篇、换一句、继续聊聊、保存回声图和图库闭环，不新增后端字段。
- 新增 `DailyEchoFloatingCard` 和内联手绘小象 SVG；原 `DailyEchoExportCard` 保持可用。Editor 不再把回声卡直接插在正文底部，而是在页面根层渲染浮窗。
- 新增设置项 `dailyEchoFloatEnabled`，默认开启；设置页写作体验区增加“小象回声浮窗”开关。浮窗内“今天安静”使用 `daily_echo_float_muted_date` 做当天静音，不改变总开关。
- 浮窗隐藏条件：键盘弹起、滚动中、主题栏/菜单/模板/历史/背景选择/图片预览等弹层出现、内联图片工具栏出现、导出中。
- 验证：`npm run lint` 通过；`npm run build` 通过，仅保留既有 chunk/dynamic import 警告。
- Puppeteer 验证：设置关闭时不出现浮窗；开启后出现短句气泡，约 3 秒后收起成纸角小象；点击小象展开完整回声卡；点击“保存图片”后 `dailyEcho.card.localDataUrl` 成功写回。
- 截图：`artifacts/daily-echo-float-peek.png`、`artifacts/daily-echo-float-expanded.png`。
## 2026-06-03 追加：小象回声浮窗形象替换
- 用户确认以极简纸角探头小象作为“小象回声”浮窗形象，不再使用线条 SVG 小象。
- 新增资产：`public/icons/xiaoxiang-echo-mascot-source.png` 保留原始生成图，`public/icons/xiaoxiang-echo-mascot-float.png` 为浮窗裁切版。
- `src/components/DailyEchoCard.tsx` 中的浮窗入口已改为引用 `xiaoxiang-echo-mascot-float.png`，保留原浮窗交互、展开卡片、保存回声图等逻辑。
- 裁切修正：原先误按超出原图的区域裁切，导致右侧/底部出现空白黑底且帽子显示不完整；已按原图真实尺寸 `983x1601` 重新裁切，帽子完整保留。
- 验证：`npm run lint` 通过；`npm run build` 通过，仅保留既有 chunk/dynamic import 警告。
- 浏览器截图：`artifacts/daily-echo-mascot-updated.png`。

## 2026-06-03 追加：移除浮窗下方静音文字
- 按用户反馈，删除小象回声浮窗入口下方的“今天安静”按钮文字。
- `src/components/DailyEchoCard.tsx` 不再渲染该按钮，`src/pages/Editor.tsx` 同步移除无入口的当日静音传参和回调。
- 验证：`npm run lint` 通过；截图 `artifacts/daily-echo-mascot-no-quiet-final.png` 显示浮窗下方不再有文字。

## 2026-06-03 追加：小象回声形象前端部署
- 已执行 `npm run build`，生成线上前端入口 `assets/index-Ca1Q0v3-.js`。
- 已执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，只上传前端 `dist/`，未上传/重启后端。
- 上传文件包含 `icons/xiaoxiang-echo-mascot-float.png` 和 `icons/xiaoxiang-echo-mascot-source.png`。
- 线上验证：`http://47.122.112.242/` 已引用 `assets/index-Ca1Q0v3-.js`；`/icons/xiaoxiang-echo-mascot-float.png` 返回 200；`/api/health` 返回 `build: cpamc-only-20260520`。
- 线上浏览器截图：`artifacts/daily-echo-remote-deployed.png`，确认小象浮窗已替换为新形象且下方无“今天安静”文字。

## 2026-06-03 追加：小象回声内容质量与完整句保护
- 用户反馈“小象回声”出现空泛回复，以及内容生成到半句就停止显示的问题。
- 修复生成端：`src/services/aiService.ts` 的小象回声 prompt 改为 120-220 字、最多 3 句，必须点名日记里的 2 个具体细节，禁止“这一页已经被小象轻轻收到了”等空泛模板句。
- 修复截断端：不再对 AI 结果直接 `.slice(0, 400)`；改为最多约 260 字并在完整句标点处收口，半句话会被裁掉。
- 增加质量兜底：如果 AI 返回空泛模板或没有完整句，会根据日记正文里的具体片段生成短回声兜底。
- 修复展示端：`src/components/DailyEchoCard.tsx` 展示旧回声时也会隐藏最后一段不完整句，避免已保存的半截内容继续露出。
- 验证：`npm run lint` 通过；`npm run build` 通过，仅保留既有 chunk/dynamic import 警告。
- 已前端部署到云端，线上入口 `assets/index-Drki7JKa.js`，`/api/health` 正常返回 `build: cpamc-only-20260520`。

## 2026-06-03 追加：修复小象回声保存到图库失败
- 用户反馈“小象回声保存到图库失败”。排查后，本地保存按钮能写入 `dailyEcho.card.localDataUrl`，但移动端 `html2canvas` 仍可能因为渲染/内存/空 canvas 失败导致 toast 失败。
- `src/pages/Editor.tsx` 增加 `renderDailyEchoFallbackCanvas()` 原生 canvas 兜底：优先用 `html2canvas` 保留现有设计；若 DOM 截图失败、返回空 canvas 或移动端渲染异常，则直接用 canvas 绘制小象回声卡，保证能生成 PNG 并写入图库。
- 移动端/长图导出 scale 从固定 2 改为按高度和屏宽降到 1.5，降低移动端内存压力。
- 浏览器验证：点击小象回声“保存图片”后，`dailyEcho.card.localDataUrl` 成功写入，生成尺寸示例 `1137x1587`；图库页面出现带“回声”徽标的图片。截图：`artifacts/daily-echo-gallery-save-fixed.png`。
- 验证：`npm run lint` 通过；`npm run build` 通过，仅保留既有 chunk/dynamic import 警告。
- 已前端部署到云端，线上入口 `assets/index-DN52qlsv.js`，`/api/health` 正常返回 `build: cpamc-only-20260520`。
