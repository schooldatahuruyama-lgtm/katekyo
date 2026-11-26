// 台本の参照、時間割、途中の状態を画面なしで確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const explain = require('../js/explain.js');
const scene = require('../js/scene.js');
const boards = require('../js/boards.js');
const scripts = { BOARDS: { ...require('../content/scripts-light.js').BOARDS, ...require('../content/scripts-sound.js').BOARDS,
  ...require('../content/scripts-force.js').BOARDS } };

function near(a, b) { assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`); }
function setup(id = 'reflect') {
  const s = boards.get(id).scene;
  return { s, result: scene.trace(s), handles: scene.handles(s) };
}
function timeline(draws, options = {}, id = 'reflect') {
  const { s, result, handles } = setup(id);
  return explain.buildTimeline(draws.map(draw => ({ draw })), s, result, handles, options);
}

test('力の複合描画は形・ラベル・切り替えを解決する', () => {
  const cases = [
    ['force-spring', 'el:stand', ['stand'], []], ['force-spring', 'el:spring', ['spring'], ['spring']],
    ['force-spring', 'el:weights', ['weights'], ['weights']], ['force-spring', 'stretch', ['stretch'], ['stretch']],
    ['force-spring', 'label:force', ['forceArrow'], ['force']], ['force-spring', 'graph', ['graph'], ['graph-x', 'graph-y']],
    ['force-arrow', 'el:box', ['grid', 'box'], ['box']], ['force-arrow', 'application', ['application'], ['application']],
    ['force-arrow', 'force', ['arrow'], []], ['force-arrow', 'direction', [], ['direction']],
    ['force-arrow', 'magnitude', ['magnitude'], ['magnitude']], ['force-arrow', 'label:scale', [], ['scale']],
    ['force-balance', 'el:card', ['grid', 'card'], ['scale', 'card']], ['force-balance', 'pull:left', ['pulls'], ['left']],
    ['force-balance', 'pull:right', ['pulls'], ['right']], ['force-balance', 'line', ['lines'], []],
    ['force-balance', 'label:state', [], ['state']],
  ];
  for (const [id, token, shapes, labels] of cases) {
    const { s, result, handles } = setup(id), items = explain.resolve(token, s, result, handles).items;
    assert.deepEqual(items.filter(i => i.ref.source === 'force').map(i => i.ref.key), shapes, token);
    assert.deepEqual(items.filter(i => i.type === 'text').map(i => i.ref.key), labels, token);
    items.forEach(item => checkRef(item, s, result, handles));
  }
  for (const [id, args, options] of [['force-spring', ['spring', 'weights', 'graph'], ['weights', 'spring']],
    ['force-arrow', ['force'], []], ['force-balance', ['pulls', 'card', 'state'], ['line']]]) {
    const { s, result, handles } = setup(id);
    for (const arg of args) {
      const items = explain.resolve('point:' + arg, s, result, handles).items;
      assert.ok(items.length > 0); assert.ok(items.every(i => i.type === 'point'));
      items.forEach(item => checkRef(item, s, result, handles));
    }
    for (const token of ['controls', 'point:controls']) assert.deepEqual(explain.resolve(token, s, result, handles).items.map(i => i.ref.key), options);
    const bad = structuredClone(s); bad.elements = [];
    assert.deepEqual(explain.resolve('controls', bad, scene.trace(bad), []).items, []);
  }
  for (const token of ['pull', 'pull:up', 'graph:line', 'label:unknown', 'point:unknown']) assert.equal(explain.parseDraw(token), null);
});

test('グラフは今の点と直線・残りの 5 点を分け、0 個ではのびと力の矢印を返さない', () => {
  for (const spring of ['A', 'B']) for (let weights = 0; weights <= 5; weights++) {
    const s = boards.get('force-spring').scene; s.options = { spring, weights };
    const result = scene.trace(s), current = explain.resolve('graph-point', s, result, []).items;
    const rest = explain.resolve('graph-line', s, result, []).items;
    assert.deepEqual(current, [{ type: 'point', ref: { source: 'force', key: 'graph', part: 'points', index: weights } }]);
    assert.equal(rest.length, 6);
    assert.deepEqual(rest[0], { type: 'line', ref: { source: 'force', key: 'graph', part: 'line' } });
    assert.deepEqual(rest.slice(1).map(i => i.ref.index), [0, 1, 2, 3, 4, 5].filter(n => n !== weights));
    for (const token of ['stretch', 'label:force']) {
      const items = explain.resolve(token, s, result, []).items;
      assert.equal(items.filter(i => i.ref.source === 'force').length, weights ? 1 : 0);
    }
  }
  const s = scene.setOption(boards.get('force-balance').scene, 'line', 'offset');
  assert.deepEqual(explain.resolve('line', s, scene.trace(s), scene.handles(s)).items.map(i => i.ref.index), [0, 1]);
});

test('読む時間は Unicode の字数で数え、空や文字列以外は最小値、長文は上限なし', () => {
  for (const value of ['', null, undefined, [], {}, 100, NaN]) assert.equal(explain.readMs(value), 2500);
  assert.equal(explain.readMs('あ'.repeat(40)), 6000);
  assert.equal(explain.readMs('あ'.repeat(75)), 11250);
  assert.equal(explain.readMs('あ'.repeat(10000)), 1500000);
  assert.equal(explain.readMs('😀'.repeat(20)), 3000);
});

test('読む時間が不正ならその手は0、配列の長さ違いも従来の時間割になる', () => {
  const draws = [['point:mirror'], ['el:mirror']], original = timeline(draws);
  for (const value of [undefined, null, {}, '5000', 5000, [], [5000], [5000, 5000, 5000],
    [NaN, NaN], [-1, -10], [Infinity, null], ['5000', []]]) {
    assert.deepEqual(timeline(draws, { readMs: value }), original);
  }
  const partial = timeline(draws, { readMs: [NaN, 20000] });
  assert.deepEqual(partial.steps[0], original.steps[0]);
  assert.equal(partial.steps[1].duration, 21500);
});

test('読む時間は速さで割るが描画の時刻を変えず、音声と描画との最大値を使う', () => {
  for (const rate of [.5, 1, 2]) for (const reading of [0, 2500, 15000]) {
    const original = timeline([['el:mirror', 'ray:incident']], { rate });
    const actual = timeline([['el:mirror', 'ray:incident']], { rate, readMs: [reading] });
    assert.deepEqual(actual.steps[0].parts, original.steps[0].parts);
    assert.equal(actual.steps[0].drawDuration, original.steps[0].drawDuration);
    near(actual.total, Math.max(original.steps[0].drawDuration, reading / rate) + 1500 / rate);
    for (const seconds of [2, 20]) {
      const voiced = timeline([['el:mirror', 'ray:incident']], { rate, clipSeconds: [seconds] });
      const both = timeline([['el:mirror', 'ray:incident']], { rate, clipSeconds: [seconds], readMs: [reading] });
      assert.deepEqual(both.steps[0].parts, voiced.steps[0].parts);
      near(both.total, Math.max(voiced.steps[0].drawDuration, seconds * 1000 / rate, reading / rate) + 1500 / rate);
    }
  }
  for (const { id } of boards.list()) {
    const { s, result, handles } = setup(id), steps = scripts.BOARDS[id];
    const plain = explain.buildTimeline(steps, s, result, handles);
    const reading = steps.map(step => explain.readMs(step.lines.E));
    const actual = explain.buildTimeline(steps, s, result, handles, { readMs: reading });
    actual.steps.forEach((step, index) => {
      assert.deepEqual(step.parts, plain.steps[index].parts);
      near(step.duration, Math.max(plain.steps[index].drawDuration, reading[index]) + 1500);
      if (index) near(step.start, actual.steps[index - 1].start + actual.steps[index - 1].duration);
    });
  }
});

test('音の複合参照は形とラベルをそろえ、弧は内から外へ順に描く', () => {
  const cases = [
    ['sound-wave', 'el:tuning-fork', ['fork'], ['tuning-fork']],
    ['sound-wave', 'grid', ['grid'], ['grid']], ['sound-wave', 'amplitude', ['amplitude'], ['amplitude']],
    ['sound-wave', 'period', ['period'], ['period']],
    ['sound-string', 'el:string', ['box', 'string'], ['string']],
    ['sound-string', 'el:bridge', ['bridge'], ['bridge']],
    ['sound-speed', 'el:listener', ['ground', 'listener'], ['listener']],
    ['sound-speed', 'distance', ['distanceArrow'], ['distance']],
  ];
  for (const [id, token, shapes, labels] of cases) {
    const { s, result, handles } = setup(id), items = explain.resolve(token, s, result, handles).items;
    assert.deepEqual(items.filter(i => i.ref.source === 'sound').map(i => i.ref.key), shapes);
    assert.deepEqual(items.filter(i => i.type === 'text').map(i => i.ref.key), labels);
  }
  const string = setup('sound-string');
  for (const token of ['controls', 'point:controls']) {
    assert.deepEqual(explain.resolve(token, string.s, string.result, string.handles).items.map(i => i.ref.key), ['thickness', 'tension']);
  }
  const arcs = timeline([['sound-waves']], {}, 'sound-speed').steps[0].parts;
  assert.equal(arcs.length, 4);
  arcs.forEach((part, index) => {
    assert.equal(part.items[0].ref.index, index); assert.equal(part.duration, 600); assert.equal(part.start, index * 600);
  });
  for (const token of ['el:oscillo', 'label', 'label:unknown', 'wave:unknown', 'grid:1']) assert.equal(explain.parseDraw(token), null);
});

test('draw の種類と引数を読み取り、知らない指定や文字列以外を拒む', () => {
  assert.deepEqual(explain.DRAW_KINDS, ['el', 'normal', 'axis', 'focus', 'shadow', 'image', 'image-label',
    'ray', 'angle', 'point', 'handles', 'controls', 'grid', 'wave', 'amplitude', 'period', 'vibration', 'sound-waves', 'distance', 'label',
    'stretch', 'graph', 'graph-point', 'graph-line', 'application', 'force', 'direction', 'magnitude', 'pull', 'line']);
  assert.deepEqual(explain.parseDraw('ray:incident'), { kind: 'ray', arg: 'incident' });
  assert.deepEqual(explain.parseDraw('normal'), { kind: 'normal', arg: null });
  for (const token of ['', 'nope', 12, null, undefined, {}, 'ray', 'ray:', 'ray:unknown',
    'el:unknown', 'point:unknown', 'angle:left', 'normal:in', 'ray:incident:more', ' axis']) {
    assert.equal(explain.parseDraw(token), null, String(token));
  }
});

function checkRef(item, s, result, handles) {
  assert.ok(['element', 'line', 'text', 'arc', 'image', 'shadow', 'point', 'handles', 'controls'].includes(item.type));
  const ref = item.ref;
  if (ref.source === 'elements') assert.ok(s.elements.some(e => e.id === ref.id));
  else if (ref.source === 'rays' || ref.source === 'images') assert.ok(result[ref.source][ref.index]);
  else if (ref.source === 'marks' || ref.source === 'angles') assert.ok(result[ref.source].some(v => v.key === ref.key));
  else if (ref.source === 'handles') assert.ok(handles.some(h => h.elementId === ref.elementId && h.handle === ref.handle));
  else if (ref.source === 'options') assert.ok(Object.hasOwn(s.options, ref.key));
  else if (ref.source === 'sound') {
    assert.ok(result.sound[ref.key]);
    if (ref.index !== undefined) assert.ok(result.sound[ref.key][ref.index]);
  }
  else if (ref.source === 'force') {
    let shape = result.force[ref.key];
    assert.ok(shape);
    if (ref.part && !['highlight', 'axes'].includes(ref.part)) { shape = shape[ref.part]; assert.ok(shape); }
    if (ref.index !== undefined) assert.ok(shape[ref.index]);
  }
  else assert.fail('参照先が不明: ' + JSON.stringify(ref));
}

for (const { id } of boards.list()) {
  test(`${id}: 全 draw の参照先が実在し、最後はつまみ・必要な切り替えまで描く`, () => {
    const { s, result, handles } = setup(id), steps = scripts.BOARDS[id];
    const snapshot = structuredClone({ s, result, handles, steps });
    for (const step of steps) for (const token of step.draw) {
      const resolved = explain.resolve(token, s, result, handles);
      assert.ok(resolved.items.length > 0, token);
      resolved.items.forEach(item => checkRef(item, s, result, handles));
    }
    assert.ok(steps.at(-1).draw.includes(handles.length ? 'handles' : 'controls'));
    const tl = explain.buildTimeline(steps, s, result, handles, { clipSeconds: null, rate: 1 });
    const final = explain.finalState(tl);
    assert.equal(final.stepIndex, steps.length - 1);
    assert.equal(final.stepDone, true);
    assert.ok(final.parts.every(part => part.progress === 1));
    if (handles.length) assert.ok(final.parts.some(part => part.kind === 'handles' && part.items.length === handles.length));
    if (id === 'refract') assert.ok(final.parts.some(part => part.kind === 'controls' && part.items.length === 2));
    assert.deepEqual({ s, result, handles, steps }, snapshot);
  });

  test(`${id}: 100ms ずつ進めても、表示する parts と進捗は減らない`, () => {
    for (const rate of [.5, 1, 2]) for (const withVoice of [false, true]) {
      const { s, result, handles } = setup(id), steps = scripts.BOARDS[id];
      const tl = explain.buildTimeline(steps, s, result, handles, { rate,
        clipSeconds: withVoice ? steps.map(() => 10) : null });
      let previous = [];
      function check(index, ms) {
        const state = explain.stateAt(tl, index, ms);
        assert.ok(state.parts.length >= previous.length);
        state.parts.forEach((part, i) => {
          assert.ok(part.progress >= 0 && part.progress <= 1);
          if (previous[i]) assert.ok(part.progress >= previous[i].progress);
        });
        previous = state.parts;
      }
      for (const step of tl.steps) {
        for (let ms = 0; ms <= step.duration; ms += 100) check(step.index, ms);
        check(step.index, step.duration);
      }
    }
  });
}

test('複合 draw は形と文字の参照を持ち、角の数字と名前を区別する', () => {
  const { s, result, handles } = setup();
  const resolve = token => explain.resolve(token, s, result, handles).items;
  assert.deepEqual(resolve('normal'), [
    { type: 'line', ref: { source: 'angles', key: 'in', part: 'normal' } },
    { type: 'text', ref: { source: 'marks', key: 'normal', field: 'text' } },
  ]);
  assert.deepEqual(resolve('el:source'), [
    { type: 'element', ref: { source: 'elements', id: 'src', part: 'body' } },
    { type: 'text', ref: { source: 'handles', elementId: 'src', handle: 'move', field: 'label' } },
  ]);
  assert.deepEqual(resolve('angle:in').map(item => [item.type, item.ref.field]),
    [['arc', undefined], ['text', 'name'], ['text', 'valueDeg']]);
  assert.deepEqual(resolve('el:lens'), []);
  assert.deepEqual(resolve('controls'), []);
  assert.deepEqual(explain.resolve('unknown', s, result, handles), { kind: null, arg: null, items: [] });
});

test('焦点の点と指す印は別で、境目は物質の文字も含む', () => {
  const lens = setup('lens');
  const resolve = token => explain.resolve(token, lens.s, lens.result, lens.handles).items;
  assert.equal(resolve('el:lens').length, 1);
  assert.deepEqual(resolve('focus').map(item => item.type), ['point', 'point', 'text', 'text']);
  assert.ok(resolve('focus').filter(item => item.type === 'point').every(item => item.ref.part === 'dot'));
  assert.ok(resolve('point:focus').every(item => item.ref.part === 'highlight'));
  const refract = setup('refract');
  assert.deepEqual(explain.resolve('el:boundary', refract.s, refract.result, refract.handles).items.map(item =>
    [item.type, item.ref.id || item.ref.key]), [['element', 'boundary'], ['text', 'air'], ['text', 'medium']]);
});

test('全反射で存在しない光線は空の参照・長さ0で飛ばす', () => {
  let s = scene.setOption(boards.get('refract').scene, 'direction', 'medium-to-air');
  s = scene.moveElement(s, 'src', 'move', { x: 20, y: 240 });
  const result = scene.trace(s), handles = scene.handles(s);
  assert.equal(result.measures.totalReflection, true);
  assert.deepEqual(explain.resolve('ray:refracted', s, result, handles).items, []);
  const tl = explain.buildTimeline([{ draw: ['ray:refracted'] }], s, result, handles, { clipSeconds: [10] });
  assert.equal(tl.steps[0].parts[0].duration, 0);
  assert.equal(tl.steps[0].drawDuration, 0);
  assert.equal(tl.total, 11500);
  assert.equal(explain.stateAt(tl, 0, 0).stepDone, true);
});

test('描画は形→文字→次の draw、複数の光線は同時に800ms', () => {
  const tl = timeline([['el:source', 'ray:incident'], ['angle:in'], ['normal']]);
  assert.deepEqual(tl.steps[0].parts.map(p => [p.token, p.start, p.duration]),
    [['el:source', 0, 350], ['el:source', 350, 400], ['ray:incident', 750, 800]]);
  assert.deepEqual(tl.steps[1].parts.map(p => p.duration), [600, 400, 400]);
  assert.deepEqual(tl.steps[2].parts.map(p => p.duration), [800, 400]);
  assert.equal(timeline([['el:screen']], {}, 'straight').steps[0].drawDuration, 350 + 400);
  const ray = timeline([['ray:edge']], {}, 'straight').steps[0];
  assert.equal(ray.parts[0].items.length, 2);
  assert.equal(ray.drawDuration, 800);
  assert.equal(timeline([['point:object']], {}, 'lens-image').steps[0].drawDuration, 600);
  assert.equal(timeline([['image']], {}, 'lens-image').steps[0].drawDuration, 800);
  assert.equal(timeline([['shadow']], {}, 'straight').steps[0].drawDuration, 1200);
});

for (const rate of [.5, .75, 1, 1.25, 1.5, 1.75, 2]) {
  test(`音声なし・${rate}倍: 描画も間も同じ速さになり、手の時刻が連続する`, () => {
    const tl = timeline([['el:source', 'ray:incident'], ['ray:reflected']], { rate, clipSeconds: null });
    near(tl.steps[0].drawDuration, 1550 / rate);
    near(tl.steps[0].duration, (1550 + 1500) / rate);
    near(tl.steps[1].start, tl.steps[0].duration);
    near(tl.steps[1].duration, (800 + 1500) / rate);
    near(tl.total, (1550 + 800 + 3000) / rate);
  });

  test(`音声あり・${rate}倍: 長い声は8割まで引きのばし、短い声でも縮めない`, () => {
    const tl = timeline([['el:source', 'ray:incident'], ['ray:reflected']], { rate, clipSeconds: [10, .2] });
    near(tl.steps[0].drawDuration, 8000 / rate);
    near(tl.steps[0].duration, 11500 / rate);
    near(tl.steps[0].parts[0].duration, 350 * 8000 / 1550 / rate);
    near(tl.steps[1].drawDuration, 800 / rate);
    near(tl.steps[1].duration, 2300 / rate);
  });
}

test('clipSeconds は有限で正の数だけを使い、ほかは文字数から秒数を求める', () => {
  assert.equal(explain.clipSeconds(3.2, 20), 3.2);
  for (const value of [0, -1, NaN, Infinity, '3.2', null, undefined]) {
    assert.equal(explain.clipSeconds(value, 20), 4.6);
  }
  for (const length of [0, -1, NaN, Infinity, '20', null, undefined]) {
    assert.equal(explain.clipSeconds(null, length), 1);
  }
});

test('音声の長さが0・負・NaN・文字列・不明なら文字数から時間を求める', () => {
  for (const seconds of [0, -1, NaN, '10', undefined, null, Infinity]) {
    const tl = timeline([['ray:incident']], { clipSeconds: [seconds], textLengths: [20], rate: 2 });
    near(tl.steps[0].drawDuration, (20 * 180 + 1000) * .8 / 2);
    near(tl.total, (20 * 180 + 1000 + 1500) / 2);
  }
  assert.equal(timeline([['ray:incident']], { clipSeconds: null, textLengths: [20] }).total, 2300);
});

test('一覧にない速さは、近い値にせず1倍で計算する', () => {
  for (const rate of [0, -1, .6, 3, 1e9, '1', NaN, Infinity, null]) {
    assert.deepEqual(timeline([['ray:incident']], { rate }), timeline([['ray:incident']], { rate: 1 }));
  }
});

test('stateAt は手と時刻を補正し、未来の手を含めず、描画完了と間を区別する', () => {
  const tl = timeline([['ray:incident'], ['ray:reflected']]);
  for (const index of [-100, NaN, null, '1']) assert.equal(explain.stateAt(tl, index, 0).stepIndex, 0);
  for (const index of [2, 1e9, Infinity]) assert.equal(explain.stateAt(tl, index, 0).stepIndex, 1);
  for (const ms of [-1, NaN, '800', null]) assert.equal(explain.stateAt(tl, 0, ms).parts[0].progress, 0);
  assert.equal(explain.stateAt(tl, 0, 400).parts[0].progress, .5);
  assert.equal(explain.stateAt(tl, 0, 400).parts.length, 1);
  assert.equal(explain.stateAt(tl, 0, 799).stepDone, false);
  assert.equal(explain.stateAt(tl, 0, 800).stepDone, true);
  assert.equal(explain.stateAt(tl, 0, Infinity).stepDone, true);
  assert.deepEqual(explain.stateAt(tl, 1, 0).parts.map(p => p.progress), [1, 0]);
  const empty = explain.buildTimeline([], null, null, [], {});
  assert.deepEqual(empty, { steps: [], total: 0 });
  assert.deepEqual(explain.finalState(empty), { stepIndex: 0, parts: [], stepDone: true });
});

test('次へは描画完了→次の手→終了、もどるは前の手へ進む', () => {
  assert.deepEqual(explain.nextTarget(0, false, 3), { action: 'finish-step', stepIndex: 0 });
  assert.deepEqual(explain.nextTarget(0, true, 3), { action: 'go', stepIndex: 1 });
  assert.deepEqual(explain.nextTarget(2, false, 3), { action: 'finish-step', stepIndex: 2 });
  assert.deepEqual(explain.nextTarget(2, true, 3), { action: 'end', stepIndex: 2 });
  assert.deepEqual(explain.nextTarget(0, true, 0), { action: 'end', stepIndex: 0 });
  assert.equal(explain.backTarget(0), 0);
  assert.equal(explain.backTarget(2), 1);
});

test('新しいモジュールは DOM なしのブラウザ名前空間でも動く', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const context = {};
  for (const name of ['config', 'explain', 'prefs', 'voice']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
    assert.ok(context.Hikari[name]);
  }
  assert.equal(context.Hikari.explain.parseDraw('normal').kind, 'normal');
  assert.equal(context.Hikari.prefs.defaults(['A', 'E'], 'E').teacher, 'E');
  assert.equal(context.Hikari.voice.stepRate(1, 1), 1.25);
});

function displayedText(item, result, handles) {
  const ref = item.ref;
  if (ref.source === 'marks') return result.marks.find(mark => mark.key === ref.key).text;
  if (ref.source === 'handles') return handles.find(handle => handle.elementId === ref.elementId && handle.handle === ref.handle).label;
  if (ref.source === 'images') return { real: '実像', virtual: '虚像' }[result.images[ref.index].kind] || '像';
  const angle = result.angles.find(angle => angle.key === ref.key);
  return ref.field === 'name' ? angle.name : Math.round(angle.valueDeg) + '°';
}

const keyWords = {
  'force-spring': [[], [], [], [], [], [], [], [], []],
  'force-arrow': [[], ['作用点'], [], ['力の向き'], [], [], [], []],
  'force-balance': [[], [], [], [], [], [], [], [], []],
  'sound-wave': [[], [], [], [], ['振幅'], [], [], [], []],
  'sound-string': [['弦'], [], [], [], ['振幅'], [], [], [], []],
  'sound-speed': [[], [], [], [], [], [], [], [], []],
  straight: [['光源'], [], ['ついたて'], [], [], ['影'], []],
  reflect: [[], [], ['法線'], [], ['入射角'], ['反射角'], []],
  'mirror-image': [[], [], [], [], [], ['像'], []],
  refract: [[], [], [], [], [], [], [], []],
  lens: [[], ['光軸'], [], [], ['焦点', '焦点'], [], [], []],
  'lens-image': [[], [], [], [], [], [], ['実像'], [], []],
};
for (const { id } of boards.list()) {
  test(`${id}: 全手の重要語句は台本のかぎ括弧と完全一致し、数字や通常の名前は含めない`, () => {
    const { s, result, handles } = setup(id), steps = scripts.BOARDS[id];
    const tl = explain.buildTimeline(steps, s, result, handles);
    const actual = tl.steps.map((step, index) => {
      const texts = step.parts.flatMap(part => part.items).filter(item => item.type === 'text');
      for (const item of texts) {
        const text = displayedText(item, result, handles);
        const terms = [...Object.values(steps[index].lines)[0].matchAll(/「([^「」]*)」/g)].map(match => match[1]);
        assert.equal(item.key, item.ref.field !== 'valueDeg' && terms.includes(text), text);
        if (['鏡', 'スクリーン', '空気', '水'].includes(text) || item.ref.field === 'valueDeg') assert.equal(item.key, false);
      }
      return texts.filter(item => item.key).map(item => displayedText(item, result, handles));
    });
    assert.deepEqual(actual, keyWords[id]);
  });
}

test('かぎ括弧なし・閉じていない言葉は、すべて通常の文字にする', () => {
  const { s, result, handles } = setup();
  for (const words of ['法線と入射角を描く。', '「法線と入射角', '']) {
    const tl = explain.buildTimeline([{ draw: ['normal', 'angle:in', 'el:source'], lines: { E: words } }], s, result, handles);
    const texts = tl.steps[0].parts.flatMap(part => part.items).filter(item => item.type === 'text');
    assert.ok(texts.length > 0); assert.ok(texts.every(item => item.key === false));
  }
});

test('2つの重要語句と同じ語の繰り返しを拾い、盤に2つあれば両方に印を付ける', () => {
  const reflect = setup(), lens = setup('lens');
  const tl = explain.buildTimeline([{ draw: ['normal', 'angle:in'], lines: { A: '「法線」と「入射角」。' } }],
    reflect.s, reflect.result, reflect.handles);
  assert.deepEqual(tl.steps[0].parts.flatMap(part => part.items).filter(item => item.key)
    .map(item => displayedText(item, reflect.result, reflect.handles)), ['法線', '入射角']);
  for (const words of ['「焦点」と「焦点」。', '「焦点」と「光軸」。']) {
    const tl = explain.buildTimeline([{ draw: ['focus'], lines: { F: words } }], lens.s, lens.result, lens.handles);
    const texts = tl.steps[0].parts.flatMap(part => part.items).filter(item => item.type === 'text');
    assert.equal(texts.length, 2); assert.ok(texts.every(item => item.key === true));
  }
});

test('部分一致の光源・焦点は重要語句にせず、数字は台本にあっても通常の文字にする', () => {
  for (const [id, draw, words] of [['straight', ['el:source'], '「光の直進」'], ['lens', ['focus'], '「焦点距離」']]) {
    const { s, result, handles } = setup(id);
    const tl = explain.buildTimeline([{ draw, lines: { E: words } }], s, result, handles);
    assert.ok(tl.steps[0].parts.flatMap(part => part.items).filter(item => item.type === 'text').every(item => !item.key));
  }
  const { s, result, handles } = setup();
  const tl = explain.buildTimeline([{ draw: ['angle:in'], lines: { E: `「${Math.round(result.angles[0].valueDeg)}°」` } }], s, result, handles);
  assert.equal(tl.steps[0].parts.flatMap(part => part.items).find(item => item.ref.field === 'valueDeg').key, false);
});

test('通常の文字は1文字でも6文字でも400ms、重要語句は1文字90ms・最短300ms', () => {
  for (const text of ['字', 'あいうえおか']) for (const key of [false, true]) {
    const { s, result, handles } = setup();
    result.marks.find(mark => mark.key === 'normal').text = text;
    const tl = explain.buildTimeline([{ draw: ['normal'], lines: { E: key ? `「${text}」` : text } }], s, result, handles);
    const part = tl.steps[0].parts.find(part => part.items[0].type === 'text');
    assert.equal(part.items[0].key, key);
    assert.equal(part.duration, key ? Math.max(300, Array.from(text).length * 90) : 400);
    assert.equal(tl.steps[0].parts[0].duration, 800);
  }
});
