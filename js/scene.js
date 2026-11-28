// 配置データを検査し、光の法則から光線・像・測った値を求める。
// 操作は新しいシーンを返す。座標は右向き・下向きに増える。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const geometry = typeof module === 'object' && module.exports ? require('./geometry.js') : root.Hikari.geometry;
  const optics = typeof module === 'object' && module.exports ? require('./optics.js') : root.Hikari.optics;
  const sound = typeof module === 'object' && module.exports ? require('./sound.js') : root.Hikari.sound;
  const force = typeof module === 'object' && module.exports ? require('./force.js') : root.Hikari.force;
  const S = config.sound;
  const F = config.force;
  const picture = typeof module === 'object' && module.exports ? require('./picture.js') : root.Hikari.picture;
  const KINDS = Object.freeze(['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image',
    'sound-wave', 'sound-string', 'sound-speed', 'force-spring', 'force-arrow', 'force-balance', 'bio-flower', 'bio-plants', 'bio-animals', 'bio-photosynthesis', 'bio-digestion', 'bio-circulation', 'bio-reflex']);
  const W = config.width, H = config.height, M = config.motion.margin, GAP = config.motion.gap;
  const EPS = config.criticalEpsilon;
  const DEG = 180 / Math.PI;
  const roles = {
    'bio-photosynthesis': ['picture'], 'bio-digestion': ['picture'], 'bio-circulation': ['picture'], 'bio-reflex': ['picture'],
    'bio-flower': ['picture'], 'bio-plants': ['picture'], 'bio-animals': ['picture'],
    straight: ['source', 'blocker', 'screen'], reflect: ['source', 'mirror'],
    'mirror-image': ['object', 'eye', 'mirror'], refract: ['source', 'boundary'],
    lens: ['source', 'lens'], 'lens-image': ['object', 'lens', 'screen'],
    'sound-wave': ['tuning-fork', 'wave'], 'sound-string': ['string'], 'sound-speed': ['firework', 'listener'],
    'force-spring': ['stand', 'spring', 'weights'], 'force-arrow': ['box', 'force'], 'force-balance': ['card', 'pull'],
  };
  const fields = {
    picture: [],
    source: [], blocker: ['height'], screen: ['height'], object: ['height'], eye: [],
    mirror: ['length', 'tiltDeg'], boundary: [], lens: ['focalLength'],
    'tuning-fork': [], wave: ['frequencyHz', 'amplitude'], string: ['lengthPercent', 'pluck'], firework: [], listener: ['distance'],
    stand: [], spring: [], weights: [], box: [], force: ['newtons', 'direction'], card: [], pull: ['side', 'newtons'],
  };

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function short(value) { return typeof value === 'string' && value.length > 0 && value.length <= config.boardParamMaxLength; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function between(value, low, high) { return number(value) && value >= low - EPS && value <= high + EPS; }
  function part(scene, type) { return scene.elements.find(e => e.type === type); }
  function copy(scene) { return JSON.parse(JSON.stringify(scene)); }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function scale(v, k) { return { x: v.x * k, y: v.y * k }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }

  function mirrorFrame(mirror) {
    const t = mirror.tiltDeg / DEG;
    const tangent = { x: Math.cos(t), y: Math.sin(t) };
    const normal = { x: Math.sin(t), y: -Math.cos(t) };
    return { tangent, normal, a: add(mirror, scale(tangent, -mirror.length / 2)),
      b: add(mirror, scale(tangent, mirror.length / 2)) };
  }

  function validateScene(scene) {
    const errors = [];
    if (!record(scene)) return ['シーンをオブジェクトにしてください'];
    if (Object.keys(scene).some(key => !['id', 'kind', 'elements', 'options'].includes(key))) errors.push('シーンに知らない項目があります');
    if (!short(scene.id)) errors.push('シーンの id を短い文字列にしてください');
    if (!KINDS.includes(scene.kind)) errors.push('kind を盤の種類から選んでください');
    if (!Array.isArray(scene.elements) || !scene.elements.length) {
      errors.push('elements に必要な部品を入れてください');
      return errors;
    }
    const ids = new Set();
    for (const e of scene.elements) {
      if (!record(e)) { errors.push('部品をオブジェクトにしてください'); continue; }
      if (!short(e.id) || ids.has(e.id)) errors.push('部品の id を重ならない短い文字列にしてください');
      ids.add(e.id);
      if (typeof e.type !== 'string' || !Object.hasOwn(fields, e.type)) {
        errors.push('知らない部品の type です'); continue;
      }
      const picturePart = e.type === 'picture';
      const soundPart = ['tuning-fork', 'wave', 'string', 'firework', 'listener'].includes(e.type);
      const forcePart = ['stand', 'spring', 'weights', 'box', 'force', 'card', 'pull'].includes(e.type);
      const allowed = ['id', 'type', ...(soundPart || forcePart || picturePart ? [] : ['x', 'y']), ...fields[e.type]];
      if (Object.keys(e).some(key => !allowed.includes(key))) errors.push(`${e.id}: 知らない項目があります`);
      if (!soundPart && !forcePart && !picturePart && (!between(e.x, M, W - M) || !between(e.y, M, H - M))) errors.push(`${e.id}: 座標を盤の操作範囲内の数値にしてください`);
      for (const key of fields[e.type]) {
        if (!['direction', 'side'].includes(key) && !number(e[key])) errors.push(`${e.id}: ${key} を有限の数値にしてください`);
      }
      if (forcePart && fields[e.type].includes('newtons') &&
          (!Number.isInteger(e.newtons) || e.newtons < F.newtons.min || e.newtons > F.newtons.max)) errors.push(`${e.id}: newtons を 1〜5 の整数にしてください`);
      if (e.type === 'force' && !['up', 'down', 'left', 'right'].includes(e.direction)) errors.push('力の direction を選んでください');
      if (e.type === 'pull' && !['left', 'right'].includes(e.side)) errors.push('力の side を選んでください');
      const ranges = { frequencyHz: S.frequency, amplitude: S.amplitude, lengthPercent: S.string.length,
        pluck: S.string.pluck, distance: S.distance };
      if (soundPart) for (const key of fields[e.type]) {
        const range = ranges[key], value = e[key];
        if (!number(value) || value < range.min || value > range.max || (value - range.min) % range.step !== 0) {
          errors.push(`${e.id}: ${key} を範囲内のきざみに合わせてください`);
        }
      }
      if (Object.hasOwn(e, 'height') && !between(e.height, config.motion.minObjectHeight, H - 2 * M)) errors.push(`${e.id}: 高さが範囲外です`);
      if (e.type === 'mirror' && (!between(e.length, config.motion.minLength, W - 2 * M) || !between(e.tiltDeg, -90, 90))) errors.push(`${e.id}: 鏡の長さ・傾きが範囲外です`);
      if (e.type === 'lens' && !between(e.focalLength, config.motion.minFocalLength, config.motion.maxFocalLength)) errors.push(`${e.id}: 焦点距離が範囲外です`);
    }
    if (!KINDS.includes(scene.kind)) return errors;
    for (const type of roles[scene.kind]) {
      const count = scene.kind === 'force-balance' && type === 'pull' ? 2 : 1;
      if (scene.elements.filter(e => record(e) && e.type === type).length !== count) errors.push(`${type} を${count}つだけ入れてください`);
    }
    if (scene.kind === 'force-balance' && ['left', 'right'].some(side =>
      scene.elements.filter(e => record(e) && e.type === 'pull' && e.side === side).length !== 1)) errors.push('左右の力を1つずつ入れてください');
    if (scene.elements.some(e => record(e) && !roles[scene.kind].includes(e.type))) errors.push('この盤では使えない部品があります');
    if (picture.isKind(scene.kind)) {
      if (!picture.validOptions(scene.kind, scene.options)) errors.push('画像の図・特徴を決められた値から選んでください');
    } else if (scene.kind === 'refract') {
      if (!record(scene.options) || !['air-to-medium', 'medium-to-air'].includes(scene.options.direction) ||
          !['water', 'glass'].includes(scene.options.medium) || Object.keys(scene.options).some(k => !['direction', 'medium'].includes(k))) {
        errors.push('屈折の direction・medium を選んでください');
      }
    } else if (scene.kind === 'sound-string') {
      if (!record(scene.options) || !['thin', 'thick'].includes(scene.options.thickness) ||
          !['weak', 'strong'].includes(scene.options.tension) || Object.keys(scene.options).some(k => !['thickness', 'tension'].includes(k))) {
        errors.push('弦の thickness・tension を選んでください');
      }
    } else if (scene.kind === 'force-spring') {
      if (!record(scene.options) || force.forceTenths(scene.options.weights) === null ||
          !['A', 'B'].includes(scene.options.spring) || Object.keys(scene.options).some(k => !['weights', 'spring'].includes(k))) {
        errors.push('ばねの weights を 0〜5 の整数、spring を A・B から選んでください');
      }
    } else if (scene.kind === 'force-balance') {
      if (!record(scene.options) || !['same', 'offset'].includes(scene.options.line) ||
          Object.keys(scene.options).some(k => k !== 'line')) errors.push('2 つの力の line を選んでください');
    } else if (scene.options !== undefined) errors.push('この盤には切り替えはありません');
    if (errors.length) return errors;

    const src = part(scene, 'source'), mirror = part(scene, 'mirror'), object = part(scene, 'object');
    const screen = part(scene, 'screen'), lens = part(scene, 'lens');
    if (screen && (!between(screen.y - screen.height / 2, M, H - M) || !between(screen.y + screen.height / 2, M, H - M))) errors.push('スクリーンが盤からはみ出しています');
    if (object && !between(object.height, config.motion.minObjectHeight, config.motion.maxObjectHeight)) errors.push('物体の高さが範囲外です');
    if (scene.kind === 'straight') {
      const blocker = part(scene, 'blocker');
      if (blocker.x - src.x < GAP || screen.x - blocker.x < GAP) errors.push('光源・ついたて・スクリーンの順に間を空けて置いてください');
      if (!between(blocker.y - blocker.height / 2, M, H - M) || !between(blocker.y + blocker.height / 2, M, H - M)) errors.push('ついたてが盤からはみ出しています');
    }
    if (scene.kind === 'reflect') {
      const frame = mirrorFrame(mirror);
      if (!between(mirror.tiltDeg, -config.motion.maxMirrorTiltDeg, config.motion.maxMirrorTiltDeg)) errors.push('鏡の傾きが操作範囲外です');
      if ([frame.a, frame.b].some(p => !between(p.x, M, W - M) || !between(p.y, M, H - M))) errors.push('鏡が盤からはみ出しています');
      if (dot(geometry.sub(src, mirror), frame.normal) < GAP - EPS) errors.push('光源を鏡の手前に置いてください');
    }
    if (scene.kind === 'mirror-image') {
      const eye = part(scene, 'eye');
      const top = mirror.y - mirror.length / 2, bottom = mirror.y + mirror.length / 2;
      if (mirror.tiltDeg !== 90 || !between(top, M, H - M) || !between(bottom, M, H - M)) errors.push('縦の鏡を盤の中に置いてください');
      if (mirror.x - object.x < GAP || mirror.x - eye.x < GAP) errors.push('物体と目を鏡の手前に置いてください');
      if (!between(object.y - object.height, top, bottom) || !between(object.y, top, bottom) ||
          !between(eye.y - config.motion.eyeSpread, top, bottom) || !between(eye.y + config.motion.eyeSpread, top, bottom)) errors.push('物体と目を鏡に映る高さに置いてください');
    }
    if (scene.kind === 'refract') {
      const boundary = part(scene, 'boundary');
      const side = scene.options.direction === 'air-to-medium' ? -1 : 1;
      if (!between(boundary.y, M + GAP, H - M - GAP)) errors.push('境界の両側に光源を置く場所が必要です');
      if (side * (src.y - boundary.y) < GAP) errors.push('光源を選んだ向きの側に置いてください');
    }
    if (lens) {
      if (!between(lens.x, M + config.motion.maxFocalLength, W - M - config.motion.maxFocalLength)) errors.push('レンズの両側に焦点を置く場所が必要です');
      if (!between(lens.y, M + config.lensHalfHeight, H - M - config.lensHalfHeight)) errors.push('レンズの高さが操作範囲外です');
      if (scene.kind === 'lens') {
        if (lens.x - src.x < GAP || !between(lens.y - src.y, config.motion.minBeamOffset,
          Math.min(config.motion.maxBeamOffset, config.lensHalfHeight))) errors.push('光源をレンズの手前の操作範囲に置いてください');
      } else {
        if (lens.x - object.x < GAP || object.y !== lens.y || object.y - object.height < M) errors.push('物体を光軸上でレンズから離して置いてください');
        if (screen.x - lens.x < GAP || screen.y !== lens.y) errors.push('スクリーンをレンズの右の光軸上に置いてください');
      }
    }
    return errors;
  }

  function empty() { return { rays: [], angles: [], images: [], marks: [], notes: [], measures: {}, sound: null, force: null, picture: null }; }

  // 線分も半直線も盤の四辺で切る。始点が盤の外でも、見える部分だけを返す。
  function ray(result, start, dir, end = Infinity, style = 'solid', role) {
    if (dir.x === 0 && dir.y === 0) return;
    let low = 0, high = end;
    for (const [key, limit] of [['x', W], ['y', H]]) {
      if (dir[key] === 0) { if (start[key] < 0 || start[key] > limit) return; }
      else {
        const a = -start[key] / dir[key], b = (limit - start[key]) / dir[key];
        low = Math.max(low, Math.min(a, b));
        high = Math.min(high, Math.max(a, b));
      }
    }
    if (high <= low) return;
    const a = add(start, scale(dir, low)), b = add(start, scale(dir, high));
    if (geometry.len(geometry.sub(a, b)) <= EPS) return;
    result.rays.push({ x1: clamp(a.x, 0, W), y1: clamp(a.y, 0, H),
      x2: clamp(b.x, 0, W), y2: clamp(b.y, 0, H), style, arrow: style === 'solid', role });
  }
  function segment(result, a, b, style = 'solid', role) { ray(result, a, geometry.sub(b, a), 1, style, role); }
  function mark(result, key, p, text, away) {
    result.marks.push({ key, x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), text, ...(away ? { away } : {}) });
  }
  function normalMark(result, vertex, normal) {
    // 描画する法線の長さ 190 と盤の端の、近い方に文字を添える。
    let distance = 190;
    for (const [key, limit] of [['x', W], ['y', H]]) {
      if (normal[key] > 0) distance = Math.min(distance, (limit - vertex[key]) / normal[key]);
      else if (normal[key] < 0) distance = Math.min(distance, -vertex[key] / normal[key]);
    }
    const right = normal.y < 0 ? { x: -normal.y, y: normal.x } : { x: normal.y, y: -normal.x };
    mark(result, 'normal', add(vertex, scale(normal, distance)), '法線', right);
  }
  function angle(result, key, name, vertex, normal, direction) {
    const fromDeg = Math.atan2(normal.y, normal.x) * DEG;
    const delta = geometry.normalizeDeg(Math.atan2(direction.y, direction.x) * DEG - fromDeg);
    result.angles.push({ key, name, valueDeg: optics.incidenceDeg(direction, normal),
      vertex: { x: vertex.x, y: vertex.y }, fromDeg, toDeg: fromDeg + delta });
  }
  function addImage(result, kind, x, y, height) {
    const offBoard = x < 0 || x > W || y < 0 || y > H || y - height < 0 || y - height > H;
    result.images.push({ kind, x, y, height, offBoard });
    if (offBoard) result.notes.push('像はこの先にできます');
  }

  function traceStraight(scene, result) {
    const src = part(scene, 'source'), blocker = part(scene, 'blocker'), screen = part(scene, 'screen');
    const ratio = (screen.x - src.x) / (blocker.x - src.x);
    const ends = [-1, 1].map(sign => src.y + (blocker.y + sign * blocker.height / 2 - src.y) * ratio);
    ends.forEach(y => segment(result, src, { x: screen.x, y }, 'solid', 'edge'));
    const shadowTop = clamp(ends[0], screen.y - screen.height / 2, screen.y + screen.height / 2);
    const shadowBottom = clamp(ends[1], screen.y - screen.height / 2, screen.y + screen.height / 2);
    result.measures = { shadowTop, shadowBottom, shadowSize: shadowBottom - shadowTop };
    mark(result, 'blocker', { x: blocker.x, y: blocker.y - blocker.height / 2 }, 'ついたて', { x: 1, y: 0 });
    mark(result, 'screen', { x: screen.x, y: screen.y - screen.height / 2 }, 'スクリーン', { x: 1, y: 0 });
    if (shadowBottom > shadowTop) mark(result, 'shadow', { x: screen.x, y: (shadowTop + shadowBottom) / 2 }, '影');
  }

  function traceReflect(scene, result) {
    const src = part(scene, 'source'), mirror = part(scene, 'mirror');
    const { normal, a } = mirrorFrame(mirror);
    const incoming = geometry.sub(mirror, src), outgoing = optics.reflect(incoming, normal);
    segment(result, src, mirror, 'solid', 'incident');
    ray(result, mirror, outgoing, Infinity, 'solid', 'reflected');
    angle(result, 'in', '入射角', mirror, normal, geometry.sub(src, mirror));
    angle(result, 'out', '反射角', mirror, normal, outgoing);
    normalMark(result, mirror, normal);
    mark(result, 'mirror', a, '鏡', scale(normal, -1));
    result.measures = { incidenceDeg: result.angles[0].valueDeg, reflectionDeg: result.angles[1].valueDeg, mirrorTiltDeg: mirror.tiltDeg };
  }

  function traceMirrorImage(scene, result) {
    const object = part(scene, 'object'), eye = part(scene, 'eye'), mirror = part(scene, 'mirror');
    const imageX = 2 * mirror.x - object.x;
    const tip = { x: object.x, y: object.y - object.height }, imageTip = { x: imageX, y: tip.y };
    for (const sign of [-1, 1]) {
      const target = { x: eye.x, y: eye.y + sign * config.motion.eyeSpread };
      const hit = geometry.intersectLine(target, geometry.sub(imageTip, target),
        { x: mirror.x, y: 0 }, { x: mirror.x, y: H });
      segment(result, tip, hit, 'solid', 'to-mirror');
      segment(result, hit, target, 'solid', 'to-eye');
      segment(result, hit, imageTip, 'dashed', 'extension');
    }
    addImage(result, 'mirror', imageX, object.y, object.height);
    mark(result, 'mirror', { x: mirror.x, y: mirror.y - mirror.length / 2 }, '鏡', { x: 1, y: 0 });
    mark(result, 'eye', eye, '目');
    result.measures = { objectDistance: mirror.x - object.x, imageDistance: imageX - mirror.x };
  }

  function traceRefract(scene, result) {
    const src = part(scene, 'source'), boundary = part(scene, 'boundary');
    const { direction, medium } = scene.options;
    const entering = direction === 'air-to-medium';
    const n1 = config.refractiveIndex[entering ? 'air' : medium];
    const n2 = config.refractiveIndex[entering ? medium : 'air'];
    const normal = { x: 0, y: entering ? -1 : 1 };
    const incoming = geometry.sub(boundary, src);
    const incidenceDeg = optics.incidenceDeg(incoming, normal);
    const refraction = optics.refract(incidenceDeg, n1, n2);
    segment(result, src, boundary, 'solid', 'incident');
    const reflected = optics.reflect(incoming, normal);
    if (refraction.total) {
      ray(result, boundary, reflected, Infinity, 'solid', 'reflected');
      result.notes.push('全反射');
    } else {
      const t = refraction.refractionDeg / DEG;
      const outgoing = { x: Math.sign(incoming.x) * Math.sin(t), y: -normal.y * Math.cos(t) };
      ray(result, boundary, outgoing, Infinity, 'solid', 'refracted');
      // 通常の屈折でも境界で一部が反射する。角度の out は屈折角を示す。
      ray(result, boundary, reflected, Infinity, 'solid', 'reflected');
    }
    angle(result, 'in', '入射角', boundary, normal, geometry.sub(src, boundary));
    if (refraction.total) angle(result, 'out', '反射角', boundary, normal, reflected);
    else {
      const t = refraction.refractionDeg / DEG;
      angle(result, 'out', '屈折角', boundary, scale(normal, -1),
        { x: Math.sign(incoming.x) * Math.sin(t), y: -normal.y * Math.cos(t) });
    }
    normalMark(result, boundary, normal);
    mark(result, 'air', { x: 16, y: boundary.y - 28 }, '空気');
    mark(result, 'medium', { x: 16, y: boundary.y + 28 }, medium === 'water' ? '水' : 'ガラス');
    result.measures = { incidenceDeg, refractionDeg: refraction.refractionDeg, totalReflection: refraction.total,
      criticalDeg: optics.criticalDeg(n1, n2), direction, medium };
  }

  function lensMarks(result, lens) {
    for (const [key, sign] of [['focus-left', -1], ['focus-right', 1]]) {
      const x = lens.x + sign * lens.focalLength;
      if (x < 0 || x > W || lens.y < 0 || lens.y > H) continue;
      mark(result, key, { x, y: lens.y }, '焦点', { x: 0, y: 1 });
    }
    mark(result, 'axis', { x: W - 60, y: lens.y }, '光軸', { x: 0, y: 1 });
  }

  function traceLens(scene, result) {
    const src = part(scene, 'source'), lens = part(scene, 'lens');
    const offset = lens.y - src.y;
    const focus = { x: lens.x + lens.focalLength, y: lens.y };
    for (const height of [-offset, 0, offset]) {
      const hit = { x: lens.x, y: lens.y + height };
      segment(result, { x: src.x, y: hit.y }, hit, 'solid', 'to-lens');
      segment(result, hit, focus, 'solid', 'to-focus');
      ray(result, focus, { x: lens.focalLength, y: -height }, Infinity, 'solid', 'beyond-focus');
    }
    lensMarks(result, lens);
    result.measures = { focalLength: lens.focalLength, beamOffset: offset };
  }

  function traceLensImage(scene, result) {
    const object = part(scene, 'object'), lens = part(scene, 'lens'), screen = part(scene, 'screen');
    const a = lens.x - object.x, f = lens.focalLength, h = object.height;
    const image = optics.thinLens(a, f);
    const tip = { x: object.x, y: object.y - h };
    const paths = [
      { hit: { x: lens.x, y: tip.y }, dir: { x: f, y: h }, role: 'ray1' },
      { hit: { x: lens.x, y: lens.y }, dir: { x: a, y: h }, role: 'ray2' },
    ];
    // 焦点の上では「手前の焦点を通る光」はレンズと平行になり、レンズへ届かない。
    if (image.kind !== 'none') paths.push({ hit: { x: lens.x, y: lens.y + h * f / (a - f) }, dir: { x: 1, y: 0 }, role: 'ray3' });
    for (const { hit, dir, role } of paths) {
      if (!between(hit.y, lens.y - config.lensHalfHeight, lens.y + config.lensHalfHeight)) continue;
      segment(result, tip, hit, 'solid', role);
      ray(result, hit, dir, Infinity, 'solid', role);
      if (image.kind === 'virtual') ray(result, hit, scale(dir, -1), Infinity, 'dashed', 'extension');
    }
    lensMarks(result, lens);
    if (image.kind === 'none') result.notes.push('像はできません（レンズを出た光が平行になります）');
    else {
      if (image.kind === 'virtual') result.notes.push('虚像（スクリーンには映りません）');
      addImage(result, image.kind, lens.x + (image.inverted ? image.b : -image.b), lens.y,
        (image.inverted ? -1 : 1) * h * image.magnification);
    }
    result.measures = { objectDistance: a, imageDistance: image.b, magnification: image.magnification,
      imageKind: image.kind, inverted: image.inverted,
      screenSharp: image.kind === 'real' && Math.abs(screen.x - lens.x - image.b) <= config.positionTolerance };
  }

  function soundGrid(layout) {
    return { x: layout.x, y: layout.axisY - 4 * layout.cellH, width: layout.width, height: 8 * layout.cellH,
      cols: S.cells, rows: 8, cellW: layout.width / S.cells, cellH: layout.cellH, axisY: layout.axisY };
  }

  function soundWave(frequency, amplitude, grid) {
    const count = sound.cycles(frequency, S.windowSec), offsets = new Set([0, grid.width]);
    for (let x = 0; x < grid.width; x += 2) offsets.add(x);
    // 山・谷と横軸を通る点も入れ、粗い標本で振幅や振動の回数を失わない。
    for (let quarter = 1; quarter <= count * 4; quarter++) offsets.add(quarter / (count * 4) * grid.width);
    const points = [...offsets].sort((a, b) => a - b).map(x => ({ x: grid.x + x,
      y: grid.axisY - grid.cellH * sound.wavePoint(frequency, amplitude, x / grid.width * S.windowSec) }));
    const peak = { x: grid.x + grid.width / count / 4, y: grid.axisY - amplitude * grid.cellH };
    return { wave: { points }, amplitude: { from: { x: peak.x, y: grid.axisY }, to: peak } };
  }

  function soundLabel(result, key, p, text) {
    mark(result, key, p, text);
    result.sound.labels[key] = result.marks[result.marks.length - 1];
  }

  function traceSoundWave(scene, result) {
    const e = part(scene, 'wave'), layout = S.layout.wave, grid = soundGrid(layout);
    const shapes = soundWave(e.frequencyHz, e.amplitude, grid);
    const periodWidth = grid.width / sound.cycles(e.frequencyHz, S.windowSec);
    const startX = e.frequencyHz < 125 ? grid.x : shapes.amplitude.to.x;
    const y = grid.y - 16;
    shapes.amplitude.guide = { from: { ...shapes.amplitude.to },
      to: { x: grid.x + layout.amplitudeCol * grid.cellW, y: shapes.amplitude.to.y } };
    result.sound = { kind: scene.kind, fork: { x: layout.forkX, y: grid.axisY }, grid, ...shapes,
      period: { from: { x: startX, y }, to: { x: startX + periodWidth, y }, y }, labels: {} };
    result.measures = { frequencyHz: e.frequencyHz, amplitude: e.amplitude,
      cycles: sound.cycles(e.frequencyHz, S.windowSec), periodSec: 1 / e.frequencyHz };
    soundLabel(result, 'tuning-fork', { x: 20, y: 260 }, 'おんさ（音源）');
    soundLabel(result, 'grid', { x: grid.x, y: 400 }, '1 目もり ＝ 0.001 秒');
    soundLabel(result, 'amplitude', { x: shapes.amplitude.from.x + 12, y: (grid.axisY + shapes.amplitude.to.y) / 2 }, '振幅');
    soundLabel(result, 'period', { x: (startX * 2 + periodWidth) / 2, y: 20 }, '1 回の振動');
    soundLabel(result, 'frequency', { x: 400, y: 20 }, '振動数 ' + result.measures.frequencyHz + ' Hz');
  }

  function traceSoundString(scene, result) {
    const e = part(scene, 'string'), layout = S.layout.string, grid = soundGrid(layout);
    const { thickness, tension } = scene.options;
    const frequency = sound.stringFrequency(e.lengthPercent, thickness, tension);
    const initial = sound.stringFrequency(S.string.length.initial, S.string.initial.thickness, S.string.initial.tension);
    const from = { x: layout.x, y: layout.stringY };
    const bridge = { x: layout.x + layout.width * e.lengthPercent / 100, y: layout.stringY };
    const shapes = soundWave(frequency, e.pluck, grid);
    result.sound = { kind: scene.kind,
      box: { x: layout.boxX, y: layout.boxY, width: layout.boxWidth, height: layout.boxHeight },
      string: { from, to: { x: layout.x + layout.width, y: layout.stringY }, thick: thickness === 'thick' },
      bridge, vibration: { from: { ...from }, to: { ...bridge }, heightPx: layout.pluckPx * e.pluck },
      grid, ...shapes, labels: {} };
    result.measures = { pitch: sound.compare(frequency, initial),
      loudness: { higher: 'louder', same: 'same', lower: 'softer' }[sound.compare(e.pluck, S.string.pluck.initial)],
      thickness, tension, lengthPercent: e.lengthPercent, pluck: e.pluck, cycles: sound.cycles(frequency, S.windowSec) };
    soundLabel(result, 'string', { x: 90, y: 75 }, '弦');
    soundLabel(result, 'bridge', { x: bridge.x, y: 160 }, 'ことじ');
    soundLabel(result, 'grid', { x: grid.x, y: 410 }, '1 目もり ＝ 0.001 秒');
    soundLabel(result, 'amplitude', { x: shapes.amplitude.from.x + 12,
      y: (grid.axisY + shapes.amplitude.to.y) / 2 }, '振幅');
  }

  function listenerX(distance) {
    const layout = S.layout.speed;
    return layout.listenerMinX + (distance - S.distance.min) / (S.distance.max - S.distance.min) *
      (layout.listenerMaxX - layout.listenerMinX);
  }

  function traceSoundSpeed(scene, result) {
    const distance = part(scene, 'listener').distance, layout = S.layout.speed;
    const firework = { x: layout.fireworkX, y: layout.fireworkY }, x = listenerX(distance);
    const ear = { x, y: layout.earY }, eye = { x, y: layout.eyeY };
    const dx = ear.x - firework.x, dy = ear.y - firework.y, radius = Math.hypot(dx, dy);
    const offset = { x: dy / radius * layout.arrowOffset, y: -dx / radius * layout.arrowOffset };
    const waves = [];
    for (let i = 1; i <= 4; i++) {
      const r = radius * i / 4;
      // 右下の弧を盤の右辺・下辺で切る。最外周は必ず耳を通る。
      const startDeg = Math.acos(Math.min(1, (W - firework.x) / r)) * DEG;
      const endDeg = Math.asin(Math.min(1, (H - firework.y) / r)) * DEG;
      waves.push({ cx: firework.x, cy: firework.y, r, startDeg, endDeg });
    }
    result.sound = { kind: scene.kind, firework,
      ground: { from: { x: 30, y: layout.groundY }, to: { x: 580, y: layout.groundY } },
      listener: { x, feetY: layout.groundY, ear, eye }, waves,
      distanceArrow: { from: add(firework, offset), to: add(ear, offset) }, labels: {} };
    const delayTenths = sound.delayTenths(distance);
    result.measures = { distance, delayTenths, delaySec: delayTenths / 10, speed: S.speed };
    segment(result, firework, eye, 'dotted', 'light');
    soundLabel(result, 'firework', { x: 25, y: 45 }, '花火（音源）');
    soundLabel(result, 'listener', { x, y: 385 }, '見る人');
    soundLabel(result, 'distance', add({ x: (firework.x + ear.x) / 2, y: (firework.y + ear.y) / 2 }, scale(offset, 2)), distance + ' m');
    soundLabel(result, 'time', { x: Math.min(x, 400), y: 265 }, (delayTenths / 10).toFixed(1) + ' 秒後に聞こえる');
    soundLabel(result, 'speed', { x: 330, y: 30 }, '音の速さ 約 ' + S.speed + ' m/s');
  }

  function forceLabel(result, key, p, text) {
    mark(result, key, p, text);
    result.force.labels[key] = result.marks[result.marks.length - 1];
  }

  function traceForceSpring(scene, result) {
    const { weights, spring } = scene.options, l = F.layout.spring;
    const forceTenths = force.forceTenths(weights), stretchMm = force.stretchMm(weights, spring);
    const top = { x: l.x, y: l.y }, naturalBottom = { x: l.x, y: l.y + l.naturalLength };
    const bottom = { x: l.x, y: naturalBottom.y + stretchMm / 10 * l.cmPx };
    const springPoints = end => {
      const points = [top, { x: l.x, y: top.y + 10 }];
      for (let i = 0; i < l.turns * 2; i++) points.push({
        x: l.x + (i % 2 ? l.halfWidth : -l.halfWidth),
        y: top.y + 10 + (end.y - top.y - 20) * (i + .5) / (l.turns * 2),
      });
      points.push({ x: l.x, y: end.y - 10 }, end);
      return points;
    };
    const points = springPoints(bottom), naturalPoints = springPoints(naturalBottom);
    const weightBottom = { x: bottom.x, y: bottom.y + weights * l.weightHeight };
    const origin = { x: l.graphX, y: l.graphY };
    const graphPoints = Array.from({ length: F.weights.max + 1 }, (_, n) => ({
      x: origin.x + n * l.graphStepX, y: origin.y - force.stretchMm(n, spring) / 10 * l.graphCmPx, current: n === weights,
    }));
    result.force = { kind: scene.kind,
      stand: { lines: [[{ x: 60, y: l.y }, { x: 180, y: l.y }],
        [{ x: 70, y: l.y }, { x: 70, y: 390 }], [{ x: 40, y: 390 }, { x: 250, y: 390 }]] },
      spring: { points, naturalPoints, top, bottom, naturalBottom },
      weights: Array.from({ length: weights }, (_, i) => ({ x: l.x - l.weightWidth / 2,
        y: bottom.y + i * l.weightHeight, width: l.weightWidth, height: l.weightHeight })),
      stretch: weights ? { from: { x: 100, y: naturalBottom.y }, to: { x: 100, y: bottom.y } } : null,
      forceArrow: weights ? { from: weightBottom, to: { x: weightBottom.x, y: weightBottom.y + weights * l.forceStep } } : null,
      graph: { origin, xEnd: { x: 580, y: origin.y }, yEnd: { x: origin.x, y: 60 },
        xTicks: graphPoints.map((p, i) => ({ x: p.x, text: force.tenthsText(force.forceTenths(i)) })),
        yTicks: Array.from({ length: 11 }, (_, i) => ({ y: origin.y - i * l.graphCmPx, text: String(i) })),
        line: { from: { ...origin }, to: { x: graphPoints[5].x, y: graphPoints[5].y } }, points: graphPoints }, labels: {} };
    result.measures = { weights, spring, forceTenths, stretchMm };
    forceLabel(result, 'spring', { x: 175, y: 110 }, 'ばね ' + spring);
    forceLabel(result, 'weights', { x: 175, y: bottom.y + 15 }, weights ? 'おもり ' + weights + ' 個' : 'おもり なし');
    forceLabel(result, 'stretch', { x: 85, y: naturalBottom.y - 15 }, 'のび');
    forceLabel(result, 'force', { x: 175, y: weightBottom.y + weights * l.forceStep / 2 }, force.tenthsText(forceTenths) + ' N');
    forceLabel(result, 'graph-x', { x: 430, y: 390 }, '力の大きさ〔N〕');
    forceLabel(result, 'graph-y', { x: 330, y: 40 }, 'ばねののび〔cm〕');
  }

  function forceGrid(l) { return { x: l.x - 8 * l.cell, y: l.y - 5 * l.cell, width: 16 * l.cell, height: 10 * l.cell, cell: l.cell }; }
  function forceVector(direction) { return { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[direction]; }
  function forceArrow(from, newtons, direction, cell) { return { from, to: add(from, scale(forceVector(direction), newtons * cell)) }; }

  function forceOrigin(direction) {
    const l = F.layout.arrow;
    return { x: l.x, y: l.y - forceVector(direction).y * l.verticalOffset };
  }

  function traceForceArrow(scene, result) {
    const { newtons, direction } = part(scene, 'force'), l = F.layout.arrow;
    const application = forceOrigin(direction), arrow = forceArrow(application, newtons, direction, l.cell);
    const v = forceVector(direction), offset = { x: -v.y * l.magnitudeOffset, y: v.x * l.magnitudeOffset };
    const magnitude = { from: add(arrow.from, offset), to: add(arrow.to, offset) };
    result.force = { kind: scene.kind, grid: forceGrid({ ...l, ...application }),
      box: { x: application.x - l.boxSize / 2, y: application.y - l.boxSize / 2, width: l.boxSize, height: l.boxSize },
      application, arrow, magnitude, labels: {} };
    result.measures = { newtons, direction };
    forceLabel(result, 'box', { x: l.x - 30, y: l.y - 45 }, '箱');
    forceLabel(result, 'application', add(application, { x: 12, y: 55 }), '作用点');
    forceLabel(result, 'direction', add(arrow.to, { x: 12, y: -12 }), '力の向き');
    forceLabel(result, 'magnitude', add(scale(add(magnitude.from, magnitude.to), .5), { x: 12, y: 20 }), '力の大きさ ' + newtons + ' N');
    forceLabel(result, 'scale', { x: 360, y: 400 }, '1 目もり ＝ 1 N');
  }

  function pullArrow(e, line) {
    const l = F.layout.balance, sign = e.side === 'left' ? -1 : 1;
    return forceArrow({ x: l.x + sign * l.cardSize / 2, y: l.y + (line === 'offset' ? sign * l.offset : 0) }, e.newtons, e.side, l.cell);
  }

  function traceForceBalance(scene, result) {
    const l = F.layout.balance, line = scene.options.line;
    const left = scene.elements.find(e => e.side === 'left'), right = scene.elements.find(e => e.side === 'right');
    const state = force.balanceState(left.newtons, right.newtons, line);
    const pulls = { left: pullArrow(left, line), right: pullArrow(right, line) };
    result.force = { kind: scene.kind, grid: forceGrid(l),
      card: { x: l.x - l.cardSize / 2, y: l.y - l.cardSize / 2, width: l.cardSize, height: l.cardSize }, pulls,
      lines: (line === 'same' ? [l.y] : [pulls.left.from.y, pulls.right.from.y]).map(y => ({ from: { x: 44, y }, to: { x: 556, y } })), labels: {} };
    result.measures = { left: left.newtons, right: right.newtons, line, state };
    forceLabel(result, 'card', { x: 275, y: 145 }, '厚紙');
    forceLabel(result, 'left', { x: 80, y: pulls.left.to.y - 25 }, '左の力 ' + left.newtons + ' N');
    forceLabel(result, 'right', { x: 400, y: pulls.right.to.y - 25 }, '右の力 ' + right.newtons + ' N');
    forceLabel(result, 'state', { x: 180, y: 330 }, { balanced: 'つり合っている（動かない）',
      'moves-right': 'つり合わない（右へ動く）', 'moves-left': 'つり合わない（左へ動く）', turns: 'つり合わない（回って動く）' }[state]);
    forceLabel(result, 'scale', { x: 360, y: 400 }, '1 目もり ＝ 1 N');
  }

  function trace(scene, layout) {
    const result = empty();
    const errors = validateScene(scene);
    if (errors.length) { result.notes.push('この図は表示できません', ...errors); return result; }
    if (picture.isKind(scene.kind)) { picture.trace(scene, result, layout); return result; }
    const tracers = { straight: traceStraight, reflect: traceReflect, 'mirror-image': traceMirrorImage,
      refract: traceRefract, lens: traceLens, 'lens-image': traceLensImage,
      'sound-wave': traceSoundWave, 'sound-string': traceSoundString, 'sound-speed': traceSoundSpeed,
      'force-spring': traceForceSpring, 'force-arrow': traceForceArrow, 'force-balance': traceForceBalance };
    tracers[scene.kind](scene, result);
    return result;
  }

  function handles(scene) {
    if (validateScene(scene).length) return [];
    const result = [];
    function push(e, handle, p, label) { result.push({ elementId: e.id, handle, x: p.x, y: p.y, label }); }
    for (const e of scene.elements) {
      if (e.type === 'force') {
        const l = F.layout.arrow;
        push(e, 'tip', forceArrow(forceOrigin(e.direction), e.newtons, e.direction, l.cell).to, '力の矢印');
      }
      if (e.type === 'pull') push(e, 'tip', pullArrow(e, scene.options.line).to, e.side === 'left' ? '左の力' : '右の力');
      if (e.type === 'wave') {
        const l = S.layout.wave, cellW = l.width / S.cells;
        push(e, 'amplitude', { x: l.x + l.amplitudeCol * cellW, y: l.axisY - e.amplitude * l.cellH }, '振幅');
        push(e, 'frequency', { x: l.x + cellW / (e.frequencyHz * S.cellSec), y: l.axisY }, '振動数');
      }
      if (e.type === 'string') {
        const l = S.layout.string, length = l.width * e.lengthPercent / 100;
        push(e, 'bridge', { x: l.x + length, y: l.stringY }, 'ことじ');
        push(e, 'pluck', { x: l.x + length / 2, y: l.stringY - l.pluckPx * e.pluck }, 'はじく強さ');
      }
      if (e.type === 'listener') push(e, 'move', { x: listenerX(e.distance), y: S.layout.speed.handleY }, '見る人');
      if (e.type === 'source') push(e, 'move', e, '光源');
      if (e.type === 'object') push(e, 'move', e, '物体');
      if (e.type === 'eye') push(e, 'move', e, '見る人');
      if (e.type === 'blocker') push(e, 'move', e, 'ついたて');
      if (e.type === 'mirror' && scene.kind === 'reflect') push(e, 'tilt', mirrorFrame(e).b, 'かたむける');
      if (e.type === 'lens' && scene.kind === 'lens') push(e, 'focus', { x: e.x + e.focalLength, y: e.y }, '焦点距離');
      if (e.type === 'screen' && scene.kind === 'lens-image') push(e, 'move', e, 'スクリーン');
    }
    return result;
  }

  // 盤の内側と、鏡の手前の半平面との共通範囲へ止める。
  function sourceBeforeMirror(point, mirror) {
    const { normal, tangent } = mirrorFrame(mirror);
    const p = { x: clamp(point.x, M, W - M), y: clamp(point.y, M, H - M) };
    if (dot(geometry.sub(p, mirror), normal) >= GAP) return p;
    const anchor = add(mirror, scale(normal, GAP));
    let low = -Infinity, high = Infinity;
    for (const [key, max] of [['x', W - M], ['y', H - M]]) {
      if (Math.abs(tangent[key]) <= EPS) continue;
      const a = (M - anchor[key]) / tangent[key], b = (max - anchor[key]) / tangent[key];
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
    }
    return add(anchor, scale(tangent, clamp(dot(geometry.sub(p, anchor), tangent), low, high)));
  }

  // 音のキー操作は座標の丸めを通さず、隣の値へ一つだけ進める。
  function stepSoundHandle(scene, elementId, handle, key) {
    if (!scene.kind.startsWith('sound-') || !handles(scene).some(h => h.elementId === elementId && h.handle === handle)) return scene;
    const settings = {
      amplitude: ['amplitude', S.amplitude, 'ArrowUp', 'ArrowDown'],
      frequency: ['frequencyHz', S.frequency, 'ArrowLeft', 'ArrowRight'],
      bridge: ['lengthPercent', S.string.length, 'ArrowRight', 'ArrowLeft'],
      pluck: ['pluck', S.string.pluck, 'ArrowUp', 'ArrowDown'],
      move: ['distance', S.distance, 'ArrowRight', 'ArrowLeft'],
    };
    const [field, range, increase, decrease] = settings[handle];
    if (key !== increase && key !== decrease) return scene;
    const e = scene.elements.find(item => item.id === elementId);
    const value = clamp(e[field] + (key === increase ? range.step : -range.step), range.min, range.max);
    if (value === e[field]) return scene;
    const next = copy(scene);
    next.elements.find(item => item.id === elementId)[field] = value;
    return next;
  }

  function stepForceHandle(scene, elementId, handle, key) {
    if (!handles(scene).some(h => h.elementId === elementId && h.handle === handle) || !scene.kind.startsWith('force-')) return scene;
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[key];
    if (!['up', 'down', 'left', 'right'].includes(direction)) return scene;
    const e = scene.elements.find(item => item.id === elementId);
    if (e.type === 'pull' && !['left', 'right'].includes(direction)) return scene;
    const current = e.type === 'pull' ? e.side : e.direction;
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' }[current];
    const next = copy(scene), target = next.elements.find(item => item.id === elementId);
    if (direction === current || direction === opposite) target.newtons = clamp(e.newtons + (direction === current ? 1 : -1), F.newtons.min, F.newtons.max);
    else target.direction = direction;
    return target.newtons === e.newtons && target.direction === e.direction ? scene : next;
  }

  function stepHandle(scene, elementId, handle, key) {
    if (validateScene(scene).length) return scene;
    return scene.kind.startsWith('force-') ? stepForceHandle(scene, elementId, handle, key) : stepSoundHandle(scene, elementId, handle, key);
  }

  function moveElement(scene, elementId, handle, point) {
    if (!record(point) || !number(point.x) || !number(point.y)) return scene;
    if (!handles(scene).some(h => h.elementId === elementId && h.handle === handle)) return scene;
    const next = copy(scene), e = next.elements.find(item => item.id === elementId);
    if (scene.kind.startsWith('force-')) {
      let length;
      if (e.type === 'force') {
        const l = F.layout.arrow, origin = forceOrigin(e.direction), dx = point.x - origin.x, dy = point.y - origin.y;
        if (dx === 0 && dy === 0) return scene;
        if (Math.abs(dx) > Math.abs(dy)) e.direction = dx > 0 ? 'right' : 'left';
        else if (Math.abs(dy) > Math.abs(dx)) e.direction = dy > 0 ? 'down' : 'up';
        const target = forceOrigin(e.direction);
        length = (e.direction === 'left' || e.direction === 'right' ? Math.abs(point.x - target.x) : Math.abs(point.y - target.y)) / l.cell;
      } else {
        const from = pullArrow(e, scene.options.line).from;
        length = (point.x - from.x) * (e.side === 'left' ? -1 : 1) / F.layout.balance.cell;
      }
      e.newtons = Math.round(clamp(length, F.newtons.min, F.newtons.max));
      return next;
    }
    if (scene.kind.startsWith('sound-')) {
      const snap = (value, range) => range.min + Math.round((clamp(value, range.min, range.max) - range.min) / range.step) * range.step;
      if (e.type === 'wave') {
        const l = S.layout.wave;
        if (handle === 'amplitude') e.amplitude = snap((l.axisY - point.y) / l.cellH, S.amplitude);
        else {
          const target = clamp(point.x, l.x, l.x + l.width);
          let best = Infinity;
          for (let hz = S.frequency.min; hz <= S.frequency.max; hz += S.frequency.step) {
            const distance = Math.abs(l.x + l.width / S.cells / (hz * S.cellSec) - target);
            if (distance < best) { best = distance; e.frequencyHz = hz; }
          }
        }
      } else if (e.type === 'string') {
        const l = S.layout.string;
        if (handle === 'bridge') e.lengthPercent = snap((point.x - l.x) / l.width * 100, S.string.length);
        else e.pluck = snap((l.stringY - point.y) / l.pluckPx, S.string.pluck);
      } else {
        const l = S.layout.speed;
        const x = clamp(point.x, l.listenerMinX, l.listenerMaxX);
        e.distance = snap(S.distance.min + (x - l.listenerMinX) / (l.listenerMaxX - l.listenerMinX) *
          (S.distance.max - S.distance.min), S.distance);
      }
      return next;
    }
    const x = clamp(point.x, M, W - M), y = clamp(point.y, M, H - M);
    if (scene.kind === 'straight') {
      const src = part(next, 'source'), blocker = part(next, 'blocker'), screen = part(next, 'screen');
      if (e.type === 'source') { e.x = clamp(x, M, blocker.x - GAP); e.y = y; }
      else { e.x = clamp(x, src.x + GAP, screen.x - GAP); e.y = clamp(y, M + e.height / 2, H - M - e.height / 2); }
    } else if (scene.kind === 'reflect') {
      const mirror = part(next, 'mirror');
      if (e.type === 'source') Object.assign(e, sourceBeforeMirror(point, mirror));
      else {
        const desired = clamp(geometry.angleDeg(mirror, { x, y }), -config.motion.maxMirrorTiltDeg, config.motion.maxMirrorTiltDeg);
        const previous = mirror.tiltDeg;
        mirror.tiltDeg = desired;
        if (validateScene(next).length) {
          let low = 0, high = 1;
          for (let i = 0; i < 48; i++) {
            const mid = (low + high) / 2;
            mirror.tiltDeg = previous + (desired - previous) * mid;
            if (validateScene(next).length) high = mid; else low = mid;
          }
          mirror.tiltDeg = previous + (desired - previous) * low;
        }
      }
    } else if (scene.kind === 'mirror-image') {
      const mirror = part(next, 'mirror'), top = mirror.y - mirror.length / 2, bottom = mirror.y + mirror.length / 2;
      e.x = clamp(x, M, mirror.x - GAP);
      e.y = e.type === 'object' ? clamp(y, top + e.height, bottom) : clamp(y, top + config.motion.eyeSpread, bottom - config.motion.eyeSpread);
    } else if (scene.kind === 'refract') {
      const boundary = part(next, 'boundary');
      e.x = x;
      e.y = next.options.direction === 'air-to-medium' ? clamp(y, M, boundary.y - GAP) : clamp(y, boundary.y + GAP, H - M);
    } else if (scene.kind === 'lens') {
      const lens = part(next, 'lens');
      if (e.type === 'source') e.y = clamp(y, lens.y - Math.min(config.motion.maxBeamOffset, config.lensHalfHeight),
        lens.y - config.motion.minBeamOffset);
      else e.focalLength = clamp(x - lens.x, config.motion.minFocalLength, config.motion.maxFocalLength);
    } else {
      const lens = part(next, 'lens');
      e.x = e.type === 'object' ? clamp(x, M, lens.x - GAP) : clamp(x, lens.x + GAP, W - M);
    }
    return next;
  }

  function setOption(scene, key, value) {
    if (!validateScene(scene).length && picture.isKind(scene.kind)) {
      const control = picture.controls(scene.kind, scene.options).find(c => c.key === key);
      if (!control?.enabled || !control.choices.some(c => c.value === value && c.enabled !== false) || scene.options[key] === value) return scene;
      const next = copy(scene); next.options[key] = value; return next;
    }
    if (!validateScene(scene).length && ['force-spring', 'force-balance'].includes(scene.kind)) {
      const choices = scene.kind === 'force-spring' ? { weights: [0, 1, 2, 3, 4, 5], spring: ['A', 'B'] } : { line: ['same', 'offset'] };
      if (!Object.hasOwn(choices, key) || !choices[key].includes(value)) return scene;
      const next = copy(scene);
      next.options[key] = value;
      return next;
    }
    if (!validateScene(scene).length && scene.kind === 'sound-string') {
      const choices = { thickness: ['thin', 'thick'], tension: ['weak', 'strong'] };
      if (!Object.hasOwn(choices, key) || !choices[key].includes(value)) return scene;
      const next = copy(scene);
      next.options[key] = value;
      return next;
    }
    if (validateScene(scene).length || scene.kind !== 'refract') return scene;
    if (key === 'medium' ? !['water', 'glass'].includes(value) : key === 'direction' ?
        !['air-to-medium', 'medium-to-air'].includes(value) : true) return scene;
    const next = copy(scene);
    if (key === 'direction' && value !== next.options.direction) {
      const src = part(next, 'source'), boundary = part(next, 'boundary');
      const side = value === 'air-to-medium' ? -1 : 1;
      const available = side < 0 ? boundary.y - M : H - M - boundary.y;
      const distance = Math.abs(src.y - boundary.y);
      const ratio = Math.min(1, available / distance);
      src.x = boundary.x + (src.x - boundary.x) * ratio;
      src.y = boundary.y + side * distance * ratio;
    }
    next.options[key] = value;
    return next;
  }

  const api = { KINDS, validateScene, trace, handles, moveElement, stepHandle, stepSoundHandle, stepForceHandle, setOption };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { scene: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
