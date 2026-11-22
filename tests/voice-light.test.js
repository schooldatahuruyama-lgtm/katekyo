// 台本の各手に、正の長さと実在する音声ファイルがあることを確かめる。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scripts = require('../content/scripts-light.js');
const data = require('../content/voice-light.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', data.BASE, 'manifest.json'), 'utf8'));

test('音声の一覧に6体の声と6つの盤がある', () => {
  assert.deepEqual(Object.keys(data.VOICES).sort(), scripts.TEACHERS.map(t => t.id).sort());
  assert.equal(Object.keys(data.VOICES).length, 6);
  for (const teacher of scripts.TEACHERS) assert.equal(data.VOICES[teacher.id], teacher.voice);
  assert.deepEqual(Object.keys(data.CLIPS).sort(), Object.keys(scripts.BOARDS).sort());
});

for (const [id, steps] of Object.entries(scripts.BOARDS)) {
  test(`${id}: 全先生・全手の音声ファイルが実在し、長さが0より大きい`, () => {
    assert.deepEqual(Object.keys(data.CLIPS[id]).sort(), scripts.TEACHERS.map(t => t.id).sort());
    const seen = new Set();
    for (const { id: teacher } of scripts.TEACHERS) {
      const clips = data.CLIPS[id][teacher];
      assert.equal(clips.length, steps.length);
      clips.forEach(([file, seconds], index) => {
        const [pathname, query] = file.split('?');
        assert.equal(pathname, `${id}/${teacher}/${String(index + 1).padStart(2, '0')}.mp3`);
        assert.match(query || '', /^h=[0-9a-f]{12}$/);
        const recorded = manifest.clips[id][teacher][index];
        assert.equal(recorded.file, pathname);
        assert.equal(query, 'h=' + recorded.hash);
        assert.ok(Number.isFinite(seconds) && seconds > 0, file);
        assert.ok(!seen.has(file), file); seen.add(file);
        const stat = fs.statSync(path.join(__dirname, '..', data.BASE, pathname));
        assert.ok(stat.isFile() && stat.size > 0, file);
      });
    }
  });
}
