# 2026-06-09 小象回声写作中隐藏

## 背景

- 用户视频反馈：保存一次日记后已经生成今日回声，但正文还没写完；继续输入时，小象回声浮层出现在键盘上方，遮挡写作区域。
- 真机表现是 Android 竖屏，键盘弹出时浮层停在编辑工具栏上方。代码里普通回声原本依赖 `keyboardInset > 0` 隐藏，但 Android `interactive-widget=resizes-content` 场景下 `useKeyboardInset()` 会返回 0，因此没有挡住该场景。

## 处理

- 在 `src/pages/Editor.tsx` 新增 `shouldHideDailyEchoForWriting = isEditing && isFocused && !previewHashActive`。
- `shouldHideDailyEchoCard` 统一纳入该写作态，正文聚焦时隐藏普通回声、生成中回声和 completion 卡片。
- 不改今日回声生成、保存、关闭、继续聊天、保存图片、同步或后端接口；回声仍可后台生成，用户离开写作态后再按原有规则显示。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过，仅保留既有 dynamic import/chunk size 警告。
- 本地 Chrome 移动视口 smoke：向 IndexedDB 写入一篇带 `dailyEcho` 的测试日记，打开 `/editor?id=...` 时浮层可见；点击正文进入写作态后 `daily-echo-floating` 消失；继续输入时仍不显示，底部编辑工具栏仍存在。
- 脚本环境里点击空白容易被编辑器重新聚焦，未可靠模拟“收键盘后回显”；该路径由 `isFocused` 反向条件覆盖，真机回归时重点确认。

## 后续注意

- 后续如果还有“键盘上方遮挡写作”的反馈，优先检查是否还有其他浮层绕过了 `isFocused && isEditing` 写作态，而不要只看 `keyboardInset`。
