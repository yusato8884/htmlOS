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
    { name: 'ベンガル（ローポリ）', dir: '7.1-Polaris', file: 'bengal', css: svgWall("<path fill='#c0b090' stroke='#c0b090' stroke-width='.6' d='M0 1000L1039 1001L1331 1001ZM1500 1000L1469 975L1508 988ZM1474 697L1516 742L1452 745ZM1417 893L1421 892L1442 919ZM1449 795L1431 770L1452 745ZM1450 0L1432 27L1432 10ZM1431 852L1421 892L1417 893ZM1073 701L1057 665L1068 670ZM1110 409L1089 383L1105 378ZM1253 877L1209 856L1241 840ZM1304 104L1303 76L1360 111ZM1303 76L1286 105L1269 83ZM569 416L612 450L590 466ZM707 797L720 788L729 794ZM355 568L377 551L377 592ZM1300 100L1303 76L1304 104ZM1251 143L1298 138L1268 169ZM637 401L645 431L621 441ZM1102 300L1085 311L1083 303ZM1528 791L1502 840L1485 814ZM1192 611L1197 614L1183 627ZM1379 126L1361 139L1360 111Z'/><path fill='#c0b898' stroke='#c0b898' stroke-width='.6' d='M950 0L1000 0L976 37ZM847 14L850 0L884 7ZM1550 0L1518 12L1500 0ZM1431 852L1449 879L1421 892ZM1547 156L1550 136L1600 150ZM1399 336L1398 335L1407 311ZM1286 105L1300 100L1304 104ZM1559 261L1557 256L1579 229Z'/><path fill='#d0c0a8' stroke='#d0c0a8' stroke-width='.6' d='M600 1000L650 1000L1039 1001ZM1469 975L1500 1000L1450 1000ZM1467 940L1469 975L1432 992ZM1073 852L1019 851L1048 779ZM1093 797L1073 852L1048 779ZM1001 902L1038 946L972 952ZM800 1000L850 1000L1039 1001ZM650 1000L700 1000L1039 1001ZM755 948L700 1000L694 929ZM1171 743L1169 805L1121 801ZM1169 805L1171 743L1210 779ZM1362 699L1426 746L1355 755ZM1379 20L1350 0L1400 0ZM900 0L947 12L954 45ZM954 45L949 67L886 73ZM0 950L32 979L0 1000ZM32 979L50 1000L0 1000ZM1112 737L1171 743L1121 801ZM1093 797L1112 737L1121 801ZM900 1000L936 971L950 1000ZM800 1000L827 997L850 1000ZM700 1000L682 989L694 929ZM682 989L700 1000L650 1000ZM1115 468L1109 478L1078 468ZM1508 691L1485 649L1518 683ZM1414 193L1413 207L1398 191ZM1501 126L1528 133L1510 140ZM1068 761L1112 737L1093 797ZM1019 851L1000 833L1048 779ZM1000 833L967 788L1048 779ZM865 843L890 889L844 853ZM833 795L865 843L844 853ZM778 996L800 1000L750 1000ZM967 788L949 740L984 757ZM1117 871L1125 882L1067 902ZM1132 840L1093 797L1121 801ZM1093 797L1132 840L1073 852ZM1169 805L1132 840L1121 801ZM1132 840L1169 805L1162 850ZM1068 761L1073 701L1112 737ZM1449 879L1467 940L1442 919ZM1323 738L1362 699L1355 755ZM1308 792L1323 738L1355 755ZM1258 743L1281 790L1210 779ZM1212 734L1258 743L1210 779ZM949 67L987 78L946 122ZM58 985L100 1000L50 1000ZM32 979L58 985L50 1000ZM509 988L551 986L550 1000ZM1064 767L1093 797L1048 779ZM1064 767L1068 761L1093 797ZM947 840L1000 833L967 877ZM947 840L967 877L951 881ZM854 931L836 905L890 889ZM890 934L854 931L890 889ZM854 931L890 934L875 979ZM890 934L936 971L875 979ZM1131 887L1125 882L1154 853ZM1038 730L1064 767L1048 779ZM1064 767L1038 730L1068 761ZM1485 814L1461 845L1449 795ZM1378 72L1303 76L1314 12ZM1533 306L1559 321L1536 325ZM1510 140L1538 159L1498 177ZM1528 133L1538 159L1510 140ZM1412 142L1454 132L1421 176ZM1347 123L1322 137L1304 104ZM1554 333L1559 328L1561 340ZM450 1000L400 1000L431 990ZM895 839L947 840L951 881ZM747 855L746 891L739 874ZM800 876L746 891L747 855ZM1412 142L1419 117L1448 123ZM755 948L757 902L787 940ZM708 900L757 902L755 948ZM1094 365L1076 362L1093 362ZM1528 314L1520 308L1533 306ZM1498 233L1536 231L1536 241ZM1542 221L1488 204L1547 205ZM1401 165L1402 152L1421 176Z'/><path fill='#b8a080' stroke='#b8a080' stroke-width='.6' d='M1400 1000L1450 1000L1331 1001ZM28 730L0 700L10 699ZM1038 946L1050 1000L1039 1001ZM39 925L69 938L66 961ZM1038 946L1085 949L1075 994ZM1091 967L1085 949L1122 943ZM1307 853L1256 874L1285 833ZM1516 742L1485 814L1452 745ZM543 444L569 416L590 466ZM1322 137L1347 123L1359 143ZM1070 339L1090 323L1089 343ZM1381 273L1379 294L1369 272ZM1204 611L1197 614L1192 611Z'/><path fill='#c8b8a0' stroke='#c8b8a0' stroke-width='.6' d='M1400 1000L1432 992L1450 1000ZM1366 774L1361 794L1355 755ZM1426 746L1366 774L1355 755ZM947 12L950 0L976 37ZM954 45L947 12L976 37ZM1048 779L967 788L984 757ZM968 697L1028 696L963 730ZM1171 743L1212 734L1210 779ZM1526 711L1508 691L1518 683ZM850 0L900 0L884 7ZM947 12L900 0L950 0ZM884 7L900 0L886 73ZM39 925L32 979L0 950ZM37 843L24 779L74 801ZM128 784L124 805L74 801ZM1500 1000L1550 1000L1331 1001ZM1467 940L1510 927L1469 975ZM1038 946L978 976L972 952ZM850 1000L900 1000L1039 1001ZM682 989L638 980L694 929ZM638 980L682 989L650 1000ZM729 794L747 855L692 843ZM739 874L708 900L692 843ZM1241 840L1223 829L1281 790ZM39 925L24 905L58 888ZM24 905L37 843L58 888ZM786 837L729 794L781 788ZM786 837L747 855L729 794ZM984 757L949 740L963 730ZM1192 696L1223 708L1192 728ZM1258 743L1223 708L1265 706ZM989 109L975 124L946 122ZM85 826L74 828L74 801ZM98 822L85 826L74 801ZM1131 887L1154 853L1189 891ZM1155 685L1167 687L1171 743ZM1073 701L1117 710L1112 737ZM1117 710L1132 685L1143 687ZM1073 701L1038 730L1028 696ZM1038 730L1073 701L1068 761ZM1038 730L1048 779L984 757ZM1028 696L1038 730L984 757ZM1162 850L1209 856L1189 891ZM1579 229L1571 230L1565 191ZM1571 230L1547 205L1565 191ZM977 134L975 124L989 109ZM637 401L621 441L588 396ZM899 807L854 792L873 766ZM1022 654L1037 656L1028 696ZM1110 409L1127 427L1110 429ZM1553 773L1528 791L1516 742ZM1304 104L1298 138L1283 123ZM1559 328L1554 333L1559 321ZM1551 289L1559 321L1543 295ZM621 441L615 445L588 396ZM930 794L895 738L949 740ZM895 738L930 794L873 766ZM1420 384L1412 365L1456 359ZM431 990L413 990L412 953ZM413 990L400 1000L412 953ZM1498 233L1542 221L1536 231ZM1376 246L1385 223L1423 227Z'/><path fill='#b8a880' stroke='#b8a880' stroke-width='.6' d='M1432 992L1400 1000L1402 942ZM1362 842L1367 827L1416 831Z'/><path fill='#c8b898' stroke='#c8b898' stroke-width='.6' d='M1450 1000L1500 1000L1331 1001ZM1467 940L1432 992L1402 942ZM1115 468L1078 468L1118 445ZM1508 691L1526 711L1516 742ZM39 925L58 888L69 906ZM586 642L575 624L598 613ZM1550 136L1528 133L1544 114ZM1421 892L1449 879L1442 919ZM1554 92L1600 100L1544 114ZM598 557L577 544L589 518ZM1509 542L1499 536L1496 530ZM1533 306L1518 272L1543 295ZM1547 156L1538 159L1550 136Z'/><path fill='#d0c8b0' stroke='#d0c8b0' stroke-width='.6' d='M1432 992L1469 975L1450 1000ZM1417 11L1400 0L1432 10ZM800 1000L779 988L787 940ZM1449 795L1461 845L1424 804ZM1575 74L1501 67L1558 15ZM779 988L757 979L787 940ZM1084 432L1110 429L1118 445ZM1449 879L1500 858L1510 927ZM1516 509L1509 542L1496 530ZM1506 444L1463 468L1463 437ZM1518 12L1488 10L1500 0ZM1498 45L1454 67L1468 29ZM1501 67L1554 92L1544 114ZM987 78L989 109L946 122ZM890 889L836 905L844 853ZM890 934L906 930L936 971ZM1482 415L1506 444L1463 437ZM1458 80L1501 126L1448 123ZM1518 272L1551 252L1559 261ZM987 78L1017 117L989 109ZM1443 401L1468 414L1454 433ZM1402 152L1412 142L1421 176ZM1492 275L1471 276L1481 244ZM1492 275L1514 269L1518 272ZM1536 231L1551 252L1536 241ZM1390 290L1381 273L1427 273ZM1444 207L1414 217L1413 207ZM1456 359L1453 330L1468 358ZM1421 309L1453 330L1399 336ZM1513 364L1556 364L1550 376ZM1541 384L1513 364L1550 376ZM1520 308L1492 275L1518 272ZM1536 231L1542 221L1551 252ZM1443 311L1443 299L1453 302ZM1443 264L1434 282L1427 273ZM1513 364L1502 354L1536 325ZM329 699L326 706L312 711ZM1520 308L1484 319L1492 275ZM1484 319L1466 308L1468 305ZM1489 366L1464 385L1468 358ZM1464 385L1420 384L1456 359ZM1492 346L1492 350L1468 358ZM1492 350L1489 366L1468 358Z'/><path fill='#483010' stroke='#483010' stroke-width='.6' d='M1200 1000L1250 1000L1331 1001ZM503 105L556 105L510 127ZM569 54L595 55L569 62ZM3 148L4 153L0 150ZM549 63L573 83L535 76ZM647 74L638 105L626 90ZM562 114L562 110L575 121ZM495 664L485 654L503 665ZM618 577L611 570L629 564ZM1398 526L1380 522L1384 494ZM1106 669L1132 657L1107 676Z'/><path fill='#684810' stroke='#684810' stroke-width='.6' d='M1250 1000L1300 1000L1331 1001Z'/><path fill='#987840' stroke='#987840' stroke-width='.6' d='M1362 941L1368 896L1402 942ZM1372 997L1350 1000L1362 941ZM1310 449L1306 447L1308 443ZM417 403L449 353L448 406ZM1382 569L1355 568L1366 555ZM1012 396L1003 392L1004 390Z'/><path fill='#c0c0c0' stroke='#c0c0c0' stroke-width='.6' d='M1600 750L1572 740L1600 700ZM1545 688L1582 669L1600 700ZM775 14L750 0L800 0ZM1593 426L1600 400L1600 450ZM298 16L257 16L300 0ZM218 9L214 33L200 0ZM494 12L500 0L503 28ZM1000 541L1024 537L1025 546ZM1582 669L1588 637L1600 650ZM24 70L21 58L40 65ZM231 25L250 0L257 16ZM1112 641L1093 631L1122 617Z'/><path fill='#c0b8c0' stroke='#c0b8c0' stroke-width='.6' d='M1572 740L1545 688L1600 700ZM1600 500L1569 491L1600 450ZM1582 669L1600 650L1600 700ZM1569 778L1553 773L1572 740ZM1041 549L1031 584L1016 559ZM1084 531L1085 507L1094 520ZM1035 514L998 514L998 496Z'/><path fill='#c0b098' stroke='#c0b098' stroke-width='.6' d='M1431 770L1426 746L1452 745ZM1050 0L1032 36L1000 0ZM781 788L729 794L738 764ZM1308 792L1361 794L1315 839ZM1308 792L1285 833L1281 790ZM1430 681L1447 675L1474 697ZM1469 975L1510 927L1508 988ZM900 1000L950 1000L1039 1001ZM915 721L968 697L963 730ZM1285 833L1241 840L1281 790ZM1313 703L1265 706L1282 687ZM24 905L0 950L0 900ZM24 905L39 925L0 950ZM1125 882L1122 943L1067 902ZM1256 874L1241 840L1285 833ZM1510 927L1500 858L1526 875ZM1554 92L1575 74L1600 100ZM79 971L58 985L66 961ZM854 792L854 735L873 766ZM854 792L833 795L854 735ZM854 735L895 738L873 766ZM1167 687L1182 691L1192 728ZM1132 685L1117 710L1107 676ZM1241 840L1209 856L1223 829ZM1485 814L1449 795L1452 745ZM1223 708L1247 686L1265 706ZM1020 642L1024 651L1022 654ZM1502 840L1528 791L1526 850ZM1173 655L1183 627L1177 655ZM1412 365L1420 384L1410 372ZM935 124L949 67L946 122Z'/><path fill='#a08050' stroke='#a08050' stroke-width='.6' d='M1350 1000L1400 1000L1331 1001ZM1367 827L1362 842L1315 839ZM1016 202L986 183L1028 180ZM1315 418L1324 432L1320 431ZM945 225L893 205L950 168ZM844 212L839 200L849 212ZM1016 202L992 214L986 183ZM453 319L449 353L423 310ZM377 551L386 596L377 592ZM1030 350L1029 358L1009 341ZM1029 358L1027 363L1009 341Z'/><path fill='#a88850' stroke='#a88850' stroke-width='.6' d='M1372 997L1362 941L1402 942ZM1100 1000L1150 1000L1039 1001ZM1050 1000L1100 1000L1039 1001ZM1075 994L1091 967L1100 1000ZM1455 662L1447 675L1428 664ZM726 268L735 258L736 265ZM1089 343L1090 323L1102 335ZM1108 339L1088 352L1089 343ZM1375 603L1358 620L1352 590ZM1030 379L1018 384L1027 363Z'/><path fill='#b8a070' stroke='#b8a070' stroke-width='.6' d='M1400 1000L1372 997L1402 942ZM1455 662L1485 649L1474 697Z'/><path fill='#a89068' stroke='#a89068' stroke-width='.6' d='M1350 1000L1372 997L1400 1000ZM575 624L595 610L598 613ZM541 582L547 547L563 592ZM813 180L817 199L786 176ZM681 304L680 328L664 333ZM645 431L637 401L685 423ZM642 591L644 598L639 603ZM663 373L666 374L637 401ZM1373 265L1373 264L1377 266Z'/><path fill='#b09058' stroke='#b09058' stroke-width='.6' d='M1150 1000L1100 1000L1116 987ZM849 212L875 215L844 265ZM1105 378L1121 362L1122 372ZM547 547L577 544L563 592ZM304 777L312 770L320 770Z'/><path fill='#303030' stroke='#303030' stroke-width='.6' d='M1150 1000L1157 985L1200 1000Z'/><path fill='#605030' stroke='#605030' stroke-width='.6' d='M1039 1001L1150 1000L1331 1001ZM1061 655L1074 658L1068 670ZM690 81L703 81L711 93Z'/><path fill='#201810' stroke='#201810' stroke-width='.6' d='M1150 1000L1200 1000L1331 1001ZM635 205L652 154L688 201ZM648 358L647 333L661 354ZM587 253L608 229L628 256ZM947 597L973 622L942 619ZM410 819L428 792L434 805ZM334 622L343 636L332 633Z'/><path fill='#d8c8b0' stroke='#d8c8b0' stroke-width='.6' d='M1073 852L1067 902L1027 882ZM1038 946L1001 902L1027 882ZM951 881L1001 902L972 952ZM1001 902L1019 851L1027 882ZM1223 829L1169 805L1210 779ZM1417 11L1432 27L1424 63ZM967 877L1001 902L951 881ZM1001 902L967 877L1019 851ZM936 971L900 1000L875 979ZM1073 852L1117 871L1067 902ZM1461 845L1431 852L1416 831ZM1413 207L1394 202L1398 191ZM1467 161L1510 140L1498 177ZM1467 161L1501 126L1510 140ZM967 877L1000 833L1019 851ZM906 930L890 889L951 881ZM941 952L906 930L951 881ZM906 930L941 952L936 971ZM1117 871L1132 840L1154 853ZM1154 853L1132 840L1162 850ZM1468 29L1454 67L1432 27ZM1454 67L1498 45L1501 67ZM1379 20L1378 72L1314 12ZM1454 132L1467 161L1421 176ZM1454 132L1501 126L1467 161ZM987 78L954 45L976 37ZM987 78L949 67L954 45ZM906 930L890 934L890 889ZM1501 126L1458 80L1501 67ZM1551 252L1571 230L1553 253ZM584 984L638 980L600 1000ZM836 905L800 876L844 853ZM1378 72L1381 126L1360 111ZM1492 275L1481 244L1508 266ZM1514 269L1492 275L1508 266ZM1469 168L1478 203L1444 207ZM1414 217L1385 223L1394 202ZM890 889L895 839L951 881ZM1399 124L1381 126L1378 72ZM1419 117L1458 80L1448 123ZM1471 276L1434 282L1443 264ZM1498 233L1536 241L1508 266Z'/><path fill='#d0c0b0' stroke='#d0c0b0' stroke-width='.6' d='M1067 902L1038 946L1027 882ZM639 924L664 895L694 929ZM638 980L639 924L694 929ZM600 1000L638 980L650 1000ZM1019 851L1073 852L1027 882ZM1281 790L1223 829L1210 779ZM1504 481L1532 484L1526 490ZM200 1000L250 1000L1039 1001ZM550 1000L600 1000L1039 1001ZM500 1000L550 1000L1039 1001ZM978 976L936 971L972 952ZM900 1000L850 1000L875 979ZM941 952L951 881L972 952ZM827 997L800 1000L787 940ZM850 1000L827 997L875 979ZM1424 804L1461 845L1416 831ZM1485 649L1517 648L1518 683ZM509 988L550 1000L500 1000ZM827 997L854 931L875 979ZM854 931L827 997L787 940ZM757 979L755 948L787 940ZM700 1000L757 979L750 1000ZM778 996L779 988L800 1000ZM757 979L778 996L750 1000ZM778 996L757 979L779 988ZM1125 882L1117 871L1154 853ZM1449 879L1431 852L1461 845ZM1258 743L1323 738L1281 790ZM499 988L477 971L511 935ZM509 988L499 988L511 935ZM836 905L854 931L787 940ZM1169 805L1209 856L1162 850ZM1223 829L1209 856L1169 805ZM584 984L551 986L549 931ZM584 984L600 929L638 980ZM551 986L584 984L550 1000ZM800 876L786 837L844 853ZM800 876L836 905L787 940ZM1454 132L1412 142L1448 123ZM1421 309L1399 336L1407 311ZM1390 290L1421 309L1407 311ZM450 1000L500 1000L1039 1001ZM350 1000L400 1000L1039 1001ZM400 1000L450 1000L1039 1001ZM865 843L895 839L890 889ZM1017 117L1014 129L989 109ZM452 990L462 932L477 971ZM499 988L452 990L477 971ZM452 990L499 988L500 1000ZM899 812L895 839L865 843ZM757 902L800 876L787 940ZM757 902L746 891L800 876ZM1076 362L1088 352L1093 362Z'/><path fill='#201828' stroke='#201828' stroke-width='.6' d='M1217 987L1222 987L1200 1000Z'/><path fill='#101018' stroke='#101018' stroke-width='.6' d='M1199 983L1217 987L1200 1000ZM1157 985L1174 977L1200 1000ZM1178 975L1199 983L1200 1000Z'/><path fill='#181820' stroke='#181820' stroke-width='.6' d='M1222 987L1235 992L1200 1000Z'/><path fill='#181018' stroke='#181018' stroke-width='.6' d='M1235 992L1250 1000L1200 1000ZM1144 974L1171 973L1157 985Z'/><path fill='#b8a878' stroke='#b8a878' stroke-width='.6' d='M1402 942L1417 893L1442 919Z'/><path fill='#a08048' stroke='#a08048' stroke-width='.6' d='M1368 896L1417 893L1402 942ZM701 282L685 270L721 273ZM360 215L379 212L369 227ZM1203 627L1209 625L1211 629ZM404 594L386 596L377 551ZM1292 391L1298 396L1278 402Z'/><path fill='#b8c0c0' stroke='#b8c0c0' stroke-width='.6' d='M1600 550L1600 600L1585 593ZM21 58L24 70L13 72Z'/><path fill='#c0b8b8' stroke='#c0b8b8' stroke-width='.6' d='M1569 491L1581 446L1600 450ZM776 59L847 14L846 70ZM1600 600L1584 602L1585 593ZM1582 669L1555 645L1565 645ZM1089 131L1089 86L1116 87ZM1581 446L1593 426L1600 450ZM1588 637L1582 669L1565 645ZM1039 584L1054 564L1072 610ZM1569 778L1528 791L1553 773ZM1169 190L1164 174L1228 192ZM1136 107L1089 131L1116 87Z'/><path fill='#c8c0a8' stroke='#c8c0a8' stroke-width='.6' d='M1532 484L1510 449L1541 441ZM847 14L884 7L886 73ZM846 70L847 14L886 73ZM750 1000L800 1000L1039 1001ZM1532 484L1551 493L1526 490ZM1558 15L1550 0L1600 0ZM900 0L954 45L886 73ZM1192 728L1212 734L1171 743ZM1516 509L1496 530L1488 519ZM1504 481L1474 511L1462 499ZM1600 50L1575 74L1558 15ZM1498 45L1488 10L1518 12ZM1575 74L1554 92L1501 67ZM1562 326L1559 321L1600 300ZM1085 32L1027 73L1032 36ZM1000 833L947 840L967 788ZM1112 737L1117 710L1171 743ZM1459 482L1463 468L1504 481ZM1559 321L1533 306L1543 295ZM1561 340L1559 328L1562 326ZM1453 330L1403 354L1399 336ZM1421 309L1390 290L1427 273ZM615 445L569 416L588 396ZM1485 814L1502 840L1461 845ZM1554 333L1556 364L1536 325ZM1556 364L1513 364L1536 325ZM1542 221L1571 230L1551 252ZM1381 273L1377 266L1427 273ZM1398 335L1401 309L1407 311ZM1412 365L1403 354L1453 330ZM1443 311L1421 309L1443 299ZM1421 309L1434 282L1443 299ZM1059 364L1076 362L1069 388ZM1561 376L1541 384L1550 376ZM1377 266L1376 246L1427 273Z'/><path fill='#b07020' stroke='#b07020' stroke-width='.6' d='M1158 495L1163 474L1168 477ZM38 604L57 602L39 632ZM181 588L160 582L182 537ZM544 217L505 218L513 205ZM550 213L544 217L513 205ZM201 897L160 890L199 887Z'/><path fill='#301810' stroke='#301810' stroke-width='.6' d='M1445 525L1423 539L1422 506ZM1413 488L1384 494L1387 490ZM1442 491L1451 498L1422 506ZM83 173L104 149L85 173ZM913 288L943 269L951 296ZM378 188L387 211L379 212ZM1398 526L1384 494L1422 506ZM939 259L913 288L889 249ZM1329 675L1315 676L1320 657ZM1125 218L1121 204L1129 212Z'/><path fill='#886028' stroke='#886028' stroke-width='.6' d='M1362 842L1320 873L1315 839ZM203 84L181 78L192 42ZM447 260L441 217L495 251ZM634 479L653 509L637 530ZM1331 942L1320 873L1368 896ZM360 215L369 227L319 262ZM671 814L649 828L665 796ZM418 162L409 135L425 159ZM160 890L134 885L145 880ZM1174 304L1175 301L1182 309ZM1117 196L1116 203L1098 195ZM425 34L448 49L437 70ZM1034 298L1032 301L1017 280ZM1338 617L1358 620L1352 636Z'/><path fill='#906830' stroke='#906830' stroke-width='.6' d='M1320 873L1362 842L1368 896ZM11 130L19 112L51 131ZM279 86L304 22L314 60ZM1350 1000L1331 942L1362 941ZM1253 305L1225 313L1224 269ZM701 794L682 792L690 764ZM1281 301L1274 322L1253 305ZM402 15L425 34L410 61ZM972 251L1008 250L1005 263ZM1007 245L1008 250L972 251ZM1273 340L1283 358L1270 354ZM1266 292L1281 301L1253 305ZM547 271L515 306L536 264ZM1271 435L1262 434L1263 421Z'/><path fill='#c0b088' stroke='#c0b088' stroke-width='.6' d='M1417 893L1362 842L1416 831ZM1474 697L1508 691L1516 742ZM1485 649L1508 691L1474 697ZM1399 124L1398 139L1381 126ZM1102 291L1102 300L1083 303Z'/><path fill='#a88858' stroke='#a88858' stroke-width='.6' d='M1362 842L1417 893L1368 896ZM353 343L348 332L367 317ZM1122 943L1139 964L1116 987ZM1091 967L1122 943L1116 987ZM1100 1000L1091 967L1116 987ZM844 212L807 228L822 208ZM685 270L726 268L721 273ZM1033 308L1049 302L1035 314ZM817 199L807 228L779 229ZM1209 635L1203 627L1211 629ZM1257 377L1239 395L1239 352ZM1258 425L1260 419L1263 421Z'/><path fill='#b8a890' stroke='#b8a890' stroke-width='.6' d='M1366 774L1426 746L1431 770ZM978 976L1000 1000L950 1000ZM1000 1000L978 976L1038 946ZM1423 678L1425 667L1430 681ZM1131 887L1189 891L1168 936ZM1209 856L1230 896L1189 891ZM1499 536L1509 542L1500 538ZM1257 20L1303 76L1269 83ZM85 723L28 730L79 696ZM642 835L649 828L692 843ZM1247 686L1251 685L1265 706ZM1265 706L1251 685L1282 687ZM1240 681L1223 708L1223 683ZM1240 681L1247 686L1223 708ZM1065 156L1016 134L1017 117ZM691 798L707 797L692 843ZM1074 669L1073 701L1068 670ZM1030 652L1037 656L1022 654ZM1409 371L1412 365L1410 372ZM151 691L162 689L178 733ZM1050 407L1043 396L1069 388ZM393 910L371 878L399 876ZM326 706L323 710L312 711ZM329 639L343 636L344 663Z'/><path fill='#b8a088' stroke='#b8a088' stroke-width='.6' d='M1424 804L1366 774L1431 770ZM950 1000L1000 1000L1039 1001ZM1423 678L1405 667L1425 667ZM649 828L671 814L692 843ZM242 684L206 681L250 664Z'/><path fill='#b8a888' stroke='#b8a888' stroke-width='.6' d='M1366 774L1424 804L1361 794ZM1000 1000L1038 946L1039 1001ZM1122 943L1131 887L1168 936ZM1209 856L1253 877L1237 891ZM720 788L734 765L729 794ZM1379 318L1401 309L1398 335Z'/><path fill='#c8c8b8' stroke='#c8c8b8' stroke-width='.6' d='M1531 648L1545 688L1518 683ZM1443 451L1454 433L1463 437Z'/><path fill='#a08890' stroke='#a08890' stroke-width='.6' d='M1539 599L1531 648L1506 617ZM1529 593L1539 599L1506 617ZM1509 642L1485 649L1506 617ZM1456 618L1446 639L1448 610Z'/><path fill='#c8c0b8' stroke='#c8c0b8' stroke-width='.6' d='M1526 711L1545 688L1572 740ZM1550 515L1575 536L1533 558ZM1553 506L1575 536L1550 515ZM1556 445L1557 492L1532 484ZM1567 436L1575 412L1593 426ZM856 77L855 110L846 70ZM1518 410L1527 403L1541 441ZM1051 420L1037 406L1044 406ZM1183 627L1173 655L1158 635ZM305 653L312 711L278 657Z'/><path fill='#c0b0a0' stroke='#c0b0a0' stroke-width='.6' d='M1516 742L1526 711L1572 740ZM1426 746L1430 681L1452 745ZM1257 20L1300 0L1314 12ZM181 969L190 962L200 1000ZM1550 1000L1600 1000L1331 1001ZM789 743L833 795L781 788ZM854 735L833 795L789 743ZM150 1000L124 998L157 975ZM0 850L24 905L0 900ZM120 812L98 822L74 801ZM78 760L24 779L28 730ZM751 743L781 788L738 764ZM751 743L789 743L781 788ZM854 735L841 681L886 701ZM949 740L915 721L963 730ZM915 721L921 688L968 697ZM1405 667L1423 678L1362 699ZM1386 663L1405 667L1362 699ZM1579 229L1565 191L1600 200ZM37 843L65 852L58 888ZM58 985L79 971L82 974ZM462 932L425 912L454 911ZM425 912L462 932L412 953ZM549 931L532 879L561 873ZM500 904L532 879L549 931ZM949 740L895 738L915 721ZM895 738L854 735L886 701ZM915 721L895 738L886 701ZM1182 691L1192 696L1192 728ZM1047 660L1057 665L1028 696ZM1017 117L1089 86L1089 131ZM707 797L729 794L692 843ZM92 826L85 826L98 822ZM312 711L261 665L278 657ZM352 903L393 910L359 937ZM393 910L412 953L359 937ZM393 910L425 912L412 953ZM480 900L462 932L454 911ZM462 932L480 900L500 904ZM582 865L607 902L561 873ZM1037 656L1047 660L1028 696ZM921 688L942 650L968 697ZM942 650L921 688L917 636ZM178 733L136 757L133 709ZM78 760L136 757L128 784ZM136 757L137 793L128 784ZM213 789L178 733L232 734ZM213 789L193 793L178 733ZM136 757L178 790L173 793ZM212 955L225 976L190 962ZM92 826L87 827L85 826ZM306 984L291 923L321 925ZM306 984L321 925L359 937ZM582 865L593 856L607 902ZM1206 598L1192 611L1191 590ZM231 696L250 681L232 734ZM178 733L231 696L232 734ZM206 681L231 696L178 733ZM284 926L306 984L271 980ZM306 984L284 926L291 923ZM353 902L393 910L352 903ZM1043 396L1050 407L1044 406ZM313 713L303 727L312 711ZM1420 400L1417 394L1420 384Z'/><path fill='#c0b8a0' stroke='#c0b8a0' stroke-width='.6' d='M1545 688L1526 711L1518 683ZM1000 0L1032 36L976 37ZM1361 794L1308 792L1355 755ZM1085 32L1032 36L1050 0ZM32 979L39 925L66 961ZM24 779L0 800L0 750ZM0 800L37 843L0 850ZM24 779L37 843L0 800ZM936 971L978 976L950 1000ZM1516 509L1504 481L1526 490ZM1575 74L1600 50L1600 100ZM1565 191L1600 150L1600 200ZM78 760L128 784L74 801ZM998 640L1022 654L968 697ZM1501 126L1454 132L1448 123ZM58 985L32 979L66 961ZM1143 687L1155 685L1171 743ZM1117 710L1073 701L1107 676ZM1244 126L1286 105L1283 123ZM1559 321L1554 333L1536 325ZM377 551L355 568L348 530ZM1553 442L1550 443L1541 441ZM1557 256L1571 230L1579 229ZM1559 328L1559 321L1562 326ZM1559 321L1551 289L1593 292ZM1401 309L1383 308L1390 290ZM1430 425L1426 421L1443 401Z'/><path fill='#c8b8a8' stroke='#c8b8a8' stroke-width='.6' d='M1430 681L1474 697L1452 745ZM150 1000L200 1000L1039 1001ZM50 1000L1039 1001L0 1000ZM700 1000L750 1000L1039 1001ZM1028 696L984 757L963 730ZM1154 853L1162 850L1189 891ZM1600 150L1550 136L1600 100ZM100 1000L150 1000L1039 1001ZM50 1000L100 1000L1039 1001ZM74 828L37 843L74 801ZM250 1000L300 1000L1039 1001ZM747 855L739 874L692 843ZM708 900L755 948L694 929ZM664 895L708 900L694 929ZM708 900L664 895L692 843ZM1022 654L1028 696L968 697ZM100 1000L124 998L150 1000ZM82 974L124 998L100 1000ZM37 843L24 905L0 850ZM24 779L78 760L74 801ZM607 902L618 847L664 895ZM500 904L549 931L511 935ZM833 795L786 837L781 788ZM786 837L833 795L844 853ZM1167 687L1192 728L1171 743ZM1449 879L1510 927L1467 940ZM1423 678L1430 681L1426 746ZM1362 699L1423 678L1426 746ZM1323 738L1313 703L1362 699ZM1323 738L1265 706L1313 703ZM1192 728L1223 708L1212 734ZM1323 738L1258 743L1265 706ZM1223 708L1258 743L1212 734ZM58 985L82 974L100 1000ZM65 852L37 843L74 828ZM225 976L250 1000L200 1000ZM551 986L509 988L511 935ZM549 931L551 986L511 935ZM412 953L361 991L359 937ZM607 902L638 919L600 929ZM854 792L865 843L833 795ZM1117 710L1143 687L1171 743ZM1057 665L1073 701L1028 696ZM1480 517L1474 511L1488 519ZM1459 482L1504 481L1462 499ZM1303 76L1257 20L1314 12ZM1017 117L1027 73L1089 86ZM250 1000L271 980L300 1000ZM225 976L271 980L250 1000ZM584 984L549 931L600 929ZM300 1000L350 1000L1039 1001ZM786 837L800 876L747 855ZM271 980L306 984L300 1000ZM306 984L350 1000L300 1000ZM361 991L306 984L359 937ZM350 1000L306 984L361 991ZM355 568L359 586L330 564ZM400 1000L350 1000L361 991ZM400 1000L361 991L412 953ZM947 840L930 794L967 788ZM930 794L949 740L967 788ZM930 794L899 807L873 766ZM746 891L708 900L739 874ZM1502 840L1526 850L1500 858ZM1014 129L977 134L989 109ZM452 990L450 1000L431 990ZM462 932L452 990L412 953ZM452 990L431 990L412 953ZM450 1000L452 990L500 1000ZM400 1000L413 990L431 990ZM895 839L899 812L947 840ZM899 812L930 794L947 840ZM930 794L899 812L899 807ZM854 792L899 812L865 843ZM899 807L899 812L854 792ZM1088 352L1076 362L1074 345ZM1430 425L1443 401L1454 433Z'/><path fill='#d0c8a8' stroke='#d0c8a8' stroke-width='.6' d='M1400 0L1450 0L1432 10ZM1501 67L1498 45L1558 15ZM1538 159L1547 205L1498 177ZM566 653L575 624L586 642ZM1551 252L1557 256L1559 261ZM1551 289L1518 272L1559 261ZM1419 117L1412 142L1405 122ZM1478 203L1479 215L1444 207ZM1528 314L1533 306L1536 325ZM1498 233L1488 204L1542 221ZM1488 204L1498 233L1479 215Z'/><path fill='#b8b8a8' stroke='#b8b8a8' stroke-width='.6' d='M850 0L847 14L800 0ZM1033 475L998 496L995 487ZM1442 440L1454 433L1443 451ZM1072 153L1065 156L1089 131ZM1088 170L1072 153L1089 131ZM1178 201L1169 190L1228 192Z'/><path fill='#c0c0b8' stroke='#c0c0b8' stroke-width='.6' d='M847 14L776 59L800 0ZM1556 445L1581 446L1569 491ZM1562 575L1600 550L1585 593ZM500 0L532 23L503 28ZM796 119L776 59L846 70ZM494 12L474 19L500 0ZM1026 460L1030 465L1033 475ZM1558 572L1575 536L1562 575ZM350 0L330 15L300 0ZM1567 436L1593 426L1581 446ZM595 55L581 38L584 25ZM1089 131L1141 132L1114 164ZM652 68L647 38L682 66ZM550 37L547 36L556 8ZM1136 107L1141 132L1089 131ZM1600 400L1587 377L1600 350ZM1587 377L1582 368L1600 350ZM1575 412L1587 377L1600 400ZM1568 410L1587 377L1575 412Z'/><path fill='#b8b0a0' stroke='#b8b0a0' stroke-width='.6' d='M1235 60L1257 20L1269 83ZM0 700L28 730L0 750ZM1300 0L1257 20L1250 0ZM28 730L24 779L0 750ZM1550 1000L1500 1000L1508 988ZM841 681L834 642L856 649ZM874 658L841 681L856 649ZM921 688L874 658L917 636ZM874 658L921 688L886 701ZM1463 468L1448 462L1449 457ZM402 15L389 17L400 0ZM1251 143L1235 164L1244 126ZM1251 143L1244 126L1283 123ZM1568 591L1562 575L1585 593ZM1251 143L1245 163L1235 164ZM261 665L312 711L250 681ZM193 793L178 790L178 733ZM1245 163L1253 180L1235 164ZM1253 180L1245 163L1268 169ZM303 727L275 747L250 681ZM1559 413L1568 410L1564 418ZM1559 413L1561 376L1568 410ZM1173 655L1167 656L1158 635ZM1009 141L1014 129L1016 134ZM231 696L242 684L250 681ZM1169 190L1160 185L1164 174ZM1420 409L1420 400L1443 401Z'/><path fill='#b0a8a0' stroke='#b0a8a0' stroke-width='.6' d='M1257 20L1235 60L1219 27ZM1510 927L1561 958L1508 988ZM829 121L796 119L846 70ZM1588 637L1591 631L1600 650ZM490 21L494 12L503 28ZM1449 466L1448 462L1463 468ZM652 68L647 74L647 38ZM637 401L601 372L636 352ZM1109 176L1088 170L1114 164ZM1144 173L1125 178L1114 164ZM1034 597L1039 584L1072 610ZM1039 584L1034 597L1029 593ZM1160 185L1153 186L1164 174ZM324 618L322 613L323 612Z'/><path fill='#b8b0a8' stroke='#b8b0a8' stroke-width='.6' d='M1257 20L1248 7L1250 0ZM1248 7L1257 20L1219 27ZM1200 0L1248 7L1219 27ZM1235 60L1176 37L1219 27ZM1026 460L1033 475L995 487ZM1244 126L1237 121L1269 83ZM608 56L595 55L584 25ZM1156 657L1147 638L1158 635ZM719 89L728 68L746 93ZM1526 875L1526 850L1561 873ZM1237 121L1190 130L1235 60ZM1235 164L1190 130L1237 121Z'/><path fill='#b8b8b0' stroke='#b8b8b0' stroke-width='.6' d='M1248 7L1200 0L1250 0ZM1200 0L1176 37L1150 0ZM1568 935L1510 927L1526 875ZM450 0L434 5L400 0ZM1088 170L1089 131L1114 164ZM550 37L556 8L578 36ZM1190 130L1159 81L1235 60Z'/><path fill='#604018' stroke='#604018' stroke-width='.6' d='M40 65L87 118L51 131ZM449 207L425 159L468 178ZM433 90L410 113L406 105ZM506 68L460 41L503 28ZM733 397L694 426L712 392ZM967 531L986 513L992 531ZM1319 656L1320 657L1309 665ZM448 130L469 77L474 130ZM418 162L414 212L391 187ZM309 418L273 408L279 398ZM702 550L684 585L684 545ZM404 655L394 646L406 638ZM743 687L751 686L763 714ZM874 607L920 618L917 636ZM729 467L734 472L721 501ZM376 631L392 644L366 637ZM279 783L317 799L277 784ZM1023 243L1047 265L1020 263ZM1011 246L1023 243L1011 256ZM1117 196L1128 195L1121 204ZM1125 218L1130 223L1129 223ZM1048 279L1036 280L1047 265ZM546 535L548 513L565 541ZM121 853L134 866L117 871Z'/><path fill='#b09060' stroke='#b09060' stroke-width='.6' d='M28 730L22 686L79 696ZM22 686L28 730L10 699ZM1328 607L1316 616L1308 595ZM1088 352L1108 339L1093 362ZM1273 409L1271 412L1264 414Z'/><path fill='#906028' stroke='#906028' stroke-width='.6' d='M0 700L22 686L10 699ZM244 446L251 445L248 477ZM298 224L360 215L319 262ZM943 269L987 292L951 296ZM987 292L943 269L972 251ZM1287 556L1272 565L1268 557ZM1320 619L1316 623L1314 618ZM16 665L0 700L0 650ZM387 211L414 212L409 251ZM682 792L671 814L665 796ZM425 34L437 70L410 61ZM926 564L885 596L881 553ZM1227 592L1220 584L1233 588ZM81 557L110 551L112 567ZM1224 400L1210 415L1211 401ZM1129 313L1113 295L1131 288ZM1116 286L1132 285L1131 288Z'/><path fill='#c0b8b0' stroke='#c0b8b0' stroke-width='.6' d='M1150 0L1114 25L1100 0ZM1176 37L1200 0L1219 27ZM1176 37L1114 25L1150 0ZM1085 32L1114 25L1116 87ZM1089 86L1085 32L1116 87ZM1114 25L1085 19L1100 0ZM1085 32L1085 19L1114 25ZM796 119L763 102L776 59ZM1030 465L1026 460L1035 454ZM1114 25L1159 81L1116 87ZM1176 37L1159 81L1114 25ZM1159 81L1176 37L1235 60ZM719 89L703 73L728 68ZM855 110L829 121L846 70ZM1164 174L1235 164L1228 192ZM1141 132L1144 173L1114 164ZM1144 173L1141 132L1164 174ZM1159 81L1136 107L1116 87ZM1141 132L1190 130L1164 174ZM1190 130L1136 107L1159 81ZM1136 107L1190 130L1141 132ZM1164 174L1190 130L1235 164ZM1192 611L1183 627L1175 607ZM1561 376L1587 377L1568 410ZM1587 377L1561 376L1582 368Z'/><path fill='#706050' stroke='#706050' stroke-width='.6' d='M685 270L658 227L701 219ZM1363 445L1340 441L1364 437ZM1435 436L1442 440L1434 456ZM123 813L120 812L124 805ZM1063 276L1047 265L1071 253ZM942 619L949 632L917 636ZM78 854L103 854L68 877ZM1133 649L1132 654L1116 652ZM1132 654L1133 649L1156 657ZM1158 659L1167 656L1160 661Z'/><path fill='#d89848' stroke='#d89848' stroke-width='.6' d='M202 328L200 356L186 327Z'/><path fill='#583008' stroke='#583008' stroke-width='.6' d='M248 477L251 445L264 490ZM81 253L56 270L66 216ZM199 199L189 232L172 205ZM283 291L305 322L267 322ZM346 106L385 77L406 105ZM694 734L690 764L651 741ZM112 159L122 141L124 158ZM651 686L694 734L651 741ZM488 587L496 596L471 596ZM642 754L690 764L665 796ZM275 597L303 590L270 612ZM200 650L162 631L176 606ZM405 84L437 70L433 90ZM244 790L260 799L245 814ZM268 609L260 626L233 588ZM622 801L625 838L604 833ZM1177 432L1207 436L1179 449ZM210 442L215 417L227 438ZM260 223L257 223L293 185ZM409 412L401 435L369 407ZM485 895L462 899L478 865ZM1131 359L1133 362L1124 368ZM680 635L721 660L707 679ZM1220 464L1221 463L1220 469ZM127 659L127 642L154 670ZM730 590L722 593L725 583Z'/><path fill='#684010' stroke='#684010' stroke-width='.6' d='M397 272L391 274L409 251ZM1289 980L1260 977L1257 946ZM1300 945L1257 946L1248 889ZM410 113L409 135L391 151ZM249 84L231 53L279 86ZM1380 522L1367 529L1364 505ZM136 121L169 133L157 143ZM262 133L249 84L279 86ZM215 248L220 251L207 248ZM505 218L449 207L468 178ZM414 212L418 162L449 207ZM415 405L413 407L417 403ZM90 914L80 900L86 900ZM82 924L84 923L98 937ZM239 938L199 935L210 903ZM903 507L904 518L876 509ZM1323 651L1320 657L1319 656ZM1017 280L1005 315L987 292ZM721 501L734 472L738 488ZM463 631L432 620L441 617ZM1141 292L1140 288L1154 297ZM1211 340L1208 339L1225 313ZM1358 620L1357 632L1352 636ZM1283 358L1292 391L1271 379ZM405 821L410 819L419 842ZM1205 405L1202 390L1211 401Z'/><path fill='#b88850' stroke='#b88850' stroke-width='.6' d='M391 274L386 314L367 317Z'/><path fill='#d0b080' stroke='#d0b080' stroke-width='.6' d='M368 352L386 314L402 330ZM502 377L517 384L504 396ZM1262 434L1263 439L1243 449Z'/><path fill='#c8b078' stroke='#c8b078' stroke-width='.6' d='M386 314L368 352L367 317Z'/><path fill='#000000' stroke='#000000' stroke-width='.6' d='M853 362L839 397L806 369ZM798 345L852 354L806 369Z'/><path fill='#704818' stroke='#704818' stroke-width='.6' d='M791 392L787 364L806 369ZM1300 945L1289 980L1257 946ZM1320 873L1300 945L1248 889ZM350 87L360 26L388 59ZM728 358L733 397L712 392ZM1319 656L1309 665L1315 633ZM4 153L3 148L11 130ZM186 106L177 96L203 84ZM448 130L409 135L410 113ZM425 159L448 130L468 178ZM231 53L249 84L203 84ZM684 585L710 568L699 594ZM753 602L772 623L766 622ZM1270 620L1246 606L1254 603ZM273 408L276 396L279 398ZM1017 280L987 292L1005 263ZM710 568L718 583L699 594ZM1209 625L1231 638L1211 629ZM1418 580L1401 574L1422 575ZM1319 316L1304 338L1300 309ZM260 626L306 633L278 657ZM1167 300L1174 304L1166 310ZM926 564L930 561L944 587ZM926 564L920 618L885 596ZM160 62L157 88L154 66ZM1231 638L1212 634L1211 629ZM1130 355L1128 356L1128 350ZM994 394L1009 422L981 405ZM1210 415L1205 405L1211 401Z'/><path fill='#382008' stroke='#382008' stroke-width='.6' d='M839 397L791 392L806 369ZM1225 663L1218 676L1203 659ZM769 472L737 468L761 460ZM729 542L694 520L721 501ZM480 651L485 654L482 654ZM827 284L838 319L799 313ZM603 173L608 229L559 208ZM575 121L562 110L584 85ZM485 654L495 664L482 654ZM595 55L578 73L569 62ZM914 319L913 288L951 296ZM384 171L368 152L391 151ZM444 563L439 562L463 542ZM672 84L690 81L686 134ZM211 794L208 834L185 799ZM406 615L404 594L421 609ZM1106 669L1105 657L1116 652ZM567 254L566 267L555 266ZM325 715L336 713L326 732ZM1132 196L1142 192L1149 206ZM725 610L677 610L699 594Z'/><path fill='#a07028' stroke='#a07028' stroke-width='.6' d='M787 364L791 392L757 360ZM128 548L110 551L109 548ZM1315 524L1328 539L1309 547ZM1169 241L1178 224L1181 229ZM1250 472L1256 464L1261 490ZM1140 288L1132 237L1171 276ZM1175 349L1176 346L1189 344Z'/><path fill='#684018' stroke='#684018' stroke-width='.6' d='M803 443L825 432L809 462ZM360 26L389 17L388 59ZM1467 516L1478 539L1469 540ZM231 53L203 84L192 42ZM785 265L790 280L736 265ZM305 454L299 517L264 490ZM976 549L967 531L992 531ZM482 140L472 138L474 130ZM702 550L710 568L684 585ZM1068 315L1059 321L1049 302ZM1410 550L1435 565L1422 575ZM1355 296L1353 318L1352 319ZM82 924L83 923L84 923ZM317 799L260 799L277 784ZM830 572L798 551L835 555ZM1221 463L1229 461L1220 469ZM1398 635L1395 655L1388 648ZM1225 313L1208 339L1195 313ZM1210 415L1213 433L1207 436ZM1182 387L1202 390L1184 394Z'/><path fill='#985810' stroke='#985810' stroke-width='.6' d='M803 443L761 460L776 425ZM258 258L283 291L219 298ZM1208 258L1209 265L1180 273ZM105 935L134 885L127 951ZM566 794L535 736L588 733ZM466 620L463 595L471 596ZM202 549L205 552L181 588Z'/><path fill='#c8c0b0' stroke='#c8c0b0' stroke-width='.6' d='M638 980L600 929L639 924ZM1532 484L1504 481L1510 449ZM856 77L846 70L886 73ZM1504 481L1516 509L1488 519ZM1550 443L1532 484L1541 441ZM1553 506L1550 515L1526 490ZM1575 536L1558 572L1533 558ZM1463 468L1449 457L1463 437ZM1559 261L1600 250L1593 292ZM600 929L638 919L639 924ZM638 919L664 895L639 924ZM638 919L607 902L664 895ZM882 113L871 109L886 73ZM871 109L855 110L856 77ZM1527 403L1499 406L1507 368ZM1583 352L1562 326L1600 350ZM1401 309L1390 290L1407 311ZM303 727L292 758L275 747ZM1527 403L1559 413L1541 441ZM1559 413L1553 442L1541 441ZM1553 442L1559 413L1564 418ZM1420 400L1420 384L1443 401ZM1464 385L1456 359L1468 358ZM1420 384L1464 385L1443 401ZM305 653L329 639L344 663Z'/><path fill='#b8b8c0' stroke='#b8b8c0' stroke-width='.6' d='M1600 850L1600 900L1561 873ZM1600 750L1569 778L1572 740ZM1569 778L1600 750L1600 800ZM81 15L88 62L40 65ZM1600 950L1568 935L1600 900ZM1568 935L1600 950L1561 958ZM1098 522L1084 531L1094 520ZM1063 515L1065 511L1069 524ZM1600 850L1548 839L1600 800ZM1548 839L1569 778L1600 800ZM1160 597L1136 612L1134 602ZM1164 578L1176 573L1161 586ZM1137 634L1136 612L1147 638Z'/><path fill='#c0a890' stroke='#c0a890' stroke-width='.6' d='M1467 940L1402 942L1442 919ZM1285 833L1308 792L1315 839ZM1122 943L1085 949L1067 902ZM1125 882L1131 887L1122 943ZM1256 874L1253 877L1241 840ZM1268 169L1298 138L1310 159ZM1074 345L1070 339L1089 343ZM1183 627L1183 657L1177 655ZM1398 139L1412 142L1402 152ZM1269 183L1253 180L1268 169Z'/><path fill='#c0b8a8' stroke='#c0b8a8' stroke-width='.6' d='M1553 773L1516 742L1572 740ZM1550 443L1556 445L1532 484ZM1551 493L1553 506L1526 490ZM1085 19L1085 32L1050 0ZM549 931L607 902L600 929ZM607 902L549 931L561 873ZM618 847L633 838L664 895ZM1559 261L1579 229L1600 250ZM1027 73L1085 32L1089 86ZM1245 163L1251 143L1268 169ZM601 372L637 401L588 396ZM250 681L275 747L232 734ZM664 895L642 835L692 843ZM633 838L642 835L664 895ZM1553 442L1567 436L1556 445ZM1568 410L1575 412L1564 418ZM137 793L136 757L173 793ZM942 650L988 634L968 697ZM1016 134L1014 129L1017 117ZM312 711L303 727L250 681ZM1578 352L1561 340L1562 326ZM1583 352L1578 352L1562 326ZM1561 376L1559 413L1541 384Z'/><path fill='#685840' stroke='#685840' stroke-width='.6' d='M1143 982L1144 974L1157 985ZM1247 686L1246 677L1251 681ZM1104 180L1102 185L1092 176ZM280 920L284 926L264 925ZM437 804L438 802L449 806Z'/><path fill='#786850' stroke='#786850' stroke-width='.6' d='M1150 1000L1143 982L1157 985ZM490 21L460 41L472 23ZM882 113L864 132L870 111ZM1247 686L1240 681L1241 680ZM960 630L949 632L942 619ZM438 802L432 795L449 806ZM567 372L560 377L547 358Z'/><path fill='#a89060' stroke='#a89060' stroke-width='.6' d='M1144 974L1143 982L1116 987ZM1143 982L1150 1000L1116 987ZM1139 964L1144 974L1116 987ZM580 595L575 624L563 592ZM645 431L643 436L621 441ZM453 319L471 333L449 353ZM1400 178L1397 174L1402 177ZM1397 174L1401 165L1402 177Z'/><path fill='#b0a078' stroke='#b0a078' stroke-width='.6' d='M1050 1000L1038 946L1075 994Z'/><path fill='#a88048' stroke='#a88048' stroke-width='.6' d='M1050 1000L1075 994L1100 1000ZM1315 418L1320 431L1308 443ZM807 228L844 212L844 265ZM440 520L443 485L443 519ZM1132 237L1118 264L1113 238ZM1132 237L1132 224L1164 220ZM1132 237L1132 285L1118 264ZM1130 355L1128 350L1140 344ZM1220 584L1227 592L1206 598ZM1027 363L1018 384L995 359ZM312 770L318 765L320 770ZM1179 327L1180 329L1177 326Z'/><path fill='#080818' stroke='#080818' stroke-width='.6' d='M1174 977L1178 975L1200 1000ZM1171 973L1174 977L1157 985Z'/><path fill='#989898' stroke='#989898' stroke-width='.6' d='M1180 965L1165 957L1168 936ZM584 387L601 372L588 396ZM1136 612L1126 605L1134 602Z'/><path fill='#482010' stroke='#482010' stroke-width='.6' d='M922 448L964 433L941 498ZM1264 523L1271 531L1262 534Z'/><path fill='#704018' stroke='#704018' stroke-width='.6' d='M991 468L995 487L941 498ZM803 443L805 430L825 432ZM841 440L844 464L809 462ZM964 584L944 587L961 576ZM1458 545L1478 548L1468 566ZM1058 297L1068 315L1049 302ZM1273 633L1231 638L1270 620ZM939 259L949 253L943 269ZM1168 331L1156 310L1166 310ZM1178 318L1174 304L1182 309ZM881 536L922 535L881 553ZM1290 420L1307 402L1315 418ZM439 669L414 663L418 659ZM1276 433L1263 421L1271 412ZM1180 398L1184 394L1186 408Z'/><path fill='#583818' stroke='#583818' stroke-width='.6' d='M964 433L991 468L941 498ZM694 520L666 485L693 470ZM246 547L265 560L233 588ZM772 623L753 602L798 610ZM976 421L996 447L964 433ZM1098 240L1113 226L1113 238ZM305 273L313 287L283 291ZM469 77L503 105L474 130ZM785 265L735 258L752 233ZM455 686L449 667L458 680ZM1091 227L1079 226L1098 195ZM1075 243L1091 227L1098 240ZM743 309L735 309L720 296ZM1116 203L1121 204L1107 214ZM392 641L392 644L376 631ZM1132 224L1130 223L1129 212ZM1036 280L1048 279L1043 287ZM315 730L318 716L326 732Z'/><path fill='#603818' stroke='#603818' stroke-width='.6' d='M981 405L942 393L946 365ZM798 551L814 604L776 567ZM1467 516L1469 540L1445 525ZM1458 545L1443 537L1445 525ZM1287 556L1285 571L1279 568ZM341 170L368 152L347 172ZM148 857L160 890L145 880ZM117 700L127 659L136 696ZM1202 390L1205 405L1184 394Z'/><path fill='#d0c8d0' stroke='#d0c8d0' stroke-width='.6' d='M1054 564L1093 566L1072 610ZM1093 566L1087 609L1072 610Z'/><path fill='#603808' stroke='#603808' stroke-width='.6' d='M1250 1000L1289 980L1300 1000ZM369 150L345 118L406 105ZM750 491L729 542L721 501ZM169 133L171 152L157 143ZM1324 515L1330 523L1315 524ZM264 925L239 938L210 903ZM751 686L743 687L749 679ZM1195 313L1178 318L1182 309ZM1179 449L1210 450L1181 464ZM249 84L224 123L203 84ZM919 353L930 359L919 370ZM1357 632L1355 637L1352 636ZM190 954L176 931L199 935Z'/><path fill='#785020' stroke='#785020' stroke-width='.6' d='M1300 1000L1289 980L1331 1001ZM556 105L562 114L540 136ZM666 485L694 520L661 503ZM945 225L937 246L893 205ZM852 354L861 353L853 362ZM482 140L485 175L468 178ZM485 175L491 177L468 178ZM544 147L491 177L510 127ZM1083 261L1098 240L1084 262ZM1478 548L1478 539L1498 546ZM126 65L152 94L137 102ZM448 130L472 138L468 178ZM324 38L348 26L329 43ZM1246 606L1243 595L1254 603ZM1231 638L1230 665L1225 663ZM1330 646L1334 643L1349 650ZM487 505L514 535L493 539ZM682 792L691 798L671 814ZM540 640L513 680L503 665ZM1133 362L1131 359L1135 359ZM1133 362L1126 378L1124 368ZM1304 338L1294 312L1300 309ZM1300 309L1294 312L1301 307ZM142 844L175 830L148 857ZM1292 391L1283 358L1305 366ZM1177 324L1174 322L1178 318Z'/><path fill='#888080' stroke='#888080' stroke-width='.6' d='M1217 987L1230 926L1222 987ZM329 639L305 653L308 643Z'/><path fill='#887868' stroke='#887868' stroke-width='.6' d='M1230 926L1257 946L1222 987ZM688 201L706 191L701 219ZM660 263L628 256L658 227ZM1192 696L1182 691L1192 673ZM1104 180L1092 176L1109 176ZM291 923L284 926L280 920ZM358 889L353 902L351 893ZM1417 394L1411 397L1407 381Z'/><path fill='#a09898' stroke='#a09898' stroke-width='.6' d='M1230 926L1180 965L1168 936Z'/><path fill='#a8a090' stroke='#a8a090' stroke-width='.6' d='M1189 891L1230 926L1168 936ZM271 765L250 785L232 734ZM1065 156L1072 153L1070 162ZM1072 153L1088 170L1070 162ZM551 41L550 37L578 36ZM698 72L694 76L682 66ZM1140 178L1125 178L1144 173ZM1417 394L1420 400L1416 403Z'/><path fill='#786040' stroke='#786040' stroke-width='.6' d='M1257 946L1230 926L1248 889ZM1051 239L1047 265L1040 236ZM1460 497L1459 496L1457 492ZM637 448L642 442L638 448ZM613 843L620 840L618 847ZM776 132L803 159L768 169ZM973 625L973 622L993 625ZM520 483L523 483L521 484ZM202 943L222 948L212 955ZM615 445L631 444L612 450Z'/><path fill='#d0c8b8' stroke='#d0c8b8' stroke-width='.6' d='M1510 449L1506 444L1541 441ZM1504 481L1506 444L1510 449ZM1550 515L1516 509L1526 490ZM1516 547L1516 509L1550 515ZM1474 511L1504 481L1488 519ZM871 109L856 77L886 73ZM1078 468L1084 432L1118 445ZM1506 444L1518 410L1541 441ZM1504 481L1463 468L1506 444ZM1423 227L1443 264L1427 273ZM1443 264L1423 227L1456 239ZM1032 36L1027 73L976 37ZM1027 73L987 78L976 37ZM499 988L509 988L500 1000ZM1089 383L1110 409L1094 421ZM1513 545L1516 509L1516 547ZM1513 545L1509 542L1516 509ZM1551 252L1518 272L1536 241ZM1513 364L1541 384L1527 403ZM1499 406L1489 366L1507 368ZM1486 410L1489 366L1499 406ZM1541 384L1559 413L1527 403ZM1561 376L1556 364L1561 363ZM1502 354L1528 314L1536 325ZM1484 319L1468 305L1492 275ZM329 699L305 653L344 663Z'/><path fill='#d0c8c0' stroke='#d0c8c0' stroke-width='.6' d='M1516 547L1550 515L1533 558ZM1557 492L1556 445L1569 491ZM1191 590L1192 611L1175 607Z'/><path fill='#a05808' stroke='#a05808' stroke-width='.6' d='M1163 474L1181 464L1168 477ZM185 439L151 431L175 398Z'/><path fill='#b08850' stroke='#b08850' stroke-width='.6' d='M1115 468L1131 473L1118 485ZM443 485L462 506L443 519ZM1455 662L1445 649L1455 660ZM875 215L882 221L844 265ZM1333 617L1329 628L1325 620ZM1355 568L1375 586L1350 574ZM1135 359L1130 355L1140 344ZM418 873L412 876L419 842ZM1174 322L1177 326L1168 331ZM1329 628L1338 617L1352 636ZM1342 612L1339 598L1352 590Z'/><path fill='#684828' stroke='#684828' stroke-width='.6' d='M1338 433L1322 405L1352 419ZM605 470L610 462L634 479ZM1079 226L1064 228L1049 196ZM889 249L913 288L884 274ZM1045 198L1045 210L1042 207ZM540 640L519 597L548 609ZM362 637L357 632L366 637ZM993 625L973 622L978 605ZM885 143L881 136L906 128ZM523 483L530 499L521 484Z'/><path fill='#382820' stroke='#382820' stroke-width='.6' d='M1360 451L1363 445L1375 446ZM1363 445L1364 437L1375 446ZM1363 477L1360 451L1375 446ZM1364 437L1385 417L1375 446ZM534 576L534 592L519 597ZM1012 629L1018 622L1025 628ZM81 837L90 848L85 850ZM175 830L169 800L174 801ZM91 835L103 854L91 847ZM1385 417L1387 418L1375 446ZM1387 418L1424 448L1375 446ZM129 839L117 850L104 826ZM568 391L561 377L567 372Z'/><path fill='#281008' stroke='#281008' stroke-width='.6' d='M1451 515L1445 525L1422 506ZM1451 498L1451 515L1422 506ZM1354 666L1341 669L1349 650ZM314 366L279 398L276 363ZM1225 663L1219 676L1218 676ZM1225 663L1230 665L1230 675ZM199 199L214 229L189 232ZM305 454L343 452L336 472ZM488 587L448 563L466 546ZM906 472L919 444L922 448ZM1230 665L1246 677L1230 675ZM1228 559L1222 555L1219 542ZM653 509L664 530L660 535ZM1268 557L1262 569L1254 572ZM1329 675L1320 657L1341 669ZM753 315L748 316L746 308ZM725 610L680 635L677 610Z'/><path fill='#402818' stroke='#402818' stroke-width='.6' d='M1445 525L1443 537L1423 539ZM416 283L423 310L386 314ZM1202 675L1218 676L1207 681ZM1317 496L1363 477L1353 506ZM417 539L440 520L439 562ZM1095 659L1074 658L1088 649ZM1384 494L1377 487L1387 490ZM1011 605L1018 602L1025 612ZM1423 539L1398 526L1422 506ZM734 472L737 468L738 488ZM1211 575L1207 584L1209 569ZM1108 646L1095 659L1088 649ZM1051 628L1039 639L1034 636Z'/><path fill='#584840' stroke='#584840' stroke-width='.6' d='M1424 448L1418 459L1375 446ZM358 889L351 893L359 886ZM90 848L103 854L85 850ZM175 830L145 819L169 800ZM1387 418L1385 408L1394 397ZM1419 412L1421 414L1423 419Z'/><path fill='#402810' stroke='#402810' stroke-width='.6' d='M1451 515L1451 498L1462 499ZM314 366L305 322L348 332ZM684 585L677 610L655 600ZM666 485L634 479L667 457ZM1359 365L1352 319L1370 330ZM575 121L594 117L566 158ZM790 280L827 284L799 313ZM790 280L746 308L736 265ZM979 552L976 582L961 576ZM1377 487L1390 466L1387 490ZM664 530L653 509L661 503ZM1011 605L1005 617L1010 603ZM1279 659L1288 673L1282 687ZM276 153L307 162L293 185ZM746 308L743 309L720 296ZM1095 659L1105 657L1095 664ZM1105 657L1106 669L1095 664ZM566 267L547 271L555 266ZM535 736L512 722L549 707ZM318 716L325 715L326 732ZM1039 639L1051 628L1043 641Z'/><path fill='#483020' stroke='#483020' stroke-width='.6' d='M1434 456L1419 480L1418 459ZM1372 659L1359 667L1349 650ZM776 536L798 551L779 551ZM1218 676L1218 678L1207 681ZM755 178L745 170L768 169ZM1156 657L1143 677L1132 657ZM1398 526L1410 550L1396 545ZM355 602L364 605L343 613ZM410 819L405 821L407 791ZM413 438L401 435L422 423Z'/><path fill='#281810' stroke='#281810' stroke-width='.6' d='M1419 480L1434 456L1443 474ZM637 448L638 448L634 479ZM1018 622L1011 605L1025 612ZM1018 622L1012 629L1005 617ZM185 799L175 830L174 801ZM542 402L563 404L551 412ZM357 632L343 636L343 613ZM343 636L334 622L343 613Z'/><path fill='#c0c0b0' stroke='#c0c0b0' stroke-width='.6' d='M1449 457L1443 451L1463 437ZM1600 250L1600 300L1593 292ZM1562 326L1600 300L1600 350ZM1600 250L1579 229L1600 200ZM1600 300L1559 321L1593 292ZM1556 445L1567 436L1581 446ZM1575 412L1567 436L1564 418ZM1567 436L1553 442L1564 418ZM1561 363L1578 352L1582 368ZM1578 352L1583 352L1582 368ZM1578 352L1561 363L1561 340ZM1561 376L1561 363L1582 368Z'/><path fill='#403028' stroke='#403028' stroke-width='.6' d='M1418 459L1390 466L1375 446ZM628 256L608 229L658 227ZM131 831L129 839L104 826Z'/><path fill='#685038' stroke='#685038' stroke-width='.6' d='M1419 480L1390 466L1418 459ZM969 128L941 158L946 122ZM416 283L421 278L423 310ZM1021 587L1018 602L1010 603ZM941 158L934 129L946 122ZM1079 173L1047 185L1070 162ZM238 941L239 938L264 925ZM316 565L319 580L303 590ZM1074 658L1074 669L1068 670ZM1183 657L1193 659L1192 673ZM729 104L743 97L756 107ZM1029 161L1065 156L1047 185ZM1043 641L1043 649L1039 647ZM476 696L481 696L474 701ZM560 377L561 377L554 385Z'/><path fill='#b09878' stroke='#b09878' stroke-width='.6' d='M1361 794L1367 827L1315 839ZM1511 555L1516 547L1533 558ZM580 595L598 557L603 589ZM817 183L817 199L813 180ZM1403 354L1398 335L1399 336ZM88 701L117 700L85 723ZM370 872L405 821L399 876ZM1043 396L1045 376L1069 388Z'/><path fill='#c8c0a0' stroke='#c8c0a0' stroke-width='.6' d='M1367 827L1424 804L1416 831ZM1600 100L1550 136L1544 114ZM1518 12L1550 0L1558 15ZM1468 29L1432 27L1450 0ZM1286 105L1304 104L1283 123ZM1547 205L1538 159L1565 191ZM1513 364L1527 403L1507 368ZM1322 137L1298 138L1304 104ZM1518 272L1551 289L1543 295ZM1551 289L1559 261L1593 292ZM1533 306L1520 308L1518 272ZM1456 359L1412 365L1453 330ZM1434 282L1421 309L1427 273ZM949 67L935 124L886 73ZM1488 204L1479 215L1478 203Z'/><path fill='#c0a888' stroke='#c0a888' stroke-width='.6' d='M1424 804L1367 827L1361 794ZM611 601L639 603L632 638ZM1110 429L1127 427L1118 445ZM1528 791L1485 814L1516 742ZM359 586L355 568L377 592ZM395 520L415 537L377 551Z'/><path fill='#d0c0a0' stroke='#d0c0a0' stroke-width='.6' d='M1449 795L1424 804L1431 770ZM1300 0L1350 0L1314 12ZM1431 852L1417 893L1416 831ZM1528 133L1501 126L1544 114ZM1565 191L1547 156L1600 150ZM1303 76L1378 72L1360 111ZM1538 159L1547 156L1565 191ZM1538 159L1528 133L1550 136ZM585 691L566 653L586 642ZM1347 123L1304 104L1360 111ZM1571 230L1557 256L1553 253ZM1088 352L1074 345L1089 343ZM1412 142L1398 139L1405 122ZM1398 139L1399 124L1405 122ZM1571 230L1542 221L1547 205ZM329 699L340 707L326 706ZM1547 205L1488 204L1498 177ZM1488 204L1478 203L1498 177ZM1402 177L1401 165L1421 176Z'/><path fill='#a8a098' stroke='#a8a098' stroke-width='.6' d='M1600 650L1591 631L1600 600ZM298 16L304 22L257 16ZM490 21L472 23L474 19ZM1153 186L1140 178L1144 173ZM312 626L322 613L316 625ZM1112 641L1108 646L1093 631Z'/><path fill='#d0c8c8' stroke='#d0c8c8' stroke-width='.6' d='M1531 648L1555 645L1545 688ZM1557 492L1553 506L1551 493ZM1050 407L1051 420L1044 406Z'/><path fill='#c8c0c0' stroke='#c8c0c0' stroke-width='.6' d='M1555 645L1582 669L1545 688ZM776 59L763 102L746 93ZM556 8L547 36L539 32ZM1046 443L1009 422L1050 427Z'/><path fill='#a890a0' stroke='#a890a0' stroke-width='.6' d='M1531 648L1509 642L1506 617ZM1164 518L1169 522L1163 523Z'/><path fill='#b09870' stroke='#b09870' stroke-width='.6' d='M1447 675L1430 681L1428 664ZM1085 949L1091 967L1075 994ZM577 544L580 595L563 592ZM574 474L543 444L590 466Z'/><path fill='#a89070' stroke='#a89070' stroke-width='.6' d='M1430 681L1425 667L1428 664ZM893 205L941 158L950 168ZM58 888L70 891L69 906ZM817 199L817 183L839 200ZM720 788L707 797L701 794ZM1206 598L1207 584L1210 585ZM129 839L131 831L142 844ZM318 756L312 770L292 758Z'/><path fill='#382018' stroke='#382018' stroke-width='.6' d='M1359 667L1354 666L1349 650ZM1230 675L1246 677L1241 680ZM712 392L666 374L692 352ZM1161 677L1171 663L1172 677ZM434 805L437 804L428 825ZM413 438L394 450L401 435Z'/><path fill='#a89888' stroke='#a89888' stroke-width='.6' d='M1362 699L1354 666L1359 667ZM1230 896L1230 926L1189 891ZM1517 648L1485 649L1509 642ZM1302 177L1268 169L1310 159ZM750 737L763 714L789 743ZM871 109L882 113L870 111ZM351 893L352 903L332 908ZM1362 699L1332 676L1341 669ZM85 826L81 837L74 828ZM1020 642L1016 636L1021 638ZM1420 384L1407 381L1410 372ZM371 878L373 874L399 876ZM1417 394L1407 381L1420 384Z'/><path fill='#a09080' stroke='#a09080' stroke-width='.6' d='M1354 666L1362 699L1341 669ZM975 124L969 128L946 122ZM126 65L88 62L113 37ZM791 712L763 714L778 698ZM975 124L977 134L969 128ZM355 568L335 535L348 530ZM703 81L698 72L703 73ZM648 358L637 401L636 352ZM87 827L92 826L91 835ZM104 826L102 826L98 822ZM627 302L633 320L602 321ZM545 680L540 640L566 653ZM1016 636L1023 637L1021 638ZM1023 637L1020 642L1021 638ZM1030 600L1034 597L1033 606ZM1004 631L1008 634L1001 633ZM1009 141L1017 143L1005 144ZM1435 436L1430 425L1441 437Z'/><path fill='#402010' stroke='#402010' stroke-width='.6' d='M1341 669L1330 646L1349 650ZM1317 496L1304 472L1326 455ZM1368 486L1364 505L1353 506ZM1352 319L1359 365L1324 351ZM265 560L275 597L233 588ZM360 215L347 172L366 200ZM220 251L215 248L221 231ZM1222 555L1228 559L1209 569ZM375 448L351 463L343 452ZM780 355L782 347L784 356ZM497 671L495 664L503 665ZM855 533L875 536L881 553ZM401 435L409 412L422 423ZM351 463L365 474L336 472ZM379 483L365 474L375 448ZM1121 204L1128 195L1132 196Z'/><path fill='#987860' stroke='#987860' stroke-width='.6' d='M1469 580L1449 574L1468 566ZM1563 590L1568 591L1561 591ZM1083 315L1077 310L1085 311ZM1325 590L1315 590L1323 588ZM1246 412L1238 412L1239 395Z'/><path fill='#987058' stroke='#987058' stroke-width='.6' d='M1495 561L1469 580L1468 566ZM1085 311L1077 310L1083 303ZM1571 595L1576 598L1568 602ZM1217 447L1213 433L1225 437Z'/><path fill='#a07870' stroke='#a07870' stroke-width='.6' d='M1469 580L1495 561L1479 588Z'/><path fill='#c0c0a8' stroke='#c0c0a8' stroke-width='.6' d='M1600 50L1558 15L1600 0ZM1557 492L1551 493L1532 484Z'/><path fill='#d8d0b8' stroke='#d8d0b8' stroke-width='.6' d='M1432 27L1417 11L1432 10ZM1501 126L1501 67L1544 114ZM1432 27L1454 67L1424 63ZM1378 72L1379 20L1424 63ZM1454 67L1458 80L1424 63ZM1458 80L1454 67L1501 67ZM1481 244L1471 276L1456 239ZM1471 276L1443 264L1456 239ZM1480 226L1481 244L1456 239ZM1443 299L1471 276L1453 302ZM1536 241L1514 269L1508 266ZM1518 272L1514 269L1536 241ZM1385 223L1414 217L1423 227ZM1556 364L1554 333L1561 340ZM1471 276L1468 305L1453 302ZM1492 275L1468 305L1471 276ZM1444 207L1479 215L1456 239ZM1421 309L1443 311L1453 330ZM1443 299L1434 282L1471 276ZM1502 354L1513 364L1507 368ZM1528 314L1502 354L1492 346ZM1468 305L1466 308L1453 302ZM1466 308L1443 311L1453 302ZM1479 215L1498 233L1480 226ZM1481 244L1498 233L1508 266ZM1376 246L1423 227L1427 273ZM1528 314L1487 329L1520 308ZM1480 330L1466 308L1484 319ZM1453 330L1480 330L1468 358Z'/><path fill='#d8d0c0' stroke='#d8d0c0' stroke-width='.6' d='M1417 11L1379 20L1400 0ZM1517 648L1531 648L1518 683ZM1500 858L1449 879L1461 845ZM1488 10L1450 0L1500 0ZM1488 10L1468 29L1450 0ZM1488 10L1498 45L1468 29ZM1423 227L1444 207L1456 239ZM1482 415L1499 406L1506 444ZM1454 433L1468 414L1463 437ZM1414 217L1394 202L1413 207ZM1423 227L1414 217L1444 207ZM1489 366L1502 354L1507 368ZM1485 411L1499 406L1482 415ZM1485 411L1486 410L1499 406ZM1468 414L1485 411L1482 415ZM1486 410L1485 411L1468 414ZM1480 226L1498 233L1481 244ZM1464 385L1486 410L1468 414ZM1487 329L1484 319L1520 308ZM1487 329L1528 314L1492 346ZM1466 308L1480 330L1453 330ZM1480 330L1487 329L1492 346Z'/><path fill='#e0d8c0' stroke='#e0d8c0' stroke-width='.6' d='M1379 20L1417 11L1424 63ZM1458 80L1419 117L1424 63ZM1419 117L1378 72L1424 63Z'/><path fill='#d8c8a8' stroke='#d8c8a8' stroke-width='.6' d='M1350 0L1379 20L1314 12ZM1132 840L1117 871L1073 852ZM1414 193L1400 178L1402 177ZM1381 126L1379 126L1360 111Z'/><path fill='#b8a8b0' stroke='#b8a8b0' stroke-width='.6' d='M1368 185L1385 204L1330 215ZM1308 225L1287 253L1286 212ZM1358 241L1310 228L1330 215ZM1358 241L1311 263L1310 228Z'/><path fill='#b0a0b0' stroke='#b0a0b0' stroke-width='.6' d='M1308 187L1368 185L1330 215ZM1308 225L1308 187L1330 215ZM1362 167L1368 185L1308 187Z'/><path fill='#987868' stroke='#987868' stroke-width='.6' d='M1385 204L1368 185L1398 191ZM1561 591L1561 607L1539 599Z'/><path fill='#c8c8c0' stroke='#c8c8c0' stroke-width='.6' d='M750 0L744 15L700 0ZM776 59L775 14L800 0ZM775 14L776 59L744 15ZM1575 536L1553 506L1569 491ZM608 56L584 25L600 0ZM728 68L776 59L746 93ZM556 8L584 25L578 36ZM647 38L608 56L600 0ZM584 25L581 38L578 36ZM700 24L698 72L682 66ZM703 73L698 72L700 24ZM1582 368L1583 352L1600 350Z'/><path fill='#c8c8c8' stroke='#c8c8c8' stroke-width='.6' d='M744 15L700 24L700 0ZM750 0L775 14L744 15ZM100 0L150 0L113 37ZM550 0L532 23L500 0ZM728 68L700 24L744 15ZM776 59L728 68L744 15ZM81 15L50 0L100 0ZM556 8L550 0L600 0ZM556 8L532 23L550 0ZM532 23L556 8L539 32ZM647 38L700 24L682 66ZM150 0L194 37L151 35ZM728 68L703 73L700 24ZM1147 638L1136 612L1158 635ZM1122 617L1093 631L1087 609ZM1160 597L1161 586L1168 599Z'/><path fill='#c0c8c8' stroke='#c0c8c8' stroke-width='.6' d='M150 0L151 35L113 37ZM226 23L218 9L250 0Z'/><path fill='#887040' stroke='#887040' stroke-width='.6' d='M19 112L11 130L0 100ZM1367 529L1394 530L1389 552ZM1376 246L1376 238L1385 223Z'/><path fill='#785838' stroke='#785838' stroke-width='.6' d='M88 62L87 118L40 65ZM853 164L876 152L852 181ZM723 730L763 714L750 737ZM1045 210L1045 198L1049 196ZM1304 577L1300 579L1296 560ZM1311 583L1304 577L1306 577ZM1394 530L1396 545L1389 552ZM162 689L151 691L154 670Z'/><path fill='#201000' stroke='#201000' stroke-width='.6' d='M87 118L104 149L51 131ZM624 115L638 105L646 140ZM638 105L624 115L626 90ZM666 485L681 458L693 470Z'/><path fill='#b07028' stroke='#b07028' stroke-width='.6' d='M0 450L14 496L0 500ZM54 463L14 496L18 456ZM396 735L401 731L420 735ZM44 514L14 496L61 489Z'/><path fill='#a86818' stroke='#a86818' stroke-width='.6' d='M14 496L0 450L18 456ZM791 392L805 430L776 425ZM0 600L0 550L1 569ZM273 408L252 431L268 399Z'/><path fill='#b07828' stroke='#b07828' stroke-width='.6' d='M14 496L54 463L61 489ZM513 205L544 147L561 159ZM1208 339L1204 349L1189 344ZM1222 355L1209 368L1203 360Z'/><path fill='#704010' stroke='#704010' stroke-width='.6' d='M86 208L81 253L66 216ZM81 253L86 208L113 227ZM844 464L815 475L809 462ZM172 205L189 232L160 243ZM1297 496L1274 512L1261 490ZM1205 291L1197 289L1199 282ZM1297 496L1288 462L1304 472ZM124 158L122 141L157 143ZM341 170L360 215L298 224ZM414 212L441 217L409 251ZM1323 651L1315 633L1330 646ZM38 604L32 599L33 595ZM307 162L276 153L309 134ZM933 371L930 359L946 365ZM160 890L201 897L176 931ZM44 540L53 510L57 546ZM36 566L70 583L33 595ZM36 566L4 577L1 569ZM336 713L349 722L326 732ZM1276 433L1271 412L1287 421ZM1180 398L1183 394L1184 394Z'/><path fill='#602808' stroke='#602808' stroke-width='.6' d='M83 356L132 370L117 417ZM100 272L113 227L134 254ZM350 745L364 732L372 747ZM401 435L364 417L369 407Z'/><path fill='#703008' stroke='#703008' stroke-width='.6' d='M114 327L132 370L83 356ZM83 356L24 354L79 315ZM86 315L83 356L79 315ZM119 449L119 494L87 477ZM64 393L24 354L83 356ZM64 393L83 356L117 417ZM17 401L64 393L39 417ZM102 276L86 315L79 315Z'/><path fill='#c07010' stroke='#c07010' stroke-width='.6' d='M156 312L172 304L186 327Z'/><path fill='#d09040' stroke='#d09040' stroke-width='.6' d='M172 304L202 328L186 327Z'/><path fill='#d0a870' stroke='#d0a870' stroke-width='.6' d='M202 328L172 304L219 298ZM488 474L468 453L487 466ZM1108 337L1110 329L1125 340Z'/><path fill='#c8b090' stroke='#c8b090' stroke-width='.6' d='M223 308L202 328L219 298ZM1085 949L1038 946L1067 902Z'/><path fill='#482000' stroke='#482000' stroke-width='.6' d='M113 227L143 245L134 254ZM1458 545L1446 555L1443 537ZM268 609L275 597L270 612ZM160 582L181 588L176 606ZM1264 523L1255 509L1259 510ZM1264 523L1259 510L1274 512ZM359 886L351 893L350 835ZM57 546L66 502L78 501ZM1138 307L1139 299L1154 297Z'/><path fill='#b06810' stroke='#b06810' stroke-width='.6' d='M197 407L185 439L175 398ZM205 552L222 585L181 588Z'/><path fill='#502008' stroke='#502008' stroke-width='.6' d='M151 431L180 465L127 453ZM246 547L215 555L208 506ZM200 650L154 670L162 631ZM1139 299L1141 292L1154 297Z'/><path fill='#804008' stroke='#804008' stroke-width='.6' d='M151 431L185 439L180 465ZM24 299L24 354L0 350ZM158 357L114 327L156 312ZM327 823L350 835L298 895ZM197 407L215 417L185 439ZM549 807L535 736L566 794ZM361 805L317 799L320 770ZM317 799L361 805L327 823Z'/><path fill='#381008' stroke='#381008' stroke-width='.6' d='M151 431L119 449L117 417ZM119 449L151 431L127 453Z'/><path fill='#482808' stroke='#482808' stroke-width='.6' d='M305 322L276 363L267 322ZM737 468L751 443L761 460ZM410 113L369 150L406 105ZM11 202L14 198L66 216ZM112 159L86 208L85 173ZM122 141L112 159L104 149ZM1315 524L1301 530L1297 496ZM615 776L642 754L665 796ZM1091 227L1113 226L1098 240ZM1193 328L1178 318L1195 313ZM1323 651L1330 646L1341 669ZM1321 349L1352 319L1324 351ZM1275 542L1271 531L1287 540ZM117 871L134 885L86 900ZM208 834L211 794L245 814Z'/><path fill='#b0b0a0' stroke='#b0b0a0' stroke-width='.6' d='M389 17L350 0L400 0ZM434 5L402 15L400 0Z'/><path fill='#a8a898' stroke='#a8a898' stroke-width='.6' d='M350 0L389 17L351 8ZM474 19L472 23L450 0Z'/><path fill='#c8c8d0' stroke='#c8c8d0' stroke-width='.6' d='M257 16L250 0L300 0ZM28 38L0 50L0 0ZM50 0L28 38L0 0ZM81 15L100 0L113 37ZM81 15L28 38L50 0ZM28 38L81 15L40 65ZM250 0L218 9L200 0ZM1041 549L1047 536L1054 564ZM1069 524L1084 531L1054 564ZM1024 537L1041 549L1025 546ZM1041 549L1024 537L1047 536ZM1085 507L1065 511L1082 494ZM1047 536L1063 515L1069 524ZM1122 617L1087 609L1121 605ZM194 37L150 0L200 0ZM1035 514L998 496L1033 475ZM1161 586L1176 573L1168 599Z'/><path fill='#c0c8c0' stroke='#c0c8c0' stroke-width='.6' d='M474 19L450 0L500 0ZM1593 426L1575 412L1600 400Z'/><path fill='#805828' stroke='#805828' stroke-width='.6' d='M506 68L531 40L535 76ZM562 114L556 136L540 136ZM1256 874L1307 853L1320 873ZM1417 583L1432 590L1404 608ZM402 15L410 61L388 59ZM534 82L573 83L556 105ZM491 177L485 175L482 140ZM763 714L723 730L729 691ZM814 604L851 607L834 642ZM1478 548L1498 546L1495 561ZM1319 316L1300 309L1301 307ZM1418 580L1432 590L1417 583ZM1366 555L1350 537L1367 529ZM1116 203L1107 214L1098 195ZM593 856L563 861L604 833ZM1127 379L1133 362L1142 361ZM1270 354L1283 358L1271 379ZM1283 358L1273 340L1296 349ZM448 49L425 34L460 41ZM555 266L547 271L536 264ZM418 873L432 866L421 903ZM1140 288L1141 292L1131 288ZM929 560L922 535L952 549ZM1338 617L1342 612L1358 620ZM1337 602L1342 612L1334 610ZM994 394L1003 392L1012 396ZM1179 327L1177 324L1178 318Z'/><path fill='#785830' stroke='#785830' stroke-width='.6' d='M531 40L506 68L503 28ZM694 426L681 458L685 423ZM1478 539L1499 536L1498 546ZM543 444L543 458L487 466ZM1401 579L1404 608L1390 589ZM1305 366L1321 349L1324 351ZM387 211L394 203L414 212ZM1070 293L1068 315L1058 297ZM1388 648L1395 655L1389 656ZM876 152L885 143L898 158ZM1012 260L1011 256L1020 263ZM1043 396L1033 378L1045 376ZM1027 363L1037 374L1033 378ZM134 866L140 874L134 885ZM476 696L455 686L458 680ZM1376 246L1373 264L1358 241Z'/><path fill='#988870' stroke='#988870' stroke-width='.6' d='M532 23L531 40L503 28ZM389 17L360 26L351 8ZM1340 441L1343 448L1326 445ZM1372 659L1373 665L1359 667ZM348 26L330 15L351 8ZM434 5L425 34L402 15ZM968 627L988 634L960 630ZM1001 633L988 634L993 625ZM935 124L906 128L886 73ZM319 580L340 613L314 588Z'/><path fill='#908070' stroke='#908070' stroke-width='.6' d='M531 40L532 23L539 32ZM998 514L1000 541L992 531ZM1343 448L1340 441L1363 445ZM763 102L756 107L746 93ZM1340 441L1339 435L1364 437ZM92 826L102 826L91 835ZM756 107L743 97L746 93ZM1008 634L1004 631L1012 629ZM703 81L694 76L698 72ZM340 613L323 612L314 588ZM1420 400L1420 409L1416 403ZM1411 397L1417 394L1416 403Z'/><path fill='#503018' stroke='#503018' stroke-width='.6' d='M1304 472L1310 449L1326 455ZM310 540L265 560L297 528ZM482 140L474 130L510 127ZM1371 489L1384 494L1364 505ZM923 520L903 507L941 498ZM1467 510L1451 515L1462 499ZM1379 382L1344 387L1359 365ZM1405 556L1410 550L1422 575ZM1344 387L1337 369L1359 365ZM1268 558L1262 569L1268 557ZM394 450L379 483L375 448ZM134 866L142 844L148 857ZM1211 575L1220 584L1210 585Z'/><path fill='#482818' stroke='#482818' stroke-width='.6' d='M1310 449L1326 445L1326 455ZM784 356L797 361L787 364ZM1262 569L1272 565L1271 577ZM1320 657L1315 676L1309 665ZM1195 525L1188 515L1220 494ZM1228 559L1211 575L1209 569ZM1238 412L1228 400L1233 398Z'/><path fill='#b8b0b8' stroke='#b8b0b8' stroke-width='.6' d='M1310 228L1308 225L1330 215ZM1600 950L1574 977L1561 958ZM1600 900L1568 935L1561 873ZM1024 537L1000 541L998 514ZM1161 586L1160 597L1159 584ZM1164 578L1161 586L1159 584ZM1123 603L1124 604L1121 605Z'/><path fill='#b8a0b0' stroke='#b8a0b0' stroke-width='.6' d='M1308 187L1308 225L1286 212ZM1275 249L1266 219L1286 212ZM1470 639L1466 636L1506 617ZM1268 188L1302 177L1286 212Z'/><path fill='#987040' stroke='#987040' stroke-width='.6' d='M1288 301L1301 301L1301 307ZM885 596L874 607L880 593ZM1281 301L1288 288L1288 301ZM324 289L334 302L314 304ZM1068 315L1070 339L1065 336ZM1142 361L1133 362L1135 359ZM1127 232L1132 237L1113 238ZM1212 634L1209 635L1211 629ZM1204 611L1209 625L1203 627ZM1375 603L1375 586L1384 601ZM1031 282L1034 298L1017 280ZM505 333L523 317L520 360ZM1337 602L1339 598L1342 612ZM1262 434L1258 425L1263 421Z'/><path fill='#704008' stroke='#704008' stroke-width='.6' d='M1197 289L1184 277L1199 282ZM417 403L413 407L369 407ZM83 173L39 169L51 131ZM208 506L210 442L248 477ZM586 239L560 248L559 208ZM346 106L308 127L314 60ZM725 683L729 691L707 679ZM226 184L199 199L171 152ZM230 139L226 184L171 152ZM298 895L280 920L250 878ZM260 799L317 799L267 844ZM176 931L176 961L127 951ZM1319 550L1327 551L1320 562ZM1003 392L994 394L993 389ZM1138 307L1137 307L1139 299ZM1202 390L1213 383L1211 401Z'/><path fill='#806850' stroke='#806850' stroke-width='.6' d='M852 181L898 158L893 205ZM611 601L599 598L603 589ZM595 610L599 598L598 613ZM941 158L978 156L950 168ZM653 291L660 263L669 276ZM599 598L580 595L603 589ZM1467 516L1467 510L1474 511ZM583 519L585 496L589 518ZM534 576L547 547L541 582ZM1057 665L1061 655L1068 670ZM703 81L719 89L711 93ZM1047 185L1065 156L1070 162ZM239 938L238 941L224 948ZM1046 656L1055 651L1047 660ZM313 713L315 730L303 727ZM560 377L554 385L547 358Z'/><path fill='#b08040' stroke='#b08040' stroke-width='.6' d='M848 298L844 265L884 274ZM56 464L70 470L61 489ZM110 551L128 548L112 567ZM304 268L292 263L292 251ZM1268 324L1242 351L1232 327ZM1167 372L1175 371L1179 375ZM33 531L32 535L22 527Z'/><path fill='#886838' stroke='#886838' stroke-width='.6' d='M803 159L786 176L768 169ZM680 328L705 311L692 352ZM88 62L126 65L87 118ZM666 485L659 503L634 479ZM79 971L98 937L82 974ZM1309 665L1288 661L1315 633ZM1321 349L1305 366L1296 349ZM414 212L394 203L391 187ZM1322 405L1307 402L1319 389ZM181 78L160 62L192 42ZM1031 282L1036 286L1034 298ZM453 319L421 278L447 260Z'/><path fill='#604820' stroke='#604820' stroke-width='.6' d='M786 176L758 185L768 169ZM681 458L667 457L685 423ZM1005 617L993 625L978 605ZM314 304L334 302L305 322ZM503 105L469 77L506 68ZM882 221L875 215L893 205ZM780 662L751 686L749 679ZM1201 665L1199 661L1203 659ZM1371 306L1379 318L1370 330ZM1064 228L1075 243L1051 239ZM1118 229L1125 218L1129 223ZM748 316L755 323L738 315Z'/><path fill='#a08858' stroke='#a08858' stroke-width='.6' d='M758 185L786 176L765 212ZM612 450L610 462L590 466ZM1070 293L1063 276L1071 280ZM1397 174L1400 178L1398 180ZM1398 139L1380 127L1381 126Z'/><path fill='#403830' stroke='#403830' stroke-width='.6' d='M686 134L748 139L718 167ZM75 841L81 837L85 850Z'/><path fill='#887870' stroke='#887870' stroke-width='.6' d='M658 227L688 201L701 219ZM1018 602L1021 587L1029 593ZM216 35L194 37L214 33ZM139 820L131 831L133 825ZM178 790L180 792L177 796ZM272 768L273 781L271 785ZM312 626L313 628L306 633Z'/><path fill='#686048' stroke='#686048' stroke-width='.6' d='M706 221L685 270L701 219Z'/><path fill='#704810' stroke='#704810' stroke-width='.6' d='M566 158L603 173L559 208ZM750 491L721 501L738 488ZM39 169L4 153L11 130ZM1288 462L1297 496L1261 490ZM136 121L122 141L87 118ZM410 61L405 84L385 77ZM718 583L718 598L699 594ZM722 593L718 598L718 583ZM157 88L181 78L177 96ZM939 259L939 255L949 253ZM1290 420L1298 396L1307 402Z'/><path fill='#a06818' stroke='#a06818' stroke-width='.6' d='M561 159L566 158L559 208ZM791 392L733 397L757 360ZM1208 258L1180 273L1169 241ZM444 563L421 609L439 562ZM98 937L105 935L127 951Z'/><path fill='#503010' stroke='#503010' stroke-width='.6' d='M556 105L540 136L510 127ZM694 520L693 470L721 501ZM549 63L569 54L569 62ZM556 136L562 114L575 121ZM918 341L914 319L955 312ZM729 542L776 536L779 551ZM776 567L729 542L779 551ZM433 90L448 130L410 113ZM1167 300L1156 310L1154 297ZM996 447L994 450L964 433ZM994 450L993 460L964 433ZM947 597L944 587L964 584ZM1375 639L1388 648L1372 659ZM152 94L136 121L137 102ZM1275 542L1268 557L1262 534ZM80 900L90 914L69 906ZM335 535L299 517L336 472ZM1435 565L1410 550L1423 539ZM1352 319L1353 318L1370 330ZM169 133L224 123L171 152ZM375 448L365 474L351 463ZM90 914L83 923L69 906ZM418 659L404 655L406 638ZM1182 411L1186 408L1207 436ZM922 535L904 518L923 520ZM939 255L889 249L937 246ZM567 254L560 248L586 239ZM432 620L421 609L441 617ZM439 669L449 667L455 686Z'/><path fill='#705028' stroke='#705028' stroke-width='.6' d='M386 314L423 310L402 330ZM750 491L788 492L787 506ZM279 86L231 53L257 16ZM447 260L421 278L409 251ZM629 564L611 570L621 556ZM684 585L674 544L684 545ZM70 891L80 900L69 906ZM875 644L851 607L874 607ZM889 249L882 221L893 205ZM1064 228L1045 210L1049 196ZM1047 185L1045 198L1028 180ZM667 457L645 431L685 423ZM745 664L765 642L780 662ZM1029 161L1047 185L1028 180ZM1034 298L1036 286L1043 287ZM117 871L134 866L134 885ZM303 590L312 626L270 612ZM765 642L756 624L766 622ZM548 513L583 519L565 541Z'/><path fill='#a87838' stroke='#a87838' stroke-width='.6' d='M244 446L248 477L227 438ZM304 268L302 271L292 263ZM421 609L404 594L439 562ZM1232 327L1242 351L1239 352ZM453 319L447 260L495 251Z'/><path fill='#c0a070' stroke='#c0a070' stroke-width='.6' d='M252 431L244 446L227 438ZM621 556L589 518L637 530ZM1122 457L1115 468L1118 445ZM1332 575L1340 564L1350 574ZM1012 396L1018 384L1037 406ZM1258 425L1257 427L1240 418Z'/><path fill='#b89060' stroke='#b89060' stroke-width='.6' d='M244 446L252 431L251 445ZM449 353L405 349L423 310ZM1118 354L1094 365L1093 362ZM1320 619L1328 607L1325 620ZM1328 607L1333 617L1325 620ZM1271 412L1265 415L1264 414Z'/><path fill='#502808' stroke='#502808' stroke-width='.6' d='M299 517L297 528L264 490ZM100 272L58 286L81 253ZM144 211L171 152L172 205ZM144 211L124 158L171 152ZM495 811L509 833L471 818ZM122 141L104 149L87 118ZM360 215L341 170L347 172ZM414 212L449 207L441 217ZM622 801L615 776L665 796ZM622 801L566 794L615 776ZM1156 310L1167 300L1166 310ZM5 589L4 577L33 595ZM160 582L162 631L119 602ZM27 262L25 292L0 300ZM368 152L369 150L391 151ZM935 352L919 353L918 341ZM84 923L90 914L98 937ZM1254 583L1272 592L1254 603ZM32 599L10 614L5 589ZM262 133L276 153L230 139ZM370 872L359 886L350 835ZM1028 213L1029 210L1042 207ZM57 546L81 557L70 583ZM1128 356L1131 359L1121 362ZM1118 354L1128 356L1121 362ZM38 562L57 546L70 583ZM36 566L38 562L70 583Z'/><path fill='#784010' stroke='#784010' stroke-width='.6' d='M276 363L260 347L267 322ZM86 315L114 327L83 356ZM372 747L364 732L388 734ZM208 506L248 477L264 490ZM78 501L93 500L98 508ZM215 555L246 547L233 588ZM134 885L90 914L86 900ZM29 611L32 599L38 604ZM70 583L81 557L112 567ZM1319 550L1329 548L1327 551ZM1182 387L1179 375L1183 369Z'/><path fill='#b87830' stroke='#b87830' stroke-width='.6' d='M260 347L223 308L267 322Z'/><path fill='#200808' stroke='#200808' stroke-width='.6' d='M305 322L314 366L276 363ZM1268 557L1228 559L1262 534ZM347 172L378 188L366 200ZM1251 581L1228 559L1254 572ZM922 535L923 520L947 514ZM830 572L840 591L831 591Z'/><path fill='#b09868' stroke='#b09868' stroke-width='.6' d='M368 352L353 343L367 317ZM1203 638L1183 627L1203 627Z'/><path fill='#302008' stroke='#302008' stroke-width='.6' d='M353 343L314 366L348 332ZM353 343L366 363L314 366ZM694 520L668 532L661 503ZM711 93L729 104L686 134ZM690 81L711 93L686 134ZM399 600L404 594L406 615ZM753 318L748 316L753 315Z'/><path fill='#804010' stroke='#804010' stroke-width='.6' d='M347 435L342 447L326 413ZM64 393L17 401L24 354Z'/><path fill='#904808' stroke='#904808' stroke-width='.6' d='M369 407L364 417L326 413ZM39 417L56 464L54 463ZM17 401L0 450L0 400ZM396 735L395 788L372 747ZM327 823L361 805L350 835ZM119 602L127 642L113 647Z'/><path fill='#884808' stroke='#884808' stroke-width='.6' d='M364 417L347 435L326 413ZM366 363L369 407L326 413ZM267 844L298 895L250 878ZM729 691L723 730L707 679ZM78 501L66 502L61 489ZM113 647L127 659L98 647Z'/><path fill='#100808' stroke='#100808' stroke-width='.6' d='M797 361L798 345L806 369ZM686 134L652 154L646 140ZM781 346L767 328L799 313ZM737 468L769 472L750 491ZM104 149L112 159L85 173ZM488 587L493 539L513 556ZM718 456L711 448L737 443ZM448 563L463 542L466 546ZM919 444L873 431L896 412ZM947 597L964 584L978 605ZM635 205L608 229L603 173ZM737 468L729 467L737 443ZM497 671L491 684L482 654ZM500 716L481 696L491 684ZM481 693L458 680L491 684ZM364 605L357 632L343 613ZM357 632L364 605L376 631ZM582 264L567 254L587 253Z'/><path fill='#382010' stroke='#382010' stroke-width='.6' d='M787 364L797 361L806 369ZM798 551L776 567L779 551ZM978 605L976 582L1010 603ZM0 150L4 153L0 155ZM779 229L785 265L752 233ZM1219 676L1218 678L1218 676ZM626 90L594 117L584 85ZM674 544L679 537L684 545ZM1218 676L1201 665L1203 659ZM782 347L780 355L781 346ZM610 462L637 448L634 479ZM729 542L702 550L694 520ZM1074 658L1088 647L1088 649ZM1034 636L1025 628L1035 618ZM920 618L942 619L917 636ZM1396 545L1410 550L1405 556ZM913 288L939 259L943 269ZM830 572L831 591L814 604ZM463 631L466 632L449 667ZM755 323L753 318L753 315Z'/><path fill='#100800' stroke='#100800' stroke-width='.6' d='M853 392L839 397L853 362ZM638 105L686 134L646 140ZM852 354L853 362L806 369ZM711 448L694 426L737 433ZM873 431L919 444L890 468ZM497 671L513 680L491 684ZM406 615L392 641L376 631ZM481 696L481 693L491 684Z'/><path fill='#885820' stroke='#885820' stroke-width='.6' d='M888 350L853 392L853 362ZM952 549L976 549L961 576ZM410 61L385 77L388 59ZM329 43L350 87L314 60ZM1197 289L1200 295L1182 309ZM827 284L790 280L785 265ZM160 582L119 602L126 579ZM292 251L260 223L298 224ZM491 177L505 218L468 178ZM838 319L863 310L853 338ZM1231 638L1209 625L1246 606ZM1329 628L1334 643L1330 646ZM257 223L239 239L221 231ZM1211 340L1225 313L1232 327ZM904 518L922 535L881 536ZM1278 402L1257 377L1271 379ZM756 624L753 602L766 622ZM1329 548L1319 550L1328 539ZM1183 394L1180 398L1172 387Z'/><path fill='#201008' stroke='#201008' stroke-width='.6' d='M805 430L839 397L825 432ZM4 153L14 198L0 155ZM681 458L666 485L667 457ZM711 448L737 433L737 443ZM925 412L921 433L896 412ZM839 397L847 402L825 432ZM624 115L594 117L626 90ZM594 117L575 121L584 85ZM519 597L496 596L513 556ZM439 562L440 520L463 542ZM947 514L923 520L941 498ZM919 444L921 433L922 448ZM855 533L881 553L835 555ZM1018 622L1028 615L1025 628ZM638 105L672 84L686 134ZM737 245L737 237L752 233ZM652 154L635 205L603 173ZM668 532L664 530L661 503ZM942 619L920 618L945 596ZM1011 605L1018 622L1005 617ZM1173 538L1176 528L1186 527ZM973 622L947 597L978 605ZM449 667L466 632L480 651ZM432 620L406 615L421 609ZM881 553L840 591L835 555ZM840 591L830 572L835 555ZM554 385L568 391L563 404Z'/><path fill='#683810' stroke='#683810' stroke-width='.6' d='M805 430L791 392L839 397ZM925 412L942 393L964 433ZM56 270L27 262L66 216ZM100 272L81 253L113 227ZM921 433L925 412L964 433ZM1469 540L1458 545L1445 525ZM250 638L252 660L250 664ZM278 657L252 660L250 638ZM1319 316L1355 296L1352 319ZM257 223L226 184L293 185ZM1290 420L1287 421L1278 402ZM988 365L993 389L946 365ZM1128 356L1130 355L1131 359ZM1183 394L1182 387L1184 394Z'/><path fill='#a86820' stroke='#a86820' stroke-width='.6' d='M805 430L803 443L776 425ZM463 595L466 620L441 617Z'/><path fill='#d8c0a0' stroke='#d8c0a0' stroke-width='.6' d='M632 638L586 642L598 613ZM1400 178L1414 193L1398 191ZM222 350L220 360L200 356ZM220 360L248 392L218 367Z'/><path fill='#c0a880' stroke='#c0a880' stroke-width='.6' d='M611 601L632 638L598 613ZM69 938L39 925L69 906ZM807 228L817 199L822 208ZM1380 127L1379 126L1381 126Z'/><path fill='#806030' stroke='#806030' stroke-width='.6' d='M776 536L750 491L787 506ZM813 180L786 176L803 159ZM839 200L844 212L822 208ZM648 541L674 544L649 565ZM1258 653L1279 659L1259 655ZM313 287L324 289L314 304ZM348 26L355 23L360 26ZM734 765L720 788L690 764ZM1063 276L1070 293L1058 297ZM1273 340L1304 338L1296 349ZM1132 224L1127 232L1129 223ZM1127 232L1118 229L1129 223ZM134 885L140 874L145 880Z'/><path fill='#281808' stroke='#281808' stroke-width='.6' d='M684 585L655 600L649 565ZM751 443L737 468L737 443ZM728 358L712 392L692 352ZM1442 491L1419 480L1443 474ZM1419 480L1442 491L1422 506ZM603 173L624 115L646 140ZM4 153L39 169L14 198ZM853 392L847 402L839 397ZM1363 477L1317 496L1326 455ZM265 560L246 547L297 528ZM634 479L638 448L667 457ZM694 426L689 418L712 392ZM642 591L629 564L649 565ZM734 472L729 467L737 468ZM748 316L743 309L746 308Z'/><path fill='#885010' stroke='#885010' stroke-width='.6' d='M761 460L751 443L776 425ZM220 251L258 258L219 298ZM935 352L981 336L946 365ZM496 596L485 654L480 651ZM532 879L509 833L538 839ZM176 518L128 548L119 494ZM1171 276L1180 273L1176 278ZM1180 273L1184 277L1176 278ZM181 588L222 585L176 606ZM1209 265L1208 258L1224 269ZM745 664L749 679L731 670ZM1152 403L1158 399L1164 403ZM1272 457L1288 462L1261 490ZM66 502L53 510L61 489ZM0 550L36 566L1 569ZM993 389L994 394L981 405ZM1137 307L1138 307L1142 313ZM1213 383L1202 390L1209 368Z'/><path fill='#382810' stroke='#382810' stroke-width='.6' d='M737 468L750 491L738 488ZM976 582L1011 577L1010 603ZM594 117L624 115L603 173ZM1195 671L1202 675L1192 673ZM1199 661L1201 665L1195 671ZM642 591L618 577L629 564ZM1106 669L1116 652L1132 657Z'/><path fill='#785828' stroke='#785828' stroke-width='.6' d='M705 311L728 358L692 352ZM441 217L449 207L495 251ZM1256 874L1320 873L1248 889ZM653 509L659 503L661 503ZM1121 362L1124 368L1122 372ZM472 138L482 140L468 178ZM737 245L735 258L734 244ZM547 547L546 535L565 541ZM1388 608L1384 601L1390 589ZM1305 366L1283 358L1296 349ZM1175 202L1164 220L1149 206ZM1298 396L1305 366L1319 389ZM1298 396L1292 391L1305 366Z'/><path fill='#885008' stroke='#885008' stroke-width='.6' d='M751 443L737 433L776 425ZM826 506L844 464L876 509ZM1156 467L1179 449L1181 464ZM743 687L725 683L731 670ZM1177 432L1175 445L1167 433ZM560 248L550 213L559 208Z'/><path fill='#583808' stroke='#583808' stroke-width='.6' d='M737 433L751 443L737 443ZM562 154L575 121L566 158ZM1357 632L1361 633L1355 637ZM202 943L190 954L199 935Z'/><path fill='#887058' stroke='#887058' stroke-width='.6' d='M599 598L611 601L598 613ZM1005 144L1028 160L986 183ZM425 912L393 910L421 903ZM222 948L239 938L224 948ZM1140 178L1128 195L1125 178Z'/><path fill='#a09060' stroke='#a09060' stroke-width='.6' d='M563 592L575 624L548 609Z'/><path fill='#b8a898' stroke='#b8a898' stroke-width='.6' d='M181 969L150 1000L157 975ZM124 805L120 812L74 801ZM921 688L915 721L886 701ZM1561 591L1558 572L1562 575ZM1223 708L1192 696L1207 681ZM321 925L332 911L359 937ZM352 903L332 911L332 908ZM332 911L352 903L359 937ZM791 712L854 735L789 743ZM791 712L841 681L854 735ZM841 681L826 645L834 642ZM998 640L1009 638L1022 654ZM855 110L871 109L870 111ZM275 747L271 765L232 734ZM789 653L826 645L841 681ZM1459 482L1455 478L1463 468ZM206 681L178 733L170 683ZM85 723L136 757L78 760ZM151 691L178 733L133 709ZM1302 177L1269 183L1268 169ZM271 980L238 941L264 925ZM988 634L942 650L960 630ZM988 634L1001 633L998 640ZM949 632L942 650L917 636ZM1253 180L1242 194L1235 164ZM284 926L271 980L264 925ZM353 902L358 889L393 910Z'/><path fill='#c0b0a8' stroke='#c0b0a8' stroke-width='.6' d='M181 969L200 1000L150 1000ZM1085 19L1050 0L1100 0ZM190 962L225 976L200 1000ZM462 932L500 904L511 935ZM1207 584L1206 598L1191 590ZM229 781L213 789L232 734ZM238 941L271 980L225 976ZM607 902L593 856L618 847ZM988 634L998 640L968 697Z'/><path fill='#b0b0b0' stroke='#b0b0b0' stroke-width='.6' d='M1561 958L1550 1000L1508 988ZM304 22L298 16L300 0ZM214 33L218 9L226 23ZM1510 927L1568 935L1561 958ZM1137 634L1112 641L1122 617Z'/><path fill='#585040' stroke='#585040' stroke-width='.6' d='M1139 964L1165 957L1144 974ZM1343 448L1363 445L1360 451ZM681 304L653 291L669 276ZM522 383L544 395L542 402ZM512 722L520 699L549 707ZM432 795L428 792L431 774Z'/><path fill='#a09078' stroke='#a09078' stroke-width='.6' d='M1139 964L1122 943L1168 936ZM1037 656L1046 656L1047 660ZM1175 202L1169 190L1178 201ZM1407 381L1409 371L1410 372Z'/><path fill='#908888' stroke='#908888' stroke-width='.6' d='M1165 957L1139 964L1168 936Z'/><path fill='#d8c8b8' stroke='#d8c8b8' stroke-width='.6' d='M936 971L941 952L972 952ZM755 948L757 979L700 1000ZM550 1000L584 984L600 1000ZM1502 840L1500 858L1461 845Z'/><path fill='#886030' stroke='#886030' stroke-width='.6' d='M1320 873L1307 853L1315 839ZM992 214L945 225L986 183ZM781 346L780 355L757 360ZM720 788L701 794L690 764ZM154 66L152 94L126 65ZM206 681L200 650L250 664ZM200 650L206 681L170 683ZM514 535L487 505L523 529ZM1375 586L1355 568L1382 569ZM1294 312L1304 338L1274 322ZM1294 312L1288 301L1301 307ZM1175 202L1178 224L1164 220ZM423 758L430 763L431 774ZM1174 322L1168 331L1166 310ZM1204 611L1227 592L1209 625ZM1342 612L1338 617L1334 610ZM1287 421L1273 409L1278 402ZM1185 331L1179 327L1193 328Z'/><path fill='#b0a080' stroke='#b0a080' stroke-width='.6' d='M1307 853L1285 833L1315 839ZM1045 376L1059 364L1069 388ZM85 723L117 700L133 709ZM642 591L639 603L611 601ZM671 814L691 798L692 843ZM1383 308L1401 309L1379 318Z'/><path fill='#505060' stroke='#505060' stroke-width='.6' d='M1190 973L1178 975L1180 965Z'/><path fill='#909088' stroke='#909088' stroke-width='.6' d='M1230 926L1190 973L1180 965Z'/><path fill='#c0a068' stroke='#c0a068' stroke-width='.6' d='M1142 361L1135 359L1140 344ZM1121 362L1105 378L1094 365ZM1296 560L1312 562L1307 574ZM404 594L377 551L417 539ZM1329 572L1340 564L1332 575ZM1347 562L1355 568L1350 574Z'/><path fill='#804810' stroke='#804810' stroke-width='.6' d='M853 392L896 412L880 418ZM283 291L258 258L286 262ZM1167 300L1171 276L1176 278ZM33 301L58 286L79 315ZM248 392L276 363L268 399ZM925 412L919 370L942 393ZM604 704L651 686L651 741ZM563 861L549 807L604 833ZM873 431L847 402L880 418ZM119 494L93 500L87 477ZM98 508L128 548L109 548ZM102 276L100 272L134 254ZM116 288L102 276L134 254ZM1220 494L1171 493L1181 464ZM273 408L281 436L252 431ZM260 626L250 638L233 588ZM1177 432L1179 449L1175 445ZM981 336L988 365L946 365ZM105 935L90 914L134 885ZM466 632L466 620L480 651Z'/><path fill='#a06018' stroke='#a06018' stroke-width='.6' d='M896 412L853 392L888 350ZM22 686L73 651L79 696ZM223 308L283 291L267 322ZM87 477L78 501L61 489ZM585 691L604 704L588 733ZM505 218L544 217L536 264ZM29 611L38 604L39 632Z'/><path fill='#a09070' stroke='#a09070' stroke-width='.6' d='M991 468L1026 460L995 487ZM485 895L532 879L500 904ZM360 26L355 23L351 8ZM212 955L222 948L224 948Z'/><path fill='#502810' stroke='#502810' stroke-width='.6' d='M942 393L976 421L964 433ZM397 272L416 283L391 274ZM276 363L276 396L268 399ZM955 312L914 319L951 296ZM847 402L841 440L825 432ZM1215 454L1220 464L1220 469Z'/><path fill='#583010' stroke='#583010' stroke-width='.6' d='M981 405L976 421L942 393ZM531 40L549 63L535 76ZM416 283L386 314L391 274ZM814 604L798 610L776 567ZM540 136L544 147L510 127ZM281 436L305 454L264 490ZM919 370L925 412L896 412ZM303 590L275 597L265 560ZM214 229L226 184L221 231ZM1275 525L1264 523L1274 512ZM281 436L309 418L293 439ZM1131 359L1124 368L1121 362ZM1009 422L976 421L981 405ZM885 596L920 618L874 607ZM1243 595L1247 590L1254 603ZM1251 581L1247 590L1233 588ZM1028 213L1045 210L1040 236ZM1045 210L1028 213L1042 207ZM154 670L200 650L170 683ZM224 123L169 133L189 109ZM922 535L947 514L952 549ZM196 541L176 518L208 506ZM1029 210L1037 203L1042 207Z'/><path fill='#583018' stroke='#583018' stroke-width='.6' d='M825 432L841 440L809 462ZM208 506L176 518L180 465ZM881 536L875 536L876 509ZM930 561L952 549L961 576Z'/><path fill='#885828' stroke='#885828' stroke-width='.6' d='M815 475L788 492L809 462ZM1320 619L1325 626L1316 623ZM1432 590L1418 580L1422 575Z'/><path fill='#705030' stroke='#705030' stroke-width='.6' d='M798 551L776 536L787 506ZM549 63L551 41L569 54ZM1363 477L1377 487L1368 486ZM1288 661L1288 673L1279 659ZM154 670L151 691L136 696ZM1033 378L1037 374L1045 376ZM1334 367L1305 366L1324 351ZM1125 178L1128 195L1123 192ZM1117 228L1118 229L1113 238ZM134 866L121 853L142 844Z'/><path fill='#d0d0d8' stroke='#d0d0d8' stroke-width='.6' d='M1047 536L1069 524L1054 564ZM1085 507L1095 519L1094 520ZM1136 612L1160 597L1158 635ZM1168 599L1176 573L1191 590Z'/><path fill='#d8d0e0' stroke='#d8d0e0' stroke-width='.6' d='M1092 543L1093 566L1054 564Z'/><path fill='#989088' stroke='#989088' stroke-width='.6' d='M1004 562L1016 559L1011 577ZM23 82L24 70L40 65ZM573 406L578 398L588 396ZM358 889L371 878L393 910Z'/><path fill='#181008' stroke='#181008' stroke-width='.6' d='M964 584L976 582L978 605ZM661 354L664 333L692 352ZM853 338L852 354L798 345ZM463 542L493 539L466 546ZM947 597L942 619L945 596ZM694 520L702 550L684 545ZM432 620L463 631L449 667ZM567 254L582 264L573 266Z'/><path fill='#201818' stroke='#201818' stroke-width='.6' d='M976 582L1004 562L1011 577ZM568 391L567 372L577 391Z'/><path fill='#483018' stroke='#483018' stroke-width='.6' d='M976 582L964 584L961 576ZM1364 505L1354 512L1353 506ZM750 491L769 472L788 492ZM1467 510L1467 516L1451 515ZM1371 489L1377 487L1384 494ZM578 73L595 55L584 85ZM283 291L313 287L314 304ZM737 237L737 245L734 244ZM357 632L376 631L366 637ZM1095 659L1078 669L1074 658ZM365 474L359 514L336 472ZM1337 369L1334 367L1359 365ZM1130 223L1125 218L1129 212ZM631 444L637 448L610 462ZM748 316L753 318L755 323Z'/><path fill='#603810' stroke='#603810' stroke-width='.6' d='M1260 977L1289 980L1250 1000ZM345 118L346 106L406 105ZM324 38L329 43L314 60ZM297 528L246 547L264 490ZM534 82L503 105L506 68ZM993 460L991 468L964 433ZM1267 604L1270 620L1254 603ZM1435 565L1439 570L1422 575ZM1439 570L1435 565L1447 567ZM292 263L283 291L286 262ZM220 251L239 239L249 248ZM625 838L622 801L633 838ZM625 838L620 840L604 833ZM620 840L613 843L604 833ZM923 520L904 518L903 507ZM1181 464L1210 450L1220 469ZM1373 622L1398 635L1375 639ZM1353 318L1355 296L1371 306ZM930 359L935 352L946 365ZM302 271L305 273L283 291ZM292 263L302 271L283 291ZM448 49L460 41L451 67ZM567 254L555 266L560 248ZM222 948L202 943L199 935ZM993 389L981 405L946 365ZM1141 292L1139 299L1131 288Z'/><path fill='#604828' stroke='#604828' stroke-width='.6' d='M1235 992L1260 977L1250 1000ZM1132 657L1132 685L1107 676ZM595 55L608 56L584 85ZM23 82L19 112L0 100ZM1451 498L1460 497L1462 499ZM1377 487L1371 489L1368 486ZM1396 545L1405 556L1389 552ZM1246 677L1230 665L1259 655ZM789 653L772 623L798 610ZM1078 669L1095 664L1107 676ZM1091 227L1075 243L1079 226ZM605 470L594 498L590 466ZM1398 526L1394 530L1380 522ZM1125 218L1118 229L1117 228Z'/><path fill='#685848' stroke='#685848' stroke-width='.6' d='M1260 977L1235 992L1222 987ZM741 223L751 210L749 215ZM757 107L756 107L763 102ZM534 592L534 576L541 582ZM547 547L534 576L513 556ZM1033 606L1028 615L1025 612ZM748 139L776 132L768 169ZM211 794L213 789L244 790ZM1167 656L1171 663L1160 661ZM1420 409L1418 411L1416 403ZM1426 421L1430 425L1423 427Z'/><path fill='#705830' stroke='#705830' stroke-width='.6' d='M1257 946L1260 977L1222 987ZM701 282L685 283L685 270ZM1372 659L1388 648L1389 656ZM1045 198L1047 185L1049 196Z'/><path fill='#b8b8b8' stroke='#b8b8b8' stroke-width='.6' d='M1600 500L1575 536L1569 491ZM1575 536L1600 500L1600 550ZM1562 575L1575 536L1600 550ZM1016 559L1000 541L1025 546ZM214 33L194 37L200 0ZM1039 584L1031 584L1041 549ZM151 35L147 39L113 37Z'/><path fill='#a89098' stroke='#a89098' stroke-width='.6' d='M1479 588L1529 593L1506 617ZM1485 649L1470 639L1506 617ZM1318 152L1362 149L1362 167ZM1165 539L1158 547L1152 536Z'/><path fill='#987870' stroke='#987870' stroke-width='.6' d='M1495 561L1529 593L1479 588Z'/><path fill='#e0d8e0' stroke='#e0d8e0' stroke-width='.6' d='M1553 506L1557 492L1569 491Z'/><path fill='#c0a878' stroke='#c0a878' stroke-width='.6' d='M1109 478L1115 468L1118 485ZM1341 584L1332 575L1350 574Z'/><path fill='#d0b898' stroke='#d0b898' stroke-width='.6' d='M1118 500L1109 478L1118 485ZM621 556L598 557L589 518ZM1102 300L1090 323L1085 311ZM1341 584L1324 581L1332 575ZM1324 581L1341 584L1328 592ZM1361 139L1347 123L1360 111Z'/><path fill='#d8c8c0' stroke='#d8c8c0' stroke-width='.6' d='M1109 478L1118 500L1082 494ZM1110 409L1110 429L1094 421ZM1017 117L987 78L1027 73Z'/><path fill='#d0d0c8' stroke='#d0d0c8' stroke-width='.6' d='M1109 478L1082 494L1078 468ZM584 25L556 8L600 0ZM1110 429L1084 432L1094 421ZM1071 428L1050 407L1069 388ZM650 0L647 38L600 0ZM700 24L650 0L700 0ZM647 38L650 0L700 24ZM1037 406L1051 420L1050 427Z'/><path fill='#b88848' stroke='#b88848' stroke-width='.6' d='M1131 473L1135 486L1118 485ZM1131 504L1135 486L1158 495ZM827 284L807 228L844 265ZM39 632L16 665L0 650ZM1132 237L1164 220L1169 241ZM863 310L848 298L884 274ZM404 594L417 539L439 562ZM1180 398L1168 399L1172 387Z'/><path fill='#c8a870' stroke='#c8a870' stroke-width='.6' d='M1135 486L1118 500L1118 485Z'/><path fill='#c8a068' stroke='#c8a068' stroke-width='.6' d='M1118 500L1135 486L1131 504ZM604 704L585 691L632 638ZM468 453L527 416L487 466ZM1262 447L1256 464L1243 449ZM468 453L488 474L443 485ZM502 377L505 333L520 360ZM517 384L502 377L520 360ZM1263 439L1269 447L1262 447Z'/><path fill='#986018' stroke='#986018' stroke-width='.6' d='M1135 486L1163 474L1158 495ZM177 249L189 232L207 248ZM57 602L38 604L33 595ZM1209 265L1201 279L1184 277ZM1156 418L1164 421L1167 433ZM1201 363L1209 368L1195 366Z'/><path fill='#887858' stroke='#887858' stroke-width='.6' d='M1326 445L1343 448L1326 455ZM1055 651L1057 665L1047 660Z'/><path fill='#401808' stroke='#401808' stroke-width='.6' d='M1443 537L1446 555L1423 539ZM1275 525L1301 530L1287 540ZM305 454L309 418L342 447ZM1207 436L1210 450L1179 449ZM32 599L5 589L33 595ZM736 590L730 590L725 583ZM1156 310L1138 307L1154 297Z'/><path fill='#686050' stroke='#686050' stroke-width='.6' d='M1434 456L1442 440L1443 451ZM1449 466L1455 478L1443 474ZM568 408L571 400L573 403ZM542 402L550 413L527 416ZM768 110L763 102L796 119Z'/><path fill='#b8b8a0' stroke='#b8b8a0' stroke-width='.6' d='M1454 433L1442 440L1441 437Z'/><path fill='#302010' stroke='#302010' stroke-width='.6' d='M1413 488L1419 480L1422 506ZM1384 494L1413 488L1422 506ZM1390 466L1413 488L1387 490ZM674 544L668 532L679 537ZM1025 628L1028 615L1035 618ZM378 188L379 212L366 200ZM664 530L668 532L660 535ZM755 323L753 315L767 328ZM1171 663L1192 673L1172 677ZM117 850L121 853L103 854Z'/><path fill='#503828' stroke='#503828' stroke-width='.6' d='M1413 488L1390 466L1419 480ZM1167 687L1161 677L1172 677ZM1363 477L1343 448L1360 451ZM1192 673L1182 691L1172 677ZM1143 677L1132 685L1132 657ZM789 653L765 642L772 623ZM394 203L387 211L378 188ZM545 680L520 699L513 680ZM1051 628L1034 636L1035 618ZM279 783L280 763L304 777ZM1171 663L1183 657L1192 673Z'/><path fill='#604830' stroke='#604830' stroke-width='.6' d='M1442 491L1457 492L1451 498ZM595 610L580 595L599 598ZM875 644L874 607L917 636ZM881 136L882 113L906 128ZM882 113L881 136L864 132ZM843 125L864 132L838 148ZM1394 530L1398 526L1396 545ZM934 129L935 124L946 122ZM1405 365L1384 377L1403 354ZM1405 365L1407 381L1384 377Z'/><path fill='#584838' stroke='#584838' stroke-width='.6' d='M1424 448L1424 455L1418 459ZM765 212L756 224L749 215ZM585 496L577 487L590 466ZM527 416L550 413L549 424ZM213 789L211 794L193 793ZM415 528L395 520L393 507ZM1116 652L1132 654L1132 657ZM1132 654L1156 657L1132 657ZM1023 637L1025 631L1034 636ZM1385 408L1383 415L1367 412Z'/><path fill='#504030' stroke='#504030' stroke-width='.6' d='M1424 455L1434 456L1418 459ZM1435 436L1424 448L1432 436ZM645 332L636 352L629 332ZM514 535L523 529L513 556ZM123 813L104 826L120 812ZM1158 659L1143 677L1156 657ZM1230 675L1240 681L1223 683ZM829 121L843 125L838 148ZM1025 631L1012 629L1025 628ZM1384 377L1394 397L1379 382ZM1383 415L1385 417L1364 437ZM343 636L329 639L332 633Z'/><path fill='#483830' stroke='#483830' stroke-width='.6' d='M1434 456L1424 455L1424 448ZM756 224L741 223L749 215ZM1332 676L1329 675L1341 669ZM768 110L776 132L748 139ZM180 792L193 793L185 799ZM547 271L566 267L558 302ZM428 792L407 791L431 774ZM373 874L371 878L370 872ZM371 878L358 889L359 886ZM1387 418L1423 427L1424 448Z'/><path fill='#302018' stroke='#302018' stroke-width='.6' d='M1434 456L1441 459L1443 474ZM756 224L779 229L752 233ZM1028 615L1018 622L1025 612ZM681 304L685 283L701 282ZM686 134L729 104L748 139ZM415 528L440 520L417 539ZM193 793L211 794L185 799ZM117 850L103 854L104 826Z'/><path fill='#504038' stroke='#504038' stroke-width='.6' d='M1441 459L1434 456L1443 451ZM1441 459L1449 466L1443 474ZM553 331L547 358L520 360ZM103 854L90 848L91 847ZM1394 397L1385 408L1379 382ZM1367 412L1383 415L1364 437ZM1385 408L1387 418L1385 417ZM334 622L341 613L343 613Z'/><path fill='#807868' stroke='#807868' stroke-width='.6' d='M1449 457L1441 459L1443 451ZM789 653L780 662L784 656ZM145 819L142 844L139 820Z'/><path fill='#b8a8a8' stroke='#b8a8a8' stroke-width='.6' d='M1584 604L1584 602L1600 600ZM1311 263L1287 253L1310 228ZM1385 204L1358 241L1330 215Z'/><path fill='#988070' stroke='#988070' stroke-width='.6' d='M1584 602L1584 604L1581 606ZM1480 517L1467 516L1474 511ZM318 716L313 713L323 710Z'/><path fill='#988080' stroke='#988080' stroke-width='.6' d='M1555 645L1560 631L1565 645ZM1361 139L1362 149L1359 143Z'/><path fill='#988888' stroke='#988888' stroke-width='.6' d='M1560 631L1555 645L1531 648Z'/><path fill='#988890' stroke='#988890' stroke-width='.6' d='M1560 631L1531 648L1539 599Z'/><path fill='#a08088' stroke='#a08088' stroke-width='.6' d='M1564 617L1560 631L1539 599Z'/><path fill='#b0a098' stroke='#b0a098' stroke-width='.6' d='M1517 648L1509 642L1531 648ZM780 662L789 653L841 681ZM170 798L169 800L137 793ZM1167 656L1156 657L1158 635ZM340 613L324 618L323 612Z'/><path fill='#a08860' stroke='#a08860' stroke-width='.6' d='M1425 667L1405 667L1428 664ZM399 876L412 876L412 890ZM1373 265L1377 266L1369 272Z'/><path fill='#a89080' stroke='#a89080' stroke-width='.6' d='M1469 580L1456 590L1449 574ZM142 844L131 831L139 820ZM1034 597L1065 617L1033 606Z'/><path fill='#a8a0a0' stroke='#a8a0a0' stroke-width='.6' d='M1455 611L1456 590L1479 588ZM330 15L304 22L300 0ZM1031 584L1021 587L1011 577ZM1021 587L1031 584L1029 593ZM322 613L324 618L316 625Z'/><path fill='#a89898' stroke='#a89898' stroke-width='.6' d='M1456 590L1469 580L1479 588ZM1184 572L1207 584L1191 590Z'/><path fill='#d8d0b0' stroke='#d8d0b0' stroke-width='.6' d='M1414 193L1402 177L1421 176ZM1414 193L1444 207L1413 207ZM1467 161L1469 168L1421 176ZM1469 168L1444 207L1421 176ZM1405 122L1399 124L1378 72ZM1479 215L1480 226L1456 239Z'/><path fill='#a88868' stroke='#a88868' stroke-width='.6' d='M1394 202L1385 204L1398 191ZM611 570L598 557L621 556ZM839 200L817 183L848 180ZM1173 516L1165 508L1171 493ZM1398 139L1402 152L1398 155ZM1266 292L1260 260L1289 271ZM1402 152L1398 160L1398 155ZM1373 264L1376 246L1377 266Z'/><path fill='#604818' stroke='#604818' stroke-width='.6' d='M608 56L626 90L584 85ZM694 426L711 448L681 458Z'/><path fill='#887050' stroke='#887050' stroke-width='.6' d='M898 158L941 158L893 205ZM751 210L745 170L758 185ZM541 582L563 592L548 609ZM848 180L853 164L852 181ZM271 785L260 799L250 785ZM1041 359L1059 364L1045 376ZM1125 178L1123 192L1109 176ZM631 444L615 445L621 441Z'/><path fill='#604028' stroke='#604028' stroke-width='.6' d='M852 181L876 152L898 158ZM1363 477L1368 486L1353 506ZM421 278L416 283L397 272ZM1459 496L1460 497L1451 498ZM1005 315L982 316L991 309Z'/><path fill='#806028' stroke='#806028' stroke-width='.6' d='M11 130L0 150L0 100ZM767 328L781 346L757 360ZM1373 622L1388 608L1399 617ZM1281 301L1294 312L1274 322ZM1388 608L1375 603L1384 601ZM1373 622L1375 603L1388 608Z'/><path fill='#503008' stroke='#503008' stroke-width='.6' d='M14 198L0 200L0 155ZM1315 524L1297 496L1317 496ZM1447 567L1435 565L1446 555ZM1324 515L1315 524L1317 496ZM1352 636L1355 637L1349 650ZM433 90L437 70L451 67ZM1353 318L1371 306L1370 330ZM1177 432L1182 411L1207 436ZM152 94L157 88L177 96ZM103 854L117 871L86 900ZM81 557L98 508L109 548Z'/><path fill='#301800' stroke='#301800' stroke-width='.6' d='M14 198L39 169L66 216ZM690 764L642 754L651 741ZM469 77L433 90L451 67ZM175 830L208 834L182 857Z'/><path fill='#885018' stroke='#885018' stroke-width='.6' d='M39 169L11 130L51 131ZM826 506L815 475L844 464ZM308 127L262 133L279 86ZM1032 301L1005 315L1017 280ZM1183 369L1175 349L1189 344ZM1156 418L1152 403L1164 403ZM1276 433L1271 435L1263 421Z'/><path fill='#a098a0' stroke='#a098a0' stroke-width='.6' d='M0 50L13 72L0 100ZM1456 618L1479 588L1506 617ZM1150 572L1164 578L1159 584Z'/><path fill='#785010' stroke='#785010' stroke-width='.6' d='M177 96L181 78L203 84ZM1218 644L1231 638L1217 649Z'/><path fill='#c0c0c8' stroke='#c0c0c8' stroke-width='.6' d='M88 62L81 15L113 37ZM1041 549L1016 559L1025 546ZM1039 584L1041 549L1054 564ZM1035 514L1024 537L998 514Z'/><path fill='#a06010' stroke='#a06010' stroke-width='.6' d='M73 651L98 647L79 696ZM119 602L113 647L98 647ZM70 583L57 602L33 595ZM396 735L423 758L395 788Z'/><path fill='#a87030' stroke='#a87030' stroke-width='.6' d='M70 470L87 477L61 489ZM1152 388L1135 389L1142 361Z'/><path fill='#703808' stroke='#703808' stroke-width='.6' d='M70 470L119 449L87 477ZM413 407L409 412L369 407ZM549 807L566 794L604 833ZM847 402L873 431L841 440ZM841 440L873 431L844 464ZM93 500L119 494L98 508ZM260 626L278 657L250 638ZM276 153L226 184L230 139ZM725 683L721 660L731 670ZM201 897L199 887L210 903ZM1195 366L1183 369L1189 344ZM1320 562L1327 551L1334 560ZM127 642L127 659L113 647Z'/><path fill='#683008' stroke='#683008' stroke-width='.6' d='M119 449L70 470L117 417ZM33 301L24 354L24 299ZM157 282L116 288L134 254ZM264 925L210 903L250 878ZM342 447L309 418L326 413ZM364 417L375 448L347 435ZM162 631L127 642L119 602ZM1182 387L1183 369L1195 366Z'/><path fill='#985008' stroke='#985008' stroke-width='.6' d='M39 417L54 463L18 456ZM0 450L39 417L18 456ZM116 288L157 282L156 312ZM395 788L361 805L372 747ZM222 585L205 552L215 555Z'/><path fill='#784008' stroke='#784008' stroke-width='.6' d='M0 300L24 299L0 350ZM171 152L199 199L172 205ZM615 776L566 794L588 733ZM509 833L549 807L538 839ZM119 494L128 548L98 508ZM250 638L200 650L233 588ZM498 799L535 736L549 807ZM134 885L160 890L127 951ZM740 622L749 634L727 644ZM10 614L29 611L11 619Z'/><path fill='#603010' stroke='#603010' stroke-width='.6' d='M27 262L0 300L0 250ZM369 150L410 113L391 151ZM844 464L890 468L876 509ZM922 448L921 433L964 433ZM251 445L281 436L264 490ZM1287 626L1270 620L1283 600ZM176 518L119 494L180 465ZM25 292L33 301L24 299ZM226 184L214 229L199 199ZM375 448L343 452L347 435ZM1174 304L1178 318L1166 310ZM1178 318L1174 322L1166 310Z'/><path fill='#984810' stroke='#984810' stroke-width='.6' d='M0 350L24 354L0 400Z'/><path fill='#582800' stroke='#582800' stroke-width='.6' d='M81 253L58 286L56 270ZM721 660L725 683L707 679Z'/><path fill='#b06008' stroke='#b06008' stroke-width='.6' d='M158 357L156 312L186 327Z'/><path fill='#c07818' stroke='#c07818' stroke-width='.6' d='M200 356L158 357L186 327Z'/><path fill='#582008' stroke='#582008' stroke-width='.6' d='M114 327L158 357L132 370Z'/><path fill='#402008' stroke='#402008' stroke-width='.6' d='M185 439L210 442L180 465ZM1317 496L1297 496L1304 472ZM112 159L144 211L86 208ZM1301 530L1275 525L1274 512ZM309 134L308 127L345 118ZM710 568L729 542L725 583ZM641 746L642 754L615 776ZM1355 637L1375 639L1372 659ZM275 597L268 609L233 588ZM214 229L215 248L207 248ZM239 239L220 251L221 231ZM405 84L433 90L406 105ZM1255 509L1264 523L1262 534ZM1113 226L1091 227L1107 214ZM226 184L276 153L293 185ZM930 359L919 353L935 352ZM449 806L431 837L428 825ZM729 542L736 590L725 583ZM140 874L134 866L148 857ZM1184 394L1205 405L1186 408Z'/><path fill='#785018' stroke='#785018' stroke-width='.6' d='M248 477L210 442L227 438ZM1205 291L1200 295L1197 289ZM1300 945L1331 942L1289 980ZM189 109L186 106L203 84ZM649 828L622 801L665 796ZM369 150L368 152L345 118ZM1229 461L1239 474L1220 469ZM1128 350L1118 354L1125 340ZM1361 633L1358 620L1373 622ZM753 602L736 590L776 567ZM1179 375L1182 387L1172 387Z'/><path fill='#d08020' stroke='#d08020' stroke-width='.6' d='M200 356L204 402L175 398Z'/><path fill='#c87810' stroke='#c87810' stroke-width='.6' d='M204 402L197 407L175 398ZM166 367L200 356L175 398Z'/><path fill='#281000' stroke='#281000' stroke-width='.6' d='M143 245L157 270L134 254ZM1219 676L1225 663L1230 675ZM308 127L346 106L345 118ZM186 106L169 133L177 96ZM81 557L78 501L98 508Z'/><path fill='#180808' stroke='#180808' stroke-width='.6' d='M157 270L143 245L160 243ZM652 154L603 173L646 140ZM679 537L694 520L684 545ZM1228 559L1219 542L1262 534ZM1228 559L1268 557L1254 572ZM343 452L351 463L336 472ZM797 361L784 356L798 345ZM679 537L668 532L694 520ZM169 133L152 94L177 96ZM384 171L378 188L347 172ZM587 253L567 254L586 239Z'/><path fill='#482008' stroke='#482008' stroke-width='.6' d='M177 249L157 270L160 243ZM1446 555L1435 565L1423 539ZM180 465L119 494L127 453ZM1301 530L1274 512L1297 496ZM651 686L707 679L694 734ZM896 412L873 431L880 418ZM1272 592L1267 604L1254 603ZM1398 635L1388 648L1375 639ZM1271 531L1275 525L1287 540ZM196 541L202 549L182 537ZM215 555L196 541L208 506ZM831 591L840 591L851 607ZM1220 584L1228 559L1233 588ZM4 577L36 566L33 595ZM1186 408L1210 415L1207 436Z'/><path fill='#b87828' stroke='#b87828' stroke-width='.6' d='M172 304L177 249L219 298ZM73 651L57 602L98 647ZM119 602L57 602L70 583Z'/><path fill='#a06020' stroke='#a06020' stroke-width='.6' d='M177 249L207 248L219 298ZM1152 388L1152 403L1135 396Z'/><path fill='#784808' stroke='#784808' stroke-width='.6' d='M189 232L177 249L160 243ZM1239 474L1235 492L1220 469ZM11 202L0 200L14 198ZM707 679L723 730L694 734ZM653 653L680 635L666 664ZM535 736L549 707L588 733ZM463 595L444 563L448 563Z'/><path fill='#784810' stroke='#784810' stroke-width='.6' d='M171 152L124 158L157 143ZM1201 279L1205 291L1199 282ZM565 158L562 154L566 158ZM1197 289L1174 300L1184 277ZM1315 633L1329 628L1330 646ZM16 665L22 686L0 700ZM437 70L405 84L410 61ZM919 370L933 371L942 393ZM224 123L189 109L203 84ZM224 123L230 139L171 152ZM306 633L260 626L270 612ZM148 857L175 830L182 857ZM1218 644L1212 634L1231 638ZM718 598L725 610L699 594ZM518 732L498 799L469 753ZM1003 392L993 389L1004 390ZM1182 387L1183 394L1172 387Z'/><path fill='#100008' stroke='#100008' stroke-width='.6' d='M143 245L144 211L160 243ZM890 468L919 444L906 472Z'/><path fill='#301808' stroke='#301808' stroke-width='.6' d='M144 211L172 205L160 243ZM283 291L314 304L305 322ZM1346 513L1317 496L1353 506ZM104 149L83 173L51 131ZM576 76L573 83L569 62ZM573 83L549 63L569 62ZM608 229L586 239L559 208ZM343 452L305 454L342 447ZM642 754L641 746L651 741ZM1202 675L1201 665L1218 676ZM1195 671L1201 665L1202 675ZM1355 637L1372 659L1349 650ZM578 73L576 76L569 62ZM1129 212L1132 196L1149 206ZM169 133L186 106L189 109ZM152 94L169 133L136 121ZM433 90L469 77L448 130ZM495 664L497 671L482 654ZM448 563L444 563L463 542ZM1262 569L1254 583L1254 572ZM513 680L497 671L503 665ZM1129 212L1121 204L1132 196ZM1125 218L1113 226L1107 214ZM1121 204L1125 218L1107 214ZM401 435L394 450L375 448ZM208 834L175 830L185 799ZM410 819L434 805L428 825ZM680 635L725 610L727 644Z'/><path fill='#381000' stroke='#381000' stroke-width='.6' d='M144 211L143 245L113 227ZM215 417L210 442L185 439Z'/><path fill='#582808' stroke='#582808' stroke-width='.6' d='M86 208L144 211L113 227ZM509 833L478 865L471 818ZM154 670L127 642L162 631ZM199 935L201 897L210 903Z'/><path fill='#988050' stroke='#988050' stroke-width='.6' d='M304 22L279 86L257 16ZM610 462L605 470L590 466ZM543 444L574 474L543 458ZM393 910L412 890L421 903ZM574 474L560 483L543 458Z'/><path fill='#a87028' stroke='#a87028' stroke-width='.6' d='M283 291L223 308L219 298ZM861 353L888 350L853 362ZM544 147L513 205L491 177ZM14 496L22 527L0 500ZM1132 237L1169 241L1171 276ZM918 341L919 353L888 350ZM44 514L22 527L14 496ZM756 624L749 634L740 622ZM536 264L515 306L495 251Z'/><path fill='#a07030' stroke='#a07030' stroke-width='.6' d='M391 274L369 227L409 251ZM82 974L98 937L127 951ZM987 292L955 312L951 296ZM881 553L885 596L880 593ZM1275 542L1287 556L1268 557ZM462 506L468 516L443 519ZM1164 220L1178 224L1169 241ZM745 664L749 634L765 642ZM1233 319L1268 324L1232 327ZM1266 451L1272 457L1256 464ZM728 358L755 323L757 360ZM929 560L926 564L922 535ZM1287 421L1290 420L1308 443ZM1315 554L1320 562L1312 562Z'/><path fill='#503820' stroke='#503820' stroke-width='.6' d='M474 130L503 105L510 127ZM701 282L720 296L705 311ZM1251 681L1279 659L1282 687ZM1251 681L1246 677L1259 655ZM576 76L578 73L584 85ZM638 448L642 442L667 457ZM1410 550L1398 526L1423 539ZM864 132L881 136L876 152ZM216 35L223 32L231 53ZM291 923L280 920L298 895ZM1207 584L1211 575L1210 585ZM1113 226L1125 218L1117 228ZM585 496L548 513L577 487ZM548 513L585 496L583 519ZM1142 192L1153 186L1149 206Z'/><path fill='#885818' stroke='#885818' stroke-width='.6' d='M385 77L350 87L388 59ZM346 106L350 87L385 77ZM847 402L853 392L880 418ZM1274 512L1259 510L1261 490ZM562 154L565 158L561 159ZM5 589L10 614L0 600ZM1005 315L1033 308L1035 314ZM540 640L485 654L519 597ZM462 899L448 871L478 865ZM851 607L840 591L880 593ZM1339 555L1340 564L1334 560ZM722 593L725 610L718 598ZM1137 307L1129 313L1131 288ZM1315 554L1319 550L1320 562Z'/><path fill='#583810' stroke='#583810' stroke-width='.6' d='M360 26L350 87L329 43ZM937 246L889 249L893 205ZM694 426L733 397L737 433ZM532 879L485 895L478 865ZM1401 574L1405 556L1422 575ZM468 516L493 539L463 542ZM693 470L729 467L721 501ZM1418 580L1401 579L1401 574ZM1321 349L1319 316L1352 319ZM594 498L605 470L634 479ZM722 593L718 583L725 583ZM1355 637L1361 633L1375 639ZM1023 243L1011 246L1007 245ZM1036 286L1036 280L1043 287Z'/><path fill='#885810' stroke='#885810' stroke-width='.6' d='M350 87L346 106L314 60Z'/><path fill='#785820' stroke='#785820' stroke-width='.6' d='M304 22L324 38L314 60ZM154 66L157 88L152 94Z'/><path fill='#584028' stroke='#584028' stroke-width='.6' d='M1354 512L1346 513L1353 506ZM573 83L576 76L584 85ZM864 132L853 164L838 148ZM745 170L755 178L758 185ZM519 597L534 592L548 609ZM1000 541L979 552L992 531ZM216 35L231 53L192 42ZM848 180L817 183L838 148ZM1379 382L1367 412L1344 387ZM1078 669L1074 669L1074 658ZM1384 377L1379 382L1359 365ZM1055 651L1043 649L1043 641ZM1005 617L1004 631L993 625ZM355 602L358 599L364 605ZM364 605L358 599L377 592Z'/><path fill='#906838' stroke='#906838' stroke-width='.6' d='M1346 513L1354 512L1343 526ZM1118 264L1085 270L1084 262ZM814 604L834 642L822 642ZM1324 432L1315 418L1322 405ZM98 937L79 971L66 961ZM1431 640L1445 649L1428 664ZM992 214L1007 245L972 251ZM789 653L798 610L822 642ZM1028 213L992 214L1016 202ZM1118 354L1108 339L1125 340ZM1395 655L1431 640L1405 667ZM1294 312L1281 301L1288 301ZM1379 141L1380 127L1398 139ZM487 505L532 505L523 529ZM530 499L532 505L487 505Z'/><path fill='#c09058' stroke='#c09058' stroke-width='.6' d='M1309 547L1296 560L1287 540ZM392 644L394 646L344 663ZM1108 339L1108 337L1125 340Z'/><path fill='#c0a8b8' stroke='#c0a8b8' stroke-width='.6' d='M1287 253L1308 225L1310 228Z'/><path fill='#b098a0' stroke='#b098a0' stroke-width='.6' d='M1287 253L1275 249L1286 212ZM1455 611L1456 618L1448 610ZM1456 618L1466 636L1462 636Z'/><path fill='#886020' stroke='#886020' stroke-width='.6' d='M1200 295L1205 291L1204 294ZM1331 942L1350 1000L1331 1001ZM779 229L807 228L785 265ZM1175 301L1174 300L1197 289ZM1233 319L1232 321L1225 313ZM1174 300L1174 304L1167 300Z'/><path fill='#b8a8a0' stroke='#b8a8a0' stroke-width='.6' d='M1237 121L1235 60L1269 83ZM1235 164L1237 121L1244 126ZM841 681L874 658L886 701ZM332 911L321 925L332 908ZM841 681L791 712L778 698ZM875 644L874 658L856 649ZM1526 850L1528 791L1548 839ZM170 798L137 793L173 793ZM1125 178L1109 176L1114 164Z'/><path fill='#b8a0a8' stroke='#b8a0a8' stroke-width='.6' d='M1308 187L1302 177L1310 159ZM1158 547L1151 546L1152 536Z'/><path fill='#c0a8c0' stroke='#c0a8c0' stroke-width='.6' d='M1302 177L1308 187L1286 212Z'/><path fill='#b08048' stroke='#b08048' stroke-width='.6' d='M848 298L827 284L844 265ZM345 281L369 227L391 274ZM292 251L298 224L319 262ZM369 227L387 211L409 251ZM987 292L982 316L955 312ZM139 562L126 579L112 567ZM1169 363L1183 369L1174 370ZM1183 369L1169 363L1175 349ZM321 745L315 730L326 732Z'/><path fill='#b08858' stroke='#b08858' stroke-width='.6' d='M844 212L849 212L844 265ZM1288 288L1307 284L1301 301ZM1227 592L1204 611L1206 598ZM321 745L318 756L316 745ZM1258 425L1262 434L1257 427Z'/><path fill='#786038' stroke='#786038' stroke-width='.6' d='M875 215L852 181L893 205ZM260 799L244 790L250 785ZM620 840L625 838L618 847ZM1337 369L1344 387L1319 389Z'/><path fill='#b8a078' stroke='#b8a078' stroke-width='.6' d='M875 215L849 212L852 181ZM632 638L639 603L655 600ZM849 212L839 200L852 181ZM577 544L583 519L589 518ZM393 910L399 876L412 890ZM1377 266L1381 273L1369 272ZM1203 638L1183 657L1183 627ZM1183 627L1197 614L1203 627ZM1102 290L1102 291L1083 303ZM408 479L422 462L443 485ZM468 453L422 462L422 423Z'/><path fill='#604840' stroke='#604840' stroke-width='.6' d='M745 170L748 139L768 169ZM977 134L978 156L969 128Z'/><path fill='#584018' stroke='#584018' stroke-width='.6' d='M813 180L803 159L838 148ZM711 448L718 456L693 470ZM718 456L729 467L693 470Z'/><path fill='#806040' stroke='#806040' stroke-width='.6' d='M803 159L829 121L838 148ZM986 513L998 514L992 531ZM1449 574L1447 567L1468 566ZM906 128L921 145L898 158ZM601 848L613 843L618 847ZM1258 653L1273 633L1283 641ZM934 129L921 145L906 128ZM1077 310L1070 293L1083 303ZM1030 350L1041 359L1033 359ZM1041 359L1037 374L1033 359ZM1312 582L1311 583L1306 577ZM1037 374L1027 363L1033 359ZM145 819L175 830L142 844ZM336 713L325 715L326 706Z'/><path fill='#786048' stroke='#786048' stroke-width='.6' d='M796 119L829 121L803 159ZM851 607L875 644L856 649ZM751 686L780 662L778 698ZM1160 185L1169 190L1149 206ZM308 643L305 653L278 657ZM318 716L323 710L325 715Z'/><path fill='#706048' stroke='#706048' stroke-width='.6' d='M751 210L765 212L749 215ZM534 592L541 582L548 609ZM1182 691L1167 687L1172 677ZM581 38L595 55L569 54ZM543 444L527 416L549 424ZM690 81L672 84L682 66ZM690 81L694 76L703 81Z'/><path fill='#987858' stroke='#987858' stroke-width='.6' d='M751 210L758 185L765 212ZM124 998L127 951L157 975ZM124 998L82 974L127 951ZM998 496L986 513L995 487ZM993 460L1026 460L991 468ZM1499 536L1478 539L1496 530ZM707 797L691 798L701 794ZM358 599L359 586L377 592Z'/><path fill='#706058' stroke='#706058' stroke-width='.6' d='M706 191L706 221L701 219ZM13 72L23 82L0 100ZM169 800L170 798L174 801Z'/><path fill='#786860' stroke='#786860' stroke-width='.6' d='M745 170L706 191L718 167ZM137 793L140 804L124 805ZM81 837L87 827L91 835ZM395 520L360 520L393 507Z'/><path fill='#907860' stroke='#907860' stroke-width='.6' d='M751 210L706 191L745 170ZM1474 511L1467 510L1462 499ZM1459 482L1460 497L1457 492ZM988 634L968 627L973 625ZM988 634L973 625L993 625ZM176 961L181 969L157 975ZM1043 649L1037 656L1039 647Z'/><path fill='#987848' stroke='#987848' stroke-width='.6' d='M660 263L685 270L669 276ZM720 296L701 282L721 273ZM735 258L726 268L734 244ZM1382 569L1366 555L1389 552ZM1220 227L1178 224L1178 201ZM1008 250L1011 256L1005 263ZM408 479L393 507L384 493Z'/><path fill='#907858' stroke='#907858' stroke-width='.6' d='M685 270L660 263L658 227ZM986 183L1028 160L1028 180ZM834 642L826 645L822 642ZM817 199L839 200L822 208ZM569 416L543 444L549 424ZM462 899L480 900L454 911ZM593 856L601 848L618 847Z'/><path fill='#a88050' stroke='#a88050' stroke-width='.6' d='M736 265L720 296L721 273ZM1455 660L1445 649L1462 636ZM1030 350L1009 341L1027 336ZM1035 314L1059 321L1027 336ZM1209 635L1212 634L1209 639ZM1358 620L1342 612L1352 590ZM1338 617L1333 617L1334 610ZM1263 421L1265 415L1271 412ZM318 756L318 765L312 770Z'/><path fill='#604020' stroke='#604020' stroke-width='.6' d='M491 177L482 140L510 127ZM1310 449L1313 442L1326 445ZM853 164L864 132L876 152ZM422 423L409 412L413 407ZM1079 226L1049 196L1098 195ZM944 587L947 597L945 596ZM1113 226L1117 228L1113 238ZM780 355L784 356L787 364ZM875 536L881 536L881 553ZM920 618L944 587L945 596ZM1047 185L1079 173L1049 196ZM1045 210L1064 228L1051 239ZM743 309L738 315L735 309ZM1028 273L1017 266L1020 263ZM1011 246L1008 250L1007 245ZM548 513L530 499L560 483ZM1233 398L1213 383L1239 395Z'/><path fill='#604010' stroke='#604010' stroke-width='.6' d='M562 154L556 136L575 121ZM449 207L418 162L425 159ZM622 801L642 835L633 838ZM649 828L642 835L622 801ZM613 843L601 848L604 833ZM1048 279L1063 276L1058 297ZM1011 256L1023 243L1020 263ZM1037 203L1029 210L1016 202ZM1355 296L1371 305L1371 306Z'/><path fill='#785028' stroke='#785028' stroke-width='.6' d='M441 217L447 260L409 251ZM1367 529L1354 512L1364 505ZM341 170L309 134L345 118ZM976 549L979 552L961 576ZM472 138L448 130L474 130ZM1058 297L1049 302L1043 287ZM1272 592L1254 583L1271 577ZM392 644L392 641L394 646ZM930 561L929 560L952 549ZM1292 391L1278 402L1271 379ZM1036 280L1031 282L1028 273ZM1350 267L1373 264L1369 272ZM1271 412L1273 409L1287 421ZM1182 411L1180 398L1186 408Z'/><path fill='#786030' stroke='#786030' stroke-width='.6' d='M685 270L685 283L669 276ZM1401 579L1382 569L1401 574Z'/><path fill='#584020' stroke='#584020' stroke-width='.6' d='M664 333L680 328L692 352ZM1368 486L1371 489L1364 505ZM594 117L603 173L566 158ZM562 110L573 83L584 85ZM1377 487L1363 477L1390 466ZM1405 556L1401 574L1389 552ZM720 296L735 309L705 311ZM1049 196L1079 173L1098 195ZM471 711L481 696L500 716ZM1095 664L1106 669L1107 676ZM689 418L666 374L712 392ZM642 442L643 436L667 457ZM523 483L520 483L543 458ZM612 450L631 444L610 462Z'/><path fill='#888880' stroke='#888880' stroke-width='.6' d='M596 363L589 332L629 332ZM1196 978L1230 926L1217 987ZM577 391L584 387L588 396ZM578 398L577 391L588 396Z'/><path fill='#381808' stroke='#381808' stroke-width='.6' d='M279 398L276 396L276 363ZM935 352L918 341L955 312ZM677 610L684 585L699 594ZM1451 515L1467 516L1445 525ZM299 517L305 454L336 472ZM305 454L281 436L293 439ZM162 631L160 582L176 606ZM309 418L305 454L293 439ZM831 591L851 607L814 604ZM1271 531L1275 542L1262 534ZM721 660L680 635L727 644ZM103 854L121 853L117 871Z'/><path fill='#907040' stroke='#907040' stroke-width='.6' d='M366 363L353 343L368 352ZM1313 442L1310 449L1308 443ZM1344 387L1322 405L1319 389ZM1281 301L1266 292L1288 288ZM1178 224L1175 202L1178 201ZM379 483L408 479L384 493ZM548 513L546 535L523 529ZM1307 402L1298 396L1319 389ZM1385 223L1376 238L1358 241ZM994 394L1012 396L1009 422ZM532 505L548 513L523 529Z'/><path fill='#a86810' stroke='#a86810' stroke-width='.6' d='M366 363L417 403L369 407ZM199 887L160 890L182 857ZM550 213L561 159L559 208Z'/><path fill='#683808' stroke='#683808' stroke-width='.6' d='M314 366L366 363L326 413ZM641 746L604 704L651 741ZM39 169L83 173L66 216ZM83 173L86 208L66 216ZM210 442L208 506L180 465ZM177 249L157 282L157 270ZM448 563L488 587L471 596ZM566 794L622 801L604 833ZM509 833L532 879L478 865ZM1235 492L1220 494L1220 469ZM498 799L509 833L495 811ZM208 834L199 887L182 857ZM350 835L351 893L298 895ZM260 626L268 609L270 612ZM1367 529L1350 537L1343 526ZM262 133L224 123L249 84ZM90 914L105 935L98 937ZM1182 411L1177 432L1164 421ZM1344 550L1328 539L1350 537ZM1339 555L1329 548L1344 550ZM1344 550L1329 548L1328 539ZM725 610L740 622L727 644ZM1142 313L1138 307L1156 310Z'/><path fill='#784820' stroke='#784820' stroke-width='.6' d='M343 452L342 447L347 435ZM906 472L922 448L941 498ZM826 506L798 551L787 506ZM798 551L826 506L835 555ZM1247 590L1243 595L1233 588ZM1337 283L1355 296L1319 316ZM830 572L814 604L798 551ZM1131 359L1130 355L1135 359ZM1355 296L1351 270L1369 272Z'/><path fill='#b07830' stroke='#b07830' stroke-width='.6' d='M914 319L918 341L888 350ZM861 353L853 338L888 350ZM139 562L160 582L126 579ZM1204 349L1203 360L1189 344Z'/><path fill='#080000' stroke='#080000' stroke-width='.6' d='M798 345L781 346L799 313ZM921 433L919 444L896 412ZM767 328L753 315L799 313ZM458 680L449 667L482 654ZM406 615L432 620L406 638ZM392 641L406 615L406 638ZM432 620L439 669L418 659ZM386 596L406 615L376 631Z'/><path fill='#986828' stroke='#986828' stroke-width='.6' d='M788 492L769 472L809 462ZM1195 313L1200 295L1204 294ZM1205 291L1225 313L1204 294ZM249 248L260 223L258 258ZM949 253L945 225L972 251ZM1231 638L1246 606L1270 620ZM559 694L585 691L588 733ZM418 659L414 663L404 655ZM1279 452L1293 456L1288 462ZM318 756L350 745L320 770ZM1185 331L1193 328L1189 344Z'/><path fill='#a06828' stroke='#a06828' stroke-width='.6' d='M769 472L803 443L809 462ZM258 258L292 251L286 262ZM544 147L562 154L561 159ZM260 223L292 251L258 258ZM1151 466L1135 486L1131 473ZM487 505L488 474L520 483ZM1193 328L1208 339L1189 344ZM1158 399L1168 399L1164 403ZM44 514L33 531L22 527Z'/><path fill='#986020' stroke='#986020' stroke-width='.6' d='M803 443L769 472L761 460ZM981 336L935 352L955 312ZM513 205L505 218L491 177ZM349 722L350 745L326 732ZM1203 360L1195 366L1189 344ZM53 510L44 514L61 489ZM44 540L33 531L44 514Z'/><path fill='#503810' stroke='#503810' stroke-width='.6' d='M653 509L660 535L637 530ZM1384 494L1380 522L1364 505ZM647 74L672 84L638 105ZM469 77L460 41L506 68Z'/><path fill='#907030' stroke='#907030' stroke-width='.6' d='M660 535L648 541L637 530Z'/><path fill='#684820' stroke='#684820' stroke-width='.6' d='M629 564L648 541L649 565ZM1005 617L978 605L1010 603ZM19 112L23 82L51 131ZM341 170L298 224L293 185ZM573 83L562 110L556 105ZM421 278L397 272L409 251ZM996 447L993 460L994 450ZM979 552L976 549L992 531ZM418 162L384 171L391 151ZM422 423L415 405L417 403ZM415 405L422 423L413 407ZM1009 422L996 447L976 421ZM1083 261L1075 243L1098 240ZM1048 279L1058 297L1043 287ZM1037 203L1045 198L1042 207ZM1369 296L1371 305L1355 296ZM1043 396L1030 379L1033 378Z'/><path fill='#a88848' stroke='#a88848' stroke-width='.6' d='M648 541L621 556L637 530ZM1193 659L1203 638L1203 659Z'/><path fill='#987838' stroke='#987838' stroke-width='.6' d='M648 541L629 564L621 556Z'/><path fill='#584010' stroke='#584010' stroke-width='.6' d='M681 458L711 448L693 470Z'/><path fill='#805818' stroke='#805818' stroke-width='.6' d='M733 397L728 358L757 360ZM1344 550L1350 537L1366 555Z'/><path fill='#805010' stroke='#805010' stroke-width='.6' d='M737 433L733 397L776 425ZM1184 277L1201 279L1199 282ZM308 127L279 86L314 60ZM563 861L532 879L538 839ZM723 730L690 764L694 734ZM498 799L449 806L469 753ZM1350 537L1328 539L1343 526ZM1005 315L1033 307L1033 308ZM1032 301L1033 307L1005 315ZM1164 421L1156 418L1164 403ZM1209 368L1202 390L1195 366Z'/><path fill='#986010' stroke='#986010' stroke-width='.6' d='M733 397L791 392L776 425ZM1208 258L1169 241L1181 229ZM444 563L463 595L421 609ZM749 634L745 664L727 644Z'/><path fill='#987030' stroke='#987030' stroke-width='.6' d='M69 938L98 937L66 961ZM1287 556L1275 542L1287 540ZM1135 389L1127 379L1142 361ZM1334 643L1329 628L1352 636ZM1329 628L1325 626L1325 620ZM1108 339L1089 343L1102 335ZM1274 322L1268 324L1253 305ZM1268 324L1233 319L1253 305ZM1339 555L1347 562L1340 564Z'/><path fill='#705018' stroke='#705018' stroke-width='.6' d='M729 542L750 491L776 536ZM534 82L506 68L535 76ZM1330 523L1324 515L1346 513ZM1334 643L1352 636L1349 650ZM1361 633L1373 622L1375 639Z'/><path fill='#503818' stroke='#503818' stroke-width='.6' d='M798 610L753 602L776 567ZM758 185L755 178L768 169ZM674 544L684 585L649 565ZM463 542L440 520L443 519ZM1092 176L1102 185L1098 195ZM735 258L737 245L752 233ZM772 623L765 642L766 622ZM1045 210L1051 239L1040 236ZM1063 276L1048 279L1047 265ZM1315 676L1295 679L1309 665ZM643 436L645 431L667 457ZM748 316L738 315L743 309ZM399 600L386 596L404 594Z'/><path fill='#583000' stroke='#583000' stroke-width='.6' d='M641 746L615 776L588 733Z'/><path fill='#804808' stroke='#804808' stroke-width='.6' d='M604 704L641 746L588 733ZM919 370L896 412L888 350ZM485 654L496 596L519 597ZM1179 449L1156 467L1175 445ZM496 596L466 620L471 596ZM749 679L743 687L731 670ZM222 585L200 650L176 606ZM224 123L262 133L230 139ZM160 890L176 931L127 951ZM463 595L448 563L471 596ZM431 837L419 842L428 825ZM518 732L535 736L498 799Z'/><path fill='#080808' stroke='#080808' stroke-width='.6' d='M491 684L458 680L482 654ZM493 539L488 587L466 546ZM976 582L979 552L1004 562ZM753 315L790 280L799 313Z'/><path fill='#d09030' stroke='#d09030' stroke-width='.6' d='M364 732L408 694L388 734Z'/><path fill='#d8a058' stroke='#d8a058' stroke-width='.6' d='M364 732L345 696L408 694Z'/><path fill='#d8b880' stroke='#d8b880' stroke-width='.6' d='M345 696L344 663L408 694ZM405 349L368 352L402 330ZM1125 340L1110 329L1118 325ZM1121 323L1128 335L1118 325ZM1167 372L1158 366L1169 363Z'/><path fill='#887060' stroke='#887060' stroke-width='.6' d='M321 925L298 895L332 908ZM1588 637L1560 631L1564 617ZM741 223L706 191L751 210ZM1432 590L1445 594L1448 610ZM864 132L855 110L870 111Z'/><path fill='#b0b0b8' stroke='#b0b0b8' stroke-width='.6' d='M1574 977L1600 950L1600 1000ZM1550 1000L1574 977L1600 1000ZM1574 977L1550 1000L1561 958ZM1568 935L1526 875L1561 873ZM1548 839L1600 850L1561 873ZM1126 605L1122 617L1121 605ZM1124 604L1126 605L1121 605Z'/><path fill='#b0a090' stroke='#b0a090' stroke-width='.6' d='M751 743L750 737L789 743ZM780 662L841 681L778 698ZM763 714L791 712L789 743ZM1584 602L1576 598L1585 593ZM1373 665L1362 699L1359 667ZM137 793L169 800L140 804ZM75 841L65 852L74 828ZM1576 598L1575 595L1585 593ZM1315 680L1332 676L1313 703ZM1220 227L1178 201L1228 192ZM102 826L92 826L98 822ZM942 650L949 632L960 630ZM1016 636L1020 642L1009 638ZM1001 633L1008 634L1009 638ZM1008 634L1016 636L1009 638ZM178 733L162 689L170 683ZM1017 143L1009 141L1016 134ZM1014 129L1009 141L1005 144ZM1421 414L1420 409L1443 401Z'/><path fill='#705848' stroke='#705848' stroke-width='.6' d='M1192 696L1202 675L1207 681ZM460 41L490 21L503 28ZM1339 435L1340 441L1326 445ZM611 570L618 577L603 589ZM1442 491L1455 478L1457 492ZM1018 602L1030 600L1025 612ZM1065 156L1029 161L1028 160ZM341 613L340 613L355 602Z'/><path fill='#605038' stroke='#605038' stroke-width='.6' d='M1202 675L1192 696L1192 673ZM968 627L960 630L942 619ZM415 537L395 520L415 528ZM522 383L554 385L544 395ZM1036 640L1039 639L1039 647ZM341 613L355 602L343 613ZM129 839L121 853L117 850Z'/><path fill='#282830' stroke='#282830' stroke-width='.6' d='M1196 978L1217 987L1199 983Z'/><path fill='#202030' stroke='#202030' stroke-width='.6' d='M1178 975L1196 978L1199 983Z'/><path fill='#383840' stroke='#383840' stroke-width='.6' d='M1190 973L1196 978L1178 975Z'/><path fill='#888888' stroke='#888888' stroke-width='.6' d='M1196 978L1190 973L1230 926Z'/><path fill='#787878' stroke='#787878' stroke-width='.6' d='M1174 967L1165 957L1180 965Z'/><path fill='#686870' stroke='#686870' stroke-width='.6' d='M1174 967L1173 967L1165 957ZM596 363L601 372L584 387Z'/><path fill='#505058' stroke='#505058' stroke-width='.6' d='M1178 975L1174 967L1180 965Z'/><path fill='#d0d8d8' stroke='#d0d8d8' stroke-width='.6' d='M1071 428L1084 432L1078 468ZM1046 443L1071 428L1078 468ZM1024 537L1035 514L1047 536Z'/><path fill='#d0b8a0' stroke='#d0b8a0' stroke-width='.6' d='M1105 378L1089 383L1094 365Z'/><path fill='#905808' stroke='#905808' stroke-width='.6' d='M1247 504L1235 492L1261 490ZM544 217L550 213L560 248Z'/><path fill='#906840' stroke='#906840' stroke-width='.6' d='M1118 264L1098 240L1113 238ZM1498 546L1511 555L1495 561ZM1009 341L1005 315L1027 336ZM1028 273L1031 282L1017 280ZM1106 291L1116 286L1113 295Z'/><path fill='#886830' stroke='#886830' stroke-width='.6' d='M1098 240L1118 264L1084 262ZM659 503L666 485L661 503ZM1405 667L1431 640L1428 664ZM1304 338L1273 340L1274 322ZM755 323L767 328L757 360ZM1018 384L1030 379L1043 396Z'/><path fill='#906828' stroke='#906828' stroke-width='.6' d='M1200 295L1195 313L1182 309ZM1225 313L1195 313L1204 294ZM1225 313L1205 291L1224 269ZM1233 319L1225 313L1253 305ZM1175 301L1197 289L1182 309ZM1178 224L1220 227L1181 229ZM1225 313L1232 321L1232 327ZM1027 363L995 359L1009 341Z'/><path fill='#805018' stroke='#805018' stroke-width='.6' d='M1167 300L1154 297L1171 276ZM561 159L565 158L566 158ZM1184 277L1174 300L1176 278ZM122 141L136 121L157 143ZM276 396L273 408L268 399ZM942 393L933 371L946 365ZM449 806L498 799L471 818ZM1217 649L1231 638L1225 663ZM1325 626L1329 628L1315 633ZM276 153L262 133L308 127ZM560 248L555 266L536 264ZM549 707L559 694L588 733ZM160 890L148 857L182 857ZM448 871L462 899L421 903ZM1154 297L1140 288L1171 276ZM1282 597L1294 601L1283 600ZM1287 626L1294 601L1314 618ZM1294 601L1287 626L1283 600ZM117 700L88 701L98 647ZM949 253L939 255L937 246ZM840 591L881 553L880 593ZM1347 562L1339 555L1344 550ZM38 562L36 566L0 550ZM730 590L725 610L722 593ZM725 610L736 590L753 602Z'/><path fill='#a08868' stroke='#a08868' stroke-width='.6' d='M1071 280L1085 270L1083 303ZM1386 663L1372 659L1389 656ZM993 460L996 447L1026 460ZM292 758L312 770L304 777ZM121 853L129 839L142 844Z'/><path fill='#784018' stroke='#784018' stroke-width='.6' d='M903 507L903 476L941 498Z'/><path fill='#804818' stroke='#804818' stroke-width='.6' d='M903 476L903 507L876 509ZM903 476L906 472L941 498ZM788 492L826 506L787 506Z'/><path fill='#482810' stroke='#482810' stroke-width='.6' d='M890 468L903 476L876 509ZM144 211L112 159L124 158ZM189 232L214 229L207 248ZM1346 513L1324 515L1317 496ZM298 224L260 223L293 185ZM718 583L710 568L725 583ZM1018 602L1011 605L1010 603ZM987 292L1005 315L991 309ZM83 923L90 914L84 923ZM1262 569L1268 558L1272 565ZM1359 365L1334 367L1324 351ZM1132 224L1129 212L1149 206ZM939 255L939 259L889 249ZM211 794L244 790L245 814ZM394 646L392 641L406 638ZM127 659L154 670L136 696ZM140 874L148 857L145 880Z'/><path fill='#281800' stroke='#281800' stroke-width='.6' d='M890 468L906 472L903 476Z'/><path fill='#d0d0d0' stroke='#d0d0d0' stroke-width='.6' d='M1037 466L1030 465L1035 454ZM1030 465L1037 466L1033 475ZM1087 422L1089 383L1094 421ZM1095 519L1098 522L1094 520Z'/><path fill='#805020' stroke='#805020' stroke-width='.6' d='M815 475L826 506L788 492ZM1354 512L1367 529L1343 526ZM409 135L448 130L425 159ZM987 292L972 251L1005 263ZM947 514L967 531L952 549ZM341 170L307 162L309 134ZM449 207L505 218L495 251ZM157 88L160 62L181 78ZM38 562L44 540L57 546Z'/><path fill='#906020' stroke='#906020' stroke-width='.6' d='M798 610L814 604L822 642ZM861 353L852 354L853 338ZM967 531L976 549L952 549ZM690 764L682 792L665 796ZM1142 313L1156 310L1139 328ZM1330 523L1328 539L1315 524ZM1201 279L1209 265L1224 269ZM723 730L734 765L690 764ZM1220 227L1209 241L1181 229ZM1004 390L993 389L988 365ZM1222 355L1232 327L1239 352ZM318 756L321 745L350 745ZM1213 383L1224 400L1211 401Z'/><path fill='#d8d0d8' stroke='#d8d0d8' stroke-width='.6' d='M1084 531L1092 543L1054 564Z'/><path fill='#d8d0c8' stroke='#d8d0c8' stroke-width='.6' d='M1098 522L1118 500L1131 504ZM1499 406L1527 403L1518 410ZM1561 363L1556 364L1561 340ZM1076 362L1089 383L1069 388ZM305 653L329 699L312 711Z'/><path fill='#a8a0b0' stroke='#a8a0b0' stroke-width='.6' d='M1084 531L1098 522L1092 543ZM1122 594L1122 576L1125 591Z'/><path fill='#989090' stroke='#989090' stroke-width='.6' d='M1000 541L1016 559L1004 562ZM24 70L23 82L13 72Z'/><path fill='#b0a8a8' stroke='#b0a8a8' stroke-width='.6' d='M1016 559L1031 584L1011 577ZM1031 584L1039 584L1029 593ZM1133 649L1137 634L1147 638Z'/><path fill='#988068' stroke='#988068' stroke-width='.6' d='M998 514L986 513L998 496ZM598 557L611 570L603 589ZM468 453L422 423L448 406ZM1576 598L1584 602L1581 606ZM1076 270L1085 270L1071 280ZM618 577L642 591L611 601ZM1033 606L1065 617L1035 618Z'/><path fill='#684020' stroke='#684020' stroke-width='.6' d='M995 487L986 513L941 498ZM875 536L855 533L876 509ZM1005 315L1009 341L981 336ZM239 938L222 948L199 935ZM1443 571L1439 570L1447 567Z'/><path fill='#603820' stroke='#603820' stroke-width='.6' d='M986 513L947 514L941 498ZM1285 571L1296 560L1287 575ZM320 535L310 540L297 528ZM1220 494L1188 515L1171 493Z'/><path fill='#805820' stroke='#805820' stroke-width='.6' d='M1331 942L1300 945L1320 873ZM1289 980L1331 942L1331 1001ZM838 319L827 284L848 298ZM556 136L544 147L540 136ZM432 866L448 871L421 903ZM137 102L136 121L87 118ZM735 258L785 265L736 265ZM409 135L418 162L391 151ZM743 687L763 714L729 691ZM736 590L729 542L776 567ZM1298 396L1290 420L1278 402Z'/><path fill='#987038' stroke='#987038' stroke-width='.6' d='M1331 942L1368 896L1362 941ZM659 503L653 509L634 479ZM1293 456L1306 447L1310 449ZM882 221L889 249L844 265ZM1325 626L1320 619L1325 620ZM306 273L313 287L305 273ZM680 635L653 653L632 638ZM1273 340L1268 324L1274 322ZM738 315L755 323L728 358ZM505 333L515 306L523 317ZM1177 324L1177 326L1174 322Z'/><path fill='#807058' stroke='#807058' stroke-width='.6' d='M1230 926L1237 891L1248 889ZM523 529L547 547L513 556ZM321 925L291 923L298 895ZM1017 143L1028 160L1005 144ZM1167 656L1158 659L1156 657ZM1065 617L1051 628L1035 618ZM1171 663L1173 655L1177 655Z'/><path fill='#908878' stroke='#908878' stroke-width='.6' d='M1230 896L1237 891L1230 926ZM1092 176L1088 170L1109 176ZM619 297L627 302L602 321Z'/><path fill='#988060' stroke='#988060' stroke-width='.6' d='M1509 542L1498 546L1500 538ZM1498 546L1499 536L1500 538ZM1460 497L1459 482L1462 499ZM575 624L540 640L548 609ZM408 479L415 528L393 507ZM325 715L323 710L326 706ZM422 462L413 438L422 423Z'/><path fill='#a07860' stroke='#a07860' stroke-width='.6' d='M1529 593L1558 572L1539 599ZM1260 260L1287 261L1289 271ZM1226 418L1221 432L1225 417Z'/><path fill='#a08060' stroke='#a08060' stroke-width='.6' d='M1558 572L1561 591L1539 599ZM1558 572L1529 593L1533 558ZM563 861L582 865L561 873ZM1266 292L1254 260L1260 260ZM1233 452L1237 455L1229 461ZM422 462L408 479L394 450Z'/><path fill='#806848' stroke='#806848' stroke-width='.6' d='M1509 542L1511 555L1498 546ZM652 68L672 84L647 74ZM826 645L789 653L822 642ZM1083 261L1076 270L1071 253ZM471 711L500 716L469 753ZM320 535L316 565L310 540ZM1068 315L1070 293L1077 310Z'/><path fill='#987050' stroke='#987050' stroke-width='.6' d='M1529 593L1511 555L1533 558ZM532 879L563 861L561 873ZM1274 575L1275 577L1271 577ZM1286 575L1275 577L1280 572Z'/><path fill='#906848' stroke='#906848' stroke-width='.6' d='M1511 555L1529 593L1495 561ZM1373 264L1350 267L1358 241ZM1116 286L1106 291L1102 290Z'/><path fill='#d8d8d8' stroke='#d8d8d8' stroke-width='.6' d='M1118 500L1085 507L1082 494ZM1087 422L1071 428L1069 388ZM1098 522L1095 519L1118 500ZM1095 519L1085 507L1118 500ZM1175 607L1183 627L1158 635Z'/><path fill='#a8a8b0' stroke='#a8a8b0' stroke-width='.6' d='M1065 511L1085 507L1069 524ZM1126 605L1124 604L1123 603Z'/><path fill='#a0a0a8' stroke='#a0a0a8' stroke-width='.6' d='M1085 507L1084 531L1069 524ZM1123 603L1122 594L1134 602Z'/><path fill='#d0d8e0' stroke='#d0d8e0' stroke-width='.6' d='M1069 479L1065 511L1033 475ZM1037 466L1069 479L1033 475ZM1035 514L1063 515L1047 536ZM1063 515L1035 514L1065 511Z'/><path fill='#d0d0e0' stroke='#d0d0e0' stroke-width='.6' d='M1065 511L1069 479L1082 494Z'/><path fill='#d8d8e0' stroke='#d8d8e0' stroke-width='.6' d='M1082 494L1069 479L1078 468ZM1168 599L1191 590L1175 607ZM1051 420L1050 407L1071 428ZM1160 597L1175 607L1158 635Z'/><path fill='#c09858' stroke='#c09858' stroke-width='.6' d='M1121 465L1131 473L1115 468ZM16 665L39 632L73 651ZM1127 427L1139 418L1144 448ZM1312 562L1296 560L1309 547ZM304 268L292 251L319 262ZM1179 336L1176 346L1168 331ZM515 306L505 333L471 333ZM1163 390L1167 372L1172 387Z'/><path fill='#c09860' stroke='#c09860' stroke-width='.6' d='M1122 457L1121 465L1115 468ZM1312 562L1320 562L1307 574ZM1110 329L1108 337L1102 335ZM1340 564L1347 562L1350 574ZM1355 568L1347 562L1366 555ZM453 319L515 306L471 333Z'/><path fill='#a06820' stroke='#a06820' stroke-width='.6' d='M1175 445L1144 448L1167 433ZM505 218L536 264L495 251ZM919 353L919 370L888 350ZM756 624L740 622L753 602ZM1208 339L1211 340L1204 349ZM740 622L725 610L753 602ZM1134 316L1137 307L1142 313Z'/><path fill='#604838' stroke='#604838' stroke-width='.6' d='M1207 681L1218 678L1223 683ZM335 535L330 564L320 535ZM500 716L518 732L469 753Z'/><path fill='#402820' stroke='#402820' stroke-width='.6' d='M1219 676L1230 675L1223 683ZM779 229L756 224L765 212ZM729 104L756 107L748 139ZM437 804L449 806L428 825Z'/><path fill='#504028' stroke='#504028' stroke-width='.6' d='M1218 678L1219 676L1223 683ZM1339 435L1326 445L1338 433ZM298 895L351 893L332 908ZM1079 173L1092 176L1098 195ZM1061 655L1075 624L1074 658ZM1055 651L1075 624L1061 655ZM1039 639L1036 640L1034 636Z'/><path fill='#a07848' stroke='#a07848' stroke-width='.6' d='M1320 431L1313 442L1308 443ZM1288 301L1288 288L1301 301ZM1118 354L1121 362L1094 365ZM1333 617L1328 607L1334 610ZM680 635L632 638L655 600ZM1266 292L1253 305L1236 267ZM1127 232L1132 224L1132 237ZM1116 286L1102 290L1118 264ZM1337 602L1336 600L1339 598Z'/><path fill='#806038' stroke='#806038' stroke-width='.6' d='M1324 432L1322 405L1338 433ZM1279 659L1251 681L1259 655ZM1315 633L1288 661L1283 641ZM1059 321L1056 347L1027 336ZM735 309L738 315L705 311ZM734 765L723 730L738 764ZM407 791L423 758L431 774ZM462 899L454 911L421 903ZM1041 359L1030 350L1056 347ZM1047 265L1023 243L1040 236ZM1305 366L1334 367L1319 389ZM1123 192L1117 196L1109 176ZM1017 266L1012 260L1020 263ZM545 680L513 680L540 640ZM1118 229L1127 232L1113 238ZM421 278L453 319L423 310ZM1376 238L1376 246L1358 241ZM1030 379L1027 363L1033 378Z'/><path fill='#583820' stroke='#583820' stroke-width='.6' d='M1326 445L1324 432L1338 433ZM1287 626L1273 633L1270 620ZM1254 583L1262 569L1271 577ZM1295 679L1288 673L1309 665ZM1403 354L1359 365L1370 330ZM316 565L303 590L265 560ZM1403 354L1384 377L1359 365ZM1228 400L1238 412L1227 414Z'/><path fill='#785030' stroke='#785030' stroke-width='.6' d='M1313 442L1324 432L1326 445ZM746 308L720 296L736 265ZM1445 649L1431 640L1446 639ZM982 316L987 292L991 309ZM1388 608L1404 608L1399 617ZM1443 571L1447 567L1449 574ZM1442 573L1443 571L1449 574ZM162 689L154 670L170 683Z'/><path fill='#a07850' stroke='#a07850' stroke-width='.6' d='M1324 432L1313 442L1320 431ZM1253 305L1224 269L1236 267ZM1011 256L1012 260L1005 263ZM1012 260L1017 266L1005 263ZM1102 290L1085 270L1118 264ZM522 383L517 384L520 360Z'/><path fill='#a88870' stroke='#a88870' stroke-width='.6' d='M1496 530L1478 539L1488 519ZM1287 261L1305 265L1289 271ZM1307 284L1305 265L1311 263ZM1238 412L1246 412L1240 418Z'/><path fill='#704828' stroke='#704828' stroke-width='.6' d='M1447 567L1446 555L1468 566ZM1439 570L1442 573L1432 590ZM1213 447L1210 450L1207 436ZM1272 565L1268 558L1268 557ZM1213 433L1213 447L1207 436ZM1239 395L1222 355L1239 352Z'/><path fill='#683818' stroke='#683818' stroke-width='.6' d='M1446 555L1458 545L1468 566ZM1398 635L1373 622L1399 617Z'/><path fill='#a09880' stroke='#a09880' stroke-width='.6' d='M1442 440L1435 436L1441 437ZM460 41L434 5L450 0ZM602 321L633 320L629 332Z'/><path fill='#483828' stroke='#483828' stroke-width='.6' d='M1435 436L1434 456L1424 448ZM1424 448L1423 427L1432 436ZM776 132L768 110L796 119ZM1075 624L1088 647L1074 658ZM1012 629L1004 631L1005 617ZM1418 411L1394 397L1416 403ZM563 404L568 408L551 412ZM1394 397L1411 397L1416 403ZM1418 411L1419 412L1423 427Z'/><path fill='#684830' stroke='#684830' stroke-width='.6' d='M1457 492L1459 496L1451 498ZM551 41L549 63L531 40ZM853 164L848 180L838 148ZM1467 516L1480 517L1478 539ZM359 514L335 535L336 472ZM968 627L973 622L973 625ZM1280 572L1274 575L1279 568ZM160 62L154 66L147 39ZM1315 590L1328 607L1308 595ZM1315 590L1325 590L1328 607ZM1303 589L1315 590L1308 595ZM1240 418L1226 418L1227 414Z'/><path fill='#888070' stroke='#888070' stroke-width='.6' d='M1448 462L1441 459L1449 457ZM120 812L104 826L98 822ZM194 37L216 35L192 42ZM1112 641L1133 649L1116 652ZM1108 646L1112 641L1116 652ZM1093 631L1108 646L1088 647Z'/><path fill='#584828' stroke='#584828' stroke-width='.6' d='M1343 448L1363 477L1326 455Z'/><path fill='#483028' stroke='#483028' stroke-width='.6' d='M1390 466L1363 477L1375 446ZM1143 677L1160 661L1161 677ZM1455 478L1442 491L1443 474Z'/><path fill='#907868' stroke='#907868' stroke-width='.6' d='M1584 604L1591 615L1581 606ZM1132 685L1143 677L1143 687Z'/><path fill='#907058' stroke='#907058' stroke-width='.6' d='M1591 615L1564 617L1581 606ZM1564 617L1568 602L1581 606ZM1368 185L1398 180L1398 191ZM1568 602L1576 598L1581 606ZM1083 315L1068 315L1077 310ZM1037 374L1041 359L1045 376ZM1568 591L1571 595L1568 602Z'/><path fill='#886858' stroke='#886858' stroke-width='.6' d='M1591 615L1591 631L1564 617Z'/><path fill='#a09088' stroke='#a09088' stroke-width='.6' d='M1591 631L1591 615L1600 600ZM360 520L377 551L348 530ZM272 768L271 785L250 785Z'/><path fill='#b0a0a0' stroke='#b0a0a0' stroke-width='.6' d='M1591 615L1584 604L1600 600Z'/><path fill='#a89078' stroke='#a89078' stroke-width='.6' d='M1563 590L1561 591L1562 575ZM1511 555L1513 545L1516 547ZM261 665L250 681L250 664ZM500 904L480 900L481 899ZM996 447L1009 422L1026 460ZM1386 663L1395 656L1405 667ZM1373 142L1379 141L1382 154Z'/><path fill='#907060' stroke='#907060' stroke-width='.6' d='M1591 631L1588 637L1564 617ZM1287 253L1287 261L1275 249Z'/><path fill='#907870' stroke='#907870' stroke-width='.6' d='M1560 631L1588 637L1565 645Z'/><path fill='#b89870' stroke='#b89870' stroke-width='.6' d='M1485 649L1455 660L1470 639ZM1398 180L1400 178L1398 191ZM786 176L817 199L765 212ZM440 520L408 479L443 485Z'/><path fill='#b09068' stroke='#b09068' stroke-width='.6' d='M1455 660L1462 636L1470 639ZM639 603L644 598L655 600ZM1447 675L1455 662L1474 697ZM1288 661L1282 657L1283 641ZM589 518L594 498L637 530Z'/><path fill='#b09088' stroke='#b09088' stroke-width='.6' d='M1462 636L1466 636L1470 639Z'/><path fill='#a88088' stroke='#a88088' stroke-width='.6' d='M1456 618L1462 636L1446 639Z'/><path fill='#b8a0b8' stroke='#b8a0b8' stroke-width='.6' d='M1466 636L1456 618L1506 617Z'/><path fill='#b0a0a8' stroke='#b0a0a8' stroke-width='.6' d='M1456 618L1455 611L1479 588ZM1382 154L1383 165L1362 167ZM1364 150L1382 154L1362 167ZM1165 528L1165 539L1152 536ZM1151 546L1143 555L1150 545Z'/><path fill='#a08080' stroke='#a08080' stroke-width='.6' d='M1446 639L1425 618L1448 610ZM1561 607L1564 617L1539 599ZM1362 149L1318 152L1359 143Z'/><path fill='#683828' stroke='#683828' stroke-width='.6' d='M1404 608L1425 618L1399 617Z'/><path fill='#b89058' stroke='#b89058' stroke-width='.6' d='M1308 595L1316 616L1314 618ZM348 332L339 302L367 317ZM474 701L471 711L455 686ZM1294 601L1308 595L1314 618ZM1242 351L1257 377L1239 352ZM1333 617L1338 617L1329 628ZM1177 326L1180 329L1168 331Z'/><path fill='#d0b8a8' stroke='#d0b8a8' stroke-width='.6' d='M1323 738L1308 792L1281 790ZM223 308L222 350L202 328ZM746 891L757 902L708 900Z'/><path fill='#b0a088' stroke='#b0a088' stroke-width='.6' d='M1223 708L1207 681L1223 683ZM128 784L137 793L124 805ZM1209 856L1237 891L1230 896ZM906 128L882 113L886 73ZM1295 679L1313 703L1282 687ZM1295 679L1315 680L1313 703ZM1009 422L1037 406L1050 427ZM359 586L355 602L319 580Z'/><path fill='#886058' stroke='#886058' stroke-width='.6' d='M1425 618L1432 590L1448 610ZM1158 547L1168 540L1173 551Z'/><path fill='#784830' stroke='#784830' stroke-width='.6' d='M1404 608L1432 590L1425 618Z'/><path fill='#c8c098' stroke='#c8c098' stroke-width='.6' d='M1498 45L1518 12L1558 15Z'/><path fill='#d8d8b8' stroke='#d8d8b8' stroke-width='.6' d='M1444 207L1414 193L1421 176Z'/><path fill='#806860' stroke='#806860' stroke-width='.6' d='M978 156L1005 144L986 183Z'/><path fill='#786858' stroke='#786858' stroke-width='.6' d='M978 156L986 183L950 168ZM393 507L359 514L384 493ZM1076 270L1063 276L1071 253ZM520 699L545 680L549 707ZM1171 663L1167 656L1173 655Z'/><path fill='#685040' stroke='#685040' stroke-width='.6' d='M978 156L941 158L969 128ZM1167 687L1155 685L1161 677ZM431 774L443 754L469 753ZM776 132L796 119L803 159ZM1036 640L1023 637L1034 636ZM554 385L522 383L547 358ZM561 377L560 377L567 372Z'/><path fill='#705010' stroke='#705010' stroke-width='.6' d='M3 148L0 150L11 130Z'/><path fill='#603008' stroke='#603008' stroke-width='.6' d='M0 200L11 202L0 250ZM11 202L27 262L0 250ZM27 262L11 202L66 216ZM86 208L83 173L85 173ZM246 547L208 506L264 490ZM873 431L890 468L844 464ZM1267 604L1282 597L1283 600ZM200 650L250 638L250 664ZM100 272L102 276L58 286ZM1220 494L1181 464L1220 469ZM273 408L309 418L281 436ZM651 686L666 664L707 679ZM280 920L264 925L250 878ZM1272 592L1282 597L1267 604ZM32 599L29 611L10 614ZM176 931L201 897L199 935ZM57 546L53 510L66 502ZM127 659L117 700L98 647ZM419 842L410 819L428 825ZM1128 350L1128 356L1118 354ZM1139 299L1137 307L1131 288Z'/><path fill='#685028' stroke='#685028' stroke-width='.6' d='M23 82L40 65L51 131ZM70 891L68 877L86 900ZM1104 180L1117 196L1102 185ZM530 499L523 483L560 483Z'/><path fill='#c0c8d0' stroke='#c0c8d0' stroke-width='.6' d='M21 58L28 38L40 65ZM28 38L21 58L0 50Z'/><path fill='#b8c0c8' stroke='#b8c0c8' stroke-width='.6' d='M21 58L13 72L0 50Z'/><path fill='#906030' stroke='#906030' stroke-width='.6' d='M126 65L137 102L87 118ZM874 607L851 607L880 593ZM1301 301L1319 316L1301 307ZM1005 315L1035 314L1027 336ZM1126 378L1133 362L1127 379ZM1307 284L1337 283L1319 316ZM1213 383L1222 355L1239 395Z'/><path fill='#b88040' stroke='#b88040' stroke-width='.6' d='M0 600L11 619L0 650ZM54 463L56 464L61 489ZM1163 390L1168 399L1158 399Z'/><path fill='#703810' stroke='#703810' stroke-width='.6' d='M119 494L119 449L127 453ZM1156 467L1151 466L1144 448ZM1316 623L1325 626L1315 633ZM443 754L423 758L420 735ZM1182 411L1164 421L1164 403ZM995 359L988 365L981 336ZM1202 390L1182 387L1195 366Z'/><path fill='#905818' stroke='#905818' stroke-width='.6' d='M119 602L70 583L112 567ZM248 392L260 347L276 363ZM207 248L220 251L219 298ZM10 614L11 619L0 600ZM33 301L25 292L58 286ZM498 799L495 811L471 818ZM544 217L560 248L536 264ZM466 620L463 631L441 617ZM1272 457L1279 452L1288 462ZM53 510L44 540L44 514Z'/><path fill='#905820' stroke='#905820' stroke-width='.6' d='M126 579L119 602L112 567ZM1205 291L1201 279L1224 269ZM1174 300L1167 300L1176 278ZM58 286L25 292L56 270ZM226 184L257 223L221 231ZM257 223L260 223L249 248ZM485 654L540 640L503 665ZM1208 258L1209 241L1232 242ZM110 551L81 557L109 548Z'/><path fill='#a87828' stroke='#a87828' stroke-width='.6' d='M11 619L39 632L0 650Z'/><path fill='#c08028' stroke='#c08028' stroke-width='.6' d='M57 602L119 602L98 647Z'/><path fill='#c08838' stroke='#c08838' stroke-width='.6' d='M39 632L57 602L73 651ZM366 363L405 349L417 403ZM364 732L349 722L345 696Z'/><path fill='#883808' stroke='#883808' stroke-width='.6' d='M17 401L39 417L0 450Z'/><path fill='#985010' stroke='#985010' stroke-width='.6' d='M24 354L17 401L0 400Z'/><path fill='#783808' stroke='#783808' stroke-width='.6' d='M24 354L33 301L79 315ZM70 470L64 393L117 417ZM1156 467L1144 448L1175 445ZM102 276L116 288L86 315ZM423 758L396 735L420 735Z'/><path fill='#803808' stroke='#803808' stroke-width='.6' d='M64 393L56 464L39 417ZM86 315L116 288L114 327ZM114 327L116 288L156 312Z'/><path fill='#884008' stroke='#884008' stroke-width='.6' d='M56 464L64 393L70 470ZM478 865L456 849L471 818Z'/><path fill='#b86808' stroke='#b86808' stroke-width='.6' d='M166 367L158 357L200 356Z'/><path fill='#d8a860' stroke='#d8a860' stroke-width='.6' d='M218 367L204 402L200 356ZM1135 326L1128 335L1133 325ZM1128 335L1135 326L1139 328Z'/><path fill='#b88030' stroke='#b88030' stroke-width='.6' d='M252 431L248 392L268 399ZM1171 493L1158 495L1168 477ZM414 663L439 669L408 694Z'/><path fill='#b05808' stroke='#b05808' stroke-width='.6' d='M157 282L172 304L156 312ZM157 372L166 367L175 398Z'/><path fill='#985808' stroke='#985808' stroke-width='.6' d='M157 282L177 249L172 304ZM361 805L350 745L372 747Z'/><path fill='#401800' stroke='#401800' stroke-width='.6' d='M157 270L157 282L134 254ZM385 77L405 84L406 105Z'/><path fill='#b08848' stroke='#b08848' stroke-width='.6' d='M369 227L345 281L319 262ZM313 287L306 273L319 262ZM1203 638L1209 639L1203 659ZM1273 409L1264 414L1257 377Z'/><path fill='#d0a068' stroke='#d0a068' stroke-width='.6' d='M345 281L391 274L367 317ZM339 302L345 281L367 317ZM1127 456L1121 465L1122 457ZM1171 493L1165 508L1158 495Z'/><path fill='#705838' stroke='#705838' stroke-width='.6' d='M379 212L360 215L366 200ZM303 590L319 580L314 588ZM1344 387L1367 412L1352 419ZM719 89L729 104L711 93ZM147 39L154 66L126 65ZM1169 190L1175 202L1149 206ZM415 537L415 528L417 539ZM548 513L560 483L577 487ZM362 637L343 636L357 632Z'/><path fill='#c8a060' stroke='#c8a060' stroke-width='.6' d='M345 281L339 302L330 291ZM405 349L366 363L368 352ZM1121 465L1127 456L1131 473ZM217 408L248 392L252 431ZM345 281L324 289L319 262ZM324 289L345 281L330 291ZM1256 464L1237 455L1243 449ZM1168 331L1176 346L1175 349ZM1113 295L1129 313L1121 323Z'/><path fill='#784818' stroke='#784818' stroke-width='.6' d='M220 251L249 248L258 258ZM252 431L281 436L251 445ZM1288 462L1293 456L1304 472ZM1316 623L1287 626L1314 618ZM1287 626L1316 623L1315 633ZM368 152L341 170L345 118ZM1258 653L1231 638L1273 633ZM1323 651L1319 656L1315 633ZM276 153L308 127L309 134ZM437 70L448 49L451 67ZM725 610L730 590L736 590ZM1113 295L1116 286L1131 288Z'/><path fill='#705020' stroke='#705020' stroke-width='.6' d='M389 17L402 15L388 59ZM1301 530L1309 547L1287 540ZM1217 649L1225 663L1203 659ZM305 322L334 302L348 332ZM992 214L1028 213L1007 245ZM83 923L82 924L69 906ZM745 664L780 662L749 679ZM1045 198L1037 203L1028 180ZM1380 522L1394 530L1367 529ZM127 951L176 961L157 975ZM1031 282L1036 280L1036 286ZM1033 307L1032 301L1034 298Z'/><path fill='#807050' stroke='#807050' stroke-width='.6' d='M472 23L460 41L450 0ZM625 838L633 838L618 847ZM330 564L316 565L320 535Z'/><path fill='#907850' stroke='#907850' stroke-width='.6' d='M330 15L324 38L304 22ZM817 199L779 229L765 212ZM425 34L434 5L460 41ZM1070 293L1071 280L1083 303ZM1033 307L1034 298L1049 302Z'/><path fill='#b8b0b0' stroke='#b8b0b0' stroke-width='.6' d='M330 15L350 0L351 8ZM1526 850L1548 839L1561 873ZM1548 839L1528 791L1569 778ZM1093 631L1075 624L1087 609Z'/><path fill='#a09890' stroke='#a09890' stroke-width='.6' d='M151 35L194 37L192 42ZM231 25L223 32L226 23Z'/><path fill='#a0a0a0' stroke='#a0a0a0' stroke-width='.6' d='M494 12L490 21L474 19Z'/><path fill='#684818' stroke='#684818' stroke-width='.6' d='M503 105L534 82L556 105ZM1301 530L1315 524L1309 547ZM562 110L562 114L556 105ZM80 900L70 891L86 900ZM1401 579L1417 583L1404 608ZM1401 579L1418 580L1417 583ZM1047 265L1028 273L1020 263ZM1023 243L1028 213L1040 236ZM1102 185L1117 196L1098 195Z'/><path fill='#704820' stroke='#704820' stroke-width='.6' d='M573 83L534 82L535 76ZM1293 456L1310 449L1304 472ZM826 506L855 533L835 555ZM986 513L967 531L947 514ZM1272 565L1287 556L1279 568ZM1439 570L1432 590L1422 575ZM307 162L341 170L293 185ZM348 26L360 26L329 43ZM468 516L463 542L443 519ZM1107 214L1091 227L1098 195ZM944 587L930 561L961 576ZM1321 349L1304 338L1319 316ZM677 610L680 635L655 600ZM317 799L279 783L304 777ZM601 848L593 856L604 833ZM1028 213L1023 243L1007 245ZM1037 203L1016 202L1028 180ZM1117 196L1121 204L1116 203ZM1164 220L1132 224L1149 206ZM430 763L423 758L443 754ZM1029 210L1028 213L1016 202ZM1369 296L1355 296L1369 272ZM1128 195L1117 196L1123 192ZM1130 223L1132 224L1129 223ZM1036 280L1028 273L1047 265ZM1179 327L1178 318L1193 328Z'/><path fill='#908060' stroke='#908060' stroke-width='.6' d='M569 54L551 41L578 36ZM355 23L348 26L351 8ZM560 483L574 474L577 487ZM545 680L559 694L549 707ZM1043 649L1046 656L1037 656ZM1030 652L1036 640L1039 647Z'/><path fill='#583020' stroke='#583020' stroke-width='.6' d='M1296 560L1300 579L1287 575ZM299 517L320 535L297 528ZM1210 450L1215 454L1220 469ZM1274 575L1272 565L1279 568Z'/><path fill='#b89050' stroke='#b89050' stroke-width='.6' d='M1296 560L1287 556L1287 540ZM651 686L604 704L632 638ZM339 302L334 302L330 291ZM334 302L324 289L330 291ZM324 289L313 287L319 262ZM306 273L304 268L319 262ZM653 653L651 686L632 638ZM1262 447L1266 451L1256 464ZM1242 351L1273 340L1270 354ZM1180 329L1179 336L1168 331Z'/><path fill='#805830' stroke='#805830' stroke-width='.6' d='M1285 571L1287 556L1296 560ZM691 798L682 792L701 794ZM1315 418L1307 402L1322 405ZM1056 350L1041 359L1056 347ZM1328 592L1336 600L1328 607ZM1228 400L1213 383L1233 398Z'/><path fill='#a86010' stroke='#a86010' stroke-width='.6' d='M1181 464L1171 493L1168 477Z'/><path fill='#b8b098' stroke='#b8b098' stroke-width='.6' d='M1235 164L1242 194L1228 192ZM1373 665L1386 663L1362 699ZM1286 105L1244 126L1269 83ZM85 723L78 760L28 730ZM1500 858L1526 850L1526 875ZM1313 703L1332 676L1362 699ZM136 757L85 723L133 709ZM225 976L212 955L224 948ZM1009 638L1020 642L1022 654ZM1024 651L1030 652L1022 654ZM1379 294L1390 290L1381 299ZM1379 294L1381 273L1390 290ZM242 684L231 696L206 681ZM1430 425L1454 433L1441 437Z'/><path fill='#a08058' stroke='#a08058' stroke-width='.6' d='M986 183L945 225L950 168ZM1253 877L1256 874L1248 889ZM1282 657L1279 659L1283 641ZM593 856L582 865L563 861ZM1220 584L1206 598L1210 585ZM631 444L643 436L642 442Z'/><path fill='#101010' stroke='#101010' stroke-width='.6' d='M838 319L798 345L799 313ZM510 711L500 716L491 684ZM582 264L587 253L587 260Z'/><path fill='#181000' stroke='#181000' stroke-width='.6' d='M838 319L853 338L798 345Z'/><path fill='#b08038' stroke='#b08038' stroke-width='.6' d='M807 228L827 284L785 265ZM1328 539L1319 550L1309 547ZM515 306L453 319L495 251Z'/><path fill='#b09070' stroke='#b09070' stroke-width='.6' d='M839 200L848 180L852 181ZM1305 265L1307 284L1289 271ZM1307 284L1288 288L1289 271ZM1102 291L1106 291L1102 300Z'/><path fill='#907038' stroke='#907038' stroke-width='.6' d='M844 265L889 249L884 274ZM1366 555L1367 529L1389 552ZM738 315L728 358L705 311ZM594 498L634 479L637 530ZM1358 620L1375 603L1373 622Z'/><path fill='#585048' stroke='#585048' stroke-width='.6' d='M748 139L733 163L718 167ZM745 170L733 163L748 139ZM701 172L686 134L718 167ZM553 331L523 317L558 302ZM177 796L180 792L185 799Z'/><path fill='#706060' stroke='#706060' stroke-width='.6' d='M733 163L745 170L718 167ZM273 781L272 768L279 783Z'/><path fill='#705828' stroke='#705828' stroke-width='.6' d='M608 56L647 74L626 90ZM1008 250L1011 246L1011 256Z'/><path fill='#b0a898' stroke='#b0a898' stroke-width='.6' d='M647 38L647 74L608 56ZM250 785L229 781L232 734ZM874 658L875 644L917 636ZM1026 460L1009 422L1035 454ZM1001 633L1009 638L998 640ZM1455 478L1449 466L1463 468ZM547 36L550 37L551 41ZM178 790L136 757L178 733ZM359 586L319 580L330 564ZM977 134L1014 129L1005 144ZM559 694L545 680L566 653ZM360 520L395 520L377 551ZM1075 624L1065 617L1072 610ZM1426 421L1421 414L1443 401Z'/><path fill='#706860' stroke='#706860' stroke-width='.6' d='M706 191L701 172L718 167ZM640 292L627 302L621 292Z'/><path fill='#302828' stroke='#302828' stroke-width='.6' d='M701 172L652 154L686 134ZM741 223L737 237L706 221Z'/><path fill='#484038' stroke='#484038' stroke-width='.6' d='M652 154L701 172L688 201ZM131 831L123 813L133 825ZM272 768L280 763L279 783ZM277 757L280 763L271 765Z'/><path fill='#605048' stroke='#605048' stroke-width='.6' d='M701 172L706 191L688 201ZM635 205L688 201L658 227ZM306 633L313 628L308 643ZM559 346L567 372L547 358Z'/><path fill='#281818' stroke='#281818' stroke-width='.6' d='M741 223L756 224L752 233Z'/><path fill='#685850' stroke='#685850' stroke-width='.6' d='M706 191L741 223L706 221ZM978 156L977 134L1005 144ZM335 535L359 514L348 530ZM280 763L277 757L292 758ZM1421 414L1426 421L1423 419Z'/><path fill='#887048' stroke='#887048' stroke-width='.6' d='M734 244L726 268L706 221ZM834 642L851 607L856 649ZM449 806L431 774L469 753ZM1076 270L1083 261L1084 262ZM1383 308L1379 318L1371 306ZM637 448L631 444L642 442Z'/><path fill='#a88860' stroke='#a88860' stroke-width='.6' d='M706 221L726 268L685 270ZM583 519L577 544L565 541ZM1288 288L1266 292L1289 271ZM1197 614L1204 611L1203 627ZM1254 260L1266 292L1236 267ZM643 436L631 444L621 441ZM517 384L527 416L504 396Z'/><path fill='#b89860' stroke='#b89860' stroke-width='.6' d='M726 268L736 265L721 273ZM1328 607L1320 619L1316 616ZM392 644L344 663L366 637ZM1203 638L1209 635L1209 639ZM1257 377L1242 351L1270 354ZM419 842L412 876L399 876ZM1339 598L1341 584L1352 590ZM1018 384L1012 396L1004 390Z'/><path fill='#888878' stroke='#888878' stroke-width='.6' d='M589 332L602 321L629 332Z'/><path fill='#986028' stroke='#986028' stroke-width='.6' d='M562 154L544 147L556 136ZM855 533L826 506L876 509ZM943 269L949 253L972 251ZM239 239L257 223L249 248ZM468 516L487 505L493 539ZM922 535L926 564L881 553ZM350 745L321 745L326 732Z'/><path fill='#505048' stroke='#505048' stroke-width='.6' d='M636 352L596 363L629 332ZM619 297L602 321L582 284Z'/><path fill='#987850' stroke='#987850' stroke-width='.6' d='M423 310L405 349L402 330ZM1385 223L1358 241L1385 204ZM1056 347L1030 350L1027 336ZM1056 347L1059 321L1065 336ZM1304 577L1296 560L1307 574ZM543 458L520 483L487 466ZM1375 586L1382 569L1390 589ZM1033 308L1033 307L1049 302ZM1380 127L1373 142L1379 126Z'/><path fill='#685030' stroke='#685030' stroke-width='.6' d='M422 423L417 403L448 406ZM1075 243L1064 228L1079 226ZM1075 243L1083 261L1071 253ZM306 633L308 643L278 657ZM547 358L522 383L520 360ZM190 954L202 943L212 955Z'/><path fill='#b88038' stroke='#b88038' stroke-width='.6' d='M853 338L890 314L888 350ZM215 417L217 408L252 431ZM471 711L443 754L420 735ZM418 873L419 842L432 866Z'/><path fill='#c08840' stroke='#c08840' stroke-width='.6' d='M890 314L914 319L888 350ZM22 527L0 550L0 500ZM1269 447L1271 435L1276 433Z'/><path fill='#d8c098' stroke='#d8c098' stroke-width='.6' d='M632 638L585 691L586 642Z'/><path fill='#c8b890' stroke='#c8b890' stroke-width='.6' d='M580 595L577 544L598 557ZM559 694L566 653L585 691ZM1318 152L1298 138L1322 137Z'/><path fill='#806838' stroke='#806838' stroke-width='.6' d='M580 595L595 610L575 624ZM1199 661L1193 659L1203 659ZM1371 305L1383 308L1371 306ZM532 505L530 499L548 513Z'/><path fill='#a09888' stroke='#a09888' stroke-width='.6' d='M569 416L573 406L588 396ZM147 39L126 65L113 37ZM1133 649L1147 638L1156 657ZM1034 597L1030 600L1029 593Z'/><path fill='#705840' stroke='#705840' stroke-width='.6' d='M551 412L569 416L549 424ZM1047 265L1051 239L1071 253ZM763 714L751 686L778 698ZM223 32L231 25L231 53ZM585 496L594 498L589 518ZM1295 679L1315 676L1315 680ZM430 763L443 754L431 774ZM1043 649L1055 651L1046 656ZM1153 186L1160 185L1149 206ZM523 317L515 306L558 302ZM315 730L313 713L318 716Z'/><path fill='#d0b890' stroke='#d0b890' stroke-width='.6' d='M504 396L468 453L448 406ZM449 353L502 377L448 406ZM1102 300L1113 295L1121 323Z'/><path fill='#d0a878' stroke='#d0a878' stroke-width='.6' d='M527 416L468 453L504 396ZM248 392L217 408L218 367Z'/><path fill='#988048' stroke='#988048' stroke-width='.6' d='M577 544L547 547L565 541Z'/><path fill='#806830' stroke='#806830' stroke-width='.6' d='M674 544L648 541L660 535Z'/><path fill='#483818' stroke='#483818' stroke-width='.6' d='M668 532L674 544L660 535ZM655 600L642 591L649 565Z'/><path fill='#282010' stroke='#282010' stroke-width='.6' d='M689 418L694 426L685 423ZM661 354L647 333L664 333Z'/><path fill='#784000' stroke='#784000' stroke-width='.6' d='M208 834L267 844L250 878ZM309 418L314 366L326 413Z'/><path fill='#683800' stroke='#683800' stroke-width='.6' d='M267 844L208 834L245 814ZM260 799L267 844L245 814ZM1327 551L1339 555L1334 560Z'/><path fill='#a08878' stroke='#a08878' stroke-width='.6' d='M68 877L70 891L58 888ZM1456 590L1445 594L1449 574Z'/><path fill='#888078' stroke='#888078' stroke-width='.6' d='M65 852L68 877L58 888ZM177 796L170 798L173 793ZM1075 624L1093 631L1088 647Z'/><path fill='#d0a058' stroke='#d0a058' stroke-width='.6' d='M344 663L404 655L408 694ZM1168 399L1163 390L1172 387ZM1152 388L1167 372L1163 390Z'/><path fill='#180800' stroke='#180800' stroke-width='.6' d='M496 596L488 587L513 556ZM782 347L781 346L798 345ZM784 356L782 347L798 345Z'/><path fill='#905010' stroke='#905010' stroke-width='.6' d='M549 807L563 861L538 839ZM4 577L5 589L0 600ZM128 548L176 518L182 537ZM466 620L496 596L480 651ZM350 745L361 805L320 770ZM202 549L181 588L182 537ZM98 647L88 701L79 696ZM1209 241L1208 258L1181 229ZM466 632L463 631L466 620Z'/><path fill='#d89840' stroke='#d89840' stroke-width='.6' d='M408 694L401 731L388 734ZM413 728L401 731L408 694Z'/><path fill='#c08030' stroke='#c08030' stroke-width='.6' d='M420 735L401 731L413 728Z'/><path fill='#d09840' stroke='#d09840' stroke-width='.6' d='M455 686L413 728L408 694Z'/><path fill='#d09038' stroke='#d09038' stroke-width='.6' d='M455 686L420 735L413 728Z'/><path fill='#804000' stroke='#804000' stroke-width='.6' d='M267 844L327 823L298 895Z'/><path fill='#c8b8b0' stroke='#c8b8b0' stroke-width='.6' d='M477 971L462 932L511 935Z'/><path fill='#988058' stroke='#988058' stroke-width='.6' d='M454 911L425 912L421 903ZM680 328L681 304L705 311ZM527 416L543 444L487 466ZM644 598L642 591L655 600ZM1395 656L1386 663L1389 656ZM1395 656L1395 655L1405 667ZM358 599L355 602L359 586ZM1383 308L1371 305L1381 299ZM1401 165L1397 174L1398 160Z'/><path fill='#a08870' stroke='#a08870' stroke-width='.6' d='M485 895L500 904L481 899ZM1513 545L1511 555L1509 542ZM1455 478L1459 482L1457 492ZM1318 152L1322 137L1359 143ZM1085 270L1102 290L1083 303Z'/><path fill='#886848' stroke='#886848' stroke-width='.6' d='M723 730L751 743L738 764ZM260 799L271 785L277 784ZM1049 302L1059 321L1035 314ZM1085 270L1076 270L1084 262ZM1306 576L1304 577L1307 574ZM405 821L370 872L350 835ZM1398 160L1382 154L1398 155ZM1398 160L1397 174L1383 165Z'/><path fill='#806048' stroke='#806048' stroke-width='.6' d='M751 743L723 730L750 737ZM480 900L462 899L481 899ZM1286 575L1280 572L1285 572Z'/><path fill='#403018' stroke='#403018' stroke-width='.6' d='M1193 659L1195 671L1192 673ZM550 413L551 412L549 424ZM1051 628L1055 651L1043 641ZM481 693L476 696L458 680Z'/><path fill='#404048' stroke='#404048' stroke-width='.6' d='M1174 967L1171 973L1173 967Z'/><path fill='#181828' stroke='#181828' stroke-width='.6' d='M1171 973L1178 975L1174 977Z'/><path fill='#303038' stroke='#303038' stroke-width='.6' d='M1171 973L1174 967L1178 975ZM1165 957L1171 973L1144 974Z'/><path fill='#585858' stroke='#585858' stroke-width='.6' d='M1173 967L1171 973L1165 957ZM520 699L512 722L510 711Z'/><path fill='#d0d8d0' stroke='#d0d8d0' stroke-width='.6' d='M1084 432L1087 422L1094 421Z'/><path fill='#d8e0e0' stroke='#d8e0e0' stroke-width='.6' d='M1087 422L1084 432L1071 428ZM1046 443L1037 466L1035 454ZM1160 597L1168 599L1175 607Z'/><path fill='#d8d8d0' stroke='#d8d8d0' stroke-width='.6' d='M1089 383L1087 422L1069 388Z'/><path fill='#e0e0e8' stroke='#e0e0e8' stroke-width='.6' d='M1046 443L1050 427L1071 428ZM1050 427L1051 420L1071 428Z'/><path fill='#c8d0d8' stroke='#c8d0d8' stroke-width='.6' d='M1069 479L1046 443L1078 468Z'/><path fill='#d0e0e0' stroke='#d0e0e0' stroke-width='.6' d='M1046 443L1069 479L1037 466Z'/><path fill='#502010' stroke='#502010' stroke-width='.6' d='M1208 543L1208 532L1219 542Z'/><path fill='#301000' stroke='#301000' stroke-width='.6' d='M1219 542L1208 532L1247 504ZM1219 542L1255 509L1262 534Z'/><path fill='#c8c0d0' stroke='#c8c0d0' stroke-width='.6' d='M1087 609L1122 594L1121 605ZM1122 594L1087 609L1093 566Z'/><path fill='#9890a0' stroke='#9890a0' stroke-width='.6' d='M1134 602L1122 594L1125 591Z'/><path fill='#807080' stroke='#807080' stroke-width='.6' d='M1126 577L1139 590L1125 591Z'/><path fill='#888088' stroke='#888088' stroke-width='.6' d='M1139 590L1134 602L1125 591Z'/><path fill='#c0b8c8' stroke='#c0b8c8' stroke-width='.6' d='M1122 576L1122 594L1093 566Z'/><path fill='#988898' stroke='#988898' stroke-width='.6' d='M1122 576L1126 577L1125 591ZM1122 559L1122 560L1092 543ZM1168 571L1176 573L1164 578Z'/><path fill='#383020' stroke='#383020' stroke-width='.6' d='M979 552L1000 541L1004 562ZM737 237L734 244L706 221ZM645 332L647 333L636 352ZM104 826L103 854L91 835Z'/><path fill='#807060' stroke='#807060' stroke-width='.6' d='M1011 577L1021 587L1010 603ZM271 785L273 781L277 784ZM1030 600L1033 606L1025 612ZM1025 631L1016 636L1012 629ZM1023 637L1016 636L1025 631ZM1430 425L1435 436L1432 436Z'/><path fill='#907050' stroke='#907050' stroke-width='.6' d='M1237 891L1253 877L1248 889ZM1568 591L1568 602L1561 591ZM252 660L261 665L250 664ZM443 754L471 711L469 753ZM1306 577L1306 576L1307 574ZM1312 582L1306 577L1307 574ZM68 877L103 854L86 900ZM415 528L408 479L440 520ZM1373 142L1361 139L1379 126ZM1300 589L1303 589L1308 595ZM1303 589L1300 589L1299 587ZM1029 358L1030 350L1033 359Z'/><path fill='#d8e0e8' stroke='#d8e0e8' stroke-width='.6' d='M1065 511L1035 514L1033 475Z'/><path fill='#905008' stroke='#905008' stroke-width='.6' d='M1156 467L1181 464L1163 474ZM222 585L215 555L233 588ZM200 650L222 585L233 588Z'/><path fill='#806858' stroke='#806858' stroke-width='.6' d='M1143 677L1155 685L1143 687ZM181 969L176 961L190 962ZM322 613L312 626L303 590ZM1183 657L1171 663L1177 655Z'/><path fill='#583830' stroke='#583830' stroke-width='.6' d='M1155 685L1143 677L1161 677ZM1233 452L1228 439L1235 441ZM1238 412L1233 398L1239 395Z'/><path fill='#502800' stroke='#502800' stroke-width='.6' d='M1270 620L1267 604L1283 600ZM930 359L933 371L919 370ZM190 954L176 961L176 931Z'/><path fill='#704020' stroke='#704020' stroke-width='.6' d='M1287 626L1315 633L1283 641ZM1443 571L1442 573L1439 570Z'/><path fill='#705038' stroke='#705038' stroke-width='.6' d='M1273 633L1287 626L1283 641ZM462 899L485 895L481 899ZM1300 579L1287 578L1287 575ZM935 124L934 129L906 128ZM1299 587L1297 583L1300 579ZM1128 195L1140 178L1132 196ZM1303 589L1299 587L1300 579Z'/><path fill='#402000' stroke='#402000' stroke-width='.6' d='M1247 590L1254 583L1254 603ZM1255 509L1219 542L1247 504ZM314 366L309 418L279 398ZM1320 657L1323 651L1341 669Z'/><path fill='#605040' stroke='#605040' stroke-width='.6' d='M1364 437L1339 435L1352 419ZM1246 677L1247 686L1241 680ZM1028 615L1033 606L1035 618ZM843 125L855 110L864 132ZM394 203L378 188L391 187ZM1315 676L1329 675L1315 680ZM103 854L78 854L85 850ZM1055 651L1051 628L1075 624ZM767 109L768 110L757 107ZM653 291L640 292L660 263ZM522 383L542 402L527 416ZM1383 415L1385 408L1385 417ZM438 802L437 804L434 805ZM341 613L334 622L340 613ZM1423 427L1430 425L1432 436ZM1420 409L1419 412L1418 411ZM1423 419L1426 421L1423 427Z'/><path fill='#584030' stroke='#584030' stroke-width='.6' d='M1339 435L1338 433L1352 419ZM1288 673L1295 679L1282 687ZM359 514L379 483L384 493ZM523 317L553 331L520 360ZM407 791L405 821L395 788ZM1039 639L1043 641L1039 647Z'/><path fill='#885830' stroke='#885830' stroke-width='.6' d='M1478 548L1495 561L1468 566ZM1344 280L1355 296L1337 283ZM1344 280L1351 270L1355 296Z'/><path fill='#684008' stroke='#684008' stroke-width='.6' d='M1478 539L1478 548L1469 540ZM1361 633L1357 632L1358 620Z'/><path fill='#603000' stroke='#603000' stroke-width='.6' d='M1478 548L1458 545L1469 540ZM498 799L549 807L509 833ZM666 664L680 635L707 679ZM456 849L431 837L449 806ZM202 549L196 541L215 555Z'/><path fill='#a08068' stroke='#a08068' stroke-width='.6' d='M1478 539L1480 517L1488 519ZM117 700L136 696L133 709ZM1204 611L1192 611L1206 598ZM1398 160L1383 165L1382 154ZM1347 123L1361 139L1359 143Z'/><path fill='#787060' stroke='#787060' stroke-width='.6' d='M1448 462L1449 466L1441 459ZM573 406L568 408L573 403ZM1079 173L1088 170L1092 176ZM334 622L324 618L340 613Z'/><path fill='#a07868' stroke='#a07868' stroke-width='.6' d='M1561 607L1568 602L1564 617ZM1221 432L1226 418L1225 437Z'/><path fill='#906850' stroke='#906850' stroke-width='.6' d='M1568 602L1561 607L1561 591ZM1226 417L1225 417L1227 414ZM1275 577L1274 575L1280 572ZM1226 418L1226 417L1227 414Z'/><path fill='#b09880' stroke='#b09880' stroke-width='.6' d='M1568 591L1563 590L1562 575ZM729 794L734 765L738 764ZM1074 669L1078 669L1073 701ZM1298 138L1318 152L1310 159ZM1253 180L1269 183L1268 188ZM1037 406L1043 396L1044 406Z'/><path fill='#b89868' stroke='#b89868' stroke-width='.6' d='M1455 662L1455 660L1485 649ZM1090 323L1110 329L1102 335ZM344 663L362 637L366 637ZM1126 378L1127 379L1122 380ZM1260 419L1258 425L1259 418Z'/><path fill='#987048' stroke='#987048' stroke-width='.6' d='M1462 636L1445 649L1446 639ZM1230 665L1258 653L1259 655ZM1017 266L1017 280L1005 263ZM1124 368L1126 378L1122 372Z'/><path fill='#a88040' stroke='#a88040' stroke-width='.6' d='M1445 649L1455 662L1428 664ZM334 302L339 302L348 332ZM913 288L890 314L884 274ZM82 924L69 938L69 906ZM1209 639L1217 649L1203 659ZM1257 377L1270 354L1271 379ZM1140 288L1132 285L1132 237ZM1229 461L1237 455L1239 474ZM1340 564L1329 572L1334 560ZM1273 340L1242 351L1268 324ZM1132 285L1116 286L1118 264ZM1180 329L1185 331L1179 336ZM1179 327L1185 331L1180 329Z'/><path fill='#a89880' stroke='#a89880' stroke-width='.6' d='M1386 663L1373 665L1372 659ZM653 291L681 304L664 333ZM335 535L355 568L330 564ZM1073 701L1078 669L1107 676ZM1017 143L1016 134L1065 156ZM373 874L370 872L399 876ZM1020 642L1036 640L1024 651ZM1036 640L1030 652L1024 651ZM1412 365L1405 365L1403 354ZM355 602L340 613L319 580Z'/><path fill='#987068' stroke='#987068' stroke-width='.6' d='M1431 640L1425 618L1446 639Z'/><path fill='#a87840' stroke='#a87840' stroke-width='.6' d='M1316 616L1320 619L1314 618ZM292 251L292 263L286 262ZM1144 448L1126 454L1118 445ZM215 417L252 431L227 438ZM304 268L306 273L305 273ZM1156 310L1168 331L1139 328ZM1272 592L1287 578L1282 597ZM302 271L304 268L305 273ZM488 474L462 506L443 485ZM1108 337L1108 339L1102 335ZM1290 420L1315 418L1308 443ZM1168 399L1180 398L1182 411Z'/><path fill='#a09090' stroke='#a09090' stroke-width='.6' d='M1445 594L1455 611L1448 610Z'/><path fill='#a89890' stroke='#a89890' stroke-width='.6' d='M1445 594L1456 590L1455 611ZM292 758L277 757L275 747Z'/><path fill='#e0d0b8' stroke='#e0d0b8' stroke-width='.6' d='M1469 168L1467 161L1498 177ZM1478 203L1469 168L1498 177Z'/><path fill='#907048' stroke='#907048' stroke-width='.6' d='M1322 405L1344 387L1352 419ZM330 15L348 26L324 38ZM379 212L387 211L369 227ZM1382 569L1401 579L1390 589ZM1282 657L1288 661L1279 659ZM1288 673L1288 661L1309 665ZM1384 601L1375 586L1390 589ZM1041 359L1056 350L1059 364ZM476 696L474 701L455 686ZM412 876L418 873L412 890ZM1379 141L1398 139L1382 154ZM1027 363L1029 358L1033 359ZM1018 384L1043 396L1037 406ZM1380 127L1379 141L1373 142ZM1373 264L1373 265L1369 272Z'/><path fill='#a07858' stroke='#a07858' stroke-width='.6' d='M1394 202L1385 223L1385 204ZM315 730L316 745L303 727ZM1106 291L1102 291L1102 290ZM1240 418L1257 427L1235 441Z'/><path fill='#908870' stroke='#908870' stroke-width='.6' d='M581 38L569 54L578 36ZM743 97L719 89L746 93ZM449 806L432 795L431 774Z'/><path fill='#785840' stroke='#785840' stroke-width='.6' d='M921 145L941 158L898 158ZM1028 160L1029 161L1028 180ZM1304 577L1306 576L1306 577ZM1286 575L1285 572L1287 575ZM322 613L303 590L314 588ZM1140 178L1142 192L1132 196ZM517 384L522 383L527 416Z'/><path fill='#985818' stroke='#985818' stroke-width='.6' d='M4 577L0 600L1 569ZM93 500L78 501L87 477ZM1135 486L1151 466L1163 474Z'/><path fill='#b07838' stroke='#b07838' stroke-width='.6' d='M16 665L73 651L22 686ZM982 316L981 336L955 312ZM32 535L33 531L44 540ZM38 562L32 535L44 540Z'/><path fill='#301008' stroke='#301008' stroke-width='.6' d='M0 300L25 292L24 299ZM215 248L214 229L221 231ZM368 152L384 171L347 172ZM1254 583L1251 581L1254 572ZM1220 584L1211 575L1228 559Z'/><path fill='#884810' stroke='#884810' stroke-width='.6' d='M25 292L27 262L56 270ZM396 735L372 747L388 734ZM721 660L745 664L731 670Z'/><path fill='#481800' stroke='#481800' stroke-width='.6' d='M132 370L157 372L117 417Z'/><path fill='#602800' stroke='#602800' stroke-width='.6' d='M158 357L157 372L132 370ZM58 286L102 276L79 315ZM210 903L199 887L250 878Z'/><path fill='#984808' stroke='#984808' stroke-width='.6' d='M166 367L157 372L158 357Z'/><path fill='#682808' stroke='#682808' stroke-width='.6' d='M157 372L151 431L117 417Z'/><path fill='#985000' stroke='#985000' stroke-width='.6' d='M151 431L157 372L175 398Z'/><path fill='#d8b080' stroke='#d8b080' stroke-width='.6' d='M222 350L200 356L202 328ZM1169 363L1158 366L1175 349Z'/><path fill='#c8a890' stroke='#c8a890' stroke-width='.6' d='M260 347L222 350L223 308Z'/><path fill='#d09848' stroke='#d09848' stroke-width='.6' d='M218 367L217 408L204 402Z'/><path fill='#381800' stroke='#381800' stroke-width='.6' d='M460 41L469 77L451 67ZM1208 532L1220 494L1247 504ZM456 849L449 806L471 818ZM1251 581L1254 583L1247 590Z'/><path fill='#887860' stroke='#887860' stroke-width='.6' d='M231 53L231 25L257 16ZM547 36L531 40L539 32ZM547 36L551 41L531 40ZM577 487L574 474L590 466ZM1017 143L1065 156L1028 160ZM160 62L151 35L192 42ZM1004 631L1001 633L993 625ZM660 263L640 292L628 256Z'/><path fill='#b8c0b8' stroke='#b8c0b8' stroke-width='.6' d='M231 25L226 23L250 0Z'/><path fill='#704838' stroke='#704838' stroke-width='.6' d='M1285 572L1285 571L1287 575ZM1210 450L1213 452L1215 454ZM1297 583L1287 578L1300 579ZM1226 418L1240 418L1225 437ZM1213 452L1217 449L1215 454Z'/><path fill='#986830' stroke='#986830' stroke-width='.6' d='M1330 523L1346 513L1343 526ZM863 310L838 319L848 298ZM1127 456L1151 466L1131 473ZM1231 638L1258 653L1230 665ZM1209 625L1227 592L1246 606ZM405 821L419 842L399 876ZM749 634L756 624L765 642ZM1168 399L1182 411L1164 403ZM995 359L1018 384L1004 390ZM1183 369L1175 371L1174 370ZM1213 383L1228 400L1224 400Z'/><path fill='#683000' stroke='#683000' stroke-width='.6' d='M1220 494L1235 492L1247 504ZM199 887L208 834L250 878ZM1329 548L1339 555L1327 551Z'/><path fill='#482018' stroke='#482018' stroke-width='.6' d='M1222 555L1208 543L1219 542Z'/><path fill='#906010' stroke='#906010' stroke-width='.6' d='M1255 509L1247 504L1261 490ZM1259 510L1255 509L1261 490Z'/><path fill='#b8a0a0' stroke='#b8a0a0' stroke-width='.6' d='M1266 219L1268 188L1286 212Z'/><path fill='#c0a8b0' stroke='#c0a8b0' stroke-width='.6' d='M1250 219L1268 188L1266 219Z'/><path fill='#a88078' stroke='#a88078' stroke-width='.6' d='M1268 188L1250 219L1242 194ZM1250 225L1264 242L1242 231Z'/><path fill='#b09888' stroke='#b09888' stroke-width='.6' d='M1242 194L1250 219L1228 192ZM1253 180L1268 188L1242 194ZM351 893L353 902L352 903Z'/><path fill='#885838' stroke='#885838' stroke-width='.6' d='M1224 269L1232 242L1236 267ZM1351 270L1350 267L1369 272Z'/><path fill='#805040' stroke='#805040' stroke-width='.6' d='M1232 242L1255 252L1236 267ZM1182 524L1188 515L1186 527ZM1213 447L1217 449L1213 452Z'/><path fill='#885848' stroke='#885848' stroke-width='.6' d='M1255 252L1232 242L1242 231Z'/><path fill='#b09080' stroke='#b09080' stroke-width='.6' d='M1305 265L1287 253L1311 263Z'/><path fill='#986818' stroke='#986818' stroke-width='.6' d='M1169 241L1180 273L1171 276ZM1180 273L1209 265L1184 277Z'/><path fill='#885020' stroke='#885020' stroke-width='.6' d='M1208 258L1232 242L1224 269ZM1151 466L1127 456L1144 448ZM1179 375L1175 371L1183 369Z'/><path fill='#a06830' stroke='#a06830' stroke-width='.6' d='M945 225L949 253L937 246Z'/><path fill='#a07838' stroke='#a07838' stroke-width='.6' d='M890 314L913 288L914 319ZM945 225L992 214L972 251ZM1209 639L1218 644L1217 649ZM1375 586L1352 590L1350 574ZM926 564L929 560L930 561ZM1329 572L1320 562L1334 560ZM1167 372L1179 375L1172 387Z'/><path fill='#504020' stroke='#504020' stroke-width='.6' d='M817 183L813 180L838 148ZM1199 661L1195 671L1193 659ZM1051 239L1075 243L1071 253Z'/><path fill='#403020' stroke='#403020' stroke-width='.6' d='M756 107L757 107L748 139ZM685 283L681 304L669 276ZM1240 681L1230 675L1241 680ZM1367 412L1364 437L1352 419ZM550 413L542 402L551 412ZM1034 636L1025 631L1025 628ZM757 107L768 110L748 139ZM1385 408L1367 412L1379 382ZM1160 661L1171 663L1161 677ZM1407 381L1411 397L1394 397ZM1418 411L1387 418L1394 397Z'/><path fill='#908068' stroke='#908068' stroke-width='.6' d='M672 84L652 68L682 66ZM618 577L611 601L603 589ZM568 408L573 406L569 416ZM1251 685L1251 681L1282 687ZM1023 637L1036 640L1020 642ZM1051 628L1065 617L1075 624ZM1142 192L1140 178L1153 186ZM413 438L422 462L394 450Z'/><path fill='#181010' stroke='#181010' stroke-width='.6' d='M737 237L741 223L752 233ZM513 680L520 699L491 684Z'/><path fill='#382818' stroke='#382818' stroke-width='.6' d='M681 304L701 282L705 311ZM365 474L379 483L359 514ZM476 696L481 693L481 696ZM1108 646L1105 657L1095 659ZM561 377L568 391L554 385Z'/><path fill='#a09068' stroke='#a09068' stroke-width='.6' d='M645 332L653 291L664 333Z'/><path fill='#605028' stroke='#605028' stroke-width='.6' d='M647 333L645 332L664 333Z'/><path fill='#706850' stroke='#706850' stroke-width='.6' d='M613 281L587 260L628 256Z'/><path fill='#605850' stroke='#605850' stroke-width='.6' d='M587 260L613 281L582 284ZM393 507L360 520L359 514Z'/><path fill='#282828' stroke='#282828' stroke-width='.6' d='M613 281L619 297L582 284ZM547 358L553 331L556 343Z'/><path fill='#403838' stroke='#403838' stroke-width='.6' d='M619 297L613 281L621 292ZM613 281L640 292L621 292ZM1150 560L1150 572L1147 562ZM574 399L568 391L577 391ZM568 391L574 399L571 400Z'/><path fill='#202018' stroke='#202018' stroke-width='.6' d='M608 229L635 205L658 227ZM666 374L661 354L692 352Z'/><path fill='#080008' stroke='#080008' stroke-width='.6' d='M753 315L746 308L790 280ZM432 620L418 659L406 638ZM439 669L432 620L449 667Z'/><path fill='#201010' stroke='#201010' stroke-width='.6' d='M378 188L384 171L391 187Z'/><path fill='#503020' stroke='#503020' stroke-width='.6' d='M384 171L418 162L391 187ZM1078 669L1095 659L1095 664ZM316 565L265 560L310 540ZM1315 590L1303 589L1311 583ZM1304 577L1303 589L1300 579ZM1311 583L1303 589L1304 577Z'/><path fill='#606060' stroke='#606060' stroke-width='.6' d='M556 330L558 302L589 332ZM510 711L512 722L500 716Z'/><path fill='#484850' stroke='#484850' stroke-width='.6' d='M602 321L558 302L582 284Z'/><path fill='#707070' stroke='#707070' stroke-width='.6' d='M558 302L602 321L589 332Z'/><path fill='#b88838' stroke='#b88838' stroke-width='.6' d='M405 349L449 353L417 403ZM1237 455L1250 472L1239 474Z'/><path fill='#383038' stroke='#383038' stroke-width='.6' d='M562 337L556 330L589 332Z'/><path fill='#686868' stroke='#686868' stroke-width='.6' d='M636 352L601 372L596 363Z'/><path fill='#807040' stroke='#807040' stroke-width='.6' d='M637 401L689 418L685 423Z'/><path fill='#b88840' stroke='#b88840' stroke-width='.6' d='M863 310L890 314L853 338ZM1156 418L1146 411L1152 403Z'/><path fill='#b89048' stroke='#b89048' stroke-width='.6' d='M890 314L863 310L884 274ZM1128 350L1125 340L1140 344ZM1293 456L1276 433L1306 447ZM1306 447L1276 433L1308 443Z'/><path fill='#986838' stroke='#986838' stroke-width='.6' d='M780 355L787 364L757 360ZM1132 285L1140 288L1131 288Z'/><path fill='#786848' stroke='#786848' stroke-width='.6' d='M551 412L568 408L569 416Z'/><path fill='#807870' stroke='#807870' stroke-width='.6' d='M578 398L573 406L573 403ZM275 747L277 757L271 765Z'/><path fill='#907848' stroke='#907848' stroke-width='.6' d='M546 535L547 547L523 529ZM481 696L471 711L474 701Z'/><path fill='#302020' stroke='#302020' stroke-width='.6' d='M493 539L514 535L513 556ZM81 837L91 835L91 847ZM123 813L131 831L104 826ZM1152 558L1166 563L1159 565ZM428 792L410 819L407 791ZM370 872L371 878L359 886ZM1387 418L1418 411L1423 427Z'/><path fill='#100000' stroke='#100000' stroke-width='.6' d='M729 467L718 456L737 443ZM364 605L386 596L376 631Z'/><path fill='#483838' stroke='#483838' stroke-width='.6' d='M123 813L139 820L133 825ZM177 796L185 799L174 801ZM324 618L334 622L332 633Z'/><path fill='#685048' stroke='#685048' stroke-width='.6' d='M140 804L123 813L124 805Z'/><path fill='#382828' stroke='#382828' stroke-width='.6' d='M139 820L123 813L140 804ZM332 633L329 639L316 625Z'/><path fill='#987028' stroke='#987028' stroke-width='.6' d='M69 938L82 924L98 937ZM1232 321L1233 319L1232 327ZM1347 562L1344 550L1366 555ZM1179 336L1185 331L1189 344Z'/><path fill='#402808' stroke='#402808' stroke-width='.6' d='M710 568L702 550L729 542ZM386 596L364 605L377 592ZM1205 405L1210 415L1186 408Z'/><path fill='#080800' stroke='#080800' stroke-width='.6' d='M449 667L480 651L482 654ZM608 229L587 253L586 239Z'/><path fill='#c89858' stroke='#c89858' stroke-width='.6' d='M394 646L404 655L344 663ZM1263 439L1271 435L1269 447Z'/><path fill='#282018' stroke='#282018' stroke-width='.6' d='M534 576L519 597L513 556Z'/><path fill='#988878' stroke='#988878' stroke-width='.6' d='M250 785L244 790L229 781ZM719 89L703 81L703 73ZM244 790L213 789L229 781ZM81 837L75 841L74 828ZM1016 636L1008 634L1012 629ZM160 62L147 39L151 35ZM1407 381L1405 365L1409 371Z'/><path fill='#b87020' stroke='#b87020' stroke-width='.6' d='M401 731L396 735L388 734Z'/><path fill='#905018' stroke='#905018' stroke-width='.6' d='M350 745L349 722L364 732ZM1151 466L1156 467L1163 474Z'/><path fill='#886040' stroke='#886040' stroke-width='.6' d='M261 665L252 660L278 657ZM1382 154L1398 139L1398 155ZM405 821L361 805L395 788ZM1325 590L1328 592L1328 607ZM1213 433L1217 447L1213 447Z'/><path fill='#502818' stroke='#502818' stroke-width='.6' d='M335 535L320 535L299 517ZM1221 463L1220 464L1215 454Z'/><path fill='#b07018' stroke='#b07018' stroke-width='.6' d='M456 849L448 871L432 866ZM431 837L456 849L432 866Z'/><path fill='#b07010' stroke='#b07010' stroke-width='.6' d='M448 871L456 849L478 865Z'/><path fill='#584830' stroke='#584830' stroke-width='.6' d='M780 662L765 642L784 656ZM515 306L547 271L558 302Z'/><path fill='#504830' stroke='#504830' stroke-width='.6' d='M765 642L789 653L784 656ZM1105 657L1108 646L1116 652Z'/><path fill='#905810' stroke='#905810' stroke-width='.6' d='M725 683L743 687L729 691ZM1164 421L1177 432L1167 433ZM1235 492L1250 472L1261 490ZM653 653L666 664L651 686ZM29 611L39 632L11 619ZM1152 403L1152 388L1158 399Z'/><path fill='#c0a078' stroke='#c0a078' stroke-width='.6' d='M1122 380L1105 378L1122 372ZM377 551L415 537L417 539ZM1012 396L1037 406L1009 422ZM343 636L362 637L344 663ZM1341 584L1339 598L1328 592ZM1264 414L1246 412L1239 395Z'/><path fill='#886038' stroke='#886038' stroke-width='.6' d='M1059 321L1068 315L1065 336ZM1279 659L1258 653L1283 641ZM1404 608L1388 608L1390 589ZM1304 338L1321 349L1296 349ZM1017 266L1028 273L1017 280Z'/><path fill='#d8b070' stroke='#d8b070' stroke-width='.6' d='M1128 335L1121 323L1133 325ZM1158 366L1152 388L1142 361Z'/><path fill='#d8b068' stroke='#d8b068' stroke-width='.6' d='M1128 335L1139 328L1140 344Z'/><path fill='#c8a058' stroke='#c8a058' stroke-width='.6' d='M1125 340L1128 335L1140 344Z'/><path fill='#d0b070' stroke='#d0b070' stroke-width='.6' d='M1128 335L1125 340L1118 325ZM1167 372L1152 388L1158 366Z'/><path fill='#c8b088' stroke='#c8b088' stroke-width='.6' d='M1127 427L1110 409L1139 418ZM1110 409L1123 395L1139 418ZM422 462L468 453L443 485Z'/><path fill='#b88858' stroke='#b88858' stroke-width='.6' d='M1127 427L1144 448L1118 445ZM1275 577L1287 578L1272 592Z'/><path fill='#683020' stroke='#683020' stroke-width='.6' d='M1205 538L1208 532L1208 543Z'/><path fill='#988868' stroke='#988868' stroke-width='.6' d='M1063 276L1076 270L1071 280Z'/><path fill='#805028' stroke='#805028' stroke-width='.6' d='M904 518L881 536L876 509ZM920 618L926 564L944 587ZM1328 607L1337 602L1334 610ZM1336 600L1337 602L1328 607Z'/><path fill='#c8b8b8' stroke='#c8b8b8' stroke-width='.6' d='M1009 422L1046 443L1035 454Z'/><path fill='#b8b0c0' stroke='#b8b0c0' stroke-width='.6' d='M1122 594L1123 603L1121 605ZM1098 522L1134 543L1092 543ZM1092 543L1122 560L1093 566Z'/><path fill='#d0d0c0' stroke='#d0d0c0' stroke-width='.6' d='M1499 406L1518 410L1506 444ZM1464 385L1468 414L1443 401Z'/><path fill='#d0d0b8' stroke='#d0d0b8' stroke-width='.6' d='M1468 414L1482 415L1463 437ZM1489 366L1492 350L1502 354Z'/><path fill='#b0b098' stroke='#b0b098' stroke-width='.6' d='M1550 443L1553 442L1556 445Z'/><path fill='#c8a070' stroke='#c8a070' stroke-width='.6' d='M1126 454L1122 457L1118 445ZM1165 508L1131 504L1158 495Z'/><path fill='#c09868' stroke='#c09868' stroke-width='.6' d='M1126 454L1127 456L1122 457ZM1209 635L1203 638L1203 627ZM315 730L321 745L316 745Z'/><path fill='#a06838' stroke='#a06838' stroke-width='.6' d='M1127 456L1126 454L1144 448ZM1209 241L1220 227L1232 242Z'/><path fill='#503830' stroke='#503830' stroke-width='.6' d='M1158 659L1160 661L1143 677Z'/><path fill='#381810' stroke='#381810' stroke-width='.6' d='M1228 559L1251 581L1233 588Z'/><path fill='#b09890' stroke='#b09890' stroke-width='.6' d='M1575 595L1568 591L1585 593Z'/><path fill='#603020' stroke='#603020' stroke-width='.6' d='M1425 618L1398 635L1399 617Z'/><path fill='#906058' stroke='#906058' stroke-width='.6' d='M1431 640L1398 635L1425 618ZM1261 248L1255 252L1242 231Z'/><path fill='#886840' stroke='#886840' stroke-width='.6' d='M1401 574L1382 569L1389 552ZM312 626L306 633L270 612ZM1395 655L1395 656L1389 656ZM1383 165L1397 174L1398 180Z'/><path fill='#908868' stroke='#908868' stroke-width='.6' d='M1251 685L1247 686L1251 681ZM633 320L645 332L629 332Z'/><path fill='#705850' stroke='#705850' stroke-width='.6' d='M1329 675L1332 676L1315 680ZM273 781L279 783L277 784ZM280 763L292 758L304 777Z'/><path fill='#886850' stroke='#886850' stroke-width='.6' d='M1445 594L1442 573L1449 574ZM190 954L212 955L190 962Z'/><path fill='#785040' stroke='#785040' stroke-width='.6' d='M1442 573L1445 594L1432 590ZM1260 260L1254 260L1255 252Z'/><path fill='#b8b090' stroke='#b8b090' stroke-width='.6' d='M1303 76L1300 100L1286 105ZM1298 138L1251 143L1283 123ZM1065 156L1017 117L1089 131ZM1390 290L1383 308L1381 299Z'/><path fill='#e0d8b8' stroke='#e0d8b8' stroke-width='.6' d='M1557 256L1551 252L1553 253Z'/><path fill='#806840' stroke='#806840' stroke-width='.6' d='M1398 335L1403 354L1370 330ZM1379 318L1398 335L1370 330ZM1049 302L1034 298L1043 287ZM1334 367L1337 369L1319 389ZM1117 196L1104 180L1109 176ZM637 401L666 374L689 418ZM560 483L523 483L543 458ZM408 479L379 483L394 450Z'/><path fill='#684838' stroke='#684838' stroke-width='.6' d='M921 145L934 129L941 158ZM1312 582L1315 590L1311 583Z'/><path fill='#605848' stroke='#605848' stroke-width='.6' d='M855 110L843 125L829 121ZM640 292L613 281L628 256ZM1421 414L1419 412L1420 409Z'/><path fill='#908078' stroke='#908078' stroke-width='.6' d='M1088 170L1079 173L1070 162ZM178 790L177 796L173 793Z'/><path fill='#a08070' stroke='#a08070' stroke-width='.6' d='M136 696L151 691L133 709ZM1305 265L1287 261L1287 253ZM1571 595L1575 595L1576 598ZM1575 595L1571 595L1568 591Z'/><path fill='#a87830' stroke='#a87830' stroke-width='.6' d='M139 562L128 548L182 537ZM1328 539L1330 523L1343 526ZM488 474L487 505L462 506ZM1152 388L1163 390L1158 399ZM1319 550L1315 554L1309 547ZM1276 433L1287 421L1308 443ZM32 535L38 562L0 550Z'/><path fill='#c08038' stroke='#c08038' stroke-width='.6' d='M160 582L139 562L182 537Z'/><path fill='#a88038' stroke='#a88038' stroke-width='.6' d='M128 548L139 562L112 567Z'/><path fill='#d8b890' stroke='#d8b890' stroke-width='.6' d='M220 360L218 367L200 356Z'/><path fill='#e0c8c0' stroke='#e0c8c0' stroke-width='.6' d='M220 360L222 350L260 347Z'/><path fill='#d0b088' stroke='#d0b088' stroke-width='.6' d='M248 392L220 360L260 347ZM1123 395L1134 393L1135 396ZM1139 418L1123 395L1135 396Z'/><path fill='#b87010' stroke='#b87010' stroke-width='.6' d='M204 402L215 417L197 407Z'/><path fill='#b87018' stroke='#b87018' stroke-width='.6' d='M217 408L215 417L204 402Z'/><path fill='#988880' stroke='#988880' stroke-width='.6' d='M223 32L214 33L226 23ZM313 628L312 626L316 625Z'/><path fill='#706858' stroke='#706858' stroke-width='.6' d='M223 32L216 35L214 33ZM767 109L757 107L763 102ZM768 110L767 109L763 102ZM567 372L559 346L596 363Z'/><path fill='#603018' stroke='#603018' stroke-width='.6' d='M1271 531L1264 523L1275 525Z'/><path fill='#684028' stroke='#684028' stroke-width='.6' d='M1285 571L1280 572L1279 568ZM982 316L1005 315L981 336ZM1272 565L1274 575L1271 577Z'/><path fill='#704830' stroke='#704830' stroke-width='.6' d='M1285 572L1280 572L1285 571ZM881 136L885 143L876 152Z'/><path fill='#402018' stroke='#402018' stroke-width='.6' d='M1195 525L1220 494L1208 532ZM1176 528L1182 524L1186 527Z'/><path fill='#785038' stroke='#785038' stroke-width='.6' d='M1173 538L1194 537L1173 551ZM1213 447L1213 452L1210 450Z'/><path fill='#482820' stroke='#482820' stroke-width='.6' d='M1194 537L1173 538L1186 527Z'/><path fill='#a06050' stroke='#a06050' stroke-width='.6' d='M1194 537L1195 525L1197 536Z'/><path fill='#906050' stroke='#906050' stroke-width='.6' d='M1195 525L1194 537L1186 527Z'/><path fill='#a09098' stroke='#a09098' stroke-width='.6' d='M1139 590L1143 579L1159 584ZM1169 522L1165 528L1163 523ZM1176 573L1184 572L1191 590Z'/><path fill='#502820' stroke='#502820' stroke-width='.6' d='M1184 572L1195 556L1209 569ZM1188 515L1173 517L1173 516Z'/><path fill='#b87050' stroke='#b87050' stroke-width='.6' d='M1194 537L1195 556L1173 551ZM1205 548L1195 556L1194 537Z'/><path fill='#583838' stroke='#583838' stroke-width='.6' d='M1207 584L1184 572L1209 569Z'/><path fill='#b89890' stroke='#b89890' stroke-width='.6' d='M1268 188L1269 183L1302 177Z'/><path fill='#b09098' stroke='#b09098' stroke-width='.6' d='M1264 242L1266 219L1275 249Z'/><path fill='#c0a090' stroke='#c0a090' stroke-width='.6' d='M1250 219L1220 227L1228 192Z'/><path fill='#b89080' stroke='#b89080' stroke-width='.6' d='M1220 227L1250 219L1242 231Z'/><path fill='#b08060' stroke='#b08060' stroke-width='.6' d='M1232 242L1220 227L1242 231Z'/><path fill='#987060' stroke='#987060' stroke-width='.6' d='M1287 261L1260 260L1275 249Z'/><path fill='#885808' stroke='#885808' stroke-width='.6' d='M1250 472L1235 492L1239 474Z'/><path fill='#302820' stroke='#302820' stroke-width='.6' d='M647 333L648 358L636 352ZM90 848L81 837L91 847ZM544 395L563 404L542 402ZM563 404L568 391L571 400Z'/><path fill='#202010' stroke='#202010' stroke-width='.6' d='M587 260L587 253L628 256Z'/><path fill='#a89878' stroke='#a89878' stroke-width='.6' d='M645 332L633 320L653 291ZM1037 656L1030 652L1039 647ZM1369 296L1379 294L1381 299ZM648 358L663 373L637 401Z'/><path fill='#481808' stroke='#481808' stroke-width='.6' d='M401 435L375 448L364 417Z'/><path fill='#a8a088' stroke='#a8a088' stroke-width='.6' d='M566 653L540 640L575 624Z'/><path fill='#c8b098' stroke='#c8b098' stroke-width='.6' d='M615 445L612 450L569 416Z'/><path fill='#483820' stroke='#483820' stroke-width='.6' d='M594 498L585 496L590 466ZM973 622L968 627L942 619ZM1407 381L1394 397L1384 377Z'/><path fill='#d8c088' stroke='#d8c088' stroke-width='.6' d='M502 377L504 396L448 406Z'/><path fill='#b07840' stroke='#b07840' stroke-width='.6' d='M487 505L468 516L462 506ZM1269 447L1272 457L1266 451Z'/><path fill='#a07840' stroke='#a07840' stroke-width='.6' d='M487 505L520 483L521 484ZM1307 284L1319 316L1301 301ZM412 890L418 873L421 903ZM1212 634L1218 644L1209 639ZM1375 586L1375 603L1352 590ZM1273 409L1257 377L1278 402ZM1177 324L1179 327L1177 326Z'/><path fill='#686058' stroke='#686058' stroke-width='.6' d='M170 798L177 796L174 801ZM571 400L574 399L573 403Z'/><path fill='#403030' stroke='#403030' stroke-width='.6' d='M78 854L75 841L85 850ZM280 763L272 768L271 765ZM1150 560L1152 558L1159 565Z'/><path fill='#786060' stroke='#786060' stroke-width='.6' d='M75 841L78 854L65 852Z'/><path fill='#584848' stroke='#584848' stroke-width='.6' d='M78 854L68 877L65 852Z'/><path fill='#a89088' stroke='#a89088' stroke-width='.6' d='M87 827L81 837L85 826Z'/><path fill='#787058' stroke='#787058' stroke-width='.6' d='M102 826L104 826L91 835Z'/><path fill='#b0a890' stroke='#b0a890' stroke-width='.6' d='M238 941L225 976L224 948ZM1405 365L1412 365L1409 371ZM1065 617L1034 597L1072 610Z'/><path fill='#906038' stroke='#906038' stroke-width='.6' d='M423 758L407 791L395 788Z'/><path fill='#c09048' stroke='#c09048' stroke-width='.6' d='M455 686L471 711L420 735ZM1279 452L1276 433L1293 456Z'/><path fill='#a07038' stroke='#a07038' stroke-width='.6' d='M317 799L304 777L320 770Z'/><path fill='#703000' stroke='#703000' stroke-width='.6' d='M317 799L327 823L267 844Z'/><path fill='#986820' stroke='#986820' stroke-width='.6' d='M421 609L463 595L441 617ZM336 713L343 709L349 722ZM1176 346L1179 336L1189 344Z'/><path fill='#504040' stroke='#504040' stroke-width='.6' d='M359 514L360 520L348 530ZM1165 528L1176 528L1173 538Z'/><path fill='#888060' stroke='#888060' stroke-width='.6' d='M319 580L316 565L330 564Z'/><path fill='#a87018' stroke='#a87018' stroke-width='.6' d='M419 842L431 837L432 866Z'/><path fill='#d0a070' stroke='#d0a070' stroke-width='.6' d='M1134 393L1135 389L1135 396Z'/><path fill='#e0c8a8' stroke='#e0c8a8' stroke-width='.6' d='M1102 300L1121 323L1118 325ZM1090 323L1102 300L1110 329Z'/><path fill='#e0d0b0' stroke='#e0d0b0' stroke-width='.6' d='M1110 329L1102 300L1118 325ZM340 707L329 699L345 696Z'/><path fill='#c8a888' stroke='#c8a888' stroke-width='.6' d='M1090 323L1083 315L1085 311ZM1325 590L1324 581L1328 592Z'/><path fill='#b08868' stroke='#b08868' stroke-width='.6' d='M1070 339L1056 347L1065 336ZM1106 291L1113 295L1102 300ZM1235 441L1257 427L1243 449Z'/><path fill='#b89878' stroke='#b89878' stroke-width='.6' d='M1070 339L1074 345L1056 347ZM1070 339L1083 315L1090 323ZM88 701L85 723L79 696ZM1123 395L1110 409L1105 378Z'/><path fill='#a88060' stroke='#a88060' stroke-width='.6' d='M1083 315L1070 339L1068 315ZM1337 283L1307 284L1311 263ZM1275 577L1286 575L1287 578ZM340 707L336 713L326 706Z'/><path fill='#b89068' stroke='#b89068' stroke-width='.6' d='M1126 378L1122 380L1122 372ZM1294 601L1300 589L1308 595ZM1299 587L1300 589L1294 601ZM1265 415L1260 419L1264 414Z'/><path fill='#986030' stroke='#986030' stroke-width='.6' d='M1108 339L1118 354L1093 362Z'/><path fill='#d0b078' stroke='#d0b078' stroke-width='.6' d='M1139 328L1168 331L1140 344ZM1263 439L1262 447L1243 449Z'/><path fill='#d8b888' stroke='#d8b888' stroke-width='.6' d='M1168 331L1175 349L1140 344ZM471 333L502 377L449 353ZM343 709L340 707L345 696Z'/><path fill='#906820' stroke='#906820' stroke-width='.6' d='M1175 301L1174 304L1174 300Z'/><path fill='#b0a8b0' stroke='#b0a8b0' stroke-width='.6' d='M1139 590L1160 597L1134 602ZM1160 597L1139 590L1159 584Z'/><path fill='#9898a0' stroke='#9898a0' stroke-width='.6' d='M1126 605L1136 612L1122 617ZM1126 605L1123 603L1134 602Z'/><path fill='#887068' stroke='#887068' stroke-width='.6' d='M1030 600L1018 602L1029 593Z'/><path fill='#603828' stroke='#603828' stroke-width='.6' d='M1229 461L1221 463L1215 454ZM1173 517L1188 515L1182 524Z'/><path fill='#a07040' stroke='#a07040' stroke-width='.6' d='M1243 595L1227 592L1233 588ZM1227 592L1243 595L1246 606ZM318 765L318 756L320 770Z'/><path fill='#b88860' stroke='#b88860' stroke-width='.6' d='M1287 578L1297 583L1282 597Z'/><path fill='#805030' stroke='#805030' stroke-width='.6' d='M1395 655L1398 635L1431 640Z'/><path fill='#d8d8c0' stroke='#d8d8c0' stroke-width='.6' d='M1419 117L1405 122L1378 72ZM1487 329L1480 330L1484 319ZM1480 330L1492 346L1468 358Z'/><path fill='#a88880' stroke='#a88880' stroke-width='.6' d='M1383 165L1398 180L1368 185ZM1361 139L1373 142L1364 150Z'/><path fill='#b8a8b8' stroke='#b8a8b8' stroke-width='.6' d='M1362 167L1383 165L1368 185ZM1143 555L1134 543L1150 545Z'/><path fill='#a88890' stroke='#a88890' stroke-width='.6' d='M1318 152L1308 187L1310 159ZM1361 139L1364 150L1362 149Z'/><path fill='#a88898' stroke='#a88898' stroke-width='.6' d='M1318 152L1362 167L1308 187Z'/><path fill='#b098a8' stroke='#b098a8' stroke-width='.6' d='M1362 149L1364 150L1362 167Z'/><path fill='#b8a090' stroke='#b8a090' stroke-width='.6' d='M1358 241L1350 267L1311 263ZM250 681L242 684L250 664Z'/><path fill='#b08870' stroke='#b08870' stroke-width='.6' d='M1350 267L1337 283L1311 263Z'/><path fill='#706040' stroke='#706040' stroke-width='.6' d='M743 97L729 104L719 89ZM1055 651L1061 655L1057 665Z'/><path fill='#805838' stroke='#805838' stroke-width='.6' d='M885 143L906 128L898 158ZM1224 400L1228 400L1227 414Z'/><path fill='#703800' stroke='#703800' stroke-width='.6' d='M205 552L202 549L215 555Z'/><path fill='#502000' stroke='#502000' stroke-width='.6' d='M176 518L196 541L182 537Z'/><path fill='#b08860' stroke='#b08860' stroke-width='.6' d='M1297 583L1299 587L1282 597ZM1237 455L1233 452L1243 449ZM1260 419L1265 415L1263 421Z'/><path fill='#b08050' stroke='#b08050' stroke-width='.6' d='M1299 587L1294 601L1282 597ZM1257 377L1264 414L1239 395Z'/><path fill='#a08880' stroke='#a08880' stroke-width='.6' d='M1164 518L1165 508L1173 516Z'/><path fill='#d8c0c0' stroke='#d8c0c0' stroke-width='.6' d='M1164 518L1163 523L1131 504Z'/><path fill='#d8b8a8' stroke='#d8b8a8' stroke-width='.6' d='M1165 508L1164 518L1131 504Z'/><path fill='#985840' stroke='#985840' stroke-width='.6' d='M1195 525L1200 532L1197 536Z'/><path fill='#784030' stroke='#784030' stroke-width='.6' d='M1200 532L1195 525L1208 532Z'/><path fill='#985038' stroke='#985038' stroke-width='.6' d='M1200 532L1205 538L1197 536Z'/><path fill='#783020' stroke='#783020' stroke-width='.6' d='M1205 538L1200 532L1208 532Z'/><path fill='#684030' stroke='#684030' stroke-width='.6' d='M1188 515L1173 516L1171 493ZM1238 412L1240 418L1227 414Z'/><path fill='#886050' stroke='#886050' stroke-width='.6' d='M1188 515L1195 525L1186 527ZM1170 540L1173 538L1173 551ZM1168 540L1170 540L1173 551Z'/><path fill='#381818' stroke='#381818' stroke-width='.6' d='M1172 523L1182 524L1176 528Z'/><path fill='#908890' stroke='#908890' stroke-width='.6' d='M1143 579L1150 572L1159 584Z'/><path fill='#585058' stroke='#585058' stroke-width='.6' d='M1139 577L1139 590L1126 577Z'/><path fill='#706070' stroke='#706070' stroke-width='.6' d='M1139 577L1143 579L1139 590Z'/><path fill='#484048' stroke='#484048' stroke-width='.6' d='M1150 572L1139 577L1147 562ZM559 346L562 337L589 332ZM567 372L596 363L584 387Z'/><path fill='#686060' stroke='#686060' stroke-width='.6' d='M1139 577L1150 572L1143 579Z'/><path fill='#a8a0a8' stroke='#a8a0a8' stroke-width='.6' d='M1134 543L1122 559L1092 543Z'/><path fill='#d8d0d0' stroke='#d8d0d0' stroke-width='.6' d='M1134 543L1098 522L1131 504Z'/><path fill='#c8b8c8' stroke='#c8b8c8' stroke-width='.6' d='M1134 543L1152 536L1150 545Z'/><path fill='#d8c8c8' stroke='#d8c8c8' stroke-width='.6' d='M1163 523L1152 536L1131 504Z'/><path fill='#d8c8d0' stroke='#d8c8d0' stroke-width='.6' d='M1152 536L1134 543L1131 504Z'/><path fill='#786870' stroke='#786870' stroke-width='.6' d='M1164 578L1150 572L1159 565ZM1165 528L1169 522L1172 523ZM1168 571L1164 578L1159 565ZM1143 555L1150 560L1147 562ZM1150 560L1143 555L1152 558Z'/><path fill='#b86850' stroke='#b86850' stroke-width='.6' d='M1205 548L1194 537L1197 536Z'/><path fill='#a07050' stroke='#a07050' stroke-width='.6' d='M1195 556L1205 548L1209 569ZM1225 417L1210 415L1227 414Z'/><path fill='#a85840' stroke='#a85840' stroke-width='.6' d='M1205 538L1205 548L1197 536Z'/><path fill='#884838' stroke='#884838' stroke-width='.6' d='M1205 548L1205 538L1208 543Z'/><path fill='#784838' stroke='#784838' stroke-width='.6' d='M1205 548L1222 555L1209 569Z'/><path fill='#704028' stroke='#704028' stroke-width='.6' d='M1222 555L1205 548L1208 543Z'/><path fill='#a86040' stroke='#a86040' stroke-width='.6' d='M1195 556L1182 562L1173 551Z'/><path fill='#703830' stroke='#703830' stroke-width='.6' d='M1182 562L1195 556L1184 572Z'/><path fill='#683840' stroke='#683840' stroke-width='.6' d='M1175 570L1182 562L1184 572Z'/><path fill='#805850' stroke='#805850' stroke-width='.6' d='M1260 260L1261 248L1275 249Z'/><path fill='#906868' stroke='#906868' stroke-width='.6' d='M1261 248L1264 242L1275 249Z'/><path fill='#704038' stroke='#704038' stroke-width='.6' d='M1261 248L1260 260L1255 252Z'/><path fill='#986860' stroke='#986860' stroke-width='.6' d='M1264 242L1261 248L1242 231Z'/><path fill='#d0b0b8' stroke='#d0b0b8' stroke-width='.6' d='M1250 225L1250 219L1266 219Z'/><path fill='#c8a0a8' stroke='#c8a0a8' stroke-width='.6' d='M1264 242L1250 225L1266 219Z'/><path fill='#b88888' stroke='#b88888' stroke-width='.6' d='M1250 219L1250 225L1242 231Z'/><path fill='#b0b0a8' stroke='#b0b0a8' stroke-width='.6' d='M1153 186L1144 173L1164 174Z'/><path fill='#906018' stroke='#906018' stroke-width='.6' d='M1256 464L1272 457L1261 490ZM1222 355L1211 340L1232 327ZM1203 360L1201 363L1195 366Z'/><path fill='#686858' stroke='#686858' stroke-width='.6' d='M627 302L619 297L621 292Z'/><path fill='#b07820' stroke='#b07820' stroke-width='.6' d='M550 213L513 205L561 159Z'/><path fill='#804820' stroke='#804820' stroke-width='.6' d='M1009 341L995 359L981 336ZM361 805L405 821L350 835Z'/><path fill='#905828' stroke='#905828' stroke-width='.6' d='M995 359L1004 390L988 365Z'/><path fill='#787068' stroke='#787068' stroke-width='.6' d='M574 399L578 398L573 403ZM180 792L178 790L193 793Z'/><path fill='#706868' stroke='#706868' stroke-width='.6' d='M578 398L574 399L577 391Z'/><path fill='#383030' stroke='#383030' stroke-width='.6' d='M559 346L547 358L556 343ZM1150 572L1150 560L1159 565ZM577 391L567 372L584 387Z'/><path fill='#302830' stroke='#302830' stroke-width='.6' d='M562 337L559 346L556 343Z'/><path fill='#787870' stroke='#787870' stroke-width='.6' d='M596 363L559 346L589 332Z'/><path fill='#201820' stroke='#201820' stroke-width='.6' d='M553 331L562 337L556 343Z'/><path fill='#282020' stroke='#282020' stroke-width='.6' d='M562 337L553 331L556 330Z'/><path fill='#606058' stroke='#606058' stroke-width='.6' d='M553 331L558 302L556 330Z'/><path fill='#c09050' stroke='#c09050' stroke-width='.6' d='M520 483L488 474L487 466ZM349 722L343 709L345 696ZM1175 371L1167 372L1174 370Z'/><path fill='#805008' stroke='#805008' stroke-width='.6' d='M745 664L721 660L727 644Z'/><path fill='#202020' stroke='#202020' stroke-width='.6' d='M520 699L510 711L491 684Z'/><path fill='#c89040' stroke='#c89040' stroke-width='.6' d='M404 655L414 663L408 694Z'/><path fill='#908880' stroke='#908880' stroke-width='.6' d='M272 768L250 785L271 765Z'/><path fill='#e8d8c0' stroke='#e8d8c0' stroke-width='.6' d='M329 699L344 663L345 696Z'/><path fill='#c8b8c0' stroke='#c8b8c0' stroke-width='.6' d='M1087 609L1075 624L1072 610ZM1165 528L1152 536L1163 523Z'/><path fill='#c8a880' stroke='#c8a880' stroke-width='.6' d='M1122 380L1123 395L1105 378ZM1246 412L1264 414L1259 418ZM1258 425L1246 412L1259 418Z'/><path fill='#d0a880' stroke='#d0a880' stroke-width='.6' d='M1134 393L1123 395L1135 389Z'/><path fill='#c8a078' stroke='#c8a078' stroke-width='.6' d='M1123 395L1127 379L1135 389ZM1127 379L1123 395L1122 380ZM1320 562L1324 581L1307 574Z'/><path fill='#d0a868' stroke='#d0a868' stroke-width='.6' d='M1146 411L1139 418L1135 396Z'/><path fill='#c89058' stroke='#c89058' stroke-width='.6' d='M1152 403L1146 411L1135 396Z'/><path fill='#b89078' stroke='#b89078' stroke-width='.6' d='M1074 345L1056 350L1056 347Z'/><path fill='#d0c0b8' stroke='#d0c0b8' stroke-width='.6' d='M1089 383L1076 362L1094 365Z'/><path fill='#c0a088' stroke='#c0a088' stroke-width='.6' d='M1056 350L1076 362L1059 364ZM316 745L318 756L292 758ZM1319 587L1324 581L1323 588Z'/><path fill='#d0b098' stroke='#d0b098' stroke-width='.6' d='M1076 362L1056 350L1074 345Z'/><path fill='#582810' stroke='#582810' stroke-width='.6' d='M1208 339L1193 328L1195 313Z'/><path fill='#c09040' stroke='#c09040' stroke-width='.6' d='M1135 326L1142 313L1139 328ZM1129 313L1134 316L1133 325Z'/><path fill='#b88830' stroke='#b88830' stroke-width='.6' d='M1135 326L1134 316L1142 313Z'/><path fill='#c89848' stroke='#c89848' stroke-width='.6' d='M1134 316L1135 326L1133 325Z'/><path fill='#d0a060' stroke='#d0a060' stroke-width='.6' d='M1121 323L1129 313L1133 325ZM1167 372L1169 363L1174 370Z'/><path fill='#c8c8b0' stroke='#c8c8b0' stroke-width='.6' d='M1556 364L1561 376L1550 376ZM1502 354L1492 350L1492 346Z'/><path fill='#c89850' stroke='#c89850' stroke-width='.6' d='M1250 472L1237 455L1256 464ZM1269 447L1276 433L1279 452Z'/><path fill='#b09860' stroke='#b09860' stroke-width='.6' d='M1183 657L1203 638L1193 659Z'/><path fill='#a87848' stroke='#a87848' stroke-width='.6' d='M1275 577L1272 592L1271 577ZM336 713L340 707L343 709Z'/><path fill='#906858' stroke='#906858' stroke-width='.6' d='M1287 578L1286 575L1287 575ZM1315 590L1319 587L1323 588Z'/><path fill='#b09050' stroke='#b09050' stroke-width='.6' d='M1352 590L1341 584L1350 574Z'/><path fill='#b09898' stroke='#b09898' stroke-width='.6' d='M1364 150L1373 142L1382 154Z'/><path fill='#e0d8c8' stroke='#e0d8c8' stroke-width='.6' d='M1443 311L1466 308L1453 330ZM1464 385L1489 366L1486 410Z'/><path fill='#988860' stroke='#988860' stroke-width='.6' d='M1379 294L1369 296L1369 272Z'/><path fill='#807860' stroke='#807860' stroke-width='.6' d='M694 76L690 81L682 66Z'/><path fill='#200800' stroke='#200800' stroke-width='.6' d='M81 557L57 546L78 501Z'/><path fill='#604048' stroke='#604048' stroke-width='.6' d='M1169 522L1173 517L1172 523Z'/><path fill='#482020' stroke='#482020' stroke-width='.6' d='M1172 523L1173 517L1182 524Z'/><path fill='#785858' stroke='#785858' stroke-width='.6' d='M1173 517L1164 518L1173 516Z'/><path fill='#806870' stroke='#806870' stroke-width='.6' d='M1173 517L1169 522L1164 518Z'/><path fill='#805038' stroke='#805038' stroke-width='.6' d='M1182 562L1166 563L1173 551Z'/><path fill='#704848' stroke='#704848' stroke-width='.6' d='M1166 563L1182 562L1175 570Z'/><path fill='#584858' stroke='#584858' stroke-width='.6' d='M1122 560L1139 577L1126 577Z'/><path fill='#605060' stroke='#605060' stroke-width='.6' d='M1139 577L1122 560L1122 559ZM1143 555L1139 577L1122 559Z'/><path fill='#807888' stroke='#807888' stroke-width='.6' d='M1122 576L1122 560L1126 577Z'/><path fill='#b0a8b8' stroke='#b0a8b8' stroke-width='.6' d='M1122 560L1122 576L1093 566Z'/><path fill='#a898a8' stroke='#a898a8' stroke-width='.6' d='M1134 543L1143 555L1122 559Z'/><path fill='#584850' stroke='#584850' stroke-width='.6' d='M1139 577L1143 555L1147 562Z'/><path fill='#604030' stroke='#604030' stroke-width='.6' d='M1166 563L1158 547L1173 551ZM176 961L190 954L190 962Z'/><path fill='#483030' stroke='#483030' stroke-width='.6' d='M1158 547L1166 563L1152 558Z'/><path fill='#584048' stroke='#584048' stroke-width='.6' d='M1165 528L1172 523L1176 528ZM1169 570L1168 571L1166 563Z'/><path fill='#604850' stroke='#604850' stroke-width='.6' d='M1176 573L1175 570L1184 572Z'/><path fill='#886048' stroke='#886048' stroke-width='.6' d='M1255 252L1254 260L1236 267ZM1233 452L1235 441L1243 449Z'/><path fill='#504838' stroke='#504838' stroke-width='.6' d='M663 373L648 358L661 354ZM563 404L571 400L568 408Z'/><path fill='#605840' stroke='#605840' stroke-width='.6' d='M666 374L663 373L661 354Z'/><path fill='#281010' stroke='#281010' stroke-width='.6' d='M566 267L567 254L573 266Z'/><path fill='#585050' stroke='#585050' stroke-width='.6' d='M566 267L573 266L582 284ZM582 264L587 260L582 284Z'/><path fill='#484840' stroke='#484840' stroke-width='.6' d='M558 302L566 267L582 284Z'/><path fill='#605858' stroke='#605858' stroke-width='.6' d='M573 266L582 264L582 284Z'/><path fill='#989078' stroke='#989078' stroke-width='.6' d='M633 320L640 292L653 291ZM627 302L640 292L633 320Z'/><path fill='#302818' stroke='#302818' stroke-width='.6' d='M554 385L563 404L544 395Z'/><path fill='#d0b880' stroke='#d0b880' stroke-width='.6' d='M471 333L505 333L502 377Z'/><path fill='#403038' stroke='#403038' stroke-width='.6' d='M145 819L139 820L140 804Z'/><path fill='#605050' stroke='#605050' stroke-width='.6' d='M169 800L145 819L140 804ZM324 618L332 633L316 625Z'/><path fill='#b08030' stroke='#b08030' stroke-width='.6' d='M439 669L455 686L408 694ZM1139 418L1156 418L1144 448ZM1129 313L1137 307L1134 316Z'/><path fill='#201808' stroke='#201808' stroke-width='.6' d='M386 596L399 600L406 615Z'/><path fill='#585848' stroke='#585848' stroke-width='.6' d='M432 795L438 802L434 805Z'/><path fill='#404030' stroke='#404030' stroke-width='.6' d='M428 792L432 795L434 805Z'/><path fill='#c8b0a0' stroke='#c8b0a0' stroke-width='.6' d='M303 727L316 745L292 758Z'/><path fill='#786050' stroke='#786050' stroke-width='.6' d='M323 612L322 613L314 588Z'/><path fill='#a0a098' stroke='#a0a098' stroke-width='.6' d='M1112 641L1137 634L1133 649Z'/><path fill='#98a0a0' stroke='#98a0a0' stroke-width='.6' d='M1136 612L1137 634L1122 617Z'/><path fill='#484030' stroke='#484030' stroke-width='.6' d='M1088 647L1108 646L1088 649ZM1419 412L1423 419L1423 427Z'/><path fill='#c09850' stroke='#c09850' stroke-width='.6' d='M1146 411L1156 418L1139 418ZM1271 435L1263 439L1262 434Z'/><path fill='#a87020' stroke='#a87020' stroke-width='.6' d='M1144 448L1156 418L1167 433ZM1211 340L1222 355L1204 349ZM1209 368L1201 363L1203 360ZM1213 383L1209 368L1222 355Z'/><path fill='#d8c080' stroke='#d8c080' stroke-width='.6' d='M1158 366L1142 361L1140 344Z'/><path fill='#e0c090' stroke='#e0c090' stroke-width='.6' d='M1175 349L1158 366L1140 344Z'/><path fill='#a87868' stroke='#a87868' stroke-width='.6' d='M1213 433L1221 432L1225 437Z'/><path fill='#b88028' stroke='#b88028' stroke-width='.6' d='M1222 355L1203 360L1204 349Z'/><path fill='#a87858' stroke='#a87858' stroke-width='.6' d='M1221 432L1210 415L1225 417Z'/><path fill='#986040' stroke='#986040' stroke-width='.6' d='M1210 415L1221 432L1213 433Z'/><path fill='#986840' stroke='#986840' stroke-width='.6' d='M1210 415L1224 400L1227 414Z'/><path fill='#583028' stroke='#583028' stroke-width='.6' d='M1228 439L1240 418L1235 441ZM1217 449L1229 461L1215 454Z'/><path fill='#684038' stroke='#684038' stroke-width='.6' d='M1240 418L1228 439L1225 437Z'/><path fill='#d0b090' stroke='#d0b090' stroke-width='.6' d='M1324 581L1329 572L1332 575Z'/><path fill='#c8a878' stroke='#c8a878' stroke-width='.6' d='M1329 572L1324 581L1320 562ZM1257 427L1262 434L1243 449Z'/><path fill='#c8a088' stroke='#c8a088' stroke-width='.6' d='M1324 581L1325 590L1323 588Z'/><path fill='#b89070' stroke='#b89070' stroke-width='.6' d='M1324 581L1312 582L1307 574Z'/><path fill='#a07048' stroke='#a07048' stroke-width='.6' d='M1350 267L1344 280L1337 283ZM530 499L487 505L521 484Z'/><path fill='#986848' stroke='#986848' stroke-width='.6' d='M1351 270L1344 280L1350 267Z'/><path fill='#908050' stroke='#908050' stroke-width='.6' d='M1371 305L1369 296L1381 299Z'/><path fill='#483038' stroke='#483038' stroke-width='.6' d='M1166 563L1168 571L1159 565Z'/><path fill='#604038' stroke='#604038' stroke-width='.6' d='M1170 540L1168 540L1173 538Z'/><path fill='#685050' stroke='#685050' stroke-width='.6' d='M1168 540L1165 528L1173 538Z'/><path fill='#807070' stroke='#807070' stroke-width='.6' d='M1165 528L1168 540L1165 539Z'/><path fill='#806060' stroke='#806060' stroke-width='.6' d='M1168 540L1158 547L1165 539Z'/><path fill='#988088' stroke='#988088' stroke-width='.6' d='M1151 546L1158 547L1152 558Z'/><path fill='#a08898' stroke='#a08898' stroke-width='.6' d='M1143 555L1151 546L1152 558Z'/><path fill='#c8b0c0' stroke='#c8b0c0' stroke-width='.6' d='M1152 536L1151 546L1150 545Z'/><path fill='#504840' stroke='#504840' stroke-width='.6' d='M512 722L518 732L500 716Z'/><path fill='#403008' stroke='#403008' stroke-width='.6' d='M518 732L512 722L535 736Z'/><path fill='#c0a898' stroke='#c0a898' stroke-width='.6' d='M323 710L313 713L312 711Z'/><path fill='#484040' stroke='#484040' stroke-width='.6' d='M313 628L329 639L308 643Z'/><path fill='#504848' stroke='#504848' stroke-width='.6' d='M329 639L313 628L316 625Z'/><path fill='#a87038' stroke='#a87038' stroke-width='.6' d='M1135 389L1152 388L1135 396Z'/><path fill='#a07058' stroke='#a07058' stroke-width='.6' d='M1226 417L1226 418L1225 417Z'/><path fill='#684840' stroke='#684840' stroke-width='.6' d='M1217 449L1233 452L1229 461Z'/><path fill='#b08878' stroke='#b08878' stroke-width='.6' d='M1324 581L1319 587L1312 582Z'/><path fill='#805848' stroke='#805848' stroke-width='.6' d='M1312 582L1319 587L1315 590Z'/><path fill='#b08840' stroke='#b08840' stroke-width='.6' d='M1315 554L1312 562L1309 547Z'/><path fill='#a89870' stroke='#a89870' stroke-width='.6' d='M1401 165L1398 160L1402 152Z'/><path fill='#c09870' stroke='#c09870' stroke-width='.6' d='M1264 414L1260 419L1259 418Z'/><path fill='#c08848' stroke='#c08848' stroke-width='.6' d='M22 527L32 535L0 550Z'/><path fill='#584040' stroke='#584040' stroke-width='.6' d='M1169 570L1166 563L1175 570Z'/><path fill='#685060' stroke='#685060' stroke-width='.6' d='M1176 573L1169 570L1175 570Z'/><path fill='#706068' stroke='#706068' stroke-width='.6' d='M1168 571L1169 570L1176 573Z'/><path fill='#503028' stroke='#503028' stroke-width='.6' d='M1233 452L1217 447L1228 439ZM1217 449L1217 447L1233 452Z'/><path fill='#785850' stroke='#785850' stroke-width='.6' d='M1228 439L1217 447L1225 437Z'/><path fill='#805840' stroke='#805840' stroke-width='.6' d='M1217 447L1217 449L1213 447Z'/><path fill='#a88058' stroke='#a88058' stroke-width='.6' d='M1339 598L1336 600L1328 592Z'/><path fill='#c8a080' stroke='#c8a080' stroke-width='.6' d='M1246 412L1258 425L1240 418Z'/><path fill='#c89860' stroke='#c89860' stroke-width='.6' d='M1262 447L1269 447L1266 451Z'/><path fill='#b07038' stroke='#b07038' stroke-width='.6' d='M1269 447L1279 452L1272 457Z'/>", '#d8c8b0') },
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
