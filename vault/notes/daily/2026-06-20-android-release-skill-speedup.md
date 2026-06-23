# 2026-06-20 Android 发布 Skill 提速复盘

## 背景

用户反馈 v1.0.15 打包推送处理约 19 分钟，发布成功但整体耗时偏长。

## 主要耗时

- `npm run lint` 约 30 秒。
- `npm run android:sync` 约 17 秒。
- `android\gradlew.bat assembleRelease` 约 52 秒。
- `deploy-upload.ps1 -Target front` 约 60 秒。
- APK 上传和公网验收约 10 秒。

这些硬耗时合计约 3 分钟左右，剩余主要来自流程开销：手写签名/FTP 命令、一次 FTP 参数解析失败、重复预检、读大文件交接、处理 vault 编码匹配失败等。

## Skill 优化

- 重写 `xiaoxiang-android-release/SKILL.md` 为快路径版本，强调 5-8 分钟目标、只走自有服务器、只在必要时跑额外测试。
- 重写 `references/release-workflow.md`，加入时间预算、跳过条件、UTF-8 manifest 检查、最终验收脚本。
- 新增 `scripts/sign_release.ps1`：自动 zipalign + apksigner，运行时读取本机 keystore 信息，不在 skill 保存密码。
- 新增 `scripts/upload_apk.ps1`：自动从项目部署脚本读取 FTP 配置并上传到两个服务器 APK 路径，不输出密码。
- 新增 `scripts/verify_public_release.ps1`：自动校验公网 APK HEAD/range、下载哈希、`aapt` 版本包名、线上 `app-update.json`。
- 修正 `agents/openai.yaml` 中文乱码。

## 验证

- `$env:PYTHONUTF8='1'; python C:\Users\ASUS\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\ASUS\.codex\skills\xiaoxiang-android-release` 通过。
- `verify_public_release.ps1 -ExpectedVersionName 1.0.15 -ExpectedVersionCode 17` 通过，确认当前线上 APK 与 manifest 正常。
- 检查 skill 目录未包含真实签名密码或 FTP 密码。

## 下次发布建议

- 使用 `sign_release.ps1`、`upload_apk.ps1`、`verify_public_release.ps1`，不要临时拼命令。
- 已经本地一致且高于线上时，不再重复升版本。
- 最终线上验收以后，除非异常，不再追加一次完整 preflight。
- GitHub 镜像仍默认跳过，除非用户明确要求。
