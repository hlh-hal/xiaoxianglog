import type { CapacitorConfig } from '@capacitor/cli';

const isMobilePreview = process.env.MOBILE_PREVIEW === '1';

const config: CapacitorConfig = {
  appId: 'com.xiaoxiang.diary',
  appName: '小象日志',
  webDir: 'dist',
  ...(isMobilePreview
    ? {
        server: {
          url: 'http://10.0.2.2:3000',
          cleartext: true,
        },
      }
    : {}),
};

export default config;
