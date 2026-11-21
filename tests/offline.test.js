// 配布するファイルとキャッシュの一致、更新・オフライン時の動作を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base, file), 'utf8');

function worker(overrides = {}) {
  const handlers = {};
  const context = vm.createContext({ URL, console,
    self: { location: { origin: 'https://example.test' },
      registration: { scope: 'https://example.test/app/' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    ...overrides });
  vm.runInContext(read('sw.js'), context);
  return { handlers, value: expression => vm.runInContext(expression, context) };
}

test('HTML の読み込み順と PRECACHE が一致し、全ファイルが実在する', () => {
  const html = read('index.html');
  const files = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  const sw = worker();
  const cache = Array.from(sw.value('PRECACHE'));
  assert.ok(files.length > 0);
  assert.deepEqual(cache.filter(file => files.includes(file)), files);
  assert.ok(cache.includes('./') && cache.includes('index.html'));
  assert.ok(cache.includes('assets/mascots/mascot_E.svg'));
  assert.equal(new Set(cache).size, cache.length);
  for (const file of cache) assert.ok(fs.existsSync(path.join(base, file)), file);
  assert.match(sw.value('VERSION'), /^\d{4}-\d{2}-\d{2}-\d+$/);
  assert.equal(sw.value('CACHE_PREFIX'), 'hikari-board-');
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//i);
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /name="theme-color" content="#1A5CFF"/);
});

test('manifest は日本語の単独アプリとして開く', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'ひかりボード');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.theme_color, '#1A5CFF');
  assert.equal(manifest.background_color, '#EEF3FF');
});

test('install は必要なファイルをまとめてキャッシュする', async () => {
  let added;
  const sw = worker({ caches: { open: async () => ({ addAll: async files => { added = Array.from(files); } }) } });
  let pending;
  sw.handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(added, Array.from(sw.value('PRECACHE')));
});

test('activate は自分の古い版だけを消す', async () => {
  const deleted = [];
  const sw = worker({ caches: { keys: async () => ['other-app', 'hikari-board-old', sw.value('CACHE_NAME')],
    delete: async key => { deleted.push(key); } } });
  let pending;
  sw.handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['hikari-board-old']);
});

test('オフラインでも ?board= 付きの移動はキャッシュ済みの入口を返す', async () => {
  const page = { status: 200 };
  const requested = [];
  const sw = worker({ caches: { open: async () => ({ match: async key => {
    requested.push(key); return String(key).endsWith('/index.html') ? page : undefined;
  } }) }, fetch: async () => { throw new Error('offline'); } });
  let response;
  sw.handlers.fetch({ request: { url: 'https://example.test/app/?board=lens', method: 'GET', mode: 'navigate' },
    respondWith: promise => { response = promise; } });
  assert.equal(await response, page);
  assert.ok(requested.includes('https://example.test/app/index.html'));
});

test('他のサイトや POST は Service Worker が処理しない', () => {
  const sw = worker();
  for (const request of [{ url: 'https://elsewhere.test/', method: 'GET' },
    { url: 'https://example.test/app/', method: 'POST' }]) {
    sw.handlers.fetch({ request, respondWith: () => assert.fail('対象外の通信') });
  }
});

test('キャッシュにあるファイルはネットワークを呼ばずに返す', async () => {
  const asset = { status: 200 };
  const sw = worker({ caches: { open: async () => ({ match: async () => asset }) },
    fetch: () => assert.fail('キャッシュ優先') });
  let response;
  sw.handlers.fetch({ request: { url: 'https://example.test/app/js/scene.js', method: 'GET' },
    respondWith: promise => { response = promise; } });
  assert.equal(await response, asset);
});

test('Service Worker は http(s) だけで登録し、利用不可でも続ける', async () => {
  const app = require('../js/app.js');
  let registered = 0, warnings = 0;
  const win = { location: { protocol: 'file:' }, console: { warn() { warnings++; } },
    navigator: { serviceWorker: { register: async url => { assert.equal(url, './sw.js'); registered++; } } } };
  app.registerWorker(win); assert.equal(registered, 0);
  win.location.protocol = 'https:';
  app.registerWorker(win); assert.equal(registered, 1);
  win.navigator.serviceWorker.register = () => Promise.reject(new Error('unavailable'));
  app.registerWorker(win); await Promise.resolve(); assert.equal(warnings, 1);
  win.navigator.serviceWorker.register = () => { throw new Error('blocked'); };
  assert.doesNotThrow(() => app.registerWorker(win)); assert.equal(warnings, 2);
  delete win.navigator.serviceWorker;
  assert.doesNotThrow(() => app.registerWorker(win)); assert.equal(warnings, 3);
});
