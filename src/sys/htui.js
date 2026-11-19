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
      "<g stroke='#fff' stroke-linecap='round' opacity='.5'><path d='M700 540H900M730 575H870M760 610H840M650 660H950' stroke-width='3'/></g>", '#d3c4c9') },
    // ---- htmlOS 6（Deneb）で追加
    { name: 'デネブ（はくちょう座）', css: svgWall(
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
    { name: 'ラグドール（ローポリ）', css: svgWall("<path fill='#7d8ca0' stroke='#7d8ca0' stroke-width='.6' d='M0 151L0 200L95 206ZM0 151L0 0L100 67ZM95 206L0 151L112 91ZM100 67L0 151L112 91ZM112 91L100 67L137 102ZM112 91L95 206L137 102ZM210 14L186 93L231 118ZM269 117L210 14L231 118ZM95 206L137 102L203 151ZM186 93L231 118L203 151ZM95 206L198 223L207 248ZM315 204L282 232L353 227ZM207 248L282 232L340 291ZM353 227L282 232L340 291ZM269 117L210 14L400 0ZM569 29L400 0L544 53ZM544 53L569 29L583 123ZM544 53L398 143L518 151ZM544 53L583 123L518 151ZM403 293L527 223L548 265ZM569 29L400 0L600 0ZM583 123L569 29L600 0ZM604 231L548 265L611 278ZM662 160L604 231L704 183ZM800 0L704 183L845 147ZM838 19L800 0L845 147ZM800 0L869 27L1000 0ZM1000 0L1082 54L1200 0Z'/><path fill='#7d879b' stroke='#7d879b' stroke-width='.6' d='M95 206L0 200L45 279ZM45 279L162 364L207 248ZM353 227L398 277L340 291ZM583 123L518 151L566 199ZM398 277L398 143L527 223ZM518 151L398 143L527 223ZM566 199L548 265L604 231Z'/><path fill='#8291a0' stroke='#8291a0' stroke-width='.6' d='M45 279L0 200L0 400ZM403 293L369 361L404 347ZM403 293L404 347L418 367ZM558 373L548 265L611 278ZM611 278L558 373L624 353ZM675 301L624 353L628 399ZM558 373L624 353L628 399ZM1009 141L1086 89L1040 165Z'/><path fill='#8791a5' stroke='#8791a5' stroke-width='.6' d='M0 400L45 279L60 434ZM0 400L7 419L60 434ZM60 434L45 279L162 364ZM162 364L340 291L369 361ZM369 361L418 367L419 404ZM369 361L373 485L415 419ZM403 293L418 367L548 265ZM761 222L704 183L845 147ZM845 147L761 222L852 208ZM821 297L725 300L857 366ZM949 129L852 208L985 181ZM821 297L852 208L943 263ZM1271 140L1290 165L1326 161ZM1338 222L1421 126L1447 139Z'/><path fill='#919baa' stroke='#919baa' stroke-width='.6' d='M60 434L7 419L36 462ZM36 462L7 419L0 600ZM129 449L93 507L170 560ZM129 449L170 560L243 489ZM237 527L170 560L289 582ZM276 473L289 582L341 556ZM276 473L363 518L341 556ZM341 556L363 518L391 574ZM391 574L341 556L385 586ZM385 586L341 556L381 620ZM391 574L373 485L522 518ZM566 458L522 518L561 549ZM474 592L522 518L509 573ZM780 462L790 504L835 487ZM780 462L857 366L835 487ZM985 329L857 366L923 397ZM999 370L985 329L923 397ZM999 370L997 395L923 397ZM1029 242L943 263L1024 281ZM985 329L1024 281L1017 324ZM999 370L985 329L1009 351ZM985 329L1017 324L1009 351ZM1306 281L1338 222L1374 290ZM1324 346L1331 370L1401 314ZM1333 395L1362 446L1401 314ZM1528 365L1555 396L1600 400ZM1600 200L1528 365L1600 400Z'/><path fill='#8c96a5' stroke='#8c96a5' stroke-width='.6' d='M60 434L36 462L93 507ZM0 400L7 419L0 600ZM276 473L243 489L237 527ZM276 473L373 485L363 518ZM445 415L373 485L522 518ZM696 519L628 399L666 521ZM566 458L628 399L643 528ZM666 521L628 399L643 528ZM696 519L628 399L746 484ZM780 462L628 399L746 484ZM943 263L857 366L985 329Z'/><path fill='#96a0af' stroke='#96a0af' stroke-width='.6' d='M36 462L93 507L0 600ZM276 473L237 527L289 582ZM341 556L289 582L381 620ZM381 620L289 582L343 669ZM391 574L474 592L522 518ZM594 540L566 458L561 549ZM594 540L566 458L643 528ZM780 462L746 484L790 504ZM862 511L835 487L853 520ZM835 487L857 366L923 397ZM835 487L923 397L928 456ZM982 447L981 423L928 456ZM982 447L928 456L973 495ZM1374 290L1306 281L1313 324ZM1351 476L1362 446L1400 486ZM1401 314L1460 443L1528 365ZM1401 314L1532 151L1528 365ZM1460 443L1528 365L1530 447Z'/><path fill='#9ba5b4' stroke='#9ba5b4' stroke-width='.6' d='M0 600L93 507L63 668ZM391 574L474 592L442 619ZM746 484L790 504L750 513ZM746 484L696 519L719 526ZM750 513L746 484L719 526ZM997 395L923 397L981 423ZM862 511L835 487L928 456ZM923 397L981 423L928 456ZM953 514L928 456L913 523ZM1401 314L1362 446L1460 443ZM1460 443L1362 446L1426 461ZM1528 365L1555 396L1530 447ZM1530 447L1555 396L1600 400Z'/><path fill='#afb4be' stroke='#afb4be' stroke-width='.6' d='M97 701L63 668L94 768ZM198 843L143 849L175 866ZM135 861L143 849L175 866ZM94 768L97 701L203 794ZM227 768L97 701L203 794ZM1399 798L1348 757L1364 806ZM1364 806L1333 788L1313 816ZM1364 806L1399 798L1365 833ZM1313 816L1365 833L1311 848ZM1399 798L1357 724L1439 780ZM1399 798L1439 780L1448 807ZM1448 807L1495 857L1485 863ZM1448 807L1440 860L1485 863ZM1525 690L1568 657L1600 800Z'/><path fill='#a5aab4' stroke='#a5aab4' stroke-width='.6' d='M0 600L63 668L0 800ZM166 634L136 661L227 768ZM1357 656L1360 690L1381 696ZM1381 696L1360 690L1366 701ZM1377 606L1381 696L1525 690ZM1600 600L1568 657L1600 800Z'/><path fill='#aab4b9' stroke='#aab4b9' stroke-width='.6' d='M94 768L63 668L0 800Z'/><path fill='#b4b9c3' stroke='#b4b9c3' stroke-width='.6' d='M94 768L0 800L45 854ZM198 843L175 866L216 863ZM1456 782L1439 780L1448 807ZM1471 752L1495 857L1530 865Z'/><path fill='#b9bec3' stroke='#b9bec3' stroke-width='.6' d='M0 800L0 850L45 854ZM94 768L87 861L143 849ZM87 861L143 849L135 861ZM1399 798L1365 833L1395 856Z'/><path fill='#b4b9be' stroke='#b4b9be' stroke-width='.6' d='M94 768L45 854L87 861ZM94 768L193 819L143 849ZM1364 806L1313 816L1365 833ZM1311 848L1365 833L1344 862ZM1456 782L1448 807L1495 857ZM1575 867L1530 865L1600 800Z'/><path fill='#696e78' stroke='#696e78' stroke-width='.6' d='M87 861L45 854L81 872ZM81 872L41 874L29 893ZM87 861L135 861L116 879ZM175 866L135 861L168 882ZM556 847L585 856L574 884ZM556 847L537 862L574 884ZM643 872L663 857L648 896ZM1495 857L1530 865L1507 882Z'/><path fill='#646e78' stroke='#646e78' stroke-width='.6' d='M45 854L0 850L41 874ZM87 861L81 872L116 879ZM499 889L537 862L506 866ZM643 872L626 871L648 896ZM1344 862L1330 879L1340 900ZM1485 863L1440 860L1507 882ZM1575 867L1530 865L1507 882Z'/><path fill='#646978' stroke='#646978' stroke-width='.6' d='M45 854L81 872L41 874ZM175 866L168 882L195 911ZM195 911L175 866L216 863ZM247 878L270 867L258 909ZM495 863L451 881L499 889ZM696 881L663 857L648 896Z'/><path fill='#646973' stroke='#646973' stroke-width='.6' d='M0 850L41 874L29 893ZM116 879L81 872L117 947ZM339 892L313 891L303 916ZM499 889L495 863L506 866ZM574 884L585 856L626 871ZM696 881L648 896L673 918ZM1172 889L1159 890L1172 911ZM1159 890L1135 905L1172 911ZM1311 864L1344 862L1330 879ZM1344 862L1395 856L1340 900ZM1395 856L1340 900L1371 923ZM1395 856L1371 923L1440 860ZM1575 867L1600 800L1600 1000Z'/><path fill='#5f6973' stroke='#5f6973' stroke-width='.6' d='M81 872L29 893L37 951ZM270 867L289 888L258 909ZM195 911L216 863L210 910ZM247 878L216 863L210 910ZM247 878L258 909L210 910ZM258 909L289 888L303 916ZM394 890L377 940L451 881ZM499 889L537 862L574 884ZM879 883L886 910L917 885Z'/><path fill='#5a5f69' stroke='#5a5f69' stroke-width='.6' d='M37 951L81 872L63 965ZM247 955L258 909L285 966ZM285 966L258 909L303 916ZM377 940L451 881L400 1000ZM673 918L676 986L724 925ZM724 925L750 887L792 974ZM750 887L792 974L806 890ZM837 918L886 910L843 934ZM1135 905L1172 911L1173 928ZM1123 920L1135 905L1131 942ZM1313 940L1330 921L1344 945Z'/><path fill='#5f646e' stroke='#5f646e' stroke-width='.6' d='M0 850L29 893L0 1000ZM116 879L168 882L117 947ZM195 911L168 882L117 947ZM548 973L574 884L629 921ZM626 871L648 896L629 921ZM673 918L648 896L629 921ZM696 881L673 918L724 925ZM726 894L696 881L724 925ZM726 894L750 887L724 925ZM879 883L862 889L886 910ZM825 894L806 890L837 918ZM886 910L917 885L933 904ZM967 894L971 877L933 904ZM967 894L933 904L967 916ZM933 904L886 910L923 936ZM1125 884L1159 890L1135 905ZM1330 921L1340 900L1371 923ZM1440 860L1499 988L1507 882Z'/><path fill='#555a69' stroke='#555a69' stroke-width='.6' d='M37 951L29 893L0 1000ZM377 940L303 916L351 992ZM843 934L870 951L845 979ZM870 951L886 910L913 952ZM1004 948L1020 948L1015 968ZM1225 943L1265 946L1254 984ZM1131 942L1173 928L1200 1000ZM1225 943L1191 931L1200 1000Z'/><path fill='#505a64' stroke='#505a64' stroke-width='.6' d='M63 965L37 951L0 1000ZM134 977L107 978L116 990ZM351 992L377 940L400 1000ZM499 889L400 1000L548 973ZM724 925L676 986L765 991ZM843 934L792 974L845 979ZM885 988L870 951L913 952ZM1020 948L1060 951L1015 968ZM1015 968L1060 951L1035 993ZM986 936L1004 948L1000 1000ZM1004 948L1015 968L1000 1000ZM1098 943L1060 951L1100 997ZM1265 946L1254 984L1298 985ZM1131 942L1119 980L1200 1000ZM1298 985L1265 946L1313 940ZM1298 985L1313 940L1344 945ZM1371 923L1344 945L1358 993Z'/><path fill='#78879b' stroke='#78879b' stroke-width='.6' d='M186 93L100 67L137 102ZM100 67L0 0L200 0ZM186 93L100 67L200 0ZM95 206L198 223L203 151ZM186 93L137 102L203 151ZM269 117L231 118L203 151ZM269 117L203 151L282 232ZM269 117L398 143L334 162ZM269 117L282 232L315 204ZM269 117L334 162L315 204ZM583 123L600 0L662 160Z'/><path fill='#919baf' stroke='#919baf' stroke-width='.6' d='M60 434L93 507L129 449ZM1034 204L985 181L1030 226ZM1097 204L1090 214L1115 238ZM1326 161L1296 204L1322 211ZM1296 204L1322 211L1301 242ZM1313 324L1374 290L1324 346ZM1374 290L1338 222L1447 139ZM1324 346L1374 290L1401 314Z'/><path fill='#8c96aa' stroke='#8c96aa' stroke-width='.6' d='M60 434L162 364L129 449ZM162 364L276 473L369 361ZM445 415L491 399L479 420ZM491 399L479 420L566 458ZM558 373L491 399L566 458ZM725 300L628 399L780 462ZM852 208L985 181L943 263ZM1086 89L1065 189L1097 204ZM1036 184L985 181L1034 204ZM943 263L1030 226L1029 242ZM1160 170L1196 241L1222 234ZM1447 139L1421 126L1562 47Z'/><path fill='#a0a5b4' stroke='#a0a5b4' stroke-width='.6' d='M63 668L93 507L136 661ZM381 620L398 640L343 669ZM1356 493L1351 476L1400 486Z'/><path fill='#9ba5af' stroke='#9ba5af' stroke-width='.6' d='M170 560L93 507L136 661ZM166 634L170 560L289 582ZM414 662L398 640L401 690ZM973 495L928 456L953 514ZM862 511L928 456L913 523ZM1377 514L1385 524L1400 486ZM1400 486L1391 537L1441 550ZM1460 443L1441 550L1530 447ZM1530 447L1441 550L1600 600Z'/><path fill='#a0a5af' stroke='#a0a5af' stroke-width='.6' d='M97 701L63 668L136 661ZM343 669L361 706L308 723Z'/><path fill='#96a0aa' stroke='#96a0aa' stroke-width='.6' d='M166 634L170 560L136 661ZM385 586L381 620L442 619ZM385 586L391 574L442 619ZM381 620L442 619L423 638Z'/><path fill='#afb4b9' stroke='#afb4b9' stroke-width='.6' d='M198 843L193 819L143 849ZM1357 724L1348 757L1399 798ZM1399 798L1395 856L1448 807ZM1448 807L1395 856L1440 860Z'/><path fill='#696e7d' stroke='#696e7d' stroke-width='.6' d='M116 879L135 861L168 882Z'/><path fill='#555f69' stroke='#555f69' stroke-width='.6' d='M63 965L81 872L117 947ZM195 911L188 965L210 910ZM188 965L210 910L247 955ZM837 918L792 974L843 934ZM843 934L886 910L870 951ZM1098 943L1123 920L1131 942ZM1440 860L1499 988L1413 995ZM1584 973L1575 867L1600 1000Z'/><path fill='#555a64' stroke='#555a64' stroke-width='.6' d='M195 911L117 947L188 965ZM642 947L673 918L676 986ZM548 973L629 921L600 1000ZM642 947L629 921L600 1000ZM724 925L792 974L765 991ZM986 936L913 952L1000 1000ZM1098 943L1131 942L1119 980ZM1173 928L1191 931L1200 1000ZM1507 882L1499 988L1584 973Z'/><path fill='#505564' stroke='#505564' stroke-width='.6' d='M188 965L117 947L134 977ZM134 977L117 947L107 978ZM239 987L285 966L351 992ZM285 966L303 916L351 992Z'/><path fill='#50555f' stroke='#50555f' stroke-width='.6' d='M63 965L117 947L107 978ZM247 955L188 965L239 987ZM247 955L285 966L239 987ZM188 965L134 977L200 1000ZM548 973L400 1000L600 1000ZM642 947L676 986L600 1000ZM845 979L870 951L885 988ZM885 988L845 979L800 1000ZM885 988L913 952L1000 1000ZM1098 943L1119 980L1100 997ZM1298 985L1344 945L1358 993ZM1371 923L1358 993L1400 1000ZM1413 995L1371 923L1400 1000Z'/><path fill='#4b555f' stroke='#4b555f' stroke-width='.6' d='M63 965L0 1000L103 998ZM63 965L107 978L103 998ZM116 990L107 978L103 998ZM103 998L116 990L200 1000ZM676 986L600 1000L800 1000ZM765 991L792 974L800 1000ZM885 988L800 1000L1000 1000ZM1035 993L1015 968L1000 1000ZM1035 993L1060 951L1100 997ZM1225 943L1254 984L1200 1000ZM1100 997L1119 980L1200 1000ZM1298 985L1261 995L1358 993ZM1413 995L1499 988L1400 1000Z'/><path fill='#78829b' stroke='#78829b' stroke-width='.6' d='M186 93L200 0L210 14Z'/><path fill='#828ca0' stroke='#828ca0' stroke-width='.6' d='M203 151L198 223L282 232ZM162 364L207 248L340 291ZM369 361L340 291L403 293ZM369 361L404 347L418 367ZM491 399L418 367L445 415ZM418 367L419 404L445 415ZM403 293L398 277L527 223ZM518 151L566 199L527 223ZM491 399L418 367L548 265ZM583 123L566 199L662 160ZM611 278L604 231L675 301ZM761 222L704 183L725 300ZM725 300L761 222L821 297ZM876 63L845 147L937 99ZM1562 47L1568 118L1600 0Z'/><path fill='#7d8c9b' stroke='#7d8c9b' stroke-width='.6' d='M45 279L95 206L207 248ZM353 227L398 143L398 277ZM340 291L398 277L403 293ZM527 223L566 199L548 265Z'/><path fill='#8291a5' stroke='#8291a5' stroke-width='.6' d='M282 232L198 223L207 248ZM662 160L566 199L604 231ZM611 278L675 301L624 353ZM604 231L675 301L704 183ZM662 160L704 183L800 0ZM838 19L869 27L876 63ZM838 19L876 63L845 147ZM876 63L869 27L937 99ZM937 99L845 147L949 129ZM937 99L869 27L1000 0ZM1000 0L937 99L1041 72ZM1000 0L1082 54L1041 72ZM937 99L1041 72L1009 141ZM1082 54L1086 89L1155 95ZM1155 95L1160 170L1271 140ZM1271 140L1160 170L1265 189ZM1271 140L1200 0L1400 0ZM1271 140L1326 161L1400 0ZM1562 47L1447 139L1532 151ZM1562 47L1400 0L1600 0Z'/><path fill='#8791a0' stroke='#8791a0' stroke-width='.6' d='M162 364L129 449L243 489ZM675 301L628 399L725 300Z'/><path fill='#8796a5' stroke='#8796a5' stroke-width='.6' d='M162 364L276 473L243 489ZM369 361L419 404L415 419ZM445 415L419 404L415 419ZM445 415L373 485L415 419ZM491 399L548 265L558 373ZM566 458L479 420L522 518ZM725 300L780 462L857 366ZM999 165L983 149L985 181ZM821 297L857 366L943 263ZM937 99L949 129L1009 141ZM1069 200L1065 189L1097 204ZM943 263L985 181L1030 226ZM1160 170L1148 202L1196 241ZM1148 202L1196 241L1179 246ZM1148 202L1115 238L1151 246ZM1271 140L1290 165L1273 176ZM1271 140L1273 176L1265 189ZM1326 161L1338 222L1421 126Z'/><path fill='#91a0af' stroke='#91a0af' stroke-width='.6' d='M243 489L170 560L237 527ZM985 329L943 263L1024 281ZM1179 246L1148 202L1151 246ZM1338 222L1322 211L1301 242Z'/><path fill='#aab4be' stroke='#aab4be' stroke-width='.6' d='M97 701L136 661L227 768ZM166 634L257 751L308 723ZM1357 656L1377 606L1381 696ZM1568 657L1553 650L1600 600Z'/><path fill='#a5afb9' stroke='#a5afb9' stroke-width='.6' d='M166 634L257 751L227 768ZM343 669L398 640L401 690ZM343 669L361 706L401 690ZM1377 606L1348 623L1357 656ZM1377 606L1391 583L1525 690ZM1568 657L1553 650L1525 690ZM1441 550L1553 650L1600 600Z'/><path fill='#f5ebe1' stroke='#f5ebe1' stroke-width='.6' d='M227 768L257 751L267 772ZM203 794L227 768L237 795Z'/><path fill='#aaafb9' stroke='#aaafb9' stroke-width='.6' d='M94 768L193 819L203 794ZM1366 701L1360 690L1357 724ZM1366 701L1381 696L1357 724ZM1348 757L1333 788L1364 806ZM1357 724L1381 696L1439 780ZM1471 752L1381 696L1439 780ZM1471 752L1439 780L1456 782ZM1456 782L1471 752L1495 857ZM1441 550L1553 650L1525 690ZM1471 752L1381 696L1525 690ZM1525 690L1471 752L1600 800ZM1471 752L1530 865L1600 800Z'/><path fill='#f0e6dc' stroke='#f0e6dc' stroke-width='.6' d='M285 781L267 772L237 795ZM227 768L267 772L237 795ZM203 794L193 819L221 830ZM203 794L237 795L221 830ZM237 795L234 827L221 830ZM216 863L243 859L247 878Z'/><path fill='#ebe1d2' stroke='#ebe1d2' stroke-width='.6' d='M198 843L193 819L221 830ZM303 757L341 755L322 793Z'/><path fill='#ebe1d7' stroke='#ebe1d7' stroke-width='.6' d='M285 781L237 795L259 833ZM237 795L234 827L259 833ZM198 843L221 830L216 863Z'/><path fill='#f0e6d7' stroke='#f0e6d7' stroke-width='.6' d='M285 781L297 832L259 833ZM308 723L343 732L318 740ZM361 706L343 732L367 755ZM318 740L341 755L303 757ZM303 757L285 781L322 793ZM341 755L367 755L353 799ZM322 793L341 755L353 799Z'/><path fill='#e6dcd2' stroke='#e6dcd2' stroke-width='.6' d='M259 833L297 832L287 854ZM679 827L675 849L663 857ZM679 827L724 815L720 845Z'/><path fill='#dcd2c8' stroke='#dcd2c8' stroke-width='.6' d='M221 830L234 827L243 859ZM259 833L234 827L243 859ZM259 833L287 854L270 867ZM507 782L494 816L532 801ZM544 799L568 829L519 836ZM779 791L752 815L778 836ZM752 815L724 815L720 845ZM697 864L720 845L729 857ZM765 841L720 845L729 857ZM779 791L778 836L806 795ZM863 814L855 836L828 838ZM778 836L777 872L800 868ZM778 836L810 838L800 868ZM815 862L810 838L800 868ZM855 836L896 866L900 834ZM863 814L881 792L900 834ZM953 803L922 803L952 840ZM900 834L896 866L930 856Z'/><path fill='#dcd7c8' stroke='#dcd7c8' stroke-width='.6' d='M243 859L221 830L216 863Z'/><path fill='#e1d7c8' stroke='#e1d7c8' stroke-width='.6' d='M243 859L259 833L270 867ZM324 832L297 832L325 866ZM474 808L478 754L507 782ZM507 782L517 761L532 801ZM517 761L544 799L532 801ZM558 765L590 790L602 758ZM669 757L662 770L681 800ZM681 800L669 757L723 769ZM702 729L669 757L723 769ZM702 729L729 740L723 769ZM761 733L792 748L740 770ZM740 770L723 769L734 790ZM681 800L679 827L724 815ZM813 773L779 791L806 795Z'/><path fill='#faebe1' stroke='#faebe1' stroke-width='.6' d='M243 859L270 867L247 878Z'/><path fill='#d7cdc3' stroke='#d7cdc3' stroke-width='.6' d='M287 854L270 867L289 888ZM494 816L474 808L507 782ZM544 799L590 790L568 829ZM592 822L630 795L634 822ZM679 827L675 849L697 864ZM697 864L663 857L696 881ZM765 841L777 872L750 887ZM828 838L810 838L815 862ZM839 849L828 838L815 862ZM839 849L855 836L843 878ZM815 862L839 849L843 878ZM976 802L959 772L953 803ZM977 825L994 794L990 832ZM922 803L900 834L930 856Z'/><path fill='#5a646e' stroke='#5a646e' stroke-width='.6' d='M210 910L258 909L247 955ZM303 916L339 892L377 940ZM499 889L451 881L400 1000ZM629 921L673 918L642 947ZM886 910L862 889L837 918ZM986 936L967 916L923 936ZM923 936L886 910L913 952ZM1173 928L1172 911L1191 931ZM1173 928L1135 905L1131 942ZM1371 923L1330 921L1344 945ZM1440 860L1371 923L1413 995Z'/><path fill='#46505a' stroke='#46505a' stroke-width='.6' d='M103 998L0 1000L200 1000ZM1100 997L1000 1000L1200 1000Z'/><path fill='#4b505a' stroke='#4b505a' stroke-width='.6' d='M239 987L188 965L200 1000ZM116 990L134 977L200 1000ZM239 987L200 1000L351 992ZM765 991L676 986L800 1000ZM845 979L792 974L800 1000ZM1000 1000L1035 993L1100 997ZM1298 985L1254 984L1261 995ZM1261 995L1254 984L1200 1000ZM1261 995L1200 1000L1400 1000ZM1400 1000L1499 988L1600 1000ZM1584 973L1499 988L1600 1000Z'/><path fill='#788796' stroke='#788796' stroke-width='.6' d='M334 162L398 143L353 227ZM315 204L334 162L353 227Z'/><path fill='#8c9baa' stroke='#8c9baa' stroke-width='.6' d='M276 473L369 361L373 485ZM373 485L363 518L391 574ZM445 415L479 420L522 518ZM558 373L566 458L628 399ZM999 165L983 149L1009 141ZM1097 204L1160 170L1148 202ZM1097 204L1148 202L1115 238ZM1151 246L1115 238L1119 250ZM1250 205L1160 170L1240 214ZM1160 170L1240 214L1222 234ZM1196 241L1222 234L1206 250ZM1338 222L1301 242L1306 281ZM1374 290L1447 139L1401 314ZM1532 151L1528 365L1600 200Z'/><path fill='#a5aab9' stroke='#a5aab9' stroke-width='.6' d='M166 634L289 582L308 723ZM1441 550L1391 583L1525 690Z'/><path fill='#a0aab4' stroke='#a0aab4' stroke-width='.6' d='M343 669L289 582L308 723ZM381 620L398 640L423 638ZM423 638L398 640L414 662ZM790 504L835 487L806 510ZM1391 583L1395 560L1441 550ZM1391 537L1395 560L1441 550Z'/><path fill='#f5e6d7' stroke='#f5e6d7' stroke-width='.6' d='M361 706L308 723L343 732Z'/><path fill='#faebdc' stroke='#faebdc' stroke-width='.6' d='M318 740L343 732L341 755ZM396 725L361 706L367 755Z'/><path fill='#f0e1d2' stroke='#f0e1d2' stroke-width='.6' d='M341 755L343 732L367 755ZM396 725L401 713L408 738ZM396 725L367 755L406 753ZM398 791L406 753L423 762Z'/><path fill='#f5ebdc' stroke='#f5ebdc' stroke-width='.6' d='M257 751L267 772L303 757ZM308 723L257 751L303 757Z'/><path fill='#faf0e1' stroke='#faf0e1' stroke-width='.6' d='M318 740L308 723L303 757ZM285 781L267 772L303 757Z'/><path fill='#e6dccd' stroke='#e6dccd' stroke-width='.6' d='M285 781L297 832L322 793ZM322 793L297 832L324 832ZM353 799L397 819L369 834ZM369 834L324 832L338 847ZM681 800L662 770L655 805ZM681 800L723 769L734 790ZM734 790L740 770L779 791ZM734 790L779 791L752 815ZM806 795L828 838L810 838Z'/><path fill='#ebdccd' stroke='#ebdccd' stroke-width='.6' d='M398 791L367 755L353 799ZM401 713L408 738L427 741ZM398 791L367 755L406 753ZM494 736L553 729L517 761Z'/><path fill='#e1d2c3' stroke='#e1d2c3' stroke-width='.6' d='M398 791L353 799L397 819ZM453 729L479 687L494 736ZM417 694L453 729L427 741ZM398 791L423 762L433 767ZM453 729L478 754L433 767ZM397 819L425 807L434 835ZM369 834L393 869L401 842ZM397 819L434 835L401 842ZM553 729L549 707L568 730ZM517 761L478 754L507 782ZM568 730L587 692L610 709ZM568 730L558 765L602 758ZM669 757L646 749L662 770ZM655 732L669 757L702 729ZM702 729L704 699L729 740ZM740 687L761 733L729 740ZM785 683L761 733L804 735ZM879 716L869 695L835 741ZM879 716L891 752L868 755ZM804 735L792 748L813 773ZM879 716L906 694L915 725ZM891 752L899 760L915 725ZM915 725L946 726L947 740Z'/><path fill='#e6d7cd' stroke='#e6d7cd' stroke-width='.6' d='M322 793L353 799L324 832ZM324 832L353 799L369 834ZM287 854L297 832L325 866ZM646 749L602 758L647 771ZM852 787L868 755L881 792ZM813 773L852 787L806 795ZM953 803L933 769L922 803Z'/><path fill='#d7cdbe' stroke='#d7cdbe' stroke-width='.6' d='M287 854L289 888L325 866ZM647 771L630 795L655 805Z'/><path fill='#e6d7c8' stroke='#e6d7c8' stroke-width='.6' d='M324 832L338 847L325 866ZM494 736L453 729L478 754ZM427 741L406 753L423 762ZM398 791L397 819L425 807ZM494 736L478 754L517 761ZM553 729L568 730L558 765ZM553 729L517 761L558 765ZM655 732L635 727L646 749ZM568 730L618 734L602 758ZM813 773L835 741L852 787ZM879 716L891 752L915 725ZM889 784L899 760L933 769ZM915 725L899 760L933 769Z'/><path fill='#d7c8be' stroke='#d7c8be' stroke-width='.6' d='M369 834L338 847L360 868ZM325 866L338 847L360 868Z'/><path fill='#dccdbe' stroke='#dccdbe' stroke-width='.6' d='M369 834L360 868L393 869ZM427 741L453 729L433 767ZM445 786L433 767L425 807ZM454 798L425 807L434 835ZM369 834L397 819L401 842ZM401 842L434 835L416 855ZM416 855L434 835L429 861ZM416 855L401 842L405 867ZM610 709L635 727L618 734ZM635 727L618 734L646 749ZM655 732L646 749L669 757ZM655 732L680 693L702 729ZM740 687L785 683L761 733ZM729 740L761 733L740 770ZM761 733L792 748L804 735ZM819 693L804 735L835 741ZM879 716L835 741L868 755ZM947 740L915 725L933 769Z'/><path fill='#c3b4aa' stroke='#c3b4aa' stroke-width='.6' d='M393 869L360 868L394 890ZM394 890L405 867L451 881Z'/><path fill='#cdc3b4' stroke='#cdc3b4' stroke-width='.6' d='M325 866L289 888L313 891ZM398 791L433 767L425 807Z'/><path fill='#c8beaf' stroke='#c8beaf' stroke-width='.6' d='M360 868L325 866L339 892ZM313 891L325 866L339 892ZM394 890L360 868L339 892Z'/><path fill='#5f6473' stroke='#5f6473' stroke-width='.6' d='M313 891L289 888L303 916ZM574 884L499 889L548 973ZM574 884L626 871L629 921ZM825 894L862 889L837 918ZM1575 867L1507 882L1584 973Z'/><path fill='#5a5f6e' stroke='#5a5f6e' stroke-width='.6' d='M394 890L339 892L377 940ZM806 890L792 974L837 918ZM933 904L967 916L923 936ZM986 936L923 936L913 952Z'/><path fill='#73829b' stroke='#73829b' stroke-width='.6' d='M210 14L200 0L400 0Z'/><path fill='#7887a0' stroke='#7887a0' stroke-width='.6' d='M269 117L398 143L400 0Z'/><path fill='#cdb9a0' stroke='#cdb9a0' stroke-width='.6' d='M498 591L474 592L471 617Z'/><path fill='#d2b9a5' stroke='#d2b9a5' stroke-width='.6' d='M471 617L474 592L442 619ZM549 555L587 602L529 606ZM498 591L529 606L527 633ZM685 553L662 595L699 595ZM699 595L724 585L700 639ZM762 584L724 585L761 641ZM784 552L822 556L803 603ZM866 565L889 590L850 605ZM935 560L894 566L922 594Z'/><path fill='#cdb9a5' stroke='#cdb9a5' stroke-width='.6' d='M471 617L442 619L465 670ZM498 591L471 617L527 633ZM529 606L527 633L565 635ZM587 602L586 631L604 605Z'/><path fill='#d2beaa' stroke='#d2beaa' stroke-width='.6' d='M471 617L495 662L465 670ZM423 638L442 619L465 670ZM587 602L586 631L565 635ZM604 605L586 631L632 637ZM662 595L604 605L632 637ZM573 674L586 631L611 654ZM632 637L611 654L617 669ZM683 666L683 639L700 639ZM778 621L761 641L810 658ZM850 605L816 617L842 659ZM943 623L906 638L931 649Z'/><path fill='#dcc8b4' stroke='#dcc8b4' stroke-width='.6' d='M414 662L423 638L465 670ZM573 674L611 654L617 669ZM683 666L700 639L720 670ZM700 639L761 641L720 670ZM761 641L774 670L810 658ZM873 637L850 605L842 659ZM810 658L816 617L842 659ZM906 638L893 651L931 649Z'/><path fill='#d7c3b4' stroke='#d7c3b4' stroke-width='.6' d='M414 662L465 670L447 686ZM479 687L495 662L527 689ZM573 674L587 692L617 669ZM660 662L683 666L680 693ZM617 669L587 692L610 709ZM720 670L759 664L740 687ZM842 659L810 658L819 693Z'/><path fill='#d7c8b4' stroke='#d7c8b4' stroke-width='.6' d='M465 670L495 662L479 687ZM414 662L447 686L417 694ZM573 674L537 671L573 696ZM495 863L495 831L519 836ZM683 666L680 693L704 699ZM720 670L740 687L704 699Z'/><path fill='#dcc8b9' stroke='#dcc8b9' stroke-width='.6' d='M447 686L465 670L479 687ZM537 671L495 662L527 689ZM573 674L587 692L573 696ZM537 671L527 689L535 701ZM573 696L537 671L549 707ZM660 662L680 693L649 703ZM649 703L617 669L610 709ZM759 664L761 641L720 670ZM785 683L774 670L740 687ZM720 670L683 666L704 699ZM785 683L774 670L810 658ZM810 658L785 683L819 693ZM842 659L893 651L869 695Z'/><path fill='#dccdb9' stroke='#dccdb9' stroke-width='.6' d='M414 662L401 690L417 694ZM474 808L454 798L434 835ZM494 736L527 689L535 701ZM617 669L660 662L649 703ZM649 703L610 709L635 727ZM610 709L568 730L618 734ZM704 699L680 693L702 729ZM869 695L893 651L906 694ZM879 716L869 695L906 694Z'/><path fill='#ebe1cd' stroke='#ebe1cd' stroke-width='.6' d='M396 725L361 706L401 713Z'/><path fill='#f5e6d2' stroke='#f5e6d2' stroke-width='.6' d='M361 706L401 690L401 713Z'/><path fill='#e6d2c3' stroke='#e6d2c3' stroke-width='.6' d='M417 694L401 690L401 713ZM417 694L447 686L453 729ZM494 736L535 701L553 729ZM535 701L549 707L553 729ZM573 696L549 707L568 730Z'/><path fill='#e1cdbe' stroke='#e1cdbe' stroke-width='.6' d='M447 686L479 687L453 729ZM819 693L842 659L869 695ZM819 693L869 695L835 741Z'/><path fill='#ebdcc8' stroke='#ebdcc8' stroke-width='.6' d='M417 694L401 713L427 741Z'/><path fill='#dcd2c3' stroke='#dcd2c3' stroke-width='.6' d='M396 725L408 738L406 753ZM517 761L558 765L544 799ZM532 801L494 816L509 827ZM646 749L618 734L602 758ZM681 800L655 805L679 827ZM740 770L792 748L779 791ZM779 791L792 748L813 773ZM804 735L835 741L813 773ZM891 752L868 755L889 784ZM889 784L868 755L881 792ZM947 740L933 769L959 772ZM959 772L933 769L953 803ZM881 792L889 784L922 803ZM889 784L933 769L922 803Z'/><path fill='#d2c3b4' stroke='#d2c3b4' stroke-width='.6' d='M427 741L408 738L406 753ZM495 831L471 851L495 863ZM471 851L434 835L450 865Z'/><path fill='#e1d2c8' stroke='#e1d2c8' stroke-width='.6' d='M427 741L423 762L433 767ZM478 754L454 798L474 808ZM558 765L590 790L544 799ZM590 790L602 758L630 795ZM647 771L602 758L630 795ZM729 740L723 769L740 770ZM891 752L899 760L889 784ZM835 741L868 755L852 787Z'/><path fill='#dccdc3' stroke='#dccdc3' stroke-width='.6' d='M478 754L433 767L445 786ZM646 749L662 770L647 771Z'/><path fill='#d2c3b9' stroke='#d2c3b9' stroke-width='.6' d='M445 786L478 754L454 798Z'/><path fill='#d2c8b9' stroke='#d2c8b9' stroke-width='.6' d='M445 786L454 798L425 807ZM429 861L434 835L450 865Z'/><path fill='#b4aa9b' stroke='#b4aa9b' stroke-width='.6' d='M494 816L474 808L495 831Z'/><path fill='#b9aaa0' stroke='#b9aaa0' stroke-width='.6' d='M474 808L495 831L471 851Z'/><path fill='#c8b9aa' stroke='#c8b9aa' stroke-width='.6' d='M474 808L434 835L471 851ZM495 863L471 851L451 881Z'/><path fill='#d7c8b9' stroke='#d7c8b9' stroke-width='.6' d='M401 842L393 869L405 867ZM416 855L429 861L405 867ZM535 701L537 671L549 707ZM649 703L680 693L655 732ZM740 687L704 699L729 740ZM819 693L785 683L804 735Z'/><path fill='#b9afa0' stroke='#b9afa0' stroke-width='.6' d='M394 890L393 869L405 867Z'/><path fill='#c3b9aa' stroke='#c3b9aa' stroke-width='.6' d='M429 861L450 865L451 881Z'/><path fill='#beb4a5' stroke='#beb4a5' stroke-width='.6' d='M450 865L471 851L451 881Z'/><path fill='#cdbeaf' stroke='#cdbeaf' stroke-width='.6' d='M429 861L405 867L451 881Z'/><path fill='#4b505f' stroke='#4b505f' stroke-width='.6' d='M351 992L200 1000L400 1000ZM1261 995L1358 993L1400 1000Z'/><path fill='#738296' stroke='#738296' stroke-width='.6' d='M400 0L398 143L544 53Z'/><path fill='#96a5af' stroke='#96a5af' stroke-width='.6' d='M561 549L522 518L549 555Z'/><path fill='#c8af96' stroke='#c8af96' stroke-width='.6' d='M594 540L561 549L591 566ZM685 553L643 528L634 563ZM685 553L696 519L701 541ZM737 550L776 521L784 552ZM862 511L853 520L883 541ZM853 520L818 524L822 556ZM803 532L818 524L822 556ZM784 552L803 532L822 556Z'/><path fill='#cdaf9b' stroke='#cdaf9b' stroke-width='.6' d='M549 555L561 549L591 566ZM894 566L883 541L913 523Z'/><path fill='#c8af9b' stroke='#c8af9b' stroke-width='.6' d='M498 591L474 592L509 573ZM549 555L591 566L587 602ZM498 591L509 573L529 606ZM634 563L591 566L604 605Z'/><path fill='#919ba5' stroke='#919ba5' stroke-width='.6' d='M549 555L522 518L509 573Z'/><path fill='#cdb49b' stroke='#cdb49b' stroke-width='.6' d='M549 555L509 573L529 606ZM685 553L634 563L662 595ZM750 513L776 521L737 550ZM685 553L699 595L705 567ZM685 553L701 541L705 567ZM737 550L701 541L705 567ZM784 552L737 550L762 584ZM853 520L883 541L866 565ZM853 520L822 556L866 565Z'/><path fill='#d7beaf' stroke='#d7beaf' stroke-width='.6' d='M471 617L495 662L527 633Z'/><path fill='#d2bea5' stroke='#d2bea5' stroke-width='.6' d='M529 606L587 602L565 635ZM803 603L822 556L850 605ZM889 590L850 605L873 637ZM953 606L922 594L943 623Z'/><path fill='#d2beaf' stroke='#d2beaf' stroke-width='.6' d='M527 633L495 662L537 671ZM565 635L537 671L573 674ZM660 662L632 637L617 669Z'/><path fill='#cdb9aa' stroke='#cdb9aa' stroke-width='.6' d='M527 633L565 635L537 671Z'/><path fill='#d7c3af' stroke='#d7c3af' stroke-width='.6' d='M565 635L586 631L573 674ZM632 637L586 631L611 654ZM632 637L683 639L660 662ZM759 664L761 641L774 670ZM778 621L816 617L810 658ZM873 637L893 651L842 659Z'/><path fill='#e6d7c3' stroke='#e6d7c3' stroke-width='.6' d='M494 736L479 687L527 689ZM573 696L587 692L568 730ZM915 725L941 707L946 726Z'/><path fill='#b9aa9b' stroke='#b9aa9b' stroke-width='.6' d='M494 816L495 831L509 827Z'/><path fill='#e1d7cd' stroke='#e1d7cd' stroke-width='.6' d='M592 822L590 790L568 829ZM655 805L634 822L679 827ZM734 790L681 800L724 815ZM778 836L752 815L765 841ZM697 864L679 827L720 845ZM852 787L881 792L863 814ZM806 795L852 787L828 838ZM806 795L778 836L810 838ZM863 814L855 836L900 834ZM881 792L922 803L900 834ZM953 803L977 825L952 840ZM952 840L922 803L930 856Z'/><path fill='#beafa0' stroke='#beafa0' stroke-width='.6' d='M509 827L495 831L519 836ZM519 836L495 863L506 866Z'/><path fill='#c8c3b4' stroke='#c8c3b4' stroke-width='.6' d='M532 801L544 799L519 836Z'/><path fill='#d2c8be' stroke='#d2c8be' stroke-width='.6' d='M532 801L509 827L519 836ZM519 836L568 829L556 847ZM592 822L590 790L630 795ZM655 805L630 795L634 822ZM679 827L634 822L663 857ZM663 857L675 849L697 864ZM622 851L626 871L643 872ZM778 836L765 841L777 872ZM855 836L896 866L879 883ZM843 878L855 836L879 883ZM815 862L806 890L825 894ZM986 874L952 840L971 877Z'/><path fill='#c3beb4' stroke='#c3beb4' stroke-width='.6' d='M592 822L568 829L585 856ZM986 874L990 832L1004 873Z'/><path fill='#c3b9af' stroke='#c3b9af' stroke-width='.6' d='M556 847L568 829L585 856ZM592 822L585 856L622 851ZM592 822L634 822L622 851ZM729 857L696 881L726 894Z'/><path fill='#b4a596' stroke='#b4a596' stroke-width='.6' d='M556 847L519 836L537 862ZM519 836L537 862L506 866Z'/><path fill='#c3aa91' stroke='#c3aa91' stroke-width='.6' d='M666 521L696 519L685 553ZM666 521L643 528L685 553ZM594 540L643 528L634 563ZM719 526L696 519L701 541ZM750 513L719 526L737 550ZM719 526L701 541L737 550ZM790 504L776 521L803 532Z'/><path fill='#c3aa96' stroke='#c3aa96' stroke-width='.6' d='M594 540L591 566L634 563Z'/><path fill='#cdb4a0' stroke='#cdb4a0' stroke-width='.6' d='M591 566L587 602L604 605ZM784 552L762 584L803 603Z'/><path fill='#d2b9a0' stroke='#d2b9a0' stroke-width='.6' d='M634 563L662 595L604 605ZM705 567L699 595L724 585ZM737 550L705 567L724 585ZM737 550L762 584L724 585ZM866 565L883 541L894 566ZM866 565L822 556L850 605Z'/><path fill='#d7beaa' stroke='#d7beaa' stroke-width='.6' d='M662 595L699 595L683 639ZM699 595L683 639L700 639ZM700 639L724 585L761 641ZM778 621L762 584L803 603ZM803 603L850 605L816 617ZM889 590L894 566L922 594ZM935 560L939 583L922 594Z'/><path fill='#d7c3aa' stroke='#d7c3aa' stroke-width='.6' d='M632 637L662 595L683 639ZM778 621L762 584L761 641ZM873 637L889 590L906 638Z'/><path fill='#d2c3af' stroke='#d2c3af' stroke-width='.6' d='M660 662L683 639L683 666Z'/><path fill='#e1d2be' stroke='#e1d2be' stroke-width='.6' d='M649 703L635 727L655 732ZM930 698L906 694L915 725Z'/><path fill='#c8beb4' stroke='#c8beb4' stroke-width='.6' d='M647 771L662 770L655 805ZM622 851L585 856L626 871ZM750 887L777 872L806 890ZM800 868L777 872L806 890ZM917 885L930 856L933 904Z'/><path fill='#cdc3b9' stroke='#cdc3b9' stroke-width='.6' d='M622 851L634 822L663 857ZM697 864L696 881L729 857ZM729 857L765 841L750 887ZM729 857L750 887L726 894ZM843 878L879 883L862 889ZM815 862L800 868L806 890ZM843 878L862 889L825 894Z'/><path fill='#d2cdc3' stroke='#d2cdc3' stroke-width='.6' d='M622 851L663 857L643 872Z'/><path fill='#8796aa' stroke='#8796aa' stroke-width='.6' d='M675 301L704 183L725 300ZM852 208L761 222L821 297ZM852 208L845 147L949 129ZM1041 72L1082 54L1086 89ZM949 129L983 149L1009 141ZM1041 72L1086 89L1009 141ZM1040 165L1086 89L1065 189ZM1097 204L1086 89L1160 170ZM1155 95L1086 89L1160 170ZM1155 95L1082 54L1200 0ZM1155 95L1200 0L1271 140ZM1400 0L1326 161L1421 126ZM1400 0L1421 126L1562 47ZM1562 47L1568 118L1532 151ZM1568 118L1532 151L1600 200ZM1568 118L1600 0L1600 200Z'/><path fill='#c8aa91' stroke='#c8aa91' stroke-width='.6' d='M750 513L790 504L776 521ZM853 520L835 487L818 524Z'/><path fill='#e1cdb9' stroke='#e1cdb9' stroke-width='.6' d='M759 664L774 670L740 687ZM947 640L943 623L931 649ZM931 649L947 640L951 656ZM951 656L931 649L941 673ZM931 649L893 651L906 694Z'/><path fill='#ebdcd2' stroke='#ebdcd2' stroke-width='.6' d='M734 790L752 815L724 815ZM863 814L852 787L828 838Z'/><path fill='#e1dccd' stroke='#e1dccd' stroke-width='.6' d='M752 815L765 841L720 845Z'/><path fill='#7d87a0' stroke='#7d87a0' stroke-width='.6' d='M662 160L600 0L800 0Z'/><path fill='#7d8ca5' stroke='#7d8ca5' stroke-width='.6' d='M838 19L800 0L869 27Z'/><path fill='#a0aab9' stroke='#a0aab9' stroke-width='.6' d='M835 487L806 510L818 524ZM1426 461L1362 446L1400 486ZM1385 524L1391 537L1400 486ZM1530 447L1600 400L1600 600Z'/><path fill='#cdaf96' stroke='#cdaf96' stroke-width='.6' d='M790 504L806 510L803 532ZM784 552L776 521L803 532ZM806 510L818 524L803 532Z'/><path fill='#d7bea5' stroke='#d7bea5' stroke-width='.6' d='M866 565L894 566L889 590Z'/><path fill='#dcc3af' stroke='#dcc3af' stroke-width='.6' d='M803 603L778 621L816 617ZM953 606L967 618L943 623ZM922 594L889 590L906 638Z'/><path fill='#d7d2c3' stroke='#d7d2c3' stroke-width='.6' d='M828 838L855 836L839 849Z'/><path fill='#c8c3b9' stroke='#c8c3b9' stroke-width='.6' d='M815 862L843 878L825 894ZM952 840L930 856L971 877ZM896 866L930 856L917 885Z'/><path fill='#8c9baf' stroke='#8c9baf' stroke-width='.6' d='M949 129L983 149L985 181ZM1009 141L999 165L1040 165ZM999 165L985 181L1036 184ZM1040 165L999 165L1036 184ZM1097 204L1069 200L1090 214ZM1265 189L1160 170L1250 205ZM1296 204L1290 165L1326 161ZM1326 161L1322 211L1338 222ZM1401 314L1447 139L1532 151Z'/><path fill='#a09187' stroke='#a09187' stroke-width='.6' d='M997 395L999 420L981 423ZM999 420L981 423L989 431ZM1068 334L1094 327L1079 345ZM999 370L1009 351L1022 360ZM1068 334L1079 345L1058 360ZM1079 345L1058 360L1086 363ZM1022 360L1058 360L1046 376ZM997 395L999 420L1012 406ZM997 395L1017 379L1012 406ZM1017 379L1046 376L1031 410ZM1012 406L999 420L1023 423ZM1023 423L1031 410L1036 430ZM1023 423L1036 430L1031 440ZM1023 423L1031 440L1006 444ZM1140 262L1151 246L1152 266ZM1161 255L1152 266L1177 269ZM1140 262L1152 266L1138 275ZM1152 266L1177 269L1167 288ZM1199 284L1167 288L1173 299ZM1117 298L1138 275L1131 308ZM1117 298L1097 293L1101 313ZM1101 313L1117 298L1122 327ZM1079 345L1094 327L1115 342ZM1122 327L1094 327L1115 342ZM1115 342L1122 327L1141 343ZM1199 284L1220 276L1220 288ZM1176 312L1173 299L1200 303ZM1176 312L1194 319L1200 303ZM1200 303L1194 319L1223 315ZM1260 327L1261 316L1229 328ZM1167 332L1194 319L1201 332ZM1229 328L1223 315L1201 332Z'/><path fill='#9b8c82' stroke='#9b8c82' stroke-width='.6' d='M989 431L981 423L982 447ZM1012 406L1031 410L1023 423ZM982 447L989 431L1006 444ZM982 447L990 465L1006 444ZM989 431L999 420L1006 444ZM1023 423L999 420L1006 444ZM1237 276L1220 276L1220 288ZM1237 276L1220 288L1255 291ZM1199 284L1220 288L1200 303ZM1255 291L1220 288L1223 315ZM1255 291L1270 294L1261 316ZM1281 317L1282 306L1292 318ZM1261 316L1223 315L1229 328ZM1223 315L1194 319L1201 332ZM1260 327L1229 328L1235 342ZM1201 332L1198 364L1235 342ZM1229 328L1201 332L1235 342ZM1235 342L1260 327L1257 357ZM1291 335L1260 327L1275 363ZM1260 327L1257 357L1275 363ZM1291 335L1288 359L1275 363ZM1235 342L1198 364L1219 372Z'/><path fill='#fffaf5' stroke='#fffaf5' stroke-width='.6' d='M982 447L990 465L973 495ZM971 523L953 514L959 525ZM943 623L967 618L947 640ZM951 656L941 673L975 701ZM1008 662L975 701L1022 697ZM1155 362L1167 332L1184 365ZM1184 365L1198 364L1186 381ZM1149 463L1165 440L1174 472ZM1139 531L1113 517L1124 550ZM1151 544L1139 531L1124 550ZM1246 449L1250 462L1226 466ZM1189 468L1215 463L1200 478Z'/><path fill='#fffaf0' stroke='#fffaf0' stroke-width='.6' d='M980 506L973 495L953 514ZM959 525L971 523L990 556ZM953 606L967 597L967 618Z'/><path fill='#ffffff' stroke='#ffffff' stroke-width='.6' d='M980 506L996 508L985 521ZM959 525L953 514L939 537ZM959 525L990 556L935 560ZM1089 446L1077 449L1095 462ZM1095 462L1077 449L1076 465ZM1037 460L1031 440L1017 466ZM1076 465L1077 449L1062 467ZM1037 460L1058 445L1049 468ZM1062 467L1058 445L1049 468ZM990 465L1017 466L1002 475ZM1037 460L1017 466L1039 475ZM1037 460L1049 468L1039 475ZM1076 465L1095 462L1090 484ZM1076 465L1062 467L1078 486ZM1076 465L1090 484L1078 486ZM1017 466L1039 475L1032 487ZM1062 467L1049 468L1048 489ZM1032 487L1039 475L1048 489ZM1032 487L1017 466L1018 495ZM1078 486L1090 484L1089 499ZM1032 487L1048 489L1051 505ZM1058 495L1048 489L1051 505ZM1032 487L1018 495L1026 505ZM1078 486L1058 495L1063 509ZM1078 486L1089 499L1063 509ZM1051 505L1058 495L1063 509ZM1063 509L1089 499L1086 513ZM1063 509L1086 513L1073 521ZM985 521L996 508L1022 533ZM996 508L1026 505L1022 533ZM1051 505L1026 505L1022 533ZM1073 521L1086 513L1078 540ZM1051 505L1063 509L1069 547ZM1063 509L1073 521L1069 547ZM1051 505L1022 533L1069 547ZM990 556L991 600L1007 552ZM991 600L1007 552L1047 588ZM1058 573L1007 552L1047 588ZM991 600L1047 588L1023 621ZM1023 621L1047 588L1049 627ZM1150 295L1173 299L1148 308ZM1148 308L1173 299L1176 312ZM1176 312L1148 308L1167 332ZM1148 308L1167 332L1141 343ZM1155 362L1184 365L1162 376ZM1134 362L1155 362L1142 378ZM1144 399L1123 385L1127 409ZM1089 446L1089 428L1103 438ZM1089 428L1116 417L1103 438ZM1095 462L1089 446L1103 438ZM1168 417L1139 423L1148 438ZM1168 417L1148 438L1165 440ZM1139 423L1116 417L1120 442ZM1103 438L1116 417L1120 442ZM1139 423L1148 438L1120 442ZM1103 438L1095 462L1120 442ZM1165 440L1148 438L1149 463ZM1120 442L1148 438L1149 463ZM1189 468L1165 440L1174 472ZM1090 484L1089 499L1110 474ZM1095 462L1090 484L1110 474ZM1095 462L1120 442L1110 474ZM1189 468L1174 472L1176 483ZM1151 483L1174 472L1176 483ZM1110 474L1149 463L1136 485ZM1110 474L1136 485L1133 496ZM1151 483L1176 483L1161 504ZM1151 483L1161 504L1144 507ZM1197 491L1176 483L1187 516ZM1089 499L1086 513L1113 517ZM1110 474L1089 499L1113 517ZM1110 474L1133 496L1113 517ZM1133 496L1144 507L1113 517ZM1161 504L1144 507L1139 531ZM1078 540L1086 513L1102 537ZM1113 517L1086 513L1102 537ZM1161 504L1187 516L1179 544ZM1102 537L1078 540L1100 560ZM1102 537L1100 560L1112 563ZM1189 468L1187 425L1210 442ZM1219 420L1198 426L1210 442ZM1246 449L1235 437L1226 466ZM1259 481L1235 496L1236 508Z'/><path fill='#fffffa' stroke='#fffffa' stroke-width='.6' d='M980 506L953 514L971 523ZM959 525L939 537L935 560ZM935 560L990 556L976 578ZM976 578L935 560L939 583ZM976 578L939 583L967 597ZM976 578L990 556L991 600ZM976 578L967 597L991 600ZM967 597L991 600L967 618ZM991 600L967 618L974 627ZM1006 444L990 465L1017 466ZM1049 468L1039 475L1048 489ZM1078 486L1062 467L1058 495ZM1062 467L1048 489L1058 495ZM1017 466L1002 475L1018 495ZM985 521L990 556L1007 552ZM985 521L1022 533L1007 552ZM1022 533L1069 547L1058 573ZM1022 533L1007 552L1058 573ZM1083 583L1058 573L1047 588ZM1079 622L1047 588L1049 627ZM1176 312L1194 319L1167 332ZM1141 343L1167 332L1155 362ZM1134 362L1141 343L1155 362ZM1184 365L1162 376L1186 381ZM1101 407L1123 385L1127 409ZM1101 407L1089 428L1116 417ZM1127 409L1144 399L1139 423ZM1120 442L1149 463L1110 474ZM1149 463L1174 472L1151 483ZM1151 483L1149 463L1136 485ZM1151 483L1136 485L1133 496ZM1161 504L1176 483L1187 516ZM1113 517L1144 507L1139 531ZM1102 537L1113 517L1124 550ZM1078 540L1069 547L1100 560ZM1083 583L1069 547L1100 560ZM1124 550L1160 556L1150 582ZM1219 420L1231 408L1235 437ZM1198 426L1187 425L1210 442ZM1197 491L1200 478L1213 496ZM1197 491L1213 496L1211 510Z'/><path fill='#fafaf0' stroke='#fafaf0' stroke-width='.6' d='M980 506L985 521L971 523ZM1008 662L1032 672L1022 697Z'/><path fill='#d2b49b' stroke='#d2b49b' stroke-width='.6' d='M862 511L883 541L913 523Z'/><path fill='#d7b9a0' stroke='#d7b9a0' stroke-width='.6' d='M953 514L913 523L939 537Z'/><path fill='#fffff5' stroke='#fffff5' stroke-width='.6' d='M985 521L971 523L990 556Z'/><path fill='#dcbea5' stroke='#dcbea5' stroke-width='.6' d='M894 566L913 523L935 560ZM939 537L913 523L935 560Z'/><path fill='#dcc3aa' stroke='#dcc3aa' stroke-width='.6' d='M922 594L939 583L953 606Z'/><path fill='#faf5f0' stroke='#faf5f0' stroke-width='.6' d='M967 597L939 583L953 606ZM974 627L967 618L947 640ZM947 640L974 627L951 656ZM974 627L991 600L1002 645ZM1023 621L991 600L1002 645ZM1023 621L1049 627L1037 660ZM1023 621L1002 645L1037 660ZM951 656L975 701L1008 662ZM1032 672L1043 678L1022 697ZM1077 671L1043 678L1056 702ZM1022 697L975 701L1004 727ZM1031 722L1022 697L1004 727ZM1142 378L1123 385L1144 399ZM1186 381L1162 376L1173 399ZM1142 378L1162 376L1158 401ZM1158 401L1168 417L1139 423ZM1127 409L1116 417L1139 423ZM1187 425L1168 417L1165 440ZM1151 544L1179 544L1160 556ZM1151 544L1124 550L1160 556ZM1205 377L1186 381L1203 402ZM1232 532L1211 510L1206 540Z'/><path fill='#e1c8b4' stroke='#e1c8b4' stroke-width='.6' d='M873 637L893 651L906 638Z'/><path fill='#e6cdb9' stroke='#e6cdb9' stroke-width='.6' d='M943 623L922 594L906 638Z'/><path fill='#ebd7c3' stroke='#ebd7c3' stroke-width='.6' d='M931 649L941 673L906 694Z'/><path fill='#c8b9a5' stroke='#c8b9a5' stroke-width='.6' d='M941 673L906 694L930 698Z'/><path fill='#e6d2be' stroke='#e6d2be' stroke-width='.6' d='M941 673L930 698L941 707Z'/><path fill='#f5f0eb' stroke='#f5f0eb' stroke-width='.6' d='M941 673L975 701L941 707ZM996 508L1018 495L1026 505ZM951 656L974 627L1002 645ZM1056 702L1022 697L1031 722ZM975 701L974 752L1004 727ZM1083 583L1100 560L1105 589ZM1083 583L1079 622L1105 589ZM1198 426L1184 404L1203 402ZM1198 426L1203 402L1219 420ZM1189 468L1176 483L1200 478ZM1259 481L1272 487L1260 520ZM1359 560L1331 551L1333 592Z'/><path fill='#ebd7c8' stroke='#ebd7c8' stroke-width='.6' d='M941 707L930 698L915 725Z'/><path fill='#faf5eb' stroke='#faf5eb' stroke-width='.6' d='M941 707L975 701L946 726Z'/><path fill='#f0ebe6' stroke='#f0ebe6' stroke-width='.6' d='M946 726L975 701L974 752ZM947 740L946 726L974 752ZM980 506L996 508L1000 496ZM1049 627L1037 660L1066 661ZM993 763L1004 727L1027 769ZM1031 722L1066 735L1045 772ZM1172 564L1160 556L1150 582ZM1090 688L1066 735L1108 694ZM1253 632L1218 629L1225 650ZM1356 493L1377 514L1342 527ZM1377 514L1385 524L1342 527ZM1342 527L1331 551L1359 560Z'/><path fill='#e6e1dc' stroke='#e6e1dc' stroke-width='.6' d='M947 740L974 752L959 772ZM967 894L986 901L967 916ZM1066 735L1095 769L1045 772ZM1027 769L1045 772L1029 794ZM1009 937L1004 948L1020 948ZM1124 635L1164 624L1156 666ZM1136 705L1108 694L1123 729ZM1172 564L1179 544L1202 567ZM1240 895L1198 899L1230 924ZM1359 560L1391 537L1395 560ZM1309 693L1298 706L1332 740ZM1279 899L1298 881L1310 909ZM1310 909L1340 900L1330 921ZM1265 946L1262 917L1313 940Z'/><path fill='#dcd7d2' stroke='#dcd7d2' stroke-width='.6' d='M993 763L974 752L959 772ZM1002 645L1037 660L1008 662ZM1032 672L1037 660L1043 678ZM993 763L994 794L1027 769ZM1027 769L994 794L1029 794ZM1045 772L1095 769L1086 798ZM1045 772L1086 798L1045 800ZM1029 794L994 794L1005 831ZM1183 734L1184 720L1142 736ZM1142 736L1183 734L1176 770ZM1095 769L1134 772L1119 790ZM1183 812L1181 847L1194 848ZM1155 843L1181 847L1160 869ZM1125 884L1088 894L1101 908ZM1253 632L1255 668L1267 668ZM1215 700L1236 725L1215 735ZM1233 782L1245 768L1269 805ZM1260 860L1240 895L1256 905ZM1293 660L1270 627L1318 636ZM1278 681L1293 660L1309 693ZM1309 693L1360 690L1357 724ZM1332 740L1298 706L1312 740ZM1280 771L1312 740L1321 755ZM1321 755L1320 778L1302 782Z'/><path fill='#e1dcd7' stroke='#e1dcd7' stroke-width='.6' d='M993 763L959 772L994 794ZM1045 772L1029 794L1045 800ZM1136 705L1175 700L1142 736ZM1142 736L1123 729L1130 758ZM1130 758L1142 736L1176 770ZM1170 838L1183 812L1181 847ZM1155 843L1116 863L1160 869ZM1181 603L1194 591L1207 626ZM1248 694L1236 725L1271 732ZM1280 771L1245 768L1269 805ZM1194 848L1183 812L1216 817ZM1233 782L1269 805L1231 833ZM1359 560L1395 560L1391 583ZM1313 564L1333 592L1304 601ZM1343 609L1304 601L1318 636ZM1346 664L1360 690L1309 693ZM1357 724L1309 693L1332 740ZM1300 730L1298 706L1312 740Z'/><path fill='#dcd7cd' stroke='#dcd7cd' stroke-width='.6' d='M959 772L994 794L976 802Z'/><path fill='#c3beb9' stroke='#c3beb9' stroke-width='.6' d='M976 802L994 794L977 825ZM986 874L999 900L986 901ZM1035 832L1046 818L1069 853ZM1030 858L1035 832L1056 863ZM1005 831L1022 867L1004 873ZM1098 867L1083 857L1089 881ZM1004 873L1022 867L1021 897ZM1089 881L1056 863L1065 907ZM1150 818L1183 812L1170 838ZM1125 836L1150 818L1155 843ZM1125 884L1135 905L1101 908ZM1172 889L1198 899L1172 911ZM1289 840L1260 845L1260 860ZM1212 878L1198 899L1240 895ZM1212 878L1228 876L1240 895ZM1289 840L1313 816L1311 848Z'/><path fill='#cdc8b9' stroke='#cdc8b9' stroke-width='.6' d='M976 802L953 803L977 825ZM952 840L990 832L986 874ZM971 877L930 856L933 904Z'/><path fill='#fff5e6' stroke='#fff5e6' stroke-width='.6' d='M990 832L977 825L952 840Z'/><path fill='#cdc8be' stroke='#cdc8be' stroke-width='.6' d='M879 883L896 866L917 885Z'/><path fill='#c8c3be' stroke='#c8c3be' stroke-width='.6' d='M986 874L971 877L986 901ZM967 894L971 877L986 901ZM1035 832L1069 853L1056 863ZM1056 863L1083 857L1089 881ZM1165 680L1175 700L1194 702ZM1176 770L1198 766L1181 797ZM1181 797L1144 789L1150 818ZM1144 789L1130 797L1150 818ZM1080 834L1079 814L1112 837ZM1194 886L1191 869L1172 889ZM1125 884L1160 869L1159 890ZM1293 660L1267 668L1278 681ZM1225 750L1207 774L1233 782ZM1275 834L1289 840L1260 845ZM1260 845L1225 857L1260 860ZM1225 857L1228 876L1212 878ZM1275 834L1289 840L1313 816ZM1289 840L1298 881L1311 864Z'/><path fill='#ebe6e1' stroke='#ebe6e1' stroke-width='.6' d='M999 900L986 901L998 922ZM1066 661L1079 622L1077 671ZM1031 722L1004 727L1027 769ZM998 922L999 900L1021 897ZM1021 897L998 922L1023 929ZM986 936L1009 937L1004 948ZM1098 943L1065 907L1060 951ZM1105 589L1079 622L1124 635ZM1183 657L1164 624L1156 666ZM1108 694L1066 735L1123 729ZM1088 894L1065 907L1101 908ZM1172 911L1198 899L1191 931ZM1183 657L1164 624L1207 626ZM1256 607L1270 627L1253 632ZM1278 681L1277 698L1298 706ZM1191 931L1198 899L1230 924ZM1240 895L1256 905L1230 924ZM1225 943L1230 924L1265 946ZM1342 527L1385 524L1359 560ZM1311 864L1298 881L1310 881ZM1279 899L1262 917L1310 909ZM1310 881L1298 881L1310 909ZM1330 879L1340 900L1310 909ZM1310 909L1330 921L1313 940Z'/><path fill='#ebe6dc' stroke='#ebe6dc' stroke-width='.6' d='M986 901L967 916L998 922ZM1021 897L1042 908L1023 929ZM1023 929L1020 948L1060 951ZM1098 943L1065 907L1101 908ZM1135 905L1101 908L1123 920ZM1310 881L1330 879L1310 909ZM1310 909L1262 917L1313 940Z'/><path fill='#e6e1d7' stroke='#e6e1d7' stroke-width='.6' d='M998 922L967 916L986 936ZM1023 929L998 922L1009 937ZM1023 929L1009 937L1020 948ZM1065 907L1042 908L1060 951ZM1098 943L1101 908L1123 920ZM1256 905L1262 917L1230 924Z'/><path fill='#6e645a' stroke='#6e645a' stroke-width='.6' d='M1040 165L1050 182L1036 184ZM1090 214L1055 220L1084 233ZM1296 204L1274 201L1287 211ZM1250 205L1274 201L1263 227ZM1287 211L1274 201L1280 228Z'/><path fill='#73645a' stroke='#73645a' stroke-width='.6' d='M1040 165L1050 182L1065 189ZM1046 211L1055 220L1049 234ZM1046 211L1030 226L1049 234ZM1049 234L1030 226L1029 242ZM1265 189L1273 176L1274 201ZM1265 189L1274 201L1250 205ZM1250 205L1240 214L1244 225ZM1206 250L1222 234L1232 258ZM1287 211L1280 228L1301 242ZM1279 403L1274 385L1301 374ZM1279 403L1301 374L1311 400Z'/><path fill='#6e5f5a' stroke='#6e5f5a' stroke-width='.6' d='M1036 184L1050 182L1034 204ZM1050 182L1065 189L1046 211ZM1034 204L1050 182L1046 211ZM1069 200L1065 189L1046 211ZM1090 214L1069 200L1055 220ZM1046 211L1034 204L1030 226ZM1049 234L1029 242L1060 253ZM1029 242L1060 253L1044 275ZM1274 201L1273 176L1296 204ZM1250 205L1244 225L1263 227ZM1295 288L1298 303L1282 306ZM1296 204L1287 211L1301 242ZM1294 255L1280 228L1301 242Z'/><path fill='#cdaaa5' stroke='#cdaaa5' stroke-width='.6' d='M1046 211L1069 200L1055 220ZM1261 247L1280 228L1294 255ZM1261 247L1257 269L1280 279ZM1257 269L1280 279L1270 294Z'/><path fill='#d2afaa' stroke='#d2afaa' stroke-width='.6' d='M1084 233L1055 220L1049 234ZM1237 276L1232 258L1220 276ZM1261 247L1294 255L1280 279ZM1237 276L1257 269L1255 291Z'/><path fill='#d7afaa' stroke='#d7afaa' stroke-width='.6' d='M1049 234L1084 233L1060 253ZM1263 227L1244 225L1243 245ZM1232 258L1206 250L1220 276Z'/><path fill='#e1b9b4' stroke='#e1b9b4' stroke-width='.6' d='M1060 253L1084 233L1073 269ZM1073 269L1098 258L1084 286ZM1105 269L1119 250L1117 276Z'/><path fill='#dcb4af' stroke='#dcb4af' stroke-width='.6' d='M1098 258L1084 233L1073 269ZM1073 269L1051 285L1066 292ZM1073 269L1084 286L1066 292ZM1084 286L1098 258L1105 269ZM1098 258L1119 250L1105 269Z'/><path fill='#d7afaf' stroke='#d7afaf' stroke-width='.6' d='M1073 269L1060 253L1044 275ZM1222 234L1243 245L1232 258Z'/><path fill='#73645f' stroke='#73645f' stroke-width='.6' d='M1044 275L1029 242L1024 281ZM1044 275L1024 281L1051 285ZM1051 285L1024 281L1032 303ZM1090 214L1084 233L1115 238ZM1098 258L1115 238L1119 250ZM1273 176L1290 165L1296 204ZM1244 225L1222 234L1243 245ZM1206 250L1190 262L1220 276ZM1279 403L1298 419L1283 419ZM1279 403L1263 401L1259 421ZM1279 403L1283 419L1259 421ZM1263 401L1231 408L1259 421ZM1294 255L1301 242L1306 281ZM1279 403L1298 419L1311 400Z'/><path fill='#e6b9b9' stroke='#e6b9b9' stroke-width='.6' d='M1044 275L1073 269L1051 285Z'/><path fill='#a59187' stroke='#a59187' stroke-width='.6' d='M1084 286L1066 292L1088 314ZM1088 314L1066 292L1048 316ZM1048 316L1032 303L1027 317ZM1017 324L1027 317L1038 331ZM1088 314L1094 327L1068 334ZM1068 334L1048 316L1046 342ZM1009 351L1038 331L1022 360ZM1068 334L1046 342L1058 360ZM1022 360L1046 342L1058 360ZM1022 360L999 370L1017 379ZM1012 406L1017 379L1031 410ZM1179 246L1151 246L1161 255ZM1179 246L1190 262L1177 269ZM1140 262L1138 275L1117 276ZM1105 269L1097 293L1117 276ZM1190 262L1177 269L1199 284ZM1199 284L1177 269L1167 288ZM1152 266L1138 275L1150 295ZM1150 295L1167 288L1173 299ZM1150 295L1138 275L1131 308ZM1088 314L1094 327L1101 313ZM1131 308L1148 308L1122 327ZM1079 345L1086 363L1105 362ZM1079 345L1115 342L1105 362ZM1134 362L1115 342L1105 362ZM1190 262L1196 241L1206 250ZM1199 284L1190 262L1220 276Z'/><path fill='#a5968c' stroke='#a5968c' stroke-width='.6' d='M1084 286L1097 293L1088 314ZM1017 324L1038 331L1009 351ZM1151 246L1119 250L1140 262ZM1152 266L1167 288L1150 295ZM1117 276L1138 275L1117 298ZM1117 276L1097 293L1117 298ZM1088 314L1097 293L1101 313ZM1101 313L1094 327L1122 327ZM1131 308L1117 298L1122 327Z'/><path fill='#78695f' stroke='#78695f' stroke-width='.6' d='M1051 285L1066 292L1048 316ZM1032 303L1051 285L1048 316ZM1032 303L1024 281L1017 324ZM1032 303L1027 317L1017 324ZM1219 372L1235 342L1250 376ZM1250 376L1275 363L1274 385ZM1250 376L1219 372L1217 391ZM1274 385L1256 388L1263 401ZM1250 376L1256 388L1231 408ZM1263 401L1256 388L1231 408ZM1259 421L1283 419L1277 448ZM1259 421L1277 448L1246 449ZM1275 363L1274 385L1301 374Z'/><path fill='#a59687' stroke='#a59687' stroke-width='.6' d='M1048 316L1027 317L1038 331ZM999 370L997 395L1017 379ZM1058 445L1077 449L1062 467ZM1131 308L1150 295L1148 308Z'/><path fill='#aa968c' stroke='#aa968c' stroke-width='.6' d='M1048 316L1088 314L1068 334ZM1048 316L1038 331L1046 342ZM1046 342L1038 331L1022 360ZM1058 445L1031 440L1037 460ZM1006 444L1031 440L1017 466ZM1161 255L1151 246L1152 266Z'/><path fill='#a08c82' stroke='#a08c82' stroke-width='.6' d='M1022 360L1046 376L1017 379ZM1036 430L1046 424L1058 445ZM1036 430L1031 440L1058 445ZM1179 246L1196 241L1190 262ZM1161 255L1179 246L1177 269ZM1148 308L1122 327L1141 343ZM1115 342L1141 343L1134 362Z'/><path fill='#827369' stroke='#827369' stroke-width='.6' d='M1086 363L1058 360L1066 380ZM1066 380L1046 376L1055 401ZM1071 428L1046 424L1058 445ZM1071 428L1089 428L1077 449ZM1089 446L1089 428L1077 449ZM1071 428L1058 445L1077 449ZM1259 421L1235 437L1246 449ZM1333 395L1339 429L1362 446ZM1339 429L1362 446L1348 462Z'/><path fill='#826e69' stroke='#826e69' stroke-width='.6' d='M1090 376L1086 363L1066 380ZM1090 376L1066 380L1083 399ZM1055 401L1046 376L1031 410ZM1083 399L1055 401L1071 428ZM1083 399L1090 376L1101 407Z'/><path fill='#7d6e64' stroke='#7d6e64' stroke-width='.6' d='M1046 376L1058 360L1066 380ZM1083 399L1066 380L1055 401ZM1031 410L1055 401L1046 424ZM1055 401L1046 424L1071 428ZM1071 428L1083 399L1089 428ZM1031 410L1046 424L1036 430ZM1090 376L1086 363L1105 362ZM1090 376L1105 362L1123 385ZM1134 362L1105 362L1123 385ZM1090 376L1123 385L1101 407ZM1083 399L1089 428L1101 407ZM1205 377L1219 372L1217 391Z'/><path fill='#fafaf5' stroke='#fafaf5' stroke-width='.6' d='M973 495L990 465L1002 475ZM1018 495L1002 475L1000 496ZM1032 487L1051 505L1026 505ZM1155 362L1162 376L1142 378ZM1142 378L1144 399L1158 401ZM1186 381L1173 399L1184 404ZM1158 401L1173 399L1168 417ZM1127 409L1101 407L1116 417ZM1158 401L1144 399L1139 423ZM1151 544L1161 504L1179 544ZM1102 537L1124 550L1112 563ZM1124 550L1112 563L1150 582ZM1181 603L1155 608L1164 624ZM1184 365L1167 332L1201 332ZM1184 365L1198 364L1201 332ZM1205 377L1217 391L1203 402ZM1235 437L1210 442L1215 463ZM1200 478L1227 482L1213 496ZM1197 491L1187 516L1211 510ZM1236 508L1213 496L1211 510Z'/><path fill='#f0ebeb' stroke='#f0ebeb' stroke-width='.6' d='M980 506L973 495L1000 496ZM1277 448L1250 462L1271 476Z'/><path fill='#f5f5f0' stroke='#f5f5f0' stroke-width='.6' d='M973 495L1002 475L1000 496ZM1079 622L1049 627L1066 661ZM1022 697L1043 678L1056 702ZM1187 425L1165 440L1189 468ZM1161 504L1139 531L1151 544ZM1186 381L1198 364L1205 377ZM1219 372L1198 364L1205 377ZM1217 391L1203 402L1231 408ZM1187 516L1211 510L1206 540Z'/><path fill='#ebebe6' stroke='#ebebe6' stroke-width='.6' d='M996 508L1018 495L1000 496ZM1031 722L1056 702L1066 735ZM1027 769L1031 722L1045 772ZM1179 544L1160 556L1172 564ZM1077 671L1079 622L1112 669ZM1124 635L1079 622L1112 669ZM1156 666L1124 635L1112 669ZM1271 476L1293 454L1298 487ZM1271 476L1259 481L1272 487ZM1271 476L1298 487L1272 487ZM1259 481L1227 482L1235 496ZM1236 508L1259 481L1260 520ZM1236 508L1211 510L1232 532ZM1260 520L1236 508L1232 532ZM1260 520L1232 532L1265 540ZM1179 544L1206 540L1202 567ZM1277 698L1298 706L1271 732ZM1256 607L1270 627L1304 601ZM1278 681L1298 706L1309 693Z'/><path fill='#d7d7d2' stroke='#d7d7d2' stroke-width='.6' d='M1078 540L1073 521L1069 547ZM1045 800L1079 814L1046 818ZM1120 678L1112 669L1108 694ZM1165 680L1156 666L1136 705ZM1130 758L1095 769L1134 772ZM1202 567L1206 540L1223 573ZM1232 532L1265 540L1243 574ZM1183 734L1184 720L1215 735ZM1233 782L1216 817L1231 833ZM1356 493L1351 476L1336 493ZM1269 805L1280 771L1302 782ZM1280 771L1321 755L1302 782Z'/><path fill='#faf5f5' stroke='#faf5f5' stroke-width='.6' d='M1069 547L1058 573L1083 583ZM1083 583L1047 588L1079 622ZM1235 437L1215 463L1226 466ZM1226 466L1215 463L1227 482Z'/><path fill='#d7d2cd' stroke='#d7d2cd' stroke-width='.6' d='M951 656L1002 645L1008 662ZM1066 661L1077 671L1043 678ZM1045 800L1086 798L1079 814ZM1045 800L1029 794L1046 818ZM1029 794L1046 818L1035 832ZM1056 863L1022 867L1021 897ZM1156 666L1112 669L1120 678ZM1156 666L1120 678L1136 705ZM1108 694L1120 678L1136 705ZM1130 758L1176 770L1134 772ZM1155 843L1170 838L1181 847ZM1160 869L1116 863L1125 884ZM1183 657L1225 650L1211 678ZM1215 700L1248 694L1236 725ZM1216 817L1231 833L1215 841ZM1269 805L1231 833L1260 845ZM1260 860L1279 899L1256 905ZM1359 560L1333 592L1377 606ZM1377 606L1343 609L1348 623ZM1332 740L1312 740L1321 755ZM1332 740L1321 755L1348 757ZM1348 757L1321 755L1320 778Z'/><path fill='#d2d2cd' stroke='#d2d2cd' stroke-width='.6' d='M1008 662L1037 660L1032 672ZM1005 831L1029 794L1035 832ZM1172 564L1194 591L1181 603ZM1232 532L1223 573L1243 574ZM1256 607L1235 591L1218 629ZM1165 680L1194 702L1211 678ZM1232 667L1225 650L1211 678ZM1255 668L1267 668L1248 694ZM1183 734L1198 766L1215 735ZM1215 841L1231 833L1225 857ZM1260 845L1231 833L1225 857ZM1328 475L1318 486L1336 493ZM1318 486L1336 493L1335 504ZM1318 486L1335 504L1314 508ZM1348 623L1343 609L1318 636ZM1269 805L1302 782L1313 816ZM1320 778L1302 782L1313 816Z'/><path fill='#d7d2d2' stroke='#d7d2d2' stroke-width='.6' d='M1066 661L1037 660L1043 678ZM1172 564L1150 582L1181 603ZM1172 564L1194 591L1202 567ZM1293 660L1270 627L1267 668ZM1333 592L1304 601L1343 609Z'/><path fill='#cdcdc8' stroke='#cdcdc8' stroke-width='.6' d='M1089 676L1077 671L1090 688ZM1105 589L1150 582L1155 608ZM1089 676L1090 688L1108 694ZM1089 676L1112 669L1108 694ZM1119 790L1134 772L1130 797ZM1235 591L1243 574L1256 607ZM1165 680L1183 657L1211 678ZM1289 840L1260 860L1298 881ZM1328 475L1351 476L1336 493ZM1335 504L1314 508L1342 527Z'/><path fill='#d2cdc8' stroke='#d2cdc8' stroke-width='.6' d='M1090 688L1077 671L1056 702ZM1005 831L990 832L1004 873ZM1021 897L1056 863L1042 908ZM1156 666L1183 657L1165 680ZM1183 734L1198 766L1176 770ZM1176 770L1134 772L1144 789ZM1119 790L1130 797L1135 817ZM1160 869L1181 847L1191 869ZM1089 881L1098 867L1125 884ZM1116 863L1098 867L1125 884ZM1235 591L1207 626L1218 629ZM1232 667L1225 650L1255 668ZM1211 678L1194 702L1215 700ZM1215 735L1236 725L1225 750ZM1236 725L1271 732L1245 768ZM1275 834L1269 805L1260 845ZM1215 841L1194 848L1225 857ZM1194 848L1191 869L1212 878ZM1194 848L1225 857L1212 878ZM1313 564L1288 556L1304 601ZM1293 660L1318 636L1328 645ZM1346 664L1357 656L1360 690ZM1328 645L1293 660L1309 693ZM1275 834L1269 805L1313 816ZM1311 848L1289 840L1311 864Z'/><path fill='#f0ebe1' stroke='#f0ebe1' stroke-width='.6' d='M993 763L974 752L1004 727ZM986 936L998 922L1009 937ZM1279 899L1256 905L1262 917ZM1191 931L1230 924L1225 943ZM1262 917L1230 924L1265 946ZM1311 864L1330 879L1310 881Z'/><path fill='#ebe6e6' stroke='#ebe6e6' stroke-width='.6' d='M1090 688L1056 702L1066 735Z'/><path fill='#dcdcd2' stroke='#dcdcd2' stroke-width='.6' d='M990 832L994 794L1005 831ZM1194 848L1216 817L1215 841Z'/><path fill='#cdc8c3' stroke='#cdc8c3' stroke-width='.6' d='M1079 814L1046 818L1080 834ZM1080 834L1046 818L1069 853ZM1004 873L999 900L1021 897ZM1065 907L1056 863L1042 908ZM1181 603L1150 582L1155 608ZM1144 789L1134 772L1130 797ZM1086 798L1079 814L1112 837ZM1119 790L1086 798L1112 837ZM1119 790L1135 817L1112 837ZM1160 869L1191 869L1172 889ZM1172 889L1160 869L1159 890ZM1253 632L1225 650L1255 668ZM1215 735L1198 766L1225 750ZM1198 766L1181 797L1207 774ZM1207 774L1181 797L1216 817ZM1194 886L1191 869L1212 878ZM1290 543L1331 551L1313 564ZM1348 623L1318 636L1328 645ZM1328 645L1357 656L1346 664ZM1328 645L1346 664L1309 693ZM1348 757L1320 778L1333 788ZM1333 788L1320 778L1313 816Z'/><path fill='#b9b9b4' stroke='#b9b9b4' stroke-width='.6' d='M1080 834L1069 853L1083 857ZM1155 843L1125 836L1116 863Z'/><path fill='#c8c8c3' stroke='#c8c8c3' stroke-width='.6' d='M1005 831L1035 832L1030 858ZM1165 680L1175 700L1136 705ZM1290 543L1265 540L1288 556ZM1225 750L1198 766L1207 774ZM1225 750L1245 768L1233 782ZM1260 860L1225 857L1228 876ZM1362 446L1348 462L1351 476ZM1356 493L1336 493L1335 504ZM1290 543L1314 508L1331 551ZM1328 645L1348 623L1357 656Z'/><path fill='#b9b4af' stroke='#b9b4af' stroke-width='.6' d='M1069 853L1083 857L1056 863ZM1080 834L1083 857L1112 837ZM1125 836L1135 817L1112 837ZM1125 836L1112 837L1116 863Z'/><path fill='#c3c3b9' stroke='#c3c3b9' stroke-width='.6' d='M1005 831L1030 858L1022 867Z'/><path fill='#beb9b4' stroke='#beb9b4' stroke-width='.6' d='M1030 858L1056 863L1022 867ZM1150 818L1135 817L1125 836ZM1150 818L1170 838L1155 843ZM1089 881L1088 894L1125 884ZM1183 812L1181 797L1216 817Z'/><path fill='#bebeb9' stroke='#bebeb9' stroke-width='.6' d='M986 874L999 900L1004 873ZM1135 817L1130 797L1150 818ZM1098 867L1083 857L1112 837ZM1098 867L1112 837L1116 863ZM1223 573L1194 591L1235 591Z'/><path fill='#b4afaa' stroke='#b4afaa' stroke-width='.6' d='M1089 881L1088 894L1065 907ZM1183 812L1181 797L1150 818ZM1194 886L1198 899L1212 878Z'/><path fill='#f0e6e1' stroke='#f0e6e1' stroke-width='.6' d='M1023 929L1042 908L1060 951Z'/><path fill='#786964' stroke='#786964' stroke-width='.6' d='M1098 258L1084 233L1115 238ZM1084 286L1097 293L1105 269ZM1140 262L1119 250L1117 276ZM1250 376L1274 385L1256 388ZM1259 421L1231 408L1235 437Z'/><path fill='#fffafa' stroke='#fffafa' stroke-width='.6' d='M1134 362L1142 378L1123 385ZM1162 376L1173 399L1158 401ZM1184 404L1173 399L1168 417ZM1168 417L1184 404L1187 425ZM1151 483L1133 496L1144 507ZM1186 381L1184 404L1203 402ZM1189 468L1210 442L1215 463ZM1197 491L1176 483L1200 478Z'/><path fill='#f0f0eb' stroke='#f0f0eb' stroke-width='.6' d='M1187 425L1184 404L1198 426ZM1112 563L1100 560L1105 589ZM1112 563L1150 582L1105 589ZM1155 608L1164 624L1124 635ZM1231 408L1203 402L1219 420ZM1226 466L1250 462L1227 482ZM1259 481L1250 462L1227 482ZM1235 496L1213 496L1236 508Z'/><path fill='#e1e1dc' stroke='#e1e1dc' stroke-width='.6' d='M1105 589L1155 608L1124 635ZM1184 720L1175 700L1142 736ZM1123 729L1095 769L1130 758ZM1298 487L1272 487L1279 505ZM1260 520L1265 540L1290 543ZM1245 768L1271 732L1280 771ZM1328 475L1313 466L1318 486ZM1313 564L1331 551L1333 592ZM1280 771L1271 732L1300 730Z'/><path fill='#dcdcd7' stroke='#dcdcd7' stroke-width='.6' d='M1089 676L1077 671L1112 669ZM1086 798L1095 769L1119 790ZM1298 487L1279 505L1295 511ZM1260 520L1279 505L1290 543ZM1181 603L1164 624L1207 626ZM1256 607L1218 629L1253 632ZM1277 698L1248 694L1271 732ZM1326 437L1313 466L1328 475ZM1298 487L1295 511L1314 508ZM1318 486L1298 487L1314 508ZM1377 606L1333 592L1343 609ZM1270 627L1304 601L1318 636ZM1300 730L1280 771L1312 740Z'/><path fill='#e6e6e1' stroke='#e6e6e1' stroke-width='.6' d='M1175 700L1194 702L1184 720ZM1066 735L1095 769L1123 729ZM1136 705L1123 729L1142 736ZM1235 496L1227 482L1213 496ZM1183 657L1207 626L1225 650ZM1278 681L1248 694L1277 698ZM1293 454L1298 487L1313 466ZM1313 466L1298 487L1318 486ZM1298 706L1271 732L1300 730Z'/><path fill='#c3c3be' stroke='#c3c3be' stroke-width='.6' d='M1176 770L1144 789L1181 797ZM1232 667L1255 668L1248 694ZM1278 681L1267 668L1248 694ZM1232 667L1211 678L1215 700ZM1225 750L1236 725L1245 768ZM1233 782L1207 774L1216 817ZM1260 860L1228 876L1240 895ZM1328 475L1348 462L1351 476ZM1356 493L1335 504L1342 527ZM1290 543L1288 556L1313 564Z'/><path fill='#d2d2c8' stroke='#d2d2c8' stroke-width='.6' d='M1194 848L1181 847L1191 869ZM1332 740L1357 724L1348 757Z'/><path fill='#bebeb4' stroke='#bebeb4' stroke-width='.6' d='M1172 889L1194 886L1198 899Z'/><path fill='#d2aaa5' stroke='#d2aaa5' stroke-width='.6' d='M1263 227L1274 201L1280 228ZM1263 227L1280 228L1261 247ZM1232 258L1243 245L1257 269ZM1232 258L1257 269L1237 276ZM1255 291L1257 269L1270 294Z'/><path fill='#695a55' stroke='#695a55' stroke-width='.6' d='M1244 225L1240 214L1222 234ZM1298 303L1282 306L1292 318ZM1280 279L1294 255L1306 281Z'/><path fill='#af918c' stroke='#af918c' stroke-width='.6' d='M1263 227L1243 245L1261 247Z'/><path fill='#c8a5a0' stroke='#c8a5a0' stroke-width='.6' d='M1261 247L1243 245L1257 269ZM1295 288L1280 279L1270 294ZM1295 288L1270 294L1282 306Z'/><path fill='#a09182' stroke='#a09182' stroke-width='.6' d='M1199 284L1173 299L1200 303ZM1200 303L1220 288L1223 315Z'/><path fill='#96877d' stroke='#96877d' stroke-width='.6' d='M1270 294L1282 306L1261 316ZM1260 327L1281 317L1291 335ZM1246 449L1277 448L1250 462ZM1292 318L1291 335L1313 324ZM1324 346L1304 362L1331 370ZM1288 359L1275 363L1301 374ZM1288 359L1304 362L1301 374ZM1293 454L1277 448L1302 439ZM1326 437L1302 439L1313 466Z'/><path fill='#9b877d' stroke='#9b877d' stroke-width='.6' d='M1255 291L1223 315L1261 316ZM1261 316L1282 306L1281 317ZM1261 316L1281 317L1260 327ZM1292 318L1281 317L1291 335Z'/><path fill='#9b8782' stroke='#9b8782' stroke-width='.6' d='M1235 342L1257 357L1250 376Z'/><path fill='#7d6964' stroke='#7d6964' stroke-width='.6' d='M1257 357L1275 363L1250 376ZM1250 376L1217 391L1231 408Z'/><path fill='#78645f' stroke='#78645f' stroke-width='.6' d='M1263 401L1274 385L1279 403Z'/><path fill='#f5f0f0' stroke='#f5f0f0' stroke-width='.6' d='M1235 437L1219 420L1210 442ZM1293 454L1277 448L1271 476ZM1271 476L1250 462L1259 481ZM1200 478L1215 463L1227 482ZM1179 544L1187 516L1206 540Z'/><path fill='#e1dcdc' stroke='#e1dcdc' stroke-width='.6' d='M1272 487L1279 505L1260 520ZM1235 591L1194 591L1207 626Z'/><path fill='#e6e1e1' stroke='#e6e1e1' stroke-width='.6' d='M1295 511L1279 505L1290 543ZM1232 532L1206 540L1223 573ZM1290 543L1295 511L1314 508Z'/><path fill='#d2cdcd' stroke='#d2cdcd' stroke-width='.6' d='M1202 567L1194 591L1223 573Z'/><path fill='#c8c3c3' stroke='#c8c3c3' stroke-width='.6' d='M1288 556L1265 540L1243 574ZM1288 556L1243 574L1256 607ZM1342 527L1314 508L1331 551Z'/><path fill='#c3bebe' stroke='#c3bebe' stroke-width='.6' d='M1223 573L1243 574L1235 591ZM1232 667L1248 694L1215 700Z'/><path fill='#dcd7d7' stroke='#dcd7d7' stroke-width='.6' d='M1218 629L1207 626L1225 650ZM1253 632L1270 627L1267 668ZM1184 720L1194 702L1215 735ZM1215 700L1194 702L1215 735ZM1326 437L1348 462L1328 475ZM1256 607L1288 556L1304 601Z'/><path fill='#cdcdc3' stroke='#cdcdc3' stroke-width='.6' d='M1260 860L1298 881L1279 899Z'/><path fill='#695f55' stroke='#695f55' stroke-width='.6' d='M1295 288L1280 279L1306 281Z'/><path fill='#645a50' stroke='#645a50' stroke-width='.6' d='M1295 288L1298 303L1306 281ZM1306 281L1298 303L1313 324Z'/><path fill='#918278' stroke='#918278' stroke-width='.6' d='M1292 318L1298 303L1313 324ZM1291 335L1313 324L1324 346ZM1291 335L1288 359L1304 362ZM1291 335L1324 346L1304 362ZM1331 370L1320 376L1333 395ZM1320 376L1301 374L1311 400ZM1333 395L1320 376L1311 400ZM1333 395L1311 400L1331 407ZM1331 407L1311 400L1321 414ZM1298 419L1321 414L1309 428ZM1298 419L1283 419L1302 439ZM1277 448L1283 419L1302 439ZM1293 454L1302 439L1313 466Z'/><path fill='#91827d' stroke='#91827d' stroke-width='.6' d='M1331 370L1304 362L1320 376Z'/><path fill='#96827d' stroke='#96827d' stroke-width='.6' d='M1304 362L1301 374L1320 376Z'/><path fill='#8c8278' stroke='#8c8278' stroke-width='.6' d='M1311 400L1298 419L1321 414Z'/><path fill='#877d73' stroke='#877d73' stroke-width='.6' d='M1331 407L1321 414L1331 420Z'/><path fill='#8c7d73' stroke='#8c7d73' stroke-width='.6' d='M1331 420L1321 414L1309 428ZM1331 407L1331 420L1339 429ZM1309 428L1331 420L1326 437ZM1331 420L1339 429L1326 437ZM1326 437L1309 428L1302 439Z'/><path fill='#877873' stroke='#877873' stroke-width='.6' d='M1331 407L1333 395L1339 429Z'/><path fill='#8c7d78' stroke='#8c7d78' stroke-width='.6' d='M1309 428L1298 419L1302 439Z'/><path fill='#82786e' stroke='#82786e' stroke-width='.6' d='M1326 437L1339 429L1348 462Z'/><path fill='#f5f0e6' stroke='#f5f0e6' stroke-width='.6' d='M1385 524L1391 537L1359 560Z'/><path fill='#e6e6dc' stroke='#e6e6dc' stroke-width='.6' d='M1359 560L1391 583L1377 606Z'/><path fill='#b9bec8' stroke='#b9bec8' stroke-width='.6' d='M1395 856L1365 833L1344 862Z'/><path fill='#69737d' stroke='#69737d' stroke-width='.6' d='M1311 848L1344 862L1311 864ZM1485 863L1495 857L1507 882Z'/><path fill='#96a5b4' stroke='#96a5b4' stroke-width='.6' d='M1331 370L1333 395L1401 314Z'/><path fill='#9ba0af' stroke='#9ba0af' stroke-width='.6' d='M1356 493L1377 514L1400 486ZM1460 443L1426 461L1441 550ZM1400 486L1426 461L1441 550Z'/><g transform='translate(1165 405) scale(1.35) translate(-1165 -405)'><path fill='#3d332f' d='M1082 406L1099 390L1126 389L1143 402L1127 420L1100 419Z'/><path fill='#4f8fd0' d='M1086 406L1101 394L1125 393L1140 402L1113 406Z'/><path fill='#6fb0ea' d='M1086 406L1113 406L1140 402L1126 416Z'/><path fill='#3a73b4' d='M1101 394L1125 393L1113 406Z'/><path fill='#1c2230' d='M1108 396L1118 396L1119 409L1107 409Z'/><path fill='#fff' opacity='.9' d='M1101 398L1109 396L1105 403Z'/><path fill='#3d332f' d='M1248 406L1231 390L1204 389L1187 402L1203 420L1230 419Z'/><path fill='#4f8fd0' d='M1244 406L1229 394L1205 393L1190 402L1217 406Z'/><path fill='#6fb0ea' d='M1244 406L1217 406L1190 402L1204 416Z'/><path fill='#3a73b4' d='M1229 394L1205 393L1217 406Z'/><path fill='#1c2230' d='M1212 396L1222 396L1223 409L1211 409Z'/><path fill='#fff' opacity='.9' d='M1229 398L1221 396L1225 403Z'/></g><path fill='#e39aa0' d='M1149 457L1181 457L1165 475Z'/><path fill='#c97c83' d='M1149 457L1165 475L1161 461Z'/><path d='M1165 475V487M1165 487L1151 495M1165 487L1179 495' stroke='#9c8a86' stroke-width='3' fill='none' stroke-linecap='round'/><g stroke='#fff' stroke-width='1.6' opacity='.75' fill='none'><path d='M1125 477L975 455M1125 485L980 495M1205 477L1355 455M1205 485L1350 495'/></g>", '#8d99aa') },
    { name: '星雲', css: svgWall(
      "<defs><radialGradient id='g' cx='.5' cy='.5' r='.8'><stop offset='0' stop-color='#1a0f2e'/><stop offset='1' stop-color='#05030b'/></radialGradient>" +
      "<filter id='s' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='70'/></filter><filter id='t' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='26'/></filter></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/>" +
      "<g filter='url(#s)'><circle cx='620' cy='460' r='300' fill='#d6337a' opacity='.55'/><circle cx='960' cy='520' r='280' fill='#3d6bff' opacity='.5'/><circle cx='800' cy='330' r='200' fill='#ff9a3d' opacity='.35'/><circle cx='1120' cy='300' r='180' fill='#7a3dff' opacity='.4'/></g>" +
      "<g filter='url(#t)' opacity='.7'><path d='M420 620C560 480 700 560 820 440S1060 360 1180 470' stroke='#ffd6ec' stroke-width='40' fill='none'/><path d='M520 380C680 420 760 300 920 330' stroke='#bcd2ff' stroke-width='24' fill='none'/></g>" +
      stars(340, 1000, 47) + "<circle cx='860' cy='470' r='5' fill='#fff'/><circle cx='860' cy='470' r='26' fill='#fff' opacity='.18'/>", '#1a0f2e') },
    { name: '雪山', css: svgWall(
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7fa7d8'/><stop offset='.55' stop-color='#d9e6f5'/><stop offset='1' stop-color='#f7f9fc'/></linearGradient>" +
      "<linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='.45' stop-color='#e6eef8'/><stop offset='1' stop-color='#9fb6d3'/></linearGradient></defs>" +
      "<rect width='1600' height='1000' fill='url(#g)'/><circle cx='1240' cy='210' r='70' fill='#fffdf4' opacity='.9'/>" +
      "<path d='M0 640L260 420L420 520L640 260L860 520L1000 430L1220 600L1400 470L1600 580V1000H0Z' fill='url(#m)'/>" +
      "<path d='M640 260L590 330L620 320L560 410L640 360L700 400L680 330L720 350Z' fill='#fff'/><path d='M260 420L230 470L262 455L245 500L300 460Z' fill='#fff'/>" +
      "<path d='M640 260L860 520L760 470L700 520L660 420Z M260 420L420 520L360 500L320 540Z' fill='#7f97ba' opacity='.35'/>" +
      "<path d='M0 760L300 680L520 740L760 660L1000 740L1260 680L1600 760V1000H0Z' fill='#b9cbe2'/>" +
      "<path d='" + trees(800, 60, 13) + "' fill='#3c5a6e' opacity='.7'/>" +
      "<path d='M0 870L400 820L760 860L1120 810L1600 860V1000H0Z' fill='#f4f7fb'/>", '#d9e6f5') },
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
  function toLogin(keep) {
    if (htui.user && OS.ipc && !keep) { try { OS.ipc.publish('session.logout', { user: htui.user }, 'htui'); } catch (e) { /* 無視 */ } }
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
    const pk = parked[user]; delete parked[user];
    if (pk) pk.wins = pk.wins.filter(w => !w.closed);
    htui.user = user;
    if (OS.ipc) { try { OS.ipc.publish(pk ? 'session.resume' : 'session.login', { user: user }, 'htui'); } catch (e) { /* 無視 */ } }
    htui.fs = OS.fsFor(() => htui.user);
    const sh = OS.sessions[sid] || OS.sessions[OS.hdm.sessionFor(user)] || OS.sessions.htui;
    htui.shell = sh; htui.sessionId = sh.id;
    htui.el.textContent = ''; htui.el.className = 'desktop de-' + sh.id;
    htui.prefs = loadPrefs(); applyPrefs();
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
  htui.sdk = { name: 'HTUi SDK', version: '3.0.1', codename: 'Venus', full: 'HTUi SDK 3.0.1 (Venus)' };
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
  function hotkeys(e) {
    if (htui.locked) return; // ロック中はショートカットを使わない
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
