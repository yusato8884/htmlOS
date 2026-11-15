/* HTUi — HTml UI。ログイン画面・パネル・ウィンドウマネージャ・ダイアログ。
   jsh から  htui start / htui stop  で起動・終了できます。 */
(function () {
  const OS = window.OS, h = OS.h, fs = OS.fs, path = OS.path, users = OS.users;

  const WALLPAPERS = [
    { name: '朝の空', css: 'linear-gradient(160deg,#16324f 0%,#2a628f 45%,#8fb8de 100%)' },
    { name: '夕暮れ', css: 'linear-gradient(160deg,#2b1b3d 0%,#8a3b5c 50%,#f0a868 100%)' },
    { name: '森', css: 'linear-gradient(160deg,#10281f 0%,#2f6b4f 55%,#b7d3a8 100%)' },
    { name: '石', css: 'linear-gradient(160deg,#22252b 0%,#4a505c 60%,#9aa2b1 100%)' },
    { name: '砂', css: 'linear-gradient(160deg,#5a4632 0%,#b08a5b 55%,#ecd9b6 100%)' },
    { name: '黒', css: '#101114' }
  ];
  const ACCENTS = ['#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac'];

  const htui = OS.htui = { running: false, user: null, fs: null, wins: [], z: 10, pid: 100, wallpapers: WALLPAPERS, accents: ACCENTS, el: null, prefs: {} };
  let clockTimer = null;

  function avatar(u, size) {
    const st = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.45) + 'px;';
    if (u && u.img) return h('span', { class: 'avatar', style: st + 'background-image:url("' + u.img + '")' });
    return h('span', { class: 'avatar', style: st + 'background-color:' + ((u && u.color) || '#5e5c64') }, ((u && u.name) || '?').charAt(0).toUpperCase());
  }
  htui.avatar = avatar;

  // ---------- 起動・終了
  htui.start = function (user) {
    if (htui.running) return false;
    htui.running = true;
    htui.el = h('div', { id: 'htui' });
    OS.root.append(htui.el);
    document.addEventListener('keydown', hotkeys);
    if (user && users.get(user)) session(user); else greeter();
    return true;
  };
  htui.stop = function () {
    if (!htui.running) return false;
    htui.wins.slice().forEach(w => w.close(true));
    clearInterval(clockTimer);
    document.removeEventListener('keydown', hotkeys);
    htui.el.remove(); htui.el = null;
    htui.running = false; htui.user = null; htui.fs = null; htui.iconsEl = null; htui.titleEl = null; htui.modeBtn = null;
    OS.setMode('auto');
    OS.tty1.focus();
    return true;
  };
  htui.logout = async function () {
    for (const w of htui.wins.slice()) { if ((await w.close()) === false) return; }
    clearInterval(clockTimer);
    greeter();
  };

  // ---------- ログイン画面
  function greeter() {
    htui.user = null; htui.prefs = {}; htui.titleEl = null; htui.modeBtn = null;
    OS.setMode('auto');
    htui.el.textContent = ''; htui.el.className = 'greeter';
    htui.el.style.background = WALLPAPERS[0].css;
    const box = h('div', { class: 'gr-box' });
    const showUsers = () => {
      box.textContent = '';
      const list = h('div', { class: 'gr-users' });
      users.list().filter(u => !u.root).forEach(u => list.append(h('button', { class: 'gr-user', type: 'button', onclick: () => ask(u) }, avatar(u, 72), h('span', null, u.name))));
      box.append(h('h1', { class: 'gr-title' }, 'htmlOS'), h('p', { class: 'gr-sub' }, 'ログインするユーザーを選んでください'), list);
    };
    const ask = u => {
      box.textContent = '';
      const pw = h('input', { type: 'password', class: 'inp', id: 'gr-pw', placeholder: 'パスワード', 'aria-label': 'パスワード' });
      const msg = h('div', { class: 'gr-msg', role: 'alert' });
      const go = async e => {
        e.preventDefault();
        if (await users.verify(u.name, pw.value)) session(u.name);
        else { msg.textContent = 'パスワードが違います。'; pw.value = ''; pw.focus(); }
      };
      box.append(avatar(u, 96), h('h2', { class: 'gr-name' }, u.name),
        h('form', { class: 'gr-form', onsubmit: go }, pw, h('button', { class: 'btn primary', type: 'submit' }, 'ログイン')),
        msg, h('button', { class: 'btn ghost', type: 'button', onclick: showUsers }, '別のユーザーを選ぶ'));
      pw.focus();
    };
    const foot = h('div', { class: 'gr-foot' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => htui.stop() }, OS.icon('terminal', 16), 'CUI に切り替え'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => OS.reboot() }, OS.icon('reload', 16), '再起動'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => OS.poweroff() }, OS.icon('power', 16), '電源を切る'));
    htui.el.append(box, foot);
    const l = users.list().filter(u => !u.root);
    if (l.length === 1) ask(l[0]); else showUsers();
  }

  // ---------- デスクトップ
  function loadPrefs() { try { return JSON.parse(fs.read(users.home(htui.user) + '/.config/htui.json')); } catch (e) { return {}; } }
  htui.setPrefs = function (patch) {
    Object.assign(htui.prefs, patch);
    try { fs.mkdir(users.home(htui.user) + '/.config', { parents: true, owner: htui.user }); fs.write(users.home(htui.user) + '/.config/htui.json', JSON.stringify(htui.prefs), { owner: htui.user }); } catch (e) { /* 保存できなくても表示は変える */ }
    applyPrefs();
  };
  function applyPrefs() {
    const wp = WALLPAPERS[htui.prefs.wallpaper | 0] || WALLPAPERS[0];
    htui.el.style.background = wp.css;
    htui.el.style.setProperty('--accent', htui.prefs.accent || ACCENTS[0]);
    htui.el.classList.toggle('no-anim', htui.prefs.anim === false);
    OS.setMode(htui.prefs.mode || 'auto');
  }
  htui.refreshUser = function () {
    if (!htui.userBtn) return;
    htui.userBtn.textContent = '';
    htui.userBtn.append(avatar(users.get(htui.user), 20), h('span', { class: 'p-uname' }, htui.user));
  };

  function session(user) {
    htui.user = user;
    htui.fs = OS.fsFor(() => htui.user);
    htui.el.textContent = ''; htui.el.className = 'desktop';
    htui.prefs = loadPrefs(); applyPrefs();

    const tasks = htui.tasks = h('div', { class: 'p-tasks' });
    const clock = h('div', { class: 'p-clock' });
    const tick = () => { const d = new Date(); clock.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    tick(); clearInterval(clockTimer); clockTimer = setInterval(tick, 10000);
    const appsBtn = h('button', { class: 'p-btn', type: 'button', onclick: e => menu(e.currentTarget, Object.values(OS.apps).map(a => ({ label: a.name, hint: a.desc, icon: a.icon, act: () => run(a.id) }))) }, OS.icon('grid', 16), h('span', { class: 'p-lbl' }, 'アプリ'));
    const userBtn = htui.userBtn = h('button', { class: 'p-btn', type: 'button', onclick: e => menu(e.currentTarget, [
      { label: '設定', icon: 'gear', act: () => run('settings') },
      { label: 'ログアウト', icon: 'user', act: () => htui.logout() },
      { label: 'HTUi を終了して CUI へ', icon: 'terminal', act: () => htui.stop() },
      { label: '再起動', icon: 'reload', act: () => OS.reboot() },
      { label: '電源を切る', icon: 'power', act: () => OS.poweroff() }
    ], true) });
    const title = htui.titleEl = h('div', { class: 'p-title' });
    // 画面モードの切り替えボタン。アイコンは今のモード（自動のときは、自動で選ばれているモード）を表す
    const modeBtn = htui.modeBtn = h('button', { class: 'p-btn p-mode', type: 'button', onclick: e => menu(e.currentTarget, ['auto', 'desktop', 'tablet', 'phone'].map(m => ({
      label: OS.modeNames[m] + (m === 'auto' ? '（' + OS.modeNames[OS.autoMode()] + '）' : ''), icon: OS.modeIcons[m === 'auto' ? OS.autoMode() : m],
      hint: m === OS.modePref ? '選択中' : null, act: () => htui.setPrefs({ mode: m }) })), true) });
    htui.syncMode();
    const panel = h('div', { class: 'panel' }, appsBtn, tasks, title, modeBtn, clock, userBtn);
    htui.refreshUser();

    const icons = htui.iconsEl = h('div', { class: 'desk-icons' });
    const desk = htui.desk = h('div', { class: 'desk' }, icons);
    // タッチ用の下部ナビ（タブレット・スマートフォンモードのときだけ表示される）
    const navBtn = (icon, label, fn) => h('button', { class: 'nav-btn', type: 'button', onclick: fn }, OS.icon(icon, 22), h('span', null, label));
    const nav = h('div', { class: 'tabbar' },
      navBtn('x', '閉じる', () => { const w = htui.active(); if (w) w.close(); }),
      navBtn('home', 'ホーム', goHome),
      navBtn('grid', 'タスク', switcher));
    htui.el.append(panel, desk, nav);
    htui.refreshApps();
  }
  htui.syncMode = function () {
    const b = htui.modeBtn; if (!b) return;
    const t = '画面モード: ' + OS.modeNames[OS.modePref] + (OS.modePref === 'auto' ? '（今は' + OS.modeNames[OS.uiMode] + '）' : '') + '。押すと切り替え';
    b.textContent = ''; b.append(OS.icon(OS.modeIcons[OS.uiMode], 18)); b.title = t; b.setAttribute('aria-label', t);
  };
  htui.syncTitle = function () { if (htui.titleEl) { const w = htui.active(); htui.titleEl.textContent = w ? w.title : ''; } };
  function goHome() {
    const sw = htui.el.querySelector('.switcher'); if (sw) sw.remove();
    htui.wins.forEach(w => { w.el.classList.add('hidden'); w.el.classList.remove('active'); w.task.classList.remove('active'); });
    htui.syncTitle();
  }
  // 開いているアプリの一覧（タスク切り替え）
  function switcher() {
    const old = htui.el.querySelector('.switcher'); if (old) { old.remove(); return; }
    const list = h('div', { class: 'sw-list' });
    const ov = h('div', { class: 'switcher' }, h('div', { class: 'sw-head' }, '開いているアプリ'), list);
    ov.addEventListener('click', e => { if (e.target === ov || e.target === list) ov.remove(); });
    const fill = () => {
      list.textContent = '';
      if (!htui.wins.length) list.append(h('p', { class: 'sw-empty' }, '開いているアプリはありません'));
      htui.wins.forEach(w => list.append(h('div', { class: 'sw-card' },
        h('button', { class: 'sw-open', type: 'button', onclick: () => { ov.remove(); w.focus(); } }, OS.icon((OS.apps[w.app] || {}).icon || 'file', 22), h('span', null, w.title)),
        h('button', { class: 'sw-x', type: 'button', title: '閉じる', 'aria-label': w.title + ' を閉じる', onclick: async () => { await w.close(); fill(); } }, OS.icon('x', 18)))));
    };
    fill(); htui.el.append(ov);
  }
  function pickMode() {
    ui.modal({ title: '画面モード', body: h('p', { class: 'modal-msg' }, 'タブレットとスマートフォンでは、アプリが全画面になり、ボタンが大きくなって、下にナビが出ます。「自動」はタッチ端末かどうかと画面の幅で決めます。\n今: ' + OS.modeNames[OS.modePref] + (OS.modePref === 'auto' ? '（' + OS.modeNames[OS.uiMode] + '）' : '')),
      buttons: [{ label: 'キャンセル', cancel: true, value: null }].concat(['auto', 'desktop', 'tablet', 'phone'].map(m => ({ label: OS.modeNames[m], primary: m === OS.modePref, value: m }))) })
      .then(m => { if (m) htui.setPrefs({ mode: m }); });
  }
  // モードが変わったとき: タッチ系は全ウィンドウを全画面に、デスクトップに戻ったら元の大きさに
  htui.onMode = function () {
    if (!htui.running || !htui.user) return;
    htui.syncMode();
    htui.wins.forEach(w => { if (OS.touch) w.snap('max', true); else if (w.zone === 'max') w.unsnap(true); });
    htui.syncTitle();
  };
  // デスクトップのアイコンを作り直す（パッケージの追加・削除のあとにも呼ばれる）
  htui.refreshApps = function () {
    if (!htui.iconsEl || !htui.user) return;
    htui.iconsEl.textContent = '';
    Object.values(OS.apps).forEach(a => htui.iconsEl.append(h('button', { class: 'desk-icon', type: 'button', title: a.desc || a.name, onclick: () => run(a.id) },
      h('span', { class: 'app-ico', style: 'background:' + (a.color || '#5e5c64') }, OS.icon(a.icon, 26)), h('span', { class: 'desk-label' }, a.name))));
  };
  function run(id, arg) { try { OS.launch(id, arg); } catch (e) { ui.alert(e.message); } }
  htui.run = run;

  // ---------- ポップアップメニュー
  function menu(anchor, items, right) {
    const old = htui.el.querySelector('.menu'); if (old) { old.remove(); if (old._anchor === anchor) return; }
    const m = h('div', { class: 'menu', role: 'menu' });
    m._anchor = anchor;
    items.forEach(it => m.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { close(); it.act(); } },
      it.icon ? OS.icon(it.icon, 16) : null, h('span', null, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null)));
    const r = anchor.getBoundingClientRect(), hr = htui.el.getBoundingClientRect();
    m.style.top = (r.bottom - hr.top + 4) + 'px';
    if (right) m.style.right = Math.max(4, hr.right - r.right) + 'px'; else m.style.left = Math.max(4, r.left - hr.left) + 'px';
    htui.el.append(m);
    const off = e => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
    function close() { m.remove(); document.removeEventListener('pointerdown', off, true); }
    document.addEventListener('pointerdown', off, true);
  }
  htui.menu = menu;

  // ---------- ウィンドウマネージャ（移動・8方向リサイズ・スナップ・アニメーション）
  const ZONES = { max: [0, 0, 100, 100], left: [0, 0, 50, 100], right: [50, 0, 50, 100], tl: [0, 0, 50, 50], tr: [50, 0, 50, 50], bl: [0, 50, 50, 50], br: [50, 50, 50, 50] };
  const MINW = 260, MINH = 150;
  const px = v => Math.round(v) + 'px', clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  htui.animOff = () => htui.prefs.anim === false;
  function animOut(el, cls, ms, cb) {
    if (htui.animOff()) return cb();
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); cb(); }, ms);
  }
  function preview(zone, z) {
    let p = htui.desk.querySelector('.snap-preview');
    if (!zone) { if (p) p.classList.remove('on'); return; }
    if (!p) { p = h('div', { class: 'snap-preview' }); htui.desk.append(p); }
    const g = ZONES[zone];
    p.style.left = g[0] + '%'; p.style.top = g[1] + '%'; p.style.width = g[2] + '%'; p.style.height = g[3] + '%';
    p.style.zIndex = z - 1; p.classList.add('on');
  }
  htui.active = () => htui.wins.find(w => w.el.classList.contains('active') && !w.el.classList.contains('hidden')) || null;

  htui.open = function (o) {
    const desk = htui.desk, dw = desk.clientWidth, dh = desk.clientHeight;
    const win = { pid: ++htui.pid, title: o.title, app: o.app, zone: null, rect: null, onClose: null, onDispose: null, onFocus: null };
    const titleEl = h('span', { class: 'win-title' }, o.title);
    const bMin = h('button', { class: 'win-btn', type: 'button', title: '最小化', 'aria-label': '最小化' }, OS.icon('min', 14));
    const bMax = h('button', { class: 'win-btn', type: 'button', title: '最大化（右クリックでスナップ配置を選ぶ）', 'aria-label': '最大化' }, OS.icon('max', 14));
    const bX = h('button', { class: 'win-btn close', type: 'button', title: '閉じる', 'aria-label': '閉じる' }, OS.icon('x', 14));
    const head = h('div', { class: 'win-head' }, OS.icon(o.icon, 16), titleEl, h('span', { class: 'win-btns' }, bMin, bMax, bX));
    const body = win.body = h('div', { class: 'win-body' });
    const el = win.el = h('div', { class: 'win', role: 'group', 'aria-label': o.title }, head, body);
    const w = Math.min(o.w || 640, dw - 8), hh = Math.min(o.h || 420, dh - 8), n = htui.wins.length % 7;
    el.style.width = px(w); el.style.height = px(hh);
    el.style.left = px(clamp(90 + n * 26, 4, Math.max(4, dw - w - 4)));
    el.style.top = px(clamp(16 + n * 24, 4, Math.max(4, dh - hh - 4)));

    const task = win.task = h('button', { class: 'p-task', type: 'button', title: o.title }, OS.icon(o.icon, 14), h('span', null, o.title));
    task.addEventListener('click', () => { if (el.classList.contains('active') && !el.classList.contains('hidden')) win.minimize(); else win.focus(); });
    htui.tasks.append(task);

    win.setTitle = t => { win.title = t; titleEl.textContent = t; task.lastChild.textContent = t; task.title = t; el.setAttribute('aria-label', t); htui.syncTitle(); };
    win.focus = () => {
      win._min = 0;
      el.classList.remove('hidden', 'minimizing');
      htui.wins.forEach(x => { x.el.classList.remove('active'); x.task.classList.remove('active'); });
      el.classList.add('active'); task.classList.add('active');
      el.style.zIndex = ++htui.z;
      htui.syncTitle();
      if (win.onFocus) win.onFocus();
    };
    win.minimize = () => {
      const tok = win._min = Date.now() + Math.random();
      el.classList.remove('active'); task.classList.remove('active');
      animOut(el, 'minimizing', 170, () => { if (win._min !== tok || win.closed) return; el.classList.add('hidden'); focusTop(); });
    };
    win.close = async force => {
      if (!force && win.onClose && (await win.onClose()) === false) return false;
      if (win.closed) return true;
      win.closed = true;
      try { if (win.onDispose) win.onDispose(); } catch (e) { /* 後始末の失敗は無視 */ }
      task.remove();
      htui.wins = htui.wins.filter(x => x !== win);
      el.classList.remove('active');
      if (force) el.remove(); else animOut(el, 'closing', 150, () => el.remove());
      focusTop();
      return true;
    };

    // ---- スナップ（zone: max / left / right / tl / tr / bl / br）
    const geoAnim = () => { if (htui.animOff()) return; el.classList.add('geo'); clearTimeout(win._gt); win._gt = setTimeout(() => el.classList.remove('geo'), 240); };
    const setPx = r => { el.style.left = px(r.l); el.style.top = px(r.t); el.style.width = px(r.w); el.style.height = px(r.h); };
    const curRect = () => ({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    win.snap = (zone, quiet) => {
      const g = ZONES[zone]; if (!g) return;
      if (!win.zone) win.rect = curRect();
      if (!quiet) { setPx(curRect()); el.offsetWidth; geoAnim(); }
      win.zone = zone;
      el.style.left = g[0] + '%'; el.style.top = g[1] + '%'; el.style.width = g[2] + '%'; el.style.height = g[3] + '%';
      el.classList.add('tiled'); el.classList.toggle('max', zone === 'max');
    };
    win.unsnap = quiet => {
      if (!win.zone) return;
      if (!quiet) { setPx(curRect()); el.offsetWidth; geoAnim(); }
      win.zone = null; el.classList.remove('tiled', 'max');
      const r = win.rect, d = htui.desk;
      setPx({ l: clamp(r.l, 60 - r.w, d.clientWidth - 60), t: clamp(r.t, 0, Math.max(0, d.clientHeight - 30)), w: r.w, h: r.h });
    };
    const toggleMax = () => { if (win.zone === 'max') win.unsnap(); else win.snap('max'); };

    bX.addEventListener('click', () => win.close());
    bMin.addEventListener('click', () => win.minimize());
    bMax.addEventListener('click', toggleMax);
    bMax.addEventListener('contextmenu', e => {
      e.preventDefault();
      menu(bMax, [['左半分', 'left'], ['右半分', 'right'], ['左上', 'tl'], ['右上', 'tr'], ['左下', 'bl'], ['右下', 'br'], ['最大化', 'max']]
        .map(x => ({ label: x[0], act: () => win.snap(x[1]) })).concat([{ label: '元のサイズに戻す', act: () => win.unsnap() }]), true);
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('.win-btn') && !OS.touch) toggleMax(); });
    el.addEventListener('pointerdown', () => { if (!el.classList.contains('active')) win.focus(); }, true);

    // ---- タイトルバーのドラッグで移動。画面の端まで運ぶとスナップ
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.win-btn') || e.button > 0 || OS.touch) return;
      const dr = desk.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      let sx = e.clientX - dr.left - el.offsetLeft, sy = e.clientY - dr.top - el.offsetTop, moved = false, zone = null;
      const startRect = win.zone ? win.rect : curRect();
      head.setPointerCapture(e.pointerId);
      const mv = ev => {
        if (!moved) {
          if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6) return;
          moved = true; htui.el.classList.add('dragging');
          if (win.zone) { const ratio = sx / el.offsetWidth; win.unsnap(true); sx = win.rect.w * ratio; sy = Math.min(sy, 20); }
        }
        const x = ev.clientX - dr.left, y = ev.clientY - dr.top, E = 14;
        el.style.left = px(clamp(x - sx, 60 - el.offsetWidth, dr.width - 60));
        el.style.top = px(clamp(y - sy, 0, dr.height - 30));
        const band = y < dr.height * 0.25 ? 0 : y > dr.height * 0.75 ? 2 : 1;
        zone = x < E ? ['tl', 'left', 'bl'][band] : x > dr.width - E ? ['tr', 'right', 'br'][band] : y < 6 ? 'max' : null;
        preview(zone, +el.style.zIndex);
      };
      const up = () => {
        head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up);
        htui.el.classList.remove('dragging'); preview(null);
        if (moved && zone) { win.snap(zone); win.rect = startRect; }
      };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    });

    // ---- 8方向のリサイズハンドル
    'n s e w ne nw se sw'.split(' ').forEach(d => {
      const hd = h('div', { class: 'rz rz-' + d });
      hd.addEventListener('pointerdown', e => {
        if (e.button > 0 || win.zone === 'max') return;
        e.preventDefault();
        if (win.zone) { const r = curRect(); win.zone = null; el.classList.remove('tiled'); setPx(r); }
        const s = Object.assign({ x: e.clientX, y: e.clientY }, curRect());
        hd.setPointerCapture(e.pointerId); htui.el.classList.add('dragging');
        const mv = ev => {
          const dx = ev.clientX - s.x, dy = ev.clientY - s.y, r = { l: s.l, t: s.t, w: s.w, h: s.h };
          if (d.includes('e')) r.w = Math.max(MINW, s.w + dx);
          if (d.includes('w')) { r.w = Math.max(MINW, s.w - dx); r.l = s.l + s.w - r.w; }
          if (d.includes('s')) r.h = Math.max(MINH, s.h + dy);
          if (d.includes('n')) { r.h = clamp(s.h - dy, MINH, s.h + s.t); r.t = s.t + s.h - r.h; }
          setPx(r);
        };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); htui.el.classList.remove('dragging'); };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
      });
      el.append(hd);
    });

    desk.append(el);
    htui.wins.push(win);
    if (dw < 700 || OS.touch) win.snap('max', true);
    win.focus();
    return win;
  };
  function focusTop() {
    const vis = htui.wins.filter(w => !w.el.classList.contains('hidden') && !w.el.classList.contains('minimizing'));
    if (!vis.length) { htui.syncTitle(); return; }
    vis.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0))[0].focus();
  }
  // Ctrl+Alt+矢印キーでアクティブなウィンドウをスナップ
  function hotkeys(e) {
    if (!e.ctrlKey || !e.altKey || !htui.user) return;
    const w = htui.active(); if (!w) return;
    if (e.key === 'ArrowLeft') w.snap('left'); else if (e.key === 'ArrowRight') w.snap('right');
    else if (e.key === 'ArrowUp') w.snap('max'); else if (e.key === 'ArrowDown') { if (w.zone) w.unsnap(); else w.minimize(); }
    else return;
    e.preventDefault();
  }

  // ---------- ダイアログ
  const ui = OS.ui = {};
  ui.modal = function (o) {
    return new Promise(res => {
      const foot = h('div', { class: 'modal-foot' });
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, style: o.width ? 'width:' + o.width + 'px' : null },
        h('div', { class: 'modal-title' }, o.title), h('div', { class: 'modal-body' }, o.body), foot);
      const ov = h('div', { class: 'modal-ov' }, box);
      const prev = document.activeElement;
      const done = v => { ov.remove(); try { if (prev && prev.isConnected && prev.focus) prev.focus(); } catch (e) { /* フォーカスを戻せなくてもよい */ } res(v); };
      const fire = b => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v === ui.KEEP) return; done(v); };
      let primary = null, cancel = null;
      o.buttons.forEach(b => {
        const el = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button', onclick: () => fire(b) }, b.label);
        if (b.primary) primary = b; if (b.cancel) cancel = b;
        foot.append(el);
      });
      ov.addEventListener('keydown', e => {
        if (e.key === 'Escape' && cancel) { e.preventDefault(); fire(cancel); }
        else if (e.key === 'Enter' && primary && !e.isComposing && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); fire(primary); }
      });
      (htui.el || OS.root).append(ov);
      const f = box.querySelector('input,select,textarea') || foot.querySelector('.primary') || foot.querySelector('button');
      if (f) { f.focus(); if (f.select && f.type !== 'password') f.select(); }
      if (o.onOpen) o.onOpen(done);
    });
  };
  ui.KEEP = {};
  ui.alert = (msg, title) => ui.modal({ title: title || 'お知らせ', body: h('p', { class: 'modal-msg' }, msg), buttons: [{ label: 'OK', primary: true, cancel: true, value: true }] });
  ui.confirm = (msg, o) => ui.modal({ title: (o && o.title) || '確認', body: h('p', { class: 'modal-msg' }, msg), buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: (o && o.ok) || 'OK', primary: true, danger: o && o.danger, value: true }] });
  ui.prompt = (msg, def, o) => {
    const inp = h('input', { class: 'inp', type: o && o.password ? 'password' : 'text', id: 'dlg-input', value: def || '', 'aria-label': msg });
    return ui.modal({ title: (o && o.title) || '入力', body: [h('p', { class: 'modal-msg' }, msg), inp], buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: 'OK', primary: true, value: () => inp.value }] });
  };
  // root 権限が必要な操作の前に呼ぶ。root のパスワードを確認できたら true
  ui.asRoot = async function (reason) {
    if (users.isRoot(htui.user)) return true;
    const r = users.get('root');
    if (!r || !r.pw) { await ui.alert('root のパスワードがまだ設定されていません。\n管理者が Terminal で「passwd root」を実行して設定してください。', 'root 権限が必要です'); return false; }
    const pw = await ui.prompt((reason ? reason + '\n' : '') + 'この操作には root 権限が必要です。root のパスワードを入力してください。', '', { password: true, title: 'root 権限が必要です' });
    if (pw == null) return false;
    if (await users.verify('root', pw)) return true;
    await ui.alert('root のパスワードが違います。', 'root 権限が必要です');
    return false;
  };
  ui.toast = function (msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    (htui.el || OS.root).append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3500);
  };

  // ファイル選択ダイアログ。mode: 'open' | 'save'。戻り値は絶対パス（キャンセルは null）
  ui.pickFile = function (o) {
    o = o || {};
    const fsx = htui.fs, home = users.home(htui.user);
    let dir = o.dir && fsx.isDir(o.dir) ? o.dir : home, selected = null;
    const pathEl = h('div', { class: 'fp-path' }), list = h('div', { class: 'fp-list', role: 'listbox' });
    const name = h('input', { class: 'inp', id: 'fp-name', value: o.name || '', placeholder: 'ファイル名', 'aria-label': 'ファイル名' });
    const err = h('div', { class: 'fp-err', role: 'alert' });
    let finish = null;
    const go = d => { dir = d; selected = null; render(); };
    function render() {
      pathEl.textContent = dir; list.textContent = ''; err.textContent = '';
      let names = [];
      try { names = fsx.list(dir); } catch (e) { err.textContent = e.message; }
      if (dir !== '/') list.append(h('button', { class: 'fp-item', type: 'button', onclick: () => go(path.dir(dir)) }, OS.icon('up', 16), '..（上へ）'));
      const rows = names.filter(n => !n.startsWith('.')).map(n => ({ n: n, p: path.join(dir, n), d: fs.isDir(path.join(dir, n)) })).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
      rows.forEach(r => {
        if (!r.d && o.kinds && !o.kinds.includes(fs.kind(r.p))) return;
        const b = h('button', { class: 'fp-item', type: 'button', role: 'option' }, OS.icon(r.d ? 'folder' : fileIcon(r.p), 16), r.n);
        b.addEventListener('click', () => {
          if (r.d) return go(r.p);
          list.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
          selected = r.p; name.value = r.n;
        });
        b.addEventListener('dblclick', () => { if (!r.d && finish) { const v = result(); if (v !== ui.KEEP) finish(v); } });
        list.append(b);
      });
    }
    function result() {
      if (o.mode === 'save') {
        const n = name.value.trim();
        if (!n || n.includes('/')) { err.textContent = 'ファイル名を入力してください（/ は使えません）。'; return ui.KEEP; }
        const p = path.join(dir, n);
        if (!fsx.canWrite(p) && !o.allowRoot) { err.textContent = 'この場所には保存できません（許可がありません）。'; return ui.KEEP; }
        if (fs.isDir(p)) { err.textContent = '同じ名前のフォルダがあります。'; return ui.KEEP; }
        return p;
      }
      const p = selected || (name.value.trim() ? path.join(dir, name.value.trim()) : null);
      if (!p || !fsx.isFile(p)) { err.textContent = 'ファイルを選んでください。'; return ui.KEEP; }
      return p;
    }
    render();
    const places = h('div', { class: 'fp-places' }, [['ホーム', home], ['Documents', home + '/Documents'], ['Downloads', home + '/Downloads'], ['Pictures', home + '/Pictures'], ['Music', home + '/Music'], ['Videos', home + '/Videos'], ['/', '/']]
      .map(x => h('button', { class: 'btn small', type: 'button', onclick: () => go(x[1]) }, x[0])));
    return ui.modal({
      title: o.title || (o.mode === 'save' ? '名前を付けて保存' : 'ファイルを開く'), width: 460,
      body: [places, pathEl, list, o.mode === 'save' ? name : null, err],
      buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: o.mode === 'save' ? '保存' : '開く', primary: true, value: result }],
      onOpen: done => { finish = done; if (o.mode === 'save') { name.focus(); const i = name.value.lastIndexOf('.'); name.setSelectionRange(0, i > 0 ? i : name.value.length); } }
    });
  };
  function fileIcon(p) { const k = fs.kind(p); return k === 'other' ? 'file' : k; }
  htui.fileIcon = fileIcon;
})();
