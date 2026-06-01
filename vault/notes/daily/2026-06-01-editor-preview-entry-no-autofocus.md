# 2026-06-01 编辑页预览态进入后不自动弹输入法

## 背景

用户视频反馈：从首页日记卡片进入编辑页后，页面显示应为预览状态，但输入法会直接弹出。预期是只有用户点击正文文字、明确开始编辑时才弹出输入法。

## 根因

`src/pages/Editor.tsx` 的主滚动容器 `onClick` 在 `!isEditing` 预览态下，只要收到 click 就会执行 `setIsEditing(true)` 并聚焦 ProseMirror。移动端从首页卡片跳转时，上一页的 tap/click 可能在路由切换后落到编辑页主容器或正文区域，导致预览页刚进入就被误判为“用户点击正文开始编辑”，从而拉起输入法。

## 修复

- 增加 `previewEntryClickGuardUntilRef` 和 `previewEditorPointerDownAtRef`。
- 预览态进入旧日记时，短时间内只允许“编辑页内真实 pointerdown 后产生的正文 click”进入编辑模式。
- 没有编辑页 pointerdown 的落地 click 会被吞掉，只关闭浮层，不聚焦编辑器。
- 预览态下点击正文仍可立即进入编辑；点击空白区域不再进入编辑。
- 已编辑态的点按、光标切换、滑动后继续输入逻辑保持原样。

## 验证

- `npm run lint`
- `npm run build`
- `XIAOXIANG_APP_URL=http://127.0.0.1:3000 npm run test:editor-exit-save`

新增回归用例：`existing entry preview does not auto-focus`，覆盖旧日记打开后不自动聚焦、落地/空白 click 不弹键盘、用户点击正文后可进入编辑。

## 风险与手测建议

建议真机/PWA 复测首页卡片进入旧日记：进入后输入法不应弹出；点击正文文字后输入法应正常弹出并可切换光标位置。
