# 2026-05-31 导出图片列表 marker 对齐修复

- 问题：用户截图反馈导出图片中有序列表序号和无序列表圆点没有和正文第一行对齐，尤其是 Tiptap 导出的 `<li><p>...</p></li>` 结构在 `html2canvas` 截图时原生 `::marker` 基线容易漂。
- 修复：`DiaryExportCard` 的正文容器新增 `data-export-content="true"`；`src/index.css` 只针对导出卡片接管 `ol/ul/li`，关闭原生 list marker，使用固定宽度 `li::before` 自绘序号和圆点，继承同一字号与行高，正文统一通过 `padding-left` 对齐。编辑器内的正常列表输入不受影响。
- 验证：`npm run lint`、`npm run build`、`npm run test:exploration`、`npm run test:export-mojibake` 均通过；Puppeteer 本地注入同类有序/无序列表并截图 `codex-export-list-marker-alignment.png`，确认序号/圆点与第一行文字贴齐。

## 追加：导出图片左右留白微调

- 用户继续反馈导出图片正文左右空隙偏大。
- 调整：将 `DiaryExportCard` 正文、图片网格和底部品牌栏的横向 padding 从 `32px` 缩小到 `24px`，只影响导出图片，不影响编辑器阅读/输入布局。
