/* hMines — 地雷を避けてマスを開けていくパズル（id: hmines）
   左クリック（タップ）で開く、右クリック（長押し）で旗。数字は、まわり 8 マスにある地雷の数。
   開いた数字を押すと、旗の数が合っていれば、まわりの残りのマスをまとめて開く。
   最初に開くマスとそのまわりには、地雷を置かない。いちばん速い記録は ~/.config/hmines.json に保存する。 */
(function () {
  const OS = window.OS, h = OS.h, ui = OS.ui;
  const LEVELS = {
    easy: { name: '初級', w: 9, h: 9, n: 10 },
    normal: { name: '中級', w: 16, h: 16, n: 40 },
    hard: { name: '上級', w: 30, h: 16, n: 99 }
  };
  OS.registerApp({
    id: 'hmines', name: 'hMines', icon: 'mine', color: '#5a7d2a', desc: '地雷を避けてマスを開けるパズル',
    launch() {
      const cfgPath = OS.users.home(OS.htui.user) + '/.config/hmines.json';
      const loadCfg = () => { try { return JSON.parse(OS.htui.fs.read(cfgPath)); } catch (e) { return {}; } };
      const saveCfg = c => { try { OS.htui.fs.write(cfgPath, JSON.stringify(c, null, 1)); } catch (e) { /* 保存できなくても遊べる */ } };
      let cfg = loadCfg(), level = LEVELS[cfg.level] ? cfg.level : 'easy';
      const win = OS.htui.open({ title: 'hMines', icon: 'mine', w: level === 'hard' ? 900 : level === 'normal' ? 600 : 470, h: level === 'easy' ? 520 : 640, app: 'hmines' });
      // 盤の状態: mine（地雷）/ n（まわりの地雷の数）/ open / flag
      let W, H, N, cells, opened, flags, state, t0, tick = 0, cursor = 0, flagMode = false;

      const sel = h('select', { class: 'sel', id: 'mn-level-' + win.pid, 'aria-label': '難しさ', onchange: () => { level = sel.value; cfg.level = level; saveCfg(cfg); newGame(); } },
        Object.keys(LEVELS).map(k => h('option', { value: k, selected: k === level }, LEVELS[k].name + '（' + LEVELS[k].w + '×' + LEVELS[k].h + '・' + LEVELS[k].n + '個）')));
      const left = h('b', { class: 'mn-num' }), time = h('b', { class: 'mn-num' });
      const face = h('button', { class: 'btn mn-new', type: 'button', title: '新しいゲーム（F2）', onclick: () => newGame() }, OS.icon('reload', 16), '新しいゲーム');
      const flagBtn = h('button', { class: 'tbtn mn-flagmode', type: 'button', title: 'オンにすると、タップで旗を立てる', 'aria-pressed': 'false', onclick: () => { flagMode = !flagMode; flagBtn.classList.toggle('on', flagMode); flagBtn.setAttribute('aria-pressed', String(flagMode)); } }, OS.icon('flag', 16), '旗モード');
      const board = h('div', { class: 'mn-board', role: 'grid', 'aria-label': '盤' });
      const msg = h('div', { class: 'mn-msg', role: 'status' });
      const stage = h('div', { class: 'mn-stage' }, board, msg);
      const best = h('span', { class: 'grow' });
      win.body.append(h('div', { class: 'mn' },
        h('div', { class: 'toolbar mn-bar' }, sel, h('span', { class: 'mn-stat', title: '残りの地雷（地雷の数 − 旗の数）' }, OS.icon('mine', 16), left), h('span', { class: 'mn-stat', title: '経過時間' }, '⏱', time), h('span', { class: 'grow' }), flagBtn, face),
        stage, h('div', { class: 'statusbar' }, best, h('span', null, '右クリック・長押し: 旗'))));

      const nb = i => { const x = i % W, y = (i / W) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) r.push(Y * W + X); } return r; };
      function newGame() {
        const L = LEVELS[level]; W = L.w; H = L.h; N = L.n;
        cells = Array.from({ length: W * H }, () => ({ mine: false, n: 0, open: false, flag: false }));
        opened = 0; flags = 0; state = 'ready'; t0 = 0; cursor = Math.min(cursor, W * H - 1);
        clearInterval(tick); tick = 0;
        msg.className = 'mn-msg'; msg.textContent = '';
        board.textContent = '';
        board.style.gridTemplateColumns = 'repeat(' + W + ', var(--cs))';
        cells.forEach((c, i) => {
          const b = h('button', { class: 'mn-cell', type: 'button', role: 'gridcell', tabindex: i === cursor ? '0' : '-1', 'aria-label': ((i % W) + 1) + '列 ' + (((i / W) | 0) + 1) + '行 未開封' });
          b.dataset.i = i; c.el = b; board.append(b);
        });
        fit(); paintStat(); paintBest();
      }
      // 最初に開いたマス i とそのまわりを避けて地雷を置く
      function plant(i) {
        const safe = new Set([i].concat(nb(i))), spots = [];
        for (let k = 0; k < cells.length; k++) if (!safe.has(k)) spots.push(k);
        for (let k = 0; k < N && spots.length; k++) { const j = Math.floor(Math.random() * spots.length); cells[spots[j]].mine = true; spots[j] = spots[spots.length - 1]; spots.pop(); }
        cells.forEach((c, k) => { c.n = nb(k).filter(j => cells[j].mine).length; });
        state = 'play'; t0 = Date.now();
        tick = setInterval(paintStat, 250);
      }
      function paint(i) {
        const c = cells[i], b = c.el, pos = ((i % W) + 1) + '列 ' + (((i / W) | 0) + 1) + '行 ';
        b.className = 'mn-cell' + (c.open ? ' open' : '') + (c.flag ? ' flag' : '') + (c.open && !c.mine && c.n ? ' n' + c.n : '');
        b.textContent = '';
        if (c.open && c.mine) { b.append(OS.icon('mine', 18)); b.setAttribute('aria-label', pos + '地雷'); }
        else if (c.flag) { b.append(OS.icon('flag', 16)); b.setAttribute('aria-label', pos + '旗'); }
        else if (c.open) { if (c.n) b.textContent = c.n; b.setAttribute('aria-label', pos + (c.n ? 'まわりの地雷 ' + c.n : '空き')); }
        else b.setAttribute('aria-label', pos + '未開封');
      }
      function reveal(i) {
        if (state === 'ready') plant(i);
        if (state !== 'play') return;
        const stack = [i];
        while (stack.length) {
          const k = stack.pop(), c = cells[k];
          if (c.open || c.flag) continue;
          c.open = true; paint(k);
          if (c.mine) { lose(k); return; }
          opened++;
          if (!c.n) nb(k).forEach(j => { if (!cells[j].open) stack.push(j); });
        }
        if (opened === W * H - N) win_();
      }
      // 開いた数字を押す: まわりの旗の数が数字と同じなら、旗のないマスを全部開く
      function chord(i) {
        const c = cells[i]; if (!c.open || !c.n || state !== 'play') return;
        const ns = nb(i);
        if (ns.filter(j => cells[j].flag).length !== c.n) { ns.forEach(j => { const e = cells[j]; if (!e.open && !e.flag) { e.el.classList.add('hint'); setTimeout(() => e.el.classList.remove('hint'), 180); } }); return; }
        ns.forEach(j => { if (state === 'play' && !cells[j].open && !cells[j].flag) reveal(j); });
      }
      function toggleFlag(i) {
        const c = cells[i]; if (c.open || (state !== 'play' && state !== 'ready')) return;
        c.flag = !c.flag; flags += c.flag ? 1 : -1; paint(i); paintStat();
      }
      function act(i, flagIt) {
        if (state === 'won' || state === 'lost') return;
        const c = cells[i];
        if (flagIt) toggleFlag(i);
        else if (c.open) chord(i);
        else if (!c.flag) reveal(i);
      }
      function lose(k) {
        state = 'lost'; clearInterval(tick); paintStat();
        cells.forEach((c, i) => {
          if (c.mine && !c.flag && !c.open) { c.open = true; paint(i); }
          else if (!c.mine && c.flag) { c.el.classList.add('wrong'); c.el.setAttribute('aria-label', c.el.getAttribute('aria-label') + '（まちがい）'); }
        });
        cells[k].el.classList.add('boom');
        msg.className = 'mn-msg on lost';
        msg.textContent = '';
        msg.append(h('b', null, '地雷を開けてしまいました'), h('button', { class: 'btn primary', type: 'button', onclick: () => newGame() }, 'もう一度'));
      }
      function win_() {
        state = 'won'; clearInterval(tick);
        const sec = (Date.now() - t0) / 1000;
        cells.forEach((c, i) => { if (c.mine && !c.flag) { c.flag = true; paint(i); } });
        flags = N; paintStat(sec);
        const bests = cfg.best || {}, prev = bests[level], rec = prev == null || sec < prev;
        if (rec) { bests[level] = Math.round(sec * 10) / 10; cfg.best = bests; saveCfg(cfg); paintBest(); }
        msg.className = 'mn-msg on won';
        msg.textContent = '';
        msg.append(h('b', null, 'クリア！ ' + sec.toFixed(1) + ' 秒'), rec ? h('small', null, LEVELS[level].name + 'の新記録です') : h('small', null, 'これまでの記録: ' + prev + ' 秒'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => newGame() }, 'もう一度'));
        if (rec) OS.notify({ app: 'hMines', icon: 'mine', title: LEVELS[level].name + 'の新記録', body: sec.toFixed(1) + ' 秒でクリアしました' });
      }
      function paintStat(sec) {
        left.textContent = String(N - flags);
        const s = typeof sec === 'number' ? sec : state === 'play' ? (Date.now() - t0) / 1000 : state === 'ready' ? 0 : null;
        if (s != null) time.textContent = String(Math.min(999, Math.floor(s)));
      }
      function paintBest() {
        const b = cfg.best || {};
        best.textContent = '記録: ' + Object.keys(LEVELS).map(k => LEVELS[k].name + ' ' + (b[k] != null ? b[k] + ' 秒' : '—')).join('　');
      }
      // ウィンドウの大きさに合わせてマスの大きさを決める
      function fit() {
        const r = stage.getBoundingClientRect();
        if (!r.width || !W) return;
        const cs = Math.max(18, Math.min(44, Math.floor(Math.min((r.width - 24) / W, (r.height - 24) / H))));
        board.style.setProperty('--cs', cs + 'px');
        board.style.fontSize = Math.round(cs * 0.55) + 'px';
      }
      if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(stage); win.onDispose = () => { ro.disconnect(); clearInterval(tick); }; }
      else win.onDispose = () => clearInterval(tick);

      // マウス・タッチ。長押し（約 0.4 秒）で旗
      let press = null;
      const cellOf = e => { const b = e.target.closest('.mn-cell'); return b && board.contains(b) ? Number(b.dataset.i) : -1; };
      board.addEventListener('contextmenu', e => {
        e.preventDefault(); const i = cellOf(e); if (i < 0) return;
        if (press) { clearTimeout(press.t); if (press.long) return; press.long = true; } // タッチの長押しで来たときは 1 回だけ
        act(i, true);
      });
      board.addEventListener('pointerdown', e => {
        const i = cellOf(e); if (i < 0 || e.button !== 0) return;
        focusCell(i);
        press = { i: i, long: false, t: e.pointerType === 'mouse' ? 0 : setTimeout(() => { press.long = true; act(i, true); if (navigator.vibrate) navigator.vibrate(20); }, 400) };
      });
      const cancelPress = () => { if (press) clearTimeout(press.t); };
      board.addEventListener('pointerleave', () => { cancelPress(); press = null; });
      board.addEventListener('pointercancel', () => { cancelPress(); press = null; });
      board.addEventListener('click', e => {
        const i = cellOf(e); if (i < 0) return;
        const p = press; cancelPress(); press = null;
        if (p && p.long) return; // 長押しで旗を立てた
        act(i, flagMode || e.shiftKey);
      });
      // キーボード: 矢印で移動、Enter / Space で開く、F で旗、F2 で新しいゲーム
      function focusCell(i) {
        if (!cells[cursor]) cursor = 0;
        cells[cursor].el.tabIndex = -1; cursor = i; cells[i].el.tabIndex = 0;
      }
      board.addEventListener('keydown', e => {
        const i = cellOf(e); if (i < 0) return;
        const x = i % W, y = (i / W) | 0, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (mv) { e.preventDefault(); const X = Math.max(0, Math.min(W - 1, x + mv[0])), Y = Math.max(0, Math.min(H - 1, y + mv[1])); focusCell(Y * W + X); cells[cursor].el.focus(); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); act(i, true); }
      });
      win.el.addEventListener('keydown', e => { if (e.key === 'F2') { e.preventDefault(); newGame(); } });
      win.onFocus = () => { if (cells && cells[cursor]) cells[cursor].el.focus({ preventScroll: true }); };

      newGame();
      setTimeout(fit, 0);
      return win;
    }
  });
})();
