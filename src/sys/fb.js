/* htmlOS フレームバッファー（7.2.1 から）— /dev/fb0
   ・Linux の fbdev と同じく、画面の画素を並べたバイト列。1 画素 4 バイト（B, G, R, X の順 = 32bpp BGRX）、左上から右へ、上から下へ
   ・既定の大きさは 640×360。jsh の fbset -g 幅 高さ で変えられる（16〜1920 × 16〜1080）
   ・/dev/fb0 を読むと、いまの画素（幅×高さ×4 バイト）が返る。書くと先頭から画素を置き換え、画面いっぱいに表示する
     （Linux で X の上から fb0 に描いたときのように、デスクトップの上に重なる。Esc かクリックで閉じる）
   ・OS.fb: width / height / bpp / ctx（canvas の 2D。描いたら OS.fb.commit()）/ write(バイト列) / read() / show() / hide() / clear() / resize(w, h) / png()
   ・jsh: fbset（大きさ・表示）、fbtest（テスト模様）、fbi（画像を表示）、fbgrab（PNG に保存。-d でデスクトップを写す）、/proc/fb */
(function () {
  'use strict';
  const OS = window.OS;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let W = 640, H = 360, ver = 0, cache = null, cacheVer = -1;
  let ov = null, hintT = 0;

  function resize(w, h) {
    w = Math.round(Number(w)); h = Math.round(Number(h));
    if (!(w >= 16 && w <= 1920 && h >= 16 && h <= 1080)) throw new Error('fb0: 大きさは 16〜1920 × 16〜1080 にしてください');
    const old = W === w && H === h ? null : ctx.getImageData(0, 0, W, H);
    W = w; H = h; cv.width = w; cv.height = h;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (old) ctx.putImageData(old, 0, 0); // 重なる部分は残す
    ver++;
  }
  resize(640, 360);

  // バイト列（文字列なら 1 文字 = 1 バイト、または Uint8Array）を先頭から置き換える
  function write(data, offset) {
    const n = data.length, off = Math.max(0, offset | 0), size = W * H * 4;
    if (off >= size) { const e = new Error('/dev/fb0: デバイスに空き領域がありません（ENOSPC）'); e.code = 'ENOSPC'; throw e; }
    const img = ctx.getImageData(0, 0, W, H), d = img.data, str = typeof data === 'string';
    const end = Math.min(size, off + n);
    for (let i = off; i < end; i++) {
      const v = (str ? data.charCodeAt(i - off) : data[i - off]) & 255, px = i & ~3, c = i & 3;
      // BGRX → RGBA
      if (c === 0) d[px + 2] = v; else if (c === 1) d[px + 1] = v; else if (c === 2) d[px] = v;
    }
    for (let p = (off & ~3) + 3; p < end; p += 4) d[p] = 255;
    ctx.putImageData(img, 0, 0);
    commit();
    return end - off;
  }
  // いまの画素を BGRX のバイト列（文字列）で
  function read() {
    if (cache != null && cacheVer === ver) return cache;
    const d = ctx.getImageData(0, 0, W, H).data, parts = [];
    for (let y = 0; y < H; y++) {
      const row = new Array(W * 4);
      for (let x = 0, i = y * W * 4; x < W; x++, i += 4) { const j = x * 4; row[j] = d[i + 2]; row[j + 1] = d[i + 1]; row[j + 2] = d[i]; row[j + 3] = 0; }
      parts.push(String.fromCharCode.apply(null, row));
    }
    cache = parts.join(''); cacheVer = ver;
    return cache;
  }
  // 描いたあとに呼ぶ（表示する・読む内容を新しくする）
  function commit(o) { ver++; if (!(o && o.quiet)) show(); }

  // ---- 表示（画面全体に重ねる）
  function show() {
    if (!ov) {
      const view = document.createElement('canvas');
      view.className = 'fb-view';
      const hint = document.createElement('div');
      hint.className = 'fb-hint';
      ov = document.createElement('div');
      ov.className = 'fb-ov'; ov.setAttribute('role', 'img'); ov.setAttribute('aria-label', 'フレームバッファー /dev/fb0（Esc かクリックで閉じる）');
      ov.append(view, hint);
      ov.addEventListener('pointerdown', e => { e.preventDefault(); hide(); });
      ov._view = view; ov._hint = hint;
    }
    const view = ov._view;
    if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
    view.getContext('2d').drawImage(cv, 0, 0);
    ov._hint.textContent = '/dev/fb0  ' + W + '×' + H + ' 32bpp ・ Esc かクリックで閉じる';
    if (!ov.isConnected) {
      document.body.append(ov);
      window.addEventListener('keydown', onKey, true);
      ov._hint.classList.remove('gone'); clearTimeout(hintT); hintT = setTimeout(() => { if (ov) ov._hint.classList.add('gone'); }, 2500);
    }
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); } }
  function hide() { if (ov && ov.isConnected) { ov.remove(); window.removeEventListener('keydown', onKey, true); } }
  function clear() { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); commit({ quiet: true }); if (ov && ov.isConnected) show(); }

  const fb = OS.fb = {
    get width() { return W; }, get height() { return H; }, bpp: 32, canvas: cv, ctx: ctx,
    get visible() { return !!(ov && ov.isConnected); },
    resize: resize, write: write, read: read, commit: commit, show: show, hide: hide, clear: clear,
    png: () => cv.toDataURL('image/png'),
    // 画像（img・canvas など）を、縦横比を保って真ん中に描く
    drawFit(src, sw, sh) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const k = Math.min(W / sw, H / sh), dw = sw * k, dh = sh * k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    },
    info() {
      return 'mode "' + W + 'x' + H + '"\n    geometry ' + W + ' ' + H + ' ' + W + ' ' + H + ' 32\n    rgba 8/16,8/8,8/0,0/0\nendmode\n';
    },
    // テスト模様
    test(kind) {
      const g = ctx; kind = kind || 'bars';
      if (kind === 'bars') {
        const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
        cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(Math.floor(i * W / 7), 0, Math.ceil(W / 7), Math.round(H * 0.67)); });
        const low = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
        low.forEach((c, i) => { g.fillStyle = c; g.fillRect(Math.floor(i * W / 7), Math.round(H * 0.67), Math.ceil(W / 7), Math.round(H * 0.08)); });
        const y = Math.round(H * 0.75), bh = H - y;
        [['#00214c', 0, 5 / 28], ['#ffffff', 5 / 28, 10 / 28], ['#32006a', 10 / 28, 15 / 28], ['#131313', 15 / 28, 1]].forEach(b => { g.fillStyle = b[0]; g.fillRect(Math.floor(b[1] * W), y, Math.ceil((b[2] - b[1]) * W), bh); });
      } else if (kind === 'gradient') {
        const img = g.createImageData(W, H), d = img.data;
        for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) { const i = (yy * W + x) * 4; d[i] = x * 255 / (W - 1); d[i + 1] = yy * 255 / (H - 1); d[i + 2] = 255 - x * 255 / (W - 1); d[i + 3] = 255; }
        g.putImageData(img, 0, 0);
      } else if (kind === 'noise') {
        const img = g.createImageData(W, H), d = img.data, r = new Uint8Array(W * H * 4);
        for (let i = 0; i < r.length; i += 65536) crypto.getRandomValues(r.subarray(i, Math.min(r.length, i + 65536)));
        for (let i = 0; i < d.length; i += 4) { d[i] = r[i]; d[i + 1] = r[i + 1]; d[i + 2] = r[i + 2]; d[i + 3] = 255; }
        g.putImageData(img, 0, 0);
      } else if (kind === 'plasma') {
        const img = g.createImageData(W, H), d = img.data, t = Date.now() / 1000;
        for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
          const u = x / W * 6, v = yy / H * 6, s = Math.sin(u + t) + Math.sin(v * 1.3 - t) + Math.sin((u + v) * 0.8) + Math.sin(Math.hypot(u - 3, v - 3) * 2 - t);
          const i = (yy * W + x) * 4; d[i] = 128 + 127 * Math.sin(s * Math.PI / 2); d[i + 1] = 128 + 127 * Math.sin(s * Math.PI / 2 + 2.1); d[i + 2] = 128 + 127 * Math.sin(s * Math.PI / 2 + 4.2); d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      } else if (kind === 'logo') {
        g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H);
        const s = Math.min(H / 40, W / 60);
        g.save(); g.translate(W / 2 - 12 * s, H / 2 - 16 * s); g.scale(s, s);
        g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.lineCap = 'round'; g.lineJoin = 'round';
        g.stroke(new Path2D('M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'));
        g.restore();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 ' + Math.round(s * 2.6) + 'px sans-serif';
        g.fillText(OS.name || 'htmlOS', W / 2, H / 2 + 7 * s);
        g.fillStyle = '#8a93a8'; g.font = Math.round(s * 1.2) + 'px monospace';
        g.fillText('/dev/fb0  ' + W + 'x' + H + ' 32bpp', W / 2, H / 2 + 10.5 * s);
      } else throw new Error('fbtest: ' + kind + ': そのような模様はありません（bars / gradient / noise / plasma / logo）');
      commit();
    }
  };

  if (OS.dev) {
    OS.dev.add('fb0', { read: read, write: s => { write(s, 0); }, mode: 0o666, group: 'video', key: () => ver + ':' + W + 'x' + H });
    OS.dev.proc('fb', () => '0 htmlfb\n');
  }
})();
