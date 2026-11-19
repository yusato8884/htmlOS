/* Terminal — jsh のコンソール */
(function () {
  const OS = window.OS;
  OS.registerApp({
    id: 'terminal', name: 'Terminal', icon: 'terminal', color: '#2e3436', desc: 'jsh コンソール',
    launch(arg) {
      const win = OS.htui.open({ title: 'Terminal', icon: 'terminal', w: 660, h: 400, app: 'terminal' });
      const tty = new OS.Tty(win.body), rs = arg && arg.resume;
      const sh = new OS.Jsh(tty, OS.htui.user, { cmd: arg && arg.cmd, resume: !!rs, ppid: win.pid, onsignal: sig => win.close(sig === 'KILL') });
      win.onFocus = () => tty.focus();
      // ハイバーネート: 画面の文字（色の種類つき）と、シェルの状態を書き出す
      win.onHibernate = () => {
        const out = []; let size = 0;
        Array.from(tty.out.childNodes).reverse().some(n => { const t = n.textContent; size += t.length; if (size > 200000) return true; out.unshift([n.nodeType === 1 ? (n.className || '').replace(/^t-/, '') : '', t]); return false; });
        return { out: out, input: tty.pending ? tty.input.value : '', cwd: sh.cwd, hist: sh.hist.slice(-300), vars: sh.vars, aliases: sh.aliases, umask: sh.umask };
      };
      if (rs) {
        (rs.out || []).forEach(o => tty.print(o[1], o[0] || null));
        try { if (OS.fs.isDir(rs.cwd)) sh.cwd = rs.cwd; } catch (e) { /* なければホーム */ }
        if (Array.isArray(rs.hist)) sh.hist.push.apply(sh.hist, rs.hist);
        Object.assign(sh.vars, rs.vars || {}); Object.assign(sh.aliases, rs.aliases || {});
        if (rs.umask != null) sh.umask = rs.umask;
        if (sh.vars) sh.vars.PWD = sh.cwd;
        if (rs.input) setTimeout(() => { if (tty.pending) tty.input.value = rs.input; }, 0);
      }
      win.onDispose = () => { sh.exited = true; if (sh.proc) OS.proc.exit(sh.proc.pid); tty.dispose(); };
      tty.focus();
      sh.loop().then(() => win.close(true));
      return win;
    }
  });
})();
