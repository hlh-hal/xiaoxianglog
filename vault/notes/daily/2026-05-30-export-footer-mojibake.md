# 2026-05-30 导出图片底部品牌文案乱码修复

- 问题：导出图片正文中文正常，但底部固定品牌栏显示乱码，来源是 `src/pages/Editor.tsx` 的 `DiaryExportCard` 底部文案曾被错误编码保存。
- 修复：将导出卡片底部两段固定文本恢复为 `小象日志` 和 `记录生活的美好`。本次只改前端导出图可见文案，没有改后端、数据结构或同步逻辑。
- 验证：`npm run lint`、`npm run build`、`npm run test:exploration` 均通过；本地 harness 渲染导出卡片时两个底部 span 文案为正常中文。
- 部署：执行 `powershell -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 上传前端包；线上首页已引用 `assets/index-q6knJB9J.js` 和 `assets/index-CZM0cUHT.css`，线上 JS 检查包含正常文案且不包含 `灏忚薄鏃` / `璁板綍鐢熸椿鐨勭編濂`，`/api/health` 返回 `build=cpamc-only-20260520`。

## 追加：导出/分享链路可见文案乱码修复

- 问题：用户再次截图的“导出日志”加载态乱码对应 `src/pages/Editor.tsx` 的导出/分享流程硬编码文案，并非用户日记内容或日志包导出过程被错误转码。设置页 Markdown/日志包导出相关核心文本按字节检查仍是正常 UTF-8。
- 修复：将导出遮罩、分享 Sheet、分享选项、保存/下载/失败 toast 恢复为正常中文，包括 `正在生成图片...`、`分享至`、`微信好友`、`日志圈`、`保存到本地`、`功能还在开发中，敬请期待`、`已保存到文件夹`、`图片已下载`、`导出图片失败，请重试`。
- 防回归：新增 `tests/exports/mojibake.test.ts` 和 `npm run test:export-mojibake`，静态断言导出分享链路包含正常中文，且不再包含本次已知乱码片段或英文 fallback。
- 验证：`npm run test:export-mojibake`、`npm run lint`、`npm run build`、`npm run test:exploration` 均通过；Puppeteer 在本地 `3002` 打开编辑器、点击分享、点击保存到本地，DOM 读到分享面板正常中文并捕获 `正在生成图片...` 遮罩，未捕获旧乱码。
- 部署：重新执行 `powershell -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，只上传 `dist/` 前端包。线上首页已引用 `assets/index-D-9vWyWf.js` 和 `assets/index-D0cyA11u.css`；线上 JS 检查包含正常中文且不包含已知乱码/英文 fallback，`/api/health` 返回 `build=cpamc-only-20260520`。
