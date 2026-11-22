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
  let serial = 0;

  // 描画とテストで同じ文字・障害物を使う。角度以外の座標は付けたい相手の位置。
  function labelData(board, result, size, handles = scene.handles(board.scene)) {
    const labels = [];
    const obstacles = handles.map(handle => ({ x: handle.x, y: handle.y, r: size.knobRadius }));
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
      const onAxis = (board.scene.kind === 'lens' && handle.handle === 'focus') ||
        (board.scene.kind === 'lens-image' && handle.handle === 'move');
      labels.push({ id: 'handle-' + handle.elementId + ':' + handle.handle,
        text: handle.label, x: handle.x, y: handle.y, priority: 1, fontSize: size.textSize, color: C.text,
        ...(onAxis ? { prefer: 'below' } : {}) });
    });
    result.images.forEach((image, index) => {
      if (!image.offBoard) labels.push({ id: 'image-' + index,
        text: image.kind === 'real' ? '実像' : image.kind === 'virtual' ? '虚像' : '像',
        x: image.x, y: image.y - (image.height || 0), priority: 3, fontSize: size.textSize, color: C.redPen });
    });
    result.marks.forEach(mark => {
      if (handles.some(h => h.label === mark.text) || (mark.key === 'eye' && handles.some(h => h.label === '見る人'))) return;
      const focus = mark.key.startsWith('focus-');
      if (mark.key === 'focus-right' && board.id === 'lens') return;
      const box = math.markBox(mark, size);
      if (!box) return;
      labels.push({ id: 'mark-' + mark.key, text: mark.text,
        x: Math.max(0, Math.min(W - box.width, box.x)),
        y: Math.max(0, Math.min(H - box.height, box.y)) + size.textSize,
        priority: 4, fontSize: size.textSize, preferOwn: true,
        color: focus || mark.key === 'medium' ? C.bluePen : C.mutedText });
    });
    return { labels, obstacles };
  }

  // 文字を重ねない面と軸。光線・延長線・角度の弧は含めない。
  function lineData(currentScene, result) {
    const lines = [];
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
        if (p !== entry.previous || key !== entry.key) {
          attribute(entry.element, 'display', entry.visible(p) ? null : 'none');
          entry.pen = entry.update(p, key);
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
      if (invalid) {
        release(); artRoot.replaceChildren(); labels.replaceChildren(); knobs.replaceChildren(); handleNodes.clear();
        ['この図は表示できません', errors[0]].forEach(note => {
          const p = doc.createElement('p'); p.textContent = note; error.appendChild(p);
        });
        return;
      }
      // エラーから復帰したときは、SVG を表示してから実際の幅を測る。
      width = svg.getBoundingClientRect().width;
      const result = scene.trace(board.scene);
      const s = math.sizes(width), f = s.textSize / 16;
      const handles = scene.handles(board.scene);
      art = artRoot; artRoot.replaceChildren(); labels.replaceChildren();

      // 部品の外形は配置データ、光の道すじと像は trace の結果をそのまま描く。
      for (const e of board.scene.elements) {
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
        growingLine(ref, a, b, C.ray, s.rayWidth, true, ray.style === 'dashed' ? { 'stroke-dasharray': '8 7' } : {});
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
            event.preventDefault(); group.focus({ preventScroll: true });
            dragging = { pointerId: event.pointerId, elementId: handle.elementId, handle: handle.handle };
            svg.setPointerCapture(event.pointerId);
          });
          group.addEventListener('keydown', event => {
            const steps = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] };
            if (drawingState !== null || !steps[event.key] || dragging) return;
            event.preventDefault();
            const current = scene.handles(board.scene).find(h => h.elementId === handle.elementId && h.handle === handle.handle);
            if (!current) return;
            const [dx, dy] = steps[event.key];
            board.scene = scene.moveElement(board.scene, current.elementId, current.handle, { x: current.x + dx, y: current.y + dy });
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
      const data = labelData(board, result, s, handles);
      function textRefs(label) {
        const ref = label.id.startsWith('angle-name-') ? { source: 'angles', key: label.id.slice(11), field: 'name' } :
          label.id.startsWith('angle-') ? { source: 'angles', key: label.id.slice(6), field: 'valueDeg' } :
          label.id.startsWith('image-') ? { source: 'images', index: Number(label.id.slice(6)), field: 'kind' } :
          label.id.startsWith('mark-') ? { source: 'marks', key: label.id.slice(5), field: 'text' } : null;
        if (ref) return [ref];
        const handle = handles.find(h => label.id === 'handle-' + h.elementId + ':' + h.handle);
        if (!handle) return [];
        const mark = result.marks.find(m => m.text === handle.label || (m.key === 'eye' && handle.label === '見る人'));
        return [{ source: 'handles', elementId: handle.elementId, handle: handle.handle, field: 'label' },
          ...(mark ? [{ source: 'marks', key: mark.key, field: 'text' }] : [])];
      }
      // 完成時の位置で、重要語句は切り抜き、それ以外は浮き上がるように出す。
      math.placeLabels(data.labels, data.obstacles, s, lineData(board.scene, result)).forEach((place, index) => {
        if (place.hidden) return;
        const label = data.labels[index];
        const el = svgNode('text', { x: place.x, y: place.y, 'text-anchor': place.anchor, fill: label.color,
          'font-size': label.fontSize, 'font-weight': label.bold ? 700 : 400 }, labels, label.text);
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
          ...board.scene.elements.map(target => ({ target, ref: { source: 'elements', id: target.id, part: 'highlight' } })),
          ...result.marks.map(target => ({ target, ref: { source: 'marks', key: target.key, part: 'highlight' } })),
          ...(board.scene.kind === 'refract' ? Object.keys(board.scene.options).map(key => ({
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
        svg.remove(); error.remove();
      },
    };
  }

  const api = { create, labelData, lineData };
  if (node) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { boardView: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
