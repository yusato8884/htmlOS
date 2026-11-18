/* HTUi Studio — htmlOS のアプリ開発環境（IDE）
   アプリケーション・コマンド・デスクトップ環境の 3 種類を作れる。プロジェクトは ~/Projects/名前/ に
     project.json（名前・ID・種類・版・説明・アイコン・色）と main.js（本体）、README.md
   ビルドすると build/ID.js（パッケージ）ができ、「インストール」で /apps に入る（hStore と同じ。root のパスワードが要る）。
   「実行」はインストールせずにメモリの上で読み込んで試す（再起動すると消える）。
   GUI 版はこのアプリ、CLI 版は jsh の  hstudio new|list|build|run|install|open  （同じ OS.studio を使う） */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;

  // ======================================================== 共通（GUI 版と CLI 版）
  const TYPES = {
    app: { label: 'アプリケーション', icon: 'grid', desc: 'ウインドウを開くアプリ。OS.registerApp で登録します。' },
    cmd: { label: 'コマンド', icon: 'terminal', desc: 'jsh のコマンド。OS.registerCommand で登録します。パイプや引数も使えます。' },
    de: { label: 'デスクトップ環境', icon: 'layers', desc: 'ログイン画面で選べるデスクトップ環境。OS.registerSession で登録します。' }
  };
  const fill = (t, m) => t.replace(/\{\{(\w+)\}\}/g, (x, k) => m[k] != null ? String(m[k]).replace(/'/g, "\\'") : '');
  const TPL = {
    app: [
      "/* {{name}} — HTUi Studio で作ったアプリケーション */",
      "(function () {",
      "  const OS = window.OS, h = OS.h, ui = OS.ui;",
      "  OS.registerApp({",
      "    id: '{{id}}', name: '{{name}}', icon: '{{icon}}', color: '{{color}}', desc: '{{desc}}',",
      "    launch(arg) {",
      "      // buttons: タイトルバーに置くボタン（HTUi SDK 3.0 のキャプションボタン）",
      "      const win = OS.htui.open({ title: '{{name}}', icon: '{{icon}}', w: 460, h: 340, app: '{{id}}', buttons: [",
      "        { icon: 'info', title: 'このアプリについて', onclick: () => ui.alert('{{name}} {{version}}\\nHTUi Studio で作りました', '{{name}}') }",
      "      ] });",
      "      let n = 0;",
      "      const count = h('div', { style: 'font:600 48px/1 var(--mono)' }, '0');",
      "      const step = h('input', { type: 'range', min: 1, max: 10, value: 1, 'aria-label': '増やす数' });",
      "      const sw = h('input', { type: 'checkbox', class: 'switch', id: '{{id}}-dark-' + win.pid });",
      "      const box = h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;padding:16px' },",
      "        h('h2', { style: 'margin:0' }, 'こんにちは、{{name}}！'), count,",
      "        h('label', null, '増やす数 ', step),",
      "        h('label', null, sw, '暗い背景'),",
      "        h('div', { style: 'display:flex;gap:8px' },",
      "          h('button', { class: 'btn primary', type: 'button', onclick: () => { n += +step.value; count.textContent = n; } }, '数える'),",
      "          h('button', { class: 'btn', type: 'button', onclick: async () => { if (await ui.confirm('0 に戻しますか?')) { n = 0; count.textContent = n; } } }, 'リセット')));",
      "      sw.addEventListener('change', () => { box.style.background = sw.checked ? '#1d2026' : ''; box.style.color = sw.checked ? '#fff' : ''; });",
      "      win.body.append(box);",
      "      return win;",
      "    }",
      "  });",
      "})();", ""].join('\n'),
    cmd: [
      "/* {{name}} — HTUi Studio で作ったコマンド。jsh で  {{id}} [名前]  と打つと動きます */",
      "(function () {",
      "  OS.registerCommand({",
      "    name: '{{id}}', usage: '{{id}} [-u] [名前]', desc: '{{desc}}',",
      "    // args: 引数の配列。sh: print・read・stdin（パイプの入力）・cwd・abs・fs・cmd・getopts など",
      "    async run(args, sh) {",
      "      const g = sh.getopts(args, '');      // -u のようなオプション",
      "      let text;",
      "      if (sh.stdin != null) text = sh.lines(sh.stdin).map((l, i) => (i + 1) + ': ' + l).join('\\n'); // ls | {{id}}",
      "      else text = 'こんにちは、' + (g.rest[0] || sh.user) + ' さん！ ここは ' + sh.cwd + ' です';",
      "      return g.o.u ? text.toUpperCase() : text;   // 返した文字が出力になる（パイプや > にも渡る）",
      "    }",
      "  });",
      "})();", ""].join('\n'),
    de: [
      "/* {{name}} — HTUi Studio で作ったデスクトップ環境 */",
      "(function () {",
      "  const OS = window.OS, h = OS.h, htui = OS.htui;",
      "  OS.registerSession({",
      "    id: '{{id}}', name: '{{name}}', desc: '{{desc}}',",
      "    // k は HTUi SDK の部品（k.desk / k.apps / k.run / k.menu / k.clock / k.powerItems / k.userButton …）",
      "    build(k) {",
      "      const desk = k.desk({ files: true, trash: true });          // ウインドウとアイコンを置く場所",
      "      const tasks = htui.tasks = h('div', { style: 'flex:1;min-width:0;display:flex;gap:4px;overflow:hidden' }); // 開いているウインドウのボタン",
      "      const start = h('button', { class: 'p-btn', type: 'button', onclick: e => k.menu(e.currentTarget,",
      "        k.apps().map(a => ({ label: a.name, icon: a.icon, act: () => k.run(a.id) })).concat([{ sep: true }], k.powerItems()), true) },",
      "        k.icon('grid', 18), '{{name}}');",
      "      const clock = k.clock(h('span', { style: 'padding:0 10px;font-variant-numeric:tabular-nums' }), d => k.pad(d.getHours()) + ':' + k.pad(d.getMinutes()));",
      "      const bar = h('div', { class: 'panel', style: 'height:40px;background:{{color}};color:#fff' }, start, tasks, k.modeButton('p-btn'), clock);",
      "      htui.el.append(desk, bar);                                  // 下にバーを置く",
      "    },",
      "    onStart() { OS.ui.toast('{{name}} へようこそ'); }",
      "  });",
      "})();", ""].join('\n')
  };
  const README = "# {{name}}\n\n{{desc}}\n\n- 種類: {{typeLabel}}\n- ID: `{{id}}`\n- 版: {{version}}\n\nHTUi Studio で作りました。\n\n- 実行（試す）: HTUi Studio の ▶、または `hstudio run {{dirName}}`\n- インストール: HTUi Studio の「インストール」、または `hstudio install {{dirName}}`\n";
  const COLORS = ['#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac'];

  const S = OS.studio = {
    TYPES: TYPES,
    version: '1.0',
    projectsDir: user => OS.users.home(user) + '/Projects',
    // 名前から ID（英小文字・数字・-）を作る
    slug(name, type) {
      let s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!/^[a-z]/.test(s)) s = (type === 'cmd' ? 'cmd' : type === 'de' ? 'de' : 'app') + (s ? '-' + s : '');
      return s.slice(0, 32);
    },
    // 新しいプロジェクトを作る。返り値はプロジェクトのフォルダ
    create(fsx, user, type, name, opt) {
      opt = opt || {};
      if (!TYPES[type]) throw new Error('種類は app（アプリケーション）・cmd（コマンド）・de（デスクトップ環境）のどれかです');
      name = String(name || '').trim();
      if (!name) throw new Error('名前を入れてください');
      const id = opt.id || S.slug(name, type);
      if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('ID は英小文字で始まり、英小文字・数字・- だけにしてください');
      if (type === 'app' && OS.apps[id] && !OS.apps[id].pkg) throw new Error(id + ' はシステムのアプリと同じ ID です。ほかの名前にしてください');
      if (type === 'de' && OS.sessions[id] && !OS.sessions[id].pkg) throw new Error(id + ' はシステムのデスクトップ環境と同じ ID です');
      const base = opt.dir || S.projectsDir(user);
      const dirName = name.replace(/[\/\\:*?"<>|]/g, '_');
      const dir = path.join(base, dirName);
      if (fsx.exists(dir)) throw new Error(dir + ' はすでにあります');
      const meta = { name: name, id: id, type: type, version: '1.0.0', desc: opt.desc || (type === 'cmd' ? 'あいさつを表示するコマンド' : type === 'de' ? '自作のデスクトップ環境' : '自作のアプリ'),
        icon: opt.icon || TYPES[type].icon, color: opt.color || COLORS[(Math.random() * COLORS.length) | 0], entry: 'main.js', studio: S.version, created: Date.now() };
      fsx.mkdir(dir, { parents: true });
      fsx.write(dir + '/project.json', JSON.stringify(meta, null, 2) + '\n');
      fsx.write(dir + '/main.js', fill(TPL[type], meta));
      fsx.write(dir + '/README.md', fill(README, Object.assign({ typeLabel: TYPES[type].label, dirName: dirName }, meta)));
      return dir;
    },
    isProject: (fsx, dir) => { try { return fsx.isFile(dir + '/project.json'); } catch (e) { return false; } },
    load(fsx, dir) {
      if (!S.isProject(fsx, dir)) throw new Error(dir + ': HTUi Studio のプロジェクトではありません（project.json がありません）');
      let meta;
      try { meta = JSON.parse(fsx.read(dir + '/project.json')); } catch (e) { throw new Error('project.json を読めません: ' + e.message); }
      return { dir: dir, meta: meta };
    },
    saveMeta(fsx, proj) { fsx.write(proj.dir + '/project.json', JSON.stringify(proj.meta, null, 2) + '\n'); },
    list(fsx, user) {
      const d = S.projectsDir(user);
      if (!fsx.isDir(d)) return [];
      return fsx.list(d).map(n => path.join(d, n)).filter(p => S.isProject(fsx, p)).map(p => { try { return S.load(fsx, p); } catch (e) { return null; } }).filter(Boolean);
    },
    // ビルド: 文法と登録の呼び出しを確かめて build/ID.js を作る。{ ok, log, code, out }
    build(fsx, proj) {
      const m = proj.meta, log = [], t0 = Date.now();
      const say = (lv, s) => log.push({ lv: lv, s: s });
      say('info', 'ビルド開始: ' + m.name + '（' + (TYPES[m.type] || {}).label + '・ID ' + m.id + '・' + m.version + '）');
      let code;
      try { code = fsx.read(path.join(proj.dir, m.entry || 'main.js')); } catch (e) { say('err', e.message); return { ok: false, log: log }; }
      try { new Function(code); } catch (e) { say('err', (m.entry || 'main.js') + ': ' + e.name + ': ' + e.message); return { ok: false, log: log }; }
      const want = { app: 'registerApp', cmd: 'registerCommand', de: 'registerSession' }[m.type];
      if (!new RegExp(want + '\\s*\\(').test(code)) { say('err', 'OS.' + want + '(…) が見つかりません。' + (TYPES[m.type] || {}).label + 'は OS.' + want + ' で登録します'); return { ok: false, log: log }; }
      if (!new RegExp("['\"]" + m.id.replace(/-/g, '\\-') + "['\"]").test(code)) say('warn', 'main.js の中に ID「' + m.id + '」が見つかりません。project.json の id と合わせてください');
      const header = '/* ' + m.name + ' ' + m.version + ' — ' + (TYPES[m.type] || {}).label + '（HTUi Studio ' + S.version + ' でビルド ' + new Date().toLocaleString('ja-JP') + '）\n   ' + (m.desc || '') + ' */\n';
      const out = proj.dir + '/build/' + m.id + '.js';
      try { fsx.mkdir(proj.dir + '/build', { parents: true }); fsx.write(out, header + code); } catch (e) { say('err', e.message); return { ok: false, log: log }; }
      say('ok', 'ビルド成功: ' + out + '（' + (header.length + code.length) + ' 文字・' + (Date.now() - t0) + ' ms）');
      return { ok: true, log: log, code: header + code, out: out };
    },
    // 実行: インストールせずにメモリの上で読み込む（再起動すると消える）。{ ok, log }
    run(fsx, proj, opt) {
      opt = opt || {};
      const b = S.build(fsx, proj), m = proj.meta;
      if (!b.ok) return b;
      const prevLoading = OS._loading;
      OS._loading = 'studio:' + m.id;
      try { OS.exec(b.code, b.out); }
      catch (e) { b.log.push({ lv: 'err', s: '実行時エラー: ' + e.message }); b.ok = false; return b; }
      finally { OS._loading = prevLoading; }
      if (m.type === 'app') {
        if (!OS.apps[m.id]) { b.log.push({ lv: 'err', s: 'ID「' + m.id + '」のアプリが登録されませんでした' }); b.ok = false; return b; }
        if (OS.htui && OS.htui.refreshApps) OS.htui.refreshApps();
        if (opt.launch !== false) {
          if (!OS.htui.running || !OS.htui.user) { b.log.push({ lv: 'warn', s: 'HTUi が起動していないので、登録だけしました（htui start のあと launch ' + m.id + '）' }); return b; }
          try { OS.launch(m.id); b.log.push({ lv: 'ok', s: m.name + ' を起動しました（インストールはしていません）' }); }
          catch (e) { b.log.push({ lv: 'err', s: '起動時エラー: ' + e.message }); b.ok = false; }
        }
      } else if (m.type === 'cmd') {
        if (!OS.commands[m.id]) { b.log.push({ lv: 'err', s: 'コマンド「' + m.id + '」が登録されませんでした' }); b.ok = false; return b; }
        b.log.push({ lv: 'ok', s: 'コマンド ' + m.id + ' を登録しました。Terminal で試せます（インストールはしていません）' });
      } else if (m.type === 'de') {
        if (!OS.sessions[m.id]) { b.log.push({ lv: 'err', s: 'デスクトップ環境「' + m.id + '」が登録されませんでした' }); b.ok = false; return b; }
        b.log.push({ lv: 'ok', s: 'デスクトップ環境 ' + m.id + ' を登録しました' + (opt.launch === false ? '' : '。切り替えます（戻すときは htui session htui）') });
      }
      return b;
    },
    // インストール: /apps にパッケージとして入れる（user は root か、asRoot で確認したあとの 'root'）
    install(fsx, proj, user) {
      const b = S.build(fsx, proj);
      if (!b.ok) return b;
      const n = OS.pkg.install(proj.meta.id + '.js', b.code, user);
      b.log.push({ lv: 'ok', s: 'インストールしました: /apps/' + n + '（hStore の「インストール済み」から削除できます）' });
      b.pkg = n;
      return b;
    },
    // CLI からも使う、ログの 1 行の文字
    fmt: l => ({ info: '  ', ok: '✓ ', warn: '! ', err: '✗ ' }[l.lv] || '') + l.s
  };

  // ======================================================== リファレンス（WebView で表示する）
  const REF = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>HTUi SDK 3.0 リファレンス</title><style>' +
    'body{font:14px/1.6 system-ui,"Noto Sans JP",sans-serif;margin:0;padding:14px 16px;color:#24262b}h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 4px;padding-top:8px;border-top:1px solid #ddd}' +
    'code,pre{font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace}pre{background:#f3f3f6;border-radius:7px;padding:8px 10px;overflow:auto;margin:6px 0}p{margin:4px 0;color:#4b4f58}small{color:#888}a{color:#1c71d8}</style></head><body>' +
    '<h1>HTUi SDK 3.0 (Venus)</h1><p><small>htmlOS 4.0 Vega ・ HTUi Studio ' + S.version + '</small></p>' +
    '<p>目次: <a href="#app">アプリ</a> ・ <a href="#win">ウインドウ</a> ・ <a href="#cap">キャプションボタン</a> ・ <a href="#wv">WebView</a> ・ <a href="#ui">ダイアログ</a> ・ <a href="#venus">部品</a> ・ <a href="#cmd">コマンド</a> ・ <a href="#de">デスクトップ環境</a></p>' +
    '<h2 id="app">アプリ</h2><pre>OS.registerApp({ id, name, icon, color, desc, launch(arg) { … return win; } })</pre><p>icon は htmlOS のアイコン名（grid, terminal, edit, globe, star, code …）。</p>' +
    '<h2 id="win">ウインドウ</h2><pre>const win = OS.htui.open({ title, icon, w, h, app, parent, dialog, buttons })\nwin.body.append(…)   win.setTitle(t)   win.close()   win.focus()\nwin.onClose = async () =&gt; true / false   win.onDispose = () =&gt; …</pre><p>parent を渡すと子ウインドウ（親の操作をふさぐ）。dialog: true で最小化・最大化なし。</p>' +
    '<h2 id="cap">キャプションボタン</h2><pre>OS.htui.open({ …, buttons: [{ icon: \'play\', label: \'実行\', title: \'実行する\', onclick(e, on) {} },\n  { icon: \'shield\', toggle: true, on: false, onclick(e, on) {} }] })\nconst b = win.addButton({ icon: \'star\', title: \'お気に入り\', onclick() {} })\nb.active = true; b.disabled = true; b.setIcon(\'x\'); b.remove()</pre>' +
    '<h2 id="wv">WebView</h2><pre>const wv = OS.htui.WebView({ proxy: false, onnavigate(url) {}, onload(url) {}, ontitle(t) {}, onstatus(t) {}, onmessage(data) {} })\nwv.attach(win)          // ウインドウに入れる（閉じると片づく）\nwv.go(\'https://example.com/\')   wv.go(\'~/Documents/welcome.html\')\nwv.html(\'&lt;h1&gt;Hello&lt;/h1&gt;\')   wv.back()   wv.forward()   wv.reload()   wv.post(data)</pre><p>onnavigate を渡さないと、リンクを押したときに WebView がそのまま移動します。ページからは parent.postMessage(…) で onmessage に届きます。</p>' +
    '<h2 id="ui">ダイアログ</h2><pre>await OS.ui.alert(\'本文\', \'タイトル\')\nawait OS.ui.confirm(\'消しますか?\', { ok: \'削除\', danger: true })\nawait OS.ui.prompt(\'名前\', \'初期値\')\nawait OS.ui.pickFile({ mode: \'open\' | \'save\', dir })\nOS.ui.toast(\'保存しました\')   OS.notify({ title, body })</pre><p>アクティブなウインドウがあれば、そのウインドウの子ウインドウとして開きます。</p>' +
    '<h2 id="venus">部品（Venus のデザイン）</h2><pre>&lt;button class="btn"&gt; / class="btn primary" / "btn danger" / "btn small"\n&lt;input class="inp"&gt;   &lt;select class="sel"&gt;\n&lt;input type="checkbox" class="switch"&gt;   &lt;input type="range"&gt;   &lt;progress&gt;\n.toolbar  .tbtn  .statusbar  .tabs .tab  .pane  .tbl  .badge</pre><p>クラスのない button・input・select・チェックボックス・ラジオ・スライダー・スクロールバーも Venus のデザインになります。</p>' +
    '<h2 id="cmd">コマンド</h2><pre>OS.registerCommand({ name, usage, desc, async run(args, sh) { return \'出力\'; } })\nsh.print(…)  sh.read(\'? \')  sh.stdin  sh.lines(text)  sh.getopts(args, \'n\')\nsh.cwd  sh.abs(p)  sh.fs  sh.user  await sh.cmd(\'ls | wc -l\')</pre>' +
    '<h2 id="de">デスクトップ環境</h2><pre>OS.registerSession({ id, name, desc, build(k) { … }, onStart() {}, onStop() {} })\nk.desk(icons)  k.apps()  k.run(id)  k.menu(anchor, items, below)  k.clock(el, fmt)\nk.modeButton(cls)  k.userButton(cls)  k.powerItems()  k.icon(name, size)\nOS.htui.tasks = 要素   // ウインドウのボタンの置き場</pre>' +
    '</body></html>';

  // ======================================================== GUI 版
  OS.registerApp({
    id: 'hstudio', name: 'HTUi Studio', icon: 'studio', color: '#4a3aa8', desc: 'アプリ・コマンド・デスクトップ環境を作る開発環境（IDE）',
    launch(arg) {
      const fsx = OS.htui.fs, user = OS.htui.user;
      let proj = null, file = null, files = {}, dirty = {};
      const win = OS.htui.open({ title: 'HTUi Studio', icon: 'studio', w: 1000, h: 640, app: 'hstudio', buttons: [
        { icon: 'play', label: '実行', title: '実行（F5）: インストールせずに試す', onclick: () => doRun() },
        { icon: 'hammer', title: 'ビルド（Ctrl+B）', onclick: () => doBuild() },
        { icon: 'box', title: 'インストール（/apps に入れる）', onclick: () => doInstall() }
      ] });
      const [cbRun, cbBuild, cbInst] = win.captionButtons;
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const scheme = h('span', { class: 'hx-scheme' });
      const toolbar = h('div', { class: 'toolbar' },
        tb('plus', '新規', () => newProject()), tb('folder', '開く', () => openProject()), tb('save', '保存', () => saveAll()),
        h('span', { class: 'sep' }), tb('play', '実行', () => doRun(), '実行（F5）'), tb('hammer', 'ビルド', () => doBuild(), 'ビルド（Ctrl+B）'), tb('box', 'インストール', () => doInstall()),
        h('span', { class: 'sep' }), scheme);
      const nav = h('div', { class: 'hx-nav' });
      const ta = h('textarea', { class: 'he-text hx-code', spellcheck: 'false', id: 'hx-code-' + win.pid, 'aria-label': 'コード' });
      const gut = h('div', { class: 'he-gutter', 'aria-hidden': 'true' }, '1');
      const edHead = h('div', { class: 'hx-edhead' });
      const editor = h('div', { class: 'hx-editor' }, edHead, h('div', { class: 'he-wrap' }, gut, ta));
      const insp = h('div', { class: 'hx-insp' });
      const con = h('div', { class: 'hx-console', role: 'log', 'aria-label': 'ビルドの記録' });
      const main = h('div', { class: 'hx-main' }, nav, editor, insp);
      const stInfo = h('span', { class: 'grow' }), stPos = h('span');
      const body = h('div', { class: 'hx-body' }, toolbar, main, h('div', { class: 'hx-conhead' }, OS.icon('terminal', 14), 'コンソール', h('button', { class: 'tbtn', type: 'button', title: 'コンソールを消す', onclick: () => { con.textContent = ''; } }, OS.icon('trash', 14))), con, h('div', { class: 'statusbar' }, stInfo, stPos));
      win.body.append(body);
      let wv = null;

      const log = (lv, s) => { const l = typeof lv === 'object' ? lv : { lv: lv, s: s }; con.append(h('div', { class: 'hx-l hx-' + l.lv }, S.fmt(l))); con.scrollTop = con.scrollHeight; };
      const logAll = r => { con.append(h('div', { class: 'hx-sep' })); r.log.forEach(log); };
      const err = e => { log('err', e.message || String(e)); };

      // ---- 行番号
      let lines = 1;
      function refresh() {
        const n = ta.value.split('\n').length;
        if (n !== lines) { lines = n; const a = []; for (let i = 1; i <= n; i++) a.push(i); gut.textContent = a.join('\n'); }
        gut.scrollTop = ta.scrollTop;
        const before = ta.value.slice(0, ta.selectionStart).split('\n');
        stPos.textContent = file ? before.length + ' 行 ' + (before[before.length - 1].length + 1) + ' 列' : '';
      }
      ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
      ta.addEventListener('input', () => { if (file) { files[file] = ta.value; dirty[file] = true; paintNav(); } refresh(); });
      ['click', 'keyup'].forEach(ev => ta.addEventListener(ev, refresh));
      ta.addEventListener('keydown', e => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
        else if (e.key === 'Enter' && !e.ctrlKey) { // 前の行の字下げを引き継ぐ
          const st = ta.selectionStart, ls = ta.value.lastIndexOf('\n', st - 1) + 1, ind = (ta.value.slice(ls, st).match(/^\s*/) || [''])[0] + (/[{(\[]\s*$/.test(ta.value.slice(ls, st)) ? '  ' : '');
          e.preventDefault(); ta.setRangeText('\n' + ind, st, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
        }
      });
      win.el.addEventListener('keydown', e => {
        if (e.key === 'F5') { e.preventDefault(); doRun(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); doBuild(); }
      });

      // ---- 画面
      function paintAll() {
        const has = !!proj;
        [cbRun, cbBuild, cbInst].forEach(b => { b.disabled = !has; });
        toolbar.querySelectorAll('.tbtn').forEach((b, i) => { if (i > 1) b.disabled = !has; });
        main.classList.toggle('hx-empty', !has);
        win.setTitle(has ? proj.meta.name + ' — HTUi Studio' : 'HTUi Studio');
        scheme.textContent = '';
        if (has) scheme.append(h('span', { class: 'app-ico', style: 'width:18px;height:18px;border-radius:5px;background:' + (proj.meta.color || '#5e5c64') }, OS.icon(proj.meta.icon, 12)), ' ' + proj.meta.name, h('span', { class: 'hx-dim' }, ' ▸ ' + OS.name + ' ・ ' + TYPES[proj.meta.type].label));
        paintNav(); paintInsp();
        if (!has) welcome();
      }
      function welcome() {
        editor.style.display = 'none'; nav.style.display = 'none';
        insp.style.display = 'none';
        let w = main.querySelector('.hx-welcome');
        if (w) w.remove();
        const recent = S.list(fsx, user);
        w = h('div', { class: 'hx-welcome' },
          h('div', { class: 'hx-logo' }, OS.icon('studio', 56)),
          h('h1', null, 'HTUi Studio'),
          h('p', { class: 'hx-dim' }, '版 ' + S.version + ' ・ ' + OS.htui.sdk.full + ' ・ ' + OS.name),
          h('div', { class: 'hx-wbtns' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => newProject() }, OS.icon('plus', 16), '新しいプロジェクト'),
            h('button', { class: 'btn', type: 'button', onclick: () => openProject() }, OS.icon('folder', 16), 'プロジェクトを開く')),
          recent.length ? h('div', { class: 'hx-recent' }, h('h3', null, '~/Projects'), recent.map(p => h('button', { class: 'hx-ritem', type: 'button', onclick: () => open(p.dir) },
            h('span', { class: 'app-ico', style: 'width:30px;height:30px;border-radius:8px;background:' + (p.meta.color || '#5e5c64') }, OS.icon(p.meta.icon, 18)),
            h('span', null, h('b', null, p.meta.name), h('br'), h('small', { class: 'hx-dim' }, TYPES[p.meta.type] ? TYPES[p.meta.type].label + ' ・ ' + p.meta.id : p.meta.id))))) : h('p', { class: 'hx-dim' }, 'まだプロジェクトはありません。「新しいプロジェクト」から作れます。'),
          h('p', { class: 'hx-dim' }, 'CLI 版: Terminal で  hstudio help'));
        main.append(w);
      }
      function paintNav() {
        if (!proj) return;
        nav.textContent = '';
        nav.append(h('div', { class: 'hx-navhead' }, OS.icon(TYPES[proj.meta.type].icon, 14), h('b', null, proj.meta.name),
          h('button', { class: 'tbtn', type: 'button', title: '新しいファイル', onclick: () => newFile() }, OS.icon('plus', 14))));
        const walk = (dir, depth) => {
          let names = [];
          try { names = fsx.list(dir).sort(); } catch (e) { return; }
          names.forEach(n => {
            const p = path.join(dir, n), rel = p.slice(proj.dir.length + 1);
            if (fsx.isDir(p)) { nav.append(h('div', { class: 'hx-file dir', style: 'padding-left:' + (8 + depth * 14) + 'px' }, OS.icon('folder', 14), n)); walk(p, depth + 1); return; }
            nav.append(h('button', { class: 'hx-file' + (rel === file ? ' on' : ''), type: 'button', style: 'padding-left:' + (8 + depth * 14) + 'px', onclick: () => openFile(rel) },
              OS.icon(/\.js$/.test(n) ? 'code' : /\.md$/.test(n) ? 'markdown' : /\.json$/.test(n) ? 'gear' : 'file', 14), n + (dirty[rel] ? ' ●' : '')));
          });
        };
        walk(proj.dir, 0);
      }
      function paintInsp() {
        if (!proj) return;
        insp.textContent = '';
        const m = proj.meta;
        const tabs = h('div', { class: 'tabs' }), pane = h('div', { class: 'pane' });
        let tab = paintInsp.tab || 'proj';
        const sw = k => { paintInsp.tab = k; paintInsp(); };
        tabs.append(h('button', { class: 'tab' + (tab === 'proj' ? ' on' : ''), type: 'button', onclick: () => sw('proj') }, 'プロジェクト'), h('button', { class: 'tab' + (tab === 'ref' ? ' on' : ''), type: 'button', onclick: () => sw('ref') }, 'リファレンス'));
        insp.append(tabs);
        if (tab === 'ref') {
          // リファレンスは WebView（HTUi SDK 3.0）で表示する
          if (!wv) wv = OS.htui.WebView({ label: 'リファレンス' });
          insp.append(wv.el); wv.html(REF);
          return;
        }
        insp.append(pane);
        const field = (label, inp) => h('label', { class: 'hx-field' }, h('span', null, label), inp);
        const fName = h('input', { class: 'inp', id: 'hx-name-' + win.pid, value: m.name });
        const fId = h('input', { class: 'inp', id: 'hx-id-' + win.pid, value: m.id, spellcheck: 'false' });
        const fVer = h('input', { class: 'inp', id: 'hx-ver-' + win.pid, value: m.version });
        const fDesc = h('input', { class: 'inp', id: 'hx-desc-' + win.pid, value: m.desc || '' });
        const fIcon = h('select', { class: 'sel', id: 'hx-icon-' + win.pid }, (OS.iconNames || [m.icon]).map(n => h('option', { value: n, selected: n === m.icon }, n)));
        const fColor = h('input', { type: 'color', id: 'hx-color-' + win.pid, value: m.color || '#3584e4' });
        const prev = h('span', { class: 'app-ico', style: 'width:44px;height:44px;border-radius:11px;background:' + (m.color || '#5e5c64') }, OS.icon(m.icon, 26));
        const upd = () => { prev.style.background = fColor.value; prev.textContent = ''; prev.append(OS.icon(fIcon.value, 26)); };
        fIcon.addEventListener('change', upd); fColor.addEventListener('input', upd);
        pane.append(
          h('div', { class: 'hx-ihead' }, prev, h('div', null, h('b', null, m.name), h('br'), h('span', { class: 'badge' }, TYPES[m.type].label))),
          field('名前', fName), field('ID', fId), field('版', fVer), field('説明', fDesc), field('アイコン', fIcon), field('色', fColor),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            if (!/^[a-z][a-z0-9-]*$/.test(fId.value)) { ui.alert('ID は英小文字で始まり、英小文字・数字・- だけにしてください'); return; }
            const oldId = m.id;
            Object.assign(m, { name: fName.value.trim() || m.name, id: fId.value, version: fVer.value.trim() || m.version, desc: fDesc.value, icon: fIcon.value, color: fColor.value });
            try {
              S.saveMeta(fsx, proj);
              if (oldId !== m.id) log('warn', 'ID を ' + oldId + ' から ' + m.id + ' に変えました。main.js の中の ID も書き換えてください');
              log('ok', 'project.json を保存しました'); if (file === 'project.json') { files[file] = fsx.read(proj.dir + '/project.json'); ta.value = files[file]; refresh(); }
              paintAll();
            } catch (e) { err(e); }
          } }, OS.icon('save', 16), 'プロジェクトの設定を保存'),
          h('p', null, TYPES[m.type].desc),
          h('p', null, 'フォルダ: ' + proj.dir));
      }

      // ---- ファイル
      function openFile(rel) {
        if (!proj) return;
        try {
          if (files[rel] == null) files[rel] = fsx.read(path.join(proj.dir, rel));
          file = rel; ta.value = files[rel]; ta.scrollTop = 0; lines = -1; refresh();
          ta.readOnly = /^build\//.test(rel);
          edHead.textContent = ''; edHead.append(OS.icon('code', 14), ' ' + rel + (ta.readOnly ? '（ビルドで作られたファイル・読み取り専用）' : ''));
          paintNav(); stInfo.textContent = path.join(proj.dir, rel);
        } catch (e) { err(e); }
      }
      function saveAll(quiet) {
        if (!proj) return true;
        let n = 0;
        try {
          for (const rel in dirty) { fsx.write(path.join(proj.dir, rel), files[rel]); n++; }
          dirty = {};
          if (file === 'project.json') proj.meta = JSON.parse(files[file]);
        } catch (e) { err(e); return false; }
        if (n && !quiet) log('ok', n + ' 個のファイルを保存しました');
        paintNav();
        return true;
      }
      async function newFile() {
        const n = await ui.prompt('新しいファイルの名前（例: util.js, style.css）', '', { title: '新しいファイル' });
        if (!n) return;
        const p = path.join(proj.dir, n);
        try { if (fsx.exists(p)) throw new Error(n + ' はすでにあります'); fsx.write(p, ''); files[n] = ''; openFile(n); } catch (e) { ui.alert(e.message); }
      }
      function open(dir) {
        try {
          if (!saveAll(true)) return;
          proj = S.load(fsx, dir); files = {}; dirty = {}; file = null;
          const w = main.querySelector('.hx-welcome'); if (w) w.remove();
          editor.style.display = ''; nav.style.display = ''; insp.style.display = '';
          paintAll();
          openFile(proj.meta.entry || 'main.js');
          log('info', 'プロジェクトを開きました: ' + dir);
        } catch (e) { ui.alert(e.message); }
      }
      async function openProject() {
        const d = await ui.pickFile({ mode: 'open', dir: S.projectsDir(user), title: 'プロジェクトの project.json を選ぶ' });
        if (!d) return;
        open(path.base(d) === 'project.json' ? path.dir(d) : fsx.isDir(d) ? d : path.dir(d));
      }
      // ---- 新しいプロジェクト（子ウインドウで種類を選ぶ）
      async function newProject() {
        let type = 'app';
        const cards = {};
        const name = h('input', { class: 'inp', id: 'hx-newname-' + win.pid, placeholder: '例: MyApp', 'aria-label': 'プロジェクトの名前' });
        const idInfo = h('small', { class: 'hx-dim' });
        const upd = () => { idInfo.textContent = 'ID: ' + (name.value.trim() ? S.slug(name.value, type) : '—') + ' ・ 保存先: ~/Projects/' + (name.value.trim() || '名前'); Object.keys(cards).forEach(k => cards[k].classList.toggle('on', k === type)); };
        name.addEventListener('input', upd);
        const grid = h('div', { class: 'hx-types' }, Object.keys(TYPES).map(k => (cards[k] = h('button', { class: 'hx-type', type: 'button', onclick: () => { type = k; upd(); } },
          OS.icon(TYPES[k].icon, 30), h('b', null, TYPES[k].label), h('small', null, TYPES[k].desc)))));
        upd();
        const ok = await ui.modal({ title: '新しいプロジェクト', width: 560, body: [h('p', { class: 'modal-msg' }, 'テンプレートを選んでください'), grid, h('label', { class: 'hx-field' }, h('span', null, '名前'), name), idInfo],
          buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: '作成', primary: true, value: true }] });
        if (!ok) return;
        try { const dir = S.create(fsx, user, type, name.value); open(dir); log('ok', TYPES[type].label + 'のプロジェクトを作りました: ' + dir); }
        catch (e) { ui.alert(e.message); }
      }

      // ---- ビルド・実行・インストール
      function doBuild() {
        if (!proj || !saveAll(true)) return null;
        const r = S.build(fsx, proj); logAll(r);
        stInfo.textContent = r.ok ? 'ビルド成功' : 'ビルド失敗';
        paintNav();
        return r;
      }
      async function doRun() {
        if (!proj || !saveAll(true)) return;
        const m = proj.meta;
        if (m.type === 'de' && !(await ui.confirm(m.name + ' に切り替えて試します。開いているウインドウは閉じます。\n元に戻すときは、ログアウトしてログイン画面で選ぶか、Terminal で  htui session htui  と打ちます。', { ok: '切り替える', title: 'デスクトップ環境を試す' }))) return;
        const r = S.run(fsx, proj, { launch: m.type === 'app' }); logAll(r);
        paintNav();
        if (!r.ok) { stInfo.textContent = '実行できませんでした'; return; }
        stInfo.textContent = '実行中: ' + m.name;
        if (m.type === 'cmd') OS.htui.run('terminal', { cmd: m.id });
        if (m.type === 'de') setTimeout(() => OS.htui.switchSession(m.id), 300);
      }
      async function doInstall() {
        if (!proj || !saveAll(true)) return;
        const b = S.build(fsx, proj); logAll(b);
        if (!b.ok) return;
        if (!(await ui.confirm(proj.meta.name + '（' + proj.meta.id + '.js）を /apps にインストールします。インストールすると、再起動しても使えます。', { ok: 'インストール', title: 'インストール' }))) return;
        if (!(await ui.asRoot(proj.meta.id + '.js をインストールします。'))) return;
        try { const r = S.install(fsx, proj, 'root'); r.log.slice(-1).forEach(log); OS.notify({ app: 'HTUi Studio', icon: 'box', title: 'インストールしました', body: proj.meta.name }); }
        catch (e) { err(e); }
      }

      win.onClose = async () => {
        if (!Object.keys(dirty).length) return true;
        const r = await ui.modal({ title: 'HTUi Studio', body: [h('p', { class: 'modal-msg' }, '保存していない変更があります。保存しますか?')],
          buttons: [{ label: 'キャンセル', cancel: true, value: 0 }, { label: '保存しない', danger: true, value: 1 }, { label: '保存', primary: true, value: 2 }] });
        if (r === 2) return saveAll(true);
        return r === 1;
      };
      win.onDispose = () => { if (wv) wv.destroy(); };
      paintAll();
      if (typeof arg === 'string' && arg) { const d = S.isProject(fsx, arg) ? arg : path.join(S.projectsDir(user), arg); if (S.isProject(fsx, d)) open(d); }
      log('info', 'HTUi Studio ' + S.version + '（' + OS.htui.sdk.full + '）');
      return win;
    }
  });
})();
