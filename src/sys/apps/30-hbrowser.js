/* hBrowser — webブラウザー
   直接モード: iframe にそのまま表示（速いが、埋め込みを拒否するサイトは真っ白になる）
   プロキシモード: CORSプロキシ経由でHTMLを取得して表示（埋め込み拒否のサイトも読める。スクリプトの多いサイトは崩れる）
   ダウンロードは hFS（LocalStorage）の ~/Downloads に保存します。 */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const DEFAULT_MARKS = [
    { title: 'Wikipedia', url: 'https://ja.wikipedia.org/' },
    { title: 'example.com', url: 'https://example.com/' },
    { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org/export/embed.html?bbox=139.50,35.68,139.62,35.73&layer=mapnik' },
    { title: 'welcome.html（hFS）', url: 'hfs:~/Documents/welcome.html' }
  ];
  const DL_EXT = /\.(zip|gz|tgz|7z|rar|pdf|mp3|wav|flac|m4a|mp4|webm|mov|uf2|bin|hex|iso|deb|exe|apk)$/i;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // プロキシ表示したページの中で動かす小さなスクリプト（リンクとフォームを親に伝える）
  function pageAgent() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var raw = a.getAttribute('href') || '';
      if (raw.charAt(0) === '#') {
        e.preventDefault();
        var t = document.getElementById(raw.slice(1)) || document.getElementsByName(raw.slice(1))[0];
        if (t) t.scrollIntoView();
        return;
      }
      if (!/^https?:/i.test(a.href)) return;
      e.preventDefault();
      parent.postMessage({ hbrowser: 1, nav: a.href, dl: a.hasAttribute('download') }, '*');
    }, true);
    document.addEventListener('submit', function (e) {
      var f = e.target; e.preventDefault();
      if ((f.getAttribute('method') || 'get').toLowerCase() !== 'get') { parent.postMessage({ hbrowser: 1, note: 'post' }, '*'); return; }
      var u = new URL(f.getAttribute('action') || '', document.baseURI);
      u.search = '';
      new FormData(f).forEach(function (v, k) { if (typeof v === 'string') u.searchParams.append(k, v); });
      parent.postMessage({ hbrowser: 1, nav: u.href }, '*');
    }, true);
  }

  OS.registerApp({
    id: 'hbrowser', name: 'hBrowser', icon: 'globe', color: '#1c71d8', desc: 'webブラウザー',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user), cfgPath = home + '/.config/hbrowser.json';
      let cfg = { marks: DEFAULT_MARKS, proxy: false };
      try { cfg = Object.assign(cfg, JSON.parse(fsx.read(cfgPath))); } catch (e) { /* 初回 */ }
      const saveCfg = () => { try { fsx.mkdir(home + '/.config', { parents: true }); fsx.write(cfgPath, JSON.stringify(cfg, null, 1)); } catch (e) { /* 保存できなくても続行 */ } };

      const win = OS.htui.open({ title: 'hBrowser', icon: 'globe', w: 860, h: 540, app: 'hbrowser' });
      const hist = []; let hi = -1, cur = 'about:home', frame = null, lastHtml = null, seq = 0;
      const url = h('input', { class: 'inp hb-url', id: 'hb-url-' + win.pid, placeholder: 'URL、検索語、または hFS のパス（/home/…）', 'aria-label': 'アドレス', spellcheck: 'false' });
      const view = h('div', { class: 'hb-view' }), status = h('span', { class: 'grow' });
      const tb = (icon, title, fn) => h('button', { class: 'tbtn', type: 'button', title: title, 'aria-label': title, onclick: fn }, OS.icon(icon, 16));
      const bBack = tb('back', '戻る', () => { if (hi > 0) go(hist[--hi], false); });
      const bFwd = tb('fwd', '進む', () => { if (hi < hist.length - 1) go(hist[++hi], false); });
      const bProxy = h('button', { class: 'tbtn', type: 'button', title: 'プロキシモード: 埋め込みを拒否するサイトをCORSプロキシ経由で表示します', onclick: () => { cfg.proxy = !cfg.proxy; saveCfg(); paint(); go(cur, false); } }, OS.icon('shield', 16), 'プロキシ');
      win.body.append(
        h('form', { class: 'toolbar', onsubmit: e => { e.preventDefault(); go(url.value); } },
          bBack, bFwd, tb('reload', '再読み込み', () => go(cur, false)), tb('home', 'ホーム', () => go('about:home')),
          h('span', { class: 'grow' }, url), bProxy,
          tb('star', 'このページをブックマーク', addMark),
          h('button', { class: 'tbtn', type: 'button', title: 'ダウンロード', 'aria-label': 'ダウンロード', onclick: e => OS.htui.menu(e.currentTarget, [
            { label: 'このページのHTMLを保存', icon: 'save', act: savePage },
            { label: 'URLを指定してダウンロード', icon: 'download', act: async () => { const u = await ui.prompt('ダウンロードするURL', /^https?:/.test(cur) ? cur : 'https://', { title: 'ダウンロード' }); if (u) download(u); } },
            { label: 'Downloads フォルダを開く', icon: 'folder', act: () => OS.htui.run('hfile', home + '/Downloads') }
          ], true) }, OS.icon('download', 16))),
        view, h('div', { class: 'statusbar' }, status));

      function paint() {
        bBack.disabled = hi <= 0; bFwd.disabled = hi >= hist.length - 1;
        bProxy.classList.toggle('on', !!cfg.proxy);
      }
      function fix(u) {
        u = String(u || '').trim();
        if (!u) return 'about:home';
        if (/^hfs:/i.test(u)) return 'hfs:' + path.norm(u.slice(4), '/', home);
        if (/^(about:|https?:\/\/)/i.test(u)) return u;
        if (u.startsWith('/') || u.startsWith('~')) return 'hfs:' + path.norm(u, '/', home);
        if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(u) || /^localhost(:\d+)?(\/\S*)?$/.test(u)) return 'https://' + u;
        return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(u);
      }
      function mkFrame(sandbox) {
        view.textContent = '';
        frame = h('iframe', { sandbox: sandbox, title: 'ページ', referrerpolicy: 'no-referrer' });
        view.append(frame);
        return frame;
      }
      function showMsg(title, lines, actions) {
        frame = null; view.textContent = '';
        view.append(h('div', { class: 'hb-page' }, h('h1', null, title), lines.map(l => h('p', null, l)), h('div', { class: 'hb-marks' }, actions || [])));
      }

      async function go(u, push) {
        u = fix(u);
        // DuckDuckGo の検索結果リンクは転送URLなので中身を取り出す
        try { const U = new URL(u); if (/duckduckgo\.com$/.test(U.hostname) && U.pathname === '/l/' && U.searchParams.get('uddg')) u = U.searchParams.get('uddg'); } catch (e) { /* URLでない */ }
        if (push !== false) { hist.splice(hi + 1); hist.push(u); hi = hist.length - 1; }
        cur = u; url.value = u === 'about:home' ? '' : u; lastHtml = null;
        const my = ++seq;
        paint(); status.textContent = '';
        win.setTitle((u === 'about:home' ? 'ホーム' : u.replace(/^https?:\/\//, '')) + ' — hBrowser');
        if (u === 'about:home') return homePage();
        if (u.startsWith('hfs:')) return localPage(u.slice(4));
        const forceProxy = /(^|\.)duckduckgo\.com$/.test(new URL(u).hostname);
        if (!cfg.proxy && !forceProxy) {
          mkFrame('allow-scripts allow-same-origin allow-forms allow-popups').src = u;
          status.textContent = '直接モードで表示中。真っ白のままなら、サイトが埋め込みを拒否しています。「プロキシ」をオンにしてください。';
          return;
        }
        showMsg('読み込み中…', [u]);
        status.textContent = 'プロキシ経由で取得しています…';
        try {
          const r = await OS.net.get(u, { direct: false });
          const type = (r.headers.get('content-type') || '').toLowerCase();
          const buf = await r.arrayBuffer();
          if (my !== seq) return;
          if (/^(image|audio|video)\//.test(type)) {
            const c = await OS.net.blobToContent(new Blob([buf], { type: type }), 'x.bin');
            view.textContent = ''; frame = null;
            view.append(h('div', { class: 'hb-page' }, h(type.startsWith('image') ? 'img' : type.startsWith('audio') ? 'audio' : 'video', { src: c.content, controls: true, style: 'max-width:100%' })));
          } else {
            let cs = (type.match(/charset=([\w-]+)/) || [])[1];
            const m = new TextDecoder('latin1').decode(buf.slice(0, 4096)).match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
            if (m) cs = m[1];
            let text; try { text = new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { text = new TextDecoder().decode(buf); }
            lastHtml = text;
            if (/html|xml/.test(type) || /^\s*<(!doctype|html|head|body)/i.test(text)) {
              const inj = '<base href="' + esc(u) + '"><scr' + 'ipt>(' + String(pageAgent) + ')();</scr' + 'ipt>';
              let doc = text.replace(/<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options|refresh)[^>]*>/gi, '');
              doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, x => x + inj) : inj + doc;
              mkFrame('allow-scripts allow-forms').srcdoc = doc;
            } else { view.textContent = ''; frame = null; view.append(h('pre', { class: 'hb-pre' }, text)); }
          }
          status.textContent = 'プロキシモードで表示中（' + Math.round(buf.byteLength / 1024) + ' KB）。ログインが必要なページやスクリプト主体のサイトは正しく動きません。';
        } catch (e) {
          if (my !== seq) return;
          status.textContent = '';
          showMsg('ページを取得できませんでした', [u, e.message, 'プロキシは外部の無料サービスです。止まっている場合は、設定 → ネットワーク で別のプロキシに変更できます。'],
            [h('button', { class: 'btn', type: 'button', onclick: () => go(cur, false) }, '再試行'),
              h('button', { class: 'btn', type: 'button', onclick: () => { cfg.proxy = false; saveCfg(); paint(); if (!forceProxy) go(cur, false); } }, '直接モードに切り替え')]);
        }
      }

      function homePage() {
        frame = null; view.textContent = '';
        const q = h('input', { class: 'inp', id: 'hb-q-' + win.pid, placeholder: 'URL または検索語', 'aria-label': 'URL または検索語' });
        const marks = h('div', { class: 'hb-marks' });
        cfg.marks.forEach((m, i) => marks.append(h('span', { class: 'hb-mark' },
          h('button', { class: 'btn', type: 'button', title: m.url, onclick: () => go(m.url) }, m.title),
          h('button', { class: 'del', type: 'button', title: 'ブックマークを削除', 'aria-label': m.title + ' を削除', onclick: () => { cfg.marks.splice(i, 1); saveCfg(); homePage(); } }, OS.icon('x', 12)))));
        view.append(h('div', { class: 'hb-page' }, h('h1', null, 'hBrowser'),
          h('form', { class: 'hb-search', onsubmit: e => { e.preventDefault(); go(q.value); } }, q, h('button', { class: 'btn primary', type: 'submit' }, '開く')),
          marks,
          h('p', null, 'ページが真っ白なときは、ツールバーの「プロキシ」をオンにすると表示できることがあります（iframeへの埋め込みを拒否しているサイト向け）。検索はプロキシ経由の DuckDuckGo を使います。'),
          h('p', null, 'ダウンロードしたファイルは hFS の ~/Downloads（LocalStorage）に保存されます。容量は全体で約5MBです。')));
      }
      function localPage(p) {
        try {
          const k = fsx.kind(p), s = fsx.stat(p);
          if (!s || s.t !== 'f') throw new Error(p + ': そのようなファイルはありません');
          if (k === 'html') { lastHtml = s.c; mkFrame('allow-scripts').srcdoc = s.c; }
          else if (k === 'image') { frame = null; view.textContent = ''; view.append(h('div', { class: 'hb-page' }, h('img', { src: fsx.dataURL(p), alt: path.base(p), style: 'max-width:100%' }))); }
          else if (s.b) throw new Error(path.base(p) + ' は hBrowser では表示できません');
          else { frame = null; view.textContent = ''; view.append(h('pre', { class: 'hb-pre' }, s.c)); }
          status.textContent = 'hFS（LocalStorage）上のファイルを表示中';
        } catch (e) { showMsg('表示できません', [e.message]); }
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
          let html = lastHtml;
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
          if (blob.size > 1500000 && !(await ui.confirm(name + ' は ' + (blob.size / 1048576).toFixed(1) + ' MB あります。LocalStorage（全体で約5MB）に入りきらない可能性があります。保存しますか?', { ok: '保存する' }))) { status.textContent = ''; return; }
          const c = await OS.net.blobToContent(blob, name);
          const dest = fsx.unique(path.join(dlDir(), name));
          fsx.write(dest, c.content, { bin: c.bin });
          status.textContent = ''; OS.notify({ app: 'hBrowser', icon: 'download', title: 'ダウンロードが完了しました', body: dest });
        } catch (e) { status.textContent = ''; ui.alert('ダウンロードできませんでした。\n' + e.message); }
      }

      const onMsg = e => {
        if (!frame || e.source !== frame.contentWindow || !e.data || e.data.hbrowser !== 1) return;
        if (e.data.note === 'post') { ui.toast('プロキシモードではフォーム送信（POST）はできません'); return; }
        if (typeof e.data.nav !== 'string' || !/^https?:/i.test(e.data.nav)) return;
        if (e.data.dl || DL_EXT.test(e.data.nav.split(/[?#]/)[0])) download(e.data.nav); else go(e.data.nav);
      };
      window.addEventListener('message', onMsg);
      win.onDispose = () => window.removeEventListener('message', onMsg);
      go(typeof arg === 'string' && arg ? arg : 'about:home');
      return win;
    }
  });
})();
