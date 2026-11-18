/* hTask — タスクマネージャ（ウィンドウ一覧とストレージの内訳） */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  OS.registerApp({
    id: 'htask', name: 'hTask', icon: 'chart', color: '#3a944a', desc: 'タスクマネージャ',
    launch() {
      const win = OS.htui.open({ title: 'hTask', icon: 'chart', w: 620, h: 430, app: 'htask' });
      const pane = h('div', { class: 'pane' });
      let tab = 'proc', sig = '';
      const tabs = { proc: 'ウィンドウ', disk: 'ストレージ' }, tabBtns = {};
      const bar = h('div', { class: 'tabs' }, Object.keys(tabs).map(k => (tabBtns[k] = h('button', { class: 'tab', type: 'button', onclick: () => { tab = k; sig = ''; render(); } }, tabs[k]))));
      win.body.append(bar, pane);

      function procs() {
        const s = OS.htui.wins.map(w => w.pid + w.title + w.el.className).join('|');
        if (s === sig) return; sig = s;
        pane.textContent = '';
        const rows = OS.htui.wins.map(w => h('tr', { class: w === win ? 'cur' : null },
          h('td', { class: 'num' }, w.pid), h('td', null, (OS.apps[w.app] || {}).name || w.app || '-'), h('td', null, w.title),
          h('td', null, w.el.classList.contains('hidden') ? '最小化' : w.zone ? 'スナップ' : '通常'),
          h('td', { class: 'num' },
            h('button', { class: 'btn small', type: 'button', onclick: () => w.focus() }, '前面へ'), ' ',
            h('button', { class: 'btn small danger', type: 'button', title: '保存の確認なしで閉じます', onclick: () => w.close(true) }, '強制終了'))));
        pane.append(h('p', null, 'HTUi で開いているウィンドウです。「強制終了」は未保存の確認を出さずに閉じます（jsh の kill と同じ）。'),
          h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { class: 'num' }, 'PID'), h('th', null, 'アプリ'), h('th', null, 'タイトル'), h('th', null, '状態'), h('th', null, ''))), h('tbody', null, rows)));
      }
      function disk() {
        pane.textContent = '';
        const groups = {}, files = []; let sys = 0;
        for (const k of OS.store.keys()) {
          const size = k.length + 7 + (OS.store.get(k) || '').length;
          if (!k.startsWith('f:')) { sys += size; continue; }
          const p = k.slice(2), parts = p.split('/').filter(Boolean);
          const g = parts.length === 0 ? '/' : parts[0] === 'home' && parts[1] ? '/home/' + parts[1] : '/' + parts[0];
          groups[g] = (groups[g] || 0) + size;
          if (OS.fs.isFile(p) && OS.htui.fs.exists(p)) files.push({ p: p, size: size });
        }
        if (sys) groups['（管理情報）'] = sys;
        const u = OS.fs.usage(), max = Math.max(1, ...Object.values(groups));
        const gRows = Object.keys(groups).sort((a, b) => groups[b] - groups[a]).map(g => h('tr', null, h('td', null, g), h('td', { class: 'num' }, fmtSize(groups[g])), h('td', { style: 'width:40%' }, h('div', { class: 'bar' }, h('i', { style: 'width:' + (groups[g] / max * 100) + '%' })))));
        files.sort((a, b) => b.size - a.size);
        const fRows = files.slice(0, 12).map(f => h('tr', null, h('td', null, f.p), h('td', { class: 'num' }, fmtSize(f.size)),
          h('td', { class: 'num' }, h('button', { class: 'btn small', type: 'button', onclick: () => OS.htui.run('hfile', f.p) }, 'hFile で表示'))));
        pane.append(
          h('p', null, '全体: ' + fmtSize(u.used) + (u.disk ? (u.total ? ' / ' + fmtSize(u.total) + '（' + Math.round(u.used / u.total * 100) + '%）' : '（上限なし）') : ' / 約 5 MB（' + Math.round(u.used / u.total * 100) + '%）') + ' ・ ' + OS.storeLabel()),
          h('div', { class: 'bar', style: 'height:12px' }, h('i', { style: 'width:' + (u.total ? Math.min(100, u.used / u.total * 100) : 0) + '%' })),
          h('h3', null, '場所ごとの使用量'),
          h('table', { class: 'tbl' }, h('tbody', null, gRows)),
          h('h3', null, '大きいファイル（上位12件）'),
          h('table', { class: 'tbl' }, h('tbody', null, fRows)),
          h('div', null, h('button', { class: 'btn small', type: 'button', onclick: disk }, '更新')));
      }
      function render() {
        Object.keys(tabBtns).forEach(k => tabBtns[k].classList.toggle('on', k === tab));
        if (tab === 'proc') procs(); else disk();
      }
      const timer = setInterval(() => { if (tab === 'proc' && !win.el.classList.contains('hidden')) procs(); }, 1000);
      win.onDispose = () => clearInterval(timer);
      render();
      return win;
    }
  });
})();
