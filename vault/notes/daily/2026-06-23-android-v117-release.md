# 2026-06-23 Android v1.0.17 发布

## 发布内容

- 版本：`1.0.17` / `versionCode 19`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 本次只发布自有服务器主链路，未同步 GitHub Pages / GitHub Release。

## 更新公告

更新内容：

- 优化 Android 编辑器选区和光标表现，减少深色主题下选中文字时出现白色块状遮挡。
- 调整写完日记后的写作时长统计，短暂停下来思考会被计入，离开页面或切后台仍不会误算。
- 升级月度回声阅读体验，入口封面、六页故事布局、左右留白和沉浸感都更自然。

修复内容：

- 为 Android WebView 的日记正文选区补充专用样式和背景兜底，降低原生选区手柄合成出白底的概率。
- 写作用时统计的单段思考上限调整为 3 分钟，并保留后台暂停、跨会话恢复和分钟四舍五入规则。
- 月度回声去掉故事页顶部栏，重排页面内容，收窄移动端左右空隙，并修正入口页背景图。

## 验证

- `npm run lint` 通过。
- `npm run test:daily-echo-completion` 通过。
- `npm run test:monthly-echo` 通过。
- `npm run android:sync` 通过。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 公网 APK 与本地正式签名包 SHA256 一致：`9C5248DFAF926E5E52CBDD79F0F3016D642C7668E22D7204A3741A84ACBCE2C8`。
- 公网 APK `aapt dump badging` 确认为 `com.xiaoxiang.diary`、`versionCode 19`、`versionName 1.0.17`。
- 公网 `https://xiaoxianglog.cn/app-update.json` 已返回 `1.0.17 / 19`，`apkUrl` 指向自有服务器下载地址。

## 交接

- 如果用户手机已安装 `1.0.16 / versionCode 18` 或更低版本，正常会收到更新提示。
- 第一次公网验收时 range 请求连接超时，重试后通过；判断为临时网络抖动。
