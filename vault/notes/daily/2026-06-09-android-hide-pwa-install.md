# 2026-06-09 Android 隐藏安装到桌面入口

## 背景

用户反馈 Android APK 内侧边栏仍显示“安装到桌面”。原生 APK 已经是安装后的应用，不应再提示 PWA 安装。

## 改动

- `src/components/Layout.tsx` 新增 `shouldShowPwaInstall = !Capacitor.isNativePlatform()`。
- 顶部更多菜单、侧边栏抽屉和 PWA 安装 Bottom Sheet 都增加 `shouldShowPwaInstall` 条件。
- `openInstallSheet()` 在原生平台直接返回，避免残留状态打开安装面板。

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，已将最新前端构建同步到 Android assets；本次构建入口为 `assets/index-Dr7LXTph.js`。

## 后续

下次打 Android 包时同步最新 PWA 后即可带上该改动；浏览器/PWA 环境仍保留“安装到桌面”入口。
