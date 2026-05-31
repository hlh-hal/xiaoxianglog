# 2026-05-31 日志圈样式热修

## 背景

- 用户反馈线上日志圈回到了旧版视觉：正文左侧绿色竖线消失，两侧留白不符合预期。
- 根因是上一轮 PWA 编辑器退出保存部署来自干净提交，未包含当时工作区里尚未提交的日志圈样式调整；同时本地 `Community.tsx` 已把正文左侧边线删掉。

## 处理

- `src/pages/Community.tsx`
  - 保留日志圈主内容区更窄的移动端左右留白：`!px-2 sm:!px-4 md:!px-6`。
  - 保留卡片移动端内边距优化：`p-5 md:p-6`。
  - 恢复正文左侧绿色竖线，并改为明确生成的浅绿色边框：`border-l-2 border-l-[#c5efad] pl-4`。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过；仅保留既有动态导入/chunk 体积警告。
- 本地构建 CSS 已确认生成 `.border-l-[#c5efad] { border-left-color: #c5efad; }`。
- 干净 worktree `npm run lint` 通过；`npm run build` 通过。
- 已通过 `deploy-upload.ps1 -Target front` 上传前端 18 个文件。
- 线上校验：
  - `https://www.xiaoxianglog.cn/` 返回 200。
  - `https://www.xiaoxianglog.cn/community` 返回 200。
  - 线上首页引用 `assets/index-w64oB2Bw.js` 和 `assets/index-DxFUidx9.css`。
  - 线上 JS SHA256 与本地一致：`87E6A00D1E009E3A6868D71C46D121C78990E6C04C93228DC080F420682D9765`。
  - 线上 CSS SHA256 与本地一致：`15BA61B9089DAD6903C0302317EEC8A26B9055075CD39BBA23B79FEA381C2A9B`。
  - 线上 CSS 已确认包含 `border-left-color:#c5efad`。

## 追加修正

- 用户确认不需要正文左侧绿色竖线。
- `src/pages/Community.tsx` 移除正文容器上的 `border-l-2 border-l-[#c5efad] pl-4`，保留移动端两侧留白和卡片内边距调整。
- `npm run lint` 通过。
- `npm run build` 通过；仅保留既有动态导入/chunk 体积警告。
- 干净 worktree `npm run lint` 和 `npm run build` 通过。
- 首轮 FTP 上传遇到 4 个文件超时失败；立即重跑后 18 个前端文件全部上传成功。
- 线上校验：
  - `https://www.xiaoxianglog.cn/` 返回 200。
  - `https://www.xiaoxianglog.cn/community` 返回 200。
  - 线上首页引用 `assets/index-CmSA6B0S.js` 和 `assets/index-DxFUidx9.css`。
  - 线上 JS SHA256 与本地一致：`66FFFD35AA009B8224045A8A74D315031A643D636C0614D5347C6EB5FC681871`。
  - 线上 CSS SHA256 与本地一致：`15BA61B9089DAD6903C0302317EEC8A26B9055075CD39BBA23B79FEA381C2A9B`。
  - 线上 JS 已确认不包含 `border-l-[#c5efad]`。
