# 2026-06-10 Android 发布 Skill 优化

## 背景

用户反馈使用 `xiaoxiang-android-release` 后处理时间偏长，且线上下载链接仍是 `1.0.6`，手机端没有更新提示。

排查结果：

- 本地 `android/app/build.gradle`、`src/config/appRelease.ts`、`public/app-update.json`、`docs/app-update.json` 均为 `1.0.6 / versionCode 7`。
- 自有服务器 `https://xiaoxianglog.cn/app-update.json` 返回 `1.0.6 / versionCode 7`。
- GitHub Pages `app-update.json` 返回 `1.0.6 / versionCode 7`。
- 自有服务器 APK 地址可访问，但 HEAD 只能证明文件存在，不能证明 APK 内部版本；后续必须下载线上 APK 并用 `aapt dump badging` 验证。

## 已优化 Skill

目录：`C:\Users\ASUS\.codex\skills\xiaoxiang-android-release`

改动：

- `SKILL.md` 改为“快速自动发布”：先完成自有服务器 APK 和更新 manifest 这条用户主链路，再做 GitHub Release 备用镜像。
- 新增硬门槛：如果线上下载 APK 或线上 manifest 仍是旧版本，不能报告发布完成。
- 新增 `scripts/release_preflight.py`，用于发布前快速读取本地和线上版本，并建议下一版。
- `references/release-workflow.md` 增加 preflight、线上 APK 版本验收、自有服务器 manifest 验收和“下载链接仍是旧版本”的故障说明。
- `agents/openai.yaml` 展示文案改为快速发布并验证。

## 验证

已运行：

```powershell
$env:PYTHONUTF8='1'
python C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\scripts\release_preflight.py --project D:\小象日志
python C:\Users\ASUS\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\ASUS\.codex\skills\xiaoxiang-android-release
```

结果：

- Skill 校验通过。
- Preflight 当前建议下一版为 `1.0.7 / versionCode 8`。

## 后续提醒

如果用户手机已经是 `1.0.6`，远端仍为 `1.0.6 / 7` 时不会弹更新提示；必须发布 `1.0.7 / 8` 或更高版本，并确认自有服务器 APK 也已经被覆盖成新 APK。
