# 2026-06-10 Android 发布 Skill 改为自有服务器默认路径

## 背景

用户反馈使用 `xiaoxiang-android-release` skill 时处理时间偏长，且不希望默认同步推送 GitHub；同时反馈当前 Android 端没有弹出更新提示。

## 处理

- 已修改 `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\SKILL.md`：默认发布路径改为只走自有服务器 `xiaoxianglog.cn`，不再自动同步 GitHub Pages / GitHub Releases。
- 已修改 `references/release-workflow.md`：GitHub 只作为用户明确要求时的备用镜像流程。
- 已修改 `scripts/release_preflight.py`：默认只检查本地版本、自有服务器 `app-update.json` 和自有服务器 APK HEAD；新增 `--include-github` 参数用于显式检查 GitHub 镜像。
- 已更新 `agents/openai.yaml` 的展示说明，强调“自有服务器发布”。

## 验证

- `quick_validate.py C:\Users\ASUS\.codex\skills\xiaoxiang-android-release` 通过。
- 默认 preflight 输出不再包含 GitHub Pages 检查。
- `--include-github` 仍可显式检查 GitHub Pages manifest。

## 更新提示排查结论

当前线上自有服务器：

- `https://xiaoxianglog.cn/app-update.json` 返回 `versionName 1.0.8` / `versionCode 9`。
- `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk` 下载后用 `aapt dump badging` 检查也是 `versionName 1.0.8` / `versionCode 9`。

Android 更新提示只会在远端 `versionCode` 大于用户手机中已安装 APK 内置 `currentVersionCode` 时出现。如果用户手机已经是 `1.0.8 / 9`，不弹更新提示是预期行为。下一次需要发布 `1.0.9 / versionCode 10` 才能再次触发。

如果用户手机低于 `1.0.8` 但仍不显示，优先排查 App 本地状态 `xiang_update_notice_prompted_version` / `xiang_update_notice_skipped_version`，或者确认该旧版 APK 是否仍使用早期 GitHub 更新地址。

## 1.0.7 未弹更新的进一步定位

2026-06-10 用户确认手机安装的是 `1.0.7`，但首页没有弹出 `1.0.8` 更新提示。排查发现：

- `https://xiaoxianglog.cn/app-update.json` 线上返回 `1.0.8 / versionCode 9`，版本判断本身满足更新条件。
- `curl -I -H "Origin: capacitor://localhost" https://xiaoxianglog.cn/app-update.json` 没有返回 `Access-Control-Allow-Origin`。
- `curl -I -H "Origin: capacitor://localhost" https://xiaoxianglog.cn/api/health` 会返回 `Access-Control-Allow-Origin: capacitor://localhost`。

结论：1.0.7 很可能在 Android WebView 中请求静态 `/app-update.json` 时被 CORS 拦截，导致只能回退到内置 `1.0.7` 配置，所以不显示更新。

已做本地修复：

- `src/services/updateNoticeService.ts` 增加 Capacitor 原生 HTTP 兜底：浏览器 `fetch` 失败后，Android/iOS 原生环境改用 `CapacitorHttp.get()` 拉取更新清单，避免后续版本继续被 CORS 卡住。
- `deploy/nginx/xiaoxiang-reverse-proxy.conf` 增加 `location = /app-update.json` 的 CORS 和 no-cache 响应头模板。
- `npm run lint` 通过。

剩余线上动作：

- 需要在宝塔/Nginx 实际站点配置中应用 `/app-update.json` 的 CORS 规则并 reload Nginx。模板文件改动不会自动影响线上 Nginx。
- 应用后用 `curl -I -H "Origin: capacitor://localhost" https://xiaoxianglog.cn/app-update.json` 验证出现 `Access-Control-Allow-Origin`。
