# 洞察草稿系统设计：10倍用户理解深度

> **作者视角：Dan Sullivan（Strategic Coach 创始人）**
> **核心框架：10x 增长思维——不是做10件小事，而是找到那个能产生10倍杠杆的支点**

---

## 一、先问正确的问题：10倍的"什么"？

大多数团队会问："怎么让回声更准？"这是线性思维。

10x 问题是：**什么能让用户觉得这个系统比任何人都懂我？**

答案不是更好的模型，不是更长的 prompt，而是**持续记忆**。

一个人观察你365天和一个陌生人第一次见你——即使陌生人更聪明，365天的观察者也会给出更深刻的洞察。洞察草稿系统的核心杠杆就是：**把"每次重新认识"变成"持续加深理解"**。

这不是优化，这是范式转换。从"无状态 AI"到"有状态的陪伴者"。

---

## 二、数据结构设计：少即是多

### 设计原则：每个字段都必须服务于"帮用户看见自己"

我见过太多系统把草稿设计成心理测评量表——50个字段，最后没人维护，数据腐烂，变成负债。

**洞察草稿只有4个核心维度，但每个都是"活"的：**

```typescript
interface InsightDraft {
  // 身份标识
  userId: string;
  version: number;           // 递增版本号，用于增量同步
  updatedAt: string;         // ISO 时间戳

  // === 四个核心维度 ===

  // 1. 用户的情感基线（最重要的维度）
  emotionalBaseline: {
    recentMood: string;      // 最近7天的情绪基调，如"忙碌中带着焦虑，但周末有小确幸"
    moodTrend: 'rising' | 'stable' | 'declining' | 'volatile';  // 情绪趋势
    dominantEmotions: string[];  // 3个最常出现的情绪标签
  };

  // 2. 用户的生活叙事线
  lifeNarrative: {
    currentThemes: string[];     // 当前阶段的2-3个主题，如"工作转型期""亲密关系探索"
    recentFocus: string;         // 最近一周的注意力焦点，一句话
    recurringConcerns: string[]; // 反复出现的牵挂，最多3个
  };

  // 3. 用户的成长轨迹
  growthPattern: {
    recentInsights: string[];   // 最近3次写日记时闪现的领悟
    copingStyle: string;        // 面对困难时的典型方式，如"倾向于先消化再倾诉"
    smallWins: string[];        // 最近的小成就，用于回声时肯定
  };

  // 4. 关系与连接
  relationalContext: {
    keyPeople: string[];        // 日记中出现最多的人，用代号，如"妈妈""同事小王"
    socialEnergy: string;       // 社交状态描述，如"最近需要独处充电"
  };
}
```

**为什么是4个维度而不是2个或10个？**

- 2个维度（情绪+主题）：太薄，回声还是泛泛而谈
- 10个维度：维护成本指数级上升，数据稀释，AI更新时容易顾此失彼
- **4个维度：刚好覆盖"感受→处境→成长→关系"的完整人格切面**

每个维度的字段都控制在1-3个，确保 AI 更新时聚焦，不发散。

**总数据量控制**：整个草稿约 500-800 字，相当于一篇中等日记的长度。这确保了：
- 增量更新的 AI 调用 token 成本可控
- 注入 prompt 时不会挤占回声生成的空间
- 人眼可读，未来做"系统对我的理解"页面时不需要二次加工

---

## 三、增量更新 Prompt 设计：让 AI 成为"记忆编辑"

### 核心理念：不是重新分析，而是"编辑已有的理解"

这是整个系统最精妙的地方。大多数团队会写一个 prompt 说"根据新日记更新草稿"，但这其实是让 AI 每次都做"重新理解+合并"，容易丢信息。

**正确的做法是：把 AI 的角色定义为"记忆编辑"，而不是"心理分析师"。**

### 增量更新 System Prompt（约 350 字）

```
你是一个温柔的记忆编辑，负责维护一个关于用户的持续洞察草稿。

你的工作方式：
1. 仔细阅读现有的洞察草稿——这是你对用户已有的理解
2. 阅读用户今天写的日记
3. 决定哪些理解需要更新，哪些保持不变
4. 输出更新后的完整草稿

更新原则：
- 只有当新日记提供了新的信息或改变了你的理解时，才更新对应部分
- 如果新日记印证了已有理解，保持原样，不要为了"更新"而改写措辞
- 情绪趋势(emotionalBaseline.moodTrend)基于最近7天的整体判断，不是单篇日记
- currentThemes 最多3个，如果出现新主题，替换最旧的
- recentInsights 只保留最近3次的，用新的替换最旧的
- smallWins 只保留最近3个
- keyPeople 只保留出现频率最高的5个
- 所有描述用中文，简洁自然，像在笔记本上写的备忘，不像在写报告
- 永远不要诊断或贴标签（如"你有焦虑症"），只描述观察到的模式
- 保持温柔的基调，记录的是"看见"，不是"判断"
```

### 增量更新 User Prompt（约 200 字）

```
当前洞察草稿（版本 {version}）：
{currentDraftJSON}

今天用户写的日记：
标题：{diaryTitle}
日期：{diaryDate}
心情标签：{mood}
内容：
{diaryContent}

请输出更新后的完整洞察草稿JSON。如果没有需要更新的部分，原样返回。
```

### 为什么用 JSON 输出？

- 可以直接 `JSON.parse()`，不需要正则提取
- 结构化数据便于前端展示（未来做"系统对我的理解"页面）
- 减少 AI 输出的不确定性

### 关键技巧：保留 vs 更新的判断

prompt 中反复强调"如果不是新信息，保持原样"。这是对抗 AI 倾向的关键——AI 天生喜欢"优化措辞"，每次都会改写成更好听的版本，但这样会丢失原始的精确性。

**一个好的洞察草稿应该是"有点粗糙但精确"的，而不是"漂亮但失真"的。**

---

## 四、回声生成时的注入策略：Context Window 的艺术

### 问题：怎么把草稿塞进回声的 prompt？

当前回声的 system prompt 约 350 字，user prompt 约 200 字。MiMo 的 context window 假设 8K tokens，还有充裕空间。

**方案：将草稿作为 system prompt 的扩展段落注入。**

### 注入方式（新增约 200 字）

在现有 system prompt 末尾追加：

```
---
关于这位用户，你已经了解的背景（来自之前的日记观察）：
{insightDraft摘要}

请注意：
- 这些信息是为了让你的回应更有温度，不是用来"展示你知道多少"
- 不要逐条引用这些洞察，而是自然地融入回应
- 如果今天的日记和已有理解有冲突（比如平时内向但今天说"我主动发言了"），捕捉这个变化，温暖地指出
- 重点回应今天的内容，背景信息只是辅助
```

### 为什么不直接注入完整 JSON？

因为 AI 会把 JSON 当成"要分析的数据"，而不是"关于这个人的背景知识"。**转成自然语言摘要后，AI 的回应会更像朋友间的自然对话。**

所以增量更新 prompt 输出 JSON（给程序用），注入时转成自然语言（给 AI 用）。这个转换很简单，就是一个模板：

```typescript
function draftToNaturalLanguage(draft: InsightDraft): string {
  const parts = [];
  if (draft.emotionalBaseline.recentMood) {
    parts.push(`最近的情绪状态：${draft.emotionalBaseline.recentMood}`);
  }
  if (draft.lifeNarrative.currentThemes.length > 0) {
    parts.push(`当前生活主题：${draft.lifeNarrative.currentThemes.join('、')}`);
  }
  if (draft.growthPattern.copingStyle) {
    parts.push(`面对困难的方式：${draft.growthPattern.copingStyle}`);
  }
  if (draft.growthPattern.smallWins.length > 0) {
    parts.push(`最近的小成就：${draft.growthPattern.smallWins.join('、')}`);
  }
  if (draft.relationalContext.keyPeople.length > 0) {
    parts.push(`生活中重要的人：${draft.relationalContext.keyPeople.join('、')}`);
  }
  return parts.join('\n');
}
```

---

## 五、存储策略：前端 IndexedDB，理由如下

| 维度 | 前端 IndexedDB | 后端 Prisma + SQLite |
|------|---------------|---------------------|
| **隐私** | ✅ 数据不离开用户设备 | ❌ 需要传输到服务器 |
| **延迟** | ✅ 本地读写，0ms | ⚠️ 需要网络请求 |
| **复杂度** | ⚠️ 需要处理同步 | ✅ 集中管理 |
| **多设备** | ❌ 无法跨设备同步 | ✅ 天然支持 |
| **成本** | ✅ 无服务器存储成本 | ⚠️ 需要存储空间 |

**我的判断：用前端 IndexedDB。**

理由：
1. **日记本身已经在 IndexedDB 了**，草稿和日记同生命周期，逻辑一致
2. **隐私是小象的核心价值**，"你的洞察永远在你的设备上"是很好的品牌叙事
3. **跨设备同步是未来的需求**，不是现在的需求。现在的用户画像：单设备写日记
4. **如果未来需要后端存储**，可以做"加密同步"——前端生成加密后的草稿同步到后端，解密只在前端

### 存储方案

```typescript
// 使用已有的 idb 库，在现有 database 中新增一个 store
// 在 openDB 的 upgrade 回调中：
if (!db.objectStoreNames.contains('insightDrafts')) {
  db.createObjectStore('insightDrafts', { keyPath: 'userId' });
}

// 读写操作
async function getInsightDraft(userId: string): Promise<InsightDraft | null> {
  const db = await openDB('xiang-diary', 2);
  return db.get('insightDrafts', userId) ?? null;
}

async function saveInsightDraft(draft: InsightDraft): Promise<void> {
  const db = await openDB('xiang-diary', 2);
  await db.put('insightDrafts', draft);
}
```

---

## 六、冷启动策略：前5篇日记的特殊处理

### 问题：新用户没有草稿，怎么办？

**错误做法**：前5篇不生成回声，等积累够了再开始。

**正确做法**：前5篇每篇都生成回声，但用不同的策略。

```typescript
async function generateEcho(diary: Diary) {
  const draft = await getInsightDraft(userId);

  if (!draft) {
    // 冷启动阶段：直接生成回声，不注入草稿
    // 同时，在回声生成后，用这篇日记生成初始草稿
    const echo = await generateEchoWithoutDraft(diary);
    const initialDraft = await generateInitialDraft(diary);
    await saveInsightDraft(initialDraft);
    return echo;
  }

  // 正常阶段：增量更新草稿 + 带草稿生成回声
  const updatedDraft = await updateDraft(draft, diary);
  await saveInsightDraft(updatedDraft);
  const echo = await generateEchoWithDraft(diary, updatedDraft);
  return echo;
}
```

**冷启动 prompt（初始草稿生成，约 200 字）：**

```
你是一个温柔的观察者。这是用户写的第一篇日记（或前几篇之一）。
请根据这篇日记，生成一份初始洞察草稿。

注意：
- 这只是第一印象，所有判断都要加"初步"前缀
- 不确定的字段留空字符串或空数组
- 宁可少写也不要过度推测
- 用户的全貌需要多次日记才能看清，现在只是拼图的第一块

用户日记：
标题：{diaryTitle}
日期：{diaryDate}
心情：{mood}
内容：{diaryContent}

请输出洞察草稿JSON。
```

**关键点**：冷启动阶段的草稿要克制，不要因为一篇日记就下结论。prompt 中特别强调"初步"和"不确定就留空"。

---

## 七、成本控制：如何最小化额外 AI 调用

### 问题：每次生成回声需要两次 AI 调用（更新草稿 + 生成回声），成本翻倍

### 方案1：异步更新（推荐）

```
用户写日记 → 立即生成回声（不等草稿更新）→ 异步更新草稿
```

- 回声生成时使用**上一次**的草稿（可能是昨天的，完全够用）
- 草稿更新在后台进行，用户无感知
- 如果草稿更新失败，下次用的就是上次成功的版本，不影响用户体验

```typescript
// 主流程：先生成回声
const echo = await generateEchoWithDraft(diary, existingDraft);
res.json({ echo });

// 异步：更新草稿（不阻塞响应）
updateDraftAsync(existingDraft, diary).catch(err => {
  console.error('草稿更新失败，下次重试', err);
});
```

### 方案2：批量更新

如果用户一天写多篇日记，可以在当天最后一篇日记时才更新草稿，而不是每篇都更新。

### 方案3：缓存草稿更新

如果草稿是在3天内生成的，且用户这3天的日记情绪稳定，可以跳过草稿更新。

```typescript
function shouldUpdateDraft(draft: InsightDraft, diary: Diary): boolean {
  const daysSinceUpdate = daysBetween(draft.updatedAt, new Date());
  // 草稿超过3天必须更新
  if (daysSinceUpdate >= 3) return true;
  // 如果今天的心情和草稿中的基线差异大，需要更新
  if (isMoodShift(significant, draft, diary)) return true;
  // 否则跳过
  return false;
}
```

**推荐方案1 + 方案3 的组合**：异步更新 + 智能跳过。这样每天最多1次额外 AI 调用，大多数情况下0次。

---

## 八、10倍杠杆在哪里？

回到开头的问题：什么能产生10倍杠杆？

**不是草稿的数据结构，不是 prompt 的措辞，而是"时间"。**

一个用了6个月的洞察草稿，和一个用了6天的，差距不是10倍，是100倍。

第1周：草稿说"最近情绪波动，似乎在适应新环境"
第1个月：草稿说"每月中旬焦虑加重，可能和工作汇报周期有关"
第6个月：草稿说"每到季度末会自我怀疑，但每次都能扛过去，这次也不例外"

**最后这句话，才是洞察草稿系统存在的全部意义。**

它不是技术优化，是情感基础设施。用户在第180天收到的回声里，藏着前179天的每一次倾听。

---

## 九、实施优先级建议

| 阶段 | 做什么 | 产出 |
|------|--------|------|
| **Phase 1** | 数据结构 + IndexedDB 存储 + 冷启动 | 草稿开始积累 |
| **Phase 2** | 增量更新 prompt + 异步调用 | 草稿开始进化 |
| **Phase 3** | 回声注入 + 自然语言转换 | 回声开始有记忆 |
| **Phase 4** | 智能跳过 + 成本优化 | 系统开始高效 |
| **Phase 5**（未来） | "系统对我的理解" 用户页面 | 用户开始看见 |

Phase 1-3 是核心，一周内可以完成。Phase 4 是优化。Phase 5 是品牌故事。

---

## 最刺耳的一句话

> **你们的 AI 每天都在假装认识用户。它用漂亮的措辞掩盖了一个事实：它对这个写了365篇日记的人，和对一个刚注册的新用户，理解深度完全一样。每一句温暖的回应，都是一场精心编排的遗忘。你们优化的是话术，丢掉的是信任。一个没有记忆的陪伴者，不是陪伴者，是复读机。**
