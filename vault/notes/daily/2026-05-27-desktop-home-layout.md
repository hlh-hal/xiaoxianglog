# 2026-05-27 桌面端首页比例适配

- 来源：用户反馈电脑端首页两边空白过多，时间轴位置偏中间，底部缺少底部导航页，要求只修复电脑端适配，不改手机端和其他逻辑。
- 状态：已调整 `src/index.css` 的桌面断点，让 `.app-reading-container` 在侧栏右侧靠左排列并放宽到最多 `1440px`；同步调整桌面顶栏内边距和桌面 FAB 位置。已调整 `src/components/Layout.tsx`，让首页/日志圈/我的底部导航在桌面端主内容区也显示，并保留底部 padding；手机端原有底部导航类名和布局不变。
- 验证：`npm run lint`、`npm run build` 通过。Puppeteer 桌面视口 `2048x1024` 验证首页非空、无 Vite error overlay、底部导航可见、控制台无错误；成功截图为 `desktop-home-adaptation-success.png`。
- 上线：已执行 `deploy-upload.ps1 -Target front` 上传前端 `dist` 到云端服务器。线上首页 `http://47.122.112.242/` 已引用 `assets/index-1Dh8EfRK.js` 和 `assets/index-e490O3HN.css`；两个静态资源经 `curl -k -I -L` 验证返回 200。
- 补充调整：用户要求右侧也留一点空隙并与左侧对称。已仅在 `src/index.css` 的桌面断点中把 `.app-reading-container` 改为主内容区内左右等距，桌面 `2048x1024` 下主内容区两侧外边距均为 `48px`，手机端规则未改。验证：`npm run lint`、`npm run build` 通过；Puppeteer 验证 `/profile` 和 `/` 无错误，成功截图为 `desktop-right-gap-profile-success.png`、`desktop-right-gap-home-success.png`。
- 补充上线：已执行 `deploy-upload.ps1 -Target front` 上传对称留白补充版前端 `dist`。线上首页 `http://47.122.112.242/` 已引用 `assets/index-eu_Y64YC.js` 和 `assets/index-EgHKyRo7.css`；两个静态资源经 `curl -k -I -L` 验证返回 200。
