export type AppRelease = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  highlights: string[];
  fixes: string[];
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const currentVersion = '1.0.20';
export const currentVersionCode = 22;
export const updateManifestUrl = viteEnv?.VITE_APP_UPDATE_URL || 'https://xiaoxianglog.cn/app-update.json';

export const latestRelease: AppRelease = {
  version: '1.0.20',
  versionCode: 22,
  releasedAt: '2026-06-24',
  downloadUrl: 'https://xiaoxianglog.cn/download/xiaoxiang-log-latest.apk',
  highlights: [
    '还原 Android 编辑器选中文字和光标手柄的系统默认图标，不再显示错误的绿色水滴样式。',
    '移除误加的原生 textSelectHandle 绑定，避免系统选择控件被替换成自定义图形。',
    '保留顶部遮挡和 WebView 深色合成修复，继续减少正文重叠和原生选区白底问题。',
  ],
  fixes: [
    '删除自定义 text_select_handle 资源引用，恢复系统默认文本选择手柄。',
    '本次只修正图标样式误改，不改编辑器正文、工具栏或主题布局。',
    '白色方块问题后续继续按原生 WebView/资源合成方向排查，不再通过更换手柄形状处理。',
  ],
};
