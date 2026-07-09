// Juno service worker — offline app shell. Bump CACHE on each release to refresh.
const CACHE = 'juno-v0.1.0';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './icon.svg', './manifest.webmanifest',
  './js/dates.js', './js/predict.js', './js/fertility.js', './js/firebase.js', './js/store.js', './js/ui.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // never cache Firebase / cross-origin API traffic
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  // network-first for our own files so pushes go live quickly; fall back to cache offline
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
