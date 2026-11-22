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

  function labelBox(label) {
    const width = Array.from(label.text).length * label.fontSize;
    const left = label.x - (label.anchor === 'end' ? width : label.anchor === 'middle' ? width / 2 : 0);
    return { left, right: left + width, top: label.y - label.fontSize, bottom: label.y + label.fontSize * .2 };
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
    const segments = (Array.isArray(lines) ? lines : []).filter(line => line &&
      [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite) &&
      (line.x1 !== line.x2 || line.y1 !== line.y2));
    const occupied = [], placed = new Array(labels.length);
    const order = labels.map((label, index) => ({ label, index })).sort((a, b) =>
      (a.label?.priority ?? 3) - (b.label?.priority ?? 3) || a.index - b.index);
    function withinBoard(box) {
      return box.left >= 0 && box.right <= config.width && box.top >= 0 && box.bottom <= config.height;
    }
    function fits(box) {
      return withinBoard(box) && !occupied.some(other => overlaps(box, other)) &&
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
      if (label.preferOwn) candidates.unshift({ x: label.x, y: label.y, anchor: label.anchor || 'start' });
      for (const candidate of candidates) {
        const box = labelBox({ ...label, ...candidate });
        if (!fits(box)) continue;
        occupied.push(box);
        placed[index] = { id: label.id, x: candidate.x, y: candidate.y, anchor: candidate.anchor, hidden: false };
        break;
      }
    }
    return placed;
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

  const api = { sizes, angleValue, angleLabel, markBox, labelBox, placeLabels, arrowAt, toBoardPoint, ease, easeOut };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { viewMath: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
