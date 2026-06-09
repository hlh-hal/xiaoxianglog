# 2026-06-08 编辑器文字选区滚动追补

## 背景

- 用户反馈：移动端编辑页选中几段文字后继续多选，会突然滚到正文末尾下方的大段空白，并且向上滑动不顺。
- 关联历史：`vault/notes/daily/2026-05-31-editor-text-selection-scroll.md` 已记录过同类问题，本次是在该修复基础上追补。

## 处理

- `src/pages/Editor.tsx` 的文本选区 guard 不再持续恢复到选区开始时的 `scrollTop`，改为只在滚入内容尾部 padding 空白时裁剪异常滚动，避免和系统选区手柄拖动打架。
- 新增 `isTextSelectionActiveState`，选区激活期间把编辑器底部 padding / `scrollPaddingBottom` 切换为紧凑值，去掉普通输入态额外 breathing room；选区结束后恢复普通输入留白。
- 文本选区开始时主动停止 input scroll lock，避免长按选字后短时间内仍被输入锁拉回旧滚动位置。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过，仅保留既有 dynamic import/chunk size 警告。
- 本地 Vite `http://127.0.0.1:3000/editor` 移动视口 smoke test 通过：选区态 padding/scroll-padding 为 96px，脚本强制滚到末尾后没有进入额外空白尾部。

## 后续注意

- 真机上如果仍出现轻微跨屏滚动，先区分是系统选区手柄的正常自动滚动，还是再次滚入编辑器底部 padding 空白。
- 旧笔记文件存在编码显示问题，本次未重写旧内容，避免扩大无关 diff。

## 云端部署

- 2026-06-08 已执行 `deploy-upload.ps1 -Target front`，只上传前端 `dist/`，20/20 文件 OK。
- 线上首页 `https://www.xiaoxianglog.cn/` 已引用 `assets/index-CTapU8m5.js` 和 `assets/index-D6zG-Jyj.css`。
- 远端 JS/CSS SHA256 与本地 `dist/` 一致：JS `CE72D624C832FE0AEE7ADA55483992BAB185B49A6DC8E60A3D6D4469FC32CA25`；CSS `2CD6E90AABC02B6A439DC8EB415B8892A8F50CB203254B7B82F5F5CE2E018FC5`。
- 线上 `sw.js` 仍返回 `CACHE_VERSION = 'xiaoxiang-pwa-v13'`；`/api/health` 返回 `build: cpamc-only-20260520`、`pid: 2984`。本次无后端变更，无需重启 Node。
