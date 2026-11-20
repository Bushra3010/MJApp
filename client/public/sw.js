// Milo Julo service worker: offline app shell + push notifications. API and socket traffic is never cached.
const CACHE = 'mj-shell-v1';
const SHELL = ['/', '/logo.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/uploads')) return;
  if (e.request.mode === 'navigate') {
    // network first, so a new deploy shows up immediately; cached shell when offline
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put('/', r.clone())); return r; }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // hashed build files never change
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Milo Julo', body: e.data?.text() }; }
  e.waitUntil((async () => {
    // Don't double-notify when the app is already open and visible.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible') && !d.call) return;
    await self.registration.showNotification(d.title || 'Milo Julo', {
      body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, renotify: !!d.call,
      requireInteraction: !!d.call, vibrate: d.call ? [400, 200, 400, 200, 400] : [100], data: { url: d.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((x) => new URL(x.url).origin === location.origin);
    if (w) { await w.focus(); w.navigate(url).catch(() => {}); } else await self.clients.openWindow(url);
  })());
});
