# Implementation Plan

说明：修订后的计划对应真实根因 —— **`html2canvas@1.4.1` 不认识 Tailwind v4 / prose 注入的 `oklch(...)` 颜色函数**。顺序仍是"先 explore、再 preserve、再 implement"：任务 1 的 exploration 测试必须在修复前在真实浏览器上运行，观察到 `oklch` 解析错误；任务 2 的 preservation 测试必须在未修复代码上运行通过。

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition - 现代颜色函数兼容性**
  - **CRITICAL**: 这个测试必须在**未修复的 `saveToLocal` 链路**上复现 `Error: Attempting to parse an unsupported color function "oklch"`。失败即证明 bug 存在。不要在这一步改业务源码让它通过。
  - **NOTE**: 同一个测试会在任务 3 完成后重跑，通过则表示 bug 修复。
  - **GOAL**: 在未修复代码上锁定 bug 的触发表面 —— 只要 `DiaryExportCard` 子树里的 computed style 含 `oklch(...)`，`html2canvas(el)` 就会抛错。
  - **Scoped PBT Approach**: 四个确定性 case 共同覆盖：
    - **H1（用户截图复现）**：一段长 Markdown 含 `#` 标题、`-` 列表、`>` 引用、代码块、链接（可以直接把用户截图的 SenseNova 模型对比那段内容写成 HTML fixture）；
    - **H2（最小复现）**：仅一行 `<h1>Hello</h1>`（命中 `.prose h1` 的 oklch color）；
    - **H3**：仅一段 `<blockquote>Quote</blockquote>`（命中 `.prose blockquote` 的 oklch border-left-color）；
    - **H4（对照组）**：纯 `<p>正文文字</p>`，期望不命中任何 oklch 规则，导出成功（同时作为任务 2 的 baseline 锚点）。
  - **测试实现细节**：
    - `jsdom` **不适用**，因为它不跑 Tailwind 的 CSS cascade，无法真实产出 `oklch(...)` computed style。必须跑在真实浏览器中。
    - 推荐方式（最轻量）：新建 `tests/exports/harness.html` + `tests/exports/harness.ts`，用 Vite 的 dev server 直接提供该页面；在页面里 import `DiaryExportCard` 和 `html2canvas`，写一个 `window.__runExportHarness(caseId)` 函数，返回 `{ ok, width, height, errorMessage, dataUrlPrefix, elapsedMs }`。测试 runner 用 `puppeteer@24`（项目已装）打开这个 harness，对四个 case 依次调用 `window.__runExportHarness`。
    - 备选方式：`npm run dev` + 手动 Puppeteer 脚本，对 `http://localhost:3000/editor` 里的 `saveToLocal` 用 `page.evaluate` 触发，`page.on('console', ...)` 捕获错误栈。
    - 每个 case 都应在 15 秒内返回（`Promise.race` + timeout）。
  - **EXPECTED OUTCOME**: 测试在未修复代码上呈现以下结果（这就是 counterexample）：
    - H1, H2, H3 → FAIL：`errorMessage` 含 `/Attempting to parse an unsupported color function/i`；
    - H4 → PASS：得到有效的 `dataUrl`，宽高 > 0。
  - **记录 counterexample**：新建 `.kiro/specs/diary-export-long-text-fails/counterexamples.md`，贴入：
    - 用户现场控制台的原始错误栈 `Editor.tsx:577 导出图片失败: Error: Attempting to parse an unsupported color function "oklch"`；
    - 任务 1 harness 上 H1/H2/H3 三个 case 的实际失败栈；
    - 关闭 Open Questions Q1 / Q2 / Q4（内容已在用户反馈中，直接引用即可）。
  - 任务完成条件：测试代码提交 + 本地跑了一次 + `counterexamples.md` 固化。
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation - 不命中 oklch 的常规产物保持一致**
  - **IMPORTANT**: 遵循 observation-first。**先**在**未修复代码**上跑这组测试，把每个 case 的输出作为 baseline 固化（`tests/fixtures/export-baseline/*.png` 或 perceptual hash），任务 3.5 再跑一遍做对比。
  - **Property-based 思路**：输入空间 = `(text ∈ PureParagraphText, images ∈ [0..4], theme ∈ allThemes)`，满足 `¬isBugCondition(el)` 的子集（即 `DiaryExportCard` 渲染后 DOM 子树里不含任何 `oklch/oklab/lab/lch` computed style，且卡片高度 ≤ 2000 CSS px）。
  - **测试 cases**：
    1. **ShortText-NoImage-PureColorTheme**：200 字纯 `<p>` + 无图 + 纯色主题；
    2. **ShortText-TwoImages-PureColorTheme**：200 字纯 `<p>` + 2 张 300×300 图 + 纯色主题；
    3. **ShortText-NoImage-BackgroundImageTheme**：200 字纯 `<p>` + 无图 + 带 `backgroundImage` 主题（验证 `topBgUrl/middleBgUrl/bottomBgUrl` 合成不变）；
    4. **ShortText-FourImages-BackgroundImageTheme**：200 字纯 `<p>` + 4 张图 + 带背景图主题（验证 2×2 网格 + 三段式背景并存）；
    5. **EmptyContent**：空字符串（最小卡片）。
  - **前置断言**：每个 case 在渲染后必须通过 `isBugCondition(el) === false` 检查，否则从集合中移除或调整输入（例如去掉 markdown 中的 h1 / 列表）。
  - **断言方式**：
    - 对每个 case 用**未修复代码**生成 PNG，保存为 baseline；
    - 任务 3.5 用**修复后代码**再生成一次，用 pixelmatch（或 perceptual hash）对比，容差：单像素 RGB 差 ≤ 2、整图差异 ≤ 1% 像素；
    - 比较文件名：`小象日志_${format(displayDate, 'yyyy-MM-dd')}.png`；
    - 比较目录：Web 下 `<a download>`、Capacitor 下 `Directory.Documents`。
  - **EXPECTED OUTCOME**: 所有 5 个 case 在未修复代码上 PASS；如任一 case 意外 FAIL，说明它其实命中了 oklch（比如 theme 颜色也是 oklch），移出 preservation 集合或改成 hex。
  - 任务完成条件：baseline fixtures 生成 + 测试在未修复代码上全部通过。
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 3. Fix for 日志导出长文失败（oklch 兼容）

  - [x] 3.1 新增 `src/utils/exportImage.ts`（抽出导出辅助的纯函数）
    - 导出：
      - `sanitizeModernColors(root: HTMLElement): () => void`：遍历 root 子树，对下列 CSS 属性集合检查 computed style 是否含 `oklch(` / `oklab(` / `lab(` / `lch(`：`color`、`background-color`、`border-top-color`/`-right-color`/`-bottom-color`/`-left-color`、`outline-color`、`text-decoration-color`、`caret-color`、`column-rule-color`、`fill`、`stroke`、`box-shadow`、`background-image`；命中则用私有 `toRgb(colorStr)` 归一化成 `rgb(...)` / `rgba(...)` 并作为 inline style 写回 `node.style[prop]`。返回 `restore()` 回调，导出完成后恢复。
      - `measureExportCard(el: HTMLElement): { cardH: number }`
      - `pickExportScale(cardH: number): 1 | 1.5 | 2`（次级防线，阈值 12000 物理 px）
      - `decodeErrorReason(err: unknown): 'unsupported_color' | 'oversize' | 'io' | 'unknown'`
    - `toRgb(colorStr)` 的实现：module 作用域复用一个 off-DOM `<span>`，设置 `span.style.color = colorStr`，`document.body.appendChild(span)`（必要时，否则 computed 为空），读 `getComputedStyle(span).color`（现代浏览器对 `oklch/oklab/lab/lch` 都会返回 `rgb(...)` / `rgba(...)`），读完 remove；对 `background-image` 里嵌的 gradient，用 `String.replaceAll(/(oklch|oklab|lab|lch)\([^)]*\)/g, match => toRgb(match))` 递归替换。
    - 新增 `src/utils/exportImage.test.ts`（unit tests，使用 jsdom 或 vitest），覆盖：
      - 含 `color: oklch(...)` 的 div → 调用后 inline `style.color` 变 `rgb(...)`；`restore()` 后恢复原 inline；
      - 不含 oklch 的 div → 调用前后 style 完全不变；
      - `background-image: linear-gradient(oklch(...), oklch(...))` → 两处都被替换；
      - `box-shadow: 0 0 5px oklch(...)` → 被替换；
      - `pickExportScale(500) = 2` / `pickExportScale(6500) = 1.5` / `pickExportScale(10000) = 1`；
      - `decodeErrorReason` 的四种 case。
    - 注意：`jsdom` 对 `oklch` 的 computed style 支持不稳定；unit test 若发现 jsdom 拿不到 `rgb(...)`，则这类 case 移到任务 3.5 的真实浏览器 harness 里验证。
    - _Bug_Condition: isBugCondition(el) 中 oklch/oklab/lab/lch branch_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 在 `saveToLocal` 中接入 `sanitizeModernColors` + `pickExportScale`
    - 位置：`src/pages/Editor.tsx` 第 480–586 行附近。
    - 在 `const el = wrapper.querySelector('#diary-export-card')` 之后、`html2canvas(...)` 之前：
      ```ts
      const { cardH } = measureExportCard(el);
      const scale = pickExportScale(cardH);
      const restoreColors = sanitizeModernColors(el);
      ```
    - `html2canvas(...)` 调用用 `try { ... } finally { restoreColors(); }` 包起来，保证无论成功失败都恢复 inline style，不污染界面。
    - `html2canvas` 的 options 中 `scale` 由上面 `pickExportScale(cardH)` 决定（默认 2，与现状一致；只有 cardH 超阈值时降级）。
    - `DiaryExportCard` 组件本身、背景三段式合成、等待 `data-ready=true` / 等待图片加载的逻辑**不动**。
    - _Bug_Condition: 主修 - oklch/oklab/lab/lch_
    - _Expected_Behavior: Property 1 (a)_
    - _Requirements: 2.1_

  - [x] 3.3 精细化错误处理
    - 把现有 `catch (error) { console.error(...); showToast('导出图片失败，请重试'); ... }` 改造成：
      ```ts
      catch (error) {
        console.error('导出图片失败:', error); // 保留原始堆栈
        const reason = decodeErrorReason(error);
        if (reason === 'unsupported_color') {
          showToast('暂时无法导出该内容，请稍后重试');
        } else if (reason === 'oversize') {
          showToast('日志内容较多，请精简或拆分后再导出');
        } else if (reason === 'io') {
          showToast('保存失败，请检查存储权限');
        } else {
          showToast('导出图片失败，请重试');
        }
        // ... root.unmount() / removeChild 保持不变
      }
      ```
    - 所有错误分支必须 `root.unmount()`、清理 wrapper DOM、`setExporting(false)`，不留泄漏。
    - _Expected_Behavior: 2.2_
    - _Requirements: 2.2_

  - [x] 3.4 次级防线兜底（轻量，不做分段渲染）
    - `pickExportScale` 已在 3.1 实现；本步只在 `saveToLocal` 里把它接到 `html2canvas` 的 `scale` 参数上（3.2 已经做了）。
    - 额外：如果 `canvas.width === 0 || canvas.height === 0 || canvas.toDataURL(...) === 'data:,'`，视为 `oversize` 错误路径走 `decodeErrorReason` → toast "日志内容较多，请精简或拆分后再导出"。
    - **本次不做**：分段 `html2canvas` 拼接长图、分页输出多张 PNG、切到 `html2canvas-pro` 或 `html-to-image`；这些留给后续 Android 打包验证后再决定。
    - _Requirements: 2.3（作为预留）_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **重跑任务 1 的 harness**（不要写新的）。
    - 修复后期望：
      - H1 / H2 / H3 → PASS：返回有效 `dataUrl`（`startsWith('data:image/png;base64,')`，宽高 > 0），且 `elapsedMs <= 15000`；
      - H4 → 仍然 PASS；
      - 全部四个 case 的 console 不出现 `Attempting to parse an unsupported color function`。
    - **EXPECTED OUTCOME**: 测试 PASS（证明 oklch bug 已修复）。
    - _Requirements: Property 1, 2.1, 2.2_

  - [x] 3.6 Verify preservation tests still pass
    - **重跑任务 2 的 5 个 preservation case**（不要写新的）。
    - 用修复后的 `saveToLocal` 再生成一次产物，和任务 2 baseline 对比：
      - 单像素 RGB 差 ≤ 2；
      - 整图差异像素比例 ≤ 1%；
      - 文件名、目录、下载方式完全一致。
    - **EXPECTED OUTCOME**: 所有 5 个 case PASS（证明未回归）。
    - _Requirements: Property 2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint
  - 跑 `npm run lint`（`tsc --noEmit`），类型无错。
  - 跑任务 1 / 任务 2 的测试集，全部 PASS。
  - 人工在浏览器上回归以下清单（已能在浏览器复现 bug，无需 Android）：
    1. 用户截图那篇 Markdown 长文 → 点"分享 → 保存到本地" → 浏览器触发下载 → 打开 PNG 确认内容完整，且控制台无 `oklch` 报错；
    2. 短日志（< 500 字、无 markdown 标题 / 列表 / 引用）→ 保存 → 对比修复前随手保存的一张 PNG，视觉一致；
    3. 含 `> 引用块` 的日志 → 保存成功；
    4. 含 ` ```代码块``` ` 的日志 → 保存成功；
    5. "分享到日志圈" / "微信好友" 两条路径点一遍，确认没有被误改。
  - 更新 `counterexamples.md`：把"修复后运行结果"追加到最后一节，证明同样输入从 FAIL → PASS。
  - 关闭 Open Questions Q3 / Q5：
    - Q3：次级防线用 `pickExportScale` 兜底，不做分段渲染（浏览器复现里不命中）；
    - Q5：选方案 A（`sanitizeModernColors`），未升级 `html2canvas-pro`、未切到 `html-to-image`。
  - 如中途发现方案 A 覆盖不全（例如某些 `prose-invert` / 伪元素 / 动画 keyframes 里的 oklch 没处理到），停下来先询问用户是否愿意切到 `html2canvas-pro`，不要自己新增依赖。
