/* htmlOS kernel — ファイルシステム / ユーザー / 設定 / tty / 起動処理
   このファイルは LocalStorage 上の /sys/kernel.js から読み込まれて実行されます。 */
(function () {
  'use strict';
  const BOOT = window.BOOT, store = BOOT.store;
  const OS = window.OS = { version: BOOT.installedVersion, apps: {}, store: store };

  // ---------- DOM ヘルパー
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    let val;
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'value') val = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    const add = c => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else e.append(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    if (val !== undefined) e.value = val;
    return e;
  }
  OS.h = h;

  const ICONS = {
    terminal: '<path d="M4 6l5 5-5 5M12 17h8"/>',
    edit: '<path d="M5 3h10l4 4v14H5zM8 10h8M8 14h8M8 18h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    folder: '<path d="M3 6h6l2 2.5h10V19H3z"/>',
    gear: '<path d="M9.8 4.9 L10.3 2.6 L13.7 2.6 L14.2 4.9 L15.5 5.5 L17.5 4.1 L19.9 6.5 L18.5 8.5 L19.1 9.8 L21.4 10.3 L21.4 13.7 L19.1 14.2 L18.5 15.5 L19.9 17.5 L17.5 19.9 L15.5 18.5 L14.2 19.1 L13.7 21.4 L10.3 21.4 L9.8 19.1 L8.5 18.5 L6.5 19.9 L4.1 17.5 L5.5 15.5 L4.9 14.2 L2.6 13.7 L2.6 10.3 L4.9 9.8 L5.5 8.5 L4.1 6.5 L6.5 4.1 L8.5 5.5Z"/><circle cx="12" cy="12" r="3.2"/>',
    file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
    text: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
    image: '<rect x="3" y="5" width="18" height="14"/><path d="M3 17l5-5 4 4 3-3 6 5"/><circle cx="16" cy="9.5" r="1.3"/>',
    audio: '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    video: '<rect x="3" y="5" width="18" height="14"/><path d="M10 9l5 3-5 3z"/>',
    html: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>',
    back: '<path d="M15 5l-7 7 7 7"/>', fwd: '<path d="M9 5l7 7-7 7"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    star: '<path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-3-5.5 3 1-6.1L3 9.5l6.3-.9z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', min: '<path d="M6 17h12"/>', max: '<rect x="6" y="6" width="12" height="12"/>',
    power: '<path d="M12 3v9M6.5 6.5a8 8 0 1 0 11 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    brush: '<path d="M4 20c3 0 5-1 5-4a3 3 0 0 0-3-3c-2 0-2 3-4 4 0 2 1 3 2 3zM9 14L20 3l1 1-11 11"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
    archive: '<rect x="3" y="4" width="18" height="5"/><path d="M5 9v11h14V9M10 13h4"/>',
    plug: '<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    tablet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M18.5 11v2"/>',
    cursor: '<path d="M5 3l14 8.5-6.2 1.6 3.6 6.3-2.6 1.5-3.6-6.3L5.6 19z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
    win: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>', // htmlOS のマーク </>（Windows 風の環境のスタートに使う）
    down: '<path d="M6 9l6 6 6-6"/>',
    grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>'
  };
  OS.icon = function (name, size) {
    size = size || 18;
    return h('span', { class: 'ico', 'aria-hidden': 'true', html: '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.file) + '</svg>' });
  };

  // ---------- パス
  const path = OS.path = {
    norm(p, cwd, home) {
      p = String(p == null ? '.' : p);
      if (p === '~' || p.startsWith('~/')) p = (home || '/') + p.slice(1);
      if (!p.startsWith('/')) p = (cwd || '/') + '/' + p;
      const out = [];
      for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
      return '/' + out.join('/');
    },
    dir(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); },
    base(p) { return p.slice(p.lastIndexOf('/') + 1); },
    ext(p) { const b = path.base(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; },
    join(a, b) { return path.norm(b, a); }
  };

  // ---------- ファイルシステム (1ノード = LocalStorageの1キー "htmlos:f:<path>")
  const K = p => 'f:' + p;
  const KINDS = {
    text: 'txt md js jsh json css log conf csv xml sh py c h ini yml yaml toml'.split(' '),
    html: ['html', 'htm'],
    image: 'png jpg jpeg gif webp svg bmp ico avif'.split(' '),
    audio: 'mp3 wav ogg oga m4a flac aac opus'.split(' '),
    video: 'mp4 webm ogv mov m4v'.split(' ')
  };
  const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json' };
  function put(p, node) {
    try { store.set(K(p), JSON.stringify(node)); }
    catch (e) { throw new Error('ストレージの空き容量が足りません（LocalStorageの上限は約5MBです）'); }
  }
  const fs = OS.fs = {
    stat(p) { const v = store.get(K(p)); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } },
    exists(p) { return store.get(K(p)) != null; },
    isDir(p) { const s = fs.stat(p); return !!s && s.t === 'd'; },
    isFile(p) { const s = fs.stat(p); return !!s && s.t === 'f'; },
    list(p) {
      if (!fs.isDir(p)) throw new Error(p + ': ディレクトリではありません');
      const pre = K(p === '/' ? '/' : p + '/'), names = [];
      for (const k of store.keys(pre)) { const r = k.slice(pre.length); if (r && !r.includes('/')) names.push(r); }
      return names.sort((a, b) => a.localeCompare(b));
    },
    read(p) {
      const s = fs.stat(p);
      if (!s) throw new Error(p + ': そのようなファイルはありません');
      if (s.t === 'd') throw new Error(p + ': ディレクトリです');
      return s.c;
    },
    write(p, c, opt) {
      opt = opt || {};
      if (p === '/') throw new Error('/ には書き込めません');
      const d = path.dir(p);
      if (!fs.isDir(d)) throw new Error(d + ': ディレクトリがありません');
      const old = fs.stat(p);
      if (old && old.t === 'd') throw new Error(p + ': ディレクトリです');
      const node = { t: 'f', c: String(c), m: Date.now(), o: opt.owner || (old && old.o) || 'root' };
      if (opt.bin) node.b = 1;
      put(p, node);
    },
    mkdir(p, opt) {
      opt = opt || {};
      if (fs.exists(p)) { if (fs.isDir(p) && opt.parents) return; throw new Error(p + ': すでに存在します'); }
      const d = path.dir(p);
      if (!fs.isDir(d)) { if (opt.parents) fs.mkdir(d, opt); else throw new Error(d + ': ディレクトリがありません'); }
      put(p, { t: 'd', m: Date.now(), o: opt.owner || 'root' });
    },
    rm(p, opt) {
      opt = opt || {};
      if (p === '/') throw new Error('/ は削除できません');
      const s = fs.stat(p);
      if (!s) throw new Error(p + ': そのようなファイルはありません');
      if (s.t === 'd') {
        if (fs.list(p).length && !opt.recursive) throw new Error(p + ': ディレクトリが空ではありません（-r が必要です）');
        store.keys(K(p + '/')).forEach(k => store.del(k));
      }
      store.del(K(p));
    },
    _cp(a, b, owner) {
      const s = fs.stat(a);
      if (s.t === 'd') { fs.mkdir(b, { parents: true, owner: owner || s.o }); for (const n of fs.list(a)) fs._cp(a + '/' + n, b + '/' + n, owner); }
      else put(b, Object.assign({}, s, { m: Date.now(), o: owner || s.o }));
    },
    dest(a, b) { return fs.isDir(b) ? path.join(b, path.base(a)) : b; },
    cp(a, b, opt) {
      if (!fs.exists(a)) throw new Error(a + ': そのようなファイルはありません');
      b = fs.dest(a, b);
      if (b === a || b.startsWith(a + '/')) throw new Error('自分自身の中にはコピーできません');
      if (!fs.isDir(path.dir(b))) throw new Error(path.dir(b) + ': ディレクトリがありません');
      fs._cp(a, b, opt && opt.owner);
      return b;
    },
    mv(a, b) { const d = fs.cp(a, b); fs.rm(a, { recursive: true }); return d; },
    usage() {
      let used = 0;
      for (const k of store.keys()) used += k.length + 7 + (store.get(k) || '').length;
      return { used: used, total: 5 * 1024 * 1024 };
    },
    kind(p) { const e = path.ext(p); for (const k in KINDS) if (KINDS[k].includes(e)) return k; return 'other'; },
    mime(p) { return MIME[path.ext(p)] || 'text/plain'; },
    dataURL(p) {
      const s = fs.stat(p);
      if (!s || s.t !== 'f') throw new Error(p + ': そのようなファイルはありません');
      return s.b ? s.c : 'data:' + fs.mime(p) + ';charset=utf-8,' + encodeURIComponent(s.c);
    },
    unique(p) {
      if (!fs.exists(p)) return p;
      const d = path.dir(p), b = path.base(p), i = b.lastIndexOf('.');
      const stem = i > 0 ? b.slice(0, i) : b, ext = i > 0 ? b.slice(i) : '';
      for (let n = 1; ; n++) { const q = path.join(d, stem + ' (' + n + ')' + ext); if (!fs.exists(q)) return q; }
    }
  };

  // ---------- 設定
  const DEFAULT_PROXIES = ['https://corsproxy.io/?url={url}', 'https://api.allorigins.win/raw?url={url}', 'https://api.codetabs.com/v1/proxy?quest={url}'];
  const config = OS.config = {
    all() { try { return JSON.parse(fs.read('/etc/config.json')); } catch (e) { return {}; } },
    get(k, def) { const v = config.all()[k]; return v === undefined ? def : v; },
    set(k, v) { const c = config.all(); c[k] = v; fs.write('/etc/config.json', JSON.stringify(c, null, 1)); }
  };

  // ---------- ユーザー
  const COLORS = ['#3584e4', '#2ec27e', '#e66100', '#c01c28', '#9141ac', '#986a44', '#1c71d8', '#5e5c64'];
  const users = OS.users = {
    colors: COLORS,
    list() { try { return JSON.parse(fs.read('/etc/passwd')); } catch (e) { return []; } },
    _save(l) { fs.write('/etc/passwd', JSON.stringify(l, null, 1)); },
    get(n) { return users.list().find(u => u.name === n) || null; },
    home(n) { return n === 'root' ? '/root' : '/home/' + n; },
    isRoot(n) { const u = users.get(n); return !!(u && u.root); },
    // root（スーパーユーザー）が居なければ作る。古い版から更新した直後はパスワード未設定（ロック状態）
    ensureRoot() {
      const l = users.list();
      if (l.some(u => u.name === 'root')) return;
      l.push({ name: 'root', pw: null, admin: true, root: true, color: '#c01c28', created: Date.now() });
      users._save(l);
    },
    async add(name, pw, admin) {
      if (!/^[a-z_][a-z0-9_-]{0,15}$/.test(name)) throw new Error('ユーザー名は英小文字で始め、英小文字・数字・_ - で16文字までにしてください');
      const l = users.list();
      if (l.some(u => u.name === name)) throw new Error(name + ': すでに存在するユーザーです');
      l.push({ name: name, pw: await BOOT.hash(pw), admin: !!admin, color: COLORS[l.length % COLORS.length], created: Date.now() });
      users._save(l); users.ensureHome(name);
    },
    remove(name, keepHome) {
      const l = users.list(), u = l.find(x => x.name === name);
      if (!u) throw new Error(name + ': そのようなユーザーはいません');
      if (u.root) throw new Error('root は削除できません');
      if (u.admin && l.filter(x => x.admin && !x.root).length === 1) throw new Error('最後の管理者は削除できません');
      users._save(l.filter(x => x.name !== name));
      if (!keepHome && fs.exists(users.home(name))) fs.rm(users.home(name), { recursive: true });
    },
    update(name, patch) {
      const l = users.list(), u = l.find(x => x.name === name);
      if (!u) throw new Error(name + ': そのようなユーザーはいません');
      if (u.root && patch.admin === false) throw new Error('root の権限は変えられません');
      if (patch.admin === false && u.admin && l.filter(x => x.admin && !x.root).length === 1) throw new Error('管理者が1人もいなくなってしまいます');
      Object.assign(u, patch);
      for (const k in u) if (u[k] === null) delete u[k];
      users._save(l);
    },
    async setPassword(name, pw) { users.update(name, { pw: await BOOT.hash(pw) }); },
    async verify(name, pw) { const u = users.get(name); return !!u && !!u.pw && BOOT.verify(pw, u.pw); },
    ensureHome(name) {
      const home = users.home(name);
      if (fs.exists(home)) return;
      const o = { owner: name, parents: true };
      if (name === 'root') { fs.mkdir(home + '/.config', o); return; }
      ['Documents', 'Downloads', 'Pictures', 'Music', 'Videos', '.config'].forEach(d => fs.mkdir(home + '/' + d, o));
      const w = (p, c, bin) => fs.write(home + '/' + p, c, { owner: name, bin: bin });
      w('Documents/readme.txt', [
        'htmlOS ' + OS.version + ' へようこそ',
        '',
        'このOSはブラウザのLocalStorageにインストールされています。',
        '容量は全体で約5MBです（画像や音声はすぐ一杯になります）。',
        '',
        '■ jsh（CUI）',
        '  シェル風:  ls -l /sys     cd Documents     cat readme.txt',
        '  JS風:      ls("/sys").length     for (const f of ls()) echo(f)',
        '  help でコマンド一覧、htui start / htui stop でデスクトップの起動・終了。',
        '',
        '■ システムの中身',
        '  /sys 以下にカーネル・HTUi・各アプリのソースが入っています。',
        '  書き換えられるのは root だけです（jsh で su。hedit では保存時に root のパスワードを聞かれます）。',
        '  壊したらブートメニューの「システム修復」で戻せます。',
        ''
      ].join('\n'));
      w('Documents/hello.js', [
        '// jsh スクリプトのサンプルです。Terminal で  run hello.js  か、hedit の「実行」で動きます。',
        'echo("こんにちは、" + whoami() + " さん");',
        'const name = await read("お名前は? ");',
        'echo(name + " さん、ホームには " + ls("~").length + " 個の項目があります。");',
        'for (let i = 3; i > 0; i--) { echo(i + "..."); await sleep(400); }',
        'echo("おしまい");',
        ''
      ].join('\n'));
      w('Documents/welcome.html', '<!DOCTYPE html>\n<html lang="ja"><meta charset="utf-8"><title>ようこそ</title>\n<body style="font-family:sans-serif;max-width:40em;margin:2em auto;padding:0 1em;line-height:1.7">\n<h1>hBrowser へようこそ</h1>\n<p>これは htmlOS のファイルシステム（LocalStorage）に保存されているHTMLファイルです。hedit で編集して、hBrowser で再読み込みしてみてください。</p>\n<p><a href="https://ja.wikipedia.org/wiki/HTML">Wikipedia: HTML</a></p>\n</body></html>\n');
      w('Pictures/htmlos.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f3a5f"/><stop offset="1" stop-color="#5fa8d3"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M110 70l-40 30 40 30"/><path d="M210 70l40 30-40 30"/><path d="M175 55l-30 90"/></g><text x="160" y="182" font-family="monospace" font-size="18" fill="#fff" text-anchor="middle">htmlOS</text></svg>\n');
      try { w('Music/chime.wav', chime(), true); } catch (e) { /* 容量不足なら無くてよい */ }
    }
  };
  function chime() {
    const sr = 8000, notes = [523.25, 659.25, 783.99, 1046.5], len = 0.2, n = Math.floor(sr * (len * notes.length + 0.5));
    const d = new Uint8Array(44 + n), dv = new DataView(d.buffer);
    const W = (o, s) => { for (let i = 0; i < s.length; i++) d[o + i] = s.charCodeAt(i); };
    W(0, 'RIFF'); dv.setUint32(4, 36 + n, true); W(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); W(36, 'data'); dv.setUint32(40, n, true);
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = Math.min(notes.length - 1, Math.floor(t / len)), lt = t - k * len;
      d[44 + i] = 128 + Math.round(90 * Math.exp(-lt * 5) * Math.sin(2 * Math.PI * notes[k] * t));
    }
    let b = ''; for (let i = 0; i < d.length; i++) b += String.fromCharCode(d[i]);
    return 'data:audio/wav;base64,' + btoa(b);
  }

  // ---------- 権限つきファイルシステム
  //   root      : どこでも読み書きできる
  //   管理者    : 書けるのは自分のホームと /tmp だけ。読むのは /root 以外すべて
  //   一般ユーザー: 書けるのは自分のホームと /tmp だけ。他人のホームと /root は読めない
  OS.fsFor = function (getUser) {
    const me = () => users.get(getUser()) || { name: getUser() };
    const canW = p => { const u = me(); return !!u.root || p.startsWith('/tmp/') || p.startsWith('/home/' + u.name + '/'); };
    const canR = p => { const u = me(); if (u.root) return true; if (p === '/root' || p.startsWith('/root/')) return false; if (u.admin) return true; if (p === '/root' || p.startsWith('/root/')) return false; const m = p.match(/^\/home\/([^/]+)/); return !m || m[1] === u.name; };
    const W = p => { if (!canW(p)) throw new Error(p + ': 許可がありません（root 権限が必要です）'); return p; };
    const R = p => { if (!canR(p)) throw new Error(p + ': 許可がありません'); return p; };
    return {
      stat: p => fs.stat(R(p)), exists: p => canR(p) && fs.exists(p), isDir: p => canR(p) && fs.isDir(p), isFile: p => canR(p) && fs.isFile(p),
      list: p => fs.list(R(p)), read: p => fs.read(R(p)),
      write: (p, c, o) => fs.write(W(p), c, Object.assign({}, o, { owner: getUser() })),
      mkdir: (p, o) => fs.mkdir(W(p), Object.assign({}, o, { owner: getUser() })),
      rm: (p, o) => fs.rm(W(p), o),
      cp: (a, b) => { R(a); W(fs.dest(a, b)); return fs.cp(a, b, { owner: getUser() }); },
      mv: (a, b) => { W(a); W(fs.dest(a, b)); return fs.mv(a, b); },
      usage: fs.usage, kind: fs.kind, mime: fs.mime, dataURL: p => fs.dataURL(R(p)), unique: fs.unique, canWrite: canW
    };
  };

  // ---------- tty (文字端末。tty1 と Terminal アプリの両方で使う)
  class Tty {
    constructor(host) {
      this.out = h('div', { class: 'tty-out' });
      this.promptEl = h('span', { class: 'tty-prompt' });
      this.input = h('input', { class: 'tty-input', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', enterkeyhint: 'send', 'aria-label': 'コマンド入力' });
      // 行を form にしておくと、画面キーボードの確定キーでも submit として確実に届く
      this.line = h('form', { class: 'tty-line', style: 'display:none', onsubmit: e => { e.preventDefault(); this._enter(); } }, this.promptEl, this.input);
      this.scr = h('div', { class: 'tty-scr' }, this.out, this.line);
      // タッチ用の補助キー列（タブレット・スマートフォンモードのときだけ表示される）
      const KEYS = [['Tab', () => this._tab()], ['↑', () => this._hist(-1)], ['↓', () => this._hist(1)], ['^C', () => this._cancel()], ['^L', () => this.clear()]]
        .concat(['/', '-', '~', '.', '"', "'", '(', ')', '=', '>', '|', ';', '{', '}', '[', ']', '$', '_', '*'].map(c => [c, () => this._insert(c)]));
      this.keys = h('div', { class: 'tty-keys' }, KEYS.map(k => {
        const b = h('button', { class: 'tty-key', type: 'button', tabindex: '-1' }, k[0]);
        b.addEventListener('pointerdown', e => { e.preventDefault(); if (this.pending) { k[1](); this.input.focus(); } });
        return b;
      }));
      this.el = h('div', { class: 'tty' }, this.scr, this.keys);
      host.append(this.el);
      this.pending = null; this.capture = null;
      this.scr.addEventListener('click', () => { if (!String(window.getSelection())) this.input.focus(); });
      this.input.addEventListener('keydown', e => this._key(e));
      if (window.ResizeObserver) { this._ro = new ResizeObserver(() => { if (this.pending) this.scr.scrollTop = this.scr.scrollHeight; }); this._ro.observe(this.scr); }
    }
    print(s, cls) {
      s = String(s);
      if (this.capture) { this.capture.push(s); return; }
      this.out.append(cls ? h('span', { class: 't-' + cls }, s) : document.createTextNode(s));
      while (this.out.childNodes.length > 4000) this.out.firstChild.remove();
      this.scr.scrollTop = this.scr.scrollHeight;
    }
    println(s, cls) { this.print((s == null ? '' : s) + '\n', cls); }
    clear() { this.out.textContent = ''; }
    read(prompt, opt) {
      opt = opt || {};
      return new Promise(res => {
        this.promptEl.textContent = prompt;
        this.input.type = opt.mask ? 'password' : 'text';
        this.input.value = '';
        this.line.style.display = 'flex';
        this.pending = { res: res, prompt: prompt, opt: opt, hi: (opt.history || []).length, draft: '' };
        this.scr.scrollTop = this.scr.scrollHeight;
        if (this.wantsFocus()) this.input.focus();
      });
    }
    wantsFocus() {
      const w = this.el.closest('.win');
      return w ? w.classList.contains('active') : !(OS.htui && OS.htui.running);
    }
    focus() { this.input.focus(); }
    _echo(p, text) { const cap = this.capture; this.capture = null; this.print(p.prompt, 'prompt'); this.println(text); this.capture = cap; }
    _enter() {
      const p = this.pending; if (!p) return;
      const v = this.input.value;
      this.pending = null; this.line.style.display = 'none';
      this._echo(p, p.opt.mask ? '' : v);
      p.res(v);
    }
    _hist(d) {
      const p = this.pending, hist = p && p.opt.history; if (!hist) return;
      if (d < 0) { if (p.hi === hist.length) p.draft = this.input.value; if (p.hi > 0) this.input.value = hist[--p.hi]; }
      else if (p.hi < hist.length) { p.hi++; this.input.value = p.hi === hist.length ? p.draft : hist[p.hi]; }
    }
    _tab() {
      const p = this.pending; if (!p || !p.opt.complete) return;
      const r = p.opt.complete(this.input.value);
      if (typeof r === 'string') this.input.value = r;
      else if (Array.isArray(r) && r.length) { this._echo(p, this.input.value); this.println(r.join('  '), 'dim'); }
    }
    _cancel() {
      const p = this.pending; if (!p) return;
      this.pending = null; this.line.style.display = 'none';
      this._echo(p, (p.opt.mask ? '' : this.input.value) + '^C');
      p.res('');
    }
    _insert(t) {
      const i = this.input, a = i.selectionStart == null ? i.value.length : i.selectionStart, b = i.selectionEnd == null ? a : i.selectionEnd;
      i.setRangeText(t, a, b, 'end');
    }
    _key(e) {
      const p = this.pending; if (!p) return;
      if (e.key === 'Enter') {
        if (e.isComposing || e.keyCode === 229) return; // 変換の確定。送信は form の submit に任せる
        e.preventDefault(); this._enter();
      } else if (e.key === 'ArrowUp' && p.opt.history) { e.preventDefault(); this._hist(-1); }
      else if (e.key === 'ArrowDown' && p.opt.history) { e.preventDefault(); this._hist(1); }
      else if (e.key === 'Tab' && p.opt.complete) { e.preventDefault(); this._tab(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); this.clear(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'c' && this.input.selectionStart === this.input.selectionEnd) { e.preventDefault(); this._cancel(); }
    }
    dispose() { this.pending = null; if (this._ro) this._ro.disconnect(); this.el.remove(); }
  }
  OS.Tty = Tty;

  // ---------- コード実行
  OS.exec = function (code, name) { return (0, eval)(code + '\n//# sourceURL=hfs://' + name); };
  OS.loadFile = function (p) { return OS.exec(fs.read(p), p); };
  OS.registerApp = function (def) { def.pkg = OS._loading || null; OS.apps[def.id] = def; };

  // ---------- パッケージ（あとから入れるアプリ。/apps/*.js に置かれ、起動時に読み込まれる）
  OS.pkg = {
    dir: '/apps',
    list() { return fs.isDir('/apps') ? fs.list('/apps').filter(n => n.endsWith('.js')) : []; },
    load(name) { OS._loading = name; try { OS.exec(fs.read('/apps/' + name), '/apps/' + name); } finally { OS._loading = null; } },
    _admin(user) { if (!users.isRoot(user)) throw new Error('パッケージの追加・削除には root 権限が必要です（jsh では su で root になってください）'); },
    _unregister(name) { for (const id in OS.apps) if (OS.apps[id].pkg === name) delete OS.apps[id]; },
    install(name, code, user) {
      OS.pkg._admin(user);
      name = String(name).replace(/[^\w.-]/g, '_'); if (!name.endsWith('.js')) name += '.js';
      if (!/registerApp\s*\(/.test(code)) throw new Error('アプリのパッケージではありません（OS.registerApp の呼び出しが見つかりません）');
      fs.mkdir('/apps', { parents: true });
      const old = fs.exists('/apps/' + name) ? fs.read('/apps/' + name) : null;
      OS.pkg._unregister(name);
      fs.write('/apps/' + name, code, { owner: user });
      try { OS.pkg.load(name); }
      catch (e) { OS.pkg._unregister(name); if (old == null) fs.rm('/apps/' + name); else { fs.write('/apps/' + name, old); try { OS.pkg.load(name); } catch (e2) { /* 元も壊れている */ } } throw new Error('パッケージの読み込みに失敗しました: ' + e.message); }
      if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
      return name;
    },
    remove(name, user) {
      OS.pkg._admin(user);
      if (!fs.exists('/apps/' + name)) throw new Error(name + ': そのようなパッケージはありません');
      fs.rm('/apps/' + name); OS.pkg._unregister(name);
      if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
    }
  };
  OS.launch = function (id, arg) {
    if (!OS.htui || !OS.htui.running || !OS.htui.user) throw new Error('HTUi が起動していません。「htui start」でデスクトップを起動してください');
    const a = OS.apps[id];
    if (!a) throw new Error(id + ': そのようなアプリはありません');
    return a.launch(arg);
  };
  OS.openFile = function (p) {
    const k = fs.kind(p);
    if (k === 'image' || k === 'audio' || k === 'video') return OS.launch('hplayer', p);
    if (k === 'html') return OS.launch('hbrowser', 'hfs:' + p);
    const s = fs.stat(p);
    if (s && s.b) throw new Error(path.base(p) + ': このバイナリファイルを開けるアプリがありません');
    return OS.launch('hedit', p);
  };

  // ---------- ネットワーク
  OS.net = {
    defaults: DEFAULT_PROXIES,
    proxied(url) { return config.get('proxies', DEFAULT_PROXIES).map(t => t.replace('{url}', encodeURIComponent(url))); },
    async get(url, opt) {
      opt = opt || {};
      const tries = (opt.direct === false ? [] : [url]).concat(OS.net.proxied(url));
      let last;
      for (const u of tries) {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), opt.timeout || 15000);
        try {
          const r = await fetch(u, { signal: ac.signal, credentials: 'omit' });
          clearTimeout(tm);
          if (r.ok) return r;
          last = new Error('HTTP ' + r.status);
        } catch (e) { clearTimeout(tm); last = e.name === 'AbortError' ? new Error('タイムアウト') : e; }
      }
      throw new Error('取得できませんでした（' + ((last && last.message) || '不明なエラー') + '）');
    },
    // Blob を hFS に保存できる形へ。テキストはそのまま、それ以外は data: URL にする
    blobToContent(blob, name) {
      const k = fs.kind(name);
      const isText = path.ext(name) === 'svg' || k === 'text' || k === 'html' ||
        (k === 'other' && (/^text\//.test(blob.type) || /json|xml|javascript/.test(blob.type)));
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onerror = () => rej(new Error('読み込みに失敗しました'));
        fr.onload = () => res({ content: fr.result, bin: !isText });
        if (isText) fr.readAsText(blob); else fr.readAsDataURL(blob);
      });
    },
    async download(url, dest, fsx) {
      const r = await OS.net.get(url);
      const blob = await r.blob();
      const c = await OS.net.blobToContent(blob, dest);
      (fsx || fs).write(dest, c.content, { bin: c.bin });
      return { path: dest, size: blob.size };
    }
  };

  // ---------- 電源
  // 電源オフ・再起動。終了画面（GUIはロゴと進捗、CUIは終了ログ）を最低でも約1.3秒表示する
  const nap = ms => new Promise(r => setTimeout(r, ms));
  OS.shutdown = async function (reboot, flag) {
    if (OS._down) return;
    const gui = !!(OS.htui && OS.htui.running);
    // 未保存の変更があるウィンドウは確認を出す。キャンセルされたら終了を取りやめる
    if (gui && OS.htui.user) { for (const w of OS.htui.wins.slice()) { if ((await w.close()) === false) return; } }
    OS._down = true;
    if (flag) store.set('bootflag', flag);
    const t0 = Date.now(), tty = OS.tty1, label = reboot ? '再起動しています…' : 'シャットダウンしています…';
    tty.pending = null; tty.capture = null; tty.line.style.display = 'none';
    const bar = h('i', { style: 'width:100%' }), msg = h('div', { class: 'sp-msg' });
    if (gui) OS.root.append(h('div', { id: 'splash', class: 'down' }, h('div', { class: 'sp-logo', 'aria-hidden': 'true' }, '<', h('b', null, '/'), '>'), h('div', { class: 'sp-name' }, label), h('div', { class: 'sp-bar' }, bar), msg));
    tty.println(); tty.println(label);
    await nap(280);
    if (gui) OS.htui.stop();
    const steps = (gui ? ['HTUi を停止しました'] : []).concat(['アプリを終了しました', 'ユーザーセッションを閉じました', 'LocalStorage ファイルシステムを同期しました', reboot ? '再起動します' : '電源を切ります']);
    for (let i = 0; i < steps.length; i++) {
      tty.print('['); tty.print('  OK  ', 'ok'); tty.println('] ' + steps[i]);
      msg.textContent = steps[i]; bar.style.width = (100 - (i + 1) / steps.length * 100) + '%';
      await nap(190);
    }
    const rest = 1300 - (Date.now() - t0);
    if (rest > 0) await nap(rest);
    if (reboot) { location.reload(); return; }
    OS.root.textContent = '';
    OS.root.append(h('div', { class: 'poweroff' },
      h('button', { class: 'pw-btn', type: 'button', title: '電源を入れる', 'aria-label': '電源を入れる', onclick: () => location.reload() }, OS.icon('power', 34)),
      h('p', null, '電源が切れています'), h('small', null, 'ボタンを押すと起動します')));
  };
  OS.reboot = function (flag) { return OS.shutdown(true, flag); };
  OS.poweroff = function () { return OS.shutdown(false); };

  // ---------- tty1 のログインループ
  async function ttyLogin(tty) {
    for (;;) {
      tty.println(); tty.println('htmlOS ' + OS.version + ' (tty1)'); tty.println();
      let user = null;
      while (!user) {
        const name = (await tty.read('htmlos login: ')).trim();
        if (!name) continue;
        const pw = await tty.read('Password: ', { mask: true });
        if (await users.verify(name, pw)) user = name;
        else { tty.println('Login incorrect', 'err'); tty.println(); }
      }
      const sh = new OS.Jsh(tty, user, { login: true });
      OS.tty1sh = sh;
      await sh.loop();
      OS.tty1sh = null;
      tty.clear();
    }
  }

  // ---------- 画面モード（desktop / tablet / phone。auto はタッチ端末かどうかと画面の幅で決める）
  OS.autoMode = function () {
    const mm = q => !!(window.matchMedia && window.matchMedia(q).matches);
    if (!mm('(pointer: coarse)') || mm('(any-pointer: fine)')) return 'desktop';
    return Math.min(window.innerWidth, window.innerHeight) < 600 ? 'phone' : 'tablet';
  };
  OS.setMode = function (pref) {
    OS.modePref = ['desktop', 'tablet', 'phone'].includes(pref) ? pref : 'auto';
    const prev = OS.uiMode;
    const m = OS.uiMode = OS.modePref === 'auto' ? OS.autoMode() : OS.modePref;
    OS.touch = m !== 'desktop';
    if (!OS.root) return m;
    OS.root.classList.toggle('touch', OS.touch);
    OS.root.classList.toggle('tablet', m === 'tablet');
    OS.root.classList.toggle('phone', m === 'phone');
    if (OS.htui && OS.htui.onMode) OS.htui.onMode(prev !== m); // 表示が実際に変わったときだけ、ウィンドウの並べ直しなどをする
    return m;
  };
  OS.modeIcons = { desktop: 'cursor', tablet: 'tablet', phone: 'phone' };
  OS.modeNames = { auto: '自動', desktop: 'デスクトップ', tablet: 'タブレット', phone: 'スマートフォン' };

  // ---------- 起動（起動画面は最低でも約1.2秒表示する。GUIはスプラッシュ、CUIは起動ログ）
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  OS.boot = async function (mode) {
    const t0 = Date.now();
    document.head.append(h('style', { id: 'htmlos-style' }, fs.read('/sys/style.css')));
    const root = OS.root = h('div', { id: 'os-root' });
    document.body.append(root);
    // ホストOSの画面キーボードが出て見える範囲が縮んだら、OS全体をその範囲に収める
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        if (Math.abs(vv.scale - 1) > 0.01) { root.style.height = ''; root.style.top = ''; return; } // ピンチ拡大中は何もしない
        root.style.top = vv.offsetTop + 'px'; root.style.height = vv.height + 'px';
        const a = document.activeElement;
        if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) setTimeout(() => { try { a.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 無視 */ } }, 60);
      };
      vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
    }
    OS.setMode('auto');
    const t1 = h('div', { id: 'tty1' }); root.append(t1);
    const tty = OS.tty1 = new Tty(t1);
    let splash = null; const bar = h('i'), msg = h('div', { class: 'sp-msg' });
    if (mode === 'gui') {
      splash = h('div', { id: 'splash' }, h('div', { class: 'sp-logo', 'aria-hidden': 'true' }, '<', h('b', null, '/'), '>'), h('div', { class: 'sp-name' }, 'htmlOS ' + OS.version), h('div', { class: 'sp-bar' }, bar), msg);
      root.append(splash);
    }
    const apps = fs.list('/sys/apps').filter(n => n.endsWith('.js'));
    const pkgs = OS.pkg.list();
    const core = ['/sys/jsh.js', '/sys/htui.js', '/sys/hdm.js', '/sys/shells.js'];
    const total = 2 + core.length + apps.length + pkgs.length; let done = 0;
    const step = async (s, failed) => {
      tty.print('['); tty.print(failed ? 'FAILED' : '  OK  ', failed ? 'err' : 'ok'); tty.println('] ' + s);
      done++; bar.style.width = Math.min(100, done / total * 100) + '%'; msg.textContent = s;
      await sleep(85);
    };
    tty.println('htmlOS ' + OS.version + ' を起動しています…');
    await sleep(120);
    await step('LocalStorage ファイルシステムをマウントしました' + (store.ram ? '（RAMディスク: 再読み込みで消えます）' : ''));
    for (const f of core) { OS.loadFile(f); await step(f + ' を読み込みました'); }
    for (const n of apps) {
      try { OS.loadFile('/sys/apps/' + n); await step('アプリ ' + n); }
      catch (e) { await step('アプリ ' + n + ': ' + e.message, true); }
    }
    for (const n of pkgs) {
      try { OS.pkg.load(n); await step('パッケージ ' + n); }
      catch (e) { OS.pkg._unregister(n); await step('パッケージ ' + n + ': ' + e.message, true); }
    }
    users.ensureRoot();
    users.list().forEach(u => users.ensureHome(u.name));
    OS.mode = mode;
    await step(mode === 'gui' ? 'HTUi を起動します' : 'tty1 を起動します');
    const rest = 1200 - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    ttyLogin(tty);
    if (mode === 'gui') {
      OS.htui.start();
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 450);
    }
  };
})();
