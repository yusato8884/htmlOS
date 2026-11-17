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

  // man で出す詳しい説明と例（help にある書式・説明に足す）
  const MAN = {
    ls: { d: '-l で詳しく（種類・持ち主・大きさ・日時）、-a で . から始まる隠しファイルも表示します。\nシンボリックリンクは -l のとき「名前 -> リンク先」と表示します。', e: ['ls -l /sys', 'ls -a ~', 'ls("/sys").length'] },
    grep: { d: 'パターンは JavaScript の正規表現です。ファイルを指定しないときは、パイプで渡された文字から探します。', e: ['grep error log.txt', 'cat /etc/passwd | grep root', 'ls -l | grep ".js"'] },
    head: { e: ['head -n 3 memo.txt', 'ls -l /sys/apps | head -5'] },
    tail: { e: ['tail -n 20 log.txt', 'history | tail -5'] },
    wc: { d: '何も指定しないと「行数 単語数 文字数」の順に出します。', e: ['wc memo.txt', 'ls /sys/apps | wc -l'] },
    sort: { e: ['sort names.txt', 'cat scores.txt | sort -n -r', 'cat list.txt | sort -u'] },
    uniq: { d: '続けて並んでいる同じ行だけをまとめます。全体で重複を消すときは、先に sort します。', e: ['cat list.txt | sort | uniq -c'] },
    cut: { d: '-f の列番号は 1 から数えます。1,3 や 2-4 のように書けます。-d を省くと区切りはタブです。', e: ['cut -d , -f 1,3 data.csv', 'cat /etc/passwd | cut -c 1-20'] },
    tr: { d: 'a-z のような範囲も書けます。パイプで渡した文字に使います。', e: ['echo hello | tr a-z A-Z', 'cat memo.txt | tr -d " "'] },
    tee: { e: ['ls -l | tee list.txt', 'echo 追加 | tee -a memo.txt'] },
    diff: { e: ['diff old.txt new.txt'] },
    find: { d: '-name のパターンでは * と ? が使えます（大文字小文字は区別しません）。-type は f（ファイル）・d（ディレクトリ）・l（リンク）。', e: ['find ~ -name "*.txt"', 'find /sys -type d'] },
    tree: { e: ['tree ~', 'tree /sys'] },
    du: { e: ['du ~', 'du -s /sys'] },
    ln: { d: 'htmlOS のファイルシステムはハードリンクを持たないので、-s（シンボリックリンク）だけ使えます。\nリンクを通した読み書きも、リンク先の場所の許可で判断します。', e: ['ln -s /sys/apps apps', 'ln -s ~/Documents/memo.txt ~/Desktop/memo'] },
    file: { e: ['file /sys/kernel.js', 'file ~/*'] },
    free: { d: 'JS ヒープはブラウザがこのページに使わせるメモリです（Chrome などだけが教えてくれます）。' },
    hostname: { d: '名前はプロンプト（ユーザー@名前）にも出ます。/etc/config.json に保存されます。', e: ['hostname', 'hostname my-pc'] },
    alias: { d: 'エイリアスはこのシェルの中だけで使えます。毎回使いたいときは ~/.jshrc に書いておくと、起動時に読み込みます。', e: ['alias ll="ls -l"', 'alias'] },
    export: { d: 'シェル風の書き方の中では $名前 や ${名前} が値に置き換わります（\' \' で囲むと置き換えません）。', e: ['export NAME=htmlOS', 'echo こんにちは $NAME', 'echo $HOME'] },
    top: { d: 'HTUi で開いているウィンドウ（プロセス）の一覧を 1 秒ごとに書き直します。' }
  };

  class Jsh {
    constructor(tty, user, opt) {
      this.tty = tty; this.user = user; this.stack = [];
      this.opt = opt || {};
      this.cwd = fs0.isDir(users.home(user)) ? users.home(user) : '/';
      this.hist = []; this.exited = false;
      this.fs = OS.fsFor(() => this.user);
      this.help = {}; this.cmds = new Set();
      this.vars = { SHELL: '/bin/jsh', LANG: 'ja_JP.UTF-8', TERM: 'htmlos-tty', PATH: '/bin' };
      this.aliases = { ll: 'ls -l', la: 'ls -a' };
      this.stdin = null;
      this.env = this.buildEnv();
      Object.keys(this.aliases).forEach(n => this.cmds.add(n));
    }
    get home() { return users.home(this.user); }
    get admin() { const u = users.get(this.user); return !!(u && u.admin); }
    get root() { return users.isRoot(this.user); }
    abs(p) { return path.norm(p == null ? '.' : p, this.cwd, this.home); }
    prompt() {
      let d = this.cwd;
      if (d === this.home) d = '~'; else if (d.startsWith(this.home + '/')) d = '~' + d.slice(this.home.length);
      return this.user + '@' + OS.hostname() + ':' + d + (this.root ? '# ' : '$ ');
    }

    async loop() {
      if (this.opt.login) { try { this.tty.print(fs0.read('/etc/motd'), 'dim'); } catch (e) { /* motdなし */ } }
      // ~/.jshrc があれば、1 行ずつ実行する（エイリアスや環境変数の設定を書いておける）
      try {
        const rc = this.fs.read(this.home + '/.jshrc');
        for (const l of rc.split('\n')) { const t = l.trim(); if (t && !t.startsWith('#')) await this.exec(t, true); }
      } catch (e) { /* なければ何もしない */ }
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

    // 環境変数（USER・HOME・PWD・HOSTNAME はいつも今の値）
    allVars() { return Object.assign({}, this.vars, { USER: this.user, HOME: this.home, PWD: this.cwd, HOSTNAME: OS.hostname() }); }
    // $名前 / ${名前} を値に置き換える。' ' の中は置き換えない
    expand(str) {
      const v = this.allVars(); let out = '', q = null;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
        if (ch === "'" && !q) { q = "'"; out += ch; continue; }
        if (ch === '"') { q = q === '"' ? null : '"'; out += ch; continue; }
        if (ch === '$') {
          const m = str.slice(i + 1).match(/^\{([A-Za-z_]\w*)\}|^([A-Za-z_]\w*)/);
          if (m) { const n = m[1] || m[2]; out += v[n] != null ? v[n] : ''; i += m[0].length; continue; }
        }
        out += ch;
      }
      return out;
    }
    // シェル風の行なら、パイプ「|」で区切ったコマンドの並びを返す。JavaScript として読むべき行なら null
    pipeline(line) {
      const parts = []; let cur = '', q = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === q) q = null; cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '|' && line[i + 1] !== '|' && line[i - 1] !== '|') { parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      const jsLike = /^(\(|\.|\[|=|[+\-*\/%<>&|^?:,]\s|[+\-*\/]=|instanceof\b|in\b)/;
      const segs = [];
      for (let seg of parts) {
        let m = seg.match(/^([A-Za-z_$][\w$-]*)(?:\s+([\s\S]*))?$/);
        if (m && this.aliases[m[1]]) { seg = this.aliases[m[1]] + (m[2] ? ' ' + m[2] : ''); m = seg.match(/^([A-Za-z_$][\w$-]*)(?:\s+([\s\S]*))?$/); }
        if (!m || !this.cmds.has(m[1]) || !this.env[m[1]] || (m[2] && jsLike.test(m[2]))) return null;
        segs.push({ name: m[1], rest: m[2] || '' });
      }
      return segs;
    }

    async exec(line, quiet) {
      line = line.trim();
      if (!line) return;
      if (!quiet && this.hist[this.hist.length - 1] !== line) this.hist.push(line);
      const tty = this.tty;
      try {
        let result;
        const segs = this.pipeline(line);
        if (segs) {
          // シェル風: コマンド 引数... [| コマンド 引数...] [> ファイル]。前のコマンドの出力は次のコマンドの入力（stdin）になる
          let data = null;
          for (let i = 0; i < segs.length; i++) {
            const sg = segs[i], last = i === segs.length - 1;
            let args = splitArgs(this.expand(sg.rest)), redir = null;
            if (last) {
              const ri = args.findIndex(a => a === '>' || a === '>>');
              if (ri >= 0) { redir = { append: args[ri] === '>>', file: args[ri + 1] }; args = args.slice(0, ri); if (!redir.file) throw new Error('リダイレクト先のファイル名がありません'); }
            }
            const cap = !last || !!redir;
            if (cap) tty.capture = [];
            this.stdin = data; result = undefined;
            try { result = await this.env[sg.name](...args); }
            finally {
              this.stdin = null;
              if (cap) { const c = tty.capture ? tty.capture.join('') : ''; tty.capture = null; const f = result === undefined ? '' : this.format(result); data = c + f + (f && !f.endsWith('\n') ? '\n' : ''); }
            }
            if (cap) result = undefined;
            if (redir) { const dest = this.abs(redir.file); this.fs.write(dest, (redir.append && this.fs.exists(dest) ? this.fs.read(dest) : '') + data); }
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
        tty.capture = null; this.stdin = null;
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
            const q = path.join(base, n), ls = fs0.lstat(q);
            if (ls && ls.t === 'l') return 'l  ' + String(ls.o || 'root').padEnd(10) + '-'.padStart(10) + '  ' + fmtDate(ls.m) + '  ' + n + ' -> ' + ls.c;
            const s = fs0.stat(q) || { t: 'f', c: '', m: 0 };
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
        const who = self.user + '@' + OS.hostname(), de = OS.htui.running && OS.htui.sessionId ? OS.sessions[OS.htui.sessionId].name : 'なし（CUI）';
        const info = [who, '-'.repeat(who.length), 'OS: htmlOS ' + OS.version + (OS.live ? ' (Live)' : ''), 'Shell: jsh', 'DE: ' + de, 'Disk: ' + fmtSize(u.used) + ' / ' + fmtSize(u.total) + (OS.store.ram ? ' (RAM)' : ' (LocalStorage)')];
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

      def('notify', 'notify タイトル [本文]', 'HTUi に通知を出す', (title, ...body) => {
        if (!OS.htui.running || !OS.htui.user) throw new Error('HTUi にログインしているときだけ使えます');
        if (!title) throw new Error('タイトルを指定してください');
        OS.notify({ app: 'jsh', icon: 'terminal', title: String(title), body: body.join(' ') });
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

      // ======== テキスト処理（ファイルを指定しないときはパイプ「|」で渡された文字を読む）
      // 引数の読み取り: -n 5 / -n5 / -5（数字だけなら n）/ -rn のようなまとめ書き。takes に入っている文字は値をとる
      const getopts = (args, takes) => {
        const o = {}, rest = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (typeof a !== 'string' || !/^-./.test(a) || a === '-') { rest.push(a); continue; }
          if (/^-\d+$/.test(a)) { o.n = a.slice(1); continue; }
          for (let j = 1; j < a.length; j++) {
            const c = a[j];
            if ((takes || '').includes(c)) { o[c] = a.slice(j + 1) || args[++i]; break; }
            o[c] = true;
          }
        }
        return { o, rest };
      };
      const input = files => {
        if (files.length) return files.map(f => { const q = A(f), st = fs.stat(q); if (!st) throw new Error(q + ': そのようなファイルはありません'); if (st.t === 'd') throw new Error(q + ': ディレクトリです'); return st.c; }).join('');
        if (self.stdin != null) return self.stdin;
        throw new Error('ファイルを指定するか、パイプ（|）で渡してください');
      };
      const lines = t => { const l = String(t).split('\n'); if (l.length && l[l.length - 1] === '') l.pop(); return l; };
      const out = l => l.join('\n');
      def('head', 'head [-n 行数] [ファイル...]', '先頭の行を表示（既定 10 行）', (...a) => { const g = getopts(a, 'n'); return out(lines(input(g.rest)).slice(0, Number(g.o.n || 10))); });
      def('tail', 'tail [-n 行数] [ファイル...]', '末尾の行を表示（既定 10 行）', (...a) => { const g = getopts(a, 'n'), n = Number(g.o.n || 10); const l = lines(input(g.rest)); return out(n ? l.slice(-n) : []); });
      def('wc', 'wc [-l] [-w] [-c] [ファイル...]', '行数・単語数・文字数を数える', (...a) => {
        const g = getopts(a), t = input(g.rest), n = { l: lines(t).length, w: (t.match(/\S+/g) || []).length, c: [...t].length };
        const pick = ['l', 'w', 'c'].filter(k => g.o[k]);
        return (pick.length ? pick : ['l', 'w', 'c']).map(k => String(n[k]).padStart(7)).join(' ') + (g.rest.length === 1 ? ' ' + g.rest[0] : '');
      });
      def('sort', 'sort [-r] [-n] [-u] [ファイル...]', '行を並べ替える（-r 逆順 / -n 数値 / -u 重複を除く）', (...a) => {
        const g = getopts(a); let l = lines(input(g.rest));
        l.sort(g.o.n ? (x, y) => (parseFloat(x) || 0) - (parseFloat(y) || 0) : (x, y) => x.localeCompare(y, 'ja'));
        if (g.o.r) l.reverse();
        if (g.o.u) l = l.filter((x, i) => i === 0 || x !== l[i - 1]);
        return out(l);
      });
      def('uniq', 'uniq [-c] [ファイル...]', '続けて同じ行を 1 行にまとめる（-c で回数も）', (...a) => {
        const g = getopts(a), res = [];
        lines(input(g.rest)).forEach(x => { const last = res[res.length - 1]; if (last && last.t === x) last.n++; else res.push({ t: x, n: 1 }); });
        return out(res.map(r => g.o.c ? String(r.n).padStart(7) + ' ' + r.t : r.t));
      });
      const ranges = spec => String(spec || '').split(',').map(r => { const m = r.match(/^(\d*)-(\d*)$/); return m ? [Number(m[1] || 1), m[2] ? Number(m[2]) : Infinity] : [Number(r), Number(r)]; });
      const inRanges = (rs, i) => rs.some(r => i >= r[0] && i <= r[1]);
      def('cut', 'cut -d 区切り -f 列 | -c 文字 [ファイル...]', '各行の一部を取り出す（例: cut -d , -f 1,3）', (...a) => {
        const g = getopts(a, 'dfc'), l = lines(input(g.rest));
        if (g.o.c) { const rs = ranges(g.o.c); return out(l.map(x => [...x].filter((ch, i) => inRanges(rs, i + 1)).join(''))); }
        if (!g.o.f) throw new Error('-f（列）か -c（文字の位置）を指定してください');
        const d = g.o.d == null ? '\t' : g.o.d, rs = ranges(g.o.f);
        return out(l.map(x => x.includes(d) ? x.split(d).filter((c, i) => inRanges(rs, i + 1)).join(d) : x));
      });
      const expandSet = s => { s = String(s).replace(/\\n/g, '\n').replace(/\\t/g, '\t'); const r = []; const c = [...s]; for (let i = 0; i < c.length; i++) { if (c[i + 1] === '-' && c[i + 2]) { for (let k = c[i].codePointAt(0); k <= c[i + 2].codePointAt(0); k++) r.push(String.fromCodePoint(k)); i += 2; } else r.push(c[i]); } return r; };
      def('tr', 'tr [-d] 文字の集合1 [集合2]', '文字を置き換える・消す（例: tr a-z A-Z / tr -d " "）', (...a) => {
        const g = getopts(a), set1 = expandSet(g.rest[0] == null ? '' : g.rest[0]), t = input([]);
        if (g.o.d) return [...t].filter(ch => !set1.includes(ch)).join('').replace(/\n$/, '');
        const set2 = expandSet(g.rest[1] == null ? '' : g.rest[1]);
        if (!set2.length) throw new Error('置き換え先の文字（集合2）を指定してください');
        return [...t].map(ch => { const i = set1.indexOf(ch); return i < 0 ? ch : set2[Math.min(i, set2.length - 1)]; }).join('').replace(/\n$/, '');
      });
      def('nl', 'nl [ファイル...]', '行番号をつけて表示（空の行には番号をつけない）', (...a) => { let n = 0; return out(lines(input(a)).map(x => x.trim() ? String(++n).padStart(6) + '\t' + x : '')); });
      def('rev', 'rev [ファイル...]', '各行の文字を逆順にする', (...a) => out(lines(input(a)).map(x => [...x].reverse().join(''))));
      def('tee', 'tee [-a] ファイル...', '受け取った文字をファイルに書きつつ、そのまま表示する（-a で追記）', (...a) => {
        const g = getopts(a), t = input([]);
        g.rest.forEach(f => { const q = A(f); fs.write(q, (g.o.a && fs.exists(q) ? fs.read(q) : '') + t); });
        return t.replace(/\n$/, '');
      });
      def('diff', 'diff ファイル1 ファイル2', '2 つのファイルの違いを行ごとに表示（- が消えた行、+ が増えた行）', (f1, f2) => {
        if (f1 == null || f2 == null) throw new Error('diff ファイル1 ファイル2');
        const x = lines(fs.read(A(f1))), y = lines(fs.read(A(f2)));
        if (x.length * y.length > 4e6) throw new Error('ファイルが大きすぎます');
        const L = Array.from({ length: x.length + 1 }, () => new Int32Array(y.length + 1));
        for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const res = []; let i = 0, j = 0, changed = false;
        while (i < x.length || j < y.length) {
          if (i < x.length && j < y.length && x[i] === y[j]) { res.push('  ' + x[i]); i++; j++; }
          else if (j < y.length && (i >= x.length || L[i][j + 1] >= L[i + 1][j])) { res.push(['+ ' + y[j], 'add']); j++; changed = true; }
          else { res.push(['- ' + x[i], 'del']); i++; changed = true; }
        }
        if (!changed) return '違いはありません';
        tty.println('--- ' + A(f1), 'dim'); tty.println('+++ ' + A(f2), 'dim');
        res.forEach(r => Array.isArray(r) ? tty.println(r[0], r[1] === 'add' ? 'ok' : 'err') : tty.println(r));
      });
      env.grep = (pat, ...files) => {
        const re = pat instanceof RegExp ? pat : new RegExp(pat);
        return lines(input(files)).filter(l => re.test(l)).join('\n') || undefined;
      };
      self.help.grep = { usage: 'grep パターン [ファイル...]', desc: '一致する行を表示（パイプでも使える）' };

      // ======== ファイル操作
      const walk = (p, fn, depth) => {
        fn(p, depth || 0);
        if (fs.isDir(p) && !fs.isLink(p)) fs.list(p).forEach(n => walk(path.join(p, n), fn, (depth || 0) + 1));
      };
      const glob = g => new RegExp('^' + String(g).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      def('find', 'find [パス] [-name パターン] [-type f|d|l]', 'ファイルを探す（例: find ~ -name "*.txt"）', (...a) => {
        const g = getopts(a.map(x => x === '-name' ? '-N' : x === '-type' ? '-T' : x), 'NT');
        const base = A(g.rest[0] || '.'), re = g.o.N ? glob(g.o.N) : null, res = [];
        if (!fs.exists(base) && !fs.isLink(base)) throw new Error(base + ': そのようなファイルはありません');
        walk(base, p => {
          const t = fs.isLink(p) ? 'l' : fs.isDir(p) ? 'd' : 'f';
          if (g.o.T && g.o.T !== t) return;
          if (re && !re.test(path.base(p))) return;
          res.push(p);
        });
        return res.join('\n') || undefined;
      });
      def('tree', 'tree [パス]', 'ディレクトリの中身を木の形で表示', p => {
        const base = A(p); if (!fs.isDir(base)) throw new Error(base + ': ディレクトリではありません');
        let dirs = 0, files = 0; const res = [base];
        const rec = (d, pre) => {
          const names = fs.list(d).filter(n => !n.startsWith('.'));
          names.forEach((n, i) => {
            const q = path.join(d, n), last = i === names.length - 1, link = fs.isLink(q);
            const isd = !link && fs.isDir(q);
            res.push(pre + (last ? '└── ' : '├── ') + n + (link ? ' -> ' + fs.readlink(q) : isd ? '/' : ''));
            if (isd) { dirs++; rec(q, pre + (last ? '    ' : '│   ')); } else files++;
          });
        };
        rec(base, '');
        return res.join('\n') + '\n\n' + dirs + ' 個のディレクトリ、' + files + ' 個のファイル';
      });
      const sizeOf = p => { let n = 0; walk(p, q => { const s = fs.lstat(q); if (s && s.t === 'f') n += s.c.length; }); return n; };
      def('du', 'du [-s] [パス]', 'ディレクトリごとの使用量（-s で合計だけ）', (...a) => {
        const g = getopts(a), base = A(g.rest[0] || '.');
        if (g.o.s || !fs.isDir(base)) return fmtSize(sizeOf(base)).padStart(10) + '  ' + base;
        const res = [];
        walk(base, p => { if (fs.isDir(p) && !fs.isLink(p)) res.push(fmtSize(sizeOf(p)).padStart(10) + '  ' + p); });
        return res.join('\n');
      });
      def('basename', 'basename パス [取り除く拡張子]', 'パスからファイル名だけを取り出す', (p, suf) => { if (p == null) throw new Error('パスを指定してください'); let b = path.base(String(p).replace(/\/+$/, '')) || '/'; if (suf && b.endsWith(suf) && b !== suf) b = b.slice(0, -suf.length); return b; });
      def('dirname', 'dirname パス', 'パスからディレクトリの部分を取り出す', p => { if (p == null) throw new Error('パスを指定してください'); const s = String(p).replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i); });
      def('ln', 'ln -s リンク先 リンク名', 'シンボリックリンクを作る', (...a) => {
        const g = getopts(a);
        if (!g.o.s) throw new Error('ハードリンクには対応していません。-s を付けてシンボリックリンクにしてください');
        const [target, name] = g.rest; if (target == null) throw new Error('ln -s リンク先 リンク名');
        let dst = A(name == null ? path.base(String(target)) : name);
        if (fs.isDir(dst) && !fs.isLink(dst)) dst = path.join(dst, path.base(String(target)));
        fs.symlink(String(target), dst);
      });
      def('readlink', 'readlink リンク', 'シンボリックリンクのリンク先を表示', p => fs.readlink(A(p)));
      def('file', 'file パス...', 'ファイルの種類を調べる', (...ps) => {
        if (!ps.length) throw new Error('パスを指定してください');
        return ps.map(p => {
          const q = A(p), ls = fs.lstat(q);
          if (!ls) return p + ': そのようなファイルはありません';
          if (ls.t === 'l') return p + ': シンボリックリンク → ' + ls.c + (fs.exists(q) ? '' : '（リンク先がありません）');
          if (ls.t === 'd') return p + ': ディレクトリ';
          if (ls.b) { const m = String(ls.c).match(/^data:([^;,]+)/); return p + ': バイナリ（' + (m ? m[1] : '不明') + '）' + fmtSize(ls.c.length); }
          const c = ls.c;
          if (!c.length) return p + ': 空のファイル';
          let kind = 'テキスト';
          if (/^\s*[{\[]/.test(c)) { try { JSON.parse(c); kind = 'JSON データ'; } catch (e) { /* JSON ではない */ } }
          if (kind === 'テキスト') {
            if (/^\s*<!doctype html|^\s*<html/i.test(c)) kind = 'HTML 文書';
            else if (/^\s*<svg[\s>]/i.test(c) || /^\s*<\?xml[^>]*>\s*<svg/i.test(c)) kind = 'SVG 画像';
            else if (/^#!.*\b(sh|bash)\b/.test(c)) kind = 'シェルスクリプト';
            else if (path.ext(q) === 'js' || /^\s*(\/\/|\/\*|function\b|const\b|let\b|import\b)/.test(c)) kind = 'JavaScript';
            else if (path.ext(q) === 'md') kind = 'Markdown';
            else if (path.ext(q) === 'csv') kind = 'CSV';
          }
          return p + ': ' + kind + '、' + lines(c).length + ' 行、' + ([...c].every(ch => ch.charCodeAt(0) < 128) ? 'ASCII' : 'UTF-8');
        }).join('\n');
      });

      // ======== システム情報・シェル
      def('free', 'free', 'メモリとストレージの使用量', () => {
        const pm = performance.memory, u = fs.usage(), rows = [['', '合計', '使用', '空き']];
        if (pm) rows.push(['JS ヒープ', fmtSize(pm.jsHeapSizeLimit), fmtSize(pm.usedJSHeapSize), fmtSize(pm.jsHeapSizeLimit - pm.usedJSHeapSize)]);
        rows.push([OS.store.ram ? 'RAM ディスク' : 'LocalStorage', fmtSize(u.total), fmtSize(u.used), fmtSize(Math.max(0, u.total - u.used))]);
        const lines2 = rows.map(r => r[0].padEnd(14) + r.slice(1).map(x => x.padStart(11)).join(''));
        if (navigator.deviceMemory) lines2.push('端末のメモリ: 約 ' + navigator.deviceMemory + ' GB（ブラウザが教える目安）');
        if (!pm) lines2.push('（このブラウザは JS ヒープの使用量を教えてくれません）');
        return lines2.join('\n');
      });
      const since = ms => { const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60); return (d ? d + '日 ' : '') + (d || hh ? hh + '時間 ' : '') + mm + '分'; };
      def('uptime', 'uptime', '起動してからの時間', () => {
        const n = new Date(), z = x => String(x).padStart(2, '0');
        const who = new Set([OS.htui.user, OS.tty1sh && OS.tty1sh.user].filter(Boolean)).size;
        return z(n.getHours()) + ':' + z(n.getMinutes()) + ' 起動から ' + since(Date.now() - (OS.bootTime || Date.now())) + '、ログイン中 ' + who + ' 人' + (OS.live ? '（Live モード）' : '');
      });
      def('hostname', 'hostname [新しい名前]', 'このコンピューターの名前を表示・変更（変更は管理者のみ）', n => {
        if (n == null) return OS.hostname();
        needAdmin(); if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(n)) throw new Error('英数字と - で 63 文字までにしてください');
        OS.config.set('hostname', n); self.vars.HOSTNAME = n; return 'ホスト名: ' + n;
      });
      const idOf = name => { const l = users.list(), u = users.get(name); if (!u) throw new Error(name + ': そのようなユーザーはいません'); return u.root ? 0 : 1000 + l.filter(x => !x.root).findIndex(x => x.name === u.name); };
      def('id', 'id [ユーザー名]', 'ユーザーの ID と所属グループ', name => {
        name = name || self.user; const u = users.get(name), uid = idOf(name);
        const groups = [uid + '(' + name + ')'].concat(u.root ? ['0(root)'] : u.admin ? ['27(sudo)'] : []);
        return 'uid=' + uid + '(' + name + ') gid=' + uid + '(' + name + ') groups=' + [...new Set(groups)].join(',');
      });
      def('env', 'env', '環境変数の一覧', () => { const v = self.allVars(); return Object.keys(v).sort().map(k => k + '=' + v[k]).join('\n'); });
      alias('printenv', 'env');
      def('export', 'export 名前=値', '環境変数を設定（$名前 で使える）', (...a) => {
        if (!a.length) return env.env();
        a.forEach(x => { const m = String(x).match(/^([A-Za-z_]\w*)=([\s\S]*)$/); if (!m) throw new Error('export 名前=値'); if (m[1] === 'PWD') throw new Error('PWD は cd で変わります'); self.vars[m[1]] = m[2]; });
      });
      def('unset', 'unset 名前', '環境変数を消す', (...a) => { a.forEach(n => { delete self.vars[n]; }); });
      def('alias', 'alias [名前=コマンド]', '別名（エイリアス）の一覧・設定（例: alias ll="ls -l"）', (...a) => {
        if (!a.length) return Object.keys(self.aliases).sort().map(k => 'alias ' + k + "='" + self.aliases[k] + "'").join('\n') || undefined;
        a.forEach(x => {
          const m = String(x).match(/^([A-Za-z_][\w-]*)=([\s\S]+)$/);
          if (!m) { if (self.aliases[x]) { tty.println('alias ' + x + "='" + self.aliases[x] + "'"); return; } throw new Error(x + ': そのようなエイリアスはありません'); }
          self.aliases[m[1]] = m[2]; self.cmds.add(m[1]);
        });
      });
      def('unalias', 'unalias 名前', 'エイリアスを消す', (...a) => { a.forEach(n => { if (!self.aliases[n]) throw new Error(n + ': そのようなエイリアスはありません'); delete self.aliases[n]; if (!env[n]) self.cmds.delete(n); }); });
      def('which', 'which コマンド...', 'コマンドの正体（組み込み・エイリアス・アプリ）を表示', (...a) => {
        if (!a.length) throw new Error('コマンド名を指定してください');
        return a.map(n => self.aliases[n] ? n + ': エイリアス（' + self.aliases[n] + '）' : env[n] && self.cmds.has(n) ? n + ': jsh の組み込みコマンド' + (OS.apps[n] ? '（アプリ ' + OS.apps[n].name + ' を開く）' : '') : OS.apps[n] ? n + ': アプリ（launch ' + n + '）' : n + ': 見つかりません').join('\n');
      });
      def('type', 'type コマンド', 'which と同じ', (...a) => env.which(...a));
      def('man', 'man コマンド', 'コマンドの説明書を表示', name => {
        if (!name) throw new Error('どのコマンドの説明書を見ますか（例: man ls）');
        if (self.aliases[name]) return name + ' はエイリアスです: ' + self.aliases[name];
        const x = self.help[name]; if (!x) throw new Error(name + ': 説明書がありません');
        const ex = MAN[name];
        tty.println(name.toUpperCase() + '(1)', 'accent');
        tty.println('\n名前', 'accent'); tty.println('    ' + name + ' — ' + x.desc);
        tty.println('\n書式', 'accent'); tty.println('    ' + x.usage);
        if (ex && ex.d) { tty.println('\n説明', 'accent'); ex.d.split('\n').forEach(l => tty.println('    ' + l)); }
        if (ex && ex.e) { tty.println('\n例', 'accent'); ex.e.forEach(l => tty.println('    ' + l)); }
        tty.println('\nほかの使い方: JavaScript からは ' + name + '(...) のように関数として呼べます。', 'dim');
      });
      def('top', 'top', '動いているウィンドウとメモリ・ストレージを 1 秒ごとに表示（Enter か Ctrl+C で終了）', async () => {
        let done = false; const stop = tty.read('').then(() => { done = true; });
        while (!done) {
          tty.clear();
          const n = new Date(), z = x => String(x).padStart(2, '0'), u = fs.usage(), pm = performance.memory;
          tty.println('top - ' + z(n.getHours()) + ':' + z(n.getMinutes()) + ':' + z(n.getSeconds()) + '  起動から ' + since(Date.now() - (OS.bootTime || Date.now())) + '  ウィンドウ ' + (OS.htui.running ? OS.htui.wins.length : 0) + ' 個', 'accent');
          tty.println('ストレージ: ' + fmtSize(u.used) + ' / ' + fmtSize(u.total) + (pm ? '   JS ヒープ: ' + fmtSize(pm.usedJSHeapSize) + ' / ' + fmtSize(pm.jsHeapSizeLimit) : '') + '   CPU: ' + (navigator.hardwareConcurrency || '?') + ' コア');
          tty.println('');
          tty.println('  PID  ユーザー    状態    アプリ       タイトル', 'dim');
          const wins = OS.htui.running ? OS.htui.wins : [];
          if (!wins.length) tty.println('  （HTUi のウィンドウはありません）', 'dim');
          wins.forEach(w => tty.println(String(w.pid).padStart(5) + '  ' + String(OS.htui.user || '-').padEnd(10) + '  ' + (w.el.classList.contains('hidden') ? '最小化' : w.el.classList.contains('active') ? '前面  ' : '      ') + '  ' + String(w.app || '-').padEnd(11) + '  ' + w.title));
          tty.println('\nEnter か Ctrl+C で終了', 'dim');
          await Promise.race([stop, new Promise(r => setTimeout(r, 1000))]);
        }
        tty.clear();
      });
      return env;
    }
  }
  OS.Jsh = Jsh;
})();
