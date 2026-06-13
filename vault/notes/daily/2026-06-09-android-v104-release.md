# 2026-06-09 Android v1.0.4 发布

## 背景

用户要求重新推送最近 Android 改动，并希望用户首页出现更新提示。

## 发布内容

- Android 版本升到 `1.0.4` / `versionCode 5`。
- 首页更新清单 `app-update.json` 已升到 `versionCode 5`，因此已安装 `1.0.3` / `versionCode 4` 的用户进入首页会看到更新提示。
- 版本说明包含：
  - Android 原生版隐藏“安装到桌面”入口。
  - 修复二级页面使用系统右滑返回直接退到桌面的问题。
  - 主下载地址继续使用 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。

## 文件与线上

- 本地正式 APK：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- 自有服务器主下载已覆盖：
  - `/dist/download/xiaoxiang-log-latest.apk`
  - `/xiaoxiang-download/xiaoxiang-log-latest.apk`
- GitHub Pages 已更新：
  - `https://hlh-hal.github.io/xiaoxianglog/app-update.json`
  - `https://hlh-hal.github.io/xiaoxianglog/`
- GitHub Release 备用镜像：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.4`

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，Android assets 入口为 `assets/index-DtGzLaPz.js`。
- 临时 JDK 21 环境下 `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 与备案签名一致。
- `aapt dump badging` 确认包名 `com.xiaoxiang.diary`、版本 `1.0.4` / `versionCode 5`、应用名 `小象日志`。
- 自有服务器下载文件大小 `13681579` 字节，SHA256 为 `ADB092C644BB46169EDC055846811B4D6F988F6E26609FC26D68D2F35A4496A9`。
- GitHub Release asset SHA256 与自有服务器一致。

## 后续

若用户手机暂时不弹更新提示，优先检查是否仍停留在非首页、是否网络拿到旧缓存，或是否安装的已经是 `1.0.4`。
