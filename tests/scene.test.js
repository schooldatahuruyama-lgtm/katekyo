// シーンの検査、操作範囲、光線が法則に従うことを確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const scene = require('../js/scene.js');
const boards = require('../js/boards.js');
const geometry = require('../js/geometry.js');
const config = require('../js/config.js');
const sound = require('../js/sound.js');

const forceIds = ['force-spring', 'force-arrow', 'force-balance'];
for (const id of forceIds) {
  test(`${id}: 部品・切り替えの構造を厳密に検査する`, () => {
    const changes = [s => { s.elements = []; }, s => { s.elements = null; }, s => { s.elements.pop(); },
      s => { s.elements[0] = null; }, s => { s.elements[0] = []; }, s => { s.elements[0].type = 'unknown'; },
      s => { s.elements[1].id = s.elements[0].id; }, s => { s.elements[0].x = 100; },
      s => { s.elements.push({ ...s.elements[0], id: 'extra' }); },
      s => { s.elements.push({ id: 'unused', type: 'spring' }); }];
    if (id !== 'force-arrow') changes.push(...[undefined, null, [], {}, 'same'].map(options => s => { s.options = options; }),
      s => { s.options.extra = true; });
    if (id === 'force-spring') changes.push(s => { s.options.spring = 'C'; });
    if (id === 'force-arrow') changes.push(s => { s.elements[1].direction = 'diagonal'; }, s => { s.options = {}; });
    if (id === 'force-balance') changes.push(s => { s.options.line = 'other'; }, s => { s.elements[2].side = 'left'; },
      s => { s.elements[1].side = 'up'; });
    for (const change of changes) {
      const s = boards.get(id).scene; change(s); reject(s);
      const result = scene.trace(s);
      assert.equal(result.notes[1], scene.validateScene(s)[0]);
      assert.equal(scene.setOption(s, 'line', 'same'), s);
      assert.equal(scene.stepHandle(s, 'force', 'tip', 'ArrowUp'), s);
    }
  });
}

for (const [id, index] of [['force-spring', null], ['force-arrow', 1], ['force-balance', 1], ['force-balance', 2]]) {
  test(`${id} ${index}: 数字の文字列・小数・非有限・範囲外を丸めずに拒む`, () => {
    for (const value of ['3', 2.5, NaN, Infinity, -Infinity, null, undefined, [], [3], {}, true, -1, 6, 1e12,
      ...(index === null ? [] : [0])]) {
      const s = boards.get(id).scene;
      if (index === null) s.options.weights = value; else s.elements[index].newtons = value;
      reject(s);
    }
  });
}

function forceInside(value) {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'x') && Object.hasOwn(value, 'y')) {
    assert.ok(Number.isFinite(value.x) && value.x >= 0 && value.x <= 600);
    assert.ok(Number.isFinite(value.y) && value.y >= 0 && value.y <= 420);
    if (value.width !== undefined) assert.ok(value.x + value.width <= 600);
    if (value.height !== undefined) assert.ok(value.y + value.height <= 420);
  }
  Object.values(value).forEach(forceInside);
}

test('ばね 12 通りの長さ・巻き数・グラフ・ラベルと 0 個の形', () => {
  let pointCount;
  for (const spring of ['A', 'B']) for (let weights = 0; weights <= 5; weights++) {
    let s = boards.get('force-spring').scene;
    s = scene.setOption(scene.setOption(s, 'weights', weights), 'spring', spring);
    const result = valid(s), shape = result.force, mm = weights * (spring === 'A' ? 10 : 20);
    assert.deepEqual(result.measures, { weights, spring, forceTenths: weights * 2, stretchMm: mm });
    assert.equal(shape.spring.bottom.y, 50 + 100 + mm / 10 * 10);
    assert.deepEqual(shape.spring.top, { x: 150, y: 50 });
    assert.deepEqual(shape.spring.naturalBottom, { x: 150, y: 150 });
    pointCount ??= shape.spring.points.length;
    assert.equal(shape.spring.points.length, pointCount);
    assert.deepEqual(shape.spring.points[0], shape.spring.top);
    assert.deepEqual(shape.spring.points.at(-1), shape.spring.bottom);
    assert.equal(shape.spring.naturalPoints.length, pointCount);
    assert.deepEqual(shape.spring.naturalPoints[0], shape.spring.top);
    assert.deepEqual(shape.spring.naturalPoints.at(-1), shape.spring.naturalBottom);
    if (!weights) assert.deepEqual(shape.spring.points, shape.spring.naturalPoints);
    assert.equal(shape.weights.length, weights);
    shape.weights.forEach((weight, i) => { assert.equal(weight.y, shape.spring.bottom.y + i * 14); assert.equal(weight.height, 14); });
    assert.equal(shape.graph.points.length, 6);
    assert.deepEqual(shape.graph.origin, { x: 370, y: 326 });
    assert.equal(shape.graph.points.filter(p => p.current).length, 1);
    assert.ok(shape.graph.points[weights].current);
    shape.graph.points.forEach((p, i) => {
      assert.equal(p.x, 370 + i * 36);
      assert.equal(p.y, 326 - i * (spring === 'A' ? 1 : 2) * 22);
      near(geometry.distancePointToLine(p, shape.graph.line.from, shape.graph.line.to), 0, .5);
    });
    assert.equal(shape.graph.xTicks[3].text, '0.6');
    assert.equal(shape.graph.xTicks[5].text, '1.0');
    assert.equal(shape.labels.spring.text, 'ばね ' + spring);
    assert.equal(shape.labels.weights.text, weights ? 'おもり ' + weights + ' 個' : 'おもり なし');
    if (!weights) {
      assert.equal(shape.stretch, null); assert.equal(shape.forceArrow, null);
      assert.deepEqual(shape.spring.bottom, shape.spring.naturalBottom);
    } else {
      assert.equal(shape.stretch.from.y, 150); assert.equal(shape.stretch.to.y, shape.spring.bottom.y);
      assert.ok(shape.forceArrow.to.y > shape.forceArrow.from.y);
      assert.equal(shape.forceArrow.from.y, shape.weights.at(-1).y + shape.weights.at(-1).height);
      assert.equal(shape.forceArrow.to.y - shape.forceArrow.from.y, weights * 13);
      assert.ok(shape.forceArrow.to.y < shape.stand.lines.at(-1)[0].y);
    }
    assert.deepEqual(result.marks, Object.values(shape.labels));
    assert.deepEqual(scene.handles(s), []);
    forceInside(shape);
  }
});

const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
test('力の矢印 20 通りの長さ・作用点・平行な区切り・つまみ', () => {
  for (const [direction, [dx, dy]] of Object.entries(directions)) for (let newtons = 1; newtons <= 5; newtons++) {
    const initial = boards.get('force-arrow').scene;
    const origin = { x: 300, y: 210 - dy * 16 };
    initial.elements[1].direction = direction;
    const s = scene.moveElement(initial, 'force', 'tip', { x: origin.x + dx * 32 * newtons, y: origin.y + dy * 32 * newtons });
    const result = valid(s), f = result.force, [h] = scene.handles(s);
    assert.deepEqual(result.measures, { newtons, direction });
    assert.deepEqual(f.application, origin);
    assert.deepEqual(f.arrow.from, f.application);
    assert.deepEqual(f.arrow.to, { x: origin.x + dx * 32 * newtons, y: origin.y + dy * 32 * newtons });
    assert.equal(Math.hypot(f.arrow.to.x - f.arrow.from.x, f.arrow.to.y - f.arrow.from.y), 32 * newtons);
    assert.deepEqual(geometry.sub(f.magnitude.to, f.magnitude.from), geometry.sub(f.arrow.to, f.arrow.from));
    assert.ok(geometry.distancePointToLine(f.magnitude.from, f.arrow.from, f.arrow.to) > 0);
    assert.deepEqual(h, { elementId: 'force', handle: 'tip', ...f.arrow.to, label: '力の矢印' });
    assert.ok(h.x >= 20 && h.x <= 580 && h.y >= 20 && h.y <= 400);
    forceInside(f);
    assert.equal(initial.elements[1].newtons, 3); assert.equal(initial.elements[1].direction, direction);
  }
});

test('力のつり合い 50 通りの状態・矢印・力の線・つまみ', () => {
  let balanced = 0;
  for (const line of ['same', 'offset']) for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) {
    let s = scene.setOption(boards.get('force-balance').scene, 'line', line);
    s = scene.moveElement(s, 'left', 'tip', { x: 250 - left * 32, y: 100 });
    s = scene.moveElement(s, 'right', 'tip', { x: 350 + right * 32, y: 400 });
    const result = valid(s), f = result.force;
    const state = line === 'offset' ? 'turns' : left === right ? 'balanced' : left > right ? 'moves-left' : 'moves-right';
    assert.deepEqual(result.measures, { left, right, line, state });
    if (state === 'balanced') balanced++;
    assert.deepEqual(f.card, { x: 250, y: 160, width: 100, height: 100 });
    assert.deepEqual(f.pulls.left.from, { x: 250, y: line === 'same' ? 210 : 180 });
    assert.deepEqual(f.pulls.right.from, { x: 350, y: line === 'same' ? 210 : 240 });
    assert.equal(f.pulls.left.from.x - f.pulls.left.to.x, left * 32);
    assert.equal(f.pulls.right.to.x - f.pulls.right.from.x, right * 32);
    assert.equal(f.lines.length, line === 'same' ? 1 : 2);
    assert.deepEqual(f.lines.map(l => l.from.y), line === 'same' ? [210] : [180, 240]);
    for (const h of scene.handles(s)) {
      assert.deepEqual({ x: h.x, y: h.y }, f.pulls[h.elementId].to);
      assert.ok(h.x >= 20 && h.x <= 580 && h.y >= 20 && h.y <= 400);
    }
    forceInside(f);
  }
  assert.equal(balanced, 5);
});

test('力のドラッグは丸め・はし止め・同じ差の向き保持・不正な点の拒否を行う', () => {
  const initial = boards.get('force-arrow').scene, snapshot = structuredClone(initial);
  for (const [direction, [dx, dy]] of Object.entries(directions)) {
    const current = structuredClone(initial); current.elements[1].direction = direction;
    const origin = scene.trace(current).force.application;
    for (const distance of [10000, Number.MAX_VALUE]) {
      const s = scene.moveElement(initial, 'force', 'tip', { x: 300 + dx * distance, y: 210 + dy * distance });
      assert.deepEqual(valid(s).measures, { newtons: 5, direction });
    }
    for (const [distance, newtons] of [[1, 1], [47, 1], [48, 2], [79, 2], [80, 3]]) {
      assert.deepEqual(valid(scene.moveElement(current, 'force', 'tip', { x: origin.x + dx * distance, y: origin.y + dy * distance })).measures,
        { newtons, direction });
    }
    const s = structuredClone(initial); s.elements[1].direction = direction;
    for (const sign of [-1, 1]) assert.deepEqual(valid(scene.moveElement(s, 'force', 'tip', { x: origin.x + sign * 64, y: origin.y + sign * 64 })).measures,
      { newtons: 2, direction });
  }
  assert.equal(scene.moveElement(initial, 'force', 'tip', { x: 300, y: 210 }), initial);
  for (const id of ['force-arrow', 'force-balance']) {
    const s = boards.get(id).scene;
    for (const h of scene.handles(s)) {
      for (const point of [null, [], { x: NaN, y: 0 }, { x: 0, y: NaN }, { x: Infinity, y: 0 }, { x: '300', y: 210 }]) {
        assert.equal(scene.moveElement(s, h.elementId, h.handle, point), s);
      }
      if (id === 'force-balance') for (const x of [-Number.MAX_VALUE, Number.MAX_VALUE]) {
        const moved = scene.moveElement(s, h.elementId, h.handle, { x, y: 0 });
        valid(moved);
        assert.equal(moved.elements.find(e => e.id === h.elementId).newtons, (h.elementId === 'left' ? x < 0 : x > 0) ? 5 : 1);
      }
    }
    assert.equal(scene.moveElement(s, 'unknown', 'tip', { x: 0, y: 0 }), s);
    assert.equal(scene.moveElement(s, s.elements[1].id, 'unknown', { x: 0, y: 0 }), s);
  }
  assert.deepEqual(initial, snapshot);
});

test('力のキーは全配置で 1 N ずつ進み、直角では向きだけを変える', () => {
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  for (const [direction, v] of Object.entries(directions)) for (let n = 1; n <= 5; n++) {
    const s = boards.get('force-arrow').scene; Object.assign(s.elements[1], { direction, newtons: n });
    for (const [target, key] of Object.entries(keys)) {
      const parallel = v[0] * directions[target][0] + v[1] * directions[target][1];
      const expected = { newtons: parallel ? Math.max(1, Math.min(5, n + parallel)) : n, direction: parallel ? direction : target };
      const moved = scene.stepHandle(s, 'force', 'tip', key);
      assert.deepEqual(valid(moved).measures, expected);
      assert.deepEqual(scene.stepForceHandle(s, 'force', 'tip', key), moved);
    }
  }
  for (const line of ['same', 'offset']) for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) {
    const s = boards.get('force-balance').scene;
    s.options.line = line; s.elements[1].newtons = left; s.elements[2].newtons = right;
    for (const side of ['left', 'right']) for (const target of ['left', 'right']) {
      const moved = scene.stepHandle(s, side, 'tip', keys[target]); valid(moved);
      const n = side === 'left' ? left : right;
      assert.equal(moved.elements.find(e => e.side === side).newtons, Math.max(1, Math.min(5, n + (side === target ? 1 : -1))));
    }
    for (const key of ['ArrowUp', 'ArrowDown', 'unknown']) assert.equal(scene.stepHandle(s, 'left', 'tip', key), s);
  }
  const s = boards.get('force-arrow').scene;
  assert.equal(scene.stepHandle(s, 'force', 'tip', 'unknown'), s);
  assert.equal(scene.stepHandle(s, 'force', 'unknown', 'ArrowUp'), s);
  const wave = boards.get('sound-wave').scene;
  assert.deepEqual(scene.stepHandle(wave, 'wave', 'amplitude', 'ArrowUp'), scene.stepSoundHandle(wave, 'wave', 'amplitude', 'ArrowUp'));
});

test('力の切り替えは不明なキー・型・値を拒み、元のシーンを変えない', () => {
  for (const id of forceIds) {
    const s = boards.get(id).scene, snapshot = structuredClone(s);
    for (const [key, value] of [['weights', 6], ['weights', '3'], ['weights', null], ['weights', NaN],
      ['spring', 'C'], ['line', 'bad'], ['toString', 'A'], ['unknown', 3]]) assert.equal(scene.setOption(s, key, value), s);
    if (id !== 'force-spring') assert.equal(scene.setOption(s, 'weights', 3), s);
    if (id !== 'force-balance') assert.equal(scene.setOption(s, 'line', 'offset'), s);
    assert.deepEqual(s, snapshot);
  }
});

function near(a, b, tolerance = 1e-8) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`); }
function part(s, type) { return s.elements.find(e => e.type === type); }
function attachedMarks(s, result) {
  const expected = {
    straight: ['blocker', 'screen'], reflect: ['normal', 'mirror'], 'mirror-image': ['mirror'],
    refract: ['normal'], lens: ['focus-left', 'focus-right', 'axis'], 'lens-image': ['focus-left', 'focus-right', 'axis'],
  };
  assert.deepEqual(result.marks.filter(mark => mark.away).map(mark => mark.key), expected[s.kind]);
  for (const mark of result.marks.filter(mark => mark.away)) {
    near(Math.hypot(mark.away.x, mark.away.y), 1, 1e-9);
    let point, direction;
    if (mark.key === 'normal') {
      const angle = result.angles[0], radians = angle.fromDeg * Math.PI / 180;
      point = angle.vertex; direction = { x: Math.cos(radians), y: Math.sin(radians) };
      assert.ok(mark.away.x > 0);
    } else if (mark.key === 'mirror') {
      point = part(s, 'mirror');
      const radians = point.tiltDeg * Math.PI / 180;
      direction = { x: Math.cos(radians), y: Math.sin(radians) };
      const back = s.kind === 'reflect' ? { x: -direction.y, y: direction.x } : { x: 1, y: 0 };
      near(mark.away.x, back.x); near(mark.away.y, back.y);
    } else if (mark.key === 'screen' || mark.key === 'blocker') {
      point = part(s, mark.key); direction = { x: 0, y: 1 };
      assert.deepEqual(mark.away, { x: 1, y: 0 });
    } else {
      point = part(s, 'lens'); direction = { x: 1, y: 0 };
      assert.deepEqual(mark.away, { x: 0, y: 1 });
    }
    near(geometry.distancePointToLine(mark, point, { x: point.x + direction.x, y: point.y + direction.y }), 0);
    near(mark.away.x * direction.x + mark.away.y * direction.y, 0);
  }
}
function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
function inside(result) {
  for (const ray of result.rays) {
    for (const key of ['x1', 'x2']) assert.ok(ray[key] >= 0 && ray[key] <= 600);
    for (const key of ['y1', 'y2']) assert.ok(ray[key] >= 0 && ray[key] <= 420);
    assert.ok(['solid', 'dashed', 'dotted'].includes(ray.style));
    assert.equal(typeof ray.arrow, 'boolean');
    assert.equal(typeof ray.role, 'string');
  }
}
function valid(s) {
  assert.deepEqual(scene.validateScene(s), []);
  const result = scene.trace(s);
  finite(result);
  inside(result);
  assert.ok(result.rays.length > 0 || result.sound || result.force);
  if (!s.kind.startsWith('sound-')) assert.equal(result.sound, null);
  if (!s.kind.startsWith('force-')) assert.equal(result.force, null);
  return result;
}
function reject(s) {
  assert.ok(scene.validateScene(s).length > 0);
  const result = scene.trace(s);
  for (const key of ['rays', 'angles', 'images', 'marks']) assert.deepEqual(result[key], []);
  assert.ok(result.notes.includes('この図は表示できません'));
  assert.equal(result.sound, null);
  assert.equal(result.force, null);
  assert.deepEqual(result.measures, {});
  assert.deepEqual(scene.handles(s), []);
  finite(result);
}

const soundRanges = [
  ['sound-wave', 'wave', 'frequencyHz', [50, 1050, 1e12, 260]],
  ['sound-wave', 'wave', 'amplitude', [0, 5, -1, 2.5]],
  ['sound-string', 'string', 'lengthPercent', [45, 105, 82]],
  ['sound-string', 'string', 'pluck', [0, 5, 2.5]],
  ['sound-speed', 'listener', 'distance', [136, 1734, 700]],
];
for (const [id, type, key, outside] of soundRanges) {
  test(`${id}: ${key} の型・範囲・きざみを丸めずに拒む`, () => {
    for (const value of [...outside, '250', '680', NaN, Infinity, -Infinity, null, [], {}, undefined, true]) {
      const current = boards.get(id).scene;
      part(current, type)[key] = value;
      reject(current);
      assert.deepEqual(boards.readout(id, scene.trace(current).measures, current), []);
    }
  });
}

for (const id of ['sound-wave', 'sound-string', 'sound-speed']) {
  test(`${id}: 部品の不足・余分な部品・重複・不正な構造`, () => {
    const changes = [
      s => { s.elements = []; }, s => { s.elements = null; }, s => { s.elements = [null]; },
      s => { s.elements.pop(); }, s => { s.elements.push({ id: 'unknown', type: 'unknown' }); },
      s => { s.elements.push({ ...s.elements[0] }); }, s => { s.elements[0].x = 60; },
      s => { s.elements.push({ id: 'extra', type: 'source', x: 40, y: 40 }); },
    ];
    if (id !== 'sound-string') changes.push(s => { s.elements[1].id = s.elements[0].id; });
    for (const change of changes) { const s = boards.get(id).scene; change(s); reject(s); }
  });

  test(`${id}: つまみの範囲外・最大の座標・NaN と刻みの間`, () => {
    const s = boards.get(id).scene, before = structuredClone(s);
    for (const h of scene.handles(s)) {
      for (const point of [{ x: NaN, y: 100 }, { x: 100, y: NaN }, { x: Infinity, y: 0 }, null]) {
        assert.equal(scene.moveElement(s, h.elementId, h.handle, point), s);
      }
      for (const v of [-Number.MAX_VALUE, -1e12, -100, 37.3, 155.7, 500.1, 1000, 1e12, Number.MAX_VALUE]) {
        valid(scene.moveElement(s, h.elementId, h.handle, { x: v, y: v }));
      }
    }
    assert.deepEqual(s, before);
  });
}

test('音のつまみははしで止まり、位置が近い刻みに乗る', () => {
  const wave = boards.get('sound-wave').scene, string = boards.get('sound-string').scene, speed = boards.get('sound-speed').scene;
  for (const [y, amplitude] of [[-1e12, 4], [1e12, 1], [115, 2], [105, 3]]) {
    assert.equal(part(scene.moveElement(wave, 'wave', 'amplitude', { x: 0, y }), 'wave').amplitude, amplitude);
  }
  for (const [x, length] of [[-1e12, 50], [1e12, 100], [440, 80], [448, 85]]) {
    assert.equal(part(scene.moveElement(string, 'string', 'bridge', { x, y: 0 }), 'string').lengthPercent, length);
  }
  for (const [y, pluck] of [[-1e12, 4], [1e12, 1], [61, 2], [59, 3]]) {
    assert.equal(part(scene.moveElement(string, 'string', 'pluck', { x: 0, y }), 'string').pluck, pluck);
  }
  for (const [x, distance] of [[-1e12, 170], [1e12, 1700], [132, 170], [134, 204]]) {
    assert.equal(part(scene.moveElement(speed, 'listener', 'move', { x, y: 0 }), 'listener').distance, distance);
  }
  const hzValues = Array.from({ length: 19 }, (_, i) => 100 + 50 * i);
  for (let x = 100; x <= 600; x += 1.7) {
    const nearest = hzValues.reduce((a, b) => Math.abs(130 + 44000 / a - x) <= Math.abs(130 + 44000 / b - x) ? a : b);
    assert.equal(part(scene.moveElement(wave, 'wave', 'frequency', { x, y: 210 }), 'wave').frequencyHz, nearest);
  }
});

function soundPointInside(p) {
  assert.ok(p.x >= -1e-8 && p.x <= 600 + 1e-8, JSON.stringify(p));
  assert.ok(p.y >= -1e-8 && p.y <= 420 + 1e-8, JSON.stringify(p));
}
function checkWave(result, frequency, amplitude) {
  const { grid, wave } = result.sound;
  near(wave.points[0].x, grid.x); near(wave.points.at(-1).x, grid.x + grid.width);
  near(Math.min(...wave.points.map(p => p.y)), grid.axisY - amplitude * grid.cellH, .5);
  near(Math.max(...wave.points.map(p => p.y)), grid.axisY + amplitude * grid.cellH, .5);
  for (const [i, p] of wave.points.entries()) {
    soundPointInside(p);
    near(p.y, grid.axisY - amplitude * grid.cellH * Math.sin(2 * Math.PI * frequency * (p.x - grid.x) / grid.width * .01));
    if (i) assert.ok(p.x >= wave.points[i - 1].x && p.x - wave.points[i - 1].x <= 2 + 1e-8);
  }
  const count = result.measures.cycles;
  // 左はしを含み右はしを除く上向きの横切りは、端の半周期も含め ceil(cycles) 回。
  const signs = wave.points.map(p => Math.abs(p.y - grid.axisY) < 1e-8 ? 0 : Math.sign(grid.axisY - p.y));
  let crossings = 0, previous = 0;
  for (const sign of signs) if (sign) { if (sign > 0 && previous <= 0) crossings++; previous = sign; }
  assert.equal(crossings, Math.ceil(count));
  for (let quarter = 1; quarter <= count * 4; quarter += 2) {
    assert.ok(wave.points.some(p => Math.abs(p.x - (grid.x + quarter / (4 * count) * grid.width)) < 1e-8));
  }
}

test('振動数19通り × 振幅4通りの波・矢印・つまみが値と一致する', () => {
  for (let hz = 100; hz <= 1000; hz += 50) for (let amp = 1; amp <= 4; amp++) {
    const s = boards.get('sound-wave').scene;
    Object.assign(part(s, 'wave'), { frequencyHz: hz, amplitude: amp });
    const result = valid(s), [a, f] = scene.handles(s), shape = result.sound;
    [a, f].forEach(soundPointInside);
    assert.ok(Math.hypot(a.x - f.x, a.y - f.y) >= 40);
    assert.equal(a.x, 526); near(f.x, 130 + 44000 / hz);
    assert.deepEqual(result.measures, { frequencyHz: hz, amplitude: amp, cycles: hz * .01, periodSec: 1 / hz });
    checkWave(result, hz, amp);
    near(shape.amplitude.to.x, 130 + 11000 / hz);
    near(shape.amplitude.from.y, 210); near(shape.amplitude.to.y, 210 - amp * 40);
    assert.deepEqual(shape.amplitude.guide.to, { x: a.x, y: a.y });
    assert.deepEqual(shape.amplitude.guide.from, shape.amplitude.to);
    near(shape.period.to.x - shape.period.from.x, 44000 / hz);
    near(shape.period.from.x, hz === 100 ? 130 : shape.amplitude.to.x);
    [shape.period.from, shape.period.to, ...Object.values(shape.labels)].forEach(soundPointInside);
  }
  for (const hz of [100, 1000]) for (const amp of [1, 4]) {
    const s = boards.get('sound-wave').scene; part(s, 'wave').frequencyHz = hz;
    const moved = scene.moveElement(s, 'wave', 'amplitude', { x: 526, y: 210 - amp * 40 });
    assert.equal(valid(moved).measures.amplitude, amp);
  }
});

test('弦4通り × 長さ11通り × 強さ4通りが盤に収まり、高さ・大きさが法則と合う', () => {
  for (const thickness of ['thin', 'thick']) for (const tension of ['weak', 'strong']) {
    for (let length = 50; length <= 100; length += 5) for (let pluck = 1; pluck <= 4; pluck++) {
      const s = boards.get('sound-string').scene;
      s.options = { thickness, tension }; Object.assign(part(s, 'string'), { lengthPercent: length, pluck });
      const result = valid(s), shape = result.sound, m = result.measures;
      const hz = sound.stringFrequency(length, thickness, tension);
      assert.equal(m.pitch, sound.compare(hz, 250));
      assert.equal(m.loudness, { higher: 'louder', same: 'same', lower: 'softer' }[sound.compare(pluck, 2)]);
      assert.deepEqual(Object.keys(m), ['pitch', 'loudness', 'thickness', 'tension', 'lengthPercent', 'pluck', 'cycles']);
      assert.ok(m.cycles >= 1 && m.cycles <= 10);
      checkWave(result, hz, pluck);
      near(shape.bridge.x, 80 + 440 * length / 100);
      assert.equal(shape.string.thick, thickness === 'thick');
      assert.equal(shape.vibration.heightPx, 12 * pluck);
      assert.deepEqual(shape.vibration.to, shape.bridge);
      [shape.string.from, shape.string.to, shape.bridge, shape.box,
        { x: shape.box.x + shape.box.width, y: shape.box.y + shape.box.height },
        { x: shape.string.from.x, y: 90 - shape.vibration.heightPx },
        { x: shape.bridge.x, y: 90 + shape.vibration.heightPx },
        ...scene.handles(s), ...Object.values(shape.labels)].forEach(soundPointInside);
    }
  }
  const m = valid(boards.get('sound-string').scene).measures;
  assert.equal(m.pitch, 'same'); assert.equal(m.loudness, 'same');
});

test('距離46通りで弧が耳を通り、斜めの距離・時間と文字の座標が正しい', () => {
  for (let distance = 170; distance <= 1700; distance += 34) {
    const s = boards.get('sound-speed').scene; part(s, 'listener').distance = distance;
    const result = valid(s), shape = result.sound, m = result.measures, { firework, listener, distanceArrow } = shape;
    assert.equal(m.delayTenths, distance / 34); assert.ok(Number.isInteger(m.delayTenths));
    assert.equal(m.delaySec, m.delayTenths / 10); assert.equal(m.speed, 340);
    assert.equal(shape.labels.time.text, (m.delayTenths / 10).toFixed(1) + ' 秒後に聞こえる');
    assert.equal(shape.labels.distance.text, distance + ' m');
    assert.notEqual(distanceArrow.from.y, distanceArrow.to.y);
    near(Math.hypot(distanceArrow.from.x - firework.x, distanceArrow.from.y - firework.y), config.sound.layout.speed.arrowOffset);
    near(Math.hypot(distanceArrow.to.x - listener.ear.x, distanceArrow.to.y - listener.ear.y), config.sound.layout.speed.arrowOffset);
    near(distanceArrow.to.x - distanceArrow.from.x, listener.ear.x - firework.x);
    near(distanceArrow.to.y - distanceArrow.from.y, listener.ear.y - firework.y);
    assert.equal(result.rays.length, 1); assert.equal(result.rays[0].role, 'light'); assert.equal(result.rays[0].style, 'dotted');
    near(result.rays[0].x1, firework.x); near(result.rays[0].y1, firework.y);
    near(result.rays[0].x2, listener.eye.x); near(result.rays[0].y2, listener.eye.y);
    assert.ok(distanceArrow.from.y < firework.y && distanceArrow.to.y < listener.eye.y);
    const last = shape.waves.at(-1), direction = Math.atan2(listener.ear.y - firework.y, listener.ear.x - firework.x) * 180 / Math.PI;
    near(last.r, Math.hypot(listener.ear.x - firework.x, listener.ear.y - firework.y));
    assert.ok(direction >= last.startDeg && direction <= last.endDeg);
    shape.waves.forEach((arc, index) => {
      if (index) assert.ok(arc.r > shape.waves[index - 1].r);
      for (let i = 0; i <= 100; i++) {
        const angle = (arc.startDeg + (arc.endDeg - arc.startDeg) * i / 100) * Math.PI / 180;
        soundPointInside({ x: arc.cx + arc.r * Math.cos(angle), y: arc.cy + arc.r * Math.sin(angle) });
      }
    });
    [firework, listener.ear, listener.eye, { x: listener.x, y: listener.feetY },
      distanceArrow.from, distanceArrow.to, ...Object.values(shape.labels), ...scene.handles(s)].forEach(soundPointInside);
  }
});

test('弦の切り替えを検査し、知らないキー・値・他の盤は変更しない', () => {
  for (const options of [undefined, null, [], {}, { thickness: 'other', tension: 'weak' },
    { thickness: 'thin', tension: 'other' }, { thickness: 'thin', tension: 'weak', extra: true }]) {
    const s = boards.get('sound-string').scene; s.options = options; reject(s);
  }
  const initial = boards.get('sound-string').scene;
  for (const [key, value] of [['thickness', 'thick'], ['tension', 'strong']]) {
    const changed = scene.setOption(initial, key, value);
    assert.notEqual(changed, initial); assert.equal(changed.options[key], value); valid(changed);
  }
  for (const [key, value] of [['unknown', 'thin'], ['thickness', 'unknown'], ['tension', null], ['toString', 'x']]) {
    assert.equal(scene.setOption(initial, key, value), initial);
  }
  for (const { id } of boards.list().filter(b => b.unit === 'light')) {
    const s = boards.get(id).scene; assert.equal(scene.setOption(s, 'thickness', 'thin'), s);
  }
  assert.deepEqual(initial.options, config.sound.string.initial);
});

for (const id of ['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image']) {
  test(`${id}: はじめの配置とつかめる所`, () => {
    const s = boards.get(id).scene;
    attachedMarks(s, valid(s));
    assert.ok(scene.handles(s).length >= 1);
    for (const h of scene.handles(s)) {
      assert.ok(s.elements.some(e => e.id === h.elementId));
      assert.equal(typeof h.label, 'string');
      finite(h);
    }
  });
  test(`${id}: 不正な構造・部品`, () => {
    for (const change of [
      s => { s.kind = 'nope'; }, s => { s.kind = ''; },
      s => { s.elements = {}; }, s => { s.elements = null; },
      s => { s.elements = []; }, s => { delete s.elements; },
      s => { s.elements[1].id = s.elements[0].id; },
      s => { s.elements[0].type = 'nope'; }, s => { s.elements[0] = null; },
      s => { s.elements[0] = []; }, s => { s.elements[0].id = ''; },
      s => { s.elements.pop(); },
      s => { s.elements.push({ ...s.elements[0], id: 'extra' }); },
    ]) {
      const s = boards.get(id).scene;
      change(s);
      reject(s);
    }
  });
  test(`${id}: 座標の型・有限性・範囲`, () => {
    for (const key of ['x', 'y']) {
      for (const value of ['120', null, [], {}, true, NaN, Infinity, -Infinity, 1e308, -1, key === 'x' ? 601 : 421]) {
        const s = boards.get(id).scene;
        s.elements[0][key] = value;
        reject(s);
      }
    }
  });
  test(`${id}: すべてのつまみを端まで引いても安全で、元を変えない`, () => {
    const original = boards.get(id).scene;
    const snapshot = structuredClone(original);
    for (const h of scene.handles(original)) {
      let moved = original;
      for (const point of [{ x: -1000, y: -1000 }, { x: 5000, y: 5000 }]) {
        moved = scene.moveElement(moved, h.elementId, h.handle, point);
        valid(moved);
      }
      for (const point of [{ x: NaN, y: 20 }, { x: 20, y: NaN }, { x: '20', y: 20 }, { x: Infinity, y: 20 }, null, []]) {
        assert.deepEqual(scene.moveElement(original, h.elementId, h.handle, point), original);
      }
    }
    assert.deepEqual(original, snapshot);
    assert.deepEqual(scene.moveElement(original, 'nope', 'move', { x: 40, y: 40 }), original);
    assert.deepEqual(scene.moveElement(original, original.elements[0].id, 'nope', { x: 40, y: 40 }), original);
    for (const [key, value] of [['nope', 'nope'], ['medium', 'nope'], ['direction', 'nope']]) {
      assert.deepEqual(scene.setOption(original, key, value), original);
    }
  });
  test(`${id}: すべてのつまみを四隅へ動かしても marks は盤内に収まる`, () => {
    let s = boards.get(id).scene;
    for (const h of scene.handles(s)) for (const x of [-1000, 5000]) for (const y of [-1000, 5000]) {
      s = scene.moveElement(s, h.elementId, h.handle, { x, y });
      const result = valid(s);
      attachedMarks(s, result);
      assert.ok(result.marks.length > 0);
      for (const mark of result.marks) {
        assert.ok(mark.x >= 0 && mark.x <= 600, mark.key + ': x');
        assert.ok(mark.y >= 0 && mark.y <= 420, mark.key + ': y');
      }
    }
  });
}

for (const [id, expected] of Object.entries({
  straight: ['edge', 'edge'], reflect: ['incident', 'reflected'],
  'mirror-image': ['to-mirror', 'to-eye', 'extension', 'to-mirror', 'to-eye', 'extension'],
  refract: ['incident', 'refracted', 'reflected'],
  lens: ['to-lens', 'to-focus', 'beyond-focus', 'to-lens', 'to-focus', 'beyond-focus', 'to-lens', 'to-focus', 'beyond-focus'],
  'lens-image': ['ray1', 'ray1', 'ray2', 'ray2', 'ray3', 'ray3'],
})) {
  test(`${id}: 初期配置の光線に設計どおりの役割が付く`, () => {
    assert.deepEqual(valid(boards.get(id).scene).rays.map(r => r.role), expected);
  });
}

test('全反射には refracted がなく、像なしには ray3 がない。虚像の破線は extension', () => {
  let s = scene.setOption(boards.get('refract').scene, 'direction', 'medium-to-air');
  s = scene.moveElement(s, 'src', 'move', { x: 20, y: 240 });
  assert.deepEqual(valid(s).rays.map(r => r.role), ['incident', 'reflected']);
  s = scene.moveElement(boards.get('lens-image').scene, 'object', 'move', { x: 200, y: 210 });
  assert.deepEqual(valid(s).rays.map(r => r.role), ['ray1', 'ray1', 'ray2', 'ray2']);
  s = scene.moveElement(s, 'object', 'move', { x: 250, y: 210 });
  const virtual = valid(s);
  assert.deepEqual(virtual.rays.map(r => r.role), ['ray1', 'ray1', 'extension', 'ray2', 'ray2', 'extension', 'ray3', 'ray3', 'extension']);
  assert.ok(virtual.rays.every(r => (r.role === 'extension') === (r.style === 'dashed')));
});

test('凸レンズの3本は光軸上も焦点でつながり、分割前と同じ道すじを通る', () => {
  for (const focalLength of [60, 100, 160]) for (const offset of [20, 60, 100]) {
    const s = boards.get('lens').scene, lens = part(s, 'lens'), src = part(s, 'source');
    lens.focalLength = focalLength; src.y = lens.y - offset;
    const rays = valid(s).rays;
    assert.equal(rays.length, 9);
    for (let i = 0; i < 3; i++) {
      const incoming = rays[i * 3], before = rays[i * 3 + 1], after = rays[i * 3 + 2];
      const height = [-offset, 0, offset][i];
      near(incoming.x1, src.x); near(incoming.y1, lens.y + height);
      near(incoming.x2, lens.x); near(incoming.y2, lens.y + height);
      near(before.x1, lens.x); near(before.y1, lens.y + height);
      near(before.x2, lens.x + focalLength); near(before.y2, lens.y);
      near(after.x1, lens.x + focalLength); near(after.y1, lens.y);
      const extent = height === 0 ? (600 - lens.x) / focalLength :
        Math.min((600 - lens.x) / focalLength, (height < 0 ? 420 - before.y1 : before.y1) / Math.abs(height));
      near(after.x2, lens.x + focalLength * extent);
      near(after.y2, before.y1 - height * extent);
      for (const r of [incoming, before, after]) { assert.equal(r.style, 'solid'); assert.equal(r.arrow, true); }
    }
  }
});

// 役割を付ける前の初期配置の座標・線種・矢印を固定しておく。
for (const [id, expected] of Object.entries({
  straight: [[80, 210, 550, 139.5], [80, 210, 550, 280.5]],
  reflect: [[170, 100, 300, 270], [300, 270, 506.47058823529414, 0]],
  'mirror-image': [[140, 140, 340, 205.71428571428572], [340, 205.71428571428572, 120, 278],
    [340, 205.71428571428572, 540, 140, 'dashed'], [140, 140, 340, 217.14285714285714],
    [340, 217.14285714285714, 120, 302], [340, 217.14285714285714, 540, 140, 'dashed']],
  refract: [[180, 70, 300, 210], [300, 210, 417.8257241777912, 420], [300, 210, 480, 0]],
  'lens-image': [[100, 160, 300, 160], [300, 160, 600, 310], [100, 160, 300, 210],
    [300, 210, 600, 285], [100, 160, 300, 260], [300, 260, 600, 260]],
})) {
  test(`${id}: 役割を付けても光線の数・座標・線種・矢印は変わらない`, () => {
    const result = valid(boards.get(id).scene);
    assert.equal(result.rays.length, expected.length);
    result.rays.forEach((ray, index) => {
      const values = expected[index];
      ['x1', 'y1', 'x2', 'y2'].forEach((key, i) => near(ray[key], values[i]));
      assert.equal(ray.style, values[4] || 'solid');
      assert.equal(ray.arrow, values[4] !== 'dashed');
    });
  });
}

test('シーン自体が空・配列・数などでも例外を投げない', () => {
  for (const s of [null, undefined, [], {}, '', 1, true]) {
    reject(s);
    assert.deepEqual(scene.moveElement(s, 'nope', 'move', { x: 0, y: 0 }), s);
    assert.deepEqual(scene.setOption(s, 'medium', 'water'), s);
  }
});

test('焦点距離と寸法の不正な値を拒む', () => {
  for (const id of ['lens', 'lens-image']) {
    for (const focalLength of [0, -1, '100', null, [], true, NaN, Infinity, 1e308]) {
      const s = boards.get(id).scene;
      part(s, 'lens').focalLength = focalLength;
      reject(s);
    }
  }
  for (const [id, type, key] of [['straight', 'blocker', 'height'], ['reflect', 'mirror', 'length'], ['mirror-image', 'object', 'height']]) {
    const s = boards.get(id).scene;
    part(s, type)[key] = 0;
    reject(s);
  }
});

test('直進: 両端を通る光線とスクリーンの影', () => {
  const s = boards.get('straight').scene;
  const src = part(s, 'source');
  const blocker = part(s, 'blocker');
  const screen = part(s, 'screen');
  const result = valid(s);
  const ratio = (screen.x - src.x) / (blocker.x - src.x);
  near(result.measures.shadowTop, src.y + (blocker.y - blocker.height / 2 - src.y) * ratio);
  near(result.measures.shadowBottom, src.y + (blocker.y + blocker.height / 2 - src.y) * ratio);
  near(result.measures.shadowSize, blocker.height * ratio);
  for (const [i, sign] of [-1, 1].entries()) {
    const ray = result.rays[i];
    near(geometry.distancePointToLine({ x: blocker.x, y: blocker.y + sign * blocker.height / 2 },
      { x: ray.x1, y: ray.y1 }, { x: ray.x2, y: ray.y2 }), 0);
  }
});

test('反射: 垂直の光は来た道を戻る', () => {
  const s = boards.get('reflect').scene;
  const mirror = part(s, 'mirror');
  const moved = scene.moveElement(s, 'src', 'move', { x: mirror.x, y: 50 });
  const result = valid(moved);
  near(result.measures.incidenceDeg, 0);
  near(result.measures.reflectionDeg, 0);
  const out = result.rays[1];
  near(out.x1, mirror.x); near(out.x2, mirror.x);
  assert.ok(out.y2 < out.y1);
});

test('鏡を傾けても法線から測った角度と光線が一致する', () => {
  let s = boards.get('reflect').scene;
  s = scene.moveElement(s, 'mirror', 'tilt', { x: 450, y: 320 });
  const result = valid(s);
  near(result.measures.incidenceDeg, result.measures.reflectionDeg);
  assert.ok(result.measures.mirrorTiltDeg > 0);
  for (const angle of result.angles) near(Math.abs(angle.toDeg - angle.fromDeg), angle.valueDeg);
  assert.notEqual(result.measures.incidenceDeg, Math.round(result.measures.incidenceDeg));
});

for (const tilt of [-40, 0, 40]) {
  test(`反射 ${tilt}°: 法線と鏡の文字はそれぞれの端に添え、入射点から離す`, () => {
    const s = boards.get('reflect').scene, mirror = part(s, 'mirror');
    mirror.tiltDeg = tilt;
    const radians = tilt * Math.PI / 180;
    const normal = { x: Math.sin(radians), y: -Math.cos(radians) };
    const normalEnd = { x: mirror.x + normal.x * 190, y: mirror.y + normal.y * 190 };
    const mirrorEnd = { x: mirror.x - Math.cos(radians) * mirror.length / 2,
      y: mirror.y - Math.sin(radians) * mirror.length / 2 };
    const result = valid(s), n = result.marks.find(mark => mark.key === 'normal');
    const m = result.marks.find(mark => mark.key === 'mirror');
    assert.equal(n.text, '法線'); assert.equal(m.text, '鏡');
    near(n.x, normalEnd.x); near(n.y, normalEnd.y);
    near(m.x, mirrorEnd.x); near(m.y, mirrorEnd.y);
    attachedMarks(s, result);
    assert.ok(Math.hypot(n.x - normalEnd.x, n.y - normalEnd.y) <= 30);
    assert.ok(Math.hypot(m.x - mirrorEnd.x, m.y - mirrorEnd.y) <= 40);
    for (const mark of [n, m]) assert.ok(Math.hypot(mark.x - mirror.x, mark.y - mirror.y) >= 60);
    const handle = scene.handles(s).find(h => h.handle === 'tilt');
    assert.ok(Math.hypot(m.x - mirrorEnd.x, m.y - mirrorEnd.y) < Math.hypot(m.x - handle.x, m.y - handle.y));
  });
}

test('法線の端が上辺・左右辺に達する配置でも、文字の基準点は線上の見える端に収める', () => {
  for (const [x, y, tilt] of [[300, 100, 0], [40, 270, -40], [560, 270, 40]]) {
    const s = boards.get('reflect').scene, mirror = part(s, 'mirror'), src = part(s, 'source');
    Object.assign(mirror, { x, y, length: 40, tiltDeg: tilt });
    const radians = tilt * Math.PI / 180, nx = Math.sin(radians), ny = -Math.cos(radians);
    Object.assign(src, { x: x + nx * 30, y: y + ny * 30 });
    const mark = valid(s).marks.find(mark => mark.key === 'normal');
    if (tilt === 0) { near(mark.x, x); near(mark.y, 0); }
    else {
      const edgeX = tilt < 0 ? 0 : 600, distance = (edgeX - x) / nx;
      near(mark.x, edgeX); near(mark.y, y + ny * distance);
    }
  }
});

test('下辺に近い鏡と下向きの法線でも、文字の基準点は線上に残す', () => {
  const reflected = boards.get('reflect').scene;
  part(reflected, 'mirror').y = 400;
  const mirror = valid(reflected).marks.find(mark => mark.key === 'mirror');
  near(mirror.x, 120); near(mirror.y, 400);
  let refracted = boards.get('refract').scene;
  part(refracted, 'boundary').y = 380;
  refracted = scene.setOption(refracted, 'direction', 'medium-to-air');
  const normal = valid(refracted).marks.find(mark => mark.key === 'normal');
  near(normal.x, 300); near(normal.y, 420);
});

test('直進のついたて・スクリーンと縦の鏡の文字を上の端に添える', () => {
  const straight = boards.get('straight').scene, result = valid(straight);
  for (const [key, text] of [['blocker', 'ついたて'], ['screen', 'スクリーン']]) {
    const element = part(straight, key), mark = result.marks.find(mark => mark.key === key);
    assert.equal(mark.text, text);
    near(mark.x, element.x); near(mark.y, element.y - element.height / 2);
    assert.deepEqual(mark.away, { x: 1, y: 0 });
  }
  const s = boards.get('mirror-image').scene, mirror = part(s, 'mirror');
  const mark = valid(s).marks.find(mark => mark.key === 'mirror');
  assert.equal(mark.text, '鏡');
  near(mark.x, mirror.x); near(mark.y, mirror.y - mirror.length / 2);
  assert.deepEqual(mark.away, { x: 1, y: 0 });
});

test('屈折の法線は入射側の端、空気・水・ガラスは左端の境界から各側へ 28 離す', () => {
  for (const medium of ['water', 'glass']) for (const direction of ['air-to-medium', 'medium-to-air']) {
    let s = scene.setOption(boards.get('refract').scene, 'medium', medium);
    s = scene.setOption(s, 'direction', direction);
    const boundary = part(s, 'boundary'), result = valid(s);
    const normal = result.marks.find(mark => mark.key === 'normal');
    near(normal.x, boundary.x);
    near(normal.y, boundary.y + (direction === 'air-to-medium' ? -190 : 190));
    attachedMarks(s, result);
    const air = result.marks.find(mark => mark.key === 'air'), other = result.marks.find(mark => mark.key === 'medium');
    assert.equal(air.text, '空気'); assert.equal(other.text, medium === 'water' ? '水' : 'ガラス');
    near(air.x, 16); near(air.y, boundary.y - 28);
    near(other.x, 16); near(other.y, boundary.y + 28);
  }
});

test('レンズ2盤の焦点と光軸の文字は線上の点と下向きの away を持つ', () => {
  for (const id of ['lens', 'lens-image']) {
    const s = boards.get(id).scene, lens = part(s, 'lens'), result = valid(s);
    for (const [key, sign] of [['focus-left', -1], ['focus-right', 1]]) {
      const mark = result.marks.find(mark => mark.key === key);
      assert.equal(mark.text, '焦点');
      near(mark.x, lens.x + sign * lens.focalLength);
      near(mark.y, lens.y);
      assert.deepEqual(mark.away, { x: 0, y: 1 });
    }
    const axis = result.marks.find(mark => mark.key === 'axis');
    assert.equal(axis.text, '光軸'); near(axis.x, 540); near(axis.y, lens.y);
    assert.deepEqual(axis.away, { x: 0, y: 1 });
  }
});

test('盤外の焦点の文字だけ省き、盤の端ちょうどの焦点は残す', () => {
  // 通常のシーン検査では盤外の焦点を作れないため、文字を作る関数だけを VM 内で取り出す。
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../js/scene.js'), 'utf8');
  assert.ok(source.includes('const api = { KINDS,'));
  const context = { Hikari: { config, geometry, optics: require('../js/optics.js') } };
  vm.runInNewContext(source.replace('const api = { KINDS,', 'const api = { lensMarks, KINDS,'), context);
  for (const [x, focalLength, expected] of [
    [180, 200, ['focus-right']], [420, 200, ['focus-left']], [300, 400, []],
    [180, 180, ['focus-left', 'focus-right']], [420, 180, ['focus-left', 'focus-right']],
  ]) {
    const result = { marks: [] };
    context.Hikari.scene.lensMarks(result, { x, y: 210, focalLength });
    assert.deepEqual(result.marks.filter(mark => mark.text === '焦点').map(mark => mark.key), expected);
    assert.equal(result.marks.filter(mark => mark.key === 'axis').length, 1);
    for (const mark of result.marks) assert.ok(mark.x >= 0 && mark.x <= 600 && mark.y >= 0 && mark.y <= 420);
  }
});

test('反射の光源を反対側へ引いても鏡の手前に止まる', () => {
  let s = boards.get('reflect').scene;
  s = scene.moveElement(s, 'mirror', 'tilt', { x: 450, y: 320 });
  s = scene.moveElement(s, 'src', 'move', { x: 300, y: 5000 });
  valid(s);
  const mirror = part(s, 'mirror');
  const t = mirror.tiltDeg * Math.PI / 180;
  const src = part(s, 'source');
  assert.ok((src.x - mirror.x) * Math.sin(t) - (src.y - mirror.y) * Math.cos(t) >= 20 - 1e-8);
});

test('鏡の像は対称、実線は物体から目へ、延長は像へ向かう', () => {
  const s = boards.get('mirror-image').scene;
  const result = valid(s);
  const object = part(s, 'object');
  const mirror = part(s, 'mirror');
  const image = result.images[0];
  near(image.x, 2 * mirror.x - object.x);
  near(image.y, object.y);
  near(result.measures.objectDistance, result.measures.imageDistance);
  assert.equal(image.kind, 'mirror');
  const dashed = result.rays.filter(r => r.style === 'dashed');
  assert.equal(dashed.length, 2);
  for (const r of dashed) {
    near(geometry.distancePointToLine({ x: image.x, y: image.y - image.height },
      { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }), 0);
  }
  const solid = result.rays.filter(r => r.style === 'solid');
  for (let i = 0; i < solid.length; i += 2) {
    const incoming = solid[i], outgoing = solid[i + 1];
    near(incoming.x2, mirror.x); near(outgoing.x1, mirror.x);
    near(Math.abs((incoming.y2 - incoming.y1) / (incoming.x2 - incoming.x1)),
      Math.abs((outgoing.y2 - outgoing.y1) / (outgoing.x2 - outgoing.x1)));
  }
});

test('屈折: 垂直・スネルの法則・全反射', () => {
  let s = boards.get('refract').scene;
  const boundary = part(s, 'boundary');
  s = scene.moveElement(s, 'src', 'move', { x: boundary.x, y: 50 });
  let result = valid(s);
  near(result.measures.incidenceDeg, 0); near(result.measures.refractionDeg, 0);
  assert.ok(result.rays.filter(r => r.style === 'solid').some(r => r.y2 > boundary.y && r.x1 === r.x2));
  s = scene.moveElement(s, 'src', 'move', { x: boundary.x - 80, y: boundary.y - 120 });
  result = valid(s);
  near(Math.sin(result.measures.incidenceDeg * Math.PI / 180), 1.33 * Math.sin(result.measures.refractionDeg * Math.PI / 180));
  assert.equal(result.angles.find(a => a.key === 'out').name, '屈折角');
  s = scene.setOption(s, 'direction', 'medium-to-air');
  s = scene.moveElement(s, 'src', 'move', { x: boundary.x - 100 * Math.sqrt(3), y: boundary.y + 100 });
  result = valid(s);
  near(result.measures.incidenceDeg, 60);
  assert.equal(result.measures.totalReflection, true);
  assert.equal(result.measures.refractionDeg, null);
  assert.ok(result.notes.includes('全反射'));
  assert.equal(result.rays.length, 2);
  assert.ok(result.rays.every(r => r.y1 >= boundary.y && r.y2 >= boundary.y));
});

test('屈折: 向きと物質の切り替えは元を変えず、角度を保つ', () => {
  const original = boards.get('refract').scene;
  const snapshot = structuredClone(original);
  let s = scene.setOption(original, 'direction', 'medium-to-air');
  const first = valid(original).measures.incidenceDeg;
  near(valid(s).measures.incidenceDeg, first);
  assert.ok(part(s, 'source').y > part(s, 'boundary').y);
  s = scene.moveElement(s, 'src', 'move', { x: 100, y: -1000 });
  assert.ok(part(s, 'source').y > part(s, 'boundary').y);
  valid(s);
  s = scene.setOption(s, 'medium', 'glass');
  assert.equal(valid(s).measures.medium, 'glass');
  near(scene.trace(s).measures.criticalDeg, 41.810314895778596);
  s = scene.setOption(s, 'direction', 'air-to-medium');
  assert.ok(part(s, 'source').y < part(s, 'boundary').y);
  s = scene.moveElement(s, 'src', 'move', { x: 100, y: 5000 });
  assert.ok(part(s, 'source').y < part(s, 'boundary').y);
  valid(s);
  assert.deepEqual(original, snapshot);
});

test('凸レンズ: 平行光が焦点で交わり、焦点距離を動かせる', () => {
  let s = boards.get('lens').scene;
  s = scene.moveElement(s, 'lens', 'focus', { x: 440, y: 0 });
  const lens = part(s, 'lens');
  const result = valid(s);
  near(result.measures.focalLength, 140);
  assert.equal(result.rays.length, 9);
  for (const r of result.rays.filter(r => r.x1 === lens.x)) {
    near(geometry.distancePointToLine({ x: lens.x + lens.focalLength, y: lens.y },
      { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }), 0);
  }
});

for (const [a, kind, note] of [
  [100, 'none', '像はできません（レンズを出た光が平行になります）'],
  [100.5, 'none', '像はできません（レンズを出た光が平行になります）'],
  [50, 'virtual', '虚像（スクリーンには映りません）'],
  [200, 'real', null],
]) {
  test(`実像と虚像: 物体距離 ${a}`, () => {
    let s = boards.get('lens-image').scene;
    const lens = part(s, 'lens');
    s = scene.moveElement(s, 'object', 'move', { x: lens.x - a, y: 30 });
    const result = valid(s);
    assert.equal(result.measures.imageKind, kind);
    if (note) assert.ok(result.notes.includes(note));
    if (kind === 'none') {
      assert.deepEqual(result.images, []);
      assert.equal(result.measures.imageDistance, null);
      if (a === 100) {
        const out = result.rays.filter(r => r.x1 === lens.x);
        assert.equal(out.length, 2);
        near((out[0].y2 - out[0].y1) / (out[0].x2 - out[0].x1),
          (out[1].y2 - out[1].y1) / (out[1].x2 - out[1].x1));
      }
    } else {
      const image = result.images[0];
      const rays = result.rays.filter(r => kind === 'virtual' ? r.style === 'dashed' : r.x1 === lens.x);
      assert.equal(rays.length, 3);
      for (const r of rays) near(geometry.distancePointToLine({ x: image.x, y: image.y - image.height },
        { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }), 0);
      assert.equal(result.measures.inverted, kind === 'real');
    }
    if (kind !== 'real') assert.equal(result.measures.screenSharp, false);
  });
}

test('像が盤の外なら光線を端で切り、物体はレンズの手前で止める', () => {
  let s = boards.get('lens-image').scene;
  s = scene.moveElement(s, 'object', 'move', { x: 190, y: 210 });
  let result = valid(s);
  assert.equal(result.images[0].offBoard, true);
  assert.ok(result.notes.includes('像はこの先にできます'));
  s = scene.moveElement(s, 'object', 'move', { x: 300, y: 210 });
  result = valid(s);
  assert.ok(result.measures.objectDistance >= 20);
  assert.equal(result.measures.imageKind, 'virtual');
});

test('実像と虚像: x=60〜280 の全位置で、光線はレンズの範囲内だけで曲がる', () => {
  const original = boards.get('lens-image').scene;
  for (let x = 60; x <= 280; x += 5) {
    const s = scene.moveElement(original, 'object', 'move', { x, y: 210 });
    const lens = part(s, 'lens'), object = part(s, 'object'), result = valid(s);
    const thirdHeight = object.height * lens.focalLength / (lens.x - x - lens.focalLength);
    const count = result.measures.imageKind !== 'none' && Math.abs(thirdHeight) <= config.lensHalfHeight ? 3 : 2;
    const solid = result.rays.filter(r => r.style === 'solid'), dashed = result.rays.filter(r => r.style === 'dashed');
    assert.equal(solid.length, count * 2, 'x=' + x);
    assert.equal(dashed.length, result.measures.imageKind === 'virtual' ? count : 0, 'x=' + x);
    for (let i = 0; i < solid.length; i += 2) {
      const incoming = solid[i], outgoing = solid[i + 1];
      near(incoming.x1, object.x); near(incoming.y1, object.y - object.height);
      near(incoming.x2, lens.x); near(outgoing.x1, lens.x); near(incoming.y2, outgoing.y1);
      assert.ok(Math.abs(incoming.y2 - lens.y) <= config.lensHalfHeight + 1e-8, 'x=' + x);
      if (result.images.length) {
        const image = result.images[0];
        near(geometry.distancePointToLine({ x: image.x, y: image.y - image.height },
          { x: outgoing.x1, y: outgoing.y1 }, { x: outgoing.x2, y: outgoing.y2 }), 0);
      }
    }
    for (const r of dashed) {
      near(r.x1, lens.x);
      assert.ok(Math.abs(r.y1 - lens.y) <= config.lensHalfHeight + 1e-8);
      const image = result.images[0];
      near(geometry.distancePointToLine({ x: image.x, y: image.y - image.height },
        { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }), 0);
    }
    const expectedNotes = result.measures.imageKind === 'none' ? ['像はできません（レンズを出た光が平行になります）'] :
      result.measures.imageKind === 'virtual' ? ['虚像（スクリーンには映りません）'] : [];
    if (result.images.some(image => image.offBoard)) expectedNotes.push('像はこの先にできます');
    assert.deepEqual(result.notes, expectedNotes);
  }
});

test('実像と虚像: レンズの上下の端ちょうどは通し、少しでも外なら光線と延長を省く', () => {
  const original = boards.get('lens-image').scene, lens = part(original, 'lens'), object = part(original, 'object');
  for (const sign of [-1, 1]) for (const delta of [-.001, 0, .001]) {
    const height = sign * (config.lensHalfHeight + delta);
    const x = lens.x - lens.focalLength - object.height * lens.focalLength / height;
    const result = valid(scene.moveElement(original, 'object', 'move', { x, y: 210 }));
    const count = delta <= 0 ? 3 : 2;
    assert.equal(result.rays.filter(r => r.style === 'solid').length, count * 2);
    assert.equal(result.rays.filter(r => r.style === 'dashed').length, sign < 0 ? count : 0);
    if (delta === 0) assert.ok(result.rays.some(r => r.x1 === lens.x && Math.abs(r.y1 - lens.y - height) < 1e-8));
  }
});

test('凸レンズ: 光源を上・下の端へ引いても3本ともレンズの範囲内で通る', () => {
  const original = boards.get('lens').scene;
  for (const y of [-1000, 5000]) {
    const moved = scene.moveElement(original, 'src', 'move', { x: 60, y });
    const lens = part(moved, 'lens'), src = part(moved, 'source'), result = valid(moved);
    const offset = y < 0 ? Math.min(config.motion.maxBeamOffset, config.lensHalfHeight) : config.motion.minBeamOffset;
    near(lens.y - src.y, offset);
    assert.equal(result.rays.length, 9);
    for (const ray of result.rays.filter(r => r.x1 === lens.x)) {
      assert.ok(Math.abs(ray.y1 - lens.y) <= config.lensHalfHeight);
      near(geometry.distancePointToLine({ x: lens.x + lens.focalLength, y: lens.y },
        { x: ray.x1, y: ray.y1 }, { x: ray.x2, y: ray.y2 }), 0);
    }
  }
  const outside = structuredClone(original);
  part(outside, 'source').y = part(outside, 'lens').y - config.lensHalfHeight - 1;
  reject(outside);
});

test('スクリーンは実像の位置から ±6 以内ではっきり映る', () => {
  const s = boards.get('lens-image').scene;
  const imageX = scene.trace(s).images[0].x;
  for (const delta of [-6.01, -6, 0, 6, 6.01]) {
    const moved = scene.moveElement(s, 'screen', 'move', { x: imageX + delta, y: 0 });
    assert.equal(valid(moved).measures.screenSharp, Math.abs(delta) <= 6);
  }
});

test('屈折の切り替えデータや余分な複雑な項目は拒む', () => {
  for (const options of [undefined, null, [], {}, { direction: true, medium: 'water' },
    { direction: 'air-to-medium', medium: 'nope' },
    { direction: 'air-to-medium', medium: 'water', extra: {} }]) {
    const s = boards.get('refract').scene;
    s.options = options;
    reject(s);
  }
  const s = boards.get('reflect').scene;
  s.extra = s;
  reject(s);
});

test('境界が中央になくても、向きの切り替えで入射角を保つ', () => {
  for (const y of [40, 80.25, 340.75, 380]) {
    const s = boards.get('refract').scene;
    part(s, 'boundary').y = y;
    part(s, 'source').y = 20;
    const before = valid(s).measures.incidenceDeg;
    const switched = scene.setOption(s, 'direction', 'medium-to-air');
    near(valid(switched).measures.incidenceDeg, before);
    assert.ok(part(switched, 'source').y >= y + 20);
    const returned = scene.setOption(switched, 'direction', 'air-to-medium');
    near(valid(returned).measures.incidenceDeg, before);
  }
});

test('水・ガラスの両方向で、描く屈折光もスネルの法則を満たす', () => {
  for (const medium of ['water', 'glass']) {
    for (const direction of ['air-to-medium', 'medium-to-air']) {
      let s = scene.setOption(boards.get('refract').scene, 'medium', medium);
      s = scene.setOption(s, 'direction', direction);
      const entering = direction === 'air-to-medium';
      for (const sign of [-1, 1]) {
        s = scene.moveElement(s, 'src', 'move', { x: 300 + sign * 50, y: 210 + (entering ? -120 : 120) });
        const result = valid(s), r = result.rays[1];
        const incoming = geometry.sub(part(s, 'boundary'), part(s, 'source'));
        const outgoing = { x: r.x2 - r.x1, y: r.y2 - r.y1 };
        const n = medium === 'water' ? 1.33 : 1.5;
        near((entering ? 1 : n) * Math.abs(incoming.x) / geometry.len(incoming),
          (entering ? n : 1) * Math.abs(outgoing.x) / geometry.len(outgoing));
        assert.equal(Math.sign(outgoing.y), entering ? 1 : -1);
        assert.equal(Math.sign(outgoing.x), Math.sign(incoming.x));
      }
    }
  }
});

test('鏡の像・虚像が盤の外でも、光線は有限で盤内に収まる', () => {
  for (const [id, x] of [['mirror-image', 20], ['lens-image', 201]]) {
    const s = scene.moveElement(boards.get(id).scene, 'object', 'move', { x, y: 180 });
    const result = valid(s);
    assert.equal(result.images[0].offBoard, true);
    assert.ok(result.notes.includes('像はこの先にできます'));
    assert.ok(result.rays.some(r => r.style === 'dashed'));
  }
});

test('虚像・像なしはスクリーンをどこへ動かしても映らない', () => {
  for (const x of [200, 200.5, 250, 280]) {
    let s = scene.moveElement(boards.get('lens-image').scene, 'object', 'move', { x, y: 210 });
    for (const screenX of [320, 400, 500, 580]) {
      s = scene.moveElement(s, 'screen', 'move', { x: screenX, y: 210 });
      assert.equal(valid(s).measures.screenSharp, false);
    }
  }
});

for (const id of scene.KINDS) {
  test(`${id}: 操作を組み合わせて往復しても不正な配置にならない`, () => {
    let s = boards.get(id).scene, seed = 213000;
    function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    for (let i = 0; i < 120; i++) {
      const snapshot = structuredClone(s);
      const all = scene.handles(s), h = all[Math.floor(random() * all.length)];
      let moved = h ? scene.moveElement(s, h.elementId, h.handle,
        { x: random() * 1600 - 500, y: random() * 1400 - 500 }) :
        scene.setOption(scene.setOption(s, 'weights', Math.floor(random() * 6)), 'spring', i % 2 ? 'A' : 'B');
      if (id === 'refract' && i % 3 === 0) moved = scene.setOption(moved, 'direction', i % 2 ? 'air-to-medium' : 'medium-to-air');
      valid(moved);
      assert.deepEqual(s, snapshot);
      s = moved;
    }
  });
}
