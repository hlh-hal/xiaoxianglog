# Android 1.0.26 月度回声兼容热修复

- 线上问题：真机 `1.0.25` 打开历史月度回声时出现 `TypeError: Cannot read properties of undefined (reading 'slice')`，调用点是新版第二页的 `page.emotions.slice(0, 5)`。
- 根因：历史 report 在 `overview` 中没有 `emotions`，TypeScript 静态类型不能保护服务端持久化的旧 JSON。
- 修复：`normalizeOverviewEmotions(unknown)` 只在值为数组时取前 5 项，否则返回空数组并展示既有空状态；情绪卡 key 同时兼容缺失 `evidenceIds`。
- 回归：新增 undefined/null/错误类型/超过 5 项四种覆盖；`npm run test:monthly-echo` 38 项、`npm run lint`、Vite/Capacitor、Gradle release 构建通过。
- 已发布 `1.0.26 / versionCode 28` 到自有服务器。v2/v3 签名、正式证书 MD5、包名 `com.xiaoxiang.diary` 均通过；公网与本地 APK SHA256 同为 `9F4D7CBF641942F9ECE4870FB199DDE82D1AEEFB3082C279C2B0F74CDD08131E`，manifest 中文公告正常。
- 前端 FTP 首次因连接冷却失败，等待后第二次 43/43 上传成功，耗时约 425 秒；APK 双路径上传耗时约 85 秒。GitHub Pages/Releases 未同步。
