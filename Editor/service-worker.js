const CACHE_NAME = 'scriptmaker-editor-v46';
const APP_SHELL = ['./','./index.html','./manifest.json','../css/styles.css?v=51','../js/firebase-config.js?v=30','../js/firebase-share.js?v=37','../js/app.js?v=60','../assets/icons/icon-192.png','../assets/icons/icon-512.png','../assets/images/opening-background.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('./index.html'))); return; }
  if (url.origin !== location.origin) { event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); return; }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; })));
});
