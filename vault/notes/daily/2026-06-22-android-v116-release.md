# 2026-06-22 Android v1.0.16 发布

## 发布内容

- 版本：`1.0.16` / `versionCode 18`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 本次只发布自有服务器主链路，未同步 GitHub Pages / GitHub Release。

## 更新公告

更新内容：

- 修复导出日记图片时中英文相邻文本可能重叠的问题，导出的长图更清晰。
- 优化编辑器移动端光标和选区显示，减少输入法选中文字时出现白色块状遮挡。
- 修正写完日记后的用时统计，只累计真实活跃写作时间，不再把中途离开的空档算进去。

修复内容：

- 导出图片改用更稳定的文本断行方式，避免 html2canvas 渲染时出现字符挤压或覆盖。
- 为正文编辑区域补充选区颜色和触摸高亮规则，降低系统默认绘制导致的白块问题。
- 调整日记完成卡片的写作时长计算逻辑，跨时段继续写作时统计更准确。

## 验证

- `npx tsx src\utils\exportImage.test.ts` 通过。
- `npm run test:daily-echo-completion` 通过。
- `npm run test:monthly-echo` 通过。本次发布前发现并修复 `MonthlyEcho.tsx` 中 `MomentCard` 仍按旧字符串 props 传参导致的 TypeScript 错误。
- `npm run lint` 通过。
- `npm run android:sync` 通过。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 为 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 公网 APK 与本地正式签名包 SHA256 一致：`F3F764E1E8A9901FDA20E470E6D18FC5CCB7B7BAC1AFBB8F6DB11F80466AAAFE`。
- 公网 APK `aapt dump badging` 确认为 `com.xiaoxiang.diary`、`versionCode 18`、`versionName 1.0.16`。
- 公网 `https://xiaoxianglog.cn/app-update.json` 已返回 `1.0.16 / 18`，`apkUrl` 指向自有服务器下载地址。

## 交接

- 如果用户手机已安装 `1.0.15 / versionCode 17` 或更低版本，正常会收到更新提示。
- 如果用户已经安装 `1.0.16 / versionCode 18`，不会再次弹更新提示，这是预期行为。
