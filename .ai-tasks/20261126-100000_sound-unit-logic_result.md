# Codex 実装報告

## 変更したファイル

- `js/config.js`：音の数値・配置を凍結して追加。読む時間の設定を追加。
- `js/sound.js`：波の数・弦の振動数・比較・到達時間・波形の計算を新規実装。
- `js/scene.js`：音の3盤の検査、描画座標、つまみ操作、切り替えを追加。
- `js/boards.js`：単元一覧、音の3盤、課題、読み出しを追加。
- `js/explain.js`：音の描画指定と参照、読む時間を追加。音の弧は内側から順に描画。
- `tests/sound.test.js`：計算と不正入力のテストを新規追加。
- `tests/scene.test.js`：境界値、不正入力、全組み合わせの図形・操作を検証。
- `tests/boards.test.js`：単元、9課題の達成操作、全操作値での表示と判定を検証。
- `tests/explain.test.js`：音の参照、読む時間、異常入力、再生速度を検証。
- `tests/scripts.test.js`：光と音の全台本について、用語・字数・手数・描画指定を検証。
- `tests/view-math.test.js`：盤一覧を回す画面テスト15か所を `unit === 'light'` に限定。

## テスト結果

`npm test`：**616件すべて成功**。失敗・スキップともに0件。

指示書の「端の場合」の全行に対応するテストを追加・拡張しました。

## 指示書と違う点・判断したこと・残った問題

指定範囲外のファイル変更、パッケージ追加、gitの状態を変える操作は行っていません。

その2で使用する `trace().sound` の形は次のとおりです。

```text
sound-wave:
  { kind, fork, grid, wave, amplitude, period, labels }

sound-string:
  { kind, box, string, bridge, vibration, grid, wave, amplitude, labels }

sound-speed:
  { kind, firework, ground, listener, waves, distanceArrow, labels }
```

- 点は `{ x, y }`、波形は `wave.points`、矢印は `from`・`to` で返します。
- `labels` はキーごとの `{ key, x, y, text }`。同じラベルを `marks` にも格納します。
- 花火の光線は `rays` に格納します。光の盤・不正なシーンでは `sound: null` です。
- 距離矢印のずらし幅は24としました。最短距離でも光線より上になります。
- `readMs` 配列の長さが手数と異なる場合は、全手の読む時間を0として扱います。

画面実装・読み込み・オフライン対応は、その2での作業です。今回限定した画面テストも、その際に音の盤へ広げる必要があります。