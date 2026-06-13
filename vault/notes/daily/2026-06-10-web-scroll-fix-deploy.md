# 2026-06-10 Web 端滚动修复部署

## 背景

Android 首页日期遮挡与滚动锁死修复已完成后，用户反馈 Web 端也出现页面锁死。需要把同一套前端滚动修复上传到云端服务器。

## 部署

- 执行 `npm run build`，生产构建通过。
- 新前端入口：
  - JS: `assets/index-Qm02-9Vz.js`
  - CSS: `assets/index-BtvDozoZ.css`
- 执行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`。
- 上传结果：`dist` 下 21 个文件全部 OK。

## 线上验证

- `https://xiaoxianglog.cn/` 已引用：
  - `assets/index-Qm02-9Vz.js`
  - `assets/index-BtvDozoZ.css`
- `https://www.xiaoxianglog.cn/` 已引用同一组资源。
- CSS 线上包包含 `.app-page-scroll` 和 Android `touch-action: pan-y` 规则。
- `https://xiaoxianglog.cn/app-update.json` 仍返回 `1.0.9 / versionCode 10`。

## 浏览器滚动验证

使用 Chrome mobile viewport `390x844` 访问线上 `https://xiaoxianglog.cn/`，写入本地 IndexedDB 测试日记后验证：

- 首页滚动容器 class: `app-page-scroll app-reading-container min-h-0 h-full flex-1 overflow-y-auto ...`
- `overflowY=auto`
- `scrollHeight=3908`
- `clientHeight=788`
- `scrollTop=3120`
- `reachedBottom=true`
- 日期行 `position=relative`
- 日期 bottom `92`，卡片 top `100`，无重叠。
- 最后一条日志 bottom `684`，滚动容器 bottom `844`，未被底部导航遮挡。

截图：

- `artifacts/web-scroll-fix/online-home-date-no-overlap.png`
- `artifacts/web-scroll-fix/online-home-scrolled-bottom.png`

## 注意

- 如果用户浏览器仍看到锁死，优先让其刷新页面或清理 PWA/浏览器缓存，因为线上首页已经引用新 hash 资源。
- Web 端和 Android 端当前都使用同一套内部滚动容器修复。
