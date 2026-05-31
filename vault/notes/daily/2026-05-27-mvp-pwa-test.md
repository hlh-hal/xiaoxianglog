# 2026-05-27 MVP PWA 测试执行

## 背景

- 用户准备进行 10 人 MVP 测试，重点体验写日志、日志圈、AI Chat、多端同步和当前全部主要功能。
- 用户明确本轮先不管 Android 原生 App，主要测试 PWA 打包网页。

## 已执行验证

- 根目录 `npm run lint`、`npm run build` 通过。
- `server/` 下 `npm run build` 通过。
- `server/` 下 `npm run doctor:cpamc` 通过，CPAMC `/models` 和 `LongCat-Flash-Lite` completion 正常。
- `npm run test:exploration` 通过。
- `npx tsx tests/local-vault-sync.test.ts` 通过。
- `npx tsx tests/mobile-pwa-vault-package.test.ts` 通过。
- `npx tsx tests/mobile-pwa-directory-probe.test.ts` 通过。
- 本地开发服 3000 和生产预览 4173 的 `/`、`/community`、`/profile`、`/settings`、`/ai-chat`、`/leaderboard`、`/editor` 均可渲染，无 Vite overlay 和控制台错误，Service Worker 可注册。
- 线上只读检查通过：`https://www.xiaoxianglog.cn/api/health` 返回 build `cpamc-only-20260520`；manifest 为 `application/manifest+json`，`display=standalone`，2 个 icon；`/sw.js` 包含 `push` 和 `notificationclick`；公开页面可渲染且无控制台错误。

## 10 人 API 场景

- 临时创建 10 个本地测试账号，测试结束后已清理，数据库中该 runId 测试用户数为 0。
- 覆盖登录、`/sync/push` 并发、`/sync/pull`、日记 CRUD/回收站、账号隔离、图片上传、非法上传拒绝、日志圈发帖/点赞/评论、通知、好友、排行榜、AI 会话隔离、CPAMC 状态和 10 路 AI 并发。
- 非 AI 请求 P95 约 575ms。
- 10 路 AI 并发结果为 8 个 200、2 个 429，符合当前全局并发 8 的预期，没有拖垮后端。
- 后端日志没有 SQLite lock 或进程异常；本地仅出现 VAPID 未配置导致的 Push 跳过提示。
- 补充前端真实交互：用 Puppeteer 手机视口打开 `/login`，通过真实键盘输入临时账号邮箱/密码并点击登录，`/api/auth/login` 返回 200，`localStorage` 写入 token，刷新 `/profile` 后显示测试昵称；测试账号已清理。

## 风险与下步

- `npm run test:preservation` 稳定在 P3 抛出 `Execution context was destroyed`。
- `npm run test:preservation:verify` 中 P3/P4 背景图主题导出像素不一致：P3 diff 100%，P4 diff 77.8653%。这影响分享/导出图片的背景图主题保真度，建议 MVP 前修复或明确降级为可接受风险。
- 本地 `server/.env` 未配置 VAPID，Push 状态接口可用但 `configured=false`，因此本地无法完整验证后台/锁屏 Web Push 到达；线上登录态下仍需用真机 PWA 调 `/api/notifications/push/status` 和 `/api/notifications/push/self-test` 做最终确认。
