# 2026-06-01 编辑器滚动保持输入法

## 背景

- 用户视频反馈：编辑日记时，想滑动正文切换书写位置，但输入法会消失；期望是键盘保持打开，直接切换光标位置继续写。
- 范围：PWA/web 编辑器主页面 `src/pages/Editor.tsx`，不涉及后端、数据库或 Android 原生层。

## 根因

- `<main>` 主滚动容器的 `onTouchMove` 在普通正文滚动时调用了 `closeInlineImageToolbar({ clearSelection: true, blur: true })`。
- `closeInlineImageToolbar` 在未选中内联图片节点时，只要 `blur: true` 就会执行 `activeEditor.commands.blur()`。
- 因此用户只是滑动正文，也会被代码主动 blur 编辑器，移动端浏览器随即收起输入法。

## 修复

- 将编辑器主滚动容器的普通 `onTouchMove` 改为 `closeInlineImageToolbar({ clearSelection: true })`。
- 保留滚动时关闭临时图片工具栏/清理图片选择的行为，但不再主动让 Tiptap 编辑器失焦。
- 新增 Puppeteer 回归：`touch scrolling keeps editor focused`，验证触发 `touchmove` 后 `.ProseMirror` 仍保持焦点。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过；仅保留既有 dynamic import/chunk size 警告。
- `XIAOXIANG_APP_URL=http://localhost:3001 npm run test:editor-exit-save` 通过，包含新增的输入法焦点保持回归。

## 后续注意

- 移动端浏览器对“程序化 focus 是否重新弹键盘”有限制，所以关键是避免滚动时主动 blur；切换光标位置仍应通过用户点击/触摸正文来完成。
