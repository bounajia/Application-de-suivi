/* Only public, static resources enter this cache. Project data and sessions stay on the server. */
const CACHE_NAME = 'suivi-public-v1';
const PUBLIC_FILES = ['/offline.html', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith('suivi-public-') && name !== CACHE_NAME).map((name) => caches.delete(name)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  const publicAsset = PUBLIC_FILES.includes(url.pathname)
    || /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/.test(url.pathname);
  if (!publicAsset) return;

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  }));
});
