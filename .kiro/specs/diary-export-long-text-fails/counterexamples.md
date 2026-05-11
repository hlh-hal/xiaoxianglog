# Counterexamples

Exploration test 运行结果（Task 1，未修复代码上）。
测试文件：`tests/exports/exploration.test.ts` + `tests/exports/harness.{html,tsx}`。
命令：`npm run test:exploration`（需先 `npm run dev` 启 Vite :3000）。

## 1. 用户现场（浏览器控制台）

```
Editor.tsx:577 导出图片失败:
Error: Attempting to parse an unsupported color function "oklch"
```

平台：浏览器（未打包 Android）。触发路径：编辑器 → 分享 → 保存到本地。
输入：一篇含 `#` 标题 / `-` 列表 / `>` 引用 / 代码块 / 链接的长 Markdown
（截图里的 "SenseNova 6.7 Flash-Lite / SenseNova U1 Fast / DeepSeek V4 Flash / 参考信息 / 官网地址 / 数据时间" 段）。

## 2. Exploration test 运行结果（puppeteer 打开 harness）

四个 case 的实际返回（本节已迭代到最终版 H2，共两次独立运行结果一致）：

| Case | 输入 | 期望（未修复代码）| 实际结果 |
|------|------|------------------|----------|
| H1   | 用户截图那篇 Markdown 长文（h1/h2/ul/blockquote/code/a） | FAIL + oklch | **✅ FAIL**：`Error: Attempting to parse an unsupported color function "oklch"`（elapsed ≈ 298–302 ms） |
| H2   | `<pre><code>let x = 1;</code></pre>`（代码块） | FAIL + oklch | **✅ FAIL**：`Error: Attempting to parse an unsupported color function "oklch"`（elapsed ≈ 276–279 ms） |
| H3   | 仅一段 `<blockquote><p>Quote</p></blockquote>` | FAIL + oklch | **✅ FAIL**：`Error: Attempting to parse an unsupported color function "oklch"`（elapsed ≈ 281–292 ms） |
| H4   | `<p>这是一段普通正文，只有纯 p 标签。</p>`（对照组） | PASS | **✅ PASS**：`ok=true, width=750, height=1624, dataUrlPrefix=data:image/png;base64,iVBORw0KGgoAAAANSU`（elapsed ≈ 296–321 ms） |

原始 JSON（puppeteer 层原样记录，第二次运行）：

```json
[
  {
    "caseId": "H1",
    "ok": false,
    "errorName": "Error",
    "errorMessage": "Attempting to parse an unsupported color function \"oklch\"",
    "elapsedMs": 297.6
  },
  {
    "caseId": "H2",
    "ok": false,
    "errorName": "Error",
    "errorMessage": "Attempting to parse an unsupported color function \"oklch\"",
    "elapsedMs": 278.8
  },
  {
    "caseId": "H3",
    "ok": false,
    "errorName": "Error",
    "errorMessage": "Attempting to parse an unsupported color function \"oklch\"",
    "elapsedMs": 291.7
  },
  {
    "caseId": "H4",
    "ok": true,
    "width": 750,
    "height": 1624,
    "dataUrlPrefix": "data:image/png;base64,iVBORw0KGgoAAAANSU",
    "elapsedMs": 320.4
  }
]
```

## 3. H2 设计迭代：从 `<h1>Hello</h1>` 改为 `<pre><code>let x = 1;</code></pre>`

最初的 H2 是 `<h1>Hello</h1>`，目的是"最小复现 `.prose h1` 的 oklch color"。
但在本项目 `DiaryExportCard` 的正文容器里（默认 `warm-white` 主题、`textColor=#1C1C1E`）附带了
`prose-headings:text-on-surface` 类，把 `h1` 的 color 显式改成 `var(--color-on-surface) = #2f342e`（hex），
覆盖掉了 prose 默认的 oklch `--tw-prose-headings`；因此"孤零零一个 `<h1>`"在该组件下**不命中** oklch，
观测结果是意外 PASS（见 git 历史的上一版 counterexamples）。

对另外几个候选也做了同样的活体验证：

| 候选 H2 | 命中 oklch？ | 原因 |
|---|---|---|
| `<h1>Hello</h1>` | ❌ 不命中 | 被 `prose-headings:text-on-surface` 覆盖成 hex |
| `<ul><li>一条</li><li>另一条</li></ul>` | ❌ 不命中 | `ul` 的 `color` 继承自容器 `text-on-surface`（hex），`li::marker` 同样继承；当前 prose 规则里没有注入 oklch 到 ul/li 的 border / background / outline |
| `<hr />` | ❌ 不命中 | `hr` 自身 0 高度或 border-top-color 被归一化，puppeteer 实测 html2canvas 没走到 oklch 解析分支 |
| `<pre><code>let x = 1;</code></pre>` | ✅ **稳定命中** | `.prose pre` 默认 `background-color: var(--tw-prose-pre-bg)`（Tailwind v4 下为 oklch），容器类里没有任何 `prose-pre:*` 覆盖；`.prose code` 的 `color` / `background-color` 也来自 oklch 变量 |

因此最终把 H2 定为 `<pre><code>let x = 1;</code></pre>` —— 这个最小 case 现在和 H1/H3 一样稳定在未修复代码上抛
`Attempting to parse an unsupported color function "oklch"`，取代原来会意外 PASS 的 `<h1>Hello</h1>`。

原 H2 的意外 PASS 不改变主因结论：`html2canvas@1.4.1` 的 `parseColor` 不认 `oklch(...)`，只要
`DiaryExportCard` 子树任一元素的 computed style 含 oklch（本项目 `prose` 规则在 `pre` / `code` /
`blockquote` 上注入）就必然失败。

## 4. Open Questions 收敛

- **Q1 失败的具体表现**：toast "导出图片失败，请重试"；走 catch，错误栈 `Error: Attempting to parse an unsupported color function "oklch"`。✅ 已确认（与 H1/H2/H3 一致）。
- **Q2 浏览器下是否会失败**：会，当前 bug 就是在浏览器里复现，未打包 Android。✅ 已确认（puppeteer 本次运行就是浏览器环境）。
- **Q4 错误栈**：`Error: Attempting to parse an unsupported color function "oklch"`。✅ 已确认，H1 / H2 / H3 三个 case 共计两次独立运行稳定复现。

主因定性：**html2canvas@1.4.1 的 `parseColor` 不支持 CSS `oklch(...)`**，一旦 `DiaryExportCard` 正文 DOM 子树里存在命中 Tailwind v4 / prose 的 oklch computed style（典型触发：`blockquote` 的 `border-left-color`、`pre` 的 `background-color`、`code` 的 `color` / `background-color`），导出链路整条失败。

## 5. 修复后 re-run（Task 3.5 追加）

修复后在同一个 harness 上重跑 H1/H2/H3/H4，同样运行在 puppeteer 打开的 `http://localhost:3000/tests/exports/harness.html` 上，结果全部 PASS，同一组输入从 **FAIL → PASS**：

| Case | 输入 | 修复前（Task 1） | 修复后（Task 3.5） |
|------|------|------------------|--------------------|
| H1   | 用户截图 Markdown 长文（h1/h2/ul/blockquote/code/a） | ❌ FAIL：`Error: Attempting to parse an unsupported color function "oklch"` | ✅ PASS：`ok=true, 750×2786, data:image/png;base64,iVBORw0KGg…, elapsed ≈ 399 ms` |
| H2   | `<pre><code>let x = 1;</code></pre>` 代码块 | ❌ FAIL：同上 oklch 报错 | ✅ PASS：`ok=true, 750×1624, data:image/png;base64,iVBORw0KGg…, elapsed ≈ 305 ms` |
| H3   | 仅一段 `<blockquote><p>Quote</p></blockquote>` | ❌ FAIL：同上 oklch 报错 | ✅ PASS：`ok=true, 750×1624, data:image/png;base64,iVBORw0KGg…, elapsed ≈ 307 ms` |
| H4   | 对照组 `<p>这是一段普通正文，只有纯 p 标签。</p>` | ✅ PASS | ✅ PASS：`ok=true, 750×1624, data:image/png;base64,iVBORw0KGg…, elapsed ≈ 304 ms` |

原始 JSON（puppeteer 层原样记录）：

```json
[
  { "caseId": "H1", "ok": true, "width": 750, "height": 2786,
    "dataUrlPrefix": "data:image/png;base64,iVBORw0KGgoAAAANSU", "elapsedMs": 399.2 },
  { "caseId": "H2", "ok": true, "width": 750, "height": 1624,
    "dataUrlPrefix": "data:image/png;base64,iVBORw0KGgoAAAANSU", "elapsedMs": 304.7 },
  { "caseId": "H3", "ok": true, "width": 750, "height": 1624,
    "dataUrlPrefix": "data:image/png;base64,iVBORw0KGgoAAAANSU", "elapsedMs": 307.2 },
  { "caseId": "H4", "ok": true, "width": 750, "height": 1624,
    "dataUrlPrefix": "data:image/png;base64,iVBORw0KGgoAAAANSU", "elapsedMs": 304.0 }
]
```

**浏览器控制台**：没有出现 `Attempting to parse an unsupported color function` 相关错误（仅剩 Vite HMR WebSocket 的 404 / `ERR_CONNECTION_REFUSED`，是 puppeteer 沙箱里常见的无害噪音，与导出链路无关）。

结论：Property 1（Bug Condition: 现代颜色函数兼容性）已在真实浏览器里验证通过。同样输入从 FAIL 翻到 PASS，且 `elapsedMs` 远低于 15 s。

## 6. Preservation baseline（Task 2 生成，未修复代码）

下表记录了 Task 2 的 5 个 preservation case 在**未修复代码上**的实际产物。输入严格只用 `<p>` 段落，主题在 `allThemes` 中按规则选择：

- `warm-white`（纯色） = `allThemes[0]`，id `warm-white`，`backgroundColor=#FAF9F5`；
- 背景图主题 = `allThemes` 中第一个 `backgroundImage` 非空的主题，即 `sys-green-flower`，`backgroundImage=/themes/green_flower.jpg`；
- 图片由 harness 在 off-DOM canvas 上用 `makeSolidPng(300, 300, ...)` 生成的 data URL，保证可复现；P2 取前 2 张（红、蓝），P4 取全部 4 张（红、蓝、绿、黄）。

每个 case 在 html2canvas 之前都跑了一次前置断言（遍历 DOM 子树检查 `color` / `background-color` / `background-image` / `border-*-color` / `outline-color` / `text-decoration-color` / `caret-color` / `fill` / `stroke` / `column-rule-color` / `box-shadow` 的 computed style 是否含 `oklch(|oklab(|lab(|lch(`），全部通过（`¬isBugCondition`）。

| Case | 输入摘要 | 宽×高 | 文件大小 (bytes) | sha256 前 12 位 | elapsed (ms) |
|------|----------|-------|------------------|-----------------|--------------|
| P1 | ShortText-NoImage-PureColorTheme（4 段 ~200 字纯 `<p>` + 无图 + `warm-white`） | 750×1624 | 213 724 | `07a781b0e7ac` | 423 |
| P2 | ShortText-TwoImages-PureColorTheme（同 P1 正文 + 红/蓝 300×300 + `warm-white`） | 750×1812 | 218 613 | `6382e77b7f54` | 374 |
| P3 | ShortText-NoImage-BackgroundImageTheme（同 P1 正文 + 无图 + `sys-green-flower` 背景图主题） | 750×1624 | 2 133 975 | `cd4b43361efd` | 1054 |
| P4 | ShortText-FourImages-BackgroundImageTheme（同 P1 正文 + 红/蓝/绿/黄 300×300 + 背景图主题） | 750×2136 | 2 186 314 | `02696d2f54e2` | 570 |
| P5 | EmptyContent（`htmlContent=''` + 无图 + `warm-white`，最小卡片） | 750×1624 | 50 770 | `039842faa75a` | 351 |

Baseline 文件在 `tests/fixtures/export-baseline/P{1..5}.{png,sha256}`，共 10 个。Runner 自己用 `crypto.createHash('sha256')` 对磁盘上的 PNG 再算了一次 sha256，与 harness 返回的一致（冗余校验通过）。

将在 Task 3.6（修复后 re-run）作为像素一致性对比的参考：

- 可以用 `sha256` 做最严格的"位相同"判定（取决于修复动作是否不改变产物字节）；
- 如果修复动作引入极小像素差（例如颜色归一化走的是 `getComputedStyle` 会有 ≤1 的抗锯齿浮动），就用 pixelmatch 在 `单像素 RGB 差 ≤ 2、整图差异 ≤ 1%` 容差内判定通过。


## 7. 修复后运行结果（Task 4 Checkpoint）

Task 4 把三类自动化检查合在一起跑了一轮，结果如下：

### 7.1 类型检查 `npm run lint`（`tsc --noEmit`）

```
> react-example@0.0.0 lint
> tsc --noEmit

Exit Code: 0
```

无任何类型错误。顺带修掉了 `tests/exports/exploration.test.ts` 原先两处 puppeteer 类型漂移：
`msg.type()` 返回类型里没有 `'warning'`（实际只会是 `'warn'`），`page.on('pageerror', ...)` 回调参数是 `unknown`。
收敛成 `const t = msg.type() as string; if (t === 'error' || t === 'warn' || t === 'warning')`
和 `(err: Error) => …`。运行行为与之前完全一致，`consoleErrors` 仍然记录 error / warn / pageerror 三类。

### 7.2 Exploration harness re-run `npm run test:exploration`

命令：`npm run test:exploration`（前提：port 3000 上 Vite dev server 正在运行）。

```
[exploration] H1 → {"caseId":"H1","ok":true,"width":750,"height":2786,"dataUrlPrefix":"data:image/png;base64,iVBORw0KGgoAAAANSU","elapsedMs":399.20}
[exploration] H2 → {"caseId":"H2","ok":true,"width":750,"height":1624,"dataUrlPrefix":"data:image/png;base64,iVBORw0KGgoAAAANSU","elapsedMs":304.70}
[exploration] H3 → {"caseId":"H3","ok":true,"width":750,"height":1624,"dataUrlPrefix":"data:image/png;base64,iVBORw0KGgoAAAANSU","elapsedMs":307.20}
[exploration] H4 → {"caseId":"H4","ok":true,"width":750,"height":1624,"dataUrlPrefix":"data:image/png;base64,iVBORw0KGgoAAAANSU","elapsedMs":304.00}
[exploration] ✅ 浏览器控制台未出现 "Attempting to parse an unsupported color function" 相关错误
[exploration] ✅ 所有 case 都符合 Task 3.5 修复后的期望：oklch bug 已修复（H1/H2/H3/H4 全 PASS，console 无 oklch 错误）。
Exit Code: 0
```

H1–H4 全部 `ok=true`、宽高 > 0、dataUrl 是合法的 PNG base64 前缀、elapsed 都在 0.4 s 以内（远低于 15 s 上限）。

### 7.3 Preservation verify `npm run test:preservation:verify`

命令：`npm run test:preservation:verify`。对比修复后产物和 `tests/fixtures/export-baseline/P{1..5}.png` 基线：

```
| caseId | ok | new (w×h) | base (w×h) | diffPixels | diffRatio | maxΔ | elapsed ms |
|--------|----|-----------|------------|------------|-----------|------|------------|
| P1 | ✅ | 750x1624 | 750x1624 | 0 | 0.0000% | 0 | 393 |
| P2 | ✅ | 750x1812 | 750x1812 | 0 | 0.0000% | 0 | 383 |
| P3 | ✅ | 750x1624 | 750x1624 | 0 | 0.0000% | 0 | 817 |
| P4 | ✅ | 750x2136 | 750x2136 | 0 | 0.0000% | 0 | 539 |
| P5 | ✅ | 750x1624 | 750x1624 | 0 | 0.0000% | 0 | 350 |

像素一致性：✅ 5/5 全部通过
源码静态检查：✅ 文件名 / 目录 / 下载方式未改动
Exit Code: 0
```

全部 5 个 case 的像素差分（pixelmatch 口径）`diffPixels=0` / `diffRatio=0.0000%` / `maxChannelDiff=0`，
远优于容差（单像素 RGB 差 ≤ 2、整图 ≤ 1%）。Runner 静态检查也确认 Web `<a download>` 文件名、
Capacitor `Filesystem.writeFile` 的文件名 / `Directory.Documents` 目录都没动过。

### 7.4 Unit tests `npx tsx src/utils/exportImage.test.ts`

```
exportImage.ts unit tests
  __normalizeColor: oklch → rgb                 7 passed
  __normalizeColor: oklab → rgb                 2 passed
  __normalizeColor: 非法 / 不支持输入           5 passed
  __replaceModernColorFunctions                 3 passed
  pickExportScale                               8 passed
  decodeErrorReason                             6 passed
==== 31 passed, 0 failed ====
Exit Code: 0
```

31/31 通过。覆盖了：
- `oklch(L C H[deg])` / 百分比 L/C / alpha 分量 / 边界值（0,0,0 / 1,0,0 / 0.5,0,0）→ `rgb` 数值误差 ≤ 1；
- `oklab(L a b)` 的无色轴 case；
- `lab(...)` / `lch(...)` 不做转换、非现代颜色函数、参数数量 / 数字非法 → 原样返回（不抛错）；
- `linear-gradient(oklch(...), oklch(...))` / `box-shadow: 0 0 Xpx oklch(...)` 的多处替换；
- `pickExportScale` 的 `cardH ∈ {0, NaN, -100, 500, 6000, 6500, 8000, 10000}` 全 8 个分支；
- `decodeErrorReason` 的 4 个 reason + `null`/`undefined`/`string` 输入。

### 7.5 浏览器手动回归（由用户自己在浏览器里点，自动化跑不到）

以下 5 项浏览器手动回归**需要用户自己点一遍**，Task 4 不能代劳：

1. 用户截图那篇 Markdown 长文 → 「分享 → 保存到本地」→ 浏览器触发下载 → 打开 PNG 确认内容完整，且控制台无 `oklch` 报错；
2. 短日志（< 500 字、无 markdown 标题 / 列表 / 引用）→ 保存 → 对比修复前随手保存的一张 PNG，视觉一致；
3. 含 `> 引用块` 的日志 → 保存成功；
4. 含 ` ```代码块``` ` 的日志 → 保存成功；
5. 「分享到日志圈」/「微信好友」两条路径点一遍，确认没有被误改。

自动化侧（1–4 的核心链路）已经分别被 H1（长 Markdown）、H3（blockquote）、H2（代码块）和 preservation P1/P2/P3/P4/P5（短日志 + 各种主题 / 图片组合）覆盖，视觉 0 diff pixel。5 属于 UI 回归，需要人工确认（`src/pages/Editor.tsx` 本次只改了 `saveToLocal`，分享面板其它按钮的事件绑定没动）。

## 8. Open Questions 关闭说明（Task 4）

### Q3：是否还需要对"真正的超长卡片"做 `scale` 降级 / 分段渲染？→ 关闭

- **结论**：用 `pickExportScale(cardH)` 作为**次级防线**（见 `src/utils/exportImage.ts`），不做分段渲染。
- **依据**：
  - 本次浏览器复现全部是 `oklch` 解析错误，**没有**命中任何 canvas 单边 / 面积上限（H1 最长案例 `750×2786`，远低于 Chromium 的 16384 单边限制）；
  - `pickExportScale` 的阈值（`cardH * scale > 12000 物理 px` 时降一档）已经在 `saveToLocal` 里接上；
  - 真正的分段拼图 / 多 PNG 分页留给"未来打包 Android 并在真实 WebView 上复现超限后"再做，现在做成本与收益不匹配；
  - 31 个 unit test 里 `pickExportScale` 的 8 个分支全绿，4 个输入含 `NaN / 0 / 负数 / 正常范围` 的防御分支都有覆盖。

### Q5：修复方式选择（A / B / C）→ 关闭

- **结论**：**选方案 A**。未升级 `html2canvas`，未新增 `html2canvas-pro`，未切到 `html-to-image`，未引入任何新依赖（确认 `package.json` 的 dependencies / devDependencies 未动）。
- **落地偏差（重要）**：spec 里原 **方案 A** 是 "DOM probe" —— 把颜色字符串写到一个临时 `<span>`，然后 `getComputedStyle(span).color` 读回 `rgb(...)`。实操中发现 **Chromium ≥ 111 对 `oklch/oklab` 不做自动归一化**，`getComputedStyle` 直接把 `oklch(...)` 原样返回，DOM probe 完全没效果。因此实际落地用的是 **方案 A+**：
  - 手写 **OKLab / OKLCh → linear sRGB → sRGB** 的数学转换（见 `src/utils/exportImage.ts` 的 `__normalizeColor`），参考 CSS Color Module Level 4 / Björn Ottosson 2020 的矩阵，和浏览器内置 color space 转换数值一致（单像素 RGB 差 ≤ 1）；
  - 覆盖 `color` / `background-color` / `background-image`（gradient 内嵌）/ `border-*-color` / `outline-color` / `text-decoration-color` / `caret-color` / `fill` / `stroke` / `column-rule-color` / `box-shadow`；
  - 同时处理：
    - `color-mix(in oklch, …, …)` —— 展开后仍然是 `oklch(...)`，被 `__replaceModernColorFunctions` 的递归正则覆盖；
    - `transition` / `animation` —— 导出期间临时禁用（避免中间帧把 oklch 插回来），导出完用 `restore()` 恢复；
    - **stylesheet-level 规则** —— 不只扫 inline / computed，还遍历 `document.styleSheets` 把规则体内 `oklch(...)` / `oklab(...)` 也替换，防止从 `::before` / `::after` / `::marker` 等伪元素渗漏；
  - 方案 A+ 实测在 H1（长 Markdown，命中 `.prose h1` / `.prose h2` / `.prose ul` / `.prose blockquote` / `.prose code` / `.prose pre` / `.prose a` 全家桶）、H2（`<pre><code>` 的 `.prose pre`/`.prose code` 背景色）、H3（`.prose blockquote` 的 `border-left-color` + `::before` 引号）都成功落地，四个 case 全部 PASS，0 oklch 错误；
  - Preservation P1–P5 在修复后产物和 baseline 上 `diffPixels=0`，说明 A+ 的颜色数学精度足够，没有引入任何肉眼 / 像素级视觉变化；
  - 未出现"需要切 `html2canvas-pro` / `html-to-image`"的触发条件（Task 4 Step 最后那句"方案 A 覆盖不全就停下来问用户" —— 实际覆盖到了，没触发）。
- **不动的东西**：`DiaryExportCard` 组件结构、`src/index.css`、Tailwind 配置、`package.json` 依赖列表、`shareToCircle` / `shareToWeChat`、分享面板 UI。
