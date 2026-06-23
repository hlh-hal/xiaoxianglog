# 2026-06-13 Android v1.0.14 黑边、滚动残影、导出修复发布

## 背景

用户要求把今天三处已完成改动推送到用户端，并做好更新公告。三处改动分别是：Android 顶部状态栏黑/灰边、首页滚动残影/中段空白、Android 导出日志图片保存失败。

## 发布内容

- Android 状态栏/导航栏颜色与小象日志纸张背景统一，减少部分机型顶部黑边或灰边。
- 首页时间轴滚动绘制优化，减少快速滑动时的文字残影和列表中段空白。
- Android 导出图片保存改走原生图库保存能力，解决写完日志后导出图片提示保存失败的问题。

## 版本

- Android 版本：`1.0.14`
- Android versionCode：`16`
- 包名：`com.xiaoxiang.diary`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 更新清单：`https://xiaoxianglog.cn/app-update.json`
- 本地正式包：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- SHA256：`E7DC23A2DC66EDA03128B3263C23BF88D124FE71237F5459CCF1B44B0B3B1D92`
- 签名证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`

## 验证

- `npm run lint`：通过。
- `npm run android:sync`：通过，前端产物已同步到 Android assets。
- `android\gradlew.bat assembleRelease`：通过。
- `apksigner verify --verbose --print-certs`：v2/v3 签名通过，证书 MD5 与备案证书一致。
- `aapt dump badging`：确认 `versionName='1.0.14'`、`versionCode='16'`、应用名 `小象日志`。
- 自有服务器 `app-update.json` 已返回 `1.0.14 / 16`，公告内容为黑边、滚动残影/空白、导出失败三项。
- 自有服务器 APK 下载后 SHA256 与本地正式签名包一致。
- APK HEAD 返回 `200 OK`，`Content-Length: 13689771`，`Accept-Ranges: bytes`；Range 请求返回 `206 Partial Content`。

## 交接

- 本次只发布自有服务器主链路，未同步 GitHub Pages / GitHub Release。
- 已安装 `1.0.13 / versionCode 14` 的用户会因为远程 `versionCode 16` 看到更新提示。
