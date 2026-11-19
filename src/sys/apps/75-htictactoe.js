/* hTic-tac-toe — 三目並べ。CPU と対戦・二人で対戦。マスの数（3〜9）と、何個並べたら勝ちか（3〜マスの数）を変えられる
   CPU: やさしい（ときどき適当）・ふつう（勝てる手・止める手・よい場所）・つよい（3×3 は読み切り、大きい盤は先読みつきの評価） */
(function () {
  const OS = window.OS, h = OS.h, ui = OS.ui;
  const CFG = '/.config/htictactoe.json';
  OS.registerApp({
    id: 'htictactoe', name: 'hTic-tac-toe', icon: 'ttt', color: '#e66100', desc: '三目並べ（CPU・二人で対戦、マスの数を変えられる）',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      let cfg = { n: 3, k: 3, mode: 'cpu2', level: 'normal' }; // mode: cpu2 = 自分が先手（×）、cpu1 = CPU が先手、pvp = 二人
      try { cfg = Object.assign(cfg, JSON.parse(fsx.read(home + CFG))); } catch (e) { /* 初回 */ }
      const save = () => { try { fsx.mkdir(home + '/.config', { parents: true }); fsx.write(home + CFG, JSON.stringify(cfg)); } catch (e) { /* 保存できなくても続ける */ } };
      const score = { X: 0, O: 0, draw: 0 };
      const win = OS.htui.open({ title: 'hTic-tac-toe', icon: 'ttt', w: 520, h: 600, app: 'htictactoe', buttons: [
        { icon: 'reload', label: '新しいゲーム', onclick: () => newGame() },
        { icon: 'gear', title: '盤の大きさと対戦相手', onclick: () => settings() }
      ] });
      const status = h('div', { class: 'tt-status', role: 'status' });
      const board = h('div', { class: 'tt-board', role: 'grid', 'aria-label': '盤' });
      const scoreEl = h('div', { class: 'tt-score' });
      const sel = (id, label, opts, val, on) => { const s = h('select', { class: 'sel', id: id + win.pid, 'aria-label': label, onchange: () => on(s.value) }, opts.map(o => h('option', { value: o[0], selected: String(o[0]) === String(val) }, o[1]))); return s; };
      const bar = h('div', { class: 'toolbar tt-bar' });
      win.body.classList.add('tt-root');
      win.body.append(bar, h('div', { class: 'tt-main' }, scoreEl, status, h('div', { class: 'tt-wrap' }, board)));

      let B, turn, over, line, busy = false, last = -1;
      const N = () => cfg.n, K = () => Math.min(cfg.k, cfg.n);
      const human = p => cfg.mode === 'pvp' || (cfg.mode === 'cpu2' ? p === 'X' : p === 'O');
      const nameOf = p => cfg.mode === 'pvp' ? (p === 'X' ? '×（先手）' : '○（後手）') : human(p) ? 'あなた（' + (p === 'X' ? '×' : '○') + '）' : 'CPU（' + (p === 'X' ? '×' : '○') + '）';

      function paintBar() {
        bar.textContent = '';
        bar.append(
          sel('tt-mode-', '対戦相手', [['cpu2', 'CPU と（自分が先手）'], ['cpu1', 'CPU と（CPU が先手）'], ['pvp', '二人で']], cfg.mode, v => { cfg.mode = v; save(); newGame(); }),
          sel('tt-lv-', 'CPU の強さ', [['easy', 'やさしい'], ['normal', 'ふつう'], ['hard', 'つよい']], cfg.level, v => { cfg.level = v; save(); }),
          sel('tt-n-', 'マスの数', [3, 4, 5, 6, 7, 8, 9].map(n => [n, n + '×' + n]), cfg.n, v => { cfg.n = +v; cfg.k = Math.min(cfg.k, cfg.n); if (cfg.n >= 6 && cfg.k === 3) cfg.k = cfg.n >= 7 ? 5 : 4; save(); paintBar(); newGame(); }),
          sel('tt-k-', '並べる数', Array.from({ length: cfg.n - 2 }, (x, i) => [i + 3, (i + 3) + ' 個並べたら勝ち']), K(), v => { cfg.k = +v; save(); newGame(); }));
        bar.querySelector('[id^=tt-lv-]').disabled = cfg.mode === 'pvp';
      }
      async function settings() {
        const n = h('input', { type: 'range', min: 3, max: 9, value: cfg.n, id: 'tt-sn-' + win.pid, 'aria-label': 'マスの数' });
        const k = h('input', { type: 'range', min: 3, max: cfg.n, value: K(), id: 'tt-sk-' + win.pid, 'aria-label': '並べる数' });
        const nl = h('b'), kl = h('b');
        const upd = () => { k.max = n.value; if (+k.value > +n.value) k.value = n.value; nl.textContent = n.value + '×' + n.value; kl.textContent = k.value + ' 個'; OS.htui.syncRanges && OS.htui.syncRanges(k.parentNode || document); };
        n.addEventListener('input', upd); k.addEventListener('input', upd); upd();
        const ok = await ui.modal({ title: '盤の大きさ', width: 380, body: [h('div', { class: 'tt-set' }, h('label', null, 'マスの数 ', nl), n, h('label', null, '並べたら勝ち ', kl), k)],
          buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: 'この大きさで始める', primary: true, value: true }] });
        if (!ok) return;
        cfg.n = +n.value; cfg.k = +k.value; save(); paintBar(); newGame();
      }

      // ---- 盤の判定
      const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
      function winner(b) {
        const n = N(), k = K();
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          const p = b[r * n + c]; if (!p) continue;
          for (const [dr, dc] of DIRS) {
            const er = r + dr * (k - 1), ec = c + dc * (k - 1);
            if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
            let ok = true; const cells = [r * n + c];
            for (let i = 1; i < k; i++) { const j = (r + dr * i) * n + c + dc * i; if (b[j] !== p) { ok = false; break; } cells.push(j); }
            if (ok) return { p: p, cells: cells };
          }
        }
        return b.every(x => x) ? { p: null, cells: [] } : null;
      }
      // ---- CPU
      function lineScore(b, me) {
        // すべての「k 個の窓」を見て、相手の石が無い窓は自分の石の数に応じて点を足す（相手の分は引く）
        const n = N(), k = K(), you = me === 'X' ? 'O' : 'X'; let s = 0;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of DIRS) {
          const er = r + dr * (k - 1), ec = c + dc * (k - 1);
          if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
          let a = 0, o = 0;
          for (let i = 0; i < k; i++) { const v = b[(r + dr * i) * n + c + dc * i]; if (v === me) a++; else if (v === you) o++; }
          if (a && !o) s += Math.pow(10, a); else if (o && !a) s -= Math.pow(10, o) * 1.2;
        }
        return s;
      }
      function minimax(b, p, me, depth, alpha, beta) {
        const w = winner(b);
        if (w) return w.p === me ? 1000 - depth : w.p ? depth - 1000 : 0;
        const you = p === 'X' ? 'O' : 'X';
        if (depth >= limit) return lineScore(b, me) / 1000;
        let best = p === me ? -Infinity : Infinity;
        for (const i of order(b)) {
          b[i] = p; const v = minimax(b, you, me, depth + 1, alpha, beta); b[i] = null;
          if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
          if (beta <= alpha) break;
        }
        return best;
      }
      let limit = 9;
      // 先に調べる順: 石の近くから（大きい盤で枝を減らす）
      function order(b) {
        const n = N(), out = [];
        const any = b.some(x => x);
        for (let i = 0; i < b.length; i++) {
          if (b[i]) continue;
          if (any && n > 4) { const r = (i / n) | 0, c = i % n; let near = false; for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc]) { near = true; break; } } if (!near) continue; }
          out.push(i);
        }
        const mid = (n - 1) / 2;
        return out.sort((a, c) => (Math.abs(a / n - mid) + Math.abs(a % n - mid)) - (Math.abs(c / n - mid) + Math.abs(c % n - mid)));
      }
      function cpuMove(me) {
        const b = B.slice(), you = me === 'X' ? 'O' : 'X', empt = b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
        if (cfg.level === 'easy' && Math.random() < 0.6) return empt[(Math.random() * empt.length) | 0];
        // 勝てる手・止める手
        for (const p of [me, you]) for (const i of empt) { b[i] = p; const w = winner(b); b[i] = null; if (w && w.p === p) return i; }
        if (cfg.level === 'hard') {
          limit = N() === 3 ? 9 : N() === 4 ? 4 : 2;
          let best = -Infinity, pick = empt[0];
          for (const i of order(b)) { b[i] = me; const v = minimax(b, you, me, 1, -Infinity, Infinity); b[i] = null; if (v > best) { best = v; pick = i; } }
          return pick;
        }
        let best = -Infinity, pick = empt[0];
        for (const i of order(b).length ? order(b) : empt) { b[i] = me; const v = lineScore(b, me) + Math.random() * 3; b[i] = null; if (v > best) { best = v; pick = i; } }
        return pick;
      }

      // ---- 進行
      function newGame() {
        B = new Array(N() * N()).fill(null); turn = 'X'; over = false; line = null; last = -1;
        board.style.setProperty('--n', N());
        board.textContent = '';
        for (let i = 0; i < B.length; i++) board.append(h('button', { class: 'tt-cell', type: 'button', role: 'gridcell', 'aria-label': (((i / N()) | 0) + 1) + ' 行 ' + (i % N() + 1) + ' 列', onclick: () => play(i, true) }));
        paint(); next();
      }
      function paint() {
        [...board.children].forEach((el, i) => {
          el.textContent = ''; el.className = 'tt-cell' + (B[i] ? ' ' + B[i].toLowerCase() : '') + (line && line.includes(i) ? ' win' : '') + (i === last ? ' last' : '');
          if (B[i]) el.append(h('span', { class: 'tt-mark' }, B[i] === 'X' ? '×' : '○'));
          el.disabled = !!B[i] || over;
        });
        scoreEl.textContent = '';
        scoreEl.append(h('span', { class: 'tt-sx' }, '× ' + score.X), h('span', null, '引き分け ' + score.draw), h('span', { class: 'tt-so' }, '○ ' + score.O));
        if (!over) status.textContent = nameOf(turn) + ' の番です' + (busy ? '（考え中…）' : '') + ' ・ ' + N() + '×' + N() + '、' + K() + ' 個並べたら勝ち';
      }
      function play(i, byHand) {
        if (over || B[i] || (byHand && (busy || !human(turn)))) return;
        B[i] = turn; last = i;
        const w = winner(B);
        if (w) {
          over = true; line = w.cells;
          if (w.p) { score[w.p]++; status.textContent = nameOf(w.p) + ' の勝ちです！'; } else { score.draw++; status.textContent = '引き分けです'; }
          paint(); return;
        }
        turn = turn === 'X' ? 'O' : 'X';
        paint(); next();
      }
      function next() {
        if (over || human(turn)) return;
        busy = true; paint();
        setTimeout(() => { if (win.closed) return; const i = cpuMove(turn); busy = false; play(i, false); }, 280);
      }
      board.addEventListener('keydown', e => {
        const cells = [...board.children], i = cells.indexOf(document.activeElement); if (i < 0) return;
        const n = N(), mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[e.key];
        if (mv) { e.preventDefault(); const j = i + mv; if (j >= 0 && j < cells.length && !(Math.abs(mv) === 1 && ((j / n) | 0) !== ((i / n) | 0))) cells[j].focus(); }
      });
      win.onHibernate = () => ({ n: N(), B: B, turn: turn, over: over, line: line, last: last, score: score, msg: over ? status.textContent : '' });
      const rs = arg && arg.resume;
      paintBar();
      if (rs && rs.n === N() && Array.isArray(rs.B) && rs.B.length === N() * N()) {
        Object.assign(score, rs.score || {});
        B = rs.B; turn = rs.turn === 'O' ? 'O' : 'X'; over = !!rs.over; line = rs.line || null; last = rs.last == null ? -1 : rs.last;
        board.style.setProperty('--n', N()); board.textContent = '';
        for (let i = 0; i < B.length; i++) board.append(h('button', { class: 'tt-cell', type: 'button', role: 'gridcell', 'aria-label': (((i / N()) | 0) + 1) + ' 行 ' + (i % N() + 1) + ' 列', onclick: () => play(i, true) }));
        paint(); if (over) status.textContent = rs.msg || ''; else next();
      } else newGame();
      return win;
    }
  });
})();
