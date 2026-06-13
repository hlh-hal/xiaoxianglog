# 2026-06-09 APK 自有服务器下载

## 背景

国内访问 GitHub Release 下载 APK 偏慢，短期用户不超过 15 人，决定暂时使用现有 2 核 2G / 200 Mbps 阿里云服务器承载小象日志 Android APK。

## 本次改动

- App 内更新主下载地址改为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- `public/app-update.json`、`docs/app-update.json` 的 `apkUrl` 已改为自有服务器地址。
- `docs/index.html` 的主下载按钮改为自有服务器地址，并保留 GitHub Release latest 作为“备用下载”。
- 已将当前正式 APK `C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk` 上传到服务器：
  - `/xiaoxiang-download/xiaoxiang-log-latest.apk`：按计划保留，等待后续宝塔/Nginx alias。
  - `/dist/download/xiaoxiang-log-latest.apk`：当前公网实际生效路径，对应 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- GitHub Pages `gh-pages` 分支已同步 `index.html` 和 `app-update.json`。

## 验证

- `npm run lint` 通过。
- `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` 返回 `200 OK`，`Content-Length: 13677401`，`Accept-Ranges: bytes`。
- Range 请求返回 `206 Partial Content`。
- 从服务器下载 APK 后 SHA256 与本地正式包一致：`D89DB206610FE9F79B76E5EF6E98DD293863E45D7DB752D0EDD7B0A93A0AB274`。
- `https://hlh-hal.github.io/xiaoxianglog/app-update.json` 已返回自有服务器 `apkUrl`。
- GitHub Pages 官网主按钮已指向自有服务器，备用下载仍指向 GitHub Release latest。

## 后续注意

- 当前服务器返回的 APK `Content-Type` 是 `application/octet-stream`，浏览器和 Android 下载可用；如需更规范，可在宝塔/Nginx 为 `.apk` 增加 `application/vnd.android.package-archive`。
- 后续每次打新 APK 后，先覆盖服务器 `/dist/download/xiaoxiang-log-latest.apk`，再可选上传 GitHub Release 作为备用镜像。
- 不要把 APK、keystore、签名密码提交进 Git 仓库。
