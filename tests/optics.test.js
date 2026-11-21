// 光の法則と、焦点・臨界角の境界を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const optics = require('../js/optics.js');

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
}

for (const degrees of [0, 10, 45, 80]) {
  test(`反射: 入射角と反射角が ${degrees}°`, () => {
    const t = degrees * Math.PI / 180;
    const dir = { x: Math.sin(t), y: Math.cos(t) };
    const normal = { x: 0, y: -2 };
    const reflected = optics.reflect(dir, normal);
    near(optics.incidenceDeg(dir, normal), degrees);
    near(optics.incidenceDeg(reflected, normal), degrees);
    near(reflected.x, dir.x);
    near(reflected.y, -dir.y);
  });
}

test('空気から水へ 30° で入ると約 22.1°', () => {
  const result = optics.refract(30, 1, 1.33);
  assert.equal(result.total, false);
  near(result.refractionDeg, 22.1, 0.05);
});

test('水とガラスの臨界角', () => {
  near(optics.criticalDeg(1.33, 1), 48.8, 0.05);
  near(optics.criticalDeg(1.5, 1), 41.8, 0.05);
  assert.equal(optics.criticalDeg(1, 1.33), null);
  assert.equal(optics.criticalDeg(1, 1), null);
});

for (const [n1, n2] of [[1, 1.33], [1.33, 1], [1, 1.5], [1.5, 1]]) {
  test(`垂直に入る光は曲がらない (${n1} → ${n2})`, () => {
    assert.deepEqual(optics.refract(0, n1, n2), { total: false, refractionDeg: 0 });
  });
}

for (const n of [1.33, 1.5]) {
  test(`臨界角ちょうど・直前・直後 (${n})`, () => {
    const critical = optics.criticalDeg(n, 1);
    assert.deepEqual(optics.refract(critical, n, 1), { total: true, refractionDeg: null });
    assert.equal(optics.refract(critical - 0.01, n, 1).total, false);
    assert.equal(optics.refract(critical + 0.01, n, 1).total, true);
    const almost = Math.asin((1 - 0.5e-9) / n) * 180 / Math.PI;
    assert.equal(optics.refract(almost, n, 1).total, true);
  });
}

for (const [a, expected] of [
  [200, { kind: 'real', b: 200, magnification: 1, inverted: true }],
  [150, { kind: 'real', b: 300, magnification: 2, inverted: true }],
  [100, { kind: 'none', b: null, magnification: null, inverted: false }],
  [100.5, { kind: 'none', b: null, magnification: null, inverted: false }],
  [99.5, { kind: 'none', b: null, magnification: null, inverted: false }],
  [50, { kind: 'virtual', b: 100, magnification: 2, inverted: false }],
]) {
  test(`うすいレンズ: a=${a}, f=100`, () => {
    assert.deepEqual(optics.thinLens(a, 100), expected);
  });
}

test('焦点の許容距離 1 ちょうどでは像を計算する', () => {
  assert.equal(optics.thinLens(101, 100).kind, 'real');
  assert.equal(optics.thinLens(99, 100).kind, 'virtual');
});
