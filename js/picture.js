// 画像の盤の分類と配置。画面に依存せず、描く部品を返す。
(function (root) {
  'use strict';
  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const L = config.picture;
  const choices = {
    'bio-photosynthesis': { light: ['光', ['on', '当たる所'], ['off', 'はくでおおった所']],
      part: ['葉の部分', ['green', '緑色の部分'], ['white', 'ふ（白い部分）']] },
    'bio-digestion': { nutrient: ['栄養分', ['starch', 'デンプン'], ['protein', 'タンパク質'], ['fat', '脂肪']],
      stage: ['見る所', ['digest', '消化（分解）'], ['absorb', '吸収（柔毛）']] },
    'bio-circulation': { route: ['循環', ['body', '体循環'], ['lung', '肺循環']],
      flow: ['血液の向き', ['out', '心臓から出る'], ['back', '心臓にもどる']] },
    'bio-reflex': { kind: ['反応', ['reflex', '反射'], ['conscious', '意識して起こる反応']],
      spot: ['たどる所', ['skin', '皮ふ'], ['sensory', '感覚神経'], ['spinal', 'せきずい'], ['brain', '脳'], ['motor', '運動神経'], ['muscle', '筋肉']] },
    'bio-flower': { figure: ['図', ['abrana-section', 'アブラナ（たてに切る）'], ['abrana-parts', 'アブラナ（分けてならべる）'],
      ['matsu-branch', 'マツ（枝）'], ['matsu-scale', 'マツ（りん片）']],
    part: ['部分', ['pistil', 'めしべ'], ['stamen', 'おしべ'], ['petal', '花弁'], ['sepal', 'がく']] },
    'bio-plants': { reproduce: ['ふえ方', ['seed', '種子'], ['spore', '胞子']], ovule: ['胚珠', ['in', '子房の中'], ['naked', 'むき出し']],
      cotyledon: ['子葉', ['two', '2 枚'], ['one', '1 枚']], organs: ['根・茎・葉の区別', ['yes', 'ある'], ['no', 'ない']] },
    'bio-animals': { breath: ['呼吸', ['gill', 'えら'], ['both', '子はえら・親は肺'], ['lung', '肺']],
      skin: ['体の表面', ['scale', 'うろこ'], ['moist', 'しめった皮ふ'], ['feather', '羽毛'], ['hair', '毛']],
      birth: ['うまれ方', ['egg-water', '卵生（殻なし）'], ['egg-land', '卵生（殻あり）'], ['live', '胎生']] },
  };
  const animals = [
    ['fish', '魚類', 'gill', 'scale', 'egg-water', 'メダカ・フナ', 105, 100, 105, 165],
    ['amphibian', '両生類', 'both', 'moist', 'egg-water', 'カエル・イモリ', 310, 95, 310, 170],
    ['reptile', 'は虫類', 'lung', 'scale', 'egg-land', 'トカゲ・ヘビ・カメ', 525, 105, 525, 170],
    ['bird', '鳥類', 'lung', 'feather', 'egg-land', 'ハト・ペンギン', 160, 320, 120, 448],
    ['mammal', '哺乳類', 'lung', 'hair', 'live', 'イヌ・クジラ', 475, 300, 475, 448],
  ];
  const plants = {
    dicot: ['双子葉類（被子植物）', 'アブラナ・タンポポ・エンドウ', '子葉は 2 枚', '葉脈は網状脈', '主根と側根'],
    monocot: ['単子葉類（被子植物）', 'イネ・トウモロコシ・ユリ', '子葉は 1 枚', '葉脈は平行脈', 'ひげ根'],
    gymnosperm: ['裸子植物', 'マツ・スギ・イチョウ', '花に花弁やがくがない', '子房がなく、胚珠がむき出し'],
    fern: ['シダ植物', 'イヌワラビ・ゼンマイ', '根・茎・葉の区別がある。胞子でふえる'],
    moss: ['コケ植物', 'ゼニゴケ・スギゴケ', '根・茎・葉の区別がない。胞子でふえる'],
  };
  function description(picture) {
    const names = { 'plants-1-c2.jpg': 'アブラナの花をたてに切った図', 'plants-1-c1.jpg': 'アブラナの花を外側から分けてならべた図',
      'plants-2-c2.jpg': '雌花・雄花・まつかさのあるマツの枝', 'plants-2-r1.jpg': 'マツの雌花と雄花のりん片',
      'plants-3-c1.jpg': '双子葉類と単子葉類の芽ばえ', 'plants-3-c2.jpg': '網状脈と平行脈の葉', 'plants-3-c3.jpg': '主根と側根、ひげ根',
      'plants-4-c1.jpg': 'シダ植物の葉・地下茎・根', 'plants-4-c2.jpg': 'コケ植物の雌株と雄株',
      'animals-1-c2.jpg': 'メダカ・カエル・トカゲ・ハト・イヌ',
      'body-2-c2.jpg': '実験前のふ入りの葉と、脱色してヨウ素液につけた葉', 'digestion.svg': '消化器官の模式図',
      'villus.svg': '小腸の柔毛を大きくした模式図', 'heart.svg': '心臓の部屋と血管の模式図',
      'reflex.svg': '反射の信号の通り道の模式図', 'conscious.svg': '意識して起こる反応の信号の通り道の模式図' };
    return picture.images.map(img => names[img.src.split('/').pop()]).join('。');
  }

  function isKind(kind) { return Object.hasOwn(choices, kind); }
  function validOptions(kind, options) {
    return isKind(kind) && options !== null && typeof options === 'object' && !Array.isArray(options) &&
      Object.keys(options).length === Object.keys(choices[kind]).length &&
      Object.entries(choices[kind]).every(([key, values]) => values.slice(1).some(([value]) => value === options[key]));
  }
  function controls(kind, options) {
    if (!validOptions(kind, options)) return [];
    return Object.entries(choices[kind]).map(([key, [label, ...values]]) => {
      let reason = '';
      if (kind === 'bio-plants') {
        if (options.reproduce === 'spore' && ['ovule', 'cotyledon'].includes(key)) reason = '胞子でふえる植物には、胚珠や子葉がありません';
        if (options.reproduce === 'seed' && key === 'organs') reason = '種子でふえる植物には、根・茎・葉の区別があります';
        if (options.reproduce === 'seed' && options.ovule === 'naked' && key === 'cotyledon') reason = '子葉の数で分けるのは、被子植物です';
      }
      const brainDisabled = kind === 'bio-reflex' && options.kind === 'reflex' && key === 'spot';
      return { key, label, choices: values.map(([value, label]) => ({ value, label,
        ...(brainDisabled && value === 'brain' ? { enabled: false } : {}) })), enabled: !reason,
        reason: brainDisabled ? '反射では、命令はせきずいから出ます（脳で考える前に反応します）' : reason };
    });
  }
  function plantGroup(o) {
    return o.reproduce === 'spore' ? o.organs === 'yes' ? 'fern' : 'moss' :
      o.ovule === 'naked' ? 'gymnosperm' : o.cotyledon === 'two' ? 'dicot' : 'monocot';
  }
  function trace(scene, result, layout) {
    const compact = layout?.compact === true;
    const o = scene.options, p = { kind: scene.kind, compact, images: [], pins: [], tags: [], rings: [], texts: [], below: [] };
    function image(file, box, crop = null) {
      const unit = ['bio-flower', 'bio-plants', 'bio-animals'].includes(scene.kind) ? 'bio1' : 'bio2';
      const item = { key: 'panel:' + (p.images.length + 1), src: 'assets/images/' + unit + '/' + file, ...box, crop };
      p.images.push(item); return item;
    }
    function text(key, text, x, y, tone = 'ink', size = 19, anchor = 'start') {
      p.texts.push({ key, text, x, y, tone, size, anchor });
    }
    function tag(key, text, x, y, tone = 'ink', anchor = 'middle') {
      p.tags.push({ key, text, x, y, tone, anchor });
    }
    function point(img, x, y) {
      const crop = img.crop || { x: 0, y: 0, width: L.sourceWidth, height: L.sourceHeight };
      return { x: img.x + (x - crop.x) * img.width / crop.width, y: img.y + (y - crop.y) * img.height / crop.height };
    }
    function pin(key, img, x, y) {
      const label = p.tags.find(t => t.key === key);
      p.pins.push({ key, from: { x: label.x, y: label.y }, to: point(img, x, y), tone: label.tone });
    }
    function ring(key, img, x, y, radius, tone) {
      const center = point(img, x, y);
      p.rings.push({ key, cx: center.x, cy: center.y, rx: radius * img.width / L.sourceWidth,
        ry: radius * img.height / L.sourceHeight, tone });
    }
    function organ(img, key, name, tx, ty, x, y, tone = 'ink') {
      tag(key, name, x, y, tone); pin(key, img, tx, ty);
    }
    if (scene.kind === 'bio-photosynthesis') {
      const starch = o.light === 'on' && o.part === 'green';
      const reason = starch ? null : o.light === 'off' ? o.part === 'white' ? 'both' : 'no-light' : 'no-chloroplast';
      result.measures = { ...o, starch, reason };
      const img = image('body-2-c2.jpg', L.full), tone = starch ? 'green' : 'red';
      const positions = o.part === 'green' ? o.light === 'on' ? [[150, 255], [480, 255]] : [[160, 175], [480, 180]] :
        o.light === 'on' ? [[62, 96], [360, 130]] : [[45, 175], [355, 185]];
      positions.forEach(([x, y], i) => ring('leaf:' + i, img, x, y, 40, tone));
      text('title', starch ? 'デンプンができる（青紫色になる）' : 'デンプンができない（色が変わらない）', 300, 30, tone, 19, 'middle');
      organ(img, 'fu', 'ふ（白い部分）', 62, 96, 110, 62);
      const foil = point(img, 156, 176), under = point(img, 480, 182), iodine = point(img, 320, 400);
      tag('foil', 'アルミニウムはく', foil.x, foil.y);
      tag('under', 'はくの下', under.x, under.y);
      text('iodine', '脱色して、ヨウ素液につける →', iodine.x, iodine.y, 'gray', 19, 'middle');
      const right = point(img, ...positions[1]);
      tag('result', starch ? '青紫色' : '変わらない', right.x, right.y + 64, tone);
    } else if (scene.kind === 'bio-digestion') {
      const product = { starch: 'ブドウ糖', protein: 'アミノ酸', fat: '脂肪酸とモノグリセリド' }[o.nutrient];
      result.measures = { ...o, product, into: o.nutrient === 'fat' ? 'lymph' : 'capillary' };
      if (o.stage === 'digest') {
        const img = image('digestion.svg', L.full), active = o.nutrient === 'starch' ? ['mouth', 'pancreas', 'small'] :
          o.nutrient === 'protein' ? ['stomach', 'pancreas', 'small'] : ['pancreas'];
        const juices = { mouth: 'だ液', stomach: '胃液', pancreas: 'すい液', small: 'かべの消化酵素', liver: '胆汁をつくる', gall: '胆汁をためる' };
        const rows = [['mouth', '口', 308, 92, 108, 88], ['esophagus', '食道', 320, 140, 492, 106],
          ['stomach', '胃', 358, 214, 492, 174], ['liver', '肝臓', 266, 200, 108, 174],
          ['gall', '胆のう', 282, 226, 108, 244], ['pancreas', 'すい臓', 364, 262, 492, 244],
          ['small', '小腸', 360, 334, 492, 324], ['large', '大腸', 260, 330, 108, 324]];
        rows.forEach(([key, name, ...pos]) => {
          const bile = o.nutrient === 'fat' && ['liver', 'gall'].includes(key), red = active.includes(key);
          organ(img, key, name + (red || bile ? '（' + juices[key] + '）' : ''), ...pos, bile ? 'orange' : red ? 'red' : 'ink');
        });
        text('title', { starch: 'デンプン', protein: 'タンパク質', fat: '脂肪' }[o.nutrient] + ' → ' + product, 300, 30, 'red', 19, 'middle');
        text('enzyme', '赤い文字 ＝ 消化酵素がはたらく所', 20, 380, 'gray');
        if (o.nutrient === 'fat') text('bile', 'だいだいの文字 ＝ 胆汁（消化酵素をふくまないが、脂肪の分解を助ける）', 20, 408, 'gray');
      } else {
        const img = image('villus.svg', L.full);
        [['villus', '柔毛', 320, 125, 300, 74], ['capillary', '毛細血管', 262, 280, 110, 220],
          ['lymph', 'リンパ管', 320, 330, 490, 294], ['wall', '小腸のかべ', 120, 430, 110, 340]].forEach(([key, name, ...pos]) =>
          organ(img, key, name, ...pos, key === result.measures.into ? 'red' : 'ink'));
        text('title', o.nutrient === 'fat' ? '脂肪酸とモノグリセリドは、柔毛で再び脂肪になって、リンパ管に入る' :
          product + 'は、柔毛の毛細血管に入る', 300, 30, 'red', 19, 'middle');
      }
    } else if (scene.kind === 'bio-circulation') {
      const routes = { 'body:out': ['lv', 'aorta', 'arterial', '左心室 → 大動脈 → 全身', '全身へ'],
        'body:back': ['ra', 'vena', 'venous', '全身 → 大静脈 → 右心房', '全身から'],
        'lung:out': ['rv', 'pa', 'venous', '右心室 → 肺動脈 → 肺', '肺へ'],
        'lung:back': ['la', 'pv', 'arterial', '肺 → 肺静脈 → 左心房', '肺から'] };
      const [chamber, vessel, blood, path, direction] = routes[o.route + ':' + o.flow];
      result.measures = { ...o, chamber, vessel, blood };
      const img = image('heart.svg', L.full), tone = blood === 'arterial' ? 'red' : 'blue';
      [['ra', '右心房', 270, 200, 100, 220], ['rv', '右心室', 262, 290, 100, 300],
        ['la', '左心房', 370, 200, 500, 220], ['lv', '左心室', 368, 290, 500, 300],
        ['vena', '大静脈', 252, 100, 100, 80], ['pa', '肺動脈', 200, 130, 100, 144],
        ['pv', '肺静脈', 448, 196, 500, 150], ['aorta', '大動脈', 440, 74, 500, 74]].forEach(([key, name, ...pos]) =>
        organ(img, key, name + (key === vessel ? '（' + direction + '）' : ''), ...pos, [chamber, vessel].includes(key) ? tone : 'ink'));
      text('title', (o.route === 'body' ? '体循環: ' : '肺循環: ') + path, 300, 30, tone, 19, 'middle');
      text('venous', '青 ＝ 静脈血（酸素が少ない）', 20, 362, 'blue');
      text('arterial', '赤 ＝ 動脈血（酸素が多い）', 20, 388, 'red');
      text('orientation', '図の左が、体の右', 580, 410, 'gray', 19, 'end');
    } else if (scene.kind === 'bio-reflex') {
      const reflex = o.kind === 'reflex', spot = reflex && o.spot === 'brain' ? 'spinal' : o.spot;
      const order = reflex ? ['skin', 'sensory', 'spinal', 'motor', 'muscle'] : ['skin', 'sensory', 'spinal', 'brain', 'spinal', 'motor', 'muscle'];
      result.measures = { kind: o.kind, spot, order: order.indexOf(spot) + 1, steps: order.length };
      const img = image(reflex ? 'reflex.svg' : 'conscious.svg', L.full);
      [['skin', '皮ふ（感覚器官）', 40, 250, 112, 316], ['sensory', '感覚神経', 250, 180, 200, 104],
        ['spinal', 'せきずい', 500, 340, 530, 340], ['brain', '脳', 500, 80, 330, 64],
        ['motor', '運動神経', 360, 326, 310, 346], ['muscle', '筋肉', 190, 300, 130, 362]].forEach(([key, name, tx, ty, x, y]) => {
        organ(img, key, name, tx, ty, x, y, key === spot ? 'green' : 'ink');
        if (key === spot) ring(key, img, tx, ty, 24, 'green');
      });
      text('title', reflex ? '反射: 脳で考える前に、せきずいから命令が出る' :
        '意識して起こる反応: 脳で判断して、命令を出す', 300, 28, 'ink', 19, 'middle');
      text('order', '信号が通る順: 皮ふ → 感覚神経 → せきずい → ' + (reflex ? '' : '脳 → せきずい → ') + '運動神経 → 筋肉', 20, 410, 'gray');
    } else if (scene.kind === 'bio-flower') {
      const matsu = o.figure.startsWith('matsu');
      result.measures = { figure: o.figure, part: o.part, plant: matsu ? 'matsu' : 'abrana', ovule: matsu ? 'naked' : 'in-ovary' };
      const files = { 'abrana-section': 'plants-1-c2.jpg', 'abrana-parts': 'plants-1-c1.jpg',
        'matsu-branch': 'plants-2-c2.jpg', 'matsu-scale': 'plants-2-r1.jpg' };
      const img = image(files[o.figure], L.full);
      function label(key, name, part, x, y, target, anchor = 'middle') {
        tag(key, name, x, y, o.part === part ? 'red' : 'ink', anchor);
        if (target) pin(key, img, ...target);
      }
      if (o.figure === 'abrana-section') {
        [['stigma', '柱頭', 'pistil', 506, 68, [310, 68]], ['ovary', '子房', 'pistil', 514, 306, [362, 344]],
          ['ovule', '胚珠', 'pistil', 74, 336, [308, 352]], ['stamen', 'おしべ', 'stamen', 66, 106, [212, 124]],
          ['petal', '花弁', 'petal', 516, 204, [514, 172]], ['sepal', 'がく', 'sepal', 70, 396, [220, 378]]].forEach(row => label(...row));
      } else if (o.figure === 'abrana-parts') {
        [['sepal', 'がく 4 枚', 78], ['petal', '花弁 4 枚', 250], ['stamen', 'おしべ 6 本', 452], ['pistil', 'めしべ 1 本', 585]]
          .forEach(([key, name, x]) => label(key, name, key, x, 350, null, key === 'pistil' ? 'end' : 'middle'));
        text('order', '外側 ←――→ 内側', 300, 35, 'gray', 19, 'middle');
      } else if (o.figure === 'matsu-branch') {
        label('female', '雌花', 'pistil', 490, 65, [306, 30]);
        label('male', '雄花', 'stamen', 70, 175, [210, 190]);
        label('cone', '1 年前の雌花（まつかさになる）', 'pistil', 580, 385, [378, 302], 'end');
      } else {
        label('female-scale', '雌花のりん片', 'pistil', 160, 85);
        label('male-scale', '雄花のりん片', 'stamen', 440, 85);
        label('ovule', '胚珠（むき出し）', 'pistil', 160, 395, [138, 380]); pin('ovule', img, 176, 380);
        label('pollen', '花粉のう', 'stamen', 470, 395, [450, 352]);
      }
      if (matsu && ['petal', 'sepal'].includes(o.part)) text('absent', 'マツの花には、花弁やがくがありません', 300, 30, 'gray', 19, 'middle');
    } else if (scene.kind === 'bio-plants') {
      const group = plantGroup(o), names = plants[group];
      result.measures = { ...o, group };
      text('title', 'なかま: ' + names[0], 20, 32, 'green', 23);
      text('examples', 'なかまの例: ' + names[1], 20, 406, 'gray');
      if (group === 'dicot' || group === 'monocot') {
        const crops = group === 'dicot' ? [[20, 60, 300, 426], [30, 0, 280, 398], [40, 10, 250, 355]] :
          [[330, 60, 300, 426], [345, 0, 280, 398], [345, 10, 250, 355]];
        crops.forEach(([x, y, width, height], i) => {
          const box = { ...L.triple, x: L.triple.x + i * L.tripleStep };
          image('plants-3-c' + (i + 1) + '.jpg', box, { x, y, width, height });
          text('heading:' + (i + 1), ['芽ばえ', '葉', '根'][i], box.x + box.width / 2, 72, 'ink', 19, 'middle');
          tag('caption:' + (i + 1), names[i + 2], box.x + box.width / 2, 365, 'green');
        });
      } else if (group === 'gymnosperm') {
        const a = image('plants-2-c2.jpg', L.double), b = image('plants-2-r1.jpg', { ...L.double, x: L.double.x + L.doubleStep });
        [a, b].forEach((img, i) => {
          text('heading:' + (i + 1), ['マツの枝', 'りん片'][i], img.x + img.width / 2, 72, 'ink', 19, 'middle');
          tag('caption:' + (i + 1), names[i + 2], img.x + img.width / 2, 365, 'green');
        });
        tag('female', '雌花', 250, 126); pin('female', a, 306, 30);
        tag('male', '雄花', 65, 240); pin('male', a, 210, 190);
        tag('ovule', '胚珠（むき出し）', 440, 305); pin('ovule', b, 138, 380);
      } else {
        const img = image(group === 'fern' ? 'plants-4-c1.jpg' : 'plants-4-c2.jpg', L.single);
        const rows = group === 'fern' ? [['leaf', '葉', 70, 130, 152, 144], ['stem', '茎（地下茎）', 475, 270, 524, 372],
          ['root', '根', 100, 335, 196, 412]] : [['female', '雌株', 180, 335, 160, 150], ['male', '雄株', 420, 335, 475, 160]];
        rows.forEach(([key, name, x, y, tx, ty]) => { tag(key, name, x, y); pin(key, img, tx, ty); });
        tag('caption:1', names[2], 300, 376, 'green');
      }
    } else {
      const matches = Object.fromEntries(animals.map(([key, , breath, skin, birth]) => [key,
        Number(o.breath === breath) + Number(o.skin === skin) + Number(o.birth === birth)]));
      const maximum = Math.max(...Object.values(matches)), group = animals.find(a => matches[a[0]] === 3)?.[0] || 'none';
      const best = animals.filter(a => matches[a[0]] === maximum).map(a => a[0]);
      result.measures = { ...o, group, matches, best };
      const img = image('animals-1-c2.jpg', compact ? { x: (600 - 376 * 4 / 3) / 2, y: 44, width: 376 * 4 / 3, height: 376 } : L.animals), match = animals.find(a => a[0] === group);
      text('title', match ? 'あてはまるなかま: ' + match[1] : 'あてはまるなかまがありません', 20, 32, match ? 'green' : 'red', 23);
      animals.forEach(([key, name, , , , , cx, cy, x, y]) => {
        const t = point(img, x, y), center = point(img, cx, cy);
        tag(key, name, t.x, t.y, key === group ? 'green' : 'ink');
        if (key === group) p.rings.push({ key, cx: center.x, cy: center.y, rx: key === 'fish' ? 52 : 42, ry: 28, tone: 'green' });
      });
      text('side-heading', 'えらんだ特徴', 384, 84);
      const breath = { gill: 'えらで呼吸', both: '子はえら・親は肺で呼吸', lung: '肺で呼吸' };
      const skin = { scale: '体はうろこ', moist: '体はしめった皮ふ', feather: '体は羽毛', hair: '体は毛' };
      [breath[o.breath], skin[o.skin], choices['bio-animals'].birth.slice(1).find(c => c[0] === o.birth)[1]].forEach((value, i) =>
        text('side-' + ['breath', 'skin', 'birth'][i], (match ? '〇 ' : '') + value, 384, 118 + i * 30, match ? 'green' : 'ink'));
      text('side-counts', '合う特徴の数', 384, 228);
      const rest = animals.filter(a => a[0] !== group);
      let row = 0;
      if (match) text('count-match', match[1] + ' 3 つ（ぜんぶ）', 384, 260 + row++ * 30, 'green');
      for (let i = 0; i < rest.length; i += 2) text('count:' + i,
        rest.slice(i, i + 2).map(a => a[1] + ' ' + matches[a[0]]).join('・'), 384, 260 + row++ * 30);
      text('legend', '緑の輪 ＝ 3 つの特徴がぜんぶ合うなかま', 20, 366, 'gray');
      text('examples', '画像の動物: メダカ・カエル・トカゲ・ハト・イヌ', 20, 398, 'gray');
    }
    // 引き出し線のない文字は、相手の画像・列のそばにだけ置く。
    const bound = (mark, x, y, width, height, maxRows) => Object.assign(mark, {
      bounds: { x, y, width, height }, ...(maxRows ? { maxRows } : {}),
    });
    if (p.images[0].src.includes('/bio2/')) {
      // 題と凡例は上下の帯、引き出し線のない名前は指す相手の近くに置く。
      p.texts.forEach(mark => bound(mark, 20, mark.key === 'title' ? 0 : mark.y - 24, 560,
        mark.key === 'title' ? 44 : 30, 2));
      if (scene.kind === 'bio-photosynthesis') p.tags.filter(mark => mark.key !== 'fu').forEach(mark =>
        bound(mark, Math.max(20, mark.x - 125), Math.max(44, mark.y - 35), Math.min(250, 580 - Math.max(20, mark.x - 125)), 70, 2));
      if (scene.kind === 'bio-circulation' || scene.kind === 'bio-digestion' && o.stage === 'digest')
        p.tags.forEach(mark => bound(mark, mark.x < 300 ? 20 : 390, 48, 190, 304, 2));
    }
    if (scene.kind === 'bio-animals') {
      const img = p.images[0];
      p.tags.forEach((mark, i) => {
        const top = i < 3, left = top ? [0, 210, 420][i] : i === 3 ? 0 : 320;
        const a = point(img, left, compact ? top ? 150 : 410 : top ? 0 : 225),
          b = point(img, top ? left + 210 : left + 320, top ? compact ? 210 : 225 : 480);
        bound(mark, a.x, a.y, b.x - a.x, b.y - a.y);
      });
      if (compact) bound(p.texts[0], 20, 0, 560, 82, 2);
    } else {
      for (const mark of [...p.tags, ...p.texts]) {
        if (p.pins.some(pin => pin.key === mark.key)) continue;
        const column = /^(heading|caption):([1-3])$/.exec(mark.key);
        if (column) {
          const img = p.images[Number(column[2]) - 1];
          const bottom = img.y + img.height;
          bound(mark, img.x, column[1] === 'heading' ? 0 : bottom, img.width,
            column[1] === 'heading' ? img.y : 398 - bottom, 2);
        } else if (o.figure === 'abrana-parts' && p.tags.includes(mark)) {
          const font = Math.max(19, config.minTextPx * config.width / (layout?.widthPx || 700));
          const end = font > 19 ? 598 : 585, start = end - 5.8 * font;
          const edges = [20, 164, 330, start - 1, 600], i = p.tags.indexOf(mark);
          if (mark.key === 'pistil') mark.x = end;
          bound(mark, edges[i], 322, edges[i + 1] - edges[i], 40, 1);
        } else if (mark.key === 'order') {
          bound(mark, 20, 0, 560, 60, 1);
        } else if (o.figure === 'matsu-scale' && p.tags.includes(mark)) {
          bound(mark, mark.key === 'female-scale' ? 20 : 300, 0, 280, 130, 2);
        }
      }
    }
    const marks = [...p.tags, ...p.texts];
    function below(mark) { p.below.push({ key: mark.key, text: mark.text, tone: mark.tone }); }
    if (p.images[0].src.includes('/bio2/')) {
      const width = Number.isFinite(layout?.widthPx) && layout.widthPx > 0 ? layout.widthPx : compact ? 279 : 700;
      const font = Math.max(19, config.minTextPx * config.width / width);
      p.texts.filter(mark => Array.from(mark.text).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? .6 : 1), 0) * font > 560)
        .forEach(below);
    }
    if (compact) {
      if (o.figure === 'abrana-parts') {
        const keys = ['sepal', 'petal', 'stamen', 'pistil'];
        p.below.push({ key: 'order', keys, tone: 'ink',
          text: '左から: がく 4 枚 → 花弁 4 枚 → おしべ 6 本 → めしべ 1 本（外側から内側の順）' });
        p.below.push({ key: 'selection', keys: [o.part], tone: 'red',
          text: '赤い輪 ＝ えらんだ部分（' + choices['bio-flower'].part.slice(1).find(([key]) => key === o.part)[1] + '）' });
        const regions = { sepal: [78, 200, 60, 108], petal: [248, 197, 100, 124],
          stamen: [450, 198, 97, 100], pistil: [594, 195, 24, 116] };
        const [x, y, rx, ry] = regions[o.part], center = point(p.images[0], x, y);
        p.rings.push({ key: o.part, cx: center.x, cy: center.y, rx: rx * L.full.width / L.sourceWidth,
          ry: ry * L.full.height / L.sourceHeight, tone: 'red' });
      }
      // 幅は表示側から渡す。compact だけの呼出しでも安全な幅で判定する。
      const width = Number.isFinite(layout?.widthPx) && layout.widthPx > 0 ? layout.widthPx : 279;
      const font = Math.max(19, config.minTextPx * config.width / width);
      const units = text => Array.from(text).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? .6 : 1), 0);
      const rows = (text, available) => {
        let count = 1, used = 0;
        for (const c of Array.from(text)) {
          const next = units(c) * font;
          if (used && used + next > available) { count++; used = 0; }
          used += next;
        }
        return count;
      };
      if (scene.kind === 'bio-animals') p.texts.filter(t => t.key !== 'title').forEach(below);
      else marks.filter(mark => mark.key.startsWith('caption:') && (rows(mark.text, mark.bounds.width) > 2 ||
        ['fern', 'moss'].includes(result.measures.group)) ||
        mark.key === 'examples' && units(mark.text) * font > 560).forEach(below);
      if (scene.kind === 'bio-plants') {
        const reasons = controls(scene.kind, o).filter(c => c.reason && units(c.reason) * font > 560);
        reasons.filter((c, i) => reasons.findIndex(other => other.reason === c.reason) === i).forEach(c =>
          p.below.push({ key: 'reason:' + c.key, text: c.reason, tone: 'gray' }));
      }
    }
    // 通常幅でも収まらない文は下へ移す。画像や残りの文字の配置は変えない。
    const isBelow = mark => p.below.some(row => row.key === mark.key || row.keys?.includes(mark.key));
    if (Array.isArray(layout?.belowKeys)) marks.filter(mark => layout.belowKeys.includes(mark.key) && !isBelow(mark)).forEach(below);
    p.tags = p.tags.filter(mark => !isBelow(mark));
    p.texts = p.texts.filter(mark => !isBelow(mark));
    p.pins = p.pins.filter(pin => !isBelow(pin));
    p.description = description(p);
    result.picture = p;
    // 台本の参照は配置によらず同じキーを使う。
    result.marks.push(...marks);
  }
  const api = { isKind, validOptions, controls, trace, plantGroup, animals, plants };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { picture: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
