# 2026-06-09 Android v1.0.6 滚动晃动修复发布

## 背景

用户反馈 Android 安装包上下滑动时整个界面会晃动，随后补充顶部/底部固定可以保留，但首页、我的日志、日志圈等长内容必须能正常上下滑动。

## 版本

- Android 版本：`1.0.6`
- Android versionCode：`7`
- 本地正式包：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- SHA256：`03D9E7681AD6914316DAAB1814F2B2B89C2B0412FA3DB3611F9975F19CAD9855`
- 包名：`com.xiaoxiang.diary`
- 签名证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`

## 发布位置

- 自有服务器主下载：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 服务器路径：`/dist/download/xiaoxiang-log-latest.apk`
- 备用服务器路径：`/xiaoxiang-download/xiaoxiang-log-latest.apk`
- GitHub Release：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.6`
- GitHub latest 备用下载：`https://github.com/hlh-hal/xiaoxianglog/releases/latest/download/xiaoxiang-log-latest.apk`
- 更新清单：`https://hlh-hal.github.io/xiaoxianglog/app-update.json`

## 验证

- `npm run build`：通过，入口 `assets/index-BzZgjVVM.js`。
- `npx cap sync android`：通过。
- `./gradlew.bat :app:assembleRelease`：通过。
- `apksigner verify --verbose --print-certs`：v2/v3 签名通过。
- `aapt dump badging`：确认 `versionCode='7'`、`versionName='1.0.6'`。
- 自有服务器下载 APK 后 SHA256 与本地正式包一致：`03D9E7681AD6914316DAAB1814F2B2B89C2B0412FA3DB3611F9975F19CAD9855`。
- `https://xiaoxianglog.cn/app-update.json` 与 `https://hlh-hal.github.io/xiaoxianglog/app-update.json` 均返回 `1.0.6 / 7`。
- GitHub latest 下载跳转到 `android-v1.0.6`，返回 `200 OK`，大小 `13681579` 字节。

## 交接

- `gh-pages` 已提交 `88def16`，只更新 `app-update.json` 和 `index.html`。
- 主工作区仍有多处历史未提交改动，本次未整理提交 main。
- 后续如果要正式提交代码，请特别检查 Capacitor sync 造成的 `android/capacitor.settings.gradle`、`android/app/capacitor.build.gradle`、`package.json`、`package-lock.json` 是否属于当前发布需要，避免混入无关依赖变更。
