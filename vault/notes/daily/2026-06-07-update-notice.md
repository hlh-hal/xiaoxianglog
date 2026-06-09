# 2026-06-07 update notice

## Background

User wanted an in-app update announcement before packaging a new APK. The app previously had silent PWA service worker refresh behavior, but no user-facing release notes or persistent update entry.

## Changes

- Added `src/config/appRelease.ts` as the static release source for current version, latest version, release date, update highlights, fixes, and the future APK/download URL.
- Added `src/services/updateNoticeService.ts` for version comparison, one-time auto prompt state, skipped-version state, and download URL lookup.
- Updated `src/components/Layout.tsx` so the home page auto-opens a "发现新版本" modal once per release and shows a persistent update banner until the user skips the version.
- Update notice UI is gated by `Capacitor.isNativePlatform()`, Android platform, and a `xiaoxianglog.cn` hostname blocklist. Normal Web/PWA pages must not show the modal or persistent banner. This feature is for APK/native app update downloads only.
- The update button opens `latestRelease.downloadUrl` when configured. While empty, it shows the toast: "新版下载地址还没配置好，稍后再来看看。"

## Validation

- `npm run lint`
- `npm run build`
- Local Chrome/Puppeteer Web check confirmed normal browser pages do not show "发现新版本" or the update banner.
- 2026-06-07 follow-up: user saw the banner on `https://www.xiaoxianglog.cn`, so `Layout.tsx` now has a stronger domain guard and JSX-level guard. If the live site still shows it, redeploy the latest front-end build and clear browser/service-worker cache.

## Cloud Deploy

- 2026-06-07 deployed frontend only with `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`.
- FTP upload completed 19/19 files to `/dist`; backend was not uploaded or restarted.
- Online HTML now references `https://www.xiaoxianglog.cn/assets/index-C2NysrkE.js` and `assets/index-CnskmKfg.css`.
- Online Puppeteer check passed: `https://www.xiaoxianglog.cn/` no longer contains "发现新版本" or "查看更新内容".
- `/api/health` remains healthy with `build: cpamc-only-20260520`, `pid: 2984`.

## Next Handoff

When the APK or download page is ready, update only `latestRelease.downloadUrl` in `src/config/appRelease.ts`. For each future release, bump `latestRelease.version`; previously skipped/prompted localStorage state is version-specific, so users will see the next release again.

## 2026-06-08 Android APK + GitHub Pages follow-up

- Current PWA `dist` was newer than Android assets and the desktop APK, so the Android package was resynced with `npm run android:sync`.
- Android release metadata was bumped to `versionCode 2` / `versionName 1.0.1` in `android/app/build.gradle`.
- `src/config/appRelease.ts` now uses `currentVersion 1.0.1`, `currentVersionCode 2`, and defaults the remote update manifest to `https://hlh-hal.github.io/xiaoxianglog/app-update.json`.
- `src/services/updateNoticeService.ts` now fetches the remote JSON manifest with no-cache, normalizes both `versionName/apkUrl/changes` and `version/downloadUrl/highlights` shapes, and falls back to bundled release info if the remote fetch fails.
- Skipping a release now suppresses only the auto modal; `shouldShowUpdateEntry()` still returns true for available updates so the home update/download entry can remain visible.
- Added `public/app-update.json` and `docs/app-update.json` for the current release manifest.
- Added `docs/index.html` as the GitHub Pages static download/feature site. It links to `https://github.com/hlh-hal/xiaoxianglog/releases/latest/download/xiaoxiang-log-latest.apk`.
- Built and signed `C:\Users\ASUS\Desktop\xiaoxiang-apk\xiaoxiang-log-latest.apk` with the existing release keystore. Verification passed with APK Signature Scheme v2/v3, package `com.xiaoxiang.diary`, `versionCode 2`, `versionName 1.0.1`.
- `gh` CLI was installed, but `gh auth status` reports not logged in. GitHub Pages/Release deployment still needs `gh auth login`, a commit/push of only the intended files, enabling Pages from `main / docs`, and uploading the APK as a Release asset named `xiaoxiang-log-latest.apk`.
