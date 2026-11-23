/* HTUi SDK 4（コードネーム Mars）— htmlOS の描画エンジン。ウィンドウマネージャ・ダイアログと、デスクトップ環境（セッション）の土台。
   2（Jupiter）で子ウインドウ（htui.open の parent）に対応し、確認などのダイアログは開いたウインドウの子ウインドウとして出る。
   3.0（Venus）で、ボタン・入力欄・チェックボックス・スライダー・スクロールバーなどを独自のデザインにし、
   WebView（htui.WebView）と、タイトルバーにアプリ独自のボタンを置くキャプションボタン（htui.open の buttons / win.addButton）を追加した。
   4（Mars）で、スナップレイアウト（最大化ボタンにマウスを乗せる）とスナップアシスト、3 分割の配置、透明効果（すりガラス）、
   どこからでも使える検索（Alt+Space。htui.search / htui.searchProviders）を追加し、端末の TUI（tty.screen）に Alt・F キー・クリックなどが届くようにした。
   コードネームは惑星の名前から選ぶ。
   ログイン画面は hdm（/sys/hdm.js）、各デスクトップ環境は /sys/shells.js にあります。
   jsh から  htui start [セッション] / htui stop  で起動・終了できます。 */
(function () {
  const OS = window.OS, h = OS.h, fs = OS.fs, path = OS.path, users = OS.users;

  // ---- 壁紙。SVG で描いて data: URL にする（ファイルを持たずに、どの解像度でもきれいに出る）
  const svgWall = (body, fallback) => 'url("data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'>" + body + '</svg>') + '") center / cover no-repeat ' + fallback;
  // 決まった並びの「ランダム」な星（毎回同じ位置になるように）
  const stars = (n, h, seed) => { let s = seed, out = ''; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) out += "<circle cx='" + Math.round(r() * 1600) + "' cy='" + Math.round(r() * h) + "' r='" + (r() * 1.4 + .4).toFixed(1) + "' fill='#fff' opacity='" + (r() * .6 + .25).toFixed(2) + "'/>"; return out; };
  const LEAF = 'M0 0C60-150 300-235 480-150C335-18 140 34 0 0Z';
  // 決まった並びの「ランダム」な点を n 個。fn(x, y, r, a, o) の結果をつなげる（r, a, o は 0〜1）
  const scatter = (n, seed, fn) => { let s = seed, out = ''; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) out += fn(Math.round(r() * 1600), Math.round(r() * 1000), r(), r(), r()); return out; };
  // 針葉樹の並んだ稜線（y: 根元の高さ, amp: 木の高さ）
  const trees = (y, amp, seed) => { let s = seed, d = 'M0 ' + (y + 40); const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let x = 0; x < 1600; x += 34) { const w = 26 + r() * 20; d += 'L' + Math.round(x) + ' ' + y + 'L' + Math.round(x + w / 2) + ' ' + Math.round(y - amp * (.55 + r() * .45)) + 'L' + Math.round(x + w) + ' ' + y; } return d + 'L1600 ' + y + 'V1000H0Z'; };
  // 7.0 の壁紙用。決まった並びの乱数（seed から毎回同じ列）
  const rnd = seed => { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
  // 北極星のまわりを回る星の軌跡（中心 cx, cy）
  const trails = (cx, cy, n, seed) => { const r = rnd(seed); let out = ''; for (let i = 0; i < n; i++) { const R = 40 + r() * 1100, a = r() * 6.283, d = .12 + r() * .35, x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a), x2 = cx + R * Math.cos(a + d), y2 = cy + R * Math.sin(a + d); out += "<path d='M" + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'A' + R.toFixed(1) + ' ' + R.toFixed(1) + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + "' stroke='" + (r() > .7 ? '#ffd9a8' : r() > .5 ? '#b9d3ff' : '#e8eeff') + "' stroke-width='" + (r() * 1.6 + .5).toFixed(1) + "' opacity='" + (r() * .35 + .12).toFixed(2) + "'/>"; } return out; };
  // カエデの葉（中心 0,0、だいたい半径 30）
  const MAPLE = 'M0 -34.2L2.2 -30.9L4.2 -30.1L5 -23.6L6 -20.9L5.2 -14.3L6.7 -15.1L8.2 -15.4L12 -19.2L13.4 -18.5L16.9 -20.2L18.9 -19.6L23.8 -21.4L24.3 -19L26.6 -17.9L23.6 -13.6L23 -11.2L17.6 -7.1L16.2 -5.3L12.7 -3.2L18.7 -3.3L21.1 -2.2L27.6 -1L28.7 1L32.6 3.4L30.1 5.3L30 7.5L24.1 7.8L24 9.7L19.5 9.5L18.3 10.6L13.1 8.9L12.2 9.5L12.9 11.6L16.7 17.3L16.9 20.1L18.8 25.9L16.8 26.9L15.9 30L12.4 27.9L11.2 30.8L7.9 27.6L5.7 27L2.9 21L1.3 19L0 13L-1.3 19L-2.9 21L-5.7 27L-7.9 27.6L-11.2 30.8L-12.4 27.9L-15.9 30L-16.8 26.9L-18.8 25.9L-16.9 20.1L-16.7 17.3L-12.9 11.6L-12.2 9.5L-13.1 8.9L-18.3 10.6L-19.5 9.5L-24 9.7L-24.1 7.8L-30 7.5L-30.1 5.3L-32.6 3.4L-28.7 1L-27.6 -1L-21.1 -2.2L-18.7 -3.3L-12.7 -3.2L-16.2 -5.3L-17.6 -7.1L-23 -11.2L-23.6 -13.6L-26.6 -17.9L-24.3 -19L-23.8 -21.4L-18.9 -19.6L-16.9 -20.2L-13.4 -18.5L-12 -19.2L-8.2 -15.4L-6.7 -15.1L-5.2 -14.3L-6 -20.9L-5 -23.6L-4.2 -30.1L-2.2 -30.9ZM-1 6L1 6L2 30L-0.5 30Z';
  // 夜の街のビル（明かりのついた窓つき）
  const city = (base, hmin, hmax, col, win, seed) => { const r = rnd(seed); let out = '', x = 0; while (x < 1600) { const w = 50 + Math.round(r() * 90), ht = hmin + Math.round(r() * (hmax - hmin)); out += "<rect x='" + x + "' y='" + (base - ht) + "' width='" + (w - 4) + "' height='" + (ht + 400) + "' fill='" + col + "'/>"; if (win) for (let wy = base - ht + 14; wy < base - 10; wy += 22) for (let wx = x + 8; wx < x + w - 14; wx += 16) if (r() > .62) out += "<rect x='" + wx + "' y='" + wy + "' width='7' height='10' fill='" + (r() > .3 ? '#ffd88a' : '#9fd0ff') + "' opacity='" + (r() * .5 + .45).toFixed(2) + "'/>"; x += w; } return out; };
  // dir: 追加した htmlOS のバージョン（/usr/share/backgrounds/<dir>/<file>.svg に置く）
  const WALLPAPERS = [
    { name: 'ブルーム', dir: '2.0', file: 'bloom', css: svgWall(
      "<defs><radialGradient id='g' cx='.63' cy='.58' r='.85'><stop offset='0' stop-color='#2a6ae0'/><stop offset='.5' stop-color='#0f3184'/><stop offset='1' stop-color='#060f2a'/></radialGradient>" +
      "<linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#d4ecff'/><stop offset='.4' stop-color='#5aa6ff'/><stop offset='1' stop-color='#1746d1' stop-opacity='.15'/></linearGradient>" +
      "<linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9fd8ff'/><stop offset='1' stop-color='#2a5cff' stop-opacity='.1'/></linearGradient>" +
      "<filter id='s' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='30'/></filter><path id='l' d='" + LEAF + "'/></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><g transform='translate(1010 560)'>" +
      "<g filter='url(#s)' opacity='.8'>" + [-150, -105, -60, -15, 30, 75, 120].map((d, i) => "<use href='#l' fill='url(#" + (i % 2 ? 'b' : 'a') + ")' transform='rotate(" + d + ")'/>").join('') + '</g>' +
      "<g opacity='.6'>" + [-128, -83, -38, 7, 52, 97].map((d, i) => "<use href='#l' fill='url(#" + (i % 2 ? 'a' : 'b') + ")' transform='rotate(" + d + ") scale(.82)'/>").join('') + '</g>' +
      "<circle r='70' fill='#cfe8ff' opacity='.35' filter='url(#s)'/></g>", '#0f3184') },
    { name: '波', dir: '2.0', file: 'wave', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#03161f'/><stop offset='1' stop-color='#0b4f5c'/></linearGradient>" +
      "<linearGradient id='w2' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#1a9aa3'/><stop offset='1' stop-color='#0e5f86'/></linearGradient>" +
      "<linearGradient id='w3' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#3cc7b9'/><stop offset='1' stop-color='#137a9a'/></linearGradient>" +
      "<linearGradient id='w4' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#93ead8'/><stop offset='1' stop-color='#1aa3a3'/></linearGradient>" +
      "<radialGradient id='m' cx='.78' cy='.18' r='.35'><stop offset='0' stop-color='#bff6ff' stop-opacity='.35'/><stop offset='1' stop-color='#bff6ff' stop-opacity='0'/></radialGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><rect width='1600' height='1000' fill='url(#m)'/>" + stars(40, 380, 7) +
      "<path d='M0 520C260 440 520 600 800 540S1340 440 1600 520V1000H0Z' fill='#11707e' opacity='.5'/>" +
      "<path d='M0 620C300 540 560 720 860 640S1360 560 1600 640V1000H0Z' fill='url(#w2)' opacity='.75'/>" +
      "<path d='M0 740C280 680 600 820 900 760S1380 690 1600 760V1000H0Z' fill='url(#w3)' opacity='.9'/>" +
      "<path d='M0 860C320 800 620 930 960 870S1400 820 1600 880V1000H0Z' fill='url(#w4)'/>" +
      "<g fill='none' stroke='#fff' stroke-width='2' opacity='.18'><path d='M0 620C300 540 560 720 860 640S1360 560 1600 640'/><path d='M0 740C280 680 600 820 900 760S1380 690 1600 760'/><path d='M0 860C320 800 620 930 960 870S1400 820 1600 880'/></g>", '#0b4f5c') },
    { name: '夕焼けの山', dir: '2.0', file: 'sunset-mountains', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1d1238'/><stop offset='.42' stop-color='#64306a'/><stop offset='.68' stop-color='#cf5f78'/><stop offset='.84' stop-color='#f4a46a'/><stop offset='1' stop-color='#fbd590'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(60, 360, 3) +
      "<circle cx='1060' cy='620' r='250' fill='#ffb47a' opacity='.35' filter='url(#s)'/><circle cx='1060' cy='620' r='110' fill='#ffe0aa'/>" +
      "<path d='M0 640L180 560L320 610L520 500L700 590L860 530L1040 600L1220 520L1400 580L1600 540V1000H0Z' fill='#b4527c' opacity='.6'/>" +
      "<path d='M0 720L160 650L300 700L480 610L640 690L820 640L980 710L1160 630L1340 700L1600 650V1000H0Z' fill='#7b305f'/>" +
      "<path d='M0 800L220 730L420 790L600 720L780 800L980 750L1180 820L1380 760L1600 810V1000H0Z' fill='#47204e'/>" +
      "<path d='M0 900C300 840 520 900 800 870S1300 840 1600 890V1000H0Z' fill='#1f1030'/>", '#64306a') },
    { name: 'オーロラ', dir: '2.0', file: 'aurora', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#03060f'/><stop offset='.6' stop-color='#081a2c'/><stop offset='1' stop-color='#0d2836'/></linearGradient>" +
      "<filter id='s' x='-20%' y='-80%' width='140%' height='260%'><feGaussianBlur stdDeviation='32'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(110, 700, 11) +
      "<g fill='none' stroke-linecap='round' filter='url(#s)'><path d='M-100 430C300 250 600 520 900 330S1500 260 1750 380' stroke='#35f0b0' stroke-width='110' opacity='.55'/>" +
      "<path d='M-100 540C350 400 650 620 1000 450S1500 400 1750 500' stroke='#2fb6e8' stroke-width='80' opacity='.42'/>" +
      "<path d='M200 300C500 180 800 380 1100 260S1500 220 1700 300' stroke='#9a6cff' stroke-width='70' opacity='.38'/></g>" +
      "<g fill='none' stroke='#b8ffe4' stroke-width='3' opacity='.25'><path d='M-100 430C300 250 600 520 900 330S1500 260 1750 380'/></g>" +
      "<path d='M0 860C300 800 500 880 800 840S1300 790 1600 850V1000H0Z' fill='#050a12'/>" +
      "<path d='M0 930C260 900 560 940 900 915S1400 900 1600 930V1000H0Z' fill='#02050a'/>", '#081a2c') },
    { name: '砂丘', dir: '2.0', file: 'dunes', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fbe4ba'/><stop offset='1' stop-color='#f2b77a'/></linearGradient>" +
      "<linearGradient id='d1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#e9a867'/><stop offset='1' stop-color='#c97a43'/></linearGradient>" +
      "<linearGradient id='d2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d98b4f'/><stop offset='1' stop-color='#a85a2b'/></linearGradient>" +
      "<linearGradient id='d3' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c06a38'/><stop offset='1' stop-color='#7d3e1d'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='30'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='420' cy='300' r='160' fill='#fff6dc' opacity='.6' filter='url(#s)'/><circle cx='420' cy='300' r='66' fill='#fffaf0'/>" +
      "<path d='M0 620C300 520 620 700 900 600S1400 520 1600 600V1000H0Z' fill='url(#d1)'/>" +
      "<path d='M0 720C380 640 700 820 1050 700S1450 660 1600 720V1000H0Z' fill='url(#d2)'/>" +
      "<path d='M0 860C420 760 780 920 1100 840S1460 800 1600 860V1000H0Z' fill='url(#d3)'/>" +
      "<g fill='none' stroke='#ffe3b8' stroke-width='3' opacity='.4'><path d='M0 620C300 520 620 700 900 600S1400 520 1600 600'/><path d='M0 720C380 640 700 820 1050 700S1450 660 1600 720'/><path d='M0 860C420 760 780 920 1100 840S1460 800 1600 860'/></g>", '#e09a5a') },
    { name: 'グラファイト', dir: '2.0', file: 'graphite', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0e0f12'/><stop offset='1' stop-color='#1d2026'/></linearGradient>" +
      "<radialGradient id='a' cx='.76' cy='.24' r='.5'><stop offset='0' stop-color='#46506a' stop-opacity='.55'/><stop offset='1' stop-color='#46506a' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='b' cx='.2' cy='.86' r='.45'><stop offset='0' stop-color='#3a3346' stop-opacity='.5'/><stop offset='1' stop-color='#3a3346' stop-opacity='0'/></radialGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><rect width='1600' height='1000' fill='url(#a)'/><rect width='1600' height='1000' fill='url(#b)'/>" +
      "<g transform='translate(860 220) scale(30)' fill='none' stroke='#fff' stroke-width='.16' stroke-linecap='round' stroke-linejoin='round' opacity='.07'><path d='M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'/></g>", '#16181c') },
    // ---- 4.0 Vega で追加した壁紙
    { name: 'ベガ（こと座）', dir: '4.0-Vega', file: 'vega', css: svgWall(
      "<defs><radialGradient id='g' cx='.68' cy='.3' r='.95'><stop offset='0' stop-color='#1b2a6b'/><stop offset='.45' stop-color='#0d1340'/><stop offset='1' stop-color='#03040f'/></radialGradient>" +
      "<radialGradient id='mw' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#9fb4ff' stop-opacity='.28'/><stop offset='1' stop-color='#9fb4ff' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='v' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff'/><stop offset='.12' stop-color='#e4efff'/><stop offset='.35' stop-color='#8fb6ff' stop-opacity='.55'/><stop offset='1' stop-color='#5b7dff' stop-opacity='0'/></radialGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='26'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<ellipse cx='520' cy='560' rx='900' ry='170' transform='rotate(-28 520 560)' fill='url(#mw)' filter='url(#s)'/>" + stars(260, 1000, 17) +
      "<g stroke='#cfe0ff' stroke-width='1.6' opacity='.45' fill='none'><path d='M1110 270L1185 205M1110 270L1160 380L1245 545L1090 620L1015 510L1160 380'/></g>" +
      "<g fill='#e8f0ff'><circle cx='1185' cy='205' r='3.2'/><circle cx='1160' cy='380' r='3.6'/><circle cx='1245' cy='545' r='3.4'/><circle cx='1090' cy='620' r='3.8'/><circle cx='1015' cy='510' r='3.6'/></g>" +
      "<circle cx='1110' cy='270' r='120' fill='url(#v)'/><g stroke='#fff' stroke-linecap='round' opacity='.85'><path d='M1110 215V325M1055 270H1165' stroke-width='2'/></g><circle cx='1110' cy='270' r='7' fill='#fff'/>" +
      "<path d='M0 900C320 860 600 910 900 885S1350 850 1600 890V1000H0Z' fill='#02030a'/>", '#0d1340') },
    { name: '金星', dir: '4.0-Vega', file: 'venus', css: svgWall(
      "<defs><radialGradient id='g' cx='.3' cy='.4' r='.9'><stop offset='0' stop-color='#3a1d0e'/><stop offset='.5' stop-color='#160a07'/><stop offset='1' stop-color='#050303'/></radialGradient>" +
      "<radialGradient id='p' cx='.38' cy='.36' r='.7'><stop offset='0' stop-color='#fff1c9'/><stop offset='.35' stop-color='#f3c27a'/><stop offset='.7' stop-color='#c5793a'/><stop offset='1' stop-color='#5b2a10'/></radialGradient>" +
      "<radialGradient id='a' cx='.5' cy='.5' r='.5'><stop offset='.82' stop-color='#ffd28a' stop-opacity='0'/><stop offset='.9' stop-color='#ffd28a' stop-opacity='.45'/><stop offset='1' stop-color='#ffb35a' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='sh' x1='0' y1='0' x2='1' y2='.4'><stop offset='.35' stop-color='#000' stop-opacity='0'/><stop offset='.75' stop-color='#000' stop-opacity='.85'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter><clipPath id='c'><circle cx='1000' cy='520' r='330'/></clipPath></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(90, 1000, 29) +
      "<circle cx='1000' cy='520' r='380' fill='#ff9d45' opacity='.25' filter='url(#s)'/><circle cx='1000' cy='520' r='330' fill='url(#p)'/>" +
      "<g clip-path='url(#c)' fill='none' stroke='#fff3d6' stroke-linecap='round' opacity='.22'><path d='M640 420C820 380 980 470 1360 400' stroke-width='26'/><path d='M640 520C860 470 1040 580 1360 500' stroke-width='18'/><path d='M640 640C840 600 1060 690 1360 610' stroke-width='30'/></g>" +
      "<circle cx='1000' cy='520' r='330' fill='url(#sh)'/><circle cx='1000' cy='520' r='365' fill='url(#a)'/>", '#160a07') },
    { name: '桜', dir: '4.0-Vega', file: 'sakura', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff4f7'/><stop offset='.55' stop-color='#fbd3e0'/><stop offset='1' stop-color='#f19bb8'/></linearGradient>" +
      "<path id='pt' d='M0-22C9-22 14-12 9 0L0 18L-9 0C-14-12-9-22 0-22Z'/>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='5'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<path d='M1600 120C1420 160 1300 240 1180 300S960 380 860 470M1300 238C1340 320 1330 380 1300 440M1060 350C1020 300 960 280 900 290' stroke='#6b3a3f' stroke-width='14' fill='none' stroke-linecap='round' opacity='.75'/>" +
      scatter(70, 31, (x, y, r, a, o) => "<use href='#pt' fill='" + (r > .5 ? '#ffffff' : '#ffc4d6') + "' opacity='" + (o * .8 + .2).toFixed(2) + "' transform='translate(" + x + ' ' + y + ') rotate(' + Math.round(a * 360) + ') scale(' + (r * .9 + .4).toFixed(2) + ")'" + (r < .25 ? " filter='url(#s)'" : '') + '/>'), '#fbd3e0') },
    { name: '森', dir: '4.0-Vega', file: 'forest', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d9eedb'/><stop offset='.5' stop-color='#9bc9a2'/><stop offset='1' stop-color='#2f5f3c'/></linearGradient>" +
      "<linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#fff' stop-opacity='.55'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='1220' cy='230' r='90' fill='#fffbe6' opacity='.8'/>" +
      [['#7fb08a', 560, 70, 41], ['#5b9268', 650, 85, 43], ['#3d7550', 750, 100, 47], ['#24563a', 860, 120, 53]].map(L => "<path d='" + trees(L[1], L[2], L[3]) + "' fill='" + L[0] + "'/>").join('') +
      "<rect y='500' width='1600' height='500' fill='url(#m)' opacity='.6'/>", '#9bc9a2') },
    { name: 'プリズム', dir: '4.0-Vega', file: 'prism', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#18123a'/><stop offset='1' stop-color='#2b0f3d'/></linearGradient>" +
      "<linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#47e3ff'/><stop offset='1' stop-color='#4b6bff'/></linearGradient>" +
      "<linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ff5fa2'/><stop offset='1' stop-color='#8a3dff'/></linearGradient>" +
      "<linearGradient id='c' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#ffb84d'/><stop offset='1' stop-color='#ff4f7b'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='50'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<g filter='url(#s)' opacity='.7'><circle cx='420' cy='300' r='260' fill='#4b6bff'/><circle cx='1200' cy='700' r='300' fill='#ff4f9a'/><circle cx='1000' cy='240' r='200' fill='#8a3dff'/></g>" +
      "<g style='mix-blend-mode:screen'><path d='M560 760L860 180L1160 760Z' fill='url(#a)' opacity='.55'/><path d='M700 820L1000 260L1300 820Z' fill='url(#b)' opacity='.5'/><path d='M420 700L720 260L960 820Z' fill='url(#c)' opacity='.4'/></g>" +
      "<g fill='none' stroke='#fff' stroke-width='1.5' opacity='.35'><path d='M560 760L860 180L1160 760Z'/><path d='M700 820L1000 260L1300 820Z'/></g>", '#18123a') },
    { name: '朝の湖', dir: '4.0-Vega', file: 'morning-lake', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#bcd9f2'/><stop offset='.5' stop-color='#f5dcc8'/><stop offset='.5' stop-color='#d3c4c9'/><stop offset='1' stop-color='#7d97b5'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='30'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='800' cy='470' r='150' fill='#fff1df' opacity='.8' filter='url(#s)'/><circle cx='800' cy='470' r='54' fill='#fff8ee'/>" +
      "<path d='M0 500L180 400L330 450L520 330L720 460L900 380L1080 450L1260 360L1440 430L1600 390V500Z' fill='#8ea3c0'/>" +
      "<path d='M0 500L240 440L420 480L640 420L860 490L1100 430L1320 480L1600 440V500Z' fill='#6d84a6'/>" +
      "<g opacity='.35' transform='translate(0 1000) scale(1 -1)'><path d='M0 500L180 400L330 450L520 330L720 460L900 380L1080 450L1260 360L1440 430L1600 390V500Z' fill='#8ea3c0'/></g>" +
      "<g stroke='#fff' stroke-linecap='round' opacity='.5'><path d='M700 540H900M730 575H870M760 610H840M650 660H950' stroke-width='3'/></g>", '#d3c4c9') },
    // ---- htmlOS 6（Deneb）で追加
    { name: 'デネブ（はくちょう座）', dir: '6.0-Deneb', file: 'deneb', css: svgWall(
      "<defs><radialGradient id='g' cx='.4' cy='.25' r='1'><stop offset='0' stop-color='#22285e'/><stop offset='.5' stop-color='#0e1236'/><stop offset='1' stop-color='#04050f'/></radialGradient>" +
      "<radialGradient id='mw' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#c9b8ff' stop-opacity='.32'/><stop offset='.6' stop-color='#8fa8ff' stop-opacity='.12'/><stop offset='1' stop-color='#8fa8ff' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='d' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff'/><stop offset='.12' stop-color='#f3f6ff'/><stop offset='.35' stop-color='#b9c9ff' stop-opacity='.55'/><stop offset='1' stop-color='#7d8dff' stop-opacity='0'/></radialGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='34'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<ellipse cx='820' cy='520' rx='980' ry='200' transform='rotate(62 820 520)' fill='url(#mw)' filter='url(#s)'/>" + stars(300, 1000, 61) +
      "<g stroke='#d8e2ff' stroke-width='1.7' opacity='.5' fill='none' stroke-linecap='round'><path d='M760 210L820 470L880 800M560 560L700 515L820 470L955 420L1090 390'/></g>" +
      "<g fill='#eef2ff'><circle cx='820' cy='470' r='4.2'/><circle cx='880' cy='800' r='3.6'/><circle cx='560' cy='560' r='3.4'/><circle cx='700' cy='515' r='3'/><circle cx='955' cy='420' r='3.2'/><circle cx='1090' cy='390' r='3.6'/></g>" +
      "<circle cx='760' cy='210' r='130' fill='url(#d)'/><g stroke='#fff' stroke-linecap='round' opacity='.85'><path d='M760 150V270M700 210H820' stroke-width='2'/></g><circle cx='760' cy='210' r='7' fill='#fff'/>" +
      "<path d='M0 910C300 870 640 930 960 895S1380 860 1600 900V1000H0Z' fill='#02030a'/>", '#0e1236') },
    // ローポリ風のラグドール（6.0.2。p/gen_ragdoll.py で作った三角形の面）
    { name: 'ラグドール（ローポリ）', dir: '6.0-Deneb', file: 'ragdoll', css: svgWall("<path fill='#7d8ca0' stroke='#7d8ca0' stroke-width='.6' d='M0 151L0 200L95 206ZM0 151L0 0L100 67ZM95 206L0 151L112 91ZM100 67L0 151L112 91ZM112 91L100 67L137 102ZM112 91L95 206L137 102ZM210 14L186 93L231 118ZM269 117L210 14L231 118ZM95 206L137 102L203 151ZM186 93L231 118L203 151ZM95 206L198 223L207 248ZM315 204L282 232L353 227ZM207 248L282 232L340 291ZM353 227L282 232L340 291ZM269 117L210 14L400 0ZM569 29L400 0L544 53ZM544 53L569 29L583 123ZM544 53L398 143L518 151ZM544 53L583 123L518 151ZM403 293L527 223L548 265ZM569 29L400 0L600 0ZM583 123L569 29L600 0ZM604 231L548 265L611 278ZM662 160L604 231L704 183ZM800 0L704 183L845 147ZM838 19L800 0L845 147ZM800 0L869 27L1000 0ZM1000 0L1082 54L1200 0Z'/><path fill='#7d879b' stroke='#7d879b' stroke-width='.6' d='M95 206L0 200L45 279ZM45 279L162 364L207 248ZM353 227L398 277L340 291ZM583 123L518 151L566 199ZM398 277L398 143L527 223ZM518 151L398 143L527 223ZM566 199L548 265L604 231Z'/><path fill='#8291a0' stroke='#8291a0' stroke-width='.6' d='M45 279L0 200L0 400ZM403 293L369 361L404 347ZM403 293L404 347L418 367ZM558 373L548 265L611 278ZM611 278L558 373L624 353ZM675 301L624 353L628 399ZM558 373L624 353L628 399ZM1009 141L1086 89L1040 165Z'/><path fill='#8791a5' stroke='#8791a5' stroke-width='.6' d='M0 400L45 279L60 434ZM0 400L7 419L60 434ZM60 434L45 279L162 364ZM162 364L340 291L369 361ZM369 361L418 367L419 404ZM369 361L373 485L415 419ZM403 293L418 367L548 265ZM761 222L704 183L845 147ZM845 147L761 222L852 208ZM821 297L725 300L857 366ZM949 129L852 208L985 181ZM821 297L852 208L943 263ZM1271 140L1290 165L1326 161ZM1338 222L1421 126L1447 139Z'/><path fill='#919baa' stroke='#919baa' stroke-width='.6' d='M60 434L7 419L36 462ZM36 462L7 419L0 600ZM129 449L93 507L170 560ZM129 449L170 560L243 489ZM237 527L170 560L289 582ZM276 473L289 582L341 556ZM276 473L363 518L341 556ZM341 556L363 518L391 574ZM391 574L341 556L385 586ZM385 586L341 556L381 620ZM391 574L373 485L522 518ZM566 458L522 518L561 549ZM474 592L522 518L509 573ZM780 462L790 504L835 487ZM780 462L857 366L835 487ZM985 329L857 366L923 397ZM999 370L985 329L923 397ZM999 370L997 395L923 397ZM1029 242L943 263L1024 281ZM985 329L1024 281L1017 324ZM999 370L985 329L1009 351ZM985 329L1017 324L1009 351ZM1306 281L1338 222L1374 290ZM1324 346L1331 370L1401 314ZM1333 395L1362 446L1401 314ZM1528 365L1555 396L1600 400ZM1600 200L1528 365L1600 400Z'/><path fill='#8c96a5' stroke='#8c96a5' stroke-width='.6' d='M60 434L36 462L93 507ZM0 400L7 419L0 600ZM276 473L243 489L237 527ZM276 473L373 485L363 518ZM445 415L373 485L522 518ZM696 519L628 399L666 521ZM566 458L628 399L643 528ZM666 521L628 399L643 528ZM696 519L628 399L746 484ZM780 462L628 399L746 484ZM943 263L857 366L985 329Z'/><path fill='#96a0af' stroke='#96a0af' stroke-width='.6' d='M36 462L93 507L0 600ZM276 473L237 527L289 582ZM341 556L289 582L381 620ZM381 620L289 582L343 669ZM391 574L474 592L522 518ZM594 540L566 458L561 549ZM594 540L566 458L643 528ZM780 462L746 484L790 504ZM862 511L835 487L853 520ZM835 487L857 366L923 397ZM835 487L923 397L928 456ZM982 447L981 423L928 456ZM982 447L928 456L973 495ZM1374 290L1306 281L1313 324ZM1351 476L1362 446L1400 486ZM1401 314L1460 443L1528 365ZM1401 314L1532 151L1528 365ZM1460 443L1528 365L1530 447Z'/><path fill='#9ba5b4' stroke='#9ba5b4' stroke-width='.6' d='M0 600L93 507L63 668ZM391 574L474 592L442 619ZM746 484L790 504L750 513ZM746 484L696 519L719 526ZM750 513L746 484L719 526ZM997 395L923 397L981 423ZM862 511L835 487L928 456ZM923 397L981 423L928 456ZM953 514L928 456L913 523ZM1401 314L1362 446L1460 443ZM1460 443L1362 446L1426 461ZM1528 365L1555 396L1530 447ZM1530 447L1555 396L1600 400Z'/><path fill='#afb4be' stroke='#afb4be' stroke-width='.6' d='M97 701L63 668L94 768ZM198 843L143 849L175 866ZM135 861L143 849L175 866ZM94 768L97 701L203 794ZM227 768L97 701L203 794ZM1399 798L1348 757L1364 806ZM1364 806L1333 788L1313 816ZM1364 806L1399 798L1365 833ZM1313 816L1365 833L1311 848ZM1399 798L1357 724L1439 780ZM1399 798L1439 780L1448 807ZM1448 807L1495 857L1485 863ZM1448 807L1440 860L1485 863ZM1525 690L1568 657L1600 800Z'/><path fill='#a5aab4' stroke='#a5aab4' stroke-width='.6' d='M0 600L63 668L0 800ZM166 634L136 661L227 768ZM1357 656L1360 690L1381 696ZM1381 696L1360 690L1366 701ZM1377 606L1381 696L1525 690ZM1600 600L1568 657L1600 800Z'/><path fill='#aab4b9' stroke='#aab4b9' stroke-width='.6' d='M94 768L63 668L0 800Z'/><path fill='#b4b9c3' stroke='#b4b9c3' stroke-width='.6' d='M94 768L0 800L45 854ZM198 843L175 866L216 863ZM1456 782L1439 780L1448 807ZM1471 752L1495 857L1530 865Z'/><path fill='#b9bec3' stroke='#b9bec3' stroke-width='.6' d='M0 800L0 850L45 854ZM94 768L87 861L143 849ZM87 861L143 849L135 861ZM1399 798L1365 833L1395 856Z'/><path fill='#b4b9be' stroke='#b4b9be' stroke-width='.6' d='M94 768L45 854L87 861ZM94 768L193 819L143 849ZM1364 806L1313 816L1365 833ZM1311 848L1365 833L1344 862ZM1456 782L1448 807L1495 857ZM1575 867L1530 865L1600 800Z'/><path fill='#696e78' stroke='#696e78' stroke-width='.6' d='M87 861L45 854L81 872ZM81 872L41 874L29 893ZM87 861L135 861L116 879ZM175 866L135 861L168 882ZM556 847L585 856L574 884ZM556 847L537 862L574 884ZM643 872L663 857L648 896ZM1495 857L1530 865L1507 882Z'/><path fill='#646e78' stroke='#646e78' stroke-width='.6' d='M45 854L0 850L41 874ZM87 861L81 872L116 879ZM499 889L537 862L506 866ZM643 872L626 871L648 896ZM1344 862L1330 879L1340 900ZM1485 863L1440 860L1507 882ZM1575 867L1530 865L1507 882Z'/><path fill='#646978' stroke='#646978' stroke-width='.6' d='M45 854L81 872L41 874ZM175 866L168 882L195 911ZM195 911L175 866L216 863ZM247 878L270 867L258 909ZM495 863L451 881L499 889ZM696 881L663 857L648 896Z'/><path fill='#646973' stroke='#646973' stroke-width='.6' d='M0 850L41 874L29 893ZM116 879L81 872L117 947ZM339 892L313 891L303 916ZM499 889L495 863L506 866ZM574 884L585 856L626 871ZM696 881L648 896L673 918ZM1172 889L1159 890L1172 911ZM1159 890L1135 905L1172 911ZM1311 864L1344 862L1330 879ZM1344 862L1395 856L1340 900ZM1395 856L1340 900L1371 923ZM1395 856L1371 923L1440 860ZM1575 867L1600 800L1600 1000Z'/><path fill='#5f6973' stroke='#5f6973' stroke-width='.6' d='M81 872L29 893L37 951ZM270 867L289 888L258 909ZM195 911L216 863L210 910ZM247 878L216 863L210 910ZM247 878L258 909L210 910ZM258 909L289 888L303 916ZM394 890L377 940L451 881ZM499 889L537 862L574 884ZM879 883L886 910L917 885Z'/><path fill='#5a5f69' stroke='#5a5f69' stroke-width='.6' d='M37 951L81 872L63 965ZM247 955L258 909L285 966ZM285 966L258 909L303 916ZM377 940L451 881L400 1000ZM673 918L676 986L724 925ZM724 925L750 887L792 974ZM750 887L792 974L806 890ZM837 918L886 910L843 934ZM1135 905L1172 911L1173 928ZM1123 920L1135 905L1131 942ZM1313 940L1330 921L1344 945Z'/><path fill='#5f646e' stroke='#5f646e' stroke-width='.6' d='M0 850L29 893L0 1000ZM116 879L168 882L117 947ZM195 911L168 882L117 947ZM548 973L574 884L629 921ZM626 871L648 896L629 921ZM673 918L648 896L629 921ZM696 881L673 918L724 925ZM726 894L696 881L724 925ZM726 894L750 887L724 925ZM879 883L862 889L886 910ZM825 894L806 890L837 918ZM886 910L917 885L933 904ZM967 894L971 877L933 904ZM967 894L933 904L967 916ZM933 904L886 910L923 936ZM1125 884L1159 890L1135 905ZM1330 921L1340 900L1371 923ZM1440 860L1499 988L1507 882Z'/><path fill='#555a69' stroke='#555a69' stroke-width='.6' d='M37 951L29 893L0 1000ZM377 940L303 916L351 992ZM843 934L870 951L845 979ZM870 951L886 910L913 952ZM1004 948L1020 948L1015 968ZM1225 943L1265 946L1254 984ZM1131 942L1173 928L1200 1000ZM1225 943L1191 931L1200 1000Z'/><path fill='#505a64' stroke='#505a64' stroke-width='.6' d='M63 965L37 951L0 1000ZM134 977L107 978L116 990ZM351 992L377 940L400 1000ZM499 889L400 1000L548 973ZM724 925L676 986L765 991ZM843 934L792 974L845 979ZM885 988L870 951L913 952ZM1020 948L1060 951L1015 968ZM1015 968L1060 951L1035 993ZM986 936L1004 948L1000 1000ZM1004 948L1015 968L1000 1000ZM1098 943L1060 951L1100 997ZM1265 946L1254 984L1298 985ZM1131 942L1119 980L1200 1000ZM1298 985L1265 946L1313 940ZM1298 985L1313 940L1344 945ZM1371 923L1344 945L1358 993Z'/><path fill='#78879b' stroke='#78879b' stroke-width='.6' d='M186 93L100 67L137 102ZM100 67L0 0L200 0ZM186 93L100 67L200 0ZM95 206L198 223L203 151ZM186 93L137 102L203 151ZM269 117L231 118L203 151ZM269 117L203 151L282 232ZM269 117L398 143L334 162ZM269 117L282 232L315 204ZM269 117L334 162L315 204ZM583 123L600 0L662 160Z'/><path fill='#919baf' stroke='#919baf' stroke-width='.6' d='M60 434L93 507L129 449ZM1034 204L985 181L1030 226ZM1097 204L1090 214L1115 238ZM1326 161L1296 204L1322 211ZM1296 204L1322 211L1301 242ZM1313 324L1374 290L1324 346ZM1374 290L1338 222L1447 139ZM1324 346L1374 290L1401 314Z'/><path fill='#8c96aa' stroke='#8c96aa' stroke-width='.6' d='M60 434L162 364L129 449ZM162 364L276 473L369 361ZM445 415L491 399L479 420ZM491 399L479 420L566 458ZM558 373L491 399L566 458ZM725 300L628 399L780 462ZM852 208L985 181L943 263ZM1086 89L1065 189L1097 204ZM1036 184L985 181L1034 204ZM943 263L1030 226L1029 242ZM1160 170L1196 241L1222 234ZM1447 139L1421 126L1562 47Z'/><path fill='#a0a5b4' stroke='#a0a5b4' stroke-width='.6' d='M63 668L93 507L136 661ZM381 620L398 640L343 669ZM1356 493L1351 476L1400 486Z'/><path fill='#9ba5af' stroke='#9ba5af' stroke-width='.6' d='M170 560L93 507L136 661ZM166 634L170 560L289 582ZM414 662L398 640L401 690ZM973 495L928 456L953 514ZM862 511L928 456L913 523ZM1377 514L1385 524L1400 486ZM1400 486L1391 537L1441 550ZM1460 443L1441 550L1530 447ZM1530 447L1441 550L1600 600Z'/><path fill='#a0a5af' stroke='#a0a5af' stroke-width='.6' d='M97 701L63 668L136 661ZM343 669L361 706L308 723Z'/><path fill='#96a0aa' stroke='#96a0aa' stroke-width='.6' d='M166 634L170 560L136 661ZM385 586L381 620L442 619ZM385 586L391 574L442 619ZM381 620L442 619L423 638Z'/><path fill='#afb4b9' stroke='#afb4b9' stroke-width='.6' d='M198 843L193 819L143 849ZM1357 724L1348 757L1399 798ZM1399 798L1395 856L1448 807ZM1448 807L1395 856L1440 860Z'/><path fill='#696e7d' stroke='#696e7d' stroke-width='.6' d='M116 879L135 861L168 882Z'/><path fill='#555f69' stroke='#555f69' stroke-width='.6' d='M63 965L81 872L117 947ZM195 911L188 965L210 910ZM188 965L210 910L247 955ZM837 918L792 974L843 934ZM843 934L886 910L870 951ZM1098 943L1123 920L1131 942ZM1440 860L1499 988L1413 995ZM1584 973L1575 867L1600 1000Z'/><path fill='#555a64' stroke='#555a64' stroke-width='.6' d='M195 911L117 947L188 965ZM642 947L673 918L676 986ZM548 973L629 921L600 1000ZM642 947L629 921L600 1000ZM724 925L792 974L765 991ZM986 936L913 952L1000 1000ZM1098 943L1131 942L1119 980ZM1173 928L1191 931L1200 1000ZM1507 882L1499 988L1584 973Z'/><path fill='#505564' stroke='#505564' stroke-width='.6' d='M188 965L117 947L134 977ZM134 977L117 947L107 978ZM239 987L285 966L351 992ZM285 966L303 916L351 992Z'/><path fill='#50555f' stroke='#50555f' stroke-width='.6' d='M63 965L117 947L107 978ZM247 955L188 965L239 987ZM247 955L285 966L239 987ZM188 965L134 977L200 1000ZM548 973L400 1000L600 1000ZM642 947L676 986L600 1000ZM845 979L870 951L885 988ZM885 988L845 979L800 1000ZM885 988L913 952L1000 1000ZM1098 943L1119 980L1100 997ZM1298 985L1344 945L1358 993ZM1371 923L1358 993L1400 1000ZM1413 995L1371 923L1400 1000Z'/><path fill='#4b555f' stroke='#4b555f' stroke-width='.6' d='M63 965L0 1000L103 998ZM63 965L107 978L103 998ZM116 990L107 978L103 998ZM103 998L116 990L200 1000ZM676 986L600 1000L800 1000ZM765 991L792 974L800 1000ZM885 988L800 1000L1000 1000ZM1035 993L1015 968L1000 1000ZM1035 993L1060 951L1100 997ZM1225 943L1254 984L1200 1000ZM1100 997L1119 980L1200 1000ZM1298 985L1261 995L1358 993ZM1413 995L1499 988L1400 1000Z'/><path fill='#78829b' stroke='#78829b' stroke-width='.6' d='M186 93L200 0L210 14Z'/><path fill='#828ca0' stroke='#828ca0' stroke-width='.6' d='M203 151L198 223L282 232ZM162 364L207 248L340 291ZM369 361L340 291L403 293ZM369 361L404 347L418 367ZM491 399L418 367L445 415ZM418 367L419 404L445 415ZM403 293L398 277L527 223ZM518 151L566 199L527 223ZM491 399L418 367L548 265ZM583 123L566 199L662 160ZM611 278L604 231L675 301ZM761 222L704 183L725 300ZM725 300L761 222L821 297ZM876 63L845 147L937 99ZM1562 47L1568 118L1600 0Z'/><path fill='#7d8c9b' stroke='#7d8c9b' stroke-width='.6' d='M45 279L95 206L207 248ZM353 227L398 143L398 277ZM340 291L398 277L403 293ZM527 223L566 199L548 265Z'/><path fill='#8291a5' stroke='#8291a5' stroke-width='.6' d='M282 232L198 223L207 248ZM662 160L566 199L604 231ZM611 278L675 301L624 353ZM604 231L675 301L704 183ZM662 160L704 183L800 0ZM838 19L869 27L876 63ZM838 19L876 63L845 147ZM876 63L869 27L937 99ZM937 99L845 147L949 129ZM937 99L869 27L1000 0ZM1000 0L937 99L1041 72ZM1000 0L1082 54L1041 72ZM937 99L1041 72L1009 141ZM1082 54L1086 89L1155 95ZM1155 95L1160 170L1271 140ZM1271 140L1160 170L1265 189ZM1271 140L1200 0L1400 0ZM1271 140L1326 161L1400 0ZM1562 47L1447 139L1532 151ZM1562 47L1400 0L1600 0Z'/><path fill='#8791a0' stroke='#8791a0' stroke-width='.6' d='M162 364L129 449L243 489ZM675 301L628 399L725 300Z'/><path fill='#8796a5' stroke='#8796a5' stroke-width='.6' d='M162 364L276 473L243 489ZM369 361L419 404L415 419ZM445 415L419 404L415 419ZM445 415L373 485L415 419ZM491 399L548 265L558 373ZM566 458L479 420L522 518ZM725 300L780 462L857 366ZM999 165L983 149L985 181ZM821 297L857 366L943 263ZM937 99L949 129L1009 141ZM1069 200L1065 189L1097 204ZM943 263L985 181L1030 226ZM1160 170L1148 202L1196 241ZM1148 202L1196 241L1179 246ZM1148 202L1115 238L1151 246ZM1271 140L1290 165L1273 176ZM1271 140L1273 176L1265 189ZM1326 161L1338 222L1421 126Z'/><path fill='#91a0af' stroke='#91a0af' stroke-width='.6' d='M243 489L170 560L237 527ZM985 329L943 263L1024 281ZM1179 246L1148 202L1151 246ZM1338 222L1322 211L1301 242Z'/><path fill='#aab4be' stroke='#aab4be' stroke-width='.6' d='M97 701L136 661L227 768ZM166 634L257 751L308 723ZM1357 656L1377 606L1381 696ZM1568 657L1553 650L1600 600Z'/><path fill='#a5afb9' stroke='#a5afb9' stroke-width='.6' d='M166 634L257 751L227 768ZM343 669L398 640L401 690ZM343 669L361 706L401 690ZM1377 606L1348 623L1357 656ZM1377 606L1391 583L1525 690ZM1568 657L1553 650L1525 690ZM1441 550L1553 650L1600 600Z'/><path fill='#f5ebe1' stroke='#f5ebe1' stroke-width='.6' d='M227 768L257 751L267 772ZM203 794L227 768L237 795Z'/><path fill='#aaafb9' stroke='#aaafb9' stroke-width='.6' d='M94 768L193 819L203 794ZM1366 701L1360 690L1357 724ZM1366 701L1381 696L1357 724ZM1348 757L1333 788L1364 806ZM1357 724L1381 696L1439 780ZM1471 752L1381 696L1439 780ZM1471 752L1439 780L1456 782ZM1456 782L1471 752L1495 857ZM1441 550L1553 650L1525 690ZM1471 752L1381 696L1525 690ZM1525 690L1471 752L1600 800ZM1471 752L1530 865L1600 800Z'/><path fill='#f0e6dc' stroke='#f0e6dc' stroke-width='.6' d='M285 781L267 772L237 795ZM227 768L267 772L237 795ZM203 794L193 819L221 830ZM203 794L237 795L221 830ZM237 795L234 827L221 830ZM216 863L243 859L247 878Z'/><path fill='#ebe1d2' stroke='#ebe1d2' stroke-width='.6' d='M198 843L193 819L221 830ZM303 757L341 755L322 793Z'/><path fill='#ebe1d7' stroke='#ebe1d7' stroke-width='.6' d='M285 781L237 795L259 833ZM237 795L234 827L259 833ZM198 843L221 830L216 863Z'/><path fill='#f0e6d7' stroke='#f0e6d7' stroke-width='.6' d='M285 781L297 832L259 833ZM308 723L343 732L318 740ZM361 706L343 732L367 755ZM318 740L341 755L303 757ZM303 757L285 781L322 793ZM341 755L367 755L353 799ZM322 793L341 755L353 799Z'/><path fill='#e6dcd2' stroke='#e6dcd2' stroke-width='.6' d='M259 833L297 832L287 854ZM679 827L675 849L663 857ZM679 827L724 815L720 845Z'/><path fill='#dcd2c8' stroke='#dcd2c8' stroke-width='.6' d='M221 830L234 827L243 859ZM259 833L234 827L243 859ZM259 833L287 854L270 867ZM507 782L494 816L532 801ZM544 799L568 829L519 836ZM779 791L752 815L778 836ZM752 815L724 815L720 845ZM697 864L720 845L729 857ZM765 841L720 845L729 857ZM779 791L778 836L806 795ZM863 814L855 836L828 838ZM778 836L777 872L800 868ZM778 836L810 838L800 868ZM815 862L810 838L800 868ZM855 836L896 866L900 834ZM863 814L881 792L900 834ZM953 803L922 803L952 840ZM900 834L896 866L930 856Z'/><path fill='#dcd7c8' stroke='#dcd7c8' stroke-width='.6' d='M243 859L221 830L216 863Z'/><path fill='#e1d7c8' stroke='#e1d7c8' stroke-width='.6' d='M243 859L259 833L270 867ZM324 832L297 832L325 866ZM474 808L478 754L507 782ZM507 782L517 761L532 801ZM517 761L544 799L532 801ZM558 765L590 790L602 758ZM669 757L662 770L681 800ZM681 800L669 757L723 769ZM702 729L669 757L723 769ZM702 729L729 740L723 769ZM761 733L792 748L740 770ZM740 770L723 769L734 790ZM681 800L679 827L724 815ZM813 773L779 791L806 795Z'/><path fill='#faebe1' stroke='#faebe1' stroke-width='.6' d='M243 859L270 867L247 878Z'/><path fill='#d7cdc3' stroke='#d7cdc3' stroke-width='.6' d='M287 854L270 867L289 888ZM494 816L474 808L507 782ZM544 799L590 790L568 829ZM592 822L630 795L634 822ZM679 827L675 849L697 864ZM697 864L663 857L696 881ZM765 841L777 872L750 887ZM828 838L810 838L815 862ZM839 849L828 838L815 862ZM839 849L855 836L843 878ZM815 862L839 849L843 878ZM976 802L959 772L953 803ZM977 825L994 794L990 832ZM922 803L900 834L930 856Z'/><path fill='#5a646e' stroke='#5a646e' stroke-width='.6' d='M210 910L258 909L247 955ZM303 916L339 892L377 940ZM499 889L451 881L400 1000ZM629 921L673 918L642 947ZM886 910L862 889L837 918ZM986 936L967 916L923 936ZM923 936L886 910L913 952ZM1173 928L1172 911L1191 931ZM1173 928L1135 905L1131 942ZM1371 923L1330 921L1344 945ZM1440 860L1371 923L1413 995Z'/><path fill='#46505a' stroke='#46505a' stroke-width='.6' d='M103 998L0 1000L200 1000ZM1100 997L1000 1000L1200 1000Z'/><path fill='#4b505a' stroke='#4b505a' stroke-width='.6' d='M239 987L188 965L200 1000ZM116 990L134 977L200 1000ZM239 987L200 1000L351 992ZM765 991L676 986L800 1000ZM845 979L792 974L800 1000ZM1000 1000L1035 993L1100 997ZM1298 985L1254 984L1261 995ZM1261 995L1254 984L1200 1000ZM1261 995L1200 1000L1400 1000ZM1400 1000L1499 988L1600 1000ZM1584 973L1499 988L1600 1000Z'/><path fill='#788796' stroke='#788796' stroke-width='.6' d='M334 162L398 143L353 227ZM315 204L334 162L353 227Z'/><path fill='#8c9baa' stroke='#8c9baa' stroke-width='.6' d='M276 473L369 361L373 485ZM373 485L363 518L391 574ZM445 415L479 420L522 518ZM558 373L566 458L628 399ZM999 165L983 149L1009 141ZM1097 204L1160 170L1148 202ZM1097 204L1148 202L1115 238ZM1151 246L1115 238L1119 250ZM1250 205L1160 170L1240 214ZM1160 170L1240 214L1222 234ZM1196 241L1222 234L1206 250ZM1338 222L1301 242L1306 281ZM1374 290L1447 139L1401 314ZM1532 151L1528 365L1600 200Z'/><path fill='#a5aab9' stroke='#a5aab9' stroke-width='.6' d='M166 634L289 582L308 723ZM1441 550L1391 583L1525 690Z'/><path fill='#a0aab4' stroke='#a0aab4' stroke-width='.6' d='M343 669L289 582L308 723ZM381 620L398 640L423 638ZM423 638L398 640L414 662ZM790 504L835 487L806 510ZM1391 583L1395 560L1441 550ZM1391 537L1395 560L1441 550Z'/><path fill='#f5e6d7' stroke='#f5e6d7' stroke-width='.6' d='M361 706L308 723L343 732Z'/><path fill='#faebdc' stroke='#faebdc' stroke-width='.6' d='M318 740L343 732L341 755ZM396 725L361 706L367 755Z'/><path fill='#f0e1d2' stroke='#f0e1d2' stroke-width='.6' d='M341 755L343 732L367 755ZM396 725L401 713L408 738ZM396 725L367 755L406 753ZM398 791L406 753L423 762Z'/><path fill='#f5ebdc' stroke='#f5ebdc' stroke-width='.6' d='M257 751L267 772L303 757ZM308 723L257 751L303 757Z'/><path fill='#faf0e1' stroke='#faf0e1' stroke-width='.6' d='M318 740L308 723L303 757ZM285 781L267 772L303 757Z'/><path fill='#e6dccd' stroke='#e6dccd' stroke-width='.6' d='M285 781L297 832L322 793ZM322 793L297 832L324 832ZM353 799L397 819L369 834ZM369 834L324 832L338 847ZM681 800L662 770L655 805ZM681 800L723 769L734 790ZM734 790L740 770L779 791ZM734 790L779 791L752 815ZM806 795L828 838L810 838Z'/><path fill='#ebdccd' stroke='#ebdccd' stroke-width='.6' d='M398 791L367 755L353 799ZM401 713L408 738L427 741ZM398 791L367 755L406 753ZM494 736L553 729L517 761Z'/><path fill='#e1d2c3' stroke='#e1d2c3' stroke-width='.6' d='M398 791L353 799L397 819ZM453 729L479 687L494 736ZM417 694L453 729L427 741ZM398 791L423 762L433 767ZM453 729L478 754L433 767ZM397 819L425 807L434 835ZM369 834L393 869L401 842ZM397 819L434 835L401 842ZM553 729L549 707L568 730ZM517 761L478 754L507 782ZM568 730L587 692L610 709ZM568 730L558 765L602 758ZM669 757L646 749L662 770ZM655 732L669 757L702 729ZM702 729L704 699L729 740ZM740 687L761 733L729 740ZM785 683L761 733L804 735ZM879 716L869 695L835 741ZM879 716L891 752L868 755ZM804 735L792 748L813 773ZM879 716L906 694L915 725ZM891 752L899 760L915 725ZM915 725L946 726L947 740Z'/><path fill='#e6d7cd' stroke='#e6d7cd' stroke-width='.6' d='M322 793L353 799L324 832ZM324 832L353 799L369 834ZM287 854L297 832L325 866ZM646 749L602 758L647 771ZM852 787L868 755L881 792ZM813 773L852 787L806 795ZM953 803L933 769L922 803Z'/><path fill='#d7cdbe' stroke='#d7cdbe' stroke-width='.6' d='M287 854L289 888L325 866ZM647 771L630 795L655 805Z'/><path fill='#e6d7c8' stroke='#e6d7c8' stroke-width='.6' d='M324 832L338 847L325 866ZM494 736L453 729L478 754ZM427 741L406 753L423 762ZM398 791L397 819L425 807ZM494 736L478 754L517 761ZM553 729L568 730L558 765ZM553 729L517 761L558 765ZM655 732L635 727L646 749ZM568 730L618 734L602 758ZM813 773L835 741L852 787ZM879 716L891 752L915 725ZM889 784L899 760L933 769ZM915 725L899 760L933 769Z'/><path fill='#d7c8be' stroke='#d7c8be' stroke-width='.6' d='M369 834L338 847L360 868ZM325 866L338 847L360 868Z'/><path fill='#dccdbe' stroke='#dccdbe' stroke-width='.6' d='M369 834L360 868L393 869ZM427 741L453 729L433 767ZM445 786L433 767L425 807ZM454 798L425 807L434 835ZM369 834L397 819L401 842ZM401 842L434 835L416 855ZM416 855L434 835L429 861ZM416 855L401 842L405 867ZM610 709L635 727L618 734ZM635 727L618 734L646 749ZM655 732L646 749L669 757ZM655 732L680 693L702 729ZM740 687L785 683L761 733ZM729 740L761 733L740 770ZM761 733L792 748L804 735ZM819 693L804 735L835 741ZM879 716L835 741L868 755ZM947 740L915 725L933 769Z'/><path fill='#c3b4aa' stroke='#c3b4aa' stroke-width='.6' d='M393 869L360 868L394 890ZM394 890L405 867L451 881Z'/><path fill='#cdc3b4' stroke='#cdc3b4' stroke-width='.6' d='M325 866L289 888L313 891ZM398 791L433 767L425 807Z'/><path fill='#c8beaf' stroke='#c8beaf' stroke-width='.6' d='M360 868L325 866L339 892ZM313 891L325 866L339 892ZM394 890L360 868L339 892Z'/><path fill='#5f6473' stroke='#5f6473' stroke-width='.6' d='M313 891L289 888L303 916ZM574 884L499 889L548 973ZM574 884L626 871L629 921ZM825 894L862 889L837 918ZM1575 867L1507 882L1584 973Z'/><path fill='#5a5f6e' stroke='#5a5f6e' stroke-width='.6' d='M394 890L339 892L377 940ZM806 890L792 974L837 918ZM933 904L967 916L923 936ZM986 936L923 936L913 952Z'/><path fill='#73829b' stroke='#73829b' stroke-width='.6' d='M210 14L200 0L400 0Z'/><path fill='#7887a0' stroke='#7887a0' stroke-width='.6' d='M269 117L398 143L400 0Z'/><path fill='#cdb9a0' stroke='#cdb9a0' stroke-width='.6' d='M498 591L474 592L471 617Z'/><path fill='#d2b9a5' stroke='#d2b9a5' stroke-width='.6' d='M471 617L474 592L442 619ZM549 555L587 602L529 606ZM498 591L529 606L527 633ZM685 553L662 595L699 595ZM699 595L724 585L700 639ZM762 584L724 585L761 641ZM784 552L822 556L803 603ZM866 565L889 590L850 605ZM935 560L894 566L922 594Z'/><path fill='#cdb9a5' stroke='#cdb9a5' stroke-width='.6' d='M471 617L442 619L465 670ZM498 591L471 617L527 633ZM529 606L527 633L565 635ZM587 602L586 631L604 605Z'/><path fill='#d2beaa' stroke='#d2beaa' stroke-width='.6' d='M471 617L495 662L465 670ZM423 638L442 619L465 670ZM587 602L586 631L565 635ZM604 605L586 631L632 637ZM662 595L604 605L632 637ZM573 674L586 631L611 654ZM632 637L611 654L617 669ZM683 666L683 639L700 639ZM778 621L761 641L810 658ZM850 605L816 617L842 659ZM943 623L906 638L931 649Z'/><path fill='#dcc8b4' stroke='#dcc8b4' stroke-width='.6' d='M414 662L423 638L465 670ZM573 674L611 654L617 669ZM683 666L700 639L720 670ZM700 639L761 641L720 670ZM761 641L774 670L810 658ZM873 637L850 605L842 659ZM810 658L816 617L842 659ZM906 638L893 651L931 649Z'/><path fill='#d7c3b4' stroke='#d7c3b4' stroke-width='.6' d='M414 662L465 670L447 686ZM479 687L495 662L527 689ZM573 674L587 692L617 669ZM660 662L683 666L680 693ZM617 669L587 692L610 709ZM720 670L759 664L740 687ZM842 659L810 658L819 693Z'/><path fill='#d7c8b4' stroke='#d7c8b4' stroke-width='.6' d='M465 670L495 662L479 687ZM414 662L447 686L417 694ZM573 674L537 671L573 696ZM495 863L495 831L519 836ZM683 666L680 693L704 699ZM720 670L740 687L704 699Z'/><path fill='#dcc8b9' stroke='#dcc8b9' stroke-width='.6' d='M447 686L465 670L479 687ZM537 671L495 662L527 689ZM573 674L587 692L573 696ZM537 671L527 689L535 701ZM573 696L537 671L549 707ZM660 662L680 693L649 703ZM649 703L617 669L610 709ZM759 664L761 641L720 670ZM785 683L774 670L740 687ZM720 670L683 666L704 699ZM785 683L774 670L810 658ZM810 658L785 683L819 693ZM842 659L893 651L869 695Z'/><path fill='#dccdb9' stroke='#dccdb9' stroke-width='.6' d='M414 662L401 690L417 694ZM474 808L454 798L434 835ZM494 736L527 689L535 701ZM617 669L660 662L649 703ZM649 703L610 709L635 727ZM610 709L568 730L618 734ZM704 699L680 693L702 729ZM869 695L893 651L906 694ZM879 716L869 695L906 694Z'/><path fill='#ebe1cd' stroke='#ebe1cd' stroke-width='.6' d='M396 725L361 706L401 713Z'/><path fill='#f5e6d2' stroke='#f5e6d2' stroke-width='.6' d='M361 706L401 690L401 713Z'/><path fill='#e6d2c3' stroke='#e6d2c3' stroke-width='.6' d='M417 694L401 690L401 713ZM417 694L447 686L453 729ZM494 736L535 701L553 729ZM535 701L549 707L553 729ZM573 696L549 707L568 730Z'/><path fill='#e1cdbe' stroke='#e1cdbe' stroke-width='.6' d='M447 686L479 687L453 729ZM819 693L842 659L869 695ZM819 693L869 695L835 741Z'/><path fill='#ebdcc8' stroke='#ebdcc8' stroke-width='.6' d='M417 694L401 713L427 741Z'/><path fill='#dcd2c3' stroke='#dcd2c3' stroke-width='.6' d='M396 725L408 738L406 753ZM517 761L558 765L544 799ZM532 801L494 816L509 827ZM646 749L618 734L602 758ZM681 800L655 805L679 827ZM740 770L792 748L779 791ZM779 791L792 748L813 773ZM804 735L835 741L813 773ZM891 752L868 755L889 784ZM889 784L868 755L881 792ZM947 740L933 769L959 772ZM959 772L933 769L953 803ZM881 792L889 784L922 803ZM889 784L933 769L922 803Z'/><path fill='#d2c3b4' stroke='#d2c3b4' stroke-width='.6' d='M427 741L408 738L406 753ZM495 831L471 851L495 863ZM471 851L434 835L450 865Z'/><path fill='#e1d2c8' stroke='#e1d2c8' stroke-width='.6' d='M427 741L423 762L433 767ZM478 754L454 798L474 808ZM558 765L590 790L544 799ZM590 790L602 758L630 795ZM647 771L602 758L630 795ZM729 740L723 769L740 770ZM891 752L899 760L889 784ZM835 741L868 755L852 787Z'/><path fill='#dccdc3' stroke='#dccdc3' stroke-width='.6' d='M478 754L433 767L445 786ZM646 749L662 770L647 771Z'/><path fill='#d2c3b9' stroke='#d2c3b9' stroke-width='.6' d='M445 786L478 754L454 798Z'/><path fill='#d2c8b9' stroke='#d2c8b9' stroke-width='.6' d='M445 786L454 798L425 807ZM429 861L434 835L450 865Z'/><path fill='#b4aa9b' stroke='#b4aa9b' stroke-width='.6' d='M494 816L474 808L495 831Z'/><path fill='#b9aaa0' stroke='#b9aaa0' stroke-width='.6' d='M474 808L495 831L471 851Z'/><path fill='#c8b9aa' stroke='#c8b9aa' stroke-width='.6' d='M474 808L434 835L471 851ZM495 863L471 851L451 881Z'/><path fill='#d7c8b9' stroke='#d7c8b9' stroke-width='.6' d='M401 842L393 869L405 867ZM416 855L429 861L405 867ZM535 701L537 671L549 707ZM649 703L680 693L655 732ZM740 687L704 699L729 740ZM819 693L785 683L804 735Z'/><path fill='#b9afa0' stroke='#b9afa0' stroke-width='.6' d='M394 890L393 869L405 867Z'/><path fill='#c3b9aa' stroke='#c3b9aa' stroke-width='.6' d='M429 861L450 865L451 881Z'/><path fill='#beb4a5' stroke='#beb4a5' stroke-width='.6' d='M450 865L471 851L451 881Z'/><path fill='#cdbeaf' stroke='#cdbeaf' stroke-width='.6' d='M429 861L405 867L451 881Z'/><path fill='#4b505f' stroke='#4b505f' stroke-width='.6' d='M351 992L200 1000L400 1000ZM1261 995L1358 993L1400 1000Z'/><path fill='#738296' stroke='#738296' stroke-width='.6' d='M400 0L398 143L544 53Z'/><path fill='#96a5af' stroke='#96a5af' stroke-width='.6' d='M561 549L522 518L549 555Z'/><path fill='#c8af96' stroke='#c8af96' stroke-width='.6' d='M594 540L561 549L591 566ZM685 553L643 528L634 563ZM685 553L696 519L701 541ZM737 550L776 521L784 552ZM862 511L853 520L883 541ZM853 520L818 524L822 556ZM803 532L818 524L822 556ZM784 552L803 532L822 556Z'/><path fill='#cdaf9b' stroke='#cdaf9b' stroke-width='.6' d='M549 555L561 549L591 566ZM894 566L883 541L913 523Z'/><path fill='#c8af9b' stroke='#c8af9b' stroke-width='.6' d='M498 591L474 592L509 573ZM549 555L591 566L587 602ZM498 591L509 573L529 606ZM634 563L591 566L604 605Z'/><path fill='#919ba5' stroke='#919ba5' stroke-width='.6' d='M549 555L522 518L509 573Z'/><path fill='#cdb49b' stroke='#cdb49b' stroke-width='.6' d='M549 555L509 573L529 606ZM685 553L634 563L662 595ZM750 513L776 521L737 550ZM685 553L699 595L705 567ZM685 553L701 541L705 567ZM737 550L701 541L705 567ZM784 552L737 550L762 584ZM853 520L883 541L866 565ZM853 520L822 556L866 565Z'/><path fill='#d7beaf' stroke='#d7beaf' stroke-width='.6' d='M471 617L495 662L527 633Z'/><path fill='#d2bea5' stroke='#d2bea5' stroke-width='.6' d='M529 606L587 602L565 635ZM803 603L822 556L850 605ZM889 590L850 605L873 637ZM953 606L922 594L943 623Z'/><path fill='#d2beaf' stroke='#d2beaf' stroke-width='.6' d='M527 633L495 662L537 671ZM565 635L537 671L573 674ZM660 662L632 637L617 669Z'/><path fill='#cdb9aa' stroke='#cdb9aa' stroke-width='.6' d='M527 633L565 635L537 671Z'/><path fill='#d7c3af' stroke='#d7c3af' stroke-width='.6' d='M565 635L586 631L573 674ZM632 637L586 631L611 654ZM632 637L683 639L660 662ZM759 664L761 641L774 670ZM778 621L816 617L810 658ZM873 637L893 651L842 659Z'/><path fill='#e6d7c3' stroke='#e6d7c3' stroke-width='.6' d='M494 736L479 687L527 689ZM573 696L587 692L568 730ZM915 725L941 707L946 726Z'/><path fill='#b9aa9b' stroke='#b9aa9b' stroke-width='.6' d='M494 816L495 831L509 827Z'/><path fill='#e1d7cd' stroke='#e1d7cd' stroke-width='.6' d='M592 822L590 790L568 829ZM655 805L634 822L679 827ZM734 790L681 800L724 815ZM778 836L752 815L765 841ZM697 864L679 827L720 845ZM852 787L881 792L863 814ZM806 795L852 787L828 838ZM806 795L778 836L810 838ZM863 814L855 836L900 834ZM881 792L922 803L900 834ZM953 803L977 825L952 840ZM952 840L922 803L930 856Z'/><path fill='#beafa0' stroke='#beafa0' stroke-width='.6' d='M509 827L495 831L519 836ZM519 836L495 863L506 866Z'/><path fill='#c8c3b4' stroke='#c8c3b4' stroke-width='.6' d='M532 801L544 799L519 836Z'/><path fill='#d2c8be' stroke='#d2c8be' stroke-width='.6' d='M532 801L509 827L519 836ZM519 836L568 829L556 847ZM592 822L590 790L630 795ZM655 805L630 795L634 822ZM679 827L634 822L663 857ZM663 857L675 849L697 864ZM622 851L626 871L643 872ZM778 836L765 841L777 872ZM855 836L896 866L879 883ZM843 878L855 836L879 883ZM815 862L806 890L825 894ZM986 874L952 840L971 877Z'/><path fill='#c3beb4' stroke='#c3beb4' stroke-width='.6' d='M592 822L568 829L585 856ZM986 874L990 832L1004 873Z'/><path fill='#c3b9af' stroke='#c3b9af' stroke-width='.6' d='M556 847L568 829L585 856ZM592 822L585 856L622 851ZM592 822L634 822L622 851ZM729 857L696 881L726 894Z'/><path fill='#b4a596' stroke='#b4a596' stroke-width='.6' d='M556 847L519 836L537 862ZM519 836L537 862L506 866Z'/><path fill='#c3aa91' stroke='#c3aa91' stroke-width='.6' d='M666 521L696 519L685 553ZM666 521L643 528L685 553ZM594 540L643 528L634 563ZM719 526L696 519L701 541ZM750 513L719 526L737 550ZM719 526L701 541L737 550ZM790 504L776 521L803 532Z'/><path fill='#c3aa96' stroke='#c3aa96' stroke-width='.6' d='M594 540L591 566L634 563Z'/><path fill='#cdb4a0' stroke='#cdb4a0' stroke-width='.6' d='M591 566L587 602L604 605ZM784 552L762 584L803 603Z'/><path fill='#d2b9a0' stroke='#d2b9a0' stroke-width='.6' d='M634 563L662 595L604 605ZM705 567L699 595L724 585ZM737 550L705 567L724 585ZM737 550L762 584L724 585ZM866 565L883 541L894 566ZM866 565L822 556L850 605Z'/><path fill='#d7beaa' stroke='#d7beaa' stroke-width='.6' d='M662 595L699 595L683 639ZM699 595L683 639L700 639ZM700 639L724 585L761 641ZM778 621L762 584L803 603ZM803 603L850 605L816 617ZM889 590L894 566L922 594ZM935 560L939 583L922 594Z'/><path fill='#d7c3aa' stroke='#d7c3aa' stroke-width='.6' d='M632 637L662 595L683 639ZM778 621L762 584L761 641ZM873 637L889 590L906 638Z'/><path fill='#d2c3af' stroke='#d2c3af' stroke-width='.6' d='M660 662L683 639L683 666Z'/><path fill='#e1d2be' stroke='#e1d2be' stroke-width='.6' d='M649 703L635 727L655 732ZM930 698L906 694L915 725Z'/><path fill='#c8beb4' stroke='#c8beb4' stroke-width='.6' d='M647 771L662 770L655 805ZM622 851L585 856L626 871ZM750 887L777 872L806 890ZM800 868L777 872L806 890ZM917 885L930 856L933 904Z'/><path fill='#cdc3b9' stroke='#cdc3b9' stroke-width='.6' d='M622 851L634 822L663 857ZM697 864L696 881L729 857ZM729 857L765 841L750 887ZM729 857L750 887L726 894ZM843 878L879 883L862 889ZM815 862L800 868L806 890ZM843 878L862 889L825 894Z'/><path fill='#d2cdc3' stroke='#d2cdc3' stroke-width='.6' d='M622 851L663 857L643 872Z'/><path fill='#8796aa' stroke='#8796aa' stroke-width='.6' d='M675 301L704 183L725 300ZM852 208L761 222L821 297ZM852 208L845 147L949 129ZM1041 72L1082 54L1086 89ZM949 129L983 149L1009 141ZM1041 72L1086 89L1009 141ZM1040 165L1086 89L1065 189ZM1097 204L1086 89L1160 170ZM1155 95L1086 89L1160 170ZM1155 95L1082 54L1200 0ZM1155 95L1200 0L1271 140ZM1400 0L1326 161L1421 126ZM1400 0L1421 126L1562 47ZM1562 47L1568 118L1532 151ZM1568 118L1532 151L1600 200ZM1568 118L1600 0L1600 200Z'/><path fill='#c8aa91' stroke='#c8aa91' stroke-width='.6' d='M750 513L790 504L776 521ZM853 520L835 487L818 524Z'/><path fill='#e1cdb9' stroke='#e1cdb9' stroke-width='.6' d='M759 664L774 670L740 687ZM947 640L943 623L931 649ZM931 649L947 640L951 656ZM951 656L931 649L941 673ZM931 649L893 651L906 694Z'/><path fill='#ebdcd2' stroke='#ebdcd2' stroke-width='.6' d='M734 790L752 815L724 815ZM863 814L852 787L828 838Z'/><path fill='#e1dccd' stroke='#e1dccd' stroke-width='.6' d='M752 815L765 841L720 845Z'/><path fill='#7d87a0' stroke='#7d87a0' stroke-width='.6' d='M662 160L600 0L800 0Z'/><path fill='#7d8ca5' stroke='#7d8ca5' stroke-width='.6' d='M838 19L800 0L869 27Z'/><path fill='#a0aab9' stroke='#a0aab9' stroke-width='.6' d='M835 487L806 510L818 524ZM1426 461L1362 446L1400 486ZM1385 524L1391 537L1400 486ZM1530 447L1600 400L1600 600Z'/><path fill='#cdaf96' stroke='#cdaf96' stroke-width='.6' d='M790 504L806 510L803 532ZM784 552L776 521L803 532ZM806 510L818 524L803 532Z'/><path fill='#d7bea5' stroke='#d7bea5' stroke-width='.6' d='M866 565L894 566L889 590Z'/><path fill='#dcc3af' stroke='#dcc3af' stroke-width='.6' d='M803 603L778 621L816 617ZM953 606L967 618L943 623ZM922 594L889 590L906 638Z'/><path fill='#d7d2c3' stroke='#d7d2c3' stroke-width='.6' d='M828 838L855 836L839 849Z'/><path fill='#c8c3b9' stroke='#c8c3b9' stroke-width='.6' d='M815 862L843 878L825 894ZM952 840L930 856L971 877ZM896 866L930 856L917 885Z'/><path fill='#8c9baf' stroke='#8c9baf' stroke-width='.6' d='M949 129L983 149L985 181ZM1009 141L999 165L1040 165ZM999 165L985 181L1036 184ZM1040 165L999 165L1036 184ZM1097 204L1069 200L1090 214ZM1265 189L1160 170L1250 205ZM1296 204L1290 165L1326 161ZM1326 161L1322 211L1338 222ZM1401 314L1447 139L1532 151Z'/><path fill='#a09187' stroke='#a09187' stroke-width='.6' d='M997 395L999 420L981 423ZM999 420L981 423L989 431ZM1068 334L1094 327L1079 345ZM999 370L1009 351L1022 360ZM1068 334L1079 345L1058 360ZM1079 345L1058 360L1086 363ZM1022 360L1058 360L1046 376ZM997 395L999 420L1012 406ZM997 395L1017 379L1012 406ZM1017 379L1046 376L1031 410ZM1012 406L999 420L1023 423ZM1023 423L1031 410L1036 430ZM1023 423L1036 430L1031 440ZM1023 423L1031 440L1006 444ZM1140 262L1151 246L1152 266ZM1161 255L1152 266L1177 269ZM1140 262L1152 266L1138 275ZM1152 266L1177 269L1167 288ZM1199 284L1167 288L1173 299ZM1117 298L1138 275L1131 308ZM1117 298L1097 293L1101 313ZM1101 313L1117 298L1122 327ZM1079 345L1094 327L1115 342ZM1122 327L1094 327L1115 342ZM1115 342L1122 327L1141 343ZM1199 284L1220 276L1220 288ZM1176 312L1173 299L1200 303ZM1176 312L1194 319L1200 303ZM1200 303L1194 319L1223 315ZM1260 327L1261 316L1229 328ZM1167 332L1194 319L1201 332ZM1229 328L1223 315L1201 332Z'/><path fill='#9b8c82' stroke='#9b8c82' stroke-width='.6' d='M989 431L981 423L982 447ZM1012 406L1031 410L1023 423ZM982 447L989 431L1006 444ZM982 447L990 465L1006 444ZM989 431L999 420L1006 444ZM1023 423L999 420L1006 444ZM1237 276L1220 276L1220 288ZM1237 276L1220 288L1255 291ZM1199 284L1220 288L1200 303ZM1255 291L1220 288L1223 315ZM1255 291L1270 294L1261 316ZM1281 317L1282 306L1292 318ZM1261 316L1223 315L1229 328ZM1223 315L1194 319L1201 332ZM1260 327L1229 328L1235 342ZM1201 332L1198 364L1235 342ZM1229 328L1201 332L1235 342ZM1235 342L1260 327L1257 357ZM1291 335L1260 327L1275 363ZM1260 327L1257 357L1275 363ZM1291 335L1288 359L1275 363ZM1235 342L1198 364L1219 372Z'/><path fill='#fffaf5' stroke='#fffaf5' stroke-width='.6' d='M982 447L990 465L973 495ZM971 523L953 514L959 525ZM943 623L967 618L947 640ZM951 656L941 673L975 701ZM1008 662L975 701L1022 697ZM1155 362L1167 332L1184 365ZM1184 365L1198 364L1186 381ZM1149 463L1165 440L1174 472ZM1139 531L1113 517L1124 550ZM1151 544L1139 531L1124 550ZM1246 449L1250 462L1226 466ZM1189 468L1215 463L1200 478Z'/><path fill='#fffaf0' stroke='#fffaf0' stroke-width='.6' d='M980 506L973 495L953 514ZM959 525L971 523L990 556ZM953 606L967 597L967 618Z'/><path fill='#ffffff' stroke='#ffffff' stroke-width='.6' d='M980 506L996 508L985 521ZM959 525L953 514L939 537ZM959 525L990 556L935 560ZM1089 446L1077 449L1095 462ZM1095 462L1077 449L1076 465ZM1037 460L1031 440L1017 466ZM1076 465L1077 449L1062 467ZM1037 460L1058 445L1049 468ZM1062 467L1058 445L1049 468ZM990 465L1017 466L1002 475ZM1037 460L1017 466L1039 475ZM1037 460L1049 468L1039 475ZM1076 465L1095 462L1090 484ZM1076 465L1062 467L1078 486ZM1076 465L1090 484L1078 486ZM1017 466L1039 475L1032 487ZM1062 467L1049 468L1048 489ZM1032 487L1039 475L1048 489ZM1032 487L1017 466L1018 495ZM1078 486L1090 484L1089 499ZM1032 487L1048 489L1051 505ZM1058 495L1048 489L1051 505ZM1032 487L1018 495L1026 505ZM1078 486L1058 495L1063 509ZM1078 486L1089 499L1063 509ZM1051 505L1058 495L1063 509ZM1063 509L1089 499L1086 513ZM1063 509L1086 513L1073 521ZM985 521L996 508L1022 533ZM996 508L1026 505L1022 533ZM1051 505L1026 505L1022 533ZM1073 521L1086 513L1078 540ZM1051 505L1063 509L1069 547ZM1063 509L1073 521L1069 547ZM1051 505L1022 533L1069 547ZM990 556L991 600L1007 552ZM991 600L1007 552L1047 588ZM1058 573L1007 552L1047 588ZM991 600L1047 588L1023 621ZM1023 621L1047 588L1049 627ZM1150 295L1173 299L1148 308ZM1148 308L1173 299L1176 312ZM1176 312L1148 308L1167 332ZM1148 308L1167 332L1141 343ZM1155 362L1184 365L1162 376ZM1134 362L1155 362L1142 378ZM1144 399L1123 385L1127 409ZM1089 446L1089 428L1103 438ZM1089 428L1116 417L1103 438ZM1095 462L1089 446L1103 438ZM1168 417L1139 423L1148 438ZM1168 417L1148 438L1165 440ZM1139 423L1116 417L1120 442ZM1103 438L1116 417L1120 442ZM1139 423L1148 438L1120 442ZM1103 438L1095 462L1120 442ZM1165 440L1148 438L1149 463ZM1120 442L1148 438L1149 463ZM1189 468L1165 440L1174 472ZM1090 484L1089 499L1110 474ZM1095 462L1090 484L1110 474ZM1095 462L1120 442L1110 474ZM1189 468L1174 472L1176 483ZM1151 483L1174 472L1176 483ZM1110 474L1149 463L1136 485ZM1110 474L1136 485L1133 496ZM1151 483L1176 483L1161 504ZM1151 483L1161 504L1144 507ZM1197 491L1176 483L1187 516ZM1089 499L1086 513L1113 517ZM1110 474L1089 499L1113 517ZM1110 474L1133 496L1113 517ZM1133 496L1144 507L1113 517ZM1161 504L1144 507L1139 531ZM1078 540L1086 513L1102 537ZM1113 517L1086 513L1102 537ZM1161 504L1187 516L1179 544ZM1102 537L1078 540L1100 560ZM1102 537L1100 560L1112 563ZM1189 468L1187 425L1210 442ZM1219 420L1198 426L1210 442ZM1246 449L1235 437L1226 466ZM1259 481L1235 496L1236 508Z'/><path fill='#fffffa' stroke='#fffffa' stroke-width='.6' d='M980 506L953 514L971 523ZM959 525L939 537L935 560ZM935 560L990 556L976 578ZM976 578L935 560L939 583ZM976 578L939 583L967 597ZM976 578L990 556L991 600ZM976 578L967 597L991 600ZM967 597L991 600L967 618ZM991 600L967 618L974 627ZM1006 444L990 465L1017 466ZM1049 468L1039 475L1048 489ZM1078 486L1062 467L1058 495ZM1062 467L1048 489L1058 495ZM1017 466L1002 475L1018 495ZM985 521L990 556L1007 552ZM985 521L1022 533L1007 552ZM1022 533L1069 547L1058 573ZM1022 533L1007 552L1058 573ZM1083 583L1058 573L1047 588ZM1079 622L1047 588L1049 627ZM1176 312L1194 319L1167 332ZM1141 343L1167 332L1155 362ZM1134 362L1141 343L1155 362ZM1184 365L1162 376L1186 381ZM1101 407L1123 385L1127 409ZM1101 407L1089 428L1116 417ZM1127 409L1144 399L1139 423ZM1120 442L1149 463L1110 474ZM1149 463L1174 472L1151 483ZM1151 483L1149 463L1136 485ZM1151 483L1136 485L1133 496ZM1161 504L1176 483L1187 516ZM1113 517L1144 507L1139 531ZM1102 537L1113 517L1124 550ZM1078 540L1069 547L1100 560ZM1083 583L1069 547L1100 560ZM1124 550L1160 556L1150 582ZM1219 420L1231 408L1235 437ZM1198 426L1187 425L1210 442ZM1197 491L1200 478L1213 496ZM1197 491L1213 496L1211 510Z'/><path fill='#fafaf0' stroke='#fafaf0' stroke-width='.6' d='M980 506L985 521L971 523ZM1008 662L1032 672L1022 697Z'/><path fill='#d2b49b' stroke='#d2b49b' stroke-width='.6' d='M862 511L883 541L913 523Z'/><path fill='#d7b9a0' stroke='#d7b9a0' stroke-width='.6' d='M953 514L913 523L939 537Z'/><path fill='#fffff5' stroke='#fffff5' stroke-width='.6' d='M985 521L971 523L990 556Z'/><path fill='#dcbea5' stroke='#dcbea5' stroke-width='.6' d='M894 566L913 523L935 560ZM939 537L913 523L935 560Z'/><path fill='#dcc3aa' stroke='#dcc3aa' stroke-width='.6' d='M922 594L939 583L953 606Z'/><path fill='#faf5f0' stroke='#faf5f0' stroke-width='.6' d='M967 597L939 583L953 606ZM974 627L967 618L947 640ZM947 640L974 627L951 656ZM974 627L991 600L1002 645ZM1023 621L991 600L1002 645ZM1023 621L1049 627L1037 660ZM1023 621L1002 645L1037 660ZM951 656L975 701L1008 662ZM1032 672L1043 678L1022 697ZM1077 671L1043 678L1056 702ZM1022 697L975 701L1004 727ZM1031 722L1022 697L1004 727ZM1142 378L1123 385L1144 399ZM1186 381L1162 376L1173 399ZM1142 378L1162 376L1158 401ZM1158 401L1168 417L1139 423ZM1127 409L1116 417L1139 423ZM1187 425L1168 417L1165 440ZM1151 544L1179 544L1160 556ZM1151 544L1124 550L1160 556ZM1205 377L1186 381L1203 402ZM1232 532L1211 510L1206 540Z'/><path fill='#e1c8b4' stroke='#e1c8b4' stroke-width='.6' d='M873 637L893 651L906 638Z'/><path fill='#e6cdb9' stroke='#e6cdb9' stroke-width='.6' d='M943 623L922 594L906 638Z'/><path fill='#ebd7c3' stroke='#ebd7c3' stroke-width='.6' d='M931 649L941 673L906 694Z'/><path fill='#c8b9a5' stroke='#c8b9a5' stroke-width='.6' d='M941 673L906 694L930 698Z'/><path fill='#e6d2be' stroke='#e6d2be' stroke-width='.6' d='M941 673L930 698L941 707Z'/><path fill='#f5f0eb' stroke='#f5f0eb' stroke-width='.6' d='M941 673L975 701L941 707ZM996 508L1018 495L1026 505ZM951 656L974 627L1002 645ZM1056 702L1022 697L1031 722ZM975 701L974 752L1004 727ZM1083 583L1100 560L1105 589ZM1083 583L1079 622L1105 589ZM1198 426L1184 404L1203 402ZM1198 426L1203 402L1219 420ZM1189 468L1176 483L1200 478ZM1259 481L1272 487L1260 520ZM1359 560L1331 551L1333 592Z'/><path fill='#ebd7c8' stroke='#ebd7c8' stroke-width='.6' d='M941 707L930 698L915 725Z'/><path fill='#faf5eb' stroke='#faf5eb' stroke-width='.6' d='M941 707L975 701L946 726Z'/><path fill='#f0ebe6' stroke='#f0ebe6' stroke-width='.6' d='M946 726L975 701L974 752ZM947 740L946 726L974 752ZM980 506L996 508L1000 496ZM1049 627L1037 660L1066 661ZM993 763L1004 727L1027 769ZM1031 722L1066 735L1045 772ZM1172 564L1160 556L1150 582ZM1090 688L1066 735L1108 694ZM1253 632L1218 629L1225 650ZM1356 493L1377 514L1342 527ZM1377 514L1385 524L1342 527ZM1342 527L1331 551L1359 560Z'/><path fill='#e6e1dc' stroke='#e6e1dc' stroke-width='.6' d='M947 740L974 752L959 772ZM967 894L986 901L967 916ZM1066 735L1095 769L1045 772ZM1027 769L1045 772L1029 794ZM1009 937L1004 948L1020 948ZM1124 635L1164 624L1156 666ZM1136 705L1108 694L1123 729ZM1172 564L1179 544L1202 567ZM1240 895L1198 899L1230 924ZM1359 560L1391 537L1395 560ZM1309 693L1298 706L1332 740ZM1279 899L1298 881L1310 909ZM1310 909L1340 900L1330 921ZM1265 946L1262 917L1313 940Z'/><path fill='#dcd7d2' stroke='#dcd7d2' stroke-width='.6' d='M993 763L974 752L959 772ZM1002 645L1037 660L1008 662ZM1032 672L1037 660L1043 678ZM993 763L994 794L1027 769ZM1027 769L994 794L1029 794ZM1045 772L1095 769L1086 798ZM1045 772L1086 798L1045 800ZM1029 794L994 794L1005 831ZM1183 734L1184 720L1142 736ZM1142 736L1183 734L1176 770ZM1095 769L1134 772L1119 790ZM1183 812L1181 847L1194 848ZM1155 843L1181 847L1160 869ZM1125 884L1088 894L1101 908ZM1253 632L1255 668L1267 668ZM1215 700L1236 725L1215 735ZM1233 782L1245 768L1269 805ZM1260 860L1240 895L1256 905ZM1293 660L1270 627L1318 636ZM1278 681L1293 660L1309 693ZM1309 693L1360 690L1357 724ZM1332 740L1298 706L1312 740ZM1280 771L1312 740L1321 755ZM1321 755L1320 778L1302 782Z'/><path fill='#e1dcd7' stroke='#e1dcd7' stroke-width='.6' d='M993 763L959 772L994 794ZM1045 772L1029 794L1045 800ZM1136 705L1175 700L1142 736ZM1142 736L1123 729L1130 758ZM1130 758L1142 736L1176 770ZM1170 838L1183 812L1181 847ZM1155 843L1116 863L1160 869ZM1181 603L1194 591L1207 626ZM1248 694L1236 725L1271 732ZM1280 771L1245 768L1269 805ZM1194 848L1183 812L1216 817ZM1233 782L1269 805L1231 833ZM1359 560L1395 560L1391 583ZM1313 564L1333 592L1304 601ZM1343 609L1304 601L1318 636ZM1346 664L1360 690L1309 693ZM1357 724L1309 693L1332 740ZM1300 730L1298 706L1312 740Z'/><path fill='#dcd7cd' stroke='#dcd7cd' stroke-width='.6' d='M959 772L994 794L976 802Z'/><path fill='#c3beb9' stroke='#c3beb9' stroke-width='.6' d='M976 802L994 794L977 825ZM986 874L999 900L986 901ZM1035 832L1046 818L1069 853ZM1030 858L1035 832L1056 863ZM1005 831L1022 867L1004 873ZM1098 867L1083 857L1089 881ZM1004 873L1022 867L1021 897ZM1089 881L1056 863L1065 907ZM1150 818L1183 812L1170 838ZM1125 836L1150 818L1155 843ZM1125 884L1135 905L1101 908ZM1172 889L1198 899L1172 911ZM1289 840L1260 845L1260 860ZM1212 878L1198 899L1240 895ZM1212 878L1228 876L1240 895ZM1289 840L1313 816L1311 848Z'/><path fill='#cdc8b9' stroke='#cdc8b9' stroke-width='.6' d='M976 802L953 803L977 825ZM952 840L990 832L986 874ZM971 877L930 856L933 904Z'/><path fill='#fff5e6' stroke='#fff5e6' stroke-width='.6' d='M990 832L977 825L952 840Z'/><path fill='#cdc8be' stroke='#cdc8be' stroke-width='.6' d='M879 883L896 866L917 885Z'/><path fill='#c8c3be' stroke='#c8c3be' stroke-width='.6' d='M986 874L971 877L986 901ZM967 894L971 877L986 901ZM1035 832L1069 853L1056 863ZM1056 863L1083 857L1089 881ZM1165 680L1175 700L1194 702ZM1176 770L1198 766L1181 797ZM1181 797L1144 789L1150 818ZM1144 789L1130 797L1150 818ZM1080 834L1079 814L1112 837ZM1194 886L1191 869L1172 889ZM1125 884L1160 869L1159 890ZM1293 660L1267 668L1278 681ZM1225 750L1207 774L1233 782ZM1275 834L1289 840L1260 845ZM1260 845L1225 857L1260 860ZM1225 857L1228 876L1212 878ZM1275 834L1289 840L1313 816ZM1289 840L1298 881L1311 864Z'/><path fill='#ebe6e1' stroke='#ebe6e1' stroke-width='.6' d='M999 900L986 901L998 922ZM1066 661L1079 622L1077 671ZM1031 722L1004 727L1027 769ZM998 922L999 900L1021 897ZM1021 897L998 922L1023 929ZM986 936L1009 937L1004 948ZM1098 943L1065 907L1060 951ZM1105 589L1079 622L1124 635ZM1183 657L1164 624L1156 666ZM1108 694L1066 735L1123 729ZM1088 894L1065 907L1101 908ZM1172 911L1198 899L1191 931ZM1183 657L1164 624L1207 626ZM1256 607L1270 627L1253 632ZM1278 681L1277 698L1298 706ZM1191 931L1198 899L1230 924ZM1240 895L1256 905L1230 924ZM1225 943L1230 924L1265 946ZM1342 527L1385 524L1359 560ZM1311 864L1298 881L1310 881ZM1279 899L1262 917L1310 909ZM1310 881L1298 881L1310 909ZM1330 879L1340 900L1310 909ZM1310 909L1330 921L1313 940Z'/><path fill='#ebe6dc' stroke='#ebe6dc' stroke-width='.6' d='M986 901L967 916L998 922ZM1021 897L1042 908L1023 929ZM1023 929L1020 948L1060 951ZM1098 943L1065 907L1101 908ZM1135 905L1101 908L1123 920ZM1310 881L1330 879L1310 909ZM1310 909L1262 917L1313 940Z'/><path fill='#e6e1d7' stroke='#e6e1d7' stroke-width='.6' d='M998 922L967 916L986 936ZM1023 929L998 922L1009 937ZM1023 929L1009 937L1020 948ZM1065 907L1042 908L1060 951ZM1098 943L1101 908L1123 920ZM1256 905L1262 917L1230 924Z'/><path fill='#6e645a' stroke='#6e645a' stroke-width='.6' d='M1040 165L1050 182L1036 184ZM1090 214L1055 220L1084 233ZM1296 204L1274 201L1287 211ZM1250 205L1274 201L1263 227ZM1287 211L1274 201L1280 228Z'/><path fill='#73645a' stroke='#73645a' stroke-width='.6' d='M1040 165L1050 182L1065 189ZM1046 211L1055 220L1049 234ZM1046 211L1030 226L1049 234ZM1049 234L1030 226L1029 242ZM1265 189L1273 176L1274 201ZM1265 189L1274 201L1250 205ZM1250 205L1240 214L1244 225ZM1206 250L1222 234L1232 258ZM1287 211L1280 228L1301 242ZM1279 403L1274 385L1301 374ZM1279 403L1301 374L1311 400Z'/><path fill='#6e5f5a' stroke='#6e5f5a' stroke-width='.6' d='M1036 184L1050 182L1034 204ZM1050 182L1065 189L1046 211ZM1034 204L1050 182L1046 211ZM1069 200L1065 189L1046 211ZM1090 214L1069 200L1055 220ZM1046 211L1034 204L1030 226ZM1049 234L1029 242L1060 253ZM1029 242L1060 253L1044 275ZM1274 201L1273 176L1296 204ZM1250 205L1244 225L1263 227ZM1295 288L1298 303L1282 306ZM1296 204L1287 211L1301 242ZM1294 255L1280 228L1301 242Z'/><path fill='#cdaaa5' stroke='#cdaaa5' stroke-width='.6' d='M1046 211L1069 200L1055 220ZM1261 247L1280 228L1294 255ZM1261 247L1257 269L1280 279ZM1257 269L1280 279L1270 294Z'/><path fill='#d2afaa' stroke='#d2afaa' stroke-width='.6' d='M1084 233L1055 220L1049 234ZM1237 276L1232 258L1220 276ZM1261 247L1294 255L1280 279ZM1237 276L1257 269L1255 291Z'/><path fill='#d7afaa' stroke='#d7afaa' stroke-width='.6' d='M1049 234L1084 233L1060 253ZM1263 227L1244 225L1243 245ZM1232 258L1206 250L1220 276Z'/><path fill='#e1b9b4' stroke='#e1b9b4' stroke-width='.6' d='M1060 253L1084 233L1073 269ZM1073 269L1098 258L1084 286ZM1105 269L1119 250L1117 276Z'/><path fill='#dcb4af' stroke='#dcb4af' stroke-width='.6' d='M1098 258L1084 233L1073 269ZM1073 269L1051 285L1066 292ZM1073 269L1084 286L1066 292ZM1084 286L1098 258L1105 269ZM1098 258L1119 250L1105 269Z'/><path fill='#d7afaf' stroke='#d7afaf' stroke-width='.6' d='M1073 269L1060 253L1044 275ZM1222 234L1243 245L1232 258Z'/><path fill='#73645f' stroke='#73645f' stroke-width='.6' d='M1044 275L1029 242L1024 281ZM1044 275L1024 281L1051 285ZM1051 285L1024 281L1032 303ZM1090 214L1084 233L1115 238ZM1098 258L1115 238L1119 250ZM1273 176L1290 165L1296 204ZM1244 225L1222 234L1243 245ZM1206 250L1190 262L1220 276ZM1279 403L1298 419L1283 419ZM1279 403L1263 401L1259 421ZM1279 403L1283 419L1259 421ZM1263 401L1231 408L1259 421ZM1294 255L1301 242L1306 281ZM1279 403L1298 419L1311 400Z'/><path fill='#e6b9b9' stroke='#e6b9b9' stroke-width='.6' d='M1044 275L1073 269L1051 285Z'/><path fill='#a59187' stroke='#a59187' stroke-width='.6' d='M1084 286L1066 292L1088 314ZM1088 314L1066 292L1048 316ZM1048 316L1032 303L1027 317ZM1017 324L1027 317L1038 331ZM1088 314L1094 327L1068 334ZM1068 334L1048 316L1046 342ZM1009 351L1038 331L1022 360ZM1068 334L1046 342L1058 360ZM1022 360L1046 342L1058 360ZM1022 360L999 370L1017 379ZM1012 406L1017 379L1031 410ZM1179 246L1151 246L1161 255ZM1179 246L1190 262L1177 269ZM1140 262L1138 275L1117 276ZM1105 269L1097 293L1117 276ZM1190 262L1177 269L1199 284ZM1199 284L1177 269L1167 288ZM1152 266L1138 275L1150 295ZM1150 295L1167 288L1173 299ZM1150 295L1138 275L1131 308ZM1088 314L1094 327L1101 313ZM1131 308L1148 308L1122 327ZM1079 345L1086 363L1105 362ZM1079 345L1115 342L1105 362ZM1134 362L1115 342L1105 362ZM1190 262L1196 241L1206 250ZM1199 284L1190 262L1220 276Z'/><path fill='#a5968c' stroke='#a5968c' stroke-width='.6' d='M1084 286L1097 293L1088 314ZM1017 324L1038 331L1009 351ZM1151 246L1119 250L1140 262ZM1152 266L1167 288L1150 295ZM1117 276L1138 275L1117 298ZM1117 276L1097 293L1117 298ZM1088 314L1097 293L1101 313ZM1101 313L1094 327L1122 327ZM1131 308L1117 298L1122 327Z'/><path fill='#78695f' stroke='#78695f' stroke-width='.6' d='M1051 285L1066 292L1048 316ZM1032 303L1051 285L1048 316ZM1032 303L1024 281L1017 324ZM1032 303L1027 317L1017 324ZM1219 372L1235 342L1250 376ZM1250 376L1275 363L1274 385ZM1250 376L1219 372L1217 391ZM1274 385L1256 388L1263 401ZM1250 376L1256 388L1231 408ZM1263 401L1256 388L1231 408ZM1259 421L1283 419L1277 448ZM1259 421L1277 448L1246 449ZM1275 363L1274 385L1301 374Z'/><path fill='#a59687' stroke='#a59687' stroke-width='.6' d='M1048 316L1027 317L1038 331ZM999 370L997 395L1017 379ZM1058 445L1077 449L1062 467ZM1131 308L1150 295L1148 308Z'/><path fill='#aa968c' stroke='#aa968c' stroke-width='.6' d='M1048 316L1088 314L1068 334ZM1048 316L1038 331L1046 342ZM1046 342L1038 331L1022 360ZM1058 445L1031 440L1037 460ZM1006 444L1031 440L1017 466ZM1161 255L1151 246L1152 266Z'/><path fill='#a08c82' stroke='#a08c82' stroke-width='.6' d='M1022 360L1046 376L1017 379ZM1036 430L1046 424L1058 445ZM1036 430L1031 440L1058 445ZM1179 246L1196 241L1190 262ZM1161 255L1179 246L1177 269ZM1148 308L1122 327L1141 343ZM1115 342L1141 343L1134 362Z'/><path fill='#827369' stroke='#827369' stroke-width='.6' d='M1086 363L1058 360L1066 380ZM1066 380L1046 376L1055 401ZM1071 428L1046 424L1058 445ZM1071 428L1089 428L1077 449ZM1089 446L1089 428L1077 449ZM1071 428L1058 445L1077 449ZM1259 421L1235 437L1246 449ZM1333 395L1339 429L1362 446ZM1339 429L1362 446L1348 462Z'/><path fill='#826e69' stroke='#826e69' stroke-width='.6' d='M1090 376L1086 363L1066 380ZM1090 376L1066 380L1083 399ZM1055 401L1046 376L1031 410ZM1083 399L1055 401L1071 428ZM1083 399L1090 376L1101 407Z'/><path fill='#7d6e64' stroke='#7d6e64' stroke-width='.6' d='M1046 376L1058 360L1066 380ZM1083 399L1066 380L1055 401ZM1031 410L1055 401L1046 424ZM1055 401L1046 424L1071 428ZM1071 428L1083 399L1089 428ZM1031 410L1046 424L1036 430ZM1090 376L1086 363L1105 362ZM1090 376L1105 362L1123 385ZM1134 362L1105 362L1123 385ZM1090 376L1123 385L1101 407ZM1083 399L1089 428L1101 407ZM1205 377L1219 372L1217 391Z'/><path fill='#fafaf5' stroke='#fafaf5' stroke-width='.6' d='M973 495L990 465L1002 475ZM1018 495L1002 475L1000 496ZM1032 487L1051 505L1026 505ZM1155 362L1162 376L1142 378ZM1142 378L1144 399L1158 401ZM1186 381L1173 399L1184 404ZM1158 401L1173 399L1168 417ZM1127 409L1101 407L1116 417ZM1158 401L1144 399L1139 423ZM1151 544L1161 504L1179 544ZM1102 537L1124 550L1112 563ZM1124 550L1112 563L1150 582ZM1181 603L1155 608L1164 624ZM1184 365L1167 332L1201 332ZM1184 365L1198 364L1201 332ZM1205 377L1217 391L1203 402ZM1235 437L1210 442L1215 463ZM1200 478L1227 482L1213 496ZM1197 491L1187 516L1211 510ZM1236 508L1213 496L1211 510Z'/><path fill='#f0ebeb' stroke='#f0ebeb' stroke-width='.6' d='M980 506L973 495L1000 496ZM1277 448L1250 462L1271 476Z'/><path fill='#f5f5f0' stroke='#f5f5f0' stroke-width='.6' d='M973 495L1002 475L1000 496ZM1079 622L1049 627L1066 661ZM1022 697L1043 678L1056 702ZM1187 425L1165 440L1189 468ZM1161 504L1139 531L1151 544ZM1186 381L1198 364L1205 377ZM1219 372L1198 364L1205 377ZM1217 391L1203 402L1231 408ZM1187 516L1211 510L1206 540Z'/><path fill='#ebebe6' stroke='#ebebe6' stroke-width='.6' d='M996 508L1018 495L1000 496ZM1031 722L1056 702L1066 735ZM1027 769L1031 722L1045 772ZM1179 544L1160 556L1172 564ZM1077 671L1079 622L1112 669ZM1124 635L1079 622L1112 669ZM1156 666L1124 635L1112 669ZM1271 476L1293 454L1298 487ZM1271 476L1259 481L1272 487ZM1271 476L1298 487L1272 487ZM1259 481L1227 482L1235 496ZM1236 508L1259 481L1260 520ZM1236 508L1211 510L1232 532ZM1260 520L1236 508L1232 532ZM1260 520L1232 532L1265 540ZM1179 544L1206 540L1202 567ZM1277 698L1298 706L1271 732ZM1256 607L1270 627L1304 601ZM1278 681L1298 706L1309 693Z'/><path fill='#d7d7d2' stroke='#d7d7d2' stroke-width='.6' d='M1078 540L1073 521L1069 547ZM1045 800L1079 814L1046 818ZM1120 678L1112 669L1108 694ZM1165 680L1156 666L1136 705ZM1130 758L1095 769L1134 772ZM1202 567L1206 540L1223 573ZM1232 532L1265 540L1243 574ZM1183 734L1184 720L1215 735ZM1233 782L1216 817L1231 833ZM1356 493L1351 476L1336 493ZM1269 805L1280 771L1302 782ZM1280 771L1321 755L1302 782Z'/><path fill='#faf5f5' stroke='#faf5f5' stroke-width='.6' d='M1069 547L1058 573L1083 583ZM1083 583L1047 588L1079 622ZM1235 437L1215 463L1226 466ZM1226 466L1215 463L1227 482Z'/><path fill='#d7d2cd' stroke='#d7d2cd' stroke-width='.6' d='M951 656L1002 645L1008 662ZM1066 661L1077 671L1043 678ZM1045 800L1086 798L1079 814ZM1045 800L1029 794L1046 818ZM1029 794L1046 818L1035 832ZM1056 863L1022 867L1021 897ZM1156 666L1112 669L1120 678ZM1156 666L1120 678L1136 705ZM1108 694L1120 678L1136 705ZM1130 758L1176 770L1134 772ZM1155 843L1170 838L1181 847ZM1160 869L1116 863L1125 884ZM1183 657L1225 650L1211 678ZM1215 700L1248 694L1236 725ZM1216 817L1231 833L1215 841ZM1269 805L1231 833L1260 845ZM1260 860L1279 899L1256 905ZM1359 560L1333 592L1377 606ZM1377 606L1343 609L1348 623ZM1332 740L1312 740L1321 755ZM1332 740L1321 755L1348 757ZM1348 757L1321 755L1320 778Z'/><path fill='#d2d2cd' stroke='#d2d2cd' stroke-width='.6' d='M1008 662L1037 660L1032 672ZM1005 831L1029 794L1035 832ZM1172 564L1194 591L1181 603ZM1232 532L1223 573L1243 574ZM1256 607L1235 591L1218 629ZM1165 680L1194 702L1211 678ZM1232 667L1225 650L1211 678ZM1255 668L1267 668L1248 694ZM1183 734L1198 766L1215 735ZM1215 841L1231 833L1225 857ZM1260 845L1231 833L1225 857ZM1328 475L1318 486L1336 493ZM1318 486L1336 493L1335 504ZM1318 486L1335 504L1314 508ZM1348 623L1343 609L1318 636ZM1269 805L1302 782L1313 816ZM1320 778L1302 782L1313 816Z'/><path fill='#d7d2d2' stroke='#d7d2d2' stroke-width='.6' d='M1066 661L1037 660L1043 678ZM1172 564L1150 582L1181 603ZM1172 564L1194 591L1202 567ZM1293 660L1270 627L1267 668ZM1333 592L1304 601L1343 609Z'/><path fill='#cdcdc8' stroke='#cdcdc8' stroke-width='.6' d='M1089 676L1077 671L1090 688ZM1105 589L1150 582L1155 608ZM1089 676L1090 688L1108 694ZM1089 676L1112 669L1108 694ZM1119 790L1134 772L1130 797ZM1235 591L1243 574L1256 607ZM1165 680L1183 657L1211 678ZM1289 840L1260 860L1298 881ZM1328 475L1351 476L1336 493ZM1335 504L1314 508L1342 527Z'/><path fill='#d2cdc8' stroke='#d2cdc8' stroke-width='.6' d='M1090 688L1077 671L1056 702ZM1005 831L990 832L1004 873ZM1021 897L1056 863L1042 908ZM1156 666L1183 657L1165 680ZM1183 734L1198 766L1176 770ZM1176 770L1134 772L1144 789ZM1119 790L1130 797L1135 817ZM1160 869L1181 847L1191 869ZM1089 881L1098 867L1125 884ZM1116 863L1098 867L1125 884ZM1235 591L1207 626L1218 629ZM1232 667L1225 650L1255 668ZM1211 678L1194 702L1215 700ZM1215 735L1236 725L1225 750ZM1236 725L1271 732L1245 768ZM1275 834L1269 805L1260 845ZM1215 841L1194 848L1225 857ZM1194 848L1191 869L1212 878ZM1194 848L1225 857L1212 878ZM1313 564L1288 556L1304 601ZM1293 660L1318 636L1328 645ZM1346 664L1357 656L1360 690ZM1328 645L1293 660L1309 693ZM1275 834L1269 805L1313 816ZM1311 848L1289 840L1311 864Z'/><path fill='#f0ebe1' stroke='#f0ebe1' stroke-width='.6' d='M993 763L974 752L1004 727ZM986 936L998 922L1009 937ZM1279 899L1256 905L1262 917ZM1191 931L1230 924L1225 943ZM1262 917L1230 924L1265 946ZM1311 864L1330 879L1310 881Z'/><path fill='#ebe6e6' stroke='#ebe6e6' stroke-width='.6' d='M1090 688L1056 702L1066 735Z'/><path fill='#dcdcd2' stroke='#dcdcd2' stroke-width='.6' d='M990 832L994 794L1005 831ZM1194 848L1216 817L1215 841Z'/><path fill='#cdc8c3' stroke='#cdc8c3' stroke-width='.6' d='M1079 814L1046 818L1080 834ZM1080 834L1046 818L1069 853ZM1004 873L999 900L1021 897ZM1065 907L1056 863L1042 908ZM1181 603L1150 582L1155 608ZM1144 789L1134 772L1130 797ZM1086 798L1079 814L1112 837ZM1119 790L1086 798L1112 837ZM1119 790L1135 817L1112 837ZM1160 869L1191 869L1172 889ZM1172 889L1160 869L1159 890ZM1253 632L1225 650L1255 668ZM1215 735L1198 766L1225 750ZM1198 766L1181 797L1207 774ZM1207 774L1181 797L1216 817ZM1194 886L1191 869L1212 878ZM1290 543L1331 551L1313 564ZM1348 623L1318 636L1328 645ZM1328 645L1357 656L1346 664ZM1328 645L1346 664L1309 693ZM1348 757L1320 778L1333 788ZM1333 788L1320 778L1313 816Z'/><path fill='#b9b9b4' stroke='#b9b9b4' stroke-width='.6' d='M1080 834L1069 853L1083 857ZM1155 843L1125 836L1116 863Z'/><path fill='#c8c8c3' stroke='#c8c8c3' stroke-width='.6' d='M1005 831L1035 832L1030 858ZM1165 680L1175 700L1136 705ZM1290 543L1265 540L1288 556ZM1225 750L1198 766L1207 774ZM1225 750L1245 768L1233 782ZM1260 860L1225 857L1228 876ZM1362 446L1348 462L1351 476ZM1356 493L1336 493L1335 504ZM1290 543L1314 508L1331 551ZM1328 645L1348 623L1357 656Z'/><path fill='#b9b4af' stroke='#b9b4af' stroke-width='.6' d='M1069 853L1083 857L1056 863ZM1080 834L1083 857L1112 837ZM1125 836L1135 817L1112 837ZM1125 836L1112 837L1116 863Z'/><path fill='#c3c3b9' stroke='#c3c3b9' stroke-width='.6' d='M1005 831L1030 858L1022 867Z'/><path fill='#beb9b4' stroke='#beb9b4' stroke-width='.6' d='M1030 858L1056 863L1022 867ZM1150 818L1135 817L1125 836ZM1150 818L1170 838L1155 843ZM1089 881L1088 894L1125 884ZM1183 812L1181 797L1216 817Z'/><path fill='#bebeb9' stroke='#bebeb9' stroke-width='.6' d='M986 874L999 900L1004 873ZM1135 817L1130 797L1150 818ZM1098 867L1083 857L1112 837ZM1098 867L1112 837L1116 863ZM1223 573L1194 591L1235 591Z'/><path fill='#b4afaa' stroke='#b4afaa' stroke-width='.6' d='M1089 881L1088 894L1065 907ZM1183 812L1181 797L1150 818ZM1194 886L1198 899L1212 878Z'/><path fill='#f0e6e1' stroke='#f0e6e1' stroke-width='.6' d='M1023 929L1042 908L1060 951Z'/><path fill='#786964' stroke='#786964' stroke-width='.6' d='M1098 258L1084 233L1115 238ZM1084 286L1097 293L1105 269ZM1140 262L1119 250L1117 276ZM1250 376L1274 385L1256 388ZM1259 421L1231 408L1235 437Z'/><path fill='#fffafa' stroke='#fffafa' stroke-width='.6' d='M1134 362L1142 378L1123 385ZM1162 376L1173 399L1158 401ZM1184 404L1173 399L1168 417ZM1168 417L1184 404L1187 425ZM1151 483L1133 496L1144 507ZM1186 381L1184 404L1203 402ZM1189 468L1210 442L1215 463ZM1197 491L1176 483L1200 478Z'/><path fill='#f0f0eb' stroke='#f0f0eb' stroke-width='.6' d='M1187 425L1184 404L1198 426ZM1112 563L1100 560L1105 589ZM1112 563L1150 582L1105 589ZM1155 608L1164 624L1124 635ZM1231 408L1203 402L1219 420ZM1226 466L1250 462L1227 482ZM1259 481L1250 462L1227 482ZM1235 496L1213 496L1236 508Z'/><path fill='#e1e1dc' stroke='#e1e1dc' stroke-width='.6' d='M1105 589L1155 608L1124 635ZM1184 720L1175 700L1142 736ZM1123 729L1095 769L1130 758ZM1298 487L1272 487L1279 505ZM1260 520L1265 540L1290 543ZM1245 768L1271 732L1280 771ZM1328 475L1313 466L1318 486ZM1313 564L1331 551L1333 592ZM1280 771L1271 732L1300 730Z'/><path fill='#dcdcd7' stroke='#dcdcd7' stroke-width='.6' d='M1089 676L1077 671L1112 669ZM1086 798L1095 769L1119 790ZM1298 487L1279 505L1295 511ZM1260 520L1279 505L1290 543ZM1181 603L1164 624L1207 626ZM1256 607L1218 629L1253 632ZM1277 698L1248 694L1271 732ZM1326 437L1313 466L1328 475ZM1298 487L1295 511L1314 508ZM1318 486L1298 487L1314 508ZM1377 606L1333 592L1343 609ZM1270 627L1304 601L1318 636ZM1300 730L1280 771L1312 740Z'/><path fill='#e6e6e1' stroke='#e6e6e1' stroke-width='.6' d='M1175 700L1194 702L1184 720ZM1066 735L1095 769L1123 729ZM1136 705L1123 729L1142 736ZM1235 496L1227 482L1213 496ZM1183 657L1207 626L1225 650ZM1278 681L1248 694L1277 698ZM1293 454L1298 487L1313 466ZM1313 466L1298 487L1318 486ZM1298 706L1271 732L1300 730Z'/><path fill='#c3c3be' stroke='#c3c3be' stroke-width='.6' d='M1176 770L1144 789L1181 797ZM1232 667L1255 668L1248 694ZM1278 681L1267 668L1248 694ZM1232 667L1211 678L1215 700ZM1225 750L1236 725L1245 768ZM1233 782L1207 774L1216 817ZM1260 860L1228 876L1240 895ZM1328 475L1348 462L1351 476ZM1356 493L1335 504L1342 527ZM1290 543L1288 556L1313 564Z'/><path fill='#d2d2c8' stroke='#d2d2c8' stroke-width='.6' d='M1194 848L1181 847L1191 869ZM1332 740L1357 724L1348 757Z'/><path fill='#bebeb4' stroke='#bebeb4' stroke-width='.6' d='M1172 889L1194 886L1198 899Z'/><path fill='#d2aaa5' stroke='#d2aaa5' stroke-width='.6' d='M1263 227L1274 201L1280 228ZM1263 227L1280 228L1261 247ZM1232 258L1243 245L1257 269ZM1232 258L1257 269L1237 276ZM1255 291L1257 269L1270 294Z'/><path fill='#695a55' stroke='#695a55' stroke-width='.6' d='M1244 225L1240 214L1222 234ZM1298 303L1282 306L1292 318ZM1280 279L1294 255L1306 281Z'/><path fill='#af918c' stroke='#af918c' stroke-width='.6' d='M1263 227L1243 245L1261 247Z'/><path fill='#c8a5a0' stroke='#c8a5a0' stroke-width='.6' d='M1261 247L1243 245L1257 269ZM1295 288L1280 279L1270 294ZM1295 288L1270 294L1282 306Z'/><path fill='#a09182' stroke='#a09182' stroke-width='.6' d='M1199 284L1173 299L1200 303ZM1200 303L1220 288L1223 315Z'/><path fill='#96877d' stroke='#96877d' stroke-width='.6' d='M1270 294L1282 306L1261 316ZM1260 327L1281 317L1291 335ZM1246 449L1277 448L1250 462ZM1292 318L1291 335L1313 324ZM1324 346L1304 362L1331 370ZM1288 359L1275 363L1301 374ZM1288 359L1304 362L1301 374ZM1293 454L1277 448L1302 439ZM1326 437L1302 439L1313 466Z'/><path fill='#9b877d' stroke='#9b877d' stroke-width='.6' d='M1255 291L1223 315L1261 316ZM1261 316L1282 306L1281 317ZM1261 316L1281 317L1260 327ZM1292 318L1281 317L1291 335Z'/><path fill='#9b8782' stroke='#9b8782' stroke-width='.6' d='M1235 342L1257 357L1250 376Z'/><path fill='#7d6964' stroke='#7d6964' stroke-width='.6' d='M1257 357L1275 363L1250 376ZM1250 376L1217 391L1231 408Z'/><path fill='#78645f' stroke='#78645f' stroke-width='.6' d='M1263 401L1274 385L1279 403Z'/><path fill='#f5f0f0' stroke='#f5f0f0' stroke-width='.6' d='M1235 437L1219 420L1210 442ZM1293 454L1277 448L1271 476ZM1271 476L1250 462L1259 481ZM1200 478L1215 463L1227 482ZM1179 544L1187 516L1206 540Z'/><path fill='#e1dcdc' stroke='#e1dcdc' stroke-width='.6' d='M1272 487L1279 505L1260 520ZM1235 591L1194 591L1207 626Z'/><path fill='#e6e1e1' stroke='#e6e1e1' stroke-width='.6' d='M1295 511L1279 505L1290 543ZM1232 532L1206 540L1223 573ZM1290 543L1295 511L1314 508Z'/><path fill='#d2cdcd' stroke='#d2cdcd' stroke-width='.6' d='M1202 567L1194 591L1223 573Z'/><path fill='#c8c3c3' stroke='#c8c3c3' stroke-width='.6' d='M1288 556L1265 540L1243 574ZM1288 556L1243 574L1256 607ZM1342 527L1314 508L1331 551Z'/><path fill='#c3bebe' stroke='#c3bebe' stroke-width='.6' d='M1223 573L1243 574L1235 591ZM1232 667L1248 694L1215 700Z'/><path fill='#dcd7d7' stroke='#dcd7d7' stroke-width='.6' d='M1218 629L1207 626L1225 650ZM1253 632L1270 627L1267 668ZM1184 720L1194 702L1215 735ZM1215 700L1194 702L1215 735ZM1326 437L1348 462L1328 475ZM1256 607L1288 556L1304 601Z'/><path fill='#cdcdc3' stroke='#cdcdc3' stroke-width='.6' d='M1260 860L1298 881L1279 899Z'/><path fill='#695f55' stroke='#695f55' stroke-width='.6' d='M1295 288L1280 279L1306 281Z'/><path fill='#645a50' stroke='#645a50' stroke-width='.6' d='M1295 288L1298 303L1306 281ZM1306 281L1298 303L1313 324Z'/><path fill='#918278' stroke='#918278' stroke-width='.6' d='M1292 318L1298 303L1313 324ZM1291 335L1313 324L1324 346ZM1291 335L1288 359L1304 362ZM1291 335L1324 346L1304 362ZM1331 370L1320 376L1333 395ZM1320 376L1301 374L1311 400ZM1333 395L1320 376L1311 400ZM1333 395L1311 400L1331 407ZM1331 407L1311 400L1321 414ZM1298 419L1321 414L1309 428ZM1298 419L1283 419L1302 439ZM1277 448L1283 419L1302 439ZM1293 454L1302 439L1313 466Z'/><path fill='#91827d' stroke='#91827d' stroke-width='.6' d='M1331 370L1304 362L1320 376Z'/><path fill='#96827d' stroke='#96827d' stroke-width='.6' d='M1304 362L1301 374L1320 376Z'/><path fill='#8c8278' stroke='#8c8278' stroke-width='.6' d='M1311 400L1298 419L1321 414Z'/><path fill='#877d73' stroke='#877d73' stroke-width='.6' d='M1331 407L1321 414L1331 420Z'/><path fill='#8c7d73' stroke='#8c7d73' stroke-width='.6' d='M1331 420L1321 414L1309 428ZM1331 407L1331 420L1339 429ZM1309 428L1331 420L1326 437ZM1331 420L1339 429L1326 437ZM1326 437L1309 428L1302 439Z'/><path fill='#877873' stroke='#877873' stroke-width='.6' d='M1331 407L1333 395L1339 429Z'/><path fill='#8c7d78' stroke='#8c7d78' stroke-width='.6' d='M1309 428L1298 419L1302 439Z'/><path fill='#82786e' stroke='#82786e' stroke-width='.6' d='M1326 437L1339 429L1348 462Z'/><path fill='#f5f0e6' stroke='#f5f0e6' stroke-width='.6' d='M1385 524L1391 537L1359 560Z'/><path fill='#e6e6dc' stroke='#e6e6dc' stroke-width='.6' d='M1359 560L1391 583L1377 606Z'/><path fill='#b9bec8' stroke='#b9bec8' stroke-width='.6' d='M1395 856L1365 833L1344 862Z'/><path fill='#69737d' stroke='#69737d' stroke-width='.6' d='M1311 848L1344 862L1311 864ZM1485 863L1495 857L1507 882Z'/><path fill='#96a5b4' stroke='#96a5b4' stroke-width='.6' d='M1331 370L1333 395L1401 314Z'/><path fill='#9ba0af' stroke='#9ba0af' stroke-width='.6' d='M1356 493L1377 514L1400 486ZM1460 443L1426 461L1441 550ZM1400 486L1426 461L1441 550Z'/><g transform='translate(1165 405) scale(1.35) translate(-1165 -405)'><path fill='#3d332f' d='M1082 406L1099 390L1126 389L1143 402L1127 420L1100 419Z'/><path fill='#4f8fd0' d='M1086 406L1101 394L1125 393L1140 402L1113 406Z'/><path fill='#6fb0ea' d='M1086 406L1113 406L1140 402L1126 416Z'/><path fill='#3a73b4' d='M1101 394L1125 393L1113 406Z'/><path fill='#1c2230' d='M1108 396L1118 396L1119 409L1107 409Z'/><path fill='#fff' opacity='.9' d='M1101 398L1109 396L1105 403Z'/><path fill='#3d332f' d='M1248 406L1231 390L1204 389L1187 402L1203 420L1230 419Z'/><path fill='#4f8fd0' d='M1244 406L1229 394L1205 393L1190 402L1217 406Z'/><path fill='#6fb0ea' d='M1244 406L1217 406L1190 402L1204 416Z'/><path fill='#3a73b4' d='M1229 394L1205 393L1217 406Z'/><path fill='#1c2230' d='M1212 396L1222 396L1223 409L1211 409Z'/><path fill='#fff' opacity='.9' d='M1229 398L1221 396L1225 403Z'/></g><path fill='#e39aa0' d='M1149 457L1181 457L1165 475Z'/><path fill='#c97c83' d='M1149 457L1165 475L1161 461Z'/><path d='M1165 475V487M1165 487L1151 495M1165 487L1179 495' stroke='#9c8a86' stroke-width='3' fill='none' stroke-linecap='round'/><g stroke='#fff' stroke-width='1.6' opacity='.75' fill='none'><path d='M1125 477L975 455M1125 485L980 495M1205 477L1355 455M1205 485L1350 495'/></g>", '#8d99aa') },
    { name: '星雲', dir: '6.0-Deneb', file: 'nebula', css: svgWall(
      "<defs><radialGradient id='g' cx='.5' cy='.5' r='.8'><stop offset='0' stop-color='#1a0f2e'/><stop offset='1' stop-color='#05030b'/></radialGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='70'/></filter><filter id='t' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='26'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<g filter='url(#s)'><circle cx='620' cy='460' r='300' fill='#d6337a' opacity='.55'/><circle cx='960' cy='520' r='280' fill='#3d6bff' opacity='.5'/><circle cx='800' cy='330' r='200' fill='#ff9a3d' opacity='.35'/><circle cx='1120' cy='300' r='180' fill='#7a3dff' opacity='.4'/></g>" +
      "<g filter='url(#t)' opacity='.7'><path d='M420 620C560 480 700 560 820 440S1060 360 1180 470' stroke='#ffd6ec' stroke-width='40' fill='none'/><path d='M520 380C680 420 760 300 920 330' stroke='#bcd2ff' stroke-width='24' fill='none'/></g>" +
      stars(340, 1000, 47) + "<circle cx='860' cy='470' r='5' fill='#fff'/><circle cx='860' cy='470' r='26' fill='#fff' opacity='.18'/>", '#1a0f2e') },
    { name: '雪山', dir: '6.0-Deneb', file: 'snowy-mountains', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7fa7d8'/><stop offset='.55' stop-color='#d9e6f5'/><stop offset='1' stop-color='#f7f9fc'/></linearGradient>" +
      "<linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='.45' stop-color='#e6eef8'/><stop offset='1' stop-color='#9fb6d3'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='1240' cy='210' r='70' fill='#fffdf4' opacity='.9'/>" +
      "<path d='M0 640L260 420L420 520L640 260L860 520L1000 430L1220 600L1400 470L1600 580V1000H0Z' fill='url(#m)'/>" +
      "<path d='M640 260L590 330L620 320L560 410L640 360L700 400L680 330L720 350Z' fill='#fff'/><path d='M260 420L230 470L262 455L245 500L300 460Z' fill='#fff'/>" +
      "<path d='M640 260L860 520L760 470L700 520L660 420Z M260 420L420 520L360 500L320 540Z' fill='#7f97ba' opacity='.35'/>" +
      "<path d='M0 760L300 680L520 740L760 660L1000 740L1260 680L1600 760V1000H0Z' fill='#b9cbe2'/>" +
      "<path d='" + trees(800, 60, 13) + "' fill='#3c5a6e' opacity='.7'/>" +
      "<path d='M0 870L400 820L760 860L1120 810L1600 860V1000H0Z' fill='#f4f7fb'/>", '#d9e6f5') },
    // ---- htmlOS 7.0（Polaris）で追加
    { name: 'ポラリス（こぐま座）', dir: '7.0-Polaris', file: 'polaris', css: svgWall(
      "<defs><radialGradient id='g' cx='.3' cy='.22' r='1.05'><stop offset='0' stop-color='#1d2a5c'/><stop offset='.5' stop-color='#0b1233'/><stop offset='1' stop-color='#03050e'/></radialGradient>" +
      "<radialGradient id='p' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff'/><stop offset='.1' stop-color='#fff6e2'/><stop offset='.32' stop-color='#ffe2a6' stop-opacity='.55'/><stop offset='1' stop-color='#ffc56b' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='h' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1b2c55' stop-opacity='0'/><stop offset='1' stop-color='#2c4a7a' stop-opacity='.55'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><g fill='none' stroke-linecap='round'>" + trails(430, 210, 170, 71) + '</g>' + stars(160, 1000, 73) +
      "<g stroke='#dfe8ff' stroke-width='1.7' opacity='.5' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='M430 210L525 296L612 352L700 424L752 514L912 470L866 378L700 424'/></g>" +
      "<g fill='#f0f4ff'><circle cx='525' cy='296' r='3'/><circle cx='612' cy='352' r='3.2'/><circle cx='700' cy='424' r='3.4'/><circle cx='752' cy='514' r='3.2'/><circle cx='912' cy='470' r='4'/><circle cx='866' cy='378' r='4.4'/></g>" +
      "<circle cx='430' cy='210' r='140' fill='url(#p)'/><g stroke='#fff' stroke-linecap='round' opacity='.9'><path d='M430 140V280M360 210H500' stroke-width='2'/><path d='M395 175L465 245M465 175L395 245' stroke-width='1' opacity='.5'/></g><circle cx='430' cy='210' r='7.5' fill='#fff'/>" +
      "<rect y='700' width='1600' height='300' fill='url(#h)'/><path d='M0 880C200 840 380 870 560 850S900 800 1120 840S1440 830 1600 860V1000H0Z' fill='#050814'/>" +
      "<path d='M0 940C320 910 620 950 960 925S1400 905 1600 935V1000H0Z' fill='#020309'/>", '#0b1233') },
    { name: '富士山', dir: '7.0-Polaris', file: 'mt-fuji', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#25356e'/><stop offset='.38' stop-color='#9a6a9a'/><stop offset='.6' stop-color='#f3a487'/><stop offset='.72' stop-color='#ffd6a3'/><stop offset='.72' stop-color='#c99a9a'/><stop offset='1' stop-color='#3d4a7a'/></linearGradient>" +
      "<linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4a4f86'/><stop offset='1' stop-color='#232650'/></linearGradient>" +
      "<linearGradient id='sn' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ffe9e0'/><stop offset='.5' stop-color='#fff8f3'/><stop offset='1' stop-color='#c9c6e6'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='22'/></filter>" +
      "<path id='fj' d='M120 720C380 620 600 450 728 318L764 300L792 312L822 296L846 306L872 318C1000 450 1220 620 1480 720Z'/><clipPath id='c'><use href='#fj'/></clipPath></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(40, 250, 79) +
      "<circle cx='1430' cy='560' r='150' fill='#ffcf8f' opacity='.5' filter='url(#s)'/><circle cx='1430' cy='566' r='42' fill='#fff1d4'/>" +
      "<use href='#fj' fill='url(#m)'/><g clip-path='url(#c)'><path d='M600 300H1000V420L960 455L930 425L895 470L860 430L825 480L790 432L755 476L720 438L688 470L660 440L630 462L600 440Z' fill='url(#sn)'/>" +
      "<path d='M800 300L786 420M840 300L846 420M760 320L740 425M870 320L892 415' stroke='#7c7fb0' stroke-width='5' opacity='.35'/></g>" +
      "<g fill='#fff' opacity='.55' filter='url(#s)'><ellipse cx='300' cy='610' rx='260' ry='26'/><ellipse cx='1180' cy='560' rx='220' ry='20'/></g>" +
      "<g opacity='.33' transform='translate(0 1440) scale(1 -1)'><use href='#fj' fill='url(#m)'/><g clip-path='url(#c)'><path d='M600 300H1000V420L960 455L930 425L895 470L860 430L825 480L790 432L755 476L720 438L688 470L660 440L630 462L600 440Z' fill='#fff'/></g></g>" +
      "<g stroke='#fff' stroke-linecap='round' opacity='.35'><path d='M1340 740H1520M1370 772H1490M1400 805H1460' stroke-width='3'/></g>" +
      "<path d='" + trees(905, 70, 83) + "' fill='#141733'/>", '#9a6a9a') },
    { name: '紅葉', dir: '7.0-Polaris', file: 'momiji', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff3df'/><stop offset='.55' stop-color='#f9cf9b'/><stop offset='1' stop-color='#e8875a'/></linearGradient>" +
      "<path id='lf' d='" + MAPLE + "'/><filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='4'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<path d='M0 90C220 140 360 200 520 300S760 420 900 470M300 168C320 250 300 320 260 380M640 360C700 340 760 300 800 250' stroke='#5a2e22' stroke-width='14' fill='none' stroke-linecap='round' opacity='.8'/>" +
      scatter(80, 89, (x, y, r, a, o) => { const c = ['#d6342a', '#e85a1c', '#f29b1d', '#b8202b', '#f5c242'][Math.floor(o * 5)]; return "<use href='#lf' fill='" + c + "' opacity='" + (o * .5 + .5).toFixed(2) + "' transform='translate(" + x + ' ' + y + ') rotate(' + Math.round(a * 360) + ') scale(' + (r * 1.1 + .5).toFixed(2) + ")'" + (r < .2 ? " filter='url(#s)'" : '') + '/>'; }), '#f9cf9b') },
    { name: '青海波', dir: '7.0-Polaris', file: 'seigaiha', css: svgWall(
      "<defs><g id='w'>" + [60, 48, 36, 24, 12].map((R, i) => "<circle r='" + R + "' fill='" + (i % 2 ? '#f4f1e8' : '#1f3d73') + "' stroke='#f4f1e8' stroke-width='2.5'/>").join('') + '</g>' +
      "<linearGradient id='o' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0b1a3a' stop-opacity='0'/><stop offset='1' stop-color='#0b1a3a' stop-opacity='.45'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='#1f3d73'/>" + Array.from({ length: 36 }, (_, row) => Array.from({ length: 15 }, (_, k) => "<use href='#w' x='" + (k * 120 + (row % 2 ? 60 : 0)) + "' y='" + row * 30 + "'/>").join('')).join('') +
      "<rect width='1600' height='1000' fill='url(#o)'/><circle cx='1180' cy='300' r='120' fill='#d9443a'/>", '#1f3d73') },
    { name: '夜の街', dir: '7.0-Polaris', file: 'city-night', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#070b1e'/><stop offset='.6' stop-color='#1b1f4a'/><stop offset='1' stop-color='#5b3a6e'/></linearGradient>" +
      "<linearGradient id='r' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a2a5a'/><stop offset='1' stop-color='#05060f'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='30'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(90, 480, 97) + "<circle cx='300' cy='180' r='48' fill='#fff6e0'/><circle cx='320' cy='168' r='44' fill='#0d1230'/>" +
      "<rect y='560' width='1600' height='200' fill='#ff8fb0' opacity='.18' filter='url(#s)'/>" +
      city(780, 120, 300, '#1a1838', false, 101) + city(800, 60, 220, '#0f0e24', true, 103) +
      "<rect y='800' width='1600' height='200' fill='url(#r)'/><g opacity='.35'>" + scatter(60, 107, (x, y, r) => "<rect x='" + x + "' y='" + (810 + Math.round(y / 6)) + "' width='" + Math.round(10 + r * 40) + "' height='2' fill='#ffd88a'/>") + '</g>', '#1b1f4a') },
    // ---- htmlOS 7.1（Polaris）で追加。HTUi SDK 4 の Mars（火星）と、デスクトップ環境 HTUi 4 の RussianBlue（ロシアンブルー）ほか
    { name: '火星（Mars）', dir: '7.1-Polaris', file: 'mars', css: svgWall(
      "<defs><radialGradient id='g' cx='.72' cy='.5' r='.95'><stop offset='0' stop-color='#2a0f0a'/><stop offset='.5' stop-color='#110607'/><stop offset='1' stop-color='#030204'/></radialGradient>" +
      "<radialGradient id='p' cx='.36' cy='.34' r='.75'><stop offset='0' stop-color='#ffd2a8'/><stop offset='.3' stop-color='#e8834c'/><stop offset='.62' stop-color='#b5482a'/><stop offset='1' stop-color='#4a160c'/></radialGradient>" +
      "<radialGradient id='a' cx='.5' cy='.5' r='.5'><stop offset='.86' stop-color='#ff9a68' stop-opacity='0'/><stop offset='.92' stop-color='#ffb184' stop-opacity='.5'/><stop offset='1' stop-color='#ff7a4a' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='sh' x1='0' y1='0' x2='1' y2='.45'><stop offset='.4' stop-color='#000' stop-opacity='0'/><stop offset='.8' stop-color='#000' stop-opacity='.88'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='9'/></filter><filter id='v'><feGaussianBlur stdDeviation='1.5'/></filter>" +
      "<clipPath id='c'><circle cx='1050' cy='520' r='340'/></clipPath></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(110, 1000, 113) +
      "<circle cx='1050' cy='520' r='390' fill='#ff6a3a' opacity='.22' filter='url(#s)'/><circle cx='1050' cy='520' r='340' fill='url(#p)'/>" +
      "<g clip-path='url(#c)'><g fill='#5e1f10' opacity='.42' filter='url(#b)'><path d='M760 470C820 420 900 440 950 500S1020 640 960 690S820 640 790 580S720 510 760 470Z'/><path d='M1120 330C1200 300 1300 330 1330 380S1280 450 1210 440S1060 370 1120 330Z'/><path d='M1080 720C1160 690 1260 720 1290 770S1200 850 1120 830S1010 750 1080 720Z'/></g>" +
      "<path d='M860 556C930 548 990 562 1050 552S1150 546 1220 560' fill='none' stroke='#5a1c0e' stroke-width='6' stroke-linecap='round' opacity='.45' filter='url(#v)'/>" +
      "<path d='M870 563C940 556 1000 569 1060 560S1150 555 1210 567' fill='none' stroke='#ffc79a' stroke-width='1.5' opacity='.25'/>" +
      scatter(140, 127, (x, y, r) => { const dx = x - 1050, dy = y - 520; if (dx * dx + dy * dy > 320 * 320) return ''; const R = (r * r * 22 + 3).toFixed(1); return "<circle cx='" + x + "' cy='" + y + "' r='" + R + "' fill='#7a2a14' opacity='.28'/><circle cx='" + (x - 1) + "' cy='" + (y - 1) + "' r='" + R + "' fill='none' stroke='#ffd0a8' stroke-width='1.2' opacity='.3'/>"; }) +
      "<ellipse cx='1030' cy='196' rx='150' ry='42' fill='#fffaf4' opacity='.9' filter='url(#b)'/><ellipse cx='1030' cy='192' rx='96' ry='22' fill='#fff'/></g>" +
      "<circle cx='1050' cy='520' r='340' fill='url(#sh)'/><circle cx='1050' cy='520' r='372' fill='url(#a)'/>" +
      "<g fill='#9b8a7c'><path d='M470 296C482 284 506 286 514 298S510 322 494 324S458 310 470 296Z'/><circle cx='300' cy='740' r='7' fill='#b3a294'/></g>" +
      "<path d='M470 296C482 284 506 286 514 298' fill='none' stroke='#e6d6c6' stroke-width='2' opacity='.6'/>", '#110607') },
    { name: 'ロシアンブルー（ローポリ）', dir: '7.1-Polaris', file: 'russian-blue', css: svgWall("<path fill='#e1e1e7' stroke='#e1e1e7' stroke-width='.6' d='M400 0L457 50L414 88ZM173 77L163 188L45 173ZM1558 298L1600 200L1600 400ZM163 188L286 261L174 282ZM1556 139L1502 59L1629 22ZM738 131L842 114L841 147ZM1286 179L1235 181L1234 169ZM1416 388L1413 385L1412 379ZM626 386L600 433L575 307Z'/><path fill='#e4e4e7' stroke='#e4e4e7' stroke-width='.6' d='M1400 0L1304 94L1200 0ZM85 38L45 173L0 0ZM1502 59L1600 0L1629 22ZM1304 94L1232 99L1200 0ZM738 131L675 81L800 0ZM738 131L837 190L836 193ZM1385 366L1381 363L1387 274ZM1229 113L1215 113L1232 99ZM805 329L723 298L808 298ZM723 298L595 175L738 131ZM1231 197L1235 181L1286 179ZM1413 385L1405 377L1412 379ZM500 433L480 362L600 433ZM974 164L938 158L935 156ZM1272 325L1266 319L1278 268ZM1160 153L1136 139L1196 126ZM855 92L842 104L844 81ZM974 164L959 168L952 166Z'/><path fill='#c9ae8a' stroke='#c9ae8a' stroke-width='.6' d='M1600 1000L1603 667L1629 22ZM193 504L100 433L200 433ZM517 731L482 597L621 608ZM268 641L193 504L301 485ZM313 693L370 789L241 845ZM1400 1000L1522 931L1600 1000ZM55 494L193 504L60 575ZM482 597L374 635L389 507ZM374 635L313 693L268 641ZM389 507L374 635L301 485ZM199 897L200 1000L69 905ZM309 918L199 897L241 845ZM1200 1000L1130 896L1164 872ZM598 750L750 636L754 743ZM600 938L755 967L600 1000ZM800 1000L755 967L809 914ZM1083 917L1096 913L1200 1000ZM1530 605L1511 601L1494 560ZM1589 485L1580 606L1494 560ZM474 516L482 597L389 507ZM474 516L577 466L482 597ZM1132 877L1139 875L1130 896ZM1376 872L1394 877L1354 954ZM762 542L697 520L763 536ZM474 516L500 433L577 466ZM794 438L787 453L700 433ZM1096 913L1101 906L1130 896ZM1556 836L1561 834L1593 900ZM1584 810L1592 787L1600 800ZM1584 816L1584 810L1600 800ZM1489 544L1486 533L1589 485ZM1449 871L1466 870L1522 931ZM802 862L804 870L701 849ZM1126 883L1132 877L1130 896ZM1472 493L1467 481L1477 466ZM1358 868L1376 872L1354 954ZM1580 606L1542 611L1530 605ZM1557 614L1542 611L1580 606ZM906 879L916 879L916 879Z'/><path fill='#c6ab8a' stroke='#c6ab8a' stroke-width='.6' d='M0 600L46 750L0 800ZM482 597L517 731L378 720ZM1042 931L1069 922L1000 1000Z'/><path fill='#d2b790' stroke='#d2b790' stroke-width='.6' d='M46 750L0 600L60 575ZM374 635L482 597L378 720ZM374 635L268 641L301 485ZM1600 433L1589 485L1500 433ZM697 520L577 466L600 433ZM761 578L697 520L760 572ZM697 520L761 595L621 608ZM300 433L400 433L301 485ZM787 453L780 468L700 433Z'/><path fill='#c0a884' stroke='#c0a884' stroke-width='.6' d='M0 800L69 905L0 1000ZM309 918L416 920L400 1000ZM857 894L889 888L800 1000Z'/><path fill='#e7e7ea' stroke='#e7e7ea' stroke-width='.6' d='M600 0L457 50L400 0ZM292 88L400 0L414 88ZM163 188L173 77L251 130ZM1406 88L1399 143L1304 94ZM87 371L174 282L200 433ZM355 202L466 143L403 236ZM806 369L802 392L802 361ZM1558 298L1505 290L1600 200ZM1503 131L1505 290L1399 143ZM1503 131L1406 88L1502 59ZM1406 88L1503 131L1399 143ZM163 188L78 278L45 173ZM600 0L604 20L457 50ZM803 354L806 369L802 361ZM1286 179L1399 143L1387 274ZM1286 179L1278 268L1234 217ZM1229 113L1232 99L1233 126ZM840 181L738 131L841 147ZM864 95L864 78L871 99ZM676 361L626 386L575 307ZM275 355L400 433L300 433ZM921 140L974 164L935 156ZM916 144L921 140L935 156ZM1132 165L1114 171L1136 139ZM1024 162L1008 163L1029 74Z'/><path fill='#dedee4' stroke='#dedee4' stroke-width='.6' d='M45 173L0 200L0 0ZM1600 400L1600 200L1629 22ZM173 77L85 38L200 0ZM844 81L738 131L800 0ZM275 355L300 433L200 433ZM893 122L889 118L920 71ZM840 181L837 190L738 131ZM921 140L916 144L909 138Z'/><path fill='#dbdbde' stroke='#dbdbde' stroke-width='.6' d='M292 88L200 0L400 0ZM200 0L85 38L0 0ZM0 400L87 371L100 433ZM466 143L355 202L414 88ZM78 278L87 371L0 400ZM87 371L78 278L174 282ZM595 175L604 20L675 81ZM1278 268L1286 179L1387 274ZM1286 179L1234 169L1234 159ZM1503 131L1556 139L1505 290ZM1362 353L1358 352L1387 274ZM1412 379L1405 377L1387 274ZM1278 268L1232 253L1234 217ZM864 78L855 92L844 81ZM723 298L803 354L802 361ZM806 369L809 393L802 392ZM864 95L855 92L864 78ZM1058 163L1049 162L1029 74ZM808 406L805 414L802 392ZM794 438L700 433L802 392ZM1261 313L1255 307L1278 268ZM1266 319L1261 313L1278 268ZM1286 339L1272 325L1309 343ZM480 362L400 433L403 236ZM921 140L893 122L920 71Z'/><path fill='#e1e1e4' stroke='#e1e1e4' stroke-width='.6' d='M1600 0L1502 59L1400 0ZM85 38L173 77L45 173ZM0 400L100 433L0 433ZM1500 433L1558 298L1600 400ZM1558 298L1500 433L1505 290ZM1505 290L1412 379L1387 274ZM286 261L163 188L251 130ZM604 20L466 143L457 50ZM738 131L595 175L675 81ZM1286 179L1233 126L1304 94ZM1505 290L1556 139L1600 200ZM1600 200L1556 139L1629 22ZM1556 139L1503 131L1502 59ZM1136 139L1084 167L1137 78ZM802 392L676 361L802 361ZM1448 433L1442 426L1500 433ZM1322 346L1278 268L1387 274ZM1232 253L1229 221L1234 217ZM1232 255L1232 253L1278 268ZM480 362L485 239L575 307ZM1416 388L1412 379L1430 406ZM1272 325L1278 268L1309 343ZM805 414L794 438L802 392ZM938 158L974 164L952 166ZM1083 167L1058 163L1029 74ZM400 433L275 355L403 236Z'/><path fill='#e4e4ea' stroke='#e4e4ea' stroke-width='.6' d='M1233 126L1232 99L1304 94ZM355 202L292 88L414 88ZM78 278L0 400L0 200ZM1234 153L1286 179L1234 159ZM286 261L275 355L174 282ZM1244 291L1232 255L1278 268ZM723 298L805 329L803 354ZM723 298L812 278L808 298ZM723 298L738 131L826 235ZM1600 433L1600 400L1629 22ZM1255 307L1244 291L1278 268Z'/><path fill='#dbdbe1' stroke='#dbdbe1' stroke-width='.6' d='M1000 0L920 71L800 0ZM292 88L173 77L200 0ZM1137 78L1000 0L1200 0ZM100 433L87 371L200 433ZM78 278L0 200L45 173ZM78 278L163 188L174 282ZM1381 363L1371 358L1387 274ZM920 71L864 78L800 0ZM595 175L723 298L575 307ZM723 298L676 361L575 307ZM600 433L480 362L575 307ZM842 104L738 131L844 81ZM1084 167L1083 167L1137 78ZM1083 167L1029 74L1137 78ZM1121 175L1114 171L1132 165ZM1008 163L997 162L1029 74Z'/><path fill='#d2b490' stroke='#d2b490' stroke-width='.6' d='M46 750L70 817L0 800ZM1448 433L1500 433L1477 466ZM482 597L577 466L621 608ZM750 636L765 650L766 660ZM791 768L793 776L754 743ZM1542 611L1532 608L1530 605Z'/><path fill='#c6ab87' stroke='#c6ab87' stroke-width='.6' d='M70 817L69 905L0 800ZM194 714L70 817L46 750ZM1522 931L1593 900L1600 1000ZM159 617L194 714L46 750ZM193 504L159 617L60 575ZM200 1000L309 918L400 1000ZM69 905L200 1000L0 1000ZM598 750L517 731L621 608ZM517 731L467 828L378 720ZM467 828L370 789L378 720ZM590 796L467 828L517 731ZM1539 852L1593 900L1522 931ZM1277 903L1267 860L1285 859ZM1580 606L1530 605L1494 560ZM1539 852L1556 836L1593 900ZM1584 816L1600 800L1593 900ZM763 643L750 636L770 637ZM763 643L765 650L750 636ZM793 776L796 785L754 743ZM1226 864L1277 903L1217 864ZM1226 864L1231 863L1277 903ZM1308 861L1322 864L1277 903ZM1277 903L1322 864L1354 954ZM799 801L802 812L701 849ZM1352 867L1358 868L1354 954Z'/><path fill='#e7e7ed' stroke='#e7e7ed' stroke-width='.6' d='M675 81L600 0L800 0ZM1399 143L1505 290L1387 274ZM457 50L466 143L414 88ZM1029 74L920 71L1000 0ZM803 354L805 329L805 330ZM485 239L595 175L575 307ZM595 175L485 239L466 143ZM604 20L595 175L466 143ZM812 278L809 296L808 298ZM1278 268L1322 346L1309 343ZM1371 358L1362 353L1387 274ZM889 118L870 100L871 99ZM1049 162L1024 162L1029 74ZM676 361L723 298L802 361ZM723 298L817 266L812 278ZM1603 667L1600 433L1629 22ZM809 393L808 406L802 392ZM500 433L400 433L480 362ZM893 122L921 140L909 138ZM1136 139L1114 171L1084 167ZM997 162L974 164L1029 74ZM1001 164L997 162L1008 163Z'/><path fill='#dedee1' stroke='#dedee1' stroke-width='.6' d='M292 88L355 202L251 130ZM173 77L292 88L251 130ZM1400 0L1406 88L1304 94ZM1502 59L1406 88L1400 0ZM355 202L286 261L251 130ZM286 261L355 202L403 236ZM1137 78L1029 74L1000 0ZM833 208L738 131L836 193ZM1399 143L1286 179L1304 94ZM1286 179L1234 153L1233 126ZM1234 153L1231 129L1233 126ZM871 99L864 78L920 71ZM864 78L844 81L800 0ZM889 118L871 99L920 71ZM1405 377L1385 366L1387 274ZM1231 197L1286 179L1234 217ZM1600 433L1500 433L1600 400ZM870 100L864 95L871 99ZM700 433L626 386L676 361ZM1029 74L974 164L920 71ZM1160 153L1132 165L1136 139ZM842 104L842 114L738 131ZM1058 163L1051 162L1049 162ZM974 164L921 140L920 71Z'/><path fill='#eaeaed' stroke='#eaeaed' stroke-width='.6' d='M1232 99L1137 78L1200 0ZM1505 290L1500 433L1430 406ZM1412 379L1505 290L1430 406ZM675 81L604 20L600 0ZM1215 113L1137 78L1232 99ZM1215 113L1196 126L1137 78ZM466 143L485 239L403 236ZM738 131L833 208L826 235ZM1358 352L1334 347L1387 274ZM174 282L275 355L200 433ZM275 355L286 261L403 236ZM1196 126L1136 139L1137 78ZM1500 433L1442 426L1430 406ZM1334 347L1322 346L1387 274ZM817 266L723 298L826 235ZM700 433L676 361L802 392ZM485 239L480 362L403 236ZM626 386L700 433L600 433Z'/><path fill='#cfb48d' stroke='#cfb48d' stroke-width='.6' d='M600 1000L400 1000L518 938ZM139 850L194 714L241 845ZM590 796L598 750L701 849ZM467 828L416 920L370 789ZM1096 913L1130 896L1200 1000ZM772 691L775 703L754 743ZM1405 875L1400 1000L1354 954ZM1577 819L1584 816L1593 900ZM1469 869L1488 864L1522 931ZM761 578L763 590L761 595ZM697 520L700 433L771 505ZM1561 834L1577 819L1593 900ZM808 884L804 870L808 881ZM889 888L970 905L1000 1000ZM1585 619L1560 614L1580 606ZM1600 623L1585 619L1600 600ZM988 924L1012 948L1000 1000ZM988 924L1015 928L1012 948Z'/><path fill='#cfb490' stroke='#cfb490' stroke-width='.6' d='M193 504L200 433L301 485ZM159 617L268 641L194 714ZM139 850L70 817L194 714ZM370 789L313 693L378 720ZM1600 800L1603 667L1600 1000ZM199 897L139 850L241 845ZM755 967L600 938L701 849ZM750 636L771 686L754 743ZM788 752L754 743L781 722ZM788 752L790 758L754 743ZM790 758L791 768L754 743ZM1130 896L1139 875L1164 872ZM1484 523L1472 493L1477 466ZM1489 544L1589 485L1494 560ZM1600 600L1600 433L1603 667ZM697 520L767 521L763 536ZM1286 859L1277 903L1285 859ZM400 433L474 516L389 507ZM1122 882L1126 883L1130 896ZM802 812L799 848L701 849ZM916 879L970 905L889 888Z'/><path fill='#c9b18a' stroke='#c9b18a' stroke-width='.6' d='M200 433L300 433L301 485ZM771 686L750 636L766 660ZM1467 481L1465 477L1477 466Z'/><path fill='#ccb18d' stroke='#ccb18d' stroke-width='.6' d='M194 714L313 693L241 845ZM268 641L313 693L194 714ZM268 641L159 617L193 504ZM370 789L309 918L241 845ZM370 789L416 920L309 918ZM590 796L600 938L518 938ZM600 938L590 796L701 849ZM193 504L55 494L100 433ZM100 433L55 494L0 433ZM0 600L55 494L60 575ZM598 750L590 796L517 731ZM598 750L754 743L701 849ZM200 1000L199 897L309 918ZM416 920L467 828L518 938ZM761 595L758 615L621 608ZM750 636L598 750L621 608ZM758 615L750 636L621 608ZM770 637L750 636L758 615ZM755 967L800 1000L600 1000ZM1488 864L1503 861L1522 931ZM1400 1000L1430 874L1522 931ZM754 743L796 785L701 849ZM1541 848L1539 852L1535 851ZM754 743L775 703L781 722ZM771 686L772 691L754 743ZM1500 433L1589 485L1477 466ZM1217 864L1277 903L1200 1000ZM1200 1000L1277 903L1354 954ZM1580 606L1589 485L1600 600ZM844 897L800 1000L809 914ZM1589 485L1600 433L1600 600ZM1179 868L1200 1000L1164 872ZM1179 868L1196 866L1200 1000ZM1277 903L1231 863L1256 862ZM799 848L802 862L701 849ZM577 466L697 520L621 608ZM697 520L762 542L760 572ZM700 433L697 520L600 433ZM697 520L761 578L761 595ZM577 466L500 433L600 433ZM1101 906L1107 900L1130 896ZM1589 485L1486 533L1484 523ZM1286 859L1308 861L1277 903ZM808 884L832 893L809 914ZM804 870L808 884L701 849ZM879 888L889 888L857 894ZM400 433L500 433L474 516ZM1560 614L1557 614L1580 606ZM970 905L988 924L1000 1000ZM1460 463L1448 435L1477 466ZM1465 477L1460 463L1477 466ZM985 919L988 924L982 916ZM1015 928L1021 926L1012 948ZM957 882L923 876L943 870ZM923 876L961 888L916 879Z'/><path fill='#c3ab87' stroke='#c3ab87' stroke-width='.6' d='M159 617L46 750L60 575ZM313 693L374 635L378 720ZM1069 922L1083 917L1200 1000ZM1267 860L1277 903L1256 862ZM800 1000L889 888L1000 1000ZM755 967L808 884L809 914ZM1165 869L1179 868L1164 872ZM1466 870L1469 869L1522 931ZM832 893L844 897L809 914ZM1012 948L1042 931L1000 1000ZM961 888L923 876L957 882Z'/><path fill='#c6ae8a' stroke='#c6ae8a' stroke-width='.6' d='M70 817L139 850L69 905ZM600 938L600 1000L518 938ZM844 897L857 894L800 1000ZM1394 877L1405 875L1354 954ZM808 884L755 967L701 849ZM1585 619L1580 606L1600 600ZM988 924L970 905L982 916ZM700 433L780 468L771 505ZM1021 926L1042 931L1012 948Z'/><path fill='#c3a887' stroke='#c3a887' stroke-width='.6' d='M400 1000L416 920L518 938ZM1400 1000L1200 1000L1354 954ZM467 828L590 796L518 938ZM1069 922L1200 1000L1000 1000ZM796 785L799 801L701 849ZM1503 861L1539 852L1522 931ZM1196 866L1217 864L1200 1000ZM1405 875L1430 874L1400 1000ZM1107 900L1122 882L1130 896ZM1322 864L1333 864L1354 954ZM906 879L916 879L889 888ZM916 879L961 888L970 905Z'/><path fill='#7b8499' stroke='#7b8499' stroke-width='.6' d='M771 505L777 495L807 502ZM806 369L803 354L830 333ZM1229 221L1186 217L1200 188ZM831 382L806 369L830 333ZM1285 660L1249 660L1265 635ZM824 455L806 446L838 435ZM961 242L979 263L962 257ZM1171 186L1184 171L1200 188ZM1195 283L1168 300L1175 279ZM1283 770L1293 763L1280 778ZM1349 712L1349 737L1313 743ZM1417 544L1395 527L1417 518ZM1060 226L1030 257L1036 225ZM1058 306L1048 327L1045 323ZM1321 399L1344 383L1335 415ZM1202 400L1200 433L1163 411ZM1141 557L1147 547L1170 567ZM1213 749L1222 729L1231 766ZM1317 630L1321 645L1285 660ZM832 893L832 872L844 897ZM769 576L779 567L812 589ZM781 469L787 453L806 456ZM781 469L806 456L814 490ZM848 440L834 458L838 435ZM905 734L907 739L903 752ZM889 397L880 393L904 379ZM880 393L867 376L904 379ZM1459 466L1417 483L1431 444ZM1209 517L1201 508L1231 510ZM1183 692L1179 693L1159 666ZM1542 611L1557 614L1558 624ZM873 875L849 846L868 841ZM1149 814L1175 809L1171 850ZM1113 605L1131 620L1099 619ZM1127 596L1131 620L1119 599ZM1128 384L1147 369L1163 411ZM874 720L854 709L874 713ZM1056 832L1085 867L1043 862ZM1056 832L1032 855L1049 820ZM1015 928L1015 926L1021 926ZM994 199L999 222L976 217ZM974 164L991 190L964 188ZM849 732L854 709L874 720ZM1057 822L1056 832L1049 820ZM907 739L923 742L903 752ZM951 784L952 778L970 779ZM1057 822L1085 836L1056 832Z'/><path fill='#758193' stroke='#758193' stroke-width='.6' d='M777 495L814 490L807 502ZM818 291L830 333L808 298ZM1231 129L1221 122L1233 126ZM882 154L883 170L841 147ZM1218 115L1229 113L1221 122ZM1202 158L1202 146L1234 153ZM869 312L876 337L851 316ZM1191 520L1197 567L1172 526ZM1197 567L1191 520L1219 530ZM1349 712L1313 743L1340 701ZM1095 204L1089 234L1070 211ZM834 673L811 675L834 665ZM805 414L808 406L810 412ZM1114 669L1085 676L1081 638ZM939 277L936 251L962 257ZM1103 277L1125 278L1126 290ZM1173 860L1165 869L1171 850ZM1585 619L1561 631L1558 624ZM1095 204L1083 195L1094 191ZM781 469L814 490L777 495ZM968 675L956 695L954 691ZM921 659L911 647L922 651ZM1321 399L1316 411L1299 396ZM1329 433L1327 431L1335 415ZM1394 429L1400 433L1381 438ZM1198 386L1202 400L1185 387ZM1190 651L1159 634L1191 630ZM1159 634L1195 612L1191 630ZM1219 570L1211 582L1207 578ZM1198 502L1160 493L1199 472ZM1200 297L1199 298L1195 283ZM1198 664L1183 692L1159 666ZM1585 638L1600 623L1600 650ZM1107 197L1114 171L1121 175ZM849 846L842 827L868 841ZM819 870L832 893L808 884ZM886 886L879 888L873 875ZM805 557L823 548L830 571ZM906 433L905 428L933 421ZM1134 857L1165 869L1139 875ZM909 361L916 332L922 355ZM1460 463L1439 438L1448 435ZM1201 508L1200 503L1231 510ZM1279 621L1317 630L1285 660ZM1304 513L1291 523L1283 513ZM1279 472L1267 436L1298 454ZM1128 384L1144 420L1106 407ZM842 827L838 806L858 807ZM871 193L847 199L856 191ZM1135 835L1127 817L1131 820ZM1134 857L1135 835L1171 850ZM912 630L950 633L922 651ZM939 427L940 449L930 447ZM1432 598L1421 590L1434 571ZM863 699L854 709L843 683ZM780 557L786 545L805 557ZM1235 816L1241 810L1257 816ZM1015 926L1022 892L1021 926ZM924 590L918 593L899 583ZM871 615L879 634L838 635ZM986 195L977 201L964 188ZM1053 910L1041 929L1021 926ZM992 739L986 768L963 741ZM1044 764L1036 768L1021 728Z'/><path fill='#9099ab' stroke='#9099ab' stroke-width='.6' d='M830 333L851 316L845 334ZM1413 385L1416 388L1413 394ZM1051 359L1048 327L1059 349ZM1271 361L1259 394L1241 385ZM1288 599L1283 603L1245 589ZM1243 513L1292 528L1282 559ZM1100 433L1088 437L1100 428ZM1341 380L1344 383L1323 385ZM948 421L939 427L933 421ZM997 162L991 190L974 164Z'/><path fill='#c3a884' stroke='#c3a884' stroke-width='.6' d='M1593 900L1600 800L1600 1000ZM1430 874L1449 871L1522 931ZM1333 864L1352 867L1354 954Z'/><path fill='#d5b793' stroke='#d5b793' stroke-width='.6' d='M55 494L0 600L0 433ZM771 514L767 521L771 505ZM1448 435L1448 433L1477 466ZM1511 601L1503 596L1494 560ZM781 469L780 468L787 453ZM1459 466L1460 463L1465 477Z'/><path fill='#ccb18a' stroke='#ccb18a' stroke-width='.6' d='M139 850L199 897L69 905Z'/><path fill='#636f84' stroke='#636f84' stroke-width='.6' d='M1215 113L1221 122L1196 126ZM1495 707L1490 672L1526 700ZM1453 657L1490 672L1450 698ZM842 114L870 100L889 118ZM990 309L976 333L960 299ZM943 529L978 485L991 507ZM1439 438L1442 426L1448 433ZM1491 627L1518 630L1490 672ZM1420 742L1393 777L1374 725ZM1349 603L1341 545L1374 585ZM1107 327L1122 346L1119 350ZM890 126L842 114L889 118ZM834 458L863 459L838 477ZM794 438L806 446L800 450ZM1055 623L1016 579L1069 603ZM1103 277L1083 311L1098 275ZM1141 557L1129 594L1129 555ZM1469 869L1466 870L1456 867ZM1333 689L1357 702L1340 701ZM1172 155L1160 153L1196 126ZM1191 843L1199 838L1196 866ZM1552 738L1574 762L1532 764ZM1581 814L1584 810L1584 816ZM832 549L840 575L830 571ZM880 393L889 397L878 405ZM1074 265L1071 309L1054 280ZM1410 502L1387 483L1417 483ZM1387 483L1392 470L1417 483ZM1093 553L1096 515L1129 555ZM1222 863L1226 864L1217 864ZM1149 814L1127 817L1122 781ZM1460 841L1484 815L1494 839ZM899 583L904 615L879 620ZM1135 687L1104 679L1114 669ZM988 587L992 556L1016 579ZM1199 838L1227 850L1217 864ZM904 615L918 593L932 608ZM879 634L912 630L911 647ZM904 615L912 630L879 634ZM988 634L988 587L1033 632ZM839 775L889 769L858 807ZM924 590L953 584L939 610ZM959 661L988 634L988 658ZM871 615L881 580L879 620ZM1035 804L1055 771L1068 809ZM1055 771L1036 768L1044 764ZM960 744L953 751L952 746Z'/><path fill='#636c81' stroke='#636c81' stroke-width='.6' d='M1179 236L1200 235L1196 243ZM1186 217L1179 236L1185 215ZM814 490L811 511L807 502ZM1539 852L1503 861L1535 851ZM1600 800L1592 787L1597 766ZM1059 731L1052 725L1072 698ZM1194 155L1172 155L1196 126ZM1490 672L1495 707L1450 698ZM1380 694L1422 699L1374 725ZM1404 600L1422 608L1384 640ZM1561 631L1580 636L1560 676ZM1495 707L1532 726L1486 724ZM1158 276L1179 236L1175 279ZM844 239L878 222L852 244ZM878 222L869 254L852 244ZM1122 781L1137 735L1156 783ZM1503 860L1503 861L1488 864ZM834 673L839 658L847 655ZM905 734L878 729L889 705ZM943 529L915 490L958 471ZM964 219L961 242L936 251ZM952 166L956 200L913 196ZM964 188L956 200L952 166ZM1166 448L1152 458L1160 445ZM1158 423L1166 448L1160 445ZM1271 853L1267 860L1256 862ZM1386 839L1347 851L1376 815ZM1498 774L1458 777L1486 724ZM1358 729L1349 712L1374 725ZM1357 702L1349 712L1340 701ZM1077 255L1085 241L1098 275ZM916 144L891 158L909 138ZM891 158L916 144L919 164ZM893 122L890 126L889 118ZM890 126L882 154L841 147ZM787 453L794 438L800 450ZM1600 758L1591 735L1600 731ZM1574 762L1591 735L1600 758ZM1000 433L987 417L1000 419ZM1095 355L1083 311L1107 327ZM1142 518L1147 547L1129 555ZM1147 547L1141 557L1129 555ZM1083 591L1113 605L1099 619ZM1119 599L1093 553L1129 555ZM1209 262L1195 283L1175 279ZM1357 702L1333 689L1346 663ZM1132 165L1160 153L1171 186ZM1122 346L1141 315L1146 317ZM1107 197L1121 175L1132 194ZM1074 265L1077 255L1098 275ZM864 95L842 104L855 92ZM796 785L806 798L799 801ZM900 433L910 452L891 451ZM1581 814L1577 819L1551 804ZM1424 799L1460 841L1415 852ZM911 647L890 668L879 658ZM1016 579L992 556L1017 548ZM1132 658L1135 687L1114 669ZM1135 687L1132 658L1159 666ZM1061 649L1033 632L1055 623ZM953 584L963 624L939 610ZM890 668L886 669L879 658ZM1083 311L1071 309L1098 275ZM1018 387L1035 404L1023 400ZM1096 515L1047 515L1062 484ZM1428 619L1456 597L1454 634ZM1322 620L1314 603L1349 603ZM1600 650L1600 623L1603 667ZM1329 433L1316 484L1298 454ZM802 812L811 821L799 848ZM835 805L806 798L839 775ZM842 206L847 199L878 222ZM837 190L847 199L836 193ZM1127 817L1107 813L1122 781ZM1458 777L1484 815L1449 796ZM904 615L879 634L879 620ZM1101 724L1127 725L1137 735ZM1063 747L1101 724L1082 764ZM1033 632L988 587L1016 579ZM977 201L976 217L964 219ZM1000 433L1025 434L1020 446ZM990 437L1000 433L986 449ZM1389 472L1392 470L1387 483ZM1200 503L1201 508L1198 502ZM1393 777L1346 771L1357 749ZM810 727L810 760L792 744ZM810 760L806 798L796 785ZM790 721L804 710L792 724ZM871 193L856 191L883 170ZM914 511L875 530L875 490ZM875 530L832 549L853 511ZM988 634L1002 655L988 658ZM915 490L940 449L958 471ZM930 447L940 449L915 490ZM1456 597L1432 598L1459 586ZM889 769L878 729L903 752ZM1185 811L1201 800L1200 815ZM1107 813L1068 809L1082 764ZM932 608L924 590L939 610ZM1044 661L1010 647L1033 632ZM844 748L849 732L878 729ZM881 580L870 558L899 583ZM917 833L915 800L953 797ZM915 800L951 784L953 797ZM994 795L953 797L970 779ZM1011 761L989 780L988 767ZM994 795L1028 771L1035 804ZM1028 771L1036 768L1035 804Z'/><path fill='#666f84' stroke='#666f84' stroke-width='.6' d='M1175 279L1179 236L1196 243ZM1030 523L1017 548L991 507ZM1358 729L1374 725L1357 749ZM1555 703L1560 676L1596 706ZM809 296L818 291L808 298ZM891 451L915 490L875 490ZM806 446L806 456L800 450ZM817 266L839 248L853 259ZM1600 758L1600 731L1603 667ZM960 299L976 333L956 347ZM1001 488L1030 523L991 507ZM1495 707L1486 724L1450 698ZM1357 702L1380 694L1374 725ZM1376 654L1380 694L1346 663ZM1432 652L1376 654L1384 640ZM1371 620L1404 600L1384 640ZM1560 676L1600 650L1603 667ZM1532 726L1495 707L1526 700ZM1600 731L1600 704L1603 667ZM1600 704L1600 677L1603 667ZM1363 446L1354 479L1348 478ZM883 170L840 181L841 147ZM918 238L878 222L913 196ZM1521 814L1556 836L1535 846ZM1052 725L1030 692L1072 698ZM927 706L905 734L889 705ZM967 291L990 309L960 299ZM918 261L918 238L924 260ZM956 200L964 219L918 238ZM1267 860L1271 853L1285 859ZM1491 627L1503 596L1511 601ZM1374 725L1393 777L1357 749ZM1375 651L1346 663L1340 629ZM1375 651L1376 654L1346 663ZM1490 672L1529 660L1526 700ZM1131 221L1137 274L1123 270ZM1158 276L1137 274L1179 236ZM1137 274L1131 221L1179 236ZM935 156L938 158L919 164ZM882 154L890 126L909 138ZM842 114L890 126L841 147ZM842 206L833 208L836 193ZM1149 814L1122 781L1156 783ZM1065 671L1078 677L1072 698ZM1085 676L1094 698L1078 677ZM943 529L914 511L915 490ZM912 293L939 277L960 299ZM1107 327L1083 311L1126 290ZM1158 536L1142 518L1172 526ZM1209 262L1175 279L1196 243ZM1213 749L1195 746L1222 729ZM1431 873L1430 874L1415 852ZM1466 870L1449 871L1456 867ZM1286 859L1320 815L1319 852ZM1286 859L1274 806L1320 815ZM1333 689L1327 663L1346 663ZM863 459L848 440L891 451ZM1581 814L1584 816L1577 819ZM1460 841L1494 839L1488 864ZM911 647L921 659L890 668ZM850 405L880 393L878 405ZM915 282L939 277L912 293ZM1026 429L1000 433L1000 419ZM1300 438L1327 431L1329 433ZM1300 433L1327 431L1300 438ZM1349 603L1310 583L1341 545ZM1096 515L1142 518L1129 555ZM1142 518L1160 493L1173 510ZM1195 746L1202 711L1222 729ZM1324 772L1351 796L1320 815ZM1322 864L1308 861L1319 852ZM1358 868L1376 871L1376 872ZM1381 528L1388 553L1375 554ZM1304 513L1316 484L1340 523ZM1316 484L1329 433L1348 478ZM847 199L842 206L836 193ZM1201 800L1212 758L1231 766ZM879 634L879 658L847 655ZM1104 679L1120 710L1094 698ZM1122 781L1101 724L1137 735ZM956 695L984 698L986 720ZM916 332L912 293L921 332ZM977 201L956 200L964 188ZM1152 458L1135 442L1160 445ZM1383 490L1387 483L1410 502ZM1160 493L1123 489L1151 478ZM1333 864L1323 863L1319 852ZM1323 863L1322 864L1319 852ZM1322 864L1323 863L1333 864ZM838 806L839 775L858 807ZM792 744L810 760L790 758ZM810 760L844 748L839 775ZM793 776L810 760L796 785ZM806 798L810 760L839 775ZM888 802L869 811L858 807ZM878 222L871 193L913 196ZM1101 724L1103 723L1127 725ZM1125 716L1103 723L1120 710ZM1120 710L1103 723L1094 698ZM988 658L1002 655L1012 668ZM1090 460L1099 490L1062 484ZM1432 598L1428 619L1422 608ZM816 716L830 726L810 727ZM870 558L840 575L832 549ZM875 530L870 558L832 549ZM917 833L953 797L962 834ZM889 769L904 769L888 802ZM870 558L860 590L840 575ZM951 784L931 754L952 778ZM987 832L983 837L962 834ZM1063 747L1055 771L1059 746ZM1055 771L1044 764L1059 746Z'/><path fill='#8d99ab' stroke='#8d99ab' stroke-width='.6' d='M830 333L818 291L851 316ZM1249 660L1227 661L1236 630ZM1085 381L1079 400L1066 372ZM923 402L917 379L944 378ZM955 359L959 360L944 378ZM1013 382L997 381L997 378ZM763 590L777 610L761 595ZM790 650L771 666L766 660ZM1092 408L1085 381L1106 407ZM1226 415L1230 394L1260 415ZM1213 617L1195 612L1211 582ZM1283 603L1272 622L1245 589ZM1205 702L1183 692L1198 664ZM1122 882L1134 857L1132 877ZM883 323L888 325L876 337ZM762 542L780 557L760 572ZM948 421L953 403L961 413ZM1273 481L1287 500L1249 497ZM1147 369L1130 375L1137 352ZM786 545L780 557L762 542Z'/><path fill='#818a9f' stroke='#818a9f' stroke-width='.6' d='M830 333L803 354L805 330ZM1238 682L1249 700L1224 697ZM1210 440L1212 456L1195 436ZM1315 699L1287 725L1279 696ZM1030 257L1060 226L1064 267ZM1129 429L1104 419L1106 407ZM1067 460L1054 447L1072 443ZM1112 368L1095 355L1119 350ZM1048 327L1058 306L1062 331ZM1437 428L1439 438L1431 444ZM1309 374L1323 385L1299 396ZM1165 869L1173 860L1179 868ZM1271 778L1245 770L1244 765ZM1319 675L1321 645L1327 663ZM1395 527L1381 528L1379 517ZM894 347L867 376L878 341ZM867 376L894 347L904 379ZM1065 370L1052 363L1059 349ZM1018 387L1052 363L1035 404ZM1288 599L1310 583L1313 602ZM1282 559L1308 541L1308 561ZM1212 279L1200 297L1195 283ZM1205 702L1202 711L1190 700ZM1147 369L1176 373L1163 411ZM849 846L873 875L832 872ZM829 624L824 615L848 600ZM1085 676L1066 647L1081 638ZM1051 455L1025 434L1054 447ZM1250 458L1248 433L1267 436ZM1279 385L1271 361L1292 366ZM1259 394L1279 385L1272 411ZM1304 527L1291 523L1304 513ZM835 805L838 806L838 825ZM816 523L807 525L811 511ZM977 201L994 199L976 217ZM807 525L786 545L781 531ZM1101 906L1068 891L1107 900ZM923 742L907 739L905 734ZM990 831L993 869L983 837ZM1085 836L1087 826L1105 824ZM983 889L990 898L970 905Z'/><path fill='#818da2' stroke='#818da2' stroke-width='.6' d='M830 333L805 329L808 298ZM1202 158L1234 169L1200 188ZM810 412L838 435L800 433ZM798 695L775 703L772 691ZM1114 669L1081 638L1099 619ZM955 359L922 355L956 347ZM979 263L1030 257L1017 297ZM1020 229L1030 257L1013 232ZM1030 257L1020 229L1036 225ZM1363 446L1371 422L1381 438ZM1349 737L1358 729L1357 749ZM1194 155L1202 146L1202 158ZM1168 300L1146 317L1140 302ZM1166 448L1158 423L1195 436ZM1462 523L1417 544L1417 518ZM1200 433L1210 440L1195 436ZM1341 434L1371 422L1363 446ZM1295 433L1300 438L1298 454ZM1283 770L1244 765L1250 727ZM1246 668L1249 660L1285 660ZM1166 340L1146 317L1168 300ZM1137 352L1122 346L1146 317ZM1060 226L1077 255L1064 267ZM832 872L873 875L857 894ZM806 456L787 453L800 450ZM831 382L867 376L843 392ZM1195 283L1199 298L1168 300ZM1220 273L1209 262L1232 255ZM1292 366L1309 374L1290 393ZM1287 725L1279 723L1279 696ZM1279 723L1283 770L1250 727ZM1249 497L1247 498L1237 485ZM1107 197L1095 204L1094 191ZM840 575L812 589L830 571ZM840 575L848 600L812 589ZM894 347L909 361L904 379ZM852 347L830 333L845 334ZM939 277L915 282L924 260ZM976 217L999 227L961 242ZM959 168L964 188L952 166ZM1410 502L1455 495L1417 518ZM1417 483L1459 466L1455 495ZM1230 394L1226 415L1223 407ZM1243 436L1250 458L1212 456ZM1259 394L1272 411L1260 415ZM1190 651L1191 630L1213 654ZM1159 634L1190 651L1159 666ZM1197 567L1219 570L1207 578ZM1226 623L1229 626L1213 654ZM1222 729L1202 711L1224 697ZM1260 475L1249 497L1237 485ZM1191 840L1199 838L1191 843ZM1250 803L1274 806L1257 816ZM829 624L838 635L805 636ZM1125 716L1135 687L1132 725ZM926 693L955 672L954 691ZM926 693L921 659L955 672ZM922 355L916 332L921 332ZM1025 434L1051 455L1020 446ZM990 437L987 417L1000 433ZM969 439L990 437L986 449ZM1392 470L1389 472L1381 438ZM1280 409L1279 385L1290 393ZM1272 411L1279 385L1280 409ZM1131 620L1134 651L1099 619ZM1211 582L1190 582L1207 578ZM1294 574L1310 583L1288 599ZM1202 711L1182 730L1190 700ZM1391 579L1421 590L1397 590ZM1404 600L1421 590L1422 608ZM1452 566L1466 526L1481 554ZM1466 526L1452 566L1462 523ZM1490 596L1484 595L1494 560ZM1279 621L1314 603L1317 630ZM1209 359L1213 362L1194 382ZM835 852L849 846L832 872ZM838 806L842 827L838 825ZM811 511L807 525L807 502ZM807 525L781 531L807 502ZM918 593L904 615L899 583ZM912 630L932 608L939 610ZM950 633L912 630L939 610ZM1168 589L1195 612L1159 634ZM1287 500L1301 489L1304 513ZM1298 474L1301 489L1273 481ZM1022 892L1053 910L1021 926ZM886 886L906 879L889 888ZM1135 835L1105 843L1105 824ZM1041 929L1042 931L1021 926ZM992 739L963 741L986 720ZM993 869L990 831L1032 855ZM840 575L860 590L848 600ZM886 860L889 862L873 875ZM931 754L904 769L903 752ZM1105 843L1085 836L1105 824Z'/><path fill='#7e879c' stroke='#7e879c' stroke-width='.6' d='M805 329L830 333L805 330ZM1209 517L1231 510L1219 530ZM1221 122L1229 113L1233 126ZM1234 169L1235 181L1200 188ZM1229 221L1232 253L1200 235ZM1212 456L1237 485L1199 472ZM1249 700L1222 729L1224 697ZM1202 146L1231 129L1234 153ZM771 686L793 674L798 695ZM1059 731L1059 746L1052 725ZM990 309L979 263L1017 297ZM1054 280L1045 295L1030 257ZM1235 181L1231 197L1200 188ZM1323 385L1321 399L1299 396ZM1246 668L1249 700L1238 682ZM802 862L799 848L818 850ZM834 458L824 455L838 435ZM1139 875L1165 869L1164 872ZM1010 730L1011 718L1021 728ZM1001 488L1021 479L1022 480ZM1104 419L1129 429L1100 428ZM990 392L963 388L997 378ZM1272 411L1267 436L1260 415ZM1267 436L1272 411L1295 433ZM1213 654L1191 630L1213 617ZM1481 595L1481 554L1494 560ZM1321 645L1319 675L1285 660ZM779 567L805 557L812 589ZM812 589L824 615L808 620ZM1137 735L1127 725L1132 725ZM1198 386L1230 394L1202 400ZM1227 550L1224 562L1197 567ZM1213 654L1229 626L1236 630ZM1212 279L1209 262L1220 273ZM1434 571L1391 579L1417 544ZM1388 553L1395 527L1417 544ZM1560 614L1585 619L1558 624ZM832 893L819 870L832 872ZM781 531L771 514L807 502ZM1389 472L1363 446L1381 438ZM1310 583L1294 574L1308 561ZM807 525L823 548L805 557ZM1135 835L1131 820L1149 814ZM1163 732L1135 687L1179 693ZM1301 489L1287 500L1273 481ZM1298 474L1279 472L1298 454ZM816 716L854 709L830 726ZM1085 867L1068 891L1043 862ZM1035 864L1032 855L1043 862ZM986 195L994 199L977 201ZM1011 761L992 739L1010 730ZM886 860L873 875L868 841ZM879 818L886 860L868 841ZM1036 768L1011 761L1021 728Z'/><path fill='#5d697b' stroke='#5d697b' stroke-width='.6' d='M960 299L956 347L921 332ZM1179 236L1186 217L1200 235ZM1030 523L1049 553L1017 548ZM1453 657L1432 652L1454 634ZM1374 585L1341 545L1375 554ZM1215 113L1218 115L1221 122ZM1055 623L1085 617L1081 638ZM1034 483L1051 458L1062 484ZM1518 630L1491 627L1511 601ZM1349 603L1371 620L1340 629ZM1371 620L1349 603L1374 585ZM788 752L792 744L790 758ZM1561 834L1556 836L1551 804ZM1300 433L1280 409L1299 396ZM1083 591L1085 617L1069 603ZM1129 594L1119 599L1129 555ZM1287 725L1301 732L1293 763ZM1271 853L1274 806L1285 859ZM1274 806L1271 778L1280 778ZM1324 772L1320 815L1280 778ZM1141 315L1126 290L1140 302ZM900 433L848 440L878 405ZM856 191L840 181L883 170ZM1460 841L1469 869L1456 867ZM1012 668L1030 692L1005 707ZM886 669L863 699L843 683ZM1095 355L1084 368L1059 349ZM1316 411L1327 431L1300 433ZM802 812L806 798L811 821ZM1484 815L1498 774L1521 814ZM879 634L911 647L879 658ZM986 720L984 698L1005 707ZM1216 823L1227 850L1199 838ZM1002 655L1009 656L1012 668ZM1009 656L1010 647L1044 661ZM916 879L923 876L916 879ZM994 795L1035 804L1027 817ZM989 780L994 795L970 779Z'/><path fill='#606c7e' stroke='#606c7e' stroke-width='.6' d='M918 238L936 251L924 260ZM853 511L838 477L875 490ZM1600 758L1600 800L1597 766ZM884 294L912 293L894 309ZM1530 605L1518 630L1511 601ZM1422 699L1420 742L1374 725ZM883 170L891 158L919 164ZM1556 836L1521 814L1551 804ZM918 261L902 272L918 238ZM1341 434L1363 446L1348 478ZM1300 438L1329 433L1298 454ZM1521 814L1498 774L1532 764ZM1393 777L1424 799L1376 815ZM1393 777L1420 742L1423 759ZM1580 636L1585 638L1560 676ZM1518 630L1529 660L1490 672ZM1132 194L1132 165L1171 186ZM916 144L935 156L919 164ZM864 95L870 100L842 114ZM890 126L893 122L909 138ZM794 438L805 414L800 433ZM843 431L850 405L878 405ZM958 453L986 449L958 471ZM1173 510L1198 502L1191 520ZM1049 553L1083 591L1069 603ZM1085 617L1083 591L1099 619ZM1293 763L1324 772L1280 778ZM1141 315L1107 327L1126 290ZM874 720L874 713L889 705ZM910 452L906 433L930 447ZM1241 807L1201 800L1231 766ZM1552 738L1532 726L1555 703ZM1591 735L1552 738L1555 703ZM1017 548L992 556L991 507ZM992 556L943 529L991 507ZM886 669L890 668L889 705ZM1071 309L1083 311L1062 331ZM1341 545L1310 583L1308 561ZM1491 627L1490 596L1503 596ZM1314 603L1322 620L1317 630ZM1304 527L1319 547L1308 541ZM806 798L835 805L811 821ZM1274 806L1250 803L1271 778ZM1213 749L1212 758L1195 746ZM1066 647L1061 649L1055 623ZM988 587L963 624L953 584ZM1123 489L1121 444L1152 458ZM1227 850L1257 816L1256 862ZM983 837L973 852L962 834ZM1180 807L1185 811L1175 809ZM988 634L959 661L963 624ZM943 870L917 833L962 834ZM963 741L956 695L986 720ZM923 876L917 833L943 870ZM931 754L923 742L952 746ZM953 797L987 832L962 834Z'/><path fill='#96a2b4' stroke='#96a2b4' stroke-width='.6' d='M1007 311L1014 335L987 327ZM765 650L763 643L770 637ZM793 674L771 686L771 666ZM1245 589L1213 617L1211 582ZM1249 660L1246 668L1227 661ZM967 362L989 343L997 378ZM963 388L959 360L967 362ZM963 388L967 362L997 378ZM1481 554L1491 557L1494 560ZM1083 195L1077 179L1094 191ZM777 610L759 614L761 595ZM759 614L777 610L758 615ZM789 636L790 650L770 637ZM1092 408L1069 418L1079 400ZM1018 387L1013 382L1019 370ZM1465 477L1467 481L1455 495ZM1226 415L1243 436L1210 440ZM1222 333L1208 350L1198 312ZM781 531L762 542L763 536ZM1248 433L1226 415L1260 415ZM1294 574L1282 559L1308 561ZM1291 523L1292 528L1283 513ZM1112 368L1128 384L1106 407ZM811 625L829 624L805 636ZM824 615L811 625L808 620ZM1096 865L1134 857L1122 882ZM1093 853L1105 843L1096 865ZM983 889L982 887L993 869Z'/><path fill='#7b879c' stroke='#7b879c' stroke-width='.6' d='M1186 217L1229 221L1200 235ZM1030 257L1045 295L1017 297ZM831 382L809 393L806 369ZM1059 746L1021 728L1052 725ZM869 312L851 316L855 295ZM1199 472L1166 448L1195 436ZM1016 307L1007 311L1017 297ZM1341 434L1351 409L1371 422ZM1137 274L1158 276L1140 302ZM811 675L793 674L797 665ZM833 413L843 431L838 435ZM1007 475L1021 479L1001 488ZM1437 428L1421 410L1430 406ZM1455 495L1460 511L1417 518ZM1459 586L1452 573L1481 554ZM1163 340L1137 352L1146 317ZM789 636L777 610L808 620ZM843 431L848 440L838 435ZM808 406L835 397L810 412ZM805 636L790 650L789 636ZM1179 693L1183 692L1190 700ZM811 821L835 805L838 825ZM1191 840L1191 843L1171 850ZM1216 823L1199 838L1200 815ZM838 635L829 624L848 600ZM852 347L860 344L867 376ZM1131 620L1159 634L1134 651ZM804 710L790 721L798 695ZM990 898L985 919L982 916ZM1135 835L1149 814L1171 850ZM940 449L939 427L958 453ZM1168 589L1141 557L1170 567ZM1137 352L1130 375L1119 350ZM816 716L804 710L798 695ZM950 633L959 661L922 651ZM1010 647L1002 655L1007 645ZM1068 891L1053 910L1022 892ZM1053 910L1077 919L1069 922ZM955 672L964 668L968 675ZM1093 853L1096 865L1085 867ZM993 869L974 880L973 852ZM923 742L931 754L903 752ZM953 751L960 744L986 768Z'/><path fill='#8490a5' stroke='#8490a5' stroke-width='.6' d='M1200 188L1186 217L1185 215ZM1030 257L979 263L1013 232ZM805 414L810 412L800 433ZM810 412L833 413L838 435ZM855 295L847 286L871 274ZM1007 311L990 309L1017 297ZM1151 478L1152 458L1158 483ZM1134 651L1132 658L1114 669ZM961 242L999 227L979 263ZM1227 661L1213 654L1236 630ZM792 724L792 744L781 722ZM1058 306L1071 309L1062 331ZM894 347L916 332L909 361ZM1121 444L1100 433L1129 429ZM1243 436L1248 433L1250 458ZM1314 603L1279 621L1288 599ZM1291 523L1304 527L1292 528ZM1163 732L1161 736L1137 735ZM849 846L840 840L842 827ZM854 709L816 716L843 683ZM869 811L879 818L868 841ZM1241 810L1235 816L1241 807ZM990 831L1027 817L1032 855Z'/><path fill='#788496' stroke='#788496' stroke-width='.6' d='M1202 158L1234 153L1234 159ZM838 435L806 446L800 433ZM1163 411L1200 433L1195 436ZM1222 729L1249 700L1250 727ZM1168 300L1182 335L1179 337ZM884 294L869 312L855 295ZM1152 458L1166 448L1158 483ZM1244 765L1245 770L1231 766ZM1279 696L1246 668L1285 660ZM1126 290L1137 274L1140 302ZM792 744L788 752L781 722ZM863 459L865 461L838 477ZM930 447L906 433L933 421ZM805 636L839 658L834 665ZM986 720L1011 718L1010 730ZM917 379L923 402L904 379ZM923 402L889 397L904 379ZM867 376L850 405L843 392ZM967 362L959 360L956 347ZM1125 278L1137 274L1126 290ZM1442 426L1437 428L1430 406ZM1226 623L1213 654L1213 617ZM1283 770L1279 723L1293 763ZM1333 689L1319 675L1327 663ZM1166 340L1163 340L1146 317ZM1083 195L1095 204L1070 211ZM873 875L879 888L857 894ZM769 576L777 610L763 590ZM834 458L848 440L863 459ZM983 338L989 343L967 362ZM959 168L974 164L964 188ZM1067 460L1085 451L1090 460ZM1088 437L1085 451L1072 443ZM1084 368L1095 355L1112 368ZM1395 527L1410 502L1417 518ZM1230 394L1198 386L1228 378ZM1190 651L1198 664L1159 666ZM1191 630L1195 612L1213 617ZM1227 550L1232 547L1224 562ZM1301 732L1310 757L1293 763ZM1310 583L1314 603L1313 602ZM1292 528L1304 527L1308 541ZM1114 171L1107 197L1094 191ZM1176 373L1147 369L1153 364ZM780 468L781 469L777 495ZM1061 649L1066 647L1065 671ZM1104 679L1085 676L1114 669ZM1127 725L1125 716L1132 725ZM860 344L852 347L845 334ZM1100 433L1121 444L1106 460ZM1439 438L1460 463L1431 444ZM1460 463L1459 466L1431 444ZM1279 385L1292 366L1290 393ZM1452 566L1434 571L1417 544ZM911 647L912 630L922 651ZM874 713L854 709L863 699ZM1185 811L1191 840L1175 809ZM1093 912L1068 891L1101 906ZM864 599L871 615L848 600ZM1010 647L1009 656L1002 655ZM1042 931L1053 910L1069 922ZM993 869L1035 864L1022 892ZM1035 864L993 869L1032 855ZM974 880L957 882L973 852ZM952 778L953 751L970 779Z'/><path fill='#757e93' stroke='#757e93' stroke-width='.6' d='M1234 169L1202 158L1234 159ZM1171 186L1200 188L1185 215ZM884 294L855 295L871 274ZM1182 335L1168 300L1198 312ZM962 286L979 263L967 291ZM1045 295L1058 306L1045 323ZM1231 197L1229 221L1200 188ZM1349 737L1349 712L1358 729ZM955 672L968 675L954 691ZM979 263L999 227L1013 232ZM1226 415L1210 440L1200 433ZM1168 300L1199 298L1198 312ZM811 821L838 825L818 850ZM777 610L812 589L808 620ZM812 589L805 557L830 571ZM1085 451L1067 460L1072 443ZM1224 562L1219 570L1197 567ZM790 721L775 703L798 695ZM780 468L777 495L771 505ZM1200 503L1237 485L1231 510ZM1213 362L1198 386L1194 382ZM1279 472L1260 475L1250 458ZM823 548L807 525L816 523ZM1135 687L1163 732L1132 725ZM1329 768L1349 737L1357 749ZM1287 500L1304 513L1283 513ZM1241 810L1250 803L1257 816ZM1077 919L1068 891L1083 917ZM1068 891L1022 892L1043 862ZM990 898L1015 926L985 919ZM889 862L886 886L873 875ZM992 739L986 720L1010 730Z'/><path fill='#7e8a9f' stroke='#7e8a9f' stroke-width='.6' d='M1212 456L1199 472L1195 436ZM839 248L852 244L853 259ZM839 287L817 266L853 259ZM1244 765L1222 729L1250 727ZM844 897L832 872L857 894ZM847 286L853 259L871 274ZM1134 651L1114 669L1099 619ZM979 263L962 286L962 257ZM979 263L990 309L967 291ZM990 309L1007 311L987 327ZM1103 277L1098 275L1123 270ZM1027 312L1016 307L1017 297ZM1351 409L1341 434L1335 415ZM1319 675L1279 696L1285 660ZM1077 255L1060 226L1085 241ZM793 674L811 675L798 695ZM811 675L834 673L843 683ZM811 675L805 636L834 665ZM839 658L838 635L847 655ZM1011 718L986 720L1005 707ZM936 251L939 277L924 260ZM1125 278L1103 277L1123 270ZM997 381L1013 382L990 392ZM1250 458L1237 485L1212 456ZM1147 547L1158 536L1170 567ZM1209 262L1232 253L1232 255ZM1290 393L1309 374L1299 396ZM1249 700L1279 723L1250 727ZM1077 255L1074 265L1064 267ZM799 848L811 821L818 850ZM842 827L869 811L868 841ZM869 811L842 827L858 807ZM1093 912L1096 913L1083 917ZM790 650L805 636L797 665ZM852 347L867 376L831 382ZM852 347L831 382L830 333ZM915 282L918 261L924 260ZM1158 423L1144 420L1163 411ZM1144 420L1129 429L1106 407ZM1051 455L1067 460L1051 458ZM1223 408L1202 400L1223 407ZM1134 651L1159 634L1159 666ZM1227 550L1197 567L1219 530ZM1199 472L1160 493L1158 483ZM1310 757L1301 732L1313 743ZM1391 579L1388 553L1417 544ZM1388 553L1381 528L1395 527ZM1176 373L1185 387L1163 411ZM775 703L790 721L781 722ZM819 870L804 870L802 862ZM1065 671L1066 647L1078 677ZM1104 679L1098 681L1085 676ZM1044 661L1065 671L1046 674ZM1367 494L1383 490L1379 517ZM1387 483L1383 490L1367 494ZM1389 472L1354 479L1363 446ZM1131 620L1127 596L1129 594ZM1323 766L1310 757L1313 743ZM1484 595L1481 595L1494 560ZM1279 621L1285 660L1265 635ZM1272 622L1279 621L1265 635ZM1279 472L1250 458L1267 436ZM1093 717L1103 723L1101 724ZM1131 620L1168 589L1159 634ZM1141 557L1168 589L1129 594ZM1182 730L1163 732L1179 693ZM835 852L840 840L849 846ZM1085 867L1096 865L1107 900ZM985 919L1015 926L988 924ZM854 709L849 732L830 726ZM1105 843L1135 835L1134 857ZM1022 892L1035 864L1043 862ZM961 888L982 887L970 905ZM974 880L982 887L961 888ZM1087 826L1085 836L1057 822Z'/><path fill='#667287' stroke='#667287' stroke-width='.6' d='M1560 676L1555 703L1526 700ZM1560 676L1600 677L1596 706ZM839 248L817 266L826 235ZM839 287L818 291L812 278ZM817 266L839 287L812 278ZM879 658L843 683L847 655ZM912 293L960 299L921 332ZM1000 419L990 392L1023 400ZM1430 874L1405 875L1415 852ZM1449 796L1424 799L1423 759ZM1380 694L1357 702L1346 663ZM1422 699L1376 654L1432 652ZM1486 724L1532 726L1532 764ZM1202 146L1194 155L1196 126ZM902 272L869 254L918 238ZM843 683L834 673L847 655ZM1574 762L1551 804L1532 764ZM986 449L1000 433L1020 446ZM978 485L1007 475L1001 488ZM1320 815L1347 851L1319 852ZM1422 699L1454 726L1420 742ZM1375 651L1371 620L1384 640ZM1529 660L1561 631L1560 676ZM1340 523L1367 494L1379 517ZM1179 236L1131 221L1185 215ZM1089 234L1095 204L1104 228ZM919 164L938 158L952 166ZM874 713L863 699L889 705ZM806 446L794 438L800 433ZM842 206L878 222L844 239ZM1122 781L1107 813L1082 764ZM1592 787L1584 810L1551 804ZM1494 839L1503 860L1488 864ZM1049 553L1016 579L1017 548ZM1067 460L1090 460L1062 484ZM1095 355L1059 349L1062 331ZM1280 409L1300 433L1295 433ZM1200 235L1209 262L1196 243ZM1179 868L1173 860L1196 866ZM1137 735L1161 736L1156 783ZM1274 806L1286 859L1285 859ZM1317 630L1322 620L1340 629ZM1391 579L1397 590L1374 585ZM1171 186L1160 153L1172 155ZM1131 221L1107 197L1132 194ZM842 104L864 95L842 114ZM904 415L900 433L878 405ZM910 452L900 433L906 433ZM850 405L835 397L843 392ZM1196 866L1199 838L1217 864ZM1245 770L1241 807L1231 766ZM1552 738L1591 735L1574 762ZM1085 676L1098 681L1094 698ZM1033 632L1016 579L1055 623ZM1160 493L1198 502L1173 510ZM1304 527L1304 513L1340 523ZM900 433L905 428L906 433ZM856 191L847 199L837 190ZM1201 800L1216 823L1200 815ZM1484 815L1460 841L1449 796ZM1044 661L1033 632L1061 649ZM927 706L926 693L954 691ZM926 693L927 706L889 705ZM988 587L953 584L955 562ZM1121 444L1123 489L1106 460ZM1182 730L1202 711L1195 746ZM1180 807L1175 809L1156 783ZM1235 816L1201 800L1241 807ZM1235 816L1216 823L1201 800ZM1227 850L1235 816L1257 816ZM912 630L904 615L932 608ZM1099 490L1090 460L1106 460ZM1432 598L1452 573L1459 586ZM1301 489L1298 474L1316 484ZM919 561L875 530L914 511ZM919 561L924 590L899 583ZM924 590L919 561L953 584ZM870 558L919 561L899 583ZM1033 632L1010 647L1007 645ZM917 833L879 818L888 802ZM963 741L952 746L927 706ZM881 580L899 583L879 620ZM889 862L923 876L906 879ZM923 876L889 862L917 833ZM927 706L923 742L905 734ZM953 751L931 754L952 746ZM994 795L987 832L953 797ZM994 795L989 780L1011 761Z'/><path fill='#60697b' stroke='#60697b' stroke-width='.6' d='M1600 677L1560 676L1603 667ZM818 291L809 296L812 278ZM853 511L811 511L814 490ZM1085 241L1104 228L1123 270ZM853 259L869 254L871 274ZM1592 787L1574 762L1597 766ZM1574 762L1600 758L1597 766ZM1556 836L1539 852L1541 848ZM1503 861L1503 860L1535 851ZM1257 816L1271 853L1256 862ZM1420 742L1454 726L1423 759ZM1349 712L1357 702L1374 725ZM1085 241L1089 234L1104 228ZM865 461L863 459L891 451ZM1030 692L1011 718L1005 707ZM1300 433L1300 438L1295 433ZM1274 806L1271 853L1257 816ZM1319 547L1341 545L1308 561ZM1308 541L1319 547L1308 561ZM1107 197L1131 221L1104 228ZM910 452L930 447L915 490ZM1173 860L1191 843L1196 866ZM1071 309L1058 306L1054 280ZM1071 309L1074 265L1098 275ZM1209 262L1212 279L1195 283ZM905 428L900 433L904 415ZM1498 774L1484 815L1458 777ZM1066 647L1055 623L1081 638ZM1104 679L1135 687L1120 710ZM1101 724L1122 781L1082 764ZM988 658L984 698L968 675ZM1012 668L1044 661L1046 674ZM992 556L988 587L955 562ZM1121 444L1135 442L1152 458ZM1096 515L1123 489L1142 518ZM1301 489L1316 484L1304 513ZM810 760L791 768L790 758ZM810 760L793 776L791 768ZM830 726L810 760L810 727ZM871 193L883 170L913 196ZM1227 850L1222 863L1217 864ZM1235 816L1227 850L1216 823ZM804 710L816 716L810 727ZM889 769L888 802L858 807ZM919 561L943 529L955 562ZM953 584L919 561L955 562ZM1035 804L1068 809L1049 820ZM923 876L916 879L906 879ZM860 590L881 580L864 599ZM989 780L986 768L988 767ZM963 741L960 744L952 746ZM1087 826L1057 822L1068 809Z'/><path fill='#697287' stroke='#697287' stroke-width='.6' d='M919 164L952 166L913 196ZM902 272L912 293L884 294ZM833 208L844 239L826 235ZM839 248L844 239L852 244ZM1280 409L1290 393L1299 396ZM1394 877L1386 839L1415 852ZM987 417L990 392L1000 419ZM1095 355L1107 327L1119 350ZM1431 873L1449 871L1430 874ZM1394 877L1376 871L1386 839ZM848 440L843 431L878 405ZM1388 553L1391 579L1375 554ZM806 798L802 812L799 801ZM823 548L816 523L832 549ZM1212 758L1201 800L1195 746ZM1135 687L1125 716L1120 710ZM1310 757L1323 766L1324 772ZM1358 868L1352 867L1347 851ZM1094 698L1093 717L1072 698ZM919 561L870 558L875 530ZM881 580L871 615L864 599ZM881 580L860 590L870 558ZM889 862L886 860L917 833ZM931 754L953 751L952 778Z'/><path fill='#7e8a9c' stroke='#7e8a9c' stroke-width='.6' d='M771 514L771 505L807 502ZM1045 295L1027 312L1017 297ZM1168 300L1158 276L1175 279ZM891 158L883 170L882 154ZM847 286L839 287L853 259ZM1166 448L1199 472L1158 483ZM997 381L990 392L997 378ZM1267 436L1295 433L1298 454ZM1319 675L1315 699L1279 696ZM805 636L789 636L808 620ZM883 323L869 312L894 309ZM1137 274L1125 278L1123 270ZM1437 428L1400 433L1421 410ZM1400 433L1437 428L1431 444ZM1272 411L1280 409L1295 433ZM1561 631L1585 619L1580 636ZM1052 363L1065 370L1066 372ZM1052 363L1051 359L1059 349ZM1316 411L1321 399L1335 415ZM1392 470L1400 433L1431 444ZM1202 711L1205 702L1224 697ZM1503 596L1490 596L1494 560ZM1585 619L1600 623L1585 638ZM819 870L808 884L808 881ZM1165 869L1134 857L1171 850ZM1129 429L1100 433L1100 428ZM1197 567L1190 582L1170 567ZM970 905L990 898L982 916ZM1127 817L1135 835L1105 824ZM1093 717L1101 724L1063 747ZM1168 589L1131 620L1129 594ZM1346 771L1329 768L1357 749ZM1329 768L1323 766L1349 737ZM1068 891L1085 867L1107 900ZM1032 855L1056 832L1043 862ZM1053 910L1068 891L1077 919ZM1011 761L1010 730L1021 728ZM1041 929L1053 910L1042 931ZM860 590L864 599L848 600Z'/><path fill='#5d6678' stroke='#5d6678' stroke-width='.6' d='M838 477L853 511L814 490ZM964 219L936 251L918 238ZM1033 413L1000 419L1023 400ZM1551 804L1521 814L1532 764ZM1376 654L1422 699L1380 694ZM1428 619L1432 652L1384 640ZM1422 608L1428 619L1384 640ZM1354 479L1367 494L1348 478ZM869 254L902 272L871 274ZM806 456L824 455L814 490ZM824 455L838 477L814 490ZM1574 762L1592 787L1551 804ZM1503 860L1535 846L1535 851ZM878 729L905 734L903 752ZM889 397L904 415L878 405ZM962 286L967 291L960 299ZM978 485L1001 488L991 507ZM978 485L943 529L958 471ZM1329 433L1341 434L1348 478ZM1093 553L1049 553L1047 515ZM1532 608L1518 630L1530 605ZM1458 777L1454 726L1486 724ZM1529 660L1560 676L1526 700ZM1104 228L1131 221L1123 270ZM1131 221L1132 194L1171 186ZM838 477L865 461L875 490ZM824 455L834 458L838 477ZM842 206L844 239L833 208ZM1016 579L1049 553L1069 603ZM939 277L962 286L960 299ZM1021 479L1007 475L1020 446ZM1021 479L1051 458L1034 483ZM1439 438L1437 428L1442 426ZM1093 553L1083 591L1049 553ZM1119 599L1083 591L1093 553ZM1347 851L1333 864L1319 852ZM1481 595L1491 627L1454 634ZM1391 579L1374 585L1375 554ZM1340 523L1381 528L1341 545ZM891 451L910 452L915 490ZM1532 726L1552 738L1532 764ZM1096 515L1093 553L1047 515ZM1351 796L1347 851L1320 815ZM1518 630L1542 611L1558 624ZM1481 595L1490 596L1491 627ZM1456 597L1481 595L1454 634ZM1135 442L1121 444L1129 429ZM1161 736L1182 730L1195 746ZM810 760L830 726L844 748ZM847 199L871 193L878 222ZM1226 864L1227 850L1231 863ZM1103 723L1125 716L1127 725ZM1002 655L988 634L1007 645ZM1123 489L1099 490L1106 460ZM1432 598L1456 597L1428 619ZM1432 598L1434 571L1452 573ZM918 593L924 590L932 608ZM1027 817L1035 804L1049 820ZM917 833L886 860L879 818ZM1055 771L1063 747L1082 764Z'/><path fill='#60697e' stroke='#60697e' stroke-width='.6' d='M883 170L919 164L913 196ZM956 347L922 355L921 332ZM1022 480L1034 483L1030 523ZM1432 652L1453 657L1450 698ZM1386 839L1424 799L1415 852ZM1422 699L1432 652L1450 698ZM1561 631L1518 630L1558 624ZM1600 704L1600 731L1596 706ZM1600 677L1600 704L1596 706ZM1221 122L1202 146L1196 126ZM1098 275L1085 241L1123 270ZM852 244L869 254L853 259ZM806 446L824 455L806 456ZM869 254L878 222L918 238ZM839 658L834 673L834 665ZM1021 728L1030 692L1052 725ZM1081 638L1085 617L1099 619ZM956 200L918 238L913 196ZM1007 475L986 449L1020 446ZM1054 280L1058 306L1045 295ZM1397 590L1371 620L1374 585ZM1397 590L1404 600L1371 620ZM1585 638L1600 650L1560 676ZM1561 631L1529 660L1518 630ZM1367 494L1340 523L1348 478ZM1131 221L1171 186L1185 215ZM1600 731L1591 735L1596 706ZM1591 735L1555 703L1596 706ZM1577 819L1561 834L1551 804ZM1494 839L1521 814L1535 846ZM1046 674L1065 671L1072 698ZM915 490L914 511L875 490ZM1083 311L1095 355L1062 331ZM1142 518L1173 510L1172 526ZM1083 591L1119 599L1113 605ZM1161 736L1195 746L1156 783ZM1308 861L1286 859L1319 852ZM1320 815L1274 806L1280 778ZM1346 663L1321 645L1340 629ZM1319 547L1340 523L1341 545ZM1381 528L1340 523L1379 517ZM1121 175L1132 165L1132 194ZM1146 317L1141 315L1140 302ZM833 413L835 397L850 405ZM840 181L856 191L837 190ZM1584 810L1581 814L1551 804ZM1460 841L1449 871L1415 852ZM943 529L992 556L955 562ZM956 695L927 706L954 691ZM879 658L886 669L843 683ZM867 376L880 393L850 405ZM976 217L961 242L964 219ZM1310 757L1324 772L1293 763ZM1351 796L1393 777L1376 815ZM1347 851L1351 796L1376 815ZM1376 871L1358 868L1386 839ZM1481 595L1456 597L1459 586ZM823 548L832 549L830 571ZM1175 809L1149 814L1156 783ZM1250 803L1241 807L1245 770ZM1494 839L1484 815L1521 814ZM956 200L977 201L964 219ZM1135 442L1158 423L1160 445ZM1123 489L1160 493L1142 518ZM1123 489L1152 458L1151 478ZM1351 796L1346 771L1393 777ZM1434 571L1452 566L1452 573ZM838 806L835 805L839 775ZM1231 863L1227 850L1256 862ZM1093 717L1063 747L1059 731ZM1103 723L1093 717L1094 698ZM988 587L988 634L963 624ZM1009 656L1044 661L1012 668ZM1099 490L1123 489L1096 515ZM1099 490L1096 515L1062 484ZM1329 768L1346 771L1324 772ZM1316 484L1298 474L1298 454ZM888 802L879 818L869 811ZM1185 811L1180 807L1201 800ZM1250 803L1241 810L1241 807ZM973 852L957 882L943 870ZM919 561L914 511L943 529ZM879 634L871 615L879 620ZM959 661L950 633L963 624ZM956 695L963 741L927 706ZM1068 809L1057 822L1049 820ZM964 668L988 658L968 675ZM952 746L923 742L927 706ZM951 784L915 800L904 769ZM931 754L951 784L904 769ZM987 832L990 831L983 837ZM987 832L994 795L990 831ZM1036 768L1055 771L1035 804ZM1028 771L994 795L1011 761Z'/><path fill='#939cb1' stroke='#939cb1' stroke-width='.6' d='M851 316L839 287L855 295ZM818 291L839 287L851 316ZM1229 221L1231 197L1234 217ZM1421 410L1389 420L1413 394ZM1229 287L1220 273L1232 255ZM1094 191L1077 179L1084 167ZM1163 340L1153 364L1137 352ZM777 610L789 636L770 637ZM769 576L761 578L760 572ZM1344 383L1356 396L1351 409ZM1319 368L1340 373L1323 385ZM1200 297L1229 287L1234 299ZM1208 350L1176 373L1179 337ZM1294 574L1288 599L1245 589ZM835 852L819 870L818 850ZM1249 497L1287 500L1283 513Z'/><path fill='#788196' stroke='#788196' stroke-width='.6' d='M1069 922L1077 919L1083 917ZM771 686L798 695L772 691ZM1229 113L1218 115L1215 113ZM869 312L884 294L894 309ZM976 333L990 309L987 327ZM936 251L961 242L962 257ZM1158 423L1163 411L1195 436ZM1172 526L1197 567L1170 567ZM1246 668L1279 696L1249 700ZM805 636L811 675L797 665ZM805 636L838 635L839 658ZM1132 658L1134 651L1159 666ZM1063 747L1059 746L1059 731ZM1344 383L1351 409L1335 415ZM1232 253L1209 262L1200 235ZM1301 732L1315 699L1313 743ZM1283 770L1271 778L1244 765ZM1074 265L1054 280L1064 267ZM1089 234L1061 225L1070 211ZM1060 226L1061 225L1085 241ZM777 610L769 576L812 589ZM835 397L831 382L843 392ZM1093 912L1101 906L1096 913ZM983 338L976 333L987 327ZM1090 460L1085 451L1106 460ZM1051 455L1054 447L1067 460ZM958 453L969 439L986 449ZM1410 502L1417 483L1455 495ZM1400 433L1392 470L1381 438ZM1202 400L1230 394L1223 407ZM1160 493L1151 478L1158 483ZM1200 297L1212 279L1229 287ZM790 721L792 724L781 722ZM879 888L886 886L889 888ZM1199 838L1191 840L1200 815ZM888 325L883 323L894 309ZM1383 490L1410 502L1379 517ZM1389 472L1387 483L1354 479ZM1267 436L1248 433L1260 415ZM1279 385L1259 394L1271 361ZM1200 503L1198 502L1199 472ZM1190 582L1197 567L1207 578ZM1452 573L1452 566L1481 554ZM780 557L805 557L779 567ZM811 625L805 636L808 620ZM939 427L948 421L958 453ZM1163 732L1137 735L1132 725ZM1421 590L1432 598L1422 608ZM816 716L811 675L843 683ZM1191 840L1185 811L1200 815ZM1022 892L1015 926L990 898ZM921 659L959 661L955 672ZM976 217L999 222L999 227ZM986 768L992 739L988 767ZM1059 746L1044 764L1021 728ZM974 880L961 888L957 882ZM953 751L986 768L970 779ZM1085 836L1093 853L1085 867ZM986 768L960 744L963 741ZM1036 768L1028 771L1011 761ZM982 887L983 889L970 905Z'/><path fill='#636f81' stroke='#636f81' stroke-width='.6' d='M1600 800L1600 758L1603 667ZM902 272L884 294L871 274ZM1001 488L1022 480L1030 523ZM891 158L882 154L909 138ZM1078 677L1094 698L1072 698ZM976 333L967 362L956 347ZM986 449L978 485L958 471ZM1035 404L1033 413L1023 400ZM1194 155L1184 171L1172 155ZM1448 435L1439 438L1448 433ZM1173 510L1191 520L1172 526ZM1405 875L1394 877L1415 852ZM1453 657L1491 627L1490 672ZM1486 724L1454 726L1450 698ZM1498 774L1486 724L1532 764ZM816 523L811 511L853 511ZM832 549L816 523L853 511ZM843 431L833 413L850 405ZM1083 311L1103 277L1126 290ZM1051 458L1067 460L1062 484ZM1051 458L1021 479L1020 446ZM1322 620L1349 603L1340 629ZM1321 645L1317 630L1340 629ZM1327 663L1321 645L1346 663ZM878 729L874 720L889 705ZM1469 869L1460 841L1488 864ZM1460 841L1424 799L1449 796ZM1449 871L1460 841L1456 867ZM1030 692L1012 668L1046 674ZM1033 413L1026 429L1000 419ZM990 392L1018 387L1023 400ZM1198 502L1201 508L1191 520ZM1532 608L1542 611L1518 630ZM792 724L810 727L792 744ZM1127 817L1105 824L1107 813ZM1131 820L1127 817L1149 814ZM1098 681L1104 679L1094 698ZM984 698L1012 668L1005 707ZM984 698L956 695L968 675ZM984 698L988 658L1012 668ZM1144 420L1135 442L1129 429ZM1026 429L1025 434L1000 433ZM1127 596L1119 599L1129 594ZM988 634L1033 632L1007 645ZM940 449L958 453L958 471ZM1323 766L1329 768L1324 772ZM844 748L889 769L839 775ZM904 769L915 800L888 802Z'/><path fill='#5d667b' stroke='#5d667b' stroke-width='.6' d='M1535 846L1541 848L1535 851ZM1047 515L1034 483L1062 484ZM1030 523L1034 483L1047 515ZM1424 799L1386 839L1376 815ZM1555 703L1532 726L1526 700ZM1231 129L1202 146L1221 122ZM844 239L839 248L826 235ZM1535 846L1556 836L1541 848ZM1030 692L1046 674L1072 698ZM1085 617L1055 623L1069 603ZM1007 475L978 485L986 449ZM1184 171L1171 186L1172 155ZM1491 627L1453 657L1454 634ZM1454 726L1458 777L1423 759ZM1454 726L1422 699L1450 698ZM1424 799L1393 777L1423 759ZM865 461L891 451L875 490ZM1503 860L1494 839L1535 846ZM1011 718L1030 692L1021 728ZM1021 479L1034 483L1022 480ZM1142 518L1158 536L1147 547ZM1449 871L1431 873L1415 852ZM1376 871L1394 877L1376 872ZM1341 545L1381 528L1375 554ZM1141 315L1122 346L1107 327ZM1095 204L1107 197L1104 228ZM848 440L900 433L891 451ZM1195 746L1201 800L1156 783ZM863 699L886 669L889 705ZM1013 382L1018 387L990 392ZM1316 411L1300 433L1299 396ZM1191 520L1201 508L1209 517ZM1358 868L1347 851L1386 839ZM1314 603L1310 583L1349 603ZM1340 523L1316 484L1348 478ZM1271 778L1250 803L1245 770ZM921 659L926 693L890 668ZM890 668L926 693L889 705ZM963 624L950 633L939 610ZM912 293L916 332L894 309ZM1135 442L1144 420L1158 423ZM804 710L810 727L792 724ZM1201 800L1180 807L1156 783ZM1222 863L1227 850L1226 864ZM973 852L943 870L962 834ZM875 530L853 511L875 490ZM1093 717L1059 731L1072 698ZM830 726L849 732L844 748ZM964 668L959 661L988 658ZM915 800L917 833L888 802ZM990 831L994 795L1027 817ZM1068 809L1055 771L1082 764ZM986 768L989 780L970 779ZM1105 824L1087 826L1107 813ZM1087 826L1068 809L1107 813Z'/><path fill='#8d96a8' stroke='#8d96a8' stroke-width='.6' d='M761 595L759 614L758 615ZM793 674L771 666L797 665ZM1014 353L1007 353L1014 335ZM1227 661L1246 668L1238 682ZM1035 404L1052 363L1066 372ZM1153 364L1163 340L1166 340ZM1063 185L1083 195L1070 211ZM1126 883L1122 882L1132 877ZM1034 201L1063 185L1070 211ZM1063 185L1034 201L1044 184ZM1014 353L1051 359L1019 370ZM1389 420L1394 429L1381 438ZM1247 498L1243 513L1231 510ZM1280 348L1271 361L1265 346ZM1183 692L1205 702L1190 700ZM1282 559L1292 528L1308 541ZM1176 373L1166 340L1179 337ZM888 325L894 347L878 341ZM888 325L878 341L876 337ZM780 557L779 567L760 572ZM1128 384L1130 375L1147 369ZM840 840L835 852L818 850ZM1096 865L1105 843L1134 857Z'/><path fill='#9099ae' stroke='#9099ae' stroke-width='.6' d='M771 666L771 686L766 660ZM922 355L955 359L944 378ZM1069 406L1035 404L1066 372ZM1344 383L1321 399L1323 385ZM1061 225L1060 226L1036 225ZM1219 570L1224 562L1245 589ZM1096 865L1122 882L1107 900Z'/><path fill='#969fb4' stroke='#969fb4' stroke-width='.6' d='M1027 312L1045 323L1014 335ZM839 287L847 286L855 295ZM1309 374L1292 366L1309 343ZM1048 327L1051 359L1014 353ZM1232 547L1282 559L1245 589ZM888 325L916 332L894 347ZM851 316L860 344L845 334ZM829 624L811 625L824 615Z'/><path fill='#99a5b7' stroke='#99a5b7' stroke-width='.6' d='M1007 311L1027 312L1014 335ZM1224 562L1232 547L1245 589ZM1309 374L1319 368L1323 385ZM1065 370L1084 368L1066 372ZM1219 570L1245 589L1211 582ZM819 870L802 862L818 850ZM781 531L767 521L771 514ZM1213 362L1208 350L1230 344ZM997 162L1001 164L991 190ZM983 889L993 869L990 898Z'/><path fill='#788499' stroke='#788499' stroke-width='.6' d='M1027 312L1045 295L1045 323ZM959 360L955 359L956 347ZM1460 511L1462 523L1417 518ZM1185 387L1202 400L1163 411ZM1084 368L1065 370L1059 349ZM1327 431L1316 411L1335 415ZM1223 408L1226 415L1200 433ZM1557 614L1560 614L1558 624ZM1212 758L1213 749L1231 766ZM1434 571L1421 590L1391 579ZM993 869L973 852L983 837ZM889 862L906 879L886 886ZM992 739L1011 761L988 767Z'/><path fill='#a2abbd' stroke='#a2abbd' stroke-width='.6' d='M1007 353L1019 370L997 378ZM1340 373L1334 347L1358 352ZM1266 319L1230 344L1261 313Z'/><path fill='#d5ba93' stroke='#d5ba93' stroke-width='.6' d='M1589 485L1484 523L1477 466ZM400 433L389 507L301 485Z'/><path fill='#8a93a5' stroke='#8a93a5' stroke-width='.6' d='M1405 377L1413 394L1369 407ZM1389 420L1371 422L1369 407ZM1034 201L1061 225L1036 225ZM1092 408L1088 437L1069 418ZM923 402L953 403L933 421ZM1085 381L1084 368L1112 368ZM1459 466L1465 477L1455 495ZM1198 386L1185 387L1194 382ZM1229 626L1226 623L1236 630ZM1114 171L1094 191L1084 167ZM1248 433L1243 436L1226 415ZM1279 621L1283 603L1288 599ZM1283 603L1279 621L1272 622ZM1213 362L1209 359L1208 350ZM999 222L1020 229L1013 232Z'/><path fill='#788193' stroke='#788193' stroke-width='.6' d='M1191 520L1209 517L1219 530ZM1421 410L1413 394L1430 406ZM889 397L923 402L904 415ZM1481 595L1459 586L1481 554ZM1315 699L1333 689L1340 701ZM835 397L808 406L809 393ZM1179 693L1135 687L1159 666ZM1044 661L1061 649L1065 671ZM1462 523L1452 566L1417 544ZM811 675L816 716L798 695ZM1068 891L1093 912L1083 917ZM1015 926L1015 928L988 924ZM871 615L838 635L848 600ZM986 195L991 190L994 199ZM1056 832L1085 836L1085 867Z'/><path fill='#667284' stroke='#667284' stroke-width='.6' d='M1049 553L1030 523L1047 515ZM1458 777L1449 796L1423 759ZM1432 652L1428 619L1454 634ZM1346 771L1351 796L1324 772ZM889 769L844 748L878 729Z'/><path fill='#7b8799' stroke='#7b8799' stroke-width='.6' d='M1222 729L1244 765L1231 766ZM1158 276L1168 300L1140 302ZM1184 171L1202 158L1200 188ZM1184 171L1194 155L1202 158ZM1413 394L1416 388L1430 406ZM1341 434L1329 433L1335 415ZM1376 654L1375 651L1384 640ZM1166 340L1168 300L1179 337ZM909 361L917 379L904 379ZM962 286L939 277L962 257ZM1059 349L1048 327L1062 331ZM1279 696L1279 723L1249 700ZM1279 723L1287 725L1293 763ZM1271 778L1283 770L1280 778ZM1319 675L1333 689L1315 699ZM1585 619L1585 638L1580 636ZM1061 225L1089 234L1085 241ZM835 397L833 413L810 412ZM848 600L824 615L812 589ZM983 338L967 362L976 333ZM915 282L912 293L902 272ZM1051 455L1051 458L1020 446ZM1400 433L1394 429L1421 410ZM1417 483L1392 470L1431 444ZM1226 415L1223 408L1223 407ZM1250 458L1260 475L1237 485ZM1600 623L1600 600L1603 667ZM804 870L819 870L808 881ZM1175 809L1191 840L1171 850ZM916 332L888 325L894 309ZM1085 451L1100 433L1106 460ZM1100 433L1085 451L1088 437ZM1237 485L1200 503L1199 472ZM1119 599L1131 620L1113 605ZM1198 386L1213 362L1228 378ZM1182 730L1179 693L1190 700ZM1349 737L1323 766L1313 743ZM1144 420L1128 384L1163 411ZM1190 582L1168 589L1170 567ZM1163 732L1182 730L1161 736ZM999 227L999 222L1013 232ZM849 732L874 720L878 729ZM1032 855L1027 817L1049 820ZM1093 853L1085 836L1105 843Z'/><path fill='#818d9f' stroke='#818d9f' stroke-width='.6' d='M1313 743L1315 699L1340 701ZM1122 346L1137 352L1119 350ZM1301 732L1287 725L1315 699ZM835 397L809 393L831 382ZM1387 483L1367 494L1354 479ZM1202 400L1223 408L1200 433ZM1190 651L1213 654L1198 664ZM838 635L879 634L847 655ZM1397 590L1421 590L1404 600ZM1484 595L1490 596L1481 595Z'/><path fill='#939fb1' stroke='#939fb1' stroke-width='.6' d='M1198 664L1227 661L1224 697ZM1265 635L1249 660L1236 630ZM869 312L883 323L876 337ZM1007 353L989 343L1014 335ZM1054 447L1069 418L1072 443ZM1462 523L1460 511L1484 523ZM1481 554L1486 533L1489 544ZM1272 622L1265 635L1236 630ZM1239 352L1241 385L1228 378ZM1239 352L1271 361L1241 385ZM790 650L765 650L770 637ZM1052 363L1018 387L1019 370ZM1467 481L1465 493L1455 495ZM1241 385L1230 394L1228 378ZM1259 394L1230 394L1241 385ZM1243 513L1232 547L1219 530ZM1199 298L1200 297L1198 312ZM1260 475L1273 481L1249 497ZM1185 387L1176 373L1194 382ZM767 521L781 531L763 536ZM1134 857L1139 875L1132 877ZM878 341L860 344L876 337ZM1340 373L1341 380L1323 385ZM1176 373L1209 359L1194 382ZM948 421L969 439L958 453ZM1168 589L1190 582L1195 612ZM1130 375L1128 384L1112 368ZM991 190L1001 164L1010 174Z'/><path fill='#96a2b7' stroke='#96a2b7' stroke-width='.6' d='M1227 661L1238 682L1224 697ZM1035 404L1069 418L1033 413ZM1016 307L1027 312L1007 311ZM1069 418L1088 437L1072 443ZM777 610L770 637L758 615ZM1020 229L1034 201L1036 225ZM1229 287L1212 279L1220 273ZM990 437L969 439L987 417ZM1260 475L1279 472L1273 481ZM969 439L948 421L961 413ZM1034 201L1010 174L1044 184ZM982 887L974 880L993 869Z'/><path fill='#abb4c6' stroke='#abb4c6' stroke-width='.6' d='M1049 162L1044 184L1024 162ZM1286 339L1280 348L1265 346ZM1370 378L1356 396L1344 383ZM1370 378L1362 353L1371 358ZM1010 174L1008 163L1024 162Z'/><path fill='#909cae' stroke='#909cae' stroke-width='.6' d='M917 379L922 355L944 378ZM1405 377L1413 385L1413 394ZM1045 323L1048 327L1014 335ZM1048 327L1014 353L1014 335ZM1213 654L1227 661L1198 664ZM1205 702L1198 664L1224 697ZM989 343L983 338L987 327ZM1061 225L1034 201L1070 211ZM1051 359L1052 363L1019 370ZM1104 419L1092 408L1106 407ZM1092 408L1104 419L1100 428ZM1092 408L1079 400L1085 381ZM987 417L969 439L961 413ZM1466 526L1486 533L1481 554ZM1486 533L1466 526L1484 523ZM1232 547L1227 550L1219 530ZM1243 513L1249 497L1283 513ZM1153 364L1147 369L1137 352ZM1176 373L1153 364L1166 340ZM1025 434L1026 429L1054 447ZM1213 362L1239 352L1228 378ZM953 403L948 421L933 421Z'/><path fill='#99a2b7' stroke='#99a2b7' stroke-width='.6' d='M1085 381L1112 368L1106 407ZM917 379L909 361L922 355ZM1014 335L989 343L987 327ZM771 666L790 650L797 665ZM1394 429L1389 420L1421 410ZM1231 510L1243 513L1219 530ZM1208 350L1222 333L1224 334ZM1282 559L1294 574L1245 589ZM1213 362L1230 344L1239 352ZM842 827L840 840L838 825Z'/><path fill='#a5aec0' stroke='#a5aec0' stroke-width='.6' d='M1079 400L1069 406L1066 372ZM1413 394L1389 420L1369 407ZM1292 366L1286 339L1309 343ZM963 388L953 403L944 378ZM1370 378L1371 358L1381 363ZM1044 184L1010 174L1024 162Z'/><path fill='#aebacc' stroke='#aebacc' stroke-width='.6' d='M1079 400L1069 418L1069 406Z'/><path fill='#a2aebd' stroke='#a2aebd' stroke-width='.6' d='M1069 418L1035 404L1069 406Z'/><path fill='#848da2' stroke='#848da2' stroke-width='.6' d='M1054 280L1030 257L1064 267ZM1237 485L1247 498L1231 510ZM1191 843L1173 860L1171 850ZM918 261L915 282L902 272ZM1410 502L1395 527L1379 517ZM1314 603L1288 599L1313 602ZM905 428L904 415L933 421ZM1066 647L1085 676L1078 677ZM867 376L860 344L878 341ZM939 427L930 447L933 421ZM1130 375L1112 368L1119 350ZM786 545L807 525L805 557ZM959 661L921 659L922 651ZM991 190L986 195L964 188Z'/><path fill='#9fabba' stroke='#9fabba' stroke-width='.6' d='M1014 353L1019 370L1007 353ZM1255 307L1224 334L1234 299ZM1319 368L1309 374L1309 343ZM1230 344L1224 334L1261 313Z'/><path fill='#8d96ab' stroke='#8d96ab' stroke-width='.6' d='M1371 422L1351 409L1369 407ZM1371 422L1389 420L1381 438ZM1271 361L1239 352L1265 346ZM769 576L763 590L761 578ZM1088 437L1092 408L1100 428ZM1351 409L1356 396L1369 407Z'/><path fill='#b1bacc' stroke='#b1bacc' stroke-width='.6' d='M1319 368L1322 346L1334 347ZM1051 162L1058 163L1044 184ZM1239 352L1230 344L1265 346Z'/><path fill='#aeb7c9' stroke='#aeb7c9' stroke-width='.6' d='M1322 346L1319 368L1309 343ZM1229 287L1244 291L1234 299ZM1266 319L1272 325L1265 346ZM1362 353L1340 373L1358 352Z'/><path fill='#abb7c6' stroke='#abb7c6' stroke-width='.6' d='M1244 291L1246 298L1234 299ZM1255 307L1246 298L1244 291ZM1370 378L1405 377L1369 407ZM1340 373L1370 378L1344 383Z'/><path fill='#9ca5ba' stroke='#9ca5ba' stroke-width='.6' d='M1244 291L1229 287L1232 255ZM1491 557L1481 554L1489 544ZM1230 394L1259 394L1260 415ZM1198 312L1200 297L1234 299ZM1001 164L1008 163L1010 174Z'/><path fill='#636c7e' stroke='#636c7e' stroke-width='.6' d='M1371 620L1375 651L1340 629ZM1319 547L1304 527L1340 523ZM1352 867L1333 864L1347 851ZM904 769L889 769L903 752Z'/><path fill='#cfb18d' stroke='#cfb18d' stroke-width='.6' d='M767 521L697 520L771 505Z'/><path fill='#848da5' stroke='#848da5' stroke-width='.6' d='M904 415L923 402L933 421ZM1158 536L1172 526L1170 567ZM1279 472L1298 474L1273 481ZM959 661L964 668L955 672ZM953 797L951 784L970 779Z'/><path fill='#8a96a8' stroke='#8a96a8' stroke-width='.6' d='M989 343L1007 353L997 378ZM1245 589L1226 623L1213 617ZM1054 447L1026 429L1033 413ZM1084 368L1085 381L1066 372ZM1465 493L1460 511L1455 495ZM1465 493L1467 481L1472 493ZM1210 440L1243 436L1212 456ZM1243 513L1282 559L1232 547ZM1292 528L1243 513L1283 513ZM876 337L860 344L851 316ZM1195 612L1190 582L1211 582ZM781 531L786 545L762 542ZM999 222L1034 201L1020 229Z'/><path fill='#a5aebd' stroke='#a5aebd' stroke-width='.6' d='M1069 418L1054 447L1033 413Z'/><path fill='#939fb4' stroke='#939fb4' stroke-width='.6' d='M1019 370L1013 382L997 378ZM1226 623L1245 589L1236 630ZM765 650L790 650L766 660ZM953 403L923 402L944 378ZM838 825L840 840L818 850ZM999 222L994 199L1034 201ZM994 199L1010 174L1034 201Z'/><path fill='#99a5ba' stroke='#99a5ba' stroke-width='.6' d='M987 417L961 413L990 392ZM961 413L963 388L990 392ZM959 360L963 388L944 378ZM1460 511L1472 493L1484 523ZM1245 589L1272 622L1236 630ZM1491 557L1489 544L1494 560ZM1083 195L1063 185L1077 179ZM779 567L769 576L760 572ZM1466 526L1462 523L1484 523ZM1243 513L1247 498L1249 497ZM1182 335L1208 350L1179 337ZM1208 350L1182 335L1198 312ZM1230 344L1208 350L1224 334ZM1271 361L1280 348L1292 366ZM991 190L1010 174L994 199ZM993 869L1022 892L990 898Z'/><path fill='#b4bdcf' stroke='#b4bdcf' stroke-width='.6' d='M1246 298L1255 307L1234 299ZM1063 185L1058 163L1077 179ZM1280 348L1286 339L1292 366ZM1356 396L1370 378L1369 407Z'/><path fill='#a5b1c0' stroke='#a5b1c0' stroke-width='.6' d='M1224 334L1255 307L1261 313Z'/><path fill='#a8b1c3' stroke='#a8b1c3' stroke-width='.6' d='M1222 333L1198 312L1234 299ZM1049 162L1051 162L1044 184ZM1405 377L1370 378L1385 366ZM1370 378L1340 373L1362 353ZM1341 380L1340 373L1344 383Z'/><path fill='#a2abba' stroke='#a2abba' stroke-width='.6' d='M1224 334L1222 333L1234 299ZM1272 325L1286 339L1265 346Z'/><path fill='#b1bdcf' stroke='#b1bdcf' stroke-width='.6' d='M1058 163L1063 185L1044 184ZM953 403L963 388L961 413Z'/><path fill='#abb7c9' stroke='#abb7c9' stroke-width='.6' d='M1077 179L1083 167L1084 167Z'/><path fill='#b1bdcc' stroke='#b1bdcc' stroke-width='.6' d='M1058 163L1083 167L1077 179Z'/><path fill='#939cae' stroke='#939cae' stroke-width='.6' d='M1460 511L1465 493L1472 493ZM1209 359L1176 373L1208 350ZM819 870L835 852L832 872Z'/><path fill='#a8b4c3' stroke='#a8b4c3' stroke-width='.6' d='M1340 373L1319 368L1334 347Z'/><path fill='#a8b1c0' stroke='#a8b1c0' stroke-width='.6' d='M1230 344L1266 319L1265 346Z'/><path fill='#aebac9' stroke='#aebac9' stroke-width='.6' d='M1385 366L1370 378L1381 363Z'/><path d='M986 324L973 351L942 362L912 351L899 324L912 298L942 287L973 298Z' fill='#2b3140'/><path d='M977 324L967 346L942 355L918 346L908 324L918 302L942 293L967 302Z' fill='#2f9bd0'/><path d='M924 321L939 302L948 319L933 336Z' fill='#6cc6ec'/><path d='M942 304L954 324L942 345L931 324Z' fill='#16202c'/><path d='M952 304L961 305L956 313Z' fill='#fff'/><path d='M1145 328L1132 355L1101 366L1070 355L1058 328L1070 301L1101 290L1132 301Z' fill='#2b3140'/><path d='M1135 328L1125 350L1101 359L1077 350L1067 328L1077 306L1101 297L1125 306Z' fill='#2f9bd0'/><path d='M1082 324L1098 305L1107 322L1092 339Z' fill='#6cc6ec'/><path d='M1101 307L1113 328L1101 349L1090 328Z' fill='#16202c'/><path d='M1111 307L1120 309L1115 317Z' fill='#fff'/><path d='M986 389L1040 391L1013 420Z' fill='#3a3f4c'/><g fill='none' stroke='#3a3f4c' stroke-width='3.5' stroke-linecap='round'><path d='M1013 420V440'/><path d='M1013 440Q1000 454 986 449'/><path d='M1013 440Q1025 454 1040 449'/></g><g stroke='#f2f4f8' stroke-width='2' stroke-linecap='round' opacity='.75'><path d='M970 433L762 411'/><path d='M970 442L753 472'/><path d='M973 451L798 523'/><path d='M1054 433L1267 407'/><path d='M1054 442L1285 465'/><path d='M1051 451L1249 519'/></g><g fill='#b49aa6' opacity='.8'><path d='M852 111L903 166L852 220Z'/><path d='M1220 119L1174 166L1217 243Z'/></g>", '#d9cbb4') },
    { name: '天の川', dir: '7.1-Polaris', file: 'milky-way', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#03061a'/><stop offset='.55' stop-color='#0d1640'/><stop offset='.82' stop-color='#3a2d63'/><stop offset='1' stop-color='#8a5a7a'/></linearGradient>" +
      "<linearGradient id='mw' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#9fb4ff' stop-opacity='0'/><stop offset='.3' stop-color='#c9d4ff' stop-opacity='.5'/><stop offset='.55' stop-color='#ffe6c8' stop-opacity='.7'/><stop offset='.8' stop-color='#c9d4ff' stop-opacity='.45'/><stop offset='1' stop-color='#9fb4ff' stop-opacity='0'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='34'/></filter><filter id='d' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='12'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(220, 1000, 137) +
      "<g transform='rotate(-28 800 520)'><ellipse cx='800' cy='520' rx='980' ry='120' fill='url(#mw)' filter='url(#s)'/><ellipse cx='860' cy='520' rx='520' ry='46' fill='#fff2dc' opacity='.35' filter='url(#s)'/>" +
      "<g fill='#0a0f2c' opacity='.55' filter='url(#d)'><path d='M380 516C520 500 640 540 780 520S1000 490 1160 528S1320 540 1420 520L1420 534C1300 556 1180 548 1040 536S800 548 640 548S460 532 380 530Z'/><ellipse cx='900' cy='500' rx='90' ry='14'/></g>" +
      scatter(420, 139, (x, y, r, a, o) => { const Y = 520 + (y - 500) * (r * r * .28); return "<circle cx='" + Math.round(x * 1.2 - 160) + "' cy='" + Math.round(Y) + "' r='" + (o * 1.3 + .3).toFixed(1) + "' fill='" + (a < .2 ? '#ffe1b8' : '#fff') + "' opacity='" + (a * .6 + .3).toFixed(2) + "'/>"; }) + '</g>' +
      "<path d='M0 800L140 720L260 760L420 640L560 740L700 690L860 780L1000 700L1180 610L1340 720L1480 680L1600 740V1000H0Z' fill='#141634'/>" +
      "<path d='M0 860L220 800L400 850L640 790L880 860L1100 810L1360 870L1600 820V1000H0Z' fill='#0a0b1e'/>" +
      "<path d='" + trees(930, 70, 141) + "' fill='#04050d'/>", '#0d1640') },
    { name: '竹林', dir: '7.1-Polaris', file: 'bamboo', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f4f7d8'/><stop offset='.5' stop-color='#c9e0a8'/><stop offset='1' stop-color='#6f9a5a'/></linearGradient>" +
      "<linearGradient id='ray' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fffbe0' stop-opacity='.75'/><stop offset='1' stop-color='#fffbe0' stop-opacity='0'/></linearGradient>" +
      "<linearGradient id='st' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='.25'/><stop offset='.35' stop-color='#fff' stop-opacity='.25'/><stop offset='1' stop-color='#000' stop-opacity='.3'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='6'/></filter><path id='bl' d='M0 0C30 -8 70 -6 110 2C70 8 30 8 0 0Z'/></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      [['#b9d49a', 20, 14, 151, .7, 's'], ['#88b26c', 13, 24, 153, .85, ''], ['#4f7f3e', 8, 40, 157, 1, ''], ['#2e5a2a', 5, 62, 163, 1, '']].map(([col, n, w, seed, op, f]) => { const r = rnd(seed); let out = "<g opacity='" + op + "'" + (f ? " filter='url(#s)'" : '') + '>'; for (let i = 0; i < n; i++) { const x = Math.round(r() * 1600), ww = Math.round(w * (.8 + r() * .4)), tilt = Math.round(r() * 6 - 3); out += "<g transform='rotate(" + tilt + ' ' + x + " 1000)'><rect x='" + x + "' y='-50' width='" + ww + "' height='1100' fill='" + col + "'/><rect x='" + x + "' y='-50' width='" + ww + "' height='1100' fill='url(#st)'/>"; for (let y = 40 + Math.round(r() * 120); y < 1000; y += 150 + Math.round(r() * 60)) out += "<rect x='" + (x - 2) + "' y='" + y + "' width='" + (ww + 4) + "' height='" + Math.max(3, Math.round(ww / 8)) + "' fill='" + col + "' stroke='#000' stroke-opacity='.18'/>"; for (let k = 0; k < 3; k++) { const ly = Math.round(r() * 700), side = r() < .5 ? -1 : 1; out += "<g transform='translate(" + (x + (side > 0 ? ww : 0)) + ' ' + ly + ') scale(' + side * (w / 40 + .4) + ' ' + (w / 40 + .4) + ")' fill='" + col + "'><use href='#bl' transform='rotate(-20)'/><use href='#bl' transform='rotate(5)'/><use href='#bl' transform='rotate(28)'/></g>"; } out += '</g>'; } return out + '</g>'; }).join('') +
      "<path d='M1600 0L1250 0L300 1000L800 1000Z' fill='url(#ray)' opacity='.35'/><path d='M1600 120L1600 0L1480 0L700 1000L900 1000Z' fill='url(#ray)' opacity='.25'/>", '#c9e0a8') },
    { name: '海辺の灯台', dir: '7.1-Polaris', file: 'lighthouse', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a2f6b'/><stop offset='.35' stop-color='#8a5a8f'/><stop offset='.58' stop-color='#f08a6a'/><stop offset='.66' stop-color='#ffd08a'/></linearGradient>" +
      "<linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d98a7a'/><stop offset='.3' stop-color='#5a4f80'/><stop offset='1' stop-color='#1a1d42'/></linearGradient>" +
      "<linearGradient id='bm' x1='1' y1='0' x2='0' y2='0'><stop offset='0' stop-color='#fff4c8' stop-opacity='.7'/><stop offset='1' stop-color='#fff4c8' stop-opacity='0'/></linearGradient>" +
      "<radialGradient id='lamp' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff'/><stop offset='.3' stop-color='#fff1b0' stop-opacity='.8'/><stop offset='1' stop-color='#ffd36a' stop-opacity='0'/></radialGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='26'/></filter><filter id='b' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='5'/></filter>" +
      "<clipPath id='lh'><path d='M1222 336L1278 336L1294 600L1206 600Z'/></clipPath></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(40, 260, 167) +
      "<circle cx='560' cy='640' r='150' fill='#ffb070' opacity='.55' filter='url(#s)'/><circle cx='560' cy='652' r='58' fill='#fff0c8'/>" +
      "<g fill='#f6b49a' opacity='.5'><ellipse cx='300' cy='420' rx='220' ry='16'/><ellipse cx='880' cy='360' rx='260' ry='14'/><ellipse cx='600' cy='520' rx='180' ry='10'/></g>" +
      "<rect y='660' width='1600' height='340' fill='url(#sea)'/>" +
      "<g fill='#fff0c8' opacity='.7' filter='url(#b)'>" + Array.from({ length: 12 }, (_, i) => { const r = rnd(171 + i); const w = 120 - i * 8 + r() * 40; return "<rect x='" + Math.round(560 - w / 2 + r() * 30 - 15) + "' y='" + (672 + i * 22) + "' width='" + Math.round(w) + "' height='4' rx='2'/>"; }).join('') + '</g>' +
      "<g stroke='#fff' stroke-opacity='.18' stroke-width='2' stroke-linecap='round'>" + scatter(50, 173, (x, y, r) => "<path d='M" + x + ' ' + (690 + Math.round(y * .3)) + 'h' + Math.round(20 + r * 60) + "'/>") + '</g>' +
      "<path d='M1250 350L0 250L0 470Z' fill='url(#bm)' opacity='.55'/>" +
      "<path d='M1000 1000L1040 760L1120 690L1180 640L1340 612L1480 640L1600 610V1000Z' fill='#191630'/><path d='M1040 760L1120 690L1180 640L1240 650L1150 740L1080 800Z' fill='#2a2448' opacity='.8'/>" +
      "<path d='M1222 336L1278 336L1294 600L1206 600Z' fill='#f3efe8'/><g clip-path='url(#lh)' fill='#c9343a'><rect x='1190' y='400' width='120' height='44'/><rect x='1190' y='500' width='120' height='44'/></g>" +
      "<path d='M1250 336L1294 600L1260 600L1240 336Z' fill='#000' opacity='.2'/>" +
      "<rect x='1210' y='326' width='80' height='12' fill='#2a2440'/><rect x='1226' y='290' width='48' height='36' fill='#ffe9a8'/><path d='M1220 290L1250 262L1280 290Z' fill='#c9343a'/><rect x='1226' y='290' width='48' height='36' fill='none' stroke='#2a2440' stroke-width='3'/>" +
      "<circle cx='1250' cy='308' r='70' fill='url(#lamp)'/><rect x='1196' y='596' width='108' height='12' fill='#2a2440'/>", '#8a5a8f') },
  ];
  // 壁紙の CSS。prefs.wallpaper が 'custom' なら、そのユーザーの ~/.config/wallpaper（画像の data: URL）を使う
  function wallCss(prefs, user) {
    const p = prefs || {};
    if (p.wallpaper === 'custom' && user) {
      try { const d = fs.read(users.home(user) + '/.config/wallpaper'); if (d) return 'url("' + d + '") center / cover no-repeat #000'; } catch (e) { /* 画像がなければ既定の壁紙 */ }
    }
    if (typeof p.wallpaper === 'string' && p.wallpaper[0] === '/') {
      const css = wallFileCss(p.wallpaper); if (css) return css;
      const w = WALLPAPERS.find(x => x.path === p.wallpaper); if (w) return w.css; // ファイルを消していても、標準の壁紙なら出せる
    }
    return (WALLPAPERS[p.wallpaper | 0] || WALLPAPERS[0]).css;
  }
  // ---- 壁紙のファイル（6.0.3）: 標準の壁紙は /usr/share/backgrounds/<バージョン>/<名前>.svg に置く（SVG の <title> が表示名）。
  //   設定はこのフォルダを見て、フォルダ（追加したバージョン）ごとに並べる。SVG か、画像の data: URL を書いたファイルを置けば壁紙が増える
  const WALLDIR = '/usr/share/backgrounds';
  WALLPAPERS.forEach(w => { w.path = WALLDIR + '/' + w.dir + '/' + w.file + '.svg'; });
  // そのバージョンの星座の壁紙（6.x ならデネブ＝はくちょう座）の CSS。htosver のロゴの背景に使う
  function starWallpaper(codename) {
    const c = String(codename || OS.codename || '');
    const w = c && WALLPAPERS.find(x => x.file === c.toLowerCase() && x.dir.endsWith('-' + c));
    return w ? (wallFileCss(w.path) || w.css) : null;
  }
  // OS のバージョンが変わったときだけ書き出す（消したファイルを毎回戻さない）
  function installWallpapers() {
    const stamp = WALLDIR + '/.version', want = (OS.version || '') + '/' + WALLPAPERS.length;
    try { if (fs.read(stamp) === want) return; } catch (e) { /* まだない */ }
    WALLPAPERS.forEach(w => {
      const m = /data:image\/svg\+xml,([^"]*)"\) center \/ cover no-repeat (\S+)/.exec(w.css); if (!m) return;
      const svg = decodeURIComponent(m[1]).replace('>', " data-fallback='" + m[2] + "'><title>" + w.name + '</title>');
      try { fs.mkdir(path.dir(w.path), { parents: true }); fs.write(w.path, svg); } catch (e) { /* 書けなくても組み込みの壁紙で表示できる */ }
    });
    try { fs.write(stamp, want); } catch (e) { /* 無視 */ }
  }
  // ---- 同梱の曲（6.0.7）: /usr/share/music/htmlOS/ に htmlOS.mp3・歌詞・クレジットを置く。
  //   曲のデータは約 5MB あり LocalStorage に入らないので、ファイルの中身は配布元（GitHub Pages）の media/htmlOS.mp3 への URL にしている
  const MUSIC_DIR = '/usr/share/music/htmlOS';
  const SONG_LYRICS = "真っ黒な画面に 白いタグが灯る\nブラウザの中で 小さな宇宙が起動する\nLocalStorageに刻んだ 僕の記憶\n電源を落としても ここにまだ残ってる\n\nBIOSを抜けて カーネルが目を覚ます\n一秒だけの静けさのあと\n\nHello, htmlOS\nタグの海から生まれた世界\nHello, htmlOS\nひとつのファイルに 夢を詰め込んで\nSirius, Vega, Altair, Deneb\n星の名前で 進化してく\nブラウザは背骨 あとは全部 僕のもの\n\njshに打ち込む 一行のコマンド\nsudoで開く扉 rootだけの領域\n指先で窓がスナップする\n仮想デスクトップ 八つの空\n\nログアウトなんて いらない\nユーザーを切り替えて そのまま続きへ\n\nHello, htmlOS\nタグの海から生まれた世界\nHello, htmlOS\nひとつのファイルに 夢を詰め込んで\nSirius, Vega, Altair, Deneb\n星の名前で 進化してく\nブラウザは背骨 あとは全部 僕のもの\n\n眠りにつくときも 全部そのまま\nハイバネートの闇の中で\n目覚めたらまた 同じ画面\nずっと待ってたよ おかえり\n\nHello, htmlOS\nここが僕の 動き出す未来\nHello, htmlOS\nどこまでも広がる 小さな宇宙\nSirius, Vega, Altair, Deneb\n星をたどって 次の空へ\nブラウザの中で 僕らは どこへでも行ける\n\nshutdown -h now\n...See you, htmlOS\n";
  const SONG_CREDIT = "htmlOS（テーマソング）\n\n作曲・歌: Suno で作成\n作詞: Claude Sonnet 5.5\n\nhtmlOS に最初から入っている曲です（htmlOS 6.0.7 から）。\nhPlayer で htmlOS.mp3 を開くと、歌詞（lyrics.txt）も一緒に表示されます。\nHDD2（IndexedDB）・HDD1（PC のフォルダ）にインストールした htmlOS では、曲のデータをそのドライブに保存します（最初の起動で読み込みます）。\n保存できるまでは、配布元の media/htmlOS.mp3 から読み込みます（インターネットにつながっていないと再生できません）。\n";
  function songURL() {
    try { if (/^https?:$/.test(location.protocol)) return new URL('media/htmlOS.mp3', location.href).href; } catch (e) { /* 下へ */ }
    return 'https://yusato8884.github.io/htmlOS/media/htmlOS.mp3';
  }
  //   6.0.9: HDD1（PC のフォルダ）から起動しているときは、曲のデータを読み込んでローカル（HDD1 の実ファイル）に保存する。
  //   6.1.0: HDD2（IndexedDB）から起動しているときも同じくローカルに保存する。RAM ディスクなどではオンラインの曲を指すだけ
  const SONG = MUSIC_DIR + '/htmlOS.mp3';
  const songLocal = () => { try { const n = fs.stat(SONG); return !!(n && /^data:audio\//.test(n.c || '')); } catch (e) { return false; } };
  let fetching = false;
  function fetchSong() {
    if (fetching || !(OS.store.disk || OS.store.idb) || songLocal()) return;
    fetching = true;
    const log = m => { if (OS.journal) { try { OS.journal.log('htui', m); } catch (e) { /* 無視 */ } } };
    fetch(songURL()).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).replace(/^data:[^;,]*/, 'data:audio/mpeg')); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); }))
      .then(d => { fs.write(SONG, d, { bin: true }); log('テーマソングを ' + OS.storeLabel() + ' に保存しました（' + SONG + '）'); })
      .catch(e => log('テーマソングを ' + OS.storeLabel() + ' に保存できませんでした（' + e.message + '）。次に起動したときにもう一度試します'))
      .then(() => { fetching = false; });
  }
  function installMusic() {
    const stamp = MUSIC_DIR + '/.version', want = (OS.version || '') + '/' + songURL();
    let done = false; try { done = fs.read(stamp) === want; } catch (e) { /* まだない */ }
    if (done) { fetchSong(); return; }
    try {
      fs.mkdir(MUSIC_DIR, { parents: true });
      if (!songLocal()) fs.write(SONG, songURL(), { bin: true }); // ローカルに保存してあれば、そのまま使う
      fs.write(MUSIC_DIR + '/lyrics.txt', SONG_LYRICS);
      fs.write(MUSIC_DIR + '/README.txt', SONG_CREDIT);
      fs.write(stamp, want);
    } catch (e) { /* 書けなくても続ける */ }
    fetchSong();
  }
  // ユーザーの ~/Music に、同梱の曲のフォルダへのリンクを置く（一度だけ。消したら作り直さない）
  function linkMusic(user) {
    const home = users.home(user), link = home + '/Music/htmlOS';
    if (htui.prefs.musicLinked) return;
    try { if (fs.isDir(home + '/Music') && !fs.exists(link) && !fs.isLink(link)) fs.symlink(MUSIC_DIR, link, { owner: user }); } catch (e) { /* 作れなくてもよい */ }
    htui.setPrefs({ musicLinked: true });
  }
  const fileCache = new Map();
  function wallFileCss(p) {
    const st = fs.stat(p); if (!st || st.t !== 'f') return null;
    const hit = fileCache.get(p); if (hit && hit.m === st.m) return hit.css;
    const c = st.c || ''; let css = null;
    if (/^data:image\//.test(c)) css = 'url("' + c + '") center / cover no-repeat #000';
    else if (/<svg[\s>]/.test(c)) css = 'url("data:image/svg+xml,' + encodeURIComponent(c) + '") center / cover no-repeat ' + ((/data-fallback='([^']+)'/.exec(c) || [])[1] || '#000');
    fileCache.set(p, { m: st.m, css: css });
    return css;
  }
  // フォルダごとの壁紙の一覧（新しいバージョンが上）: [{ dir, label, items: [{ path, name }] }]
  function wallList() {
    let dirs = [];
    try { dirs = fs.list(WALLDIR).filter(n => n[0] !== '.' && fs.isDir(WALLDIR + '/' + n)); } catch (e) { /* フォルダがない */ }
    const ver = n => parseFloat(n) || 0;
    dirs.sort((a, b) => ver(b) - ver(a) || a.localeCompare(b));
    return dirs.map(n => {
      const dp = WALLDIR + '/' + n;
      const items = fs.list(dp).filter(f => f[0] !== '.' && !fs.isDir(dp + '/' + f)).map(f => {
        const p = dp + '/' + f; let name = f.replace(/\.[^.]+$/, '');
        try { const t = /<title>([^<]*)<\/title>/.exec(fs.read(p).slice(0, 600)); if (t) name = t[1]; } catch (e) { /* ファイル名のまま */ }
        return { path: p, name: name };
      }).filter(it => wallFileCss(it.path));
      const order = WALLPAPERS.map(w => w.path);
      items.sort((a, b) => ((order.indexOf(a.path) + 1) || 999) - ((order.indexOf(b.path) + 1) || 999) || a.name.localeCompare(b.name));
      return { dir: n, label: /^\d/.test(n) ? 'htmlOS ' + n.replace(/-/g, ' ') : n, items: items };
    }).filter(g => g.items.length);
  }
  // 今の壁紙のファイル（番号で覚えている古い設定も、ファイルに直して返す）
  const wallPath = p => typeof p.wallpaper === 'string' ? p.wallpaper : (WALLPAPERS[p.wallpaper | 0] || WALLPAPERS[0]).path;
  const ACCENTS = ['#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac'];

  const htui = OS.htui = { running: false, user: null, fs: null, wins: [], z: 10, pid: 100, wallpapers: WALLPAPERS, wallCss: wallCss, wallDir: WALLDIR, wallList: wallList, wallPath: wallPath, starWallpaper: starWallpaper, installWallpapers: installWallpapers, accents: ACCENTS, el: null, prefs: {}, shell: null, sessionId: null };
  let clockTimer = null, ticks = [];
  // 時計などの表示を新しくする（clock.service が 1 秒ごとに呼ぶ）
  htui.tick = () => { const d = new Date(); ticks.forEach(f => { try { f(d); } catch (e) { /* 無視 */ } }); };

  // ---------- セッション（デスクトップ環境）の登録。パッケージからも OS.registerSession で追加できる
  OS.sessions = {};
  OS.registerSession = function (def) { def.pkg = def.pkg || OS._loading || null; OS.sessions[def.id] = def; };

  function avatar(u, size) {
    const st = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.45) + 'px;';
    if (u && u.img) return h('span', { class: 'avatar', style: st + 'background-image:url("' + u.img + '")' });
    return h('span', { class: 'avatar', style: st + 'background-color:' + ((u && u.color) || '#5e5c64') }, ((u && u.name) || '?').charAt(0).toUpperCase());
  }
  htui.avatar = avatar;

  // ---------- 起動・終了
  htui.start = function (user, sid) {
    if (htui.running) return false;
    htui.running = true;
    installWallpapers(); installMusic();
    htui.el = h('div', { id: 'htui' });
    OS.root.append(htui.el);
    document.addEventListener('keydown', hotkeys); document.addEventListener('keyup', keyUp); document.addEventListener('contextmenu', onContext); window.addEventListener('blur', altTabEnd);
    if (user && users.get(user)) session(user, sid); else toLogin();
    return true;
  };
  function clearShell() {
    clearInterval(clockTimer); ticks = [];
    if (OS.bgm) OS.bgm.stop();
    if (htui.sessionProc && OS.proc) { OS.proc.exit(htui.sessionProc.pid); htui.sessionProc = null; }
    if (htui.shell && htui.shell.onStop) { try { htui.shell.onStop(); } catch (e) { /* 無視 */ } }
    htui.shell = null; htui.sessionId = null;
    if (unwatchDesk) { unwatchDesk(); unwatchDesk = null; }
    htui.iconsEl = null; htui.deskOpt = null; htui.titleEl = null; htui.modeBtn = null; htui.userBtn = null; htui.tasks = null; htui.desk = null;
  }
  htui.stop = function () {
    if (!htui.running) return false;
    htui.wins.slice().forEach(w => w.close(true));
    Object.keys(parked).forEach(u => htui.endParked(u, true));
    clearShell();
    if (OS.hdm) OS.hdm.stop();
    document.removeEventListener('keydown', hotkeys); document.removeEventListener('keyup', keyUp); document.removeEventListener('contextmenu', onContext); window.removeEventListener('blur', altTabEnd); altTabEnd(true);
    htui.el.remove(); htui.el = null;
    htui.running = false; htui.user = null; htui.fs = null; htui.locked = false;
    if (OS.power) OS.power.apply();
    OS.setMode('auto');
    OS.tty1.focus();
    return true;
  };
  htui.logout = async function () {
    for (const w of htui.wins.slice()) { if ((await w.close()) === false) return; }
    OS.sound.play('logout');
    toLogin();
  };
  // ---------- ロック（5.3）: ウィンドウはそのままで、ログイン画面と同じ見た目のロック画面を重ねる。パスワードで外れる
  htui.locked = false;
  htui.lock = function () {
    if (!htui.running || !htui.user || htui.locked) return false;
    closeMenus(); altTabEnd(true);
    const inner = h('div'), wrap = h('div', { class: 'lock-wrap', role: 'dialog', 'aria-label': 'ロック中' }, inner);
    htui.el.append(wrap); htui.locked = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    OS.hdm.show(inner, () => {
      wrap.remove(); htui.locked = false;
      if (OS.ipc) { try { OS.ipc.publish('session.unlock', { user: htui.user }, 'htui'); } catch (e) { /* 無視 */ } }
      const w = htui.active(); if (w) w.focus();
    }, { lock: htui.user, sid: htui.sessionId });
    if (OS.ipc) { try { OS.ipc.publish('session.lock', { user: htui.user }, 'htui'); } catch (e) { /* 無視 */ } }
    return true;
  };
  // ---- ハイバーネート（6.0.4）: メモリ上の状態を書き出す・広げる
  //   アプリは win.onHibernate() で自分の状態を返せる（戻るときは launch({ resume: その状態 }) で開く）。
  //   返さないアプリは、ウィンドウの中の入力欄（textarea・input・select）の中身を残して、開き直したあとに書き戻す
  const FIELD_MAX = 1 << 20;
  function captureFields(w) {
    const out = [];
    w.body.querySelectorAll('textarea, input, select').forEach((e, i) => {
      const t = (e.type || '').toLowerCase();
      if (t === 'password' || t === 'file' || t === 'hidden' || t === 'button' || t === 'submit') return; // パスワードは書き出さない
      if (t === 'checkbox' || t === 'radio') { out.push({ i: i, tag: e.tagName, c: e.checked }); return; }
      if (String(e.value).length > FIELD_MAX) return;
      const f = { i: i, tag: e.tagName, v: e.value };
      if (e.tagName === 'TEXTAREA') { f.s = e.selectionStart; f.e = e.selectionEnd; f.top = e.scrollTop; }
      out.push(f);
    });
    return out;
  }
  function restoreFields(w, fields) {
    if (w.closed || !fields || !fields.length) return;
    const els = w.body.querySelectorAll('textarea, input, select');
    fields.forEach(f => {
      const e = els[f.i]; if (!e || e.tagName !== f.tag) return;
      if ('c' in f) { if (e.checked !== f.c) { e.checked = f.c; e.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (e.value !== f.v) { e.value = f.v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
      if (f.s != null) { try { e.setSelectionRange(f.s, f.e); } catch (er) { /* 選べない欄 */ } }
      if (f.top) e.scrollTop = f.top;
    });
  }
  function snapWin(w) {
    const st = w.el.style, px0 = (v, d) => (/px$/.test(v || '') && isFinite(parseFloat(v)) ? parseFloat(v) : d);
    const r = w.zone && w.rect ? { x: w.rect.l, y: w.rect.t, w: w.rect.w, h: w.rect.h }
      : { x: px0(st.left, w.el.offsetLeft), y: px0(st.top, w.el.offsetTop), w: px0(st.width, w.el.offsetWidth), h: px0(st.height, w.el.offsetHeight) };
    let state = null;
    if (w.onHibernate) { try { state = w.onHibernate(); } catch (e) { state = null; } }
    return { app: w.app, arg: typeof w.launchArg === 'string' ? w.launchArg : null, title: w.title, ws: w.ws | 0,
      zone: w.zone || null, max: w.el.classList.contains('max'), min: w.el.classList.contains('hidden'),
      x: r.x, y: r.y, w: r.w, h: r.h, state: state, fields: state == null ? captureFields(w) : null };
  }
  // 今ログインしているユーザー全員（切り替えで残しているユーザーも）の状態
  htui.hibernateImage = function () {
    const z = w => +w.el.style.zIndex || 0;
    const cap = (wins, cur, sid) => ({ sid: sid, cur: cur | 0, wins: wins.filter(w => !w.parent && !w.closed && w.app && OS.apps[w.app]).sort((a, b) => z(a) - z(b)).map(snapWin) });
    const us = {};
    Object.keys(parked).forEach(u => { const p = parked[u]; us[u] = cap(p.wins, p.cur, p.sid); });
    if (htui.user) us[htui.user] = cap(htui.wins, htui.ws.cur, htui.sessionId);
    return { v: 2, at: Date.now(), last: htui.user || Object.keys(parked)[0] || null, users: us };
  };
  // そのユーザーがログインしたら、書き出しておいた状態を広げる
  function resume(user) {
    const img = OS.hibernation && OS.hibernation();
    const me = img && img.users[user]; if (!me) return;
    delete img.users[user];
    try { OS.hibernation(Object.keys(img.users).length ? img : null); } catch (e) { /* 無視 */ }
    const dw = htui.desk ? htui.desk.clientWidth : 800, dh = htui.desk ? htui.desk.clientHeight : 600;
    const opened = [];
    (me.wins || []).forEach(s => {
      if (!OS.apps[s.app]) return;
      const before = new Set(htui.wins);
      try { OS.launch(s.app, s.state != null ? { resume: s.state } : (s.arg || undefined)); } catch (e) { return; }
      const w = htui.wins.find(x => !before.has(x) && !x.parent); if (!w) return;
      opened.push({ w: w, s: s });
      w.ws = Math.max(0, Math.min(s.ws | 0, htui.ws.count - 1));
      if (s.w && s.h) {
        const ww = Math.min(s.w, dw), hh = Math.min(s.h, dh);
        w.el.style.width = ww + 'px'; w.el.style.height = hh + 'px';
        w.el.style.left = Math.max(0, Math.min(s.x, dw - ww)) + 'px'; w.el.style.top = Math.max(0, Math.min(s.y, dh - hh)) + 'px';
      }
      if (s.max && !w.el.classList.contains('max')) { const b = w.el.querySelector('.win-btn[aria-label="最大化"]'); if (b) b.click(); }
      else if (s.zone && s.zone !== 'max') w.snap(s.zone, true);
      if (s.fields) { restoreFields(w, s.fields); setTimeout(() => restoreFields(w, s.fields), 250); } // 中身を読み込むのが遅いアプリのために、もう一度
      if (s.min) { w.el.classList.add('hidden'); w.el.classList.remove('active'); w.task.classList.remove('active'); }
    });
    htui.ws.cur = Math.max(0, Math.min(me.cur | 0, htui.ws.count - 1));
    htui.wsApply();
    const top = opened.filter(o => !o.s.min && o.w.ws === htui.ws.cur).pop();
    if (top) top.w.focus(); else focusTop();
    htui.syncTasks();
    const ago = img.at ? Math.round((Date.now() - img.at) / 60000) : null;
    OS.notify({ app: '電源管理', icon: 'battery', title: '休止状態から戻りました', body: opened.length ? 'ウィンドウ ' + opened.length + ' 個を、休止する前の状態に戻しました' + (ago != null ? '（' + (ago < 60 ? ago + ' 分' : Math.round(ago / 60) + ' 時間') + 'ぶり）' : '') : '開いていたウィンドウはありません' });
  }
  // ログイン画面（hdm）へ
  function toLogin(keep) {
    if (htui.user && OS.ipc && !keep) { try { OS.ipc.publish('session.logout', { user: htui.user }, 'htui'); } catch (e) { /* 無視 */ } }
    clearShell();
    htui.user = null; htui.fs = null; htui.prefs = {};
    OS.setMode('auto');
    htui.el.textContent = ''; htui.el.removeAttribute('style'); htui.el.className = ''; htui.locked = false;
    if (OS.power) OS.power.apply();
    OS.hdm.show(htui.el, (user, sid) => { session(user, sid); OS.sound.play('login'); resume(user); });
    const hib = OS.hibernation && OS.hibernation();
    const hu = hib ? Object.keys(hib.users).filter(u => users.get(u)) : [];
    if (hu.length) setTimeout(() => OS.ui.toast('休止状態です。' + hu.join('、') + ' でログインすると、休止する前の状態に戻ります'), 300);
  }

  // ---------- 個人設定（壁紙・アクセント・アニメーション・画面モード）
  function loadPrefs() { try { return JSON.parse(fs.read(users.home(htui.user) + '/.config/htui.json')); } catch (e) { return {}; } }
  htui.setPrefs = function (patch) {
    Object.assign(htui.prefs, patch);
    try { fs.mkdir(users.home(htui.user) + '/.config', { parents: true, owner: htui.user }); fs.write(users.home(htui.user) + '/.config/htui.json', JSON.stringify(htui.prefs), { owner: htui.user }); } catch (e) { /* 保存できなくても表示は変える */ }
    applyPrefs();
    if (patch && 'power' in patch && OS.power) OS.power.apply();
    if (patch && 'bgm' in patch && OS.bgm) OS.bgm.apply();
    if (patch && 'dock' in patch && htui.shell && htui.shell.place) htui.shell.place();
  };
  function applyPrefs() {
    htui.el.style.background = wallCss(htui.prefs, htui.user);
    htui.el.style.setProperty('--accent', htui.prefs.accent || ACCENTS[0]);
    htui.el.classList.toggle('no-anim', htui.prefs.anim === false);
    htui.el.classList.toggle('glass', htui.prefs.glass !== false); // SDK 4: 透明効果（すりガラス）。省電力モードでは CSS で止まる
    OS.setMode(htui.prefs.mode || 'auto');
  }
  // 画像を壁紙にする。大きい画像は長い辺 1920px に縮めて JPEG にし、~/.config/wallpaper に data: URL で保存する
  htui.setWallpaperImage = function (src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const W0 = img.naturalWidth || 1600, H0 = img.naturalHeight || 1000, k = Math.min(1, 1920 / Math.max(W0, H0));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W0 * k)); c.height = Math.max(1, Math.round(H0 * k));
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        let url; try { url = c.toDataURL('image/jpeg', .85); } catch (e) { rej(new Error('この画像は壁紙に使えません')); return; }
        const dir = users.home(htui.user) + '/.config';
        try { htui.fs.mkdir(dir, { parents: true }); htui.fs.write(dir + '/wallpaper', url); } catch (e) { rej(e); return; }
        htui.setPrefs({ wallpaper: 'custom' }); res(url.length);
      };
      img.onerror = () => rej(new Error('画像を読み込めませんでした'));
      img.src = src;
    });
  };
  htui.hasCustomWallpaper = () => { try { return !!fs.read(users.home(htui.user) + '/.config/wallpaper'); } catch (e) { return false; } };
  htui.refreshUser = function () {
    if (!htui.userBtn) return;
    htui.userBtn.textContent = '';
    htui.userBtn.append(avatar(users.get(htui.user), 20), h('span', { class: 'p-uname' }, htui.user));
  };

  // ---------- セッション開始
  function session(user, sid) {
    clearShell();
    const pk = parked[user]; delete parked[user];
    if (pk) pk.wins = pk.wins.filter(w => !w.closed);
    htui.user = user;
    if (OS.ipc) { try { OS.ipc.publish(pk ? 'session.resume' : 'session.login', { user: user }, 'htui'); } catch (e) { /* 無視 */ } }
    htui.fs = OS.fsFor(() => htui.user);
    const sh = OS.sessions[sid] || OS.sessions[OS.hdm.sessionFor(user)] || OS.sessions.htui;
    htui.shell = sh; htui.sessionId = sh.id;
    htui.el.textContent = ''; htui.el.className = 'desktop de-' + sh.id;
    htui.prefs = loadPrefs(); applyPrefs();
    linkMusic(user);
    htui.wsReset();
    sh.build(kit);
    if (!htui.desk) kit.desk(false, true);
    if (!htui.tasks) htui.tasks = h('div'); // タスクボタンを出さない環境でも、ウィンドウ側が参照するので置き場だけ作る
    if (pk) { // ユーザーの切り替えで残しておいたウィンドウを戻す
      htui.wins = pk.wins; htui.z = Math.max(htui.z, pk.z || 0);
      htui.wins.forEach(w => { if (w.task) htui.tasks.append(w.task); });
      htui.allWins().forEach(w => htui.desk.append(w.el));
      htui.ws.cur = Math.max(0, Math.min(pk.cur | 0, htui.ws.count - 1));
    }
    // タッチ用の下部ナビ。HTUi だけが使う（ほかの環境は、それぞれのやり方で操作する）
    if (sh.touchNav) {
      const navBtn = (icon, label, fn) => h('button', { class: 'nav-btn', type: 'button', onclick: fn }, OS.icon(icon, 22), h('span', null, label));
      htui.el.append(h('div', { class: 'tabbar' },
        navBtn('x', '閉じる', () => { const w = htui.active(); if (w) w.close(); }),
        navBtn('home', 'ホーム', goHome),
        navBtn('grid', 'タスク', switcher)));
    }
    htui.notices = pk ? pk.notices : [];
    if (!pk) OS.notify({ app: 'htmlOS', icon: 'user', title: 'ようこそ、' + user + ' さん', body: sh.name + ' にログインしました', silent: true });
    const tick = () => ticks.forEach(f => { try { f(new Date()); } catch (e) { /* 無視 */ } });
    tick(); if (!(OS.init && OS.init.has('clock.service'))) clockTimer = setInterval(tick, 5000);
    // ログインセッションのプロセス（アプリのウインドウはこの子になる）
    if (pk && pk.proc && OS.proc && OS.proc.get && OS.proc.get(pk.proc.pid)) htui.sessionProc = pk.proc;
    else if (OS.proc) {
      const hs = OS.init && OS.init.state('htui.service');
      // シグナルは、このユーザーが使っているときはログアウト、切り替えで残しているときはそのセッションを終える
      htui.sessionProc = OS.proc.spawn({ name: 'htui-session', cmd: 'htui-session ' + sh.id + '（' + user + '）', user: user, kind: 'session', ppid: (hs && hs.pid) || 1,
        onsignal: sig => {
          if (htui.user !== user) { htui.endParked(user, sig === 'KILL'); return true; }
          if (sig === 'KILL') { htui.wins.slice().forEach(w => w.close(true)); toLogin(); } else htui.logout();
          return true;
        } });
    }
    htui.refreshApps(); htui.refreshUser(); htui.syncMode(); htui.syncTitle(); watchDesk();
    if (sh.onStart) sh.onStart(kit);
    htui.wsApply();
    htui.syncTasks();
    if (OS.power) OS.power.apply(); // 電源管理（ユーザーの設定どおり）
    if (OS.bgm) OS.bgm.apply(); // アンビエントサウンド（ユーザーの設定どおり）
    // セーフモードの印と、新しいバージョンのお知らせ
    if (OS.safe) {
      htui.el.append(h('div', { class: 'safe-mark', 'aria-hidden': 'true' }, h('span', null, 'セーフモード'), h('span', null, 'セーフモード'), h('span', null, 'セーフモード'), h('span', null, 'セーフモード')));
      setTimeout(() => OS.notify({ app: 'htmlOS', icon: 'gear', title: 'セーフモードで起動しています', body: '追加したアプリ（パッケージ）と ~/.jshrc は無効です。ふつうに再起動すると元に戻ります' }), 600);
    } else if (!OS.live && BOOT.version && OS.version && BOOT.version !== OS.version) {
      setTimeout(() => OS.notify({ app: 'htmlOS', icon: 'download', title: BOOT.osName(BOOT.version, BOOT.codename) + ' に更新できます', body: 'Alt を押しながら起動して htmlOS i を開き、「アップデート」を選んでください（いまは ' + OS.version + '）' }), 1500);
    }
  }
  htui.switchSession = async function (sid) {
    if (!OS.sessions[sid] || !htui.user) return;
    for (const w of htui.wins.slice()) { if ((await w.close()) === false) return; }
    session(htui.user, sid);
  };

  htui.syncMode = function () {
    const b = htui.modeBtn; if (!b) return;
    const t = '画面モード: ' + OS.modeNames[OS.modePref] + (OS.modePref === 'auto' ? '（今は' + OS.modeNames[OS.uiMode] + '）' : '') + '。押すと切り替え';
    b.textContent = ''; b.append(OS.icon(OS.modeIcons[OS.uiMode], 18)); b.title = t; b.setAttribute('aria-label', t);
  };
  htui.syncTitle = function () {
    const w = htui.active();
    if (htui.titleEl) htui.titleEl.textContent = w ? w.title : '';
    if (htui.shell && htui.shell.onActive) htui.shell.onActive(w);
    htui.syncTasks();
  };
  function goHome() {
    const sw = htui.el.querySelector('.switcher:not(.leaving)'); if (sw) leave(sw);
    htui.wins.forEach(w => { w.el.classList.add('hidden'); w.el.classList.remove('active'); w.task.classList.remove('active'); });
    htui.syncTitle();
  }
  htui.goHome = goHome;
  // 開いているアプリの一覧（タスク切り替え）
  function switcher() {
    const old = htui.el.querySelector('.switcher:not(.leaving)'); if (old) { leave(old); return; }
    const list = h('div', { class: 'sw-list' });
    const ov = h('div', { class: 'switcher' }, h('div', { class: 'sw-head' }, '開いているアプリ'), list);
    ov.addEventListener('click', e => { if (e.target === ov || e.target === list) leave(ov); });
    const fill = () => {
      list.textContent = '';
      if (!htui.wins.length) list.append(h('p', { class: 'sw-empty' }, '開いているアプリはありません'));
      htui.wins.forEach(w => list.append(h('div', { class: 'sw-card' },
        h('button', { class: 'sw-open', type: 'button', onclick: () => { leave(ov); w.focus(); } }, OS.icon((OS.apps[w.app] || {}).icon || 'file', 22), h('span', null, w.title)),
        h('button', { class: 'sw-x', type: 'button', title: '閉じる', 'aria-label': w.title + ' を閉じる', onclick: async () => { await w.close(); fill(); } }, OS.icon('x', 18)))));
    };
    fill(); htui.el.append(ov);
  }
  // モードが変わったとき: タッチ系は全ウィンドウを全画面に、デスクトップに戻ったら元の大きさに
  htui.onMode = function (changed) {
    if (!htui.running || !htui.user) return;
    htui.syncMode();
    if (changed === false) return;
    htui.wins.forEach(w => {
      if (!OS.touch) { w.free = false; w.el.classList.remove('free'); }
      if (OS.touch && !w.free) w.snap('max', true); else if (!OS.touch && w.zone === 'max') w.unsnap(true);
    });
    htui.syncTitle();
    htui.refreshDesk();
    if (htui.shell && htui.shell.onMode) htui.shell.onMode();
  };

  // ---------- 通知。OS.notify({ app, icon, title, body, silent }) / OS.notify('文字列')
  //   ため込んだ通知は htui.notices（ログインごとに空になる）。表示のしかたは環境ごとに onNotify で変えられる
  htui.notices = [];
  let noticeSeq = 0;
  OS.notify = function (n) {
    n = typeof n === 'string' ? { title: n } : Object.assign({}, n);
    n.id = ++noticeSeq; n.time = Date.now(); n.unread = !n.silent;
    if (OS.journal) OS.journal.log('notifyd', (n.app ? n.app + ': ' : '') + n.title + (n.body ? ' — ' + n.body : ''), { prio: 6 });
    if (OS.ipc) { try { OS.ipc.publish('notify', { app: n.app || null, title: String(n.title == null ? '' : n.title), body: n.body == null ? '' : String(n.body) }, 'notifyd'); } catch (e) { /* 無視 */ } }
    if (!htui.running || !htui.user) return n;
    htui.notices.unshift(n); htui.notices.length = Math.min(htui.notices.length, 50);
    if (OS.init && OS.init.has('notifyd.service') && !OS.init.isActive('notifyd.service')) return n; // 通知のサービスが止まっている: ため込むだけで出さない
    if (htui.shell && htui.shell.onNotify) htui.shell.onNotify(n);
    else if (!n.silent && !htui.prefs.dnd) ui.toast(n.title + (n.body ? '：' + n.body : ''));
    if (!n.silent && !htui.prefs.dnd) OS.sound.play('notify');
    return n;
  };
  // ---------- ゴミ箱（~/.Trash）。元の場所は ~/.Trash/.info.json に覚えておき、「元に戻す」で戻せる
  const trash = htui.trash = {
    dir: () => users.home(htui.user) + '/.Trash',
    ensure() { const d = trash.dir(); if (!htui.fs.isDir(d)) htui.fs.mkdir(d, { parents: true }); return d; },
    info() { try { return JSON.parse(htui.fs.read(trash.dir() + '/.info.json')) || {}; } catch (e) { return {}; } },
    save(i) { htui.fs.write(trash.dir() + '/.info.json', JSON.stringify(i)); },
    inside: p => p === trash.dir() || p.startsWith(trash.dir() + '/'),
    items() { try { return htui.fs.list(trash.dir()).filter(n => n !== '.info.json'); } catch (e) { return []; } },
    move(p) {
      if (trash.inside(p)) throw new Error('ゴミ箱の中のものは「完全に削除」してください');
      const d = trash.ensure(), dest = htui.fs.unique(d + '/' + OS.path.base(p));
      htui.fs.mv(p, dest);
      const i = trash.info(); i[OS.path.base(dest)] = { from: p, at: Date.now() }; trash.save(i);
      return dest;
    },
    from: name => (trash.info()[name] || {}).from || null,
    restore(name) {
      const e = trash.info()[name]; if (!e) throw new Error(name + ' の元の場所が分かりません');
      const to = htui.fs.exists(e.from) ? htui.fs.unique(e.from) : e.from;
      if (!htui.fs.isDir(OS.path.dir(to))) htui.fs.mkdir(OS.path.dir(to), { parents: true });
      htui.fs.mv(trash.dir() + '/' + name, to);
      const i = trash.info(); delete i[name]; trash.save(i);
      return to;
    },
    remove(name) { htui.fs.rm(trash.dir() + '/' + name, { recursive: true }); const i = trash.info(); delete i[name]; trash.save(i); },
    async empty(ask) {
      const n = trash.items().length; if (!n) return false;
      if (ask && !(await ui.confirm('ゴミ箱の ' + n + ' 個の項目を完全に削除しますか? 元に戻せません。', { ok: '空にする', danger: true, title: 'ゴミ箱を空にする' }))) return false;
      trash.items().forEach(x => htui.fs.rm(trash.dir() + '/' + x, { recursive: true })); trash.save({});
      return true;
    }
  };
  // ファイルのコピー・切り取り（hFile とデスクトップで共通）
  htui.fileClip = null;
  htui.pasteInto = function (dir) {
    const c = htui.fileClip; if (!c) return null;
    if (!OS.fs.exists(c.path)) { htui.fileClip = null; throw new Error('元のファイルがなくなっています'); }
    const d = htui.fs.unique(OS.path.join(dir, OS.path.base(c.path)));
    if (c.cut) { htui.fs.mv(c.path, d); htui.fileClip = null; } else htui.fs.cp(c.path, d);
    return d;
  };
  // ファイルの情報
  htui.fileInfo = function (p) {
    const ls = OS.fs.lstat(p), s = OS.fs.stat(p) || ls;
    if (!ls) { ui.alert(p + ' はありません'); return; }
    const from = trash.inside(p) ? trash.from(OS.path.base(p)) : null;
    const rows = [['場所', p], ['種類', ls.t === 'l' ? 'シンボリックリンク → ' + ls.c : s.t === 'd' ? 'フォルダ' : (fs.kind(p) + (s.b ? '（バイナリ）' : ''))],
      ['大きさ', s.t === 'd' ? fs.list(p).length + ' 個の項目' : fmtSize(s.c.length)], ['所有者', s.o || 'root'], ['変更日時', new Date(s.m).toLocaleString('ja-JP')]];
    if (from) rows.push(['元の場所', from]);
    ui.modal({ title: OS.path.base(p) + ' の情報', body: h('dl', { class: 'hf-info' }, rows.map(r => [h('dt', null, r[0]), h('dd', null, r[1])])), buttons: [{ label: '閉じる', primary: true, cancel: true, value: true }] });
  };
  htui.askName = async (msg, def, title, dir) => {
    const n = await ui.prompt(msg, def, { title: title });
    if (!n) return null;
    if (n.includes('/') || n === '.' || n === '..') throw new Error('その名前は使えません');
    if (dir && htui.fs.exists(OS.path.join(dir, n))) throw new Error(n + ' はすでにあります');
    return n;
  };
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';

  // ---------- デスクトップ: ~/Desktop の中身を並べるファイル置き場（タッチモードの HTUi だけはアプリのランチャー）
  //   左上（hAqua は右上）から、ホーム・/（ルート）・ゴミ箱（HTUi と hWin）・~/Desktop のファイルの順に並ぶ
  const KIND_COLOR = { text: '#5e5c64', html: '#e66100', image: '#2ec27e', audio: '#9141ac', video: '#c01c28', other: '#77767b' };
  const deskDir = () => users.home(htui.user) + '/Desktop';
  htui.refreshApps = function () {
    if (htui.shell && htui.shell.onApps) htui.shell.onApps();
    htui.syncTasks();
    htui.refreshDesk();
  };
  htui.refreshDesk = function () {
    const box = htui.iconsEl, o = htui.deskOpt;
    if (!box || !o || !htui.user) return;
    const keep = [...box.querySelectorAll('.sel')].map(b => b.dataset.path);
    box.textContent = '';
    // 登場のアニメーションは最初の 1 回だけ（ファイルが変わって並べ直すたびには動かさない）
    if (!box._shown) { box._shown = true; box.classList.add('intro'); setTimeout(() => box.classList.remove('intro'), 900); }
    const apps = OS.touch && o.appsOnTouch;
    box.classList.toggle('apps', apps); box.classList.toggle('files', !apps);
    if (apps) {
      Object.values(OS.apps).filter(a => !a.hidden).forEach(a => box.append(h('button', { class: 'desk-icon', type: 'button', title: a.desc || a.name, 'data-app': a.id, onclick: () => run(a.id) },
        kit.appIcon(a, 26), h('span', { class: 'desk-label' }, a.name))));
      return;
    }
    if (!o.files) return;
    const home = users.home(htui.user), dd = deskDir();
    try { if (!htui.fs.isDir(dd)) htui.fs.mkdir(dd, { parents: true }); } catch (e) { /* 作れなくても表示は続ける */ }
    const add = x => { const b = deskIcon(x); if (keep.includes(x.path)) b.classList.add('sel'); box.append(b); };
    add({ special: 'home', name: 'ホーム', icon: 'home', color: '#26a269', path: home });
    add({ special: 'root', name: '/（ルート）', icon: 'monitor', color: '#3d3846', path: '/' });
    if (o.trash) { const n = trash.items().length; add({ special: 'trash', name: 'ゴミ箱', icon: 'trash', color: n ? '#a35a00' : '#77767b', path: trash.dir(), badge: n || null }); }
    let names = []; try { names = htui.fs.list(dd).filter(n => !n.startsWith('.')); } catch (e) { /* 読めない */ }
    names.map(n => ({ n, p: dd + '/' + n, d: htui.fs.isDir(dd + '/' + n) })).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n, 'ja'))
      .forEach(x => add({ name: x.n, path: x.p, dir: x.d, link: htui.fs.isLink(x.p), icon: x.d ? 'folder' : fileIcon(x.p), color: x.d ? '#3584e4' : KIND_COLOR[fs.kind(x.p)] || KIND_COLOR.other }));
  };
  function deskIcon(o) {
    const b = h('button', { class: 'desk-icon desk-file' + (o.special ? ' sp-' + o.special : '') + (o.link ? ' link' : ''), type: 'button', title: o.path, 'data-path': o.path, draggable: o.special ? 'false' : 'true' },
      h('span', { class: 'dico', style: '--c:' + o.color }, OS.icon(o.icon, 28), o.badge ? h('i', { class: 'dbadge' }, String(o.badge)) : null),
      h('span', { class: 'desk-label' }, o.name));
    b._o = o;
    b.addEventListener('click', e => {
      if (!(e.ctrlKey || e.metaKey)) htui.iconsEl.querySelectorAll('.sel').forEach(x => { if (x !== b) x.classList.remove('sel'); });
      b.classList.toggle('sel', e.ctrlKey || e.metaKey ? !b.classList.contains('sel') : true);
    });
    b.addEventListener('dblclick', () => openDesk(o));
    b.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); openDesk(o); }
      else if (e.key === 'Delete' && !o.special) { e.preventDefault(); toTrash(o.path, e.shiftKey); }
      else if (e.key === 'F2' && !o.special) { e.preventDefault(); renameDesk(o.path); }
    });
    if (!o.special) b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-htmlos-path', o.path); e.dataTransfer.effectAllowed = 'move'; b.classList.add('sel'); });
    // フォルダ・ホーム・ゴミ箱には、デスクトップのアイコンをドロップできる（ゴミ箱なら捨てる、フォルダなら移動）
    if (o.dir || o.special === 'trash' || o.special === 'home') {
      b.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-htmlos-path')) { e.preventDefault(); b.classList.add('drop'); } });
      b.addEventListener('dragleave', () => b.classList.remove('drop'));
      b.addEventListener('drop', e => {
        b.classList.remove('drop');
        const src = e.dataTransfer.getData('text/x-htmlos-path'); if (!src || src === o.path) return;
        e.preventDefault(); e.stopPropagation();
        try { if (o.special === 'trash') trash.move(src); else htui.fs.mv(src, htui.fs.unique(OS.path.join(o.path, OS.path.base(src)))); } catch (er) { ui.alert(er.message); }
      });
    }
    return b;
  }
  function openDesk(o) {
    try { if (o.special || o.dir) run('hfile', o.path); else OS.openFile(o.path); } catch (e) { ui.alert(e.message); }
  }
  async function toTrash(p, now) {
    try {
      if (now) {
        if (!(await ui.confirm(OS.path.base(p) + ' を完全に削除しますか? 元に戻せません。', { ok: '削除', danger: true, title: '完全に削除' }))) return;
        htui.fs.rm(p, { recursive: true });
      } else trash.move(p);
    } catch (e) { ui.alert(e.message); }
  }
  async function renameDesk(p) {
    try { const n = await htui.askName('新しい名前', OS.path.base(p), '名前の変更'); if (!n || n === OS.path.base(p)) return; const d = OS.path.join(OS.path.dir(p), n); if (htui.fs.exists(d)) throw new Error(n + ' はすでにあります'); htui.fs.mv(p, d); } catch (e) { ui.alert(e.message); }
  }
  async function newOnDesk(dir) {
    try { const d = deskDir(); const n = await htui.askName(dir ? 'フォルダの名前' : 'ファイルの名前', dir ? '新しいフォルダ' : '新しいテキスト.txt', dir ? '新しいフォルダ' : '新しいファイル', d); if (!n) return; if (dir) htui.fs.mkdir(d + '/' + n); else htui.fs.write(d + '/' + n, ''); } catch (e) { ui.alert(e.message); }
  }
  // PC のファイルを ~/Desktop に取り込む（ドロップ・メニューから）
  async function importToDesk(files) {
    let ok = 0; const fails = [];
    for (const f of Array.from(files)) {
      try { const c = await OS.net.blobToContent(f, f.name); htui.fs.write(htui.fs.unique(deskDir() + '/' + f.name), c.content, { bin: c.bin }); ok++; }
      catch (e) { fails.push(f.name + ': ' + e.message); }
    }
    if (fails.length) ui.alert('取り込めなかったファイル:\n' + fails.join('\n'));
    else if (ok) ui.toast(ok + ' 個のファイルをデスクトップに取り込みました');
  }
  function pickImport() {
    const inp = h('input', { type: 'file', multiple: true, style: 'display:none' });
    inp.addEventListener('change', () => { importToDesk(inp.files); inp.remove(); });
    document.body.append(inp); inp.click();
  }
  function deskFileMenu(o) {
    if (o.special === 'home') return [{ head: 'ホーム' }, { label: '開く', icon: 'folder', act: () => openDesk(o) }, { label: 'ここで Terminal を開く', icon: 'terminal', act: () => run('terminal', { cmd: 'cd ~' }) }, { label: '情報を見る', act: () => htui.fileInfo(o.path) }];
    if (o.special === 'root') return [{ head: '/（ルート）' }, { label: '開く', icon: 'folder', act: () => openDesk(o) }, { label: 'ここで Terminal を開く', icon: 'terminal', act: () => run('terminal', { cmd: 'cd /' }) }];
    if (o.special === 'trash') return [{ head: 'ゴミ箱' }, { label: '開く', icon: 'trash', act: () => openDesk(o) }, { label: 'ゴミ箱を空にする…', icon: 'trash', disabled: !trash.items().length, act: () => trash.empty(true) }];
    const k = fs.kind(o.path), items = [{ head: o.name + (o.link ? '（リンク）' : '') }, { label: '開く', icon: o.icon, act: () => openDesk(o) }];
    if (!o.dir && (k === 'text' || k === 'html' || k === 'other')) items.push({ label: 'hedit で開く', icon: 'edit', act: () => run('hedit', o.path) });
    if (o.dir) items.push({ label: 'ここで Terminal を開く', icon: 'terminal', act: () => run('terminal', { cmd: 'cd "' + o.path + '"' }) });
    items.push({ sep: true },
      { label: 'コピー', act: () => { htui.fileClip = { path: o.path, cut: false }; ui.toast(o.name + ' をコピーしました'); } },
      { label: '切り取り', act: () => { htui.fileClip = { path: o.path, cut: true }; ui.toast(o.name + ' を切り取りました'); } },
      { label: '名前を変更…', act: () => renameDesk(o.path) },
      { label: 'ゴミ箱に移動', icon: 'trash', act: () => toTrash(o.path) },
      { label: '完全に削除…', act: () => toTrash(o.path, true) },
      { sep: true }, { label: '情報を見る', act: () => htui.fileInfo(o.path) });
    return items;
  }
  // デスクトップの空いているところのクリックで選択を外す・PC のファイルのドロップ
  function wireDesk(d) {
    d.addEventListener('pointerdown', e => { if ((e.target === d || e.target === htui.iconsEl) && htui.iconsEl) htui.iconsEl.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); });
    d.addEventListener('dragover', e => { if (htui.deskOpt && htui.deskOpt.files && !OS.touch && e.dataTransfer.types.includes('Files')) { e.preventDefault(); d.classList.add('drop'); } });
    d.addEventListener('dragleave', e => { if (e.target === d) d.classList.remove('drop'); });
    d.addEventListener('drop', e => { d.classList.remove('drop'); if (e.dataTransfer.files && e.dataTransfer.files.length && htui.deskOpt && htui.deskOpt.files) { e.preventDefault(); importToDesk(e.dataTransfer.files); } });
  }
  // ~/Desktop・ゴミ箱が変わったら並べ直す
  let unwatchDesk = null;
  function watchDesk() {
    if (unwatchDesk) unwatchDesk();
    unwatchDesk = fs.watch(paths => {
      if (!htui.user || !htui.iconsEl) return;
      const dd = deskDir(), tr = trash.dir();
      if (paths.some(p => p === dd || p.startsWith(dd + '/') || p === tr || p.startsWith(tr + '/'))) htui.refreshDesk();
      if (paths.some(p => p === tr || p.startsWith(tr + '/')) && htui.shell && htui.shell.onApps) htui.shell.onApps();
    });
  }
  function run(id, arg) { try { OS.launch(id, arg); } catch (e) { ui.alert(e.message); } }
  htui.run = run;

  // ---------- 右クリックメニュー（文字・タイトルバー・タスクボタン・デスクトップ）
  //   アプリや環境が自分で contextmenu を処理した（preventDefault した）ときは何もしない。
  //   環境は onContext(e) でメニューの項目を返せる（ドックなど）。Shift を押しながら右クリックするとブラウザのメニューを出す
  const isEditable = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|password|number|tel|)$/.test(el.type || '')));
  function textMenu(el) {
    const ed = isEditable(el) ? el : null;
    const sel = window.getSelection(), selText = ed && 'selectionStart' in ed ? ed.value.slice(ed.selectionStart, ed.selectionEnd) : String(sel || '');
    const ss = ed && 'selectionStart' in ed ? [ed.selectionStart, ed.selectionEnd] : null;
    const range = !ed && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    // メニューのボタンを押すとフォーカスが移るので、元の場所と選択範囲に戻してから実行する
    const restore = () => {
      if (ed) { ed.focus({ preventScroll: true }); if (ss && 'setSelectionRange' in ed) { try { ed.setSelectionRange(ss[0], ss[1]); } catch (e) { /* 選べない種類 */ } } }
      else if (range) { sel.removeAllRanges(); sel.addRange(range); }
    };
    const copy = async (text, cut) => {
      restore();
      let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { /* 使えない */ } }
      if (!ok) { ui.toast('コピーできませんでした。Ctrl+C を使ってください'); return; }
      if (cut && ed) { restore(); document.execCommand('delete'); }
    };
    const paste = async () => {
      let t = null; try { t = await navigator.clipboard.readText(); } catch (e) { /* 許可がない */ }
      restore();
      if (t == null) { ui.toast('貼り付けの許可がありません。Ctrl+V を使ってください'); return; }
      if (!document.execCommand('insertText', false, t) && 'setRangeText' in ed) { ed.setRangeText(t, ed.selectionStart, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    const items = [];
    if (ed) items.push({ label: '元に戻す', icon: 'back', act: () => { restore(); document.execCommand('undo'); } }, { label: 'やり直す', icon: 'fwd', act: () => { restore(); document.execCommand('redo'); } }, { sep: true },
      { label: '切り取り', disabled: !selText || ed.readOnly || ed.type === 'password', act: () => copy(selText, true) });
    items.push({ label: 'コピー', disabled: !selText || (ed && ed.type === 'password'), act: () => copy(selText, false) });
    if (ed) items.push({ label: '貼り付け', disabled: ed.readOnly || ed.disabled, act: paste }, { label: '削除', disabled: !selText || ed.readOnly, act: () => { restore(); document.execCommand('delete'); } });
    items.push({ sep: true }, { label: 'すべて選択', act: () => { if (ed) { ed.focus(); if (ed.select) ed.select(); else document.execCommand('selectAll'); } else { const box = el.closest('.win-body,.tty-scr') || el; const r = document.createRange(); r.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(r); } } });
    if (selText && !(ed && ed.type === 'password')) items.push({ sep: true }, { label: '「' + (selText.length > 14 ? selText.slice(0, 14) + '…' : selText) + '」を hBrowser で検索', icon: 'search', act: () => run('hbrowser', selText) });
    return items;
  }
  function winMenu(w) {
    const mac = htui.sessionId === 'mac';
    return [
      { head: w.title },
      { label: mac ? 'しまう' : '最小化', icon: 'min', act: () => w.minimize() },
      { label: w.zone === 'max' ? '元のサイズに戻す' : mac ? '拡大' : '最大化', icon: 'max', act: () => (w.zone === 'max' ? w.unsnap() : w.snap('max')) },
      { label: '左半分に配置', act: () => w.snap('left') }, { label: '右半分に配置', act: () => w.snap('right') },
      { label: '左 3 分の 1 に配置', act: () => w.snap('l3') }, { label: '真ん中 3 分の 1 に配置', act: () => w.snap('c3') }, { label: '右 3 分の 1 に配置', act: () => w.snap('r3') },
      { label: '左上に配置', act: () => w.snap('tl') }, { label: '右上に配置', act: () => w.snap('tr') },
      { label: '左下に配置', act: () => w.snap('bl') }, { label: '右下に配置', act: () => w.snap('br') },
      { sep: true }].concat(htui.wsMoveItems(rootOf(w)), [{ sep: true }, { label: '閉じる', icon: 'x', act: () => w.close() }]);
  }
  htui.winMenu = winMenu;
  function deskMenu() {
    const sid = htui.sessionId, sh = htui.shell || {};
    const files = htui.deskOpt && htui.deskOpt.files && !(OS.touch && htui.deskOpt.appsOnTouch);
    const items = files ? [
      { label: '新しいフォルダ…', icon: 'plus', act: () => newOnDesk(true) },
      { label: '新しいテキストファイル…', icon: 'plus', act: () => newOnDesk(false) },
      { label: '貼り付け' + (htui.fileClip ? '（' + OS.path.base(htui.fileClip.path) + '）' : ''), disabled: !htui.fileClip, act: () => { try { htui.pasteInto(deskDir()); } catch (e) { ui.alert(e.message); } } },
      { label: 'PC から取り込む…', icon: 'upload', act: pickImport },
      { sep: true }] : [];
    items.push(
      { label: 'Terminal を開く', icon: 'terminal', act: () => run('terminal', files ? { cmd: 'cd ~/Desktop' } : undefined) },
      { label: 'ホームフォルダを開く', icon: 'folder', act: () => run('hfile') },
      { sep: true },
      { label: '壁紙を変更…', icon: 'image', act: () => run('settings', 'look') },
      { label: '画面モード…', icon: OS.modeIcons[OS.uiMode], act: () => { const p = htui._ctxAt; setTimeout(() => htui.menuAt(p[0], p[1], kit.modeItems()), 0); } });
    if (sid === 'mac') items.push({ sep: true }, { label: 'Launchpad', icon: 'grid', act: () => sh.launchpad() }, { label: 'Mission Control', icon: 'grid', act: () => sh.missionControl() });
    if (sid === 'gnome') items.push({ sep: true }, { label: 'アクティビティ', icon: 'grid', act: () => sh.overview() });
    if (sid === 'win') items.push({ sep: true }, { label: 'タスクマネージャー', icon: 'chart', act: () => run('htask') });
    items.push({ sep: true }, { label: sid === 'mac' ? 'Mission Control（仮想デスク）' : sid === 'gnome' ? 'ワークスペース（アクティビティ）' : '仮想デスク…', icon: 'desks', act: () => (sid === 'mac' ? sh.missionControl() : sid === 'gnome' ? sh.overview() : htui.wsView()) },
      { label: '新しいデスクトップ', icon: 'plus', disabled: htui.ws.count >= htui.ws.max, act: () => htui.wsAdd(true) });
    const vis = htui.wins.filter(w => !w.el.classList.contains('hidden'));
    if (htui.wins.length) items.push({ sep: true }, vis.length ? { label: 'すべてのウィンドウを最小化', icon: 'min', act: () => vis.forEach(w => w.minimize()) } : { label: 'すべてのウィンドウを戻す', icon: 'max', act: () => htui.wins.forEach(w => w.focus()) });
    if (sh.deskItems) { const more = sh.deskItems(); if (more && more.length) items.push({ sep: true }, ...more); } // SDK 4: 環境が足す項目（HTUi 4 のウィジェットなど）
    items.push({ sep: true }, { label: '設定…', icon: 'gear', act: () => run('settings') });
    return items;
  }
  function onContext(e) {
    if (htui.locked) { e.preventDefault(); return; }
    if (!htui.user || !htui.el || !htui.el.contains(e.target) || e.defaultPrevented) return;
    if (e.shiftKey) return; // Shift+右クリックはブラウザのメニュー
    const t = e.target, at = htui._ctxAt = [e.clientX, e.clientY];
    let items = null;
    const selText = String(window.getSelection() || '');
    if (isEditable(t) || (selText && window.getSelection().containsNode(t, true))) items = textMenu(t);
    if (!items && htui.shell && htui.shell.onContext) items = htui.shell.onContext(e);
    if (!items) { const head = t.closest('.win-head'); if (head && !t.closest('.win-btn,.win-cbtn')) { const w = htui.wins.find(x => x.el.contains(head)); if (w) items = winMenu(w); } }
    if (!items) { const pb = t.closest('.p-pin[data-app]'); if (pb) items = pinMenu(pb.dataset.app); }
    if (!items) { const tb = t.closest('.p-task'); const w = tb && htui.wins.find(x => x.task === tb); if (w) items = [{ head: w.title }, { label: w.el.classList.contains('hidden') ? '元に戻す' : '最小化', icon: 'min', act: () => (w.el.classList.contains('hidden') ? w.focus() : w.minimize()) }, { label: w.zone === 'max' ? '元のサイズに戻す' : '最大化', icon: 'max', act: () => (w.zone === 'max' ? w.unsnap() : w.snap('max')) }, { label: '新しいウィンドウ', icon: 'plus', act: () => run(w.app) }, { sep: true }, { label: '閉じる', icon: 'x', act: () => w.close() }].concat(w.app && OS.apps[w.app] && htui.shell && htui.shell.taskPins ? [{ sep: true }].concat(htui.pins.items(w.app)) : []); }
    if (!items) { const df = t.closest('.desk-file'); if (df && df._o) { htui.iconsEl.querySelectorAll('.sel').forEach(x => x.classList.toggle('sel', x === df)); items = deskFileMenu(df._o); } }
    if (!items) { const di = t.closest('.desk-icon[data-app]'); if (di) { const a = Object.values(OS.apps).find(x => di.title === (x.desc || x.name)); if (a) items = [{ head: a.name }, { label: '開く', icon: a.icon, act: () => run(a.id) }, { label: 'このアプリについて', act: () => ui.alert((a.desc || a.name) + (a.pkg ? '\n（パッケージ ' + a.pkg + '）' : ''), a.name) }]; } }
    if (!items && (t === htui.desk || t.classList.contains('desk-icons') || t.classList.contains('ios-home') || t.classList.contains('ios-grid'))) items = deskMenu();
    e.preventDefault(); // ほかの場所でもブラウザのメニューは出さない
    if (items && items.length) htui.menuAt(at[0], at[1], items);
  }

  // ---------- ポップアップメニュー
  //   items: { label, icon, hint, act } / { sep: true } / { head: '見出し' }
  // 閉じるアニメーションをつけて取り除く。閉じている途中のものは .leaving になり、もう開いているものとして扱わない
  function leave(el) {
    if (!el || !el.isConnected || el.classList.contains('leaving')) return;
    if (htui.animOff()) { el.remove(); return; }
    el.classList.add('leaving'); el.inert = true;
    setTimeout(() => el.remove(), 150);
  }
  htui.leave = leave;
  function buildMenu(items, close) {
    const m = h('div', { class: 'menu', role: 'menu' });
    items.forEach(it => {
      if (it.sep) m.append(h('div', { class: 'menu-sep', role: 'separator' }));
      else if (it.head) m.append(h('div', { class: 'menu-head' }, it.head));
      else m.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', disabled: it.disabled, onclick: () => { close(); it.act(); } },
        it.icon ? OS.icon(it.icon, 16) : null, h('span', null, it.label), it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null));
    });
    return m;
  }
  function openMenu(m, anchor) {
    const off = e => { if (!m.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    function close() { leave(m); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); }
    m._close = close;
    document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true);
    return close;
  }
  function closeMenus() { htui.el.querySelectorAll('.menu:not(.leaving)').forEach(m => m._close ? m._close() : m.remove()); }
  htui.closeMenus = closeMenus;
  // anchor の下（opt.up なら上）に出す
  function menu(anchor, items, right, opt) {
    const old = htui.el.querySelector('.menu:not(.leaving)'); if (old) { const same = old._anchor === anchor; closeMenus(); if (same) return; }
    let close = () => {};
    const m = buildMenu(items, () => close());
    m._anchor = anchor;
    const r = anchor.getBoundingClientRect(), hr = htui.el.getBoundingClientRect();
    m.style.visibility = 'hidden'; m.style.left = '0px'; m.style.top = '0px';
    htui.el.append(m);
    // 画面からはみ出さない位置に置く。下に入らなければ上に、どちらも入らなければ画面の中に収まるよう寄せる
    const mw = m.offsetWidth, mh = m.offsetHeight, H = hr.height, W = hr.width;
    const below = r.bottom - hr.top + 4, above = r.top - hr.top - 4 - mh;
    let top = opt && opt.up ? above : below;
    if (top + mh > H - 4) top = above >= 4 ? above : H - mh - 4;
    if (top < 4) top = below + mh <= H - 4 ? below : 4;
    let left = right ? r.right - hr.left - mw : r.left - hr.left;
    left = Math.max(4, Math.min(left, W - mw - 4));
    if (opt && (opt.beside === 'left' || opt.beside === 'right')) { // 左右の Dock: アイコンの横に
      left = opt.beside === 'left' ? r.right - hr.left + 6 : r.left - hr.left - mw - 6; left = Math.max(4, Math.min(left, W - mw - 4));
      top = Math.min(r.top - hr.top, H - mh - 4);
    }
    m.style.top = Math.max(4, top) + 'px'; m.style.left = left + 'px'; m.style.visibility = '';
    close = openMenu(m, anchor);
  }
  htui.menu = menu;
  // 画面上の点 (x, y) に出す（右クリックメニューなど）。はみ出さないように位置を直す
  htui.menuAt = function (x, y, items) {
    closeMenus();
    let close = () => {};
    const m = buildMenu(items, () => close());
    const hr = htui.el.getBoundingClientRect();
    m.style.left = '0px'; m.style.top = '0px'; m.style.visibility = 'hidden';
    htui.el.append(m);
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(4, Math.min(x - hr.left, hr.width - mw - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(y - hr.top, hr.height - mh - 4)) + 'px';
    m.style.visibility = '';
    close = openMenu(m, null);
  };

  // ---------- デスクトップ環境を作るための部品（shells.js から使う）
  const kit = htui.kit = {
    h: h, icon: OS.icon, avatar: avatar, run: run, menu: menu, menuAt: htui.menuAt,
    apps: () => Object.values(OS.apps).filter(a => !a.hidden), // hidden のアプリ（バージョン情報など）は一覧に出さない
    appIcon(a, size) { return h('span', { class: 'app-ico', style: 'background:' + (a.color || '#5e5c64') }, OS.icon(a.icon, size || 26)); },
    // 時計。fmt(Date) の結果を el に入れ続ける
    clock(el, fmt) { const f = d => { el.textContent = fmt(d); }; ticks.push(f); f(new Date()); return el; },
    pad: n => String(n).padStart(2, '0'),
    // ウィンドウを置く領域。icons=true ならデスクトップアイコンも並べる
    // icons: true（＝ { files, trash, appsOnTouch } をすべて）か、そのオブジェクト。files はファイル置き場、trash はゴミ箱、appsOnTouch はタッチモードならアプリのランチャー
    desk(icons, append) {
      const d = htui.desk = h('div', { class: 'desk' });
      htui.deskOpt = icons === true ? { files: true, trash: true, appsOnTouch: true } : icons || null;
      if (htui.deskOpt) d.append(htui.iconsEl = h('div', { class: 'desk-icons' }));
      wireDesk(d);
      if (append) htui.el.append(d);
      return d;
    },
    modeItems() {
      return ['auto', 'desktop', 'tablet', 'phone'].map(m => ({
        label: OS.modeNames[m] + (m === 'auto' ? '（' + OS.modeNames[OS.autoMode()] + '）' : ''), icon: OS.modeIcons[m === 'auto' ? OS.autoMode() : m],
        hint: m === OS.modePref ? '選択中' : null, act: () => htui.setPrefs({ mode: m }) }));
    },
    // 画面モードの切り替えボタン。アイコンは今のモード（自動のときは、自動で選ばれているモード）を表す
    modeButton(cls, opt) {
      return htui.modeBtn = h('button', { class: cls + ' p-mode', type: 'button', onclick: e => menu(e.currentTarget, kit.modeItems(), true, opt) });
    },
    // ログアウト・CUI・再起動・電源
    powerItems() {
      return [
        { label: 'ロック', icon: 'lock', act: () => htui.lock() },
        { label: 'ログアウト', icon: 'user', act: () => htui.logout() },
        { label: 'HTUi を終了して CUI へ', icon: 'terminal', act: () => htui.stop() },
        { label: '再起動', icon: 'reload', act: () => OS.reboot() },
        { label: 'ハイバーネート', icon: 'battery', act: () => OS.hibernate() },
        { label: '電源を切る', icon: 'power', act: () => OS.poweroff() }
      ];
    },
    // BGM（5.2.1）: クイック設定・コントロールセンター・チャーム・右クリックメニューから使う
    bgmOn: () => OS.bgm.prefs().on,
    bgmSet(patch) { htui.setPrefs({ bgm: Object.assign({}, htui.prefs.bgm || {}, patch) }); },
    bgmToggle() {
      const on = !kit.bgmOn(); kit.bgmSet({ on: on });
      const stopped = on && OS.init && OS.init.has('bgm.service') && !OS.init.isActive('bgm.service');
      OS.ui.toast('BGM を' + (on ? 'オン' : 'オフ') + 'にしました' + (stopped ? '（bgm.service が止まっているので鳴りません）' : ''));
      return on;
    },
    bgmLabel() { const p = OS.bgm.prefs(); return p.on ? OS.bgm.styles[p.style].name : 'オフ'; },
    bgmItems() {
      const p = OS.bgm.prefs(), S = OS.bgm.styles;
      return [{ head: 'BGM（アンビエントサウンド）' }, { label: p.on ? 'BGM をオフにする' : 'BGM をオンにする', icon: 'music', act: () => kit.bgmToggle() }]
        .concat(Object.keys(S).map(id => ({ label: '曲調: ' + S[id].name, hint: p.on && p.style === id ? '選択中' : null, act: () => kit.bgmSet({ style: id, on: true }) })));
    },
    userButton(cls, opt) {
      const b = htui.userBtn = h('button', { class: cls, type: 'button', onclick: e => menu(e.currentTarget, [{ label: '設定', icon: 'gear', act: () => run('settings') }, { sep: true }].concat(kit.powerItems()), true, opt) });
      return b;
    }
  };

  // ---------- アイコンの固定（5.2）。タスクバー・Dock に固定したアプリを、環境ごとにユーザーの設定（htui.prefs.pins）に覚える
  //   既定は環境の pins。環境の taskPins が true なら、htui.tasks の先頭に固定したアプリのボタンを並べ、そのアプリのウィンドウのボタンはまとめる
  htui.pins = {
    env: () => htui.sessionId || 'htui',
    list(env) {
      env = env || htui.pins.env();
      const p = (htui.prefs.pins || {})[env], def = (OS.sessions[env] && OS.sessions[env].pins) || [];
      return (Array.isArray(p) ? p : def).filter((id, i, l) => OS.apps[id] && l.indexOf(id) === i);
    },
    has: (id, env) => htui.pins.list(env).includes(id),
    set(list, env) {
      env = env || htui.pins.env();
      htui.setPrefs({ pins: Object.assign({}, htui.prefs.pins || {}, { [env]: list.slice() }) });
      htui.refreshApps(); htui.syncTasks();
    },
    toggle(id, env) { const l = htui.pins.list(env), on = !l.includes(id); htui.pins.set(on ? l.concat(id) : l.filter(x => x !== id), env); return on; },
    // 固定した中での並び替え（d = -1 で前へ、+1 で後ろへ）
    move(id, d, env) { const l = htui.pins.list(env), i = l.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= l.length) return; l.splice(i, 1); l.splice(j, 0, id); htui.pins.set(l, env); },
    // 右クリックメニューの項目
    items(id) {
      if (!OS.apps[id]) return [];
      const on = htui.pins.has(id), where = (htui.shell && htui.shell.pinWhere) || 'タスクバー', l = htui.pins.list(), i = l.indexOf(id);
      const out = [{ label: on ? where + 'から固定を解除' : where + 'に固定', icon: 'pin', act: () => htui.pins.toggle(id) }];
      if (on && i > 0) out.push({ label: '前へ移動', icon: 'back', act: () => htui.pins.move(id, -1) });
      if (on && i < l.length - 1) out.push({ label: '後ろへ移動', icon: 'play', act: () => htui.pins.move(id, 1) });
      return out;
    }
  };
  const zOrder = l => l.slice().sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
  // 固定したアプリ（Dock のアイコン）を押したとき: なければ起動、1 つならそのウィンドウを出す・しまう、いくつもあれば一覧
  htui.openPinned = function (id, anchor, side) {
    const ws = zOrder(htui.wins.filter(w => w.app === id && !w.parent));
    closeMenus();
    if (!ws.length) { if (anchor && !htui.animOff()) { anchor.classList.remove('bounce'); void anchor.offsetWidth; anchor.classList.add('bounce'); } run(id); return; }
    const top = ws[0], shown = top.el.classList.contains('active') && !top.el.classList.contains('hidden');
    if (ws.length === 1 || !anchor) { if (shown && ws.length === 1) top.minimize(); else top.focus(); return; }
    if (!shown) { top.focus(); return; }
    menu(anchor, ws.map(w => ({ label: w.title, icon: (OS.apps[id] || {}).icon, hint: w.el.classList.contains('hidden') ? 'しまってある' : null, act: () => w.focus() })).concat({ sep: true }, { label: '新しいウィンドウ', icon: 'plus', act: () => run(id) }), side === 'right', side === 'left' || side === 'right' ? { beside: side } : side === 'bottom' ? { up: true } : null);
  };
  // タスクバーの固定したアプリ（taskPins の環境）
  htui.syncTasks = function () {
    const sh = htui.shell, box = htui.tasks; if (!sh || !box || !sh.taskPins || !htui.user) return;
    let zone = box.querySelector(':scope > .p-pins');
    if (!zone) { zone = h('span', { class: 'p-pins' }); box.prepend(zone); }
    const pins = htui.pins.list(), act = htui.active();
    htui.wins.forEach(w => { if (w.task) w.task.hidden = pins.includes(w.app); });
    const sig = pins.join() + '#' + htui.wins.filter(w => !w.parent).map(w => w.app + (w.el.classList.contains('hidden') ? '-' : '+')).join() + '#' + (act ? act.app : '');
    if (zone._sig === sig) return;
    zone._sig = sig; zone.textContent = '';
    pins.forEach(id => {
      const a = OS.apps[id], n = htui.wins.filter(w => w.app === id && !w.parent).length;
      const b = h('button', { class: 'p-pin' + (n ? ' run' : '') + (act && act.app === id ? ' active' : ''), type: 'button', title: a.name + (n > 1 ? '（ウィンドウ ' + n + ' 個）' : ''), 'aria-label': a.name, 'data-app': id }, kit.appIcon(a, 16));
      b.addEventListener('click', () => htui.openPinned(id, b, 'bottom'));
      zone.append(b);
    });
  };
  function pinMenu(id) {
    const a = OS.apps[id]; if (!a) return null;
    const ws = zOrder(htui.wins.filter(w => w.app === id && !w.parent));
    return [{ head: a.name }].concat(ws.map(w => ({ label: w.title, icon: a.icon, act: () => w.focus() })), ws.length ? [{ sep: true }] : [],
      [{ label: ws.length ? '新しいウィンドウ' : '開く', icon: ws.length ? 'plus' : a.icon, act: () => run(id) }],
      ws.length ? [{ label: 'すべて閉じる', icon: 'x', act: () => ws.forEach(w => w.close()) }] : [], [{ sep: true }], htui.pins.items(id));
  }

  // ---------- ウィンドウマネージャ（移動・8方向リサイズ・スナップ・アニメーション）
  // SDK 4（Mars）で 3 分割（l3 c3 r3）と 3 分の 2（l23 r23）を足した
  const T = 100 / 3;
  const ZONES = { max: [0, 0, 100, 100], left: [0, 0, 50, 100], right: [50, 0, 50, 100], tl: [0, 0, 50, 50], tr: [50, 0, 50, 50], bl: [0, 50, 50, 50], br: [50, 50, 50, 50],
    l3: [0, 0, T, 100], c3: [T, 0, T, 100], r3: [2 * T, 0, T, 100], l23: [0, 0, 2 * T, 100], r23: [T, 0, 2 * T, 100] };
  const MINW = 260, MINH = 150;
  const px = v => Math.round(v) + 'px', clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  htui.animOff = () => htui.prefs.anim === false || !!(OS.power && OS.power.saving);
  // ---------- 枠線だけのアニメーション（5.3.1）。省電力モードの最小化・復元で使う（ウィンドウの中身は動かさない）
  //   ウィンドウの枠の形の線だけを、タスクバーのボタン・固定したアイコン・Dock のアイコンへ縮める（復元はその逆）
  htui.wireMode = () => htui.prefs.anim !== false && !!(OS.power && OS.power.saving);
  htui.taskAnchor = function (win) {
    const vis = e => !!(e && e.isConnected && !e.hidden && e.offsetParent !== null && e.getBoundingClientRect().width > 0);
    let a = vis(win.task) ? win.task : null;
    if (!a && win.app) a = [...htui.el.querySelectorAll('[data-app="' + (window.CSS && CSS.escape ? CSS.escape(win.app) : win.app) + '"]')].find(e => e.matches('.ht2-dk,.p-pin,.gn-dk,.mc-dk,.p-task') && vis(e));
    if (a) return a.getBoundingClientRect();
    const hr = htui.el.getBoundingClientRect(); // 見えるアイコンがなければ画面の下の真ん中へ
    return { left: hr.left + hr.width / 2 - 24, top: hr.bottom - 36, width: 48, height: 32 };
  };
  htui.wireFps = 15;
  htui.wire = function (from, to, ms, cb) {
    const hr = htui.el.getBoundingClientRect();
    const put = r => ({ left: (r.left - hr.left) + 'px', top: (r.top - hr.top) + 'px', width: Math.max(8, r.width) + 'px', height: Math.max(8, r.height) + 'px' });
    const f = h('div', { class: 'wire', 'aria-hidden': 'true' });
    Object.assign(f.style, put(from)); htui.el.append(f);
    let fin = false;
    const done = () => { if (fin) return; fin = true; f.remove(); if (cb) cb(); };
    if (!f.animate) { done(); return; }
    // 省電力モードではコマ数を落とす（約 15fps。動きは段々になるが、描き直す回数が 1/4 くらいになる）
    const d = ms || 220, frames = Math.max(2, Math.round(d / 1000 * htui.wireFps) + 1);
    const a = f.animate([Object.assign(put(from), { opacity: 1 }), Object.assign(put(to), { opacity: 0.35 })], { duration: d, easing: 'steps(' + frames + ', jump-none)' });
    a.onfinish = done; a.oncancel = done;
    setTimeout(done, d + 200); // 念のため
  };
  function animOut(el, cls, ms, cb) {
    if (htui.animOff()) return cb();
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); cb(); }, ms);
  }
  function preview(zone, z) {
    let p = htui.desk.querySelector('.snap-preview');
    if (!zone) { if (p) p.classList.remove('on'); return; }
    if (!p) { p = h('div', { class: 'snap-preview' }); htui.desk.append(p); }
    const g = ZONES[zone];
    p.style.left = g[0] + '%'; p.style.top = g[1] + '%'; p.style.width = g[2] + '%'; p.style.height = g[3] + '%';
    p.style.zIndex = z - 1; p.classList.add('on');
  }
  // 子ウインドウ（ダイアログなど）がアクティブなときは、その親（いちばん上の親）を返す
  const hasActive = w => w.el.classList.contains('active') || w.children.some(hasActive);
  // 描画エンジンの名前と版
  htui.sdk = { name: 'HTUi SDK', version: '4.0.0', codename: 'Mars', full: 'HTUi SDK 4.0.0 (Mars)' };
  // Venus のスライダー: 値までを色で塗るために --v-p を入れる
  const rangeFill = r => { const mn = +r.min || 0, mx = r.max === '' ? 100 : +r.max, v = +r.value; r.style.setProperty('--v-p', (mx > mn ? (v - mn) / (mx - mn) * 100 : 0) + '%'); };
  htui.syncRanges = root => (root || document).querySelectorAll('input[type=range]').forEach(rangeFill);
  document.addEventListener('input', e => { if (e.target && e.target.type === 'range') rangeFill(e.target); }, true);
  if (window.MutationObserver) {
    let rq = 0;
    new MutationObserver(() => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; const r = document.getElementById('os-root'); if (r) htui.syncRanges(r); }); }).observe(document.body, { childList: true, subtree: true });
  }
  htui.active = () => htui.wins.find(w => hasActive(w) && !w.el.classList.contains('hidden') && !w.el.classList.contains('ws-off')) || null;
  // 子ウインドウも含めた、すべてのウインドウ
  htui.allWins = () => { const out = [], add = w => { out.push(w); w.children.forEach(add); }; htui.wins.forEach(add); return out; };
  const rootOf = w => { while (w.parent) w = w.parent; return w; };
  // ---------- 仮想デスク（htmlOS 6 から）。すべてのデスクトップ環境で使える
  //   ウィンドウはそれぞれ ws（何番目のデスクトップか）を持つ。今のデスクトップ以外のウィンドウは .ws-off で隠す。
  //   ほかのデスクトップのウィンドウに focus すると、そのデスクトップへ切り替わる（Alt+Tab・Dock・タスクバーからでも）
  //   数はユーザーの設定 htui.prefs.desks に覚える（1〜8）。Ctrl+Super+←/→ か Ctrl+Alt+PageUp/PageDown で切り替え、Shift も押すとウィンドウごと移る
  const ws = htui.ws = { cur: 0, count: 1, max: 8 };
  htui.wsName = i => 'デスクトップ ' + (i + 1);
  htui.wsOf = w => rootOf(w).ws | 0;
  htui.wsReset = function () { ws.cur = 0; ws.count = Math.max(1, Math.min(ws.max, (htui.prefs && htui.prefs.desks) | 0 || 1)); };
  htui.wsApply = function () {
    if (!htui.el) return;
    htui.allWins().forEach(w => {
      const off = htui.wsOf(w) !== ws.cur;
      w.el.classList.toggle('ws-off', off);
      if (w.task) w.task.classList.toggle('ws-off', off);
    });
    if (htui.shell && htui.shell.onWs) { try { htui.shell.onWs(); } catch (e) { /* 無視 */ } }
    htui.syncTitle();
  };
  const saveDesks = () => { if (htui.user && (htui.prefs.desks | 0) !== ws.count) htui.setPrefs({ desks: ws.count }); };
  function wsOsd() {
    if (!htui.el) return;
    let o = htui.el.querySelector(':scope > .ws-osd');
    if (!o) { o = h('div', { class: 'ws-osd', role: 'status' }); htui.el.append(o); }
    o.textContent = '';
    o.append(h('b', null, htui.wsName(ws.cur)), h('span', { class: 'ws-osd-dots' }, Array.from({ length: ws.count }, (_, i) => h('i', { class: i === ws.cur ? 'on' : '' }))));
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
    clearTimeout(o._t); o._t = setTimeout(() => o.classList.remove('show'), 900);
  }
  htui.wsSwitch = function (i, opt) {
    opt = opt || {};
    i = Math.max(0, Math.min(ws.count - 1, i | 0));
    if (i === ws.cur) { if (!opt.quiet) wsOsd(); return false; }
    const dir = i > ws.cur ? 1 : -1;
    if (opt.carry) { const w = htui.active(); if (w) rootOf(w).ws = i; }
    ws.cur = i; htui.wsApply();
    if (htui.desk && !htui.animOff()) { const d = htui.desk; d.classList.remove('ws-in-l', 'ws-in-r'); void d.offsetWidth; d.classList.add(dir > 0 ? 'ws-in-r' : 'ws-in-l'); setTimeout(() => d.classList.remove('ws-in-l', 'ws-in-r'), 260); }
    focusTop();
    if (!opt.quiet) wsOsd();
    if (OS.ipc) { try { OS.ipc.publish('desk.changed', { desk: i + 1, count: ws.count }, 'htui'); } catch (e) { /* 無視 */ } }
    return true;
  };
  htui.wsAdd = function (go) {
    if (ws.count >= ws.max) { ui.toast('仮想デスクは ' + ws.max + ' 個までです'); return -1; }
    ws.count++; saveDesks(); htui.wsApply();
    if (go) htui.wsSwitch(ws.count - 1);
    return ws.count - 1;
  };
  htui.wsRemove = function (i) {
    if (ws.count <= 1 || i < 0 || i >= ws.count) return false;
    const to = i > 0 ? i - 1 : 0;
    htui.wins.forEach(w => { const d = w.ws | 0; if (d === i) w.ws = to; else if (d > i) w.ws = d - 1; });
    if (ws.cur === i) ws.cur = to; else if (ws.cur > i) ws.cur--;
    ws.count--; saveDesks(); htui.wsApply(); focusTop();
    return true;
  };
  htui.wsMove = function (w, i) {
    if (i >= ws.count) { if (htui.wsAdd() < 0) return; i = ws.count - 1; }
    rootOf(w).ws = Math.max(0, i); htui.wsApply();
    if (htui.wsOf(w) !== ws.cur) focusTop();
  };
  // ウィンドウの右クリックメニューなどに出す「別のデスクトップへ移動」
  htui.wsMoveItems = function (w) {
    const cur = htui.wsOf(w), out = [];
    for (let i = 0; i < ws.count; i++) if (i !== cur) out.push({ label: htui.wsName(i) + ' へ移動', icon: 'desks', act: () => htui.wsMove(w, i) });
    if (ws.count < ws.max) out.push({ label: '新しいデスクトップへ移動', icon: 'plus', act: () => htui.wsMove(w, ws.count) });
    return out;
  };
  // デスクトップの縮小図を並べた帯。opt.big で大きく。opt.onPick(i) はデスクトップを選んだとき。ウィンドウはドラッグで別のデスクトップへ移せる
  htui.wsBar = function (opt) {
    opt = opt || {};
    const bar = h('div', { class: 'ws-bar' + (opt.big ? ' big' : '') + (opt.cls ? ' ' + opt.cls : ''), role: 'toolbar', 'aria-label': '仮想デスク' });
    function render() {
      bar.textContent = '';
      const desk = htui.desk, W = (desk && desk.clientWidth) || 1280, H = (desk && desk.clientHeight) || 760;
      const tw = opt.width || (opt.big ? Math.max(140, Math.min(250, (htui.el.clientWidth - 120) / Math.min(ws.count + 1, 4) - 28)) : 120), th = Math.round(tw * H / W), k = tw / W;
      const wall = wallCss(htui.prefs, htui.user);
      for (let i = 0; i < ws.count; i++) {
        const t = h('div', { class: 'ws-thumb' + (i === ws.cur ? ' cur' : ''), style: 'width:' + tw + 'px;height:' + th + 'px;background:' + wall, role: 'button', tabindex: '0', title: htui.wsName(i) + 'に切り替え', 'aria-label': htui.wsName(i) + (i === ws.cur ? '（今のデスクトップ）' : '') });
        htui.wins.filter(w => (w.ws | 0) === i && !w.closed && !w.el.classList.contains('hidden')).sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0)).forEach(w => {
          const a = OS.apps[w.app] || {}, max = w.zone === 'max';
          const L = max ? 0 : (parseFloat(w.el.style.left) || 0), T = max ? 0 : (parseFloat(w.el.style.top) || 0), WW = max ? W : (parseFloat(w.el.style.width) || w.el.offsetWidth || 400), HH = max ? H : (parseFloat(w.el.style.height) || w.el.offsetHeight || 300);
          const m = h('div', { class: 'ws-mini', draggable: 'true', title: w.title + '（ドラッグで別のデスクトップへ）', style: 'left:' + L * k + 'px;top:' + T * k + 'px;width:' + Math.max(14, WW * k) + 'px;height:' + Math.max(10, HH * k) + 'px' }, h('span', { class: 'ws-mico' }, OS.icon(a.icon || 'file', opt.big ? 14 : 10)));
          m.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-htmlos-win', String(w.pid)); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); });
          t.append(m);
        });
        t.addEventListener('click', () => { htui.wsSwitch(i); if (opt.onPick) opt.onPick(i); else render(); });
        t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } });
        t.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-htmlos-win')) { e.preventDefault(); t.classList.add('drop'); } });
        t.addEventListener('dragleave', () => t.classList.remove('drop'));
        t.addEventListener('drop', e => { e.preventDefault(); t.classList.remove('drop'); const pid = +e.dataTransfer.getData('text/x-htmlos-win'); const w = htui.wins.find(x => x.pid === pid); if (w) { htui.wsMove(w, i); render(); if (opt.onChange) opt.onChange(); } });
        const x = ws.count > 1 ? h('button', { class: 'ws-x', type: 'button', title: htui.wsName(i) + 'を閉じる（ウィンドウは隣へ移ります）', 'aria-label': htui.wsName(i) + 'を閉じる', onclick: e => { e.stopPropagation(); htui.wsRemove(i); render(); if (opt.onChange) opt.onChange(); } }, OS.icon('x', 12)) : null;
        bar.append(h('div', { class: 'ws-item' }, t, x, h('span', { class: 'ws-label' }, htui.wsName(i))));
      }
      if (ws.count < ws.max) {
        const add = h('button', { class: 'ws-add', type: 'button', style: 'width:' + Math.round(opt.big ? tw * .55 : tw * .45) + 'px;height:' + th + 'px', title: '新しいデスクトップ', 'aria-label': '新しいデスクトップ', onclick: () => { htui.wsAdd(); render(); if (opt.onChange) opt.onChange(); } }, OS.icon('plus', opt.big ? 26 : 18));
        add.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-htmlos-win')) { e.preventDefault(); add.classList.add('drop'); } });
        add.addEventListener('dragleave', () => add.classList.remove('drop'));
        add.addEventListener('drop', e => { e.preventDefault(); const pid = +e.dataTransfer.getData('text/x-htmlos-win'); const w = htui.wins.find(x => x.pid === pid); if (w) { htui.wsMove(w, ws.count); render(); if (opt.onChange) opt.onChange(); } });
        bar.append(h('div', { class: 'ws-item' }, add, h('span', { class: 'ws-label' }, '新規')));
      }
    }
    bar._render = render;
    render();
    return bar;
  };
  // 仮想デスクの一覧（HTUi 3 のパネル・hWin のタスクビュー・hwc のメニューから）
  htui.wsView = function () {
    if (!htui.el || !htui.user) return;
    const old = htui.el.querySelector(':scope > .ws-view:not(.leaving)'); if (old) { old._close(); return; }
    closeMenus();
    const bar = htui.wsBar({ big: true, onPick: () => close() });
    const v = h('div', { class: 'ws-view', role: 'dialog', 'aria-label': '仮想デスク' },
      h('h2', null, '仮想デスク'), bar,
      h('p', { class: 'ws-hint' }, 'クリックで切り替え ・ ウィンドウをドラッグして別のデスクトップへ移動 ・ Ctrl+Super+←/→ でも切り替え ・ Esc で閉じる'));
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    function close() { document.removeEventListener('keydown', esc, true); htui.leave(v); }
    v._close = close;
    v.addEventListener('click', e => { if (e.target === v) close(); });
    document.addEventListener('keydown', esc, true);
    htui.el.append(v);
  };
  // ほかのユーザーに切り替える（6.0.1）。今のユーザーはログアウトしない: ウィンドウとプロセスはそのまま残し、
  //   そのユーザーを選んだログイン画面へ。あとで同じユーザーがログインすると、残しておいたウィンドウに戻る
  htui.switchUser = function (name) {
    if (!users.get(name) || !htui.user || htui.locked) return false;
    const me = htui.user;
    closeMenus(); altTabEnd(true);
    parked[me] = { wins: htui.wins.slice(), cur: htui.ws.cur, notices: htui.notices || [], sid: htui.sessionId, proc: htui.sessionProc, z: htui.z };
    htui.wins = []; htui.sessionProc = null; // セッションのプロセスは止めない
    if (OS.ipc) { try { OS.ipc.publish('session.switch', { from: me, to: name }, 'htui'); } catch (e) { /* 無視 */ } }
    const c = OS.hdm.conf(); c.lastUser = name; OS.hdm.save(c);
    toLogin(true);
    setTimeout(() => OS.ui.toast(me + ' さんはログインしたままです（ウィンドウはそのまま残ります）'), 300);
    return true;
  };
  // 切り替えでログインしたままにしているユーザー
  const parked = {};
  htui.loggedIn = () => (htui.user ? [htui.user] : []).concat(Object.keys(parked).filter(u => u !== htui.user));
  htui.isParked = u => !!parked[u];
  // 残しておいたセッションを終える（force: 確認なしで閉じる）。閉じるのを取りやめたウィンドウがあれば false
  htui.endParked = async function (u, force) {
    const pk = parked[u]; if (!pk) return true;
    for (const w of pk.wins.slice()) { if (!w.closed && (await w.close(force)) === false) return false; }
    if (parked[u] !== pk) return true;
    delete parked[u];
    if (pk.proc && OS.proc) OS.proc.exit(pk.proc.pid);
    if (OS.ipc) { try { OS.ipc.publish('session.logout', { user: u }, 'htui'); } catch (e) { /* 無視 */ } }
    return true;
  };

  // ---------- HTUi SDK 3.0（Venus）: WebView
  //   hBrowser の表示部分を部品にしたもの。アプリのウインドウの中に web ページ・hFS の HTML・HTML の文字列を表示できる。
  //   const wv = OS.htui.WebView({ url, proxy, onnavigate, onload, onstatus, ontitle, ondownload, onerror, onmessage });
  //   win.body.append(wv.el); wv.go('https://example.com/');
  //   ・url        … https://… / hfs:パス / /home/…（hFS） / about:blank。ドメインだけなら https://、それ以外は検索語として DuckDuckGo で検索
  //   ・proxy      … false（直接 iframe に表示）/ true（CORS プロキシで取得して表示。埋め込みを拒否するサイトも読める）
  //   ・onnavigate(url) … ページの中のリンクが押されたとき。渡さないと、WebView がそのまま移動する（履歴つき）
  //   ・onmessage(data) … ページから parent.postMessage(…) で送られたもの（WebView 自身の連絡は除く）。wv.post(data) でページへ送れる
  //   メソッド: go(url) / load(url)（履歴に入れない） / back() / forward() / reload() / html(文字列, base) / show(要素) / post(data) / destroy()
  //   プロパティ: el / url / title / proxy / history / index / canBack / canForward / lastHtml / frame
  const WV_DL = /\.(zip|gz|tgz|7z|rar|pdf|mp3|wav|flac|m4a|mp4|webm|mov|uf2|bin|hex|iso|deb|exe|apk)$/i;
  const wvEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // プロキシ表示・HTML 表示したページの中で動かす小さなスクリプト（リンクとフォームとタイトルを親に伝える）
  // プロキシで表示したページの中で、いちばん最初に動く互換レイヤー（5.1.3）。
  //   ページは安全のため「どこのものでもない」オリジンで動くので、そのままだと localStorage・cookie・history.pushState が例外になり、
  //   fetch / XMLHttpRequest もほかのサイトには届かない（CORS）。そこで:
  //   ・localStorage / sessionStorage / document.cookie をメモリ上のものに差し替える（同じウインドウでは同じサイトのものを覚えておく）
  //   ・history.pushState / replaceState は例外にせず、<base> を新しい URL にする（相対 URL が正しくなる）
  //   ・fetch / XMLHttpRequest / sendBeacon は親（hBrowser）に頼んで、直接かプロキシ経由で取ってくる
  function wvCompat(C) {
    var send = function (m) { m.hbrowser = 1; try { parent.postMessage(m, '*'); } catch (e) { /* 親がいない */ } };
    var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    // ---- localStorage / sessionStorage
    function mkStorage(kind, init) {
      var data = {}, timer = 0;
      Object.keys(init || {}).forEach(function (k) { data[k] = String(init[k]); });
      var save = function () { if (kind !== 'local') return; clearTimeout(timer); timer = setTimeout(function () { send({ store: 'local', data: data }); }, 300); };
      var api = {
        getItem: function (k) { k = String(k); return has(data, k) ? data[k] : null; },
        setItem: function (k, v) { data[String(k)] = String(v); save(); },
        removeItem: function (k) { delete data[String(k)]; save(); },
        clear: function () { data = {}; save(); },
        key: function (i) { var l = Object.keys(data); return i >= 0 && i < l.length ? l[i] : null; }
      };
      return new Proxy(api, {
        get: function (t, k) { if (k === 'length') return Object.keys(data).length; if (has(t, k)) return t[k]; if (typeof k === 'string' && has(data, k)) return data[k]; return undefined; },
        set: function (t, k, v) { if (has(t, k) || k === 'length') return true; t.setItem(k, v); return true; },
        deleteProperty: function (t, k) { t.removeItem(k); return true; },
        has: function (t, k) { return has(t, k) || has(data, k); },
        ownKeys: function () { return Object.keys(data); },
        getOwnPropertyDescriptor: function (t, k) { return has(data, k) ? { value: data[k], writable: true, enumerable: true, configurable: true } : undefined; }
      });
    }
    ['localStorage', 'sessionStorage'].forEach(function (n) {
      var ok = true; try { window[n].getItem('x'); } catch (e) { ok = false; }
      if (!ok) { try { Object.defineProperty(window, n, { configurable: true, enumerable: true, value: mkStorage(n === 'localStorage' ? 'local' : 'session', n === 'localStorage' ? C.local : null) }); } catch (e) { /* 差し替えられない */ } }
    });
    // ---- document.cookie
    var jar = {}; Object.keys(C.cookies || {}).forEach(function (k) { jar[k] = String(C.cookies[k]); });
    var cookieOk = true; try { void document.cookie; } catch (e) { cookieOk = false; }
    if (!cookieOk) {
      try {
        Object.defineProperty(document, 'cookie', { configurable: true, get: function () { return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); }, set: function (v) {
          v = String(v); var p = v.split(';')[0], i = p.indexOf('='); if (i < 0) return;
          var k = p.slice(0, i).trim(), val = p.slice(i + 1).trim();
          if (/;\s*max-age\s*=\s*(0|-)/i.test(v) || /;\s*expires\s*=[^;]*1970/i.test(v)) delete jar[k]; else jar[k] = val;
          send({ store: 'cookie', data: jar });
        } });
      } catch (e) { /* 差し替えられない */ }
    }
    // ---- history（URL は変えられないので、<base> と内部の URL だけ変える）
    var vurl = C.url || document.baseURI;
    var setBase = function () { var b = document.querySelector('base'); if (b) b.setAttribute('href', vurl); };
    ['pushState', 'replaceState'].forEach(function (n) {
      var orig = history[n];
      history[n] = function (st, t, u) {
        if (u != null) { try { vurl = new URL(String(u), vurl).href; setBase(); send({ vurl: vurl }); } catch (e) { /* 変な URL */ } }
        try { return orig.call(history, st, t); } catch (e) { /* 何もしない */ }
      };
    });
    // ---- fetch（親に頼む）
    var origFetch = window.fetch ? window.fetch.bind(window) : null, fseq = 0, waits = {};
    window.addEventListener('message', function (e) {
      var d = e.data; if (!d || d.hbrowserFetch == null || e.source !== parent) return;
      var w = waits[d.hbrowserFetch]; if (!w) return; delete waits[d.hbrowserFetch];
      if (d.error) { w.rej(new TypeError('Failed to fetch（' + d.error + '）')); return; }
      var st = d.status >= 200 && d.status <= 599 ? d.status : 200, nobody = st === 204 || st === 205 || st === 304;
      var r = new Response(nobody ? null : d.body, { status: st, statusText: d.statusText || '', headers: d.headers || {} });
      try { Object.defineProperty(r, 'url', { value: w.url }); } catch (e2) { /* 無視 */ }
      w.res(r);
    });
    var viaParent = function (url, method, headers, body) {
      return new Promise(function (res, rej) { var id = ++fseq; waits[id] = { res: res, rej: rej, url: url }; send({ fetch: { id: id, url: url, method: method, headers: headers, body: body } }); });
    };
    var remote = function (u) { return /^https?:/i.test(u); };
    if (origFetch) window.fetch = function (input, init) {
      init = init || {};
      var req = typeof Request !== 'undefined' && input instanceof Request ? input : null, url;
      try { url = new URL(req ? req.url : String(input), vurl).href; } catch (e) { return origFetch(input, init); }
      if (!remote(url)) return origFetch(input, init);
      var method = String(init.method || (req && req.method) || 'GET').toUpperCase(), hd = {};
      try { new Headers(init.headers || (req && req.headers) || {}).forEach(function (v, k) { hd[k] = v; }); } catch (e) { /* 無視 */ }
      var bodyP = Promise.resolve(null);
      if (method !== 'GET' && method !== 'HEAD') {
        if (init.body != null) {
          try { var tmp = new Request('https://x.invalid/', { method: 'POST', body: init.body }); var ct = tmp.headers.get('content-type'); if (ct && !hd['content-type']) hd['content-type'] = ct; bodyP = tmp.arrayBuffer(); } catch (e) { bodyP = Promise.resolve(null); }
        } else if (req) bodyP = req.arrayBuffer();
      }
      if (init.signal && init.signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      var p = bodyP.then(function (b) { return viaParent(url, method, hd, b); });
      if (init.signal) p = Promise.race([p, new Promise(function (r, j) { init.signal.addEventListener('abort', function () { j(new DOMException('Aborted', 'AbortError')); }); })]);
      return p;
    };
    // ---- XMLHttpRequest（fetch の上に作り直す。同期の XHR には対応しない）
    function XHR() {
      this.readyState = 0; this.status = 0; this.statusText = ''; this.response = ''; this.responseText = ''; this.responseType = ''; this.responseURL = ''; this.responseXML = null;
      this.timeout = 0; this.withCredentials = false; this._h = {}; this._l = {}; this._aborted = false;
      this.upload = { addEventListener: function () {}, removeEventListener: function () {} };
    }
    XHR.UNSENT = 0; XHR.OPENED = 1; XHR.HEADERS_RECEIVED = 2; XHR.LOADING = 3; XHR.DONE = 4;
    XHR.prototype = {
      constructor: XHR, UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
      open: function (m, u) { this._m = String(m || 'GET').toUpperCase(); this._u = String(u); this._aborted = false; this.readyState = 1; this._fire('readystatechange'); },
      setRequestHeader: function (k, v) { this._h[String(k).toLowerCase()] = String(v); },
      overrideMimeType: function () {},
      getResponseHeader: function (k) { return this._rh ? this._rh.get(k) : null; },
      getAllResponseHeaders: function () { var s = ''; if (this._rh) this._rh.forEach(function (v, k) { s += k + ': ' + v + '\r\n'; }); return s; },
      abort: function () { if (this.readyState === 0 || this.readyState === 4) return; this._aborted = true; this.readyState = 4; this.status = 0; this._fire('readystatechange'); this._fire('abort'); this._fire('loadend'); this.readyState = 0; },
      addEventListener: function (t, f) { if (typeof f === 'function') (this._l[t] = this._l[t] || []).push(f); },
      removeEventListener: function (t, f) { var l = this._l[t]; if (l) { var i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } },
      dispatchEvent: function (ev) { this._fire(ev.type); return true; },
      _fire: function (t) {
        var x = this, ev = { type: t, target: x, currentTarget: x, loaded: 0, total: 0, lengthComputable: false, preventDefault: function () {}, stopPropagation: function () {} };
        var call = function (f) { try { f.call(x, ev); } catch (e) { setTimeout(function () { throw e; }); } };
        if (typeof x['on' + t] === 'function') call(x['on' + t]);
        (x._l[t] || []).slice().forEach(call);
      },
      send: function (body) {
        var x = this, tm = 0;
        x._fire('loadstart');
        if (x.timeout > 0) tm = setTimeout(function () { if (x.readyState === 4) return; x._aborted = true; x.readyState = 4; x._fire('readystatechange'); x._fire('timeout'); x._fire('loadend'); }, x.timeout);
        window.fetch(x._u, { method: x._m, headers: x._h, body: body == null || x._m === 'GET' || x._m === 'HEAD' ? undefined : body }).then(function (r) {
          if (x._aborted) return;
          x.status = r.status; x.statusText = r.statusText; x.responseURL = r.url || ''; x._rh = r.headers;
          x.readyState = 2; x._fire('readystatechange');
          return r.arrayBuffer().then(function (buf) {
            if (x._aborted) return;
            clearTimeout(tm);
            x.readyState = 3; x._fire('readystatechange');
            var t = x.responseType, text = function () { return new TextDecoder().decode(buf); };
            if (t === '' || t === 'text') { x.responseText = text(); x.response = x.responseText; }
            else if (t === 'json') { try { x.response = JSON.parse(text()); } catch (e) { x.response = null; } }
            else if (t === 'arraybuffer') x.response = buf;
            else if (t === 'blob') x.response = new Blob([buf], { type: r.headers.get('content-type') || '' });
            else if (t === 'document') { x.response = x.responseXML = new DOMParser().parseFromString(text(), /xml/.test(r.headers.get('content-type') || '') ? 'text/xml' : 'text/html'); }
            x.readyState = 4; x._fire('readystatechange'); x._fire('load'); x._fire('loadend');
          });
        }).catch(function () {
          if (x._aborted) return;
          clearTimeout(tm);
          x.readyState = 4; x.status = 0; x._fire('readystatechange'); x._fire('error'); x._fire('loadend');
        });
      }
    };
    window.XMLHttpRequest = XHR;
    if (navigator.sendBeacon) { try { navigator.sendBeacon = function (u, d) { try { window.fetch(u, { method: 'POST', body: d }).catch(function () {}); } catch (e) { /* 無視 */ } return true; }; } catch (e) { /* 無視 */ } }
    // ページから外へのリンク（window.open）は hBrowser で開く
    window.open = function (u) { if (u) { try { send({ nav: new URL(String(u), vurl).href }); } catch (e) { /* 無視 */ } } return null; };
  }
  function wvAgent() {
    var send = function (m) { m.hbrowser = 1; try { parent.postMessage(m, '*'); } catch (e) { /* 親がいない */ } };
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var raw = a.getAttribute('href') || '';
      if (raw.charAt(0) === '#') {
        e.preventDefault();
        var t = document.getElementById(raw.slice(1)) || document.getElementsByName(raw.slice(1))[0];
        if (t) t.scrollIntoView();
        return;
      }
      if (/^javascript:/i.test(raw)) return;
      if (/^hfs:/i.test(raw)) { e.preventDefault(); send({ nav: raw }); return; }
      if (!/^https?:/i.test(a.href)) return;
      e.preventDefault();
      send({ nav: a.href, dl: a.hasAttribute('download') });
    }, true);
    document.addEventListener('submit', function (e) {
      var f = e.target; e.preventDefault();
      if ((f.getAttribute('method') || 'get').toLowerCase() === 'post') {
        var pu = new URL(f.getAttribute('action') || '', document.baseURI), body = new URLSearchParams();
        new FormData(f).forEach(function (v, k) { if (typeof v === 'string') body.append(k, v); });
        send({ nav: pu.href, post: body.toString() });
        return;
      }
      if ((f.getAttribute('method') || 'get').toLowerCase() !== 'get') { send({ note: 'post' }); return; }
      var u = new URL(f.getAttribute('action') || '', document.baseURI);
      u.search = '';
      new FormData(f).forEach(function (v, k) { if (typeof v === 'string') u.searchParams.append(k, v); });
      send({ nav: u.href });
    }, true);
    var title = function () { send({ title: document.title || '' }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', title); else title();
  }
  htui.WebView = function (o) {
    o = o || {};
    const fsx = () => htui.fs || OS.fs;
    const home = () => o.home || (htui.user ? users.home(htui.user) : '/');
    const el = h('div', { class: 'webview hb-view' });
    const wv = { el: el, url: null, title: '', proxy: !!o.proxy, history: [], index: -1, lastHtml: null, frame: null, destroyed: false };
    let seq = 0;
    const emit = (name, ...a) => { const f = o['on' + name]; if (typeof f === 'function') { try { return f.apply(wv, a); } catch (e) { console.error(e); } } };
    const status = t => emit('status', t || '');
    const setTitle = t => { wv.title = t || ''; emit('title', wv.title); };
    wv.resolve = function (u) {
      u = String(u || '').trim();
      if (!u) return 'about:blank';
      if (/^hfs:/i.test(u)) return 'hfs:' + path.norm(u.slice(4), '/', home());
      if (/^(about:|data:|blob:|https?:\/\/)/i.test(u)) return u;
      if (u.startsWith('/') || u.startsWith('~')) return 'hfs:' + path.norm(u, '/', home());
      if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(u) || /^localhost(:\d+)?(\/\S*)?$/.test(u)) return 'https://' + u;
      return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(u);
    };
    const mkFrame = sandbox => {
      el.textContent = '';
      const f = wv.frame = h('iframe', { sandbox: sandbox, title: o.label || 'ページ', referrerpolicy: 'no-referrer' });
      el.append(f);
      return f;
    };
    const page = (title, lines, actions) => {
      wv.frame = null; el.textContent = '';
      el.append(h('div', { class: 'hb-page' }, h('h1', null, title), (lines || []).map(l => h('p', null, l)), h('div', { class: 'hb-marks' }, actions || [])));
    };
    // サイトごとの localStorage と cookie（このウインドウを閉じるまで覚えておく）
    const stores = {};
    const originOf = u => { try { return new URL(u).origin; } catch (e) { return ''; } };
    const inject = (doc, base) => {
      const og = base ? originOf(base) : '', st = stores[og] || (stores[og] = { local: {}, cookies: {} });
      const C = { url: base || '', local: st.local, cookies: st.cookies };
      const js = s => '<scr' + 'ipt>' + s.replace(/<\//g, '<\\/') + '</scr' + 'ipt>';
      let pre = '';
      doc = String(doc).replace(/<(script|link)\b[^>]*>/gi, tag => tag.replace(/\s(integrity|crossorigin)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/gi, ''));
      // ES モジュールは CORS が要るので、パスにそのまま URL を付けるプロキシ（{rawurl}）があればそれを通す（相対 import もそのまま解決できる）
      const rawTpl = base && OS.net.list ? OS.net.list().find(t => /\{rawurl\}\s*$/.test(t)) : null;
      if (rawTpl && /^https?:/i.test(base)) {
        const px = rawTpl.replace(/\{rawurl\}\s*$/, '').trim();
        doc = doc.replace(/<script\b[^>]*\btype\s*=\s*["']?module["']?[^>]*>/gi, tag => tag.replace(/\bsrc\s*=\s*(["'])(.*?)\1/i, (x, q, src) => { try { return 'src=' + q + px + new URL(src.replace(/&amp;/g, '&'), base).href + q; } catch (e) { return x; } }));
        if (!/<script[^>]*type\s*=\s*["']?importmap/i.test(doc)) pre = '<script type="importmap">' + JSON.stringify({ imports: { [og + '/']: px + og + '/' } }).replace(/</g, '\\u003c') + '</scr' + 'ipt>';
      }
      const inj = (base ? '<base href="' + wvEsc(base) + '">' : '') + pre + js('(' + String(wvCompat) + ')(' + JSON.stringify(C).replace(/</g, '\\u003c') + ');') + js('(' + String(wvAgent) + ')();');
      doc = doc.replace(/<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options|refresh)[^>]*>/gi, '');
      return /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, x => x + inj) : inj + doc;
    };
    // 中身を直接見せる（アプリが作った要素）。HTML の文字列は html() で
    wv.show = function (...nodes) { seq++; wv.frame = null; el.textContent = ''; el.append(...nodes); };
    wv.html = function (doc, base) { seq++; wv.lastHtml = String(doc); mkFrame('allow-scripts allow-forms').srcdoc = inject(doc, base); setTitle(''); };
    wv.post = function (data) { if (wv.frame && wv.frame.contentWindow) wv.frame.contentWindow.postMessage(data, '*'); };
    wv.load = async function (u, post) {
      u = wv.resolve(u);
      // DuckDuckGo の検索結果リンクは転送URLなので中身を取り出す
      try { const U = new URL(u); if (/duckduckgo\.com$/.test(U.hostname) && U.pathname === '/l/' && U.searchParams.get('uddg')) u = U.searchParams.get('uddg'); } catch (e) { /* URLでない */ }
      wv.url = u; wv.lastHtml = null;
      const my = ++seq;
      status('');
      if (u === 'about:blank') { el.textContent = ''; wv.frame = null; setTitle(''); emit('load', u); return; }
      if (u.startsWith('hfs:')) {
        const p = u.slice(4);
        try {
          const k = fsx().kind(p), s = fsx().stat(p);
          if (!s || s.t !== 'f') throw new Error(p + ': そのようなファイルはありません');
          if (k === 'html') { wv.lastHtml = s.c; mkFrame('allow-scripts allow-forms').srcdoc = inject(s.c); }
          else if (k === 'image') wv.show(h('div', { class: 'hb-page' }, h('img', { src: fsx().dataURL(p), alt: path.base(p), style: 'max-width:100%' })));
          else if (s.b) throw new Error(path.base(p) + ' は表示できません');
          else wv.show(h('pre', { class: 'hb-pre' }, s.c));
          wv.url = u; setTitle(path.base(p));
          status('hFS 上のファイルを表示中');
          emit('load', u);
        } catch (e) { page('表示できません', [e.message]); emit('error', e, u); }
        return;
      }
      if (/^(data|blob):/i.test(u)) { mkFrame('allow-scripts').src = u; emit('load', u); return; }
      const forceProxy = /(^|\.)duckduckgo\.com$/.test(new URL(u).hostname);
      if (!wv.proxy && !forceProxy) {
        mkFrame('allow-scripts allow-same-origin allow-forms allow-popups').src = u;
        setTitle(u.replace(/^https?:\/\//, ''));
        status('直接モードで表示中。真っ白のままなら、サイトが埋め込みを拒否しています。プロキシをオンにしてください。');
        emit('load', u);
        return;
      }
      page('読み込み中…', [u]);
      status('プロキシ経由で取得しています…');
      try {
        const r = post != null ? await OS.net.send(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: post }) : await OS.net.get(u, { direct: false });
        const type = (r.headers.get('content-type') || '').toLowerCase();
        const buf = await r.arrayBuffer();
        if (my !== seq || wv.destroyed) return;
        if (/^(image|audio|video)\//.test(type)) {
          const c = await OS.net.blobToContent(new Blob([buf], { type: type }), 'x.bin');
          wv.show(h('div', { class: 'hb-page' }, h(type.startsWith('image') ? 'img' : type.startsWith('audio') ? 'audio' : 'video', { src: c.content, controls: true, style: 'max-width:100%' })));
        } else {
          let cs = (type.match(/charset=([\w-]+)/) || [])[1];
          const m = new TextDecoder('latin1').decode(buf.slice(0, 4096)).match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
          if (m) cs = m[1];
          let text; try { text = new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { text = new TextDecoder().decode(buf); }
          if (/html|xml/.test(type) || /^\s*<(!doctype|html|head|body)/i.test(text)) { mkFrame('allow-scripts allow-forms').srcdoc = inject(text, u); }
          else wv.show(h('pre', { class: 'hb-pre' }, text));
          wv.lastHtml = text;
        }
        status('プロキシモードで表示中（' + Math.max(1, Math.round(buf.byteLength / 1024)) + ' KB）。スクリプトの通信もプロキシ経由で取ります。ログインが必要なページや、URL で画面を切り替えるサイトは正しく動かないことがあります。');
        emit('load', u);
      } catch (e) {
        if (my !== seq || wv.destroyed) return;
        status('');
        if (emit('error', e, u, forceProxy) === true) return; // アプリが自分で表示した
        page('ページを取得できませんでした', [u, e.message, 'プロキシは外部の無料サービスです。止まっている場合は、設定 → ネットワーク で別のプロキシに変更できます。'],
          [h('button', { class: 'btn', type: 'button', onclick: () => wv.reload() }, '再試行')]);
      }
    };
    wv.go = function (u) {
      u = wv.resolve(u);
      wv.history.splice(wv.index + 1); wv.history.push(u); wv.index = wv.history.length - 1;
      return wv.load(u);
    };
    wv.back = () => { if (wv.index > 0) return wv.load(wv.history[--wv.index]); };
    wv.forward = () => { if (wv.index < wv.history.length - 1) return wv.load(wv.history[++wv.index]); };
    wv.reload = () => { if (wv.url) return wv.load(wv.url); };
    Object.defineProperty(wv, 'canBack', { get: () => wv.index > 0 });
    Object.defineProperty(wv, 'canForward', { get: () => wv.index < wv.history.length - 1 });
    const onMsg = e => {
      if (!wv.frame || e.source !== wv.frame.contentWindow || !e.data) return;
      const d = e.data;
      if (d.hbrowser !== 1) { emit('message', d); return; }
      if (d.fetch && typeof d.fetch === 'object') { proxyFetch(d.fetch, e.source); return; }
      if (d.store === 'local' || d.store === 'cookie') { const st = stores[originOf(wv.vurl || wv.url)] || (stores[originOf(wv.vurl || wv.url)] = { local: {}, cookies: {} }); if (d.data && typeof d.data === 'object') st[d.store === 'local' ? 'local' : 'cookies'] = d.data; return; }
      if (typeof d.vurl === 'string') { wv.vurl = d.vurl; return; }
      if (typeof d.title === 'string') { setTitle(d.title); return; }
      if (d.note === 'post') { OS.ui.toast('フォームの送信（POST）はできません'); return; }
      if (typeof d.nav !== 'string') return;
      const u = d.nav;
      if (/^https?:/i.test(u) && (d.dl || WV_DL.test(u.split(/[?#]/)[0]))) { if (emit('download', u) === undefined && !o.ondownload) OS.ui.toast('ダウンロードには対応していません'); return; }
      if (!/^(https?|hfs):/i.test(u)) return;
      if (typeof d.post === 'string' && /^https?:/i.test(u)) { wv.history.splice(wv.index + 1); wv.history.push(u); wv.index = wv.history.length - 1; emit('navigate-post', u); wv.load(u, d.post); return; }
      if (o.onnavigate) emit('navigate', u); else wv.go(u);
    };
    // ページのスクリプトの通信（fetch / XHR）を代わりに行う。http(s) だけ。cookie は送らない
    const PROXY_FETCH_MAX = 16;
    let fetching = 0;
    const proxyFetch = async (f, src) => {
      const reply = m => { try { src.postMessage(m, '*', m.body ? [m.body] : []); } catch (e) { /* ページが閉じた */ } };
      if (!f || typeof f.url !== 'string' || !/^https?:/i.test(f.url)) return reply({ hbrowserFetch: f && f.id, error: 'http(s) 以外には接続できません' });
      while (fetching >= PROXY_FETCH_MAX) await new Promise(r => setTimeout(r, 100));
      fetching++;
      try {
        const m = String(f.method || 'GET').toUpperCase(), hd = {};
        Object.keys(f.headers || {}).forEach(k => { if (/^(content-type|accept|accept-language)$/i.test(k)) hd[k] = String(f.headers[k]); });
        const r = m === 'GET' || m === 'HEAD' ? await OS.net.get(f.url, { any: true, timeout: 20000 }) : await OS.net.send(f.url, { method: m, headers: hd, body: f.body });
        const out = {}; r.headers.forEach((v, k) => { if (!/^(set-cookie|content-encoding|content-length|transfer-encoding)$/i.test(k)) out[k] = v; });
        const body = m === 'HEAD' ? null : await r.arrayBuffer();
        reply({ hbrowserFetch: f.id, status: r.status, statusText: r.statusText || '', headers: out, body: body });
      } catch (e) { reply({ hbrowserFetch: f.id, error: e.message }); }
      finally { fetching--; }
    };
    window.addEventListener('message', onMsg);
    wv.destroy = () => { wv.destroyed = true; seq++; window.removeEventListener('message', onMsg); el.remove(); };
    // ウインドウに入れたら、そのウインドウが閉じるときに一緒に片づける
    wv.attach = function (win, parentEl) {
      (parentEl || win.body).append(el);
      const prev = win.onDispose;
      win.onDispose = () => { wv.destroy(); if (prev) prev(); };
      return wv;
    };
    if (o.url) wv.go(o.url);
    return wv;
  };

  // ---------- HTUi SDK 4（Mars）: スナップレイアウトとスナップアシスト
  //   最大化ボタンにマウスを乗せると配置の図（レイアウト）が出る。図の区画を押すと、その場所に並べる。
  //   並べたあと、残りの区画に入れるウィンドウを選べる（スナップアシスト。htui.prefs.snapAssist === false で出さない）
  const LAYOUTS = [['left', 'right'], ['l23', 'r3'], ['l3', 'r23'], ['l3', 'c3', 'r3'], ['left', 'tr', 'br'], ['tl', 'tr', 'bl', 'br']];
  htui.layouts = LAYOUTS;
  let layoutPop = null, layoutTimer = 0;
  function closeLayouts() { clearTimeout(layoutTimer); if (layoutPop) { const p = layoutPop; layoutPop = null; p.remove(); } }
  htui.closeLayouts = closeLayouts;
  htui.snapLayouts = function (win, anchor) {
    closeLayouts();
    if (OS.touch || win.closed || win.dialog) return;
    const pop = layoutPop = h('div', { class: 'snap-layouts', role: 'menu', 'aria-label': 'スナップレイアウト' });
    LAYOUTS.forEach(L => {
      const box = h('div', { class: 'sl-box' });
      L.forEach((z, i) => {
        const g = ZONES[z];
        box.append(h('button', { class: 'sl-cell', type: 'button', role: 'menuitem', title: ZONE_NAMES[z] || z, 'aria-label': ZONE_NAMES[z] || z,
          style: 'left:' + g[0] + '%;top:' + g[1] + '%;width:' + g[2] + '%;height:' + g[3] + '%',
          onclick: e => { e.stopPropagation(); closeLayouts(); win.snap(z); win.focus(); htui.snapAssist(L.filter(x => x !== z), [win]); } }));
      });
      pop.append(box);
    });
    pop.addEventListener('pointerleave', () => { layoutTimer = setTimeout(closeLayouts, 350); });
    pop.addEventListener('pointerenter', () => clearTimeout(layoutTimer));
    htui.el.append(pop);
    const a = anchor.getBoundingClientRect(), r = htui.el.getBoundingClientRect(), pw = pop.offsetWidth;
    pop.style.left = Math.round(Math.max(4, Math.min(r.width - pw - 4, a.left - r.left + a.width / 2 - pw / 2))) + 'px';
    pop.style.top = Math.round(a.bottom - r.top + 6) + 'px';
  };
  const ZONE_NAMES = { max: '最大化', left: '左半分', right: '右半分', tl: '左上', tr: '右上', bl: '左下', br: '右下', l3: '左 3 分の 1', c3: '真ん中 3 分の 1', r3: '右 3 分の 1', l23: '左 3 分の 2', r23: '右 3 分の 2' };
  htui.zoneNames = ZONE_NAMES;
  // 残りの区画（zones）に、ほかのウィンドウを 1 つずつ選んで入れる。used は並べ終わったウィンドウ
  htui.snapAssist = function (zones, used) {
    const old = htui.desk && htui.desk.querySelector('.snap-assist'); if (old) old._close();
    if (!zones.length || htui.prefs.snapAssist === false || OS.touch || !htui.desk) return;
    const cands = htui.wins.filter(w => !w.closed && !used.includes(w) && htui.wsOf(w) === htui.ws.cur && !w.el.classList.contains('closing'));
    if (!cands.length) return;
    const z = zones[0], g = ZONES[z];
    const ov = h('div', { class: 'snap-assist', role: 'dialog', 'aria-label': 'スナップアシスト' });
    const area = h('div', { class: 'sa-area', style: 'left:' + g[0] + '%;top:' + g[1] + '%;width:' + g[2] + '%;height:' + g[3] + '%' },
      h('div', { class: 'sa-head' }, ZONE_NAMES[z] + 'に並べるウィンドウを選んでください'));
    const list = h('div', { class: 'sa-list' });
    cands.forEach(w => {
      const a = OS.apps[w.app] || { name: w.title, icon: 'file' };
      list.append(h('button', { class: 'sa-card', type: 'button', title: w.title, onclick: e => { e.stopPropagation(); close(); w.focus(); w.snap(z); htui.snapAssist(zones.slice(1), used.concat(w)); } },
        kit.appIcon(a, 26), h('b', null, a.name), a.name !== w.title ? h('small', null, w.title) : null));
    });
    area.append(list);
    ov.append(area);
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    function close() { document.removeEventListener('keydown', esc, true); ov.remove(); }
    ov._close = close;
    ov.addEventListener('click', e => { if (!e.target.closest('.sa-card')) close(); });
    document.addEventListener('keydown', esc, true);
    ov.style.zIndex = htui.z + 5;
    htui.desk.append(ov);
  };

  // ---------- HTUi SDK 4（Mars）: どこからでも使える検索（Alt+Space）
  //   アプリ・設定・ファイル（ホームの中）・jsh のコマンド・計算をまとめて探す。htui.searchProviders に足すと、検索の対象を増やせる
  //   プロバイダー: { id, name, find(q) → [{ title, sub, icon, run() }] }
  htui.searchProviders = [];
  const SETTING_PAGES = [['look', '外観', '壁紙 アクセント 色 アニメーション 透明 画面モード デスクトップ環境 dock スナップ'], ['users', 'ユーザー', 'アカウント パスワード アバター'], ['sound', 'サウンド', '音 音量 効果音 bgm'],
    ['power', '電源管理', '省電力 スリープ バッテリー'], ['net', 'ネットワーク', 'プロキシ 接続'], ['storage', 'ストレージ', 'ディスク hdd raid 容量'], ['boot', '起動', 'ブート cui gui'], ['system', 'システム', 'バージョン 情報 htmlos について']];
  function homeFiles(limit) {
    const out = [], hf = htui.fs || fs, base = users.home(htui.user);
    const walk = (d, depth) => {
      if (out.length >= limit || depth > 5) return;
      let l; try { l = hf.list(d); } catch (e) { return; }
      for (const n of l) {
        if (n[0] === '.') continue;
        const p = d + '/' + n; out.push(p); if (out.length >= limit) return;
        try { if (hf.isDir(p) && !hf.isLink(p)) walk(p, depth + 1); } catch (e) { /* 読めない */ }
      }
    };
    walk(base, 0);
    return out;
  }
  function calc(q) {
    if (!/^[\d\s+\-*/().%^,]+$/.test(q) || !/\d/.test(q) || !/[+\-*/%^]/.test(q)) return null;
    try { const v = Function('"use strict";return (' + q.replace(/\^/g, '**').replace(/,/g, '') + ')')(); return typeof v === 'number' && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  function searchAll(q) {
    const t = q.trim().toLowerCase(), groups = [];
    if (!t) {
      groups.push({ name: 'アプリ', items: kit.apps().slice(0, 8).map(a => ({ title: a.name, sub: a.desc, app: a, run: () => run(a.id) })) });
      return groups;
    }
    const v = calc(t);
    if (v != null) groups.push({ name: '計算', items: [{ title: '= ' + (Math.round(v * 1e10) / 1e10).toLocaleString('ja-JP', { maximumFractionDigits: 10 }), sub: q.trim() + '（Enter でコピー）', icon: 'calc', run: () => { try { navigator.clipboard.writeText(String(v)); ui.toast('コピーしました: ' + v); } catch (e) { /* 無視 */ } } }] });
    const apps = kit.apps().filter(a => (a.name + ' ' + (a.desc || '') + ' ' + a.id).toLowerCase().includes(t)).sort((a, b) => (a.name.toLowerCase().startsWith(t) ? 0 : 1) - (b.name.toLowerCase().startsWith(t) ? 0 : 1));
    if (apps.length) groups.push({ name: 'アプリ', items: apps.slice(0, 6).map(a => ({ title: a.name, sub: a.desc, app: a, run: () => run(a.id) })) });
    if (OS.apps.settings) {
      const st = SETTING_PAGES.filter(s => (s[1] + ' ' + s[2] + ' ' + s[0] + ' 設定').toLowerCase().includes(t));
      if (st.length) groups.push({ name: '設定', items: st.map(s => ({ title: '設定 ▸ ' + s[1], sub: s[2], icon: 'gear', run: () => run('settings', s[0]) })) });
    }
    if (htui.user) {
      const files = homeFiles(1500).filter(p => path.base(p).toLowerCase().includes(t)).slice(0, 8);
      if (files.length) groups.push({ name: 'ファイル', items: files.map(p => ({ title: path.base(p), sub: p, icon: fileIcon(p), run: () => openPath(p) })) });
    }
    if (OS.apps.terminal) {
      const word = t.split(/\s+/)[0], known = Object.keys(OS.commands || {}).concat(['ls', 'cat', 'nano', 'top', 'ps', 'neofetch', 'htosver', 'systemctl', 'df', 'free', 'uname', 'help', 'man', 'crontab', 'screenshot']);
      const hits = [...new Set(known)].filter(c => c.startsWith(word)).slice(0, 3);
      const items = hits.map(c => ({ title: c === word ? q.trim() : c, sub: 'Terminal で実行する（jsh）', icon: 'terminal', run: () => run('terminal', { cmd: c === word ? q.trim() : c }) }));
      if (!hits.includes(word)) items.push({ title: '> ' + q.trim(), sub: 'Terminal で実行する（jsh）', icon: 'terminal', run: () => run('terminal', { cmd: q.trim() }) });
      groups.push({ name: 'コマンド', items: items });
    }
    htui.searchProviders.forEach(p => { try { const l = p.find(q) || []; if (l.length) groups.push({ name: p.name, items: l.slice(0, 6) }); } catch (e) { /* 無視 */ } });
    return groups;
  }
  function openPath(p) {
    const hf = htui.fs || fs;
    try {
      if (hf.isDir(p)) { run('hfile', p); return; }
      const k = fs.kind(p);
      const app = k === 'image' ? 'hpaint' : k === 'audio' || k === 'video' ? 'hplayer' : k === 'markdown' && OS.apps.hmd ? 'hmd' : k === 'html' ? 'hbrowser' : 'hedit';
      run(OS.apps[app] ? app : 'hedit', p);
    } catch (e) { ui.alert(e.message); }
  }
  htui.search = function (initial) {
    const old = htui.el && htui.el.querySelector('.hs-ov:not(.leaving)'); if (old) { old._close(); return; }
    if (!htui.user) return;
    closeMenus();
    const q = h('input', { class: 'hs-q', id: 'hs-q', placeholder: 'アプリ・ファイル・設定・コマンドを検索', 'aria-label': '検索', autocomplete: 'off', spellcheck: 'false' });
    const res = h('div', { class: 'hs-res', role: 'listbox' });
    let flat = [], sel = 0;
    const paint = () => flat.forEach((x, i) => x.el.classList.toggle('on', i === sel));
    const fill = () => {
      res.textContent = ''; flat = []; sel = 0;
      const gs = searchAll(q.value);
      gs.forEach(g => {
        res.append(h('div', { class: 'hs-group' }, g.name));
        g.items.forEach(it => {
          const b = h('button', { class: 'hs-item', type: 'button', role: 'option', onclick: () => go(it) },
            it.app ? kit.appIcon(it.app, 18) : h('span', { class: 'hs-ico' }, OS.icon(it.icon || 'file', 17)),
            h('span', { class: 'hs-t' }, h('b', null, it.title), it.sub ? h('small', null, it.sub) : null));
          b.addEventListener('pointermove', () => { sel = flat.findIndex(x => x.el === b); paint(); });
          flat.push({ el: b, it: it }); res.append(b);
        });
      });
      if (!flat.length) res.append(h('p', { class: 'hs-empty' }, '見つかりませんでした'));
      paint();
    };
    const box = h('div', { class: 'hs-box' }, h('label', { class: 'hs-bar' }, OS.icon('search', 18), q, h('kbd', null, 'Esc')), res);
    const ov = h('div', { class: 'hs-ov', role: 'dialog', 'aria-label': '検索' }, box);
    function go(it) { close(); try { it.run(); } catch (e) { ui.alert(e.message); } }
    function close() { document.removeEventListener('keydown', esc, true); leave(ov); }
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q.value) { q.value = ''; fill(); } else close(); } };
    ov._close = close;
    ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
    q.addEventListener('input', fill);
    q.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (flat.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length; paint(); flat[sel].el.scrollIntoView({ block: 'nearest' }); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (flat[sel]) go(flat[sel].it); }
    });
    document.addEventListener('keydown', esc, true);
    htui.el.append(ov);
    if (initial) q.value = initial;
    fill();
    setTimeout(() => q.focus(), 20);
  };

  // ---------- HTUi SDK 2（Jupiter）〜 4（Mars）: ウインドウ
  //   o.parent を渡すと、そのウインドウの子ウインドウになる。子ウインドウは
  //   ・タスクバーなどには出ず、親の真ん中に開く（htui.wins には入らず、親の children に入る）
  //   ・開いているあいだ、親は操作できない（親を押すと子が前に出て点滅する）
  //   ・親を最小化・非表示にすると一緒に隠れ、親を閉じると一緒に閉じる
  //   o.dialog: 最小化・最大化ボタンと大きさの変更をなくす。o.h が 'auto' なら中身に合わせた高さ
  //   o.buttons（3.0）: タイトルバーに置くアプリ独自のボタン [{ icon, label, title, onclick(e, on), toggle, on, disabled }]
  //     あとから足すときは win.addButton({...})。返り値（win.captionButtons にも入る）で active / disabled / setIcon / setTitle / remove
  htui.open = function (o) {
    const desk = htui.desk, dw = desk.clientWidth, dh = desk.clientHeight;
    const parent = o.parent && !o.parent.closed ? o.parent : null;
    if (parent && !o.silent) OS.sound.play(o.sound || 'confirm');
    const win = { pid: OS.proc ? OS.proc.alloc() : ++htui.pid, title: o.title, app: o.app || (parent && parent.app), zone: null, rect: null, onClose: null, onDispose: null, onFocus: null, parent: parent, children: [], dialog: !!o.dialog };
    if (!parent) win.ws = htui.ws.cur; // 開いたときの仮想デスク
    // 親のないウインドウは 1 つのプロセス（子ウインドウは親のプロセスのもの）
    if (OS.proc && !parent) OS.proc.spawn({ pid: win.pid, name: win.app || 'window', cmd: (win.app || 'window') + ' — ' + o.title, user: htui.user || 'root', kind: 'app', win: win,
      ppid: htui.sessionProc ? htui.sessionProc.pid : 1, onsignal: async sig => { const ok = await win.close(sig === 'KILL'); if (ok === false) throw new Error('(' + win.pid + '): ' + o.title + ' が終了を取りやめました（保存していない変更など。強制するなら kill -KILL）'); return true; } });
    const titleEl = h('span', { class: 'win-title' }, o.title);
    const bMin = h('button', { class: 'win-btn', type: 'button', title: '最小化', 'aria-label': '最小化' }, OS.icon('min', 14));
    const bMax = h('button', { class: 'win-btn', type: 'button', title: '最大化（右クリックでスナップ配置を選ぶ）', 'aria-label': '最大化' }, OS.icon('max', 14));
    const bX = h('button', { class: 'win-btn close', type: 'button', title: '閉じる', 'aria-label': '閉じる' }, OS.icon('x', 14));
    const capBox = h('span', { class: 'win-cap' });
    const head = h('div', { class: 'win-head' }, OS.icon(o.icon, 16), titleEl, capBox, h('span', { class: 'win-btns' }, o.dialog ? null : bMin, o.dialog ? null : bMax, bX));
    const body = win.body = h('div', { class: 'win-body' });
    const el = win.el = h('div', { class: 'win' + (parent ? ' child' : '') + (o.dialog ? ' dialog' : ''), role: o.dialog ? 'dialog' : 'group', 'aria-label': o.title, 'aria-modal': parent ? 'true' : null }, head, body);
    const w = Math.min(o.w || 640, dw - 8), hh = o.h === 'auto' ? 0 : Math.min(o.h || 420, dh - 8), n = htui.wins.length % 7;
    el.style.width = px(w);
    if (hh) el.style.height = px(hh); else el.style.maxHeight = px(dh - 8);
    el.style.left = px(clamp(90 + n * 26, 4, Math.max(4, dw - w - 4)));
    el.style.top = px(clamp(16 + n * 24, 4, Math.max(4, dh - hh - 4)));

    const task = win.task = h('button', { class: 'p-task', type: 'button', title: o.title }, OS.icon(o.icon, 14), h('span', null, o.title));
    task.addEventListener('click', () => { if (el.classList.contains('active') && !el.classList.contains('hidden')) win.minimize(); else win.focus(); });
    if (!parent) { task.dataset.app = win.app || ''; htui.tasks.append(task); }

    win.captionButtons = [];
    win.addButton = spec => {
      spec = spec || {};
      const ic = h('span', { class: 'cap-ico' }, spec.icon ? OS.icon(spec.icon, 15) : null), lb = h('span', { class: 'cap-l' }, spec.label || '');
      const b = h('button', { class: 'win-cbtn', type: 'button', title: spec.title || spec.label || '', 'aria-label': spec.title || spec.label || '' }, ic, spec.label ? lb : null);
      const handle = {
        el: b, spec: spec,
        get active() { return b.classList.contains('on'); },
        set active(v) { b.classList.toggle('on', !!v); if (spec.toggle) b.setAttribute('aria-pressed', v ? 'true' : 'false'); },
        get disabled() { return b.disabled; }, set disabled(v) { b.disabled = !!v; },
        setIcon(n) { ic.textContent = ''; if (n) ic.append(OS.icon(n, 15)); },
        setLabel(t) { lb.textContent = t || ''; if (t && !lb.parentNode) b.append(lb); },
        setTitle(t) { b.title = t; b.setAttribute('aria-label', t); },
        remove() { b.remove(); win.captionButtons = win.captionButtons.filter(x => x !== handle); }
      };
      if (spec.toggle) handle.active = !!spec.on;
      if (spec.disabled) b.disabled = true;
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (spec.toggle) handle.active = !handle.active;
        try { if (spec.onclick) spec.onclick.call(win, e, handle.active, handle); } catch (er) { OS.ui.alert(er.message); }
      });
      b.addEventListener('dblclick', e => e.stopPropagation());
      capBox.append(b); win.captionButtons.push(handle);
      return handle;
    };
    (o.buttons || []).forEach(win.addButton);
    win.setTitle = t => { win.title = t; titleEl.textContent = t; task.lastChild.textContent = t; task.title = t; el.setAttribute('aria-label', t); htui.syncTitle(); };
    win.focus = () => {
      win._min = 0;
      { const r0 = rootOf(win); if ((r0.ws | 0) !== htui.ws.cur && !win.closed) { htui.ws.cur = r0.ws | 0; htui.wsApply(); } } // ほかの仮想デスクのウィンドウ: そのデスクへ
      const back = !parent && el.classList.contains('hidden') && htui.wireMode();
      el.classList.remove('hidden', 'minimizing');
      if (back) { el.style.visibility = 'hidden'; htui.wire(htui.taskAnchor(win), el.getBoundingClientRect(), 200, () => { el.style.visibility = ''; }); }
      // 子ウインドウがあれば、親を前に出してから、いちばん新しい子にフォーカスする
      if (win.children.length) { el.style.zIndex = ++htui.z; win.children[win.children.length - 1].focus(); return; }
      if (parent) { const r = rootOf(win); r.el.classList.remove('hidden', 'minimizing'); }
      htui.allWins().forEach(x => { x.el.classList.remove('active'); x.task.classList.remove('active'); });
      el.classList.add('active'); rootOf(win).task.classList.add('active');
      el.style.zIndex = ++htui.z;
      if (htui.shell && htui.shell.onFocus) htui.shell.onFocus(rootOf(win));
      htui.syncTitle();
      if (win.onFocus) win.onFocus();
    };
    // 子ウインドウを開いているあいだに親を押したら、子を点滅させて知らせる
    win.flash = () => { const c = win.children[win.children.length - 1]; if (!c) return; c.focus(); c.el.classList.remove('cw-flash'); void c.el.offsetWidth; c.el.classList.add('cw-flash'); };
    win.minimize = () => {
      if (parent) { rootOf(win).minimize(); return; }
      const tok = win._min = Date.now() + Math.random();
      el.classList.remove('active'); task.classList.remove('active');
      if (htui.wireMode() && !el.classList.contains('hidden')) {
        const from = el.getBoundingClientRect(), to = htui.taskAnchor(win);
        el.classList.add('hidden'); focusTop(); htui.wire(from, to, 220);
        return;
      }
      animOut(el, 'minimizing', 170, () => { if (win._min !== tok || win.closed) return; el.classList.add('hidden'); focusTop(); });
    };
    win.close = async force => {
      // 子ウインドウ（確認のダイアログなど）が開いているあいだは閉じない。強制のときは子も一緒に閉じる
      if (!force && win.children.length) {
        for (const c of win.children.slice()) { if ((await c.close()) === false) { win.flash(); return false; } }
      }
      if (!force && win.onClose && (await win.onClose()) === false) return false;
      if (win.closed) return true;
      win.closed = true;
      if (OS.proc && !parent) OS.proc.exit(win.pid, 0);
      win.children.slice().forEach(c => c.close(true));
      try { if (win.onDispose) win.onDispose(); } catch (e) { /* 後始末の失敗は無視 */ }
      task.remove();
      if (win._mo) win._mo.disconnect();
      if (parent) {
        parent.children = parent.children.filter(x => x !== win);
        if (!parent.children.length) { parent.el.classList.remove('has-child'); if (parent._block) parent._block.remove(); }
      } else htui.wins = htui.wins.filter(x => x !== win);
      el.classList.remove('active');
      if (force) el.remove(); else animOut(el, 'closing', 150, () => el.remove());
      if (parent && !parent.closed) { if (!parent.el.classList.contains('hidden')) parent.focus(); }
      else focusTop();
      return true;
    };

    // ---- スナップ（zone: max / left / right / tl / tr / bl / br）
    const geoAnim = () => { if (htui.animOff()) return; el.classList.add('geo'); clearTimeout(win._gt); win._gt = setTimeout(() => el.classList.remove('geo'), 240); };
    const setPx = r => { el.style.left = px(r.l); el.style.top = px(r.t); el.style.width = px(r.w); el.style.height = px(r.h); };
    const curRect = () => ({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    win.snap = (zone, quiet) => {
      const g = ZONES[zone]; if (!g) return;
      if (!win.zone) win.rect = curRect();
      if (!quiet) { setPx(curRect()); el.offsetWidth; geoAnim(); }
      win.zone = zone;
      el.style.left = g[0] + '%'; el.style.top = g[1] + '%'; el.style.width = g[2] + '%'; el.style.height = g[3] + '%';
      el.classList.add('tiled'); el.classList.toggle('max', zone === 'max');
    };
    win.unsnap = quiet => {
      if (!win.zone) return;
      if (!quiet) { setPx(curRect()); el.offsetWidth; geoAnim(); }
      win.zone = null; el.classList.remove('tiled', 'max');
      const r = win.rect, d = htui.desk;
      setPx({ l: clamp(r.l, 60 - r.w, d.clientWidth - 60), t: clamp(r.t, 0, Math.max(0, d.clientHeight - 30)), w: r.w, h: r.h });
    };
    const toggleMax = () => { if (win.zone === 'max') win.unsnap(); else win.snap('max'); };

    bX.addEventListener('click', () => win.close());
    bMin.addEventListener('click', () => win.minimize());
    bMax.addEventListener('click', () => { closeLayouts(); toggleMax(); });
    // SDK 4: マウスを乗せて少し待つとスナップレイアウト
    bMax.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' || OS.touch || parent) return; clearTimeout(layoutTimer); layoutTimer = setTimeout(() => htui.snapLayouts(win, bMax), 450); });
    bMax.addEventListener('pointerleave', () => { clearTimeout(layoutTimer); if (layoutPop) layoutTimer = setTimeout(closeLayouts, 350); });
    bMax.addEventListener('contextmenu', e => {
      e.preventDefault();
      closeLayouts();
      menu(bMax, [['左半分', 'left'], ['右半分', 'right'], ['左 3 分の 1', 'l3'], ['真ん中 3 分の 1', 'c3'], ['右 3 分の 1', 'r3'], ['左上', 'tl'], ['右上', 'tr'], ['左下', 'bl'], ['右下', 'br'], ['最大化', 'max']]
        .map(x => ({ label: x[0], act: () => win.snap(x[1]) })).concat([{ label: '元のサイズに戻す', act: () => win.unsnap() }]), true);
    });
    head.addEventListener('dblclick', e => { if (!e.target.closest('.win-btn,.win-cbtn') && (!OS.touch || win.free) && !o.dialog) toggleMax(); });
    el.addEventListener('pointerdown', e => {
      if (win.children.length) { e.preventDefault(); e.stopPropagation(); win.flash(); return; }
      if (!el.classList.contains('active')) win.focus();
    }, true);

    // ---- タイトルバーのドラッグで移動。画面の端まで運ぶとスナップ
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.win-btn,.win-cbtn') || e.button > 0 || (OS.touch && !win.free)) return;
      const dr = desk.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      let sx = e.clientX - dr.left - el.offsetLeft, sy = e.clientY - dr.top - el.offsetTop, moved = false, zone = null;
      const startRect = win.zone ? win.rect : curRect();
      head.setPointerCapture(e.pointerId);
      const mv = ev => {
        if (!moved) {
          if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6) return;
          moved = true; htui.el.classList.add('dragging');
          if (win.zone) { const ratio = sx / el.offsetWidth; win.unsnap(true); sx = win.rect.w * ratio; sy = Math.min(sy, 20); }
        }
        const x = ev.clientX - dr.left, y = ev.clientY - dr.top, E = 14;
        el.style.left = px(clamp(x - sx, 60 - el.offsetWidth, dr.width - 60));
        el.style.top = px(clamp(y - sy, 0, dr.height - 30));
        const band = y < dr.height * 0.25 ? 0 : y > dr.height * 0.75 ? 2 : 1;
        zone = x < E ? ['tl', 'left', 'bl'][band] : x > dr.width - E ? ['tr', 'right', 'br'][band] : y < 6 ? 'max' : null;
        preview(zone, +el.style.zIndex);
      };
      const up = () => {
        head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up);
        htui.el.classList.remove('dragging'); preview(null);
        if (moved && zone) { win.snap(zone); win.rect = startRect; if (zone === 'left' || zone === 'right') htui.snapAssist([zone === 'left' ? 'right' : 'left'], [win]); }
      };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    });

    // ---- 8方向のリサイズハンドル
    if (!o.dialog) 'n s e w ne nw se sw'.split(' ').forEach(d => {
      const hd = h('div', { class: 'rz rz-' + d });
      hd.addEventListener('pointerdown', e => {
        if (e.button > 0 || win.zone === 'max') return;
        e.preventDefault();
        if (win.zone) { const r = curRect(); win.zone = null; el.classList.remove('tiled'); setPx(r); }
        const s = Object.assign({ x: e.clientX, y: e.clientY }, curRect());
        hd.setPointerCapture(e.pointerId); htui.el.classList.add('dragging');
        const mv = ev => {
          const dx = ev.clientX - s.x, dy = ev.clientY - s.y, r = { l: s.l, t: s.t, w: s.w, h: s.h };
          if (d.includes('e')) r.w = Math.max(MINW, s.w + dx);
          if (d.includes('w')) { r.w = Math.max(MINW, s.w - dx); r.l = s.l + s.w - r.w; }
          if (d.includes('s')) r.h = Math.max(MINH, s.h + dy);
          if (d.includes('n')) { r.h = clamp(s.h - dy, MINH, s.h + s.t); r.t = s.t + s.h - r.h; }
          setPx(r);
        };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up); htui.el.classList.remove('dragging'); };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
      });
      el.append(hd);
    });

    desk.append(el);
    if (parent) {
      // 子ウインドウ: 親の真ん中に置き、親の操作をふさぐ。親が隠れたら一緒に隠れる
      win.free = true; el.classList.add('free');
      parent.children.push(win);
      parent.el.classList.add('has-child');
      if (!parent._block) parent._block = h('div', { class: 'cw-block', 'aria-hidden': 'true' });
      parent.el.append(parent._block);
      const pr = { l: parent.el.offsetLeft, t: parent.el.offsetTop, w: parent.el.offsetWidth, h: parent.el.offsetHeight };
      const ww = el.offsetWidth, wh = el.offsetHeight;
      el.style.left = px(clamp(pr.l + (pr.w - ww) / 2, 4, Math.max(4, dw - ww - 4)));
      el.style.top = px(clamp(pr.t + Math.min(60, (pr.h - wh) / 2), 4, Math.max(4, dh - wh - 4)));
      if (!parent._mo && window.MutationObserver) {
        const sync = () => { const hide = parent.el.classList.contains('hidden') || parent.el.classList.contains('minimizing'); htui.allWins().filter(c => c !== parent && rootOf(c) === rootOf(parent) && c.parent).forEach(c => c.el.classList.toggle('hidden', hide)); };
        parent._mo = new MutationObserver(sync); parent._mo.observe(parent.el, { attributes: true, attributeFilter: ['class'] });
      }
      win.focus();
      return win;
    }
    htui.wins.push(win);
    // タッチでは全画面。ただし環境が「ふつうのウィンドウ」を許す場面（hWin のデスクトップ）なら free にして動かせるようにする
    win.free = !!(OS.touch && htui.shell && htui.shell.freeWindows && htui.shell.freeWindows());
    if (win.free) el.classList.add('free');
    if (dw < 700 || (OS.touch && !win.free)) win.snap('max', true);
    win.focus();
    return win;
  };
  function focusTop() {
    // 子ウインドウは親の children にあるので、ここでは親だけを見る（親の focus が子にフォーカスを渡す）
    const vis = htui.wins.filter(w => !w.el.classList.contains('hidden') && !w.el.classList.contains('minimizing') && !w.el.classList.contains('ws-off'));
    if (!vis.length) { htui.syncTitle(); return; }
    vis.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0))[0].focus();
  }
  // Ctrl+Alt+矢印キーでアクティブなウィンドウをスナップ
  // Super（Windows / Command）キーだけを押して離したら、環境の onSuper を呼ぶ（GNOME のアクティビティ、Windows のスタートなど）
  let superAlone = false;
  function keyUp(e) {
    if (htui.locked) return;
    if (e.key === 'Alt' && ats) { e.preventDefault(); altTabEnd(); return; }
    if (e.key !== 'Meta' || !superAlone) return;
    superAlone = false;
    if (htui.user && htui.shell && htui.shell.onSuper && !htui.el.querySelector('.modal-ov')) { e.preventDefault(); htui.shell.onSuper(); }
  }
  // ---- Alt+Tab（Alt+` でも）: Alt を押したまま Tab で選び、Alt を離すとそのウィンドウに切り替える。Shift で逆順、Esc でやめる
  //      順番は最近使った順（手前から）。最小化したウィンドウも入る
  let ats = null;
  function altTab(back) {
    if (!ats) {
      const list = htui.wins.filter(w => !w.closed).sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
      if (!list.length) return;
      const row = h('div', { class: 'ats-row' });
      const el = h('div', { class: 'ats', role: 'listbox', 'aria-label': 'ウィンドウの切り替え' }, row, h('div', { class: 'ats-title' }));
      list.forEach((w, i) => {
        const a = OS.apps[w.app] || {};
        row.append(h('button', { class: 'ats-item', type: 'button', role: 'option', title: w.title, tabindex: '-1',
          onpointerdown: e => e.preventDefault(), onclick: () => { ats.i = i; altTabEnd(); } },
          kit.appIcon(a.icon ? a : { icon: 'file' }, 30), h('span', { class: 'ats-name' }, a.name || w.title)));
      });
      ats = { list, i: 0, el };
      htui.el.append(el);
      if (list.length === 1) { paintAts(); return; }
    }
    const n = ats.list.length;
    ats.i = (ats.i + (back ? -1 : 1) + n) % n;
    paintAts();
  }
  function paintAts() {
    [...ats.el.querySelectorAll('.ats-item')].forEach((b, j) => { b.classList.toggle('sel', j === ats.i); b.setAttribute('aria-selected', j === ats.i ? 'true' : 'false'); if (j === ats.i) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    ats.el.lastChild.textContent = ats.list[ats.i].title;
  }
  function altTabEnd(cancel) {
    if (!ats) return;
    const { list, i, el } = ats; ats = null;
    leave(el);
    if (cancel !== true && list[i] && !list[i].closed) list[i].focus();
  }
  // ---------- スクリーンショット（7.0）: Alt+Shift+5 か jsh の screenshot。~/Pictures/Screenshots に PNG で保存する
  //   画面（#os-root）を複製して SVG の foreignObject に入れ、canvas に描いて PNG にする（ブラウザの画面共有の許可は要らない）。
  //   canvas は画像に置き換え、入力欄の中身・スクロール位置も写す。iframe（hBrowser の中身など）と外部の画像は写らない
  htui.screenshot = async function (o) {
    o = o || {};
    if (!htui.running || !htui.user) throw new Error('デスクトップが動いていません');
    const root = OS.root, W = root.clientWidth || window.innerWidth, H = root.clientHeight || window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const clone = root.cloneNode(true), src = root.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = dst[i]; if (!b) continue;
      const tag = a.tagName;
      if (tag === 'CANVAS') {
        let url = ''; try { url = a.toDataURL('image/png'); } catch (e) { /* 写せない canvas */ }
        const img = document.createElement('img'); img.src = url; img.className = a.className; img.setAttribute('style', a.getAttribute('style') || '');
        img.style.width = a.clientWidth + 'px'; img.style.height = a.clientHeight + 'px'; b.replaceWith(img); continue;
      }
      if (tag === 'IFRAME' || tag === 'VIDEO' || tag === 'OBJECT' || tag === 'EMBED') {
        const d = document.createElement('div'); d.className = a.className; d.setAttribute('style', (a.getAttribute('style') || '') + ';background:#2b2d33');
        d.style.width = a.clientWidth + 'px'; d.style.height = a.clientHeight + 'px'; b.replaceWith(d); continue;
      }
      if (tag === 'SCRIPT') { b.remove(); continue; }
      if (tag === 'INPUT') { if (a.type === 'checkbox' || a.type === 'radio') { if (a.checked) b.setAttribute('checked', ''); else b.removeAttribute('checked'); } else if (a.type !== 'file' && a.type !== 'password') b.setAttribute('value', a.value); else if (a.type === 'password') b.setAttribute('value', a.value.replace(/./g, '•')); }
      else if (tag === 'TEXTAREA') b.textContent = a.value;
      else if (tag === 'SELECT') Array.prototype.forEach.call(b.options, (op, k) => { if (k === a.selectedIndex) op.setAttribute('selected', ''); else op.removeAttribute('selected'); });
      else if (tag === 'IMG' && a.src && !/^(data|blob):/.test(a.src)) b.removeAttribute('src');
      if ((a.scrollTop || a.scrollLeft) && b.children) Array.prototype.forEach.call(b.children, c => { c.style.translate = (-a.scrollLeft) + 'px ' + (-a.scrollTop) + 'px'; });
    }
    clone.style.position = 'relative'; clone.style.top = '0'; clone.style.left = '0'; clone.style.width = W + 'px'; clone.style.height = H + 'px';
    // blob: の画像（壁紙など）は data: にしておく（SVG の画像からは blob: を読めない）
    const blobs = clone.querySelectorAll('img[src^="blob:"]');
    await Promise.all(Array.prototype.map.call(blobs, im => fetch(im.src).then(r => r.blob()).then(bl => new Promise(res => { const fr = new FileReader(); fr.onload = () => { im.src = fr.result; res(); }; fr.onerror = res; fr.readAsDataURL(bl); })).catch(() => {})));
    // アニメーションは止める（画像の中では最初の場面から描き直されるため、開くアニメーションのウインドウが透明に写ってしまう）
    const css = Array.prototype.map.call(document.querySelectorAll('style'), s => s.textContent).join('\n') + '\n*,*::before,*::after{animation:none!important;transition:none!important}';
    const html = document.documentElement, body = document.body;
    const attrs = el => Array.prototype.map.call(el.attributes, x => x.name + '="' + x.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"').join(' ');
    const xs = new XMLSerializer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="100%" height="100%">' +
      '<html xmlns="http://www.w3.org/1999/xhtml" ' + attrs(html) + '><head><style>' + xs.serializeToString(document.createTextNode(css)) + '</style></head>' +
      '<body ' + attrs(body) + ' style="' + (body.getAttribute('style') || '').replace(/"/g, '&quot;') + ';margin:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden">' + xs.serializeToString(clone) + '</body></html></foreignObject></svg>';
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('画面を画像にできませんでした')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const cv = document.createElement('canvas'); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = getComputedStyle(body).backgroundColor || '#000'; g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, W, H);
    let url; try { url = cv.toDataURL('image/png'); } catch (e) { throw new Error('このブラウザでは画面を画像にできません（' + e.message + '）'); }
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const dir = users.home(htui.user) + '/Pictures/Screenshots', name = 'スクリーンショット ' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + '.png';
    if (!htui.fs.isDir(dir)) htui.fs.mkdir(dir, { parents: true });
    const file = dir + '/' + name;
    htui.fs.write(file, url, { bin: true });
    if (!o.quiet) {
      const fl = h('div', { class: 'shot-flash' }); htui.el.append(fl); setTimeout(() => fl.remove(), 600);
      OS.notify({ app: 'スクリーンショット', icon: 'camera', title: 'スクリーンショットを保存しました', body: '~/Pictures/Screenshots/' + name, silent: false });
    }
    return file;
  };
  function hotkeys(e) {
    if (htui.locked) return; // ロック中はショートカットを使わない
    // スクリーンショット: Alt+Shift+5（キーの位置で見る。Shift+5 は配列によって % など）
    if (htui.user && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Digit5') {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) htui.screenshot().catch(err => ui.toast('スクリーンショットを撮れませんでした: ' + err.message));
      return;
    }
    // 仮想デスク: Ctrl+Super+←/→ か Ctrl+Alt+PageUp/PageDown。Shift も押すと、使っているウィンドウを連れて移る
    if (htui.user && e.ctrlKey && ((e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) || (e.altKey && !e.metaKey && (e.key === 'PageUp' || e.key === 'PageDown')))) {
      e.preventDefault(); e.stopPropagation(); superAlone = false;
      const to = htui.ws.cur + (e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 1);
      if (to >= htui.ws.count && e.shiftKey && htui.active() && htui.wsAdd() < 0) return;
      htui.wsSwitch(to, { carry: e.shiftKey });
      return;
    }
    superAlone = e.key === 'Meta' && !e.repeat ? true : e.key === 'Meta' ? superAlone : false;
    if (ats && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); altTabEnd(true); return; }
    if (htui.user && e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'Tab' || e.code === 'Backquote') && !htui.el.querySelector('.modal-ov')) {
      e.preventDefault(); e.stopPropagation(); altTab(e.shiftKey); return;
    }
    // SDK 4: 検索（Alt+Space）
    if (htui.user && e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'Space') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) htui.search(); return; }
    if (htui.user && htui.shell && htui.shell.onKey && htui.shell.onKey(e) === true) { e.preventDefault(); return; }
    if (!e.ctrlKey || !e.altKey || !htui.user) return;
    const w = htui.active(); if (!w) return;
    if (e.key === 'ArrowLeft') w.snap('left'); else if (e.key === 'ArrowRight') w.snap('right');
    else if (e.key === 'ArrowUp') w.snap('max'); else if (e.key === 'ArrowDown') { if (w.zone) w.unsnap(); else w.minimize(); }
    else return;
    e.preventDefault();
  }

  // ---------- ダイアログ
  const ui = OS.ui = {};
  // ダイアログ。ウインドウの中から開いたとき（o.parent か、フォーカスのあるウインドウがあるとき）は、そのウインドウの子ウインドウとして開く。
  // デスクトップやログイン画面など、持ち主のウインドウがないときは画面全体を暗くして真ん中に出す
  const ownerOf = node => { if (!node || !htui.running || !htui.desk) return null; const l = htui.allWins().filter(w => !w.closed && w.el.contains(node)); return l[l.length - 1] || null; };
  ui.modal = function (o) {
    const owner = o.parent === null ? null : o.parent || ownerOf(document.activeElement) || (htui.running && htui.desk && htui.user ? htui.active() : null);
    if (owner && !owner.closed && htui.desk && htui.desk.isConnected) return childModal(o, owner);
    return new Promise(res => {
      const foot = h('div', { class: 'modal-foot' });
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, style: o.width ? 'width:' + o.width + 'px' : null },
        h('div', { class: 'modal-title' }, o.title), h('div', { class: 'modal-body' }, o.body), foot);
      const ov = h('div', { class: 'modal-ov' }, box);
      const prev = document.activeElement;
      const done = v => { ov.remove(); try { if (prev && prev.isConnected && prev.focus) prev.focus(); } catch (e) { /* フォーカスを戻せなくてもよい */ } res(v); };
      const fire = b => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v === ui.KEEP) return; done(v); };
      let primary = null, cancel = null;
      o.buttons.forEach(b => {
        const el = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button', onclick: () => fire(b) }, b.label);
        if (b.primary) primary = b; if (b.cancel) cancel = b;
        foot.append(el);
      });
      ov.addEventListener('keydown', e => {
        if (e.key === 'Escape' && cancel) { e.preventDefault(); fire(cancel); }
        else if (e.key === 'Enter' && primary && !e.isComposing && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); fire(primary); }
      });
      (htui.el || OS.root).append(ov);
      OS.sound.play(o.sound || 'confirm');
      const f = box.querySelector('input,select,textarea') || foot.querySelector('.primary') || foot.querySelector('button');
      if (f) { f.focus(); if (f.select && f.type !== 'password') f.select(); }
      if (o.onOpen) o.onOpen(done);
    });
  };
  function childModal(o, owner) {
    return new Promise(res => {
      const foot = h('div', { class: 'modal-foot' });
      const box = h('div', { class: 'modal cw-modal' }, h('div', { class: 'modal-title' }, o.title), h('div', { class: 'modal-body' }, o.body), foot);
      // 持ち主がもう子ウインドウを開いているときは、その子の子にする
      let p = owner; while (p.children.length) p = p.children[p.children.length - 1];
      const win = htui.open({ title: o.title, icon: o.icon || (OS.apps[p.app] || {}).icon || 'bell', w: (o.width || 380) + 2, h: 'auto', parent: p, dialog: true, sound: o.sound });
      win.body.append(box);
      const prev = document.activeElement;
      let finished = false, cancel = null, primary = null;
      const done = v => {
        if (finished) return; finished = true;
        win.close(true);
        try { if (prev && prev.isConnected && prev.focus && !prev.closest('.win.has-child')) prev.focus(); } catch (e) { /* 戻せなくてもよい */ }
        res(v);
      };
      const fire = b => { const v = typeof b.value === 'function' ? b.value() : b.value; if (v === ui.KEEP) return; done(v); };
      o.buttons.forEach(b => {
        foot.append(h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button', onclick: () => fire(b) }, b.label));
        if (b.primary) primary = b; if (b.cancel) cancel = b;
      });
      // × で閉じたら「キャンセル」と同じ。キャンセルが無いダイアログは null
      win.onClose = () => { if (!finished) { if (cancel) fire(cancel); else done(null); } return finished; };
      win.onDispose = () => { if (!finished) { finished = true; res(cancel && typeof cancel.value !== 'function' ? cancel.value : null); } };
      win.el.addEventListener('keydown', e => {
        if (e.key === 'Escape' && cancel) { e.preventDefault(); e.stopPropagation(); fire(cancel); }
        else if (e.key === 'Enter' && primary && !e.isComposing && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); fire(primary); }
      });
      const f = box.querySelector('input,select,textarea') || foot.querySelector('.primary') || foot.querySelector('button');
      win.onFocus = () => { if (!win.el.contains(document.activeElement)) { const g = box.querySelector('input,select,textarea') || foot.querySelector('.primary') || foot.querySelector('button'); if (g) g.focus(); } };
      if (f) { f.focus(); if (f.select && f.type !== 'password') f.select(); }
      if (o.onOpen) o.onOpen(done);
    });
  }
  ui.KEEP = {};
  ui.alert = (msg, title) => ui.modal({ title: title || 'お知らせ', body: h('p', { class: 'modal-msg' }, msg), buttons: [{ label: 'OK', primary: true, cancel: true, value: true }] });
  ui.confirm = (msg, o) => ui.modal({ sound: o && o.danger ? 'error' : 'confirm', title: (o && o.title) || '確認', body: h('p', { class: 'modal-msg' }, msg), buttons: [{ label: 'キャンセル', cancel: true, value: false }, { label: (o && o.ok) || 'OK', primary: true, danger: o && o.danger, value: true }] });
  ui.prompt = (msg, def, o) => {
    const inp = h('input', { class: 'inp', type: o && o.password ? 'password' : 'text', id: 'dlg-input', value: def || '', 'aria-label': msg });
    return ui.modal({ title: (o && o.title) || '入力', body: [h('p', { class: 'modal-msg' }, msg), inp], buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: 'OK', primary: true, value: () => inp.value }] });
  };
  // root 権限が必要な操作の前に呼ぶ。sudo できるユーザーは自分のパスワード（5 分間は聞かない）、ほかは root のパスワードを確認できたら true
  ui.asRoot = async function (reason) {
    if (users.isRoot(htui.user)) return true;
    if (OS.sudo && OS.sudo.rule(htui.user).ok) {
      const me = users.get(htui.user);
      if (me && me.pw) {
        try {
          const ok = await OS.sudo.auth(htui.user, async n => {
            const v = await ui.prompt((n > 1 ? 'パスワードが違います。もう一度入力してください。\n' : '') + (reason ? reason + '\n' : '') + 'この操作には root 権限が必要です。' + htui.user + ' のパスワードを入力してください（sudo）。', '', { password: true, title: 'root 権限が必要です' });
            return v == null ? null : v;
          }, reason || '（HTUi）');
          if (ok) OS.sudo.log(htui.user + ' : HTUi から root 権限 ; ' + (reason || ''), 6);
          return !!ok;
        } catch (e) { await ui.alert(e.message, 'root 権限が必要です'); return false; }
      }
    }
    const r = users.get('root');
    if (!r || !r.pw) { await ui.alert('root のパスワードがまだ設定されていません。\n管理者が Terminal で「sudo passwd root」を実行して設定してください。', 'root 権限が必要です'); return false; }
    const pw = await ui.prompt((reason ? reason + '\n' : '') + 'この操作には root 権限が必要です。root のパスワードを入力してください。', '', { password: true, title: 'root 権限が必要です' });
    if (pw == null) return false;
    if (await users.verify('root', pw)) return true;
    await ui.alert('root のパスワードが違います。', 'root 権限が必要です');
    return false;
  };
  ui.toast = function (msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    (htui.el || OS.root).append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3500);
  };

  // ファイル選択ダイアログ。mode: 'open' | 'save'。戻り値は絶対パス（キャンセルは null）
  ui.pickFile = function (o) {
    o = o || {};
    const fsx = htui.fs, home = users.home(htui.user);
    let dir = o.dir && fsx.isDir(o.dir) ? o.dir : home, selected = null;
    const pathEl = h('div', { class: 'fp-path' }), list = h('div', { class: 'fp-list', role: 'listbox' });
    const name = h('input', { class: 'inp', id: 'fp-name', value: o.name || '', placeholder: 'ファイル名', 'aria-label': 'ファイル名' });
    const err = h('div', { class: 'fp-err', role: 'alert' });
    let finish = null;
    const go = d => { dir = d; selected = null; render(); };
    function render() {
      pathEl.textContent = dir; list.textContent = ''; err.textContent = '';
      let names = [];
      try { names = fsx.list(dir); } catch (e) { err.textContent = e.message; }
      if (dir !== '/') list.append(h('button', { class: 'fp-item', type: 'button', onclick: () => go(path.dir(dir)) }, OS.icon('up', 16), '..（上へ）'));
      const rows = names.filter(n => !n.startsWith('.')).map(n => ({ n: n, p: path.join(dir, n), d: fs.isDir(path.join(dir, n)) })).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
      rows.forEach(r => {
        if (!r.d && o.kinds && !o.kinds.includes(fs.kind(r.p))) return;
        const b = h('button', { class: 'fp-item', type: 'button', role: 'option' }, OS.icon(r.d ? 'folder' : fileIcon(r.p), 16), r.n);
        b.addEventListener('click', () => {
          if (r.d) return go(r.p);
          list.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
          selected = r.p; name.value = r.n;
        });
        b.addEventListener('dblclick', () => { if (!r.d && finish) { const v = result(); if (v !== ui.KEEP) finish(v); } });
        list.append(b);
      });
    }
    function result() {
      if (o.mode === 'save') {
        const n = name.value.trim();
        if (!n || n.includes('/')) { err.textContent = 'ファイル名を入力してください（/ は使えません）。'; return ui.KEEP; }
        const p = path.join(dir, n);
        if (!fsx.canWrite(p) && !o.allowRoot) { err.textContent = 'この場所には保存できません（許可がありません）。'; return ui.KEEP; }
        if (fs.isDir(p)) { err.textContent = '同じ名前のフォルダがあります。'; return ui.KEEP; }
        return p;
      }
      const p = selected || (name.value.trim() ? path.join(dir, name.value.trim()) : null);
      if (!p || !fsx.isFile(p)) { err.textContent = 'ファイルを選んでください。'; return ui.KEEP; }
      return p;
    }
    render();
    const places = h('div', { class: 'fp-places' }, [['ホーム', home], ['Documents', home + '/Documents'], ['Downloads', home + '/Downloads'], ['Pictures', home + '/Pictures'], ['Music', home + '/Music'], ['Videos', home + '/Videos'], ['/', '/']]
      .map(x => h('button', { class: 'btn small', type: 'button', onclick: () => go(x[1]) }, x[0])));
    return ui.modal({
      title: o.title || (o.mode === 'save' ? '名前を付けて保存' : 'ファイルを開く'), width: 460,
      body: [places, pathEl, list, o.mode === 'save' ? name : null, err],
      buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: o.mode === 'save' ? '保存' : '開く', primary: true, value: result }],
      onOpen: done => { finish = done; if (o.mode === 'save') { name.focus(); const i = name.value.lastIndexOf('.'); name.setSelectionRange(0, i > 0 ? i : name.value.length); } }
    });
  };
  function fileIcon(p) { const k = fs.kind(p); return k === 'other' ? 'file' : k; }
  htui.fileIcon = fileIcon;
})();
