# 2026-06-13 Android 导出图片保存失败修复

## 背景

用户反馈 Android 版本写完日志后点击导出为图片，toast 显示“保存失败，请重试”。

## 根因

`src/pages/Editor.tsx` 的导出图片流程在 Capacitor 原生环境中动态 `import('@capacitor/filesystem')` 并调用 `Filesystem.writeFile()`，但项目没有安装 `@capacitor/filesystem` 依赖；Android 真机生成 canvas 后进入保存分支会直接失败。

## 改动

- 新增 `src/services/androidImageSaver.ts`：封装 Android Capacitor 原生图片保存桥。
- 新增 `android/app/src/main/java/com/xiaoxiang/diary/XiangImageSaverPlugin.java`：Android 10+ 通过 MediaStore 保存 PNG 到系统图片库；Android 9 及以下走公共 Pictures 目录并请求旧版写入权限。
- `android/app/src/main/java/com/xiaoxiang/diary/MainActivity.java` 注册 `XiangImageSaverPlugin`。
- `android/app/src/main/AndroidManifest.xml` 增加 `WRITE_EXTERNAL_STORAGE`，限制 `maxSdkVersion=28`。
- `src/pages/Editor.tsx` 导出图片时改用 `savePngDataUrlToAndroidGallery()`，Web 环境仍保留原下载逻辑。

## 验证

- `npm run build`：通过，仅有既有 Vite chunk 体积提示。
- `npm run lint`：通过。第一次运行前因 `dist/` 引用旧构建产物失败，重新 build 后通过。
- 临时使用 `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot` 执行 `android\gradlew.bat :app:compileDebugJavaWithJavac`：通过。

## 注意

本次按用户要求没有打包 APK。后续发 Android 包前仍需执行常规 `npm run android:sync` 和发布流程。
