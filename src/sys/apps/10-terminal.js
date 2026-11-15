/* Terminal — jsh のコンソール */
(function () {
  const OS = window.OS;
  OS.registerApp({
    id: 'terminal', name: 'Terminal', icon: 'terminal', color: '#2e3436', desc: 'jsh コンソール',
    launch(arg) {
      const win = OS.htui.open({ title: 'Terminal', icon: 'terminal', w: 660, h: 400, app: 'terminal' });
      const tty = new OS.Tty(win.body);
      const sh = new OS.Jsh(tty, OS.htui.user, { cmd: arg && arg.cmd });
      win.onFocus = () => tty.focus();
      win.onDispose = () => { sh.exited = true; tty.dispose(); };
      tty.focus();
      sh.loop().then(() => win.close(true));
      return win;
    }
  });
})();
