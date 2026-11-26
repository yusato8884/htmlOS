/* htmlOS kernel — ファイルシステム / ユーザー / 設定 / tty / 起動処理
   このファイルは LocalStorage 上の /sys/kernel.js から読み込まれて実行されます。 */
(function () {
  'use strict';
  const BOOT = window.BOOT, base = BOOT.store;
  // ---------- マウント。/mnt/hdd1 のように、あるパスより下のキーだけを別のストレージ（PC のフォルダ）に振り分ける
  const mounts = [];
  const mountOf = k => { for (const m of mounts) if (k === m.key || k.startsWith(m.key + '/')) return m.s; return null; };
  const store = {
    get ram() { return base.ram; },
    get: k => (mountOf(k) || base).get(k),
    set: (k, v) => (mountOf(k) || base).set(k, v),
    del: k => (mountOf(k) || base).del(k),
    keys(prefix) { let out = base.keys(prefix).filter(k => !mountOf(k)); for (const m of mounts) out = out.concat(m.s.keys(prefix)); return out; },
    wipe: () => base.wipe()
  };
  // OS.store はシステムのドライブ（LocalStorage か、HDD1 から起動したときは HDD1）。マウントしたドライブは含まない
  const OS = window.OS = { version: BOOT.installedVersion, apps: {}, store: base, live: !!BOOT.live, imode: !!BOOT.imode, safe: !!BOOT.safe };
  // コードネーム（恒星の名前）と「htmlOS 3.2 Sirius」のような名前
  try { OS.codename = (JSON.parse(base.get('meta')) || {}).codename || (OS.version === BOOT.version ? BOOT.codename : '') || ''; } catch (e) { OS.codename = ''; }
  OS.name = BOOT.osName ? BOOT.osName(OS.version, OS.codename) : 'htmlOS ' + OS.version;
  // システムのドライブの名前（df や設定に出す）
  OS.storeLabel = () => base.disk ? 'HDD1（' + base.name + '）' : base.idb ? 'HDD2（IndexedDB）' : base.ram ? 'RAMディスク' : 'LocalStorage';

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
  // スクリプトから送られた click（仮想カーソルなど）が、使えない（disabled）ボタンに届かないようにする
  document.addEventListener('click', e => {
    if (e.isTrusted) return;
    const t = e.target;
    if (t && t.closest && t.closest(':disabled')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  const ICONS = {
    pin: '<path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/>',
    chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4.5 4.5 2.5 6.5M19.5 4.5l2 2M7 19.5 5.5 21M17 19.5l1.5 1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    raid: '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/><path d="M7 6.5h.01M7 12.5h.01M7 18h.01"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    desks: '<rect x="3" y="6" width="13" height="11" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v9"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
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
    backup: '<rect x="3" y="14" width="18" height="6.5" rx="1.5"/><path d="M12 3v8.5M8.3 6.7 12 3l3.7 3.7"/><path d="M7 17.25h.01"/>', // 7.3.1: hBackup（hArchive と分ける）
    plug: '<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    tablet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M18.5 11v2"/>',
    cursor: '<path d="M5 3l14 8.5-6.2 1.6 3.6 6.3-2.6 1.5-3.6-6.3L5.6 19z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
    win: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>', // htmlOS のマーク </>（Windows 風の環境のスタートに使う）
    down: '<path d="M6 9l6 6 6-6"/>',
    grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
    markdown: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5.5 15V9l3 3 3-3v6M17 9v6M14.5 12.5L17 15l2.5-2.5"/>',
    mine: '<circle cx="12" cy="13" r="5.5"/><path d="M12 4v3.5M12 18.5V21M3.5 13H6.5M17.5 13h3M6 7l2.1 2.1M18 7l-2.1 2.1M6 19l2.1-2.1M18 19l-2.1-2.1"/><circle cx="10" cy="11" r="1"/>',
    flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
    drive: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h.01M11 14h6"/>',
    code: '<path d="M9 4C6 4 7.5 10 4.5 12 7.5 14 6 20 9 20M15 4c3 0 1.5 6 4.5 8-3 2-1.5 8-4.5 8"/>',
    hammer: '<path d="M13 7l4-4 4 4-4 4zM15 9L5 19a1.4 1.4 0 0 1-2-2L13 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
    studio: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M9 12l-2.5 2.5L9 17M15 12l2.5 2.5L15 17M13 11.5l-2 6"/>',
    script: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12l2 2-2 2M13 16h3"/>',
    ttt: '<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    reversi: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>'
  };
  OS.iconNames = Object.keys(ICONS).filter(n => n !== 'win');
  OS.icon = function (name, size) {
    size = size || 18;
    return h('span', { class: 'ico', 'aria-hidden': 'true', html: '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.file) + '</svg>' });
  };

  // htmlOS のマーク </>（白い線）。起動・終了画面などで使う。線は pathLength=1 なので、描いていくアニメーションをつけやすい
  const MARK = '<path pathLength="1" d="M8 7l-5 5 5 5"/><path pathLength="1" d="M16 7l5 5-5 5"/><path pathLength="1" d="M13.5 5l-3 14"/>';
  OS.mark = function (size, cls) {
    return h('span', { class: 'os-mark ' + (cls || ''), 'aria-hidden': 'true', html: '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + MARK + '</svg>' });
  };
  const spinner = () => h('span', { class: 'sp-spin', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9.5"/></svg>' });

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
    video: 'mp4 webm ogv mov m4v'.split(' '),
    archive: 'zip tar gz tgz'.split(' ') // 7.3: hArchive で開く
  };
  const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', zip: 'application/zip', gz: 'application/gzip', tgz: 'application/gzip', tar: 'application/x-tar', pdf: 'application/pdf' };
  // ファイルが変わったことを知らせる（デスクトップや hFile が表示を更新するため）。まとめて 1 回にする
  const watchers = new Set(); let changedPaths = new Set(), changeTimer = 0;
  function changed(p) {
    changedPaths.add(p);
    if (changeTimer) return;
    changeTimer = setTimeout(() => { const l = [...changedPaths]; changedPaths = new Set(); changeTimer = 0; watchers.forEach(f => { try { f(l); } catch (e) { /* 見ている側の失敗は無視 */ } }); }, 30);
  }
  function put(p, node) {
    try { store.set(K(p), JSON.stringify(node)); }
    catch (e) { if (mountOf(K(p)) || base.disk || base.idb) throw e; throw new Error('ストレージの空き容量が足りません（' + OS.storeLabel() + '）'); }
    changed(p);
  }
  const fs = OS.fs = {
    // シンボリックリンク（ノードの t が 'l'、c がリンク先）をたどった本当のパス。keepLast=true なら最後の部分はたどらない
    real(p, keepLast) {
      let parts = String(p).split('/').filter(Boolean), cur = '', hops = 0;
      for (let i = 0; i < parts.length; i++) {
        const next = cur + '/' + parts[i];
        if (keepLast && i === parts.length - 1) { cur = next; break; }
        const raw = store.get(K(next));
        if (raw && raw.startsWith('{"t":"l"')) {
          if (++hops > 16) throw new Error(p + ': シンボリックリンクが多すぎます（循環しているかもしれません）');
          let to = '/'; try { to = path.norm(JSON.parse(raw).c, cur || '/'); } catch (e) { /* 壊れたリンクは / 扱い */ }
          parts = to.split('/').filter(Boolean).concat(parts.slice(i + 1)); cur = ''; i = -1; continue;
        }
        cur = next;
      }
      return cur || '/';
    },
    _raw(p) { const v = store.get(K(p)); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } },
    _here(p) { return p === '/' ? '/' : path.join(fs.real(path.dir(p)), path.base(p)); }, // 親だけたどったパス（リンクそのもの）
    stat(p) { return fs._raw(fs.real(p)); },
    lstat(p) { return fs._raw(fs._here(p)); },
    isLink(p) { const s = fs.lstat(p); return !!s && s.t === 'l'; },
    readlink(p) { const s = fs.lstat(p); if (!s || s.t !== 'l') throw new Error(p + ': シンボリックリンクではありません'); return s.c; },
    exists(p) { try { return store.get(K(fs.real(p))) != null; } catch (e) { return false; } },
    isDir(p) { try { const s = fs.stat(p); return !!s && s.t === 'd'; } catch (e) { return false; } },
    isFile(p) { try { const s = fs.stat(p); return !!s && s.t === 'f'; } catch (e) { return false; } },
    list(p) {
      if (!fs.isDir(p)) throw new Error(p + ': ディレクトリではありません');
      const q = fs.real(p), pre = K(q === '/' ? '/' : q + '/'), names = [];
      for (const k of store.keys(pre)) { const r = k.slice(pre.length); if (r && !r.includes('/')) names.push(r); }
      return names.sort((a, b) => a.localeCompare(b));
    },
    read(p) {
      const s = fs.stat(p);
      if (!s) throw new Error(p + ': そのようなファイルはありません');
      if (s.t === 'd') throw new Error(p + ': ディレクトリです');
      if (s.t === 'p') return ''; // 名前付きパイプ（中身は OS.ipc.fifoRead で待って読む）
      return s.c;
    },
    write(p, c, opt) {
      opt = opt || {};
      if (p === '/') throw new Error('/ には書き込めません');
      const q = fs.real(p), d = path.dir(q);
      if (!fs.isDir(d)) throw new Error(path.dir(p) + ': ディレクトリがありません');
      const old = fs._raw(q);
      if (old && old.t === 'd') throw new Error(p + ': ディレクトリです');
      if (old && old.t === 'p') { if (OS.ipc) OS.ipc.fifoWrite(q, String(c)); return; } // 名前付きパイプ: 読んでいる相手に渡す
      const node = { t: 'f', c: String(c), m: Date.now(), o: opt.owner || (old && old.o) || 'root' };
      // 上書きではモードとグループをそのまま残す。新しいファイルは opt.mode（なければ場所ごとの既定）
      if (old && old.p != null) node.p = old.p; else if (!old && opt.mode != null) node.p = opt.mode & 0o7777;
      if (old && old.g) node.g = old.g;
      if (opt.bin) node.b = 1;
      put(q, node);
    },
    mkdir(p, opt) {
      opt = opt || {};
      if (fs.exists(p) || fs.isLink(p)) { if (fs.isDir(p) && opt.parents) return; throw new Error(p + ': すでに存在します'); }
      const d = path.dir(p);
      if (!fs.isDir(d)) { if (opt.parents) fs.mkdir(d, opt); else throw new Error(d + ': ディレクトリがありません'); }
      const n = { t: 'd', m: Date.now(), o: opt.owner || 'root' }; if (opt.mode != null) n.p = opt.mode & 0o7777;
      put(fs._here(p), n);
    },
    // 名前付きパイプ（FIFO）を作る
    mkfifo(p, opt) {
      opt = opt || {};
      if (fs.lstat(p)) throw new Error(p + ': すでに存在します');
      if (!fs.isDir(path.dir(p))) throw new Error(path.dir(p) + ': ディレクトリがありません');
      const n = { t: 'p', m: Date.now(), o: opt.owner || 'root' }; if (opt.mode != null) n.p = opt.mode & 0o7777;
      put(fs._here(p), n);
    },
    symlink(target, p, opt) {
      opt = opt || {};
      if (!target) throw new Error('リンク先を指定してください');
      if (fs.lstat(p)) throw new Error(p + ': すでに存在します');
      if (!fs.isDir(path.dir(p))) throw new Error(path.dir(p) + ': ディレクトリがありません');
      put(fs._here(p), { t: 'l', c: String(target), m: Date.now(), o: opt.owner || 'root' });
    },
    rm(p, opt) {
      opt = opt || {};
      if (p === '/') throw new Error('/ は削除できません');
      const q = fs._here(p), s = fs._raw(q);
      if (!s) throw new Error(p + ': そのようなファイルはありません');
      if (mounts.some(m => m.at === q)) throw new Error(p + ' はドライブの接続先（マウントポイント）なので消せません。切り離すときは jsh で umount ' + path.base(q));
      if (s.t === 'd') {
        if (fs.list(q).length && !opt.recursive) throw new Error(p + ': ディレクトリが空ではありません（-r が必要です）');
        store.keys(K(q + '/')).forEach(k => store.del(k));
      }
      store.del(K(q));
      changed(q);
    },
    // 変更を見る。fn(変わったパスの一覧)。戻り値の関数を呼ぶと見るのをやめる
    watch(fn) { watchers.add(fn); return () => watchers.delete(fn); },
    // コピー。owner を指定すると（ほかの人のコピー）グループは外し、モードは umask で削る
    _cp(a, b, owner, umask) {
      const s = fs._raw(a), n = Object.assign({}, s, { m: Date.now(), o: owner || s.o });
      if (owner && owner !== s.o) { delete n.g; if (n.p != null && umask != null) n.p &= ~umask & 0o7777; }
      put(b, n);
      if (s.t === 'd') for (const c of fs.list(a)) fs._cp(a + '/' + c, b + '/' + c, owner, umask);
    },
    dest(a, b) { return fs.isDir(b) ? path.join(b, path.base(a)) : b; },
    cp(a, b, opt) {
      if (!fs.exists(a)) throw new Error(a + ': そのようなファイルはありません');
      const src = fs.real(a); b = fs._here(fs.dest(a, b));
      if (b === src || b.startsWith(src + '/')) throw new Error('自分自身の中にはコピーできません');
      if (!fs.isDir(path.dir(b))) throw new Error(path.dir(b) + ': ディレクトリがありません');
      fs._cp(src, b, opt && opt.owner, opt && opt.umask);
      return b;
    },
    // 移動はリンクそのものを動かす
    mv(a, b) {
      const src = fs._here(a); if (!fs._raw(src)) throw new Error(a + ': そのようなファイルはありません');
      if (mounts.some(m => m.at === src || m.at.startsWith(src + '/'))) throw new Error(a + ': ドライブの接続先（マウントポイント）を含むので移動できません');
      const d = fs._here(fs.dest(a, b));
      if (d === src || d.startsWith(src + '/')) throw new Error('自分自身の中には移動できません');
      if (!fs.isDir(path.dir(d))) throw new Error(path.dir(d) + ': ディレクトリがありません');
      fs._cp(src, d); fs.rm(src, { recursive: true }); return d;
    },
    // システムのドライブの使用量。HDD1（PC のフォルダ）・HDD2（IndexedDB）では disk が true、total は上限（HDD1 で上限なしなら 0）。
    // HDD2 は idb も true（上限は最大 10GB。ブラウザの割り当てが少なければその量）
    usage() {
      if (base.disk || base.idb) return { used: base.used(), total: base.quota(), disk: true, idb: !!base.idb, drive: base.idb ? 'HDD2' : 'HDD1' };
      let used = 0;
      for (const k of base.keys()) used += k.length + 7 + (base.get(k) || '').length;
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
  // corsproxy.io は API キーが必要になったので外した（5.1.2）
  const DEFAULT_PROXIES = ['https://api.cors.lol/?url={url}', 'https://whateverorigin.org/get?url={url} json:contents', 'https://everyorigin.jwvbremen.nl/api/get?url={url} json:html', 'https://cors.eu.org/{rawurl}', 'https://api.codetabs.com/v1/proxy?quest={url}', 'https://api.allorigins.win/raw?url={url}'];
  const config = OS.config = {
    all() { try { return JSON.parse(fs.read('/etc/config.json')); } catch (e) { return {}; } },
    get(k, def) { const v = config.all()[k]; return v === undefined ? def : v; },
    set(k, v) { const c = config.all(); c[k] = v; fs.write('/etc/config.json', JSON.stringify(c, null, 1)); }
  };

  // ---------- 効果音（Web Audio でその場で合成する。音のファイルは使わない）
  //   OS.sound.play('boot' | 'login' | 'logout' | 'shutdown' | 'reboot' | 'bell' | 'confirm' | 'error' | 'notify')
  //   設定: ログイン前はシステムの設定（/etc/config.json の sound）、ログイン中はユーザーの設定（~/.config/htui.json の sound）
  //   ブラウザの決まりで、ページを開いてから一度もクリックやキー入力をしていないあいだは鳴らせない
  OS.sound = (function () {
    const NAMES = { boot: '起動', login: 'ログイン', logout: 'ログオフ', shutdown: 'シャットダウン', reboot: '再起動', bell: 'ベル（Terminal）', confirm: '確認（ダイアログ）', error: 'エラー', notify: '通知' };
    const AC = window.AudioContext || window.webkitAudioContext;
    const active = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
    function ctx() {
      if (!AC) return null;
      // 再起動（ページを読み込み直さない）をまたいで同じものを使う
      if (!BOOT.audio || BOOT.audio.state === 'closed') { if (!active()) return null; try { BOOT.audio = new AC(); } catch (e) { return null; } }
      return BOOT.audio;
    }
    // 6.0.6: 音が止まったままにならないように見張る。
    //   ・soundd.service が止めた（held）とき以外に suspended / interrupted になったら、起こし直す
    //   ・state が running なのに時間（currentTime）が進まない（音の処理が固まった）ときは、AudioContext を作り直す
    let held = false;
    function wake(c) {
      if (!c || held || !active()) return;
      if (c.state === 'suspended' || c.state === 'interrupted') c.resume().catch(() => { /* まだ鳴らせない */ });
    }
    function watch(c) {
      if (!c || c._htmlosWatch) return;
      c._htmlosWatch = true;
      c.addEventListener('statechange', () => { if (c === BOOT.audio && (c.state === 'suspended' || c.state === 'interrupted')) setTimeout(() => wake(c), 300); });
    }
    // 作り直す。鳴っていた BGM は新しい AudioContext で鳴らし直す
    function reset(why) {
      const old = BOOT.audio; BOOT.audio = null;
      try { if (old && old.state !== 'closed') old.close(); } catch (e) { /* 無視 */ }
      if (OS.journal) { try { OS.journal.log('soundd', '音の処理を作り直しました（' + (why || '') + '）'); } catch (e) { /* 無視 */ } }
      const c = ctx(); if (c) watch(c);
      if (OS.bgm && OS.bgm._restart) OS.bgm._restart();
      return c;
    }
    const unlock = () => { const c = ctx(); if (c) { watch(c); wake(c); } };
    ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, unlock, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && BOOT.audio) wake(BOOT.audio); });
    // 固まりの見張り（2 秒ごと。running で 4 秒以上時間が進まなければ作り直す）
    let lastT = -1, lastW = 0, resets = [];
    setInterval(() => {
      const c = BOOT.audio; if (!c || held || c.state !== 'running') { lastT = -1; return; }
      const now = performance.now();
      if (c.currentTime !== lastT) { lastT = c.currentTime; lastW = now; return; }
      if (now - lastW > 4000) { lastT = -1; resets = resets.filter(x => now - x < 300000); if (resets.length < 3) { resets.push(now); reset('時間が進まなくなったため'); } } // 作り直しは 5 分に 3 回まで
    }, 2000);
    function prefs() {
      let sys = {}; try { sys = config.get('sound', {}) || {}; } catch (e) { /* 読めなければ既定 */ }
      const p = { on: sys.on !== false, vol: typeof sys.vol === 'number' ? sys.vol : 0.6 };
      const hp = OS.htui && OS.htui.running && OS.htui.user && OS.htui.prefs && OS.htui.prefs.sound;
      if (hp) { if ('on' in hp) p.on = hp.on !== false; if (typeof hp.vol === 'number') p.vol = hp.vol; }
      p.vol = Math.max(0, Math.min(1, p.vol));
      return p;
    }
    // 音の部品: 音程 f（Hz）を d 秒。o.type 波形、o.v 大きさ、o.a 立ち上がり、o.to 終わりの音程
    function tone(c, out, t, f, d, o) {
      o = o || {};
      const osc = c.createOscillator(), g = c.createGain(), v = o.v == null ? 1 : o.v, a = o.a || 0.01;
      osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + d + 0.05);
    }
    // やわらかいベルのような音（基音に倍音を少し重ねる）
    function note(c, out, t, f, d, v) {
      tone(c, out, t, f, d, { v: v, a: 0.012 });
      tone(c, out, t, f * 1.004, d * 0.9, { v: v * 0.3, a: 0.02 }); // 少しずらして重ね、厚みを出す
      tone(c, out, t, f / 2, d * 1.15, { type: 'triangle', v: v * 0.32, a: 0.03 }); // 1 オクターブ下の柔らかい支え
      tone(c, out, t, f * 2, d * 0.5, { v: v * 0.16, a: 0.008 });
      tone(c, out, t, f * 3.01, d * 0.25, { v: v * 0.05, a: 0.005 });
    }
    // 残響（短いホールの響き）。雑音を減衰させた応答をその場で作る。AudioContext ごとに 1 回
    function reverb(c, key) {
      key = '_htmlosRev' + (key || '');
      if (c[key]) return c[key];
      const len = Math.floor(c.sampleRate * 1.6), buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      const conv = c.createConvolver(); conv.buffer = buf;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; // 響きの高音を丸くする
      conv.connect(lp);
      return (c[key] = { input: conv, output: lp });
    }
    // 効果音の出口（AudioContext ごとに 1 つ）。前は鳴らすたびにリミッターなどを作ってつなぎっぱなしにしていたため、
    //   鳴らすほど処理が重くなり、BGM がプツプツ途切れたり、音が止まったりしていた（6.0.6 で直した）
    function sfxBus(c) {
      if (c._htmlosSfx) return c._htmlosSfx;
      const dry = c.createGain(), lim = c.createDynamicsCompressor(), rv = reverb(c, 'sfx'), wet = c.createGain();
      lim.threshold.value = -6; lim.ratio.value = 12; // 重なっても音が割れないように
      wet.gain.value = 1;
      dry.connect(lim); rv.output.connect(wet); wet.connect(lim); lim.connect(c.destination);
      return (c._htmlosSfx = { dry: dry, rev: rv.input });
    }
    const M = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI の音番号 → Hz（60 = ド）
    const seq = (c, o, t, list, d, v) => list.forEach((m, i) => note(c, o, t + i * 0.12, M(m), d, v));
    const SOUNDS = {
      boot: (c, o, t) => { seq(c, o, t, [60, 67, 72, 76, 79], 1.8, 0.4); tone(c, o, t, M(36), 2.6, { type: 'triangle', v: 0.2, a: 0.35 }); tone(c, o, t + 0.45, M(48), 2.4, { type: 'triangle', v: 0.22, a: 0.25 }); tone(c, o, t + 0.45, M(55), 2.2, { type: 'triangle', v: 0.13, a: 0.3 }); },
      login: (c, o, t) => { note(c, o, t, M(72), 0.6, 0.5); note(c, o, t + 0.1, M(79), 0.7, 0.5); note(c, o, t + 0.2, M(84), 1.0, 0.45); },
      logout: (c, o, t) => { note(c, o, t, M(84), 0.5, 0.45); note(c, o, t + 0.11, M(79), 0.6, 0.45); note(c, o, t + 0.22, M(72), 0.9, 0.45); },
      shutdown: (c, o, t) => { seq(c, o, t, [79, 76, 72, 67, 60], 1.4, 0.38); tone(c, o, t + 0.5, M(43), 2.0, { type: 'triangle', v: 0.2, a: 0.2 }); tone(c, o, t + 0.5, M(36), 2.2, { type: 'triangle', v: 0.16, a: 0.3 }); },
      reboot: (c, o, t) => { note(c, o, t, M(79), 0.4, 0.42); note(c, o, t + 0.11, M(72), 0.5, 0.42); note(c, o, t + 0.34, M(72), 0.4, 0.42); note(c, o, t + 0.45, M(79), 0.9, 0.45); },
      bell: (c, o, t) => { tone(c, o, t, M(81), 0.18, { type: 'triangle', v: 0.55, a: 0.004 }); tone(c, o, t, M(69), 0.22, { type: 'triangle', v: 0.25, a: 0.006 }); tone(c, o, t, M(93), 0.08, { v: 0.12, a: 0.003 }); },
      confirm: (c, o, t) => { note(c, o, t, M(74), 0.3, 0.4); note(c, o, t + 0.075, M(81), 0.45, 0.38); },
      error: (c, o, t) => { tone(c, o, t, M(64), 0.22, { type: 'square', v: 0.1, a: 0.005 }); tone(c, o, t, M(52), 0.24, { type: 'triangle', v: 0.22, a: 0.008 }); tone(c, o, t + 0.16, M(58), 0.34, { type: 'square', v: 0.1, a: 0.005 }); tone(c, o, t + 0.16, M(46), 0.38, { type: 'triangle', v: 0.22, a: 0.008 }); },
      notify: (c, o, t) => { note(c, o, t, M(84), 0.35, 0.35); note(c, o, t + 0.09, M(88), 0.6, 0.35); }
    };
    const last = {}, LEN = { boot: 3.4, shutdown: 2.8, error: 0.7, bell: 0.4 };
    const MAX_VOICES = 8; let voices = 0, endAt = 0, holdT = 0; // endAt: いま鳴っている効果音（響きの残りも含む）が鳴り終わる時刻
    function play(name, force) {
      const p = prefs();
      if (!SOUNDS[name] || (!p.on && !force) || p.vol <= 0) return false;
      if (OS.init && OS.init.has('soundd.service') && !OS.init.isActive('soundd.service') && !OS._down) return false; // 効果音のサービスが止まっている
      const c = ctx(); if (!c) return false;
      const now = Date.now(); if (last[name] && now - last[name] < 90) return false; last[name] = now; // 連続で重ならないように
      if (voices >= MAX_VOICES) return false; // 一度にたくさん鳴らしすぎない（処理が追いつかなくなるため）
      watch(c);
      const go = () => {
        const bus = sfxBus(c), out = c.createGain(), send = c.createGain();
        out.gain.value = p.vol * 0.5;
        send.gain.value = name === 'bell' ? 0.12 : 0.28; // ベルは響きを少なめに
        out.connect(bus.dry); out.connect(send); send.connect(bus.rev);
        voices++; endAt = Math.max(endAt, Date.now() + ((LEN[name] || 1.6) + 1.2) * 1000);
        try { SOUNDS[name](c, out, c.currentTime + 0.02); } catch (e) { /* 鳴らせなくても続ける */ }
        // 鳴り終わったら外す（響きの残りは共通の残響が鳴らす）
        setTimeout(() => { voices = Math.max(0, voices - 1); try { out.disconnect(); send.disconnect(); } catch (e) { /* もう外れている */ } }, ((LEN[name] || 1.6) + 0.4) * 1000);
      };
      if (c.state === 'running') go();
      else if (!held) c.resume().then(() => { if (Date.now() - now < 400 && c.state === 'running') go(); }).catch(() => { /* まだ鳴らせない */ });
      return true;
    }
    return { play: play, prefs: prefs, names: NAMES, list: () => Object.keys(SOUNDS), _ctx: () => { const c = ctx(); watch(c); return c; }, _reverb: reverb, _note: note, _tone: tone, M: M,
      reset: reset, get voices() { return voices; },
      // 7.2.2: 鳴っている効果音が鳴り終わるまでの残り（ミリ秒）。シャットダウン・再起動はこれを待つ
      left: () => Math.max(0, endAt - Date.now()),
      // soundd.service が止める・動かす（止めているあいだは起こし直さない）
      // 止めるときは、鳴っている効果音（シャットダウンの音など）が終わってから止める（7.2.2。前は途中で切れていた）
      hold(v) {
        held = !!v; clearTimeout(holdT); const c = BOOT.audio; if (!c) return;
        if (!held) { wake(c); return; }
        const stop = () => { if (held && c.state === 'running') c.suspend().catch(() => { /* 無視 */ }); };
        const wait = endAt - Date.now(); if (wait > 0) holdT = setTimeout(stop, wait); else stop();
      } };
  })();

  // ---------- アンビエントサウンド（BGM。5.2 から）。効果音と同じく、音のファイルを使わずにその場で合成する
  //   ゆっくり入れ替わる和音（パッド）に、ときどき鳴る柔らかいベル、曲調によって低い持続音や雨の音を重ねる。同じ流れは二度と出ない
  //   OS.bgm.apply() で設定（ユーザーの htui.prefs.bgm、ログイン前は /etc/config.json の bgm）どおりに鳴らす・止める。bgm.service が止まっていると鳴らない
  OS.bgm = (function () {
    const S = OS.sound, M = S.M;
    const STYLES = {
      calm:  { name: '穏やか', root: 48, bar: 9,  chords: [[0, 4, 7, 11, 14], [5, 9, 12, 16], [-3, 0, 4, 7, 11], [2, 5, 9, 12, 16]], scale: [0, 2, 4, 7, 9], bells: 3, cut: 900 },
      night: { name: '夜',     root: 45, bar: 11, chords: [[0, 3, 7, 10, 14], [-4, 0, 3, 7], [-7, -3, 0, 5], [-2, 2, 5, 9]], scale: [0, 3, 5, 7, 10], bells: 2, cut: 700 },
      space: { name: '宇宙',   root: 38, bar: 14, chords: [[0, 7, 14, 19], [0, 5, 12, 17], [0, 7, 15, 19], [0, 2, 9, 14]], scale: [0, 2, 7, 9, 14], bells: 2, cut: 600, drone: true },
      rain:  { name: '雨',     root: 50, bar: 8,  chords: [[0, 4, 9, 11], [-1, 2, 7, 9], [-3, 0, 4, 7], [-5, 0, 2, 7]], scale: [0, 2, 4, 7, 9, 11], bells: 4, cut: 1100, rain: true }
    };
    let cur = null; // 鳴っているもの: { c, master, style, vol, timers, nodes, step }
    function prefs() {
      let sys = {}; try { sys = config.get('bgm', {}) || {}; } catch (e) { /* 既定 */ }
      const p = { on: sys.on === true, vol: typeof sys.vol === 'number' ? sys.vol : 0.35, style: STYLES[sys.style] ? sys.style : 'calm' };
      const H = OS.htui, hp = H && H.running && H.user && H.prefs && H.prefs.bgm;
      if (H && H.running && H.user) { p.on = true; if (hp) { if ('on' in hp) p.on = hp.on !== false; if (typeof hp.vol === 'number') p.vol = hp.vol; if (STYLES[hp.style]) p.style = hp.style; } }
      p.vol = Math.max(0, Math.min(1, p.vol));
      return p;
    }
    const serviceOk = () => !(OS.init && OS.init.has('bgm.service') && !OS.init.isActive('bgm.service'));
    // パッド: 和音の音をまとめて、ゆっくり開く 1 つのローパスに通す（音ごとに少しずらした 2 つの波形）。
    //   6.0.6: 音ごとにフィルターを作っていたのをまとめ、波形も 3 つから 2 つにして軽くした
    function pad(c, out, t, freqs, dur, v, cut, stagger) {
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.4;
      lp.frequency.setValueAtTime(cut * 0.6, t); lp.frequency.linearRampToValueAtTime(cut * 1.3, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(cut * 0.7, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(3.5, dur * 0.35)); g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      freqs.forEach((f, k) => {
        const t0 = t + k * (stagger || 0);
        [['triangle', 0, 0.55], ['sawtooth', 7, 0.16]].forEach(([type, cents, gv]) => {
          const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents;
          const og = c.createGain(); og.gain.value = gv;
          o.connect(og); og.connect(lp); o.start(t0); o.stop(t + dur + 0.1);
          o.onended = () => { try { og.disconnect(); } catch (e) { /* 外れている */ } };
        });
      });
      lp.connect(g); g.connect(out);
      setTimeout(() => { try { lp.disconnect(); g.disconnect(); } catch (e) { /* 外れている */ } }, (dur + 1) * 1000);
    }
    // BGM のベル（基音と倍音の 2 つだけの軽い音）
    function bell(c, out, t, f, d, v) {
      S._tone(c, out, t, f, d, { v: v, a: 0.012 });
      S._tone(c, out, t, f * 2, d * 0.5, { v: v * 0.18, a: 0.008 });
    }
    // 小節を 1 つ、音の時計で t から鳴らす
    function bar(st, t) {
      const c = st.c, s = STYLES[st.style], dur = s.bar + 5;
      const ch = s.chords[st.step % s.chords.length]; st.step++;
      pad(c, st.bus, t, ch.map(n => M(s.root + n)), dur, 0.05 * Math.sqrt(ch.length) * 0.9, s.cut, 0.25);
      pad(c, st.bus, t, [M(s.root + ch[0] - 12)], dur, 0.06, s.cut * 0.6); // 低音
      // ときどき鳴る柔らかいベル（音階から選ぶ。鳴らない小節もある）
      const nb = Math.floor(Math.random() * (s.bells + 1));
      for (let i = 0; i < nb; i++) {
        const deg = s.scale[Math.floor(Math.random() * s.scale.length)], oct = Math.random() < 0.5 ? 24 : 36;
        bell(c, st.bells, t + 1 + Math.random() * (s.bar - 2), M(s.root + deg + oct), 2.6 + Math.random() * 2, 0.05 + Math.random() * 0.04);
      }
    }
    // 予定組み: 0.5 秒ごとに、音の時計で 1.5 秒先までの小節を組む。タイマーが遅れても音は途切れない。
    //   AudioContext が止まっているあいだは組まない（止まった時間に音がたまって、戻ったときに一度に鳴るのを防ぐ）
    function tick(st) {
      if (cur !== st) return;
      const c = st.c;
      if (c.state === 'closed') { cur = null; restart(); return; }
      if (c.state === 'running') {
        const s = STYLES[st.style], now = c.currentTime;
        if (st.next < now) st.next = now + 0.1; // 遅れすぎたら、今から組み直す
        while (st.next < now + 1.5) { bar(st, st.next); st.next += s.bar; }
      }
      st.timers = [setTimeout(() => tick(st), 500)];
    }
    function start(p) {
      const c = S._ctx(); if (!c) return false;
      const s = STYLES[p.style];
      const master = c.createGain(), lim = c.createDynamicsCompressor(), rv = S._reverb(c, 'bgm'), wet = c.createGain(), bus = c.createGain(), bells = c.createGain();
      master.gain.setValueAtTime(0.0001, c.currentTime); master.gain.linearRampToValueAtTime(p.vol * 0.8, c.currentTime + 4); // ゆっくり入る
      lim.threshold.value = -10; lim.ratio.value = 8;
      wet.gain.value = 0.55; bus.gain.value = 1; bells.gain.value = 0.9;
      bus.connect(master); bells.connect(master); bus.connect(rv.input); bells.connect(rv.input); rv.output.connect(wet); wet.connect(master);
      master.connect(lim); lim.connect(c.destination);
      const st = cur = { c: c, master: master, lim: lim, wet: wet, rv: rv, bus: bus, bells: bells, style: p.style, vol: p.vol, timers: [], nodes: [], step: Math.floor(Math.random() * 4), next: c.currentTime + 0.1 };
      if (s.drone) {
        [0, 7].forEach((n, i) => { const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); o.type = 'sine'; o.frequency.value = M(s.root - 12 + n); g.gain.value = i ? 0.025 : 0.05; lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(bus); o.start(); lfo.start(); st.nodes.push(o, lfo); });
      }
      if (s.rain) {
        const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; src.loop = true; bp.type = 'highpass'; bp.frequency.value = 900; lp.type = 'lowpass'; lp.frequency.value = 5200; g.gain.value = 0.035;
        src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master); src.start(); st.nodes.push(src);
      }
      tick(st);
      return true;
    }
    // AudioContext を作り直したあと: 今の設定で鳴らし直す
    function restart() {
      const st = cur; cur = null;
      if (st) { st.timers.forEach(clearTimeout); st.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 止まっている */ } }); }
      setTimeout(apply, 50);
    }
    function stop(fade) {
      const st = cur; if (!st) return; cur = null;
      st.timers.forEach(clearTimeout);
      const c = st.c, t = c.currentTime, f = fade == null ? 1.5 : fade;
      try { st.master.gain.cancelScheduledValues(t); st.master.gain.setValueAtTime(st.master.gain.value, t); st.master.gain.linearRampToValueAtTime(0.0001, t + f); } catch (e) { /* 無視 */ }
      setTimeout(() => { st.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 止まっている */ } }); [st.bus, st.bells, st.wet, st.master, st.lim].forEach(n => { try { n.disconnect(); } catch (e) { /* 外れている */ } }); try { st.rv.output.disconnect(st.wet); } catch (e) { /* 外れている */ } }, f * 1000 + 200);
    }
    // 設定どおりにする。鳴らすのは、ログインしていて（またはログイン前でシステムの設定がオン）、bgm.service が動いているとき
    function apply() {
      const p = prefs(), want = p.on && p.vol > 0 && serviceOk() && !OS._down && !!(OS.htui && OS.htui.running) && !(OS.power && OS.power.saving);
      if (!want) { stop(); return false; }
      if (cur && cur.style === p.style) {
        if (cur.vol !== p.vol) { cur.vol = p.vol; const t = cur.c.currentTime; cur.master.gain.cancelScheduledValues(t); cur.master.gain.setValueAtTime(cur.master.gain.value, t); cur.master.gain.linearRampToValueAtTime(p.vol * 0.8, t + 0.4); }
        return true;
      }
      if (cur) stop(2);
      const c = S._ctx(); if (!c) return false;
      if (c.state === 'running') return start(p);
      c.resume().then(() => { if (!cur && prefs().on) start(prefs()); }).catch(() => { /* まだ鳴らせない（クリックやキーのあとで） */ });
      return true;
    }
    // まだ音を出す許可がなかったとき: 最初のクリック・キーで鳴らし始める
    ['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, () => { if (!cur && OS.htui && OS.htui.running && OS.htui.user) { const p = prefs(); if (p.on) apply(); } }, { capture: true, passive: true }));
    return { apply: apply, stop: stop, prefs: prefs, styles: STYLES, _restart: restart, get playing() { return !!cur; }, get style() { return cur ? cur.style : null; } };
  })();

  // ---------- 電源管理（5.3 から）。設定は、ログイン中のユーザーの htui.prefs.power
  //   { onSleep: 'lock' | 'hibernate' | 'poweroff', saver: 省電力モード, autoSaver: バッテリーが減ったら自動で省電力, threshold: しきい値（%）, keepAwake: 端末をスリープさせない }
  //   ブラウザには「スリープした」ことを直接知る方法がないので、2 秒ごとのタイマーが大きく遅れたこと（タイムギャップ）でスリープからの復帰を知る。
  //   ページが見えているときは 15 秒以上、隠れているとき（タイマーが間引かれる）は 2 分以上の遅れをスリープとみなす。
  //   省電力モード: アニメーション・半透明のぼかしを止め、BGM を流さない。スリープさせない: Screen Wake Lock。バッテリーは Battery Status API。
  //   powerd.service が動いているあいだだけ働く（OS.power.start / stop）
  OS.power = (function () {
    const ACTIONS = { lock: 'ロック', hibernate: 'ハイバーネート', poweroff: '電源オフ' };
    const DEF = { onSleep: 'lock', saver: false, autoSaver: false, threshold: 20, keepAwake: false };
    const STEP = 2000;
    let on = false, timer = null, last = 0, battery = null, batReady = null, low = false, lock = null, wlBusy = false, logf = () => {};
    function prefs() {
      const H = OS.htui, u = H && H.running && H.user && H.prefs && H.prefs.power;
      const p = Object.assign({}, DEF, u || {});
      if (!ACTIONS[p.onSleep]) p.onSleep = 'lock';
      p.threshold = Math.max(5, Math.min(95, Math.round(Number(p.threshold)) || 20));
      return p;
    }
    // バッテリーのない機種でも getBattery は「充電中・100%・充電完了まで 0 秒」を返すので、それはバッテリーなしとみなす
    const hasBattery = () => !!battery && !(battery.charging && battery.level >= 1 && battery.chargingTime === 0);
    const saving = () => { if (!on) return false; const p = prefs(); return !!(p.saver || (p.autoSaver && low)); };
    function sync() {
      const sv = saving();
      if (OS.root) OS.root.classList.toggle('powersave', sv);
      if (OS.bgm && OS.htui && OS.htui.running) OS.bgm.apply();
      awake();
    }
    // バッテリーの残りがしきい値以下で、充電していなければ自動で省電力
    function checkBattery(quiet) {
      const p = prefs(), was = low;
      low = !!(on && p.autoSaver && hasBattery() && !battery.charging && battery.level * 100 <= p.threshold);
      if (was !== low) {
        logf('バッテリー ' + Math.round(battery.level * 100) + '%: 省電力モードを自動で' + (low ? 'オン' : 'オフ') + 'にしました');
        if (!quiet && !p.saver && OS.htui && OS.htui.user) OS.notify({ app: '電源管理', icon: 'battery', title: low ? '省電力モードをオンにしました' : '省電力モードをオフにしました', body: low ? 'バッテリーの残りが ' + Math.round(battery.level * 100) + '% になりました' : battery.charging ? '充電を始めました' : 'バッテリーの残りがしきい値を超えました' });
      }
      sync();
    }
    // 端末をスリープさせない（Screen Wake Lock。ページが隠れると外れるので、見えたらまた取る）
    async function awake() {
      const want = () => !!(on && prefs().keepAwake && OS.htui && OS.htui.running && OS.htui.user && document.visibilityState === 'visible' && !OS._down);
      if (wlBusy) return;
      if (want() && !lock && navigator.wakeLock) {
        wlBusy = true;
        try { const l = await navigator.wakeLock.request('screen'); lock = l; l.addEventListener('release', () => { if (lock === l) lock = null; }); } catch (e) { lock = null; }
        wlBusy = false;
        if (!want() && lock) awake();
      } else if (!want() && lock) {
        const l = lock; lock = null;
        try { await l.release(); } catch (e) { /* 外れている */ }
      }
    }
    function tick() {
      const now = Date.now(), gap = now - last; last = now;
      if (gap > STEP + (document.hidden ? 120000 : 15000)) slept(gap);
    }
    // スリープから戻ったとき: 設定どおりにロック・ハイバーネート・電源オフ
    function slept(ms) {
      const H = OS.htui;
      logf('端末が約 ' + Math.round(ms / 1000) + ' 秒スリープしていました');
      if (OS.ipc) { try { OS.ipc.publish('power.resume', { ms: ms }, 'powerd'); } catch (e) { /* 無視 */ } }
      if (!on || OS._down || !H || !H.running || !H.user) return null;
      const a = prefs().onSleep;
      logf('スリープから戻ったので' + ACTIONS[a] + 'します（' + H.user + '）');
      if (a === 'lock') H.lock();
      else if (a === 'hibernate') OS.hibernate();
      else OS.poweroff();
      return a;
    }
    const onVis = () => { if (document.visibilityState === 'visible') tick(); awake(); };
    function ready() {
      if (!batReady) batReady = navigator.getBattery ? navigator.getBattery().then(b => {
        battery = b;
        ['levelchange', 'chargingchange'].forEach(t => b.addEventListener(t, () => { if (on) checkBattery(); }));
      }).catch(() => { /* 使えない */ }) : Promise.resolve();
      return batReady;
    }
    function start(ctx) {
      logf = ctx && ctx.log ? m => ctx.log(m) : () => {};
      on = true; last = Date.now();
      clearInterval(timer); timer = setInterval(tick, STEP);
      document.addEventListener('visibilitychange', onVis);
      ready().then(() => { if (on) checkBattery(true); });
      sync();
    }
    function stop() {
      on = false; clearInterval(timer); timer = null; low = false;
      document.removeEventListener('visibilitychange', onVis);
      sync();
    }
    return {
      actions: ACTIONS, prefs: prefs, start: start, stop: stop, ready: ready, slept: slept,
      apply() { checkBattery(true); }, // 設定が変わったとき・ログイン・ログアウトのとき
      wakeLockOk: !!navigator.wakeLock,
      get running() { return on; }, get saving() { return saving(); }, get low() { return low; },
      get battery() { return battery; }, get hasBattery() { return hasBattery(); }, get wakeLock() { return !!lock; }
    };
  })();

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
      // ホームが無いか空のときだけ、サンプルのファイルも入れる。いつものフォルダ（Desktop など）は、無ければ毎回作る
      let empty = true;
      try { empty = !fs.exists(home) || !fs.list(home).length; } catch (e) { /* 読めなければ空とみなす */ }
      const o = { owner: name, parents: true };
      const mk = d => { const p = home + '/' + d; if (!fs.exists(p) && !fs.isLink(p)) { try { fs.mkdir(p, o); } catch (e) { /* 作れなければ飛ばす */ } } };
      if (name === 'root') { mk('.config'); return; }
      ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', '.config'].forEach(mk);
      if (!empty) return;
      const w = (p, c, bin) => fs.write(home + '/' + p, c, { owner: name, bin: bin });
      w('Documents/readme.txt', [
        OS.name + '（' + OS.version + '）へようこそ',
        '',
        'このOSは ' + OS.storeLabel() + ' にインストールされています。',
        base.idb ? '容量は最大 10GB です（ブラウザが割り当てた量がそれより少なければ、その量まで）。' : base.disk ? '容量は PC のフォルダの空きと、設定した上限しだいです。' : '容量は全体で約5MBです（画像や音声はすぐ一杯になります）。',
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
      w('Documents/hello.jsh', [
        '#!/bin/jsh',
        '# シェルスクリプト（.jsh）のサンプルです。Terminal で  ./Documents/hello.jsh 悠  か  run ~/Documents/hello.jsh 悠  と打つと動きます。',
        '# 1 行ずつ jsh の行として実行します。$1 は 1 つめの引数、$# は引数の数、$(コマンド) はそのコマンドの出力です。',
        'NAME=${1}',
        'echo こんにちは、${NAME} さん（引数は $# 個）',
        'echo ホームには $(ls ~ | wc -l) 個の項目があります',
        'echo Documents の .md ファイル: $(ls ~/Documents | grep -c .md) 個',
        'whoami && echo ↑ $(whoami) としてログインしています',
        '# if や for は JavaScript で書きます。{ が閉じるまでの行はまとめて実行します',
        'for (const n of [3, 2, 1]) {',
        '  echo(n + "...");',
        '  await sleep(300);',
        '}',
        'echo おしまい',
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

  // ---------- HDD1（File System Access API で選んだ PC のフォルダ）
  //   htmlOS を LocalStorage から起動しているときは /mnt/hdd1 に接続（マウント）する。
  //   HDD1 から起動しているときは HDD1 が / そのものなので、/mnt/hdd1 には何もつながない
  //   7.0: HDD3 も同じ仕組み（もう 1 つの PC のフォルダ。/mnt/hdd3）。ドライブを /mnt に付ける OS.mountStore も（RAID が使う）
  const HDD_AT = '/mnt/hdd1', HD = BOOT.hdd || { supported: false };
  OS.mountStore = function (at, s) {
    if (mounts.some(m => m.at === at)) throw new Error(at + ' にはもう別のドライブがつながっています');
    if (!base.get(K('/mnt'))) base.set(K('/mnt'), JSON.stringify({ t: 'd', m: Date.now(), o: 'root' }));
    mounts.push({ at: at, key: K(at), s: s }); changed('/mnt'); changed(at);
  };
  OS.unmountStore = async function (at) {
    const i = mounts.findIndex(m => m.at === at); if (i < 0) return false;
    await mounts[i].s.flush(); mounts.splice(i, 1); changed(at); changed('/mnt'); return true;
  };
  OS.mounts = () => mounts.map(m => ({ at: m.at, name: m.s.name, label: m.s.label || null }));
  // id: 'hdd1' / 'hdd3'（フォルダのハンドルを IndexedDB に覚える名前）、label: 表示名、at: つなぐ場所
  function folderDrive(id, label, at) {
    const d = {
      id: id, label: label, at: at,
      get supported() { return !!HD.supported; },
      get root() { return id === 'hdd1' && !!base.disk; },
      get mounted() { return mounts.some(m => m.at === at); },
      get name() { const m = mounts.find(x => x.at === at); return m ? m.s.name : d.root ? base.name : null; },
      waiting: null, // 前に使ったフォルダ（許可を待っている）の名前
      // 接続する。pick=true なら別のフォルダを選び直す。ボタンやコマンドなど、ユーザーの操作の中で呼ぶこと
      async mount(pick, progress) {
        if (d.root) throw new Error('htmlOS は HDD1 から起動しています（HDD1 は / そのものです）');
        if (!HD.supported) throw new Error('このブラウザは File System Access API（showDirectoryPicker）に対応していません。パソコンの Chrome・Edge などで使えます');
        if (d.mounted) throw new Error(label + ' はすでに ' + at + ' に接続されています');
        let dir = pick ? null : await d.handle();
        if (!dir) dir = await HD.pick(id);
        if (!(await HD.allowed(dir, true))) throw new Error('フォルダを使う許可がもらえませんでした');
        return attach(d, dir, progress);
      },
      async unmount() {
        if (!d.mounted) throw new Error(label + ' は接続されていません');
        await OS.unmountStore(at);
      },
      // 覚えているフォルダを忘れる（PC のフォルダの中身は消さない）
      async forget() { if (d.mounted) await d.unmount(); d.waiting = null; await HD.forget(id); },
      handle: () => HD.saved ? HD.saved(id) : Promise.resolve(null),
      // フォルダを選んで覚えるだけ（つながない。RAID 用など）
      async pick() { const dir = await HD.pick(id); if (!(await HD.allowed(dir, true))) throw new Error('フォルダを使う許可がもらえませんでした'); await HD.save(dir, id); d.waiting = null; return dir; },
      // 許可を確かめて（ask なら求めて）ハンドルを返す。なければ null
      async access(ask) { const dir = await d.handle(); if (!dir) return null; return (await HD.allowed(dir, !!ask)) ? dir : null; },
      // 起動したとき: 前に使ったフォルダがあって、許可が残っていれば自動で接続する
      async auto() {
        if (d.root || !HD.supported || d.mounted) return null;
        const dir = await d.handle(); if (!dir) return null;
        if (!(await HD.allowed(dir, false))) { d.waiting = dir.name; return null; }
        return attach(d, dir);
      },
      flush: () => Promise.all(mounts.map(m => m.s.flush()))
    };
    return d;
  }
  async function attach(d, dir, progress) {
    const s = await HD.open(dir, d.at, progress);
    s.onerror = (what, e) => { if (OS.notify && OS.htui && OS.htui.user) OS.notify({ app: d.label, icon: 'archive', title: d.label + ' に書き込めませんでした', body: what + ': ' + ((e && e.message) || e) }); };
    OS.mountStore(d.at, s);
    d.waiting = null;
    await HD.save(dir, d.id);
    return { name: dir.name, items: s.count() - 1, skipped: s.skipped };
  }
  const hdd = OS.hdd = folderDrive('hdd1', 'HDD1', HDD_AT);
  OS.hdd3 = folderDrive('hdd3', 'HDD3', '/mnt/hdd3');
  // 書き出しが終わっていないうちにページを閉じようとしたら止める
  window.addEventListener('beforeunload', e => { if ([base].concat(mounts.map(m => m.s)).some(s => s.pending && s.pending())) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- sudo（5.1 から）。/etc/sudoers の書き方（1 行に 1 つ）:
  //     ユーザー名 ALL=(ALL) ALL          そのユーザーは何でも root で実行できる（自分のパスワードで）
  //     %グループ ALL=(ALL) NOPASSWD: ALL  そのグループはパスワードなしで
  //     ユーザー名 ALL=(ALL) systemctl,ps  決めたコマンドだけ
  //   /etc/sudoers がなければ「%sudo ALL=(ALL) ALL」（管理者は sudo グループ）。一度通ると 5 分間はパスワードを聞かない
  const sudo = OS.sudo = {
    TIMEOUT: 5 * 60 * 1000, stamps: {},
    file: '/etc/sudoers',
    lines() {
      let t = null; try { t = fs.read(sudo.file); } catch (e) { t = null; }
      if (t == null) t = 'root ALL=(ALL) ALL\n%sudo ALL=(ALL) ALL\n';
      return t.split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
    },
    // name が sudo できるか: { ok, nopass, cmds: ['ALL'] か コマンド名の一覧, line }
    rule(name) {
      const groups = OS.perm ? OS.perm.groupsOf(name) : [name];
      for (const l of sudo.lines()) {
        const m = /^(%?[\w.-]+)\s+\S+=\s*(?:\([^)]*\)\s*)?(NOPASSWD:\s*)?(.+)$/.exec(l); if (!m) continue;
        const who = m[1], hit = who[0] === '%' ? groups.includes(who.slice(1)) : who === name;
        if (!hit) continue;
        const cmds = m[3].split(',').map(s => s.trim().split(/\s+/)[0].replace(/^.*\//, '')).filter(Boolean);
        return { ok: true, nopass: !!m[2], cmds: cmds, line: l };
      }
      return { ok: false, nopass: false, cmds: [], line: null };
    },
    allows(r, cmd) { return r.ok && (r.cmds.includes('ALL') || r.cmds.includes(cmd)); },
    fresh(name) { const t = sudo.stamps[name]; return !!t && Date.now() - t < sudo.TIMEOUT; },
    forget(name) { delete sudo.stamps[name]; },
    log(msg, prio) { if (OS.journal) OS.journal.log('sudo', msg, { prio: prio == null ? 5 : prio }); },
    // 認証。ask(回数) は自分のパスワードを返す（キャンセルは null）。3 回まで
    async auth(name, ask, what) {
      const u = users.get(name);
      if (u && u.root) return true;
      const r = sudo.rule(name);
      if (!r.ok) { sudo.log(name + ' : sudoers に入っていません ; COMMAND=' + (what || ''), 3); throw new Error(name + ' は sudoers ファイルに入っていません。この出来事は記録されます'); }
      if (r.nopass || sudo.fresh(name)) { sudo.stamps[name] = Date.now(); return true; }
      if (!u || !u.pw) throw new Error(name + ' にパスワードがないので sudo を使えません（passwd で設定してください）');
      for (let i = 1; i <= 3; i++) {
        const pw = await ask(i);
        if (pw == null) return false;
        if (await users.verify(name, pw)) { sudo.stamps[name] = Date.now(); return true; }
        sudo.log(name + ' : パスワードが違います（' + i + ' 回目）', 4);
      }
      sudo.log(name + ' : 3 回パスワードを間違えました ; COMMAND=' + (what || ''), 3);
      throw new Error('sudo: 3 回パスワードを間違えました');
    }
  };

  // ---------- パーミッション（5.1 から。UNIX と同じ rwx）
  //   ノードの p = モード（数。例 0o644）、o = 所有者、g = グループ。p や g がない古いノードは、場所から既定を決める:
  //     /root と /home/ユーザー は 700、/tmp は 1777（だれでも作れるが、消せるのは自分のものだけ）、/mnt/hdd1 は 777、
  //     /etc/passwd は 600、/etc/sudoers は 440、
  //     ほかのディレクトリは 755、ファイルは 644、シンボリックリンクは 777
  //   グループ: ユーザー名と同じグループ・管理者は sudo・root は root、それに /etc/passwd の groups
  //   root はモードに関係なく読み書きできる（実行は x がどれかに付いているとき）
  const perm = OS.perm = {
    def(q, n) {
      if (n && n.p != null) return n.p;
      if (n && n.t === 'l') return 0o777;
      if (q === '/tmp') return 0o1777;
      if (q === '/etc/passwd') return 0o600;   // パスワードのハッシュが入っているので root だけ
      if (q === '/etc/sudoers') return 0o440;
      if (q === '/root' || /^\/home\/[^/]+$/.test(q)) return 0o700;
      if (q === HDD_AT || q.startsWith(HDD_AT + '/')) return n && n.t === 'd' ? 0o777 : 0o666;
      return n && n.t === 'd' ? 0o755 : 0o644;
    },
    group(n) { return (n && (n.g || n.o)) || 'root'; },
    groupsOf(name) {
      const u = users.get(name); if (!u) return [name];
      const g = [name].concat(u.root ? ['root'] : [], u.admin ? ['sudo'] : [], Array.isArray(u.groups) ? u.groups : []);
      return Array.from(new Set(g));
    },
    // 実際のパス q のノード n に、ユーザー name が bit（4 読む・2 書く・1 実行/中に入る）を持つか
    has(name, q, n, bit) {
      if (!n) return false;
      const u = users.get(name), mode = perm.def(q, n);
      if (u && u.root) return bit !== 1 || n.t === 'd' || (mode & 0o111) !== 0;
      const sh = n.o === name ? 6 : perm.groupsOf(name).includes(perm.group(n)) ? 3 : 0;
      return ((mode >> sh) & bit) === bit;
    },
    // 実際のパス q の親ディレクトリを、上から順に「中に入れる（x）」か
    traverse(name, q) {
      const parts = q.split('/').filter(Boolean); let cur = '';
      for (let i = 0; i < parts.length - 1; i++) { cur += '/' + parts[i]; const n = fs._raw(cur); if (n && n.t === 'd' && !perm.has(name, cur, n, 1)) return cur; }
      if (parts.length && !perm.has(name, '/', fs._raw('/') || { t: 'd', o: 'root' }, 1)) return '/';
      return null;
    },
    // ls -l の "drwxr-xr-x"
    str(n, q) {
      const m = perm.def(q, n), t = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : n.t === 'p' ? 'p' : n.x === 'c' || n.x === 'b' ? n.x : '-';
      const r = (v, s, x) => (v & 4 ? 'r' : '-') + (v & 2 ? 'w' : '-') + (s ? (v & 1 ? x : x.toUpperCase()) : (v & 1 ? 'x' : '-'));
      return t + r(m >> 6, m & 0o4000, 's') + r(m >> 3, m & 0o2000, 's') + r(m, m & 0o1000, 't');
    },
    oct: m => (m & 0o7777).toString(8).padStart(4, '0'),
    // chmod のモード: 8 進（755）か記号（u+x、go-w、a=r、+x、u+rwx,g+rx）
    parse(spec, cur, isDir) {
      if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
      let m = cur;
      String(spec).split(',').forEach(part => {
        const x = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(part);
        if (!x) throw new Error(spec + ': モードの書き方が正しくありません（例: 755、u+x、go-w、a=r）');
        const who = x[1] || 'a', all = who.includes('a');
        let bits = 0;
        for (const c of x[3]) {
          const v = c === 'r' ? 4 : c === 'w' ? 2 : c === 'x' ? 1 : c === 'X' ? (isDir || (cur & 0o111) ? 1 : 0) : 0;
          if (all || who.includes('u')) bits |= v << 6;
          if (all || who.includes('g')) bits |= v << 3;
          if (all || who.includes('o')) bits |= v;
          if (c === 's') { if (all || who.includes('u')) bits |= 0o4000; if (all || who.includes('g')) bits |= 0o2000; }
          if (c === 't') bits |= 0o1000;
        }
        if (x[2] === '+') m |= bits;
        else if (x[2] === '-') m &= ~bits;
        else { let mask = 0; if (all || who.includes('u')) mask |= 0o4700; if (all || who.includes('g')) mask |= 0o2070; if (all || who.includes('o')) mask |= 0o1007; m = (m & ~mask) | bits; }
      });
      return m & 0o7777;
    }
  };
  // root の FS でのモード・所有者の変更（権限の確認は fsFor で）
  fs.chmod = function (p, mode) {
    const q = fs.real(p), n = fs._raw(q); if (!n) throw new Error(p + ': そのようなファイルはありません');
    put(q, Object.assign({}, n, { p: mode & 0o7777 })); changed(q);
  };
  fs.chown = function (p, owner, group) {
    const q = fs.real(p), n = fs._raw(q); if (!n) throw new Error(p + ': そのようなファイルはありません');
    const o = Object.assign({}, n); if (owner) o.o = owner; if (group) o.g = group;
    put(q, o); changed(q);
  };

  // ---------- 権限つきファイルシステム（ユーザー getUser() として操作する）
  //   読む: 親をたどる x と、そのものの r。書く: そのものの w（新しく作るときは親の w と x）。
  //   消す・移す: 親の w と x（親に t（スティッキー）があれば、自分のものか親の所有者のときだけ）
  //   umask: 新しく作るときに外すビット（既定 022）。getUmask で渡す
  OS.fsFor = function (getUser, getUmask) {
    const who = () => getUser();
    const um = () => { const v = getUmask ? getUmask() : 0o022; return typeof v === 'number' ? v : 0o022; };
    const realOf = p => { try { return fs.real(p); } catch (e) { return p; } };
    const hereOf = p => { try { return fs._here(p); } catch (e) { return p; } };
    const deny = (p, what) => { const e = new Error(p + ': 許可がありません' + (what ? '（' + what + '）' : '')); e.code = 'EACCES'; throw e; };
    const trav = (p, q) => { const bad = perm.traverse(who(), q); if (bad) deny(p, bad + ' の中に入る許可（x）がありません'); };
    const R = p => { const q = realOf(p); trav(p, q); const n = fs._raw(q); if (n && !perm.has(who(), q, n, 4)) deny(p, '読む許可（r）がありません'); return p; };
    const T = p => { trav(p, realOf(p)); return p; };
    // 親ディレクトリに作る・消す許可
    const parentW = (p, q) => {
      const d = path.dir(q), dn = fs._raw(d);
      trav(p, q);
      if (dn && !perm.has(who(), d, dn, 3)) deny(p, d + ' に書き込む許可（w）がありません');
    };
    const W = p => {
      const q = realOf(p), n = fs._raw(q);
      if (n) { trav(p, q); if (!perm.has(who(), q, n, 2)) deny(p, '書き込む許可（w）がありません'); }
      else parentW(p, q);
      return p;
    };
    const C = p => { parentW(p, hereOf(p)); return p; }; // 作る
    const sticky = (p, q) => {
      const d = path.dir(q), dn = fs._raw(d), n = fs._raw(q), u = users.get(who());
      if (u && u.root) return;
      if (dn && (perm.def(d, dn) & 0o1000) && n && n.o !== who() && dn.o !== who()) deny(p, d + ' はスティッキーなので、ほかのユーザーのものは消せません');
    };
    const D = (p, recursive) => { // 消す
      const q = hereOf(p); parentW(p, q); sticky(p, q);
      const n = fs._raw(q);
      if (recursive && n && n.t === 'd') {
        const walk = d => { const dn = fs._raw(d); if (!perm.has(who(), d, dn, 7)) deny(p, d + ' の中を消す許可がありません'); fs.list(d).forEach(c => { const cq = d + '/' + c, cn = fs._raw(cq); if (cn && cn.t === 'd') walk(cq); }); };
        walk(q);
      }
      return p;
    };
    const ok = p => { try { T(p); return true; } catch (e) { return false; } };
    const canR = p => { try { R(p); return true; } catch (e) { return false; } };
    const canW = p => { try { W(p); return true; } catch (e) { return false; } };
    const newMode = (isDir) => (isDir ? 0o777 : 0o666) & ~um();
    const isRoot = () => { const u = users.get(who()); return !!(u && u.root); };
    return {
      stat: p => fs.stat(T(p)), lstat: p => fs.lstat(T(p)), exists: p => ok(p) && fs.exists(p), isDir: p => ok(p) && fs.isDir(p), isFile: p => ok(p) && fs.isFile(p),
      isLink: p => ok(p) && fs.isLink(p), readlink: p => fs.readlink(T(p)), real: fs.real,
      list: p => fs.list(R(p)), read: p => fs.read(R(p)),
      write: (p, c, o) => { W(p); const q = realOf(p), old = fs._raw(q); return fs.write(p, c, Object.assign({}, o, old ? {} : { owner: who(), mode: newMode(false) })); },
      mkdir: (p, o) => {
        o = Object.assign({}, o);
        if (o.parents) { const parts = path.norm(p).split('/').filter(Boolean); let cur = ''; for (const x of parts) { cur += '/' + x; if (!fs.exists(cur)) { C(cur); fs.mkdir(cur, { owner: who(), mode: newMode(true) }); } } return; }
        C(p); return fs.mkdir(p, Object.assign(o, { owner: who(), mode: newMode(true) }));
      },
      symlink: (t, p) => { C(p); return fs.symlink(t, p, { owner: who() }); },
      mkfifo: p => { C(p); return fs.mkfifo(p, { owner: who(), mode: newMode(false) }); },
      rm: (p, o) => { D(p, o && o.recursive); return fs.rm(p, o); },
      cp: (a, b) => { R(a); C(fs.dest(a, b)); return fs.cp(a, b, { owner: who(), umask: um() }); },
      mv: (a, b) => { D(a, false); C(fs.dest(a, b)); return fs.mv(a, b); },
      chmod: (p, mode) => {
        const q = realOf(p), n = fs._raw(q); T(p);
        if (!n) throw new Error(p + ': そのようなファイルはありません');
        if (!isRoot() && n.o !== who()) deny(p, 'モードを変えられるのは所有者か root だけです');
        fs.chmod(p, typeof mode === 'number' ? mode : perm.parse(mode, perm.def(q, n), n.t === 'd'));
      },
      chown: (p, owner, group) => {
        const q = realOf(p), n = fs._raw(q); T(p);
        if (!n) throw new Error(p + ': そのようなファイルはありません');
        if (owner && owner !== n.o && !isRoot()) deny(p, '所有者を変えられるのは root だけです（sudo chown）');
        if (group && !isRoot() && (n.o !== who() || !perm.groupsOf(who()).includes(group))) deny(p, 'グループを変えられるのは、そのグループに入っている所有者か root だけです');
        if (owner && !users.get(owner)) throw new Error(owner + ': そのようなユーザーはいません');
        fs.chown(p, owner, group);
      },
      // 実行してよいか（スクリプト）。モードを付けていない古いファイルは読めれば実行できる
      canExec: p => { const q = realOf(p), n = fs._raw(q); if (!n || !canR(p)) return false; if (n.p == null) return true; return perm.has(who(), q, n, 1); },
      access: (p, m) => { try { if (/r/.test(m)) R(p); if (/w/.test(m)) W(p); return true; } catch (e) { return false; } },
      usage: fs.usage, kind: fs.kind, mime: fs.mime, dataURL: p => fs.dataURL(R(p)), unique: fs.unique, canWrite: canW, canRead: canR, watch: fs.watch,
      user: who
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
      if (s.indexOf('\x07') >= 0) { s = s.replace(/\x07/g, ''); OS.sound.play('bell'); if (!s) return; }
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
    focus() { if (this._screen) this._screen.focus(); else this.input.focus(); }
    // ---- 全画面の TUI（4.0）。const s = tty.screen(); s.render(行); const k = await s.key(); s.close()
    //   行は文字列か、[文字, 色]（色: accent dim ok err sel head prompt）の配列。
    //   key() は { key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Escape' | 'Tab' | 'Backspace' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'text', text, ctrl, shift }
    //   SDK 4（Mars）から: alt（Alt+文字）、'F1'〜'F12'、'click'（row, col）、'resize'、貼り付けは改行入りの text（paste: true）。size() / fixed(on)
    //   日本語入力（IME）で確定した文字も key: 'text' で届く
    screen() {
      if (this._screen) return this._screen;
      const self = this, q = [], waiters = [];
      const view = h('pre', { class: 'tty-tui', 'aria-live': 'polite' });
      const inp = h('input', { class: 'tty-tui-key', 'aria-label': 'キー入力（矢印キー・Enter・Esc）', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      const push = ev => { const w = waiters.shift(); if (w) w(ev); else q.push(ev); };
      const NAV = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
      // SDK 4（Mars）: Alt+文字・F1〜F12・Ctrl+記号・Ctrl+矢印も届ける（nano などのエディタ用）。Alt の文字はキーの位置（e.code）から決める
      const codeKey = c => { const m = /^(?:Key|Digit)(\w)$/.exec(c || ''); if (m) return m[1].toLowerCase(); return { Backslash: '\\', Slash: '/', Comma: ',', Period: '.', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Space: ' ' }[c] || null; };
      inp.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey && !e.altKey && /^[a-z]$/i.test(e.key)) { e.preventDefault(); push({ key: e.key.toLowerCase(), ctrl: true, shift: e.shiftKey }); return; }
        if (NAV.includes(e.key)) { e.preventDefault(); e.stopPropagation(); push({ key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }); return; }
        if (/^F([1-9]|1[0-2])$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); push({ key: e.key, shift: e.shiftKey }); return; }
        if (e.altKey && !e.ctrlKey) { const k = codeKey(e.code); if (k) { e.preventDefault(); e.stopPropagation(); push({ key: k, alt: true, shift: e.shiftKey }); } return; }
        if (e.ctrlKey && !e.altKey) { const k = codeKey(e.code); if (k && !/^[0-9]$/.test(k)) { e.preventDefault(); push({ key: e.shiftKey && k === '-' ? '_' : k, ctrl: true, shift: e.shiftKey }); } }
      });
      // 貼り付けは改行を残したまま 1 つの text として届ける
      inp.addEventListener('paste', e => { const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); push({ key: 'text', text: t.replace(/\r\n?/g, '\n'), paste: true }); } });
      const flush = () => { if (inp.value) { push({ key: 'text', text: inp.value }); inp.value = ''; } };
      inp.addEventListener('input', e => { if (!e.isComposing) flush(); });
      inp.addEventListener('compositionend', () => setTimeout(flush, 0));
      // タッチ用のキー
      const tk = (label, key) => { const b = h('button', { class: 'tty-key', type: 'button', tabindex: '-1' }, label); b.addEventListener('pointerdown', e => { e.preventDefault(); inp.focus(); push({ key: key }); }); return b; };
      const keys = h('div', { class: 'tty-keys tty-tuikeys' }, tk('↑', 'ArrowUp'), tk('↓', 'ArrowDown'), tk('←', 'ArrowLeft'), tk('→', 'ArrowRight'), tk('Enter', 'Enter'), tk('Esc', 'Escape'), tk('⌫', 'Backspace'));
      const box = h('div', { class: 'tty-tuibox' }, view, inp);
      box.addEventListener('click', () => inp.focus());
      // 文字 1 つの幅と行の高さ（ch 単位で測る）
      const cell = () => { const m = h('span', { style: 'position:absolute;visibility:hidden;white-space:pre' }, '0000000000'); view.append(m); const r = m.getBoundingClientRect(); m.remove(); return { w: r.width / 10 || 8, h: r.height || 19 }; };
      // 文字の位置でのクリック（SDK 4）: { key: 'click', row, col }
      view.addEventListener('mousedown', e => { if (e.button) return; const c = cell(), r = view.getBoundingClientRect(); push({ key: 'click', row: Math.floor((e.clientY - r.top) / c.h), col: Math.floor((e.clientX - r.left) / c.w) }); });
      // 大きさが変わったら { key: 'resize' } を届ける
      let ro = null, lastSize = '';
      if (window.ResizeObserver) { ro = new ResizeObserver(() => { const z = box.clientWidth + 'x' + box.clientHeight; if (z !== lastSize) { const first = !lastSize; lastSize = z; if (!first) push({ key: 'resize' }); } }); ro.observe(box); }
      this.scr.style.display = 'none'; this.keys.style.display = 'none';
      this.el.insertBefore(box, this.keys); this.el.insertBefore(keys, this.keys);
      const seg = s => Array.isArray(s) ? h('span', { class: 't-' + s[1] }, s[0]) : document.createTextNode(String(s));
      const sc = this._screen = {
        render(rows) {
          view.textContent = '';
          rows.forEach(r => { (Array.isArray(r) && Array.isArray(r[0]) ? r : [r]).forEach(x => view.append(seg(x))); view.append('\n'); });
          const sel = view.querySelector('.t-sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
        },
        key() { return q.length ? Promise.resolve(q.shift()) : new Promise(r => waiters.push(r)); },
        focus() { inp.focus(); },
        // SDK 4: 画面に入る文字数と行数。fixed(true) で折り返さずにぴったり並べる表示にする（エディタ用）
        size() { const c = cell(), cs = getComputedStyle(box), pw = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), ph = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom); return { cols: Math.max(20, Math.floor((box.clientWidth - pw) / c.w)), rows: Math.max(6, Math.floor((box.clientHeight - ph) / c.h)) }; },
        fixed(on) { box.classList.toggle('tty-fixed', !!on); },
        close() { if (ro) ro.disconnect(); box.remove(); keys.remove(); self.scr.style.display = ''; self.keys.style.display = ''; self._screen = null; while (waiters.length) waiters.shift()({ key: 'Escape' }); if (self.wantsFocus()) self.input.focus(); }
      };
      if (this.wantsFocus()) inp.focus();
      return sc;
    }
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
      if (typeof r === 'string' && r !== this.input.value) this.input.value = r;
      else if (Array.isArray(r) && r.length) { this._echo(p, this.input.value); this.println(r.join('  '), 'dim'); }
      else OS.sound.play('bell'); // 補完できるものがない
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
    // 待っている read を、何も表示せずに取りやめる（null を返す）
    abort() { const p = this.pending; if (!p) return; this.pending = null; this.line.style.display = 'none'; p.res(null); }
    dispose() { if (this._screen) this._screen.close(); this.pending = null; if (this._ro) this._ro.disconnect(); this.el.remove(); }
  }
  OS.Tty = Tty;

  // ---------- コード実行
  OS.exec = function (code, name) { return (0, eval)(code + '\n//# sourceURL=hfs://' + name); };
  OS.loadFile = function (p) { return OS.exec(fs.read(p), p); };
  OS.registerApp = function (def) {
    def.pkg = OS._loading || null;
    // 7.3.1: パッケージ（/apps）は標準のアプリ（/sys/apps）を上書きできない（7.2 までの hStore のサンプル hclock.js が 7.3 の hClock を隠していた）
    const cur = OS.apps[def.id];
    if (def.pkg && cur && !cur.pkg) throw new Error('アプリの ID「' + def.id + '」は標準のアプリ（' + cur.name + '）が使っているので、パッケージでは使えません');
    OS.apps[def.id] = def;
  };
  // jsh のコマンドを足す（4.0）。run(args, sh) の sh には print / read / stdin / cwd / abs / fs / cmd / getopts などが入る
  //   OS.registerCommand({ name: 'hello', usage: 'hello [名前]', desc: 'あいさつ', run(args, sh) { return 'こんにちは ' + (args[0] || sh.user); } })
  OS.commands = {};
  OS.registerCommand = function (def) {
    if (!def || !/^[A-Za-z_][\w-]*$/.test(def.name || '')) throw new Error('コマンドの名前は英数字・_・- で書いてください');
    if (typeof def.run !== 'function') throw new Error(def.name + ': run(args, sh) がありません');
    def.pkg = OS._loading || null; OS.commands[def.name] = def;
    return def;
  };

  // ---------- パッケージ（あとから入れるアプリ。/apps/*.js に置かれ、起動時に読み込まれる）
  OS.pkg = {
    dir: '/apps',
    errors: {}, // 起動のときに読み込めなかったパッケージ: 名前 → 理由（hStore に出す）
    list() { return fs.isDir('/apps') ? fs.list('/apps').filter(n => n.endsWith('.js')) : []; },
    load(name) { OS._loading = name; try { OS.exec(fs.read('/apps/' + name), '/apps/' + name); } finally { OS._loading = null; } },
    _admin(user) { if (!users.isRoot(user)) throw new Error('パッケージの追加・削除には root 権限が必要です（jsh では su で root になってください）'); },
    _unregister(name) {
      for (const id in OS.apps) if (OS.apps[id].pkg === name) delete OS.apps[id];
      for (const n in OS.commands) if (OS.commands[n].pkg === name) delete OS.commands[n];
      for (const id in OS.sessions) if (OS.sessions[id].pkg === name) delete OS.sessions[id];
    },
    install(name, code, user) {
      OS.pkg._admin(user);
      name = String(name).replace(/[^\w.-]/g, '_'); if (!name.endsWith('.js')) name += '.js';
      if (!/register(App|Command|Session)\s*\(/.test(code)) throw new Error('パッケージではありません（OS.registerApp・OS.registerCommand・OS.registerSession のどれも見つかりません）');
      fs.mkdir('/apps', { parents: true });
      const old = fs.exists('/apps/' + name) ? fs.read('/apps/' + name) : null;
      OS.pkg._unregister(name);
      fs.write('/apps/' + name, code, { owner: user });
      try { OS.pkg.load(name); delete OS.pkg.errors[name]; }
      catch (e) { OS.pkg._unregister(name); if (old == null) fs.rm('/apps/' + name); else { fs.write('/apps/' + name, old); try { OS.pkg.load(name); } catch (e2) { /* 元も壊れている */ } } throw new Error('パッケージの読み込みに失敗しました: ' + e.message); }
      if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
      return name;
    },
    remove(name, user) {
      OS.pkg._admin(user);
      if (!fs.exists('/apps/' + name)) throw new Error(name + ': そのようなパッケージはありません');
      fs.rm('/apps/' + name); OS.pkg._unregister(name); delete OS.pkg.errors[name];
      if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
    }
  };
  OS.launch = function (id, arg) {
    if (!OS.htui || !OS.htui.running || !OS.htui.user) throw new Error('HTUi が起動していません。「htui start」でデスクトップを起動してください');
    const a = OS.apps[id];
    if (!a) throw new Error(id + ': そのようなアプリはありません');
    const before = new Set(OS.htui.wins);
    const r = a.launch(arg);
    if (typeof arg === 'string') OS.htui.wins.forEach(w => { if (!before.has(w) && !w.parent && w.launchArg === undefined) w.launchArg = arg; });
    return r;
  };
  OS.openFile = function (p) {
    const k = fs.kind(p);
    if (k === 'image' || k === 'audio' || k === 'video') return OS.launch('hplayer', p);
    if (k === 'html') return OS.launch('hbrowser', 'hfs:' + p);
    if (path.ext(p) === 'md' && OS.apps.hmd) return OS.launch('hmd', p);
    if (k === 'archive' && OS.apps.harchive) return OS.launch('harchive', p); // 7.3
    const s = fs.stat(p);
    if (s && s.b) throw new Error(path.base(p) + ': このバイナリファイルを開けるアプリがありません');
    return OS.launch('hedit', p);
  };

  // ---------- ネットワーク
  //   CORS プロキシは外部の無料サービスなので、よく止まる。上から順に 2 秒ずつずらして同時に試し、最初に返事が来たものを使う（ほかは取りやめる）。
  //   うまくいったプロキシは覚えておき、次からは最初に試す。
  //   書き方: {url} がエンコードした URL に置き換わる。後ろに「 json:キー」を付けると、JSON で返すプロキシの そのキー を中身として使う
  const OLD_PROXIES = [['https://corsproxy.io/?url={url}', 'https://api.allorigins.win/raw?url={url}', 'https://api.codetabs.com/v1/proxy?quest={url}']]; // 5.1.1 までの既定
  // 試す順番は起動時に決める（proxyrank.service が各プロキシで example.com を取ってみて、届いたものを速い順に。届かなかったものは最後）
  let ranked = null;
  const order = () => { const l = proxyList(); return ranked && ranked.key === JSON.stringify(l) ? ranked.order.slice() : l.slice(); };
  const proxyList = () => {
    let l = config.get('proxies', null);
    // 4.x〜5.1.1 の既定のまま保存されていたら、新しい既定に置き換える
    if (!Array.isArray(l) || !l.length || OLD_PROXIES.some(o => JSON.stringify(o) === JSON.stringify(l))) l = DEFAULT_PROXIES;
    return l;
  };
  const hostOf = u => { try { return new URL(u).host; } catch (e) { return u; } };
  const PROXY_ERR = [401, 403, 407, 408, 429, 451, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530];
  OS.net = {
    defaults: DEFAULT_PROXIES,
    list: proxyList,
    proxied(url) { return proxyList().map(t => t.split(/\s+json:/)[0].trim().replace('{rawurl}', url).replace('{url}', encodeURIComponent(url))); },
    // 1 つの URL を取りに行く。tpl はプロキシの書き方（直接なら null）
    async _one(url, tpl, signal, timeout, any) {
      const jsonKey = tpl && (tpl.match(/\s+json:([\w.]+)\s*$/) || [])[1];
      const u = tpl ? tpl.split(/\s+json:/)[0].trim().replace('{rawurl}', url).replace('{url}', encodeURIComponent(url)) : url;
      const ac = new AbortController(), stop = () => ac.abort();
      if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', stop, { once: true }); }
      const tm = setTimeout(() => { ac.timedOut = true; ac.abort(); }, timeout);
      try {
        const r = await fetch(u, { signal: ac.signal, credentials: 'omit' });
        // any: サイトの 404 なども返す（ページのスクリプト用）。ただしプロキシ自身のエラーらしいものは次を試す
        if (!r.ok && !(any && !jsonKey && (!tpl || !PROXY_ERR.includes(r.status)))) throw new Error('HTTP ' + r.status);
        if (!jsonKey) { await r.clone().arrayBuffer(); return r; } // 中身まで届くのを確かめる
        const j = await r.json(), v = jsonKey.split('.').reduce((o, k) => o == null ? o : o[k], j);
        if (typeof v !== 'string') throw new Error('返事の形が違います');
        const ct = (j.status && j.status.content_type) || 'text/html; charset=utf-8';
        return new Response(v, { status: 200, headers: { 'content-type': ct } });
      } catch (e) { throw ac.timedOut ? new Error('タイムアウト') : signal && signal.aborted ? new Error('取りやめ') : e.name === 'TypeError' && /fetch/i.test(e.message) ? new Error('つながりません') : e; }
      finally { clearTimeout(tm); if (signal) signal.removeEventListener('abort', stop); }
    },
    async get(url, opt) {
      opt = opt || {};
      const tpls = order();
      const tries = (opt.direct === false ? [] : [null]).concat(tpls);
      const all = new AbortController(), errs = [], timeout = opt.timeout || 20000, gap = opt.gap == null ? 2000 : opt.gap;
      return new Promise((res, rej) => {
        let left = tries.length, done = false, idx = 0, timer = 0;
        const next = () => {
          if (done || idx >= tries.length) return;
          const tpl = tries[idx++], name = tpl ? hostOf(tpl.split(/\s+json:/)[0].replace(/\{(raw)?url\}/, '')) : '直接';
          OS.net._one(url, tpl, all.signal, timeout, opt.any).then(r => {
            if (done) return; done = true; clearTimeout(timer); all.abort();
            res(r);
          }, e => {
            if (done) return;
            errs.push(name + ': ' + e.message);
            clearTimeout(timer); next(); // 失敗したらすぐ次を始める
            if (--left === 0) { done = true; rej(new Error('取得できませんでした（' + errs.join(' / ') + '）')); }
          });
          if (idx < tries.length) timer = setTimeout(next, gap);
        };
        if (!tries.length) return rej(new Error('プロキシが設定されていません（設定 → ネットワーク）'));
        next();
      });
    },
    // POST など。直接 → プロキシ（JSON で返すものは除く）の順に試す
    async send(url, opt) {
      opt = opt || {};
      const tpls = [null].concat(order().filter(t => !/\sjson:/.test(t)));
      const errs = [];
      for (const tpl of tpls) {
        const u = tpl ? tpl.trim().replace('{rawurl}', url).replace('{url}', encodeURIComponent(url)) : url;
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), opt.timeout || 20000);
        try {
          const r = await fetch(u, { method: opt.method || 'POST', headers: opt.headers || {}, body: opt.body == null ? undefined : opt.body, signal: ac.signal, credentials: 'omit' });
          if (tpl && PROXY_ERR.includes(r.status)) throw new Error('HTTP ' + r.status);
          await r.clone().arrayBuffer();
          return r;
        } catch (e) { errs.push((tpl ? hostOf(tpl.replace(/\{(raw)?url\}.*$/, '')) : '直接') + ': ' + (e.name === 'AbortError' ? 'タイムアウト' : e.message)); }
        finally { clearTimeout(tm); }
      }
      throw new Error('送信できませんでした（' + errs.join(' / ') + '）');
    },
    // 設定のプロキシを 1 つずつ試す（設定 → ネットワーク の「接続テスト」）
    async test(url, timeout) {
      url = url || 'https://example.com/';
      return Promise.all(proxyList().map(async tpl => {
        const t0 = Date.now();
        try { const r = await OS.net._one(url, tpl, null, timeout || 15000); const n = (await r.text()).length; return { proxy: tpl, ok: true, ms: Date.now() - t0, size: n }; }
        catch (e) { return { proxy: tpl, ok: false, ms: Date.now() - t0, error: e.message }; }
      }));
    },
    // 各プロキシを測って、試す順番を決め直す（起動時と、オンラインに戻ったとき・設定の「接続テスト」で）
    async rank(timeout) {
      const key = JSON.stringify(proxyList()), res = await OS.net.test(null, timeout || 10000);
      const ok = res.filter(x => x.ok).sort((a, b) => a.ms - b.ms), bad = res.filter(x => !x.ok);
      ranked = { key: key, order: ok.concat(bad).map(x => x.proxy), results: ok.concat(bad), at: Date.now() };
      return ranked;
    },
    get ranking() { return ranked; },
    order: order,
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
  OS.shutdown = async function (reboot, flag, opt) {
    const hib = !reboot && !!(opt && opt.hibernate);
    if (OS._down) return;
    const gui = !!(OS.htui && OS.htui.running);
    // 未保存の変更があるウィンドウは確認を出す。キャンセルされたら終了を取りやめる
    if (gui && OS.htui.user && !hib) { // ハイバーネートは中身ごと書き出すので、保存の確認はしない
      OS.shuttingDown = true; // ウィンドウ側が「終了のための close」だとわかるように
      try { for (const w of OS.htui.wins.slice()) { if ((await w.close()) === false) return; } } finally { OS.shuttingDown = false; }
    }
    const others = gui && !hib && OS.htui.loggedIn ? OS.htui.loggedIn().filter(u => u !== OS.htui.user) : [];
    if (others.length && !(await OS.ui.confirm(others.join('、') + ' さんもログインしたままです。' + (reboot ? '再起動' : '電源を切る') + 'と、保存していない変更は失われます。続けますか?', { ok: reboot ? '再起動' : hib ? '休止状態にする' : '電源を切る', danger: true, title: 'ほかのユーザーがログイン中' }))) return;
    OS._down = true;
    if (OS.ipc) { try { OS.ipc.publish(reboot ? 'power.reboot' : 'power.shutdown', null, 'hinit'); } catch (e) { /* 無視 */ } }
    OS.sound.play(reboot ? 'reboot' : 'shutdown');
    if (flag) store.set('bootflag', flag);
    const t0 = Date.now(), tty = OS.tty1, label = reboot ? '再起動しています…' : hib ? '休止状態にしています…' : 'シャットダウンしています…';
    tty.pending = null; tty.capture = null; tty.line.style.display = 'none';
    const bar = h('i', { style: 'width:100%' }), msg = h('div', { class: 'sp-msg' });
    if (gui) OS.root.append(h('div', { id: 'splash', class: 'down', role: 'status' }, OS.mark(120, 'sp-mark'), spinner(), h('div', { class: 'sp-name' }, label)));
    tty.println(); tty.println(label);
    await nap(280);
    if (gui) OS.htui.stop();
    let stopped = [];
    if (OS.init) { try { stopped = await OS.init.shutdown(); } catch (e) { /* 止められなくても電源は切る */ } }
    // PC のフォルダ（HDD1）への書き出しが残っていれば、終わるまで待つ
    try { await Promise.all([hdd.flush(), BOOT.flushAll ? BOOT.flushAll() : null]); } catch (e) { /* 書けなかった分は通知済み */ }
    const steps = (gui ? ['HTUi を停止しました'] : []).concat(stopped.map(d => d + 'を停止しました')).concat(['アプリを終了しました', 'ユーザーセッションを閉じました', (base.disk ? 'HDD1' : base.idb ? 'HDD2' : 'LocalStorage') + ' ファイルシステムを同期しました'].concat(hdd.mounted ? ['HDD1 を切り離しました'] : []), [reboot ? '再起動します' : '電源を切ります']);
    for (let i = 0; i < steps.length; i++) {
      tty.print('['); tty.print('  OK  ', 'ok'); tty.println('] ' + steps[i]);
      msg.textContent = steps[i]; bar.style.width = (100 - (i + 1) / steps.length * 100) + '%';
      await nap(190);
    }
    // シャットダウン・再起動の音が鳴り終わるまで待つ（7.2.2。前は 1.3 秒で切っていたので音が途中で切れていた）
    const rest = Math.max(1300 - (Date.now() - t0), OS.sound.left ? OS.sound.left() : 0);
    if (rest > 0) await nap(Math.min(rest, 6000));
    if (reboot) { if (BOOT.warmBoot) BOOT.warmBoot(); else location.reload(); return; }
    if (BOOT.exitFull) BOOT.exitFull(); // 電源が切れたら全画面をやめる（7.2.2）
    OS.root.textContent = '';
    OS.root.append(h('div', { class: 'poweroff' },
      h('button', { class: 'pw-btn', type: 'button', title: '電源を入れる', 'aria-label': '電源を入れる', onclick: () => (BOOT.warmBoot ? BOOT.warmBoot() : location.reload()) }, OS.icon('power', 34)),
      h('p', null, hib ? '休止状態です' : '電源が切れています'), h('small', null, hib ? 'ボタンを押して起動し、ログインすると、休止する前の状態に戻ります' : 'ボタンを押すと起動します')));
  };
  // ハイバーネート（6.0.4 で作り直し）: 保存は求めない。メモリ上の状態（ログインしているユーザーごとのウィンドウ、
  //   位置と大きさ・仮想デスク、保存していない入力中の中身、Terminal の画面と履歴など）をストレージ（/var/lib/hibernate.json）に
  //   書き出して電源を切る。次に起動してそのユーザーがログインすると、書き出した状態をそのまま広げて元に戻す
  //   形式: { v: 2, at, last: 最後に使っていたユーザー, users: { 名前: { sid, cur: 仮想デスク, wins: [...] } } }
  const HIB = '/var/lib/hibernate.json';
  OS.hibernation = function (set) {
    if (set === null) { try { fs.rm(HIB); } catch (e) { /* ない */ } return null; }
    if (set) { fs.mkdir('/var/lib', { parents: true }); fs.write(HIB, JSON.stringify(set), { owner: 'root', mode: 0o600 }); return set; }
    let j = null;
    try { j = JSON.parse(fs.read(HIB)); } catch (e) { return null; }
    if (j && !j.users && j.user) j = { v: 2, at: j.at, last: j.user, users: { [j.user]: { sid: j.sid, wins: j.wins || [] } } }; // 5.3 の形式
    return j && j.users && Object.keys(j.users).length ? j : null;
  };
  OS.hibernate = async function () {
    const H = OS.htui;
    if (OS._down) return;
    if (!H || !H.running || !H.hibernateImage || !H.loggedIn().length) return OS.poweroff();
    const img = H.hibernateImage();
    try { OS.hibernation(img); } catch (e) { OS.ui.toast('休止状態のデータを書き出せませんでした（' + e.message + '）'); return; }
    if (OS.hdm && img.last) { const c = OS.hdm.conf(); c.lastUser = img.last; OS.hdm.save(c); }
    const n = Object.values(img.users).reduce((a, u) => a + u.wins.length, 0);
    if (OS.journal) { try { OS.journal.log('powerd', 'ハイバーネートします（' + Object.keys(img.users).join('、') + '。ウィンドウ ' + n + ' 個）'); } catch (e) { /* 無視 */ } }
    await OS.shutdown(false, null, { hibernate: true });
  };
  OS.reboot = function (flag) { return OS.shutdown(true, flag); };
  OS.poweroff = function () { return OS.shutdown(false); };

  // ---------- tty1 のログインループ
  async function ttyLogin(tty) {
    for (;;) {
      tty.println(); tty.println(OS.name + ' (' + OS.version + ') tty1'); tty.println();
      let user = OS.imode ? 'root' : null; // htmlOS i はシングルユーザーモード（root で自動ログイン）
      if (user) tty.println('シングルユーザーモード: root でログインしました', 'dim');
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
      if (sh.proc) OS.proc.exit(sh.proc.pid);
      OS.tty1sh = null;
      tty.clear();
    }
  }

  // ---------- 画面モード（desktop / tablet / phone。auto はタッチ端末かどうかと画面の幅で決める）
  OS.autoMode = function () {
    const mm = q => !!(window.matchMedia && window.matchMedia(q).matches);
    if (!mm('(pointer: coarse)')) return 'desktop';
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
  // ChromeOS のタブレットモード切り替え・画面の回転などで、自動のときは選び直す
  (function () {
    let tm = 0;
    const again = () => { clearTimeout(tm); tm = setTimeout(() => { if (OS.root && OS.modePref === 'auto' && OS.autoMode() !== OS.uiMode) OS.setMode('auto'); }, 150); };
    if (window.matchMedia) ['(pointer: coarse)', '(any-pointer: fine)', '(hover: none)'].forEach(q => { try { const m = window.matchMedia(q); if (m.addEventListener) m.addEventListener('change', again); else m.addListener(again); } catch (e) { /* 古いブラウザ */ } });
    window.addEventListener('resize', again);
  })();
  OS.modeIcons = { desktop: 'cursor', tablet: 'tablet', phone: 'phone' };
  OS.modeNames = { auto: '自動', desktop: 'デスクトップ', tablet: 'タブレット', phone: 'スマートフォン' };

  // ---------- 起動（起動画面は最低でも約1.2秒表示する。GUIはスプラッシュ、CUIは起動ログ）
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const I_APPS = ['04-welcome.js', '05-installer.js', '06-about.js', '10-terminal.js', '20-hedit.js', '50-hfile.js'];
  // htmlOS i の「htmlOS を試す」: まだ読み込んでいないアプリを読み込む（each(名前) を 1 つごとに呼ぶ）
  OS.loadMoreApps = async function (each) {
    const all = fs.list('/sys/apps').filter(n => n.endsWith('.js') && !I_APPS.includes(n)), done = [];
    for (const n of all) {
      try { OS.loadFile('/sys/apps/' + n); done.push(n); } catch (e) { /* 読めないアプリは飛ばす */ }
      if (each) await each(n);
    }
    if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
    return done;
  };
  OS.hostname = () => { try { return OS.config.get('hostname', 'htmlos') || 'htmlos'; } catch (e) { return 'htmlos'; } };
  OS.boot = async function (mode) {
    const t0 = OS.bootTime = Date.now();
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
      // 黒い画面に白い </>。BIOS の Quiet Boot から来たときは、同じ位置にマークがもう出ているので描き直さない
      splash = h('div', { id: 'splash', class: BOOT.quiet ? 'quiet' : '', role: 'status', 'aria-label': OS.name + ' を起動しています' }, OS.mark(120, 'sp-mark'), spinner());
      root.append(splash);
    }
    // htmlOS i は最小構成: Welcome・インストーラー・Terminal・hedit・hFile だけ。セーフモードと htmlOS i ではパッケージ（/apps）を読み込まない
    let apps = fs.list('/sys/apps').filter(n => n.endsWith('.js'));
    if (OS.imode) apps = apps.filter(n => I_APPS.includes(n));
    const pkgs = OS.safe || OS.imode ? [] : OS.pkg.list();
    try { OS.build = (JSON.parse(store.get('meta')) || {}).build || BOOT.build || '?'; } catch (e) { OS.build = BOOT.build || '?'; }
    const core = ['/sys/init.js', '/sys/ipc.js', '/sys/raid.js', '/sys/procfs.js', '/sys/fb.js', '/sys/cursor.js', '/sys/archive.js', '/sys/jsh.js', '/sys/nano.js', '/sys/htui.js', '/sys/hdm.js', '/sys/shells.js'];
    const total = 2 + core.length + apps.length + pkgs.length; let done = 0;
    const step = async (s, failed) => {
      if (OS.klog) OS.klog(s, failed ? 3 : 6); else (OS._klog = OS._klog || []).push({ t: Date.now(), msg: s, prio: failed ? 3 : 6 });
      tty.print('['); tty.print(failed ? 'FAILED' : '  OK  ', failed ? 'err' : 'ok'); tty.println('] ' + s);
      done++; bar.style.width = Math.min(100, done / total * 100) + '%'; msg.textContent = s;
      await sleep(85);
    };
    tty.println((OS.imode ? 'htmlOS i ' + OS.version : OS.name + ' (' + OS.version + ')') + (OS.safe ? '（セーフモード）' : '') + ' を起動しています…');
    await sleep(120);
    if (base.idb) base.onerror = (what, e) => { if (OS.notify && OS.htui && OS.htui.user) OS.notify({ app: 'HDD2', icon: 'archive', title: 'HDD2 に書き込めませんでした', body: what + ': ' + ((e && e.message) || e) }); else console.warn('[hdd2]', what, e); };
    await step(base.disk ? 'HDD1（PC のフォルダ「' + base.name + '」）をルートとしてマウントしました' : base.idb ? 'HDD2（IndexedDB）をルートとしてマウントしました' : 'LocalStorage ファイルシステムをマウントしました' + (store.ram ? '（RAMディスク: 再読み込みで消えます）' : ''));
    for (const f of core) { OS.loadFile(f); await step(f + ' を読み込みました'); }
    for (const n of apps) {
      try { OS.loadFile('/sys/apps/' + n); await step('アプリ ' + n); }
      catch (e) { await step('アプリ ' + n + ': ' + e.message, true); }
    }
    for (const n of pkgs) {
      try { OS.pkg.load(n); await step('パッケージ ' + n); }
      catch (e) { OS.pkg._unregister(n); OS.pkg.errors[n] = e.message; await step('パッケージ ' + n + ': ' + e.message, true); }
    }
    users.ensureRoot();
    users.list().forEach(u => users.ensureHome(u.name));
    if (!fs.exists('/mnt')) fs.mkdir('/mnt');
    // HDD1: 前に使ったフォルダの許可が残っていれば /mnt/hdd1 に接続する（許可が要るときは hFile の「HDD1」から）
    if (!base.disk && HD.supported) {
      try { const r = await hdd.auto(); if (r) await step('HDD1（' + r.name + '）を ' + HDD_AT + ' にマウントしました'); else if (hdd.waiting) await step('HDD1（' + hdd.waiting + '）: 使う許可を待っています（hFile の HDD1 か、jsh の mount hdd1 で接続）'); }
      catch (e) { await step('HDD1: ' + e.message, true); }
    }
    // HDD3・RAID（7.0）
    if (OS.storage && !OS.imode && !OS.live) {
      try { for (const r of await OS.storage.boot()) await step(r.msg, r.fail); }
      catch (e) { await step('ストレージ: ' + e.message, true); }
    }
    OS.mode = mode;
    // init（PID 1）: マルチユーザーのターゲットまでサービスを順に起動する（GUI のサービスは HTUi を出したあと）
    if (OS.init) {
      try { await OS.init.boot('multi-user.target', async (u, ok) => { await step(u.desc + '（' + u.name + '）' + (ok ? 'を起動しました' : 'を起動できませんでした'), !ok); }); }
      catch (e) { await step('init: ' + e.message, true); }
    }
    await step(mode === 'gui' ? (OS.htui && OS.htui.sdk ? OS.htui.sdk.full : 'HTUi') + ' を起動します' : 'tty1 を起動します');
    const rest = 1200 - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    OS.sound.play('boot');
    ttyLogin(tty);
    if (mode === 'gui') {
      // htmlOS i はシングルユーザーモード: root で自動ログインし、hwm の上で Welcome を開く
      if (OS.imode) { OS.htui.start('root', 'hwm'); setTimeout(() => { try { OS.launch('welcome'); } catch (e) { /* 開けなくても hwm は使える */ } }, 350); }
      else OS.htui.start();
      if (OS.init) OS.init.reach('graphical.target').catch(e => OS.klog && OS.klog('graphical.target: ' + e.message, 3));
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 450);
    }
  };
})();
