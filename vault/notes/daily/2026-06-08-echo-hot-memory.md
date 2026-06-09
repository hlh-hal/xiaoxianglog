# 2026-06-08 小象回声双层记忆热层

## 本次变更

- 按“渐进叠加”方案落地小象回声双层结构 v1：新增本机 `EchoHotMemory` 近期记忆热层，保留现有 `InsightDraft` 作为长期洞察/冷层 v1。
- `diaryService.ts` 将 IndexedDB `ethos-diary-db` 升到 v6，新增 `echoHotMemories` 和 `echoMemorySnapshots` store；热层 key 按 `daily-echo:${userId || 'anonymous'}` 隔离。
- `aiService.ts` 新增热层单操作更新链路：AI 只输出 `add | replace | remove | reinforce | update_seed`，前端本地校验并原子应用，避免全量覆盖。
- 回声生成 prompt 改为只注入热层近期记忆；`InsightDraft` 冷层不再直接注入回声，只作为热层更新时的长期模式索引/蒸馏参考。
- `Editor.tsx` 保持保存体验稳定：先生成并保存小象回声，12 秒后后台先更新 `InsightDraft` 长期洞察，再更新热层；后台失败只写诊断/console，不弹 toast、不影响回声。
- 设置入口和独立页改为“小象回声记忆”：用户可编辑近期热层 JSON，长期洞察只读展示。

## 验证

- `npm run test:echo-hot-memory`
- `npm run test:daily-echo-quality`
- `npm run test:insight-draft`
- `npm run test:sync-push`
- `npm run test:daily-echo-completion`
- `npm run lint`
- `npm run build` 通过，仅保留既有 `diaryService.ts` dynamic import 和 chunk size 警告。
- 本地 Vite + Chrome 移动视口打开 `/settings/insight-draft` 验收通过，截图：`artifacts/echo-memory-settings-mobile-2026-06-08.png`。

## 后续注意

- v1 不做完整 `ColdProfile`，不新增关系图谱/沉默信号；先观察热层质量、冷层写入稳定性和 AI 请求稳定性。
- 热层和快照仍是本机数据，不进 Prisma、不进 `/sync/push`、不进导出包或聊天历史。
- 后续如果要上线，需注意 IndexedDB v6 升级与 PWA 缓存版本一起验证。

## 长期洞察写入稳定性修复

- 2026-06-08：真机手动生成时长期洞察仍可能停在空 JSON，根因是后端默认每用户只允许 1 个并发 AI 请求，前端同时更新近期热层和长期冷层时其中一路会收到 `AI 正在忙，请稍后再试`。
- 修复策略：设置页“立即生成/修复记忆”和编辑器保存后的后台任务都改为 `ensureInsightDraftUpdated()` 先执行，成功或失败后再执行 `ensureEchoHotMemoryUpdated()`；近期记忆不能抢长期洞察的 AI 并发槽。
- `ensureInsightDraftUpdated()` 的 AI 请求增加一次短延迟重试，专门覆盖 `AI 正在忙`、`请求太频繁`、rate limit/too many requests 这类偶发限流。
- 设置页成功 toast 以长期洞察成功为准；长期洞察失败只刷新写入诊断和 console，不额外弹失败 toast。
- 新增 `tests/insight-draft-write-flow.test.ts`，用 monkey patch 验证有效 AI JSON 会调用 `saveInsightDraft()`、首次无草稿有历史日记时会“初稿 + 当前日记增量”两次写入、第一次 AI 忙时会重试并最终写入成功。
- 架构原则更新：热层负责即时召回和回声注入；冷层负责长期模式索引，不直接注入回声；冷层到热层是蒸馏，热层到冷层的沉淀留给后续阶段。
- 新构建标识：`insight-draft-write-flow-20260608-1`；PWA 缓存版本：`xiaoxiang-pwa-v14`。
- 本次稳定写入修复已重新构建并上传云端，只发布前端 `dist`，无后端/Prisma 变更，无需重启后端。

## 云端上传

- 2026-06-08：已将双层记忆前端改动上传云端，只发布前端 `dist`，无后端/Prisma 变更，无需重启后端。
- 发布前更新构建标识为 `echo-hot-memory-20260608-1`，PWA 缓存版本为 `xiaoxiang-pwa-v13`。
- 线上入口 `https://www.xiaoxianglog.cn/` 已引用 `assets/index-DGEcMgLq.js`；`https://www.xiaoxianglog.cn/sw.js` 已返回 `xiaoxiang-pwa-v13`；线上 JS 可检出 `echo-hot-memory-20260608-1`、`小象回声记忆` 和 `echoHotMemories`。
- 2026-06-08：长期洞察稳定写入修复已上传云端，线上入口已引用 `assets/index-a-ZKsiKA.js`；`https://www.xiaoxianglog.cn/sw.js` 已返回 `xiaoxiang-pwa-v14`；线上 JS 可检出 `insight-draft-write-flow-20260608-1`、`长期洞察索引`、`请求太频繁`、`Daily echo memory background update failed` 和 `小象回声记忆`。
