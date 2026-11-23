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
    // ---- htmlOS 7.1（Polaris）で追加。HTUi SDK 4 の Mars（火星）と、デスクトップ環境 HTUi 4 の Bengal（ベンガル。猫の写真をローポリで描き直したもの）ほか
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
    { name: 'ベンガル（ローポリ）', dir: '7.1-Polaris', file: 'bengal', css: svgWall("<defs><linearGradient id='g' x1='0' y1='0' x2='.35' y2='1'><stop offset='0' stop-color='#f7f1e7'/><stop offset='1' stop-color='#e6cfa6'/></linearGradient><filter id='s' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='18'/></filter></defs><rect width='1600' height='1000' fill='url(#g)'/><ellipse cx='600' cy='948' rx='660' ry='30' fill='#7a5a34' opacity='.25' filter='url(#s)'/><path fill='#907254' stroke='#907254' stroke-width='.6' d='M10 917L0 945L0 917ZM487 618L471 602L491 573ZM730 769L730 810L699 814ZM316 669L335 692L326 704ZM339 678L335 692L316 669ZM316 854L320 877L297 856ZM1098 130L1104 134L1097 140ZM1104 134L1097 143L1097 140ZM1063 786L1081 765L1087 790ZM1202 462L1203 420L1225 420ZM1185 381L1156 372L1178 365ZM1200 259L1189 251L1195 249ZM343 629L324 654L308 628ZM324 654L343 629L357 639ZM343 629L367 613L357 638ZM843 557L841 553L846 540ZM1099 160L1114 196L1111 197ZM1165 260L1164 252L1189 251ZM923 216L924 238L896 255Z'/><path fill='#604830' stroke='#604830' stroke-width='.6' d='M0 945L10 917L33 945ZM765 630L806 611L789 666ZM180 600L180 617L152 614ZM88 750L66 691L121 717ZM533 671L514 690L511 678ZM879 659L857 660L855 626ZM900 614L903 636L865 616ZM18 693L12 724L0 721ZM600 930L595 916L630 920ZM595 916L633 913L630 920ZM12 724L10 734L0 721ZM259 707L253 670L281 695ZM1121 797L1099 840L1079 807ZM625 691L594 724L578 699ZM732 612L722 647L695 615ZM1190 805L1228 824L1203 839ZM872 602L900 614L865 616ZM595 731L594 724L619 722ZM378 776L392 762L403 784ZM406 904L433 864L451 894ZM800 524L798 533L797 534ZM975 593L995 623L960 617ZM101 805L97 833L93 824ZM261 527L236 578L201 542ZM316 854L337 840L320 877ZM333 767L361 796L318 808ZM835 552L841 558L837 573ZM1010 844L1031 870L1000 890ZM789 811L790 790L808 801ZM1052 381L1041 413L1029 402ZM884 525L879 513L892 510ZM987 301L999 301L982 316Z'/><path fill='#302418' stroke='#302418' stroke-width='.6' d='M200 592L169 578L199 558ZM120 732L127 745L88 750ZM674 605L665 653L624 649ZM140 706L128 723L121 717ZM447 766L483 733L519 754ZM259 707L248 730L230 717ZM115 678L143 689L140 706ZM216 601L178 636L180 617ZM201 542L214 577L199 558ZM463 412L468 418L456 413ZM528 807L464 839L520 794ZM532 776L528 807L520 794ZM855 626L853 600L865 616ZM0 777L0 749L24 740ZM500 400L471 397L467 393ZM319 603L307 613L300 558ZM518 902L529 897L519 924ZM528 807L512 856L464 839ZM824 478L812 481L817 456ZM831 583L824 589L810 567ZM192 436L216 433L195 446ZM1106 420L1105 395L1133 408ZM763 580L792 572L793 594ZM1165 314L1171 316L1168 318ZM833 511L850 497L844 519ZM1047 251L1028 265L1021 251Z'/><path fill='#241e0c' stroke='#241e0c' stroke-width='.6' d='M133 943L119 914L167 942ZM631 475L680 444L681 462ZM212 667L187 665L178 636ZM333 767L368 738L378 776Z'/><path fill='#483624' stroke='#483624' stroke-width='.6' d='M33 945L53 867L67 945ZM93 587L100 629L64 614ZM97 671L100 629L125 654ZM508 511L560 512L560 553ZM448 780L447 766L519 754ZM514 690L544 718L510 728ZM468 575L456 551L491 573ZM464 839L448 780L520 794ZM776 897L800 925L767 925ZM633 928L641 907L667 927ZM64 643L15 659L32 632ZM544 718L532 776L520 745ZM304 554L304 526L335 531ZM469 476L495 475L508 511ZM402 640L452 629L428 666ZM0 469L3 464L35 468ZM10 734L0 749L0 721ZM200 725L199 717L230 717ZM467 908L481 895L480 934ZM481 895L512 918L480 934ZM853 600L869 598L865 616ZM840 599L814 605L824 597ZM983 726L997 739L971 766ZM1071 415L1052 381L1083 392ZM895 806L903 805L902 811ZM236 578L214 577L201 542ZM1000 842L1010 844L1000 890ZM303 427L287 456L268 438ZM1047 451L1069 433L1055 458ZM1132 414L1106 420L1133 408ZM1146 799L1159 807L1136 822ZM1159 807L1146 799L1164 777ZM766 369L779 368L791 408ZM824 487L831 498L823 489ZM828 502L828 501L831 498ZM994 233L976 238L976 226Z'/><path fill='#543c24' stroke='#543c24' stroke-width='.6' d='M10 917L53 867L33 945ZM448 780L464 839L440 791ZM900 614L906 598L924 613ZM198 935L200 940L167 942ZM304 526L307 510L314 516ZM400 506L449 556L428 571ZM733 845L700 848L699 814ZM798 533L803 544L797 534ZM908 814L937 785L951 804ZM259 646L238 652L245 596ZM843 720L799 718L806 701ZM754 874L757 913L733 925ZM700 848L732 862L692 860ZM1085 679L1084 678L1120 672ZM164 803L163 801L197 789ZM367 640L367 645L357 639ZM464 839L448 841L440 791ZM954 725L964 766L943 755ZM1001 621L1022 596L1029 601ZM886 742L908 751L891 781ZM879 906L866 908L873 901ZM634 760L655 729L699 814ZM1085 246L1103 257L1086 258ZM1011 594L1022 596L1001 621ZM1030 811L1053 831L1045 847ZM654 689L655 729L646 721ZM776 556L758 565L744 554ZM1087 449L1086 452L1080 451ZM1159 807L1190 805L1174 815ZM1017 404L1015 403L1016 398ZM1177 421L1158 417L1172 402ZM1178 423L1180 427L1163 430ZM976 270L979 268L988 287ZM972 294L976 270L988 287Z'/><path fill='#9c7e60' stroke='#9c7e60' stroke-width='.6' d='M145 578L169 578L152 614ZM97 833L55 846L93 831ZM142 797L163 801L159 817ZM316 669L299 695L277 650ZM299 695L296 706L281 695ZM296 706L299 695L326 704ZM316 669L324 654L339 666ZM1185 319L1194 301L1205 309ZM847 468L838 458L857 447ZM1047 759L1051 757L1063 786ZM1177 353L1178 332L1187 338ZM831 351L860 350L859 360ZM1043 443L1047 451L1044 451ZM960 559L965 559L962 565ZM1039 779L1047 759L1063 786ZM1047 759L1033 777L1025 772ZM1177 421L1181 409L1183 411Z'/><path fill='#785a48' stroke='#785a48' stroke-width='.6' d='M291 504L292 509L259 504ZM988 287L999 301L987 301Z'/><path fill='#7e6654' stroke='#7e6654' stroke-width='.6' d='M32 632L0 609L22 598ZM942 273L941 259L948 258Z'/><path fill='#606054' stroke='#606054' stroke-width='.6' d='M691 406L667 397L700 395ZM960 349L957 365L957 349ZM965 369L957 365L962 348Z'/><path fill='#423c30' stroke='#423c30' stroke-width='.6' d='M600 400L570 412L567 400ZM300 360L323 365L315 403ZM1079 461L1069 460L1080 451Z'/><path fill='#906c48' stroke='#906c48' stroke-width='.6' d='M428 696L428 666L438 670ZM560 553L535 590L491 573ZM443 783L403 784L432 751ZM428 696L424 718L411 713ZM555 576L546 595L535 590ZM435 835L403 807L440 791ZM763 873L786 859L776 897ZM1078 615L1082 576L1089 589ZM247 832L248 902L189 869ZM903 703L886 742L843 720ZM936 888L954 883L933 903ZM255 787L283 800L252 798ZM955 415L969 417L950 430ZM948 412L953 410L955 415ZM1167 277L1200 259L1209 281Z'/><path fill='#42301e' stroke='#42301e' stroke-width='.6' d='M456 551L477 527L491 573ZM508 511L560 553L491 573ZM810 688L782 691L789 666ZM549 420L584 464L566 477ZM14 566L0 581L0 553ZM572 652L552 663L521 640ZM857 660L810 688L789 666ZM903 636L879 659L865 616ZM149 865L133 887L105 873ZM335 531L304 526L314 516ZM607 592L604 584L612 575ZM532 776L590 736L586 793ZM370 504L335 531L314 516ZM495 475L469 476L486 469ZM593 598L573 616L586 584ZM377 646L402 640L428 666ZM967 881L972 852L1000 890ZM941 854L919 840L922 832ZM20 413L5 387L33 379ZM133 887L116 896L105 873ZM0 749L10 734L24 740ZM245 748L195 779L200 725ZM15 533L57 556L14 566ZM57 556L19 593L14 566ZM1089 853L1050 864L1053 840ZM501 444L484 432L500 400ZM403 578L359 578L378 546ZM421 485L469 476L440 505ZM573 688L572 652L624 649ZM779 514L771 524L746 510ZM1000 749L1005 768L971 766ZM1005 768L980 794L971 766ZM18 788L0 777L24 740ZM192 780L163 801L174 770ZM261 527L201 542L207 511ZM577 564L555 576L560 553ZM367 640L367 613L377 646ZM812 481L794 462L817 456ZM775 465L753 451L795 447ZM794 462L812 448L817 456ZM865 506L857 500L874 502ZM886 742L891 781L862 758ZM971 705L954 725L952 703ZM177 462L192 436L195 446ZM828 848L850 894L803 907ZM265 470L268 438L282 456ZM290 474L265 470L282 456ZM775 465L789 469L777 473ZM807 436L812 448L795 447ZM268 438L287 456L282 456ZM1127 366L1123 364L1127 364ZM800 434L807 436L795 447ZM763 580L759 574L776 556ZM391 811L361 796L377 792ZM1101 448L1108 464L1095 455ZM780 416L800 434L795 447ZM850 497L853 484L855 496ZM850 497L839 480L853 484ZM1041 232L1029 229L1033 217ZM881 540L883 538L883 540ZM1038 207L1041 205L1054 217ZM1016 268L1013 274L1013 269ZM1013 274L1016 268L1017 277Z'/><path fill='#4e3c24' stroke='#4e3c24' stroke-width='.6' d='M477 527L508 511L491 573ZM169 578L151 555L199 558ZM782 691L810 688L794 699ZM833 920L800 925L803 907ZM115 678L97 671L125 654ZM214 577L216 601L209 580ZM594 724L559 712L578 699ZM653 560L625 585L612 575ZM248 730L274 727L261 752ZM377 792L378 776L403 784ZM512 856L551 843L554 871ZM362 897L394 924L368 927ZM182 376L167 359L200 355ZM368 488L332 462L373 446ZM954 725L943 728L952 703ZM1045 847L1053 831L1053 840ZM1053 831L1099 840L1089 853ZM1115 362L1105 395L1084 366ZM947 182L953 174L953 198Z'/><path fill='#6c543c' stroke='#6c543c' stroke-width='.6' d='M624 649L572 652L605 616ZM521 640L533 671L511 678ZM63 807L93 824L93 831ZM641 907L664 886L667 927ZM35 468L3 464L35 459ZM149 865L175 893L151 886ZM546 595L573 616L532 608ZM664 886L692 889L667 927ZM1122 728L1099 730L1130 700ZM65 437L98 426L93 458ZM35 468L42 465L58 494ZM15 659L8 649L32 632ZM368 488L397 452L377 494ZM949 674L913 699L942 650ZM296 706L274 727L270 716ZM296 706L270 716L281 695ZM1116 277L1103 288L1096 267ZM833 453L817 456L830 445ZM1209 281L1233 297L1205 309ZM0 800L0 777L18 788ZM1102 263L1116 277L1096 267ZM812 448L807 436L814 436ZM868 552L877 548L875 570ZM849 532L856 530L846 540ZM1143 795L1136 822L1121 797ZM1113 225L1105 201L1126 206ZM1106 232L1105 201L1113 225ZM890 527L884 525L892 510ZM391 808L391 811L377 792ZM1048 426L1039 419L1046 419ZM1039 419L1048 426L1046 437ZM1080 220L1105 201L1106 232ZM1074 283L1059 271L1074 272ZM1074 283L1056 279L1059 271ZM149 426L140 384L152 427ZM974 311L987 301L982 316ZM1061 231L1075 229L1080 237ZM1004 471L991 468L1000 451ZM947 250L941 259L933 248ZM928 280L938 271L943 284Z'/><path fill='#786042' stroke='#786042' stroke-width='.6' d='M428 666L452 629L438 670ZM1225 420L1225 393L1230 380ZM1207 349L1239 332L1230 380ZM184 515L192 521L151 555ZM65 437L93 458L70 463ZM50 458L47 460L35 459ZM105 873L116 896L97 891ZM1228 824L1190 805L1240 782ZM800 595L806 611L793 594ZM163 801L164 803L159 817ZM359 578L367 613L340 590ZM1251 801L1228 824L1240 782ZM945 593L946 583L951 594ZM1139 265L1129 249L1143 261ZM1155 234L1161 236L1144 245ZM1029 569L1032 562L1036 577ZM1043 443L1042 443L1046 437ZM1129 249L1144 254L1143 261ZM934 292L944 301L932 299ZM929 263L933 248L934 259ZM935 237L923 216L945 228Z'/><path fill='#907e6c' stroke='#907e6c' stroke-width='.6' d='M1185 71L1200 42L1205 60ZM1115 320L1096 313L1108 298ZM784 261L787 277L767 283ZM842 194L837 165L842 165Z'/><path fill='#9c907e' stroke='#9c907e' stroke-width='.6' d='M1199 75L1185 71L1205 60ZM1183 153L1210 170L1203 172ZM977 388L970 394L965 389Z'/><path fill='#a89c8a' stroke='#a89c8a' stroke-width='.6' d='M1185 71L1150 50L1200 42ZM1197 92L1207 97L1194 99ZM1209 212L1220 230L1200 229ZM953 174L943 176L960 165Z'/><path fill='#7e5a3c' stroke='#7e5a3c' stroke-width='.6' d='M806 611L765 630L793 594ZM151 886L175 893L167 942ZM392 762L418 733L432 751ZM1065 695L1085 679L1078 709ZM247 832L189 869L197 789ZM610 828L587 793L617 776ZM836 419L864 423L862 425ZM922 592L916 594L911 566ZM903 783L908 751L934 777ZM1007 419L1017 404L1024 431ZM1158 417L1163 430L1150 434Z'/><path fill='#8a7e66' stroke='#8a7e66' stroke-width='.6' d='M1204 77L1199 75L1205 60ZM1208 200L1197 188L1215 200Z'/><path fill='#7e6c5a' stroke='#7e6c5a' stroke-width='.6' d='M145 578L93 587L134 564ZM100 629L93 587L152 614ZM1204 204L1208 200L1207 206ZM946 583L957 584L951 594ZM896 539L894 526L910 529ZM833 159L831 166L830 158ZM976 176L953 174L960 170Z'/><path fill='#967e60' stroke='#967e60' stroke-width='.6' d='M93 587L145 578L152 614ZM145 578L151 555L169 578ZM184 515L151 555L163 507ZM128 723L165 710L171 736ZM97 833L130 803L143 838ZM277 650L299 695L281 695ZM343 629L319 603L340 590ZM1085 257L1086 258L1074 272ZM1024 577L1033 578L1022 596ZM1170 232L1165 232L1161 211ZM872 315L891 301L873 324ZM791 307L795 309L794 313ZM796 378L804 399L791 408ZM979 559L977 568L969 566ZM1184 303L1167 277L1198 297ZM917 521L916 524L914 517ZM851 193L874 190L870 225ZM930 272L926 276L921 264ZM1005 241L994 233L1008 222Z'/><path fill='#8a725a' stroke='#8a725a' stroke-width='.6' d='M151 555L127 518L163 507ZM143 689L169 684L165 710ZM0 525L18 503L26 521ZM953 621L945 593L951 594ZM158 486L178 493L163 507ZM178 493L186 504L163 507ZM187 665L169 684L146 678ZM1183 463L1202 462L1200 470ZM902 565L907 566L904 590ZM1150 217L1150 233L1140 222ZM1103 257L1085 246L1102 241ZM1088 325L1086 316L1093 317ZM1016 398L1026 389L1029 402ZM1026 389L1016 398L1019 385ZM1164 252L1161 236L1170 232ZM1061 156L1080 145L1089 163ZM937 305L944 301L944 319ZM1059 234L1080 237L1064 253ZM1003 269L1008 269L1004 280ZM994 233L991 205L1008 219ZM938 271L941 259L942 273ZM920 359L923 365L905 365ZM963 266L976 262L975 268Z'/><path fill='#786c60' stroke='#786c60' stroke-width='.6' d='M743 141L735 130L745 115ZM1106 478L1108 476L1108 481ZM1165 314L1164 317L1162 314ZM934 368L926 371L930 364Z'/><path fill='#968a7e' stroke='#968a7e' stroke-width='.6' d='M772 128L743 141L745 115ZM1108 481L1108 476L1115 482Z'/><path fill='#725a48' stroke='#725a48' stroke-width='.6' d='M233 940L211 932L221 930ZM64 614L53 621L22 598ZM32 632L0 637L0 609ZM814 605L824 589L824 597ZM290 474L291 504L259 504ZM907 566L911 566L904 590ZM1069 433L1077 430L1081 446ZM1015 256L1016 268L1013 269ZM912 349L909 350L919 331Z'/><path fill='#60422a' stroke='#60422a' stroke-width='.6' d='M200 940L211 932L233 940ZM810 688L857 660L838 698ZM190 907L175 893L189 869ZM190 907L198 935L167 942ZM448 579L440 592L428 571ZM799 718L843 720L803 733ZM403 578L428 571L409 587ZM1164 777L1192 775L1190 805ZM610 828L590 836L600 829ZM357 638L367 640L357 639ZM789 469L812 481L786 474ZM849 532L846 540L839 537ZM1009 457L1000 451L1002 447ZM1004 471L1000 451L1009 457ZM986 819L1021 812L1000 842Z'/><path fill='#422a18' stroke='#422a18' stroke-width='.6' d='M119 914L124 942L100 945ZM698 505L681 462L727 468ZM175 893L149 865L189 869ZM307 510L309 491L314 516ZM590 836L542 815L586 793ZM559 712L573 688L578 699ZM733 925L757 913L767 925ZM757 850L732 862L733 845ZM803 544L835 552L810 567ZM995 623L975 593L985 589ZM1007 642L1001 621L1029 601ZM730 746L703 722L732 715ZM698 505L706 530L661 549ZM790 790L791 787L808 801ZM857 500L863 486L874 502ZM850 894L843 854L854 862ZM638 681L639 692L625 691ZM743 541L726 511L746 510ZM1042 177L1052 187L1036 202ZM924 559L933 558L936 575Z'/><path fill='#604224' stroke='#604224' stroke-width='.6' d='M124 942L133 943L100 945ZM392 762L394 733L418 733ZM789 811L757 850L730 810ZM1098 448L1101 448L1095 455ZM1091 154L1099 160L1089 163ZM913 450L912 469L901 451ZM920 211L938 208L923 216Z'/><path fill='#2a1e12' stroke='#2a1e12' stroke-width='.6' d='M133 943L124 942L119 914ZM180 617L180 600L200 592ZM495 475L517 488L508 511ZM243 360L267 358L252 393ZM891 781L850 775L862 758ZM680 444L690 427L727 468ZM115 678L140 706L121 717ZM845 903L833 920L803 907ZM469 476L421 485L464 446ZM779 514L746 510L777 473ZM484 432L478 409L500 400ZM615 522L593 511L599 485ZM597 893L562 866L590 836ZM367 613L403 578L402 610ZM402 640L367 613L402 610ZM444 851L460 850L457 881ZM725 925L732 862L754 874ZM727 468L753 451L777 473ZM753 451L775 465L777 473ZM792 572L794 550L810 567ZM703 722L730 746L730 769ZM297 893L306 904L267 940ZM1048 426L1046 419L1071 415ZM896 539L913 541L906 552ZM1048 426L1069 431L1069 433ZM1130 834L1154 840L1129 839Z'/><path fill='#96785a' stroke='#96785a' stroke-width='.6' d='M53 867L97 891L67 945ZM66 691L43 719L44 704ZM464 692L482 689L471 694ZM464 692L471 694L484 728ZM0 805L18 788L2 812ZM991 440L1010 430L1002 447ZM367 613L343 629L340 590ZM1112 433L1105 443L1096 421ZM814 436L817 424L830 445ZM930 516L934 516L940 529ZM1042 443L1043 443L1044 451ZM804 399L802 404L791 408ZM1164 252L1144 254L1144 245ZM881 195L902 196L870 225ZM875 366L882 387L863 374ZM807 422L817 424L814 436ZM885 393L899 404L879 402Z'/><path fill='#8a6c4e' stroke='#8a6c4e' stroke-width='.6' d='M97 891L100 945L67 945ZM43 719L18 693L44 704ZM919 840L908 814L922 832ZM1219 417L1218 405L1225 420ZM1200 229L1170 232L1198 204ZM324 654L357 639L339 666ZM343 629L357 638L357 639ZM1022 596L1033 578L1029 601ZM866 908L879 906L867 915ZM1011 594L1012 583L1022 596ZM969 417L981 444L966 443ZM923 521L930 516L940 529ZM1144 254L1129 249L1144 245ZM882 387L863 400L863 374ZM962 461L956 456L957 449ZM1178 423L1188 424L1181 427ZM1178 423L1177 421L1188 424Z'/><path fill='#4e361e' stroke='#4e361e' stroke-width='.6' d='M97 891L119 914L100 945ZM763 653L765 630L789 666ZM831 772L856 806L808 801ZM607 592L593 598L604 584ZM1065 695L1008 723L1033 681ZM1122 728L1130 700L1135 730ZM192 521L186 504L207 511ZM590 836L551 843L542 815ZM570 931L571 928L600 930ZM853 600L840 599L854 589ZM913 699L903 703L879 659ZM1084 678L1076 656L1120 672ZM1078 615L1076 656L1052 619ZM986 720L997 739L983 726ZM261 778L255 787L245 748ZM255 787L235 798L245 748ZM704 547L743 541L741 558ZM1103 257L1102 263L1090 264ZM934 292L943 284L944 301ZM1177 421L1178 423L1163 430ZM997 257L1003 243L1010 252Z'/><path fill='#a28460' stroke='#a28460' stroke-width='.6' d='M10 871L53 867L10 917ZM464 692L428 696L438 670ZM1128 585L1110 629L1089 589ZM1185 319L1205 309L1187 338ZM942 470L941 453L952 465ZM1184 303L1198 297L1194 301ZM817 424L842 428L830 445ZM948 412L938 420L940 413ZM1046 437L1042 443L1024 431ZM863 400L836 419L832 417ZM1039 779L1033 777L1047 759ZM948 412L954 392L953 410ZM954 392L948 412L940 413ZM899 404L895 414L883 411ZM860 350L862 363L859 360ZM875 366L862 363L860 350Z'/><path fill='#a2846c' stroke='#a2846c' stroke-width='.6' d='M127 745L171 736L174 770ZM1165 260L1164 258L1164 252ZM1144 254L1164 258L1143 261Z'/><path fill='#90725a' stroke='#90725a' stroke-width='.6' d='M171 736L165 710L170 713ZM93 824L97 833L93 831ZM189 711L183 741L171 736ZM18 693L23 689L44 704ZM835 534L835 552L811 533ZM865 559L865 574L843 557ZM0 800L18 788L0 805ZM121 777L93 796L100 766ZM841 553L835 552L844 541ZM1140 213L1150 217L1140 222ZM921 264L887 265L896 255ZM808 408L807 422L798 425ZM953 198L959 225L938 208Z'/><path fill='#726042' stroke='#726042' stroke-width='.6' d='M169 578L180 600L152 614ZM959 225L953 198L970 206ZM1005 241L1008 222L1014 245Z'/><path fill='#362418' stroke='#362418' stroke-width='.6' d='M200 592L180 600L169 578ZM464 446L406 450L462 434ZM482 689L503 688L484 728ZM573 616L572 652L521 640ZM64 643L53 621L64 614ZM209 580L200 592L199 558ZM304 554L335 531L327 584ZM448 579L468 575L455 586ZM249 905L297 893L267 940ZM128 723L126 731L120 732ZM600 569L599 549L612 575ZM604 584L600 569L612 575ZM274 727L248 730L270 716ZM192 780L195 779L197 789ZM680 444L631 475L613 440ZM577 564L600 569L586 584ZM789 549L794 550L792 572ZM625 691L638 707L619 722ZM633 742L615 741L619 722ZM638 505L681 462L698 505ZM1053 831L1036 797L1079 807ZM961 850L986 819L972 852ZM760 419L763 423L753 451ZM839 480L850 497L831 498ZM1064 253L1064 262L1051 249ZM1042 240L1047 251L1021 251Z'/><path fill='#786048' stroke='#786048' stroke-width='.6' d='M53 621L32 632L22 598ZM471 694L482 689L484 728ZM471 602L468 575L491 573ZM1177 849L1174 815L1203 839ZM24 740L12 724L43 719ZM814 518L810 522L801 520ZM57 556L15 533L26 521ZM843 557L865 574L837 573ZM1205 309L1233 297L1232 308ZM330 442L350 413L373 446ZM885 590L902 565L904 590ZM178 493L188 471L186 504ZM332 462L308 465L330 442ZM308 465L332 462L309 491ZM1117 230L1125 224L1131 231ZM1039 779L1036 797L1025 793ZM1017 404L1016 398L1029 402ZM928 543L922 543L923 536ZM894 526L890 527L892 510ZM1044 176L1052 187L1042 177ZM1064 253L1085 246L1085 257ZM944 301L943 284L956 285ZM1064 253L1080 237L1085 246ZM1080 237L1075 229L1080 220ZM1008 269L1003 269L999 261ZM1008 222L994 233L1008 219ZM941 259L947 250L948 258ZM938 271L942 273L943 284ZM941 259L938 271L934 259Z'/><path fill='#241e12' stroke='#241e12' stroke-width='.6' d='M570 412L549 420L567 400ZM609 430L584 464L570 412ZM517 488L560 512L508 511ZM667 927L692 889L700 925ZM824 589L803 585L810 567ZM248 730L259 707L270 716ZM463 412L456 413L467 393ZM217 671L212 667L238 652ZM471 397L463 412L467 393ZM478 409L471 397L500 400ZM320 877L337 840L364 882ZM627 473L633 496L599 485Z'/><path fill='#3c2a18' stroke='#3c2a18' stroke-width='.6' d='M518 452L549 420L566 477ZM90 391L84 371L100 368ZM120 732L88 750L121 717ZM782 691L753 681L789 666ZM471 602L440 592L455 586ZM467 908L480 934L450 935ZM245 748L200 725L230 717ZM519 754L532 776L520 794ZM590 736L532 776L544 718ZM309 491L368 488L314 516ZM402 640L427 613L452 629ZM913 699L879 659L912 636ZM195 779L183 741L200 725ZM57 556L74 522L67 558ZM14 665L0 693L0 665ZM1089 853L1099 840L1120 847ZM594 724L590 736L559 712ZM653 560L668 566L625 585ZM600 569L604 584L586 584ZM428 571L403 578L378 546ZM897 562L890 542L906 552ZM814 605L840 599L855 626ZM967 881L961 850L972 852ZM163 801L192 780L197 789ZM192 678L212 667L218 684ZM212 667L217 671L218 684ZM24 681L15 659L64 643ZM555 576L577 564L564 582ZM653 560L615 522L661 549ZM549 703L541 683L573 688ZM448 841L460 850L444 851ZM791 787L831 772L808 801ZM1078 756L1081 765L1076 762ZM831 583L810 567L837 573ZM964 766L954 725L971 766ZM307 613L282 623L284 559ZM320 877L316 888L297 893ZM863 486L857 500L855 496ZM850 894L866 908L845 903ZM308 465L287 456L303 427ZM335 692L359 726L326 704ZM754 598L763 580L793 594ZM828 502L833 511L814 518ZM857 500L850 497L855 496ZM883 538L881 540L877 536ZM1132 414L1113 428L1106 420ZM1052 243L1059 234L1064 253Z'/><path fill='#605a4e' stroke='#605a4e' stroke-width='.6' d='M618 403L600 400L633 398Z'/><path fill='#24180c' stroke='#24180c' stroke-width='.6' d='M584 464L549 420L570 412ZM753 681L782 691L732 715ZM233 357L243 360L252 393ZM15 533L14 566L0 553ZM850 775L831 772L862 758ZM584 464L599 485L566 477ZM503 688L487 667L511 678ZM519 924L529 897L540 932ZM1117 743L1078 756L1099 730ZM868 886L854 862L919 840ZM464 446L484 432L486 469ZM542 815L528 807L532 776ZM335 692L349 681L377 699ZM780 795L730 769L771 764ZM961 850L941 854L922 832ZM238 652L212 667L178 636ZM617 776L615 741L634 760ZM564 582L577 564L586 584ZM615 522L653 560L599 549ZM377 646L367 613L402 640ZM512 856L518 902L481 895ZM456 884L433 864L457 881ZM433 864L456 884L451 894ZM722 419L753 451L727 468ZM187 665L212 667L192 678ZM882 901L868 886L891 894ZM646 721L633 742L619 722ZM615 741L633 742L634 760ZM259 646L282 623L277 650ZM986 819L961 850L951 804ZM633 496L615 522L599 485ZM633 496L638 505L615 522ZM638 505L633 496L681 462ZM639 692L654 689L638 707Z'/><path fill='#664830' stroke='#664830' stroke-width='.6' d='M674 605L624 649L605 616ZM43 719L66 691L88 750ZM857 660L879 659L870 676ZM1207 349L1225 330L1239 332ZM307 510L304 526L292 509ZM235 798L195 779L245 748ZM949 674L971 676L952 703ZM24 681L64 643L66 691ZM828 826L799 819L808 801ZM1103 288L1088 271L1096 267ZM877 548L897 562L875 570ZM1005 768L1025 772L1025 793ZM968 789L968 795L951 804ZM843 854L850 894L828 848ZM753 574L754 598L733 601ZM726 511L720 504L741 501ZM863 486L860 486L864 477ZM940 578L936 589L936 575ZM1025 772L1033 777L1025 793ZM885 393L879 402L878 398Z'/><path fill='#423624' stroke='#423624' stroke-width='.6' d='M510 728L544 718L520 745ZM451 894L467 908L450 935ZM119 914L137 889L167 942ZM216 601L238 652L178 636ZM84 402L65 437L20 413ZM84 402L33 379L67 374ZM0 400L5 387L20 413ZM303 427L268 438L299 411ZM481 895L518 902L512 918ZM460 850L481 895L457 881ZM873 901L850 894L868 886ZM1163 302L1176 309L1172 312ZM167 359L140 384L133 364ZM167 429L192 436L177 462ZM1056 279L1043 278L1044 272ZM850 497L833 511L831 498ZM1021 192L1001 184L1012 165ZM1032 284L1031 282L1041 276ZM1012 197L1020 212L1008 219ZM1057 221L1052 232L1054 217Z'/><path fill='#181206' stroke='#181206' stroke-width='.6' d='M503 688L510 728L484 728ZM617 470L584 464L613 440ZM617 470L599 485L584 464ZM560 512L593 511L560 553ZM593 511L575 504L599 485ZM684 864L648 850L700 848Z'/><path fill='#2a1e0c' stroke='#2a1e0c' stroke-width='.6' d='M517 488L518 452L566 477ZM879 659L855 626L865 616ZM572 652L573 616L605 616ZM800 925L776 897L803 907ZM67 558L74 522L134 564ZM440 505L469 476L477 527ZM468 575L449 556L456 551ZM448 579L449 556L468 575ZM599 549L653 560L612 575ZM195 779L192 780L174 770ZM599 549L577 564L560 553ZM882 901L873 901L868 886ZM617 470L627 473L599 485ZM394 733L359 726L377 699ZM368 738L359 726L394 733ZM329 740L359 726L368 738ZM654 689L639 692L638 681ZM1044 272L1043 278L1041 276Z'/><path fill='#8a6648' stroke='#8a6648' stroke-width='.6' d='M535 590L532 608L491 573ZM665 653L722 647L705 671ZM1203 354L1188 360L1187 338ZM1078 615L1110 629L1093 632ZM411 722L418 723L418 733ZM597 893L646 875L641 907ZM836 419L862 425L842 428ZM684 864L692 889L664 886ZM872 443L864 423L883 411ZM872 443L857 447L862 425ZM950 430L966 443L952 437ZM732 612L752 622L722 647ZM1010 430L1007 419L1024 431ZM969 417L966 443L950 430ZM397 814L391 811L391 808ZM1144 407L1143 403L1150 391Z'/><path fill='#90724e' stroke='#90724e' stroke-width='.6' d='M532 608L487 618L491 573ZM190 907L248 902L221 930ZM1110 629L1135 660L1120 672ZM1088 719L1124 683L1130 700ZM1207 364L1204 385L1203 364ZM928 889L936 888L933 903ZM403 807L391 808L403 784ZM342 928L345 918L360 938ZM1188 360L1177 353L1187 338ZM1189 251L1170 232L1200 229ZM636 845L648 850L636 852ZM1076 568L1082 576L1036 577ZM1096 447L1077 430L1082 424ZM1017 404L1039 419L1024 431ZM920 211L923 216L896 255ZM1158 439L1150 443L1150 434ZM918 471L921 471L926 491Z'/><path fill='#6c4e30' stroke='#6c4e30' stroke-width='.6' d='M487 618L532 608L521 640ZM730 810L757 850L733 845ZM1204 385L1185 381L1203 364ZM47 460L50 458L70 463ZM238 652L216 601L245 596ZM552 663L541 683L533 671ZM195 779L235 798L197 789ZM590 836L610 828L636 852ZM971 705L986 720L983 726ZM284 559L282 623L245 596ZM838 458L836 444L857 447ZM655 729L703 722L730 769ZM655 729L730 769L699 814ZM327 929L324 928L345 918ZM790 790L789 811L780 795ZM864 423L879 402L883 411ZM1172 402L1158 417L1150 391ZM1080 145L1091 154L1089 163Z'/><path fill='#9c7e5a' stroke='#9c7e5a' stroke-width='.6' d='M450 935L420 936L417 931ZM430 728L464 692L484 728ZM1228 824L1230 828L1203 839ZM967 888L967 881L1000 890ZM929 404L940 413L930 423ZM1026 464L1012 464L1009 457ZM950 469L942 470L952 465ZM920 211L896 255L870 225ZM929 404L954 392L940 413ZM797 351L814 343L822 363ZM862 363L861 368L859 360ZM862 363L875 366L861 368Z'/><path fill='#2a180c' stroke='#2a180c' stroke-width='.6' d='M451 894L450 935L417 931ZM517 488L495 475L518 452ZM681 462L680 444L727 468ZM469 476L464 446L486 469ZM625 585L668 566L674 605ZM593 511L599 549L560 553ZM754 874L732 862L757 863ZM571 928L570 931L540 932ZM928 889L892 898L891 894ZM544 718L549 703L559 712ZM329 740L368 738L333 767ZM1021 812L980 794L1025 793ZM1013 274L1008 269L1013 269Z'/><path fill='#3c2a12' stroke='#3c2a12' stroke-width='.6' d='M633 928L600 930L630 920ZM1088 719L1078 756L1078 709ZM97 891L116 896L119 914ZM936 880L954 883L936 887Z'/><path fill='#907e66' stroke='#907e66' stroke-width='.6' d='M1150 50L1195 25L1200 42ZM1208 200L1204 204L1198 204ZM1131 124L1096 117L1101 104ZM800 140L830 158L802 146ZM1080 237L1080 220L1106 232ZM984 478L990 470L1005 473ZM967 251L963 266L948 258ZM962 267L963 266L975 268ZM966 247L976 238L967 251Z'/><path fill='#bab4a8' stroke='#bab4a8' stroke-width='.6' d='M1185 71L1197 92L1194 99ZM1182 117L1128 77L1185 71ZM1062 530L1082 512L1096 518ZM1148 526L1130 530L1148 497ZM778 191L747 185L769 146ZM761 202L747 185L778 191ZM754 234L761 202L787 223ZM944 370L934 368L930 364Z'/><path fill='#b4a89c' stroke='#b4a89c' stroke-width='.6' d='M1197 92L1185 71L1199 75ZM769 146L743 141L772 128ZM1182 117L1131 124L1128 77ZM1115 482L1108 476L1125 467ZM1092 477L1086 478L1083 467ZM1163 302L1143 315L1158 292ZM1032 562L1048 544L1057 550ZM938 374L934 368L944 370ZM938 374L944 370L942 374Z'/><path fill='#968a78' stroke='#968a78' stroke-width='.6' d='M1204 77L1197 92L1199 75ZM932 186L930 181L943 176Z'/><path fill='#968466' stroke='#968466' stroke-width='.6' d='M1150 50L1128 77L1125 75ZM1170 232L1161 211L1198 204ZM1015 562L1012 583L1000 556ZM1165 232L1157 215L1161 211ZM994 261L993 256L997 257Z'/><path fill='#aea290' stroke='#aea290' stroke-width='.6' d='M1185 71L1128 77L1150 50ZM786 135L774 138L772 128ZM800 140L797 155L786 135ZM1197 188L1210 170L1215 200ZM1154 519L1167 498L1170 510ZM1117 140L1143 131L1118 161ZM747 185L739 166L769 146ZM1092 488L1086 478L1092 477ZM763 242L754 234L787 223ZM1196 175L1183 153L1203 172Z'/><path fill='#967e66' stroke='#967e66' stroke-width='.6' d='M1128 77L1100 100L1125 75ZM176 627L150 639L152 614ZM18 788L73 793L63 807ZM175 704L192 678L189 711ZM1150 217L1157 215L1155 234ZM1165 232L1161 236L1155 234ZM977 568L964 571L969 566ZM1003 269L994 261L999 261ZM909 350L920 359L905 365ZM982 255L986 255L979 268ZM976 238L982 255L967 251Z'/><path fill='#2a1806' stroke='#2a1806' stroke-width='.6' d='M900 614L924 613L912 636Z'/><path fill='#9c8a72' stroke='#9c8a72' stroke-width='.6' d='M1207 97L1204 77L1205 60ZM1134 204L1133 179L1145 199ZM1106 232L1106 235L1102 241ZM943 284L950 282L956 285ZM976 270L972 294L956 285ZM962 267L976 270L959 272Z'/><path fill='#968472' stroke='#968472' stroke-width='.6' d='M1207 97L1197 92L1204 77ZM937 305L944 319L932 333Z'/><path fill='#846654' stroke='#846654' stroke-width='.6' d='M1225 330L1240 330L1239 332ZM810 522L800 524L801 520ZM931 547L939 554L932 555Z'/><path fill='#7e6048' stroke='#7e6048' stroke-width='.6' d='M1240 330L1225 330L1232 308ZM552 663L533 671L521 640ZM59 453L65 437L70 463ZM290 474L309 491L291 504ZM444 851L433 864L435 835ZM1087 790L1081 765L1121 797ZM121 777L101 805L93 796ZM1129 249L1135 234L1144 245ZM1135 234L1129 249L1131 231ZM841 558L841 553L843 557ZM1135 234L1150 233L1144 245ZM839 469L847 468L839 476ZM860 486L854 482L864 477ZM1161 236L1164 252L1144 245ZM135 451L142 441L155 479ZM1135 234L1131 227L1140 222ZM1131 227L1135 234L1131 231ZM1039 419L1017 404L1029 402ZM1033 777L1039 779L1025 793ZM932 186L920 211L907 189ZM929 263L930 272L921 264ZM1000 451L991 468L987 452Z'/><path fill='#726048' stroke='#726048' stroke-width='.6' d='M1239 332L1240 330L1230 380ZM150 639L176 627L178 636ZM0 469L18 503L0 497ZM218 684L217 671L253 670ZM396 442L396 423L407 423ZM155 479L158 486L137 487ZM11 423L0 413L20 413ZM340 590L319 603L327 584ZM121 777L100 766L127 745ZM187 665L192 678L169 684ZM75 520L78 491L85 489ZM308 628L316 656L277 650ZM760 330L759 363L745 375ZM763 242L784 261L747 263ZM1135 370L1127 366L1127 364ZM1167 277L1184 303L1163 281ZM1160 275L1164 277L1163 281ZM772 351L759 363L760 330ZM959 225L965 246L953 247ZM948 258L947 250L953 247ZM912 349L920 359L909 350Z'/><path fill='#4e3c2a' stroke='#4e3c2a' stroke-width='.6' d='M103 390L90 391L100 368ZM189 869L159 817L197 789ZM70 463L74 490L58 494ZM192 521L201 542L151 555ZM149 865L145 851L189 869ZM14 566L19 593L0 581ZM0 525L15 533L0 553ZM74 522L127 518L134 564ZM228 931L233 940L221 930ZM1174 815L1190 805L1203 839ZM803 585L824 589L814 605ZM1117 743L1135 730L1132 751ZM3 464L0 469L0 441ZM209 580L216 601L200 592ZM397 452L368 488L373 446ZM402 610L403 578L409 587ZM456 884L481 895L467 908ZM971 676L949 674L958 655ZM84 402L67 374L90 391ZM514 690L549 703L544 718ZM779 514L800 524L797 534ZM986 819L1000 842L972 852ZM633 742L655 729L634 760ZM1056 279L1044 272L1046 269ZM1136 822L1159 807L1154 840ZM760 419L780 416L763 423ZM828 501L828 502L807 489ZM1068 209L1055 194L1069 196ZM1064 262L1059 271L1046 269ZM991 205L970 206L995 197ZM1012 197L1003 188L1021 192ZM1008 269L1013 274L1004 280ZM1009 287L1008 282L1017 279ZM976 238L994 235L988 243Z'/><path fill='#3c301e' stroke='#3c301e' stroke-width='.6' d='M85 489L70 463L98 470ZM67 558L93 587L64 614ZM407 423L456 413L462 434ZM448 780L519 754L520 794ZM151 555L201 542L199 558ZM532 776L519 754L520 745ZM542 815L532 776L586 793ZM570 909L529 897L554 871ZM137 889L116 896L133 887ZM270 716L259 707L281 695ZM214 577L209 580L199 558ZM300 360L260 400L267 358ZM1031 870L1045 847L1047 863ZM1045 847L1050 864L1047 863ZM327 584L319 603L300 558ZM794 550L803 544L810 567ZM961 850L954 883L941 854ZM361 796L337 840L318 808ZM368 738L394 733L392 762ZM1053 831L1030 811L1036 797ZM1105 395L1083 392L1084 366ZM1069 431L1077 430L1069 433ZM766 369L780 416L760 419ZM1014 245L1029 229L1021 251ZM1043 278L1032 284L1041 276ZM1031 282L1030 280L1041 276Z'/><path fill='#7e664e' stroke='#7e664e' stroke-width='.6' d='M127 518L137 487L163 507ZM171 736L183 741L174 770ZM199 717L218 684L230 717ZM1064 356L1089 355L1084 366ZM155 479L177 462L158 486ZM177 462L178 493L158 486ZM75 520L85 489L127 518ZM290 474L308 465L309 491ZM155 479L142 441L177 462ZM1125 224L1117 230L1113 225ZM787 277L777 295L767 283ZM1106 235L1106 232L1111 233ZM894 526L914 517L910 529ZM991 468L987 469L987 452Z'/><path fill='#604e3c' stroke='#604e3c' stroke-width='.6' d='M137 487L85 489L98 470ZM125 654L150 639L146 678ZM18 503L0 469L35 468ZM238 652L259 646L253 670ZM396 442L397 452L373 446ZM0 413L0 400L20 413ZM355 398L350 413L315 403ZM872 602L882 598L900 614ZM870 540L856 530L876 527ZM856 530L854 527L856 529ZM188 471L230 451L207 511ZM767 283L753 297L747 263ZM740 230L754 234L747 263ZM918 536L922 543L913 541ZM998 388L999 385L1016 398ZM1047 251L1064 262L1046 269ZM991 205L999 202L1008 219ZM991 205L995 197L999 202ZM976 226L976 238L974 234Z'/><path fill='#725a42' stroke='#725a42' stroke-width='.6' d='M85 489L137 487L127 518ZM137 487L158 486L163 507ZM292 509L261 527L259 504ZM24 681L23 689L18 693ZM367 613L367 640L357 638ZM448 841L444 851L435 835ZM798 533L800 524L811 533ZM1086 258L1090 264L1088 271ZM1122 267L1122 252L1129 249ZM886 496L888 508L874 502ZM135 451L155 479L137 487ZM781 310L760 330L770 304ZM130 401L149 426L142 441ZM907 189L920 211L902 196ZM1029 299L1024 313L1020 300ZM935 237L933 248L926 239Z'/><path fill='#362a18' stroke='#362a18' stroke-width='.6' d='M67 374L84 371L90 391ZM178 636L176 627L180 617ZM433 387L407 423L400 380ZM406 450L407 423L462 434ZM456 551L440 505L477 527ZM531 408L549 420L518 452ZM746 510L741 501L777 473ZM573 616L593 598L605 616ZM233 357L205 410L200 355ZM116 896L137 889L119 914ZM19 593L57 556L22 598ZM464 446L421 485L406 450ZM573 688L541 683L565 673ZM1007 642L971 676L958 655ZM725 925L754 874L733 925ZM972 852L1000 842L1000 890ZM615 522L638 505L661 549ZM378 776L368 738L392 762ZM359 726L329 740L326 704ZM1082 424L1077 430L1071 423ZM1046 419L1041 413L1071 415ZM391 811L365 839L361 796ZM1077 430L1069 431L1071 423ZM1044 272L1028 265L1046 269ZM766 369L760 419L745 375ZM1003 188L1012 197L999 202Z'/><path fill='#96846c' stroke='#96846c' stroke-width='.6' d='M148 555L145 578L134 564ZM1065 553L1036 577L1057 550ZM1190 482L1183 463L1200 470ZM1053 297L1042 313L1032 301ZM1042 313L1053 297L1061 312ZM980 477L987 469L984 478ZM963 266L962 267L948 258ZM976 238L966 247L965 246Z'/><path fill='#a29072' stroke='#a29072' stroke-width='.6' d='M148 555L151 555L145 578ZM1131 124L1101 104L1128 77ZM1107 340L1089 355L1104 331ZM1157 215L1159 201L1161 211ZM1183 463L1189 451L1202 462ZM793 300L799 288L812 304ZM937 305L919 331L932 299Z'/><path fill='#846c4e' stroke='#846c4e' stroke-width='.6' d='M127 518L148 555L134 564ZM370 504L368 488L377 494ZM359 578L340 590L327 584ZM23 689L24 681L44 704ZM1081 765L1063 786L1076 762ZM839 469L838 458L847 468ZM1200 229L1206 251L1195 249ZM944 301L937 305L932 299ZM875 366L882 366L882 387ZM898 366L882 361L890 354Z'/><path fill='#7e6648' stroke='#7e6648' stroke-width='.6' d='M151 555L148 555L127 518ZM12 724L18 693L43 719ZM65 437L50 458L35 459ZM50 458L65 437L59 453ZM1026 389L1052 381L1029 402ZM101 805L130 803L97 833ZM1012 583L1002 587L1000 556ZM1012 583L1024 577L1022 596ZM1051 757L1047 759L1008 723ZM833 448L833 453L830 445ZM1200 259L1227 263L1209 281ZM1041 413L1039 419L1029 402ZM932 294L934 292L932 299ZM932 186L938 208L920 211ZM938 208L959 225L945 228ZM926 276L887 265L921 264ZM938 271L929 263L934 259ZM929 263L938 271L930 272Z'/><path fill='#ae8a66' stroke='#ae8a66' stroke-width='.6' d='M105 873L97 891L53 867ZM1207 364L1207 349L1230 380ZM836 419L817 424L832 417ZM822 363L863 400L832 417ZM925 472L940 481L926 491ZM899 404L929 404L898 412Z'/><path fill='#a28a66' stroke='#a28a66' stroke-width='.6' d='M55 846L63 807L93 831ZM796 329L794 313L805 334Z'/><path fill='#b49672' stroke='#b49672' stroke-width='.6' d='M55 846L105 873L53 867ZM28 838L42 859L10 871ZM906 427L930 423L907 437ZM931 438L937 445L922 445ZM941 453L937 445L952 437ZM921 393L899 404L900 387ZM1158 439L1178 441L1176 452ZM793 339L800 335L793 345Z'/><path fill='#a88466' stroke='#a88466' stroke-width='.6' d='M0 833L0 805L2 812ZM294 744L283 800L261 778ZM937 445L950 430L952 437ZM951 531L940 534L941 529ZM885 393L894 393L899 404Z'/><path fill='#ae9072' stroke='#ae9072' stroke-width='.6' d='M0 889L0 861L10 871ZM28 838L18 788L63 807ZM1133 569L1112 555L1130 562ZM1100 557L1112 555L1128 585ZM283 800L333 767L318 808ZM1178 332L1185 319L1187 338ZM938 420L931 438L930 423ZM1189 451L1188 424L1203 420ZM951 531L941 529L949 526ZM929 404L937 383L943 385ZM924 372L921 393L900 387ZM882 387L896 370L900 387ZM875 366L882 361L882 366Z'/><path fill='#a27e5a' stroke='#a27e5a' stroke-width='.6' d='M0 889L10 917L0 917ZM430 728L424 718L428 696ZM403 807L403 784L440 791ZM315 928L330 939L300 940ZM1174 356L1177 353L1178 365ZM954 883L967 888L967 897ZM391 852L397 814L435 835ZM980 401L1005 409L1007 419Z'/><path fill='#a88a66' stroke='#a88a66' stroke-width='.6' d='M0 889L10 871L10 917ZM464 692L430 728L428 696ZM55 846L97 833L105 873ZM1129 586L1128 585L1133 569ZM1135 660L1110 629L1140 620ZM1156 372L1174 356L1178 365ZM247 832L283 800L303 823ZM283 800L294 744L333 767ZM895 414L895 416L883 411ZM956 547L951 541L975 534ZM822 363L814 343L831 351ZM1178 441L1183 453L1176 452ZM970 394L969 417L953 410Z'/><path fill='#604836' stroke='#604836' stroke-width='.6' d='M24 740L43 719L88 750ZM1158 843L1174 815L1177 849ZM953 621L942 650L924 613ZM103 390L84 402L90 391ZM1251 801L1268 800L1230 828ZM902 565L897 562L901 561ZM824 478L839 469L839 476ZM820 485L823 489L807 489ZM130 401L98 426L103 390ZM1020 212L1021 192L1036 202ZM1005 409L998 388L1016 398ZM1033 217L1029 229L1020 212ZM1041 205L1038 207L1036 202Z'/><path fill='#5a4830' stroke='#5a4830' stroke-width='.6' d='M81 785L24 740L88 750ZM0 693L18 693L0 721ZM501 444L531 408L518 452ZM241 359L243 360L233 357ZM74 490L65 507L58 494ZM833 920L845 903L867 915ZM65 437L84 402L98 426ZM14 665L24 681L0 693ZM833 453L838 458L817 456ZM1159 807L1164 777L1190 805ZM1113 428L1117 435L1112 433ZM947 250L950 246L953 247ZM1075 229L1061 230L1069 223Z'/><path fill='#785a36' stroke='#785a36' stroke-width='.6' d='M211 932L190 907L221 930ZM1225 393L1204 385L1230 380ZM1026 464L1021 472L1021 467ZM913 450L912 449L922 445Z'/><path fill='#78604e' stroke='#78604e' stroke-width='.6' d='M143 689L165 710L140 706ZM897 562L902 565L885 590ZM883 540L884 540L877 548ZM922 543L918 536L923 536ZM894 526L896 539L890 527ZM935 237L947 250L933 248ZM979 268L976 270L975 268Z'/><path fill='#604e36' stroke='#604e36' stroke-width='.6' d='M180 617L176 627L152 614ZM145 851L149 865L105 873ZM218 684L259 707L230 717ZM421 485L397 452L406 450ZM0 693L24 681L18 693ZM350 413L330 442L315 403ZM265 470L290 474L259 504ZM308 465L303 427L330 442ZM1082 196L1105 201L1079 217ZM754 234L763 242L747 263ZM970 206L953 198L976 176ZM990 470L991 468L1004 471Z'/><path fill='#5a4836' stroke='#5a4836' stroke-width='.6' d='M0 609L0 600L22 598ZM3 464L4 447L35 459ZM800 524L779 514L801 520ZM1014 367L1006 379L992 375ZM891 540L896 539L890 542ZM142 441L135 451L98 426ZM1020 212L1008 222L1008 219ZM1021 269L1028 265L1030 280ZM1146 799L1136 822L1143 795ZM995 197L970 206L976 176ZM976 226L959 225L970 206ZM1069 223L1057 221L1068 209ZM947 182L953 198L932 186Z'/><path fill='#362a1e' stroke='#362a1e' stroke-width='.6' d='M93 587L67 558L134 564ZM456 413L407 423L433 387ZM514 690L503 688L511 678ZM924 613L942 650L912 636ZM64 643L100 629L97 671ZM377 699L377 646L428 666ZM803 585L792 572L810 567ZM570 909L571 928L540 932ZM5 387L0 400L0 385ZM478 409L484 432L468 418ZM776 556L789 549L792 572ZM216 433L192 436L205 410ZM287 456L290 474L282 456ZM760 419L722 419L745 375ZM1105 395L1090 403L1083 392Z'/><path fill='#785a3c' stroke='#785a3c' stroke-width='.6' d='M66 691L97 671L121 717ZM722 647L665 653L695 615ZM638 681L624 649L645 669ZM421 485L400 506L377 494ZM1124 683L1085 679L1120 672ZM856 806L828 826L808 801ZM394 733L411 722L418 733ZM814 745L791 787L771 764ZM1097 140L1097 143L1092 142ZM971 705L971 676L978 680ZM216 601L236 578L245 596ZM294 744L261 778L261 752ZM327 929L345 918L342 928ZM1082 196L1089 163L1111 197ZM923 521L940 529L923 536ZM918 523L923 521L923 536ZM1143 403L1135 380L1150 391ZM1134 378L1139 369L1135 380ZM149 426L130 401L140 384ZM1012 464L1008 470L1009 457ZM923 216L938 208L945 228ZM940 534L928 543L923 536ZM882 366L896 370L882 387ZM966 443L971 454L957 449Z'/><path fill='#b49060' stroke='#b49060' stroke-width='.6' d='M1120 866L1120 847L1150 860ZM940 481L925 472L942 470Z'/><path fill='#5a422a' stroke='#5a422a' stroke-width='.6' d='M730 769L741 744L771 764ZM624 649L665 653L645 669ZM908 814L951 804L922 832ZM799 718L782 691L794 699ZM850 775L891 781L856 806ZM402 640L402 610L427 613ZM633 913L641 907L633 928ZM1122 728L1117 743L1099 730ZM573 688L625 691L578 699ZM897 562L877 548L890 542ZM980 794L968 789L971 766ZM845 903L866 908L867 915ZM879 513L888 508L892 510ZM888 508L879 513L874 502ZM884 525L881 527L879 513ZM1010 844L1030 811L1045 847ZM1130 834L1099 840L1121 797ZM833 511L835 534L814 518ZM1135 370L1129 377L1127 366ZM1177 421L1163 430L1158 417ZM928 280L943 284L934 288ZM833 448L838 458L833 453Z'/><path fill='#543c2a' stroke='#543c2a' stroke-width='.6' d='M806 701L810 688L838 698ZM70 463L93 458L98 470ZM19 593L0 600L0 581ZM625 585L674 605L605 616ZM607 592L625 585L605 616ZM604 584L593 598L586 584ZM906 598L885 590L904 590ZM1117 743L1122 728L1135 730ZM15 659L14 665L0 665ZM1192 775L1170 768L1200 775ZM856 529L865 506L876 527ZM551 843L512 856L542 815ZM794 462L775 465L795 447ZM803 544L794 550L797 534ZM840 599L831 583L854 589ZM903 805L908 814L902 811ZM93 796L101 805L93 824ZM1107 340L1121 340L1115 362ZM1053 831L1089 853L1053 840ZM1105 443L1115 448L1101 448ZM812 481L820 485L807 489ZM1016 398L1006 379L1019 385ZM879 513L881 527L876 527ZM924 559L936 575L911 566ZM945 579L940 578L943 578ZM823 489L828 501L807 489ZM936 575L933 558L941 571Z'/><path fill='#3c3018' stroke='#3c3018' stroke-width='.6' d='M810 688L806 701L794 699ZM590 736L544 718L559 712ZM638 707L654 689L646 721Z'/><path fill='#845a36' stroke='#845a36' stroke-width='.6' d='M803 733L814 745L771 764ZM936 589L932 591L927 590Z'/><path fill='#725436' stroke='#725436' stroke-width='.6' d='M831 772L814 745L862 758ZM532 608L573 616L521 640ZM814 605L855 626L806 611ZM911 566L916 594L904 590ZM1007 642L1052 619L1033 681ZM732 862L692 889L692 860ZM839 537L846 540L844 541ZM903 703L843 720L870 676ZM937 785L942 785L951 804ZM47 460L37 462L35 459ZM617 776L587 793L590 736ZM391 808L377 792L403 784ZM448 841L435 835L440 791ZM1218 405L1203 420L1201 395ZM943 755L964 766L934 777ZM964 766L942 785L934 777ZM733 601L754 598L732 612ZM847 468L854 482L839 476ZM1179 408L1172 402L1185 381ZM789 811L799 819L786 859ZM1143 403L1133 408L1135 380ZM1181 409L1179 408L1201 395ZM1099 160L1091 154L1097 143Z'/><path fill='#2a2418' stroke='#2a2418' stroke-width='.6' d='M456 413L433 387L467 393ZM613 440L609 430L633 398ZM519 924L540 932L510 933ZM355 398L367 373L400 380ZM143 684L115 678L146 678ZM891 894L868 886L919 840ZM355 398L344 371L367 373ZM1048 426L1071 415L1071 423ZM1167 319L1164 317L1168 318Z'/><path fill='#54483c' stroke='#54483c' stroke-width='.6' d='M691 406L690 427L667 397ZM1108 481L1092 488L1099 476ZM183 413L186 398L205 410ZM923 365L924 361L930 364ZM930 374L934 368L934 374ZM920 359L924 342L924 361Z'/><path fill='#484236' stroke='#484236' stroke-width='.6' d='M609 430L618 403L633 398ZM1001 184L995 197L976 176Z'/><path fill='#181200' stroke='#181200' stroke-width='.6' d='M584 464L609 430L613 440Z'/><path fill='#423024' stroke='#423024' stroke-width='.6' d='M560 512L517 488L566 477ZM85 489L74 490L70 463ZM57 556L64 614L22 598ZM484 432L501 444L486 469ZM512 918L518 902L519 924ZM529 897L512 856L554 871ZM913 541L896 539L912 535ZM1036 797L1030 811L1025 793ZM1021 192L1042 177L1036 202ZM1160 275L1150 287L1140 275ZM1029 229L1042 240L1021 251ZM1042 240L1029 229L1041 232Z'/><path fill='#48361e' stroke='#48361e' stroke-width='.6' d='M695 615L665 653L674 605ZM625 585L607 592L612 575ZM446 760L483 733L447 766ZM449 556L440 505L456 551ZM633 913L633 928L630 920ZM245 748L248 730L261 752ZM936 888L928 889L936 887ZM307 613L284 559L300 558ZM512 856L460 850L464 839ZM777 473L789 469L786 474ZM828 502L814 518L807 489ZM1123 434L1113 428L1127 432ZM1113 428L1123 434L1117 435ZM972 294L988 287L987 301ZM994 235L976 238L994 233Z'/><path fill='#54361e' stroke='#54361e' stroke-width='.6' d='M753 681L763 653L789 666ZM732 862L700 848L733 845ZM706 530L743 541L704 547ZM720 504L706 530L698 505ZM865 574L867 570L875 570ZM1105 443L1112 433L1112 438ZM863 400L882 387L878 398ZM1015 403L1005 409L1016 398Z'/><path fill='#5a3c2a' stroke='#5a3c2a' stroke-width='.6' d='M753 681L732 715L730 686ZM806 611L857 660L789 666ZM763 873L754 874L757 863ZM615 741L595 731L619 722ZM940 578L945 579L946 583Z'/><path fill='#906c4e' stroke='#906c4e' stroke-width='.6' d='M446 760L447 766L432 751ZM403 784L443 783L440 791ZM555 576L535 590L560 553ZM471 602L487 618L452 629ZM418 733L430 728L432 751ZM1099 730L1088 719L1130 700ZM1205 309L1207 349L1187 338ZM887 815L908 814L919 840ZM960 617L995 623L958 655ZM405 869L406 904L364 882ZM646 875L597 893L636 852ZM1203 420L1219 417L1225 420ZM648 850L636 845L629 830ZM337 840L303 823L318 808ZM908 751L943 755L934 777ZM1007 419L1010 430L991 440ZM955 567L939 554L948 551ZM1188 424L1183 411L1203 420ZM940 529L940 534L923 536Z'/><path fill='#967254' stroke='#967254' stroke-width='.6' d='M430 728L446 760L432 751ZM424 718L418 723L411 713ZM315 928L325 929L330 939ZM799 819L828 848L786 859ZM879 906L881 906L867 915ZM842 428L836 444L830 445ZM1033 578L1036 577L1029 601Z'/><path fill='#846648' stroke='#846648' stroke-width='.6' d='M447 766L443 783L432 751ZM335 531L370 504L378 546ZM400 506L370 504L377 494ZM1135 660L1124 683L1120 672ZM814 518L835 534L811 533ZM597 893L595 916L591 901ZM800 595L814 605L806 611ZM24 681L66 691L44 704ZM892 898L928 889L900 910ZM865 559L843 557L863 555ZM283 800L255 787L261 778ZM391 852L405 869L364 882ZM274 727L294 744L261 752ZM1096 447L1082 424L1096 421ZM846 540L841 553L844 541ZM1206 251L1200 259L1195 249ZM1144 407L1132 414L1133 408ZM874 190L881 195L870 225ZM935 237L924 238L923 216Z'/><path fill='#72543c' stroke='#72543c' stroke-width='.6' d='M448 780L443 783L447 766ZM284 559L299 556L300 558ZM307 510L292 509L291 504ZM248 902L297 893L249 905ZM863 555L846 540L870 540ZM42 465L37 462L47 460ZM865 574L855 587L837 573ZM879 906L882 901L881 906ZM332 462L368 488L309 491ZM362 897L356 891L364 882ZM1251 801L1255 798L1268 800ZM868 552L863 555L870 540ZM1125 224L1113 225L1126 206ZM1150 233L1135 234L1140 222ZM1011 594L1002 587L1012 583ZM777 295L781 310L770 304ZM1125 224L1131 227L1131 231ZM1044 176L1061 156L1066 176ZM1069 196L1055 194L1066 176ZM1055 194L1052 187L1066 176ZM924 238L926 239L921 264ZM924 238L935 237L926 239Z'/><path fill='#846048' stroke='#846048' stroke-width='.6' d='M443 783L448 780L440 791ZM546 595L555 576L564 582ZM754 874L763 873L776 897ZM843 557L846 540L863 555ZM411 722L394 733L411 713ZM835 552L839 537L844 541ZM960 559L955 567L948 551ZM1089 163L1099 160L1111 197Z'/><path fill='#6c5436' stroke='#6c5436' stroke-width='.6' d='M377 699L428 696L411 713ZM428 696L377 699L428 666ZM483 733L430 728L484 728ZM50 458L59 453L70 463ZM594 724L625 691L619 722ZM1097 140L1092 142L1090 133ZM93 796L73 793L81 785ZM971 676L971 705L952 703ZM943 728L908 751L929 713ZM926 239L933 248L921 264Z'/><path fill='#847254' stroke='#847254' stroke-width='.6' d='M253 670L277 650L281 695ZM65 507L74 522L26 521ZM150 639L187 665L146 678ZM1036 577L1032 562L1057 550ZM986 255L982 255L988 243Z'/><path fill='#54422a' stroke='#54422a' stroke-width='.6' d='M495 475L501 444L518 452ZM299 556L304 554L300 558ZM137 889L133 887L149 865ZM97 671L115 678L121 717ZM629 830L617 776L634 760ZM997 739L1000 749L971 766ZM159 817L164 803L197 789ZM595 731L615 741L590 736ZM268 438L242 447L246 419ZM817 456L812 448L830 445ZM810 567L835 552L837 573ZM265 470L242 447L268 438ZM794 462L789 469L775 465ZM838 458L839 469L817 456ZM763 423L780 416L795 447ZM1029 229L1008 222L1020 212ZM1008 222L1029 229L1014 245ZM950 246L935 237L945 228ZM912 349L916 347L920 359Z'/><path fill='#544230' stroke='#544230' stroke-width='.6' d='M501 444L495 475L486 469ZM469 476L508 511L477 527ZM120 732L126 731L127 745ZM400 506L421 485L440 505ZM869 598L872 602L865 616ZM949 674L942 650L958 655ZM260 400L268 438L246 419ZM268 438L260 400L299 411ZM856 529L854 527L865 506ZM974 586L980 580L985 589ZM133 364L140 384L103 390ZM881 540L870 540L877 536ZM140 384L186 398L183 413ZM759 574L758 565L776 556ZM1068 209L1082 196L1079 217ZM1082 196L1068 209L1069 196ZM1041 232L1033 217L1054 217ZM991 205L976 226L970 206ZM1008 269L1015 256L1013 269ZM916 347L912 349L919 331Z'/><path fill='#1e180c' stroke='#1e180c' stroke-width='.6' d='M503 688L514 690L510 728ZM605 407L609 430L570 412ZM692 889L722 925L700 925ZM471 397L478 409L463 412ZM692 889L725 925L722 925ZM868 886L850 894L854 862ZM337 840L365 839L364 882ZM361 796L365 839L337 840ZM359 726L335 692L377 699ZM316 888L306 904L297 893ZM306 904L316 888L345 918Z'/><path fill='#301e12' stroke='#301e12' stroke-width='.6' d='M573 616L564 582L586 584ZM427 613L440 592L452 629ZM741 744L730 746L732 715ZM228 931L249 905L233 940ZM928 889L936 880L936 887ZM732 862L757 850L757 863ZM771 524L779 514L797 534ZM1050 864L1045 847L1053 840ZM704 547L668 566L661 549ZM433 864L444 851L457 881ZM627 473L617 470L613 440ZM1048 426L1069 433L1046 437ZM890 542L896 539L906 552ZM1130 834L1136 822L1154 840ZM1052 243L1051 240L1059 234Z'/><path fill='#5a4236' stroke='#5a4236' stroke-width='.6' d='M468 575L471 602L455 586ZM854 527L849 532L844 519Z'/><path fill='#422a1e' stroke='#422a1e' stroke-width='.6' d='M440 592L471 602L452 629ZM668 566L728 571L674 605ZM801 520L779 514L807 489ZM600 569L577 564L599 549ZM882 901L879 906L873 901ZM798 425L780 416L791 408Z'/><path fill='#5a3c24' stroke='#5a3c24' stroke-width='.6' d='M440 592L427 613L409 587ZM857 660L870 676L838 698ZM427 613L402 610L409 587ZM869 598L853 600L854 589ZM911 566L936 575L927 590ZM73 793L93 796L63 807ZM891 781L895 806L856 806ZM743 541L776 556L744 554ZM1025 772L1005 768L1000 749ZM789 469L794 462L812 481ZM865 559L868 552L875 570ZM865 559L867 570L865 574ZM980 580L1002 587L985 589ZM968 795L968 789L980 794ZM1198 297L1209 281L1205 309ZM726 511L706 530L720 504ZM854 482L839 480L839 476ZM1133 408L1129 377L1135 380ZM1129 377L1135 370L1133 376ZM1015 403L1017 404L1008 409ZM943 284L934 292L934 288Z'/><path fill='#6c482a' stroke='#6c482a' stroke-width='.6' d='M428 571L440 592L409 587ZM839 537L835 534L839 530ZM843 720L886 742L862 758Z'/><path fill='#a27e60' stroke='#a27e60' stroke-width='.6' d='M487 618L473 662L452 629ZM452 629L473 662L438 670ZM433 864L405 869L435 835ZM854 482L847 468L864 477ZM957 449L941 453L952 437ZM822 363L861 368L863 374ZM822 363L831 351L859 360ZM861 368L822 363L859 360ZM914 517L900 500L902 496ZM902 196L920 211L870 225ZM940 534L951 531L951 541Z'/><path fill='#a88460' stroke='#a88460' stroke-width='.6' d='M473 662L464 692L438 670ZM1110 629L1128 585L1129 586ZM248 902L247 832L297 856ZM1100 557L1128 585L1089 589ZM879 446L872 443L883 411ZM397 814L403 807L435 835ZM895 416L895 414L898 412ZM817 424L836 419L842 428ZM863 400L822 363L863 374ZM902 496L900 500L886 496ZM812 341L800 335L805 334ZM899 404L921 393L929 404Z'/><path fill='#967854' stroke='#967854' stroke-width='.6' d='M464 692L473 662L482 689ZM1089 853L1120 847L1120 866ZM390 937L394 924L417 931ZM1082 576L1100 557L1089 589ZM969 417L1007 419L991 440ZM948 412L955 415L950 430ZM1150 443L1145 437L1150 434ZM1039 419L1046 437L1024 431ZM836 419L863 400L864 423ZM1167 277L1189 251L1200 259Z'/><path fill='#1e0c06' stroke='#1e0c06' stroke-width='.6' d='M249 905L267 940L233 940Z'/><path fill='#ba9666' stroke='#ba9666' stroke-width='.6' d='M368 927L390 937L360 938ZM1158 843L1177 849L1150 860Z'/><path fill='#ae9060' stroke='#ae9060' stroke-width='.6' d='M420 936L390 937L417 931ZM1060 878L1089 853L1090 872ZM1030 884L1050 864L1060 878Z'/><path fill='#544224' stroke='#544224' stroke-width='.6' d='M776 897L786 859L803 907ZM1083 392L1052 381L1084 366ZM994 243L1003 243L997 257Z'/><path fill='#4e3624' stroke='#4e3624' stroke-width='.6' d='M814 518L801 520L807 489ZM0 600L19 593L22 598ZM668 566L704 547L728 571ZM282 623L259 646L245 596ZM753 451L763 423L795 447ZM849 532L839 530L844 519ZM986 819L968 795L980 794ZM968 795L986 819L951 804ZM655 729L633 742L646 721ZM1071 415L1041 413L1052 381ZM753 574L758 565L759 574Z'/><path fill='#664e36' stroke='#664e36' stroke-width='.6' d='M855 626L857 660L806 611ZM66 691L64 643L97 671ZM368 488L370 504L314 516ZM803 544L798 533L811 533ZM960 617L953 621L951 594ZM1121 797L1117 743L1132 751ZM184 515L186 504L192 521ZM137 889L149 865L151 886ZM10 734L12 724L24 740ZM848 777L850 775L856 806ZM397 452L421 485L377 494ZM1089 355L1115 362L1084 366ZM803 585L800 595L793 594ZM854 589L831 583L837 573ZM753 297L767 283L770 304ZM332 462L330 442L373 446ZM345 918L356 891L362 897ZM841 558L843 557L837 573ZM1122 252L1117 230L1129 249ZM767 283L777 295L770 304ZM365 839L397 814L391 852ZM1105 201L1082 196L1111 197ZM1091 154L1080 145L1092 142ZM918 536L918 523L923 536Z'/><path fill='#423018' stroke='#423018' stroke-width='.6' d='M879 659L903 636L912 636ZM757 913L776 897L767 925ZM741 558L743 541L744 554ZM903 805L937 785L908 814ZM1059 271L1065 264L1074 272ZM665 653L654 689L645 669ZM1146 799L1143 795L1164 777ZM1016 398L999 385L1006 379Z'/><path fill='#483c2a' stroke='#483c2a' stroke-width='.6' d='M903 636L900 614L912 636ZM456 413L468 418L462 434ZM531 408L501 444L500 400ZM260 400L246 419L252 393ZM260 400L300 360L299 411ZM481 895L456 884L457 881ZM205 410L182 376L200 355ZM11 423L20 413L35 459ZM216 433L242 447L230 451ZM857 500L865 506L844 519ZM242 447L265 470L230 451ZM975 593L974 586L985 589ZM186 398L182 376L205 410ZM833 511L828 502L831 498ZM759 363L766 369L745 375ZM980 379L982 373L992 375ZM979 387L980 379L992 375ZM1051 240L1052 232L1059 234ZM999 202L1012 197L1008 219ZM1068 209L1057 221L1054 217Z'/><path fill='#ae906c' stroke='#ae906c' stroke-width='.6' d='M1129 586L1145 590L1140 620ZM1129 586L1133 569L1145 590ZM0 833L28 838L0 861ZM1133 569L1147 565L1145 590ZM1150 560L1147 565L1130 562ZM10 871L42 859L53 867ZM906 427L929 404L930 423ZM938 420L948 412L950 430ZM1033 480L1021 472L1026 464ZM954 392L929 404L943 385ZM902 496L918 471L926 491ZM951 541L951 531L955 526ZM1158 439L1176 452L1153 456ZM796 378L797 351L822 363Z'/><path fill='#84786c' stroke='#84786c' stroke-width='.6' d='M1207 206L1208 200L1215 200ZM1209 212L1207 206L1215 200ZM1148 319L1168 326L1153 339ZM1140 275L1150 287L1137 296ZM1148 319L1164 317L1168 326Z'/><path fill='#78664e' stroke='#78664e' stroke-width='.6' d='M26 521L18 503L58 494ZM335 531L359 578L327 584ZM0 637L8 649L0 665ZM396 423L396 442L373 446ZM74 522L75 520L127 518ZM350 413L396 423L373 446ZM1038 207L1020 212L1036 202ZM926 371L930 374L924 372Z'/><path fill='#66543c' stroke='#66543c' stroke-width='.6' d='M18 503L35 468L58 494ZM396 442L407 423L406 450ZM33 379L5 387L0 385ZM100 766L81 785L88 750ZM98 426L84 402L103 390ZM760 330L753 297L770 304ZM784 261L767 283L747 263ZM1105 201L1080 220L1079 217ZM1032 284L1018 297L1017 279ZM1053 297L1043 278L1056 279ZM959 225L950 246L945 228ZM991 468L990 470L987 469Z'/><path fill='#907866' stroke='#907866' stroke-width='.6' d='M18 503L0 525L0 497ZM1204 204L1209 212L1198 204ZM1122 267L1123 269L1121 266ZM1122 252L1122 267L1121 266ZM1003 243L1014 245L1010 252ZM1016 268L1015 256L1021 269ZM982 255L976 262L974 258Z'/><path fill='#1e120c' stroke='#1e120c' stroke-width='.6' d='M100 629L64 643L64 614ZM892 898L882 901L891 894Z'/><path fill='#3c3024' stroke='#3c3024' stroke-width='.6' d='M53 621L64 643L32 632ZM680 444L613 440L633 398ZM483 733L510 728L520 745ZM512 918L519 924L510 933ZM792 572L803 585L793 594ZM533 400L531 408L500 400ZM531 408L533 400L549 420ZM456 884L467 908L451 894ZM216 433L205 410L246 419ZM303 427L299 411L315 403ZM512 856L528 807L542 815ZM1082 424L1090 403L1096 421ZM1090 403L1071 415L1083 392ZM230 451L188 471L195 446ZM1158 342L1146 340L1153 339ZM1090 403L1106 420L1096 421ZM167 429L183 413L192 436ZM98 426L135 451L93 458ZM1171 316L1165 314L1172 312ZM1165 314L1163 302L1172 312ZM993 358L993 355L1000 354ZM1003 188L1001 184L1021 192Z'/><path fill='#302412' stroke='#302412' stroke-width='.6' d='M201 542L192 521L207 511ZM487 667L521 640L511 678ZM482 689L487 667L503 688ZM529 897L570 909L540 932ZM1078 756L1088 719L1099 730ZM216 601L180 617L200 592ZM565 673L541 683L552 663ZM779 514L777 473L786 474ZM840 599L853 600L855 626ZM1008 723L1013 676L1033 681ZM570 909L562 866L591 901ZM403 578L367 613L359 578ZM460 850L448 841L464 839ZM631 475L627 473L613 440ZM638 505L698 505L661 549ZM316 888L356 891L345 918ZM1099 476L1083 467L1095 455ZM1065 695L1051 757L1008 723ZM306 904L315 928L300 940ZM306 904L324 928L315 928ZM1069 433L1047 451L1046 437ZM759 574L763 580L758 581ZM1028 265L1044 272L1041 276ZM1030 280L1028 265L1041 276ZM850 497L857 500L844 519Z'/><path fill='#b4a8a2' stroke='#b4a8a2' stroke-width='.6' d='M774 138L769 146L772 128ZM1123 304L1124 309L1115 320ZM1183 153L1193 124L1208 133Z'/><path fill='#b4aea8' stroke='#b4aea8' stroke-width='.6' d='M769 146L774 138L786 135ZM1143 131L1170 167L1161 177Z'/><path fill='#b49072' stroke='#b49072' stroke-width='.6' d='M28 838L0 833L2 812ZM0 861L28 838L10 871ZM1161 351L1177 353L1174 356Z'/><path fill='#ba9672' stroke='#ba9672' stroke-width='.6' d='M55 846L28 838L63 807Z'/><path fill='#907860' stroke='#907860' stroke-width='.6' d='M73 793L24 740L81 785ZM143 635L100 629L152 614ZM186 504L184 515L163 507ZM73 793L18 788L24 740ZM192 678L175 704L169 684ZM1197 188L1196 175L1203 172ZM319 603L343 629L308 628ZM1150 217L1140 213L1145 199ZM1150 233L1150 217L1155 234ZM964 571L977 568L980 580ZM1139 212L1134 210L1134 204ZM1008 470L1005 473L1004 471ZM1135 370L1139 369L1133 376ZM781 310L788 335L760 330ZM1053 297L1074 283L1061 312ZM874 190L851 193L855 187ZM979 268L1003 269L988 287ZM985 565L985 556L1000 556ZM1180 427L1178 441L1163 430ZM1003 243L1005 241L1014 245ZM1007 282L1008 281L1008 282ZM976 262L963 266L974 258ZM976 262L982 255L979 268Z'/><path fill='#7e6042' stroke='#7e6042' stroke-width='.6' d='M175 893L190 907L167 942ZM483 733L446 760L430 728ZM359 578L335 531L378 546ZM487 667L473 662L487 618ZM916 594L906 598L904 590ZM638 681L625 691L624 649ZM320 877L297 893L297 856ZM786 859L763 873L757 863ZM633 913L597 893L641 907ZM1087 790L1121 797L1079 807ZM1063 786L1087 790L1079 807ZM997 739L986 720L1008 723ZM304 526L261 527L292 509ZM839 537L835 552L835 534ZM908 751L903 703L929 713ZM1047 759L1025 772L1000 749ZM1047 759L1000 749L1008 723ZM937 445L941 453L928 464ZM936 589L946 583L945 593ZM900 500L914 517L892 510ZM1021 472L1008 470L1012 464ZM1198 297L1167 277L1209 281ZM807 436L807 422L814 436Z'/><path fill='#482a12' stroke='#482a12' stroke-width='.6' d='M198 935L211 932L200 940Z'/><path fill='#785436' stroke='#785436' stroke-width='.6' d='M198 935L190 907L211 932ZM370 504L400 506L378 546ZM1185 381L1188 360L1203 364ZM870 676L843 720L838 698ZM757 913L754 874L776 897ZM1085 679L1065 695L1084 678ZM922 592L911 566L927 590ZM1135 380L1156 372L1150 391ZM765 630L754 598L793 594ZM864 423L872 443L862 425ZM870 478L863 486L864 477ZM757 850L789 811L786 859ZM886 496L878 481L894 482ZM1183 411L1181 409L1201 395ZM1002 587L985 565L1000 556ZM985 565L1002 587L980 580Z'/><path fill='#42361e' stroke='#42361e' stroke-width='.6' d='M145 851L159 817L189 869ZM207 511L230 451L259 504ZM1051 757L1078 756L1076 762ZM1127 432L1113 428L1132 414ZM1001 184L1000 177L1012 165Z'/><path fill='#846c48' stroke='#846c48' stroke-width='.6' d='M159 817L145 851L143 838Z'/><path fill='#90785a' stroke='#90785a' stroke-width='.6' d='M145 851L97 833L143 838ZM189 711L192 678L218 684ZM1089 355L1107 340L1115 362ZM296 706L294 744L274 727ZM316 656L316 669L277 650ZM1091 556L1082 576L1082 560ZM1089 355L1088 325L1104 331ZM1140 213L1139 212L1145 199ZM1181 427L1188 424L1181 428ZM1139 212L1136 212L1134 210ZM921 517L917 521L914 517ZM887 265L926 276L891 301Z'/><path fill='#6c4e36' stroke='#6c4e36' stroke-width='.6' d='M97 833L145 851L105 873ZM304 526L304 554L299 556ZM473 662L487 667L482 689ZM757 850L786 859L757 863ZM1240 782L1190 805L1200 775ZM1130 700L1124 683L1135 660ZM137 889L151 886L167 942ZM1190 805L1192 775L1200 775ZM986 720L1013 676L1008 723ZM406 904L394 924L362 897ZM865 574L871 598L869 598ZM1172 402L1156 372L1185 381ZM1156 372L1172 402L1150 391ZM324 928L325 929L315 928ZM1082 196L1069 196L1066 176ZM140 384L130 401L103 390ZM365 839L391 811L397 814ZM1008 470L1004 471L1009 457ZM882 387L885 393L878 398ZM838 458L833 448L836 444Z'/><path fill='#9c8466' stroke='#9c8466' stroke-width='.6' d='M189 711L171 736L170 713ZM1064 356L1052 381L1040 370ZM299 695L316 669L326 704ZM121 777L127 745L174 770ZM1104 134L1096 117L1113 135ZM1033 578L1024 577L1027 576ZM1133 179L1134 204L1114 196ZM1189 451L1203 420L1202 462ZM981 444L969 417L991 440ZM867 308L891 301L872 315ZM1139 212L1134 204L1145 199ZM926 276L928 280L891 301ZM1011 297L1009 287L1018 297ZM898 366L898 354L904 365ZM993 256L986 255L988 243Z'/><path fill='#84664e' stroke='#84664e' stroke-width='.6' d='M183 741L189 711L200 725ZM810 522L814 518L811 533ZM37 462L42 465L35 468ZM877 548L868 552L870 540ZM1150 233L1155 234L1144 245ZM1134 204L1134 210L1126 206ZM1134 210L1125 224L1126 206ZM914 517L894 526L892 510Z'/><path fill='#301e0c' stroke='#301e0c' stroke-width='.6' d='M128 723L120 732L121 717ZM549 703L573 688L559 712ZM732 862L725 925L692 889ZM791 787L780 795L771 764ZM684 864L700 848L692 860ZM639 692L638 707L625 691ZM1041 205L1055 194L1054 217ZM1052 187L1041 205L1036 202Z'/><path fill='#72604e' stroke='#72604e' stroke-width='.6' d='M165 710L128 723L140 706ZM1093 117L1098 130L1090 133ZM1021 571L1015 562L1029 569ZM1044 176L1040 165L1061 156ZM1040 165L1044 176L1042 177ZM946 373L956 391L943 385ZM1017 277L1016 268L1021 269ZM1030 280L1031 282L1017 279ZM1047 251L1052 243L1051 249ZM1051 240L1042 240L1041 232Z'/><path fill='#6c6048' stroke='#6c6048' stroke-width='.6' d='M169 684L143 684L146 678ZM1121 340L1107 340L1104 331ZM1006 379L999 385L992 375ZM1164 277L1167 277L1163 281Z'/><path fill='#786c54' stroke='#786c54' stroke-width='.6' d='M143 689L143 684L169 684ZM1163 302L1184 303L1176 309ZM965 246L959 225L974 234ZM1052 232L1059 230L1059 234ZM994 235L994 243L988 243Z'/><path fill='#78543c' stroke='#78543c' stroke-width='.6' d='M284 559L304 526L299 556ZM595 916L570 909L591 901ZM692 889L684 864L692 860ZM646 875L684 864L664 886ZM1268 800L1255 798L1240 782ZM1255 798L1251 801L1240 782ZM324 928L327 929L325 929ZM925 472L921 471L928 464Z'/><path fill='#6c5a42' stroke='#6c5a42' stroke-width='.6' d='M100 629L143 635L125 654ZM259 707L218 684L253 670ZM187 665L150 639L178 636ZM849 532L854 527L856 530ZM879 513L865 506L874 502ZM1113 225L1117 230L1111 233ZM1102 263L1103 257L1103 262ZM881 540L883 540L877 548ZM142 441L167 429L177 462ZM1092 142L1080 145L1090 133ZM1039 419L1041 413L1046 419ZM1038 207L1033 217L1020 212ZM772 351L775 358L759 363ZM965 246L967 251L953 247ZM923 365L926 371L924 372ZM953 198L953 174L976 176ZM982 255L976 238L988 243Z'/><path fill='#7e6c54' stroke='#7e6c54' stroke-width='.6' d='M143 635L150 639L125 654ZM127 745L126 731L171 736ZM1094 117L1096 117L1098 130ZM877 548L884 540L890 542ZM1021 571L1029 569L1027 576ZM1032 284L1053 297L1032 301ZM967 251L948 258L953 247ZM974 311L974 302L987 301ZM987 469L990 470L984 478ZM1059 234L1061 231L1080 237ZM976 238L965 246L974 234Z'/><path fill='#a28a72' stroke='#a28a72' stroke-width='.6' d='M150 639L143 635L152 614ZM1139 369L1135 370L1127 364ZM942 273L959 272L951 279Z'/><path fill='#846c54' stroke='#846c54' stroke-width='.6' d='M15 533L0 525L26 521ZM1052 381L1064 356L1084 366ZM189 711L199 717L200 725ZM800 524L810 522L811 533ZM1096 117L1104 134L1098 130ZM1114 196L1134 204L1126 206ZM1088 325L1089 355L1064 356ZM1086 316L1061 312L1092 305ZM1015 562L1021 571L1012 583ZM886 527L884 525L890 527ZM1131 227L1136 212L1140 222ZM1136 212L1140 213L1140 222ZM1134 210L1136 212L1125 224ZM1085 246L1080 237L1102 241ZM1074 283L1053 297L1056 279ZM976 262L979 268L975 268ZM976 270L962 267L975 268Z'/><path fill='#b49066' stroke='#b49066' stroke-width='.6' d='M1089 853L1120 866L1090 872ZM1145 437L1132 414L1150 434Z'/><path fill='#3c2a1e' stroke='#3c2a1e' stroke-width='.6' d='M730 746L741 744L730 769ZM519 754L483 733L520 745ZM304 554L327 584L300 558ZM183 741L195 779L174 770ZM57 556L67 558L64 614ZM484 432L464 446L462 434ZM349 681L367 645L377 646ZM824 589L840 599L824 597ZM690 427L722 419L727 468ZM406 904L451 894L417 931ZM882 598L885 590L906 598ZM282 623L307 613L308 628ZM356 891L320 877L364 882ZM140 384L167 359L182 376ZM267 940L306 904L300 940ZM324 928L306 904L345 918ZM1123 364L1123 361L1127 364ZM1121 340L1123 361L1115 362ZM839 469L824 478L817 456ZM1154 840L1159 807L1174 815ZM780 416L766 369L791 408ZM824 487L839 480L831 498ZM1028 265L1047 251L1046 269ZM1150 287L1160 275L1163 281ZM1052 243L1064 253L1051 249ZM923 365L920 359L924 361Z'/><path fill='#725a3c' stroke='#725a3c' stroke-width='.6' d='M629 830L634 760L699 814ZM1225 420L1218 405L1225 393ZM780 795L730 810L730 769ZM929 713L903 703L913 699ZM812 448L814 436L830 445ZM967 888L954 883L967 881ZM186 504L188 471L207 511ZM1106 420L1112 433L1096 421ZM934 292L932 294L934 288ZM932 294L928 280L934 288ZM933 248L929 263L921 264ZM882 361L898 366L882 366Z'/><path fill='#8a6642' stroke='#8a6642' stroke-width='.6' d='M741 744L799 718L771 764ZM799 718L803 733L771 764ZM730 810L733 845L699 814ZM1036 577L1082 576L1052 619ZM610 828L617 776L629 830ZM641 907L646 875L664 886ZM758 633L752 622L765 630Z'/><path fill='#543c1e' stroke='#543c1e' stroke-width='.6' d='M806 701L799 718L794 699ZM449 556L448 579L428 571ZM248 902L249 905L221 930ZM1207 349L1205 309L1225 330ZM587 793L610 828L600 829ZM1085 246L1086 258L1085 257Z'/><path fill='#48301e' stroke='#48301e' stroke-width='.6' d='M782 691L799 718L732 715ZM573 616L546 595L564 582ZM248 730L245 748L230 717ZM261 778L245 748L261 752ZM831 772L848 777L856 806ZM897 562L885 590L875 570ZM913 699L949 674L952 703ZM1013 676L986 720L978 680ZM951 804L961 850L922 832ZM700 848L648 850L699 814ZM771 524L743 541L746 510ZM551 843L562 866L554 871ZM460 850L512 856L481 895ZM882 598L906 598L900 614ZM794 550L789 549L797 534ZM789 549L776 556L771 524ZM133 364L103 390L100 368ZM684 864L646 875L648 850ZM943 728L929 713L952 703ZM706 530L726 511L743 541ZM365 839L391 852L364 882ZM1105 395L1115 362L1123 374ZM1021 812L1030 811L1010 844ZM1105 395L1129 377L1133 408ZM1008 282L1008 281L1017 279Z'/><path fill='#604230' stroke='#604230' stroke-width='.6' d='M799 718L741 744L732 715ZM339 678L349 681L335 692ZM345 918L362 897L368 927ZM1140 760L1121 797L1132 751ZM855 587L854 589L837 573ZM939 554L955 567L941 571Z'/><path fill='#42362a' stroke='#42362a' stroke-width='.6' d='M315 403L323 365L333 367ZM192 436L183 413L205 410ZM993 355L996 350L1000 354ZM924 342L916 347L919 331ZM916 347L924 342L920 359Z'/><path fill='#664836' stroke='#664836' stroke-width='.6' d='M309 491L307 510L291 504ZM835 534L833 511L839 530ZM839 480L854 482L853 484ZM800 434L800 430L807 436ZM798 425L800 430L800 434Z'/><path fill='#4e4230' stroke='#4e4230' stroke-width='.6' d='M693 421L690 427L691 406ZM942 650L953 621L958 655ZM217 671L238 652L253 670ZM468 418L484 432L462 434ZM78 491L74 490L85 489ZM1168 318L1171 316L1168 326ZM1123 434L1127 432L1124 436ZM993 159L1000 177L976 176ZM1012 197L1021 192L1020 212ZM926 371L923 365L930 364Z'/><path fill='#545448' stroke='#545448' stroke-width='.6' d='M618 403L605 407L600 400Z'/><path fill='#302a24' stroke='#302a24' stroke-width='.6' d='M609 430L605 407L618 403Z'/><path fill='#36362a' stroke='#36362a' stroke-width='.6' d='M605 407L570 412L600 400Z'/><path fill='#362412' stroke='#362412' stroke-width='.6' d='M741 501L727 468L777 473ZM440 592L448 579L455 586ZM449 556L400 506L440 505ZM779 514L786 474L807 489ZM978 680L971 676L1007 642ZM980 794L1005 768L1025 793ZM575 504L560 512L566 477ZM593 511L615 522L599 549ZM367 645L367 640L377 646ZM394 924L406 904L417 931ZM954 883L961 850L967 881ZM1051 757L1065 695L1078 709ZM866 908L850 894L873 901ZM753 574L759 574L758 581ZM754 598L753 574L758 581ZM1112 433L1117 435L1112 438ZM763 580L754 598L758 581ZM1130 834L1129 839L1120 847ZM1021 812L986 819L980 794ZM1055 194L1041 205L1052 187ZM1013 274L1017 277L1017 279Z'/><path fill='#483018' stroke='#483018' stroke-width='.6' d='M720 504L698 505L727 468ZM728 571L695 615L674 605ZM400 506L428 571L378 546ZM593 598L607 592L605 616ZM1185 381L1204 385L1201 395ZM590 836L586 793L600 829ZM885 590L865 574L875 570ZM903 783L895 806L891 781ZM704 547L741 558L728 571ZM733 601L732 612L695 615ZM1001 621L995 623L985 589ZM954 725L971 705L983 726ZM706 530L704 547L661 549ZM1143 795L1140 760L1164 777ZM867 570L865 559L875 570ZM1002 587L1001 621L985 589ZM1087 449L1080 451L1081 446ZM853 484L860 486L855 496ZM1086 258L1103 257L1090 264ZM1002 587L1011 594L1001 621ZM1134 378L1129 377L1133 376ZM1129 377L1134 378L1135 380ZM999 261L997 257L1010 252Z'/><path fill='#66482a' stroke='#66482a' stroke-width='.6' d='M741 501L720 504L727 468ZM42 465L47 460L70 463ZM843 720L806 701L838 698ZM814 745L843 720L862 758ZM586 793L587 793L600 829ZM855 587L869 598L854 589ZM942 785L968 789L951 804ZM863 400L879 402L864 423ZM1017 404L1007 419L1008 409ZM936 575L936 589L927 590Z'/><path fill='#544e3c' stroke='#544e3c' stroke-width='.6' d='M667 397L680 444L633 398ZM974 586L975 593L957 584Z'/><path fill='#4e4236' stroke='#4e4236' stroke-width='.6' d='M690 427L680 444L667 397ZM1123 361L1121 340L1128 340ZM913 541L918 547L906 552ZM964 571L974 586L957 584ZM989 362L993 358L992 375ZM924 342L919 331L925 340Z'/><path fill='#9c7854' stroke='#9c7854' stroke-width='.6' d='M705 671L722 647L730 686ZM1203 354L1207 364L1203 364ZM394 924L390 937L368 927ZM1010 430L1024 431L1002 447ZM828 826L850 827L828 848ZM703 722L705 671L730 686ZM942 470L925 472L928 464ZM1132 414L1144 407L1150 434ZM797 351L812 341L814 343ZM921 471L925 472L926 491Z'/><path fill='#96724e' stroke='#96724e' stroke-width='.6' d='M722 647L753 681L730 686ZM297 893L248 902L297 856ZM1203 354L1207 349L1207 364ZM418 723L424 718L430 728ZM1110 629L1078 615L1089 589ZM881 906L892 898L900 910ZM418 723L411 722L411 713ZM799 819L828 826L828 848ZM1024 431L1009 457L1002 447ZM1177 353L1188 360L1178 365ZM283 800L247 832L252 798ZM941 453L942 470L928 464ZM397 814L391 808L403 807Z'/><path fill='#967248' stroke='#967248' stroke-width='.6' d='M753 681L722 647L763 653ZM850 827L828 826L856 806ZM752 622L758 633L722 647Z'/><path fill='#120c06' stroke='#120c06' stroke-width='.6' d='M510 728L483 733L484 728ZM941 854L936 880L919 840ZM633 496L631 475L681 462Z'/><path fill='#846042' stroke='#846042' stroke-width='.6' d='M403 784L392 762L432 751ZM248 902L190 907L189 869ZM906 598L916 594L924 613ZM1188 360L1185 381L1178 365ZM854 862L887 815L919 840ZM908 814L887 815L902 811ZM763 653L758 633L765 630ZM406 904L362 897L364 882ZM732 715L703 722L730 686ZM966 443L957 449L952 437ZM1061 156L1089 163L1066 176ZM655 729L654 689L703 722Z'/><path fill='#180c06' stroke='#180c06' stroke-width='.6' d='M565 673L552 663L572 652ZM936 880L928 889L919 840ZM633 496L627 473L631 475Z'/><path fill='#907248' stroke='#907248' stroke-width='.6' d='M546 595L532 608L535 590Z'/><path fill='#3c2412' stroke='#3c2412' stroke-width='.6' d='M487 667L487 618L521 640ZM594 724L595 731L590 736ZM728 571L733 601L695 615ZM1135 730L1140 760L1132 751ZM791 787L790 790L780 795ZM955 570L943 578L941 571ZM758 565L753 574L741 558ZM1099 840L1130 834L1120 847ZM955 570L945 579L943 578ZM1066 261L1064 262L1064 253Z'/><path fill='#4e3c36' stroke='#4e3c36' stroke-width='.6' d='M480 934L512 918L510 933ZM1108 476L1106 478L1099 476Z'/><path fill='#5a482a' stroke='#5a482a' stroke-width='.6' d='M249 905L228 931L221 930ZM397 452L396 442L406 450ZM1228 824L1251 801L1230 828Z'/><path fill='#b49660' stroke='#b49660' stroke-width='.6' d='M330 939L342 928L360 938Z'/><path fill='#a88a6c' stroke='#a88a6c' stroke-width='.6' d='M1145 590L1147 565L1150 560ZM18 788L28 838L2 812ZM130 803L142 797L159 817ZM1026 389L1019 385L1040 370ZM1104 134L1117 140L1097 143ZM937 445L931 438L950 430ZM940 529L934 516L946 521ZM1164 258L1144 254L1164 252ZM797 351L796 378L779 368ZM917 521L923 521L918 523Z'/><path fill='#ae8a6c' stroke='#ae8a6c' stroke-width='.6' d='M1147 565L1133 569L1130 562ZM1128 585L1112 555L1133 569ZM930 423L931 438L907 437ZM931 438L938 420L950 430ZM929 404L906 427L898 412Z'/><path fill='#543624' stroke='#543624' stroke-width='.6' d='M786 474L812 481L807 489ZM1013 676L978 680L1007 642ZM879 659L903 703L870 676ZM871 598L865 574L885 590ZM776 556L743 541L771 524ZM1021 812L1010 844L1000 842Z'/><path fill='#664824' stroke='#664824' stroke-width='.6' d='M862 425L857 447L842 428Z'/><path fill='#726054' stroke='#726054' stroke-width='.6' d='M870 540L876 527L877 536ZM911 566L907 566L914 555ZM890 527L896 539L891 540ZM916 560L924 559L911 566Z'/><path fill='#5a4230' stroke='#5a4230' stroke-width='.6' d='M942 650L913 699L912 636ZM929 713L913 699L952 703ZM42 465L70 463L58 494ZM74 522L57 556L26 521ZM394 733L377 699L411 713ZM571 928L595 916L600 930ZM24 681L14 665L15 659ZM615 741L617 776L590 736ZM1081 765L1117 743L1121 797ZM869 598L871 598L872 602ZM1099 840L1053 831L1079 807ZM968 789L964 766L971 766ZM1010 844L1045 847L1031 870ZM753 574L733 601L728 571ZM918 536L912 535L910 529ZM1065 264L1066 261L1074 272ZM1015 256L1008 269L999 261ZM1018 297L1009 287L1017 279ZM994 233L976 226L991 205Z'/><path fill='#7e603c' stroke='#7e603c' stroke-width='.6' d='M945 593L953 621L924 613ZM786 859L828 848L803 907ZM236 578L284 559L245 596ZM236 578L261 527L284 559ZM908 751L943 728L943 755ZM1089 163L1082 196L1066 176ZM1093 454L1087 449L1096 447Z'/><path fill='#664e3c' stroke='#664e3c' stroke-width='.6' d='M953 621L960 617L958 655ZM595 916L571 928L570 909ZM541 683L549 703L514 690ZM188 471L177 462L195 446ZM230 451L265 470L259 504ZM865 506L879 513L876 527ZM140 384L183 413L152 427ZM854 482L860 486L853 484ZM1106 232L1113 225L1111 233ZM881 540L877 548L870 540ZM167 429L142 441L152 427ZM820 485L824 487L823 489ZM916 524L918 536L910 529ZM1013 274L1008 281L1004 280ZM1061 231L1061 230L1075 229Z'/><path fill='#a88a60' stroke='#a88a60' stroke-width='.6' d='M1110 629L1129 586L1140 620ZM303 823L316 854L297 856ZM1154 840L1158 843L1150 860ZM922 445L912 449L907 437Z'/><path fill='#7e5a36' stroke='#7e5a36' stroke-width='.6' d='M1093 632L1110 629L1120 672ZM1188 360L1203 354L1203 364ZM995 623L1007 642L958 655ZM247 832L235 798L252 798ZM752 622L754 598L765 630Z'/><path fill='#3c2418' stroke='#3c2418' stroke-width='.6' d='M1052 619L1007 642L1029 601ZM789 549L771 524L797 534ZM1129 377L1105 395L1123 374ZM933 558L924 559L932 555Z'/><path fill='#724e36' stroke='#724e36' stroke-width='.6' d='M1036 577L1052 619L1029 601ZM597 893L590 836L636 852ZM590 736L587 793L586 793ZM831 772L791 787L814 745ZM855 587L865 574L869 598ZM654 689L665 653L705 671Z'/><path fill='#b48a60' stroke='#b48a60' stroke-width='.6' d='M1031 870L1030 884L1000 890Z'/><path fill='#483012' stroke='#483012' stroke-width='.6' d='M1218 405L1201 395L1225 393Z'/><path fill='#3c240c' stroke='#3c240c' stroke-width='.6' d='M1201 395L1204 385L1225 393ZM1090 264L1102 263L1096 267Z'/><path fill='#9c785a' stroke='#9c785a' stroke-width='.6' d='M1204 385L1207 364L1230 380ZM433 864L406 904L405 869ZM957 449L956 456L941 453ZM895 414L899 404L898 412ZM1181 409L1177 421L1179 408ZM1188 424L1177 421L1183 411Z'/><path fill='#725430' stroke='#725430' stroke-width='.6' d='M1207 349L1203 354L1187 338ZM235 798L255 787L252 798ZM857 447L836 444L842 428ZM754 598L752 622L732 612ZM1163 430L1158 439L1150 434Z'/><path fill='#664e30' stroke='#664e30' stroke-width='.6' d='M1225 330L1205 309L1232 308ZM625 691L573 688L624 649ZM1047 451L1043 443L1046 437Z'/><path fill='#6c5a48' stroke='#6c5a48' stroke-width='.6' d='M243 360L241 359L267 358ZM20 413L65 437L35 459ZM871 598L882 598L872 602ZM1161 351L1146 340L1158 342ZM1127 432L1128 435L1124 436ZM974 302L972 294L987 301ZM948 323L945 319L951 319ZM949 177L953 174L947 182Z'/><path fill='#483c30' stroke='#483c30' stroke-width='.6' d='M246 419L205 410L252 393ZM299 411L300 360L315 403ZM396 423L355 398L400 380ZM722 419L693 421L691 406ZM957 584L975 593L951 594ZM993 358L1014 367L992 375ZM995 197L1003 188L999 202Z'/><path fill='#36301e' stroke='#36301e' stroke-width='.6' d='M205 410L233 357L252 393ZM267 358L260 400L252 393ZM1082 424L1071 415L1090 403ZM1117 435L1123 434L1124 436Z'/><path fill='#4e3c30' stroke='#4e3c30' stroke-width='.6' d='M4 447L3 464L0 441ZM407 423L396 423L400 380ZM693 421L722 419L690 427ZM912 535L896 539L910 529ZM186 398L140 384L182 376ZM945 579L955 570L957 584ZM883 538L884 540L883 540Z'/><path fill='#ae9c90' stroke='#ae9c90' stroke-width='.6' d='M769 146L739 166L743 141Z'/><path fill='#bab4ae' stroke='#bab4ae' stroke-width='.6' d='M797 155L769 146L786 135ZM761 202L778 191L787 223ZM1080 145L1061 156L1050 148ZM778 191L791 220L787 223Z'/><path fill='#b49c8a' stroke='#b49c8a' stroke-width='.6' d='M797 155L800 140L802 146ZM1030 363L1014 367L1028 350ZM1106 245L1103 257L1102 241Z'/><path fill='#b49678' stroke='#b49678' stroke-width='.6' d='M42 859L55 846L53 867ZM42 859L28 838L55 846ZM1156 372L1161 351L1174 356ZM1178 332L1177 353L1161 351ZM926 491L940 481L945 490ZM914 517L902 496L926 491ZM814 343L835 342L831 351ZM1018 483L1008 470L1021 472ZM954 392L956 391L953 410ZM788 335L793 339L786 339ZM894 393L882 387L900 387Z'/><path fill='#8a7254' stroke='#8a7254' stroke-width='.6' d='M163 801L142 797L174 770ZM1052 381L1026 389L1040 370ZM1114 196L1126 206L1111 197ZM1029 569L1033 578L1027 576ZM1063 786L1051 757L1076 762ZM1126 206L1105 201L1111 197ZM1061 312L1074 283L1091 297ZM994 261L997 257L999 261ZM891 301L928 280L932 294ZM928 280L926 276L930 272ZM938 271L928 280L930 272ZM898 354L898 366L890 354Z'/><path fill='#2a2412' stroke='#2a2412' stroke-width='.6' d='M127 745L100 766L88 750ZM115 678L125 654L146 678ZM282 623L308 628L277 650ZM1069 431L1048 426L1071 423Z'/><path fill='#a28466' stroke='#a28466' stroke-width='.6' d='M130 803L159 817L143 838ZM339 678L316 669L339 666ZM794 313L812 304L805 334ZM316 656L324 654L316 669ZM1065 553L1076 568L1036 577ZM329 740L294 744L296 706ZM1000 451L987 452L991 440ZM941 529L940 529L946 521ZM1117 140L1099 160L1097 143ZM1135 380L1139 369L1156 372ZM1127 432L1132 414L1145 437ZM1167 277L1165 260L1189 251ZM1183 453L1178 441L1189 451ZM1178 441L1158 439L1163 430ZM802 404L808 408L791 408ZM1018 312L1024 313L1008 315ZM861 368L875 366L863 374ZM817 424L807 422L815 410ZM882 361L875 366L860 350Z'/><path fill='#a89078' stroke='#a89078' stroke-width='.6' d='M199 717L189 711L218 684ZM1197 188L1191 177L1196 175ZM1039 354L1061 312L1064 356ZM1040 359L1064 356L1040 370ZM1096 313L1086 316L1092 305ZM1099 160L1117 140L1118 161ZM795 309L793 300L812 304ZM795 309L791 307L793 300ZM896 255L870 231L870 225ZM867 308L887 265L891 301ZM974 302L951 319L944 301ZM1007 282L1009 287L1004 280Z'/><path fill='#967860' stroke='#967860' stroke-width='.6' d='M175 704L189 711L170 713ZM101 805L121 777L130 803ZM329 740L296 706L326 704ZM1189 251L1164 252L1170 232ZM781 310L791 307L794 313Z'/><path fill='#9c7e66' stroke='#9c7e66' stroke-width='.6' d='M165 710L175 704L170 713ZM142 797L121 777L174 770ZM1061 312L1088 325L1064 356ZM1114 196L1099 160L1118 161ZM914 517L916 524L910 529ZM1024 313L1018 312L1020 300ZM940 534L931 547L928 543ZM931 547L940 534L939 554ZM894 393L885 393L882 387Z'/><path fill='#a28a6c' stroke='#a28a6c' stroke-width='.6' d='M169 684L175 704L165 710ZM130 803L121 777L142 797ZM1148 531L1170 510L1150 560ZM949 526L941 529L946 521ZM1161 236L1165 232L1170 232ZM860 350L864 322L873 324ZM864 322L872 315L873 324ZM999 301L1008 315L982 316ZM1008 315L1024 313L1028 350ZM916 524L917 521L918 523ZM917 521L921 517L923 521ZM898 354L909 350L905 365Z'/><path fill='#9c7254' stroke='#9c7254' stroke-width='.6' d='M418 733L418 723L430 728ZM648 850L629 830L699 814Z'/><path fill='#665442' stroke='#665442' stroke-width='.6' d='M126 731L128 723L171 736ZM259 646L277 650L253 670ZM0 413L11 423L0 441ZM396 423L350 413L355 398ZM307 613L319 603L308 628ZM287 456L308 465L290 474ZM1017 277L1030 280L1017 279ZM1075 229L1069 223L1080 220ZM950 246L959 225L953 247ZM959 225L976 226L974 234ZM930 374L934 374L937 383ZM947 250L935 237L950 246ZM1061 230L1059 230L1057 221Z'/><path fill='#302a18' stroke='#302a18' stroke-width='.6' d='M115 678L143 684L143 689ZM1071 415L1082 424L1071 423Z'/><path fill='#8a7860' stroke='#8a7860' stroke-width='.6' d='M65 507L26 521L58 494ZM1102 263L1103 262L1116 277ZM1024 577L1021 571L1027 576ZM1160 275L1167 277L1164 277ZM1029 299L1032 301L1024 313ZM942 273L951 279L943 284ZM1059 230L1061 231L1059 234ZM1007 282L1008 282L1009 287ZM994 243L993 256L988 243ZM994 243L994 235L1003 243Z'/><path fill='#6c5442' stroke='#6c5442' stroke-width='.6' d='M8 649L15 659L0 665ZM142 441L149 426L152 427ZM1080 220L1069 223L1079 217ZM1015 256L999 261L1010 252ZM1018 297L1029 299L1020 300Z'/><path fill='#7e6c4e' stroke='#7e6c4e' stroke-width='.6' d='M8 649L0 637L32 632ZM1021 571L1024 577L1012 583Z'/><path fill='#907854' stroke='#907854' stroke-width='.6' d='M1050 864L1089 853L1060 878ZM1033 578L1029 569L1036 577ZM965 559L956 547L975 534ZM294 744L329 740L333 767Z'/><path fill='#967e4e' stroke='#967e4e' stroke-width='.6' d='M1031 870L1050 864L1030 884Z'/><path fill='#5a4e30' stroke='#5a4e30' stroke-width='.6' d='M1050 864L1031 870L1047 863Z'/><path fill='#a8845a' stroke='#a8845a' stroke-width='.6' d='M881 906L900 910L867 915ZM969 417L980 401L1007 419Z'/><path fill='#18120c' stroke='#18120c' stroke-width='.6' d='M928 889L891 894L919 840Z'/><path fill='#a88454' stroke='#a88454' stroke-width='.6' d='M900 910L928 889L933 903Z'/><path fill='#5a3c1e' stroke='#5a3c1e' stroke-width='.6' d='M803 733L843 720L814 745ZM1076 656L1051 681L1052 619ZM849 532L839 537L839 530ZM879 402L863 400L878 398ZM1093 454L1098 448L1095 455Z'/><path fill='#1e1206' stroke='#1e1206' stroke-width='.6' d='M850 775L848 777L831 772ZM668 566L653 560L661 549ZM349 681L377 646L377 699ZM361 796L378 776L377 792ZM361 796L333 767L378 776ZM1078 756L1051 757L1078 709ZM1108 464L1099 476L1095 455Z'/><path fill='#363024' stroke='#363024' stroke-width='.6' d='M344 371L315 403L333 367ZM216 433L230 451L195 446ZM93 458L135 451L98 470Z'/><path fill='#3c362a' stroke='#3c362a' stroke-width='.6' d='M344 371L355 398L315 403ZM11 423L4 447L0 441ZM1164 317L1165 314L1168 318Z'/><path fill='#78726c' stroke='#78726c' stroke-width='.6' d='M344 371L333 367L367 373Z'/><path fill='#302a1e' stroke='#302a1e' stroke-width='.6' d='M549 420L533 400L567 400ZM1105 395L1106 420L1090 403ZM1167 319L1168 318L1168 326Z'/><path fill='#30241e' stroke='#30241e' stroke-width='.6' d='M573 688L565 673L572 652ZM1164 317L1167 319L1168 326Z'/><path fill='#78603c' stroke='#78603c' stroke-width='.6' d='M541 683L514 690L533 671ZM1189 251L1200 229L1195 249ZM898 366L896 370L882 366Z'/><path fill='#785a42' stroke='#785a42' stroke-width='.6' d='M357 639L367 645L339 666ZM1098 130L1097 140L1090 133ZM37 462L35 468L35 459ZM887 815L895 806L902 811ZM1036 797L1063 786L1079 807ZM1122 267L1129 249L1139 265ZM1139 369L1134 378L1133 376ZM936 589L940 578L946 583ZM1052 187L1044 176L1066 176ZM918 536L916 524L918 523ZM1136 212L1131 227L1125 224ZM924 238L921 264L896 255ZM807 422L800 430L798 425ZM800 430L807 422L807 436ZM1180 427L1178 423L1181 427ZM933 248L941 259L934 259Z'/><path fill='#725442' stroke='#725442' stroke-width='.6' d='M367 645L349 681L339 666ZM933 558L939 554L941 571ZM939 554L933 558L932 555Z'/><path fill='#846642' stroke='#846642' stroke-width='.6' d='M595 916L597 893L633 913ZM1082 576L1078 615L1052 619ZM1088 719L1085 679L1124 683ZM284 559L261 527L304 526ZM345 918L368 927L360 938ZM1219 417L1203 420L1218 405ZM1082 576L1076 568L1082 560ZM1096 447L1087 449L1081 446ZM1098 448L1105 443L1101 448Z'/><path fill='#a2907e' stroke='#a2907e' stroke-width='.6' d='M1128 77L1101 104L1100 100Z'/><path fill='#c0bab4' stroke='#c0bab4' stroke-width='.6' d='M1182 117L1185 71L1194 99ZM1193 124L1179 131L1182 117ZM1083 467L1086 478L1059 478ZM795 180L791 183L797 155ZM788 237L763 242L787 223ZM809 265L811 256L837 259ZM925 340L937 334L946 342ZM822 174L840 195L795 180Z'/><path fill='#9c8a6c' stroke='#9c8a6c' stroke-width='.6' d='M1197 188L1208 200L1198 204ZM1091 556L1100 557L1082 576ZM775 358L797 351L779 368ZM987 469L980 477L975 477ZM905 365L923 365L924 372Z'/><path fill='#8a7866' stroke='#8a7866' stroke-width='.6' d='M1210 170L1197 188L1203 172ZM1233 297L1209 281L1224 281ZM883 531L886 527L890 527ZM1015 256L1014 245L1021 251Z'/><path fill='#361e12' stroke='#361e12' stroke-width='.6' d='M1192 775L1164 777L1170 768ZM1115 362L1123 364L1123 374Z'/><path fill='#7e6c48' stroke='#7e6c48' stroke-width='.6' d='M1120 847L1129 839L1150 860Z'/><path fill='#baa890' stroke='#baa890' stroke-width='.6' d='M1112 555L1130 530L1130 562ZM1103 288L1113 291L1108 298ZM982 541L965 559L975 534ZM799 288L787 277L803 279Z'/><path fill='#483024' stroke='#483024' stroke-width='.6' d='M897 562L906 552L901 561ZM954 725L983 726L971 766ZM823 482L820 485L812 481ZM780 416L798 425L800 434ZM831 498L828 501L823 489Z'/><path fill='#6c5a3c' stroke='#6c5a3c' stroke-width='.6' d='M800 595L803 585L814 605Z'/><path fill='#7e5a30' stroke='#7e5a30' stroke-width='.6' d='M1013 676L1007 642L1033 681Z'/><path fill='#7e6c60' stroke='#7e6c60' stroke-width='.6' d='M916 560L911 566L914 555ZM965 369L980 379L965 389ZM941 377L946 373L943 385Z'/><path fill='#8a663c' stroke='#8a663c' stroke-width='.6' d='M932 591L945 593L924 613ZM1051 681L1065 695L1033 681ZM1105 443L1098 448L1096 447ZM951 541L956 547L948 551Z'/><path fill='#966c48' stroke='#966c48' stroke-width='.6' d='M924 592L932 591L924 613ZM843 854L850 827L854 862Z'/><path fill='#84603c' stroke='#84603c' stroke-width='.6' d='M932 591L924 592L927 590ZM1085 679L1088 719L1078 709ZM942 785L937 785L934 777ZM235 798L247 832L197 789ZM916 594L922 592L924 613ZM1065 695L1051 681L1084 678ZM636 845L610 828L629 830ZM610 828L636 845L636 852ZM956 547L960 559L948 551ZM960 559L956 547L965 559ZM703 722L654 689L705 671ZM932 591L936 589L945 593ZM940 534L951 541L948 551ZM939 554L940 534L948 551Z'/><path fill='#543018' stroke='#543018' stroke-width='.6' d='M1076 656L1093 632L1120 672ZM964 766L968 789L942 785Z'/><path fill='#603c1e' stroke='#603c1e' stroke-width='.6' d='M1076 656L1078 615L1093 632Z'/><path fill='#60482a' stroke='#60482a' stroke-width='.6' d='M1000 749L997 739L1008 723ZM1088 271L1090 264L1096 267ZM1051 681L1076 656L1084 678ZM903 805L903 783L937 785ZM1179 408L1185 381L1201 395ZM214 577L236 578L216 601ZM1140 760L1143 795L1121 797ZM943 728L954 725L943 755ZM1136 822L1130 834L1121 797Z'/><path fill='#ae8a5a' stroke='#ae8a5a' stroke-width='.6' d='M967 897L967 888L1000 890ZM954 883L967 897L933 903Z'/><path fill='#8a6042' stroke='#8a6042' stroke-width='.6' d='M937 785L903 783L934 777Z'/><path fill='#3c2a24' stroke='#3c2a24' stroke-width='.6' d='M1168 326L1158 342L1153 339Z'/><path fill='#544236' stroke='#544236' stroke-width='.6' d='M84 402L20 413L33 379ZM4 447L11 423L35 459ZM906 552L918 547L914 555ZM831 583L840 599L824 589ZM907 566L906 552L914 555ZM881 527L883 531L876 527ZM1069 223L1068 209L1079 217ZM1028 265L1015 256L1021 251ZM980 379L977 388L965 389ZM934 368L930 374L926 371Z'/><path fill='#5a5448' stroke='#5a5448' stroke-width='.6' d='M745 375L722 419L700 395Z'/><path fill='#4e483c' stroke='#4e483c' stroke-width='.6' d='M722 419L691 406L700 395Z'/><path fill='#726654' stroke='#726654' stroke-width='.6' d='M743 141L737 163L735 130Z'/><path fill='#847260' stroke='#847260' stroke-width='.6' d='M739 166L737 163L743 141ZM1209 212L1204 204L1207 206ZM1094 117L1098 130L1093 117ZM860 175L855 187L842 165ZM860 178L874 190L855 187ZM1059 230L1061 230L1061 231Z'/><path fill='#8a6c54' stroke='#8a6c54' stroke-width='.6' d='M100 766L93 796L81 785ZM349 681L339 678L339 666ZM188 471L178 493L177 462ZM1061 312L1091 297L1092 305ZM868 552L865 559L863 555ZM841 553L841 558L835 552ZM836 444L833 448L830 445ZM1086 316L1088 325L1061 312ZM1036 797L1039 779L1063 786ZM781 310L777 295L787 298ZM791 307L781 310L787 298ZM1136 212L1139 212L1140 213ZM808 408L798 425L791 408ZM971 454L962 461L957 449ZM1180 427L1181 427L1181 428Z'/><path fill='#4e3c1e' stroke='#4e3c1e' stroke-width='.6' d='M93 796L93 824L63 807Z'/><path fill='#b4906c' stroke='#b4906c' stroke-width='.6' d='M247 832L303 823L297 856ZM895 416L879 446L883 411ZM906 427L895 416L898 412ZM817 424L815 410L832 417ZM800 335L797 351L793 345Z'/><path fill='#483c24' stroke='#483c24' stroke-width='.6' d='M261 527L207 511L259 504ZM812 448L794 462L795 447Z'/><path fill='#907e60' stroke='#907e60' stroke-width='.6' d='M65 507L75 520L74 522ZM788 335L779 342L760 330ZM994 235L1005 241L1003 243ZM994 235L994 233L1005 241Z'/><path fill='#8a6c48' stroke='#8a6c48' stroke-width='.6' d='M895 806L887 815L856 806ZM648 850L646 875L636 852ZM337 840L316 854L303 823ZM1203 420L1183 411L1201 395ZM780 795L789 811L730 810ZM1021 472L1012 464L1021 467ZM900 500L888 508L886 496ZM1158 417L1144 407L1150 391ZM1143 403L1144 407L1133 408ZM918 471L902 496L898 477ZM1177 421L1172 402L1179 408Z'/><path fill='#48362a' stroke='#48362a' stroke-width='.6' d='M242 447L216 433L246 419ZM1158 843L1154 840L1174 815ZM839 480L823 482L824 478ZM883 531L883 538L877 536Z'/><path fill='#3c3624' stroke='#3c3624' stroke-width='.6' d='M330 442L303 427L315 403ZM1115 448L1117 435L1124 436ZM1055 194L1068 209L1054 217ZM1000 177L1001 184L976 176Z'/><path fill='#241812' stroke='#241812' stroke-width='.6' d='M463 412L478 409L468 418ZM941 854L954 883L936 880Z'/><path fill='#180c00' stroke='#180c00' stroke-width='.6' d='M575 504L593 511L560 512ZM562 866L570 909L554 871Z'/><path fill='#241806' stroke='#241806' stroke-width='.6' d='M599 485L575 504L566 477ZM1117 743L1081 765L1078 756Z'/><path fill='#9c784e' stroke='#9c784e' stroke-width='.6' d='M722 647L758 633L763 653Z'/><path fill='#241206' stroke='#241206' stroke-width='.6' d='M590 836L562 866L551 843ZM638 707L646 721L619 722ZM1030 811L1021 812L1025 793Z'/><path fill='#544830' stroke='#544830' stroke-width='.6' d='M562 866L597 893L591 901ZM1033 217L1038 207L1054 217ZM1021 192L1012 165L1042 177ZM1083 467L1093 454L1095 455ZM775 358L766 369L759 363ZM1061 230L1057 221L1069 223ZM1052 232L1051 240L1041 232Z'/><path fill='#121206' stroke='#121206' stroke-width='.6' d='M518 902L512 856L529 897Z'/><path fill='#24120c' stroke='#24120c' stroke-width='.6' d='M722 925L725 925L733 925ZM1117 435L1115 448L1112 438Z'/><path fill='#ccc0ae' stroke='#ccc0ae' stroke-width='.6' d='M1098 108L1093 117L1100 100ZM1142 448L1150 458L1125 467ZM896 191L900 190L896 191ZM960 482L964 505L945 490ZM980 507L980 477L984 478Z'/><path fill='#ccc0b4' stroke='#ccc0b4' stroke-width='.6' d='M1101 104L1098 108L1100 100ZM1111 538L1130 530L1112 555ZM1097 554L1091 556L1100 547ZM984 511L985 527L975 534ZM860 175L896 191L874 190ZM980 477L980 507L975 477ZM930 178L907 189L905 189Z'/><path fill='#c6bab4' stroke='#c6bab4' stroke-width='.6' d='M1193 124L1182 117L1194 99ZM1111 538L1096 518L1110 524ZM1067 516L1062 530L1027 517ZM1015 562L1015 536L1029 550ZM1003 536L1015 536L1000 556ZM1030 541L1048 544L1029 550ZM1048 544L1025 531L1027 517ZM930 178L930 181L907 189Z'/><path fill='#b4a296' stroke='#b4a296' stroke-width='.6' d='M1207 97L1193 124L1194 99ZM860 178L860 175L874 190ZM896 191L900 190L902 196ZM822 174L803 168L830 158Z'/><path fill='#a89c90' stroke='#a89c90' stroke-width='.6' d='M1193 124L1207 97L1208 133ZM1159 201L1161 177L1185 177Z'/><path fill='#ae9c84' stroke='#ae9c84' stroke-width='.6' d='M1191 177L1197 188L1185 177ZM1183 463L1190 482L1181 485ZM1185 319L1171 316L1176 309ZM799 288L793 300L794 290ZM1106 235L1106 245L1102 241ZM1148 531L1149 528L1170 510ZM830 158L803 168L802 146ZM1042 313L1039 354L1028 350ZM924 372L930 374L921 393ZM951 279L959 272L956 285Z'/><path fill='#aea89c' stroke='#aea89c' stroke-width='.6' d='M1082 512L1102 503L1096 518ZM1133 179L1143 131L1161 177ZM1150 287L1158 292L1137 296ZM830 297L809 265L837 259ZM989 362L982 373L985 354Z'/><path fill='#b4aea2' stroke='#b4aea2' stroke-width='.6' d='M1110 524L1102 503L1105 500ZM1062 530L1067 516L1082 512ZM1143 315L1163 302L1162 314ZM867 308L830 297L837 259ZM1210 170L1183 153L1208 133ZM982 373L965 369L985 354ZM944 370L957 365L946 373Z'/><path fill='#c0baae' stroke='#c0baae' stroke-width='.6' d='M1096 518L1102 503L1110 524ZM1062 530L1048 544L1027 517ZM851 228L859 243L837 259ZM1183 153L1179 131L1193 124ZM859 243L887 265L837 259ZM930 181L930 178L943 176Z'/><path fill='#d2b49c' stroke='#d2b49c' stroke-width='.6' d='M1059 478L1047 467L1055 458ZM1026 504L1024 507L1011 492Z'/><path fill='#baa896' stroke='#baa896' stroke-width='.6' d='M1121 266L1103 262L1115 258ZM787 277L809 265L803 279ZM842 194L822 174L831 166Z'/><path fill='#b4a28a' stroke='#b4a28a' stroke-width='.6' d='M1103 262L1121 266L1116 277ZM830 297L827 325L812 304ZM972 294L974 302L944 301ZM1004 280L1009 287L988 287ZM851 193L842 194L855 187ZM950 282L951 279L956 285Z'/><path fill='#baa28a' stroke='#baa28a' stroke-width='.6' d='M1113 291L1103 288L1116 277ZM1040 359L1030 363L1039 354ZM1178 332L1161 351L1158 342ZM919 331L891 301L932 299ZM919 331L898 354L873 324Z'/><path fill='#847866' stroke='#847866' stroke-width='.6' d='M1137 296L1113 291L1125 274ZM1209 281L1227 263L1224 281Z'/><path fill='#c6ae9c' stroke='#c6ae9c' stroke-width='.6' d='M1113 291L1116 277L1125 274ZM835 342L843 317L864 322Z'/><path fill='#847e72' stroke='#847e72' stroke-width='.6' d='M1128 340L1115 320L1133 312ZM1143 315L1143 317L1133 312Z'/><path fill='#4e301e' stroke='#4e301e' stroke-width='.6' d='M1164 777L1140 760L1170 768Z'/><path fill='#7e6642' stroke='#7e6642' stroke-width='.6' d='M1129 839L1154 840L1150 860ZM1093 454L1086 452L1087 449Z'/><path fill='#ba9678' stroke='#ba9678' stroke-width='.6' d='M847 468L868 454L864 477ZM941 453L956 456L952 465ZM899 404L894 393L900 387Z'/><path fill='#c0a27e' stroke='#c0a27e' stroke-width='.6' d='M868 454L847 468L857 447ZM1044 451L1047 451L1047 467ZM1032 501L1018 483L1036 487ZM1018 483L1033 480L1036 487ZM814 343L812 341L827 325Z'/><path fill='#9c8a78' stroke='#9c8a78' stroke-width='.6' d='M1096 313L1115 320L1104 331ZM1181 485L1190 482L1170 510ZM855 187L842 194L842 165ZM919 331L937 305L932 333Z'/><path fill='#c6b496' stroke='#c6b496' stroke-width='.6' d='M1096 313L1092 305L1108 298Z'/><path fill='#c6c0ba' stroke='#c6c0ba' stroke-width='.6' d='M1062 530L1065 553L1057 550ZM1100 547L1062 530L1096 518ZM1130 530L1111 538L1110 524ZM1111 538L1100 547L1096 518ZM946 342L944 370L930 364ZM957 349L944 370L946 342Z'/><path fill='#c0ae9c' stroke='#c0ae9c' stroke-width='.6' d='M1100 557L1100 547L1112 555ZM1103 257L1115 251L1115 258ZM1103 257L1106 245L1115 251ZM1149 528L1148 526L1154 519ZM830 297L843 317L827 325ZM990 552L985 556L982 541ZM960 482L962 461L975 477ZM842 194L851 193L840 195Z'/><path fill='#c6baae' stroke='#c6baae' stroke-width='.6' d='M1100 547L1111 538L1112 555ZM1013 534L1013 518L1025 531Z'/><path fill='#baaea8' stroke='#baaea8' stroke-width='.6' d='M1167 498L1154 519L1148 497ZM811 256L809 265L808 260Z'/><path fill='#c6baa8' stroke='#c6baa8' stroke-width='.6' d='M1155 466L1167 498L1148 497ZM1100 557L1097 554L1100 547ZM830 297L867 308L857 316ZM1013 518L985 527L984 511ZM953 525L964 505L955 526Z'/><path fill='#543c30' stroke='#543c30' stroke-width='.6' d='M856 530L856 529L876 527ZM882 901L892 898L881 906ZM839 530L833 511L844 519ZM946 583L945 579L957 584Z'/><path fill='#7e604e' stroke='#7e604e' stroke-width='.6' d='M846 540L856 530L870 540ZM835 552L803 544L811 533ZM779 368L796 378L791 408ZM932 186L953 198L938 208Z'/><path fill='#665448' stroke='#665448' stroke-width='.6' d='M865 506L854 527L844 519ZM135 451L137 487L98 470ZM876 527L883 531L877 536ZM922 543L923 549L918 547ZM923 549L922 550L918 547Z'/><path fill='#665a48' stroke='#665a48' stroke-width='.6' d='M882 598L871 598L885 590ZM1140 275L1137 296L1125 274ZM1127 364L1123 361L1128 340ZM884 540L883 538L891 540Z'/><path fill='#5a4e3c' stroke='#5a4e3c' stroke-width='.6' d='M975 593L960 617L951 594ZM1069 433L1069 460L1055 458ZM883 531L890 527L891 540ZM1052 232L1041 232L1054 217Z'/><path fill='#543618' stroke='#543618' stroke-width='.6' d='M995 623L1001 621L1007 642ZM870 478L878 481L863 486Z'/><path fill='#8a603c' stroke='#8a603c' stroke-width='.6' d='M924 592L922 592L927 590Z'/><path fill='#906642' stroke='#906642' stroke-width='.6' d='M922 592L924 592L924 613Z'/><path fill='#785a30' stroke='#785a30' stroke-width='.6' d='M1052 619L1051 681L1033 681Z'/><path fill='#906648' stroke='#906648' stroke-width='.6' d='M986 720L971 705L978 680Z'/><path fill='#4e3618' stroke='#4e3618' stroke-width='.6' d='M954 883L936 888L936 887Z'/><path fill='#361e0c' stroke='#361e0c' stroke-width='.6' d='M903 805L895 806L903 783ZM1127 366L1129 377L1123 374ZM1064 262L1066 261L1065 264Z'/><path fill='#baa284' stroke='#baa284' stroke-width='.6' d='M1161 351L1156 372L1149 363ZM1088 325L1093 317L1104 331ZM1183 453L1189 451L1183 463ZM930 516L921 517L926 491ZM921 517L914 517L926 491ZM956 391L970 394L953 410ZM971 454L981 444L987 452Z'/><path fill='#7e786c' stroke='#7e786c' stroke-width='.6' d='M1123 304L1115 320L1108 298ZM1008 158L1018 157L1012 165Z'/><path fill='#6c604e' stroke='#6c604e' stroke-width='.6' d='M1113 291L1123 304L1108 298ZM1039 164L1040 165L1042 177ZM945 319L948 323L944 319Z'/><path fill='#66605a' stroke='#66605a' stroke-width='.6' d='M1133 306L1123 304L1137 296Z'/><path fill='#6c665a' stroke='#6c665a' stroke-width='.6' d='M1123 304L1113 291L1137 296Z'/><path fill='#ae967e' stroke='#ae967e' stroke-width='.6' d='M1139 265L1140 275L1125 274ZM1117 140L1104 134L1113 135ZM873 241L870 231L896 255ZM1128 435L1127 432L1145 437ZM1003 269L1004 280L988 287ZM891 301L919 331L873 324Z'/><path fill='#b49684' stroke='#b49684' stroke-width='.6' d='M1140 275L1139 265L1143 261ZM988 287L1009 287L999 301Z'/><path fill='#84725a' stroke='#84725a' stroke-width='.6' d='M1209 212L1200 229L1198 204ZM1206 251L1227 263L1200 259ZM965 246L966 247L967 251ZM974 258L963 266L967 251Z'/><path fill='#b4966c' stroke='#b4966c' stroke-width='.6' d='M303 823L283 800L318 808ZM815 410L822 363L832 417Z'/><path fill='#786648' stroke='#786648' stroke-width='.6' d='M78 491L75 520L65 507ZM1106 420L1113 428L1112 433ZM779 342L772 351L760 330ZM993 256L994 243L997 257Z'/><path fill='#5a4e36' stroke='#5a4e36' stroke-width='.6' d='M78 491L65 507L74 490ZM766 369L775 358L779 368Z'/><path fill='#1e1812' stroke='#1e1812' stroke-width='.6' d='M850 894L845 903L803 907Z'/><path fill='#9c7e54' stroke='#9c7e54' stroke-width='.6' d='M887 815L850 827L856 806ZM902 496L886 496L894 482Z'/><path fill='#9c724e' stroke='#9c724e' stroke-width='.6' d='M850 827L887 815L854 862ZM1144 407L1158 417L1150 434Z'/><path fill='#a87e60' stroke='#a87e60' stroke-width='.6' d='M405 869L391 852L435 835Z'/><path fill='#9c846c' stroke='#9c846c' stroke-width='.6' d='M324 654L316 656L308 628ZM1076 568L1065 553L1082 560ZM1157 215L1150 217L1145 199ZM777 295L794 290L787 298ZM1123 269L1122 267L1139 265ZM1157 215L1165 232L1155 234ZM956 391L954 392L943 385ZM1080 237L1106 232L1102 241ZM985 556L979 559L982 541ZM1066 261L1085 257L1074 272ZM951 279L950 282L943 284ZM1011 297L1018 297L1020 300ZM909 350L898 354L919 331Z'/><path fill='#a28454' stroke='#a28454' stroke-width='.6' d='M327 929L342 928L330 939Z'/><path fill='#a27e54' stroke='#a27e54' stroke-width='.6' d='M325 929L327 929L330 939ZM950 469L940 481L942 470Z'/><path fill='#1e1806' stroke='#1e1806' stroke-width='.6' d='M356 891L316 888L320 877Z'/><path fill='#b4a890' stroke='#b4a890' stroke-width='.6' d='M1096 117L1098 108L1101 104ZM1130 530L1148 531L1130 562Z'/><path fill='#a89678' stroke='#a89678' stroke-width='.6' d='M1096 117L1131 124L1113 135ZM1133 179L1114 196L1118 161ZM1006 379L1014 367L1019 385ZM1030 363L1040 359L1040 370ZM1159 201L1157 215L1145 199ZM1024 313L1042 313L1028 350Z'/><path fill='#ae9c8a' stroke='#ae9c8a' stroke-width='.6' d='M1131 124L1117 140L1113 135ZM1171 495L1181 485L1170 510ZM1167 498L1171 495L1170 510ZM1149 528L1148 531L1148 526ZM896 191L881 195L874 190Z'/><path fill='#aea296' stroke='#aea296' stroke-width='.6' d='M1143 131L1117 140L1131 124ZM1132 490L1119 491L1115 482ZM1148 319L1143 315L1162 314ZM745 208L761 202L754 234ZM941 377L942 374L946 373Z'/><path fill='#aeaea2' stroke='#aeaea2' stroke-width='.6' d='M1143 131L1131 124L1182 117Z'/><path fill='#b4b4ae' stroke='#b4b4ae' stroke-width='.6' d='M1179 131L1143 131L1182 117ZM1182 153L1143 131L1179 131ZM1182 153L1170 167L1143 131ZM937 334L949 327L946 342Z'/><path fill='#a89684' stroke='#a89684' stroke-width='.6' d='M1159 201L1145 199L1161 177ZM1115 251L1122 252L1115 258ZM1096 117L1094 117L1098 108ZM1103 262L1103 257L1115 258ZM957 337L951 319L974 311Z'/><path fill='#a29078' stroke='#a29078' stroke-width='.6' d='M1161 211L1159 201L1198 204ZM1146 340L1161 351L1149 363ZM1032 301L1042 313L1024 313ZM959 272L976 270L956 285ZM944 301L945 319L944 319ZM951 319L945 319L944 301ZM962 267L959 272L948 258Z'/><path fill='#b49c84' stroke='#b49c84' stroke-width='.6' d='M1159 201L1197 188L1198 204ZM794 290L793 300L787 298ZM969 566L964 571L962 565ZM1042 313L1061 312L1039 354ZM930 374L937 383L921 393Z'/><path fill='#ae9684' stroke='#ae9684' stroke-width='.6' d='M1197 188L1159 201L1185 177ZM1115 251L1106 245L1111 233ZM1167 277L1160 275L1165 260ZM985 556L990 552L1000 556Z'/><path fill='#a2967e' stroke='#a2967e' stroke-width='.6' d='M1145 199L1133 179L1161 177ZM1127 364L1146 340L1149 363Z'/><path fill='#b4a896' stroke='#b4a896' stroke-width='.6' d='M1143 131L1133 179L1118 161ZM1065 553L1091 556L1082 560Z'/><path fill='#ccae84' stroke='#ccae84' stroke-width='.6' d='M879 446L906 427L907 437Z'/><path fill='#c6a87e' stroke='#c6a87e' stroke-width='.6' d='M895 416L906 427L879 446ZM872 443L879 446L868 454ZM1033 480L1018 483L1021 472Z'/><path fill='#aea896' stroke='#aea896' stroke-width='.6' d='M1142 448L1115 448L1124 436ZM1164 317L1148 319L1162 314Z'/><path fill='#c6c0b4' stroke='#c6c0b4' stroke-width='.6' d='M1115 448L1142 448L1125 467ZM1067 516L1059 478L1082 512ZM1132 490L1155 466L1148 497ZM1015 536L1013 534L1025 531ZM1030 541L1015 536L1025 531ZM1048 544L1062 530L1057 550Z'/><path fill='#a29c90' stroke='#a29c90' stroke-width='.6' d='M1119 491L1110 524L1105 500ZM946 373L957 365L965 369Z'/><path fill='#c0b4a8' stroke='#c0b4a8' stroke-width='.6' d='M1119 491L1130 530L1110 524ZM1220 230L1209 212L1215 200ZM1086 478L1091 489L1059 478ZM1015 536L1015 562L1000 556ZM843 317L830 297L857 316ZM840 195L851 193L851 228ZM822 174L842 194L840 195ZM942 374L944 370L946 373ZM943 176L930 178L960 165Z'/><path fill='#c6b49c' stroke='#c6b49c' stroke-width='.6' d='M1155 466L1150 458L1153 456ZM1171 495L1167 498L1155 466ZM1069 460L1059 478L1055 458ZM951 319L974 302L974 311Z'/><path fill='#d2c0b4' stroke='#d2c0b4' stroke-width='.6' d='M1150 458L1155 466L1125 467Z'/><path fill='#c0a890' stroke='#c0a890' stroke-width='.6' d='M1150 458L1142 448L1153 456ZM1178 332L1171 316L1185 319ZM962 461L971 454L975 477Z'/><path fill='#c0ae96' stroke='#c0ae96' stroke-width='.6' d='M1155 466L1183 463L1181 485ZM787 277L799 288L794 290ZM860 315L864 322L857 316ZM867 308L860 315L857 316ZM843 317L835 342L827 325Z'/><path fill='#d2c6ba' stroke='#d2c6ba' stroke-width='.6' d='M1059 478L1067 516L1048 486ZM1067 516L1032 501L1048 486ZM990 552L982 541L1003 536ZM982 541L985 527L1003 536ZM964 505L960 482L975 477ZM980 507L984 511L975 534Z'/><path fill='#605a48' stroke='#605a48' stroke-width='.6' d='M1108 481L1119 491L1105 500ZM1146 340L1127 364L1128 340Z'/><path fill='#908478' stroke='#908478' stroke-width='.6' d='M1119 491L1108 481L1115 482ZM1128 340L1121 340L1115 320Z'/><path fill='#8a8a78' stroke='#8a8a78' stroke-width='.6' d='M1091 489L1102 503L1082 512Z'/><path fill='#5a5442' stroke='#5a5442' stroke-width='.6' d='M1102 503L1091 489L1105 500Z'/><path fill='#bab4a2' stroke='#bab4a2' stroke-width='.6' d='M1059 478L1091 489L1082 512ZM1161 177L1170 167L1185 177Z'/><path fill='#4e362a' stroke='#4e362a' stroke-width='.6' d='M1080 451L1069 433L1081 446ZM918 536L913 541L912 535ZM839 480L824 487L823 482Z'/><path fill='#ae8a60' stroke='#ae8a60' stroke-width='.6' d='M1026 464L1009 457L1024 431Z'/><path fill='#c6a27e' stroke='#c6a27e' stroke-width='.6' d='M1026 464L1044 451L1047 467Z'/><path fill='#ccb49c' stroke='#ccb49c' stroke-width='.6' d='M1042 475L1059 478L1048 486ZM1024 507L1013 518L1011 492Z'/><path fill='#d2ba9c' stroke='#d2ba9c' stroke-width='.6' d='M1042 475L1047 467L1059 478Z'/><path fill='#c0a278' stroke='#c0a278' stroke-width='.6' d='M1042 475L1026 464L1047 467ZM931 438L922 445L907 437Z'/><path fill='#ae9078' stroke='#ae9078' stroke-width='.6' d='M1103 288L1091 297L1088 271ZM1019 385L1030 363L1040 370ZM1093 317L1086 316L1096 313ZM923 521L921 517L930 516Z'/><path fill='#c6b490' stroke='#c6b490' stroke-width='.6' d='M1092 305L1091 297L1108 298Z'/><path fill='#c6ae96' stroke='#c6ae96' stroke-width='.6' d='M1091 297L1103 288L1108 298ZM1093 317L1096 313L1104 331ZM946 521L934 516L945 490ZM1128 435L1145 437L1142 448Z'/><path fill='#baa290' stroke='#baa290' stroke-width='.6' d='M1116 277L1123 269L1125 274Z'/><path fill='#a8907e' stroke='#a8907e' stroke-width='.6' d='M1121 266L1123 269L1116 277ZM1122 252L1121 266L1115 258ZM1160 275L1140 275L1143 261ZM1014 245L1015 256L1010 252ZM837 165L842 194L831 166Z'/><path fill='#ae907e' stroke='#ae907e' stroke-width='.6' d='M1123 269L1139 265L1125 274Z'/><path fill='#ba9c78' stroke='#ba9c78' stroke-width='.6' d='M872 443L868 454L857 447ZM868 454L870 478L864 477ZM1185 319L1184 303L1194 301ZM940 413L938 420L930 423Z'/><path fill='#ae9066' stroke='#ae9066' stroke-width='.6' d='M885 471L870 478L868 454ZM800 335L796 329L805 334Z'/><path fill='#724e2a' stroke='#724e2a' stroke-width='.6' d='M885 471L901 451L898 477Z'/><path fill='#a89072' stroke='#a89072' stroke-width='.6' d='M1086 258L1088 271L1074 272ZM796 329L781 310L794 313ZM835 342L864 322L860 350ZM794 313L795 309L812 304ZM793 300L791 307L787 298ZM1005 473L1008 470L1018 483ZM979 559L965 559L982 541ZM979 559L969 566L965 559ZM981 444L971 454L966 443ZM987 469L971 454L987 452ZM985 556L985 565L979 559Z'/><path fill='#7e7260' stroke='#7e7260' stroke-width='.6' d='M1115 320L1121 340L1104 331ZM976 176L960 170L960 165ZM837 165L833 159L842 165ZM947 182L932 186L943 176Z'/><path fill='#ae9c7e' stroke='#ae9c7e' stroke-width='.6' d='M1040 359L1039 354L1064 356ZM972 294L944 301L956 285Z'/><path fill='#d2b4a2' stroke='#d2b4a2' stroke-width='.6' d='M1014 367L1030 363L1019 385Z'/><path fill='#a8967e' stroke='#a8967e' stroke-width='.6' d='M1039 354L1030 363L1028 350ZM777 295L787 277L794 290ZM970 394L956 391L965 389Z'/><path fill='#ccc6ba' stroke='#ccc6ba' stroke-width='.6' d='M1091 556L1065 553L1062 530Z'/><path fill='#ccccc0' stroke='#ccccc0' stroke-width='.6' d='M1100 547L1091 556L1062 530Z'/><path fill='#baaea2' stroke='#baaea2' stroke-width='.6' d='M1154 519L1148 526L1148 497ZM1132 490L1115 482L1125 467ZM985 354L962 348L982 316ZM1191 177L1183 153L1196 175Z'/><path fill='#c0b49c' stroke='#c0b49c' stroke-width='.6' d='M1171 495L1155 466L1181 485ZM980 507L984 478L1011 492Z'/><path fill='#60483c' stroke='#60483c' stroke-width='.6' d='M907 566L902 565L901 561ZM823 482L824 487L820 485ZM979 387L977 388L980 379Z'/><path fill='#5a483c' stroke='#5a483c' stroke-width='.6' d='M906 552L907 566L901 561ZM183 413L167 429L152 427ZM1064 262L1047 251L1051 249ZM922 550L920 551L918 547ZM934 374L938 375L937 383Z'/><path fill='#6c4830' stroke='#6c4830' stroke-width='.6' d='M908 751L886 742L903 703ZM908 751L903 783L891 781ZM1097 143L1091 154L1092 142Z'/><path fill='#9c8454' stroke='#9c8454' stroke-width='.6' d='M902 496L894 482L898 477Z'/><path fill='#96907e' stroke='#96907e' stroke-width='.6' d='M1146 340L1148 319L1153 339ZM997 348L985 354L982 316ZM1143 317L1146 340L1128 340ZM946 373L965 369L956 391Z'/><path fill='#423c2a' stroke='#423c2a' stroke-width='.6' d='M1163 302L1158 292L1163 281ZM1158 292L1150 287L1163 281ZM1001 184L1003 188L995 197Z'/><path fill='#9c9c90' stroke='#9c9c90' stroke-width='.6' d='M1115 320L1124 309L1133 312ZM957 365L944 370L957 349Z'/><path fill='#48423c' stroke='#48423c' stroke-width='.6' d='M1124 309L1133 306L1133 312Z'/><path fill='#6c6660' stroke='#6c6660' stroke-width='.6' d='M1124 309L1123 304L1133 306Z'/><path fill='#6c4e3c' stroke='#6c4e3c' stroke-width='.6' d='M1129 249L1117 230L1131 231ZM884 525L886 527L881 527Z'/><path fill='#8a7260' stroke='#8a7260' stroke-width='.6' d='M1117 230L1115 251L1111 233ZM1066 261L1064 253L1085 257ZM1005 473L990 470L1004 471ZM982 255L974 258L967 251Z'/><path fill='#786654' stroke='#786654' stroke-width='.6' d='M1117 230L1122 252L1115 251ZM884 540L891 540L890 542ZM1015 562L1032 562L1029 569ZM974 586L964 571L980 580ZM886 527L883 531L881 527ZM1015 256L1028 265L1021 269ZM1017 277L1021 269L1030 280ZM833 159L837 165L831 166ZM1032 284L1029 299L1018 297ZM1042 240L1052 243L1047 251Z'/><path fill='#725a36' stroke='#725a36' stroke-width='.6' d='M1194 301L1198 297L1205 309Z'/><path fill='#72664e' stroke='#72664e' stroke-width='.6' d='M1176 309L1171 316L1172 312ZM1031 282L1032 284L1017 279Z'/><path fill='#968a72' stroke='#968a72' stroke-width='.6' d='M1171 316L1178 332L1168 326ZM1220 230L1206 251L1200 229ZM999 385L998 388L992 375Z'/><path fill='#9c9078' stroke='#9c9078' stroke-width='.6' d='M1168 326L1178 332L1158 342Z'/><path fill='#c0a88a' stroke='#c0a88a' stroke-width='.6' d='M1184 303L1185 319L1176 309ZM934 516L926 491L945 490ZM934 516L930 516L926 491ZM953 525L951 531L949 526Z'/><path fill='#544e36' stroke='#544e36' stroke-width='.6' d='M1184 303L1163 302L1163 281Z'/><path fill='#babab4' stroke='#babab4' stroke-width='.6' d='M797 155L791 183L769 146ZM803 168L795 180L797 155ZM803 168L822 174L795 180Z'/><path fill='#c0baba' stroke='#c0baba' stroke-width='.6' d='M791 183L778 191L769 146ZM791 183L791 220L778 191ZM811 256L851 228L837 259Z'/><path fill='#a27854' stroke='#a27854' stroke-width='.6' d='M850 827L843 854L828 848Z'/><path fill='#30240c' stroke='#30240c' stroke-width='.6' d='M741 558L753 574L728 571Z'/><path fill='#5a4224' stroke='#5a4224' stroke-width='.6' d='M726 511L741 501L746 510Z'/><path fill='#482a18' stroke='#482a18' stroke-width='.6' d='M799 819L789 811L808 801Z'/><path fill='#baa89c' stroke='#baa89c' stroke-width='.6' d='M1098 108L1094 117L1093 117Z'/><path fill='#30180c' stroke='#30180c' stroke-width='.6' d='M1115 448L1105 443L1112 438ZM1123 364L1127 366L1123 374ZM1008 281L1013 274L1017 279Z'/><path fill='#a87e54' stroke='#a87e54' stroke-width='.6' d='M1105 443L1096 447L1096 421ZM886 452L901 451L885 471Z'/><path fill='#ccc0ba' stroke='#ccc0ba' stroke-width='.6' d='M1155 466L1132 490L1125 467ZM1015 536L1030 541L1029 550ZM1048 544L1030 541L1025 531Z'/><path fill='#a8a29c' stroke='#a8a29c' stroke-width='.6' d='M1130 530L1132 490L1148 497ZM1158 292L1143 315L1137 296Z'/><path fill='#a8a296' stroke='#a8a296' stroke-width='.6' d='M1119 491L1132 490L1130 530Z'/><path fill='#36241e' stroke='#36241e' stroke-width='.6' d='M1069 460L1069 433L1080 451Z'/><path fill='#c0b4ae' stroke='#c0b4ae' stroke-width='.6' d='M1069 460L1083 467L1059 478ZM1015 536L1003 536L1013 534ZM870 231L859 243L851 228ZM1183 153L1182 153L1179 131ZM1183 153L1191 177L1185 177Z'/><path fill='#6c6654' stroke='#6c6654' stroke-width='.6' d='M1092 477L1083 467L1099 476ZM948 323L949 325L949 327Z'/><path fill='#484230' stroke='#484230' stroke-width='.6' d='M1092 488L1108 481L1105 500ZM1000 354L996 350L997 348Z'/><path fill='#726c5a' stroke='#726c5a' stroke-width='.6' d='M1091 489L1092 488L1105 500Z'/><path fill='#908472' stroke='#908472' stroke-width='.6' d='M1092 488L1092 477L1099 476Z'/><path fill='#a8a290' stroke='#a8a290' stroke-width='.6' d='M1086 478L1092 488L1091 489ZM962 348L957 337L982 316ZM960 170L953 174L960 165Z'/><path fill='#96784e' stroke='#96784e' stroke-width='.6' d='M1077 430L1096 447L1081 446Z'/><path fill='#c09c7e' stroke='#c09c7e' stroke-width='.6' d='M1047 467L1047 451L1055 458Z'/><path fill='#7e6036' stroke='#7e6036' stroke-width='.6' d='M1012 464L1026 464L1021 467Z'/><path fill='#ccba9c' stroke='#ccba9c' stroke-width='.6' d='M1032 501L1037 489L1048 486ZM984 478L1005 473L1011 492Z'/><path fill='#d2c0ba' stroke='#d2c0ba' stroke-width='.6' d='M1032 501L1067 516L1027 517ZM985 527L982 541L975 534Z'/><path fill='#ccae96' stroke='#ccae96' stroke-width='.6' d='M1037 489L1032 501L1036 487ZM951 531L953 525L955 526Z'/><path fill='#c6ae90' stroke='#c6ae90' stroke-width='.6' d='M1037 483L1042 475L1048 486ZM956 456L962 461L952 465Z'/><path fill='#c0ae90' stroke='#c0ae90' stroke-width='.6' d='M1037 489L1037 483L1048 486ZM1139 369L1127 364L1149 363Z'/><path fill='#baa27e' stroke='#baa27e' stroke-width='.6' d='M1037 483L1037 489L1036 487ZM835 342L814 343L827 325ZM1033 480L1037 483L1036 487ZM827 325L812 341L805 334Z'/><path fill='#301812' stroke='#301812' stroke-width='.6' d='M1123 361L1123 364L1115 362Z'/><path fill='#2a1812' stroke='#2a1812' stroke-width='.6' d='M760 419L753 451L722 419Z'/><path fill='#422a12' stroke='#422a12' stroke-width='.6' d='M860 486L863 486L855 496ZM758 565L741 558L744 554Z'/><path fill='#5a3c12' stroke='#5a3c12' stroke-width='.6' d='M886 475L885 471L898 477Z'/><path fill='#664e24' stroke='#664e24' stroke-width='.6' d='M894 482L886 475L898 477Z'/><path fill='#3c1e0c' stroke='#3c1e0c' stroke-width='.6' d='M863 486L878 481L874 502Z'/><path fill='#4e3018' stroke='#4e3018' stroke-width='.6' d='M878 481L886 496L874 502Z'/><path fill='#66421e' stroke='#66421e' stroke-width='.6' d='M878 481L870 478L885 471Z'/><path fill='#603c18' stroke='#603c18' stroke-width='.6' d='M886 475L878 481L885 471Z'/><path fill='#6c4824' stroke='#6c4824' stroke-width='.6' d='M878 481L886 475L894 482Z'/><path fill='#d2ae8a' stroke='#d2ae8a' stroke-width='.6' d='M879 446L886 452L868 454Z'/><path fill='#c6a278' stroke='#c6a278' stroke-width='.6' d='M886 452L885 471L868 454Z'/><path fill='#d2a884' stroke='#d2a884' stroke-width='.6' d='M886 452L879 446L907 437Z'/><path fill='#c69c72' stroke='#c69c72' stroke-width='.6' d='M901 451L886 452L907 437Z'/><path fill='#4e3012' stroke='#4e3012' stroke-width='.6' d='M913 450L922 445L928 464Z'/><path fill='#60543c' stroke='#60543c' stroke-width='.6' d='M1059 271L1056 279L1046 269ZM1086 452L1093 454L1083 467Z'/><path fill='#8a6c42' stroke='#8a6c42' stroke-width='.6' d='M953 410L969 417L955 415Z'/><path fill='#ccbaa2' stroke='#ccbaa2' stroke-width='.6' d='M997 348L1008 315L1028 350ZM1026 504L1032 501L1027 517ZM1024 507L1026 504L1027 517Z'/><path fill='#c6b4a2' stroke='#c6b4a2' stroke-width='.6' d='M1008 315L997 348L982 316ZM1011 492L1013 518L984 511ZM864 322L843 317L857 316ZM964 505L953 525L946 521ZM957 337L974 311L982 316ZM970 394L977 388L980 401Z'/><path fill='#ccb4a2' stroke='#ccb4a2' stroke-width='.6' d='M1014 367L1000 354L1028 350Z'/><path fill='#c0b4a2' stroke='#c0b4a2' stroke-width='.6' d='M1000 354L997 348L1028 350ZM1091 556L1097 554L1100 557ZM809 265L784 261L808 260ZM809 265L787 277L784 261ZM859 243L870 231L873 241Z'/><path fill='#baae9c' stroke='#baae9c' stroke-width='.6' d='M1148 526L1148 531L1130 530ZM809 265L830 297L803 279ZM1048 544L1032 562L1029 550ZM870 231L851 228L870 225ZM803 168L797 155L802 146ZM977 388L979 387L980 401Z'/><path fill='#a89672' stroke='#a89672' stroke-width='.6' d='M1148 531L1150 560L1130 562Z'/><path fill='#b49c7e' stroke='#b49c7e' stroke-width='.6' d='M965 559L969 566L962 565ZM953 525L949 526L946 521ZM1088 271L1074 283L1074 272ZM1188 424L1178 441L1181 428ZM793 339L788 335L796 329ZM779 342L788 335L786 339ZM1003 269L979 268L994 261ZM986 255L993 256L994 261Z'/><path fill='#54362a' stroke='#54362a' stroke-width='.6' d='M940 578L936 575L941 571ZM943 578L940 578L941 571Z'/><path fill='#a29684' stroke='#a29684' stroke-width='.6' d='M1032 562L1015 562L1029 550ZM930 181L932 186L907 189Z'/><path fill='#c6b4a8' stroke='#c6b4a8' stroke-width='.6' d='M990 552L1003 536L1000 556ZM881 195L896 191L896 191Z'/><path fill='#482a1e' stroke='#482a1e' stroke-width='.6' d='M955 567L955 570L941 571Z'/><path fill='#785448' stroke='#785448' stroke-width='.6' d='M955 570L955 567L962 565Z'/><path fill='#604824' stroke='#604824' stroke-width='.6' d='M922 445L937 445L928 464Z'/><path fill='#9c7860' stroke='#9c7860' stroke-width='.6' d='M1000 451L991 440L1002 447Z'/><path fill='#ae9678' stroke='#ae9678' stroke-width='.6' d='M987 452L981 444L991 440ZM775 358L779 342L793 345ZM977 568L985 565L980 580ZM979 559L985 565L977 568ZM979 268L986 255L994 261Z'/><path fill='#8a6654' stroke='#8a6654' stroke-width='.6' d='M955 567L960 559L962 565Z'/><path fill='#8a847e' stroke='#8a847e' stroke-width='.6' d='M1143 315L1133 306L1137 296Z'/><path fill='#726c66' stroke='#726c66' stroke-width='.6' d='M1133 306L1143 315L1133 312Z'/><path fill='#9c9684' stroke='#9c9684' stroke-width='.6' d='M1227 263L1206 251L1220 230Z'/><path fill='#4e422a' stroke='#4e422a' stroke-width='.6' d='M130 401L142 441L98 426Z'/><path fill='#ae9c78' stroke='#ae9c78' stroke-width='.6' d='M812 304L827 325L805 334Z'/><path fill='#aea284' stroke='#aea284' stroke-width='.6' d='M812 304L799 288L803 279Z'/><path fill='#968460' stroke='#968460' stroke-width='.6' d='M891 301L932 294L932 299Z'/><path fill='#a89c84' stroke='#a89c84' stroke-width='.6' d='M830 297L812 304L803 279Z'/><path fill='#301e06' stroke='#301e06' stroke-width='.6' d='M654 689L638 681L645 669Z'/><path fill='#301e18' stroke='#301e18' stroke-width='.6' d='M763 580L776 556L792 572ZM1086 452L1079 461L1080 451Z'/><path fill='#a89c96' stroke='#a89c96' stroke-width='.6' d='M1061 156L1040 165L1050 148Z'/><path fill='#babaae' stroke='#babaae' stroke-width='.6' d='M1170 167L1182 153L1185 177Z'/><path fill='#483c36' stroke='#483c36' stroke-width='.6' d='M1106 478L1108 481L1099 476ZM1108 464L1108 476L1099 476ZM1079 461L1086 452L1083 467Z'/><path fill='#ba9c84' stroke='#ba9c84' stroke-width='.6' d='M1176 452L1155 466L1153 456ZM1165 260L1160 275L1143 261ZM788 335L781 310L796 329ZM887 265L873 241L896 255Z'/><path fill='#c6ae8a' stroke='#c6ae8a' stroke-width='.6' d='M1176 452L1183 463L1155 466ZM1037 483L1033 480L1042 475Z'/><path fill='#b4a290' stroke='#b4a290' stroke-width='.6' d='M1128 435L1142 448L1124 436ZM905 189L907 189L902 196ZM1149 528L1154 519L1170 510ZM881 195L896 191L902 196ZM900 190L905 189L902 196Z'/><path fill='#c6a890' stroke='#c6a890' stroke-width='.6' d='M1142 448L1150 443L1153 456ZM1005 409L980 401L998 388Z'/><path fill='#ba9c7e' stroke='#ba9c7e' stroke-width='.6' d='M1145 437L1150 443L1142 448ZM1150 443L1158 439L1153 456ZM1178 441L1188 424L1189 451ZM970 394L980 401L969 417ZM786 339L793 339L793 345ZM905 365L924 372L900 387ZM1011 297L1018 312L1008 315ZM896 370L904 365L900 387ZM904 365L905 365L900 387Z'/><path fill='#cca87e' stroke='#cca87e' stroke-width='.6' d='M1026 464L1042 443L1044 451Z'/><path fill='#c09c72' stroke='#c09c72' stroke-width='.6' d='M1042 443L1026 464L1024 431Z'/><path fill='#ccbaae' stroke='#ccbaae' stroke-width='.6' d='M1025 531L1013 518L1027 517ZM985 527L1013 518L1003 536Z'/><path fill='#c6b4ae' stroke='#c6b4ae' stroke-width='.6' d='M1003 536L1013 518L1013 534Z'/><path fill='#c0a284' stroke='#c0a284' stroke-width='.6' d='M1156 372L1139 369L1149 363Z'/><path fill='#ba9c72' stroke='#ba9c72' stroke-width='.6' d='M804 399L822 363L815 410Z'/><path fill='#3c241e' stroke='#3c241e' stroke-width='.6' d='M824 478L823 482L812 481ZM924 559L924 556L932 555Z'/><path fill='#4e3024' stroke='#4e3024' stroke-width='.6' d='M839 480L824 478L839 476Z'/><path fill='#ba966c' stroke='#ba966c' stroke-width='.6' d='M912 449L901 451L907 437Z'/><path fill='#906c42' stroke='#906c42' stroke-width='.6' d='M912 449L913 450L901 451Z'/><path fill='#7e7266' stroke='#7e7266' stroke-width='.6' d='M990 158L976 176L960 165Z'/><path fill='#9ca29c' stroke='#9ca29c' stroke-width='.6' d='M1008 158L990 158L1020 150Z'/><path fill='#9c8472' stroke='#9c8472' stroke-width='.6' d='M1106 245L1106 235L1111 233ZM1008 281L1007 282L1004 280Z'/><path fill='#ae9672' stroke='#ae9672' stroke-width='.6' d='M1091 297L1074 283L1088 271Z'/><path fill='#664224' stroke='#664224' stroke-width='.6' d='M1007 419L1005 409L1008 409Z'/><path fill='#604e42' stroke='#604e42' stroke-width='.6' d='M924 556L924 559L916 560ZM924 556L928 549L932 555ZM938 375L941 377L937 383Z'/><path fill='#6c5a4e' stroke='#6c5a4e' stroke-width='.6' d='M913 541L922 543L918 547ZM993 358L1000 354L1014 367ZM938 374L938 375L934 374Z'/><path fill='#a28478' stroke='#a28478' stroke-width='.6' d='M931 547L928 549L928 543Z'/><path fill='#8a6c60' stroke='#8a6c60' stroke-width='.6' d='M928 549L931 547L932 555Z'/><path fill='#9c7e72' stroke='#9c7e72' stroke-width='.6' d='M964 571L955 570L962 565Z'/><path fill='#8a786c' stroke='#8a786c' stroke-width='.6' d='M955 570L964 571L957 584Z'/><path fill='#785430' stroke='#785430' stroke-width='.6' d='M888 508L900 500L892 510Z'/><path fill='#3c1e06' stroke='#3c1e06' stroke-width='.6' d='M912 469L913 450L928 464Z'/><path fill='#5a361e' stroke='#5a361e' stroke-width='.6' d='M901 451L912 469L898 477ZM912 469L918 471L898 477Z'/><path fill='#c0a884' stroke='#c0a884' stroke-width='.6' d='M951 541L955 526L975 534ZM1176 452L1183 453L1183 463ZM1018 483L1026 504L1011 492Z'/><path fill='#787266' stroke='#787266' stroke-width='.6' d='M1163 302L1165 314L1162 314Z'/><path fill='#969084' stroke='#969084' stroke-width='.6' d='M1143 317L1143 315L1148 319ZM937 334L925 340L932 333Z'/><path fill='#9c968a' stroke='#9c968a' stroke-width='.6' d='M1143 317L1148 319L1146 340Z'/><path fill='#666054' stroke='#666054' stroke-width='.6' d='M1143 317L1128 340L1133 312ZM944 319L937 334L932 333Z'/><path fill='#a8906c' stroke='#a8906c' stroke-width='.6' d='M835 342L860 350L831 351ZM808 408L802 404L804 399ZM807 422L808 408L815 410ZM890 354L882 361L860 350ZM898 366L904 365L896 370ZM904 365L898 354L905 365Z'/><path fill='#c0c0ba' stroke='#c0c0ba' stroke-width='.6' d='M795 180L791 220L791 183ZM791 220L788 237L787 223ZM811 256L791 220L851 228ZM788 237L811 256L808 260ZM840 195L791 220L795 180ZM791 220L840 195L851 228ZM924 342L946 342L930 364Z'/><path fill='#b4ae9c' stroke='#b4ae9c' stroke-width='.6' d='M763 242L788 237L784 261Z'/><path fill='#c0c0b4' stroke='#c0c0b4' stroke-width='.6' d='M784 261L788 237L808 260Z'/><path fill='#9c9084' stroke='#9c9084' stroke-width='.6' d='M745 208L754 234L740 230Z'/><path fill='#c0c0c0' stroke='#c0c0c0' stroke-width='.6' d='M811 256L788 237L791 220Z'/><path fill='#b4a284' stroke='#b4a284' stroke-width='.6' d='M864 322L860 315L872 315ZM860 315L867 308L872 315Z'/><path fill='#aeaeae' stroke='#aeaeae' stroke-width='.6' d='M1039 164L1030 151L1050 148Z'/><path fill='#908a84' stroke='#908a84' stroke-width='.6' d='M1040 165L1039 164L1050 148Z'/><path fill='#544836' stroke='#544836' stroke-width='.6' d='M1012 165L1039 164L1042 177ZM1000 177L1008 158L1012 165ZM1000 177L993 159L1008 158ZM949 325L948 323L951 319Z'/><path fill='#c0b4b4' stroke='#c0b4b4' stroke-width='.6' d='M1182 153L1183 153L1185 177Z'/><path fill='#7e7872' stroke='#7e7872' stroke-width='.6' d='M1069 460L1079 461L1083 467ZM957 337L957 349L946 342Z'/><path fill='#6c4e2a' stroke='#6c4e2a' stroke-width='.6' d='M1098 448L1093 454L1096 447Z'/><path fill='#a8a8a2' stroke='#a8a8a2' stroke-width='.6' d='M1112 460L1115 448L1125 467ZM1110 464L1112 460L1125 467Z'/><path fill='#42302a' stroke='#42302a' stroke-width='.6' d='M1115 448L1112 460L1101 448ZM918 547L920 551L914 555Z'/><path fill='#362a24' stroke='#362a24' stroke-width='.6' d='M1112 460L1108 464L1101 448Z'/><path fill='#aea8a2' stroke='#aea8a2' stroke-width='.6' d='M1108 476L1110 464L1125 467ZM745 208L738 197L761 202Z'/><path fill='#ccbaa8' stroke='#ccbaa8' stroke-width='.6' d='M1013 518L1024 507L1027 517ZM980 401L979 387L998 388ZM980 507L1011 492L984 511Z'/><path fill='#ccae90' stroke='#ccae90' stroke-width='.6' d='M1005 473L1018 483L1011 492Z'/><path fill='#c0a87e' stroke='#c0a87e' stroke-width='.6' d='M1042 475L1033 480L1026 464Z'/><path fill='#b49c78' stroke='#b49c78' stroke-width='.6' d='M796 378L822 363L804 399ZM797 351L775 358L793 345ZM800 335L793 339L796 329ZM960 482L940 481L950 469ZM898 354L890 354L873 324Z'/><path fill='#605448' stroke='#605448' stroke-width='.6' d='M956 391L965 369L965 389ZM982 373L989 362L992 375ZM948 323L937 334L944 319Z'/><path fill='#a2a296' stroke='#a2a296' stroke-width='.6' d='M985 354L965 369L962 348Z'/><path fill='#603c24' stroke='#603c24' stroke-width='.6' d='M1005 409L1015 403L1008 409Z'/><path fill='#483630' stroke='#483630' stroke-width='.6' d='M883 538L883 531L891 540Z'/><path fill='#4e2a18' stroke='#4e2a18' stroke-width='.6' d='M918 471L912 469L928 464Z'/><path fill='#b4967e' stroke='#b4967e' stroke-width='.6' d='M1164 258L1165 260L1143 261ZM1178 441L1180 427L1181 428Z'/><path fill='#a29c8a' stroke='#a29c8a' stroke-width='.6' d='M761 202L738 197L747 185Z'/><path fill='#c6c0c0' stroke='#c6c0c0' stroke-width='.6' d='M738 197L745 208L740 230Z'/><path fill='#8a7e72' stroke='#8a7e72' stroke-width='.6' d='M738 197L737 163L739 166ZM949 325L951 319L957 337Z'/><path fill='#8a8478' stroke='#8a8478' stroke-width='.6' d='M747 185L738 197L739 166ZM993 355L993 358L985 354Z'/><path fill='#c0aea2' stroke='#c0aea2' stroke-width='.6' d='M887 265L867 308L837 259ZM887 265L859 243L873 241ZM851 228L851 193L870 225Z'/><path fill='#969690' stroke='#969690' stroke-width='.6' d='M1039 164L1018 157L1030 151Z'/><path fill='#6c6054' stroke='#6c6054' stroke-width='.6' d='M1018 157L1039 164L1012 165Z'/><path fill='#b4bab4' stroke='#b4bab4' stroke-width='.6' d='M1030 151L1018 157L1020 150Z'/><path fill='#a2a29c' stroke='#a2a29c' stroke-width='.6' d='M1018 157L1008 158L1020 150Z'/><path fill='#a2845a' stroke='#a2845a' stroke-width='.6' d='M921 393L937 383L929 404ZM812 341L797 351L800 335Z'/><path fill='#906c54' stroke='#906c54' stroke-width='.6' d='M879 402L899 404L883 411Z'/><path fill='#665a5a' stroke='#665a5a' stroke-width='.6' d='M1108 464L1109 464L1108 476Z'/><path fill='#786c66' stroke='#786c66' stroke-width='.6' d='M1109 464L1110 464L1108 476Z'/><path fill='#423c36' stroke='#423c36' stroke-width='.6' d='M1112 460L1109 464L1108 464Z'/><path fill='#544e4e' stroke='#544e4e' stroke-width='.6' d='M1110 464L1109 464L1112 460Z'/><path fill='#c6a88a' stroke='#c6a88a' stroke-width='.6' d='M1026 504L1018 483L1032 501ZM999 301L1011 297L1008 315Z'/><path fill='#ccc0a8' stroke='#ccc0a8' stroke-width='.6' d='M964 505L946 521L945 490Z'/><path fill='#d2c6b4' stroke='#d2c6b4' stroke-width='.6' d='M955 526L964 505L975 534Z'/><path fill='#b49c72' stroke='#b49c72' stroke-width='.6' d='M808 408L804 399L815 410Z'/><path fill='#a2968a' stroke='#a2968a' stroke-width='.6' d='M965 369L982 373L980 379Z'/><path fill='#66604e' stroke='#66604e' stroke-width='.6' d='M996 350L985 354L997 348Z'/><path fill='#7e7866' stroke='#7e7866' stroke-width='.6' d='M996 350L993 355L985 354Z'/><path fill='#908a7e' stroke='#908a7e' stroke-width='.6' d='M993 358L989 362L985 354ZM948 323L949 327L937 334ZM924 361L924 342L930 364Z'/><path fill='#90786c' stroke='#90786c' stroke-width='.6' d='M860 175L860 178L855 187Z'/><path fill='#d8d2c6' stroke='#d8d2c6' stroke-width='.6' d='M900 190L896 191L860 175Z'/><path fill='#2a1206' stroke='#2a1206' stroke-width='.6' d='M1059 271L1064 262L1065 264Z'/><path fill='#72665a' stroke='#72665a' stroke-width='.6' d='M993 159L976 176L990 158Z'/><path fill='#909084' stroke='#909084' stroke-width='.6' d='M1008 158L993 159L990 158Z'/><path fill='#90846c' stroke='#90846c' stroke-width='.6' d='M998 388L979 387L992 375Z'/><path fill='#605442' stroke='#605442' stroke-width='.6' d='M1053 297L1032 284L1043 278Z'/><path fill='#8a7266' stroke='#8a7266' stroke-width='.6' d='M923 549L928 549L924 556ZM928 549L923 549L928 543Z'/><path fill='#846c66' stroke='#846c66' stroke-width='.6' d='M922 550L923 549L924 556Z'/><path fill='#6c5448' stroke='#6c5448' stroke-width='.6' d='M923 549L922 543L928 543ZM937 383L941 377L943 385Z'/><path fill='#7e6660' stroke='#7e6660' stroke-width='.6' d='M920 551L922 550L924 556Z'/><path fill='#604e48' stroke='#604e48' stroke-width='.6' d='M920 551L916 560L914 555Z'/><path fill='#847266' stroke='#847266' stroke-width='.6' d='M920 551L924 556L916 560Z'/><path fill='#603c2a' stroke='#603c2a' stroke-width='.6' d='M921 471L918 471L928 464Z'/><path fill='#96725a' stroke='#96725a' stroke-width='.6' d='M941 529L940 534L940 529Z'/><path fill='#baa884' stroke='#baa884' stroke-width='.6' d='M779 342L786 339L793 345Z'/><path fill='#a28a78' stroke='#a28a78' stroke-width='.6' d='M831 166L822 174L830 158Z'/><path fill='#9c8460' stroke='#9c8460' stroke-width='.6' d='M890 354L860 350L873 324Z'/><path fill='#ccb496' stroke='#ccb496' stroke-width='.6' d='M940 481L960 482L945 490Z'/><path fill='#c0a28a' stroke='#c0a28a' stroke-width='.6' d='M960 482L950 469L952 465ZM1009 287L1011 297L999 301Z'/><path fill='#d2baa2' stroke='#d2baa2' stroke-width='.6' d='M962 461L960 482L952 465Z'/><path fill='#d2c6c0' stroke='#d2c6c0' stroke-width='.6' d='M980 507L964 505L975 477Z'/><path fill='#d2ccc0' stroke='#d2ccc0' stroke-width='.6' d='M964 505L980 507L975 534Z'/><path fill='#baa88a' stroke='#baa88a' stroke-width='.6' d='M971 454L987 469L975 477Z'/><path fill='#a8a89c' stroke='#a8a89c' stroke-width='.6' d='M949 327L957 337L946 342Z'/><path fill='#5a544e' stroke='#5a544e' stroke-width='.6' d='M960 349L957 337L962 348Z'/><path fill='#544e48' stroke='#544e48' stroke-width='.6' d='M960 349L957 349L957 337Z'/><path fill='#54544e' stroke='#54544e' stroke-width='.6' d='M957 365L960 349L962 348Z'/><path fill='#847860' stroke='#847860' stroke-width='.6' d='M1029 299L1032 284L1032 301Z'/><path fill='#8a785a' stroke='#8a785a' stroke-width='.6' d='M772 351L779 342L775 358Z'/><path fill='#5a4842' stroke='#5a4842' stroke-width='.6' d='M925 340L919 331L932 333Z'/><path fill='#967e6c' stroke='#967e6c' stroke-width='.6' d='M959 272L942 273L948 258Z'/><path fill='#a88a72' stroke='#a88a72' stroke-width='.6' d='M1018 312L1011 297L1020 300Z'/><path fill='#a8a896' stroke='#a8a896' stroke-width='.6' d='M949 327L949 325L957 337Z'/><path fill='#907e72' stroke='#907e72' stroke-width='.6' d='M941 377L938 375L942 374ZM938 375L938 374L942 374ZM953 174L949 177L943 176Z'/><path fill='#665a42' stroke='#665a42' stroke-width='.6' d='M1057 221L1059 230L1052 232ZM1051 240L1052 243L1042 240Z'/><path fill='#78665a' stroke='#78665a' stroke-width='.6' d='M934 368L938 374L934 374Z'/><path fill='#786c5a' stroke='#786c5a' stroke-width='.6' d='M949 177L947 182L943 176Z'/><path fill='#b4b4a8' stroke='#b4b4a8' stroke-width='.6' d='M924 342L925 340L946 342Z'/>", '#efe2cc') },
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
