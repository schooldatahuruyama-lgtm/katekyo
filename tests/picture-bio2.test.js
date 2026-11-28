// 中2生物の表を独立した期待値にし、全26通りと不正入力を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const boards = require('../js/boards.js');
const scene = require('../js/scene.js');
const picture = require('../js/picture.js');
const choices = {
  'bio-photosynthesis': { light: ['on', 'off'], part: ['green', 'white'] },
  'bio-digestion': { nutrient: ['starch', 'protein', 'fat'], stage: ['digest', 'absorb'] },
  'bio-circulation': { route: ['body', 'lung'], flow: ['out', 'back'] },
  'bio-reflex': { kind: ['reflex', 'conscious'], spot: ['skin', 'sensory', 'spinal', 'brain', 'motor', 'muscle'] },
};
function variants(id) {
  return Object.entries(choices[id]).reduce((all, [key, values]) => all.flatMap(o => values.map(value => ({ ...o, [key]: value }))), [{}])
    .map(options => ({ ...boards.get(id).scene, options }));
}
function inside(x, y) {
  assert.ok(Number.isFinite(x) && x >= 0 && x <= 600, String(x));
  assert.ok(Number.isFinite(y) && y >= 0 && y <= 420, String(y));
}
function check(current, expected, prompts) {
  const r = scene.trace(current), board = boards.get(current.kind);
  assert.deepEqual(boards.readout(current.kind, r.measures, current).map(row => row.text), expected);
  assert.deepEqual(board.prompts.map(p => boards.checkPrompt(p, r.measures, current)), prompts);
  return r;
}
for (const [id, count] of [['bio-photosynthesis', 4], ['bio-digestion', 6], ['bio-circulation', 4], ['bio-reflex', 12]]) {
  test(`${id}: 全${count}通りの画像・名前・輪は盤内、引き出し先は画像内で有限`, () => {
    const cases = variants(id); assert.equal(cases.length, count);
    for (const current of cases) for (const layout of [undefined, { compact: true, widthPx: 279 }]) {
      const before = structuredClone(current), r = scene.trace(current, layout), p = r.picture;
      assert.deepEqual(scene.validateScene(current), []); assert.equal(p.kind, id);
      assert.equal(p.images.length, 1); assert.ok(p.description.length);
      assert.deepEqual(p.images.map(({ x, y, width, height }) => ({ x, y, width, height })), [{ x: 20, y: 0, width: 560, height: 420 }]);
      for (const mark of r.marks) inside(mark.x, mark.y);
      for (const img of p.images) { inside(img.x, img.y); inside(img.x + img.width, img.y + img.height); }
      for (const ring of p.rings) { inside(ring.cx - ring.rx, ring.cy - ring.ry); inside(ring.cx + ring.rx, ring.cy + ring.ry); }
      for (const pin of p.pins) {
        inside(pin.from.x, pin.from.y); inside(pin.to.x, pin.to.y);
        const img = p.images[0]; assert.ok(pin.to.x >= img.x && pin.to.x <= img.x + img.width && pin.to.y >= img.y && pin.to.y <= img.y + img.height);
      }
      assert.equal(new Set(r.marks.map(m => m.key)).size, r.marks.length);
      assert.deepEqual(scene.handles(current), []); assert.deepEqual(current, before);
    }
  });
  test(`${id}: 不正値・型・欠落・部品不足・重複idを直さず理由を返す`, () => {
    const bad = [];
    for (const key of Object.keys(choices[id])) for (const value of ['unknown', 1, null, [], {}, true, undefined]) {
      const s = boards.get(id).scene; s.options[key] = value; bad.push(s);
    }
    for (const options of [undefined, null, [], 1, {}, 'invalid']) bad.push({ ...boards.get(id).scene, options });
    for (const elements of [[], null, {}, [null], [{ id: 'picture', type: 'picture' }, { id: 'picture', type: 'picture' }],
      [{ id: 'picture', type: 'source', x: 20, y: 20 }]]) bad.push({ ...boards.get(id).scene, elements });
    const missing = boards.get(id).scene; delete missing.options; bad.push(missing);
    const extra = boards.get(id).scene; extra.options.extra = true; bad.push(extra);
    for (const s of bad) {
      const before = structuredClone(s); let r;
      assert.doesNotThrow(() => { r = scene.trace(s); });
      assert.ok(scene.validateScene(s).length); assert.equal(r.picture, null);
      assert.match(r.notes.join(' '), /この図は表示できません/); assert.ok(r.notes.length > 1);
      assert.deepEqual(s, before);
      const b = boards.get(id); b.scene = s; assert.deepEqual(b.controls, []);
      assert.deepEqual(boards.readout(id, r.measures, s), []);
      assert.ok(b.prompts.every(p => !boards.checkPrompt(p, r.measures, s)));
    }
  });
}

test('光合成4通り: 光と葉緑体がそろうときだけデンプン、左右の輪と理由・表示・課題が一致', () => {
  const rows = [
    ['on', 'green', true, null, '緑色で光が当たった所', '', [[150, 255], [480, 255]], [false, false, false]],
    ['off', 'green', false, 'no-light', '緑色ではくの下', '光が当たらない', [[160, 175], [480, 180]], [true, false, false]],
    ['on', 'white', false, 'no-chloroplast', 'ふで光が当たった所', '葉緑体がない', [[62, 96], [360, 130]], [false, true, false]],
    ['off', 'white', false, 'both', 'ふではくの下', '光が当たらず、葉緑体もない', [[45, 175], [355, 185]], [false, false, true]],
  ];
  for (const [light, part, starch, reason, place, why, points, prompts] of rows) {
    const s = boards.get('bio-photosynthesis').scene; s.options = { light, part };
    const r = check(s, ['しらべた所 ' + place, 'ヨウ素液 ' + (starch ? '青紫色になる' : '色が変わらない'),
      'デンプン ' + (starch ? 'できている' : 'できていない（' + why + '）')], prompts);
    assert.deepEqual(r.measures, { light, part, starch, reason });
    assert.deepEqual(r.picture.rings.map(({ cx, cy, rx, ry, tone }) => ({ cx, cy, rx, ry, tone })),
      points.map(([x, y]) => ({ cx: 20 + x * .875, cy: y * .875, rx: 35, ry: 35, tone: starch ? 'green' : 'red' })));
    assert.ok(r.picture.images[0].src.endsWith('body-2-c2.jpg'));
    assert.equal(r.marks.find(m => m.key === 'result').text, starch ? '青紫色' : '変わらない');
  }
});

test('消化6通り: はたらく器官と胆汁の色、生成物と吸収先、表示・課題が表どおり', () => {
  const rows = [
    ['starch', 'デンプン', 'ブドウ糖', 'capillary', ['mouth', 'pancreas', 'small']],
    ['protein', 'タンパク質', 'アミノ酸', 'capillary', ['stomach', 'pancreas', 'small']],
    ['fat', '脂肪', '脂肪酸とモノグリセリド', 'lymph', ['pancreas']],
  ];
  for (const [nutrient, name, product, into, red] of rows) for (const stage of ['digest', 'absorb']) {
    const s = boards.get('bio-digestion').scene; s.options = { nutrient, stage };
    const r = check(s, ['栄養分 ' + name, 'できる物質 ' + product, '吸収される所 柔毛の' + (into === 'lymph' ? 'リンパ管' : '毛細血管')],
      [nutrient === 'protein' && stage === 'digest', nutrient === 'fat' && stage === 'digest', nutrient === 'fat' && stage === 'absorb']);
    assert.deepEqual(r.measures, { nutrient, stage, product, into });
    assert.deepEqual(r.picture.tags.filter(m => m.tone === 'red').map(m => m.key).sort(), (stage === 'digest' ? red : [into]).slice().sort());
    assert.deepEqual(r.picture.tags.filter(m => m.tone === 'orange').map(m => m.text), stage === 'digest' && nutrient === 'fat' ? ['肝臓（胆汁をつくる）', '胆のう（胆汁をためる）'] : []);
    assert.ok(r.picture.images[0].src.endsWith(stage === 'digest' ? 'digestion.svg' : 'villus.svg'));
    if (stage === 'digest') {
      const juices = { mouth: '口（だ液）', stomach: '胃（胃液）', pancreas: 'すい臓（すい液）', small: '小腸（かべの消化酵素）' };
      red.forEach(key => assert.equal(r.marks.find(m => m.key === key).text, juices[key]));
      assert.equal(r.marks.find(m => m.key === 'title').text, name + ' → ' + product);
    } else assert.equal(r.marks.find(m => m.key === 'title').text, nutrient === 'fat' ?
      '脂肪酸とモノグリセリドは、柔毛で再び脂肪になって、リンパ管に入る' : product + 'は、柔毛の毛細血管に入る');
  }
});

test('循環4通り: 肺動脈は静脈血、肺静脈は動脈血。部屋・血管・色・表示・課題が一致', () => {
  const rows = [
    ['body', 'out', 'lv', 'aorta', 'arterial', '体循環', '左心室 → 大動脈', '全身へ', [false, false, false]],
    ['body', 'back', 'ra', 'vena', 'venous', '体循環', '大静脈 → 右心房', '全身から', [false, false, true]],
    ['lung', 'out', 'rv', 'pa', 'venous', '肺循環', '右心室 → 肺動脈', '肺へ', [true, false, false]],
    ['lung', 'back', 'la', 'pv', 'arterial', '肺循環', '肺静脈 → 左心房', '肺から', [false, true, false]],
  ];
  for (const [route, flow, chamber, vessel, blood, name, path, direction, prompts] of rows) {
    const s = boards.get('bio-circulation').scene; s.options = { route, flow };
    const r = check(s, [name + ' ' + (flow === 'out' ? '心臓から出る' : '心臓にもどる'), '通る所 ' + path,
      '流れる血液 ' + (blood === 'arterial' ? '動脈血（酸素が多い）' : '静脈血（酸素が少ない）')], prompts);
    assert.deepEqual(r.measures, { route, flow, chamber, vessel, blood });
    const tone = blood === 'arterial' ? 'red' : 'blue';
    assert.deepEqual(r.picture.tags.filter(m => m.tone === tone).map(m => m.key).sort(), [chamber, vessel].sort());
    assert.ok(r.picture.tags.filter(m => ![chamber, vessel].includes(m.key)).every(m => m.tone === 'ink'));
    assert.ok(r.marks.find(m => m.key === vessel).text.endsWith('（' + direction + '）'));
    assert.equal(r.marks.find(m => m.key === 'title').text, name + ': ' + (flow === 'out' ? path + ' → ' + (route === 'body' ? '全身' : '肺') : (route === 'body' ? '全身' : '肺') + ' → ' + path));
  }
});

test('反応12通り: 5段階と7段階の順番、実効値・輪・表示・課題は一致し、保存値は変えない', () => {
  const names = { skin: '皮ふ', sensory: '感覚神経', spinal: 'せきずい', brain: '脳', motor: '運動神経', muscle: '筋肉' };
  const orders = { reflex: [1, 2, 3, 3, 4, 5], conscious: [1, 2, 3, 4, 6, 7] };
  for (const kind of ['reflex', 'conscious']) Object.keys(names).forEach((saved, i) => {
    const s = boards.get('bio-reflex').scene; s.options = { kind, spot: saved };
    const spot = kind === 'reflex' && saved === 'brain' ? 'spinal' : saved;
    const work = { skin: '刺激を受けとる', sensory: '信号を、せきずいへ伝える', spinal: kind === 'reflex' ? '命令を出す' : '信号を、脳へ伝える',
      brain: '判断して、命令を出す', motor: '命令を、筋肉へ伝える', muscle: 'ちぢんで、手を動かす' };
    const r = check(s, [kind === 'reflex' ? '反射' : '意識して起こる反応', 'えらんだ所 ' + names[spot] + '（' + orders[kind][i] + ' 番目）', 'はたらき ' + work[spot]],
      [kind === 'conscious', kind === 'conscious' && saved === 'brain', kind === 'reflex' && saved === 'spinal']);
    assert.deepEqual(r.measures, { kind, spot, order: orders[kind][i], steps: kind === 'reflex' ? 5 : 7 });
    assert.equal(s.options.spot, saved);
    assert.deepEqual(r.picture.tags.filter(m => m.tone === 'green').map(m => m.key), [spot]);
    assert.deepEqual(r.picture.rings.map(m => m.key), [spot]);
    assert.ok(r.picture.images[0].src.endsWith(kind + '.svg'));
  });
});

test('反射の脳はボタン単位で無効、押しても変わらず、意識する反応へ戻ると脳に復帰', () => {
  let s = boards.get('bio-reflex').scene;
  s = scene.setOption(scene.setOption(s, 'kind', 'conscious'), 'spot', 'brain');
  s = scene.setOption(s, 'kind', 'reflex');
  const control = picture.controls(s.kind, s.options).find(c => c.key === 'spot');
  assert.equal(control.enabled, true); assert.equal(control.choices.find(c => c.value === 'brain').enabled, false);
  assert.equal(control.reason, '反射では、命令はせきずいから出ます（脳で考える前に反応します）');
  assert.equal(scene.setOption(s, 'spot', 'brain'), s);
  assert.equal(scene.trace(s).measures.spot, 'spinal'); assert.equal(s.options.spot, 'brain');
  const p = boards.get(s.kind).prompts[2]; assert.equal(boards.checkPrompt(p, scene.trace(s).measures, s), false);
  assert.equal(boards.checkPrompt(p, scene.trace(s).measures), false);
  assert.equal(scene.trace(scene.setOption(s, 'kind', 'conscious')).measures.spot, 'brain');
  s = scene.setOption(s, 'spot', 'spinal'); assert.equal(boards.checkPrompt(p, scene.trace(s).measures, s), true);
});

test('12課題は初期配置で未達成、すべての課題に実際の切り替えで到達できる', () => {
  let count = 0;
  for (const id of Object.keys(choices)) {
    const board = boards.get(id), r = scene.trace(board.scene);
    for (const p of board.prompts) {
      count++; assert.equal(boards.checkPrompt(p, r.measures, board.scene), false);
      assert.ok(variants(id).some(target => {
        let s = board.scene;
        if (id === 'bio-reflex' && target.options.spot === 'brain') s = scene.setOption(s, 'kind', 'conscious');
        for (const [key, value] of Object.entries(target.options).reverse()) s = scene.setOption(s, key, value);
        return boards.checkPrompt(p, scene.trace(s).measures, s);
      }), p.id);
    }
  }
  assert.equal(count, 12);
});
