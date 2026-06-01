# 2026-06-01 Edge 导出图片中英混排重叠修复

- 问题：用户反馈 Edge 浏览器导出图片时，正文里的 `codebud使用`、`ha改完bug还`、`skill和日程` 等中英混排片段会互相重叠；本地页面 DOM 排版正常，问题只出现在导出的 PNG。
- 根因：导出链路使用 `html2canvas@1.4.1` 绘制 DOM。Edge/Chromium 下，`html2canvas` 对连续中英混排文本片段的 range/word 测量会产生横向坐标偏差，导致英文片段侵入后续中文。
- 修复：新增 `renderExportCanvas()`，导出前只在 `[data-export-content="true"]` 正文文本节点的中文与 ASCII 字母/数字交界处临时插入不可见 `<wbr>`，让 `html2canvas` 正确分段测量；截图完成后立即恢复原 DOM。`code` / `pre` 内文本跳过处理。
- 重要坑：最初尝试整张卡片使用 `foreignObjectRendering: true`，可修复纯色主题中英重叠，但在现有背景主题切片结构下会导出黑图；只 raster 正文为图片/canvas 也会在整卡二次截图中丢失正文。因此最终采用 `<wbr>` 断点预处理，保留原来的背景、图片网格和颜色归一化流程。
- 测试：`npm run lint`、`npm run build`、`npm run test:exploration`、`npm run test:export-mojibake` 均通过。`test:exploration` 新增 H6 中英混排回归用例。另用本机 Edge headless 验证 H6 导出图无重叠，并验证背景主题 + 四宫格 P4 导出正常。
