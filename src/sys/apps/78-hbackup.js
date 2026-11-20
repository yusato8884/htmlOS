/* hBackup — バックアップと復元。LocalStorage の中身を1つの .json ファイルにして PC に書き出す */
(function () {
  const OS = window.OS, h = OS.h, ui = OS.ui;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  OS.registerApp({
    id: 'hbackup', name: 'hBackup', icon: 'archive', color: '#986a44', desc: 'バックアップと復元',
    launch() {
      const user = OS.htui.user, home = OS.users.home(user);
      const admin = () => !!(OS.users.get(user) || {}).admin;
      const win = OS.htui.open({ title: 'hBackup', icon: 'archive', w: 560, h: 440, app: 'hbackup' });
      const pane = h('div', { class: 'pane' });
      win.body.append(pane);
      const pick = h('input', { type: 'file', accept: '.json,application/json', id: 'hbk-file-' + win.pid, style: 'display:none' });

      function collect(scope) {
        const entries = {};
        for (const k of OS.store.keys()) {
          if (k === 'bootflag') continue;
          if (scope === 'home' && !(k === 'f:' + home || k.startsWith('f:' + home + '/'))) continue;
          entries[k] = OS.store.get(k);
        }
        return { format: 'htmlos-backup', version: OS.version, created: new Date().toISOString(), scope: scope, user: user, home: home, entries: entries };
      }
      function exportIt(scope) {
        try {
          const data = JSON.stringify(collect(scope));
          const d = new Date(), z = n => String(n).padStart(2, '0');
          const name = 'htmlos-' + (scope === 'home' ? user : 'full') + '-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.json';
          const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
          const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          OS.notify({ app: 'hBackup', icon: 'archive', title: 'バックアップを書き出しました', body: name + '（' + fmtSize(data.length) + '）' });
        } catch (e) { ui.alert('書き出せませんでした。\n' + e.message); }
      }
      pick.addEventListener('change', async () => {
        const f = pick.files[0]; pick.value = ''; if (!f) return;
        try {
          let b; try { b = JSON.parse(await f.text()); } catch (e) { throw new Error('バックアップファイルとして読めませんでした（JSONではありません）'); }
          if (!b || b.format !== 'htmlos-backup' || !b.entries) throw new Error('htmlOS のバックアップファイルではありません');
          const keys = Object.keys(b.entries);
          const info = '作成: ' + new Date(b.created).toLocaleString('ja-JP') + '\nhtmlOS ' + b.version + ' ・ ' + keys.length + ' 項目 ・ ' + fmtSize(f.size);
          if (b.scope === 'home') {
            const from = b.home || '/home/' + b.user;
            if (b.user !== user && !admin()) throw new Error('これは ' + b.user + ' のホームのバックアップです。自分のホームに入れられるのは自分のバックアップだけです（管理者は可）');
            if (!(await ui.confirm(from + ' のバックアップを ' + home + ' に復元します。同じ名前のファイルは上書きされ、それ以外のファイルは残ります。\n\n' + info, { ok: '復元', title: 'ホームの復元' }))) return;
            let n = 0;
            for (const k of keys) {
              if (!(k === 'f:' + from || k.startsWith('f:' + from + '/'))) continue;
              const dest = 'f:' + home + k.slice(2 + from.length);
              let v = b.entries[k];
              if (b.user !== user) { try { const node = JSON.parse(v); node.o = user; v = JSON.stringify(node); } catch (e) { /* そのまま */ } }
              OS.store.set(dest, v); n++;
            }
            OS.notify({ app: 'hBackup', icon: 'archive', title: '復元しました', body: n + ' 項目を復元しました' }); render();
          } else {
            if (!b.entries.meta || !b.entries['f:/sys/kernel.js']) throw new Error('システム全体のバックアップとしては中身が足りません');
            if (!(await ui.confirm('今の htmlOS（全ユーザー・全ファイル・設定）をすべて消して、バックアップの内容に置き換えます。元に戻せません。終わると再起動します。\n\n' + info, { ok: 'すべて置き換えて再起動', danger: true, title: 'システム全体の復元' }))) return;
            if (!(await ui.asRoot('システム全体を復元します。'))) return;
            const old = {}; OS.store.keys().forEach(k => { old[k] = OS.store.get(k); });
            try { OS.store.wipe(); keys.forEach(k => OS.store.set(k, b.entries[k])); }
            catch (e) { OS.store.wipe(); Object.keys(old).forEach(k => OS.store.set(k, old[k])); throw new Error('容量が足りず復元できませんでした。元の状態に戻しました'); }
            OS.reboot();
          }
        } catch (e) { ui.alert(e.message); }
      });
      function render() {
        pane.textContent = '';
        const full = JSON.stringify(collect('full')).length, mine = JSON.stringify(collect('home')).length;
        pane.append(
          h('p', null, 'htmlOS の中身はブラウザのストレージ（IndexedDB）にあるので、ブラウザのデータを消すと一緒に消えます。大事なものは PC にバックアップしておくと安心です。別のPCやブラウザへの引っ越しにも使えます。'),
          h('h3', null, 'バックアップ（PCに書き出す）'),
          h('div', { class: 'st-card' }, h('div', { class: 'who' }, h('b', null, '自分のホーム'), h('small', null, home + ' 以下 ・ 約 ' + fmtSize(mine))),
            h('button', { class: 'btn primary', type: 'button', onclick: () => exportIt('home') }, OS.icon('download', 16), '書き出す')),
          h('div', { class: 'st-card' }, h('div', { class: 'who' }, h('b', null, 'システム全体'), h('small', null, '全ユーザー・設定・/sys・パッケージ ・ 約 ' + fmtSize(full) + ' ・ root のパスワードが必要')),
            h('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await ui.asRoot('システム全体をバックアップします。')) exportIt('full'); } }, OS.icon('download', 16), '書き出す')),
          h('h3', null, '復元（PCから読み込む）'),
          h('p', null, 'バックアップファイル（.json）を選ぶと、中身の種類（ホーム／システム全体）を見て確認画面を出します。'),
          h('div', null, h('button', { class: 'btn', type: 'button', onclick: () => pick.click() }, OS.icon('upload', 16), 'バックアップファイルを選ぶ'), pick),
          h('p', { class: 'note-warn' }, 'システム全体のバックアップには、全ユーザーのファイルとパスワードのハッシュが含まれます。ファイルの扱いに注意してください。'));
      }
      render();
      return win;
    }
  });
})();
