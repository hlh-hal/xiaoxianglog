# 2026-06-21 日志导出图片中英混排重叠修复

- 来源：用户截图反馈导出日志图片时，正文中 `UU及` 一类英文/中文相邻文本出现字母和汉字视觉重叠。
- 根因：导出前的 `insertExportTextBreaks()` 会在 CJK 与 ASCII 相邻处插入 `<wbr>`，用于给 html2canvas 增加断行机会；但 Chrome/html2canvas 在特定中文段落测量 `<wbr>` 时会出现行内文本位置异常。
- 改动：`src/utils/exportImage.ts` 将插入的 `<wbr>` 改为零宽空格文本节点 `\u200B`，保留中英边界可断行能力，同时避免额外行内元素参与 html2canvas 测量。
- 验证：`npm run lint`、`npx tsx src/utils/exportImage.test.ts`、`npm run build` 均通过；使用本地 Vite + Chrome 实际渲染 `DiaryExportCard` 并调用 `renderExportCanvas()` 生成截图，成功图在 `artifacts/diary-export-overlap-fix-success.png`，导出原图在 `artifacts/diary-export-overlap-fix-export.png`。
