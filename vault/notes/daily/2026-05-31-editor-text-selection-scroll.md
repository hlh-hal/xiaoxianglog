# 2026-05-31 编辑器选中文字下滑修复

## 背景

- 用户视频反馈：在日记图片后面的正文里长按/拖选文字时，页面会不受控制往下滑，影响编辑体验。
- 范围：PWA/web 编辑器主页面 `src/pages/Editor.tsx`，不涉及 Android 原生层、后端或数据结构。

## 根因

- 编辑器主滚动容器为了软键盘、底部工具栏和输入呼吸空间保留了较大的 bottom padding。
- 原有 tap/input scroll lock 只覆盖点击聚焦和输入事件；移动端原生文本选择时，浏览器会自动滚动 contenteditable 容器以显示选区。
- `main` 的 `onTouchMove` 又会释放输入滚动锁，所以拖选正文容易被浏览器滚进底部留白，表现为页面失控下滑。

## 修复

- 在 `Editor.tsx` 增加独立的文本选区滚动保护，不复用 tap/input lock。
- 只在编辑态、触点来自 `.ProseMirror` 正文且不是图片/按钮/工具栏时启动；不 `preventDefault`，保留系统选中文字菜单和拖拽手柄。
- 当选区仍在可视安全区内时恢复 `editorScrollRef` 与 window 的滚动位置；选区靠近可视边缘时允许正常跨屏选择滚动。
- 保护锁在 pointerup/touchmove/selectionchange 后短暂保持，并在空闲后释放，避免选完文字后影响正常滚动。
- 编辑器 Puppeteer 测试支持 `XIAOXIANG_APP_URL`，便于当 3000 被占用时指向本次 Vite 实例。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过；仅保留既有 dynamic import/chunk size 警告。
- `XIAOXIANG_APP_URL=http://localhost:3001 npm run test:editor-exit-save` 通过，新增覆盖“图片后文本选区仍在安全区内时，额外滚动会被恢复”的回归用例。

## 后续注意

- 若后续真机仍出现拖选到屏幕边缘时的轻微滚动，需要先区分这是浏览器为了跨屏选择的正常自动滚动，还是再次滚入底部 breathing room。
