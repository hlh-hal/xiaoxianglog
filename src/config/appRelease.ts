export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.16';
export const currentVersionCode = 18;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.16',
  versionCode: 18,
  releasedAt: '2026-06-22',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '修复导出日记图片时中英文相邻文本可能重叠的问题，导出的长图更清晰。',
    '优化编辑器移动端光标和选区显示，减少输入法选中文字时出现白色块状遮挡。',
    '修正写完日记后的用时统计，只累计真实活跃写作时间，不再把中途离开的空档算进去。',
  ],
  fixes: [
    '导出图片改用更稳定的文本断行方式，避免 html2canvas 渲染时出现字符挤压或覆盖。',
    '为正文编辑区域补充选区颜色和触摸高亮规则，降低系统默认绘制导致的白块问题。',
    '调整日记完成卡片的写作时长计算逻辑，跨时段继续写作时统计更准确。',
  ],
};
