// 音の波、弦の振動、音が届く時間を求める。DOM には依存しない。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const C = config.sound;
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function range(value, min, max) { return number(value) && value >= min && value <= max; }

  // 弦から求めた振動数も使うため、計算では刻みを制限しない。
  function cycles(frequencyHz, windowSec) {
    if (!range(frequencyHz, C.frequency.min, C.frequency.max) || !number(windowSec) || windowSec <= 0) return null;
    const value = frequencyHz * windowSec;
    return Number.isFinite(value) ? value : null;
  }
  function stringFrequency(lengthPercent, thickness, tension) {
    if (!range(lengthPercent, C.string.length.min, C.string.length.max) ||
        !['thin', 'thick'].includes(thickness) || !['weak', 'strong'].includes(tension)) return null;
    return C.string.base * (100 / lengthPercent) * Math.sqrt(C.string.tension[tension]) / Math.sqrt(C.string.weight[thickness]);
  }
  function compare(a, b) {
    if (!number(a) || !number(b)) return null;
    const scale = Math.max(Math.abs(a), Math.abs(b));
    if (a === b || Math.abs(a / scale - b / scale) <= 1e-9) return 'same';
    return a > b ? 'higher' : 'lower';
  }
  function delayTenths(distance) {
    if (!range(distance, C.distance.min, C.distance.max) || distance % C.distance.step !== 0) return null;
    return distance / C.distance.step;
  }
  function wavePoint(frequencyHz, amplitude, tSec) {
    if (!range(frequencyHz, C.frequency.min, C.frequency.max) ||
        !range(amplitude, C.amplitude.min, C.amplitude.max) || !range(tSec, 0, C.windowSec)) return null;
    return amplitude * Math.sin(2 * Math.PI * frequencyHz * tSec);
  }

  const api = { cycles, stringFrequency, compare, delayTenths, wavePoint };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { sound: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
