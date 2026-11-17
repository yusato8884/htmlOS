/* hdm — HtmlDisplayManager。HTUi のログイン画面。
   選んだデスクトップ環境（セッション）に合わせて、ログイン画面の見た目が変わる。
     HTUi   → htui   HTUi に寄せた独自デザイン
     hShell → gdm    GDM 風
     hWin   → w11 / w8 / wp   デスクトップは Windows 11 風、タブレットは Windows 8.1 風、スマートフォンは Windows Phone 風（どれもロック画面つき）
     hwc    → wm     シンプルな独自デザイン（ユーザー名を入力する）
   最後にログインしたユーザーと、ユーザーごとに最後に使ったセッションを /etc/hdm.json に覚える。 */
(function () {
  const OS = window.OS, h = OS.h, users = OS.users;
  const CONF = '/etc/hdm.json';
  const pad = n => String(n).padStart(2, '0');
  const WEEK = '日月火水木金土';
  const fmtDate = d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日';
  const logo = () => h('span', { class: 'os-logo', 'aria-hidden': 'true' }, '<', h('b', null, '/'), '>');
  let timer = null, ticks = [];

  const hdm = OS.hdm = {
    conf() { try { return JSON.parse(OS.fs.read(CONF)); } catch (e) { return {}; } },
    save(c) { try { OS.fs.write(CONF, JSON.stringify(c, null, 1), { owner: 'root' }); } catch (e) { /* 覚えられなくてもログインはできる */ } },
    defaultSession() { const s = OS.config.get('session', 'htui'); return OS.sessions[s] ? s : 'htui'; },
    sessionFor(user) { const s = ((hdm.conf().users) || {})[user]; return OS.sessions[s] ? s : hdm.defaultSession(); },
    setUserSession(user, sid) { const c = hdm.conf(); c.users = c.users || {}; c.users[user] = sid; hdm.save(c); },
    stop() { clearInterval(timer); timer = null; ticks = []; },
    // セッションと画面モードから、ログイン画面のテーマを決める
    themeFor(sid) {
      if (sid === 'gnome') return 'gdm';
      if (sid === 'wm') return 'wm';
      if (sid === 'win') return OS.uiMode === 'phone' ? 'wp' : OS.uiMode === 'tablet' ? 'w8' : 'w11';
      return 'htui';
    },

    // container にログイン画面を出す。ログインできたら onLogin(ユーザー名, セッションID)
    show(container, onLogin) {
      hdm.stop();
      const el = container, htui = OS.htui;
      const list = () => users.list().filter(u => !u.root);
      const lastU = users.get(hdm.conf().lastUser);
      const first = lastU && !lastU.root ? lastU : list().length === 1 ? list()[0] : null;
      const st = { user: first, sid: first ? hdm.sessionFor(first.name) : hdm.defaultSession(), unlocked: false, msg: '' };
      const prefsOf = u => { try { return JSON.parse(OS.fs.read(users.home(u.name) + '/.config/htui.json')); } catch (e) { return {}; } };

      // 各テーマに渡す部品
      const c = {
        get user() { return st.user; }, get sid() { return st.sid; }, get unlocked() { return st.unlocked; },
        list: list, menuUp: false,
        avatar(u, size, square) { const a = htui.avatar(u, size); if (square) a.classList.add('sq'); return a; },
        wallpaper(u) { const p = u ? prefsOf(u) : {}; return (htui.wallpapers[p.wallpaper | 0] || htui.wallpapers[0]).css; },
        accent(u) { const p = u ? prefsOf(u) : {}; return p.accent || htui.accents[0]; },
        clock(node, fmt) { const f = d => { node.textContent = fmt(d); }; ticks.push(f); f(new Date()); return node; },
        pick(u) { st.user = u; st.msg = ''; if (u) st.sid = hdm.sessionFor(u.name); st.unlocked = true; render(); },
        sessionName() { return (OS.sessions[st.sid] || {}).name || ''; },
        sessionDesc() { return (OS.sessions[st.sid] || {}).desc || ''; },
        // デスクトップ環境の選択。overlay=true なら、アイコンの上に重ねる透明な選択欄にする
        sessionSelect(cls, overlay) {
          const sel = h('select', { class: (cls || 'sel') + (overlay ? ' hdm-ovsel' : ''), id: 'hdm-session', 'aria-label': 'デスクトップ環境', title: 'デスクトップ環境' },
            Object.values(OS.sessions).map(s => h('option', { value: s.id, selected: s.id === st.sid }, s.name)));
          sel.addEventListener('change', () => { st.sid = sel.value; st.unlocked = true; render(); });
          return sel;
        },
        // パスワード欄つきのフォーム。nameInput を渡すと、ユーザー名も入力させる
        pwForm(o) {
          o = o || {};
          const input = h('input', { type: 'password', class: o.inputClass || 'inp', id: 'gr-pw', placeholder: o.placeholder || 'パスワード', 'aria-label': 'パスワード', autocomplete: 'off' });
          const submit = h('button', { class: o.submitClass || 'btn primary', type: 'submit', 'aria-label': 'ログイン', title: 'ログイン' }, o.submitLabel || OS.icon('fwd', 18));
          const msg = h('div', { class: 'gr-msg ' + (o.msgClass || ''), role: 'alert' }, st.msg);
          const form = h('form', { class: o.formClass || '', onsubmit: async e => {
            e.preventDefault();
            const u = o.nameInput ? users.get(o.nameInput.value.trim()) : st.user;
            if (u && !u.root && await users.verify(u.name, input.value)) {
              const cf = hdm.conf(); cf.lastUser = u.name; cf.users = cf.users || {}; cf.users[u.name] = st.sid; hdm.save(cf);
              hdm.stop();
              onLogin(u.name, st.sid);
            } else {
              st.msg = o.nameInput ? 'ユーザー名かパスワードが違います。' : 'パスワードが違います。';
              msg.textContent = st.msg; input.value = ''; input.focus();
              const box = form.closest('[data-shake]') || form; box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
            }
          } });
          return { input: input, submit: submit, msg: msg, form: form };
        },
        userButtons(cls, size, square) {
          return list().map(u => h('button', { class: 'gr-user ' + (cls || '') + (st.user && st.user.name === u.name ? ' cur' : ''), type: 'button', onclick: () => c.pick(u) },
            c.avatar(u, size || 40, square), h('span', null, u.name)));
        },
        powerButton(cls, size) {
          return h('button', { class: 'hdm-btn ' + (cls || ''), type: 'button', title: '電源', 'aria-label': '電源メニュー', onclick: e => htui.menu(e.currentTarget, [
            { label: 'CUI に切り替え', icon: 'terminal', act: () => htui.stop() },
            { label: '再起動', icon: 'reload', act: () => OS.reboot() },
            { label: '電源を切る', icon: 'power', act: () => OS.poweroff() }
          ], true, c.menuUp ? { up: true } : null) }, OS.icon('power', size || 18));
        },
        modeButton(cls, size) {
          const t = '画面モード: ' + OS.modeNames[OS.modePref];
          return h('button', { class: 'hdm-btn ' + (cls || ''), type: 'button', title: t, 'aria-label': t, onclick: e => htui.menu(e.currentTarget, ['auto', 'desktop', 'tablet', 'phone'].map(m => ({
            label: OS.modeNames[m] + (m === 'auto' ? '（' + OS.modeNames[OS.autoMode()] + '）' : ''), icon: OS.modeIcons[m === 'auto' ? OS.autoMode() : m],
            hint: m === OS.modePref ? '選択中' : null, act: () => { OS.setMode(m); render(); } })), true, c.menuUp ? { up: true } : null) }, OS.icon(OS.modeIcons[OS.uiMode], size || 18));
        },
        // ロック画面。クリック・タップ・キー・上へのスワイプで外れる（Windows 系テーマで使う）
        lock(layer) {
          if (st.unlocked) return;
          layer.classList.add('hdm-lock');
          el.append(layer);
          let y0 = null;
          const open = () => {
            if (st.unlocked) return;
            st.unlocked = true; document.removeEventListener('keydown', key, true);
            layer.classList.add('out');
            setTimeout(() => layer.remove(), 450);
            const pw = el.querySelector('#gr-pw'); if (pw) setTimeout(() => pw.focus(), 60);
          };
          // キーを押すとロックが外れる。そのキーはそのままパスワード欄などへ届く
          const key = e => { if (!el.isConnected || !layer.isConnected) { document.removeEventListener('keydown', key, true); return; } if (!e.ctrlKey && !e.altKey && !e.metaKey) open(); };
          document.addEventListener('keydown', key, true);
          layer.addEventListener('pointerdown', e => { y0 = e.clientY; layer.setPointerCapture(e.pointerId); });
          layer.addEventListener('pointermove', e => { if (y0 != null && e.clientY < y0) { layer.style.transition = 'none'; layer.style.transform = 'translateY(' + (e.clientY - y0) + 'px)'; } });
          const up = e => { const d = y0 == null ? 0 : y0 - e.clientY; y0 = null; layer.style.transition = ''; layer.style.transform = ''; if (e.type !== 'pointercancel' && (d > 60 || Math.abs(d) < 8)) open(); };
          layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
        }
      };

      function render() {
        ticks = [];
        const old = el.querySelector('#gr-pw'), typed = old ? old.value : '';
        const theme = hdm.themeFor(st.sid);
        // Windows 系はユーザー一覧の画面を持たず、いつも誰か一人を選んだ状態で出す
        if (!st.user && (theme === 'w11' || theme === 'w8' || theme === 'wp')) st.user = list()[0] || null;
        el.textContent = ''; el.removeAttribute('style');
        el.className = 'hdm hdm-' + theme;
        el.style.setProperty('--accent', c.accent(st.user));
        c.menuUp = false;
        THEMES[theme](el, c);
        const pw = el.querySelector('#gr-pw'), nm = el.querySelector('#hdm-user');
        if (pw) pw.value = typed;
        const locked = !!el.querySelector('.hdm-lock');
        if (!locked) { if (nm && !nm.value) nm.focus(); else if (pw) pw.focus(); }
      }
      clearInterval(timer);
      timer = setInterval(() => { const d = new Date(); ticks.forEach(f => f(d)); }, 5000);
      render();
    }
  };

  // ======================================================== テーマ
  const THEMES = {};

  // ---- HTUi: 独自デザイン（HTUi のパネルと揃える。壁紙とアクセントカラーはそのユーザーのもの）
  THEMES.htui = function (el, c) {
    const u = c.user;
    el.style.background = c.wallpaper(u);
    el.append(h('div', { class: 'hh-panel' },
      h('div', { class: 'hh-brand' }, logo(), h('span', null, 'htmlOS')),
      c.clock(h('div', { class: 'hh-clock' }), d => (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())),
      h('div', { class: 'hh-right' }, c.modeButton('hh-pbtn'), c.powerButton('hh-pbtn'))));
    const main = h('div', { class: 'hh-main' });
    if (!u) {
      main.append(h('div', { class: 'hh-card' }, h('h1', { class: 'hh-title' }, 'ようこそ'), h('p', { class: 'hh-sub' }, 'ログインするユーザーを選んでください'), h('div', { class: 'hh-users' }, c.userButtons('hh-user', 64))));
    } else {
      const f = c.pwForm({ inputClass: 'hh-pw', submitClass: 'hh-go', formClass: 'hh-form', msgClass: 'hh-msg' });
      f.form.append(h('div', { class: 'hh-pwrow' }, f.input, f.submit));
      main.append(h('div', { class: 'hh-card', 'data-shake': '' },
        h('div', { class: 'hh-ring' }, c.avatar(u, 104)),
        h('h1', { class: 'gr-name hh-name' }, u.name),
        c.clock(h('p', { class: 'hh-sub' }), d => fmtDate(d)),
        f.form, f.msg,
        h('label', { class: 'hh-ses' }, OS.icon('grid', 15), c.sessionSelect('hh-sel')),
        h('p', { class: 'hh-desc' }, c.sessionDesc())));
    }
    el.append(main);
    if (u && c.list().length > 1) el.append(h('div', { class: 'hh-others', role: 'group', 'aria-label': 'ユーザー' }, c.userButtons('hh-chip', 26)));
    el.append(h('div', { class: 'hh-foot' }, 'hdm — HtmlDisplayManager'));
  };

  // ---- hShell: GDM 風
  THEMES.gdm = function (el, c) {
    const u = c.user;
    el.append(h('div', { class: 'gd-bar' }, h('span'),
      c.clock(h('b', { class: 'gd-clock' }), d => (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())),
      h('div', { class: 'gd-sys' }, c.modeButton('gd-ibtn', 16), c.powerButton('gd-ibtn', 16))));
    const main = h('div', { class: 'gd-main' });
    if (!u) {
      main.append(h('div', { class: 'gd-list' }, c.userButtons('gd-row', 48)),
        h('button', { class: 'gd-link', type: 'button', onclick: () => OS.ui.toast('このコンピューターに登録されたユーザーだけがログインできます') }, 'アカウントが見つかりませんか?'));
    } else {
      const f = c.pwForm({ inputClass: 'gd-pw', submitClass: 'gd-go', formClass: 'gd-form', msgClass: 'gd-msg' });
      f.form.append(h('div', { class: 'gd-pwrow' },
        c.list().length > 1 ? h('button', { class: 'gd-back', type: 'button', 'aria-label': '別のユーザー', title: '別のユーザー', onclick: () => c.pick(null) }, OS.icon('back', 18)) : null,
        f.input, f.submit));
      main.append(h('div', { class: 'gd-auth', 'data-shake': '' }, c.avatar(u, 96), h('div', { class: 'gr-name gd-name' }, u.name), f.form, f.msg));
      // セッションは右下の歯車から選ぶ（GDM と同じ場所）
      el.append(h('label', { class: 'gd-gear', title: 'デスクトップ環境: ' + c.sessionName() }, OS.icon('gear', 20), c.sessionSelect('', true)));
    }
    el.append(main, h('div', { class: 'gd-logo' }, logo(), h('span', null, 'htmlOS')));
  };

  // ---- hWin（デスクトップ）: Windows 11 風
  THEMES.w11 = function (el, c) {
    const u = c.user;
    el.style.setProperty('--wall', c.wallpaper(u));
    c.menuUp = true;
    const f = c.pwForm({ inputClass: 'w11-pw', submitClass: 'w11-go', formClass: 'w11-form', msgClass: 'w11-msg' });
    f.form.append(h('div', { class: 'w11-pwbox' }, f.input, f.submit));
    el.append(h('div', { class: 'w11-bg' }),
      h('div', { class: 'w11-center', 'data-shake': '' }, c.avatar(u, 168), h('div', { class: 'gr-name w11-name' }, u.name), f.form, f.msg,
        h('div', { class: 'w11-opt' }, 'サインイン オプション: パスワード')),
      h('div', { class: 'w11-users' }, c.list().length > 1 ? c.userButtons('w11-user', 34) : null),
      h('div', { class: 'w11-icons' },
        h('span', { class: 'w11-ibtn', title: navigator.onLine === false ? 'オフライン' : 'インターネットに接続済み' }, OS.icon('globe', 20)),
        h('label', { class: 'w11-ibtn w11-ses', title: 'デスクトップ環境: ' + c.sessionName() }, OS.icon('grid', 20), c.sessionSelect('', true)),
        c.modeButton('w11-ibtn', 20), c.powerButton('w11-ibtn', 20)));
    c.lock(h('div', { class: 'w11-lock' }, h('div', { class: 'w11-lockbg' }),
      c.clock(h('div', { class: 'w11-ltime' }), d => d.getHours() + ':' + pad(d.getMinutes())),
      c.clock(h('div', { class: 'w11-ldate' }), d => (d.getMonth() + 1) + '月' + d.getDate() + '日' + WEEK[d.getDay()] + '曜日')));
  };

  // ---- hWin（タブレット）: Windows 8.1 風
  THEMES.w8 = function (el, c) {
    const u = c.user;
    c.menuUp = true;
    const f = c.pwForm({ inputClass: 'w8l-pw', submitClass: 'w8l-go', formClass: 'w8l-form', msgClass: 'w8l-msg' });
    f.form.append(h('div', { class: 'w8l-pwbox' }, f.input, f.submit));
    const pick = h('div', { class: 'w8l-pick' }, c.userButtons('w8l-user', 96, true));
    el.append(h('div', { class: 'w8l-main', 'data-shake': '' },
      c.list().length > 1 ? h('button', { class: 'w8l-back', type: 'button', 'aria-label': '別のユーザー', title: '別のユーザー', onclick: () => pick.classList.toggle('on') }, OS.icon('back', 24)) : h('span', { class: 'w8l-back-sp' }),
      c.avatar(u, 190, true), h('div', { class: 'w8l-side' }, h('div', { class: 'gr-name w8l-name' }, u.name), f.form, f.msg)),
      pick,
      h('div', { class: 'w8l-icons' },
        h('label', { class: 'w8l-ibtn', title: 'デスクトップ環境: ' + c.sessionName() }, OS.icon('grid', 24), c.sessionSelect('', true)),
        c.modeButton('w8l-ibtn', 24), c.powerButton('w8l-ibtn', 24)));
    c.lock(h('div', { class: 'w8l-lock', style: 'background:' + c.wallpaper(u) },
      h('div', { class: 'w8l-lclock' },
        c.clock(h('div', { class: 'w8l-ltime' }), d => d.getHours() + ':' + pad(d.getMinutes())),
        c.clock(h('div', { class: 'w8l-ldate' }), d => (d.getMonth() + 1) + '月' + d.getDate() + '日\n' + WEEK[d.getDay()] + '曜日'))));
  };

  // ---- hWin（スマートフォン）: Windows Phone 風
  THEMES.wp = function (el, c) {
    const u = c.user;
    const f = c.pwForm({ inputClass: 'wpl-pw', submitClass: 'wpl-ok', formClass: 'wpl-form', msgClass: 'wpl-msg', submitLabel: 'OK' });
    const others = h('div', { class: 'wpl-users' }, c.userButtons('wpl-user', 44, true));
    f.form.append(f.input, h('div', { class: 'wpl-btns' }, f.submit,
      c.list().length > 1 ? h('button', { class: 'wpl-alt', type: 'button', onclick: () => others.classList.toggle('on') }, '別のユーザー') : null));
    el.append(h('div', { class: 'wpl-status' }, h('span', { class: 'wpl-net' }, OS.icon('globe', 14)), h('span', { class: 'wpl-sbtns' }, c.modeButton('wpl-ibtn', 16), c.powerButton('wpl-ibtn', 16)), c.clock(h('span'), d => pad(d.getHours()) + ':' + pad(d.getMinutes()))),
      h('div', { class: 'wpl-main', 'data-shake': '' },
        h('div', { class: 'wpl-app' }, 'HTMLOS'),
        h('h1', { class: 'wpl-title' }, 'パスワード'),
        h('div', { class: 'wpl-who' }, c.avatar(u, 44, true), h('span', { class: 'gr-name' }, u.name)),
        f.form, f.msg,
        h('label', { class: 'wpl-ses' }, h('span', null, 'デスクトップ環境'), c.sessionSelect('wpl-sel')),
        others));
    c.lock(h('div', { class: 'wpl-lock', style: 'background:' + c.wallpaper(u) },
      h('div', { class: 'wpl-lclock' },
        c.clock(h('div', { class: 'wpl-ltime' }), d => d.getHours() + ':' + pad(d.getMinutes())),
        c.clock(h('div', { class: 'wpl-ldate' }), d => WEEK[d.getDay()] + '曜日\n' + (d.getMonth() + 1) + '月' + d.getDate() + '日')),
      h('div', { class: 'wpl-hint' }, '上へスワイプしてロックを解除')));
  };

  // ---- hwc: シンプルな独自デザイン（ユーザー名も入力する）
  THEMES.wm = function (el, c) {
    c.menuUp = true;
    const name = h('input', { class: 'wm-in', id: 'hdm-user', value: c.user ? c.user.name : '', 'aria-label': 'ユーザー名', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
    const f = c.pwForm({ inputClass: 'wm-in', submitClass: 'wm-go', formClass: 'wm-form', msgClass: 'wm-msg', submitLabel: 'ログイン', nameInput: name });
    const row = (label, ctl) => h('label', { class: 'wm-row' }, h('span', null, label), ctl);
    f.form.append(row('ユーザー', name), row('パスワード', f.input), row('セッション', c.sessionSelect('wm-in')), h('div', { class: 'wm-acts' }, f.submit));
    el.append(h('div', { class: 'wm-box', 'data-shake': '' },
      h('div', { class: 'wm-head' }, h('b', null, 'htmlOS ' + OS.version), c.clock(h('span'), d => pad(d.getHours()) + ':' + pad(d.getMinutes()))),
      f.form, f.msg),
      h('div', { class: 'wm-foot' }, c.modeButton('wm-ibtn', 15), c.powerButton('wm-ibtn', 15)));
  };
})();
