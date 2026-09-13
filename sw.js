// Fitko service worker — precache jádra, navigace network-first (updaty), zbytek cache-first.
const CACHE = 'fitko-mu03l9my';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Notifikace: payload posílá GitHub Action (scripts/notify.mjs) — { title, body, tag, url }
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Fitko', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Fitko';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'fitko',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { c.navigate(target); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // verze a feed akcí se ptají vždy serveru — jinak by appka nikdy nezjistila, že je něco nového
  if (req.url.includes('version.json') || req.url.includes('akce-lidl.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      const cacheable = res.ok || res.type === 'opaque';
      const isFont = req.url.includes('fonts.gstatic.com') || req.url.includes('fonts.googleapis.com');
      if (cacheable && (req.url.startsWith(self.location.origin) || isFont)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
