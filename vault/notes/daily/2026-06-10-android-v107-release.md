# 2026-06-10 Android v1.0.7 发布

## 发布结果

- Android 正式版：`1.0.7` / `versionCode 8`
- 包名：`com.xiaoxiang.diary`
- 应用名：`小象日志`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- GitHub Release 备用镜像：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.7`
- APK SHA256：`115DF438097F90574B481CC45C00392DE95C11665FAD3CDDB40C08B29757328E`

## 本次重点

- 将 Android 内置更新检查默认地址从 GitHub Pages 改为自有服务器 `https://xiaoxianglog.cn/app-update.json`，避免国内访问 GitHub 慢或失败导致手机端不弹更新。
- 自有服务器 `app-update.json` 已发布 `1.0.7 / versionCode 8`，高于线上旧版 `1.0.6 / versionCode 7`。
- 更新公告包含更新内容和修复内容，首页更新入口继续保留。

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，Android assets 同步到 `assets/index-wwF3PHKz.js`。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 与备案签名一致。
- `aapt dump badging` 确认 APK 内部版本为 `versionName='1.0.7'` / `versionCode='8'`，包名为 `com.xiaoxiang.diary`。
- 自有服务器 APK 下载返回 `200 OK`，Range 请求返回 `206 Partial Content`。
- 下载线上 APK 后 SHA256 与本地签名 APK 一致。
- `https://xiaoxianglog.cn/app-update.json` 返回 `1.0.7 / versionCode 8`。
- GitHub Pages `https://hlh-hal.github.io/xiaoxianglog/app-update.json` 返回 `1.0.7 / versionCode 8`，Pages build 状态为 `built`。
- GitHub latest 备用链接重定向到 `android-v1.0.7`。

## 注意

后续 Android 发布必须继续以自有服务器作为主更新 manifest 和主 APK 下载源；GitHub Release 只做备用镜像。发布完成前必须下载线上 APK 并用 `aapt dump badging` 反查内部版本，避免再次出现下载链接仍是旧版本的问题。
