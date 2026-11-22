// 6 つの盤と先生の台本の用語・長さ・描画指定を確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const scripts = require('../content/scripts-light.js');
const boards = require('../js/boards.js');
const explain = require('../js/explain.js');
const config = require('../js/config.js');

test('6つの盤と6体の先生がそろい、基本の台本はE', () => {
  assert.deepEqual(Object.keys(scripts.BOARDS), boards.list().map(b => b.id));
  assert.deepEqual(scripts.TEACHERS.map(t => t.id), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(scripts.DEFAULT_TEACHER, 'E');
});

for (const [id, steps] of Object.entries(scripts.BOARDS)) {
  test(`${id}: 全手に6体の文があり、同じ用語が同じ数で75文字以内`, () => {
    assert.ok(steps.length > 0);
    steps.forEach((step, index) => {
      assert.deepEqual(Object.keys(step.lines).sort(), ['A', 'B', 'C', 'D', 'E', 'F']);
      const terms = text => (text.match(/「[^」]+」/g) || []).sort();
      for (const [teacher, text] of Object.entries(step.lines)) {
        assert.equal(typeof text, 'string');
        assert.ok(text.length > 0 && Array.from(text).length <= config.explain.maxTextLength, `${id} ${index} ${teacher}`);
        assert.deepEqual(terms(text), terms(step.lines.E), `${id} ${index} ${teacher}`);
      }
      assert.ok(step.draw.length > 0);
      for (const token of step.draw) assert.ok(explain.parseDraw(token), token);
    });
  });
}
