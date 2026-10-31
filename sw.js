// Offline support. Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'wordbank-s2-4';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/data.js',
  'js/store.js',
  'js/srs.js',
  'js/speech.js',
  'js/ui.js',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'data/index.json',
  'data/pack-001.json',
  'data/pack-002.json',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files.
  const fresh = SHELL.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts: serve from cache, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== location.origin) return;

  // Pages and word packs: try the network first so new words arrive, fall back to cache offline.
  if (req.mode === 'navigate' || url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetchAndStore(req)));
});

async function fetchAndStore(req) {
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    const cache = await caches.open(VERSION);
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req) {
  try {
    return await fetchAndStore(req);
  } catch {
    return (await caches.match(req)) || (await caches.match('index.html'));
  }
}

async function staleWhileRevalidate(req) {
  const hit = await caches.match(req);
  const fresh = fetchAndStore(req).catch(() => hit);
  return hit || fresh;
}
