// Juno service worker — offline app shell + FCM background notifications.
// Bump CACHE on each release to refresh.

// --- Firebase Cloud Messaging (compat SDK via importScripts; wrapped so offline eval can't break caching) ---
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyCTSAzNoTabUNjHfurN6FKyhRYysXc9Vkc',
    authDomain: 'juno-a6adc.firebaseapp.com',
    projectId: 'juno-a6adc',
    storageBucket: 'juno-a6adc.firebasestorage.app',
    messagingSenderId: '398767139031',
    appId: '1:398767139031:web:95667f614d559374226892',
  });
  firebase.messaging().onBackgroundMessage((payload) => {
    const d = payload.data || payload.notification || {};
    self.registration.showNotification(d.title || 'Juno', {
      body: d.body || '', icon: './icon.svg', badge: './icon.svg',
      data: { url: (payload.data && payload.data.url) || './' },
    });
  });
} catch (e) { /* offline or messaging unsupported — notifications just won't work this load */ }

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});

const CACHE = 'juno-v0.7.7';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './icon.svg', './manifest.webmanifest',
  './js/dates.js', './js/predict.js', './js/fertility.js', './js/nfp.js', './js/mood.js', './js/alerts.js', './js/stats.js', './js/push.js', './js/firebase.js', './js/store.js', './js/ui.js',
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
