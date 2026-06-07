# 2026-06-06 DailyEcho 累计编辑时长持久化

## 背景

用户反馈完成反馈卡里的“用了 1 分钟”会覆盖原本已累计的 14 分钟。目标是让每篇日记的实际活跃编辑时长终身累计，退出、刷新、重进和换设备后继续保留；重复保存且没有新输入时不增加也不回退。

## 本次变更

- 前端 `DiaryEntry` 新增 `activeWritingSeconds?: number`，编辑页加载日记时用该值作为活跃计时基线。
- 手动保存、自动保存、返回、切后台和页面退出都会暂停活跃计时并把累计秒数写入本地日记数据。
- 完成反馈卡读取保存后的累计总时长；分钟按完整分钟显示，非零不足 1 分钟显示 1 分钟。
- 修复生产模式下自动保存/AI 失败态可能盖掉完成反馈卡的问题：
  - 保存成功后用落盘后的正文签名和 `activeWritingSeconds` 与上次手动保存基线比较。
  - 完成反馈卡不再被滚动隐藏或键盘高度残留误伤。
- 后端 Prisma 增加 `active_writing_seconds Int @default(0)`，日记 CRUD 与 `/api/sync/push` 接收非负整数，更新时使用现有值和传入值的较大者，防止旧客户端/延迟同步回退累计时长。

## 验证

- `npm run test:daily-echo-completion`
- `npm run test:sync-push`
- `npm run test:daily-echo-quality`
- `npm run lint`
- `npm run build`
- `cd server && npm run build`
- `npm run verify:daily-echo-writing-time`
- `ECHO_VERIFY_BASE_URL=http://47.122.112.242 npm run verify:daily-echo-writing-time`

线上验收截图：

- `artifacts/daily-echo-writing-time-online-2026-06-06.png`

验收结果：预置 14 分钟日记，第一次保存仍显示 14 分钟并保存 841 秒；继续实际输入后显示 15 分钟并保存 901 秒。

## 部署状态

- 已通过 FTP 上传前端最终包：
  - `dist/assets/index-DBLekWyW.js`
  - `dist/assets/index-Care1xV0.css`
- 已上传后端 `server/dist`、`server/src`、`server/prisma/schema.prisma` 与 package 文件。
- 线上首页已确认引用最终前端 hash。

注意：FTP 上传脚本不会自动在服务器执行 `npx prisma generate`、`npx prisma db push --skip-generate` 或重启 Node。后端字段已上传，但云端数据库迁移和进程重启需要在服务器终端完成后，真实跨设备同步才会持久保存 `activeWritingSeconds`。

