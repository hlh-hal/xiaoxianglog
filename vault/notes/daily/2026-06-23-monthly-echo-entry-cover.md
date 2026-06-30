# 2026-06-23 月之回响入口页背景修正

## 背景

用户反馈月之回响入口页误用了错误截图，实际入口页应为带有“月之回响 / June / 打开笔记本 / 干花 / 底部祝福”的海报图。

## 改动

- `src/pages/MonthlyEcho.tsx`
  - 入口页改为引用 `/monthly-echo/entrance-cover.png` 静态背景。
  - 入口页单独绕过 `390 × 844` story frame 缩放，使用全屏 slot 渲染，避免左右色差边框。
  - 背景使用 `background-size: 100% 100%`，避免 `cover` 裁剪右侧月亮和竖排文字。
  - 保留底部透明点击热区进入下一页。
- `public/monthly-echo/entrance-cover.png`
  - 使用现有最接近目标图的 `artifacts/monthly-echo-no-topbar-page-1.png` 生成 936 × 1662 高清入口背景图，替换之前错误的页面图。

## 验证

- `cmd.exe /c npm run lint`：通过。
- `cmd.exe /c npm run build`：通过；仅保留既有 Vite 大 chunk 警告。

## 注意

当前静态背景为整图方案，月份文字仍随图片固定；若后续要动态月份，需要改成“高清背景 + DOM 标题文案叠层”的混合方案。
