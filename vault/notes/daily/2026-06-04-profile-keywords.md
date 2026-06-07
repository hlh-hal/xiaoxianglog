# 2026-06-04 Profile 高频关键词规则

## 来源

用户反馈“高频关键词”区域出现大量英文碎词，并确认新规则：

- 不使用手动标签。
- 只统计最近 90 天日记正文。
- 最多显示 14 个。
- 英文与中文同权，但英文大小写合并，并过滤低意义英文词。
- UI 不固定 3 行，高度随内容自然换行。

## 当前状态

- `src/utils/textUtils.ts` 重写了关键词提取相关词表和规则，修复原有关键词词表乱码问题。
- `src/pages/Profile.tsx` 使用 `extractRecentDiaryKeywords(entries, { days: 90, limit: 14 })` 生成关键词，不再混入 `entry.tags`。
- `tests/profile-keywords.test.ts` 覆盖中文排序、英文大小写合并、低意义词过滤、90 天范围、忽略手动标签和最多 14 个。
- 后续升级为“意义分”排序：跨多篇日记出现、最近出现、中文短语会加权；纯英文/技术词会降权；疑似账号、手机号等敏感格式单篇出现会隐藏，多篇重复才允许展示。
- 根据线上截图继续收敛：字母数字混合词（如 `p0`、`p1`、`10kg1`）过滤；`app`、`prompt`、`codex`、`hermes`、`taste`、`happy` 等低共鸣英文碎词过滤；有中文生活主题时英文最多只作为少量补充。Profile 展示上限调整为 12，并改为 4 列网格，避免 14 个词在 flex 居中布局下形成最后一行单词。
- 二次线上截图仍偏英文后确认：意义分主体已存在，但英文兜底仍允许 `AI sana offer not what loss` 这类词展示。已改为默认不展示纯英文兜底；英文只允许白名单技术词，且需要跨多篇或同篇高频，混合中文主题时最多补充 2 个。
- 再次线上截图为空状态后确认更关键根因：Profile 关键词只读取 `entry.content`，但当前日记可能主要写在 `entry.blocks[].content` 里；因此近 3 个月有多篇日记也可能提不出词。已把 `blocks` 的标题和正文纳入 `extractRecentDiaryKeywords` 来源，并补充 block-only 日记测试。

## 验证

- `npx tsx tests/profile-keywords.test.ts`
- `npm run lint`
- `npm run build`
- Puppeteer 以移动端宽度打开 `http://localhost:3000/profile`，确认“高频关键词”存在且无控制台错误。
- 2026-06-04 追加本地排查：用截图词样本 `AI sana codex hermes app happy prompt p0 10kg1 p1 p2 jd do taste` 验证过滤后只剩 `AI`、`sana`；混合中文生活主题后优先输出中文主题，再补少量英文。补跑 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`，并用 Puppeteer 访问本地 `http://localhost:3002/profile` 验证无控制台错误。
- 2026-06-04 追加线上修复部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件，新前端入口为 `/assets/index-8TNDAu1N.js`。线上验证 `https://www.xiaoxianglog.cn/` 引用新入口，`/api/health` 正常，Puppeteer 打开 `/profile` 无控制台错误。
- 2026-06-04 二次排查验证：用截图词样本 `AI sana offer not what loss` 跑本地输出，`extractRecentDiaryKeywords` 返回空；混合中文主题后优先输出中文生活主题，仅补充高频白名单英文。补跑 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`。
- 2026-06-04 二次线上部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件，新前端入口为 `/assets/index-CczTg5V0.js`。线上验证 `https://www.xiaoxianglog.cn/` 引用新入口，`/api/health` 正常，Puppeteer 打开 `/profile` 无控制台错误。
- 2026-06-04 blocks 修复验证：block-only 样本 `[{ title: 开心的事, content: 今天散步，和朋友聊天，项目也有进展 }]` 已能输出 `散步`、`朋友`、`项目` 等关键词。补跑 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`。
- 2026-06-04 blocks 修复线上部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件，新前端入口为 `/assets/index-25icsUNb.js`。线上验证 `https://www.xiaoxianglog.cn/` 引用新入口，`/api/health` 正常，Puppeteer 打开 `/profile` 无控制台错误。
- 线上部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件，新前端入口为 `/assets/index-Bc0e6dTH.js`。
- 线上验证：`https://www.xiaoxianglog.cn/` 引用 `/assets/index-Bc0e6dTH.js`；`https://www.xiaoxianglog.cn/api/health` 返回 `build: cpamc-only-20260520`；Puppeteer 打开 `https://www.xiaoxianglog.cn/profile`，确认“高频关键词”存在且无控制台错误。

## 下次接手提示

如果后续继续优化这块，优先补真实浏览器中的多关键词视觉截图验证；当前自动化覆盖的是规则和路由渲染，不包含注入 14 个关键词后的像素级布局断言。

## 2026-06-04 final empty-state fix

- 用户继续反馈线上“高频关键词”仍为空。继续排查后补了两条防线：`textUtils.ts` 对 `diaryDate` 做更宽容解析，支持 ISO、`yyyy-MM-dd`、`yyyy/MM/dd`、`yyyy年M月D日`、`M月D日`，并在解析失败时回退到 `createdAt/updatedAt`；同一天范围按当天 23:59:59 结束，避免当天稍晚时间被误判为未来。
- 同时修复 PWA 更新链路：`src/pwa.ts` 注册 Service Worker 时使用 `updateViaCache: 'none'` 并主动 `registration.update()`；新 Service Worker 接管时自动刷新一次页面。`src/utils/notify.ts` 的按需注册路径也同步使用 `updateViaCache: 'none'`。`public/sw.js` 缓存版本从 `xiaoxiang-pwa-v6` 升级到 `xiaoxiang-pwa-v7`。
- 验证新增覆盖：`tests/profile-keywords.test.ts` 增加本地中文日期格式、`createdAt` fallback、block-only 内容等用例。已通过 `npx tsx tests/profile-keywords.test.ts`、`npx tsx tests/daily-echo-quality.test.ts`、`npm run lint`、`npm run build`。
- 视觉验证：用 Puppeteer 在本地 preview 的移动端视口写入 30 条近 90 天 active 日记到 IndexedDB，确认 `/profile` 不再显示空状态，并包含 `散步`、`朋友`、`项目`、`学习` 等关键词。成功截图保存为 `D:\小象日志\profile-keywords-success.png`。
- 线上部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件。线上首页已引用 `/assets/index-gJCVzGar.js`，线上 `sw.js` 已返回 `const CACHE_VERSION = 'xiaoxiang-pwa-v7';`，`https://www.xiaoxianglog.cn/api/health` 返回 `build: cpamc-only-20260520`。

Final deploy correction: after restoring the daily-echo fallback call, reran `npm run lint` and `npm run build`, redeployed frontend again with `cmd /c deploy.bat front`. The final online entry is `/assets/index-DoYcuKvA.js`; `sw.js` remains `xiaoxiang-pwa-v7`; `/api/health` still returns `build: cpamc-only-20260520`.

## 2026-06-04 low-content keyword display fix

- 用户再次反馈多名用户“高频关键词”仍为空。本次将空状态条件进一步收窄：近 90 天 active 日记只要 `content` 或 `blocks[].title/content` 中能识别出 1 个有效中文关键词，就直接展示，不再因为覆盖篇数少、主意义分不足或数量少而显示“多写点日记”。
- `src/utils/textUtils.ts` 保留意义分主排序，同时新增宽松中文兜底：优先生活/情绪/关系/学习/项目类中文主题词，允许少量有意义单字如 `累`、`忙`、`困`、`烦`，但不启用英文兜底，避免 `AI/sana/offer/what/loss/ok/why` 这类碎片造成“偷看文本碎片”的观感。
- `src/pages/Profile.tsx` 同步用 `getKeywordSourceText()` 统计总字数和关键词来源，并在 1-3 个关键词时使用紧凑 flex 布局，4 个及以上使用 4 列网格，最多 12 个。
- 已通过 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`。Puppeteer 本地移动端验证 1 篇短日志、3 篇短日志、10 篇正常日志均不误显示空状态；成功截图：`profile-keywords-one-short.png`、`profile-keywords-three-short.png`、`profile-keywords-ten-normal.png`。
- Frontend redeployed with `cmd /c deploy.bat front`; online entry is `/assets/index-C6mbzRCl.js`, `sw.js` remains `xiaoxiang-pwa-v7`, and `/api/health` returns `build: cpamc-only-20260520`.

## 2026-06-05 keyword cloud visual polish

- 用户反馈关键词已经能显示，但 4 列网格上下太对齐、不够错落有致。`src/pages/Profile.tsx` 将 4 列网格改为 `flex-wrap` 词云布局，并为不同序号关键词配置字号、颜色深浅和 `translateY/margin` 偏移，使大词形成视觉重心、小词自然穿插。
- 1-3 个关键词仍保持紧凑居中；多关键词卡片使用更高的 `min-height` 和 `overflow-hidden`，避免错位后撑破卡片或贴边。
- 已通过 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`。Puppeteer 本地移动端截图验证：`profile-keywords-cloud-staggered.png`。
- Frontend redeployed with `cmd /c deploy.bat front`; online entry is `/assets/index-DDAZIg0F.js` and CSS is `/assets/index-Op6pIVBm.css`; `/api/health` returns `build: cpamc-only-20260520`.
- 用户给出理想参考后再次收敛视觉：去掉左右 margin，只保留轻微 `translateY`，将多词卡片维持为两行横向流动，避免过度散点和第三行孤词。已通过 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`；Puppeteer 验证截图：`profile-keywords-cloud-reference-staggered.png`。
- Frontend redeployed again; the deploy command timed out locally after upload, but online verification confirms `/assets/index-CItWjyJE.js` and `/assets/index-B_SFzSaw.css`; `/api/health` returns `build: cpamc-only-20260520`.
