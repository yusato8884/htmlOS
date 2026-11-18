/* hReversi — リバーシ。CPU と対戦・二人で対戦
   CPU: やさしい（ほぼ適当）・ふつう（場所の価値）・つよい（場所の価値・打てる手の数・確定しやすい石を見て 4 手先まで読む） */
(function () {
  const OS = window.OS, h = OS.h, ui = OS.ui;
  const CFG = '/.config/hreversi.json';
  const N = 8, DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  // 場所の価値（角は高く、角の隣は低い）
  const W = [
    120, -20, 20, 5, 5, 20, -20, 120,
    -20, -40, -5, -5, -5, -5, -40, -20,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -20, -40, -5, -5, -5, -5, -40, -20,
    120, -20, 20, 5, 5, 20, -20, 120];
  function flips(b, i, p) {
    if (b[i]) return [];
    const r = (i / N) | 0, c = i % N, o = -p, out = [];
    for (const [dr, dc] of DIRS) {
      let rr = r + dr, cc = c + dc; const run = [];
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === o) { run.push(rr * N + cc); rr += dr; cc += dc; }
      if (run.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === p) out.push(...run);
    }
    return out;
  }
  const moves = (b, p) => { const m = []; for (let i = 0; i < 64; i++) if (!b[i] && flips(b, i, p).length) m.push(i); return m; };
  const apply = (b, i, p) => { const f = flips(b, i, p), nb = b.slice(); nb[i] = p; f.forEach(j => { nb[j] = p; }); return nb; };
  const count = (b, p) => b.reduce((s, v) => s + (v === p ? 1 : 0), 0);
  function evalBoard(b, me) {
    const empty = b.filter(v => !v).length;
    if (empty === 0) return (count(b, me) - count(b, -me)) * 1000;
    let pos = 0;
    for (let i = 0; i < 64; i++) if (b[i]) pos += b[i] === me ? W[i] : -W[i];
    const mob = moves(b, me).length - moves(b, -me).length;
    const disc = count(b, me) - count(b, -me);
    return pos + mob * 8 + (empty < 14 ? disc * 6 : 0);
  }
  function search(b, p, me, depth, alpha, beta) {
    const ms = moves(b, p);
    if (depth === 0) return evalBoard(b, me);
    if (!ms.length) {
      if (!moves(b, -p).length) return evalBoard(b.map(v => v), me) + (count(b, me) - count(b, -me)) * 1000;
      return search(b, -p, me, depth - 1, alpha, beta);
    }
    ms.sort((a, c) => W[c] - W[a]);
    if (p === me) { let v = -Infinity; for (const i of ms) { v = Math.max(v, search(apply(b, i, p), -p, me, depth - 1, alpha, beta)); alpha = Math.max(alpha, v); if (beta <= alpha) break; } return v; }
    let v = Infinity; for (const i of ms) { v = Math.min(v, search(apply(b, i, p), -p, me, depth - 1, alpha, beta)); beta = Math.min(beta, v); if (beta <= alpha) break; } return v;
  }

  OS.registerApp({
    id: 'hreversi', name: 'hReversi', icon: 'reversi', color: '#26a269', desc: 'リバーシ（CPU・二人で対戦）',
    launch() {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      let cfg = { mode: 'cpu2', level: 'normal', hints: true }; // cpu2 = 自分が黒（先手）、cpu1 = 自分が白、pvp = 二人
      try { cfg = Object.assign(cfg, JSON.parse(fsx.read(home + CFG))); } catch (e) { /* 初回 */ }
      const save = () => { try { fsx.mkdir(home + '/.config', { parents: true }); fsx.write(home + CFG, JSON.stringify(cfg)); } catch (e) { /* 続ける */ } };
      const win = OS.htui.open({ title: 'hReversi', icon: 'reversi', w: 560, h: 660, app: 'hreversi', buttons: [
        { icon: 'reload', label: '新しいゲーム', onclick: () => newGame() },
        { icon: 'back', title: '一手戻す', onclick: () => undo() },
        { icon: 'info', title: '打てる場所を表示', toggle: true, on: cfg.hints, onclick: (e, on) => { cfg.hints = on; save(); paint(); } }
      ] });
      const bar = h('div', { class: 'toolbar' });
      const sel = (id, label, opts, val, on) => { const s = h('select', { class: 'sel', id: id + win.pid, 'aria-label': label, onchange: () => on(s.value) }, opts.map(o => h('option', { value: o[0], selected: o[0] === val }, o[1]))); return s; };
      const board = h('div', { class: 'rv-board', role: 'grid', 'aria-label': '盤' });
      const sB = h('div', { class: 'rv-side b' }), sW = h('div', { class: 'rv-side w' }), status = h('div', { class: 'rv-status', role: 'status' });
      win.body.classList.add('rv-root');
      win.body.append(bar, h('div', { class: 'rv-main' }, h('div', { class: 'rv-score' }, sB, status, sW), h('div', { class: 'rv-wrap' }, board)));
      const cells = [];
      for (let i = 0; i < 64; i++) {
        const c = h('button', { class: 'rv-cell', type: 'button', role: 'gridcell', 'aria-label': 'ABCDEFGH'[i % 8] + (((i / 8) | 0) + 1), onclick: () => play(i, true) }, h('span', { class: 'rv-disc' }));
        cells.push(c); board.append(c);
      }
      let B, turn, hist, over, last, busy = false, flipped = [];
      const human = p => cfg.mode === 'pvp' || (cfg.mode === 'cpu2' ? p === 1 : p === -1);
      const nm = p => (p === 1 ? '黒' : '白') + (cfg.mode === 'pvp' ? '' : human(p) ? '（あなた）' : '（CPU）');

      function paintBar() {
        bar.textContent = '';
        bar.append(sel('rv-mode-', '対戦相手', [['cpu2', 'CPU と（自分が黒・先手）'], ['cpu1', 'CPU と（自分が白・後手）'], ['pvp', '二人で']], cfg.mode, v => { cfg.mode = v; save(); paintBar(); newGame(); }),
          sel('rv-lv-', 'CPU の強さ', [['easy', 'やさしい'], ['normal', 'ふつう'], ['hard', 'つよい']], cfg.level, v => { cfg.level = v; save(); }));
        bar.lastChild.disabled = cfg.mode === 'pvp';
      }
      function newGame() {
        B = new Array(64).fill(0); B[27] = B[36] = -1; B[28] = B[35] = 1;
        turn = 1; hist = []; over = false; last = -1; flipped = []; busy = false;
        paint(); next();
      }
      function paint() {
        const ms = over ? [] : moves(B, turn);
        cells.forEach((c, i) => {
          const v = B[i];
          c.className = 'rv-cell' + (v === 1 ? ' b' : v === -1 ? ' w' : '') + (i === last ? ' last' : '') + (flipped.includes(i) ? ' flip' : '') + (cfg.hints && human(turn) && ms.includes(i) ? ' can' : '');
          c.disabled = over || !!v || !ms.includes(i) || busy || !human(turn);
        });
        sB.textContent = ''; sW.textContent = '';
        sB.append(h('span', { class: 'rv-dot b' }), h('b', null, count(B, 1)), h('small', null, nm(1)));
        sW.append(h('span', { class: 'rv-dot w' }), h('b', null, count(B, -1)), h('small', null, nm(-1)));
        sB.classList.toggle('turn', !over && turn === 1); sW.classList.toggle('turn', !over && turn === -1);
        if (!over) status.textContent = nm(turn) + ' の番' + (busy ? '…' : '');
        win.captionButtons[1].disabled = !hist.length || busy;
      }
      function finish() {
        over = true;
        const b = count(B, 1), w = count(B, -1);
        status.textContent = b === w ? '引き分け（' + b + ' 対 ' + w + '）' : (b > w ? nm(1) : nm(-1)) + ' の勝ち（' + Math.max(b, w) + ' 対 ' + Math.min(b, w) + '）';
        paint();
      }
      function play(i, byHand) {
        if (over || (byHand && (busy || !human(turn)))) return;
        const f = flips(B, i, turn); if (!f.length) return;
        hist.push({ B: B.slice(), turn: turn, last: last });
        B = apply(B, i, turn); last = i; flipped = f;
        turn = -turn;
        if (!moves(B, turn).length) {
          if (!moves(B, -turn).length) { finish(); return; }
          ui.toast(nm(turn) + ' は打てる場所がないのでパスです');
          turn = -turn;
        }
        paint(); next();
      }
      function undo() {
        if (!hist.length || busy) return;
        // CPU と対戦中なら、自分の手番まで戻す
        do { const s = hist.pop(); B = s.B; turn = s.turn; last = s.last; } while (hist.length && !human(turn));
        over = false; flipped = []; paint(); next();
      }
      function next() {
        if (over || human(turn)) return;
        busy = true; paint();
        setTimeout(() => {
          if (win.closed) return;
          const ms = moves(B, turn); let pick = ms[0];
          if (cfg.level === 'easy') pick = Math.random() < 0.7 ? ms[(Math.random() * ms.length) | 0] : ms.slice().sort((a, c) => W[c] - W[a])[0];
          else if (cfg.level === 'normal') { let best = -Infinity; for (const i of ms) { const v = W[i] + flips(B, i, turn).length * 2 + Math.random() * 4; if (v > best) { best = v; pick = i; } } }
          else { const empty = B.filter(v => !v).length, d = empty <= 10 ? 8 : 4; let best = -Infinity; for (const i of ms.slice().sort((a, c) => W[c] - W[a])) { const v = search(apply(B, i, turn), -turn, turn, d - 1, -Infinity, Infinity); if (v > best) { best = v; pick = i; } } }
          busy = false; play(pick, false);
        }, 420);
      }
      board.addEventListener('keydown', e => {
        const i = cells.indexOf(document.activeElement); if (i < 0) return;
        const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key]; if (!mv) return;
        e.preventDefault(); let j = i + mv;
        if (j >= 0 && j < 64 && !(Math.abs(mv) === 1 && ((j / 8) | 0) !== ((i / 8) | 0))) { cells[j].disabled = false; cells[j].focus(); }
      });
      paintBar(); newGame();
      return win;
    }
  });
})();
