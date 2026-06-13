export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.14';
export const currentVersionCode = 15;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.14',
  versionCode: 15,
  releasedAt: '2026-06-13',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '首页滑动查看日志时不再突然出现大段空白，列表内容会保持连续。',
    '优化时间轴日志卡片的滚动绘制，减少快速滑动时的文字残影和闪烁。',
    '优化首页滚动位置保存和日期跳转，返回首页时更稳定。',
  ],
  fixes: [
    '修复同步或页面重新激活时短暂读到空列表，导致首页闪成空白的问题。',
    '修复滚动位置计算混用页面坐标和内部滚动容器坐标，可能造成跳到异常空白区域的问题。',
  ],
};
