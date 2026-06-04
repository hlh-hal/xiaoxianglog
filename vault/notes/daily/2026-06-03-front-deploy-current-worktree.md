# 2026-06-03 前端整包直发云端

## 背景
- 用户明确要求“直接部署当前前端”，接受把当前工作区里的全部前端未提交改动一起发布到云端，而不是只发布首页图片宫格调整。

## 执行
- 在项目根目录执行 `cmd /c deploy.bat front`。
- 本次前端构建产物：
  - `dist/assets/index-BZvRNbNx.js`
  - `dist/assets/index-CGAJ-3DN.css`
- FTP 上传完成，脚本上传了 `dist/` 下 19 个文件。

## 线上验证
- `https://47.122.112.242/` 返回 200。
- 首页 HTML 已引用：
  - `/assets/index-BZvRNbNx.js`
  - `/assets/index-CGAJ-3DN.css`
- `https://47.122.112.242/api/health` 返回：
  - `status: ok`
  - `build: cpamc-only-20260520`

## 风险提示
- 这次不是“只发首页图片改动”，而是把当前前端工作区状态整体发到了云端。
- 发布前已明确提醒：当前工作区还包含多处与首页图片无关的未提交前端改动。
- 后续如果要追线上差异，优先比对当前工作区与 `assets/index-BZvRNbNx.js` 对应时间点，而不要假设线上只包含时间轴/卡片流图片宫格调整。
