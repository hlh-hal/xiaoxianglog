# 2026-06-10 Android v1.0.9 发布

## 发布目标

把首页日期遮挡和 Android 页面滚动锁死修复打进正式签名 APK，并通过自有服务器推送给用户端。

## 版本

- `versionName`: `1.0.9`
- `versionCode`: `10`
- 包名：`com.xiaoxiang.diary`
- 主下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 更新清单：`https://xiaoxianglog.cn/app-update.json`

## 本次用户可见更新

更新内容：

- 优化 Android 首页时间轴显示，日期固定在对应日志卡片上方，不再遮挡正文。
- 首页、日志圈和我的页面支持更自然的上下滑动，顶部栏和底部导航保持固定。

修复内容：

- 修复 Android 首页日期栏滑动时覆盖第一条日志内容的问题。
- 修复部分页面看起来像被锁住，无法连续上下滑动查看内容的问题。
- 修复首页滚动位置保存和日期跳转仍依赖 window 滚动的问题。

## 本地构建与签名

- `npm run lint`：通过。
- `npm run android:sync`：通过，生成并同步 `dist/assets/index-Qm02-9Vz.js` 到 Android assets。
- `android\gradlew.bat assembleRelease`：通过。
- 正式签名 APK：`C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk`
- 本地 APK 大小：`13685675` 字节。
- 本地/线上 APK SHA256：`3E1E247E9B9978BCC863C80CA526FD087EAC032A3FD0FF47933D5B4EFACC6E0C`

## 验证结果

- `apksigner verify --verbose --print-certs`：v2/v3 签名通过。
- 证书 MD5：`9a0e0281cd8b3070c425c22290fd3eb4`，与备案证书指纹一致。
- `aapt dump badging`：包名 `com.xiaoxiang.diary`，`versionCode=10`，`versionName=1.0.9`，应用名 `小象日志`。
- 公网 APK HEAD：`200 OK`，`Content-Length=13685675`，`Accept-Ranges=bytes`。
- Range 请求：`206 Partial Content`。
- 下载公网 APK 后 SHA256 与本地正式签名 APK 一致。
- 公网 APK 再次 `aapt dump badging`：`versionCode=10`，`versionName=1.0.9`。
- 公网 `https://xiaoxianglog.cn/app-update.json` 返回 `1.0.9 / 10`，`apkUrl` 为自有服务器下载地址。
- `Origin: capacitor://localhost` 请求更新清单时已返回 `Access-Control-Allow-Origin: *` 和 no-cache 头。

## 部署说明

- 已上传 APK 到：
  - `/dist/download/xiaoxiang-log-latest.apk`
  - `/xiaoxiang-download/xiaoxiang-log-latest.apk`
- 已上传更新清单到：
  - `/dist/app-update.json`
- 按当前 skill 规则，本次没有同步 GitHub Pages，也没有创建 GitHub Release 备用镜像。

## 注意

- 已安装 `1.0.8 / versionCode 9` 的用户应能看到 `1.0.9 / versionCode 10` 更新提示。
- 如果某台手机此前点过“跳过此版本”，这次版本号已变化，不应再被旧 skip 状态挡住。
- 如果用户仍不弹更新，优先检查该手机是否已经安装 `1.0.9`，其次检查旧 APK 的更新检查逻辑是否需要手动安装一次新版。
