import { Capacitor, registerPlugin } from '@capacitor/core';

type SavePngOptions = {
  fileName: string;
  base64: string;
  mimeType?: 'image/png';
};

type SavePngResult = {
  uri?: string;
  path?: string;
  size?: number;
};

type XiangImageSaverPlugin = {
  savePngBase64(options: SavePngOptions): Promise<SavePngResult>;
};

const XiangImageSaver = registerPlugin<XiangImageSaverPlugin>('XiangImageSaver');

export function canUseAndroidImageSaver(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
}

export async function savePngDataUrlToAndroidGallery(dataUrl: string, fileName: string): Promise<SavePngResult> {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  if (!base64.trim()) {
    throw new Error('Image data is empty');
  }

  return XiangImageSaver.savePngBase64({
    fileName,
    base64,
    mimeType: 'image/png',
  });
}
