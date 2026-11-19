/* jsh — JS + SHell。入力はJavaScriptとして実行されます。
   先頭がコマンド名で「ls -l /sys」のような形なら、シェル風に ls("-l","/sys") と解釈します。
   4.0 から シェルスクリプト（.jsh）に対応: 1 行ずつ jsh の行として実行する（$1 $@ $# $? $(コマンド)、NAME=値、{ } でまたがる JS のブロック）。
   パッケージは OS.registerCommand({ name, usage, desc, run(args, sh) }) でコマンドを足せる。 */
(function () {
  const OS = window.OS, fs0 = OS.fs, path = OS.path, users = OS.users;

  class Listing extends Array {}

  // { ( [ がいくつ開いたままか（文字列・テンプレート文字列・コメントの中は数えない）。スクリプトで行をつなぐのに使う
  function openDepth(code) {
    let d = 0, q = null;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '/' && code[i + 1] === '/') { const n = code.indexOf('\n', i); if (n < 0) break; i = n; continue; }
      if (c === '/' && code[i + 1] === '*') { const n = code.indexOf('*/', i + 2); if (n < 0) return d + 1; i = n + 1; continue; }
      if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--;
    }
    return d;
  }

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
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  const fmtDate = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };

  // man で出す詳しい説明と例（help にある書式・説明に足す）
  const MAN = {
    ls: { d: '-l で詳しく（種類・持ち主・大きさ・日時）、-a で . から始まる隠しファイルも表示します。\nシンボリックリンクは -l のとき「名前 -> リンク先」と表示します。', e: ['ls -l /sys', 'ls -a ~', 'ls("/sys").length'] },
    grep: { d: 'パターンは JavaScript の正規表現です。ファイルを指定しないときは、パイプで渡された文字から探します。\n-i 大文字と小文字を区別しない、-v 一致しない行、-n 行番号をつける、-c 一致した行の数だけ。', e: ['ls | grep foo', 'grep -n error log.txt', 'cat /etc/passwd | grep -i ROOT', 'ls -l /sys/apps | grep -v ".js" | wc -l'] },
    sed: { d: 's/パターン/置き換え/フラグ の形だけ使えます。パターンは JavaScript の正規表現で、置き換えでは $1（1 つめの括弧）や $&（一致した部分）が使えます。g ですべて、i で大文字小文字を区別しません。', e: ['ls | sed s/.txt/.md/', "cat memo.txt | sed 's/foo/bar/g'"] },
    cat: { d: 'ファイルを省くと、パイプで渡された文字をそのまま出します。', e: ['cat memo.txt', 'cat a.txt b.txt > ab.txt', 'ls | cat'] },
    xargs: { d: '受け取った文字を空白と改行で区切り、コマンドの引数の後ろに付けて 1 回実行します。空白を含む名前は " " で囲んでおきます。', e: ['find ~ -name "*.tmp" | xargs rm', 'echo a.txt b.txt | xargs cat'] },
    mount: { d: 'HDD1 は File System Access API で選んだ PC のフォルダです。中身をすべて読み込んで /mnt/hdd1 に見せ、書き込みは PC のフォルダにもそのまま反映します。\nブラウザの決まりで、ページを開き直したあとはフォルダを使う許可がもう一度必要です（mount hdd1 か、hFile の HDD1 から）。', e: ['mount', 'mount hdd1', 'mount hdd1 -p', 'ls /mnt/hdd1 | grep .md', 'umount hdd1'] },
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
    top: { d: 'HTUi で開いているウィンドウ（プロセス）の一覧を 1 秒ごとに書き直します。' },
    run: { d: '拡張子が .jsh か、1 行目が #!/bin/jsh のファイルはシェルスクリプトとして 1 行ずつ実行します。それ以外は JavaScript として実行します。\n' +
      'シェルスクリプトの中では、$1 $2 …（引数）、$@（引数ぜんぶ）、$#（引数の数）、$0（スクリプトの名前）、$?（直前の行が成功なら 0）、$(コマンド)（コマンドの出力）が使えます。\n' +
      'NAME=値 でシェルの変数を作れます。# で始まる行はコメント、行末の \\ で次の行につなぎます。\n' +
      'if や for は JavaScript で書きます。{ ( [ が閉じるまでの行は 1 つにまとめて実行するので、複数行のブロックも書けます。exit 1 でスクリプトを終わります。\n' +
      '~/bin か /bin に置いたスクリプトは、名前だけで実行できます（hello.jsh → hello）。./hello.jsh のようにパスで実行することもできます。',
      e: ['run ~/hello.jsh 悠', './backup.jsh', 'hello 悠'] },
    cmd: { d: 'JavaScript の中からシェル風のコマンドを実行して、その出力を文字列で受け取ります。シェル風の行では $( ) と同じです。', e: ['const n = await cmd("ls ~ | wc -l")', 'echo ファイルは $(ls ~ | wc -l) 個'] }
  };

  class Jsh {
    constructor(tty, user, opt) {
      this.tty = tty; this.user = user; this.stack = [];
      this.opt = opt || {};
      this.cwd = fs0.isDir(users.home(user)) ? users.home(user) : '/';
      this.hist = []; this.exited = false;
      this.umask = 0o022; // 新しいファイルから外すパーミッション
      this.fs = OS.fsFor(() => this.user, () => this.umask);
      this.help = {}; this.cmds = new Set();
      this.vars = { SHELL: '/bin/jsh', LANG: 'ja_JP.UTF-8', TERM: 'htmlos-tty', PATH: '/bin' };
      this.aliases = { ll: 'ls -l', la: 'ls -a' };
      this.stdin = null; this.status = 0; this.pos = null; this.depth = 0; this.extCmds = {};
      this.env = this.buildEnv();
      Object.keys(this.aliases).forEach(n => this.cmds.add(n));
      if (OS.proc && !this.opt.service) {
        const self = this;
        this.proc = OS.proc.spawn({ name: 'jsh', cmd: (this.opt.login ? '-jsh' : 'jsh') + (tty === OS.tty1 ? '（tty1）' : ''), kind: 'shell', ppid: this.opt.ppid || 1,
          onsignal: sig => { if (self.opt.onsignal) return self.opt.onsignal(sig); throw new Error('ログインシェルは kill では終了できません（exit で抜けてください）'); } });
        Object.defineProperty(this.proc, 'user', { get: () => self.user }); // su で変わる
      }
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
      // ~/.jshrc があれば、1 行ずつ実行する（エイリアスや環境変数の設定を書いておける）。ハイバーネートから戻るときは、状態ごと戻すので読まない
      try {
        if (OS.safe) throw new Error('セーフモードでは ~/.jshrc を読まない');
        if (this.opt.resume) throw new Error('休止状態から戻る');
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
    allVars() {
      const v = Object.assign({}, this.vars, { USER: this.user, HOME: this.home, PWD: this.cwd, HOSTNAME: OS.hostname(), '?': String(this.status | 0) });
      const p = this.pos;
      if (p) { v['0'] = p.name; p.args.forEach((a, i) => { v[String(i + 1)] = a; }); v['#'] = String(p.args.length); v['@'] = p.args.map(a => /[\s"']/.test(a) ? '"' + a + '"' : a).join(' '); }
      return v;
    }
    // $名前 / ${名前} を値に置き換える。' ' の中は置き換えない
    expand(str) {
      const v = this.allVars(); let out = '', q = null;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
        if (ch === "'" && !q) { q = "'"; out += ch; continue; }
        if (ch === '"') { q = q === '"' ? null : '"'; out += ch; continue; }
        if (ch === '$') {
          const m = str.slice(i + 1).match(/^\{([A-Za-z_]\w*|\d+|[@#?])\}|^([A-Za-z_]\w*|\d|[@#?])/);
          if (m) { const n = m[1] || m[2]; out += v[n] != null ? v[n] : ''; i += m[0].length; continue; }
        }
        out += ch;
      }
      return out;
    }
    // シェル風の行なら、パイプ「|」で区切ったコマンドの並びを返す。JavaScript として読むべき行なら null
    pipeline(line) {
      const parts = []; let cur = '', q = null, sub = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === q) q = null; cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '$' && line[i + 1] === '(') { sub++; cur += '$('; i++; continue; }
        if (sub) { if (ch === '(') sub++; else if (ch === ')') sub--; cur += ch; continue; }
        if (ch === '|' && line[i + 1] !== '|' && line[i - 1] !== '|') { parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      // 引数が JavaScript の続きに見えるとき（ls("/") の ( や、.map( など）は JavaScript として読む。cd .config のような . で始まるパスはシェル風
      const jsLike = /^(\(|\.[A-Za-z_$][\w$]*\s*\(|\[|=|[+\-*\/%<>&|^?:,]\s|[+\-*\/]=|instanceof\b|in\b)/;
      const segs = [];
      for (let seg of parts) {
        let m = seg.match(/^([A-Za-z_$][\w$-]*)(?:\s+([\s\S]*))?$/);
        if (m && this.aliases[m[1]]) { seg = this.aliases[m[1]] + (m[2] ? ' ' + m[2] : ''); m = seg.match(/^([A-Za-z_$][\w$-]*)(?:\s+([\s\S]*))?$/); }
        if (!m || (m[2] && jsLike.test(m[2]))) return null;
        if (!this.cmds.has(m[1]) || !this.env[m[1]]) {
          // ~/bin・/bin にある同じ名前（または 名前.jsh）のスクリプト
          const sc = this.findScript(m[1]);
          if (!sc) return null;
          if (!this.fs.canExec(sc)) throw new Error(m[1] + ': 実行する許可がありません（' + sc + '。chmod +x で実行できるようになります）');
          segs.push({ name: 'run', rest: JSON.stringify(sc) + (m[2] ? ' ' + m[2] : '') });
          continue;
        }
        segs.push({ name: m[1], rest: m[2] || '' });
      }
      return segs;
    }

    // シェル風の行を ; && || で区切る。区切りが無いか、どこかが JavaScript として読むべき部分なら null
    chain(line) {
      const parts = []; let cur = '', q = null, op = null, sub = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === q) q = null; cur += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === '$' && line[i + 1] === '(') { sub++; cur += '$('; i++; continue; }
        if (sub) { if (ch === '(') sub++; else if (ch === ')') sub--; cur += ch; continue; }
        const two = line.slice(i, i + 2);
        if (two === '&&' || two === '||' || ch === ';') { parts.push({ op: op, text: cur.trim() }); op = ch === ';' ? ';' : two; cur = ''; if (ch !== ';') i++; continue; }
        cur += ch;
      }
      parts.push({ op: op, text: cur.trim() });
      if (parts.length < 2) return null;
      if (!parts[parts.length - 1].text && parts[parts.length - 1].op === ';') parts.pop(); // 最後の ; は無視
      for (const p of parts) { if (!p.text) return null; p.segs = this.pipeline(p.text); if (!p.segs) return null; }
      return parts;
    }

    async exec(line, quiet) {
      line = line.trim();
      if (!line) return;
      if (!quiet && this.hist[this.hist.length - 1] !== line) this.hist.push(line);
      const tty = this.tty, cap0 = tty.capture;
      this.syncCommands();
      // コマンド1 && コマンド2（1 が成功したら 2）、|| （失敗したら）、; （どちらでも）
      const ch = this.chain(line);
      if (ch) {
        let ok = true;
        for (const p of ch) {
          if ((p.op === '&&' && !ok) || (p.op === '||' && ok)) continue;
          try { const r = await this.runSegs(p.segs); if (r !== undefined) this.show(r); ok = true; }
          catch (e) { tty.capture = cap0; this.stdin = null; if (e && e.jshExit) throw e; this.showErr(e); ok = false; }
          this.status = ok ? this.takeExit() : 1;
          if (this.exited) return;
        }
        return;
      }
      try {
        let result;
        const segs = this.pipeline(line);
        if (segs) result = await this.runSegs(segs);
        else if (/^(\.\.?\/|\/|~\/)\S+/.test(line) && this.fs.isFile(this.abs(splitArgs(line)[0]))) {
          const a = splitArgs(line);
          if (!this.fs.canExec(this.abs(a[0]))) throw new Error(a[0] + ': 実行する許可がありません（chmod +x ' + a[0] + ' で実行できるようになります。run ' + a[0] + ' なら許可なしで読んで実行します）');
          result = await this.env.run(...a);
        } else {
          // JavaScript。let/const/var は次の行でも使えるようグローバル代入に読み替える
          let code = line;
          const d = code.match(/^(?:let|const|var)\s+([\s\S]*)$/);
          if (d) { code = d[1]; if (/^[{\[]/.test(code)) code = '(' + code.replace(/;\s*$/, '') + ')'; }
          result = await this.compile(code, true)(this.env);
        }
        if (result !== undefined) this.show(result);
        this.status = this.takeExit();
      } catch (e) {
        tty.capture = cap0; this.stdin = null;
        if (e && e.jshExit) throw e;
        this.status = 1; this.exitCode = 0;
        this.showErr(e);
      }
    }

    // スクリプトが exit N で終わったときの N（なければ 0）
    takeExit() { const c = this.exitCode | 0; this.exitCode = 0; return c; }
    // パッケージが OS.registerCommand で足したコマンドを、このシェルのコマンドにする（消えたものは外す）
    syncCommands() {
      const ext = OS.commands || {};
      for (const n in this.extCmds) if (ext[n] !== this.extCmds[n]) { delete this.env[n]; delete this.help[n]; this.cmds.delete(n); delete this.extCmds[n]; }
      for (const n in ext) {
        if (this.extCmds[n] === ext[n] || (this.cmds.has(n) && !this.extCmds[n])) continue;
        const c = ext[n], self = this;
        this.extCmds[n] = c;
        this.env[n] = async function (...a) { return c.run.call(c, a, self.io()); };
        this.help[n] = { usage: c.usage || n, desc: (c.desc || '') + (c.pkg ? '  [' + c.pkg + ']' : '') };
        this.cmds.add(n);
      }
    }
    // registerCommand の run(args, sh) に渡す道具
    io() {
      const self = this, tty = this.tty;
      return {
        user: self.user, home: self.home, cwd: self.cwd, fs: self.fs, tty: tty, env: self.env, vars: self.allVars(),
        stdin: self.stdin, admin: self.admin, root: self.root,
        print: (...a) => tty.println(a.map(String).join(' ')), write: s => tty.print(String(s)), error: s => tty.println(String(s), 'err'),
        read: p => tty.read(p == null ? '' : String(p)), abs: p => self.abs(p), cmd: line => self.capture(line),
        lines: t => { const l = String(t == null ? '' : t).split('\n'); if (l.length && l[l.length - 1] === '') l.pop(); return l; },
        getopts: (args, takes) => self.env.__getopts(args, takes)
      };
    }
    // 1 行を実行して、画面に出るはずだった文字を返す（$( … ) と cmd("…")）
    async capture(line) {
      const tty = this.tty, prev = tty.capture, prevIn = this.stdin, buf = [];
      tty.capture = buf; this.stdin = null;
      try { await this.exec(String(line), true); } finally { tty.capture = prev; this.stdin = prevIn; }
      return buf.join('');
    }
    // $( コマンド ) を、そのコマンドの出力（最後の改行を除く）に置き換える。' ' の中は置き換えない
    async subst(str) {
      if (!str.includes('$(')) return str;
      let out = '', q = null;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
        if (ch === "'" && !q) { q = "'"; out += ch; continue; }
        if (ch === '"') { q = q === '"' ? null : '"'; out += ch; continue; }
        if (ch === '$' && str[i + 1] === '(') {
          let d = 0, j = i + 1, qq = null;
          for (; j < str.length; j++) { const c = str[j]; if (qq) { if (c === qq) qq = null; continue; } if (c === '"' || c === "'") { qq = c; continue; } if (c === '(') d++; else if (c === ')') { d--; if (!d) break; } }
          if (d) throw new Error('$( に対応する ) がありません');
          const r = (await this.capture(str.slice(i + 2, j))).replace(/\n+$/, '');
          out += q ? r.replace(/"/g, "'") : r; i = j; continue;
        }
        out += ch;
      }
      return out;
    }
    // ~/bin と /bin から、名前（または 名前.jsh）のスクリプトを探す
    findScript(name) {
      if (!/^[\w.-]+$/.test(name)) return null;
      for (const d of [this.home + '/bin', '/bin']) {
        for (const n of [name, name + '.jsh']) { const p = d + '/' + n; try { if (fs0.isFile(p)) return p; } catch (e) { /* 読めない */ } }
      }
      return null;
    }
    // スクリプトかどうか: 拡張子 .jsh か、1 行目が #!/bin/jsh
    static isShellScript(p, text) { return /\.jsh$/i.test(p) || /^#!\s*\S*jsh\b/.test(text); }
    // シェルスクリプト（.jsh）を実行する。行ごとに jsh の行として実行し、{ ( [ が閉じるまでは次の行とつなげる
    async runScript(file, args, text) {
      if (text == null) text = this.fs.read(file);
      if ((this.depth = (this.depth | 0) + 1) > 32) { this.depth--; throw new Error('スクリプトの呼び出しが深すぎます（32 段まで）'); }
      const savedPos = this.pos, savedArgs = this.env.args;
      this.pos = { name: file, args: args.map(String) }; this.env.args = this.pos.args;
      const lines = String(text).replace(/\r/g, '').split('\n');
      let buf = '', code = 0;
      try {
        for (let i = 0; i < lines.length; i++) {
          let l = lines[i];
          if (i === 0 && l.startsWith('#!')) continue;
          if (!buf) { const t = l.trim(); if (!t || t.startsWith('#') || t.startsWith('//')) continue; }
          if (/\\$/.test(l)) { buf += l.slice(0, -1) + ' '; continue; } // 行末の \ で次の行につなぐ
          buf += l;
          if (openDepth(buf) > 0 && i < lines.length - 1) { buf += '\n'; continue; }
          const one = buf.trim(); buf = '';
          // NAME=値（シェルの変数）。値の中の $変数 と $( ) も展開する
          const m = one.match(/^([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s"'=;|&<>]*)$/);
          if (m) { const v = m[2]; this.vars[m[1]] = v[0] === "'" ? v.slice(1, -1) : this.expand(await this.subst(v[0] === '"' ? v.slice(1, -1) : v)); this.status = 0; continue; }
          await this.exec(one, true);
          if (this.exited) break;
        }
      } catch (e) {
        if (!(e && e.jshExit)) throw e;
        code = e.code | 0;
      } finally { this.pos = savedPos; this.env.args = savedArgs; this.depth--; }
      this.exitCode = code; // exec が $? にする
    }
    showErr(e) { if (e && e.quietExit) return; this.tty.println('jsh: ' + (e && e.message ? (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message : String(e)), 'err'); }

    // シェル風: コマンド 引数... [< ファイル] [| コマンド 引数...] [> ファイル]。前のコマンドの出力は次のコマンドの入力（stdin）になる
    async runSegs(segs) {
      const tty = this.tty;
      let result;
      let data = null;
      const cap0 = tty.capture;
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i], last = i === segs.length - 1;
        this.exitCode = 0; // パイプの $? は最後のコマンドのもの
        let args = splitArgs(this.expand(await this.subst(sg.rest))), redir = null;
        // < ファイル: そのファイルの中身を入力にする（最初のコマンドだけ）
        const li = args.indexOf('<');
        if (li >= 0) {
          if (i > 0) throw new Error('< は最初のコマンドにだけ使えます');
          if (!args[li + 1]) throw new Error('< のあとにファイル名がありません');
          data = this.fs.read(this.abs(args[li + 1])); args.splice(li, 2);
        }
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
          if (cap) { const c = tty.capture ? tty.capture.join('') : ''; tty.capture = cap0; const f = result === undefined ? '' : this.format(result); data = c + f + (f && !f.endsWith('\n') ? '\n' : ''); }
        }
        if (cap) result = undefined;
        if (redir) { const dest = this.abs(redir.file); this.fs.write(dest, (redir.append && this.fs.exists(dest) ? this.fs.read(dest) : '') + data); }
      }
      return result;
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

    // Tab 補完（5.1.2）。コマンドの位置ではコマンド名、引数ではサブコマンド・オプション・unit 名・ユーザー名など、ほかはファイル名
    complete(v) {
      const m = v.match(/^([\s\S]*?)([^\s'"(]*)$/);
      const head = m[1], tok = m[2];
      // いまのコマンド（| ; && || のあと）の単語。sudo とそのオプションは外す
      const seg = head.split(/\|\||&&|[|;]/).pop();
      let words = seg.trim() ? seg.trim().split(/\s+/) : [];
      let sudoOpts = false;
      if (words[0] === 'sudo') {
        let i = 1;
        while (i < words.length && /^-/.test(words[i])) i += words[i] === '-u' ? 2 : 1;
        words = words.slice(i);
        if (!words.length && /^-/.test(tok)) sudoOpts = true;
        else if (!words.length && /(^|\s)-u\s+$/.test(seg)) return this._fin(head, '', tok, this._users());
      }
      let cands = null, prefix = '', dirsOnly = false;
      if (sudoOpts) cands = ['-u', '-i', '-s', '-l', '-k', '-v'];
      else if (!words.length && !tok.includes('/')) cands = this._cmdNames();
      else if (words.length) {
        const r = this._args(words[0], words.slice(1), tok);
        if (Array.isArray(r)) cands = r;
        else if (r === 'dirs') dirsOnly = true;
      }
      if (cands) cands = Array.from(new Set(cands.map(String))).filter(n => n.startsWith(tok)).sort();
      else {
        const i = tok.lastIndexOf('/');
        prefix = i >= 0 ? tok.slice(0, i + 1) : '';
        const base = tok.slice(i + 1), dir = this.abs(prefix || '.');
        try { cands = this.fs.list(dir).filter(n => n.startsWith(base) && (!base.length ? !n.startsWith('.') || base === '.' : true)).map(n => n + (fs0.isDir(path.join(dir, n)) ? '/' : '')).filter(n => !dirsOnly || n.endsWith('/')); } catch (e) { cands = []; }
      }
      return this._fin(head, prefix, tok, cands);
    }
    _fin(head, prefix, tok, cands) {
      cands = (cands || []).filter(n => n.startsWith(tok.slice(prefix.length)) || prefix);
      if (!cands.length) return null;
      if (cands.length === 1) return head + prefix + cands[0] + (/[/=:]$/.test(cands[0]) ? '' : ' ');
      let common = cands[0];
      for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
      const v = head + prefix + tok.slice(prefix.length), nv = head + prefix + common;
      return nv.length > v.length ? nv : cands;
    }
    _cmdNames() {
      this.syncCommands(); // パッケージや hinit が足したコマンド（systemctl・ps など）も候補に入れる
      const names = new Set(this.cmds);
      for (const d of [this.home + '/bin', '/bin']) { try { this.fs.list(d).forEach(n => { if (fs0.isFile(path.join(d, n))) names.add(n.replace(/\.jsh$/i, '')); }); } catch (e) { /* なければ飛ばす */ } }
      return [...names];
    }
    _users() { return users.list().map(u => u.name); }
    _groups() { const s = new Set(); users.list().forEach(u => OS.perm.groupsOf(u.name).forEach(g => s.add(g))); return [...s]; }
    _units() { return OS.init ? OS.init.units().map(u => u.name.replace(/\.service$/, '')) : []; }
    // 引数の候補。配列を返すとその中から、'dirs' はディレクトリだけ、null はファイル名
    _args(cmd, a, tok) {
      if (this.aliases[cmd]) { const w = this.aliases[cmd].split(/\s+/); cmd = w[0]; a = w.slice(1).concat(a); }
      const prev = a[a.length - 1], pos = a.filter(x => !/^-/.test(x)), n = pos.length;
      const help = this.help[cmd];
      // オプション（使い方の文字から拾う）
      const optsOf = () => help ? (help.usage.match(/(?:^|[\s\[|(])(--?[A-Za-z][\w-]*)/g) || []).map(x => x.replace(/^[\s\[|(]/, '')) : [];
      const ext = OS.commands && OS.commands[cmd];
      if (ext && typeof ext.complete === 'function') { try { const r = ext.complete(a, tok, this.io()); if (r !== undefined) return r; } catch (e) { /* 補完の失敗は無視 */ } }
      const spec = this._spec(cmd, a, pos, n, prev, tok);
      if (spec !== undefined) return spec;
      if (/^-/.test(tok)) { const o = optsOf(); if (o.length) return o; }
      return null;
    }
    _spec(cmd, a, pos, n, prev, tok) {
      const S = OS.sound, I = OS.ipc, SIG = OS.proc ? Object.keys(OS.proc.SIG) : [];
      const procNames = () => OS.proc ? OS.proc.list().map(p => p.name) : [];
      const appIds = () => Object.keys(OS.apps || {});
      const envs = () => Object.keys(OS.sessions || {});
      const vars = () => Object.keys(this.allVars());
      switch (cmd) {
        case 'help': case 'man': case 'which': case 'type': return this._cmdNames();
        case 'xargs': case 'time': return n ? null : this._cmdNames();
        case 'cd': case 'hfile': case 'tree': case 'du': case 'rmdir': return /^-/.test(tok) ? ['-s'] : 'dirs';
        case 'su': case 'passwd': case 'userdel': case 'groups': case 'id': return n ? [] : this._users();
        case 'useradd': return n === 1 ? ['admin'] : [];
        case 'usermod': return n === 0 && !/^-/.test(prev || '') ? ['-aG', '-rG'] : /^-[ar]G$/.test(prev || '') ? this._groups() : this._users();
        case 'chown': if (/^-/.test(tok)) return ['-R']; if (n === 0) { const i = tok.indexOf(':'); return i >= 0 ? this._groups().map(g => tok.slice(0, i + 1) + g) : this._users().map(u => u).concat(this._users().map(u => u + ':')); } return null;
        case 'chgrp': if (/^-/.test(tok)) return ['-R']; return n === 0 ? this._groups() : null;
        case 'chmod': if (n === 0) return ['755', '750', '700', '644', '640', '600', '777', '1777', '+x', 'u+x', 'a+x', '-x', 'go-w', 'go-rwx', 'a+r', 'u+rw', '+t', '-R']; return null;
        case 'umask': return n ? [] : ['022', '027', '077', '002'];
        case 'systemctl': {
          const subs = ['list-units', 'list-unit-files', 'status', 'start', 'stop', 'restart', 'reload', 'try-restart', 'enable', 'disable', 'is-active', 'is-enabled', 'is-failed', 'list-dependencies', 'cat', 'daemon-reload', 'reset-failed', 'poweroff', 'reboot', 'help'];
          if (/^-/.test(tok)) return pos[0] === 'enable' || pos[0] === 'disable' ? ['--now'] : ['--all', '--help'];
          if (n === 0) return subs;
          if (['status', 'start', 'stop', 'restart', 'reload', 'try-restart', 'enable', 'disable', 'is-active', 'is-enabled', 'is-failed', 'list-dependencies', 'cat', 'reset-failed'].includes(pos[0])) {
            const all = OS.init ? OS.init.units() : [];
            return all.map(u => u.type === 'target' && pos[0] !== 'status' && pos[0] !== 'list-dependencies' ? u.name : u.name.replace(/\.service$/, ''));
          }
          return [];
        }
        case 'hjournal': {
          if (prev === '-u' || prev === '--unit') return this._units().concat(['kernel', 'sudo', 'hinit']);
          if (prev === '-p' || prev === '--priority') return OS.journal ? OS.journal.PRIO : [];
          if (prev === '-b' || prev === '--boot') return ['-1', '0'];
          if (prev === '-n' || prev === '--lines') return ['10', '50', '100'];
          if (prev === '--since') return [];
          return ['-n', '-u', '-p', '-k', '-b', '-r', '-f', '--since'];
        }
        case 'ps': if (prev === '-u') return this._users(); if (prev === '-t') return ['init', 'kernel', 'service', 'session', 'app', 'shell']; return ['-u', '-t'];
        case 'kill': if (/^-/.test(tok)) return ['-l'].concat(SIG.map(s => '-' + s)); return OS.proc ? OS.proc.list().map(p => String(p.pid)) : [];
        case 'pkill': case 'killall': if (/^-/.test(tok)) return SIG.map(s => '-' + s); return procNames();
        case 'pidof': return n ? [] : procNames();
        case 'sudo': return this._cmdNames();
        case 'ipc': {
          if (n === 0) return ['list', 'call', 'pub', 'monitor', 'listen', 'introspect'];
          const sub = pos[0], names = I ? I.list() : [];
          if ((sub === 'call' || sub === 'introspect') && n === 1) return names.map(x => x.name);
          if (sub === 'call' && n === 2) { const x = names.find(y => y.name === pos[1]); return x ? x.methods.map(mm => mm.name) : []; }
          if ((sub === 'listen' || sub === 'monitor' || sub === 'pub') && n === 1) return ['unit.changed', 'unit.*', 'session.login', 'session.logout', 'session.*', 'notify', 'power.reboot', 'power.shutdown', 'power.*', 'bus.name', '**'];
          if (sub === 'call' && pos[1] === 'htmlos.Init' && n === 3) return this._units();
          if (sub === 'call' && pos[1] === 'htmlos.Sound' && n === 3) return S.list();
          return [];
        }
        case 'power': if (n === 0) return ['status', 'lock', 'hibernate', 'saver', 'onsleep', 'awake']; if ((pos[0] === 'saver' || pos[0] === 'awake') && n === 1) return ['on', 'off']; if (pos[0] === 'onsleep' && n === 1) return Object.keys(OS.power.actions); return [];
        case 'bgm': if (n === 0) return ['on', 'off', 'style', 'vol', 'list']; if (pos[0] === 'style' && n === 1) return Object.keys(OS.bgm.styles); if (pos[0] === 'vol' && n === 1) return ['0', '25', '35', '50', '75', '100']; return [];
        case 'sound': if (n === 0) return ['on', 'off', 'vol', 'play', 'list']; if (pos[0] === 'play' && n === 1) return S.list(); if (pos[0] === 'vol' && n === 1) return ['0', '25', '50', '75', '100']; return [];
        case 'bell': case 'clear': case 'pwd': case 'whoami': case 'users': case 'df': case 'date': case 'env': case 'uptime': case 'uname': case 'free': case 'neofetch': case 'history': case 'top': case 'dmesg': case 'poweroff': case 'reinstall': return [];
        case 'htui': if (n === 0) return ['start', 'stop', 'status', 'sessions', 'session', 'mode']; if ((pos[0] === 'start' || pos[0] === 'session') && n === 1) return envs(); return [];
        case 'startx': return n ? [] : envs();
        case 'bootmode': return n ? [] : ['gui', 'cui'];
        case 'reboot': return n ? [] : ['i', 'safe', 'cui', 'gui'];
        case 'mount': return ['hdd1', '-p'];
        case 'umount': return n ? [] : ['hdd1'];
        case 'pkg': if (n === 0) return ['list', 'install', 'remove']; if (pos[0] === 'remove') return OS.pkg ? OS.pkg.list() : []; return null;
        case 'hstudio': if (n === 0) return ['tui', 'new', 'list', 'build', 'run', 'install', 'open']; if (pos[0] === 'new' && n === 1) return ['app', 'cmd', 'de']; return [];
        case 'launch': return n ? null : appIds();
        case 'unalias': return Object.keys(this.aliases);
        case 'unset': return vars();
        case 'export': return n ? [] : vars().map(x => x + '=');
        case 'find': if (prev === '-type') return ['f', 'd', 'l']; if (prev === '-name') return []; if (/^-/.test(tok)) return ['-name', '-type']; return 'dirs';
        case 'ln': if (/^-/.test(tok)) return ['-s']; return null;
        case 'mkfifo': case 'mkdir': case 'touch': case 'rm': case 'cp': case 'mv': case 'cat': case 'stat': return undefined; // オプションは使い方から・あとはファイル名
      }
      return undefined;
    }

    buildEnv() {
      const self = this, tty = this.tty, fs = this.fs, env = {};
      const def = (name, usage, desc, fn) => { env[name] = fn; self.help[name] = { usage: usage, desc: desc }; self.cmds.add(name); };
      const alias = (name, target) => { env[name] = env[target]; self.cmds.add(name); };
      const needAdmin = () => { if (!self.root) throw new Error('root 権限が必要です（sudo を付けて実行してください）'); };
      const A = p => self.abs(p);
      const flags = args => ({ f: args.filter(a => typeof a === 'string' && /^-[A-Za-z]+$/.test(a)).join(''), rest: args.filter(a => !(typeof a === 'string' && /^-[A-Za-z]+$/.test(a))) });
      const askNewPw = async () => {
        const a = await tty.read('新しいパスワード: ', { mask: true }), b = await tty.read('もう一度: ', { mask: true });
        if (a !== b) throw new Error('パスワードが一致しません');
        return a;
      };

      env.OS = OS; env.fs = fs; env.tty = tty; env.args = [];
      // メッセージバスにこのシェル（のユーザー・PID）としてつなぐ: const b = bus(); await b.call('htmlos.Bus', 'Ping')
      env.bus = () => OS.ipc.connect({ pid: self.proc ? self.proc.pid : 0, user: () => self.user });

      def('help', 'help [コマンド]', 'コマンド一覧・使い方を表示', name => {
        if (name) { const x = self.help[name]; if (!x) throw new Error(name + ': そのようなコマンドはありません'); return x.usage + '\n  ' + x.desc; }
        tty.println('jsh — 入力はJavaScriptです。「ls -l /sys」のようなシェル風の書き方も使えます。', 'dim');
        tty.println('例: ls("/sys").length   /   for (const f of ls()) echo(f)   /   echo hello > memo.txt', 'dim');
        tty.println('パイプ: ls | grep .js | wc -l   /   sort < list.txt   /   つなぐ: cd /tmp && ls ; echo おわり', 'dim');
        const names = Object.keys(self.help).sort(), w = Math.max(...names.map(n => self.help[n].usage.length));
        names.forEach(n => { tty.print(self.help[n].usage.padEnd(w + 2), 'accent'); tty.println(self.help[n].desc); });
      });
      def('echo', 'echo テキスト...', 'テキストを表示', (...a) => { tty.println(a.map(x => typeof x === 'string' ? x : inspect(x)).join(' ')); });
      alias('print', 'echo');
      def('clear', 'clear', '画面を消去', () => { tty.clear(); });
      def('bell', 'bell', 'ベルを鳴らす（Terminal に BEL 文字 \\x07 を出したときと、Tab で補完できないときにも鳴ります）', () => { OS.sound.play('bell'); });
      def('sound', 'sound [on|off|vol 0〜100|play 名前|list]', '効果音の設定（ログイン中はユーザーの設定、ログイン前はシステムの設定）', (sub, arg) => {
        const S = OS.sound, H = OS.htui, user = H && H.running && H.user;
        const save = patch => {
          if (user) H.setPrefs({ sound: Object.assign({}, H.prefs.sound || {}, patch) });
          else OS.config.set('sound', Object.assign({}, OS.config.get('sound', {}) || {}, patch));
        };
        if (!sub) { const p = S.prefs(); return '効果音: ' + (p.on ? 'オン' : 'オフ') + '  音量: ' + Math.round(p.vol * 100) + (user ? '（' + user + ' の設定）' : '（システムの設定）'); }
        if (sub === 'on' || sub === 'off') { save({ on: sub === 'on' }); return '効果音を' + (sub === 'on' ? 'オン' : 'オフ') + 'にしました'; }
        if (sub === 'vol') { const v = Number(arg); if (!(v >= 0 && v <= 100)) throw new Error('sound vol 0〜100'); save({ vol: v / 100 }); S.play('confirm', true); return '音量: ' + v; }
        if (sub === 'list') return S.list().map(n => n.padEnd(10) + S.names[n]).join('\n');
        if (sub === 'play') { if (!S.list().includes(arg)) throw new Error('sound play ' + S.list().join(' / ')); S.play(arg, true); return; }
        throw new Error('使い方: sound [on|off|vol 0〜100|play 名前|list]');
      });
      def('power', 'power [status|lock|hibernate|saver on|off|onsleep lock|hibernate|poweroff|awake on|off]', '電源管理（スリープした場合の動作・省電力モード・スリープさせない）', (sub, arg) => {
        const P = OS.power, H = OS.htui;
        const save = patch => { if (!(H && H.running && H.user)) throw new Error('電源管理の設定は、デスクトップにログインしているときに変えられます'); H.setPrefs({ power: Object.assign({}, H.prefs.power || {}, patch) }); };
        if (!sub || sub === 'status') {
          const p = P.prefs(), b = P.battery;
          return ['スリープした場合: ' + P.actions[p.onSleep] + '（' + p.onSleep + '）',
            '省電力モード: ' + (P.saving ? 'オン' : 'オフ') + (p.saver ? '' : p.autoSaver ? '（自動。バッテリー ' + p.threshold + '% 以下で）' : ''),
            'スリープさせない: ' + (p.keepAwake ? 'オン' + (P.wakeLock ? '' : '（今は効いていません）') : 'オフ'),
            'バッテリー: ' + (P.hasBattery ? Math.round(b.level * 100) + '%' + (b.charging ? '（充電中）' : '') : 'なし（または取得できません）'),
            'powerd.service: ' + (P.running ? '動作中' : '停止中')].join('\n');
        }
        if (sub === 'lock') { if (!H || !H.lock()) throw new Error('ロックできません（デスクトップにログインしていないか、もうロックしています）'); return; }
        if (sub === 'hibernate') { OS.hibernate(); return; }
        if (sub === 'saver') { if (arg !== 'on' && arg !== 'off') throw new Error('使い方: power saver on|off'); save({ saver: arg === 'on' }); return '省電力モードを' + (arg === 'on' ? 'オン' : 'オフ') + 'にしました'; }
        if (sub === 'awake') { if (arg !== 'on' && arg !== 'off') throw new Error('使い方: power awake on|off'); save({ keepAwake: arg === 'on' }); return '端末をスリープさせない: ' + (arg === 'on' ? 'オン' : 'オフ'); }
        if (sub === 'onsleep') { if (!P.actions[arg]) throw new Error((arg || '（なし）') + ': lock / hibernate / poweroff のどれかを指定してください'); save({ onSleep: arg }); return 'スリープした場合: ' + P.actions[arg]; }
        throw new Error('使い方: power [status|lock|hibernate|saver on|off|onsleep lock|hibernate|poweroff|awake on|off]');
      });
      def('bgm', 'bgm [on|off|style 名前|vol 0〜100|list]', 'アンビエントサウンド（BGM）の設定（ログイン中のユーザーの設定）', (sub, arg) => {
        const B = OS.bgm, H = OS.htui, user = H && H.running && H.user;
        const save = patch => { if (!user) throw new Error('BGM はデスクトップにログインしているときに使えます'); H.setPrefs({ bgm: Object.assign({}, H.prefs.bgm || {}, patch) }); };
        if (!sub) { const p = B.prefs(); return 'BGM: ' + (p.on ? 'オン' : 'オフ') + '  曲調: ' + B.styles[p.style].name + '（' + p.style + '）  音量: ' + Math.round(p.vol * 100) + (B.playing ? '  ♪ 再生中' : ''); }
        if (sub === 'on' || sub === 'off') { save({ on: sub === 'on' }); return 'BGM を' + (sub === 'on' ? 'オン' : 'オフ') + 'にしました'; }
        if (sub === 'list') return Object.keys(B.styles).map(k => k.padEnd(8) + B.styles[k].name).join('\n');
        if (sub === 'style') { if (!B.styles[arg]) throw new Error((arg || '（なし）') + ': そのような曲調はありません（' + Object.keys(B.styles).join(' / ') + '）'); save({ style: arg, on: true }); return '曲調: ' + B.styles[arg].name; }
        if (sub === 'vol') { const v = Number(arg); if (!(v >= 0 && v <= 100)) throw new Error('bgm vol 0〜100'); save({ vol: v / 100 }); return '音量: ' + v; }
        throw new Error('使い方: bgm [on|off|style 名前|vol 0〜100|list]');
      });
      def('pwd', 'pwd', '現在のディレクトリ', () => self.cwd);
      def('cd', 'cd [ディレクトリ]', 'ディレクトリを移動', p => { const d = A(p == null ? '~' : p); if (!fs.isDir(d)) throw new Error(d + ': ディレクトリではありません'); fs.list(d); self.cwd = d; });
      def('ls', 'ls [-l] [パス]', '一覧を表示（JSでは名前の配列を返す）', (...args) => {
        const o = flags(args), p = A(o.rest[0]);
        const st = fs.stat(p);
        if (!st) throw new Error(p + ': そのようなファイルはありません');
        const names = st.t === 'd' ? fs.list(p) : [path.base(p)], base = st.t === 'd' ? p : path.dir(p);
        const shown = o.f.includes('a') ? names : names.filter(n => !n.startsWith('.'));
        if (o.f.includes('l')) {
          const PM = OS.perm, who = x => String(x.o || 'root').padEnd(8) + ' ' + String(PM.group(x)).padEnd(8);
          return shown.map(n => {
            const q = path.join(base, n), ls = fs0.lstat(q);
            if (ls && ls.t === 'l') return PM.str(ls, q) + '  ' + who(ls) + '-'.padStart(9) + '  ' + fmtDate(ls.m) + '  ' + n + ' -> ' + ls.c;
            let rq = q; try { rq = fs0.real(q); } catch (e) { /* 壊れたリンク */ }
            const s = fs0.stat(q) || { t: 'f', c: '', m: 0 };
            return PM.str(s, rq) + '  ' + who(s) + (s.t === 'd' ? '-' : s.t === 'p' ? '0' : fmtSize(s.c.length)).padStart(9) + '  ' + fmtDate(s.m) + '  ' + n + (s.t === 'd' ? '/' : s.t === 'p' ? '|' : '');
          }).join('\n');
        }
        const l = Listing.from(shown); l.base = base; return l;
      });
      def('cat', 'cat [ファイル...]', 'ファイルの中身（JSでは文字列を返す。ファイルを省くとパイプの入力をそのまま出す。名前付きパイプは書かれるまで待つ）', (...a) => {
        if (!a.length) return input([]).replace(/\n$/, '');
        const one = p => { const q = A(p), s = fs.stat(q); if (s && s.t === 'p') { if (!fs.access(q, 'r')) fs.read(q); return fifoCat(q); } if (s && s.b) return '[バイナリ ' + fmtSize(s.c.length) + ']'; return fs.read(q); };
        const parts = a.map(one);
        // 名前付きパイプがあるときだけ、待ってから返す（ふつうのファイルは今までどおりすぐ文字列を返す）
        return parts.some(x => x && typeof x.then === 'function') ? Promise.all(parts).then(l => l.join('')) : parts.join('');
      });
      // 名前付きパイプを、だれかが書くまで待って読む（Enter か Ctrl+C でやめる）
      const fifoCat = async q => {
        const stop = tty.capture ? null : tty.read('');
        try { const d = await OS.ipc.fifoRead(fs0.real(q), stop); if (d == null) throw new Error('取りやめました'); return d; }
        finally { if (stop) tty.abort(); }
      };
      def('write', 'write ファイル テキスト', 'ファイルに書き込む（上書き）', (p, ...t) => { fs.write(A(p), t.join(' ')); });
      def('append', 'append ファイル テキスト', 'ファイルの末尾に1行追加', (p, ...t) => { const q = A(p); fs.write(q, (fs.exists(q) ? fs.read(q) : '') + t.join(' ') + '\n'); });
      def('touch', 'touch ファイル', '空のファイルを作る', p => { const q = A(p); if (!fs.exists(q)) fs.write(q, ''); });
      def('mkdir', 'mkdir [-p] ディレクトリ', 'ディレクトリを作る', (...args) => { const o = flags(args); o.rest.forEach(p => fs.mkdir(A(p), { parents: o.f.includes('p') })); });
      def('rm', 'rm [-r] パス...', '削除', (...args) => { const o = flags(args); if (!o.rest.length) throw new Error('削除するパスを指定してください'); o.rest.forEach(p => fs.rm(A(p), { recursive: o.f.includes('r') })); });
      def('cp', 'cp コピー元 コピー先', 'コピー（ディレクトリも可）', (a, b) => { if (a == null || b == null) throw new Error('cp コピー元 コピー先'); fs.cp(A(a), A(b)); });
      def('mv', 'mv 移動元 移動先', '移動・名前変更', (a, b) => { if (a == null || b == null) throw new Error('mv 移動元 移動先'); fs.mv(A(a), A(b)); });
      def('stat', 'stat パス', 'ファイル情報（モード・所有者・グループも）', p => { const q = A(p), s = fs.stat(q); if (!s) throw new Error(q + ': そのようなファイルはありません'); const rq = fs0.real(q), PM = OS.perm; return { path: q, type: s.t === 'd' ? 'directory' : s.t === 'p' ? 'fifo' : 'file', mode: PM.oct(PM.def(rq, s)) + ' (' + PM.str(s, rq) + ')', owner: s.o || 'root', group: PM.group(s), size: s.t === 'f' ? s.c.length : undefined, binary: !!s.b, modified: fmtDate(s.m) }; });
      // grep: ファイルを省くとパイプ（|）の入力から探す。-i 大文字小文字を区別しない / -v 一致しない行 / -n 行番号 / -c 数だけ
      def('grep', 'grep [-i] [-v] [-n] [-c] パターン [ファイル...]', '一致する行を表示（ファイルを省くとパイプの入力から探す）', (...a) => {
        const g = getopts(a), pat = g.rest.shift();
        if (pat == null || pat === '') throw new Error('grep パターン [ファイル...]（例: ls | grep .js）');
        const re = pat instanceof RegExp ? pat : new RegExp(pat, g.o.i ? 'i' : '');
        const many = g.rest.length > 1, res = []; let n = 0;
        const one = (text, name) => lines(text).forEach((l, i) => {
          re.lastIndex = 0;
          if (re.test(l) === !g.o.v) { n++; if (!g.o.c) res.push((many ? name + ':' : '') + (g.o.n ? (i + 1) + ':' : '') + l); }
        });
        if (g.rest.length) g.rest.forEach(f => one(input([f]), f)); else one(input([]), '');
        if (g.o.c) return String(n);
        return res.length ? out(res) : undefined;
      });
      def('df', 'df', 'ストレージ使用量（HDD1 をつないでいればそれも）', () => {
        const u = fs.usage(), rows = ['/          ' + (u.disk ? '使用 ' + fmtSize(u.used) + (u.total ? ' / ' + fmtSize(u.total) + '（' + Math.round(u.used / u.total * 100) + '%）' : '（上限なし）') : '使用 ' + fmtSize(u.used) + ' / 約 ' + fmtSize(u.total) + '（' + Math.round(u.used / u.total * 100) + '%）') + ' [' + OS.storeLabel() + ']'];
        if (OS.hdd.mounted) rows.push(OS.hdd.at.padEnd(11) + 'PC のフォルダ「' + OS.hdd.name + '」 [HDD1]');
        else if (OS.hdd.waiting) rows.push(OS.hdd.at.padEnd(11) + '（未接続: 「' + OS.hdd.waiting + '」。mount hdd1 で接続）');
        return rows.join('\n');
      });
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
          if (!t.pw) throw new Error(name + ' のパスワードが未設定です。' + (name === 'root' ? '管理者が「sudo passwd root」で設定するか、sudo -i で root になれます' : ''));
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
      def('useradd', 'useradd ユーザー名 [admin]', 'ユーザーを追加（root だけ。sudo useradd …）', async (name, role) => {
        needAdmin(); if (!name) throw new Error('ユーザー名を指定してください');
        if (users.get(name)) throw new Error(name + ': すでに存在するユーザーです');
        await users.add(name, await askNewPw(), role === 'admin' || role === true);
        return name + ' を追加しました';
      });
      def('userdel', 'userdel ユーザー名', 'ユーザーとホームを削除（root だけ。sudo userdel …）', async name => {
        needAdmin(); if (!name) throw new Error('ユーザー名を指定してください');
        if (name === self.user) throw new Error('ログイン中の自分は削除できません');
        if ((await tty.read(name + ' とそのホームを削除しますか? [y/N] ')).trim().toLowerCase() !== 'y') return '中止しました';
        users.remove(name); return name + ' を削除しました';
      });
      def('exit', 'exit [終了コード]', 'シェルを終了（suから戻る / ログアウト）。スクリプトの中ではスクリプトを終わる', code => {
        if (self.depth > 0) throw { jshExit: true, code: Number(code) || 0 };
        const prev = self.stack.pop();
        if (prev) { self.user = prev.user; self.cwd = prev.cwd; } else self.exited = true;
      });
      alias('logout', 'exit');

      def('run', 'run スクリプト [引数...]', 'スクリプトを実行。.jsh（か #!/bin/jsh）はシェルスクリプト、ほかは JavaScript。引数は $1… / args', async (p, ...a) => {
        if (!p) throw new Error('スクリプトを指定してください');
        const q = A(p), code = fs.read(q);
        if (Jsh.isShellScript(q, code)) return self.runScript(q, a, code);
        const old = env.args;
        env.args = a;
        try { return await self.compile(code, false)(env); } finally { env.args = old; }
      });
      def('source', 'source スクリプト [引数...]', 'シェルスクリプトを今のシェルで実行（変数・エイリアス・cd がそのまま残る）', async (p, ...a) => {
        if (!p) throw new Error('スクリプトを指定してください');
        return self.runScript(A(p), a);
      });
      def('cmd', 'cmd "コマンド"', 'コマンドを実行して、出力を文字列で返す（JS から: await cmd("ls | wc -l")）', async line => (await self.capture(line == null ? '' : line)).replace(/\n$/, ''));
      def('sleep', 'sleep ミリ秒', '指定時間待つ（await sleep(500)）', ms => new Promise(r => setTimeout(r, Number(ms) || 0)));
      def('read', 'read [プロンプト]', '1行入力を受け取る（await read("? ")）', p => tty.read(p == null ? '' : String(p)));
      def('history', 'history', '入力履歴', () => self.hist.map((l, i) => String(i + 1).padStart(4) + '  ' + l).join('\n'));
      def('date', 'date', '現在の日時', () => new Date().toLocaleString('ja-JP'));
      def('uname', 'uname', 'システム情報', () => OS.name + ' ' + OS.version + ' [' + OS.htui.sdk.full + '] (' + (OS.store.ram ? 'ramdisk' : OS.store.disk ? 'hdd1' : 'localstorage') + ') ' + navigator.userAgent);
      def('neofetch', 'neofetch', 'システム情報をそれっぽく表示', () => {
        const u = fs.usage(), art = ['  <  / >  ', ' <  /  > ', '<  /   >', ' <  /  > ', '  <  / >  ', '          '];
        const who = self.user + '@' + OS.hostname(), de = OS.htui.running && OS.htui.sessionId ? (OS.sessions[OS.htui.sessionId].full || OS.sessions[OS.htui.sessionId].name) : 'なし（CUI）';
        const info = [who, '-'.repeat(who.length), 'OS: ' + OS.name + ' (' + OS.version + ')' + (OS.live ? ' (Live)' : ''), 'Shell: jsh', 'UI: ' + OS.htui.sdk.full, 'DE: ' + de, 'Disk: ' + fmtSize(u.used) + (u.disk && !u.total ? '' : ' / ' + fmtSize(u.total)) + ' (' + (OS.store.ram ? 'RAM' : OS.storeLabel()) + ')'];
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
        if (sub === 'sessions') return Object.values(OS.sessions).filter(s => !s.hidden).map(s => s.id.padEnd(7) + s.name + (OS.htui.sessionId === s.id ? '  ← 使用中' : '')).join('\n');
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
      def('hmd', 'hmd [ファイル]', 'Markdown エディター（コードとプレビュー）', p => { OS.launch('hmd', p == null ? null : A(p)); });
      def('hmines', 'hmines', 'マインスイーパー風のゲーム', () => { OS.launch('hmines'); });
      def('htictactoe', 'htictactoe', '三目並べ（CPU・二人で対戦、マスの数を変えられる）', () => { OS.launch('htictactoe'); });
      alias('ttt', 'htictactoe');
      def('hreversi', 'hreversi', 'リバーシ（CPU・二人で対戦）', () => { OS.launch('hreversi'); });
      // ---- HTUi Studio の TUI（矢印キー・Enter・Esc で操作する CLI 版）
      async function studioTui(S, startDir) {
        const scr = tty.screen();
        const W = 56, line = '─'.repeat(W);
        let logRows = [];
        const say = (s, c) => { logRows.push([s, c || null]); if (logRows.length > 12) logRows = logRows.slice(-12); };
        const sayLog = r => r.log.forEach(l => say(S.fmt(l), l.lv === 'err' ? 'err' : l.lv === 'ok' ? 'ok' : l.lv === 'warn' ? 'accent' : 'dim'));
        const head = sub => [[['HTUi Studio ' + S.version, 'head'], ['  TUI ・ ' + OS.htui.sdk.full + ' ・ ' + OS.name, 'dim']], line].concat(sub ? [[sub, 'accent'], ''] : []);
        const foot = keys => ['', line, [keys || '↑↓ 選ぶ   Enter 決める   Esc 戻る', 'dim']];
        const logBlock = () => logRows.length ? ['', ['── 記録 ──', 'dim']].concat(logRows.map(r => r[1] ? [r] : r[0])) : [];
        // メニュー。items: [{ label, hint, value, disabled }]。選んだ value か、Esc なら null
        async function menu(sub, items, o) {
          o = o || {};
          let i = Math.max(0, items.findIndex(x => !x.disabled)), top = o.info || [];
          if (o.at !== undefined) { const j = items.findIndex(x => x.value === o.at && !x.disabled); if (j >= 0) i = j; } // 前に選んでいた項目から
          for (;;) {
            const rows = head(sub).concat(top, top.length ? [''] : [], items.map((it, k) => k === i ? [['▶ ' + it.label + ' ', 'sel']] : [[(it.disabled ? '  ' + it.label : '  ' + it.label), it.disabled ? 'dim' : null]]),
              ['', [items[i] && items[i].hint ? '  ' + items[i].hint : ' ', 'dim']], logBlock(), foot(o.keys));
            scr.render(rows);
            const k = await scr.key();
            const step = d => { let j = i; for (let n = 0; n < items.length; n++) { j = (j + d + items.length) % items.length; if (!items[j].disabled) { i = j; return; } } };
            if (k.key === 'ArrowUp' || (k.key === 'Tab' && k.shift)) step(-1);
            else if (k.key === 'ArrowDown' || k.key === 'Tab') step(1);
            else if (k.key === 'Home') { i = -1; step(1); } else if (k.key === 'End') { i = items.length; step(-1); }
            else if (k.key === 'Enter' || k.key === 'ArrowRight') { if (items[i] && !items[i].disabled) return items[i].value; }
            else if (k.key === 'Escape' || k.key === 'ArrowLeft' || (k.ctrl && k.key === 'c')) return null;
            else if (k.key === 'text' && o.letters !== false) { const c = k.text.slice(-1).toLowerCase(), j = items.findIndex((x, n) => n > i && !x.disabled && x.label.toLowerCase().startsWith(c)); const j2 = j >= 0 ? j : items.findIndex(x => !x.disabled && x.label.toLowerCase().startsWith(c)); if (j2 >= 0) i = j2; }
          }
        }
        // 1 行の入力。Enter で決定、Esc で null
        async function input(sub, label, o) {
          o = o || {};
          let v = o.value || '';
          for (;;) {
            const shown = o.mask ? '*'.repeat(v.length) : v;
            scr.render(head(sub).concat(o.info || [], o.info ? [''] : [], [[[label + ' ', 'prompt'], [shown, null], ['▏', 'accent']]], o.preview ? ['', [o.preview(v), 'dim']] : [], o.error ? ['', [o.error, 'err']] : [], foot('文字を入力   Enter 決める   Backspace 消す   Esc やめる')));
            const k = await scr.key();
            o.error = null;
            if (k.key === 'text') v += k.text;
            else if (k.key === 'Backspace') v = Array.from(v).slice(0, -1).join('');
            else if (k.key === 'Enter') { if (o.check) { const e = o.check(v); if (e) { o.error = e; continue; } } return v; }
            else if (k.key === 'Escape' || (k.ctrl && k.key === 'c')) return null;
            else if (k.ctrl && k.key === 'u') v = '';
          }
        }
        // ↑↓ で送って読むだけの画面
        async function pager(sub, text) {
          const ls = String(text).split('\n'); let at = 0;
          const H = Math.max(8, Math.floor((tty.el.clientHeight || 400) / 20) - 8);
          for (;;) {
            scr.render(head(sub).concat(ls.slice(at, at + H).map((l, k) => [[String(at + k + 1).padStart(4) + '  ', 'dim'], [l, null]]), foot('↑↓ PageUp/PageDown 送る   Esc 戻る   （' + (at + 1) + '〜' + Math.min(ls.length, at + H) + ' / ' + ls.length + ' 行）')));
            const k = await scr.key();
            if (k.key === 'ArrowDown') at = Math.min(Math.max(0, ls.length - H), at + 1);
            else if (k.key === 'ArrowUp') at = Math.max(0, at - 1);
            else if (k.key === 'PageDown' || k.key === 'ArrowRight') at = Math.min(Math.max(0, ls.length - H), at + H);
            else if (k.key === 'PageUp') at = Math.max(0, at - H);
            else if (k.key === 'Escape' || k.key === 'Enter' || k.key === 'ArrowLeft' || (k.ctrl && k.key === 'c')) return;
          }
        }
        async function confirm(sub, text, ok) {
          return (await menu(sub, [{ label: ok || 'はい', value: true }, { label: 'いいえ', value: false }], { info: text.split('\n') })) === true;
        }

        async function newProject() {
          const type = await menu('新しいプロジェクト ▸ 種類', Object.keys(S.TYPES).map(k => ({ label: S.TYPES[k].label + '（' + k + '）', hint: S.TYPES[k].desc, value: k })));
          if (!type) return null;
          const name = await input('新しいプロジェクト ▸ ' + S.TYPES[type].label, '名前:', {
            preview: v => v.trim() ? 'ID: ' + S.slug(v, type) + '   保存先: ~/Projects/' + v.trim() : 'ID と保存先は名前から決まります',
            check: v => { if (!v.trim()) return '名前を入れてください'; if (fs.exists(path.join(S.projectsDir(self.user), v.trim()))) return 'その名前のプロジェクトはもうあります'; return null; } });
          if (name == null) return null;
          try { const dir = S.create(fs, self.user, type, name); say('✓ ' + S.TYPES[type].label + 'のプロジェクトを作りました: ' + dir, 'ok'); return dir; }
          catch (e) { say('✗ ' + e.message, 'err'); return null; }
        }
        async function pickProject() {
          const l = S.list(fs, self.user);
          if (!l.length) { say('! ~/Projects にプロジェクトがありません', 'accent'); return null; }
          return menu('プロジェクトを開く', l.map(p => ({ label: p.meta.name, hint: (S.TYPES[p.meta.type] || {}).label + ' ・ ' + p.meta.id + ' ・ ' + p.meta.version + ' ・ ' + p.dir, value: p.dir })));
        }
        async function settings(p) {
          const m = p.meta;
          for (;;) {
            const f = await menu(m.name + ' ▸ 設定', [
              { label: '名前: ' + m.name, value: 'name' }, { label: 'ID: ' + m.id, value: 'id', hint: 'main.js の中の ID も合わせて書き換えてください' }, { label: '版: ' + m.version, value: 'version' },
              { label: '説明: ' + (m.desc || ''), value: 'desc' }, { label: 'アイコン: ' + m.icon, value: 'icon' }, { label: '色: ' + m.color, value: 'color' }, { label: '戻る', value: null }]);
            if (!f) return;
            let v;
            if (f === 'icon') v = await menu(m.name + ' ▸ アイコン', (OS.iconNames || []).map(n => ({ label: n, value: n })), { info: ['いまは ' + m.icon] });
            else if (f === 'color') v = await menu(m.name + ' ▸ 色', ['#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac', '#4a3aa8', '#5e5c64'].map(c => ({ label: c, value: c })));
            else v = await input(m.name + ' ▸ 設定', f + ':', { value: String(m[f] || ''), check: x => f === 'id' && !/^[a-z][a-z0-9-]*$/.test(x) ? 'ID は英小文字で始まり、英小文字・数字・- だけにしてください' : null });
            if (v == null) continue;
            m[f] = v; try { S.saveMeta(fs, p); say('✓ project.json を保存しました（' + f + '）', 'ok'); } catch (e) { say('✗ ' + e.message, 'err'); }
          }
        }
        async function files(p) {
          let last;
          const walk = (d, out) => { fs.list(d).sort().forEach(n => { const q = path.join(d, n); if (fs.isDir(q)) walk(q, out); else out.push(q); }); return out; };
          for (;;) {
            const l = walk(p.dir, []);
            const f = await menu(p.meta.name + ' ▸ ファイル', l.map(q => ({ label: q.slice(p.dir.length + 1), hint: OS.htui.running && OS.htui.user ? 'Enter で hedit で開く' : 'Enter で中身を見る（HTUi を起動すると hedit で編集できます）', value: q })).concat([{ label: '戻る', value: null }]), { keys: '↑↓ 選ぶ   Enter 開く   Esc 戻る', at: last });
            if (!f) return;
            last = f;
            if (OS.htui.running && OS.htui.user) { try { OS.launch('hedit', f); say('hedit で開きました: ' + f, 'dim'); } catch (e) { await pager(f, fs.read(f)); } }
            else await pager(f, fs.read(f));
          }
        }
        async function project(dir) {
          let p, last;
          try { p = S.load(fs, dir); } catch (e) { say('✗ ' + e.message, 'err'); return; }
          for (;;) {
            const m = p.meta, T = S.TYPES[m.type] || { label: m.type };
            const gui = OS.htui.running && OS.htui.user;
            const act = await menu(m.name + '（' + T.label + '）', [
              { label: '▷ 実行（インストールせずに試す）', value: 'run', hint: m.type === 'app' ? (gui ? 'アプリを起動します' : 'HTUi が起動していないので、登録だけします') : m.type === 'cmd' ? '引数を入れて、このシェルで実行します' : 'デスクトップ環境を切り替えます' },
              { label: 'ビルド', value: 'build', hint: 'build/' + m.id + '.js を作ります' },
              { label: 'インストール', value: 'install', hint: '/apps に入れます（root のパスワードが要ります）' },
              { label: 'ファイル', value: 'files', hint: 'main.js などを開く・読む' },
              { label: 'プロジェクトの設定', value: 'settings', hint: '名前・ID・版・説明・アイコン・色' },
              { label: 'GUI 版で開く', value: 'gui', disabled: !gui, hint: 'HTUi Studio のウインドウで開きます' },
              { label: '戻る', value: null }], { at: last, info: [['ID ' + m.id + ' ・ 版 ' + m.version + ' ・ ' + p.dir, 'dim'], [m.desc || '', 'dim']] });
            if (!act) return;
            last = act;
            if (act === 'build') sayLog(S.build(fs, p));
            else if (act === 'run') {
              if (m.type === 'cmd') {
                const a = await input(m.name + ' ▸ 実行', m.id, { info: ['引数を入れて Enter（なしでもかまいません）'] });
                if (a == null) continue;
                const r = S.run(fs, p, {}); sayLog(r);
                if (r.ok) { const out = await self.capture(m.id + (a.trim() ? ' ' + a : '')); say('$ ' + m.id + (a.trim() ? ' ' + a : ''), 'prompt'); out.replace(/\n$/, '').split('\n').slice(-8).forEach(l => say(l)); }
              } else if (m.type === 'de') {
                if (!gui) { const r = S.run(fs, p, { launch: false }); sayLog(r); if (r.ok) say('HTUi を起動するときに  htui start ' + m.id + '  で選べます', 'dim'); continue; }
                if (!(await confirm(m.name + ' ▸ 実行', m.name + ' に切り替えます。開いているウインドウ（この Terminal も）は閉じます。\n戻すときは  htui session htui  です。', '切り替える'))) continue;
                const r = S.run(fs, p, { launch: false }); sayLog(r);
                if (r.ok) { scr.close(); setTimeout(() => OS.htui.switchSession(m.id), 200); return 'quit'; }
              } else sayLog(S.run(fs, p, {}));
            } else if (act === 'install') {
              if (!(await confirm(m.name + ' ▸ インストール', m.id + '.js を /apps にインストールします。再起動しても使えるようになります。', 'インストール'))) continue;
              let who = self.user;
              if (!self.root) {
                const pw = await input(m.name + ' ▸ インストール', 'root のパスワード:', { mask: true });
                if (pw == null) continue;
                if (!(await users.verify('root', pw))) { say('✗ 認証に失敗しました', 'err'); continue; }
                who = 'root';
              }
              try { sayLog(S.install(fs, p, who)); } catch (e) { say('✗ ' + e.message, 'err'); }
            } else if (act === 'files') await files(p);
            else if (act === 'settings') await settings(p);
            else if (act === 'gui') { try { OS.launch('hstudio', p.dir); say('GUI 版で開きました', 'dim'); } catch (e) { say('✗ ' + e.message, 'err'); } }
          }
        }

        try {
          if (startDir && (await project(startDir)) === 'quit') return;
          let last;
          for (;;) {
            const n = S.list(fs, self.user).length;
            const act = await menu('', [
              { label: '新しいプロジェクト', value: 'new', hint: 'アプリケーション・コマンド・デスクトップ環境をテンプレートから作ります' },
              { label: 'プロジェクトを開く', value: 'open', hint: '~/Projects にあるプロジェクト（' + n + ' 個）', disabled: !n },
              { label: 'GUI 版を開く', value: 'gui', hint: 'HTUi Studio のウインドウを開きます', disabled: !(OS.htui.running && OS.htui.user) },
              { label: '終了', value: 'quit', hint: 'Esc でも終了します' }], { at: last });
            last = act;
            if (!act || act === 'quit') break;
            if (act === 'new') { const d = await newProject(); if (d && (await project(d)) === 'quit') return; }
            else if (act === 'open') { const d = await pickProject(); if (d && (await project(d)) === 'quit') return; }
            else if (act === 'gui') { try { OS.launch('hstudio'); say('GUI 版を開きました', 'dim'); } catch (e) { say('✗ ' + e.message, 'err'); } }
          }
        } finally { if (tty._screen === scr) scr.close(); }
        return 'HTUi Studio を終了しました';
      }
      // HTUi Studio の CLI 版（GUI 版と同じ OS.studio を使う）。引数なしで TUI、サブコマンドはスクリプトからも使える
      def('hstudio', 'hstudio [tui [プロジェクト]] / new app|cmd|de 名前 / list / build / run / install / open [プロジェクト]', 'HTUi Studio（アプリ・コマンド・デスクトップ環境を作る）。引数なしで矢印キーで操作する TUI', async (sub, ...a) => {
        if (!OS.studio) { try { OS.loadFile('/sys/apps/24-hstudio.js'); } catch (e) { /* 下で知らせる */ } }
        const S = OS.studio;
        if (!S) throw new Error('HTUi Studio が見つかりません');
        const usage = ['使い方: hstudio            矢印キー・Enter・Esc で操作する TUI を開く',
          '       hstudio tui [プロジェクト]  TUI でプロジェクトを開く',
          '       hstudio <サブコマンド>（スクリプト向け）',
          '  new app|cmd|de 名前   新しいプロジェクトを ~/Projects/名前 に作る（app=アプリケーション, cmd=コマンド, de=デスクトップ環境）',
          '  list                  ~/Projects のプロジェクトの一覧',
          '  build [プロジェクト]   ビルドして build/ID.js を作る',
          '  run [プロジェクト] [引数…]  インストールせずに試す（コマンドは引数を付けて実行、アプリは起動、デスクトップ環境は切り替え）',
          '  install [プロジェクト] /apps にインストール（root のパスワードが要る）',
          '  open [プロジェクト]    GUI 版で開く',
          '  templates             作れるものの一覧',
          'プロジェクトは名前（~/Projects の中）かフォルダのパス。省略すると今のディレクトリ'].join('\n');
        if (sub === 'help' || sub === '-h' || sub === '--help') return usage;
        const projOf = p => {
          const cands = p ? [A(p), path.join(S.projectsDir(self.user), p)] : [self.cwd];
          for (const d of cands) if (S.isProject(fs, d)) return S.load(fs, d);
          throw new Error((p || self.cwd) + ': HTUi Studio のプロジェクトが見つかりません（hstudio list で一覧）');
        };
        const show = r => { r.log.forEach(l => tty.println(S.fmt(l), l.lv === 'err' ? 'err' : l.lv === 'ok' ? 'ok' : l.lv === 'warn' ? 'accent' : 'dim')); if (!r.ok) throw Object.assign(new Error('失敗しました'), { quietExit: true }); };
        if (!sub || sub === 'tui') {
          if (tty.capture) return usage; // パイプやリダイレクトの中では画面を出せない
          return studioTui(S, a[0] ? projOf(a[0]).dir : null);
        }
        if (sub === 'templates') return Object.keys(S.TYPES).map(k => k.padEnd(4) + S.TYPES[k].label + ' — ' + S.TYPES[k].desc).join('\n');
        if (sub === 'new') {
          const type = a[0], name = a.slice(1).join(' ');
          if (!S.TYPES[type] || !name) throw new Error('hstudio new app|cmd|de 名前');
          const dir = S.create(fs, self.user, type, name);
          return S.TYPES[type].label + 'のプロジェクトを作りました: ' + dir + '\n  main.js を書いたら  hstudio run "' + name + '"  で試せます';
        }
        if (sub === 'list') {
          const l = S.list(fs, self.user);
          if (!l.length) return 'プロジェクトはありません（hstudio new app 名前 で作れます）';
          return l.map(p => (p.meta.id || '').padEnd(16) + (S.TYPES[p.meta.type] ? S.TYPES[p.meta.type].label : '?').padEnd(10) + p.meta.version.padEnd(8) + p.dir).join('\n');
        }
        if (sub === 'build') { show(S.build(fs, projOf(a[0]))); return; }
        if (sub === 'run') {
          // プロジェクトが省略されていて、最初の引数がプロジェクトでなければ、今のディレクトリのプロジェクトに引数を渡す
          let p, rest;
          try { p = projOf(a[0]); rest = a.slice(1); } catch (e) { if (!a.length) throw e; p = projOf(null); rest = a; }
          const m = p.meta;
          const r = S.run(fs, p, { launch: m.type !== 'de' });
          show(r);
          if (m.type === 'cmd') { self.syncCommands(); return env[m.id](...rest); }
          if (m.type === 'de') { if (!OS.htui.running || !OS.htui.user) return 'HTUi を起動すると選べます（htui start ' + m.id + '）'; setTimeout(() => OS.htui.switchSession(m.id), 0); return m.name + ' に切り替えます（戻すときは htui session htui）'; }
          return;
        }
        if (sub === 'install') {
          const p = projOf(a[0]);
          let who = self.user;
          if (!self.root) {
            if (!(await users.verify('root', await tty.read('root のパスワード: ', { mask: true })))) throw new Error('認証に失敗しました');
            who = 'root';
          }
          show(S.install(fs, p, who)); return;
        }
        if (sub === 'open') {
          let d = null;
          if (a[0] || S.isProject(fs, self.cwd)) d = projOf(a[0]).dir;
          OS.launch('hstudio', d); return;
        }
        throw new Error(usage);
      });
      alias('studio', 'hstudio');
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
      def('reboot', 'reboot [i|safe|cui|gui]', '再起動（i: htmlOS i、safe: セーフモード、cui: jsh、gui: デスクトップで起動）', m => { if (m != null && !['i', 'safe', 'cui', 'gui'].includes(m)) throw new Error('reboot i / safe / cui / gui のどれかにしてください'); OS.reboot(m || undefined); });
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
      Object.defineProperty(env, '__getopts', { value: getopts, enumerable: false });
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

      // sed: s/パターン/置き換え/フラグ だけ使える。パターンは JavaScript の正規表現、置き換えでは $1 や $& が使える
      def('sed', "sed 's/パターン/置き換え/[g][i]' [ファイル...]", '各行の文字を置き換える（例: ls | sed s/.txt/.md/）', (...a) => {
        const g = getopts(a), cmd = String(g.rest.shift() || ''), d = cmd[1];
        if (cmd[0] !== 's' || !d || /[\w\s\\]/.test(d)) throw new Error("sed 's/パターン/置き換え/g' の形で書いてください");
        const parts = []; let cur = '';
        for (let i = 2; i < cmd.length; i++) { if (cmd[i] === '\\' && cmd[i + 1] === d) { cur += d; i++; } else if (cmd[i] === d) { parts.push(cur); cur = ''; } else cur += cmd[i]; }
        parts.push(cur);
        if (parts.length !== 3 || /[^gim]/.test(parts[2])) throw new Error("sed 's/パターン/置き換え/g' の形で書いてください");
        const re = new RegExp(parts[0], parts[2]);
        return out(lines(input(g.rest)).map(l => l.replace(re, parts[1])));
      });

      // xargs: パイプで受け取った文字を、空白や改行で区切ってコマンドの引数の後ろに並べて実行する
      def('xargs', 'xargs コマンド [引数...]', '受け取った文字を引数にしてコマンドを実行（例: find ~ -name "*.tmp" | xargs rm）', async (cmd, ...rest) => {
        if (!cmd) throw new Error('xargs コマンド [引数...]');
        if (!self.cmds.has(cmd) || !env[cmd] || cmd === 'xargs') throw new Error(cmd + ': そのようなコマンドはありません');
        const words = splitArgs(input([]).replace(/\n/g, ' '));
        self.stdin = null;
        return env[cmd](...rest, ...words);
      });

      // ======== ドライブ（HDD1 = File System Access API で選んだ PC のフォルダ）
      def('mount', 'mount [hdd1] [-p]', 'ドライブの一覧。mount hdd1 で PC のフォルダを /mnt/hdd1 に接続（-p でフォルダを選び直す）', async (...a) => {
        const g = getopts(a), dev = g.rest[0];
        if (!dev) {
          const rows = [OS.hdd.root ? 'hdd1   /           PC のフォルダ「' + OS.hdd.name + '」（ここから起動）' : 'hdd0   /           ' + OS.storeLabel()];
          if (!OS.hdd.root) rows.push('hdd1   ' + OS.hdd.at.padEnd(12) + (OS.hdd.mounted ? 'PC のフォルダ「' + OS.hdd.name + '」' : OS.hdd.supported ? '未接続' + (OS.hdd.waiting ? '（「' + OS.hdd.waiting + '」の許可待ち）' : '') + ' — mount hdd1 で接続' : 'このブラウザでは使えません'));
          return rows.join('\n');
        }
        if (dev !== 'hdd1') throw new Error(dev + ': そのようなドライブはありません（使えるのは hdd1 です）');
        if (g.o.p && OS.hdd.mounted) await OS.hdd.unmount();
        tty.println('HDD1 を読み込んでいます…', 'dim');
        const r = await OS.hdd.mount(!!g.o.p);
        return 'HDD1（PC のフォルダ「' + r.name + '」）を ' + OS.hdd.at + ' に接続しました（' + r.items + ' 項目' + (r.skipped.length ? '。32MB を超える ' + r.skipped.length + ' 個のファイルは読み込んでいません' : '') + '）';
      });
      def('umount', 'umount hdd1', 'HDD1 を切り離す（PC のフォルダの中身はそのまま）', async dev => {
        if (dev != null && dev !== 'hdd1' && dev !== OS.hdd.at) throw new Error(dev + ': そのようなドライブはありません');
        await OS.hdd.unmount();
        if (self.cwd === OS.hdd.at || self.cwd.startsWith(OS.hdd.at + '/')) self.cwd = self.home;
        return 'HDD1 を切り離しました';
      });

      // ======== システム情報・シェル
      def('free', 'free', 'メモリとストレージの使用量', () => {
        const pm = performance.memory, u = fs.usage(), rows = [['', '合計', '使用', '空き']];
        if (pm) rows.push(['JS ヒープ', fmtSize(pm.jsHeapSizeLimit), fmtSize(pm.usedJSHeapSize), fmtSize(pm.jsHeapSizeLimit - pm.usedJSHeapSize)]);
        rows.push(u.disk ? ['HDD1', u.total ? fmtSize(u.total) : '-', fmtSize(u.used), u.total ? fmtSize(Math.max(0, u.total - u.used)) : '-'] : [OS.store.ram ? 'RAM ディスク' : 'LocalStorage', fmtSize(u.total), fmtSize(u.used), fmtSize(Math.max(0, u.total - u.used))]);
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
      // グループの番号: root 0・sudo 27・ユーザーと同じ名前のグループはその uid・ほかは 3000 番台
      const gidOf = g => { if (g === 'root') return 0; if (g === 'sudo') return 27; if (users.get(g)) return idOf(g); let h = 0; for (const c of g) h = (h * 31 + c.charCodeAt(0)) % 997; return 3000 + h; };
      def('id', 'id [ユーザー名]', 'ユーザーの ID と所属グループ', name => {
        name = name || self.user; const uid = idOf(name);
        const groups = OS.perm.groupsOf(name).map(g => gidOf(g) + '(' + g + ')');
        return 'uid=' + uid + '(' + name + ') gid=' + uid + '(' + name + ') groups=' + groups.join(',');
      });
      // ---- パーミッション・sudo・IPC（5.1 から）
      const P = OS.perm;
      const walkR = (q, fn) => { fn(q); try { if (fs0.isDir(q) && !fs0.isLink(q)) fs.list(q).forEach(n => walkR(path.join(q, n), fn)); } catch (e) { /* 読めない所は飛ばす */ } };
      def('chmod', 'chmod [-R] モード パス...', 'パーミッションを変える。モードは 755 のような 8 進か、u+x・go-w・a=r のような記号（所有者か root）', (...args) => {
        const o = flags(args.map(String).map(x => /^-[rwxXst]+$/.test(x) ? '\u0000' + x : x));
        const rest = o.rest.map(x => x.replace(/^\u0000/, ''));
        if (rest.length < 2) throw new Error('使い方: chmod [-R] モード パス...（例: chmod +x hello.jsh / chmod 600 秘密.txt）');
        const mode = rest[0];
        rest.slice(1).forEach(p => { const q = A(p); (o.f.includes('R') ? f => walkR(q, f) : f => f(q))(x => fs.chmod(x, mode)); });
      });
      def('chown', 'chown [-R] ユーザー[:グループ] パス...', '所有者（とグループ）を変える（root だけ。sudo chown …）', (...args) => {
        const o = flags(args); if (o.rest.length < 2) throw new Error('使い方: chown [-R] ユーザー[:グループ] パス...');
        const [ow, gr] = String(o.rest[0]).split(':');
        o.rest.slice(1).forEach(p => { const q = A(p); (o.f.includes('R') ? f => walkR(q, f) : f => f(q))(x => fs.chown(x, ow || null, gr || null)); });
      });
      def('chgrp', 'chgrp [-R] グループ パス...', 'グループを変える（そのグループに入っている所有者か root）', (...args) => {
        const o = flags(args); if (o.rest.length < 2) throw new Error('使い方: chgrp [-R] グループ パス...');
        o.rest.slice(1).forEach(p => { const q = A(p); (o.f.includes('R') ? f => walkR(q, f) : f => f(q))(x => fs.chown(x, null, String(o.rest[0]))); });
      });
      def('umask', 'umask [8 進数]', '新しく作るファイルから外すパーミッション（既定 022）', m => {
        if (m == null) return P.oct(self.umask).slice(1);
        if (!/^[0-7]{1,4}$/.test(String(m))) throw new Error('umask は 022 のような 8 進数で');
        self.umask = parseInt(m, 8) & 0o777;
      });
      def('groups', 'groups [ユーザー名]', '所属しているグループ', name => P.groupsOf(name || self.user).join(' '));
      def('usermod', 'usermod -aG グループ ユーザー / usermod -rG グループ ユーザー', 'ユーザーをグループに入れる・外す（root だけ）', (op, grp, name) => {
        if (!self.root) throw new Error('usermod には root 権限が必要です（sudo usermod …）');
        if (!/^-(a|r)G$/.test(op || '') || !grp || !name) throw new Error('使い方: usermod -aG グループ ユーザー（外すときは -rG）');
        const u = users.get(name); if (!u) throw new Error(name + ': そのようなユーザーはいません');
        if (!/^[a-z_][a-z0-9_-]{0,15}$/.test(grp)) throw new Error('グループ名は英小文字で始め、英小文字・数字・_ - で');
        const g = new Set(u.groups || []); if (op === '-aG') g.add(grp); else g.delete(grp);
        users.update(name, { groups: Array.from(g) });
        return name + ': ' + P.groupsOf(name).join(' ');
      });
      def('mkfifo', 'mkfifo パス...', '名前付きパイプを作る（書き込んだ文字が、読んでいる相手に届く）', (...a) => {
        if (!a.length) throw new Error('使い方: mkfifo パス');
        a.forEach(p => fs.mkfifo(A(p)));
      });
      def('sudo', 'sudo [-u ユーザー] コマンド... / sudo -i / sudo -s / sudo -k / sudo -l', 'root（や -u のユーザー）としてコマンドを実行。自分のパスワードで認証し、5 分間は聞かない', async (...a) => {
        let target = 'root', mode = null, i = 0;
        for (; i < a.length; i++) {
          const x = String(a[i]);
          if (x === '-u') target = String(a[++i]);
          else if (x === '-i' || x === '-s' || x === '-k' || x === '-K' || x === '-l' || x === '-v') mode = x;
          else if (x === '--') { i++; break; }
          else break;
        }
        const words = a.slice(i).map(String);
        if (mode === '-k' || mode === '-K') { OS.sudo.forget(self.user); return; }
        const r = OS.sudo.rule(self.user);
        if (mode === '-l') {
          if (self.root) return 'root は何でも実行できます';
          if (!r.ok) return self.user + ' は sudo を使えません';
          return self.user + ' は次のコマンドを root として実行できます:\n    ' + r.line + (OS.sudo.fresh(self.user) ? '\n（いまはパスワードなしで実行できます。残り ' + Math.ceil((OS.sudo.TIMEOUT - (Date.now() - OS.sudo.stamps[self.user])) / 60000) + ' 分）' : '');
        }
        if (!users.get(target)) throw new Error('sudo: ' + target + ': そのようなユーザーはいません');
        const what = mode === '-i' || mode === '-s' ? '（シェル）' : words.join(' ');
        if (!self.root && words.length && !OS.sudo.allows(r, words[0]) && r.ok) { OS.sudo.log(self.user + ' : ' + words[0] + ' は許可されていません', 3); throw new Error('sudo: ' + self.user + ' は ' + words[0] + ' を ' + target + ' として実行することを許可されていません'); }
        const ok = await OS.sudo.auth(self.user, n => tty.read((n > 1 ? 'すみません、もう一度試してください。\n' : '') + '[sudo] ' + self.user + ' のパスワード: ', { mask: true }).then(v => v ? v : null), what);
        if (!ok) throw new Error('sudo: 取りやめました');
        if (mode === '-v') return;
        OS.sudo.log(self.user + ' : USER=' + target + ' ; PWD=' + self.cwd + ' ; COMMAND=' + what, 6);
        if (mode === '-i' || mode === '-s' || !words.length) {
          self.stack.push({ user: self.user, cwd: self.cwd });
          self.user = target; if (mode === '-i') self.cwd = users.home(target);
          return;
        }
        // コマンドはそのまま呼ぶ（入力のパイプ・戻り値もそのまま）。リダイレクト（>）は sudo の外の、自分の権限で行われる
        const prev = self.user, name = words[0];
        self.user = target;
        try {
          if (self.cmds.has(name) && self.env[name]) return await self.env[name](...words.slice(1));
          const sc = /[\/]/.test(name) ? self.abs(name) : self.findScript(name);
          if (!sc || !fs.isFile(sc)) throw new Error('sudo: ' + name + ': コマンドが見つかりません');
          if (!fs.canExec(sc)) throw new Error('sudo: ' + sc + ': 実行する許可がありません（chmod +x ' + sc + '）');
          return await self.env.run(sc, ...words.slice(1));
        } finally { self.user = prev; }
      });
      def('ipc', 'ipc list / call 名前 メソッド [引数...] / pub トピック [データ] / monitor [トピック] / listen トピック / introspect 名前', 'プロセス間通信（メッセージバス）を使う', async (sub, ...a) => {
        const I = OS.ipc; if (!I) throw new Error('IPC が読み込まれていません');
        const val = x => { try { return JSON.parse(x); } catch (e) { return x; } };
        const ep = () => I.connect({ pid: self.proc ? self.proc.pid : 0, user: self.user });
        const show = v => v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 1);
        if (!sub || sub === 'list') {
          const l = I.list(); if (!l.length) return '（バスに名前はありません）';
          return ['名前                       PID  ユーザー  説明'].concat(l.map(x => x.name.padEnd(26) + String(x.pid).padStart(4) + '  ' + String(x.user).padEnd(8) + '  ' + (x.desc || ''))).join('\n');
        }
        if (sub === 'introspect') { const x = I.list().find(n => n.name === a[0]); if (!x) throw new Error((a[0] || '') + ': その名前はバスにありません'); return x.name + '（PID ' + x.pid + '）' + (x.desc ? ' — ' + x.desc : '') + '\n' + x.methods.map(m => '  ' + m.name + (m.doc ? '  ' + m.doc : '')).join('\n'); }
        if (sub === 'call') { if (a.length < 2) throw new Error('使い方: ipc call 名前 メソッド [引数...]'); const e = ep(); try { return show(await e.call(a[0], a[1], ...a.slice(2).map(val))); } finally { e.close(); } }
        if (sub === 'pub') { if (!a[0]) throw new Error('使い方: ipc pub トピック [データ]'); const e = ep(); e.publish(a[0], a.length > 1 ? val(a.slice(1).join(' ')) : null); e.close(); return; }
        if (sub === 'listen') {
          if (!a[0]) throw new Error('使い方: ipc listen トピック（1 つ届くまで待つ）');
          const e = ep();
          try { return await new Promise((res, rej) => { e.subscribe(a[0], (d, m) => res(m.topic + ' ' + show(d))); if (!tty.capture) tty.read('').then(v => { if (v != null) rej(new Error('取りやめました')); }); }); } finally { e.close(); tty.abort(); }
        }
        if (sub === 'monitor') {
          if (tty.capture) throw new Error('ipc monitor はパイプの中では使えません');
          tty.println('バスを見ています' + (a[0] ? '（' + a[0] + '）' : '') + '。Enter か Ctrl+C で終了', 'dim');
          const off = I.monitor(m => {
            if (a[0] && !I.match(a[0], m.topic || (m.to + '.' + m.method))) return;
            const t = new Date(m.t), hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0');
            tty.println(hh + ' ' + (m.type === 'signal' ? 'signal  ' + m.topic + '  from=' + m.from + '  ' + show(m.data) : m.type === 'call' ? 'call    ' + m.to + '.' + m.method + '(' + m.args.map(x => JSON.stringify(x)).join(', ') + ')  from=' + m.from + ' user=' + m.user : m.type === 'return' ? 'return  #' + m.serial + '  ' + show(m.value) : 'error   #' + m.serial + '  ' + m.error), m.type === 'error' ? 'err' : m.type === 'signal' ? 'accent' : null);
          });
          try { await tty.read(''); } finally { off(); }
          return;
        }
        throw new Error('使い方: ipc list / call / pub / monitor / listen / introspect');
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
      return env;
    }
  }
  OS.Jsh = Jsh;
})();
