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
  function labelData(board, result, size) {
    const labels = [], handles = scene.handles(board.scene);
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

  function create(host, board, onChange = () => {}, validate = scene.validateScene, initialState = null) {
    if (typeof document === 'undefined' || !host) return null;
    const doc = host.ownerDocument, win = doc.defaultView;
    const filterId = 'board-sketch-' + (++serial);
    let dragging = null, disposed = false, drawingState = initialState, progress = new Map(), pen = null;
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
    function amount(ref) { return drawingState === null ? 1 : progress.get(refKey(ref)) || 0; }
    function pop(ref, center, render) {
      const p = amount(ref);
      if (!p) return;
      art = svgNode('g', drawingState === null ? {} : { opacity: p,
        transform: `translate(${center.x} ${center.y}) scale(${.4 + .6 * p}) translate(${-center.x} ${-center.y})` }, artRoot);
      render(); art = artRoot;
      if (p < 1) pen = center;
    }
    function growingLine(ref, a, b, color, width, sketch = false, attrs = {}) {
      const p = amount(ref);
      if (!p) return;
      const tip = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
      line(a, tip, color, width, sketch, attrs);
      if (p < 1) pen = tip;
    }

    function line(a, b, color, width, sketch = false, attrs = {}) {
      return svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: color, 'stroke-width': width, 'stroke-linecap': 'round',
        ...(sketch ? { filter: 'url(#' + filterId + ')' } : {}), ...attrs }, art);
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
      const result = scene.trace(board.scene);
      const s = math.sizes(svg.getBoundingClientRect().width), f = s.textSize / 16;
      const handles = scene.handles(board.scene);
      art = artRoot; artRoot.replaceChildren(); labels.replaceChildren(); pen = null;
      progress = new Map();
      for (const part of drawingState?.parts || []) {
        const p = typeof part.progress === 'number' && !Number.isNaN(part.progress) ? Math.max(0, Math.min(1, part.progress)) : 0;
        for (const item of part.items || []) if (item.ref) {
          const key = refKey(item.ref);
          progress.set(key, Math.max(progress.get(key) || 0, p));
        }
      }

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
        if (p && amount(ref) === 1) {
          const half = p.length / 2, halfWidth = p.width / 2;
          svgNode('polygon', { points: [
            [p.x + p.dx * half, p.y + p.dy * half],
            [p.x - p.dx * half - p.dy * halfWidth, p.y - p.dy * half + p.dx * halfWidth],
            [p.x - p.dx * half + p.dy * halfWidth, p.y - p.dy * half - p.dx * halfWidth],
          ].map(point => point.join(',')).join(' '), fill: C.ray }, art);
        }
      });
      result.angles.forEach(angle => {
        const progress = amount({ source: 'angles', key: angle.key });
        if (!progress) return;
        const radius = 54 * Math.min(f, 1.5), delta = geometry.normalizeDeg(angle.toDeg - angle.fromDeg);
        const point = degrees => ({ x: angle.vertex.x + radius * Math.cos(degrees * Math.PI / 180),
          y: angle.vertex.y + radius * Math.sin(degrees * Math.PI / 180) });
        const a = point(angle.fromDeg), b = point(angle.fromDeg + delta * progress), color = angle.key === 'in' ? C.bluePen : C.redPen;
        if (progress < 1) pen = b;
        if (Math.abs(delta) > .01) svgNode('path', {
          d: `M${angle.vertex.x} ${angle.vertex.y} L${a.x} ${a.y} A${radius} ${radius} 0 0 ${delta > 0 ? 1 : 0} ${b.x} ${b.y} Z`,
          fill: color, 'fill-opacity': .1, stroke: color, 'stroke-width': s.thinWidth }, art);
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
        if (lens && mark.key.startsWith('focus-') && amount({ source: 'marks', key: mark.key, part: 'dot' })) svgNode('circle', {
          cx: lens.x + (mark.key === 'focus-left' ? -1 : 1) * lens.focalLength, cy: lens.y,
          r: 4 * s.unitPerPx, fill: C.bluePen }, art);
      });
      const data = labelData(board, result, s);
      function textProgress(label) {
        if (drawingState === null) return 1;
        const ref = label.id.startsWith('angle-name-') ? { source: 'angles', key: label.id.slice(11), field: 'name' } :
          label.id.startsWith('angle-') ? { source: 'angles', key: label.id.slice(6), field: 'valueDeg' } :
          label.id.startsWith('image-') ? { source: 'images', index: Number(label.id.slice(6)), field: 'kind' } :
          label.id.startsWith('mark-') ? { source: 'marks', key: label.id.slice(5), field: 'text' } : null;
        if (ref) return amount(ref);
        const handle = handles.find(h => label.id === 'handle-' + h.elementId + ':' + h.handle);
        if (!handle) return 0;
        const mark = result.marks.find(m => m.text === handle.label || (m.key === 'eye' && handle.label === '見る人'));
        return Math.max(amount({ source: 'handles', elementId: handle.elementId, handle: handle.handle, field: 'label' }),
          mark ? amount({ source: 'marks', key: mark.key, field: 'text' }) : 0);
      }
      // 完成時の文字と障害物で位置を決めてから、見せる文字数だけを変える。
      math.placeLabels(data.labels, data.obstacles, s, lineData(board.scene, result)).forEach((place, index) => {
        if (place.hidden) return;
        const label = data.labels[index], p = textProgress(label);
        if (!p) return;
        const chars = Array.from(label.text), text = chars.slice(0, Math.ceil(chars.length * p)).join('');
        const el = svgNode('text', { x: place.x, y: place.y, 'text-anchor': place.anchor, fill: label.color,
          'font-size': label.fontSize, 'font-weight': label.bold ? 700 : 400 }, labels, label.text);
        if (p < 1) {
          const width = el.getComputedTextLength ? el.getComputedTextLength() : chars.length * label.fontSize;
          const visibleWidth = el.getSubStringLength ? el.getSubStringLength(0, text.length) : Array.from(text).length * label.fontSize;
          const anchor = place.anchor === 'end' ? 1 : place.anchor === 'middle' ? .5 : 0;
          // 中央・右寄せも、完成時の先頭位置から文字を足す。
          el.setAttribute('dx', -(width - visibleWidth) * anchor);
          pen = { x: place.x - width * anchor + visibleWidth, y: place.y };
        }
        el.textContent = text;
      });
      for (const part of drawingState?.parts || []) for (const item of part.items || []) {
        const ref = item.ref, p = ref && amount(ref);
        if (ref?.part !== 'highlight' || !p || p >= 1) continue;
        const target = ref.source === 'elements' ? board.scene.elements.find(e => e.id === ref.id) :
          ref.source === 'marks' ? result.marks.find(m => m.key === ref.key) :
          ref.source === 'options' && board.scene.kind === 'refract' ? { x: W / 2, y: H - 25 } : null;
        if (!target) continue;
        svgNode('circle', { cx: target.x ?? W / 2, cy: target.y, r: (22 + 22 * p) * s.unitPerPx,
          fill: 'none', stroke: '#1A5CFF', 'stroke-width': 3, opacity: 1 - p, 'vector-effect': 'non-scaling-stroke' }, art);
      }
      if (pen) {
        const group = svgNode('g', { class: 'pen', transform: `translate(${pen.x} ${pen.y})` }, art);
        svgNode('circle', { r: 6, fill: C.text }, group);
        svgNode('path', { d: 'M4 -4 L26 -26 L32 -20 L10 2 Z', fill: '#ffd24d', stroke: C.text,
          'stroke-width': 2, 'stroke-linejoin': 'round' }, group);
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
      setState(next) { if (next !== null) release(); drawingState = next; draw(); },
      setScene(next) { release(); board.scene = next; draw(); },
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
