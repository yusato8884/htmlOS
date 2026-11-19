/* HTUi SDK 3.0（コードネーム Venus）— htmlOS の描画エンジン。ウィンドウマネージャ・ダイアログと、デスクトップ環境（セッション）の土台。
   2（Jupiter）で子ウインドウ（htui.open の parent）に対応し、確認などのダイアログは開いたウインドウの子ウインドウとして出る。
   3.0（Venus）で、ボタン・入力欄・チェックボックス・スライダー・スクロールバーなどを独自のデザインにし、
   WebView（htui.WebView）と、タイトルバーにアプリ独自のボタンを置くキャプションボタン（htui.open の buttons / win.addButton）を追加した。
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
  const WALLPAPERS = [
    { name: 'ブルーム', css: svgWall(
      "<defs><radialGradient id='g' cx='.63' cy='.58' r='.85'><stop offset='0' stop-color='#2a6ae0'/><stop offset='.5' stop-color='#0f3184'/><stop offset='1' stop-color='#060f2a'/></radialGradient>" +
      "<linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#d4ecff'/><stop offset='.4' stop-color='#5aa6ff'/><stop offset='1' stop-color='#1746d1' stop-opacity='.15'/></linearGradient>" +
      "<linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9fd8ff'/><stop offset='1' stop-color='#2a5cff' stop-opacity='.1'/></linearGradient>" +
      "<filter id='s' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='30'/></filter><path id='l' d='" + LEAF + "'/></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><g transform='translate(1010 560)'>" +
      "<g filter='url(#s)' opacity='.8'>" + [-150, -105, -60, -15, 30, 75, 120].map((d, i) => "<use href='#l' fill='url(#" + (i % 2 ? 'b' : 'a') + ")' transform='rotate(" + d + ")'/>").join('') + '</g>' +
      "<g opacity='.6'>" + [-128, -83, -38, 7, 52, 97].map((d, i) => "<use href='#l' fill='url(#" + (i % 2 ? 'a' : 'b') + ")' transform='rotate(" + d + ") scale(.82)'/>").join('') + '</g>' +
      "<circle r='70' fill='#cfe8ff' opacity='.35' filter='url(#s)'/></g>", '#0f3184') },
    { name: '波', css: svgWall(
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
    { name: '夕焼けの山', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1d1238'/><stop offset='.42' stop-color='#64306a'/><stop offset='.68' stop-color='#cf5f78'/><stop offset='.84' stop-color='#f4a46a'/><stop offset='1' stop-color='#fbd590'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(60, 360, 3) +
      "<circle cx='1060' cy='620' r='250' fill='#ffb47a' opacity='.35' filter='url(#s)'/><circle cx='1060' cy='620' r='110' fill='#ffe0aa'/>" +
      "<path d='M0 640L180 560L320 610L520 500L700 590L860 530L1040 600L1220 520L1400 580L1600 540V1000H0Z' fill='#b4527c' opacity='.6'/>" +
      "<path d='M0 720L160 650L300 700L480 610L640 690L820 640L980 710L1160 630L1340 700L1600 650V1000H0Z' fill='#7b305f'/>" +
      "<path d='M0 800L220 730L420 790L600 720L780 800L980 750L1180 820L1380 760L1600 810V1000H0Z' fill='#47204e'/>" +
      "<path d='M0 900C300 840 520 900 800 870S1300 840 1600 890V1000H0Z' fill='#1f1030'/>", '#64306a') },
    { name: 'オーロラ', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#03060f'/><stop offset='.6' stop-color='#081a2c'/><stop offset='1' stop-color='#0d2836'/></linearGradient>" +
      "<filter id='s' x='-20%' y='-80%' width='140%' height='260%'><feGaussianBlur stdDeviation='32'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(110, 700, 11) +
      "<g fill='none' stroke-linecap='round' filter='url(#s)'><path d='M-100 430C300 250 600 520 900 330S1500 260 1750 380' stroke='#35f0b0' stroke-width='110' opacity='.55'/>" +
      "<path d='M-100 540C350 400 650 620 1000 450S1500 400 1750 500' stroke='#2fb6e8' stroke-width='80' opacity='.42'/>" +
      "<path d='M200 300C500 180 800 380 1100 260S1500 220 1700 300' stroke='#9a6cff' stroke-width='70' opacity='.38'/></g>" +
      "<g fill='none' stroke='#b8ffe4' stroke-width='3' opacity='.25'><path d='M-100 430C300 250 600 520 900 330S1500 260 1750 380'/></g>" +
      "<path d='M0 860C300 800 500 880 800 840S1300 790 1600 850V1000H0Z' fill='#050a12'/>" +
      "<path d='M0 930C260 900 560 940 900 915S1400 900 1600 930V1000H0Z' fill='#02050a'/>", '#081a2c') },
    { name: '砂丘', css: svgWall(
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
    { name: 'グラファイト', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0e0f12'/><stop offset='1' stop-color='#1d2026'/></linearGradient>" +
      "<radialGradient id='a' cx='.76' cy='.24' r='.5'><stop offset='0' stop-color='#46506a' stop-opacity='.55'/><stop offset='1' stop-color='#46506a' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='b' cx='.2' cy='.86' r='.45'><stop offset='0' stop-color='#3a3346' stop-opacity='.5'/><stop offset='1' stop-color='#3a3346' stop-opacity='0'/></radialGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><rect width='1600' height='1000' fill='url(#a)'/><rect width='1600' height='1000' fill='url(#b)'/>" +
      "<g transform='translate(860 220) scale(30)' fill='none' stroke='#fff' stroke-width='.16' stroke-linecap='round' stroke-linejoin='round' opacity='.07'><path d='M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'/></g>", '#16181c') },
    // ---- 4.0 Vega で追加した壁紙
    { name: 'ベガ（こと座）', css: svgWall(
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
    { name: '金星', css: svgWall(
      "<defs><radialGradient id='g' cx='.3' cy='.4' r='.9'><stop offset='0' stop-color='#3a1d0e'/><stop offset='.5' stop-color='#160a07'/><stop offset='1' stop-color='#050303'/></radialGradient>" +
      "<radialGradient id='p' cx='.38' cy='.36' r='.7'><stop offset='0' stop-color='#fff1c9'/><stop offset='.35' stop-color='#f3c27a'/><stop offset='.7' stop-color='#c5793a'/><stop offset='1' stop-color='#5b2a10'/></radialGradient>" +
      "<radialGradient id='a' cx='.5' cy='.5' r='.5'><stop offset='.82' stop-color='#ffd28a' stop-opacity='0'/><stop offset='.9' stop-color='#ffd28a' stop-opacity='.45'/><stop offset='1' stop-color='#ffb35a' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='sh' x1='0' y1='0' x2='1' y2='.4'><stop offset='.35' stop-color='#000' stop-opacity='0'/><stop offset='.75' stop-color='#000' stop-opacity='.85'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='40'/></filter><clipPath id='c'><circle cx='1000' cy='520' r='330'/></clipPath></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" + stars(90, 1000, 29) +
      "<circle cx='1000' cy='520' r='380' fill='#ff9d45' opacity='.25' filter='url(#s)'/><circle cx='1000' cy='520' r='330' fill='url(#p)'/>" +
      "<g clip-path='url(#c)' fill='none' stroke='#fff3d6' stroke-linecap='round' opacity='.22'><path d='M640 420C820 380 980 470 1360 400' stroke-width='26'/><path d='M640 520C860 470 1040 580 1360 500' stroke-width='18'/><path d='M640 640C840 600 1060 690 1360 610' stroke-width='30'/></g>" +
      "<circle cx='1000' cy='520' r='330' fill='url(#sh)'/><circle cx='1000' cy='520' r='365' fill='url(#a)'/>", '#160a07') },
    { name: '桜', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff4f7'/><stop offset='.55' stop-color='#fbd3e0'/><stop offset='1' stop-color='#f19bb8'/></linearGradient>" +
      "<path id='pt' d='M0-22C9-22 14-12 9 0L0 18L-9 0C-14-12-9-22 0-22Z'/>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='5'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<path d='M1600 120C1420 160 1300 240 1180 300S960 380 860 470M1300 238C1340 320 1330 380 1300 440M1060 350C1020 300 960 280 900 290' stroke='#6b3a3f' stroke-width='14' fill='none' stroke-linecap='round' opacity='.75'/>" +
      scatter(70, 31, (x, y, r, a, o) => "<use href='#pt' fill='" + (r > .5 ? '#ffffff' : '#ffc4d6') + "' opacity='" + (o * .8 + .2).toFixed(2) + "' transform='translate(" + x + ' ' + y + ') rotate(' + Math.round(a * 360) + ') scale(' + (r * .9 + .4).toFixed(2) + ")'" + (r < .25 ? " filter='url(#s)'" : '') + '/>'), '#fbd3e0') },
    { name: '森', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d9eedb'/><stop offset='.5' stop-color='#9bc9a2'/><stop offset='1' stop-color='#2f5f3c'/></linearGradient>" +
      "<linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#fff' stop-opacity='.55'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='1220' cy='230' r='90' fill='#fffbe6' opacity='.8'/>" +
      [['#7fb08a', 560, 70, 41], ['#5b9268', 650, 85, 43], ['#3d7550', 750, 100, 47], ['#24563a', 860, 120, 53]].map(L => "<path d='" + trees(L[1], L[2], L[3]) + "' fill='" + L[0] + "'/>").join('') +
      "<rect y='500' width='1600' height='500' fill='url(#m)' opacity='.6'/>", '#9bc9a2') },
    { name: 'プリズム', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#18123a'/><stop offset='1' stop-color='#2b0f3d'/></linearGradient>" +
      "<linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#47e3ff'/><stop offset='1' stop-color='#4b6bff'/></linearGradient>" +
      "<linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ff5fa2'/><stop offset='1' stop-color='#8a3dff'/></linearGradient>" +
      "<linearGradient id='c' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#ffb84d'/><stop offset='1' stop-color='#ff4f7b'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='50'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<g filter='url(#s)' opacity='.7'><circle cx='420' cy='300' r='260' fill='#4b6bff'/><circle cx='1200' cy='700' r='300' fill='#ff4f9a'/><circle cx='1000' cy='240' r='200' fill='#8a3dff'/></g>" +
      "<g style='mix-blend-mode:screen'><path d='M560 760L860 180L1160 760Z' fill='url(#a)' opacity='.55'/><path d='M700 820L1000 260L1300 820Z' fill='url(#b)' opacity='.5'/><path d='M420 700L720 260L960 820Z' fill='url(#c)' opacity='.4'/></g>" +
      "<g fill='none' stroke='#fff' stroke-width='1.5' opacity='.35'><path d='M560 760L860 180L1160 760Z'/><path d='M700 820L1000 260L1300 820Z'/></g>", '#18123a') },
    { name: '朝の湖', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#bcd9f2'/><stop offset='.5' stop-color='#f5dcc8'/><stop offset='.5' stop-color='#d3c4c9'/><stop offset='1' stop-color='#7d97b5'/></linearGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='30'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='800' cy='470' r='150' fill='#fff1df' opacity='.8' filter='url(#s)'/><circle cx='800' cy='470' r='54' fill='#fff8ee'/>" +
      "<path d='M0 500L180 400L330 450L520 330L720 460L900 380L1080 450L1260 360L1440 430L1600 390V500Z' fill='#8ea3c0'/>" +
      "<path d='M0 500L240 440L420 480L640 420L860 490L1100 430L1320 480L1600 440V500Z' fill='#6d84a6'/>" +
      "<g opacity='.35' transform='translate(0 1000) scale(1 -1)'><path d='M0 500L180 400L330 450L520 330L720 460L900 380L1080 450L1260 360L1440 430L1600 390V500Z' fill='#8ea3c0'/></g>" +
      "<g stroke='#fff' stroke-linecap='round' opacity='.5'><path d='M700 540H900M730 575H870M760 610H840M650 660H950' stroke-width='3'/></g>", '#d3c4c9') }
  ];
  // 壁紙の CSS。prefs.wallpaper が 'custom' なら、そのユーザーの ~/.config/wallpaper（画像の data: URL）を使う
  function wallCss(prefs, user) {
    const p = prefs || {};
    if (p.wallpaper === 'custom' && user) {
      try { const d = fs.read(users.home(user) + '/.config/wallpaper'); if (d) return 'url("' + d + '") center / cover no-repeat #000'; } catch (e) { /* 画像がなければ既定の壁紙 */ }
    }
    return (WALLPAPERS[p.wallpaper | 0] || WALLPAPERS[0]).css;
  }
  const ACCENTS = ['#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac'];

  const htui = OS.htui = { running: false, user: null, fs: null, wins: [], z: 10, pid: 100, wallpapers: WALLPAPERS, wallCss: wallCss, accents: ACCENTS, el: null, prefs: {}, shell: null, sessionId: null };
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
  // ハイバーネートから戻る: そのユーザーがログインしたら、ウィンドウを開き直す
  function resume(user) {
    const img = OS.hibernation && OS.hibernation();
    if (!img || img.user !== user) return;
    OS.hibernation(null);
    const dw = htui.desk ? htui.desk.clientWidth : 800, dh = htui.desk ? htui.desk.clientHeight : 600;
    let n = 0;
    (img.wins || []).forEach(s => {
      const before = new Set(htui.wins);
      try { OS.launch(s.app, s.arg || undefined); } catch (e) { return; }
      const w = htui.wins.find(x => !before.has(x) && !x.parent); if (!w) return;
      n++;
      if (s.w && s.h) {
        const ww = Math.min(s.w, dw), hh = Math.min(s.h, dh);
        w.el.style.width = ww + 'px'; w.el.style.height = hh + 'px';
        w.el.style.left = Math.max(0, Math.min(s.x, dw - ww)) + 'px'; w.el.style.top = Math.max(0, Math.min(s.y, dh - hh)) + 'px';
      }
      if (s.max && !w.el.classList.contains('max')) { const b = w.el.querySelector('.win-btn[aria-label="最大化"]'); if (b) b.click(); }
      if (s.min) w.minimize();
    });
    OS.notify({ app: '電源管理', icon: 'battery', title: '休止状態から戻りました', body: n ? 'ウィンドウを ' + n + ' 個開き直しました' : '開いていたウィンドウはありません' });
  }
  // ログイン画面（hdm）へ
  function toLogin() {
    if (htui.user && OS.ipc) { try { OS.ipc.publish('session.logout', { user: htui.user }, 'htui'); } catch (e) { /* 無視 */ } }
    clearShell();
    htui.user = null; htui.fs = null; htui.prefs = {};
    OS.setMode('auto');
    htui.el.textContent = ''; htui.el.removeAttribute('style'); htui.el.className = ''; htui.locked = false;
    if (OS.power) OS.power.apply();
    OS.hdm.show(htui.el, (user, sid) => { session(user, sid); OS.sound.play('login'); resume(user); });
    const hib = OS.hibernation && OS.hibernation();
    if (hib && users.get(hib.user)) setTimeout(() => OS.ui.toast('休止状態です。' + hib.user + ' でログインすると、元のウィンドウに戻ります'), 300);
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
    htui.user = user;
    if (OS.ipc) { try { OS.ipc.publish('session.login', { user: user }, 'htui'); } catch (e) { /* 無視 */ } }
    htui.fs = OS.fsFor(() => htui.user);
    const sh = OS.sessions[sid] || OS.sessions[OS.hdm.sessionFor(user)] || OS.sessions.htui;
    htui.shell = sh; htui.sessionId = sh.id;
    htui.el.textContent = ''; htui.el.className = 'desktop de-' + sh.id;
    htui.prefs = loadPrefs(); applyPrefs();
    sh.build(kit);
    if (!htui.desk) kit.desk(false, true);
    if (!htui.tasks) htui.tasks = h('div'); // タスクボタンを出さない環境でも、ウィンドウ側が参照するので置き場だけ作る
    // タッチ用の下部ナビ。HTUi だけが使う（ほかの環境は、それぞれのやり方で操作する）
    if (sh.touchNav) {
      const navBtn = (icon, label, fn) => h('button', { class: 'nav-btn', type: 'button', onclick: fn }, OS.icon(icon, 22), h('span', null, label));
      htui.el.append(h('div', { class: 'tabbar' },
        navBtn('x', '閉じる', () => { const w = htui.active(); if (w) w.close(); }),
        navBtn('home', 'ホーム', goHome),
        navBtn('grid', 'タスク', switcher)));
    }
    htui.notices = [];
    OS.notify({ app: 'htmlOS', icon: 'user', title: 'ようこそ、' + user + ' さん', body: sh.name + ' にログインしました', silent: true });
    const tick = () => ticks.forEach(f => { try { f(new Date()); } catch (e) { /* 無視 */ } });
    tick(); if (!(OS.init && OS.init.has('clock.service'))) clockTimer = setInterval(tick, 5000);
    // ログインセッションのプロセス（アプリのウインドウはこの子になる）
    if (OS.proc) {
      const hs = OS.init && OS.init.state('htui.service');
      htui.sessionProc = OS.proc.spawn({ name: 'htui-session', cmd: 'htui-session ' + sh.id + '（' + user + '）', user: user, kind: 'session', ppid: (hs && hs.pid) || 1,
        onsignal: sig => { if (sig === 'KILL') { htui.wins.slice().forEach(w => w.close(true)); toLogin(); } else htui.logout(); return true; } });
    }
    htui.refreshApps(); htui.refreshUser(); htui.syncMode(); htui.syncTitle(); watchDesk();
    if (sh.onStart) sh.onStart(kit);
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
      Object.values(OS.apps).forEach(a => box.append(h('button', { class: 'desk-icon', type: 'button', title: a.desc || a.name, 'data-app': a.id, onclick: () => run(a.id) },
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
      { label: '左上に配置', act: () => w.snap('tl') }, { label: '右上に配置', act: () => w.snap('tr') },
      { label: '左下に配置', act: () => w.snap('bl') }, { label: '右下に配置', act: () => w.snap('br') },
      { sep: true }, { label: '閉じる', icon: 'x', act: () => w.close() }
    ];
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
    const vis = htui.wins.filter(w => !w.el.classList.contains('hidden'));
    if (htui.wins.length) items.push({ sep: true }, vis.length ? { label: 'すべてのウィンドウを最小化', icon: 'min', act: () => vis.forEach(w => w.minimize()) } : { label: 'すべてのウィンドウを戻す', icon: 'max', act: () => htui.wins.forEach(w => w.focus()) });
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
    apps: () => Object.values(OS.apps),
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
  const ZONES = { max: [0, 0, 100, 100], left: [0, 0, 50, 100], right: [50, 0, 50, 100], tl: [0, 0, 50, 50], tr: [50, 0, 50, 50], bl: [0, 50, 50, 50], br: [50, 50, 50, 50] };
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
  htui.wire = function (from, to, ms, cb) {
    const hr = htui.el.getBoundingClientRect();
    const put = r => ({ left: (r.left - hr.left) + 'px', top: (r.top - hr.top) + 'px', width: Math.max(8, r.width) + 'px', height: Math.max(8, r.height) + 'px' });
    const f = h('div', { class: 'wire', 'aria-hidden': 'true' });
    Object.assign(f.style, put(from)); htui.el.append(f);
    let fin = false;
    const done = () => { if (fin) return; fin = true; f.remove(); if (cb) cb(); };
    if (!f.animate) { done(); return; }
    const a = f.animate([Object.assign(put(from), { opacity: 1 }), Object.assign(put(to), { opacity: 0.35 })], { duration: ms || 220, easing: 'cubic-bezier(.4,0,.6,1)' });
    a.onfinish = done; a.oncancel = done;
    setTimeout(done, (ms || 220) + 200); // 念のため
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
  htui.sdk = { name: 'HTUi SDK', version: '3.0.1', codename: 'Venus', full: 'HTUi SDK 3.0.1 (Venus)' };
  // Venus のスライダー: 値までを色で塗るために --v-p を入れる
  const rangeFill = r => { const mn = +r.min || 0, mx = r.max === '' ? 100 : +r.max, v = +r.value; r.style.setProperty('--v-p', (mx > mn ? (v - mn) / (mx - mn) * 100 : 0) + '%'); };
  htui.syncRanges = root => (root || document).querySelectorAll('input[type=range]').forEach(rangeFill);
  document.addEventListener('input', e => { if (e.target && e.target.type === 'range') rangeFill(e.target); }, true);
  if (window.MutationObserver) {
    let rq = 0;
    new MutationObserver(() => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; const r = document.getElementById('os-root'); if (r) htui.syncRanges(r); }); }).observe(document.body, { childList: true, subtree: true });
  }
  htui.active = () => htui.wins.find(w => hasActive(w) && !w.el.classList.contains('hidden')) || null;
  // 子ウインドウも含めた、すべてのウインドウ
  htui.allWins = () => { const out = [], add = w => { out.push(w); w.children.forEach(add); }; htui.wins.forEach(add); return out; };
  const rootOf = w => { while (w.parent) w = w.parent; return w; };

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

  // ---------- HTUi SDK 2（Jupiter）〜 3.0（Venus）: ウインドウ
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
    bMax.addEventListener('click', toggleMax);
    bMax.addEventListener('contextmenu', e => {
      e.preventDefault();
      menu(bMax, [['左半分', 'left'], ['右半分', 'right'], ['左上', 'tl'], ['右上', 'tr'], ['左下', 'bl'], ['右下', 'br'], ['最大化', 'max']]
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
        if (moved && zone) { win.snap(zone); win.rect = startRect; }
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
    const vis = htui.wins.filter(w => !w.el.classList.contains('hidden') && !w.el.classList.contains('minimizing'));
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
  function hotkeys(e) {
    if (htui.locked) return; // ロック中はショートカットを使わない
    superAlone = e.key === 'Meta' && !e.repeat ? true : e.key === 'Meta' ? superAlone : false;
    if (ats && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); altTabEnd(true); return; }
    if (htui.user && e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'Tab' || e.code === 'Backquote') && !htui.el.querySelector('.modal-ov')) {
      e.preventDefault(); e.stopPropagation(); altTab(e.shiftKey); return;
    }
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
