# 2026-06-20 Android v1.0.15 发布

## 发布内容

- 版本：`1.0.15` / `versionCode 17`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 本次只发布自有服务器主链路，未同步 GitHub Pages / GitHub Release。

## 更新公告

更新内容：

- 优化编辑器移动端选区显示，减少输入法选中文字时出现白色块状遮挡。
- 修正写完日记后的用时统计，只累计真实活跃写作时间，不再把中途离开的空档算进去。
- 修复消息页面在 Android 和 Web 中内容较多时无法继续上下滑动的问题。

修复内容：

- 为正文编辑区域补充选区颜色和触摸高亮规则，避免系统默认绘制产生异常白块。
- 调整日记完成卡片的写作时长计算逻辑，跨时段继续写作时统计更准确。
- 消息页改为列表区域独立滚动，顶部标题和分类栏保持固定，长列表可以完整查看。

## 验证

- `npm run lint` 通过。
- `npm run test:daily-echo-completion` 通过。
- `npm run android:sync` 通过，并同步最新 `dist` 到 Android assets。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 本地 APK 与公网 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` SHA256 一致：`EA500B56857DCDEBC764F56146D2DDE5A50931F7195655CBFA0248E3CC73B38D`。
- 公网 APK `aapt dump badging` 确认为 `com.xiaoxiang.diary`、`versionCode 17`、`versionName 1.0.15`。
- 公网 `https://xiaoxianglog.cn/app-update.json` 已返回 `1.0.15 / 17`，`apkUrl` 指向自有服务器下载地址。

## 交接

- 如果用户手机已安装 `1.0.14 / versionCode 16` 或更低版本，正常会收到更新提示。
- 如果用户已经安装 `1.0.15 / versionCode 17`，不会再次弹更新提示，这是预期行为。
- 后续发布仍按 `xiaoxiang-android-release` skill：先读当天 daily note，再更新公告，最后必须反查公网 APK 和 manifest。
