// URL の board パラメーターを検査する。値を画面には書き出さない。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;

  function parseBoardParam(search, validIds) {
    const result = { boardId: null, error: null };
    if (typeof search !== 'string') return result;
    const values = new URLSearchParams(search).getAll('board');
    if (!values.length) return result;
    if (values.length > 1) result.error = 'duplicate';
    else if (!values[0]) result.error = 'empty';
    else if (values[0].length > config.boardParamMaxLength) result.error = 'too-long';
    else if (!Array.isArray(validIds) || !validIds.includes(values[0])) result.error = 'unknown';
    else result.boardId = values[0];
    return result;
  }

  const api = { parseBoardParam };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { entry: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
