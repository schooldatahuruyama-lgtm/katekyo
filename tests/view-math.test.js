// 画面の幅に応じた読みやすさと、指の座標の変換を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../js/view-math.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const boards = require('../js/boards.js');
const scene = require('../js/scene.js');
const boardView = require('../js/board-view.js');

function bioVariants(id) {
  const board = boards.get(id);
  return board.controls.reduce((all, c) => all.flatMap(o => c.choices.map(v => ({ ...o, [c.key]: v.value }))), [{}])
    .map(options => ({ ...boards.get(id).scene, options }));
}

test('中2生物: 反射の脳は理由つきで無効、保存値と実効値を区別し、課題は実際の選択で達成', () => {
  const ui = openBio('bio-reflex', 375);
  pressBio(ui, 'kind', 'conscious'); pressBio(ui, 'spot', 'brain'); pressBio(ui, 'kind', 'reflex');
  const group = ui.find(el => el.className === 'seg' && el.attributes['aria-label'] === 'たどる所');
  const brain = group.children.find(el => el.tagName === 'button' && el.textContent === '脳');
  const spinal = group.children.find(el => el.tagName === 'button' && el.textContent === '✓ せきずい');
  const reason = group.children.find(el => el.className === 'seg-reason');
  assert.equal(brain.disabled, true); assert.equal(spinal.disabled, false);
  assert.equal(reason.hidden, false); assert.equal(brain.attributes['aria-describedby'], reason.id);
  assert.equal(reason.textContent, '反射では、命令はせきずいから出ます（脳で考える前に反応します）');
  assert.equal(ui.current().options.spot, 'brain');
  assert.equal(scene.trace(ui.current()).measures.spot, 'spinal');
  const before = bioSnapshot(ui); brain.dispatch('click'); assert.deepEqual(bioSnapshot(ui), before);
  const achieved = () => elements(ui, el => el.className.split(' ').includes('done')).map(el => el.textContent);
  const task = boards.get('bio-reflex').prompts[2].text;
  assert.ok(!achieved().some(text => text.includes(task)));
  pressBio(ui, 'kind', 'conscious'); assert.equal(scene.trace(ui.current()).measures.spot, 'brain');
  assert.equal(brain.disabled, false); assert.equal(brain.attributes['aria-pressed'], 'true');
  assert.equal(reason.hidden, true);
  pressBio(ui, 'kind', 'reflex'); pressBio(ui, 'spot', 'spinal');
  assert.ok(achieved().some(text => text.includes(task)));
});

test('中2生物: 375pxで4盤のボタンとホームの見出しを折り返せる、反応は8個・高さ44px以上', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8');
  assert.match(css, /\.seg\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.seg button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.seg button\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere/);
  const home = screen('', 375); home.api.app.start(home.host);
  const heading = home.find(el => el.tagName === 'h2' && el.textContent.startsWith('中 2'));
  assert.equal(heading.textContent, boards.units().find(u => u.id === 'bio2').title + ' ― ボードをえらぶ');
  assert.equal(heading.parent.className, 'list');
  assert.doesNotMatch(css.match(/\.list h2\s*\{[^}]*\}/)[0], /nowrap|width:\s*\d+px/);
  for (const { id } of boards.units().find(u => u.id === 'bio2').boards) {
    const ui = openBio(id, 375), board = boards.get(id);
    const buttons = elements(ui, el => el.className === 'seg').flatMap(group => group.children.filter(el => el.tagName === 'button'));
    assert.equal(buttons.length, id === 'bio-reflex' ? 8 : board.controls.reduce((sum, c) => sum + c.choices.length, 0));
    assert.ok(buttons.every(el => el.textContent.length > 0)); checkBioPicture(ui);
  }
});

test('中2生物: 説明の最後から2つ目の手で盤の下の値を出しはじめる', () => {
  for (const { id } of boards.units().find(u => u.id === 'bio2').boards) {
    const ui = screen('?board=' + id, 375); startLesson(ui);
    const steps = require('../content/scripts-bio2.js').BOARDS[id];
    for (let i = 0; i < steps.length; i++) {
      assert.equal(ui.find(el => el.className === 'readout').hidden, i < steps.length - 2);
      if (i < steps.length - 1) { ui.button('次へ').dispatch('click'); ui.button('次へ').dispatch('click'); }
    }
  }
});

test('動物: appのクリックで魚類から鳥類にすると合う特徴の数も鳥類になる', () => {
  const ui = screen('?board=bio-animals', 375);
  ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
  for (const label of ['肺', '羽毛', '卵生（殻あり）']) {
    elements(ui, el => el.tagName === 'button' && el.textContent.replace(/^✓ /, '') === label)[0].dispatch('click');
  }
  assert.equal(ui.find(el => (el.attributes['data-picture-text'] || el.attributes['data-picture-below']) === 'count-match').textContent, '鳥類 3 つ（ぜんぶ）');
});

function openBio(id, width = 375, initial = null) {
  let current;
  const ui = screen('?board=' + id, width, {
    boards: { ...boards, get(key) {
      const board = boards.get(key);
      if (key === id && initial) board.scene = structuredClone(initial);
      return board;
    } },
    scene: { ...scene, trace(value, layout) { current = value; return scene.trace(value, layout); } },
  });
  ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
  ui.current = () => current;
  return ui;
}

function bioResult(ui, current = ui.current()) {
  const width = ui.find(el => el.attributes.class === 'board-svg').getBoundingClientRect().width;
  const layout = { compact: width < 420, widthPx: width }, result = scene.trace(current, layout);
  const data = boardView.labelData({ scene: current }, result, view.sizes(width));
  const places = view.placeLabels(data.labels, data.obstacles, view.sizes(width), []);
  layout.belowKeys = places.flatMap((p, i) => p.hidden ? [data.labels[i].id.slice(5)] : []);
  return layout.belowKeys.length ? scene.trace(current, layout) : result;
}

function isBioBelow(picture, key) { return picture.below.some(row => row.key === key || row.keys?.includes(key)); }

function checkBioPicture(ui) {
  const r = bioResult(ui), p = r.picture;
  const colors = require('../js/config.js').colors;
  const color = tone => colors[{ ink: 'text', red: 'redPen', green: 'green', gray: 'normal', orange: 'ray', blue: 'bluePen' }[tone]];
  const texts = elements(ui, el => el.attributes['data-picture-text']);
  const marks = r.marks.filter(mark => !isBioBelow(p, mark.key));
  assert.deepEqual(texts.map(el => el.textContent), marks.map(mark => mark.text));
  assert.deepEqual(elements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent), p.below.map(row => row.text));
  assert.deepEqual(texts.map(el => el.attributes.fill), marks.map(mark => color(mark.tone)));
  for (const [kind, items] of [['tag', p.tags], ['pin', p.pins], ['ring', p.rings], ['image', p.images]]) {
    assert.deepEqual(elements(ui, el => el.attributes['data-picture-' + kind]).map(el => el.attributes['data-picture-' + kind]), items.map(item => item.key));
  }
  assert.deepEqual(elements(ui, el => el.tagName === 'image').map(el => el.attributes.href), p.images.map(img => img.src));
  assert.deepEqual(elements(ui, el => el.attributes['data-picture-ring']).map(el =>
    ['cx', 'cy', 'rx', 'ry'].map(key => Number(el.attributes[key]))), p.rings.map(ring => [ring.cx, ring.cy, ring.rx, ring.ry]));
  assert.equal(ui.find(el => el.className === 'readout').textContent,
    boards.readout(ui.current().kind, r.measures, ui.current()).map(item => item.text).join(''));
}

function pressBio(ui, key, value) {
  const board = boards.get(ui.current().kind); board.scene = ui.current();
  const control = board.controls.find(c => c.key === key), choice = control.choices.find(c => c.value === value);
  const group = ui.find(el => el.className === 'seg' && el.attributes['aria-label'] === control.label);
  const button = group.children.find(el => el.tagName === 'button' && el.textContent.replace(/^✓ /, '') === choice.label);
  assert.equal(button.disabled, false, control.label + ': ' + choice.label);
  button.dispatch('click');
  assert.equal(ui.current().options[key], value);
  assert.equal(button.attributes['aria-pressed'], 'true');
  checkBioPicture(ui);
}

function selectBio(ui, options) {
  const set = (key, value) => { if (ui.current().options[key] !== value) pressBio(ui, key, value); };
  if (ui.current().kind === 'bio-plants') {
    // 無効なボタンを押さず、別の分類でも保存される選択値を有効な配置で変える。
    if (ui.current().options.organs !== options.organs) { set('reproduce', 'spore'); set('organs', options.organs); }
    if (ui.current().options.cotyledon !== options.cotyledon) {
      set('reproduce', 'seed'); set('ovule', 'in'); set('cotyledon', options.cotyledon);
    }
    if (ui.current().options.ovule !== options.ovule) { set('reproduce', 'seed'); set('ovule', options.ovule); }
    set('reproduce', options.reproduce);
  } else if (ui.current().kind === 'bio-reflex') {
    if (options.spot === 'brain') set('kind', 'conscious');
    set('spot', options.spot); set('kind', options.kind);
  } else Object.entries(options).forEach(([key, value]) => set(key, value));
  assert.deepEqual(ui.current().options, options);
}

function bioSnapshot(ui) {
  const snapshot = el => ({ tag: el.tagName, attrs: { ...el.attributes }, text: el.textContent, children: el.children.map(snapshot) });
  return elements(ui, el => el.tagName === 'text' || el.attributes['data-picture-below'] || ['image', 'tag', 'pin', 'ring'].some(kind => el.attributes['data-picture-' + kind])).map(snapshot);
}

test('419pxは下の説明、420pxは盤内の説明。700→300→700でも選択と達成を保つ', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8'), /\.picture-below\s*\{[^}]*font-size:\s*16px/);
  const ui = openBio('bio-animals', 700);
  pressBio(ui, 'breath', 'lung'); pressBio(ui, 'skin', 'feather'); pressBio(ui, 'birth', 'egg-land');
  const initial = bioSnapshot(ui), options = structuredClone(ui.current().options);
  const completed = () => elements(ui, el => el.className.split(' ').includes('done')).map(el => el.textContent);
  const done = completed(); assert.ok(done.length > 0);
  for (const width of [300, 419, 420, 700]) {
    ui.resize(width); checkBioPicture(ui);
    const compact = width < 420;
    assert.equal(elements(ui, el => el.attributes['data-picture-below']).length > 0, compact);
    assert.equal(!!ui.find(el => el.attributes['data-picture-text'] === 'side-breath'), !compact);
    assert.equal(elements(ui, el => el.attributes['data-picture-image']).length, 1);
    assert.deepEqual(ui.current().options, options); assert.deepEqual(completed(), done);
  }
  assert.deepEqual(bioSnapshot(ui), initial);
});

test('説明中に幅を往復しても下の文が浮き上がり、pointはその行を指す', () => {
  const { ui, board, renderer } = animationBoard('bio-animals', 700);
  const state = drawing(board, 'side:breath', .5); renderer.setState(state);
  ui.resize(300);
  const row = ui.find(el => el.attributes['data-picture-below'] === 'side-breath');
  assert.equal(row.hidden, false); assert.ok(Number(row.style.opacity) > 0 && Number(row.style.opacity) < 1);
  assert.equal(ui.find(el => el.attributes['data-picture-text'] === 'side-breath'), null);
  ui.resize(700);
  assert.equal(elements(ui, el => el.attributes['data-picture-below']).length, 0);
  assert.ok(visibleElements(ui, el => el.attributes['data-picture-text'] === 'side-breath').length);
  renderer.destroy();
  const plant = animationBoard('bio-plants', 200);
  // 長い caption を盤の下へ出す分類で point も同じキーを使う。
  plant.renderer.setScene(scene.setOption(plant.board.scene, 'ovule', 'naked'));
  const target = 'caption:2', shown = drawing(plant.board, 'label:' + target, 1), pointed = drawing(plant.board, 'point:' + target, .5);
  plant.renderer.setState({ ...shown, parts: [...shown.parts, ...pointed.parts] });
  const caption = plant.ui.find(el => el.attributes['data-picture-below'] === target);
  assert.ok(caption); assert.equal(caption.hidden, false);
  assert.equal(caption.children[0].hasAttribute('display'), false);
  plant.renderer.destroy();
});

const animalCases = [
  ['fish', '魚類', 'gill', 'scale', 'egg-water'], ['amphibian', '両生類', 'both', 'moist', 'egg-water'],
  ['reptile', 'は虫類', 'lung', 'scale', 'egg-land'], ['bird', '鳥類', 'lung', 'feather', 'egg-land'],
  ['mammal', '哺乳類', 'lung', 'hair', 'live'],
];
for (const [group, name, breath, skin, birth] of animalCases) {
  test(`動物: 魚類から${name}へクリックし、数・見出し・輪・下の値が一致する`, () => {
    const ui = openBio('bio-animals');
    for (const [key, value] of Object.entries({ breath, skin, birth })) pressBio(ui, key, value);
    const text = key => ui.find(el => (el.attributes['data-picture-text'] || el.attributes['data-picture-below']) === key).textContent;
    assert.equal(text('count-match'), name + ' 3 つ（ぜんぶ）');
    assert.equal(text('title'), 'あてはまるなかま: ' + name);
    assert.equal(ui.find(el => el.attributes['data-picture-ring']).attributes['data-picture-ring'], group);
    assert.ok(ui.find(el => el.className === 'readout').textContent.includes('あてはまるなかま ' + name));
    const matches = scene.trace(ui.current()).measures.matches, rest = animalCases.filter(row => row[0] !== group);
    for (let i = 0; i < rest.length; i += 2) assert.equal(text('count:' + i), rest.slice(i, i + 2).map(row => row[1] + ' ' + matches[row[0]]).join('・'));
  });
}

test('動物: 一致あり→なし→ありで緑の行・輪・〇が消えて正しく戻る', () => {
  const ui = openBio('bio-animals');
  pressBio(ui, 'breath', 'lung');
  assert.equal(ui.find(el => (el.attributes['data-picture-text'] || el.attributes['data-picture-below']) === 'count-match'), null);
  assert.equal(ui.find(el => el.attributes['data-picture-ring']), null);
  assert.ok(elements(ui, el => el.tagName === 'text' || el.attributes['data-picture-below']).every(el => !el.textContent.includes('〇')));
  pressBio(ui, 'skin', 'feather'); pressBio(ui, 'birth', 'egg-land');
  assert.equal(ui.find(el => (el.attributes['data-picture-text'] || el.attributes['data-picture-below']) === 'count-match').textContent, '鳥類 3 つ（ぜんぶ）');
  assert.equal(elements(ui, el => (el.tagName === 'text' || el.attributes['data-picture-below']) && el.textContent.startsWith('〇')).length, 3);
  assert.equal(ui.find(el => el.attributes['data-picture-ring']).attributes['data-picture-ring'], 'bird');
});

for (const width of [279, 375, 700]) for (const id of ['bio-flower', 'bio-plants', 'bio-animals', 'bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex']) {
  test(`${id}: ${width}pxの同じ画面で全組合せをクリックし、新規画面と全文字・色・位置・折り返し・画像・線・輪が一致する`, () => {
    const ui = openBio(id, width), initial = bioSnapshot(ui);
    const svg = ui.find(el => el.attributes.class === 'board-svg');
    for (const current of bioVariants(id)) {
      selectBio(ui, current.options); checkBioPicture(ui);
      const fresh = openBio(id, width, current);
      assert.deepEqual(bioSnapshot(ui), bioSnapshot(fresh), JSON.stringify(current.options));
      assert.equal(ui.find(el => el.attributes.class === 'board-svg'), svg);
    }
    ui.button('はじめの配置にもどす').dispatch('click');
    assert.deepEqual(bioSnapshot(ui), initial); checkBioPicture(ui);
  });
}

test('植物: 画像3枚⇔1枚を往復して画像・文字・引き出し線が残らない', () => {
  const ui = openBio('bio-plants'), initial = bioSnapshot(ui);
  for (let i = 0; i < 2; i++) {
    pressBio(ui, 'reproduce', 'spore');
    assert.equal(elements(ui, el => el.attributes['data-picture-image']).length, 1);
    assert.ok(elements(ui, el => el.attributes['data-picture-pin']).length > 0);
    pressBio(ui, 'reproduce', 'seed');
    assert.equal(elements(ui, el => el.attributes['data-picture-image']).length, 3);
    assert.equal(elements(ui, el => el.attributes['data-picture-pin']).length, 0);
    assert.deepEqual(bioSnapshot(ui), initial);
  }
});

function pictureBox(el) {
  const fontSize = Number(el.attributes['font-size']);
  const lines = el.children.filter(t => t.tagName === 'tspan').map(t => t.textContent);
  return view.labelBox({ x: Number(el.attributes.x), y: Number(el.attributes.y), fontSize,
    anchor: el.attributes['text-anchor'], text: el.textContent, lines,
    textLength: Math.max(...lines.map(t => view.pictureTextWidth(t, fontSize))) });
}

test('画像の折り返しは区切りだけ・2行まで。短い行や語の途中の切断は作らない', () => {
  for (const text of ['めしべ 1 本', '花弁 4 枚', '根・茎・葉の区別がある。胞子でふえる',
    '胚珠（むき出し）', '子房がなく、胚珠がむき出し', '空白で 区切る文', '語句(かっこ内)']) {
    for (const width of [1, 20, 60, 100, 180, 560]) {
      const rows = view.wrapPictureText(text, width, 19);
      assert.equal(rows.join(''), text); assert.ok(rows.length <= 2);
      if (rows.length === 2) {
        assert.ok(rows.every(row => row.trim().length > 2));
        assert.ok(/[\s・。、]$/.test(rows[0]) || /^[（(]/.test(rows[1]));
        assert.ok(rows.every(row => view.pictureTextWidth(row, 19) <= width));
      }
    }
  }
  assert.deepEqual(view.wrapPictureText('めしべ', 19, 19), ['めしべ']);
  assert.deepEqual(view.wrapPictureText('花弁 4 枚', 80, 19), ['花弁 4 枚']);
  assert.equal(view.wrapPictureText('子房がなく、胚珠がむき出し', 180, 19).length, 2);
});

// 元画像の各部分が占める範囲。文字の配置データとは独立した期待値。
const flowerAreas = { sepal: [30, 100, 128, 296], petal: [155, 75, 345, 310],
  stamen: [365, 110, 544, 282], pistil: [576, 90, 614, 302] };
for (const width of [279, 335, 419, 420, 700, 1100]) {
  test(`アブラナの分けた図: ${width}px × 部分4通りで名前の位置・下の文・赤い輪を確認`, () => {
    const ui = screen('', width), board = boards.get('bio-flower'), renderer = ui.api.boardView.create(ui.host, board);
    for (const part of ['sepal', 'petal', 'stamen', 'pistil']) {
      const current = { ...board.scene, options: { figure: 'abrana-parts', part } }; renderer.setScene(current);
      const texts = elements(ui, el => el.attributes['data-picture-text']);
      if (width >= 420) {
        assert.equal(texts.length, 5); assert.equal(elements(ui, el => el.attributes['data-picture-below']).length, 0);
        for (const [key, [left, , right]] of Object.entries(flowerAreas)) {
          const el = texts.find(el => el.attributes['data-picture-text'] === key), box = pictureBox(el);
          assert.equal(el.children.length, 1); assert.equal(Number(el.attributes.y), 350);
          const center = 20 + (left + right) / 2 * .875, halfWidth = (right - left) / 2 * .875;
          assert.ok(Math.abs((box.left + box.right) / 2 - center) <= halfWidth, key + ': 自分の絵の真下');
          assert.ok(box.left >= 0 && box.right <= 600);
          if (key === 'pistil') assert.equal(el.attributes['text-anchor'], 'end');
        }
        const order = texts.find(el => el.attributes['data-picture-text'] === 'order');
        assert.equal(order.children.length, 1); assert.equal(Number(order.attributes.x), 300); assert.equal(Number(order.attributes.y), 35);
      } else {
        assert.equal(texts.length, 0);
        const rows = elements(ui, el => el.attributes['data-picture-below']);
        assert.equal(rows[0].textContent, '左から: がく 4 枚 → 花弁 4 枚 → おしべ 6 本 → めしべ 1 本（外側から内側の順）');
        assert.equal(rows[1].textContent, '赤い輪 ＝ えらんだ部分（' + { sepal: 'がく', petal: '花弁', stamen: 'おしべ', pistil: 'めしべ' }[part] + '）');
        const rings = elements(ui, el => el.attributes['data-picture-ring']); assert.equal(rings.length, 1);
        const ring = rings[0].attributes, [left, top, right, bottom] = flowerAreas[part];
        assert.equal(ring['data-picture-ring'], part); assert.equal(ring.stroke, require('../js/config.js').colors.redPen);
        assert.ok(Number(ring.cx) - Number(ring.rx) <= 20 + left * .875);
        assert.ok(Number(ring.cx) + Number(ring.rx) >= 20 + right * .875);
        assert.ok(Number(ring.cy) - Number(ring.ry) <= top * .875);
        assert.ok(Number(ring.cy) + Number(ring.ry) >= bottom * .875);
      }
    }
    renderer.destroy();
  });
}

test('シダ・コケ: 下の文は画像・名前・なかまの例に重ならない', () => {
  for (const width of [279, 335, 419, 420, 700]) for (const organs of ['yes', 'no']) {
    const current = boards.get('bio-plants').scene; current.options.reproduce = 'spore'; current.options.organs = organs;
    const ui = openBio('bio-plants', width, current);
    const below = ui.find(el => el.attributes['data-picture-below'] === 'caption:1');
    if (below) { assert.match(below.textContent, /根・茎・葉の区別が[あな].+。胞子でふえる/); continue; }
    const caption = pictureBox(ui.find(el => el.attributes['data-picture-text'] === 'caption:1'));
    assert.equal(overlap(caption, { left: 60, right: 540, top: 60, bottom: 360 }), false);
    for (const el of elements(ui, el => el.attributes['data-picture-text'] && el.attributes['data-picture-text'] !== 'caption:1')) {
      assert.equal(overlap(caption, pictureBox(el)), false, el.textContent);
    }
  }
});

test('分けた図の説明中も、下の文・選択の説明・赤い輪が消えず、pointは下の文を指す', () => {
  const { ui, board, renderer } = animationBoard('bio-flower', 700);
  renderer.setScene({ ...board.scene, options: { figure: 'abrana-parts', part: 'stamen' } });
  const image = drawing(board, 'image', 1), label = drawing(board, 'label:stamen', 1), point = drawing(board, 'point:stamen', .5);
  renderer.setState({ ...label, parts: [...image.parts, ...label.parts, ...point.parts] });
  ui.resize(300);
  for (const key of ['order', 'selection']) {
    const row = ui.find(el => el.attributes['data-picture-below'] === key);
    assert.ok(row); assert.equal(row.hidden, false); assert.equal(row.children[0].hasAttribute('display'), false);
  }
  assert.equal(visibleElements(ui, el => el.attributes['data-picture-ring'] === 'stamen').length, 1);
  ui.resize(700);
  assert.equal(elements(ui, el => el.attributes['data-picture-below']).length, 0);
  assert.equal(elements(ui, el => el.attributes['data-picture-ring']).length, 0);
  assert.equal(visibleElements(ui, el => el.attributes['data-picture-text'] === 'stamen').length, 1);
  renderer.destroy();
});

test('画像3盤の全68通り: 700→300→700で前の文字・輪を残さず元の配置へ戻す', () => {
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals']) {
    const ui = screen('', 700), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    for (const current of bioVariants(id)) {
      renderer.setScene(current); const initial = bioSnapshot(ui);
      ui.resize(300);
      const narrow = bioResult(ui, current);
      assert.deepEqual(elements(ui, el => el.attributes['data-picture-text']).map(el => el.textContent),
        narrow.marks.filter(m => !isBioBelow(narrow.picture, m.key)).map(m => m.text));
      assert.deepEqual(elements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent), narrow.picture.below.map(row => row.text));
      ui.resize(700); assert.deepEqual(bioSnapshot(ui), initial);
    }
    renderer.destroy();
  }
});

test('700pxの全68通り: 指示書の名前・画像の題・下の文から40単位を超えて動かない', () => {
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals']) {
    const ui = screen('', 700), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    for (const current of bioVariants(id)) {
      renderer.setScene(current);
      const original = scene.trace(current, { widthPx: 700 }), data = boardView.labelData(board, original, view.sizes(700));
      const rendered = elements(ui, el => el.attributes['data-picture-text']), boxes = rendered.map(pictureBox);
      for (const [index, el] of rendered.entries()) {
        const label = data.labels.find(label => label.id === 'mark-' + el.attributes['data-picture-text']), own = view.labelBox(label);
        const box = boxes[index], b = label.bounds;
        const moved = Math.hypot(box.left - own.left, box.top - own.top);
        if (moved < 1e-7) continue;
        // 元の位置が空いているのに、盤全体を詰め直して動かすことはない。
        assert.ok(own.left < 0 || own.right > 600 || own.top < 0 || own.bottom > 420 ||
          b && (own.left < b.x || own.right > b.x + b.width || own.top < b.y || own.bottom > b.y + b.height) ||
          boxes.some((other, j) => j !== index && overlap(own, other)) || data.obstacles.some(other => overlap(own, other)), el.textContent);
      }
      const expected = {};
      if (id === 'bio-flower' && current.options.figure === 'abrana-section') {
        Object.assign(expected, { stigma: [506, 68], ovary: [514, 306], ovule: [74, 336], stamen: [66, 106], petal: [516, 204], sepal: [70, 396] });
      } else if (id === 'bio-animals') {
        Object.entries({ fish: [105, 165], amphibian: [310, 170], reptile: [525, 170], bird: [120, 448], mammal: [475, 448] })
          .forEach(([key, [x, y]]) => { expected[key] = [10 + x * .5625, 60 + y * .5625]; });
      } else if (id === 'bio-plants' && current.options.reproduce === 'seed') {
        const xs = current.options.ovule === 'naked' ? [156, 444] : [108, 300, 492];
        xs.forEach((x, i) => { expected['heading:' + (i + 1)] = [x, 72]; expected['caption:' + (i + 1)] = [x, 365]; });
      }
      for (const [key, [x, y]] of Object.entries(expected)) {
        const el = ui.find(el => el.attributes['data-picture-text'] === key); assert.ok(el, key);
        const box = pictureBox(el);
        assert.ok(Math.hypot((box.left + box.right) / 2 - x, Number(el.attributes.y) - y) <= 40,
          id + ': ' + key + ' / ' + JSON.stringify(current.options));
      }
    }
    renderer.destroy();
  }
});

for (const width of [279, 335, 419, 420, 700, 1100]) for (const id of ['bio-flower', 'bio-plants', 'bio-animals', 'bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex']) {
  test(`${id}: 盤幅${width}pxで全組合せの文字を16px以上・盤内・文字や輪との重なりなしで描く`, () => {
    const ui = screen('', width), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board), size = view.sizes(width);
    for (const current of bioVariants(id)) {
      renderer.setScene(current);
      const r = bioResult(ui, current), data = boardView.labelData(board, r, size);
      const marks = r.marks.filter(mark => !isBioBelow(r.picture, mark.key));
      assert.deepEqual(elements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent), r.picture.below.map(row => row.text));
      for (const el of elements(ui, el => el.attributes['data-picture-below'])) {
        const chunks = el.children.filter(child => child.className === 'picture-phrase').map(child => child.textContent);
        assert.equal(chunks.join(''), el.textContent);
        assert.ok(chunks.every(chunk => view.pictureTextWidth(chunk, 16) <= width), el.textContent + ': 下の文も盤幅に収まる');
        if (chunks.length > 1) {
          assert.ok(chunks.every(chunk => chunk.trim().length > 2));
          chunks.slice(1).forEach((chunk, i) => assert.ok(/[\s・。、]$/.test(chunks[i]) || /^[（(]/.test(chunk)));
        }
      }
      // 下へ移した文字も消えず、まとめた文には元の４つの名前が残る。
      for (const mark of r.marks) if (isBioBelow(r.picture, mark.key) && mark.key !== 'order') {
        assert.ok(r.picture.below.some(row => row.text.includes(mark.text)), mark.text);
      }
      const placed = view.placeLabels(data.labels, data.obstacles, size, []);
      assert.ok(placed.every(p => !p.hidden), JSON.stringify(current.options) + placed.filter(p => p.hidden).map(p => p.id));
      const rendered = elements(ui, el => el.attributes.class === 'picture-text');
      assert.equal(rendered.length, marks.length);
      const boxes = rendered.map((el, i) => {
        assert.equal(el.textContent, marks[i].text);
        const fontSize = Number(el.attributes['font-size']); assert.ok(fontSize / size.unitPerPx >= 16 - 1e-9);
        const lines = el.children.filter(t => t.tagName === 'tspan').map(t => t.textContent);
        assert.ok(lines.length <= 2, el.textContent + ': 2行まで');
        if (lines.length > 1) {
          assert.ok(lines.every(line => Array.from(line.trim()).length > 2), el.textContent + ': 短すぎる行なし');
          assert.ok(/[\s・。、]$/u.test(lines[0]) || /^[（(]/u.test(lines[1]), el.textContent + ': 語の途中で切らない');
        }
        const box = view.labelBox({ x: Number(el.attributes.x), y: Number(el.attributes.y), fontSize,
          anchor: el.attributes['text-anchor'], text: el.textContent, lines,
          textLength: Math.max(...lines.map(t => view.pictureTextWidth(t, fontSize))) });
        assert.ok(box.left >= -1e-8 && box.right <= 600 + 1e-8 && box.top >= -1e-8 && box.bottom <= 420 + 1e-8, el.textContent);
        const bounds = marks[i].bounds;
        if (bounds) assert.ok(box.top >= bounds.y - 1e-8 && box.bottom <= bounds.y + bounds.height + 1e-8,
          el.textContent + ': 横に広げても縦の範囲を保つ');
        if (marks[i].maxRows) assert.ok(lines.length <= marks[i].maxRows, el.textContent + ': 行数');
        for (const ring of r.picture.rings) assert.ok(!overlap(box, { left: ring.cx - ring.rx, right: ring.cx + ring.rx,
          top: ring.cy - ring.ry, bottom: ring.cy + ring.ry }), el.textContent);
        return box;
      });
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(!overlap(a, b), JSON.stringify(current.options))));
      if (id === 'bio-animals') {
        const img = r.picture.images[0], region = ([left, top, right, bottom]) => ({
          left: img.x + left * img.width / 640, right: img.x + right * img.width / 640,
          top: img.y + top * img.height / 480, bottom: img.y + bottom * img.height / 480,
        });
        const areas = [[0, 0, 210, 225], [210, 0, 420, 225], [420, 0, 630, 225], [0, 225, 320, 480], [320, 225, 640, 480]];
        areas.forEach((area, i) => {
          const expected = region(area), box = boxes[i];
          assert.ok(box.left >= expected.left - 1e-8 && box.right <= expected.right + 1e-8 &&
            box.top >= expected.top - 1e-8 && box.bottom <= expected.bottom + 1e-8, animalCases[i][1]);
        });
        if (width < 420) {
          const faces = [[0, 75, 55, 125], [210, 40, 300, 110], [415, 75, 475, 115], [218, 220, 280, 260], [520, 210, 607, 290]];
          for (const box of boxes.slice(0, 5)) for (const face of faces) assert.ok(!overlap(box, region(face)), '顔をかくさない');
        }
      }
      for (const el of elements(ui, el => el.attributes['data-picture-pin'])) {
        const own = marks.findIndex(mark => mark.key === el.attributes['data-picture-pin']);
        const points = el.tagName === 'path' ? [...el.attributes.d.matchAll(/[ML]([^ ]+) ([^ ML]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) })) :
          [{ x: Number(el.attributes.x1), y: Number(el.attributes.y1) }, { x: Number(el.attributes.x2), y: Number(el.attributes.y2) }];
        assert.ok(points.length >= 2, el.attributes['data-picture-pin']);
        points.slice(1).forEach((p, i) => boxes.forEach((box, j) => {
          if (j !== own) assert.equal(crossesLine(box, { x1: points[i].x, y1: points[i].y, x2: p.x, y2: p.y }, 0), false,
            el.attributes['data-picture-pin'] + ' / ' + marks[j].key);
        }));
      }
      for (const el of elements(ui, () => true)) Object.values(el.attributes).forEach(value => assert.doesNotMatch(value, /NaN|Infinity|undefined/));
      assert.equal(elements(ui, el => el.attributes.class === 'handle').length, 0);
    }
    renderer.destroy();
  });
}

test('画像失敗は各置き場所に説明を出し、名前と引き出し線を残す。cropはSVGのviewBoxで切り出す', () => {
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals', 'bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex']) {
    const ui = screen('', 335), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    for (const current of bioVariants(id)) {
      renderer.setScene(current); const p = bioResult(ui, current).picture;
      const images = elements(ui, el => el.tagName === 'image'); assert.equal(images.length, p.images.length);
      images.forEach((el, i) => {
        const img = p.images[i], c = img.crop || { x: 0, y: 0, width: 640, height: 480 };
        assert.equal(el.attributes.href, img.src); assert.equal(el.parent.attributes.viewBox, `${c.x} ${c.y} ${c.width} ${c.height}`);
        assert.equal(el.parent.attributes.overflow, 'hidden'); assert.equal(el.parent.attributes.preserveAspectRatio, 'none');
        assert.doesNotThrow(() => el.dispatch('error'));
      });
      assert.equal(visibleElements(ui, el => el.textContent === '画像を読みこめませんでした' && el.tagName === 'text').length, images.length);
      assert.equal(visibleElements(ui, el => el.attributes['data-picture-tag']).length, p.tags.length);
      assert.equal(visibleElements(ui, el => el.attributes['data-picture-pin']).length, p.pins.length);
      assert.match(ui.find(el => el.attributes.class === 'board-svg').attributes['aria-label'], p.images[0].src.endsWith('.svg') ? /模式図/ : /写真ふうの画像/);
      if (current.options.figure?.startsWith('matsu') && ['petal', 'sepal'].includes(current.options.part)) {
        assert.ok(visibleElements(ui, el => el.tagName === 'text' && el.textContent === 'マツの花には、花弁やがくがありません').length);
        assert.equal(visibleElements(ui, el => el.attributes['data-picture-tag']).filter(el => el.children.some(t => t.attributes.fill === '#B23A36')).length, 0);
      }
    }
    renderer.destroy();
  }
});

test('植物の無効なボタンはdisabledと理由を表示し、押しても変化せず、戻すと値を復元する', () => {
  const ui = screen('?board=bio-plants', 375); ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
  function group(name) { return elements(ui, el => el.className === 'seg' && el.attributes['aria-label'] === name)[0]; }
  function press(name, label) { group(name).children.find(el => el.tagName === 'button' && el.textContent.replace(/^✓ /, '') === label).dispatch('click'); }
  press('子葉', '1 枚'); press('胚珠', 'むき出し');
  let disabled = group('子葉').children.filter(el => el.tagName === 'button'); assert.ok(disabled.every(el => el.disabled));
  assert.ok(group('子葉').textContent.includes('子葉の数で分けるのは、被子植物です'));
  press('ふえ方', '胞子');
  for (const name of ['胚珠', '子葉']) {
    const g = group(name), buttons = g.children.filter(el => el.tagName === 'button');
    assert.ok(buttons.every(el => el.disabled && el.attributes['aria-describedby']));
    const reason = g.children.find(el => el.className === 'seg-reason'); assert.equal(reason.hidden, false);
    assert.equal(reason.textContent, '胞子でふえる植物には、胚珠や子葉がありません');
    const before = ui.find(el => el.className === 'readout').textContent;
    buttons.forEach(el => el.dispatch('click')); assert.equal(ui.find(el => el.className === 'readout').textContent, before);
  }
  press('根・茎・葉の区別', 'ない'); assert.match(ui.find(el => el.className === 'readout').textContent, /コケ植物/);
  press('ふえ方', '種子'); assert.match(ui.find(el => el.className === 'readout').textContent, /裸子植物/);
  assert.ok(group('根・茎・葉の区別').children.filter(el => el.tagName === 'button').every(el => el.disabled));
  assert.match(group('根・茎・葉の区別').textContent, /種子でふえる植物には、根・茎・葉の区別があります/);
  press('胚珠', '子房の中'); assert.match(ui.find(el => el.className === 'readout').textContent, /単子葉類/);
  assert.ok(group('子葉').children.filter(el => el.tagName === 'button').every(el => !el.disabled));
});

test('生物の切り替えは375pxで折り返す構造、10個の動物ボタンと選択印・見出し、44pxの高さを持つ', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8');
  assert.match(css, /\.seg\s*\{[^}]*flex-wrap:\s*wrap/); assert.match(css, /\.seg button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.seg button\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.seg button:disabled\s*\{[^}]*background:\s*var\(--disabled\)/);
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals']) {
    const ui = screen('?board=' + id, 375); ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
    const groups = elements(ui, el => el.className === 'seg');
    const board = boards.get(id); assert.equal(groups.length, board.controls.length);
    groups.forEach((g, i) => {
      const control = board.controls[i]; assert.equal(g.attributes['aria-label'], control.label);
      assert.equal(g.children.find(el => el.className === 'seg-name').textContent, control.label);
      const buttons = g.children.filter(el => el.tagName === 'button');
      buttons.forEach((el, i) => {
        const selected = board.scene.options[control.key] === control.choices[i].value;
        assert.equal(el.attributes['aria-pressed'], String(selected)); assert.equal(el.textContent.startsWith('✓ '), selected);
      });
    });
    if (id === 'bio-animals') assert.equal(groups.flatMap(g => g.children.filter(el => el.tagName === 'button')).length, 10);
  }
});

test('生物: 画像400ms・線と輪の途中描画・用語の切り抜き・最終状態・無効シーンの表示', () => {
  for (const id of ['bio-flower', 'bio-plants', 'bio-animals']) {
    const { ui, board, renderer } = animationBoard(id, 335), r = scene.trace(board.scene);
    const timeline = explain.buildTimeline(scriptsBio1.BOARDS[id], board.scene, r, []);
    const part = timeline.steps.flatMap(s => s.parts).find(p => p.items.some(i => i.type === 'picture'));
    assert.equal(part.duration, 400);
    const voiced = explain.buildTimeline(scriptsBio1.BOARDS[id], board.scene, r, [], {
      clipSeconds: require('../content/voice-bio1.js').CLIPS[id].E.map(c => c[1]),
    });
    assert.ok(voiced.steps.flatMap(s => s.parts).filter(p => p.items.some(i => i.type === 'picture')).every(p => p.duration === 400));
    const token = id === 'bio-plants' ? 'panel:1' : 'image';
    renderer.setState(drawing(board, token, .5));
    const img = visibleElements(ui, el => el.attributes['data-picture-image'])[0];
    assert.ok(Number(img.attributes.opacity) > 0 && Number(img.attributes.opacity) < 1);
    renderer.setState(drawing(board, id === 'bio-animals' ? 'ring' : id === 'bio-flower' ? 'label:sepal' : 'panel:1', .5));
    if (id === 'bio-flower') {
      const line = visibleElements(ui, el => el.attributes['data-picture-pin'] === 'sepal')[0];
      assert.notEqual(Number(line.attributes.x2), r.picture.pins.find(p => p.key === 'sepal').to.x);
      assert.ok(visibleElements(ui, el => el.tagName === 'text' && el.textContent === 'がく')[0].hasAttribute('clip-path'));
    }
    if (id === 'bio-animals') assert.ok(visibleElements(ui, el => el.tagName === 'ellipse')[0].hasAttribute('stroke-dasharray'));
    renderer.setScene({ ...board.scene, options: null });
    assert.equal(ui.find(el => el.className === 'board-error').hidden, false);
    assert.match(ui.host.textContent, /この図は表示できません/);
    renderer.destroy();
  }
});

for (const [name, middle] of [['ease', .5], ['easeOut', .75]]) {
  test(`${name} は緩急を付け、範囲外・数でない進み具合を収める`, () => {
    for (const [input, expected] of [[0, 0], [.5, middle], [1, 1], [-1, 0], [2, 1],
      [NaN, 0], ['0.5', 0], [null, 0], [undefined, 0], [Infinity, 1], [-Infinity, 0]]) {
      assert.equal(view[name](input), expected);
    }
    assert.equal(view[name](.25), name === 'ease' ? .15625 : .4375);
    assert.equal(view[name](.75), name === 'ease' ? .84375 : .9375);
  });
}

for (const width of [264, 319, 375, 612, 1100]) {
  test(`幅 ${width}px でも文字とつまみの最小サイズを保つ`, () => {
    const s = view.sizes(width);
    assert.equal(s.unitPerPx, 600 / width);
    for (const [key, px, units] of [['textSize', 16, 16], ['angleSize', 19, 21],
      ['hitRadius', 24, 30], ['knobRadius', 13, 14]]) {
      assert.ok(s[key] / s.unitPerPx >= px - 1e-10, key);
      assert.ok(s[key] >= units, key);
    }
  });
  for (const degrees of [0, 1, 44, 45, 80]) {
    test(`幅 ${width}px・${degrees}° の角度名が 8px 以上離れる`, () => {
      const s = view.sizes(width);
      const base = { vertex: { x: 300, y: 270 }, fromDeg: -90, valueDeg: degrees };
      const incoming = view.angleLabel({ ...base, key: 'in', toDeg: -90 - degrees }, s);
      const outgoing = view.angleLabel({ ...base, key: 'out', toDeg: -90 + degrees }, s);
      const labelWidth = 3 * s.textSize;
      function left(p) { return p.x - (p.anchor === 'end' ? labelWidth : p.anchor === 'middle' ? labelWidth / 2 : 0); }
      assert.ok((left(outgoing) - left(incoming) - labelWidth) / s.unitPerPx >= 8);
      for (const p of [incoming, outgoing]) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(['start', 'middle', 'end'].includes(p.anchor));
      }
    });
  }
}

test('レビューの再現値 −39.89° の垂直入射で2つの 0° の箱を重ねない', () => {
  for (const width of [319, 612]) {
    const board = boards.get('reflect'), s = view.sizes(width);
    board.scene.elements.find(e => e.type === 'mirror').tiltDeg = -39.89;
    Object.assign(board.scene.elements.find(e => e.type === 'source'),
      { x: 274.3473709511223, y: 239.30891623157186 });
    assert.deepEqual(scene.validateScene(board.scene), []);
    const data = boardView.labelData(board, scene.trace(board.scene), s);
    const labels = data.labels.filter(label => ['angle-in', 'angle-out'].includes(label.id));
    assert.deepEqual(labels.map(label => label.text), ['0°', '0°']);
    const placed = view.placeLabels(labels, data.obstacles, s);
    assert.ok(placed.every(p => !p.hidden));
    assertClear(labelBoxes(labels, placed));
  }
});

test('0.49° は向きの符号によらず key で分け、0.5° は光線の側に置く', () => {
  for (const width of [319, 612]) for (const fromDeg of [-129.89, -90, -62.5, 90]) {
    const s = view.sizes(width), radians = fromDeg * Math.PI / 180;
    for (const key of ['in', 'out']) for (const sign of [-1, 1]) {
      const base = { key, vertex: { x: 300, y: 210 }, fromDeg };
      const zero = view.angleLabel({ ...base, valueDeg: 0, toDeg: fromDeg }, s);
      const near = view.angleLabel({ ...base, valueDeg: .49, toDeg: fromDeg + sign * .49 }, s);
      assert.deepEqual(near, zero);
      const side = p => Math.sign(Math.cos(radians) * (p.y - base.vertex.y) - Math.sin(radians) * (p.x - base.vertex.x));
      assert.equal(side(near), key === 'in' ? -1 : 1);
      const half = view.angleLabel({ ...base, valueDeg: .5, toDeg: fromDeg + sign * .5 }, s);
      assert.equal(side(half), sign);
      const expected = (fromDeg + sign * 14.5) * Math.PI / 180;
      assert.ok(Math.abs(half.x - 300 - Math.cos(expected) * 100 * s.textSize / 16) < 1e-8);
      assert.ok(Math.abs(half.y - 210 - Math.sin(expected) * 100 * s.textSize / 16) < 1e-8);
    }
  }
});

test('負・NaN・Infinity の角度を 0° として扱い、位置も文字も有限にする', () => {
  for (const width of [319, 612]) for (const valueDeg of [-1, -.49, NaN, Infinity, -Infinity]) {
    const s = view.sizes(width), board = boards.get('reflect'), result = scene.trace(board.scene);
    result.angles.forEach(angle => {
      const zero = { ...angle, valueDeg: 0, toDeg: angle.fromDeg };
      angle.valueDeg = valueDeg;
      assert.deepEqual(view.angleLabel(angle, s), view.angleLabel(zero, s));
    });
    const data = boardView.labelData(board, result, s);
    const labels = data.labels.filter(label => ['angle-in', 'angle-out'].includes(label.id));
    assert.deepEqual(labels.map(label => label.text), ['0°', '0°']);
    const placed = view.placeLabels(labels, data.obstacles, s);
    assert.ok(placed.every(p => !p.hidden && Number.isFinite(p.x) && Number.isFinite(p.y)));
    assertClear(labelBoxes(labels, placed));
  }
});

test('屈折の垂直入射は水・ガラスの両方向で数字を隠さず重ねない', () => {
  for (const width of [319, 612]) for (const medium of ['water', 'glass']) {
    for (const direction of ['air-to-medium', 'medium-to-air']) {
      const board = boards.get('refract'), s = view.sizes(width);
      board.scene = scene.setOption(scene.setOption(board.scene, 'medium', medium), 'direction', direction);
      const boundary = board.scene.elements.find(e => e.type === 'boundary');
      board.scene = scene.moveElement(board.scene, 'src', 'move',
        { x: boundary.x, y: boundary.y + (direction === 'air-to-medium' ? -100 : 100) });
      const result = scene.trace(board.scene);
      assert.ok(result.angles.every(angle => angle.valueDeg === 0));
      const data = boardView.labelData(board, result, s), placed = view.placeLabels(data.labels, data.obstacles, s);
      const numeric = placed.filter(p => ['angle-in', 'angle-out'].includes(p.id));
      assert.equal(numeric.length, 2); assert.ok(numeric.every(p => !p.hidden));
      assertClear(labelBoxes(data.labels, placed).filter(box => numeric.some(p => p.id === box.id)));
    }
  }
});

// 線の法線に箱の四隅を投影し、線をまたがないことと最短のすき間を測る。
function markGap(mark, box) {
  return Math.min(...[box.x, box.x + box.width].flatMap(x => [box.y, box.y + box.height].map(y =>
    (x - mark.x) * mark.away.x + (y - mark.y) * mark.away.y)));
}

for (const width of [264, 319, 375, 612, 1100]) {
  test(`幅 ${width}px・6 盤の線に付く文字は、線から 5px 以上離す`, () => {
    const s = view.sizes(width);
    for (const { id } of boards.list().filter(board => board.unit === 'light')) {
      const marks = scene.trace(boards.get(id).scene).marks.filter(mark => mark.away);
      assert.ok(marks.length > 0);
      for (const mark of marks) {
        const before = structuredClone(mark), box = view.markBox(mark, s);
        assert.equal(box.width, Array.from(mark.text).length * s.textSize);
        assert.equal(box.height, s.textSize * 1.2);
        assert.ok(markGap(mark, box) / s.unitPerPx >= 5, id + ': ' + mark.key);
        assert.ok(Math.abs(markGap(mark, box) / s.unitPerPx - 6) < 1e-8);
        assert.deepEqual(mark, before);
      }
    }
  });
}

test('傾き −40°・0°・40° の鏡と法線は、幅 319・612px とも文字の箱と交わらない', () => {
  for (const width of [319, 612]) for (const tilt of [-40, 0, 40]) {
    const board = boards.get('reflect'), s = view.sizes(width);
    board.scene.elements.find(e => e.type === 'mirror').tiltDeg = tilt;
    const result = scene.trace(board.scene);
    for (const mark of result.marks.filter(mark => ['mirror', 'normal'].includes(mark.key))) {
      const box = view.markBox(mark, s);
      assert.ok(markGap(mark, box) / s.unitPerPx >= 5, `${width}px・${tilt}°・${mark.key}`);
      if (tilt !== 0) {
        const distance = 6 * s.unitPerPx + Math.hypot(box.width, box.height) / 2;
        assert.ok(Math.abs(box.x + box.width / 2 - mark.x - mark.away.x * distance) < 1e-8);
        assert.ok(Math.abs(box.y + box.height / 2 - mark.y - mark.away.y * distance) < 1e-8);
      }
    }
  }
});

test('markBox の上下左右は箱の中心をそろえ、線に近い辺を 6px 離す', () => {
  const s = view.sizes(319), base = { text: '文字', x: 300, y: 210 };
  for (const away of [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]) {
    const mark = { ...base, away }, box = view.markBox(mark, s);
    assert.ok(Math.abs(markGap(mark, box) - 6 * s.unitPerPx) < 1e-8);
    if (away.x === 0) assert.equal(box.x + box.width / 2, base.x);
    else assert.equal(box.y + box.height / 2, base.y);
  }
});

test('markBox の away がゼロ・数でない場合は従来の左下の点を使い、長さが違えば正規化する', () => {
  const s = view.sizes(319), base = { text: 'Aあ🌟', x: 100, y: 150 };
  const expected = { x: 100, y: 150 - s.textSize, width: 3 * s.textSize, height: s.textSize * 1.2 };
  for (const away of [undefined, null, {}, { x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 1, y: Infinity },
    { x: '1', y: 0 }, { x: 1, y: null }, '右']) {
    assert.deepEqual(view.markBox({ ...base, away }, s), expected);
  }
  for (const away of [{ x: 0, y: 7 }, { x: -2, y: 0 }, { x: 3, y: -4 }]) {
    const length = Math.hypot(away.x, away.y), normal = { x: away.x / length, y: away.y / length };
    const actual = view.markBox({ ...base, away }, s), normalized = view.markBox({ ...base, away: normal }, s);
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - normalized[key]) < 1e-8, key);
  }
  for (const value of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    assert.deepEqual(view.markBox({ ...base, away: { x: value, y: value } }, s),
      view.markBox({ ...base, away: { x: 1, y: 1 } }, s));
  }
});

test('markBox は空文字・不正な座標を描かず null を返す', () => {
  const s = view.sizes(612), base = { text: '文字', x: 100, y: 100 };
  for (const text of ['', ' ', null, undefined, 1]) assert.equal(view.markBox({ ...base, text }, s), null);
  for (const key of ['x', 'y']) for (const value of [NaN, Infinity, -Infinity, '100', null, undefined]) {
    assert.equal(view.markBox({ ...base, [key]: value }, s), null);
  }
  assert.equal(view.markBox(null, s), null);
  const board = boards.get('reflect'), result = { angles: [], images: [], marks: [{ ...base, key: 'empty', text: '' }] };
  assert.ok(!boardView.labelData(board, result, s).labels.some(label => label.id === 'mark-empty'));
});

test('markBox が四辺からはみ出すと最初の候補を盤内へ寄せ、衝突時は候補へ動かすか隠す', () => {
  const s = view.sizes(319), board = boards.get('lens');
  for (const [x, y, away] of [[0, 210, { x: -1, y: 0 }], [600, 210, { x: 1, y: 0 }],
    [300, 0, { x: 0, y: -1 }], [300, 420, { x: 0, y: 1 }],
    [0, 0, { x: -1, y: -1 }], [600, 420, { x: 1, y: 1 }]]) {
    const result = { angles: [], images: [], marks: [{ key: 'edge', text: '端', x, y, away }] };
    const label = boardView.labelData(board, result, s).labels.find(label => label.id === 'mark-edge');
    const box = view.labelBox(label), placed = view.placeLabels([label], [], s);
    assertClear([box]); assertClear(labelBoxes([label], placed));
    assert.equal(placed[0].hidden, false); assert.equal(placed[0].x, label.x); assert.equal(placed[0].y, label.y);
    assert.ok(box.left < 1e-8 || box.right > 600 - 1e-8 || box.top < 1e-8 || box.bottom > 420 - 1e-8);
    const labels = [{ ...label, id: 'first', priority: 0, fixed: true }, label];
    const moved = view.placeLabels(labels, [], s);
    assert.equal(moved[1].hidden, false); assertClear(labelBoxes(labels, moved));
    assert.equal(view.placeLabels([label], [{ x: 300, y: 210, r: 1000 }], s)[0].hidden, true);
  }
});

test('角度名の表示は 360px が境界', () => {
  assert.equal(view.sizes(359).showAngleNames, false);
  assert.equal(view.sizes(360).showAngleNames, true);
});

test('幅が不正なら 600px として計算する', () => {
  for (const width of [0, -5, NaN, '300', Infinity, undefined, null]) {
    assert.deepEqual(view.sizes(width), view.sizes(600));
  }
});

test('画面上の座標を盤の座標に変換する（盤の外も変換する）', () => {
  const rect = { left: 20, top: 40, width: 300, height: 210 };
  assert.deepEqual(view.toBoardPoint(170, 145, rect), { x: 300, y: 210 });
  assert.deepEqual(view.toBoardPoint(320, 250, rect), { x: 600, y: 420 });
  assert.deepEqual(view.toBoardPoint(-30, 300, rect), { x: -100, y: 520 });
  assert.equal(view.toBoardPoint(100, 100, { ...rect, width: 0 }), null);
  assert.equal(view.toBoardPoint(100, 100, { ...rect, height: 0 }), null);
});

test('DOM がない Node でも画面モジュールを読み込める', () => {
  assert.doesNotThrow(() => require('../js/board-view.js'));
  assert.doesNotThrow(() => require('../js/app.js'));
});

test('光線・鏡と境界・法線と弧の太さは幅 420px が境界', () => {
  for (const [width, expected] of [[319, [3.5, 3, 2]], [419, [3.5, 3, 2]], [420, [4.5, 4, 2.5]], [612, [4.5, 4, 2.5]]]) {
    const s = view.sizes(width);
    assert.deepEqual([s.rayWidth, s.surfaceWidth, s.thinWidth], expected);
  }
});

test('矢印は線分の 45% に置き、幅に応じて画面上の 14×11px・16×13px を保つ', () => {
  for (const width of [319, 612]) {
    const s = view.sizes(width), ray = { x1: 10, y1: 20, x2: 310, y2: 420, style: 'solid', arrow: true };
    const arrow = view.arrowAt(ray, s);
    assert.equal(arrow.x, 145); assert.equal(arrow.y, 200);
    assert.equal(arrow.dx, .6); assert.equal(arrow.dy, .8);
    assert.ok(Math.abs(arrow.length / s.unitPerPx - (width < 420 ? 14 : 16)) < 1e-10);
    assert.ok(Math.abs(arrow.width / s.unitPerPx - (width < 420 ? 11 : 13)) < 1e-10);
    const reversed = view.arrowAt({ ...ray, x1: ray.x2, y1: ray.y2, x2: ray.x1, y2: ray.y1 }, s);
    assert.equal(reversed.x, 175); assert.equal(reversed.y, 240);
    assert.equal(reversed.dx, -.6); assert.equal(reversed.dy, -.8);
  }
});

test('長さ 0・40px 未満・破線・矢印なし指定では矢印を付けない', () => {
  for (const width of [319, 612]) {
    const s = view.sizes(width), ray = { x1: 0, y1: 0, x2: 200, y2: 0, style: 'solid', arrow: true };
    for (const length of [0, 1, 39.99]) assert.equal(view.arrowAt({ ...ray, x2: length * s.unitPerPx }, s), null);
    assert.ok(view.arrowAt({ ...ray, x2: 40 * s.unitPerPx }, s));
    assert.equal(view.arrowAt({ ...ray, style: 'dashed' }, s), null);
    assert.equal(view.arrowAt({ ...ray, arrow: false }, s), null);
    assert.equal(view.arrowAt({ ...ray, x2: NaN }, s), null);
  }
});

function labelBoxes(labels, placed) {
  return placed.flatMap((p, i) => {
    if (p.hidden) return [];
    const size = labels[i].fontSize, rows = p.lines || labels[i].lines || [labels[i].text];
    const width = p.textLength || labels[i].textLength || Math.max(...rows.map(text => Array.from(text).length)) * size;
    const left = p.x - (p.anchor === 'end' ? width : p.anchor === 'middle' ? width / 2 : 0);
    return [{ id: p.id, left, right: left + width, top: p.y - size, bottom: p.y + size * (.2 + (rows.length - 1) * 1.2) }];
  });
}

function assertClear(boxes) {
  for (const [i, box] of boxes.entries()) {
    assert.ok(box.left >= 0 && box.right <= 600 && box.top >= 0 && box.bottom <= 420, box.id);
    for (const other of boxes.slice(i + 1)) assert.ok(
      box.left >= other.right || box.right <= other.left || box.top >= other.bottom || box.bottom <= other.top,
      box.id + ' と ' + other.id);
  }
}

function overlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// 箱と線分の投影を比べる。実装の切り詰め計算とは別の方法で検査する。
function crossesLine(box, line, padding) {
  const left = box.left - padding, right = box.right + padding;
  const top = box.top - padding, bottom = box.bottom + padding;
  if (Math.max(line.x1, line.x2) < left || Math.min(line.x1, line.x2) > right ||
      Math.max(line.y1, line.y2) < top || Math.min(line.y1, line.y2) > bottom) return false;
  const side = [left, right].flatMap(x => [top, bottom].map(y =>
    (line.x2 - line.x1) * (y - line.y1) - (line.y2 - line.y1) * (x - line.x1)));
  return Math.min(...side) <= 0 && Math.max(...side) >= 0;
}

function assertLinesClear(labels, placed, lines, size) {
  for (const box of labelBoxes(labels, placed)) {
    if (labels.find(label => label.id === box.id).fixed) continue;
    for (const line of lines) assert.ok(!crossesLine(box, line, 3 * size.unitPerPx),
      box.id + ': ' + JSON.stringify(line));
  }
}

function assertCirclesClear(box, circles) {
  for (const circle of circles.filter(circle => Number.isFinite(circle.r))) assert.ok(Math.hypot(
    circle.x - Math.max(box.left, Math.min(box.right, circle.x)),
    circle.y - Math.max(box.top, Math.min(box.bottom, circle.y))) >= circle.r, box.id);
}

test('文字の配列が空・配列でない場合は空配列を返す', () => {
  for (const labels of [[], null, undefined, {}, '文字']) assert.deepEqual(view.placeLabels(labels, [], view.sizes(600)), []);
});

test('不正な座標・文字サイズ・空文字は隠す', () => {
  const base = { id: 'label', text: '物体', x: 300, y: 210, priority: 1, fontSize: 16 };
  const invalid = [];
  for (const key of ['x', 'y', 'fontSize']) {
    for (const value of [NaN, Infinity, null, undefined, '16']) invalid.push({ ...base, [key]: value });
  }
  invalid.push({ ...base, text: '' }, { ...base, text: ' ' }, { ...base, text: null },
    { ...base, fontSize: 0 }, { ...base, fontSize: -1 });
  const actual = view.placeLabels(invalid, [], view.sizes(600));
  assert.equal(actual.length, invalid.length);
  assert.ok(actual.every(p => p.hidden));
});

test('同じ位置の文字は右・左の順に分け、入力を書き換えない', () => {
  const labels = [{ id: 'first', text: '物体', x: 300, y: 210, priority: 1, fontSize: 20 },
    { id: 'second', text: '物体', x: 300, y: 210, priority: 1, fontSize: 20 }];
  const before = JSON.stringify(labels), obstacles = [{ x: 300, y: 210, r: 14 }];
  const placed = view.placeLabels(labels, obstacles, view.sizes(600));
  assert.deepEqual(placed, [
    { id: 'first', x: 332, y: 218, anchor: 'start', hidden: false },
    { id: 'second', x: 268, y: 218, anchor: 'end', hidden: false },
  ]);
  assertClear(labelBoxes(labels, placed));
  assert.equal(JSON.stringify(labels), before);
});

test('prefer=below は下・上・右・左・右下・左下・右上・左上、そのあと距離2倍の順に試す', () => {
  const label = { id: 'label', text: '字', x: 300, y: 210, fontSize: 20, prefer: 'below' };
  const candidates = [
    { x: 300, y: 262, anchor: 'middle' }, { x: 300, y: 174, anchor: 'middle' },
    { x: 332, y: 218, anchor: 'start' }, { x: 268, y: 218, anchor: 'end' },
    { x: 332, y: 262, anchor: 'start' }, { x: 268, y: 262, anchor: 'end' },
    { x: 332, y: 174, anchor: 'start' }, { x: 268, y: 174, anchor: 'end' },
    { x: 300, y: 294, anchor: 'middle' }, { x: 300, y: 142, anchor: 'middle' },
    { x: 364, y: 218, anchor: 'start' }, { x: 236, y: 218, anchor: 'end' },
    { x: 364, y: 294, anchor: 'start' }, { x: 236, y: 294, anchor: 'end' },
    { x: 364, y: 142, anchor: 'start' }, { x: 236, y: 142, anchor: 'end' },
  ];
  const obstacles = [{ x: 300, y: 210, r: 14 }], before = JSON.stringify(label), s = view.sizes(600);
  for (const candidate of candidates) {
    const placed = view.placeLabels([label], obstacles, s);
    assert.deepEqual(placed[0], { id: label.id, ...candidate, hidden: false });
    assertClear(labelBoxes([label], placed));
    const box = view.labelBox({ ...label, ...candidate });
    obstacles.push({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, r: 1 });
  }
  assert.equal(view.placeLabels([label], obstacles, s)[0].hidden, true);
  assert.equal(JSON.stringify(label), before);
  const own = { ...label, preferOwn: true };
  assert.deepEqual(view.placeLabels([own], [], s)[0],
    { id: label.id, x: label.x, y: label.y, anchor: 'start', hidden: false });
});

test('prefer が知らない値・文字列以外なら従来の右からの順を保つ', () => {
  const label = { id: 'label', text: '物体', x: 300, y: 210, fontSize: 20 };
  const s = view.sizes(600), obstacles = [{ x: 300, y: 210, r: 14 }];
  const expected = view.placeLabels([label], obstacles, s);
  for (const prefer of ['above', 'right', 'Below', '', null, undefined, 0, 1, true, {}, [], ['below'], new String('below')]) {
    assert.deepEqual(view.placeLabels([{ ...label, prefer }], obstacles, s), expected);
  }
});

test('光軸上の焦点距離・物体・スクリーンだけ下を優先し、初期配置でも下へ置く', () => {
  for (const width of [319, 612]) for (const { id } of boards.list().filter(board => board.unit === 'light')) {
    const board = boards.get(id), s = view.sizes(width);
    const data = boardView.labelData(board, scene.trace(board.scene), s);
    const placed = view.placeLabels(data.labels, data.obstacles, s);
    data.labels.forEach((label, i) => {
      if (!label.id.startsWith('handle-')) return;
      const below = id === 'lens' ? label.text === '焦点距離' :
        id === 'lens-image' && ['物体', 'スクリーン'].includes(label.text);
      assert.equal(label.prefer, below ? 'below' : undefined, id + ': ' + label.text);
      if (below) {
        assert.equal(placed[i].hidden, false);
        assert.equal(placed[i].anchor, 'middle');
        assert.equal(placed[i].x, label.x);
        assert.ok(view.labelBox({ ...label, ...placed[i] }).top > label.y);
      }
    });
  }
});

test('短い焦点距離で2つの焦点の文字が重なると、配置後は両方を重ねず表示する', () => {
  for (const width of [319, 612]) {
    const s = view.sizes(width);
    // 通常の操作範囲より短い焦点距離 8 の文字を使い、配置処理の衝突を確かめる。
    const labels = [-1, 1].map(sign => {
      const box = view.markBox({ text: '焦点', x: 300 + sign * 8, y: 210, away: { x: 0, y: 1 } }, s);
      return { id: 'focus-' + sign, text: '焦点', x: box.x, y: box.y + s.textSize,
        fontSize: s.textSize, priority: 4, preferOwn: true };
    });
    const before = labels.map(label => view.labelBox(label));
    assert.ok(before[0].right > before[1].left);
    const placed = view.placeLabels(labels, [], s);
    assert.ok(placed.every(p => !p.hidden));
    assertClear(labelBoxes(labels, placed));
  }
});

test('焦点の文字の最初の候補は、幅に応じた文字サイズでも焦点を中心にする', () => {
  for (const width of [319, 612]) for (const id of ['lens', 'lens-image']) {
    const board = boards.get(id), lens = board.scene.elements.find(e => e.type === 'lens');
    const s = view.sizes(width), data = boardView.labelData(board, scene.trace(board.scene), s);
    for (const label of data.labels.filter(label => label.id.startsWith('mark-focus-'))) {
      const sign = label.id.endsWith('left') ? -1 : 1, box = view.labelBox(label);
      assert.ok(Math.abs((box.left + box.right) / 2 - lens.x - sign * lens.focalLength) < 1e-8);
      assert.ok(Math.abs(box.top - lens.y - 6 * s.unitPerPx) < 1e-8);
    }
  }
});

test('文字数は半角も全角として、Unicode の文字ごとに数える', () => {
  assert.deepEqual(view.labelBox({ text: 'Aあ🌟', fontSize: 20, x: 100, y: 100, anchor: 'middle' }),
    { left: 70, right: 130, top: 80, bottom: 104 });
});

test('盤の四辺と四隅では内側の候補を選ぶ', () => {
  for (const [x, y] of [[0, 210], [600, 210], [300, 0], [300, 420], [0, 0], [600, 0], [0, 420], [600, 420]]) {
    const labels = [{ id: 'edge', text: '物体', x, y, priority: 1, fontSize: 20 }];
    const placed = view.placeLabels(labels, [{ x, y, r: 14 }], view.sizes(600));
    assert.equal(placed[0].hidden, false, x + ',' + y);
    assertClear(labelBoxes(labels, placed));
  }
});

test('円の障害物を避け、16 候補が全部ふさがると隠す', () => {
  const labels = [{ id: 'label', text: '物体', x: 300, y: 210, priority: 1, fontSize: 20 }];
  const placed = view.placeLabels(labels, [{ x: 338, y: 210, r: 10 }], view.sizes(600));
  assert.equal(placed[0].anchor, 'end');
  assert.equal(placed[0].hidden, false);
  assert.deepEqual(view.placeLabels(labels, [{ x: 300, y: 210, r: 1000 }], view.sizes(600)), [
    { id: 'label', x: 300, y: 210, anchor: 'start', hidden: true },
  ]);
});

test('通常の8方向、そのあと同じ順で距離2倍の8方向を試す', () => {
  const label = { id: 'label', text: '字', x: 300, y: 210, fontSize: 20 }, s = view.sizes(600);
  const candidates = [
    { x: 332, y: 218, anchor: 'start' }, { x: 268, y: 218, anchor: 'end' },
    { x: 300, y: 262, anchor: 'middle' }, { x: 300, y: 174, anchor: 'middle' },
    { x: 332, y: 262, anchor: 'start' }, { x: 268, y: 262, anchor: 'end' },
    { x: 332, y: 174, anchor: 'start' }, { x: 268, y: 174, anchor: 'end' },
    { x: 364, y: 218, anchor: 'start' }, { x: 236, y: 218, anchor: 'end' },
    { x: 300, y: 294, anchor: 'middle' }, { x: 300, y: 142, anchor: 'middle' },
    { x: 364, y: 294, anchor: 'start' }, { x: 236, y: 294, anchor: 'end' },
    { x: 364, y: 142, anchor: 'start' }, { x: 236, y: 142, anchor: 'end' },
  ];
  const obstacles = [{ x: 300, y: 210, r: 14 }], lines = [];
  for (const candidate of candidates) {
    const placed = view.placeLabels([label], obstacles, s, lines);
    assert.deepEqual(placed[0], { id: label.id, ...candidate, hidden: false });
    assertLinesClear([label], placed, lines, s);
    const box = view.labelBox({ ...label, ...candidate });
    lines.push({ x1: box.left, y1: (box.top + box.bottom) / 2,
      x2: box.right, y2: (box.top + box.bottom) / 2 });
  }
  assert.equal(view.placeLabels([label], obstacles, s, lines)[0].hidden, true);
});

test('lines を省略・null・配列でない値にしても空配列と同じ配置になる', () => {
  for (const { id } of boards.list()) {
    const board = boards.get(id), s = view.sizes(319), data = boardView.labelData(board, scene.trace(board.scene), s);
    const expected = view.placeLabels(data.labels, data.obstacles, s, []);
    assert.deepEqual(view.placeLabels(data.labels, data.obstacles, s), expected);
    for (const lines of [undefined, null, {}, '線', 1, true, { x1: 0, y1: 0, x2: 600, y2: 420 }]) {
      assert.deepEqual(view.placeLabels(data.labels, data.obstacles, s, lines), expected);
    }
  }
});

test('数でない座標・NaN・Infinity・長さ0の線分を無視し、有効な線分は避ける', () => {
  const label = { id: 'label', text: '文字', x: 300, y: 210, fontSize: 20, preferOwn: true };
  const s = view.sizes(600), line = { x1: 0, y1: 200, x2: 600, y2: 200 };
  const invalid = [null, undefined, {}, [], '線', { x1: 310, y1: 200, x2: 310, y2: 200 }];
  for (const key of ['x1', 'y1', 'x2', 'y2']) for (const value of ['200', NaN, Infinity, -Infinity, null, undefined]) {
    invalid.push({ ...line, [key]: value });
  }
  const before = structuredClone(invalid);
  assert.deepEqual(view.placeLabels([label], [], s, invalid), view.placeLabels([label], [], s, []));
  assert.deepEqual(view.placeLabels([label], [], s, [...invalid, line]), view.placeLabels([label], [], s, [line]));
  assertLinesClear([label], view.placeLabels([label], [], s, [line]), [line], s);
  assert.deepEqual(invalid, before);
});

test('3pxふくらませた箱の辺・角に線分の端が触れたら避け、その外の線は避けない', () => {
  const label = { id: 'label', text: '文字', x: 300, y: 210, fontSize: 20, preferOwn: true };
  for (const width of [300, 600]) {
    const s = view.sizes(width), padding = 3 * s.unitPerPx, box = view.labelBox(label);
    const left = box.left - padding, right = box.right + padding;
    const top = box.top - padding, bottom = box.bottom + padding;
    for (const [x, y, dx, dy] of [[left, 200, -1, 0], [right, 200, 1, 0],
      [320, top, 0, -1], [320, bottom, 0, 1], [left, top, -1, -1], [right, bottom, 1, 1]]) {
      const touching = { x1: x + dx * 20, y1: y + dy * 20, x2: x, y2: y };
      const outside = { ...touching, x2: x + dx * .001, y2: y + dy * .001 };
      const own = view.placeLabels([label], [], s, []);
      assert.deepEqual(view.placeLabels([label], [], s, [outside]), own);
      for (const line of [touching, { x1: x, y1: y, x2: touching.x1, y2: touching.y1 }]) {
        const placed = view.placeLabels([label], [], s, [line]);
        assert.notDeepEqual(placed, own);
        assertLinesClear([label], placed, [line], s);
      }
    }
    for (const line of [{ x1: 310, y1: 200, x2: 320, y2: 205 },
      { x1: 0, y1: 0, x2: 600, y2: 400 }, { x1: left, y1: 0, x2: left, y2: 420 }]) {
      const placed = view.placeLabels([label], [], s, [line]);
      assert.notDeepEqual(placed, view.placeLabels([label], [], s));
      assertLinesClear([label], placed, [line], s);
    }
  }
});

test('全候補が線・文字・つまみ・盤外でふさがると数字以外を隠し、例外を投げない', () => {
  const s = view.sizes(600), labels = [
    ...['法線', '鏡', '焦点', '光軸', 'スクリーン', 'ついたて', '空気', '水', 'ガラス']
      .map((text, i) => ({ id: 'mark-' + i, text, priority: 4, preferOwn: true })),
    ...['光源', 'かたむける', '物体', 'スクリーン', '焦点距離', 'ついたて', '見る人']
      .map((text, i) => ({ id: 'handle-' + i, text, priority: 1 })),
    { id: 'angle-name', text: '入射角', priority: 2, preferOwn: true },
    { id: 'image', text: '実像', priority: 3 },
  ].map(label => ({ ...label, x: 300, y: 210, fontSize: 20 }));
  const angle = { id: 'angle', text: '37°', x: 300, y: 210, fontSize: 21, priority: 0, fixed: true };
  const lines = Array.from({ length: 43 }, (_, i) => ({ x1: 0, y1: i * 10, x2: 600, y2: i * 10 }));
  const cover = { ...angle, id: 'cover', text: '0°', x: 0, y: 600, fontSize: 600 };
  for (const data of [
    { labels: [...labels, angle], circles: [], lines },
    { labels: [...labels, angle], circles: [{ x: 300, y: 210, r: 1000 }], lines: [] },
    { labels: [cover, ...labels, angle], circles: [], lines: [] },
    { labels: [...labels.map(label => ({ ...label, x: -1000, y: -1000 })), angle], circles: [], lines: [] },
  ]) {
    let placed;
    assert.doesNotThrow(() => { placed = view.placeLabels(data.labels, data.circles, s, data.lines); });
    data.labels.forEach((label, i) => assert.equal(placed[i].hidden, !label.fixed, label.id));
  }
  assert.deepEqual(view.placeLabels([angle], [], s, lines), view.placeLabels([angle], [], s));
});

test('優先順位が小さい文字を先に置き、返す順序は入力と同じ', () => {
  const labels = [{ id: 'low', text: '光軸', x: 300, y: 210, priority: 3, fontSize: 20 },
    { id: 'high', text: '光源', x: 300, y: 210, priority: 1, fontSize: 20 }];
  const placed = view.placeLabels(labels, [], view.sizes(600));
  assert.equal(placed[1].anchor, 'start'); assert.equal(placed[1].x, 318);
  assert.equal(placed[0].anchor, 'end'); assert.equal(placed[0].x, 282);
  assertClear(labelBoxes(labels, placed));
});

test('固定した角度の箱を予約して、つまみの文字を別の候補へ置く', () => {
  const labels = [{ id: 'handle', text: '光源', x: 300, y: 210, priority: 1, fontSize: 20 },
    { id: 'angle', text: '37°', x: 320, y: 218, priority: 0, fontSize: 20, anchor: 'start', fixed: true }];
  const placed = view.placeLabels(labels, [], view.sizes(600));
  assert.equal(placed[1].x, 320); assert.equal(placed[1].y, 218);
  assert.equal(placed[0].anchor, 'end');
  assertClear(labelBoxes(labels, placed));
});

test('固定した角度が端に来た場合も、文字の箱を盤内に収める', () => {
  const labels = [{ id: 'angle', text: '0°', x: 0, y: 0, priority: 0, fontSize: 36, anchor: 'end', fixed: true }];
  const placed = view.placeLabels(labels, [], view.sizes(319));
  assert.equal(placed[0].hidden, false);
  assertClear(labelBoxes(labels, placed));
});

test('端へ寄せた角度と次の角度が重なっても、両方の箱を重ねずに表示する', () => {
  const s = view.sizes(319);
  for (const point of [{ x: 0, y: 0 }, { x: 600, y: 420 }]) {
    const labels = [
      { id: 'angle-in', text: '0°', ...point, fontSize: s.angleSize, anchor: 'middle', fixed: true },
      { id: 'angle-out', text: '0°', ...point, fontSize: s.angleSize, anchor: 'middle', fixed: true },
    ];
    const placed = view.placeLabels(labels, [], s);
    assert.ok(placed.every(p => !p.hidden));
    assertClear(labelBoxes(labels, placed));
  }
});

test('0.5° 以上で数字の箱が重なるときだけ out を反対側へ移す', () => {
  for (const width of [319, 612]) for (const tilt of [-39.89, -12.34, 0, 27.5, 40]) {
    for (const valueDeg of [.5, 1, 44, 45, 60, 89]) for (const sign of [-1, 1]) {
      const board = boards.get('reflect'), s = view.sizes(width), result = scene.trace(board.scene);
      result.angles.forEach(angle => Object.assign(angle,
        { valueDeg, fromDeg: tilt - 90, toDeg: tilt - 90 + sign * valueDeg }));
      const data = boardView.labelData(board, result, s), placed = view.placeLabels(data.labels, data.obstacles, s);
      const incoming = data.labels.find(label => label.id === 'angle-in');
      const outgoing = data.labels.find(label => label.id === 'angle-out');
      const normal = (tilt - 90) * Math.PI / 180;
      const side = p => Math.sign(Math.cos(normal) * (p.y - 270) - Math.sin(normal) * (p.x - 300));
      assert.equal(side(incoming), sign); assert.equal(side(outgoing), -sign);
      assert.ok(placed.filter(p => ['angle-in', 'angle-out'].includes(p.id)).every(p => !p.hidden));
      assertClear(labelBoxes(data.labels, placed).filter(box => ['angle-in', 'angle-out'].includes(box.id)));
    }
  }
  const s = view.sizes(612), incoming = { text: '60°', fontSize: s.angleSize, x: 0, y: 0 };
  const angle = { key: 'out', valueDeg: 60, vertex: { x: 300, y: 270 }, fromDeg: -90, toDeg: -30 };
  assert.deepEqual(view.angleLabel(angle, s, incoming), view.angleLabel(angle, s));
});

test('鏡の傾き −40〜40°（小数を含む）・入射角 0〜2° で数字を隠さず、箱を重ねない', () => {
  const tilts = [...Array.from({ length: 81 }, (_, i) => i - 40), -39.89, -12.34, .01, 27.5];
  for (const width of [319, 612]) for (const tilt of tilts) {
    for (const degrees of [0, .01, .25, .49, 1, 2]) for (const sign of [-1, 1]) {
      const board = boards.get('reflect'), s = view.sizes(width);
      const mirror = board.scene.elements.find(e => e.type === 'mirror');
      mirror.tiltDeg = tilt;
      const radians = (tilt - 90 + sign * degrees) * Math.PI / 180;
      board.scene = scene.moveElement(board.scene, 'src', 'move', {
        x: mirror.x + 160 * Math.cos(radians), y: mirror.y + 160 * Math.sin(radians),
      });
      assert.deepEqual(scene.validateScene(board.scene), []);
      const result = scene.trace(board.scene), data = boardView.labelData(board, result, s);
      assert.ok(Math.abs(result.measures.incidenceDeg - degrees) < 1e-8);
      const placed = view.placeLabels(data.labels, data.obstacles, s);
      for (const id of ['angle-in', 'angle-out']) {
        assert.equal(placed.find(p => p.id === id).hidden, false, `${width}px・${tilt}°・${sign * degrees}°・${id}`);
      }
      assertClear(labelBoxes(data.labels, placed).filter(box => ['angle-in', 'angle-out'].includes(box.id)));
    }
  }
});

test('同じ側で重なる角度は out を反対側へ移し、候補がふさがっても数字を隠さない', () => {
  const board = boards.get('reflect'), result = scene.trace(board.scene), s = view.sizes(612);
  // 同じ側の角度データを渡し、巨大な障害物ですべての候補をふさぐ。
  result.angles.forEach(angle => Object.assign(angle, { valueDeg: 60, fromDeg: -90, toDeg: -30 }));
  const data = boardView.labelData(board, result, s);
  const placed = view.placeLabels(data.labels, [{ x: 300, y: 210, r: 1000 }], s);
  for (const angle of result.angles) {
    const p = placed.find(p => p.id === 'angle-' + angle.key);
    const expected = view.angleLabel(angle, s, data.labels.find(label => label.id === 'angle-in'));
    assert.equal(p.hidden, false);
    assert.equal(p.x, expected.x); assert.equal(p.y, expected.y); assert.equal(p.anchor, expected.anchor);
    assert.equal(placed.find(p => p.id === 'angle-name-' + angle.key).hidden, true);
  }
  const incoming = placed.find(p => p.id === 'angle-in'), outgoing = placed.find(p => p.id === 'angle-out');
  assert.ok(incoming.x > 300 && outgoing.x < 300);
  assertClear(labelBoxes(data.labels, placed).filter(box => ['angle-in', 'angle-out'].includes(box.id)));
  const oversized = { id: 'angle', text: '0°', x: 300, y: 210, fontSize: 1000, fixed: true };
  assert.deepEqual(view.placeLabels([oversized], [], s)[0],
    { id: 'angle', x: 300, y: 210, anchor: 'start', hidden: false });
});

test('preferOwn は文字の左下を元の点に合わせ、はみ出し・先の文字・つまみを避ける', () => {
  const label = { id: 'mark', text: '法線', x: 100, y: 100, fontSize: 20, priority: 4, preferOwn: true };
  const s = view.sizes(612);
  assert.deepEqual(view.placeLabels([label], [], s), [
    { id: 'mark', x: 100, y: 100, anchor: 'start', hidden: false },
  ]);
  for (const point of [{ x: 599, y: 210 }, { x: 100, y: 0 }, { x: -5, y: 210 }, { x: 100, y: 420 }]) {
    const labels = [{ ...label, ...point }], placed = view.placeLabels(labels, [], s);
    assert.equal(placed[0].hidden, false);
    assert.ok(placed[0].x !== point.x || placed[0].y !== point.y || placed[0].anchor !== 'start');
    assertClear(labelBoxes(labels, placed));
  }
  const labels = [{ ...label, id: 'angle', priority: 0, fixed: true }, label];
  const placed = view.placeLabels(labels, [], s);
  assert.equal(placed[1].hidden, false);
  assert.ok(placed[1].x !== label.x || placed[1].y !== label.y || placed[1].anchor !== 'start');
  assertClear(labelBoxes(labels, placed));
  const obstacle = { x: 110, y: 95, r: 8 }, moved = view.placeLabels([label], [obstacle], s)[0];
  assert.equal(moved.hidden, false);
  assert.ok(moved.x !== label.x || moved.y !== label.y || moved.anchor !== 'start');
  const box = view.labelBox({ ...label, ...moved });
  assert.ok(Math.hypot(obstacle.x - Math.max(box.left, Math.min(box.right, obstacle.x)),
    obstacle.y - Math.max(box.top, Math.min(box.bottom, obstacle.y))) >= obstacle.r);
  assert.equal(view.placeLabels([label], [{ x: 100, y: 100, r: 1000 }], s)[0].hidden, true);
});

test('光・音の盤の初期配置・幅 612px で、空いている marks は markBox を盤内へ寄せた位置を使う', () => {
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const { id } of boards.list().filter(board => ['light', 'sound'].includes(board.unit))) {
    const board = boards.get(id), result = scene.trace(board.scene), s = view.sizes(612);
    const data = boardView.labelData(board, result, s), placed = view.placeLabels(data.labels, data.obstacles, s);
    let ownCount = 0;
    data.labels.forEach((label, index) => {
      if (!label.id.startsWith('mark-')) return;
      const mark = result.marks.find(mark => label.id === 'mark-' + mark.key);
      const own = view.markBox(mark, s);
      const x = Math.max(0, Math.min(600 - own.width, own.x));
      const y = Math.max(0, Math.min(420 - own.height, own.y)) + s.textSize;
      assert.equal(label.preferOwn, true); assert.equal(label.x, x); assert.equal(label.y, y);
      const box = view.labelBox({ ...label, anchor: 'start' });
      const previous = data.labels.flatMap((other, i) => !placed[i].hidden && (result.sound ?
        other.text.length > label.text.length || (other.text.length === label.text.length && i < index) :
        other.priority < label.priority || (other.priority === label.priority && i < index)) ?
        [view.labelBox({ ...other, ...placed[i] })] : []);
      const clear = box.left >= 0 && box.right <= 600 && box.top >= 0 && box.bottom <= 420 &&
        !previous.some(other => overlap(box, other)) && !data.obstacles.some(other => Number.isFinite(other.left) && overlap(box, other)) && !data.obstacles.some(circle => Math.hypot(
          circle.x - Math.max(box.left, Math.min(box.right, circle.x)),
          circle.y - Math.max(box.top, Math.min(box.bottom, circle.y))) < circle.r);
      if (clear) {
        ownCount++;
        assert.deepEqual(placed[index], { id: label.id, x, y, anchor: 'start', hidden: false });
      }
    });
    assert.ok(ownCount > 0, id);
  }
});

test('lineData は6盤の面と軸だけを描画と同じ座標で返し、入力を書き換えない', () => {
  const expected = {
    straight: [[280, 180, 280, 240], [550, 20, 550, 400]],
    reflect: [[120, 270, 480, 270], [300, 370, 300, 80]],
    'mirror-image': [[340, 20, 340, 400]],
    refract: [[0, 210, 600, 210], [300, 310, 300, 20]],
    lens: [[20, 210, 580, 210], [300, 60, 300, 360]],
    'lens-image': [[20, 210, 580, 210], [300, 60, 300, 360], [450, 30, 450, 390]],
  };
  for (const { id } of boards.list().filter(board => board.unit === 'light')) {
    const board = boards.get(id), result = scene.trace(board.scene), before = structuredClone({ board, result });
    const lines = boardView.lineData(board.scene, result);
    assert.equal(lines.length, expected[id].length, id);
    lines.forEach((line, i) => ['x1', 'y1', 'x2', 'y2'].forEach((key, j) =>
      assert.ok(Math.abs(line[key] - expected[id][i][j]) < 1e-8, id + ': ' + key)));
    assert.deepEqual({ board, result }, before);
    // 光線・延長線・弧の終点・像は、避ける線分に追加しない。
    result.rays = [{ x1: 1, y1: 2, x2: 3, y2: 4, style: 'solid' },
      { x1: 5, y1: 6, x2: 7, y2: 8, style: 'dashed' }];
    result.angles.forEach(angle => { angle.toDeg += 10; });
    result.images.push({ x: 100, y: 200, height: 30, kind: 'real' });
    assert.deepEqual(boardView.lineData(board.scene, result), lines);
  }
  for (const tilt of [-40, 40]) {
    const board = boards.get('reflect'), mirror = board.scene.elements.find(e => e.type === 'mirror');
    mirror.tiltDeg = tilt;
    const lines = boardView.lineData(board.scene, scene.trace(board.scene));
    const t = tilt * Math.PI / 180, dx = Math.cos(t), dy = Math.sin(t);
    const expected = [[300 - dx * 180, 270 - dy * 180, 300 + dx * 180, 270 + dy * 180],
      [300 - dy * 100, 270 + dx * 100, 300 + dy * 190, 270 - dx * 190]];
    lines.forEach((line, i) => ['x1', 'y1', 'x2', 'y2'].forEach((key, j) =>
      assert.ok(Math.abs(line[key] - expected[i][j]) < 1e-8)));
  }
});

test('幅319pxの光軸・スクリーンは、盤内への補正や候補変更のあとも線と交わらない', () => {
  for (const [id, target] of [['lens-image', 'mark-axis'], ['straight', 'mark-screen']]) {
    const board = boards.get(id), s = view.sizes(319), result = scene.trace(board.scene);
    const data = boardView.labelData(board, result, s), lines = boardView.lineData(board.scene, result);
    const placed = view.placeLabels(data.labels, data.obstacles, s, lines);
    assert.ok(data.labels.some(label => label.id === target));
    const old = view.placeLabels(data.labels, data.obstacles, s);
    assert.ok(labelBoxes(data.labels, old).filter(box => box.id === target)
      .some(box => lines.some(line => crossesLine(box, line, 3 * s.unitPerPx))));
    assertLinesClear(data.labels, placed, lines, s);
  }
});

test('幅375pxのかたむける・右の焦点は、鏡の線とつまみの円に重ならない', () => {
  for (const [id, tilt] of [['reflect', 0], ['reflect', -40], ['reflect', 40], ['lens-image', 0]]) {
    const board = boards.get(id), s = view.sizes(375);
    if (id === 'reflect') board.scene.elements.find(e => e.type === 'mirror').tiltDeg = tilt;
    const result = scene.trace(board.scene), data = boardView.labelData(board, result, s);
    const lines = boardView.lineData(board.scene, result), placed = view.placeLabels(data.labels, data.obstacles, s, lines);
    const target = id === 'reflect' ? 'handle-mirror:tilt' : 'mark-focus-right';
    assert.ok(data.labels.some(label => label.id === target));
    assertLinesClear(data.labels, placed, lines, s);
    for (const box of labelBoxes(data.labels, placed).filter(box => box.id === target)) assertCirclesClear(box, data.obstacles);
  }
});

for (const width of [264, 319, 375, 612, 1100]) {
  for (const { id } of boards.list()) {
    test(`${id}: 幅 ${width}px の初期配置で文字が線・円・文字に重ならず盤内に収まる`, () => {
      const board = boards.get(id), result = scene.trace(board.scene, { compact: width < 420, widthPx: width }), s = view.sizes(width);
      const data = boardView.labelData(board, result, s);
      const lines = boardView.lineData(board.scene, result), before = structuredClone({ data, lines });
      const placed = view.placeLabels(data.labels, data.obstacles, s, lines);
      const boxes = labelBoxes(data.labels, placed);
      assert.ok(boxes.length > 0);
      assertClear(boxes);
      assertLinesClear(data.labels, placed, lines, s);
      data.labels.forEach((label, i) => {
        assert.equal(label.priority, label.id.startsWith('angle-name') ? 2 : label.id.startsWith('angle') || label.id.startsWith('tick-') ? 0 :
          label.id.startsWith('handle') || label.id === 'mark-force' ? 1 : label.id.startsWith('image') ? 3 : 4);
        if (label.fixed) assert.equal(placed[i].hidden, false);
        if (width >= 612 && (label.id.startsWith('mark-') || label.id.startsWith('handle-'))) {
          assert.equal(placed[i].hidden, false, id + ': ' + label.text);
        }
        if (label.fixed || placed[i].hidden) return;
        const box = boxes.find(b => b.id === label.id);
        assertCirclesClear(box, data.obstacles);
      });
      for (const angle of result.angles) {
        const label = data.labels.find(l => l.id === 'angle-' + angle.key);
        const expected = view.angleLabel(angle, s);
        assert.equal(label.x, expected.x); assert.equal(label.y, expected.y); assert.equal(label.anchor, expected.anchor);
      }
      assert.deepEqual({ data, lines }, before);
    });
  }
}

for (const width of [319, 612]) for (const { id } of boards.list()) {
  test(`${id}: 幅 ${width}px で各つまみと全つまみを四隅へ動かしても線を避ける`, () => {
    const s = view.sizes(width), initial = boards.get(id);
    const handles = scene.handles(initial.scene);
    for (const x of [0, 600]) for (const y of [0, 420]) for (const moving of [...handles.map(h => [h]), handles]) {
      const board = boards.get(id);
      for (const handle of moving) board.scene = scene.moveElement(board.scene, handle.elementId, handle.handle, { x, y });
      assert.deepEqual(scene.validateScene(board.scene), []);
      let data, lines, placed;
      assert.doesNotThrow(() => {
        const result = scene.trace(board.scene, { compact: width < 420, widthPx: width });
        data = boardView.labelData(board, result, s);
        lines = boardView.lineData(board.scene, result);
        placed = view.placeLabels(data.labels, data.obstacles, s, lines);
      });
      assertLinesClear(data.labels, placed, lines, s);
      data.labels.forEach((label, i) => { if (label.fixed) assert.equal(placed[i].hidden, false); });
      const boxes = labelBoxes(data.labels, placed).filter(box => !data.labels.find(label => label.id === box.id).fixed);
      assertClear(boxes);
      for (const box of boxes) assertCirclesClear(box, data.obstacles);
    }
  });
}

// 実ブラウザの描画は別に確認する。ここでは DOM の最小の代役でイベントの連携を検査する。
function screen(search = '', width = 600, options = {}) {
  const listeners = new Map();
  const docListeners = new Map(), frames = new Map(), timers = new Map(), audios = [], saved = [], revoked = [];
  let time = 0, serial = 0;
  const mutations = [];
  const doc = { readyState: 'loading', hidden: false,
    addEventListener(name, listener) { if (!docListeners.has(name)) docListeners.set(name, new Set()); docListeners.get(name).add(listener); },
    removeEventListener(name, listener) { docListeners.get(name)?.delete(listener); },
  };
  class Audio {
    constructor() { this.calls = []; audios.push(this); }
    play() { this.calls.push('play'); return options.blocked ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    pause() { this.calls.push('pause'); }
  }
  class Element {
    constructor(tag) {
      this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attributes = {};
      this.events = {}; this.style = {}; this.hidden = false; this.className = ''; this.content = '';
      this.classList = { add: name => { this.className += ' ' + name; } };
    }
    setAttribute(key, value) { mutations.push({ method: 'setAttribute', element: this, key }); this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
    removeAttribute(key) { mutations.push({ method: 'removeAttribute', element: this, key }); delete this.attributes[key]; }
    appendChild(child) { mutations.push({ method: 'appendChild', element: this }); child.parent = this; this.children.push(child); return child; }
    removeChild(child) {
      mutations.push({ method: 'removeChild', element: this });
      this.children = this.children.filter(el => el !== child); child.parent = null; return child;
    }
    replaceChildren(...children) { mutations.push({ method: 'replaceChildren', element: this }); this.children.forEach(child => { child.parent = null; }); this.children = []; this.content = ''; children.forEach(child => this.appendChild(child)); }
    set textContent(value) { mutations.push({ method: 'textContent', element: this }); this.replaceChildren(); this.content = String(value); }
    get textContent() { return this.content + this.children.map(child => child.textContent).join(''); }
    addEventListener(name, listener) { (this.events[name] ||= []).push(listener); }
    dispatch(name, props = {}) {
      const event = { button: 0, preventDefault() {}, ...props };
      (this.events[name] || []).forEach(listener => listener(event));
    }
    remove() { if (this.parent) this.parent.removeChild(this); }
    focus() { doc.activeElement = this; }
    getBoundingClientRect() {
      const measured = this.style.display === 'none' ? 0 : width;
      return { left: 20, top: 40, width: measured, height: measured * 420 / 600 };
    }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
  }
  doc.createElement = tag => { mutations.push({ method: 'createElement' }); return new Element(tag); };
  doc.createElementNS = (_, tag) => { mutations.push({ method: 'createElementNS' }); return new Element(tag); };
  const win = { location: new URL('file:///app/index.html' + search), navigator: { onLine: true }, console,
    Audio, performance: { now: () => time },
    URL: { createObjectURL: () => 'blob:' + (++serial), revokeObjectURL: url => revoked.push(url) },
    fetch: options.fetch || (async () => ({ ok: true, blob: async () => ({}) })),
    localStorage: { getItem: () => options.saved || null, setItem: (_, value) => {
      if (options.storageBlocked) throw new Error('保存できない'); saved.push(JSON.parse(value));
    } },
    matchMedia: () => ({ matches: !!options.reduced }),
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    history: { pushState(_, __, url) { win.location = new URL(url); } }, scrollTo() {},
  };
  doc.defaultView = win;
  const host = new Element('main');
  const context = vm.createContext({ document: doc, URL, Hikari: { config: require('../js/config.js'),
    scriptsBio2: require('../content/scripts-bio2.js'), voiceDataBio2: require('../content/voice-bio2.js'),
    scriptsBio1: require('../content/scripts-bio1.js'), voiceDataBio1: require('../content/voice-bio1.js'),
    scriptsForce: require('../content/scripts-force.js'), voiceDataForce: require('../content/voice-force.js'),
    scriptsSound: require('../content/scripts-sound.js'), voiceDataSound: require('../content/voice-sound.js'),
    scripts: require('../content/scripts-light.js'), voiceData: options.voiceData || require('../content/voice-light.js'),
    explain: options.explain || require('../js/explain.js'), prefs: require('../js/prefs.js'), voice: options.voice || require('../js/voice.js'),
    geometry: require('../js/geometry.js'), viewMath: options.viewMath || view, boards: options.boards || boards,
    scene: options.scene || scene, entry: require('../js/entry.js') } });
  for (const file of ['board-view', 'app']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + file + '.js'), 'utf8'), context);
  function find(predicate, parent = host) {
    if (predicate(parent)) return parent;
    for (const child of parent.children) { const match = find(predicate, child); if (match) return match; }
    return null;
  }
  return { host, win, doc, api: context.Hikari, find, audios, saved, revoked, frames, timers, mutations,
    resize: value => { width = value; for (const listener of listeners.get('resize') || []) listener(); },
    advance: ms => {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time && timers.has(id)) { timers.delete(id); timer.fn(); }
      const pending = [...frames]; frames.clear(); pending.forEach(([, fn]) => fn(time));
    },
    visibility: hidden => { doc.hidden = hidden; for (const listener of docListeners.get('visibilitychange') || []) listener(); },
    fire: name => { for (const listener of listeners.get(name) || []) listener(); },
    button: text => find(el => el.tagName === 'button' && el.textContent.includes(text)),
  };
}

for (const { id } of boards.list()) {
  test(`${id}: SVG を描き、つまみ・矢印・文字を用意する`, () => {
    const ui = screen(), board = boards.get(id);
    const renderer = ui.api.boardView.create(ui.host, board);
    assert.equal(ui.find(el => el.tagName === 'svg').attributes.viewBox, '0 0 600 420');
    assert.ok(ui.find(el => el.tagName === (id.startsWith('bio-') ? 'image' : 'polygon')));
    for (const handle of scene.handles(board.scene)) {
      const knob = ui.find(el => el.attributes['data-element-id'] === handle.elementId && el.attributes['data-handle'] === handle.handle);
      assert.equal(knob.attributes.tabindex, '0');
      assert.equal(knob.attributes['aria-label'], handle.label);
    }
    renderer.destroy(); assert.equal(ui.host.children.length, 0);
  });
}

test('9 盤の見出し・吹き出し・SVG をカード内にこの順で描く', () => {
  for (const { id } of boards.list()) {
    const ui = screen('?board=' + id); ui.api.app.start(ui.host);
    const heading = ui.find(el => el.className === 'board-heading');
    const stage = ui.find(el => el.className === 'board-stage');
    const svg = ui.find(el => el.tagName === 'svg');
    assert.equal(heading.tagName, 'h2'); assert.equal(heading.textContent, boards.get(id).heading);
    assert.equal(heading.parent, stage.parent);
    const speech = ui.find(el => el.className === 'speech');
    assert.equal(heading.parent.children.indexOf(heading) + 1, heading.parent.children.indexOf(speech));
    assert.equal(heading.parent.children.indexOf(speech) + 1, heading.parent.children.indexOf(stage));
    assert.ok(!svg.textContent.includes(boards.get(id).heading));
  }
});

test('描画した文字は配置計算の位置・大きさと一致し、ふち取りの倍率を固定する', () => {
  for (const width of [319, 375, 612]) for (const { id } of boards.list()) {
    const ui = screen('', width), board = boards.get(id), s = view.sizes(width), result = scene.trace(board.scene, { compact: width < 420, widthPx: width });
    ui.api.boardView.create(ui.host, board);
    const data = boardView.labelData(board, result, s);
    const placed = view.placeLabels(data.labels, data.obstacles, s, boardView.lineData(board.scene, result));
    const rendered = [];
    function collect(el) { if (el.tagName === 'text' && !['knob-mark', 'picture-error'].includes(el.attributes.class)) rendered.push(el); el.children.forEach(collect); }
    collect(ui.host);
    assert.equal(rendered.length, placed.filter(p => !p.hidden).length);
    let index = 0;
    placed.forEach((p, i) => {
      if (p.hidden) return;
      const actual = rendered[index++], label = data.labels[i];
      assert.equal(actual.textContent, label.text);
      assert.equal(Number(actual.attributes.x), p.x); assert.equal(Number(actual.attributes.y), p.y);
      assert.equal(actual.attributes['text-anchor'], p.anchor);
      assert.equal(Number(actual.attributes['font-size']), label.fontSize);
      assert.equal(actual.attributes['vector-effect'], 'non-scaling-stroke');
    });
  }
});

test('実際の SVG も幅 419px と 420px で線幅と光線の矢印を切り替える', () => {
  for (const width of [419, 420]) for (const id of ['reflect', 'refract', 'lens-image', 'mirror-image']) {
    const ui = screen('', width), board = boards.get(id), s = view.sizes(width);
    ui.api.boardView.create(ui.host, board);
    const result = scene.trace(board.scene), rays = [], arrows = [];
    function collect(el) {
      if (el.tagName === 'line' && el.attributes.stroke === '#B45C00') rays.push(el);
      if (el.tagName === 'polygon' && el.attributes.fill === '#B45C00') arrows.push(el);
      el.children.forEach(collect);
    }
    collect(ui.host);
    assert.equal(rays.length, result.rays.length);
    rays.forEach(ray => assert.equal(Number(ray.attributes['stroke-width']), s.rayWidth));
    const expected = result.rays.map(ray => view.arrowAt(ray, s)).filter(Boolean);
    assert.equal(arrows.length, expected.length);
    arrows.forEach((arrow, i) => {
      const points = arrow.attributes.points.split(' ').map(point => point.split(',').map(Number));
      const tip = points[0], base = [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2];
      assert.ok(Math.abs(Math.hypot(tip[0] - base[0], tip[1] - base[1]) / s.unitPerPx - (width < 420 ? 14 : 16)) < 1e-10);
      assert.ok(Math.abs(Math.hypot(points[1][0] - points[2][0], points[1][1] - points[2][1]) / s.unitPerPx -
        (width < 420 ? 11 : 13)) < 1e-10);
      assert.ok(Math.abs((tip[0] + base[0]) / 2 - expected[i].x) < 1e-10);
      assert.ok(Math.abs((tip[1] + base[1]) / 2 - expected[i].y) < 1e-10);
    });
    if (id === 'reflect') assert.ok(ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#1B2430' &&
      Number(el.attributes['stroke-width']) === s.surfaceWidth));
    if (id === 'refract') assert.ok(ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#176AA3' &&
      Number(el.attributes['stroke-width']) === s.surfaceWidth));
    if (result.angles.length) {
      assert.ok(ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#67748B' &&
        Number(el.attributes['stroke-width']) === s.thinWidth));
      assert.ok(ui.find(el => el.tagName === 'path' && el.attributes['fill-opacity'] === '0.1' &&
        Number(el.attributes['stroke-width']) === s.thinWidth));
    }
  }
});

test('アプリは現在の盤の高さ・焦点距離で倍率を読み出す', () => {
  for (const [id, type, key, value, expected] of [
    ['straight', 'blocker', 'height', 50, '影の大きさ ついたての 2.4 倍'],
    ['lens-image', 'lens', 'focalLength', 80, '物体の位置 焦点距離の 2.5 倍'],
  ]) {
    const ui = screen('?board=' + id);
    ui.api.boards = { ...boards, get(boardId) {
      const board = boards.get(boardId); board.scene.elements.find(e => e.type === type)[key] = value; return board;
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'),
      { document: ui.doc, URL, Hikari: ui.api });
    ui.api.app.start(ui.host);
    assert.ok(ui.find(el => el.className === 'readout').textContent.includes(expected));
  }
});

test('最初の指だけを追い、盤の外でも追跡し、cancel で放す', () => {
  const ui = screen(), board = boards.get('straight');
  ui.api.boardView.create(ui.host, board);
  const svg = ui.find(el => el.tagName === 'svg');
  const source = ui.find(el => el.attributes['data-element-id'] === 'src');
  const blocker = ui.find(el => el.attributes['data-element-id'] === 'blocker');
  source.dispatch('pointerdown', { pointerId: 1 });
  blocker.dispatch('pointerdown', { pointerId: 2 });
  svg.dispatch('pointermove', { pointerId: 2, clientX: 500, clientY: 150 });
  assert.equal(board.scene.elements[0].x, 80);
  svg.dispatch('pointerup', { pointerId: 2 });
  svg.dispatch('pointermove', { pointerId: 1, clientX: -1000, clientY: -1000 });
  assert.equal(board.scene.elements[0].x, 20);
  assert.equal(board.scene.elements[0].y, 20);
  assert.equal(svg.capture, 1);
  assert.equal(ui.find(el => el.attributes['data-element-id'] === 'src'), source);
  svg.dispatch('pointercancel', { pointerId: 1 });
  svg.dispatch('pointermove', { pointerId: 1, clientX: 150, clientY: 150 });
  assert.equal(board.scene.elements[0].x, 20);
  assert.equal(svg.capture, null);
  source.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(board.scene.elements[0].x, 24);
  source.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(board.scene.elements[0].y, 24);
});

test('不正なシーンを描かず、理由を示し、配置を戻すと復帰する', () => {
  const ui = screen(), board = boards.get('reflect');
  const renderer = ui.api.boardView.create(ui.host, board);
  renderer.setScene({ ...board.scene, elements: [] });
  assert.equal(ui.find(el => el.tagName === 'svg').style.display, 'none');
  assert.ok(ui.host.textContent.includes('この図は表示できません'));
  assert.equal(ui.find(el => el.attributes['data-element-id']), null);
  renderer.setScene(boards.get('reflect').scene);
  assert.equal(ui.find(el => el.tagName === 'svg').style.display, '');
});

for (const { id } of boards.list()) {
  const changes = [
    ['elements={}', current => ({ ...current, elements: {} })],
    ['elements=[null]', current => ({ ...current, elements: [null] })],
    ['elements=[]', current => ({ ...current, elements: [] })],
    ['scene=null', () => null],
  ];
  if (id.startsWith('sound-')) {
    const key = { 'sound-wave': 'frequencyHz', 'sound-string': 'lengthPercent', 'sound-speed': 'distance' }[id];
    const offStep = { 'sound-wave': 251, 'sound-string': 82, 'sound-speed': 700 }[id];
    for (const [name, value] of [['数字の文字列', '250'], ['範囲外', -1], ['きざみ外', offStep]]) {
      changes.push([name, current => {
        const next = structuredClone(current); next.elements.find(e => key in e)[key] = value; return next;
      }]);
    }
  }
  if (id.startsWith('force-')) {
    for (const [name, value] of [['数字の文字列', '3'], ['範囲外', 6], ['小数', 2.5]]) {
      changes.push([name, current => {
        const next = structuredClone(current);
        if (id === 'force-spring') next.options.weights = value;
        else next.elements.find(e => 'newtons' in e).newtons = value;
        return next;
      }]);
    }
  }
  if (id === 'refract') changes.push(
    ['options=null', current => ({ ...current, options: null })],
    ['options=x', current => ({ ...current, options: 'x' })]);
  for (const [name, corrupt] of changes) for (const initiallyInvalid of [true, false]) {
    test(`${id}: ${initiallyInvalid ? '初回' : '描き直し'}の ${name} でも判定をせず、初期化・一覧へ戻れる`, () => {
      const ui = screen('?board=' + id), calls = { readout: 0, controls: 0, check: 0, trace: 0 };
      let currentBoard;
      ui.api.scene = { ...scene, trace(current) {
        assert.deepEqual(scene.validateScene(current), []);
        calls.trace++; return scene.trace(current);
      } };
      ui.api.boards = { ...boards,
        get(boardId) {
          const board = boards.get(boardId);
          if (!currentBoard && boardId === id) {
            currentBoard = board;
            const descriptor = Object.getOwnPropertyDescriptor(board, 'controls');
            Object.defineProperty(board, 'controls', { configurable: true, get() {
              assert.deepEqual(scene.validateScene(board.scene), []);
              calls.controls++; return descriptor.get ? descriptor.get.call(board) : descriptor.value;
            } });
            if (initiallyInvalid) board.scene = corrupt(board.scene);
          }
          return board;
        },
        readout(boardId, measures, current) {
          assert.deepEqual(scene.validateScene(current), []);
          calls.readout++; return boards.readout(boardId, measures, current);
        },
        checkPrompt(prompt, measures, current) {
          assert.deepEqual(scene.validateScene(current), []);
          calls.check++; return boards.checkPrompt(prompt, measures, current);
        },
      };
      for (const file of ['board-view', 'app']) vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '../js/' + file + '.js'), 'utf8'),
        { document: ui.doc, URL, Hikari: ui.api });
      let app;
      assert.doesNotThrow(() => { app = ui.api.app.start(ui.host); });
      if (!initiallyInvalid) ui.button('説明をとばして、すぐ動かす').dispatch('click');
      if (initiallyInvalid) assert.deepEqual(calls, { readout: 0, controls: 0, check: 0, trace: 0 });
      else {
        assert.ok(calls.trace > 0 && calls.readout > 0 && calls.controls > 0 && calls.check > 0);
        currentBoard.scene = corrupt(currentBoard.scene);
      }
      const before = { ...calls };
      assert.doesNotThrow(() => ui.fire('resize'));
      assert.deepEqual(calls, before);
      const error = ui.find(el => el.className === 'board-error');
      assert.equal(error.hidden, false);
      assert.deepEqual(error.children.map(el => el.textContent),
        ['この図は表示できません', scene.validateScene(currentBoard.scene)[0]]);
      assert.equal(ui.find(el => el.tagName === 'svg').style.display, 'none');
      assert.equal(ui.find(el => el.attributes['data-element-id']), null);
      assert.equal(ui.find(el => el.className === 'readout').textContent, '');
      assert.equal(ui.find(el => el.className === 'controls').hidden, true);
      assert.equal(ui.find(el => el.className === 'controls').children.length, 0);
      assert.doesNotThrow(() => ui.button('はじめの配置にもどす').dispatch('click'));
      assert.deepEqual(scene.validateScene(currentBoard.scene), []);
      assert.equal(ui.find(el => el.tagName === 'svg').style.display, '');
      assert.equal(error.hidden, true);
      assert.equal(ui.find(el => el.className === 'readout').hidden, false);
      assert.ok(calls.trace > before.trace && calls.readout > before.readout && calls.controls > before.controls);
      if (id === 'refract') {
        assert.equal(ui.find(el => el.className === 'controls').hidden, false);
        ui.button('ガラス').dispatch('click');
        assert.ok(ui.button('ガラス → 空気')); assert.ok(ui.host.textContent.includes('できた！'));
      }
      currentBoard.scene = corrupt(currentBoard.scene); ui.fire('resize');
      ui.button('← ボード一覧').dispatch('click');
      assert.equal(ui.win.location.search, '');
      assert.equal(ui.find(el => el.className === 'board-error'), null);
      ui.button(boards.get(id).title).dispatch('click');
      assert.equal(ui.win.location.search, '?board=' + id);
      assert.equal(ui.find(el => el.tagName === 'svg').style.display, '');
      app.destroy();
    });
  }
}

test('レンズの SVG の上下端は光線の通過判定と同じ半分の高さを使う', () => {
  const config = require('../js/config.js');
  for (const id of ['lens', 'lens-image']) {
    const ui = screen(), board = boards.get(id), lens = board.scene.elements.find(e => e.type === 'lens');
    ui.api.boardView.create(ui.host, board);
    const shape = ui.find(el => el.tagName === 'path' && el.attributes['fill-opacity'] === '0.08');
    const values = shape.attributes.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.deepEqual([values[0], values[1]], [lens.x, lens.y - config.lensHalfHeight]);
    assert.deepEqual([values[4], values[5]], [lens.x, lens.y + config.lensHalfHeight]);
    assert.deepEqual([values[8], values[9]], [lens.x, lens.y - config.lensHalfHeight]);
  }
});

test('焦点の文字を動かしても、焦点の点は光軸上の焦点距離の位置に描く', () => {
  for (const width of [319, 612]) for (const id of ['lens', 'lens-image']) for (const focalLength of [60, 100, 160]) {
    const ui = screen('', width), board = boards.get(id), lens = board.scene.elements.find(e => e.type === 'lens');
    lens.focalLength = focalLength;
    const renderer = ui.api.boardView.create(ui.host, board), dots = [];
    function collect(el) {
      if (el.tagName === 'circle' && el.attributes.cx !== undefined) dots.push(el);
      el.children.forEach(collect);
    }
    collect(ui.host);
    assert.equal(dots.length, 2);
    dots.forEach((dot, i) => {
      assert.equal(Number(dot.attributes.cx), lens.x + (i === 0 ? -1 : 1) * lens.focalLength);
      assert.equal(Number(dot.attributes.cy), lens.y);
      assert.equal(Number(dot.attributes.r), 4 * view.sizes(width).unitPerPx);
    });
    renderer.destroy();
  }
});

test('つまみのフォーカスは focus-visible の丸い青線で、画面上の太さを 3px に固定する', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8');
  assert.match(css, /\.board-svg \.handle\s*\{[^}]*outline:\s*none;/);
  assert.match(css, /\.board-svg \.handle:focus-visible\s*\{[^}]*outline:\s*none;/);
  assert.match(css, /\.board-svg \.handle:focus-visible \.knob\s*\{[^}]*stroke:\s*#1A5CFF;[^}]*stroke-width:\s*3px;/);
  assert.doesNotMatch(css, /\.handle:focus(?!-visible)[^{]*\.knob\s*\{/);
  for (const width of [319, 612]) {
    const ui = screen('', width); ui.api.boardView.create(ui.host, boards.get('reflect'));
    const knob = ui.find(el => el.attributes.class === 'knob');
    assert.equal(knob.tagName, 'circle');
    assert.equal(knob.attributes['vector-effect'], 'non-scaling-stroke');
  }
});

test('課題の達成は操作と初期化で消さず、盤を開き直すと消す', () => {
  const ui = screen('?board=refract');
  const app = ui.api.app.start(ui.host);
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  ui.button('ガラス').dispatch('click');
  assert.ok(ui.host.textContent.includes('できた！'));
  assert.ok(ui.button('ガラス → 空気'));
  ui.button('はじめの配置にもどす').dispatch('click');
  assert.ok(ui.host.textContent.includes('できた！'));
  assert.equal(ui.button('水 → 空気').attributes['aria-pressed'], 'false');
  assert.equal(ui.button('空気 → 水').attributes['aria-pressed'], 'true');
  ui.button('← ボード一覧').dispatch('click');
  assert.equal(ui.win.location.search, '');
  ui.button('屈折・全反射').dispatch('click');
  assert.equal(ui.win.location.search, '?board=refract');
  assert.ok(!ui.host.textContent.includes('できた！'));
  ui.win.location = new URL('file:///app/index.html?board=lens'); ui.fire('popstate');
  assert.ok(ui.host.textContent.includes('平行な光が集まる所をさがそう'));
  ui.win.navigator.onLine = false; ui.fire('offline');
  assert.ok(ui.host.textContent.includes('オフライン（このまま使えます）'));
  ui.win.navigator.onLine = true; ui.fire('online');
  assert.ok(ui.host.textContent.includes('オンライン'));
  app.destroy(); assert.equal(ui.host.children.length, 0);
});

test('不正な URL の文字を描画せず、ホームに知らせる', () => {
  for (const search of ['?board=%3Cscript%3E', '?board=', '?board=sound-wave&board=sound-speed', '?board=' + 'x'.repeat(1000)]) {
    const ui = screen(search); ui.api.app.start(ui.host);
    assert.ok(ui.host.textContent.includes('指定された盤が見つかりませんでした'));
    assert.ok(!ui.host.textContent.includes('<script>'));
    assert.ok(!ui.host.textContent.includes('x'.repeat(1000)));
    assert.ok(ui.button('実像と虚像')); assert.ok(ui.button('音の大きさと高さ'));
  }
});

test('file:// の履歴変更を拒む環境でも、盤の URL に移動する', () => {
  const ui = screen(); ui.api.app.start(ui.host);
  ui.win.history.pushState = () => { throw new Error('SecurityError'); };
  ui.button('実像と虚像').dispatch('click');
  assert.equal(ui.win.location.search, '?board=lens-image');
});

// 説明の画面は同じ模擬 DOM に、音声と requestAnimationFrame の時計を渡して確かめる。
const scripts = require('../content/scripts-light.js');
const scriptsSound = require('../content/scripts-sound.js');
const scriptsForce = require('../content/scripts-force.js');
const scriptsBio1 = require('../content/scripts-bio1.js');
const scriptsBio2 = require('../content/scripts-bio2.js');
const boardScripts = id => Object.hasOwn(scriptsBio2.BOARDS, id) ? scriptsBio2 : id.startsWith('bio-') ? scriptsBio1 : id.startsWith('force-') ? scriptsForce : id.startsWith('sound-') ? scriptsSound : scripts;
const explain = require('../js/explain.js');
const voiceData = require('../content/voice-light.js');
const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function elements(ui, predicate) {
  const found = [];
  function visit(el) { if (predicate(el)) found.push(el); el.children.forEach(visit); }
  visit(ui.host); return found;
}
function visible(el) {
  for (let current = el; current; current = current.parent) {
    if (current.attributes.display === 'none' || current.tagName === 'defs') return false;
  }
  return true;
}
function visibleElements(ui, predicate) { return elements(ui, el => visible(el) && predicate(el)); }
function drawing(board, token, progress) {
  const resolved = explain.resolve(token, board.scene, scene.trace(board.scene), scene.handles(board.scene));
  resolved.items.forEach(item => { if (item.type === 'text') item.key = item.ref.field !== 'valueDeg'; });
  return { stepIndex: 0, stepDone: progress === 1,
    parts: [{ ...resolved, token, progress }] };
}
function currentWords(ui) { return ui.find(el => el.className === 'speech').textContent; }
function startLesson(ui, audio = false) {
  ui.api.app.start(ui.host);
  if (!audio) ui.button('音声なしで見る').dispatch('click');
}

function animationBoard(id = 'reflect', width = 600) {
  const calls = { trace: 0, handles: 0, sizes: 0, placeLabels: 0, change: 0 };
  const counted = (source, key) => (...args) => { calls[key]++; return source[key](...args); };
  const ui = screen('', width, {
    scene: { ...scene, trace: counted(scene, 'trace'), handles: counted(scene, 'handles') },
    viewMath: { ...view, sizes: counted(view, 'sizes'), placeLabels: counted(view, 'placeLabels') },
  });
  const board = boards.get(id);
  const renderer = ui.api.boardView.create(ui.host, board, () => calls.change++, undefined, { parts: [] });
  return { ui, board, renderer, calls };
}
function assertNoStructureChanges(ui) {
  const forbidden = ['createElement', 'createElementNS', 'appendChild', 'removeChild', 'replaceChildren', 'textContent'];
  assert.equal(ui.mutations.filter(call => forbidden.includes(call.method)).length, 0);
}
function clipRect(ui, text) {
  const id = text.attributes['clip-path'].slice(5, -1);
  return ui.find(el => el.attributes.id === id).children[0];
}

test('説明を300コマ進めても要素を増減せず、計算と配置は最初の1回だけ', () => {
  const { ui, board, renderer, calls } = animationBoard();
  const state = drawing(board, 'ray:incident', 0), nodes = elements(ui, () => true);
  ui.mutations.length = 0;
  for (let i = 1; i <= 300; i++) {
    state.parts[0].progress = i / 301;
    renderer.setState(state);
    const current = elements(ui, () => true);
    assert.equal(current.length, nodes.length);
    assert.ok(current.every((el, index) => el === nodes[index]));
  }
  assertNoStructureChanges(ui);
  assert.deepEqual(calls, { trace: 1, handles: 1, sizes: 1, placeLabels: 1, change: 1 });
});

test('手が進んでも弧・文字・矢印・強調の印は用意済みの要素を表示する', () => {
  for (const { id } of boards.list()) {
    const { ui, board, renderer, calls } = animationBoard(id);
    const nodes = elements(ui, () => true);
    const timeline = explain.buildTimeline(boardScripts(id).BOARDS[id], board.scene, scene.trace(board.scene), scene.handles(board.scene));
    ui.mutations.length = 0;
    for (const step of timeline.steps) for (const part of step.parts) {
      renderer.setState(explain.stateAt(timeline, step.index, part.start + part.duration / 2));
      renderer.setState(explain.stateAt(timeline, step.index, part.start + part.duration));
    }
    assertNoStructureChanges(ui);
    assert.ok(elements(ui, () => true).every((el, index) => el === nodes[index]));
    assert.deepEqual(calls, { trace: 1, handles: 1, sizes: 1, placeLabels: 1, change: 1 });
    assert.ok(visibleElements(ui, el => el.tagName === (id.startsWith('bio-') ? 'image' : 'line')).length > 0);
  }
});

test('同じ進み具合では属性を更新せず、進行中も完成済みの部品に触れない', () => {
  const { ui, board, renderer } = animationBoard();
  const state = drawing(board, 'el:mirror', 1);
  state.parts.push(...drawing(board, 'ray:incident', .3).parts);
  renderer.setState(state);
  ui.mutations.length = 0;
  renderer.setState(structuredClone(state));
  assert.equal(ui.mutations.length, 0);
  state.parts[1].progress = .4;
  renderer.setState(state);
  const ray = ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  const pen = ui.find(el => el.attributes.class === 'pen');
  assert.ok(ui.mutations.length > 0);
  assert.ok(ui.mutations.every(call => call.element === ray || call.element === pen));
});

test('説明中の幅変更は1回だけ再構築し、進み具合を保って属性の更新に戻る', () => {
  const { ui, board, renderer, calls } = animationBoard();
  const state = drawing(board, 'ray:incident', .3);
  renderer.setState(state);
  const rayNode = () => ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  const before = rayNode(), coords = ['x1', 'y1', 'x2', 'y2'].map(key => before.attributes[key]);
  ui.resize(319);
  assert.ok(rayNode() !== before);
  assert.deepEqual(['x1', 'y1', 'x2', 'y2'].map(key => rayNode().attributes[key]), coords);
  assert.notEqual(rayNode().attributes['stroke-width'], before.attributes['stroke-width']);
  assert.deepEqual(calls, { trace: 2, handles: 2, sizes: 2, placeLabels: 2, change: 2 });
  ui.mutations.length = 0;
  ui.resize(319); renderer.setState(state);
  assert.equal(ui.mutations.length, 0);
  state.parts[0].progress = .4; renderer.setState(state);
  assertNoStructureChanges(ui);
  assert.deepEqual(calls, { trace: 2, handles: 2, sizes: 2, placeLabels: 2, change: 2 });
});

test('setScene と再説明の配置差し替えは、それぞれ1回だけ再構築する', () => {
  const { ui, board, renderer, calls } = animationBoard();
  const state = drawing(board, 'ray:incident', .3);
  renderer.setState(state);
  const rayNode = () => ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  const before = rayNode();
  renderer.setScene(scene.moveElement(board.scene, 'src', 'move', { x: 180, y: 70 }));
  assert.ok(rayNode() !== before);
  const ray = scene.trace(board.scene).rays[0];
  assert.equal(Number(rayNode().attributes.x2), ray.x1 + (ray.x2 - ray.x1) * view.ease(.3));
  assert.deepEqual(calls, { trace: 2, handles: 2, sizes: 2, placeLabels: 2, change: 2 });
  ui.mutations.length = 0; renderer.setState(state); assert.equal(ui.mutations.length, 0);
  board.scene = boards.get('reflect').scene;
  renderer.setState(state);
  assert.deepEqual(calls, { trace: 3, handles: 3, sizes: 3, placeLabels: 3, change: 3 });
  ui.mutations.length = 0; renderer.setState(state); assert.equal(ui.mutations.length, 0);
});

test('線は緩急のある終点までのび、完成時だけ加工し、1から0.3へも戻れる', () => {
  const { ui, board, renderer } = animationBoard();
  const ray = scene.trace(board.scene).rays[0];
  const el = ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  for (const p of [0, .25, .5, 1, .3, 0]) {
    renderer.setState(drawing(board, 'ray:incident', p));
    assert.equal(visible(el), p > 0);
    assert.equal(Number(el.attributes.x2), ray.x1 + (ray.x2 - ray.x1) * view.ease(p));
    assert.equal(Number(el.attributes.y2), ray.y1 + (ray.y2 - ray.y1) * view.ease(p));
    assert.equal(el.hasAttribute('filter'), p === 1);
    if (p > 0 && p < 1) assert.equal(ui.find(el => el.attributes.class === 'pen').attributes.transform,
      `translate(${el.attributes.x2} ${el.attributes.y2})`);
  }
  for (const p of [.5, 1, .3]) {
    renderer.setState(drawing(board, 'el:mirror', p));
    const mirror = visibleElements(ui, el => el.tagName === 'line');
    assert.ok(mirror.length > 1);
    assert.ok(mirror.every(el => el.hasAttribute('filter') === (p === 1)));
  }
});

test('弧はeaseで広がり、ふわっと現れる部品はeaseOutで拡大する', () => {
  const { ui, board, renderer } = animationBoard();
  const angle = scene.trace(board.scene).angles[0], radius = 54, delta = angle.toDeg - angle.fromDeg;
  const arc = ui.find(el => el.tagName === 'path' && el.attributes['fill-opacity'] === '0.1');
  for (const p of [0, .25, .5, 1, .3]) {
    renderer.setState({ parts: [{ progress: p, items: [{ ref: { source: 'angles', key: angle.key } }] }] });
    const degrees = angle.fromDeg + delta * view.ease(p);
    const x = angle.vertex.x + radius * Math.cos(degrees * Math.PI / 180);
    const y = angle.vertex.y + radius * Math.sin(degrees * Math.PI / 180);
    assert.equal(visible(arc), p > 0);
    assert.ok(arc.attributes.d.endsWith(`${x} ${y} Z`));
    assert.equal(arc.hasAttribute('filter'), false);
  }
  renderer.setState(drawing(board, 'el:source', .25));
  const group = ui.find(el => el.tagName === 'g' && el.attributes.opacity === String(view.easeOut(.25)));
  assert.ok(group.attributes.transform.includes(`scale(${.4 + .6 * view.easeOut(.25)})`));
});

test('文字は箱の左端から連続して現れ、完成時に切り抜きを外し、巻き戻すと付け直す', () => {
  const { ui, renderer } = animationBoard();
  const text = ui.find(el => el.tagName === 'text' && el.textContent === '入射角');
  const state = p => ({ parts: [{ progress: p, items: [{ type: 'text', key: true,
    ref: { source: 'angles', key: 'in', field: 'name' } }] }] });
  renderer.setState(state(0));
  const rect = clipRect(ui, text), size = Number(text.attributes['font-size']), box = view.labelBox({
    text: text.textContent, x: Number(text.attributes.x), y: Number(text.attributes.y), fontSize: size,
    anchor: text.attributes['text-anchor'],
  });
  for (const p of [0, .25, .5, 1, .3, 0]) {
    renderer.setState(state(p));
    assert.equal(text.textContent, '入射角');
    assert.equal(visible(text), p > 0);
    assert.equal(text.hasAttribute('clip-path'), p !== 1);
    assert.equal(Number(rect.attributes.x), box.left - 4);
    assert.equal(Number(rect.attributes.width), (box.right - box.left + 8) * view.ease(p));
    if (p !== 1) assert.ok(clipRect(ui, text) === rect);
    if (p > 0 && p < 1) assert.equal(ui.find(el => el.attributes.class === 'pen').attributes.transform,
      `translate(${box.left - 4 + (box.right - box.left + 8) * view.ease(p)} ${text.attributes.y})`);
  }
});

test('垂直入射の0度では弧を描かず、説明中のペンの印は保つ', () => {
  const { ui, board, renderer } = animationBoard();
  renderer.setScene(scene.moveElement(board.scene, 'src', 'move', { x: 300, y: 70 }));
  const angle = scene.trace(board.scene).angles[0];
  assert.equal(angle.valueDeg, 0);
  renderer.setState({ parts: [{ progress: .5, items: [{ ref: { source: 'angles', key: angle.key } }] }] });
  assert.equal(visibleElements(ui, el => el.tagName === 'path' && el.hasAttribute('fill-opacity')).length, 0);
  assert.ok(ui.find(el => el.attributes.class === 'pen' && visible(el)));
});

test('不正なシーンから復帰した最初の描画も、表示幅に合わせる', () => {
  const { ui, renderer } = animationBoard('reflect', 319);
  renderer.setScene(null);
  assert.equal(ui.find(el => el.tagName === 'svg').style.display, 'none');
  assert.equal(ui.find(el => el.className === 'board-error').hidden, false);
  renderer.setScene(boards.get('reflect').scene);
  assert.equal(ui.find(el => el.tagName === 'svg').style.display, '');
  const ray = ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  assert.equal(Number(ray.attributes['stroke-width']), view.sizes(319).rayWidth);
  const text = ui.find(el => el.tagName === 'text');
  assert.equal(Number(text.attributes['font-size']), view.sizes(319).angleSize);
});

test('start・end・middle の文字の切り抜きは箱の左端から始まる', () => {
  const anchors = new Set();
  for (const { id } of boards.list()) {
    const { ui } = animationBoard(id);
    const rects = elements(ui, el => el.tagName === 'clipPath' && el.attributes.id.includes('-text-')).map(el => el.children[0]);
    for (const [index, text] of elements(ui, el => el.tagName === 'text' && el.attributes.class !== 'picture-error').entries()) {
      const anchor = text.attributes['text-anchor']; anchors.add(anchor);
      const size = Number(text.attributes['font-size']), rows = text.children.filter(el => el.tagName === 'tspan').map(el => el.textContent);
      const width = text.attributes.class === 'picture-text' ? Math.max(...(rows.length ? rows : [text.textContent]).map(row => view.pictureTextWidth(row, size))) :
        Number(text.attributes.textLength) || Math.max(...(rows.length ? rows : [text.textContent]).map(row => Array.from(row).length)) * size;
      const left = Number(text.attributes.x) - width * (anchor === 'end' ? 1 : anchor === 'middle' ? .5 : 0);
      assert.equal(Number(rects[index].attributes.x), left - 4);
    }
  }
  assert.deepEqual([...anchors].sort(), ['end', 'middle', 'start']);
});

test('説明終了で切り抜きと非表示属性を残さず、再び説明を始めると1回だけ作り直す', () => {
  const { ui, board, renderer, calls } = animationBoard();
  renderer.setState(drawing(board, 'angle:in', .3));
  renderer.setState(null);
  assert.equal(elements(ui, el => el.hasAttribute('clip-path') || el.hasAttribute('display') || el.tagName === 'clipPath').length, 0);
  assert.equal(!!ui.find(el => el.attributes.class === 'handle'), scene.handles(board.scene).length > 0);
  assert.deepEqual(calls, { trace: 2, handles: 2, sizes: 2, placeLabels: 2, change: 2 });
  renderer.setState(drawing(board, 'angle:in', .3));
  assert.deepEqual(calls, { trace: 3, handles: 3, sizes: 3, placeLabels: 3, change: 3 });
  ui.mutations.length = 0; renderer.setState(drawing(board, 'angle:in', .4));
  assertNoStructureChanges(ui);
});

test('同じ手のtickを100回呼んでも、盤の外の文字・履歴・印・ボタンを更新しない', async () => {
  const ui = screen('?board=reflect'); startLesson(ui); await settle();
  ui.advance(10);
  const words = currentWords(ui), outside = new Set(elements(ui, el => {
    for (let current = el; current; current = current.parent) if (current.tagName === 'svg') return false;
    return true;
  }));
  ui.mutations.length = 0;
  for (let i = 0; i < 100; i++) ui.advance(1);
  assert.equal(currentWords(ui), words);
  assert.equal(ui.mutations.filter(call => outside.has(call.element)).length, 0);
  assertNoStructureChanges(ui);
  ui.button('⏸ 止める').dispatch('click'); assert.ok(ui.button('▶ 再生'));
  ui.button('＋').dispatch('click'); assert.ok(ui.host.textContent.includes('1.25 倍'));
  ui.button('▶ 再生').dispatch('click');
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[1].lines.E);
});

function textState(ref, progress, key = false) {
  return { stepIndex: 0, stepDone: progress === 1, parts: [{ progress, items: [{ type: 'text', ref, key }] }] };
}

for (const width of [319, 600]) for (const numeric of [false, true]) {
  test(`${width}px・${numeric ? '角度の数字' : '通常の文字'}: 0・0.5・1・巻き戻しで浮き上がり、切り抜かない`, () => {
    const { ui, renderer } = animationBoard('reflect', width), unit = 600 / width;
    const ref = numeric ? { source: 'angles', key: 'in', field: 'valueDeg' } : { source: 'marks', key: 'mirror', field: 'text' };
    renderer.setState(textState(ref, 1));
    const text = visibleElements(ui, el => el.tagName === 'text')[0], complete = { ...text.attributes };
    for (const p of [0, .5, 1, .3, 0]) {
      renderer.setState(textState(ref, p));
      assert.equal(visible(text), p > 0);
      assert.equal(text.hasAttribute('clip-path'), false);
      for (const key of ['x', 'y', 'text-anchor', 'font-size']) assert.equal(text.attributes[key], complete[key]);
      if (p === 1) {
        assert.equal(text.hasAttribute('opacity'), false); assert.equal(text.hasAttribute('transform'), false);
      } else {
        const eased = view.easeOut(p);
        assert.equal(Number(text.attributes.opacity), eased);
        assert.ok(text.attributes.transform.startsWith(`translate(0 ${6 * unit * (1 - eased)})`));
        assert.equal(text.attributes.transform.includes('scale('), numeric);
        if (numeric) assert.ok(text.attributes.transform.includes(`scale(${.85 + .15 * eased})`));
      }
      assert.equal(ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
    }
  });
}

test('同じ文字のkeyが変わっても要素は作り直さず、古い切り抜き・浮き上がり属性を外す', () => {
  const { ui, renderer } = animationBoard(), ref = { source: 'angles', key: 'in', field: 'name' };
  const text = ui.find(el => el.tagName === 'text' && el.textContent === '入射角');
  ui.mutations.length = 0;
  renderer.setState(textState(ref, .5, true));
  assert.equal(text.hasAttribute('clip-path'), true);
  renderer.setState(textState(ref, .5, false));
  assert.equal(text.hasAttribute('clip-path'), false); assert.equal(text.attributes.opacity, '0.75');
  renderer.setState(textState(ref, .5, true));
  assert.equal(text.hasAttribute('clip-path'), true);
  assert.equal(text.hasAttribute('opacity'), false); assert.equal(text.hasAttribute('transform'), false);
  assertNoStructureChanges(ui);
});

function penTip(ui) {
  const pen = ui.find(el => el.attributes.class === 'pen');
  return pen.attributes.transform.match(/^translate\(([^ ]+) ([^)]+)\)$/).slice(1).map(Number);
}
function movingPen(width = 600) {
  const result = scene.trace(boards.get('reflect').scene);
  result.rays = [100, 200, 300].map(x => ({ x1: x, y1: 150, x2: x + 100, y2: 150, style: 'solid' }));
  const ui = screen('', width, { scene: { ...scene, trace: () => result } }), board = boards.get('reflect');
  let time = 0;
  const renderer = ui.api.boardView.create(ui.host, board, undefined, undefined, { parts: [] }, () => time);
  const state = (index, progress, stepIndex) => ({ stepIndex, stepDone: progress === 1,
    parts: [{ progress, items: [{ type: 'line', ref: { source: 'rays', index } }] }] });
  const set = (index, progress, at, stepIndex = 0) => { time = at; renderer.setState(state(index, progress, stepIndex)); };
  set(0, 0, 0);
  return { ui, renderer, set, pen: ui.find(el => el.attributes.class === 'pen') };
}

test('ペンは1つのSVG画像で、36pxの大きさと左下の先を保ち、300コマでも再作成しない', () => {
  for (const width of [319, 600]) {
    const { ui, set, pen } = movingPen(width), size = 36 * 600 / width;
    assert.equal(pen.tagName, 'image'); assert.equal(pen.attributes.href, 'assets/pen.svg');
    assert.equal(Number(pen.attributes.width), size); assert.equal(Number(pen.attributes.height), size);
    assert.equal(Number(pen.attributes.x), -size * 6 / 64); assert.equal(Number(pen.attributes.y), -size * 58 / 64);
    assert.equal(pen.children.length, 0); assert.equal(elements(ui, el => el.tagName === 'image').length, 1);
    ui.mutations.length = 0;
    for (let i = 1; i <= 300; i++) set(0, i / 301, i * 16);
    assertNoStructureChanges(ui); assert.equal(ui.find(el => el.attributes.class === 'pen'), pen);
  }
});

test('相手を変えたペンは動く先端へ150msで乗りかえ、その後は差0で付く（外から渡した時計）', () => {
  const { ui, set } = movingPen();
  assert.deepEqual(penTip(ui), [100, 150]);
  set(1, 0, 0); assert.deepEqual(penTip(ui), [100, 150]);
  set(1, .25, 75);
  assert.deepEqual(penTip(ui), [100 + (200 + 100 * view.ease(.25) - 100) * view.easeOut(.5), 150]);
  set(1, .5, 150); assert.deepEqual(penTip(ui), [250, 150]);
  set(1, .75, 166); assert.deepEqual(penTip(ui), [200 + 100 * view.ease(.75), 150]);
});

test('ペンの移動は16ms刻みと50ms刻みで同じ時間に同じ位置になる', () => {
  for (const end of [75, 100, 150, 240]) {
    const positions = [16, 50].map(interval => {
      const { ui, set } = movingPen(); set(1, 0, 0);
      for (let time = interval; time < end; time += interval) set(1, time / 300, time);
      set(1, end / 300, end); return penTip(ui)[0];
    });
    assert.equal(positions[0], positions[1]);
    assert.equal(positions[0], 100 + (100 + 100 * view.ease(end / 300)) * view.easeOut(end / 150));
  }
});

test('乗りかえ75msでさらに相手が変わると、その位置から新しく150msを測る', () => {
  const { ui, set } = movingPen();
  set(1, 0, 0); set(1, .25, 75);
  const [from] = penTip(ui);
  set(2, 0, 75); assert.deepEqual(penTip(ui), [from, 150]);
  set(2, .25, 150);
  assert.deepEqual(penTip(ui), [from + (300 + 100 * view.ease(.25) - from) * view.easeOut(.5), 150]);
  set(2, .5, 225); assert.deepEqual(penTip(ui), [350, 150]);
});

test('手が変わった最初の相手には乗りかえず、その場で200msかけて現れる', () => {
  const { ui, set, pen } = movingPen();
  set(0, .5, 200);
  set(2, 0, 216, 1);
  assert.deepEqual(penTip(ui), [300, 150]); assert.equal(pen.attributes.opacity, '0');
  set(2, 0, 316, 1); assert.equal(pen.attributes.opacity, '0.5');
  set(2, 0, 416, 1); assert.equal(pen.attributes.opacity, '1');
});

function reflectionPen(interval, width = 600, checkpoints = []) {
  const { ui, board, renderer } = animationBoard('reflect', width);
  const timeline = explain.buildTimeline(scripts.BOARDS.reflect, board.scene, scene.trace(board.scene), scene.handles(board.scene));
  const step = timeline.steps[2], textPart = step.parts.find(part => part.items.some(item => item.key));
  const times = new Set(checkpoints), positions = new Map();
  for (let time = 0; time <= step.duration; time += interval) times.add(time);
  let previous = null, changed = false, followed = 0;
  ui.mutations.length = 0;
  for (const time of [...times].sort((a, b) => a - b)) {
    renderer.setState(explain.stateAt(timeline, 2, time), time);
    const tip = penTip(ui); positions.set(time, tip);
    if (previous && interval === 16) assert.ok(Math.hypot(tip[0] - previous[0], tip[1] - previous[1]) <= 40, `時刻${time}`);
    if (time >= textPart.start && time < textPart.start + interval) changed = true;
    if (time >= textPart.start + 150 && time < step.drawDuration) {
      const text = ui.find(el => el.tagName === 'text' && el.textContent === '法線'), rect = clipRect(ui, text);
      const gap = Math.hypot(tip[0] - Number(rect.attributes.x) - Number(rect.attributes.width), tip[1] - Number(text.attributes.y));
      assert.ok(gap * width / 600 <= 2); followed++;
    }
    previous = tip;
  }
  assert.equal(changed, true); assert.ok(followed > 0); assertNoStructureChanges(ui);
  return positions;
}

test('反射3手目をstateAtで16msずつ進めても法線から文字へ飛ばず、150ms後は右端に付く', () => {
  for (const width of [319, 600]) reflectionPen(16, width);
});

test('反射3手目を50msずつ進めても、乗りかえ途中を含む同じ時刻で16ms刻みと1単位以内になる', () => {
  const checkpoints = [800, 850, 900, 950, 1000, 1050, 1100];
  for (const width of [319, 600]) {
    const fine = reflectionPen(16, width, checkpoints), coarse = reflectionPen(50, width);
    for (const time of checkpoints) {
      const a = fine.get(time), b = coarse.get(time);
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1, `幅${width}・時刻${time}`);
    }
  }
});

for (const { id } of boards.list().filter(board => board.unit === 'light')) {
  test(`${id}: 全手を16msずつ進めてもペンの座標は有限で、手の変更・再出現以外では40単位を超えて動かない`, () => {
    const { ui, board, renderer, calls } = animationBoard(id);
    const timeline = explain.buildTimeline(boardScripts(id).BOARDS[id], board.scene, scene.trace(board.scene), scene.handles(board.scene));
    const pen = ui.find(el => el.attributes.class === 'pen');
    let previous = null;
    ui.mutations.length = 0;
    for (const step of timeline.steps) for (let time = 0; time <= step.duration; time += 16) {
      assert.doesNotThrow(() => renderer.setState(explain.stateAt(timeline, step.index, time), step.start + time));
      const tip = pen.hasAttribute('transform') ? penTip(ui) : null;
      const shown = visible(pen) && Number(pen.attributes.opacity) > 0;
      if (tip) assert.ok(tip.every(Number.isFinite));
      if (tip && previous?.tip && previous.step === step.index && previous.shown && shown) {
        const distance = Math.hypot(tip[0] - previous.tip[0], tip[1] - previous.tip[1]);
        assert.ok(distance <= 40, `${id}・${step.index + 1}手目・${time}ms: ${distance}`);
      }
      previous = { tip, shown, step: step.index };
    }
    assertNoStructureChanges(ui);
    assert.deepEqual(calls, { trace: 1, handles: 1, sizes: 1, placeLabels: 1, change: 1 });
  });
}

test('描画中の線・弧・重要語句では、ペンと先端の差が2px以内になる', () => {
  for (const width of [319, 600]) for (const kind of ['line', 'arc', 'text']) {
    const { ui, board, renderer } = animationBoard('reflect', width), unit = 600 / width;
    for (const p of [.1, .5, .9]) {
      if (kind === 'line') {
        renderer.setState(drawing(board, 'ray:incident', p), p * 1000);
        const ray = ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00'), [x, y] = penTip(ui);
        assert.ok(Math.hypot(x - Number(ray.attributes.x2), y - Number(ray.attributes.y2)) / unit <= 2);
      }
      if (kind === 'arc') {
        const angle = scene.trace(board.scene).angles[0], radius = 54 * Math.min(view.sizes(width).textSize / 16, 1.5);
        renderer.setState({ parts: [{ progress: p, items: [{ type: 'arc', ref: { source: 'angles', key: angle.key } }] }] }, p * 1000);
        const radians = (angle.fromDeg + (angle.toDeg - angle.fromDeg) * view.ease(p)) * Math.PI / 180, tip = penTip(ui);
        assert.ok(Math.hypot(tip[0] - angle.vertex.x - radius * Math.cos(radians),
          tip[1] - angle.vertex.y - radius * Math.sin(radians)) / unit <= 2);
      }
      if (kind === 'text') {
        renderer.setState(textState({ source: 'marks', key: 'normal', field: 'text' }, p, true), p * 1000);
        const text = ui.find(el => el.tagName === 'text' && el.textContent === '法線'), rect = clipRect(ui, text), textTip = penTip(ui);
        assert.ok(Math.hypot(textTip[0] - Number(rect.attributes.x) - Number(rect.attributes.width), textTip[1] - Number(text.attributes.y)) / unit <= 2);
      }
    }
  }
});

for (const time of [-10, NaN, 2075]) {
  test(`ペンの時刻${String(time)}は目標に合わせ、次の正常な時刻でも有限のまま動く`, () => {
    const { ui, set, pen } = movingPen();
    set(1, 0, 0); set(1, .25, 75);
    assert.doesNotThrow(() => set(1, 0, time)); assert.deepEqual(penTip(ui), [200, 150]);
    assert.ok(Number.isFinite(Number(pen.attributes.opacity)));
    set(0, 0, 100); assert.ok(penTip(ui).every(Number.isFinite));
  });
}

test('手の終了から200msで消え、次の手で200msかけて現れ、説明終了・操作中には出ない', () => {
  const { ui, set, renderer, pen } = movingPen();
  assert.equal(pen.attributes.opacity, '0');
  set(0, .2, 100); assert.equal(pen.attributes.opacity, '0.5');
  set(0, .4, 200); assert.equal(pen.attributes.opacity, '1');
  set(0, 1, 200); assert.equal(pen.attributes.opacity, '1'); assert.deepEqual(penTip(ui), [200, 150]);
  set(0, 1, 300); assert.equal(pen.attributes.opacity, '0.5');
  set(0, 1, 400); assert.equal(pen.attributes.opacity, '0'); assert.equal(visible(pen), false);
  set(1, 0, 400); assert.equal(pen.attributes.opacity, '0');
  set(1, .2, 500); assert.equal(pen.attributes.opacity, '0.5');
  set(1, .4, 600); assert.equal(pen.attributes.opacity, '1');
  renderer.setState(null, 600);
  assert.equal(ui.find(el => el.attributes.class === 'pen'), null);
  renderer.draw(); assert.equal(ui.find(el => el.attributes.class === 'pen'), null);
});

test('同じ手でもペンが消えた後の相手には乗りかえず、その場で現れる', () => {
  const { ui, set, pen } = movingPen();
  set(0, .5, 200); set(0, 1, 216); set(0, 1, 416);
  assert.equal(visible(pen), false);
  set(2, .25, 432); assert.deepEqual(penTip(ui), [300 + 100 * view.ease(.25), 150]);
  assert.equal(pen.attributes.opacity, '0');
  set(2, .25, 532); assert.equal(pen.attributes.opacity, '0.5');
  set(2, .25, 632); assert.equal(pen.attributes.opacity, '1');
});

function penLesson() {
  const ui = screen('?board=reflect'); startLesson(ui);
  for (let i = 0; i < 4; i++) ui.button('次へ ▶').dispatch('click');
  ui.advance(320);
  const pen = ui.find(el => el.attributes.class === 'pen');
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[2].lines.E);
  assert.equal(pen.attributes.opacity, '1'); assert.equal(visible(pen), true);
  return { ui, pen };
}

function assertPenHidden(pen) {
  assert.equal(pen.attributes.opacity, '0'); assert.equal(pen.attributes.display, 'none');
}

test('app経由で止める→次へを押すと即座に消え、200msコマを更新しなくても残らない', () => {
  const { ui, pen } = penLesson();
  ui.button('⏸ 止める').dispatch('click');
  assert.equal(visible(pen), true); assert.equal(ui.frames.size, 0);
  ui.button('次へ ▶').dispatch('click'); assertPenHidden(pen);
  ui.mutations.length = 0; ui.advance(200);
  assertPenHidden(pen); assert.equal(ui.frames.size, 0); assert.equal(ui.mutations.length, 0);
});

test('再生中の手が終わって200msで消える途中に止めると、即座に消える', () => {
  const { ui, pen } = penLesson();
  ui.advance(400); ui.advance(380);
  assert.equal(pen.attributes.opacity, '1');
  ui.advance(100); assert.equal(pen.attributes.opacity, '0.5');
  ui.button('⏸ 止める').dispatch('click'); assertPenHidden(pen);
  assert.equal(ui.frames.size, 0);
});

test('停止中にもどるとペンは隠れ、再生すると戻った手の最初の相手の所に現れる', () => {
  const { ui, pen } = penLesson();
  ui.button('⏸ 止める').dispatch('click'); ui.button('◀ もどる').dispatch('click');
  assertPenHidden(pen); assert.equal(ui.frames.size, 0);
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[1].lines.E);
  ui.advance(200); assertPenHidden(pen);
  ui.button('▶ 再生').dispatch('click'); ui.advance(750);
  const ray = scene.trace(boards.get('reflect').scene).rays[0];
  assert.deepEqual(penTip(ui), [ray.x1, ray.y1]); assert.equal(pen.attributes.opacity, '0');
  ui.advance(100); assert.equal(pen.attributes.opacity, '0.5');
  ui.advance(100); assert.equal(pen.attributes.opacity, '1');
});

test('停止中にとばすとペンを残さず、自分で動かす盤になる', () => {
  const { ui } = penLesson();
  ui.button('⏸ 止める').dispatch('click'); ui.button('とばして自分で動かす').dispatch('click');
  assert.equal(ui.find(el => el.attributes.class === 'pen'), null);
  assert.equal(ui.frames.size, 0); assert.equal(ui.find(el => el.className === 'after').hidden, false);
});

test('通常の文字・部品ではペンの位置を動かさず、文字・部品だけの手にはペンを出さない', () => {
  const { ui, set, renderer, pen } = movingPen(); set(0, .5, 200);
  const before = pen.attributes.transform;
  renderer.setState(textState({ source: 'marks', key: 'mirror', field: 'text' }, .5), 250);
  assert.equal(pen.attributes.transform, before);
  const pop = drawing(boards.get('reflect'), 'el:mirror', .5);
  pop.parts[0].items.forEach(item => { if (item.type === 'text') item.key = false; });
  renderer.setState(pop, 300);
  assert.equal(pen.attributes.transform, before);
  const other = animationBoard();
  const state = drawing(other.board, 'el:mirror', .5);
  state.parts[0].items.forEach(item => { if (item.type === 'text') item.key = false; });
  other.renderer.setState(state, 200);
  assert.equal(other.ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
});

for (const [words, expected] of [['普通の言葉。', []], ['「法線」を描く。', ['法線']],
  ['「法線」と「入射角」。', ['法線', '入射角']], ['「法線」はここ。「入射角', ['法線']],
  ['閉じていない「法線', []], ['<b>&「<b>&」を文字にする。', ['<b>&']]]) {
  test(`吹き出し「${words}」を文字のまま組み立て、閉じたかぎ括弧だけをマーカーにする`, () => {
    const ui = screen('?board=reflect'), data = { ...scripts, BOARDS: structuredClone(scripts.BOARDS) };
    data.BOARDS.reflect[0].lines.E = words; ui.api.scripts = data;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), { document: ui.doc, URL, Hikari: ui.api });
    startLesson(ui);
    const speech = ui.find(el => el.className === 'speech');
    const marks = elements(ui, el => el.tagName === 'mark');
    assert.equal(speech.textContent, words); assert.deepEqual(marks.map(el => el.textContent), expected);
    assert.ok(marks.every(el => el.className === 'term'));
    assert.equal(elements(ui, el => el.tagName === 'b' && el.parent !== ui.find(el => el.className === 'speed')).length, 0);
    const sentence = ui.find(el => el.className === 'sentence');
    ui.advance(100); assert.equal(ui.find(el => el.className === 'sentence'), sentence);
  });
}

test('手が切り替わったときだけ新しい吹き出しを作り、履歴は追加した行だけを現す', () => {
  const ui = screen('?board=reflect'); startLesson(ui);
  const history = ui.find(el => el.className === 'talk'), first = history.children[0];
  const sentence = ui.find(el => el.className === 'sentence');
  ui.button('次へ ▶').dispatch('click'); assert.equal(ui.find(el => el.className === 'sentence'), sentence);
  ui.button('次へ ▶').dispatch('click');
  assert.notEqual(ui.find(el => el.className === 'sentence'), sentence);
  assert.equal(history.children.length, 2); assert.equal(history.children[0], first);
  ui.button('◀ もどる').dispatch('click');
  assert.equal(history.children.length, 1); assert.equal(history.children[0], first);
});

test('ペンが出ている途中で説明をやり直すと、待ち時間なしで隠して開始画面に戻る', () => {
  const ui = screen('?board=reflect'); startLesson(ui);
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  ui.advance(900); ui.advance(200);
  assert.ok(ui.find(el => el.attributes.class === 'pen' && visible(el)));
  ui.button('先生をかえる').dispatch('click');
  assert.equal(ui.find(el => el.className === 'start').hidden, false);
  assert.equal(ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
  assert.equal(ui.frames.size, 0);
});

test('動きを減らす設定は手の文字を最初から完成形にし、ペンと吹き出しの動きを付けない', () => {
  const ui = screen('?board=reflect', 600, { reduced: true }); startLesson(ui);
  const mirror = ui.find(el => el.tagName === 'text' && el.textContent === '鏡');
  assert.equal(visible(mirror), true);
  for (const key of ['clip-path', 'opacity', 'transform']) assert.equal(mirror.hasAttribute(key), false);
  assert.equal(ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
  for (let i = 0; i < 4; i++) ui.button('次へ ▶').dispatch('click');
  const normal = ui.find(el => el.tagName === 'text' && el.textContent === '法線');
  assert.equal(visible(normal), true); assert.equal(normal.hasAttribute('clip-path'), false);
  assert.equal(ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
  const css = fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8');
  assert.match(css, /\.speech \.sentence[^}]*animation: words-appear 250ms ease-out both/);
  assert.match(css, /\.speech \.term[^}]*linear-gradient\(transparent 62%, #FFE08A 62%\)[^}]*animation: term-mark 500ms ease-out 200ms both/);
  assert.match(css, /\.talk li[^}]*animation: words-appear 200ms ease-out both/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.speech \.sentence, \.speech \.term, \.talk li { animation: none; }\s*\.speech \.term { background-size: 100% 100%; }/);
});

test('反射の2手目の線をのばす1コマは、終点2属性とペンの位置だけを更新する', t => {
  const { ui, board, renderer } = animationBoard();
  const timeline = explain.buildTimeline(scripts.BOARDS.reflect, board.scene, scene.trace(board.scene), scene.handles(board.scene));
  renderer.setState(explain.stateAt(timeline, 1, 1050));
  ui.mutations.length = 0;
  renderer.setState(explain.stateAt(timeline, 1, 1066));
  assertNoStructureChanges(ui);
  const writes = ui.mutations.filter(call => call.method === 'setAttribute');
  assert.deepEqual(writes.map(call => call.key).sort(), ['transform', 'x2', 'y2']);
  t.diagnostic(`反射の2手目 1050ms→1066ms: setAttribute ${writes.length} 回/コマ`);
});

test('説明の状態が null なら従来の全描画に戻り、つまみを動かせる', () => {
  const ui = screen(), board = boards.get('reflect');
  const renderer = ui.api.boardView.create(ui.host, board);
  const before = ui.host.textContent;
  renderer.setState(drawing(board, 'ray:incident', .5));
  assert.equal(ui.find(el => el.attributes.class === 'handle'), null);
  renderer.setState(null);
  assert.equal(ui.host.textContent, before);
  assert.equal(!!ui.find(el => el.attributes.class === 'handle'), scene.handles(board.scene).length > 0);
  renderer.destroy();
});

for (const [input, expected] of [[0, 0], [.5, .5], [1, 1], [-1, 0], [2, 1], [NaN, 0]]) {
  test(`説明の progress=${input}: 線の終点と文字の切り抜きを0〜1に収める`, () => {
    const ui = screen(), board = boards.get('reflect'), result = scene.trace(board.scene);
    const renderer = ui.api.boardView.create(ui.host, board);
    renderer.setState(drawing(board, 'ray:incident', input));
    const ray = result.rays.find(ray => ray.role === 'incident');
    const line = visibleElements(ui, el => el.tagName === 'line' && el.attributes.stroke === '#B45C00')[0];
    if (!expected) assert.equal(line, undefined);
    else {
      assert.equal(Number(line.attributes.x1), ray.x1);
      assert.equal(Number(line.attributes.y1), ray.y1);
      assert.equal(Number(line.attributes.x2), ray.x1 + (ray.x2 - ray.x1) * expected);
      assert.equal(Number(line.attributes.y2), ray.y1 + (ray.y2 - ray.y1) * expected);
    }
    assert.equal(visibleElements(ui, el => el.tagName === 'polygon').length, expected === 1 ? 1 : 0);
    renderer.setState(drawing(board, 'angle:in', input));
    const name = visibleElements(ui, el => el.tagName === 'text').find(el => el.textContent === '入射角');
    if (!expected) assert.equal(name, undefined);
    else {
      assert.equal(name.textContent, '入射角');
      if (expected === 1) assert.equal(name.hasAttribute('clip-path'), false);
      else {
        const id = name.attributes['clip-path'].slice(5, -1), rect = ui.find(el => el.attributes.id === id).children[0];
        assert.equal(Number(rect.attributes.width), (3 * Number(name.attributes['font-size']) + 8) * expected);
      }
    }
    renderer.destroy();
  });
}

test('計算結果にない参照は全種類とも描かず、例外を出さない', () => {
  const ui = screen(), board = boards.get('reflect');
  const renderer = ui.api.boardView.create(ui.host, board);
  const refs = [{ source: 'rays', index: 999 }, { source: 'elements', id: 'missing', part: 'body' },
    { source: 'angles', key: 'missing' }, { source: 'marks', key: 'missing', field: 'text' },
    { source: 'images', index: 999 }, { source: 'elements', id: 'missing', part: 'highlight' }];
  assert.doesNotThrow(() => renderer.setState({ parts: refs.map(ref => ({ progress: .5, items: [{ ref }] })) }));
  assert.equal(visibleElements(ui, el => ['line', 'text', 'circle', 'path', 'polygon'].includes(el.tagName)).length, 0);
});

test('途中の文字は完成時の位置・大きさで描き、弧と部品・印とペンも進む', () => {
  const ui = screen(), board = boards.get('reflect');
  const renderer = ui.api.boardView.create(ui.host, board);
  renderer.setState(drawing(board, 'angle:in', 1));
  const texts = visibleElements(ui, el => el.tagName === 'text');
  const complete = texts.map(el => ({ ...el.attributes }));
  const arc = ui.find(el => el.tagName === 'path' && el.attributes['fill-opacity'] === '0.1');
  const completeArc = arc.attributes.d;
  renderer.setState(drawing(board, 'angle:in', .5));
  texts.forEach((el, i) => {
    for (const key of ['x', 'y', 'text-anchor', 'font-size']) assert.equal(el.attributes[key], complete[i][key]);
    assert.equal(el.hasAttribute('dx'), false);
    assert.equal(el.hasAttribute('clip-path'), el.textContent === '入射角');
    if (el.textContent !== '入射角') assert.equal(Number(el.attributes.opacity), view.easeOut(.5));
  });
  assert.notEqual(arc.attributes.d, completeArc);
  assert.ok(ui.find(el => el.attributes.class === 'pen' && visible(el)));
  renderer.setState(drawing(board, 'el:source', .5));
  assert.ok(ui.find(el => el.attributes.opacity === '0.75' && el.attributes.transform.includes('scale(0.85)')));
  renderer.setState(drawing(board, 'point:source', .5));
  assert.ok(ui.find(el => el.tagName === 'circle' && el.attributes.stroke === '#1A5CFF' && visible(el)));
  renderer.setState(drawing(board, 'point:source', 1));
  assert.equal(ui.find(el => el.attributes.stroke === '#1A5CFF' && visible(el)), null);
});

for (const { id } of boards.list()) {
  test(`${id}: 全手を100ms刻みで描き、終わるまでは操作不可、最後に従来の盤へ戻る`, () => {
    const ui = screen('?board=' + id); startLesson(ui);
    const board = boards.get(id), steps = boardScripts(id).BOARDS[id];
    const timeline = explain.buildTimeline(steps, board.scene, scene.trace(board.scene), scene.handles(board.scene), { readMs: steps.map(step => explain.readMs(step.lines.E)) });
    const seen = new Set([currentWords(ui)]), readoutStep = steps.findIndex(step => step.draw.some(token => token.startsWith('angle:')));
    const labelStep = steps.findIndex(step => step.draw.some(token => token.startsWith('label:') || token === 'distance'));
    const forceToken = { 'force-spring': 'label:force', 'force-arrow': 'magnitude', 'force-balance': 'label:state' }[id];
    const firstReadout = id.startsWith('bio-') ? steps.length - 2 : forceToken ? steps.findIndex(step => step.draw.includes(forceToken)) : readoutStep >= 0 ? readoutStep : labelStep >= 0 ? labelStep : steps.length - 1;
    const limit = timeline.total + steps.length * 100;
    for (let time = 0; time <= limit && !ui.find(el => el.className === 'explain-controls').hidden; time += 100) {
      assert.equal(ui.find(el => el.attributes.class === 'handle'), null);
      assert.equal(ui.find(el => el.className === 'after').hidden, true);
      const index = steps.findIndex(step => step.lines.E === currentWords(ui));
      assert.equal(ui.find(el => el.className === 'readout').hidden, index < firstReadout);
      assert.doesNotThrow(() => ui.advance(100)); seen.add(currentWords(ui));
    }
    assert.equal(seen.size, steps.length);
    assert.equal(!!ui.find(el => el.attributes.class === 'handle'), scene.handles(board.scene).length > 0);
    assert.equal(ui.find(el => el.className === 'after').hidden, false);
    assert.equal(ui.find(el => el.className === 'explain-history').hidden, true);
    assert.equal(currentWords(ui), steps[steps.length - 1].lines.E);
    assert.equal(ui.button('もう一度、説明を見る').hidden, false);
  });
}

test('開始画面は6体のラジオで、矢印キーと保存値を反映する', () => {
  const ui = screen('?board=reflect', 600, { saved: JSON.stringify({ teacher: 'C', voice: true, rate: 1.75 }) });
  ui.api.app.start(ui.host);
  assert.equal(elements(ui, el => el.attributes.role === 'radio').length, 6);
  assert.equal(ui.button('ぷにカプセル').attributes['aria-checked'], 'true');
  assert.equal(ui.button('ぷにカプセル').tabIndex, 0);
  ui.button('ぷにカプセル').dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(ui.button('まめ博士').attributes['aria-checked'], 'true');
  assert.equal(ui.doc.activeElement, ui.button('まめ博士'));
  ui.button('まめ博士').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(ui.button('まる先生').attributes['aria-checked'], 'true');
  assert.equal(ui.button('準備中').className, 'btn main');
  ui.button('音声なしで見る').dispatch('click');
  assert.ok(ui.host.textContent.includes('1.75 倍'));
  assert.equal(ui.saved.at(-1).voice, false);
  assert.deepEqual(Object.keys(ui.saved.at(-1)).sort(), ['rate', 'teacher', 'voice']);
});

test('読み込み中に先生を変えても古い結果で準備完了にせず、古いURLを解放する', async () => {
  const requests = [];
  const ui = screen('?board=reflect', 600, { fetch: url => new Promise(resolve => requests.push({ url, resolve })) });
  ui.api.app.start(ui.host);
  assert.equal(ui.button('準備中').disabled, true);
  ui.button('まる先生').dispatch('click');
  const response = { ok: true, blob: async () => ({}) };
  requests.filter(item => item.url.includes('/E/')).forEach(item => item.resolve(response)); await settle();
  assert.equal(ui.button('準備中').disabled, true);
  assert.ok(ui.revoked.length > 0);
  requests.filter(item => item.url.includes('/A/')).forEach(item => item.resolve(response)); await settle();
  assert.equal(ui.button('音声ありで見る').disabled, false);
  ui.button('音声ありで見る').dispatch('click');
  // Promiseを待つ前、クリックの処理内でAudio.playを呼んでいる。
  assert.equal(ui.audios[0].calls.at(-1), 'play');
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[0].lines.A);
});

for (const failure of ['network', 'status']) {
  test(`音声の${failure}失敗はボタンを戻し、黄色の帯を出して文字だけで始める`, async () => {
    const ui = screen('?board=reflect', 600, { fetch: async () => {
      if (failure === 'network') throw new Error('offline');
      return { ok: false, blob: () => assert.fail('失敗応答をblobにしない') };
    } });
    ui.api.app.start(ui.host); await settle();
    assert.equal(ui.button('音声ありで見る').disabled, false);
    ui.button('音声ありで見る').dispatch('click');
    const message = ui.find(el => el.className === 'voice-message');
    assert.equal(message.hidden, false); assert.equal(message.attributes.role, 'status');
    assert.equal(message.textContent, '音声を読みこめませんでした。文字だけで続けます。');
    assert.ok(ui.button('🔇 音声オフ'));
    ui.advance(100); assert.ok(ui.find(el => el.attributes.class === 'pen'));
  });
}

test('再生拒否は黄色の帯を出し、文字だけで説明を続ける', async () => {
  const ui = screen('?board=reflect', 600, { blocked: true });
  ui.api.app.start(ui.host); await settle(); ui.button('音声ありで見る').dispatch('click'); await settle();
  assert.equal(ui.find(el => el.className === 'voice-message').textContent, 'この画面では音を出せませんでした。文字だけで続けます。');
  assert.ok(ui.button('🔇 音声オフ'));
  ui.advance(explain.readMs(scripts.BOARDS.reflect[0].lines.E) + 1500);
  assert.notEqual(currentWords(ui), scripts.BOARDS.reflect[0].lines.E);
});

test('次へを5回続けても声が重ならず、最後の手の次へで自分で動かす状態になる', async () => {
  const ui = screen('?board=reflect'); ui.api.app.start(ui.host); await settle();
  ui.button('音声ありで見る').dispatch('click');
  const audio = ui.audios[0], stale = audio.onended;
  for (let i = 0; i < 5; i++) ui.button('次へ ▶').dispatch('click');
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[2].lines.E);
  const before = currentWords(ui); stale(); ui.advance(100);
  assert.equal(currentWords(ui), before);
  audio.calls.forEach((call, index) => { if (call === 'play') assert.equal(audio.calls[index - 1], 'pause'); });
  for (let i = 0; i < 30 && ui.find(el => el.className === 'after').hidden; i++) ui.button('次へ ▶').dispatch('click');
  assert.equal(ui.find(el => el.className === 'after').hidden, false);
  assert.equal(audio.calls.at(-1), 'pause');
});

test('もどるは1手目で押せず、前の手へ戻ったら描き始めと声も頭からになる', async () => {
  const ui = screen('?board=reflect'); ui.api.app.start(ui.host); await settle();
  ui.button('音声ありで見る').dispatch('click');
  assert.equal(ui.button('◀ もどる').disabled, true);
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  assert.equal(ui.button('◀ もどる').disabled, false);
  ui.button('◀ もどる').dispatch('click');
  assert.equal(ui.button('◀ もどる').disabled, true);
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[0].lines.E);
  assert.equal(ui.audios[0].calls.at(-1), 'play');
  assert.equal(ui.find(el => el.tagName === 'line' && visible(el)), null);
});

test('速さの両端を越えず、描画進捗を保ったまま声と時計の速さを変える', async () => {
  const ui = screen('?board=reflect', 600, { saved: JSON.stringify({ rate: .5 }) });
  ui.api.app.start(ui.host); await settle(); ui.button('音声ありで見る').dispatch('click');
  const rate = () => ui.find(el => el.className === 'speed').children.find(el => el.tagName === 'b').textContent;
  assert.equal(ui.button('−').disabled, true); ui.button('−').dispatch('click'); assert.equal(rate(), '0.5 倍');
  ui.advance(100);
  const pen = ui.find(el => el.attributes.class === 'pen').attributes.transform;
  for (let i = 0; i < 6; i++) ui.button('＋').dispatch('click');
  assert.equal(ui.find(el => el.attributes.class === 'pen').attributes.transform, pen);
  assert.equal(ui.audios[0].playbackRate, 2); assert.equal(ui.audios[0].preservesPitch, true);
  assert.equal(ui.button('＋').disabled, true); ui.button('＋').dispatch('click'); assert.equal(rate(), '2 倍');
});

for (const route of ['home', 'popstate', 'other', 'destroy']) {
  test(`${route}: 画面を離れると声を止め、古い終了通知と読み込みで画面が変わらない`, async () => {
    const ui = screen('?board=reflect'), app = ui.api.app.start(ui.host); await settle();
    ui.button('音声ありで見る').dispatch('click');
    const audio = ui.audios[0], stale = audio.onended, pauses = audio.calls.length;
    if (route === 'home') ui.button('← ボード一覧').dispatch('click');
    if (route === 'destroy') app.destroy();
    if (route === 'popstate' || route === 'other') {
      ui.win.location = new URL('file:///app/index.html' + (route === 'other' ? '?board=lens' : '')); ui.fire('popstate');
    }
    assert.ok(audio.calls.length > pauses); assert.equal(audio.calls.at(-1), 'pause');
    await settle(); const before = ui.host.textContent;
    stale(); ui.advance(60000); await settle(); assert.equal(ui.host.textContent, before);
    assert.ok(ui.revoked.length > 0);
  });
}

test('保存できなくても動き、知らない先生idは担当Eを選ぶ', () => {
  const ui = screen('?board=reflect', 600, { storageBlocked: true, saved: JSON.stringify({ teacher: 'unknown' }) });
  ui.api.app.start(ui.host);
  assert.equal(ui.button('キューブ先生').attributes['aria-checked'], 'true');
  ui.button('まめ博士').dispatch('click'); ui.button('音声なしで見る').dispatch('click');
  ui.button('＋').dispatch('click');
  assert.ok(ui.host.textContent.includes('1.25 倍'));
  assert.equal(ui.find(el => el.className === 'voice-message').hidden, true);
  ui.button('← ボード一覧').dispatch('click'); ui.button(boards.get('straight').title).dispatch('click');
  assert.equal(ui.button('まめ博士').attributes['aria-checked'], 'true');
});

test('不正なシーンでは開始画面を出さず、説明も読み込みも始めない', () => {
  const ui = screen('?board=reflect', 600, { fetch: () => assert.fail('読み込まない') });
  ui.api.boards = { ...boards, get: id => ({ ...boards.get(id), scene: null }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), { document: ui.doc, URL, Hikari: ui.api });
  ui.api.app.start(ui.host);
  assert.equal(ui.find(el => el.className === 'start').hidden, true);
  assert.ok(ui.host.textContent.includes('この図は表示できません'));
  assert.equal(ui.frames.size, 0);
});

test('屈折の再説明は配置・物質・向きを空気→水に戻し、introを出さない', () => {
  const ui = screen('?board=refract'); ui.api.app.start(ui.host);
  assert.equal(ui.find(el => el.className === 'say'), null);
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  ui.button('ガラス').dispatch('click'); ui.button('ガラス → 空気').dispatch('click');
  ui.button('もう一度、説明を見る').dispatch('click');
  assert.equal(ui.find(el => el.className === 'start').hidden, false);
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  assert.equal(ui.button('空気 → 水').attributes['aria-pressed'], 'true');
  assert.equal(ui.button('水 → 空気').attributes['aria-pressed'], 'false');
  assert.equal(ui.button('水').attributes['aria-pressed'], 'true');
});

test('音声の終わり・描き終わりの両方から1500ms待ち、オンは今の手の頭から、オフは停止する', async () => {
  const ui = screen('?board=reflect'); ui.api.app.start(ui.host); await settle();
  ui.button('音声ありで見る').dispatch('click');
  const first = currentWords(ui), audio = ui.audios[0];
  ui.advance(4000); assert.equal(currentWords(ui), first);
  audio.onended(); ui.advance(1499); assert.equal(currentWords(ui), first);
  ui.advance(1); assert.notEqual(currentWords(ui), first);
  ui.button('🔊 音声オン').dispatch('click'); assert.equal(audio.calls.at(-1), 'pause');
  const src = audio.src;
  ui.button('🔇 音声オフ').dispatch('click'); assert.equal(audio.calls.at(-1), 'play'); assert.equal(audio.src, src);
});

test('声が先に終わっても描き終わりを待ち、2倍では間も半分になる', async () => {
  const ui = screen('?board=reflect', 600, { saved: JSON.stringify({ rate: 2 }) });
  ui.api.app.start(ui.host); await settle(); ui.button('音声ありで見る').dispatch('click');
  const board = boards.get('reflect'), timeline = explain.buildTimeline(scripts.BOARDS.reflect, board.scene,
    scene.trace(board.scene), scene.handles(board.scene), { clipSeconds: voiceData.CLIPS.reflect.E.map(clip => clip[1]) });
  const first = currentWords(ui); ui.audios[0].onended();
  ui.advance(timeline.steps[0].drawDuration / 2 + 749); assert.equal(currentWords(ui), first);
  ui.advance(1); assert.notEqual(currentWords(ui), first);
});

test('非表示は一時停止し、復帰後に再生を押すまで声と描画を進めない', async () => {
  const ui = screen('?board=reflect'); ui.api.app.start(ui.host); await settle();
  ui.button('音声ありで見る').dispatch('click'); ui.advance(100);
  ui.visibility(true); assert.ok(ui.button('▶ 再生')); assert.equal(ui.audios[0].calls.at(-1), 'pause');
  const before = ui.host.textContent; ui.advance(30000); ui.visibility(false);
  assert.equal(ui.host.textContent, before); assert.equal(ui.frames.size, 0);
  ui.button('▶ 再生').dispatch('click'); assert.equal(ui.audios[0].calls.at(-1), 'play');
  assert.ok(ui.frames.size > 0);
});

test('リサイズしても同じ手・進み具合で描き直す', () => {
  const ui = screen('?board=reflect'); startLesson(ui);
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click'); ui.advance(1050);
  const words = currentWords(ui), line = () => ui.find(el => el.tagName === 'line' && el.attributes.stroke === '#B45C00');
  const before = { ...line().attributes }; ui.resize(319);
  assert.equal(currentWords(ui), words);
  for (const key of ['x1', 'y1', 'x2', 'y2']) assert.equal(line().attributes[key], before[key]);
  assert.notEqual(line().attributes['stroke-width'], before['stroke-width']);
});

test('動きを減らす設定ではpartが1msで完成し、手と声と間は残す', () => {
  const ui = screen('?board=reflect', 600, { reduced: true }); startLesson(ui);
  ui.advance(2);
  assert.equal(ui.find(el => el.attributes.class === 'pen' && visible(el)), null);
  assert.ok(ui.find(el => el.tagName === 'text' && el.textContent === '鏡'));
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[0].lines.E);
  ui.advance(explain.readMs(scripts.BOARDS.reflect[0].lines.E) + 1500 - 2);
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[1].lines.E);
});

test('読み込み中に音声オンにしたら準備を待ち、失敗すれば文字だけで続ける', async () => {
  const pending = [];
  const ui = screen('?board=reflect', 600, { fetch: () => new Promise((_, reject) => pending.push(reject)) });
  startLesson(ui); ui.button('🔇 音声オフ').dispatch('click');
  assert.equal(ui.button('🔊 準備中…').disabled, true);
  pending.forEach(reject => reject(new Error('offline'))); await settle();
  assert.equal(ui.button('🔇 音声オフ').disabled, false);
  assert.equal(ui.find(el => el.className === 'voice-message').hidden, false);
  assert.equal(ui.find(el => el.className === 'voice-message').textContent, '音声を読みこめませんでした。文字だけで続けます。');
  assert.equal(ui.audios[0].calls.includes('play'), false);
});

function pendingVoice() {
  const requests = [];
  const ui = screen('?board=reflect', 600, { fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })) });
  function finish(items = requests, failed = false) {
    items.forEach(item => failed ? item.reject(new Error('offline')) : item.resolve({ ok: true, blob: async () => ({}) }));
  }
  return { ui, requests, finish };
}

function clickWithVoice(ui, button) {
  const audio = ui.audios[0], before = audio.calls.filter(call => call === 'play').length;
  let checked = false;
  // アプリのクリック処理の直後、dispatch が戻る前に再生済みであることを調べる。
  button.addEventListener('click', () => {
    if (checked) return;
    assert.equal(audio.calls.filter(call => call === 'play').length, before + 1);
    checked = true;
  });
  button.dispatch('click');
  assert.equal(checked, true);
}

test('音声なしで始めても同じ先生の準備を続け、準備後のクリック内で今の手を再生する', async () => {
  const { ui, requests, finish } = pendingVoice(); startLesson(ui);
  assert.equal(requests.length, scripts.BOARDS.reflect.length);
  requests.forEach((item, index) => assert.equal(item.url, voiceData.BASE + voiceData.CLIPS.reflect.E[index][0]));
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  finish(); await settle();
  assert.equal(ui.audios[0].calls.includes('play'), false);
  clickWithVoice(ui, ui.button('🔇 音声オフ'));
  assert.equal(currentWords(ui), scripts.BOARDS.reflect[1].lines.E);
  const src = ui.audios[0].src;
  ui.advance(100); ui.button('🔊 音声オン').dispatch('click');
  assert.equal(ui.audios[0].calls.at(-1), 'pause');
  // 同じ手の声を再び頭から始め、終了待ちも全文の長さに戻す。
  ui.button('🔇 音声オフ').dispatch('click');
  assert.equal(ui.audios[0].src, src);
  assert.equal([...ui.timers.values()][0].at, 100 + voiceData.CLIPS.reflect.E[1][1] * 1000 + 4000);
});

test('準備中に音声オンを押しても完了後はオフに戻り、再クリック内でだけ再生する', async () => {
  const { ui, requests, finish } = pendingVoice(); startLesson(ui);
  const sound = ui.button('🔇 音声オフ'); sound.dispatch('click');
  assert.equal(sound.textContent, '🔊 準備中…'); assert.equal(sound.disabled, true);
  assert.equal(sound.attributes['aria-pressed'], 'false');
  sound.dispatch('click'); assert.equal(requests.length, scripts.BOARDS.reflect.length);
  finish(); await settle();
  assert.equal(sound.textContent, '🔇 音声オフ'); assert.equal(sound.disabled, false);
  assert.equal(ui.audios[0].calls.includes('play'), false);
  assert.equal(ui.find(el => el.className === 'voice-message').hidden, true);
  clickWithVoice(ui, sound);
  assert.equal(sound.textContent, '🔊 音声オン'); assert.equal(sound.attributes['aria-pressed'], 'true');
});

for (const failed of [false, true]) for (const action of ['次へ ▶', '◀ もどる', '⏸ 止める', 'とばして自分で動かす']) {
  test(`音声の準備待ち中の${action}: 古い${failed ? '失敗' : '成功'}で再生も表示変更もしない`, async () => {
    const { ui, finish } = pendingVoice(); startLesson(ui);
    if (action === '◀ もどる') {
      ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
    }
    const sound = ui.button('🔇 音声オフ'); sound.dispatch('click');
    ui.button(action).dispatch('click');
    assert.equal(sound.textContent, '🔇 音声オフ'); assert.equal(sound.disabled, false);
    const before = ui.host.textContent;
    finish(undefined, failed); await settle();
    assert.equal(ui.host.textContent, before);
    assert.equal(ui.audios[0].calls.includes('play'), false);
    assert.equal(ui.find(el => el.className === 'voice-message').hidden, true);
    if (action === '次へ ▶' && !failed) clickWithVoice(ui, sound);
  });
}

for (const failed of [false, true]) for (const route of ['home', 'teacher', 'other', 'replay']) {
  test(`音声の準備待ち中の${route}: 古い${failed ? '失敗' : '成功'}は移動先へ影響しない`, async () => {
    const { ui, requests, finish } = pendingVoice(); startLesson(ui);
    ui.button('🔇 音声オフ').dispatch('click');
    const old = requests.slice();
    if (route === 'home') ui.button('← ボード一覧').dispatch('click');
    if (route === 'teacher') {
      ui.button('先生をかえる').dispatch('click'); ui.button('まる先生').dispatch('click');
    }
    if (route === 'other') { ui.win.location = new URL('file:///app/index.html?board=lens'); ui.fire('popstate'); }
    if (route === 'replay') {
      ui.button('とばして自分で動かす').dispatch('click'); ui.button('もう一度、説明を見る').dispatch('click');
    }
    const before = ui.host.textContent;
    finish(old, failed); await settle();
    assert.equal(ui.host.textContent, before);
    ui.audios.forEach(audio => assert.equal(audio.calls.includes('play'), false));
    if (!failed) assert.equal(ui.revoked.length, old.length);
    if (route === 'teacher') {
      assert.equal(ui.button('準備中').disabled, true);
      finish(requests.filter(item => item.url.includes('/A/'))); await settle();
      clickWithVoice(ui, ui.button('音声ありで見る'));
      assert.equal(currentWords(ui), scripts.BOARDS.reflect[0].lines.A);
    }
  });
}

for (const skip of [false, true]) {
  test(`${skip ? 'すぐ動かす' : '音声なし'}でも音声を準備し、失敗は音声を選ぶまで知らせない`, async () => {
    const { ui, requests, finish } = pendingVoice(); ui.api.app.start(ui.host);
    ui.button(skip ? '説明をとばして、すぐ動かす' : '音声なしで見る').dispatch('click');
    assert.equal(requests.length, scripts.BOARDS.reflect.length);
    finish(undefined, true); await settle();
    assert.equal(ui.find(el => el.className === 'voice-message').hidden, true);
    assert.equal(ui.audios[0].calls.includes('play'), false);
    if (!skip) {
      ui.button('🔇 音声オフ').dispatch('click');
      assert.equal(ui.button('🔇 音声オフ').disabled, false);
      const message = ui.find(el => el.className === 'voice-message');
      assert.equal(message.hidden, false);
      assert.equal(message.textContent, '音声を読みこめませんでした。文字だけで続けます。');
      assert.equal(ui.audios[0].calls.includes('play'), false);
      assert.equal(requests.length, scripts.BOARDS.reflect.length);
    }
  });
}

for (const value of ['3.2', -1, Infinity]) for (const rate of [.5, 1, 2]) {
  test(`音声長${String(value)}（${typeof value}）・${rate}倍: 描画・play・終了待ちは同じ代替秒数を使う`, async () => {
    const data = structuredClone(voiceData), timelines = [], plays = [];
    data.CLIPS.reflect.E[0][1] = value;
    const voice = require('../js/voice.js');
    const ui = screen('?board=reflect', 600, { saved: JSON.stringify({ rate }), voiceData: data,
      explain: { ...explain, buildTimeline(...args) {
        const timeline = explain.buildTimeline(...args); timelines.push(timeline); return timeline;
      } },
      voice: { ...voice, createPlayer(options) {
        const player = voice.createPlayer(options);
        return { ...player, play(...args) { plays.push(args); return player.play(...args); } };
      } },
    });
    ui.api.app.start(ui.host); await settle(); clickWithVoice(ui, ui.button('音声ありで見る'));
    const seconds = (Array.from(scripts.BOARDS.reflect[0].lines.E).length * 180 + 1000) / 1000;
    const step = timelines.at(-1).steps[0], timeout = seconds * 1000 / rate + 4000;
    assert.equal(plays[0][0], 0); assert.equal(plays[0][1], seconds); assert.equal(plays[0][2], rate);
    assert.ok(Math.abs(step.drawDuration - seconds * 1000 * .8) < 1e-7);
    assert.equal(step.duration, seconds * 1000 + 1500);
    assert.equal([...ui.timers.values()][0].at, timeout);
    const words = currentWords(ui);
    ui.advance(timeout - 1); assert.equal(currentWords(ui), words); assert.equal(plays.length, 1);
    ui.advance(1); assert.equal(currentWords(ui), words); assert.equal(ui.audios[0].onended, null);
    ui.advance(1500 / rate - 1); assert.equal(currentWords(ui), words);
    ui.advance(1); assert.notEqual(currentWords(ui), words); assert.equal(plays.length, 2);
  });
}

// 音の全操作値を、実際の描画と同じ模擬 DOM で検査する。
function soundVariants(id) {
  const variants = [];
  if (id === 'sound-wave') for (let frequencyHz = 100; frequencyHz <= 1000; frequencyHz += 50) {
    for (let amplitude = 1; amplitude <= 4; amplitude++) variants.push({ frequencyHz, amplitude });
  }
  if (id === 'sound-string') for (const thickness of ['thin', 'thick']) for (const tension of ['weak', 'strong']) {
    for (let lengthPercent = 50; lengthPercent <= 100; lengthPercent += 5) {
      for (let pluck = 1; pluck <= 4; pluck++) variants.push({ lengthPercent, pluck, thickness, tension });
    }
  }
  if (id === 'sound-speed') for (let distance = 170; distance <= 1700; distance += 34) variants.push({ distance });
  return variants;
}

for (const width of [319, 375, 768, 1100]) for (const { id } of boards.list().filter(board => board.unit === 'sound')) {
  test(`${id}: 幅${width}px・全操作値で描画し、全文字を波形・つまみ・文字と重ねず表示する`, () => {
    const ui = screen('', width), board = boards.get(id), s = view.sizes(width);
    const renderer = ui.api.boardView.create(ui.host, board), variants = soundVariants(id);
    assert.equal(variants.length, { 'sound-wave': 76, 'sound-string': 176, 'sound-speed': 46 }[id]);
    for (const variant of variants) {
      const current = boards.get(id).scene, { thickness, tension, ...values } = variant;
      Object.assign(current.elements.find(e => ['wave', 'string', 'listener'].includes(e.type)), values);
      if (thickness) Object.assign(current.options, { thickness, tension });
      assert.deepEqual(scene.validateScene(current), []);
      assert.doesNotThrow(() => renderer.setScene(current));
      const result = scene.trace(current), data = boardView.labelData(board, result, s);
      const lines = boardView.lineData(current, result), placed = view.placeLabels(data.labels, data.obstacles, s, lines);
      assert.ok(placed.every(p => !p.hidden), JSON.stringify(variant) + ': ' + placed.filter(p => p.hidden).map(p => p.id));
      const boxes = labelBoxes(data.labels, placed);
      assertClear(boxes); assertLinesClear(data.labels, placed, lines, s);
      boxes.forEach(box => assertCirclesClear(box, data.obstacles));
      // 配置用データだけでなく、実際に生成された SVG の文字の箱も検査する。
      const rendered = elements(ui, el => el.tagName === 'text' && el.attributes.class !== 'knob-mark').map(el => {
        const rows = el.children.filter(child => child.tagName === 'tspan').map(child => child.textContent);
        return { text: el.textContent, ...view.labelBox({ text: el.textContent, ...(rows.length ? { lines: rows } : {}),
          x: Number(el.attributes.x), y: Number(el.attributes.y), fontSize: Number(el.attributes['font-size']),
          anchor: el.attributes['text-anchor'] }) };
      });
      assert.equal(rendered.length, data.labels.length);
      assertClear(rendered);
      if (id === 'sound-wave') {
        const label = rendered.find(box => box.text === 'おんさ（音源）');
        assert.ok(label);
        const fork = result.sound.fork, pad = s.surfaceWidth * s.unitPerPx / 2;
        assert.ok(!overlap(label, { left: fork.x - 16 - pad, right: fork.x + 16 + pad,
          top: fork.y - 65 - pad, bottom: fork.y + 41 + pad }), JSON.stringify(variant));
      }
      if (id === 'sound-speed') {
        const label = rendered.find(box => box.text.endsWith('秒後に聞こえる'));
        assert.ok(label);
        const { x, ear, feetY } = result.sound.listener, pad = s.thinWidth * s.unitPerPx / 2;
        assert.ok(!overlap(label, { left: x - 18 - pad, right: x + 18 + pad,
          top: ear.y - 12 - pad, bottom: feetY + pad }), JSON.stringify(variant));
        // SVG の光の線・距離の矢印（矢じりの幅も含む）との交差を独立に確認する。
        const { from, to } = result.sound.distanceArrow;
        for (const line of [...result.rays, { x1: from.x, y1: from.y, x2: to.x, y2: to.y }]) {
          assert.ok(!crossesLine(label, line, 3 * s.unitPerPx), JSON.stringify(variant));
        }
      }
      for (const el of elements(ui, () => true)) {
        for (const [key, value] of Object.entries(el.attributes)) {
          assert.doesNotMatch(value, /NaN|Infinity|undefined/, key);
        }
        if (el.tagName === 'text') assert.ok(Number(el.attributes['font-size']) / s.unitPerPx >= 16 - 1e-9);
        if (el.tagName === 'circle' && el.attributes['pointer-events'] === 'all') {
          assert.ok(Number(el.attributes.r) / s.unitPerPx >= 24 - 1e-9);
        }
      }
      // 波形の全点、光の線、弧の半径はエンジンの結果に一致する。
      if (result.sound.wave) {
        const points = ui.find(el => el.attributes['data-sound'] === 'wave').attributes.d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
        assert.deepEqual(points, result.sound.wave.points.flatMap(p => [p.x, p.y]));
      }
      result.sound.waves?.forEach((arc, index) => {
        const el = elements(ui, el => el.attributes['data-sound'] === 'arc')[index];
        assert.ok(el.attributes.d.includes(`A${arc.r} ${arc.r}`));
        assert.equal(el.attributes['stroke-dasharray'], '8 7');
      });
      if (id === 'sound-speed') assert.ok(ui.find(el => el.tagName === 'line' && el.attributes['stroke-dasharray'] === '1 7'));
      ui.mutations.length = 0;
    }
    renderer.destroy();
  });
}

for (const id of ['sound-wave', 'sound-string', 'sound-speed', 'force-spring', 'force-arrow', 'force-balance', 'bio-flower', 'bio-plants', 'bio-animals']) for (const teacher of scripts.TEACHERS) {
  test(`${id}・先生${teacher.id}: 全手を16ms刻みで描き、ペンが有限で最後は操作時と同じ絵になる`, () => {
    const { ui, board, renderer, calls } = animationBoard(id, 319), steps = boardScripts(id).BOARDS[id];
    const result = scene.trace(board.scene, { compact: true, widthPx: 319 });
    for (const step of steps) for (const token of step.draw) assert.ok(explain.resolve(token, board.scene, result, scene.handles(board.scene)).items.length, token);
    const timeline = explain.buildTimeline(steps, board.scene, result, scene.handles(board.scene), {
      clipSeconds: require('../content/voice-' + (id.startsWith('bio-') ? 'bio1' : id.startsWith('force-') ? 'force' : 'sound') + '.js').CLIPS[id][teacher.id].map(clip => clip[1]),
    });
    ui.mutations.length = 0;
    for (const step of timeline.steps) for (let time = 0; time <= step.duration; time += 16) {
      assert.doesNotThrow(() => renderer.setState(explain.stateAt(timeline, step.index, time), step.start + time));
      const pen = ui.find(el => el.attributes.class === 'pen');
      if (pen.hasAttribute('transform')) assert.ok(penTip(ui).every(Number.isFinite));
    }
    renderer.setState(explain.finalState(timeline), timeline.total);
    assertNoStructureChanges(ui);
    assert.deepEqual(calls, { trace: 1, handles: 1, sizes: 1, placeLabels: 1, change: 1 });
    function artSnapshot() {
      return visibleElements(ui, el => ['path', 'line', 'rect', 'polygon', 'circle', 'ellipse', 'text', 'image'].includes(el.tagName) && el.attributes.class !== 'pen' &&
        !el.parent?.attributes['data-handle'] && el.parent?.tagName !== 'clipPath').map(el => {
        const attrs = { ...el.attributes };
        if (attrs.filter) attrs.filter = 'sketch';
        delete attrs.display;
        return { tag: el.tagName, text: el.textContent, attrs };
      });
    }
    const final = artSnapshot();
    const below = visibleElements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent);
    renderer.setState(null);
    assert.deepEqual(artSnapshot(), final);
    assert.deepEqual(visibleElements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent), below);
    assert.equal(!!ui.find(el => el.attributes.class === 'handle'), scene.handles(board.scene).length > 0);
  });
}

test('音の波形は左から右へ、弧は内側から、重要語句は切り抜き、point は指す印を出す', () => {
  for (const id of ['sound-wave', 'sound-string', 'sound-speed']) {
    const { ui, board, renderer } = animationBoard(id);
    const result = scene.trace(board.scene);
    if (result.sound.wave) {
      renderer.setState(drawing(board, 'wave', .5), 100);
      const path = ui.find(el => el.attributes['data-sound'] === 'wave').attributes.d;
      const numbers = path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
      assert.equal(numbers[0], result.sound.wave.points[0].x);
      assert.ok(numbers.at(-2) < result.sound.wave.points.at(-1).x);
      assert.ok(ui.find(el => el.attributes.class === 'pen' && visible(el)));
      renderer.setState(drawing(board, 'amplitude', .5), 200);
      assert.ok(ui.find(el => el.tagName === 'text' && el.textContent === '振幅').hasAttribute('clip-path'));
    } else {
      const timeline = explain.buildTimeline(scriptsSound.BOARDS[id], board.scene, result, scene.handles(board.scene));
      const step = timeline.steps[3];
      renderer.setState(explain.stateAt(timeline, 3, step.parts[0].duration / 2), 300);
      assert.equal(visibleElements(ui, el => el.attributes['data-sound'] === 'arc').length, 1);
      renderer.setState(explain.stateAt(timeline, 3, step.parts[1].start + step.parts[1].duration / 2), 400);
      assert.equal(visibleElements(ui, el => el.attributes['data-sound'] === 'arc').length, 2);
    }
    const token = id === 'sound-speed' ? 'point:distance' : 'point:wave';
    renderer.setState(drawing(board, token, .5), 500);
    assert.ok(visibleElements(ui, el => el.tagName === 'circle' && el.attributes.fill === 'none').length > 0);
  }
});

test('100 Hz・振幅1では2つのつまみの重なりを押しても、中心が近い方だけ動く', () => {
  for (const selected of ['amplitude', 'frequency']) for (const overlap of [false, true]) {
    const ui = screen('', 319), board = boards.get('sound-wave');
    Object.assign(board.scene.elements.find(e => e.type === 'wave'), { frequencyHz: 100, amplitude: 1 });
    ui.api.boardView.create(ui.host, board);
    const handles = scene.handles(board.scene), wanted = handles.find(h => h.handle === selected), other = handles.find(h => h !== wanted);
    const point = overlap ? { x: wanted.x * .55 + other.x * .45, y: wanted.y * .55 + other.y * .45 } : wanted;
    if (overlap) assert.ok(handles.every(h => Math.hypot(h.x - point.x, h.y - point.y) < view.sizes(319).hitRadius));
    // 重なったとき上にある相手の DOM に届いても、座標で近い方を選ぶ。
    ui.find(el => el.attributes['data-handle'] === (overlap ? other.handle : wanted.handle)).dispatch('pointerdown', {
      pointerId: 1, clientX: 20 + point.x * 319 / 600, clientY: 40 + point.y * 319 / 600,
    });
    assert.equal(ui.doc.activeElement.attributes['data-handle'], selected);
    const target = selected === 'amplitude' ? { x: wanted.x, y: 50 } : { x: 174, y: wanted.y };
    ui.find(el => el.tagName === 'svg').dispatch('pointermove', {
      pointerId: 1, clientX: 20 + target.x * 319 / 600, clientY: 40 + target.y * 319 / 600,
    });
    assert.equal(board.scene.elements.find(e => e.type === 'wave').amplitude, selected === 'amplitude' ? 4 : 1);
    assert.equal(board.scene.elements.find(e => e.type === 'wave').frequencyHz, selected === 'frequency' ? 1000 : 100);
  }
});

for (const id of ['reflect', 'sound-wave', 'sound-string', 'sound-speed', 'force-spring', 'force-arrow', 'force-balance']) for (const rate of [.5, 2]) for (const reduced of [false, true]) {
  test(`${id}・${rate}倍・動きをへらす${reduced}: 読む時間と間を待ち、停止中は待つ時間も止まる`, () => {
    const ui = screen('?board=' + id, 375, { reduced, saved: JSON.stringify({ teacher: 'A', rate }) }); startLesson(ui);
    const board = boards.get(id), steps = boardScripts(id).BOARDS[id];
    const timeline = explain.buildTimeline(steps, board.scene, scene.trace(board.scene), scene.handles(board.scene), {
      readMs: steps.map(step => explain.readMs(step.lines.A)),
    });
    const draw = reduced ? timeline.steps[0].parts.length : timeline.steps[0].drawDuration;
    const duration = (Math.max(draw, explain.readMs(steps[0].lines.A)) + 1500) / rate;
    ui.advance(duration - 1); assert.equal(currentWords(ui), steps[0].lines.A);
    ui.button('止める').dispatch('click'); ui.advance(60000);
    assert.equal(currentWords(ui), steps[0].lines.A);
    ui.button('▶ 再生').dispatch('click'); ui.advance(1);
    assert.equal(currentWords(ui), steps[1].lines.A);
    // 次へは読み終える前でも描き終わり、その次のクリックで次の手に進める。
    ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
    assert.equal(currentWords(ui), steps[2].lines.A);
  });
}

for (const id of ['reflect', 'sound-wave', 'sound-string', 'sound-speed', 'force-spring', 'force-arrow', 'force-balance']) {
  test(`${id}: 音声の読みこみ失敗・途中オフでも読む時間を待つ`, async () => {
    for (const failure of [true, false]) {
      const ui = screen('?board=' + id, 375, { fetch: async () => ({ ok: !failure, blob: async () => ({}) }) });
      ui.api.app.start(ui.host); await settle(); ui.button('音声ありで見る').dispatch('click'); await settle();
      if (!failure) ui.button('🔊 音声オン').dispatch('click');
      assert.equal(ui.find(el => el.className === 'voice-message').hidden, !failure);
      const steps = boardScripts(id).BOARDS[id];
      const duration = explain.readMs(steps[0].lines.E) + 1500;
      ui.advance(duration - 1); assert.equal(currentWords(ui), steps[0].lines.E);
      ui.advance(1); assert.equal(currentWords(ui), steps[1].lines.E);
    }
  });
}

test('光から音へ先生・音声・速さを引き継ぎ、音声は開いた盤の sound パスから準備する', async () => {
  const urls = [], ui = screen('?board=reflect', 375, { fetch: async url => { urls.push(url); return { ok: true, blob: async () => ({}) }; } });
  ui.api.app.start(ui.host);
  elements(ui, el => el.attributes.role === 'radio')[2].dispatch('click');
  await settle(); ui.button('音声ありで見る').dispatch('click'); ui.button('＋').dispatch('click');
  ui.button('← ボード一覧').dispatch('click'); urls.length = 0;
  ui.button('音の大きさと高さ').dispatch('click'); await settle();
  assert.equal(elements(ui, el => el.attributes.role === 'radio')[2].attributes['aria-checked'], 'true');
  assert.equal(ui.button('音声ありで見る').className, 'btn main');
  assert.ok(ui.host.textContent.includes('1.25 倍'));
  assert.equal(urls.length, 9);
  assert.ok(urls.every(url => url.startsWith('assets/audio/sound/sound-wave/C/')));
  assert.deepEqual(ui.saved.at(-1), { teacher: 'C', voice: true, rate: 1.25 });
  const reopened = screen('?board=sound-speed', 375, { saved: JSON.stringify(ui.saved.at(-1)) });
  reopened.api.app.start(reopened.host); await settle();
  assert.equal(elements(reopened, el => el.attributes.role === 'radio')[2].attributes['aria-checked'], 'true');
  assert.equal(reopened.button('音声ありで見る').className, 'btn main');
  assert.ok(reopened.host.textContent.includes('1.25 倍'));
});

test('ホームを単元ごとに並べ、音の凡例・切り替え・単元の担当先生を表示する', () => {
  const ui = screen(); ui.api.app.start(ui.host);
  assert.deepEqual(elements(ui, el => el.tagName === 'h2').map(el => el.textContent), boards.units().map(unit => unit.title + ' ― ボードをえらぶ'));
  assert.equal(elements(ui, el => el.className === 'row').length, boards.list().length);
  assert.ok(ui.host.textContent.includes('図や値がその場で変わります。'));
  assert.ok(!ui.host.textContent.includes('NEW'));
  ui.button('音の速さ').dispatch('click');
  assert.equal(ui.doc.title, '音の速さ | ひかりボード');
  assert.equal(elements(ui, el => el.attributes.role === 'radio')[4].attributes['aria-checked'], 'true');
  assert.equal(ui.find(el => el.className === 'legend').textContent, '点線（‥‥）＝ 光（すぐに届く）／ 破線（－ －）＝ 音の波');
  ui.button('← ボード一覧').dispatch('click'); ui.button('弦の音').dispatch('click');
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  for (const label of ['弦の太さ', '弦の張り']) assert.ok(ui.find(el => el.attributes['aria-label'] === label));
  ui.button('太い').dispatch('click'); assert.equal(ui.button('太い').attributes['aria-pressed'], 'true');
  ui.button('強い').dispatch('click'); assert.equal(ui.button('強い').attributes['aria-pressed'], 'true');
});

for (const id of ['sound-wave', 'sound-string', 'sound-speed']) {
  test(`${id}: 音声ありの手には読む時間を加えず、音声と描画の終了を待つ`, async () => {
    const optionsSeen = [], ui = screen('?board=' + id, 375, { explain: { ...explain, buildTimeline(...args) {
      optionsSeen.push(args[4]); return explain.buildTimeline(...args);
    } } });
    ui.api.app.start(ui.host); await settle(); ui.button('音声ありで見る').dispatch('click');
    const options = optionsSeen.at(-1);
    assert.ok(Array.isArray(options.clipSeconds)); assert.equal(options.readMs, undefined);
    const board = boards.get(id), steps = scriptsSound.BOARDS[id];
    const timeline = explain.buildTimeline(steps, board.scene, scene.trace(board.scene), scene.handles(board.scene), options);
    ui.audios[0].onended();
    ui.advance(timeline.steps[0].drawDuration + 1499); assert.equal(currentWords(ui), steps[0].lines.E);
    ui.advance(1); assert.equal(currentWords(ui), steps[1].lines.E);
  });
}

test('未保存の先生は units の担当に従い、保存済みの先生は優先する', () => {
  for (const saved of [null, JSON.stringify({ teacher: 'B' })]) {
    const ui = screen('?board=sound-wave', 375, { saved });
    ui.api.boards = { ...boards, units: () => boards.units().map(unit => ({ ...unit, teacher: 'F' })) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), { document: ui.doc, URL, Hikari: ui.api });
    ui.api.app.start(ui.host);
    const chosen = elements(ui, el => el.attributes.role === 'radio').findIndex(el => el.attributes['aria-checked'] === 'true');
    assert.equal(chosen, saved ? 1 : 5);
  }
});

const soundKeys = [
  ['sound-wave', 'amplitude', 'amplitude', 1, 4, 1, 'ArrowUp', 'ArrowDown'],
  ['sound-wave', 'frequency', 'frequencyHz', 100, 1000, 50, 'ArrowLeft', 'ArrowRight'],
  ['sound-string', 'bridge', 'lengthPercent', 50, 100, 5, 'ArrowRight', 'ArrowLeft'],
  ['sound-string', 'pluck', 'pluck', 1, 4, 1, 'ArrowUp', 'ArrowDown'],
  ['sound-speed', 'move', 'distance', 170, 1700, 34, 'ArrowRight', 'ArrowLeft'],
];

for (const [id, handle, field, min, max, step, increase, decrease] of soundKeys) {
  test(`${id} ${handle}: 全値・全方向のキーで1きざみ進み、端と無関係な方向では止まる`, () => {
    const ui = screen(), board = boards.get(id);
    const renderer = ui.api.boardView.create(ui.host, board);
    for (let value = min; value <= max; value += step) for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const current = boards.get(id).scene;
      current.elements.find(e => field in e)[field] = value;
      renderer.setScene(current);
      const expected = JSON.parse(JSON.stringify(current));
      expected.elements.find(e => field in e)[field] = Math.max(min, Math.min(max,
        value + (key === increase ? step : key === decrease ? -step : 0)));
      const knob = ui.find(el => el.attributes['data-handle'] === handle);
      knob.focus(); knob.dispatch('keydown', { key });
      assert.deepEqual(board.scene, expected, value + ': ' + key);
      assert.deepEqual(scene.validateScene(board.scene), []);
      assert.equal(ui.doc.activeElement, knob);
      assert.equal(ui.find(el => el.className === 'board-error').hidden, true);
      ui.mutations.length = 0;
    }
    renderer.destroy();
  });

  test(`${id} ${handle}: 最小から最大・最大から最小まで飛ばさず進み、画面の値と達成判定が合う`, () => {
    let current = boards.get(id).scene;
    const ui = screen('?board=' + id, 375, { scene: { ...scene, stepSoundHandle(...args) {
      current = scene.stepSoundHandle(...args); return current;
    } } });
    const app = ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
    const completed = new Set(), board = boards.get(id);
    function check() {
      assert.deepEqual(scene.validateScene(current), []);
      const wave = current.elements.find(e => e.type === 'wave'), string = current.elements.find(e => e.type === 'string');
      const distance = current.elements.find(e => e.type === 'listener')?.distance;
      const frequency = string ? 20000 / string.lengthPercent : null;
      const expected = wave ? ['振動数 ' + wave.frequencyHz + ' Hz', '振幅 目もり ' + wave.amplitude + ' つ分'] :
        string ? ['音の高さ ' + (frequency === 250 ? 'はじめと同じ' : frequency > 250 ? 'はじめより高い' : 'はじめより低い'),
          '音の大きさ ' + (string.pluck === 2 ? 'はじめと同じ' : string.pluck > 2 ? 'はじめより大きい' : 'はじめより小さい')] :
          ['花火まで ' + distance + ' m', '聞こえるまで ' + (distance / 340).toFixed(1) + ' 秒', '音の速さ 約 340 m/s'];
      assert.deepEqual(ui.find(el => el.className === 'readout').children.map(el => el.textContent), expected);
      const achieved = wave ? [wave.amplitude === 4, wave.frequencyHz === 500, wave.frequencyHz === 100] :
        string ? [frequency > 250, false, string.pluck > 2] : [distance === 170, distance === 340, distance === 1700];
      achieved.forEach((done, i) => { if (done) completed.add(i); });
      board.prompts.forEach((prompt, i) => {
        const row = ui.find(el => el.className.split(' ').includes('try') && el.textContent.includes(prompt.text));
        assert.equal(row.className.split(' ').includes('done'), completed.has(i));
      });
      ui.mutations.length = 0;
    }
    function press(key) { ui.find(el => el.attributes['data-handle'] === handle).dispatch('keydown', { key }); check(); }
    check();
    while (current.elements.find(e => field in e)[field] > min) press(decrease);
    for (const [key, start, end, delta] of [[increase, min, max, step], [decrease, max, min, -step]]) {
      const seen = [start];
      for (let value = start + delta; delta > 0 ? value <= end : value >= end; value += delta) {
        press(key); seen.push(current.elements.find(e => field in e)[field]);
        assert.equal(seen.at(-1), value);
      }
      assert.equal(seen.length, (max - min) / step + 1);
      press(key); assert.equal(current.elements.find(e => field in e)[field], end);
    }
    app.destroy();
  });
}

test('弦の4通りの切り替えで見える見出し・チェック・aria-pressedをそろえる', () => {
  const ui = screen('?board=sound-string'); ui.api.app.start(ui.host);
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  for (const thickness of ['細い', '太い']) for (const tension of ['弱い', '強い']) {
    ui.button(thickness).dispatch('click'); ui.button(tension).dispatch('click');
    for (const [name, choices, selected] of [['弦の太さ', ['細い', '太い'], thickness], ['弦の張り', ['弱い', '強い'], tension]]) {
      const group = ui.find(el => el.attributes['aria-label'] === name);
      assert.equal(group.children[0].className, 'seg-name');
      assert.equal(group.children[0].textContent, name); assert.equal(group.children[0].hidden, false);
      assert.equal(group.hidden, false); assert.equal(group.parent.hidden, false);
      for (const label of choices) {
        assert.equal(ui.button(label).textContent, (label === selected ? '✓ ' : '') + label);
        assert.equal(ui.button(label).attributes['aria-pressed'], String(label === selected));
      }
    }
  }
});

test('屈折の切り替えの文と構造は変わらない', () => {
  const ui = screen('?board=refract'); ui.api.app.start(ui.host);
  ui.button('説明をとばして、すぐ動かす').dispatch('click');
  for (const control of boards.get('refract').controls) for (const choice of control.choices) {
    const el = ui.find(el => el.tagName === 'button' && el.textContent === choice.label);
    el.dispatch('click');
    assert.equal(el.textContent, choice.label); assert.equal(el.attributes['aria-pressed'], 'true');
    assert.ok(el.parent.children.every(child => child.tagName === 'button'));
    assert.equal(el.parent.className, 'seg');
  }
});

test('光の6盤の全つまみは矢印キーで従来の4単位の座標移動を使う', () => {
  for (const { id } of boards.list().filter(board => board.unit === 'light')) {
    const ui = screen(), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    for (const handle of scene.handles(board.scene)) for (const [key, dx, dy] of [
      ['ArrowLeft', -4, 0], ['ArrowRight', 4, 0], ['ArrowUp', 0, -4], ['ArrowDown', 0, 4],
    ]) {
      const initial = boards.get(id).scene; renderer.setScene(initial);
      const expected = scene.moveElement(initial, handle.elementId, handle.handle, { x: handle.x + dx, y: handle.y + dy });
      ui.find(el => el.attributes['data-element-id'] === handle.elementId && el.attributes['data-handle'] === handle.handle)
        .dispatch('keydown', { key });
      assert.deepEqual(board.scene, expected);
    }
    renderer.destroy();
  }
});
// 力の3盤は、エンジンが許す全82配置を画面にも渡す。
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`); }

function forceVariants(id) {
  const variants = [];
  if (id === 'force-spring') for (const spring of ['A', 'B']) for (let weights = 0; weights <= 5; weights++) {
    const current = boards.get(id).scene; current.options = { spring, weights }; variants.push(current);
  }
  if (id === 'force-arrow') for (const direction of ['up', 'down', 'left', 'right']) for (let newtons = 1; newtons <= 5; newtons++) {
    const current = boards.get(id).scene; Object.assign(current.elements.find(e => e.type === 'force'), { direction, newtons }); variants.push(current);
  }
  if (id === 'force-balance') for (const line of ['same', 'offset']) for (let left = 1; left <= 5; left++) for (let right = 1; right <= 5; right++) {
    const current = boards.get(id).scene; current.options.line = line;
    current.elements.find(e => e.side === 'left').newtons = left;
    current.elements.find(e => e.side === 'right').newtons = right; variants.push(current);
  }
  return variants;
}

for (const width of [279, 319, 335, 375, 700, 768, 1100]) for (const id of ['force-spring', 'force-arrow', 'force-balance']) {
  test(`${id}: 幅${width}px・全配置で文字とつまみを盤内に収め、図・値を描く`, () => {
    const ui = screen('', width), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    const variants = forceVariants(id), size = view.sizes(width);
    assert.equal(variants.length, { 'force-spring': 12, 'force-arrow': 20, 'force-balance': 50 }[id]);
    for (const current of variants) {
      assert.doesNotThrow(() => renderer.setScene(current));
      const result = scene.trace(current), data = boardView.labelData(board, result, size);
      const placed = view.placeLabels(data.labels, data.obstacles, size, boardView.lineData(current, result));
      assert.ok(placed.every(p => !p.hidden), JSON.stringify(current) + ': ' + placed.filter(p => p.hidden).map(p => p.id));
      const renderedLabels = elements(ui, el => el.tagName === 'text' && el.attributes.class !== 'knob-mark');
      assert.equal(renderedLabels.length, data.labels.length);
      data.labels.forEach(label => assert.ok(renderedLabels.some(el => el.textContent === (label.lines || [label.text]).join('')), label.id));
      const boxes = labelBoxes(data.labels, placed); assertClear(boxes);
      assertLinesClear(data.labels, placed, boardView.lineData(current, result), size);
      boxes.forEach(box => {
        assertCirclesClear(box, data.obstacles);
        for (const rect of data.obstacles.filter(o => Number.isFinite(o.left))) assert.ok(!overlap(box, rect), box.id);
      });
      for (const el of elements(ui, () => true)) {
        assert.doesNotMatch(JSON.stringify(el.attributes), /NaN|Infinity|undefined/);
        if (el.tagName === 'text') assert.ok(Number(el.attributes['font-size']) / size.unitPerPx >= 16 - 1e-8);
      }
      for (const h of view.forceHandles(scene.handles(current), result, size)) {
        const knob = ui.find(el => el.attributes['data-element-id'] === h.elementId && el.attributes['data-handle'] === h.handle);
        const hit = knob.children.at(-1), r = Number(hit.attributes.r);
        assert.ok(r / size.unitPerPx >= 24);
        const visibleRadius = size.knobRadius + size.unitPerPx;
        assert.ok(h.x - visibleRadius >= 0 && h.x + visibleRadius <= 600 && h.y - visibleRadius >= 0 && h.y + visibleRadius <= 420);
        assert.equal(knob.attributes.transform, `translate(${h.x} ${h.y})`);
        assert.equal(knob.children.find(el => el.tagName === 'text').textContent, id === 'force-arrow' ? '✥' : '↔');
        const vector = result.force.arrow || result.force.pulls[h.elementId];
        const head = ui.find(el => el.attributes['data-force-head'] === (result.force.arrow ? 'arrow' : 'pulls') &&
          (!result.force.pulls || el.attributes['data-side'] === h.elementId));
        assert.ok(head && visible(head));
        const triangle = head.children.find(el => el.tagName === 'polygon');
        assert.ok(triangle);
        const points = triangle.attributes.points.split(' ').map(p => p.split(',').map(Number));
        near(points[0][0], vector.to.x); near(points[0][1], vector.to.y);
        const length = Math.hypot(vector.to.x - vector.from.x, vector.to.y - vector.from.y);
        const dx = (vector.to.x - vector.from.x) / length, dy = (vector.to.y - vector.from.y) / length;
        assert.ok(points.every(([x, y]) => (h.x - x) * dx + (h.y - y) * dy > size.knobRadius));
        assert.equal(length, current.elements.find(e => e.id === h.elementId).newtons * 32);
      }
      if (id === 'force-arrow') {
        const label = data.labels.find(l => l.id === 'mark-application'), place = placed.find(p => p.id === label.id), point = result.force.application;
        const leader = ui.find(el => el.attributes['data-force'] === 'application-leader');
        assert.ok(Math.hypot(place.x - point.x, place.y - point.y) <= 60 || leader && visible(leader));
        if (leader) { near(Number(leader.attributes.x1), point.x); near(Number(leader.attributes.y1), point.y); }
        const box = view.labelBox({ ...label, ...place });
        for (const head of elements(ui, el => el.attributes['data-force-head'])) for (const polygon of head.children) {
          const points = polygon.attributes.points.split(' ').map(p => p.split(',').map(Number));
          assert.ok(!overlap(box, { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
            top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) }));
        }
      }
      if (id === 'force-balance') assert.ok(!renderedLabels.some(el => el.textContent === '作用点'));
      if (id === 'force-spring') {
        const path = ui.find(el => el.attributes['data-force'] === 'spring').attributes.d;
        assert.deepEqual(path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number), result.force.spring.points.flatMap(p => [p.x, p.y]));
        assert.equal(!!ui.find(el => el.attributes['data-force'] === 'forceArrow'), current.options.weights > 0);
        const head = ui.find(el => el.attributes['data-force-head'] === 'forceArrow');
        assert.equal(!!head, current.options.weights > 0);
        if (head) {
          const points = head.children[0].attributes.points.split(' ').map(p => p.split(',').map(Number));
          near(points[0][0], result.force.forceArrow.to.x); near(points[0][1], result.force.forceArrow.to.y);
          assert.ok(points.every(([, y]) => y >= result.force.weights.at(-1).y + result.force.weights.at(-1).height && y < 390));
          assert.ok((Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) / size.unitPerPx > 3);
          const forceLabel = data.labels.find(l => l.id === 'mark-force'), forcePlace = placed.find(p => p.id === forceLabel.id);
          const box = view.labelBox({ ...forceLabel, ...forcePlace }), vector = result.force.forceArrow, middle = (vector.from.y + vector.to.y) / 2;
          assert.ok(box.left > vector.to.x && box.top <= middle && box.bottom >= middle);
        }
        assert.equal(!!ui.find(el => el.attributes['data-force'] === 'stretch'), current.options.weights > 0);
        assert.equal(elements(ui, el => el.attributes['data-force'] === 'point').length, 6);
        if (!current.options.weights) assert.deepEqual(boards.readout(id, result.measures, current).map(v => v.text), ['力の大きさ 0 N', 'ばねののび 0 cm']);
      }
      ui.mutations.length = 0;
    }
    renderer.destroy();
  });
}

for (const id of ['force-arrow', 'force-balance']) {
  test(`${id}: 全配置・全方向のキーで1 Nきざみ、直角では向きだけ変え、端で止まる`, () => {
    const ui = screen(), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    const directions = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    for (const current of forceVariants(id)) for (const h of scene.handles(current)) for (const [key, direction] of Object.entries(directions)) {
      renderer.setScene(current);
      const expected = structuredClone(current), e = expected.elements.find(e => e.id === h.elementId), oldDirection = e.direction || e.side;
      if (direction === oldDirection) e.newtons = Math.min(5, e.newtons + 1);
      else if (direction === opposite[oldDirection]) e.newtons = Math.max(1, e.newtons - 1);
      else if (e.type === 'force') e.direction = direction;
      const knob = ui.find(el => el.attributes['data-element-id'] === h.elementId);
      knob.focus(); knob.dispatch('keydown', { key });
      assert.deepEqual(board.scene, expected); assert.deepEqual(scene.validateScene(board.scene), []);
      assert.equal(ui.doc.activeElement, knob); ui.mutations.length = 0;
    }
    renderer.destroy();
  });
}

for (const id of ['force-spring', 'force-arrow', 'force-balance']) {
  test(`${id}: 操作後の図・値・課題判定・切り替えの見出しが一致する`, () => {
    let current = boards.get(id).scene;
    const ui = screen('?board=' + id, 375, { scene: { ...scene,
      stepHandle(...args) { current = scene.stepHandle(...args); return current; },
      setOption(...args) { current = scene.setOption(...args); return current; },
    } });
    ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
    const completed = new Set(), board = boards.get(id);
    function check() {
      const result = scene.trace(current), readout = ui.find(el => el.className === 'readout');
      assert.deepEqual(readout.children.map(el => el.textContent), boards.readout(id, result.measures, current).map(v => v.text));
      if (id === 'force-balance') assert.equal(readout.children[2].className, result.measures.state === 'balanced' ? 'balanced' : 'out');
      board.prompts.forEach((p, i) => {
        if (boards.checkPrompt(p, result.measures, current)) completed.add(i);
        const row = ui.find(el => el.className.split(' ').includes('try') && el.textContent.includes(p.text));
        assert.equal(row.className.split(' ').includes('done'), completed.has(i));
      });
      for (const control of board.controls) {
        const title = { weights: 'おもりの数', spring: 'ばね', line: '2 つの力' }[control.key];
        const group = ui.find(el => el.attributes['aria-label'] === title);
        assert.equal(group.children[0].textContent, title); assert.equal(group.children[0].hidden, false);
        assert.equal(group.hidden || group.parent.hidden, false);
        control.choices.forEach((choice, i) => {
          const selected = current.options[control.key] === choice.value, button = group.children[i + 1];
          assert.equal(button.textContent, (selected ? '✓ ' : '') + choice.label);
          assert.equal(button.attributes['aria-pressed'], String(selected));
        });
      }
      ui.mutations.length = 0;
    }
    function option(key, value) {
      const title = { weights: 'おもりの数', spring: 'ばね', line: '2 つの力' }[key];
      const control = board.controls.find(c => c.key === key), group = ui.find(el => el.attributes['aria-label'] === title);
      group.children[control.choices.findIndex(c => c.value === value) + 1].dispatch('click'); check();
    }
    function press(element, key, times = 1) {
      for (let i = 0; i < times; i++) { ui.find(el => el.attributes['data-element-id'] === element).dispatch('keydown', { key }); check(); }
    }
    check();
    if (id === 'force-spring') {
      for (const spring of ['A', 'B']) { option('spring', spring); for (let n = 0; n <= 5; n++) option('weights', n); }
      assert.ok(ui.find(el => el.attributes['data-force'] === 'graph-line'));
    } else if (id === 'force-arrow') {
      press('force', 'ArrowRight', 3); press('force', 'ArrowLeft', 3); press('force', 'ArrowUp');
      press('force', 'ArrowLeft'); press('force', 'ArrowLeft', 2);
    } else {
      press('left', 'ArrowLeft', 3); press('right', 'ArrowRight', 3);
      press('left', 'ArrowRight'); press('left', 'ArrowLeft'); option('line', 'offset'); option('line', 'same');
    }
    assert.equal(completed.size, 3);
  });
}

for (const from of ['reflect', 'sound-wave']) for (const to of ['force-spring', 'force-arrow', 'force-balance']) {
  test(`${from}から${to}へ先生・音声・速さを引き継ぎ、forceの音声を読む`, async () => {
    const urls = [], ui = screen('?board=' + from, 375, { fetch: async url => { urls.push(url); return { ok: true, blob: async () => ({}) }; } });
    ui.api.app.start(ui.host); elements(ui, el => el.attributes.role === 'radio')[2].dispatch('click');
    await settle(); ui.button('音声ありで見る').dispatch('click'); ui.button('＋').dispatch('click');
    ui.button('← ボード一覧').dispatch('click'); urls.length = 0;
    ui.button(boards.get(to).title).dispatch('click'); await settle();
    assert.equal(elements(ui, el => el.attributes.role === 'radio')[2].attributes['aria-checked'], 'true');
    assert.equal(ui.button('音声ありで見る').className, 'btn main'); assert.ok(ui.host.textContent.includes('1.25 倍'));
    assert.equal(urls.length, scriptsForce.BOARDS[to].length);
    assert.ok(urls.every(url => url.startsWith('assets/audio/force/' + to + '/C/')));
    assert.deepEqual(ui.saved.at(-1), { teacher: 'C', voice: true, rate: 1.25 });
  });
}

test('切り替えは全幅で折り返せる構造で、高さ44px以上・選択表示・状態色を保つ', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/app.css'), 'utf8');
  assert.match(css, /\.seg\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.seg-name\s*\{[^}]*flex-basis:\s*100%/);
  assert.match(css, /\.seg button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.readout \.balanced\s*\{\s*color:\s*var\(--green\)/);
  assert.match(css, /\.readout \.out\s*\{\s*color:\s*var\(--red\)/);
  for (const width of [319, 375, 768, 1100]) for (const id of ['force-spring', 'force-balance']) {
    const ui = screen('?board=' + id, width); ui.api.app.start(ui.host); ui.button('説明をとばして、すぐ動かす').dispatch('click');
    const groups = elements(ui, el => el.className === 'seg');
    assert.equal(groups.length, id === 'force-spring' ? 2 : 1);
    for (const group of groups) for (const button of group.children.filter(el => el.tagName === 'button')) {
      // 模擬 DOM ではレイアウトしないため、指定の文字幅と左右paddingの上限を確かめる。
      assert.ok(Array.from(button.textContent).length * 16 + 32 <= width - 64);
    }
  }
});

function springCoordinates(ui) {
  const path = ui.find(el => el.attributes['data-force'] === 'spring');
  const coordinates = path.attributes.d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
  assert.doesNotMatch(path.attributes.d, /NaN|Infinity|undefined/);
  assert.ok(coordinates.every(Number.isFinite));
  return coordinates;
}

for (const teacher of scripts.TEACHERS) test(`ばね・先生${teacher.id}: 自然長から16ms刻みで伸び、完成・巻き戻しでも手に合う長さになる`, () => {
  const { ui, board, renderer, calls } = animationBoard('force-spring', 279), result = scene.trace(board.scene);
  const spring = result.force.spring, steps = scriptsForce.BOARDS[board.id];
  const timeline = explain.buildTimeline(steps, board.scene, result, [], {
    clipSeconds: require('../content/voice-force.js').CLIPS[board.id][teacher.id].map(clip => clip[1]),
  });
  const set = (index, time) => renderer.setState(explain.stateAt(timeline, index, time), timeline.steps[index].start + time);
  set(0, timeline.steps[0].duration);
  near(springCoordinates(ui).at(-1), spring.naturalBottom.y);
  assert.equal(visibleElements(ui, el => el.tagName === 'rect' && Number(el.attributes.width) === 32).length, 0);
  assert.equal(visibleElements(ui, el => el.attributes['data-force'] === 'stretch').length, 0);
  ui.mutations.length = 0;
  let previous = spring.naturalBottom.y, intermediate = false;
  const second = timeline.steps[1], weights = second.parts.find(p => p.items.some(item => item.ref.source === 'force' && item.ref.key === 'weights'));
  for (let time = 0; time <= second.drawDuration; time += 16) {
    set(1, time);
    const bottom = springCoordinates(ui).at(-1);
    assert.ok(bottom >= previous && bottom <= spring.bottom.y);
    if (time > weights.start && time < weights.start + weights.duration) {
      assert.ok(bottom > spring.naturalBottom.y && bottom < spring.bottom.y);
      intermediate = true;
    }
    previous = bottom;
  }
  assert.ok(intermediate);
  for (let index = 1; index < timeline.steps.length; index++) {
    set(index, timeline.steps[index].duration);
    assert.deepEqual(springCoordinates(ui), spring.points.flatMap(p => [p.x, p.y]));
  }
  set(0, timeline.steps[0].duration);
  assert.deepEqual(springCoordinates(ui), spring.naturalPoints.flatMap(p => [p.x, p.y]));
  assertNoStructureChanges(ui);
  assert.deepEqual(calls, { trace: 1, handles: 1, sizes: 1, placeLabels: 1, change: 1 });
  renderer.setState(explain.finalState(timeline));
  const final = springCoordinates(ui);
  renderer.setState(null);
  assert.deepEqual(springCoordinates(ui), final);
  renderer.destroy();
});

for (const reduced of [false, true]) test(`ばね: もどる・1手目からとばす・動きをへらす${reduced}でも長さを切り替える`, () => {
  const ui = screen('?board=force-spring', 279, { reduced }); startLesson(ui);
  const spring = scene.trace(boards.get('force-spring').scene).force.spring;
  ui.button('次へ ▶').dispatch('click');
  near(springCoordinates(ui).at(-1), spring.naturalBottom.y);
  ui.button('次へ ▶').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  near(springCoordinates(ui).at(-1), spring.bottom.y);
  ui.button('◀ もどる').dispatch('click'); ui.button('次へ ▶').dispatch('click');
  near(springCoordinates(ui).at(-1), spring.naturalBottom.y);
  ui.button('とばして自分で動かす').dispatch('click');
  assert.deepEqual(springCoordinates(ui), spring.points.flatMap(p => [p.x, p.y]));
});

for (const id of ['force-arrow', 'force-balance']) test(`${id}: ずらしたつまみの中心からつかみ、指のずれを引いてドラッグする`, () => {
  for (const width of [279, 700]) {
    const ui = screen('', width), board = boards.get(id), renderer = ui.api.boardView.create(ui.host, board);
    const svg = ui.find(el => el.tagName === 'svg');
    const pointer = p => ({ pointerId: 7, clientX: 20 + p.x * width / 600, clientY: 40 + p.y * width / 600 });
    for (const current of forceVariants(id)) for (const h of view.forceHandles(scene.handles(current), scene.trace(current), view.sizes(width))) {
      renderer.setScene(current);
      const knob = ui.find(el => el.attributes['data-element-id'] === h.elementId);
      knob.dispatch('pointerdown', pointer(h));
      assert.equal(svg.capture, 7); assert.equal(ui.doc.activeElement, knob);
      svg.dispatch('pointermove', pointer(h));
      assert.deepEqual(board.scene, current);
      const before = board.scene, element = before.elements.find(e => e.id === h.elementId);
      const origin = scene.trace(before).force.arrow?.from || scene.trace(before).force.pulls[h.elementId].from;
      const dx = h.offset.x ? Math.sign(h.offset.x) : 0, dy = h.offset.y ? Math.sign(h.offset.y) : 0;
      const value = element.newtons === 5 ? 4 : element.newtons + 1;
      const target = { x: origin.x + dx * value * 32, y: origin.y + dy * value * 32 };
      svg.dispatch('pointermove', pointer({ x: target.x + h.offset.x, y: target.y + h.offset.y }));
      assert.deepEqual(board.scene, scene.moveElement(before, h.elementId, h.handle, target));
      assert.equal(board.scene.elements.find(e => e.id === h.elementId).newtons, value);
      if (id === 'force-arrow') {
        const nextTarget = { x: origin.x + (dy ? 96 : 0), y: origin.y + (dx ? -96 : 0) };
        const expected = scene.moveElement(board.scene, h.elementId, h.handle, nextTarget);
        svg.dispatch('pointermove', pointer({ x: nextTarget.x + h.offset.x, y: nextTarget.y + h.offset.y }));
        assert.deepEqual(board.scene, expected);
        assert.notEqual(board.scene.elements[1].direction, element.direction);
      }
      svg.dispatch('pointerup', { pointerId: 7 }); assert.equal(svg.capture, null);
      ui.mutations.length = 0;
    }
    renderer.destroy();
  }
});

test('力の線は起点から先へ伸び、重要語句は書き進め、通常の文字は浮かび、pointは指す', () => {
  for (const [id, token, name] of [['force-spring', 'el:spring', 'spring'], ['force-spring', 'graph-line', 'graph-line'], ['force-arrow', 'force', 'arrow']]) {
    const { ui, board, renderer } = animationBoard(id, 375), result = scene.trace(board.scene);
    renderer.setState(drawing(board, token, .5), 200);
    const el = ui.find(el => el.attributes['data-force'] === name);
    if (name === 'spring') {
      const coords = el.attributes.d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
      assert.deepEqual(coords.slice(0, 2), [result.force.spring.top.x, result.force.spring.top.y]);
      assert.ok(coords.at(-1) > result.force.spring.top.y && coords.at(-1) < result.force.spring.bottom.y);
    } else {
      const vector = name === 'arrow' ? result.force.arrow : result.force.graph.line;
      assert.equal(Number(el.attributes.x1), vector.from.x); assert.equal(Number(el.attributes.y1), vector.from.y);
      assert.equal(Number(el.attributes.x2), (vector.from.x + vector.to.x) / 2);
      assert.equal(Number(el.attributes.y2), (vector.from.y + vector.to.y) / 2);
    }
    assert.ok(penTip(ui).every(Number.isFinite)); renderer.destroy();
  }
  const { ui, board, renderer } = animationBoard('force-arrow', 375), result = scene.trace(board.scene);
  const timeline = explain.buildTimeline(scriptsForce.BOARDS[board.id], board.scene, result, scene.handles(board.scene));
  for (const [key, word] of [['application', '作用点'], ['direction', '力の向き']]) {
    const step = timeline.steps.find(step => step.parts.some(p => p.token === key));
    const part = step.parts.find(p => p.items.some(item => item.key));
    assert.ok(part);
    renderer.setState(explain.stateAt(timeline, step.index, part.start + part.duration / 2), step.start + part.start + part.duration / 2);
    const text = visibleElements(ui, el => el.tagName === 'text' && el.textContent === word)[0];
    assert.ok(text.hasAttribute('clip-path')); assert.ok(penTip(ui).every(Number.isFinite));
  }
  const normalStep = timeline.steps[0], normal = normalStep.parts.find(p => p.items.some(item => item.type === 'text'));
  renderer.setState(explain.stateAt(timeline, 0, normal.start + normal.duration / 2), 100);
  const box = visibleElements(ui, el => el.tagName === 'text' && el.textContent === '箱')[0];
  assert.equal(box.hasAttribute('clip-path'), false); assert.ok(Number(box.attributes.opacity) > 0 && Number(box.attributes.opacity) < 1);
  for (const [id, tokens] of [['force-spring', ['point:weights', 'point:controls']], ['force-arrow', ['point:force']],
    ['force-balance', ['point:pulls', 'point:card', 'point:state', 'point:controls']]]) {
    const a = animationBoard(id, 375);
    for (const token of tokens) {
      a.renderer.setState(drawing(a.board, token, .5), 200);
      assert.ok(visibleElements(a.ui, el => el.tagName === 'circle' && el.attributes.fill === 'none' && Number(el.attributes.opacity) > 0).length > 0, token);
    }
    a.renderer.destroy();
  }
});

for (const width of [279, 700]) for (const id of ['bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex']) for (const teacher of scripts.TEACHERS) {
  test(`${id}・先生${teacher.id}・${width}px: 全手を16ms刻みで描き、ペンが有限で最後は操作時と同じ絵になる`, () => {
    const { ui, board, renderer, calls } = animationBoard(id, width), steps = boardScripts(id).BOARDS[id];
    const result = bioResult(ui, board.scene);
    for (const step of steps) for (const token of step.draw) assert.ok(explain.resolve(token, board.scene, result, scene.handles(board.scene)).items.length, token);
    const timeline = explain.buildTimeline(steps, board.scene, result, scene.handles(board.scene), {
      clipSeconds: require('../content/voice-bio2.js').CLIPS[id][teacher.id].map(clip => clip[1]),
    });
    const before = { ...calls };
    ui.mutations.length = 0;
    for (const step of timeline.steps) for (let time = 0; time <= step.duration; time += 16) {
      assert.doesNotThrow(() => renderer.setState(explain.stateAt(timeline, step.index, time), step.start + time));
      const pen = ui.find(el => el.attributes.class === 'pen');
      if (pen.hasAttribute('transform')) assert.ok(penTip(ui).every(Number.isFinite));
    }
    renderer.setState(explain.finalState(timeline), timeline.total);
    assertNoStructureChanges(ui);
    assert.deepEqual(calls, before);
    function artSnapshot() {
      return visibleElements(ui, el => ['path', 'line', 'rect', 'polygon', 'circle', 'ellipse', 'text', 'image'].includes(el.tagName) && el.attributes.class !== 'pen' &&
        !el.parent?.attributes['data-handle'] && el.parent?.tagName !== 'clipPath').map(el => {
        const attrs = { ...el.attributes };
        if (attrs.filter) attrs.filter = 'sketch';
        delete attrs.display;
        return { tag: el.tagName, text: el.textContent, attrs };
      });
    }
    const final = artSnapshot();
    const below = visibleElements(ui, el => el.attributes['data-picture-below'] && !el.hidden).map(el => el.textContent);
    renderer.setState(null);
    assert.deepEqual(artSnapshot(), final);
    assert.deepEqual(visibleElements(ui, el => el.attributes['data-picture-below']).map(el => el.textContent), below);
    assert.equal(!!ui.find(el => el.attributes.class === 'handle'), scene.handles(board.scene).length > 0);
  });
}
