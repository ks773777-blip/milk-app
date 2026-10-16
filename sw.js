/* Milk Manager service worker — offline-first, but always fresh when online */
const CACHE = 'milk-app-v8';
const ASSETS = ['./', './index.html', './milk-app.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle our own static files; never touch Google APIs / GIS / Drive.
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate' || req.destination === 'document'
    || url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if (isDoc) {
    // Network-first so app updates arrive immediately; fall back to cache offline.
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(cc => cc.put(req, c)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./milk-app.html')))
    );
    return;
  }

  // Cache-first for icons / manifest / scripts.
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(cc => cc.put(req, c)).catch(() => {}); }
      return res;
    }))
  );
});

/* Best-effort periodic sync (Chrome, installed PWA only): wake open pages to sync Drive. */
self.addEventListener('periodicsync', (e) => {
  if (e.tag !== 'milk-drive-sync') return;
  e.waitUntil((async () => {
    try {
      const cs = await self.clients.matchAll({ includeUncontrolled: true });
      cs.forEach(c => c.postMessage({ type: 'drive-sync' }));
    } catch (_) {}
  })());
});
