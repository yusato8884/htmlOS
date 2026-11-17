/* デスクトップ環境（セッション）
   htui  … HTUi       上にパネル、左にデスクトップアイコン（標準）。タッチでは下にナビが出る
   win   … hWin       Windows 風。マウスではタスクバーとスタートメニュー、タッチでは Windows 8.1 風
   gnome … hShell     GNOME 風。トップバー、アクティビティ画面とドック、カレンダーと通知センター
   wm    … hwc        Labwc 風。パネルなしのウィンドウマネージャだけ。右クリックでメニュー
   mac   … hAqua      macOS 風。メニューバーとドック。タブレットは iPadOS 風、スマートフォンは iOS 風
   どれも OS.registerSession({ id, name, desc, build(kit), ... }) で登録している。
   環境が持てるフック: onStart / onStop / onApps / onActive(win) / onFocus(win) / onMode / onNotify(n) / onKey(e) / onSuper() / freeWindows() */
(function () {
  const OS = window.OS, h = OS.h, htui = OS.htui;
  const logo = () => h('span', { class: 'os-logo', 'aria-hidden': 'true' }, '<', h('b', null, '/'), '>');
  const pad = n => String(n).padStart(2, '0');
  const WEEK = '日月火水木金土';
  const byZ = () => htui.wins.slice().sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0)); // 手前から順
  const visible = w => !w.el.classList.contains('hidden') && !w.el.classList.contains('minimizing');

  // 画面の端からのスワイプを受け取る帯。side: l / r / t / b。タッチモードのときだけ表示される
  //   on.move(v) / on.end(v)。v = { dx, dy, x, y, max }（max は画面の内側へ動いた最大の距離）
  function edge(side, on) {
    const el = h('div', { class: 'edge edge-' + side, 'aria-hidden': 'true' });
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const x0 = e.clientX, y0 = e.clientY; let max = 0;
      const val = ev => {
        const v = { dx: ev.clientX - x0, dy: ev.clientY - y0, x: ev.clientX, y: ev.clientY };
        const inward = side === 'l' ? v.dx : side === 'r' ? -v.dx : side === 't' ? v.dy : -v.dy;
        max = Math.max(max, inward); v.inward = inward; v.max = max; return v;
      };
      const mv = ev => { const v = val(ev); if (on.move) on.move(v); };
      const up = ev => {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        const v = val(ev); v.cancel = ev.type === 'pointercancel'; if (on.end) on.end(v);
      };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      if (on.start) on.start();
    });
    return el;
  }
  // 要素の上でのスワイプ（指を離したときの移動量で判定）。ボタンの上から始めても、スワイプならクリックにしない
  function swipe(el, onEnd) {
    let s = null, swiped = false;
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; s = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; swiped = false; });
    el.addEventListener('pointermove', e => { if (s) { s.lx = e.clientX; s.ly = e.clientY; } });
    const fin = e => {
      if (!s) return;
      // pointercancel は座標が 0 になることがあるので、最後に動いた位置を使う
      const x = e.type === 'pointercancel' ? s.lx : e.clientX, y = e.type === 'pointercancel' ? s.ly : e.clientY;
      const dx = x - s.x, dy = y - s.y; s = null;
      if (Math.abs(dx) > 60 || Math.abs(dy) > 60) { if (onEnd(dx, dy) !== false) swiped = true; }
    };
    el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
    el.addEventListener('click', e => { if (swiped) { swiped = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  // 要素を押してから離すまでの移動量を渡す（タップなら tap=true）。capture=true なら子要素の上から始めても拾う
  function dragOn(el, onEnd, capture) {
    let s = null;
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; s = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; }, !!capture);
    el.addEventListener('pointermove', e => { if (s) { s.lx = e.clientX; s.ly = e.clientY; } }, !!capture);
    const fin = e => {
      if (!s) return;
      const x = e.type === 'pointercancel' ? s.lx : e.clientX, y = e.type === 'pointercancel' ? s.ly : e.clientY;
      const dx = x - s.x, dy = y - s.y; s = null;
      onEnd(dx, dy, Math.abs(dx) < 10 && Math.abs(dy) < 10 && e.type !== 'pointercancel');
    };
    el.addEventListener('pointerup', fin, !!capture); el.addEventListener('pointercancel', fin, !!capture);
  }
  // 外側を押す・Esc で閉じるポップアップ
  function popup(el, anchor, onClose) {
    // ナビゲーションバー（スマートフォン）のボタンは自分で閉じ方を決めるので、外側を押した扱いにしない
    const off = e => { if (!el.contains(e.target) && !(anchor && anchor.contains(e.target)) && !e.target.closest('.menu,.modal-ov,.wp-nav')) close(); };
    const esc = e => { if (e.key === 'Escape' && !htui.el.querySelector('.menu:not(.leaving)')) { e.stopPropagation(); close(); } };
    function close() { htui.leave(el); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); if (onClose) onClose(); }
    el._close = close;
    setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true); }, 0);
    htui.el.append(el);
    return close;
  }

  // ======================================================== HTUi（標準）
  OS.registerSession({
    id: 'htui', name: 'HTUi', touchNav: true, desc: '上にパネル、左にデスクトップアイコンが並ぶ標準のデスクトップです。タッチでは下に「閉じる・ホーム・タスク」のナビが出ます。',
    build(k) {
      const appsBtn = h('button', { class: 'p-btn', type: 'button', onclick: e => k.menu(e.currentTarget, k.apps().map(a => ({ label: a.name, hint: a.desc, icon: a.icon, act: () => k.run(a.id) }))) }, OS.icon('grid', 16), h('span', { class: 'p-lbl' }, 'アプリ'));
      const tasks = htui.tasks = h('div', { class: 'p-tasks' });
      const clock = k.clock(h('div', { class: 'p-clock' }), d => (d.getMonth() + 1) + '/' + d.getDate() + ' ' + k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()));
      htui.titleEl = h('div', { class: 'p-title' });
      htui.el.append(h('div', { class: 'panel' }, appsBtn, tasks, htui.titleEl, k.modeButton('p-btn'), clock, k.userButton('p-btn')), k.desk(true));
    }
  });

  // ======================================================== hWin（Windows 風）
  //   マウス（デスクトップモード）: 下にタスクバー、スタートメニュー
  //   スマートフォン: Windows Phone 8.1 風（上のステータスバー → 下へスワイプでアクションセンター、下のナビバー: 戻る・スタート・検索。
  //     戻る長押し／ナビバーを上へスワイプでタスク切り替え。スタート画面を左へスワイプでアプリ一覧）
  //   タッチ（タブレット）: Windows 8.1 風
  //     スタート画面（タイル）／すべてのアプリ（タブレットは上スワイプ、スマートフォンは左スワイプ）
  //     「デスクトップ」タイル → タスクバーつきのデスクトップ。ここで開いたアプリはふつうのウィンドウ。スタートボタンでスタート画面へ
  //     右端からスワイプ → チャーム／左端から → 前のアプリ（少し出して戻すと切り替え一覧）
  //     上端から下へ引き下ろす → アプリを閉じる（上端をタップするとタイトルバー）／下端から上へ → すべてのアプリ
  OS.registerSession({
    id: 'win', name: 'hWin（Windows 風）', desc: 'マウスでは下にタスクバーとスタートメニュー。タブレットとスマートフォンでは Windows 8.1 風のスタート画面とチャーム、画面の端からのスワイプ操作になります。',
    build(k) {
      const self = this;
      const desk = k.desk(true);
      const tasks = htui.tasks = h('div', { class: 'tb-tasks' });
      const start = h('button', { class: 'tb-start', type: 'button', title: 'スタート（Ctrl+Esc）', 'aria-label': 'スタート', onclick: () => { if (OS.touch) self.showStart(); else self.toggleStart(); } }, logo());
      const clock = k.clock(h('div', { class: 'tb-clock' }), d => k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()) + '\n' + d.getFullYear() + '/' + k.pad(d.getMonth() + 1) + '/' + k.pad(d.getDate()));
      const showDesk = h('button', { class: 'tb-showdesk', type: 'button', title: 'デスクトップを表示', 'aria-label': 'デスクトップを表示', onclick: () => {
        const list = htui.wins.filter(w => !OS.touch || w.free);
        if (list.some(visible)) list.forEach(w => w.minimize()); else list.forEach(w => w.focus());
      } });

      // ---- タッチ用: スタート画面とすべてのアプリ
      this.tiles = h('div', { class: 'w8-grid' });
      this.alist = h('div', { class: 'w8-alist' });
      this.q = h('input', { class: 'inp w8-q', id: 'w8-q', placeholder: 'アプリを検索', 'aria-label': 'アプリを検索', autocomplete: 'off' });
      this.q.addEventListener('input', () => this.fillApps());
      this.q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = this.alist.querySelector('.w8-aitem'); if (b) b.click(); } });
      const who = h('button', { class: 'w8-user', type: 'button', onclick: () => k.menu(who, [
        { label: 'PC 設定', icon: 'gear', act: () => this.launch('settings') },
        { label: '画面モード', icon: OS.modeIcons[OS.uiMode], act: () => { const r = who.getBoundingClientRect(); setTimeout(() => k.menuAt(r.right - 240, r.bottom + 4, k.modeItems()), 0); } },
        { sep: true }].concat(k.powerItems()), true) }, h('span', null, htui.user), k.avatar(OS.users.get(htui.user), 36));
      const home = h('div', { class: 'w8-page w8-home' },
        h('div', { class: 'w8-head' }, h('h1', null, 'スタート'), who), this.tiles,
        h('button', { class: 'w8-more', type: 'button', title: 'すべてのアプリ', 'aria-label': 'すべてのアプリ', onclick: () => this.showApps(true) }, OS.icon('down', 22)));
      const apps = h('div', { class: 'w8-page w8-apps' },
        h('div', { class: 'w8-head' }, h('h1', null, 'アプリ', h('small', null, '名前順')), this.q), this.alist,
        h('button', { class: 'w8-more up', type: 'button', title: 'スタート画面に戻る', 'aria-label': 'スタート画面に戻る', onclick: () => this.showApps(false) }, OS.icon('up', 22)));
      const st = this.startEl = h('div', { class: 'w8-start' }, home, apps);
      // スタート画面での上下（スマートフォンは左右）スワイプで、すべてのアプリと行き来する
      swipe(st, (dx, dy) => {
        const phone = OS.uiMode === 'phone', on = st.classList.contains('apps');
        const fwd = phone ? dx < -60 && Math.abs(dy) < Math.abs(dx) : dy < -60 && Math.abs(dx) < Math.abs(dy);
        const back = phone ? dx > 60 && Math.abs(dy) < Math.abs(dx) : dy > 60 && Math.abs(dx) < Math.abs(dy);
        if (!on && fwd) this.showApps(true); else if (on && back) this.showApps(false); else return false;
      });
      desk.prepend(st);

      // ---- タッチ用: 画面の端
      const edges = [
        edge('r', { end: v => { if (v.max > 30 && OS.uiMode !== 'phone') this.charms(); } }),
        edge('l', { end: v => this.leftSwipe(v) }),
        edge('t', { move: v => this.dragClose(v), end: v => this.dragClose(v, true) }),
        edge('b', { end: v => {
          const el = htui.el;
          if (el.classList.contains('w8-start-on')) { if (v.max > 40) this.showApps(true); return; }
          // アプリを全画面で開いているとき: 下の帯から上へスワイプ（またはタップ）でアプリバー
          if (!el.classList.contains('w8-desk-on') && (v.max > 30 || v.max < 12) && !v.cancel) this.appBar();
        } })
      ];
      htui.el.append(desk, h('div', { class: 'taskbar' }, start, tasks, h('div', { class: 'tb-tray' }, k.modeButton('tb-btn', { up: true }), clock, showDesk)), ...edges, ...this.buildPhone(k));
      htui.el.classList.add('w8-start-on');
      this.startBtn = start;
    },
    onStop() { this.tiles = null; this.lastApp = null; if (this._unbind) this._unbind(); this._unbind = null; },

    // ---- スマートフォン用（Windows Phone 8.1 風）: ステータスバーとナビゲーションバー
    buildPhone(k) {
      const self = this;
      // ステータスバー: 回線・電池（分かるときだけ）・時刻。下へスワイプ（またはタップ）でアクションセンター
      const net = h('span', { class: 'wp-net', title: '回線' }, OS.icon('globe', 16));
      const batt = h('span', { class: 'wp-batt', hidden: true });
      const syncNet = () => { net.classList.toggle('off', navigator.onLine === false); net.title = navigator.onLine === false ? 'オフライン' : 'オンライン'; };
      syncNet(); addEventListener('online', syncNet); addEventListener('offline', syncNet);
      this._unbind = () => { removeEventListener('online', syncNet); removeEventListener('offline', syncNet); };
      if (navigator.getBattery) navigator.getBattery().then(b => {
        const upd = () => { batt.hidden = false; batt.textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : ''); };
        upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
      }).catch(() => {});
      const status = h('div', { class: 'wp-status', role: 'button', 'aria-label': 'アクションセンターを開く' },
        h('span', { class: 'wp-sicons' }, net, batt), k.clock(h('span', { class: 'wp-time' }), d => pad(d.getHours()) + ':' + pad(d.getMinutes())));
      dragOn(status, (dx, dy, tap) => { if (tap || dy > 30) self.actionCenter(); });
      // ナビゲーションバー: 戻る（長押しでタスク切り替え）・スタート・検索。上へスワイプでもタスク切り替え
      const back = h('button', { class: 'wp-nbtn', type: 'button', title: '戻る（長押しでタスク切り替え）', 'aria-label': '戻る' }, OS.icon('back', 26));
      let lp = null, long = false;
      // 指を離した瞬間に反応する（直前のスワイプなどでブラウザがクリックを出さないことがあるため）。キーボードからはクリックで
      let downAt = 0, handled = 0;
      back.addEventListener('pointerdown', () => { long = false; downAt = Date.now(); clearTimeout(lp); lp = setTimeout(() => { long = true; self.taskSwitcher(); }, 550); });
      back.addEventListener('pointerup', e => {
        clearTimeout(lp);
        const r = back.getBoundingClientRect();
        if (long || !downAt || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        downAt = 0; handled = Date.now(); self.phoneBack();
      });
      ['pointercancel', 'pointerleave'].forEach(t => back.addEventListener(t, () => { clearTimeout(lp); downAt = 0; }));
      back.addEventListener('click', e => { if (long || Date.now() - handled < 800) { long = false; e.preventDefault(); return; } self.phoneBack(); });
      back.addEventListener('contextmenu', e => e.preventDefault());
      const nav = h('div', { class: 'wp-nav' }, back,
        h('button', { class: 'wp-nbtn', type: 'button', title: 'スタート', 'aria-label': 'スタート', onclick: () => { if (htui.el.classList.contains('w8-start-on') && self.startEl.classList.contains('apps')) self.showApps(false); else self.showStart(); } }, OS.icon('win', 24)),
        h('button', { class: 'wp-nbtn', type: 'button', title: '検索', 'aria-label': '検索', onclick: () => { self.showStart(); self.showApps(true); setTimeout(() => self.q.focus(), 60); } }, OS.icon('search', 24)));
      dragOn(nav, (dx, dy) => { if (dy < -30) self.taskSwitcher(); }, true);
      return [status, nav];
    },
    // 戻るボタン: 開いているものを順に閉じる。アプリなら終了して前のアプリ（なければスタート）へ
    phoneBack() {
      const el = htui.el;
      const modal = el.querySelector('.modal-ov');
      if (modal) { modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      if (el.querySelector('.menu:not(.leaving)')) { htui.closeMenus(); return; }
      const pop = el.querySelector('.wp-ac:not(.leaving),.wp-tasks:not(.leaving),.wp-jump:not(.leaving),.w8-appbar:not(.leaving),.w8-charmwrap:not(.leaving),.w8-pane:not(.leaving),.w8-switch:not(.leaving)');
      if (pop && pop._close) { pop._close(); return; }
      if (el.classList.contains('w8-start-on')) { if (this.startEl.classList.contains('apps')) this.showApps(false); return; }
      const w = htui.active();
      if (w) w.close(); else this.showStart();
    },
    // タスク切り替え: 開いているアプリを横に並べる。タップで切り替え、下へはじくと閉じる
    taskSwitcher() {
      if (htui.el.querySelector('.wp-tasks:not(.leaving)')) return;
      const list = h('div', { class: 'wp-tlist' });
      const box = h('div', { class: 'wp-tasks', role: 'dialog', 'aria-label': 'タスク切り替え' }, list);
      const fill = () => {
        list.textContent = '';
        const wins = byZ();
        if (!wins.length) { list.append(h('p', { class: 'wp-tempty' }, '開いているアプリはありません')); return; }
        wins.forEach(w => {
          const a = OS.apps[w.app] || {};
          const card = h('div', { class: 'wp-tcard' },
            h('button', { class: 'wp-tthumb', type: 'button', style: 'background:' + (a.color || '#5e5c64'), 'aria-label': w.title + ' に切り替え', onclick: () => { close(); w.focus(); } }, OS.icon(a.icon || 'file', 48)),
            h('div', { class: 'wp-ttitle' }, h('span', null, w.title), h('button', { class: 'wp-tx', type: 'button', 'aria-label': w.title + ' を閉じる', onclick: async () => { if (await w.close()) { fill(); if (!htui.wins.length) close(); } } }, OS.icon('x', 16))));
          // 下へはじくと閉じる
          card.addEventListener('pointerdown', e => {
            if (e.target.closest('.wp-tx')) return;
            const y0 = e.clientY; let dy = 0;
            const mv = ev => { dy = Math.max(0, ev.clientY - y0); if (dy > 8) { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; card.style.opacity = String(1 - dy / 400); } };
            const up = async () => {
              document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
              card.style.transition = ''; card.style.transform = ''; card.style.opacity = '';
              if (dy > 90) { card.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); if (await w.close()) { fill(); if (!htui.wins.length) close(); } }
            };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
          });
          list.append(card);
        });
      };
      fill();
      const close = popup(box, null);
    },
    // アクションセンター: 日時・クイック操作・通知
    actionCenter() {
      if (htui.el.querySelector('.wp-ac:not(.leaving)')) return;
      const k = htui.kit, self = this, d = new Date();
      const list = h('div', { class: 'wp-alist' });
      const fill = () => {
        list.textContent = '';
        if (!htui.notices.length) list.append(h('p', { class: 'wp-aempty' }, '新しい通知はありません'));
        htui.notices.forEach(n => list.append(h('div', { class: 'wp-note' }, h('span', { class: 'wp-nico' }, OS.icon(n.icon || 'bell', 18)),
          h('span', { class: 'wp-ntext' }, h('b', null, n.title), n.body ? h('span', null, n.body) : null, h('small', null, (n.app || 'htmlOS'))),
          h('button', { class: 'wp-nx', type: 'button', 'aria-label': n.title + ' を消す', onclick: () => { htui.notices = htui.notices.filter(x => x !== n); fill(); } }, OS.icon('x', 14)))));
        htui.notices.forEach(n => { n.unread = false; });
      };
      const quick = (icon, label, fn, on) => h('button', { class: 'wp-q' + (on ? ' on' : ''), type: 'button', onclick: fn }, OS.icon(icon, 22), h('span', null, label));
      const dnd = quick('bell', 'おやすみ', () => { htui.setPrefs({ dnd: !htui.prefs.dnd }); close(); self.actionCenter(); }, htui.prefs.dnd);
      const ac = h('div', { class: 'wp-ac', role: 'dialog', 'aria-label': 'アクションセンター' },
        h('div', { class: 'wp-adate' }, h('b', null, pad(d.getHours()) + ':' + pad(d.getMinutes())), h('span', null, (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日')),
        h('div', { class: 'wp-quick' },
          quick(OS.modeIcons[OS.uiMode], '画面モード', e => k.menu(e.currentTarget, k.modeItems())),
          dnd,
          quick('gear', 'すべての設定', () => { close(); self.launch('settings'); }),
          quick('power', '電源', e => k.menu(e.currentTarget, k.powerItems(), true))),
        h('div', { class: 'wp-ahead' }, h('span', null, '通知'), h('button', { class: 'wp-aclear', type: 'button', onclick: () => { htui.notices = []; fill(); } }, 'すべてクリア')),
        list, h('div', { class: 'wp-agrip', 'aria-hidden': 'true' }));
      dragOn(ac, (dx, dy) => { if (dy < -50) close(); }, true);
      fill();
      const close = popup(ac, null);
    },
    // スマートフォン: 通知は上にバナーで出す
    onNotify(n) {
      if (n.silent || htui.prefs.dnd) return;
      if (!(OS.touch && OS.uiMode === 'phone')) { OS.ui.toast(n.title + (n.body ? '：' + n.body : '')); return; }
      const old = htui.el.querySelector('.wp-toast'); if (old) old.remove();
      const t = h('button', { class: 'wp-toast', type: 'button', onclick: () => { t.remove(); this.actionCenter(); } }, OS.icon(n.icon || 'bell', 18), h('b', null, n.title), n.body ? h('span', null, n.body) : null);
      htui.el.append(t);
      setTimeout(() => t.remove(), 4500);
    },

    // ---- スタート画面・デスクトップ・アプリの切り替え
    showStart() {
      htui.closeMenus();
      this.showApps(false);
      htui.el.classList.add('w8-start-on');
      htui.wins.forEach(w => w.el.classList.remove('peek'));
    },
    // スタートボタン・チャームの「スタート」: スタート画面を出す。もう出ているなら直前のアプリに戻る
    toggleStartScreen() {
      if (htui.el.classList.contains('w8-start-on') && this.lastApp && !this.lastApp.closed) this.lastApp.focus();
      else this.showStart();
    },
    showApps(on) {
      if (!this.startEl) return;
      this.startEl.classList.toggle('apps', !!on);
      if (on) { this.q.value = ''; this.fillApps(); if (!OS.touch || OS.uiMode !== 'phone') setTimeout(() => this.q.focus(), 50); }
    },
    openDesktop() {
      const el = htui.el;
      el.classList.remove('w8-start-on'); el.classList.add('w8-desk-on');
      this.showApps(false);
      htui.wins.forEach(w => { if (!w.free && visible(w)) { w.el.classList.add('hidden'); w.el.classList.remove('active'); w.task.classList.remove('active'); } });
      const top = byZ().find(w => w.free && visible(w));
      if (top) top.focus(); else htui.syncTitle();
    },
    freeWindows() { return htui.el.classList.contains('w8-desk-on'); },
    // タイルから開く。すでに開いているアプリならそれに切り替える（Windows 8 と同じ）
    launch(id) {
      if (id === '@desktop') { this.openDesktop(); return; }
      const ex = byZ().find(w => w.app === id && !w.free);
      htui.el.classList.remove('w8-start-on', 'w8-desk-on');
      if (ex) ex.focus(); else htui.kit.run(id);
    },
    onFocus(w) {
      if (!OS.touch) return;
      htui.el.classList.remove('w8-start-on');
      if (w.free) {
        htui.el.classList.add('w8-desk-on');
        htui.wins.forEach(x => { if (!x.free && x !== w && visible(x)) { x.el.classList.add('hidden'); x.el.classList.remove('active'); } });
      } else htui.el.classList.remove('w8-desk-on');
      this.lastApp = w;
    },
    onActive(w) {
      // アプリを閉じたり最小化したりして何も見えなくなったら、スタート画面に戻る
      if (OS.touch && !w && !htui.el.classList.contains('w8-desk-on')) this.showStart();
    },
    onMode() {
      if (OS.touch) this.showStart();
      else htui.el.classList.remove('w8-start-on', 'w8-desk-on');
      if (OS.uiMode === 'phone') htui.el.classList.remove('w8-desk-on');
      this.onApps();
    },

    // ---- タイルとアプリ一覧
    onApps() {
      if (!this.tiles) return;
      const k = htui.kit, g = this.tiles, WIDE = ['terminal', 'hbrowser', 'hfile', 'settings'];
      g.textContent = '';
      const clock = h('div', { class: 'w8-tile w8-wide w8-clock', role: 'img', 'aria-label': '時計' }, h('b'), h('span'));
      k.clock(clock.firstChild, d => pad(d.getHours()) + ':' + pad(d.getMinutes()));
      k.clock(clock.lastChild, d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日');
      const deskTile = h('button', { class: 'w8-tile w8-wide w8-desktile', type: 'button', style: '--i:1', onclick: () => this.launch('@desktop') },
        h('span', { class: 'w8-mini-bar' }), h('span', { class: 'w8-name' }, 'デスクトップ'));
      deskTile.style.background = htui.wallCss(htui.prefs, htui.user);
      g.append(clock);
      if (OS.uiMode !== 'phone') g.append(deskTile); // Windows Phone にはデスクトップがない
      k.apps().forEach((a, i) => g.append(h('button', { class: 'w8-tile' + (WIDE.includes(a.id) ? ' w8-wide' : ''), type: 'button', title: a.desc || a.name, style: 'background:' + (a.color || '#5e5c64') + ';--i:' + (i + 2), onclick: () => this.launch(a.id) },
        OS.icon(a.icon, 40), h('span', { class: 'w8-name' }, a.name))));
      this.fillApps();
    },
    fillApps() {
      if (!this.alist) return;
      const t = this.q.value.trim().toLowerCase();
      const list = (OS.uiMode === 'phone' ? [] : [{ id: '@desktop', name: 'デスクトップ', icon: 'monitor', color: '#1c71d8', desc: 'タスクバーのあるデスクトップ' }]).concat(htui.kit.apps())
        .filter(a => !t || (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      this.alist.textContent = '';
      if (!list.length) { this.alist.append(h('p', { class: 'w8-none' }, '「' + this.q.value + '」に一致するアプリはありません')); return; }
      let last = null;
      list.forEach(a => {
        const c = a.name.charAt(0).toUpperCase(), grp = /[A-Z]/.test(c) ? c : 'あ';
        if (grp !== last && !t) { this.alist.append(h('button', { class: 'w8-letter', type: 'button', 'data-letter': grp, onclick: () => { if (OS.uiMode === 'phone') this.jumpGrid(); } }, grp)); last = grp; }
        this.alist.append(h('button', { class: 'w8-aitem', type: 'button', title: a.desc || a.name, onclick: () => this.launch(a.id) },
          h('span', { class: 'w8-aico', style: 'background:' + (a.color || '#5e5c64') }, OS.icon(a.icon, 20)), h('span', null, a.name)));
      });
    },

    // スマートフォンのアプリ一覧: 頭文字を押すと、文字の一覧から飛べる（Windows Phone のジャンプリスト）
    jumpGrid() {
      const have = new Set([...this.alist.querySelectorAll('.w8-letter')].map(b => b.dataset.letter));
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['あ']);
      const box = h('div', { class: 'wp-jump', role: 'dialog', 'aria-label': '頭文字で移動' }, h('div', { class: 'wp-jgrid' }, letters.map(c => h('button', { class: 'wp-jl', type: 'button', disabled: !have.has(c), onclick: () => {
        close(); const t = this.alist.querySelector('.w8-letter[data-letter="' + c + '"]'); if (t) t.scrollIntoView({ block: 'start' });
      } }, c))));
      const close = popup(box, null);
    },

    // ---- チャーム（右端からのスワイプ）
    charms() {
      if (htui.el.querySelector('.w8-charms:not(.leaving)')) return;
      const k = htui.kit, self = this;
      const btn = (icon, label, fn) => h('button', { class: 'w8-charm', type: 'button', onclick: () => { close(); fn(); } }, icon === 'logo' ? h('span', { class: 'w8-clogo' }, OS.icon('win', 30)) : OS.icon(icon, 30), h('span', null, label));
      const cc = h('div', { class: 'w8-cc', 'aria-hidden': 'true' });
      const d = new Date();
      cc.append(h('b', null, pad(d.getHours()) + ':' + pad(d.getMinutes())), h('span', null, (d.getMonth() + 1) + '月' + d.getDate() + '日\n' + WEEK[d.getDay()] + '曜日'));
      const bar = h('div', { class: 'w8-charms', role: 'menu', 'aria-label': 'チャーム' },
        btn('search', '検索', () => { self.showStart(); self.showApps(true); setTimeout(() => self.q.focus(), 80); }),
        btn('share', '共有', () => OS.ui.toast('このアプリから共有できるものはありません')),
        btn('logo', 'スタート', () => self.toggleStartScreen()),
        btn('monitor', 'デバイス', () => OS.ui.toast('使えるデバイスはありません')),
        btn('gear', '設定', () => self.settingsPane()));
      const wrap = h('div', { class: 'w8-charmwrap' }, cc, bar);
      const close = popup(wrap, null);
    },
    settingsPane() {
      const k = htui.kit;
      const pane = h('div', { class: 'w8-pane', role: 'dialog', 'aria-label': '設定' },
        h('h2', null, '設定'), h('p', null, htui.user + ' ・ htmlOS ' + OS.version),
        h('div', { class: 'w8-pane-list' },
          h('button', { class: 'w8-pane-item', type: 'button', onclick: () => { close(); this.launch('settings'); } }, OS.icon('gear', 20), 'PC 設定'),
          h('button', { class: 'w8-pane-item', type: 'button', onclick: e => k.menu(e.currentTarget, k.modeItems()) }, OS.icon(OS.modeIcons[OS.uiMode], 20), '画面モード: ' + OS.modeNames[OS.modePref]),
          h('button', { class: 'w8-pane-item', type: 'button', onclick: e => k.menu(e.currentTarget, k.powerItems(), false, { up: true }) }, OS.icon('power', 20), '電源')));
      const close = popup(pane, null);
    },

    // ---- アプリバー（全画面のアプリで、下の帯から上へスワイプ）
    appBar() {
      if (htui.el.querySelector('.w8-appbar:not(.leaving)')) return;
      const w = htui.active();
      const btn = (icon, label, fn) => h('button', { class: 'w8-abtn', type: 'button', onclick: () => { close(); fn(); } }, h('span', { class: 'w8-aring' }, OS.icon(icon, 22)), h('span', null, label));
      const bar = h('div', { class: 'w8-appbar', role: 'toolbar', 'aria-label': 'アプリバー' },
        h('div', { class: 'w8-abar-title' }, w ? w.title : ''),
        h('div', { class: 'w8-abtns' },
          btn('win', 'スタート', () => this.showStart()),
          btn('grid', '切り替え', () => this.switchList()),
          btn('share', 'チャーム', () => this.charms()),
          w ? btn('min', '最小化', () => w.minimize()) : null,
          w ? btn('x', '閉じる', () => w.close().then(ok => { if (ok) this.showStart(); })) : null));
      // 帯をタップして出したとき、そのタップの「クリック」が出てきたばかりのボタンに当たらないよう、少しの間は操作を受け付けない
      bar.style.pointerEvents = 'none'; setTimeout(() => { bar.style.pointerEvents = ''; }, 400);
      const close = popup(bar, null);
    },

    // ---- 左端からのスワイプ: 長く引き出したら前のアプリへ、少し出して戻したら切り替え一覧
    leftSwipe(v) {
      const cur = htui.active();
      const others = byZ().filter(w => w !== cur);
      if (v.max > 50 && v.dx < 40) return this.switchList();
      if (v.dx > 90) {
        const w = others[0];
        if (w) w.focus(); else OS.ui.toast('ほかに開いているアプリはありません');
      }
    },
    switchList() {
      const cur = htui.active();
      const list = byZ().filter(w => w !== cur);
      const col = h('div', { class: 'w8-switch', role: 'menu', 'aria-label': '開いているアプリ' });
      if (!list.length) col.append(h('p', { class: 'w8-none' }, 'ほかに開いているアプリはありません'));
      list.forEach(w => {
        const a = OS.apps[w.app] || {};
        col.append(h('button', { class: 'w8-sw', type: 'button', onclick: () => { close(); w.focus(); } },
          h('span', { class: 'w8-sw-thumb', style: 'background:' + (w.free ? '#1c71d8' : (a.color || '#5e5c64')) }, OS.icon(a.icon || 'file', 30)), h('span', null, w.title)));
      });
      col.append(h('button', { class: 'w8-sw w8-sw-start', type: 'button', onclick: () => { close(); this.showStart(); } }, h('span', { class: 'w8-sw-thumb' }, OS.icon('win', 30)), h('span', null, 'スタート')));
      const close = popup(col, null);
    },

    // ---- 上端から引き下ろしてアプリを閉じる。動かさずに離したらタイトルバーを出す
    dragClose(v, end) {
      const w = htui.active();
      const target = w && !w.free && visible(w) ? w : null;
      if (!end) {
        if (target && v.dy > 0) {
          const H = htui.desk.clientHeight, p = Math.min(1, v.dy / H);
          target.el.style.transition = 'none';
          target.el.style.transform = 'translateY(' + v.dy + 'px) scale(' + (1 - p * 0.55) + ')';
          target.el.style.borderRadius = '6px';
        }
        return;
      }
      if (target) { target.el.style.transform = ''; target.el.style.transition = ''; target.el.style.borderRadius = ''; }
      if (v.max < 12) { // タップ
        if (target) { target.el.classList.add('peek'); clearTimeout(this._peek); this._peek = setTimeout(() => target.el.classList.remove('peek'), 4000); }
        return;
      }
      if (v.dy < htui.desk.clientHeight * 0.45 || v.cancel) return;
      if (target) { target.close().then(ok => { if (ok) this.showStart(); }); }
      else if (htui.el.classList.contains('w8-desk-on')) { htui.el.classList.remove('w8-desk-on'); this.showStart(); }
    },

    // ---- マウス用のスタートメニュー（デスクトップモード）
    toggleStart() {
      const old = htui.el.querySelector('.startmenu:not(.leaving)');
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
      const close = popup(sm, this.startBtn);
      fill();
      if (!OS.touch) q.focus();
    },
    onSuper() { if (OS.touch) this.toggleStartScreen(); else this.toggleStart(); },
    onKey(e) {
      if (e.ctrlKey && e.key === 'Escape') { this.onSuper(); return true; }
      if (e.key === 'Escape' && OS.touch && OS.uiMode === 'phone' && !htui.el.querySelector('.modal-ov,.menu:not(.leaving),.wp-ac:not(.leaving),.wp-tasks:not(.leaving),.wp-jump:not(.leaving)')) { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) { this.phoneBack(); return true; } }
    }
  });

  // ======================================================== hShell（GNOME 風）
  OS.registerSession({
    id: 'gnome', name: 'hShell（GNOME 風）', desc: '上にトップバー。「アクティビティ」でウィンドウ一覧・ドック・アプリ一覧、日時でカレンダーと通知センターを出す GNOME 風のデスクトップです。タッチでは下端から上へスワイプでアクティビティ。',
    build(k) {
      const self = this;
      const act = h('button', { class: 'gn-act', type: 'button', title: 'アクティビティ（Super / Alt+F1）', 'aria-label': 'アクティビティ', onclick: () => self.overview() },
        h('span', { class: 'gn-pill' }), h('span', { class: 'gn-pdot' }));
      htui.titleEl = h('div', { class: 'gn-app' });
      this.dot = h('span', { class: 'gn-dot', 'aria-hidden': 'true' });
      const clockText = k.clock(h('span'), d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()));
      const clock = this.clockBtn = h('button', { class: 'gn-clock', type: 'button', title: 'カレンダーと通知', 'aria-label': 'カレンダーと通知', onclick: () => self.calendar() }, clockText, this.dot);
      const status = h('button', { class: 'gn-status', type: 'button', 'aria-label': 'システムメニュー', onclick: e => k.menu(e.currentTarget, [
        { head: htui.user }, { label: '設定', icon: 'gear', act: () => k.run('settings') }, { sep: true }].concat(k.powerItems()), true) }, OS.icon('user', 16), OS.icon('power', 16));
      // 左上の角にポインタを当てるとアクティビティ（ホットコーナー）
      const hot = h('div', { class: 'gn-hot', 'aria-hidden': 'true' });
      hot.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !htui.el.classList.contains('dragging')) self.overview(true); });
      // タッチ: 下端から上へスワイプでアクティビティ、もう一度でアプリ一覧
      const bottom = edge('b', { end: v => { if (v.max > 40) self.overview(true, htui.el.querySelector('.gn-ov:not(.leaving)') ? true : null); } });
      htui.el.append(h('div', { class: 'gn-bar' }, h('div', { class: 'gn-left' }, act, htui.titleEl), clock, h('div', { class: 'gn-right' }, k.modeButton('gn-btn'), status)), hot, k.desk(false), bottom);
      this.syncDot();
    },
    onStart() { if (!OS.touch) this.overview(true); },
    onStop() { this.dot = null; this.clockBtn = null; },
    syncDot() { if (this.dot) this.dot.classList.toggle('on', htui.notices.some(n => n.unread)); },

    // ---- 通知: 上にバナーを出し、通知センターにためる。おやすみモードではバナーを出さない
    onNotify(n) {
      this.syncDot();
      if (n.silent || htui.prefs.dnd) return;
      const old = htui.el.querySelector('.gn-banner'); if (old) old.remove();
      const b = h('button', { class: 'gn-banner', type: 'button', onclick: () => { b.remove(); this.calendar(true); } },
        h('span', { class: 'gn-nico' }, OS.icon(n.icon || 'bell', 20)),
        h('span', { class: 'gn-ntext' }, h('b', null, n.title), n.body ? h('span', null, n.body) : null));
      htui.el.append(b);
      setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, 4500);
    },

    // ---- カレンダーと通知センター（日時を押すと開く）
    calendar(force) {
      const old = htui.el.querySelector('.gn-cal:not(.leaving)');
      if (old) { if (!force) old._close(); return; }
      const banner = htui.el.querySelector('.gn-banner'); if (banner) banner.remove();
      const self = this, now = new Date();
      let month = new Date(now.getFullYear(), now.getMonth(), 1);
      const list = h('div', { class: 'gn-nlist' }), cal = h('div', { class: 'gn-month' });
      const fmtTime = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return '今'; if (m < 60) return m + '分前'; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
      function fillList() {
        list.textContent = '';
        if (!htui.notices.length) { list.append(h('div', { class: 'gn-nempty' }, OS.icon('bell', 40), h('span', null, '通知はありません'))); return; }
        htui.notices.forEach(n => list.append(h('div', { class: 'gn-note' },
          h('span', { class: 'gn-nico' }, OS.icon(n.icon || 'bell', 18)),
          h('span', { class: 'gn-ntext' }, h('span', { class: 'gn-napp' }, (n.app || 'htmlOS') + ' ・ ' + fmtTime(n.time)), h('b', null, n.title), n.body ? h('span', null, n.body) : null),
          h('button', { class: 'gn-nx', type: 'button', title: '消す', 'aria-label': n.title + ' を消す', onclick: () => { htui.notices = htui.notices.filter(x => x !== n); fillList(); self.syncDot(); } }, OS.icon('x', 14)))));
      }
      function fillCal() {
        cal.textContent = '';
        const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
        cal.append(h('div', { class: 'gn-mhead' },
          h('button', { class: 'gn-mnav', type: 'button', 'aria-label': '前の月', onclick: () => { month = new Date(y, m - 1, 1); fillCal(); } }, OS.icon('back', 16)),
          h('b', null, y + '年' + (m + 1) + '月'),
          h('button', { class: 'gn-mnav', type: 'button', 'aria-label': '次の月', onclick: () => { month = new Date(y, m + 1, 1); fillCal(); } }, OS.icon('fwd', 16))));
        const g = h('div', { class: 'gn-days' });
        for (let i = 0; i < 7; i++) g.append(h('span', { class: 'gn-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, WEEK[i]));
        for (let i = 0; i < 42; i++) {
          const n = i - first + 1, out = n < 1 || n > days, num = n < 1 ? prevDays + n : n > days ? n - days : n;
          const today = !out && y === now.getFullYear() && m === now.getMonth() && n === now.getDate();
          g.append(h('span', { class: 'gn-day' + (out ? ' out' : '') + (today ? ' today' : '') + (i % 7 === 0 ? ' sun' : i % 7 === 6 ? ' sat' : '') }, String(num)));
        }
        cal.append(g);
      }
      const dnd = h('input', { type: 'checkbox', id: 'gn-dnd', checked: !!htui.prefs.dnd, onchange: e => htui.setPrefs({ dnd: e.target.checked }) });
      const pop = h('div', { class: 'gn-cal', role: 'dialog', 'aria-label': 'カレンダーと通知' },
        h('div', { class: 'gn-ncol' }, list, h('div', { class: 'gn-nfoot' },
          h('label', { class: 'gn-switch' }, dnd, h('span', { class: 'gn-knob' }), 'おやすみモード'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { htui.notices = []; fillList(); self.syncDot(); } }, 'クリア'))),
        h('div', { class: 'gn-ccol' }, h('div', { class: 'gn-today' }, h('span', null, WEEK[now.getDay()] + '曜日'), h('b', null, now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日')), cal,
          h('button', { class: 'gn-mtoday', type: 'button', onclick: () => { month = new Date(now.getFullYear(), now.getMonth(), 1); fillCal(); } }, '今日')));
      htui.notices.forEach(n => { n.unread = false; }); this.syncDot();
      fillList(); fillCal();
      popup(pop, this.clockBtn);
    },

    // ---- アクティビティ画面（GNOME 40 以降の作り）。デスクトップそのものを縮めて「ワークスペース」にし、
    //      その中に本物のウィンドウを重ならないよう並べ直す。force=true なら開いているときに閉じない。apps=true でアプリ一覧
    overview(force, apps) {
      const k = htui.kit, root = htui.el, desk = htui.desk;
      let ov = root.querySelector('.gn-ov:not(.leaving)');
      if (ov) { if (!force) ov._close(); else if (apps != null) ov._mode(apps); return; }
      htui.closeMenus();
      const cal = root.querySelector('.gn-cal:not(.leaving)'); if (cal && cal._close) cal._close();
      const tok = root._ovTok = {}, wall = root.style.background;
      const q = h('input', { class: 'gn-search', id: 'gn-search', placeholder: '入力して検索', 'aria-label': 'アプリを検索', autocomplete: 'off', spellcheck: 'false' });
      const sbox = h('label', { class: 'gn-sbox' }, OS.icon('search', 18), q);
      const stage = h('div', { class: 'gn-stage' }), area = h('div', { class: 'gn-area' }), dock = h('div', { class: 'gn-dock' });
      ov = h('div', { class: 'gn-ov' }, stage, area, sbox, dock);
      ov.style.top = desk.offsetTop + 'px';
      let showApps = !!apps, closing = false, cards = [];
      const searching = () => q.value.trim() !== '';

      // ウィンドウの並べ方: 行数を 1 から順に試し、ウィンドウがいちばん大きく見える行数を選ぶ（元の位置の上下・左右の順は保つ）
      function arrange(W, H) {
        const items = htui.wins.filter(w => !w.closed).map(w => ({ w, x: w.el.offsetLeft, y: w.el.offsetTop, ww: w.el.offsetWidth || 1, hh: w.el.offsetHeight || 1 }));
        const n = items.length; if (!n) return [];
        const P = Math.max(W, H) * .035, G = Math.max(W, H) * .035, AW = W - P * 2, AH = H - P * 2;
        items.sort((a, b) => (a.y + a.hh / 2) - (b.y + b.hh / 2));
        let best = null;
        for (let r = 1; r <= n; r++) {
          const cols = Math.ceil(n / r); if (Math.ceil(n / cols) !== r) continue;
          const cw = (AW - (cols - 1) * G) / cols, ch = (AH - (r - 1) * G) / r;
          const cover = items.reduce((t, it) => { const s = Math.min(cw / it.ww, ch / it.hh, 1); return t + s * s * it.ww * it.hh; }, 0);
          if (!best || cover > best.cover) best = { r, cols, cw, ch, cover };
        }
        const { r, cols, cw, ch } = best, out = [];
        for (let i = 0; i < r; i++) {
          const row = items.slice(i * cols, i * cols + cols).sort((a, b) => (a.x + a.ww / 2) - (b.x + b.ww / 2));
          const sc = row.map(it => Math.min(cw / it.ww, ch / it.hh, 1));
          const tw = row.reduce((t, it, j) => t + it.ww * sc[j], 0) + G * (row.length - 1);
          let x = P + (AW - tw) / 2; const y = P + (AH - (r * ch + (r - 1) * G)) / 2 + i * (ch + G);
          row.forEach((it, j) => { out.push(Object.assign(it, { s: sc[j], X: x, Y: y + (ch - it.hh * sc[j]) / 2 })); x += it.ww * sc[j] + G; });
        }
        return out;
      }
      function fillDock() {
        dock.textContent = '';
        k.apps().forEach(a => dock.append(h('button', { class: 'gn-dk' + (htui.wins.some(w => w.app === a.id) ? ' run' : ''), type: 'button', title: a.name, 'aria-label': a.name, onclick: () => {
          const w = byZ().find(x => x.app === a.id);
          if (w) pick(w); else { close(); k.run(a.id); }
        } }, k.appIcon(a, 28))));
        const grid = h('button', { class: 'gn-dk gn-grid' + (showApps ? ' on' : ''), type: 'button', title: 'アプリを表示', 'aria-label': 'アプリを表示', onclick: () => { showApps = !showApps; q.value = ''; layout(); } });
        grid.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">' + [5, 12, 19].map(y => [5, 12, 19].map(x => '<circle cx="' + x + '" cy="' + y + '" r="2.1"/>').join('')).join('') + '</svg>';
        dock.append(h('span', { class: 'gn-dsep' }), grid);
      }
      function fillApps() {
        area.textContent = '';
        const t = q.value.trim().toLowerCase();
        const list = k.apps().filter(a => !t || (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t));
        const g = h('div', { class: 'gn-apps' });
        list.forEach(a => g.append(h('button', { class: 'gn-appbtn', type: 'button', title: a.desc || a.name, onclick: () => { close(); k.run(a.id); } }, k.appIcon(a, 34), h('span', null, a.name))));
        if (!list.length) g.append(h('p', { class: 'gn-empty' }, '見つかりませんでした'));
        area.append(g);
      }
      function layout() {
        if (closing) return;
        const sr = searching();
        root.classList.toggle('gn-ovapps', showApps && !sr); root.classList.toggle('gn-ovsearch', sr);
        fillDock();
        const W = desk.clientWidth, H = desk.clientHeight, phone = OS.uiMode === 'phone';
        const top = sbox.offsetTop + sbox.offsetHeight + 16, bottom = H - dock.offsetTop + 18;
        const side = phone ? 12 : Math.max(24, W * .06);
        let kk = Math.max(.1, Math.min((H - top - bottom) / H, (W - side * 2) / W));
        if (showApps || sr) kk = Math.min(kk, phone ? .14 : .17);
        const g = { k: kk, x: (W - kk * W) / 2, y: top };
        desk.style.transformOrigin = '0 0';
        desk.style.transform = 'translate(' + g.x + 'px,' + g.y + 'px) scale(' + kk + ')';
        desk.style.borderRadius = (14 / kk) + 'px';
        const items = arrange(W, H);
        items.forEach(it => { const s = it.w.el.style; s.transformOrigin = '0 0'; s.transform = 'translate(' + (it.X - it.x) + 'px,' + (it.Y - it.y) + 'px) scale(' + it.s + ')'; });
        cards = items.map(it => Object.assign(it, { g }));
        stage.textContent = '';
        if (showApps || sr) { area.style.top = (g.y + kk * H + 18) + 'px'; area.style.bottom = bottom + 'px'; fillApps(); }
        else area.textContent = '';
        // 右どなりの空のワークスペース（GNOME はいつも空のワークスペースを 1 つ用意して見せる）
        stage.append(h('div', { class: 'gn-peek', 'aria-hidden': 'true', style: 'left:' + (g.x + kk * W + Math.max(24, W * .06)) + 'px;top:' + g.y + 'px;width:' + kk * W + 'px;height:' + kk * H + 'px;background:' + wall }));
        items.forEach(it => stage.append(card(it)));
      }
      function card(it) {
        const { w, g } = it, a = OS.apps[w.app] || {};
        const L = g.x + it.X * g.k, T = g.y + it.Y * g.k, CW = it.ww * it.s * g.k, CH = it.hh * it.s * g.k;
        const c = h('div', { class: 'gn-win' + (w === htui.active() ? ' cur' : ''), style: 'left:' + L + 'px;top:' + T + 'px;width:' + CW + 'px;height:' + CH + 'px' },
          h('button', { class: 'gn-winbtn', type: 'button', 'aria-label': w.title, title: w.title, onclick: () => pick(w) }),
          h('span', { class: 'gn-wic' }, k.appIcon(a.icon ? a : { icon: 'file' }, 30)),
          h('span', { class: 'gn-wt' }, w.title),
          h('button', { class: 'gn-wx', type: 'button', title: '閉じる', 'aria-label': w.title + ' を閉じる', onclick: () => w.close().then(relayout) }, OS.icon('x', 14)));
        // タッチ: ウィンドウを上へはじくと閉じる（中の本物のウィンドウもいっしょに動かす）
        c.addEventListener('pointerdown', e => {
          if (e.pointerType === 'mouse' || e.target.closest('.gn-wx')) return;
          const y0 = e.clientY, base = w.el.style.transform; let dy = 0;
          const mv = ev => { dy = Math.min(0, ev.clientY - y0); if (dy < -8) {
            c.style.transition = 'none'; c.style.transform = 'translateY(' + dy + 'px)'; c.style.opacity = String(1 + dy / 300);
            w.el.style.transition = 'none'; w.el.style.transform = 'translate(' + (it.X - it.x) + 'px,' + (it.Y - it.y + dy / g.k) + 'px) scale(' + it.s + ')'; w.el.style.opacity = c.style.opacity; } };
          const up = () => {
            document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
            c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; w.el.style.transition = ''; w.el.style.opacity = '';
            if (dy < -90) { c.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); w.close().then(relayout); }
            else w.el.style.transform = base;
          };
          document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
        });
        return c;
      }
      function pick(w) { w.focus(); close(); }
      // 閉じる: 縮めたデスクトップとウィンドウを元の位置へ戻すアニメーションのあと、片付ける
      function close() {
        if (closing) return; closing = true;
        document.removeEventListener('keydown', esc, true); window.removeEventListener('resize', relayout); mo.disconnect();
        root.classList.remove('gn-ovapps', 'gn-ovsearch'); root.classList.add('gn-ovout');
        desk.style.transform = ''; desk.style.borderRadius = '';
        htui.wins.forEach(w => { w.el.style.transform = ''; });
        htui.leave(ov);
        const fin = () => {
          if (root._ovTok !== tok) return;
          root.classList.remove('gn-ovmode', 'gn-ovout'); desk.style.background = ''; desk.style.transformOrigin = '';
          htui.wins.forEach(w => { w.el.style.transformOrigin = ''; });
        };
        if (htui.animOff()) fin(); else setTimeout(fin, 300);
      }
      const esc = e => {
        if (e.key !== 'Escape' || root.querySelector('.menu:not(.leaving),.modal-ov')) return;
        e.stopPropagation();
        if (searching()) { q.value = ''; layout(); } else if (showApps) { showApps = false; layout(); } else close();
      };
      // ウィンドウが開いたり閉じたりしたら並べ直す
      let raf = 0;
      const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
      const mo = new MutationObserver(relayout);
      ov._close = close; ov._mode = a => { showApps = a; q.value = ''; layout(); };
      ov.addEventListener('click', e => { if (e.target === ov || e.target === stage || e.target === area || e.target.classList.contains('gn-peek')) close(); });
      // タッチ: 上へスワイプでアプリ一覧、下へスワイプで戻る（ウィンドウの上は、ウィンドウを閉じる操作になる）
      swipe(ov, (dx, dy) => {
        if (Math.abs(dx) > Math.abs(dy) || root.querySelector('.gn-win[style*="translate"]')) return false;
        if (dy < -60 && !showApps) { showApps = true; q.value = ''; layout(); }
        else if (dy > 60) { if (showApps || searching()) { showApps = false; q.value = ''; layout(); } else close(); }
        else return false;
      });
      q.addEventListener('input', layout);
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = area.querySelector('.gn-appbtn'); if (b) b.click(); } });
      document.addEventListener('keydown', esc, true); window.addEventListener('resize', relayout);
      root.classList.remove('gn-ovout'); root.classList.add('gn-ovmode');
      desk.style.background = wall;
      root.append(ov);
      layout();
      mo.observe(desk, { childList: true });
      if (!OS.touch) q.focus();
    },
    onKey(e) { if (e.altKey && e.key === 'F1') { this.overview(); return true; } },
    onSuper() { this.overview(); }
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
      if (e.ctrlKey && e.altKey && e.key === 'Enter') { htui.kit.run('terminal'); return true; }
    },
  });

  // ======================================================== hAqua（macOS 風）
  //   デスクトップ: 上にメニューバー（</> メニュー・アプリ名・ファイル/編集/表示/ウインドウ/ヘルプ・コントロールセンター・Spotlight・日時）、
  //     下に拡大するドック、左上に信号機ボタンのウインドウ。Launchpad（F4 / Super）・Mission Control（F3 / Ctrl+↑）・Spotlight（Alt+Space）
  //   タブレット: iPadOS 風 / スマートフォン: iOS 風
  //     ホーム画面とドック、アプリは全画面。下のホームバーを上へスワイプでホーム、上へスワイプして止めるとアプリスイッチャー、
  //     ホームバーを左右にスワイプでアプリの切り替え。上端の右側から下へコントロールセンター、左側から下へ通知センター。ホーム画面を下へスワイプで検索
  const MAC_DOCK = ['hfile', 'hbrowser', 'hedit', 'terminal', 'hplayer', 'hcalc', 'settings'];
  const IOS_DOCK = { phone: ['hbrowser', 'hfile', 'hedit', 'settings'], tablet: ['hbrowser', 'hfile', 'hedit', 'terminal', 'hplayer', 'settings'] };
  const appName = w => (w && OS.apps[w.app] ? OS.apps[w.app].name : 'hFile');
  const glyph = (d, size) => h('span', { class: 'ico', 'aria-hidden': 'true', html: '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>' });
  const G_TOGGLES = '<rect x="3" y="6" width="18" height="5" rx="2.5"/><circle cx="8" cy="8.5" r="1.4" fill="currentColor"/><rect x="3" y="13" width="18" height="5" rx="2.5"/><circle cx="16" cy="15.5" r="1.4" fill="currentColor"/>';
  const G_WIFI = '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>';
  const G_MOON = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
  const G_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const G_LP = '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>';

  OS.registerSession({
    id: 'mac', name: 'hAqua（macOS 風）', desc: '上にメニューバー、下に拡大するドック、左上に信号機のボタン。Launchpad・Mission Control・Spotlight もあります。タブレットでは iPadOS 風、スマートフォンでは iOS 風のホーム画面とジェスチャーになります。',
    build(k) {
      const self = this, el = htui.el;
      // ---- メニューバー（デスクトップ）
      this.appEl = h('b', { class: 'mc-appname' }, 'hFile');
      const menus = [['ファイル', () => this.fileMenu()], ['編集', () => this.editMenu()], ['表示', () => this.viewMenu()], ['ウインドウ', () => this.windowMenu()], ['ヘルプ', () => this.helpMenu()]];
      const mbtn = (label, items, cls) => {
        const b = h('button', { class: 'mc-mi ' + (cls || ''), type: 'button', onclick: e => k.menu(e.currentTarget, items()) }, label);
        // メニューを開いているあいだは、隣の見出しにポインタを動かすだけで切り替わる（macOS と同じ）
        b.addEventListener('pointerenter', e => { const open = htui.el.querySelector('.menu:not(.leaving)'); if (e.pointerType === 'mouse' && open && open._anchor && open._anchor !== b && open._anchor.closest('.mc-bar')) b.click(); });
        return b;
      };
      const logoBtn = mbtn(h('span', { class: 'mc-logo' }, OS.icon('win', 17)), () => this.logoMenu(), 'mc-logo-btn');
      logoBtn.setAttribute('aria-label', 'htmlOS メニュー');
      const clock = k.clock(h('span'), d => (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WEEK[d.getDay()] + ')  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()));
      this.clockBtn = h('button', { class: 'mc-ri mc-clock', type: 'button', 'aria-label': '通知センター', onclick: () => this.notifCenter() }, clock);
      this.ccBtn = h('button', { class: 'mc-ri', type: 'button', title: 'コントロールセンター', 'aria-label': 'コントロールセンター', onclick: () => this.controlCenter() }, glyph(G_TOGGLES, 17));
      const bar = h('div', { class: 'mc-bar' },
        h('div', { class: 'mc-left' }, logoBtn, mbtn(this.appEl, () => this.appMenu(), 'mc-appbtn'), menus.map(m => mbtn(m[0], m[1]))),
        h('div', { class: 'mc-right' }, k.modeButton('mc-ri'),
          h('span', { class: 'mc-ri mc-wifi', title: navigator.onLine === false ? 'オフライン' : 'オンライン' }, glyph(G_WIFI, 17)),
          h('button', { class: 'mc-ri', type: 'button', title: 'Spotlight（Alt+Space）', 'aria-label': 'Spotlight 検索', onclick: () => this.spotlight() }, OS.icon('search', 15)),
          this.ccBtn, this.clockBtn));
      // ---- ドック（デスクトップ）
      this.dock = h('div', { class: 'mc-dock', role: 'toolbar', 'aria-label': 'Dock' });
      this.dock.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') this.magnify(e.clientX); });
      this.dock.addEventListener('pointerleave', () => this.magnify(null));
      // ---- iPadOS / iOS: ステータスバー・ホーム画面・ホームバー
      this.grid = h('div', { class: 'ios-grid' });
      this.iosDock = h('div', { class: 'ios-dock' });
      const widget = h('div', { class: 'ios-widget' }, k.clock(h('b'), d => d.getHours() + ':' + pad(d.getMinutes())), k.clock(h('span'), d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日'));
      this.home = h('div', { class: 'ios-home' }, widget, this.grid, h('div', { class: 'ios-dots', 'aria-hidden': 'true' }, h('i', { class: 'on' }), h('i')), this.iosDock);
      swipe(this.home, (dx, dy) => { if (dy > 60 && Math.abs(dy) > Math.abs(dx)) this.spotlight(); else return false; });
      const desk = k.desk(false);
      desk.prepend(this.home);
      const batt = h('span', { class: 'ios-batt', hidden: true });
      if (navigator.getBattery) navigator.getBattery().then(b => { const upd = () => { batt.hidden = false; batt.textContent = Math.round(b.level * 100) + '%'; }; upd(); b.addEventListener('levelchange', upd); }).catch(() => {});
      const status = h('div', { class: 'ios-status' },
        k.clock(h('b', { class: 'ios-time' }), d => d.getHours() + ':' + pad(d.getMinutes())),
        k.clock(h('span', { class: 'ios-date' }), d => (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WEEK[d.getDay()] + ')'),
        h('span', { class: 'ios-sicons' }, k.modeButton('ios-sbtn'), glyph(G_WIFI, 15), batt));
      this.homeBar = h('div', { class: 'ios-homebar', 'aria-hidden': 'true' });
      const top = edge('t', { end: v => { if (v.max > 30 && !v.cancel) { if (v.x - v.dx > el.clientWidth * .6) this.controlCenter(); else this.notifCenter(); } } });
      const bottom = edge('b', { start: () => this.gestureStart(), move: v => this.gestureMove(v), end: v => this.gestureEnd(v) });
      el.append(bar, desk, this.dock, status, this.homeBar, top, bottom);
      el.classList.add('ios-home-on');
    },
    onStart() { this.onApps(); this.onActive(htui.active()); const b = htui.prefs.brightness; OS.root.style.filter = b && b < 1 ? 'brightness(' + b + ')' : ''; },
    onStop() { this.dock = null; this.grid = null; this._sig = null; if (OS.root) OS.root.style.filter = ''; },
    freeWindows() { return false; },

    // ---- アプリの一覧が変わったとき: ドック・ホーム画面を作り直す
    onApps() {
      if (!this.dock) return;
      const k = htui.kit, self = this;
      // 中身が変わらないなら作り直さない（作り直すと、押している途中のボタンが入れ替わってタップが消える）
      const sig = [OS.uiMode, Object.keys(OS.apps).join(), htui.wins.map(w => w.app + (w.el.classList.contains('hidden') ? '-' : '+') + w.title).join('|'), byZ().map(w => w.app).join()].join('#');
      if (sig === this._sig) return;
      this._sig = sig;
      // デスクトップのドック: Launchpad・よく使うアプリ・（区切り）・ドックにない起動中のアプリ・しまったウインドウ
      const item = (cls, name, icon, onclick, run) => h('button', { class: 'mc-dk ' + cls + (run ? ' run' : ''), type: 'button', 'data-name': name, 'aria-label': name, onclick: onclick }, icon);
      this.dock.textContent = '';
      this.dock.append(item('mc-lp', 'Launchpad', h('span', { class: 'app-ico mc-lpico' }, glyph(G_LP, 30)), () => this.launchpad()));
      const pinned = MAC_DOCK.filter(id => OS.apps[id]), extra = [...new Set(htui.wins.map(w => w.app))].filter(id => OS.apps[id] && !pinned.includes(id));
      pinned.concat(extra).forEach(id => { const a = OS.apps[id]; this.dock.append(item('', a.name, k.appIcon(a, 28), e => this.openApp(id, e.currentTarget), htui.wins.some(w => w.app === id))); });
      const mins = htui.wins.filter(w => w.el.classList.contains('hidden'));
      this.dock.append(h('span', { class: 'mc-dsep' }));
      mins.forEach(w => { const a = OS.apps[w.app] || {}; this.dock.append(item('mc-min', w.title, h('span', { class: 'mc-thumb' }, k.appIcon(a.icon ? a : { icon: 'file' }, 18)), () => w.focus())); });
      this.dock.append(item('mc-trash', 'ゴミ箱', h('span', { class: 'app-ico mc-trashico' }, OS.icon('trash', 26)), () => OS.ui.toast('htmlOS ではファイルはすぐに削除されます（ゴミ箱はありません）')));
      // ホーム画面
      const tile = a => h('button', { class: 'ios-app', type: 'button', title: a.desc || a.name, onclick: () => self.openApp(a.id) }, k.appIcon(a, 30), h('span', null, a.name));
      const dockIds = (IOS_DOCK[OS.uiMode] || IOS_DOCK.phone).filter(id => OS.apps[id]);
      this.grid.textContent = ''; this.iosDock.textContent = '';
      k.apps().filter(a => OS.uiMode !== 'phone' || !dockIds.includes(a.id)).forEach((a, i) => { const t = tile(a); t.style.setProperty('--i', i); this.grid.append(t); });
      dockIds.forEach(id => this.iosDock.append(tile(OS.apps[id])));
      if (OS.uiMode === 'tablet') {
        const recent = byZ().map(w => w.app).filter((id, i, l) => OS.apps[id] && !dockIds.includes(id) && l.indexOf(id) === i).slice(0, 3);
        if (recent.length) { this.iosDock.append(h('span', { class: 'ios-dsep' })); recent.forEach(id => this.iosDock.append(tile(OS.apps[id]))); }
      }
    },
    // ドックの拡大（ポインタに近いアイコンほど大きく）
    magnify(x) {
      if (!this.dock || htui.animOff()) return;
      [...this.dock.querySelectorAll('.mc-dk')].forEach(b => {
        if (x == null) { b.style.removeProperty('--m'); return; }
        const r = b.getBoundingClientRect(), d = Math.abs(x - (r.left + r.width / 2));
        b.style.setProperty('--m', (1 + .55 * Math.max(0, 1 - d / 130)).toFixed(3));
      });
    },
    // アプリを開く。もう開いているなら、その手前のウインドウへ（しまってあれば戻す）
    openApp(id, btn) {
      const w = byZ().find(x => x.app === id);
      htui.closeMenus();
      if (w) { w.focus(); return; }
      if (btn && !htui.animOff()) { btn.classList.remove('bounce'); void btn.offsetWidth; btn.classList.add('bounce'); }
      htui.el.classList.remove('ios-home-on');
      htui.kit.run(id);
    },
    onActive(w) {
      if (this.appEl) this.appEl.textContent = appName(w);
      if (OS.touch) htui.el.classList.toggle('ios-home-on', !w);
      this.onApps();
    },
    onFocus() { if (OS.touch) htui.el.classList.remove('ios-home-on'); },
    onMode() { if (OS.touch && !htui.active()) htui.el.classList.add('ios-home-on'); this.onApps(); },

    // ---- メニューバーのメニュー
    logoMenu() {
      const k = htui.kit;
      return [
        { label: 'この htmlOS について', icon: 'win', act: () => this.about() },
        { sep: true },
        { label: 'システム設定…', icon: 'gear', act: () => k.run('settings') },
        { label: 'App Store 風の hStore…', icon: 'box', act: () => k.run('hstore') },
        { sep: true },
        { label: '画面モード…', icon: OS.modeIcons[OS.uiMode], act: () => { const r = this.clockBtn.getBoundingClientRect(); setTimeout(() => k.menuAt(8, 30, k.modeItems()), 0); } },
        { sep: true },
        { label: '再起動…', icon: 'reload', act: () => OS.reboot() },
        { label: 'システム終了…', icon: 'power', act: () => OS.poweroff() },
        { sep: true },
        { label: htui.user + ' をログアウト…', icon: 'user', act: () => htui.logout() },
        { label: 'CUI（jsh）に切り替え', icon: 'terminal', act: () => htui.stop() }
      ];
    },
    appMenu() {
      const w = htui.active(), a = w ? OS.apps[w.app] || {} : OS.apps.hfile || {};
      return [{ label: appName(w) + ' について', icon: a.icon || 'file', act: () => OS.ui.alert((a.desc || a.name || '') + (a.pkg ? '\n（パッケージ ' + a.pkg + '）' : ''), appName(w)) },
        { sep: true }, { label: '設定…', icon: 'gear', act: () => htui.kit.run('settings') }, { sep: true },
        { label: appName(w) + ' を終了', icon: 'x', disabled: !w, act: () => htui.wins.filter(x => x.app === w.app).forEach(x => x.close()) }];
    },
    fileMenu() {
      const w = htui.active();
      return [{ label: '新規ウインドウ', icon: 'plus', disabled: !w, act: () => htui.kit.run(w.app) },
        { label: 'ウインドウを閉じる', icon: 'x', disabled: !w, act: () => w.close() }, { sep: true },
        { label: 'ファイルを開く（hFile）', icon: 'folder', act: () => htui.kit.run('hfile') }];
    },
    editMenu() {
      const exec = c => () => { try { document.execCommand(c); } catch (e) { /* 使えない場面では何もしない */ } };
      return [{ label: '取り消す', icon: 'back', act: exec('undo') }, { label: 'やり直す', icon: 'fwd', act: exec('redo') }, { sep: true },
        { label: 'カット', act: exec('cut') }, { label: 'コピー', act: exec('copy') },
        { label: 'ペースト', act: async () => { try { const t = await navigator.clipboard.readText(); document.execCommand('insertText', false, t); } catch (e) { OS.ui.toast('ペーストは Ctrl+V を使ってください'); } } },
        { label: 'すべてを選択', act: exec('selectAll') }];
    },
    viewMenu() {
      const w = htui.active();
      return [{ label: 'フルスクリーンにする', icon: 'max', disabled: !w, act: () => w.snap('max') },
        { label: '元のサイズに戻す', icon: 'min', disabled: !w || !w.zone, act: () => w.unsnap() }, { sep: true },
        { label: 'Mission Control', icon: 'grid', act: () => this.missionControl() }, { label: 'Launchpad', icon: 'grid', act: () => this.launchpad() }];
    },
    windowMenu() {
      const w = htui.active();
      return [{ label: 'しまう', icon: 'min', disabled: !w, act: () => w.minimize() },
        { label: '拡大／縮小', icon: 'max', disabled: !w, act: () => (w.zone === 'max' ? w.unsnap() : w.snap('max')) },
        { label: '画面の左半分に配置', disabled: !w, act: () => w.snap('left') }, { label: '画面の右半分に配置', disabled: !w, act: () => w.snap('right') },
        { sep: true }].concat(htui.wins.map(x => ({ label: x.title, icon: (OS.apps[x.app] || {}).icon || 'file', hint: x === w ? '●' : x.el.classList.contains('hidden') ? 'しまってある' : null, act: () => x.focus() })));
    },
    helpMenu() {
      const w = htui.active(), a = w ? OS.apps[w.app] : null;
      return [{ label: (a ? a.name : 'htmlOS') + ' ヘルプ', icon: 'bell', act: () => OS.ui.alert(a ? a.desc || a.name : 'Launchpad（F4）でアプリを、Spotlight（Alt+Space）で検索、Mission Control（F3）でウインドウの一覧を出せます。', a ? a.name : 'htmlOS') },
        { label: 'jsh のコマンド一覧（Terminal）', icon: 'terminal', act: () => OS.launch('terminal') }];
    },
    about() {
      const u = OS.fs.usage();
      OS.ui.modal({ title: 'この htmlOS について', body: h('div', { class: 'mc-about' }, OS.mark(72), h('h2', null, 'htmlOS'), h('p', null, 'バージョン ' + OS.version + (OS.live ? '（Live）' : '')),
        h('dl', null, h('dt', null, 'コンピューター名'), h('dd', null, OS.hostname()), h('dt', null, 'プロセッサ'), h('dd', null, (navigator.hardwareConcurrency || '?') + ' コア'),
          h('dt', null, 'ストレージ'), h('dd', null, Math.round(u.used / 1024) + ' KB / ' + Math.round(u.total / 1024) + ' KB'), h('dt', null, 'ディスプレイ'), h('dd', null, innerWidth + ' × ' + innerHeight))),
        buttons: [{ label: '閉じる', primary: true, cancel: true, value: true }] });
    },

    // ---- 通知: デスクトップは右上、タッチは上にバナー
    onNotify(n) {
      if (n.silent || htui.prefs.dnd) return;
      // コントロールセンター・通知センターを開いているあいだはバナーを出さない（通知センターには入る）
      const nc = htui.el.querySelector('.mc-nc:not(.leaving)');
      if (nc && nc._refresh) { nc._refresh(); return; }
      if (htui.el.querySelector('.mc-cc:not(.leaving)')) return;
      htui.el.querySelectorAll('.mc-banner').forEach(b => b.remove());
      const b = h('button', { class: 'mc-banner', type: 'button', onclick: () => { b.remove(); this.notifCenter(); } },
        h('span', { class: 'mc-nico' }, OS.icon(n.icon || 'bell', 20)), h('span', { class: 'mc-ntext' }, h('small', null, (n.app || 'htmlOS') + ' ・ 今'), h('b', null, n.title), n.body ? h('span', null, n.body) : null));
      htui.el.append(b);
      setTimeout(() => htui.leave(b), 5000);
    },
    // 通知センター（日時を押す・タッチでは上端の左側から下へ）
    notifCenter() {
      if (htui.el.querySelector('.mc-nc:not(.leaving)')) { htui.el.querySelector('.mc-nc')._close(); return; }
      const now = new Date(), list = h('div', { class: 'mc-nlist' });
      const fill = () => {
        list.textContent = '';
        if (!htui.notices.length) list.append(h('p', { class: 'mc-nempty' }, '通知はありません'));
        htui.notices.forEach(n => list.append(h('div', { class: 'mc-note' }, h('span', { class: 'mc-nico' }, OS.icon(n.icon || 'bell', 18)),
          h('span', { class: 'mc-ntext' }, h('small', null, (n.app || 'htmlOS') + ' ・ ' + pad(new Date(n.time).getHours()) + ':' + pad(new Date(n.time).getMinutes())), h('b', null, n.title), n.body ? h('span', null, n.body) : null),
          h('button', { class: 'mc-nx', type: 'button', 'aria-label': n.title + ' を消す', onclick: () => { htui.notices = htui.notices.filter(x => x !== n); fill(); } }, OS.icon('x', 12)))));
        htui.notices.forEach(n => { n.unread = false; });
      };
      // カレンダーのウィジェット
      const y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      const cal = h('div', { class: 'mc-cal' }, h('b', null, (m + 1) + '月'), h('div', { class: 'mc-cgrid' },
        [...WEEK].map((d, i) => h('span', { class: 'mc-wd' + (i === 0 ? ' sun' : '') }, d)),
        Array.from({ length: first }, () => h('span')), Array.from({ length: days }, (_, i) => h('span', { class: i + 1 === now.getDate() ? 'today' : '' }, String(i + 1)))));
      const big = h('div', { class: 'mc-ncclock' }, h('b', null, now.getHours() + ':' + pad(now.getMinutes())), h('span', null, (m + 1) + '月' + now.getDate() + '日 ' + WEEK[now.getDay()] + '曜日'));
      const nc = h('div', { class: 'mc-nc', role: 'dialog', 'aria-label': '通知センター' }, big,
        h('div', { class: 'mc-nhead' }, h('span', null, '通知'), h('button', { class: 'mc-nclear', type: 'button', onclick: () => { htui.notices = []; fill(); } }, 'すべて消去')),
        list, h('div', { class: 'mc-widgets' }, cal), h('div', { class: 'ios-grip', 'aria-hidden': 'true' }));
      dragOn(nc, (dx, dy) => { if (OS.touch && dy < -60) close(); }, true);
      nc._refresh = fill;
      fill();
      const close = popup(nc, this.clockBtn);
    },
    // コントロールセンター
    controlCenter() {
      if (htui.el.querySelector('.mc-cc:not(.leaving)')) { htui.el.querySelector('.mc-cc')._close(); return; }
      const k = htui.kit, self = this;
      htui.el.querySelectorAll('.mc-banner').forEach(b => b.remove());
      const tile = (cls, icon, label, sub, on, fn) => h('button', { class: 'mc-tile ' + cls + (on ? ' on' : ''), type: 'button', onclick: fn }, h('span', { class: 'mc-tico' }, icon), h('span', { class: 'mc-tl' }, h('b', null, label), sub ? h('small', null, sub) : null));
      const bright = h('input', { type: 'range', min: '40', max: '100', value: String(Math.round((htui.prefs.brightness || 1) * 100)), 'aria-label': '画面の明るさ', class: 'mc-range',
        oninput: e => { const v = Number(e.target.value) / 100; OS.root.style.filter = v < 1 ? 'brightness(' + v + ')' : ''; }, onchange: e => htui.setPrefs({ brightness: Number(e.target.value) / 100 }) });
      const cc = h('div', { class: 'mc-cc', role: 'dialog', 'aria-label': 'コントロールセンター' },
        h('div', { class: 'mc-cgrp' },
          tile('', glyph(G_WIFI, 18), 'ネットワーク', navigator.onLine === false ? 'オフライン' : 'オンライン', navigator.onLine !== false, () => OS.ui.toast(navigator.onLine === false ? 'インターネットに接続していません' : 'インターネットに接続しています')),
          tile('', glyph(G_MOON, 18), 'おやすみモード', htui.prefs.dnd ? 'オン' : 'オフ', !!htui.prefs.dnd, () => { htui.setPrefs({ dnd: !htui.prefs.dnd }); close(); self.controlCenter(); })),
        h('div', { class: 'mc-cgrp' },
          tile('', OS.icon(OS.modeIcons[OS.uiMode], 18), '画面モード', OS.modeNames[OS.modePref], false, e => k.menu(e.currentTarget, k.modeItems())),
          tile('', OS.icon('gear', 18), 'システム設定', null, false, () => { close(); self.openApp('settings'); })),
        h('div', { class: 'mc-cslider' }, h('b', null, 'ディスプレイ'), h('label', { class: 'mc-rrow' }, glyph(G_SUN, 16), bright)),
        h('div', { class: 'mc-cgrp mc-cpow' },
          tile('', OS.icon('power', 18), '電源', null, false, e => k.menu(e.currentTarget, k.powerItems(), true))),
        h('div', { class: 'ios-grip', 'aria-hidden': 'true' }));
      dragOn(cc, (dx, dy) => { if (OS.touch && dy < -60) close(); }, true);
      const close = popup(cc, this.ccBtn);
    },
    // Spotlight: アプリとホームのファイルを名前で探す
    spotlight() {
      const old = htui.el.querySelector('.mc-spot:not(.leaving)'); if (old) { old._close(); return; }
      const k = htui.kit, home = OS.users.home(htui.user);
      const q = h('input', { class: 'mc-sq', id: 'mc-spot', placeholder: 'Spotlight 検索', 'aria-label': 'Spotlight 検索', autocomplete: 'off', spellcheck: 'false' });
      const res = h('div', { class: 'mc-sres', role: 'listbox' });
      let sel = 0, items = [];
      const files = [];
      const walk = (p, d) => { if (d > 4) return; try { for (const n of htui.fs.list(p)) { if (n.startsWith('.')) continue; const f = p + '/' + n; files.push(f); if (htui.fs.isDir(f) && !htui.fs.isLink(f)) walk(f, d + 1); } } catch (e) { /* 読めない場所は飛ばす */ } };
      walk(home, 0);
      const fill = () => {
        const t = q.value.trim().toLowerCase(); res.textContent = ''; sel = 0;
        if (!t) { items = []; box.classList.remove('has'); return; }
        const apps = k.apps().filter(a => (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t)).map(a => ({ label: a.name, sub: 'アプリ', icon: k.appIcon(a, 18), go: () => this.openApp(a.id) }));
        const fl = files.filter(f => OS.path.base(f).toLowerCase().includes(t)).slice(0, 8).map(f => ({ label: OS.path.base(f), sub: f.replace(home, '~'), icon: OS.icon(htui.fs.isDir(f) ? 'folder' : 'file', 18), go: () => { try { if (htui.fs.isDir(f)) OS.launch('hfile', f); else OS.openFile(f); } catch (e) { OS.ui.alert(e.message); } } }));
        items = apps.concat(fl);
        box.classList.toggle('has', true);
        if (!items.length) { res.append(h('p', { class: 'mc-snone' }, '「' + q.value + '」に一致する項目はありません')); return; }
        if (apps.length) res.append(h('div', { class: 'mc-shead' }, 'アプリ'));
        items.forEach((it, i) => {
          if (i === apps.length && fl.length) res.append(h('div', { class: 'mc-shead' }, 'ファイル'));
          res.append(h('button', { class: 'mc-sitem' + (i === sel ? ' sel' : ''), type: 'button', role: 'option', onclick: () => { close(); it.go(); } }, h('span', { class: 'mc-sico' }, it.icon), h('b', null, it.label), h('small', null, it.sub)));
        });
      };
      const paint = () => [...res.querySelectorAll('.mc-sitem')].forEach((b, i) => { b.classList.toggle('sel', i === sel); if (i === sel) b.scrollIntoView({ block: 'nearest' }); });
      q.addEventListener('input', fill);
      q.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); } }
        else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) { close(); it.go(); } }
      });
      const box = h('div', { class: 'mc-spot', role: 'dialog', 'aria-label': 'Spotlight' }, h('div', { class: 'mc-sbar' }, OS.icon('search', 22), q), res);
      const close = popup(box, null);
      setTimeout(() => q.focus(), 30);
    },
    // Launchpad: 全画面のアプリ一覧
    launchpad() {
      const old = htui.el.querySelector('.mc-lpad:not(.leaving)'); if (old) { old._close(); return; }
      const k = htui.kit;
      const q = h('input', { class: 'mc-lq', id: 'mc-lq', placeholder: '検索', 'aria-label': 'アプリを検索', autocomplete: 'off' });
      const grid = h('div', { class: 'mc-lgrid' });
      const fill = () => {
        const t = q.value.trim().toLowerCase(); grid.textContent = '';
        k.apps().filter(a => !t || (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t)).forEach((a, i) =>
          grid.append(h('button', { class: 'mc-lapp', type: 'button', title: a.desc || a.name, style: '--i:' + i, onclick: () => { close(); this.openApp(a.id); } }, k.appIcon(a, 40), h('span', null, a.name))));
      };
      q.addEventListener('input', fill);
      q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = grid.querySelector('.mc-lapp'); if (b) b.click(); } });
      const lp = h('div', { class: 'mc-lpad', role: 'dialog', 'aria-label': 'Launchpad' }, h('div', { class: 'mc-lbg' }), h('div', { class: 'mc-lsearch' }, OS.icon('search', 15), q), grid);
      lp.style.setProperty('--wall', htui.el.style.background);
      lp.addEventListener('click', e => { if (e.target === lp || e.target === grid || e.target.classList.contains('mc-lbg')) close(); });
      fill();
      const close = popup(lp, null);
      if (!OS.touch) setTimeout(() => q.focus(), 30);
    },
    // Mission Control: 開いているウインドウを重ならないように並べて見せる
    missionControl() {
      const root = htui.el, desk = htui.desk;
      const old = root.querySelector('.mc-mission:not(.leaving)'); if (old) { old._close(); return; }
      const wins = htui.wins.filter(w => !w.closed && !w.el.classList.contains('hidden'));
      if (!wins.length) { OS.ui.toast('開いているウインドウはありません'); return; }
      const W = desk.clientWidth, H = desk.clientHeight, n = wins.length, P = 40, G = 36;
      const items = wins.map(w => ({ w, x: w.el.offsetLeft, y: w.el.offsetTop, ww: w.el.offsetWidth || 1, hh: w.el.offsetHeight || 1 })).sort((a, b) => (a.y + a.hh / 2) - (b.y + b.hh / 2));
      let best = null;
      for (let r = 1; r <= n; r++) {
        const cols = Math.ceil(n / r); if (Math.ceil(n / cols) !== r) continue;
        const cw = (W - P * 2 - (cols - 1) * G) / cols, ch = (H - P * 2 - (r - 1) * G) / r;
        const cover = items.reduce((t, it) => { const s = Math.min(cw / it.ww, ch / it.hh, .9); return t + s * s * it.ww * it.hh; }, 0);
        if (!best || cover > best.cover) best = { r, cols, cw, ch, cover };
      }
      const ov = h('div', { class: 'mc-mission', role: 'dialog', 'aria-label': 'Mission Control' });
      ov.style.top = desk.offsetTop + 'px';
      for (let i = 0; i < best.r; i++) {
        const row = items.slice(i * best.cols, i * best.cols + best.cols).sort((a, b) => a.x - b.x);
        const sc = row.map(it => Math.min(best.cw / it.ww, best.ch / it.hh, .9));
        const tw = row.reduce((t, it, j) => t + it.ww * sc[j], 0) + G * (row.length - 1);
        let x = (W - tw) / 2; const y = P + (H - P * 2 - (best.r * best.ch + (best.r - 1) * G)) / 2 + i * (best.ch + G);
        row.forEach((it, j) => {
          const s = sc[j], X = x, Y = y + (best.ch - it.hh * s) / 2;
          it.w.el.style.transformOrigin = '0 0'; it.w.el.style.transform = 'translate(' + (X - it.x) + 'px,' + (Y - it.y) + 'px) scale(' + s + ')';
          ov.append(h('button', { class: 'mc-mwin', type: 'button', style: 'left:' + X + 'px;top:' + Y + 'px;width:' + it.ww * s + 'px;height:' + it.hh * s + 'px', 'aria-label': it.w.title, onclick: () => { it.w.focus(); close(); } }, h('span', null, it.w.title)));
          x += it.ww * s + G;
        });
      }
      root.classList.add('mc-mc-on');
      const close = () => {
        htui.leave(ov); document.removeEventListener('keydown', esc, true);
        wins.forEach(w => { w.el.style.transform = ''; });
        setTimeout(() => { root.classList.remove('mc-mc-on'); wins.forEach(w => { w.el.style.transformOrigin = ''; }); }, 320);
      };
      const esc = e => { if (e.key === 'Escape' || e.key === 'F3') { e.preventDefault(); e.stopPropagation(); close(); } };
      ov._close = close;
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.addEventListener('keydown', esc, true);
      root.append(ov);
    },

    // ---- iPadOS / iOS のホームバーのジェスチャー
    //   上へ引くとアプリが指についてきて小さくなる。勢いよく離せばホーム、少し止めてから離せばアプリスイッチャー。
    //   指を止めているあいだは移動のイベントが来ないので、「最後に動いてからの時間」で止まったことを見分ける
    gestureStart() { clearTimeout(this._gp); this.g = { w: htui.active(), t0: Date.now(), last: [], up: 0, paused: false }; },
    gestureMove(v) {
      const g = this.g; if (!g) return;
      const now = Date.now();
      g.last.push({ t: now, y: v.dy }); if (g.last.length > 6) g.last.shift();
      g.up = -v.dy; g.dx = v.dx;
      if (g.paused && Math.abs(v.dy - g.pauseY) > 24) { g.paused = false; htui.el.classList.remove('ios-peek'); }
      clearTimeout(this._gp);
      // 上へ 70px 以上引いたところで 0.2 秒止まったら「スイッチャーに入る」状態にする（アプリがカードの大きさまで縮む）
      this._gp = setTimeout(() => { if (this.g === g && g.up > 70 && Math.abs(g.dx || 0) < g.up) { g.paused = true; g.pauseY = -g.up; htui.el.classList.add('ios-peek'); this.dragWin(g, true); } }, 200);
      this.dragWin(g);
    },
    dragWin(g, peek) {
      const w = g.w; if (!w || w.el.classList.contains('hidden') || g.up <= 0 || Math.abs(g.dx || 0) > g.up) return;
      if (!htui.el.classList.contains('ios-drag')) { htui.el.style.setProperty('--wall', htui.wallCss(htui.prefs, htui.user)); htui.el.classList.add('ios-drag'); w.el.classList.add('ios-dragwin'); }
      const p = Math.min(1, g.up / (htui.desk.clientHeight * .6)), sc = peek || g.paused ? .6 : 1 - p * .45;
      w.el.style.transition = peek ? 'transform .18s ease-out, border-radius .18s' : 'none'; w.el.style.transformOrigin = '50% 100%';
      w.el.style.transform = 'translateY(' + (-g.up * .6) + 'px) scale(' + sc + ')'; w.el.style.borderRadius = '24px';
    },
    gestureEnd(v) {
      clearTimeout(this._gp);
      const g = this.g; this.g = null; htui.el.classList.remove('ios-peek'); if (!g) return;
      const w = g.w;
      const undrag = () => { htui.el.classList.remove('ios-drag'); if (w) w.el.classList.remove('ios-dragwin'); };
      const reset = anim => { if (!w) { undrag(); return; } w.el.style.transition = anim ? '' : 'none'; w.el.style.transform = ''; w.el.style.borderRadius = ''; setTimeout(() => { w.el.style.transition = ''; w.el.style.transformOrigin = ''; undrag(); }, anim ? 300 : 30); };
      if (v.cancel && !g.paused) { reset(true); return; }
      // 横にスワイプ: 前・次のアプリへ
      if (Math.abs(v.dx) > 70 && Math.abs(v.dx) > Math.abs(v.dy) * 1.5) {
        reset(true);
        const list = byZ(); if (list.length < 2) return;
        const cur = htui.active(), next = v.dx > 0 ? list[1] : list[list.length - 1];
        if (next && next !== cur) next.focus();
        return;
      }
      const up = -v.dy, now = Date.now(), a = g.last[0], b = g.last[g.last.length - 1];
      // 最後に動いてから 0.15 秒以上たっていれば、止まっていたとみなす
      const speed = !b || now - b.t > 150 ? 0 : a && b.t > a.t ? (a.y - b.y) / (b.t - a.t) : 1;
      if (g.paused || (up > 70 && speed < .25 && now - g.t0 > 300)) { this.appSwitcher(() => reset(false)); return; }
      if (up > 50 || (up > 20 && speed > .5)) { this.goHome(w); return; }
      reset(true);
    },
    goHome(w) {
      htui.closeMenus();
      const done = () => { htui.goHome(); htui.el.classList.add('ios-home-on'); htui.el.classList.remove('ios-drag'); if (w) w.el.classList.remove('ios-dragwin'); if (w) { w.el.style.transition = ''; w.el.style.transform = ''; w.el.style.borderRadius = ''; w.el.style.transformOrigin = ''; } this.onApps(); };
      if (w && !htui.animOff()) { w.el.style.transition = 'transform .25s ease-in, opacity .25s'; w.el.style.transform = 'translateY(30%) scale(.2)'; w.el.style.opacity = '0'; setTimeout(() => { w.el.style.opacity = ''; done(); }, 240); }
      else done();
    },
    // アプリスイッチャー: アプリのカードを横に並べる。上へはじくと終了、タップで切り替え、空いたところでホーム
    appSwitcher(onShown) {
      if (htui.el.querySelector('.ios-sw:not(.leaving)')) { if (onShown) onShown(); return; }
      const row = h('div', { class: 'ios-swrow' });
      const box = h('div', { class: 'ios-sw', role: 'dialog', 'aria-label': 'アプリスイッチャー' }, row);
      box.style.setProperty('--wall', htui.el.style.background);
      // カードには、ウインドウの中身を縮小した写しを入れる（キャンバスは絵も写す）
      const preview = (w, card) => {
        const W = w.el.offsetWidth || htui.desk.clientWidth, H = w.el.offsetHeight || htui.desk.clientHeight;
        const c = w.el.cloneNode(true);
        c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id')); c.removeAttribute('id');
        c.classList.remove('hidden', 'active', 'minimizing', 'closing');
        c.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;animation:none;transition:none;border-radius:0;pointer-events:none;display:flex';
        const src = w.el.querySelectorAll('canvas'), dst = c.querySelectorAll('canvas');
        dst.forEach((cv, i) => { try { cv.getContext('2d').drawImage(src[i], 0, 0); } catch (e) { /* 写せないものは空のまま */ } });
        c.inert = true;
        card.style.aspectRatio = W + ' / ' + H;
        const fit = () => { const r = card.clientWidth / W; c.style.transform = 'scale(' + r + ')'; };
        card.append(c);
        requestAnimationFrame(fit);
      };
      const fill = () => {
        row.textContent = '';
        const wins = byZ();
        if (!wins.length) { row.append(h('p', { class: 'ios-swempty' }, '開いているアプリはありません')); return; }
        wins.forEach(w => {
          const a = OS.apps[w.app] || {};
          const shot = h('button', { class: 'ios-cbody', type: 'button', 'aria-label': w.title + ' に切り替え', style: '--c:' + (a.color || '#5e5c64'), onclick: () => { close(); w.focus(); } });
          const card = h('div', { class: 'ios-card' },
            h('div', { class: 'ios-chead' }, htui.kit.appIcon(a.icon ? a : { icon: 'file' }, 16), h('span', null, a.name || w.title)), shot);
          preview(w, shot);
          card.addEventListener('pointerdown', e => {
            const y0 = e.clientY; let dy = 0;
            const mv = ev => { dy = Math.min(0, ev.clientY - y0); if (dy < -8) { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; card.style.opacity = String(1 + dy / 400); } };
            const upf = async () => {
              document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', upf); document.removeEventListener('pointercancel', upf);
              card.style.transition = ''; card.style.transform = ''; card.style.opacity = '';
              if (dy < -100) { card.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); if (await w.close()) { fill(); if (!htui.wins.length) { close(); this.goHome(null); } } }
            };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', upf); document.addEventListener('pointercancel', upf);
          });
          row.append(card);
        });
      };
      box.addEventListener('click', e => { if (e.target === box || e.target === row) { close(); this.goHome(null); } });
      fill();
      const close = popup(box, null);
      // スイッチャーが出きってから、縮めていたアプリを元に戻す（スイッチャーの下で戻るので、ばねのように戻って見えない）
      if (onShown) setTimeout(onShown, 220);
    },

    onSuper() { this.launchpad(); },
    onKey(e) {
      if (e.key === 'F4') { this.launchpad(); return true; }
      if (e.key === 'F3' || (e.ctrlKey && !e.altKey && e.key === 'ArrowUp')) { this.missionControl(); return true; }
      if ((e.altKey || e.metaKey) && !e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { this.spotlight(); return true; }
      // タッチ: Esc（キーボードの戻る）でホームへ
      if (OS.touch && e.key === 'Escape' && !htui.el.querySelector('.modal-ov,.menu:not(.leaving),.mc-cc:not(.leaving),.mc-nc:not(.leaving),.mc-spot:not(.leaving),.mc-lpad:not(.leaving),.ios-sw:not(.leaving)')) {
        const a = document.activeElement; if (htui.active() && (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName))) { this.goHome(htui.active()); return true; }
      }
    }
  });
})();
