// 反射・屈折・全反射とうすいレンズの計算。角度を丸めずに返す。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const geometry = typeof module === 'object' && module.exports ? require('./geometry.js') : root.Hikari.geometry;
  const DEG = 180 / Math.PI;

  function incidenceDeg(dir, normal) { return geometry.angleToNormalDeg(dir, normal); }
  function reflect(dir, normal) { return geometry.reflect(dir, normal); }

  function refract(incidence, n1, n2) {
    const sine = n1 / n2 * Math.sin(incidence / DEG);
    if (sine >= 1 - config.criticalEpsilon) return { total: true, refractionDeg: null };
    return { total: false, refractionDeg: Math.asin(sine) * DEG };
  }

  function criticalDeg(n1, n2) { return n1 <= n2 ? null : Math.asin(n2 / n1) * DEG; }

  function thinLens(a, f) {
    if (Math.abs(a - f) < config.focalTolerance) {
      return { kind: 'none', b: null, magnification: null, inverted: false };
    }
    const b = a * f / Math.abs(a - f);
    return { kind: a > f ? 'real' : 'virtual', b, magnification: b / a, inverted: a > f };
  }

  const api = { incidenceDeg, reflect, refract, criticalDeg, thinLens };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { optics: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
