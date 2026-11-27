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
    sound: Object.freeze({
      speed: 340, windowSec: .01, cells: 10, cellSec: .001,
      frequency: Object.freeze({ min: 100, max: 1000, step: 50, initial: 250 }),
      amplitude: Object.freeze({ min: 1, max: 4, step: 1, initial: 2 }),
      string: Object.freeze({
        length: Object.freeze({ min: 50, max: 100, step: 5, initial: 80 }),
        pluck: Object.freeze({ min: 1, max: 4, step: 1, initial: 2 }),
        base: 200, weight: Object.freeze({ thin: 1, thick: 4 }), tension: Object.freeze({ weak: 1, strong: 2 }),
        initial: Object.freeze({ thickness: 'thin', tension: 'weak' }),
      }),
      distance: Object.freeze({ min: 170, max: 1700, step: 34, initial: 680 }),
      layout: Object.freeze({
        wave: Object.freeze({ x: 130, width: 440, axisY: 210, cellH: 40, amplitudeCol: 9, forkX: 60 }),
        string: Object.freeze({ x: 80, width: 440, axisY: 290, cellH: 25,
          boxX: 60, boxY: 90, boxWidth: 480, boxHeight: 50, stringY: 90, pluckPx: 12 }),
        speed: Object.freeze({ groundY: 360, fireworkX: 70, fireworkY: 80,
          listenerMinX: 128, listenerMaxX: 560, earY: 300, eyeY: 294, handleY: 330, arrowOffset: 24 }),
      }),
    }),
    force: Object.freeze({
      gramsPerNewton: 100, weightGrams: 20, weightTenths: 2,
      weights: Object.freeze({ min: 0, max: 5, initial: 3 }),
      newtons: Object.freeze({ min: 1, max: 5, initial: 3 }),
      stretchMm: Object.freeze({ A: 10, B: 20 }),
      layout: Object.freeze({
        spring: Object.freeze({ x: 150, y: 50, naturalLength: 100, cmPx: 10,
          halfWidth: 15, turns: 10, weightWidth: 32, weightHeight: 14, forceStep: 13,
          graphX: 370, graphY: 326, graphStepX: 36, graphCmPx: 22 }),
        arrow: Object.freeze({ x: 300, y: 210, cell: 32, boxSize: 64, magnitudeOffset: 40, verticalOffset: 16 }),
        balance: Object.freeze({ x: 300, y: 210, cell: 32, cardSize: 100, offset: 30 }),
      }),
    }),
    picture: Object.freeze({
      compactBelowPx: 420,
      sourceWidth: 640, sourceHeight: 480,
      full: Object.freeze({ x: 20, y: 0, width: 560, height: 420 }),
      triple: Object.freeze({ x: 20, y: 84, width: 176, height: 250 }), tripleStep: 192,
      double: Object.freeze({ x: 20, y: 84, width: 272, height: 250 }), doubleStep: 288,
      single: Object.freeze({ x: 60, y: 60, width: 480, height: 300 }),
      animals: Object.freeze({ x: 10, y: 60, width: 360, height: 270 }),
    }),
    explain: Object.freeze({
      elementMs: 350, lineMs: 800, textCharMs: 90, textMinMs: 300, textFadeMs: 400, arcMs: 600, pointMs: 600,
      penSizePx: 36, penTransferMs: 150, penFadeMs: 200, penMaxDeltaMs: 1000,
      gapMs: 1500, stretchRatio: .8, voiceCharMs: 180, voiceExtraMs: 1000, voiceWaitMs: 4000,
      readCharMs: 150, readMinMs: 2500,
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
