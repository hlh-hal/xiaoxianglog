# 2026-06-21 / 2026-06-30 日志导出图片中英混排重叠修复

- 来源：用户再次反馈导出图片里英文/字母会和中文挤在一起或覆盖，部分用户能复现，部分用户正常；这说明 2026-06-21 的边界补丁没有真正解决根因。
- 2026-06-21 的临时方案是把 `insertExportTextBreaks()` 的 `<wbr>` 改成 `\u200B`，减少额外行内元素参与测量；它能降低复现概率，但没有消除回归面。

## 2026-06-30 最终根因

- 真正的问题不在“中英边界要不要插断行点”，而在 `html2canvas@1.4.1` 的文本渲染模型。
- 旧导出链路会先用 DOM Range / `getClientRects()` 测量，再拆成多段 `fillText()` 画到 canvas。只要实际渲染时发生字体 fallback、Android WebView 字形替换、系统字号影响行盒或自定义字体尚未稳定，测量值和最终 glyph 位置就可能不一致。
- 所以旧的 `<wbr>` / `\u200B` 边界补丁只是在改变概率分布：某些段落会好，另一些段落仍可能重叠；Android、不同机型、不同字号下尤其容易回归。

## 2026-06-30 最终修复

- `src/pages/Editor.tsx` 的日记导出 PNG 链路不再走 `html2canvas`，改为 `html-to-image` 的 browser-native SVG `foreignObject` 渲染，让浏览器 / WebView 自己负责最终文字排版。
- `src/utils/exportImage.ts` 新增并接入：
  - `waitForFontsReady()`：按导出节点实际字体声明补做 `document.fonts.load()`，并等待 `document.fonts.ready`。
  - `getTextGeometryFingerprint()` + `waitForExportRenderReady()`：不只等固定时间，而是等文字行盒、尺寸和图片都连续稳定。
  - `buildExportFontEmbedCss()`：把当前选中的自定义字体读成 data URL，导出时内嵌到克隆 DOM，避免导出时字体 fallback 链条漂移。
  - `renderExportPng()`：统一设置 `text-size-adjust: none`、`white-space: pre-wrap`、`word-break: normal`、`overflow-wrap: anywhere`、`hyphens: none`、最小 `line-height: 1.5`，再生成 PNG。
- 已彻底移除旧的 `insertExportTextBreaks()`、`<wbr>`、`\u200B` 注入路径，不再靠“边界打补丁”修排版。
- `html2canvas` 仍保留给其它导出路径（如 Daily Echo）使用，但日记导出不再依赖它的文本测量。

## 自动化验证

- `npm run lint`
- `npm run build`
- `npx tsx src/utils/exportImage.test.ts`
- `npm run test:exploration`
- `npm run test:export-typography`
- `npm run test:export-mojibake`
- `npm run test:preservation`
- `npm run test:preservation:verify`

补充说明：

- `tests/exports/harness.tsx` 新增 H7/H8 重点覆盖中文、英文、数字、中英混排、长段落、多行换行。
- `tests/exports/typography.test.ts` 会比对 browser-native 截图和导出 PNG，在不同字号 / 行高 / 缺失主字体 fallback 条件下检查覆盖率与无注入断行字符。

## Android APK 实测

- 使用当前代码构建 `D:\小象日志\android\app\build\outputs\apk\debug\app-debug.apk`，安装到 Android 模拟器 `Pixel_8`。
- 真实 APK 内完成“打开日记 → 分享 → 保存到本地”，并确认原生 `XiangImageSaver.savePngBase64` 与 MediaProvider 落盘日志。
- 2026-06-30 08:14 导出欢迎日记长文：`/sdcard/Pictures/Xiaoxiang Log/小象日志_2026-05-20 (1).png`
- 2026-06-30 08:16 导出混排条目默认字号：`/sdcard/Pictures/Xiaoxiang Log/小象日志_2026-06-29 (2).png`
- 2026-06-30 08:20 在 `font_scale=1.3` 下再次导出混排条目：`/sdcard/Pictures/Xiaoxiang Log/小象日志_2026-06-29 (3).png`

人工验图结论：

- 欢迎日记长中文段落、多行换行、emoji、`AI` 混排均无重叠、无裁切、无错位。
- 06-29 混排条目中 `🤣Tttryr sdsadasaa感谢的人：` 默认字号下无重叠。
- `font_scale=1.3` 时同一条目换行位置发生变化，但英文与中文仍正常断行，没有覆盖或压字。

## 交接提醒

- 以后如果导出排版再次出问题，先确认有没有人把日记导出路径改回 `html2canvas`，或重新引入中英边界注入逻辑。
- Android 自动化里如果通过 shell / PowerShell 直接往 WebView 或 IndexedDB 注入中文测试文案，可能被宿主编码链污染成 `?`；这种现象不要误判成产品导出 bug，优先使用仓库内现成 UTF-8 样例或 App 真实数据验证。
