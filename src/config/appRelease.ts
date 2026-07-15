export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.21';
export const currentVersionCode = 23;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.21',
  versionCode: 23,
  releasedAt: '2026-06-30',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '修复日记导出图片中英文混排偶发重叠问题，让导出文字排版与浏览器/WebView 实际渲染保持一致。',
    '优化导出背景图片渲染一致性，减少不同 Android 机型和系统字号设置下的错位和裁切。',
    '导出前会等待字体、图片和文字几何稳定，并内嵌当前字体，进一步降低 fallback 漂移。',
  ],
  fixes: [
    '日记导出不再依赖 html2canvas 的文本测量，改为 html-to-image 的 browser-native foreignObject 渲染。',
    '统一收紧导出排版约束，避免不同系统字体和字号设置把中文、英文和数字压到一起。',
    '本次修复重点集中在导出文字和背景图，不改编辑器正文、工具栏或主题逻辑。',
  ],
};
