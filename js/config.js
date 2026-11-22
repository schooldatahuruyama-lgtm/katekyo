// 盤の座標、暫定の数値、画面で共通に使う色。
(function (root) {
  'use strict';

  const api = {
    width: 600,
    height: 420,
    refractiveIndex: Object.freeze({ air: 1.00, water: 1.33, glass: 1.50 }),
    criticalEpsilon: 1e-9,
    focalTolerance: 1,
    lensHalfHeight: 150,
    angleTolerance: 2,
    positionTolerance: 6,
    minTextPx: 16,
    minAnglePx: 19,
    minHitRadiusPx: 24,
    minKnobRadiusPx: 13,
    singleColumnWidthPx: 900,
    angleNamesWidthPx: 360,
    boardParamMaxLength: 40,
    explain: Object.freeze({
      elementMs: 350, lineMs: 800, textCharMs: 90, textMinMs: 300, arcMs: 600, pointMs: 600,
      gapMs: 1500, stretchRatio: .8, voiceCharMs: 180, voiceExtraMs: 1000, voiceWaitMs: 4000,
      rates: Object.freeze([.5, .75, 1, 1.25, 1.5, 1.75, 2]), defaultRate: 1, maxTextLength: 75,
    }),
    motion: Object.freeze({
      margin: 20, gap: 20, minFocalLength: 60, maxFocalLength: 160,
      maxMirrorTiltDeg: 40, minLength: 40, minObjectHeight: 10, maxObjectHeight: 100,
      minBeamOffset: 20, maxBeamOffset: 100, eyeSpread: 12,
    }),
    colors: Object.freeze({
      ray: '#B45C00', bluePen: '#176AA3', redPen: '#B23A36', normal: '#67748B',
      green: '#216E43', paper: '#FAF7EE', blue: '#1A5CFF', background: '#EEF3FF',
      text: '#1B2430', mutedText: '#5B6676',
    }),
  };
  Object.freeze(api);

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hikari = Object.assign(root.Hikari || {}, { config: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
