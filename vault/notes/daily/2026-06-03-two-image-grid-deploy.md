# 2026-06-03 Two-image grid deploy

## Background
- User found that 2-image home cards were still too large.
- Root cause: `TimelineList` and `CardFlowList` still used `grid-cols-2` when `validImages.length === 2`.

## Change
- Updated `TimelineList` and `CardFlowList` so 1, 2, and 3 images all use `grid-cols-3` square cells.
- 4 images still use `grid-cols-2`.
- Image gap remains `gap-1.5`.

## Verification
- `npm run lint` passed.
- Deployed frontend with `cmd /c deploy.bat front`.
- New online frontend entry:
  - `/assets/index-DkUu5tmt.js`
  - `/assets/index-CGAJ-3DN.css`
- Online checks:
  - `https://47.122.112.242/` returned 200 and references `index-DkUu5tmt.js`.
  - `https://47.122.112.242/api/health` returned `build: cpamc-only-20260520`.
