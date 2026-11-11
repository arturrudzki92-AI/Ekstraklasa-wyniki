/* Wyniki dla Seniorów, niezależny service worker w podfolderze aplikacji. */
const CACHE = 'wyniki-dla-seniorow-v1-0-0';
const ASSETS = ['./', './index.html', './app.js?v=1.0.0', './style.css?v=1.0.0', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // Nie wolno usuwać cache aplikacji dziadka z głównego katalogu.
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith('wyniki-dla-seniorow-') && name !== CACHE)
    .map(name => caches.delete(name)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request,copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
