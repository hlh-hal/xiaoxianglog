# 2026-06-15 首次安装本地日志保存位置引导

## 背景

用户希望新增一个只在首次下载安装后出现的引导，让用户先选择本地日志保存位置。不要求注册或登录，更新版本时不能触发，也暂时不打包、不推送用户端。

## 本次改动

- 新增 `firstInstallVaultOnboardingService`，用 `xiang_first_install_vault_onboarding_state` 记录状态。
- 全新安装无旧标记时进入 `pending`，已有欢迎日记、已有本地日记、已有登录 session 或已有本地目录授权时标记为 `existing-user`，避免更新后弹出。
- 新增 `/first-run/local-vault` 引导页，支持选择文件夹、稍后设置、不支持环境继续使用。
- `App.tsx` 启动时先初始化首次安装状态，再创建欢迎日记，避免欢迎日记把新安装误判成老用户。

## 验证

- `npm run lint` 通过。
- `npm run build` 通过。

## 注意

- 本次没有执行 `npm run android:sync`，没有打包 APK，没有上传服务器，也没有触发更新公告。
- 工作区已有多处历史未提交改动，本次只新增首次安装引导相关代码。
