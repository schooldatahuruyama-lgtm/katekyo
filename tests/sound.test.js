// 音の計算と不正な入力を、画面なしで確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sound = require('../js/sound.js');
const config = require('../js/config.js');
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`); }

test('振動数と波の数、正弦の山・谷・始まり', () => {
  for (const [hz, count] of [[100, 1], [250, 2.5], [1000, 10]]) {
    assert.equal(sound.cycles(hz, .01), count);
    assert.equal(sound.wavePoint(hz, 2, 0), 0);
    near(sound.wavePoint(hz, 2, 1 / hz / 4), 2);
    near(sound.wavePoint(hz, 2, 3 / hz / 4), -2);
    assert.ok(sound.wavePoint(hz, 2, .00001) > 0);
  }
});

test('弦の長さ・重さ・張りの関係と全組み合わせの範囲', () => {
  assert.equal(sound.stringFrequency(80, 'thin', 'weak'), 250);
  assert.equal(sound.stringFrequency(100, 'thin', 'weak'), 200);
  assert.equal(sound.stringFrequency(50, 'thin', 'weak'), 400);
  near(sound.stringFrequency(80, 'thin', 'strong'), 250 * Math.sqrt(2));
  assert.equal(sound.stringFrequency(80, 'thick', 'weak'), 125);
  for (const thickness of ['thin', 'thick']) for (const tension of ['weak', 'strong']) {
    for (let length = 50; length <= 100; length += 5) {
      const hz = sound.stringFrequency(length, thickness, tension);
      assert.ok(hz >= 100 && hz <= 400 * Math.sqrt(2));
      assert.ok(sound.cycles(hz, .01) >= 1 && sound.cycles(hz, .01) <= 10);
    }
  }
});

test('距離を整数の10分の1秒に直す', () => {
  for (let tenths = 5; tenths <= 50; tenths++) assert.equal(sound.delayTenths(tenths * 34), tenths);
});

test('相対誤差以内は同じ、大小・ゼロ・負数・大きい数も比較できる', () => {
  for (const base of [1e-12, 250, 1e12]) {
    assert.equal(sound.compare(base, base * (1 + .5e-9)), 'same');
    assert.equal(sound.compare(base, base * (1 + 2e-9)), 'lower');
    assert.equal(sound.compare(base * (1 + 2e-9), base), 'higher');
  }
  assert.equal(sound.compare(0, 0), 'same');
  assert.equal(sound.compare(0, 1e-12), 'lower');
  assert.equal(sound.compare(-2, -3), 'higher');
  assert.equal(sound.compare(Number.MAX_VALUE, -Number.MAX_VALUE), 'higher');
});

test('各関数の不正な型・範囲は null で、例外を投げない', () => {
  const calls = [
    [sound.cycles, [250, .01], [0, 1]], [sound.stringFrequency, [80, 'thin', 'weak'], [0]],
    [sound.compare, [1, 2], [0, 1]], [sound.delayTenths, [680], [0]],
    [sound.wavePoint, [250, 2, .001], [0, 1, 2]],
  ];
  for (const [fn, args, indices] of calls) for (const index of indices) {
    for (const value of ['250', NaN, Infinity, -Infinity, null, undefined, [], {}, true]) {
      const bad = [...args]; bad[index] = value;
      assert.equal(fn(...bad), null, `${fn.name} ${index} ${String(value)}`);
    }
  }
  for (const hz of [0, 50, 1050, 1e12]) {
    assert.equal(sound.cycles(hz, .01), null);
    assert.equal(sound.wavePoint(hz, 2, .001), null);
  }
  for (const time of [0, -1, Number.MAX_VALUE]) assert.equal(sound.cycles(250, time), null);
  for (const length of [0, 45, 105]) assert.equal(sound.stringFrequency(length, 'thin', 'weak'), null);
  for (const value of ['nope', 'toString', null, [], 1]) {
    assert.equal(sound.stringFrequency(80, value, 'weak'), null);
    assert.equal(sound.stringFrequency(80, 'thin', value), null);
  }
  for (const distance of [136, 1734, 700]) assert.equal(sound.delayTenths(distance), null);
  for (const amp of [-1, 0, 5]) assert.equal(sound.wavePoint(250, amp, .001), null);
  for (const time of [-1, .011]) assert.equal(sound.wavePoint(250, 2, time), null);
});

test('音の設定を入れ子まで凍結し、読む時間を共通設定に持つ', () => {
  function frozen(value) {
    assert.ok(Object.isFrozen(value));
    Object.values(value).filter(v => v && typeof v === 'object').forEach(frozen);
  }
  frozen(config.sound);
  assert.equal(config.explain.readCharMs, 150);
  assert.equal(config.explain.readMinMs, 2500);
});
