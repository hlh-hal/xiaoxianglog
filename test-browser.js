import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE CONSOLE ERROR:', msg.text());
    } else {
      console.log('PAGE LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
      console.log('PAGE ERROR STACK:', error.stack);
  });

  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });

  page.on('response', response => {
    if (!response.ok()) {
      console.log('RESPONSE FAILED:', response.url(), response.status());
    }
  });

  try {
    console.log("WAITING... http://localhost:3000/");
    await page.goto('http://localhost:3000/walk', { waitUntil: 'networkidle0' });
    console.log("WAITING complete");
  } catch (err) {
    console.log('GOTO FAILED:', err);
  }

  
  await browser.close();
})();
