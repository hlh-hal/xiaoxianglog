# 记忆写入流程

## 结论

`vault/` 是跨会话交接源，`WORKLOG.md` 只是旧日志和索引。后续 Agent 不能只更新 `WORKLOG.md`。

## 开始任务前

1. 读 `AGENTS.md`。
2. 读 `vault/TODO.md`。
3. 读相关 `vault/projects/*.md`。
4. 如果任务涉及既有坑或流程，再读 `vault/agent/*.md`。

## 结束任务前检查

如果任一问题答案是“是”，就更新 `vault/`：

- 是否修改了代码、部署配置、测试、同步逻辑、认证、通知、PWA、Android、线上配置或用户可见流程？
- 是否改动超过 3 个文件？
- 是否修复了高影响 bug 或线上问题？
- 是否新增或改变了验证命令？
- 是否发现了容易重复踩的坑？
- 是否留下待办、风险、阻塞或下次接手提示？
- 用户是否明确要求“记住”“下次”“以后”？

## 最小写入

- `vault/notes/daily/YYYY-MM-DD.md`：当天摘要、改动、验证、风险。
- `vault/projects/xiaoxiang-log.md`：项目级状态、最近重大变更、下次接手。
- `vault/TODO.md`：仍未解决的待办、阻塞和风险。
- `vault/agent/decisions.md`：长期规则或流程决策。

如果没有长期价值，不写 vault，但最终回复要说明“本次无需更新 vault”的原因。

