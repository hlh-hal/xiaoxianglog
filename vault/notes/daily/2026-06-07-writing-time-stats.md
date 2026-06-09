# 2026-06-07 写作用时统计修复

## 来源

用户反馈小象回声完成卡显示“用了 4 分钟”，但从编辑记录看本轮从 2026-06-06 21:56 左右开始，到 22:08 左右结束，实际应接近 12 分钟。

## 结论

问题出在完成卡复用 `getActiveWritingMinutes()` 的活跃输入统计口径。原逻辑会把两次输入之间超过 30 秒的停顿截断，因此中间思考/停顿时间被压掉，12 分钟编辑跨度可能只显示 4 分钟左右。

## 改动

- `src/utils/dailyEchoCompletionStats.ts`：`WritingActivityState` 新增 `sessionStartedAt` / `sessionEndedAt`，完成卡分钟数按“本轮第一次输入到保存/暂停”的自然跨度与活跃输入分钟取较大值。
- `src/pages/Editor.tsx`：手动保存前先保存一份写作计时快照，完成卡使用保存前的快照，避免 `persistCurrentEntry()` 保存成功后重置 `writingActivityRef` 导致统计读到被重建后的状态。
- `tests/daily-echo-completion-stats.test.ts`：新增 12 分钟跨度但活跃输入仅 60 秒的回归用例，确认完成卡显示 12 分钟。

## 验证

- `npm run test:daily-echo-completion`
- `npm run lint`

## 后续提示

当前持久化字段 `activeWritingSeconds` 仍保留原来的活跃输入累计口径，避免同步字段突然膨胀；本次只修正完成卡“用了 N 分钟”的用户可见反馈口径。

## 云端部署

- 2026-06-07 已执行 `npm run build`，生成前端入口 `assets/index-CR-0G7wS.js` 和样式 `assets/index-CnskmKfg.css`。
- 已执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`，19/19 个前端文件上传 OK。
- 线上验证：`http://47.122.112.242/` 已引用 `assets/index-CR-0G7wS.js` 和 `assets/index-CnskmKfg.css`；两个静态资源经 `curl -k -I -L` 验证返回 200；`/api/health` 返回 `build: cpamc-only-20260520`、`pid: 2984`。
- 本次只上传前端 `dist/`，没有上传后端、没有重启 Node。
