// にせの Audio・通信・時計で、終了の一度きりの通知と連続操作を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../js/voice.js');
const explain = require('../js/explain.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fake(options = {}) {
  let clock = 0, serial = 0, creates = 0;
  const timers = new Map(), problems = [], revoked = [], fetched = [];
  const audio = { src: '', playbackRate: 1, defaultPlaybackRate: 1, onended: null, onerror: null,
    plays: 0, pauses: 0,
    play() { this.plays++; return options.play ? options.play() : Promise.resolve(); },
    pause() { this.pauses++; },
  };
  const player = voice.createPlayer({
    createAudio() { creates++; return audio; },
    fetchClip(url) { fetched.push(url); return options.fetchClip ? options.fetchClip(url) : Promise.resolve('blob:' + url); },
    setTimer(callback, delay) { const id = ++serial; timers.set(id, { callback, at: clock + delay, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    now: () => clock, onProblem: kind => problems.push(kind), revoke: url => revoked.push(url),
  });
  function tick(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); clock = next[1].at; next[1].callback();
    }
    clock = end;
  }
  return { player, audio, problems, revoked, fetched, timers, tick, creates: () => creates };
}

test('速さは7つの値で上下し、端と不正な値を扱える', () => {
  assert.deepEqual(voice.RATES, [.5, .75, 1, 1.25, 1.5, 1.75, 2]);
  voice.RATES.forEach((rate, index) => {
    assert.equal(voice.stepRate(rate, -1), voice.RATES[Math.max(0, index - 1)]);
    assert.equal(voice.stepRate(rate, 1), voice.RATES[Math.min(6, index + 1)]);
  });
  for (const rate of ['1', .6, 0, -1, 3, NaN, Infinity, null]) assert.equal(voice.stepRate(rate, 1), 1);
});

test('prepare は全成功・一部失敗・全失敗・空の一覧を区別する', async () => {
  const f = fake({ fetchClip: url => url.startsWith('bad') ? Promise.reject(new Error('missing')) : Promise.resolve('blob:' + url) });
  assert.deepEqual(await f.player.prepare(['one', 'two']), { ok: true, failed: 0 });
  assert.deepEqual(await f.player.prepare(['one', 'bad1', 'two']), { ok: false, failed: 1 });
  assert.deepEqual(await f.player.prepare(['bad1', 'bad2']), { ok: false, failed: 2 });
  assert.deepEqual(await f.player.prepare([]), { ok: true, failed: 0 });
  assert.equal(f.creates(), 1);
});

test('prepare は同期例外や空のURLも読み込み失敗として返す', async () => {
  const f = fake({ fetchClip: url => { if (url === 'throw') throw new Error('missing'); return Promise.resolve(''); } });
  assert.deepEqual(await f.player.prepare(['throw', 'empty']), { ok: false, failed: 2 });
});

test('音声は一つだけ作って使い回し、終了を一度だけ通知する', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one', 'two']);
  f.player.play(0, 10, 1.25, () => ends++);
  assert.equal(f.audio.src, 'blob:one');
  assert.equal(f.audio.playbackRate, 1.25);
  assert.equal(f.audio.defaultPlaybackRate, 1.25);
  assert.equal(f.audio.preservesPitch, true);
  const end = f.audio.onended, error = f.audio.onerror;
  end(); end(); error(); f.tick(30000);
  assert.equal(ends, 1); assert.deepEqual(f.problems, []);
  f.player.play(1, 5, 1, () => ends++);
  assert.equal(f.audio.src, 'blob:two');
  f.audio.onended();
  assert.equal(ends, 2); assert.equal(f.creates(), 1);
});

test('play の Promise が reject されたら blocked と終了を一度だけ通知する', async () => {
  const pending = deferred(), f = fake({ play: () => pending.promise }); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++);
  const end = f.audio.onended, error = f.audio.onerror;
  pending.reject(new Error('blocked')); await Promise.resolve();
  error(); end(); f.tick(30000);
  assert.deepEqual(f.problems, ['blocked']); assert.equal(ends, 1);
});

test('play が同期例外でも説明を止めない', async () => {
  const f = fake({ play() { throw new Error('blocked'); } }); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 1, 1, () => ends++);
  assert.deepEqual(f.problems, ['blocked']); assert.equal(ends, 1);
});

test('onerror は load と終了を一度だけ通知する', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++);
  const error = f.audio.onerror, end = f.audio.onended;
  error(); error(); end(); f.tick(30000);
  assert.deepEqual(f.problems, ['load']); assert.equal(ends, 1);
});

test('準備前・読み込み失敗・範囲外の index は load と終了を通知する', async () => {
  const f = fake({ fetchClip: () => Promise.reject(new Error('missing')) }); let ends = 0;
  f.player.play(0, 10, 1, () => ends++);
  await f.player.prepare(['bad']);
  for (const index of [0, 1, -1, '0']) f.player.play(index, 10, 1, () => ends++);
  assert.equal(ends, 5); assert.deepEqual(f.problems, Array(5).fill('load'));
  assert.equal(f.audio.plays, 0); assert.equal(f.timers.size, 0);
});

for (const rate of [.5, 1, 2]) {
  test(`${rate}倍: 終了通知がなくても声の長さ÷速さ＋4秒で進む`, async () => {
    const f = fake(); let ends = 0;
    await f.player.prepare(['one']);
    f.player.play(0, 6, rate, () => ends++);
    const end = f.audio.onended, delay = 6000 / rate + 4000;
    assert.equal([...f.timers.values()][0].delay, delay);
    f.tick(delay - 1); assert.equal(ends, 0);
    f.tick(1); assert.equal(ends, 1);
    end(); f.tick(30000); assert.equal(ends, 1);
    assert.deepEqual(f.problems, []);
  });
}

test('不正な音声長を文字数から補った秒数で、再生の終了を待つ', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  for (const value of [0, -1, NaN, Infinity, '3.2', null]) {
    f.player.play(0, explain.clipSeconds(value, 20), 2, () => ends++);
    assert.equal([...f.timers.values()][0].delay, 6300);
    const before = ends;
    f.tick(6299); assert.equal(ends, before);
    f.tick(1); assert.equal(ends, before + 1);
  }
});

test('直接の不正な秒数にも読み時間を補い、4秒だけで打ち切らない', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  for (const value of [0, -1, NaN, Infinity, '3.2', null]) {
    f.player.play(0, value, 1, () => ends++);
    assert.equal([...f.timers.values()][0].delay, 5000);
    const before = ends;
    f.tick(4999); assert.equal(ends, before);
    f.tick(1); assert.equal(ends, before + 1);
  }
});

test('続けて play しても、古い終了・エラー・reject・タイマーを無視する', async () => {
  const pending = deferred(); let calls = 0, first = 0, second = 0;
  const f = fake({ play: () => ++calls === 1 ? pending.promise : Promise.resolve() });
  await f.player.prepare(['one', 'two']);
  f.player.play(0, 2, 1, () => first++);
  const end = f.audio.onended, error = f.audio.onerror, timeout = [...f.timers.values()][0].callback;
  f.player.play(1, 10, 1, () => second++);
  end(); error(); timeout(); pending.reject(new Error('old')); await Promise.resolve();
  assert.equal(first, 0); assert.equal(second, 0); assert.deepEqual(f.problems, []);
  assert.equal(f.audio.src, 'blob:two');
  f.audio.onended(); assert.equal(second, 1);
  f.tick(30000); assert.equal(first, 0);
});

test('stop のあとの古い通知と reject は無視し、resume でも再開しない', async () => {
  const pending = deferred(), f = fake({ play: () => pending.promise }); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++);
  const end = f.audio.onended, error = f.audio.onerror;
  f.player.stop(); end(); error(); pending.reject(new Error('old')); await Promise.resolve();
  f.player.resume(); f.tick(30000);
  assert.equal(ends, 0); assert.deepEqual(f.problems, []); assert.equal(f.audio.plays, 1);
  assert.equal(f.audio.onended, null); assert.equal(f.timers.size, 0);
});

test('一時停止中はタイマーを止め、再開すると残りの時間から続ける', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++);
  f.tick(3000);
  const oldTimeout = [...f.timers.values()][0].callback;
  f.player.pause(); f.player.pause();
  assert.equal(f.timers.size, 0);
  f.tick(100000); oldTimeout(); assert.equal(ends, 0);
  f.player.resume(); f.player.resume();
  assert.equal(f.audio.plays, 2); assert.equal(f.audio.src, 'blob:one');
  f.tick(10999); assert.equal(ends, 0);
  f.tick(1); assert.equal(ends, 1);
});

test('速さ変更は再生中にも反映し、残りの声と4秒の猶予を正しく計算する', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++);
  f.tick(2000);
  const oldTimeout = [...f.timers.values()][0].callback;
  f.player.setRate(.5);
  assert.equal(f.audio.playbackRate, .5); assert.equal(f.audio.defaultPlaybackRate, .5);
  assert.equal([...f.timers.values()][0].delay, 20000);
  oldTimeout(); assert.equal(ends, 0);
  f.tick(4000); f.player.pause(); f.player.setRate(2); f.tick(30000); f.player.resume();
  assert.equal([...f.timers.values()][0].delay, 7000);
  f.tick(6999); assert.equal(ends, 0);
  f.tick(1); assert.equal(ends, 1);
});

test('声の長さを過ぎてから速さを変えても4秒の猶予は増やさない', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 2, 1, () => ends++); f.tick(3000);
  f.player.setRate(2);
  assert.equal([...f.timers.values()][0].delay, 3000);
  f.tick(3000); assert.equal(ends, 1);
});

test('一時停止による古い reject を無視し、停止中の終了は再開時に通知する', async () => {
  const pending = deferred(), f = fake({ play: () => pending.promise }); let ends = 0;
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++); f.player.pause();
  pending.reject(new Error('interrupted')); await Promise.resolve();
  assert.deepEqual(f.problems, []);
  f.audio.onended(); assert.equal(ends, 0);
  f.player.resume(); assert.equal(ends, 1);
});

test('再開を断られた場合も blocked を通知して一度だけ進む', async () => {
  let calls = 0, ends = 0;
  const f = fake({ play: () => ++calls === 1 ? Promise.resolve() : Promise.reject(new Error('blocked')) });
  await f.player.prepare(['one']);
  f.player.play(0, 10, 1, () => ends++); f.player.pause(); f.player.resume();
  await Promise.resolve();
  assert.deepEqual(f.problems, ['blocked']); assert.equal(ends, 1);
});

test('release はBlob URLを解放し、前の再生も準備も残さない', async () => {
  const f = fake(); let ends = 0;
  await f.player.prepare(['one', 'two']);
  f.player.play(0, 10, 1, () => ends++);
  const end = f.audio.onended;
  f.player.release(); f.player.release(); end(); f.tick(30000);
  assert.deepEqual(f.revoked.sort(), ['blob:one', 'blob:two']);
  assert.equal(ends, 0); assert.equal(f.audio.src, '');
  f.player.play(0, 1, 1, () => ends++);
  assert.deepEqual(f.problems, ['load']); assert.equal(ends, 1);
});

test('prepare 中の release や新しい prepare は古い結果を採用せず、遅れて来たURLも解放する', async () => {
  for (const replace of [false, true]) {
    const pending = deferred();
    const f = fake({ fetchClip: url => url === 'old' ? pending.promise : Promise.resolve('blob:' + url) });
    const old = f.player.prepare(['old']);
    if (replace) await f.player.prepare(['new']); else f.player.release();
    pending.resolve('blob:old');
    assert.deepEqual(await old, { ok: false, failed: 1 });
    assert.ok(f.revoked.includes('blob:old'));
    if (replace) {
      f.player.play(0, 1, 1, () => {});
      assert.equal(f.audio.src, 'blob:new'); assert.deepEqual(f.problems, []);
    }
    f.player.release();
  }
});
