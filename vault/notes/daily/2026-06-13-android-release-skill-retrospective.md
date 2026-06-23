# 2026-06-13 Android 发布 skill 复盘迭代

## 背景

v1.0.14 发布过程中，用户指出更新公告初稿写偏了。实际要面向用户说明的是当天三处改动：Android 顶部黑/灰边、首页滚动残影/中段空白、Android 导出图片保存失败；而初稿只写了首页滚动相关内容。

## 暴露的问题

- 发布公告没有先从当天 `vault/notes/daily` 工作日志里提取真实改动，容易只根据最近一次代码 diff 写公告。
- `release_preflight.py` 在本地版本已经升高后仍显示 `Suggested target` 为“再加一版”，容易误导继续无意义升版本。
- skill 和 reference 文件存在乱码，影响后续理解。
- 签名阶段仍可能被机器全局失效的 `JAVA_HOME=D:\Program Files\Java\jdk-23` 卡住，必须强制在当前 shell 设置 JDK 21。

## 已迭代

- `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\SKILL.md`
  - 用 UTF-8 重写，加入“Release Notes Must Match The Actual Work”硬规则。
  - 明确发布前必须读取当天工作日志和用户最新纠正，不能复用旧公告。
  - 明确预检建议只在改版本前使用；本地已领先线上且一致时不要盲目再升版。
  - 增加 mojibake 公告文案作为 hard gate。

- `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\references\release-workflow.md`
  - 增加当天日志检索命令。
  - 增加公告核对命令。
  - 增加错误公告、预检二次误升版、失效 JAVA_HOME 三个常见故障。

- `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\scripts\release_preflight.py`
  - 新增 `localReleaseStatus`，输出本地版本是否一致、是否领先线上，以及推荐动作。
  - 当前线上与本地同为 `1.0.14 / 16` 时，会提示只有“要再次触发更新”才需要继续升版。

- `C:\Users\ASUS\.codex\skills\xiaoxiang-android-release\agents\openai.yaml`
  - 修复展示名和默认提示乱码。

## 验证

- 运行 `release_preflight.py --project D:\小象日志` 通过。
- 运行 `release_preflight.py --json` 可返回 `localReleaseStatus`，当前状态为本地一致、线上同版本、不领先线上。

## 下次使用提醒

发布前先看当天 `vault/notes/daily/YYYY-MM-DD*.md`，把候选改动列出来，再写 `public/app-update.json`。如果用户中途纠正公告内容，先改公告和版本元数据，再继续 build/upload。
