/* /sys/ipc.js — htmlOS のプロセス間通信（5.1 から。D-Bus にあたる）
   ・メッセージバス: 名前（htmlos.Notify など）を持ったプロセスのメソッドを呼ぶ（call）・トピックに信号を流す（publish / subscribe）
       const b = OS.ipc.connect({ pid, user });            // つなぐ（jsh の JavaScript からは bus() で、そのシェルとしてつながる）
       b.own('my.Hello', { Hi(ctx, name) { return 'こんにちは ' + name + '（' + ctx.user + ' から）'; } }, '説明');
       await b.call('my.Hello', 'Hi', '悠');                // → 'こんにちは 悠（yu から）'
       const off = b.subscribe('unit.*', (data, m) => …);  // * は . を含まない 1 語、** は何でも
       b.publish('my.event', { x: 1 });  b.close();
     メソッドは ctx（{ user, pid, sender }）と引数を受け取る。引数と戻り値は JSON にできる値だけ（コピーして渡す）
     組み込みの名前: htmlos.Notify / htmlos.Sound / htmlos.Init / htmlos.Journal / htmlos.Session / htmlos.Bus
     流れる信号: unit.changed（サービスの状態）・session.login / session.logout・notify・power.shutdown / power.reboot・bus.name
   ・名前付きパイプ（FIFO）: mkfifo で作ったファイルに書くと、読んで待っている相手に届く（cat で読む） */
(function () {
  'use strict';
  const OS = window.OS, users = OS.users;
  const names = new Map(), subs = new Set(), mons = new Set(), eps = new Set();
  let serial = 0, nextId = 1;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const reOf = new Map();
  // トピックのパターン: * は . を含まない 1 語、** は何でも（unit.* / session.** / **）
  function match(pat, topic) {
    if (pat === topic || pat === '**') return true;
    let re = reOf.get(pat);
    if (!re) { re = new RegExp('^' + String(pat).split(/(\*\*|\*)/).map(x => x === '**' ? '.*' : x === '*' ? '[^.]*' : x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$'); reOf.set(pat, re); }
    return re.test(String(topic));
  }
  function emit(m) { m.t = Date.now(); mons.forEach(f => { try { f(m); } catch (e) { /* 見ている側の失敗は無視 */ } }); }
  function publish(topic, data, from) {
    topic = String(topic);
    if (!/^[\w-]+(\.[\w-]+)*$/.test(topic)) throw new Error(topic + ': トピックは a.b.c のように英数字と . で');
    const d = clone(data === undefined ? null : data), m = { topic: topic, from: from || 'kernel' };
    emit({ type: 'signal', topic: topic, from: m.from, data: d });
    subs.forEach(s => { if (match(s.pat, topic)) Promise.resolve().then(() => s.fn(clone(d), m)).catch(e => console.warn('[ipc]', topic, e)); });
  }
  const methodsOf = n => Object.keys(n.methods).map(k => ({ name: k, doc: (n.docs && n.docs[k]) || '' }));
  function connect(o) {
    o = o || {};
    const ep = { id: ':1.' + (nextId++), closed: false, owned: new Set(), mySubs: new Set() };
    Object.defineProperty(ep, 'user', { get: () => typeof o.user === 'function' ? o.user() : (o.user || 'root'), enumerable: true });
    Object.defineProperty(ep, 'pid', { get: () => o.pid || 0, enumerable: true });
    const live = () => { if (ep.closed) throw new Error('この接続はもう閉じています'); };
    // 名前を持つ。methods は { 名前(ctx, ...引数) } か { 名前: { doc, fn } }
    ep.own = function (name, methods, desc) {
      live(); name = String(name);
      if (!/^[A-Za-z][\w-]*(\.[A-Za-z][\w-]*)+$/.test(name)) throw new Error(name + ': 名前は my.Hello のように . で区切ってください');
      if (names.has(name)) throw new Error(name + ': その名前はほかのプロセス（PID ' + names.get(name).ep.pid + '）が使っています');
      if (/^htmlos\./.test(name) && ep.user !== 'root') throw new Error(name + ': htmlos. で始まる名前は root だけが使えます');
      const fns = {}, docs = {};
      Object.keys(methods || {}).forEach(k => { const v = methods[k]; if (typeof v === 'function') fns[k] = v; else if (v && typeof v.fn === 'function') { fns[k] = v.fn; docs[k] = v.doc || ''; } });
      names.set(name, { name: name, ep: ep, methods: fns, docs: docs, desc: desc || '' });
      ep.owned.add(name);
      publish('bus.name', { name: name, owner: ep.id, pid: ep.pid, op: 'own' }, ep.id);
      return name;
    };
    ep.release = function (name) {
      if (!ep.owned.has(name)) return false;
      ep.owned.delete(name); names.delete(name);
      publish('bus.name', { name: name, owner: ep.id, pid: ep.pid, op: 'release' }, ep.id);
      return true;
    };
    ep.call = async function (name, method, ...args) {
      live();
      const n = names.get(String(name));
      if (!n) throw new Error(name + ': その名前はバスにありません（ipc list で一覧）');
      const fn = n.methods[method];
      if (!fn) throw new Error(name + ': ' + method + ' というメソッドはありません（ipc introspect ' + name + '）');
      const s = ++serial, a = clone(args);
      emit({ type: 'call', serial: s, from: ep.id, user: ep.user, to: n.name, method: method, args: a });
      let timer = 0;
      try {
        const v = await Promise.race([
          Promise.resolve().then(() => fn({ user: ep.user, pid: ep.pid, sender: ep.id }, ...a)),
          new Promise((r, j) => { timer = setTimeout(() => j(new Error(name + '.' + method + ': 30 秒たっても返事がありません')), 30000); })
        ]);
        const c = clone(v);
        emit({ type: 'return', serial: s, to: ep.id, value: c });
        return c;
      } catch (e) {
        emit({ type: 'error', serial: s, to: ep.id, error: (e && e.message) || String(e) });
        throw e instanceof Error ? e : new Error(String(e));
      } finally { clearTimeout(timer); }
    };
    ep.subscribe = function (pat, fn) {
      live();
      const s = { pat: String(pat), fn: fn, ep: ep };
      subs.add(s); ep.mySubs.add(s);
      return () => { subs.delete(s); ep.mySubs.delete(s); };
    };
    ep.publish = (topic, data) => { live(); publish(topic, data, ep.id); };
    ep.close = function () {
      if (ep.closed) return;
      Array.from(ep.owned).forEach(n => ep.release(n));
      ep.mySubs.forEach(s => subs.delete(s)); ep.mySubs.clear();
      ep.closed = true; eps.delete(ep);
    };
    eps.add(ep);
    return ep;
  }
  // プロセスが終わったら、その接続を閉じる（名前も手放す）
  if (OS.proc) {
    const ex = OS.proc.exit;
    OS.proc.exit = function (pid, code) { const r = ex.apply(this, arguments); eps.forEach(ep => { if (ep.pid && ep.pid === Number(pid)) ep.close(); }); return r; };
  }

  // ---- 名前付きパイプ（FIFO）。書いたものは、いま読んで待っている全員に届く。だれも読んでいなければためておく
  const pipes = new Map();
  const P = q => { let p = pipes.get(q); if (!p) { p = { buf: '', waiters: [] }; pipes.set(q, p); } return p; };
  function fifoWrite(q, c) {
    const p = P(q); p.buf += String(c);
    if (p.waiters.length) { const d = p.buf; p.buf = ''; p.waiters.splice(0).forEach(w => w(d)); }
  }
  function fifoRead(q, signal) {
    const p = P(q);
    if (p.buf) { const d = p.buf; p.buf = ''; return Promise.resolve(d); }
    return new Promise(res => {
      const w = d => res(d); p.waiters.push(w);
      if (signal) signal.then(() => { const i = p.waiters.indexOf(w); if (i >= 0) p.waiters.splice(i, 1); res(null); });
    });
  }

  const ipc = OS.ipc = {
    connect: connect,
    publish: (topic, data, from) => publish(topic, data, from),
    match: match,
    list: () => Array.from(names.values()).sort((a, b) => a.name.localeCompare(b.name)).map(n => ({ name: n.name, pid: n.ep.pid, user: n.ep.user, desc: n.desc, methods: methodsOf(n) })),
    has: name => names.has(name),
    monitor(fn) { mons.add(fn); return () => mons.delete(fn); },
    fifoWrite: fifoWrite, fifoRead: fifoRead,
    stats: () => ({ names: names.size, subscriptions: subs.size, connections: eps.size, messages: serial })
  };

  // ---- 組み込みの名前（PID 1 の hinit が持つ）
  const sys = connect({ pid: 1, user: 'root' });
  const needRoot = (ctx, what) => { if (!users.isRoot(ctx.user)) throw new Error(what + 'には root 権限が必要です（sudo ipc call …）'); };
  const D = (doc, fn) => ({ doc: doc, fn: fn });
  sys.own('htmlos.Bus', {
    Ping: D('→ "pong"', () => 'pong'),
    ListNames: D('バスにある名前の一覧', () => ipc.list().map(n => n.name)),
    Stats: D('名前・購読・接続・メッセージの数', () => ipc.stats())
  }, 'メッセージバスそのもの');
  sys.own('htmlos.Notify', {
    Notify: D('(タイトル, 本文) 通知を出す', (ctx, title, body) => { const n = OS.notify ? OS.notify({ app: ctx.user, icon: 'bell', title: String(title == null ? '' : title), body: body == null ? '' : String(body) }) : null; return n ? n.id : null; })
  }, 'デスクトップの通知');
  sys.own('htmlos.Sound', {
    Play: D('(名前) 効果音を鳴らす', (ctx, name) => { if (!OS.sound.list().includes(name)) throw new Error(name + ': その音はありません（List で一覧）'); return OS.sound.play(name, true); }),
    List: D('効果音の名前の一覧', () => OS.sound.list())
  }, '効果音');
  sys.own('htmlos.Init', {
    ListUnits: D('unit と状態の一覧', () => OS.init.units().map(u => ({ name: u.name, type: u.type, active: OS.init.state(u.name).active }))),
    Status: D('(unit) 状態', (ctx, n) => { const s = OS.init.state(n); return { active: s.active, sub: s.sub, pid: s.pid, since: s.since, result: s.result }; }),
    Start: D('(unit) 起動する（root）', (ctx, n) => { needRoot(ctx, 'Start '); return OS.init.start(n); }),
    Stop: D('(unit) 止める（root）', (ctx, n) => { needRoot(ctx, 'Stop '); return OS.init.stop(n); }),
    Restart: D('(unit) 再起動する（root）', (ctx, n) => { needRoot(ctx, 'Restart '); return OS.init.restart(n); })
  }, 'サービス管理（hinit）');
  sys.own('htmlos.Journal', {
    Log: D('(メッセージ, 重要度 0〜7) ログに書く', (ctx, msg, prio) => { OS.journal.log(ctx.user, String(msg), { pid: ctx.pid, prio: prio == null ? 6 : Number(prio) }); return true; }),
    Tail: D('(件数) 新しいログ', (ctx, n) => OS.journal.entries({ n: Math.min(200, Number(n) || 10) }).map(e => OS.journal.format(e)))
  }, 'ログ（hjournald）');
  sys.own('htmlos.Session', {
    Who: D('ログイン中のユーザー', () => OS.htui && OS.htui.running && OS.htui.user ? [OS.htui.user] : []),
    Info: D('デスクトップの状態', () => ({ running: !!(OS.htui && OS.htui.running), user: (OS.htui && OS.htui.user) || null, hostname: OS.hostname ? OS.hostname() : null }))
  }, 'ログインセッション（HTUi）');

  if (OS.journal) OS.journal.log('kernel', 'メッセージバスを用意しました（名前 ' + names.size + ' 個）', { prio: 6 });
})();
