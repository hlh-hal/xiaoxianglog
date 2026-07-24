# 2026-07-21 每日回声验收

- 需求实现：每日回声服务端最多执行 12 次尝试（4 次首轮 + 2 轮自动补救）；质量检查未通过的正文不写入 `previewContent`，仅成功结果写入 `previewContent/finalContent`。
- 前端只在服务端验收成功并完成 local-first 持久化后播放最终稿；使用 35ms/次、每次 2 个 Unicode 字符的回放，失败态不显示“换一句”。
- 小米 provider 实测通过：`AI_MODEL=xiaomi-mimo`，目标模型为 `mimo-v2.5`；短探针因 token 不足返回 `finishReason=length`，按每日回声 1100 token 预算测试可正常流式返回。
- Android `emulator-5554` 实测：真实账号登录、本地日记保存、后台任务第 1–9 次 `previewLength=0`，第 10 次成功；provider 为 `xiaomi-mimo`，成功后 `previewContent` 与 `finalContent` 长度均为 430 且一致。
- 退出并重新进入 `/editor?id=...&echoJob=...` 后最终回声可恢复；展开卡片只看到最终合格稿，保留“换一句/继续聊聊/保存图片”，没有失败提示。
- 截图：`tmp/daily-echo-android-validation/10-waiting.png`、`12-waiting-real.png`、`15-reentered3.png`、`16-expanded.png`、`17-production-launch2.png`。
- 验证命令：`npm test`、`npm run lint`、`npm run build`、`server npm run build`、`npm run android:sync`、`android/gradlew.bat :app:assembleDebug` 均通过。
- 清理：已删除本次本地临时 Daily Echo job、通知、临时测试账号和模拟器 IndexedDB 测试日记；已重新执行生产 `android:sync`，不再保留 `10.0.2.2:3000` 预览配置。
- 安全提醒：本次诊断过程中本地环境文件中的 API 密钥曾被工具检索输出，需轮换相关 Xiaomi/CPAMC 密钥，且不要把密钥写入日志或交接文档。
