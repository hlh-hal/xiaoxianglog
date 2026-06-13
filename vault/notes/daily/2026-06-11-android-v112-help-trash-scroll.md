# 2026-06-11 Android v1.0.12 帮助/回收站滚动修复发布

## 背景

用户反馈上一版修复后，首页、我的日志、日志圈等页面已经可以正常滑动，但从侧边栏进入的“帮助”和“回收站”仍然卡死，无法上下滑动查看完整内容。

## 修复

- `src/pages/Help.tsx`：页面根容器改为 `height: 100dvh` + `overflow: hidden`，正文容器加 `app-page-scroll`、`minHeight: 0`、`overflowY: auto`，顶部帮助栏继续固定。
- `src/pages/Trash.tsx`：页面改为 `h-dvh flex flex-col overflow-hidden`，回收站列表区改为 `app-page-scroll min-h-0 flex-1 overflow-y-auto`，顶部栏继续固定。
- 其它页面未改滚动结构，避免影响已经正常的首页、我的日志、日志圈。

## 发布

- Android 版本：`1.0.12`
- Android versionCode：`13`
- 本地正式包：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- SHA256：`6E71A006515C2B748556EF6984A7E6CC9FE59FA504B66631EA3AC0C119FEBA4A`
- 包名：`com.xiaoxiang.diary`
- 签名证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`

## 线上位置

- 主下载：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- GitHub Release：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.12`
- 更新清单：`https://xiaoxianglog.cn/app-update.json`
- GitHub Pages 清单：`https://hlh-hal.github.io/xiaoxianglog/app-update.json`
- `gh-pages` 提交：`0181359`

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，入口 `assets/index-BA40Mp6c.js`。
- `npx cap sync android`：通过。
- `./gradlew.bat :app:assembleRelease`：通过。
- `apksigner verify --verbose --print-certs`：v2/v3 签名通过。
- `aapt dump badging`：确认 `versionCode='13'`、`versionName='1.0.12'`。
- 自有服务器下载 APK 后 SHA256 与本地正式包一致。
- `https://xiaoxianglog.cn/app-update.json` 和 `https://hlh-hal.github.io/xiaoxianglog/app-update.json` 均返回 `1.0.12 / 13`。
- GitHub latest 下载跳转到 `android-v1.0.12`，返回 `200 OK`，大小 `13685675` 字节。

## 交接

- 主工作区仍有历史未提交改动；本次只聚焦帮助/回收站滚动和 Android v1.0.12 发布。
- 如果后续还有“卡死”，优先检查对应页面是否在 `Layout` 的 flex 路由壳里使用了 window/body 滚动；二级页面应使用 `app-page-scroll min-h-0 flex-1 overflow-y-auto` 承担内容滚动。
