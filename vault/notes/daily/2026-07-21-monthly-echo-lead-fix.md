# 月度回声 recurring lead 占位符修复（待发布）

- 真机截图显示第六页的固定句式为“当你……时”，不是用户日志内容。
- 根因：模型生成了字面量占位符，服务端只验证 evidenceIds，未验证 lead 文本；渲染层按原样显示。
- 修复：`normalizeRecurringLead()` 在归一化阶段拒绝省略号和泛化占位词，使用第一条 occurrence 的真实场景重建条件；Prompt 明确禁止占位 lead。
- 本地版本：`monthly_arc_v2_11 / monthly_echo_render_v2_12`。测试 42 项、lint、server build 通过。
- 用户暂不要求推送，本次未继续线上上传或重启。
