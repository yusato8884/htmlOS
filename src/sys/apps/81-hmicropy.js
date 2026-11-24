/* hMicroPy（7.2 から）— MicroPython のボードを Web Serial でつないで開発するアプリ
   ・対応: MicroPython が入ったボードならだいたい何でも。RP2040 / RP2350（Raspberry Pi Pico・Pico 2 など）、
     ESP32（CP210x・CH340 などの USB-シリアル変換チップ経由）、ESP32-S2/S3/C3/C6（内蔵 USB）、pyboard など
   ・左: ボードの中のファイル（開く・hFS へ保存・削除・名前変更・新しいフォルダ）、上: エディター、下: REPL（キーを打つとそのまま送る）
   ・実行（F5）: エディターの中身をボードの RAM で実行（ファイルには書かない）。停止（Ctrl+C）
   ・ボードに保存（Ctrl+S）: エディターの中身をボードのファイルに書く（main.py にすると電源を入れたときに動く）
   ・ファイルのやりとりや実行には MicroPython の raw REPL（Ctrl+A）を使う（mpremote・Thonny と同じ方法）
   ・つないでいる間は /dev/ttyACM0（ESP32 の変換チップなら /dev/ttyUSB0）としても読み書きできる（echo 'print(1)' > /dev/ttyACM0） */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const enc = new TextEncoder();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pyStr = s => JSON.stringify(String(s)); // Python の文字列リテラル（JSON の書き方は Python でもそのまま通る）
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const unhex = s => { const out = new Uint8Array(s.length >> 1); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16); return out; };
  const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  const SAMPLE = '# hMicroPy へようこそ。F5 で実行、Ctrl+S でボードに保存します\n# Pico / Pico 2 の内蔵 LED を点滅させる例（ESP32 は Pin(2) などに変えてください）\nfrom machine import Pin\nimport time\n\nled = Pin("LED", Pin.OUT)\nfor i in range(10):\n    led.toggle()\n    print("toggle", i)\n    time.sleep(0.25)\n';

  OS.registerApp({
    id: 'hmicropy', name: 'hMicroPy', icon: 'chip', color: '#2f6fb3', desc: 'MicroPython 開発（RP2040・RP2350・ESP32 など）',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hMicroPy', icon: 'chip', w: 980, h: 620, app: 'hmicropy' });
      const supported = 'serial' in navigator;
      // ---- 状態
      let port = null, reader = null, writer = null, usb = null, devName = null;
      let mode = 'term';            // term: 受け取った文字を REPL に出す / raw: raw REPL の受け取り（rx にためる）/ quiet: 次の >>> まで捨てる
      let rx = '', waiters = [], stream = null, busy = false, running = false;
      let term = '', pendingEsc = '', board = null, boardDir = '/', files = [], fsInfo = null;
      let file = null, dirty = false; // file: { where: 'board' | 'hfs', path }
      let reconnecting = null;

      // ---- 画面
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const bConn = h('button', { class: 'btn small primary', type: 'button', onclick: () => (port ? disconnect() : connect()) }, '接続');
      const baud = h('select', { class: 'sel', id: 'mp-baud-' + win.pid, title: '通信速度。USB-シリアル変換チップのボード（ESP32 など）で使います。内蔵 USB のボードは何でも動きます', 'aria-label': '通信速度' },
        [9600, 57600, 115200, 230400, 460800, 921600].map(b => h('option', { value: String(b), selected: b === 115200 }, b + ' bps')));
      const bRun = tb('play', '実行', () => run(), 'エディターの中身をボードで実行（F5）。ファイルには保存しません');
      const bStop = tb('stop', '停止', () => stop(), '実行中のプログラムを止める（Ctrl+C）');
      const bSave = tb('save', 'ボードに保存', () => saveBoard(), 'エディターの中身をボードのファイルに保存（Ctrl+S）');
      const bReset = tb('reload', 'リセット', () => resetMenu(), 'ボードの再起動');
      const ta = h('textarea', { class: 'he-text mp-ed', spellcheck: 'false', id: 'mp-ed-' + win.pid, 'aria-label': 'MicroPython のプログラム' });
      const gut = h('div', { class: 'he-gutter', 'aria-hidden': 'true' }, '1');
      const out = h('pre', { class: 'hs-out mp-term', tabindex: '0', 'aria-label': 'REPL。クリックしてキーを打つとボードに送ります' });
      const fileList = h('div', { class: 'mp-files', role: 'listbox', 'aria-label': 'ボードのファイル' });
      const dirLabel = h('div', { class: 'mp-dir' }, '/');
      const fsLabel = h('div', { class: 'mp-free' });
      const stBoard = h('span', { class: 'grow' }, supported ? '未接続' : 'Web Serial 非対応'), stFile = h('span'), stPos = h('span');
      win.body.append(
        h('div', { class: 'toolbar' }, bConn, baud, h('span', { class: 'sep' }), bRun, bStop, bSave, h('span', { class: 'sep' }),
          tb('file', '新規', newDoc, '新しいプログラム'), tb('folder', '開く', openHfs, 'hFS（htmlOS のファイル）から開く'), tb('download', 'hFS に保存', saveHfs, 'エディターの中身を hFS（htmlOS のファイル）に保存'),
          h('span', { class: 'sep' }), bReset, tb(null, 'クリア', () => { term = ''; paint(); }, 'REPL の表示を消す')),
        h('div', { class: 'mp-main' },
          h('div', { class: 'mp-side' },
            h('div', { class: 'mp-side-bar' }, h('b', null, 'ボード'), h('span', { class: 'grow' }),
              h('button', { class: 'tbtn', type: 'button', title: '上のフォルダへ', 'aria-label': '上のフォルダへ', onclick: () => { if (boardDir !== '/') { boardDir = path.dir(boardDir); refresh(); } } }, OS.icon('back', 15)),
              h('button', { class: 'tbtn', type: 'button', title: '一覧を更新', 'aria-label': '一覧を更新', onclick: () => refresh() }, OS.icon('reload', 15)),
              h('button', { class: 'tbtn', type: 'button', title: 'hFS のファイルをボードへ送る', 'aria-label': 'hFS のファイルをボードへ送る', onclick: () => uploadHfs() }, OS.icon('plus', 15))),
            dirLabel, fileList, fsLabel),
          h('div', { class: 'mp-right' },
            h('div', { class: 'he-wrap mp-edwrap' }, gut, ta),
            h('div', { class: 'mp-split', title: '上下の大きさを変える' }),
            out)),
        h('div', { class: 'statusbar' }, stBoard, stFile, stPos));
      const right = win.body.querySelector('.mp-right'), edwrap = win.body.querySelector('.mp-edwrap');

      // ---- エディター
      let nLines = 0;
      function edRefresh() {
        const n = ta.value.split('\n').length;
        if (n !== nLines) { nLines = n; const a = []; for (let i = 1; i <= n; i++) a.push(i); gut.textContent = a.join('\n'); }
        gut.scrollTop = ta.scrollTop;
        const before = ta.value.slice(0, ta.selectionStart).split('\n');
        stPos.textContent = '行 ' + before.length + '、列 ' + (before[before.length - 1].length + 1);
        stFile.textContent = (file ? (file.where === 'board' ? 'ボード:' : 'hFS:') + file.path : '無題') + (dirty ? ' ・ 未保存' : '');
        win.setTitle((dirty ? '● ' : '') + (file ? path.base(file.path) : '無題') + ' — hMicroPy');
      }
      const setDirty = d => { dirty = d; edRefresh(); };
      ta.addEventListener('input', () => setDirty(true));
      ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
      ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, edRefresh));
      ta.addEventListener('keydown', e => {
        if (e.isComposing) return;
        const s = ta.selectionStart, v = ta.value;
        // Tab = 空白 4 つ（Shift+Tab で戻す）、Enter は前の行の字下げを引き継ぎ、: で終わる行のあとは 1 段深くする
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          if (e.shiftKey) { const ls = v.lastIndexOf('\n', s - 1) + 1, m = /^ {1,4}/.exec(v.slice(ls)); if (m) { ta.setRangeText('', ls, ls + m[0].length, 'end'); ta.selectionStart = ta.selectionEnd = Math.max(ls, s - m[0].length); setDirty(true); } return; }
          ta.setRangeText('    ', s, ta.selectionEnd, 'end'); setDirty(true);
        } else if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s), ind = /^[ \t]*/.exec(line)[0] + (/:\s*(#.*)?$/.test(line) ? '    ' : '');
          e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); setDirty(true);
        }
      });
      win.el.addEventListener('keydown', e => {
        if (e.key === 'F5') { e.preventDefault(); run(); return; }
        if (!(e.ctrlKey || e.metaKey) || e.target === out) return;
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); if (e.shiftKey) saveHfs(); else saveBoard(); }
        else if (k === 'o') { e.preventDefault(); openHfs(); }
      });
      // 上下の仕切りをドラッグ
      win.body.querySelector('.mp-split').addEventListener('pointerdown', e => {
        e.preventDefault(); const r = right.getBoundingClientRect();
        const mv = ev => { const f = Math.min(0.85, Math.max(0.15, (ev.clientY - r.top) / r.height)); edwrap.style.flex = f + ' 1 0'; out.style.flex = (1 - f) + ' 1 0'; };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });

      // ---- REPL の表示
      function paint() { const stick = out.scrollTop + out.clientHeight >= out.scrollHeight - 30; out.textContent = term; if (stick) out.scrollTop = out.scrollHeight; }
      function note(s) { term += (term && !term.endsWith('\n') ? '\n' : '') + '--- ' + s + ' ---\n'; paint(); }
      function show(chunk) {
        let s = pendingEsc + chunk; pendingEsc = '';
        const cut = s.lastIndexOf('\x1b');
        if (cut >= 0 && !/^\x1b\[[0-9;?]*[A-Za-z]/.test(s.slice(cut)) && s.length - cut < 12) { pendingEsc = s.slice(cut); s = s.slice(0, cut); }
        s = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
        for (const ch of s) {
          if (ch === '\r' || ch === '\x1b' || ch === '\x07' || ch === '\x04') continue;
          if (ch === '\b') { if (term && !term.endsWith('\n')) term = term.slice(0, -1); continue; }
          term += ch;
        }
        if (term.length > 150000) term = term.slice(-120000);
        // 起動メッセージからボードの名前を拾う（MicroPython v1.24.1 on 2024-11-29; Raspberry Pi Pico with RP2040）
        const m = /MicroPython (v[^\s;]+)[^;\n]*; ([^\n]+?)\s*\n/.exec(term.slice(-400));
        if (m && (!board || board.name !== m[2])) { board = { ver: m[1], name: m[2] }; status(); }
        paint();
      }
      // 受け取ったもの
      let recent = ''; // /dev/ttyACM0 を読んだときに返す
      function feed(chunk) {
        recent = (recent + chunk).slice(-8192);
        if (mode === 'term') { show(chunk); return; }
        if (mode === 'quiet') {
          rx += chunk; const i = rx.indexOf('>>> ');
          const m = /MicroPython (v[^\s;]+)[^;\n]*; ([^\r\n]+)/.exec(rx); if (m) { board = { ver: m[1], name: m[2].trim() }; status(); }
          if (i >= 0) { mode = 'term'; let rest = rx.slice(i); rx = ''; if (term.endsWith('>>> ')) rest = rest.slice(4); if (rest) show(rest); }
          else if (rx.length > 4000) rx = rx.slice(-200);
          return;
        }
        rx += chunk;
        if (stream) stream();
        waiters = waiters.filter(w => !w());
      }
      // rx に want が来るまで待つ（来たらそこまでを取り除いて返す）
      function waitFor(want, ms) {
        return new Promise((res, rej) => {
          let done = false;
          const check = () => {
            const i = want instanceof RegExp ? rx.search(want) : rx.indexOf(want);
            if (i < 0) return false;
            const len = want instanceof RegExp ? rx.match(want)[0].length : want.length;
            const got = rx.slice(0, i); rx = rx.slice(i + len); done = true; clearTimeout(t); res(got); return true;
          };
          const t = setTimeout(() => { if (done) return; waiters = waiters.filter(w => w !== check); rej(new Error('ボードから返事がありません（' + Math.round(ms / 1000) + ' 秒待ちました）')); }, ms);
          if (!check()) waiters.push(check);
        });
      }

      // ---- シリアルポート
      function status() {
        if (!port) { stBoard.textContent = supported ? '未接続' : 'Web Serial 非対応'; return; }
        stBoard.textContent = (devName ? '/dev/' + devName + ' ・ ' : '') + (board ? board.name + '（MicroPython ' + board.ver + '）' : usb ? usb.vendor : '接続中') + (running ? ' ・ 実行中' : busy ? ' ・ 通信中…' : '');
        bRun.disabled = !port || busy; bStop.disabled = !port; bSave.disabled = !port || busy; bReset.disabled = !port || busy;
      }
      async function connect(p0) {
        try {
          const p = p0 || await navigator.serial.requestPort();
          await p.open({ baudRate: Number(baud.value) });
          port = p; writer = p.writable.getWriter(); usb = OS.dev ? OS.dev.usb(p.getInfo()) : null;
          devName = OS.dev ? OS.dev.attach(p, { read: () => recent, write: s => send(s) }) : null;
          bConn.textContent = '切断'; bConn.classList.remove('primary'); baud.disabled = true;
          note('接続しました' + (usb ? '（' + usb.vendor + ' [' + usb.id + ']）' : ''));
          readLoop(p); status();
          // REPL を出して（Ctrl+C を 2 回）、ボードの情報とファイルの一覧を読む
          await sleep(150);
          if (await info()) await refresh();
        } catch (e) {
          if (e && e.name === 'NotFoundError') return; // ポートの選択をキャンセルした
          if (!port) { ui.alert('接続できませんでした。\n' + (e && e.message || e) + '\n\nほかのアプリ（Thonny・hSerial など）がそのポートを使っていないか確かめてください。'); return; }
          note(e.message || String(e));
        }
      }
      async function readLoop(p) {
        const dec = new TextDecoder();
        try {
          while (port === p && p.readable) {
            reader = p.readable.getReader();
            try { for (;;) { const r = await reader.read(); if (r.done) break; feed(dec.decode(r.value, { stream: true })); } }
            finally { try { reader.releaseLock(); } catch (e) { /* 解放済み */ } reader = null; }
            if (port !== p) break;
          }
        } catch (e) {
          if (port !== p) return;
          const info0 = p.getInfo ? p.getInfo() : {};
          cleanup(); note('切断されました（' + (e && e.message || e) + '）');
          if (reconnecting) waitReconnect(info0);
        }
      }
      // ボードが再起動して USB がつなぎ直されたら（内蔵 USB のボード）、同じ機器をもう一度開く
      function waitReconnect(info0) {
        if (!supported) return;
        note('ボードが戻ってくるのを待っています…');
        const until = Date.now() + 12000;
        const tick = async () => {
          if (port || !win.el.isConnected) return;
          const l = await navigator.serial.getPorts().catch(() => []);
          const p = l.find(x => { const i = x.getInfo(); return i.usbVendorId === info0.usbVendorId && i.usbProductId === info0.usbProductId; });
          if (p) { reconnecting = null; await sleep(400); return connect(p); }
          if (Date.now() < until) setTimeout(tick, 600); else { reconnecting = null; note('戻ってきませんでした。「接続」を押してください'); }
        };
        setTimeout(tick, 800);
      }
      function cleanup() {
        if (port && OS.dev) OS.dev.detach(port);
        port = null; writer = null; busy = false; running = false; stream = null; mode = 'term'; rx = ''; waiters = [];
        bConn.textContent = '接続'; bConn.classList.add('primary'); baud.disabled = false;
        files = []; fsInfo = null; renderFiles(); status();
      }
      async function disconnect(quiet) {
        const p = port; if (!p) return;
        if (OS.dev) OS.dev.detach(p);
        port = null;
        try { if (reader) await reader.cancel(); } catch (e) { /* 無視 */ }
        try { if (writer) writer.releaseLock(); } catch (e) { /* 無視 */ }
        try { await p.close(); } catch (e) { /* 無視 */ }
        if (!quiet) { cleanup(); note('切断しました'); }
      }
      function send(s) {
        if (!port || !writer) { ui.toast('まだ接続していません'); return false; }
        writer.write(enc.encode(s)).catch(e => note('送信に失敗しました（' + e.message + '）'));
        return true;
      }
      // 大きいものは 256 バイトずつ、少し間をあけて送る（ボードの受け取り口があふれないように）
      async function sendSlow(s) {
        const b = enc.encode(s);
        for (let i = 0; i < b.length; i += 256) { if (!writer) throw new Error('切断されました'); await writer.write(b.slice(i, i + 256)); if (b.length > 256) await sleep(8); }
      }

      // ---- raw REPL
      async function enterRaw() {
        mode = 'raw'; rx = '';
        await sendSlow('\r\x03'); await sleep(60); await sendSlow('\x03'); await sleep(120); rx = '';
        await sendSlow('\x01');
        try { await waitFor('raw REPL; CTRL-B to exit\r\n>', 1500); }
        catch (e) { // プログラムが Ctrl+C を受け付けるまで時間がかかることがある。もう一度
          await sendSlow('\x03\x03'); await sleep(300); rx = ''; await sendSlow('\x01');
          await waitFor('raw REPL; CTRL-B to exit\r\n>', 2500).catch(() => { throw new Error('ボードが raw REPL に入りません。MicroPython が入っているか、通信速度が合っているか確かめてください'); });
        }
      }
      async function exitRaw() { if (!port) return; mode = 'quiet'; rx = ''; await sendSlow('\x02').catch(() => {}); setTimeout(() => { if (mode === 'quiet') { mode = 'term'; rx = ''; } }, 1500); }
      // コードを実行して { out, err } を返す（raw REPL に入っていること）
      async function exec(code, ms) {
        rx = '';
        await sendSlow(code); await sendSlow('\x04');
        await waitFor('OK', 3000).catch(() => { throw new Error('ボードがコードを受け取りませんでした'); });
        const o = await waitFor('\x04', ms || 10000), e = await waitFor('\x04', 3000);
        await waitFor('>', 2000).catch(() => {});
        return { out: o.replace(/\r/g, ''), err: e.replace(/\r/g, '') };
      }
      async function execOk(code, ms) { const r = await exec(code, ms); if (r.err.trim()) { const l = r.err.trim().split('\n'); throw new Error(l[l.length - 1]); } return r.out; }
      // 通信の操作をひとつずつ（raw REPL に入って、終わったら戻る）
      async function op(fn) {
        if (!port) { ui.toast('まだ接続していません'); return; }
        if (busy) { ui.toast('いま別の操作をしています'); return; }
        busy = true; status();
        try { await enterRaw(); await fn(); return true; }
        catch (e) { if (port) ui.alert(e.message || String(e)); return false; }
        finally { busy = false; await exitRaw(); status(); }
      }

      async function info() {
        return op(async () => {
          const o = await execOk('import sys, os\nu = os.uname()\nprint(u.machine)\nprint(u.release)\ntry:\n s = os.statvfs("/")\n print(s[0] * s[2], s[0] * s[3])\nexcept Exception:\n print(0, 0)\n');
          const l = o.trim().split('\n');
          board = { name: l[0] || '?', ver: 'v' + (l[1] || '?') };
          const f = (l[2] || '0 0').split(' ').map(Number); fsInfo = { total: f[0], free: f[1] };
        });
      }
      const LIST = 'import os\ndef _l(d):\n for n in sorted(os.listdir(d)):\n  try:\n   s = os.stat((d.rstrip("/") + "/" + n) if d != "/" else "/" + n)\n   print("%s\\t%d\\t%d" % (n, 1 if s[0] & 0x4000 else 0, s[6]))\n  except Exception:\n   print("%s\\t0\\t0" % n)\n';
      async function refresh() {
        if (!port) { renderFiles(); return; }
        await op(async () => {
          let o;
          try { o = await execOk(LIST + '_l(' + pyStr(boardDir) + ')\n'); }
          catch (e) { if (boardDir !== '/') { boardDir = '/'; o = await execOk(LIST + '_l("/")\n'); } else throw e; }
          files = o.split('\n').filter(Boolean).map(l => { const p = l.split('\t'); return { name: p[0], dir: p[1] === '1', size: Number(p[2]) || 0 }; })
            .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
          try { const f = (await execOk('s = os.statvfs("/")\nprint(s[0] * s[2], s[0] * s[3])\n')).trim().split(' ').map(Number); fsInfo = { total: f[0], free: f[1] }; } catch (e) { /* statvfs がないボード */ }
        });
        renderFiles();
      }
      const bpath = n => (boardDir === '/' ? '' : boardDir) + '/' + n;
      function renderFiles() {
        dirLabel.textContent = boardDir;
        fileList.textContent = '';
        if (!port) fileList.append(h('div', { class: 'mp-empty' }, supported ? '「接続」を押してボードを選んでください' : 'このブラウザは Web Serial に対応していません'));
        else if (!files.length) fileList.append(h('div', { class: 'mp-empty' }, '（空です）'));
        files.forEach(f => {
          const p = bpath(f.name);
          const row = h('button', { class: 'mp-file' + (file && file.where === 'board' && file.path === p ? ' on' : ''), type: 'button', role: 'option', title: p,
            ondblclick: () => f.dir ? (boardDir = p, refresh()) : openBoard(p),
            onclick: e => { if (e.detail === 1 && OS.uiMode && OS.uiMode !== 'desktop') { if (f.dir) { boardDir = p; refresh(); } else openBoard(p); } },
            oncontextmenu: e => { e.preventDefault(); fileMenu(e.clientX, e.clientY, f, p); } },
          OS.icon(f.dir ? 'folder' : /\.py$/.test(f.name) ? 'script' : 'file', 15), h('span', { class: 'mp-fn' }, f.name), h('small', null, f.dir ? '' : fmt(f.size)));
          fileList.append(row);
        });
        fsLabel.textContent = fsInfo && fsInfo.total ? '空き ' + fmt(fsInfo.free) + ' / ' + fmt(fsInfo.total) : '';
      }
      fileList.addEventListener('contextmenu', e => {
        if (e.target !== fileList || !port) return; e.preventDefault();
        OS.htui.menuAt(e.clientX, e.clientY, [{ label: '新しいファイル…', icon: 'file', act: newBoardFile }, { label: '新しいフォルダ…', icon: 'folder', act: mkdirBoard }, { label: 'hFS のファイルを送る…', icon: 'plus', act: uploadHfs }, { label: '更新', icon: 'reload', act: () => refresh() }]);
      });
      function fileMenu(x, y, f, p) {
        const items = f.dir ? [{ label: '開く', icon: 'folder', act: () => { boardDir = p; refresh(); } }]
          : [{ label: 'エディターで開く', icon: 'edit', act: () => openBoard(p) }, { label: 'このファイルを実行', icon: 'play', act: () => runFile(p) }, { label: 'hFS にダウンロード…', icon: 'download', act: () => download(p) }];
        items.push({ label: '名前を変更…', icon: 'text', act: () => renameBoard(f, p) }, { label: '削除…', icon: 'trash', act: () => removeBoard(f, p) });
        OS.htui.menuAt(x, y, items);
      }

      // ---- ボードのファイル
      const READ = 'try:\n import binascii as _B\nexcept ImportError:\n import ubinascii as _B\n';
      async function readBoard(p) {
        const o = await execOk(READ + 'with open(' + pyStr(p) + ', "rb") as _f:\n while True:\n  _b = _f.read(256)\n  if not _b:\n   break\n  print(_B.hexlify(_b).decode())\n', 30000);
        return unhex(o.replace(/\s+/g, ''));
      }
      async function writeBoard(p, bytes, progress) {
        await execOk(READ + '_f = open(' + pyStr(p) + ', "wb")\n_w = lambda h: _f.write(_B.unhexlify(h))\n');
        try { for (let i = 0; i < bytes.length; i += 512) { await execOk('_w("' + hex(bytes.slice(i, i + 512)) + '")\n'); if (progress) progress(Math.min(bytes.length, i + 512), bytes.length); } }
        finally { await exec('_f.close()\n').catch(() => {}); }
      }
      async function confirmDiscard() {
        if (!dirty) return true;
        return ui.confirm((file ? path.base(file.path) : '無題') + ' への変更は保存されていません。破棄しますか?', { ok: '破棄', danger: true });
      }
      async function openBoard(p) {
        if (!(await confirmDiscard())) return;
        await op(async () => {
          const b = await readBoard(p);
          ta.value = new TextDecoder().decode(b); file = { where: 'board', path: p }; nLines = 0; setDirty(false); renderFiles();
        });
      }
      async function saveBoard() {
        if (!port) { ui.toast('ボードにつないでから保存してください（hFS に保存するなら Ctrl+Shift+S）'); return; }
        let p = file && file.where === 'board' ? file.path : null;
        if (!p) {
          const n = await ui.prompt('ボードに保存するファイル名（main.py にすると、電源を入れたときに自動で動きます）', file ? path.base(file.path) : 'main.py', { title: 'ボードに保存' });
          if (!n) return;
          p = n.startsWith('/') ? n : bpath(n);
          if (files.some(f => bpath(f.name) === p) && !(await ui.confirm(p + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return;
        }
        let ok = false;
        await op(async () => { await writeBoard(p, enc.encode(ta.value), (a, b) => { stBoard.textContent = '保存中… ' + Math.round(a / b * 100) + '%'; }); ok = true; });
        if (ok) { file = { where: 'board', path: p }; setDirty(false); ui.toast('ボードに保存しました: ' + p); refresh(); }
      }
      async function download(p) {
        const dest = await ui.pickFile({ mode: 'save', dir: home + '/Documents', name: path.base(p) });
        if (!dest) return;
        await op(async () => {
          const b = await readBoard(p);
          let text = null; try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { /* バイナリ */ }
          if (text != null && !/[\0-\x08\x0e-\x1f]/.test(text)) fsx.write(dest, text);
          else { let s = ''; b.forEach(x => { s += String.fromCharCode(x); }); fsx.write(dest, 'data:application/octet-stream;base64,' + btoa(s), { bin: true }); }
          ui.toast('hFS に保存しました: ' + dest);
        });
      }
      // hFS のファイル → バイト列（data: URL のバイナリにも対応）
      function hfsBytes(p) {
        const st = OS.fs.stat(p);
        if (st && st.b) { const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(fsx.read(p)); if (m) { if (m[1]) { const s = atob(m[2]); return Uint8Array.from(s, c => c.charCodeAt(0)); } return enc.encode(decodeURIComponent(m[2])); } }
        return enc.encode(fsx.read(p));
      }
      async function uploadHfs() {
        if (!port) { ui.toast('まだ接続していません'); return; }
        const src = await ui.pickFile({ mode: 'open', dir: home + '/Documents' });
        if (!src) return;
        let bytes; try { bytes = hfsBytes(src); } catch (e) { ui.alert(e.message); return; }
        const p = bpath(path.base(src));
        if (files.some(f => bpath(f.name) === p) && !(await ui.confirm(p + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return;
        await op(async () => { await writeBoard(p, bytes, (a, b) => { stBoard.textContent = '送信中… ' + Math.round(a / b * 100) + '%'; }); ui.toast('ボードへ送りました: ' + p + '（' + fmt(bytes.length) + '）'); });
        refresh();
      }
      async function newBoardFile() {
        const n = await ui.prompt('新しいファイルの名前', 'new.py', { title: '新しいファイル' }); if (!n) return;
        const p = bpath(n);
        await op(async () => { await writeBoard(p, new Uint8Array(0)); });
        await refresh(); openBoard(p);
      }
      async function mkdirBoard() {
        const n = await ui.prompt('新しいフォルダの名前', 'lib', { title: '新しいフォルダ' }); if (!n) return;
        await op(() => execOk('import os\nos.mkdir(' + pyStr(bpath(n)) + ')\n')); refresh();
      }
      async function renameBoard(f, p) {
        const n = await ui.prompt('新しい名前', f.name, { title: '名前を変更' }); if (!n || n === f.name) return;
        const q = bpath(n);
        await op(() => execOk('import os\nos.rename(' + pyStr(p) + ', ' + pyStr(q) + ')\n'));
        if (file && file.where === 'board' && file.path === p) { file.path = q; edRefresh(); }
        refresh();
      }
      async function removeBoard(f, p) {
        if (!(await ui.confirm(p + (f.dir ? ' フォルダ（空のときだけ消せます）' : '') + ' をボードから削除しますか? 元には戻せません。', { ok: '削除', danger: true }))) return;
        await op(() => execOk('import os\nos.' + (f.dir ? 'rmdir' : 'remove') + '(' + pyStr(p) + ')\n'));
        if (file && file.where === 'board' && file.path === p) { file = null; edRefresh(); }
        refresh();
      }

      // ---- 実行（出力は REPL にそのまま流す。input() には REPL で打った文字が届く）
      async function runCode(code, label) {
        if (!port) { ui.toast('まだ接続していません'); return; }
        if (busy) { ui.toast('いま別の操作をしています'); return; }
        busy = true; running = true; status();
        try {
          await enterRaw();
          note('▶ ' + label + ' を実行します（停止: Ctrl+C か「停止」）');
          rx = '';
          await sendSlow(code); await sendSlow('\x04');
          await waitFor('OK', 4000).catch(() => { throw new Error('ボードがコードを受け取りませんでした'); });
          // OK のあと: 標準出力 \x04 エラー出力 \x04 >
          await new Promise(res => {
            let phase = 0;
            stream = () => {
              let s = rx; rx = '';
              while (s && phase < 2) {
                const i = s.indexOf('\x04');
                if (i < 0) { show(s); s = ''; break; }
                show(s.slice(0, i)); s = s.slice(i + 1); phase++;
              }
              if (phase >= 2) { stream = null; res(); }
            };
            stream();
          });
          note('■ 終了しました');
        } catch (e) { note(e.message || String(e)); }
        finally { stream = null; running = false; busy = false; await exitRaw(); status(); }
      }
      function run() { if (!ta.value.trim()) { ui.toast('エディターが空です'); return; } runCode(ta.value, file ? path.base(file.path) : 'エディターの中身'); }
      function runFile(p) { runCode('exec(open(' + pyStr(p) + ').read(), {"__name__": "__main__"})\n', p); }
      function stop() { if (!port) return; send('\x03'); if (!running) setTimeout(() => send('\x03'), 50); }

      // ---- リセット
      function resetMenu() {
        const r = bReset.getBoundingClientRect();
        OS.htui.menuAt(r.left, r.bottom + 2, [
          { label: 'ソフトリセット（Ctrl+D。main.py をもう一度動かす）', icon: 'reload', act: softReset },
          { label: 'ハードリセット（ボードを再起動）', icon: 'power', act: hardReset }
        ]);
      }
      async function softReset() { if (!port || busy) return; mode = 'term'; send('\x03'); await sleep(80); send('\x04'); }
      async function hardReset() {
        if (!port || busy) return;
        if (usb && usb.bridge && port.setSignals) {
          // USB-シリアル変換チップ（ESP32 開発ボードなど）: RTS で EN を下げて離す（esptool と同じ。DTR は上げない = 書き込みモードに入らない）
          note('ハードリセット（RTS）');
          try {
            await port.setSignals({ dataTerminalReady: false, requestToSend: true }); await sleep(120);
            await port.setSignals({ requestToSend: false }); await sleep(60);
            await port.setSignals({ dataTerminalReady: true, requestToSend: true }).catch(() => {});
          } catch (e) { note('信号線を動かせませんでした（' + e.message + '）'); }
          return;
        }
        // 内蔵 USB のボード（RP2040・RP2350・ESP32-S3 など）: machine.reset()。USB が一度切れるので、戻ってきたらつなぎ直す
        note('ハードリセット（machine.reset()）');
        reconnecting = true; mode = 'term';
        send('\x03\x03'); await sleep(100); send('import machine; machine.reset()\r');
      }

      // ---- エディターのファイル（hFS）
      async function newDoc() { if (!(await confirmDiscard())) return; ta.value = ''; file = null; nLines = 0; setDirty(false); renderFiles(); ta.focus(); }
      async function openHfs() {
        if (!(await confirmDiscard())) return;
        const p = await ui.pickFile({ mode: 'open', dir: file && file.where === 'hfs' ? path.dir(file.path) : home + '/Documents' });
        if (!p) return;
        try { ta.value = fsx.read(p); file = { where: 'hfs', path: p }; nLines = 0; setDirty(false); renderFiles(); } catch (e) { ui.alert(e.message); }
      }
      async function saveHfs() {
        const p = await ui.pickFile({ mode: 'save', dir: file && file.where === 'hfs' ? path.dir(file.path) : home + '/Documents', name: file ? path.base(file.path) : 'main.py' });
        if (!p) return;
        if (!(file && file.where === 'hfs' && file.path === p) && fsx.exists(p) && !(await ui.confirm(path.base(p) + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return;
        try { fsx.write(p, ta.value); file = { where: 'hfs', path: p }; setDirty(false); renderFiles(); ui.toast('hFS に保存しました: ' + p); } catch (e) { ui.alert(e.message); }
      }

      // ---- REPL のキー
      const SPECIAL = { Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D', Delete: '\x1b[3~', Home: '\x1b[H', End: '\x1b[F' };
      out.addEventListener('keydown', e => {
        if (!port || e.isComposing || e.metaKey || e.altKey || e.key === 'F5') return;
        if (busy && !running) { e.preventDefault(); return; } // ファイルのやりとり中は打たせない
        let s = null;
        if (e.ctrlKey) { if (/^[a-z]$/i.test(e.key)) s = String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64); }
        else if (SPECIAL[e.key]) s = SPECIAL[e.key];
        else if (e.key.length === 1) s = e.key;
        if (s == null) return;
        e.preventDefault(); send(s);
      });
      out.addEventListener('paste', e => { if (!port || (busy && !running)) return; e.preventDefault(); send((e.clipboardData.getData('text') || '').replace(/\r?\n/g, '\r')); });

      // ---- ハイバーネート（エディターの中身とファイル名を覚える。ポートはつなぎ直しが必要）
      win.onHibernate = () => ({ code: ta.value, file: file, dirty: dirty, term: term.slice(-4000) });
      win.onDispose = () => { disconnect(true); };
      const rs = arg && arg.resume;
      if (rs) { ta.value = rs.code || ''; file = rs.file || null; dirty = !!rs.dirty; term = rs.term || ''; }
      else if (arg && typeof arg === 'string' && fsx.isFile(arg)) { try { ta.value = fsx.read(arg); file = { where: 'hfs', path: arg }; } catch (e) { /* 読めない */ } }
      else if (arg && arg.path && fsx.isFile(arg.path)) { try { ta.value = fsx.read(arg.path); file = { where: 'hfs', path: arg.path }; } catch (e) { /* 読めない */ } }
      else ta.value = SAMPLE;
      if (!supported) {
        term += 'このブラウザは Web Serial に対応していないため、ボードにはつなげません。\nChrome / Edge / Chromium（パソコン版）で開いてください。エディターと hFS への保存は使えます。\n';
        bConn.disabled = true;
      } else if (!rs) {
        term += '「接続」を押して、MicroPython の入ったボードのポートを選んでください。\n' +
          '・RP2040 / RP2350（Pico・Pico 2 など）: 「Board CDC」や「USB シリアル デバイス」\n' +
          '・ESP32: 「CP210x」「CH340」「USB JTAG/serial debug unit」など（通信速度は 115200 bps）\n' +
          'ボードのファイルは左に出ます。ダブルクリックで開き、右クリックでほかの操作ができます。\n';
      }
      paint(); edRefresh(); renderFiles(); status();
      return win;
    }
  });
})();
