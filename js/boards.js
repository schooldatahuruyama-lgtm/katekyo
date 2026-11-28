// 単元と盤の初期配置、先生の案内、ためしてみようと現在の値。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const scene = typeof module === 'object' && module.exports ? require('./scene.js') : root.Hikari.scene;
  const force = typeof module === 'object' && module.exports ? require('./force.js') : root.Hikari.force;
  const S = config.sound;
  const picture = typeof module === 'object' && module.exports ? require('./picture.js') : root.Hikari.picture;
  const UNITS = [
    { id: 'light', title: '中 1 光の世界', teacher: 'E',
      boards: ['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image'] },
    { id: 'sound', title: '中 1 音の世界', teacher: 'E', boards: ['sound-wave', 'sound-string', 'sound-speed'] },
    { id: 'force', title: '中 1 力の世界', teacher: 'E', boards: ['force-spring', 'force-arrow', 'force-balance'] },
    { id: 'bio1', title: '中 1 生物の観察と分類', teacher: 'E', boards: ['bio-flower', 'bio-plants', 'bio-animals'] },
    { id: 'bio2', title: '中 2 生物の体のつくりとはたらき', teacher: 'E', boards: ['bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex'] },
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

  data.push(
    {
      id: 'force-spring', title: 'ばねののび', heading: '力の大きさとばねののびをしらべよう',
      question: 'おもりをふやすと、ばねはどれだけのびる？',
      intro: 'ばねにおもりをつるして、力の大きさとばねののびの関係をしらべましょう。',
      scene: { id: 'force-spring-basic', kind: 'force-spring', elements: [
        { id: 'stand', type: 'stand' }, { id: 'spring', type: 'spring' }, { id: 'weights', type: 'weights' },
      ], options: { weights: 3, spring: 'A' } },
      prompts: [
        { id: 'spring-five', text: 'おもりを 5 個にして、ばねののびを 5.0 cm にしてみよう。', when: { all: [
          { measure: 'weights', op: 'is', value: 5 }, { measure: 'spring', op: 'is', value: 'A' },
        ] } },
        prompt('spring-b', 'ばね B に替えて、同じ力でののびをくらべよう。', 'spring', 'is', 'B'),
        { id: 'spring-four', text: 'ばね B で、のびを 4.0 cm にしてみよう。', when: { all: [
          { measure: 'weights', op: 'is', value: 2 }, { measure: 'spring', op: 'is', value: 'B' },
        ] } },
      ], controls: [],
    },
    {
      id: 'force-arrow', title: '力の表し方', heading: '力を矢印で表そう',
      question: '力は、矢印でどう表す？',
      intro: '力は、作用点・向き・大きさを矢印で表します。矢印の先を動かして、いろいろな力を表しましょう。',
      scene: { id: 'force-arrow-basic', kind: 'force-arrow', elements: [
        { id: 'box', type: 'box' }, { id: 'force', type: 'force', newtons: 3, direction: 'right' },
      ] },
      prompts: [
        ['right', 5, '右'], ['up', 2, '上'], ['left', 4, '左'],
      ].map(([direction, newtons, name]) => ({ id: 'arrow-' + direction,
        text: name + '向きに ' + newtons + ' N の力を、矢印で表そう。', when: { all: [
          { measure: 'direction', op: 'is', value: direction }, { measure: 'newtons', op: 'is', value: newtons },
        ] } })), controls: [],
    },
    {
      id: 'force-balance', title: '力のつり合い', heading: '2 つの力がつり合う条件をさがそう',
      question: '2 つの力がつり合うのは、どんなとき？',
      intro: '厚紙を左右から引きます。力の大きさや力の線を変えて、2 つの力がつり合う条件をさがしましょう。',
      scene: { id: 'force-balance-basic', kind: 'force-balance', elements: [
        { id: 'card', type: 'card' }, { id: 'left', type: 'pull', side: 'left', newtons: 3 },
        { id: 'right', type: 'pull', side: 'right', newtons: 3 },
      ], options: { line: 'same' } },
      prompts: [
        { id: 'balance-five', text: '左右の力を両方 5 N にして、つり合わせてみよう。', when: { all: [
          { measure: 'left', op: 'is', value: 5 }, { measure: 'right', op: 'is', value: 5 }, { measure: 'state', op: 'is', value: 'balanced' },
        ] } },
        prompt('balance-right', '右の力を左の力より大きくして、厚紙が右へ動くのを見よう。', 'state', 'is', 'moves-right'),
        { id: 'balance-offset', text: '大きさが同じでも、力をずらすとつり合わないことをたしかめよう。', when: { all: [
          { measure: 'left', op: 'equal', other: 'right' }, { measure: 'line', op: 'is', value: 'offset' },
        ] } },
      ], controls: [],
    }
  );

  data.push(
    { id: 'bio-flower', title: '花のつくり', question: '花は、どんな部分からできている？', heading: '花のつくりをしらべよう',
      intro: '花は、外側から がく・花弁・おしべ・めしべ の順についています。部分や図を切り替えて、つくりをしらべましょう。',
      scene: { id: 'bio-flower-basic', kind: 'bio-flower', elements: [{ id: 'picture', type: 'picture' }],
        options: { figure: 'abrana-section', part: 'pistil' } }, controls: [],
      prompts: [
        prompt('flower-stamen', '部分を「おしべ」にして、花粉をつくる所を見つけよう。', 'part', 'is', 'stamen'),
        prompt('flower-parts', '図を「アブラナ（分けてならべる）」にして、花の部分を外側から順に見よう。', 'figure', 'is', 'abrana-parts'),
        { id: 'flower-naked', text: '図を「マツ（りん片）」、部分を「めしべ」にして、胚珠がむき出しであることをたしかめよう。', when: { all: [
          { measure: 'figure', op: 'is', value: 'matsu-scale' }, { measure: 'part', op: 'is', value: 'pistil' },
        ] } },
      ] },
    { id: 'bio-plants', title: '植物のなかま分け', question: '植物は、どこを見ればなかま分けできる？', heading: '特徴をえらんで、植物をなかま分けしよう',
      intro: '植物は、ふえ方や体のつくりで 5 つのなかまに分けられます。特徴を切り替えて、どのなかまになるか見てみましょう。',
      scene: { id: 'bio-plants-basic', kind: 'bio-plants', elements: [{ id: 'picture', type: 'picture' }],
        options: { reproduce: 'seed', ovule: 'in', cotyledon: 'two', organs: 'yes' } }, controls: [],
      prompts: [
        prompt('plant-monocot', '子葉を 1 枚にして、単子葉類の葉脈と根を見よう。', 'group', 'is', 'monocot'),
        prompt('plant-gymnosperm', '胚珠を「むき出し」にして、裸子植物を見つけよう。', 'group', 'is', 'gymnosperm'),
        prompt('plant-moss', '胞子でふえて、根・茎・葉の区別がないなかまを見つけよう。', 'group', 'is', 'moss'),
      ] },
    { id: 'bio-animals', title: '動物のなかま分け', question: '背骨のある動物は、どう分けられる？', heading: '特徴をえらんで、動物をなかま分けしよう',
      intro: '背骨のある動物（脊椎動物）は、呼吸のしかた・体の表面・子のうまれ方で 5 つのなかまに分けられます。',
      scene: { id: 'bio-animals-basic', kind: 'bio-animals', elements: [{ id: 'picture', type: 'picture' }],
        options: { breath: 'gill', skin: 'scale', birth: 'egg-water' } }, controls: [],
      prompts: [
        prompt('animal-bird', '肺・羽毛・卵生（殻あり）をえらんで、鳥類を見つけよう。', 'group', 'is', 'bird'),
        prompt('animal-mammal', '胎生のなかまを見つけよう。', 'group', 'is', 'mammal'),
        prompt('animal-amphibian', '子はえら・親は肺で呼吸するなかまを見つけよう。', 'group', 'is', 'amphibian'),
      ] }
  );

  data.push(
    { id: 'bio-photosynthesis', title: '光合成', question: '植物は、何を使って何をつくる？', heading: '光合成に必要なものをしらべよう',
      intro: 'ふ入りの葉の一部をアルミニウムはくでおおい、光を当ててから、ヨウ素液でデンプンがあるかをしらべます。',
      scene: { id: 'bio-photosynthesis-basic', kind: 'bio-photosynthesis', elements: [{ id: 'picture', type: 'picture' }],
        options: { light: 'on', part: 'green' } }, controls: [],
      prompts: [
        { id: 'photosynthesis-dark', text: '光を「はくでおおった所」にして、色が変わらないことをたしかめよう。', when: { all: [
          { measure: 'light', op: 'is', value: 'off' }, { measure: 'part', op: 'is', value: 'green' },
        ] } },
        { id: 'photosynthesis-white', text: '葉の部分を「ふ」にして、光が当たっても色が変わらないことをたしかめよう。', when: { all: [
          { measure: 'light', op: 'is', value: 'on' }, { measure: 'part', op: 'is', value: 'white' },
        ] } },
        { id: 'photosynthesis-both', text: 'はくでおおった「ふ」の所もしらべよう。', when: { all: [
          { measure: 'light', op: 'is', value: 'off' }, { measure: 'part', op: 'is', value: 'white' },
        ] } },
      ] },
    { id: 'bio-digestion', title: '消化と吸収', question: '食べ物は、体の中でどう変わる？', heading: '栄養分が分解されるようすをたどろう',
      intro: '食べ物の栄養分は、消化液にふくまれる消化酵素のはたらきで、吸収されやすい物質に分解されます。',
      scene: { id: 'bio-digestion-basic', kind: 'bio-digestion', elements: [{ id: 'picture', type: 'picture' }],
        options: { nutrient: 'starch', stage: 'digest' } }, controls: [],
      prompts: [
        { id: 'digestion-protein', text: '栄養分を「タンパク質」にして、胃液がはたらくことを見よう。', when: { all: [
          { measure: 'nutrient', op: 'is', value: 'protein' }, { measure: 'stage', op: 'is', value: 'digest' },
        ] } },
        { id: 'digestion-fat', text: '栄養分を「脂肪」にして、胆汁をつくる所を見つけよう。', when: { all: [
          { measure: 'nutrient', op: 'is', value: 'fat' }, { measure: 'stage', op: 'is', value: 'digest' },
        ] } },
        { id: 'digestion-absorb', text: '見る所を「吸収」にして、脂肪がリンパ管に入ることをたしかめよう。', when: { all: [
          { measure: 'nutrient', op: 'is', value: 'fat' }, { measure: 'stage', op: 'is', value: 'absorb' },
        ] } },
      ] },
    { id: 'bio-circulation', title: '血液の循環', question: '血液は、体の中をどうめぐる？', heading: '血液の通り道をたどろう',
      intro: '血液は、心臓から出て肺や全身をめぐり、また心臓にもどります。心臓の 4 つの部屋と血管をたどりましょう。',
      scene: { id: 'bio-circulation-basic', kind: 'bio-circulation', elements: [{ id: 'picture', type: 'picture' }],
        options: { route: 'body', flow: 'out' } }, controls: [],
      prompts: [
        { id: 'circulation-pa', text: '「肺循環」の「心臓から出る」にして、肺動脈に静脈血が流れることをたしかめよう。', when: { all: [
          { measure: 'route', op: 'is', value: 'lung' }, { measure: 'flow', op: 'is', value: 'out' },
        ] } },
        { id: 'circulation-pv', text: '「肺循環」の「心臓にもどる」にして、肺静脈に動脈血が流れることをたしかめよう。', when: { all: [
          { measure: 'route', op: 'is', value: 'lung' }, { measure: 'flow', op: 'is', value: 'back' },
        ] } },
        { id: 'circulation-back', text: '「体循環」の「心臓にもどる」にして、血液がもどる部屋を見つけよう。', when: { all: [
          { measure: 'route', op: 'is', value: 'body' }, { measure: 'flow', op: 'is', value: 'back' },
        ] } },
      ] },
    { id: 'bio-reflex', title: '刺激と反応', question: '熱いものにふれると、なぜすぐ手を引っこめる？', heading: '信号が伝わる道すじをたどろう',
      intro: '刺激の信号は、神経を通って伝わります。意識して起こる反応と反射で、信号の通り道をくらべましょう。',
      scene: { id: 'bio-reflex-basic', kind: 'bio-reflex', elements: [{ id: 'picture', type: 'picture' }],
        options: { kind: 'reflex', spot: 'skin' } }, controls: [],
      prompts: [
        prompt('reflex-conscious', '反応を「意識して起こる反応」にして、通り道のちがいを見よう。', 'kind', 'is', 'conscious'),
        { id: 'reflex-brain', text: '意識して起こる反応で「脳」をえらんで、命令を出す所をたしかめよう。', when: { all: [
          { measure: 'kind', op: 'is', value: 'conscious' }, { measure: 'spot', op: 'is', value: 'brain' },
        ] } },
        { id: 'reflex-spinal', text: '反射で「せきずい」をえらんで、命令を出す所をたしかめよう。', when: { options: { spot: 'spinal' }, all: [
          { measure: 'kind', op: 'is', value: 'reflex' }, { measure: 'spot', op: 'is', value: 'spinal' },
        ] } },
      ] }
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

  function forceControls(kind) {
    return kind === 'force-spring' ? [
      { key: 'weights', label: 'おもりの数', choices: [0, 1, 2, 3, 4, 5].map(value => ({ value, label: String(value) })) },
      { key: 'spring', label: 'ばね', choices: ['A', 'B'].map(value => ({ value, label: 'ばね ' + value })) },
    ] : [{ key: 'line', label: '2 つの力', choices: [{ value: 'same', label: '一直線上' }, { value: 'offset', label: 'ずれている' }] }];
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
    if (picture.isKind(id)) Object.defineProperty(board, 'controls', {
      enumerable: true, configurable: true, get() {
        return scene.validateScene(board.scene).length || board.scene.kind !== id ? [] : picture.controls(id, board.scene.options);
      },
    });
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
    if (['force-spring', 'force-balance'].includes(id)) Object.defineProperty(board, 'controls', {
      enumerable: true, configurable: true, get() {
        return scene.validateScene(board.scene).length || board.scene.kind !== id ? [] : forceControls(id);
      },
    });
    return board;
  }

  function checkPrompt(prompt, measures, currentScene) {
    if (!record(prompt) || !record(prompt.when) || !record(measures) ||
        (currentScene !== undefined && scene.validateScene(currentScene).length)) return false;
    if (Object.hasOwn(prompt.when, 'options') && (!record(prompt.when.options) || !record(currentScene?.options) ||
        !Object.entries(prompt.when.options).every(([key, value]) => currentScene.options[key] === value))) return false;
    if (Object.hasOwn(prompt.when, 'all')) return Array.isArray(prompt.when.all) && prompt.when.all.length > 0 &&
      prompt.when.all.every(when => checkPrompt({ when }, measures));
    const { measure, op, value, tol = 0 } = prompt.when;
    if (typeof measure !== 'string' || !Object.hasOwn(measures, measure)) return false;
    const actual = measures[measure];
    if (actual === null || actual === undefined) return false;
    if (op === 'equal') return Object.hasOwn(measures, prompt.when.other) &&
      Number.isFinite(actual) && actual === measures[prompt.when.other];
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
    if (id === 'bio-photosynthesis' && typeof measures.starch === 'boolean') {
      const m = measures, reason = { 'no-light': '光が当たらない', 'no-chloroplast': '葉緑体がない', both: '光が当たらず、葉緑体もない' }[m.reason];
      text('しらべた所 ' + (m.part === 'green' ? '緑色で' : 'ふで') + (m.light === 'on' ? '光が当たった所' : 'はくの下'));
      text('ヨウ素液 ' + (m.starch ? '青紫色になる' : '色が変わらない'));
      text('デンプン ' + (m.starch ? 'できている' : 'できていない（' + reason + '）'));
    }
    if (id === 'bio-digestion' && ['starch', 'protein', 'fat'].includes(measures.nutrient)) {
      text('栄養分 ' + { starch: 'デンプン', protein: 'タンパク質', fat: '脂肪' }[measures.nutrient]);
      text('できる物質 ' + measures.product);
      text('吸収される所 柔毛の' + (measures.into === 'lymph' ? 'リンパ管' : '毛細血管'));
    }
    if (id === 'bio-circulation' && ['arterial', 'venous'].includes(measures.blood)) {
      const names = { ra: '右心房', rv: '右心室', la: '左心房', lv: '左心室', vena: '大静脈', aorta: '大動脈', pa: '肺動脈', pv: '肺静脈' };
      text((measures.route === 'body' ? '体循環' : '肺循環') + ' ' + (measures.flow === 'out' ? '心臓から出る' : '心臓にもどる'));
      const path = [names[measures.chamber], names[measures.vessel]];
      text('通る所 ' + (measures.flow === 'out' ? path : path.reverse()).join(' → '));
      text('流れる血液 ' + (measures.blood === 'arterial' ? '動脈血（酸素が多い）' : '静脈血（酸素が少ない）'));
    }
    if (id === 'bio-reflex' && ['reflex', 'conscious'].includes(measures.kind)) {
      const names = { skin: '皮ふ', sensory: '感覚神経', spinal: 'せきずい', brain: '脳', motor: '運動神経', muscle: '筋肉' };
      const work = { skin: '刺激を受けとる', sensory: '信号を、せきずいへ伝える',
        spinal: measures.kind === 'reflex' ? '命令を出す' : '信号を、脳へ伝える', brain: '判断して、命令を出す',
        motor: '命令を、筋肉へ伝える', muscle: 'ちぢんで、手を動かす' };
      text(measures.kind === 'reflex' ? '反射' : '意識して起こる反応');
      text('えらんだ所 ' + names[measures.spot] + '（' + measures.order + ' 番目）');
      text('はたらき ' + work[measures.spot]);
    }
    if (id === 'bio-flower') {
      const m = measures, names = { pistil: 'めしべ', stamen: 'おしべ', petal: '花弁', sepal: 'がく' };
      if (Object.hasOwn(names, m.part) && ['abrana', 'matsu'].includes(m.plant)) {
        const pine = m.plant === 'matsu';
        text('えらんだ部分 ' + (pine && m.part === 'pistil' ? '雌花' : pine && m.part === 'stamen' ? '雄花' : names[m.part]));
        const work = pine ? { pistil: 'りん片に胚珠がついている', stamen: 'りん片の花粉のうで花粉をつくる', petal: 'マツの花にはない', sepal: 'マツの花にはない' } :
          { pistil: '受粉すると、子房は果実に、胚珠は種子になる', stamen: 'やくの中で花粉をつくる', petal: 'めしべとおしべを守る', sepal: 'つぼみのとき、内側を守る' };
        text((pine ? '' : 'はたらき ') + work[m.part]);
        text('胚珠 ' + (pine ? 'むき出し（子房がない）' : '子房の中にある'));
      }
    }
    if (id === 'bio-plants') {
      const values = {
        dicot: ['なかま 被子植物の双子葉類', '葉脈 網状脈', '根 主根と側根'],
        monocot: ['なかま 被子植物の単子葉類', '葉脈 平行脈', '根 ひげ根'],
        gymnosperm: ['なかま 裸子植物', '胚珠 むき出し', 'ふえ方 種子'],
        fern: ['なかま シダ植物', 'ふえ方 胞子', '根・茎・葉の区別 ある'],
        moss: ['なかま コケ植物', 'ふえ方 胞子', '根・茎・葉の区別 ない'],
      };
      if (Object.hasOwn(values, measures.group)) values[measures.group].forEach(value => text(value));
    }
    if (id === 'bio-animals') {
      const match = picture.animals.find(a => a[0] === measures.group);
      if (match) { text('あてはまるなかま ' + match[1]); text('合った特徴 3 つ'); text('例 ' + match[5]); }
      else if (measures.group === 'none' && record(measures.matches) && Array.isArray(measures.best)) {
        text('あてはまるなかま なし');
        const best = picture.animals.filter(a => measures.best.includes(a[0]));
        const count = Math.max(0, ...Object.values(measures.matches));
        text('いちばん近いなかま ' + (count > 0 ? best.map(a => a[1]).join('・') + '（' + count + ' つ合う）' : 'なし'));
      }
    }
    if (id === 'force-spring') {
      const n = force.tenthsText(measures.forceTenths), cm = force.tenthsText(measures.stretchMm);
      if (n !== null) text('力の大きさ ' + n + ' N');
      if (cm !== null) text('ばねののび ' + cm + ' cm');
    }
    if (id === 'force-arrow') {
      const names = { up: '上', down: '下', left: '左', right: '右' };
      if (Number.isInteger(measures.newtons)) text('力の大きさ ' + measures.newtons + ' N');
      if (Object.hasOwn(names, measures.direction)) text('力の向き ' + names[measures.direction]);
    }
    if (id === 'force-balance') {
      if (Number.isInteger(measures.left)) text('左の力 ' + measures.left + ' N');
      if (Number.isInteger(measures.right)) text('右の力 ' + measures.right + ' N');
      const states = { balanced: 'つり合っている', 'moves-right': 'つり合わない（右へ動く）',
        'moves-left': 'つり合わない（左へ動く）', turns: 'つり合わない（回って動く）' };
      if (Object.hasOwn(states, measures.state)) text(states[measures.state]);
    }
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
