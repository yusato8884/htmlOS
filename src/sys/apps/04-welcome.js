/* Welcome — htmlOS i を用途に合わせて使うためのアプリ。
   ロゴ・バージョン・ビルド番号と、2×2 のタイル「htmlOS を試す」「インストール」「アップデート」「htmlOS を回復」を出す。
   アップデートと回復は、インストール先（本物の LocalStorage）を操作する（BOOT.updateReal など、ブートローダの関数を使う）。 */
(function () {
  const OS = window.OS, h = OS.h, BOOT = window.BOOT;
  if (!OS.live || !BOOT || !BOOT.installReal) return;
  const ui = () => OS.ui;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  OS.registerApp({
    id: 'welcome', name: 'Welcome', icon: 'star', color: '#1c71d8', desc: 'htmlOS i — 試す・インストール・アップデート・回復',
    launch() {
      const ex = OS.htui.wins.find(w => w.app === 'welcome');
      if (ex) { ex.focus(); return ex; }
      const win = OS.htui.open({ title: 'Welcome — htmlOS i', icon: 'star', w: 720, h: 600, app: 'welcome' });
      const body = h('div', { class: 'wl' });
      win.body.append(body);
      if (OS.imode && !OS.touch) win.snap('max', true); // htmlOS i ではセットアップ画面として全体に広げる
      let busy = false;
      win.onClose = () => !busy;

      const tile = (id, icon, title, sub, fn, disabled) => h('button', { class: 'wl-tile wl-' + id, type: 'button', id: 'wl-' + id, disabled: !!disabled, onclick: fn },
        h('span', { class: 'wl-ico' }, OS.icon(icon, 34)), h('b', null, title), h('small', null, sub));

      function home() {
        body.textContent = '';
        const has = BOOT.realHasOS(), meta = has ? BOOT.realMeta() || {} : null;
        const same = has && meta.version === BOOT.version && String(meta.build || '') === String(BOOT.build);
        body.append(
          h('div', { class: 'wl-head' }, OS.mark(64, 'wl-mark'), h('h1', null, 'htmlOS'),
            h('p', null, 'htmlOS i ・ バージョン ' + BOOT.version + ' ・ ビルド ' + BOOT.build)),
          h('div', { class: 'wl-grid' },
            tile('try', 'play', 'htmlOS を試す', 'インストールせずに使う（再読み込みで消えます）', tryLive),
            tile('install', 'download', 'インストール', 'このブラウザに htmlOS を入れる', () => OS.launch('installer')),
            tile('update', 'reload', 'アップデート', has ? (same ? '最新です（' + meta.version + '）。もう一度書き直すこともできます' : meta.version + (meta.build ? '（ビルド ' + meta.build + '）' : '') + ' → ' + BOOT.version) : 'インストール済みの htmlOS がありません', update, !has),
            tile('recover', 'gear', 'htmlOS を回復', '修復・パスワード・バックアップ・アンインストール', recover)),
          h('p', { class: 'wl-foot' }, has ? 'インストール先: htmlOS ' + meta.version + (meta.build ? '（ビルド ' + meta.build + '）' : '') + ' が見つかりました' : 'インストール先: htmlOS は見つかりませんでした',
            BOOT.realIsRam() ? '（このブラウザは LocalStorage が使えないため、インストールしても再読み込みで消えます）' : ''));
        if (!OS.imode) body.querySelector('#wl-try').disabled = true;
      }

      // 進み具合の画面（タイトル・記録・バー）
      function progress(title) {
        body.textContent = '';
        const bar = h('i'), log = h('pre', { class: 'gi-log wl-log' }), stat = h('p', { class: 'gi-lead', id: 'wl-status' }, '');
        body.append(h('div', { class: 'wl-prog' }, OS.mark(40, 'wl-mark spin'), h('h2', null, title), stat, h('div', { class: 'gi-bar' }, bar), log));
        return { bar, log, stat, say(s, p) { log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; if (p != null) bar.style.width = p + '%'; } };
      }

      // htmlOS を試す: 残りのアプリを追加して、live ユーザーのデスクトップに切り替える
      async function tryLive() {
        if (busy) return; busy = true;
        const pg = progress('アプリを追加しています');
        const total = OS.fs.list('/sys/apps').filter(n => n.endsWith('.js')).length - 5; let n = 0;
        pg.stat.textContent = 'Live 環境に必要なアプリを追加しています…';
        await OS.loadMoreApps(async name => { n++; pg.say('追加: ' + name, Math.min(95, n / Math.max(1, total) * 95)); await sleep(70); });
        try { if (!OS.users.get('live')) await OS.users.add('live', '', true); } catch (e) { pg.say('live ユーザーを作れませんでした: ' + e.message); }
        pg.say('Live 環境を起動します', 100); pg.stat.textContent = 'Live 環境を起動します…';
        await sleep(400);
        busy = false;
        OS.imode = false;
        OS.htui.stop();
        OS.htui.start('live', OS.hdm.defaultSession());
        setTimeout(() => OS.notify({ app: 'htmlOS', icon: 'play', title: 'Live 環境で試しています', body: 'インストールするときは Welcome（アプリの一覧）の「インストール」を選んでください。ここでの変更は再読み込みすると消えます' }), 800);
      }

      // アップデート: /sys をメディアの内容で書き直す
      async function update() {
        const meta = BOOT.realMeta() || {};
        if (!(await ui().confirm('インストール済みの htmlOS ' + meta.version + (meta.build ? '（ビルド ' + meta.build + '）' : '') + ' を ' + BOOT.version + '（ビルド ' + BOOT.build + '）に更新します。ユーザー・ファイル・設定はそのまま残ります。', { ok: 'アップデート', title: 'アップデート' }))) return;
        await rewrite('アップデートしています', '更新しました。再起動すると htmlOS ' + BOOT.version + ' が起動します。');
      }
      async function rewrite(title, doneMsg) {
        busy = true;
        const pg = progress(title), files = Object.keys(BOOT.media).length; let n = 0;
        try {
          await sleep(150);
          BOOT.updateReal(s => { n++; pg.say(s, n / files * 100); });
          pg.say('完了しました', 100); pg.stat.textContent = doneMsg;
          busy = false;
          pg.stat.after(h('div', { class: 'wl-row' }, h('button', { class: 'btn primary', type: 'button', id: 'wl-reboot', onclick: () => OS.reboot() }, '再起動'), h('button', { class: 'btn', type: 'button', onclick: home }, 'Welcome に戻る')));
        } catch (e) {
          busy = false; pg.stat.textContent = '失敗しました: ' + e.message; pg.stat.classList.add('gi-errtext');
          pg.stat.after(h('button', { class: 'btn', type: 'button', onclick: home }, 'Welcome に戻る'));
        }
      }

      // 回復
      function recover() {
        body.textContent = '';
        const has = BOOT.realHasOS();
        const row = (id, icon, title, desc, label, fn, opt) => h('div', { class: 'wl-act' + (opt && opt.danger ? ' danger' : '') },
          h('span', { class: 'wl-aico' }, OS.icon(icon, 20)), h('div', { class: 'wl-atext' }, h('b', null, title), h('small', null, desc)),
          h('button', { class: 'btn' + (opt && opt.danger ? ' danger' : ''), type: 'button', id: 'wl-' + id, disabled: opt && opt.disabled, onclick: fn }, label));
        body.append(
          h('div', { class: 'wl-sub' }, h('button', { class: 'tbtn', type: 'button', onclick: home, 'aria-label': '戻る' }, OS.icon('back', 16), 'Welcome'), h('h2', null, 'htmlOS を回復')),
          h('p', { class: 'gi-lead' }, has ? 'インストール先の htmlOS ' + (BOOT.realMeta() || {}).version + ' を直します。' : 'インストール先に htmlOS が見つかりません。バックアップからの復元だけ使えます。'),
          h('div', { class: 'wl-acts' },
            row('repair', 'reload', 'システムを修復', '/sys をメディアの内容で書き直します。ユーザー・ファイル・設定は残ります', '修復', async () => {
              if (await ui().confirm('/sys をメディアの内容で書き直します。/sys を自分で書き換えていた場合、その変更は消えます。', { ok: '修復', title: 'システムを修復' })) rewrite('システムを修復しています', '修復しました。再起動すると htmlOS が起動します。');
            }, { disabled: !has }),
            row('passwd', 'user', 'パスワードをリセット', 'ユーザーや root のパスワードを忘れたときに、新しいパスワードを設定します', 'リセット…', resetPassword, { disabled: !has }),
            row('boot', 'gear', '起動の設定を初期化', '起動したときの画面を GUI に、ログイン画面のデスクトップ環境を既定（HTUi）に戻します', '初期化', async () => {
              if (!(await ui().confirm('起動の設定を初期化します。ユーザーとファイルは残ります。', { ok: '初期化', title: '起動の設定を初期化' }))) return;
              try { BOOT.realResetBoot(); ui().toast('起動の設定を初期化しました'); } catch (e) { ui().alert(e.message); }
            }, { disabled: !has }),
            row('backup', 'download', 'データをバックアップ', 'ユーザー・ファイル・設定をすべて 1 つのファイル（.json）にして PC に保存します', '保存', () => {
              try {
                const url = URL.createObjectURL(new Blob([BOOT.realExport()], { type: 'application/json' })), d = new Date();
                const a = h('a', { href: url, download: 'htmlos-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json' });
                document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
              } catch (e) { ui().alert(e.message); }
            }, { disabled: !has }),
            row('restore', 'upload', 'バックアップから復元', 'バックアップのファイルを読み込み、インストール先をその内容に置き換えます', '復元…', restore),
            row('uninstall', 'trash', 'htmlOS をアンインストール', '管理者としてサインインし、このブラウザから htmlOS のユーザー・ファイル・設定をすべて消去します（BIOS の設定は残ります）', 'アンインストール…', uninstall, { danger: true, disabled: !has })));
      }
      async function resetPassword() {
        const list = BOOT.realUsers();
        if (!list.length) { ui().alert('ユーザーが見つかりません'); return; }
        const sel = h('select', { class: 'inp', id: 'wl-puser' }, list.map(u => h('option', { value: u.name }, u.name + (u.root ? '（root）' : u.admin ? '（管理者）' : ''))));
        const p1 = h('input', { class: 'inp', type: 'password', id: 'wl-p1', 'aria-label': '新しいパスワード' }), p2 = h('input', { class: 'inp', type: 'password', id: 'wl-p2', 'aria-label': 'もう一度' });
        const ok = await ui().modal({ title: 'パスワードをリセット', body: h('div', { class: 'wl-form' }, h('label', null, 'ユーザー', sel), h('label', null, '新しいパスワード（空でもかまいません）', p1), h('label', null, 'もう一度', p2)),
          buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: '設定する', primary: true, value: true }] });
        if (!ok) return;
        if (p1.value !== p2.value) { ui().alert('パスワードが一致しません'); return; }
        try { await BOOT.realSetPassword(sel.value, p1.value); ui().toast(sel.value + ' のパスワードを設定しました'); } catch (e) { ui().alert(e.message); }
      }
      function restore() {
        const inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
        inp.addEventListener('change', async () => {
          const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
          const text = await f.text();
          if (!(await ui().confirm('インストール先を「' + f.name + '」の内容に置き換えます。いまのユーザー・ファイル・設定は消えます。', { ok: '復元', danger: true, title: 'バックアップから復元' }))) return;
          try { const n = BOOT.realImport(text); await ui().alert(n + ' 個の項目を復元しました。再起動すると、復元した htmlOS が起動します。', '復元しました'); recover(); } catch (e) { ui().alert(e.message); }
        });
        document.body.append(inp); inp.click();
      }
      async function uninstall() {
        const admins = BOOT.realUsers().filter(u => u.admin || u.root);
        if (!admins.length) { ui().alert('管理者のユーザーが見つかりません。先に「パスワードをリセット」などで直してください。'); return; }
        const sel = h('select', { class: 'inp', id: 'wl-uuser' }, admins.map(u => h('option', { value: u.name }, u.name + (u.root ? '（root）' : '（管理者）'))));
        const pw = h('input', { class: 'inp', type: 'password', id: 'wl-upw', 'aria-label': 'パスワード', autocomplete: 'current-password' });
        const msg = h('div', { class: 'wl-err', id: 'wl-uerr', role: 'alert' });
        const body = h('div', { class: 'wl-form' },
          h('p', null, 'アンインストールするには、インストール先の htmlOS の管理者としてサインインしてください。'),
          h('label', null, '管理者', sel), h('label', null, 'パスワード', pw), msg);
        let tries = 0, close = null, busy = false;
        const signIn = () => {
          if (busy) return ui().KEEP;
          busy = true; msg.textContent = '確認しています…';
          BOOT.realVerifyAdmin(sel.value, pw.value).then(async ok => {
            if (ok) { close(true); return; }
            tries++; pw.value = '';
            await new Promise(r => setTimeout(r, Math.min(400 * tries, 2000)));
            msg.textContent = 'パスワードが違います' + (tries >= 3 ? '。忘れた場合は「パスワードをリセット」を使ってください' : '');
            busy = false; pw.focus();
          });
          return ui().KEEP;
        };
        const ok = await ui().modal({ title: 'htmlOS をアンインストール', body, onOpen: d => { close = d; pw.focus(); },
          buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: 'サインイン', primary: true, value: signIn }] });
        if (!ok) return;
        const user = sel.value;
        if (!(await ui().confirm(user + ' としてサインインしました。\nこのブラウザの htmlOS のユーザー・ファイル・設定をすべて消去します。元に戻せません。', { ok: '消去', danger: true, title: 'htmlOS をアンインストール' }))) return;
        try { BOOT.realWipe(); } catch (e) { ui().alert(e.message); return; }
        await ui().alert('htmlOS をアンインストールしました。htmlOS i はこのまま使えます。次に開いたときは htmlOS i が起動します。', 'アンインストールしました');
        home();
      }

      home();
      return win;
    }
  });
})();
