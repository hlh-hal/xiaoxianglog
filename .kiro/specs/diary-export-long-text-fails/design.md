# 日志导出长文失败 Bugfix Design

## Overview

本次修复解决 `src/pages/Editor.tsx` 中 `saveToLocal()` → `DiaryExportCard` → `html2canvas` → `toDataURL` → 下载/保存 这条导出链路**在长日志下失败**的 bug。

**真正的根因是 `html2canvas@1.4.1` 不支持 Tailwind v4 / `@tailwindcss/typography` 注入的 `oklch(...)` 颜色函数**。短日志往往不命中 `prose` 规则所以正常；长日志几乎必然出现 `h1`/`h2`/`blockquote`/`code`/`ul`/`a` 等元素，命中 `prose` 的 oklch 颜色 → `html2canvas` 解析时抛 `Error: Attempting to parse an unsupported color function "oklch"` → 被 `Editor.tsx:577` 的 catch 捕获 → 弹出泛化 toast。

修复思路按优先级：

1. **颜色预处理（主修）**：在调用 `html2canvas` 之前，遍历 `DiaryExportCard` 子树，把所有 computed style 中出现的 `oklch(...)` / `oklab(...)` / `lab(...)` / `lch(...)` 用浏览器原生 `color()` parser 转成 `rgb(...)` 并回写成 inline style，让 `html2canvas` 只看到它认识的 `rgb()` / `rgba()`。
2. **次级防线（轻量）**：给 `saveToLocal` 加一个"自适应 scale + 安全阈值"的保护（不是本次主战场，但顺手把"以后长文真的超出 canvas 单边限制"的坑填上）。
3. **精细化错误反馈**：把目前一刀切的 `showToast('导出图片失败，请重试')` 按错误类型拆开，保留原始 `console.error` 堆栈以便线上定位。
4. **短文路径保持不变**：对不命中 oklch / 长度阈值的普通日志，产物与当前视觉一致（允许抗锯齿容差）。

本设计**不**修改：`DiaryExportCard` 组件结构、主题背景三段式合成、分享面板、`shareToCircle`、`shareToWeChat`、编辑器 / 主题切换、Tailwind 配置、全局 CSS。

## Glossary

- **Bug_Condition (C)**：导出失败的触发条件 —— `DiaryExportCard` 渲染后的 DOM 子树中，存在任何 computed style 属性（color / background-color / border-color / outline-color / box-shadow / text-decoration-color / fill / stroke 等）被解析为 `oklch(...)` / `oklab(...)` / `lab(...)` / `lch(...)` 这几种 `html2canvas@1.4.1` 不支持的颜色函数。
- **Property (P)**：对任何满足 C 的输入，`saveToLocal` 必须 **不抛 `Attempting to parse an unsupported color function`**，且成功产出一张可解码的 PNG 或返回 actionable 错误。
- **Preservation**：对 ¬C 的输入（不命中任何 `oklch`，卡片高度在安全阈值内），产物与修复前视觉一致（像素差异在抗锯齿容差内）。
- **`DiaryExportCard`**：`src/pages/Editor.tsx` 第 27–304 行定义的屏外渲染组件。
- **`saveToLocal`**：`Editor.tsx` 第 480–586 行，是本次唯一被修改的业务函数（外加新增 `src/utils/exportImage.ts`）。
- **`sanitizeModernColors(el)`**：本次新增的核心工具，遍历 `el` 子树把现代颜色函数预替换成 `rgb`。

## Bug Details

### Bug Condition

整条链路：

```
DiaryExportCard 渲染到屏外 wrapper
  → Tailwind v4 preflight + @tailwindcss/typography 给 h1/h2/p/a/ul/li/blockquote/code 等注入 oklch(...) 颜色
  → html2canvas(el, { scale: 2 }) 遍历节点 computed style
  → parseColor('oklch(...)') 抛 Error: Attempting to parse an unsupported color function "oklch"
  → Editor.tsx catch → showToast('导出图片失败，请重试')
```

**Formal Specification:**

```
FUNCTION isBugCondition(el: HTMLElement)
  INPUT: el -- DiaryExportCard 渲染到屏外 wrapper 后的根节点
  OUTPUT: boolean

  FOR EACH node IN subtree(el) DO
    cs := getComputedStyle(node)
    FOR EACH prop IN [
      'color',
      'background-color', 'background-image',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'outline-color', 'text-decoration-color',
      'box-shadow', 'caret-color', 'fill', 'stroke',
      'column-rule-color',
    ] DO
      v := cs.getPropertyValue(prop)
      IF v 含有 'oklch(' OR 'oklab(' OR 'lab(' OR 'lch(' THEN
        RETURN true
      END IF
    END FOR
  END FOR
  RETURN false
END FUNCTION
```

> 注意：getComputedStyle 在现代浏览器里对 `oklch`/`oklab` **不**会自动归一化成 `rgb`。Chromium 从 111 起保留 `oklch(...)` 文本；Firefox 同样保留。这就是 html2canvas 解析时踩坑的原因。

### Examples

- **E1（确认案例）**：用户截图里的那篇 Markdown 长文（"可用模型 / sensenova-6.7-flash-lite / 模型总览 / SenseNova 6.7 Flash-Lite / DeepSeek V4 Flash / 参考信息 …"），含 `#` 标题、`-` 列表、`>` 引用、链接、代码块。在浏览器里点击"保存到本地" → 失败，错误栈 `Attempting to parse an unsupported color function "oklch"`。
- **E2**：200 字纯文字 + 无图 + 默认主题（不含 h1/h2/blockquote/code）→ 不命中 `prose` oklch 规则 → 成功导出。
- **E3**：200 字正文 + **一行 `#` 标题**（命中 `.prose h1`） → 短日志也会失败 —— 这是"长度 ≠ 根因"的关键反证。
- **E4**：含 `> 引用块` 的日志 → 因 `.prose blockquote` 的 `border-left-color` 被设为 `oklch(...)` → 失败。

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- 对"不命中 oklch 规则"的短日志（比如只含 `<p>` 的纯文本），产出 PNG 必须与当前实现在视觉上一致。
- `DiaryExportCard` 自身结构、主题背景三段式合成、分享面板、社区发帖、微信分享占位、编辑器、主题切换，全部不变。
- Web 浏览器下继续走 `<a download>` 直接下载，文件名 `小象日志_${yyyy-MM-dd}.png`，与现在一致。
- Capacitor 原生下继续使用 `Directory.Documents`，文件名不变。
- Tailwind 配置、`src/index.css`、全局 CSS 变量定义，全部不动。

**Scope:**

- 修改文件仅限 `src/pages/Editor.tsx` 中的 `saveToLocal`；
- 新增文件 `src/utils/exportImage.ts`（纯工具函数，便于单测）；
- 不允许改 `DiaryExportCard` 组件、`src/index.css`、Tailwind 配置、`package.json` 依赖**主版本**（如果选方案 C 需要引入 `html2canvas-pro`，这条单独确认）。

## Root Cause

经用户实机反馈 + 代码 / 依赖 grep 确认：

1. **主因（已实锤）**：`html2canvas@1.4.1` 不支持 CSS `oklch(...)` / `oklab(...)` / `lab(...)` / `lch(...)` 颜色函数。Tailwind v4 默认调色板用 `oklch`，`@tailwindcss/typography` 的 `prose` 预设把 `h1`/`h2`/`a`/`blockquote`/`code` 的颜色、border-color 都映射到 oklch。`DiaryExportCard` 正文区通过 `className="... prose prose-*"` + `dangerouslySetInnerHTML={{ __html: htmlContent }}` 渲染 Tiptap 的 HTML，只要长文里出现命中 prose 规则的元素，就一定有 oklch 样式。html2canvas 遍历节点时 `parseColor('oklch(...)')` 抛错，整个导出流程失败。

2. **为什么"短日志能过、长日志失败"只是相关不是因果**：短日志经常是纯文本 `<p>`，不命中 prose 的 h1/h2/blockquote/code 规则（那些规则才会被设为 oklch 颜色）。长日志几乎一定会出现上面这些元素。也就是说 bug 条件是"HTML 包含命中 prose oklch 规则的元素"，和"长度"只是统计相关。

3. **次级风险（尚未实锤，但同一条链路上要防**）：真的把内容写到很长（> ~6000 CSS px），`html2canvas(el, { scale: 2 })` 产出的 canvas 物理高度接近 / 超过浏览器单 canvas 单边极限（Chromium 16384 px、Firefox 32767 px；但 iOS Safari 4096 px、Android WebView 往往更低），可能得到空 canvas / `toDataURL` 返回 `"data:,"`。当前浏览器复现里**没有**触发这一条，但作为次级防线需要加一个安全阈值保护。

4. **可以排除的根因**：原 spec 里优先级最高的"Capacitor bridge 传超长 base64 OOM"完全不成立 —— 用户目前在浏览器里就能复现，且没有打包 Android。相关判断从 spec 中移除。

## Correctness Properties

Property 1: Bug Condition - 现代颜色函数兼容性

_For any_ input where the bug condition holds (`isBugCondition(el)` returns true，即 `DiaryExportCard` 子树里存在 computed style 含 `oklch` / `oklab` / `lab` / `lch` 的节点), the fixed `saveToLocal` SHALL 成功完成以下之一：

- (a) 颜色预处理把所有现代颜色函数换成 `rgb(...)`，`html2canvas` 正常返回一张可解码的 PNG（`canvas.width > 0 && canvas.height > 0 && toDataURL !== 'data:,'`），浏览器触发 `<a download>`；
- (b) 若预处理 / 渲染仍失败（如遇到完全未覆盖的颜色函数），则抛可识别的错误类型，由 `saveToLocal` 的分支 catch 返回 actionable toast（"暂时无法导出该内容，请稍后重试"），并在 `console.error` 保留原始堆栈；
- (c) **不能**再出现 `"Attempting to parse an unsupported color function"` 未捕获异常或被泛化吞掉；
- (d) 整个流程 ≤ 15 s 内返回，不静默挂起。

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - 不命中 oklch 的常规产物保持一致

_For any_ input where the bug condition does NOT hold (`isBugCondition(el)` returns false，即子树里没有任何现代颜色函数), the fixed `saveToLocal` SHALL produce 与原实现视觉一致的 PNG（像素级完全一致，或 RGB 单像素差 ≤ 2 的抗锯齿容差），保存到同一目录、同一文件名；背景合成、图片网格、品牌栏、主题颜色、字体全部保持不变。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### 方案选型

三条候选通路（见 bugfix.md Open Questions Q5）：

| 方案 | 动作 | 优点 | 风险 |
|---|---|---|---|
| **A. 颜色预处理（推荐 / 默认）** | 在 `html2canvas` 之前遍历 `DiaryExportCard`，把所有 computed 出来的 `oklch/oklab/lab/lch` 用浏览器自己的 `color parser` 归一化成 `rgb()` 并写成 inline style | 不换依赖、修改小；inline style 最强优先级，html2canvas 克隆后就看不到 oklch | 需要遍历子树，轻微性能开销（ms 级）；极少见的 `box-shadow` / `background-image` 里嵌的 oklch 要单独处理 |
| B. 改用 `html-to-image@1.11.13`（项目已装） | 把 `saveToLocal` 内部 `html2canvas` 替换为 `htmlToImage.toCanvas(el, { pixelRatio: 2 })` | 完全绕开 html2canvas 的颜色解析；`html-to-image` 用 SVG foreignObject，浏览器自己渲染，现代 CSS 几乎全支持 | 和 `html2canvas` 输出可能有像素级差异 → 破坏 Preservation；`foreignObject` 不会绘制 cross-origin 图像（背景图用户自己上传的没事，OSS 远程图需确认 CORS） |
| C. 换到 `html2canvas-pro` | 添加依赖、替换 import | 原生支持 `oklch/oklab/lab/lch`，产物与原 html2canvas 几乎一致 | 引入新依赖；需要用户 approve 依赖变更 |

**默认选方案 A**（最小侵入、不动依赖、Preservation 风险最低）。如果 A 在 `ProseMirror` / `prose-invert` 结构下仍有边角 case 失败，退化到 C。方案 B 不做。

### Changes Required

**File 1 (新增)**: `src/utils/exportImage.ts`

导出：

- `sanitizeModernColors(root: HTMLElement): () => void`
  - 遍历 `root` 及其所有后代；
  - 对需要检查的 CSS 属性集（`color` / `background-color` / `border-*-color` / `outline-color` / `text-decoration-color` / `caret-color` / `fill` / `stroke` / `column-rule-color` / `box-shadow` / `background-image`）读 `getComputedStyle(node).getPropertyValue(prop)`；
  - 如果值含 `oklch(` / `oklab(` / `lab(` / `lch(`，用一个私有的"颜色归一化"函数 `toRgb(colorStr)` 转成 `rgb(r, g, b)` 或 `rgba(r, g, b, a)`；
  - 把归一化后的值作为 inline style 写到 `node.style[prop]`（inline 优先级最高，html2canvas 克隆时读到的就是 rgb 了）；
  - 返回一个 `restore()` 回调，导出完成后恢复原 inline style，避免污染界面。
  - `toRgb(colorStr)` 的实现方式：新建一个临时 `<div>`（或一次性复用的 module-level 单例），`el.style.color = colorStr`，然后 `getComputedStyle(el).color` —— 现代浏览器会直接返回 `rgb(...)` / `rgba(...)`；对 `background-image` 里嵌的 gradient，使用正则捕获每个 `oklch(...)` 替换。
- `measureExportCard(el: HTMLElement): { cardH: number }`（次级防线用）
- `pickExportScale(cardH: number): number`：返回 `2 | 1.5 | 1`，默认 `2`；当 `cardH * 2 > 12000` 返回 `1.5`，当 `cardH * 1.5 > 12000` 返回 `1`。本次先不做分段渲染，只做单次 scale 降级。
- `decodeErrorReason(err: unknown): 'unsupported_color' | 'oversize' | 'io' | 'unknown'`：把错误堆栈文本匹配 `Attempting to parse an unsupported color` / `canvas area` / `WriteFile` / 其它 → 返回 reason code。

**File 2 (修改)**: `src/pages/Editor.tsx` 的 `saveToLocal` 函数

在 `html2canvas(el, { scale: 2, ... })` 之前：

```ts
const { cardH } = measureExportCard(el);
const scale = pickExportScale(cardH);
const restoreColors = sanitizeModernColors(el);
let canvas: HTMLCanvasElement;
try {
  canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    scale,
    backgroundColor: null,
    logging: false,
    width: 375,
    windowWidth: 375,
  });
} finally {
  restoreColors();
}
```

把现有一个 `catch` 拆成：

```ts
catch (error) {
  const reason = decodeErrorReason(error);
  console.error('导出图片失败:', error); // 保留原始堆栈
  if (reason === 'unsupported_color') {
    showToast('暂时无法导出该内容，请稍后重试');
  } else if (reason === 'oversize') {
    showToast('日志内容较多，已无法完整导出，建议精简或拆分');
  } else if (reason === 'io') {
    showToast('保存失败，请检查存储权限');
  } else {
    showToast('导出图片失败，请重试');
  }
  // ... unmount / removeChild 保持不变
}
```

不改动的：

- `DiaryExportCard` 组件；
- 分享面板 UI；
- `shareToCircle` / `shareToWeChat`；
- Capacitor `Filesystem.writeFile` 调用方式（只把 `canvas.toDataURL` 的输入保持与之前兼容）；
- 文件名、目录、Web `<a download>` 方式。

### 退化路径

- 如果方案 A 在某些 `prose-invert` / `strong` / `code` 组合下仍有遗漏，增加方案 C 作为补丁：`npm i html2canvas-pro@latest`，把 `import html2canvas from 'html2canvas'` 改成 `from 'html2canvas-pro'`，`sanitizeModernColors` 可以保留但不再是必需（pro 原生认 oklch）；本次 spec 默认只做 A。

## Testing Strategy

### Validation Approach

两阶段：

1. **Exploration（修复前）**：写测试在未修复代码上复现 "oklch" 错误，counterexample 就是那行错误栈；
2. **Fix + Preservation（修复后）**：
   - Exploration 测试在修复后必须 PASS（即同样的输入不再抛 oklch 错误，产物是有效 PNG）；
   - Preservation 测试在修复前后结果一致（不命中 oklch 的短日志视觉一致）。

### Exploratory Bug Condition Checking

**Goal**：在未修复代码上复现用户看到的 `Attempting to parse an unsupported color function "oklch"`。

**Test Plan**：使用 `jsdom` 无法复现 Tailwind 的 oklch 规则（因为需要真实浏览器 CSS cascade），所以这层 exploration **必须跑在真实浏览器上**。项目已经装了 `puppeteer@24`，我们用它：

1. 跑 `npm run dev`（或用 Vite programmatic API 起一个 server）；
2. Puppeteer 打开 `http://localhost:3000/editor?seed=longmd`（可以加一个仅 dev 环境启用的 test hook，接收 query param 预填长 Markdown 内容）；
3. 在页面里 `window.__testExport()` 暴露一个 test-only 入口（仅当 `import.meta.env.DEV === true`），直接把 `DiaryExportCard` 渲染到屏外 + 调 `html2canvas` + 返回 `{ ok, errorMessage, canvasWidth, canvasHeight, dataUrlPrefix }`；
4. 断言：在"未修复代码上，case = longmd"，返回 `{ ok: false, errorMessage: /Attempting to parse an unsupported color function/i }`。

如果搭 Puppeteer 成本高，可以用更轻的替代：

- 用 Vite 启一个普通 dev server，写一个独立 html 文件 `tests/exports/harness.html`，里面用 `<script type="module">` 导入 `DiaryExportCard` 和 `html2canvas`，传入一个已知会命中 oklch 的 HTML，验证能不能重现错误；这个 harness 直接在本地浏览器打开就能手动 reproduce。

**Test Cases (scoped PBT)**：

1. **Case H1 - 用户截图 Markdown 长文**（命中 h1/h2/ul/blockquote/code/a） → 期望失败，错误包含 `"oklch"`；
2. **Case H2 - 仅一行 `# 标题`**（最小复现：命中 `.prose h1` 的 oklch color） → 期望失败；
3. **Case H3 - 仅一段 `> 引用`**（命中 `.prose blockquote` 的 oklch border-left-color） → 期望失败；
4. **Case H4 - 对照组：纯 `<p>段落文字</p>`**（不命中任何 prose oklch 规则） → 期望成功（这也同时给 Preservation 提供 baseline）。

**Expected Counterexamples**：`Error: Attempting to parse an unsupported color function "oklch"`。

把实机错误栈写进 `.kiro/specs/diary-export-long-text-fails/counterexamples.md`（现在已经有用户给的那一条）。

### Fix Checking

**Goal**：对所有满足 `isBugCondition(el) = true` 的子树，`saveToLocal_fixed` 都能成功返回一张可解码的 PNG（或给出 actionable 错误），且不再抛 `"Attempting to parse an unsupported color function"`。

```
FOR ALL input WHERE isBugCondition(el) DO
  result := saveToLocal_fixed(input)
  ASSERT result.kind = 'ok' AND decodePng(result.dataUrl).width > 0
         OR result.kind = 'error' AND result.reason IN ['unsupported_color', 'oversize', 'io']
  ASSERT NO throw with message containing /Attempting to parse an unsupported color/
  ASSERT elapsed(result) <= 15s
END FOR
```

### Preservation Checking

**Goal**：对 `¬isBugCondition(el)`，修复前后像素一致（或抗锯齿容差内）。

```
FOR ALL input WHERE NOT isBugCondition(el) DO
  original := saveToLocal_original(input)
  fixed    := saveToLocal_fixed(input)
  ASSERT rgbDiff(original.png, fixed.png) <= 2 per pixel AND <= 1% pixels differ
  ASSERT original.filename === fixed.filename
  ASSERT original.directory === fixed.directory
END FOR
```

**Preservation Test Cases**：

1. 纯 `<p>` 200 字 / 默认主题 / 无图；
2. 纯 `<p>` 200 字 / 带 `backgroundImage` 主题 / 无图（验证三段式背景合成不变）；
3. 纯 `<p>` 200 字 / 纯色主题 / 2 张小图；
4. 纯 `<p>` 200 字 / 纯色主题 / 4 张小图（验证 2×2 网格）；
5. 空字符串（防御：只有日期 + 品牌栏的最小卡片）。

所有 5 个 case 必须满足 `isBugCondition(el) = false`（执行前断言），否则移出 preservation 集合。

### Unit Tests

- `sanitizeModernColors` + `restore`：
  - 对 `<div style="color: oklch(0.5 0.1 180)">` 调用后，`style.color` 变成 `rgb(...)`；
  - `restore()` 调用后，`style.color` 回到原 inline（或空）；
  - 对不含 oklch 的节点，调用前后 style 完全一致（no-op）；
  - 对 `background-image: linear-gradient(oklch(...), oklch(...))` 能把两处 oklch 都替换；
  - 对 `box-shadow: 0 0 5px oklch(...)` 能替换。
- `pickExportScale`：
  - `cardH = 500` → 2；
  - `cardH = 6500` → 1.5（`6500 * 2 = 13000 > 12000`）；
  - `cardH = 10000` → 1（`10000 * 1.5 = 15000 > 12000`）。
- `decodeErrorReason`：
  - `Error("Attempting to parse an unsupported color function oklch")` → `'unsupported_color'`；
  - `Error("canvas area exceeds the maximum limit")` → `'oversize'`；
  - `DOMException("NotAllowedError: ...")` / `"WriteFile"` → `'io'`；
  - 其它 → `'unknown'`。

### Integration Tests（可选 / 手动）

- 浏览器端 —— 本次主验证路径：
  1. 打开用户截图那篇 Markdown 长文；
  2. 分享 → 保存到本地；
  3. 浏览器触发下载，`.png` 文件大小 > 0，用图片查看器打开内容完整；
  4. 控制台无 `oklch` 报错，无未捕获异常。
- Android（未来打包后再做）：仅人工回归，不在 CI。
