/* htmlOS アーカイブ（7.3 から）— OS.archive
   ZIP（無圧縮・Deflate）、tar（ustar。GNU の長い名前・pax の path にも対応）、gzip、tar.gz を読み書きする。
   圧縮と展開はブラウザーの CompressionStream / DecompressionStream を使う（外部のライブラリは使わない）。
   ・await OS.archive.open(fsx, パス)                 → { format, name, entries: [{ name, dir, link, size, csize, mtime, mode, bytes() }] }
   ・await OS.archive.extract(fsx, arc, 展開先, opt)   opt: { overwrite, only: [名前], strip: 'フォルダ/', progress(e, i, n) }
   ・await OS.archive.create(fsx, [{ path, name }], 出力, opt)   opt: { format: 'zip'|'tar'|'tar.gz'|'gz', level: 0 で無圧縮, progress }
   ・await OS.archive.build(entries, format, opt)      → Uint8Array（hArchive が中身を足したり消したりしたあと作り直すのに使う）
   jsh の zip / unzip / tar / gzip / gunzip / zcat と、hArchive・hFile・デスクトップの右クリックメニューが使う */
(function () {
  'use strict';
  const OS = window.OS, path = OS.path;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---------- CRC-32（ZIP の検査値）
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // ---------- 圧縮（CompressionStream）
  const hasCS = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  const needCS = () => { if (!hasCS) throw new Error('このブラウザーは圧縮（CompressionStream）に対応していません'); };
  const pipe = async (u8, st) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(st)).arrayBuffer());
  const deflateRaw = u8 => { needCS(); return pipe(u8, new CompressionStream('deflate-raw')); };
  async function inflateRaw(u8) { needCS(); try { return await pipe(u8, new DecompressionStream('deflate-raw')); } catch (e) { throw new Error('圧縮されたデータが壊れています'); } }
  const gzip = u8 => { needCS(); return pipe(u8, new CompressionStream('gzip')); };
  async function gunzip(u8) { needCS(); try { return await pipe(u8, new DecompressionStream('gzip')); } catch (e) { throw new Error('gzip のデータが壊れています'); } }

  function concat(list) {
    let n = 0; list.forEach(x => { n += x.length; });
    const out = new Uint8Array(n); let o = 0;
    list.forEach(x => { out.set(x, o); o += x.length; });
    return out;
  }
  function b64ToBytes(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

  // ---------- hFS のファイル ⇔ バイト列
  // テキストのファイルは UTF-8、バイナリ（data: URL）はそのままのバイト。URL を入れてあるファイル（オンラインのテーマソングなど）は取ってくる
  async function readBytes(fsx, p) {
    const s = fsx.stat(p);
    if (!s) throw new Error(p + ': そのようなファイルはありません');
    if (s.t === 'd') throw new Error(p + ': ディレクトリです');
    const c = fsx.read(p); // 読む許可もここで確かめる
    if (!s.b) return enc.encode(c);
    const m = /^data:[^,]*?(;base64)?,/.exec(c);
    if (m) { const body = c.slice(m[0].length); return m[1] ? b64ToBytes(body) : enc.encode(decodeURIComponent(body)); }
    try { const r = await fetch(c); if (!r.ok) throw new Error(String(r.status)); return new Uint8Array(await r.arrayBuffer()); }
    catch (e) { throw new Error(p + ': オンラインのファイル（' + String(c).slice(0, 60) + '）を読めませんでした'); }
  }
  // 中身がテキストに見えるか（NUL や制御文字がない）
  function looksText(u8) {
    for (let i = 0, n = Math.min(u8.length, 65536); i < n; i++) { const b = u8[i]; if (b === 0 || b < 8 || (b > 13 && b < 32 && b !== 27)) return false; }
    return true;
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  // 展開したバイト列を hFS に書ける形へ。画像・音・動画・アーカイブ以外で、UTF-8 として読めるならテキストのまま
  function toContent(name, u8) {
    const k = OS.fs.kind(name), ext = path.ext(name);
    if (ext === 'svg' || !['image', 'audio', 'video', 'archive'].includes(k)) {
      if (looksText(u8)) { try { return { content: utf8.decode(u8), bin: false }; } catch (e) { /* UTF-8 ではない */ } }
    }
    return { content: 'data:' + mimeOf(name) + ';base64,' + bytesToB64(u8), bin: true };
  }
  function mimeOf(name) { const m = OS.fs.mime(name); return m === 'text/plain' && path.ext(name) !== 'txt' ? 'application/octet-stream' : m; }
  function writeBytes(fsx, p, u8) { const c = toContent(p, u8); fsx.write(p, c.content, { bin: c.bin }); }

  // ---------- 名前
  // アーカイブの中の名前を安全な形にする（先頭の / と ./ を取る。.. を含むものは展開しない）
  function clean(name) {
    const parts = String(name).replace(/\\/g, '/').split('/').filter(s => s && s !== '.');
    return { name: parts.join('/'), unsafe: parts.includes('..') };
  }
  // 古い Windows で作った ZIP（UTF-8 の印がない）は Shift_JIS のことが多い
  function decodeName(b) {
    try { return utf8.decode(b); } catch (e) { /* UTF-8 ではない */ }
    try { return new TextDecoder('shift_jis', { fatal: true }).decode(b); } catch (e) { /* Shift_JIS でもない */ }
    return new TextDecoder('latin1').decode(b);
  }
  const FORMATS = ['zip', 'tar', 'tar.gz', 'gz'];
  function formatOf(name) {
    const n = String(name).toLowerCase();
    if (/\.(tar\.gz|tgz)$/.test(n)) return 'tar.gz';
    if (n.endsWith('.tar')) return 'tar';
    if (n.endsWith('.gz')) return 'gz';
    if (n.endsWith('.zip')) return 'zip';
    return null;
  }
  const EXT = { zip: '.zip', tar: '.tar', 'tar.gz': '.tar.gz', gz: '.gz' };
  const MIME = { zip: 'application/zip', tar: 'application/x-tar', 'tar.gz': 'application/gzip', gz: 'application/gzip' };
  const isArchive = p => !!formatOf(p);

  // ---------- ZIP
  function dosTime(ms) {
    const d = new Date(ms || Date.now()), y = Math.min(2107, Math.max(1980, d.getFullYear()));
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  const fromDos = (date, time) => new Date(((date >> 9) & 127) + 1980, ((date >> 5) & 15) - 1, date & 31 || 1, (time >> 11) & 31, (time >> 5) & 63, (time & 31) * 2).getTime();
  const S_IFMT = 0o170000, S_IFDIR = 0o040000, S_IFLNK = 0o120000, S_IFREG = 0o100000;

  async function zipWrite(entries, opt, progress) {
    if (entries.length > 65534) throw new Error('ZIP に入れられるのは 65534 個までです');
    const parts = [], central = []; let off = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], nameB = enc.encode(e.name + (e.dir ? '/' : ''));
      const raw = e.dir ? new Uint8Array(0) : e.link != null ? enc.encode(e.link) : await e.bytes();
      let method = 0, body = raw;
      if (!e.dir && e.link == null && raw.length > 0 && opt.level !== 0) { const d = await deflateRaw(raw); if (d.length < raw.length) { method = 8; body = d; } }
      const crc = crc32(raw), t = dosTime(e.mtime);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, t.time, true); lh.setUint16(12, t.date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nameB.length, true);
      parts.push(new Uint8Array(lh.buffer), nameB, body);
      // 作ったのは UNIX（3）として、外部属性の上 16 ビットにモードを入れる（Linux の unzip でモードとシンボリックリンクが戻る）
      const mode = (e.dir ? S_IFDIR : e.link != null ? S_IFLNK : S_IFREG) | ((e.mode == null ? (e.dir ? 0o755 : e.link != null ? 0o777 : 0o644) : e.mode) & 0o7777);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, (3 << 8) | 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, t.time, true); ch.setUint16(14, t.date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nameB.length, true);
      ch.setUint32(38, ((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      off += 30 + nameB.length + body.length;
      if (progress) await progress(e, i, entries.length, { size: raw.length, csize: body.length, method: method });
    }
    let cd = 0; central.forEach(x => { cd += x.length; });
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
    eo.setUint32(12, cd, true); eo.setUint32(16, off, true);
    return concat(parts.concat(central, [new Uint8Array(eo.buffer)]));
  }

  function zipRead(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eo = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('ZIP の終わり（中央ディレクトリ）が見つかりません。壊れているか、途中までしかないファイルです');
    const n = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true);
    if (p === 0xFFFFFFFF || n === 0xFFFF) throw new Error('ZIP64（とても大きい ZIP）には対応していません');
    const out = [];
    for (let i = 0; i < n; i++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP の中央ディレクトリが壊れています');
      const made = dv.getUint16(p + 4, true), flag = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true), crc = dv.getUint32(p + 16, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const ext = dv.getUint32(p + 38, true), loc = dv.getUint32(p + 42, true);
      const nb = u8.subarray(p + 46, p + 46 + nl);
      const name = flag & 0x800 ? dec.decode(nb) : decodeName(nb);
      p += 46 + nl + el + cl;
      if (loc + 30 > u8.length || dv.getUint32(loc, true) !== 0x04034b50) throw new Error(name + ': ZIP のデータが壊れています');
      const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      const um = (made >> 8) === 3 ? ext >>> 16 : 0;
      const e = { name: name, size: usize, csize: csize, mtime: fromDos(date, time), mode: um & 0o7777 || null, dir: name.endsWith('/') || (um & S_IFMT) === S_IFDIR || (!um && (ext & 0x10) !== 0) };
      const raw = u8.subarray(start, start + csize);
      if (flag & 1) e.encrypted = true;
      e.bytes = async () => {
        if (e.encrypted) throw new Error(e.name + ': パスワード付きの ZIP には対応していません');
        const d = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
        if (!d) throw new Error(e.name + ': この圧縮方式（' + method + '）には対応していません（Deflate と無圧縮だけです）');
        if (crc32(d) !== crc) throw new Error(e.name + ': 検査値（CRC）が合いません。壊れています');
        return d;
      };
      if ((um & S_IFMT) === S_IFLNK) e.linkRaw = true; // リンク先は中身に入っている（展開のときに読む）
      out.push(e);
    }
    return out;
  }

  // ---------- tar（ustar）
  function tarHeader(name, o) {
    const h = new Uint8Array(512);
    const put = (v, off, len) => { const b = typeof v === 'string' ? enc.encode(v) : v; h.set(b.subarray(0, len), off); };
    const oct = (n, off, len) => put(Math.max(0, Math.floor(n)).toString(8).padStart(len - 1, '0') + '\0', off, len);
    put(name, 0, 100); oct(o.mode, 100, 8); oct(0, 108, 8); oct(0, 116, 8); oct(o.size || 0, 124, 12); oct((o.mtime || Date.now()) / 1000, 136, 12);
    put(o.type || '0', 156, 1); if (o.link) put(o.link, 157, 100);
    put('ustar\0', 257, 6); put('00', 263, 2); put(o.owner || 'root', 265, 32); put('users', 297, 32);
    if (o.prefix) put(o.prefix, 345, 155);
    h.fill(32, 148, 156);
    let sum = 0; for (let i = 0; i < 512; i++) sum += h[i];
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    return h;
  }
  const pad512 = n => (512 - (n % 512)) % 512;
  // GNU の長い名前（././@LongLink）を作る
  function longEntry(type, text) {
    const b = concat([enc.encode(text), new Uint8Array(1)]);
    return [tarHeader('././@LongLink', { mode: 0o644, size: b.length, type: type }), b, new Uint8Array(pad512(b.length))];
  }
  async function tarWrite(entries, progress) {
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], full = e.name + (e.dir ? '/' : ''), nb = enc.encode(full);
      let name = full, prefix = '';
      if (nb.length > 100) {
        // 100 バイトに入らないときは prefix（155 バイト）と分ける。それでも入らなければ GNU の長い名前
        const cut = full.lastIndexOf('/', full.length - 2);
        let ok = false;
        for (let k = cut; k > 0; k = full.lastIndexOf('/', k - 1)) {
          if (enc.encode(full.slice(0, k)).length <= 155 && enc.encode(full.slice(k + 1)).length <= 100) { prefix = full.slice(0, k); name = full.slice(k + 1); ok = true; break; }
        }
        if (!ok) { parts.push(...longEntry('L', full)); name = full.slice(0, 99); prefix = ''; }
      }
      if (e.link != null && enc.encode(e.link).length > 100) parts.push(...longEntry('K', e.link));
      const data = e.dir || e.link != null ? new Uint8Array(0) : await e.bytes();
      parts.push(tarHeader(name, { mode: e.mode == null ? (e.dir ? 0o755 : e.link != null ? 0o777 : 0o644) : e.mode, size: data.length, mtime: e.mtime, type: e.dir ? '5' : e.link != null ? '2' : '0', link: e.link, owner: e.owner, prefix: prefix }));
      if (data.length) parts.push(data, new Uint8Array(pad512(data.length)));
      if (progress) await progress(e, i, entries.length, { size: data.length, csize: data.length, method: 0 });
    }
    parts.push(new Uint8Array(1024)); // 終わりの印（0 のブロック 2 つ）
    const total = parts.reduce((n, x) => n + x.length, 0);
    parts.push(new Uint8Array((10240 - (total % 10240)) % 10240)); // GNU tar と同じく 10240 バイト単位にそろえる
    return concat(parts);
  }
  function parsePax(b) {
    const o = {}; let i = 0;
    while (i < b.length) {
      let j = i; while (j < b.length && b[j] !== 32) j++;
      const len = parseInt(dec.decode(b.subarray(i, j)), 10); if (!(len > 0)) break;
      const rec = dec.decode(b.subarray(j + 1, i + len - 1)), k = rec.indexOf('=');
      if (k > 0) o[rec.slice(0, k)] = rec.slice(k + 1);
      i += len;
    }
    return o;
  }
  function tarRead(u8) {
    const out = [], byName = {}; let p = 0, longName = null, longLink = null, pax = {};
    while (p + 512 <= u8.length) {
      const h = u8.subarray(p, p + 512);
      if (h.every(b => b === 0)) break;
      const str = (o, l) => { let e = o; while (e < o + l && h[e]) e++; return decodeName(h.subarray(o, e)); };
      const num = (o, l) => {
        if (h[o] & 0x80) { let n = 0; for (let i = o + 1; i < o + l; i++) n = n * 256 + h[i]; return n; } // GNU の 256 進
        return parseInt(str(o, l).trim() || '0', 8) || 0;
      };
      let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
      if (sum !== num(148, 8)) throw new Error(p === 0 ? 'tar ではないか、壊れています' : 'tar が壊れています（' + p + ' バイト目）');
      const type = String.fromCharCode(h[156] || 48), size = num(124, 12);
      if (p + 512 + size > u8.length) throw new Error('tar が途中で切れています');
      const data = u8.subarray(p + 512, p + 512 + size);
      p += 512 + size + pad512(size);
      if (type === 'L') { longName = decodeName(data).replace(/\0+$/, ''); continue; }
      if (type === 'K') { longLink = decodeName(data).replace(/\0+$/, ''); continue; }
      if (type === 'x') { pax = parsePax(data); continue; }
      if (type === 'g') continue;
      let name = str(0, 100);
      if (str(257, 5) === 'ustar') { const pre = str(345, 155); if (pre) name = pre + '/' + name; }
      if (pax.path) name = pax.path;
      if (longName) name = longName;
      const link = longLink || pax.linkpath || str(157, 100);
      const e = { name: name, size: size, csize: size, mtime: (pax.mtime ? parseFloat(pax.mtime) : num(136, 12)) * 1000, mode: num(100, 8) & 0o7777, owner: str(265, 32) || null };
      longName = longLink = null; pax = {};
      if (type === '5' || name.endsWith('/')) { e.dir = true; e.size = 0; }
      else if (type === '2') { e.link = link; e.size = 0; }
      else if (type === '1') { const t = byName[clean(link).name]; if (!t) continue; e.bytes = t.bytes; e.size = t.size; } // ハードリンクは中身のコピーにする
      else if (type === '0' || type === '7') { const d = data; e.bytes = async () => d; }
      else continue; // デバイス・FIFO は入れない
      out.push(e); byName[clean(name).name] = e;
    }
    return out;
  }

  // ---------- 開く
  function detect(u8) {
    if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5) && (u8[3] === 4 || u8[3] === 6)) return 'zip';
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) return 'gz';
    if (u8.length >= 262 && dec.decode(u8.subarray(257, 262)) === 'ustar') return 'tar';
    return null;
  }
  // gzip のヘッダーに入っている元の名前と日時
  function gzInfo(u8) {
    const o = { mtime: (u8[4] | (u8[5] << 8) | (u8[6] << 16) | (u8[7] << 24)) >>> 0, name: null }, fl = u8[3];
    let p = 10; if (fl & 4) p += 2 + (u8[10] | (u8[11] << 8));
    if (fl & 8) { let e = p; while (e < u8.length && u8[e]) e++; o.name = decodeName(u8.subarray(p, e)); }
    return o;
  }
  function finish(list) {
    // 名前をきれいにして、同じ名前は後のものを使う。親のフォルダが無いものはフォルダを足す（一覧をフォルダでたどれるように）
    const map = new Map();
    list.forEach(e => {
      const c = clean(e.name); if (!c.name) return;
      e.name = c.name; if (c.unsafe) e.unsafe = true;
      if (!e.bytes) e.bytes = async () => new Uint8Array(0);
      map.set(e.name, e);
    });
    for (const n of [...map.keys()]) {
      const parts = n.split('/');
      for (let i = 1; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!map.has(d)) map.set(d, { name: d, dir: true, size: 0, csize: 0, mtime: (map.get(n) || {}).mtime, implied: true, bytes: async () => new Uint8Array(0) }); }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async function openBytes(u8, name) {
    name = path.base(String(name || ''));
    const fmt = detect(u8);
    if (fmt === 'zip') return { format: 'zip', name: name, size: u8.length, entries: finish(zipRead(u8)) };
    if (fmt === 'tar') return { format: 'tar', name: name, size: u8.length, entries: finish(tarRead(u8)) };
    if (fmt === 'gz') {
      const inner = await gunzip(u8), info = gzInfo(u8);
      if (detect(inner) === 'tar' || (/\.(tgz|tar\.gz)$/i.test(name) && inner.length % 512 === 0 && inner.length >= 1024))
        return { format: 'tar.gz', name: name, size: u8.length, entries: finish(tarRead(inner)) };
      const stem = info.name || name.replace(/\.gz$/i, '') || 'data';
      return { format: 'gz', name: name, size: u8.length, entries: finish([{ name: path.base(stem), size: inner.length, csize: u8.length, mtime: info.mtime ? info.mtime * 1000 : Date.now(), bytes: async () => inner }]) };
    }
    if (/\.tar$/i.test(name) && u8.length % 512 === 0) return { format: 'tar', name: name, size: u8.length, entries: finish(tarRead(u8)) }; // 古い（ustar でない）tar
    throw new Error((name || 'ファイル') + ': 対応していない形式です（ZIP・tar・tar.gz・gz に対応しています）');
  }
  async function open(fsx, p) { return Object.assign(await openBytes(await readBytes(fsx, p), p), { path: p }); }

  // ---------- 展開
  async function extract(fsx, arc, dest, opt) {
    opt = opt || {};
    const res = { files: 0, dirs: 0, links: 0, skipped: [], unsafe: [], written: [] };
    if (fsx.exists(dest) && !fsx.isDir(dest)) throw new Error(dest + ': ディレクトリではありません');
    if (!fsx.isDir(dest)) fsx.mkdir(dest, { parents: true });
    const realDest = OS.fs.real(dest);
    const inside = p => { const r = OS.fs.real(p); return r === realDest || r.startsWith(realDest === '/' ? '/' : realDest + '/'); };
    const only = (opt.only || []).map(x => clean(x).name).filter(Boolean);
    const want = n => !only.length || only.some(o => n === o || n.startsWith(o + '/'));
    const list = arc.entries.filter(e => want(e.name) && !(e.implied && opt.skipImplied));
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      let rel = e.name;
      if (opt.strip) { if (!(rel + '/').startsWith(opt.strip)) continue; rel = rel.slice(opt.strip.length); if (!rel) continue; }
      if (e.unsafe) { res.unsafe.push(e.name); continue; }
      const p = path.join(dest, rel);
      // シンボリックリンクを通って展開先の外に書くのを防ぐ
      if (!inside(path.dir(p))) { res.unsafe.push(e.name); continue; }
      if (e.dir) { if (!fsx.isDir(p)) { if (fsx.exists(p)) { res.skipped.push(rel); continue; } fsx.mkdir(p, { parents: true }); } res.dirs++; }
      else {
        if (!fsx.isDir(path.dir(p))) fsx.mkdir(path.dir(p), { parents: true });
        if (fsx.exists(p) || fsx.isLink(p)) {
          if (!opt.overwrite || fsx.isDir(p)) { res.skipped.push(rel); if (opt.progress) await opt.progress(e, i, list.length, 'skip'); continue; }
          if (fsx.isLink(p) || e.link != null || e.linkRaw) fsx.rm(p);
        }
        let link = e.link;
        if (e.linkRaw) link = dec.decode(await e.bytes());
        if (link != null) { fsx.symlink(link, p); res.links++; }
        else {
          writeBytes(fsx, p, await e.bytes()); res.files++;
          if (e.mode && fsx.chmod) { try { fsx.chmod(p, e.mode & 0o777); } catch (x) { /* モードは戻せなくてもよい */ } }
        }
        res.written.push(p);
      }
      if (opt.progress) await opt.progress(e, i, list.length, 'ok');
    }
    return res;
  }

  // ---------- 作る
  const modeOf = (p, s) => { try { return OS.perm.def(OS.fs.real(p), s) & 0o7777; } catch (e) { return s.t === 'd' ? 0o755 : 0o644; } };
  // 入れるものを集める。name はアーカイブの中の名前（空ならフォルダの中身をそのまま一番上に並べる）
  function collect(fsx, src, name, out, opt, seen) {
    const real = OS.fs.real(src, true);
    if (/^\/(proc|dev)(\/|$)/.test(real)) return; // 仮想のファイルシステムは入れない
    if (opt.exclude && opt.exclude.includes(OS.fs.real(src))) return;
    const ls = fsx.lstat(src);
    if (!ls) throw new Error(src + ': そのようなファイルはありません');
    if (ls.t === 'l') {
      if (opt.links) { if (name) out.push({ name: name, link: ls.c, mtime: ls.m, mode: 0o777, owner: ls.o }); return; }
      if (!fsx.exists(src) || fsx.isDir(src)) return; // ZIP ではリンク先のファイルの中身を入れる（フォルダへのリンクはたどらない）
    }
    const s = fsx.stat(src);
    if (s.t === 'p' || s.x) return; // 名前付きパイプとデバイスは入れない
    if (s.t === 'd') {
      const r = OS.fs.real(src); if (seen.has(r)) return; seen.add(r);
      if (name) out.push({ name: name, dir: true, mtime: s.m, mode: modeOf(src, s), owner: s.o });
      for (const c of fsx.list(src)) collect(fsx, path.join(src, c), name ? name + '/' + c : c, out, opt, seen);
      return;
    }
    out.push({ name: name || path.base(src), size: s.c.length, mtime: s.m, mode: modeOf(src, s), owner: s.o, bytes: () => readBytes(fsx, src) });
  }
  function gather(fsx, sources, opt) {
    const out = [], seen = new Set();
    sources.forEach(s => { const o = typeof s === 'string' ? { path: s, name: path.base(s) } : s; collect(fsx, o.path, o.name == null ? path.base(o.path) : o.name, out, opt, seen); });
    const map = new Map(); out.forEach(e => map.set(e.name, e)); // 同じ名前は後のもの
    return [...map.values()];
  }
  async function build(entries, format, opt) {
    opt = opt || {};
    if (!FORMATS.includes(format)) throw new Error((format || '（なし）') + ': 形式は zip / tar / tar.gz / gz のどれかです');
    const list = entries.filter(e => !e.implied || format === 'zip');
    if (format === 'zip') return zipWrite(list, opt, opt.progress);
    if (format === 'gz') {
      const files = list.filter(e => !e.dir && e.link == null);
      if (files.length !== 1) throw new Error('gz に入れられるのはファイル 1 つだけです（まとめるときは tar.gz にしてください）');
      const u = await files[0].bytes(); if (opt.progress) await opt.progress(files[0], 0, 1, { size: u.length });
      return gzip(u);
    }
    const t = await tarWrite(list, opt.progress);
    return format === 'tar.gz' ? gzip(t) : t;
  }
  async function create(fsx, sources, out, opt) {
    opt = Object.assign({}, opt);
    const format = opt.format || formatOf(out);
    if (!format) throw new Error(out + ': 拡張子から形式が分かりません（.zip / .tar / .tar.gz / .tgz / .gz）');
    const entries = gather(fsx, sources, { links: format !== 'zip', exclude: [OS.fs.real(out)] });
    if (!entries.length) throw new Error('入れるものがありません');
    const u8 = await build(entries, format, opt);
    fsx.write(out, 'data:' + MIME[format] + ';base64,' + bytesToB64(u8), { bin: true });
    let raw = 0; entries.forEach(e => { raw += e.size || 0; });
    return { format: format, count: entries.filter(e => !e.dir).length, dirs: entries.filter(e => e.dir).length, size: u8.length, raw: raw, out: out };
  }

  // ---------- 右クリックメニュー（hFile とデスクトップ）
  const fsx = () => OS.htui.fs;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  // 「ここに展開」: 中身が 1 つのフォルダ（かファイル）だけなら、そのまま同じ場所に。いくつもあれば、アーカイブの名前のフォルダを作って入れる
  async function extractHere(p) {
    const ui = OS.ui, f = fsx(), dir = path.dir(p);
    try {
      const arc = await open(f, p);
      const top = [...new Set(arc.entries.map(e => e.name.split('/')[0]))];
      let dest, strip = null, where;
      if (top.length === 1 && !f.exists(path.join(dir, top[0]))) { dest = dir; where = path.join(dir, top[0]); }
      else if (top.length === 1 && arc.entries.find(e => e.name === top[0]).dir) { dest = where = f.unique(path.join(dir, top[0])); strip = top[0] + '/'; } // 同じ名前のフォルダがあるので「名前 (1)」に
      else dest = where = f.unique(path.join(dir, stem(p)));
      const r = await extract(f, arc, dest, { strip: strip });
      OS.notify({ app: 'hArchive', icon: 'archive', title: '展開しました', body: path.base(p) + ' → ' + where + '（' + r.files + ' 個のファイル）', silent: true });
      ui.toast(path.base(p) + ' を ' + path.base(where) + ' に展開しました' + (r.unsafe.length ? '（危ない名前の ' + r.unsafe.length + ' 個は飛ばしました）' : ''));
      return where;
    } catch (e) { ui.alert(e.message, '展開できませんでした'); return null; }
  }
  const stem = p => path.base(p).replace(/\.(tar\.gz|tgz|tar|zip|gz)$/i, '') || path.base(p);
  async function compressHere(p, format) {
    const ui = OS.ui, f = fsx(); format = format || 'zip';
    try {
      const b = path.base(p), isDir = f.isDir(p);
      const nm = (isDir ? b : format === 'gz' ? b : b.replace(/\.[^.]+$/, '') || b) + EXT[format];
      const out = f.unique(path.join(path.dir(p), nm));
      const r = await create(f, [{ path: p, name: b }], out, { format: format });
      ui.toast(path.base(out) + ' を作りました（' + fmtSize(r.size) + '）');
      return out;
    } catch (e) { ui.alert(e.message, '圧縮できませんでした'); return null; }
  }
  // メニューの項目（hFile・デスクトップの右クリック）
  function menuItems(p, isDir) {
    const items = [];
    const app = !!OS.apps.harchive; // htmlOS i には hArchive がない
    if (!isDir && isArchive(p)) { items.push({ label: 'ここに展開', icon: 'archive', act: () => extractHere(p) }); if (app) items.push({ label: 'hArchive で開く', icon: 'archive', act: () => OS.launch('harchive', p) }); }
    items.push({ label: '圧縮（ZIP）', icon: 'archive', act: () => compressHere(p, 'zip') });
    if (app) items.push({ label: '形式を選んで圧縮…', act: () => OS.launch('harchive', { create: [p] }) });
    return items;
  }

  OS.archive = {
    formats: FORMATS, ext: EXT, mime: MIME, formatOf: formatOf, isArchive: isArchive, supported: hasCS,
    open: open, openBytes: openBytes, extract: extract, create: create, build: build, gather: gather,
    readBytes: readBytes, writeBytes: writeBytes, toContent: toContent, bytesToB64: bytesToB64, crc32: crc32,
    gzip: gzip, gunzip: gunzip, extractHere: extractHere, compressHere: compressHere, menuItems: menuItems, stem: stem, fmtSize: fmtSize
  };
})();
