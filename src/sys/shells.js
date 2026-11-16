/* デスクトップ環境（セッション）
   htui  … HTUi       上にパネル、左にデスクトップアイコン（標準）
   win   … hWin       Windows 風。下にタスクバー、スタートメニュー
   gnome … hShell     GNOME 風。上にトップバー、アクティビティ画面とドック
   wm    … hwc        Labwc 風。パネルなしのウィンドウマネージャだけ。右クリックでメニュー
   どれも OS.registerSession({ id, name, desc, build(kit), ... }) で登録している。 */
(function () {
  const OS = window.OS, h = OS.h, htui = OS.htui;
  const logo = () => h('span', { class: 'os-logo', 'aria-hidden': 'true' }, '<', h('b', null, '/'), '>');

  // ======================================================== HTUi（標準）
  OS.registerSession({
    id: 'htui', name: 'HTUi', desc: '上にパネル、左にデスクトップアイコンが並ぶ標準のデスクトップです。',
    build(k) {
      const appsBtn = h('button', { class: 'p-btn', type: 'button', onclick: e => k.menu(e.currentTarget, k.apps().map(a => ({ label: a.name, hint: a.desc, icon: a.icon, act: () => k.run(a.id) }))) }, OS.icon('grid', 16), h('span', { class: 'p-lbl' }, 'アプリ'));
      const tasks = htui.tasks = h('div', { class: 'p-tasks' });
      const clock = k.clock(h('div', { class: 'p-clock' }), d => (d.getMonth() + 1) + '/' + d.getDate() + ' ' + k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()));
      htui.titleEl = h('div', { class: 'p-title' });
      htui.el.append(h('div', { class: 'panel' }, appsBtn, tasks, htui.titleEl, k.modeButton('p-btn'), clock, k.userButton('p-btn')), k.desk(true));
    }
  });

  // ======================================================== hWin（Windows 風）
  OS.registerSession({
    id: 'win', name: 'hWin（Windows 風）', desc: '下にタスクバー、左下のスタートボタンからアプリを開く、Windows 風のデスクトップです。',
    build(k) {
      const desk = k.desk(true);
      const tasks = htui.tasks = h('div', { class: 'tb-tasks' });
      const start = h('button', { class: 'tb-start', type: 'button', title: 'スタート（Ctrl+Esc）', 'aria-label': 'スタート', onclick: () => this.toggleStart() }, logo());
      const clock = k.clock(h('div', { class: 'tb-clock' }), d => k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()) + '\n' + d.getFullYear() + '/' + k.pad(d.getMonth() + 1) + '/' + k.pad(d.getDate()));
      const showDesk = h('button', { class: 'tb-showdesk', type: 'button', title: 'デスクトップを表示', 'aria-label': 'デスクトップを表示', onclick: () => {
        if (htui.wins.some(w => !w.el.classList.contains('hidden'))) htui.goHome(); else htui.wins.forEach(w => w.focus());
      } });
      htui.el.append(desk, h('div', { class: 'taskbar' }, start, tasks, h('div', { class: 'tb-tray' }, k.modeButton('tb-btn', { up: true }), clock, showDesk)));
      this.startBtn = start;
    },
    toggleStart() {
      const old = htui.el.querySelector('.startmenu');
      if (old) { old._close(); return; }
      const me = OS.users.get(htui.user), k = htui.kit;
      const q = h('input', { class: 'inp sm-search', id: 'sm-search', placeholder: 'アプリを検索', 'aria-label': 'アプリを検索', autocomplete: 'off' });
      const grid = h('div', { class: 'sm-grid' }), label = h('div', { class: 'sm-label' }, 'すべてのアプリ');
      const fill = () => {
        const t = q.value.trim().toLowerCase();
        const list = k.apps().filter(a => !t || (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t));
        grid.textContent = ''; label.textContent = t ? '検索結果' : 'すべてのアプリ';
        if (!list.length) grid.append(h('p', { class: 'sm-none' }, '見つかりませんでした'));
        list.forEach(a => grid.append(h('button', { class: 'sm-app', type: 'button', title: a.desc || a.name, onclick: () => { close(); k.run(a.id); } }, k.appIcon(a, 22), h('span', null, a.name))));
        return list;
      };
      q.addEventListener('input', fill);
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const l = fill(); if (l[0]) { close(); k.run(l[0].id); } } });
      const power = h('button', { class: 'sm-power', type: 'button', title: '電源', 'aria-label': '電源', onclick: e => k.menu(e.currentTarget, k.powerItems().slice(1), true, { up: true }) }, OS.icon('power', 18));
      const user = h('button', { class: 'sm-user', type: 'button', onclick: e => k.menu(e.currentTarget, [{ label: '設定', icon: 'gear', act: () => { close(); k.run('settings'); } }, { label: 'ログアウト', icon: 'user', act: () => htui.logout() }], false, { up: true }) }, k.avatar(me, 28), h('span', null, htui.user));
      const sm = h('div', { class: 'startmenu', role: 'dialog', 'aria-label': 'スタートメニュー' }, q, label, grid, h('div', { class: 'sm-foot' }, user, power));
      const off = e => { if (!sm.contains(e.target) && !this.startBtn.contains(e.target) && !e.target.closest('.menu')) close(); };
      const esc = e => { if (e.key === 'Escape' && !htui.el.querySelector('.menu')) { e.stopPropagation(); close(); } };
      function close() { sm.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); }
      sm._close = close;
      document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true);
      fill(); htui.el.append(sm);
      if (!OS.touch) q.focus();
    },
    onKey(e) { if (e.ctrlKey && e.key === 'Escape') { this.toggleStart(); return true; } }
  });

  // ======================================================== hShell（GNOME 風）
  OS.registerSession({
    id: 'gnome', name: 'hShell（GNOME 風）', desc: '上にトップバー。「アクティビティ」でウィンドウ一覧・ドック・アプリ一覧を出す、GNOME 風のデスクトップです。',
    build(k) {
      const self = this;
      const act = h('button', { class: 'gn-act', type: 'button', title: 'アクティビティ（Alt+F1）', onclick: () => self.overview() }, 'アクティビティ');
      htui.titleEl = h('div', { class: 'gn-app' });
      const clock = k.clock(h('div', { class: 'gn-clock' }), d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()));
      const status = h('button', { class: 'gn-status', type: 'button', 'aria-label': 'システムメニュー', onclick: e => k.menu(e.currentTarget, [
        { head: htui.user }, { label: '設定', icon: 'gear', act: () => k.run('settings') }, { sep: true }].concat(k.powerItems()), true) }, OS.icon('user', 16), OS.icon('power', 16));
      // 左上の角にポインタを当てるとアクティビティ（ホットコーナー）
      const hot = h('div', { class: 'gn-hot', 'aria-hidden': 'true' });
      hot.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !htui.el.classList.contains('dragging')) self.overview(true); });
      htui.el.append(h('div', { class: 'gn-bar' }, h('div', { class: 'gn-left' }, act, htui.titleEl), clock, h('div', { class: 'gn-right' }, k.modeButton('gn-btn'), status)), hot, k.desk(false));
    },
    onStart() { if (!OS.touch) this.overview(true); },
    // force=true なら開いているときに閉じない
    overview(force, apps) {
      const k = htui.kit, self = this;
      let ov = htui.el.querySelector('.gn-ov');
      if (ov) { if (!force) ov._close(); else if (apps != null) ov._mode(apps); return; }
      const q = h('input', { class: 'inp gn-search', id: 'gn-search', placeholder: '入力して検索', 'aria-label': 'アプリを検索', autocomplete: 'off' });
      const area = h('div', { class: 'gn-area' }), dock = h('div', { class: 'gn-dock' });
      ov = h('div', { class: 'gn-ov' }, q, area, dock);
      let showApps = !!apps;
      const close = () => { ov.remove(); document.removeEventListener('keydown', esc, true); };
      const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      ov._close = close; ov._mode = a => { showApps = a; render(); };
      ov.addEventListener('click', e => { if (e.target === ov || e.target === area) close(); });
      function render() {
        area.textContent = '';
        const t = q.value.trim().toLowerCase();
        if (showApps || t) {
          const list = k.apps().filter(a => !t || (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t));
          const g = h('div', { class: 'gn-apps' });
          list.forEach(a => g.append(h('button', { class: 'gn-appbtn', type: 'button', title: a.desc || a.name, onclick: () => { close(); k.run(a.id); } }, k.appIcon(a, 34), h('span', null, a.name))));
          if (!list.length) g.append(h('p', { class: 'gn-empty' }, '見つかりませんでした'));
          area.append(g);
        } else {
          const g = h('div', { class: 'gn-wins' });
          if (!htui.wins.length) g.append(h('p', { class: 'gn-empty' }, '開いているウィンドウはありません。下のドックからアプリを開いてください。'));
          htui.wins.forEach(w => {
            const a = OS.apps[w.app] || {};
            g.append(h('div', { class: 'gn-win' + (w === htui.active() ? ' cur' : '') },
              h('button', { class: 'gn-winbtn', type: 'button', onclick: () => { close(); w.focus(); } }, h('span', { class: 'gn-thumb' }, k.appIcon(a.icon ? a : { icon: 'file' }, 40)), h('span', { class: 'gn-wt' }, w.title)),
              h('button', { class: 'gn-wx', type: 'button', title: '閉じる', 'aria-label': w.title + ' を閉じる', onclick: async () => { await w.close(); render(); } }, OS.icon('x', 14))));
          });
          area.append(g);
        }
        dock.textContent = '';
        k.apps().forEach(a => dock.append(h('button', { class: 'gn-dk' + (htui.wins.some(w => w.app === a.id) ? ' run' : ''), type: 'button', title: a.name, 'aria-label': a.name, onclick: () => {
          const w = htui.wins.filter(x => x.app === a.id).sort((x, y) => (+y.el.style.zIndex || 0) - (+x.el.style.zIndex || 0))[0];
          close(); if (w) w.focus(); else k.run(a.id);
        } }, k.appIcon(a, 26))));
        dock.append(h('span', { class: 'gn-dsep' }), h('button', { class: 'gn-dk gn-grid' + (showApps ? ' on' : ''), type: 'button', title: 'アプリを表示', 'aria-label': 'アプリを表示', onclick: () => { showApps = !showApps; q.value = ''; render(); } }, OS.icon('grid', 22)));
      }
      q.addEventListener('input', render);
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = area.querySelector('.gn-appbtn'); if (b) b.click(); } });
      document.addEventListener('keydown', esc, true);
      render(); htui.el.append(ov);
      if (!OS.touch) q.focus();
    },
    onKey(e) { if (e.altKey && e.key === 'F1') { this.overview(); return true; } }
  });

  // ======================================================== hwc（Labwc 風・ウィンドウマネージャだけ）
  OS.registerSession({
    id: 'wm', name: 'hwc（ウィンドウマネージャのみ）', desc: 'パネルもアイコンもない、ウィンドウマネージャだけの環境です。デスクトップを右クリックするとメニューが出ます。Alt+Tab でウィンドウを切り替えます。',
    build(k) {
      const desk = k.desk(false, true), self = this;
      desk.addEventListener('contextmenu', e => { if (e.target === desk) { e.preventDefault(); self.rootMenu(e.clientX, e.clientY); } });
      desk.addEventListener('click', e => { if (e.target === desk && OS.touch) self.rootMenu(e.clientX, e.clientY); });
    },
    onStart() { OS.ui.toast(OS.touch ? '画面をタップするとメニューが出ます' : 'デスクトップを右クリックするとメニューが出ます'); },
    rootMenu(x, y) {
      const k = htui.kit;
      const items = [{ head: 'hwc' }].concat(k.apps().map(a => ({ label: a.name, icon: a.icon, act: () => k.run(a.id) })));
      if (htui.wins.length) {
        items.push({ sep: true }, { head: 'ウィンドウ' });
        htui.wins.forEach(w => items.push({ label: w.title, icon: (OS.apps[w.app] || {}).icon || 'file', hint: w.el.classList.contains('hidden') ? '最小化' : null, act: () => w.focus() }));
      }
      items.push({ sep: true }, { label: '画面モード: ' + OS.modeNames[OS.modePref], icon: OS.modeIcons[OS.uiMode], act: () => setTimeout(() => htui.menuAt(x, y, k.modeItems()), 0) });
      htui.menuAt(x, y, items.concat([{ sep: true }], k.powerItems()));
    },
    onKey(e) {
      // Alt+Tab（ブラウザや OS が先に取ってしまう環境では Alt+` でも切り替えられる）
      if (e.altKey && !e.ctrlKey && (e.key === 'Tab' || e.key === '`')) {
        const list = htui.wins.slice().sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
        if (!list.length) return true;
        const w = e.shiftKey ? list[list.length - 2] || list[0] : list[0];
        w.focus(); this.osd(w.title);
        return true;
      }
      if (e.ctrlKey && e.altKey && e.key === 'Enter') { htui.kit.run('terminal'); return true; }
    },
    osd(text) {
      let o = htui.el.querySelector('.wm-osd');
      if (!o) { o = h('div', { class: 'wm-osd', role: 'status' }); htui.el.append(o); }
      o.textContent = text; clearTimeout(this._osd);
      this._osd = setTimeout(() => o.remove(), 900);
    }
  });
})();
