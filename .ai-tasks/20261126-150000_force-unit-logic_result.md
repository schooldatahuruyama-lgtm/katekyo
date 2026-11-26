# Codex 実装報告

## 変更したファイル

- `js/config.js`：力の数値・配置設定を凍結して追加。
- `js/force.js`：力・ばねののび・つり合い・整数からの表示を新規実装。
- `js/scene.js`：3盤の検査、図形、つまみ、切り替え、キー操作を追加。
- `js/boards.js`：力の単元、3盤、9課題、読み出しを追加。
- `js/explain.js`：力の台本の描画指定・参照を追加。
- `tests/force.test.js`：計算・不正入力・設定の凍結を検証。
- `tests/scene.test.js`：全82配置、境界値、不正入力、操作を検証。
- `tests/boards.test.js`：表示と判定の一致、9課題の達成操作を検証。
- `tests/explain.test.js`：図形・ラベル・グラフ点・切り替えの参照を検証。
- `tests/scripts.test.js`：光・音・力の全台本を検証対象に追加。
- `tests/view-math.test.js`：画面テスト11か所を光・音に限定。ホームの盤数を一覧に合わせて検証。

## テスト結果

`npm test`：**800件すべて成功**。失敗・スキップともに0件。

指示書の「端の場合」の全行に対応するテストを追加・拡張しました。`git diff --check` も問題ありません。

## 指示書と違う点・判断したこと・残った問題

- 課題の複数条件に `when.all`、左右の値の一致に `op: 'equal'` を追加しました。
- キー操作は `stepForceHandle` と、音・力を振り分ける `stepHandle` を追加しました。
- 指定外ファイルの変更、パッケージ追加、gitの状態を変える操作は行っていません。

`trace().force` の構造は次のとおりです。

```text
force-spring:
  { kind, stand: { lines },
    spring: { points, top, bottom, naturalBottom },
    weights, stretch, forceArrow,
    graph: { origin, xEnd, yEnd, xTicks, yTicks, line, points },
    labels }

force-arrow:
  { kind, grid, box, application, arrow, magnitude, labels }

force-balance:
  { kind, grid, card, pulls: { left, right }, lines, labels }
```

点は `{ x, y }`、矢印・区切り線は `{ from, to }`。`labels` はキーごとの `{ key, x, y, text }` で、`marks` にも格納します。光・音の盤と不正なシーンでは `force: null`、力の盤では `sound: null` です。

画面実装・読み込み・オフライン対応は指示書その2の範囲です。今回限定した画面テスト11か所も、その際に力の盤へ広げる必要があります。