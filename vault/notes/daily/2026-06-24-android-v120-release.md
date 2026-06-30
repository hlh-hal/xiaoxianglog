# 2026-06-24 Android v1.0.20 发布

- 已发布自有服务器主链路 Android 正式包：`1.0.20 / versionCode 22`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 本次发布只修正上一轮误改的 Android 文本选择手柄样式：移除自定义 `text_select_handle*` 资源绑定，恢复系统默认选中文字和光标手柄图标，不再显示错误的绿色水滴样式。
- 保留此前编辑页顶部遮挡层、WebView force dark 关闭等修复；白色方块问题后续继续按 Android WebView/原生选择层合成方向排查，不再通过更换手柄形状处理。
- 验证：`npm run lint` 通过；`npm run android:sync` 通过；JDK 21 下 `android/gradlew.bat assembleRelease` 通过；签名 APK v2/v3 校验通过，证书 MD5 为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 线上验证：公开 APK 包名 `com.xiaoxiang.diary`，版本 `1.0.20 / 22`，本地签名包与线上 APK SHA256 一致：`F10140FD6FC685CF1DBD3F53A26346110D00F271DF7BD566025EA142DB2EE936`；公开 `app-update.json` 已返回 `1.0.20 / 22` 和自有服务器 `apkUrl`。
- 本次未同步 GitHub Pages / GitHub Release。
