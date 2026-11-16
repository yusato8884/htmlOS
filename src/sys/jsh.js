/* jsh — JS + SHell。入力はJavaScriptとして実行されます。
   先頭がコマンド名で「ls -l /sys」のような形なら、シェル風に ls("-l","/sys") と解釈します。 */
(function () {
  const OS = window.OS, fs0 = OS.fs, path = OS.path, users = OS.users;

  class Listing extends Array {}

  function inspect(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
    if (v instanceof Error) return String(v);
    if (v && typeof v === 'object') {
      if (v.nodeType) return '[Element ' + v.nodeName.toLowerCase() + ']';
      try { return JSON.stringify(v, (k, x) => typeof x === 'function' ? '[Function]' : x, 2); } catch (e) { return String(v); }
    }
    return String(v);
  }
  function splitArgs(s) {
    const out = []; let cur = '', q = null, has = false;
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else cur += ch; }
      else if (ch === '"' || ch === "'") { q = ch; has = true; }
      else if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; }
      else cur += ch;
    }
    if (cur || has) out.push(cur);
    return out;
  }
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const fmtDate = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };

  class Jsh {
    constructor(tty, user, opt) {
      this.tty = tty; this.user = user; this.stack = [];
      this.opt = opt || {};
      this.cwd = fs0.isDir(users.home(user)) ? users.home(user) : '/';
      this.hist = []; this.exited = false;
      this.fs = OS.fsFor(() => this.user);
      this.help = {}; this.cmds = new Set();
      this.env = this.buildEnv();
    }
    get home() { return users.home(this.user); }
    get admin() { const u = users.get(this.user); return !!(u && u.admin); }
    get root() { return users.isRoot(this.user); }
    abs(p) { return path.norm(p == null ? '.' : p, this.cwd, this.home); }
    prompt() {
      let d = this.cwd;
      if (d === this.home) d = '~'; else if (d.startsWith(this.home + '/')) d = '~' + d.slice(this.home.length);
      return this.user + '@htmlos:' + d + (this.root ? '# ' : '$ ');
    }

    async loop() {
      if (this.opt.login) { try { this.tty.print(fs0.read('/etc/motd'), 'dim'); } catch (e) { /* motdなし */ } }
      if (this.opt.cmd) { this.tty.print(this.prompt(), 'prompt'); this.tty.println(this.opt.cmd); await this.exec(this.opt.cmd); }
      while (!this.exited) {
        const line = await this.tty.read(this.prompt(), { history: this.hist, complete: v => this.complete(v) });
        if (this.exited) break;
        await this.exec(line);
      }
    }

    compile(code, exprFirst) {
      const mk = body => new Function('__env', 'with(__env){return (async function(){' + body + '\n}).call(__env)}');
      if (exprFirst) { try { return mk('return (\n' + code + '\n)'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; } }
      return mk(code);
    }

    async exec(line) {
      line = line.trim();
      if (!line) return;
      if (this.hist[this.hist.length - 1] !== line) this.hist.push(line);
      const tty = this.tty;
      try {
        let result;
        const m = line.match(/^([A-Za-z_$][\w$]*)(?:\s+([\s\S]*))?$/);
        const jsLike = /^(\(|\.|\[|=|[+\-*\/%<>&|^?:,]\s|[+\-*\/]=|instanceof\b|in\b)/;
        if (m && this.cmds.has(m[1]) && !(m[2] && jsLike.test(m[2]))) {
          // シェル風: コマンド 引数...  [> ファイル]
          let args = splitArgs(m[2] || ''), redir = null;
          const ri = args.findIndex(a => a === '>' || a === '>>');
          if (ri >= 0) { redir = { append: args[ri] === '>>', file: args[ri + 1] }; args = args.slice(0, ri); if (!redir.file) throw new Error('リダイレクト先のファイル名がありません'); }
          if (redir) tty.capture = [];
          try { result = await this.env[m[1]](...args); }
          finally {
            if (redir) {
              const cap = tty.capture.join(''); tty.capture = null;
              const text = cap + (result === undefined ? '' : this.format(result) + '\n');
              const dest = this.abs(redir.file);
              this.fs.write(dest, (redir.append && this.fs.exists(dest) ? this.fs.read(dest) : '') + text);
              result = undefined;
            }
          }
        } else if (/^(\.\.?\/|\/|~\/)\S+/.test(line) && this.fs.isFile(this.abs(splitArgs(line)[0]))) {
          const a = splitArgs(line);
          result = await this.env.run(...a);
        } else {
          // JavaScript。let/const/var は次の行でも使えるようグローバル代入に読み替える
          let code = line;
          const d = code.match(/^(?:let|const|var)\s+([\s\S]*)$/);
          if (d) { code = d[1]; if (/^[{\[]/.test(code)) code = '(' + code.replace(/;\s*$/, '') + ')'; }
          result = await this.compile(code, true)(this.env);
        }
        if (result !== undefined) this.show(result);
      } catch (e) {
        tty.capture = null;
        tty.println('jsh: ' + (e && e.message ? (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message : String(e)), 'err');
      }
    }

    format(v) { return v instanceof Listing ? v.join('\n') : inspect(v); }
    show(v) {
      const tty = this.tty;
      if (v instanceof Listing) {
        if (!v.length) return;
        v.forEach((n, i) => {
          const dir = fs0.isDir(path.join(v.base, n));
          tty.print(n + (dir ? '/' : ''), dir ? 'dir' : null);
          tty.print(i < v.length - 1 ? '   ' : '\n');
        });
      } else tty.println(inspect(v));
    }

    complete(v) {
      const m = v.match(/^([\s\S]*?)([^\s'"(]*)$/);
      const head = m[1], tok = m[2];
      let cands, prefix;
      if (!head && !tok.includes('/')) { cands = [...this.cmds].filter(n => n.startsWith(tok)).sort(); prefix = ''; }
      else {
        const i = tok.lastIndexOf('/');
        prefix = i >= 0 ? tok.slice(0, i + 1) : '';
        const base = tok.slice(i + 1), dir = this.abs(prefix || '.');
        try { cands = this.fs.list(dir).filter(n => n.startsWith(base)).map(n => n + (fs0.isDir(path.join(dir, n)) ? '/' : '')); } catch (e) { cands = []; }
      }
      if (!cands.length) return null;
      if (cands.length === 1) return head + prefix + cands[0] + (cands[0].endsWith('/') ? '' : ' ');
      let common = cands[0];
      for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
      const nv = head + prefix + common;
      return nv !== v ? nv : cands;
    }

    buildEnv() {
      const self = this, tty = this.tty, fs = this.fs, env = {};
      const def = (name, usage, desc, fn) => { env[name] = fn; self.help[name] = { usage: usage, desc: desc }; self.cmds.add(name); };
      const alias = (name, target) => { env[name] = env[target]; self.cmds.add(name); };
      const needAdmin = () => { if (!self.admin) throw new Error('管理者権限が必要です'); };
      const A = p => self.abs(p);
      const flags = args => ({ f: args.filter(a => typeof a === 'string' && /^-[A-Za-z]+$/.test(a)).join(''), rest: args.filter(a => !(typeof a === 'string' && /^-[A-Za-z]+$/.test(a))) });
      const askNewPw = async () => {
        const a = await tty.read('新しいパスワード: ', { mask: true }), b = await tty.read('もう一度: ', { mask: true });
        if (a !== b) throw new Error('パスワードが一致しません');
        return a;
      };

      env.OS = OS; env.fs = fs; env.tty = tty; env.args = [];

      def('help', 'help [コマンド]', 'コマンド一覧・使い方を表示', name => {
        if (name) { const x = self.help[name]; if (!x) throw new Error(name + ': そのようなコマンドはありません'); return x.usage + '\n  ' + x.desc; }
        tty.println('jsh — 入力はJavaScriptです。「ls -l /sys」のようなシェル風の書き方も使えます。', 'dim');
        tty.println('例: ls("/sys").length   /   for (const f of ls()) echo(f)   /   echo hello > memo.txt', 'dim');
        const names = Object.keys(self.help).sort(), w = Math.max(...names.map(n => self.help[n].usage.length));
        names.forEach(n => { tty.print(self.help[n].usage.padEnd(w + 2), 'accent'); tty.println(self.help[n].desc); });
      });
      def('echo', 'echo テキスト...', 'テキストを表示', (...a) => { tty.println(a.map(x => typeof x === 'string' ? x : inspect(x)).join(' ')); });
      alias('print', 'echo');
      def('clear', 'clear', '画面を消去', () => { tty.clear(); });
      def('pwd', 'pwd', '現在のディレクトリ', () => self.cwd);
      def('cd', 'cd [ディレクトリ]', 'ディレクトリを移動', p => { const d = A(p == null ? '~' : p); if (!fs.isDir(d)) throw new Error(d + ': ディレクトリではありません'); fs.list(d); self.cwd = d; });
      def('ls', 'ls [-l] [パス]', '一覧を表示（JSでは名前の配列を返す）', (...args) => {
        const o = flags(args), p = A(o.rest[0]);
        const st = fs.stat(p);
        if (!st) throw new Error(p + ': そのようなファイルはありません');
        const names = st.t === 'd' ? fs.list(p) : [path.base(p)], base = st.t === 'd' ? p : path.dir(p);
        const shown = o.f.includes('a') ? names : names.filter(n => !n.startsWith('.'));
        if (o.f.includes('l')) {
          return shown.map(n => {
            const s = fs0.stat(path.join(base, n));
            return (s.t === 'd' ? 'd' : '-') + '  ' + String(s.o || 'root').padEnd(10) + (s.t === 'd' ? '-' : fmtSize(s.c.length)).padStart(10) + '  ' + fmtDate(s.m) + '  ' + n + (s.t === 'd' ? '/' : '');
          }).join('\n');
        }
        const l = Listing.from(shown); l.base = base; return l;
      });
      def('cat', 'cat ファイル', 'ファイルの中身（JSでは文字列を返す）', p => { const q = A(p), s = fs.stat(q); if (s && s.b) return '[バイナリ ' + fmtSize(s.c.length) + ']'; return fs.read(q); });
      def('write', 'write ファイル テキスト', 'ファイルに書き込む（上書き）', (p, ...t) => { fs.write(A(p), t.join(' ')); });
      def('append', 'append ファイル テキスト', 'ファイルの末尾に1行追加', (p, ...t) => { const q = A(p); fs.write(q, (fs.exists(q) ? fs.read(q) : '') + t.join(' ') + '\n'); });
      def('touch', 'touch ファイル', '空のファイルを作る', p => { const q = A(p); if (!fs.exists(q)) fs.write(q, ''); });
      def('mkdir', 'mkdir [-p] ディレクトリ', 'ディレクトリを作る', (...args) => { const o = flags(args); o.rest.forEach(p => fs.mkdir(A(p), { parents: o.f.includes('p') })); });
      def('rm', 'rm [-r] パス...', '削除', (...args) => { const o = flags(args); if (!o.rest.length) throw new Error('削除するパスを指定してください'); o.rest.forEach(p => fs.rm(A(p), { recursive: o.f.includes('r') })); });
      def('cp', 'cp コピー元 コピー先', 'コピー（ディレクトリも可）', (a, b) => { if (a == null || b == null) throw new Error('cp コピー元 コピー先'); fs.cp(A(a), A(b)); });
      def('mv', 'mv 移動元 移動先', '移動・名前変更', (a, b) => { if (a == null || b == null) throw new Error('mv 移動元 移動先'); fs.mv(A(a), A(b)); });
      def('stat', 'stat パス', 'ファイル情報', p => { const q = A(p), s = fs.stat(q); if (!s) throw new Error(q + ': そのようなファイルはありません'); return { path: q, type: s.t === 'd' ? 'directory' : 'file', owner: s.o, size: s.t === 'f' ? s.c.length : undefined, binary: !!s.b, modified: fmtDate(s.m) }; });
      def('grep', 'grep パターン ファイル', '一致する行を表示', (pat, p) => { const re = pat instanceof RegExp ? pat : new RegExp(pat); return fs.read(A(p)).split('\n').filter(l => re.test(l)).join('\n') || undefined; });
      def('df', 'df', 'ストレージ使用量', () => { const u = fs.usage(); return '使用 ' + fmtSize(u.used) + ' / 約 ' + fmtSize(u.total) + '（' + Math.round(u.used / u.total * 100) + '%）' + (OS.store.ram ? ' [RAMディスク]' : ' [LocalStorage]'); });
      def('wget', 'wget URL [保存先]', 'URLをhFSにダウンロード', async (url, dest) => {
        if (!url) throw new Error('URLを指定してください');
        let name = 'download'; try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'index.html'; } catch (e) { throw new Error('URLが正しくありません'); }
        const d = dest ? A(dest) : path.join(self.cwd, name);
        const r = await OS.net.download(url, fs.isDir(d) ? path.join(d, name) : d, fs);
        return '保存しました: ' + r.path + '（' + fmtSize(r.size) + '）';
      });

      def('whoami', 'whoami', '現在のユーザー名', () => self.user);
      def('users', 'users', 'ユーザー一覧', () => users.list().map(u => u.name + (u.root ? ' (スーパーユーザー' + (u.pw ? '' : '・パスワード未設定') + ')' : u.admin ? ' (管理者)' : '')).join('\n'));
      def('su', 'su [ユーザー名]', 'ユーザーを切り替える。省略すると root（exitで戻る）', async name => {
        name = name || 'root';
        const t = users.get(name);
        if (!t) throw new Error(name + ': そのようなユーザーはいません');
        if (!self.root) {
          if (!t.pw) throw new Error(name + ' のパスワードが未設定です。' + (name === 'root' ? '管理者が「passwd root」で設定してください' : ''));
          if (!(await users.verify(name, await tty.read('Password: ', { mask: true })))) throw new Error('認証に失敗しました');
        }
        self.stack.push({ user: self.user, cwd: self.cwd });
        self.user = name; self.cwd = users.home(name);
      });
      def('passwd', 'passwd [ユーザー名]', 'パスワードを変更', async name => {
        const t = name || self.user;
        if (!users.get(t)) throw new Error(t + ': そのようなユーザーはいません');
        if (t !== self.user) {
          if (!self.root) {
            needAdmin();
            if (users.isRoot(t) && users.get(t).pw && !(await users.verify(t, await tty.read('root の現在のパスワード: ', { mask: true })))) throw new Error('認証に失敗しました');
          }
        }
        else if (users.get(t).pw && !(await users.verify(t, await tty.read('現在のパスワード: ', { mask: true })))) throw new Error('認証に失敗しました');
        await users.setPassword(t, await askNewPw());
        return t + ' のパスワードを変更しました';
      });
      def('useradd', 'useradd ユーザー名 [admin]', 'ユーザーを追加（管理者のみ）', async (name, role) => {
        needAdmin(); if (!name) throw new Error('ユーザー名を指定してください');
        if (users.get(name)) throw new Error(name + ': すでに存在するユーザーです');
        await users.add(name, await askNewPw(), role === 'admin' || role === true);
        return name + ' を追加しました';
      });
      def('userdel', 'userdel ユーザー名', 'ユーザーとホームを削除（管理者のみ）', async name => {
        needAdmin(); if (!name) throw new Error('ユーザー名を指定してください');
        if (name === self.user) throw new Error('ログイン中の自分は削除できません');
        if ((await tty.read(name + ' とそのホームを削除しますか? [y/N] ')).trim().toLowerCase() !== 'y') return '中止しました';
        users.remove(name); return name + ' を削除しました';
      });
      def('exit', 'exit', 'シェルを終了（suから戻る / ログアウト）', () => {
        const prev = self.stack.pop();
        if (prev) { self.user = prev.user; self.cwd = prev.cwd; } else self.exited = true;
      });
      alias('logout', 'exit');

      def('run', 'run スクリプト [引数...]', 'jshスクリプト(.js)を実行。引数は args で受け取る', async (p, ...a) => {
        const code = fs.read(A(p)), old = env.args;
        env.args = a;
        try { return await self.compile(code, false)(env); } finally { env.args = old; }
      });
      def('sleep', 'sleep ミリ秒', '指定時間待つ（await sleep(500)）', ms => new Promise(r => setTimeout(r, Number(ms) || 0)));
      def('read', 'read [プロンプト]', '1行入力を受け取る（await read("? ")）', p => tty.read(p == null ? '' : String(p)));
      def('history', 'history', '入力履歴', () => self.hist.map((l, i) => String(i + 1).padStart(4) + '  ' + l).join('\n'));
      def('date', 'date', '現在の日時', () => new Date().toLocaleString('ja-JP'));
      def('uname', 'uname', 'システム情報', () => 'htmlOS ' + OS.version + ' (' + (OS.store.ram ? 'ramdisk' : 'localstorage') + ') ' + navigator.userAgent);
      def('neofetch', 'neofetch', 'システム情報をそれっぽく表示', () => {
        const u = fs.usage(), art = ['  <  / >  ', ' <  /  > ', '<  /   >', ' <  /  > ', '  <  / >  ', '          '];
        const info = [self.user + '@htmlos', '-'.repeat((self.user + '@htmlos').length), 'OS: htmlOS ' + OS.version, 'Shell: jsh', 'DE: HTUi (' + (OS.htui.running ? '起動中' : '停止中') + ')', 'Disk: ' + fmtSize(u.used) + ' / ' + fmtSize(u.total) + (OS.store.ram ? ' (RAM)' : ' (LocalStorage)')];
        art.forEach((a, i) => { tty.print(a + '  ', 'accent'); tty.println(info[i] || ''); });
      });

      const htui = (sub, arg) => {
        sub = sub || 'status';
        if (sub === 'mode') {
          if (arg == null) return '画面モード: ' + OS.modeNames[OS.modePref] + '（今は ' + OS.modeNames[OS.uiMode] + '）';
          if (!OS.modeNames[arg]) throw new Error('htui mode auto | desktop | tablet | phone');
          if (OS.htui.running && OS.htui.user) OS.htui.setPrefs({ mode: arg }); else OS.setMode(arg);
          return '画面モード: ' + OS.modeNames[arg] + (arg === 'auto' ? '（' + OS.modeNames[OS.uiMode] + '）' : '');
        }
        if (sub === 'sessions') return Object.values(OS.sessions).map(s => s.id.padEnd(7) + s.name + (OS.htui.sessionId === s.id ? '  ← 使用中' : '')).join('\n');
        if (sub === 'start') {
          if (arg != null && !OS.sessions[arg]) throw new Error(arg + ': そのようなデスクトップ環境はありません（htui sessions で一覧）');
          if (!OS.htui.start(self.user, arg)) throw new Error('HTUi はすでに起動しています');
          return;
        }
        if (sub === 'session') {
          if (arg == null) return OS.htui.sessionId ? 'デスクトップ環境: ' + OS.sessions[OS.htui.sessionId].name : '既定のデスクトップ環境: ' + OS.sessions[OS.hdm.sessionFor(self.user)].name;
          if (!OS.sessions[arg]) throw new Error(arg + ': そのようなデスクトップ環境はありません（htui sessions で一覧）');
          OS.hdm.setUserSession(self.user, arg);
          if (OS.htui.running && OS.htui.user === self.user) { setTimeout(() => OS.htui.switchSession(arg), 0); return OS.sessions[arg].name + ' に切り替えます'; }
          return '次回から ' + OS.sessions[arg].name + ' で起動します';
        }
        if (sub === 'stop') { if (!OS.htui.running) throw new Error('HTUi は起動していません'); setTimeout(() => OS.htui.stop(true), 0); return; }
        if (sub === 'status') return 'HTUi: ' + (OS.htui.running ? '起動中' + (OS.htui.user ? '（' + OS.htui.user + ' ・ ' + OS.sessions[OS.htui.sessionId].name + '）' : '（ログイン画面 hdm）') : '停止中');
        throw new Error('htui start [環境] | stop | status | sessions | session [環境] | mode [auto|desktop|tablet|phone]');
      };
      htui.start = () => htui('start'); htui.stop = () => htui('stop'); htui.status = () => htui('status');
      def('htui', 'htui start [環境]|stop|status|sessions|session [環境]|mode', 'HTUiの起動・終了、デスクトップ環境と画面モードの切替', htui);
      def('startx', 'startx [環境]', 'htui start と同じ', s => htui('start', s));
      def('hdm', 'hdm', 'ログイン画面（hdm）を出して HTUi を起動', () => { if (!OS.htui.start()) throw new Error('HTUi はすでに起動しています'); });
      def('ps', 'ps', 'HTUi上のウィンドウ一覧', () => !OS.htui.running ? 'HTUi は起動していません' : ['  PID  APP        TITLE'].concat(OS.htui.wins.map(w => String(w.pid).padStart(5) + '  ' + String(w.app || '-').padEnd(9) + '  ' + w.title)).join('\n'));
      def('kill', 'kill PID', 'ウィンドウを強制終了', pid => { const w = OS.htui.wins.find(x => x.pid === Number(pid)); if (!w) throw new Error(pid + ': そのようなPIDはありません'); w.close(true); });
      def('open', 'open パス', '関連付けられたアプリで開く（HTUiが必要）', p => { const q = A(p); if (fs.isDir(q)) OS.launch('hfile', q); else { fs.read(q); OS.openFile(q); } });
      def('hedit', 'hedit [ファイル]', 'テキストエディター', p => { OS.launch('hedit', p == null ? null : A(p)); });
      alias('edit', 'hedit');
      def('hfile', 'hfile [ディレクトリ]', 'ファイルブラウザー', p => { OS.launch('hfile', A(p)); });
      def('hplayer', 'hplayer [ファイル]', 'メディアプレーヤー', p => { OS.launch('hplayer', p == null ? null : A(p)); });
      def('hbrowser', 'hbrowser [URL]', 'webブラウザー', u => { OS.launch('hbrowser', u || null); });
      def('terminal', 'terminal', '新しいTerminalを開く', () => { OS.launch('terminal'); });
      def('settings', 'settings', '設定アプリ', () => { OS.launch('settings'); });

      def('htask', 'htask', 'タスクマネージャ', () => { OS.launch('htask'); });
      def('hcalc', 'hcalc', '電卓', () => { OS.launch('hcalc'); });
      def('hpaint', 'hpaint [画像]', 'お絵かき', p => { OS.launch('hpaint', p == null ? null : A(p)); });
      def('hstore', 'hstore', 'パッケージマネージャ', () => { OS.launch('hstore'); });
      def('hbackup', 'hbackup', 'バックアップ', () => { OS.launch('hbackup'); });
      def('hserial', 'hserial', 'シリアルモニター', () => { OS.launch('hserial'); });
      def('apps', 'apps', 'アプリ一覧（ID）', () => Object.values(OS.apps).map(a => a.id.padEnd(12) + a.name + (a.pkg ? '  [' + a.pkg + ']' : '')).join('\n'));
      def('launch', 'launch アプリID [引数]', 'アプリを起動', (id, arg) => { if (!id) throw new Error('アプリIDを指定してください（apps で一覧）'); OS.launch(id, arg); });
      def('pkg', 'pkg list|install|remove', 'パッケージ管理: pkg install ファイルかURL / pkg remove 名前.js', async (sub, target) => {
        if (!sub || sub === 'list') { const l = OS.pkg.list(); return l.length ? l.join('\n') : 'パッケージは入っていません'; }
        if (!target) throw new Error('pkg ' + sub + ' の対象を指定してください');
        if (sub === 'install') {
          let code, name;
          if (/^https?:\/\//.test(target)) { code = await (await OS.net.get(target)).text(); name = decodeURIComponent(new URL(target).pathname.split('/').pop()) || 'package.js'; }
          else { code = fs.read(A(target)); name = path.base(A(target)); }
          return 'インストールしました: ' + OS.pkg.install(name, code, self.user);
        }
        if (sub === 'remove') { OS.pkg.remove(target.endsWith('.js') ? target : target + '.js', self.user); return '削除しました: ' + target; }
        throw new Error('pkg list | install ファイルかURL | remove 名前');
      });

      def('bootmode', 'bootmode [gui|cui]', '既定の起動モードを表示・変更', m => {
        if (m == null) return OS.config.get('bootMode', 'gui');
        needAdmin(); if (m !== 'gui' && m !== 'cui') throw new Error('gui か cui を指定してください');
        OS.config.set('bootMode', m); return '既定の起動モード: ' + m;
      });
      def('reboot', 'reboot', '再起動', () => { OS.reboot(); });
      def('poweroff', 'poweroff', '電源を切る', () => { OS.poweroff(); });
      alias('shutdown', 'poweroff');
      def('reinstall', 'reinstall', '全消去して再インストール（管理者のみ）', async () => {
        needAdmin();
        if ((await tty.read('全ユーザー・全ファイルが消えます。続けるには yes と入力: ')).trim() !== 'yes') return '中止しました';
        OS.reboot('reinstall');
      });
      return env;
    }
  }
  OS.Jsh = Jsh;
})();
