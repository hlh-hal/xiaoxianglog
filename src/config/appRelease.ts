export type AppRelease = {
  version: string;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

export const currentVersion = '0.0.0';

export const latestRelease: AppRelease = {
  version: '0.1.0',
  releasedAt: '2026-06-07',
  downloadUrl: '',
  highlights: [
    '新增应用更新公告，打开首页时可以看到新版说明。',
    '首页顶部新增常驻更新入口，暂时不更新时也能随时回到公告。',
    '公告支持展示更新内容、修复内容和新版下载入口。',
  ],
  fixes: [
    '补齐版本更新提醒流程，避免用户不知道有新版可下载。',
    '下载地址未配置时会给出提示，不会跳到无效页面。',
  ],
};
