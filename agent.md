# 小象日志 Agent 工作规范

这份文件用于新会话快速了解本项目的技术栈、代码约定和我的偏好。开始改代码前请先读它，再观察相关文件的现有写法。

## 项目定位

小象日志是一个私密、温和、偏移动端体验的日记应用。核心功能包括写日记、图片、主题背景、回收站、历史版本、AI 聊天、社区、好友、通知、排行榜、账号体系和数据同步。

做功能时优先保持“日记应用”的气质：安静、清爽、好写、好读、少打扰。不要把界面做成营销页、后台管理页或过度装饰的产品页。

## 技术栈

- 前端：Vite 6、React 19、TypeScript、React Router 7。
- 样式：Tailwind CSS 4，通过 `src/index.css` 的 `@theme` 定义设计变量。
- 图标：优先使用 `lucide-react`。
- 编辑器：Tiptap，相关页面集中在 `src/pages/Editor.tsx`。
- 动画：`motion/react`。
- 本地数据：`idb`，数据库逻辑集中在 `src/services/diaryService.ts`。
- 后端：`server/` 下的 Express 5、TypeScript、Prisma 6。
- 数据库：SQLite，Prisma schema 在 `server/prisma/schema.prisma`。
- 认证：JWT，前端 token 逻辑在 `src/services/apiClient.ts`，后端中间件在 `server/src/middleware/auth.ts`。
- 上传：后端静态暴露 `/uploads` 和 `/api/uploads`，上传路由在 `server/src/routes/upload.ts`。

## 常用命令

在项目根目录：

```bash
npm run dev
npm run build
npm run lint
```

在 `server/` 目录：

```bash
npm run dev
npm run build
npm run db:generate
npm run db:push
```

前端开发服务器默认 `3000`，通过 Vite proxy 访问后端 `/api` 和 `/uploads`。后端默认 `3001`，可用 `PORT` 调整。

## 目录职责

- `src/pages/`：页面级组件，路由来自 `src/App.tsx`。
- `src/components/`：可复用 UI 组件。
- `src/components/diary-lists/`：日记列表的不同展示形态。
- `src/services/`：前端 API、认证、日记、设置、AI 等业务服务。
- `src/contexts/`：React Context，例如认证和主题。
- `src/config/themes.ts`、`src/types/theme.ts`：日记主题配置和类型。
- `src/utils/`：导入导出、图片、通知、文本处理等工具函数。
- `server/src/routes/`：后端 API 路由，按业务模块拆分。
- `server/src/lib/prisma.ts`：Prisma client。
- `server/prisma/schema.prisma`：数据库模型。
- `public/themes/`：内置主题图片。

## 数据与同步规则

- 日记条目是 local-first：优先写入 IndexedDB，再通过 `diaryService.triggerSync()` 与后端同步。
- 登录状态由 `apiClient.ts` 的 access token 判断；未登录时不要强制依赖后端。
- 修改日记数据时要维护 `updatedAt`，并清理 `activeEntriesCache`。
- 删除分两类：普通删除进入回收站，永久删除才真正删除。
- `DiaryEntry.images`、`tags` 在前端是数组，后端 Prisma 中以 JSON 字符串保存，路由返回前需要 parse，写入时需要 stringify。
- 后端接口涉及用户数据时必须按 `req.user!.userId` 做隔离，不允许跨用户读写。

## API 规范

- 前端普通请求使用 `api.get/post/put/delete` 或 `apiRequest`，不要在页面里重复写 token 刷新逻辑。
- 上传图片、字体用 `FormData`，不要手动设置 JSON `Content-Type`。
- 需要登录的后端路由使用 `requireAuth`，公开或半公开内容才考虑 `optionalAuth`。
- 后端错误响应保持 `{ error: string }` 形状，前端会读取 `errorData.error`。
- 大请求体已经由 `server/src/index.ts` 的自定义 body parser 处理，改动时要小心上传和 JSON 请求的兼容性。

## 前端编码风格

- 使用函数组件和 Hooks。
- 组件状态命名保持清楚：`isOpen`、`isSaving`、`selectedX`、`previewX` 这类模式已经大量存在。
- 页面里可以保留适度内联样式，尤其是导出卡片、动态背景、移动端固定层等精确布局；普通 UI 优先 Tailwind。
- 使用 `lucide-react` 图标，按钮里的图标尺寸通常在 `18px` 到 `22px`。
- 路由改动集中同步 `src/App.tsx`。
- 访问认证用户用 `useAuth()`，不要直接到处读 localStorage session。
- 编辑器相关行为优先沿用 Tiptap 的 command 链，不要手写 DOM 变更。

## UI 与体验要求

- 这是移动端优先应用，所有弹层、底部 Sheet、工具栏都要考虑安全区和软键盘。
- 保持现有色彩系统：主色是绿色 `#446733`，浅色背景接近纸张色，暗色模式在 `.dark` 中定义。
- 不要随意引入大面积紫色、蓝紫渐变、营销式 hero、漂浮装饰球。
- 日记正文、导出卡片、分享图的排版要优先保证可读性和稳定尺寸。
- 交互按钮要有明确触达面积，移动端横向工具栏要可滚动。
- 对日记内容、图片预览、导出图片这类核心体验，改完最好实际在浏览器里看一眼。

## 后端编码风格

- 路由文件使用 `Router()`，导出 `router`。
- Prisma 模型使用 camelCase 字段，数据库列通过 `@map` / `@@map` 映射。
- 对属于用户的数据统一加 `userId` 条件。
- 列表接口注意分页、排序和状态过滤。
- 返回前把 JSON 字符串字段转回数组或对象。
- 更新接口用 `field !== undefined` 判断，避免把未传字段误清空。

## 编码与中文文本

项目中部分中文注释和文案已经出现乱码。除非任务明确是修复文案或编码，不要大面积重写这些文本，避免引入更大的 diff 和风险。

如果要新增中文文案，请使用正常 UTF-8 中文。不要复制已有乱码当作新文案。

## 环境变量

根目录 `.env.example` 包含前端和 AI 配置示例，`server/.env` 是后端本地配置。不要提交真实密钥或把现有密钥扩散到文档、日志、截图中。

常见变量：

- `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY`
- `VITE_AI_API_KEY`
- `VITE_AI_BASE_URL`
- `VITE_AI_MODEL`
- `VITE_API_PROXY_TARGET`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- SMTP 邮件配置

## 测试与验证

- TypeScript 检查：根目录 `npm run lint`，后端 `npm run build`。
- 前端构建：根目录 `npm run build`。
- 后端健康检查：启动后访问 `/health` 或 `/api/health`。
- UI 改动应启动前端并用浏览器验证关键路径，尤其是移动端尺寸、弹层、图片预览、编辑器、分享导出。
- 数据同步或后端改动要至少手动验证登录态、未登录态、本地 fallback 三种路径中受影响的部分。

## 修改原则

- 先读相关文件，再按现有模式改，不要引入新的架构风格。
- 小范围修改优先，不做无关重构。
- 不要删除或覆盖用户上传图片、SQLite 数据库、日志、压缩包，除非用户明确要求。
- 不要随意改 `package-lock.json`，除非确实新增或升级依赖。
- 不要把页面逻辑直接塞进通用工具；只有多个地方真的复用时再抽象。
- 涉及数据库模型变更时，同步更新 Prisma schema、相关路由、前端类型和本地同步逻辑。

## 给后续 Agent 的工作方式

1. 先看 `package.json`、相关页面或路由、相关 service，再动手。
2. 如果遇到乱码，先判断是否和任务有关；无关就绕开。
3. 如果是 UI 任务，改完启动 dev server 做视觉验证。
4. 如果是数据或接口任务，同时检查前端 service、后端 route、Prisma schema。
5. 完成后说明改了哪些文件、跑了哪些验证、还有哪些风险。

## 线上 CPAMC / CPA 面板

LongCat 不直接走官方地址，线上小象后端只调用本机 CPAMC 面板：

```env
CPAMC_BASE_URL="http://127.0.0.1:8317/v1"
```

当前线上 CPAMC 程序位置：

```bat
C:\Users\Administrator\Desktop\cll\cli-proxy-api.exe
```

启动 CPAMC 面板：

```bat
cd /d C:\Users\Administrator\Desktop\cll
cli-proxy-api.exe
```

启动后另开一个终端确认 8317 已监听：

```bat
netstat -ano | findstr :8317
```

必须看到 `LISTENING`。如果没有，LongCat 会失败，后端诊断会显示 CPAMC `/models` `fetch failed`。

小象后端位置和启动方式：

```bat
cd /d C:\wwwroot\xiaoxiang-server
npm start
```

确认新版后端已接管线上请求：

```text
http://47.122.112.242/api/health
```

返回里必须包含：

```json
"build":"cpamc-only-20260520"
```

CPAMC/LongCat 诊断命令：

```bat
cd /d C:\wwwroot\xiaoxiang-server
npm run doctor:cpamc
```

`doctor:cpamc` 会检查：
- 小象后端是否加载新版 build。
- `http://127.0.0.1:8317/v1/models` 是否可访问。
- `LongCat-Flash-Lite` 的 `/chat/completions` 是否返回 200。

如果 3001 仍由旧进程占用：

```bat
netstat -ano | findstr :3001
tasklist /FI "PID eq <PID>"
taskkill /PID <PID> /F
```

然后重新执行 `npm start`。
