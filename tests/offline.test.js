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
  assert.ok(cache.includes('assets/pen.svg'));
  for (const file of ['js/force.js', 'content/scripts-force.js', 'content/voice-force.js',
    'js/picture.js', 'content/scripts-bio1.js', 'content/voice-bio1.js', 'content/scripts-bio2.js', 'content/voice-bio2.js']) {
    assert.ok(files.includes(file)); assert.ok(cache.includes(file));
  }
  assert.ok(files.indexOf('js/force.js') < files.indexOf('js/scene.js'));
  assert.ok(files.indexOf('js/picture.js') < files.indexOf('js/scene.js'));
  const pictures = fs.readdirSync(path.join(base, 'assets/images/bio1'));
  assert.equal(pictures.length, 10);
  const bio2 = fs.readdirSync(path.join(base, 'assets/images/bio2'));
  assert.equal(bio2.length, 6);
  bio2.forEach(file => assert.ok(cache.includes('assets/images/bio2/' + file), file));
  pictures.forEach(file => assert.ok(cache.includes('assets/images/bio1/' + file), file));
  assert.ok(files.indexOf('content/scripts-light.js') < files.indexOf('content/scripts-force.js'));
  assert.ok(cache.every(file => !file.endsWith('.mp3')));
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
  const sw = worker({ caches: { keys: async () => ['other-app', 'hikari-board-old', 'hikari-board-audio-v1', sw.value('CACHE_NAME')],
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

test('説明用JSと先生6体を事前保存し、音声は事前保存しない。依存は描画・アプリより先に読む', () => {
  const html = read('index.html'), cache = Array.from(worker().value('PRECACHE'));
  const dependencies = ['js/sound.js', 'content/scripts-light.js', 'content/scripts-sound.js',
    'content/voice-light.js', 'content/voice-sound.js', 'js/explain.js', 'js/prefs.js', 'js/voice.js'];
  for (const file of dependencies) {
    assert.ok(cache.includes(file), file);
    assert.ok(html.indexOf(file) > html.indexOf('js/config.js'));
    assert.ok(html.indexOf(file) < html.indexOf('js/board-view.js'));
    assert.ok(html.indexOf(file) < html.indexOf('js/app.js'));
  }
  for (const id of 'ABCDEF') assert.ok(cache.includes('assets/mascots/mascot_' + id + '.svg'));
  assert.ok(cache.every(file => !file.startsWith('assets/audio/')));
  assert.equal(worker().value('AUDIO_CACHE'), 'hikari-board-audio-v1');
});

test('HTML の順で全 JS を読むと音の3盤・台本・音声を利用できる', () => {
  const context = vm.createContext({ URL });
  for (const [, file] of read('index.html').matchAll(/<script defer src="([^"]+)"/g)) vm.runInContext(read(file), context);
  for (const id of ['sound-wave', 'sound-string', 'sound-speed']) {
    assert.equal(context.Hikari.scene.trace(context.Hikari.boards.get(id).scene).sound.kind, id);
    assert.equal(context.Hikari.scriptsSound.BOARDS[id].length, 9);
    assert.equal(context.Hikari.voiceDataSound.CLIPS[id].E.length, 9);
  }
  assert.equal(context.Hikari.voiceDataSound.BASE, 'assets/audio/sound/');
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals']) {
    assert.equal(context.Hikari.scene.trace(context.Hikari.boards.get(id).scene).picture.kind, id);
    assert.equal(context.Hikari.scriptsBio1.BOARDS[id].length, 9);
    assert.equal(context.Hikari.voiceDataBio1.CLIPS[id].E.length, 9);
  }
});

test('音の音声も専用キャッシュに保存し、保存済みなら通信しない', async () => {
  const asset = { status: 200, clone() { return this; } }, saved = new Map();
  let calls = 0;
  const sw = worker({ caches: { open: async name => {
    assert.equal(name, 'hikari-board-audio-v1');
    return { match: async request => saved.get(request.url), put: async (request, response) => saved.set(request.url, response), keys: async () => [] };
  } }, fetch: async () => { calls++; return asset; } });
  const request = { url: 'https://example.test/app/assets/audio/sound/sound-wave/E/01.mp3?h=123456789abc', method: 'GET' };
  for (let i = 0; i < 2; i++) {
    let response; sw.handlers.fetch({ request, respondWith: promise => { response = promise; } });
    assert.equal(await response, asset);
  }
  assert.equal(calls, 1); assert.equal(saved.size, 1);
});

test('音声専用キャッシュを先に見て、通信せず返す', async () => {
  const asset = { status: 200 }, opened = [];
  const sw = worker({ caches: { open: async name => { opened.push(name); return { match: async () => asset }; } },
    fetch: () => assert.fail('保存済み音声は通信しない') });
  let response;
  sw.handlers.fetch({ request: { url: 'https://example.test/app/assets/audio/light/reflect/E/01.mp3', method: 'GET' },
    respondWith: promise => { response = promise; } });
  assert.equal(await response, asset); assert.deepEqual(opened, ['hikari-board-audio-v1']);
});

for (const status of [200, 206, 404, 500]) {
  test(`未保存の音声: status ${status} は200のときだけ保存する`, async () => {
    const copy = {}, asset = { status, clone: () => copy }, put = [];
    const request = { url: 'https://example.test/app/assets/audio/light/reflect/E/01.mp3', method: 'GET' };
    const sw = worker({ caches: { open: async () => ({ match: async () => undefined,
      put: async (...args) => put.push(args), keys: async () => [] }) }, fetch: async () => asset });
    let response; sw.handlers.fetch({ request, respondWith: promise => { response = promise; } });
    assert.equal(await response, asset);
    assert.deepEqual(put, status === 200 ? [[request, copy]] : []);
  });
}

test('未保存の音声が通信に失敗したら、失敗をアプリへ返す', async () => {
  const failure = new Error('offline');
  const sw = worker({ caches: { open: async () => ({ match: async () => undefined,
    put: () => assert.fail('保存しない') }) }, fetch: async () => { throw failure; } });
  let response;
  sw.handlers.fetch({ request: { url: 'https://example.test/app/assets/audio/light/reflect/E/01.mp3', method: 'GET' },
    respondWith: promise => { response = promise; } });
  await assert.rejects(response, error => error === failure);
});

function audioCache(options = {}) {
  const prefix = 'https://example.test/app/', file = prefix + 'assets/audio/light/reflect/E/01.mp3';
  const entries = new Map(), opened = [], fetched = [], deleted = [], warnings = [];
  const asset = new Response('new voice', { status: options.status || 200 });
  const sw = worker({ console: { warn: (...args) => warnings.push(args) },
    caches: { open: async name => {
      opened.push(name);
      return {
        match: async (request, matchOptions = {}) => {
          if (matchOptions.ignoreSearch) return [...entries].find(([url]) => url.split('?')[0] === request.url.split('?')[0])?.[1];
          return entries.get(request.url);
        },
        put: async (request, response) => {
          if (options.fail === 'put') throw new Error('full');
          entries.set(request.url, response);
        },
        keys: async () => [...entries.keys()].map(url => ({ url })),
        delete: async request => {
          if (options.fail === 'delete') throw new Error('cannot delete');
          deleted.push(request.url); return entries.delete(request.url);
        },
      };
    } },
    fetch: async request => {
      fetched.push(request.url);
      if (options.fail === 'fetch') throw new Error('offline');
      return asset;
    },
  });
  function request(url) {
    let response;
    sw.handlers.fetch({ request: { url, method: 'GET' }, respondWith: promise => { response = promise; } });
    return response;
  }
  return { prefix, file, entries, opened, fetched, deleted, warnings, asset, request, sw };
}

test('新しい印の音声を通信で保存し、同じパスで印だけ違う古い音声を消す', async () => {
  const f = audioCache(), old = new Response('old voice');
  f.entries.set(f.file + '?h=aaa', old);
  const unrelated = [f.file.replace('01.mp3', '02.mp3') + '?h=aaa', f.file + '?h=aaa&other=1'];
  unrelated.forEach(url => f.entries.set(url, old));
  const response = await f.request(f.file + '?h=bbb');
  assert.equal(response, f.asset); assert.equal(await response.text(), 'new voice');
  assert.deepEqual(f.fetched, [f.file + '?h=bbb']);
  assert.deepEqual(f.deleted, [f.file + '?h=aaa']);
  assert.equal(f.entries.has(f.file + '?h=aaa'), false);
  assert.equal(await f.entries.get(f.file + '?h=bbb').clone().text(), 'new voice');
  unrelated.forEach(url => assert.ok(f.entries.has(url)));
  assert.deepEqual(f.warnings, []);
});

test('同じ印をもう一度求めると保存した音声を返し、通信しない', async () => {
  const f = audioCache(), url = f.file + '?h=bbb';
  await f.request(url);
  assert.equal(await f.request(url), f.entries.get(url));
  assert.deepEqual(f.fetched, [url]);
  assert.deepEqual(f.opened, [f.sw.value('AUDIO_CACHE'), f.sw.value('AUDIO_CACHE')]);
});

for (const fail of ['put', 'delete']) {
  test(`音声キャッシュの${fail}が失敗しても、通信の200応答をそのまま返す`, async () => {
    const f = audioCache({ fail });
    f.entries.set(f.file + '?h=aaa', new Response('old voice'));
    const response = await f.request(f.file + '?h=bbb');
    assert.equal(response, f.asset); assert.equal(response.status, 200);
    assert.equal(await response.text(), 'new voice');
    assert.equal(f.warnings.length, 1);
    assert.equal(f.entries.has(f.file + '?h=aaa'), true);
    assert.equal(f.entries.has(f.file + '?h=bbb'), fail === 'delete');
  });
}

test('新しい印が未保存で通信に失敗したら、別の印の音声で代用しない', async () => {
  const f = audioCache({ fail: 'fetch' });
  f.entries.set(f.file + '?h=aaa', new Response('old voice'));
  await assert.rejects(f.request(f.file + '?h=bbb'), /offline/);
  assert.equal(f.entries.has(f.file + '?h=bbb'), false);
  assert.deepEqual(f.deleted, []);
});

test('新しい印の404応答は保存せず、そのまま返して古い保存も残す', async () => {
  const f = audioCache({ status: 404 });
  f.entries.set(f.file + '?h=aaa', new Response('old voice'));
  assert.equal(await f.request(f.file + '?h=bbb'), f.asset);
  assert.equal(f.entries.has(f.file + '?h=bbb'), false);
  assert.deepEqual(f.deleted, []);
});

test('音声以外はアプリ本体のキャッシュを使い、未保存なら通信の応答を返す', async () => {
  const f = audioCache(), url = f.prefix + 'js/scene.js', cached = new Response('app');
  f.entries.set(url, cached);
  assert.equal(await f.request(url), cached); assert.deepEqual(f.fetched, []);
  const missing = f.prefix + 'js/app.js';
  assert.equal(await f.request(missing), f.asset);
  assert.deepEqual(f.fetched, [missing]); assert.equal(f.entries.has(missing), false);
  assert.deepEqual(f.opened, [f.sw.value('CACHE_NAME'), f.sw.value('CACHE_NAME')]);
});
