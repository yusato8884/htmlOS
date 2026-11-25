/* hArchive — アーカイブマネージャー（htmlOS 7.3）。ZIP・tar・tar.gz・gz を開く・作る・展開する・中身を足す・消す
   中身の読み書きは OS.archive（/sys/archive.js）。PC のファイルをウインドウに落とすと、アーカイブなら開き、開いているときは中に足す */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path;
  const FMT_NAME = { zip: 'ZIP', tar: 'tar', 'tar.gz': 'tar.gz（gzip で圧縮した tar）', gz: 'gz（ファイル 1 つだけ）' };
  const fmtDate = ms => { if (!ms) return ''; const d = new Date(ms), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };

  OS.registerApp({
    id: 'harchive', name: 'hArchive', icon: 'archive', color: '#986a44', desc: 'アーカイブマネージャー（ZIP・tar・tar.gz・gz）',
    launch(arg) {
      const A = OS.archive, ui = OS.ui, fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hArchive', icon: 'archive', w: 760, h: 480, app: 'harchive' });
      if (!A) { win.body.append(h('p', { class: 'hk-empty' }, 'アーカイブの機能（/sys/archive.js）がありません')); return win; }
      // arc: 開いているアーカイブ { format, name, entries }。file: hFS の場所（PC から落としたものは null）
      let arc = null, file = null, dir = '', sel = new Set(), busy = false, dirty = false;
      const tmp = '/tmp/harchive-' + win.pid;
      const crumbs = h('div', { class: 'ha-crumbs' }), tbody = h('tbody'), stat = h('span', { class: 'grow' }), info = h('span');
      const table = h('table', { class: 'tbl ha-tbl' }, h('thead', null, h('tr', null, h('th', null, '名前'), h('th', { class: 'num' }, 'サイズ'), h('th', { class: 'num ha-cs' }, '圧縮後'), h('th', { class: 'num' }, '更新日時'))), tbody);
      const empty = h('div', { class: 'ha-empty' }, OS.icon('archive', 56), h('p', null, 'アーカイブ（ZIP・tar・tar.gz・gz）を開くか、新しく作ってください。'),
        h('div', { class: 'ha-ebtns' }, h('button', { class: 'btn primary', type: 'button', id: 'ha-open2', onclick: () => pickOpen() }, 'アーカイブを開く…'), h('button', { class: 'btn', type: 'button', onclick: () => createDlg([]) }, '新しく作る…')),
        h('small', null, 'PC のファイルをここに落としても開けます'));
      const view = h('div', { class: 'ha-view' }, table, empty);
      const up = h('input', { type: 'file', multiple: true, style: 'display:none', id: 'ha-up-' + win.pid });
      const tb = (icon, label, fn, title, id) => h('button', { class: 'tbtn', type: 'button', title: title || label, id: id || null, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const bExtract = tb('download', '展開…', () => extractDlg(), '選んだもの（選んでいなければ全部）をフォルダに展開', 'ha-extract'),
        bAddF = tb('plus', 'ファイル', () => addPick(false), 'ファイルを中に足す'), bAddD = tb('plus', 'フォルダ', () => addPick(true), 'フォルダを中身ごと中に足す'),
        bAddPC = tb('upload', 'PCから', () => up.click(), 'PC のファイルを中に足す'), bDel = tb('trash', '削除', () => delSel(), '選んだものをアーカイブから消す'),
        bUp = tb('up', null, () => go(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''), '上のフォルダへ'), bSaveAs = tb('save', '別名で保存…', () => saveAs(), 'アーカイブを別の名前・形式で保存');
      win.body.append(h('div', { class: 'ha' },
        h('div', { class: 'toolbar' }, tb('folder', '開く…', () => pickOpen(), 'アーカイブを開く', 'ha-open'), tb('plus', '新規…', () => createDlg([]), '新しいアーカイブを作る'), h('span', { class: 'sep' }),
          bExtract, h('span', { class: 'sep' }), bAddF, bAddD, bAddPC, bDel, h('span', { class: 'sep' }), bSaveAs, up),
        h('div', { class: 'ha-nav' }, bUp, crumbs), view,
        h('div', { class: 'statusbar' }, stat, info)));

      const err = e => { setBusy(false); ui.alert(e.message, 'hArchive'); };
      function setBusy(v, msg) { busy = v; win.body.classList.toggle('ha-busy', v); if (msg != null) stat.textContent = msg; buttons(); }
      const children = d => arc.entries.filter(e => { const p = e.name.lastIndexOf('/'); return (p < 0 ? '' : e.name.slice(0, p)) === d; });
      const sumOf = e => { if (!e.dir) return [e.size || 0, e.csize || 0, 1]; let a = 0, b = 0, n = 0; arc.entries.forEach(x => { if (!x.dir && x.name.startsWith(e.name + '/')) { a += x.size || 0; b += x.csize || 0; n++; } }); return [a, b, n]; };
      function go(d) { dir = d; sel.clear(); render(); }
      function render() {
        const has = !!arc;
        table.hidden = !has; empty.hidden = has;
        win.setTitle((has ? (file ? path.base(file) : arc.name || '無題') + (dirty ? ' *' : '') + ' — ' : '') + 'hArchive');
        crumbs.textContent = ''; tbody.textContent = '';
        if (!has) { stat.textContent = ''; info.textContent = ''; buttons(); return; }
        if (!arc.entries.some(e => e.dir && e.name === dir)) dir = '';
        const parts = dir ? dir.split('/') : [];
        crumbs.append(h('button', { class: 'ha-crumb', type: 'button', onclick: () => go('') }, OS.icon('archive', 14), arc.name || '無題'));
        parts.forEach((p, i) => crumbs.append(h('span', { class: 'ha-sepch' }, '›'), h('button', { class: 'ha-crumb', type: 'button', onclick: () => go(parts.slice(0, i + 1).join('/')) }, p)));
        table.querySelector('.ha-cs').hidden = arc.format !== 'zip';
        const rows = children(dir).sort((a, b) => (!!b.dir - !!a.dir) || a.name.localeCompare(b.name));
        if (!rows.length) tbody.append(h('tr', null, h('td', { colspan: 4, class: 'ha-none' }, arc.entries.length ? 'このフォルダは空です' : '空のアーカイブです。「ファイル」「フォルダ」「PCから」で中身を足すか、ファイルをここに落としてください')));
        rows.forEach(e => {
          const s = sumOf(e), nm = e.name.slice(e.name.lastIndexOf('/') + 1);
          const tr = h('tr', { class: 'ha-row' + (sel.has(e.name) ? ' cur' : ''), tabindex: 0, 'data-name': e.name, title: e.unsafe ? '危ない名前（.. を含む）なので展開しません' : e.name },
            h('td', null, h('span', { class: 'ha-nm' }, OS.icon(e.dir ? 'folder' : e.link != null || e.linkRaw ? 'share' : OS.htui.fileIcon(nm), 16), nm + (e.link != null ? ' → ' + e.link : ''), e.unsafe ? h('b', { class: 'ha-bad' }, ' ⚠') : null)),
            h('td', { class: 'num' }, e.dir ? s[2] + ' 個' : A.fmtSize(s[0])),
            h('td', { class: 'num ha-cs', hidden: arc.format !== 'zip' }, e.dir ? '' : A.fmtSize(s[1])),
            h('td', { class: 'num' }, fmtDate(e.mtime)));
          tr.addEventListener('click', ev => { if (ev.ctrlKey || ev.metaKey) { sel.has(e.name) ? sel.delete(e.name) : sel.add(e.name); } else { sel.clear(); sel.add(e.name); } paintSel(); });
          tr.addEventListener('dblclick', () => openEntry(e));
          tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') openEntry(e); else if (ev.key === 'Delete') { sel.clear(); sel.add(e.name); delSel(); } else if (ev.key === 'Backspace' && dir) { ev.preventDefault(); bUp.click(); } });
          tr.addEventListener('contextmenu', ev => { ev.preventDefault(); if (!sel.has(e.name)) { sel.clear(); sel.add(e.name); paintSel(); } rowMenu(ev, e); });
          tbody.append(tr);
        });
        let raw = 0, files = 0; arc.entries.forEach(e => { if (!e.dir) { raw += e.size || 0; files++; } });
        info.textContent = FMT_NAME[arc.format].split('（')[0] + ' ・ ' + files + ' 個のファイル ・ 中身 ' + A.fmtSize(raw) + (arc.size != null ? ' → ' + A.fmtSize(arc.size) + (raw && arc.size < raw ? '（' + Math.round((1 - arc.size / raw) * 100) + '% 縮小）' : '') : '');
        if (!busy) stat.textContent = file ? file : 'PC から開いたアーカイブ（変えたら「別名で保存」で hFS に保存してください）';
        paintSel();
      }
      function paintSel() { tbody.querySelectorAll('.ha-row').forEach(r => r.classList.toggle('cur', sel.has(r.dataset.name))); buttons(); }
      function buttons() {
        const has = !!arc, canEdit = has && arc.format !== 'gz' && !busy;
        bExtract.disabled = !has || busy || !arc.entries.length; bSaveAs.disabled = !has || busy;
        [bAddF, bAddD, bAddPC].forEach(b => { b.disabled = !canEdit; });
        bDel.disabled = !canEdit || !sel.size; bUp.disabled = !has || !dir;
      }
      function rowMenu(ev, e) {
        OS.htui.menuAt(ev.clientX, ev.clientY, [{ head: e.name.slice(e.name.lastIndexOf('/') + 1) },
          { label: e.dir ? '開く' : '開く（一時フォルダに取り出して）', icon: e.dir ? 'folder' : 'file', act: () => openEntry(e) },
          { label: '展開…', icon: 'download', act: () => extractDlg() },
          { label: 'アーカイブから削除', icon: 'trash', disabled: arc.format === 'gz', act: () => delSel() }]);
      }

      // ----- 開く
      async function openPath(p) {
        try {
          setBusy(true, p + ' を開いています…');
          const a = await A.open(fsx, p);
          arc = a; file = p; dir = ''; sel.clear(); dirty = false; setBusy(false); render();
        } catch (e) { err(e); }
      }
      async function openBlob(f) {
        try { setBusy(true, f.name + ' を開いています…'); const a = await A.openBytes(new Uint8Array(await f.arrayBuffer()), f.name); arc = a; file = null; dir = ''; sel.clear(); dirty = false; setBusy(false); render(); }
        catch (e) { err(e); }
      }
      async function pickOpen() {
        const p = await ui.pickFile({ mode: 'open', dir: file ? path.dir(file) : home, kinds: ['archive'], title: 'アーカイブを開く' });
        if (p) openPath(p);
      }
      async function openEntry(e) {
        if (e.dir) return go(e.name);
        try {
          if (e.unsafe) throw new Error('危ない名前（.. を含む）なので取り出せません');
          setBusy(true, e.name + ' を取り出しています…');
          const r = await A.extract(fsx, arc, tmp, { only: [e.name], overwrite: true });
          setBusy(false); render();
          const p = r.written[0]; if (p) OS.openFile(p);
        } catch (x) { err(x); }
      }

      // ----- 展開
      async function extractDlg() {
        if (!arc) return;
        const only = [...sel];
        const base = file ? path.dir(file) : home + '/Downloads';
        const dest = h('input', { class: 'inp', id: 'ha-dest', value: path.join(base, A.stem(file || arc.name || 'archive')), spellcheck: 'false' });
        const ow = h('input', { type: 'checkbox', id: 'ha-ow' });
        const r = await ui.modal({ title: '展開', width: 440, body: h('div', { class: 'hk-form' },
          h('p', { class: 'modal-msg' }, only.length ? '選んだ ' + only.length + ' 個（フォルダは中身ごと）を展開します。' : 'すべてを展開します。'),
          h('div', { class: 'hk-f' }, h('span', null, '展開先'), h('div', { class: 'hk-fv' }, dest, h('button', { class: 'btn small', type: 'button', onclick: async () => { const d = await ui.pickFile({ mode: 'dir', dir: fsx.isDir(dest.value) ? dest.value : base, title: '展開先のフォルダ' }); if (d) dest.value = d; } }, '選ぶ…'))),
          h('label', { class: 'ha-chk' }, ow, '同じ名前のファイルがあったら上書きする')),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: '展開', primary: true, value: () => dest.value.trim() ? path.norm(dest.value.trim(), home, home) : ui.KEEP }] });
        if (!r) return;
        try {
          setBusy(true, '展開しています…');
          const res = await A.extract(fsx, arc, r, { only: only, overwrite: ow.checked, progress: (e, i, n) => { stat.textContent = '展開しています… ' + (i + 1) + ' / ' + n; } });
          setBusy(false); render();
          const notes = [res.skipped.length ? res.skipped.length + ' 個はすでにあったので飛ばしました' : '', res.unsafe.length ? '危ない名前の ' + res.unsafe.length + ' 個は展開しませんでした' : ''].filter(Boolean);
          OS.notify({ app: 'hArchive', icon: 'archive', title: '展開しました', body: res.files + ' 個のファイル → ' + r + (notes.length ? '（' + notes.join('、') + '）' : '') });
          if (notes.length) ui.alert(notes.join('\n'), '展開しました');
          OS.launch('hfile', r);
        } catch (e) { err(e); }
      }

      // ----- 中身を変える（足す・消す）。そのあと同じ形式で作り直して保存する
      function ensureDirs(list) {
        const names = new Set(list.map(e => e.name));
        list.slice().forEach(e => { const p = e.name.split('/'); for (let i = 1; i < p.length; i++) { const d = p.slice(0, i).join('/'); if (!names.has(d)) { names.add(d); list.push({ name: d, dir: true, size: 0, csize: 0, mtime: Date.now(), bytes: async () => new Uint8Array(0) }); } } });
        return list;
      }
      async function commit(entries, msg) {
        const map = new Map(); entries.forEach(e => map.set(e.name, e));
        const list = ensureDirs([...map.values()]).sort((a, b) => a.name.localeCompare(b.name));
        if (!file) { arc = Object.assign({}, arc, { entries: list, size: null }); dirty = true; render(); return saveAs(); }
        try {
          setBusy(true, msg || '保存しています…');
          const u8 = await A.build(list, arc.format, { progress: (e, i, n) => { stat.textContent = (msg || '保存しています…') + ' ' + (i + 1) + ' / ' + n; } });
          fsx.write(file, 'data:' + A.mime[arc.format] + ';base64,' + A.bytesToB64(u8), { bin: true });
          const keep = dir; arc = await A.openBytes(u8, file); dir = keep; dirty = false;
          setBusy(false); render();
        } catch (e) { err(e); }
      }
      const prefix = () => dir ? dir + '/' : '';
      async function addPaths(paths) {
        if (!arc || arc.format === 'gz') return;
        try {
          const add = A.gather(fsx, paths.map(p => ({ path: p, name: prefix() + path.base(p) })), { links: arc.format !== 'zip', exclude: file ? [OS.fs.real(file)] : [] });
          await commit(arc.entries.concat(add), add.length + ' 個を足しています…');
          OS.ui.toast(paths.map(p => path.base(p)).join('、') + ' を足しました');
        } catch (e) { err(e); }
      }
      async function addFiles(files) {
        if (!arc || arc.format === 'gz') return;
        const add = Array.from(files).map(f => ({ name: prefix() + f.name, size: f.size, mtime: f.lastModified || Date.now(), owner: OS.htui.user, bytes: async () => new Uint8Array(await f.arrayBuffer()) }));
        await commit(arc.entries.concat(add), add.length + ' 個を足しています…');
      }
      async function addPick(folder) {
        const p = await ui.pickFile({ mode: folder ? 'dir' : 'open', dir: file ? path.dir(file) : home, title: folder ? '足すフォルダ' : '足すファイル' });
        if (p) addPaths([p]);
      }
      async function delSel() {
        if (!arc || !sel.size || arc.format === 'gz') return;
        const names = [...sel];
        if (!(await ui.confirm(names.map(n => n.slice(n.lastIndexOf('/') + 1)).join('、') + ' をアーカイブから消しますか？（フォルダは中身ごと。PC やほかの場所のファイルは消えません）', { ok: '削除', danger: true, title: 'hArchive' }))) return;
        sel.clear();
        commit(arc.entries.filter(e => !names.some(n => e.name === n || e.name.startsWith(n + '/'))), '消しています…');
      }

      // ----- 作る・別名で保存
      const fmtSel = (cur, n) => h('select', { class: 'inp', id: 'ha-fmt' }, A.formats.map(f => h('option', { value: f, selected: f === cur, disabled: f === 'gz' && n !== 1 }, FMT_NAME[f])));
      function nameFor(base, fmt) { return base.replace(/\.(tar\.gz|tgz|tar|zip|gz)$/i, '') + A.ext[fmt]; }
      async function createDlg(sources) {
        const one = sources.length === 1 && fsx.isFile(sources[0]);
        const baseDir = sources.length ? path.dir(sources[0]) : home + '/Documents';
        const stemName = sources.length === 1 ? (fsx.isDir(sources[0]) ? path.base(sources[0]) : path.base(sources[0]).replace(/\.[^.]+$/, '') || path.base(sources[0])) : sources.length ? path.base(baseDir) || 'archive' : '新しいアーカイブ';
        const fmt = fmtSel('zip', one ? 1 : 0);
        const out = h('input', { class: 'inp', id: 'ha-out', value: fsx.unique(path.join(baseDir, stemName + '.zip')), spellcheck: 'false' });
        const store = h('input', { type: 'checkbox', id: 'ha-store' });
        const e2 = h('p', { class: 'cr-prev bad' });
        // 保存先を自分で書き換えていなければ、形式を変えたときにその拡張子で名前を付け直す（同じ名前があれば「名前 (1)」）
        let auto = true; out.addEventListener('input', () => { auto = false; });
        fmt.addEventListener('change', () => {
          const f = fmt.value, nm = f === 'gz' && one ? path.base(sources[0]) + '.gz' : stemName + A.ext[f];
          out.value = auto ? fsx.unique(path.join(baseDir, nm)) : nameFor(out.value, f);
          store.disabled = f !== 'zip';
        });
        const r = await ui.modal({ title: sources.length ? '圧縮' : '新しいアーカイブ', width: 460, body: h('div', { class: 'hk-form' },
          sources.length ? h('p', { class: 'modal-msg ha-srcs' }, '入れるもの: ' + sources.map(s => path.base(s) + (fsx.isDir(s) ? '/' : '')).join('、')) : h('p', { class: 'modal-msg' }, '空のアーカイブを作って開きます。あとから中身を足せます。'),
          h('div', { class: 'hk-f' }, h('span', null, '形式'), h('div', { class: 'hk-fv' }, fmt)),
          h('div', { class: 'hk-f' }, h('span', null, '保存先'), h('div', { class: 'hk-fv' }, out, h('button', { class: 'btn small', type: 'button', onclick: async () => { const p = await ui.pickFile({ mode: 'save', dir: path.dir(out.value), name: path.base(out.value) }); if (p) { out.value = p; auto = false; } } }, '選ぶ…'))),
          h('label', { class: 'ha-chk' }, store, '圧縮しない（まとめるだけ。ZIP のとき）'), e2),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: sources.length ? '圧縮' : '作る', primary: true, value: () => {
            const p = path.norm(out.value.trim(), home, home);
            if (!out.value.trim()) return ui.KEEP;
            if (fsx.isDir(p)) { e2.textContent = '同じ名前のフォルダがあります'; return ui.KEEP; }
            if (!sources.length && fmt.value === 'gz') { e2.textContent = '空の gz は作れません（ZIP か tar にしてください）'; return ui.KEEP; }
            return { out: p, format: fmt.value, level: store.checked ? 0 : 6 };
          } }] });
        if (!r) return;
        if (fsx.exists(r.out) && !(await ui.confirm(path.base(r.out) + ' はすでにあります。上書きしますか？', { ok: '上書き', danger: true, title: 'hArchive' }))) return;
        try {
          setBusy(true, '圧縮しています…');
          if (sources.length) {
            const res = await A.create(fsx, sources.map(s => ({ path: s, name: path.base(s) })), r.out, { format: r.format, level: r.level, progress: (e, i, n) => { stat.textContent = '圧縮しています… ' + (i + 1) + ' / ' + n + '  ' + e.name; } });
            OS.notify({ app: 'hArchive', icon: 'archive', title: '圧縮しました', body: path.base(r.out) + '（' + res.count + ' 個のファイル、' + A.fmtSize(res.raw) + ' → ' + A.fmtSize(res.size) + '）', silent: true });
          } else {
            const u8 = await A.build([], r.format, {});
            fsx.write(r.out, 'data:' + A.mime[r.format] + ';base64,' + A.bytesToB64(u8), { bin: true });
          }
          setBusy(false); await openPath(r.out);
        } catch (e) { err(e); }
      }
      async function saveAs() {
        if (!arc) return;
        const files = arc.entries.filter(e => !e.dir).length;
        const fmt = fmtSel(arc.format, files);
        const out = h('input', { class: 'inp', id: 'ha-saveas', value: fsx.unique(file || path.join(home + '/Documents', arc.name || ('無題' + A.ext[arc.format]))), spellcheck: 'false' });
        fmt.addEventListener('change', () => { out.value = nameFor(out.value, fmt.value); });
        const r = await ui.modal({ title: '別名で保存', width: 440, body: h('div', { class: 'hk-form' },
          h('div', { class: 'hk-f' }, h('span', null, '形式'), h('div', { class: 'hk-fv' }, fmt)),
          h('div', { class: 'hk-f' }, h('span', null, '保存先'), h('div', { class: 'hk-fv' }, out, h('button', { class: 'btn small', type: 'button', onclick: async () => { const p = await ui.pickFile({ mode: 'save', dir: path.dir(out.value), name: path.base(out.value) }); if (p) out.value = p; } }, '選ぶ…')))),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: '保存', primary: true, value: () => out.value.trim() ? { out: path.norm(out.value.trim(), home, home), format: fmt.value } : ui.KEEP }] });
        if (!r) return;
        if (fsx.exists(r.out) && r.out !== file && !(await ui.confirm(path.base(r.out) + ' はすでにあります。上書きしますか？', { ok: '上書き', danger: true, title: 'hArchive' }))) return;
        try {
          setBusy(true, '保存しています…');
          const u8 = await A.build(arc.entries, r.format, {});
          fsx.write(r.out, 'data:' + A.mime[r.format] + ';base64,' + A.bytesToB64(u8), { bin: true });
          setBusy(false); ui.toast(path.base(r.out) + ' を保存しました（' + A.fmtSize(u8.length) + '）');
          await openPath(r.out);
        } catch (e) { err(e); }
      }

      // ----- 落とす（PC のファイル・デスクトップのアイコン）
      win.body.addEventListener('dragover', e => { const t = e.dataTransfer.types; if (t.includes('Files') || t.includes('text/x-htmlos-path')) { e.preventDefault(); win.body.classList.add('ha-drop'); } });
      win.body.addEventListener('dragleave', e => { if (!win.body.contains(e.relatedTarget)) win.body.classList.remove('ha-drop'); });
      win.body.addEventListener('drop', e => {
        win.body.classList.remove('ha-drop');
        const hp = e.dataTransfer.getData('text/x-htmlos-path'), files = e.dataTransfer.files;
        if (!hp && !(files && files.length)) return;
        e.preventDefault(); if (busy) return;
        if (hp) { if (!arc && A.isArchive(hp)) openPath(hp); else if (arc) addPaths([hp]); else createDlg([hp]); return; }
        if (!arc || (files.length === 1 && A.isArchive(files[0].name) && !arc.entries.length && !file)) { if (files.length === 1 && A.isArchive(files[0].name)) return openBlob(files[0]); }
        if (arc) addFiles(files); else ui.alert('アーカイブ（ZIP・tar・tar.gz・gz）を 1 つ落としてください。', 'hArchive');
      });
      up.addEventListener('change', () => { const f = Array.from(up.files); up.value = ''; if (f.length) addFiles(f); });
      win.onDispose = () => { try { if (OS.fs.exists(tmp)) OS.htui.fs.rm(tmp, { recursive: true }); } catch (e) { /* 片付けられなくてもよい */ } };
      win.onHibernate = () => ({ file: file, dir: dir });

      const rs = arg && arg.resume;
      render();
      if (rs && rs.file && fsx.isFile(rs.file)) openPath(rs.file).then(() => { if (arc && rs.dir) go(rs.dir); });
      else if (typeof arg === 'string' && arg) openPath(arg);
      else if (arg && Array.isArray(arg.create)) createDlg(arg.create);
      return win;
    }
  });
})();
