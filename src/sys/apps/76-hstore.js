/* hStore — パッケージマネージャ
   パッケージ = OS.registerApp(...) を呼ぶ 1 個の .js ファイル。/apps に置かれ、起動のたびに読み込まれる。
   jsh からは  pkg list / pkg install ファイルかURL / pkg remove 名前.js */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;

  const TEMPLATE = [
    '// htmlOS アプリのひな形です。',
    '// hStore の「追加」→「hFS から」でこのファイルを選ぶか、jsh で  pkg install myapp.js  と打つとインストールできます。',
    '// 書き換えたら、もう一度インストールすると上書きされます。',
    'OS.registerApp({',
    "  id: 'myapp', name: 'MyApp', icon: 'star', color: '#2190a4', desc: '自作アプリ',",
    '  launch() {',
    "    const win = OS.htui.open({ title: 'MyApp', icon: 'star', w: 360, h: 240, app: 'myapp' });",
    '    const h = OS.h;   // h(タグ, 属性, 子要素...) で要素を作る小さな関数',
    '    let n = 0;',
    "    const out = h('p', { style: 'font-size:40px;margin:0' }, '0');",
    "    win.body.append(h('div', { style: 'padding:16px;display:flex;flex-direction:column;gap:12px;align-items:flex-start' },",
    "      out, h('button', { class: 'btn primary', type: 'button', onclick: () => { out.textContent = ++n; } }, '+1')));",
    '    return win;',
    '  }',
    '});',
    ''
  ].join('\n');

  // hStore に最初から入っているサンプル
  const CATALOG = [
    { file: 'hclock.js', name: 'hClock', desc: '大きなデジタル時計', code: [
      'OS.registerApp({',
      "  id: 'hclock', name: 'hClock', icon: 'reload', color: '#1c71d8', desc: '時計',",
      '  launch() {',
      "    const win = OS.htui.open({ title: 'hClock', icon: 'reload', w: 340, h: 200, app: 'hclock' });",
      "    const t = OS.h('div', { style: 'font:600 52px/1 var(--mono);font-variant-numeric:tabular-nums' });",
      "    const d = OS.h('div', { style: 'color:var(--ink-2)' });",
      "    win.body.append(OS.h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center' }, t, d));",
      "    const z = n => String(n).padStart(2, '0');",
      "    const tick = () => { const n = new Date(); t.textContent = z(n.getHours()) + ':' + z(n.getMinutes()) + ':' + z(n.getSeconds()); d.textContent = n.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); };",
      '    tick(); const timer = setInterval(tick, 500);',
      '    win.onDispose = () => clearInterval(timer);',
      '    return win;',
      '  }',
      '});', ''].join('\n') },
    { file: 'hcolor.js', name: 'hColor', desc: '色を選んで HEX / RGB を表示', code: [
      'OS.registerApp({',
      "  id: 'hcolor', name: 'hColor', icon: 'image', color: '#e62d42', desc: 'カラーピッカー',",
      '  launch() {',
      "    const win = OS.htui.open({ title: 'hColor', icon: 'image', w: 320, h: 260, app: 'hcolor' });",
      "    const h = OS.h, inp = h('input', { type: 'color', value: '#3584e4', id: 'hcolor-' + win.pid, 'aria-label': '色', style: 'width:100%;height:90px;padding:0;border:0;background:none' });",
      "    const out = h('pre', { style: 'margin:0;font:14px/1.6 var(--mono)' });",
      "    const show = () => { const v = inp.value, r = parseInt(v.slice(1, 3), 16), g = parseInt(v.slice(3, 5), 16), b = parseInt(v.slice(5, 7), 16); out.textContent = 'HEX  ' + v.toUpperCase() + '\\nRGB  ' + r + ', ' + g + ', ' + b + '\\nRGB565  0x' + (((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)).toString(16).toUpperCase().padStart(4, '0'); };",
      "    inp.addEventListener('input', show); show();",
      "    win.body.append(h('div', { style: 'padding:14px;display:flex;flex-direction:column;gap:10px' }, inp, out));",
      '    return win;',
      '  }',
      '});', ''].join('\n') }
  ];

  OS.registerApp({
    id: 'hstore', name: 'hStore', icon: 'box', color: '#ed5b00', desc: 'パッケージマネージャ',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const admin = () => true; // 追加・削除は誰でも始められるが、実行の直前に root のパスワードを確認する
      const win = OS.htui.open({ title: 'hStore', icon: 'box', w: 640, h: 460, app: 'hstore' });
      const pane = h('div', { class: 'pane' });
      let tab = 'list';
      const tabs = { list: 'インストール済み', add: '追加', sample: 'サンプル' }, tabBtns = {};
      win.body.append(h('div', { class: 'tabs' }, Object.keys(tabs).map(k => (tabBtns[k] = h('button', { class: 'tab', type: 'button', onclick: () => { tab = k; render(); } }, tabs[k])))), pane);
      const pc = h('input', { type: 'file', accept: '.js,text/javascript', id: 'hst-file-' + win.pid, style: 'display:none' });
      pc.addEventListener('change', async () => { const f = pc.files[0]; pc.value = ''; if (f) install(f.name, await f.text(), 'PCのファイル ' + f.name); });

      async function install(name, code, source) {
        try {
          const over = OS.pkg.list().includes(name.replace(/[^\w.-]/g, '_'));
          const ok = await ui.modal({ title: 'パッケージのインストール', width: 440, body: [
            h('p', { class: 'modal-msg' }, name + ' をインストールします' + (over ? '（同じ名前のパッケージを上書きします）' : '') + '。\n入手元: ' + source + '\n大きさ: ' + code.length + ' 文字'),
            h('p', { class: 'modal-msg note-warn' }, 'パッケージは htmlOS の中のすべてのファイルと設定を読み書きできます。中身を信頼できるものだけ入れてください。')],
            buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: 'インストール', primary: true, value: true }] });
          if (!ok) return;
          if (!(await ui.asRoot(name + ' をインストールします。'))) return;
          const n = OS.pkg.install(name, code, 'root');
          OS.notify({ app: 'hStore', icon: 'box', title: 'インストールしました', body: n }); tab = 'list'; render();
        } catch (e) { ui.alert(e.message); }
      }
      const pages = {
        list() {
          const rows = Object.values(OS.apps).map(a => h('tr', null,
            h('td', null, h('span', { class: 'app-ico', style: 'width:28px;height:28px;border-radius:7px;background:' + (a.color || '#5e5c64') }, OS.icon(a.icon, 16))),
            h('td', null, h('b', null, a.name), h('br'), h('small', { style: 'color:var(--ink-2)' }, a.desc || '')),
            h('td', null, h('span', { class: 'badge' }, a.pkg ? a.pkg : 'システム')),
            h('td', { class: 'num' }, h('button', { class: 'btn small', type: 'button', onclick: () => OS.htui.run(a.id) }, '起動'), ' ',
              a.pkg ? h('button', { class: 'btn small danger', type: 'button', disabled: !admin(), onclick: async () => {
                if (!(await ui.confirm(a.pkg + '（' + a.name + '）を削除しますか?', { ok: '削除', danger: true, title: 'パッケージの削除' }))) return;
                if (!(await ui.asRoot(a.pkg + ' を削除します。'))) return;
                try { OS.htui.wins.filter(w => w.app === a.id).forEach(w => w.close(true)); OS.pkg.remove(a.pkg, 'root'); render(); } catch (e) { ui.alert(e.message); }
              } }, '削除') : null)));
          pane.append(h('p', null, 'システムのアプリは /sys/apps、あとから入れたパッケージは /apps にあります。'), h('table', { class: 'tbl' }, h('tbody', null, rows)));
        },
        add() {
          pane.append(
            h('p', { class: 'note-warn' }, 'パッケージの追加と削除には root のパスワードが必要です。'),
            h('h3', null, 'パッケージを追加'),
            h('p', null, 'パッケージは OS.registerApp(…) を呼ぶ1個の .js ファイルです。入れたアプリは全ユーザーのデスクトップに出ます。'),
            h('div', { class: 'st-row' },
              h('button', { class: 'btn', type: 'button', disabled: !admin(), onclick: async () => { const p = await ui.pickFile({ mode: 'open', dir: home + '/Documents', title: 'パッケージ（.js）を選ぶ' }); if (p) { try { install(path.base(p), fsx.read(p), 'hFS ' + p); } catch (e) { ui.alert(e.message); } } } }, OS.icon('folder', 16), 'hFS から'),
              h('button', { class: 'btn', type: 'button', disabled: !admin(), onclick: () => pc.click() }, OS.icon('upload', 16), 'PC から'),
              h('button', { class: 'btn', type: 'button', disabled: !admin(), onclick: async () => {
                const u = await ui.prompt('パッケージ（.js）のURL', 'https://', { title: 'URL から追加' }); if (!u) return;
                try { const code = await (await OS.net.get(u)).text(); install(decodeURIComponent(new URL(u).pathname.split('/').pop()) || 'package.js', code, u); } catch (e) { ui.alert(e.message); }
              } }, OS.icon('globe', 16), 'URL から'), pc),
            h('h3', null, '自分で作る'),
            h('p', null, 'ひな形を ~/Documents/myapp.js に作って hedit で開きます。保存したら「hFS から」で選ぶとインストールできます。'),
            h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: () => {
              try { const p = fsx.unique(home + '/Documents/myapp.js'); fsx.write(p, TEMPLATE); OS.htui.run('hedit', p); } catch (e) { ui.alert(e.message); }
            } }, 'ひな形を作って hedit で開く')));
        },
        sample() {
          const have = OS.pkg.list();
          pane.append(h('p', null, 'hStore に同梱されている小さなサンプルです。インストールすると /apps にソースが置かれるので、作り方の参考にもなります。'),
            h('table', { class: 'tbl' }, h('tbody', null, CATALOG.map(c => h('tr', null,
              h('td', null, h('b', null, c.name), h('br'), h('small', { style: 'color:var(--ink-2)' }, c.desc)),
              h('td', null, h('span', { class: 'badge' }, have.includes(c.file) ? 'インストール済み' : c.file)),
              h('td', { class: 'num' }, h('button', { class: 'btn small', type: 'button', disabled: !admin(), onclick: () => install(c.file, c.code, 'hStore 同梱のサンプル') }, have.includes(c.file) ? '入れ直す' : 'インストール')))))));
        }
      };
      function render() {
        pane.textContent = '';
        Object.keys(tabBtns).forEach(k => tabBtns[k].classList.toggle('on', k === tab));
        const before = pane.childNodes.length; pages[tab]();
        Array.from(pane.childNodes).slice(before).forEach(n => { if (n.nodeType === 3 && n.nodeValue === 'null') n.remove(); });
      }
      win.onFocus = () => { if (tab === 'list') render(); };
      render();
      return win;
    }
  });
})();
