// 盤の表示倍率、角度の文字の位置、指の座標を求める。DOM には依存しない。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const geometry = typeof module === 'object' && module.exports ? require('./geometry.js') : root.Hikari.geometry;

  function sizes(boardWidthPx) {
    const width = Number.isFinite(boardWidthPx) && boardWidthPx > 0 ? boardWidthPx : config.width;
    const unitPerPx = config.width / width;
    return {
      unitPerPx,
      textSize: Math.max(16, config.minTextPx * unitPerPx),
      angleSize: Math.max(21, config.minAnglePx * unitPerPx),
      hitRadius: Math.max(30, config.minHitRadiusPx * unitPerPx),
      knobRadius: Math.max(14, config.minKnobRadiusPx * unitPerPx),
      showAngleNames: width >= config.angleNamesWidthPx,
      rayWidth: width < 420 ? 3.5 : 4.5,
      surfaceWidth: width < 420 ? 3 : 4,
      thinWidth: width < 420 ? 2 : 2.5,
    };
  }

  function angleValue(value) { return Number.isFinite(value) && value >= .5 ? value : 0; }

  // 力のつまみだけを矢じりの先へ離す。エンジンへは矢の先の座標を渡す。
  function forceHandles(handles, result, size) {
    if (!result.force) return handles;
    return handles.map(handle => {
      const vector = result.force.arrow || result.force.pulls?.[handle.elementId];
      if (!vector) return handle;
      const length = Math.hypot(vector.to.x - vector.from.x, vector.to.y - vector.from.y);
      const gap = size.knobRadius + 3 * size.unitPerPx;
      const offset = { x: (vector.to.x - vector.from.x) / length * gap, y: (vector.to.y - vector.from.y) / length * gap };
      return { ...handle, x: handle.x + offset.x, y: handle.y + offset.y, offset };
    });
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function angleLabel(angle, size, incoming) {
    const value = angleValue(angle.valueDeg), zero = value === 0;
    const delta = zero ? 0 : geometry.normalizeDeg(angle.toDeg - angle.fromDeg);
    const side = zero || delta === 0 ? (angle.key === 'in' ? -1 : 1) : Math.sign(delta);
    const inside = value >= 45;
    const offset = inside ? delta / 2 : delta + side * 14;
    let radius = (inside ? 92 : 100) * size.textSize / 16;
    function position(sign) {
      const radians = (angle.fromDeg + sign * offset) * Math.PI / 180;
      const dx = Math.cos(radians) * radius;
      return { x: angle.vertex.x + dx, y: angle.vertex.y + Math.sin(radians) * radius,
        anchor: inside ? 'middle' : dx < 0 ? 'end' : 'start' };
    }
    let placed = position(1);
    if (angle.key === 'out' && incoming) {
      const other = labelBox(incoming);
      const collides = p => overlaps(labelBox({ ...p, text: Math.round(value) + '°', fontSize: size.angleSize }), other);
      if (collides(placed)) {
        // 0° は key の側を保つ。それ以外は法線の反対側へ移す。
        const sign = zero ? 1 : -1;
        placed = position(sign);
        while (collides(placed)) { radius *= 1.5; placed = position(sign); }
      }
    }
    return placed;
  }

  // 収まった文字を保ち、残りだけ範囲を横に広げる。入らない文は below へ渡す。
  function packPictureLabels(labels, obstacles, fallback) {
    const occupied = fallback.flatMap((p, i) => p.hidden ? [] : [labelBox({ ...labels[i], ...p })]);
    labels.forEach((label, index) => {
      if (!fallback[index].hidden) return;
      const b = label.bounds || { x: 0, y: 0, width: config.width, height: config.height };
      for (const width of [b.width, config.width]) {
        const lines = label.maxRows === 1 ? [label.text] : wrapPictureText(label.text, width, label.fontSize);
        const w = Math.max(...lines.map(t => pictureTextWidth(t, label.fontSize))), h = lines.length * label.fontSize * 1.2;
        const left = width === b.width ? b.x : 0, right = left + width;
        if (w > width || h > b.height) continue;
        const own = labelBox({ ...label, lines, textLength: w });
        const xs = [Math.max(left, Math.min(right - w, own.left)), left, right - w,
          ...occupied.flatMap(box => [box.left - w - 1, box.right + 1])];
        const ys = [Math.max(b.y, Math.min(b.y + b.height - h, own.top)), b.y, b.y + b.height - h];
        const candidates = xs.flatMap(x => ys.map(y => ({ left: x, right: x + w, top: y, bottom: y + h })))
          .filter(box => box.left >= left && box.right <= right && box.top >= b.y && box.bottom <= b.y + b.height &&
            ![...occupied, ...obstacles].some(other => overlaps(box, other)))
          .sort((a, c) => Math.hypot(a.left - own.left, a.top - own.top) - Math.hypot(c.left - own.left, c.top - own.top));
        if (!candidates.length) continue;
        const box = candidates[0];
        fallback[index] = { id: label.id, x: box.left + (label.anchor === 'end' ? w : label.anchor === 'middle' ? w / 2 : 0),
          y: box.top + label.fontSize, anchor: label.anchor || 'start', lines, textLength: w, hidden: false };
        occupied.push(box); break;
      }
    });
    return fallback;
  }

  function markBox(mark, size) {
    if (!mark || typeof mark.text !== 'string' || !mark.text.trim() ||
        ![mark.x, mark.y].every(Number.isFinite)) return null;
    const width = Array.from(mark.text).length * size.textSize, height = size.textSize * 1.2;
    const fallback = { x: mark.x, y: mark.y - size.textSize, width, height };
    if (!mark.away || ![mark.away.x, mark.away.y].every(Number.isFinite)) return fallback;
    const magnitude = Math.max(Math.abs(mark.away.x), Math.abs(mark.away.y));
    if (magnitude === 0) return fallback;
    const x = mark.away.x / magnitude, y = mark.away.y / magnitude, length = Math.hypot(x, y);
    const dx = x / length, dy = y / length, gap = 6 * size.unitPerPx;
    const distance = dx === 0 ? gap + height / 2 : dy === 0 ? gap + width / 2 : gap + Math.hypot(width, height) / 2;
    return { x: mark.x + dx * distance - width / 2,
      y: mark.y + dy * distance - height / 2, width, height };
  }

  function toBoardPoint(clientX, clientY, rect) {
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
        rect.width <= 0 || rect.height <= 0 || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return { x: (clientX - rect.left) * config.width / rect.width,
      y: (clientY - rect.top) * config.height / rect.height };
  }

  function pictureTextWidth(text, fontSize) {
    return Array.from(text).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? .6 : 1), 0) * fontSize;
  }
  function pictureTextChunks(text) {
    const chunks = [];
    let start = 0;
    for (let i = 1; i < text.length; i++) {
      if ((/[\s・。、]/u.test(text[i - 1]) || /[（(]/u.test(text[i])) && text.slice(start, i).trim().length > 2) {
        chunks.push(text.slice(start, i)); start = i;
      }
    }
    const rest = text.slice(start);
    if (rest.trim().length <= 2 && chunks.length) chunks[chunks.length - 1] += rest;
    else if (rest) chunks.push(rest);
    return chunks;
  }
  function wrapPictureText(text, width, fontSize) {
    if (pictureTextWidth(text, fontSize) <= width) return [text];
    const candidates = [];
    for (let i = 1; i < text.length; i++) {
      if (!/[\s・。、]/u.test(text[i - 1]) && !/[（(]/u.test(text[i])) continue;
      const rows = [text.slice(0, i), text.slice(i)];
      if (rows.some(row => Array.from(row.trim()).length <= 2)) continue;
      const widest = Math.max(...rows.map(row => pictureTextWidth(row, fontSize)));
      if (widest <= width) candidates.push({ rows, widest });
    }
    candidates.sort((a, b) => a.widest - b.widest);
    // 切れる所がなければ幅を超えたまま返し、配置側で拡幅・below を選ぶ。
    return candidates[0]?.rows || [text];
  }

  function labelBox(label) {
    const rows = label.lines || [label.text];
    const width = label.textLength || Math.max(...rows.map(text => Array.from(text).length)) * label.fontSize;
    const left = label.x - (label.anchor === 'end' ? width : label.anchor === 'middle' ? width / 2 : 0);
    return { left, right: left + width, top: label.y - label.fontSize,
      bottom: label.y + label.fontSize * (.2 + (rows.length - 1) * 1.2) };
  }

  // 線分を箱の各軸で切り詰める。辺や端に触れる場合も交わるとみなす。
  function crossesBox(line, box, padding) {
    let start = 0, end = 1;
    for (const [a, b, low, high] of [
      [line.x1, line.x2, box.left - padding, box.right + padding],
      [line.y1, line.y2, box.top - padding, box.bottom + padding],
    ]) {
      const delta = b - a;
      if (delta === 0) {
        if (a < low || a > high) return false;
      } else {
        const t1 = (low - a) / delta, t2 = (high - a) / delta;
        start = Math.max(start, Math.min(t1, t2));
        end = Math.min(end, Math.max(t1, t2));
        if (start > end) return false;
      }
    }
    return true;
  }

  function placeLabels(labels, obstacles, size, lines) {
    if (!Array.isArray(labels)) return [];
    const circles = (Array.isArray(obstacles) ? obstacles : []).filter(circle => circle &&
      [circle.x, circle.y, circle.r].every(Number.isFinite) && circle.r >= 0);
    const boxes = (Array.isArray(obstacles) ? obstacles : []).filter(box => box &&
      [box.left, box.right, box.top, box.bottom].every(Number.isFinite));
    const segments = (Array.isArray(lines) ? lines : []).filter(line => line &&
      [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite) &&
      (line.x1 !== line.x2 || line.y1 !== line.y2));
    const occupied = [], placed = new Array(labels.length);
    const order = labels.map((label, index) => ({ label, index })).sort((a, b) =>
      a.label?.picture && b.label?.picture && a.label.tag !== b.label.tag ? Number(b.label.tag) - Number(a.label.tag) :
      a.label?.searchBoard && b.label?.searchBoard ?
        Array.from(b.label.text).length - Array.from(a.label.text).length || a.index - b.index :
        (a.label?.priority ?? 3) - (b.label?.priority ?? 3) || a.index - b.index);
    function withinBoard(box) {
      return box.left >= 0 && box.right <= config.width && box.top >= 0 && box.bottom <= config.height;
    }
    function fits(box) {
      return withinBoard(box) && !occupied.some(other => overlaps(box, other)) &&
        !boxes.some(other => overlaps(box, other)) &&
        !segments.some(line => crossesBox(line, box, 3 * size.unitPerPx)) &&
        !circles.some(circle => {
          const x = Math.max(box.left, Math.min(box.right, circle.x));
          const y = Math.max(box.top, Math.min(box.bottom, circle.y));
          return Math.hypot(x - circle.x, y - circle.y) < circle.r;
        });
    }
    for (const { label, index } of order) {
      placed[index] = { id: label?.id, x: label?.x, y: label?.y, anchor: label?.anchor || 'start', hidden: true };
      if (!label || typeof label.text !== 'string' || !label.text.trim() ||
          ![label.x, label.y, label.fontSize].every(Number.isFinite) || label.fontSize <= 0) continue;
      // 角度の数字は隠さない。端へ寄せて数字同士が重なる場合は、空いている辺へずらす。
      if (label.fixed) {
        const box = labelBox({ ...label, ...placed[index] });
        const width = box.right - box.left, height = box.bottom - box.top;
        // 従来どおり、盤の端では文字を内側に収める。
        const dx = Math.max(0, Math.min(config.width - width, box.left)) - box.left;
        const dy = Math.max(0, Math.min(config.height - height, box.top)) - box.top;
        if (width <= config.width && height <= config.height) {
          placed[index].x += dx; placed[index].y += dy;
        }
        const reserved = labelBox({ ...label, ...placed[index] });
        if (occupied.some(other => overlaps(reserved, other))) {
          const candidates = occupied.flatMap(other => [
            { dx: other.left - reserved.right - 1e-7, dy: 0 }, { dx: other.right - reserved.left + 1e-7, dy: 0 },
            { dx: 0, dy: other.top - reserved.bottom - 1e-7 }, { dx: 0, dy: other.bottom - reserved.top + 1e-7 },
          ]).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
          const shiftedBox = p => labelBox({ ...label, ...placed[index],
            x: placed[index].x + p.dx, y: placed[index].y + p.dy });
          const free = candidates.filter(p => !occupied.some(other => overlaps(shiftedBox(p), other)));
          const shift = free.find(p => withinBoard(shiftedBox(p))) || free[0];
          if (shift) { placed[index].x += shift.dx; placed[index].y += shift.dy; }
        }
        occupied.push(labelBox({ ...label, ...placed[index] }));
        placed[index].hidden = false;
        continue;
      }
      if (label.picture) {
        const box = labelBox(label), b = label.bounds;
        if (fits(box) && (!label.maxRows || label.lines.length <= label.maxRows) &&
          (!b || box.left >= b.x && box.right <= b.x + b.width && box.top >= b.y && box.bottom <= b.y + b.height)) {
          occupied.push(box); placed[index].hidden = false; continue;
        }
      }
      const radius = Math.max(0, ...circles.filter(c => c.x === label.x && c.y === label.y).map(c => c.r));
      const candidates = [1, 2].flatMap(distance => {
        const gap = (label.fontSize * .9 + radius) * distance, middle = label.y + label.fontSize * .4;
        const below = label.y + gap + label.fontSize, above = label.y - gap - label.fontSize * .2;
        const directions = [
          { x: label.x + gap, y: middle, anchor: 'start' },
          { x: label.x - gap, y: middle, anchor: 'end' },
          { x: label.x, y: below, anchor: 'middle' },
          { x: label.x, y: above, anchor: 'middle' },
          { x: label.x + gap, y: below, anchor: 'start' },
          { x: label.x - gap, y: below, anchor: 'end' },
          { x: label.x + gap, y: above, anchor: 'start' },
          { x: label.x - gap, y: above, anchor: 'end' },
        ];
        if (label.prefer === 'below') directions.unshift(...directions.splice(2, 2));
        return directions;
      });
      if (label.alternatives) candidates.unshift(...label.alternatives);
      if (label.preferOwn) candidates.unshift({ x: label.x, y: label.y, anchor: label.anchor || 'start' });
      if (label.picture && label.bounds) {
        const box = labelBox(label), b = label.bounds;
        const dx = Math.max(b.x, Math.min(b.x + b.width - (box.right - box.left), box.left)) - box.left;
        const dy = Math.max(b.y, Math.min(b.y + b.height - (box.bottom - box.top), box.top)) - box.top;
        candidates.unshift({ x: label.x + dx, y: label.y + dy, anchor: label.anchor || 'start' });
      }
      // 音の波形が候補をふさぐときは、盤全体の空いている場所も探す。
      if (label.searchBoard) {
        const extra = [];
        const box = labelBox(label), width = box.right - box.left;
        for (let y = label.fontSize; y <= config.height - label.fontSize * .2; y += 8) {
          for (let x = 0; x <= config.width - width; x += 8) extra.push({ x, y, anchor: 'start' });
        }
        extra.sort((a, b) => Math.hypot(a.x - label.x, a.y - label.y) - Math.hypot(b.x - label.x, b.y - label.y));
        candidates.push(...extra);
      }
      if (label.picture) {
        const own = labelBox(label);
        // 接している文字・輪のすぐ外を候補にし、元の位置から近い順に試す。
        for (const box of [...occupied, ...boxes]) {
          candidates.push(
            { x: label.x + box.left - own.right - 1, y: label.y, anchor: label.anchor },
            { x: label.x + box.right - own.left + 1, y: label.y, anchor: label.anchor },
            { x: label.x, y: label.y + box.top - own.bottom - 1, anchor: label.anchor },
            { x: label.x, y: label.y + box.bottom - own.top + 1, anchor: label.anchor });
        }
        const distance = candidate => {
          const box = labelBox({ ...label, ...candidate });
          return Math.hypot(box.left - own.left, box.top - own.top);
        };
        const sorted = candidates.map(candidate => ({ candidate, distance: distance(candidate) })).sort((a, b) => a.distance - b.distance);
        candidates.splice(0, candidates.length, ...sorted.map(item => item.candidate));
      }
      for (const candidate of candidates) {
        const box = labelBox({ ...label, ...candidate });
        const b = label.bounds;
        if (label.maxRows && label.lines?.length > label.maxRows || !fits(box) ||
          b && (box.left < b.x || box.right > b.x + b.width || box.top < b.y || box.bottom > b.y + b.height)) continue;
        occupied.push(box);
        placed[index] = { id: label.id, x: candidate.x, y: candidate.y, anchor: candidate.anchor, hidden: false };
        break;
      }
    }
    if (labels.every(label => label?.picture) && placed.some(p => p.hidden)) {
      return packPictureLabels(labels, boxes, placed);
    }
    return placed;
  }

  // 他の名前を横切るときだけ、文字の四隅を経由する最短の引き出し線を探す。
  function pictureLeader(from, to, boxes, padding = 2) {
    const blocked = boxes.map(b => ({ left: b.left - padding, right: b.right + padding,
      top: b.top - padding, bottom: b.bottom + padding }));
    const clear = (a, b) => !blocked.some(box => crossesBox({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, box, 0));
    if (clear(from, to)) return [from, to];
    const nodes = [from, to, ...blocked.flatMap(b => [
      { x: b.left - .1, y: b.top - .1 }, { x: b.right + .1, y: b.top - .1 },
      { x: b.left - .1, y: b.bottom + .1 }, { x: b.right + .1, y: b.bottom + .1 },
    ]).filter(p => p.x >= 0 && p.x <= config.width && p.y >= 0 && p.y <= config.height)];
    const distances = nodes.map(() => Infinity), previous = [], visited = new Set(); distances[0] = 0;
    while (visited.size < nodes.length) {
      let next = -1;
      nodes.forEach((_, i) => { if (!visited.has(i) && (next < 0 || distances[i] < distances[next])) next = i; });
      if (!Number.isFinite(distances[next])) break;
      if (next === 1) {
        const route = []; for (let i = 1; i !== undefined; i = previous[i]) route.unshift(nodes[i]);
        return route;
      }
      visited.add(next);
      nodes.forEach((p, i) => {
        const distance = distances[next] + Math.hypot(p.x - nodes[next].x, p.y - nodes[next].y);
        if (!visited.has(i) && distance < distances[i] && clear(nodes[next], p)) {
          distances[i] = distance; previous[i] = next;
        }
      });
    }
    return [];
  }

  function arrowAt(ray, size) {
    if (!ray || !ray.arrow || ray.style === 'dashed' || !Number.isFinite(size?.unitPerPx) || size.unitPerPx <= 0 ||
        ![ray.x1, ray.y1, ray.x2, ray.y2].every(Number.isFinite)) return null;
    const dx = ray.x2 - ray.x1, dy = ray.y2 - ray.y1, distance = Math.hypot(dx, dy);
    if (distance === 0 || distance / size.unitPerPx < 40) return null;
    const small = config.width / size.unitPerPx < 420;
    return { x: ray.x1 + dx * .45, y: ray.y1 + dy * .45,
      dx: dx / distance, dy: dy / distance,
      length: size.unitPerPx * (small ? 14 : 16), width: size.unitPerPx * (small ? 11 : 13) };
  }

  function ease(p) {
    p = typeof p === 'number' && !Number.isNaN(p) ? Math.max(0, Math.min(1, p)) : 0;
    return p * p * (3 - 2 * p);
  }

  function easeOut(p) {
    p = typeof p === 'number' && !Number.isNaN(p) ? Math.max(0, Math.min(1, p)) : 0;
    return 1 - (1 - p) * (1 - p);
  }

  const api = { sizes, forceHandles, angleValue, angleLabel, markBox, labelBox, placeLabels, arrowAt, toBoardPoint, ease, easeOut,
    pictureTextWidth, pictureTextChunks, wrapPictureText, pictureLeader };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { viewMath: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
