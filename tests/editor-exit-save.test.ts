import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer';

const APP_URL = 'http://localhost:3000';
const EDITOR_URL = `${APP_URL}/editor`;

type StoredEntry = {
  id: string;
  content: string;
  images: string[];
  status: string;
  diaryDate: string;
  updatedAt: string;
};

type StoredHistory = {
  id: string;
  entryId: string;
  content: string;
  images: string[];
  savedAt: string;
};

declare global {
  interface Window {
    __diaryTestDb: {
      clear: () => Promise<void>;
      seedEntry: (entry: StoredEntry) => Promise<void>;
      getEntries: () => Promise<StoredEntry[]>;
      getHistory: () => Promise<StoredHistory[]>;
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(
  description: string,
  predicate: () => Promise<boolean>,
  timeoutMs = 8000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const DB_HELPER_SOURCE = String.raw`
(() => {
  const DB_NAME = 'ethos-diary-db';
  const DB_VERSION = 4;

  function ensureStores(db) {
    if (!db.objectStoreNames.contains('entries')) {
      const store = db.createObjectStore('entries', { keyPath: 'id' });
      store.createIndex('by-date', 'diaryDate');
      store.createIndex('by-status', 'status');
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
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => ensureStores(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  window.__diaryTestDb = {
    async clear() {
      localStorage.clear();
      sessionStorage.clear();
      const db = await openDb();
      const stores = Array.from(db.objectStoreNames);
      if (stores.length > 0) {
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(store => tx.objectStore(store).clear());
        await transactionDone(tx);
      }
      db.close();
    },
    async seedEntry(entry) {
      const db = await openDb();
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(entry);
      await transactionDone(tx);
      db.close();
    },
    async getEntries() {
      const db = await openDb();
      const tx = db.transaction('entries', 'readonly');
      const entries = await requestToPromise(tx.objectStore('entries').getAll());
      db.close();
      return entries;
    },
    async getHistory() {
      const db = await openDb();
      const tx = db.transaction('history', 'readonly');
      const history = await requestToPromise(tx.objectStore('history').getAll());
      db.close();
      return history;
    },
  };
})();
`;

async function installDbHelpers(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(DB_HELPER_SOURCE);
}

async function ensureDbHelpers(page: Page): Promise<void> {
  await page.evaluate(DB_HELPER_SOURCE);
}

async function resetApp(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await ensureDbHelpers(page);
  await page.evaluate(() => window.__diaryTestDb.clear());
}

async function openEditor(page: Page, id?: string): Promise<void> {
  await page.goto(id ? `${EDITOR_URL}?id=${encodeURIComponent(id)}` : EDITOR_URL, { waitUntil: 'domcontentloaded' });
  await ensureDbHelpers(page);
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.click('.ProseMirror');
}

async function typeDiaryText(page: Page, text: string): Promise<void> {
  await page.click('.ProseMirror');
  await page.keyboard.type(text, { delay: 5 });
}

async function dispatchPageHide(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
  });
}

async function getEntries(page: Page): Promise<StoredEntry[]> {
  return page.evaluate(() => window.__diaryTestDb.getEntries());
}

async function getHistory(page: Page): Promise<StoredHistory[]> {
  return page.evaluate(() => window.__diaryTestDb.getHistory());
}

async function assertSingleEntryWith(page: Page, marker: string): Promise<StoredEntry> {
  const entries = await getEntries(page);
  const matches = entries.filter(entry => entry.status === 'active' && entry.content.includes(marker));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one active entry containing "${marker}", got ${matches.length}; entries=${JSON.stringify(entries)}`);
  }
  return matches[0];
}

async function runNewEntryAutosave(page: Page): Promise<void> {
  await resetApp(page);
  await openEditor(page);
  const marker = `P0 autosave ${Date.now()}`;
  await typeDiaryText(page, marker);

  await waitFor('new entry autosave', async () => {
    const entries = await getEntries(page);
    return entries.filter(entry => entry.status === 'active' && entry.content.includes(marker)).length === 1;
  });

  await assertSingleEntryWith(page, marker);
}

async function runNewEntryPageHide(page: Page): Promise<void> {
  await resetApp(page);
  await openEditor(page);
  const marker = `P0 pagehide ${Date.now()}`;
  await typeDiaryText(page, marker);
  await dispatchPageHide(page);

  await waitFor('new entry pagehide save', async () => {
    const entries = await getEntries(page);
    return entries.filter(entry => entry.status === 'active' && entry.content.includes(marker)).length === 1;
  });

  await assertSingleEntryWith(page, marker);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 8000 },
    marker,
  );
}

async function runExistingPageHideWithHistory(page: Page): Promise<void> {
  await resetApp(page);
  const existingId = 'p0-existing-entry';
  const now = new Date().toISOString();
  await page.evaluate((entry) => window.__diaryTestDb.seedEntry(entry), {
    id: existingId,
    content: '<p>old baseline</p>',
    images: [],
    status: 'active',
    diaryDate: now,
    createdAt: now,
    updatedAt: now,
  } as StoredEntry & { createdAt: string });

  await openEditor(page, existingId);
  await page.keyboard.press('End');
  const marker = ` P0 existing ${Date.now()}`;
  await typeDiaryText(page, marker);
  await dispatchPageHide(page);

  await waitFor('existing entry pagehide update', async () => {
    const entries = await getEntries(page);
    return entries.some(entry => entry.id === existingId && entry.content.includes(marker));
  });

  const history = await getHistory(page);
  if (!history.some(item => item.entryId === existingId && item.content.includes('old baseline'))) {
    throw new Error(`Expected edit history to preserve old content; history=${JSON.stringify(history)}`);
  }
}

async function runNoDuplicateFlush(page: Page): Promise<void> {
  await resetApp(page);
  await openEditor(page);
  const marker = `P0 duplicate guard ${Date.now()}`;
  await typeDiaryText(page, marker);
  await dispatchPageHide(page);
  await dispatchPageHide(page);

  await waitFor('duplicate guarded entry save', async () => {
    const entries = await getEntries(page);
    return entries.filter(entry => entry.status === 'active' && entry.content.includes(marker)).length === 1;
  });

  await assertSingleEntryWith(page, marker);
}

async function runImageOnlyAutosave(page: Page): Promise<void> {
  await resetApp(page);
  await openEditor(page);

  const pngPath = path.join(os.tmpdir(), `xiaoxiang-p0-${Date.now()}.png`);
  fs.writeFileSync(
    pngPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lqkZ3wAAAABJRU5ErkJggg==',
      'base64',
    ),
  );

  try {
    const input = await page.$('input[type="file"]') as ElementHandle<HTMLInputElement> | null;
    if (!input) throw new Error('Image file input not found');
    await input.uploadFile(pngPath);

    await waitFor('image-only autosave', async () => {
      const entries = await getEntries(page);
      return entries.filter(entry => entry.status === 'active' && entry.images.length === 1).length === 1;
    });
  } finally {
    fs.rmSync(pngPath, { force: true });
  }
}

async function main(): Promise<void> {
  try {
    const resp = await fetch(EDITOR_URL, { method: 'GET' });
    if (!resp.ok) throw new Error(`dev server returned ${resp.status}`);
  } catch (err: any) {
    console.error(`[editor-exit-save] dev server is not running at ${EDITOR_URL}; start npm run dev first.`, err?.message ?? err);
    process.exitCode = 2;
    return;
  }

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await installDbHelpers(page);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);

    const cases: Array<[string, () => Promise<void>]> = [
      ['new entry autosaves without tapping save', () => runNewEntryAutosave(page)],
      ['new entry pagehide flushes immediately', () => runNewEntryPageHide(page)],
      ['existing entry pagehide updates entry and keeps history', () => runExistingPageHideWithHistory(page)],
      ['repeated autosave/pagehide does not duplicate entries', () => runNoDuplicateFlush(page)],
      ['image-only draft autosaves', () => runImageOnlyAutosave(page)],
    ];

    for (const [name, run] of cases) {
      console.log(`[editor-exit-save] running: ${name}`);
      await run();
      console.log(`[editor-exit-save] passed: ${name}`);
    }

    console.log('[editor-exit-save] all checks passed');
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('[editor-exit-save] failed:', err);
  process.exitCode = 1;
});
