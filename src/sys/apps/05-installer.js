/* htmlOS インストーラー（GUI）。htmlOS i（とそこから始めた Live 環境）で使う。Welcome の「インストール」から開く。
   ユーザー → 設定 → 確認 → インストール の順に進み、本物の LocalStorage に htmlOS を入れる。
   書き込みはブートローダの BOOT.installReal が行う（Live の OS 自体はメモリ上のストレージで動いている）。 */
(function () {
  const OS = window.OS, h = OS.h, BOOT = window.BOOT;
  if (!OS.live || !BOOT || !BOOT.installReal) return;

  const STEPS = ['ユーザー', '設定', '確認', 'インストール'];

  OS.registerApp({
    id: 'installer', name: 'htmlOS をインストール', icon: 'download', color: '#c01c28', desc: 'このブラウザに htmlOS をインストールする',
    launch() {
      const ex = OS.htui.wins.find(w => w.app === 'installer');
      if (ex) { ex.focus(); return ex; }
      const win = OS.htui.open({ title: 'htmlOS をインストール', icon: 'download', w: 760, h: 540, app: 'installer' });
      const st = { step: 0, user: '', pw1: '', pw2: '', rpw: '', host: 'htmlos', mode: 'gui', session: OS.hdm.defaultSession(), keep: true, busy: false, done: false };
      const side = h('ol', { class: 'gi-steps' }), page = h('div', { class: 'gi-page' }), err = h('div', { class: 'gi-err', role: 'alert' });
      const back = h('button', { class: 'btn', type: 'button', onclick: () => go(st.step - 1) }, '戻る');
      const next = h('button', { class: 'btn primary', type: 'button', id: 'gi-next', onclick: () => forward() }, '次へ');
      const foot = h('div', { class: 'gi-foot' }, err, h('div', { class: 'gi-btns' }, back, next));
      win.body.append(h('div', { class: 'gi' }, h('aside', { class: 'gi-side' }, h('div', { class: 'gi-brand' }, OS.mark(30), h('b', null, 'htmlOS ' + OS.version)), side), h('div', { class: 'gi-main' }, page, foot)));
      win.onClose = () => !st.busy;

      const field = (label, input, hint) => h('label', { class: 'gi-field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
      const inp = (id, key, type, ph) => {
        const i = h('input', { class: 'inp', id: id, type: type || 'text', value: st[key], placeholder: ph || '', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
        i.addEventListener('input', () => { st[key] = i.value; err.textContent = ''; });
        i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); forward(); } });
        return i;
      };
      // Live で作ったファイル（/home/live 以下）。親のディレクトリから順に並べる
      const liveFiles = () => {
        const out = [], base = OS.users.home('live');
        const walk = p => { for (const n of OS.fs.list(p)) { const q = p + '/' + n, s = OS.fs.lstat(q); if (!s) continue; out.push({ rel: q.slice(base.length), node: s }); if (s.t === 'd') walk(q); } };
        try { walk(base); } catch (e) { /* なければ空 */ }
        return out;
      };
      const countFiles = () => liveFiles().filter(f => f.node.t === 'f' && !f.rel.startsWith('/.config')).length;

      function render() {
        side.textContent = '';
        STEPS.forEach((s, i) => side.append(h('li', { class: i === st.step ? 'on' : i < st.step ? 'ok' : '' }, h('span', { class: 'gi-num' }, i < st.step ? '✓' : String(i + 1)), s)));
        page.textContent = ''; err.textContent = '';
        back.hidden = st.step === 0 || st.step === 3; next.hidden = st.step === 3 && !st.done;
        next.textContent = st.step === 2 ? 'インストール' : st.step === 3 ? '再起動して使い始める' : '次へ';
        next.classList.toggle('danger', st.step === 2 && BOOT.realHasOS());
        PAGES[st.step]();
        const f = page.querySelector('input:not([type=radio]):not([type=checkbox])'); if (f && !OS.touch) setTimeout(() => f.focus(), 30);
      }
      function go(i) { if (st.busy) return; st.step = Math.max(0, Math.min(STEPS.length - 1, i)); render(); }
      function forward() {
        if (st.step === 0) {
          const u = st.user.trim();
          if (!/^[a-z_][a-z0-9_-]{0,15}$/.test(u)) return fail('ユーザー名は英小文字で始め、英小文字・数字・_ - で16文字までにしてください。');
          if (u === 'root' || u === 'live') return fail(u + ' は使えません。別のユーザー名にしてください。');
          if (st.pw1 !== st.pw2) return fail('パスワードが一致しません。');
          if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(st.host.trim())) return fail('コンピューター名は英数字と - で、63文字までにしてください。');
          st.user = u; st.host = st.host.trim();
        }
        if (st.step === 2) return run();
        if (st.step === 3) { OS.reboot(); return; }
        go(st.step + 1);
      }
      function fail(m) { err.textContent = m; const b = page.querySelector('.gi-form'); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } }

      const PAGES = [
        // ユーザー
        () => page.append(h('h2', null, 'ユーザーを作成'), h('p', { class: 'gi-lead' }, '最初のユーザーは管理者になります。何でもできる root アカウントも一緒に作られます（jsh の su で入ります）。'),
          h('div', { class: 'gi-form' },
            field('ユーザー名', inp('gi-user', 'user', 'text', '例: user'), '英小文字で始め、英小文字・数字・_ - で16文字まで'),
            h('div', { class: 'gi-two' }, field('パスワード', inp('gi-pw1', 'pw1', 'password')), field('もう一度', inp('gi-pw2', 'pw2', 'password'))),
            field('root のパスワード', inp('gi-rpw', 'rpw', 'password', '空欄なら上と同じ')),
            field('コンピューター名', inp('gi-host', 'host'), 'jsh のプロンプト（ユーザー@名前）に出ます'))),
        // 設定
        () => {
          const radio = (name, val, label, desc) => h('label', { class: 'gi-opt' + (st[name] === val ? ' on' : '') },
            h('input', { type: 'radio', name: 'gi-' + name + '-' + win.pid, id: 'gi-' + name + '-' + val, checked: st[name] === val, onchange: () => { st[name] = val; render(); } }),
            h('span', null, h('b', null, label), desc ? h('small', null, desc) : null));
          const n = countFiles();
          page.append(h('h2', null, '設定'),
            h('h3', null, '起動したときの画面'),
            h('div', { class: 'gi-opts' }, radio('mode', 'gui', 'GUI（デスクトップ）', 'ログイン画面からデスクトップを使う'), radio('mode', 'cui', 'CUI（jsh コンソール）', '文字だけの画面。htui start でデスクトップも開ける')),
            h('h3', null, 'デスクトップ環境'),
            h('div', { class: 'gi-opts gi-ses' }, Object.values(OS.sessions).filter(s => !s.hidden).map(s => radio('session', s.id, s.name, s.desc))),
            h('h3', null, 'Live のファイル'),
            h('label', { class: 'gi-check' }, h('input', { type: 'checkbox', id: 'gi-keep', checked: st.keep, onchange: e => { st.keep = e.target.checked; } }),
              n ? 'Live で作ったファイル（' + n + ' 個）と外観の設定を、新しいユーザーに引き継ぐ' : 'Live での外観の設定（壁紙など）を、新しいユーザーに引き継ぐ'));
        },
        // 確認
        () => {
          const row = (k, v) => h('div', { class: 'gi-row' }, h('span', null, k), h('b', null, v));
          page.append(h('h2', null, 'インストールの確認'),
            h('div', { class: 'gi-sum' },
              row('インストール先', 'このブラウザの LocalStorage（htmlos:）'),
              row('ユーザー', st.user + '（管理者）と root'),
              row('コンピューター名', st.host),
              row('起動したときの画面', st.mode === 'gui' ? 'GUI（デスクトップ）' : 'CUI（jsh コンソール）'),
              row('デスクトップ環境', (OS.sessions[st.session] || {}).name || st.session),
              row('Live のファイル', st.keep ? '引き継ぐ' : '引き継がない')),
            BOOT.realHasOS()
              ? h('p', { class: 'gi-warn danger' }, OS.icon('bell', 16), 'このブラウザにはもう htmlOS が入っています。インストールすると、いまのユーザー・ファイル・設定はすべて消えます。')
              : h('p', { class: 'gi-lead' }, '「インストール」を押すと書き込みが始まります。'));
        },
        // インストール中・完了
        () => {
          const bar = h('i'), log = h('pre', { class: 'gi-log' }), stat = h('p', { class: 'gi-lead', id: 'gi-status' }, 'インストールしています…');
          page.append(h('h2', null, st.done ? 'インストールが完了しました' : 'インストール'), stat, h('div', { class: 'gi-bar' }, bar), h('details', { class: 'gi-det', open: !!st.failed }, h('summary', null, '詳しい記録'), log));
          st.ui = { bar, log, stat };
        }
      ];

      async function run() {
        if (st.busy) return;
        st.step = 3; st.busy = true; render();
        const { bar, log, stat } = st.ui;
        const total = Object.keys(BOOT.media).length + 4; let n = 0;
        const say = s => { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; n++; bar.style.width = Math.min(100, n / total * 100) + '%'; };
        try {
          // 引き継ぐファイル: /home/live → /home/<ユーザー>。外観の設定（.config）は「引き継ぐ」なら一緒に
          let files = [];
          if (st.keep) {
            const home = '/home/' + st.user;
            files = [{ path: home, node: { t: 'd', m: Date.now(), o: st.user } }].concat(liveFiles().map(f => ({ path: home + f.rel, node: Object.assign({}, f.node, { o: st.user }) })));
          }
          await new Promise(r => setTimeout(r, 120));
          await BOOT.installReal({ user: st.user, pw: st.pw1, rootPw: st.rpw, mode: st.mode, hostname: st.host, session: st.session, files: files }, say);
          say('完了しました。');
          bar.style.width = '100%';
          st.done = true; st.busy = false;
          OS.notify({ app: 'htmlOS', icon: 'download', title: 'インストールが完了しました', body: '再起動すると、インストールした htmlOS が起動します' });
          render();
          st.ui.bar.style.width = '100%'; st.ui.log.textContent = log.textContent;
          st.ui.stat.textContent = '再起動すると、インストールした htmlOS が起動します。このまま Live を続けることもできます（ここでの変更はインストール先には反映されません）。';
        } catch (e) {
          st.busy = false; st.failed = true;
          say('失敗: ' + e.message);
          stat.textContent = 'インストールに失敗しました: ' + e.message + '（ブラウザのストレージが使えない、または空きがない可能性があります）';
          stat.classList.add('gi-errtext');
          back.hidden = false; back.onclick = () => { st.failed = false; go(2); };
        }
      }
      render();
      return win;
    }
  });
})();
