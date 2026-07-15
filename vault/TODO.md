# TODO

- [ ] 2026-07-12 月度回声 V2 待部署线上：备份线上 SQLite，执行 Prisma generate/db push，部署新后端与前端，确认 `/api/monthly-echo` 返回 `renderPayload.schemaVersion=2`，再用真实登录用户验证按需生成、当前昵称注入、七页上滑和月末任务重试。
- [ ] 2026-07-12 本地真实月报验收待 CPAMC：启动 `127.0.0.1:8317/v1` 并确认 `/models` 可访问后，用本地 `2026-06`（28 篇日志）触发 V2 生成，轮询到 ready，再核验所有日期、证据原句和昵称均来自真实数据。

- [ ] 2026-07-11 每日回声后台任务待上线与真机验收：先备份线上 SQLite，部署新后端并执行 Prisma generate/db push，配置 `DAILY_ECHO_BACKGROUND_ENABLED=true`，部署并重载 Nginx `/api/daily-echo/` SSE 段；确认 `/api/health` 为 `build=daily-echo-background-20260711` 且 capability 为 true，再用真实登录账号验证保存后入队、流式首块、退出/刷新/重进恢复、站内通知、Android 前台与恢复前台补发。当前实现和自动化均已通过，但未部署、未改线上数据库。

- [ ] 2026-07-10 写作时间状态机待 Android 实体设备验收：连接已授权设备后验证连续约 4 分钟写作显示 3～5 分钟，并覆盖切后台、锁屏、系统回收后重开及分两次编辑累计；当前 `adb devices -l` 无设备。

- [ ] 月度回声线上后端尚未生效：2026-07-01 Android WebView 实测 `https://www.xiaoxianglog.cn/api/monthly-echo?monthKey=2026-07` 返回 `404 Cannot GET /api/monthly-echo`，健康检查仍为 `build=cpamc-only-20260520`。上线前执行 `server npm run db:push` 同步目标数据库，部署并重启 `C:\wwwroot\xiaoxiang-server`，确认 scheduler 已启动，再用真实登录账号验证 `/api/monthly-echo`、月末推送偏好、backfill 草稿和 `MonthlyEchoJobLog` 失败落库。

- [ ] 2026-06-09 APK 下载源已临时切到 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`，当前实际文件放在服务器 `/dist/download/xiaoxiang-log-latest.apk`。后续可在宝塔/Nginx 增加 `/download/` alias 指向 `C:\wwwroot\xiaoxiang-download\`，并为 `.apk` 设置 `application/vnd.android.package-archive` MIME；当前 `application/octet-stream` 下载可用。

这个文件记录跨会话仍然有价值的待办和阻塞项。临时聊天里的小步骤不用写进来。

## 现在优先

- [ ] 2026-05-27 PWA 通知补修已上传云端：线上首页引用 `assets/index-BRuGXoKy.js`，后端 dist/src/schema/package 已上传且未覆盖 `.env`。下一步在宝塔重启 `C:\wwwroot\xiaoxiang-server` Node 项目，确认线上 `.env` 有 VAPID 三项配置，再用真机 Chrome PWA 验证后台/锁屏系统通知。
- [ ] 确认当前工作区多处未提交改动是否需要整理提交，尤其是 `AGENTS.md`/`vault/`、旧 `agent.md` 删除、本地日志同步、PWA、通知、排行榜和 nginx 配置。
- [ ] 确认是否把 `vault/` 放在当前代码仓库内长期维护，还是迁移到 Obsidian/云盘同步目录后在 `AGENTS.md` 改成绝对路径。
- [ ] 2026-06-07 安全债：`deploy-upload.ps1` 仍有内置 FTP 登录信息兜底值。后续应迁移为必须通过环境变量/密钥管理注入，并轮换旧凭据；处理时不要把真实凭据写入 `vault/` 或日志。

## 阻塞项

- 暂无。

## 稍后再看

- [ ] 提交前确认 Windows 下 `agent.md` 删除与 `AGENTS.md` 新增是否按预期表现为入口文档迁移。
- [ ] 后续每次实质工作结束前按 `vault/agent/memory-workflow.md` 检查是否需要写入知识库。
