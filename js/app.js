// ホームと盤を切り替え、通信状態・課題の達成を表示する。
// 配置や達成は画面を開いている間だけ保持し、端末には保存しない。
(function (root) {
  'use strict';

  const node = typeof module === 'object' && module.exports;
  const boards = node ? require('./boards.js') : root.Hikari.boards;
  const scene = node ? require('./scene.js') : root.Hikari.scene;
  const entry = node ? require('./entry.js') : root.Hikari.entry;
  const boardView = node ? require('./board-view.js') : root.Hikari.boardView;
  const instructions = {
    straight: 'オレンジの丸（光源）と白い丸（ついたて）は指で動かせるよ。',
    reflect: 'オレンジの丸（光源）を動かしたり、白い丸で鏡をかたむけたりできるよ。',
    'mirror-image': '白い丸で物体や見る人を動かし、像の位置を確かめよう。',
    refract: 'オレンジの丸（光源）は指で動かせるよ。下の切り替えもためそう。',
    lens: 'オレンジの丸で光源の高さを、白い丸で焦点距離を変えられるよ。',
    'lens-image': '白い丸で物体やスクリーンを左右に動かせるよ。',
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
    let view = null, connection = null, heading = null;
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
      element('p', 'lead', '光源・鏡・レンズを指で動かすと、光の道すじがその場で変わります。', main);
      if (error) element('p', 'notice', '指定された盤が見つかりませんでした', main).setAttribute('role', 'status');
      const list = element('section', 'list', undefined, main);
      element('h2', '', '中 1 光の世界 ― ボードをえらぶ', list);
      all.forEach(board => {
        const row = button('row', undefined, list, () => navigate(board.id));
        element('span', 'name', board.title, row);
        element('span', 'question', board.question, row);
        element('span', 'arrow', '→', row).setAttribute('aria-hidden', 'true');
      });
      element('p', 'foot', '一度開けば、通信がなくても使えます。', main);
    }
    function openBoard(frame, board) {
      const completed = new Set(), promptNodes = new Map(), controlNodes = new Map();
      const learn = element('div', 'learn', undefined, frame);
      const paper = element('section', 'board', undefined, learn);
      const boardHeading = element('h2', 'board-heading', undefined, paper);
      element('span', '', board.heading, boardHeading);
      const stage = element('div', 'board-stage', undefined, paper);
      const cap = element('div', 'cap', undefined, paper);
      const readout = element('div', 'readout', undefined, cap);
      element('span', '', instructions[board.id], cap);
      const notes = element('div', 'notes', undefined, cap); notes.setAttribute('role', 'status');
      const panel = element('aside', 'panel', undefined, learn); panel.setAttribute('aria-label', '先生の案内とためしてみよう');
      const say = element('div', 'say', undefined, panel);
      const mascot = element('img', '', undefined, say);
      mascot.src = 'assets/mascots/mascot_E.svg'; mascot.alt = 'キューブ先生'; mascot.width = 48; mascot.height = 48;
      element('p', '', board.intro, say);
      element('h2', 'crumb', 'ためしてみよう', panel);
      const prompts = element('ul', 'prompts', undefined, panel); prompts.setAttribute('aria-live', 'polite');
      board.prompts.forEach(prompt => {
        const row = element('li', 'try', undefined, prompts);
        const check = element('span', 'box', '□', row);
        const text = element('span', '', prompt.text, row);
        promptNodes.set(prompt.id, { row, check, text });
      });
      const controls = element('div', 'controls', undefined, panel);
      controls.hidden = true;
      element('div', 'ask', '先生への質問は準備中です（今は使えません）', panel);
      button('reset', 'はじめの配置にもどす', panel, () => view.setScene(boards.get(board.id).scene));
      // 初回も操作・サイズ変更のたびも、表示や判定に先立って検査する。
      function validate(current) {
        const errors = scene.validateScene(current);
        readout.hidden = errors.length > 0;
        if (errors.length) {
          readout.replaceChildren(); notes.replaceChildren();
          controls.hidden = true; controls.replaceChildren(); controlNodes.clear();
        }
        return errors;
      }
      function update(result) {
        readout.replaceChildren();
        const values = boards.readout(board.id, result.measures, board.scene);
        values.forEach(item => element('span', item.tone, item.text, readout));
        const visibleNotes = result.notes.filter(note => !values.some(item => item.text === note));
        if (notes.textContent !== visibleNotes.join('')) {
          notes.replaceChildren(); visibleNotes.forEach(note => element('p', '', note, notes));
        }
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
          group.setAttribute('aria-label', control.key === 'direction' ? '光の進む向き' : '物質');
          control.choices.forEach(choice => {
            const el = button('', choice.label, group, () => view.setScene(scene.setOption(board.scene, control.key, choice.value)));
            controlNodes.set(control.key + ':' + choice.value, el);
          });
        });
        currentControls.forEach(control => control.choices.forEach(choice => {
          const el = controlNodes.get(control.key + ':' + choice.value);
          el.textContent = choice.label;
          el.setAttribute('aria-pressed', String(board.scene.options[control.key] === choice.value));
        }));
      }
      view = boardView.create(stage, board, update, validate);
    }
    function render(focus = false) {
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
