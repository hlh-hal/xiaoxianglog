# 2026-06-04 排行榜点赞每月重置

## 来源

用户要求“日志排行榜，每月一日点赞数清零，重新计数”。

## 改动

- `server/src/routes/leaderboard.ts` 新增按 `Asia/Shanghai` 计算排行榜月份的逻辑。
- 排行榜列表、排行榜点赞接口、个人获赞汇总接口会在处理前惰性清理本月之前的 `LeaderboardLike`。
- 当前月点赞统计和 `likedByMe` 只计算本月 `createdAt >= monthStart` 的记录。
- 不改自赞规则：沿用已确认的“用户可以给自己点赞”。
- 新增 `tests/leaderboard-monthly-reset.test.ts`，覆盖北京时间月初边界，避免 UTC/服务器时区导致 1 日重置偏移。

## 验证

- `npx tsx tests/leaderboard-monthly-reset.test.ts`
- `cd server && npm run build`

## 后续提示

- 线上部署后需要同步后端构建产物并重启 Node 服务，月初清零会在首次访问排行榜/点赞/个人获赞汇总时触发。
- 该方案会删除上月及更早的排行榜点赞记录，符合“清零重新计数”的当前需求；如果未来要展示历史月榜，需要改成带月份字段的历史保留模型。

## 云端上传

- 2026-06-04 已按最小范围上传到 `47.122.112.242:/xiaoxiang-server`：
  - `server/dist/routes/leaderboard.js`
  - `server/dist/routes/leaderboard.js.map`
  - `server/dist/routes/leaderboard.d.ts`
  - `server/dist/routes/leaderboard.d.ts.map`
  - `server/src/routes/leaderboard.ts`
- 本次没有执行 `deploy-upload.ps1 -Target back`，避免上传整个后端、无关本地改动或覆盖线上 `.env`。
- FTP 拉回远端 `dist/routes/leaderboard.js` 已确认包含 `LEADERBOARD_TIME_ZONE`、`getLeaderboardMonthStart`、`deleteMany` 和本月 `createdAt` 过滤。
- 线上 `/api/health` 返回 `build: cpamc-only-20260520`、`pid: 852`。FTP 只上传文件，不会重启 Node；后端运行时仍需在宝塔/服务器终端重启 `C:\wwwroot\xiaoxiang-server` Node 项目后生效。
