import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const baseUrl = process.env.ECHO_VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const isRemoteVerify = /^https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(baseUrl);
const out = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-ai-success-online-2026-06-05.png'
  : 'daily-echo-ai-success-2026-06-05.png');
const completionOut = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-completion-card-online-2026-06-05.png'
  : 'daily-echo-completion-card-2026-06-05.png');
const shareCardOut = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-share-card-online-2026-06-05.png'
  : 'daily-echo-share-card-2026-06-05.png');
const failOut = path.resolve('artifacts', isRemoteVerify
  ? 'daily-echo-ai-debug-fail-online-2026-06-05.png'
  : 'daily-echo-ai-debug-fail-2026-06-05.png');

const diaryText = `开心的事：
无

充实的事：
1，继续迭代小象回声提示词，方向是从对事件的表面回应转向对用户的洞察，未来的方向可能是结合一周的日志来分析，但好像有点太散了，聚焦一到两点深入谈谈会不会更好，一是担心冗余，二是长了也不乐意看
2，高频关键词进行优化，从纯词频到提炼意义显示，减少无意义的词出现

感谢的人：
我中午想午睡，室友调低声音，感谢

改进的事：
黑眼圈出来了，看来不能熬夜写日志了，提前写完日志

今日思考：
“如果我是老师，我不希望我成为我的学生”
这句话或许也是我高中的写照。`;

const echoText = `洞察草稿：
今日主线：产品判断、表达聚焦和生活节奏同时被看见
核心矛盾：想让回声更有洞察，又担心太散太长
人格特质：会复盘、会校准，也很在意真实体验
成长方向：把复杂观察收束到一两个可行动点

今日回声：你在校准产品，也在校准自己的节奏

用户可见回声：
今天你继续迭代小象回声提示词，把它从“事件表面回应”往“用户洞察”推进，这个方向很清楚。你也看见自己想结合一周日志分析，却担心太散、太长；于是开始思考聚焦一到两点，避免冗余。高频关键词从纯词频走向提炼意义，室友中午调低声音、黑眼圈提醒你提前写完日志，这些细节都在说明：你不是只做功能，也在校准产品和自己的节奏。`;

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
const consoleMessages = [];
const responses = [];
let chatCompleteCalls = 0;
let syncPushCalls = 0;

page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`pageerror: ${err.message}`));
page.on('response', res => {
  const url = res.url();
  if (url.includes('/api/') || url.includes('/editor')) {
    responses.push(`${res.status()} ${url}`);
  }
});

await page.setRequestInterception(true);
page.on('request', request => {
  const url = request.url();

  if (url.includes('/api/chat/complete')) {
    chatCompleteCalls += 1;
    request.respond({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        content: echoText,
        finishReason: 'stop',
      }),
    });
    return;
  }

  if (url.includes('/api/sync/push')) {
    syncPushCalls += 1;
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
        user: { id: 'test-user', username: 'echo-tester' },
      }),
    });
    return;
  }

  request.continue();
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise(resolve => {
      const req = indexedDB.deleteDatabase('ethos-diary-db');
      req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
    });
    localStorage.setItem('xiang_access_token', 'mock-access-token');
    localStorage.setItem('xiang_refresh_token', 'mock-refresh-token');
    localStorage.setItem('xiang_user', JSON.stringify({
      id: 'test-user',
      username: 'echo-tester',
      displayName: 'Echo Tester',
    }));
  });

  await page.goto(`${baseUrl.replace(/\/$/, '')}/editor?e2e=${Date.now()}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.click('.ProseMirror');
  await page.evaluate(text => {
    const editor = document.querySelector('.ProseMirror');
    if (!(editor instanceof HTMLElement)) {
      throw new Error('ProseMirror editor not found');
    }
    editor.focus();
    document.execCommand('insertText', false, text);
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }));
  }, diaryText);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('nav button'));
    const saveButton = buttons[1] || buttons[0];
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });

  await page.waitForSelector('[data-testid="daily-echo-completion-card"]', { timeout: 15000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="daily-echo-elephant"] img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { timeout: 15000 });
  await sleep(300);
  await page.screenshot({ path: completionOut, fullPage: true });
  const completionResult = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="daily-echo-completion-card"]');
    const text = card?.textContent || '';
    return {
      visible: text.includes('今天的你，值得被看见'),
      hasStats: /今天你写了[\d,]+字，用了\d+分钟——这是你连续记录的第\d+天/.test(text),
      text,
    };
  });

  await sleep(1000);
  await page.waitForSelector('[data-testid="daily-echo-elephant"]', { timeout: 15000 });
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="daily-echo-completion-card"]');
    const button = Array.from(card?.querySelectorAll('button') || [])
      .find(item => item.textContent?.includes('获取今日回声'));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(600);

  const result = await page.evaluate(() => {
    const visibleText = document.body.innerText;
    const floating = document.querySelector('[data-testid="daily-echo-floating"]')?.textContent || '';
    const card = document.querySelector('[data-testid="daily-echo-card"]')?.textContent || '';
    return {
      url: location.href,
      failedTextVisible: visibleText.includes('这次小象没有读完整'),
      leakedDraft: ['洞察草稿', '今日主线', '核心矛盾', '人格特质', '成长方向'].some(key => visibleText.includes(key)),
      quoteVisible: visibleText.includes('你在校准产品，也在校准自己的节奏'),
      oldHeaderVisible: Array.from(document.querySelectorAll('[data-testid="daily-echo-floating"] span'))
        .some(span => span.textContent?.trim() === '小象回声'),
      echoVisible: visibleText.includes('今天你继续迭代小象回声提示词'),
      floating,
      card,
    };
  });
  await page.screenshot({ path: out, fullPage: true });

  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(item => item.textContent?.includes('收进这篇'));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button'))
    .some(item => item.textContent?.includes('保存图片')), { timeout: 15000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(item => item.textContent?.includes('保存图片'));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  const savedImageResult = await page.waitForFunction(async () => {
    const entryId = new URL(location.href).searchParams.get('id');
    if (!entryId) return null;
    const dataUrl = await new Promise(resolve => {
      const req = indexedDB.open('ethos-diary-db');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('entries', 'readonly');
        const getReq = tx.objectStore('entries').get(entryId);
        getReq.onerror = () => resolve(null);
        getReq.onsuccess = () => resolve(getReq.result?.dailyEcho?.card?.localDataUrl || null);
      };
    });
    return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') ? dataUrl : null;
  }, { timeout: 30000 });
  const savedImageDataUrl = await savedImageResult.jsonValue();
  if (typeof savedImageDataUrl === 'string') {
    fs.writeFileSync(shareCardOut, Buffer.from(savedImageDataUrl.split(',')[1], 'base64'));
  }

  const ok = completionResult.visible
    && completionResult.hasStats
    && result.quoteVisible
    && result.echoVisible
    && typeof savedImageDataUrl === 'string'
    && !result.oldHeaderVisible
    && !result.failedTextVisible
    && !result.leakedDraft;
  if (!ok) {
    await page.screenshot({ path: failOut, fullPage: true });
  }

  console.log(JSON.stringify({
    ok,
    out: ok ? out : failOut,
    completionOut,
    shareCardOut,
    chatCompleteCalls,
    syncPushCalls,
    completionResult,
    savedImage: {
      ok: typeof savedImageDataUrl === 'string',
      bytes: typeof savedImageDataUrl === 'string' ? Math.round((savedImageDataUrl.length * 3) / 4) : 0,
    },
    result,
    responses: responses.slice(-30),
    consoleMessages: consoleMessages.slice(-30),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
}
