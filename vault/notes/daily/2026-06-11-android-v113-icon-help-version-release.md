# 2026-06-11 Android v1.0.13 更新弹窗图标与帮助页版本发布

## 背景

用户反馈 Android 更新公告弹窗左上角图标仍使用旧的卡通小象图，和桌面正式应用图标不一致；同时“帮助与反馈”页面底部仍显示 `Version 1.0.0`，没有跟随正式发布版本。

## 修复

- `src/components/Layout.tsx`：更新公告弹窗和首页更新入口统一使用正式应用图标 `/icons/xiaoxiang-pwa-512.png`。
- `src/pages/Help.tsx`：底部版本号改为读取 `src/config/appRelease.ts` 的 `currentVersion`，不再写死 `Version 1.0.0`。
- `src/config/appRelease.ts`、`public/app-update.json`、`docs/app-update.json`、`docs/index.html`：同步到 `1.0.13 / versionCode 14`，更新说明明确写入图标与帮助页版本修复。

## 发布

- Android 版本：`1.0.13`
- Android versionCode：`14`
- 包名：`com.xiaoxiang.diary`
- 本地正式包：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 更新清单：`https://xiaoxianglog.cn/app-update.json`
- SHA256：`4D96D31BADBB9A9EB3341A93ED304920FC322B74D65F628DB3A61B1DF4F8B9EA`
- 签名证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`

## 验证

- `npm run lint`：通过。
- `npm run android:sync`：通过，Android assets 已同步最新前端产物。
- `android\gradlew.bat assembleRelease`：通过。
- `apksigner verify --verbose --print-certs`：v2/v3 签名通过，证书 MD5 与备案证书一致。
- `aapt dump badging`：确认 `versionName='1.0.13'`、`versionCode='14'`、应用名 `小象日志`。
- 自有服务器 APK 下载后 SHA256 与本地签名包一致。
- `https://xiaoxianglog.cn/app-update.json` 返回 `1.0.13 / 14`，`apkUrl` 为自有服务器下载地址。
- 公网 APK HEAD 返回 `200 OK`，`Content-Length: 13685675`，`Accept-Ranges: bytes`；Range 请求返回 `206 Partial Content`。

## 交接

- 本次按当前 release skill 的默认规则只发布自有服务器主链路，未同步 GitHub Pages / GitHub Release。
- 后续如果继续改更新公告图标，正式桌面图标资源是 `/icons/xiaoxiang-pwa-512.png`，不要误用 `/icons/xiaoxiang-log-icon.png`。
