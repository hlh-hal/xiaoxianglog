# 决策记录

## 2026-07-11

- 每日回声采用“服务端持久任务保证不中断，SSE 只负责等待体验”的结构；客户端连接不拥有任务生命周期，断开、刷新或切路由都不得发送取消。
- 同一用户同一日记只允许一个 queued/running 任务，同一用户只运行一个 AI 任务；客户端按钮防抖只改善体验，最终一致性由数据库唯一 `activeKey/runKey` 和租约锁保证。
- 日记内容版本以规范化 `diaryDate + plainText` 的 `sourceHash` 为唯一依据；`updatedAt` 会被本地保存和云同步改写，只能用于诊断，不能决定后台结果能否落地。
- 服务端不直接写 `DiaryEntry.dailyEcho`。成功结果由客户端确认 source hash 后写入 local-first 日记；成功状态和 `daily_echo_ready` 站内通知必须在同一事务中提交。
- 每日回声完成提醒本期只使用站内通知与 App 活跃/恢复时的现有本地通知通道；不接 EMAS/FCM/厂商通道，不承诺 App 被强杀后的即时系统通知。
- 生产环境 Daily Echo 后台开关默认关闭；数据库变更为 additive，回滚先关闭开关和回退前端，不删除 `daily_echo_jobs` 表。

## 2026-07-10

- 写作时间的长期云端契约继续使用单调递增的 `DiaryEntry.activeWritingSeconds`；当前不保存或同步完整片段历史，避免引入数据库迁移和跨设备片段合并复杂度。
- 自动保存不是写作片段边界，只能读取当前计时投影。片段只在完成、主动退出、页面隐藏、原生 App 进入后台、系统中断或连续空闲 180 秒时关闭；重复生命周期事件必须幂等。
- 页面进入和程序化内容加载不开始计时；用户发起的正文变化、图片增删、光标移动和文字选择才属于写作活动。编辑器内部 blur 不得视为离开页面。
- 异常恢复采用版本化 localStorage 检查点：片段开始立即写、前台每 15 秒刷新，启动恢复时不外推最后观察时间之后的时长。恢复写入 IndexedDB 后再走现有同步，旧客户端和服务端继续依赖较大值防回退。
- 修改编辑器保存/生命周期链路时，必须同时运行 `npm run test:writing-time`、`npm run test:editor-exit-save` 和 `npm run verify:daily-echo-writing-time`，其中浏览器验证必须真实跨过 1.5 秒自动保存窗口。


## 2026-06-30

- MVP 架构采用“兼容门面的模块化单体”：保留 `diaryService` 公共 API，内部通过领域模型、Repository、同步 DTO 和提交后协调器形成边界，不引入微服务、全局状态库或 DI 框架。
- 日记保存的不可破坏顺序是：先提交 IndexedDB 与历史，再执行 Vault/云同步等可选副作用。同一篇日记的副作用必须串行，Vault 只允许合并路径元数据，任何副作用失败都不得回滚或覆盖较新的日记内容。
- 服务端日记 CRUD 与批量同步必须共用 diary codec；月度回声通过可等待的 projector 接收日记变更，投影失败只记录报告，不得让日记写入失败，也不得留下请求结束后的悬空 Promise。
- 日记云同步字段采用显式 allowlist；`blocks`、`prompts`、`backgroundId`、Vault 路径、InsightDraft/EchoHotMemory 等本地数据默认不得隐式进入云端。新增字段必须补前后端契约测试。

## 2026-06-07

- `DiaryEntry.diaryDate` 的长期契约是无时区的日记归属日 `YYYY-MM-DD`，不是创建时间戳。新建、导入、本地日志同步、前端同步 payload 和服务端写入都必须保存日期字符串；展示、排序、统计不能直接 `new Date('YYYY-MM-DD')`，应走 `src/utils/diaryDate.ts`。实际创建/修改时间继续使用 `createdAt` / `updatedAt`。

## 2026-05-31

- PWA 编辑器数据安全规则：只要新日志已有有效文字或图片，就必须先作为正式 active 日记持续保存到 IndexedDB；`visibilitychange`、`pagehide`、`freeze`、组件卸载这类不能弹确认框的生命周期事件必须强制 flush 正式日记，而不是只写编辑记录。
- 新日志编辑会预分配稳定 `entryId` 和 `diaryDate`，避免 autosave 与 pagehide 并发时重复创建日志。`saveOnExit=false` 只影响用户主动点返回时的放弃确认，不允许阻止 PWA 生命周期安全落盘。
- 后续改编辑器保存链路时必须重跑 `npm run test:editor-exit-save`，它是 PWA 退出即保存的回归底线。

## 2026-05-24

- 建立 `vault/` 作为本项目共享工作记忆。
- 新增 `AGENTS.md` 作为 Codex 入口，最初用于补充既有 `AGENT.md`。
- 知识库默认放在仓库内，后续可迁移到 Obsidian、Git、Dropbox、Google Drive 等同步目录；迁移后只需要更新 `AGENTS.md` 中的路径说明。
- 合并旧版 `AGENT.md` 到新版 `AGENTS.md`，后续只维护 `AGENTS.md` 这一个 Agent 工作入口。
- 发现后续工作只更新了 `WORKLOG.md`，没有写入 `vault/`。修复决策：`vault/` 是跨会话交接源，`WORKLOG.md` 只作为旧日志和索引；实质工作结束前必须按 `vault/agent/memory-workflow.md` 检查是否写入。

## 2026-05-26

- Android/iOS 移动网页/PWA 不再承诺直接写入用户选择的本地文件夹；这类环境统一走“下载本地日志包”能力。桌面 Web 支持 `showDirectoryPicker()` 时继续真实文件夹同步，Android 原生 App 继续走 `LocalVaultPlugin`。
