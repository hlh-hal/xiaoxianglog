# 小象回声记忆架构与数据模型视角报告

## 明确结论

下一版“小象回声”不应该把记忆做成一个更长的总结，也不应该把 `InsightDraft` 直接塞进 prompt。它应该采用四层结构：证据账本、长期洞察、近期热记忆、单次提示词包。

第一层是本机证据账本，只记录“这条记忆为什么存在”：`diaryId`、日期、锚点摘要、摘录哈希、信号类型和写入来源。第二层是 `InsightDraft v2`，负责长期模式、价值观、关系模式、写作偏好和自我叙事的结构化索引。第三层是 `EchoHotMemory`，只保存最近能让回声更连续、更懂人的少量记忆卡。第四层是每次生成前临时组装的 `PromptMemoryPack`，它决定今天到底拿哪几条记忆给模型看。

核心原则是：长期层用于理解，热层用于说话，证据层用于纠错，prompt 包用于当下选择。小象回声要像“记得你最近在意什么”，而不是像“掌握了你的档案”。

## 当前冷层与热层的优点和缺陷

当前 `InsightDraft` 的优点是边界很干净：只在 IndexedDB，不进后端同步、不进导出、不进聊天历史，符合私密日记的底色。它的字段覆盖了身份、自我感受、价值观、生活阶段、情绪模式、应对方式和近期变化，方向是对的。用最多 24 篇历史日记生成初稿，再用当前日记增量更新，也避免了每次全量重算。

缺陷在于它更像“一篇内部分析报告”，不是可治理的数据模型。字段大多是整段文本，没有逐条 claim，没有证据链，没有状态，没有衰减，也没有“这条洞察被哪篇日记推翻”的机制。`identity`、`selfPerception` 这类字段尤其危险，模型一旦过度概括，就可能把用户一时的情绪写成长期人格。冷层不直接注入回声是正确的，但如果它不能转化为可选择、可验证、可撤销的记忆卡，它对“懂我”的贡献会停留在后台。

当前 `EchoHotMemory` 的优点是足够克制：10 条上限、150 字单条、2200 字注入上下文，且 AI 只能输出 `add | replace | remove | reinforce | update_seed`，前端原子应用，避免模型一把覆盖全部记忆。这是很好的安全阀。用户可以编辑近期热层 JSON，也让系统不是黑箱。

缺陷是热层每条 entry 只有 `content` 和少量来源字段，缺少类型、敏感度、证据置信度、过期时间、最近是否注入、是否被用户纠正、是否适合被说出口。`reinforceCount` 也可能把错误记忆越强化越牢。当前 key 为 `daily-echo:${userId || 'anonymous'}`，适合 MVP，但还不足以区分“最近困扰”“长期偏好”“关系线索”“不该主动提起的敏感记忆”。

## 建议的数据模型

下一版可以把热层 entry 升级为 `MemoryAtom`：

```ts
type MemoryAtom = {
  id: string
  type: 'value' | 'theme' | 'relationship' | 'struggle' | 'growth' | 'preference' | 'boundary' | 'event'
  content: string
  scope: 'hot' | 'stable' | 'episodic'
  visibility: 'injectable' | 'internal_only' | 'never_echo'
  sensitivity: 'low' | 'medium' | 'high'
  evidenceIds: string[]
  sourceDiaryIds: string[]
  confidence: number
  importance: number
  recencyScore: number
  reinforceCount: number
  lastReinforcedAt?: string
  lastUsedInPromptAt?: string
  status: 'active' | 'dormant' | 'archived' | 'retracted'
  expiresAt?: string
  supersedes?: string
  supersededBy?: string
}
```

另加 `MemoryMutationLog`：`id`、`operation`、`targetId`、`before`、`after`、`reason`、`diaryId`、`createdAt`、`actor`。这不是为了复杂，而是为了回滚和自查。用户觉得“不对，这不是我”时，系统必须能撤回某条记忆，而不是只能清空全部。

## 新增、强化、衰减、归档、回滚、证据链

新增记忆必须来自证据，不来自模型的文学想象。单篇日记可以新增 `event`、`struggle`、`growth` 这类短期记忆；`value`、`identity`、`relationship` 等稳定记忆至少需要多次证据，或者先以低置信度进入冷层观察。新增时要写入证据链和默认过期策略。

强化不是“模型又提到了它”就加分，而是今天的日记自然延续了同一主题、关系或情绪应对方式。强化应同时更新 `confidence`、`importance`、`lastReinforcedAt`，但也要记录具体证据。对高敏感记忆，强化只能提高内部理解权重，不自动提高 prompt 注入优先级。

衰减要分两种：事实置信度衰减和注入优先级衰减。一条长期价值观可能仍然可信，但半年不相关，就不该频繁出现在回声里。热层记忆可以 7 到 30 天过期，未强化进入 `dormant`；被新日记明显反驳则进入 `retracted` 或被新记忆 `supersede`。

归档不是删除。归档表示“暂时不用于生成，但保留历史判断”。永久删除日记时，应删除或失效对应 evidence；如果某条记忆没有足够证据支撑，自动降置信度或撤回。回滚依赖 `MemoryMutationLog`，至少支持撤销最近一次批量更新、恢复某条被 replace/remove 的记忆。

证据链要轻量，不要把大量日记原文复制进记忆库。建议保存短锚点、哈希和来源 ID。设置页可以显示“来自哪几天的日记”，但默认不暴露内部推理。这样既能纠错，又不把隐私扩大一份。

## `InsightDraft` 是否继续存在

`InsightDraft` 应该继续存在，但职责要降格：它不是用户画像真相，也不是小象回声的话术库，而是“长期模式地图”。它负责把多篇日记聚类成候选模式，帮助热层判断哪些记忆值得新增、强化、合并、降级；也负责发现矛盾，比如用户过去常说自己想安静，最近却持续写到想重新连接他人。

`InsightDraft v2` 不应再只有大段字段，而应拆成 claim 列表：每条 claim 有类型、内容、证据、置信度、最近更新时间、反证、是否可注入。最终回声 prompt 最多使用它给出的一个“选择提示”，例如“今天可能与长期的边界感主题相关”，而不是把整份洞察草稿交给模型。

## 提示词注入的数据选择算法

每次生成回声前，先从热层 active 记忆、冷层高相关 claim、当前日记细节锚点中生成候选。排序分数建议为：

`score = 今日相关性 * 0.45 + 近期性 * 0.2 + 置信度 * 0.15 + 重要性 * 0.15 - 敏感惩罚 - 重复惩罚`

今日相关性优先看主题、人物、情绪、地点、目标、困扰是否重合。近期性只影响热层，不让旧事反复冒头。重复惩罚用于避免连续几天都把同一条记忆说出来。敏感惩罚用于创伤、健康、家庭冲突、亲密关系、自我评价等内容：除非今天日记明确触发，否则不进 prompt。

进入 prompt 的应是少量、可自然连接的记忆：最多 3 条热记忆、1 条长期模式提示、1 个 seed。不要注入完整 `InsightDraft` JSON，不要注入证据 ID、置信度、操作历史、已归档或被撤回的记忆，不要注入用户手动标记为 `never_echo` 的内容。提示词里也要继续约束模型：只能在自然相关时轻轻连起过去，不要解释记忆来源，不要把内部判断说成诊断。

## 具体落地动作

1. 增加 `MemoryAtom`、`MemoryEvidence`、`MemoryMutationLog` 三个 IndexedDB store，并写一个从现有 `echoHotMemories.entries` 迁移到 `MemoryAtom` 的兼容层。

2. 把热层更新 AI 输出从纯 `add/replace/remove/reinforce` 升级为 typed patch：要求给出 `type`、`visibility`、`sensitivity`、`confidenceDelta`、`expiresInDays`、`evidenceDiaryIds` 和 `reason`，前端继续校验后原子应用。

3. 实现 `buildPromptMemoryPack(currentDiary, memoryStore)`：统一做候选召回、过滤、打分、去重和长度预算，禁止页面或生成函数直接拼接全部记忆。

4. 设置页把“编辑 JSON”升级为“近期记忆管理”：可查看、改写、归档、标记不再提起、撤销最近更新。JSON 可保留为高级入口，但不应是主要交互。

## 风险与反例

最大风险是“懂我”滑向“定义我”。日记里很多话是当晚的情绪，不是长期人格。系统越会总结，越容易把脆弱时刻固化成标签。

第二个风险是记忆越多，回声越不自然。小象回声不是心理咨询报告，也不是人生 CRM。真正有效的记忆注入经常只有一句：“你最近一直在练习把话说清楚。”多一条都可能打扰。

第三个风险是证据链本身扩大隐私面。证据要足够支持回滚，但不能变成另一份日记副本。特别是 PWA、本地缓存和真机调试场景，要避免把敏感内容写入 console、诊断日志或可同步区域。

反例也要保留：如果用户写小说、梦境、吐槽、反讽，系统不应把它们当事实；如果用户今天否定过去的自己，系统要允许变化，而不是用旧记忆把他拉回旧版本；如果记忆无法自然帮今天这篇日记变得更被理解，它就不该进 prompt。

## 最刺耳的一句话

如果一条记忆不能说明它从哪里来、为什么现在该出现、什么时候该闭嘴，它就不配替小象回声开口。
