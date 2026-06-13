# TODO

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
