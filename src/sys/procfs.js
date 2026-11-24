/* htmlOS procfs / devfs（7.2 から）— 中身を持たない「仮想ファイルシステム」
   ・/proc  いまの OS の状態を、読んだその時に作るファイル。cat /proc/meminfo、/proc/cpuinfo、/proc/uptime、/proc/version、
            /proc/<PID>/status（ps に出るプロセスが 1 つずつディレクトリになる）、/proc/mounts、/proc/self など
   ・/dev   デバイスファイル。/dev/null（捨てる）、/dev/zero、/dev/random、/dev/tty（いまの端末）、/dev/kmsg（ジャーナル）、
            ドライブ（/dev/hdd1・hdd2・hdd3・md0）、USB シリアル（/dev/ttyACM0・/dev/ttyUSB0。hMicroPy・hSerial で開いている間は読み書きできる）
   どちらも OS.mountStore でつなぐ「ストレージ」の形をしているので、ls・cat・hFile などはふつうのファイルと同じように扱える。
   ストレージには何も書かない（再起動すれば消える、というより最初から無い） */
(function () {
  'use strict';
  const OS = window.OS, fs = OS.fs, BOOT = window.BOOT || {};
  const now = () => Date.now();
  const bootT = () => OS.bootTime || now();
  const kB = n => String(Math.round(n / 1024)).padStart(9) + ' kB';
  const ro = (p, label) => { const e = new Error(p + ': 読み取り専用のファイルシステムです（' + label + '）'); e.code = 'EROFS'; return e; };

  // ---------------------------------------------------------------- 仮想ツリー → ストレージ
  // ツリーの節: { dir: () => ({ 名前: 節 }) } / { file: () => 文字列, write(s), mode, owner, group, dev: 'c'|'b' } / { link: () => リンク先 }
  // m（変更日時）は、ファイルは読んだ時刻、ディレクトリは起動した時刻（プロセスのディレクトリはそのプロセスの開始時刻）
  function vstore(at, label, root) {
    const KEY = 'f:' + at;
    const walk = k => {
      if (k === KEY) return root;
      if (!k.startsWith(KEY + '/')) return null;
      let n = root;
      for (const part of k.slice(KEY.length + 1).split('/')) {
        if (!n || !n.dir) return null;
        n = n.dir()[part];
      }
      return n || null;
    };
    const node = n => {
      if (n.link) return JSON.stringify({ t: 'l', c: String(n.link()), m: n.m ? n.m() : bootT(), o: n.owner || 'root' });
      if (n.dir) { const o = { t: 'd', m: n.m ? n.m() : bootT(), o: n.owner || 'root', p: n.mode == null ? 0o555 : n.mode }; if (n.group) o.g = n.group; return JSON.stringify(o); }
      let c = '';
      try { c = String(n.file()); } catch (e) { c = ''; }
      const o = { t: 'f', c: c, m: now(), o: n.owner || 'root', p: n.mode == null ? 0o444 : n.mode };
      if (n.group) o.g = n.group;
      if (n.dev) o.x = n.dev;
      return JSON.stringify(o);
    };
    return {
      name: label, label: label, virtual: true,
      get(k) { try { const n = walk(k); return n ? node(n) : null; } catch (e) { return null; } },
      set(k, v) {
        const n = walk(k), p = k.slice(2);
        if (!n || !n.write) throw ro(p, label);
        let c = ''; try { c = JSON.parse(v).c || ''; } catch (e) { /* 中身なし */ }
        n.write(String(c));
      },
      del(k) { throw ro(k.slice(2), label); },
      // fs.list が使うのは「直下の名前」だけなので、prefix のディレクトリの直下だけを返す（深くは掘らない）
      keys(prefix) {
        prefix = prefix || '';
        if (KEY.startsWith(prefix) && prefix.length <= KEY.length) return prefix.endsWith('/') && KEY.slice(prefix.length).includes('/') ? [] : [KEY];
        if (!prefix.endsWith('/')) return [];
        const n = walk(prefix.slice(0, -1));
        if (!n || !n.dir) return [];
        return Object.keys(n.dir()).map(x => prefix + x);
      },
      flush: () => Promise.resolve(),
      pending: () => false
    };
  }
  const F = (fn, o) => Object.assign({ file: fn }, o || {});
  const D = (fn, o) => Object.assign({ dir: typeof fn === 'function' ? fn : () => fn }, o || {});
  const L = (fn, o) => Object.assign({ link: fn }, o || {});

  // ---------------------------------------------------------------- /proc の中身
  const sdk = () => (OS.htui && OS.htui.sdk && OS.htui.sdk.full) || 'HTUi SDK';
  const rootDrive = () => OS.store.disk ? 'hdd1' : OS.store.idb ? 'hdd2' : OS.store.ram ? 'ram0' : 'hdd0';
  function versionText() {
    return 'htmlOS version ' + OS.version + ' (' + (OS.codename || '-') + ') build ' + (OS.build || BOOT.build || '?') + ' — ' + sdk() + ' — ' + navigator.userAgent + '\n';
  }
  function cpuinfo() {
    const n = navigator.hardwareConcurrency || 1, ua = navigator.userAgentData;
    const plat = (ua && ua.platform) || navigator.platform || 'unknown';
    const brand = ua && ua.brands ? ua.brands.filter(b => !/Not.?A.?Brand/i.test(b.brand)).map(b => b.brand + ' ' + b.version).join(', ') : '';
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(['processor\t: ' + i, 'model name\t: ' + plat + ' の論理プロセッサー（ブラウザは機種名を教えてくれません）', 'cpu cores\t: ' + n,
        'flags\t\t: js wasm' + (typeof SharedArrayBuffer !== 'undefined' ? ' sab' : '') + (window.isSecureContext ? ' secure' : '') + (navigator.gpu ? ' webgpu' : '') + ('serial' in navigator ? ' webserial' : '') + (window.showDirectoryPicker ? ' fsa' : ''),
        'runtime\t\t: ' + (brand || navigator.userAgent)].join('\n'));
    }
    return out.join('\n\n') + '\n';
  }
  function meminfo() {
    const pm = performance.memory, dm = navigator.deviceMemory, u = fs.usage(), rows = [];
    if (dm) rows.push('MemTotal:      ' + kB(dm * 1024 * 1024 * 1024) + '   （ブラウザが教える目安。実際より少なめに丸められます）');
    if (pm) {
      rows.push('JSHeapLimit:   ' + kB(pm.jsHeapSizeLimit));
      rows.push('JSHeapTotal:   ' + kB(pm.totalJSHeapSize));
      rows.push('JSHeapUsed:    ' + kB(pm.usedJSHeapSize));
      rows.push('JSHeapFree:    ' + kB(pm.jsHeapSizeLimit - pm.usedJSHeapSize));
    } else rows.push('JSHeap:        （このブラウザは JS ヒープの量を教えてくれません）');
    rows.push('Storage(' + (u.drive || (OS.store.ram ? 'RAM' : 'LS')) + '):' + ' '.repeat(Math.max(1, 6 - String(u.drive || 'LS').length)) + kB(u.used) + (u.total ? ' / ' + kB(u.total).trim() : ''));
    rows.push('Processes:     ' + String(OS.proc ? OS.proc.list().length : 0).padStart(9));
    return rows.join('\n') + '\n';
  }
  function uptime() { const s = (now() - bootT()) / 1000; return s.toFixed(2) + ' ' + (s * 0.9).toFixed(2) + '\n'; }
  function loadavg() {
    const l = OS.proc ? OS.proc.list() : [], run = l.filter(p => /^R/.test(OS.proc.stat(p))).length;
    const v = Math.min(9.99, run * 0.5).toFixed(2);
    return v + ' ' + v + ' ' + v + ' ' + run + '/' + l.length + ' ' + (l.length ? l[l.length - 1].pid : 0) + '\n';
  }
  function mountsText() {
    const rows = ['/dev/' + rootDrive() + ' / ' + (OS.store.disk ? 'hdd1fs' : OS.store.idb ? 'idbfs' : OS.store.ram ? 'ramfs' : 'lsfs') + ' rw 0 0'];
    (OS.mounts ? OS.mounts() : []).forEach(m => {
      const v = m.at === '/proc' ? 'proc /proc proc ro' : m.at === '/dev' ? 'devfs /dev devfs rw' : (m.at === '/mnt/raid' ? '/dev/md0' : m.at === '/mnt/hdd1' ? '/dev/hdd1' : m.at === '/mnt/hdd3' ? '/dev/hdd3' : m.name) + ' ' + m.at + ' ' + (m.at === '/mnt/raid' ? 'mdfs' : 'folderfs') + ' rw';
      rows.push(v + ' 0 0');
    });
    return rows.join('\n') + '\n';
  }
  function filesystems() { return ['idbfs', 'lsfs', 'ramfs', 'hdd1fs', 'folderfs', 'mdfs', 'nodev\tproc', 'nodev\tdevfs'].map(x => x.includes('\t') ? x : '\t' + x).join('\n') + '\n'; }
  function cmdline() {
    return 'BOOT_IMAGE=/sys/kernel.js root=/dev/' + rootDrive() + (OS.live ? ' live' : '') + (OS.safe ? ' safe' : '') + (OS.imode ? ' imode' : '') + ' lang=ja_JP.UTF-8 init=/sys/init.js\n';
  }
  function kmsg() { return OS.journal ? OS.journal.entries({}).map(e => OS.journal.format(e)).join('\n') + '\n' : ''; }
  function services() {
    if (!OS.init) return '';
    return OS.init.units().filter(u => u.type !== 'target').map(u => { const s = OS.init.state(u.name); return u.name.padEnd(26) + ' ' + s.active.padEnd(9) + ' ' + (s.pid || '-'); }).join('\n') + '\n';
  }
  // プロセス 1 つ分のディレクトリ
  const STATE = { R: 'R (running)', S: 'S (sleeping)', T: 'T (stopped)' };
  function procDir(p) {
    const own = { owner: p.user || 'root', m: () => p.start };
    const status = () => {
      const st = OS.proc.stat(p), lines = ['Name:\t' + p.name, 'State:\t' + (STATE[st[0]] || st), 'Pid:\t' + p.pid, 'PPid:\t' + p.ppid, 'Uid:\t' + (p.user || 'root'), 'Kind:\t' + p.kind];
      if (p.unit) lines.push('Unit:\t' + p.unit + '（' + (OS.init ? OS.init.state(p.unit).active : '?') + '）');
      if (p.win) lines.push('Window:\t' + (p.win.title || '') + (p.win.app ? '（' + p.win.app + '）' : ''));
      lines.push('Started:\t' + new Date(p.start).toLocaleString('ja-JP'), 'Elapsed:\t' + OS.proc.time(p));
      return lines.join('\n') + '\n';
    };
    const kids = {
      status: F(status, { owner: own.owner }),
      cmdline: F(() => p.cmd + '\n', { owner: own.owner }),
      comm: F(() => p.name + '\n', { owner: own.owner }),
      stat: F(() => [p.pid, '(' + p.name + ')', OS.proc.stat(p)[0], p.ppid, Math.floor((p.start - bootT()) / 10)].join(' ') + '\n', { owner: own.owner })
    };
    if (p.unit) kids.unit = F(() => p.unit + '\n', { owner: own.owner });
    if (typeof p.cwd === 'string') kids.cwd = L(() => p.cwd, { owner: own.owner });
    if (typeof p.environ === 'function') kids.environ = F(() => { const v = p.environ() || {}; return Object.keys(v).map(k => k + '=' + v[k]).join('\n') + '\n'; }, { owner: own.owner, mode: 0o400 });
    return D(kids, Object.assign({ mode: 0o555 }, own));
  }
  const PROC = D(() => {
    const t = {
      version: F(versionText), cpuinfo: F(cpuinfo), meminfo: F(meminfo), uptime: F(uptime), loadavg: F(loadavg),
      mounts: F(mountsText), filesystems: F(filesystems), cmdline: F(cmdline), services: F(services),
      kmsg: F(kmsg, { mode: 0o400 }),
      self: L(() => String(OS.procSelf || 1)),
      sys: D({
        kernel: D({
          hostname: F(() => OS.hostname() + '\n'), ostype: F(() => 'htmlOS\n'),
          osrelease: F(() => OS.version + '\n'), version: F(() => '#' + (OS.build || '?') + ' ' + (OS.codename || '') + '\n')
        })
      })
    };
    if (OS.proc) OS.proc.list().forEach(p => { t[String(p.pid)] = procDir(p); });
    return t;
  });

  // ---------------------------------------------------------------- /dev の中身
  const rnd = n => { const b = new Uint8Array(n); crypto.getRandomValues(b); let s = ''; for (const x of b) s += String.fromCharCode(x); return s; };
  const fmt = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  function console_(s) {
    if (OS.journal) OS.journal.log('console', s.replace(/\n$/, ''), { prio: 5 });
    if (OS.tty1 && OS.tty1.print) { try { OS.tty1.print(s); } catch (e) { /* 表示できなくてもよい */ } }
  }
  // ドライブ（ブロックデバイス）。読むと中身ではなく説明が出る（本物の生データは読めない）
  function disks() {
    const d = {}, blk = (txt) => F(txt, { dev: 'b', mode: 0o660, group: 'disk' });
    const u = fs.usage();
    if (OS.store.idb) d.hdd2 = blk(() => 'HDD2（IndexedDB）' + (OS.store.idb && !OS.store.disk ? ' — / にマウント' : '') + '\n使用 ' + fmt(u.used) + (u.total ? ' / ' + fmt(u.total) : '') + '\n');
    else if (OS.store.ram) d.ram0 = blk(() => 'RAM ディスク — / にマウント（再読み込みで消えます）\n');
    else if (!OS.store.disk) d.hdd0 = blk(() => 'HDD0（LocalStorage）— / にマウント\n');
    if (OS.hdd && (OS.hdd.root || OS.hdd.mounted || OS.hdd.waiting)) d.hdd1 = blk(() => 'HDD1（PC のフォルダ' + (OS.hdd.name ? '「' + OS.hdd.name + '」' : '') + '）— ' + (OS.hdd.root ? '/ にマウント' : OS.hdd.mounted ? OS.hdd.at + ' にマウント' : '未接続（「' + OS.hdd.waiting + '」の許可待ち）') + '\n');
    const raid3 = () => OS.storage && OS.storage.hdd3Use && OS.storage.hdd3Use() === 'raid' && OS.raid && OS.raid.status && OS.raid.status();
    if (OS.hdd3 && (OS.hdd3.mounted || OS.hdd3.waiting || raid3())) d.hdd3 = blk(() => 'HDD3（PC のフォルダ' + (OS.hdd3.name ? '「' + OS.hdd3.name + '」' : '') + '）— ' + (OS.hdd3.mounted ? OS.hdd3.at + ' にマウント' : raid3() ? 'RAID のメンバー' : '未接続') + '\n');
    try {
      const st = OS.raid && OS.raid.status();
      if (st) d.md0 = blk(() => { const s = OS.raid.status(); return s ? 'md0 — ' + OS.raid.levels[s.level].name + ' ' + OS.raid.stateName(s.state) + '\nドライブ: ' + s.members.map(m => m.label + (m.ok ? ' [U]' : ' [_]')).join('  ') + '\n場所: ' + s.at + (s.used != null ? '  使用 ' + fmt(s.used) : '') + '\n' : 'md0 — 停止中\n'; });
    } catch (e) { /* RAID なし */ }
    return d;
  }
  // 追加のデバイス（アプリが OS.dev.add で足す。USB シリアルなど）
  const extra = new Map();
  const DEV = D(() => {
    const t = {
      null: F(() => '', { dev: 'c', mode: 0o666, write: () => {} }),
      zero: F(() => '\0'.repeat(1024), { dev: 'c', mode: 0o666, write: () => {} }),
      full: F(() => '\0'.repeat(1024), { dev: 'c', mode: 0o666, write: () => { const e = new Error('/dev/full: デバイスに空き領域がありません（ENOSPC）'); e.code = 'ENOSPC'; throw e; } }),
      random: F(() => rnd(512), { dev: 'c', mode: 0o666, write: () => {} }),
      urandom: F(() => rnd(512), { dev: 'c', mode: 0o666, write: () => {} }),
      tty: F(() => '', { dev: 'c', mode: 0o666, write: s => { const sh = OS.procSelf && OS.proc && OS.proc.get(OS.procSelf); if (sh && sh.tty) sh.tty.print(s); } }),
      console: F(() => '', { dev: 'c', mode: 0o600, write: console_ }),
      kmsg: F(kmsg, { dev: 'c', mode: 0o644, write: s => { if (OS.journal) s.split('\n').filter(Boolean).forEach(l => OS.journal.log('kmsg', l, { prio: 5 })); } })
    };
    Object.assign(t, disks());
    extra.forEach((n, name) => { t[name] = n; });
    return t;
  }, { mode: 0o755 });

  // ---------------------------------------------------------------- OS.dev（デバイスを足す・USB シリアルの名前）
  // USB の製造元 ID → 名前と、どちらの名前（ttyACM = USB をじかに話すマイコン、ttyUSB = USB-シリアル変換チップ）にするか
  const USB = {
    0x2e8a: ['Raspberry Pi（RP2040 / RP2350）', 'ACM'], 0x303a: ['Espressif（ESP32-S2/S3/C3/C6 の内蔵 USB）', 'ACM'],
    0x239a: ['Adafruit', 'ACM'], 0x1209: ['pid.codes（オープンソースのボード）', 'ACM'], 0xf055: ['MicroPython（pyboard など）', 'ACM'], 0x2341: ['Arduino', 'ACM'], 0x16c0: ['Teensy など', 'ACM'],
    0x10c4: ['Silicon Labs CP210x（USB-シリアル変換。ESP32 開発ボードに多い）', 'USB'], 0x1a86: ['WCH CH340 / CH9102（USB-シリアル変換。ESP32 開発ボードに多い）', 'USB'],
    0x0403: ['FTDI（USB-シリアル変換）', 'USB'], 0x067b: ['Prolific PL2303（USB-シリアル変換）', 'USB']
  };
  const serial = new Map(); // port → { name, info, io }
  const dev = OS.dev = {
    usb(info) {
      info = info || {};
      const v = USB[info.usbVendorId];
      const hex = n => n == null ? '????' : n.toString(16).padStart(4, '0');
      return { vendor: v ? v[0] : info.usbVendorId != null ? '不明な機器' : 'USB 以外（Bluetooth など）', kind: v ? v[1] : 'ACM', id: hex(info.usbVendorId) + ':' + hex(info.usbProductId), bridge: !!v && v[1] === 'USB' };
    },
    // 名前をつける。同じポートには同じ名前（ttyACM0, ttyACM1…）
    serialName(port) {
      const s = serial.get(port); if (s) return s.name;
      const u = dev.usb(port.getInfo ? port.getInfo() : {}), used = new Set([...serial.values()].map(x => x.name));
      let i = 0; while (used.has('tty' + u.kind + i)) i++;
      const name = 'tty' + u.kind + i;
      serial.set(port, { name: name, usb: u, io: null });
      extra.set(name, F(() => { const e = serial.get(port); return e && e.io ? e.io.read() : ''; }, { dev: 'c', mode: 0o666, owner: 'root', group: 'dialout',
        write: s => { const e = serial.get(port); if (!e || !e.io) throw new Error('/dev/' + name + ': ポートが開かれていません（hMicroPy か hSerial で接続してください）'); e.io.write(s); } }));
      return name;
    },
    // アプリがポートを開いたら io（read() → 最近受け取った文字、write(s) → 送る）をつなぐ
    attach(port, io) { const name = dev.serialName(port); serial.get(port).io = io; return name; },
    detach(port) { const s = serial.get(port); if (s) s.io = null; },
    forget(port) { const s = serial.get(port); if (!s) return; extra.delete(s.name); serial.delete(port); },
    serialPorts: () => [...serial.entries()].map(([port, s]) => ({ port: port, name: s.name, usb: s.usb, open: !!s.io })),
    // ほかのデバイスを足す: OS.dev.add('名前', { read: () => 文字列, write: s => {}, mode: 0o666 })
    add(name, o) { extra.set(name, F(o.read || (() => ''), { dev: o.block ? 'b' : 'c', mode: o.mode == null ? 0o666 : o.mode, write: o.write, owner: o.owner, group: o.group })); },
    remove(name) { extra.delete(name); }
  };

  OS.mountStore('/proc', vstore('/proc', 'proc', PROC));
  OS.mountStore('/dev', vstore('/dev', 'devfs', DEV));
  if (OS.klog) OS.klog('proc を /proc に、devfs を /dev にマウントしました');

  // ---------------------------------------------------------------- udevd.service: USB シリアルの抜き差しを見張って /dev に出す
  if (OS.init && OS.init.register) OS.init.register({
    name: 'udevd.service', desc: 'デバイスの見張り（USB シリアルを /dev に出す）', wantedBy: 'basic.target', restart: 'on-failure',
    start(ctx) {
      if (!('serial' in navigator)) { ctx.log('このブラウザは Web Serial に対応していないので、USB シリアルは見張りません'); return () => {}; }
      const S = navigator.serial;
      const add = (p, how) => { const n = dev.serialName(p), u = dev.usb(p.getInfo()); ctx.log('/dev/' + n + ': ' + u.vendor + ' [' + u.id + ']' + (how ? ' がつながりました' : '')); };
      const on = e => add(e.target || e.port, true);
      const off = e => { const p = e.target || e.port, s = serial.get(p); if (s) { ctx.log('/dev/' + s.name + ' が外れました'); dev.forget(p); } };
      S.addEventListener('connect', on); S.addEventListener('disconnect', off);
      S.getPorts().then(l => l.forEach(p => add(p, false))).catch(() => {});
      return () => { S.removeEventListener('connect', on); S.removeEventListener('disconnect', off); };
    }
  });
})();
