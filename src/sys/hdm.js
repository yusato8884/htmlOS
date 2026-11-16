/* hdm — HtmlDisplayManager。HTUi のログイン画面。
   ユーザーを選んでパスワードを入れ、使うデスクトップ環境（セッション）を選んでログインする。
   最後にログインしたユーザーと、ユーザーごとに最後に使ったセッションを /etc/hdm.json に覚える。 */
(function () {
  const OS = window.OS, h = OS.h, users = OS.users;
  const CONF = '/etc/hdm.json';
  let timer = null;

  const hdm = OS.hdm = {
    conf() { try { return JSON.parse(OS.fs.read(CONF)); } catch (e) { return {}; } },
    save(c) { try { OS.fs.write(CONF, JSON.stringify(c, null, 1), { owner: 'root' }); } catch (e) { /* 覚えられなくてもログインはできる */ } },
    defaultSession() { const s = OS.config.get('session', 'htui'); return OS.sessions[s] ? s : 'htui'; },
    sessionFor(user) { const s = ((hdm.conf().users) || {})[user]; return OS.sessions[s] ? s : hdm.defaultSession(); },
    setUserSession(user, sid) { const c = hdm.conf(); c.users = c.users || {}; c.users[user] = sid; hdm.save(c); },
    stop() { clearInterval(timer); timer = null; },

    // container にログイン画面を出す。ログインできたら onLogin(ユーザー名, セッションID)
    show(container, onLogin) {
      hdm.stop();
      const el = container, htui = OS.htui;
      el.className = 'hdm';
      const fmtDate = d => (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
      const pad = n => String(n).padStart(2, '0');
      const barClock = h('div', { class: 'hdm-barclock' }), bigTime = h('div', { class: 'hdm-time' }), bigDate = h('div', { class: 'hdm-date' });
      const tick = () => { const d = new Date(), t = pad(d.getHours()) + ':' + pad(d.getMinutes()); barClock.textContent = fmtDate(d) + ' ' + t; bigTime.textContent = t; bigDate.textContent = fmtDate(d); };
      tick(); timer = setInterval(tick, 5000);

      const powerBtn = h('button', { class: 'hdm-btn', type: 'button', title: '電源', 'aria-label': '電源メニュー', onclick: e => htui.menu(e.currentTarget, [
        { label: 'CUI に切り替え', icon: 'terminal', act: () => htui.stop() },
        { label: '再起動', icon: 'reload', act: () => OS.reboot() },
        { label: '電源を切る', icon: 'power', act: () => OS.poweroff() }
      ], true) }, OS.icon('power', 18));
      const modeBtn = h('button', { class: 'hdm-btn', type: 'button', onclick: e => htui.menu(e.currentTarget, ['auto', 'desktop', 'tablet', 'phone'].map(m => ({
        label: OS.modeNames[m] + (m === 'auto' ? '（' + OS.modeNames[OS.autoMode()] + '）' : ''), icon: OS.modeIcons[m === 'auto' ? OS.autoMode() : m],
        hint: m === OS.modePref ? '選択中' : null, act: () => { OS.setMode(m); syncMode(); } })), true) });
      const syncMode = () => { modeBtn.textContent = ''; modeBtn.append(OS.icon(OS.modeIcons[OS.uiMode], 18)); modeBtn.title = '画面モード: ' + OS.modeNames[OS.modePref]; modeBtn.setAttribute('aria-label', modeBtn.title); };
      syncMode();

      const bar = h('div', { class: 'hdm-bar' },
        h('div', { class: 'hdm-host' }, h('b', null, 'htmlOS'), h('span', null, OS.version)),
        barClock,
        h('div', { class: 'hdm-right' }, modeBtn, powerBtn));
      const card = h('div', { class: 'hdm-card' });
      const msg = h('div', { class: 'gr-msg hdm-msg', role: 'alert' });
      const main = h('div', { class: 'hdm-main' }, h('div', { class: 'hdm-clock' }, bigTime, bigDate), card);
      const foot = h('div', { class: 'hdm-foot' }, 'hdm — HtmlDisplayManager');
      el.append(bar, main, foot);

      const list = () => users.list().filter(u => !u.root);
      function showUsers() {
        card.textContent = '';
        const grid = h('div', { class: 'gr-users' });
        list().forEach(u => grid.append(h('button', { class: 'gr-user', type: 'button', onclick: () => ask(u) }, OS.htui.avatar(u, 64), h('span', null, u.name))));
        card.append(h('p', { class: 'hdm-sub' }, 'ログインするユーザーを選んでください'), grid);
      }
      function ask(u) {
        card.textContent = ''; msg.textContent = '';
        const pw = h('input', { type: 'password', class: 'inp', id: 'gr-pw', placeholder: 'パスワード', 'aria-label': 'パスワード', autocomplete: 'off' });
        const sel = h('select', { class: 'sel hdm-session', id: 'hdm-session', 'aria-label': 'デスクトップ環境' },
          Object.values(OS.sessions).map(s => h('option', { value: s.id, selected: s.id === hdm.sessionFor(u.name) }, s.name)));
        const desc = h('div', { class: 'hdm-desc' });
        const syncDesc = () => { const s = OS.sessions[sel.value]; desc.textContent = s ? s.desc : ''; };
        sel.addEventListener('change', syncDesc); syncDesc();
        const go = async e => {
          e.preventDefault();
          if (await users.verify(u.name, pw.value)) {
            const c = hdm.conf(); c.lastUser = u.name; c.users = c.users || {}; c.users[u.name] = sel.value; hdm.save(c);
            hdm.stop();
            onLogin(u.name, sel.value);
          } else { msg.textContent = 'パスワードが違います。'; pw.value = ''; pw.focus(); }
        };
        [OS.htui.avatar(u, 88), h('h2', { class: 'gr-name' }, u.name),
          h('form', { class: 'hdm-form', onsubmit: go },
            h('div', { class: 'gr-form' }, pw, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'ログイン' }, OS.icon('fwd', 18))),
            h('label', { class: 'hdm-sesrow' }, OS.icon('grid', 16), sel), desc),
          msg, list().length > 1 ? h('button', { class: 'btn ghost small', type: 'button', onclick: showUsers }, '別のユーザー') : null].forEach(n => { if (n) card.append(n); });
        pw.focus();
      }
      const last = users.get(hdm.conf().lastUser);
      if (last && !last.root) ask(last);
      else if (list().length === 1) ask(list()[0]);
      else showUsers();
    }
  };
})();
