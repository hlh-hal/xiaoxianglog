# 2026-05-30 设置页图片插入正文开关样式修复

- 问题：设置页「编辑」分组里「图片插入正文」说明文字较长，移动端会挤压右侧开关，导致按钮尺寸和右侧位置看起来与「退出即保存」「自动调整时间」不一致。
- 修复：`src/pages/Settings.tsx` 的通用 `Toggle` 增加 `shrink-0`，编辑分组中带说明文字的行增加 `gap-4`、左侧 `min-w-0 flex-1`，让说明文字只在左侧换行，不再压缩开关。
- 验证：`npm run lint` 通过；`npm run build` 因 Windows 文件锁无法删除 `dist/icons/icon-192.png` 失败，随后用 `npx vite build --emptyOutDir=false` 验证生产构建通过。Puppeteer 移动视口截图保存为 `settings-inline-image-toggle-success.png`，开关尺寸为 `44x24`，右侧位置与同组开关一致。
- 后续调整：说明文案改为「开启后，插入的图片会出现在正文中，而不是出现在末尾」；「自动调整时间」与「图片插入正文」之间补齐同款分隔线。
- 部署：2026-05-30 执行 `npm run build` 和 `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，17 个前端文件上传成功。线上首页已引用 `assets/index-CUuF_g5f.js` / `assets/index-D0cyA11u.css`，远端 JS SHA256 与本地一致：`7E3A0298E99825AE0845C955030CCA0AB3338D8A532A3EACC08E5760804009CE`。线上设置页截图保存为 `settings-live-upload-success.png`。
