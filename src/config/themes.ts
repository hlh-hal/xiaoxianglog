export interface ThemeConfig {
  id: string;
  type: 'color' | 'image';
  value: string; // hex color or image URL
  name: string;
  isPremium?: boolean;
  textColor?: '#FFFFFF' | '#1C1C1E'; // pre-calculated text color
}

export const THEME_CONFIG: { solid: ThemeConfig[], landscape: ThemeConfig[] } = {
  solid: [
    { id: 'solid-1', type: 'color', value: '#FAF9F5', name: '默认', textColor: '#1C1C1E' },
    { id: 'solid-2', type: 'color', value: '#F4F5F0', name: '抹茶', textColor: '#1C1C1E' },
    { id: 'solid-3', type: 'color', value: '#E8EDF2', name: '雾蓝', textColor: '#1C1C1E' },
    { id: 'solid-4', type: 'color', value: '#F5EBEB', name: '樱灰', textColor: '#1C1C1E' },
    { id: 'solid-5', type: 'color', value: '#2C363F', name: '深渊', textColor: '#FFFFFF', isPremium: true },
    { id: 'solid-6', type: 'color', value: '#8A7E72', name: '大地', textColor: '#FFFFFF', isPremium: true },
    { id: 'solid-midnight-indigo', type: 'color', value: '#26306E', name: '靛蓝', textColor: '#FFFFFF' },
  ],
  landscape: [
    { id: 'sys-ink-plum', type: 'image', value: '/themes/bg-ink-plum.jpg', name: '红梅', textColor: '#1C1C1E' },
    { id: 'sys-watercolor-sky', type: 'image', value: '/themes/bg-watercolor-sky.jpg', name: '晴野', textColor: '#1C1C1E' },
    { id: 'sys-watercolor-splash', type: 'image', value: '/themes/bg-watercolor-splash.jpg', name: '泼彩', textColor: '#1C1C1E' },
    { id: 'sys-ink-pavilion', type: 'image', value: '/themes/bg-ink-pavilion.jpg', name: '江南', textColor: '#1C1C1E' },
  ]
};

export const getThemeById = (id?: string): ThemeConfig => {
  if (!id) return THEME_CONFIG.solid[0];
  const allThemes = [...THEME_CONFIG.solid, ...THEME_CONFIG.landscape];
  return allThemes.find(theme => theme.id === id) || THEME_CONFIG.solid[0];
};

export const calculateContrastColor = (bgColor: string): '#FFFFFF' | '#1C1C1E' => {
  if (bgColor.startsWith('#')) {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1C1C1E' : '#FFFFFF';
  }
  return '#FFFFFF';
};

export const preloadThemeImages = () => {
  THEME_CONFIG.landscape.forEach(theme => {
    if (theme.type === 'image') {
      const img = new Image();
      img.src = theme.value;
    }
  });
};
