# 2026-06-24 Android v1.0.18 发布

- 来源：用户要求将 Android 编辑器顶部遮挡与白色光标块追补修复推送到用户端。
- 版本：已发布自有服务器主链路 Android 正式包 `1.0.18 / versionCode 20`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告：修复编辑页顶部正文滑动时压住日期和按钮；追补 Android App 选中文字和光标附近白色方块；关闭 Android WebView 强制深色合成，降低原生选区层冒白底概率。
- 本地验证：`npm run lint` 通过；`npm run android:sync` 通过；`android/.gradlew.bat assembleRelease` 使用 JDK 21 通过；签名包 v2/v3 signature 为 true，证书 MD5 为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 线上验证：`verify_public_release.ps1 -ExpectedVersionName 1.0.18 -ExpectedVersionCode 20` 通过；线上 `app-update.json` 返回 `1.0.18 / 20`；公网 APK 包名为 `com.xiaoxiang.diary`，本地签名包与公网 APK SHA256 一致：`496E83FAFB1381EA9B8850FB18FDE1D4078BE80CB9DF47F831AF5B226D565A4C`。
- 发布范围：仅发布自有服务器前端/manifest 与 APK，未同步 GitHub Pages / GitHub Release。
- 风险：仍需 Android 真机确认特定机型/输入法下白色选区手柄底是否完全消失；若仍复现，应记录 Android WebView 版本、输入法和机型，转为原生 WebView/系统选区层兼容问题继续处理。
