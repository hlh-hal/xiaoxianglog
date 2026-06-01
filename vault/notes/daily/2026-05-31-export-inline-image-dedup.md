# 2026-05-31 导出图片内联图片去重

- 问题：开启“图片插入正文”后，导出图片里内联图片会先出现在正文位置，随后又被 `images` 数组追加到导出卡片末尾，形成重复。
- 修复：抽出 `getDefaultDisplayImagesForContent(html, images)`，复用编辑器附件区的过滤规则；`saveToLocal` 渲染 `DiaryExportCard` 时传入过滤后的 `exportImages`，已在正文出现的内联图片不再作为末尾附件图追加。
- 范围：只影响导出图片末尾附件图的展示过滤，不改变正文内联图片、图片数组保存、历史版本、同步或预览逻辑。

## 线上上传

- 2026-05-31 已执行 `powershell -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，只上传前端 `dist/`。
- 本次线上前端包含三次导出图修复：列表 marker 对齐、左右留白从 `32px` 调整为 `24px`、内联图片导出末尾去重。
- 线上首页已引用 `assets/index-Cyx57CBE.js` 和 `assets/index-CBDlEqtH.css`；远端 JS SHA256 与本地 `dist/assets/index-Cyx57CBE.js` 一致：`74BF4257FA43CE0F0B257682C57A6C15336AAA02BF025891C5C90CC753449E55`。
