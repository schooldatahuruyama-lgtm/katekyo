// 先生・音声・速さだけを端末に覚える。保存先は外から渡す。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const KEY = 'hikari-board:prefs';

  function defaults(teacherIds, defaultTeacher) {
    return { teacher: teacherIds.includes(defaultTeacher) ? defaultTeacher : teacherIds[0],
      voice: false, rate: config.explain.defaultRate };
  }

  function normalize(value, teacherIds, defaultTeacher) {
    const result = defaults(teacherIds, defaultTeacher);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    if (teacherIds.includes(value.teacher)) result.teacher = value.teacher;
    if (typeof value.voice === 'boolean') result.voice = value.voice;
    if (config.explain.rates.includes(value.rate)) result.rate = value.rate;
    return result;
  }

  function load(storage, teacherIds, defaultTeacher) {
    try { return normalize(JSON.parse(storage.getItem(KEY)), teacherIds, defaultTeacher); }
    catch (_) { return defaults(teacherIds, defaultTeacher); }
  }

  function save(storage, prefs) {
    try {
      const { teacher, voice, rate } = prefs;
      storage.setItem(KEY, JSON.stringify({ teacher, voice, rate }));
      return true;
    } catch (_) { return false; }
  }

  const api = { KEY, defaults, normalize, load, save };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { prefs: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
