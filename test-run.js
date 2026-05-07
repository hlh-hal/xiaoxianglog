import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:3000/walk', { waitUntil: 'networkidle0' });
  const content = await page.content();
  if (content.includes('Uncaught Error!')) {
     console.log('FOUND ERROR BOUNDARY');
  } else {
     console.log('NO ERROR FOUND');
  }
  await browser.close();
})();
