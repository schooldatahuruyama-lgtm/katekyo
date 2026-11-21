# ひかりボード（仮称）段階 1 実装計画

> **For agentic workers:** この計画は、このフォルダの `CLAUDE.md` の流れで進める（Claude Code が指示書を `.ai-tasks/` に書き、Codex が実装し、Codex がレビューする）。タスクごとに指示書 1 つ。

**Goal:** 光の 6 種類の盤を指で動かせる Web アプリ（AI なし・保存なし・オフライン対応）を作る。

**Architecture:** 盤は「部品の配置データ（シーン）」で持つ。画面に依存しない計算エンジン（`optics.js`・`scene.js`）がシーンから光線・角度・像・測った値を求め、`board-view.js` はそれを SVG に描くだけにする。盤ごとのはじめの配置・案内の文・「ためしてみよう」は `boards.js` のデータ。

**Tech Stack:** HTML・CSS・JavaScript だけ（外部ライブラリなし）。テストは `node --test`。Service Worker。GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-11-21-ai-tutor-stage1-design.md`（見た目は `docs/mockups/stage1-mockup-rika.html`）

## Global Constraints

- 外部ライブラリ・外部フォント・ネットワークからのパッケージ追加なし。外部への送信なし。
- モジュールの形は `js/geometry.js` と同じ: IIFE、`'use strict'`、Node では `module.exports = api`、ブラウザでは `root.Hikari = Object.assign(root.Hikari || {}, { <名前>: api })`。ほかのモジュールは、Node では `require('./x.js')`、ブラウザでは `root.Hikari.x` から取る。
- コメントは日本語で、ファイルの先頭に役割を 1〜2 行。
- 盤の座標は幅 600・高さ 420 の単位（SVG の `viewBox="0 0 600 420"`）。x は右、y は下に増える。
- 暫定の数値はすべて `js/config.js` に置く: 屈折率（空気 1.00、水 1.33、ガラス 1.50）、臨界角の誤差 1e-9、焦点の上とみなす距離 1（単位）、「ためしてみよう」の許容（角度 ±2°、位置 ±6）、文字の最小（説明 16px、角度 19px）、つかむ範囲の最小半径 24px、つまみの最小半径 13px、1 列にする幅 900px、名前を盤の中に出さない幅 360px、`?board=` の長さの上限 40 文字。
- 色（設計書 6.1）: 光線 `#B45C00`、青のペン `#176AA3`、赤のペン `#B23A36`、法線 `#67748B`、緑 `#216E43`、紙 `#FAF7EE`、枠の青 `#1A5CFF`、背景 `#EEF3FF`、文字 `#1B2430`、補助の文字 `#5B6676`。
- 端末への保存はしない（localStorage・IndexedDB を使わない。Service Worker のキャッシュだけ）。
- 画面の文は、中学生向けのやさしい日本語。AI が使えるように見える表示をしない。

## Review Focus

1. 部品を重ねる・端まで引く・すばやく往復する: 光線が NaN や無限大にならず、盤が消えない（`trace` は有限の数だけを返す）。
2. 屈折の向きや物質を切り替えた直後: 光源が正しい側に移り、前の側の値が残らない。
3. 物体をレンズの焦点・レンズの位置の近くへ動かす: 像の種類（実像・像なし・虚像）が飛ばずに切り替わり、文が出る。
4. 盤の表示幅が 264px〜1100px のどこでも: 文字 16px 以上、つかむ範囲が半径 24px 以上、文字どうしが重ならない。
5. `?board=` に想定外の値（空、長い文字、記号、2 つ以上）: 盤を開かずホームに知らせを出す。スクリプトとして実行されない。

---

### Task 1: 計算エンジンと盤のデータ（画面なし）

**Files:**
- Create: `js/config.js`, `js/optics.js`, `js/scene.js`, `js/boards.js`, `js/entry.js`
- Test: `tests/optics.test.js`, `tests/scene.test.js`, `tests/boards.test.js`, `tests/entry.test.js`
- 変更しない: `js/geometry.js`（使うだけ）

**Interfaces（Task 2 が使う）:**

`optics`
- `incidenceDeg(dir, normal) → number`（0〜90）
- `reflect(dir, normal) → {x, y}`
- `refract(incidenceDeg, n1, n2) → { total: boolean, refractionDeg: number|null }`（sin θ₂ ≥ 1 − 1e-9 なら `total: true`、`refractionDeg: null`）
- `criticalDeg(n1, n2) → number|null`（n1 ≤ n2 なら null）
- `thinLens(a, f) → { kind: 'real'|'virtual'|'none', b: number|null, magnification: number|null, inverted: boolean }`（`|a − f| < 1` は `none`。`a > f` は `real`、`b = a·f/(a−f)`、`inverted: true`。`a < f` は `virtual`、`b = a·f/(f−a)`（物体と同じ側の距離）、`inverted: false`。倍率は `b/a`）

`scene`
- `KINDS = ['straight','reflect','mirror-image','refract','lens','lens-image']`
- `validateScene(scene) → string[]`（直す所の一覧。空なら合格。自動で直さない）
- `trace(scene) → { rays, angles, images, marks, notes, measures }`
  - `rays: [{ x1, y1, x2, y2, style: 'solid'|'dashed', arrow: boolean }]`
  - `angles: [{ key: 'in'|'out', name: string, valueDeg: number, vertex: {x,y}, fromDeg: number, toDeg: number }]`（`in` は入射角、`out` は反射角または屈折角。`name` は「入射角」「反射角」「屈折角」）
  - `images: [{ kind: 'real'|'virtual'|'mirror', x, y, height: number|null, offBoard: boolean }]`
  - `marks: [{ key: string, x, y, text: string }]`（盤の中の固定の文字: 法線・鏡・空気・水・焦点など）
  - `notes: string[]`（盤に出す文: 「全反射」「像はできません（レンズを出た光が平行になります）」「虚像（スクリーンには映りません）」「像はこの先にできます」など）
  - `measures`: 盤ごとの測った値（下の表）。数値はすべて有限。
- `handles(scene) → [{ elementId, handle, x, y, label }]`（つかめる所。`label` は「光源」「かたむける」など）
- `moveElement(scene, elementId, handle, point) → scene`（新しいシーンを返す。元は変えない。動かせる範囲の端で止める。知らない id や handle なら元と同じ内容を返す）
- `setOption(scene, key, value) → scene`（屈折の盤の `direction: 'air-to-medium'|'medium-to-air'` と `medium: 'water'|'glass'`。知らない key・value なら元と同じ内容を返す。向きを変えたら光源を正しい側の同じ入射角の位置へ移す）

`measures` のキー:

| 盤 | キー |
|---|---|
| straight | `shadowTop`, `shadowBottom`（スクリーン上の影の y）, `shadowSize` |
| reflect | `incidenceDeg`, `reflectionDeg`, `mirrorTiltDeg` |
| mirror-image | `objectDistance`, `imageDistance`（鏡からの距離。必ず等しい） |
| refract | `incidenceDeg`, `refractionDeg`（全反射のときは null）, `totalReflection`（boolean）, `criticalDeg`（なければ null）, `direction`, `medium` |
| lens | `focalLength`, `beamOffset`（光軸からの高さ） |
| lens-image | `objectDistance`, `imageDistance`（なければ null）, `magnification`（なければ null）, `imageKind`（'real'/'virtual'/'none'）, `inverted`, `screenSharp`（実像で、スクリーンが像の位置から ±6 以内） |

`boards`
- `list() → [{ id, title, question }]`（6 件。id は `KINDS` と同じ順）
- `get(id) → { id, title, heading, question, intro, scene, prompts, controls } | null`（毎回、深い写しを返す）
  - `prompts: [{ id, text, when: { measure, op: 'near'|'gte'|'lte'|'is', value, tol? } }]`（盤ごとに 2〜3 個）
  - `controls: [{ key, choices: [{ value, label }] }]`（屈折の盤だけ 2 つ。ほかは空）
- `checkPrompt(prompt, measures) → boolean`（`near` は `|測った値 − value| ≤ tol`。測った値が null・数でない場合は false）
- `readout(id, measures) → [{ text, tone: 'in'|'out'|'plain' }]`（盤の下の行に出す今の値。例: `入射角 40°`（in）、`反射角 40°`（out）。角度は整数に四捨五入）

`entry`
- `parseBoardParam(search, validIds) → { boardId: string|null, error: null|'unknown'|'empty'|'too-long'|'duplicate' }`（`board` がなければ両方 null）

**テスト（設計書 9 章。数値はこのとおり）:**

- `optics`: 反射で入射角 = 反射角（10°・45°・80°）。`refract(30, 1.00, 1.33)` の屈折角が 22.1 ± 0.05。`criticalDeg(1.33, 1.00)` が 48.8 ± 0.05、`criticalDeg(1.50, 1.00)` が 41.8 ± 0.05、`criticalDeg(1.00, 1.33)` が null。`refract(0, …)` は 0。臨界角ちょうどは `total: true`、臨界角 − 0.01 は `total: false`。`thinLens(200, 100)` は real・b 200・倍率 1・倒立。`thinLens(150, 100)` は b 300・倍率 2。`thinLens(100, 100)` と `thinLens(100.5, 100)` は none。`thinLens(50, 100)` は virtual・b 100・倍率 2・正立。
- `scene`: 6 種類それぞれについて、不正なシーン（`kind` が知らない値、`elements` が配列でない・空、部品の id の重複、知らない `type`、座標が文字列の数字 `'120'`・NaN・Infinity・盤の外（x < 0、x > 600、y < 0、y > 420）、必要な部品がない）を `validateScene` が拒む。`moveElement` で盤の外の点（−1000, −1000）と（5000, 5000）を渡しても範囲の端で止まり、`validateScene` に合格し、`trace` の数値がすべて有限。光源を鏡・境界の反対側へ引いても元の側に残る。元のシーンが変わらない。反射の盤で入射角 0° のとき、反射光が来た道を戻る。屈折の盤で入射角 0° のとき屈折角 0°。水→空気で入射角 60° なら `totalReflection: true`・`refractionDeg: null`・`notes` に「全反射」。`setOption` で向きを変えると光源の側が変わり、入射角（整数）は保たれる。`lens-image` で物体を焦点の上・内側・外側に置いたときの `imageKind` と `notes`。像が盤の外のとき `offBoard: true` と「像はこの先にできます」。
- `boards`: 6 種類がそろい、id が `KINDS` と同じ順。はじめのシーンがすべて `validateScene` に合格。各盤の prompts が 2〜3 個で、id が重ならず、`when.measure` がその盤の `measures` にある。**どの prompt にも、`moveElement`・`setOption` だけで行ける「条件を満たす配置」が実際にある**（テストの中でその配置を作って確かめる）。はじめの配置では、どの prompt もまだ満たしていない。`checkPrompt` の境界（±2° ちょうどは true、±2.01° は false、測った値が null は false）。`get` が返す物を書きかえても、次の `get` に影響しない。`get('nope')` は null。
- `entry`: `'?board=reflect'` → reflect。`''` と `'?x=1'` → 両方 null。`'?board='` → empty。`'?board=nope'` と `'?board=<script>'` → unknown。41 文字 → too-long。`'?board=reflect&board=lens'` → duplicate。

- [ ] Step 1: テストを書く（上のとおり）
- [ ] Step 2: `npm test` が失敗することを見る
- [ ] Step 3: 実装する
- [ ] Step 4: `npm test` がすべて成功する
- [ ] Step 5: Claude Code が確認してコミット

### Task 2: 画面（盤を描く・動かす、ホーム、オフライン）

**Files:**
- Create: `index.html`, `css/app.css`, `js/view-math.js`, `js/board-view.js`, `js/app.js`, `sw.js`, `manifest.webmanifest`, `README.md`, `docs/reports/boards.md`
- Test: `tests/view-math.test.js`, `tests/offline.test.js`
- 変更しない: Task 1 のファイル（直す所があれば報告に書く）

**Interfaces:**
- Consumes: Task 1 の `scene`・`boards`・`entry`・`config`
- Produces（`view-math`、画面なしでテストできる計算）:
  - `sizes(boardWidthPx) → { unitPerPx, textSize, angleSize, hitRadius, knobRadius, showAngleNames }`（単位は盤の座標。`textSize ≥ 16·unitPerPx` かつ 16 以上、`angleSize ≥ 19·unitPerPx` かつ 21 以上、`hitRadius ≥ 24·unitPerPx` かつ 30 以上、`knobRadius ≥ 13·unitPerPx` かつ 14 以上、`showAngleNames` は幅 360px 以上で true。幅が 0・負・数でないときは幅 600 として扱う）
  - `angleLabel(angle, sizes) → { x, y, anchor: 'start'|'middle'|'end' }`（角が 45° 以上は角の中、未満は光線の外側。`in` と `out` の文字が 0° でも重ならない）
  - `toBoardPoint(clientX, clientY, rect) → { x, y }`（画面の座標を盤の座標へ。`rect.width` が 0 なら null）

**画面の決まり:** 設計書 6 章と 7 章、モックアップ第 3 案に合わせる。
- ホーム: 見出し、6 種類の盤の一覧（`boards.list()`）、通信と AI の状態。`?board=` の error があれば、上に「指定された盤が見つかりませんでした」。
- 盤の画面: 上の帯（← ボード一覧、盤の名前、状態）、盤（SVG）、盤の下の行（`boards.readout` と操作の説明）、パネル（キューブ先生と `intro`、「ためしてみよう」、切り替え、「先生への質問は準備中です（今は使えません）」、「はじめの配置にもどす」）。
- 盤は `scene.trace` の結果だけから描く。動かすのは `scene.moveElement`。1 本目の指だけを追う（`pointerId` で見分ける）。
- 画面の行き来は `history.pushState` と `popstate`（戻るボタンでホームへ戻れる）。`?board=` の値は、文字として画面に出さない。
- 「できた ✓」は一度付いたら消さない。「はじめの配置にもどす」でも残す。開き直すと消える。
- Service Worker は `http(s)` で開いたときだけ登録する。`sw.js` の形は理科クエストと同じ（`VERSION`・`CACHE_PREFIX = 'hikari-board-'`・`PRECACHE`、キャッシュ優先、古い版を消す）。
- `README.md`: 開き方、6 種類の盤、オフライン、更新のとき `VERSION` を上げること、段階 1 でやらないこと。`docs/reports/boards.md`: 先生が確かめるための、盤ごとの案内の文と「ためしてみよう」の一覧。

**テスト:**
- `view-math`: 幅 264・319・375・612・1100 で、`textSize / unitPerPx ≥ 16`、`angleSize / unitPerPx ≥ 19`、`hitRadius / unitPerPx ≥ 24`、`knobRadius / unitPerPx ≥ 13`。幅 359 は `showAngleNames: false`、360 は true。幅 0・−5・NaN・`'300'` は幅 600 と同じ結果。`angleLabel` で 0°・1°・44°・45°・80° のとき、`in` の文字の右端と `out` の文字の左端が 8px 以上離れる（文字幅は全角 3 文字 × `textSize` で見積もる）。`toBoardPoint` の変換と、幅 0 のとき null。
- `offline`: `index.html` が読むファイルがすべて同じ順で `PRECACHE` にある。`./` と `index.html` を含み、重複がなく、全部実在する。`VERSION` の形。`manifest.webmanifest`（`name`、`start_url: './'`、`display: 'standalone'`、`lang: 'ja'`、`theme_color: '#1A5CFF'`、`background_color: '#EEF3FF'`）。`index.html` に外部の URL（`http://`・`https://` で始まる `src`・`href`）がない。

- [ ] Step 1: テストを書く
- [ ] Step 2: `npm test` が失敗することを見る
- [ ] Step 3: 実装する
- [ ] Step 4: `npm test` がすべて成功する
- [ ] Step 5: Claude Code がブラウザで 6 種類の盤を動かして確かめる（パソコンの幅・768px・375px、オフライン）
- [ ] Step 6: Codex レビュー → コミット

### Task 3: 公開（ユーザーがリポジトリを用意してから）

- [ ] `git remote add origin <URL>`、`git push -u origin master`
- [ ] `tools/pages-branch.ps1` → `git push origin pages`
- [ ] 公開版で 6 種類の盤を動かし、通信を切っても開けることを確かめる
