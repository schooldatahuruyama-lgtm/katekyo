// 音声の準備・再生・終了待ち。Audio、通信、タイマー、URL の解放は外から渡す。
(function (root) {
  'use strict';

  const config = typeof module === 'object' && module.exports ? require('./config.js') : root.Hikari.config;
  const explain = typeof module === 'object' && module.exports ? require('./explain.js') : root.Hikari.explain;
  const RATES = config.explain.rates;
  function validRate(rate) { return RATES.includes(rate) ? rate : config.explain.defaultRate; }
  function stepRate(rate, direction) {
    const index = RATES.indexOf(rate);
    if (index < 0) return config.explain.defaultRate;
    return RATES[Math.max(0, Math.min(RATES.length - 1, index + (direction === -1 ? -1 : direction === 1 ? 1 : 0)))];
  }

  function createPlayer({ createAudio, fetchClip, setTimer, clearTimer, onProblem = () => {},
    revoke = () => {}, now = () => Date.now() }) {
    const audio = createAudio(), owned = new Set();
    let clips = [], generation = 0, active = null, rate = config.explain.defaultRate;
    audio.preservesPitch = true;

    function cancelTimer(session) {
      session.timerVersion++;
      if (session.timer !== null) clearTimer(session.timer);
      session.timer = null;
    }

    function detach() { audio.onended = null; audio.onerror = null; }

    function stop() {
      const previous = active;
      active = null;
      if (previous) cancelTimer(previous);
      detach();
      audio.pause();
    }

    function finish(session, problem) {
      if (active !== session) return;
      active = null;
      cancelTimer(session);
      detach();
      audio.pause();
      try { if (problem) onProblem(problem); }
      finally { if (typeof session.onEnd === 'function') session.onEnd(); }
    }

    function ended(session, problem) {
      if (active !== session) return;
      if (session.paused) { session.pendingEnd = { problem }; return; }
      finish(session, problem);
    }

    // 一時停止の間は数えず、速さを変える前までの経過だけを元の速さで差し引く。
    function account(session) {
      const time = now(), elapsed = Math.max(0, time - session.lastAt);
      const voiceMs = session.remaining / rate;
      session.remaining = Math.max(0, session.remaining - elapsed * rate);
      session.grace = Math.max(0, session.grace - Math.max(0, elapsed - voiceMs));
      session.lastAt = time;
    }

    function schedule(session) {
      cancelTimer(session);
      const version = session.timerVersion;
      session.lastAt = now();
      session.timer = setTimer(() => {
        if (active === session && !session.paused && session.timerVersion === version) finish(session);
      }, session.remaining / rate + session.grace);
    }

    function attemptPlay(session) {
      const attempt = ++session.attempt;
      function blocked() {
        if (active === session && session.attempt === attempt) ended(session, 'blocked');
      }
      try {
        const promise = audio.play();
        if (promise && typeof promise.then === 'function') promise.then(undefined, blocked);
      } catch (_) { blocked(); }
    }

    function setRate(value) {
      if (active && !active.paused) account(active);
      rate = validRate(value);
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      if (active && !active.paused) schedule(active);
    }

    function play(index, seconds, value, onEnd) {
      stop();
      setRate(value);
      // 呼ぶ側が文字数で補った秒数を使う。直接の不正な入力にも最低限の読み時間を置く。
      const session = { onEnd, remaining: explain.clipSeconds(seconds, 0) * 1000,
        grace: config.explain.voiceWaitMs, timer: null, timerVersion: 0, attempt: 0,
        lastAt: now(), paused: false, pendingEnd: null };
      active = session;
      if (!Number.isInteger(index) || !clips[index]) { finish(session, 'load'); return; }
      audio.onended = () => ended(session);
      audio.onerror = () => ended(session, 'load');
      audio.src = clips[index];
      // src の切り替えで速さを戻す端末でも、指定した速さで再生を始める。
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      schedule(session);
      attemptPlay(session);
    }

    function pause() {
      if (!active || active.paused) return;
      account(active);
      active.paused = true;
      active.attempt++;
      cancelTimer(active);
      audio.pause();
    }

    function resume() {
      if (!active || !active.paused) return;
      const session = active;
      session.paused = false;
      if (session.pendingEnd) { finish(session, session.pendingEnd.problem); return; }
      schedule(session);
      attemptPlay(session);
    }

    function release() {
      stop();
      generation++;
      clips = [];
      audio.src = '';
      for (const url of owned) revoke(url);
      owned.clear();
    }

    async function prepare(urls) {
      release();
      const mine = generation, loaded = new Array(urls.length).fill(null);
      clips = loaded;
      const results = await Promise.all(urls.map(async (url, index) => {
        try {
          const clip = await fetchClip(url);
          if (typeof clip !== 'string' || !clip) return false;
          if (mine !== generation) { revoke(clip); return false; }
          owned.add(clip);
          loaded[index] = clip;
          return true;
        } catch (_) { return false; }
      }));
      const failed = mine === generation ? results.filter(ok => !ok).length : urls.length;
      return { ok: failed === 0, failed };
    }

    return { prepare, play, setRate, pause, resume, stop, release };
  }

  const api = { RATES, stepRate, createPlayer };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { voice: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
