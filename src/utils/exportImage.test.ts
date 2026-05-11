/**
 * Unit tests for src/utils/exportImage.ts
 *
 * 本项目暂未装 vitest / jest，单测用 Node `node:assert/strict` + `tsx` 直接跑：
 *   npx tsx src/utils/exportImage.test.ts
 *
 * 覆盖：
 * 1. `__normalizeColor`（导出的测试钩子）：oklch / oklab → rgb / rgba 的手写数学
 *    转换，对几个典型参考值做 ±1 per-channel 的断言；
 * 2. `__replaceModernColorFunctions`：多点替换（linear-gradient、box-shadow）；
 * 3. `pickExportScale`：阈值边界；
 * 4. `decodeErrorReason`：4 种错误分类。
 *
 * 注意：`sanitizeModernColors` 的 DOM 遍历 / `restore()` 行为依赖 `getComputedStyle`
 * 才能观察到 Tailwind v4 注入的 oklch 规则，这类真实浏览器 case 放在
 * `tests/exports/exploration.test.ts` 里（Task 3.5）验证。
 */

import assert from 'node:assert/strict';
import {
  __normalizeColor,
  __replaceModernColorFunctions,
  pickExportScale,
  decodeErrorReason,
} from './exportImage';

type RGB = { r: number; g: number; b: number; a?: number };

function parseRgb(s: string): RGB | null {
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([^)]+))?\s*\)$/);
  if (!m) return null;
  const rgb: RGB = { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
  if (m[4] !== undefined) rgb.a = parseFloat(m[4]);
  return rgb;
}

function assertRgbClose(actual: string, expected: RGB, tol = 2, label = ''): void {
  const parsed = parseRgb(actual);
  assert.ok(parsed, `[${label}] expected an rgb/rgba string, got: ${actual}`);
  assert.ok(
    Math.abs(parsed!.r - expected.r) <= tol,
    `[${label}] R out of tolerance: expected ~${expected.r}, got ${parsed!.r} (${actual})`,
  );
  assert.ok(
    Math.abs(parsed!.g - expected.g) <= tol,
    `[${label}] G out of tolerance: expected ~${expected.g}, got ${parsed!.g} (${actual})`,
  );
  assert.ok(
    Math.abs(parsed!.b - expected.b) <= tol,
    `[${label}] B out of tolerance: expected ~${expected.b}, got ${parsed!.b} (${actual})`,
  );
  if (expected.a !== undefined) {
    assert.ok(
      parsed!.a !== undefined && Math.abs((parsed!.a ?? 1) - expected.a) <= 0.01,
      `[${label}] alpha expected ~${expected.a}, got ${parsed!.a} (${actual})`,
    );
  }
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    const msg = err?.message ?? String(err);
    failures.push(`${name}\n    ${msg}`);
    console.log(`  ✗ ${name}\n    ${msg}`);
  }
}

// -------------------- Tests --------------------

console.log('\nexportImage.ts unit tests\n');

console.log('__normalizeColor: oklch → rgb');
test('oklch(0.628 0.258 29.23) ≈ red rgb(255, 0, 0)', () => {
  const out = __normalizeColor('oklch(0.628 0.258 29.23)');
  assertRgbClose(out, { r: 255, g: 0, b: 0 }, 3, 'oklch red');
});

test('oklch(0.5 0 0) is achromatic mid-gray (R≈G≈B)', () => {
  const out = __normalizeColor('oklch(0.5 0 0)');
  const parsed = parseRgb(out);
  assert.ok(parsed, `expected rgb(...), got ${out}`);
  assert.ok(
    Math.abs(parsed!.r - parsed!.g) <= 2 && Math.abs(parsed!.g - parsed!.b) <= 2,
    `channels not equal: ${out}`,
  );
  // 亮度不接近 0 也不接近 255
  assert.ok(parsed!.r > 60 && parsed!.r < 200, `mid-gray out of range: ${out}`);
});

test('oklch(0 0 0) → rgb(0, 0, 0)', () => {
  const out = __normalizeColor('oklch(0 0 0)');
  assertRgbClose(out, { r: 0, g: 0, b: 0 }, 1, 'black');
});

test('oklch(1 0 0) → rgb(255, 255, 255)', () => {
  const out = __normalizeColor('oklch(1 0 0)');
  assertRgbClose(out, { r: 255, g: 255, b: 255 }, 1, 'white');
});

test('oklch(0.628 0.258 29.23 / 0.5) → rgba with alpha 0.5', () => {
  const out = __normalizeColor('oklch(0.628 0.258 29.23 / 0.5)');
  assertRgbClose(out, { r: 255, g: 0, b: 0, a: 0.5 }, 3, 'oklch red @ 0.5');
  assert.ok(out.startsWith('rgba('), `expected rgba(…), got ${out}`);
});

test('oklch with percentage L and C: oklch(62.8% 64.5% 29.23)', () => {
  // 62.8% → 0.628; 64.5% * 0.4 = 0.258 → 应该也是 ~red
  const out = __normalizeColor('oklch(62.8% 64.5% 29.23)');
  assertRgbClose(out, { r: 255, g: 0, b: 0 }, 4, 'oklch red (pct)');
});

test('oklch with deg angle explicit: oklch(0.628 0.258 29.23deg)', () => {
  const out = __normalizeColor('oklch(0.628 0.258 29.23deg)');
  assertRgbClose(out, { r: 255, g: 0, b: 0 }, 3, 'oklch red (deg)');
});

console.log('\n__normalizeColor: oklab → rgb');
test('oklab achromatic (0.5 0 0) equals oklch(0.5 0 0)', () => {
  const a = __normalizeColor('oklab(0.5 0 0)');
  const b = __normalizeColor('oklch(0.5 0 0)');
  assert.equal(a, b, `oklab/oklch achromatic mismatch: ${a} vs ${b}`);
});

test('oklab(0.5 -0.1 0) parses to valid rgb', () => {
  const out = __normalizeColor('oklab(0.5 -0.1 0)');
  const parsed = parseRgb(out);
  assert.ok(parsed, `expected rgb(...), got ${out}`);
  // -a 意味偏绿，G 应大于 R
  assert.ok(parsed!.g > parsed!.r, `expected G > R (偏绿), got ${out}`);
});

console.log('\n__normalizeColor: 非法 / 不支持输入');
test('lab(50% 40 59) 当前不做转换，原样返回', () => {
  const out = __normalizeColor('lab(50% 40 59)');
  assert.equal(out, 'lab(50% 40 59)');
});

test('lch(50% 70 30) 当前不做转换，原样返回', () => {
  const out = __normalizeColor('lch(50% 70 30)');
  assert.equal(out, 'lch(50% 70 30)');
});

test('非现代颜色函数原样返回', () => {
  assert.equal(__normalizeColor('rgb(1,2,3)'), 'rgb(1,2,3)');
  assert.equal(__normalizeColor('#abc'), '#abc');
  assert.equal(__normalizeColor('hello'), 'hello');
});

test('oklch 参数数量不对 → 原样返回', () => {
  const bad = 'oklch(0.5 0.1)';
  assert.equal(__normalizeColor(bad), bad);
});

test('oklch 包含非法数字 → 原样返回', () => {
  const bad = 'oklch(not a number 0 0)';
  assert.equal(__normalizeColor(bad), bad);
});

console.log('\n__replaceModernColorFunctions');
test('linear-gradient 里的两处 oklch 都被替换', () => {
  const input =
    'linear-gradient(oklch(0.628 0.258 29.23), oklch(0.5 0 0))';
  const out = __replaceModernColorFunctions(input, __normalizeColor);
  assert.ok(!/oklch\(/.test(out), `still contains oklch: ${out}`);
  // 两个 rgb(...) 都应出现
  const matches = out.match(/rgba?\(/g) || [];
  assert.ok(matches.length >= 2, `expected >=2 rgb/rgba, got ${matches.length}: ${out}`);
});

test('box-shadow 里的 oklch 被替换', () => {
  const input = '0 0 5px oklch(0.628 0.258 29.23)';
  const out = __replaceModernColorFunctions(input, __normalizeColor);
  assert.ok(!/oklch\(/.test(out), `still contains oklch: ${out}`);
  assert.ok(/rgb\(/.test(out), `no rgb(…): ${out}`);
});

test('没有现代颜色函数时原样返回（no-op）', () => {
  const input = 'linear-gradient(#fff, #000)';
  const out = __replaceModernColorFunctions(input, __normalizeColor);
  assert.equal(out, input);
});

console.log('\npickExportScale');
test('cardH=500 → 2', () => assert.equal(pickExportScale(500), 2));
test('cardH=6000 → 2（边界 6000*2=12000）', () => assert.equal(pickExportScale(6000), 2));
test('cardH=6500 → 1.5', () => assert.equal(pickExportScale(6500), 1.5));
test('cardH=8000 → 1.5（边界 8000*1.5=12000）', () => assert.equal(pickExportScale(8000), 1.5));
test('cardH=10000 → 1', () => assert.equal(pickExportScale(10000), 1));
test('cardH=0 → 2', () => assert.equal(pickExportScale(0), 2));
test('cardH=NaN → 2', () => assert.equal(pickExportScale(NaN), 2));
test('cardH=-100 → 2', () => assert.equal(pickExportScale(-100), 2));

console.log('\ndecodeErrorReason');
test('oklch 错误 → unsupported_color', () => {
  const err = new Error('Attempting to parse an unsupported color function "oklch"');
  assert.equal(decodeErrorReason(err), 'unsupported_color');
});
test('canvas size 错误 → oversize', () => {
  assert.equal(decodeErrorReason(new Error('canvas size exceeds the maximum')), 'oversize');
});
test('writeFile 错误 → io', () => {
  assert.equal(decodeErrorReason(new Error('writeFile permission denied')), 'io');
});
test('未知错误 → unknown', () => {
  assert.equal(decodeErrorReason(new Error('something else')), 'unknown');
});
test('null / undefined → unknown', () => {
  assert.equal(decodeErrorReason(null), 'unknown');
  assert.equal(decodeErrorReason(undefined), 'unknown');
});
test('string 错误 → 能识别', () => {
  assert.equal(
    decodeErrorReason('Attempting to parse an unsupported color function oklch'),
    'unsupported_color',
  );
});

// -------------------- Summary --------------------

console.log(`\n==== ${passed} passed, ${failed} failed ====\n`);

if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
} else {
  process.exit(0);
}
