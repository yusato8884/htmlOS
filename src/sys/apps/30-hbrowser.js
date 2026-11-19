/* hBrowser — webブラウザー
   ページの表示には HTUi SDK 3.0 の WebView（OS.htui.WebView）を使います。
   直接モード: iframe にそのまま表示（速いが、埋め込みを拒否するサイトは真っ白になる）
   プロキシモード: CORSプロキシ経由でHTMLを取得して表示（埋め込み拒否のサイトも読める。スクリプトの多いサイトは崩れる）
   ダウンロードは hFS の ~/Downloads に保存します。 */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const DEFAULT_MARKS = [
    { title: 'Wikipedia', url: 'https://ja.wikipedia.org/' },
    { title: 'example.com', url: 'https://example.com/' },
    { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org/export/embed.html?bbox=139.50,35.68,139.62,35.73&layer=mapnik' },
    { title: 'welcome.html（hFS）', url: 'hfs:~/Documents/welcome.html' }
  ];

  OS.registerApp({
    id: 'hbrowser', name: 'hBrowser', icon: 'globe', color: '#1c71d8', desc: 'webブラウザー',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user), cfgPath = home + '/.config/hbrowser.json';
      let cfg = { marks: DEFAULT_MARKS, proxy: false };
      try { cfg = Object.assign(cfg, JSON.parse(fsx.read(cfgPath))); } catch (e) { /* 初回 */ }
      const saveCfg = () => { try { fsx.mkdir(home + '/.config', { parents: true }); fsx.write(cfgPath, JSON.stringify(cfg, null, 1)); } catch (e) { /* 保存できなくても続行 */ } };

      // キャプションボタン（HTUi SDK 3.0）: ブックマークとプロキシをタイトルバーにも置く
      const win = OS.htui.open({ title: 'hBrowser', icon: 'globe', w: 860, h: 540, app: 'hbrowser', buttons: [
        { icon: 'star', title: 'このページをブックマーク', onclick: () => addMark() },
        { icon: 'shield', title: 'プロキシモード（埋め込みを拒否するサイトも表示）', toggle: true, on: !!cfg.proxy, onclick: (e, on) => setProxy(on) }
      ] });
      const hist = []; let hi = -1, cur = 'about:home';
      const url = h('input', { class: 'inp hb-url', id: 'hb-url-' + win.pid, placeholder: 'URL、検索語、または hFS のパス（/home/…）', 'aria-label': 'アドレス', spellcheck: 'false' });
      const status = h('span', { class: 'grow' });
      const wv = OS.htui.WebView({
        proxy: cfg.proxy, label: 'ページ',
        onstatus: t => { status.textContent = t; },
        onnavigate: u => go(u),
        ondownload: u => download(u),
        onerror: (e, u, forced) => {
          showMsg('ページを取得できませんでした', [u, e.message, 'プロキシは外部の無料サービスです。止まっている場合は、設定 → ネットワーク で別のプロキシに変更できます。'],
            [h('button', { class: 'btn', type: 'button', onclick: () => go(cur, false) }, '再試行'),
              u.startsWith('hfs:') || forced ? null : h('button', { class: 'btn', type: 'button', onclick: () => setProxy(false) }, '直接モードに切り替え')]);
          return true;
        }
      });
      const tb = (icon, title, fn) => h('button', { class: 'tbtn', type: 'button', title: title, 'aria-label': title, onclick: fn }, OS.icon(icon, 16));
      const bBack = tb('back', '戻る', () => { if (hi > 0) go(hist[--hi], false); });
      const bFwd = tb('fwd', '進む', () => { if (hi < hist.length - 1) go(hist[++hi], false); });
      const bProxy = h('button', { class: 'tbtn', type: 'button', title: 'プロキシモード: 埋め込みを拒否するサイトをCORSプロキシ経由で表示します', onclick: () => setProxy(!cfg.proxy) }, OS.icon('shield', 16), 'プロキシ');
      win.body.append(
        h('form', { class: 'toolbar', onsubmit: e => { e.preventDefault(); go(url.value); } },
          bBack, bFwd, tb('reload', '再読み込み', () => go(cur, false)), tb('home', 'ホーム', () => go('about:home')),
          h('span', { class: 'grow' }, url), bProxy,
          tb('star', 'このページをブックマーク', addMark),
          h('button', { class: 'tbtn', type: 'button', title: 'ダウンロード', 'aria-label': 'ダウンロード', onclick: e => OS.htui.menu(e.currentTarget, [
            { label: 'このページのHTMLを保存', icon: 'save', act: savePage },
            { label: 'URLを指定してダウンロード', icon: 'download', act: async () => { const u = await ui.prompt('ダウンロードするURL', /^https?:/.test(cur) ? cur : 'https://', { title: 'ダウンロード' }); if (u) download(u); } },
            { label: 'Downloads フォルダを開く', icon: 'folder', act: () => OS.htui.run('hfile', home + '/Downloads') }
          ], true) }, OS.icon('download', 16))));
      wv.attach(win);
      win.body.append(h('div', { class: 'statusbar' }, status));

      function setProxy(on) {
        cfg.proxy = !!on; wv.proxy = cfg.proxy; saveCfg(); paint(); go(cur, false);
      }
      function paint() {
        bBack.disabled = hi <= 0; bFwd.disabled = hi >= hist.length - 1;
        bProxy.classList.toggle('on', !!cfg.proxy);
        if (win.captionButtons && win.captionButtons[1]) win.captionButtons[1].active = !!cfg.proxy;
      }
      function showMsg(title, lines, actions) {
        wv.show(h('div', { class: 'hb-page' }, h('h1', null, title), lines.map(l => h('p', null, l)), h('div', { class: 'hb-marks' }, actions || [])));
      }

      function go(u, push) {
        u = String(u || '').trim();
        u = !u || u === 'about:home' ? 'about:home' : wv.resolve(u);
        if (push !== false) { hist.splice(hi + 1); hist.push(u); hi = hist.length - 1; }
        cur = u; url.value = u === 'about:home' ? '' : u;
        paint(); status.textContent = '';
        win.setTitle((u === 'about:home' ? 'ホーム' : u.replace(/^https?:\/\//, '').replace(/^hfs:/, '')) + ' — hBrowser');
        if (u === 'about:home') return homePage();
        return wv.load(u).then(() => { if (wv.url && wv.url !== cur) { cur = wv.url; url.value = cur; } });
      }

      function homePage() {
        const q = h('input', { class: 'inp', id: 'hb-q-' + win.pid, placeholder: 'URL または検索語', 'aria-label': 'URL または検索語' });
        const marks = h('div', { class: 'hb-marks' });
        cfg.marks.forEach((m, i) => marks.append(h('span', { class: 'hb-mark' },
          h('button', { class: 'btn', type: 'button', title: m.url, onclick: () => go(m.url) }, m.title),
          h('button', { class: 'del', type: 'button', title: 'ブックマークを削除', 'aria-label': m.title + ' を削除', onclick: () => { cfg.marks.splice(i, 1); saveCfg(); homePage(); } }, OS.icon('x', 12)))));
        wv.show(h('div', { class: 'hb-page' }, h('h1', null, 'hBrowser'),
          h('form', { class: 'hb-search', onsubmit: e => { e.preventDefault(); go(q.value); } }, q, h('button', { class: 'btn primary', type: 'submit' }, '開く')),
          marks,
          h('p', null, 'ページが真っ白なときは、ツールバーかタイトルバーの「プロキシ」をオンにすると表示できることがあります（iframeへの埋め込みを拒否しているサイト向け）。検索はプロキシ経由の DuckDuckGo を使います。'),
          h('p', null, 'ダウンロードしたファイルは hFS の ~/Downloads に保存されます。')));
      }

      function addMark() {
        if (cur === 'about:home') { ui.toast('ホーム画面はブックマークできません'); return; }
        if (cfg.marks.some(m => m.url === cur)) { ui.toast('すでにブックマークされています'); return; }
        ui.prompt('ブックマークの名前', cur.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0] || cur, { title: 'ブックマークに追加' }).then(t => { if (t) { cfg.marks.push({ title: t, url: cur }); saveCfg(); ui.toast('ブックマークに追加しました'); } });
      }
      const dlDir = () => { fsx.mkdir(home + '/Downloads', { parents: true }); return home + '/Downloads'; };
      async function savePage() {
        try {
          if (cur === 'about:home') throw new Error('保存するページがありません');
          let html = wv.lastHtml;
          if (html == null) { status.textContent = 'ページを取得しています…'; html = await (await OS.net.get(cur)).text(); }
          let name = 'page.html';
          try { const U = new URL(cur); name = (U.pathname.split('/').filter(Boolean).pop() || U.hostname).replace(/\.[a-z0-9]+$/i, '') + '.html'; } catch (e) { name = path.base(cur.slice(4)); }
          const dest = fsx.unique(path.join(dlDir(), decodeURIComponent(name)));
          fsx.write(dest, html);
          status.textContent = ''; OS.notify({ app: 'hBrowser', icon: 'save', title: 'ページを保存しました', body: dest });
        } catch (e) { status.textContent = ''; ui.alert('保存できませんでした。\n' + e.message); }
      }
      async function download(u) {
        try {
          const U = new URL(u);
          let name = 'download';
          try { name = decodeURIComponent(U.pathname.split('/').filter(Boolean).pop() || U.hostname); } catch (e) { /* そのまま */ }
          status.textContent = 'ダウンロード中: ' + name + ' …';
          const r = await OS.net.get(u), blob = await r.blob();
          if (blob.size > 1500000 && !(await ui.confirm(name + ' は ' + (blob.size / 1048576).toFixed(1) + ' MB あります。保存しますか?', { ok: '保存する' }))) { status.textContent = ''; return; }
          const c = await OS.net.blobToContent(blob, name);
          const dest = fsx.unique(path.join(dlDir(), name));
          fsx.write(dest, c.content, { bin: c.bin });
          status.textContent = ''; OS.notify({ app: 'hBrowser', icon: 'download', title: 'ダウンロードが完了しました', body: dest });
        } catch (e) { status.textContent = ''; ui.alert('ダウンロードできませんでした。\n' + e.message); }
      }

      win.onHibernate = () => ({ cur: cur, hist: hist.slice(-50), hi: Math.min(hi, 49) - Math.max(0, hist.length - 50) });
      const rs = arg && arg.resume;
      if (rs && Array.isArray(rs.hist) && rs.hist.length) { hist.push.apply(hist, rs.hist); hi = Math.max(0, Math.min(rs.hi | 0, hist.length - 1)); go(rs.cur || hist[hi], false); }
      else go(typeof arg === 'string' && arg ? arg : 'about:home');
      return win;
    }
  });
})();
