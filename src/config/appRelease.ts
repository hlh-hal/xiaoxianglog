export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.24';
export const currentVersionCode = 26;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.24',
  versionCode: 26,
  releasedAt: '2026-07-19',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '月度回声第二页会将重复事件整理为日期与共同背景，阅读更连贯。',
    '第六页反复主题升级为时间轴表达，长结论会根据内容自动适配。',
    '关键时刻摘要支持长文本自适应，月度回声封面和阅读细节同步优化。',
  ],
  fixes: [
    '修复月度回声封面月份遮罩模糊相邻文字的问题。',
    '修复行动轨迹页底部箭头周围纸张纹理出现缺口的问题。',
    '修复第六页转折日期可能沿用旧事件日期，以及长内容被截断的问题。',
  ],
};
