# 2026-06-10 Android v1.0.10 设置页滚动修复发布

## 背景

用户反馈 Web 网页和 Android 内，设置页里的长内容无法自由上下滑动查看；首页滚动已修复，但设置和二级设置页仍像被锁死。

## 修改

- `src/pages/Settings.tsx`
  - 页面根容器改为 `app-page-scroll h-dvh min-h-0 overflow-y-auto`，让设置页本身成为 Android/Web 的纵向滚动容器。
  - 字体设置全屏面板内部滚动区增加 `app-page-scroll min-h-0 flex-1 overflow-y-auto`。
- `src/pages/InsightDraftSettings.tsx`
  - 页面根容器改为独立滚动容器，并保留底部安全区留白。
- `src/config/appRelease.ts`、`public/app-update.json`、`docs/app-update.json`
  - Android 远程更新公告升级到 `1.0.10 / versionCode 11`。
  - 公告内容改为正常中文，描述设置页滚动修复。
- `android/app/build.gradle`
  - 版本升级为 `versionName 1.0.10`、`versionCode 11`。

## 部署与发布

- Web 已上传到自有服务器，线上入口加载：
  - `assets/index-B3f5MR9S.js`
  - `assets/index-DsRxn1gw.css`
- Android 正式签名包已上传到：
  - `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 线上更新公告：
  - `https://xiaoxianglog.cn/app-update.json`
  - 返回 `versionName 1.0.10`、`versionCode 11`

## 验证

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run android:sync` 通过。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过：
  - v2/v3 签名有效。
  - 证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`。
- `aapt dump badging` 本地和远端 APK 均显示：
  - package：`com.xiaoxiang.diary`
  - versionName：`1.0.10`
  - versionCode：`11`
  - application-label：`小象日志`
- 远端 APK SHA256 与本地签名 APK 一致：
  - `5FF3EB3BF1BC0B437AB39698A6F02C64A41BE1E6B6F269A89D82B6C2317E244B`
- 远端下载验证：
  - APK HEAD `200 OK`
  - `Content-Length 13685675`
  - Range 请求 `206 Partial Content`
- 线上移动视口滚动验证通过：
  - `/settings`：`scrollHeight 1835`、`clientHeight 844`、可滚到底部。
  - `/settings/insight-draft`：`scrollHeight 1052`、`clientHeight 844`、可滚到底部。

## 截图

- `artifacts/settings-scroll-fix/online-settings-top.png`
- `artifacts/settings-scroll-fix/online-settings-bottom.png`
- `artifacts/settings-scroll-fix/online-insight-settings-top.png`
- `artifacts/settings-scroll-fix/online-insight-settings-bottom.png`

## 注意

- 本次按当前 skill 规则只发布自有服务器，不同步 GitHub Pages 或 GitHub Release。
- 已安装 `1.0.9 / versionCode 10` 的用户应能收到 `1.0.10 / versionCode 11` 更新提示；如果用户曾跳过该版本或缓存了旧状态，可从首页更新入口或下载链接手动安装。
