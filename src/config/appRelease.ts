export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.27';
export const currentVersionCode = 29;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.27',
  versionCode: 29,
  releasedAt: '2026-07-21',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '每日回声只会在服务端验收合格后展示，等待与失败过程不再写入半成品。',
    '个人页新增更细腻的心情趋势和“当天回顾”，可直接回到对应日志。',
    '导出日记支持按全部时间或自定义日期范围选择。',
  ],
  fixes: [
    '修复月度回声行动标题较长时与下一条时间轴重叠的问题。',
    '修复月度情绪、历史报告和长文本在部分 Android 设备上的显示兼容问题。',
    '修复从心情当天回顾返回个人页后丢失滚动位置和选中日期的问题。',
  ],
};
