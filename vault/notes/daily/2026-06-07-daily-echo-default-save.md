# 2026-06-07 Daily Echo Default Save

## Summary

- Changed Daily Echo so generated echo content is saved into the current diary by default instead of requiring the user to tap "收进这篇".
- The floating echo card now shows the primary "保存图片" action for draft/saved echo states, and no longer shows the "收进这篇" button.
- `handleSaveDailyEchoImage` now tolerates a draft echo by saving it first, then rendering/exporting the image.

## Files

- `src/components/DailyEchoCard.tsx`
- `src/pages/Editor.tsx`

## Verification

- `npm run lint`
- `npm run build`

## Cloud Deploy

- Deployed frontend only with `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`.
- First FTP upload completed the new HTML/JS/CSS but failed once on `icons/xiaoxiang-echo-mascot-float.png`; reran the same command and all 19/19 files uploaded OK.
- Live homepage references:
  - `assets/index-B_kgayPO.js`
  - `assets/index-CnskmKfg.css`
- Remote JS/CSS SHA256 matched local `dist/`:
  - JS `2F6A571556A10DA3E12CF6F6504E243400E9E1A28A83BFFAD688189366EAC2F8`
  - CSS `2AF189E47DD9C83FD54926AD865059C02588A9AF4558CE01E5608D3D5C63883B`
- `https://www.xiaoxianglog.cn/api/health` returned `build: cpamc-only-20260520`, `pid: 2984`.

## Notes

- `src/pages/Editor.tsx` already had unrelated writing-time stats edits in the working tree; they were left untouched.
- This was a frontend-only deploy; backend was not uploaded or restarted.
