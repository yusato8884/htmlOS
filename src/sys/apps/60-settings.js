/* Settings — 設定（ユーザー管理 / 起動 / 外観 / ネットワーク / システム） */
(function () {
  const OS = window.OS, h = OS.h, ui = OS.ui, users = OS.users;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

  // 画像ファイルを 96x96 の正方形 JPEG(data URL) に縮小する
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 96;
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 96, 96);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('画像として読み込めませんでした')); };
      img.src = url;
    });
  }

  OS.registerApp({
    id: 'settings', name: 'Settings', icon: 'gear', color: '#5e5c64', desc: '設定',
    launch(arg) {
      const me = () => users.get(OS.htui.user) || {};
      const win = OS.htui.open({ title: 'Settings', icon: 'gear', w: 700, h: 480, app: 'settings' });
      const nav = h('div', { class: 'st-nav' }), page = h('div', { class: 'st-page' });
      win.body.append(h('div', { class: 'st-main' }, nav, page));
      const err = e => ui.alert(e.message);
      const adminNote = () => me().admin ? document.createTextNode('') : h('p', null, 'この項目を変更できるのは管理者だけです。');

      async function newPassword(title) {
        const a = h('input', { class: 'inp', type: 'password', id: 'st-pw1', placeholder: '新しいパスワード', 'aria-label': '新しいパスワード' });
        const b = h('input', { class: 'inp', type: 'password', id: 'st-pw2', placeholder: 'もう一度', 'aria-label': '新しいパスワード（確認）' });
        const msg = h('div', { class: 'fp-err', role: 'alert' });
        return ui.modal({ title: title, body: [a, b, msg], buttons: [{ label: 'キャンセル', cancel: true, value: null },
          { label: '決定', primary: true, value: () => { if (a.value !== b.value) { msg.textContent = 'パスワードが一致しません。'; return ui.KEEP; } return { pw: a.value }; } }] });
      }

      const pages = {
        users: ['ユーザー', 'user', () => {
          const admin = !!me().admin;
          page.append(h('h2', null, 'ユーザー管理'));
          users.list().forEach(u => {
            const self = u.name === OS.htui.user, can = self || admin;
            const pick = h('input', { type: 'file', accept: 'image/*', id: 'st-av-' + u.name, style: 'display:none' });
            pick.addEventListener('change', async () => { try { if (pick.files[0]) { users.update(u.name, { img: await shrink(pick.files[0]) }); done(); } } catch (e) { err(e); } });
            const done = () => { OS.htui.refreshUser(); show('users'); };
            const sw = h('div', { class: 'st-swatches' }, users.colors.map(c => h('button', { class: 'st-sw' + (!u.img && u.color === c ? ' on' : ''), type: 'button', style: 'background:' + c + ';width:22px;height:22px', title: 'アバターの色 ' + c, 'aria-label': 'アバターの色 ' + c, disabled: !can, onclick: () => { users.update(u.name, { color: c, img: null }); done(); } })));
            page.append(h('div', { class: 'st-card' }, OS.htui.avatar(u, 48),
              h('div', { class: 'who' }, h('b', null, u.name + (self ? '（あなた）' : '')), h('small', null, (u.root ? 'スーパーユーザー（何でもできる。jsh の su で入る）' + (u.pw ? '' : ' ・ パスワード未設定のため su できません') : u.admin ? '管理者' : '一般ユーザー') + ' ・ ' + users.home(u.name))),
              can ? sw : null, pick,
              can ? h('button', { class: 'btn small', type: 'button', onclick: () => pick.click() }, 'アバター画像') : null,
              can ? h('button', { class: 'btn small', type: 'button', onclick: async () => {
                try {
                  if ((self || u.root) && u.pw) { const cur = await ui.prompt('現在のパスワード', '', { password: true, title: 'パスワードの変更' }); if (cur == null) return; if (!(await users.verify(u.name, cur))) throw new Error('現在のパスワードが違います'); }
                  const r = await newPassword(u.name + ' のパスワード'); if (!r) return;
                  await users.setPassword(u.name, r.pw); ui.toast(u.name + ' のパスワードを変更しました');
                } catch (e) { err(e); }
              } }, 'パスワード') : null,
              admin && !self && !u.root ? h('button', { class: 'btn small', type: 'button', onclick: () => { try { users.update(u.name, { admin: !u.admin }); done(); } catch (e) { err(e); } } }, u.admin ? '一般ユーザーにする' : '管理者にする') : null,
              admin && !self && !u.root ? h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
                if (!(await ui.confirm(u.name + ' と /home/' + u.name + ' のファイルをすべて削除しますか? 元に戻せません。', { ok: '削除', danger: true, title: 'ユーザーの削除' }))) return;
                try { users.remove(u.name); done(); } catch (e) { err(e); }
              } }, '削除') : null));
          });
          if (admin) {
            const name = h('input', { class: 'inp', id: 'st-newuser', placeholder: 'ユーザー名（英小文字）', 'aria-label': '新しいユーザー名', style: 'max-width:200px' });
            const adm = h('input', { type: 'checkbox', id: 'st-newadmin' });
            page.append(h('h3', null, 'ユーザーを追加'), h('form', { class: 'st-row', onsubmit: async e => {
              e.preventDefault();
              try {
                const n = name.value.trim(); if (!n) return;
                if (users.get(n)) throw new Error(n + ': すでに存在するユーザーです');
                const r = await newPassword(n + ' のパスワード'); if (!r) return;
                await users.add(n, r.pw, adm.checked); show('users');
              } catch (ex) { err(ex); }
            } }, name, h('label', null, adm, '管理者'), h('button', { class: 'btn primary', type: 'submit' }, '追加')));
          } else page.append(h('p', null, 'ユーザーの追加・削除は管理者だけができます。'));
        }],
        boot: ['起動', 'power', () => {
          const admin = !!me().admin, mode = OS.config.get('bootMode', 'gui');
          const radio = (v, label) => h('label', null, h('input', { type: 'radio', name: 'st-boot-' + win.pid, id: 'st-boot-' + v, checked: mode === v, disabled: !admin, onchange: () => { try { OS.config.set('bootMode', v); ui.toast('既定の起動モードを変更しました'); } catch (e) { err(e); } } }), label);
          const t = h('input', { class: 'inp', type: 'number', min: '0', max: '30', id: 'st-timeout', value: String(OS.config.get('timeout', 3)), disabled: !admin, style: 'width:80px', 'aria-label': 'ブートメニューの待ち時間（秒）' });
          t.addEventListener('change', () => { try { OS.config.set('timeout', Math.max(0, Math.min(30, Number(t.value) || 0))); } catch (e) { err(e); } });
          page.append(h('h2', null, '起動'), adminNote(),
            h('h3', null, '既定の起動モード'),
            h('div', { class: 'st-row' }, radio('gui', 'GUI（HTUi デスクトップ）'), radio('cui', 'CUI（jsh コンソール）')),
            h('p', null, 'CUIで起動しても、jsh で「htui start」と入力すればデスクトップを起動できます。逆に「htui stop」でデスクトップを終了して CUI に戻れます。'),
            h('h3', null, 'ログイン画面（hdm）の既定のデスクトップ環境'),
            h('div', { class: 'st-row' }, h('select', { class: 'sel', id: 'st-defses', disabled: !admin, 'aria-label': '既定のデスクトップ環境', onchange: e => { try { OS.config.set('session', e.target.value); ui.toast('既定のデスクトップ環境を変更しました'); } catch (ex) { err(ex); } } },
              Object.values(OS.sessions).filter(s => !s.hidden).map(s => h('option', { value: s.id, selected: OS.hdm.defaultSession() === s.id }, s.name)))),
            h('p', null, 'まだ一度もログインしていないユーザーは、この環境で起動します。各ユーザーが最後に選んだ環境は hdm が覚えています。'),
            h('h3', null, 'ブートメニューの待ち時間'),
            h('div', { class: 'st-row' }, t, '秒（0 にするとメニューを出さずに起動します）'),
            h('h3', null, '今すぐ切り替え'),
            h('div', { class: 'st-row' },
              h('button', { class: 'btn', type: 'button', onclick: () => OS.htui.stop() }, 'HTUi を終了して CUI へ'),
              h('button', { class: 'btn', type: 'button', onclick: () => OS.reboot('cui') }, 'CUI で再起動'),
              h('button', { class: 'btn', type: 'button', onclick: () => OS.reboot('gui') }, 'GUI で再起動')));
        }],
        look: ['外観', 'image', () => {
          const p = OS.htui.prefs;
          const setWall = src => OS.htui.setWallpaperImage(src).then(() => show('look')).catch(e => OS.ui.alert(e.message));
          page.append(h('h2', null, '外観'), h('p', null, 'この設定はユーザーごとに ~/.config/htui.json に保存されます。'),
            h('h3', null, '壁紙'),
            h('div', { class: 'st-swatches' }, OS.htui.wallpapers.map((w, i) => h('button', { class: 'st-sw wp' + (p.wallpaper !== 'custom' && (p.wallpaper | 0) === i ? ' on' : ''), type: 'button', style: 'background:' + w.css, title: w.name, 'aria-label': '壁紙 ' + w.name, onclick: () => { OS.htui.setPrefs({ wallpaper: i }); show('look'); } })),
              OS.htui.hasCustomWallpaper() ? h('button', { class: 'st-sw wp' + (p.wallpaper === 'custom' ? ' on' : ''), type: 'button', style: 'background:' + OS.htui.wallCss({ wallpaper: 'custom' }, OS.htui.user), title: '自分の画像', 'aria-label': '壁紙 自分の画像', onclick: () => { OS.htui.setPrefs({ wallpaper: 'custom' }); show('look'); } }) : null),
            h('div', { class: 'st-row' },
              h('button', { class: 'btn', type: 'button', onclick: () => {
                const inp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
                inp.addEventListener('change', () => {
                  const f = inp.files && inp.files[0]; if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setWall(r.result);
                  r.readAsDataURL(f);
                });
                document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
              } }, OS.icon('upload', 16), 'パソコンの画像…'),
              h('button', { class: 'btn', type: 'button', onclick: async () => {
                const f = await OS.ui.pickFile({ title: '壁紙にする画像', kinds: ['image'] });
                if (f) { try { setWall(OS.htui.fs.dataURL(f)); } catch (e) { OS.ui.alert(e.message); } }
              } }, OS.icon('folder', 16), 'hFS の画像…'),
              h('small', null, '長い辺が 1920px より大きい画像は縮めて保存します（~/.config/wallpaper）')),
            h('h3', null, 'アクセントカラー'),
            h('div', { class: 'st-swatches' }, OS.htui.accents.map(c => h('button', { class: 'st-sw' + ((p.accent || OS.htui.accents[0]) === c ? ' on' : ''), type: 'button', style: 'background:' + c, title: c, 'aria-label': 'アクセントカラー ' + c, onclick: () => { OS.htui.setPrefs({ accent: c }); show('look'); } })),
            h('h3', null, 'デスクトップ環境'),
            h('div', { class: 'st-sessions' }, Object.values(OS.sessions).filter(s => !s.hidden).map(s => {
              const cur = OS.hdm.sessionFor(OS.htui.user) === s.id;
              return h('label', { class: 'st-card st-ses' + (cur ? ' on' : '') },
                h('input', { type: 'radio', name: 'st-ses-' + win.pid, id: 'st-ses-' + s.id, checked: cur, onchange: () => { OS.hdm.setUserSession(OS.htui.user, s.id); show('look'); } }),
                h('span', { class: 'who' }, h('b', null, s.name + (OS.htui.sessionId === s.id ? '（使用中）' : '')), h('small', null, s.desc)));
            })),
            OS.hdm.sessionFor(OS.htui.user) !== OS.htui.sessionId
              ? h('div', { class: 'st-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => OS.htui.switchSession(OS.hdm.sessionFor(OS.htui.user)) }, '今すぐ切り替える'), '開いているアプリは閉じます（未保存の確認は出ます）。')
              : h('p', null, '次回ログイン時も、ここで選んだ環境で起動します。ログイン画面（hdm）でも選べます。'),
            h('h3', null, '画面モード'),
            h('div', { class: 'st-row' }, h('select', { class: 'sel', id: 'st-mode', 'aria-label': '画面モード', value: p.mode || 'auto', onchange: e => { OS.htui.setPrefs({ mode: e.target.value }); show('look'); } },
              ['auto', 'desktop', 'tablet', 'phone'].map(m => h('option', { value: m }, OS.modeNames[m]))), '今の表示: ' + OS.modeNames[OS.uiMode]),
            h('p', null, 'タブレットとスマートフォンでは、アプリが全画面になり、ボタンと文字が大きくなって、下に「閉じる・ホーム・タスク」のナビが出ます。Terminal には Tab や ↑↓ などの補助キー列が付きます。スマートフォンはさらに1列の配置になります。「自動」はタッチ端末かどうかと画面の幅で決めます。'),
            h('h3', null, 'アニメーション'),
            h('div', { class: 'st-row' }, h('label', null, h('input', { type: 'checkbox', id: 'st-anim', checked: p.anim !== false, onchange: e => OS.htui.setPrefs({ anim: e.target.checked }) }), 'ウィンドウやメニューのアニメーションを使う')),
            h('p', null, 'パソコン側で「アニメーションを減らす」設定にしていても、htmlOS の中ではこのスイッチだけで決まります。'),
            h('h3', null, 'ウィンドウ操作'),
            h('p', null, 'タイトルバーを画面の左右の端までドラッグすると半分に、四隅の近くで4分の1に、上端で最大化にスナップします。最大化ボタンの右クリックや Ctrl+Alt+矢印キーでも配置できます。ウィンドウの辺と角をドラッグするとサイズを変えられます。')));
        }],
        sound: ['サウンド', 'audio', () => {
          const admin = !!me().admin, S = OS.sound, mine = OS.htui.prefs.sound || {}, p = S.prefs();
          const set = patch => OS.htui.setPrefs({ sound: Object.assign({}, OS.htui.prefs.sound || {}, patch) });
          const vol = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(p.vol * 100), id: 'st-snd-vol', 'aria-label': '音量', style: 'flex:1;max-width:260px' });
          const volN = h('span', { style: 'min-width:3em' }, Math.round(p.vol * 100) + '%');
          vol.addEventListener('input', () => { volN.textContent = vol.value + '%'; });
          vol.addEventListener('change', () => { set({ vol: Number(vol.value) / 100 }); S.play('confirm', true); });
          page.append(h('h2', null, 'サウンド'), h('p', null, '起動・ログイン・ログオフ・シャットダウン・再起動・Terminal のベル・確認のダイアログ・通知で効果音を鳴らします。この設定はユーザーごとに保存されます。'),
            h('div', { class: 'st-row' }, h('label', null, h('input', { type: 'checkbox', class: 'switch', id: 'st-snd-on', checked: p.on, onchange: e => set({ on: e.target.checked }) }), ' 効果音を鳴らす')),
            h('div', { class: 'st-row' }, h('span', null, '音量'), vol, volN),
            h('h3', null, '試しに鳴らす'),
            h('div', { class: 'st-row', style: 'flex-wrap:wrap' }, S.list().map(n => h('button', { class: 'btn small', type: 'button', id: 'st-snd-' + n, onclick: () => S.play(n, true) }, OS.icon('audio', 14), ' ' + S.names[n]))));
          const sys = OS.config.get('sound', {}) || {};
          page.append(h('h3', null, 'ログイン前（起動音・ログイン画面）'),
            h('div', { class: 'st-row' }, h('label', null, h('input', { type: 'checkbox', class: 'switch', id: 'st-snd-sys', disabled: !admin, checked: sys.on !== false, onchange: e => { try { OS.config.set('sound', Object.assign({}, OS.config.get('sound', {}) || {}, { on: e.target.checked, vol: Number(vol.value) / 100 })); } catch (er) { err(er); } } }), ' 起動音とログイン音を鳴らす（システム全体）')),
            adminNote());
          if (mine.on === undefined && mine.vol === undefined) { /* まだユーザーの設定がない: システムの設定に従っている */ }
        }],
        net: ['ネットワーク', 'globe', () => {
          const admin = !!me().admin;
          const ta = h('textarea', { class: 'inp st-area', id: 'st-proxies', spellcheck: 'false', disabled: !admin, 'aria-label': 'CORSプロキシ一覧' }, OS.config.get('proxies', OS.net.defaults).join('\n'));
          page.append(h('h2', null, 'ネットワーク'), adminNote(),
            h('h3', null, 'CORSプロキシ'),
            h('p', null, 'hBrowser のプロキシモードとダウンロード（wget を含む）で、上から順に試します。{url} の部分がエンコードされたURLに置き換わります。いずれも外部の無料サービスなので、止まったり制限がかかったりすることがあります。'),
            ta,
            h('div', { class: 'st-row' },
              h('button', { class: 'btn primary', type: 'button', disabled: !admin, onclick: () => { try { const l = ta.value.split('\n').map(s => s.trim()).filter(s => s.includes('{url}')); OS.config.set('proxies', l); ta.value = l.join('\n'); ui.toast('プロキシ設定を保存しました'); } catch (e) { err(e); } } }, '保存'),
              h('button', { class: 'btn', type: 'button', disabled: !admin, onclick: () => { ta.value = OS.net.defaults.join('\n'); } }, '初期値に戻す')));
        }],
        system: ['システム', 'gear', () => {
          const admin = !!me().admin, u = OS.fs.usage(), meta = window.BOOT.getMeta() || {};
          const d = ms => ms ? new Date(ms).toLocaleString('ja-JP') : '-';
          page.append(h('h2', null, 'システム'),
            h('dl', { class: 'st-kv' },
              h('dt', null, 'インストール済み'), h('dd', null, OS.name + '（' + OS.version + '）'),
              h('dt', null, '描画エンジン'), h('dd', null, OS.htui.sdk ? OS.htui.sdk.full : 'HTUi'),
              h('dt', null, 'メディア（このHTML）'), h('dd', null, 'htmlOS ' + window.BOOT.version),
              h('dt', null, 'インストール日時'), h('dd', null, d(meta.installedAt)),
              h('dt', null, 'システム更新日時'), h('dd', null, d(meta.updatedAt)),
              h('dt', null, 'ストレージ'), h('dd', null, OS.store.ram ? 'RAMディスク（再読み込みで消えます）' : OS.storeLabel())),
            h('h3', null, '使用量'),
            h('div', { class: 'st-meter' }, h('i', { style: 'width:' + (u.total ? Math.min(100, u.used / u.total * 100) : 0) + '%' })),
            h('p', null, u.disk ? fmtSize(u.used) + (u.total ? ' / ' + fmtSize(u.total) + '（HDD1 の上限。htmlOS i の「htmlOS を回復」で変えられます）' : '（上限なし。htmlOS i の「htmlOS を回復」で設定できます）') : fmtSize(u.used) + ' / 約 5 MB（ブラウザによって上限は多少違います）'),
            h('h3', null, 'htmlOS i（インストール・アップデート・回復）'),
            h('p', null, 'このHTMLファイルはインストールメディア兼ブートローダです。OS本体は LocalStorage の /sys に展開されていて、起動のたびにそこから読み込まれます。アップデート・システム修復・パスワードのリセット・バックアップ・アンインストールは htmlOS i から行います。'),
            h('p', null, '起動するときに押すキー: 何も押さない → htmlOS ／ Alt → htmlOS i ／ Ctrl → jsh ／ Shift → セーフモード ／ Esc → ブートメニュー ／ Del・F2 → BIOS SETUP'),
            adminNote(),
            h('div', { class: 'st-row' },
              h('button', { class: 'btn', type: 'button', disabled: !admin, onclick: () => OS.reboot('i') }, 'htmlOS i で再起動'),
              h('button', { class: 'btn', type: 'button', onclick: () => OS.reboot('safe') }, 'セーフモードで再起動'),
              h('button', { class: 'btn', type: 'button', disabled: !admin, onclick: async () => { if (await ui.confirm('/sys をメディアの内容で上書きして再起動します。ユーザーとファイルは残ります。/sys を自分で書き換えていた場合、その変更は消えます。', { ok: '修復して再起動', title: 'システム修復' })) OS.reboot('repair'); } }, 'システム修復')));
        }]
      };
      const btns = {};
      Object.keys(pages).forEach(k => { btns[k] = h('button', { class: 'hf-place', type: 'button', onclick: () => show(k) }, OS.icon(pages[k][1], 16), h('span', null, pages[k][0])); nav.append(btns[k]); });
      function show(k) {
        page.textContent = '';
        Object.keys(btns).forEach(x => btns[x].classList.toggle('on', x === k));
        win.setTitle(pages[k][0] + ' — Settings');
        pages[k][2]();
      }
      show(typeof arg === 'string' && pages[arg] ? arg : 'users');
      return win;
    }
  });
})();
