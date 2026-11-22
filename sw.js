// アプリのファイルを保存し、通信がなくても盤を開けるようにする。
'use strict';
const VERSION = '2026-11-22-3';
const CACHE_PREFIX = 'hikari-board-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const AUDIO_CACHE = 'hikari-board-audio-v1';
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/geometry.js', 'js/optics.js', 'js/scene.js', 'js/boards.js',
  'js/entry.js', 'js/view-math.js', 'content/scripts-light.js', 'content/voice-light.js',
  'js/explain.js', 'js/prefs.js', 'js/voice.js', 'js/board-view.js', 'js/app.js',
  'assets/mascots/mascot_A.svg', 'assets/mascots/mascot_B.svg', 'assets/mascots/mascot_C.svg',
  'assets/mascots/mascot_D.svg', 'assets/mascots/mascot_E.svg', 'assets/mascots/mascot_F.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== AUDIO_CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = self.registration.scope;
  if (url.pathname.startsWith(new URL('assets/audio/', scope).pathname)) {
    event.respondWith(caches.open(AUDIO_CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.status === 200) {
        try {
          await cache.put(request, response.clone());
          const current = new URL(url.href);
          current.searchParams.delete('h');
          for (const key of await cache.keys()) {
            const previous = new URL(key.url), hash = previous.searchParams.get('h');
            previous.searchParams.delete('h');
            if (previous.href === current.href && hash !== url.searchParams.get('h')) await cache.delete(key);
          }
        } catch (error) { console.warn('音声のキャッシュを更新できませんでした。', error); }
      }
      return response;
    }));
    return;
  }
  const entry = new URL('index.html', scope).href;
  const home = new URL('./', scope).href;
  const isEntry = request.mode === 'navigate' && [new URL(entry).pathname, new URL(home).pathname].includes(url.pathname);
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(isEntry ? entry : request);
    return cached || fetch(request);
  }));
});
