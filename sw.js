// Service worker: makes the game installable and playable offline.
// tools/build-site.mjs stamps BUILD and PRECACHE (the built site without the large pack models,
// which are cached the first time a match loads them). Each build has its
// own cache, so files inside one cache always belong together; old caches are deleted on activate.
// A new worker waits until the page asks for it (src/pwa.js does that at the next start, never
// in the middle of a match).
const BUILD = 'dev';
const PRECACHE = [];
const CACHE = `tds-${BUILD}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tds-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // the page itself: cached copy of this build (query strings like ?map= only pick options)
    const hit = await cache.match(req.mode === 'navigate' ? new Request(new URL('./index.html', self.registration.scope)) : req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return new Response('<h1>TDS is offline</h1><p>Open the game once while online to play offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html' } });
      throw err;
    }
  })());
});
