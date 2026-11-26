// 台本の描画対象を参照に直し、時間割と途中の状態を求める。DOM には依存しない。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const C = config.explain;
  const DRAW_KINDS = Object.freeze(['el', 'normal', 'axis', 'focus', 'shadow', 'image', 'image-label',
    'ray', 'angle', 'point', 'handles', 'controls', 'grid', 'wave', 'amplitude', 'period', 'vibration', 'sound-waves', 'distance', 'label']);
  const ELEMENTS = ['source', 'blocker', 'screen', 'object', 'eye', 'mirror', 'boundary', 'lens',
    'tuning-fork', 'string', 'bridge', 'firework', 'listener'];
  const ARGS = {
    el: ELEMENTS,
    ray: ['edge', 'incident', 'reflected', 'refracted', 'to-mirror', 'to-eye', 'extension',
      'to-lens', 'to-focus', 'beyond-focus', 'ray1', 'ray2', 'ray3', 'light'],
    angle: ['in', 'out'], point: [...ELEMENTS, 'focus', 'controls', 'wave', 'distance'],
    label: ['frequency', 'time', 'speed'],
  };

  function parseDraw(token) {
    if (typeof token !== 'string') return null;
    const [kind, arg, extra] = token.split(':');
    if (!DRAW_KINDS.includes(kind) || extra !== undefined) return null;
    if (Object.hasOwn(ARGS, kind)) return ARGS[kind].includes(arg) ? { kind, arg } : null;
    return arg === undefined ? { kind, arg: null } : null;
  }

  // ref.source は elements / rays / marks / angles / images / handles / options / sound。
  // id・key・index、または elementId と handle で相手を選ぶ。
  // part は形の部分（body / normal / axis / dot / shadow / highlight）、field は文字の項目。
  function resolve(token, scene, traceResult, handles) {
    const parsed = parseDraw(token), items = [];
    if (!parsed) return { kind: null, arg: null, items };
    const { kind, arg } = parsed;
    const elements = scene?.elements || [], result = traceResult || {}, knobs = handles || [];
    const marks = result.marks || [], angles = result.angles || [], images = result.images || [];
    const focus = marks.filter(m => m.key === 'focus-left' || m.key === 'focus-right');
    const options = scene?.options ? scene.kind === 'refract' ? ['direction', 'medium'] :
      scene.kind === 'sound-string' ? ['thickness', 'tension'] : [] : [];
    const add = (type, ref) => items.push({ type, ref });
    const markText = m => add('text', { source: 'marks', key: m.key, field: 'text' });
    const handleRef = h => ({ source: 'handles', elementId: h.elementId, handle: h.handle });

    if (result.sound) {
      const shapes = result.sound;
      const shape = (key, type = 'element', part) => {
        if (shapes[key]) add(type, { source: 'sound', key, ...(part ? { part } : {}) });
      };
      const label = key => marks.filter(m => m.key === key).forEach(markText);
      if (kind === 'el') {
        const keys = { 'tuning-fork': ['fork'], string: ['box', 'string'], bridge: ['bridge'],
          firework: ['firework'], listener: ['ground', 'listener'] };
        if (Object.hasOwn(keys, arg)) {
          keys[arg].forEach(key => shape(key));
          label(arg);
          return { kind, arg, items };
        }
      }
      const keys = { grid: 'grid', wave: 'wave', amplitude: 'amplitude', period: 'period',
        vibration: 'vibration', distance: 'distanceArrow' };
      if (Object.hasOwn(keys, kind)) {
        shape(keys[kind], kind === 'grid' ? 'element' : 'line');
        label(kind);
        return { kind, arg, items };
      }
      if (kind === 'sound-waves') {
        (shapes.waves || []).forEach((wave, index) => add('arc', { source: 'sound', key: 'waves', index }));
        return { kind, arg, items };
      }
      if (kind === 'label') { label(arg); return { kind, arg, items }; }
      if (kind === 'point' && ['tuning-fork', 'wave', 'bridge', 'distance'].includes(arg)) {
        shape(arg === 'tuning-fork' ? 'fork' : arg === 'distance' ? 'distanceArrow' : arg, 'point', 'highlight');
        return { kind, arg, items };
      }
    }

    if (kind === 'el') {
      for (const e of elements.filter(e => e.type === arg)) {
        add('element', { source: 'elements', id: e.id, part: 'body' });
        if (arg === 'boundary') marks.filter(m => ['air', 'medium'].includes(m.key)).forEach(markText);
        else if (arg !== 'lens') {
          const mark = marks.find(m => m.key === arg), handle = knobs.find(h => h.elementId === e.id);
          if (mark) markText(mark);
          else if (handle) add('text', { ...handleRef(handle), field: 'label' });
        }
      }
    } else if (kind === 'ray') {
      (result.rays || []).forEach((ray, index) => {
        if (ray.role === arg) add('line', { source: 'rays', index });
      });
    } else if (kind === 'normal') {
      const angle = angles.find(a => a.key === 'in');
      if (angle) {
        add('line', { source: 'angles', key: angle.key, part: 'normal' });
        marks.filter(m => m.key === 'normal').forEach(markText);
      }
    } else if (kind === 'axis') {
      elements.filter(e => e.type === 'lens').forEach(e => add('line', { source: 'elements', id: e.id, part: 'axis' }));
      if (items.length) marks.filter(m => m.key === 'axis').forEach(markText);
    } else if (kind === 'focus') {
      focus.forEach(m => add('point', { source: 'marks', key: m.key, part: 'dot' }));
      focus.forEach(markText);
    } else if (kind === 'shadow') {
      const screen = elements.find(e => e.type === 'screen');
      if (screen && result.measures?.shadowBottom > result.measures?.shadowTop) {
        add('shadow', { source: 'elements', id: screen.id, part: 'shadow' });
        marks.filter(m => m.key === 'shadow').forEach(markText);
      }
    } else if (kind === 'image' || kind === 'image-label') {
      images.forEach((image, index) => {
        if (kind === 'image') add('image', { source: 'images', index });
        else if (!image.offBoard) add('text', { source: 'images', index, field: 'kind' });
      });
    } else if (kind === 'angle') {
      if (angles.some(a => a.key === arg)) {
        add('arc', { source: 'angles', key: arg });
        add('text', { source: 'angles', key: arg, field: 'name' });
        add('text', { source: 'angles', key: arg, field: 'valueDeg' });
      }
    } else if (kind === 'point') {
      if (arg === 'focus') focus.forEach(m => add('point', { source: 'marks', key: m.key, part: 'highlight' }));
      else if (arg === 'controls') options.forEach(key => add('point', { source: 'options', key, part: 'highlight' }));
      else elements.filter(e => e.type === arg).forEach(e => add('point', { source: 'elements', id: e.id, part: 'highlight' }));
    } else if (kind === 'handles') knobs.forEach(h => add('handles', handleRef(h)));
    else if (kind === 'controls') options.forEach(key => add('controls', { source: 'options', key }));
    return { kind, arg, items };
  }

  function itemText(item, result, handles) {
    const ref = item.ref;
    let text = '';
    if (ref.source === 'marks') text = result.marks.find(m => m.key === ref.key).text;
    if (ref.source === 'handles') text = handles.find(h => h.elementId === ref.elementId && h.handle === ref.handle).label;
    if (ref.source === 'images') {
      const kind = result.images[ref.index].kind;
      text = kind === 'real' ? '実像' : kind === 'virtual' ? '虚像' : '像';
    }
    if (ref.source === 'angles') {
      const angle = result.angles.find(a => a.key === ref.key);
      text = ref.field === 'name' ? angle.name : Math.round(angle.valueDeg) + '°';
    }
    return text;
  }

  function itemDuration(item, result, handles) {
    if (item.type === 'text') {
      return item.key ? Math.max(C.textMinMs, Array.from(itemText(item, result, handles)).length * C.textCharMs) : C.textFadeMs;
    }
    if (['line', 'image', 'shadow'].includes(item.type)) return C.lineMs;
    if (item.type === 'arc') return C.arcMs;
    if (item.type === 'point') return C.pointMs;
    return C.elementMs;
  }

  function clipSeconds(value, textLength) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    const length = Number.isFinite(textLength) && textLength > 0 ? textLength : 0;
    return (length * C.voiceCharMs + C.voiceExtraMs) / 1000;
  }

  function buildTimeline(steps, scene, traceResult, handles, options = {}) {
    const rate = C.rates.includes(options.rate) ? options.rate : C.defaultRate;
    let total = 0;
    const timed = steps.map((step, index) => {
      const parts = [];
      const words = Object.values(step.lines || {})[0] || '';
      const terms = new Set(Array.from(words.matchAll(/「([^「」]*)」/g), match => match[1]));
      for (const token of step.draw) {
        const resolved = resolve(token, scene, traceResult, handles), groups = [];
        // 同じ種類の形は同時に描き、そのあとで文字を出す。角の名前と数字は別々に出す。
        for (const item of resolved.items) {
          if (item.type === 'text') item.key = item.ref.field !== 'valueDeg' && terms.has(itemText(item, traceResult, handles));
          const previous = groups[groups.length - 1];
          if (previous && previous[0].type === item.type && previous[0].ref.field === item.ref.field &&
              !(item.ref.source === 'sound' && item.ref.key === 'waves')) previous.push(item);
          else groups.push([item]);
        }
        if (!groups.length) groups.push([]);
        for (const items of groups) parts.push({ token, kind: resolved.kind, arg: resolved.arg, items,
          start: 0, duration: Math.max(0, ...items.map(item => itemDuration(item, traceResult, handles))) });
      }
      const draw = parts.reduce((sum, part) => sum + part.duration, 0);
      let voice = 0;
      if (Array.isArray(options.clipSeconds)) {
        voice = clipSeconds(options.clipSeconds[index], options.textLengths?.[index]) * 1000;
      }
      const stretch = draw > 0 ? Math.max(1, voice * C.stretchRatio / draw) : 1;
      let drawDuration = 0;
      for (const part of parts) {
        part.start = drawDuration;
        part.duration *= stretch / rate;
        drawDuration += part.duration;
      }
      const reading = Array.isArray(options.readMs) && options.readMs.length === steps.length &&
        Number.isFinite(options.readMs[index]) && options.readMs[index] >= 0 ? options.readMs[index] : 0;
      const duration = Math.max(drawDuration, voice / rate, reading / rate) + C.gapMs / rate;
      const entry = { index, start: total, drawDuration, duration, parts };
      total += duration;
      return entry;
    });
    return { steps: timed, total };
  }

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function position(value, max) {
    return clamp(typeof value === 'number' && !Number.isNaN(value) ? Math.round(value) : 0, 0, Math.max(0, max));
  }

  function stateAt(timeline, stepIndex, localMs) {
    const steps = timeline.steps, index = position(stepIndex, steps.length - 1), current = steps[index];
    if (!current) return { stepIndex: 0, parts: [], stepDone: true };
    const elapsed = clamp(typeof localMs === 'number' && !Number.isNaN(localMs) ? localMs : 0, 0, current.duration);
    const parts = [];
    for (let i = 0; i <= index; i++) {
      for (const part of steps[i].parts) {
        const progress = i < index ? 1 : part.duration === 0 ? (elapsed >= part.start ? 1 : 0) :
          clamp((elapsed - part.start) / part.duration, 0, 1);
        const { token, kind, arg, items } = part;
        parts.push({ token, kind, arg, items, progress });
      }
    }
    return { stepIndex: index, parts, stepDone: elapsed >= current.drawDuration };
  }

  function finalState(timeline) { return stateAt(timeline, timeline.steps.length - 1, Infinity); }

  function nextTarget(stepIndex, stepDone, count) {
    const index = position(stepIndex, count - 1);
    if (count <= 0) return { action: 'end', stepIndex: 0 };
    if (!stepDone) return { action: 'finish-step', stepIndex: index };
    return index + 1 < count ? { action: 'go', stepIndex: index + 1 } : { action: 'end', stepIndex: index };
  }

  function backTarget(stepIndex) { return Math.max(0, position(stepIndex, Number.MAX_SAFE_INTEGER) - 1); }

  function readMs(text) {
    return Math.max(C.readMinMs, (typeof text === 'string' ? Array.from(text).length : 0) * C.readCharMs);
  }

  const api = { DRAW_KINDS, parseDraw, resolve, clipSeconds, readMs, buildTimeline, stateAt, finalState, nextTarget, backTarget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { explain: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
