# 2026-06-07 diaryDate 时区偏移修复

## 背景

用户反馈：开启“中午 12 点之前自动转为前一天日记”后，6 月 4 日晚上接近 12 点写的日志显示到 6 月 3 日；6 月 6 日 00:57 写的 6 月 5 日日记显示到 6 月 4 日。

## 结论

`diaryDate` 应当是无时区的日记归属日 `YYYY-MM-DD`，不是实际创建时间戳。旧逻辑在编辑器新建时保存 `toISOString()`，同步服务端再用 UTC 日期截断，前端列表又用 `new Date('YYYY-MM-DD')` 展示，导致日期被时区二次偏移。

## 本次修复

- 新增 `src/utils/diaryDate.ts`，统一提供 `toDiaryDateKey`、`getDiaryDateKey`、`parseDiaryDateKey`、`compareDiaryDateDesc`、`createAdjustedDiaryDateKey`。
- 编辑器新建日记在中午前自动归前一天时，最终保存 `YYYY-MM-DD`，不再保存 ISO 时间戳。
- 前端列表、首页日历跳转、搜索、图库、回收站、个人页、排行榜、那年今日、AI 上下文、导入导出、本地日志同步等读写点统一使用 diary date 工具。
- 前端同步 payload 推送前会把 `diaryDate` 归一成 `YYYY-MM-DD`。
- 服务端 `/sync/push` 和 `/diary/entries` 的日期归一不再使用 `toISOString().slice(0, 10)`。

## 验证

- `npm run test:diary-date`
- `npm run test:daily-echo-completion`
- `npm run lint`
- `npm run build`
- `cd server && npm run build`

## 后续注意

本次不批量迁移历史错位数据，只防止新数据继续错。线上已有错位日志如果需要纠正，应单独做带人工确认或结合 `createdAt` / 正文日期的修复脚本。
