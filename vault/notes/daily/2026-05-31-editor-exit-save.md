# 2026-05-31 PWA 编辑退出即保存 P0 修复

## 背景

- 用户反馈 PWA 网页里写完日志退出后日志消失，编辑记录也没有。
- 另一位用户反馈编辑一半切到图库查图片文字，再切回编辑界面闪退到首页，正文丢失，但编辑记录可还原。
- 根因定位：`Editor.tsx` 原先只有保存按钮和顶部返回按钮会写正式 `entries`；`visibilitychange` / `pagehide` 只给已有日志写编辑记录。新日志没有 `entryId`，切后台时连编辑记录也无法落地。

## 改动

- `src/pages/Editor.tsx` 新增统一 `persistCurrentEntry()`，定时保存、返回保存、切后台保存、pagehide/freeze/unmount 保存都走同一条正式日记落库路径。
- 新日志进入编辑后预分配稳定 id 和 diaryDate，autosave/pagehide 重复触发不会创建重复日志。
- 有文字或图片时持续保存到 IndexedDB；空内容或纯模板不会创建新日志。
- 已有日志编辑时 pagehide 会更新正式日志，同时保留可恢复的历史快照。
- `saveOnExit=false` 只影响用户主动点返回时是否弹放弃确认；PWA 生命周期事件仍强制安全落盘。
- `src/services/diaryService.ts` 给 `createEntry` / `updateEntry` 增加保存选项，默认行为不变；autosave 可跳过重复历史快照，退出/手动保存仍可保留历史。
- 新增 `tests/editor-exit-save.test.ts` 和 `npm run test:editor-exit-save`，用真实 Chromium + IndexedDB 验证退出保存链路。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过，仅保留既有 chunk-size / dynamic-import warning。
- `npm run test:editor-exit-save` 通过，覆盖：
  - 新日志不点保存也会 autosave 到正式 entries。
  - 新日志输入后立即 pagehide 也能落库，并且回首页能看到。
  - 已有日志 pagehide 后正式内容更新，编辑历史仍可恢复旧内容。
  - 多次 autosave/pagehide 不重复创建日志。
  - 只有图片、没有文字的新日志也会保存。

## 云端发布

- 2026-05-31 已从干净临时 worktree `fb14346` 构建并通过 FTP 上传前端 `dist` 到云端服务器。
- 线上首页和 `/editor` 均返回 200，并引用新产物 `assets/index-1belqYpX.js` / `assets/index-LLVGRuV-.css`。
- 远端 JS SHA256 与本地构建一致：`351CA0F96347E693AA9F92207B2FA69239FD08E9A545570F92784F7CDAEA3740`。
- 远端 CSS SHA256 与本地构建一致：`5384923455145B5B364BEF46A9B8B3D279B3313722634186F0AD6D93DABFC8A8`。
- `/api/health` 返回 `build:"cpamc-only-20260520"`，后端本次未改动、不需要重启。

## 后续提示

- 如果后续调整编辑器、Tiptap 图片、PWA 生命周期或 `diaryService` 保存逻辑，必须重跑 `npm run test:editor-exit-save`。
- 这次修复只处理 PWA/web 端数据安全，没有扩展 Android native 行为。
