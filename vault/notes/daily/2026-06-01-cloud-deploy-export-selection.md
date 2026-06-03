# 2026-06-01 云端部署：导出中英重叠与选中文本下滑

## 来源

- 用户要求将两个近期修改上传到云端服务器：
  - 导出图片中英混排字母与中文重叠修复。
  - 日志编辑器选中文本下滑修复。

## 执行

- 在 `D:\小象日志` 执行 `npm run build`，前端构建通过。
- 执行 `powershell -ExecutionPolicy Bypass -File .\deploy-upload.ps1 -Target front` 上传前端 `dist/`。
- 本次只上传前端静态资源，未重启后端。

## 线上验证

- 线上首页引用资源：`assets/index-3nV78Avw.js`。
- 本地与线上 JS 资源 SHA256 一致：
  - `E076A03D67280A5C9AB36ECB2169353C3B5E36DFD5CF41C319C2C9D0788AE686`
- `http://47.122.112.242/api/health` 正常返回：
  - `status: ok`
  - `build: cpamc-only-20260520`
  - `pid: 2724`

## 备注

- PowerShell `Invoke-WebRequest` 访问线上首页时会因 HTTPS 证书信任问题失败；本次改用 `curl.exe -k -L` 完成线上资源校验。
