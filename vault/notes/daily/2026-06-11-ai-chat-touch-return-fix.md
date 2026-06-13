# 2026-06-11 AI 聊天输出点击误返回首页修复

## 背景

用户反馈：AI 正在生成内容时，点击 AI 的输出会一下子直接返回首页。

## 根因

`src/pages/AIChat.tsx` 的外层容器用局部变量 `let startX = 0` 记录触摸起点，用于左边缘右滑返回。AI 流式生成时每个 chunk 都会触发组件重新渲染，触摸按下到抬起之间局部变量会被重置为 `0`，导致一次普通点击被误判成 `startX < 40 && delta > 60` 的边缘返回手势，从而执行 `navigate(-1)` 或回到 `/`。

## 修复

- 将触摸起点改为 `useRef` 保存：`edgeSwipeStartRef`。
- 只在真正从左边缘开始、横向位移足够、纵向偏移不大的手势中触发返回。
- 增加 `onTouchCancel` 清理，避免系统打断手势后留下旧起点。

## 验证

- `npm run lint` 通过。
- Chrome headless + Puppeteer 验证：进入 `/ai-chat`，生成一条未登录提示消息后点击 `.markdown-body`，路径保持 `/ai-chat`；再从左边缘右滑，路径返回 `/`。
- `npm run build` 通过；仅保留已有的 Vite chunk-size / dynamic-import 警告。

