import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const baseUrl = process.env.ECHO_VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const isRemoteVerify = /^https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(baseUrl);
const out = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-writing-time-online-2026-06-06.png'
  : 'daily-echo-writing-time-2026-06-06.png');
const failOut = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-writing-time-debug-fail-online-2026-06-06.png'
  : 'daily-echo-writing-time-debug-fail-2026-06-06.png');

const executablePath = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && fs.existsSync(candidate));

const browser = await puppeteer.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  acceptInsecureCerts: true,
  args: ['--ignore-certificate-errors'],
  protocolTimeout: 300000,
  defaultViewport: {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
});

const page = await browser.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(30000);
const consoleMessages = [];
const responses = [];
const entryId = `writing-time-${Date.now()}`;
const fiveMinuteEntryId = `${entryId}-five`;
const thinkingEntryId = `${entryId}-thinking`;

page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`pageerror: ${err.message}`));
page.on('response', res => {
  const url = res.url();
  if (url.includes('/api/') || url.includes('/editor')) {
    responses.push(`${res.status()} ${url}`);
  }
});

await page.evaluateOnNewDocument(() => {
  const realNow = Date.now.bind(Date);
  Date.now = () => {
    const mocked = window.__xiaoxiangMockNow;
    return typeof mocked === 'number' ? mocked : realNow();
  };
});

await page.setRequestInterception(true);
page.on('request', request => {
  const url = request.url();

  if (url.includes('/api/chat/complete')) {
    request.respond({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        content: '今日回声：你在产品判断里稳住节奏\n\n用户可见回声：今天你继续分析小象日志产品，也记录自己对产品方向和判断的理解。你把产品开发、自己的节奏和具体记录放在一起看，这些细节说明你不是随手写几句，而是在认真校准接下来的行动。',
        finishReason: 'stop',
      }),
    });
    return;
  }

  if (url.includes('/api/sync/push')) {
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ serverTime: new Date().toISOString() }),
    });
    return;
  }

  if (url.includes('/api/sync/pull')) {
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [], serverTime: new Date().toISOString() }),
    });
    return;
  }

  if (url.includes('/api/')) {
    request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        user: { id: 'test-user', username: 'writing-time-tester' },
      }),
    });
    return;
  }

  request.continue();
});

async function insertText(text, mockNow) {
  await page.evaluate(now => {
    window.__xiaoxiangMockNow = now;
  }, mockNow);
  await sleep(700);
  await page.click('.ProseMirror');
  await page.waitForFunction(() => document.querySelector('.ProseMirror')?.getAttribute('contenteditable') === 'true', {
    timeout: 15000,
  });
  await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!(editor instanceof HTMLElement)) {
      throw new Error('ProseMirror editor not found');
    }
    editor.focus();
  });
  await page.keyboard.type(text, { delay: 0 });
}

async function clickSave() {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('nav button'));
    const saveButton = buttons[1] || buttons[0];
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}

async function getCompletionText(debugEntryId = entryId, options = {}) {
  try {
    await page.waitForSelector('[data-testid="daily-echo-completion-card"]', { timeout: 15000 });
    return page.evaluate(() => document.querySelector('[data-testid="daily-echo-completion-card"]')?.textContent || '');
  } catch (error) {
    const state = await page.evaluate(id => new Promise(resolve => {
      const buttons = Array.from(document.querySelectorAll('nav button')).map((button, index) => ({
        index,
        text: button.textContent || '',
        title: button.getAttribute('title') || '',
        aria: button.getAttribute('aria-label') || '',
        html: button.outerHTML.slice(0, 220),
      }));
      const editor = document.querySelector('.ProseMirror');
      const req = indexedDB.open('ethos-diary-db');
      req.onerror = () => resolve({
        buttons,
        editorText: editor?.textContent || '',
        bodyText: document.body.innerText.slice(0, 1000),
        stored: null,
      });
      req.onsuccess = () => {
        const tx = req.result.transaction('entries', 'readonly');
        const getReq = tx.objectStore('entries').get(id);
        getReq.onerror = () => resolve({
          buttons,
          editorText: editor?.textContent || '',
          bodyText: document.body.innerText.slice(0, 1000),
          stored: null,
        });
        getReq.onsuccess = () => resolve({
          buttons,
          editorText: editor?.textContent || '',
          bodyText: document.body.innerText.slice(0, 1000),
          stored: getReq.result ? {
            activeWritingSeconds: getReq.result.activeWritingSeconds,
            content: getReq.result.content,
            updatedAt: getReq.result.updatedAt,
          } : null,
        });
      };
    }), debugEntryId);
    if (options.required === false) return '';
    await page.screenshot({ path: failOut, fullPage: true }).catch(() => {});
    console.error('[writing-time] completion card missing', JSON.stringify(state, null, 2));
    throw error;
  }
}

async function getStoredSeconds(debugEntryId = entryId) {
  return page.evaluate(id => new Promise(resolve => {
    const req = indexedDB.open('ethos-diary-db');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('entries', 'readonly');
      const getReq = tx.objectStore('entries').get(id);
      getReq.onerror = () => resolve(null);
      getReq.onsuccess = () => resolve(getReq.result?.activeWritingSeconds ?? null);
    };
  }), debugEntryId);
}

try {
  console.log('[writing-time] open base');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  console.log('[writing-time] seed indexeddb');
  await page.evaluate(async id => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('xiang_access_token', 'mock-access-token');
    localStorage.setItem('xiang_refresh_token', 'mock-refresh-token');
    localStorage.setItem('xiang_user', JSON.stringify({
      id: 'test-user',
      username: 'writing-time-tester',
      displayName: 'Writing Time Tester',
    }));
    const openReq = indexedDB.open('ethos-diary-db');
    await new Promise((resolve, reject) => {
      openReq.onerror = () => reject(openReq.error);
      openReq.onupgradeneeded = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains('entries')) {
          const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
          entryStore.createIndex('by-date', 'diaryDate');
          entryStore.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-entry', 'entryId');
        }
        if (!db.objectStoreNames.contains('chatSessions')) {
          const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
          chatStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('customFonts')) {
          db.createObjectStore('customFonts', { keyPath: 'id' });
        }
      };
      openReq.onsuccess = () => resolve(undefined);
    });
    const db = openReq.result;
    const tx = db.transaction('entries', 'readwrite');
    tx.objectStore('entries').put({
      id,
      userId: 'test-user',
      content: '<p>开心的事：</p><p>今天继续分析小象日志产品，记录自己的判断。</p>',
      images: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      diaryDate: '2026-06-05T08:00:00.000Z',
      status: 'active',
      activeWritingSeconds: 14 * 60,
    });
    tx.objectStore('entries').put({
      id: `${id}-five`,
      userId: 'test-user',
      content: '<p>five minute baseline</p>',
      images: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      diaryDate: '2026-06-05T08:00:00.000Z',
      status: 'active',
      activeWritingSeconds: 0,
    });
    tx.objectStore('entries').put({
      id: `${id}-thinking`,
      userId: 'test-user',
      content: '<p>thinking baseline</p>',
      images: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
      diaryDate: '2026-06-05T08:00:00.000Z',
      status: 'active',
      activeWritingSeconds: 0,
    });
    await new Promise(resolve => {
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve(undefined);
    });
  }, entryId);

  console.log('[writing-time] five minute editor open');
  await page.goto(`${baseUrl.replace(/\/$/, '')}/editor?id=${fiveMinuteEntryId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  console.log('[writing-time] five minute edit');
  await insertText(' first stretch', 0);
  // 真实等待超过 1.5 秒自动保存窗口，防止验证脚本再次绕过“自动保存截断思考时间”的回归。
  await sleep(1700);
  await insertText(' second stretch', 65_000);
  await insertText(' third stretch', 145_000);
  await insertText(' fourth stretch', 225_000);
  await insertText(' final stretch', 295_000);
  await clickSave();
  console.log('[writing-time] five minute save');
  await sleep(800);
  const fiveMinuteCompletionText = await getCompletionText(fiveMinuteEntryId, { required: false });
  const fiveMinuteStoredSeconds = await getStoredSeconds(fiveMinuteEntryId);

  console.log('[writing-time] thinking pause editor open');
  await page.goto(`${baseUrl.replace(/\/$/, '')}/editor?id=${thinkingEntryId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  console.log('[writing-time] thinking pause edit');
  await insertText(' first thought', 0);
  await insertText(' after thinking', 150_000);
  await clickSave();
  console.log('[writing-time] thinking pause save');
  await sleep(800);
  const thinkingCompletionText = await getCompletionText(thinkingEntryId, { required: false });
  const thinkingStoredSeconds = await getStoredSeconds(thinkingEntryId);

  console.log('[writing-time] first editor open');
  await page.goto(`${baseUrl.replace(/\/$/, '')}/editor?id=${entryId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  console.log('[writing-time] first edit');
  await insertText('继续补一句。', 1_000);
  await insertText('再补一句。', 2_000);
  await clickSave();
  console.log('[writing-time] first save');
  await sleep(800);
  const firstCompletionText = await getCompletionText(entryId, { required: false });
  const firstStoredSeconds = await getStoredSeconds();

  console.log('[writing-time] second editor open');
  await page.goto(`${baseUrl.replace(/\/$/, '')}/editor?id=${entryId}&round=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  console.log('[writing-time] second edit');
  await insertText('继续编辑一分钟。', 100_000);
  await insertText('第二段。', 130_000);
  await insertText('第三段。', 160_000);
  await clickSave();
  console.log('[writing-time] second save');
  await sleep(800);
  const secondCompletionText = await getCompletionText(entryId, { required: false });
  const secondStoredSeconds = await getStoredSeconds();

  const ok = (!fiveMinuteCompletionText || fiveMinuteCompletionText.includes('用了5分钟'))
    && typeof fiveMinuteStoredSeconds === 'number'
    && fiveMinuteStoredSeconds >= 270
    && fiveMinuteStoredSeconds <= 330
    && (!thinkingCompletionText || thinkingCompletionText.includes('用了3分钟'))
    && typeof thinkingStoredSeconds === 'number'
    && thinkingStoredSeconds >= 150
    && thinkingStoredSeconds <= 210
    && (!firstCompletionText || firstCompletionText.includes('用了14分钟'))
    && (!secondCompletionText || secondCompletionText.includes('用了15分钟'))
    && typeof firstStoredSeconds === 'number'
    && firstStoredSeconds >= 14 * 60
    && firstStoredSeconds < 15 * 60
    && typeof secondStoredSeconds === 'number'
    && secondStoredSeconds >= 15 * 60;

  await page.screenshot({ path: ok ? out : failOut, fullPage: true });
  console.log(JSON.stringify({
    ok,
    out: ok ? out : failOut,
    entryId,
    fiveMinuteEntryId,
    thinkingEntryId,
    fiveMinuteCompletionText,
    thinkingCompletionText,
    firstCompletionText,
    secondCompletionText,
    fiveMinuteStoredSeconds,
    thinkingStoredSeconds,
    firstStoredSeconds,
    secondStoredSeconds,
    responses: responses.slice(-30),
    consoleMessages: consoleMessages.slice(-30),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await browser.close().catch(error => {
    console.warn('[writing-time] browser close warning:', error?.message || error);
  });
}
