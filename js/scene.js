// 配置データを検査し、光の法則から光線・像・測った値を求める。
// 操作は新しいシーンを返す。座標は右向き・下向きに増える。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const geometry = typeof module === 'object' && module.exports ? require('./geometry.js') : root.Hikari.geometry;
  const optics = typeof module === 'object' && module.exports ? require('./optics.js') : root.Hikari.optics;
  const sound = typeof module === 'object' && module.exports ? require('./sound.js') : root.Hikari.sound;
  const S = config.sound;
  const KINDS = Object.freeze(['straight', 'reflect', 'mirror-image', 'refract', 'lens', 'lens-image',
    'sound-wave', 'sound-string', 'sound-speed']);
  const W = config.width, H = config.height, M = config.motion.margin, GAP = config.motion.gap;
  const EPS = config.criticalEpsilon;
  const DEG = 180 / Math.PI;
  const roles = {
    straight: ['source', 'blocker', 'screen'], reflect: ['source', 'mirror'],
    'mirror-image': ['object', 'eye', 'mirror'], refract: ['source', 'boundary'],
    lens: ['source', 'lens'], 'lens-image': ['object', 'lens', 'screen'],
    'sound-wave': ['tuning-fork', 'wave'], 'sound-string': ['string'], 'sound-speed': ['firework', 'listener'],
  };
  const fields = {
    source: [], blocker: ['height'], screen: ['height'], object: ['height'], eye: [],
    mirror: ['length', 'tiltDeg'], boundary: [], lens: ['focalLength'],
    'tuning-fork': [], wave: ['frequencyHz', 'amplitude'], string: ['lengthPercent', 'pluck'], firework: [], listener: ['distance'],
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
      const soundPart = ['tuning-fork', 'wave', 'string', 'firework', 'listener'].includes(e.type);
      const allowed = ['id', 'type', ...(soundPart ? [] : ['x', 'y']), ...fields[e.type]];
      if (Object.keys(e).some(key => !allowed.includes(key))) errors.push(`${e.id}: 知らない項目があります`);
      if (!soundPart && (!between(e.x, M, W - M) || !between(e.y, M, H - M))) errors.push(`${e.id}: 座標を盤の操作範囲内の数値にしてください`);
      for (const key of fields[e.type]) {
        if (!number(e[key])) errors.push(`${e.id}: ${key} を有限の数値にしてください`);
      }
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
      if (scene.elements.filter(e => record(e) && e.type === type).length !== 1) errors.push(`${type} を1つだけ入れてください`);
    }
    if (scene.elements.some(e => record(e) && !roles[scene.kind].includes(e.type))) errors.push('この盤では使えない部品があります');
    if (scene.kind === 'refract') {
      if (!record(scene.options) || !['air-to-medium', 'medium-to-air'].includes(scene.options.direction) ||
          !['water', 'glass'].includes(scene.options.medium) || Object.keys(scene.options).some(k => !['direction', 'medium'].includes(k))) {
        errors.push('屈折の direction・medium を選んでください');
      }
    } else if (scene.kind === 'sound-string') {
      if (!record(scene.options) || !['thin', 'thick'].includes(scene.options.thickness) ||
          !['weak', 'strong'].includes(scene.options.tension) || Object.keys(scene.options).some(k => !['thickness', 'tension'].includes(k))) {
        errors.push('弦の thickness・tension を選んでください');
      }
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

  function empty() { return { rays: [], angles: [], images: [], marks: [], notes: [], measures: {}, sound: null }; }

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

  function trace(scene) {
    const result = empty();
    const errors = validateScene(scene);
    if (errors.length) { result.notes.push('この図は表示できません', ...errors); return result; }
    const tracers = { straight: traceStraight, reflect: traceReflect, 'mirror-image': traceMirrorImage,
      refract: traceRefract, lens: traceLens, 'lens-image': traceLensImage,
      'sound-wave': traceSoundWave, 'sound-string': traceSoundString, 'sound-speed': traceSoundSpeed };
    tracers[scene.kind](scene, result);
    return result;
  }

  function handles(scene) {
    if (validateScene(scene).length) return [];
    const result = [];
    function push(e, handle, p, label) { result.push({ elementId: e.id, handle, x: p.x, y: p.y, label }); }
    for (const e of scene.elements) {
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

  function moveElement(scene, elementId, handle, point) {
    if (!record(point) || !number(point.x) || !number(point.y)) return scene;
    if (!handles(scene).some(h => h.elementId === elementId && h.handle === handle)) return scene;
    const next = copy(scene), e = next.elements.find(item => item.id === elementId);
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

  const api = { KINDS, validateScene, trace, handles, moveElement, stepSoundHandle, setOption };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { scene: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
