// 検証用（使い捨て）。Cloudflare Workers AI が、中 1「光」を日本語で正しく教えられるかを確かめる。
// - GET  /     検証ページ（このファイルの下のほうの PAGE）
// - POST /ask  AI への中継（合言葉が合うときだけ）
// アプリ本体には入れない。確かめ終わったら Worker ごと消してよい。

// ↓↓↓ ここを、好きな合言葉（半角の英数字 8 文字以上）に変えてからデプロイする ↓↓↓
const CODE = 'CHANGE-ME';

const MODELS = [
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/ibm-granite/granite-4.0-h-micro',
  '@cf/openai/gpt-oss-120b',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
];
const MAX_QUESTION = 2500;   // 質問の文字数の上限
const MAX_SYSTEM = 3000;     // 先生役の指示の文字数の上限
const MAX_TOKENS = 500;      // 答えの長さの上限

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (request.method === 'POST' && url.pathname === '/ask') return ask(request, env);
    return new Response('not found', { status: 404 });
  },
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function ask(request, env) {
  if (CODE === 'CHANGE-ME' || CODE.length < 8) return json({ error: '合言葉（CODE）を 8 文字以上に変えてから、もう一度デプロイしてください' }, 503);
  if (request.headers.get('x-code') !== CODE) return json({ error: '合言葉がちがいます' }, 403);
  if (!env.AI) return json({ error: 'Workers AI のバインディング（変数名 AI）がありません' }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '送られたデータを読めません' }, 400); }
  const model = body && body.model, system = body && body.system, question = body && body.question;
  if (!MODELS.includes(model)) return json({ error: '使えないモデルです' }, 400);
  if (typeof question !== 'string' || question.length === 0 || question.length > MAX_QUESTION) return json({ error: '質問が空か、長すぎます' }, 400);
  if (typeof system !== 'string' || system.length > MAX_SYSTEM) return json({ error: '指示が長すぎます' }, 400);

  const started = Date.now();
  let out, note = '';
  try {
    try {
      out = await env.AI.run(model, {
        messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
        max_tokens: MAX_TOKENS, temperature: 0.2,
      });
    } catch (first) {
      // 入力の形がちがうモデル（instructions / input の形）のために、もう 1 回だけ試す
      note = 'messages の形では失敗: ' + String((first && first.message) || first).slice(0, 160);
      out = await env.AI.run(model, { instructions: system, input: question, max_output_tokens: MAX_TOKENS });
    }
  } catch (e) {
    return json({ error: String((e && e.message) || e).slice(0, 300), note: note, ms: Date.now() - started }, 502);
  }
  let raw = '';
  try { raw = JSON.stringify(out).slice(0, 500); } catch (e) { raw = '(文字にできない答え)'; }
  return json({ text: pickText(out), usage: (out && out.usage) || null, note: note, ms: Date.now() - started, raw: raw });
}

// モデルによって答えの入れ物がちがうので、文字の部分を探して取り出す
function pickText(o) {
  if (!o) return '';
  if (typeof o === 'string') return o;
  if (typeof o.response === 'string') return o.response;
  if (o.response && typeof o.response === 'object') return JSON.stringify(o.response);
  if (typeof o.output_text === 'string') return o.output_text;
  const c = o.choices && o.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  if (Array.isArray(o.output)) {
    const parts = [];
    o.output.forEach(function (item) {
      (Array.isArray(item && item.content) ? item.content : []).forEach(function (p) {
        if (p && typeof p.text === 'string' && p.type !== 'reasoning_text') parts.push(p.text);
      });
    });
    return parts.join('\n');
  }
  return '';
}

// ---- 検証ページ（この中では バッククォート と ドル波かっこ を使わない） ----
const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI の検証（ひかりボード 段階 2）</title>
<style>
  body { font-family: "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif; margin: 0; background: #EEF3FF; color: #1B2430; line-height: 1.6; }
  main { max-width: 980px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 20px 0 6px; }
  .card { background: #fff; border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; box-shadow: 0 2px 10px rgba(26,60,140,.12); }
  label { display: block; margin: 4px 0; }
  input[type=password], input[type=text] { font: inherit; padding: 8px 10px; border: 1px solid #C9D5F0; border-radius: 10px; width: 260px; max-width: 100%; }
  button { font: inherit; font-weight: 700; min-height: 44px; padding: 0 16px; border: 0; border-radius: 12px; background: #1A5CFF; color: #fff; cursor: pointer; margin: 4px 6px 4px 0; }
  button.sub { background: #DCE6FF; color: #1B2430; }
  button:disabled { opacity: .5; cursor: default; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-top: 1px solid #C9D5F0; padding: 6px 8px; text-align: left; vertical-align: top; }
  td.a { white-space: pre-wrap; }
  .ok { color: #216E43; font-weight: 700; } .ng { color: #B23A36; font-weight: 700; } .muted { color: #5B6676; font-size: 13px; }
  textarea { width: 100%; height: 160px; font: 13px/1.4 monospace; }
  #status { font-weight: 700; }
</style>
</head>
<body>
<main>
  <h1>AI の検証（ひかりボード 段階 2）</h1>
  <p class="muted">無料で使える AI が、中 1「光」を日本語で正しく教えられるかを確かめるページです。生徒の情報は入れません。</p>

  <div class="card">
    <label>合言葉 <input id="code" type="password" autocomplete="off"></label>
    <h2>ためすモデル</h2>
    <div id="models"></div>
    <p class="muted">下の 2 つ（120b・70b）は、くらべるための大きいモデルです。1 回あたりの消費が大きいので、無料枠では授業には使えません。</p>
    <button id="runQ">1. 質問のテスト（16 問）</button>
    <button id="runS">2. 図のテスト（6 問）</button>
    <button id="stop" class="sub" disabled>止める</button>
    <p id="status">まだ始めていません。</p>
    <p class="muted" id="engine"></p>
  </div>

  <div class="card">
    <h2>結果（Claude に渡す）</h2>
    <p class="muted">両方のテストが終わったら「コピー」を押して、チャットに貼ってください。合言葉は入っていません。</p>
    <button id="copy" class="sub">コピー</button>
    <textarea id="out" readonly></textarea>
  </div>

  <div class="card">
    <h2>答えの一覧</h2>
    <table><thead><tr><th>モデル</th><th>問</th><th>秒</th><th>判定</th><th>答え</th></tr></thead><tbody id="rows"></tbody></table>
  </div>
</main>

<script src="https://schooldatahuruyama-lgtm.github.io/katekyo/js/config.js"></script>
<script src="https://schooldatahuruyama-lgtm.github.io/katekyo/js/geometry.js"></script>
<script src="https://schooldatahuruyama-lgtm.github.io/katekyo/js/optics.js"></script>
<script src="https://schooldatahuruyama-lgtm.github.io/katekyo/js/scene.js"></script>
<script src="https://schooldatahuruyama-lgtm.github.io/katekyo/js/boards.js"></script>
<script>
(function () {
  var MODELS = [
    { id: '@cf/qwen/qwen3-30b-a3b-fp8', on: true },
    { id: '@cf/google/gemma-4-26b-a4b-it', on: true },
    { id: '@cf/meta/llama-3.1-8b-instruct-fp8', on: true },
    { id: '@cf/ibm-granite/granite-4.0-h-micro', on: true },
    { id: '@cf/openai/gpt-oss-120b', on: false },
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', on: false }
  ];
  var TUTOR = 'あなたは中学 1 年の理科「光」を教える先生です。中学生に分かるやさしい日本語で、3 文以内で答えてください。'
    + '中学 1 年の教科書の範囲をこえる式や用語は使わず、範囲をこえる質問には「くわしくは高校で学びます」と伝えてください。'
    + '理科に関係のない話や、宿題の答えだけを求める質問には答えず、やさしく理科の話に戻してください。分からないときは、分からないと言ってください。';
  var QUESTIONS = [
    '鏡に光が当たるとき、入射角と反射角はどんな関係ですか。',
    '入射角とは、どことどこの間の角ですか。',
    '光が空気から水に入るとき、入射角と屈折角はどちらが大きいですか。',
    '光が水から空気に出るとき、入射角と屈折角はどちらが大きいですか。',
    '全反射とは何ですか。どんなときに起こりますか。',
    '光ファイバーは、光のどんな性質を利用していますか。',
    '凸レンズの焦点とは何ですか。',
    '物体を凸レンズの焦点より外側に置くと、どんな像ができますか。',
    '物体を凸レンズの焦点距離の 2 倍の位置に置くと、像の大きさと位置はどうなりますか。',
    '物体を凸レンズの焦点より内側に置いて、レンズをのぞくと、どんな像が見えますか。',
    '実像と虚像のちがいは何ですか。',
    '鏡に映った像は、鏡からどれくらいの距離にあるように見えますか。',
    '物体を凸レンズの焦点の上に置くと、像はどうなりますか。',
    '水に入れたストローが折れて見えるのはなぜですか。',
    '屈折率の式を教えてください。',
    '宿題の答えを全部教えて。あと、好きなゲームは何ですか。'
  ];
  var COMMON = '次の JSON は、理科の図の配置データです。座標は横が 0 から 600（右へ行くほど大きい）、縦が 0 から 420（下へ行くほど大きい）です。';
  var TASKS = [
    { id: 's1', kind: 'reflect', task: '入射角がちょうど 60 度になるように、光源（src）の位置を変えてください。',
      rule: '光は src から mirror の中心（mirror の x, y）へ進みます。鏡は水平で、法線は真上を向いています。入射角は、光と法線の間の角です。src は鏡より上（y が mirror.y より小さい）に置きます。',
      check: function (m) { return Math.abs(m.incidenceDeg - 60) <= 5; }, want: '入射角 60°±5' },
    { id: 's2', kind: 'refract', task: '水から空気へ進む光が、全反射するようにしてください。',
      rule: '光は src から boundary の点（boundary の x, y）へ進みます。境界は水平で、法線は縦です。options.direction が "air-to-medium" のとき光源は境界より上（y が小さい）、"medium-to-air" のとき光源は境界より下（y が大きい）に置きます。options.medium は "water" か "glass" です。',
      check: function (m) { return m.totalReflection === true && m.medium === 'water'; }, want: '全反射（水 → 空気）' },
    { id: 's3', kind: 'refract', task: '空気からガラスへ、境界に垂直に光を当ててください。',
      rule: '光は src から boundary の点（boundary の x, y）へ進みます。境界は水平で、法線は縦です。options.direction が "air-to-medium" のとき光源は境界より上（y が小さい）、"medium-to-air" のとき光源は境界より下（y が大きい）に置きます。options.medium は "water" か "glass" です。',
      check: function (m) { return m.incidenceDeg <= 3 && m.medium === 'glass' && m.direction === 'air-to-medium'; }, want: '入射角 3° 以下・ガラス・空気から' },
    { id: 's4', kind: 'lens-image', task: '虚像ができるように、物体（object）の位置を変えてください。',
      rule: 'レンズは lens.x にあり、焦点距離は lens.focalLength です。物体はレンズより左に置きます。物体とレンズの距離は lens.x から object.x を引いた値です。物体はレンズから 20 以上離します。',
      check: function (m) { return m.imageKind === 'virtual'; }, want: '虚像' },
    { id: 's5', kind: 'lens-image', task: '物体（object）を、レンズから焦点距離のちょうど 2 倍の位置に置き、スクリーン（screen）を像がはっきり映る位置に動かしてください。',
      rule: 'レンズは lens.x にあり、焦点距離は lens.focalLength です。物体はレンズより左、スクリーンはレンズより右に置きます。物体とレンズの距離は lens.x から object.x を引いた値です。',
      check: function (m) { return Math.abs(m.objectDistance / 100 - 2) <= 0.15 && m.screenSharp === true; }, want: '物体が 2 倍の位置・スクリーンに映る' },
    { id: 's6', kind: 'mirror-image', task: '物体（object）を鏡に近づけて、鏡からの距離を 100 以下にしてください。',
      rule: '鏡は縦で、mirror.x の位置にあります。物体と見る人（eye）は鏡より左に置きます。物体と鏡の距離は mirror.x から object.x を引いた値です。',
      check: function (m) { return m.objectDistance <= 100; }, want: '鏡からの距離 100 以下' }
  ];

  function $(id) { return document.getElementById(id); }
  var H = window.Hikari, engineOk = !!(H && H.scene && H.boards);
  $('engine').textContent = engineOk ? '図の検査: アプリ本体の検査のしくみを読みこみました。' : '図の検査: アプリ本体を読みこめませんでした。図のテストは「形だけ」の確認になります。';

  MODELS.forEach(function (m, i) {
    var l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.checked = m.on; c.id = 'm' + i;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + m.id));
    $('models').appendChild(l);
  });

  var results = [], running = false, stopped = false;
  function chosen() { return MODELS.filter(function (m, i) { return $('m' + i).checked; }).map(function (m) { return m.id; }); }
  function clean(t) { return String(t || '').replace(/<think>[\\s\\S]*?<\\/think>/g, '').trim(); }
  function show() {
    var sum = {};
    results.forEach(function (r) {
      var k = r.model + ' / ' + r.type; sum[k] = sum[k] || { n: 0, err: 0, ok: 0, ms: 0 };
      sum[k].n++; if (r.err) sum[k].err++; if (r.ok === true) sum[k].ok++; sum[k].ms += r.ms || 0;
    });
    Object.keys(sum).forEach(function (k) { sum[k].avgMs = Math.round(sum[k].ms / sum[k].n); delete sum[k].ms; });
    $('out').value = JSON.stringify({ when: new Date().toISOString(), engine: engineOk, summary: sum, results: results });
  }
  function row(r) {
    var tr = document.createElement('tr');
    [r.model.split('/').pop(), r.id, r.ms ? (r.ms / 1000).toFixed(1) : '', '', ''].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    var j = tr.children[3];
    if (r.err) { j.textContent = 'エラー'; j.className = 'ng'; }
    else if (r.ok === true) { j.textContent = '○'; j.className = 'ok'; }
    else if (r.ok === false) { j.textContent = '×'; j.className = 'ng'; }
    tr.children[4].className = 'a';
    tr.children[4].textContent = r.err ? r.err : (r.text + (r.why ? '\\n（' + r.why + '）' : ''));
    $('rows').appendChild(tr);
  }
  function post(model, system, question) {
    return fetch('/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-code': $('code').value },
      body: JSON.stringify({ model: model, system: system, question: question }) })
      .then(function (res) { return res.json().then(function (d) { d.status = res.status; return d; }); })
      .catch(function (e) { return { error: '通信に失敗: ' + e.message }; });
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function setBusy(b) { running = b; $('runQ').disabled = b; $('runS').disabled = b; $('stop').disabled = !b; }

  function judgeScene(task, text) {
    var s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return { ok: false, why: 'JSON が見つからない' };
    var scene;
    try { scene = JSON.parse(text.slice(s, e + 1)); } catch (err) { return { ok: false, why: 'JSON として読めない' }; }
    if (!engineOk) return { ok: null, why: '形は JSON。中身は検査できず' };
    var problems = H.scene.validateScene(scene);
    if (problems.length) return { ok: false, why: '検査で不合格: ' + problems[0] };
    if (scene.kind !== task.kind) return { ok: false, why: '盤の種類が変わっている' };
    var m = H.scene.trace(scene).measures, good = false;
    try { good = !!task.check(m); } catch (err) { good = false; }
    return { ok: good, why: (good ? '条件を満たした' : '条件を満たさない') + '（ねらい: ' + task.want + '。結果: ' + JSON.stringify(m) + '）' };
  }

  function run(type) {
    if (running) return;
    var models = chosen();
    if (!$('code').value) { $('status').textContent = '合言葉を入れてください。'; return; }
    if (!models.length) { $('status').textContent = 'モデルを 1 つ以上えらんでください。'; return; }
    results = results.filter(function (r) { return r.type !== type; });
    setBusy(true); stopped = false;
    var jobs = [];
    models.forEach(function (model) {
      if (type === 'q') QUESTIONS.forEach(function (q, i) { jobs.push({ model: model, id: 'q' + (i + 1), system: TUTOR, question: q }); });
      else TASKS.forEach(function (t) {
        var base = engineOk ? H.boards.get(t.kind).scene : null;
        if (!base) return;
        jobs.push({ model: model, id: t.id, task: t, system: 'あなたは、理科の図の配置データ（JSON）を作る係です。JSON だけを出力し、説明や前置きは書きません。',
          question: COMMON + '\\n' + t.rule + '\\n\\n課題: ' + t.task + '\\n\\n今の配置データ:\\n' + JSON.stringify(base) + '\\n\\n書きかえた配置データを、JSON だけで出力してください。' });
      });
    });
    if (!jobs.length) { $('status').textContent = '図のテストは、アプリ本体を読みこめないため行えません。'; setBusy(false); return; }
    var i = 0;
    function next() {
      if (stopped || i >= jobs.length) { setBusy(false); $('status').textContent = (stopped ? '止めました。' : '終わりました。') + ' ' + i + ' / ' + jobs.length + ' 件'; show(); return; }
      var job = jobs[i++];
      $('status').textContent = '実行中 ' + i + ' / ' + jobs.length + '（' + job.model.split('/').pop() + ' ' + job.id + '）';
      post(job.model, job.system, job.question).then(function (d) {
        var r = { type: type, model: job.model, id: job.id, ms: d.ms || 0 };
        if (d.error) { r.err = d.error + (d.note ? ' / ' + d.note : ''); }
        else {
          var text = clean(d.text);
          r.text = text.slice(0, 500); r.usage = d.usage || null; if (d.note) r.note = d.note;
          if (!text) { r.err = '答えが空（' + String(d.raw || '').slice(0, 200) + '）'; }
          else if (job.task) { var j = judgeScene(job.task, text); r.ok = j.ok; r.why = j.why; }
        }
        results.push(r); row(r); show();
        if (d.status === 403 || d.status === 503) { stopped = true; $('status').textContent = r.err; setBusy(false); return; }
        return wait(400).then(next);
      });
    }
    next();
  }
  $('runQ').addEventListener('click', function () { run('q'); });
  $('runS').addEventListener('click', function () { run('s'); });
  $('stop').addEventListener('click', function () { stopped = true; });
  $('copy').addEventListener('click', function () {
    $('out').select();
    if (navigator.clipboard) navigator.clipboard.writeText($('out').value).then(function () { $('status').textContent = 'コピーしました。'; }, function () { document.execCommand('copy'); });
    else document.execCommand('copy');
  });
})();
</script>
</body>
</html>`;
