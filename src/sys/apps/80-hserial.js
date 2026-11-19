/* hSerial — シリアルモニター（Web Serial API）。USB でつないだマイコンなどと文字をやりとりする
   黒い画面をクリックしてからキーを打つと、打った文字がそのまま送られる（REPL 向け） */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  OS.registerApp({
    id: 'hserial', name: 'hSerial', icon: 'plug', color: '#3a944a', desc: 'シリアルモニター',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hSerial', icon: 'plug', w: 680, h: 440, app: 'hserial' });
      let port = null, reader = null, writer = null, text = '', pendingEsc = '';
      const out = h('pre', { class: 'hs-out', tabindex: '0', 'aria-label': '受信した内容。クリックしてキーを打つとそのまま送信します' });
      const status = h('span', { class: 'grow' }, '未接続');
      const baud = h('select', { class: 'sel', id: 'hs-baud-' + win.pid, title: '通信速度（ボーレート）', 'aria-label': '通信速度' }, [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(b => h('option', { value: String(b), selected: b === 115200 }, b + ' bps')));
      const eol = h('select', { class: 'sel', id: 'hs-eol-' + win.pid, title: '送信欄から送るときの行末', 'aria-label': '行末' }, [['\r\n', 'CR+LF'], ['\r', 'CR'], ['\n', 'LF'], ['', 'なし']].map(o => h('option', { value: o[0] }, o[1])));
      const line = h('input', { class: 'inp', id: 'hs-line-' + win.pid, placeholder: '1行ずつ送る（Enter で送信）', spellcheck: 'false', autocomplete: 'off', 'aria-label': '送信する文字列' });
      const tb = (label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, label);
      const direct = h('input', { type: 'checkbox', id: 'hs-direct-' + win.pid });
      const bConn = h('button', { class: 'btn small primary', type: 'button', onclick: () => (port ? disconnect() : connect()) }, '接続');
      const supported = 'serial' in navigator;
      win.body.append(
        h('div', { class: 'toolbar' }, bConn, baud, h('span', { class: 'sep' }),
          tb('Ctrl+C', () => send('\x03'), '中断（MicroPython では実行中のプログラムを止める）'), tb('Ctrl+D', () => send('\x04'), 'ソフトリセット（MicroPython）'),
          h('span', { class: 'sep' }), tb('クリア', () => { text = ''; paint(); }), tb('ログを保存', saveLog, '受信した内容を hFS に保存')),
        out,
        h('form', { class: 'hs-send', onsubmit: e => { e.preventDefault(); if (direct.checked) { send('\r'); line.value = ''; } else if (send(line.value + eol.value)) line.value = ''; } }, line, eol, h('button', { class: 'btn', type: 'submit' }, '送信'),
          h('label', { class: 'hs-direct', title: '入力欄に打った文字を1文字ずつすぐ送ります。画面キーボードで REPL を使うとき用' }, direct, '1文字ずつ')),
        h('div', { class: 'statusbar' }, status));

      function paint() { const stick = out.scrollTop + out.clientHeight >= out.scrollHeight - 30; out.textContent = text; if (stick) out.scrollTop = out.scrollHeight; }
      function note(s) { text += (text && !text.endsWith('\n') ? '\n' : '') + '--- ' + s + ' ---\n'; paint(); }
      // 受信した文字を画面用に整える（CR を捨て、BS で1文字消し、色などのエスケープは取り除く）
      function feed(chunk) {
        let s = pendingEsc + chunk; pendingEsc = '';
        const cut = s.lastIndexOf('\x1b');
        if (cut >= 0 && !/^\x1b\[[0-9;?]*[A-Za-z]/.test(s.slice(cut)) && s.length - cut < 12) { pendingEsc = s.slice(cut); s = s.slice(0, cut); }
        s = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
        for (const ch of s) {
          if (ch === '\r' || ch === '\x1b' || ch === '\x07') continue;
          if (ch === '\b') { if (text && !text.endsWith('\n')) text = text.slice(0, -1); continue; }
          text += ch;
        }
        if (text.length > 120000) text = text.slice(-100000);
        paint();
      }
      async function connect() {
        try {
          const p = await navigator.serial.requestPort();
          await p.open({ baudRate: Number(baud.value) });
          port = p; writer = p.writable.getWriter();
          bConn.textContent = '切断'; bConn.classList.remove('primary'); baud.disabled = true;
          status.textContent = '接続中 ・ ' + baud.value + ' bps ・ 黒い画面をクリックしてキーを打つと、そのまま送信します';
          note('接続しました'); out.focus();
          readLoop(p);
        } catch (e) {
          if (e && e.name === 'NotFoundError') return; // ポート選択をキャンセルした
          port = null; ui.alert('接続できませんでした。\n' + (e && e.message || e) + '\n\nほかのアプリ（Thonny など）がそのポートを使っていないか確認してください。');
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
        } catch (e) { if (port === p) { note('切断されました（' + (e && e.message || e) + '）'); cleanup(); } }
      }
      function cleanup() {
        port = null; writer = null;
        bConn.textContent = '接続'; bConn.classList.add('primary'); baud.disabled = false; status.textContent = '未接続';
      }
      async function disconnect(quiet) {
        const p = port; if (!p) return;
        port = null;
        try { if (reader) await reader.cancel(); } catch (e) { /* 無視 */ }
        try { if (writer) { writer.releaseLock(); } } catch (e) { /* 無視 */ }
        try { await p.close(); } catch (e) { /* 無視 */ }
        if (!quiet) { cleanup(); note('切断しました'); }
      }
      function send(s) {
        if (!port || !writer) { ui.toast('まだ接続していません'); return false; }
        writer.write(new TextEncoder().encode(s)).catch(e => note('送信に失敗しました（' + e.message + '）'));
        return true;
      }
      const SPECIAL = { Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b', ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D', Delete: '\x1b[3~', Home: '\x1b[H', End: '\x1b[F' };
      out.addEventListener('keydown', e => {
        if (!port || e.isComposing || e.metaKey || e.altKey) return;
        let s = null;
        if (e.ctrlKey) { if (/^[a-z]$/i.test(e.key)) s = String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64); }
        else if (SPECIAL[e.key]) s = SPECIAL[e.key];
        else if (e.key.length === 1) s = e.key;
        if (s == null) return;
        e.preventDefault(); send(s);
      });
      // 「1文字ずつ」: 画面キーボードでも使えるよう、入力欄に入った文字をその場で送って欄を空に戻す
      line.addEventListener('input', e => { if (!direct.checked || !port || e.isComposing) return; if (line.value) { send(line.value); line.value = ''; } });
      line.addEventListener('compositionend', () => { if (direct.checked && port && line.value) { send(line.value); line.value = ''; } });
      line.addEventListener('keydown', e => { if (direct.checked && port && e.key === 'Backspace' && !line.value) { e.preventDefault(); send('\x7f'); } });
      direct.addEventListener('change', () => { line.placeholder = direct.checked ? '打った文字をすぐ送ります' : '1行ずつ送る（Enter で送信）'; line.focus(); });
      out.addEventListener('paste', e => { if (!port) return; e.preventDefault(); send((e.clipboardData.getData('text') || '').replace(/\r?\n/g, '\r')); });
      function saveLog() {
        try {
          if (!text) throw new Error('保存する内容がありません');
          const d = new Date(), z = n => String(n).padStart(2, '0');
          const p = fsx.unique(home + '/Documents/serial-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.log');
          fsx.write(p, text); ui.toast('保存しました: ' + p);
        } catch (e) { ui.alert(e.message); }
      }
      win.onDispose = () => { disconnect(true); };
      if (!supported) {
        bConn.disabled = true;
        text = 'このブラウザは Web Serial に対応していないため、hSerial は使えません。\nChrome / Edge / Chromium（パソコン版）で開いてください。\n';
        paint(); status.textContent = 'Web Serial 非対応';
      } else {
        text = '「接続」を押して、つなぎたいシリアルポートを選んでください。\nMicroPython の REPL なら 115200 bps のままで大丈夫です。\n'; paint();
      }
      return win;
    }
  });
})();
