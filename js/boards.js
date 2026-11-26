// 単元と盤の初期配置、先生の案内、ためしてみようと現在の値。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const scene = typeof module === 'object' && module.exports ? require('./scene.js') : root.Hikari.scene;
  const S = config.sound;
  const UNITS = [
    { id: 'light', title: '中 1 光の世界', teacher: 'E',
      boards: ['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image'] },
    { id: 'sound', title: '中 1 音の世界', teacher: 'E', boards: ['sound-wave', 'sound-string', 'sound-speed'] },
  ];

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

  function prompt(id, text, measure, op, value, tol) {
    const when = { measure, op, value };
    if (tol !== undefined) when.tol = tol;
    return { id, text, when };
  }

  const data = [
    {
      id: 'straight', title: '直進', heading: '光の道をたどろう',
      question: '光はどう進む？ 影はなぜできる？',
      intro: '光源から出た光は、まっすぐ進みます。ついたてや光源を動かして、光がさえぎられる範囲を見てみましょう。',
      scene: { id: 'straight-basic', kind: 'straight', elements: [
        { id: 'src', type: 'source', x: 80, y: 210 },
        { id: 'blocker', type: 'blocker', x: 280, y: 210, height: 60 },
        { id: 'screen', type: 'screen', x: 550, y: 210, height: 380 },
      ] },
      prompts: [
        prompt('shadow-large', 'ついたてを光源に近づけて、影を大きくしてみよう。', 'shadowSize', 'gte', 200),
        prompt('shadow-small', 'ついたてをスクリーンに近づけて、影を小さくしてみよう。', 'shadowSize', 'lte', 100),
      ], controls: [],
    },
    {
      id: 'reflect', title: '反射', heading: 'はね返る角度をくらべよう',
      question: '鏡ではね返る光のきまりは？',
      intro: '鏡に垂直な線を「法線」といいます。光源や鏡の傾きを変えて、法線から測る2つの角度をくらべましょう。',
      scene: { id: 'reflect-basic', kind: 'reflect', elements: [
        { id: 'src', type: 'source', x: 170, y: 100 },
        { id: 'mirror', type: 'mirror', x: 300, y: 270, length: 360, tiltDeg: 0 },
      ] },
      prompts: [
        prompt('angle-sixty', '入射角を60°にして、反射角を見てみよう。', 'incidenceDeg', 'near', 60, config.angleTolerance),
        prompt('angle-zero', '光を鏡に垂直に当てて、来た道を戻してみよう。', 'incidenceDeg', 'near', 0, config.angleTolerance),
      ], controls: [],
    },
    {
      id: 'mirror-image', title: '鏡の像', heading: '鏡の奥に見える位置をさがそう',
      question: '鏡の奥に見えるものは、どこにある？',
      intro: '目に届く光を鏡の奥へまっすぐのばすと、像の位置がわかります。物体や見る人を動かして、鏡からの距離をくらべましょう。',
      scene: { id: 'mirror-image-basic', kind: 'mirror-image', elements: [
        { id: 'object', type: 'object', x: 140, y: 180, height: 40 },
        { id: 'eye', type: 'eye', x: 120, y: 290 },
        { id: 'mirror', type: 'mirror', x: 340, y: 210, length: 380, tiltDeg: 90 },
      ] },
      prompts: [
        prompt('object-near', '物体を鏡に近づけて、像も近づくか見てみよう。', 'objectDistance', 'near', 80, config.positionTolerance),
        prompt('object-far', '物体を鏡から遠ざけて、像も遠ざかるか見てみよう。', 'objectDistance', 'near', 240, config.positionTolerance),
      ], controls: [],
    },
    {
      id: 'refract', title: '屈折・全反射', heading: '境目で変わる光の道を見よう',
      question: '水に入ると、光はなぜ曲がる？ 出られなくなるのはいつ？',
      intro: '光は物質の境目で進む向きが変わります。水やガラスから空気へ出る向きに切り替えて、出ていく光がなくなる角度もさがしましょう。',
      scene: { id: 'refract-basic', kind: 'refract', elements: [
        { id: 'src', type: 'source', x: 180, y: 70 },
        { id: 'boundary', type: 'boundary', x: 300, y: 210 },
      ], options: { direction: 'air-to-medium', medium: 'water' } },
      prompts: [
        prompt('total-reflection', '水やガラスから空気へ進む向きにして、全反射を起こしてみよう。', 'totalReflection', 'is', true),
        prompt('straight-through', '境目に垂直に光を当てて、曲がらずに進ませてみよう。', 'incidenceDeg', 'near', 0, config.angleTolerance),
        prompt('try-glass', '物質をガラスに替えて、光の曲がり方を見てみよう。', 'medium', 'is', 'glass'),
      ], controls: [],
    },
    {
      id: 'lens', title: '凸レンズ', heading: '平行な光が集まる所をさがそう',
      question: '虫めがねは、なぜ光を集める？',
      intro: '光軸に平行な光は、凸レンズを通ると焦点に集まります。光源の高さや焦点距離を動かして、光の道を見てみましょう。',
      scene: { id: 'lens-basic', kind: 'lens', elements: [
        { id: 'src', type: 'source', x: 60, y: 150 },
        { id: 'lens', type: 'lens', x: 300, y: 210, focalLength: 100 },
      ] },
      prompts: [
        prompt('focus-far', '焦点距離を長くして、光が集まる位置がどう動くか見てみよう。', 'focalLength', 'near', 140, config.positionTolerance),
        prompt('beam-high', '光源を光軸から大きく離して、光が集まる位置を見てみよう。', 'beamOffset', 'near', 100, config.positionTolerance),
      ], controls: [],
    },
    {
      id: 'lens-image', title: '実像と虚像', heading: '物体を動かして像を調べよう',
      question: 'スクリーンに映る像と、映らない像のちがいは？',
      intro: '物体を動かすと、像の位置や大きさが変わります。物体が焦点の内側にあるときは、出てきた光を後ろへのばして像をさがしましょう。',
      scene: { id: 'lens-image-basic', kind: 'lens-image', elements: [
        { id: 'object', type: 'object', x: 100, y: 210, height: 50 },
        { id: 'lens', type: 'lens', x: 300, y: 210, focalLength: 100 },
        { id: 'screen', type: 'screen', x: 450, y: 210, height: 360 },
      ] },
      prompts: [
        prompt('virtual-image', '物体を焦点の内側へ動かして、虚像をつくってみよう。', 'imageKind', 'is', 'virtual'),
        prompt('double-image', '物体を、焦点の少し外側に置いて、像が物体より大きくなるのを見よう。', 'objectDistance', 'near', 150, config.positionTolerance),
        prompt('sharp-screen', 'スクリーンを動かして、実像がはっきり映る位置をさがそう。', 'screenSharp', 'is', true),
      ], controls: [],
    },
  ];

  data.push(
    {
      id: 'sound-wave', title: '音の大きさと高さ', heading: '波の形で音をくらべよう',
      question: '大きい音と高い音は、波の形のどこがちがう？',
      intro: '波の形は、音源の振動のようすを表します。つまみで振幅と振動数を変えて、波の形と音のちがいをくらべましょう。',
      scene: { id: 'sound-wave-basic', kind: 'sound-wave', elements: [
        { id: 'fork', type: 'tuning-fork' },
        { id: 'wave', type: 'wave', frequencyHz: S.frequency.initial, amplitude: S.amplitude.initial },
      ] },
      prompts: [
        prompt('amplitude-large', '振幅を目もり 4 つ分にして、大きい音にしてみよう。', 'amplitude', 'is', 4),
        prompt('frequency-double', '振動数を 500 Hz にして、波の数が 2 倍になるのを見よう。', 'frequencyHz', 'is', 500),
        prompt('frequency-low', '振動数を 100 Hz にして、いちばん低い音にしてみよう。', 'frequencyHz', 'is', 100),
      ], controls: [],
    },
    {
      id: 'sound-string', title: '弦の音', heading: '弦をかえて音をくらべよう',
      question: '弦をどうすると、音は高くなる？',
      intro: '弦の長さ・太さ・張りと、はじく強さを変えて、音の高さと大きさがどう変わるか、波の形でくらべましょう。',
      scene: { id: 'sound-string-basic', kind: 'sound-string', elements: [
        { id: 'string', type: 'string', lengthPercent: S.string.length.initial, pluck: S.string.pluck.initial },
      ], options: { ...S.string.initial } },
      prompts: [
        prompt('pitch-high', '弦を短くしたり張りを強くしたりして、はじめより高い音にしてみよう。', 'pitch', 'is', 'higher'),
        prompt('string-thick', '弦を太いものに替えて、音の高さをくらべよう。', 'thickness', 'is', 'thick'),
        prompt('pluck-strong', '強くはじいて、はじめより大きい音にしてみよう。', 'loudness', 'is', 'louder'),
      ], controls: [],
    },
    {
      id: 'sound-speed', title: '音の速さ', heading: '音がとどくまでの時間をはかろう',
      question: '花火は、なぜ光ってから音が聞こえる？',
      intro: '音は空気の振動として伝わるので、届くまでに時間がかかります。見る人を動かして、距離と時間の関係を見てみましょう。',
      scene: { id: 'sound-speed-basic', kind: 'sound-speed', elements: [
        { id: 'firework', type: 'firework' }, { id: 'listener', type: 'listener', distance: S.distance.initial },
      ] },
      prompts: [
        prompt('time-near', '花火にいちばん近づいて、聞こえるまで 0.5 秒にしてみよう。', 'delayTenths', 'is', 5),
        prompt('time-one', '聞こえるまでが 1.0 秒になる所に立ってみよう。', 'delayTenths', 'is', 10),
        prompt('time-far', '花火からいちばん遠くへ行って、何秒かかるか見よう。', 'delayTenths', 'is', 50),
      ], controls: [],
    }
  );

  function list() {
    return UNITS.flatMap(unit => unit.boards.map(id => data.find(board => board.id === id)).filter(Boolean)
      .map(({ id, title, question }) => ({ id, title, question, unit: unit.id })));
  }
  function units() {
    const all = list();
    return UNITS.map(({ id, title, teacher }) => ({ id, title, teacher,
      boards: all.filter(board => board.unit === id).map(({ id, title, question }) => ({ id, title, question }))
    })).filter(unit => unit.boards.length);
  }

  function stringControls() {
    return [
      { key: 'thickness', label: '弦の太さ', choices: [{ value: 'thin', label: '細い' }, { value: 'thick', label: '太い' }] },
      { key: 'tension', label: '弦の張り', choices: [{ value: 'weak', label: '弱い' }, { value: 'strong', label: '強い' }] },
    ];
  }

  function controls(medium) {
    const name = medium === 'glass' ? 'ガラス' : '水';
    return [
      { key: 'direction', choices: [{ value: 'air-to-medium', label: '空気 → ' + name },
        { value: 'medium-to-air', label: name + ' → 空気' }] },
      { key: 'medium', choices: [{ value: 'water', label: '水' }, { value: 'glass', label: 'ガラス' }] },
    ];
  }

  function get(id) {
    const original = data.find(board => board.id === id);
    if (!original) return null;
    const board = JSON.parse(JSON.stringify(original));
    // board.scene を操作結果に置き換えると、次に読む controls の文も切り替わる。
    if (id === 'refract') Object.defineProperty(board, 'controls', {
      enumerable: true, configurable: true, get() {
        return scene.validateScene(board.scene).length || board.scene.kind !== 'refract' ? [] : controls(board.scene.options.medium);
      },
    });
    if (id === 'sound-string') Object.defineProperty(board, 'controls', {
      enumerable: true, configurable: true, get() {
        return scene.validateScene(board.scene).length || board.scene.kind !== 'sound-string' ? [] : stringControls();
      },
    });
    return board;
  }

  function checkPrompt(prompt, measures, currentScene) {
    if (!record(prompt) || !record(prompt.when) || !record(measures) ||
        (currentScene !== undefined && scene.validateScene(currentScene).length)) return false;
    const { measure, op, value, tol = 0 } = prompt.when;
    if (typeof measure !== 'string' || !Object.hasOwn(measures, measure)) return false;
    const actual = measures[measure];
    if (actual === null || actual === undefined) return false;
    if (op === 'is') {
      return ['string', 'boolean', 'number'].includes(typeof actual) &&
        (typeof actual !== 'number' || Number.isFinite(actual)) && actual === value;
    }
    if (!Number.isFinite(actual) || !Number.isFinite(value)) return false;
    if (op === 'near') return Number.isFinite(tol) && tol >= 0 && Math.abs(actual - value) <= tol;
    if (op === 'gte') return actual >= value;
    if (op === 'lte') return actual <= value;
    return false;
  }

  function readout(id, measures, currentScene) {
    if (!scene.KINDS.includes(id) || !record(measures) ||
        (currentScene !== undefined && (scene.validateScene(currentScene).length || currentScene.kind !== id))) return [];
    const lines = [];
    function text(value, tone = 'plain') { lines.push({ text: value, tone }); }
    function measured(name, value, suffix = '', tone = 'plain') {
      if (Number.isFinite(value)) text(name + ' ' + Math.round(value) + suffix, tone);
    }
    function ratio(value, base) {
      if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0) return null;
      const result = value / base;
      return Number.isFinite(result) ? result : null;
    }
    const elements = currentScene?.elements || [];
    if (id === 'sound-wave') {
      if (Number.isFinite(measures.frequencyHz)) text('振動数 ' + measures.frequencyHz + ' Hz');
      if (Number.isFinite(measures.amplitude)) text('振幅 目もり ' + measures.amplitude + ' つ分');
    }
    if (id === 'sound-string') {
      const pitch = { higher: 'はじめより高い', same: 'はじめと同じ', lower: 'はじめより低い' };
      const loudness = { louder: 'はじめより大きい', same: 'はじめと同じ', softer: 'はじめより小さい' };
      if (Object.hasOwn(pitch, measures.pitch)) text('音の高さ ' + pitch[measures.pitch]);
      if (Object.hasOwn(loudness, measures.loudness)) text('音の大きさ ' + loudness[measures.loudness]);
    }
    if (id === 'sound-speed') {
      if (Number.isFinite(measures.distance)) text('花火まで ' + measures.distance + ' m');
      if (Number.isInteger(measures.delayTenths)) text('聞こえるまで ' + (measures.delayTenths / 10).toFixed(1) + ' 秒');
      if (Number.isFinite(measures.speed)) text('音の速さ 約 ' + measures.speed + ' m/s');
    }
    if (id === 'straight') {
      const scale = ratio(measures.shadowSize, elements.find(e => e.type === 'blocker')?.height);
      if (scale !== null) text('影の大きさ ついたての ' + scale.toFixed(1) + ' 倍');
    }
    if (id === 'reflect') {
      measured('入射角', measures.incidenceDeg, '°', 'in');
      measured('反射角', measures.reflectionDeg, '°', 'out');
      if (Number.isFinite(measures.mirrorTiltDeg)) measured('鏡の傾き', Math.abs(measures.mirrorTiltDeg), '°');
    }
    if (id === 'mirror-image') {
      text('物体から鏡まで ＝ 鏡から像まで');
      text('像は鏡の奥、物体と同じ距離の所にあります');
    }
    if (id === 'refract') {
      measured('入射角', measures.incidenceDeg, '°', 'in');
      if (measures.totalReflection === true) text('全反射', 'out');
      else measured('屈折角', measures.refractionDeg, '°', 'out');
      if (['water', 'glass'].includes(measures.medium)) {
        const choice = controls(measures.medium)[0].choices.find(c => c.value === measures.direction);
        if (choice) text(choice.label);
      }
    }
    if (id === 'lens') {
      text('焦点は、レンズの中心から左右に同じ距離の所にあります');
    }
    if (id === 'lens-image') {
      const position = ratio(measures.objectDistance, elements.find(e => e.type === 'lens')?.focalLength);
      if (position !== null) text('物体の位置 焦点距離の ' + position.toFixed(1) + ' 倍');
      if (measures.imageKind === 'none') text('像はできません');
      else if (['real', 'virtual'].includes(measures.imageKind)) {
        text(measures.imageKind === 'real' ? '実像（上下が逆）' : '虚像（スクリーンには映りません）');
        if (Number.isFinite(measures.magnification)) text('像の大きさ 物体の ' +
          (measures.magnification >= 50 ? '50 倍以上' : measures.magnification.toFixed(1) + ' 倍'));
        if (measures.imageKind === 'real' && typeof measures.screenSharp === 'boolean') {
          text(measures.screenSharp ? 'スクリーンにはっきり映っています ✓' : 'スクリーンを像の所へ動かそう');
        }
      }
    }
    return lines;
  }

  const api = { units, list, get, checkPrompt, readout };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { boards: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
