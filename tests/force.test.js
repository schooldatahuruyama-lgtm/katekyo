// 力の計算は整数から求め、不正な入力を直さずに拒む。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const force = require('../js/force.js');
const config = require('../js/config.js');

test('おもり 6 通りとばね 2 通りの力・のび・表示', () => {
  for (let weights = 0; weights <= 5; weights++) {
    assert.equal(force.forceTenths(weights), weights * 2);
    assert.equal(force.stretchMm(weights, 'A'), weights * 10);
    assert.equal(force.stretchMm(weights, 'B'), weights * 20);
  }
  for (const [n, text] of [[0, '0'], [6, '0.6'], [10, '1.0'], [30, '3.0'], [100, '10.0']]) assert.equal(force.tenthsText(n), text);
});

test('つり合い 50 通りの状態、つり合うのは 5 通り', () => {
  let count = 0;
  for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) for (const line of ['same', 'offset']) {
    const state = force.balanceState(left, right, line);
    assert.equal(state, line === 'offset' ? 'turns' : left === right ? 'balanced' : left > right ? 'moves-left' : 'moves-right');
    if (state === 'balanced') count++;
  }
  assert.equal(count, 5);
});

test('力の関数は文字列・非整数・非有限・範囲外・不明な指定を null にする', () => {
  for (const value of [undefined, null, [], [3], {}, true, '3', 2.5, NaN, Infinity, -Infinity, -1]) {
    assert.equal(force.forceTenths(value), null);
    assert.equal(force.stretchMm(value, 'A'), null);
    assert.equal(force.balanceState(value, 3, 'same'), null);
    assert.equal(force.balanceState(3, value, 'same'), null);
    assert.equal(force.tenthsText(value), null);
  }
  for (const value of [6, 1e12]) {
    assert.equal(force.forceTenths(value), null);
    assert.equal(force.stretchMm(value, 'B'), null);
  }
  for (const value of [0, 6, 1e12]) {
    assert.equal(force.balanceState(value, 3, 'same'), null);
    assert.equal(force.balanceState(3, value, 'offset'), null);
  }
  for (const value of [undefined, null, [], {}, 1, 'C', 'toString', '__proto__']) {
    assert.equal(force.stretchMm(3, value), null);
    assert.equal(force.balanceState(3, 3, value), null);
  }
  assert.equal(force.tenthsText(Number.MAX_SAFE_INTEGER + 1), null);
});

test('力の設定と配置を深い階層まで凍結する', () => {
  function frozen(value) {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) if (child && typeof child === 'object') frozen(child);
  }
  frozen(config.force);
  assert.equal(config.force.weightGrams / config.force.gramsPerNewton * 10, config.force.weightTenths);
});
