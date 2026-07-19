import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const pages = [
  ['#core-flow', '01-应用主要运行流程.png'],
  ['#wechat-login-flow', '02-微信登录与注册流程.png'],
  ['#existing-user-bind-flow', '03-已注册用户绑定微信流程.png'],
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(outputDir, 'flowcharts.html')).href, {
    waitUntil: 'networkidle0',
  });

  for (const [selector, filename] of pages) {
    const element = await page.$(selector);
    if (!element) throw new Error(`Missing flowchart element: ${selector}`);
    await element.screenshot({ path: path.join(outputDir, filename), type: 'png' });
  }

  await browser.close();
})();
