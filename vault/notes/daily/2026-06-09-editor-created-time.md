# 2026-06-09 编辑页创建时间显示修复

## 来源

用户反馈：下午 5:57 创建的日志，编辑页标题下方却显示“上午 12:00”，要求这里显示创建这篇日志的时间。

## 判断

根因是编辑页顶部第二行时间复用了 `displayDate`，而 `displayDate` 来自 `DiaryEntry.diaryDate`。`diaryDate` 是归属日期键，格式为 `YYYY-MM-DD`；`parseDiaryDateKey()` 会把它解析成本地当天 00:00，所以时间必然显示成“上午 12:00”。

## 改动

- `src/pages/Editor.tsx`：拆分日期和创建时间显示。顶部第一行继续用 `diaryDate` 显示归属日期；第二行改用 `createdAt`。新建未保存草稿用 `draftCreatedAtRef` 保留进入编辑页时的创建时刻，并在首次 `createEntry()` 时传入 `createdAt`。
- `server/src/routes/sync.ts`：同步 push 首次在云端创建日记时，如果客户端带了合法 `createdAt`，保留该时间，避免多设备/云端恢复后创建时间变成同步时间。

## 验证

- `npm run lint`
- `npm run build`
- `cd server && npm run build`
- 本地 Vite `http://localhost:3000/editor`，Edge/Puppeteer 移动视口检查：顶部显示 `06月09日 · 星期二` / `下午 06:19`，不再显示 `上午 12:00`。

## 云端上传

- 2026-06-09 按用户要求上传到云端服务器。
- 前端：执行 `deploy-upload.ps1 -Target front`，21/21 个 `dist/` 文件上传 OK。线上首页已引用 `assets/index-CLqoLy-T.js` 和 `assets/index-Bin56tYW.css`；远端 JS/CSS SHA256 与本地一致：
  - JS `B3B9E8E299F5230596CB40C7C75D7DFE2603AAF789C5948D0F7114A5780BCE04`
  - CSS `803D81095D0671E32A8D364EC151749B2EEF6263CCC8D616A967DF9E1D8C2B79`
- 后端：为避免全量覆盖，仅通过 FTP 上传同步路由最小文件集到 `/xiaoxiang-server`：
  - `dist/routes/sync.js`
  - `dist/routes/sync.js.map`
  - `dist/routes/sync.d.ts`
  - `dist/routes/sync.d.ts.map`
  - `src/routes/sync.ts`
- 已拉回远端 `dist/routes/sync.js` 验证包含 `nextCreatedAt` 和 `createdAt: nextCreatedAt`。
- 注意：FTP 只上传文件，不会重启 Node。线上 `/api/health` 当前返回 `build=cpamc-only-20260520`、`pid=2984`；后端 `createdAt` 同步保真补丁需要宝塔/服务器终端重启 `C:\wwwroot\xiaoxiang-server` Node 项目后才会运行时生效。

## 风险与后续

- 这次没有改变 `diaryDate` 语义，也没有动数据库结构。
- 已有本地日记只要有 `createdAt` 就会正确显示。若某些极旧数据缺失 `createdAt`，会回退到归属日期的 00:00。
