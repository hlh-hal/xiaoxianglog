# 2026-05-29 导出图片混排重叠修复

## 来源

用户反馈日记导出图中 `ai skill创建流程`、`自己的skill了` 一类中英文混排文本偶发重叠，第二次测试又正常，要求找出问题、修复并输出成功截图。

## 结论

- 根因：导出卡片渲染后只靠固定等待，未显式等待字体加载和布局连续稳定；`html2canvas` 偶尔在字体/行盒仍在调整时截图，导致中英文 glyph 位置压到一起。
- 修复：新增 `waitForExportRenderReady(el)`，导出前等待 `document.fonts.ready`、图片加载，并要求连续 animation frame 的 `getBoundingClientRect` / `scrollHeight` / `offsetHeight` 稳定。
- 只影响 Web/PWA 导出图片链路；未处理 Android 原生分享。

## 相关文件

- `src/utils/exportImage.ts`
- `src/pages/Editor.tsx`
- `tests/exports/harness.tsx`
- `tests/exports/exploration.test.ts`

## 验证

- `npm run lint`
- `npm run test:exploration`
- `npm run build`
- 成功截图：`codex-export-mixed-text-success.png`
- 已执行 `.\deploy-upload.ps1 -Target front` 上传前端 `dist` 到云端服务器，17 个文件全部 OK。
- 线上首页 `https://www.xiaoxianglog.cn/` 返回 200，入口已切到 `assets/index-DzBojNYz.js`。
- 线上 JS 与本地构建产物 SHA256 一致：`56A6C2499E34395FECAA57EA8E10D848645553594B084CA43EFD07277CD67046`。

## 下次提示

遇到导出截图概率性错位、字体重叠或行高异常时，优先检查截图前字体和布局稳定等待，不要只追加固定 `setTimeout`。
