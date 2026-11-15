/* hedit — テキストエディター */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  OS.registerApp({
    id: 'hedit', name: 'hedit', icon: 'edit', color: '#e66100', desc: 'テキストエディター',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      let file = null, dirty = false;
      const win = OS.htui.open({ title: 'hedit', icon: 'edit', w: 720, h: 470, app: 'hedit' });
      const ta = h('textarea', { class: 'he-text', spellcheck: 'false', id: 'he-text-' + win.pid, 'aria-label': '本文' });
      const gut = h('div', { class: 'he-gutter', 'aria-hidden': 'true' }, '1');
      const stPos = h('span'), stInfo = h('span', { class: 'grow' }), stKind = h('span');
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const bRun = tb('play', '実行', runIt, 'jshスクリプトとして Terminal で実行');
      const bWrap = tb(null, '折り返し', () => { ta.classList.toggle('wrap'); bWrap.classList.toggle('on'); gut.style.display = ta.classList.contains('wrap') ? 'none' : ''; });
      const findInp = h('input', { class: 'inp', id: 'he-find-' + win.pid, placeholder: '検索する文字列', 'aria-label': '検索' });
      const findBar = h('div', { class: 'he-find', style: 'display:none' }, findInp,
        h('button', { class: 'btn small', type: 'button', onclick: () => findNext() }, '次を検索'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { findBar.style.display = 'none'; ta.focus(); } }, '閉じる'));
      win.body.append(
        h('div', { class: 'toolbar' }, tb('file', '新規', newDoc), tb('folder', '開く', openDlg), tb('save', '保存', save), tb(null, '別名で保存', saveAs),
          h('span', { class: 'sep' }), tb('search', '検索', showFind), bWrap, bRun,
          h('button', { class: 'tbtn touch-only', type: 'button', title: '字下げ（空白2つ）を入れる', onpointerdown: e => { e.preventDefault(); ta.focus(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); setDirty(true); } }, 'Tab')),
        findBar, h('div', { class: 'he-wrap' }, gut, ta), h('div', { class: 'statusbar' }, stInfo, stKind, stPos));

      let lines = 1;
      function refresh() {
        const n = ta.value.split('\n').length;
        if (n !== lines) { lines = n; const a = []; for (let i = 1; i <= n; i++) a.push(i); gut.textContent = a.join('\n'); }
        gut.scrollTop = ta.scrollTop;
        const before = ta.value.slice(0, ta.selectionStart).split('\n');
        stPos.textContent = '行 ' + before.length + '、列 ' + (before[before.length - 1].length + 1);
        stInfo.textContent = (file || '無題') + (dirty ? ' ・ 未保存' : '');
        stKind.textContent = ta.value.length + ' 文字';
        win.setTitle((dirty ? '● ' : '') + (file ? path.base(file) : '無題') + ' — hedit');
        bRun.disabled = !(file && /\.(js|jsh)$/.test(file));
      }
      const setDirty = d => { dirty = d; refresh(); };
      ta.addEventListener('input', () => setDirty(true));
      ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
      ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, refresh));
      ta.addEventListener('keydown', e => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); setDirty(true); }
      });
      win.el.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); if (e.shiftKey) saveAs(); else save(); }
        else if (k === 'o') { e.preventDefault(); openDlg(); }
        else if (k === 'f') { e.preventDefault(); showFind(); }
      });
      findInp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); findNext(); } else if (e.key === 'Escape') { findBar.style.display = 'none'; ta.focus(); } });

      function showFind() { findBar.style.display = 'flex'; const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s && !s.includes('\n')) findInp.value = s; findInp.focus(); findInp.select(); }
      function findNext() {
        const q = findInp.value; if (!q) return;
        let i = ta.value.indexOf(q, ta.selectionEnd);
        if (i < 0) i = ta.value.indexOf(q);
        if (i < 0) { ui.toast('「' + q + '」は見つかりません'); return; }
        ta.focus(); ta.setSelectionRange(i, i + q.length);
        const line = ta.value.slice(0, i).split('\n').length, lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        ta.scrollTop = Math.max(0, (line - 4) * lh);
        refresh();
      }
      async function discardOk() {
        if (!dirty) return true;
        const r = await ui.modal({ title: '変更を保存しますか?', body: h('p', { class: 'modal-msg' }, (file ? path.base(file) : '無題') + ' への変更が保存されていません。'),
          buttons: [{ label: 'キャンセル', cancel: true, value: 'cancel' }, { label: '保存しない', danger: true, value: 'discard' }, { label: '保存', primary: true, value: 'save' }] });
        if (r === 'save') return save();
        return r === 'discard';
      }
      function load(p) {
        try {
          const s = fsx.stat(p);
          if (s && s.t === 'f' && s.b) throw new Error(path.base(p) + ' はバイナリファイルなので hedit では開けません');
          ta.value = fsx.read(p); file = p; ta.setSelectionRange(0, 0); ta.scrollTop = 0; setDirty(false);
        } catch (e) { ui.alert(e.message); }
      }
      async function newDoc() { if (await discardOk()) { ta.value = ''; file = null; setDirty(false); ta.focus(); } }
      async function openDlg() {
        if (!(await discardOk())) return;
        const p = await ui.pickFile({ mode: 'open', dir: file ? path.dir(file) : home + '/Documents' });
        if (p) load(p);
      }
      async function write(p) {
        try { fsx.write(p, ta.value); file = p; setDirty(false); return true; }
        catch (e) {
          // 書けない場所（/sys など）は、root のパスワードを確認できたら root として保存する
          if (/許可がありません/.test(e.message) && (await ui.asRoot(p + ' を保存します。'))) {
            try { OS.fs.write(p, ta.value, { owner: 'root' }); file = p; setDirty(false); ui.toast('root として保存しました'); return true; }
            catch (e2) { ui.alert('保存できませんでした。\n' + e2.message); return false; }
          }
          if (!/許可がありません/.test(e.message)) ui.alert('保存できませんでした。\n' + e.message);
          return false;
        }
      }
      async function save() { return file ? write(file) : saveAs(); }
      async function saveAs() {
        const p = await ui.pickFile({ mode: 'save', allowRoot: true, dir: file ? path.dir(file) : home + '/Documents', name: file ? path.base(file) : '無題.txt' });
        if (!p) return false;
        if (p !== file && fsx.exists(p) && !(await ui.confirm(path.base(p) + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return false;
        return write(p);
      }
      async function runIt() {
        if (!file) return;
        if (dirty && !(await save())) return;
        OS.htui.run('terminal', { cmd: 'run ' + JSON.stringify(file) });
      }

      win.onClose = discardOk;
      win.onFocus = () => ta.focus();
      if (typeof arg === 'string' && arg) {
        if (fsx.exists(arg)) load(arg); else { file = arg; setDirty(false); }
      } else refresh();
      ta.focus();
      return win;
    }
  });
})();
