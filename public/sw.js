const CACHE_VERSION = 'xiaoxiang-pwa-v8';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/xiaoxiang-pwa-64.png',
  '/icons/xiaoxiang-pwa-180.png',
  '/icons/xiaoxiang-pwa-192.png',
  '/icons/xiaoxiang-pwa-512.png',
];
const PRIVATE_PREFIXES = ['/api/', '/uploads/'];

function isPrivateRequest(url) {
  return url.origin === self.location.origin
    && PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function shouldCacheStatic(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (isPrivateRequest(url)) return false;
  return url.pathname === '/'
    || url.pathname.endsWith('.html')
    || url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/themes/')
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isPrivateRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (!shouldCacheStatic(url, request)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: '小象日志',
      body: event.data ? event.data.text() : '你有一条新提醒',
    };
  }

  const title = payload.title || '小象日志';
  const options = {
    body: payload.body || '你有一条新提醒',
    icon: payload.icon || '/icons/xiaoxiang-pwa-192.png',
    tag: payload.tag || 'xiang-notification',
    renotify: true,
    data: {
      url: payload.url || '/',
      type: payload.type,
      notificationId: payload.notificationId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const sameOriginClient = clients.find((client) => (
          'focus' in client && new URL(client.url).origin === self.location.origin
        ));

        if (sameOriginClient) {
          return sameOriginClient.focus().then((client) => {
            if ('navigate' in client) {
              return client.navigate(absoluteTargetUrl);
            }
            return client;
          });
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(absoluteTargetUrl);
        }

        return undefined;
      }),
  );
});
