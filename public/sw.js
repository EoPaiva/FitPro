const CACHE_NAME = 'fitpro-elite-v6';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.hostname.includes('railway.app')) return;
  event.respondWith(fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}); return response; }).catch(() => caches.match(request).then(cached => cached || caches.match('/'))));
});
self.addEventListener('push', event => {
  let data = { title: 'FitPro Elite', body: 'Você tem uma nova atualização.', url: '/' };
  try { data = event.data ? event.data.json() : data; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'FitPro Elite', { body: data.body || 'Nova notificação do FitPro.', icon: '/favicon.svg', badge: '/favicon.svg', data: { url: data.url || '/' }, tag: data.tag || 'fitpro-update', renotify: false }));
});
self.addEventListener('notificationclick', event => { event.notification.close(); const target = event.notification?.data?.url || '/'; event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { for (const client of list) { if ('focus' in client) return client.focus(); } return clients.openWindow(target); })); });
