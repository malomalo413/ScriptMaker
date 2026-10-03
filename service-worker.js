const CACHE_NAME = 'script-assistant-pwa-v76';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css?v=63',
  './js/firebase-config.js?v=30',
  './js/vendor/Sortable.min.js?v=1.15.0',
  './js/firebase-share.js?v=39',
  './js/share-crypto.js?v=1',
  './js/app/01-core-auth.js?v=77',
  './js/app/02-backup-sync.js?v=77',
  './js/app/03-data-import.js?v=77',
  './js/app/04-storage-projects.js?v=77',
  './js/app/05-wallpaper.js?v=77',
  './js/app/06-characters-display.js?v=77',
  './js/app/07-timeline-editing.js?v=77',
  './js/app/08-share-cloud.js?v=77',
  './js/app/09-ui-startup.js?v=77',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/opening-background.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (requestUrl.origin !== location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  if (['script', 'style', 'worker'].includes(event.request.destination)) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

