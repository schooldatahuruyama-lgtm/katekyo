// 分類表を独立した期待値と照らし合わせ、画像の全配置を調べる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const boards = require('../js/boards.js');
const scene = require('../js/scene.js');
const picture = require('../js/picture.js');
const config = require('../js/config.js');
const options = {
  'bio-flower': { figure: ['abrana-section', 'abrana-parts', 'matsu-branch', 'matsu-scale'], part: ['pistil', 'stamen', 'petal', 'sepal'] },
  'bio-plants': { reproduce: ['seed', 'spore'], ovule: ['in', 'naked'], cotyledon: ['two', 'one'], organs: ['yes', 'no'] },
  'bio-animals': { breath: ['gill', 'both', 'lung'], skin: ['scale', 'moist', 'feather', 'hair'], birth: ['egg-water', 'egg-land', 'live'] },
};
function variants(id) {
  return Object.entries(options[id]).reduce((all, [key, values]) => all.flatMap(o => values.map(value => ({ ...o, [key]: value }))), [{}])
    .map(options => ({ ...boards.get(id).scene, options }));
}
function inside(x, y) { assert.ok(Number.isFinite(x) && x >= 0 && x <= 600, String(x)); assert.ok(Number.isFinite(y) && y >= 0 && y <= 420, String(y)); }

test('compact は true のときだけ有効で、不正な引数では通常配置になる', () => {
  for (const id of Object.keys(options)) {
    const current = boards.get(id).scene, normal = scene.trace(current);
    for (const input of [undefined, null, 1, 'yes', { compact: 'yes' }, { compact: 1 }, { compact: null }]) {
      assert.deepEqual(scene.trace(current, input), normal);
    }
    assert.equal(scene.trace(current, { compact: true }).picture.compact, true);
    assert.deepEqual(normal.picture.below, []);
  }
  for (const board of boards.list().filter(b => b.unit !== 'bio1')) {
    const current = boards.get(board.id).scene;
    assert.deepEqual(scene.trace(current, { compact: true }), scene.trace(current));
  }
});

test('動物36通り: 下の文は通常配置と同じ文・順番・色、選択と判定は同じ', () => {
  for (const current of variants('bio-animals')) {
    const normal = scene.trace(current), compact = scene.trace(current, { compact: true });
    assert.deepEqual(compact.measures, normal.measures);
    assert.deepEqual(compact.picture.below, normal.picture.texts.filter(t => t.key !== 'title').map(({ key, text, tone }) => ({ key, text, tone })));
    assert.deepEqual(compact.picture.texts.map(t => t.key), ['title']);
    const img = compact.picture.images[0];
    assert.equal(img.y, 44); assert.equal(img.height, 376); assert.equal(img.width / img.height, 4 / 3);
    assert.equal(img.x + img.width / 2, 300);
    if (compact.measures.group === 'none') {
      assert.ok(compact.picture.below.every(t => t.tone !== 'green' && !t.text.startsWith('〇')));
    }
  }
});

test('植物: 3行のcaption・長い例・無効な理由は元の文で下に出し、画像は動かさない', () => {
  for (const current of variants('bio-plants')) {
    for (const widthPx of [200, 279, 335]) {
      const normal = scene.trace(current), narrow = scene.trace(current, { compact: true, widthPx });
      assert.deepEqual(narrow.picture.images, normal.picture.images);
      for (const row of narrow.picture.below) {
        if (row.key.startsWith('reason:')) {
          assert.ok(picture.controls(current.kind, current.options).some(c => c.reason === row.text));
        } else assert.equal(normal.marks.find(mark => mark.key === row.key).text, row.text);
      }
      assert.equal(new Set(narrow.picture.below.map(row => row.text)).size, narrow.picture.below.length);
    }
  }
  const current = boards.get('bio-plants').scene; current.options.ovule = 'naked';
  assert.ok(scene.trace(current, { compact: true, widthPx: 200 }).picture.below.some(row => row.key === 'caption:2'));
  assert.ok(scene.trace(current, { compact: true, widthPx: 279 }).picture.below.some(row => row.key.startsWith('reason:')));
});

for (const [id, count] of [['bio-flower', 16], ['bio-plants', 16], ['bio-animals', 36]]) {
  test(`${id}: 全${count}通りで画像・文字・輪・引き出し線が盤内、つまみなし`, () => {
    const cases = variants(id); assert.equal(cases.length, count);
    for (const current of cases) {
      assert.deepEqual(scene.validateScene(current), []);
      const r = scene.trace(current), p = r.picture;
      assert.equal(p.kind, id); assert.equal(r.sound, null); assert.equal(r.force, null); assert.deepEqual(scene.handles(current), []);
      assert.deepEqual(r.marks, [...p.tags, ...p.texts]);
      assert.equal(new Set(r.marks.map(m => m.key)).size, r.marks.length);
      p.images.forEach(i => { inside(i.x, i.y); inside(i.x + i.width, i.y + i.height); });
      r.marks.forEach(m => { inside(m.x, m.y); assert.ok(['ink', 'red', 'green', 'gray', 'orange'].includes(m.tone)); });
      p.rings.forEach(r => { inside(r.cx, r.cy); inside(r.cx - r.rx, r.cy - r.ry); inside(r.cx + r.rx, r.cy + r.ry); });
      p.pins.forEach(pin => {
        inside(pin.from.x, pin.from.y); inside(pin.to.x, pin.to.y);
        assert.ok(p.images.some(i => pin.to.x >= i.x && pin.to.x <= i.x + i.width && pin.to.y >= i.y && pin.to.y <= i.y + i.height));
        assert.ok(p.tags.some(t => t.key === pin.key));
      });
      assert.ok(boards.readout(id, r.measures, current).length >= 2);
    }
  });
  test(`${id}: 知らない値・options欠落・部品不正を補正せず理由を返す`, () => {
    const changes = [s => { delete s.options; }, s => { s.options = []; }, s => { s.options = 1; }, s => { s.options = null; },
      s => { s.options.unknown = 'x'; }, s => { s.elements = []; }, s => { s.elements.push({ ...s.elements[0] }); },
      s => { s.elements[0].type = 'unknown'; }, s => { s.elements[0].x = 20; }, s => { s.elements.push({ id: 'other', type: 'picture' }); }];
    for (const key of Object.keys(options[id])) for (const value of ['rose', 1, null, [], {}, NaN, Infinity, undefined]) changes.push(s => { s.options[key] = value; });
    changes.forEach(change => {
      const current = boards.get(id).scene; change(current); const before = structuredClone(current);
      const r = scene.trace(current);
      assert.equal(r.picture, null); assert.equal(r.notes[0], 'この図は表示できません'); assert.ok(r.notes.length > 1);
      assert.deepEqual(current, before); assert.deepEqual(boards.readout(id, r.measures, current), []);
      const b = boards.get(id); b.scene = current; assert.deepEqual(b.controls, []);
      assert.equal(scene.setOption(current, 'part', 'pistil'), current);
    });
  });
}

test('花: 全16通りの表示と課題、マツに花弁・がくなし、胚珠は2点を指す', () => {
  for (const current of variants('bio-flower')) {
    const { figure, part } = current.options, pine = figure.startsWith('matsu'), r = scene.trace(current);
    assert.deepEqual(r.measures, { figure, part, plant: pine ? 'matsu' : 'abrana', ovule: pine ? 'naked' : 'in-ovary' });
    const names = { pistil: pine ? '雌花' : 'めしべ', stamen: pine ? '雄花' : 'おしべ', petal: '花弁', sepal: 'がく' };
    const work = pine ? { pistil: 'りん片に胚珠がついている', stamen: 'りん片の花粉のうで花粉をつくる', petal: 'マツの花にはない', sepal: 'マツの花にはない' } :
      { pistil: 'はたらき 受粉すると、子房は果実に、胚珠は種子になる', stamen: 'はたらき やくの中で花粉をつくる', petal: 'はたらき めしべとおしべを守る', sepal: 'はたらき つぼみのとき、内側を守る' };
    assert.deepEqual(boards.readout('bio-flower', r.measures, current).map(r => r.text),
      ['えらんだ部分 ' + names[part], work[part], '胚珠 ' + (pine ? 'むき出し（子房がない）' : '子房の中にある')]);
    assert.deepEqual(boards.get('bio-flower').prompts.map(p => boards.checkPrompt(p, r.measures, current)),
      [part === 'stamen', figure === 'abrana-parts', figure === 'matsu-scale' && part === 'pistil']);
    if (pine && ['petal', 'sepal'].includes(part)) {
      assert.ok(r.picture.tags.every(t => t.tone !== 'red'));
      assert.ok(r.picture.texts.some(t => t.text === 'マツの花には、花弁やがくがありません'));
    }
    if (figure === 'matsu-scale') assert.equal(r.picture.pins.filter(p => p.key === 'ovule').length, 2);
    if (figure === 'abrana-parts') assert.equal(r.picture.pins.length, 0);
  }
});

test('植物: 関係のない特徴が違っても分類・図・値が一致し、課題も同じ', () => {
  const grouped = new Map();
  const expected = {
    dicot: ['なかま 被子植物の双子葉類', '葉脈 網状脈', '根 主根と側根'], monocot: ['なかま 被子植物の単子葉類', '葉脈 平行脈', '根 ひげ根'],
    gymnosperm: ['なかま 裸子植物', '胚珠 むき出し', 'ふえ方 種子'], fern: ['なかま シダ植物', 'ふえ方 胞子', '根・茎・葉の区別 ある'],
    moss: ['なかま コケ植物', 'ふえ方 胞子', '根・茎・葉の区別 ない'],
  };
  for (const current of variants('bio-plants')) {
    const o = current.options, group = o.reproduce === 'spore' ? o.organs === 'yes' ? 'fern' : 'moss' :
      o.ovule === 'naked' ? 'gymnosperm' : o.cotyledon === 'one' ? 'monocot' : 'dicot';
    const r = scene.trace(current), values = boards.readout('bio-plants', r.measures, current);
    assert.equal(r.measures.group, group); assert.deepEqual(values.map(r => r.text), expected[group]);
    if (grouped.has(group)) assert.deepEqual({ picture: r.picture, values }, grouped.get(group));
    grouped.set(group, { picture: r.picture, values });
    assert.deepEqual(boards.get('bio-plants').prompts.map(p => boards.checkPrompt(p, r.measures, current)),
      [group === 'monocot', group === 'gymnosperm', group === 'moss']);
    const b = boards.get('bio-plants'); b.scene = current;
    for (const control of b.controls) {
      const disabled = control.key === 'organs' ? o.reproduce === 'seed' : control.key === 'ovule' ? o.reproduce === 'spore' :
        control.key === 'cotyledon' ? o.reproduce === 'spore' || o.ovule === 'naked' : false;
      assert.equal(control.enabled, !disabled); assert.equal(!!control.reason, disabled);
      if (disabled) for (const c of control.choices) assert.equal(scene.setOption(current, control.key, c.value), current);
    }
  }
  assert.equal(grouped.size, 5);
});

test('植物: 胞子から種子へ戻すと、選んであった胚珠・子葉の値が残る', () => {
  let s = boards.get('bio-plants').scene;
  s = scene.setOption(s, 'cotyledon', 'one'); s = scene.setOption(s, 'ovule', 'naked');
  s = scene.setOption(s, 'reproduce', 'spore'); s = scene.setOption(s, 'organs', 'no');
  s = scene.setOption(s, 'reproduce', 'seed');
  assert.deepEqual(s.options, { reproduce: 'seed', ovule: 'naked', cotyledon: 'one', organs: 'no' });
  s = scene.setOption(s, 'ovule', 'in'); assert.equal(scene.trace(s).measures.group, 'monocot');
});

test('動物: 36通りのうち5通りだけが一致し、合う数・最も近いなかま・値・課題が表どおり', () => {
  const rows = [
    ['fish', '魚類', 'gill', 'scale', 'egg-water', 'メダカ・フナ'], ['amphibian', '両生類', 'both', 'moist', 'egg-water', 'カエル・イモリ'],
    ['reptile', 'は虫類', 'lung', 'scale', 'egg-land', 'トカゲ・ヘビ・カメ'], ['bird', '鳥類', 'lung', 'feather', 'egg-land', 'ハト・ペンギン'],
    ['mammal', '哺乳類', 'lung', 'hair', 'live', 'イヌ・クジラ'],
  ];
  const seen = [];
  for (const s of variants('bio-animals')) {
    const { breath, skin, birth } = s.options, r = scene.trace(s), m = r.measures;
    const counts = Object.fromEntries(rows.map(([key, , b, sk, bi]) => [key, Number(b === breath) + Number(sk === skin) + Number(bi === birth)]));
    assert.deepEqual(m.matches, counts); const best = Math.max(...Object.values(counts));
    assert.deepEqual(m.best, rows.filter(row => counts[row[0]] === best).map(row => row[0]));
    const matches = rows.filter(row => counts[row[0]] === 3); assert.ok(matches.length <= 1);
    const values = boards.readout(s.kind, m, s).map(r => r.text);
    if (matches.length) {
      const row = matches[0]; seen.push(row[0]); assert.equal(m.group, row[0]); assert.equal(r.picture.rings.length, 1);
      assert.deepEqual(values, ['あてはまるなかま ' + row[1], '合った特徴 3 つ', '例 ' + row[5]]);
    } else {
      assert.equal(m.group, 'none'); assert.equal(r.picture.rings.length, 0);
      assert.equal(r.picture.texts.find(t => t.key === 'title').text, 'あてはまるなかまがありません');
      assert.ok(r.picture.texts.filter(t => ['side-breath', 'side-skin', 'side-birth'].includes(t.key)).every(t => !t.text.startsWith('〇')));
      assert.deepEqual(values, ['あてはまるなかま なし', 'いちばん近いなかま ' + rows.filter(row => counts[row[0]] === best).map(row => row[1]).join('・') + '（' + best + ' つ合う）']);
    }
    assert.deepEqual(boards.get(s.kind).prompts.map(p => boards.checkPrompt(p, m, s)), ['bird', 'mammal', 'amphibian'].map(g => g === m.group));
  }
  assert.deepEqual(seen.sort(), rows.map(r => r[0]).sort());
  assert.equal(boards.readout('bio-animals', { group: 'none', matches: { fish: 0 }, best: ['fish'] })[1].text, 'いちばん近いなかま なし');
});

test('9つの課題は初期配置で未達成、操作で全て到達可能', () => {
  for (const id of Object.keys(options)) {
    const board = boards.get(id), initial = board.scene, queue = [initial], seen = new Set(), achieved = new Set();
    assert.ok(board.prompts.every(p => !boards.checkPrompt(p, scene.trace(initial).measures, initial)));
    while (queue.length) {
      const s = queue.shift(), key = JSON.stringify(s.options); if (seen.has(key)) continue; seen.add(key);
      board.prompts.forEach(p => { if (boards.checkPrompt(p, scene.trace(s).measures, s)) achieved.add(p.id); });
      for (const [key, values] of Object.entries(options[id])) values.forEach(value => queue.push(scene.setOption(s, key, value)));
    }
    assert.equal(achieved.size, 3);
    for (const value of ['rose', 1, [], null]) for (const key of Object.keys(options[id])) assert.equal(scene.setOption(initial, key, value), initial);
    assert.equal(scene.setOption(initial, 'unknown', 'x'), initial);
  }
});

test('配置設定は凍結、cropは指示書の数そのまま、画像モジュールの不正optionsは拒否', () => {
  assert.ok(Object.isFrozen(config.picture)); assert.ok(Object.isFrozen(config.picture.full));
  const s = boards.get('bio-plants').scene;
  for (const [cotyledon, crops] of [['two', [[20, 60, 300, 426], [30, 0, 280, 398], [40, 10, 250, 355]]],
    ['one', [[330, 60, 300, 426], [345, 0, 280, 398], [345, 10, 250, 355]]]]) {
    s.options.cotyledon = cotyledon;
    assert.deepEqual(scene.trace(s).picture.images.map(i => Object.values(i.crop)), crops);
  }
  assert.equal(picture.validOptions('unknown', {}), false); assert.deepEqual(picture.controls('bio-plants', null), []);
  for (const b of boards.list().filter(b => b.unit !== 'bio1')) assert.equal(scene.trace(boards.get(b.id).scene).picture, null);
});
