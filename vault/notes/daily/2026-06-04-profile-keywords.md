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

## 验证

- `npx tsx tests/profile-keywords.test.ts`
- `npm run lint`
- `npm run build`
- Puppeteer 以移动端宽度打开 `http://localhost:3000/profile`，确认“高频关键词”存在且无控制台错误。
- 2026-06-04 追加本地排查：用截图词样本 `AI sana codex hermes app happy prompt p0 10kg1 p1 p2 jd do taste` 验证过滤后只剩 `AI`、`sana`；混合中文生活主题后优先输出中文主题，再补少量英文。补跑 `npx tsx tests/profile-keywords.test.ts`、`npm run lint`、`npm run build`，并用 Puppeteer 访问本地 `http://localhost:3002/profile` 验证无控制台错误。
- 线上部署：执行 `cmd /c deploy.bat front`，上传 `dist/` 19 个文件，新前端入口为 `/assets/index-Bc0e6dTH.js`。
- 线上验证：`https://www.xiaoxianglog.cn/` 引用 `/assets/index-Bc0e6dTH.js`；`https://www.xiaoxianglog.cn/api/health` 返回 `build: cpamc-only-20260520`；Puppeteer 打开 `https://www.xiaoxianglog.cn/profile`，确认“高频关键词”存在且无控制台错误。

## 下次接手提示

如果后续继续优化这块，优先补真实浏览器中的多关键词视觉截图验证；当前自动化覆盖的是规则和路由渲染，不包含注入 14 个关键词后的像素级布局断言。
