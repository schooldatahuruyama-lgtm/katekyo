// 台本（content/scripts-<単元>.js）から、先生の声の音声ファイルを作る（開発のパソコンで使う道具）
// 使い方: node tools/make-voice.mjs [--set light|sound] [--ffmpeg <ffmpeg.exe のパス>] [--base http://127.0.0.1:50121] [--force]
// 前もって、VOICEVOX Nemo のエンジンをこのパソコンで動かしておく（run.exe --host 127.0.0.1 --port 50121）。
// できるもの: assets/audio/<単元>/<盤>/<先生>/<手の番号>.mp3 と assets/audio/<単元>/manifest.json、content/voice-<単元>.js
// 文・声・速さが前と同じ音声は作り直さない（--force で全部作り直す）。
// 利用の条件: 音声は VOICEVOX Nemo で作る。クレジットの表記が必要（assets/audio/README.md）。
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const BASE = opt('--base', 'http://127.0.0.1:50121'), FFMPEG = opt('--ffmpeg', 'ffmpeg'), FORCE = args.includes('--force');

// 声の割り当て（VOICEVOX Nemo の話者の名前）と、速さをそろえる倍率（同じ文を読む時間が同じになる値。docs/characters-and-scripts.md 4.2）
const VOICES = {
  A: { speaker: '女声4', speed: 1.15 }, B: { speaker: '女声2', speed: 1.23 }, C: { speaker: '女声3', speed: 1.00 },
  D: { speaker: '男声2', speed: 1.03 }, E: { speaker: '男声3', speed: 0.99 }, F: { speaker: '男声1', speed: 0.79 },
};
const SET = opt('--set', 'light');
if (!/^[a-z]+$/.test(SET) || !fs.existsSync(path.join(root, 'content', 'scripts-' + SET + '.js'))) throw new Error('単元の台本がありません: ' + SET);
const scripts = createRequire(import.meta.url)(path.join(root, 'content', 'scripts-' + SET + '.js'));
// アプリの中での名前。光は voiceData、ほかは voiceData + 単元の名前（例: voiceDataSound）
const GLOBAL = SET === 'light' ? 'voiceData' : 'voiceData' + SET[0].toUpperCase() + SET.slice(1);
const outRoot = path.join(root, 'assets', 'audio', SET), manifestPath = path.join(outRoot, 'manifest.json');

const speakers = await (await fetch(BASE + '/speakers')).json();
const styleId = (name) => { const s = speakers.find((x) => x.name === name); if (!s) throw new Error('話者がありません: ' + name); return s.styles[0].id; };
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { clips: {} };
const manifest = { set: SET, engine: 'VOICEVOX Nemo', voices: {}, clips: {} };
for (const t of scripts.TEACHERS) manifest.voices[t.id] = VOICES[t.id].speaker;

const plain = (kana) => kana.replace(/['/_、？?]/g, '');
const problems = []; let made = 0, kept = 0, bytes = 0;
for (const [board, steps] of Object.entries(scripts.BOARDS)) {
  manifest.clips[board] = {};
  for (const t of scripts.TEACHERS) {
    const v = VOICES[t.id], id = styleId(v.speaker), list = [];
    for (let i = 0; i < steps.length; i++) {
      const text = steps[i].lines[t.id], read = scripts.speechText(text);
      const hash = crypto.createHash('sha1').update([read, v.speaker, v.speed].join('|')).digest('hex').slice(0, 12);
      const rel = [board, t.id, String(i + 1).padStart(2, '0') + '.mp3'].join('/'), file = path.join(outRoot, rel);
      const before = old.clips && old.clips[board] && old.clips[board][t.id] && old.clips[board][t.id][i];
      if (!FORCE && before && before.hash === hash && fs.existsSync(file)) { list.push(before); kept++; bytes += fs.statSync(file).size; continue; }
      const q = await (await fetch(BASE + '/audio_query?speaker=' + id + '&text=' + encodeURIComponent(read), { method: 'POST' })).json();
      // 読みまちがいの点検: 文にある用語の読みがなが、合成の読みがなに入っているか
      const kana = plain(q.kana);
      for (const [term, want] of Object.entries(scripts.EXPECT)) if (text.includes(term) && !kana.includes(want)) problems.push(board + ' ' + t.id + (i + 1) + ' 「' + term + '」 ' + q.kana);
      q.speedScale = v.speed; q.prePhonemeLength = 0.1; q.postPhonemeLength = 0.25;
      const wav = Buffer.from(await (await fetch(BASE + '/synthesis?speaker=' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) })).arrayBuffer());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const wavPath = file.replace(/\.mp3$/, '.wav'); fs.writeFileSync(wavPath, wav);
      execFileSync(FFMPEG, ['-nostdin', '-y', '-loglevel', 'error', '-i', wavPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', '24000', '-b:a', '64k', file]);
      fs.unlinkSync(wavPath);
      list.push({ file: rel, sec: Math.round((wav.length - 44) / 480) / 100, hash, kana: q.kana }); made++; bytes += fs.statSync(file).size;
    }
    manifest.clips[board][t.id] = list;
  }
}
fs.mkdirSync(outRoot, { recursive: true }); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
// アプリが読む音声の一覧（content/voice-<単元>.js）。盤 → 先生 → 手ごとの [ファイルの場所, 長さ（秒）]
const table = {};
for (const [board, byTeacher] of Object.entries(manifest.clips)) { table[board] = {}; for (const [t, list] of Object.entries(byTeacher)) table[board][t] = list.map((c) => [c.file + '?h=' + c.hash, c.sec]); }   // ?h= は文・声・速さから作った印。作り直した音声だけ、端末に保存した古い音声と別のものとして読みこまれる
const js = "// 先生の声の音声の一覧（tools/make-voice.mjs が作る。手で書きかえない）\n// 盤 → 先生 → 手ごとの [ファイルの場所（BASE からの相対）, 長さ（秒）]。音声: VOICEVOX Nemo\n(function (root) {\n  'use strict';\n" +
  "  const api = {\n    BASE: 'assets/audio/" + SET + "/',\n    CREDIT: '音声: VOICEVOX Nemo（" + [...new Set(Object.values(manifest.voices))].sort().join('・') + "）',\n    VOICES: " + JSON.stringify(manifest.voices) + ",\n    CLIPS: " + JSON.stringify(table) + ",\n  };\n" +
  "  if (typeof module === 'object' && module.exports) module.exports = api;\n  else root.Hikari = Object.assign(root.Hikari || {}, { " + GLOBAL + ": api });\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n";
fs.writeFileSync(path.join(root, 'content', 'voice-' + SET + '.js'), js);
console.log('作った: ' + made + ' / そのまま: ' + kept + ' / 合計 ' + Math.round(bytes / 1024) + ' KB');
console.log(problems.length ? '読みを確かめる所（' + problems.length + ' 件）:\n' + problems.join('\n') : '読みの点検: 用語はすべて想定どおり');
