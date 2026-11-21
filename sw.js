// アプリのファイルを保存し、通信がなくても盤を開けるようにする。
'use strict';
const VERSION = '2026-11-21-6';
const CACHE_PREFIX = 'hikari-board-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/geometry.js', 'js/optics.js', 'js/scene.js', 'js/boards.js',
  'js/entry.js', 'js/view-math.js', 'js/board-view.js', 'js/app.js',
  'assets/mascots/mascot_E.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = self.registration.scope;
  const entry = new URL('index.html', scope).href;
  const home = new URL('./', scope).href;
  const isEntry = request.mode === 'navigate' && [new URL(entry).pathname, new URL(home).pathname].includes(url.pathname);
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(isEntry ? entry : request);
    return cached || fetch(request);
  }));
});
