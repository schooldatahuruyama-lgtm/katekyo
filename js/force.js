// ばねののび、力のつり合い、整数からの表示を求める。DOM には依存しない。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const C = config.force;
  function integer(value, range) { return Number.isInteger(value) && value >= range.min && value <= range.max; }
  function forceTenths(weights) {
    return integer(weights, C.weights) ? weights * C.weightTenths : null;
  }
  function stretchMm(weights, spring) {
    return integer(weights, C.weights) && ['A', 'B'].includes(spring) ? weights * C.stretchMm[spring] : null;
  }
  function balanceState(left, right, line) {
    if (!integer(left, C.newtons) || !integer(right, C.newtons) || !['same', 'offset'].includes(line)) return null;
    return line === 'offset' ? 'turns' : left === right ? 'balanced' : right > left ? 'moves-right' : 'moves-left';
  }
  function tenthsText(n) {
    if (!Number.isSafeInteger(n) || n < 0) return null;
    return n === 0 ? '0' : Math.floor(n / 10) + '.' + n % 10;
  }

  const api = { forceTenths, stretchMm, balanceState, tenthsText };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { force: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
