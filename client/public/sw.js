const CACHE_NAME = 'promise-electronics-v6';
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
  '/',
  '/offline.html',
  '/logo.png',
  '/favicon.png',
  '/manifest.json',
  '/manifest-admin.json',
  '/manifest-corporate.json'
];

const NON_CACHEABLE_PATHS = [
  '/api/',
  '/sse',
  '/events',
  '/webhook',
  '/auth',
  '/session',
  '/login',
  '/logout',
  '/admin/mutations',
  '/admin/data',
];

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (url.origin !== self.location.origin) return false;
  if (pathname.startsWith('/assets/')) return false;

  if (NON_CACHEABLE_PATHS.some((path) => pathname.startsWith(path))) return false;

  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) return false;

  return true;
}

function isCacheableResponse(request, response) {
  if (!isCacheableRequest(request)) return false;
  if (request.mode === 'navigate') return false;
  if (!response || response.status !== 200 || response.type !== 'basic') return false;

  const url = new URL(request.url);
  const pathname = url.pathname;
  const accept = request.headers.get('accept') || '';

  if (pathname.endsWith('.html') && !pathname.endsWith('/offline.html')) return false;
  if (accept.includes('text/html')) return false;

  return true;
}

function safeCachePut(cache, request, response) {
  return cache.put(request, response).catch(() => undefined);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/* ─── Push notifications ──────────────────────────────────────────────────
 *
 * These two listeners are what make notifications work while the app is
 * CLOSED. Without them the browser receives the push and discards it, which is
 * why notifications previously only appeared while a tab was open (that path
 * is SSE, and SSE dies with the page).
 *
 * The server sends via FCM (server/pushService.ts). Between events nothing runs
 * here: the browser's push service does the waiting, not our server, so this
 * costs nothing at idle.
 *
 * FCM delivers either `notification` (display payload) or `data` (custom
 * payload) — handle both, since the shape depends on how the message was sent.
 */

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    const json = event.data.json();
    return { ...(json.notification ?? {}), ...(json.data ?? {}), ...json };
  } catch {
    // Non-JSON payload — treat the raw text as the body.
    try { return { body: event.data.text() }; } catch { return {}; }
  }
}

self.addEventListener('push', (event) => {
  const p = readPushPayload(event);

  const title = p.title || 'Promise Electronics';
  const options = {
    body: p.body || '',
    icon: p.icon || '/logo.png',
    badge: '/favicon.png',
    // Same tag replaces an existing notification instead of stacking duplicates.
    tag: p.tag || p.collapseKey || undefined,
    renotify: Boolean(p.tag),
    requireInteraction: p.requireInteraction === true || p.requireInteraction === 'true',
    data: { url: p.route || p.url || p.click_action || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.url || '/';
  const targetUrl = new URL(target, self.location.origin).href;

  // Prefer focusing an already-open tab over opening a duplicate window.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      for (const client of clientList) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => c && c.focus());
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return;

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isCacheableResponse(event.request, response)) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => safeCachePut(cache, event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(OFFLINE_URL).then((response) => response || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          }));
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isCacheableResponse(event.request, response)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => safeCachePut(cache, event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((response) => response || new Response('', {
        status: 504,
        statusText: 'Gateway Timeout'
      })))
  );
});
