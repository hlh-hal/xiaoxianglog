/**
 * 导出辅助纯函数（bugfix: diary-export-long-text-fails）
 *
 * 本模块聚焦 4 件事：
 * 1) `sanitizeModernColors(root)` —— 在 `html2canvas(root)` 之前，把子树里
 *    `oklch(...)` / `oklab(...)` 等现代颜色函数归一化为 `rgb(...)` / `rgba(...)`
 *    并以 inline style 写回，返回 `restore()` 用于事后恢复；
 * 2) `measureExportCard(el)` —— 读取卡片高度，次级防线用；
 * 3) `pickExportScale(cardH)` —— 根据高度选 html2canvas 的 scale（1 / 1.5 / 2）；
 * 4) `decodeErrorReason(err)` —— 把抛出的错误映射为可 actionable 的 reason code。
 *
 * ## Task 3.5 修复说明（方案 A+，2024-12）
 *
 * 上一版 `normalizeColor` 依赖一个 off-DOM `<span>` probe：先给 `span.style.color`
 * 赋值 `oklch(...)`，再读 `getComputedStyle(span).color`，期望浏览器把它解析成
 * `rgb(...)`。实测在 **Chromium >= 111** 上不成立 —— Chromium 会保留 `oklch(...)`
 * 原样作为 computed value，不会自动转 sRGB；于是 `__replaceModernColorFunctions`
 * 每次拿到的"归一化结果"仍是 `oklch(...)`，`html2canvas@1.4.1` 继续抛
 * `Attempting to parse an unsupported color function "oklch"`。
 *
 * 现在改为**手写数学转换**，完全脱离 DOM probe：
 *
 * - `oklch(L C H [/ A])` → 极坐标转直角坐标得到 OKLab 的 (a, b)；
 * - `oklab(L a b [/ A])` → 按 Björn Ottosson 发表的 LMS 矩阵 + 立方 / 立方根反变换
 *   得到线性 sRGB；
 * - 线性 sRGB → sRGB：应用 γ 编码（阈值 0.0031308），clamp 到 [0,1]，再乘 255；
 * - 输出 `rgb(r, g, b)` 或 `rgba(r, g, b, a)`（a 保留 3 位小数）。
 *
 * ## Scope
 *
 * Tailwind v4 默认调色板 + `@tailwindcss/typography` 的 `prose` 预设**只会产出
 * `oklch(...)`**，不会产出 `lab()` / `lch()`（CIELab 系）。所以本实现对 `lab()` /
 * `lch()` 暂不做完整转换（需要 D50→D65 Bradford 色度适应 + XYZ→linear sRGB，代码
 * 量翻倍），遇到时原样返回，让上层正则替换成 no-op。如果将来用户自行在 CSS 里
 * 写 `lab()` / `lch()` 并命中 `html2canvas`，再视情况补齐。
 *
 * ## 无第三方依赖
 *
 * 所有颜色数学都在本文件里实现，不引入 `colord` / `culori` 等 color 库。
 */

// ---- 核心颜色数学：OKLab / OKLCh → sRGB ----

/**
 * OKLab 转线性 sRGB。
 *
 * 来源：Björn Ottosson, https://bottosson.github.io/posts/oklab/
 * 常量来自论文附录里的 M1 / M2 矩阵的逆变换。
 */
function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [R, G, B];
}

/**
 * 线性 sRGB 分量 → sRGB 分量（应用伽马）。
 * 输入范围任意，输出 clamp 到 [0, 1]。
 */
function linearToSrgb(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
  if (clamped <= 0.0031308) return clamped * 12.92;
  return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function toByte(linearComponent: number): number {
  const gammaEncoded = linearToSrgb(linearComponent);
  const scaled = Math.round(gammaEncoded * 255);
  if (scaled < 0) return 0;
  if (scaled > 255) return 255;
  return scaled;
}

/**
 * 把 α 格式化为 "0.5" / "0.123" / "1" 等形式，保留最多 3 位小数。
 */
function formatAlpha(a: number): string {
  if (!Number.isFinite(a)) return '1';
  if (a >= 1) return '1';
  if (a <= 0) return '0';
  // 3 位小数，去掉尾部多余的 0；如果全零（不太可能，因 a < 1 且 a > 0）则保留 '.XXX'
  const s = a.toFixed(3);
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

// ---- 参数解析：`<number>` / `<percentage>` / `<angle>` / alpha ----

const NUM_PCT_RE = /^(-?\d*\.?\d+(?:[eE][+-]?\d+)?)(%?)$/;
const ANGLE_RE = /^(-?\d*\.?\d+(?:[eE][+-]?\d+)?)(deg|rad|grad|turn)?$/i;

/**
 * 解析 `<number>` 或 `<percentage>`。
 * - number → 原值；
 * - percentage → `(n/100) * pct100`（例如 L 的 100% = 1，C 的 100% = 0.4）；
 * - `none`（CSS Color 4）→ 0；
 * - 其它 → null。
 */
function parseNumOrPct(s: string, pct100: number): number | null {
  const trimmed = s.trim();
  if (trimmed.toLowerCase() === 'none') return 0;
  const m = trimmed.match(NUM_PCT_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === '%') return (n / 100) * pct100;
  return n;
}

/** 解析 CSS `<angle>`，返回度（deg）。支持 `deg` / `rad` / `grad` / `turn` / 裸数字（按 deg）。 */
function parseAngleDeg(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed.toLowerCase() === 'none') return 0;
  const m = trimmed.match(ANGLE_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'deg').toLowerCase();
  switch (unit) {
    case 'deg':
      return n;
    case 'rad':
      return (n * 180) / Math.PI;
    case 'grad':
      return n * 0.9; // 1 grad = 0.9 deg
    case 'turn':
      return n * 360;
    default:
      return n;
  }
}

/** 解析 alpha：数字 [0,1] 或百分比；`none` 当 1。越界会 clamp。 */
function parseAlpha(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed.toLowerCase() === 'none') return 1;
  const m = trimmed.match(NUM_PCT_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const raw = m[2] === '%' ? n / 100 : n;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

/**
 * 把 `oklch(...)` / `oklab(...)` 函数的括号内部切成 `[main, alpha?]`，
 * 再把 main 按空白或逗号切成 3 个分量。CSS Color 4 推荐空格分隔 + `/ alpha`，
 * 为了对浏览器实现的一些兼容序列化更鲁棒，我们也接受逗号。
 */
function splitFunctionArgs(inner: string): { components: string[]; alpha?: string } | null {
  const parts = inner.split('/');
  if (parts.length > 2) return null;
  const mainRaw = parts[0].trim();
  const alphaRaw = parts.length === 2 ? parts[1].trim() : undefined;
  if (!mainRaw) return null;
  const components = mainRaw.split(/[\s,]+/).filter((t) => t.length > 0);
  return { components, alpha: alphaRaw };
}

// ---- 顶层：normalizeColor ----

/**
 * 把单个现代颜色函数串（如 `oklch(0.628 0.258 29.23)` / `oklab(0.5 -0.1 0 / 0.5)`）
 * 转成 `rgb(...)` 或 `rgba(...)`。输入为完整的 `funcName(args)` 字符串（由上层正则
 * 捕获后原样传入）。
 *
 * - 对 `oklch` / `oklab` 做完整手写转换（无浏览器 / DOM 依赖）；
 * - 对 `lab` / `lch`（CIELab 系）**原样返回** —— Tailwind v4 默认调色板不会产出
 *   这两种函数。若日后需要，可以在这里补上 D50→D65 Bradford + XYZ→linear sRGB 的
 *   转换链路；
 * - 输入无法解析（格式非预期、参数越界等）时原样返回，绝不抛异常。
 */
function normalizeColor(colorStr: string): string {
  const s = colorStr.trim();
  const match = s.match(/^(oklch|oklab|lab|lch)\s*\(([^)]*)\)$/i);
  if (!match) return colorStr;
  const fn = match[1].toLowerCase();
  const inner = match[2];

  // 目前只支持 oklch / oklab 的完整转换。lab() / lch() 暂不转换（见文件顶注释的 scope）。
  if (fn !== 'oklch' && fn !== 'oklab') return colorStr;

  const parts = splitFunctionArgs(inner);
  if (!parts || parts.components.length !== 3) return colorStr;

  let L: number | null;
  let aComp: number | null;
  let bComp: number | null;

  if (fn === 'oklch') {
    // oklch(L C H [/ A])
    //   L: <number> 0..1, <percentage> 0..100% (100% = 1)
    //   C: <number> 0..~0.4, <percentage> 0..100% (100% = 0.4)
    //   H: <angle> | <number>（默认 deg）
    L = parseNumOrPct(parts.components[0], 1);
    const C = parseNumOrPct(parts.components[1], 0.4);
    const H = parseAngleDeg(parts.components[2]);
    if (L === null || C === null || H === null) return colorStr;
    const hRad = (H * Math.PI) / 180;
    aComp = C * Math.cos(hRad);
    bComp = C * Math.sin(hRad);
  } else {
    // oklab(L a b [/ A])
    //   L: same as oklch
    //   a, b: <number> -0.4..0.4, <percentage> -100%..100% (100% = 0.4)
    L = parseNumOrPct(parts.components[0], 1);
    aComp = parseNumOrPct(parts.components[1], 0.4);
    bComp = parseNumOrPct(parts.components[2], 0.4);
    if (L === null || aComp === null || bComp === null) return colorStr;
  }

  const alpha = parts.alpha !== undefined ? parseAlpha(parts.alpha) : 1;
  if (alpha === null) return colorStr;

  const [rLin, gLin, bLin] = oklabToLinearSrgb(L, aComp, bComp);
  const R = toByte(rLin);
  const G = toByte(gLin);
  const B = toByte(bLin);

  if (alpha >= 1) return `rgb(${R}, ${G}, ${B})`;
  return `rgba(${R}, ${G}, ${B}, ${formatAlpha(alpha)})`;
}

/** 测试钩子：暴露内部 `normalizeColor`，供 unit test 在 Node / tsx 环境下调用。 */
export const __normalizeColor = normalizeColor;

// ---- 顶层替换器：把 CSS 值里出现的每一处 oklch/oklab/lab/lch 都转成 rgb ----

// 捕获 `oklch|oklab|lab|lch` + 紧跟的 `(...)`；参数里不允许嵌括号（实际 computed style 也不会嵌）。
const MODERN_COLOR_FUNC_PATTERN = /\b(oklch|oklab|lab|lch)\s*\([^()]*\)/gi;
const HAS_MODERN_COLOR = /oklch\(|oklab\(|lab\(|lch\(/i;

/**
 * 把单条 CSS 值里的所有现代颜色函数替换为 `normalize(match)`。
 * 只处理 oklch/oklab/lab/lch，且参数不含嵌套括号。
 *
 * @internal exported for unit tests —— 可注入 normalize 以脱离颜色数学测试纯替换逻辑
 */
export function __replaceModernColorFunctions(
  value: string,
  normalize: (colorStr: string) => string,
): string {
  if (!value || !HAS_MODERN_COLOR.test(value)) return value;
  return value.replace(MODERN_COLOR_FUNC_PATTERN, (match) => normalize(match));
}

// Tailwind v4 + @tailwindcss/typography 会在许多 CSS 属性上注入 oklch / oklab，
// 甚至通过 `color-mix(in oklab, …)` 在 computed value 里产出 `oklab(…)`。我们不再
// 依赖一份写死的白名单 —— 直接枚举 `getComputedStyle(node)` 返回的 CSSStyleDeclaration
// 的所有属性，凡是字面值里出现现代颜色函数的都替换。CSSStyleDeclaration 既可以用
// 数字索引遍历（.length / .item(i)），也可以用 for-of（iterable 属性名）。
//
// 我们仍然保留一份"优先扫描"列表：这份列表覆盖 html2canvas@1.4.1 已知会读取的
// 所有颜色属性，扫描时先跑这些、再跑剩下的，避免顺序带来的副作用（比如 `background`
// 和 `background-color` 写入顺序不同导致视觉变化）。
const PRIORITY_COLOR_PROPS: ReadonlyArray<string> = [
  'color',
  'background-color',
  'background',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'text-emphasis-color',
  'caret-color',
  'fill',
  'stroke',
  'column-rule-color',
  'box-shadow',
  'text-shadow',
];

/**
 * 遍历 `document.styleSheets` 里所有可访问的 CSSStyleRule（含 @media / @supports /
 * @layer 等嵌套），把 declarations 里含 `oklch(` / `oklab(` 的值替换成 rgb，并把原
 * mutation 追加到 `mutations` 里以便 restore 时还原。
 *
 * 这是在 element-level inline style 覆盖之外的第二道防线，专门覆盖：
 * - 伪元素样式（`::before` / `::after` / `::marker` / `::selection` 等）—— inline
 *   style 对它们无效；
 * - 动态 `@layer` 规则（Tailwind v4 用这个组织 preflight / utilities）。
 *
 * 无法访问的 stylesheet（cross-origin 且未设置 CORS）会因为访问 `cssRules` 抛
 * `SecurityError`，这里静默跳过。
 */
function rewriteStylesheetsModernColors(_root: HTMLElement, mutations: SanitizeMutation[]): void {
  if (typeof document === 'undefined') return;
  let sheets: StyleSheetList;
  try {
    sheets = document.styleSheets;
  } catch {
    return;
  }

  const visitRules = (rules: CSSRuleList | undefined | null): void => {
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule) continue;
      // CSSMediaRule / CSSSupportsRule / CSSLayerBlockRule 等都有 .cssRules
      const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
      if (nested) visitRules(nested);

      // 只处理 CSSStyleRule。CSSRule.STYLE_RULE === 1
      if (rule.type !== 1) continue;
      const styleRule = rule as CSSStyleRule;
      const decl = styleRule.style;
      if (!decl || typeof decl.length !== 'number') continue;

      for (let j = 0; j < decl.length; j++) {
        const prop = decl.item(j);
        if (!prop) continue;
        let value: string;
        try {
          value = decl.getPropertyValue(prop);
        } catch {
          continue;
        }
        if (!value || !HAS_MODERN_COLOR.test(value)) continue;
        const replaced = __replaceModernColorFunctions(value, normalizeColor);
        if (replaced === value) continue;
        const previousInline = value;
        const previousPriority = decl.getPropertyPriority(prop);
        try {
          decl.setProperty(prop, replaced, previousPriority);
          // 用 `node: decl as any` 把 CSSStyleDeclaration 伪装成 HTMLElement 复用
          // restore 流程；restore 调用 `node.style.*` 时，实际会直接用这个 decl
          // 本身，因为我们在 restore 里只用 `.removeProperty` / `.setProperty`。
          mutations.push({
            node: { style: decl } as unknown as HTMLElement,
            prop,
            previousInline,
            previousPriority,
          });
        } catch {
          /* ignore */
        }
      }
    }
  };

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (!sheet) continue;
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    visitRules(rules);
  }
}

interface SanitizeMutation {
  node: HTMLElement;
  prop: string;
  /** 修改前的 inline 值（`node.style.getPropertyValue(prop)`）。空串表示原本没设 inline。 */
  previousInline: string;
  previousPriority: string;
}

export interface SanitizeDiagnostics {
  scannedNodes: number;
  mutatedNodes: number;
  skippedNodes: number;
}

/**
 * 遍历 `root`（含 root 自身）的所有元素后代，把 computed style 中含
 * `oklch(|oklab(|lab(|lch(` 的属性值归一化为 `rgb(...)` 并写成 inline style，
 * 返回 `restore()` 回调用于恢复原有 inline style。
 *
 * 注意：
 * - 不抛异常：单节点 `getComputedStyle` 失败会被跳过；
 * - 不处理伪元素（`:before` / `:after`），当前 DiaryExportCard 子树不涉及；
 * - 对 SVG 节点的 `fill` / `stroke` 同样适用。
 */
export function sanitizeModernColors(root: HTMLElement): () => void {
  const mutations: SanitizeMutation[] = [];
  const diag: SanitizeDiagnostics = { scannedNodes: 0, mutatedNodes: 0, skippedNodes: 0 };

  // 项目全局存在 `* { transition: background-color 0.3s, color 0.3s, border-color 0.3s; }`（见 src/index.css）。
  // 如果我们先设置 inline color = rgb(…)，Chromium 会在 oklab 颜色空间里做 0.3s 过渡，
  // 过渡期间 `getComputedStyle(node).color` 返回的是**插值结果**，序列化成 `oklab(…)`；
  // html2canvas 随后读到这个 oklab 字符串直接抛 "Attempting to parse an unsupported color function"。
  //
  // 修复：在扫描 / 改写之前，临时往 `<head>` 注入一条高 specificity 的 `* { transition: none !important }`
  // 样式；`restore()` 时再把它移除。这条样式只在"sanitize + html2canvas 拍一张快照"这
  // 一瞬间生效，肉眼观察不到任何过渡变化。
  let transitionKillStyle: HTMLStyleElement | null = null;
  if (typeof document !== 'undefined') {
    try {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-sanitize-transitions', 'true');
      styleEl.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      const head = document.head || document.documentElement;
      if (head) {
        head.appendChild(styleEl);
        transitionKillStyle = styleEl;
        // 强制一次 reflow，确保注入的样式在下一次 `getComputedStyle` 前生效。
        void root.offsetHeight;
      }
    } catch {
      /* ignore */
    }
  }

  const visit = (node: HTMLElement): void => {
    diag.scannedNodes++;
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(node);
    } catch {
      diag.skippedNodes++;
      return;
    }

    let mutatedThisNode = false;

    // Tailwind v4 的 prose 组件广泛使用 `color-mix(in oklab, oklch(...), transparent)`
    // 的形式做透明度叠加。Chromium 拿到这样的声明后，`getComputedStyle` 返回的可能是
    // **preserved form**（原样 `color-mix(…)`），也可能是 **resolved form**（序列化成
    // `oklab(L a b)` / `oklab(L a b / A)`）。我们的替换需要两趟才能收敛：
    //
    //   Pass 1：看到 `color-mix(in oklab, oklch(…), transparent)`，把里面的 oklch 替成
    //           rgb，写回 inline；浏览器把这个新声明 resolve 出来，仍然序列化成
    //           `oklab(…)`（因为 mixing space 仍是 oklab）。
    //   Pass 2：重读 computed value，拿到 resolved `oklab(L a b[/A])`，整体用
    //           `normalizeColor` 转成 rgb()/rgba()，再写回 inline。此后 computed value
    //           不再含现代颜色函数。
    //
    // 给 3 次循环上限以防极端递归（理论上 2 次足够）。
    let iter = 0;
    for (; iter < 3; iter++) {
      let mutatedThisIter = false;

      // 每轮都重新收集一次 props —— Chromium 在设置 inline 后可能暴露新的 longhand。
      const allPropsSet = new Set<string>(PRIORITY_COLOR_PROPS);
      try {
        for (let i = 0; i < cs.length; i++) {
          const name = cs.item(i);
          if (name) allPropsSet.add(name);
        }
      } catch {
        // 某些实现不支持 length / item，就只扫优先列表
      }
      const props: string[] = [
        ...PRIORITY_COLOR_PROPS,
        ...Array.from(allPropsSet).filter((p) => !PRIORITY_COLOR_PROPS.includes(p)),
      ];

      for (const prop of props) {
        let value: string;
        try {
          value = cs.getPropertyValue(prop);
        } catch {
          continue;
        }
        if (!value || !HAS_MODERN_COLOR.test(value)) continue;

        const replaced = __replaceModernColorFunctions(value, normalizeColor);
        if (replaced === value) continue; // 没有实际变化（如 lab/lch 未实现转换）

        // 记录原 inline，再写入归一化后的值
        const previousInline = node.style.getPropertyValue(prop);
        const previousPriority = node.style.getPropertyPriority(prop);
        try {
          node.style.setProperty(prop, replaced);
          mutations.push({ node, prop, previousInline, previousPriority });
          mutatedThisNode = true;
          mutatedThisIter = true;
        } catch {
          // 设置失败：不记录（没有副作用），继续
        }
      }

      if (!mutatedThisIter) break; // 收敛
    }
    if (mutatedThisNode) diag.mutatedNodes++;
  };

  try {
    // 先访问 root 自身，再遍历所有后代元素
    visit(root);
    const descendants = root.querySelectorAll<HTMLElement>('*');
    for (let i = 0; i < descendants.length; i++) {
      visit(descendants[i]);
    }

    // 额外覆盖：Tailwind v4 会把 prose 的 `h1` / `blockquote::before` / `ul li::marker`
    // 等规则放在 stylesheet 里，而元素的 computed style 可能把 `color-mix(in oklab, …)`
    // 序列化成 `oklab(…)`。仅用元素级扫描无法覆盖伪元素（`::before` / `::marker`）和
    // 藏在 `@property` 默认值 / CSS 变量里的现代颜色函数。为确保 html2canvas 复制 DOM
    // 时能够完全读到 rgb(…)，我们在**同文档范围内**追加一个 `<style>` 标签，把所有
    // 样式表里的 oklch/oklab 都预先归一化到 rgb。追加样式的 specificity 由顺序决定，
    // 新追加的规则覆盖已有规则；导出完成后 `restore()` 会把 `<style>` 节点移除。
    rewriteStylesheetsModernColors(root, mutations);
  } catch {
    // 即使遍历本身炸了，restore() 仍能安全回滚已记录的 mutation
  }

  const restore = (): void => {
    // 后进先出，避免同节点同属性被覆盖时出现残留
    for (let i = mutations.length - 1; i >= 0; i--) {
      const m = mutations[i];
      try {
        if (m.previousInline === '') {
          m.node.style.removeProperty(m.prop);
        } else {
          m.node.style.setProperty(m.prop, m.previousInline, m.previousPriority);
        }
      } catch {
        // 无法恢复就忽略；视觉上最多残留一条 rgb 覆盖，不会引入新 bug
      }
    }
    mutations.length = 0;

    // 把临时注入的 transition-disable 样式拿掉
    if (transitionKillStyle) {
      try {
        if (transitionKillStyle.parentNode) {
          transitionKillStyle.parentNode.removeChild(transitionKillStyle);
        }
      } catch {
        /* ignore */
      }
      transitionKillStyle = null;
    }
  };

  return restore;
}

// ---- 其它纯工具 ----

/**
 * 读取卡片高度。优先用 `offsetHeight`（整数、快），0 时降级 `getBoundingClientRect().height` 再向上取整。
 */
export function measureExportCard(el: HTMLElement): { cardH: number } {
  const offsetHeight = typeof el.offsetHeight === 'number' ? el.offsetHeight : 0;
  if (offsetHeight > 0) return { cardH: offsetHeight };
  try {
    const rect = el.getBoundingClientRect();
    const h = rect ? rect.height : 0;
    if (h > 0) return { cardH: Math.ceil(h) };
  } catch {
    // ignore
  }
  return { cardH: offsetHeight };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFontsReady(root: HTMLElement, timeoutMs: number): Promise<void> {
  const fontSet = document.fonts;
  if (!fontSet?.ready) return;

  const fontRequests = new Map<string, string>();
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const element of elements) {
    const text = (element.textContent || '').trim();
    if (!text) continue;
    try {
      const style = getComputedStyle(element);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (!fontRequests.has(font)) {
        fontRequests.set(font, Array.from(text).slice(0, 48).join(''));
      }
    } catch {
      // 单个节点样式读取失败不应阻止整张图片导出。
    }
  }

  const explicitLoads = Array.from(fontRequests, ([font, sample]) =>
    fontSet.load(font, sample).then(() => undefined).catch(() => undefined)
  );
  await Promise.race([
    Promise.all([fontSet.ready.then(() => undefined), ...explicitLoads]).then(() => undefined),
    delay(timeoutMs),
  ]);
}

async function waitForImagesReady(root: HTMLElement, timeoutMs: number): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    ).then(() => undefined),
    delay(timeoutMs),
  ]);
}

function hashSnapshotPart(hash: number, value: string | number): number {
  const text = String(value);
  let next = hash;
  for (let i = 0; i < text.length; i++) {
    next ^= text.charCodeAt(i);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
}

function getTextGeometryFingerprint(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let hash = 2166136261;
  let textNodes = 0;
  let lineBoxes = 0;
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    if (textNode.data.trim()) {
      textNodes++;
      try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = Array.from(range.getClientRects());
        lineBoxes += rects.length;
        for (const rect of rects) {
          hash = hashSnapshotPart(hash, Math.round(rect.left * 100));
          hash = hashSnapshotPart(hash, Math.round(rect.top * 100));
          hash = hashSnapshotPart(hash, Math.round(rect.width * 100));
          hash = hashSnapshotPart(hash, Math.round(rect.height * 100));
        }
        range.detach();
      } catch {
        hash = hashSnapshotPart(hash, textNode.data.length);
      }
    }
    current = walker.nextNode();
  }

  return `${textNodes}:${lineBoxes}:${hash}`;
}

function getLayoutSnapshot(el: HTMLElement): string {
  const rect = el.getBoundingClientRect();
  const content = el.querySelector<HTMLElement>('[data-export-content="true"]') || el;
  return [
    Math.round(rect.width * 100) / 100,
    Math.round(rect.height * 100) / 100,
    el.scrollWidth,
    el.scrollHeight,
    el.offsetWidth,
    el.offsetHeight,
    getTextGeometryFingerprint(content),
  ].join(':');
}

/**
 * 等待导出节点中的字体、图片和实际文字行盒全部稳定。
 *
 * 只比较整卡宽高无法发现“字体 fallback 已改变、但总高度碰巧没变”的情况，因此快照
 * 还包含每个文本节点的 Range 行盒。中英文 fallback 或换行位置变化都会重置稳定计数。
 */
export async function waitForExportRenderReady(el: HTMLElement): Promise<void> {
  await waitForFontsReady(el, 2500);
  await waitForImagesReady(el, 3000);

  let stableFrames = 0;
  let previous = '';
  const maxFrames = 30;

  for (let i = 0; i < maxFrames; i++) {
    await nextAnimationFrame();
    const current = getLayoutSnapshot(el);
    if (current === previous) {
      stableFrames++;
      if (stableFrames >= 3) return;
    } else {
      stableFrames = 0;
      previous = current;
    }
  }
}

/** 单次导出 PNG 的物理单边安全阈值（px）。*/
const SAFE_MAX_SIDE = 12000;

/**
 * 根据卡片 CSS 高度选择像素倍率。默认 2；超阈值时按 1.5 → 1 降级。
 * 对 0 / 负值 / NaN 返回 2（不触发降级，让正常路径跑）。
 */
export function pickExportScale(cardH: number): 1 | 1.5 | 2 {
  if (!Number.isFinite(cardH) || cardH <= 0) return 2;
  if (cardH * 2 <= SAFE_MAX_SIDE) return 2;
  if (cardH * 1.5 <= SAFE_MAX_SIDE) return 1.5;
  return 1;
}

export interface ExportFontSource {
  fontFamily: string;
  fileName: string;
  fileData: ArrayBuffer;
}

function getFontMimeAndFormat(fileName: string): { mime: string; format: string } {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'woff2') return { mime: 'font/woff2', format: 'woff2' };
  if (extension === 'woff') return { mime: 'font/woff', format: 'woff' };
  if (extension === 'otf') return { mime: 'font/otf', format: 'opentype' };
  return { mime: 'font/ttf', format: 'truetype' };
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取字体文件失败'));
    reader.readAsDataURL(blob);
  });
}

/** 为通过 FontFace API 加载的用户字体生成一次性嵌入 CSS，避免 SVG 克隆后丢失字体。 */
export async function buildExportFontEmbedCss(font: ExportFontSource): Promise<string> {
  const { mime, format } = getFontMimeAndFormat(font.fileName);
  const dataUrl = await readBlobAsDataUrl(new Blob([font.fileData], { type: mime }));
  if (!dataUrl.startsWith('data:')) throw new Error('字体嵌入数据为空');
  return `@font-face{font-family:${JSON.stringify(font.fontFamily)};src:url(${JSON.stringify(dataUrl)}) format(${JSON.stringify(format)});font-style:normal;font-weight:400;font-display:block;}`;
}

type HtmlToImageOptions = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  cacheBust?: boolean;
  skipAutoScale?: boolean;
  fontEmbedCSS?: string;
};

export type HtmlToImagePngRenderer = (
  element: HTMLElement,
  options?: HtmlToImageOptions,
) => Promise<string>;

export interface ExportPngResult {
  dataUrl: string;
  width: number;
  height: number;
}

type StyleMutation = {
  node: HTMLElement;
  property: string;
  value: string;
  priority: string;
};

function setTemporaryStyle(mutations: StyleMutation[], node: HTMLElement, property: string, value: string): void {
  mutations.push({
    node,
    property,
    value: node.style.getPropertyValue(property),
    priority: node.style.getPropertyPriority(property),
  });
  node.style.setProperty(property, value);
}

function applyExportTypographySafety(root: HTMLElement): () => void {
  const mutations: StyleMutation[] = [];
  const content = root.querySelector<HTMLElement>('[data-export-content="true"]');

  setTemporaryStyle(mutations, root, '-webkit-text-size-adjust', 'none');
  setTemporaryStyle(mutations, root, 'text-size-adjust', 'none');

  if (content) {
    setTemporaryStyle(mutations, content, 'white-space', 'pre-wrap');
    setTemporaryStyle(mutations, content, 'word-break', 'normal');
    setTemporaryStyle(mutations, content, 'overflow-wrap', 'anywhere');
    setTemporaryStyle(mutations, content, 'hyphens', 'none');

    const style = getComputedStyle(content);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(fontSize) && fontSize > 0 && (!Number.isFinite(lineHeight) || lineHeight < fontSize * 1.5)) {
      setTemporaryStyle(mutations, content, 'line-height', `${Math.ceil(fontSize * 1.5 * 100) / 100}px`);
    }
  }

  return () => {
    for (let i = mutations.length - 1; i >= 0; i--) {
      const mutation = mutations[i];
      if (mutation.value) {
        mutation.node.style.setProperty(mutation.property, mutation.value, mutation.priority);
      } else {
        mutation.node.style.removeProperty(mutation.property);
      }
    }
  };
}

function decodePngDimensions(dataUrl: string, timeoutMs = 5000): Promise<{ width: number; height: number }> {
  return Promise.race([
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('导出 PNG 解码失败'));
      image.src = dataUrl;
    }),
    delay(timeoutMs).then(() => {
      throw new Error('导出 PNG 解码超时');
    }),
  ]);
}

/**
 * 使用浏览器原生 SVG foreignObject 排版生成 PNG。
 *
 * 这条路径不会像 html2canvas 那样先用 DOM Range 测量、再用 Canvas fillText
 * 重新绘制文字，因此中英文 fallback 字体不会产生两套不一致的字宽。
 */
export async function renderExportPng(
  el: HTMLElement,
  toPng: HtmlToImagePngRenderer,
  scale: 1 | 1.5 | 2,
  fontEmbedCSS?: string,
): Promise<ExportPngResult> {
  const restoreTypography = applyExportTypographySafety(el);
  try {
    await waitForExportRenderReady(el);
    const cardHeight = Math.max(1, Math.ceil(el.scrollHeight || el.offsetHeight || el.getBoundingClientRect().height));
    const dataUrl = await toPng(el, {
      width: 375,
      height: cardHeight,
      pixelRatio: scale,
      cacheBust: false,
      skipAutoScale: true,
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
    });

    if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl === 'data:,') {
      throw new Error('导出 PNG 数据为空');
    }

    const dimensions = await decodePngDimensions(dataUrl);
    const expectedWidth = 375 * scale;
    const expectedHeight = cardHeight * scale;
    if (
      dimensions.width <= 0 ||
      dimensions.height <= 0 ||
      Math.abs(dimensions.width - expectedWidth) > 1 ||
      Math.abs(dimensions.height - expectedHeight) > 1
    ) {
      throw new Error(
        `canvas size mismatch (actual=${dimensions.width}x${dimensions.height}, expected=${expectedWidth}x${expectedHeight})`,
      );
    }

    return { dataUrl, ...dimensions };
  } finally {
    restoreTypography();
  }
}

export type ExportErrorReason = 'unsupported_color' | 'oversize' | 'io' | 'unknown';

/**
 * 把抛出的错误映射为 actionable reason code。
 * 纯函数、零副作用；对 null / undefined / 非 Error 输入安全。
 */
export function decodeErrorReason(err: unknown): ExportErrorReason {
  if (err === null || err === undefined) return 'unknown';
  let text = '';
  if (typeof err === 'string') {
    text = err;
  } else if (err instanceof Error) {
    text = err.message || String(err);
  } else {
    try {
      text = String(err);
    } catch {
      text = '';
    }
  }
  if (!text) return 'unknown';
  if (/Attempting to parse an unsupported color function/i.test(text)) return 'unsupported_color';
  if (/canvas (size|area)|Maximum call stack|out of memory|cannot create canvas|InvalidStateError/i.test(text)) return 'oversize';
  if (/writeFile|NotAllowed|permission|Filesystem/i.test(text)) return 'io';
  return 'unknown';
}
