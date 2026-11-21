# Codex 実装報告

## 変更したファイル

指定された9ファイルを新規作成しました。

| ファイル | 実装内容 |
|---|---|
| [js/config.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/js/config.js) | 屈折率、許容値、操作範囲、表示用の数値・色。 |
| [js/optics.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/js/optics.js) | 入射角、反射、屈折、臨界角、うすいレンズの計算。 |
| [js/scene.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/js/scene.js) | シーン検査、光線・像の計算、つまみ、移動制限、切り替え。 |
| [js/boards.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/js/boards.js) | 6種類の盤、案内、課題14項目、達成判定、表示文。 |
| [js/entry.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/js/entry.js) | `?board=` の読み取りと不正値の判定。 |
| [tests/optics.test.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/tests/optics.test.js) | 指定の数値と臨界角・焦点の境界テスト。 |
| [tests/scene.test.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/tests/scene.test.js) | 不正入力、操作制限、光線の法則、像、操作の組み合わせのテスト。 |
| [tests/boards.test.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/tests/boards.test.js) | 全課題の達成操作、許容境界、独立した写し、表示・切り替えのテスト。 |
| [tests/entry.test.js](C:/Users/yan12/Documents/keita/AI開発/家庭教師アプリ/tests/entry.test.js) | 正常な指定、空・未知・長すぎる値・重複・型違いのテスト。 |

## テスト結果

`npm test`：**108件すべて成功、失敗0件、スキップ0件**。

- 実装計画の指定数値と「端の場合」の全項目に対応。
- 全14課題を `moveElement`・`setOption` だけで達成できることを確認。
- 光線の有限性、盤内への切り取り、元のシーンを変更しないことを確認。
- DOMのない環境で、ブラウザ用名前空間とNodeの計算結果が一致することを確認。

## 指示書と違う点・判断したこと・残った問題

指定外のファイル変更はありません。gitの状態変更、パッケージ追加、保存処理、DOM操作も行っていません。

判断した点は次のとおりです。

- 不正入力時の `handles` は、実装計画の配列形式に合わせて `[]` を返します。「この図は表示できません」と理由は `trace.notes` に返します。
- 通常の屈折でも反射光を返します。`angles.out` は屈折角です。
- `checkPrompt` の数値比較は数値だけを受け付け、`is` は像の種類や全反射の判定に必要な文字列・真偽値にも対応します。
- 屈折の `board.scene` を操作結果に置き換えると、次に読む `board.controls` のラベルが水・ガラスに合わせて変わります。

**6種類の `elements` の形**

全部品の共通項目は `{ id, type, x, y }` です。表内は「id / type」、括弧内は追加項目です。

| 盤 | 部品 | 操作用のhandle |
|---|---|---|
| straight | `src / source`、`blocker / blocker (height)`、`screen / screen (height)` | 光源・ついたて：`move` |
| reflect | `src / source`、`mirror / mirror (length, tiltDeg)` | 光源：`move`、鏡：`tilt` |
| mirror-image | `object / object (height)`、`eye / eye`、`mirror / mirror (length, tiltDeg: 90)` | 物体・見る人：`move` |
| refract | `src / source`、`boundary / boundary` | 光源：`move` |
| lens | `src / source`、`lens / lens (focalLength)` | 光源：`move`、焦点：`focus` |
| lens-image | `object / object (height)`、`lens / lens (focalLength)`、`screen / screen (height)` | 物体・スクリーン：`move` |

座標の扱いは次のとおりです。

- 鏡・レンズ・ついたて・スクリーンの `x, y` は中心。
- 物体の `y` は根元で、先端は `y - height`。
- `boundary.x, y` は入射点。境界は水平。
- 像の `height` は正立で正、倒立で負。先端は同じく `y - height`。
- 屈折のシーンだけ `options: { direction, medium }` を持ちます。

**「ためしてみよう」の一覧**

| 盤 | 内容 |
|---|---|
| 直進 | ついたてを光源に近づけて、影の幅を200以上にしてみよう。<br>ついたてをスクリーンに近づけて、影の幅を100以下にしてみよう。 |
| 反射 | 入射角を60°にして、反射角を見てみよう。<br>光を鏡に垂直に当てて、来た道を戻してみよう。 |
| 鏡の像 | 物体を鏡から80の所へ近づけて、像の位置を見てみよう。<br>物体を鏡から240の所へ遠ざけて、像の位置を見てみよう。 |
| 屈折・全反射 | 水やガラスから空気へ進む向きにして、全反射を起こしてみよう。<br>境目に垂直に光を当てて、曲がらずに進ませてみよう。<br>物質をガラスに替えて、光の曲がり方を見てみよう。 |
| 凸レンズ | 焦点距離を140にして、光が集まる位置を変えてみよう。<br>光源を光軸から100の高さへ動かし、光が集まる位置を見てみよう。 |
| 実像と虚像 | 物体を焦点の内側へ動かして、虚像をつくってみよう。<br>物体をレンズから150の所に置いて、像の大きさをくらべよう。<br>スクリーンを動かして、実像がはっきり映る位置をさがそう。 |