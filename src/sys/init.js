/* hinit — htmlOS の init（PID 1）。htmlOS 5.0 Altair から
   ブラウザーはキーボード・画面・マウスとストレージを渡すだけの「脊髄」と考え、OS の仕組みは htmlOS の中に持つ。
   ・OS.proc     プロセス表。init・カーネル・サービス・ログインセッション・アプリのウインドウ・シェルに PID を割り当てる（ps / kill / top）
   ・OS.journal  ログ（journald にあたる）。hjournal で見る。前の起動のログは /var/log/journal/prev.json に残る
   ・OS.init     サービス管理（systemd にあたる）。unit の依存関係（Requires / Wants）・起動順（After / Before）・
                 自動再起動（Restart=）・有効/無効（enable / disable）を扱う。systemctl で操作する
     unit の作り方: (1) JS から OS.init.register({ name: 'foo.service', desc, after, requires, wants, wantedBy, restart, start(ctx) })
                    (2) /etc/hinit/foo.service に書く（[Unit] Description= After= Requires= Wants= / [Service] Type= ExecStart= ExecStop=
                        Restart= RestartSec= User= RemainAfterExit= / [Install] WantedBy=）。ExecStart= は jsh のコマンド */
(function () {
  'use strict';
  const OS = window.OS, fs = OS.fs, users = OS.users;
  const now = () => Date.now();
  const z = (n, w) => String(n).padStart(w || 2, '0');

  // =====================================================================
  // ジャーナル（ログ）
  // =====================================================================
  const PRIO = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
  const JDIR = '/var/log/journal', JMAX = 3000, JKEEP = 600;
  const J = { list: [], seq: 0, watch: new Set(), dirty: false };
  const prioOf = p => typeof p === 'number' ? Math.max(0, Math.min(7, p | 0)) : PRIO.indexOf(p) >= 0 ? PRIO.indexOf(p) : 6;
  const journal = OS.journal = {
    PRIO: PRIO,
    // unit: 出どころ（'kernel'・'hinit'・'clock.service' など）、o: { pid, prio: 0〜7 か 'err' など, t }
    log(unit, msg, o) {
      o = o || {};
      const e = { seq: ++J.seq, t: o.t || now(), unit: String(unit || 'kernel'), pid: o.pid || 0, prio: prioOf(o.prio), msg: String(msg) };
      J.list.push(e); if (J.list.length > JMAX) J.list.splice(0, J.list.length - JMAX);
      J.dirty = true;
      J.watch.forEach(f => { try { f(e); } catch (err) { /* 見ている側の失敗は無視 */ } });
      return e;
    },
    // f: { unit, prio（これ以下＝これより重要）, kernel, since(ms), n }
    entries(f, src) {
      f = f || {};
      let l = (src || J.list).filter(e => (!f.unit || e.unit === f.unit || e.unit === f.unit + '.service') && (f.prio == null || e.prio <= f.prio) && (!f.kernel || e.unit === 'kernel') && (!f.since || e.t >= f.since));
      if (f.n) l = l.slice(-f.n);
      return l;
    },
    watch(fn) { J.watch.add(fn); return () => J.watch.delete(fn); },
    format(e) {
      const d = new Date(e.t);
      return z(d.getMonth() + 1) + '/' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()) + ' ' + OS.hostname() + ' ' + e.unit + (e.pid ? '[' + e.pid + ']' : '') + ': ' + e.msg;
    },
    previous() { try { return JSON.parse(fs.read(JDIR + '/prev.json')); } catch (e) { return []; } },
    // いまの起動のログを書き出す（定期的に・終了のとき）。LocalStorage を使いすぎないよう新しいほうから JKEEP 件
    save() {
      if (!J.dirty || OS.live || OS.imode) return;
      try { fs.mkdir(JDIR, { parents: true }); fs.write(JDIR + '/current.json', JSON.stringify(J.list.slice(-JKEEP))); J.dirty = false; } catch (e) { /* 書けなくても動き続ける */ }
    }
  };
  // 前の起動のログ: current.json → prev.json
  try { if (!OS.live && !OS.imode && fs.exists(JDIR + '/current.json')) { fs.write(JDIR + '/prev.json', fs.read(JDIR + '/current.json')); fs.rm(JDIR + '/current.json'); } } catch (e) { /* 初回 */ }
  // カーネルが先に出したログ（init.js を読み込む前のもの）
  (OS._klog || []).forEach(e => journal.log('kernel', e.msg, { t: e.t, prio: e.prio }));
  OS._klog = null;
  OS.klog = (msg, prio) => journal.log('kernel', msg, { prio: prio });
  window.addEventListener('error', e => journal.log('kernel', 'JavaScript のエラー: ' + (e.message || e) + (e.filename ? '（' + e.filename + ':' + e.lineno + '）' : ''), { prio: 3 }));
  window.addEventListener('unhandledrejection', e => journal.log('kernel', '処理されなかった Promise の失敗: ' + ((e.reason && e.reason.message) || e.reason), { prio: 3 }));
  window.addEventListener('pagehide', () => journal.save());

  // =====================================================================
  // プロセス
  // =====================================================================
  const SIG = { HUP: 1, INT: 2, KILL: 9, TERM: 15 };
  const P = { table: new Map(), next: 1 };
  const proc = OS.proc = {
    SIG: SIG,
    alloc() { return P.next++; },
    // o: { pid（alloc 済みなら）, ppid, name, cmd, user, kind: init|kernel|service|session|app|shell, unit, win, onsignal(sig) }
    spawn(o) {
      const pid = o.pid || P.next++;
      const p = { pid: pid, ppid: o.ppid == null ? 1 : o.ppid, name: o.name || 'proc', cmd: o.cmd || o.name || 'proc', user: o.user || 'root', kind: o.kind || 'proc', unit: o.unit || null, win: o.win || null, start: now(), onsignal: o.onsignal || null, onexit: o.onexit || null };
      P.table.set(pid, p);
      return p;
    },
    exit(pid, code) {
      const p = P.table.get(pid); if (!p) return;
      P.table.delete(pid);
      P.table.forEach(c => { if (c.ppid === pid) c.ppid = 1; }); // 親がいなくなった子は init が引き取る
      if (p.onexit) { try { p.onexit(code); } catch (e) { /* 無視 */ } }
    },
    get(pid) { return P.table.get(Number(pid)) || null; },
    list() { return Array.from(P.table.values()).sort((a, b) => a.pid - b.pid); },
    find(name) { return proc.list().filter(p => p.name === name || p.cmd.split(' ')[0] === name); },
    sigName(s) {
      if (s == null || s === '') return 'TERM';
      s = String(s).toUpperCase().replace(/^SIG/, '');
      if (/^\d+$/.test(s)) { const n = Number(s); const k = Object.keys(SIG).find(x => SIG[x] === n); if (!k) throw new Error(s + ': 使えないシグナルです（kill -l で一覧）'); return k; }
      if (!SIG[s]) throw new Error(s + ': 使えないシグナルです（kill -l で一覧）');
      return s;
    },
    // シグナルを送る。by: 送るユーザー（root は誰のプロセスにも送れる）
    async kill(pid, sig, by) {
      sig = proc.sigName(sig);
      const p = proc.get(pid);
      if (!p) throw new Error('(' + pid + '): そのようなプロセスはありません');
      if (p.kind === 'init' || p.kind === 'kernel') throw new Error('(' + pid + '): 操作は許可されていません（' + p.name + ' は止められません）');
      if (by && by !== p.user && !users.isRoot(by)) throw new Error('(' + pid + '): 操作は許可されていません（ほかのユーザーのプロセス。sudo kill …）');
      journal.log('kernel', 'PID ' + pid + '（' + p.name + '）に SIG' + sig + ' を送りました' + (by ? '（' + by + '）' : ''), { prio: 5 });
      if (p.onsignal) return p.onsignal(sig);
      proc.exit(pid, 128 + SIG[sig]);
      return true;
    },
    // 経過時間 → "mm:ss" / "h:mm:ss"
    time(p) { const s = Math.floor((now() - p.start) / 1000), h = Math.floor(s / 3600); return (h ? h + ':' + z(Math.floor(s % 3600 / 60)) : String(Math.floor(s / 60))) + ':' + z(s % 60); },
    stat(p) {
      if (p.kind === 'init') return 'Ss';
      if (p.kind === 'kernel') return 'S<';
      if (p.kind === 'app' && p.win) return p.win.el.classList.contains('hidden') ? 'T' : p.win.el.classList.contains('active') ? 'R' : 'S';
      if (p.kind === 'shell') return p.busy ? 'R+' : 'S+';
      if (p.kind === 'session') return 'Ss';
      return 'S';
    }
  };
  proc.spawn({ name: 'hinit', cmd: '/sys/init.js', kind: 'init', ppid: 0 });                 // PID 1
  proc.spawn({ name: '[kernel]', cmd: '[kernel]', kind: 'kernel', ppid: 0 });                // PID 2
  proc.spawn({ name: '[kjournald]', cmd: '[kjournald]', kind: 'kernel', ppid: 2 });          // PID 3

  // =====================================================================
  // サービス管理
  // =====================================================================
  const UDIR = '/etc/hinit', ENFILE = '/etc/hinit/enabled.json';
  const units = new Map(), state = new Map();
  const list = v => v == null ? [] : (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).filter(Boolean).map(norm);
  function norm(n) { n = String(n).trim(); return /\.(service|target)$/.test(n) ? n : n + '.service'; }
  const S = n => {
    let s = state.get(n);
    if (!s) {
      s = { sub: 'dead', since: 0, pid: null, result: null, timers: [], stops: [], restarts: [], gen: 0, manual: false };
      // active が変わったら IPC に unit.changed を流す
      let act = 'inactive';
      Object.defineProperty(s, 'active', { enumerable: true, get: () => act, set: v => { if (v === act) return; const old = act; act = v; if (OS.ipc) { try { OS.ipc.publish('unit.changed', { unit: n, active: v, old: old }, 'hinit'); } catch (e) { /* 無視 */ } } } });
      state.set(n, s);
    }
    return s;
  };
  const short = n => n.replace(/\.(service|target)$/, '');
  const ilog = (msg, prio) => journal.log('hinit', msg, { pid: 1, prio: prio });
  let enabledMap = {};
  function loadEnabled() { try { enabledMap = JSON.parse(fs.read(ENFILE)) || {}; } catch (e) { enabledMap = {}; } }
  function saveEnabled() { fs.mkdir(UDIR, { parents: true }); fs.write(ENFILE, JSON.stringify(enabledMap, null, 1)); }
  loadEnabled();

  function register(d) {
    if (!d || !d.name) throw new Error('unit に name がありません');
    const name = norm(d.name), type = /\.target$/.test(name) ? 'target' : (d.type || 'simple');
    if (type !== 'target' && typeof d.start !== 'function') throw new Error(name + ': start(ctx) がありません');
    const u = {
      name: name, desc: d.desc || short(name), type: type, source: d.source || 'builtin', file: d.file || null, text: d.text || null,
      after: list(d.after), before: list(d.before), requires: list(d.requires), wants: list(d.wants), wantedBy: list(d.wantedBy),
      restart: d.restart || 'no', restartSec: d.restartSec == null ? 1 : Number(d.restartSec), remainAfterExit: !!d.remainAfterExit,
      user: d.user || 'root', cmd: d.cmd || null, start: d.start || null, stop: d.stop || null, reload: d.reload || null,
      defaultEnabled: d.defaultEnabled !== false, refuseStop: !!d.refuseStop, doc: d.doc || null
    };
    units.set(name, u);
    return u;
  }
  const enabled = u => u.name in enabledMap ? !!enabledMap[u.name] : (u.wantedBy.length ? u.defaultEnabled : null); // null = static（WantedBy がない）
  const isActive = n => { const s = state.get(norm(n)); return !!s && (s.active === 'active' || s.active === 'reloading'); };

  // ---- /etc/hinit/*.service（INI 形式）
  function parseUnit(text) {
    const o = {}; let sec = '';
    String(text).split('\n').forEach(line => {
      line = line.trim(); if (!line || line[0] === '#' || line[0] === ';') return;
      const m = /^\[(.+)\]$/.exec(line); if (m) { sec = m[1]; return; }
      const i = line.indexOf('='); if (i < 0) return;
      const k = sec + '.' + line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      o[k] = o[k] ? o[k] + ' ' + v : v;
    });
    return o;
  }
  // ExecStart= を、画面を持たない jsh で実行する（出力はジャーナルへ）
  function headlessShell(unit, user, pidRef) {
    const out = (s, cls) => { String(s).split('\n').forEach(l => { if (l !== '') journal.log(unit, l, { pid: pidRef(), prio: cls === 'err' ? 3 : 6 }); }); };
    let buf = '';
    const tty = {
      capture: null, el: null,
      print(s, cls) { s = String(s); if (this.capture) { this.capture.push(s); return; } buf += s; const k = buf.lastIndexOf('\n'); if (k >= 0) { out(buf.slice(0, k), cls); buf = buf.slice(k + 1); } },
      println(s, cls) { this.print((s == null ? '' : s) + '\n', cls); },
      clear() {}, focus() {}, read() { return Promise.resolve(null); }, flush() { if (buf) { out(buf); buf = ''; } }
    };
    const sh = new OS.Jsh(tty, users.get(user) ? user : 'root', { service: unit });
    sh._tty = tty;
    return sh;
  }
  function fileUnit(file, text) {
    const o = parseUnit(text), name = norm(file.split('/').pop());
    const exec = o['Service.ExecStart'], execStop = o['Service.ExecStop'];
    const isTarget = /\.target$/.test(name);
    if (!isTarget && !exec) throw new Error(name + ': ExecStart= がありません');
    const type = o['Service.Type'] === 'oneshot' ? 'oneshot' : 'simple';
    return register({
      name: name, desc: o['Unit.Description'], source: 'file', file: file, text: text, cmd: exec,
      after: o['Unit.After'], before: o['Unit.Before'], requires: o['Unit.Requires'], wants: o['Unit.Wants'], wantedBy: o['Install.WantedBy'],
      type: type, restart: o['Service.Restart'] || 'no', restartSec: o['Service.RestartSec'] ? parseFloat(o['Service.RestartSec']) : 1,
      remainAfterExit: /^(yes|true|1|on)$/i.test(o['Service.RemainAfterExit'] || ''), user: o['Service.User'] || 'root',
      start: isTarget ? null : ctx => {
        const sh = headlessShell(name, o['Service.User'] || 'root', () => ctx.pid);
        ctx.onStop(() => { sh.exited = true; });
        const run = (async () => { try { await sh.exec(exec, true); } catch (e) { sh._tty.println(e.message || String(e), 'err'); sh.status = 1; } sh._tty.flush(); return sh.status | 0; })();
        if (type === 'oneshot') return run.then(code => { if (code) throw new Error('ExecStart= が終了コード ' + code + ' で失敗しました'); });
        run.then(code => ctx.exit(code));
      },
      stop: execStop ? async () => { const sh = headlessShell(name, o['Service.User'] || 'root', () => 0); try { await sh.exec(execStop, true); } catch (e) { /* 止める処理の失敗はログだけ */ } sh._tty.flush(); } : null
    });
  }
  function scanFiles() {
    for (const [n, u] of units) if (u.source === 'file') units.delete(n);
    let names = []; try { names = fs.isDir(UDIR) ? fs.list(UDIR) : []; } catch (e) { names = []; }
    names.filter(n => /\.(service|target)$/.test(n)).forEach(n => {
      try { fileUnit(UDIR + '/' + n, fs.read(UDIR + '/' + n)); }
      catch (e) { ilog(n + ' を読み込めませんでした: ' + e.message, 3); }
    });
  }

  // ---- 起動と停止
  function cleanup(n) {
    const s = S(n);
    s.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); s.timers = [];
    const stops = s.stops.splice(0).reverse();
    stops.forEach(f => { try { f(); } catch (e) { journal.log(n, '後始末に失敗しました: ' + e.message, { prio: 4 }); } });
    if (s.pid) { const pid = s.pid; s.pid = null; proc.exit(pid); }
  }
  function ctxFor(n, s, pid, gen) {
    const live = () => s.gen === gen;
    const guard = f => function () { if (!live()) return; try { return f.apply(this, arguments); } catch (e) { crashed(n, e, gen); } };
    return {
      unit: n, pid: pid,
      log: (m, prio) => journal.log(n, m, { pid: pid, prio: prio }),
      setInterval(f, ms) { const t = setInterval(guard(f), ms); s.timers.push(t); return t; },
      setTimeout(f, ms) { const t = setTimeout(guard(f), ms); s.timers.push(t); return t; },
      onStop(f) { s.stops.push(f); },
      fail(why) { if (live()) crashed(n, why || new Error('失敗しました'), gen); },
      exit(code) { if (live()) mainExited(n, code | 0, gen); }
    };
  }
  async function start(name, chain) {
    const n = norm(name), u = units.get(n);
    if (!u) throw new Error(n + ': そのような unit はありません');
    const s = S(n);
    if (s.active === 'active' || s.active === 'activating' || s.active === 'reloading') return true;
    chain = chain || [];
    if (chain.includes(n)) { ilog('依存関係が循環しています: ' + chain.concat(n).join(' → '), 3); return false; }
    s.manual = false;
    s.active = 'activating'; s.sub = 'start';
    const next = chain.concat(n);
    for (const r of u.requires) {
      let ok = false; try { ok = await start(r, next); } catch (e) { ilog(e.message, 3); }
      if (!ok) { s.active = 'failed'; s.sub = 'failed'; s.result = 'dependency'; s.since = now(); ilog(u.desc + ' の依存（' + r + '）が起動できなかったので、起動しませんでした', 3); return false; }
    }
    for (const w of u.wants) { try { await start(w, next); } catch (e) { ilog(e.message, 4); } }
    // After= の相手が起動中なら待つ（いま一緒に起動しているもの）
    for (const a of u.after) { const sa = state.get(a); if (sa && sa.active === 'activating' && sa._p) { try { await sa._p; } catch (e) { /* 失敗しても進む */ } } }
    if (u.type === 'target') { s.active = 'active'; s.sub = 'active'; s.since = now(); s.result = 'success'; ilog(u.desc + '（' + n + '）に到達しました'); return true; }
    const gen = ++s.gen;
    const p = proc.spawn({ name: short(n), cmd: u.cmd || ('[' + n + ']'), user: u.user, kind: 'service', unit: n, ppid: 1, onsignal: sig => onSignal(n, sig) });
    s.pid = p.pid;
    const ctx = ctxFor(n, s, p.pid, gen);
    const run = (async () => {
      try { const r = await u.start(ctx); if (typeof r === 'function') s.stops.push(r); }
      catch (e) {
        if (s.gen !== gen) return false;
        journal.log(n, '起動に失敗しました: ' + ((e && e.message) || e), { pid: p.pid, prio: 3 });
        cleanup(n); s.active = 'failed'; s.sub = 'failed'; s.result = 'exit-code'; s.since = now();
        ilog(u.desc + ' の起動に失敗しました', 3);
        scheduleRestart(n, true);
        return false;
      }
      if (s.gen !== gen) return s.active === 'active';
      if (u.type === 'oneshot') {
        cleanup(n);
        s.active = u.remainAfterExit ? 'active' : 'inactive'; s.sub = 'exited'; s.result = 'success'; s.since = now();
        ilog(u.desc + ' を実行しました');
        return true;
      }
      if (s.active === 'activating') { s.active = 'active'; s.sub = 'running'; s.result = 'success'; s.since = now(); ilog(u.desc + ' を起動しました'); }
      return s.active === 'active';
    })();
    s._p = run;
    return run;
  }
  async function stop(name, opt) {
    const n = norm(name), u = units.get(n);
    if (!u) throw new Error(n + ': そのような unit はありません');
    const s = S(n);
    if (s.active === 'inactive' || (s.active === 'failed' && !s.pid)) { s.manual = true; return true; }
    s.manual = true; s.gen++;
    // これを必要とする（Requires=）動いている unit を先に止める
    for (const [m, v] of units) if (v.requires.includes(n) && isActive(m)) await stop(m, opt);
    s.active = 'deactivating'; s.sub = 'stop';
    cleanup(n);
    if (u.stop) { try { await u.stop(); } catch (e) { journal.log(n, '停止の処理に失敗しました: ' + e.message, { prio: 4 }); } }
    s.active = 'inactive'; s.sub = 'dead'; s.since = now();
    if (!(opt && opt.quiet)) ilog(u.desc + ' を停止しました');
    return true;
  }
  async function restart(name) { await stop(name, { quiet: true }); return start(name); }
  // メインの処理が終わった（type=simple で ExecStart= のコマンドが終わったなど）
  function mainExited(n, code, gen) {
    const s = S(n), u = units.get(n); if (s.gen !== gen) return;
    cleanup(n);
    s.since = now();
    if (code === 0) { s.active = 'inactive'; s.sub = 'dead'; s.result = 'success'; ilog(u.desc + ' が終了しました'); scheduleRestart(n, false); }
    else { s.active = 'failed'; s.sub = 'failed'; s.result = 'exit-code'; journal.log(n, '終了コード ' + code + ' で終了しました', { prio: 3 }); ilog(u.desc + ' が失敗しました（終了コード ' + code + '）', 3); scheduleRestart(n, true); }
  }
  // 動いている途中で失敗した（例外・ctx.fail）
  function crashed(n, err, gen) {
    const s = S(n), u = units.get(n); if (gen != null && s.gen !== gen) return;
    s.gen++;
    journal.log(n, '異常終了しました: ' + ((err && err.message) || err), { pid: s.pid || 0, prio: 2 });
    cleanup(n);
    s.active = 'failed'; s.sub = 'failed'; s.result = 'core-dump'; s.since = now();
    ilog(u.desc + ' が異常終了しました', 3);
    scheduleRestart(n, true);
  }
  // kill で送られたシグナル
  function onSignal(n, sig) {
    const s = S(n), u = units.get(n);
    if (sig === 'HUP' && u.reload) { s.active = 'reloading'; return Promise.resolve(u.reload()).then(() => { s.active = 'active'; ilog(u.desc + ' を再読み込みしました'); return true; }); }
    s.gen++;
    const clean = sig !== 'KILL'; // TERM・INT・HUP はきれいな終了、KILL は失敗として扱う（systemd と同じ）
    cleanup(n);
    if (u.stop && clean) { try { u.stop(); } catch (e) { /* 無視 */ } }
    s.since = now();
    if (clean) { s.active = 'inactive'; s.sub = 'dead'; s.result = 'signal'; journal.log(n, 'SIG' + sig + ' で終了しました', { prio: 5 }); }
    else { s.active = 'failed'; s.sub = 'failed'; s.result = 'signal'; journal.log(n, 'SIG' + sig + ' で強制終了されました', { prio: 3 }); ilog(u.desc + ' が強制終了されました', 3); }
    scheduleRestart(n, !clean);
    return true;
  }
  // Restart=always は止まったら必ず、on-failure は失敗したときだけ、RestartSec 秒後にもう一度起動する。10 秒に 5 回を超えたらあきらめる
  function scheduleRestart(n, failed) {
    const s = S(n), u = units.get(n);
    if (s.manual || OS._down || !(u.restart === 'always' || (u.restart === 'on-failure' && failed))) return;
    const t = now(); s.restarts = s.restarts.filter(x => t - x < 10000);
    if (s.restarts.length >= 5) { s.active = 'failed'; s.sub = 'failed'; s.result = 'start-limit-hit'; ilog(u.desc + ': 短いあいだに何度も止まったので、自動の再起動をやめました', 3); return; }
    s.restarts.push(t);
    ilog(u.desc + ': ' + u.restartSec + ' 秒後に再起動します（' + s.restarts.length + ' 回目）', 5);
    const gen = s.gen;
    setTimeout(() => { if (s.gen === gen && !s.manual && !OS._down && !isActive(n)) start(n).catch(e => ilog(e.message, 3)); }, Math.max(0, u.restartSec * 1000));
  }

  // ---- ターゲットに必要な unit を集めて、起動順に並べる
  function closure(target) {
    const set = new Set(), q = [norm(target)];
    while (q.length) {
      const n = q.shift(); if (set.has(n) || !units.has(n)) continue;
      set.add(n);
      const u = units.get(n);
      u.requires.concat(u.wants).forEach(x => q.push(x));
      if (u.type === 'target') for (const [m, v] of units) if (v.wantedBy.includes(n) && enabled(v)) q.push(m);
    }
    return set;
  }
  function order(set) {
    const edges = new Map(); set.forEach(n => edges.set(n, new Set()));
    set.forEach(n => {
      const u = units.get(n);
      u.after.concat(u.requires).forEach(a => { if (set.has(a)) edges.get(n).add(a); }); // Requires= も After= として扱う
      u.before.forEach(b => { if (set.has(b)) edges.get(b).add(n); });
      if (u.type === 'target') for (const [m, v] of units) if (set.has(m) && v.wantedBy.includes(n)) edges.get(n).add(m); // ターゲットは、それを望む unit のあと
    });
    const out = [], mark = new Map();
    const visit = n => { if (mark.get(n) === 2) return; if (mark.get(n) === 1) { ilog('起動順が循環しています（' + n + '）', 4); return; } mark.set(n, 1); edges.get(n).forEach(visit); mark.set(n, 2); out.push(n); };
    Array.from(set).sort().forEach(visit);
    return out;
  }
  async function reach(target, each) {
    const seq = order(closure(target));
    for (const n of seq) {
      const u = units.get(n), was = isActive(n);
      let ok = false;
      try { ok = await start(n); } catch (e) { ilog(e.message, 3); }
      if (each && !was && u.type !== 'target') await each(u, ok);
    }
    return seq;
  }

  const init = OS.init = {
    register: register, start: start, stop: stop, restart: restart, isActive: isActive, reach: reach,
    has: n => units.has(norm(n)),
    unit: n => units.get(norm(n)) || null,
    state: n => { const s = state.get(norm(n)); return s ? { active: s.active, sub: s.sub, since: s.since, pid: s.pid, result: s.result } : { active: 'inactive', sub: 'dead', since: 0, pid: null, result: null }; },
    units: () => Array.from(units.values()).sort((a, b) => a.name.localeCompare(b.name)),
    enabled: n => { const u = units.get(norm(n)); return u ? enabled(u) : false; },
    enable(n, on) {
      const u = units.get(norm(n)); if (!u) throw new Error(norm(n) + ': そのような unit はありません');
      if (!u.wantedBy.length) throw new Error(u.name + ' には [Install] WantedBy= がないので、有効・無効は切り替えられません（static）');
      enabledMap[u.name] = !!on; saveEnabled();
      ilog(u.name + ' を' + (on ? '有効' : '無効') + 'にしました（' + u.wantedBy.join(' ') + '）');
    },
    reload() { loadEnabled(); scanFiles(); ilog('unit の設定を読み込み直しました'); },
    resetFailed(n) { (n ? [norm(n)] : Array.from(state.keys())).forEach(k => { const s = state.get(k); if (s && s.active === 'failed') { s.active = 'inactive'; s.sub = 'dead'; s.result = null; s.restarts = []; } }); },
    defaultTarget: () => (OS.config.get('bootMode', 'gui') === 'cui' ? 'multi-user.target' : 'graphical.target'),
    // 起動: ターゲットまで unit を順に起動する。each(unit, ok) は起動ログを出すのに使う
    async boot(target, each) { ilog('htmlOS ' + OS.version + ' を起動しています（' + target + '）'); return reach(target, each); },
    // 終了: 動いている unit を起動と逆の順に止める。止めたものの説明を返す
    async shutdown() {
      ilog('システムを終了します');
      const act = Array.from(units.keys()).filter(n => isActive(n) || (state.get(n) || {}).pid);
      const seq = order(new Set(act)).reverse(), done = [];
      for (const n of seq) {
        const u = units.get(n);
        if (u.type === 'target') { S(n).active = 'inactive'; S(n).sub = 'dead'; continue; }
        try { await stop(n, { quiet: true }); done.push(u.desc); ilog(u.desc + ' を停止しました'); } catch (e) { /* 次へ */ }
      }
      ilog('ジャーナルを保存して終了します');
      journal.save();
      return done;
    }
  };

  // ---- ターゲット
  register({ name: 'basic.target', desc: '基本システム' });
  register({ name: 'multi-user.target', desc: 'マルチユーザー（CUI）', requires: 'basic.target', after: 'basic.target' });
  register({ name: 'graphical.target', desc: 'グラフィカル（HTUi）', requires: 'multi-user.target', after: 'multi-user.target' });

  // ---- 組み込みのサービス
  register({
    name: 'hjournald.service', desc: 'ジャーナル（ログ）の保存', wantedBy: 'basic.target', refuseStop: true,
    start(ctx) { ctx.setInterval(() => journal.save(), 30000); return () => journal.save(); }
  });
  register({
    name: 'powerd.service', desc: '電源管理（スリープの見張り・省電力・スリープ防止）', wantedBy: 'graphical.target', restart: 'on-failure',
    start(ctx) {
      if (!OS.power) throw new Error('電源管理（OS.power）がありません');
      OS.power.start(ctx);
      ctx.log('スリープの見張りを始めました');
      return () => OS.power.stop();
    }
  });
  register({
    name: 'bgm.service', desc: 'アンビエントサウンド（BGM）', after: ['soundd.service'], wants: ['soundd.service'], wantedBy: 'graphical.target', restart: 'on-failure',
    start(ctx) {
      ctx.setTimeout(() => { if (OS.bgm) OS.bgm.apply(); }, 60); // active になってから設定どおりに鳴らす
      ctx.log('BGM を使えるようにしました');
      return () => { if (OS.bgm) OS.bgm.stop(); };
    }
  });
  register({
    name: 'soundd.service', desc: '効果音', wantedBy: 'basic.target', restart: 'on-failure',
    start(ctx) {
      if (OS.sound.hold) OS.sound.hold(false);
      ctx.log('効果音を使えるようにしました');
      return () => { if (OS.sound.hold) OS.sound.hold(true); };
    }
  });
  register({
    name: 'netmon.service', desc: 'ネットワークの監視', wantedBy: 'multi-user.target', restart: 'on-failure',
    start(ctx) {
      const on = () => { ctx.log('オンラインになりました'); if (OS.notify) OS.notify({ app: 'ネットワーク', icon: 'globe', title: 'オンラインになりました' }); };
      const off = () => { ctx.log('オフラインになりました', 4); if (OS.notify) OS.notify({ app: 'ネットワーク', icon: 'globe', title: 'オフラインになりました', body: 'インターネットにつながっていません' }); };
      window.addEventListener('online', on); window.addEventListener('offline', off);
      ctx.log(navigator.onLine === false ? '現在オフラインです' : '現在オンラインです');
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }
  });
  register({
    name: 'proxyrank.service', desc: 'CORS プロキシの順番決め', after: ['netmon.service'], wantedBy: 'multi-user.target', restart: 'no',
    reload: () => OS.net.rank(10000), // systemctl reload proxyrank で測り直す
    start(ctx) {
      const run = why => {
        if (!OS.net || !OS.net.rank) return;
        if (navigator.onLine === false) { ctx.log('オフラインなので、オンラインになってから測ります'); return; }
        OS.net.rank(10000).then(r => {
          const ok = r.results.filter(x => x.ok);
          ctx.log((why || '') + 'プロキシを測りました: ' + r.results.map(x => (x.ok ? x.proxy.replace(/^https?:\/\//, '').replace(/[/?].*$/, '') + ' ' + x.ms + 'ms' : x.proxy.replace(/^https?:\/\//, '').replace(/[/?].*$/, '') + ' ×')).join(', '), ok.length ? 6 : 4);
          if (!ok.length) ctx.log('使えるプロキシがありません（設定 → ネットワーク）', 4);
        }).catch(e => ctx.log('測れませんでした: ' + e.message, 4));
      };
      const on = () => run('オンラインに戻ったので');
      window.addEventListener('online', on);
      run(''); // 起動のときに測り始める（測り終わるのは待たないので、起動は遅くならない）
      return () => window.removeEventListener('online', on);
    }
  });
  register({
    name: 'notifyd.service', desc: '通知', wantedBy: 'graphical.target', restart: 'on-failure',
    start(ctx) { ctx.log('通知を受け付けています'); }
  });
  register({
    name: 'clock.service', desc: '時計', wantedBy: 'graphical.target', restart: 'on-failure',
    start(ctx) {
      const tick = () => { if (OS.htui && OS.htui.running && OS.htui.tick) OS.htui.tick(); };
      tick();
      // 秒の変わり目にそろえて 1 秒ごと
      ctx.setTimeout(() => { tick(); ctx.setInterval(tick, 1000); }, 1000 - (now() % 1000));
    }
  });
  register({
    name: 'htui.service', desc: 'HTUi（デスクトップ）', wantedBy: 'graphical.target', after: 'multi-user.target', cmd: '/sys/htui.js',
    start(ctx) {
      if (!OS.htui) throw new Error('HTUi が読み込まれていません');
      if (!OS.htui.running) OS.htui.start();
      ctx.setInterval(() => { if (!OS.htui.running) ctx.exit(0); }, 1000);
    },
    stop() { if (OS.htui && OS.htui.running) OS.htui.stop(); }
  });

  // =====================================================================
  // コマンド: ps / kill / pkill / pidof / top / systemctl / hjournal / dmesg
  // =====================================================================
  const pad = (s, w) => { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); };
  const rpad = (s, w) => String(s).padStart(w);
  const ago = t => { const s = Math.max(0, Math.floor((now() - t) / 1000)); return s < 60 ? s + ' 秒前' : s < 3600 ? Math.floor(s / 60) + ' 分前' : Math.floor(s / 3600) + ' 時間 ' + Math.floor(s % 3600 / 60) + ' 分前'; };
  const clock = t => { const d = new Date(t); return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
  const cmd = d => OS.registerCommand(d);
  const needAdmin = (sh, what) => { if (!sh.root) throw new Error(what + 'には root 権限が必要です（sudo systemctl …）'); };
  const DOT = { active: '●', reloading: '●', activating: '◐', deactivating: '◑', failed: '×', inactive: '○' };

  function psLines(filter) {
    const rows = [pad('  PID', 6) + rpad('PPID', 6) + '  ' + pad('USER', 9) + pad('STAT', 5) + pad('START', 9) + rpad('TIME', 8) + '  COMMAND'];
    proc.list().filter(filter || (() => true)).forEach(p => {
      rows.push(rpad(p.pid, 5) + ' ' + rpad(p.ppid, 5) + '  ' + pad(p.user, 9) + pad(proc.stat(p), 5) + pad(clock(p.start), 9) + rpad(proc.time(p), 8) + '  ' + p.cmd);
    });
    return rows;
  }
  cmd({
    name: 'ps', usage: 'ps [-u ユーザー] [-t 種類]', desc: 'プロセスの一覧（init・サービス・セッション・アプリ・シェル）',
    run(a, sh) {
      let user = null, kind = null;
      for (let i = 0; i < a.length; i++) { if (a[i] === '-u') user = a[++i]; else if (a[i] === '-t') kind = a[++i]; }
      return psLines(p => (!user || p.user === user) && (!kind || p.kind === kind)).join('\n');
    }
  });
  cmd({
    name: 'kill', usage: 'kill [-シグナル] PID... / kill -l', desc: 'プロセスにシグナルを送る（既定は TERM。KILL で強制終了）',
    async run(a, sh) {
      if (a[0] === '-l') return Object.keys(SIG).map(k => rpad(SIG[k], 2) + ') SIG' + k).join('\n');
      let sig = 'TERM'; const pids = [];
      for (let i = 0; i < a.length; i++) {
        if (a[i] === '-s' || a[i] === '-n') sig = a[++i];
        else if (/^-/.test(a[i])) sig = a[i].slice(1);
        else pids.push(a[i]);
      }
      if (!pids.length) throw new Error('使い方: kill [-シグナル] PID...');
      sig = proc.sigName(sig);
      for (const p of pids) { if (!/^\d+$/.test(p)) throw new Error(p + ': PID は数字で指定してください（名前なら pkill）'); await proc.kill(Number(p), sig, sh.user); }
    }
  });
  cmd({
    name: 'pkill', usage: 'pkill [-シグナル] 名前', desc: '名前でプロセスにシグナルを送る',
    async run(a, sh) {
      let sig = 'TERM', name = null;
      a.forEach(x => { if (/^-/.test(x)) sig = x.slice(1); else name = x; });
      if (!name) throw new Error('使い方: pkill [-シグナル] 名前');
      const l = proc.find(name).filter(p => p.kind !== 'init' && p.kind !== 'kernel');
      if (!l.length) throw new Error(name + ': 見つかりません');
      for (const p of l) await proc.kill(p.pid, sig, sh.user);
      return l.length + ' 個のプロセスに SIG' + proc.sigName(sig) + ' を送りました';
    }
  });
  OS.commands.killall = Object.assign({}, OS.commands.pkill, { name: 'killall', usage: 'killall [-シグナル] 名前', desc: 'pkill と同じ' });
  cmd({ name: 'pidof', usage: 'pidof 名前', desc: '名前から PID を調べる', run(a) { const l = proc.find(a[0] || ''); if (!l.length) throw new Error((a[0] || '') + ': 見つかりません'); return l.map(p => p.pid).join(' '); } });
  cmd({
    name: 'top', usage: 'top', desc: 'プロセスとメモリ・ストレージを 1 秒ごとに表示（Enter か Ctrl+C で終了）',
    async run(a, sh) {
      const tty = sh.tty; if (tty.capture) return psLines().join('\n');
      let done = false; const stopP = tty.read('').then(() => { done = true; });
      const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(1) + ' KB';
      while (!done) {
        tty.clear();
        const u = fs.usage(), pm = performance.memory, l = proc.list();
        const failed = init.units().filter(x => init.state(x.name).active === 'failed').length;
        tty.println('top - ' + clock(now()) + '  起動から ' + proc.time({ start: OS.bootTime || now() }) + '  プロセス ' + l.length + ' 個  サービス ' + init.units().filter(x => x.type !== 'target' && isActive(x.name)).length + ' 個が動作中' + (failed ? '、' + failed + ' 個が失敗' : ''), 'accent');
        tty.println('ストレージ: ' + fmt(u.used) + (u.disk && !u.total ? '' : ' / ' + fmt(u.total)) + (pm ? '   JS ヒープ: ' + fmt(pm.usedJSHeapSize) + ' / ' + fmt(pm.jsHeapSizeLimit) : '') + '   CPU: ' + (navigator.hardwareConcurrency || '?') + ' コア');
        tty.println('');
        const rows = psLines(); tty.println(rows[0], 'dim'); rows.slice(1).forEach(r => tty.println(r));
        tty.println('\nEnter か Ctrl+C で終了', 'dim');
        await Promise.race([stopP, new Promise(r => setTimeout(r, 1000))]);
      }
      tty.clear();
    }
  });

  // ---- hjournal
  function journalLines(a, sh) {
    let n = null, unit = null, prio = null, kernel = false, prev = false, rev = false, follow = false, since = null;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '-n' || x === '--lines') n = Number(a[++i]) || 10;
      else if (/^-n\d+$/.test(x)) n = Number(x.slice(2));
      else if (x === '-u' || x === '--unit') unit = a[++i];
      else if (x === '-p' || x === '--priority') { const v = a[++i]; prio = /^\d$/.test(v) ? Number(v) : PRIO.indexOf(v); if (prio < 0) throw new Error(v + ': 優先度は ' + PRIO.join(' / ') + ' か 0〜7'); }
      else if (x === '-k' || x === '--dmesg') kernel = true;
      else if (x === '-b' || x === '--boot') { if (a[i + 1] === '-1') { prev = true; i++; } else if (a[i + 1] === '0') i++; }
      else if (x === '-r' || x === '--reverse') rev = true;
      else if (x === '-f' || x === '--follow') follow = true;
      else if (x === '--since') { const m = /^(\d{1,2}):(\d{2})$/.exec(a[++i] || ''); if (!m) throw new Error('--since は HH:MM で'); const d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0); since = d.getTime(); }
      else throw new Error('使い方: hjournal [-n 件数] [-u unit] [-p 優先度] [-k] [-b -1] [-r] [-f] [--since HH:MM]');
    }
    if (unit && !/\.(service|target)$/.test(unit) && unit !== 'kernel' && unit !== 'hinit') unit = unit + '.service';
    const f = { unit: unit, prio: prio, kernel: kernel, since: since, n: n };
    let l = journal.entries(f, prev ? journal.previous() : null);
    if (rev) l = l.slice().reverse();
    return { lines: l, f: f, follow: follow && !prev };
  }
  const prioCls = p => p <= 3 ? 'err' : p === 4 ? 'warn' : p === 5 ? 'accent' : null;
  cmd({
    name: 'hjournal', usage: 'hjournal [-n 件数] [-u unit] [-p 優先度] [-k] [-b -1] [-r] [-f]', desc: 'ジャーナル（ログ）を見る。-u でサービスごと、-p err でエラーだけ、-b -1 で前の起動、-f で流し続ける',
    async run(a, sh) {
      const tty = sh.tty, r = journalLines(a, sh);
      if (!r.lines.length && !r.follow) return '-- ログはありません --';
      const head = '-- ' + (r.lines.length ? journal.format(r.lines[0]).slice(0, 14) + ' から ' : '') + r.lines.length + ' 件 --';
      if (tty.capture) return r.lines.map(journal.format).join('\n');
      tty.println(head, 'dim');
      r.lines.forEach(e => tty.println(journal.format(e), prioCls(e.prio)));
      if (!r.follow) return;
      tty.println('-- 新しいログを待っています（Enter か Ctrl+C で終了）--', 'dim');
      const off = journal.watch(e => { if (journal.entries(Object.assign({}, r.f, { n: null, since: null }), [e]).length) tty.println(journal.format(e), prioCls(e.prio)); });
      try { await tty.read(''); } finally { off(); }
    }
  });
  cmd({ name: 'dmesg', usage: 'dmesg', desc: 'カーネルのログ（hjournal -k と同じ）', run(a, sh) { return journal.entries({ kernel: true }).map(journal.format).join('\n'); } });

  // ---- systemctl
  function unitStatus(u) {
    const s = init.state(u.name), en = enabled(u), out = [];
    out.push([DOT[s.active] + ' ' + u.name + ' - ' + u.desc, s.active === 'failed' ? 'err' : s.active === 'active' ? 'ok' : null]);
    out.push(['     Loaded: loaded (' + (u.file || 'builtin') + '; ' + (en === null ? 'static' : en ? 'enabled' : 'disabled') + ')']);
    out.push(['     Active: ' + s.active + ' (' + s.sub + ')' + (s.since ? ' since ' + new Date(s.since).toLocaleString('ja-JP') + '; ' + ago(s.since) : '') + (s.result && s.active === 'failed' ? '  Result: ' + s.result : ''), s.active === 'failed' ? 'err' : s.active === 'active' ? 'ok' : null]);
    if (u.type !== 'target') {
      if (s.pid) out.push(['   Main PID: ' + s.pid + ' (' + short(u.name) + ')']);
      out.push(['    Restart: ' + u.restart + (u.restart !== 'no' ? '（' + u.restartSec + ' 秒後）' : '')]);
      if (u.cmd) out.push(['    Command: ' + u.cmd]);
    }
    const dep = [u.requires.length ? 'Requires=' + u.requires.join(' ') : '', u.wants.length ? 'Wants=' + u.wants.join(' ') : '', u.after.length ? 'After=' + u.after.join(' ') : '', u.wantedBy.length ? 'WantedBy=' + u.wantedBy.join(' ') : ''].filter(Boolean);
    if (dep.length) out.push(['       Deps: ' + dep.join('  ')]);
    const logs = journal.entries({ unit: u.name, n: 10 });
    if (logs.length) { out.push(['']); logs.forEach(e => out.push([journal.format(e), prioCls(e.prio)])); }
    return out;
  }
  const SYSTEMCTL_USAGE = [
    '使い方: systemctl [コマンド] [unit...]',
    '  list-units [--all]      unit の一覧（既定。--all で止まっているものも）',
    '  list-unit-files         unit の有効・無効の一覧',
    '  status [unit]           状態（unit を省くとシステム全体）',
    '  start / stop / restart / reload unit...   起動・停止・再起動・再読み込み（管理者）',
    '  enable / disable [--now] unit...           起動時に動かすかどうか（管理者）',
    '  is-active / is-enabled / is-failed unit',
    '  list-dependencies [unit]   依存関係の木（既定は起動時のターゲット）',
    '  cat unit                unit の定義を表示',
    '  daemon-reload           /etc/hinit/*.service を読み込み直す（管理者）',
    '  reset-failed [unit]     失敗の印を消す',
    '  poweroff / reboot       電源を切る・再起動',
    '自分で作る: /etc/hinit/名前.service に [Unit] Description= / [Service] ExecStart=jsh のコマンド Restart=on-failure / [Install] WantedBy=multi-user.target'
  ];
  cmd({
    name: 'systemctl', usage: 'systemctl [list-units|status|start|stop|restart|enable|disable|...] [unit]', desc: 'サービスと unit の管理（htmlOS の init = hinit）。systemctl help で使い方',
    async run(a, sh) {
      const tty = sh.tty, sub = a[0] || 'list-units', rest = a.slice(1).filter(x => !/^--/.test(x)), flags = a.filter(x => /^--/.test(x));
      const pr = (t, cls) => tty.println(t, cls || undefined);
      const each = async (what, fn) => { if (!rest.length) throw new Error('unit を指定してください（systemctl ' + sub + ' unit）'); for (const n of rest) { if (!init.has(n)) throw new Error(norm(n) + ': そのような unit はありません'); await fn(init.unit(n)); } };
      switch (sub) {
        case 'help': case '-h': case '--help': return SYSTEMCTL_USAGE.join('\n');
        case 'list-units': {
          const all = flags.includes('--all') || flags.includes('-a');
          const l = init.units().filter(u => all || isActive(u.name) || init.state(u.name).active === 'failed');
          pr(pad('  UNIT', 24) + pad('LOAD', 8) + pad('ACTIVE', 10) + pad('SUB', 9) + 'DESCRIPTION', 'dim');
          l.forEach(u => { const s = init.state(u.name); pr(DOT[s.active] + ' ' + pad(u.name, 22) + pad('loaded', 8) + pad(s.active, 10) + pad(s.sub, 9) + u.desc, s.active === 'failed' ? 'err' : null); });
          return '\n' + l.length + ' 個の unit' + (all ? '' : '（止まっているものも見るには --all）');
        }
        case 'list-unit-files': {
          pr(pad('UNIT FILE', 24) + pad('STATE', 10) + 'SOURCE', 'dim');
          init.units().forEach(u => { const e = enabled(u); pr(pad(u.name, 24) + pad(e === null ? 'static' : e ? 'enabled' : 'disabled', 10) + (u.file || 'builtin')); });
          return;
        }
        case 'status': {
          if (rest.length) { await each('', u => { unitStatus(u).forEach(l => pr(l[0], l[1])); pr(''); }); return; }
          const l = init.units(), failed = l.filter(u => init.state(u.name).active === 'failed');
          pr('● ' + OS.hostname(), 'accent');
          pr('    State: ' + (failed.length ? 'degraded（' + failed.length + ' 個の unit が失敗）' : 'running'), failed.length ? 'err' : 'ok');
          pr('    Units: ' + l.filter(u => isActive(u.name)).length + ' 個が動作中 / 全 ' + l.length + ' 個');
          pr('   Target: ' + init.defaultTarget());
          pr(' Booted at: ' + new Date(OS.bootTime || now()).toLocaleString('ja-JP') + '（' + ago(OS.bootTime || now()) + '）');
          pr('');
          proc.list().forEach(p => pr((p.kind === 'init' ? '' : p.ppid === 1 || p.ppid === 0 ? '  ├─' : '  │  └─') + p.pid + ' ' + p.cmd + (p.unit ? '  [' + p.unit + ']' : '')));
          return;
        }
        case 'start': case 'stop': case 'restart': case 'reload': case 'try-restart':
          needAdmin(sh, 'unit の' + ({ start: '起動', stop: '停止', restart: '再起動', reload: '再読み込み', 'try-restart': '再起動' }[sub]));
          await each(sub, async u => {
            if (sub === 'stop' && u.refuseStop) throw new Error(u.name + ' は止められません');
            let ok = true;
            if (sub === 'start') ok = await init.start(u.name);
            else if (sub === 'stop') await init.stop(u.name);
            else if (sub === 'restart' || (sub === 'try-restart' && isActive(u.name))) ok = await init.restart(u.name);
            else if (sub === 'reload') { if (u.reload) { await u.reload(); ilog(u.desc + ' を再読み込みしました'); } else ok = await init.restart(u.name); }
            if (!ok) throw new Error(u.name + ' を起動できませんでした。詳しくは「systemctl status ' + u.name + '」と「hjournal -u ' + u.name + '」');
          });
          return;
        case 'enable': case 'disable':
          needAdmin(sh, '有効・無効の切り替え');
          await each(sub, async u => {
            init.enable(u.name, sub === 'enable');
            pr((sub === 'enable' ? 'Created symlink ' : 'Removed ') + '/etc/hinit/' + u.wantedBy[0] + '.wants/' + u.name, 'dim');
            if (flags.includes('--now')) { if (sub === 'enable') await init.start(u.name); else await init.stop(u.name); }
          });
          return;
        case 'is-active': { if (!rest.length) throw new Error('unit を指定してください'); return init.state(rest[0]).active; }
        case 'is-enabled': { const u = init.unit(rest[0] || ''); if (!u) throw new Error((rest[0] || '') + ': そのような unit はありません'); const e = enabled(u); return e === null ? 'static' : e ? 'enabled' : 'disabled'; }
        case 'is-failed': { const s = init.state(rest[0] || ''); return s.active === 'failed' ? 'failed' : s.active; }
        case 'cat': await each(sub, u => {
          pr('# ' + (u.file || u.name + '（組み込み）'), 'dim');
          if (u.text) { pr(u.text.replace(/\n$/, '')); return; }
          pr('[Unit]'); pr('Description=' + u.desc);
          if (u.requires.length) pr('Requires=' + u.requires.join(' ')); if (u.wants.length) pr('Wants=' + u.wants.join(' ')); if (u.after.length) pr('After=' + u.after.join(' '));
          if (u.type !== 'target') { pr(''); pr('[Service]'); pr('Type=' + u.type); pr('ExecStart=' + (u.cmd || '(JavaScript で組み込み)')); pr('Restart=' + u.restart); if (u.restart !== 'no') pr('RestartSec=' + u.restartSec); }
          if (u.wantedBy.length) { pr(''); pr('[Install]'); pr('WantedBy=' + u.wantedBy.join(' ')); }
        }); return;
        case 'list-dependencies': {
          const root = norm(rest[0] || init.defaultTarget()); if (!init.has(root)) throw new Error(root + ': そのような unit はありません');
          const seen = new Set();
          const walk = (n, depth) => {
            const u = init.unit(n), s = init.state(n); pr('  '.repeat(depth) + (depth ? '├─' : '') + DOT[s.active] + ' ' + n, s.active === 'failed' ? 'err' : s.active === 'active' ? 'ok' : null);
            if (seen.has(n) || !u) return; seen.add(n);
            const kids = u.requires.concat(u.wants);
            if (u.type === 'target') init.units().forEach(v => { if (v.wantedBy.includes(n) && enabled(v)) kids.push(v.name); });
            Array.from(new Set(kids)).sort().forEach(k => walk(k, depth + 1));
          };
          walk(root, 0); return;
        }
        case 'daemon-reload': needAdmin(sh, 'daemon-reload '); init.reload(); return;
        case 'reset-failed': init.resetFailed(rest[0]); return;
        case 'poweroff': OS.poweroff(); return;
        case 'reboot': OS.reboot(); return;
        default: throw new Error(sub + ': 知らないコマンドです。systemctl help で使い方');
      }
    }
  });

  scanFiles();
  journal.log('kernel', 'hinit（PID 1）を起動しました', { prio: 6 });
})();
