# Codex 実装報告

## 変更したファイル

- `js/scene.js`：全盤の光線に `role` を追加。`lens` の光線を焦点で分割。
- `js/config.js`：説明の描画時間・速度・音声待機などの定数を追加。
- `js/explain.js`：描画対象の解決、時間割、途中・完成状態、前後移動を実装。
- `js/prefs.js`：3項目の検査・保存・読み込みと例外処理を実装。
- `js/voice.js`：音声準備・再生・速度変更・一時停止・古い通知の無視・URL解放を実装。
- `tests/scene.test.js`：役割と座標の回帰テストを追加。レンズの本数を更新。
- `tests/explain.test.js`：全盤の描画対象、時間計算、進捗、境界値を検証。
- `tests/prefs.test.js`：不正な保存値と保存先の例外を検証。
- `tests/voice.test.js`：偽のAudio・時計で再生失敗、終了待ち、連続操作を検証。
- `tests/scripts.test.js`：6盤×6体の台本、用語、75文字制限、描画指定を検証。
- `tests/voice-light.test.js`：全手の音声ファイルの実在と正の長さを検証。

## テスト結果

**`npm test`：423件すべて成功**（既存335件＋追加88件）。失敗・スキップは0件です。

変更前との比較も900配置で実施し、レンズの分割をつなぎ戻した光線座標、およびその他の計算結果が一致しました。

## 指示書と違う点・判断したこと・残った問題

指定範囲外の変更、パッケージ追加、コミット・ステージングはありません。未解決の問題はありません。

**`resolve` の `items` の形式**

各itemは `{ type, ref }`。`ref.source` と以下の識別子で元データを参照します。

| `ref.source` | 識別子 |
|---|---|
| `elements` | 部品の `id` |
| `rays`・`images` | 配列の `index` |
| `marks`・`angles` | `key` |
| `handles` | `elementId` と `handle` |
| `options` | `direction` または `medium` の `key` |

- `ref.part` は `body`・`normal`・`axis`・`dot`・`shadow`・`highlight` で描く部分を区別します。影の範囲は `traceResult.measures` を使います。
- 文字は `ref.field` で `text`・`label`・`name`・`valueDeg`・`kind` を指定します。`kind` は像の名前に変換します。
- 形→文字の順に描くため、1つのtokenを複数のpartsに分ける場合があります。同じpart内の対象は同時に描きます。
- `steps.start` は全体の開始から、`parts.start` はその手の開始からの時間です。いずれも速度反映済みのmsです。
- 音声プレイヤーには、URL解放用の `revoke` と時計用の `now` を追加で渡せます。