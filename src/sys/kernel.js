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
  OS.storeLabel = () => base.disk ? 'HDD1（' + base.name + '）' : base.ram ? 'RAMディスク' : 'LocalStorage';

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
    script: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12l2 2-2 2M13 16h3"/>'
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
    video: 'mp4 webm ogv mov m4v'.split(' ')
  };
  const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json' };
  // ファイルが変わったことを知らせる（デスクトップや hFile が表示を更新するため）。まとめて 1 回にする
  const watchers = new Set(); let changedPaths = new Set(), changeTimer = 0;
  function changed(p) {
    changedPaths.add(p);
    if (changeTimer) return;
    changeTimer = setTimeout(() => { const l = [...changedPaths]; changedPaths = new Set(); changeTimer = 0; watchers.forEach(f => { try { f(l); } catch (e) { /* 見ている側の失敗は無視 */ } }); }, 30);
  }
  function put(p, node) {
    try { store.set(K(p), JSON.stringify(node)); }
    catch (e) { if (mountOf(K(p)) || base.disk) throw e; throw new Error('ストレージの空き容量が足りません（LocalStorageの上限は約5MBです）'); }
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
      return s.c;
    },
    write(p, c, opt) {
      opt = opt || {};
      if (p === '/') throw new Error('/ には書き込めません');
      const q = fs.real(p), d = path.dir(q);
      if (!fs.isDir(d)) throw new Error(path.dir(p) + ': ディレクトリがありません');
      const old = fs._raw(q);
      if (old && old.t === 'd') throw new Error(p + ': ディレクトリです');
      const node = { t: 'f', c: String(c), m: Date.now(), o: opt.owner || (old && old.o) || 'root' };
      if (opt.bin) node.b = 1;
      put(q, node);
    },
    mkdir(p, opt) {
      opt = opt || {};
      if (fs.exists(p) || fs.isLink(p)) { if (fs.isDir(p) && opt.parents) return; throw new Error(p + ': すでに存在します'); }
      const d = path.dir(p);
      if (!fs.isDir(d)) { if (opt.parents) fs.mkdir(d, opt); else throw new Error(d + ': ディレクトリがありません'); }
      put(fs._here(p), { t: 'd', m: Date.now(), o: opt.owner || 'root' });
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
    _cp(a, b, owner) {
      const s = fs._raw(a);
      if (s.t === 'd') { put(b, { t: 'd', m: Date.now(), o: owner || s.o }); for (const n of fs.list(a)) fs._cp(a + '/' + n, b + '/' + n, owner); }
      else put(b, Object.assign({}, s, { m: Date.now(), o: owner || s.o }));
    },
    dest(a, b) { return fs.isDir(b) ? path.join(b, path.base(a)) : b; },
    cp(a, b, opt) {
      if (!fs.exists(a)) throw new Error(a + ': そのようなファイルはありません');
      const src = fs.real(a); b = fs._here(fs.dest(a, b));
      if (b === src || b.startsWith(src + '/')) throw new Error('自分自身の中にはコピーできません');
      if (!fs.isDir(path.dir(b))) throw new Error(path.dir(b) + ': ディレクトリがありません');
      fs._cp(src, b, opt && opt.owner);
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
    // システムのドライブの使用量。HDD1（PC のフォルダ）から起動しているときは disk が true、total は設定した上限（なければ 0）
    usage() {
      let used = 0;
      for (const k of base.keys()) used += k.length + 7 + (base.get(k) || '').length;
      return base.disk ? { used: base.used ? base.used() : used, total: base.quota ? base.quota() : 0, disk: true } : { used: used, total: 5 * 1024 * 1024 };
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
  const HDD_AT = '/mnt/hdd1', HD = BOOT.hdd || { supported: false };
  const hdd = OS.hdd = {
    at: HDD_AT,
    get supported() { return !!HD.supported; },
    get root() { return !!base.disk; },
    get mounted() { return mounts.some(m => m.at === HDD_AT); },
    get name() { const m = mounts.find(x => x.at === HDD_AT); return m ? m.s.name : base.disk ? base.name : null; },
    waiting: null, // 前に使ったフォルダ（許可を待っている）の名前
    // 接続する。pick=true なら別のフォルダを選び直す。ボタンやコマンドなど、ユーザーの操作の中で呼ぶこと
    async mount(pick, progress) {
      if (base.disk) throw new Error('htmlOS は HDD1 から起動しています（HDD1 は / そのものです）');
      if (!HD.supported) throw new Error('このブラウザは File System Access API（showDirectoryPicker）に対応していません。パソコンの Chrome・Edge などで使えます');
      if (hdd.mounted) throw new Error('HDD1 はすでに ' + HDD_AT + ' に接続されています');
      let dir = pick ? null : await HD.saved();
      if (!dir) dir = await HD.pick();
      if (!(await HD.allowed(dir, true))) throw new Error('フォルダを使う許可がもらえませんでした');
      return attach(dir, progress);
    },
    async unmount() {
      const i = mounts.findIndex(m => m.at === HDD_AT);
      if (i < 0) throw new Error('HDD1 は接続されていません');
      await mounts[i].s.flush();
      mounts.splice(i, 1); changed(HDD_AT); changed('/mnt');
    },
    // 覚えているフォルダを忘れる（PC のフォルダの中身は消さない）
    async forget() { if (hdd.mounted) await hdd.unmount(); hdd.waiting = null; await HD.forget(); },
    // 起動したとき: 前に使ったフォルダがあって、許可が残っていれば自動で接続する
    async auto() {
      if (base.disk || !HD.supported || hdd.mounted) return null;
      const dir = await HD.saved(); if (!dir) return null;
      if (!(await HD.allowed(dir, false))) { hdd.waiting = dir.name; return null; }
      return attach(dir);
    },
    flush: () => Promise.all(mounts.map(m => m.s.flush()))
  };
  async function attach(dir, progress) {
    const s = await HD.open(dir, HDD_AT, progress);
    s.onerror = (what, e) => { if (OS.notify && OS.htui && OS.htui.user) OS.notify({ app: 'HDD1', icon: 'archive', title: 'HDD1 に書き込めませんでした', body: what + ': ' + ((e && e.message) || e) }); };
    if (!base.get(K('/mnt'))) base.set(K('/mnt'), JSON.stringify({ t: 'd', m: Date.now(), o: 'root' }));
    mounts.push({ at: HDD_AT, key: K(HDD_AT), s: s });
    hdd.waiting = null;
    await HD.save(dir);
    changed('/mnt'); changed(HDD_AT);
    return { name: dir.name, items: s.count() - 1, skipped: s.skipped };
  }
  // 書き出しが終わっていないうちにページを閉じようとしたら止める
  window.addEventListener('beforeunload', e => { if ([base].concat(mounts.map(m => m.s)).some(s => s.pending && s.pending())) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- 権限つきファイルシステム
  //   root      : どこでも読み書きできる
  //   管理者    : 書けるのは自分のホームと /tmp だけ。読むのは /root 以外すべて
  //   一般ユーザー: 書けるのは自分のホームと /tmp だけ。他人のホームと /root は読めない
  OS.fsFor = function (getUser) {
    const me = () => users.get(getUser()) || { name: getUser() };
    const canW = p => { const u = me(); return !!u.root || p.startsWith('/tmp/') || p.startsWith('/home/' + u.name + '/') || p.startsWith(HDD_AT + '/'); };
    const canR = p => { const u = me(); if (u.root) return true; if (p === '/root' || p.startsWith('/root/')) return false; if (u.admin) return true; if (p === '/root' || p.startsWith('/root/')) return false; const m = p.match(/^\/home\/([^/]+)/); return !m || m[1] === u.name; };
    // リンクを通した書き込み・読み込みも許可を確かめるため、リンクをたどった先のパスでも調べる
    const realOf = p => { try { return fs.real(p); } catch (e) { return p; } };
    const hereOf = p => { try { return fs._here(p); } catch (e) { return p; } };
    const deny = (p, w) => { throw new Error(p + (w ? ': 許可がありません（root 権限が必要です）' : ': 許可がありません')); };
    const W = p => { if (!canW(p) || !canW(realOf(p))) deny(p, true); return p; };
    const WL = p => { if (!canW(p) || !canW(hereOf(p))) deny(p, true); return p; };
    const R = p => { if (!canR(p) || !canR(realOf(p))) deny(p); return p; };
    const ok = p => canR(p) && canR(realOf(p));
    return {
      stat: p => fs.stat(R(p)), lstat: p => fs.lstat(R(p)), exists: p => ok(p) && fs.exists(p), isDir: p => ok(p) && fs.isDir(p), isFile: p => ok(p) && fs.isFile(p),
      isLink: p => canR(p) && fs.isLink(p), readlink: p => fs.readlink(R(p)), real: fs.real,
      list: p => fs.list(R(p)), read: p => fs.read(R(p)),
      write: (p, c, o) => fs.write(W(p), c, Object.assign({}, o, { owner: getUser() })),
      mkdir: (p, o) => fs.mkdir(WL(p), Object.assign({}, o, { owner: getUser() })),
      symlink: (t, p) => fs.symlink(t, WL(p), { owner: getUser() }),
      rm: (p, o) => fs.rm(WL(p), o),
      cp: (a, b) => { R(a); WL(fs.dest(a, b)); return fs.cp(a, b, { owner: getUser() }); },
      mv: (a, b) => { WL(a); WL(fs.dest(a, b)); return fs.mv(a, b); },
      usage: fs.usage, kind: fs.kind, mime: fs.mime, dataURL: p => fs.dataURL(R(p)), unique: fs.unique, canWrite: canW, watch: fs.watch
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
    focus() { if (this._screen) this._screen.focus(); else this.input.focus(); }
    // ---- 全画面の TUI（4.0）。const s = tty.screen(); s.render(行); const k = await s.key(); s.close()
    //   行は文字列か、[文字, 色]（色: accent dim ok err sel head prompt）の配列。
    //   key() は { key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Escape' | 'Tab' | 'Backspace' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'text', text, ctrl, shift }
    //   日本語入力（IME）で確定した文字も key: 'text' で届く
    screen() {
      if (this._screen) return this._screen;
      const self = this, q = [], waiters = [];
      const view = h('pre', { class: 'tty-tui', 'aria-live': 'polite' });
      const inp = h('input', { class: 'tty-tui-key', 'aria-label': 'キー入力（矢印キー・Enter・Esc）', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      const push = ev => { const w = waiters.shift(); if (w) w(ev); else q.push(ev); };
      const NAV = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
      inp.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey && /^[a-z]$/i.test(e.key)) { e.preventDefault(); push({ key: e.key.toLowerCase(), ctrl: true }); return; }
        if (NAV.includes(e.key)) { e.preventDefault(); e.stopPropagation(); push({ key: e.key, shift: e.shiftKey }); }
      });
      const flush = () => { if (inp.value) { push({ key: 'text', text: inp.value }); inp.value = ''; } };
      inp.addEventListener('input', e => { if (!e.isComposing) flush(); });
      inp.addEventListener('compositionend', () => setTimeout(flush, 0));
      // タッチ用のキー
      const tk = (label, key) => { const b = h('button', { class: 'tty-key', type: 'button', tabindex: '-1' }, label); b.addEventListener('pointerdown', e => { e.preventDefault(); inp.focus(); push({ key: key }); }); return b; };
      const keys = h('div', { class: 'tty-keys tty-tuikeys' }, tk('↑', 'ArrowUp'), tk('↓', 'ArrowDown'), tk('←', 'ArrowLeft'), tk('→', 'ArrowRight'), tk('Enter', 'Enter'), tk('Esc', 'Escape'), tk('⌫', 'Backspace'));
      const box = h('div', { class: 'tty-tuibox' }, view, inp);
      box.addEventListener('click', () => inp.focus());
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
        close() { box.remove(); keys.remove(); self.scr.style.display = ''; self.keys.style.display = ''; self._screen = null; while (waiters.length) waiters.shift()({ key: 'Escape' }); if (self.wantsFocus()) self.input.focus(); }
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
    dispose() { if (this._screen) this._screen.close(); this.pending = null; if (this._ro) this._ro.disconnect(); this.el.remove(); }
  }
  OS.Tty = Tty;

  // ---------- コード実行
  OS.exec = function (code, name) { return (0, eval)(code + '\n//# sourceURL=hfs://' + name); };
  OS.loadFile = function (p) { return OS.exec(fs.read(p), p); };
  OS.registerApp = function (def) { def.pkg = OS._loading || null; OS.apps[def.id] = def; };
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
    if (path.ext(p) === 'md' && OS.apps.hmd) return OS.launch('hmd', p);
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
    if (gui && OS.htui.user) {
      OS.shuttingDown = true; // ウィンドウ側が「終了のための close」だとわかるように
      try { for (const w of OS.htui.wins.slice()) { if ((await w.close()) === false) return; } } finally { OS.shuttingDown = false; }
    }
    OS._down = true;
    if (flag) store.set('bootflag', flag);
    const t0 = Date.now(), tty = OS.tty1, label = reboot ? '再起動しています…' : 'シャットダウンしています…';
    tty.pending = null; tty.capture = null; tty.line.style.display = 'none';
    const bar = h('i', { style: 'width:100%' }), msg = h('div', { class: 'sp-msg' });
    if (gui) OS.root.append(h('div', { id: 'splash', class: 'down', role: 'status' }, OS.mark(120, 'sp-mark'), spinner(), h('div', { class: 'sp-name' }, label)));
    tty.println(); tty.println(label);
    await nap(280);
    if (gui) OS.htui.stop();
    // PC のフォルダ（HDD1）への書き出しが残っていれば、終わるまで待つ
    try { await Promise.all([hdd.flush(), BOOT.flushAll ? BOOT.flushAll() : null]); } catch (e) { /* 書けなかった分は通知済み */ }
    const steps = (gui ? ['HTUi を停止しました'] : []).concat(['アプリを終了しました', 'ユーザーセッションを閉じました', (base.disk ? 'HDD1' : 'LocalStorage') + ' ファイルシステムを同期しました'].concat(hdd.mounted ? ['HDD1 を切り離しました'] : []), [reboot ? '再起動します' : '電源を切ります']);
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
  const I_APPS = ['04-welcome.js', '05-installer.js', '10-terminal.js', '20-hedit.js', '50-hfile.js'];
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
    const core = ['/sys/cursor.js', '/sys/jsh.js', '/sys/htui.js', '/sys/hdm.js', '/sys/shells.js'];
    const total = 2 + core.length + apps.length + pkgs.length; let done = 0;
    const step = async (s, failed) => {
      tty.print('['); tty.print(failed ? 'FAILED' : '  OK  ', failed ? 'err' : 'ok'); tty.println('] ' + s);
      done++; bar.style.width = Math.min(100, done / total * 100) + '%'; msg.textContent = s;
      await sleep(85);
    };
    tty.println((OS.imode ? 'htmlOS i ' + OS.version : OS.name + ' (' + OS.version + ')') + (OS.safe ? '（セーフモード）' : '') + ' を起動しています…');
    await sleep(120);
    await step(base.disk ? 'HDD1（PC のフォルダ「' + base.name + '」）をルートとしてマウントしました' : 'LocalStorage ファイルシステムをマウントしました' + (store.ram ? '（RAMディスク: 再読み込みで消えます）' : ''));
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
    if (!fs.exists('/mnt')) fs.mkdir('/mnt');
    // HDD1: 前に使ったフォルダの許可が残っていれば /mnt/hdd1 に接続する（許可が要るときは hFile の「HDD1」から）
    if (!base.disk && HD.supported) {
      try { const r = await hdd.auto(); if (r) await step('HDD1（' + r.name + '）を ' + HDD_AT + ' にマウントしました'); else if (hdd.waiting) await step('HDD1（' + hdd.waiting + '）: 使う許可を待っています（hFile の HDD1 か、jsh の mount hdd1 で接続）'); }
      catch (e) { await step('HDD1: ' + e.message, true); }
    }
    OS.mode = mode;
    await step(mode === 'gui' ? (OS.htui && OS.htui.sdk ? OS.htui.sdk.full : 'HTUi') + ' を起動します' : 'tty1 を起動します');
    const rest = 1200 - (Date.now() - t0);
    if (rest > 0) await sleep(rest);
    ttyLogin(tty);
    if (mode === 'gui') {
      // htmlOS i はシングルユーザーモード: root で自動ログインし、hwm の上で Welcome を開く
      if (OS.imode) { OS.htui.start('root', 'hwm'); setTimeout(() => { try { OS.launch('welcome'); } catch (e) { /* 開けなくても hwm は使える */ } }, 350); }
      else OS.htui.start();
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 450);
    }
  };
})();
