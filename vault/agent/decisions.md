# 决策记录

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
