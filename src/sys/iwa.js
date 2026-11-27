/* htmlOS IWA ブリッジ（Nightly 0.0.0n から・試験中）— OS.iwa
   htmlOS Nightly を Isolated Web App（IWA）の外枠「htmlOS Shell」の中で動かしたときに、外枠とやり取りする。
   外枠は htmlOS を 1 枚目の Controlled Frame に表示していて、hBrowser のページは 2 枚目以降の Controlled Frame を
   hBrowser のウインドウの上に重ねて表示する（埋め込みを拒否するサイトもプロキシなしで表示できる）。
   ・htmlOS → 外枠: 印を付けた console.log（外枠は Controlled Frame の consolemessage イベントで受け取る）
   ・外枠 → htmlOS: 外枠が executeScript で document に「htmlos-iwa」イベントを送る（detail は JSON の文字列）
   外枠の中でないとき（URL に ?iwa-shell=1 がないとき）は何もしない */
(function () {
  'use strict';
  const OS = window.OS;
  const MARK = '\u0001htmlos-iwa:';
  const inShell = /[?&]iwa-shell=1(&|$)/.test(location.search);
  const handlers = {}, views = {}, waits = {};
  let seq = 0, hello = null;
  const send = msg => { if (inShell) console.log(MARK + JSON.stringify(msg)); };
  const emit = (type, m) => (handlers[type] || []).slice().forEach(f => { try { f(m); } catch (e) { console.error(e); } });

  document.addEventListener('htmlos-iwa', e => {
    let m; try { m = JSON.parse(e.detail); } catch (x) { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'hello') { hello = m; I.available = true; I.shell = m; emit('hello', m); return; }
    if (m.type === 'result' && waits[m.req]) { const w = waits[m.req]; delete waits[m.req]; m.error ? w.reject(new Error(m.error)) : w.resolve(m.value); return; }
    if (m.id && views[m.id]) views[m.id].event(m);
    emit(m.type, m);
  });

  // 外枠に聞いて答えを待つ（10 秒で諦める）
  function ask(msg) {
    return new Promise((resolve, reject) => {
      const req = 'q' + (++seq); waits[req] = { resolve: resolve, reject: reject };
      send(Object.assign({ req: req }, msg));
      setTimeout(() => { if (waits[req]) { delete waits[req]; reject(new Error('htmlOS Shell から返事がありません')); } }, 10000);
    });
  }

  // hBrowser などが使う「重ねて表示するページ」。host は htmlOS の中の要素で、その上に外枠が Controlled Frame を重ねる
  //   const v = OS.iwa.View(要素, { root: ウインドウの要素, onstate(s) {…}, onnewwindow(url) {…} });  v.load(url) / v.back() / v.forward() / v.reload() / v.stop() / v.html() / v.destroy()
  function View(host, cb) {
    cb = cb || {};
    const root = cb.root || null; // host が入っているウインドウ（その中のつまみは重なりに数えない）
    const id = 'v' + (++seq) + '-' + Date.now().toString(36);
    let opened = false, last = '', timer = 0, gone = false;
    // 見えているか: host の上を約 60px おきの格子で調べて、どこかがほかの要素（ほかのウインドウ・メニュー・ダイアログ・ロック画面）に
    // 隠れていたら「見えていない」にする（外枠の Controlled Frame は htmlOS の上に出るので、一部でも重なったら隠す）
    function geom() {
      const r = host.getBoundingClientRect();
      const g = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), visible: false };
      if (document.hidden || !host.isConnected || g.w < 8 || g.h < 8) return g;
      const cols = Math.min(24, Math.max(2, Math.ceil(r.width / 60))), rows = Math.min(16, Math.max(2, Math.ceil(r.height / 60)));
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
        const el = document.elementFromPoint(r.left + 3 + (r.width - 6) * i / cols, r.top + 3 + (r.height - 6) * j / rows);
        if (!el || (el !== host && !host.contains(el) && !(root && root.contains(el) && el.classList.contains('rz')))) return g; // 自分のウインドウの端の「大きさを変えるつまみ」は数えない
      }
      g.visible = true;
      return g;
    }
    function tick() {
      if (gone || !opened) return;
      const g = geom(), key = [g.x, g.y, g.w, g.h, g.visible].join(',');
      if (key !== last) { last = key; send({ type: 'view.update', id: id, rect: g }); host.classList.toggle('iwa-covered', !g.visible); }
    }
    const v = views[id] = {
      id: id,
      event(m) {
        if (m.type === 'view.state' && cb.onstate) cb.onstate(m);
        else if (m.type === 'view.newwindow' && cb.onnewwindow) cb.onnewwindow(m.url);
      },
      load(url) {
        const g = geom(); last = [g.x, g.y, g.w, g.h, g.visible].join(',');
        send({ type: opened ? 'view.nav' : 'view.open', id: id, action: 'load', url: String(url), rect: g });
        opened = true;
        if (!timer) timer = setInterval(tick, 80);
      },
      back() { send({ type: 'view.nav', id: id, action: 'back' }); },
      forward() { send({ type: 'view.nav', id: id, action: 'forward' }); },
      reload() { send({ type: 'view.nav', id: id, action: 'reload' }); },
      stop() { send({ type: 'view.nav', id: id, action: 'stop' }); },
      html() { return ask({ type: 'view.html', id: id }); },
      // いまは使わない（ほかのページを表示するあいだ隠す）
      hide() { if (!opened) return; clearInterval(timer); timer = 0; last = ''; send({ type: 'view.update', id: id, rect: { x: 0, y: 0, w: 0, h: 0, visible: false } }); },
      show() { if (opened && !timer) { timer = setInterval(tick, 80); tick(); } },
      destroy() { if (gone) return; gone = true; clearInterval(timer); delete views[id]; if (opened) send({ type: 'view.close', id: id }); }
    };
    return v;
  }

  const I = OS.iwa = {
    inShell: inShell, available: false, shell: null, mark: MARK,
    send: send, ask: ask, View: View,
    on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); return () => { handlers[type] = (handlers[type] || []).filter(f => f !== fn); }; },
    settings() { send({ type: 'shell.settings' }); }
  };

  if (inShell) {
    // 外枠に「起動した」と知らせる。外枠が聞き始める前だと届かないので、返事（hello）が来るまで何回か送る
    let n = 0;
    const t = setInterval(() => { if (hello || ++n > 40) { clearInterval(t); return; } send({ type: 'ready', version: OS.version || '' }); }, 500);
    send({ type: 'ready', version: OS.version || '' });
    // ページを離れるとき（再起動など）は重ねていたページを全部片付けてもらう
    window.addEventListener('pagehide', () => send({ type: 'view.closeAll' }));
  }

  // jsh: iwa — 外枠とのつながりを確かめる・外枠の設定を開く
  if (OS.registerCommand) OS.registerCommand({
    name: 'iwa', usage: 'iwa [settings]', desc: 'IWA（htmlOS Shell）とのつながり（Nightly の試験機能）',
    run(args) {
      if (args[0] === 'settings') { if (!I.available) throw new Error('htmlOS Shell の中ではありません'); I.settings(); return '外枠の設定を開きました'; }
      if (!inShell) return 'htmlOS Shell（IWA）の中ではありません。hBrowser はいつもどおりプロキシと iframe で表示します';
      if (!I.available) return 'htmlOS Shell の中のはずですが、まだ返事がありません';
      return 'htmlOS Shell ' + (I.shell.version || '?') + ' につながっています（使える機能: ' + (I.shell.features || []).join('、') + '）\n重ねて表示しているページ: ' + Object.keys(views).length + ' 個';
    }
  });
})();
