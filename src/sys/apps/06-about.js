/* バージョン情報（id: about）— htmlOS のバージョン・ビルド番号・UI 環境・ユーザー・起動ディスク・uname・クレジットを出す。
   アプリの一覧には出さない（hidden）。Terminal の htosver から開く（CUI では htosver が同じ情報を文字で出す。OS.about を使う） */
(function () {
  const OS = window.OS, h = OS.h;
  const LOGO = [["     __      __  __     ", "  _     _             _  ___  ____  "], ["    / /     / /  \\ \\    ", " | |__ | |_ _ __ ___ | |/ _ \\/ ___| "], ["   / /     / /    \\ \\   ", " | '_ \\| __| '_ ` _ \\| | | | \\___ \\ "], ["   \\ \\    / /     / /   ", " | | | | |_| | | | | | | |_| |___) |"], ["    \\_\\  /_/     /_/    ", " |_| |_|\\__|_| |_| |_|_|\\___/|____/ "]];
  const CREDITS = ["監督: Yu Sato", "制作: Claude", "ロゴ: Claude", "壁紙: Claude", "テーマソング:", "    歌詞: Claude", "    制作: Suno", "(c) 2026 Yu Sato", "このシステムはMITライセンスで公開されています。", "Repo: Github yusato8884/htmlOS"];
  const uname = () => OS.name + ' ' + OS.version + ' [' + OS.htui.sdk.full + '] (' + (OS.store.ram ? 'ramdisk' : OS.store.disk ? 'hdd1' : OS.store.idb ? 'hdd2' : 'localstorage') + ') ' + navigator.userAgent;
  // user: 表示するユーザー（CUI ではそのシェルのユーザー）
  function info(user) {
    let build = ''; try { build = (JSON.parse(OS.store.get('meta')) || {}).build || ''; } catch (e) { /* なし */ }
    const sdk = OS.htui.sdk, ses = OS.htui.running && OS.htui.sessionId ? OS.sessions[OS.htui.sessionId] : null;
    // 版は x.y で出す（HTUi 3 → HTUi 3.0）
    const ver = v => { v = String(v).trim(); return /\./.test(v) ? v : v + '.0'; };
    const name = ses ? String(ses.name || ses.id).replace(/（[^）]*）/g, '').trim().replace(/\s+(\d+(\.\d+)*)$/, (m, v) => ' ' + ver(ses.version || v)) : '';
    const de = ses ? name + (ses.codename && String(ses.name || '').indexOf(ses.codename) < 0 ? ' ' + ses.codename : '') + ' (' + sdk.name + ' ' + String(sdk.version).split('.').slice(0, 2).join('.') + ' ' + sdk.codename + ')' : 'jsh';
    const st = OS.store, disk = st.disk ? 'HDD1 PC のフォルダ「' + st.name + '」' : st.idb ? 'HDD2 IndexedDB' : st.ram ? 'RAM ディスク' : 'HDD0 LocalStorage';
    return { title: 'htmlOS ' + OS.version + (OS.codename ? ' ' + OS.codename : ''),
      rows: [['ビルド番号', String(build || window.BOOT.build)], ['UI環境', de], ['ユーザー', user || OS.htui.user || '-'], ['起動ディスク', disk]] };
  }
  // ロゴ（そのバージョンの星座の壁紙を背景に）
  const logo = size => { const star = OS.htui.starWallpaper ? OS.htui.starWallpaper() : null; return h('div', { class: 'hv-logo' + (star ? ' star' : ''), style: star ? 'background:' + star : null }, OS.mark(size)); };
  OS.about = { logo: LOGO, credits: CREDITS, uname: uname, info: info };

  OS.registerApp({
    id: 'about', name: 'バージョン情報', icon: 'star', color: '#1c71d8', hidden: true, desc: 'htmlOS のバージョン情報',
    launch() {
      const ex = OS.htui.wins.find(w => w.app === 'about');
      if (ex) { ex.focus(); return ex; }
      const win = OS.htui.open({ title: 'バージョン情報', icon: 'star', w: 420, h: 'auto', dialog: true, app: 'about' });
      const inf = info(OS.htui.user);
      const un = h('pre', { class: 'hv-uname', id: 'hv-uname', hidden: true }, uname());
      const showBtn = h('button', { class: 'btn', type: 'button', id: 'hv-uname-btn', onclick: () => { un.hidden = !un.hidden; showBtn.textContent = un.hidden ? '表示' : '隠す'; } }, '表示');
      const credits = () => OS.ui.modal({ parent: win, title: 'クレジット', width: 340, body: h('div', { class: 'hv hv-credits', id: 'hv-credits' }, logo(48), h('div', { class: 'hv-title' }, inf.title), h('pre', null, CREDITS.join('\n'))),
        buttons: [{ label: 'OK', primary: true, cancel: true, value: true }] });
      const ok = h('button', { class: 'btn primary', type: 'button', id: 'hv-ok', onclick: () => win.close() }, 'OK');
      win.body.append(h('div', { class: 'hv hv-app', id: 'hv-about' },
        logo(72),
        h('div', { class: 'hv-title' }, inf.title),
        h('dl', { class: 'hv-rows' }, inf.rows.map(r => [h('dt', null, r[0]), h('dd', null, r[1])]).flat(), h('dt', null, 'uname'), h('dd', null, showBtn)),
        un,
        h('div', { class: 'hv-foot' }, h('button', { class: 'btn', type: 'button', id: 'hv-credits-btn', onclick: credits }, 'クレジット...'), ok)));
      setTimeout(() => ok.focus(), 0);
      return win;
    }
  });
})();
