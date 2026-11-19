/* hPaint — お絵かき。PNG で hFS に保存する */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const PALETTE = ['#1c1c1c', '#ffffff', '#c01c28', '#e66100', '#f5c211', '#2ec27e', '#3584e4', '#9141ac', '#986a44', '#9a9996'];
  const TOOLS = [['pen', 'ペン'], ['eraser', '消しゴム'], ['line', '直線'], ['rect', '四角'], ['oval', '円'], ['fill', '塗りつぶし'], ['hand', '移動']];
  const ZOOMS = [0.25, 0.5, 1, 2, 4, 8];
  OS.registerApp({
    id: 'hpaint', name: 'hPaint', icon: 'brush', color: '#d56199', desc: 'お絵かき',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hPaint', icon: 'brush', w: 760, h: 540, app: 'hpaint' });
      let file = null, dirty = false, tool = 'pen', color = PALETTE[0], size = 4, undo = [], zoom = 1, fitMode = true;
      const cv = h('canvas', { class: 'pt-canvas', width: '640', height: '400', 'aria-label': 'キャンバス' });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const info = h('span', { class: 'grow' });
      const tb = (label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, label);
      const toolBtns = {}, swBtns = [];
      const colorInp = h('input', { class: 'pt-color', type: 'color', id: 'pt-color-' + win.pid, value: color, title: '色を選ぶ', 'aria-label': '色' });
      const sizeInp = h('input', { type: 'range', min: '1', max: '40', value: '4', id: 'pt-size-' + win.pid, style: 'width:90px', title: '太さ', 'aria-label': '太さ' });
      const bUndo = tb('元に戻す', doUndo);
      const zoomLbl = h('button', { class: 'tbtn pt-zoom', type: 'button', title: '表示倍率', onclick: e => OS.htui.menu(e.currentTarget, ZOOMS.map(z => ({ label: Math.round(z * 100) + '%', act: () => setZoom(z) })).concat([{ sep: true }, { label: '画面に合わせる', act: fit }])) }, '100%');
      const stage = h('div', { class: 'pt-stage' }, cv);
      win.body.append(
        h('div', { class: 'toolbar' }, tb('新規', newDoc), tb('開く', openDlg), tb('保存', save), tb('別名で保存', saveAs), h('span', { class: 'sep' }), bUndo, tb('全消去', () => { push(); blank(); setDirty(true); })),
        h('div', { class: 'toolbar' }, TOOLS.map(t => (toolBtns[t[0]] = tb(t[1], () => setTool(t[0])))), h('span', { class: 'sep' }),
          h('span', { class: 'pt-colors' }, PALETTE.map(c => { const b = h('button', { class: 'pt-sw', type: 'button', style: 'background:' + c, title: c, 'aria-label': '色 ' + c, onclick: () => setColor(c) }); swBtns.push(b); return b; }), colorInp),
          h('span', { class: 'sep' }), sizeInp, h('span', { class: 'sep' }),
          tb('−', () => step(-1), '縮小（Ctrl+ −）'), zoomLbl, tb('＋', () => step(1), '拡大（Ctrl+ ＋）'), tb('全体', fit, '画面に合わせる（Ctrl+0 で 100%）')),
        stage, h('div', { class: 'statusbar' }, info));

      function status() {
        info.textContent = (file || '無題') + (dirty ? ' ・ 未保存' : '') + ' ・ ' + cv.width + ' × ' + cv.height + ' px ・ 太さ ' + size + ' ・ ' + Math.round(zoom * 100) + '%';
        zoomLbl.textContent = Math.round(zoom * 100) + '%';
        win.setTitle((dirty ? '● ' : '') + (file ? path.base(file) : '無題') + ' — hPaint');
        bUndo.disabled = !undo.length;
      }
      const setDirty = d => { dirty = d; status(); };
      function setTool(t) { tool = t; cv.classList.toggle('hand', t === 'hand'); Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('on', k === t)); }

      // ---- ズーム。キャンバスの見た目の大きさだけを変える（絵の画素数は変わらない）
      function applySize() { cv.style.width = Math.round(cv.width * zoom) + 'px'; cv.style.height = Math.round(cv.height * zoom) + 'px'; }
      // (ax, ay) の画面上の点がずれないように倍率を変える。点を省くと表示中の中央が基準
      function setZoom(z, ax, ay) {
        const sr = stage.getBoundingClientRect();
        if (ax == null) { ax = sr.left + sr.width / 2; ay = sr.top + sr.height / 2; }
        const r = cv.getBoundingClientRect(), fx = (ax - r.left) / r.width, fy = (ay - r.top) / r.height;
        zoom = Math.max(0.1, Math.min(16, z)); fitMode = false; applySize();
        const r2 = cv.getBoundingClientRect();
        stage.scrollLeft += r2.left + fx * r2.width - ax; stage.scrollTop += r2.top + fy * r2.height - ay;
        status();
      }
      function step(d) {
        const i = ZOOMS.findIndex(z => z >= zoom - 0.001);
        const next = d > 0 ? ZOOMS.find(z => z > zoom + 0.001) : ZOOMS.slice().reverse().find(z => z < zoom - 0.001);
        setZoom(next != null ? next : (d > 0 ? Math.min(16, zoom * 2) : Math.max(0.1, zoom / 2)));
        void i;
      }
      function fit() {
        const w = stage.clientWidth - 24, hh = stage.clientHeight - 24;
        if (w <= 0 || hh <= 0) return;
        zoom = Math.max(0.1, Math.min(1, w / cv.width, hh / cv.height)); fitMode = true; applySize(); status();
      }
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (fitMode) fit(); }); ro.observe(stage); const od = win.onDispose; win.onDispose = () => { ro.disconnect(); if (od) od(); }; }
      // Ctrl + ホイールで拡大縮小（ポインタの位置を中心に）
      stage.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
      // 2本指: ピンチで拡大縮小、動かしてスクロール。描いている途中で2本目が触れたら、その線は取り消す
      const touches = new Map(); let pinch = null, drawing = null;
      stage.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          if (drawing) drawing.abort();
          const [a, b] = [...touches.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        }
      }, true);
      stage.addEventListener('pointermove', e => {
        if (!touches.has(e.pointerId)) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!pinch || touches.size < 2) return;
        const [a, b] = [...touches.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, mx, my);
        stage.scrollLeft -= mx - pinch.mx; stage.scrollTop -= my - pinch.my;
        pinch.mx = mx; pinch.my = my;
      }, true);
      const lift = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
      stage.addEventListener('pointerup', lift, true); stage.addEventListener('pointercancel', lift, true);
      function setColor(c) { color = c; colorInp.value = c; swBtns.forEach((b, i) => b.classList.toggle('on', PALETTE[i] === c)); }
      colorInp.addEventListener('input', () => setColor(colorInp.value));
      sizeInp.addEventListener('input', () => { size = Number(sizeInp.value); status(); });
      function blank() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
      function push() { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 12) undo.shift(); }
      function doUndo() { const d = undo.pop(); if (!d) return; if (d.width !== cv.width || d.height !== cv.height) { cv.width = d.width; cv.height = d.height; } ctx.putImageData(d, 0, 0); setDirty(true); }
      const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
      function stroke(a, b, col) { ctx.strokeStyle = col; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      function shape(a, b) {
        ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
        if (tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        else if (tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        else ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      function flood(p) {
        const w = cv.width, hh = cv.height, img = ctx.getImageData(0, 0, w, hh), d = img.data;
        const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
        if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= hh) return;
        const i0 = (y0 * w + x0) * 4, tr = d[i0], tg = d[i0 + 1], tbb = d[i0 + 2];
        const nr = parseInt(color.slice(1, 3), 16), ng = parseInt(color.slice(3, 5), 16), nb = parseInt(color.slice(5, 7), 16);
        if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tbb - nb) < 4) return;
        const match = i => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tbb) < 48;
        const stack = [x0, y0];
        while (stack.length) {
          const y = stack.pop(); let x = stack.pop();
          while (x > 0 && match((y * w + x - 1) * 4)) x--;
          let up = false, down = false;
          for (; x < w && match((y * w + x) * 4); x++) {
            const i = (y * w + x) * 4; d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = 255;
            if (y > 0) { const m = match(i - w * 4); if (m && !up) stack.push(x, y - 1); up = m; }
            if (y < hh - 1) { const m = match(i + w * 4); if (m && !down) stack.push(x, y + 1); down = m; }
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      cv.addEventListener('pointerdown', e => {
        if (e.button > 0 || pinch || touches.size > 1) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        if (tool === 'hand') { // 移動ツール: ドラッグでスクロール
          const s0 = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
          const mv = ev => { stage.scrollLeft = s0.l - (ev.clientX - s0.x); stage.scrollTop = s0.t - (ev.clientY - s0.y); };
          const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); };
          cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
          return;
        }
        push();
        const a = pos(e);
        if (tool === 'fill') { flood(a); setDirty(true); return; }
        const snap = ctx.getImageData(0, 0, cv.width, cv.height); let last = a;
        const free = tool === 'pen' || tool === 'eraser', col = tool === 'eraser' ? '#ffffff' : color;
        if (free) stroke(a, { x: a.x + 0.01, y: a.y }, col);
        const mv = ev => { if (!drawing) return; const p = pos(ev); if (free) { stroke(last, p, col); last = p; } else { ctx.putImageData(snap, 0, 0); shape(a, p); } };
        const end = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); drawing = null; };
        const up = () => { const was = drawing; end(); if (was) setDirty(true); };
        drawing = { abort() { ctx.putImageData(snap, 0, 0); undo.pop(); end(); status(); } };
        cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      });

      async function discardOk() {
        if (!dirty) return true;
        const r = await ui.modal({ title: '変更を保存しますか?', body: h('p', { class: 'modal-msg' }, (file ? path.base(file) : '無題') + ' への変更が保存されていません。'),
          buttons: [{ label: 'キャンセル', cancel: true, value: 'cancel' }, { label: '保存しない', danger: true, value: 'discard' }, { label: '保存', primary: true, value: 'save' }] });
        if (r === 'save') return save();
        return r === 'discard';
      }
      async function newDoc() {
        if (!(await discardOk())) return;
        const sel = h('select', { class: 'sel', id: 'pt-newsize' }, [['320x240', '320 × 240（小）'], ['640x400', '640 × 400（標準）'], ['800x600', '800 × 600（大）'], ['256x256', '256 × 256（アイコン向け）']].map(o => h('option', { value: o[0], selected: o[0] === '640x400' }, o[1])));
        const v = await ui.modal({ title: '新しい絵', body: [h('p', { class: 'modal-msg' }, 'キャンバスの大きさ'), sel], buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: '作成', primary: true, value: () => sel.value }] });
        if (!v) return;
        const s = v.split('x'); cv.width = +s[0]; cv.height = +s[1]; blank(); undo = []; file = null; setDirty(false); fit();
      }
      function load(p) {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight, 1));
          cv.width = Math.max(1, Math.round(img.naturalWidth * k)) || 640; cv.height = Math.max(1, Math.round(img.naturalHeight * k)) || 400;
          blank(); ctx.drawImage(img, 0, 0, cv.width, cv.height); undo = []; file = /\.png$/i.test(p) ? p : null; setDirty(false); fit();
          if (!file) ui.toast('PNG 以外を開いたので、保存時は別名（.png）になります');
        };
        img.onerror = () => ui.alert(path.base(p) + ' を画像として読み込めませんでした。');
        try { img.src = fsx.dataURL(p); } catch (e) { ui.alert(e.message); }
      }
      async function openDlg() { if (!(await discardOk())) return; const p = await ui.pickFile({ mode: 'open', dir: file ? path.dir(file) : home + '/Pictures', kinds: ['image'], title: '画像を開く' }); if (p) load(p); }
      function write(p) {
        try { fsx.write(p, cv.toDataURL('image/png'), { bin: true }); file = p; setDirty(false); ui.toast('保存しました: ' + p); return true; }
        catch (e) { ui.alert('保存できませんでした。\n' + e.message); return false; }
      }
      async function save() { return file ? write(file) : saveAs(); }
      async function saveAs() {
        let p = await ui.pickFile({ mode: 'save', dir: file ? path.dir(file) : home + '/Pictures', name: file ? path.base(file) : '無題.png' });
        if (!p) return false;
        if (!/\.png$/i.test(p)) p += '.png';
        if (p !== file && fsx.exists(p) && !(await ui.confirm(path.base(p) + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return false;
        return write(p);
      }
      win.el.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); save(); } else if (k === 'z') { e.preventDefault(); doUndo(); }
        else if (k === '+' || k === '=' || k === ';') { e.preventDefault(); step(1); } else if (k === '-') { e.preventDefault(); step(-1); } else if (k === '0') { e.preventDefault(); setZoom(1); }
      });
      win.onClose = discardOk;
      // ハイバーネート: 絵そのものを書き出す（元に戻す履歴は残さない）
      win.onHibernate = () => ({ img: cv.toDataURL('image/png'), w: cv.width, h: cv.height, file: file, dirty: dirty, tool: tool, color: color, size: size, zoom: zoom, fit: fitMode });
      blank(); setTool('pen'); setColor(color); status(); requestAnimationFrame(fit);
      if (typeof arg === 'string' && arg && fsx.exists(arg)) load(arg);
      else if (arg && arg.resume) {
        const r = arg.resume;
        file = r.file || null; setTool(r.tool || 'pen'); setColor(r.color || color);
        size = r.size || 4; sizeInp.value = String(size);
        cv.width = r.w || 640; cv.height = r.h || 400; blank(); setDirty(!!r.dirty);
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); if (r.fit === false) { zoom = r.zoom || 1; fitMode = false; applySize(); status(); } else fit(); };
        img.src = r.img;
      }
      return win;
    }
  });
})();
