# 小象日志 Android 发布 Skill 优化计划

日期：2026-06-24

范围：优化 Codex skill `xiaoxiang-android-release` 及其引用的 `release-workflow.md`，让“小象日志 Android APK 推送到用户端”的流程更快、更稳定、更少返工。

本计划只描述优化方向和验收标准，不包含密钥、FTP 密码、签名密码或任何敏感信息。

---

## 1. 背景

最近一次 Android 发布耗时约 28 分钟。主要问题不是构建慢，而是流程里出现了返工和超时：

- preflight 路径跑错一次。
- PowerShell heredoc 写法出错一次。
- APK 上传第一次被 120 秒外层 timeout 杀掉，第二次加长 timeout 后成功。
- `deploy-upload.ps1 -Target front` 本身耗时约 115 秒。
- 为保证安全，额外做了较多本地、线上验证和 vault 记录。

现有 skill 已经有 Fast Path，但目标时间、超时策略、目录防呆和验证分级还不够硬。

---

## 2. 总目标

把 `xiaoxiang-android-release` 从“安全但偏探索式”的发布流程，优化成：

```text
固定快路径 + 明确防呆 + 可验证 + 少返工
```

目标效果：

- 正常发布控制在 8-12 分钟。
- 避免路径跑错、PowerShell 语法返工、上传外层 timeout、重复验证。
- 保留关键安全校验：签名、证书 MD5、包名、版本号、SHA256、线上 manifest。
- 默认只发布 self-hosted，不碰 GitHub Pages / GitHub Releases，除非用户明确要求 GitHub mirror。

---

## 3. 第一轮修改范围

建议第一轮只修改两个 skill 文档文件：

```text
C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\SKILL.md
C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\references\release-workflow.md
```

暂时不修改脚本：

```text
scripts/release_preflight.py
scripts/sign_release.ps1
scripts/upload_apk.ps1
scripts/verify_public_release.ps1
```

除非后续审查发现脚本本身有明确 bug。

---

## 4. 当前已确认的问题

### 4.1 Fast Path 时间目标偏乐观

现有 skill 写的是：

```text
Aim for a verified release in about 5-8 minutes
```

但真实发布中，以下步骤存在稳定耗时或风险：

- `deploy-upload.ps1 -Target front` 约 115 秒。
- APK 上传可能超过 120 秒。
- 完整安全验证和 vault 记录会额外增加时间。

建议改成：

```text
正常发布目标为 8-12 分钟。
5-8 分钟只作为代码已缓存、网络顺畅、无额外验证时的理想值。
```

### 4.2 Time Budget 与真实耗时不完全匹配

现有 `release-workflow.md` 写：

```text
deploy-upload.ps1 -Target front: about 60 seconds
APK upload and public verification: about 10-20 seconds
```

建议改成：

```text
deploy-upload.ps1 -Target front: usually 90-130 seconds
APK upload: use outer command timeout 300s; script internal curl max-time is 240s per target
public verification: usually 10-30 seconds
```

原因：`scripts/upload_apk.ps1` 内部 curl 已经使用 `--max-time 240`。如果外层执行器 timeout 仍是 120 秒，就可能提前杀死上传。

### 4.3 项目根目录防呆不足

这次 preflight 路径跑错一次。skill 应该在发布前强制确认项目根目录。

### 4.4 版本同步组需要写得更硬

发布版本涉及多个文件，任何一个漏改都会导致 APK、manifest、网页公告不一致。

### 4.5 PowerShell heredoc 风险需要禁止

Windows PowerShell 下不能照搬 bash heredoc 写法。skill 需要明确禁止 `<<EOF`、`<<'PY'` 这类写法。

### 4.6 验证步骤需要分级

当前验证很安全，但容易穿插过多探查。应该区分“必须验证”和“增强验证”，避免重复跑不必要步骤。

---

## 5. 阶段一：增加项目根目录防呆

### 要解决的问题

避免在错误目录运行 preflight、lint、android sync、deploy 等命令。

### 计划修改

在 `SKILL.md` 和 `release-workflow.md` 中增加硬规则：

```text
所有发布命令必须基于 D:\小象日志 执行。
执行 release 前，必须确认项目根目录存在以下文件：

- package.json
- android/app/build.gradle
- src/config/appRelease.ts
- public/app-update.json
- deploy-upload.ps1

如果当前目录不是 D:\小象日志，必须先切换目录，不允许继续发布。
```

### 验收标准

以后 Codex 不应该在错误目录运行：

- preflight
- `npm run lint`
- `npm run android:sync`
- `deploy-upload.ps1`

---

## 6. 阶段二：重写 Fast Path 顺序

### 计划改成固定流程

```text
1. cd D:\小象日志，确认项目根目录
2. 跑 preflight，读取本地/线上版本
3. 如果本地等于线上，bump 到线上 +1
4. 同步修改 5 个版本文件
5. UTF-8 解析 public/app-update.json，确认中文不乱码
6. 再跑 preflight，确认本地版本高于线上
7. npm run lint
8. npm run android:sync
9. 设置 JDK 21
10. android\gradlew.bat assembleRelease
11. scripts/sign_release.ps1
12. 本地校验签名、证书 MD5、包名、版本号
13. deploy-upload.ps1 -Target front
14. scripts/upload_apk.ps1，外层 timeout 固定 300s
15. scripts/verify_public_release.ps1
16. 线上 app-update.json 最终确认
17. 写 vault / 项目索引
18. 输出完成报告
```

### 关键规则

- 不要重复 bump。
- 不要重复 lint。
- verify 成功后，不要再做大量重复线上探查。
- 不要检查 GitHub，除非用户明确要求 GitHub mirror。
- 如果本地版本已经一致且高于线上，直接发布本地版本，不再 bump。

---

## 7. 阶段三：强化版本同步组

### 固定版本同步组

以下文件必须作为一个同步组一起处理：

```text
android/app/build.gradle
src/config/appRelease.ts
public/app-update.json
docs/app-update.json
docs/index.html
```

### 计划加规则

```text
这 5 个文件必须作为一个同步组修改。
versionName、versionCode、latestVersion、latestBuild 必须一致。
修改后必须检查旧 versionName / versionCode 是否残留。
```

### 验收标准

发布前必须确认：

- APK `versionName` = public manifest `versionName`。
- APK `versionCode` = public manifest `versionCode`。
- `docs/app-update.json` 与 `public/app-update.json` 对应版本一致。
- `docs/index.html` 展示版本是新版本。

---

## 8. 阶段四：禁止高风险 PowerShell 写法

### 要解决的问题

避免 Windows PowerShell 中误用 bash heredoc，导致命令返工。

### 计划加规则

```text
Windows PowerShell 环境禁止使用 bash heredoc。
不要写 <<EOF、<<'PY'、cat <<EOF 这类语法。
需要检查 JSON 时，优先使用 node -e 或 python -c。
需要写复杂文本时，优先使用已有脚本，不临时拼接多行脚本。
```

### 推荐保留命令

```powershell
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('public/app-update.json','utf8')); console.log(JSON.stringify(j,null,2));"
```

---

## 9. 阶段五：上传超时策略固定化

### 要解决的问题

APK 上传第一次被 120 秒外层 timeout 杀掉，第二次加长后成功。

### 计划修改

在 workflow 里明确写：

```text
调用 scripts/upload_apk.ps1 时，外层命令 timeout 必须设置为 300 秒。
不要先用默认 120 秒尝试。
```

补充说明：

```text
upload_apk.ps1 内部 curl 已经设置 --max-time 240。
如果外层执行器 timeout 小于 240，可能会提前杀死上传。
```

### 验收标准

以后执行 APK 上传时，Codex 应该直接使用 300 秒 timeout，不再先失败一次。

---

## 10. 阶段六：更新时间预算

建议把 Time Budget 改为：

```text
npm run lint: 30-45 秒
npm run android:sync: 15-30 秒
android\gradlew.bat assembleRelease: 50-90 秒
deploy-upload.ps1 -Target front: 90-130 秒
APK upload: 60-240 秒，外层 timeout 固定 300 秒
public verification: 10-30 秒
```

补充判断：

```text
超过 12 分钟通常不是构建慢，而是路径错误、重复验证、网络上传、额外 vault 探查或命令返工。
```

---

## 11. 阶段七：验证步骤分级

### 11.1 必须验证

这些必须保留，不能省：

- `npm run lint`
- Android build 成功
- APK 签名有效
- 证书 MD5 正确
- 包名是 `com.xiaoxiang.diary`
- `versionName` / `versionCode` 正确
- 本地 APK SHA256 = 线上 APK SHA256
- 线上 `app-update.json` 是新版本
- manifest `apkUrl` 指向 self-hosted APK
- 中文更新公告 UTF-8 正常

### 11.2 增强验证

这些可以后置，不要穿插拖慢主流程：

- vault release note
- 项目索引
- 额外 curl 重复确认
- 最终 preflight

规则：

```text
verify_public_release.ps1 成功后，不需要再重复大量线上探查。
vault 记录失败不应该阻断已完成发布，只在最终报告里说明。
```

---

## 12. 阶段八：调整 Completion Report

最终报告只输出：

- 发布版本：`versionName / versionCode`
- APK 地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`
- 更新主题：一句话
- 验证结果：lint / build / sign / package / SHA256 / manifest
- GitHub：已按默认跳过，除非用户要求
- 用户需要操作：如是否需要手动安装一次
- 耗时异常：如 deploy front 或 APK upload 明显偏慢

避免输出：

- 密钥
- FTP 信息
- 签名密码
- 完整敏感服务器路径
- 无关日志

---

## 13. 阶段九：修改后验证

修改 skill 后运行：

```powershell
$env:PYTHONUTF8='1'
python C:\Users\ASUS\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\ASUS\.codex\skills\xiaoxiang-android-release
```

然后做一次 dry-run 级别检查：

```text
只读检查 skill 是否能得出正确流程；
不 bump；
不 build；
不上传；
确认它不会再误用 GitHub、不会在错误目录跑 preflight、不会默认 120 秒上传。
```

---

## 14. 最终验收标准

这个优化完成后，新的 skill 应该满足：

1. 发布前一定确认 `D:\小象日志` 项目根目录。
2. preflight 不再跑错路径。
3. 版本文件作为同步组处理。
4. PowerShell 不再使用 bash heredoc。
5. APK 上传外层 timeout 固定 300 秒。
6. `deploy-upload.ps1 -Target front` 被视为 90-130 秒正常慢步骤。
7. `verify_public_release.ps1` 是主硬门槛。
8. vault / 项目索引后置，不阻断发布。
9. 默认不查 GitHub，不推 GitHub。
10. 正常发布目标从 5-8 分钟修正为 8-12 分钟。

---

## 15. 建议执行顺序

第一步：只改 skill 文档，不改脚本。

第二步：跑 skill validator。

第三步：让 Codex 根据新 skill 复述一次发布流程，确认不会跑错目录、不会误查 GitHub、不会使用 120 秒上传 timeout。

第四步：下一次真实 Android 发布时观察耗时。如果仍然超过 12 分钟，再考虑优化脚本本身，比如把版本 bump 和同步检查集中成一个自动脚本。
