/* バージョン情報（OS.about）— htmlOS のバージョン・ビルド番号・UI 環境・ユーザー・起動ディスク・uname・クレジット。
   設定の「システム」（GUI）と、Terminal の htosver（CUI では文字で出す）が使う。
   6.2.2 では独立したアプリ「バージョン情報」だったが、6.2.3 で設定の「システム」にまとめた */
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
    return { title: 'htmlOS ' + OS.version + (OS.codename ? ' ' + OS.codename : ''), build: String(build || window.BOOT.build), user: user || OS.htui.user || '-', disk: disk,
      env: ses ? name + (ses.codename && String(ses.name || '').indexOf(ses.codename) < 0 ? ' ' + ses.codename : '') : 'jsh',
      rows: [['ビルド番号', String(build || window.BOOT.build)], ['UI環境', de], ['ユーザー', user || OS.htui.user || '-'], ['起動ディスク', disk]] };
  }
  // ロゴ（そのバージョンの星座の壁紙を背景に）
  const logo = size => { const star = OS.htui.starWallpaper ? OS.htui.starWallpaper() : null; return h('div', { class: 'hv-logo' + (star ? ' star' : ''), style: star ? 'background:' + star : null }, OS.mark(size)); };
  // クレジットのダイアログ（parent: 持ち主のウインドウ）
  const showCredits = parent => OS.ui.modal({ parent: parent, title: 'クレジット', width: 340, body: h('div', { class: 'hv hv-credits', id: 'hv-credits' }, logo(48), h('div', { class: 'hv-title' }, info().title), h('pre', null, CREDITS.join('\n'))),
    buttons: [{ label: 'OK', primary: true, cancel: true, value: true }] });
  OS.about = { logo: LOGO, credits: CREDITS, uname: uname, info: info, logoEl: logo, showCredits: showCredits };
})();
