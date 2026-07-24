# TODO

- [ ] 2026-07-21 Android `1.0.27 / code 29` 已发布并通过公网 APK 校验。后端上传受 FTP 断连影响：仅剩 `C:\wwwroot\xiaoxiang-server\dist\lib\monthlyEchoV2.js` 未确认上传。先补传该文件，再在宝塔重启 Node 并确认 `/api/health` PID 变化；之后用真实登录账号重新生成七月月报，验证 `daily_trace_v2_4 / monthly_arc_v2_10 / monthly_echo_render_v2_11`。
- [ ] 2026-07-18 月度回声 UI 已发布 Android `1.0.23 / code 25`：待用真实登录用户验证新回声信长文、行动轨迹回填/空状态和七页翻页；本次只发 UI，若需要行动识别白名单和按证据回填上线，需单独部署后端月度回声模块后再验收。
- [ ] 2026-07-12 本地真实月报验收待 CPAMC：启动 `127.0.0.1:8317/v1` 并确认 `/models` 可访问后，用本地 `2026-06`（28 篇日志）触发 V2 生成，轮询到 ready，再核验所有日期、证据原句和昵称均来自真实数据。

- [ ] 2026-07-15 每日回声后台任务已在运行时启用：线上 `/api/health` 返回 `build=daily-echo-background-20260711` 和 `dailyEchoBackground=true`，匿名 `/api/daily-echo` 返回 401，确认路由已加载。待真实登录账号验证保存后入队、流式首块、退出/刷新/重进恢复、站内通知、Android 前台与恢复前台补发。

- [ ] 2026-07-10 写作时间状态机待 Android 实体设备验收：连接已授权设备后验证连续约 4 分钟写作显示 3～5 分钟，并覆盖切后台、锁屏、系统回收后重开及分两次编辑累计；当前 `adb devices -l` 无设备。

- [ ] 月度回声线上运行时已生效：2026-07-15 已上传路由、服务、编译产物和 Prisma schema，完成 `npx prisma generate`、`npm run db:push` 和 Node 重启。匿名 `/api/monthly-echo` 由旧版 404 变为 401，确认路由已加载；待真实登录账号验证月末推送偏好、backfill 草稿和 `MonthlyEchoJobLog` 失败落库。

- [ ] 2026-06-09 APK 下载源已临时切到 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`，当前实际文件放在服务器 `/dist/download/xiaoxiang-log-latest.apk`。后续可在宝塔/Nginx 增加 `/download/` alias 指向 `C:\wwwroot\xiaoxiang-download\`，并为 `.apk` 设置 `application/vnd.android.package-archive` MIME；当前 `application/octet-stream` 下载可用。

这个文件记录跨会话仍然有价值的待办和阻塞项。临时聊天里的小步骤不用写进来。

## 现在优先

- [ ] 2026-07-17 微信登录待开放平台与真机上线验收：完成移动应用审核，登记 `com.xiaoxiang.diary` 和正式签名摘要；服务器配置 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 后先同步 Prisma schema、保持 `WECHAT_LOGIN_ENABLED=false` 验证配置，再开启开关。最后用已安装微信的 Android 真机覆盖新用户注册、老邮箱绑定、直接登录、解绑、取消/拒绝授权和同一 `userId` 日记同步。不要把 AppSecret 写入仓库或 vault。
- [ ] 2026-05-27 PWA 通知补修已上传云端：线上首页引用 `assets/index-BRuGXoKy.js`，后端 dist/src/schema/package 已上传且未覆盖 `.env`。下一步在宝塔重启 `C:\wwwroot\xiaoxiang-server` Node 项目，确认线上 `.env` 有 VAPID 三项配置，再用真机 Chrome PWA 验证后台/锁屏系统通知。
- [ ] 确认当前工作区多处未提交改动是否需要整理提交，尤其是 `AGENTS.md`/`vault/`、旧 `agent.md` 删除、本地日志同步、PWA、通知、排行榜和 nginx 配置。
- [ ] 确认是否把 `vault/` 放在当前代码仓库内长期维护，还是迁移到 Obsidian/云盘同步目录后在 `AGENTS.md` 改成绝对路径。
- [ ] 2026-06-07 安全债：`deploy-upload.ps1` 仍有内置 FTP 登录信息兜底值。后续应迁移为必须通过环境变量/密钥管理注入，并轮换旧凭据；处理时不要把真实凭据写入 `vault/` 或日志。

- [ ] 月度回声 v2.5 生成链路尚未部署线上：发布前端与服务端后，用真实登录账号重新生成一份报告，确认 `evolvedQuestion.evidenceIds` 能解析独立转折日期，且历史 v2.4 报告按 prompt version 自动刷新。

## 阻塞项

- 暂无。

## 稍后再看

- [ ] 提交前确认 Windows 下 `agent.md` 删除与 `AGENTS.md` 新增是否按预期表现为入口文档迁移。
- [ ] 后续每次实质工作结束前按 `vault/agent/memory-workflow.md` 检查是否需要写入知识库。
