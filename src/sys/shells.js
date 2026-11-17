/* デスクトップ環境（セッション）
   htui  … HTUi       上にパネル、左にデスクトップアイコン（標準）。タッチでは下にナビが出る
   win   … hWin       Windows 風。マウスではタスクバーとスタートメニュー、タッチでは Windows 8.1 風
   gnome … hShell     GNOME 風。トップバー、アクティビティ画面とドック、カレンダーと通知センター
   wm    … hwc        Labwc 風。パネルなしのウィンドウマネージャだけ。右クリックでメニュー
   どれも OS.registerSession({ id, name, desc, build(kit), ... }) で登録している。
   環境が持てるフック: onStart / onStop / onApps / onActive(win) / onFocus(win) / onMode / onNotify(n) / onKey(e) / freeWindows() */
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
    const esc = e => { if (e.key === 'Escape' && !htui.el.querySelector('.menu')) { e.stopPropagation(); close(); } };
    function close() { el.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); if (onClose) onClose(); }
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
      if (el.querySelector('.menu')) { htui.closeMenus(); return; }
      const pop = el.querySelector('.wp-ac,.wp-tasks,.wp-jump,.w8-appbar,.w8-charmwrap,.w8-pane,.w8-switch');
      if (pop && pop._close) { pop._close(); return; }
      if (el.classList.contains('w8-start-on')) { if (this.startEl.classList.contains('apps')) this.showApps(false); return; }
      const w = htui.active();
      if (w) w.close(); else this.showStart();
    },
    // タスク切り替え: 開いているアプリを横に並べる。タップで切り替え、下へはじくと閉じる
    taskSwitcher() {
      if (htui.el.querySelector('.wp-tasks')) return;
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
      if (htui.el.querySelector('.wp-ac')) return;
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
      const deskTile = h('button', { class: 'w8-tile w8-wide w8-desktile', type: 'button', style: 'background:' + (htui.wallpapers[htui.prefs.wallpaper | 0] || htui.wallpapers[0]).css + ';--i:1', onclick: () => this.launch('@desktop') },
        h('span', { class: 'w8-mini-bar' }), h('span', { class: 'w8-name' }, 'デスクトップ'));
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
      if (htui.el.querySelector('.w8-charms')) return;
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
      if (htui.el.querySelector('.w8-appbar')) return;
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
      const close = popup(sm, this.startBtn);
      fill();
      if (!OS.touch) q.focus();
    },
    onKey(e) {
      if (e.ctrlKey && e.key === 'Escape') { if (OS.touch) this.toggleStartScreen(); else this.toggleStart(); return true; }
      if (e.key === 'Escape' && OS.touch && OS.uiMode === 'phone' && !htui.el.querySelector('.modal-ov,.menu,.wp-ac,.wp-tasks,.wp-jump')) { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) { this.phoneBack(); return true; } }
    }
  });

  // ======================================================== hShell（GNOME 風）
  OS.registerSession({
    id: 'gnome', name: 'hShell（GNOME 風）', desc: '上にトップバー。「アクティビティ」でウィンドウ一覧・ドック・アプリ一覧、日時でカレンダーと通知センターを出す GNOME 風のデスクトップです。タッチでは下端から上へスワイプでアクティビティ。',
    build(k) {
      const self = this;
      const act = h('button', { class: 'gn-act', type: 'button', title: 'アクティビティ（Alt+F1）', onclick: () => self.overview() }, 'アクティビティ');
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
      const bottom = edge('b', { end: v => { if (v.max > 40) self.overview(true, htui.el.querySelector('.gn-ov') ? true : null); } });
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
      const old = htui.el.querySelector('.gn-cal');
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

    // ---- アクティビティ画面。force=true なら開いているときに閉じない。apps=true でアプリ一覧
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
      // タッチ: 上へスワイプでアプリ一覧、下へスワイプで戻る（ウィンドウのカードの上は、カードを閉じる操作になる）
      swipe(ov, (dx, dy) => {
        if (Math.abs(dx) > Math.abs(dy) || htui.el.querySelector('.gn-win[style*="translate"]')) return false;
        if (dy < -60 && !showApps) { showApps = true; q.value = ''; render(); }
        else if (dy > 60) { if (showApps) { showApps = false; render(); } else close(); }
        else return false;
      });
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
            const card = h('div', { class: 'gn-win' + (w === htui.active() ? ' cur' : '') },
              h('button', { class: 'gn-winbtn', type: 'button', onclick: () => { close(); w.focus(); } }, h('span', { class: 'gn-thumb' }, k.appIcon(a.icon ? a : { icon: 'file' }, 40)), h('span', { class: 'gn-wt' }, w.title)),
              h('button', { class: 'gn-wx', type: 'button', title: '閉じる', 'aria-label': w.title + ' を閉じる', onclick: async () => { await w.close(); render(); } }, OS.icon('x', 14)));
            // タッチ: ウィンドウを上へはじくと閉じる
            card.addEventListener('pointerdown', e => {
              if (e.pointerType === 'mouse' || e.target.closest('.gn-wx')) return;
              const y0 = e.clientY; let dy = 0;
              const mv = ev => { dy = Math.min(0, ev.clientY - y0); if (dy < -8) { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; card.style.opacity = String(1 + dy / 300); } };
              const up = async () => {
                document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
                card.style.transition = ''; card.style.transform = ''; card.style.opacity = '';
                if (dy < -90) { card.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); await w.close(); render(); }
              };
              document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
            });
            g.append(card);
          });
          area.append(g);
        }
        dock.textContent = '';
        k.apps().forEach(a => dock.append(h('button', { class: 'gn-dk' + (htui.wins.some(w => w.app === a.id) ? ' run' : ''), type: 'button', title: a.name, 'aria-label': a.name, onclick: () => {
          const w = byZ().find(x => x.app === a.id);
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
