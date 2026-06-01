import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer';

const APP_URL = process.env.XIAOXIANG_APP_URL ?? 'http://localhost:3000';
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

async function openEditorPreview(page: Page, id: string): Promise<void> {
  await page.goto(`${EDITOR_URL}?id=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
  await ensureDbHelpers(page);
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
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

async function runEditorTextSelectionScrollGuard(page: Page): Promise<void> {
  await resetApp(page);
  const existingId = 'p0-selection-scroll-guard';
  const now = new Date().toISOString();
  const fillerBefore = Array.from(
    { length: 10 },
    (_, index) => `<p>selection guard filler before ${index}</p>`,
  ).join('');
  const fillerAfter = Array.from(
    { length: 24 },
    (_, index) => `<p>selection guard filler after ${index}</p>`,
  ).join('');
  const imageSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lqkZ3wAAAABJRU5ErkJggg==';

  await page.evaluate((entry) => window.__diaryTestDb.seedEntry(entry), {
    id: existingId,
    content: [
      fillerBefore,
      `<img data-diary-inline-image="true" src="${imageSrc}" alt="selection guard test image">`,
      '<p>selection guard target text should stay steady while selected</p>',
      fillerAfter,
    ].join(''),
    images: [imageSrc],
    status: 'active',
    diaryDate: now,
    createdAt: now,
    updatedAt: now,
  } as StoredEntry & { createdAt: string });

  await openEditor(page, existingId);
  await page.waitForFunction(
    () => document.querySelector('.ProseMirror')?.textContent?.includes('selection guard target text'),
    { timeout: 8000 },
  );

  const result = await page.evaluate(async () => {
    const scrollEl = document.querySelector('main');
    const editorEl = document.querySelector('.ProseMirror');
    const target = Array.from(editorEl?.querySelectorAll('p') ?? []).find((paragraph) => (
      paragraph.textContent?.includes('selection guard target text')
    ));

    if (!(scrollEl instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error('Editor selection guard fixture was not rendered');
    }

    target.scrollIntoView({ block: 'center' });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const baseline = scrollEl.scrollTop;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: rect.left + 24,
      clientY: rect.top + 12,
      button: 0,
    }));

    const textNode = target.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.textContent) {
      throw new Error('Selection target text node was not available');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(textNode.textContent.length, 28));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const selectedRectsBeforeScroll = Array.from(range.getClientRects()).map(rect => ({
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }));
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const forced = baseline + 60;
    scrollEl.scrollTop = forced;
    scrollEl.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise<void>(resolve => setTimeout(resolve, 120));

    const restored = scrollEl.scrollTop;
    target.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: rect.left + 24,
      clientY: rect.top + 12,
      button: 0,
    }));

    return {
      baseline,
      forced,
      restored,
      selectedText: selection?.toString() ?? '',
      selectedRectsBeforeScroll,
      selectedRectsAfterScroll: Array.from(range.getClientRects()).map(rect => ({
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })),
    };
  });

  if (!result.selectedText.includes('selection guard target')) {
    throw new Error(`Expected target text to remain selected; result=${JSON.stringify(result)}`);
  }

  if (result.restored > result.baseline + 24) {
    throw new Error(`Expected selection guard to restore scroll near ${result.baseline}, got ${JSON.stringify(result)}`);
  }
}

async function runExistingEntryPreviewDoesNotAutoFocus(page: Page): Promise<void> {
  await resetApp(page);
  const existingId = 'p0-preview-entry-no-autofocus';
  const now = new Date().toISOString();

  await page.evaluate((entry) => window.__diaryTestDb.seedEntry(entry), {
    id: existingId,
    content: '<p>preview entry should stay quiet until text is tapped</p>',
    images: [],
    status: 'active',
    diaryDate: now,
    createdAt: now,
    updatedAt: now,
  } as StoredEntry & { createdAt: string });

  await openEditorPreview(page, existingId);
  await page.waitForFunction(
    () => document.querySelector('.ProseMirror')?.textContent?.includes('preview entry should stay quiet'),
    { timeout: 8000 },
  );

  const initial = await page.evaluate(() => {
    const editorEl = document.querySelector('.ProseMirror');
    return {
      editorFocused: document.activeElement === editorEl,
    };
  });

  if (initial.editorFocused) {
    throw new Error(`Expected preview entry to open without editor focus; result=${JSON.stringify(initial)}`);
  }

  const guardedClick = await page.evaluate(async () => {
    const scrollEl = document.querySelector('main');
    const blankSurface = document.querySelector('[data-editor-blank-surface="true"]');
    const editorEl = document.querySelector('.ProseMirror');
    if (!(scrollEl instanceof HTMLElement) || !(blankSurface instanceof HTMLElement)) {
      throw new Error('Preview focus fixture was not rendered');
    }

    const rect = blankSurface.getBoundingClientRect();
    blankSurface.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 12,
      clientY: rect.top + 12,
    }));
    await new Promise<void>(resolve => setTimeout(resolve, 80));

    return {
      editorFocused: document.activeElement === editorEl,
    };
  });

  if (guardedClick.editorFocused) {
    throw new Error(`Expected landing/blank click to keep preview quiet; result=${JSON.stringify(guardedClick)}`);
  }

  await new Promise(resolve => setTimeout(resolve, 650));
  await page.click('.ProseMirror p');
  await waitFor('preview text tap focuses editor', async () => (
    page.evaluate(() => document.activeElement === document.querySelector('.ProseMirror'))
  ));
}

async function runTouchScrollKeepsEditorFocused(page: Page): Promise<void> {
  await resetApp(page);
  const existingId = 'p0-touch-scroll-keeps-focus';
  const now = new Date().toISOString();
  const content = Array.from(
    { length: 14 },
    (_, index) => `<p>touch scroll focus paragraph ${index}</p>`,
  ).join('');

  await page.evaluate((entry) => window.__diaryTestDb.seedEntry(entry), {
    id: existingId,
    content,
    images: [],
    status: 'active',
    diaryDate: now,
    createdAt: now,
    updatedAt: now,
  } as StoredEntry & { createdAt: string });

  await openEditor(page, existingId);

  const result = await page.evaluate(async () => {
    const scrollEl = document.querySelector('main');
    const editorEl = document.querySelector('.ProseMirror');
    if (!(scrollEl instanceof HTMLElement) || !(editorEl instanceof HTMLElement)) {
      throw new Error('Editor focus fixture was not rendered');
    }

    editorEl.focus();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const focusedBefore = document.activeElement === editorEl;
    scrollEl.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    return {
      focusedBefore,
      focusedAfter: document.activeElement === editorEl,
      activeTag: document.activeElement?.tagName ?? '',
      activeClass: (document.activeElement as HTMLElement | null)?.className ?? '',
    };
  });

  if (!result.focusedBefore || !result.focusedAfter) {
    throw new Error(`Expected touch scrolling to keep the editor focused; result=${JSON.stringify(result)}`);
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
      ['existing entry preview does not auto-focus', () => runExistingEntryPreviewDoesNotAutoFocus(page)],
      ['text selection does not drift into editor bottom padding', () => runEditorTextSelectionScrollGuard(page)],
      ['touch scrolling keeps editor focused', () => runTouchScrollKeepsEditorFocused(page)],
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
