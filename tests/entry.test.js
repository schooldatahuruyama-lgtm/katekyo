// URL の盤指定だけを読み、不正な値では盤を開かない。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBoardParam } = require('../js/entry.js');
const ids = ['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image'];

for (const id of ids) {
  test(`盤を指定する: ${id}`, () => {
    assert.deepEqual(parseBoardParam(`?board=${id}`, ids), { boardId: id, error: null });
  });
}
for (const search of ['', '?x=1', null, undefined, 120, {}, [], true]) {
  test(`盤指定なし: ${JSON.stringify(search)}`, () => {
    assert.deepEqual(parseBoardParam(search, ids), { boardId: null, error: null });
  });
}
for (const [search, error] of [
  ['?board=', 'empty'], ['?board=nope', 'unknown'], ['?board=<script>', 'unknown'],
  ['?board=' + 'x'.repeat(40), 'unknown'], ['?board=' + 'x'.repeat(41), 'too-long'],
  ['?board=reflect&board=lens', 'duplicate'], ['?board=reflect&board=reflect', 'duplicate'],
  ['?board=&board=', 'duplicate'], ['?board=%3Cscript%3E', 'unknown'],
]) {
  test(`不正な盤指定: ${search}`, () => {
    assert.deepEqual(parseBoardParam(search, ids), { boardId: null, error });
  });
}
test('指定された許可リストだけを使う', () => {
  assert.deepEqual(parseBoardParam('?board=reflect', ['lens']), { boardId: null, error: 'unknown' });
});
