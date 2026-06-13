# 2026-06-09 Android APK 界面上下滑动晃动修复

## 背景

用户反馈 Android 安装包内上下滑动时整个界面会晃动。判断为 Android WebView 在页面滚动到顶部/底部时触发的原生边界拉伸/overscroll 效果。

## 改动

- `android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java`：在 Capacitor 初始化后对根视图和 WebView 调用 `setOverScrollMode(View.OVER_SCROLL_NEVER)`。
- `android/app/src/main/res/layout/activity_main.xml`：给 `CoordinatorLayout` 和内置 `WebView` 增加 `android:overScrollMode="never"`。
- `src/index.css`：为根滚动层增加 `overscroll-behavior-y: contain`、`touch-action: pan-y pinch-zoom`，在拦截 Android 边界晃动的同时保留首页、日志圈等长内容的纵向滑动。

## 验证

- `npm run lint`：通过。
- `JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot" ./gradlew.bat :app:assembleDebug`：通过。

## 交接

- 本次未重新生成正式签名 APK，只验证了 debug 构建。
- 如果后续真机仍出现局部列表的边界拉伸，优先给具体滚动容器补 `overscroll-behavior: contain`，不要把 `body` / `#root` 设成 `overflow: hidden`，也不要把页面改成固定高度内部滚动，避免破坏首页的 `window.scrollY` 位置恢复逻辑。
