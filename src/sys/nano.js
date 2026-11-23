/* nano — 端末の中で使うテキストエディタ（htmlOS 7.1 から）。GNU nano のキー操作をまねている。
   nano [-l] [-v] [-i] [-E] [-T 幅] [+行[,列]] [ファイル]
   画面は tty.screen()（HTUi SDK 4 Mars で Alt・F キー・クリック・大きさの変化・改行入りの貼り付けが届くようになった）に描く。
   ファイルの読み書きはシェルのユーザーの権限（sh.fs）で行う。 */
(function () {
  const OS = window.OS, path = OS.path;
  const VERSION = '1.0';

  // 文字の幅（全角・絵文字は 2）
  function wide(c) {
    return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) || (c >= 0x3041 && c <= 0x33ff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xa000 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1f64f) || (c >= 0x1f900 && c <= 0x1f9ff) || (c >= 0x20000 && c <= 0x3fffd);
  }
  const cw = ch => { const c = ch.codePointAt(0); return c < 32 ? 2 : wide(c) ? 2 : 1; }; // 制御文字は ^X のように 2 マス

  // ---- ヘルプ（^G）
  const HELP = [
    'htmlOS nano ' + VERSION + ' のヘルプ',
    '',
    'GNU nano と同じキー操作のテキストエディタです。^ は Ctrl、M- は Alt（または Esc を押してから）です。',
    'ブラウザが先に使ってしまう Ctrl+W・Ctrl+N・Ctrl+T の代わりに、^F（検索）・↓・F キーを使ってください。',
    '',
    '── ファイル ──',
    '^O / F3        書き込む（ファイル名を確かめてから保存）',
    '^S             すぐに保存する',
    '^X / F2        終わる（変更があれば保存するか聞きます）',
    '^R / F5        ほかのファイルを読み込んで、カーソルの位置に挿入',
    '^T / F12       jsh のコマンドを実行して、出力を挿入',
    '',
    '── 移動 ──',
    '矢印キー       1 文字・1 行ずつ        ^A / Home  行の先頭    ^E / End  行の末尾',
    '^P / ^B        上 / 左                  ^Y / PageUp  前のページ   ^V / PageDown  次のページ',
    'Ctrl+←/→       単語ごと                 M-\\ / Ctrl+Home  先頭    M-/ / Ctrl+End  末尾',
    '^_ / M-G / ^/  指定した行（と列）へ     ^C  カーソルの位置を表示',
    'クリック       その位置へ',
    '',
    '── 編集 ──',
    '^K / F9        行（範囲を選んでいればその範囲）を切り取り。続けて押すとまとめて切り取ります',
    '^U / F10       切り取ったものを貼り付け',
    'M-6            行（または範囲）をコピー',
    'M-A / Shift+矢印  範囲の選択を始める・やめる',
    '^D / Delete    カーソルの文字を消す     ^H / Backspace  前の文字を消す',
    'Tab            タブ（-E のときは空白）を入れる',
    'M-U / ^Z       元に戻す                 M-E            やり直す',
    '',
    '── 検索・置換 ──',
    '^F / F6 / ^W   検索（大文字と小文字は区別しません）',
    'M-W            次を検索                 M-Q            前を検索',
    '^\\ / M-R       置換（Y 置換  N 飛ばす  A すべて  ^C やめる）',
    '',
    '── 表示 ──',
    'M-N / M-#      行番号の表示を切り替え   M-I  自動インデントを切り替え',
    '^G / F1        このヘルプ',
    '',
    '── 起動のオプション ──',
    'nano -l ファイル     行番号を出す',
    'nano -v ファイル     読むだけ（書き換えない）',
    'nano -i ファイル     自動インデント（改行したとき前の行の字下げをそろえる）',
    'nano -E ファイル     Tab で空白を入れる',
    'nano -T 2 ファイル   タブの幅（既定 4）',
    'nano +10 ファイル    10 行目から開く（+10,5 で 5 列目）',
    '',
    '↑↓ PageUp/PageDown でスクロール、^X・Esc・q でヘルプを閉じます。'
  ];

  // 下の 2 行に出すキーの一覧
  const KEYS_MAIN = [['^G', 'ヘルプ'], ['^O', '書き込み'], ['^F', '検索'], ['^K', '切り取り'], ['^T', '実行'], ['^C', '位置'],
    ['^X', '終了'], ['^R', '読み込み'], ['^\\', '置換'], ['^U', '貼り付け'], ['M-U', '元に戻す'], ['^/', '行へ移動']];
  const KEYS_VIEW = [['^G', 'ヘルプ'], ['^F', '検索'], ['M-W', '次'], ['^C', '位置'], ['^/', '行へ移動'], ['M-N', '行番号'],
    ['^X', '終了'], ['^Y', '前頁'], ['^V', '次頁'], ['M-\\', '先頭'], ['M-/', '末尾'], ['M-Q', '前']];
  const KEYS_PROMPT = [['^G', 'ヘルプ'], ['Enter', '決定'], ['', ''], ['', ''], ['', ''], ['', ''], ['^C', '取消'], ['↑↓', '履歴'], ['', ''], ['', ''], ['', ''], ['', '']];
  const KEYS_YN = [['Y', 'はい'], ['N', 'いいえ'], ['', ''], ['', ''], ['', ''], ['', ''], ['^C', '取消'], ['', ''], ['', ''], ['', ''], ['', ''], ['', '']];
  const KEYS_REPL = [['Y', '置換'], ['N', '飛ばす'], ['A', 'すべて'], ['', ''], ['', ''], ['', ''], ['^C', 'やめる'], ['', ''], ['', ''], ['', ''], ['', ''], ['', '']];

  const searchHist = [], cmdHist = [];

  async function nano(args, sh) {
    const tty = sh.tty, fs = sh.fs;
    if (!tty || typeof tty.screen !== 'function' || tty.capture) throw new Error('nano: 端末（Terminal・tty1）の中で実行してください');
    // ---- 引数
    const opt = { lines: false, view: false, indent: false, spaces: false, tab: 4 };
    let file = null, startLine = 0, startCol = 0;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]);
      if (a === '-h' || a === '--help') return 'nano [-l] [-v] [-i] [-E] [-T 幅] [+行[,列]] [ファイル]\n  -l 行番号  -v 読むだけ  -i 自動インデント  -E タブを空白に  -T タブの幅\n  キーの一覧は nano の中で ^G（Ctrl+G）';
      if (a === '-T' || a === '--tabsize') { opt.tab = Math.max(1, Math.min(16, parseInt(args[++i], 10) || 4)); continue; }
      if (/^\+\d+(,\d+)?$/.test(a)) { const m = a.slice(1).split(','); startLine = +m[0]; startCol = +(m[1] || 0); continue; }
      if (/^-[A-Za-z]+$/.test(a)) {
        for (const f of a.slice(1)) {
          if (f === 'l') opt.lines = true; else if (f === 'v') opt.view = true; else if (f === 'i') opt.indent = true; else if (f === 'E') opt.spaces = true;
          else throw new Error('nano: -' + f + ': 知らないオプションです（nano -h）');
        }
        continue;
      }
      if (file) throw new Error('nano: ファイルは 1 つだけ指定してください');
      file = sh.abs(a);
    }

    // ---- バッファ
    let lines = [''], crlf = false, modified = false, msg = '', msgCls = 'msg';
    if (file) {
      const st = fs.exists(file) ? fs.stat(file) : null;
      if (st && st.t === 'd') throw new Error('nano: ' + file + ': ディレクトリです');
      if (st && st.b) throw new Error('nano: ' + file + ': バイナリファイルは開けません');
      if (st) {
        const text = String(fs.read(file)); // 読めなければここで例外（権限）
        crlf = /\r\n/.test(text);
        lines = text.replace(/\r\n?/g, '\n').split('\n');
        const n = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
        msg = n + ' 行を読み込みました' + (crlf ? '（DOS 形式）' : '');
        if (!opt.view && fs.canWrite && !fs.canWrite(file)) msg += ' ・ 書き込みの権限がありません';
      } else msg = '新しいファイル';
    }
    let cy = 0, cx = 0, want = 0, top = 0; // カーソル（行・文字の位置）、上下に動くときに保つ列、画面のいちばん上の行
    if (startLine) { cy = Math.max(0, Math.min(lines.length - 1, startLine - 1)); cx = Math.max(0, Math.min(lines[cy].length, startCol ? startCol - 1 : 0)); }
    let mark = null, autoMark = false; // 範囲選択の始まり { y, x }
    let cut = [], lastCut = false; // 切り取ったもの（行の配列）、直前の操作も ^K だったか
    const undo = [], redo = []; let lastEdit = '';
    let searchStr = '', showLines = opt.lines, esc = false;

    const scr = tty.screen();
    scr.fixed(true);
    let size = scr.size();

    // ---- 位置と幅
    const prevIdx = (s, i) => { if (i <= 0) return 0; const c = s.charCodeAt(i - 1); return i - (c >= 0xdc00 && c <= 0xdfff && i > 1 ? 2 : 1); };
    const nextIdx = (s, i) => { if (i >= s.length) return s.length; const c = s.charCodeAt(i); return i + (c >= 0xd800 && c <= 0xdbff ? 2 : 1); };
    function colOf(s, idx) { let col = 0; for (let i = 0; i < idx && i < s.length;) { const ch = String.fromCodePoint(s.codePointAt(i)); col += ch === '\t' ? opt.tab - col % opt.tab : cw(ch); i += ch.length; } return col; }
    function idxAt(s, col) { let c = 0, i = 0; while (i < s.length) { const ch = String.fromCodePoint(s.codePointAt(i)), w = ch === '\t' ? opt.tab - c % opt.tab : cw(ch); if (c + w > col) break; c += w; i += ch.length; } return i; }
    const gutter = () => showLines ? String(lines.length).length + 1 : 0;
    const textRows = () => Math.max(1, size.rows - 4);
    const textCols = () => Math.max(8, size.cols - gutter());
    const clampX = () => { cx = Math.max(0, Math.min(lines[cy].length, cx)); };
    function scrollTo() {
      const H = textRows();
      if (cy < top) top = cy; else if (cy >= top + H) top = cy - H + 1;
      if (top > Math.max(0, lines.length - 1)) top = Math.max(0, lines.length - 1);
    }
    const ordered = () => { if (!mark) return null; const a = mark, b = { y: cy, x: cx }; return (a.y < b.y || (a.y === b.y && a.x <= b.x)) ? [a, b] : [b, a]; };

    // ---- 描画
    function lineSegs(s, y, cur) {
      const W = textCols(), segs = [];
      let start = 0;
      const ccol = cur ? colOf(s, cx) : 0;
      if (cur && ccol > W - 3) { const page = Math.max(4, W - 8); start = Math.ceil((ccol - (W - 3)) / page) * page; }
      const sel = ordered();
      const inSel = i => sel && (y > sel[0].y || (y === sel[0].y && i >= sel[0].x)) && (y < sel[1].y || (y === sel[1].y && i < sel[1].x));
      let col = 0, out = 0, i = 0;
      const push = (t, cls) => { const last = segs[segs.length - 1]; if (last && last[1] === cls && cls !== 'cur' && cls !== 'w' && !/ t-w$/.test(cls || '')) last[0] += t; else segs.push([t, cls]); };
      if (start > 0) { push('$', 'dim'); out = 1; }
      while (i < s.length) {
        const ch = String.fromCodePoint(s.codePointAt(i)), w = ch === '\t' ? opt.tab - col % opt.tab : cw(ch);
        const here = cur && i === cx, mk = inSel(i);
        if (col + w > start) {
          if (out + w > W || (out + w === W && nextIdx(s, i) < s.length)) { push('$', 'dim'); out = W; break; }
          let shown = ch === '\t' ? ' '.repeat(col < start ? col + w - start : w) : ch.codePointAt(0) < 32 ? '^' + String.fromCharCode(ch.codePointAt(0) + 64) : ch;
          if (col < start) shown = ' '.repeat(col + w - start); // 左端で途中から見える全角文字
          const cls = here ? 'cur' : mk ? 'mark' : null;
          if (shown.length > 1 && here) { push(shown[0], cls); push(shown.slice(1), mk ? 'mark' : null); }
          else if (w === 2 && ch !== '\t' && ch.codePointAt(0) >= 32 && col >= start) push(shown, cls ? cls + ' t-w' : 'w');
          else push(shown, cls);
          out += col < start ? col + w - start : w;
        }
        col += w; i += ch.length;
      }
      if (cur && cx >= s.length && out < W) { push(' ', 'cur'); out++; }
      return segs;
    }
    function bar(items) {
      const per = Math.max(6, Math.floor(size.cols / 6)), rows = [[], []];
      items.forEach((k, n) => {
        const r = rows[n < 6 ? 0 : 1];
        if (!k[0]) { r.push([' '.repeat(per), null]); return; }
        const label = ' ' + k[1];
        let w = 0, txt = ''; for (const ch of label) { const x = cw(ch); if (k[0].length + w + x > per - 1) break; txt += ch; w += x; }
        r.push([k[0], 'key'], [txt + ' '.repeat(Math.max(0, per - k[0].length - w)), null]);
      });
      return rows;
    }
    function titleRow() {
      const name = file ? path.base(file) : '新しいバッファ', left = '  nano ' + VERSION, right = (opt.view ? '読むだけ' : modified ? '変更あり' : '') + '  ';
      const width = s => Array.from(s).reduce((a, c) => a + cw(c), 0);
      const W = size.cols, nw = width(name), mid = Math.max(width(left) + 1, Math.floor((W - nw) / 2));
      const gap1 = Math.max(1, mid - width(left)), gap2 = Math.max(1, W - width(left) - gap1 - nw - width(right));
      return [[left + ' '.repeat(gap1) + name + ' '.repeat(gap2) + right, 'inv']];
    }
    function draw(status, keys) {
      size = scr.size();
      scrollTo();
      const rows = [titleRow()], H = textRows(), g = gutter();
      for (let r = 0; r < H; r++) {
        const y = top + r;
        if (y >= lines.length) { rows.push(''); continue; }
        const row = [];
        if (g) row.push([String(y + 1).padStart(g - 1) + ' ', 'num']);
        lineSegs(lines[y], y, y === cy).forEach(x => row.push(x));
        rows.push(row.length ? row : '');
      }
      if (status) rows.push(status);
      else if (msg) { const t = '[ ' + msg + ' ]', w = Array.from(t).reduce((a, c) => a + cw(c), 0), pad = Math.max(0, Math.floor((size.cols - w) / 2)); rows.push([[' '.repeat(pad), null], [t, msgCls]]); }
      else rows.push('');
      bar(keys || (opt.view ? KEYS_VIEW : KEYS_MAIN)).forEach(r => rows.push(r));
      scr.render(rows);
    }
    const say = (t, cls) => { msg = t; msgCls = cls || 'msg'; };

    // ---- 1 行の入力（下から 3 行目）。決めた文字か、^C なら null
    async function prompt(label, def, hist) {
      let v = def || '', i = v.length, hi = hist ? hist.length : 0;
      for (;;) {
        const before = v.slice(0, i), after = v.slice(i);
        draw([[label, 'inv'], [before, null], [after ? Array.from(after)[0] : ' ', 'cur'], [after ? after.slice(Array.from(after)[0].length) : '', null]], KEYS_PROMPT);
        const k = await scr.key();
        if (k.key === 'resize' || k.key === 'click') continue;
        if (k.key === 'Enter') { if (hist && v && hist[hist.length - 1] !== v) hist.push(v); return v; }
        if (k.key === 'Escape' || (k.ctrl && (k.key === 'c' || k.key === 'x'))) return null;
        if (k.ctrl && k.key === 'g') { await help(); continue; }
        if (k.key === 'text') { const t = k.text.replace(/\n/g, ' '); v = before + t + after; i += t.length; }
        else if (k.key === 'Backspace' || (k.ctrl && k.key === 'h')) { const j = prevIdx(v, i); v = v.slice(0, j) + after; i = j; }
        else if (k.key === 'Delete' || (k.ctrl && k.key === 'd')) v = before + v.slice(nextIdx(v, i));
        else if (k.key === 'ArrowLeft' || (k.ctrl && k.key === 'b')) i = prevIdx(v, i);
        else if (k.key === 'ArrowRight') i = nextIdx(v, i);
        else if (k.key === 'Home' || (k.ctrl && k.key === 'a')) i = 0;
        else if (k.key === 'End' || (k.ctrl && k.key === 'e')) i = v.length;
        else if (k.ctrl && k.key === 'u') { v = ''; i = 0; }
        else if (hist && (k.key === 'ArrowUp' || k.key === 'ArrowDown')) { hi = Math.max(0, Math.min(hist.length, hi + (k.key === 'ArrowUp' ? -1 : 1))); v = hist[hi] || ''; i = v.length; }
      }
    }
    // はい・いいえ（ほかの答えも選べる）。答えのキー（小文字）か、^C なら null
    async function ask(label, keys, allowed) {
      for (;;) {
        draw([[label, 'inv'], [' ', 'cur']], keys || KEYS_YN);
        const k = await scr.key();
        if (k.key === 'Escape' || (k.ctrl && k.key === 'c')) return null;
        if (k.key === 'text') { const c = k.text.trim().slice(-1).toLowerCase(); const m = { 'は': 'y', 'い': 'n' }[c] || c; if ((allowed || 'yn').includes(m)) return m; }
      }
    }
    async function help() {
      let at = 0;
      for (;;) {
        size = scr.size();
        const H = size.rows - 3;
        const rows = [[['  nano ' + VERSION + ' のヘルプ' + ' '.repeat(Math.max(0, size.cols - 20)), 'inv']]].concat(HELP.slice(at, at + H));
        while (rows.length < size.rows - 2) rows.push('');
        bar([['^X', 'ヘルプを閉じる'], ['↑↓', 'スクロール'], ['', ''], ['', ''], ['', ''], ['', ''], ['^Y', '前頁'], ['^V', '次頁'], ['', ''], ['', ''], ['', ''], ['', '']]).forEach(r => rows.push(r));
        scr.render(rows);
        const k = await scr.key(), max = Math.max(0, HELP.length - H);
        if (k.key === 'ArrowDown' || (k.ctrl && k.key === 'n')) at = Math.min(max, at + 1);
        else if (k.key === 'ArrowUp' || (k.ctrl && k.key === 'p')) at = Math.max(0, at - 1);
        else if (k.key === 'PageDown' || (k.ctrl && k.key === 'v') || (k.key === 'text' && k.text === ' ')) at = Math.min(max, at + H);
        else if (k.key === 'PageUp' || (k.ctrl && k.key === 'y')) at = Math.max(0, at - H);
        else if (k.key === 'Escape' || k.key === 'Enter' || (k.ctrl && (k.key === 'x' || k.key === 'g' || k.key === 'c')) || (k.key === 'text' && /q/i.test(k.text)) || k.key === 'F1' || k.key === 'F2') return;
      }
    }

    // ---- 編集（元に戻せるように、変える前の状態を積む）
    function snap(kind) {
      if (kind && kind === lastEdit && undo.length) return; // 続けて打った文字は 1 回で戻す
      undo.push({ lines: lines.slice(), cy: cy, cx: cx, modified: modified }); if (undo.length > 300) undo.shift();
      redo.length = 0; lastEdit = kind || '';
    }
    function changed() { modified = true; }
    const ro = () => { if (opt.view) { say('読むだけのモードです', 'msg'); return true; } return false; };
    function insertText(t) {
      if (ro()) return;
      if (mark && !autoMark) { /* 選択中でも文字はカーソルに入れる（nano と同じ） */ }
      const parts = t.split('\n'), s = lines[cy], before = s.slice(0, cx), after = s.slice(cx);
      if (parts.length === 1) { lines[cy] = before + t + after; cx += t.length; }
      else {
        const add = parts.slice(1, -1), last = parts[parts.length - 1];
        lines.splice(cy, 1, before + parts[0], ...add, last + after);
        cy += parts.length - 1; cx = last.length;
      }
      want = colOf(lines[cy], cx); changed();
    }
    function newline() {
      if (ro()) return;
      snap('nl');
      const ind = opt.indent ? (/^[ \t]*/.exec(lines[cy].slice(0, cx)) || [''])[0] : '';
      insertText('\n' + ind);
    }
    function backspace() {
      if (ro()) return;
      if (mark && !autoMark) { /* 範囲はそのまま */ }
      snap('del');
      if (cx > 0) { const j = prevIdx(lines[cy], cx); lines[cy] = lines[cy].slice(0, j) + lines[cy].slice(cx); cx = j; }
      else if (cy > 0) { cx = lines[cy - 1].length; lines[cy - 1] += lines[cy]; lines.splice(cy, 1); cy--; }
      else return;
      want = colOf(lines[cy], cx); changed();
    }
    function del() {
      if (ro()) return;
      snap('del');
      if (cx < lines[cy].length) lines[cy] = lines[cy].slice(0, cx) + lines[cy].slice(nextIdx(lines[cy], cx));
      else if (cy < lines.length - 1) { lines[cy] += lines[cy + 1]; lines.splice(cy + 1, 1); }
      else return;
      changed();
    }
    // 範囲を取り出す（remove なら消す）。行の配列を返す
    function takeRegion(remove) {
      const [a, b] = ordered();
      let out;
      if (a.y === b.y) out = [lines[a.y].slice(a.x, b.x)];
      else out = [lines[a.y].slice(a.x)].concat(lines.slice(a.y + 1, b.y), [lines[b.y].slice(0, b.x)]);
      if (remove) { lines.splice(a.y, b.y - a.y + 1, lines[a.y].slice(0, a.x) + lines[b.y].slice(b.x)); cy = a.y; cx = a.x; }
      mark = null; autoMark = false;
      return out;
    }
    function cutLine() {
      if (ro()) return;
      snap('cut');
      if (mark) { cut = takeRegion(true); cut.region = true; changed(); lastCut = false; return; }
      if (!lastCut) cut = [];
      if (cy === lines.length - 1 && lines.length > 1 && lines[cy] === '') return;
      cut.push(lines[cy]);
      if (lines.length === 1) lines[0] = ''; else { lines.splice(cy, 1); if (cy >= lines.length) cy = lines.length - 1; }
      cx = 0; changed(); lastCut = true;
    }
    function copyLine() {
      if (mark) { cut = takeRegion(false); cut.region = true; say('コピーしました'); return; }
      if (!lastCut) cut = [];
      cut.push(lines[cy]);
      if (cy < lines.length - 1) { cy++; cx = 0; }
      lastCut = true; say('行をコピーしました');
    }
    function paste() {
      if (ro()) return;
      if (!cut.length) { say('貼り付けるものがありません'); return; }
      snap('paste');
      if (cut.region) insertText(cut.join('\n'));
      else { lines.splice(cy, 0, ...cut); cy += cut.length; cx = 0; changed(); }
    }
    function doUndo(from, to, what) {
      if (!from.length) { say(what === 'u' ? '元に戻せる操作はありません' : 'やり直せる操作はありません'); return; }
      to.push({ lines: lines.slice(), cy: cy, cx: cx, modified: modified });
      const s = from.pop(); lines = s.lines; cy = s.cy; cx = s.cx; modified = s.modified; mark = null; lastEdit = '';
      say(what === 'u' ? '元に戻しました' : 'やり直しました');
    }

    // ---- 移動
    function vmove(d) { cy = Math.max(0, Math.min(lines.length - 1, cy + d)); cx = idxAt(lines[cy], want); }
    function hmove(d) {
      if (d < 0) { if (cx > 0) cx = prevIdx(lines[cy], cx); else if (cy > 0) { cy--; cx = lines[cy].length; } }
      else { if (cx < lines[cy].length) cx = nextIdx(lines[cy], cx); else if (cy < lines.length - 1) { cy++; cx = 0; } }
      want = colOf(lines[cy], cx);
    }
    const isWord = c => /[\p{L}\p{N}_]/u.test(c);
    function wordMove(d) {
      if (d > 0) {
        if (cx >= lines[cy].length) { hmove(1); return; }
        const s = lines[cy]; while (cx < s.length && isWord(s[cx])) cx++; while (cx < s.length && !isWord(s[cx])) cx++;
      } else {
        if (cx === 0) { hmove(-1); return; }
        const s = lines[cy]; while (cx > 0 && !isWord(s[cx - 1])) cx--; while (cx > 0 && isWord(s[cx - 1])) cx--;
      }
      want = colOf(lines[cy], cx);
    }
    function showPos() {
      const total = lines.reduce((a, l) => a + l.length + 1, 0) - 1;
      let at = 0; for (let y = 0; y < cy; y++) at += lines[y].length + 1; at += cx;
      const pct = (a, b) => Math.round(a / Math.max(1, b) * 100) + '%';
      say('行 ' + (cy + 1) + '/' + lines.length + ' (' + pct(cy + 1, lines.length) + ')、列 ' + (cx + 1) + '/' + (lines[cy].length + 1) + ' (' + pct(cx + 1, lines[cy].length + 1) + ')、文字 ' + (at + 1) + '/' + (total + 1) + ' (' + pct(at + 1, total + 1) + ')');
    }
    async function gotoLine() {
      const v = await prompt('行と列を入力（例 12,3）: ', '');
      if (v == null || !v.trim()) { say('取り消しました'); return; }
      const m = /^\s*(-?\d+)?\s*(?:[,\s]\s*(-?\d+))?\s*$/.exec(v);
      if (!m) { say('数字で入力してください'); return; }
      let y = m[1] ? +m[1] : cy + 1; if (y < 0) y = lines.length + y + 1;
      cy = Math.max(0, Math.min(lines.length - 1, y - 1));
      cx = m[2] ? Math.max(0, Math.min(lines[cy].length, +m[2] - 1)) : 0; want = colOf(lines[cy], cx);
      top = Math.max(0, cy - Math.floor(textRows() / 2));
    }

    // ---- 検索・置換
    function find(str, back, fromNext) {
      if (!str) return false;
      const low = str.toLowerCase(), n = lines.length;
      let y = cy, x = cx;
      if (!back) {
        let s = lines[y].toLowerCase().indexOf(low, x + (fromNext ? 1 : 0));
        if (s >= 0) { cx = s; want = colOf(lines[cy], cx); return true; }
        for (let k = 1; k <= n; k++) {
          y = (cy + k) % n; s = lines[y].toLowerCase().indexOf(low);
          if (s >= 0) { if (y <= cy) say('折り返しました'); cy = y; cx = s; want = colOf(lines[cy], cx); return true; }
        }
      } else {
        let s = x > 0 ? lines[y].toLowerCase().lastIndexOf(low, x - 1) : -1;
        if (s >= 0) { cx = s; want = colOf(lines[cy], cx); return true; }
        for (let k = 1; k <= n; k++) {
          y = (cy - k + n * 2) % n; s = lines[y].toLowerCase().lastIndexOf(low);
          if (s >= 0) { if (y >= cy) say('折り返しました'); cy = y; cx = s; want = colOf(lines[cy], cx); return true; }
        }
      }
      return false;
    }
    async function search(back) {
      const v = await prompt((back ? '前を検索' : '検索') + (searchStr ? ' [' + searchStr + ']' : '') + ': ', '', searchHist);
      if (v == null) { say('取り消しました'); return; }
      if (v) searchStr = v;
      if (!searchStr) { say('取り消しました'); return; }
      say('');
      if (!find(searchStr, back, true)) say('「' + searchStr + '」は見つかりませんでした');
    }
    function again(back) {
      if (!searchStr) { say('まだ検索していません（^F）'); return; }
      say('');
      if (!find(searchStr, back, true)) say('「' + searchStr + '」は見つかりませんでした');
    }
    async function replace() {
      if (ro()) return;
      const a = await prompt('置換する文字' + (searchStr ? ' [' + searchStr + ']' : '') + ': ', '', searchHist);
      if (a == null) { say('取り消しました'); return; }
      const from = a || searchStr; if (!from) { say('取り消しました'); return; }
      searchStr = from;
      const to = await prompt('置き換える文字: ', '');
      if (to == null) { say('取り消しました'); return; }
      snap('replace');
      const sy = cy, sx = cx, low = from.toLowerCase(); let count = 0, all = false, y = cy, x = cx;
      while (y < lines.length) {
        const at = lines[y].toLowerCase().indexOf(low, x);
        if (at < 0) { y++; x = 0; continue; }
        cy = y; cx = at; want = colOf(lines[cy], cx);
        if (!all) {
          mark = { y: cy, x: cx + from.length }; autoMark = true;
          const r = await ask('置換しますか？ ', KEYS_REPL, 'yna');
          mark = null; autoMark = false;
          if (r == null) break;
          if (r === 'n') { x = at + Math.max(1, from.length); continue; }
          if (r === 'a') all = true;
        }
        lines[y] = lines[y].slice(0, at) + to + lines[y].slice(at + from.length);
        x = at + to.length; count++; changed();
      }
      if (!count) { cy = sy; cx = sx; } else clampX();
      say(count ? count + ' か所を置換しました' : '置換しませんでした');
    }

    // ---- ファイル
    function save(name) {
      const text = lines.join(crlf ? '\r\n' : '\n');
      fs.write(name, text);
      file = name; modified = false;
      const n = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
      say(n + ' 行を書き込みました');
      return true;
    }
    async function writeOut(quick) {
      if (opt.view) { say('読むだけのモードでは書き込めません'); return false; }
      let name = file;
      if (!quick || !name) {
        const v = await prompt('書き込むファイル名' + (crlf ? '（DOS 形式）' : '') + ': ', file ? (file.startsWith(sh.cwd + '/') ? file.slice(sh.cwd.length + 1) : file) : '');
        if (v == null || !v.trim()) { say('取り消しました'); return false; }
        name = sh.abs(v.trim());
        if (name !== file && fs.exists(name)) {
          if (fs.isDir(name)) { say(name + ' はディレクトリです', 'err'); return false; }
          const r = await ask('ファイルがあります。上書きしますか？ ');
          if (r !== 'y') { say('取り消しました'); return false; }
        }
      }
      try { return save(name); } catch (e) { say('書き込めません: ' + e.message, 'err'); return false; }
    }
    async function readFile() {
      if (ro()) return;
      const v = await prompt('挿入するファイル: ', '');
      if (v == null || !v.trim()) { say('取り消しました'); return; }
      const p = sh.abs(v.trim());
      try {
        const st = fs.stat(p); if (!st) throw new Error('ありません'); if (st.t === 'd') throw new Error('ディレクトリです'); if (st.b) throw new Error('バイナリファイルです');
        const t = String(fs.read(p)).replace(/\r\n?/g, '\n');
        snap('read'); insertText(t);
        say(t.split('\n').length + ' 行を読み込みました');
      } catch (e) { say(p + ': ' + e.message, 'err'); }
    }
    async function execCmd() {
      if (ro()) return;
      const v = await prompt('実行するコマンド: ', '', cmdHist);
      if (v == null || !v.trim()) { say('取り消しました'); return; }
      try {
        draw([['実行しています…', 'dim']]);
        const out = String(await sh.cmd(v)).replace(/\r\n?/g, '\n');
        snap('exec'); insertText(out);
        say('コマンドの出力を挿入しました');
      } catch (e) { say(e.message || String(e), 'err'); }
    }
    async function quit() {
      if (!modified || opt.view) return true;
      const r = await ask('変更されたバッファを保存しますか？ ');
      if (r == null) { say('取り消しました'); return false; }
      if (r === 'n') return true;
      return writeOut(false);
    }

    // ---- キーの処理
    try {
      for (;;) {
        draw();
        const k0 = await scr.key();
        let k = k0;
        if (k.key === 'Escape' && !esc) { esc = true; continue; } // Esc の次のキーは Alt つき（端末の nano と同じ）
        if (esc) { esc = false; if (k.key === 'text' && k.text.length === 1) k = { key: k.text.toLowerCase(), alt: true }; else if (k.key !== 'Escape') k = Object.assign({}, k, { alt: true }); }
        if (k.key !== 'resize') { msg = msg && k.key === 'click' ? msg : ''; }
        const wasCut = lastCut; lastCut = false;
        const K = k.key, C = !!k.ctrl && !k.alt, M = !!k.alt;
        // Shift+矢印で範囲を選ぶ
        const moveKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(K);
        if (moveKey && k.shift && !mark) { mark = { y: cy, x: cx }; autoMark = true; }
        else if (moveKey && !k.shift && autoMark) { mark = null; autoMark = false; }
        if (K !== 'text' && K !== 'Backspace' && K !== 'Delete' && !(C && (K === 'h' || K === 'd'))) lastEdit = '';

        if (K === 'resize') continue;
        if (K === 'click') {
          const y = top + k.row - 1, g = gutter();
          if (k.row >= 1 && k.row <= textRows() && y < lines.length) { cy = y; cx = idxAt(lines[cy], Math.max(0, k.col - g)); want = colOf(lines[cy], cx); if (autoMark) { mark = null; autoMark = false; } }
          continue;
        }
        if (K === 'text') {
          if (ro()) continue;
          if (k.paste) snap('paste'); else snap('type');
          insertText(k.text);
          continue;
        }
        if (K === 'Enter' && !C && !M) { newline(); continue; }
        if (K === 'Tab' && !C && !M) { if (ro()) continue; snap('type'); insertText(opt.spaces ? ' '.repeat(opt.tab - colOf(lines[cy], cx) % opt.tab) : '\t'); continue; }
        if ((K === 'Backspace' && !M) || (C && K === 'h')) { backspace(); continue; }
        if ((K === 'Delete' && !M) || (C && K === 'd')) { del(); continue; }
        if (K === 'ArrowUp' || (C && K === 'p')) { if (k.alt) continue; vmove(-1); continue; }
        if (K === 'ArrowDown' || (C && K === 'n')) { if (k.alt) continue; vmove(1); continue; }
        if (K === 'ArrowLeft' || (C && K === 'b')) { if (K === 'ArrowLeft' && k.ctrl) wordMove(-1); else hmove(-1); continue; }
        if (K === 'ArrowRight') { if (k.ctrl) wordMove(1); else hmove(1); continue; }
        if (K === 'Home' || (C && K === 'a')) { if (k.ctrl && K === 'Home') cy = 0; cx = 0; want = 0; continue; }
        if (K === 'End' || (C && K === 'e')) { if (k.ctrl && K === 'End') cy = lines.length - 1; cx = lines[cy].length; want = colOf(lines[cy], cx); continue; }
        if (K === 'PageUp' || (C && K === 'y')) { const H = textRows(); top = Math.max(0, top - H + 2); vmove(-(H - 2)); continue; }
        if (K === 'PageDown' || (C && K === 'v')) { const H = textRows(); top = Math.min(Math.max(0, lines.length - 1), top + H - 2); vmove(H - 2); continue; }
        if ((M && K === '\\') || (M && K === ',')) { cy = 0; cx = 0; want = 0; continue; }
        if ((M && K === '/') || (M && K === '.')) { cy = lines.length - 1; cx = lines[cy].length; want = colOf(lines[cy], cx); continue; }
        if ((C && K === 'g') || K === 'F1') { await help(); continue; }
        if ((C && K === 'x') || K === 'F2') { if (await quit()) break; continue; }
        if ((C && K === 'o') || K === 'F3') { await writeOut(false); continue; }
        if (C && K === 's') { await writeOut(true); continue; }
        if ((C && K === 'r') || K === 'F5') { await readFile(); continue; }
        if ((C && K === 't') || K === 'F12') { await execCmd(); continue; }
        if ((C && (K === 'f' || K === 'w')) || K === 'F6') { await search(false); continue; }
        if (M && K === 'w') { again(false); continue; }
        if (M && K === 'q') { again(true); continue; }
        if ((C && K === '\\') || (M && K === 'r') || K === 'F14') { await replace(); continue; }
        if ((C && K === 'k') || K === 'F9') { lastCut = wasCut; cutLine(); continue; }
        if ((C && K === 'u') || K === 'F10') { paste(); continue; }
        if (M && K === '6') { lastCut = wasCut; copyLine(); continue; }
        if ((M && K === 'a') || (C && K === ' ')) { if (mark) { mark = null; autoMark = false; say('選択をやめました'); } else { mark = { y: cy, x: cx }; autoMark = false; say('選択を始めました'); } continue; }
        if ((M && K === 'u') || (C && K === 'z')) { doUndo(undo, redo, 'u'); continue; }
        if (M && K === 'e') { doUndo(redo, undo, 'r'); continue; }
        if ((C && K === 'c') || K === 'F11') { showPos(); continue; }
        if ((C && (K === '_' || K === '/' || K === '-')) || (M && K === 'g') || K === 'F13') { await gotoLine(); continue; }
        if (M && (K === 'n' || K === '#' || K === '3')) { showLines = !showLines; say('行番号を' + (showLines ? '表示します' : '隠しました')); continue; }
        if (M && K === 'i') { opt.indent = !opt.indent; say('自動インデント: ' + (opt.indent ? 'オン' : 'オフ')); continue; }
        if (C && K === 'l') { size = scr.size(); top = Math.max(0, cy - Math.floor(textRows() / 2)); continue; }
        if (K === 'Escape') continue;
        if (C || M) say('このキーには何も割り当てられていません（^G でヘルプ）');
      }
    } finally {
      scr.close();
    }
    return undefined;
  }

  OS.registerCommand({
    name: 'nano', usage: 'nano [-l] [-v] [-i] [-E] [-T 幅] [+行[,列]] [ファイル]',
    desc: '端末の中で使うテキストエディタ（GNU nano と同じキー操作。^O 保存、^X 終了、^G ヘルプ）',
    run: nano
  });
  OS.nano = { version: VERSION };
})();
