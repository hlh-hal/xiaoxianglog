# 2026-06-05 sync local-image fallback follow-up

## Context

After the initial `/api/sync/push` 500 hardening, the user still saw phone-local diary counts higher than desktop/server counts. The leaderboard mismatch points to the same root sync path: phone-local entries were not reaching the server.

## Root cause refinement

Old or mobile entries can contain local-only `data:image/` assets. The older backend runtime rejects those entries as `invalid_entry`, which prevents the text/date from being created in cloud storage. That makes phone-local diary counts larger than server leaderboard counts.

## Code changes

- `server/src/routes/sync.ts`: `syncImageArray` now filters out `data:image/` items instead of rejecting the whole entry. Text, date, status, visibility, and other metadata still sync.
- `src/services/diaryService.ts`: if image upload fails before push, the client strips local-only images and `dailyEcho.card.localDataUrl`, stores that fallback entry locally, and continues pushing the text entry.
- `tests/sync-push-regression.test.ts`: the invalid-image regression now expects the entry to be created with `images=null`, and verifies following valid entries are not blocked.

## Validation

- `npx tsx tests/sync-push-regression.test.ts` passed. The Prisma `P2002` log in this test is intentional and verifies duplicate-id recovery.
- `npm run lint` passed.
- `npm run build` passed.
- `cd server && npm run build` passed.
- `git diff --check` passed with Windows line-ending warnings only.

## Deploy state

- Frontend is live with `/assets/index-BTEC-WA6.js`.
- Remote `/xiaoxiang-server/dist/routes/sync.js` was manually uploaded and downloaded back for verification. It contains the new `data:image/` filter and no longer contains the old `Images must be uploaded before sync` throw.
- Runtime has not reloaded yet: `/api/health` still reports pid `6724`.
- A controlled hidden `/api/sync/push` probe with a `data:image/` entry still returned `skipped/invalid_entry`, proving the running Node process is still old. No probe entry was created.

## Required next action

Restart the Node project at `C:\wwwroot\xiaoxiang-server` from BT/server terminal. After pid changes, rerun the hidden data-image probe; expected result is `created`, followed by immediate permanent cleanup. Then ask the phone user to fully close/reopen the PWA so the real local 06-03/06-04 entries push to cloud, and verify desktop/leaderboard counts.

## 2026-06-05 post-restart probe

- After the first user restart, `/api/health` pid changed from `6724` to `3020`, confirming the restart happened.
- The hidden data-image sync probe still returned HTTP 500 `同步失败`. A follow-up `/api/sync/pull` search found no leftover probe entries.
- Likely cause: the entry create path can still fail after main diary creation when `saveEditHistorySnapshot` touches a production history table/schema that is not aligned. This should not block sync.
- New patch: `server/src/routes/sync.ts` now wraps sync edit-history snapshot writes in `saveSyncHistorySnapshot`, logs a warning, and keeps the main sync response successful.
- Validation passed again: `npx tsx tests/sync-push-regression.test.ts` and `cd server && npm run build`.
- Deploy status: remote `/xiaoxiang-server/dist/routes/sync.js` was uploaded and pulled back for verification. It contains both the `data:image/` filter and `saveSyncHistorySnapshot`, and still does not contain the old `Images must be uploaded before sync` throw.
- Required next action: restart the Node project again so pid changes from `3020`, then rerun the hidden probe.

## Failure lessons

- Do not treat a local passing test as proof of production sync safety when Prisma schema/client may differ. Local tests used a generated client that already knew `DiaryEntry.dailyEcho`; production still used an older generated client and rejected `dailyEcho`.
- A backend file upload is not a deploy by itself. After FTP upload, always verify the running process changed with `/api/health` pid before assuming new code is live.
- For Prisma model changes, `db:push` and `db:generate` are both required. `db:push` can succeed while `db:generate` fails, leaving the database updated but the running/generated client stale.
- On Windows servers, Prisma generate can fail with `EPERM rename query_engine-windows.dll.node` if any `node.exe` still holds the DLL. Checking only `netstat :3001` is not enough; also run `wmic process where "name='node.exe'" get ProcessId,CommandLine` and kill the matching `npm start` / `node dist/index.js` processes before `npm run db:generate`.
- Browser console 500 messages are only the symptom. The decisive evidence came from the server log: `Unknown argument dailyEcho` inside `prisma.diaryEntry.update()`. For sync 500s, always collect server-side Prisma stack traces before adding more frontend retries.
- Optional metadata must never block diary core sync. Fields like `dailyEcho` and edit history snapshots should be best-effort/compatible, while content, date, status, visibility, and images fallback remain the main sync contract.
- For future production fixes, use this sequence: upload files, stop backend, run `npm run db:push`, run `npm run db:generate`, confirm generate success, start backend, confirm `/api/health` pid changed, then run a hidden `/api/sync/push` probe and clean it up.

## Final verification

- After `db:push`, `db:generate`, and backend restart, `/api/health` returned pid `5704`.
- Hidden `/api/sync/push` probe with `data:image/` and `dailyEcho=null` returned `created`; the probe was immediately permanently deleted and did not remain in `/api/sync/pull`.
- Real account cloud data now contains active `2026-06-03` and `2026-06-04` entries.
- Leaderboard API returns current user `hulianghal` with `monthCount=4`, `likes=2`.
- Frontend leaderboard bug found during verification: `src/pages/Leaderboard.tsx` overwrote the server current-user `monthCount` with local IndexedDB month count. In a clean browser, local DB only had a temporary/default entry, so UI showed `1 篇` while API returned `4`. Fixed by trusting server `monthCount` whenever `/leaderboard` returns data; local month count is now only fallback when the server list is empty.
- Frontend redeployed with `/assets/index-D39ULhLw.js`; online HTML references the new bundle and the JS asset returns 200.
- Success screenshots:
  - `artifacts/sync-home-success-2026-06-05.png`
  - `artifacts/sync-leaderboard-success-2026-06-05.png`

## Leaderboard friend count follow-up

- New symptom: current user's own leaderboard count was correct at `4`, but accepted friends could still show fewer diary days than their own phone profile, e.g. a friend's profile showed "本月 2 篇" while another user's leaderboard saw `0 篇`.
- Root cause: `/api/leaderboard` counted only cloud entries with `status='active'` and `isHidden=false`. Profile stats count the current user's local active diary days, including private/hidden entries. Hidden diary days were therefore excluded from friends' leaderboard aggregate counts.
- Product decision: leaderboard `monthCount` should count active diary days for accepted friends/self, including private/hidden entries, but only as aggregate metadata. The query must continue selecting only `userId` and `diaryDate`, never content, title, images, or hidden flags.
- Code change: `server/src/routes/leaderboard.ts` now builds the month-entry query without `isHidden`, and extracts `countDiaryDaysByUser` so the unique-day behavior is regression-tested. Same-day multiple entries still count as one day; deleted/trashed entries remain excluded through `status='active'`.
- Regression: `tests/leaderboard-monthly-reset.test.ts` now asserts the leaderboard where-clause has no `isHidden` key and verifies unique-day counts.
- Local validation passed:
  - `npx tsx tests/leaderboard-monthly-reset.test.ts`
  - `npm run lint`
  - `npm run build`
  - `cd server && npm run build`
  - `git diff --check` passed with line-ending warnings only.
- Deploy blocker: current environment can reach HTTPS health, but FTP data connections to `47.122.112.242:21` are timing out. Full backend upload timed out, passive single-file upload timed out, active FTP single-file upload failed with `0 out of 10224 bytes`, and .NET active FTP timed out during data-stream setup. Do not restart the backend until `C:\wwwroot\xiaoxiang-server\dist\routes\leaderboard.js` is confirmed non-empty and updated on the server.
- Required next action: upload local `server/dist/routes/leaderboard.js` and `server/src/routes/leaderboard.ts` through BT file manager or a working FTP/SFTP channel, then restart Node and verify `/api/health` pid changes from `5704`. After restart, verify `/api/leaderboard` shows the friend's hidden/private active diary days in `monthCount` and save `artifacts/leaderboard-friend-count-success-2026-06-05.png`.

## Leaderboard post-restart verification

- User restarted the backend; `/api/health` pid changed from `5704` to `7128`.
- Authenticated `/api/leaderboard` works after restart, so the remote `dist/routes/leaderboard.js` was not left as a broken zero-byte runtime file.
- Controlled hidden-entry probe proved the new leaderboard code is live:
  - Before probe: current user `monthCount=4`.
  - Hidden active June probe pushed through `/api/sync/push`: `created`.
  - After probe: current user `monthCount=5`.
  - Probe permanently deleted through `/api/diary/entries/:id/permanent`: HTTP 200.
  - After cleanup: current user `monthCount=4`.
- Therefore the friend-count code path now includes private/hidden active diary days. If a friend such as `木立十` still shows `0` while their phone profile shows `本月 2 篇`, those two entries are not present in cloud as active June diary days for the server to count. Next diagnostic should happen on that user's phone/account sync path, not the leaderboard filter.
