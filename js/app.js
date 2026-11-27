// ホームと盤を切り替え、通信状態・課題の達成を表示する。
// 配置や達成は画面を開いている間だけ保持し、端末には保存しない。
(function (root) {
  'use strict';

  const node = typeof module === 'object' && module.exports;
  const boards = node ? require('./boards.js') : root.Hikari.boards;
  const scene = node ? require('./scene.js') : root.Hikari.scene;
  const entry = node ? require('./entry.js') : root.Hikari.entry;
  const boardView = node ? require('./board-view.js') : root.Hikari.boardView;
  const scripts = node ? require('../content/scripts-light.js') : root.Hikari.scripts;
  const voiceData = node ? require('../content/voice-light.js') : root.Hikari.voiceData;
  const scriptsSound = node ? require('../content/scripts-sound.js') : root.Hikari.scriptsSound;
  const voiceDataSound = node ? require('../content/voice-sound.js') : root.Hikari.voiceDataSound;
  const scriptsForce = node ? require('../content/scripts-force.js') : root.Hikari.scriptsForce;
  const voiceDataForce = node ? require('../content/voice-force.js') : root.Hikari.voiceDataForce;
  const scriptsBio1 = node ? require('../content/scripts-bio1.js') : root.Hikari.scriptsBio1;
  const voiceDataBio1 = node ? require('../content/voice-bio1.js') : root.Hikari.voiceDataBio1;
  const content = { light: { scripts, voiceData }, sound: { scripts: scriptsSound, voiceData: voiceDataSound },
    force: { scripts: scriptsForce, voiceData: voiceDataForce }, bio1: { scripts: scriptsBio1, voiceData: voiceDataBio1 } };
  const explain = node ? require('./explain.js') : root.Hikari.explain;
  const prefs = node ? require('./prefs.js') : root.Hikari.prefs;
  const voice = node ? require('./voice.js') : root.Hikari.voice;
  const config = node ? require('./config.js') : root.Hikari.config;
  const credit = '音声: VOICEVOX Nemo（女声 2・3・4、男声 1・2・3）';
  const instructions = {
    'bio-flower': '下のボタンで、図と部分を切り替えられるよ。',
    'bio-plants': '下のボタンで、特徴をえらべるよ。',
    'bio-animals': '下のボタンで、3 つの特徴をえらべるよ。',
    straight: 'オレンジの丸（光源）と白い丸（ついたて）は指で動かせるよ。',
    reflect: 'オレンジの丸（光源）を動かしたり、白い丸で鏡をかたむけたりできるよ。',
    'mirror-image': '白い丸で物体や見る人を動かし、像の位置を確かめよう。',
    refract: 'オレンジの丸（光源）は指で動かせるよ。下の切り替えもためそう。',
    lens: 'オレンジの丸で光源の高さを、白い丸で焦点距離を変えられるよ。',
    'lens-image': '白い丸で物体やスクリーンを左右に動かせるよ。',
    'sound-wave': '白い丸で、振幅（上下）と振動数（左右）を変えられるよ。',
    'sound-string': '白い丸で、ことじとはじく強さを動かせるよ。下の切り替えもためそう。',
    'sound-speed': '白い丸で、見る人の位置を変えられるよ。',
    'force-spring': '下のボタンで、おもりの数とばねを変えられるよ。',
    'force-arrow': '矢印の先の白い丸を引くと、力の大きさと向きを変えられるよ。',
    'force-balance': '白い丸で、左右の力の大きさを変えられるよ。下の切り替えもためそう。',
  };

  function registerWorker(win) {
    if (!win || !/^https?:$/.test(win.location.protocol)) return;
    if (!win.navigator.serviceWorker) {
      win.console.warn('Service Worker は使えません。盤はそのまま使えます。'); return;
    }
    try {
      win.navigator.serviceWorker.register('./sw.js').catch(error => {
        win.console.warn('オフラインの準備ができませんでした。', error);
      });
    } catch (error) { win.console.warn('オフラインの準備ができませんでした。', error); }
  }

  function start(host) {
    if (typeof document === 'undefined' || !host) return null;
    const doc = host.ownerDocument, win = doc.defaultView;
    const all = boards.list(), ids = all.map(board => board.id);
    let view = null, connection = null, heading = null, closeExplanation = () => {};
    let storage;
    try { storage = win.localStorage; } catch (_) { /* 保存できなくても、その場で使える。 */ }
    const settings = prefs.load(storage, scripts.TEACHERS.map(teacher => teacher.id), scripts.DEFAULT_TEACHER);
    let chosenTeacher = false;
    try { chosenTeacher = scripts.TEACHERS.some(t => t.id === JSON.parse(storage.getItem(prefs.KEY))?.teacher); } catch (_) { /* 初めての端末。 */ }
    const save = () => prefs.save(storage, settings);
    function element(tag, className, text, parent) {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (text !== undefined) el.textContent = text;
      if (parent) parent.appendChild(el);
      return el;
    }
    function button(className, text, parent, action) {
      const el = element('button', className, text, parent); el.type = 'button';
      el.addEventListener('click', action); return el;
    }
    function updateConnection() {
      if (!connection) return;
      connection.className = 'chip' + (win.navigator.onLine ? ' online' : '');
      connection.replaceChildren();
      const dot = element('span', 'dot', undefined, connection); dot.setAttribute('aria-hidden', 'true');
      element('span', '', win.navigator.onLine ? 'オンライン' : 'オフライン（このまま使えます）', connection);
    }
    function navigate(id) {
      closeExplanation();
      const url = new URL(win.location.href);
      url.searchParams.delete('board');
      if (id) url.searchParams.set('board', id);
      try { win.history.pushState(null, '', url.href); }
      catch (error) {
        // file:// の履歴変更を制限するブラウザでも、盤への移動は続ける。
        if (win.location.protocol !== 'file:') throw error;
        win.location.href = url.href; return;
      }
      render(true);
    }
    function header(frame, board) {
      const bar = element('header', 'bar', undefined, frame);
      if (board) button('back', '← ボード一覧', bar, () => navigate(null));
      heading = element(board ? 'h1' : 'div', board ? 'board-title' : 'brand', board ? board.title : 'ひかりボード', bar);
      if (board) heading.tabIndex = -1;
      const statuses = element('div', 'statuses', undefined, bar);
      connection = element('span', 'chip', undefined, statuses);
      connection.setAttribute('role', 'status');
      element('span', 'chip wait', 'AI は準備中', statuses);
      updateConnection();
    }
    function home(frame, error) {
      const main = element('section', 'home', undefined, frame);
      heading = element('h1', 'hero', 'つまずいたら、', main); heading.tabIndex = -1;
      element('span', 'mark', '動かして確かめよう。', heading);
      element('p', 'lead', '盤の上の部品を指で動かすと、図や値がその場で変わります。', main);
      if (error) element('p', 'notice', '指定された盤が見つかりませんでした', main).setAttribute('role', 'status');
      boards.units().forEach(unit => {
        const list = element('section', 'list', undefined, main);
        element('h2', '', unit.title + ' ― ボードをえらぶ', list);
        all.filter(board => board.unit === unit.id).forEach(board => {
          const row = button('row', undefined, list, () => navigate(board.id));
          element('span', 'name', board.title, row);
          element('span', 'question', board.question, row);
          element('span', 'arrow', '→', row).setAttribute('aria-hidden', 'true');
        });
      });
      element('p', 'foot', '一度開けば、通信がなくても使えます。', main);
      element('p', 'foot', credit, main);
    }
    function openBoard(frame, board) {
      const unit = boards.units().find(unit => unit.id === all.find(item => item.id === board.id).unit);
      const { scripts, voiceData } = content[unit.id];
      if (!chosenTeacher) settings.teacher = unit.teacher;
      const completed = new Set(), promptNodes = new Map(), controlNodes = new Map();
      const steps = scripts.BOARDS[board.id];
      let mode = scene.validateScene(board.scene).length ? 'invalid' : 'start';
      let timeline, stepIndex = 0, elapsed = 0, lastTime = 0, paused = false, frameId = null;
      let voiceDone = true, voiceEndTime = 0, playVersion = 0, prepareVersion = 0, disposed = false;
      let preparation = 'idle', preparedTeacher = null, pendingPreparation = null;
      let soundVersion = 0, soundWaiting = false;
      let readoutKey = null, invalidScene = mode === 'invalid';
      let historyTeacher = null;
      const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const now = () => win.performance.now();
      const player = voice.createPlayer({
        createAudio: () => new win.Audio(),
        fetchClip: async url => {
          const response = await win.fetch(url);
          if (!response.ok) throw new Error('音声を読みこめません');
          return win.URL.createObjectURL(await response.blob());
        },
        setTimer: (callback, delay) => win.setTimeout(callback, delay),
        clearTimer: id => win.clearTimeout(id), now,
        revoke: url => win.URL.revokeObjectURL(url),
        onProblem: problem => problemNotice(problem),
      });
      const learn = element('div', 'learn', undefined, frame);
      const paper = element('section', 'board', undefined, learn);
      const boardHeading = element('h2', 'board-heading', undefined, paper);
      element('span', '', board.heading, boardHeading);
      const speech = element('div', 'speech', undefined, paper); speech.setAttribute('aria-live', 'polite');
      const face = element('img', '', undefined, speech); face.width = 48; face.height = 48;
      const speechText = element('p', '', '', speech);
      const stage = element('div', 'board-stage', undefined, paper);
      if (board.id === 'sound-speed') element('p', 'legend', '点線（‥‥）＝ 光（すぐに届く）／ 破線（－ －）＝ 音の波', paper);
      const cap = element('div', 'cap', undefined, paper);
      const readout = element('div', 'readout', undefined, cap);
      const instruction = element('span', '', instructions[board.id], cap);
      const notes = element('div', 'notes', undefined, cap); notes.setAttribute('role', 'status');
      const message = element('div', 'voice-message', '', paper); message.setAttribute('role', 'status'); message.hidden = true;
      const transport = element('div', 'explain-controls', undefined, paper);
      const back = button('btn', '◀ もどる', transport, () => enterStep(explain.backTarget(stepIndex)));
      const play = button('btn main', '⏸ 止める', transport, () => setPaused(!paused));
      button('btn', '次へ ▶', transport, next);
      const dots = element('span', 'dots', undefined, transport); dots.setAttribute('aria-hidden', 'true');
      const dotNodes = steps.map(() => element('i', '', undefined, dots));
      const speed = element('span', 'speed', undefined, transport); speed.setAttribute('role', 'group'); speed.setAttribute('aria-label', '速さ');
      element('span', '', '速さ', speed);
      const slower = button('btn', '−', speed, () => changeRate(-1)); slower.setAttribute('aria-label', 'おそくする');
      const rateText = element('b', '', '', speed);
      const faster = button('btn', '＋', speed, () => changeRate(1)); faster.setAttribute('aria-label', 'はやくする');
      const sound = button('btn', '', transport, toggleSound);
      button('btn', '先生をかえる', transport, restart);
      button('btn', 'とばして自分で動かす', transport, explore);
      const panel = element('aside', 'panel', undefined, learn); panel.setAttribute('aria-label', '先生の案内とためしてみよう');
      const history = element('div', 'explain-history', undefined, panel);
      element('h2', 'crumb', 'ここまでの説明', history);
      const lines = element('ol', 'talk', undefined, history);
      const after = element('div', 'after', undefined, panel);
      element('h2', 'crumb', 'ためしてみよう', after);
      const prompts = element('ul', 'prompts', undefined, after); prompts.setAttribute('aria-live', 'polite');
      board.prompts.forEach(prompt => {
        const row = element('li', 'try', undefined, prompts);
        const check = element('span', 'box', '□', row);
        const text = element('span', '', prompt.text, row);
        promptNodes.set(prompt.id, { row, check, text });
      });
      const controls = element('div', 'controls', undefined, after);
      controls.hidden = true;
      element('div', 'ask', '先生への質問は準備中です（今は使えません）', after);
      button('reset', 'はじめの配置にもどす', after, () => view.setScene(boards.get(board.id).scene));
      const replay = button('btn replay', '▶ もう一度、説明を見る', panel, restart);
      const startScreen = element('div', 'start', undefined, paper);
      element('p', '', 'だれに教えてもらう？', startScreen);
      const pick = element('div', 'pick', undefined, startScreen);
      pick.setAttribute('role', 'radiogroup'); pick.setAttribute('aria-label', '教えてもらう先生');
      const teacherNodes = scripts.TEACHERS.map((teacher, index) => {
        const choice = button('', undefined, pick, () => chooseTeacher(teacher.id));
        choice.setAttribute('role', 'radio');
        const img = element('img', '', undefined, choice); img.src = teacher.image; img.alt = ''; img.width = 64; img.height = 64;
        element('span', '', teacher.name, choice); element('small', '', teacher.tone, choice);
        choice.addEventListener('keydown', event => {
          const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[event.key];
          if (offset === undefined && !['Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 5 : (index + offset + 6) % 6;
          chooseTeacher(scripts.TEACHERS[next].id); teacherNodes[next].focus();
        });
        return choice;
      });
      const chosen = element('p', '', '', startScreen);
      const withVoice = button('btn', '🔊 音声ありで見る', startScreen, () => begin(true));
      const withoutVoice = button('btn', '音声なしで見る', startScreen, () => begin(false));
      button('start-skip', '説明をとばして、すぐ動かす', startScreen, explore);
      element('p', 'start-note', credit, startScreen);

      function clips() { return voiceData.CLIPS[board.id][settings.teacher]; }
      function stepSeconds(index) {
        return explain.clipSeconds(clips()[index][1], Array.from(steps[index].lines[settings.teacher]).length);
      }
      function buildTimeline(preserve = false) {
        const old = timeline?.steps[stepIndex]?.drawDuration || 0;
        const fraction = old ? Math.min(1, elapsed / old) : 0, rest = Math.max(0, elapsed - old);
        // 時計は1倍の時間を持ち、速さを掛けた経過を足す。速さを変えても進み具合は変わらない。
        timeline = explain.buildTimeline(steps, board.scene, scene.trace(board.scene), scene.handles(board.scene), {
          rate: 1, ...(settings.voice ? { clipSeconds: steps.map((_, index) => stepSeconds(index)) } :
            { readMs: steps.map(step => explain.readMs(step.lines[settings.teacher])) }),
        });
        if (reduced) {
          let total = 0;
          timeline.steps.forEach((step, index) => {
            const voiceDuration = step.duration - config.explain.gapMs;
            step.parts.forEach((part, index) => { part.start = index; part.duration = 1; });
            step.drawDuration = step.parts.length;
            step.duration = Math.max(step.drawDuration, settings.voice ? voiceDuration : explain.readMs(steps[index].lines[settings.teacher])) + config.explain.gapMs;
            step.start = total; total += step.duration;
          });
          timeline.total = total;
        }
        if (preserve) {
          const next = timeline.steps[stepIndex].drawDuration * fraction + rest;
          voiceEndTime += next - elapsed; elapsed = next;
        }
      }
      function syncTime() {
        const time = now();
        if (mode === 'explain' && !paused) elapsed += Math.max(0, time - lastTime) * settings.rate;
        lastTime = time;
      }
      function cancelSoundWait() { soundVersion++; soundWaiting = false; }
      function stopVoice() { cancelSoundWait(); playVersion++; player.stop(); voiceDone = true; voiceEndTime = elapsed; }
      function stopFrame() { if (frameId !== null) win.cancelAnimationFrame(frameId); frameId = null; }
      function schedule() {
        if (!disposed && mode === 'explain' && !paused && frameId === null) frameId = win.requestAnimationFrame(tick);
      }
      function updateDrawing(hidePen = false) {
        const state = { ...explain.stateAt(timeline, stepIndex, elapsed), paused, hidePen };
        view.setState(state);
        return state;
      }
      function tick() {
        frameId = null;
        if (disposed || mode !== 'explain' || paused) return;
        syncTime();
        const state = updateDrawing();
        const reading = settings.voice ? 0 : explain.readMs(steps[stepIndex].lines[settings.teacher]);
        if (state.stepDone && voiceDone && elapsed >= Math.max(timeline.steps[stepIndex].drawDuration, voiceEndTime, reading) + config.explain.gapMs) {
          if (stepIndex + 1 === steps.length) explore(); else enterStep(stepIndex + 1);
        }
        schedule();
      }
      function playStep() {
        stopVoice();
        if (!settings.voice) { voiceEndTime = 0; return; }
        voiceDone = false;
        const version = playVersion;
        player.play(stepIndex, stepSeconds(stepIndex), settings.rate, () => {
          if (disposed || mode !== 'explain' || version !== playVersion) return;
          syncTime(); voiceDone = true; voiceEndTime = elapsed;
        });
        if (paused) player.pause();
      }
      function updateButtons() {
        back.disabled = stepIndex === 0;
        play.textContent = paused ? '▶ 再生' : '⏸ 止める';
        rateText.textContent = settings.rate + ' 倍';
        slower.disabled = settings.rate === voice.RATES[0]; faster.disabled = settings.rate === voice.RATES[voice.RATES.length - 1];
        sound.textContent = soundWaiting ? '🔊 準備中…' : settings.voice ? '🔊 音声オン' : '🔇 音声オフ';
        sound.disabled = soundWaiting; sound.setAttribute('aria-pressed', String(settings.voice));
        withVoice.className = 'btn' + (settings.voice ? ' main' : '');
        withoutVoice.className = 'btn' + (settings.voice ? '' : ' main');
        withVoice.disabled = preparation === 'loading';
        withVoice.textContent = preparation === 'loading' ? '🔊 準備中…' : '🔊 音声ありで見る';
      }
      function updateMode() {
        paper.className = 'board' + (mode === 'start' ? ' choosing' : '');
        startScreen.hidden = mode !== 'start'; speech.hidden = mode === 'invalid';
        transport.hidden = mode !== 'explain'; history.hidden = mode !== 'explain';
        after.hidden = mode !== 'explore' && mode !== 'invalid'; replay.hidden = mode !== 'explore';
        instruction.hidden = mode !== 'explore'; notes.hidden = mode !== 'explore';
        updateReadoutVisibility();
        updateButtons();
      }
      function showWords() {
        const teacher = scripts.TEACHERS.find(teacher => teacher.id === settings.teacher);
        face.src = teacher.image; face.alt = teacher.name;
        const words = steps[stepIndex].lines[settings.teacher];
        const sentence = element('span', 'sentence');
        let end = 0;
        for (const match of words.matchAll(/「([^「」]*)」/g)) {
          element('span', '', words.slice(end, match.index) + '「', sentence);
          element('mark', 'term', match[1], sentence);
          element('span', '', '」', sentence);
          end = match.index + match[0].length;
        }
        element('span', '', words.slice(end), sentence);
        speechText.replaceChildren(sentence);
        if (historyTeacher !== settings.teacher) { lines.replaceChildren(); historyTeacher = settings.teacher; }
        while (lines.children.length > stepIndex + 1) lines.children[lines.children.length - 1].remove();
        for (let index = lines.children.length; index <= stepIndex; index++) {
          element('li', '', steps[index].lines[settings.teacher], lines);
        }
        Array.from(lines.children).forEach((line, index) => { line.className = index === stepIndex ? 'current' : ''; });
        dotNodes.forEach((dot, index) => { dot.className = index < stepIndex ? 'done' : index === stepIndex ? 'now' : ''; });
        updateReadoutVisibility();
      }
      function enterStep(index) {
        if (mode !== 'explain') return;
        stopVoice(); stepIndex = index; elapsed = 0; voiceEndTime = 0; lastTime = now();
        showWords(); updateButtons(); updateDrawing(paused);
        if (preparation === 'ready') playStep(); else voiceDone = !settings.voice;
        schedule();
      }
      function problemNotice(problem) {
        if (disposed || mode !== 'explain') return;
        syncTime(); stopVoice(); settings.voice = false; save();
        buildTimeline(true);
        message.textContent = problem === 'blocked' ? 'この画面では音を出せませんでした。文字だけで続けます。' :
          '音声を読みこめませんでした。文字だけで続けます。';
        message.hidden = false; updateButtons();
      }
      function prepare() {
        const version = ++prepareVersion, soundRequest = soundVersion, teacher = settings.teacher;
        preparation = 'loading'; preparedTeacher = teacher; updateButtons();
        pendingPreparation = player.prepare(clips().map(clip => voiceData.BASE + clip[0])).then(result => {
          if (disposed || version !== prepareVersion || teacher !== settings.teacher) return false;
          // 準備の結果は同じ盤・先生で共有し、古い操作から画面は更新しない。
          preparation = result.ok ? 'ready' : 'failed';
          if (soundRequest === soundVersion) updateButtons();
          return result.ok;
        });
        return pendingPreparation;
      }
      function chooseTeacher(id) {
        if (mode !== 'start') return;
        const changed = settings.teacher !== id;
        if (changed) cancelSoundWait();
        settings.teacher = id; chosenTeacher = true; save();
        const teacher = scripts.TEACHERS.find(teacher => teacher.id === id);
        teacherNodes.forEach((choice, index) => {
          const checked = scripts.TEACHERS[index].id === id;
          choice.setAttribute('aria-checked', String(checked)); choice.tabIndex = checked ? 0 : -1;
        });
        chosen.textContent = teacher.name + 'が、描きながら説明するよ。';
        showWords();
        if (changed || preparation === 'idle' || preparedTeacher !== id) prepare();
      }
      function begin(useVoice) {
        if (mode !== 'start' || (useVoice && preparation === 'loading')) return;
        settings.voice = useVoice; save(); message.hidden = true;
        mode = 'explain'; paused = false; stepIndex = 0; elapsed = 0;
        buildTimeline(); updateMode();
        // 音声なしでも開始画面で始めた準備は続ける。再生はこのクリックの中で行う。
        enterStep(0);
        if (useVoice && preparation !== 'ready') problemNotice('load');
        play.focus({ preventScroll: true });
      }
      function setPaused(value) {
        if (mode !== 'explain') return;
        syncTime(); paused = value;
        if (paused) { cancelSoundWait(); stopFrame(); player.pause(); } else { lastTime = now(); player.resume(); schedule(); }
        updateDrawing();
        updateButtons();
      }
      function changeRate(direction) {
        syncTime(); settings.rate = voice.stepRate(settings.rate, direction); save();
        player.setRate(settings.rate); updateButtons();
      }
      function toggleSound() {
        if (mode !== 'explain' || soundWaiting) return;
        syncTime(); stopVoice();
        if (settings.voice) {
          settings.voice = false; save(); buildTimeline(true); updateButtons(); return;
        }
        message.hidden = true;
        if (preparation === 'ready') {
          settings.voice = true; save(); buildTimeline(true); updateButtons(); playStep(); return;
        }
        if (preparation === 'failed') { problemNotice('load'); return; }
        const pending = preparation === 'loading' ? pendingPreparation : prepare(), version = soundVersion;
        soundWaiting = true; updateButtons();
        pending.then(ok => {
          if (disposed || mode !== 'explain' || version !== soundVersion) return;
          soundWaiting = false;
          if (ok) updateButtons(); else problemNotice('load');
        });
      }
      function next() {
        if (mode !== 'explain') return;
        syncTime();
        const target = explain.nextTarget(stepIndex, elapsed >= timeline.steps[stepIndex].drawDuration, steps.length);
        stopVoice();
        updateButtons();
        if (target.action === 'end') explore();
        else if (target.action === 'go') enterStep(target.stepIndex);
        else {
          elapsed = timeline.steps[stepIndex].drawDuration; voiceEndTime = elapsed;
          updateDrawing();
        }
      }
      function explore() {
        if (disposed || mode === 'invalid') return;
        stopFrame(); stopVoice(); mode = 'explore'; stepIndex = steps.length - 1;
        showWords(); updateMode(); view.setState(null); replay.focus({ preventScroll: true });
      }
      function restart() {
        stopFrame(); stopVoice(); prepareVersion++; player.release(); preparation = 'idle';
        mode = 'start'; paused = false; stepIndex = 0; elapsed = 0; message.hidden = true;
        // 向き・物質も初期配置に戻してから時間割を作り直す。
        board.scene = boards.get(board.id).scene;
        if (scene.validateScene(board.scene).length) mode = 'invalid';
        if (mode === 'start') { buildTimeline(); view.setState({ ...explain.finalState(timeline), hidePen: true }); chooseTeacher(settings.teacher); }
        else view.setState(null);
        updateMode();
        if (mode === 'start') teacherNodes[scripts.TEACHERS.findIndex(teacher => teacher.id === settings.teacher)].focus();
      }
      const visibility = () => { if (doc.hidden && mode === 'explain') setPaused(true); };
      doc.addEventListener('visibilitychange', visibility);
      closeExplanation = () => {
        if (disposed) return;
        disposed = true; stopFrame(); stopVoice(); prepareVersion++; player.release();
        doc.removeEventListener('visibilitychange', visibility);
      };
      function updateReadoutVisibility() {
        const angleStep = steps.findIndex(step => step.draw.some(token => token.startsWith('angle:')));
        const labelStep = steps.findIndex(step => step.draw.some(token => token.startsWith('label:') || token === 'distance'));
        const forceToken = { 'force-spring': 'label:force', 'force-arrow': 'magnitude', 'force-balance': 'label:state' }[board.id];
        const first = board.id.startsWith('bio-') ? steps.length - 2 : forceToken ? steps.findIndex(step => step.draw.includes(forceToken)) :
          angleStep >= 0 ? angleStep : labelStep >= 0 ? labelStep : steps.length - 1;
        const hidden = invalidScene || mode === 'start' || (mode === 'explain' && stepIndex < first);
        if (readout.hidden !== hidden) readout.hidden = hidden;
      }
      // 初回も操作・サイズ変更のたびも、表示や判定に先立って検査する。
      function validate(current) {
        const errors = scene.validateScene(current);
        invalidScene = errors.length > 0; updateReadoutVisibility();
        if (errors.length) {
          readout.replaceChildren(); readoutKey = null; notes.replaceChildren();
          controls.hidden = true; controls.replaceChildren(); controlNodes.clear();
        }
        return errors;
      }
      function update(result) {
        const values = boards.readout(board.id, result.measures, board.scene);
        const key = JSON.stringify(values);
        if (readoutKey !== key) {
          readout.replaceChildren();
          values.forEach((item, index) => element('span', board.id === 'force-balance' && index === 2 ?
            (result.measures.state === 'balanced' ? 'balanced' : 'out') : item.tone, item.text, readout));
          readoutKey = key;
        }
        const visibleNotes = result.notes.filter(note => !values.some(item => item.text === note));
        if (notes.textContent !== visibleNotes.join('')) {
          notes.replaceChildren(); visibleNotes.forEach(note => element('p', '', note, notes));
        }
        if (mode !== 'explore' && mode !== 'invalid') { controls.hidden = true; return; }
        board.prompts.forEach(prompt => {
          if (completed.has(prompt.id) || !boards.checkPrompt(prompt, result.measures, board.scene)) return;
          completed.add(prompt.id);
          const item = promptNodes.get(prompt.id);
          item.row.classList.add('done'); item.check.textContent = '✓'; item.text.textContent = prompt.text + ' できた！';
        });
        const currentControls = board.controls;
        controls.hidden = !currentControls.length;
        if (!controlNodes.size) currentControls.forEach(control => {
          const group = element('div', 'seg', undefined, controls);
          group.setAttribute('role', 'group');
          group.setAttribute('aria-label', control.label || { direction: '光の進む向き', medium: '物質', thickness: '弦の太さ', tension: '弦の張り',
            weights: 'おもりの数', spring: 'ばね', line: '2 つの力' }[control.key]);
          if (control.label) element('span', 'seg-name', group.getAttribute('aria-label'), group);
          if (board.id.startsWith('bio-')) {
            const reason = element('span', 'seg-reason', '', group);
            reason.id = board.id + '-' + control.key + '-reason';
            controlNodes.set(control.key + ':reason', reason);
          }
          control.choices.forEach(choice => {
            const el = button('', choice.label, group, () => view.setScene(scene.setOption(board.scene, control.key, choice.value)));
            controlNodes.set(control.key + ':' + choice.value, el);
          });
        });
        currentControls.forEach(control => {
          const reason = controlNodes.get(control.key + ':reason');
          if (reason) { reason.textContent = control.reason; reason.hidden = !control.reason; }
          control.choices.forEach(choice => {
          const el = controlNodes.get(control.key + ':' + choice.value);
          const selected = board.scene.options[control.key] === choice.value;
          el.textContent = (control.label && selected ? '✓ ' : '') + choice.label;
          el.setAttribute('aria-pressed', String(selected));
          el.disabled = control.enabled === false;
          if (reason && control.reason) el.setAttribute('aria-describedby', reason.id);
          else el.removeAttribute('aria-describedby');
        }); });
      }
      if (mode === 'start') buildTimeline();
      view = boardView.create(stage, board, update, validate, mode === 'start' ? explain.finalState(timeline) : null);
      updateMode();
      if (mode === 'start') chooseTeacher(settings.teacher);
    }
    function render(focus = false) {
      closeExplanation();
      if (view) { view.destroy(); view = null; }
      host.replaceChildren();
      const parsed = entry.parseBoardParam(win.location.search, ids);
      const board = parsed.boardId ? boards.get(parsed.boardId) : null;
      const frame = element('div', 'frame', undefined, host);
      header(frame, board);
      doc.title = board ? board.title + ' | ひかりボード' : 'ひかりボード';
      if (board) openBoard(frame, board); else home(frame, parsed.error);
      if (focus) { heading.focus({ preventScroll: true }); win.scrollTo(0, 0); }
    }
    const popstate = () => render(true);
    win.addEventListener('popstate', popstate);
    win.addEventListener('online', updateConnection);
    win.addEventListener('offline', updateConnection);
    render(); registerWorker(win);
    return { destroy() {
      closeExplanation();
      if (view) view.destroy();
      win.removeEventListener('popstate', popstate);
      win.removeEventListener('online', updateConnection);
      win.removeEventListener('offline', updateConnection);
      host.replaceChildren();
    } };
  }

  const api = { start, registerWorker };
  if (node) module.exports = api;
  else {
    root.Hikari = Object.assign(root.Hikari || {}, { app: api });
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(document.getElementById('app')), { once: true });
      else start(document.getElementById('app'));
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
