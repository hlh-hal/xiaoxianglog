# 2026-06-13 搜索页滚动卡死本地修复

## 背景

用户反馈 Android 安装包内搜索界面被固定住，无法上下滑动。截图显示搜索页列表内容超出首屏，但页面不能继续下滑。

## 修复

- `src/pages/Search.tsx`：页面根容器改为 `h-dvh flex flex-col overflow-hidden`。
- 搜索顶部栏继续固定，并加 `shrink-0`。
- 搜索结果正文区域改为 `app-page-scroll min-h-0 flex-1 overflow-y-auto` 承担实际滚动。
- 搜索结果点击进入编辑器时，滚动位置从 `window.scrollY` 改为读取正文滚动容器 `scrollTop`；返回搜索页时也恢复到该容器。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，入口 `assets/index-Cv2T5VBu.js`。

## 交接

- 用户明确要求“不要推送到用户端”，因此本次只做本地代码修复和本地构建验证。
- 未打正式 APK，未上传服务器，未创建 GitHub Release，未同步 GitHub Pages。
- 后续如果要发布，需要在当前版本基础上递增 Android `versionCode`，再走正式打包发布流程。
