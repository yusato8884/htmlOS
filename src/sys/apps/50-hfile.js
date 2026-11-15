/* hFile — ファイルブラウザー */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  let clip = null; // {path, cut} — hFile のウィンドウ間で共有
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  OS.registerApp({
    id: 'hfile', name: 'hFile', icon: 'folder', color: '#c88800', desc: 'ファイルブラウザー',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hFile', icon: 'folder', w: 800, h: 460, app: 'hfile' });
      let dir = home, sel = null, showHidden = false, lastSig = null;
      const back = [];
      const addr = h('input', { class: 'inp', id: 'hf-addr-' + win.pid, 'aria-label': '場所', spellcheck: 'false', style: 'font-family:var(--mono);font-size:13px' });
      const grid = h('div', { class: 'hf-grid' }), side = h('div', { class: 'hf-side' });
      const stSel = h('span', { class: 'grow' }), stUse = h('span'), meter = h('i');
      const up = h('input', { type: 'file', multiple: true, id: 'hf-up-' + win.pid, style: 'display:none' });
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, 'aria-label': title || label, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const bOpen = tb(null, '開く', () => sel && open(sel)), bRen = tb(null, '名前変更', rename), bCopy = tb(null, 'コピー', () => setClip(false)), bCut = tb(null, '切り取り', () => setClip(true)),
        bPaste = tb(null, '貼り付け', paste), bDel = tb('trash', '削除', del), bExp = tb('download', 'PCへ', exportSel, '選択したファイルをPCに書き出す'),
        bHidden = tb(null, '隠しファイル', () => { showHidden = !showHidden; bHidden.classList.toggle('on', showHidden); render(); }, '. で始まるファイルを表示');
      win.body.append(
        h('form', { class: 'toolbar', onsubmit: e => { e.preventDefault(); go(path.norm(addr.value, dir, home)); } },
          tb('back', null, () => { const p = back.pop(); if (p) go(p, true); }, '戻る'), tb('up', null, () => go(path.dir(dir)), '上のフォルダへ'), tb('reload', null, () => render(), '更新'),
          h('span', { class: 'grow' }, addr)),
        h('div', { class: 'toolbar' }, tb('plus', 'フォルダ', newDir, '新しいフォルダ'), tb('plus', 'ファイル', newFile, '新しいテキストファイル'), tb('upload', 'PCから', () => up.click(), 'PCのファイルを hFS に取り込む'),
          h('span', { class: 'sep' }), bOpen, bRen, bCopy, bCut, bPaste, bDel, bExp, h('span', { class: 'sep' }), bHidden, up),
        h('div', { class: 'hf-main' }, side, grid),
        h('div', { class: 'statusbar' }, stSel, stUse, h('span', { class: 'hf-meter' }, meter)));

      const places = [['ホーム', home, 'home'], ['Documents', home + '/Documents', 'text'], ['Downloads', home + '/Downloads', 'download'], ['Pictures', home + '/Pictures', 'image'], ['Music', home + '/Music', 'audio'], ['Videos', home + '/Videos', 'video'], ['/ (ルート)', '/', 'folder'], ['/sys', '/sys', 'gear'], ['/tmp', '/tmp', 'folder']];
      const placeBtns = places.map(p => { const b = h('button', { class: 'hf-place', type: 'button', title: p[1], onclick: () => go(p[1]) }, OS.icon(p[2], 16), h('span', null, p[0])); side.append(b); return b; });

      const err = e => ui.alert(e.message);
      function go(p, isBack) {
        try { fsx.list(p); } catch (e) { addr.value = dir; return err(e); }
        if (!isBack && p !== dir) back.push(dir);
        dir = p; sel = null; render();
      }
      function render() {
        addr.value = dir; grid.textContent = '';
        win.setTitle((dir === '/' ? '/' : path.base(dir)) + ' — hFile');
        placeBtns.forEach((b, i) => b.classList.toggle('on', places[i][1] === dir));
        let names = [];
        try { names = fsx.list(dir); lastSig = names.join('|'); } catch (e) { lastSig = null; grid.append(h('div', { class: 'hf-empty' }, e.message)); }
        const rows = names.filter(n => showHidden || !n.startsWith('.')).map(n => { const p = path.join(dir, n); return { n: n, p: p, d: OS.fs.isDir(p) }; }).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
        if (!rows.length && lastSig !== null) grid.append(h('div', { class: 'hf-empty' }, 'このフォルダは空です'));
        rows.forEach(r => {
          const b = h('button', { class: 'hf-item' + (r.d ? ' dir' : '') + (r.p === sel ? ' sel' : ''), type: 'button', title: r.n }, OS.icon(r.d ? 'folder' : OS.htui.fileIcon(r.p), 34), h('span', { class: 'hf-name' }, r.n));
          b.addEventListener('click', () => { if (sel === r.p) return open(r.p); sel = r.p; grid.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); status(); });
          b.addEventListener('dblclick', () => open(r.p));
          grid.append(b);
        });
        status();
      }
      function status() {
        const s = sel && OS.fs.stat(sel);
        if (!s) { sel = null; stSel.textContent = 'クリックで選択、もう一度クリックで開く'; }
        else stSel.textContent = path.base(sel) + ' ・ ' + (s.t === 'd' ? 'フォルダ' : fmtSize(s.c.length) + (s.b ? '（バイナリ）' : '')) + ' ・ 所有者 ' + (s.o || 'root') + ' ・ ' + new Date(s.m).toLocaleString('ja-JP');
        [bOpen, bRen, bCopy, bCut, bDel].forEach(b => { b.disabled = !sel; });
        bExp.disabled = !(s && s.t === 'f'); bPaste.disabled = !clip;
        const u = fsx.usage();
        stUse.textContent = fmtSize(u.used) + ' / 5 MB';
        meter.style.width = Math.min(100, u.used / u.total * 100) + '%';
      }
      function open(p) { try { if (OS.fs.isDir(p)) go(p); else OS.openFile(p); } catch (e) { err(e); } }
      async function newDir() { const n = await ui.prompt('フォルダの名前', '新しいフォルダ', { title: '新しいフォルダ' }); if (!n) return; try { check(n); fsx.mkdir(path.join(dir, n)); sel = path.join(dir, n); render(); } catch (e) { err(e); } }
      async function newFile() { const n = await ui.prompt('ファイルの名前', '新しいファイル.txt', { title: '新しいファイル' }); if (!n) return; try { check(n); const p = path.join(dir, n); if (fsx.exists(p)) throw new Error(n + ' はすでにあります'); fsx.write(p, ''); sel = p; render(); } catch (e) { err(e); } }
      function check(n) { if (n.includes('/') || n === '.' || n === '..') throw new Error('その名前は使えません'); }
      async function rename() {
        if (!sel) return;
        const n = await ui.prompt('新しい名前', path.base(sel), { title: '名前の変更' });
        if (!n || n === path.base(sel)) return;
        try { check(n); const d = path.join(dir, n); if (fsx.exists(d)) throw new Error(n + ' はすでにあります'); fsx.mv(sel, d); sel = d; render(); } catch (e) { err(e); }
      }
      function setClip(cut) { if (!sel) return; clip = { path: sel, cut: cut }; ui.toast(path.base(sel) + (cut ? ' を切り取りました' : ' をコピーしました')); status(); }
      function paste() {
        if (!clip) return;
        try {
          if (!OS.fs.exists(clip.path)) { clip = null; throw new Error('元のファイルがなくなっています'); }
          const d = fsx.unique(path.join(dir, path.base(clip.path)));
          if (clip.cut) { fsx.mv(clip.path, d); clip = null; } else fsx.cp(clip.path, d);
          sel = d; render();
        } catch (e) { err(e); render(); }
      }
      async function del() {
        if (!sel) return;
        const isDir = OS.fs.isDir(sel);
        if (!(await ui.confirm(path.base(sel) + (isDir ? '（フォルダとその中身すべて）' : '') + ' を削除しますか? 元に戻せません。', { ok: '削除', danger: true, title: '削除' }))) return;
        try { fsx.rm(sel, { recursive: true }); sel = null; render(); } catch (e) { err(e); }
      }
      function exportSel() {
        try {
          const a = h('a', { href: fsx.dataURL(sel), download: path.base(sel) });
          document.body.append(a); a.click(); a.remove();
        } catch (e) { err(e); }
      }
      up.addEventListener('change', async () => {
        let ok = 0; const fails = [];
        for (const f of Array.from(up.files)) {
          try { const c = await OS.net.blobToContent(f, f.name); const d = fsx.unique(path.join(dir, f.name)); fsx.write(d, c.content, { bin: c.bin }); ok++; sel = d; }
          catch (e) { fails.push(f.name + ': ' + e.message); }
        }
        up.value = ''; render();
        if (fails.length) ui.alert('取り込めなかったファイルがあります。\n' + fails.join('\n'));
        else if (ok) ui.toast(ok + ' 個のファイルを取り込みました');
      });
      win.onFocus = () => { let sig = null; try { sig = fsx.list(dir).join('|'); } catch (e) { /* 消えた */ } if (sig !== lastSig) render(); else status(); };
      const start = typeof arg === 'string' && arg && OS.fs.isDir(arg) ? arg : home;
      dir = start; render();
      if (typeof arg === 'string' && arg && !OS.fs.isDir(arg) && OS.fs.exists(arg)) { dir = path.dir(arg); sel = arg; render(); }
      return win;
    }
  });
})();
