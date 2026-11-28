// 盤の文・課題・読み出しと、操作で課題を達成できることを確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const boards = require('../js/boards.js');
const scene = require('../js/scene.js');

test('力の盤の見出し・問いかけ・初期配置と数値の切り替え', () => {
  assert.deepEqual(boards.list().filter(b => b.unit === 'force').map(b => [b.title, b.question]), [
    ['ばねののび', 'おもりをふやすと、ばねはどれだけのびる？'], ['力の表し方', '力は、矢印でどう表す？'],
    ['力のつり合い', '2 つの力がつり合うのは、どんなとき？'],
  ]);
  assert.deepEqual(boards.get('force-spring').scene, { id: 'force-spring-basic', kind: 'force-spring', elements: [
    { id: 'stand', type: 'stand' }, { id: 'spring', type: 'spring' }, { id: 'weights', type: 'weights' },
  ], options: { weights: 3, spring: 'A' } });
  assert.deepEqual(boards.get('force-arrow').scene, { id: 'force-arrow-basic', kind: 'force-arrow', elements: [
    { id: 'box', type: 'box' }, { id: 'force', type: 'force', newtons: 3, direction: 'right' },
  ] });
  assert.deepEqual(boards.get('force-balance').scene, { id: 'force-balance-basic', kind: 'force-balance', elements: [
    { id: 'card', type: 'card' }, { id: 'left', type: 'pull', side: 'left', newtons: 3 },
    { id: 'right', type: 'pull', side: 'right', newtons: 3 },
  ], options: { line: 'same' } });
  assert.deepEqual(boards.get('force-spring').controls, [
    { key: 'weights', label: 'おもりの数', choices: [0, 1, 2, 3, 4, 5].map(value => ({ value, label: String(value) })) },
    { key: 'spring', label: 'ばね', choices: [{ value: 'A', label: 'ばね A' }, { value: 'B', label: 'ばね B' }] },
  ]);
  assert.deepEqual(boards.get('force-balance').controls, [{ key: 'line', label: '2 つの力', choices: [
    { value: 'same', label: '一直線上' }, { value: 'offset', label: 'ずれている' },
  ] }]);
  for (const [id, heading] of [['force-spring', '力の大きさとばねののびをしらべよう'],
    ['force-arrow', '力を矢印で表そう'], ['force-balance', '2 つの力がつり合う条件をさがそう']]) {
    assert.equal(boards.get(id).heading, heading);
    assert.ok(boards.get(id).intro.length);
  }
});

test('力の全 82 配置で読み出し・盤の文字・課題の結果が一致する', () => {
  function check(id, s, expected, achieved) {
    const board = boards.get(id), result = scene.trace(s);
    assert.deepEqual(boards.readout(id, result.measures, s).map(r => r.text), expected);
    assert.deepEqual(board.prompts.map(p => boards.checkPrompt(p, result.measures, s)), achieved);
    return result.force.labels;
  }
  for (const spring of ['A', 'B']) for (let weights = 0; weights <= 5; weights++) {
    const s = boards.get('force-spring').scene; s.options = { weights, spring };
    const n = weights ? (weights * .2).toFixed(1) : '0', cm = weights ? weights * (spring === 'A' ? 1 : 2) + '.0' : '0';
    const labels = check('force-spring', s, ['力の大きさ ' + n + ' N', 'ばねののび ' + cm + ' cm'],
      [weights === 5 && spring === 'A', spring === 'B', weights === 2 && spring === 'B']);
    assert.equal(labels.force.text, n + ' N');
  }
  for (const [direction, name] of Object.entries({ up: '上', down: '下', left: '左', right: '右' })) for (let newtons = 1; newtons <= 5; newtons++) {
    const s = boards.get('force-arrow').scene; Object.assign(s.elements[1], { direction, newtons });
    const labels = check('force-arrow', s, ['力の大きさ ' + newtons + ' N', '力の向き ' + name],
      [direction === 'right' && newtons === 5, direction === 'up' && newtons === 2, direction === 'left' && newtons === 4]);
    assert.equal(labels.magnitude.text, '力の大きさ ' + newtons + ' N');
  }
  for (const line of ['same', 'offset']) for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) {
    const s = boards.get('force-balance').scene; s.options.line = line;
    s.elements[1].newtons = left; s.elements[2].newtons = right;
    const state = line === 'offset' ? 'つり合わない（回って動く）' : left === right ? 'つり合っている' :
      left > right ? 'つり合わない（左へ動く）' : 'つり合わない（右へ動く）';
    const labels = check('force-balance', s, ['左の力 ' + left + ' N', '右の力 ' + right + ' N', state],
      [left === 5 && right === 5 && line === 'same', line === 'same' && right > left, line === 'offset' && left === right]);
    assert.equal(labels.state.text, state === 'つり合っている' ? state + '（動かない）' : state);
    assert.equal(labels.left.text, '左の力 ' + left + ' N'); assert.equal(labels.right.text, '右の力 ' + right + ' N');
  }
});

test('力の 9 課題は初期配置では未達成、切り替えとつまみで達成できる', () => {
  const solve = {
    'force-spring': [s => scene.setOption(s, 'weights', 5), s => scene.setOption(s, 'spring', 'B'),
      s => scene.setOption(scene.setOption(s, 'spring', 'B'), 'weights', 2)],
    'force-arrow': [{ x: 460, y: 210 }, { x: 300, y: 162 }, { x: 172, y: 210 }].map(p => s => scene.moveElement(s, 'force', 'tip', p)),
    'force-balance': [s => scene.moveElement(scene.moveElement(s, 'left', 'tip', { x: 90, y: 210 }), 'right', 'tip', { x: 510, y: 210 }),
      s => scene.moveElement(s, 'right', 'tip', { x: 478, y: 210 }), s => scene.setOption(s, 'line', 'offset')],
  };
  for (const [id, operations] of Object.entries(solve)) {
    const board = boards.get(id);
    board.prompts.forEach((p, i) => {
      assert.equal(boards.checkPrompt(p, scene.trace(board.scene).measures, board.scene), false);
      const solved = operations[i](board.scene);
      assert.deepEqual(scene.validateScene(solved), []);
      assert.equal(boards.checkPrompt(p, scene.trace(solved).measures, solved), true, p.text);
    });
  }
});

test('力の不正な値・切り替えでは読み出し・ボタン・課題を止める', () => {
  for (const id of ['force-spring', 'force-arrow', 'force-balance']) {
    const board = boards.get(id), measures = scene.trace(board.scene).measures;
    for (const value of ['3', 2.5, NaN, Infinity, null, [], -1, 6]) {
      board.scene = boards.get(id).scene;
      if (id === 'force-spring') board.scene.options.weights = value; else board.scene.elements[1].newtons = value;
      assert.deepEqual(boards.readout(id, measures, board.scene), []);
      assert.deepEqual(board.controls, []);
      assert.ok(board.prompts.every(p => !boards.checkPrompt(p, measures, board.scene)));
    }
  }
  for (const when of [{ all: [] }, { all: null }, { all: [null] }, { all: [{ measure: 'left', op: 'equal', other: 'right' }] }]) {
    assert.equal(boards.checkPrompt({ when }, {}), false);
  }
  const prompt = { when: { all: [{ measure: 'left', op: 'equal', other: 'right' }, { measure: 'line', op: 'is', value: 'offset' }] } };
  for (const value of [null, '3', NaN, Infinity, [], undefined]) assert.equal(boards.checkPrompt(prompt, { left: value, right: value, line: 'offset' }), false);
});

const solutions = {
  'sound-wave': [s => scene.moveElement(s, 'wave', 'amplitude', { x: 526, y: 50 }),
    s => scene.moveElement(s, 'wave', 'frequency', { x: 218, y: 210 }),
    s => scene.moveElement(s, 'wave', 'frequency', { x: 570, y: 210 })],
  'sound-string': [s => scene.moveElement(s, 'string', 'bridge', { x: 300, y: 90 }),
    s => scene.setOption(s, 'thickness', 'thick'),
    s => scene.moveElement(s, 'string', 'pluck', { x: 256, y: 42 })],
  'sound-speed': [s => scene.moveElement(s, 'listener', 'move', { x: 128, y: 330 }),
    s => scene.moveElement(s, 'listener', 'move', { x: 176, y: 330 }),
    s => scene.moveElement(s, 'listener', 'move', { x: 560, y: 330 })],
  straight: [s => scene.moveElement(s, 'blocker', 'move', { x: 200, y: 210 }),
    s => scene.moveElement(s, 'blocker', 'move', { x: 400, y: 210 })],
  reflect: [s => scene.moveElement(s, 'src', 'move', { x: 300 - 100 * Math.sqrt(3), y: 170 }),
    s => scene.moveElement(s, 'src', 'move', { x: 300, y: 60 })],
  'mirror-image': [s => scene.moveElement(s, 'object', 'move', { x: 260, y: 180 }),
    s => scene.moveElement(s, 'object', 'move', { x: 100, y: 180 })],
  refract: [s => scene.moveElement(scene.setOption(s, 'direction', 'medium-to-air'), 'src', 'move',
    { x: 300 - 100 * Math.sqrt(3), y: 310 }),
  s => scene.moveElement(s, 'src', 'move', { x: 300, y: 50 }),
  s => scene.setOption(s, 'medium', 'glass')],
  lens: [s => scene.moveElement(s, 'lens', 'focus', { x: 440, y: 210 }),
    s => scene.moveElement(s, 'src', 'move', { x: 60, y: 110 })],
  'lens-image': [s => scene.moveElement(s, 'object', 'move', { x: 250, y: 210 }),
    s => scene.moveElement(s, 'object', 'move', { x: 150, y: 210 }),
    s => scene.moveElement(s, 'screen', 'move', { x: 500, y: 210 })],
};

test('6 種類が指定の順序・名前・問いかけでそろう', () => {
  const all = boards.list().filter(board => board.unit === 'light');
  assert.deepEqual(all.map(b => b.id), scene.KINDS.slice(0, 6));
  assert.deepEqual(all.map(b => b.title), ['直進', '反射', '鏡の像', '屈折・全反射', '凸レンズ', '実像と虚像']);
  assert.deepEqual(all.map(b => b.question), [
    '光はどう進む？ 影はなぜできる？', '鏡ではね返る光のきまりは？',
    '鏡の奥に見えるものは、どこにある？', '水に入ると、光はなぜ曲がる？ 出られなくなるのはいつ？',
    '虫めがねは、なぜ光を集める？', 'スクリーンに映る像と、映らない像のちがいは？',
  ]);
});

test('単元の順・盤の重複・空の単元・list との一致と独立した写し', () => {
  const units = boards.units(), all = boards.list();
  assert.deepEqual(units.map(u => u.id), ['light', 'sound', 'force', 'bio1', 'bio2']);
  assert.deepEqual(units.map(u => u.title), ['中 1 光の世界', '中 1 音の世界', '中 1 力の世界', '中 1 生物の観察と分類', '中 2 生物の体のつくりとはたらき']);
  assert.ok(units.every(u => u.teacher === 'E' && !Object.hasOwn(u, 'voice') && u.boards.length > 0));
  assert.equal(new Set(all.map(b => b.id)).size, all.length);
  assert.deepEqual(all.map(b => b.id), scene.KINDS);
  assert.deepEqual(units.flatMap(u => u.boards.map(b => ({ ...b, unit: u.id }))), all);
  units[0].boards[0].title = '変更'; units[1].boards.pop();
  assert.equal(boards.units()[0].boards[0].title, '直進');
  assert.equal(boards.units()[1].boards.length, 3);

  // 定義に空の単元があっても返さない。公開する API は増やさない。
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'boards.js'), 'utf8');
  const context = { Hikari: { config: require('../js/config.js'), scene } };
  vm.runInNewContext(source.replace('const UNITS = [', "const UNITS = [{ id: 'empty', title: 'empty', teacher: 'E', boards: [] },"), context);
  assert.ok(context.Hikari.boards.units().every(u => u.id !== 'empty'));
  vm.runInNewContext(source.replace('const api = { units,', 'const api = { data, UNITS, units,'), context);
  const definitions = context.Hikari.boards.data.map(b => b.id);
  assert.equal(new Set(definitions).size, definitions.length);
  assert.deepEqual(Array.from(definitions), all.map(b => b.id));
  for (const unit of context.Hikari.boards.UNITS) assert.ok(unit.boards.length > 0);
});

test('音の盤の見出し・問いかけ・切り替え・初期値', () => {
  assert.deepEqual(boards.list().filter(b => b.unit === 'sound').map(b => [b.title, b.question]), [
    ['音の大きさと高さ', '大きい音と高い音は、波の形のどこがちがう？'],
    ['弦の音', '弦をどうすると、音は高くなる？'], ['音の速さ', '花火は、なぜ光ってから音が聞こえる？'],
  ]);
  const board = boards.get('sound-string'), C = require('../js/config.js').sound;
  assert.deepEqual(board.scene.options, C.string.initial);
  assert.equal(board.scene.elements[0].lengthPercent, C.string.length.initial);
  assert.equal(board.scene.elements[0].pluck, C.string.pluck.initial);
  assert.deepEqual(board.controls.map(c => [c.key, c.label, c.choices.map(v => v.label)]), [
    ['thickness', '弦の太さ', ['細い', '太い']], ['tension', '弦の張り', ['弱い', '強い']],
  ]);
  for (const options of [undefined, null, [], {}, { thickness: 'bad', tension: 'weak' }]) {
    board.scene.options = options; assert.deepEqual(board.controls, []);
    assert.deepEqual(boards.readout(board.id, { pitch: 'higher' }, board.scene), []);
    assert.equal(boards.checkPrompt(board.prompts[0], { pitch: 'higher' }, board.scene), false);
  }
});

test('音の全操作値で、読み出しと課題の判定が一致する', () => {
  function check(id, current, expected, achieved) {
    const board = boards.get(id), result = scene.trace(current);
    assert.deepEqual(boards.readout(id, result.measures, current).map(line => line.text), expected);
    assert.deepEqual(board.prompts.map(p => p.when.op), ['is', 'is', 'is']);
    assert.deepEqual(board.prompts.map(p => boards.checkPrompt(p, result.measures, current)), achieved);
  }
  for (let hz = 100; hz <= 1000; hz += 50) for (let amp = 1; amp <= 4; amp++) {
    const s = boards.get('sound-wave').scene; Object.assign(s.elements[1], { frequencyHz: hz, amplitude: amp });
    check('sound-wave', s, ['振動数 ' + hz + ' Hz', '振幅 目もり ' + amp + ' つ分'], [amp === 4, hz === 500, hz === 100]);
  }
  for (const thickness of ['thin', 'thick']) for (const tension of ['weak', 'strong']) {
    for (let length = 50; length <= 100; length += 5) for (let pluck = 1; pluck <= 4; pluck++) {
      const s = boards.get('sound-string').scene;
      s.options = { thickness, tension }; Object.assign(s.elements[0], { lengthPercent: length, pluck });
      const frequency = 200 * 100 / length * Math.sqrt(tension === 'strong' ? 2 : 1) / (thickness === 'thick' ? 2 : 1);
      check('sound-string', s, ['音の高さ ' + (frequency === 250 ? 'はじめと同じ' : frequency > 250 ? 'はじめより高い' : 'はじめより低い'),
        '音の大きさ ' + (pluck === 2 ? 'はじめと同じ' : pluck > 2 ? 'はじめより大きい' : 'はじめより小さい')],
      [frequency > 250, thickness === 'thick', pluck > 2]);
    }
  }
  for (let distance = 170; distance <= 1700; distance += 34) {
    const s = boards.get('sound-speed').scene; s.elements[1].distance = distance;
    const time = (distance / 34 / 10).toFixed(1);
    check('sound-speed', s, ['花火まで ' + distance + ' m', '聞こえるまで ' + time + ' 秒', '音の速さ 約 340 m/s'],
      [distance === 170, distance === 340, distance === 1700]);
    const labels = scene.trace(s).sound.labels;
    assert.equal(labels.distance.text, distance + ' m'); assert.equal(labels.time.text, time + ' 秒後に聞こえる');
  }
});

for (const id of Object.keys(solutions)) {
  test(`${id}: 案内・初期配置・課題と、その達成操作`, () => {
    const board = boards.get(id);
    assert.ok(board.heading && board.intro);
    assert.deepEqual(scene.validateScene(board.scene), []);
    assert.ok(board.prompts.length >= 2 && board.prompts.length <= 3);
    assert.equal(new Set(board.prompts.map(p => p.id)).size, board.prompts.length);
    const initial = scene.trace(board.scene).measures;
    board.prompts.forEach((prompt, i) => {
      assert.ok(Object.hasOwn(initial, prompt.when.measure));
      assert.equal(boards.checkPrompt(prompt, initial), false, prompt.text);
      const solved = solutions[id][i](board.scene);
      assert.deepEqual(scene.validateScene(solved), []);
      assert.equal(boards.checkPrompt(prompt, scene.trace(solved).measures), true, prompt.text);
    });
    const lines = boards.readout(id, initial, board.scene);
    assert.ok(lines.length > 0);
    for (const line of lines) {
      assert.equal(typeof line.text, 'string');
      assert.ok(['in', 'out', 'plain'].includes(line.tone));
      assert.doesNotMatch(line.text, /NaN|undefined|Infinity|null/);
    }
  });
}

for (const tolerance of [2, 6]) {
  test(`課題の許容 ±${tolerance} ちょうどとその外`, () => {
    const prompt = { when: { measure: 'value', op: 'near', value: 60, tol: tolerance } };
    for (const delta of [-tolerance, tolerance]) {
      assert.equal(boards.checkPrompt(prompt, { value: 60 + delta }), true);
    }
    for (const delta of [-tolerance - 0.01, tolerance + 0.01]) {
      assert.equal(boards.checkPrompt(prompt, { value: 60 + delta }), false);
    }
    for (const value of [null, undefined, '60', NaN, Infinity, true, []]) {
      assert.equal(boards.checkPrompt(prompt, { value }), false);
    }
  });
}

test('課題の gte・lte・is と未計測の値', () => {
  for (const op of ['gte', 'lte']) {
    const prompt = { when: { measure: 'v', op, value: 100 } };
    assert.equal(boards.checkPrompt(prompt, { v: 100 }), true);
    assert.equal(boards.checkPrompt(prompt, { v: null }), false);
    assert.equal(boards.checkPrompt(prompt, { v: '100' }), false);
    assert.equal(boards.checkPrompt(prompt, { v: op === 'gte' ? 99.99 : 100.01 }), false);
  }
  for (const value of [true, 'virtual', 100]) {
    const prompt = { when: { measure: 'v', op: 'is', value } };
    assert.equal(boards.checkPrompt(prompt, { v: value }), true);
    assert.equal(boards.checkPrompt(prompt, { v: null }), false);
    assert.equal(boards.checkPrompt(prompt, {}), false);
  }
  assert.equal(boards.checkPrompt(null, {}), false);
  assert.equal(boards.checkPrompt({ when: { measure: 'x', op: 'nope' } }, {}), false);
});

test('不正なシーンでは読み出し・切り替え・課題判定を返さず、例外も投げない', () => {
  for (const { id } of boards.list()) {
    const board = boards.get(id), measures = scene.trace(board.scene).measures;
    const malformed = [null, [], {}, 'x', ...[{}, [null], [], null, 'x'].map(elements => ({ ...board.scene, elements }))];
    if (id === 'refract') malformed.push(...[null, 'x'].map(options => ({ ...board.scene, options })));
    const prompt = { when: { measure: 'valid', op: 'is', value: true } };
    for (const current of malformed) {
      board.scene = current;
      assert.deepEqual(boards.readout(id, measures, current), []);
      assert.deepEqual(board.controls, []);
      assert.equal(boards.checkPrompt(prompt, { valid: true }, current), false);
    }
  }
});

test('不正な measures は読み出しと課題判定に使わない', () => {
  const prompt = { when: { measure: 'length', op: 'is', value: 1 } };
  for (const measures of [null, undefined, [], ['x'], 'x', 1, true]) {
    assert.equal(boards.checkPrompt(prompt, measures), false);
    for (const { id } of boards.list()) assert.deepEqual(boards.readout(id, measures, boards.get(id).scene), []);
  }
  for (const prompt of [null, [], 'x', {}, { when: [] }, { when: null }, { when: { measure: {} } }]) {
    assert.equal(boards.checkPrompt(prompt, {}), false);
  }
});

test('get と list の内容は独立した写し', () => {
  const expected = boards.get('reflect');
  const changed = boards.get('reflect');
  changed.scene.elements[0].x = 999;
  changed.prompts[0].when.value = -1;
  changed.intro = '変更';
  assert.deepEqual(boards.get('reflect'), expected);
  boards.list()[0].title = '変更';
  assert.equal(boards.list()[0].title, '直進');
  assert.equal(boards.get('nope'), null);
});

test('屈折の切り替えは水・ガラスに合わせたラベルになる', () => {
  const board = boards.get('refract');
  assert.deepEqual(board.controls.map(c => c.key), ['direction', 'medium']);
  assert.deepEqual(board.controls[0].choices.map(c => c.label), ['空気 → 水', '水 → 空気']);
  assert.deepEqual(board.controls[1].choices.map(c => c.label), ['水', 'ガラス']);
  board.scene = scene.setOption(board.scene, 'medium', 'glass');
  assert.deepEqual(board.controls[0].choices.map(c => c.label), ['空気 → ガラス', 'ガラス → 空気']);
  assert.deepEqual(boards.get('refract').controls[0].choices.map(c => c.label), ['空気 → 水', '水 → 空気']);
  for (const id of scene.KINDS.filter(id => !['refract', 'sound-string', 'force-spring', 'force-balance', 'bio-flower', 'bio-plants', 'bio-animals', 'bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex'].includes(id))) assert.deepEqual(boards.get(id).controls, []);
});

test('表示だけで角度を四捨五入する', () => {
  assert.deepEqual(boards.readout('reflect', { incidenceDeg: 40.49, reflectionDeg: 40.5, mirrorTiltDeg: 0 }).slice(0, 2), [
    { text: '入射角 40°', tone: 'in' }, { text: '反射角 41°', tone: 'out' },
  ]);
  const total = boards.readout('refract', { incidenceDeg: 60, refractionDeg: null,
    totalReflection: true, direction: 'medium-to-air', medium: 'glass' });
  assert.ok(total.some(r => r.text === '全反射'));
  assert.ok(total.some(r => r.text === 'ガラス → 空気'));
  assert.ok(total.every(r => !r.text.includes('null')));
  assert.deepEqual(boards.readout('nope', {}), []);
});

test('直進の読み出しは現在のついたてに対する倍率を小数 1 けたで出す', () => {
  const board = boards.get('straight');
  assert.deepEqual(boards.readout(board.id, scene.trace(board.scene).measures, board.scene), [
    { text: '影の大きさ ついたての 2.4 倍', tone: 'plain' },
  ]);
  board.scene.elements.find(e => e.type === 'blocker').height = 50;
  assert.deepEqual(boards.readout(board.id, { shadowSize: 130 }, board.scene), [
    { text: '影の大きさ ついたての 2.6 倍', tone: 'plain' },
  ]);
});

test('反射の傾きは正負とも絶対値で、0 度も出す', () => {
  for (const tilt of [-21, 21, 0]) {
    assert.deepEqual(boards.readout('reflect', { incidenceDeg: 37, reflectionDeg: 37, mirrorTiltDeg: tilt }), [
      { text: '入射角 37°', tone: 'in' }, { text: '反射角 37°', tone: 'out' },
      { text: '鏡の傾き ' + Math.abs(tilt) + '°', tone: 'plain' },
    ]);
  }
});

test('鏡の像と凸レンズの読み出しには座標の数を出さない', () => {
  assert.deepEqual(boards.readout('mirror-image', { objectDistance: 200, imageDistance: 200 }), [
    { text: '物体から鏡まで ＝ 鏡から像まで', tone: 'plain' },
    { text: '像は鏡の奥、物体と同じ距離の所にあります', tone: 'plain' },
  ]);
  assert.deepEqual(boards.readout('lens', { focalLength: 100, beamOffset: 60 }), [
    { text: '焦点は、レンズの中心から左右に同じ距離の所にあります', tone: 'plain' },
  ]);
});

test('屈折の角度・全反射・物質の読み出しを保つ', () => {
  assert.deepEqual(boards.readout('refract', { incidenceDeg: 41, refractionDeg: 29,
    totalReflection: false, direction: 'air-to-medium', medium: 'water' }), [
    { text: '入射角 41°', tone: 'in' }, { text: '屈折角 29°', tone: 'out' },
    { text: '空気 → 水', tone: 'plain' },
  ]);
  assert.deepEqual(boards.readout('refract', { incidenceDeg: 60, refractionDeg: null,
    totalReflection: true, direction: 'medium-to-air', medium: 'glass' }), [
    { text: '入射角 60°', tone: 'in' }, { text: '全反射', tone: 'out' },
    { text: 'ガラス → 空気', tone: 'plain' },
  ]);
});

test('実像は位置と大きさを倍率で出し、スクリーンの合焦を知らせる', () => {
  const board = boards.get('lens-image');
  for (const sharp of [false, true]) {
    const current = sharp ? scene.moveElement(board.scene, 'screen', 'move', { x: 500, y: 210 }) : board.scene;
    assert.deepEqual(boards.readout(board.id, scene.trace(current).measures, current), [
      { text: '物体の位置 焦点距離の 2.0 倍', tone: 'plain' },
      { text: '実像（上下が逆）', tone: 'plain' },
      { text: '像の大きさ 物体の 1.0 倍', tone: 'plain' },
      { text: sharp ? 'スクリーンにはっきり映っています ✓' : 'スクリーンを像の所へ動かそう', tone: 'plain' },
    ]);
  }
});

test('虚像と像なしではスクリーンを動かす文を出さない', () => {
  const board = boards.get('lens-image');
  const virtual = scene.moveElement(board.scene, 'object', 'move', { x: 250, y: 210 });
  assert.deepEqual(boards.readout(board.id, scene.trace(virtual).measures, virtual), [
    { text: '物体の位置 焦点距離の 0.5 倍', tone: 'plain' },
    { text: '虚像（スクリーンには映りません）', tone: 'plain' },
    { text: '像の大きさ 物体の 2.0 倍', tone: 'plain' },
  ]);
  const none = scene.moveElement(board.scene, 'object', 'move', { x: 200, y: 210 });
  assert.deepEqual(boards.readout(board.id, scene.trace(none).measures, none), [
    { text: '物体の位置 焦点距離の 1.0 倍', tone: 'plain' }, { text: '像はできません', tone: 'plain' },
  ]);
});

test('高さ・焦点距離が 0 や未計測なら割り算の項目を出さない', () => {
  for (const value of [0, null, undefined, NaN, Infinity, '100']) {
    const straight = boards.get('straight'), lens = boards.get('lens-image');
    straight.scene.elements.find(e => e.type === 'blocker').height = value;
    lens.scene.elements.find(e => e.type === 'lens').focalLength = value;
    assert.deepEqual(boards.readout('straight', { shadowSize: 141 }, straight.scene), []);
    assert.deepEqual(boards.readout('lens-image', { objectDistance: 200 }, lens.scene), []);
  }
  for (const id of scene.KINDS) assert.deepEqual(boards.readout(id, null, boards.get(id).scene), []);
  for (const value of [null, undefined, NaN, Infinity, '200']) {
    assert.deepEqual(boards.readout('straight', { shadowSize: value }, boards.get('straight').scene), []);
    assert.deepEqual(boards.readout('reflect', { incidenceDeg: value, reflectionDeg: value, mirrorTiltDeg: value }), []);
    assert.deepEqual(boards.readout('lens-image', { objectDistance: value, magnification: value, imageKind: 'real',
      screenSharp: null }, boards.get('lens-image').scene), [{ text: '実像（上下が逆）', tone: 'plain' }]);
  }
  assert.deepEqual(boards.readout('straight', { shadowSize: 141 }), []);
  assert.deepEqual(boards.readout('lens-image', { objectDistance: 200 }), []);
});

test('像の倍率が 50 倍以上なら上限の文を出す', () => {
  for (const magnification of [49.9, 50, 50.1, 1000]) {
    const lines = boards.readout('lens-image', { imageKind: 'real', magnification });
    assert.equal(lines[1].text, magnification >= 50 ? '像の大きさ 物体の 50 倍以上' : '像の大きさ 物体の 49.9 倍');
  }
  const current = scene.moveElement(boards.get('lens-image').scene, 'object', 'move', { x: 198.5, y: 210 });
  assert.ok(boards.readout('lens-image', scene.trace(current).measures, current)
    .some(line => line.text === '像の大きさ 物体の 50 倍以上'));
});

test('DOM なしのブラウザ名前空間でも Node と同じ結果を返す', () => {
  const context = vm.createContext({ URLSearchParams });
  for (const file of ['config', 'geometry', 'optics', 'sound', 'force', 'picture', 'scene', 'boards', 'entry']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), context);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(context.Hikari.boards.list())), boards.list());
  for (const id of scene.KINDS) {
    const actual = context.Hikari.scene.trace(context.Hikari.boards.get(id).scene);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(scene.trace(boards.get(id).scene))));
  }
});
