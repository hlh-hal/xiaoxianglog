# 2026-05-31 设置页账号同步入口调整

## 摘要

- 用户要求从设置页删除“账号同步 / 立即同步账号日志”入口，因为账号多端同步应作为默认能力，不需要用户手动确认。
- 已在 `src/pages/Settings.tsx` 删除手动同步按钮、对应 `handleManualCloudSync` 处理函数和未使用的 `RefreshCw` 导入。
- 未改动底层 `diaryService.syncCurrentAccount()`，登录和恢复会话后的自动同步仍由 `src/contexts/AuthContext.tsx` 触发。

## 验证

- `npm run lint`
- `npm run build`
- Puppeteer 移动视口打开 `http://127.0.0.1:3000/settings`，确认页面文本不再包含“账号同步”或“立即同步账号日志”，且“本地日志”和“设置”仍存在。

## 后续提示

- 后续如果优化账号同步体验，应优先保留自动同步模型，不要重新把手动确认入口放回设置页。
