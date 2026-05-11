# 日志导出长文失败 Bugfix Requirements

## Introduction

用户反馈：**在日志编辑/查看界面，日志正文较长（含多段 Markdown：标题、列表、引用、代码块、链接等）时，点击"分享 → 保存到本地"会失败，而短日志可以正常导出成 PNG**。

### 最新证据（用户在浏览器里实机复现）

- **失败形态**：点击"保存到本地"后弹出泛化 toast "导出图片失败，请重试"；
- **平台**：目前在浏览器里就能复现，**尚未打包成 Android**（排除 Capacitor bridge / Android WebView 相关的根因）；
- **控制台错误栈**：

  ```
  Editor.tsx:577 导出图片失败:
  Error: Attempting to parse an unsupported color function "oklch"
  ```

- **相关性**：短日志能导出，长日志失败——并非"长度本身"造成失败，而是长日志里更容易出现 `prose` 规则会命中的元素（`h1`/`h2`/`blockquote`/`code`/`ul`/`a` 等）。

### 真正的根因（已确认）

项目依赖：

- `tailwindcss@^4.1.14`（Tailwind v4） + `@tailwindcss/typography@^0.5.19`
- `html2canvas@^1.4.1`（已 2 年未更新）

Tailwind v4 把默认调色板全部切成了 **`oklch(...)` 颜色函数**，并通过 preflight / prose 插件注入到页面。grep 整个 `src/` 找不到一行手写的 `oklch`，说明这些 `oklch(...)` 都是 Tailwind 在运行时写入的 CSS 变量和规则。

`html2canvas@1.4.1` 的 `parseColor` 解析器**不认识 `oklch` / `oklab` / `lab` / `lch` 等现代颜色函数**，一旦渲染到命中这些规则的节点（比如 `.prose h1`、`.prose blockquote` 的 border、`.prose code`、`.prose a`、`prose-invert` 等），就会抛 `Attempting to parse an unsupported color function "oklch"`。

- 短日志命中不到这些规则 → 正常导出；
- 长日志里用户常常用 `#` 标题 / `-` 列表 / `>` 引用 / 代码块 / 链接 → 命中 oklch 规则 → 失败。

### 先前 spec 中被推翻的根因假设

原 `design.md` 中按优先级列出的"canvas 单边/面积超限"和"Capacitor bridge base64 超长"假设，经用户实机反馈**与事实不符**：

- 浏览器里（非 Capacitor 环境）就已经失败 → bridge 假设被推翻；
- 失败的错误栈是 `oklch` 解析错误，不是空白 canvas / `"data:,"` / `InvalidStateError` → canvas 超限假设被推翻；
- 长度只是"更容易碰到 oklch 规则"的间接原因，不是物理 canvas 极限。

本次修复的核心任务变成了**让 `html2canvas` 的渲染通路能正确处理 `oklch` 颜色**，而不是之前的"给长卡片做分段降级"。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN 日志正文内嵌的 HTML 含有命中 Tailwind v4 `prose` / preflight 规则的元素（`h1`/`h2`/`blockquote`/`code`/`ul`/`ol`/`a`/`strong` 等，且这些规则被解析成 `oklch(...)` 颜色） AND 用户点击"分享 → 保存到本地" THEN `html2canvas` 在遍历 computed style 时抛 `Error: Attempting to parse an unsupported color function "oklch"`，被 `Editor.tsx` 第 577 行附近的 `catch` 捕获，最终弹出泛化 toast `"导出图片失败，请重试"`。

1.2 WHEN 导出失败 THEN 错误提示是一刀切的 `"导出图片失败，请重试"`，**没有区分** "不支持的颜色函数" / "图片跨域" / "权限/目录" 等子类，用户 / 开发者都不知道真正原因，只能反复重试但不会成功（重试也还是同样的 oklch 报错）。

1.3 WHEN 长日志（也许会命中"真正的大 canvas"边界，比如 `cardHeight × 2 > 12000 物理 px`）出现在 Android 打包后 THEN 虽然用户现在没打包成 Android，但一旦后续打包，`html2canvas` 在 Android WebView 里对长卡片的 canvas 尺寸 / 面积 / bridge base64 体积也会有次级风险。这一条在当前浏览器复现中**未观察到**，作为次级防线（本次修复不做主要目标，但要预留设计空间，避免修完 oklch 又踩坑这个）。

### Expected Behavior (Correct)

2.1 WHEN 日志正文含命中 Tailwind v4 / prose 规则的 HTML AND 用户点击"保存到本地" THEN 系统 SHALL 正确把页面中所有 `oklch(...)` / `oklab(...)` / `lab(...)` / `lch(...)` 等**新式 CSS 颜色函数解析为 `html2canvas` 能识别的 `rgb()` / `rgba()`**，并成功产出一张完整 PNG 或触发浏览器下载；不能再抛 `"Attempting to parse an unsupported color function"`。

2.2 WHEN 上述颜色预处理 / 库升级仍失败 THEN 系统 SHALL 给出 actionable 的错误信息（"暂时无法导出，请稍后重试或拆分内容"、"图片过大无法保存"、"未授权保存目录"），而不是一刀切的 `"导出图片失败，请重试"`，且控制台保留原始错误栈（`console.error`）便于后续定位。

2.3 WHEN 日志正文足够长，以至于 `DiaryExportCard` 渲染高度会超过 `html2canvas` / 浏览器单 canvas 安全阈值 THEN 系统 SHALL（作为次级防线）按"先降 `scale`、再分段渲染"的顺序自适应降级，避免将来打包 Android 时重新踩坑；当前浏览器复现里 2.3 不是主修目标，只要求不回归。

### Unchanged Behavior (Regression Prevention)

3.1 WHEN 日志正文短、不含命中 prose 规则的复杂 Markdown（纯文本 / 少量 `<p>`） AND 用户点击"保存到本地" THEN 系统 SHALL CONTINUE TO 以 `scale: 2`、宽 750 px 的 PNG 产出，文件名 `小象日志_${yyyy-MM-dd}.png`，与修复前视觉一致（或差异 ≤ 1 px 的抗锯齿容差）。

3.2 WHEN 日志使用了带 `backgroundImage` 的主题 THEN 系统 SHALL CONTINUE TO 在导出图中按原来的"顶部 350px 原图 / 中间镜像平铺 / 底部 350px 原图"分离式结构渲染背景（`DiaryExportCard` 中 `topBgUrl` / `middleBgUrl` / `bottomBgUrl` 的行为不变）。

3.3 WHEN 日志含 ≤ 4 张图片 AND 点击"保存到本地" THEN 系统 SHALL CONTINUE TO 在导出图底部以 `2×2` 网格渲染图片。

3.4 WHEN 用户在浏览器（非 Capacitor 原生 App）下导出 THEN 系统 SHALL CONTINUE TO 通过 `<a download>` 直接触发下载，文件名 `小象日志_${yyyy-MM-dd}.png`。

3.5 WHEN 用户在分享面板点击"分享到日志圈" / "微信好友" 等**非**"保存到本地"入口 THEN 系统 SHALL CONTINUE TO 执行原有行为（社区发帖 `shareToCircle` / `showToast('功能还在开发中')`）。

3.6 WHEN Capacitor 打包后在 Android 上运行（future，本次浏览器复现不直接验证） THEN 已有 `Filesystem.writeFile` 写入 `Directory.Documents` 的通路 SHALL 保持可用；本次修改不要引入反而破坏 Capacitor 路径的改动。

## Open Questions

已经被用户反馈关闭的问题：

- ~~Q1 失败的具体表现~~ → **toast "导出图片失败，请重试"**（走了 catch，错误栈 `oklch`）。
- ~~Q2 浏览器下是否会失败~~ → **会失败**，而且用户**目前就是在浏览器里复现**，没有打包 Android。
- ~~Q4 错误栈~~ → `Editor.tsx:577 导出图片失败: Error: Attempting to parse an unsupported color function "oklch"`。

仍待设计阶段决定的：

- Q3（未收敛）：是否还需要对"真正的超长卡片"（比如 cardHeight > 6000 CSS px）做 `scale` 降级 / 分段渲染？目前浏览器里 **没** 命中该条件，现象都是 oklch 错误，但修完 oklch 之后，当内容再长一些就可能改命中"长边超限"。本次修复建议：**先修 oklch（主因）**，`scale` 降级作为次级防线一并做，优先级低；完整的分段渲染 + 分页 / Capacitor bridge 适配推到 Android 打包验证阶段再决定要不要做。
- Q5（新增）：修复方式选择 —— 有三条候选通路（见 design.md 的 Fix Implementation）：
  - (A) **在调用 html2canvas 前遍历 DOM，用浏览器 `getComputedStyle` + 临时 canvas 的 `ctx.fillStyle` 反查，把所有 `oklch(...)` 计算值替换成 `rgb(...)`**（最小侵入，不动依赖）；
  - (B) **改用项目已装的 `html-to-image@1.11.13`**（相比 `html2canvas` 对现代 CSS 颜色支持更好）；
  - (C) **把 `html2canvas@1.4.1` 换成社区 fork `html2canvas-pro`**（原生支持 `oklch/oklab/lab/lch`）。
  建议优先尝试 (A)，如果在 `ProseMirror`/`prose` 结构上 stable 了就收工；否则退化到 (B) 或 (C)。
