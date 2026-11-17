/* hFile — ファイルブラウザー */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  OS.registerApp({
    id: 'hfile', name: 'hFile', icon: 'folder', color: '#c88800', desc: 'ファイルブラウザー',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user), trash = OS.htui.trash;
      // コピー・切り取りは、デスクトップや別の hFile のウィンドウと共通
      const clipOf = () => OS.htui.fileClip;
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
        bRestore = tb('back', '元に戻す', restore, 'ゴミ箱から元の場所に戻す'), bEmpty = tb('trash', 'ゴミ箱を空にする', () => trash.empty(true)),
        bHidden = tb(null, '隠しファイル', () => { showHidden = !showHidden; bHidden.classList.toggle('on', showHidden); render(); }, '. で始まるファイルを表示');
      win.body.append(
        h('form', { class: 'toolbar', onsubmit: e => { e.preventDefault(); go(path.norm(addr.value, dir, home)); } },
          tb('back', null, () => { const p = back.pop(); if (p) go(p, true); }, '戻る'), tb('up', null, () => go(path.dir(dir)), '上のフォルダへ'), tb('reload', null, () => render(), '更新'),
          h('span', { class: 'grow' }, addr)),
        h('div', { class: 'toolbar' }, tb('plus', 'フォルダ', newDir, '新しいフォルダ'), tb('plus', 'ファイル', newFile, '新しいテキストファイル'), tb('upload', 'PCから', () => up.click(), 'PCのファイルを hFS に取り込む'),
          h('span', { class: 'sep' }), bOpen, bRen, bCopy, bCut, bPaste, bDel, bExp, bRestore, bEmpty, h('span', { class: 'sep' }), bHidden, up),
        h('div', { class: 'hf-main' }, side, grid),
        h('div', { class: 'statusbar' }, stSel, stUse, h('span', { class: 'hf-meter' }, meter)));

      const places = [['ホーム', home, 'home'], ['デスクトップ', home + '/Desktop', 'monitor'], ['Documents', home + '/Documents', 'text'], ['Downloads', home + '/Downloads', 'download'], ['Pictures', home + '/Pictures', 'image'], ['Music', home + '/Music', 'audio'], ['Videos', home + '/Videos', 'video'], ['/ (ルート)', '/', 'folder'], ['/sys', '/sys', 'gear'], ['/tmp', '/tmp', 'folder'], ['ゴミ箱', trash.dir(), 'trash']];
      const placeBtns = places.map(p => { const b = h('button', { class: 'hf-place', type: 'button', title: p[1], onclick: () => go(p[1]) }, OS.icon(p[2], 16), h('span', null, p[0])); side.append(b); return b; });

      const err = e => ui.alert(e.message);
      function go(p, isBack) {
        if (p === trash.dir()) { try { trash.ensure(); } catch (e) { /* 作れない */ } }
        try { fsx.list(p); } catch (e) { addr.value = dir; return err(e); }
        if (!isBack && p !== dir) back.push(dir);
        dir = p; sel = null; render();
      }
      function render() {
        addr.value = dir; grid.textContent = '';
        const inTrash = dir === trash.dir();
        win.setTitle((inTrash ? 'ゴミ箱' : dir === '/' ? '/' : path.base(dir)) + ' — hFile');
        win.body.classList.toggle('hf-trash', inTrash);
        placeBtns.forEach((b, i) => b.classList.toggle('on', places[i][1] === dir));
        let names = [];
        try { names = fsx.list(dir).filter(n => !(inTrash && n === '.info.json')); lastSig = names.join('|'); } catch (e) { lastSig = null; grid.append(h('div', { class: 'hf-empty' }, e.message)); }
        const rows = names.filter(n => showHidden || !n.startsWith('.')).map(n => { const p = path.join(dir, n); return { n: n, p: p, d: OS.fs.isDir(p) }; }).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
        if (!rows.length && lastSig !== null) grid.append(h('div', { class: 'hf-empty' }, inTrash ? 'ゴミ箱は空です' : 'このフォルダは空です'));
        rows.forEach(r => {
          const b = h('button', { class: 'hf-item' + (r.d ? ' dir' : '') + (r.p === sel ? ' sel' : ''), type: 'button', title: r.n }, OS.icon(r.d ? 'folder' : OS.htui.fileIcon(r.p), 34), h('span', { class: 'hf-name' }, r.n));
          b.addEventListener('click', () => { if (sel === r.p) return open(r.p); sel = r.p; grid.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); status(); });
          b.addEventListener('dblclick', () => open(r.p));
          b.addEventListener('contextmenu', e => { e.preventDefault(); select(r.p, b); itemMenu(e, r); });
          grid.append(b);
        });
        status();
      }
      function select(p, b) { sel = p; grid.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); if (b) b.classList.add('sel'); status(); }
      // 右クリック: ファイル・フォルダのメニューと、空いている場所のメニュー
      function itemMenu(e, r) {
        const kind = r.d ? 'dir' : OS.fs.kind(r.p), link = OS.fs.isLink(r.p);
        const items = [{ head: r.n + (link ? '（リンク）' : '') }, { label: '開く', icon: r.d ? 'folder' : OS.htui.fileIcon(r.p), act: () => open(r.p) }];
        if (!r.d && (kind === 'text' || kind === 'html' || kind === 'other')) items.push({ label: 'hedit で開く', icon: 'edit', act: () => OS.launch('hedit', r.p) });
        if (r.d) items.push({ label: 'ここで Terminal を開く', icon: 'terminal', act: () => OS.launch('terminal', { cmd: 'cd "' + r.p + '"' }) });
        if (trash.inside(dir)) {
          items.splice(1, items.length - 1, { label: '元に戻す', icon: 'back', act: restore }, { label: '完全に削除…', icon: 'trash', act: () => del(true) }, { sep: true });
        } else items.push({ sep: true },
          { label: 'コピー', act: () => setClip(false) }, { label: '切り取り', act: () => setClip(true) },
          { label: '名前を変更…', act: rename }, { label: 'ゴミ箱に移動', icon: 'trash', act: () => del() }, { label: '完全に削除…', act: () => del(true) },
          { sep: true });
        if (!r.d) items.push({ label: 'PC に書き出す', icon: 'download', act: exportSel });
        items.push({ label: 'パスをコピー', act: () => { navigator.clipboard.writeText(r.p).then(() => ui.toast('コピーしました: ' + r.p), () => ui.toast(r.p)); } },
          { label: '情報を見る', act: () => OS.htui.fileInfo(r.p) });
        OS.htui.menuAt(e.clientX, e.clientY, items);
      }
      function areaMenu(e) {
        const clip = clipOf();
        if (trash.inside(dir)) { OS.htui.menuAt(e.clientX, e.clientY, [{ label: 'ゴミ箱を空にする…', icon: 'trash', disabled: !trash.items().length, act: () => trash.empty(true) }, { label: '更新', icon: 'reload', act: () => render() }]); return; }
        OS.htui.menuAt(e.clientX, e.clientY, [
          { label: '新しいフォルダ…', icon: 'plus', act: newDir }, { label: '新しいファイル…', icon: 'plus', act: newFile },
          { label: '貼り付け' + (clip ? '（' + path.base(clip.path) + '）' : ''), disabled: !clip, act: paste },
          { sep: true }, { label: 'PC から取り込む…', icon: 'upload', act: () => up.click() },
          { label: 'ここで Terminal を開く', icon: 'terminal', act: () => OS.launch('terminal', { cmd: 'cd "' + dir + '"' }) },
          { sep: true }, { label: showHidden ? '隠しファイルを隠す' : '隠しファイルを表示', act: () => { showHidden = !showHidden; bHidden.classList.toggle('on', showHidden); render(); } },
          { label: '更新', icon: 'reload', act: () => render() }]);
      }
      grid.addEventListener('contextmenu', e => { if (e.target === grid || e.target.classList.contains('hf-empty')) { e.preventDefault(); select(null); areaMenu(e); } });
      function status() {
        const s = sel && OS.fs.stat(sel);
        if (!s) { sel = null; stSel.textContent = 'クリックで選択、もう一度クリックで開く'; }
        else stSel.textContent = path.base(sel) + ' ・ ' + (s.t === 'd' ? 'フォルダ' : fmtSize(s.c.length) + (s.b ? '（バイナリ）' : '')) + ' ・ 所有者 ' + (s.o || 'root') + ' ・ ' + new Date(s.m).toLocaleString('ja-JP');
        [bOpen, bRen, bCopy, bCut, bDel, bRestore].forEach(b => { b.disabled = !sel; });
        bExp.disabled = !(s && s.t === 'f'); bPaste.disabled = !clipOf();
        const inTrash = trash.inside(dir);
        bDel.lastChild.textContent = inTrash ? '完全に削除' : '削除';
        [bRen, bCopy, bCut, bPaste].forEach(b => { b.hidden = inTrash; });
        bRestore.hidden = !inTrash; bEmpty.hidden = !inTrash; bEmpty.disabled = !trash.items().length;
        if (inTrash && sel) { const f = trash.from(path.base(sel)); if (f) stSel.textContent += ' ・ 元の場所 ' + f; }
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
      function setClip(cut) { if (!sel) return; OS.htui.fileClip = { path: sel, cut: cut }; ui.toast(path.base(sel) + (cut ? ' を切り取りました' : ' をコピーしました')); status(); }
      function paste() {
        if (!clipOf()) return;
        try { sel = OS.htui.pasteInto(dir); render(); } catch (e) { err(e); render(); }
      }
      function restore() {
        if (!sel) return;
        try { const to = trash.restore(path.base(sel)); sel = null; render(); ui.toast(path.base(to) + ' を ' + path.dir(to) + ' に戻しました'); } catch (e) { err(e); }
      }
      // 削除: ふつうはゴミ箱へ。ゴミ箱の中・「完全に削除」・Shift+Delete のときは本当に消す
      async function del(now) {
        if (!sel) return;
        const isDir = OS.fs.isDir(sel), forever = now === true || trash.inside(dir);
        try {
          if (!forever) { trash.move(sel); sel = null; render(); return; }
          if (!(await ui.confirm(path.base(sel) + (isDir ? '（フォルダとその中身すべて）' : '') + ' を完全に削除しますか? 元に戻せません。', { ok: '削除', danger: true, title: '完全に削除' }))) return;
          if (trash.inside(dir)) trash.remove(path.base(sel)); else fsx.rm(sel, { recursive: true });
          sel = null; render();
        } catch (e) { err(e); }
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
      // ほかの場所（デスクトップ・別のウィンドウ・jsh）でこのフォルダが変わったら表示し直す
      const unwatch = fsx.watch(paths => { if (paths.some(p => path.dir(p) === dir || p === dir)) render(); });
      win.onDispose = unwatch;
      win.body.addEventListener('keydown', e => { if (e.target.closest('input')) return; if (e.key === 'Delete' && sel) { e.preventDefault(); del(e.shiftKey); } else if (e.key === 'F2' && sel && !trash.inside(dir)) { e.preventDefault(); rename(); } });
      win.onFocus = () => { let sig = null; try { sig = fsx.list(dir).join('|'); } catch (e) { /* 消えた */ } if (sig !== lastSig) render(); else status(); };
      const start = typeof arg === 'string' && arg && OS.fs.isDir(arg) ? arg : home;
      dir = start; render();
      if (typeof arg === 'string' && arg && !OS.fs.isDir(arg) && OS.fs.exists(arg)) { dir = path.dir(arg); sel = arg; render(); }
      return win;
    }
  });
})();
