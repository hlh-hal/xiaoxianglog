# 2026-05-31 云端部署：编辑器选区与设置账号同步

## 范围

- 上传到云端服务器的前端改动：
  - 修复日志正文选中文字时页面不受控制下滑。
  - 删除设置页中的“账号同步 / 立即同步账号日志”入口。
- 仅部署前端 `dist`，未改后端、数据库或线上配置。

## 部署

- 本地构建：`npm run build`。
- 构建产物主 JS：`dist/assets/index-Cyx57CBE.js`。
- 上传命令：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`。
- FTP 上传结果：17 个前端文件全部 OK，脚本输出 `=== All uploads complete ===`。

## 线上验证

- `https://www.xiaoxianglog.cn/` 已引用 `assets/index-Cyx57CBE.js`。
- 远程 `https://www.xiaoxianglog.cn/assets/index-Cyx57CBE.js` SHA256 与本地 `dist/assets/index-Cyx57CBE.js` 一致：`74BF4257FA43CE0F0B257682C57A6C15336AAA02BF025891C5C90CC753449E55`。
- `https://www.xiaoxianglog.cn/api/health` 正常返回 `{"status":"ok","build":"cpamc-only-20260520"}`。
- Puppeteer live smoke 通过：
  - `/settings` 正常加载，页面文本中不再包含“账号同步”或“立即同步账号日志”。
  - `/editor` 正常加载，`.ProseMirror` 渲染成功。

## 注意

- 当前本地工作区仍有其他未提交文件和截图，部署脚本只上传 `dist`，没有上传这些本地辅助文件。
