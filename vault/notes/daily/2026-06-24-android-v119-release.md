# 2026-06-24 Android v1.0.19 发布

## 目的

将刚修复的 Android 编辑器光标/选区白色方块问题推送到用户端，触发已安装 `1.0.18 / versionCode 20` 用户的更新提示。

## 发布版本

- versionName：`1.0.19`
- versionCode：`21`
- 包名：`com.xiaoxiang.diary`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 发布目标：自有服务器主链路
- GitHub Pages / GitHub Release：本次按默认跳过，未同步

## 用户可见更新主题

- 修复编辑页顶部正文滑动时压住日期和按钮的问题，文字会从日期栏下方自然消失。
- 追补 Android App 选中文字和光标附近的白色方块问题，减少拖选卡顿。
- 关闭 Android WebView 的强制深色合成，降低深色主题下原生选区层冒白底的概率。

## 关键改动

- `android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java`：关闭 Android WebView 强制深色合成和算法深色化。
- `android/app/src/main/res/values/styles.xml`：指定 Android 文本选择手柄资源，避免系统默认选区手柄/光标区域出现突兀白块。
- `android/app/src/main/res/drawable/text_select_handle*.xml`：新增文本选择手柄 drawable。
- `src/pages/Editor.tsx`：调整文本选区滚动保护逻辑，并增加顶部内容遮挡层，减少正文滑入导航区域造成的视觉重叠。
- 版本同步组已更新到 `1.0.19 / 21`：`android/app/build.gradle`、`src/config/appRelease.ts`、`public/app-update.json`、`docs/app-update.json`、`docs/index.html`。

## 验证

- 项目根目录 guard：通过。
- release preflight：本地 `1.0.19 / 21` 一致且高于线上旧版 `1.0.18 / 20`。
- UTF-8 manifest 检查：`public/app-update.json` 中文公告正常。
- `npm run lint`：通过。
- `npm run android:sync`：通过，包含 `npm run build` 和 `cap sync android`。
- JDK 21 下 `android\gradlew.bat assembleRelease`：通过。
- `scripts/sign_release.ps1`：已生成正式签名 APK。
- 本地签名校验：v2/v3 true，证书 MD5 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 本地 APK 包名/版本：`com.xiaoxiang.diary`，`1.0.19 / 21`。
- `deploy-upload.ps1 -Target front`：上传成功。
- `scripts/upload_apk.ps1`：使用 300 秒外层 timeout，一次成功上传到 `/dist/download/` 和 `/xiaoxiang-download/`。
- `scripts/verify_public_release.ps1 -ExpectedVersionName 1.0.19 -ExpectedVersionCode 21`：通过。

## 线上结果

- 线上 manifest：`https://xiaoxianglog.cn/app-update.json`
- 线上 APK：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 线上 APK SHA256：`9EE01434526D0A721BB85AFB6862CC798B1B40176CABC0A4FB5A0DF275F0EAA8`
- 线上 APK `Content-Length`：`14107822`
- 线上 APK `Last-Modified`：`Wed, 24 Jun 2026 09:20:46 GMT`

## 注意

- 本次未同步 GitHub 备用镜像，符合当前 Android release skill 默认策略。
- 当前工作区仍有多处未提交改动和未跟踪资源，后续继续任务前需先看 `git status --short`，避免覆盖用户改动。
