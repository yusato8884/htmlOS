/* カーソルのテーマ。デスクトップ環境（とそのログイン画面）ごとに、SVG で描いたカーソルを使う。
     HTUi … 紺に白いふち（独自）   hWin … 白に黒いふち（Windows 風）   hAqua … 黒に白いふちと影（macOS 風）
     hShell … 濃い灰色に白いふち（GNOME 風）   hwc … 小さめの白に黒いふち（シンプル）
   形は場所で変わる: 矢印・リンク（指）・文字入力（I）・リサイズ（↔ ↕ ⤡ ⤢）・移動・十字（hPaint）・使えない（無効なボタン）。
   どれも CSS の cursor で指定する（カーソルはロックしない。右クリックは contextmenu イベントで受ける）。 */
(function () {
  const OS = window.OS;
  const P = {
    arrow: ['M5 2.5v16.8l4.3-4.1 2.9 6.6 2.7-1.2-2.9-6.5h6.2z', 5, 3],
    hand: ['M9.5 3.6a1.5 1.5 0 0 1 3 0V10h.4V8.8a1.5 1.5 0 0 1 3 0V10h.4V9.8a1.5 1.5 0 0 1 3 0v6c0 3.4-2.2 5.7-5.6 5.7h-1.3c-1.9 0-3.4-.8-4.6-2.3L4.6 15a1.45 1.45 0 0 1 2.3-1.8L9.5 15.6z', 11, 3],
    resize: ['M2.5 12l4.6-4.6v3.1h9.8V7.4l4.6 4.6-4.6 4.6v-3.1H7.1v3.1z', 12, 12],
    move: ['M12 2.3l3.6 3.6h-2.4v4.9h4.9V8.4l3.6 3.6-3.6 3.6v-2.4h-4.9v4.9h2.4L12 21.7l-3.6-3.6h2.4v-4.9H5.9v2.4L2.3 12l3.6-3.6v2.4h4.9V5.9H8.4z', 12, 12]
  };
  const THEMES = {
    htui: { fill: '#1b2a4a', line: '#fff', w: 1.5, shadow: true, size: 24 },
    win: { fill: '#fff', line: '#000', w: 1.2, shadow: true, size: 24 },
    mac: { fill: '#000', line: '#fff', w: 1.7, shadow: true, size: 24 },
    gnome: { fill: '#242424', line: '#fff', w: 1.5, shadow: true, size: 24, round: true },
    wm: { fill: '#fff', line: '#000', w: 1.1, shadow: false, size: 20 }
  };
  // ( ) ' も符号にしておく（CSS の url() の中でも、読み取る側でも区切りと間違えないように）
  const url = (svg, hx, hy, kw) => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/[()']/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '") ' + hx + ' ' + hy + ', ' + kw;
  function shapes(t) {
    const k = t.size / 24, join = t.round ? 'round' : 'miter';
    const wrap = body => "<svg xmlns='http://www.w3.org/2000/svg' width='" + t.size + "' height='" + t.size + "' viewBox='0 0 24 24'>" +
      (t.shadow ? "<defs><filter id='s' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0' dy='1' stdDeviation='.8' flood-opacity='.45'/></filter></defs><g filter='url(#s)'>" : '<g>') + body + '</g></svg>';
    const solid = (d, tr) => "<path d='" + d + "' fill='" + t.fill + "' stroke='" + t.line + "' stroke-width='" + t.w + "' stroke-linejoin='" + join + "'" + (tr ? " transform='" + tr + "'" : '') + '/>';
    // 線だけの形（I ビーム・十字・禁止）は、白い太いふちの上に細い本体を重ねる。本体は「塗り」の色、ただし白い塗りのテーマでは黒
    const main = t.fill === '#fff' ? '#000' : t.fill, edge = '#fff';
    const lines = (d, extra) => "<path d='" + d + "' fill='none' stroke='" + edge + "' stroke-width='4.2' stroke-linecap='round'/><path d='" + d + "' fill='none' stroke='" + main + "' stroke-width='1.8' stroke-linecap='round'/>" + (extra || '');
    const hs = (x, y) => Math.round(x * k) + ' ' + Math.round(y * k);
    return {
      arrow: url(wrap(solid(P.arrow[0])), ...hs(P.arrow[1], P.arrow[2]).split(' '), 'default'),
      hand: url(wrap(solid(P.hand[0])), ...hs(P.hand[1], P.hand[2]).split(' '), 'pointer'),
      text: url(wrap(lines('M8.6 4h6.8M12 4v16M8.6 20h6.8')), ...hs(12, 12).split(' '), 'text'),
      ew: url(wrap(solid(P.resize[0])), ...hs(12, 12).split(' '), 'ew-resize'),
      ns: url(wrap(solid(P.resize[0], 'rotate(90 12 12)')), ...hs(12, 12).split(' '), 'ns-resize'),
      nwse: url(wrap(solid(P.resize[0], 'rotate(45 12 12)')), ...hs(12, 12).split(' '), 'nwse-resize'),
      nesw: url(wrap(solid(P.resize[0], 'rotate(-45 12 12)')), ...hs(12, 12).split(' '), 'nesw-resize'),
      move: url(wrap(solid(P.move[0])), ...hs(12, 12).split(' '), 'move'),
      cross: url(wrap(lines('M12 3v6M12 15v6M3 12h6M15 12h6', "<circle cx='12' cy='12' r='1.2' fill='" + main + "'/>")), ...hs(12, 12).split(' '), 'crosshair'),
      no: url(wrap("<circle cx='12' cy='12' r='7.5' fill='none' stroke='" + edge + "' stroke-width='4.4'/><path d='M6.8 6.8l10.4 10.4' stroke='" + edge + "' stroke-width='4.4'/><circle cx='12' cy='12' r='7.5' fill='none' stroke='#d0312d' stroke-width='2'/><path d='M6.8 6.8l10.4 10.4' stroke='#d0312d' stroke-width='2'/>"), ...hs(12, 12).split(' '), 'not-allowed')
    };
  }
  const vars = t => Object.entries(shapes(THEMES[t])).map(([n, v]) => '--c-' + n + ':' + v + ';').join('');
  const SCOPES = {
    htui: '#os-root',
    win: '#os-root .de-win,#os-root .hdm-w11,#os-root .hdm-w8,#os-root .hdm-wp',
    mac: '#os-root .de-mac,#os-root .hdm-mac,#os-root .hdm-ios',
    gnome: '#os-root .de-gnome,#os-root .hdm-gdm',
    wm: '#os-root .de-wm,#os-root .hdm-wm'
  };
  const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=color]):not([type=file]),textarea,[contenteditable=""],[contenteditable="true"],.tty-scr,.tty-scr *';
  // ページ全体（#os-root の外の html・body）も、いまのデスクトップ環境のカーソルにする
  const ROOTS = { htui: ':root', win: ':root:has(.de-win,.hdm-w11,.hdm-w8,.hdm-wp)', mac: ':root:has(.de-mac,.hdm-mac,.hdm-ios)', gnome: ':root:has(.de-gnome,.hdm-gdm)', wm: ':root:has(.de-wm,.hdm-wm)' };
  const css = Object.keys(ROOTS).map(t => ROOTS[t] + '{' + vars(t) + '}').join('\n') + '\n' +
    Object.keys(SCOPES).map(t => SCOPES[t] + '{' + vars(t) + '}').join('\n') + '\n' + [
    'html,body{cursor:var(--c-arrow)}',
    '#os-root,#os-root *{cursor:var(--c-arrow)}',
    '#os-root :is(a[href],a[href] *,[data-cursor=hand]){cursor:var(--c-hand)}',
    '#os-root :is(' + TEXT + '){cursor:var(--c-text)}',
    '#os-root :is(button,input,select,textarea):disabled{cursor:var(--c-no)}',
    '#os-root :is(.rz-e,.rz-w){cursor:var(--c-ew)}', '#os-root :is(.rz-n,.rz-s){cursor:var(--c-ns)}',
    '#os-root :is(.rz-nw,.rz-se){cursor:var(--c-nwse)}', '#os-root :is(.rz-ne,.rz-sw){cursor:var(--c-nesw)}',
    '#os-root .pt-canvas{cursor:var(--c-cross)}', '#os-root .pt-canvas.hand{cursor:var(--c-move)}',
    // 7.2.1: 指定のない画面（起動・終了のスプラッシュ、電源が切れた画面の何もない所）は透明
    '#os-root :is(#splash,#splash *,.poweroff,.poweroff :not(.pw-btn,.pw-btn *)){cursor:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271%27 height=%271%27/%3E") 0 0,none}'
  ].join('\n');
  OS.cursorThemes = Object.keys(THEMES);
  const old = document.getElementById('htmlos-cursors'); if (old) old.remove();
  document.head.append(OS.h('style', { id: 'htmlos-cursors' }, css));
})();
