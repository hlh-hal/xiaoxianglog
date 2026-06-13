# 2026-06-09 Android 系统返回手势修复

## 背景

用户反馈 Android APK 在二级页面使用系统右滑返回时，应用直接退到桌面，预期应返回上一级页面。

## 根因

项目此前没有接入 Capacitor `backButton` 事件，Android 系统返回手势落到默认 Activity 行为，可能直接退出应用，而不是交给 React Router 做页面回退。

## 改动

- 新增依赖 `@capacitor/app@8.1.0`。
- `src/components/Layout.tsx` 接入 `CapacitorApp.addListener('backButton', ...)`。
- Android 原生环境返回优先级：
  1. 关闭更新公告、安装面板、列表样式、日历、更多菜单、侧边栏等当前 UI 层。
  2. 非首页路由优先 `navigate(-1)` 返回上一级。
  3. 如果无 WebView 历史但当前不是首页，则 `replace` 到首页。
  4. 只有首页才调用 `CapacitorApp.exitApp()`。
- `npm run android:sync` 后 Android 工程已识别 `@capacitor/app` 插件。

## 验证

- `npm run lint` 通过。
- `npm run android:sync` 通过，本次前端构建入口为 `assets/index-Dj0pYHz3.js`。
- 临时使用 `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot` 执行 `android\gradlew.bat assembleDebug` 通过。

## 后续

下次正式发版需要重新构建签名 APK，才能让已安装用户拿到该返回手势修复。
