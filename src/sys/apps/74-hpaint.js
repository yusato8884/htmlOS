/* hPaint — お絵かき。PNG で hFS に保存する */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;
  const PALETTE = ['#1c1c1c', '#ffffff', '#c01c28', '#e66100', '#f5c211', '#2ec27e', '#3584e4', '#9141ac', '#986a44', '#9a9996'];
  const TOOLS = [['pen', 'ペン'], ['eraser', '消しゴム'], ['line', '直線'], ['rect', '四角'], ['oval', '円'], ['fill', '塗りつぶし']];
  OS.registerApp({
    id: 'hpaint', name: 'hPaint', icon: 'brush', color: '#d56199', desc: 'お絵かき',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      const win = OS.htui.open({ title: 'hPaint', icon: 'brush', w: 760, h: 540, app: 'hpaint' });
      let file = null, dirty = false, tool = 'pen', color = PALETTE[0], size = 4, undo = [];
      const cv = h('canvas', { class: 'pt-canvas', width: '640', height: '400', 'aria-label': 'キャンバス' });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const info = h('span', { class: 'grow' });
      const tb = (label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, onclick: fn }, label);
      const toolBtns = {}, swBtns = [];
      const colorInp = h('input', { class: 'pt-color', type: 'color', id: 'pt-color-' + win.pid, value: color, title: '色を選ぶ', 'aria-label': '色' });
      const sizeInp = h('input', { type: 'range', min: '1', max: '40', value: '4', id: 'pt-size-' + win.pid, style: 'width:90px', title: '太さ', 'aria-label': '太さ' });
      const bUndo = tb('元に戻す', doUndo);
      win.body.append(
        h('div', { class: 'toolbar' }, tb('新規', newDoc), tb('開く', openDlg), tb('保存', save), tb('別名で保存', saveAs), h('span', { class: 'sep' }), bUndo, tb('全消去', () => { push(); blank(); setDirty(true); })),
        h('div', { class: 'toolbar' }, TOOLS.map(t => (toolBtns[t[0]] = tb(t[1], () => setTool(t[0])))), h('span', { class: 'sep' }),
          h('span', { class: 'pt-colors' }, PALETTE.map(c => { const b = h('button', { class: 'pt-sw', type: 'button', style: 'background:' + c, title: c, 'aria-label': '色 ' + c, onclick: () => setColor(c) }); swBtns.push(b); return b; }), colorInp),
          h('span', { class: 'sep' }), sizeInp),
        h('div', { class: 'pt-stage' }, cv), h('div', { class: 'statusbar' }, info));

      function status() {
        info.textContent = (file || '無題') + (dirty ? ' ・ 未保存' : '') + ' ・ ' + cv.width + ' × ' + cv.height + ' px ・ 太さ ' + size;
        win.setTitle((dirty ? '● ' : '') + (file ? path.base(file) : '無題') + ' — hPaint');
        bUndo.disabled = !undo.length;
      }
      const setDirty = d => { dirty = d; status(); };
      function setTool(t) { tool = t; Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('on', k === t)); }
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
        if (e.button > 0) return;
        e.preventDefault(); push();
        const a = pos(e);
        if (tool === 'fill') { flood(a); setDirty(true); return; }
        cv.setPointerCapture(e.pointerId);
        const snap = ctx.getImageData(0, 0, cv.width, cv.height); let last = a;
        const free = tool === 'pen' || tool === 'eraser', col = tool === 'eraser' ? '#ffffff' : color;
        if (free) stroke(a, { x: a.x + 0.01, y: a.y }, col);
        const mv = ev => { const p = pos(ev); if (free) { stroke(last, p, col); last = p; } else { ctx.putImageData(snap, 0, 0); shape(a, p); } };
        const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); setDirty(true); };
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
        const s = v.split('x'); cv.width = +s[0]; cv.height = +s[1]; blank(); undo = []; file = null; setDirty(false);
      }
      function load(p) {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight, 1));
          cv.width = Math.max(1, Math.round(img.naturalWidth * k)) || 640; cv.height = Math.max(1, Math.round(img.naturalHeight * k)) || 400;
          blank(); ctx.drawImage(img, 0, 0, cv.width, cv.height); undo = []; file = /\.png$/i.test(p) ? p : null; setDirty(false);
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
      });
      win.onClose = discardOk;
      blank(); setTool('pen'); setColor(color); status();
      if (typeof arg === 'string' && arg && fsx.exists(arg)) load(arg);
      return win;
    }
  });
})();
