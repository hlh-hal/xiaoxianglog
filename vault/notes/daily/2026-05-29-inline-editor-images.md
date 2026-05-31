# 2026-05-29 编辑器图片插入正文开关

## 来源

用户希望在设置中增加一个开关：开启后，编辑器上传图片时图片出现在当前光标的下一行，而不是只追加到正文末尾的默认图片区。同步到日志圈仍保持原有逻辑，图片继续按默认附件图片区发布，不改变社区图片数组。

## 结论

- 新增 `app_settings.inlineImagesInEditor`，默认 `false`，设置页「编辑」区域显示「图片插入正文」开关。
- 开启后，上传图片仍会追加到 `images` 数组，同时在 Tiptap 正文中插入 `diaryInlineImage` block 节点，保存进 `content`。
- 2026-05-30 补充：插入位置按当前光标所在行判断；当前段落有文字时图片插入到下一行，当前段落为空行时图片直接替换该空行。
- 2026-05-30 补充：进一步细化为按段落内光标位置处理；文字中间插入会把段落切成上文、图片、下文，图片下方不创建空行；只有光标在段落末尾插入时才追加一个空段落给继续输入。主编辑器关闭 `StarterKit.trailingNode`，避免图片在空行/文首插入后被自动补尾随空段落。
- 编辑页底部默认图片区会过滤已经以内联方式展示的图片，避免同一张图在编辑页重复显示。
- 2026-05-30 补充：正文内联图片按原图比例完整展示，`height: auto` + `object-fit: contain`，不再使用固定 4:3 裁切。
- 2026-05-30 补充：点击正文内联图片会显示悬浮图标工具条，支持完整/小图等比例切换、复制到系统剪贴板、删除正文图片节点。删除只移除 `content` 中的节点，不删除 `images` 附件数组。
- 日志圈发布仍读取 `images` 数组上传，未改 `uploadCommunityImages` 和社区发布 payload。

## 相关文件

- `src/services/settingsService.ts`
- `src/pages/Settings.tsx`
- `src/pages/Editor.tsx`
- `src/index.css`

## 验证

- `npm run build`
- Puppeteer 烟测：设置 `inlineImagesInEditor=true` 后打开 `/editor`，上传测试图片，确认 `.ProseMirror img[data-diary-inline-image]` 数量为 1，底部默认附件预览数量为 0。
- 2026-05-30 `npm run build` 验证完整展示样式改动可正常打包。
- 2026-05-30 Puppeteer 烟测：上传内联图片后点击图片，确认工具条出现；点击缩小后 `data-display-size="small"`；点击删除后正文内联图片数量为 0。复制按钮在 headless 环境中执行无页面错误。
- 2026-05-30 Puppeteer 烟测：有文字段落上传后 DOM 顺序为 `<p>text line</p><img...`；空段落上传后 DOM 直接以 `<img...` 开头。
- 2026-05-30 Puppeteer 烟测：中间插入为 `<p>hello </p><img><p>world</p>`；末尾插入为 `<p>hello</p><img><p><br></p>`；空行插入为 `<img>`；段首插入为 `<img><p>hello</p>`；点击图片工具条并缩小仍通过。
- 成功截图：`inline-image-editor-success.png`

## 下次提示

如果后续要让历史图片也能移动到正文中间，需要补“把已有附件图插入/移出正文”的交互；本次只影响新上传图片。删除正文内联图片目前属于编辑器内容删除，不会自动从 `images` 附件数组移除，避免误伤日志圈/图库附件。复制图片依赖浏览器 ClipboardItem 图片写入能力，不支持时只给 toast，不做文本降级。

## 2026-05-30 inline image preview button

- Added a preview button to the inline image floating toolbar, ordered as resize/copy/preview/delete.
- The preview button uses the existing ImageViewer flow. If the inline image src exists in the attachment `images` array, it opens that index; otherwise it opens a temporary single-image preview via `previewImagesOverride`.
- Closing or leaving `#preview` clears the temporary override, and opening preview closes the inline toolbar.
- Fixed a Tiptap `editor.setOptions` regression where refreshed `editorProps` dropped inline-image click handlers; the click handlers are now preserved in both the initial editor config and the later dynamic props update.
- While verifying, several previously corrupted Chinese string literals in `src/pages/Editor.tsx` had to be repaired because they broke Vite parsing after the file was touched.

Verification:

- `npm run build` passed.
- Puppeteer smoke on `/editor?id=welcome-diary-001`: enabled inline image setting, uploaded an inline SVG image, clicked the inline image, confirmed toolbar buttons `[inline-image-resize, inline-image-copy, inline-image-preview, inline-image-delete]`, clicked preview, confirmed `location.hash === "#preview"` and the ImageViewer rendered blob image content.
- Success screenshot: `codex-inline-image-preview-success.png`.

## 2026-05-30 preview regression repair

- Fixed an inline image preview state race: preview state was cleared before the route hash changed to `#preview`, so the URL changed but `ImageViewer` did not render.
- Moved editor ImageViewer rendering through `createPortal(..., document.body)` so inline-image preview always uses the same full-screen black overlay as gallery/community preview.
- Added selection-update fallback: when ProseMirror selects a `diaryInlineImage` through its default node-selection path, the floating toolbar is shown even if the custom click handler is bypassed.
- Repaired user-visible mojibake introduced in `Editor.tsx` labels/date format strings and restored the welcome diary seed text in `App.tsx`.
- Added automatic cleanup for a local `welcome-diary-001` that was damaged by smoke tests: empty content, inline test images, attachment images, or old mojibake content are reset to the normal welcome entry.

Verification:

- `npm run build` passed.
- Puppeteer smoke on a temporary new editor page: uploaded an inline image, clicked it, opened preview, confirmed `location.hash === "#preview"` and full-screen viewer class `fixed inset-0 z-[200] bg-black/95` with one image covering the viewport.
- Welcome diary smoke: top date text is normal Chinese and the body content is restored with no inline test images.
- Success screenshot: `codex-inline-fullscreen-preview-fixed.png`.

## 2026-05-30 frontend cloud deploy

- User requested uploading the latest two editor/image-preview fixes to the cloud server.
- Built frontend with `npm run build` and uploaded only frontend `dist` via `deploy-upload.ps1 -Target front`.
- Upload target used the existing FTP deploy flow and completed successfully for 17 files.
- Live verification: `https://www.xiaoxianglog.cn/` and `/gallery` returned 200 and referenced `assets/index-DdS74eTx.js` plus `assets/index-CzNGCbpK.css`.
- Remote JS/CSS SHA256 matched local `dist` hashes, confirming the deployed assets are the newly built frontend.
