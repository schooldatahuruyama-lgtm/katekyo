// 保存値は項目ごとに検査し、保存できない端末でも説明を止めない。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const prefs = require('../js/prefs.js');
const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
const initial = { teacher: 'E', voice: false, rate: 1 };

test('保存のキーと初期値、指定した先生が不明なら先頭の先生', () => {
  assert.equal(prefs.KEY, 'hikari-board:prefs');
  assert.deepEqual(prefs.defaults(ids, 'E'), initial);
  assert.equal(prefs.defaults(ids, 'unknown').teacher, 'A');
});

test('正しい3項目は保持し、余分な項目は残さない', () => {
  for (const rate of [.5, .75, 1, 1.25, 1.5, 1.75, 2]) {
    assert.deepEqual(prefs.normalize({ teacher: 'B', voice: true, rate, extra: 12 }, ids, 'E'),
      { teacher: 'B', voice: true, rate });
  }
});

test('不正な項目だけ初期値に戻す', () => {
  assert.deepEqual(prefs.normalize({ teacher: 'unknown', voice: true, rate: 2 }, ids, 'E'),
    { teacher: 'E', voice: true, rate: 2 });
  for (const rate of ['1', 3, .6, 1e9, NaN, 0, -1, Infinity]) {
    assert.deepEqual(prefs.normalize({ teacher: 'A', voice: true, rate }, ids, 'E'),
      { teacher: 'A', voice: true, rate: 1 });
  }
  for (const voice of ['true', 1, null]) {
    assert.deepEqual(prefs.normalize({ teacher: 'F', voice, rate: .5 }, ids, 'E'),
      { teacher: 'F', voice: false, rate: .5 });
  }
  assert.deepEqual(prefs.normalize({ voice: true }, ids, 'E'), { ...initial, voice: true });
});

test('壊れたJSON・配列・null・保存先の例外でも初期値を返す', () => {
  for (const value of ['{bad', '[]', 'null', '1', 'true', '"text"', null]) {
    assert.deepEqual(prefs.load({ getItem: key => { assert.equal(key, prefs.KEY); return value; } }, ids, 'E'), initial);
  }
  for (const storage of [null, {}, { getItem() { throw new Error('unavailable'); } }]) {
    assert.deepEqual(prefs.load(storage, ids, 'E'), initial);
  }
});

test('保存できないときは false、保存できれば3項目だけを読み戻せる', () => {
  for (const storage of [null, {}, { setItem() { throw new Error('unavailable'); } }]) {
    assert.equal(prefs.save(storage, initial), false);
  }
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const value = { teacher: 'C', voice: true, rate: 1.75 };
  assert.equal(prefs.save(storage, { ...value, extra: '保存しない' }), true);
  assert.deepEqual(JSON.parse(data.get(prefs.KEY)), value);
  assert.deepEqual(prefs.load(storage, ids, 'E'), value);
});
