# 2026-06-13 首页滚动中段空白修复

## 背景

用户反馈首页滑动查看日志时，中间会短暂出现一段空白。日志没有丢失，但视频中能看到列表区域只剩时间轴竖线和背景，前一帧还伴随多张卡片文字残影，体验像页面被闪空。

## 修复

- `src/pages/Home.tsx`
  - 首页滚动保存、恢复、日期跳转统一使用 `scrollRef` 对应的内部滚动容器，不再混用 `window.scrollY` 和容器坐标。
  - 被动刷新、同步事件、focus/pageshow 刷新时，如果当前已有日志但读取结果短暂为空，不立即清空列表；延迟 250ms 复查后再决定是否显示空列表。
  - 删除、隐藏、批量移动到回收站等用户明确操作仍允许真正清空列表，避免最后一条删除后旧内容残留。

- `src/components/diary-lists/TimelineList.tsx`
  - 时间轴卡片去掉 `transition-all duration-500`，改为轻量 `transition-shadow duration-200`。
  - 缩小每条日志底部间距，减少滚动中视觉断层。
  - 为时间轴列表、列表项和卡片增加专用 class，方便滚动绘制层控制。

- `src/index.css`
  - 为首页时间轴卡片增加 `backface-visibility`、`contain: paint`。
  - Android WebView 下给时间轴 item/card 使用 `translateZ(0)`，减少高速滚动时文字残影和整片空白的中间帧。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，产物为 `assets/index-C0NVqOvK.js` 和 `assets/index-CfAqH7Fe.css`。

## 交接

- 本次按用户要求只修复代码并构建验证，没有执行 `npm run android:sync`，也没有打包 APK。
- 如果后续仍看到空白，优先检查首页是否又新增了被动刷新时的 `setJournals([])`，或时间轴卡片是否重新引入 `transition-all`、`content-visibility: auto` 等影响滚动绘制的样式。
