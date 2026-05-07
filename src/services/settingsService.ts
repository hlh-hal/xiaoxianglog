export interface AppSettings {
  reminderEnabled: boolean;
  reminderTime: string;
  saveOnExit: boolean;
  autoAdjustTime: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  reminderEnabled: true,
  reminderTime: '21:00',
  saveOnExit: true,
  autoAdjustTime: true,
};

export interface FontSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontFamily: 'noto-sans',
  fontSize: 16,
  lineHeight: 1.7,
};

export const PRESET_FONTS = [
  {
    id: 'noto-sans',
    label: '思源黑体',
    fontFamily: '"Noto Sans SC", sans-serif',
    weight: 400,
    isCustom: false,
  },
];

export interface CustomFont {
  id: string;
  label: string;
  fontFamily: string;
  weight: number;
  isCustom: true;
}

export const settingsService = {
  getSettings(): AppSettings {
    const stored = localStorage.getItem('app_settings');
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: Partial<AppSettings>) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('app_settings', JSON.stringify(updated));
    return updated;
  },

  getFontSettings(): FontSettings {
    const stored = localStorage.getItem('xiang_font_settings');
    if (stored) {
      return { ...DEFAULT_FONT_SETTINGS, ...JSON.parse(stored) };
    }
    // Backward compatibility with old settings
    const oldStored = localStorage.getItem('app_settings');
    if (oldStored) {
      try {
        const oldSettings = JSON.parse(oldStored);
        const fontMap: Record<string, string> = { '思源黑体': 'noto-sans', '苹方': 'pingfang', '霞鹜文楷': 'lxgw', '方正书宋': 'fz', '汉仪旗黑': 'hyqihei' };
        const lineHeightMap: Record<string, number> = { '紧凑': 1.4, '舒适': 1.7, '宽松': 2.0 };
        const sizeMap: Record<string, number> = { '小': 13, '标准': 15, '大': 17, '特大': 19, '超大': 21 };
        
        let shouldMigrate = false;
        const fontSettings = { ...DEFAULT_FONT_SETTINGS };
        if (oldSettings.fontFamily && fontMap[oldSettings.fontFamily]) {
          fontSettings.fontFamily = fontMap[oldSettings.fontFamily];
          shouldMigrate = true;
        }
        if (oldSettings.lineHeight && lineHeightMap[oldSettings.lineHeight]) {
          fontSettings.lineHeight = lineHeightMap[oldSettings.lineHeight];
          shouldMigrate = true;
        }
        if (oldSettings.fontSize && sizeMap[oldSettings.fontSize]) {
          fontSettings.fontSize = sizeMap[oldSettings.fontSize];
          shouldMigrate = true;
        }
        if (shouldMigrate) {
           localStorage.setItem('xiang_font_settings', JSON.stringify(fontSettings));
           return fontSettings;
        }
      } catch (e) {}
    }
    
    return DEFAULT_FONT_SETTINGS;
  },

  saveFontSettings(settings: Partial<FontSettings>) {
    const current = this.getFontSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('xiang_font_settings', JSON.stringify(updated));
    this.applyFontSettings(updated);
    return updated;
  },

  async applyFontSettings(settings: FontSettings) {
    const root = document.documentElement;
    let fontFamily = '"Noto Sans SC", sans-serif';
    if (settings.fontFamily !== 'noto-sans') {
       try {
         const { diaryService } = await import('./diaryService');
         const customFonts = await diaryService.getCustomFonts();
         const found = customFonts.find(f => f.id === settings.fontFamily);
         if (found) fontFamily = `"${found.fontFamily}", "Noto Sans SC", sans-serif`;
       } catch (e) {
         console.warn("Failed to load custom font in applyFontSettings:", e);
       }
    }
    
    root.style.setProperty('--diary-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--diary-line-height', `${settings.lineHeight}`);
    root.style.setProperty('--diary-font-family', fontFamily);
    root.style.setProperty('--font-sans', fontFamily);
    root.style.setProperty('--diary-font-color', 'inherit');
  },

  async init() {
    await this.applyFontSettings(this.getFontSettings());
  }
};
