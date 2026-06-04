# 2026-06-03 Home image radius deploy

## Change
- User asked to weaken the border radius of home page images.
- Updated `TimelineList` and `CardFlowList` image thumbnails from `rounded-[16px]` to `rounded-[10px]`.
- Scope: home timeline and card-flow image grids.

## Verification
- `npm run lint` passed before deploy.
- Deployed frontend with `cmd /c deploy.bat front`.
- New online frontend entry:
  - `/assets/index-Bis_WLzV.js`
  - `/assets/index-Bxz_dyHy.css`
- Online checks:
  - `https://47.122.112.242/` returned 200 and references `index-Bis_WLzV.js`.
  - `https://47.122.112.242/api/health` returned `build: cpamc-only-20260520`.
