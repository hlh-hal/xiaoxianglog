# 2026-06-09 Android 发布 Skill

## 背景

用户希望把“功能改进后打包并推送到用户端”的 Android 发布流程沉淀成 Codex skill，后续可以一句话触发，避免重复踩版本号、签名、更新公告、服务器上传和 GitHub Pages/Release 的流程坑。

## 已创建

- Skill 目录：`C:\Users\ASUS\.codex\skills\xiaoxiang-android-release`
- 主文件：`SKILL.md`
- UI metadata：`agents/openai.yaml`
- 详细流程参考：`references/release-workflow.md`

## 默认能力

- 触发语包括“发布小象日志安卓版”“打包推送到用户端”“发一个 Android 新版本”“更新 APK 并让首页弹更新公告”等。
- 默认执行全自动生产发布：递增版本、更新公告、构建同步、正式签名、上传自有服务器、更新 GitHub Pages、创建 GitHub Release 备用镜像并验证。
- 主下载仍为 `https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 不在 skill 或 vault 中保存 keystore、签名密码、FTP 密码或 token。

## 验证

- 使用 `PYTHONUTF8=1` 运行 `quick_validate.py` 通过。
- 已用 UTF-8 读取检查 `SKILL.md`、`agents/openai.yaml`、`references/release-workflow.md` 内容正常。

## 后续用法

后续可以直接对 Codex 说“发布小象日志安卓版”或“用 xiaoxiang-android-release 打包推送到用户端”。

## 2026-06-10 优化

用户反馈首次使用后处理时间偏长，且线上下载链接仍停留在 `1.0.6`，手机端没有更新提示。

已将 skill 改为“快速自动发布”：先完成自有服务器 APK 和更新 manifest 这条用户主链路，再做 GitHub Release 备用镜像。新增 `scripts/release_preflight.py`，发布前读取本地和线上版本并给出下一版建议；新增硬门槛，要求线上 APK 下载后用 `aapt dump badging` 验证为目标版本，否则不能报告发布完成。

当前 preflight 结果显示本地、服务器和 GitHub Pages 都是 `1.0.6 / versionCode 7`，因此下一次应发布 `1.0.7 / versionCode 8` 或更高版本。
