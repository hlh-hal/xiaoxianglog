# 2026-06-09 Android v1.0.5 更新公告修复

## 背景

用户安装/打开 Android 版本后，首页没有出现更新公告。

## 根因

`src/components/Layout.tsx` 的 `shouldEnableApkUpdateNotice()` 在 Android 原生环境里仍检查 `window.location.hostname`，并排除 `xiaoxianglog.cn` 及其子域名。该保护原本用于网页版，可能误伤 Android WebView 场景，导致更新检查直接关闭。

## 改动

- `shouldEnableApkUpdateNotice()` 改为：只要是 Android 原生平台就启用 APK 更新检查，不再判断 hostname。
- Android 版本升到 `1.0.5` / `versionCode 6`，保证已经安装 `1.0.4` 的设备也能看到新版本提示。
- `public/app-update.json`、`docs/app-update.json`、`src/config/appRelease.ts`、`docs/index.html` 已同步到 `1.0.5`。

## 发布

- 本地正式 APK：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- 主下载：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 更新清单：`https://hlh-hal.github.io/xiaoxianglog/app-update.json`
- 备用 Release：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.5`

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，Android assets 入口为 `assets/index-DM1Yo3qY.js`。
- 临时 JDK 21 环境下 `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 与备案签名一致。
- `aapt dump badging` 确认包名 `com.xiaoxiang.diary`、版本 `1.0.5` / `versionCode 6`、应用名 `小象日志`。
- 自有服务器下载文件大小 `13681579` 字节，SHA256 为 `5A8F4242E6CF1B9B9C2EF0761206425B9E494A7FDD8E558AC3A3A6C8F8E1857F`。
- GitHub Pages 构建状态 `built`，线上 `app-update.json` 已返回 `1.0.5` / `6`。

## 用户侧提示

已安装 `1.0.4` 或更低版本的用户打开首页应出现更新公告；如果用户已经点过“跳过此版本”，同版本不会自动弹窗，但首页上方更新条仍应显示下载入口。
