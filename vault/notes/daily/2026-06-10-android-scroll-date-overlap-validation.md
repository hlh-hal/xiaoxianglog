# 2026-06-10 Android 首页日期遮挡与滚动锁死验证

## 背景

用户反馈 Android 首页时间轴日期会悬浮遮挡日志内容，并且首页内容无法自由上下滑动。相关页面包括首页、日志圈、我的页面。

## 本次改动

- `src/components/diary-lists/TimelineList.tsx`
  - 移除时间轴日期栏的 sticky 吸顶行为。
  - 日期改为普通块级行，固定显示在对应日志卡片上方，避免滚动时覆盖正文。
- `src/pages/Home.tsx`
  - 首页根容器改为实际纵向滚动容器：`app-page-scroll min-h-0 h-full flex-1 overflow-y-auto`。
  - 保留 `scrollRef` 作为滚动位置保存、日期跳转和恢复的目标。
  - 增加底部留白，避免最后一条日志被底部导航和加号按钮遮挡。
- `src/pages/Community.tsx`、`src/pages/Profile.tsx`
  - 主内容容器统一使用 `app-page-scroll`，由页面内部滚动。
- `src/components/Layout.tsx`
  - 首页、日志圈、我的页面外层 `main` 改为高度约束和 `overflow-hidden`，避免父子滚动互相抢 Android WebView 手势。
- `src/index.css`
  - `touch-action: pan-y` 只保留在 `.app-page-scroll` 上，不再绑到外层布局容器。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，仅保留既有大 chunk 警告。
- `npm run android:sync`：通过，Android assets 已同步。
- `adb devices`：当前未连接真机或模拟器，因此使用生产构建的移动端浏览器视口验证。

截图验证使用 Chrome mobile viewport `390x844`，写入 14 条本地测试日记：

- `artifacts/android-scroll-fix/home-date-no-overlap.png`
  - 日期行 `position=relative`。
  - 日期行 bottom `92`，首张卡片 top `100`，无重叠。
- `artifacts/android-scroll-fix/home-scrolled-bottom.png`
  - 首页滚动容器 `scrollHeight=3769`，`clientHeight=788`。
  - 滚到底部后 `scrollTop=2981`，`reachedBottom=true`。
  - 最后一条日志 bottom `684`，滚动容器 bottom `844`，未被底部导航遮挡。

## 交接提示

- 这次没有重新打包发布 APK，只完成代码修复、生产构建、Android 同步和本地视觉验证。
- 如果用户要推送给手机端，需要再走 Android 发布流程，把新 assets 打进正式签名 APK 并上传服务器。
- 真机验证时重点检查首页连续上下滑动、日志圈长列表、我的页面设置项长列表，以及顶部栏/底部导航固定效果。
