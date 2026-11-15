/* hPlayer — メディアプレーヤー（動画・音声・画像） */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const MEDIA = ['image', 'audio', 'video'];
  OS.registerApp({
    id: 'hplayer', name: 'hPlayer', icon: 'play', color: '#9141ac', desc: 'メディアプレーヤー',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hPlayer', icon: 'play', w: 620, h: 440, app: 'hplayer' });
      let cur = null, objUrl = null;
      const stage = h('div', { class: 'hp-stage' }), info = h('span', { class: 'grow' });
      const pc = h('input', { type: 'file', accept: 'image/*,audio/*,video/*', id: 'hp-file-' + win.pid, style: 'display:none' });
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, 'aria-label': title || label, onclick: fn }, OS.icon(icon, 16), label);
      const bPrev = tb('back', null, () => step(-1), '前のファイル'), bNext = tb('fwd', null, () => step(1), '次のファイル');
      win.body.append(
        h('div', { class: 'toolbar' },
          tb('folder', '開く', async () => { const p = await ui.pickFile({ mode: 'open', dir: cur ? path.dir(cur) : home, kinds: MEDIA, title: 'メディアを開く' }); if (p) openPath(p); }, 'hFS のファイルを開く'),
          tb('upload', 'PCから', () => pc.click(), 'PCのファイルを保存せずに再生（閉じると消えます）'),
          tb('globe', 'URL', async () => { const u = await ui.prompt('画像・音声・動画のURL', 'https://', { title: 'URLを開く' }); if (u && /^https?:\/\//.test(u)) show(guess(u), u, u, 'URL'); }, 'URLを直接再生（保存しません）'),
          h('span', { class: 'sep' }), bPrev, bNext, pc),
        stage, h('div', { class: 'statusbar' }, info));

      function guess(name) { const k = OS.fs.kind(name.split(/[?#]/)[0]); return MEDIA.includes(k) ? k : 'video'; }
      function release() { if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; } stage.querySelectorAll('audio,video').forEach(m => { try { m.pause(); } catch (e) { /* 無視 */ } }); }
      function show(kind, src, label, from) {
        stage.textContent = '';
        const fail = () => { stage.textContent = ''; stage.append(h('p', { class: 'hp-note' }, label + ' を再生できませんでした。このブラウザが対応していない形式か、読み込めない場所にあります。')); };
        let el;
        if (kind === 'image') el = h('img', { src: src, alt: label });
        else if (kind === 'audio') { el = h('audio', { src: src, controls: true }); stage.append(h('div', { class: 'hp-disc' }, OS.icon('audio', 40)), h('div', null, label)); }
        else el = h('video', { src: src, controls: true });
        el.addEventListener('error', fail);
        stage.append(el);
        info.textContent = label + ' ・ ' + from;
        win.setTitle(label + ' — hPlayer');
        bPrev.disabled = bNext.disabled = !cur;
      }
      function siblings() { try { return fsx.list(path.dir(cur)).filter(n => MEDIA.includes(fsx.kind(n))).map(n => path.join(path.dir(cur), n)); } catch (e) { return []; } }
      function step(d) { const s = siblings(), i = s.indexOf(cur); if (s.length > 1 && i >= 0) openPath(s[(i + d + s.length) % s.length]); }
      function openPath(p) {
        try {
          const k = fsx.kind(p);
          if (!MEDIA.includes(k)) throw new Error(path.base(p) + ' は画像・音声・動画ではありません');
          release(); cur = p;
          show(k, fsx.dataURL(p), path.base(p), 'hFS: ' + p);
        } catch (e) { ui.alert(e.message); }
      }
      pc.addEventListener('change', () => {
        const f = pc.files[0]; if (!f) return;
        release(); cur = null; objUrl = URL.createObjectURL(f);
        show(f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : guess(f.name), objUrl, f.name, 'PCのファイル（保存していません）');
        pc.value = '';
      });
      win.onDispose = release;
      if (typeof arg === 'string' && arg) openPath(arg);
      else { stage.append(h('p', { class: 'hp-note' }, '「開く」で hFS 内のファイルを、「PCから」「URL」で保存せずに再生できます。大きな動画は LocalStorage に入らないので「PCから」がおすすめです。')); bPrev.disabled = bNext.disabled = true; }
      return win;
    }
  });
})();
