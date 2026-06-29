const CACHE_NAME = 'promise-electronics-v4';
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
