// シーンの計算結果を SVG に描き、つまみの操作を scene に渡す。
// 光線・角度・像の計算は行わず、描画と入力だけを受け持つ。
(function (root) {
  'use strict';

  const node = typeof module === 'object' && module.exports;
  const config = node ? require('./config.js') : root.Hikari.config;
  const scene = node ? require('./scene.js') : root.Hikari.scene;
  const math = node ? require('./view-math.js') : root.Hikari.viewMath;
  const geometry = node ? require('./geometry.js') : root.Hikari.geometry;
  const C = config.colors, W = config.width, H = config.height;
  const NS = 'http://www.w3.org/2000/svg';
  const pictureColor = tone => C[{ ink: 'text', red: 'redPen', green: 'green', gray: 'normal', orange: 'ray' }[tone] || 'text'];
  let serial = 0;

  // 描画とテストで同じ文字・障害物を使う。角度以外の座標は付けたい相手の位置。
  function labelData(board, result, size, handles = scene.handles(board.scene)) {
    handles = math.forceHandles(handles, result, size);
    const labels = [];
    const obstacles = handles.map(handle => ({ x: handle.x, y: handle.y, r: size.knobRadius }));
    const padding = 3 * size.unitPerPx;
    if (result.picture) {
      result.picture.rings.forEach(r => obstacles.push({ left: r.cx - r.rx - padding, right: r.cx + r.rx + padding,
        top: r.cy - r.ry - padding, bottom: r.cy + r.ry + padding }));
      result.picture.pins.forEach(pin => obstacles.push({ left: pin.to.x - padding * 2, right: pin.to.x + padding * 2,
        top: pin.to.y - padding * 2, bottom: pin.to.y + padding * 2 }));
      result.marks.forEach(mark => {
        if (result.picture.below.some(row => row.key === mark.key || row.keys?.includes(mark.key))) return;
        const tag = result.picture.tags.some(t => t.key === mark.key);
        const fontSize = Math.max(size.textSize, mark.size || 19);
        const side = mark.key.startsWith('side-') || mark.key.startsWith('count');
        const maxWidth = mark.bounds?.width || (side ? (size.textSize > 30 ? 296 : 206) : tag && mark.text.length < 18 ? 270 : 560);
        const lines = mark.maxRows === 1 ? [mark.text] : math.wrapPictureText(mark.text, maxWidth, fontSize);
        labels.push({ id: 'mark-' + mark.key, text: mark.text, lines, x: mark.x, y: mark.y, anchor: mark.anchor,
          fontSize, priority: 4, textLength: Math.max(...lines.map(t => math.pictureTextWidth(t, fontSize))),
          bounds: mark.bounds, maxRows: mark.maxRows || 2,
          color: pictureColor(mark.tone), bold: mark.key === 'title', picture: true, tag, preferOwn: true, searchBoard: true });
      });
      return { labels, obstacles };
    }
    if (result.force) {
      const shapes = result.force, small = size.textSize > 22;
      // つまみのつかむ範囲と、ばね・おもり・箱の面を空ける。
      obstacles.forEach(circle => { circle.r = size.hitRadius; });
      for (const rect of [...(shapes.weights || []), shapes.box, shapes.card].filter(Boolean)) {
        obstacles.push({ left: rect.x - padding, right: rect.x + rect.width + padding,
          top: rect.y - padding, bottom: rect.y + rect.height + padding });
      }
      if (shapes.graph) {
        const g = shapes.graph;
        const tick = (id, text, x, y, anchor) => labels.push({ id, text, x, y, anchor,
          fontSize: size.textSize, textLength: Math.min(text.length * size.textSize * .55, g.xTicks[1].x - g.xTicks[0].x - 6),
          priority: 0, fixed: true, color: C.normal });
        g.xTicks.forEach((p, i) => tick('tick-x-' + i, p.text, p.x, g.origin.y + size.textSize + 4, 'middle'));
        g.yTicks.forEach((p, i) => tick('tick-y-' + i, p.text,
          g.origin.x - 16 - (small ? i % 2 * size.textSize * 1.3 : 0), p.y + size.textSize * .35, 'end'));
      }
      result.marks.forEach(mark => {
        const state = mark.key === 'state', fontSize = size.textSize * (state ? 1.15 : 1);
        const lines = small && mark.key === 'weights' ? mark.text.split(' ').length === 3 ?
          ['おもり ', mark.text.slice(4)] : ['おもり ', 'なし'] :
          small && mark.key === 'graph-y' ? ['ばねののび', '〔cm〕'] : undefined;
        const width = Math.max(...(lines || [mark.text]).map(text => Array.from(text).length)) * fontSize;
        labels.push({ id: 'mark-' + mark.key, text: mark.text, ...(lines ? { lines } : {}),
          ...(mark.key === 'force' ? { textLength: mark.text.length * fontSize * .65 } : {}),
          x: Math.max(0, Math.min(W - width, mark.x)),
          y: small && mark.key === 'graph-x' ? H - fontSize * .2 - 4 : mark.y + (mark.key === 'force' ? fontSize * .35 : 0),
          priority: mark.key === 'force' ? 1 : 4, fontSize, bold: state, preferOwn: true, searchBoard: mark.key !== 'force',
          color: state ? result.measures.state === 'balanced' ? C.green : C.redPen :
            ['force', 'application', 'direction', 'right'].includes(mark.key) ? C.redPen :
              ['stretch', 'magnitude'].includes(mark.key) ? C.green : C.bluePen });
      });
      return { labels, obstacles };
    }
    if (result.sound?.fork) {
      const { x, y } = result.sound.fork;
      obstacles.push({ left: x - 16 - padding, right: x + 16 + padding,
        top: y - 65 - padding, bottom: y + 41 + padding });
    }
    if (result.sound?.listener) {
      const { x, ear, feetY } = result.sound.listener;
      obstacles.push({ left: x - 18 - padding, right: x + 18 + padding,
        top: ear.y - 12 - padding, bottom: feetY + padding });
    }
    const incoming = result.angles.find(angle => angle.key === 'in');
    const incomingLabel = incoming && { ...math.angleLabel(incoming, size),
      text: Math.round(math.angleValue(incoming.valueDeg)) + '°', fontSize: size.angleSize };
    result.angles.forEach(angle => {
      const p = math.angleLabel(angle, size, incomingLabel), color = angle.key === 'in' ? C.bluePen : C.redPen;
      labels.push({ id: 'angle-' + angle.key, text: Math.round(math.angleValue(angle.valueDeg)) + '°', ...p,
        priority: 0, fontSize: size.angleSize, color, bold: true, fixed: true });
      if (size.showAngleNames) labels.push({ id: 'angle-name-' + angle.key, text: angle.name, ...p,
        y: p.y - Math.max(size.angleSize * 1.05, size.angleSize + size.textSize * .2),
        priority: 2, fontSize: size.textSize, color, preferOwn: true });
    });
    handles.forEach(handle => {
      if (result.sound && (handle.handle === 'frequency' || result.marks.some(mark => mark.text === handle.label))) return;
      const onAxis = (board.scene.kind === 'lens' && handle.handle === 'focus') ||
        (board.scene.kind === 'lens-image' && handle.handle === 'move');
      labels.push({ id: 'handle-' + handle.elementId + ':' + handle.handle,
        text: handle.label, x: handle.x, y: handle.y, priority: 1, fontSize: size.textSize, color: C.text,
        ...(result.sound ? { searchBoard: true } : {}),
        ...(onAxis ? { prefer: 'below' } : {}) });
    });
    result.images.forEach((image, index) => {
      if (!image.offBoard) labels.push({ id: 'image-' + index,
        text: image.kind === 'real' ? '実像' : image.kind === 'virtual' ? '虚像' : '像',
        x: image.x, y: image.y - (image.height || 0), priority: 3, fontSize: size.textSize, color: C.redPen });
    });
    result.marks.forEach(mark => {
      if (!result.sound && (handles.some(h => h.label === mark.text) || (mark.key === 'eye' && handles.some(h => h.label === '見る人')))) return;
      const focus = mark.key.startsWith('focus-');
      if (mark.key === 'focus-right' && board.id === 'lens') return;
      const box = math.markBox(mark, size);
      if (!box) return;
      labels.push({ id: 'mark-' + mark.key, text: mark.text,
        ...(result.sound && mark.key === 'tuning-fork' && size.unitPerPx > 600 / 360 ? { lines: ['おんさ', '（音源）'] } : {}),
        ...(result.sound && mark.key === 'period' && size.unitPerPx > 600 / 360 ? { lines: ['1 回の', '振動'] } : {}),
        ...(result.sound && mark.key === 'time' ? { alternatives: [
          { x: result.sound.listener.x < W / 2 ? W - 16 : 16, y: 130,
            anchor: result.sound.listener.x < W / 2 ? 'end' : 'start' },
        ] } : {}),
        x: Math.max(0, Math.min(W - box.width, box.x)),
        y: Math.max(0, Math.min(H - box.height, box.y)) + size.textSize,
        priority: 4, fontSize: size.textSize, preferOwn: true, ...(result.sound ? { searchBoard: true } : {}),
        color: focus || mark.key === 'medium' ? C.bluePen : C.mutedText });
    });
    return { labels, obstacles };
  }

  // 文字を重ねない面と軸。光線・延長線・角度の弧は含めない。
  function lineData(currentScene, result) {
    const lines = [];
    if (result.force) {
      const f = result.force;
      const segment = (a, b) => lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      (f.stand?.lines || []).forEach(([a, b]) => segment(a, b));
      f.spring?.points.slice(1).forEach((p, i) => segment(f.spring.points[i], p));
      [f.stretch, f.forceArrow, f.arrow, f.magnitude, ...Object.values(f.pulls || {})].filter(Boolean)
        .forEach(({ from, to }) => segment(from, to));
      if (f.graph) {
        segment(f.graph.origin, f.graph.xEnd); segment(f.graph.origin, f.graph.yEnd);
        segment(f.graph.line.from, f.graph.line.to);
      }
      return lines;
    }
    if (result.sound?.distanceArrow) {
      const { from, to } = result.sound.distanceArrow;
      lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y }, ...result.rays);
    }
    if (result.sound?.wave) {
      const points = result.sound.wave.points;
      points.slice(1).forEach((p, i) => lines.push({ x1: points[i].x, y1: points[i].y, x2: p.x, y2: p.y }));
    }
    for (const e of currentScene.elements) {
      if (e.type === 'boundary') lines.push({ x1: 0, y1: e.y, x2: W, y2: e.y });
      if (e.type === 'mirror') {
        const t = e.tiltDeg * Math.PI / 180, dx = Math.cos(t) * e.length / 2, dy = Math.sin(t) * e.length / 2;
        lines.push({ x1: e.x - dx, y1: e.y - dy, x2: e.x + dx, y2: e.y + dy });
      }
      if (e.type === 'lens') lines.push(
        { x1: 20, y1: e.y, x2: W - 20, y2: e.y },
        { x1: e.x, y1: e.y - config.lensHalfHeight, x2: e.x, y2: e.y + config.lensHalfHeight });
      if (e.type === 'screen' || e.type === 'blocker') lines.push(
        { x1: e.x, y1: e.y - e.height / 2, x2: e.x, y2: e.y + e.height / 2 });
    }
    if (result.angles.length) {
      const angle = result.angles[0], radians = angle.fromDeg * Math.PI / 180;
      const dx = Math.cos(radians), dy = Math.sin(radians), p = angle.vertex;
      lines.push({ x1: p.x - dx * 100, y1: p.y - dy * 100, x2: p.x + dx * 190, y2: p.y + dy * 190 });
    }
    return lines;
  }

  function create(host, board, onChange = () => {}, validate = scene.validateScene, initialState = null, clock) {
    if (typeof document === 'undefined' || !host) return null;
    const doc = host.ownerDocument, win = doc.defaultView;
    const now = clock || (() => win.performance.now());
    const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const filterId = 'board-sketch-' + (++serial);
    let dragging = null, disposed = false, drawingState = initialState;
    let cachedScene = null, cachedWidth = null, animations = [], penNode = null, sketchNodes = null;
    let frameTime = now(), penPosition = null, penTime = null, penOpacity = 0;
    let penShown = false, fadeStart = frameTime, fadeFrom = 0, penEntry = null;
    let penTransfer = null;
    const handleNodes = new Map();
    function svgNode(tag, attrs = {}, parent, text) {
      const element = doc.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      if (tag === 'line' || tag === 'path' || tag === 'text') element.setAttribute('vector-effect', 'non-scaling-stroke');
      if (text !== undefined) element.textContent = text;
      if (parent) parent.appendChild(element);
      return element;
    }
    const svg = svgNode('svg', { viewBox: '0 0 600 420', class: 'board-svg',
      'aria-label': board.title + 'のホワイトボード' }, host);
    const defs = svgNode('defs', {}, svg);
    const filter = svgNode('filter', { id: filterId, filterUnits: 'userSpaceOnUse', x: -10, y: -10, width: W + 20, height: H + 20 }, defs);
    svgNode('feTurbulence', { type: 'fractalNoise', baseFrequency: '.035', numOctaves: 2, seed: 4, result: 'noise' }, filter);
    svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'noise', scale: '1.4' }, filter);
    const clips = svgNode('g', {}, defs);
    const artRoot = svgNode('g', { 'pointer-events': 'none' }, svg);
    let art = artRoot;
    const labels = svgNode('g', { 'pointer-events': 'none' }, svg);
    const knobs = svgNode('g', {}, svg);
    const error = doc.createElement('div');
    error.className = 'board-error'; error.setAttribute('role', 'status'); error.hidden = true;
    host.appendChild(error);
    const below = doc.createElement('div'); below.className = 'picture-below'; below.hidden = true;
    host.appendChild(below);

    function refKey(ref) {
      return [ref.source, ref.id, ref.index, ref.key, ref.elementId, ref.handle, ref.part, ref.field].join('|');
    }
    function attribute(element, key, value) {
      if (value === null) {
        if (element.hasAttribute(key)) element.removeAttribute(key);
      } else if (element.getAttribute(key) !== String(value)) element.setAttribute(key, value);
    }
    function animate(element, refs, update = () => {}, visible = p => p > 0) {
      if (drawingState === null) return;
      animations.push({ element, keys: refs.map(refKey), update, visible, previous: null, key: false, pen: null });
    }
    function updateDrawing() {
      const progress = new Map();
      for (const part of drawingState.parts || []) {
        const p = reduced ? 1 : typeof part.progress === 'number' && !Number.isNaN(part.progress) ? Math.max(0, Math.min(1, part.progress)) : 0;
        for (const item of part.items || []) if (item.ref) {
          const key = refKey(item.ref), previous = progress.get(key);
          if (!previous || p > previous.p) progress.set(key, { p, key: item.key === true });
        }
      }
      // 描画対象が変わっても、乗りかえ中は前のペン位置から今の先端へ近づける。
      const current = (drawingState.parts || []).find(part => part.progress < 1);
      const currentKeys = new Set((current?.items || []).map(item => refKey(item.ref)));
      let pen = null, completedTip = null;
      for (const entry of animations) {
        const states = entry.keys.map(key => progress.get(key)).filter(Boolean);
        const p = Math.max(0, ...states.map(state => state.p));
        const key = states.some(state => state.p === p && state.key);
        const dependency = entry.keys.map(key => progress.get(key)?.p || 0).join('|');
        if (p !== entry.previous || key !== entry.key || dependency !== entry.dependency) {
          attribute(entry.element, 'display', entry.visible(p) ? null : 'none');
          if (entry.element.hasAttribute('data-picture-below')) entry.element.hidden = !entry.visible(p);
          entry.pen = entry.update(p, key, progress);
          entry.dependency = dependency;
          entry.previous = p; entry.key = key;
        }
        if (p === 1 && entry.keys.join(';') === penEntry && entry.pen) completedTip = entry.pen;
        if (p < 1 && entry.pen && entry.keys.some(key => currentKeys.has(key))) pen = entry;
      }
      // 完了コマでは前の先端まで進めてから乗りかえ、コマ間隔による起点の差をなくす。
      if (completedTip && !penTransfer) penPosition = { ...completedTip };
      updatePen(pen?.pen, pen?.keys.join(';'));
    }
    function resetPen() {
      penPosition = null; penTime = null; penOpacity = 0; penShown = false; penEntry = null; penTransfer = null;
      fadeStart = frameTime; fadeFrom = 0;
    }
    function updatePen(target, entry) {
      if (!penNode) return;
      const hidden = reduced || drawingState.hidePen || (drawingState.paused && !target);
      if (hidden) target = null;
      const delta = frameTime - penTime;
      const invalidTime = !Number.isFinite(frameTime) || (penTime !== null &&
        (!Number.isFinite(penTime) || delta < 0 || delta > config.explain.penMaxDeltaMs));
      const reset = penTime === null || invalidTime;
      if (target) {
        if (!penPosition || reset || !penShown) penTransfer = null;
        else if (entry !== penEntry) penTransfer = { from: { ...penPosition }, start: frameTime };
        if (penTransfer) {
          const fraction = math.easeOut((frameTime - penTransfer.start) / config.explain.penTransferMs);
          penPosition = { x: penTransfer.from.x + (target.x - penTransfer.from.x) * fraction,
            y: penTransfer.from.y + (target.y - penTransfer.from.y) * fraction };
          if (fraction === 1) { penPosition = { ...target }; penTransfer = null; }
        } else {
          penPosition = { ...target };
        }
      } else penTransfer = null;
      penEntry = target ? entry : null;
      const shown = !!target;
      if (shown !== penShown) { fadeStart = frameTime; fadeFrom = penOpacity; penShown = shown; }
      if (invalidTime) { fadeFrom = shown ? 1 : 0; fadeStart = Number.isFinite(frameTime) ? frameTime : 0; }
      const fraction = invalidTime ? 1 : Math.max(0, Math.min(1, (frameTime - fadeStart) / config.explain.penFadeMs));
      penOpacity = hidden ? 0 : fadeFrom + ((shown ? 1 : 0) - fadeFrom) * fraction;
      if (hidden) { fadeFrom = 0; fadeStart = frameTime; }
      penTime = frameTime;
      attribute(penNode, 'display', hidden || (!shown && penOpacity === 0) ? 'none' : null);
      attribute(penNode, 'opacity', penOpacity);
      if (penPosition) attribute(penNode, 'transform', `translate(${penPosition.x} ${penPosition.y})`);
    }
    function pop(ref, center, render) {
      const group = svgNode('g', {}, artRoot), sketches = [];
      art = group; sketchNodes = sketches;
      render(); art = artRoot; sketchNodes = null;
      animate(group, [ref], p => {
        const eased = math.easeOut(p);
        attribute(group, 'opacity', eased);
        attribute(group, 'transform', `translate(${center.x} ${center.y}) scale(${.4 + .6 * eased}) translate(${-center.x} ${-center.y})`);
        sketches.forEach(el => attribute(el, 'filter', p === 1 ? 'url(#' + filterId + ')' : null));
      });
    }
    function growingLine(ref, a, b, color, width, sketch = false, attrs = {}) {
      const el = line(a, b, color, width, sketch, attrs);
      animate(el, [ref], p => {
        const eased = math.ease(p), tip = { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
        attribute(el, 'x2', tip.x); attribute(el, 'y2', tip.y);
        if (sketch) attribute(el, 'filter', p === 1 ? 'url(#' + filterId + ')' : null);
        return tip;
      });
    }

    function line(a, b, color, width, sketch = false, attrs = {}) {
      const el = svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: color, 'stroke-width': width, 'stroke-linecap': 'round',
        ...(sketch ? { filter: 'url(#' + filterId + ')' } : {}), ...attrs }, art);
      if (sketch && sketchNodes) sketchNodes.push(el);
      return el;
    }
    function arrow(a, b, color, size, fraction = .6) {
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance < 1) return;
      const length = Math.min(size, distance / 3);
      const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance;
      const x = a.x + (b.x - a.x) * fraction, y = a.y + (b.y - a.y) * fraction;
      svgNode('polygon', { points: [
        [x + dx * length, y + dy * length],
        [x - dx * length - dy * length * .55, y - dy * length + dx * length * .55],
        [x - dx * length + dy * length * .55, y - dy * length - dx * length * .55],
      ].map(point => point.join(',')).join(' '), fill: color }, art);
    }

    // エンジンの点列・弧・両端を SVG の形に直す。振動や距離はここでは計算しない。
    function drawSound(shapes, s) {
      const ref = key => ({ source: 'sound', key });
      const shape = (key, center, render) => pop(ref(key), center, render);
      const path = (d, color = C.text, attrs = {}) => svgNode('path', { d, fill: 'none', stroke: color,
        'stroke-width': s.thinWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, art);
      if (shapes.fork) shape('fork', shapes.fork, () => {
        const { x, y } = shapes.fork;
        path(`M${x - 16} ${y - 65} v50 a16 16 0 0 0 32 0 v-50 M${x} ${y + 1} v40`, C.text, { 'stroke-width': s.surfaceWidth });
      });
      if (shapes.box) shape('box', shapes.box, () => svgNode('rect', { ...shapes.box, rx: 4,
        fill: C.normal, 'fill-opacity': .12, stroke: C.normal, 'stroke-width': s.thinWidth }, art));
      if (shapes.string) shape('string', shapes.string.from, () =>
        line(shapes.string.from, shapes.string.to, C.text, shapes.string.thick ? 5 : 2));
      if (shapes.bridge) shape('bridge', shapes.bridge, () => {
        const { x, y } = shapes.bridge;
        svgNode('polygon', { points: `${x},${y} ${x - 14},${y + 30} ${x + 14},${y + 30}`, fill: C.normal }, art);
      });
      if (shapes.vibration) {
        const { from: a, to: b, heightPx: h } = shapes.vibration, mid = (a.x + b.x) / 2;
        const el = path(`M${a.x} ${a.y} Q${mid} ${a.y - 2 * h} ${b.x} ${b.y} Q${mid} ${a.y + 2 * h} ${a.x} ${a.y} Z`,
          C.bluePen, { fill: C.bluePen, 'fill-opacity': .1 });
        if (drawingState !== null) {
          const clipId = filterId + '-vibration', clip = svgNode('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, clips);
          const rect = svgNode('rect', { x: a.x - 4, y: a.y - h - 4, width: b.x - a.x + 8, height: h * 2 + 8 }, clip);
          animate(el, [ref('vibration')], p => {
            const t = math.ease(p), x = a.x + (b.x - a.x) * t;
            attribute(rect, 'width', x - a.x + 4);
            attribute(el, 'clip-path', p === 1 ? null : 'url(#' + clipId + ')');
            return { x, y: a.y - 4 * h * t * (1 - t) };
          });
        }
      }
      if (shapes.grid) shape('grid', { x: shapes.grid.x, y: shapes.grid.axisY }, () => {
        const g = shapes.grid;
        for (let i = 0; i <= g.cols; i++) line({ x: g.x + i * g.cellW, y: g.y },
          { x: g.x + i * g.cellW, y: g.y + g.height }, C.normal, .6, false, { opacity: .35 });
        for (let i = 0; i <= g.rows; i++) line({ x: g.x, y: g.y + i * g.cellH },
          { x: g.x + g.width, y: g.y + i * g.cellH }, C.normal, .6, false, { opacity: .35 });
        line({ x: g.x, y: g.axisY }, { x: g.x + g.width, y: g.axisY }, C.normal, s.thinWidth);
      });
      if (shapes.wave) {
        const points = shapes.wave.points;
        const prefix = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`);
        const el = path(prefix.join(' '), C.bluePen, { 'stroke-width': s.rayWidth, 'data-sound': 'wave' });
        animate(el, [ref('wave')], p => {
          const position = math.ease(p) * (points.length - 1), index = Math.floor(position), a = points[index], b = points[Math.min(index + 1, points.length - 1)];
          const tip = { x: a.x + (b.x - a.x) * (position - index), y: a.y + (b.y - a.y) * (position - index) };
          attribute(el, 'd', prefix.slice(0, index + 1).join(' ') + (p < 1 ? ` L${tip.x} ${tip.y}` : ''));
          return tip;
        });
      }
      for (const key of ['amplitude', 'distanceArrow', 'period']) {
        if (!shapes[key]) continue;
        const { from: a, to: b, guide } = shapes[key];
        growingLine(ref(key), a, b, C.normal, s.thinWidth);
        const group = svgNode('g', {}, art); art = group;
        if (key === 'period') {
          for (const p of [a, b]) line({ x: p.x, y: p.y - 7 }, { x: p.x, y: p.y + 7 }, C.normal, s.thinWidth);
        } else {
          const distance = Math.hypot(b.x - a.x, b.y - a.y), length = Math.min(5 * s.unitPerPx, distance / 3);
          arrow(a, b, C.normal, length, 1 - length / distance); arrow(b, a, C.normal, length, 1 - length / distance);
        }
        art = artRoot; animate(group, [ref(key)], undefined, p => p === 1);
        if (guide) growingLine(ref(key), guide.from, guide.to, C.normal, s.thinWidth, false, { 'stroke-dasharray': '8 7' });
      }
      if (shapes.ground) shape('ground', shapes.ground.from, () => line(shapes.ground.from, shapes.ground.to, C.normal, s.thinWidth));
      if (shapes.firework) shape('firework', shapes.firework, () => {
        const { x, y } = shapes.firework;
        path(`M${x - 28} ${y} h56 M${x} ${y - 28} v56 M${x - 20} ${y - 20} l40 40 M${x - 20} ${y + 20} l40 -40`, C.ray,
          { 'stroke-width': s.surfaceWidth });
      });
      if (shapes.listener) shape('listener', shapes.listener.ear, () => {
        const { x, ear, feetY } = shapes.listener;
        svgNode('circle', { cx: x, cy: ear.y, r: 12, fill: C.paper, stroke: C.text, 'stroke-width': s.thinWidth }, art);
        path(`M${x} ${ear.y + 12} V${feetY - 20} M${x - 18} ${ear.y + 35} L${x} ${ear.y + 20} L${x + 18} ${ear.y + 35} M${x - 14} ${feetY} L${x} ${feetY - 20} L${x + 14} ${feetY}`);
      });
      (shapes.waves || []).forEach((arc, index) => {
        const point = degrees => ({ x: arc.cx + arc.r * Math.cos(degrees * Math.PI / 180), y: arc.cy + arc.r * Math.sin(degrees * Math.PI / 180) });
        const a = point(arc.startDeg), end = point(arc.endDeg);
        const d = b => `M${a.x} ${a.y} A${arc.r} ${arc.r} 0 0 1 ${b.x} ${b.y}`;
        const el = path(d(end), C.bluePen, { 'stroke-dasharray': '8 7', 'data-sound': 'arc' });
        animate(el, [{ ...ref('waves'), index }], p => {
          const tip = point(arc.startDeg + (arc.endDeg - arc.startDeg) * math.ease(p));
          attribute(el, 'd', d(tip)); return tip;
        });
      });
    }

    // 力の形は trace の点列・長方形・両端を使う。値や配置はここでは求めない。
    function drawForce(shapes, s) {
      const ref = (key, part, index) => ({ source: 'force', key,
        ...(part ? { part } : {}), ...(index !== undefined ? { index } : {}) });
      const rectangle = rect => svgNode('rect', { ...rect, fill: C.normal, 'fill-opacity': .12,
        stroke: C.normal, 'stroke-width': s.thinWidth }, art);
      const dot = (p, color, r = 5) => svgNode('circle', { cx: p.x, cy: p.y, r,
        fill: color, 'data-force': 'point' }, art);
      function vector(reference, vector, color, width = 3, ends = false) {
        const { from: a, to: b } = vector;
        growingLine(reference, a, b, color, width, false, { 'data-force': reference.key, 'stroke-linecap': 'butt' });
        const group = svgNode('g', { 'data-force-head': reference.key, 'data-side': reference.part || '' }, art); art = group;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const length = Math.min(14 * s.unitPerPx, distance / (ends ? 2 : 1));
        const halfWidth = Math.min(6 * s.unitPerPx, length * .4);
        function head(from, to) {
          const dx = (to.x - from.x) / distance, dy = (to.y - from.y) / distance;
          svgNode('polygon', { points: [
            [to.x, to.y],
            [to.x - dx * length - dy * halfWidth, to.y - dy * length + dx * halfWidth],
            [to.x - dx * length + dy * halfWidth, to.y - dy * length - dx * halfWidth],
          ].map(p => p.join(',')).join(' '), fill: color }, art);
        }
        head(a, b);
        if (ends) head(b, a);
        art = artRoot;
        animate(group, [reference], undefined, p => p === 1);
      }
      if (shapes.grid) pop(ref('grid'), shapes.grid, () => {
        const g = shapes.grid;
        for (let x = g.x; x <= g.x + g.width; x += g.cell)
          line({ x, y: g.y }, { x, y: g.y + g.height }, C.normal, .6, false, { opacity: .25 });
        if (shapes.kind === 'force-arrow') for (let y = g.y; y <= g.y + g.height; y += g.cell)
          line({ x: g.x, y }, { x: g.x + g.width, y }, C.normal, .6, false, { opacity: .25 });
      });
      if (shapes.stand) pop(ref('stand'), shapes.stand.lines[0][0], () =>
        shapes.stand.lines.forEach(([a, b]) => line(a, b, C.normal, s.surfaceWidth)));
      for (const key of ['box', 'card']) if (shapes[key]) pop(ref(key), shapes[key], () => rectangle(shapes[key]));
      if (shapes.spring) {
        const points = shapes.spring.points, prefix = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`);
        const el = svgNode('path', { d: prefix.join(' '), fill: 'none', stroke: C.bluePen,
          'stroke-width': 3, 'stroke-linejoin': 'round', 'data-force': 'spring' }, art);
        animate(el, [ref('spring'), ref('weights')], (_, key, progress) => {
          const p = progress.get(refKey(ref('spring')))?.p || 0;
          const stretch = math.ease(progress.get(refKey(ref('weights')))?.p || 0);
          const mixed = points.map((p, i) => {
            const natural = shapes.spring.naturalPoints[i];
            return { x: natural.x + (p.x - natural.x) * stretch, y: natural.y + (p.y - natural.y) * stretch };
          });
          const prefix = mixed.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`);
          const position = math.ease(p) * (mixed.length - 1), i = Math.floor(position), a = mixed[i], b = mixed[Math.min(i + 1, mixed.length - 1)];
          const tip = { x: a.x + (b.x - a.x) * (position - i), y: a.y + (b.y - a.y) * (position - i) };
          attribute(el, 'd', prefix.slice(0, i + 1).join(' ') + (p < 1 ? ` L${tip.x} ${tip.y}` : ''));
          return tip;
        });
      }
      if (shapes.weights?.length) pop(ref('weights'), shapes.weights[0], () => shapes.weights.forEach(rectangle));
      if (shapes.stretch) {
        vector(ref('stretch'), shapes.stretch, C.green, 2, true);
        for (const p of [shapes.spring.naturalBottom, shapes.spring.bottom])
          growingLine(ref('stretch'), { x: shapes.stretch.from.x, y: p.y }, p, C.normal, 1, false, { 'stroke-dasharray': '6 5' });
      }
      if (shapes.forceArrow) vector(ref('forceArrow'), shapes.forceArrow, C.redPen);
      if (shapes.graph) {
        const g = shapes.graph;
        pop(ref('graph', 'axes'), g.origin, () => {
          line(g.origin, g.xEnd, C.normal, 2); line(g.origin, g.yEnd, C.normal, 2);
          g.xTicks.forEach(p => line({ x: p.x, y: g.origin.y }, { x: p.x, y: g.yEnd.y }, C.normal, .6, false, { opacity: .25 }));
          g.yTicks.forEach(p => line({ x: g.origin.x, y: p.y }, { x: g.xEnd.x, y: p.y }, C.normal, .6, false, { opacity: .25 }));
        });
        growingLine(ref('graph', 'line'), g.line.from, g.line.to, C.bluePen, 3, false, { 'data-force': 'graph-line' });
        g.points.forEach((p, i) => {
          const el = dot(p, p.current ? 'white' : C.bluePen, p.current ? 6 : 4);
          if (p.current) { el.setAttribute('stroke', C.redPen); el.setAttribute('stroke-width', 2); }
          animate(el, [ref('graph', 'points', i)]);
        });
      }
      if (shapes.application) {
        const el = dot(shapes.application, C.redPen);
        animate(el, [ref('application')]);
      }
      if (shapes.arrow) vector(ref('arrow'), shapes.arrow, C.redPen, 5);
      if (shapes.magnitude) {
        const { from: a, to: b } = shapes.magnitude, horizontal = a.y === b.y;
        growingLine(ref('magnitude'), a, b, C.green, 2);
        for (const p of [a, b]) growingLine(ref('magnitude'),
          { x: p.x - (horizontal ? 0 : 5), y: p.y - (horizontal ? 5 : 0) },
          { x: p.x + (horizontal ? 0 : 5), y: p.y + (horizontal ? 5 : 0) }, C.green, 2);
      }
      (shapes.lines || []).forEach((l, i) => growingLine(ref('lines', null, i), l.from, l.to, C.normal, 1.5, false, { 'stroke-dasharray': '7 6' }));
      for (const [side, pull] of Object.entries(shapes.pulls || {})) {
        const color = side === 'left' ? C.bluePen : C.redPen;
        vector(ref('pulls', side), pull, color, 5);
        animate(dot(pull.from, color), [ref('pulls', side)]);
      }
    }

    function drawPicture(shapes, s, data, places) {
      const ref = (key, index) => ({ source: 'picture', key, index });
      shapes.images.forEach((img, index) => {
        const group = svgNode('g', { 'data-picture-image': img.key }, art);
        const crop = img.crop || { x: 0, y: 0, width: config.picture.sourceWidth, height: config.picture.sourceHeight };
        const frame = svgNode('svg', { x: img.x, y: img.y, width: img.width, height: img.height,
          viewBox: `${crop.x} ${crop.y} ${crop.width} ${crop.height}`, preserveAspectRatio: 'none', overflow: 'hidden' }, group);
        const el = svgNode('image', { href: img.src, x: 0, y: 0, width: config.picture.sourceWidth, height: config.picture.sourceHeight,
          preserveAspectRatio: 'none' }, frame);
        svgNode('rect', { x: img.x, y: img.y, width: img.width, height: img.height, fill: 'none',
          class: 'picture-frame', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, group);
        const fallback = svgNode('g', { display: 'none', 'data-picture-error': img.key }, group);
        svgNode('rect', { x: img.x, y: img.y, width: img.width, height: img.height, fill: C.paper }, fallback);
        const rows = math.wrapPictureText('画像を読みこめませんでした', img.width - 12, s.textSize);
        const message = svgNode('text', { x: img.x + img.width / 2, y: img.y + img.height / 2 - (rows.length - 1) * s.textSize * .6,
          'text-anchor': 'middle', 'font-size': s.textSize, fill: C.text, class: 'picture-error' }, fallback);
        rows.forEach((row, i) => svgNode('tspan', { x: img.x + img.width / 2, dy: i ? s.textSize * 1.2 : 0 }, message, row));
        el.addEventListener('error', () => { attribute(el, 'display', 'none'); attribute(fallback, 'display', null); });
        animate(group, [ref('images', index)], p => { attribute(group, 'opacity', p === 1 ? null : math.easeOut(p)); });
      });
      shapes.pins.forEach((pin, index) => {
        const i = data.labels.findIndex(label => label.id === 'mark-' + pin.key), place = places[i];
        const from = place && !place.hidden ? { x: place.x, y: place.y } : pin.from;
        const boxes = places.flatMap((p, j) => j === i || p.hidden ? [] : [math.labelBox({ ...data.labels[j], ...p })]);
        let route = math.pictureLeader(from, pin.to, boxes, 2 * s.unitPerPx);
        if (!route.length && place && !place.hidden) {
          const box = math.labelBox({ ...data.labels[i], ...place });
          route = math.pictureLeader({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }, pin.to, boxes, 2 * s.unitPerPx);
        }
        if (route.length === 2) {
          growingLine(ref('pins', index), route[0], pin.to, pictureColor(pin.tone), s.thinWidth, false, { 'data-picture-pin': pin.key });
        } else {
          const d = route.map((p, j) => (j ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
          const el = svgNode('path', { d, fill: 'none', stroke: pictureColor(pin.tone), 'stroke-width': s.thinWidth,
            pathLength: 1, 'data-picture-pin': pin.key }, art);
          animate(el, [ref('pins', index)], p => {
            attribute(el, 'stroke-dasharray', p === 1 ? null : `${math.ease(p)} 1`);
          });
        }
      });
      shapes.rings.forEach((ring, index) => {
        const el = svgNode('ellipse', { cx: ring.cx, cy: ring.cy, rx: ring.rx, ry: ring.ry, fill: 'none',
          stroke: pictureColor(ring.tone), 'stroke-width': 3, pathLength: 1, 'vector-effect': 'non-scaling-stroke', 'data-picture-ring': ring.key }, art);
        animate(el, [ref('rings', index), ...(shapes.kind === 'bio-flower' ? [ref('images', 0)] : [])], p => {
          attribute(el, 'stroke-dasharray', p === 1 ? null : `${math.ease(p)} 1`);
          return { x: ring.cx + ring.rx * Math.cos(2 * Math.PI * math.ease(p)), y: ring.cy + ring.ry * Math.sin(2 * Math.PI * math.ease(p)) };
        });
      });
    }

    function draw() {
      if (disposed) return;
      let width = svg.getBoundingClientRect().width;
      if (drawingState !== null && cachedScene === board.scene && cachedWidth === width) {
        updateDrawing(); return;
      }
      if (drawingState === null || cachedScene !== board.scene) {
        resetPen();
      }
      animations = []; penNode = null;
      cachedScene = null; cachedWidth = null;
      clips.replaceChildren();
      const errors = validate(board.scene), invalid = errors.length > 0;
      svg.hidden = invalid; svg.style.display = invalid ? 'none' : '';
      error.hidden = !invalid;
      error.replaceChildren();
      below.replaceChildren(); below.hidden = true;
      if (invalid) {
        release(); artRoot.replaceChildren(); labels.replaceChildren(); knobs.replaceChildren(); handleNodes.clear();
        ['この図は表示できません', errors[0]].forEach(note => {
          const p = doc.createElement('p'); p.textContent = note; error.appendChild(p);
        });
        return;
      }
      // エラーから復帰したときは、SVG を表示してから実際の幅を測る。
      width = svg.getBoundingClientRect().width;
      const layout = { compact: width > 0 && width < config.picture.compactBelowPx, widthPx: width };
      let result = scene.trace(board.scene, layout);
      const s = math.sizes(width), f = s.textSize / 16;
      const rawHandles = scene.handles(board.scene), handles = math.forceHandles(rawHandles, result, s);
      art = artRoot; artRoot.replaceChildren(); labels.replaceChildren();
      let data = labelData(board, result, s, rawHandles);
      let places = math.placeLabels(data.labels, data.obstacles, s, lineData(board.scene, result));
      if (result.picture && places.some(place => place.hidden)) {
        if (places.some(place => place.hidden)) {
          layout.belowKeys = places.flatMap((place, i) => place.hidden ? [data.labels[i].id.slice(5)] : []);
          result = scene.trace(board.scene, layout);
          // 収まった文字の位置は保つ。下へ移した文だけ盤から取り除く。
          const keep = data.labels.map((label, i) => ({ label, place: places[i] })).filter(item => !item.place.hidden);
          data.labels = keep.map(item => item.label); places = keep.map(item => item.place);
        }
      }
      if (result.picture) {
        below.hidden = result.picture.below.length === 0;
        result.picture.below.forEach(row => {
          const el = doc.createElement('p');
          el.setAttribute('data-picture-below', row.key); el.setAttribute('data-tone', row.tone);
          below.appendChild(el);
          const keys = row.keys ? [...row.keys, ...(row.key === 'order' ? [row.key] : [])] : [row.key];
          animate(el, keys.map(key => key.startsWith('reason:') ? { source: 'options', key: key.slice(7) } :
            { source: 'marks', key, field: 'text' }), p => {
            el.style.opacity = p === 1 ? '' : String(math.easeOut(p));
            el.style.transform = p === 1 ? '' : `translateY(${6 * (1 - math.easeOut(p))}px)`;
          });
          const highlight = doc.createElement('span'); highlight.className = 'picture-below-highlight';
          highlight.setAttribute('display', 'none'); el.appendChild(highlight);
          math.pictureTextChunks(row.text).forEach((chunk, index) => {
            if (index) el.appendChild(doc.createElement('wbr'));
            const span = doc.createElement('span'); span.className = 'picture-phrase'; span.textContent = chunk;
            el.appendChild(span);
          });
          animate(highlight, keys.map(key => ({ source: 'marks', key, part: 'highlight' })), p => {
            highlight.style.opacity = String(1 - p);
          }, p => p > 0 && p < 1);
        });
      }
      svg.setAttribute('aria-label', board.title + 'のホワイトボード' + (result.picture ? '。写真ふうの画像（本物の写真ではありません）。' +
        result.marks.map(m => m.text).join('。') + '。' + result.picture.description : ''));
      if (result.picture) drawPicture(result.picture, s, data, places);

      // 部品の外形は配置データ、光の道すじと像は trace の結果をそのまま描く。
      for (const e of (result.sound || result.force || result.picture ? [] : board.scene.elements)) {
        if (e.type === 'lens') growingLine({ source: 'elements', id: e.id, part: 'axis' },
          { x: 20, y: e.y }, { x: W - 20, y: e.y }, C.normal, s.thinWidth);
        pop({ source: 'elements', id: e.id, part: 'body' }, { x: e.x ?? W / 2, y: e.y }, () => {
          if (e.type === 'source' && drawingState !== null) {
            svgNode('circle', { cx: e.x, cy: e.y, r: s.hitRadius, fill: C.ray, opacity: .12 }, art);
            svgNode('circle', { cx: e.x, cy: e.y, r: s.knobRadius, fill: C.ray, stroke: C.text, 'stroke-width': 2 }, art);
          }
          if (e.type === 'boundary') {
            svgNode('rect', { x: 0, y: e.y, width: W, height: H - e.y, fill: C.bluePen, opacity: .08 }, art);
            line({ x: 0, y: e.y }, { x: W, y: e.y }, C.bluePen, s.surfaceWidth, true);
          }
          if (e.type === 'mirror') {
            const t = e.tiltDeg * Math.PI / 180, dx = Math.cos(t), dy = Math.sin(t);
            const back = board.id === 'mirror-image' ? -1 : 1;
            line({ x: e.x - dx * e.length / 2, y: e.y - dy * e.length / 2 },
              { x: e.x + dx * e.length / 2, y: e.y + dy * e.length / 2 }, C.text, s.surfaceWidth, true);
            for (let offset = -e.length / 2 + 16; offset < e.length / 2; offset += 32) {
              const p = { x: e.x + dx * offset - dy * 5 * back, y: e.y + dy * offset + dx * 5 * back };
              line(p, { x: p.x - dx * 9 - dy * 9 * back, y: p.y - dy * 9 + dx * 9 * back }, C.text, 2, true);
            }
          }
          if (e.type === 'lens') {
            svgNode('path', { d: `M${e.x} ${e.y - config.lensHalfHeight} Q${e.x - 36} ${e.y} ${e.x} ${e.y + config.lensHalfHeight} Q${e.x + 36} ${e.y} ${e.x} ${e.y - config.lensHalfHeight}`,
              fill: C.bluePen, 'fill-opacity': .08, stroke: C.bluePen, 'stroke-width': 3 }, art);
          }
          if (e.type === 'screen' || e.type === 'blocker') {
            line({ x: e.x, y: e.y - e.height / 2 }, { x: e.x, y: e.y + e.height / 2 },
              e.type === 'screen' ? C.normal : C.text, e.type === 'screen' ? 4 : 8);
          }
          if (e.type === 'object') {
            const tip = { x: e.x, y: e.y - e.height };
            line(e, tip, C.bluePen, 4); arrow(e, tip, C.bluePen, 8 * s.unitPerPx, .85);
          }
          if (e.type === 'eye') {
            svgNode('path', { d: `M${e.x - 18} ${e.y} Q${e.x} ${e.y - 22} ${e.x + 18} ${e.y} Q${e.x} ${e.y + 22} ${e.x - 18} ${e.y}`,
              fill: C.paper, stroke: C.text, 'stroke-width': 3 }, art);
          }
        });
      }
      if (result.sound) drawSound(result.sound, s);
      if (result.force) drawForce(result.force, s);
      if (board.id === 'straight') {
        const screen = board.scene.elements.find(e => e.type === 'screen');
        pop({ source: 'elements', id: screen.id, part: 'shadow' }, screen, () =>
          line({ x: screen.x, y: result.measures.shadowTop }, { x: screen.x, y: result.measures.shadowBottom }, C.text, 10));
      }
      if (result.angles.length) {
        const angle = result.angles[0], radians = angle.fromDeg * Math.PI / 180;
        const normal = { x: Math.cos(radians), y: Math.sin(radians) };
        const vertex = angle.vertex;
        growingLine({ source: 'angles', key: angle.key, part: 'normal' },
          { x: vertex.x - normal.x * 100, y: vertex.y - normal.y * 100 },
          { x: vertex.x + normal.x * 190, y: vertex.y + normal.y * 190 }, C.normal, s.thinWidth, true,
          { 'stroke-dasharray': '8 7' });
      }
      result.rays.forEach((ray, index) => {
        const a = { x: ray.x1, y: ray.y1 }, b = { x: ray.x2, y: ray.y2 };
        const ref = { source: 'rays', index };
        growingLine(ref, a, b, C.ray, s.rayWidth, true, ray.style === 'dashed' ? { 'stroke-dasharray': '8 7' } :
          ray.style === 'dotted' ? { 'stroke-dasharray': '1 7' } : {});
        const p = math.arrowAt(ray, s);
        if (p) {
          const half = p.length / 2, halfWidth = p.width / 2;
          const el = svgNode('polygon', { points: [
            [p.x + p.dx * half, p.y + p.dy * half],
            [p.x - p.dx * half - p.dy * halfWidth, p.y - p.dy * half + p.dx * halfWidth],
            [p.x - p.dx * half + p.dy * halfWidth, p.y - p.dy * half - p.dx * halfWidth],
          ].map(point => point.join(',')).join(' '), fill: C.ray }, art);
          animate(el, [ref], undefined, p => p === 1);
        }
      });
      result.angles.forEach(angle => {
        const radius = 54 * Math.min(f, 1.5), delta = geometry.normalizeDeg(angle.toDeg - angle.fromDeg);
        const point = degrees => ({ x: angle.vertex.x + radius * Math.cos(degrees * Math.PI / 180),
          y: angle.vertex.y + radius * Math.sin(degrees * Math.PI / 180) });
        const a = point(angle.fromDeg), color = angle.key === 'in' ? C.bluePen : C.redPen;
        const path = b => `M${angle.vertex.x} ${angle.vertex.y} L${a.x} ${a.y} A${radius} ${radius} 0 0 ${delta > 0 ? 1 : 0} ${b.x} ${b.y} Z`;
        const hasArc = Math.abs(delta) > .01;
        if (hasArc || drawingState !== null) {
          const el = hasArc ? svgNode('path', { d: path(point(angle.fromDeg + delta)),
            fill: color, 'fill-opacity': .1, stroke: color, 'stroke-width': s.thinWidth }, art) : svgNode('g', {}, art);
          animate(el, [{ source: 'angles', key: angle.key }], p => {
            const tip = point(angle.fromDeg + delta * math.ease(p));
            if (hasArc) attribute(el, 'd', path(tip));
            return tip;
          });
        }
      });
      result.images.forEach((image, index) => pop({ source: 'images', index }, image, () => {
        const tip = { x: image.x, y: image.y - (image.height || 0) };
        if (image.offBoard) {
          const x = Math.max(14, Math.min(W - 14, tip.x)), y = Math.max(14, Math.min(H - 14, tip.y));
          const dx = tip.x < 0 ? -1 : tip.x > W ? 1 : 0, dy = tip.y < 0 ? -1 : tip.y > H ? 1 : 0;
          const start = { x: x - dx * 32 * s.unitPerPx, y: y - dy * 32 * s.unitPerPx };
          line(start, { x, y }, C.redPen, 3); arrow(start, { x, y }, C.redPen, 8 * s.unitPerPx, .75);
        } else {
          line({ x: image.x, y: image.y }, tip, C.redPen, 4);
          arrow({ x: image.x, y: image.y }, tip, C.redPen, 8 * s.unitPerPx, .85);
        }
      }));

      // つまみの DOM は残す。描き直してもフォーカスと pointer capture を失わない。
      const activeKeys = new Set();
      (drawingState === null ? handles : []).forEach(handle => {
        const key = handle.elementId + ':' + handle.handle; activeKeys.add(key);
        let group = handleNodes.get(key);
        if (!group) {
          group = svgNode('g', { class: 'handle', tabindex: '0', role: 'button', 'aria-label': handle.label,
            'data-element-id': handle.elementId, 'data-handle': handle.handle }, knobs);
          group.addEventListener('pointerdown', event => {
            if (drawingState !== null || dragging || event.button !== 0) return;
            if (result.sound) {
              const point = math.toBoardPoint(event.clientX, event.clientY, svg.getBoundingClientRect());
              if (point) {
                const nearest = scene.handles(board.scene).map(h => ({ h, distance: Math.hypot(h.x - point.x, h.y - point.y) }))
                  .filter(item => item.distance <= math.sizes(svg.getBoundingClientRect().width).hitRadius)
                  .sort((a, b) => a.distance - b.distance)[0]?.h;
                if (nearest) {
                  event.preventDefault(); handleNodes.get(nearest.elementId + ':' + nearest.handle).focus({ preventScroll: true });
                  dragging = { pointerId: event.pointerId, elementId: nearest.elementId, handle: nearest.handle };
                  svg.setPointerCapture(event.pointerId); return;
                }
              }
            }
            event.preventDefault(); group.focus({ preventScroll: true });
            const current = math.forceHandles(scene.handles(board.scene), scene.trace(board.scene), math.sizes(svg.getBoundingClientRect().width))
              .find(h => h.elementId === handle.elementId && h.handle === handle.handle);
            dragging = { pointerId: event.pointerId, elementId: handle.elementId, handle: handle.handle, offset: current?.offset };
            svg.setPointerCapture(event.pointerId);
          });
          group.addEventListener('keydown', event => {
            const steps = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] };
            if (drawingState !== null || !steps[event.key] || dragging) return;
            event.preventDefault();
            const current = scene.handles(board.scene).find(h => h.elementId === handle.elementId && h.handle === handle.handle);
            if (!current) return;
            const [dx, dy] = steps[event.key];
            const next = result.force ? scene.stepHandle(board.scene, current.elementId, current.handle, event.key) :
              result.sound ? scene.stepSoundHandle(board.scene, current.elementId, current.handle, event.key) :
              scene.moveElement(board.scene, current.elementId, current.handle, { x: current.x + dx, y: current.y + dy });
            if (next === board.scene) return;
            board.scene = next;
            draw();
          });
          handleNodes.set(key, group);
        }
        group.setAttribute('transform', `translate(${handle.x} ${handle.y})`);
        group.replaceChildren();
        const element = board.scene.elements.find(e => e.id === handle.elementId), source = element.type === 'source';
        svgNode('circle', { r: s.hitRadius, fill: source ? C.ray : C.bluePen, opacity: .12 }, group);
        svgNode('circle', { class: 'knob', r: s.knobRadius, fill: source ? C.ray : 'white',
          stroke: C.text, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, group);
        if (result.sound || result.force) svgNode('text', { class: 'knob-mark', x: 0, y: s.textSize * .35, 'text-anchor': 'middle',
          'font-size': s.textSize, fill: C.bluePen, 'aria-hidden': 'true', 'pointer-events': 'none' }, group,
          board.id === 'force-arrow' ? '✥' : ['amplitude', 'pluck'].includes(handle.handle) ? '↕' : '↔');
        svgNode('circle', { r: s.hitRadius, fill: 'transparent', 'pointer-events': 'all' }, group);
      });
      for (const [key, group] of handleNodes) {
        if (!activeKeys.has(key)) { group.remove(); handleNodes.delete(key); }
      }
      const lens = board.scene.elements.find(e => e.type === 'lens');
      result.marks.forEach(mark => {
        if (lens && mark.key.startsWith('focus-')) {
          const el = svgNode('circle', {
            cx: lens.x + (mark.key === 'focus-left' ? -1 : 1) * lens.focalLength, cy: lens.y,
            r: 4 * s.unitPerPx, fill: C.bluePen }, art);
          animate(el, [{ source: 'marks', key: mark.key, part: 'dot' }]);
        }
      });
      function textRefs(label) {
        if (label.id.startsWith('tick-')) return [{ source: 'force', key: 'graph', part: 'axes' }];
        const ref = label.id.startsWith('angle-name-') ? { source: 'angles', key: label.id.slice(11), field: 'name' } :
          label.id.startsWith('angle-') ? { source: 'angles', key: label.id.slice(6), field: 'valueDeg' } :
          label.id.startsWith('image-') ? { source: 'images', index: Number(label.id.slice(6)), field: 'kind' } :
          label.id.startsWith('mark-') ? { source: 'marks', key: label.id.slice(5), field: 'text' } : null;
        if (ref) return [ref];
        const handle = handles.find(h => label.id === 'handle-' + h.elementId + ':' + h.handle);
        if (!handle) return [];
        const mark = result.marks.find(m => m.text === handle.label || (m.key === 'eye' && handle.label === '見る人'));
        return [{ source: 'handles', elementId: handle.elementId, handle: handle.handle, field: 'label' },
          ...(result.sound ? [{ source: 'handles', elementId: handle.elementId, handle: handle.handle }] : []),
          ...(mark ? [{ source: 'marks', key: mark.key, field: 'text' }] : [])];
      }
      // 完成時の位置で、重要語句は切り抜き、それ以外は浮き上がるように出す。
      places.forEach((place, index) => {
        if (place.hidden) return;
        const label = { ...data.labels[index], ...place };
        if (label.id === 'mark-application' && result.force?.application) {
          const box = math.labelBox({ ...label, ...place }), point = result.force.application;
          const end = { x: Math.max(box.left, Math.min(box.right, point.x)), y: Math.max(box.top, Math.min(box.bottom, point.y)) };
          if (Math.hypot(place.x - point.x, place.y - point.y) > 60)
            growingLine({ source: 'marks', key: 'application', field: 'text' }, point, end, C.redPen, 1, false, { 'data-force': 'application-leader' });
        }
        const labelGroup = label.tag ? svgNode('g', { 'data-picture-tag': label.id.slice(5) }, labels) : labels;
        if (result.picture && label.id === 'mark-side-counts') {
          const box = math.labelBox({ ...label, ...place });
          const divider = svgNode('line', { x1: box.left, y1: box.top, x2: box.right, y2: box.top,
            class: 'picture-frame', 'stroke-width': 1 }, labels);
          animate(divider, textRefs(label));
        }
        if (label.tag) {
          const box = math.labelBox({ ...label, ...place });
          svgNode('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top,
            rx: 4, fill: 'white', 'fill-opacity': .94, stroke: label.color, 'stroke-width': 1 }, labelGroup);
          animate(labelGroup, textRefs(label));
        }
        const el = svgNode('text', { x: place.x, y: place.y, 'text-anchor': place.anchor, fill: label.color,
          'font-size': label.fontSize, 'font-weight': label.bold ? 700 : 400,
          ...(label.picture ? { class: 'picture-text', 'data-picture-text': label.id.slice(5) } : {}),
          ...(!label.picture && label.textLength ? { textLength: label.textLength, lengthAdjust: 'spacingAndGlyphs' } : {}) }, labelGroup, label.lines ? undefined : label.text);
        if (label.lines) label.lines.forEach((text, index) => svgNode('tspan', {
          x: place.x, dy: index ? label.fontSize * 1.2 : 0,
          ...(label.picture ? { textLength: math.pictureTextWidth(text, label.fontSize), lengthAdjust: 'spacingAndGlyphs' } : {}) }, el, text));
        if (drawingState === null) return;
        const box = math.labelBox({ ...label, ...place }), left = box.left - 4, width = box.right - box.left + 8;
        const clipId = filterId + '-text-' + index;
        const clip = svgNode('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, clips);
        const rect = svgNode('rect', { x: left, y: box.top - 4, width, height: box.bottom - box.top + 8 }, clip);
        animate(el, textRefs(label), (p, key) => {
          if (!key) {
            const eased = math.easeOut(p), dy = 6 * s.unitPerPx * (1 - eased);
            const numeric = label.id.startsWith('angle-') && !label.id.startsWith('angle-name-');
            const scale = numeric ? ` translate(${place.x} ${place.y}) scale(${.85 + .15 * eased}) translate(${-place.x} ${-place.y})` : '';
            attribute(el, 'clip-path', null);
            attribute(el, 'opacity', p === 1 ? null : eased);
            attribute(el, 'transform', p === 1 ? null : `translate(0 ${dy})` + scale);
            return null;
          }
          const visibleWidth = width * math.ease(p);
          attribute(el, 'opacity', null); attribute(el, 'transform', null);
          attribute(rect, 'width', visibleWidth);
          attribute(el, 'clip-path', p === 1 ? null : 'url(#' + clipId + ')');
          return { x: left + visibleWidth, y: place.y };
        });
      });
      if (drawingState !== null) {
        const targets = [
          ...board.scene.elements.filter(target => Number.isFinite(target.y)).map(target => ({ target, ref: { source: 'elements', id: target.id, part: 'highlight' } })),
          ...Object.entries(result.sound || {}).flatMap(([key, value]) => {
            const target = value?.points?.[Math.floor(value.points.length / 2)] || value?.from || value;
            return Number.isFinite(target?.x) && Number.isFinite(target?.y) ?
              [{ target, ref: { source: 'sound', key, part: 'highlight' } }] : [];
          }),
          ...Object.entries(result.force || {}).flatMap(([key, value]) => {
            const target = value?.points?.[Math.floor(value.points.length / 2)] || value?.origin || value?.from ||
              value?.left?.from || (Array.isArray(value) ? value[0] : value);
            return Number.isFinite(target?.x) && Number.isFinite(target?.y) ?
              [{ target, ref: { source: 'force', key, part: 'highlight' } }] : [];
          }),
          ...result.marks.filter(target => !result.picture?.below.some(row => row.key === target.key || row.keys?.includes(target.key))).map(target => {
            const place = result.picture && places[data.labels.findIndex(label => label.id === 'mark-' + target.key)];
            return { target: place && !place.hidden ? { ...target, x: place.x, y: place.y } : target,
              ref: { source: 'marks', key: target.key, part: 'highlight' } };
          }),
          ...(['refract', 'sound-string', 'force-spring', 'force-balance'].includes(board.scene.kind) || result.picture ? Object.keys(board.scene.options).map(key => ({
            target: { x: W / 2, y: H - 25 }, ref: { source: 'options', key, part: 'highlight' },
          })) : []),
        ];
        targets.forEach(({ target, ref }) => {
          const el = svgNode('circle', { cx: target.x ?? W / 2, cy: target.y, r: 44 * s.unitPerPx,
            fill: 'none', stroke: '#1A5CFF', 'stroke-width': 3, opacity: 0, 'vector-effect': 'non-scaling-stroke' }, art);
          animate(el, [ref], p => {
            attribute(el, 'r', (22 + 22 * p) * s.unitPerPx);
            attribute(el, 'opacity', 1 - p);
          }, p => p > 0 && p < 1);
        });
        const penSize = config.explain.penSizePx * s.unitPerPx;
        penNode = svgNode('image', { class: 'pen', href: 'assets/pen.svg', display: 'none', opacity: 0,
          x: -penSize * 6 / 64, y: -penSize * 58 / 64, width: penSize, height: penSize }, art);
        cachedScene = board.scene; cachedWidth = width;
        updateDrawing();
      }
      onChange(result);
    }

    function move(event) {
      if (drawingState !== null || !dragging || event.pointerId !== dragging.pointerId) return;
      const point = math.toBoardPoint(event.clientX, event.clientY, svg.getBoundingClientRect());
      if (!point) return;
      if (dragging.offset) { point.x -= dragging.offset.x; point.y -= dragging.offset.y; }
      event.preventDefault();
      board.scene = scene.moveElement(board.scene, dragging.elementId, dragging.handle, point);
      draw();
    }
    function release(event) {
      if (!dragging || (event && event.pointerId !== dragging.pointerId)) return;
      const pointerId = dragging.pointerId; dragging = null;
      if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.addEventListener('lostpointercapture', release);
    const observer = win.ResizeObserver ? new win.ResizeObserver(draw) : null;
    if (observer) observer.observe(host);
    win.addEventListener('resize', draw);
    draw();
    return { draw,
      setState(next, time = now()) {
        if (next !== null) release();
        if ((next === null) !== (drawingState === null)) cachedWidth = null;
        if (next?.stepIndex !== drawingState?.stepIndex) resetPen();
        drawingState = next; frameTime = time; draw();
      },
      setScene(next) { release(); cachedWidth = null; board.scene = next; draw(); },
      destroy() {
        release(); disposed = true;
        if (observer) observer.disconnect();
        win.removeEventListener('resize', draw);
        svg.remove(); error.remove(); below.remove();
      },
    };
  }

  const api = { create, labelData, lineData };
  if (node) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { boardView: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
