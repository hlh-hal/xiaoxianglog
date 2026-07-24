# Android 1.0.25 发布

- 版本：`1.0.25 / versionCode 27`；自有下载地址：`https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk`。
- 更新公告：月度回声第二页升级为有证据的“本月情绪浮现”，关联同篇日志具体事件；行动轨迹长标题自适应并修复时间线断口。
- 验证通过：`npm run lint`、`npm run test:monthly-echo`（37 项）、前端构建/Capacitor sync、服务端构建、Gradle release 构建。
- 本地签名验证：包名 `com.xiaoxiang.diary`，`1.0.25 / code 27`，APK v2/v3 签名通过，证书 MD5 `9a0e0281cd8b3070c425c22290fd3eb4`。
- 公网硬校验：APK HEAD/range 正常，公网与本地 SHA256 均为 `87A4846D045ABFE298A931236F7D7C0AE69FD2784E8870BA46AE5BE0AA7C7C63`，公网 manifest 为 code 27 且中文公告正常。前端 `assets/index-CN7k6y1U.js` 远端与本地哈希一致。
- 后端：月度回声 3 个源码及 12 个编译文件已上传，未覆盖线上 `.env`。完整目录上传超过 10 分钟后改用 `monthly-echo-runtime` 最小发布集并成功。
- 尚未完成：线上健康接口仍为 `pid 11388`；FTP 不会重启 Node。需要在宝塔重启 `C:\wwwroot\xiaoxiang-server`，再用真实登录账号验证新生成版本。发布完成前端/Android 硬门槛，但服务端运行时仍待重启。
- GitHub Pages/Releases 按自有服务器默认发布策略未同步。
