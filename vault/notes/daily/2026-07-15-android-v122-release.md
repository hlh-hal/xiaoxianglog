# 2026-07-15 Android v1.0.22 发布

- 已发布小象日志 Android `1.0.22 / versionCode 24`，主下载地址仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告覆盖：小象回声实时流式呈现与后台结果恢复、七页动态月度回声及手势翻页、导出图片有序列表编号修复；同时说明月报旧任务重试卡住和结构化输出截断的修复。
- 已通过：`npm run lint`、`npm run test:monthly-echo`、`npm run test:daily-echo-background`、`npx tsx src/utils/exportImage.test.ts`、前后端构建、Android 同步和 release 构建。
- 正式 APK 已完成 v2/v3 签名校验，证书 MD5 为备案值；线上 APK 的包名、版本和 SHA256 与本地签名包一致，线上 `app-update.json` 已为 `1.0.22 / 24`。
- 云端前端、月度回声资源和本次后端运行模块已上传。随后在服务器完成 `npx prisma generate`、`npm run db:push` 和 Node 重启；线上健康检查已变为 `daily-echo-background-20260711`，月度回声与每日回声接口均从旧版 404 变为 401，确认新路由已加载。
- 本次未同步 GitHub Pages 或 GitHub Release；自有服务器是唯一主发布源。
