const CACHE_VERSION = 'opencompany-pwa-v9';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/offline.html?v=0.10.161',
  '/manifest.webmanifest?v=0.10.161',
  '/favicon.png?v=0.10.161',
  '/favicon.ico?v=0.10.161',
  '/icon-192.png?v=0.10.161',
  '/icon-512.png?v=0.10.161',
  '/icon-maskable-512.png?v=0.10.161',
  '/apple-touch-icon.png?v=0.10.161'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('opencompany-pwa-') && name !== CACHE_VERSION)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html?v=0.10.161'))
    );
  }
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'OpenCompany';
  const options = {
    body: data.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.registration.scope
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }

    return self.clients.openWindow(targetUrl);
  })());
});
