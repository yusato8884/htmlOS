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
    // ---- htmlOS 7.1（Polaris）で追加。HTUi SDK 4 の Mars（火星）と、デスクトップ環境 HTUi 4 の Bengal（ベンガル）
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
    { name: 'ベンガル（ローポリ）', dir: '7.1-Polaris', file: 'bengal', css: svgWall("<path fill='#c6c0ba' stroke='#c6c0ba' stroke-width='.6' d='M41 55L119 21L105 124ZM119 21L165 54L105 124ZM150 0L165 54L119 21ZM33 177L15 107L105 124ZM15 107L41 55L105 124ZM0 150L15 107L33 177ZM200 0L165 54L150 0ZM168 110L165 54L223 99ZM165 54L168 110L105 124ZM168 110L151 169L105 124ZM222 156L168 110L223 99ZM168 110L222 156L151 169ZM200 0L220 51L165 54ZM823 174L830 210L784 193ZM1113 506L1128 543L1098 533ZM977 165L934 183L944 134ZM950 347L930 364L924 357ZM955 354L930 364L950 347Z'/><path fill='#cccccc' stroke='#cccccc' stroke-width='.6' d='M96 188L33 177L105 124ZM401 99L381 176L338 183ZM604 88L577 146L530 112ZM577 146L588 176L530 184ZM530 184L512 226L474 167ZM357 215L293 241L338 183ZM620 224L588 176L669 180ZM620 50L646 69L604 88ZM1050 0L1100 0L1085 22ZM973 55L1021 36L983 65ZM950 0L943 56L900 0ZM943 56L867 22L900 0ZM669 180L678 195L622 226ZM1250 174L1279 167L1255 212ZM1233 122L1210 168L1210 126ZM964 113L965 122L944 134ZM965 122L964 113L997 122ZM925 179L918 183L891 157ZM1044 70L1055 138L997 122Z'/><path fill='#4e3c2a' stroke='#4e3c2a' stroke-width='.6' d='M223 456L252 441L245 473ZM0 600L0 550L29 592ZM0 800L0 750L9 785ZM89 510L87 443L104 477ZM54 579L62 645L30 627ZM13 764L29 775L9 785ZM62 645L20 657L30 627ZM783 550L788 554L765 567ZM490 783L487 783L473 739ZM47 370L117 383L85 426ZM13 764L23 749L29 775ZM108 664L79 659L86 650ZM961 853L941 819L952 821ZM448 472L421 497L409 474ZM489 504L500 543L476 511ZM826 469L832 458L836 470ZM1138 847L1145 814L1154 843ZM141 387L140 385L159 386ZM811 536L803 564L788 554ZM500 543L464 588L449 570ZM1374 774L1365 720L1426 751ZM826 469L819 450L832 458ZM477 434L506 439L506 455ZM506 439L477 434L476 420ZM856 595L862 643L815 612ZM995 161L1003 167L991 181ZM819 594L816 591L825 594ZM816 591L816 597L802 588ZM816 597L816 591L819 594ZM947 655L933 653L950 651ZM915 558L920 574L912 574ZM1018 226L1033 232L1034 236ZM876 536L884 540L874 545ZM1070 191L1079 205L1064 196Z'/><path fill='#bababa' stroke='#bababa' stroke-width='.6' d='M530 184L474 167L530 112ZM671 59L730 85L662 92ZM474 167L479 109L530 112ZM0 200L38 224L0 250ZM824 10L811 12L800 0ZM836 19L824 10L850 0ZM1298 89L1376 121L1279 167ZM1250 125L1279 167L1251 169Z'/><path fill='#c0baba' stroke='#c0baba' stroke-width='.6' d='M577 146L530 184L530 112ZM767 215L720 223L718 197ZM1219 110L1231 117L1210 126ZM939 334L950 347L923 347ZM1031 159L1059 144L1060 153Z'/><path fill='#c69c6c' stroke='#c69c6c' stroke-width='.6' d='M150 1000L171 944L200 1000ZM123 958L150 1000L100 1000ZM300 1000L280 939L305 942ZM280 939L300 1000L250 1000ZM950 1000L900 1000L940 928ZM955 926L1031 926L1000 1000ZM1132 892L1154 843L1204 934ZM1088 856L1132 892L1086 922ZM550 1000L570 959L600 1000ZM570 959L550 1000L540 950ZM400 1000L381 924L406 934ZM381 924L350 1000L305 942ZM1158 962L1150 1000L1100 1000ZM1031 926L1046 898L1086 922ZM1246 899L1204 934L1192 832ZM1588 733L1592 718L1600 750ZM715 925L750 954L700 1000ZM1458 880L1497 876L1495 958ZM1504 787L1458 880L1423 802Z'/><path fill='#ba9060' stroke='#ba9060' stroke-width='.6' d='M200 1000L171 944L200 946ZM145 946L171 944L150 1000ZM818 949L791 933L818 918ZM1346 806L1365 793L1364 795ZM1346 806L1364 795L1378 797Z'/><path fill='#a27e54' stroke='#a27e54' stroke-width='.6' d='M0 950L20 948L0 1000ZM20 948L33 947L50 1000ZM839 804L865 836L855 838ZM228 861L237 900L210 886ZM228 861L229 858L237 900ZM1198 525L1204 525L1198 545Z'/><path fill='#c6a26c' stroke='#c6a26c' stroke-width='.6' d='M20 948L50 1000L0 1000ZM1204 934L1250 1000L1200 1000ZM350 1000L300 1000L305 942ZM1158 962L1204 934L1200 1000ZM1158 962L1132 892L1204 934ZM1158 962L1100 1000L1086 922ZM1132 892L1158 962L1086 922ZM1031 926L1050 1000L1000 1000ZM1100 1000L1050 1000L1086 922ZM1050 1000L1031 926L1086 922ZM1374 879L1356 951L1301 883ZM1250 1000L1308 950L1300 1000ZM1356 951L1308 950L1301 883ZM1350 1000L1308 950L1356 951ZM1600 800L1572 812L1600 750ZM1600 800L1600 850L1572 812ZM1497 876L1551 886L1495 958ZM1551 886L1600 850L1600 900ZM1600 850L1551 886L1572 812ZM1551 886L1497 876L1572 812ZM1150 1000L1158 962L1200 1000ZM1308 950L1246 899L1301 883ZM1246 899L1250 1000L1204 934ZM1246 899L1308 950L1250 1000ZM1504 787L1521 734L1572 812ZM1497 876L1504 787L1572 812ZM1572 812L1555 723L1600 750ZM1555 723L1588 733L1600 750ZM400 1000L424 931L450 1000ZM424 931L400 1000L406 934ZM1433 963L1458 880L1495 958ZM1458 880L1433 963L1374 879Z'/><path fill='#726042' stroke='#726042' stroke-width='.6' d='M20 948L0 950L4 925ZM1228 413L1228 427L1219 426ZM1596 708L1600 700L1600 750ZM1078 147L1085 151L1082 153Z'/><path fill='#ba905a' stroke='#ba905a' stroke-width='.6' d='M225 945L200 1000L200 946ZM1424 526L1468 531L1424 610ZM1369 610L1353 526L1424 526ZM921 893L955 926L940 928ZM1600 550L1598 592L1570 540ZM897 933L908 896L940 928ZM1541 567L1515 602L1511 527Z'/><path fill='#96785a' stroke='#96785a' stroke-width='.6' d='M0 950L0 900L4 925ZM155 549L152 524L170 543ZM315 814L323 814L322 847ZM472 686L485 706L445 738ZM833 544L821 532L833 530ZM1176 271L1170 252L1184 268ZM885 398L902 409L872 421ZM888 291L893 304L873 310ZM1141 574L1163 596L1146 617ZM1207 446L1188 430L1219 426ZM1180 518L1179 506L1192 512ZM914 512L901 523L910 506Z'/><path fill='#2a1e12' stroke='#2a1e12' stroke-width='.6' d='M656 516L633 457L676 480ZM302 931L280 939L257 915ZM99 759L59 765L105 727ZM0 750L13 764L9 785ZM487 783L507 812L467 831ZM288 359L259 393L253 371ZM715 925L652 927L673 901ZM1009 882L970 880L975 849ZM389 627L400 690L386 689ZM646 549L563 550L594 502ZM448 472L409 474L445 440ZM76 563L72 557L115 557ZM109 765L99 759L105 727ZM362 729L326 721L359 716ZM830 882L886 902L818 918ZM908 896L913 872L921 893ZM590 871L549 834L588 806ZM641 789L604 739L639 727ZM769 775L745 791L744 769ZM1101 416L1101 383L1117 404ZM590 748L558 760L562 745ZM443 890L451 890L464 902ZM881 875L890 852L913 872ZM881 875L883 880L852 872ZM1064 442L1053 410L1071 435ZM1110 456L1113 433L1113 455Z'/><path fill='#6c4e30' stroke='#6c4e30' stroke-width='.6' d='M319 522L268 556L245 473ZM717 603L751 608L719 635ZM1215 411L1204 412L1207 401ZM769 775L744 769L770 737ZM791 648L815 612L829 652ZM398 510L404 557L354 543ZM1156 393L1168 410L1157 403ZM1215 411L1226 394L1226 412ZM877 590L856 595L864 580ZM875 377L882 370L884 379ZM1065 714L1081 675L1079 723ZM882 370L882 369L886 374ZM912 574L919 578L918 579ZM1193 377L1207 380L1192 379ZM908 677L914 738L870 694Z'/><path fill='#6c543c' stroke='#6c543c' stroke-width='.6' d='M297 462L319 522L245 473ZM184 456L208 514L190 520ZM525 38L550 0L599 10ZM87 443L15 466L85 426ZM96 509L89 510L104 477ZM59 765L99 759L60 777ZM1067 796L1108 792L1102 828ZM421 497L398 510L409 474ZM1193 804L1168 804L1167 787ZM117 383L140 385L123 405ZM392 475L367 489L374 477ZM927 688L935 697L922 735ZM410 350L431 306L461 361ZM33 748L23 749L30 741ZM768 407L788 380L809 418ZM968 677L974 680L935 697ZM823 547L835 551L830 561ZM1285 791L1286 778L1308 767ZM1019 389L1019 391L1013 386ZM1053 410L1032 426L1033 414ZM864 540L874 545L864 554ZM1105 361L1114 363L1112 380ZM923 665L924 664L929 669ZM1129 242L1108 234L1127 225ZM1060 171L1060 153L1069 165ZM1006 231L1005 230L1010 225Z'/><path fill='#4e4e42' stroke='#4e4e42' stroke-width='.6' d='M1369 322L1315 373L1314 300ZM620 224L601 269L534 256ZM548 305L477 266L534 256ZM1359 472L1319 460L1355 402Z'/><path fill='#9c8460' stroke='#9c8460' stroke-width='.6' d='M1424 526L1456 449L1468 531ZM886 362L846 361L864 331Z'/><path fill='#b4844e' stroke='#b4844e' stroke-width='.6' d='M1369 610L1424 526L1424 610Z'/><path fill='#ba9c7e' stroke='#ba9c7e' stroke-width='.6' d='M0 300L56 292L0 350ZM36 265L82 291L56 292ZM946 436L930 426L941 417ZM1194 444L1185 432L1188 430ZM1164 361L1160 360L1165 349ZM1194 444L1184 443L1185 432Z'/><path fill='#ae906c' stroke='#ae906c' stroke-width='.6' d='M171 264L162 301L117 249ZM17 857L32 885L0 900ZM274 764L315 814L262 815ZM274 764L290 749L331 802ZM47 370L86 315L109 363ZM86 315L82 291L162 301ZM791 372L813 351L832 387ZM868 478L839 466L858 461ZM898 402L924 398L902 409ZM795 344L803 345L791 365ZM866 383L871 385L854 405ZM1202 321L1175 317L1198 311ZM1141 574L1134 546L1174 557ZM1211 367L1207 364L1213 346Z'/><path fill='#c0ae9c' stroke='#c0ae9c' stroke-width='.6' d='M50 0L41 55L0 0ZM824 165L823 174L801 161ZM989 560L990 540L1007 551ZM983 547L990 540L989 560Z'/><path fill='#c0b4a8' stroke='#c0b4a8' stroke-width='.6' d='M41 55L0 50L0 0ZM1131 20L1150 0L1165 49ZM823 174L847 189L830 210ZM1045 555L1062 525L1056 558ZM1066 509L1099 509L1098 533ZM1065 475L1093 482L1066 509ZM1136 509L1134 546L1128 543ZM1134 546L1136 509L1151 509ZM794 272L791 266L828 240Z'/><path fill='#c6c0b4' stroke='#c6c0b4' stroke-width='.6' d='M0 50L41 55L0 100ZM41 55L15 107L0 100ZM15 107L0 150L0 100ZM100 0L150 0L119 21ZM41 55L100 0L119 21ZM1136 509L1128 543L1113 506ZM1210 168L1202 167L1210 126Z'/><path fill='#d8d8d8' stroke='#d8d8d8' stroke-width='.6' d='M38 224L33 177L96 188ZM669 180L588 176L577 146ZM381 176L357 215L338 183ZM1150 0L1131 20L1100 0Z'/><path fill='#c0c0ba' stroke='#c0c0ba' stroke-width='.6' d='M38 224L96 188L117 249ZM730 85L669 180L662 92ZM443 32L479 109L401 99ZM830 210L767 215L784 193ZM1552 124L1600 100L1600 150ZM1600 50L1582 47L1600 0ZM1582 47L1550 0L1600 0ZM1582 47L1600 50L1600 100ZM1552 124L1528 172L1501 92ZM1279 167L1250 174L1251 169ZM368 324L309 359L292 320ZM828 240L767 215L830 210ZM1250 231L1248 226L1255 212ZM1248 226L1232 229L1255 212ZM828 240L791 266L767 215ZM780 188L801 161L784 193ZM849 219L848 256L828 240ZM790 131L814 104L832 131ZM1078 147L1059 144L1079 133Z'/><path fill='#423c2a' stroke='#423c2a' stroke-width='.6' d='M223 456L214 451L252 441ZM1482 733L1456 712L1496 730ZM461 361L477 266L547 317Z'/><path fill='#3c3024' stroke='#3c3024' stroke-width='.6' d='M170 543L190 520L215 550ZM171 422L230 375L214 451ZM127 433L85 426L123 405ZM87 443L119 471L104 477ZM466 925L424 931L464 902ZM571 402L519 447L511 399ZM72 557L76 563L54 579ZM422 382L453 393L445 440ZM1163 279L1176 303L1162 296ZM1101 416L1096 422L1064 398ZM1246 813L1288 803L1287 813ZM1171 312L1165 310L1176 303ZM961 585L973 597L951 600Z'/><path fill='#4e3c24' stroke='#4e3c24' stroke-width='.6' d='M268 556L226 509L245 473ZM805 673L767 717L779 673ZM297 462L335 494L319 522ZM22 947L20 948L4 925ZM122 648L108 664L86 650ZM367 489L352 454L374 477ZM509 881L460 873L467 831ZM381 737L392 770L391 773ZM1168 804L1193 804L1192 832ZM185 819L154 770L208 775ZM824 501L807 529L815 492ZM604 739L573 725L594 693ZM1088 856L1053 856L1102 828ZM792 452L778 452L778 425ZM1105 361L1101 383L1092 364ZM1041 400L1053 410L1033 414ZM923 645L878 644L902 606ZM1110 456L1092 464L1080 447ZM1006 231L1018 226L1010 238Z'/><path fill='#664e36' stroke='#664e36' stroke-width='.6' d='M154 409L127 433L123 405ZM170 543L172 532L190 520ZM709 731L726 702L725 725ZM352 454L367 489L335 494ZM450 251L443 260L428 212ZM90 706L45 756L30 741ZM472 686L478 661L493 683ZM405 562L346 571L348 557ZM392 475L393 443L409 474ZM570 924L581 892L652 927ZM45 756L33 748L30 741ZM821 532L838 509L833 530ZM840 461L839 466L832 458ZM989 469L991 462L1008 465ZM549 834L547 842L519 812ZM1226 394L1228 413L1226 412ZM865 560L866 576L858 568ZM823 547L818 550L811 536ZM886 546L895 563L878 568ZM1046 189L1044 185L1058 173ZM983 203L949 203L950 199ZM923 665L908 677L923 645ZM908 677L923 665L929 669ZM1113 432L1096 422L1101 416ZM1113 433L1113 432L1153 434ZM770 298L777 302L769 307Z'/><path fill='#d2d2d2' stroke='#d2d2d2' stroke-width='.6' d='M381 176L474 167L428 212ZM0 200L0 150L33 177ZM293 241L222 156L338 183ZM678 195L669 180L718 197ZM1044 70L997 122L983 65ZM1217 200L1242 184L1255 212ZM1079 133L1072 83L1097 109ZM997 122L967 98L983 65ZM967 98L926 109L943 56ZM967 98L943 56L973 55ZM1079 133L1055 138L1072 83Z'/><path fill='#c6c6c6' stroke='#c6c6c6' stroke-width='.6' d='M474 167L381 176L401 99ZM479 109L474 167L401 99ZM306 88L401 99L338 183ZM973 55L950 0L1000 0ZM1600 200L1599 176L1600 150ZM1021 36L973 55L1000 0ZM973 55L943 56L950 0ZM1250 174L1242 184L1251 169ZM784 77L765 119L730 85ZM925 179L891 157L944 134ZM1245 129L1250 125L1251 169ZM934 183L925 179L944 134ZM1025 37L1044 70L983 65ZM872 152L872 136L891 157ZM872 136L897 105L891 157ZM872 136L832 131L884 95ZM872 136L872 152L832 131ZM926 109L964 113L944 134ZM965 122L977 165L944 134ZM1059 144L1055 138L1079 133Z'/><path fill='#a89078' stroke='#a89078' stroke-width='.6' d='M400 0L443 32L375 24ZM450 0L443 32L400 0ZM330 33L350 0L375 24ZM1367 103L1298 89L1300 57ZM1041 309L1071 329L1056 342ZM908 209L884 196L893 191ZM777 302L787 277L796 294ZM1124 80L1136 80L1119 102ZM1075 268L1072 267L1082 259Z'/><path fill='#aea296' stroke='#aea296' stroke-width='.6' d='M443 32L401 99L375 24ZM1179 144L1209 110L1210 126ZM1145 310L1162 316L1143 338ZM934 183L923 186L925 179ZM1136 120L1119 102L1155 100ZM1123 133L1136 120L1135 148ZM957 360L963 381L952 380Z'/><path fill='#d2cccc' stroke='#d2cccc' stroke-width='.6' d='M128 184L96 188L105 124ZM1100 0L1131 20L1085 22ZM1446 226L1528 172L1535 207ZM918 183L909 190L891 157ZM893 191L878 186L891 157ZM909 190L893 191L891 157Z'/><path fill='#ccc6c6' stroke='#ccc6c6' stroke-width='.6' d='M151 169L128 184L105 124ZM151 169L222 156L171 264ZM1279 167L1273 241L1255 212ZM1367 232L1279 167L1387 179ZM878 186L873 157L891 157ZM1206 180L1211 169L1242 184Z'/><path fill='#ccd2cc' stroke='#ccd2cc' stroke-width='.6' d='M96 188L128 184L117 249Z'/><path fill='#b4aea2' stroke='#b4aea2' stroke-width='.6' d='M128 184L171 264L117 249ZM36 265L38 224L117 249ZM306 88L220 51L250 0ZM497 41L479 109L443 32ZM401 99L336 51L375 24ZM1135 158L1166 161L1163 180ZM1376 121L1298 89L1367 103ZM1044 70L1038 35L1085 22ZM1250 125L1255 116L1274 112ZM1145 310L1146 292L1161 304ZM1210 205L1232 229L1206 217ZM1135 148L1153 126L1154 143ZM1207 175L1211 169L1206 180ZM1119 317L1112 306L1125 313ZM1217 200L1205 183L1206 180ZM783 108L781 121L771 120ZM963 381L970 359L988 364ZM934 370L957 360L952 380ZM1145 310L1163 313L1162 316Z'/><path fill='#ccccc6' stroke='#ccccc6' stroke-width='.6' d='M128 184L151 169L171 264ZM1387 179L1427 164L1446 226ZM1427 164L1528 172L1446 226ZM1528 172L1599 176L1535 207ZM1232 229L1217 200L1255 212Z'/><path fill='#484836' stroke='#484836' stroke-width='.6' d='M735 369L671 300L739 292Z'/><path fill='#d2d2cc' stroke='#d2d2cc' stroke-width='.6' d='M669 180L577 146L662 92ZM1599 176L1600 200L1535 207ZM1242 184L1250 174L1255 212ZM1217 200L1206 180L1242 184Z'/><path fill='#c0cccc' stroke='#c0cccc' stroke-width='.6' d='M721 18L736 19L730 85Z'/><path fill='#bac0c0' stroke='#bac0c0' stroke-width='.6' d='M671 59L721 18L730 85ZM750 0L736 19L721 18ZM867 22L850 0L900 0ZM832 131L828 91L884 95ZM814 104L828 91L832 131ZM1031 159L1025 153L1055 138Z'/><path fill='#c6c6c0' stroke='#c6c6c0' stroke-width='.6' d='M474 167L461 229L428 212ZM222 156L306 88L338 183ZM357 286L368 324L292 320ZM1600 200L1594 246L1535 207ZM339 368L309 359L368 324ZM873 157L872 152L891 157ZM1242 184L1211 169L1251 169ZM784 77L783 108L765 119Z'/><path fill='#dedee4' stroke='#dedee4' stroke-width='.6' d='M577 146L604 88L662 92Z'/><path fill='#c09c60' stroke='#c09c60' stroke-width='.6' d='M225 945L250 1000L200 1000ZM1550 1000L1500 1000L1495 958ZM1433 963L1450 1000L1400 1000ZM818 949L897 933L818 966Z'/><path fill='#7e6c54' stroke='#7e6c54' stroke-width='.6' d='M24 505L0 550L0 500ZM32 385L0 400L0 350ZM89 510L35 521L24 505ZM16 614L10 646L0 650ZM154 691L143 671L164 672ZM143 671L122 648L183 650ZM154 770L109 765L122 721ZM1085 151L1078 147L1084 137ZM970 223L972 247L958 244ZM1028 578L1016 572L1032 557ZM1097 256L1087 227L1094 228ZM1200 458L1206 468L1197 463ZM1022 174L1010 164L1024 170ZM949 251L950 257L938 264Z'/><path fill='#362a18' stroke='#362a18' stroke-width='.6' d='M0 550L46 541L29 592ZM373 819L363 814L388 798ZM32 385L47 370L41 383ZM150 901L119 910L106 860ZM776 464L789 478L757 472ZM485 706L526 690L528 743ZM233 357L230 375L178 358ZM300 595L287 570L327 585ZM362 729L381 737L391 773ZM777 381L768 407L759 406ZM656 516L646 549L594 502ZM688 521L649 552L656 516ZM385 616L346 571L406 580ZM346 571L405 562L406 580ZM609 409L670 433L633 457ZM641 789L639 727L643 726ZM304 616L300 595L327 585ZM1096 422L1071 435L1064 398ZM1041 275L1040 268L1044 268ZM1041 275L1041 277L1025 274ZM1064 196L1039 217L1046 189ZM1039 217L1064 196L1060 226ZM1092 464L1079 451L1080 447ZM1006 192L1015 200L1011 210Z'/><path fill='#907860' stroke='#907860' stroke-width='.6' d='M183 650L122 648L158 573ZM172 532L152 524L149 514ZM122 648L94 598L158 573ZM183 729L154 691L200 682ZM45 756L33 777L29 775ZM1161 234L1160 238L1145 224ZM961 387L964 395L943 387ZM992 252L971 251L972 247ZM979 265L972 267L971 251Z'/><path fill='#ba9660' stroke='#ba9660' stroke-width='.6' d='M280 939L250 1000L225 945ZM900 1000L897 933L940 928ZM1378 797L1374 774L1423 802ZM1243 524L1259 516L1279 533Z'/><path fill='#361e12' stroke='#361e12' stroke-width='.6' d='M370 880L340 844L383 858ZM726 702L731 692L767 717ZM582 593L570 580L593 583Z'/><path fill='#a88a66' stroke='#a88a66' stroke-width='.6' d='M290 749L312 746L331 802ZM233 357L229 318L292 320ZM163 302L158 361L149 361ZM846 379L854 405L832 387ZM846 379L866 383L854 405ZM803 345L795 344L801 316ZM943 387L924 398L926 389ZM952 409L964 395L957 412ZM956 419L946 436L941 417ZM923 420L913 426L902 409ZM846 361L846 379L838 357ZM814 323L803 345L801 316ZM849 409L837 437L822 403ZM1174 557L1134 546L1163 534ZM1106 600L1141 574L1146 617Z'/><path fill='#785a42' stroke='#785a42' stroke-width='.6' d='M227 929L225 945L200 946ZM108 664L92 703L75 680ZM1027 773L1057 801L1025 790ZM1107 210L1117 186L1127 225ZM864 554L860 561L850 549ZM857 544L864 540L864 554ZM950 244L923 224L938 218ZM933 209L912 195L917 190Z'/><path fill='#54422a' stroke='#54422a' stroke-width='.6' d='M32 885L45 941L4 925ZM166 865L150 901L106 860ZM526 690L536 666L594 693ZM158 361L173 356L178 358ZM168 737L191 729L208 775ZM646 549L649 552L605 588ZM939 739L935 697L974 729ZM1168 804L1145 814L1167 787ZM508 908L466 925L464 902ZM326 721L362 729L312 746ZM778 452L765 420L778 425ZM431 306L477 266L461 361ZM419 878L443 890L424 931ZM862 643L878 644L876 674ZM769 800L745 791L769 775ZM562 790L583 804L550 796ZM558 760L596 762L592 774ZM953 192L983 203L950 199ZM920 574L915 558L928 567ZM1079 205L1085 199L1101 206ZM1018 226L1015 224L1021 203Z'/><path fill='#a28460' stroke='#a28460' stroke-width='.6' d='M0 900L32 885L4 925ZM321 716L312 746L290 749ZM1176 303L1202 303L1198 311ZM1301 818L1259 828L1287 813ZM813 351L803 345L820 338ZM803 345L813 351L791 365ZM934 534L964 536L956 544ZM846 361L881 369L852 370ZM1048 581L1047 573L1059 568ZM913 426L916 428L917 431ZM998 414L989 450L975 428Z'/><path fill='#5a4230' stroke='#5a4230' stroke-width='.6' d='M30 741L0 750L0 700ZM85 426L117 383L123 405ZM807 529L799 480L815 492ZM119 910L106 929L83 933ZM807 529L811 536L783 549ZM392 475L373 457L393 443ZM819 450L792 452L809 418ZM232 618L199 617L214 612ZM939 566L927 553L930 550ZM1009 599L1031 596L1035 635Z'/><path fill='#ae8a6c' stroke='#ae8a6c' stroke-width='.6' d='M17 857L0 900L0 850ZM1211 367L1209 376L1207 364Z'/><path fill='#9c784e' stroke='#9c784e' stroke-width='.6' d='M731 692L668 668L719 635ZM886 902L897 933L818 918ZM490 939L497 941L475 954ZM1014 422L1024 428L1014 451ZM1184 531L1175 541L1163 534ZM1184 531L1198 525L1187 536Z'/><path fill='#362412' stroke='#362412' stroke-width='.6' d='M767 717L731 692L779 673ZM228 933L280 939L225 945ZM684 608L717 603L701 613ZM476 511L426 550L413 518ZM768 919L788 866L818 918ZM772 636L791 648L779 673ZM688 521L656 516L676 480ZM426 550L404 557L413 518ZM1174 735L1136 705L1168 675ZM460 873L419 878L467 831ZM262 749L227 704L248 688ZM449 570L464 588L446 584ZM794 795L787 793L809 766ZM856 595L822 600L825 594ZM1009 599L973 597L978 594Z'/><path fill='#725436' stroke='#725436' stroke-width='.6' d='M782 742L767 717L836 704ZM392 770L381 737L445 738ZM955 440L975 428L963 458ZM916 757L914 738L922 735ZM955 440L968 426L975 428ZM1237 350L1218 368L1213 346ZM1163 596L1160 578L1169 580ZM1100 176L1085 151L1101 140ZM1136 705L1081 675L1106 664ZM886 374L885 381L884 379ZM854 405L885 398L872 421ZM1192 344L1210 339L1213 346ZM1031 596L1009 599L1024 594ZM994 572L1006 576L1009 599ZM901 523L886 504L905 502Z'/><path fill='#665442' stroke='#665442' stroke-width='.6' d='M769 327L735 369L739 292ZM220 468L208 514L184 456ZM453 393L422 382L461 361ZM1156 278L1153 277L1159 274ZM1133 282L1142 262L1136 282ZM1025 302L1016 286L1045 288ZM946 189L941 191L934 183ZM933 653L924 664L923 645ZM1078 211L1085 221L1060 226Z'/><path fill='#2a1e0c' stroke='#2a1e0c' stroke-width='.6' d='M610 462L656 516L594 502ZM358 902L322 847L340 844ZM651 720L639 727L623 693ZM973 805L975 849L952 821ZM204 677L200 682L183 650ZM941 819L973 805L952 821ZM132 949L106 929L119 910ZM563 550L541 504L594 502ZM974 680L968 677L967 650ZM558 760L562 790L550 796Z'/><path fill='#24180c' stroke='#24180c' stroke-width='.6' d='M656 516L610 462L633 457ZM570 580L563 550L593 583ZM381 737L359 716L386 689ZM678 440L734 436L676 480ZM507 812L487 783L490 783ZM381 737L362 729L359 716ZM1116 752L1085 763L1096 728ZM363 628L389 627L386 689ZM538 503L489 504L506 455ZM546 850L513 899L509 881ZM385 616L389 627L363 628ZM541 504L610 462L594 502ZM424 931L443 890L464 902ZM1000 684L974 680L967 650ZM450 442L477 434L467 475ZM859 853L881 875L852 872ZM816 591L807 579L819 573Z'/><path fill='#84603c' stroke='#84603c' stroke-width='.6' d='M772 636L751 608L796 616ZM772 636L757 642L751 608ZM1600 700L1575 696L1587 659ZM802 760L769 775L799 753ZM229 858L218 837L262 815ZM1106 600L1079 656L1062 594Z'/><path fill='#4e422a' stroke='#4e422a' stroke-width='.6' d='M252 441L273 452L245 473ZM54 579L30 627L29 592ZM373 457L363 433L393 443Z'/><path fill='#3c301e' stroke='#3c301e' stroke-width='.6' d='M273 452L297 462L245 473ZM214 451L184 456L184 449ZM199 617L183 650L158 573ZM335 494L354 543L319 522ZM230 375L159 386L178 358ZM208 514L220 468L226 509ZM119 910L150 901L145 946ZM526 690L547 744L528 743ZM158 361L159 386L149 361ZM159 386L158 361L178 358ZM72 557L54 579L46 541ZM79 659L62 645L86 650ZM448 472L467 475L476 511ZM393 443L422 382L445 440ZM333 582L287 570L319 522ZM1539 722L1511 725L1535 704ZM550 796L549 834L519 812ZM199 617L232 618L183 650ZM1010 164L1003 167L1003 161ZM1002 364L1006 369L988 364ZM1060 452L1064 442L1062 452ZM1003 167L1006 192L991 181ZM1056 283L1041 275L1044 268ZM1092 464L1105 466L1093 482ZM1039 217L1033 187L1046 189ZM964 580L968 572L966 584Z'/><path fill='#969084' stroke='#969084' stroke-width='.6' d='M1600 300L1595 251L1600 250ZM1595 251L1600 300L1575 287ZM1146 292L1132 307L1131 286ZM1145 310L1132 307L1146 292ZM1099 509L1066 509L1099 498ZM932 333L939 334L926 338ZM973 334L957 346L967 333Z'/><path fill='#a2a29c' stroke='#a2a29c' stroke-width='.6' d='M1545 491L1600 450L1600 500ZM1569 396L1545 491L1502 404ZM1600 450L1545 491L1600 437ZM1545 491L1569 396L1600 437ZM1575 287L1513 322L1526 260ZM1513 322L1569 396L1502 404ZM1600 400L1600 450L1600 437ZM1600 400L1569 396L1600 350ZM1569 396L1591 330L1600 350ZM588 176L620 224L534 256ZM1595 251L1594 246L1600 250ZM1232 229L1250 231L1224 245ZM1025 153L1010 164L1018 148ZM957 346L955 354L950 347Z'/><path fill='#8a8a7e' stroke='#8a8a7e' stroke-width='.6' d='M1513 322L1440 295L1526 260ZM1000 158L995 161L982 161Z'/><path fill='#b4b4a8' stroke='#b4b4a8' stroke-width='.6' d='M1446 226L1535 207L1526 260ZM38 224L36 265L0 250ZM330 33L336 51L306 88ZM1158 87L1161 65L1185 72ZM841 270L836 286L825 280Z'/><path fill='#7e7e72' stroke='#7e7e72' stroke-width='.6' d='M1440 295L1446 226L1526 260ZM957 360L970 359L963 381Z'/><path fill='#a87848' stroke='#a87848' stroke-width='.6' d='M1381 674L1369 610L1424 610ZM1442 660L1515 602L1508 660Z'/><path fill='#545448' stroke='#545448' stroke-width='.6' d='M1355 402L1283 413L1315 373ZM611 323L682 379L608 389ZM577 393L611 323L608 389ZM606 407L577 393L608 389Z'/><path fill='#b4966c' stroke='#b4966c' stroke-width='.6' d='M1424 526L1353 526L1351 484ZM1020 470L1028 461L1045 484ZM1279 533L1273 493L1327 496Z'/><path fill='#a28a6c' stroke='#a28a6c' stroke-width='.6' d='M1353 526L1327 496L1351 484ZM200 682L222 702L210 712ZM33 777L51 767L60 777ZM846 361L853 329L864 331ZM1090 266L1075 268L1082 259ZM893 304L903 319L873 310ZM903 319L898 331L873 310ZM975 552L983 547L989 560ZM1188 476L1184 443L1197 463ZM1207 446L1200 457L1194 444ZM914 512L924 523L916 526ZM924 523L914 512L925 515ZM1122 67L1124 80L1119 72Z'/><path fill='#7e5430' stroke='#7e5430' stroke-width='.6' d='M1228 680L1208 596L1275 618ZM1313 726L1293 721L1293 671ZM1238 544L1200 566L1198 545Z'/><path fill='#baa284' stroke='#baa284' stroke-width='.6' d='M36 265L0 300L0 250ZM932 520L925 515L937 493ZM853 329L838 357L820 338ZM1019 389L1019 375L1030 387ZM1106 297L1086 303L1094 282ZM930 487L958 477L937 493ZM1153 434L1166 437L1132 472ZM967 548L964 536L971 531ZM1175 317L1202 321L1173 330ZM1175 316L1176 303L1198 311ZM983 547L975 552L970 550ZM969 562L967 566L962 566Z'/><path fill='#baa27e' stroke='#baa27e' stroke-width='.6' d='M0 300L36 265L56 292ZM925 515L930 487L937 493Z'/><path fill='#ae9072' stroke='#ae9072' stroke-width='.6' d='M162 301L82 291L117 249ZM315 814L274 764L331 802ZM86 315L129 364L109 363ZM958 468L958 477L928 468ZM946 456L937 451L946 436ZM989 560L986 564L976 560ZM1192 512L1195 497L1221 497ZM914 512L910 506L925 515Z'/><path fill='#b49c7e' stroke='#b49c7e' stroke-width='.6' d='M82 291L36 265L117 249ZM1367 103L1410 40L1423 54ZM975 428L989 450L981 458ZM795 344L791 365L779 349ZM891 368L925 370L926 389ZM937 306L903 319L897 300ZM1166 337L1173 330L1186 353ZM1128 543L1141 574L1088 558Z'/><path fill='#c6b4a8' stroke='#c6b4a8' stroke-width='.6' d='M50 0L100 0L41 55Z'/><path fill='#d2d8d8' stroke='#d2d8d8' stroke-width='.6' d='M38 224L0 200L33 177Z'/><path fill='#362a1e' stroke='#362a1e' stroke-width='.6' d='M171 422L214 451L184 449ZM734 436L729 387L759 406ZM47 370L85 426L41 383ZM119 471L87 443L127 433ZM54 579L76 563L87 576ZM1071 435L1053 410L1064 398ZM1101 383L1101 416L1064 398ZM883 880L881 875L913 872ZM1048 253L1044 260L1026 252ZM1040 268L1044 260L1044 268ZM1040 268L1025 274L1026 252ZM830 583L829 584L819 573ZM1037 233L1037 225L1039 234Z'/><path fill='#5a4836' stroke='#5a4836' stroke-width='.6' d='M127 433L171 422L184 449ZM0 448L0 400L26 396ZM16 614L0 650L0 600ZM115 557L112 531L141 553ZM1085 763L1116 752L1108 792ZM1145 814L1128 803L1167 787ZM1057 801L1031 801L1025 790ZM373 457L392 475L374 477ZM379 373L347 426L330 402ZM481 392L453 393L461 361ZM519 447L506 439L511 399ZM489 387L481 392L461 361ZM977 165L979 179L971 185ZM910 554L910 534L923 538ZM949 203L983 203L970 223ZM1031 226L1018 226L1021 203ZM1039 234L1037 225L1043 223ZM1017 281L1013 270L1025 274ZM879 520L885 531L876 531ZM943 579L960 583L949 585ZM1011 210L1015 224L1010 212ZM934 375L933 377L925 370ZM1015 200L1024 192L1021 203Z'/><path fill='#66543c' stroke='#66543c' stroke-width='.6' d='M171 422L127 433L154 409ZM159 386L171 422L154 409ZM33 688L2 698L31 675ZM248 678L250 630L250 678ZM1511 725L1496 730L1508 660ZM347 426L318 407L330 402ZM347 426L328 440L318 407ZM363 433L347 426L379 373ZM941 191L946 189L950 199ZM951 600L973 597L961 632ZM973 286L972 267L979 279ZM949 251L950 244L958 244Z'/><path fill='#483624' stroke='#483624' stroke-width='.6' d='M158 573L162 559L215 550ZM162 559L170 543L215 550ZM322 847L358 902L314 851ZM0 400L32 385L26 396ZM363 814L323 814L331 802ZM573 725L526 690L594 693ZM460 873L509 881L464 902ZM122 657L108 664L122 648ZM23 749L0 750L30 741ZM536 666L540 660L594 693ZM476 420L450 442L445 440ZM984 737L947 774L974 729ZM1154 843L1145 814L1168 804ZM1145 814L1138 847L1102 828ZM363 433L373 457L352 454ZM140 385L129 364L149 361ZM546 850L507 812L519 812ZM509 881L508 908L464 902ZM1041 702L984 737L1000 684ZM794 795L809 766L831 799ZM562 745L547 744L573 725ZM892 584L905 595L883 596ZM787 793L769 775L802 760ZM950 651L961 632L967 650ZM590 748L596 762L558 760ZM830 583L856 595L825 594ZM1039 217L1037 225L1031 226ZM1015 224L1011 210L1021 203ZM889 543L894 546L886 546Z'/><path fill='#84664e' stroke='#84664e' stroke-width='.6' d='M162 559L155 549L170 543ZM274 764L262 749L290 749ZM99 759L90 796L78 791ZM830 561L850 549L858 568ZM1170 252L1160 250L1171 246ZM835 551L823 547L833 544ZM1071 329L1098 338L1089 357ZM1101 206L1100 176L1117 186ZM1160 250L1153 251L1160 238ZM1086 303L1093 324L1074 318ZM860 561L865 560L858 568Z'/><path fill='#90785a' stroke='#90785a' stroke-width='.6' d='M162 559L158 573L141 553ZM112 531L152 524L141 553ZM333 582L363 628L327 585ZM185 819L128 814L126 800ZM1067 356L1071 329L1089 357ZM1030 387L1049 365L1059 376ZM896 289L897 300L893 293ZM1110 346L1111 346L1108 347ZM893 304L888 291L893 293ZM1114 363L1105 361L1108 347ZM1183 503L1195 497L1192 512ZM908 275L920 283L896 289ZM1021 315L1012 318L1025 302Z'/><path fill='#8a785a' stroke='#8a785a' stroke-width='.6' d='M155 549L162 559L141 553ZM961 309L937 306L957 299ZM1222 444L1207 446L1219 426ZM1200 457L1200 458L1197 463Z'/><path fill='#846c54' stroke='#846c54' stroke-width='.6' d='M149 514L184 456L190 520ZM152 524L126 506L149 514ZM10 646L16 614L30 627ZM168 737L183 729L191 729ZM78 791L67 799L60 777ZM110 796L125 819L90 796ZM991 462L989 469L981 458ZM1045 555L1047 573L1032 557ZM1069 165L1078 147L1082 153ZM983 203L953 192L971 185ZM924 664L933 653L929 669ZM991 563L989 560L1007 551ZM941 191L933 209L923 186ZM920 283L938 264L952 268ZM777 302L791 305L769 327ZM1005 230L998 243L987 231Z'/><path fill='#6c5a42' stroke='#6c5a42' stroke-width='.6' d='M184 456L127 433L184 449ZM0 550L35 521L46 541ZM1123 361L1137 367L1127 368ZM946 189L977 165L971 185ZM1078 211L1079 205L1101 206ZM787 277L770 298L760 264Z'/><path fill='#7e664e' stroke='#7e664e' stroke-width='.6' d='M172 532L149 514L190 520ZM550 0L525 38L500 0ZM184 456L119 471L127 433ZM89 510L96 509L112 531ZM96 509L126 506L112 531ZM2 698L33 688L30 741ZM1511 725L1539 722L1521 734ZM33 748L45 756L29 775ZM1196 247L1193 224L1211 238ZM1107 210L1110 227L1094 228ZM949 203L941 191L950 199ZM923 224L950 244L912 248ZM1076 285L1063 287L1069 271ZM949 203L933 209L941 191ZM1010 212L989 225L986 217Z'/><path fill='#423024' stroke='#423024' stroke-width='.6' d='M190 520L218 534L215 550ZM570 924L557 935L573 899ZM490 939L508 908L497 941ZM250 630L248 678L204 677ZM838 509L828 478L836 470ZM918 822L961 853L959 861ZM788 380L768 407L777 381ZM1123 361L1113 344L1123 342ZM819 573L807 579L803 564ZM920 556L927 553L928 567ZM894 546L910 554L906 557ZM1034 236L1039 234L1048 253ZM816 591L829 584L825 594ZM1064 442L1032 426L1053 410ZM1051 259L1072 267L1051 260ZM876 536L885 538L884 540Z'/><path fill='#664830' stroke='#664830' stroke-width='.6' d='M218 534L268 556L215 550ZM770 737L744 769L725 725ZM1108 792L1128 803L1102 828ZM669 677L661 719L651 689ZM242 757L246 794L208 775ZM791 648L772 636L796 616ZM789 852L756 895L720 828ZM1064 398L1041 400L1059 376ZM1184 395L1156 393L1161 377ZM974 680L1000 684L974 729ZM809 766L787 793L802 760ZM989 450L1014 451L1008 465ZM547 842L546 850L519 812ZM1184 377L1192 379L1184 395ZM856 595L832 577L864 580ZM912 574L905 595L892 584ZM583 804L562 790L579 792ZM579 792L562 790L592 774ZM596 762L641 789L592 774ZM885 381L875 377L884 379ZM913 475L908 477L912 475ZM887 489L886 504L874 501Z'/><path fill='#5a4224' stroke='#5a4224' stroke-width='.6' d='M218 534L226 509L268 556ZM90 796L67 799L78 791ZM432 586L405 562L426 550ZM1210 339L1227 335L1213 346Z'/><path fill='#544230' stroke='#544230' stroke-width='.6' d='M220 468L223 456L245 473ZM550 0L600 0L599 10ZM354 543L348 557L319 522ZM489 504L467 475L506 455ZM467 475L489 504L476 511ZM129 364L117 383L109 363ZM1193 804L1215 826L1192 832ZM811 536L788 554L783 549ZM809 418L792 452L778 425ZM489 387L461 361L505 379ZM821 562L819 573L803 564ZM1016 257L1013 270L1000 264ZM1033 232L1018 226L1031 226ZM1041 277L1056 283L1045 288ZM874 517L852 536L867 509ZM1020 253L1010 238L1026 252ZM1024 192L1033 187L1021 203Z'/><path fill='#604830' stroke='#604830' stroke-width='.6' d='M226 509L220 468L245 473ZM302 931L358 902L305 942ZM594 693L607 644L623 693ZM62 645L54 687L31 675ZM10 646L20 657L14 656ZM536 666L526 690L493 683ZM1096 728L1136 705L1129 742ZM92 703L118 710L105 727ZM76 666L79 659L108 664ZM312 746L362 729L331 802ZM776 464L798 456L792 476ZM673 901L649 860L681 858ZM262 754L262 749L274 764ZM246 794L262 754L274 764ZM92 703L114 698L118 710ZM506 439L519 447L506 455ZM679 723L641 789L643 726ZM128 814L185 819L166 865ZM832 458L839 466L836 470ZM1486 734L1482 733L1496 730ZM837 437L840 461L832 458ZM1209 315L1207 312L1234 300ZM1090 266L1100 265L1090 280ZM983 203L991 198L986 217ZM929 669L938 680L927 688ZM1167 435L1162 435L1168 410ZM1082 259L1087 227L1097 256ZM908 677L929 669L927 688ZM914 738L908 677L927 688ZM924 664L923 665L923 645ZM943 579L949 585L946 595ZM988 287L1000 312L976 314ZM879 520L886 504L890 523ZM988 271L990 281L979 279Z'/><path fill='#302418' stroke='#302418' stroke-width='.6' d='M220 468L214 451L223 456ZM23 749L13 764L0 750ZM450 442L448 472L445 440ZM546 850L509 881L507 812ZM557 935L515 903L573 899ZM543 940L508 908L515 903ZM508 908L543 940L497 941ZM913 872L918 822L959 861ZM803 564L807 579L794 570ZM1034 236L1048 253L1026 252ZM1288 803L1301 814L1287 813ZM1044 260L1040 268L1026 252ZM947 655L950 651L967 650ZM1033 232L1037 233L1034 236Z'/><path fill='#302a1e' stroke='#302a1e' stroke-width='.6' d='M220 468L184 456L214 451ZM339 368L379 373L330 402ZM1169 319L1163 313L1171 312ZM1079 451L1092 464L1085 466Z'/><path fill='#42362a' stroke='#42362a' stroke-width='.6' d='M214 451L230 375L252 441ZM696 408L734 436L695 417ZM288 359L318 407L259 393ZM1162 296L1176 303L1161 304ZM451 890L460 873L464 902ZM1176 303L1165 310L1161 304ZM1156 278L1146 292L1153 277ZM999 348L1002 364L987 359ZM1168 324L1164 335L1158 337ZM885 538L876 536L885 531Z'/><path fill='#a89678' stroke='#a89678' stroke-width='.6' d='M350 0L400 0L375 24ZM1124 80L1098 85L1119 72Z'/><path fill='#ae9c8a' stroke='#ae9c8a' stroke-width='.6' d='M300 0L306 88L250 0ZM330 33L306 88L300 0ZM1117 185L1135 158L1163 180ZM823 174L824 165L835 169ZM1123 133L1135 148L1101 140ZM912 195L893 191L909 190Z'/><path fill='#c6c0c0' stroke='#c6c0c0' stroke-width='.6' d='M306 88L222 156L223 99ZM165 54L220 51L223 99ZM1231 117L1233 122L1210 126ZM1211 169L1210 168L1245 129ZM849 219L828 240L830 210ZM788 126L783 108L814 104ZM872 152L835 161L832 131Z'/><path fill='#baae9c' stroke='#baae9c' stroke-width='.6' d='M220 51L200 0L250 0ZM849 219L878 228L872 251ZM817 308L845 299L848 323ZM790 277L787 277L794 272Z'/><path fill='#c6c6ba' stroke='#c6c6ba' stroke-width='.6' d='M220 51L306 88L223 99ZM1088 558L1080 557L1098 533ZM1069 552L1062 525L1098 533Z'/><path fill='#a89c8a' stroke='#a89c8a' stroke-width='.6' d='M222 156L241 266L171 264ZM1185 72L1199 70L1206 99ZM781 129L787 137L775 134Z'/><path fill='#48483c' stroke='#48483c' stroke-width='.6' d='M601 269L548 305L534 256ZM1359 472L1355 402L1456 449ZM1345 294L1369 322L1314 300ZM601 269L620 224L622 226ZM1385 371L1315 373L1369 322ZM1385 371L1355 402L1315 373ZM1367 232L1345 294L1273 241ZM682 379L611 323L671 300ZM611 323L577 393L547 317Z'/><path fill='#3c3c30' stroke='#3c3c30' stroke-width='.6' d='M671 300L611 323L601 269ZM611 323L548 305L601 269ZM548 305L611 323L547 317ZM1402 299L1385 371L1369 322Z'/><path fill='#424236' stroke='#424236' stroke-width='.6' d='M657 240L601 269L622 226ZM657 240L671 300L601 269ZM1345 294L1402 299L1369 322ZM1385 371L1402 299L1441 369ZM1385 371L1441 369L1456 449ZM1378 261L1402 299L1345 294ZM577 393L606 407L604 410Z'/><path fill='#b4b4ae' stroke='#b4b4ae' stroke-width='.6' d='M530 184L588 176L534 256ZM850 0L824 10L800 0ZM669 180L760 127L718 197ZM357 215L379 275L357 286ZM1594 246L1600 200L1600 250ZM1501 92L1427 164L1438 99ZM1550 0L1582 47L1551 50ZM1179 144L1166 161L1154 143ZM1232 229L1248 226L1250 231ZM1384 244L1367 232L1387 179ZM1153 126L1155 100L1179 144Z'/><path fill='#b4b4b4' stroke='#b4b4b4' stroke-width='.6' d='M811 12L750 0L800 0ZM1021 36L1050 0L1038 35Z'/><path fill='#c0c0c0' stroke='#c0c0c0' stroke-width='.6' d='M736 19L750 0L811 12ZM306 88L336 51L401 99ZM293 241L357 215L357 286ZM1038 35L1050 0L1085 22ZM1050 0L1021 36L1000 0ZM1599 176L1528 172L1600 150ZM1528 172L1552 124L1600 150ZM1233 122L1250 125L1245 129ZM1279 167L1250 125L1274 112ZM1021 36L1025 37L983 65ZM1211 169L1245 129L1251 169ZM977 165L965 122L982 161ZM1055 138L1025 153L1018 148ZM1059 144L1031 159L1055 138Z'/><path fill='#a8a8a2' stroke='#a8a8a2' stroke-width='.6' d='M700 0L750 0L721 18ZM1025 37L1021 36L1038 35ZM1044 70L1025 37L1038 35ZM1252 443L1259 406L1283 413Z'/><path fill='#4e4236' stroke='#4e4236' stroke-width='.6' d='M700 0L670 26L650 0ZM1131 344L1123 361L1123 342ZM961 632L950 651L923 645ZM919 361L923 347L924 357ZM1168 324L1158 337L1162 316ZM1011 210L1010 212L991 198ZM968 572L975 589L966 584ZM890 536L889 537L887 535Z'/><path fill='#848478' stroke='#848478' stroke-width='.6' d='M670 26L700 0L721 18ZM1441 369L1513 322L1502 404ZM1018 148L1010 164L1003 161Z'/><path fill='#a29c90' stroke='#a29c90' stroke-width='.6' d='M671 59L670 26L721 18ZM386 268L379 275L357 215ZM1066 509L1093 482L1099 498ZM765 119L783 108L771 120ZM1241 419L1252 443L1228 427ZM1108 501L1117 500L1113 506Z'/><path fill='#babab4' stroke='#babab4' stroke-width='.6' d='M512 226L461 229L474 167ZM479 109L497 41L530 112ZM293 241L357 286L292 320ZM620 224L669 180L622 226ZM525 38L604 88L530 112ZM646 69L671 59L662 92ZM1279 167L1367 232L1273 241ZM1600 100L1552 124L1551 50ZM1582 47L1600 100L1551 50ZM1528 172L1427 164L1501 92ZM1384 244L1387 179L1446 226ZM1060 153L1059 144L1078 147Z'/><path fill='#90908a' stroke='#90908a' stroke-width='.6' d='M512 226L530 184L534 256ZM1242 364L1244 340L1315 373Z'/><path fill='#a28a72' stroke='#a28a72' stroke-width='.6' d='M497 41L450 0L500 0ZM450 0L497 41L443 32ZM1106 297L1094 282L1108 283ZM1117 185L1100 176L1135 158ZM1167 508L1180 518L1167 518ZM1119 262L1142 262L1124 280ZM1183 503L1179 506L1170 500ZM992 284L990 281L998 268Z'/><path fill='#4e4836' stroke='#4e4836' stroke-width='.6' d='M599 10L600 0L650 0ZM1596 708L1592 718L1575 696ZM1003 167L995 161L1003 161ZM940 328L940 322L943 326Z'/><path fill='#6c604e' stroke='#6c604e' stroke-width='.6' d='M620 50L599 10L650 0ZM1456 449L1487 468L1468 531ZM103 573L115 557L158 573ZM1123 284L1124 280L1131 286ZM940 322L937 329L929 324ZM1062 452L1079 451L1059 468Z'/><path fill='#7e6c5a' stroke='#7e6c5a' stroke-width='.6' d='M670 26L620 50L650 0ZM835 161L842 166L835 169ZM860 178L863 184L847 189ZM1222 444L1227 449L1218 455ZM1016 572L1011 567L1032 557ZM933 377L932 381L925 370ZM1206 468L1220 475L1210 482Z'/><path fill='#c09c66' stroke='#c09c66' stroke-width='.6' d='M123 958L145 946L150 1000ZM955 926L950 1000L940 928ZM1341 855L1374 879L1301 883ZM1204 934L1154 843L1192 832ZM791 933L750 954L765 924ZM1009 882L1038 894L1031 926ZM1463 746L1504 787L1423 802ZM475 954L500 1000L450 1000ZM1374 879L1378 797L1423 802ZM1301 818L1341 855L1301 883ZM1246 899L1259 828L1301 883ZM1259 828L1301 818L1301 883ZM1234 824L1259 828L1246 899ZM1486 734L1504 787L1463 746ZM1486 734L1496 730L1504 787ZM1046 898L1066 866L1086 922Z'/><path fill='#b49060' stroke='#b49060' stroke-width='.6' d='M83 933L123 958L100 1000ZM1033 868L1066 866L1046 898ZM1364 795L1365 793L1378 797ZM1024 428L1026 452L1014 451ZM1238 544L1204 525L1243 524Z'/><path fill='#42301e' stroke='#42301e' stroke-width='.6' d='M83 933L41 947L45 941ZM214 612L199 617L215 550ZM297 880L302 931L257 915ZM490 783L473 739L528 743ZM684 608L678 639L621 628ZM59 765L90 706L105 727ZM767 528L746 523L757 472ZM670 433L678 440L633 457ZM442 812L487 783L467 831ZM973 805L1027 773L1025 790ZM0 450L3 475L0 500ZM3 475L0 450L15 466ZM89 510L72 557L46 541ZM166 865L185 819L198 851ZM802 588L751 608L765 567ZM767 528L807 529L783 549ZM513 899L546 850L573 899ZM508 908L490 939L466 925ZM213 716L223 709L242 757ZM191 729L213 716L242 757ZM538 503L541 504L526 555ZM541 504L519 447L610 462ZM405 562L404 557L426 550ZM1002 397L1007 385L1013 386ZM512 226L477 266L461 229ZM639 727L604 739L623 693ZM1053 856L1033 868L1031 801ZM516 623L520 634L505 620ZM300 595L304 616L249 599ZM250 630L304 616L293 676ZM1113 344L1110 339L1123 342ZM892 584L877 590L878 568ZM558 760L550 796L528 743ZM832 577L819 573L830 561ZM890 852L918 822L913 872ZM818 550L821 562L803 564ZM1111 346L1113 344L1123 361ZM1033 184L1031 159L1044 185ZM989 225L987 231L970 223Z'/><path fill='#c09660' stroke='#c09660' stroke-width='.6' d='M50 1000L83 933L100 1000ZM1582 957L1600 950L1600 1000ZM1550 1000L1582 957L1600 1000ZM1511 527L1515 602L1468 531ZM424 931L475 954L450 1000ZM500 1000L497 941L540 950Z'/><path fill='#9c7848' stroke='#9c7848' stroke-width='.6' d='M41 947L83 933L50 1000Z'/><path fill='#483024' stroke='#483024' stroke-width='.6' d='M32 885L83 933L45 941ZM1033 227L1033 232L1031 226ZM1020 254L1020 253L1026 252Z'/><path fill='#c69c66' stroke='#c69c66' stroke-width='.6' d='M750 1000L750 954L800 1000ZM750 954L750 1000L700 1000ZM950 1000L955 926L1000 1000ZM1600 950L1582 957L1600 900ZM1308 950L1350 1000L1300 1000ZM1582 957L1551 886L1600 900ZM1038 894L1046 898L1031 926ZM955 926L1009 882L1031 926ZM1450 1000L1433 963L1495 958ZM850 1000L897 933L900 1000ZM818 966L897 933L850 1000ZM1458 880L1374 879L1423 802ZM1458 880L1504 787L1497 876ZM650 1000L652 927L700 1000ZM652 927L650 1000L600 1000ZM818 949L818 966L791 933ZM1378 797L1374 879L1341 855ZM1541 567L1511 527L1570 540Z'/><path fill='#18120c' stroke='#18120c' stroke-width='.6' d='M41 947L33 947L45 941Z'/><path fill='#301e12' stroke='#301e12' stroke-width='.6' d='M45 941L33 947L4 925ZM208 514L218 534L190 520ZM46 541L54 579L29 592ZM765 420L734 436L759 406ZM649 552L688 521L684 608ZM118 710L114 698L131 705ZM803 672L805 673L779 673ZM734 436L778 452L757 472ZM467 475L477 434L506 455ZM859 853L890 852L881 875ZM1033 227L1037 233L1033 232Z'/><path fill='#a2845a' stroke='#a2845a' stroke-width='.6' d='M33 947L41 947L50 1000ZM964 536L967 548L956 544Z'/><path fill='#4e3c30' stroke='#4e3c30' stroke-width='.6' d='M41 383L85 426L26 396ZM79 659L76 666L62 645ZM140 385L117 383L129 364ZM961 387L945 385L952 380ZM934 370L934 375L925 370ZM892 533L890 536L890 532Z'/><path fill='#48361e' stroke='#48361e' stroke-width='.6' d='M191 729L242 757L208 775ZM363 814L391 773L388 798ZM767 717L805 673L836 704ZM118 710L122 721L105 727ZM1138 847L1088 856L1102 828ZM223 709L262 749L242 757ZM649 552L646 549L656 516ZM419 878L424 931L406 934ZM1031 801L1033 868L975 849ZM902 606L884 607L883 596ZM792 452L819 450L798 456ZM818 550L803 564L811 536Z'/><path fill='#362418' stroke='#362418' stroke-width='.6' d='M199 617L158 573L215 550ZM540 660L607 644L594 693ZM778 452L776 464L757 472ZM819 450L826 469L814 469ZM547 842L590 871L546 850ZM870 780L863 783L859 773ZM1040 268L1041 275L1025 274ZM1037 225L1033 227L1031 226Z'/><path fill='#544236' stroke='#544236' stroke-width='.6' d='M15 466L0 448L26 396ZM87 443L85 426L127 433ZM287 570L333 582L327 585ZM1016 286L1017 281L1025 274ZM922 363L930 364L925 370Z'/><path fill='#604e36' stroke='#604e36' stroke-width='.6' d='M85 426L15 466L26 396ZM1037 754L1035 743L1078 760ZM259 393L275 434L252 441ZM393 443L363 433L379 373ZM213 716L191 729L210 712ZM760 360L791 365L777 381ZM1089 357L1099 358L1092 364ZM1365 720L1374 774L1308 767ZM1242 364L1218 368L1237 350ZM856 595L830 583L832 577ZM950 244L951 215L958 244ZM770 298L769 307L739 292ZM1085 221L1078 211L1101 206ZM1085 221L1101 206L1094 228ZM1056 283L1051 260L1069 271ZM880 506L874 517L867 509ZM1015 224L1018 226L1010 225Z'/><path fill='#8a725a' stroke='#8a725a' stroke-width='.6' d='M99 759L78 791L60 777ZM200 682L154 691L164 672ZM222 702L223 709L210 712ZM379 275L431 306L380 333ZM33 777L45 756L51 767ZM168 737L154 770L122 721ZM791 365L791 372L777 381ZM363 628L304 616L327 585ZM1119 102L1102 118L1097 109ZM1093 324L1071 329L1074 318ZM1007 385L1019 375L1013 386ZM1107 210L1101 206L1117 186ZM884 196L861 193L878 186ZM1006 369L1019 375L1007 385ZM1111 346L1114 363L1108 347ZM912 195L908 209L893 191ZM1000 312L996 321L976 314ZM901 523L896 528L890 523Z'/><path fill='#604e3c' stroke='#604e3c' stroke-width='.6' d='M16 614L0 600L29 592ZM3 475L15 466L24 505ZM720 223L760 264L739 292ZM760 264L720 223L768 256ZM822 600L819 594L825 594ZM884 607L880 607L883 596ZM977 165L946 189L934 183ZM970 223L983 203L986 217ZM829 584L830 583L825 594ZM760 264L770 298L739 292ZM987 231L972 247L970 223ZM1051 260L1056 283L1044 268ZM1037 225L1039 217L1043 223ZM1031 159L1033 184L1024 170ZM933 377L934 375L940 382ZM1033 187L1039 217L1021 203ZM1217 466L1220 475L1206 468ZM1017 281L992 284L1013 270ZM964 580L964 575L968 572Z'/><path fill='#7e6654' stroke='#7e6654' stroke-width='.6' d='M30 627L16 614L29 592ZM1007 385L1002 397L998 398ZM861 193L863 184L870 184ZM940 382L945 385L943 387ZM890 532L886 530L890 523ZM896 528L890 532L890 523ZM910 534L901 523L916 526Z'/><path fill='#907854' stroke='#907854' stroke-width='.6' d='M280 939L302 931L305 942ZM1067 796L1037 754L1078 760ZM1592 718L1596 708L1600 750ZM1202 303L1176 303L1184 268ZM1173 330L1192 344L1186 353ZM969 562L967 548L970 550Z'/><path fill='#1e1806' stroke='#1e1806' stroke-width='.6' d='M391 773L363 814L331 802ZM507 812L490 783L519 812ZM1096 728L1085 763L1078 760ZM571 402L604 410L610 462ZM76 563L103 573L87 576Z'/><path fill='#3c2a18' stroke='#3c2a18' stroke-width='.6' d='M370 880L358 902L340 844ZM639 727L651 720L643 726ZM33 947L22 947L4 925ZM746 523L717 603L733 515ZM975 849L961 853L952 821ZM734 436L678 440L695 417ZM582 593L607 644L547 625ZM649 552L684 608L605 588ZM547 744L526 690L573 725ZM970 880L959 861L975 849ZM970 880L921 893L959 861ZM973 805L1031 801L975 849ZM400 690L381 737L386 689ZM646 549L605 588L593 583ZM500 543L449 570L476 511ZM1136 705L1174 735L1129 742ZM352 454L373 457L374 477ZM649 860L649 853L681 858ZM45 756L90 706L59 765ZM715 925L756 895L765 924ZM756 895L715 925L681 858ZM389 627L385 616L432 586ZM478 661L496 649L493 683ZM404 557L405 562L348 557ZM506 439L476 420L511 399ZM443 890L419 878L460 873ZM838 509L868 478L867 509ZM798 456L819 450L814 469ZM1118 395L1123 397L1117 404ZM870 780L871 739L897 764ZM547 842L549 834L590 871ZM562 745L558 760L547 744ZM547 744L558 760L528 743ZM590 748L562 745L573 725ZM666 812L641 789L679 723ZM878 644L923 645L885 673ZM880 607L878 644L862 643ZM832 577L830 583L819 573ZM1006 369L1007 385L988 364ZM900 559L894 546L906 557ZM1124 413L1113 432L1101 416ZM1041 275L1056 283L1041 277Z'/><path fill='#ae9066' stroke='#ae9066' stroke-width='.6' d='M262 815L315 814L314 851ZM854 405L849 409L832 387ZM1204 525L1192 512L1221 497ZM905 502L898 483L908 477Z'/><path fill='#9c785a' stroke='#9c785a' stroke-width='.6' d='M315 814L322 847L314 851ZM768 919L791 933L765 924ZM478 661L453 660L451 615ZM917 431L922 423L928 428ZM946 456L946 436L955 440ZM641 789L666 812L649 853ZM946 436L956 419L955 440ZM1048 581L1049 586L1034 583ZM885 398L898 402L902 409ZM1167 518L1184 531L1163 534ZM1180 518L1184 531L1167 518ZM1198 525L1180 518L1192 512Z'/><path fill='#ae8a66' stroke='#ae8a66' stroke-width='.6' d='M297 880L262 815L314 851ZM17 857L89 864L32 885ZM838 357L846 379L832 387ZM837 437L809 418L822 403ZM946 456L958 468L928 468ZM864 442L865 439L882 439ZM1218 368L1211 367L1213 346Z'/><path fill='#4e361e' stroke='#4e361e' stroke-width='.6' d='M358 902L297 880L314 851ZM642 656L651 689L623 693ZM227 929L237 900L257 915ZM717 603L688 521L733 515ZM432 586L385 616L406 580ZM848 667L876 674L870 694ZM583 804L549 834L550 796ZM1137 367L1123 397L1127 368ZM1210 339L1206 328L1227 335ZM992 252L998 243L1006 249ZM975 589L994 572L978 594ZM990 281L988 287L979 279Z'/><path fill='#241e0c' stroke='#241e0c' stroke-width='.6' d='M297 880L358 902L302 931ZM340 844L373 819L383 858ZM789 478L767 528L757 472ZM115 557L72 557L112 531ZM448 472L450 442L467 475ZM519 447L571 402L610 462ZM326 721L344 702L359 716Z'/><path fill='#60422a' stroke='#60422a' stroke-width='.6' d='M210 886L166 865L198 851ZM210 886L179 921L166 865ZM179 921L227 929L200 946ZM669 677L651 689L668 668ZM1000 684L984 737L974 729ZM590 871L588 806L649 853ZM848 667L862 643L876 674ZM1137 367L1134 403L1123 397ZM1184 395L1192 379L1207 401ZM878 644L884 607L902 606ZM789 852L769 800L798 807ZM1035 635L1031 596L1062 594ZM1209 315L1207 320L1207 312ZM1055 658L1070 663L1065 668Z'/><path fill='#302412' stroke='#302412' stroke-width='.6' d='M228 933L227 929L257 915ZM642 656L678 639L668 668ZM651 689L651 720L623 693ZM218 534L208 514L226 509ZM32 385L41 383L26 396ZM20 657L62 645L31 675ZM323 814L363 814L340 844ZM633 457L678 440L676 480ZM734 436L743 472L676 480ZM726 702L767 717L725 725ZM507 812L509 881L467 831ZM108 664L122 657L138 669ZM607 644L540 660L547 625ZM421 497L448 472L476 511ZM550 796L490 783L528 743ZM114 698L108 664L138 669ZM609 409L676 423L670 433ZM1156 278L1163 279L1162 296ZM807 579L816 591L802 588Z'/><path fill='#4e3624' stroke='#4e3624' stroke-width='.6' d='M227 929L228 933L225 945ZM651 689L642 656L668 668ZM14 656L20 657L31 675ZM767 528L783 550L765 567ZM783 550L767 528L783 549ZM746 523L767 528L765 567ZM1167 787L1116 752L1129 742ZM799 480L798 456L814 469ZM453 660L389 627L451 615ZM400 690L389 627L453 660ZM788 866L830 882L818 918ZM581 892L570 924L573 899ZM1053 410L1041 400L1064 398ZM819 573L821 562L830 561ZM863 783L870 780L867 788ZM641 789L596 762L604 739ZM927 688L938 680L935 697ZM1114 363L1111 346L1123 361ZM1112 380L1114 363L1127 368ZM943 579L935 578L939 566ZM874 517L879 520L876 531Z'/><path fill='#180c0c' stroke='#180c0c' stroke-width='.6' d='M280 939L228 933L257 915Z'/><path fill='#967854' stroke='#967854' stroke-width='.6' d='M89 864L83 933L32 885ZM173 356L163 302L178 358ZM163 302L229 318L178 358ZM210 886L237 900L227 929ZM791 933L768 919L818 918ZM472 686L400 690L453 660ZM496 649L478 661L451 615ZM497 941L543 940L540 950ZM730 782L745 791L720 828ZM1259 828L1234 824L1240 823ZM879 210L880 207L892 226ZM666 812L730 782L720 828ZM1032 426L1058 452L1040 459ZM956 419L941 417L952 409ZM1083 171L1069 165L1082 153ZM916 428L913 426L922 423ZM909 222L912 248L892 226ZM909 222L923 224L912 248ZM912 248L901 257L892 226Z'/><path fill='#301e18' stroke='#301e18' stroke-width='.6' d='M788 554L794 570L765 567ZM803 672L791 648L810 669ZM1079 451L1064 442L1080 447Z'/><path fill='#543c24' stroke='#543c24' stroke-width='.6' d='M767 717L770 737L725 725ZM678 639L701 613L719 635ZM751 608L717 603L765 567ZM605 588L684 608L621 628ZM432 586L449 570L446 584ZM1168 675L1136 705L1106 664ZM947 774L939 739L974 729ZM275 434L273 452L252 441ZM398 510L421 497L413 518ZM984 737L973 805L947 774ZM1057 801L1067 796L1102 828ZM496 649L520 634L536 666ZM984 737L1041 702L1035 743ZM477 266L450 251L461 229ZM868 478L838 509L836 470ZM941 819L918 822L932 816ZM924 805L870 780L897 764ZM304 616L250 630L249 599ZM1090 266L1082 259L1097 256ZM935 578L928 567L939 566ZM878 644L880 607L884 607ZM862 643L841 661L829 652ZM938 680L968 677L935 697ZM1018 393L1004 411L1002 397ZM992 252L1006 249L1000 264ZM880 506L886 504L879 520ZM994 572L1009 599L978 594ZM1018 226L1006 231L1010 225Z'/><path fill='#7e603c' stroke='#7e603c' stroke-width='.6' d='M782 742L770 737L767 717ZM287 570L268 556L319 522ZM570 924L652 927L570 959ZM246 794L274 764L262 815ZM1456 712L1426 751L1381 674ZM106 929L132 949L123 958ZM250 630L235 610L249 599ZM890 852L859 853L865 836ZM1065 668L1081 675L1065 714ZM1174 557L1175 541L1176 555ZM923 224L923 221L938 218ZM849 409L860 441L837 437ZM837 437L859 442L856 456ZM994 572L991 563L1011 567Z'/><path fill='#3c3624' stroke='#3c3624' stroke-width='.6' d='M735 369L777 381L759 406ZM103 573L94 598L87 576Z'/><path fill='#544e3c' stroke='#544e3c' stroke-width='.6' d='M729 387L735 369L759 406ZM1575 696L1555 723L1535 704ZM1085 466L1092 464L1093 482Z'/><path fill='#785436' stroke='#785436' stroke-width='.6' d='M668 668L678 639L719 635ZM246 794L223 817L208 775ZM1218 414L1204 412L1215 411ZM466 925L490 939L475 954ZM929 781L924 805L897 764ZM250 630L232 618L235 610ZM934 534L924 523L932 520ZM1137 367L1156 393L1134 403ZM865 439L860 441L872 421ZM860 441L849 409L872 421ZM1083 171L1070 191L1069 165Z'/><path fill='#423018' stroke='#423018' stroke-width='.6' d='M678 639L642 656L621 628ZM171 944L179 921L200 946ZM756 895L768 919L765 924ZM824 501L838 509L821 532ZM924 805L918 822L867 788ZM923 645L908 677L885 673Z'/><path fill='#3c2a12' stroke='#3c2a12' stroke-width='.6' d='M701 613L717 603L719 635ZM262 749L262 754L242 757ZM227 704L262 749L223 709ZM1100 265L1090 266L1097 256Z'/><path fill='#241e12' stroke='#241e12' stroke-width='.6' d='M473 739L485 706L528 743ZM362 729L391 773L331 802ZM794 570L802 588L765 567ZM500 543L538 503L526 555ZM103 573L76 563L115 557ZM476 420L481 392L511 399ZM453 393L481 392L476 420ZM1124 413L1101 416L1117 404ZM1092 464L1110 456L1105 466ZM961 585L964 580L966 584Z'/><path fill='#846648' stroke='#846648' stroke-width='.6' d='M485 706L473 739L445 738ZM642 656L607 644L621 628ZM607 644L642 656L623 693ZM1168 675L1106 664L1146 617ZM815 612L791 648L796 616ZM1228 413L1218 414L1226 412ZM557 935L570 924L570 959ZM540 660L520 634L547 625ZM939 566L930 550L956 544ZM185 819L215 830L198 851ZM1156 393L1137 367L1156 377ZM1160 578L1174 557L1169 580ZM1286 778L1285 791L1269 775ZM1083 171L1100 176L1085 184ZM1242 788L1246 813L1214 792ZM1009 599L1014 582L1024 594ZM1202 321L1206 328L1203 328Z'/><path fill='#8a6642' stroke='#8a6642' stroke-width='.6' d='M751 608L757 642L719 635ZM442 812L392 770L445 738ZM769 775L770 737L782 742ZM978 415L968 426L957 412ZM921 598L905 595L918 579ZM880 207L879 210L870 208ZM813 852L833 856L830 882ZM922 580L921 598L918 579ZM946 595L951 600L921 598ZM859 442L860 441L864 442Z'/><path fill='#967248' stroke='#967248' stroke-width='.6' d='M757 642L731 692L719 635ZM1187 536L1198 525L1198 545Z'/><path fill='#7e5a3c' stroke='#7e5a3c' stroke-width='.6' d='M731 692L757 642L779 673ZM661 719L679 723L643 726ZM287 570L249 599L268 556ZM179 921L167 924L150 901ZM592 774L641 789L588 806ZM1156 393L1157 403L1143 405ZM836 530L833 544L833 530ZM935 578L946 595L921 598ZM905 595L912 574L918 579ZM919 578L922 580L918 579ZM1207 364L1193 377L1183 366ZM994 572L975 589L986 564Z'/><path fill='#5a3c24' stroke='#5a3c24' stroke-width='.6' d='M757 642L772 636L779 673ZM1108 283L1094 282L1106 277ZM1242 788L1234 714L1269 775ZM935 697L974 680L974 729ZM871 739L914 738L897 764ZM751 815L769 800L789 852ZM1079 656L1035 635L1062 594ZM920 574L919 578L912 574ZM925 579L920 574L928 567ZM973 597L1009 599L961 632Z'/><path fill='#6c4e36' stroke='#6c4e36' stroke-width='.6' d='M563 550L570 580L530 573ZM358 902L381 924L305 942ZM300 595L249 599L287 570ZM1215 826L1193 804L1214 792ZM824 501L821 532L807 529ZM398 510L392 475L409 474ZM1184 377L1184 395L1161 377ZM924 523L923 538L916 526ZM841 661L810 669L829 652ZM841 661L848 667L810 669ZM596 762L590 748L604 739ZM1119 262L1129 242L1142 262ZM1206 328L1210 339L1203 328ZM886 504L901 523L890 523Z'/><path fill='#544224' stroke='#544224' stroke-width='.6' d='M678 639L684 608L701 613Z'/><path fill='#181806' stroke='#181806' stroke-width='.6' d='M363 814L373 819L340 844Z'/><path fill='#7e6042' stroke='#7e6042' stroke-width='.6' d='M526 555L563 550L530 573ZM119 910L89 864L106 860ZM89 864L119 910L83 933ZM223 817L185 819L208 775ZM249 599L235 610L215 550ZM367 489L398 510L354 543ZM464 588L500 543L530 573ZM581 892L590 871L652 927ZM520 634L516 623L547 625ZM923 538L924 523L934 534ZM863 783L867 788L839 804ZM837 437L856 456L840 461ZM891 368L886 383L886 374ZM1014 422L1018 393L1033 414ZM861 193L884 196L870 208ZM1083 171L1085 151L1100 176ZM886 383L885 381L886 374ZM1203 328L1210 339L1192 344ZM1193 377L1192 379L1184 377ZM908 275L901 257L913 255ZM991 563L989 562L989 560ZM1113 433L1110 456L1080 447Z'/><path fill='#ccd2d2' stroke='#ccd2d2' stroke-width='.6' d='M357 215L381 176L428 212ZM867 22L943 56L884 95ZM967 98L973 55L983 65ZM967 98L964 113L926 109Z'/><path fill='#908472' stroke='#908472' stroke-width='.6' d='M386 268L357 215L428 212ZM1146 292L1132 285L1136 282Z'/><path fill='#a2a89c' stroke='#a2a89c' stroke-width='.6' d='M1569 396L1600 400L1600 437ZM1594 246L1575 287L1526 260ZM1259 264L1252 319L1234 300Z'/><path fill='#96908a' stroke='#96908a' stroke-width='.6' d='M1591 330L1600 300L1600 350ZM1106 467L1112 461L1119 476Z'/><path fill='#9c9c90' stroke='#9c9c90' stroke-width='.6' d='M1600 300L1591 330L1575 287ZM1259 406L1278 395L1283 413ZM951 344L943 326L946 323ZM967 333L951 344L946 323Z'/><path fill='#a2a8a2' stroke='#a2a8a2' stroke-width='.6' d='M1591 330L1513 322L1575 287Z'/><path fill='#a2a2a2' stroke='#a2a2a2' stroke-width='.6' d='M1513 322L1591 330L1569 396Z'/><path fill='#9c846c' stroke='#9c846c' stroke-width='.6' d='M1423 54L1505 52L1438 99ZM525 38L497 41L500 0ZM33 777L67 799L29 807ZM1170 231L1161 234L1145 224ZM1160 238L1161 234L1170 231ZM1118 282L1108 283L1106 277ZM1071 329L1041 309L1074 318ZM1019 391L1019 389L1030 387ZM898 331L864 331L873 310ZM1195 497L1205 490L1221 497ZM791 305L777 302L796 294ZM992 284L998 268L1013 270ZM1005 230L1006 231L998 243Z'/><path fill='#9c907e' stroke='#9c907e' stroke-width='.6' d='M1505 52L1450 0L1500 0Z'/><path fill='#a29072' stroke='#a29072' stroke-width='.6' d='M1450 0L1505 52L1423 54ZM989 469L978 475L981 458ZM1197 182L1205 199L1195 203ZM1135 158L1100 176L1101 140ZM883 281L896 289L888 291ZM883 281L893 270L896 289ZM796 294L817 308L801 316Z'/><path fill='#a8a29c' stroke='#a8a29c' stroke-width='.6' d='M1550 0L1505 52L1500 0ZM1222 266L1259 264L1234 300ZM1242 368L1242 364L1278 395Z'/><path fill='#9c9084' stroke='#9c9084' stroke-width='.6' d='M1505 52L1550 0L1551 50ZM1226 390L1242 368L1259 406ZM818 155L797 145L832 131ZM797 145L790 131L832 131ZM1205 199L1205 183L1217 200ZM1252 443L1233 459L1229 447Z'/><path fill='#606054' stroke='#606054' stroke-width='.6' d='M1315 373L1252 319L1314 300ZM1297 466L1305 466L1327 496ZM1319 460L1359 472L1351 484Z'/><path fill='#78786c' stroke='#78786c' stroke-width='.6' d='M1487 468L1456 449L1502 404ZM1513 322L1441 369L1440 295Z'/><path fill='#90968a' stroke='#90968a' stroke-width='.6' d='M1545 491L1487 468L1502 404Z'/><path fill='#726c54' stroke='#726c54' stroke-width='.6' d='M1359 472L1424 526L1351 484Z'/><path fill='#66604e' stroke='#66604e' stroke-width='.6' d='M1424 526L1359 472L1456 449ZM1132 307L1112 306L1123 284Z'/><path fill='#6c6c60' stroke='#6c6c60' stroke-width='.6' d='M1456 449L1441 369L1502 404ZM1283 413L1278 395L1315 373Z'/><path fill='#4e4e48' stroke='#4e4e48' stroke-width='.6' d='M1273 241L1345 294L1314 300Z'/><path fill='#c0baae' stroke='#c0baae' stroke-width='.6' d='M1209 110L1219 110L1210 126ZM1165 49L1150 0L1200 0ZM867 284L848 256L872 251ZM1017 531L1045 555L1032 557ZM1062 525L1045 555L1051 522ZM930 364L955 354L934 370ZM1119 476L1112 461L1132 472Z'/><path fill='#a89c90' stroke='#a89c90' stroke-width='.6' d='M1219 110L1209 110L1206 99ZM791 266L786 266L768 256ZM1210 205L1210 203L1217 200ZM1208 171L1202 167L1210 168Z'/><path fill='#96846c' stroke='#96846c' stroke-width='.6' d='M1219 110L1235 71L1236 110ZM1145 224L1117 186L1163 180ZM1248 78L1255 116L1236 110ZM1384 112L1367 103L1423 54ZM878 186L861 193L870 184ZM1199 70L1209 77L1206 99ZM937 306L961 309L946 323ZM1192 489L1195 497L1188 491ZM1183 503L1170 500L1188 491ZM950 257L972 267L952 268Z'/><path fill='#d2baa2' stroke='#d2baa2' stroke-width='.6' d='M1300 0L1300 57L1288 10ZM1300 57L1285 11L1288 10ZM1235 20L1285 11L1300 57ZM1350 0L1300 57L1300 0ZM1235 20L1204 53L1200 0ZM1248 78L1235 20L1300 57ZM1050 500L1013 503L1045 484Z'/><path fill='#c69c60' stroke='#c69c60' stroke-width='.6' d='M1500 1000L1450 1000L1495 958ZM1582 957L1550 1000L1495 958ZM1350 1000L1356 951L1400 1000ZM1356 951L1433 963L1400 1000Z'/><path fill='#3c2a1e' stroke='#3c2a1e' stroke-width='.6' d='M1154 843L1168 804L1192 832ZM122 657L122 648L138 669ZM159 386L140 385L149 361ZM122 721L109 765L105 727ZM1033 868L1009 882L975 849ZM765 420L778 452L734 436ZM1057 801L1053 856L1031 801ZM922 363L919 361L924 357ZM1064 442L1060 452L1058 452ZM910 554L901 535L910 534Z'/><path fill='#c0a88a' stroke='#c0a88a' stroke-width='.6' d='M1570 540L1545 491L1600 500ZM1367 103L1300 57L1382 18ZM1298 89L1248 78L1300 57ZM981 458L978 475L963 458Z'/><path fill='#a27842' stroke='#a27842' stroke-width='.6' d='M1286 558L1369 610L1275 618ZM1442 660L1381 674L1424 610ZM1264 566L1279 533L1286 558Z'/><path fill='#ae844e' stroke='#ae844e' stroke-width='.6' d='M1286 558L1353 526L1369 610Z'/><path fill='#8a6036' stroke='#8a6036' stroke-width='.6' d='M1208 596L1248 569L1275 618ZM1248 569L1200 566L1244 555Z'/><path fill='#c6a266' stroke='#c6a266' stroke-width='.6' d='M1551 886L1582 957L1495 958ZM1374 879L1433 963L1356 951ZM1521 734L1555 723L1572 812ZM818 966L850 1000L800 1000ZM750 954L818 966L800 1000ZM791 933L818 966L750 954Z'/><path fill='#4e4230' stroke='#4e4230' stroke-width='.6' d='M159 386L230 375L171 422ZM760 360L777 381L735 369ZM678 440L676 423L695 417ZM233 357L288 359L253 371ZM54 579L94 598L62 645ZM143 671L154 691L131 705ZM348 557L333 582L319 522ZM979 179L982 161L991 181ZM1133 282L1132 285L1124 280ZM919 361L922 363L925 370ZM1374 774L1365 793L1308 767ZM1337 810L1301 814L1308 767ZM973 597L975 589L978 594ZM1108 481L1105 489L1093 482ZM1064 196L1078 211L1060 226ZM1018 177L1033 184L1016 182Z'/><path fill='#967e60' stroke='#967e60' stroke-width='.6' d='M152 524L172 532L170 543ZM51 767L59 765L60 777ZM183 729L168 737L154 691ZM1539 722L1555 723L1521 734ZM110 796L128 814L125 819ZM850 549L860 561L858 568ZM989 450L991 462L981 458ZM924 523L925 515L932 520ZM1071 329L1067 356L1056 342ZM1047 573L1056 558L1059 568ZM919 361L891 368L896 356ZM888 291L896 289L893 293ZM949 203L970 223L951 215ZM1194 444L1200 457L1197 463ZM1166 437L1162 435L1167 435ZM1054 295L1063 287L1074 318ZM1076 273L1076 285L1069 271ZM901 257L893 270L896 259ZM992 252L979 265L971 251ZM968 572L967 566L976 560Z'/><path fill='#846c4e' stroke='#846c4e' stroke-width='.6' d='M152 524L155 549L141 553ZM222 702L248 678L248 688ZM431 306L379 275L386 268ZM227 704L223 709L222 702ZM293 676L248 688L250 678ZM109 765L110 796L90 796ZM293 676L304 616L363 628ZM1098 338L1101 343L1089 357ZM1080 557L1088 558L1062 594ZM1071 329L1093 324L1098 338ZM1047 573L1028 578L1032 557ZM1028 578L1014 582L1016 572ZM1009 599L1006 576L1014 582ZM920 283L908 275L927 263ZM938 264L920 283L927 263ZM1015 319L1021 315L1025 327Z'/><path fill='#846c5a' stroke='#846c5a' stroke-width='.6' d='M126 506L152 524L112 531ZM829 154L829 160L818 155ZM1221 497L1205 490L1210 482Z'/><path fill='#483c2a' stroke='#483c2a' stroke-width='.6' d='M230 375L259 393L252 441ZM1575 696L1592 718L1578 723ZM943 326L940 322L946 323ZM15 466L0 450L0 448ZM72 557L89 510L112 531ZM768 407L765 420L759 406ZM328 440L275 434L318 407ZM1555 723L1539 722L1535 704ZM318 407L309 359L330 402ZM489 387L505 379L511 398ZM511 399L489 387L511 398ZM481 392L489 387L511 399ZM476 420L477 434L450 442ZM985 191L979 179L991 181ZM1015 200L1006 192L1016 182Z'/><path fill='#2a1e18' stroke='#2a1e18' stroke-width='.6' d='M259 393L230 375L253 371Z'/><path fill='#ba9678' stroke='#ba9678' stroke-width='.6' d='M56 292L47 370L0 350ZM29 807L17 857L0 850ZM930 426L930 410L941 417Z'/><path fill='#a2846c' stroke='#a2846c' stroke-width='.6' d='M47 370L32 385L0 350ZM241 266L293 241L292 320ZM1102 118L1119 102L1107 125ZM878 228L858 209L870 208ZM858 209L861 193L870 208ZM1000 312L1016 286L1025 302ZM1006 576L1011 567L1016 572Z'/><path fill='#b4a89c' stroke='#b4a89c' stroke-width='.6' d='M293 241L241 266L222 156ZM368 324L379 275L380 333ZM767 215L791 266L768 256ZM1190 62L1161 65L1165 49ZM1202 167L1200 174L1166 161ZM1170 500L1168 505L1151 509ZM1098 85L1072 83L1085 22ZM1117 500L1119 476L1132 472ZM1136 80L1158 87L1155 100ZM1158 87L1136 80L1161 65ZM836 286L845 299L817 308Z'/><path fill='#9c7e5a' stroke='#9c7e5a' stroke-width='.6' d='M241 266L229 318L171 264ZM1067 796L1027 773L1037 754ZM1106 664L1106 600L1146 617ZM813 351L838 357L832 387ZM1173 330L1203 328L1192 344ZM930 410L923 420L924 398ZM930 410L943 387L952 409Z'/><path fill='#a88466' stroke='#a88466' stroke-width='.6' d='M229 318L241 266L292 320ZM924 398L898 402L926 389ZM913 426L923 420L922 423ZM859 442L864 442L856 456Z'/><path fill='#42423c' stroke='#42423c' stroke-width='.6' d='M671 300L688 232L739 292ZM1355 402L1385 371L1456 449ZM1367 232L1378 261L1345 294Z'/><path fill='#42483c' stroke='#42483c' stroke-width='.6' d='M657 240L688 232L671 300Z'/><path fill='#a8a89c' stroke='#a8a89c' stroke-width='.6' d='M760 127L669 180L730 85ZM1242 368L1278 395L1259 406ZM1136 509L1148 507L1151 509Z'/><path fill='#aea89c' stroke='#aea89c' stroke-width='.6' d='M497 41L525 38L530 112ZM646 69L620 50L670 26ZM1552 124L1501 92L1551 50ZM1185 72L1190 62L1196 67ZM1135 158L1135 148L1154 143ZM1255 116L1250 125L1236 110ZM1146 292L1162 296L1161 304ZM1384 112L1423 54L1438 99ZM829 154L818 155L832 131ZM1136 120L1153 126L1135 148ZM1099 509L1108 501L1113 506ZM836 286L817 308L825 280Z'/><path fill='#907e66' stroke='#907e66' stroke-width='.6' d='M620 50L525 38L599 10ZM164 672L143 671L183 650ZM1202 60L1190 62L1204 53ZM1110 339L1098 338L1110 328ZM1211 238L1193 224L1206 217ZM863 184L861 193L847 189ZM1100 265L1119 262L1106 277Z'/><path fill='#bab4ae' stroke='#bab4ae' stroke-width='.6' d='M525 38L620 50L604 88ZM379 275L368 324L357 286ZM1298 89L1279 167L1274 112ZM767 215L771 198L784 193ZM771 198L767 215L718 197ZM780 188L771 198L760 160ZM1179 144L1155 100L1209 110ZM1202 167L1166 161L1179 144ZM1158 87L1185 72L1206 99ZM1155 100L1158 87L1206 99ZM775 134L787 137L760 160ZM787 137L797 145L760 160ZM1170 500L1148 507L1132 472Z'/><path fill='#aea8a2' stroke='#aea8a2' stroke-width='.6' d='M646 69L670 26L671 59Z'/><path fill='#c6ccc6' stroke='#c6ccc6' stroke-width='.6' d='M604 88L646 69L662 92Z'/><path fill='#1e1200' stroke='#1e1200' stroke-width='.6' d='M22 947L33 947L20 948Z'/><path fill='#a88460' stroke='#a88460' stroke-width='.6' d='M163 302L162 301L171 264ZM297 880L229 858L262 815ZM902 409L882 439L872 421ZM1008 465L1014 451L1025 459ZM1173 358L1165 349L1186 353ZM846 379L846 361L852 370ZM1088 558L1141 574L1106 600Z'/><path fill='#96724e' stroke='#96724e' stroke-width='.6' d='M229 318L163 302L171 264ZM867 788L865 836L839 804ZM756 895L789 852L788 866ZM216 844L228 861L198 851ZM228 861L216 844L229 858ZM867 788L918 822L865 836ZM745 791L751 815L720 828ZM1192 344L1207 364L1186 353ZM878 228L879 210L892 226ZM215 842L215 830L218 837ZM1183 366L1173 358L1186 353ZM882 439L865 439L872 421ZM1175 541L1174 557L1163 534ZM1049 586L1048 581L1062 594ZM943 387L930 410L924 398ZM1143 408L1153 434L1124 413ZM1153 434L1143 408L1157 403Z'/><path fill='#b49672' stroke='#b49672' stroke-width='.6' d='M129 364L163 302L149 361ZM86 315L47 370L56 292ZM129 364L86 315L163 302ZM788 380L832 387L822 403ZM809 418L788 380L822 403ZM791 365L813 351L791 372ZM840 461L856 456L858 461ZM943 387L964 395L952 409ZM898 402L886 383L926 389ZM924 398L923 420L902 409Z'/><path fill='#786042' stroke='#786042' stroke-width='.6' d='M248 688L248 678L250 678ZM191 729L183 729L210 712ZM1204 412L1184 395L1207 401ZM802 588L816 597L796 616ZM1100 265L1094 282L1090 280ZM328 440L347 426L352 454ZM1059 376L1067 356L1092 364ZM1160 250L1160 238L1171 246ZM819 450L837 437L832 458ZM1168 410L1185 432L1173 436ZM1143 408L1124 413L1134 403ZM1193 377L1209 376L1207 380ZM927 263L908 275L913 255ZM1079 190L1070 191L1083 171Z'/><path fill='#847254' stroke='#847254' stroke-width='.6' d='M248 678L222 702L204 677ZM346 571L333 582L348 557ZM1197 182L1200 174L1206 180Z'/><path fill='#786048' stroke='#786048' stroke-width='.6' d='M35 521L89 510L46 541ZM119 471L184 456L149 514ZM126 506L96 509L104 477ZM328 440L335 494L297 462ZM29 775L33 777L9 785ZM109 765L90 796L99 759ZM791 372L788 380L777 381ZM1067 356L1089 357L1092 364ZM1160 238L1153 251L1145 224ZM1346 806L1337 810L1308 767ZM933 209L917 190L923 186ZM1206 468L1200 458L1218 455ZM886 504L880 506L874 501ZM787 277L777 302L770 298ZM998 243L1010 238L1006 249ZM950 244L949 251L927 263ZM990 281L992 284L988 287Z'/><path fill='#725a42' stroke='#725a42' stroke-width='.6' d='M35 521L0 550L24 505ZM126 506L119 471L149 514ZM20 657L10 646L30 627ZM125 819L166 865L106 860ZM1018 393L1041 400L1033 414ZM1511 725L1508 660L1535 704ZM1228 427L1222 444L1219 426ZM1110 227L1107 210L1127 225ZM1101 206L1107 210L1094 228ZM874 545L886 546L878 568ZM979 265L988 271L979 279ZM1060 226L1087 227L1082 259ZM947 655L938 680L929 669ZM938 680L947 655L968 677ZM972 267L979 265L979 279ZM1063 287L1056 283L1069 271ZM1060 153L1060 171L1058 173ZM949 251L938 264L927 263ZM989 225L1005 230L987 231Z'/><path fill='#8a7260' stroke='#8a7260' stroke-width='.6' d='M3 475L24 505L0 500ZM154 691L168 737L131 705ZM1195 497L1192 489L1205 490ZM1119 262L1100 265L1097 256ZM1129 242L1119 262L1108 234ZM964 575L965 571L968 572Z'/><path fill='#7e6648' stroke='#7e6648' stroke-width='.6' d='M15 466L87 443L24 505ZM90 796L125 819L106 860ZM361 688L293 676L363 628ZM1067 796L1057 801L1027 773ZM431 306L410 350L380 333ZM816 597L822 600L815 612ZM1193 224L1193 211L1206 217ZM1482 733L1486 734L1463 746ZM887 362L886 362L896 356ZM1085 199L1079 190L1085 184Z'/><path fill='#604836' stroke='#604836' stroke-width='.6' d='M87 443L89 510L24 505ZM76 666L54 687L62 645ZM167 924L179 921L171 944ZM150 901L167 924L145 946ZM815 612L862 643L829 652ZM863 783L831 799L859 773ZM1066 866L1053 856L1088 856ZM876 674L878 644L885 673ZM923 538L910 534L916 526ZM985 191L983 203L971 185ZM979 179L985 191L971 185ZM1006 249L1016 257L1000 264ZM1039 217L1031 226L1021 203Z'/><path fill='#6c5a48' stroke='#6c5a48' stroke-width='.6' d='M119 471L126 506L104 477ZM461 229L450 251L428 212ZM1226 394L1237 417L1228 413ZM1039 234L1060 226L1048 253ZM895 563L900 559L912 574ZM1044 185L1031 159L1058 173ZM1233 472L1245 474L1221 497ZM1233 467L1220 475L1217 466Z'/><path fill='#907e60' stroke='#907e60' stroke-width='.6' d='M158 573L115 557L141 553ZM1200 457L1213 449L1218 455ZM1106 96L1124 80L1119 102ZM896 289L920 283L897 300ZM998 243L1006 231L1010 238Z'/><path fill='#241806' stroke='#241806' stroke-width='.6' d='M122 721L118 710L131 705ZM526 690L485 706L493 683ZM1079 723L1096 728L1078 760Z'/><path fill='#664e3c' stroke='#664e3c' stroke-width='.6' d='M2 698L30 741L0 700ZM293 676L361 688L344 702ZM769 307L769 327L739 292ZM991 198L1010 212L986 217ZM1301 814L1301 818L1287 813ZM945 385L961 387L943 387ZM874 517L864 540L852 536Z'/><path fill='#5a4830' stroke='#5a4830' stroke-width='.6' d='M2 698L14 656L31 675ZM200 682L164 672L183 650ZM765 420L768 407L778 425ZM485 706L472 686L493 683ZM792 452L798 456L776 464ZM1053 856L1066 866L1033 868ZM1113 344L1110 346L1110 339ZM856 595L877 590L880 607ZM953 192L946 189L971 185ZM1010 164L1018 177L1003 167ZM1010 238L1018 226L1034 236ZM973 286L988 287L976 314ZM1070 191L1079 190L1079 205Z'/><path fill='#3c2418' stroke='#3c2418' stroke-width='.6' d='M0 650L2 698L0 700ZM1033 187L1033 184L1044 185Z'/><path fill='#543c30' stroke='#543c30' stroke-width='.6' d='M14 656L2 698L0 650Z'/><path fill='#7e6048' stroke='#7e6048' stroke-width='.6' d='M54 687L33 688L31 675ZM1067 796L1085 763L1108 792ZM1085 763L1067 796L1078 760ZM141 387L154 409L123 405ZM51 767L45 756L59 765ZM821 532L811 536L807 529ZM1084 137L1102 118L1101 140ZM886 383L885 398L878 390ZM1207 320L1202 321L1207 312ZM1145 224L1129 242L1127 225ZM1153 251L1129 242L1145 224ZM1207 320L1206 328L1202 321Z'/><path fill='#846042' stroke='#846042' stroke-width='.6' d='M90 706L54 687L75 680ZM731 692L669 677L668 668ZM870 694L868 732L836 704ZM929 781L897 764L913 764ZM1188 430L1184 395L1204 412ZM588 806L641 789L649 853ZM813 852L831 799L839 804ZM1134 403L1156 393L1143 405ZM1184 377L1176 365L1183 366ZM922 580L925 579L921 598ZM933 209L949 203L938 218Z'/><path fill='#8a6c4e' stroke='#8a6c4e' stroke-width='.6' d='M33 688L54 687L30 741ZM54 687L90 706L30 741ZM89 864L90 796L106 860ZM419 878L381 924L370 880ZM520 634L540 660L536 666ZM865 560L860 561L864 554ZM937 451L930 454L928 428ZM871 385L878 390L854 405ZM886 362L882 369L881 369ZM882 369L882 370L881 369ZM949 203L951 215L938 218ZM1096 422L1080 447L1071 435ZM1209 376L1193 377L1207 364ZM1163 596L1141 574L1160 578ZM1142 262L1129 242L1153 251ZM1015 319L1012 318L1021 315Z'/><path fill='#72543c' stroke='#72543c' stroke-width='.6' d='M76 666L108 664L75 680ZM381 924L358 902L370 880ZM237 900L297 880L257 915ZM487 783L442 812L445 738ZM381 737L400 690L445 738ZM404 557L348 557L354 543ZM328 440L352 454L335 494ZM1027 773L984 737L1035 743ZM1128 803L1145 814L1102 828ZM443 260L431 306L386 268ZM866 576L864 580L858 568ZM831 799L813 852L798 807ZM1100 176L1101 206L1085 184ZM1085 151L1084 137L1101 140ZM1246 813L1234 824L1214 792ZM857 544L864 554L850 549ZM950 244L927 263L912 248ZM901 257L912 248L913 255ZM1064 196L1046 189L1058 173ZM1070 191L1064 196L1058 173Z'/><path fill='#7e5a42' stroke='#7e5a42' stroke-width='.6' d='M54 687L76 666L75 680Z'/><path fill='#78664e' stroke='#78664e' stroke-width='.6' d='M10 646L14 656L0 650ZM1110 227L1108 234L1094 228ZM1365 793L1346 806L1308 767ZM874 545L884 540L886 546ZM1085 221L1087 227L1060 226ZM1087 227L1085 221L1094 228ZM1056 283L1054 295L1045 288ZM1056 283L1063 287L1054 295ZM971 251L950 257L958 244ZM998 243L992 252L987 231Z'/><path fill='#906c48' stroke='#906c48' stroke-width='.6' d='M391 773L442 812L388 798ZM679 723L726 702L709 731ZM570 580L531 604L530 573ZM665 902L590 871L649 860ZM216 844L218 837L229 858ZM215 830L185 819L223 817ZM813 852L789 852L798 807ZM1207 364L1192 344L1213 346ZM216 844L215 842L218 837ZM956 419L952 409L957 412ZM1049 586L1031 596L1034 583ZM864 442L860 441L865 439Z'/><path fill='#846642' stroke='#846642' stroke-width='.6' d='M373 819L442 812L383 858ZM531 604L505 620L530 573ZM392 770L442 812L391 773ZM916 757L939 739L947 774ZM516 623L531 604L547 625ZM967 548L962 566L956 544ZM1153 434L1162 435L1166 437Z'/><path fill='#906c4e' stroke='#906c4e' stroke-width='.6' d='M442 812L373 819L388 798ZM419 878L370 880L383 858ZM1188 430L1204 412L1219 426ZM914 738L868 732L870 694ZM930 550L934 534L956 544ZM1170 252L1196 247L1184 268ZM849 409L854 405L872 421ZM1031 596L1024 594L1034 583ZM1024 428L1014 422L1033 414ZM908 477L913 475L930 487ZM1193 377L1184 377L1183 366Z'/><path fill='#cca26c' stroke='#cca26c' stroke-width='.6' d='M381 924L400 1000L350 1000Z'/><path fill='#a28466' stroke='#a28466' stroke-width='.6' d='M323 814L315 814L331 802ZM293 676L321 716L290 749ZM321 716L326 721L312 746ZM930 454L917 431L928 428ZM1166 437L1167 435L1173 436ZM1100 176L1117 185L1117 186ZM881 369L875 377L852 370ZM930 426L946 436L928 428ZM946 436L937 451L928 428ZM853 329L846 361L838 357ZM1202 321L1203 328L1173 330ZM967 548L969 562L962 566ZM901 257L877 246L892 226Z'/><path fill='#5a422a' stroke='#5a422a' stroke-width='.6' d='M322 847L323 814L340 844ZM661 719L651 720L651 689ZM651 720L661 719L643 726ZM607 644L582 593L621 628ZM715 925L673 901L681 858ZM500 543L526 555L530 573ZM526 555L541 504L563 550ZM477 266L431 306L443 260ZM450 251L477 266L443 260ZM918 822L941 819L961 853ZM1167 435L1168 410L1173 436ZM1234 714L1242 788L1214 792ZM681 858L666 812L720 828ZM832 577L830 561L858 568ZM821 562L823 547L830 561ZM830 882L833 856L852 872ZM1134 403L1124 413L1123 397ZM874 517L880 506L879 520Z'/><path fill='#785a36' stroke='#785a36' stroke-width='.6' d='M179 921L150 901L166 865ZM939 739L916 757L922 735ZM1081 675L1096 728L1079 723ZM887 489L873 472L879 465ZM923 221L933 209L938 218Z'/><path fill='#8a663c' stroke='#8a663c' stroke-width='.6' d='M179 921L210 886L227 929ZM978 415L998 414L975 428Z'/><path fill='#a88a6c' stroke='#a88a6c' stroke-width='.6' d='M0 800L29 807L0 850ZM29 807L67 799L89 864ZM838 357L813 351L820 338ZM846 361L886 362L881 369ZM1141 574L1174 557L1160 578ZM969 562L975 552L976 560Z'/><path fill='#90725a' stroke='#90725a' stroke-width='.6' d='M29 807L0 800L9 785ZM33 777L29 807L9 785ZM154 770L185 819L126 800ZM823 547L811 536L821 532ZM864 540L857 544L852 536ZM1063 287L1086 303L1074 318ZM1179 506L1183 503L1192 512Z'/><path fill='#b49678' stroke='#b49678' stroke-width='.6' d='M29 807L89 864L17 857ZM788 380L791 372L832 387ZM923 420L930 426L922 423ZM1165 349L1166 337L1186 353ZM1076 285L1076 273L1090 280ZM877 246L901 257L896 259ZM1207 446L1194 444L1188 430ZM1012 318L1000 312L1025 302Z'/><path fill='#48301e' stroke='#48301e' stroke-width='.6' d='M788 554L783 550L783 549ZM757 472L746 523L733 515ZM717 603L746 523L765 567ZM389 627L432 586L451 615ZM1174 735L1214 792L1167 787ZM870 694L876 674L885 673ZM756 895L681 858L720 828ZM822 600L856 595L815 612ZM894 546L895 563L886 546ZM908 677L870 694L885 673ZM1032 426L1064 442L1058 452ZM989 225L970 223L986 217Z'/><path fill='#422a18' stroke='#422a18' stroke-width='.6' d='M959 861L961 853L975 849ZM805 673L810 669L836 704ZM432 586L446 584L451 615ZM807 529L789 478L799 480ZM1116 752L1096 728L1129 742ZM733 515L688 521L676 480ZM1123 397L1112 380L1127 368ZM921 598L923 645L902 606ZM905 595L902 606L883 596ZM562 790L558 760L592 774ZM818 550L823 547L821 562ZM928 567L927 553L939 566ZM894 546L900 559L895 563ZM1051 260L1072 267L1069 271Z'/><path fill='#2a180c' stroke='#2a180c' stroke-width='.6' d='M744 769L709 731L725 725ZM570 580L582 593L547 625ZM132 949L119 910L145 946ZM1031 801L973 805L1025 790ZM803 672L810 669L805 673ZM610 462L609 409L633 457ZM807 579L802 588L794 570ZM901 535L910 554L894 546Z'/><path fill='#72604e' stroke='#72604e' stroke-width='.6' d='M769 327L760 360L735 369ZM941 191L923 186L934 183ZM1233 472L1233 467L1245 474Z'/><path fill='#483c24' stroke='#483c24' stroke-width='.6' d='M676 423L678 440L670 433ZM1101 383L1064 398L1059 376ZM1431 751L1456 712L1440 752ZM856 595L880 607L862 643Z'/><path fill='#483c30' stroke='#483c30' stroke-width='.6' d='M676 423L696 408L695 417ZM734 436L696 408L729 387ZM318 407L275 434L259 393ZM918 337L922 332L926 338ZM1158 337L1143 349L1143 338ZM922 346L923 347L919 361ZM950 651L933 653L923 645ZM959 585L961 585L951 600ZM960 583L961 585L959 585ZM1108 493L1105 489L1108 481ZM1106 467L1108 481L1093 482ZM1033 184L1024 192L1016 182Z'/><path fill='#543c2a' stroke='#543c2a' stroke-width='.6' d='M799 480L814 469L815 492ZM605 588L582 593L593 583ZM582 593L605 588L621 628ZM117 383L47 370L109 363ZM262 749L248 688L290 749ZM145 946L167 924L171 944ZM1128 803L1116 752L1167 787ZM768 407L809 418L778 425ZM984 737L1027 773L973 805ZM381 924L419 878L406 934ZM1101 383L1059 376L1092 364ZM794 795L831 799L798 807ZM652 927L665 902L673 901ZM326 721L321 716L344 702ZM1053 856L1057 801L1102 828ZM778 452L792 452L776 464ZM649 853L666 812L681 858ZM836 530L838 509L852 536ZM1019 391L1018 393L1013 386ZM946 189L953 192L950 199ZM864 540L874 517L876 531Z'/><path fill='#4e3018' stroke='#4e3018' stroke-width='.6' d='M799 480L789 478L792 476ZM1187 620L1186 647L1146 617ZM866 576L865 560L878 568ZM877 590L869 580L878 568ZM1070 663L1081 675L1065 668Z'/><path fill='#543624' stroke='#543624' stroke-width='.6' d='M789 478L776 464L792 476Z'/><path fill='#1e180c' stroke='#1e180c' stroke-width='.6' d='M743 472L734 436L757 472ZM230 375L233 357L253 371ZM62 645L94 598L86 650ZM114 698L138 669L131 705ZM361 688L363 628L386 689ZM830 882L852 872L886 902ZM546 850L581 892L573 899Z'/><path fill='#5a3c2a' stroke='#5a3c2a' stroke-width='.6' d='M743 472L733 515L676 480ZM810 669L791 648L829 652ZM798 456L799 480L792 476ZM1035 635L1000 684L967 650ZM1511 725L1502 729L1496 730Z'/><path fill='#3c2412' stroke='#3c2412' stroke-width='.6' d='M743 472L757 472L733 515ZM831 799L809 766L859 773ZM1018 393L1002 397L1013 386ZM1123 397L1118 395L1112 380ZM549 834L583 804L588 806ZM870 480L874 501L867 509Z'/><path fill='#48362a' stroke='#48362a' stroke-width='.6' d='M473 739L487 783L445 738ZM273 452L275 434L297 462ZM838 509L824 501L828 478ZM1025 274L1020 254L1026 252ZM1064 196L1079 205L1078 211ZM889 537L885 538L887 535Z'/><path fill='#966c4e' stroke='#966c4e' stroke-width='.6' d='M726 702L669 677L731 692ZM745 791L769 800L751 815Z'/><path fill='#8a6c48' stroke='#8a6c48' stroke-width='.6' d='M669 677L726 702L679 723ZM1204 412L1218 414L1219 426ZM1020 470L1008 465L1025 459ZM649 860L590 871L649 853ZM1196 247L1219 265L1184 268ZM1285 791L1242 788L1269 775ZM918 822L890 852L865 836ZM968 426L956 419L957 412ZM1085 151L1083 171L1082 153ZM923 221L909 222L918 213ZM873 472L870 480L868 478Z'/><path fill='#785a3c' stroke='#785a3c' stroke-width='.6' d='M661 719L669 677L679 723ZM268 556L249 599L215 550ZM531 604L570 580L547 625ZM335 494L367 489L354 543ZM92 703L90 706L75 680ZM505 620L496 649L451 615ZM140 385L141 387L123 405ZM768 919L756 895L788 866ZM848 667L870 694L836 704ZM833 544L852 536L850 549ZM1219 265L1202 303L1184 268ZM1168 410L1156 393L1184 395ZM831 799L863 783L839 804ZM962 566L939 566L956 544ZM878 390L871 385L875 377ZM885 381L886 383L878 390ZM1207 380L1209 376L1226 390ZM908 209L912 195L918 213ZM886 504L887 489L890 493Z'/><path fill='#1e1206' stroke='#1e1206' stroke-width='.6' d='M421 497L476 511L413 518ZM1035 743L1079 723L1078 760ZM538 503L500 543L489 504ZM519 447L538 503L506 455ZM490 783L550 796L519 812ZM590 871L581 892L546 850ZM744 769L730 782L709 731ZM1035 743L1065 714L1079 723ZM1041 702L1065 714L1035 743ZM451 890L443 890L460 873Z'/><path fill='#483018' stroke='#483018' stroke-width='.6' d='M449 570L426 550L476 511ZM1186 647L1168 675L1146 617ZM684 608L688 521L717 603ZM404 557L398 510L413 518ZM1174 735L1168 675L1228 680ZM262 754L246 794L242 757ZM1174 735L1234 714L1214 792ZM604 739L590 748L573 725ZM787 793L769 800L769 775ZM1207 380L1210 397L1192 379ZM1210 397L1207 380L1226 390ZM1207 320L1209 315L1227 335ZM1206 328L1207 320L1227 335Z'/><path fill='#66482a' stroke='#66482a' stroke-width='.6' d='M449 570L432 586L426 550ZM809 766L832 734L859 773ZM914 738L916 757L897 764ZM531 604L516 623L505 620ZM666 812L679 723L709 731ZM885 381L878 390L875 377ZM878 390L885 398L854 405ZM1060 171L1070 191L1058 173ZM1070 191L1060 171L1069 165Z'/><path fill='#725a3c' stroke='#725a3c' stroke-width='.6' d='M443 260L386 268L428 212ZM1116 752L1128 803L1108 792ZM1214 792L1193 804L1167 787ZM1496 730L1456 712L1508 660ZM1041 400L1030 387L1059 376ZM1101 343L1099 358L1089 357ZM991 462L989 450L1008 465ZM1227 335L1209 315L1234 300ZM1285 791L1246 813L1242 788ZM1246 813L1259 828L1240 823ZM951 215L950 244L938 218ZM937 306L920 283L952 268Z'/><path fill='#aeaea8' stroke='#aeaea8' stroke-width='.6' d='M1535 207L1594 246L1526 260ZM1273 241L1250 231L1255 212ZM720 223L688 232L718 197ZM1259 406L1252 443L1246 417ZM951 344L939 334L943 326Z'/><path fill='#9ca296' stroke='#9ca296' stroke-width='.6' d='M1594 246L1595 251L1575 287Z'/><path fill='#b4a290' stroke='#b4a290' stroke-width='.6' d='M1450 0L1410 40L1400 0ZM847 189L823 174L835 169ZM797 145L818 155L801 161ZM1108 234L1119 262L1097 256Z'/><path fill='#baa88a' stroke='#baa88a' stroke-width='.6' d='M1410 40L1450 0L1423 54ZM1410 40L1367 103L1382 18ZM1098 338L1093 324L1110 328ZM1165 349L1160 360L1143 349ZM1100 306L1098 320L1086 303Z'/><path fill='#ccbaa8' stroke='#ccbaa8' stroke-width='.6' d='M1410 40L1382 18L1400 0ZM1017 531L1013 503L1050 521ZM979 321L963 321L976 314Z'/><path fill='#8a7e66' stroke='#8a7e66' stroke-width='.6' d='M1505 52L1501 92L1438 99ZM1169 319L1175 316L1175 317Z'/><path fill='#84725a' stroke='#84725a' stroke-width='.6' d='M1501 92L1505 52L1551 50ZM779 349L791 365L760 360ZM1047 573L1045 555L1056 558ZM1011 567L991 563L1007 551ZM1206 468L1188 476L1197 463ZM972 267L950 257L971 251Z'/><path fill='#96968a' stroke='#96968a' stroke-width='.6' d='M1259 264L1250 231L1273 241Z'/><path fill='#a29c96' stroke='#a29c96' stroke-width='.6' d='M1250 231L1259 264L1224 245ZM1226 394L1259 406L1246 417ZM1148 507L1136 509L1132 472ZM1136 509L1117 500L1132 472ZM939 334L923 347L926 338Z'/><path fill='#727266' stroke='#727266' stroke-width='.6' d='M1259 264L1273 241L1314 300ZM1384 244L1446 226L1440 295ZM995 161L1000 158L1003 161ZM955 354L957 346L970 359Z'/><path fill='#847e78' stroke='#847e78' stroke-width='.6' d='M1252 319L1259 264L1314 300Z'/><path fill='#a89066' stroke='#a89066' stroke-width='.6' d='M1487 468L1511 527L1468 531Z'/><path fill='#968a78' stroke='#968a78' stroke-width='.6' d='M1511 527L1487 468L1545 491ZM1190 62L1202 60L1196 67ZM1135 348L1143 349L1145 362ZM1162 316L1158 337L1143 338ZM1226 444L1227 449L1222 444ZM787 137L781 129L790 131Z'/><path fill='#c6a87e' stroke='#c6a87e' stroke-width='.6' d='M1570 540L1511 527L1545 491Z'/><path fill='#5a5a54' stroke='#5a5a54' stroke-width='.6' d='M1441 369L1402 299L1440 295Z'/><path fill='#c6ae90' stroke='#c6ae90' stroke-width='.6' d='M1285 11L1250 0L1300 0ZM1235 20L1248 78L1235 71ZM968 525L964 536L932 520ZM958 468L946 456L963 458ZM1100 306L1086 303L1106 297Z'/><path fill='#ccb490' stroke='#ccb490' stroke-width='.6' d='M1285 11L1300 0L1288 10Z'/><path fill='#ccb49c' stroke='#ccb49c' stroke-width='.6' d='M1250 0L1235 20L1200 0ZM1285 11L1235 20L1250 0ZM960 502L932 520L937 493ZM1122 67L1119 72L1085 22Z'/><path fill='#c0a890' stroke='#c0a890' stroke-width='.6' d='M1382 18L1350 0L1400 0ZM1118 282L1106 297L1108 283ZM1019 375L1026 361L1030 387Z'/><path fill='#ccb496' stroke='#ccb496' stroke-width='.6' d='M1300 57L1350 0L1382 18ZM1012 318L996 321L1000 312Z'/><path fill='#664224' stroke='#664224' stroke-width='.6' d='M1186 647L1208 596L1228 680ZM1293 721L1313 726L1308 767ZM887 489L870 480L873 472Z'/><path fill='#54361e' stroke='#54361e' stroke-width='.6' d='M1168 675L1186 647L1228 680ZM973 805L941 819L947 774ZM1234 714L1174 735L1228 680ZM1163 596L1187 620L1146 617ZM1187 620L1163 596L1208 596ZM1293 721L1286 778L1269 775ZM921 466L930 454L928 468ZM1210 397L1226 394L1215 411ZM1079 656L1055 658L1035 635ZM935 578L925 579L928 567Z'/><path fill='#6c4830' stroke='#6c4830' stroke-width='.6' d='M832 734L782 742L836 704ZM897 764L916 757L913 764ZM810 669L848 667L836 704ZM235 610L232 618L214 612ZM833 544L836 530L852 536ZM919 578L920 574L922 580Z'/><path fill='#785430' stroke='#785430' stroke-width='.6' d='M782 742L832 734L799 753ZM1200 566L1248 569L1208 596Z'/><path fill='#967254' stroke='#967254' stroke-width='.6' d='M1027 773L1035 743L1037 754ZM228 861L210 886L198 851ZM1059 568L1080 557L1062 594ZM837 437L819 450L809 418ZM1014 422L1014 451L989 450ZM909 222L908 209L918 213ZM998 414L1014 422L989 450Z'/><path fill='#36241e' stroke='#36241e' stroke-width='.6' d='M814 469L828 478L815 492ZM1105 466L1106 467L1093 482ZM1064 442L1079 451L1062 452Z'/><path fill='#ae9678' stroke='#ae9678' stroke-width='.6' d='M975 428L981 458L963 458ZM898 347L864 331L899 342ZM1160 360L1156 377L1145 362ZM970 550L967 548L971 531ZM1107 125L1123 133L1101 140ZM1184 443L1181 479L1166 437ZM1076 273L1090 266L1090 280ZM1076 273L1075 268L1090 266ZM1134 546L1141 574L1128 543ZM864 293L888 291L873 310ZM791 305L796 294L801 316ZM988 271L992 252L1000 264ZM979 265L992 252L988 271Z'/><path fill='#ba9666' stroke='#ba9666' stroke-width='.6' d='M1138 847L1154 843L1132 892ZM1088 856L1138 847L1132 892Z'/><path fill='#c09666' stroke='#c09666' stroke-width='.6' d='M1215 826L1246 899L1192 832ZM1440 752L1463 746L1423 802ZM652 927L715 925L700 1000ZM550 1000L500 1000L540 950ZM1033 868L1046 898L1038 894ZM1431 751L1440 752L1423 802ZM1066 866L1088 856L1086 922ZM1301 818L1337 810L1341 855ZM1346 806L1378 797L1341 855ZM1337 810L1346 806L1341 855Z'/><path fill='#a87842' stroke='#a87842' stroke-width='.6' d='M1600 600L1600 650L1587 659ZM1508 660L1515 602L1587 659Z'/><path fill='#906636' stroke='#906636' stroke-width='.6' d='M1600 650L1600 700L1587 659Z'/><path fill='#cca878' stroke='#cca878' stroke-width='.6' d='M1600 550L1570 540L1600 500Z'/><path fill='#ae7e4e' stroke='#ae7e4e' stroke-width='.6' d='M1515 602L1600 600L1587 659Z'/><path fill='#b48a54' stroke='#b48a54' stroke-width='.6' d='M1468 531L1515 602L1424 610ZM1286 558L1279 533L1353 526ZM1598 592L1600 550L1600 600ZM1541 567L1598 592L1515 602Z'/><path fill='#96663c' stroke='#96663c' stroke-width='.6' d='M1543 686L1508 660L1587 659ZM1456 712L1442 660L1508 660ZM1442 660L1456 712L1381 674Z'/><path fill='#90663c' stroke='#90663c' stroke-width='.6' d='M1508 660L1543 686L1535 704ZM1365 720L1293 671L1381 674Z'/><path fill='#90603c' stroke='#90603c' stroke-width='.6' d='M1575 696L1543 686L1587 659Z'/><path fill='#78604e' stroke='#78604e' stroke-width='.6' d='M1543 686L1575 696L1535 704ZM154 770L168 737L208 775ZM422 382L410 350L461 361ZM1222 266L1202 303L1219 265ZM786 266L760 264L768 256ZM1244 340L1237 350L1227 335ZM951 215L970 223L958 244ZM1142 262L1153 277L1136 282ZM874 501L880 506L867 509ZM886 530L885 531L879 520ZM1013 270L998 268L1000 264ZM876 536L874 545L864 540ZM964 575L943 579L962 566Z'/><path fill='#ae7e48' stroke='#ae7e48' stroke-width='.6' d='M1515 602L1442 660L1424 610Z'/><path fill='#a28a66' stroke='#a28a66' stroke-width='.6' d='M1592 718L1588 733L1578 723ZM288 359L233 357L292 320ZM1176 303L1176 271L1184 268ZM1086 303L1076 285L1090 280ZM1184 443L1194 444L1197 463Z'/><path fill='#423624' stroke='#423624' stroke-width='.6' d='M1555 723L1575 696L1578 723ZM505 379L461 361L547 317ZM275 434L328 440L297 462ZM422 382L393 443L379 373ZM1456 712L1482 733L1463 746ZM1456 712L1431 751L1426 751ZM1123 397L1124 413L1117 404ZM1025 274L1041 277L1045 288ZM1010 238L1034 236L1026 252ZM968 677L947 655L967 650ZM1016 182L1006 192L1003 167ZM1006 192L1011 210L991 198ZM1018 177L1016 182L1003 167ZM1011 210L1015 200L1021 203Z'/><path fill='#ba9c78' stroke='#ba9c78' stroke-width='.6' d='M1588 733L1555 723L1578 723ZM886 383L891 368L926 389ZM913 426L895 441L902 409ZM803 345L814 323L820 338ZM1173 358L1164 361L1165 349ZM905 502L908 477L930 487ZM910 506L905 502L930 487Z'/><path fill='#c09c6c' stroke='#c09c6c' stroke-width='.6' d='M1353 526L1279 533L1327 496ZM570 959L652 927L600 1000ZM1234 824L1246 899L1215 826ZM1504 787L1502 729L1521 734ZM1496 730L1502 729L1504 787ZM906 448L895 454L895 441Z'/><path fill='#9c7242' stroke='#9c7242' stroke-width='.6' d='M1264 566L1286 558L1275 618Z'/><path fill='#966c3c' stroke='#966c3c' stroke-width='.6' d='M1248 569L1264 566L1275 618Z'/><path fill='#604230' stroke='#604230' stroke-width='.6' d='M141 387L159 386L154 409ZM895 563L892 584L878 568Z'/><path fill='#42361e' stroke='#42361e' stroke-width='.6' d='M409 474L393 443L445 440ZM1039 217L1060 226L1043 223Z'/><path fill='#c0bab4' stroke='#c0bab4' stroke-width='.6' d='M339 368L368 324L380 333ZM801 161L823 174L784 193ZM771 198L780 188L784 193ZM780 188L760 160L801 161ZM848 256L849 219L872 251ZM858 209L849 219L830 210ZM760 160L797 145L801 161ZM790 131L788 126L814 104ZM1211 169L1208 171L1210 168ZM923 347L950 347L924 357ZM1112 461L1113 455L1132 472Z'/><path fill='#c0b4ae' stroke='#c0b4ae' stroke-width='.6' d='M379 373L339 368L380 333ZM1062 525L1066 509L1098 533ZM788 126L781 121L783 108Z'/><path fill='#b49c78' stroke='#b49c78' stroke-width='.6' d='M82 291L86 315L56 292ZM1101 343L1102 342L1108 347ZM964 395L970 400L957 412Z'/><path fill='#b4906c' stroke='#b4906c' stroke-width='.6' d='M163 302L86 315L162 301ZM958 477L930 487L928 468ZM832 387L849 409L822 403ZM1176 365L1164 361L1173 358Z'/><path fill='#a29078' stroke='#a29078' stroke-width='.6' d='M336 51L330 33L375 24ZM1204 53L1165 49L1200 0ZM1117 186L1117 185L1163 180ZM1180 191L1145 224L1163 180ZM961 309L963 321L946 323ZM1136 80L1122 67L1161 65Z'/><path fill='#ae967e' stroke='#ae967e' stroke-width='.6' d='M350 0L330 33L300 0ZM1193 211L1180 191L1195 203ZM1180 191L1197 182L1195 203ZM864 331L864 320L873 310ZM1031 346L1049 365L1026 361ZM1086 303L1098 320L1093 324ZM1009 333L1015 319L1025 327Z'/><path fill='#9c8466' stroke='#9c8466' stroke-width='.6' d='M229 318L233 357L178 358ZM1248 78L1298 89L1274 112ZM109 765L154 770L126 800ZM1102 118L1107 125L1101 140ZM922 346L898 347L899 342ZM1026 361L1049 365L1030 387ZM886 362L898 347L896 356ZM986 564L968 572L976 560ZM897 300L893 304L893 293ZM1025 327L1021 315L1041 309ZM791 305L801 316L769 327ZM1200 457L1207 446L1213 449ZM1014 582L1006 576L1016 572ZM920 283L937 306L897 300Z'/><path fill='#423c30' stroke='#423c30' stroke-width='.6' d='M571 402L511 399L511 398ZM505 379L571 402L511 398ZM577 393L505 379L547 317ZM477 266L512 226L534 256ZM964 580L961 585L960 583Z'/><path fill='#8a9084' stroke='#8a9084' stroke-width='.6' d='M678 195L688 232L657 240Z'/><path fill='#969690' stroke='#969690' stroke-width='.6' d='M678 195L657 240L622 226ZM970 359L957 346L973 334Z'/><path fill='#c0c6c0' stroke='#c0c6c0' stroke-width='.6' d='M688 232L678 195L718 197Z'/><path fill='#9c9690' stroke='#9c9690' stroke-width='.6' d='M765 119L760 127L730 85Z'/><path fill='#84786c' stroke='#84786c' stroke-width='.6' d='M760 127L765 119L771 120ZM1245 474L1233 459L1252 443Z'/><path fill='#baaea2' stroke='#baaea2' stroke-width='.6' d='M760 127L760 160L718 197ZM794 272L828 240L825 280ZM794 272L786 266L791 266ZM1163 313L1145 310L1161 304Z'/><path fill='#c0c6c6' stroke='#c0c6c6' stroke-width='.6' d='M867 22L836 19L850 0ZM897 105L926 109L891 157ZM982 161L965 122L997 122ZM873 157L847 168L872 152ZM1055 138L1018 148L997 122Z'/><path fill='#c0c0c6' stroke='#c0c0c6' stroke-width='.6' d='M824 10L836 19L811 12ZM891 157L926 109L944 134ZM897 105L872 136L884 95Z'/><path fill='#ccd2d8' stroke='#ccd2d8' stroke-width='.6' d='M836 19L788 77L811 12ZM784 77L736 19L811 12Z'/><path fill='#ae8a60' stroke='#ae8a60' stroke-width='.6' d='M750 954L715 925L765 924ZM970 400L982 409L978 415Z'/><path fill='#78603c' stroke='#78603c' stroke-width='.6' d='M424 931L466 925L475 954ZM1218 414L1215 411L1226 412ZM769 800L787 793L798 807Z'/><path fill='#b4905a' stroke='#b4905a' stroke-width='.6' d='M497 941L500 1000L475 954Z'/><path fill='#a27e60' stroke='#a27e60' stroke-width='.6' d='M158 361L163 302L173 356ZM875 377L866 383L852 370ZM1301 814L1337 810L1301 818ZM1047 573L1048 581L1034 583ZM1028 578L1047 573L1034 583ZM875 377L871 385L866 383ZM1209 376L1218 368L1226 390ZM1004 411L998 414L998 398Z'/><path fill='#7e6c4e' stroke='#7e6c4e' stroke-width='.6' d='M222 702L200 682L204 677ZM1193 211L1195 203L1206 217ZM1176 303L1163 279L1176 271ZM1200 458L1200 457L1218 455Z'/><path fill='#7e5a36' stroke='#7e5a36' stroke-width='.6' d='M223 817L246 794L262 815ZM218 837L223 817L262 815ZM1426 751L1365 720L1381 674ZM218 837L215 830L223 817ZM1207 364L1183 366L1186 353ZM1175 541L1187 536L1176 555ZM991 563L994 572L986 564Z'/><path fill='#2a2412' stroke='#2a2412' stroke-width='.6' d='M94 598L54 579L87 576ZM232 618L204 677L183 650ZM829 584L816 591L819 573Z'/><path fill='#302a18' stroke='#302a18' stroke-width='.6' d='M94 598L122 648L86 650ZM122 648L143 671L138 669ZM852 872L883 880L886 902Z'/><path fill='#968466' stroke='#968466' stroke-width='.6' d='M183 729L200 682L210 712ZM1041 309L1054 295L1074 318ZM989 469L979 479L978 475Z'/><path fill='#60543c' stroke='#60543c' stroke-width='.6' d='M168 737L122 721L131 705Z'/><path fill='#78543c' stroke='#78543c' stroke-width='.6' d='M90 706L92 703L105 727ZM751 608L802 588L796 616ZM905 595L921 598L902 606ZM935 578L943 579L946 595Z'/><path fill='#96784e' stroke='#96784e' stroke-width='.6' d='M132 949L145 946L123 958Z'/><path fill='#a27e5a' stroke='#a27e5a' stroke-width='.6' d='M237 900L229 858L297 880ZM400 690L472 686L445 738ZM442 812L419 878L383 858ZM478 661L472 686L453 660ZM789 852L813 852L788 866ZM866 383L846 379L852 370ZM880 207L908 209L892 226ZM1113 433L1080 447L1096 422ZM1176 365L1173 358L1183 366ZM1198 525L1184 531L1180 518Z'/><path fill='#6c5436' stroke='#6c5436' stroke-width='.6' d='M67 799L90 796L89 864ZM235 610L214 612L215 550ZM419 878L442 812L467 831ZM114 698L92 703L108 664ZM346 571L385 616L363 628ZM604 739L594 693L623 693ZM912 248L927 263L913 255ZM951 600L923 645L921 598ZM1153 434L1113 432L1124 413Z'/><path fill='#422a1e' stroke='#422a1e' stroke-width='.6' d='M789 478L807 529L767 528ZM828 478L826 469L836 470ZM745 791L730 782L744 769Z'/><path fill='#845a36' stroke='#845a36' stroke-width='.6' d='M769 775L782 742L799 753ZM1293 671L1228 680L1275 618Z'/><path fill='#ae8a5a' stroke='#ae8a5a' stroke-width='.6' d='M970 880L1009 882L955 926ZM908 896L921 893L940 928Z'/><path fill='#b48a5a' stroke='#b48a5a' stroke-width='.6' d='M921 893L970 880L955 926ZM897 933L818 949L818 918Z'/><path fill='#786648' stroke='#786648' stroke-width='.6' d='M779 349L760 360L769 327Z'/><path fill='#544e48' stroke='#544e48' stroke-width='.6' d='M682 379L671 300L735 369ZM609 409L606 407L608 389Z'/><path fill='#666054' stroke='#666054' stroke-width='.6' d='M729 387L682 379L735 369ZM1125 313L1135 311L1143 338Z'/><path fill='#60604e' stroke='#60604e' stroke-width='.6' d='M696 408L682 379L729 387Z'/><path fill='#5a5448' stroke='#5a5448' stroke-width='.6' d='M682 379L676 423L608 389ZM1163 313L1169 319L1162 316Z'/><path fill='#544e42' stroke='#544e42' stroke-width='.6' d='M682 379L696 408L676 423ZM1135 348L1131 344L1143 338ZM676 423L609 409L608 389ZM940 328L937 329L940 322Z'/><path fill='#3c3018' stroke='#3c3018' stroke-width='.6' d='M496 649L536 666L493 683ZM232 618L250 630L204 677ZM983 203L985 191L991 198Z'/><path fill='#301e0c' stroke='#301e0c' stroke-width='.6' d='M563 550L646 549L593 583ZM1174 735L1167 787L1129 742ZM520 634L496 649L505 620ZM1046 189L1033 187L1044 185Z'/><path fill='#968472' stroke='#968472' stroke-width='.6' d='M1209 77L1219 110L1206 99ZM940 382L943 387L932 381ZM1106 96L1119 102L1097 109ZM1227 449L1226 444L1229 447ZM1060 452L1062 452L1059 468ZM940 322L937 306L946 323ZM1164 335L1166 337L1162 339ZM1060 153L1078 147L1069 165Z'/><path fill='#9c8a72' stroke='#9c8a72' stroke-width='.6' d='M1219 110L1209 77L1235 71ZM1255 116L1248 78L1274 112ZM67 799L33 777L60 777ZM1108 234L1097 256L1094 228ZM410 350L379 373L380 333ZM1058 452L1060 452L1059 468ZM972 267L973 286L952 268Z'/><path fill='#ccba9c' stroke='#ccba9c' stroke-width='.6' d='M1204 53L1235 20L1235 71ZM1202 60L1204 53L1235 71Z'/><path fill='#8a7254' stroke='#8a7254' stroke-width='.6' d='M1218 414L1228 413L1219 426ZM1117 186L1145 224L1127 225ZM227 704L222 702L248 688ZM333 582L346 571L363 628ZM1041 400L1018 393L1030 387ZM543 940L557 935L540 950ZM1185 432L1168 410L1188 430ZM975 552L989 560L976 560ZM893 270L908 275L896 289ZM1259 516L1245 474L1273 493ZM1113 432L1113 433L1096 422Z'/><path fill='#9c9c96' stroke='#9c9c96' stroke-width='.6' d='M1211 238L1232 229L1224 245ZM1000 158L1018 148L1003 161Z'/><path fill='#aeae9c' stroke='#aeae9c' stroke-width='.6' d='M1232 229L1211 238L1206 217ZM1117 500L1136 509L1113 506Z'/><path fill='#b4aea8' stroke='#b4aea8' stroke-width='.6' d='M1166 161L1135 158L1154 143ZM1233 122L1231 117L1236 110ZM1250 125L1233 122L1236 110ZM1384 112L1376 121L1367 103ZM828 240L841 270L825 280ZM848 256L841 270L828 240ZM1153 126L1179 144L1154 143ZM1161 65L1190 62L1185 72Z'/><path fill='#9c8a6c' stroke='#9c8a6c' stroke-width='.6' d='M1235 71L1248 78L1236 110ZM1180 191L1170 231L1145 224ZM1049 365L1067 356L1059 376ZM1122 67L1136 80L1124 80Z'/><path fill='#b4bab4' stroke='#b4bab4' stroke-width='.6' d='M1279 167L1376 121L1387 179ZM1376 121L1427 164L1387 179ZM1427 164L1384 112L1438 99ZM1018 148L1000 158L997 122Z'/><path fill='#5a3c1e' stroke='#5a3c1e' stroke-width='.6' d='M1186 647L1187 620L1208 596ZM1169 580L1200 566L1208 596ZM1234 714L1293 721L1269 775ZM869 580L866 576L878 568ZM1226 394L1210 397L1226 390ZM1210 397L1215 411L1207 401Z'/><path fill='#9c723c' stroke='#9c723c' stroke-width='.6' d='M1369 610L1293 671L1275 618Z'/><path fill='#9c6c3c' stroke='#9c6c3c' stroke-width='.6' d='M1381 674L1293 671L1369 610Z'/><path fill='#ba966c' stroke='#ba966c' stroke-width='.6' d='M1374 774L1426 751L1423 802ZM1426 751L1431 751L1423 802ZM1014 451L1026 452L1025 459Z'/><path fill='#60482a' stroke='#60482a' stroke-width='.6' d='M935 697L939 739L922 735ZM405 562L432 586L406 580ZM914 738L927 688L922 735ZM730 782L666 812L709 731ZM1162 435L1153 434L1168 410ZM1101 206L1085 199L1085 184Z'/><path fill='#604224' stroke='#604224' stroke-width='.6' d='M868 732L832 734L836 704ZM583 804L579 792L588 806ZM1174 557L1176 555L1200 566ZM1168 410L1153 434L1157 403ZM898 483L902 461L908 477Z'/><path fill='#966c48' stroke='#966c48' stroke-width='.6' d='M809 766L802 760L799 753ZM865 836L859 853L855 838Z'/><path fill='#845a3c' stroke='#845a3c' stroke-width='.6' d='M832 734L809 766L799 753Z'/><path fill='#724e36' stroke='#724e36' stroke-width='.6' d='M941 819L929 781L947 774ZM833 856L859 853L852 872Z'/><path fill='#c0a27e' stroke='#c0a27e' stroke-width='.6' d='M1013 503L1014 481L1045 484ZM1014 481L1020 470L1045 484ZM895 441L882 439L902 409Z'/><path fill='#d2c0ae' stroke='#d2c0ae' stroke-width='.6' d='M1013 503L1050 500L1050 521Z'/><path fill='#d2b496' stroke='#d2b496' stroke-width='.6' d='M1059 468L1045 484L1040 459Z'/><path fill='#2a1812' stroke='#2a1812' stroke-width='.6' d='M826 469L828 478L814 469ZM871 739L870 780L859 773ZM1037 233L1039 234L1034 236ZM1037 233L1033 227L1037 225Z'/><path fill='#ccbaa2' stroke='#ccbaa2' stroke-width='.6' d='M999 501L1013 503L1001 506ZM958 477L960 502L937 493ZM970 400L970 387L998 398ZM963 321L961 309L976 314Z'/><path fill='#c6b496' stroke='#c6b496' stroke-width='.6' d='M1013 503L999 501L1014 481ZM999 501L986 488L1014 481Z'/><path fill='#9c7e60' stroke='#9c7e60' stroke-width='.6' d='M1008 465L1020 470L1014 481ZM839 466L840 461L858 461ZM1170 231L1196 247L1171 246ZM877 246L878 228L892 226ZM964 536L934 534L932 520ZM884 196L908 209L880 207ZM1160 360L1164 361L1161 377ZM1024 594L1028 578L1034 583ZM1002 397L1004 411L998 398ZM917 431L916 428L922 423ZM1164 361L1176 365L1161 377Z'/><path fill='#604e30' stroke='#604e30' stroke-width='.6' d='M1234 824L1215 826L1214 792ZM1207 312L1202 303L1234 300ZM1111 346L1110 346L1113 344Z'/><path fill='#b48a4e' stroke='#b48a4e' stroke-width='.6' d='M1515 602L1598 592L1600 600Z'/><path fill='#5a4e3c' stroke='#5a4e3c' stroke-width='.6' d='M1596 708L1575 696L1600 700ZM852 536L838 509L867 509ZM1124 280L1132 285L1131 286ZM937 329L932 332L929 324Z'/><path fill='#544830' stroke='#544830' stroke-width='.6' d='M1440 752L1456 712L1463 746Z'/><path fill='#9c7248' stroke='#9c7248' stroke-width='.6' d='M1246 553L1248 569L1244 555Z'/><path fill='#9c6c42' stroke='#9c6c42' stroke-width='.6' d='M1246 553L1264 566L1248 569Z'/><path fill='#a27248' stroke='#a27248' stroke-width='.6' d='M1264 566L1246 553L1279 533Z'/><path fill='#4e483c' stroke='#4e483c' stroke-width='.6' d='M309 359L339 368L330 402ZM688 232L720 223L739 292ZM477 266L548 305L547 317ZM922 346L918 337L926 338Z'/><path fill='#484230' stroke='#484230' stroke-width='.6' d='M288 359L309 359L318 407ZM1006 192L991 198L991 181Z'/><path fill='#aea290' stroke='#aea290' stroke-width='.6' d='M309 359L288 359L292 320ZM1135 148L1135 158L1101 140ZM1011 567L1007 551L1032 557ZM918 183L917 190L909 190ZM973 334L979 321L994 335Z'/><path fill='#48423c' stroke='#48423c' stroke-width='.6' d='M577 393L604 410L571 402ZM1125 313L1132 307L1135 311ZM1111 459L1110 456L1113 455Z'/><path fill='#484236' stroke='#484236' stroke-width='.6' d='M577 393L571 402L505 379ZM991 198L985 191L991 181Z'/><path fill='#847860' stroke='#847860' stroke-width='.6' d='M720 223L767 215L768 256ZM1229 447L1226 444L1228 427ZM1175 316L1171 312L1176 303Z'/><path fill='#c0ccd2' stroke='#c0ccd2' stroke-width='.6' d='M736 19L784 77L730 85ZM788 77L784 77L811 12ZM836 19L852 36L788 77Z'/><path fill='#bab4a8' stroke='#bab4a8' stroke-width='.6' d='M760 160L771 198L718 197ZM847 189L858 209L830 210ZM835 161L829 154L832 131ZM1207 175L1208 171L1211 169ZM970 359L973 334L987 359ZM970 359L987 359L988 364ZM845 299L836 286L864 293Z'/><path fill='#a29684' stroke='#a29684' stroke-width='.6' d='M775 134L760 127L771 120ZM797 145L787 137L790 131Z'/><path fill='#baaea8' stroke='#baaea8' stroke-width='.6' d='M775 134L760 160L760 127ZM841 270L848 256L867 284ZM1065 475L1085 466L1093 482ZM836 286L841 270L867 284Z'/><path fill='#c0c6cc' stroke='#c0c6cc' stroke-width='.6' d='M852 36L867 22L884 95Z'/><path fill='#c6ccd2' stroke='#c6ccd2' stroke-width='.6' d='M852 36L836 19L867 22ZM926 109L897 105L943 56Z'/><path fill='#ba9066' stroke='#ba9066' stroke-width='.6' d='M557 935L570 959L540 950ZM1026 452L1024 428L1032 426Z'/><path fill='#2a2418' stroke='#2a2418' stroke-width='.6' d='M515 903L513 899L573 899ZM508 908L513 899L515 903ZM138 669L143 671L131 705ZM1105 489L1108 493L1099 498Z'/><path fill='#18180c' stroke='#18180c' stroke-width='.6' d='M513 899L508 908L509 881Z'/><path fill='#726048' stroke='#726048' stroke-width='.6' d='M223 709L213 716L210 712ZM250 630L293 676L250 678ZM347 426L363 433L352 454ZM23 749L33 748L29 775ZM918 337L922 346L899 342ZM1217 466L1206 468L1218 455ZM987 231L992 252L972 247ZM1079 205L1079 190L1085 199ZM950 257L949 251L958 244Z'/><path fill='#786c54' stroke='#786c54' stroke-width='.6' d='M94 598L103 573L158 573Z'/><path fill='#181206' stroke='#181206' stroke-width='.6' d='M359 716L361 688L386 689ZM344 702L361 688L359 716ZM604 410L609 409L610 462ZM557 935L543 940L515 903ZM883 880L913 872L908 896Z'/><path fill='#6c5a3c' stroke='#6c5a3c' stroke-width='.6' d='M248 688L293 676L290 749ZM769 307L777 302L769 327Z'/><path fill='#725430' stroke='#725430' stroke-width='.6' d='M83 933L106 929L123 958ZM1065 668L1065 714L1041 702Z'/><path fill='#907254' stroke='#907254' stroke-width='.6' d='M816 597L815 612L796 616ZM505 620L464 588L530 573ZM839 466L868 478L836 470ZM1196 247L1170 252L1171 246ZM1193 224L1196 247L1170 231ZM1193 211L1193 224L1170 231ZM946 456L955 440L963 458ZM830 561L835 551L850 549ZM1156 377L1160 360L1161 377ZM882 370L875 377L881 369ZM1207 312L1202 321L1198 311ZM1176 365L1184 377L1161 377ZM901 257L908 275L893 270ZM989 562L986 564L989 560ZM910 506L901 523L905 502Z'/><path fill='#5a4236' stroke='#5a4236' stroke-width='.6' d='M828 478L824 501L815 492ZM892 533L890 532L896 528Z'/><path fill='#241812' stroke='#241812' stroke-width='.6' d='M788 554L803 564L794 570Z'/><path fill='#a88454' stroke='#a88454' stroke-width='.6' d='M908 896L897 933L886 902Z'/><path fill='#1e120c' stroke='#1e120c' stroke-width='.6' d='M921 893L913 872L959 861ZM883 880L908 896L886 902Z'/><path fill='#724e30' stroke='#724e30' stroke-width='.6' d='M751 815L789 852L720 828ZM579 792L592 774L588 806ZM868 732L871 739L832 734ZM925 579L935 578L921 598ZM998 414L1004 411L1014 422Z'/><path fill='#b48a60' stroke='#b48a60' stroke-width='.6' d='M1009 882L1033 868L1038 894Z'/><path fill='#30241e' stroke='#30241e' stroke-width='.6' d='M791 648L803 672L779 673ZM885 538L885 531L887 535Z'/><path fill='#180c06' stroke='#180c06' stroke-width='.6' d='M519 447L541 504L538 503Z'/><path fill='#30180c' stroke='#30180c' stroke-width='.6' d='M446 584L464 588L451 615Z'/><path fill='#8a664e' stroke='#8a664e' stroke-width='.6' d='M464 588L505 620L451 615Z'/><path fill='#7e6642' stroke='#7e6642' stroke-width='.6' d='M392 475L398 510L367 489ZM930 454L946 456L928 468Z'/><path fill='#a89684' stroke='#a89684' stroke-width='.6' d='M1204 53L1190 62L1165 49ZM1102 118L1079 133L1097 109ZM1161 65L1122 67L1165 49Z'/><path fill='#c0b496' stroke='#c0b496' stroke-width='.6' d='M1209 77L1202 60L1235 71Z'/><path fill='#b4b4a2' stroke='#b4b4a2' stroke-width='.6' d='M1072 83L1044 70L1085 22Z'/><path fill='#605442' stroke='#605442' stroke-width='.6' d='M1123 342L1110 339L1110 328ZM1016 286L1025 274L1045 288Z'/><path fill='#847260' stroke='#847260' stroke-width='.6' d='M1228 413L1237 417L1228 427ZM1213 449L1222 444L1218 455ZM847 168L860 178L847 189ZM1205 490L1192 489L1210 482ZM1013 270L1016 257L1025 274ZM949 585L959 585L946 595ZM1192 489L1188 476L1210 482ZM933 377L940 382L932 381ZM876 536L864 540L876 531ZM1220 475L1221 497L1210 482Z'/><path fill='#786c60' stroke='#786c60' stroke-width='.6' d='M1131 344L1123 342L1143 338ZM781 129L788 126L790 131ZM960 583L959 585L949 585ZM1116 479L1108 493L1108 481Z'/><path fill='#665a4e' stroke='#665a4e' stroke-width='.6' d='M1123 361L1131 344L1135 348ZM1153 277L1146 292L1136 282ZM877 590L892 584L883 596ZM932 332L922 332L929 324ZM915 558L910 554L920 556ZM1245 474L1286 448L1273 493Z'/><path fill='#3c362a' stroke='#3c362a' stroke-width='.6' d='M1143 349L1135 348L1143 338ZM606 407L609 409L604 410ZM1301 814L1288 803L1285 791ZM973 597L961 585L966 584ZM1169 319L1168 324L1162 316Z'/><path fill='#9c968a' stroke='#9c968a' stroke-width='.6' d='M1252 319L1245 328L1234 300ZM1105 500L1108 501L1099 509Z'/><path fill='#8a6c5a' stroke='#8a6c5a' stroke-width='.6' d='M1245 328L1227 335L1234 300ZM895 563L912 574L892 584Z'/><path fill='#54544e' stroke='#54544e' stroke-width='.6' d='M1384 244L1378 261L1367 232ZM1319 460L1283 413L1355 402Z'/><path fill='#5a5a4e' stroke='#5a5a4e' stroke-width='.6' d='M1402 299L1384 244L1440 295ZM1327 496L1319 460L1351 484Z'/><path fill='#484842' stroke='#484842' stroke-width='.6' d='M1378 261L1384 244L1402 299Z'/><path fill='#aea29c' stroke='#aea29c' stroke-width='.6' d='M1231 117L1219 110L1236 110Z'/><path fill='#c6cccc' stroke='#c6cccc' stroke-width='.6' d='M1210 168L1233 122L1245 129ZM943 56L897 105L884 95ZM1072 83L1098 85L1097 109Z'/><path fill='#b4ae9c' stroke='#b4ae9c' stroke-width='.6' d='M1166 161L1180 191L1163 180ZM979 321L973 334L967 333Z'/><path fill='#9c7e66' stroke='#9c7e66' stroke-width='.6' d='M1160 238L1170 231L1171 246ZM128 814L110 796L126 800ZM1179 506L1180 518L1167 508ZM992 284L1000 312L988 287Z'/><path fill='#543c1e' stroke='#543c1e' stroke-width='.6' d='M1094 282L1100 265L1106 277ZM832 734L871 739L859 773ZM1009 599L1035 635L967 650Z'/><path fill='#aeb4b4' stroke='#aeb4b4' stroke-width='.6' d='M1376 121L1384 112L1427 164Z'/><path fill='#90724e' stroke='#90724e' stroke-width='.6' d='M929 781L916 757L947 774ZM879 210L878 228L870 208ZM215 830L215 842L198 851ZM1157 403L1143 408L1143 405ZM1006 576L994 572L1011 567Z'/><path fill='#8a6648' stroke='#8a6648' stroke-width='.6' d='M916 757L929 781L913 764ZM665 902L649 860L673 901ZM1188 430L1168 410L1184 395ZM956 419L968 426L955 440ZM884 196L880 207L870 208ZM1081 675L1136 705L1096 728ZM1031 596L1049 586L1062 594ZM909 222L923 221L923 224ZM1143 408L1134 403L1143 405ZM989 562L991 563L986 564Z'/><path fill='#2a1206' stroke='#2a1206' stroke-width='.6' d='M924 805L941 819L932 816Z'/><path fill='#4e301e' stroke='#4e301e' stroke-width='.6' d='M924 805L929 781L941 819ZM1286 778L1293 721L1308 767ZM988 287L973 286L979 279Z'/><path fill='#786654' stroke='#786654' stroke-width='.6' d='M988 364L1007 385L998 398ZM1202 303L1222 266L1234 300ZM1158 337L1165 349L1143 349ZM1060 226L1082 259L1048 253ZM829 160L835 161L835 169ZM1226 444L1222 444L1228 427ZM1016 257L1020 254L1025 274ZM1020 253L1020 254L1016 257ZM1233 467L1224 459L1233 459ZM1224 459L1233 467L1217 466ZM885 538L889 543L884 540ZM889 537L889 543L885 538Z'/><path fill='#ccc0b4' stroke='#ccc0b4' stroke-width='.6' d='M1017 531L1050 521L1051 522ZM1007 551L1017 531L1032 557ZM1128 543L1088 558L1098 533ZM1007 551L990 540L1013 527ZM990 540L971 527L1001 506Z'/><path fill='#ccc0ba' stroke='#ccc0ba' stroke-width='.6' d='M1050 521L1066 509L1051 522Z'/><path fill='#ccc6c0' stroke='#ccc6c0' stroke-width='.6' d='M1050 500L1066 509L1050 521ZM1210 205L1217 200L1232 229ZM968 525L960 502L983 491ZM1080 557L1069 552L1098 533ZM860 178L847 168L873 157ZM860 178L873 157L870 184Z'/><path fill='#907248' stroke='#907248' stroke-width='.6' d='M1088 558L1106 600L1062 594ZM1028 461L1020 470L1025 459ZM813 852L830 882L788 866ZM917 431L930 454L907 450ZM215 842L216 844L198 851ZM1032 426L1024 428L1033 414ZM930 487L913 475L928 468ZM887 489L898 483L890 493Z'/><path fill='#8a6c54' stroke='#8a6c54' stroke-width='.6' d='M989 469L1008 465L1014 481ZM1502 729L1511 725L1521 734ZM833 544L823 547L821 532ZM874 545L865 560L864 554ZM1063 287L1076 285L1086 303ZM1079 190L1083 171L1085 184ZM1005 230L989 225L1010 225Z'/><path fill='#664824' stroke='#664824' stroke-width='.6' d='M968 426L978 415L975 428Z'/><path fill='#a89072' stroke='#a89072' stroke-width='.6' d='M898 347L919 361L896 356ZM801 316L795 344L769 327ZM1170 252L1176 271L1159 274ZM1160 250L1170 252L1159 274ZM1094 282L1086 303L1090 280ZM886 362L864 331L898 347ZM891 368L919 361L925 370ZM903 319L893 304L897 300ZM998 268L990 281L988 271Z'/><path fill='#b49c84' stroke='#b49c84' stroke-width='.6' d='M925 370L932 381L926 389ZM1106 297L1118 282L1123 284ZM1142 262L1153 251L1159 274ZM1014 348L1031 346L1026 361ZM896 259L893 270L872 251ZM1184 443L1188 476L1181 479ZM1012 318L1015 319L1009 333Z'/><path fill='#ba9054' stroke='#ba9054' stroke-width='.6' d='M1598 592L1541 567L1570 540Z'/><path fill='#ae8454' stroke='#ae8454' stroke-width='.6' d='M1246 553L1243 524L1279 533Z'/><path fill='#36301e' stroke='#36301e' stroke-width='.6' d='M453 393L476 420L445 440Z'/><path fill='#8a7860' stroke='#8a7860' stroke-width='.6' d='M410 350L422 382L379 373ZM1195 203L1210 205L1206 217ZM1054 295L1041 309L1045 288ZM1196 247L1210 241L1219 265ZM1245 328L1244 340L1227 335ZM1205 199L1210 205L1195 203ZM1041 309L1025 302L1045 288ZM1205 183L1197 182L1206 180ZM937 306L952 268L957 299ZM972 247L971 251L958 244ZM959 585L951 600L946 595ZM1195 497L1183 503L1188 491ZM938 264L950 257L952 268ZM1033 184L1022 174L1024 170ZM1072 267L1075 268L1069 271Z'/><path fill='#a2906c' stroke='#a2906c' stroke-width='.6' d='M795 344L779 349L769 327ZM1102 342L1110 339L1108 347Z'/><path fill='#b4c0c6' stroke='#b4c0c6' stroke-width='.6' d='M828 91L852 36L884 95ZM852 36L828 91L788 77Z'/><path fill='#b4bac0' stroke='#b4bac0' stroke-width='.6' d='M828 91L814 104L788 77Z'/><path fill='#d2ccc6' stroke='#d2ccc6' stroke-width='.6' d='M873 157L878 186L870 184Z'/><path fill='#846048' stroke='#846048' stroke-width='.6' d='M590 871L665 902L652 927Z'/><path fill='#967860' stroke='#967860' stroke-width='.6' d='M125 819L128 814L166 865ZM321 716L293 676L344 702ZM1226 390L1218 368L1242 368ZM901 523L914 512L916 526Z'/><path fill='#967e66' stroke='#967e66' stroke-width='.6' d='M110 796L109 765L126 800ZM1180 191L1193 211L1170 231ZM1018 393L1019 391L1030 387ZM1158 337L1162 339L1165 349ZM1021 315L1025 302L1041 309ZM1075 268L1076 273L1069 271ZM975 589L968 572L986 564ZM1213 449L1207 446L1222 444Z'/><path fill='#725a48' stroke='#725a48' stroke-width='.6' d='M822 600L816 597L819 594ZM1108 234L1110 227L1127 225ZM922 346L919 361L898 347ZM1218 368L1242 364L1242 368ZM989 225L1010 212L1010 225ZM1072 267L1051 259L1082 259ZM992 284L1017 281L1016 286Z'/><path fill='#422a12' stroke='#422a12' stroke-width='.6' d='M918 822L924 805L932 816ZM1081 675L1079 656L1106 664ZM1192 379L1210 397L1207 401Z'/><path fill='#301e06' stroke='#301e06' stroke-width='.6' d='M870 780L924 805L867 788ZM1118 395L1101 383L1112 380Z'/><path fill='#8a7866' stroke='#8a7866' stroke-width='.6' d='M1202 60L1199 70L1196 67ZM835 161L829 160L829 154ZM786 266L787 277L760 264Z'/><path fill='#90846c' stroke='#90846c' stroke-width='.6' d='M1199 70L1202 60L1209 77Z'/><path fill='#a8a290' stroke='#a8a290' stroke-width='.6' d='M1199 70L1185 72L1196 67Z'/><path fill='#b4a8a2' stroke='#b4a8a2' stroke-width='.6' d='M1209 110L1155 100L1206 99ZM1202 167L1179 144L1210 126ZM1148 507L1170 500L1151 509Z'/><path fill='#a2a296' stroke='#a2a296' stroke-width='.6' d='M1259 264L1222 266L1224 245ZM955 354L957 360L934 370Z'/><path fill='#9c9684' stroke='#9c9684' stroke-width='.6' d='M1222 266L1219 265L1224 245ZM1210 241L1211 238L1224 245ZM1219 265L1210 241L1224 245ZM1252 443L1229 447L1228 427Z'/><path fill='#725a36' stroke='#725a36' stroke-width='.6' d='M1202 303L1207 312L1198 311Z'/><path fill='#8a8472' stroke='#8a8472' stroke-width='.6' d='M1119 317L1123 342L1110 328Z'/><path fill='#968a7e' stroke='#968a7e' stroke-width='.6' d='M1123 342L1119 317L1143 338ZM1237 417L1241 419L1228 427ZM1210 203L1205 199L1217 200Z'/><path fill='#847872' stroke='#847872' stroke-width='.6' d='M1119 317L1125 313L1143 338Z'/><path fill='#726c5a' stroke='#726c5a' stroke-width='.6' d='M1132 307L1123 284L1131 286Z'/><path fill='#8a8478' stroke='#8a8478' stroke-width='.6' d='M1135 311L1145 310L1143 338ZM940 328L939 334L937 329Z'/><path fill='#7e786c' stroke='#7e786c' stroke-width='.6' d='M1132 307L1145 310L1135 311ZM1105 500L1099 509L1099 498ZM937 329L939 334L932 332ZM1165 310L1163 313L1161 304Z'/><path fill='#2a1806' stroke='#2a1806' stroke-width='.6' d='M1101 383L1118 395L1117 404Z'/><path fill='#968460' stroke='#968460' stroke-width='.6' d='M1099 358L1101 343L1108 347Z'/><path fill='#665436' stroke='#665436' stroke-width='.6' d='M1099 358L1105 361L1092 364Z'/><path fill='#4e3c1e' stroke='#4e3c1e' stroke-width='.6' d='M1101 383L1105 361L1112 380ZM1227 335L1237 350L1213 346ZM1234 824L1246 813L1240 823Z'/><path fill='#8a7854' stroke='#8a7854' stroke-width='.6' d='M1105 361L1099 358L1108 347ZM1110 339L1110 346L1108 347Z'/><path fill='#aeaea2' stroke='#aeaea2' stroke-width='.6' d='M1241 419L1237 417L1246 417ZM1153 126L1136 120L1155 100Z'/><path fill='#6c482a' stroke='#6c482a' stroke-width='.6' d='M1156 393L1156 377L1161 377ZM1313 726L1365 720L1308 767ZM866 576L869 580L864 580ZM1055 658L1041 702L1000 684Z'/><path fill='#a8967e' stroke='#a8967e' stroke-width='.6' d='M1167 518L1163 534L1151 509ZM1069 552L1080 557L1059 568Z'/><path fill='#9c8472' stroke='#9c8472' stroke-width='.6' d='M1176 271L1163 279L1159 274ZM1179 506L1167 508L1168 505ZM1170 500L1179 506L1168 505Z'/><path fill='#54483c' stroke='#54483c' stroke-width='.6' d='M1132 285L1133 282L1136 282ZM964 575L964 580L960 583Z'/><path fill='#96907e' stroke='#96907e' stroke-width='.6' d='M1132 285L1146 292L1131 286Z'/><path fill='#b49c8a' stroke='#b49c8a' stroke-width='.6' d='M1123 284L1118 282L1124 280ZM878 228L877 246L872 251ZM1119 262L1118 282L1106 277ZM996 321L979 321L976 314Z'/><path fill='#66421e' stroke='#66421e' stroke-width='.6' d='M1200 566L1176 555L1198 545Z'/><path fill='#724e2a' stroke='#724e2a' stroke-width='.6' d='M1293 671L1234 714L1228 680ZM1176 555L1187 536L1198 545Z'/><path fill='#784e30' stroke='#784e30' stroke-width='.6' d='M1293 721L1234 714L1293 671ZM961 632L1009 599L967 650Z'/><path fill='#845a30' stroke='#845a30' stroke-width='.6' d='M1365 720L1313 726L1293 671Z'/><path fill='#665448' stroke='#665448' stroke-width='.6' d='M880 607L877 590L883 596ZM1044 260L1051 260L1044 268ZM915 558L912 574L906 557ZM915 558L920 556L928 567ZM1220 475L1233 467L1233 472Z'/><path fill='#7e5436' stroke='#7e5436' stroke-width='.6' d='M914 738L871 739L868 732Z'/><path fill='#664e30' stroke='#664e30' stroke-width='.6' d='M787 793L794 795L798 807ZM865 560L874 545L878 568ZM891 368L887 362L896 356ZM887 362L891 368L886 362ZM891 368L882 369L886 362ZM912 195L933 209L918 213Z'/><path fill='#9c7e54' stroke='#9c7e54' stroke-width='.6' d='M970 400L978 415L957 412Z'/><path fill='#ccae90' stroke='#ccae90' stroke-width='.6' d='M982 409L970 400L998 398Z'/><path fill='#ccc0ae' stroke='#ccc0ae' stroke-width='.6' d='M971 527L999 501L1001 506ZM999 501L971 527L983 491ZM1065 475L1050 500L1045 484ZM1013 527L990 540L1001 506ZM979 479L986 488L983 491ZM1113 455L1153 434L1132 472ZM1014 348L1006 353L999 348Z'/><path fill='#c6bab4' stroke='#c6bab4' stroke-width='.6' d='M1045 555L1017 531L1051 522ZM1007 551L1013 527L1017 531ZM1066 509L1062 525L1051 522ZM1099 509L1113 506L1098 533ZM1085 466L1065 475L1059 468Z'/><path fill='#c6baa2' stroke='#c6baa2' stroke-width='.6' d='M1013 503L1013 527L1001 506ZM960 502L968 525L932 520Z'/><path fill='#c6baa8' stroke='#c6baa8' stroke-width='.6' d='M1017 531L1013 527L1013 503ZM998 345L1014 348L999 348ZM1181 479L1170 500L1132 472Z'/><path fill='#d2c6c0' stroke='#d2c6c0' stroke-width='.6' d='M1065 475L1066 509L1050 500ZM971 527L968 525L983 491ZM960 502L979 479L983 491Z'/><path fill='#d2c0a8' stroke='#d2c0a8' stroke-width='.6' d='M1059 468L1065 475L1045 484ZM964 536L968 525L971 531ZM1006 353L1014 348L1026 361ZM979 321L996 321L994 335Z'/><path fill='#ba9c84' stroke='#ba9c84' stroke-width='.6' d='M1058 452L1059 468L1040 459ZM932 381L943 387L926 389ZM1000 312L992 284L1016 286Z'/><path fill='#c0ae90' stroke='#c0ae90' stroke-width='.6' d='M986 488L989 469L1014 481ZM817 308L848 323L814 323Z'/><path fill='#b4a890' stroke='#b4a890' stroke-width='.6' d='M986 488L999 501L983 491ZM937 306L940 322L929 324ZM790 277L794 272L796 294Z'/><path fill='#c6a27e' stroke='#c6a27e' stroke-width='.6' d='M1045 484L1035 459L1040 459ZM873 472L866 458L879 465ZM998 414L982 409L998 398Z'/><path fill='#ba9672' stroke='#ba9672' stroke-width='.6' d='M1028 461L1035 459L1045 484ZM862 461L873 472L868 478Z'/><path fill='#785a48' stroke='#785a48' stroke-width='.6' d='M923 538L934 534L930 550Z'/><path fill='#483c36' stroke='#483c36' stroke-width='.6' d='M922 332L932 333L926 338Z'/><path fill='#423630' stroke='#423630' stroke-width='.6' d='M922 332L932 332L932 333Z'/><path fill='#846036' stroke='#846036' stroke-width='.6' d='M1200 566L1238 544L1244 555Z'/><path fill='#a2784e' stroke='#a2784e' stroke-width='.6' d='M1238 544L1246 553L1244 555Z'/><path fill='#a27848' stroke='#a27848' stroke-width='.6' d='M1238 544L1243 524L1246 553Z'/><path fill='#baa28a' stroke='#baa28a' stroke-width='.6' d='M877 246L896 259L872 251ZM814 323L848 323L820 338ZM1162 339L1166 337L1165 349ZM1025 327L1031 346L1014 348ZM998 268L988 271L1000 264Z'/><path fill='#b4a28a' stroke='#b4a28a' stroke-width='.6' d='M818 155L824 165L801 161ZM979 479L958 477L978 475ZM952 268L973 286L957 299ZM864 320L864 293L873 310ZM1119 102L1136 80L1155 100Z'/><path fill='#bac0c6' stroke='#bac0c6' stroke-width='.6' d='M814 104L783 108L788 77ZM783 108L784 77L788 77Z'/><path fill='#ccccd2' stroke='#ccccd2' stroke-width='.6' d='M964 113L967 98L997 122Z'/><path fill='#5a4e42' stroke='#5a4e42' stroke-width='.6' d='M979 179L977 165L982 161ZM1093 482L1105 489L1099 498Z'/><path fill='#544836' stroke='#544836' stroke-width='.6' d='M982 161L995 161L991 181ZM1288 803L1246 813L1285 791ZM1301 814L1285 791L1308 767ZM910 554L915 558L906 557ZM934 375L934 370L940 382ZM1024 192L1015 200L1016 182Z'/><path fill='#c0c0b4' stroke='#c0c0b4' stroke-width='.6' d='M847 168L842 166L872 152ZM842 166L835 161L872 152Z'/><path fill='#907866' stroke='#907866' stroke-width='.6' d='M847 168L847 189L835 169ZM1142 262L1133 282L1124 280ZM927 553L923 538L930 550Z'/><path fill='#7e7260' stroke='#7e7260' stroke-width='.6' d='M842 166L847 168L835 169ZM1200 174L1207 175L1206 180ZM970 387L988 364L998 398ZM1164 335L1168 324L1173 330ZM781 129L781 121L788 126ZM1031 159L1060 153L1058 173Z'/><path fill='#cca87e' stroke='#cca87e' stroke-width='.6' d='M895 454L882 439L895 441ZM917 431L906 448L895 441Z'/><path fill='#cca27e' stroke='#cca27e' stroke-width='.6' d='M895 454L879 465L882 439Z'/><path fill='#d2ae8a' stroke='#d2ae8a' stroke-width='.6' d='M879 465L866 458L882 439Z'/><path fill='#7e604e' stroke='#7e604e' stroke-width='.6' d='M864 580L832 577L858 568Z'/><path fill='#906c54' stroke='#906c54' stroke-width='.6' d='M835 551L833 544L850 549ZM852 536L857 544L850 549Z'/><path fill='#6c5442' stroke='#6c5442' stroke-width='.6' d='M838 509L836 530L833 530ZM1163 279L1156 278L1159 274ZM951 600L961 632L923 645ZM886 530L879 520L890 523ZM933 653L947 655L929 669ZM1022 174L1018 177L1010 164ZM1010 212L1015 224L1010 225ZM884 540L889 543L886 546Z'/><path fill='#9c7854' stroke='#9c7854' stroke-width='.6' d='M833 856L839 804L855 838ZM833 856L813 852L839 804ZM1048 581L1059 568L1062 594ZM941 417L930 410L952 409ZM908 209L909 222L892 226ZM905 502L886 504L890 493Z'/><path fill='#9c6c48' stroke='#9c6c48' stroke-width='.6' d='M859 853L833 856L855 838Z'/><path fill='#a88a72' stroke='#a88a72' stroke-width='.6' d='M1067 356L1049 365L1056 342ZM1019 375L1019 389L1013 386Z'/><path fill='#84785a' stroke='#84785a' stroke-width='.6' d='M1210 241L1196 247L1211 238Z'/><path fill='#c0a284' stroke='#c0a284' stroke-width='.6' d='M1156 377L1137 367L1145 362ZM910 506L930 487L925 515Z'/><path fill='#c0ae96' stroke='#c0ae96' stroke-width='.6' d='M1137 367L1135 348L1145 362ZM1143 349L1160 360L1145 362ZM973 286L961 309L957 299ZM1119 72L1098 85L1085 22ZM1009 333L1025 327L1014 348Z'/><path fill='#a2907e' stroke='#a2907e' stroke-width='.6' d='M1137 367L1123 361L1135 348ZM923 186L917 190L918 183ZM1170 500L1181 479L1188 491ZM1098 320L1100 306L1112 306ZM1188 476L1192 489L1181 479Z'/><path fill='#ae9c7e' stroke='#ae9c7e' stroke-width='.6' d='M1110 339L1102 342L1098 338Z'/><path fill='#ae9c78' stroke='#ae9c78' stroke-width='.6' d='M1102 342L1101 343L1098 338Z'/><path fill='#b4a296' stroke='#b4a296' stroke-width='.6' d='M1168 505L1167 508L1151 509ZM1084 137L1078 147L1079 133Z'/><path fill='#ae9c90' stroke='#ae9c90' stroke-width='.6' d='M1167 508L1167 518L1151 509Z'/><path fill='#b49666' stroke='#b49666' stroke-width='.6' d='M1221 497L1259 516L1243 524Z'/><path fill='#b49660' stroke='#b49660' stroke-width='.6' d='M1259 516L1273 493L1279 533Z'/><path fill='#8a8a84' stroke='#8a8a84' stroke-width='.6' d='M1244 340L1252 319L1315 373Z'/><path fill='#a29c8a' stroke='#a29c8a' stroke-width='.6' d='M1244 340L1245 328L1252 319Z'/><path fill='#908478' stroke='#908478' stroke-width='.6' d='M1237 417L1226 394L1246 417ZM963 321L967 333L946 323Z'/><path fill='#968478' stroke='#968478' stroke-width='.6' d='M1226 394L1226 390L1259 406Z'/><path fill='#b4a896' stroke='#b4a896' stroke-width='.6' d='M1197 182L1180 191L1166 161ZM1200 174L1197 182L1166 161ZM963 321L979 321L967 333Z'/><path fill='#9c8a78' stroke='#9c8a78' stroke-width='.6' d='M1084 137L1079 133L1102 118ZM1181 479L1192 489L1188 491ZM1020 253L1016 257L1006 249Z'/><path fill='#ae9078' stroke='#ae9078' stroke-width='.6' d='M1153 251L1160 250L1159 274ZM864 331L898 331L899 342ZM967 566L969 562L976 560Z'/><path fill='#6c6054' stroke='#6c6054' stroke-width='.6' d='M1156 278L1162 296L1146 292Z'/><path fill='#908a7e' stroke='#908a7e' stroke-width='.6' d='M1112 306L1132 307L1125 313ZM932 332L939 334L932 333Z'/><path fill='#72664e' stroke='#72664e' stroke-width='.6' d='M1112 306L1106 297L1123 284Z'/><path fill='#5a361e' stroke='#5a361e' stroke-width='.6' d='M1163 596L1169 580L1208 596ZM908 477L902 461L912 475Z'/><path fill='#66422a' stroke='#66422a' stroke-width='.6' d='M1169 580L1174 557L1200 566ZM920 574L925 579L922 580Z'/><path fill='#b49066' stroke='#b49066' stroke-width='.6' d='M1378 797L1365 793L1374 774ZM1204 525L1221 497L1243 524Z'/><path fill='#5a482a' stroke='#5a482a' stroke-width='.6' d='M841 661L862 643L848 667Z'/><path fill='#603c24' stroke='#603c24' stroke-width='.6' d='M869 580L877 590L864 580ZM1014 422L1004 411L1018 393ZM913 475L921 466L928 468Z'/><path fill='#d2c6b4' stroke='#d2c6b4' stroke-width='.6' d='M968 525L971 527L971 531ZM958 477L979 479L960 502ZM998 345L1009 333L1014 348ZM996 321L1009 333L994 335Z'/><path fill='#d2c6ba' stroke='#d2c6ba' stroke-width='.6' d='M971 527L990 540L971 531Z'/><path fill='#a28a78' stroke='#a28a78' stroke-width='.6' d='M1056 558L1069 552L1059 568ZM1153 277L1142 262L1159 274Z'/><path fill='#c6baae' stroke='#c6baae' stroke-width='.6' d='M1062 525L1069 552L1056 558ZM923 186L918 183L925 179Z'/><path fill='#604824' stroke='#604824' stroke-width='.6' d='M882 370L886 374L884 379ZM882 369L891 368L886 374Z'/><path fill='#b4a88a' stroke='#b4a88a' stroke-width='.6' d='M986 488L979 479L989 469Z'/><path fill='#ba9c72' stroke='#ba9c72' stroke-width='.6' d='M906 448L917 431L907 450Z'/><path fill='#a8845a' stroke='#a8845a' stroke-width='.6' d='M895 454L906 448L907 450ZM1204 525L1198 525L1192 512Z'/><path fill='#cca884' stroke='#cca884' stroke-width='.6' d='M913 426L917 431L895 441ZM856 456L862 461L858 461ZM873 472L862 461L866 458Z'/><path fill='#a8846c' stroke='#a8846c' stroke-width='.6' d='M922 423L930 426L928 428ZM885 398L886 383L898 402Z'/><path fill='#c6b49c' stroke='#c6b49c' stroke-width='.6' d='M978 475L958 468L963 458ZM958 477L958 468L978 475ZM922 332L903 319L929 324Z'/><path fill='#846c48' stroke='#846c48' stroke-width='.6' d='M937 451L946 456L930 454Z'/><path fill='#42240c' stroke='#42240c' stroke-width='.6' d='M930 454L921 466L907 450Z'/><path fill='#c0a896' stroke='#c0a896' stroke-width='.6' d='M903 319L922 332L918 337ZM964 395L970 387L970 400ZM848 323L864 320L853 329ZM1118 282L1119 262L1124 280Z'/><path fill='#6c665a' stroke='#6c665a' stroke-width='.6' d='M923 347L922 346L926 338ZM1108 501L1108 493L1117 500Z'/><path fill='#baa896' stroke='#baa896' stroke-width='.6' d='M883 281L867 284L872 251ZM849 219L858 209L878 228ZM796 294L794 272L825 280Z'/><path fill='#ae9c84' stroke='#ae9c84' stroke-width='.6' d='M883 281L888 291L867 284ZM853 329L864 320L864 331ZM861 193L858 209L847 189ZM1119 102L1136 120L1107 125ZM1049 365L1031 346L1056 342ZM1163 534L1134 546L1151 509ZM1025 327L1041 309L1056 342ZM888 291L864 293L867 284ZM1122 67L1131 20L1165 49Z'/><path fill='#aeaeae' stroke='#aeaeae' stroke-width='.6' d='M1000 158L982 161L997 122Z'/><path fill='#967e6c' stroke='#967e6c' stroke-width='.6' d='M829 160L824 165L818 155ZM824 165L829 160L835 169ZM917 190L912 195L909 190ZM1010 238L1020 253L1006 249Z'/><path fill='#9c8a7e' stroke='#9c8a7e' stroke-width='.6' d='M863 184L860 178L870 184Z'/><path fill='#c0aea2' stroke='#c0aea2' stroke-width='.6' d='M893 191L884 196L878 186Z'/><path fill='#cca88a' stroke='#cca88a' stroke-width='.6' d='M866 458L862 461L856 456Z'/><path fill='#c09c7e' stroke='#c09c7e' stroke-width='.6' d='M862 461L868 478L858 461ZM923 420L930 410L930 426ZM864 442L866 458L856 456ZM1184 443L1166 437L1173 436Z'/><path fill='#60544e' stroke='#60544e' stroke-width='.6' d='M987 359L1002 364L988 364Z'/><path fill='#a8aea2' stroke='#a8aea2' stroke-width='.6' d='M1252 443L1241 419L1246 417Z'/><path fill='#c6ae96' stroke='#c6ae96' stroke-width='.6' d='M1166 437L1181 479L1132 472ZM983 547L970 550L971 531Z'/><path fill='#605a48' stroke='#605a48' stroke-width='.6' d='M1273 493L1297 466L1327 496ZM975 589L973 597L966 584Z'/><path fill='#605a4e' stroke='#605a4e' stroke-width='.6' d='M1305 466L1319 460L1327 496Z'/><path fill='#604e42' stroke='#604e42' stroke-width='.6' d='M1164 335L1162 339L1158 337ZM963 381L961 387L952 380ZM1080 447L1064 442L1071 435Z'/><path fill='#8a7e72' stroke='#8a7e72' stroke-width='.6' d='M1244 340L1242 364L1237 350ZM1006 353L1002 364L999 348Z'/><path fill='#7e7e78' stroke='#7e7e78' stroke-width='.6' d='M1278 395L1242 364L1315 373Z'/><path fill='#72665a' stroke='#72665a' stroke-width='.6' d='M1205 199L1210 203L1210 205Z'/><path fill='#8a7e60' stroke='#8a7e60' stroke-width='.6' d='M1197 182L1205 183L1205 199Z'/><path fill='#8a7e6c' stroke='#8a7e6c' stroke-width='.6' d='M1208 171L1207 175L1200 174Z'/><path fill='#786c5a' stroke='#786c5a' stroke-width='.6' d='M1202 167L1208 171L1200 174ZM781 121L781 129L771 120ZM1018 177L1022 174L1033 184Z'/><path fill='#9c9078' stroke='#9c9078' stroke-width='.6' d='M1112 306L1100 306L1106 297ZM1166 337L1164 335L1173 330Z'/><path fill='#6c6654' stroke='#6c6654' stroke-width='.6' d='M998 345L987 359L994 335ZM1286 448L1297 466L1273 493Z'/><path fill='#5a5442' stroke='#5a5442' stroke-width='.6' d='M998 345L999 348L987 359Z'/><path fill='#baa890' stroke='#baa890' stroke-width='.6' d='M961 309L973 286L976 314ZM903 319L937 306L929 324ZM898 331L903 319L918 337ZM1093 324L1098 320L1110 328Z'/><path fill='#6c4e2a' stroke='#6c4e2a' stroke-width='.6' d='M1079 656L1106 600L1106 664ZM902 461L898 483L879 465ZM1035 635L1055 658L1000 684ZM933 209L923 221L918 213Z'/><path fill='#605436' stroke='#605436' stroke-width='.6' d='M1259 828L1246 813L1287 813Z'/><path fill='#5a483c' stroke='#5a483c' stroke-width='.6' d='M945 385L940 382L952 380ZM920 556L910 554L923 538ZM912 574L900 559L906 557ZM890 536L901 535L894 546ZM889 543L890 536L894 546ZM890 532L885 531L886 530Z'/><path fill='#d2c0b4' stroke='#d2c0b4' stroke-width='.6' d='M990 540L983 547L971 531Z'/><path fill='#d2a87e' stroke='#d2a87e' stroke-width='.6' d='M1035 459L1026 452L1040 459Z'/><path fill='#c69c72' stroke='#c69c72' stroke-width='.6' d='M1026 452L1032 426L1040 459Z'/><path fill='#c09c72' stroke='#c09c72' stroke-width='.6' d='M1026 452L1028 461L1025 459Z'/><path fill='#cca278' stroke='#cca278' stroke-width='.6' d='M1026 452L1035 459L1028 461Z'/><path fill='#7e6c60' stroke='#7e6c60' stroke-width='.6' d='M927 553L920 556L923 538ZM940 382L934 370L952 380ZM961 387L970 387L964 395Z'/><path fill='#5a3624' stroke='#5a3624' stroke-width='.6' d='M921 466L913 475L912 475Z'/><path fill='#4e2a12' stroke='#4e2a12' stroke-width='.6' d='M921 466L902 461L907 450Z'/><path fill='#482412' stroke='#482412' stroke-width='.6' d='M902 461L921 466L912 475Z'/><path fill='#906c42' stroke='#906c42' stroke-width='.6' d='M902 461L895 454L907 450ZM1175 541L1184 531L1187 536Z'/><path fill='#9c724e' stroke='#9c724e' stroke-width='.6' d='M895 454L902 461L879 465Z'/><path fill='#b4aeae' stroke='#b4aeae' stroke-width='.6' d='M950 347L939 334L951 344Z'/><path fill='#847e72' stroke='#847e72' stroke-width='.6' d='M939 334L940 328L943 326ZM1286 448L1245 474L1252 443Z'/><path fill='#baa290' stroke='#baa290' stroke-width='.6' d='M898 331L918 337L899 342Z'/><path fill='#ae9684' stroke='#ae9684' stroke-width='.6' d='M893 270L883 281L872 251Z'/><path fill='#c6ae9c' stroke='#c6ae9c' stroke-width='.6' d='M848 323L853 329L820 338Z'/><path fill='#d2d2d8' stroke='#d2d2d8' stroke-width='.6' d='M1055 138L1044 70L1072 83Z'/><path fill='#c09c78' stroke='#c09c78' stroke-width='.6' d='M866 458L864 442L882 439Z'/><path fill='#aea28a' stroke='#aea28a' stroke-width='.6' d='M1136 120L1123 133L1107 125ZM1098 85L1124 80L1106 96Z'/><path fill='#ccb4a2' stroke='#ccb4a2' stroke-width='.6' d='M1019 375L1006 369L1026 361Z'/><path fill='#baa884' stroke='#baa884' stroke-width='.6' d='M1175 317L1175 316L1198 311Z'/><path fill='#968a72' stroke='#968a72' stroke-width='.6' d='M1168 324L1175 317L1173 330Z'/><path fill='#301812' stroke='#301812' stroke-width='.6' d='M1114 363L1123 361L1127 368Z'/><path fill='#847866' stroke='#847866' stroke-width='.6' d='M1233 459L1227 449L1229 447ZM1098 320L1112 306L1119 317ZM1010 164L1025 153L1024 170ZM1233 459L1224 459L1227 449Z'/><path fill='#966c42' stroke='#966c42' stroke-width='.6' d='M1204 525L1238 544L1198 545Z'/><path fill='#c6a88a' stroke='#c6a88a' stroke-width='.6' d='M1185 432L1184 443L1173 436Z'/><path fill='#8a846c' stroke='#8a846c' stroke-width='.6' d='M1113 433L1153 434L1113 455ZM1098 320L1119 317L1110 328Z'/><path fill='#909084' stroke='#909084' stroke-width='.6' d='M1286 448L1252 443L1283 413Z'/><path fill='#666c60' stroke='#666c60' stroke-width='.6' d='M1319 460L1286 448L1283 413Z'/><path fill='#66665a' stroke='#66665a' stroke-width='.6' d='M1297 466L1286 448L1305 466ZM1286 448L1319 460L1305 466Z'/><path fill='#665a48' stroke='#665a48' stroke-width='.6' d='M1060 226L1039 234L1043 223ZM1051 259L1044 260L1048 253ZM1033 187L1024 192L1033 184Z'/><path fill='#b4a284' stroke='#b4a284' stroke-width='.6' d='M1031 346L1025 327L1056 342Z'/><path fill='#aea896' stroke='#aea896' stroke-width='.6' d='M987 359L973 334L994 335Z'/><path fill='#84663c' stroke='#84663c' stroke-width='.6' d='M1055 658L1065 668L1041 702Z'/><path fill='#482a18' stroke='#482a18' stroke-width='.6' d='M962 566L943 579L939 566Z'/><path fill='#907e72' stroke='#907e72' stroke-width='.6' d='M970 387L963 381L988 364Z'/><path fill='#42302a' stroke='#42302a' stroke-width='.6' d='M961 387L963 381L970 387ZM890 532L890 536L887 535ZM885 531L890 532L887 535Z'/><path fill='#84724e' stroke='#84724e' stroke-width='.6' d='M1014 582L1028 578L1024 594Z'/><path fill='#ae9672' stroke='#ae9672' stroke-width='.6' d='M975 552L969 562L970 550Z'/><path fill='#a87e54' stroke='#a87e54' stroke-width='.6' d='M982 409L998 414L978 415Z'/><path fill='#785a30' stroke='#785a30' stroke-width='.6' d='M898 483L887 489L879 465Z'/><path fill='#a8906c' stroke='#a8906c' stroke-width='.6' d='M817 308L814 323L801 316Z'/><path fill='#a89c84' stroke='#a89c84' stroke-width='.6' d='M817 308L796 294L825 280Z'/><path fill='#908a78' stroke='#908a78' stroke-width='.6' d='M781 129L775 134L771 120Z'/><path fill='#a88a60' stroke='#a88a60' stroke-width='.6' d='M898 483L905 502L890 493Z'/><path fill='#6c4824' stroke='#6c4824' stroke-width='.6' d='M860 441L859 442L837 437Z'/><path fill='#ccc6ba' stroke='#ccc6ba' stroke-width='.6' d='M1098 85L1106 96L1097 109Z'/><path fill='#847266' stroke='#847266' stroke-width='.6' d='M1006 353L1006 369L1002 364Z'/><path fill='#c6b4a2' stroke='#c6b4a2' stroke-width='.6' d='M1006 369L1006 353L1026 361Z'/><path fill='#967e5a' stroke='#967e5a' stroke-width='.6' d='M1245 474L1259 516L1221 497Z'/><path fill='#6c6048' stroke='#6c6048' stroke-width='.6' d='M1224 459L1217 466L1218 455ZM1168 324L1169 319L1175 317Z'/><path fill='#7e725a' stroke='#7e725a' stroke-width='.6' d='M1227 449L1224 459L1218 455Z'/><path fill='#907e6c' stroke='#907e6c' stroke-width='.6' d='M1188 476L1206 468L1210 482Z'/><path fill='#b49072' stroke='#b49072' stroke-width='.6' d='M1209 376L1211 367L1218 368Z'/><path fill='#ccc6b4' stroke='#ccc6b4' stroke-width='.6' d='M1009 333L998 345L994 335Z'/><path fill='#726654' stroke='#726654' stroke-width='.6' d='M1051 259L1051 260L1044 260ZM1245 474L1233 467L1233 459ZM889 543L889 537L890 536Z'/><path fill='#664e42' stroke='#664e42' stroke-width='.6' d='M1082 259L1051 259L1048 253Z'/><path fill='#422412' stroke='#422412' stroke-width='.6' d='M1070 663L1055 658L1079 656ZM868 478L870 480L867 509Z'/><path fill='#3c240c' stroke='#3c240c' stroke-width='.6' d='M1070 663L1079 656L1081 675Z'/><path fill='#5a4e48' stroke='#5a4e48' stroke-width='.6' d='M930 364L922 363L924 357Z'/><path fill='#605448' stroke='#605448' stroke-width='.6' d='M930 364L934 370L925 370Z'/><path fill='#363024' stroke='#363024' stroke-width='.6' d='M1108 493L1105 500L1099 498Z'/><path fill='#545442' stroke='#545442' stroke-width='.6' d='M1108 493L1108 501L1105 500Z'/><path fill='#726c60' stroke='#726c60' stroke-width='.6' d='M1108 493L1116 479L1117 500Z'/><path fill='#a2968a' stroke='#a2968a' stroke-width='.6' d='M1116 479L1119 476L1117 500Z'/><path fill='#96847e' stroke='#96847e' stroke-width='.6' d='M1106 467L1116 479L1108 481Z'/><path fill='#ae9c96' stroke='#ae9c96' stroke-width='.6' d='M1106 467L1119 476L1116 479Z'/><path fill='#482a12' stroke='#482a12' stroke-width='.6' d='M870 480L887 489L874 501Z'/><path fill='#ccbaae' stroke='#ccbaae' stroke-width='.6' d='M848 323L845 299L864 320Z'/><path fill='#c0b4a2' stroke='#c0b4a2' stroke-width='.6' d='M845 299L864 293L864 320ZM864 293L836 286L867 284Z'/><path fill='#baa89c' stroke='#baa89c' stroke-width='.6' d='M794 272L787 277L786 266Z'/><path fill='#7e7866' stroke='#7e7866' stroke-width='.6' d='M1025 153L1031 159L1024 170Z'/><path fill='#3c302a' stroke='#3c302a' stroke-width='.6' d='M1171 312L1163 313L1165 310Z'/><path fill='#665a42' stroke='#665a42' stroke-width='.6' d='M1169 319L1171 312L1175 316Z'/><path fill='#d2baa8' stroke='#d2baa8' stroke-width='.6' d='M996 321L1012 318L1009 333Z'/><path fill='#726054' stroke='#726054' stroke-width='.6' d='M885 531L876 536L876 531ZM964 575L960 583L943 579ZM1220 475L1233 472L1221 497Z'/><path fill='#545a4e' stroke='#545a4e' stroke-width='.6' d='M957 360L955 354L970 359Z'/><path fill='#7e726c' stroke='#7e726c' stroke-width='.6' d='M1079 451L1085 466L1059 468Z'/><path fill='#baae96' stroke='#baae96' stroke-width='.6' d='M787 277L790 277L796 294Z'/><path fill='#ccc0a8' stroke='#ccc0a8' stroke-width='.6' d='M1131 20L1122 67L1085 22Z'/><path fill='#725a4e' stroke='#725a4e' stroke-width='.6' d='M901 535L901 523L910 534ZM901 535L892 533L896 528Z'/><path fill='#6c5448' stroke='#6c5448' stroke-width='.6' d='M901 523L901 535L896 528Z'/><path fill='#ae907e' stroke='#ae907e' stroke-width='.6' d='M965 571L964 575L962 566Z'/><path fill='#ba9c8a' stroke='#ba9c8a' stroke-width='.6' d='M967 566L965 571L962 566Z'/><path fill='#a28472' stroke='#a28472' stroke-width='.6' d='M965 571L967 566L968 572Z'/><path fill='#6c6660' stroke='#6c6660' stroke-width='.6' d='M957 346L951 344L967 333Z'/><path fill='#908a84' stroke='#908a84' stroke-width='.6' d='M957 346L950 347L951 344Z'/><path fill='#605a54' stroke='#605a54' stroke-width='.6' d='M1112 461L1111 459L1113 455Z'/><path fill='#2a1e1e' stroke='#2a1e1e' stroke-width='.6' d='M1110 456L1111 459L1105 466Z'/><path fill='#78665a' stroke='#78665a' stroke-width='.6' d='M892 533L901 535L890 536Z'/><path fill='#3c3630' stroke='#3c3630' stroke-width='.6' d='M1111 459L1111 461L1105 466Z'/><path fill='#544e4e' stroke='#544e4e' stroke-width='.6' d='M1111 461L1111 459L1112 461Z'/><path fill='#302a24' stroke='#302a24' stroke-width='.6' d='M1111 461L1106 467L1105 466Z'/><path fill='#423c3c' stroke='#423c3c' stroke-width='.6' d='M1111 461L1112 461L1106 467Z'/>", '#6b5236') },
    { name: 'ベンガル（ジャングル）', dir: '7.1-Polaris', file: 'bengal-jungle', css: svgWall(
      "<defs><radialGradient id='g' cx='.68' cy='.5' r='.9'><stop offset='0' stop-color='#1f4a36'/><stop offset='.55' stop-color='#0c241b'/><stop offset='1' stop-color='#030b08'/></radialGradient>" +
      "<linearGradient id='f' x1='0' y1='0' x2='.3' y2='1'><stop offset='0' stop-color='#f6c56f'/><stop offset='.55' stop-color='#df9238'/><stop offset='1' stop-color='#a85a1e'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='14'/></filter>" +
      "<path id='cat' d='M870 940C800 900 800 760 880 660C910 610 930 570 960 540C990 500 1020 470 1042 440C1026 400 1024 340 1040 300L1046 186L1098 262C1116 255 1134 255 1150 262L1204 192L1206 304C1224 340 1226 392 1202 426C1186 450 1160 466 1136 472C1164 540 1184 650 1184 760C1188 840 1202 900 1212 940Z'/>" +
      "<clipPath id='c'><use href='#cat'/></clipPath><path id='l' d='" + LEAF + "'/>" +
      "<g id='ro'><ellipse rx='22' ry='15' fill='#9c4f1a' opacity='.75'/><ellipse rx='22' ry='15' fill='none' stroke='#2a140a' stroke-width='6' stroke-dasharray='26 7 16 9'/></g></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><ellipse cx='1060' cy='560' rx='360' ry='420' fill='#4f9a6a' opacity='.22' filter='url(#s)'/>" +
      "<g fill='#0a2a1c'>" + [[60, 120, 20, .9], [-20, 820, -30, 1.1], [1560, 60, 160, .8], [1640, 900, 200, 1], [260, 1010, -70, .9]].map(([x, y, d, k]) => "<use href='#l' transform='translate(" + x + ' ' + y + ') rotate(' + d + ') scale(' + k + ")'/>").join('') + '</g>' +
      "<g fill='#123c29' opacity='.8'>" + [[0, 400, -10, .7], [1600, 520, 190, .7], [520, -20, 70, .6]].map(([x, y, d, k]) => "<use href='#l' transform='translate(" + x + ' ' + y + ') rotate(' + d + ') scale(' + k + ")'/>").join('') + '</g>' +
      "<path d='M905 925C780 965 690 905 716 822C732 768 790 752 806 792' fill='none' stroke='url(#f)' stroke-width='36' stroke-linecap='round'/>" +
      "<path d='M905 925C780 965 690 905 716 822C732 768 790 752 806 792' fill='none' stroke='#2a140a' stroke-width='36' stroke-dasharray='16 30' opacity='.8'/>" +
      "<use href='#cat' fill='url(#f)'/><g clip-path='url(#c)'>" +
      "<ellipse cx='1140' cy='720' rx='56' ry='230' fill='#fbe4b8' opacity='.7' filter='url(#b)'/><ellipse cx='1122' cy='430' rx='70' ry='38' fill='#fbe4b8' opacity='.8' filter='url(#b)'/>" +
      Array.from({ length: 63 }, (_, i) => { const r = rnd(131 + i * 7), X = 820 + (i % 7) * 62 + ((i / 7 | 0) % 2) * 31 + Math.round(r() * 18 - 9), Y = 480 + (i / 7 | 0) * 52 + Math.round(r() * 16 - 8); return "<use href='#ro' transform='translate(" + X + ' ' + Y + ') rotate(' + Math.round(r() * 60 - 30) + ') scale(' + (r() * .45 + .65).toFixed(2) + ")'/>"; }).join('') +
      "<g fill='none' stroke='#2a140a' stroke-width='6' stroke-linecap='round' opacity='.85'><path d='M1092 270C1100 290 1104 300 1106 312M1122 262V306M1152 270C1144 290 1140 300 1138 312M1058 360C1046 374 1044 392 1050 410M1186 360C1198 374 1200 392 1194 410M1074 376C1066 392 1068 410 1078 422M1170 376C1178 392 1176 410 1166 422'/></g>" +
      "<path d='M1118 780C1112 840 1110 900 1112 940M1016 940C1060 930 1090 932 1112 940' fill='none' stroke='#7a3d12' stroke-width='4' stroke-linecap='round' opacity='.5'/>" +
      "<path d='M1052 220L1066 252L1094 264Z M1198 210L1186 248L1156 264Z' fill='#e9a6a0' opacity='.5'/></g>" +
      "<g><path d='M1068 352C1078 336 1102 334 1112 352C1102 368 1078 368 1068 352Z' fill='#9be06a'/><path d='M1132 352C1142 336 1166 334 1176 352C1166 368 1142 368 1132 352Z' fill='#9be06a'/>" +
      "<ellipse cx='1090' cy='352' rx='4' ry='13' fill='#111'/><ellipse cx='1154' cy='352' rx='4' ry='13' fill='#111'/><circle cx='1094' cy='346' r='2.5' fill='#fff'/><circle cx='1158' cy='346' r='2.5' fill='#fff'/>" +
      "<path d='M1068 352C1078 336 1102 334 1112 352C1102 368 1078 368 1068 352ZM1132 352C1142 336 1166 334 1176 352C1166 368 1142 368 1132 352Z' fill='none' stroke='#1a0d06' stroke-width='3'/>" +
      "<path d='M1112 398L1132 398L1122 410Z' fill='#d9827a'/><path d='M1122 410V422M1122 422C1114 430 1104 430 1098 424M1122 422C1130 430 1140 430 1146 424' fill='none' stroke='#2a140a' stroke-width='2.5' stroke-linecap='round'/>" +
      "<g stroke='#fff8ec' stroke-width='1.6' opacity='.7' stroke-linecap='round'><path d='M1098 412L1010 396M1098 418L1006 420M1100 424L1014 446M1146 412L1234 396M1146 418L1238 420M1144 424L1230 446'/></g></g>", '#0c241b') },
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
