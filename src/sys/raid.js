/* htmlOS ストレージ管理（7.0 Polaris）— HDD3 と RAID
   ・HDD3: HDD1 と同じく File System Access API で選ぶ PC のフォルダ。用途は「データ置き場」（/mnt/hdd3 につなぐ）か「RAID 用」
   ・RAID: HDD1（PC のフォルダ）・HDD2（IndexedDB）・HDD3（PC のフォルダ）を組み合わせて 1 つのドライブ（md0）にし、/mnt/raid につなぐ
       RAID0（ストライピング）: 2 台以上。データを 64KB ずつ交互に置く。容量は合計、1 台でも欠けると読めない
       RAID1（ミラーリング）  : 2 台以上。全部に同じものを書く。1 台残っていれば読める
       RAID5（パリティ）      : 3 台（HDD1・HDD2・HDD3）。2 台分のデータと 1 台分のパリティ（XOR）を行ごとに入れ替えて置く。1 台欠けても読め、戻ってきたら再構築する
     各ドライブの中の置き場所: PC のフォルダは .htmlos-raid/<uuid>/ （htmlOS のファイルとしては見えない）、HDD2 は IndexedDB の htmlos-raid
     中身: index（全ドライブに同じものを置く。世代 gen つき）と、ファイルごとのかたまり o<id>.<行>
   ・設定は /etc/raid.json（アレイ）と /etc/storage.json（HDD3 の用途）。起動のときに自動で組み立てる（フォルダの許可が要るときは待つ） */
(function () {
  'use strict';
  const OS = window.OS, fs = OS.fs, BOOT = window.BOOT;
  const RAID_DIR = '.htmlos-raid', CH = 64 * 1024, AT = '/mnt/raid', CONF = '/etc/raid.json', SCONF = '/etc/storage.json';
  const DEVS = { hdd1: 'HDD1', hdd2: 'HDD2', hdd3: 'HDD3' };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const log = (m, prio) => { if (OS.journal) OS.journal.log('raid', m, { prio: prio == null ? 6 : prio }); };
  const readJSON = p => { try { return JSON.parse(fs.read(p)); } catch (e) { return null; } };
  const fmt = n => n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

  // ---------------------------------------------------------------- 設定
  const storage = OS.storage = {
    conf() { return readJSON(SCONF) || {}; },
    setConf(c) { fs.write(SCONF, JSON.stringify(c, null, 1)); },
    // HDD3 の用途: 'data'（/mnt/hdd3 につなぐ）か 'raid'（RAID だけに使う）
    hdd3Use() { return storage.conf().hdd3 === 'raid' ? 'raid' : 'data'; },
    async setHdd3Use(u) {
      const c = storage.conf(); c.hdd3 = u === 'raid' ? 'raid' : 'data'; storage.setConf(c);
      if (c.hdd3 === 'raid' && OS.hdd3.mounted) await OS.hdd3.unmount();
    },
    // HDD3 をセットアップする（フォルダを選んで覚える。用途が data ならつなぐ）。ユーザーの操作の中で呼ぶ
    async setupHdd3(use, progress) {
      if (!OS.hdd3.supported) throw new Error('このブラウザは File System Access API に対応していません（パソコンの Chrome・Edge などで使えます）');
      if (OS.hdd3.mounted) await OS.hdd3.unmount();
      const dir = await OS.hdd3.pick();
      const h1 = await OS.hdd.handle();
      if (h1 && h1.isSameEntry && await h1.isSameEntry(dir)) { await OS.hdd3.forget(); throw new Error('HDD1 と同じフォルダは HDD3 にできません。別のフォルダを選んでください'); }
      if (BOOT.store.handle && BOOT.store.handle.isSameEntry && await BOOT.store.handle.isSameEntry(dir)) { await OS.hdd3.forget(); throw new Error('起動しているフォルダ（HDD1）は HDD3 にできません'); }
      await storage.setHdd3Use(use);
      log('HDD3 にフォルダ「' + dir.name + '」を設定しました（' + (use === 'raid' ? 'RAID 用' : 'データ置き場') + '）');
      if (use !== 'raid') await OS.hdd3.mount(false, progress);
      return dir.name;
    },
    async forgetHdd3() {
      const c = raid.config();
      if (c && c.members.includes('hdd3')) throw new Error('HDD3 は RAID（' + c.level.toUpperCase() + '）に使われています。先に RAID を削除してください');
      await OS.hdd3.forget(); log('HDD3 の設定を外しました');
    },
    // 起動のとき: HDD3（データ置き場）と RAID を自動でつなぐ。ログの行を返す
    async boot() {
      const out = [];
      if (OS.hdd3.supported && storage.hdd3Use() === 'data') {
        try { const r = await OS.hdd3.auto(); if (r) out.push({ msg: 'HDD3（' + r.name + '）を ' + OS.hdd3.at + ' にマウントしました' }); else if (OS.hdd3.waiting) out.push({ msg: 'HDD3（' + OS.hdd3.waiting + '）: 使う許可を待っています（設定 → ストレージ か mount hdd3 で接続）' }); }
        catch (e) { out.push({ msg: 'HDD3: ' + e.message, fail: true }); }
      }
      if (raid.config()) {
        try { const r = await raid.assemble({ ask: false }); out.push({ msg: 'RAID（md0・' + r.level.toUpperCase() + '）を ' + AT + ' にマウントしました' + (r.state !== 'clean' ? '（' + raid.stateName(r.state) + '）' : '') }); }
        catch (e) { raid.waiting = e.message; out.push({ msg: 'RAID（md0）: ' + e.message, fail: !e.waiting }); }
      }
      return out;
    }
  };

  // ---------------------------------------------------------------- ドライブ（RAID のメンバー）
  // HDD2: IndexedDB のデータベース htmlos-raid（HDD2 のシステムのデータとは別）
  let rdb = null;
  function raidDB() {
    if (rdb) return rdb;
    rdb = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB が使えません')); return; }
      const r = indexedDB.open('htmlos-raid', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blocks');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    rdb.catch(() => { rdb = null; });
    return rdb;
  }
  const tx = (db, mode, fn) => new Promise((res, rej) => { const t = db.transaction('blocks', mode), q = fn(t.objectStore('blocks')); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB に書けませんでした')); });
  async function idbMember(uuid) {
    const db = await raidDB(), K = k => uuid + '/' + k;
    return {
      dev: 'hdd2', label: 'HDD2', name: 'IndexedDB',
      async get(k) { const v = await tx(db, 'readonly', s => s.get(K(k))); return v == null ? null : new Uint8Array(v); },
      put: (k, u) => tx(db, 'readwrite', s => s.put(u, K(k))),
      del: k => tx(db, 'readwrite', s => s.delete(K(k))),
      destroy: () => tx(db, 'readwrite', s => s.delete(IDBKeyRange.bound(uuid + '/', uuid + '/￿')))
    };
  }
  // HDD1・HDD3: PC のフォルダの .htmlos-raid/<uuid>/
  async function folderMember(dev, uuid, ask) {
    const drive = dev === 'hdd1' ? OS.hdd : OS.hdd3;
    let dir = drive.root ? BOOT.store.handle : await drive.access(ask);
    if (!dir) {
      const h = await drive.handle();
      const e = new Error(h ? DEVS[dev] + '（' + h.name + '）を使う許可を待っています' : DEVS[dev] + ' のフォルダが設定されていません');
      e.waiting = !!h; throw e;
    }
    const top = await dir.getDirectoryHandle(RAID_DIR, { create: true }), ad = await top.getDirectoryHandle(uuid, { create: true });
    return {
      dev: dev, label: DEVS[dev], name: dir.name,
      async get(k) { try { return new Uint8Array(await (await (await ad.getFileHandle(k)).getFile()).arrayBuffer()); } catch (e) { if (e.name === 'NotFoundError') return null; throw e; } },
      async put(k, u) { const w = await (await ad.getFileHandle(k, { create: true })).createWritable(); await w.write(u); await w.close(); },
      async del(k) { try { await ad.removeEntry(k); } catch (e) { if (e.name !== 'NotFoundError') throw e; } },
      async destroy() { try { await top.removeEntry(uuid, { recursive: true }); } catch (e) { if (e.name !== 'NotFoundError') throw e; } }
    };
  }
  const openMember = (dev, uuid, ask) => dev === 'hdd2' ? idbMember(uuid) : folderMember(dev, uuid, ask);

  // ---------------------------------------------------------------- 並べ方（ストライプ・パリティ）
  const xor = (a, b) => { const o = new Uint8Array(Math.max(a.length, b.length)); o.set(a); for (let i = 0; i < b.length; i++) o[i] ^= b[i]; return o; };
  const chunkOf = (bytes, c) => bytes.subarray(c * CH, Math.min(bytes.length, (c + 1) * CH));
  const chunkLen = (len, c) => Math.max(0, Math.min(CH, len - c * CH));
  // 行の数
  function rowsOf(level, n, len) {
    if (!len) return 0;
    if (level === 'raid1') return 1;
    return Math.ceil(len / CH / (level === 'raid5' ? n - 1 : n));
  }
  // RAID5: 行 r のパリティを置くドライブと、データ（q 番目）を置くドライブ
  const parityOf = (n, r) => (n - 1) - (r % n);
  const dataMember = (n, r, q) => { const p = parityOf(n, r); return q < p ? q : q + 1; };
  // 1 つのファイル（ノードの JSON のバイト列）を、使えるドライブに書く。oldLen より短くなったら余った行を消す
  async function writeObj(A, id, bytes, oldLen) {
    const { level, n } = A.idx, ms = A.members, rows = rowsOf(level, n, bytes.length), old = rowsOf(level, n, oldLen || 0), jobs = [];
    const put = (i, k, u) => { if (ms[i]) jobs.push(ms[i].put(k, u)); }, del = (i, k) => { if (ms[i]) jobs.push(ms[i].del(k)); };
    if (level === 'raid1') { for (let i = 0; i < n; i++) put(i, 'o' + id, bytes); }
    else if (level === 'raid0') {
      for (let r = 0; r < Math.max(rows, old); r++) for (let i = 0; i < n; i++) {
        const c = r * n + i;
        if (r < rows && c * CH < bytes.length) put(i, 'o' + id + '.' + r, chunkOf(bytes, c)); else del(i, 'o' + id + '.' + r);
      }
    } else {
      const d = n - 1;
      for (let r = 0; r < Math.max(rows, old); r++) {
        if (r >= rows) { for (let i = 0; i < n; i++) del(i, 'o' + id + '.' + r); continue; }
        let par = new Uint8Array(0);
        for (let q = 0; q < d; q++) { const ch = chunkOf(bytes, r * d + q); par = xor(par, ch); put(dataMember(n, r, q), 'o' + id + '.' + r, ch); }
        put(parityOf(n, r), 'o' + id + '.' + r, par);
      }
    }
    await Promise.all(jobs);
  }
  async function delObj(A, id, len) {
    const { level, n } = A.idx, jobs = [];
    A.members.forEach(m => { if (!m) return; if (level === 'raid1') jobs.push(m.del('o' + id)); else for (let r = 0; r < rowsOf(level, n, len); r++) jobs.push(m.del('o' + id + '.' + r)); });
    await Promise.all(jobs);
  }
  // 読む（RAID5 で 1 台欠けていたら、パリティから作り直す）
  async function readObj(A, id, len) {
    const { level, n } = A.idx, ms = A.members;
    if (!len) return new Uint8Array(0);
    if (level === 'raid1') {
      for (const m of ms) { if (!m) continue; const u = await m.get('o' + id); if (u && u.length === len) return u; }
      throw new Error('o' + id + ' がどのドライブにもありません');
    }
    const out = new Uint8Array(len), rows = rowsOf(level, n, len);
    if (level === 'raid0') {
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
        const c = r * n + i, L = chunkLen(len, c); if (!L) continue;
        const u = await ms[i].get('o' + id + '.' + r); if (!u || u.length !== L) throw new Error('o' + id + ' の ' + (c + 1) + ' 個目のかたまりが ' + ms[i].label + ' にありません');
        out.set(u, c * CH);
      }
      return out;
    }
    const d = n - 1;
    for (let r = 0; r < rows; r++) {
      const got = await Promise.all(ms.map(m => m ? m.get('o' + id + '.' + r) : null));
      for (let q = 0; q < d; q++) {
        const c = r * d + q, L = chunkLen(len, c); if (!L) continue;
        let u = got[dataMember(n, r, q)];
        if (!u || u.length !== L) {
          // パリティと、ほかのデータから作り直す
          let x = got[parityOf(n, r)]; if (!x) throw new Error('o' + id + ' の行 ' + r + ' を作り直せません（2 台以上が欠けています）');
          for (let q2 = 0; q2 < d; q2++) { if (q2 === q) continue; const v = got[dataMember(n, r, q2)]; if (!v && chunkLen(len, r * d + q2)) throw new Error('o' + id + ' の行 ' + r + ' を作り直せません'); if (v) x = xor(x, v); }
          u = x.subarray(0, L);
        }
        out.set(u, c * CH);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- アレイ（/mnt/raid のストレージ）
  // 中身はメモリに全部読み込んで、読み書きはすぐに返す。ドライブへは裏で書き出す（HDD1 と同じ考え方）
  function arrayStore(A) {
    const map = A.map, dirty = new Set(); let busy = null, used = 0;
    map.forEach(v => { used += v.length; });
    const st = { ram: false, raid: true, name: 'md0（' + A.idx.level.toUpperCase() + '）', label: 'RAID', errors: [], skipped: [], onerror: null };
    function report(what, e) {
      st.errors.push(what + ': ' + ((e && e.message) || e)); log(what + ': ' + ((e && e.message) || e), 3);
      if (OS.notify && OS.htui && OS.htui.user) OS.notify({ app: 'RAID', icon: 'raid', title: 'RAID に書き込めませんでした', body: what + ': ' + ((e && e.message) || e) });
    }
    async function writeIndex() {
      A.idx.gen++; const u = enc.encode(JSON.stringify(A.idx));
      await Promise.all(A.members.map(m => m && m.put('index', u)));
    }
    function kick() {
      if (!busy) busy = (async () => {
        await null;
        while (dirty.size) {
          const list = Array.from(dirty); dirty.clear();
          for (const k of list) {
            const v = map.get(k), ent = A.idx.files[k];
            try {
              if (v == null) { if (ent) { delete A.idx.files[k]; await delObj(A, ent[0], ent[1]); } }
              else { const b = enc.encode(v), id = ent ? ent[0] : A.idx.next++; await writeObj(A, id, b, ent ? ent[1] : 0); A.idx.files[k] = [id, b.length]; }
            } catch (e) { report(k.slice(2), e); }
          }
          try { await writeIndex(); } catch (e) { report('index', e); }
        }
        busy = null;
      })();
      return busy;
    }
    st.get = k => { const v = map.get(k); return v === undefined ? null : v; };
    st.set = (k, v) => { if (k.indexOf('f:') !== 0) return; v = String(v); const o = map.get(k); used += v.length - (o ? o.length : 0); map.set(k, v); dirty.add(k); kick(); };
    st.del = k => { if (k === 'f:' + AT) return; const o = map.get(k); if (o == null) return; used -= o.length; map.delete(k); dirty.add(k); kick(); };
    st.keys = pre => { pre = pre || ''; const out = []; map.forEach((v, k) => { if (k.indexOf(pre) === 0) out.push(k); }); return out; };
    st.wipe = () => st.keys().forEach(k => st.del(k));
    st.flush = () => busy || Promise.resolve();
    st.pending = () => !!busy || dirty.size > 0;
    st.count = () => map.size;
    st.used = () => used;
    st.quota = () => 0;
    // 全部を書き直す（欠けていたドライブが戻ってきたときの再構築）
    st.resyncAll = async progress => { const keys = Array.from(map.keys()); let i = 0; for (const k of keys) { const ent = A.idx.files[k], b = enc.encode(map.get(k)); const id = ent ? ent[0] : A.idx.next++; await writeObj(A, id, b, ent ? ent[1] : 0); A.idx.files[k] = [id, b.length]; if (progress && ++i % 20 === 0) progress(i, keys.length); } await writeIndex(); };
    return st;
  }

  // ---------------------------------------------------------------- RAID の操作
  const raid = OS.raid = {
    at: AT, CH: CH, devs: DEVS, active: null, waiting: null,
    config: () => readJSON(CONF),
    stateName: s => ({ clean: '正常', degraded: '縮退（1 台欠けています）', rebuilding: '再構築中', waiting: '待機中' })[s] || s,
    levels: { raid0: { name: 'RAID0（ストライピング）', min: 2, tol: 0 }, raid1: { name: 'RAID1（ミラーリング）', min: 2, tol: Infinity }, raid5: { name: 'RAID5（パリティ）', min: 3, tol: 1 } },
    // 使えるドライブ（hdd2 は IndexedDB があれば、hdd1・hdd3 はフォルダが設定されていれば）
    async available() {
      const out = {};
      out.hdd2 = !!window.indexedDB;
      out.hdd1 = OS.hdd.root || !!(await OS.hdd.handle());
      out.hdd3 = !!(await OS.hdd3.handle()) && storage.hdd3Use() === 'raid';
      return out;
    },
    // 容量の目安（使い方の説明に出す）
    capacityNote(level, n) { return level === 'raid0' ? 'すべてのドライブの合計（' + n + ' 台）' : level === 'raid1' ? 'いちばん小さいドライブと同じ（' + n + ' 台に同じものを書きます）' : 'いちばん小さいドライブの ' + (n - 1) + ' 台分（1 台分はパリティ）'; },
    status() {
      const A = raid.active, c = raid.config();
      if (!c) return null;
      if (!A) return { level: c.level, members: c.members.map(d => ({ dev: d, label: DEVS[d], ok: false })), state: 'waiting', reason: raid.waiting, at: AT, created: c.created };
      return { level: A.idx.level, members: A.idx.members.map((d, i) => ({ dev: d, label: DEVS[d], name: A.members[i] ? A.members[i].name : null, ok: !!A.members[i] })), state: A.state, at: AT, files: Object.keys(A.idx.files).length, used: A.store.used(), gen: A.idx.gen, created: c.created };
    },
    // 新しく作る（中身は空）。ask: フォルダの許可を求める（ボタンを押したときなど）
    async create(level, devs, o) {
      o = o || {};
      level = String(level).toLowerCase().replace(/^(\d)$/, 'raid$1');
      const L = raid.levels[level]; if (!L) throw new Error('RAID のレベルは 0・1・5 です');
      devs = Array.from(new Set(devs.map(d => String(d).toLowerCase())));
      devs.forEach(d => { if (!DEVS[d]) throw new Error(d + ': そのようなドライブはありません（hdd1・hdd2・hdd3）'); });
      if (raid.config()) throw new Error('RAID（md0）はもうあります。作り直すときは先に削除してください');
      if (devs.length < L.min) throw new Error(L.name + ' には ' + L.min + ' 台以上のドライブが必要です');
      if (level === 'raid5') {
        if (!devs.includes('hdd3')) throw new Error('RAID5 は HDD3 をセットアップしてから使えます（HDD1・HDD2・HDD3 の 3 台）');
        if (devs.length !== 3) throw new Error('RAID5 は HDD1・HDD2・HDD3 の 3 台で作ります');
      }
      if (devs.includes('hdd3') && !(await OS.hdd3.handle())) throw new Error('HDD3 がセットアップされていません（設定 → ストレージ）');
      if (devs.includes('hdd3') && storage.hdd3Use() !== 'raid') await storage.setHdd3Use('raid');
      const uuid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
      const ms = [];
      for (const d of devs) ms.push(await openMember(d, uuid, o.ask !== false));
      const idx = { format: 'htmlos-raid', version: 1, uuid: uuid, level: level, n: devs.length, members: devs, chunk: CH, gen: 0, next: 1, files: {}, created: Date.now() };
      const A = { idx: idx, members: ms, map: new Map(), state: 'clean' };
      A.map.set('f:' + AT, JSON.stringify({ t: 'd', m: Date.now(), o: 'root', p: 0o777 }));
      A.store = arrayStore(A);
      A.store.set('f:' + AT, A.map.get('f:' + AT));
      await A.store.flush();
      fs.write(CONF, JSON.stringify({ uuid: uuid, level: level, members: devs, created: idx.created }, null, 1));
      raid.active = A; raid.waiting = null;
      OS.mountStore(AT, A.store);
      log(L.name + ' を作りました（' + devs.map(d => DEVS[d]).join('・') + '）');
      return raid.status();
    },
    // 組み立てて /mnt/raid につなぐ
    async assemble(o) {
      o = o || {};
      const c = raid.config(); if (!c) throw new Error('RAID はありません（raid create で作れます）');
      if (raid.active) return raid.status();
      const L = raid.levels[c.level];
      const errs = [], ms = await Promise.all(c.members.map(d => openMember(d, c.uuid, o.ask).catch(e => { errs.push(e); return null; })));
      // それぞれの index を読み、いちばん新しい世代を使う
      const idxs = await Promise.all(ms.map(m => m ? m.get('index').then(u => { try { return u && JSON.parse(dec.decode(u)); } catch (e) { return null; } }).catch(() => null) : null));
      let best = null; idxs.forEach(x => { if (x && x.uuid === c.uuid && (!best || x.gen > best.gen)) best = x; });
      if (!best) { const e = new Error(errs.length ? errs.map(x => x.message).join('、') : 'RAID のデータが見つかりません'); e.waiting = errs.some(x => x.waiting); throw e; }
      // 古い世代のドライブは、読むのには使わず、あとで書き直す
      const stale = [];
      const readMs = ms.map((m, i) => { if (m && idxs[i] && idxs[i].gen === best.gen) return m; if (m) stale.push(i); return null; });
      const missing = readMs.filter(m => !m).length;
      if (missing > L.tol) {
        const e = new Error(L.name + ' を組み立てられません: ' + missing + ' 台が使えません' + (errs.length ? '（' + errs.map(x => x.message).join('、') + '）' : ''));
        e.waiting = errs.some(x => x.waiting); throw e;
      }
      const A = { idx: best, members: readMs, map: new Map(), state: missing ? 'degraded' : 'clean' };
      const keys = Object.keys(best.files); let i = 0;
      for (const k of keys) {
        const ent = best.files[k];
        try { A.map.set(k, dec.decode(await readObj(A, ent[0], ent[1]))); }
        catch (e) { log(k.slice(2) + ' を読めませんでした: ' + e.message, 3); }
        if (o.progress && ++i % 20 === 0) o.progress(i, keys.length);
      }
      if (!A.map.has('f:' + AT)) A.map.set('f:' + AT, JSON.stringify({ t: 'd', m: Date.now(), o: 'root', p: 0o777 }));
      A.store = arrayStore(A);
      raid.active = A; raid.waiting = null;
      OS.mountStore(AT, A.store);
      log(L.name + ' を組み立てました（' + raid.stateName(A.state) + '、' + keys.length + ' 項目）', missing ? 4 : 6);
      if (stale.length) {
        stale.forEach(j => { A.members[j] = ms[j]; });
        if (A.members.every(Boolean)) await raid.rebuild({ ask: false }).catch(e => log('再構築できませんでした: ' + e.message, 3));
      }
      else if (missing && OS.notify) OS.notify({ app: 'RAID', icon: 'raid', title: 'RAID が縮退しています', body: errs.map(x => x.message).join('、') || '1 台が使えません' });
      return raid.status();
    },
    // 欠けていたドライブを戻して全部を書き直す。ask: フォルダの許可を求める
    async rebuild(o) {
      o = o || {};
      const A = raid.active; if (!A) throw new Error('RAID が組み立てられていません');
      for (let i = 0; i < A.members.length; i++) if (!A.members[i]) A.members[i] = await openMember(A.idx.members[i], A.idx.uuid, o.ask !== false);
      A.state = 'rebuilding'; log('再構築を始めました');
      await A.store.flush();
      await A.store.resyncAll(o.progress);
      A.state = 'clean'; log('再構築が終わりました');
      if (OS.notify) OS.notify({ app: 'RAID', icon: 'raid', title: 'RAID の再構築が終わりました' });
      return raid.status();
    },
    async stop() {
      if (!raid.active) return false;
      await raid.active.store.flush(); await OS.unmountStore(AT); raid.active = null; log('RAID を止めました'); return true;
    },
    // 削除: 止めて、各ドライブの RAID のデータを消す（元に戻せない）
    async destroy(o) {
      const c = raid.config(); if (!c) throw new Error('RAID はありません');
      await raid.stop();
      for (const d of c.members) { try { const m = await openMember(d, c.uuid, !(o && o.ask === false)); await m.destroy(); } catch (e) { log(DEVS[d] + ' の RAID のデータを消せませんでした: ' + e.message, 4); } }
      fs.rm(CONF); raid.waiting = null; log('RAID（md0）を削除しました');
    },
    fmt: fmt
  };
})();
