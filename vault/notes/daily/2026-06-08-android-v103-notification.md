# 2026-06-08 Android v1.0.3 每日提醒重复通知修复

## 背景

用户真机截图显示 Android 通知栏同一时间出现两条“小象日志”每日提醒，文案分别为“用几分钟，收藏今天”和“该写点今天的故事了 ✍️”。

## 原因

两条文案都来自每日提醒随机文案池。Android 端同时存在三条链路：

- 原生 `AlarmManager` 定时提醒。
- 前端启动后的每日提醒兜底轮询。
- 登录后同步到服务端的每日 Web Push。

旧版本可能同时打开原生提醒和服务端每日 Push，所以同一时间会收到两条提醒。

## 本次处理

- Android 原生环境中，`sendDailyReminderIfNeeded()` 直接返回，不再跑前端每日提醒兜底轮询。
- Android 启动时如果发现服务端 `dailyReminderEnabled` 仍为 true，会自动调用接口关闭，清理旧版本遗留的服务端每日 Web Push。
- Android 设置页开启每日写日记提醒时，只排原生 `scheduleDailyReminder()`，不再要求 PWA Push 订阅，也不会把服务端每日提醒打开。
- 点赞、评论、好友申请等互动通知仍保留服务端通知逻辑。
- Android 版本升到 `1.0.3` / `versionCode 4`，固定下载链接仍为 GitHub Release latest。

## 验证

- `npm run lint` 通过。
- `.\node_modules\.bin\tsx.cmd tests\media-url.test.ts` 通过。
- `npm run build`（server）通过。
- `npm run android:sync` 通过，生成 `assets/index-BQeXXkhH.js`。
- Release APK 构建、zipalign、正式签名完成。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 仍为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- `aapt dump badging` 确认 `versionCode='4'`、`versionName='1.0.3'`。
- GitHub latest 下载 SHA256：`D89DB206610FE9F79B76E5EF6E98DD293863E45D7DB752D0EDD7B0A93A0AB274`。
- Pages `app-update.json` 已返回 `1.0.3` / `versionCode 4`。

## 产物

- 本地 APK：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- Release：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.3`
- 固定下载：`https://github.com/hlh-hal/xiaoxianglog/releases/latest/download/xiaoxiang-log-latest.apk`
