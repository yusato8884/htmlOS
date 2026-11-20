/* hCron — cron のジョブを GUI で見る・追加する・直す（htmlOS 7.0）。中身は OS.cron（/sys/init.js）と同じ /var/spool/cron/<ユーザー>
   jsh の crontab -e からも開く */
(function () {
  const OS = window.OS, h = OS.h;
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  const fmt = t => t ? new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

  OS.registerApp({
    id: 'hcron', name: 'hCron', icon: 'clock', color: '#9141ac', desc: '決まった時刻にコマンドを実行する（cron）',
    launch(arg) {
      const ex = OS.htui.wins.find(w => w.app === 'hcron');
      if (ex) { ex.focus(); return ex; }
      const ui = OS.ui, C = OS.cron;
      const win = OS.htui.open({ title: 'hCron', icon: 'clock', w: 760, h: 500, app: 'hcron' });
      const me = OS.htui.user, isRoot = OS.users.isRoot(me);
      let who = typeof arg === 'string' && (arg === me || isRoot) ? arg : me;
      const list = h('div', { class: 'cr-list' }), logBox = h('pre', { class: 'cr-log', id: 'cr-log' }), stat = h('span', { class: 'cr-stat' });
      const userSel = isRoot ? h('select', { class: 'inp cr-user', 'aria-label': 'ユーザー', onchange: e => { who = e.target.value; render(); } },
        OS.users.list().map(u => h('option', { value: u.name, selected: u.name === who }, u.name))) : null;
      win.body.append(h('div', { class: 'cr' },
        h('div', { class: 'cr-bar' },
          h('button', { class: 'btn primary', type: 'button', id: 'cr-add', onclick: () => edit(null) }, OS.icon('plus', 16), 'ジョブを追加'),
          h('button', { class: 'btn', type: 'button', id: 'cr-text', onclick: editText }, 'テキストで編集'),
          userSel ? h('label', { class: 'cr-who' }, 'ユーザー ', userSel) : h('span', { class: 'cr-who' }, me + ' のジョブ'),
          stat),
        list,
        h('div', { class: 'cr-logh' }, '最近の実行（cron.service のログ）'),
        logBox));
      if (!C) { list.textContent = 'cron がありません'; return win; }

      function svc() { try { return OS.init.state('cron.service').active; } catch (e) { return '?'; } }
      function render() {
        list.textContent = '';
        const jobs = C.jobs(who), s = svc();
        stat.textContent = 'cron.service: ' + (s === 'active' ? '動いています' : s);
        stat.classList.toggle('bad', s !== 'active');
        if (!jobs.length) { list.append(h('p', { class: 'cr-empty' }, 'ジョブはありません。「ジョブを追加」で、決まった時刻に jsh のコマンドを実行できます。')); }
        else list.append(h('table', { class: 'tbl cr-tbl' },
          h('thead', null, h('tr', null, h('th', null, 'いつ'), h('th', null, 'コマンド'), h('th', null, '次の実行'), h('th', null, '前回'), h('th', null, ''))),
          h('tbody', null, jobs.map(j => {
            if (j.error) return h('tr', { class: 'cr-err' }, h('td', { colspan: 4 }, j.line + ' 行目: ' + j.error + '（' + j.text + '）'), h('td', null, h('button', { class: 'btn small danger', type: 'button', onclick: () => del(j) }, '削除')));
            const last = C.last[who + ':' + j.line];
            return h('tr', { 'data-line': j.line },
              h('td', null, h('b', null, j.desc), h('small', null, j.spec)),
              h('td', null, h('code', null, j.cmd)),
              h('td', null, j.reboot ? '起動したとき' : fmt(j.next)),
              h('td', null, last ? fmt(last.t) + (last.code ? '（失敗 ' + last.code + '）' : '（成功）') : '-'),
              h('td', { class: 'num' },
                h('button', { class: 'btn small', type: 'button', title: '今すぐ実行', onclick: async () => { await C.run(Object.assign({}, j, { user: who }), '（手動）'); ui.toast('実行しました: ' + j.cmd); render(); } }, '実行'), ' ',
                h('button', { class: 'btn small', type: 'button', onclick: () => edit(j) }, '編集'), ' ',
                h('button', { class: 'btn small danger', type: 'button', onclick: () => del(j) }, '削除')));
          }))));
        const L = OS.journal ? OS.journal.entries({ unit: 'cron.service', n: 40 }) : [];
        logBox.textContent = L.length ? L.map(e => OS.journal.format(e)).join('\n') : '（まだありません）';
        logBox.scrollTop = logBox.scrollHeight;
      }
      const save = text => { try { C.write(who, text); render(); return true; } catch (e) { ui.alert(e.message); return false; } };
      function setLine(n, line) {
        const l = C.read(who).split('\n'); if (l[l.length - 1] === '') l.pop();
        if (n) l[n - 1] = line; else l.push(line);
        return save(l.join('\n'));
      }
      async function del(j) {
        if (!(await ui.confirm('このジョブを消しますか？\n' + j.text, { ok: '削除', danger: true, title: 'hCron' }))) return;
        const l = C.read(who).split('\n'); l.splice(j.line - 1, 1); save(l.join('\n'));
      }
      // 追加・編集。よく使う形はフォームで、それ以外は「詳しく指定」で 5 つの欄を直接書く
      async function edit(j) {
        let kind = 'daily', m = 0, hh = 9, dw = 1, dm = 1, every = 5, custom = '* * * * *';
        if (j) {
          const s = j.spec.split(/\s+/);
          if (j.reboot) kind = 'reboot';
          else if (j.spec === '* * * * *') kind = 'minute';
          else if (/^\*\/\d+$/.test(s[0]) && s.slice(1).join(' ') === '* * * *') { kind = 'every'; every = +s[0].slice(2); }
          else if (/^\d+$/.test(s[0]) && s.slice(1).join(' ') === '* * * *') { kind = 'hourly'; m = +s[0]; }
          else if (/^\d+$/.test(s[0]) && /^\d+$/.test(s[1]) && s.slice(2).join(' ') === '* * *') { kind = 'daily'; m = +s[0]; hh = +s[1]; }
          else if (/^\d+$/.test(s[0]) && /^\d+$/.test(s[1]) && s[2] === '*' && s[3] === '*' && /^\d$/.test(s[4])) { kind = 'weekly'; m = +s[0]; hh = +s[1]; dw = +s[4] % 7; }
          else if (/^\d+$/.test(s[0]) && /^\d+$/.test(s[1]) && /^\d+$/.test(s[2]) && s[3] === '*' && s[4] === '*') { kind = 'monthly'; m = +s[0]; hh = +s[1]; dm = +s[2]; }
          else { kind = 'custom'; custom = j.spec; }
        }
        const KINDS = [['minute', '毎分'], ['every', '○分ごと'], ['hourly', '毎時'], ['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月'], ['reboot', '起動したとき'], ['custom', '詳しく指定（cron の書き方）']];
        const kSel = h('select', { class: 'inp', id: 'cr-kind' }, KINDS.map(k => h('option', { value: k[0], selected: k[0] === kind }, k[1])));
        const num = (id, v, lo, hi) => h('input', { class: 'inp cr-num', id: id, type: 'number', min: lo, max: hi, value: v });
        const iEvery = num('cr-every', every, 1, 59), iM = num('cr-m', m, 0, 59), iH = num('cr-h', hh, 0, 23), iDm = num('cr-dm', dm, 1, 31);
        const iDw = h('select', { class: 'inp', id: 'cr-dw' }, W.map((x, i) => h('option', { value: i, selected: i === dw }, x + '曜日')));
        const iCustom = h('input', { class: 'inp', id: 'cr-spec', value: custom, spellcheck: 'false', placeholder: '分 時 日 月 曜日' });
        const iCmd = h('input', { class: 'inp', id: 'cr-cmd', value: j ? j.cmd : '', spellcheck: 'false', placeholder: '例: echo こんにちは >> ~/cron.log' });
        const preview = h('p', { class: 'cr-prev', id: 'cr-prev' });
        const row = (label, ...els) => h('label', { class: 'cr-f' }, h('span', null, label), ...els);
        const rows = {
          every: row('間隔', iEvery, '分ごと'), m: row('分', iM), h: row('時', iH), dw: row('曜日', iDw), dm: row('日', iDm), custom: row('時刻の指定', iCustom)
        };
        const spec = () => {
          const k = kSel.value, M = +iM.value | 0, H = +iH.value | 0;
          return k === 'minute' ? '* * * * *' : k === 'every' ? '*/' + Math.max(1, +iEvery.value | 0) + ' * * * *' : k === 'hourly' ? M + ' * * * *'
            : k === 'daily' ? M + ' ' + H + ' * * *' : k === 'weekly' ? M + ' ' + H + ' * * ' + iDw.value : k === 'monthly' ? M + ' ' + H + ' ' + (+iDm.value | 0) + ' * *'
            : k === 'reboot' ? '@reboot' : iCustom.value.trim();
        };
        const upd = () => {
          const k = kSel.value, show = { every: k === 'every', m: /hourly|daily|weekly|monthly/.test(k), h: /daily|weekly|monthly/.test(k), dw: k === 'weekly', dm: k === 'monthly', custom: k === 'custom' };
          Object.keys(rows).forEach(x => { rows[x].hidden = !show[x]; });
          try { const p = C.parse(spec() + ' x'); preview.textContent = p.desc || C.describe(p) + (p.reboot ? '' : '　次の実行: ' + fmt(C.next(p))); preview.classList.remove('bad'); }
          catch (e) { preview.textContent = e.message; preview.classList.add('bad'); }
        };
        [kSel, iEvery, iM, iH, iDw, iDm, iCustom].forEach(x => x.addEventListener('input', upd));
        upd();
        const body = h('div', { class: 'cr-form' }, row('いつ', kSel), ...Object.values(rows), row('コマンド（jsh）', iCmd), preview,
          h('small', null, 'コマンドは ' + who + ' として、画面なしの jsh で実行します。出力は hjournal（cron.service）に残ります。'));
        const ok = await ui.modal({ title: j ? 'ジョブを編集' : 'ジョブを追加', width: 460, body: body, onOpen: () => iCmd.focus(),
          buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: j ? '保存' : '追加', primary: true, value: () => {
            if (!iCmd.value.trim()) { preview.textContent = 'コマンドを入れてください'; preview.classList.add('bad'); return ui.KEEP; }
            const line = spec() + ' ' + iCmd.value.trim();
            try { C.parse(line); } catch (e) { preview.textContent = e.message; preview.classList.add('bad'); return ui.KEEP; }
            return line;
          } }] });
        if (ok) setLine(j ? j.line : 0, ok);
      }
      async function editText() {
        const ta = h('textarea', { class: 'inp cr-ta', id: 'cr-ta', spellcheck: 'false' }, C.read(who));
        const err = h('p', { class: 'cr-prev bad' });
        const r = await ui.modal({ title: who + ' の crontab', width: 560, body: h('div', { class: 'cr-form' }, h('small', null, '1 行に 1 つ: 分 時 日 月 曜日 コマンド（# でコメント、@daily などの書き方も使えます）'), ta, err),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: '保存', primary: true, value: () => { try { C.check(ta.value); return ta.value; } catch (e) { err.textContent = e.message; return ui.KEEP; } } }] });
        if (r != null) save(r);
      }
      render();
      const off = OS.journal ? OS.journal.watch(e => { if (e.unit === 'cron.service') setTimeout(render, 50); }) : null;
      const t = setInterval(render, 30000);
      win.onDispose = () => { clearInterval(t); if (off) off(); };
      return win;
    }
  });
})();
