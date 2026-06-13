# 2026-06-10 Android v1.0.11 应用内更新入口优化

## 背景

用户反馈 Android 更新公告里的图标还是临时星星图标，希望换成小象日志正式图标；同时希望点击更新后不要跳到浏览器保存 APK，而是下载完成后直接进入安装流程。

## 修改

- `src/components/Layout.tsx`
  - 首页常驻更新条和更新公告弹窗头部改用 `/icons/xiaoxiang-log-icon.png`。
  - Android 原生环境中点击“下载新版”优先调用原生 `XiangUpdater.downloadAndInstall()`。
  - 下载中按钮显示“正在准备安装包”，失败时回退到浏览器下载。
  - 如果 Android 未允许“小象日志”安装未知应用，会提示先授权，再回到 App 继续安装。
- `src/services/updateNoticeService.ts`
  - 新增 `downloadAndInstallApkUpdate()`，封装 Android 原生更新插件调用。
- `android/app/src/main/java/com/xiaoxiang/diary/XiangUpdaterPlugin.java`
  - 新增 Capacitor 原生插件，负责下载 APK 到 App cache，并通过 `FileProvider` 拉起系统安装器。
- `android/app/src/main/AndroidManifest.xml`
  - 新增 `android.permission.REQUEST_INSTALL_PACKAGES`。
- `android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java`
  - 注册 `XiangUpdaterPlugin`。
- 发布版本升到 `1.0.11 / versionCode 12`。

## 限制说明

- Android 普通应用不能静默安装或自动重启自己，最终仍会进入系统安装确认页。
- 已安装 `1.0.10` 的用户看到 `1.0.11` 更新时，旧包内的更新弹窗仍是旧代码；安装 `1.0.11` 后，后续版本更新才会使用小象图标和应用内下载安装流程。

## 发布与验证

- Web 已部署，自有服务器入口加载：
  - `assets/index-DsrGVge4.js`
  - `assets/index-BUyy2HhE.css`
- 线上更新公告 `https://xiaoxianglog.cn/app-update.json` 返回：
  - `versionName 1.0.11`
  - `versionCode 12`
- APK 已上传到 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- `npm run lint` 通过。
- `npm run android:sync` 通过。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过：
  - v2/v3 签名有效。
  - 证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`。
- 远端 APK `aapt dump badging`：
  - package：`com.xiaoxiang.diary`
  - versionName：`1.0.11`
  - versionCode：`12`
  - application-label：`小象日志`
- 远端 APK SHA256 与本地签名包一致：
  - `D7EAF80EB03D3EAC59B4CCBE38CC8E140ACE75F88DF48EE1DFA5F9AB560EA794`

## 后续建议

下一次发布 `1.0.12` 时，应让已安装 `1.0.11` 的真机验证“下载新版”按钮是否能直接下载并拉起系统安装器；如遇小米/MIUI 安全策略拦截，预期会先进入系统授权页。
