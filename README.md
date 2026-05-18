# 小象日志

小象日志是一款面向个人记录的图文日记应用，支持按日期沉淀日常、编辑富文本内容、管理图片素材，并将日志整理成适合回看、分享和移动端使用的体验。

## 项目特点

- 日记时间线：按日期浏览、定位和回看记录，支持多种列表展示样式。
- 图文编辑：提供富文本编辑、图片插入、主题背景、撤销重做和导出分享卡片等能力。
- 账号与同步：包含登录注册、个人资料、好友、私信、社区动态等基础社交模块。
- 内容管理：支持搜索、相册、回收站、历史版本、隐藏记录和批量操作。
- 移动端适配：使用 Capacitor 支持 Android 打包，并针对移动输入、图片预览和分享场景做了适配。
- 后端服务：Express 服务提供认证、日记、上传、邮件验证码和 SQLite 数据存储等能力。

## 技术栈

- 前端：React 19、Vite、TypeScript、Tailwind CSS、TipTap、React Router
- 移动端：Capacitor Android
- 后端：Node.js、Express、SQLite、Prisma
- 内容与媒体：html-to-image、html2canvas、Markdown 解析与导出相关工具

## 本地运行

### 1. 安装依赖

```bash
npm install
```

如果需要运行后端服务，请进入 `server` 目录安装后端依赖：

```bash
cd server
npm install
```

### 2. 配置环境变量

复制环境变量示例文件，并按自己的本地或线上环境填写：

```bash
copy .env.example .env.local
copy server\.env.example server\.env
```

常用配置包括：

- `VITE_API_BASE_URL`：前端请求的后端 API 地址
- `DATABASE_URL`：后端 SQLite 数据库地址
- `JWT_SECRET` / `JWT_REFRESH_SECRET`：登录令牌密钥
- `SMTP_*`：邮件验证码服务配置
- `OSS_*`：对象存储上传配置

### 3. 启动开发服务

仅启动前端：

```bash
npm run dev
```

同时启动前端和后端：

```bash
npm run dev:all
```

默认前端地址为 `http://localhost:3000`，后端服务通常运行在 `http://localhost:3001`。

## 常用脚本

```bash
npm run build              # 构建前端
npm run preview            # 预览构建产物
npm run lint               # TypeScript 类型检查
npm run android:sync       # 构建并同步到 Android 工程
npm run android:open       # 打开 Android 工程
npm run preview:mobile     # 移动端预览辅助脚本
```

## 项目结构

```text
src/          前端页面、组件、上下文和服务封装
server/       后端 API、认证、上传和数据库相关代码
public/       静态资源
scripts/      开发、预览和部署辅助脚本
android/      Capacitor Android 工程
tests/        导出与内容保真相关测试
```

## 构建与发布

执行生产构建：

```bash
npm run build
```

Android 打包前先同步 Web 构建产物：

```bash
npm run android:sync
```

后端部署时请使用独立的生产环境变量，并确保数据库、对象存储、邮件服务和登录密钥已经正确配置。
