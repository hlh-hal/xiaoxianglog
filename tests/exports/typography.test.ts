import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const HARNESS_URL = 'http://localhost:3000/tests/exports/harness.html';

type TypographyCase = {
  name: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
};

const CASES: TypographyCase[] = [
  {
    name: 'compact-missing-primary-font',
    fontSize: 13,
    lineHeight: 1.4,
    fontFamily: '"Definitely Missing Font", "Noto Sans SC", system-ui, sans-serif',
  },
  {
    name: 'default-cjk-fallback',
    fontSize: 16,
    lineHeight: 1.7,
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  {
    name: 'large-system-font',
    fontSize: 21,
    lineHeight: 2,
    fontFamily: 'system-ui, "Noto Sans SC", sans-serif',
  },
];

function resolveBrowserExecutable(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

async function waitForHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => (window as any).__harnessReady === true, { timeout: 30000 });
}

type Comparison = {
  dimensionsMatch: boolean;
  nativeWidth: number;
  nativeHeight: number;
  exportWidth: number;
  exportHeight: number;
  probeCoverage: number;
  contentCoverage: number;
  probeInkNative: number;
  probeInkExport: number;
  contentInkNative: number;
  contentInkExport: number;
};

async function compareNativeAndExport(
  page: Page,
  nativeBase64: string,
  exportDataUrl: string,
  probeRect: { x: number; y: number; width: number; height: number },
  contentRect: { x: number; y: number; width: number; height: number },
  scale: number,
): Promise<Comparison> {
  return page.evaluate(async ({ nativeBase64, exportDataUrl, probeRect, contentRect, scale }) => {
    async function decode(source: string): Promise<ImageData> {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('PNG decode failed'));
        image.src = source;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2d context unavailable');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    }

    function cropMask(image: ImageData, rect: { x: number; y: number; width: number; height: number }, padding: number) {
      const left = Math.max(0, Math.floor(rect.x * scale) - padding);
      const top = Math.max(0, Math.floor(rect.y * scale) - padding);
      const right = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale) + padding);
      const bottom = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale) + padding);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const mask = new Uint8Array(width * height);
      let ink = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const source = ((top + y) * image.width + left + x) * 4;
          const red = image.data[source];
          const green = image.data[source + 1];
          const blue = image.data[source + 2];
          const alpha = image.data[source + 3] / 255;
          const luminance = ((red + green + blue) / 3) * alpha + 255 * (1 - alpha);
          if (luminance < 180) {
            mask[y * width + x] = 1;
            ink++;
          }
        }
      }
      return { mask, width, height, ink };
    }

    function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
      const result = new Uint8Array(mask.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!mask[y * width + x]) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < width && ny < height) result[ny * width + nx] = 1;
            }
          }
        }
      }
      return result;
    }

    function coverage(a: ReturnType<typeof cropMask>, b: ReturnType<typeof cropMask>): number {
      if (a.width !== b.width || a.height !== b.height || a.ink === 0 || b.ink === 0) return 0;
      const dilatedA = dilate(a.mask, a.width, a.height);
      const dilatedB = dilate(b.mask, b.width, b.height);
      let matchedA = 0;
      let matchedB = 0;
      for (let i = 0; i < a.mask.length; i++) {
        if (a.mask[i] && dilatedB[i]) matchedA++;
        if (b.mask[i] && dilatedA[i]) matchedB++;
      }
      return Math.min(matchedA / a.ink, matchedB / b.ink);
    }

    const [nativeImage, exportImage] = await Promise.all([
      decode(`data:image/png;base64,${nativeBase64}`),
      decode(exportDataUrl),
    ]);
    const nativeProbe = cropMask(nativeImage, probeRect, 8);
    const exportProbe = cropMask(exportImage, probeRect, 8);
    const nativeContent = cropMask(nativeImage, contentRect, 4);
    const exportContent = cropMask(exportImage, contentRect, 4);

    return {
      dimensionsMatch: nativeImage.width === exportImage.width && nativeImage.height === exportImage.height,
      nativeWidth: nativeImage.width,
      nativeHeight: nativeImage.height,
      exportWidth: exportImage.width,
      exportHeight: exportImage.height,
      probeCoverage: coverage(nativeProbe, exportProbe),
      contentCoverage: coverage(nativeContent, exportContent),
      probeInkNative: nativeProbe.ink,
      probeInkExport: exportProbe.ink,
      contentInkNative: nativeContent.ink,
      contentInkExport: exportContent.ink,
    };
  }, { nativeBase64, exportDataUrl, probeRect, contentRect, scale });
}

async function main(): Promise<void> {
  const response = await fetch(HARNESS_URL).catch(() => null);
  if (!response?.ok) throw new Error(`请先启动 npm run dev；当前无法访问 ${HARNESS_URL}`);

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveBrowserExecutable(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    // tsx/esbuild 会给序列化到 page.evaluate 的内部函数注入 __name 辅助调用。
    await page.evaluateOnNewDocument('globalThis.__name = (target) => target;');
    await waitForHarness(page);

    for (const testCase of CASES) {
      await page.evaluate(async (options) => {
        await (window as any).__renderExportPreview('H7', options);
      }, testCase);

      const card = await page.$('#diary-export-card');
      if (!card) throw new Error(`[${testCase.name}] export card missing`);
      const geometry = await page.evaluate(() => {
        const cardNode = document.querySelector<HTMLElement>('#diary-export-card');
        const probeNode = document.querySelector<HTMLElement>('[data-export-probe="mixed"]');
        const contentNode = document.querySelector<HTMLElement>('[data-export-content="true"]');
        if (!cardNode || !probeNode || !contentNode) throw new Error('probe geometry missing');
        const cardRect = cardNode.getBoundingClientRect();
        const relative = (rect: DOMRect) => ({
          x: rect.left - cardRect.left,
          y: rect.top - cardRect.top,
          width: rect.width,
          height: rect.height,
        });
        return {
          probeRect: relative(probeNode.getBoundingClientRect()),
          contentRect: relative(contentNode.getBoundingClientRect()),
          hasInjectedBreak: contentNode.textContent?.includes('\u200B') || Boolean(contentNode.querySelector('wbr')),
        };
      });
      if (geometry.hasInjectedBreak) throw new Error(`[${testCase.name}] export text contains injected break characters`);

      const nativeBase64 = await card.screenshot({ encoding: 'base64' }) as string;
      const exported = await page.evaluate(async () => (window as any).__exportCurrentPreview(2));
      const comparison = await compareNativeAndExport(
        page,
        nativeBase64,
        exported.dataUrl,
        geometry.probeRect,
        geometry.contentRect,
        2,
      );

      console.log(`[typography] ${testCase.name}: ${JSON.stringify(comparison)}`);
      if (!comparison.dimensionsMatch) throw new Error(`[${testCase.name}] PNG dimensions differ from native layout`);
      if (comparison.probeCoverage < 0.72) throw new Error(`[${testCase.name}] mixed-text probe diverged (${comparison.probeCoverage})`);
      if (comparison.contentCoverage < 0.72) throw new Error(`[${testCase.name}] content layout diverged (${comparison.contentCoverage})`);
      const probeInkRatio = comparison.probeInkExport / comparison.probeInkNative;
      if (probeInkRatio < 0.8 || probeInkRatio > 1.2) {
        throw new Error(`[${testCase.name}] mixed-text ink ratio out of range (${probeInkRatio})`);
      }
    }

    console.log(`[typography] passed ${CASES.length} font/size/line-height cases`);
  } finally {
    await browser?.close();
  }
}

main().catch((error) => {
  console.error('[typography] failed:', error);
  process.exitCode = 1;
});
