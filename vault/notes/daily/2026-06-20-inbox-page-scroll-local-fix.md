# 2026-06-20 消息页滚动卡死本地修复

## 背景

用户反馈 Android 安装包内“消息”界面被固定住，无法上下滑动。截图显示通知列表超出首屏，但页面不能继续滑动。

## 修复

- `src/pages/Inbox.tsx`：页面根容器从 `minHeight: 100vh` 改为 `height: 100dvh`，并加 `overflow: hidden`。
- 顶部标题栏和 Tab 栏增加 `flexShrink: 0`，继续固定在顶部。
- 消息列表区增加 `app-page-scroll`、`minHeight: 0`、`overflowY: auto`，由列表区承担实际滚动。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，入口 `assets/index-BM_IMvvC.js`。

## 交接

- 用户明确要求“不推送用户端”，因此本次只做本地代码修复和本地构建验证。
- 未打正式 APK，未上传服务器，未创建 GitHub Release，未同步 GitHub Pages。
- 这类问题与之前帮助、回收站、搜索页一致：二级页面不要依赖 window/body 滚动，应在路由 flex 壳内使用 `app-page-scroll min-h-0 flex-1 overflow-y-auto` 承担内容滚动。
