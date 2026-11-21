# 実装指示書: 計算エンジンと盤のデータ（段階 1・Task 1）

## 目的

要件定義書（`docs/requirements.md`）4 章「ホワイトボード」（光の直進・反射・屈折・全反射・凸レンズ・実像と虚像、生徒が光源・鏡・レンズを操作できる、科学的ルールに従った図）の土台を作る。
設計書 `docs/superpowers/specs/2026-11-21-ai-tutor-stage1-design.md` の 6.3・6.4・6.6・7 章・8 章・9 章にあたる。

**先に読むもの**: 設計書（上）と、実装計画 `docs/superpowers/plans/2026-11-21-hikari-board-stage1.md` の「Global Constraints」と「Task 1」。関数名・引数・戻り値・`measures` のキー・テストの数値は、実装計画の Task 1 に書いたとおりにする。

## 作成するファイル

| ファイル | 中身 |
|---|---|
| `js/config.js` | 暫定の数値（実装計画の Global Constraints の一覧） |
| `js/optics.js` | `incidenceDeg`・`reflect`・`refract`・`criticalDeg`・`thinLens` |
| `js/scene.js` | `KINDS`・`validateScene`・`trace`・`handles`・`moveElement`・`setOption` |
| `js/boards.js` | 6 種類の盤（はじめのシーン、名前、問いかけ、先生の案内の文、「ためしてみよう」、切り替え）と `list`・`get`・`checkPrompt`・`readout` |
| `js/entry.js` | `parseBoardParam` |
| `tests/optics.test.js`・`tests/scene.test.js`・`tests/boards.test.js`・`tests/entry.test.js` | 実装計画 Task 1 の「テスト」 |

この指示書では画面（HTML・CSS・SVG に描くコード）は作らない。

## 中身の決まり

- 6 種類の盤で「動かせるもの」「表示されるもの」は設計書 6.3 の表のとおり。部品（`elements`）の細かい項目は任せるが、数値と短い文字列だけの単純な形にする（あとで AI が JSON として出すため）。
- `trace` が返す光線は、法則から計算したものだけにする。
  - 反射: 入射角 = 反射角。
  - 屈折: n₁ sin θ₁ = n₂ sin θ₂。水・ガラスから空気へ出るときは、臨界角以上で全反射（屈折光なし、反射光だけ）。空気→水・ガラスでは、屈折光と一緒に弱い反射光を出すかどうかは任せる（出すなら `rays` に入れてよいが、`angles` の `out` は屈折角にする）。
  - 凸レンズ: うすいレンズの式。光線はレンズの中心の面で 1 回だけ曲げる。実像と虚像の盤は代表の 3 本（光軸に平行 → 焦点を通る、中心を通って直進、手前の焦点を通る → 光軸に平行）。虚像のときは、レンズを出た光の延長を破線（`style: 'dashed'`）で物体の側へのばし、像の位置で交わらせる。
  - 鏡の像: 物体から鏡で反射して目に届く光線（実線）と、鏡の奥の像へ向かう延長（破線）。像は鏡について物体と対称の位置。
  - 直進: 光源からついたての両端を通ってスクリーンへ届く光線と、影の範囲。
- 角度の `valueDeg` は丸めない（丸めるのは表示の `readout` だけ。整数に四捨五入）。
- `boards` の文（名前、問いかけ、案内、「ためしてみよう」）は、中学生向けのやさしい日本語で自作する。教科書の文を写さない。盤の名前と問いかけは次のとおり。

| id | 名前 | 問いかけ |
|---|---|---|
| straight | 直進 | 光はどう進む？ 影はなぜできる？ |
| reflect | 反射 | 鏡ではね返る光のきまりは？ |
| mirror-image | 鏡の像 | 鏡の奥に見えるものは、どこにある？ |
| refract | 屈折・全反射 | 水に入ると、光はなぜ曲がる？ 出られなくなるのはいつ？ |
| lens | 凸レンズ | 虫めがねは、なぜ光を集める？ |
| lens-image | 実像と虚像 | スクリーンに映る像と、映らない像のちがいは？ |

- 屈折の盤の切り替え: `direction`（`空気 → 水` / `水 → 空気`。物質がガラスのときのラベルは `空気 → ガラス` / `ガラス → 空気`）と `medium`（`水` / `ガラス`）。

## 端の場合（決めたこと。それぞれテストを書く）

| 場合 | 扱い | テスト |
|---|---|---|
| シーンの値の型がちがう（座標が文字列の数字 `'120'`、null、配列、真偽値） | `validateScene` が直す所を返す。数字の文字列も不正（自動で直さない） | `scene.test.js` |
| 空（`elements` が空・ない、`kind` が空文字、シーンが null・undefined） | 不正。例外を投げず、直す所を返す | `scene.test.js` |
| とても大きい値・範囲外（NaN、Infinity、1e308、盤の外の座標、焦点距離が 0 以下） | 不正 | `scene.test.js` |
| 部品の id の重複、知らない `type`、必要な部品がない、同じ役の部品が 2 つ | 不正 | `scene.test.js` |
| 不正なシーンを `trace`・`handles` に渡す | 例外を投げず、`rays` などは空、`notes` に「この図は表示できません」を入れて返す | `scene.test.js` |
| 部品を盤の外や動かせる範囲の外へ引く（（−1000, −1000）、（5000, 5000）、NaN を含む点） | 範囲の端で止める。NaN・数でない点は無視して元と同じ内容を返す | `scene.test.js` |
| 光源を鏡・境界の反対側へ引く | 元の側の端で止める | `scene.test.js` |
| 入射角 0° | 反射光は来た道を戻る。屈折は直進（屈折角 0°） | `optics.test.js`・`scene.test.js` |
| 入射角がちょうど臨界角 | 全反射とする（sin θ₂ ≥ 1 − 1e-9） | `optics.test.js` |
| 物体が焦点の上（距離の差が 1 未満） | `imageKind: 'none'`、`notes` に「像はできません（レンズを出た光が平行になります）」 | `scene.test.js` |
| 物体が焦点の内側 | `imageKind: 'virtual'`、`notes` に「虚像（スクリーンには映りません）」。`screenSharp` は必ず false | `scene.test.js` |
| 像が盤の外 | `images[].offBoard: true`、`notes` に「像はこの先にできます」。光線は盤の端までで切る | `scene.test.js` |
| 物体をレンズの位置まで引く | レンズの手前（暫定で 20 以上離れた所）で止める | `scene.test.js` |
| `moveElement`・`setOption` に知らない id・handle・key・value | 元と同じ内容のシーンを返す（例外を投げない） | `scene.test.js` |
| 「ためしてみよう」の境界 | 目標から ±2°・±6 ちょうどは「できた」、それを超えたら「まだ」。測った値が null なら「まだ」 | `boards.test.js` |
| `?board=` が空・知らない id・41 文字以上・2 つ以上 | `boardId: null` と、それぞれの `error` | `entry.test.js` |
| `parseBoardParam` に文字列でないもの（null、数、オブジェクト） | `{ boardId: null, error: null }` | `entry.test.js` |

## 守ること

- 変更しないファイル: `js/geometry.js`（使うだけ）、`docs/`、`tools/`、`CLAUDE.md`、`AGENTS.md`、`package.json`。
- 外部ライブラリを使わない。`npm install` をしない。
- localStorage などへの保存をしない。DOM に触らない（この指示書のファイルはすべて Node で動くこと）。
- モジュールの形は `js/geometry.js` と同じにする（実装計画の Global Constraints）。
- git の状態を変える操作をしない。

## 完了の条件

- `npm test` がすべて成功する。
- 実装計画 Task 1 の「テスト」と、上の「端の場合」の表のすべての行に、対応するテストがある。
- 報告に、6 種類の盤それぞれの部品（`elements`）の形と、「ためしてみよう」の一覧を書く（次の画面の実装で使うため）。
