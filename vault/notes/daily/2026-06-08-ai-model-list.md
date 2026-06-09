# 2026-06-08 AI model list

## 背景

用户反馈 `LongCat Lite` 和 `LongCat Thinking` 两个模型已下架，暂时不提供，要求前端不再显示这两个模型，只显示小米模型，并上传到云端服务器。

## 改动

- `src/pages/AIChat.tsx` 的 `MODEL_LIST` 只保留 `Xiaomi MiMo`。
- 旧用户如果本地 `preferred_ai_model` 仍保存 LongCat 模型，进入 AI 聊天页时会自动回写为 `xiaomi-mimo`，避免隐藏后仍继续请求已下架模型。
- 本次只改前端和上传前端 `dist/`，没有上传或重启后端。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过，生成 `assets/index-firbr2UU.js` 和 `assets/index-BRDChRpq.css`。
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`：20/20 前端文件上传 OK。
- 线上 `https://www.xiaoxianglog.cn/` 已引用 `assets/index-firbr2UU.js` 和 `assets/index-BRDChRpq.css`。
- 远端 JS 检查：包含 `Xiaomi MiMo`，不包含 `LongCat Lite`、`LongCat Thinking` 或 `LongCat-Flash`。
- 线上 `/api/health` 返回 `build=cpamc-only-20260520`，本次未涉及后端运行时变更。

## 2026-06-08 mobile model sheet spacing

用户反馈手机端 LongCat 已不显示，但模型选择页只剩一个模型后显得局促。继续调整 `src/pages/AIChat.tsx` 的模型选择 Bottom Sheet：

- 增加顶部拖拽柄。
- Sheet 最小高度改为 `236px`，底部使用 `max(var(--app-safe-bottom), 20px)`。
- 移除标题下方硬分割线，单模型选项改为 `72px` 高的圆角卡片，增加左右内边距、浅背景和选中边框。
- 保持只显示 `Xiaomi MiMo`，没有新增说明文案。

验证与部署：

- `npm run lint`：通过。
- `npm run build`：通过，生成 `assets/index-BM_8_9Qs.js` 和 `assets/index-D6zG-Jyj.css`。
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front`：20/20 前端文件上传 OK。
- 线上 `https://www.xiaoxianglog.cn/` 已引用新 JS/CSS；远端 JS 包含 `236px`、`72px`，不包含 `LongCat Lite` 或 `LongCat Thinking`。
- 线上 `/api/health` 仍为 `build=cpamc-only-20260520`，本次未涉及后端运行时变更。
