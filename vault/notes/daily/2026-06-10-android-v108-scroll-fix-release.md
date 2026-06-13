# 2026-06-10 Android v1.0.8 滚动修复发布

## 发布结果

- Android 正式版：`1.0.8` / `versionCode 9`
- 包名：`com.xiaoxiang.diary`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- GitHub Release 备用镜像：`https://github.com/hlh-hal/xiaoxianglog/releases/tag/android-v1.0.8`
- APK SHA256：`286F11FBE9C32354AD4933FFB2949EDBEBAD367254313E921B5FD9730C27C356`

## 修复内容

- 放松 Android 全局 `touch-action` 限制，避免列表纵向滑动手势被全局规则误拦截。
- 给主内容区加 `app-route-scrollport`，明确页面内容是可滚动区域。
- 首页、日志圈、我的页面补充 `min-h-0 flex-1 overflow-y-auto`，确保顶部和底部固定时中间内容可以上下滚动。
- 首页滚动位置保存和日期跳转改为优先使用内容容器，必要时再回退到 `window`。

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，Android assets 同步到 `assets/index-RYVDjw07.js`。
- `android\gradlew.bat assembleRelease` 通过。
- `apksigner verify --verbose --print-certs` 通过，v2/v3 签名有效，证书 MD5 与备案签名一致。
- `aapt dump badging` 确认 APK 内部版本为 `versionName='1.0.8'` / `versionCode='9'`。
- 自有服务器 APK 返回 `200 OK`，Range 请求返回 `206 Partial Content`。
- 下载线上 APK 后 SHA256 与本地签名 APK 一致。
- `https://xiaoxianglog.cn/app-update.json` 返回 `1.0.8 / versionCode 9`。
- GitHub Pages `app-update.json` 返回 `1.0.8 / versionCode 9`，Pages build 状态为 `built`。
- GitHub latest 备用链接重定向到 `android-v1.0.8`。

## 注意

用户反馈来自 Android 真机：顶部和底部固定可以保留，但中间内容必须可滑动。后续改动滚动策略时，避免把 `html/body/#root` 全局设为过强的 `touch-action` 或独立滚动锁。
