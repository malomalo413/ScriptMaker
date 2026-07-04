const CACHE_NAME = 'scriptmaker-viewer-v14';
const APP_SHELL = ['./','./index.html','./manifest.json','./css/viewer.css?v=13','../js/firebase-config.js?v=30','../js/firebase-share.js?v=31','./js/viewer.js?v=13','../assets/icons/icon-192.png','../assets/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('./index.html'))); return; }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; }).catch(() => cached)));
});
