/* hClock — アラーム・タイマー・ストップウォッチ・世界時計（htmlOS 7.3）
   状態はユーザーごとに ~/.config/hclock.json（アラーム・タイマー・ストップウォッチ・世界時計の都市・音の設定）。
   鳴らすのは hclock.service なので、hClock のウィンドウを閉じても鳴る。タイマーとストップウォッチは「終わる時刻・始めた時刻」で持つので、
   再起動・休止状態をまたいでもずれない。OS.clock は jsh の alarm・timer コマンドからも使う */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path;
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const z2 = n => String(n).padStart(2, '0');
  const TONES = { bell: 'ベル', digital: '目覚まし（電子音）', chime: 'チャイム', soft: 'やさしい音' };
  // 世界時計の都市（地域ごと）
  const CITIES = [
    ['アジア', [['東京', 'Asia/Tokyo'], ['ソウル', 'Asia/Seoul'], ['北京', 'Asia/Shanghai'], ['台北', 'Asia/Taipei'], ['香港', 'Asia/Hong_Kong'], ['マニラ', 'Asia/Manila'], ['バンコク', 'Asia/Bangkok'], ['ハノイ', 'Asia/Ho_Chi_Minh'], ['シンガポール', 'Asia/Singapore'], ['ジャカルタ', 'Asia/Jakarta'], ['ニューデリー', 'Asia/Kolkata'], ['ドバイ', 'Asia/Dubai']]],
    ['ヨーロッパ・アフリカ', [['ロンドン', 'Europe/London'], ['パリ', 'Europe/Paris'], ['ベルリン', 'Europe/Berlin'], ['ローマ', 'Europe/Rome'], ['マドリード', 'Europe/Madrid'], ['ヘルシンキ', 'Europe/Helsinki'], ['イスタンブール', 'Europe/Istanbul'], ['モスクワ', 'Europe/Moscow'], ['カイロ', 'Africa/Cairo'], ['ヨハネスブルグ', 'Africa/Johannesburg']]],
    ['アメリカ', [['ニューヨーク', 'America/New_York'], ['シカゴ', 'America/Chicago'], ['デンバー', 'America/Denver'], ['ロサンゼルス', 'America/Los_Angeles'], ['アンカレッジ', 'America/Anchorage'], ['ホノルル', 'Pacific/Honolulu'], ['トロント', 'America/Toronto'], ['メキシコシティ', 'America/Mexico_City'], ['サンパウロ', 'America/Sao_Paulo'], ['ブエノスアイレス', 'America/Argentina/Buenos_Aires']]],
    ['オセアニア', [['シドニー', 'Australia/Sydney'], ['パース', 'Australia/Perth'], ['オークランド', 'Pacific/Auckland'], ['グアム', 'Pacific/Guam']]],
    ['その他', [['協定世界時（UTC）', 'UTC']]]
  ];
  const DEF = () => ({ alarms: [], timers: [], snoozes: [], sw: { run: false, start: 0, acc: 0, laps: [] },
    zones: [{ tz: 'Europe/London', name: 'ロンドン' }, { tz: 'America/New_York', name: 'ニューヨーク' }], tone: 'bell', vol: 0.7, snooze: 5, seq: 1 });

  // ---------- 状態（ユーザーごと。~/.config/hclock.json）
  const curUser = () => OS.htui && OS.htui.running && OS.htui.user;
  const file = u => OS.users.home(u) + '/.config/hclock.json';
  function load(u) {
    u = u || curUser(); const st = DEF();
    if (!u) return st;
    try { const s = OS.fs.stat(file(u)); if (s) Object.assign(st, JSON.parse(OS.fs.read(file(u)))); } catch (e) { /* 壊れていれば最初から */ }
    return st;
  }
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { /* 見ている側の失敗は無視 */ } });
  function save(st, u) {
    u = u || curUser(); if (!u) throw new Error('hClock はデスクトップにログインしているときに使えます');
    const f = file(u), fsx = OS.fsFor(() => u);
    if (!fsx.isDir(path.dir(f))) fsx.mkdir(path.dir(f), { parents: true });
    fsx.write(f, JSON.stringify(st));
    emit();
  }
  const edit = (fn, u) => { const st = load(u); const r = fn(st); save(st, u); return r; };

  // ---------- 時間の書き方
  // 90 → 90 秒、5m、1h30m、2m30s、1:30（分:秒）、1:00:00（時:分:秒）
  function parseDur(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
    if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
    const m = /^(?:(\d+(?:\.\d+)?)\s*(?:h|時間))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|分))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|秒))?$/.exec(s);
    if (!m || !(m[1] || m[2] || m[3])) return NaN;
    return Math.round((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
  }
  function fmtDur(ms, cs) {
    ms = Math.max(0, ms); const t = cs ? Math.floor(ms / 10) : Math.ceil(ms / 1000);
    const sec = cs ? Math.floor(t / 100) : t, H = Math.floor(sec / 3600), M = Math.floor(sec / 60) % 60, S = sec % 60;
    return (H ? H + ':' + z2(M) : z2(M)) + ':' + z2(S) + (cs ? '.' + z2(t % 100) : '');
  }
  const fmtHM = (H, M) => H + ':' + z2(M);
  function describeDays(days) {
    if (!days || !days.length) return '1 回だけ';
    const d = [...days].sort((a, b) => a - b).join('');
    return d === '0123456' ? '毎日' : d === '12345' ? '平日' : d === '06' ? '土日' : '毎週 ' + [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(x => WD[x]).join('・');
  }
  // 次に鳴る時刻（ms）。鳴らないなら null
  function nextOf(a, from) {
    if (!a.on) return null;
    const base = new Date(from || Date.now());
    for (let d = 0; d <= 7; d++) {
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, a.h, a.m, 0, 0);
      if (t.getTime() <= base.getTime()) continue;
      if (!a.days || !a.days.length || a.days.includes(t.getDay())) return t.getTime();
    }
    return null;
  }
  function untilText(ms) {
    const m = Math.max(1, Math.round(ms / 60000)), H = Math.floor(m / 60), M = m % 60;
    return 'あと ' + (H ? H + ' 時間' + (M ? ' ' : '') : '') + (M ? M + ' 分' : '');
  }
  function dayWord(t) {
    const a = new Date(), b = new Date(t), d = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
    return d === 0 ? '今日' : d === 1 ? '明日' : d === -1 ? '昨日' : (b.getMonth() + 1) + '/' + b.getDate() + '（' + WD[b.getDay()] + '）';
  }
  const timerLeft = t => t.done ? 0 : t.run ? Math.max(0, t.end - Date.now()) : t.left;
  const swElapsed = sw => sw.acc + (sw.run ? Date.now() - sw.start : 0);

  // ---------- 音（OS.sound の部品を使って、その場で合成する）
  const PAT = {
    bell: { every: 1900, f: (S, c, o, t) => [84, 88, 91, 96].forEach((m, i) => S._note(c, o, t + i * 0.14, S.M(m), 0.9, 0.42)) },
    digital: { every: 1400, f: (S, c, o, t) => { for (let g = 0; g < 2; g++) for (let i = 0; i < 4; i++) S._tone(c, o, t + g * 0.62 + i * 0.1, 1975, 0.06, { type: 'square', v: 0.16, a: 0.003 }); } },
    chime: { every: 3400, f: (S, c, o, t) => [76, 72, 74, 67].forEach((m, i) => S._note(c, o, t + i * 0.55, S.M(m), 1.5, 0.4)) },
    soft: { every: 2800, f: (S, c, o, t) => [72, 76, 79, 84].forEach((m, i) => S._note(c, o, t + i * 0.3, S.M(m), 1.6, 0.24 + i * 0.04)) }
  };
  let snd = null; // 鳴っている音: { out, t }
  function soundOn(tone, vol) {
    if (snd) return;
    const S = OS.sound, c = S._ctx && S._ctx(); if (!c) return; // ページを一度も操作していないと鳴らせない（ブラウザーの決まり）
    if (c.state !== 'running') c.resume().catch(() => { /* まだ鳴らせない */ });
    const out = c.createGain(); out.gain.value = Math.max(0.05, Math.min(1, vol == null ? 0.7 : vol)) * 0.6; out.connect(c.destination);
    const p = PAT[tone] || PAT.bell, play = () => { try { p.f(S, c, out, c.currentTime + 0.03); } catch (e) { /* 鳴らせなくても続ける */ } };
    play(); snd = { out: out, t: setInterval(play, p.every) };
  }
  function soundOff() {
    if (!snd) return; clearInterval(snd.t);
    const o = snd.out; snd = null;
    try { o.gain.setTargetAtTime(0.0001, o.context.currentTime, 0.06); } catch (e) { /* 無視 */ }
    setTimeout(() => { try { o.disconnect(); } catch (e) { /* もう外れている */ } }, 500); // つなぎっぱなしにしない（6.0.6 の決まり）
  }
  let previewT = 0;
  function preview(tone, vol) { soundOff(); clearTimeout(previewT); soundOn(tone, vol); previewT = setTimeout(() => { if (!rings.size) soundOff(); }, 2600); }

  // ---------- 鳴らす（ダイアログで「止める」「スヌーズ」）
  const rings = new Map();
  async function ring(o) {
    if (rings.has(o.key)) return;
    const st = load();
    OS.notify({ app: 'hClock', icon: 'alarm', title: o.title, body: o.body || '', silent: true });
    clearTimeout(previewT); soundOn(o.tone || st.tone, st.vol);
    let close = null;
    rings.set(o.key, () => close && close('stop'));
    const auto = setTimeout(() => { if (close) close('timeout'); }, 10 * 60 * 1000); // 10 分で止める
    const now = new Date();
    const body = h('div', { class: 'hk-ring' }, OS.icon(o.kind === 'timer' ? 'clock' : 'alarm', 44),
      h('div', { class: 'hk-ring-t' }, o.kind === 'timer' ? '0:00' : fmtHM(now.getHours(), now.getMinutes())),
      h('div', { class: 'hk-ring-l' }, o.body || (o.kind === 'timer' ? 'タイマー' : 'アラーム')));
    const snoozeMin = o.snooze || st.snooze || 5;
    const buttons = o.kind === 'timer'
      ? [{ label: '+1 分', value: 'plus' }, { label: '止める', primary: true, cancel: true, value: 'stop' }]
      : [{ label: 'スヌーズ（' + snoozeMin + ' 分）', value: 'snooze' }, { label: '止める', primary: true, cancel: true, value: 'stop' }];
    const r = await OS.ui.modal({ title: o.title, parent: null, width: 340, body: body, buttons: buttons, sound: 'notify', onOpen: d => { close = d; } });
    clearTimeout(auto); rings.delete(o.key);
    if (!rings.size) soundOff();
    try {
      if (r === 'snooze') edit(s => { s.snoozes.push({ id: s.seq++, label: o.body || '', at: Date.now() + snoozeMin * 60000, tone: o.tone, snooze: snoozeMin }); });
      else if (r === 'plus') C.addTimer(60, o.body || '');
      else if (r === 'timeout') OS.notify({ app: 'hClock', icon: 'alarm', title: '鳴り続けたので止めました', body: o.title + (o.body ? '：' + o.body : '') });
    } catch (e) { /* ログアウトした */ }
  }
  const stopAll = () => { [...rings.values()].forEach(f => f()); soundOff(); };

  // ---------- OS.clock
  const normAlarm = a => ({ id: a.id, h: Math.min(23, Math.max(0, a.h | 0)), m: Math.min(59, Math.max(0, a.m | 0)), days: (a.days || []).map(Number).filter(x => x >= 0 && x <= 6), label: String(a.label || ''), on: a.on !== false, tone: TONES[a.tone] ? a.tone : null, snooze: a.snooze ? Number(a.snooze) : null, last: a.last || 0 });
  const sortA = st => st.alarms.sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m));
  const findOr = (list, id, what) => { const x = list.find(v => v.id === Number(id)); if (!x) throw new Error(what + ' ' + id + ' はありません'); return x; };
  const C = OS.clock = {
    tones: TONES, cities: CITIES, weekdays: WD, load: load, save: save, parseDur: parseDur, fmtDur: fmtDur, describeDays: describeDays, nextOf: nextOf, untilText: untilText, timerLeft: timerLeft, swElapsed: swElapsed,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    preview: preview, stopRinging: stopAll, get ringing() { return rings.size; },
    // アラーム
    addAlarm(a, u) { return edit(st => { const x = normAlarm(Object.assign({}, a, { id: st.seq++ })); st.alarms.push(x); sortA(st); return x; }, u); },
    updateAlarm(id, patch, u) { return edit(st => { const a = findOr(st.alarms, id, 'アラーム'); Object.assign(a, normAlarm(Object.assign({}, a, patch, { id: a.id }))); if (patch.h != null || patch.m != null || patch.days) a.last = 0; sortA(st); return a; }, u); },
    removeAlarm(id, u) { edit(st => { findOr(st.alarms, id, 'アラーム'); st.alarms = st.alarms.filter(a => a.id !== Number(id)); }, u); },
    next(st) {
      st = st || load(); let best = null;
      st.alarms.forEach(a => { const t = nextOf(a); if (t && (!best || t < best.at)) best = { alarm: a, at: t }; });
      (st.snoozes || []).forEach(s => { if (!best || s.at < best.at) best = { snooze: s, at: s.at }; });
      return best;
    },
    // タイマー
    addTimer(sec, label, u) {
      sec = Math.round(Number(sec));
      if (!(sec > 0)) throw new Error('時間を正しく指定してください（例: 90、5m、1h30m、1:30）');
      if (sec > 100 * 3600) throw new Error('タイマーは 100 時間までです');
      return edit(st => { const t = { id: st.seq++, label: String(label || ''), dur: sec * 1000, end: Date.now() + sec * 1000, left: sec * 1000, run: true, done: false }; st.timers.push(t); return t; }, u);
    },
    pauseTimer(id, u) { edit(st => { const t = findOr(st.timers, id, 'タイマー'); if (t.run) { t.left = Math.max(0, t.end - Date.now()); t.run = false; } }, u); },
    resumeTimer(id, u) { edit(st => { const t = findOr(st.timers, id, 'タイマー'); if (t.done) { t.left = t.dur; t.done = false; } if (!t.run) { t.end = Date.now() + t.left; t.run = true; } }, u); },
    resetTimer(id, u) { edit(st => { const t = findOr(st.timers, id, 'タイマー'); t.run = false; t.done = false; t.left = t.dur; }, u); },
    removeTimer(id, u) { edit(st => { findOr(st.timers, id, 'タイマー'); st.timers = st.timers.filter(t => t.id !== Number(id)); }, u); },
    // ストップウォッチ
    swToggle(u) { edit(st => { const s = st.sw; if (s.run) { s.acc += Date.now() - s.start; s.run = false; } else { s.start = Date.now(); s.run = true; } }, u); },
    swLap(u) { edit(st => { if (st.sw.run) st.sw.laps.push(swElapsed(st.sw)); }, u); },
    swReset(u) { edit(st => { st.sw = { run: false, start: 0, acc: 0, laps: [] }; }, u); },
    // 世界時計
    addZone(tz, name, u) {
      try { new Intl.DateTimeFormat('ja-JP', { timeZone: tz }); } catch (e) { throw new Error(tz + ': そのようなタイムゾーンはありません（例: Asia/Tokyo）'); }
      return edit(st => { if (st.zones.some(z => z.tz === tz && z.name === name)) return; st.zones.push({ tz: tz, name: name || tz.split('/').pop().replace(/_/g, ' ') }); }, u);
    },
    removeZone(i, u) { edit(st => { st.zones.splice(i, 1); }, u); },
    moveZone(i, d, u) { edit(st => { const j = i + d; if (j < 0 || j >= st.zones.length) return; const x = st.zones.splice(i, 1)[0]; st.zones.splice(j, 0, x); }, u); },
    setPrefs(p, u) { edit(st => { ['tone', 'vol', 'snooze'].forEach(k => { if (p[k] != null) st[k] = p[k]; }); }, u); }
  };
  // タイムゾーンの時刻
  function zoneParts(tz, t) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    const o = {}; f.formatToParts(new Date(t)).forEach(p => { o[p.type] = +p.value; });
    return o;
  }
  // そのタイムゾーンの UTC からのずれ（分）
  const zoneOffset = (tz, t) => { const p = zoneParts(tz, t); return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000) / 60000); };
  C.zoneParts = zoneParts; C.zoneOffset = zoneOffset;

  // ---------- hclock.service: アラーム・スヌーズ・タイマーの時刻を見張って鳴らす
  if (OS.init && OS.init.register) OS.init.register({
    name: 'hclock.service', desc: 'アラームとタイマー（hClock）', wantedBy: 'graphical.target', after: 'multi-user.target', restart: 'on-failure',
    start(ctx) {
      let lastMin = Math.floor(Date.now() / 60000) - 1;
      const tick = () => {
        const u = curUser(); if (!u) return;
        const now = Date.now(), st = load(u), fire = [];
        let dirty = false;
        st.timers.forEach(t => {
          if (t.run && t.end <= now) {
            t.run = false; t.done = true; t.left = 0; dirty = true;
            const late = now - t.end > 90000;
            fire.push({ key: 't' + t.id, kind: 'timer', title: 'タイマーが終わりました', body: (t.label || fmtDur(t.dur) + ' のタイマー') + (late ? '（' + new Date(t.end).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' に終わっていました）' : '') });
          }
        });
        st.snoozes = (st.snoozes || []).filter(s => { if (s.at > now) return true; dirty = true; fire.push({ key: 's' + s.id, kind: 'alarm', title: 'アラーム（スヌーズ）', body: s.label, tone: s.tone, snooze: s.snooze }); return false; });
        // 前に見た時刻から今までの「分」を順に見る（タブが裏にあってタイマーが間引かれても取りこぼさない。さかのぼるのは 5 分まで）
        const cur = Math.floor(now / 60000);
        for (let mm = Math.max(lastMin + 1, cur - 5); mm <= cur; mm++) {
          const d = new Date(mm * 60000);
          st.alarms.forEach(a => {
            if (!a.on || a.h !== d.getHours() || a.m !== d.getMinutes() || a.last === mm) return;
            if (a.days && a.days.length && !a.days.includes(d.getDay())) return;
            a.last = mm; if (!a.days || !a.days.length) a.on = false; dirty = true;
            fire.push({ key: 'a' + a.id + ':' + mm, kind: 'alarm', title: 'アラーム ' + fmtHM(a.h, a.m), body: a.label, tone: a.tone, snooze: a.snooze });
          });
        }
        lastMin = cur;
        if (dirty) { try { save(st, u); } catch (e) { ctx.log('保存できませんでした: ' + e.message, 3); } }
        fire.forEach(f => { ctx.log(f.title + (f.body ? '：' + f.body : '')); ring(f); });
      };
      tick();
      ctx.setTimeout(() => { tick(); ctx.setInterval(tick, 1000); }, 1000 - (Date.now() % 1000) + 20);
      return () => stopAll();
    }
  });

  // ---------- アプリ
  OS.registerApp({
    id: 'hclock', name: 'hClock', icon: 'alarm', color: '#1c71d8', desc: 'アラーム・タイマー・ストップウォッチ・世界時計',
    launch(arg) {
      const TABS = [['alarm', 'アラーム'], ['timer', 'タイマー'], ['stopwatch', 'ストップウォッチ'], ['world', '世界時計']];
      const want = arg && (arg.tab || (arg.resume && arg.resume.tab)), ok = TABS.some(t => t[0] === want);
      const ex = OS.htui.wins.find(w => w.app === 'hclock');
      if (ex) { ex.focus(); if (ok && ex.showTab) ex.showTab(want); return ex; }
      const ui = OS.ui;
      const win = OS.htui.open({ title: 'hClock', icon: 'alarm', w: 540, h: 580, app: 'hclock' });
      let tab = ok ? want : 'alarm', upd = null, loop = 0;
      const tabBtns = TABS.map(t => h('button', { class: 'tab', type: 'button', id: 'hk-tab-' + t[0], onclick: () => show(t[0]) }, t[1]));
      const page = h('div', { class: 'hk-page' });
      win.body.append(h('div', { class: 'hk' }, h('div', { class: 'tabs' }, tabBtns), page));
      const err = e => ui.alert(e.message, 'hClock');
      const sw = (checked, fn, label) => h('label', { class: 'hk-sw', title: label }, h('input', { type: 'checkbox', checked: checked, 'aria-label': label, onchange: e => fn(e.target.checked) }), h('span', { class: 'hk-knob' }));

      function show(t) { tab = t; render(); }
      win.showTab = show;
      function render() {
        tabBtns.forEach((b, i) => b.classList.toggle('on', TABS[i][0] === tab));
        page.textContent = ''; page.className = 'hk-page hk-' + tab;
        upd = ({ alarm: pAlarm, timer: pTimer, stopwatch: pStop, world: pWorld })[tab]();
        if (upd) upd();
        schedule();
      }
      // 表示の更新: ストップウォッチが動いているときは細かく、ほかは 0.25 秒ごと
      function schedule() {
        clearInterval(loop);
        const st = load(), fast = tab === 'stopwatch' && st.sw.run;
        loop = setInterval(() => { if (upd && !win.closed) upd(); }, fast ? 40 : 250);
      }

      // ===== アラーム
      function pAlarm() {
        const st = load(), nx = h('div', { class: 'hk-next' });
        page.append(h('div', { class: 'hk-bar' }, nx, h('button', { class: 'btn primary', type: 'button', id: 'hk-add-alarm', onclick: () => alarmDlg(null) }, OS.icon('plus', 16), 'アラームを追加')));
        const list = h('div', { class: 'hk-list' });
        if (!st.alarms.length) list.append(h('p', { class: 'hk-empty' }, 'アラームはありません。「アラームを追加」で、決まった時刻に音と通知でお知らせします。hClock を閉じていても鳴ります。'));
        st.alarms.forEach(a => {
          list.append(h('div', { class: 'hk-al' + (a.on ? '' : ' off'), 'data-id': a.id },
            h('button', { class: 'hk-al-main', type: 'button', title: '編集', onclick: () => alarmDlg(a) },
              h('span', { class: 'hk-al-time' }, fmtHM(a.h, a.m)),
              h('span', { class: 'hk-al-sub' }, (a.label ? a.label + ' ・ ' : '') + describeDays(a.days))),
            sw(a.on, v => { try { C.updateAlarm(a.id, { on: v }); } catch (e) { err(e); } }, 'オン・オフ'),
            h('button', { class: 'tbtn', type: 'button', title: '削除', 'aria-label': '削除', onclick: async () => { if (await ui.confirm(fmtHM(a.h, a.m) + (a.label ? '（' + a.label + '）' : '') + ' のアラームを消しますか？', { ok: '削除', danger: true, title: 'hClock' })) C.removeAlarm(a.id); } }, OS.icon('trash', 16))));
        });
        (st.snoozes || []).forEach(s => list.append(h('div', { class: 'hk-al snz' },
          h('div', { class: 'hk-al-main' }, h('span', { class: 'hk-al-time' }, new Date(s.at).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' })), h('span', { class: 'hk-al-sub' }, 'スヌーズ中' + (s.label ? ' ・ ' + s.label : ''))),
          h('button', { class: 'btn small', type: 'button', onclick: () => edit(x => { x.snoozes = x.snoozes.filter(y => y.id !== s.id); }) }, 'やめる'))));
        page.append(list);
        // 音の設定
        const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round(st.vol * 100), id: 'hk-vol', 'aria-label': '音量', onchange: e => C.setPrefs({ vol: e.target.value / 100 }) });
        const tone = h('select', { class: 'inp', id: 'hk-tone', 'aria-label': '音', onchange: e => C.setPrefs({ tone: e.target.value }) }, Object.keys(TONES).map(k => h('option', { value: k, selected: k === st.tone }, TONES[k])));
        const snz = h('select', { class: 'inp', id: 'hk-snooze', 'aria-label': 'スヌーズ', onchange: e => C.setPrefs({ snooze: +e.target.value }) }, [1, 3, 5, 10, 15, 30].map(n => h('option', { value: n, selected: n === st.snooze }, n + ' 分')));
        page.append(h('div', { class: 'hk-foot' }, h('label', null, '音 ', tone), h('button', { class: 'btn small', type: 'button', onclick: () => preview(tone.value, vol.value / 100) }, OS.icon('play', 14), '試す'),
          h('label', null, '音量 ', vol), h('label', null, 'スヌーズ ', snz)));
        return () => {
          const n = C.next();
          nx.textContent = n ? '次: ' + dayWord(n.at) + ' ' + new Date(n.at).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' }) + '（' + untilText(n.at - Date.now()) + '）' : '鳴る予定のアラームはありません';
        };
      }
      async function alarmDlg(a) {
        const st = load(), now = new Date(), init = a || { h: (now.getHours() + 1) % 24, m: 0, days: [], label: '', tone: null, snooze: null };
        let days = new Set(init.days || []);
        const time = h('input', { class: 'inp hk-time', type: 'time', id: 'hk-time', value: z2(init.h) + ':' + z2(init.m), required: true });
        const dayBtns = [1, 2, 3, 4, 5, 6, 0].map(d => h('button', { class: 'hk-day' + (d === 0 ? ' sun' : d === 6 ? ' sat' : ''), type: 'button', 'data-d': d, 'aria-pressed': 'false', onclick: () => { days.has(d) ? days.delete(d) : days.add(d); paint(); } }, WD[d]));
        const quick = (label, set) => h('button', { class: 'btn small', type: 'button', onclick: () => { days = new Set(set); paint(); } }, label);
        const desc = h('small', { class: 'hk-desc' });
        const paint = () => { dayBtns.forEach(b => { const on = days.has(+b.dataset.d); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); desc.textContent = describeDays([...days]); };
        const label = h('input', { class: 'inp', id: 'hk-label', value: init.label || '', placeholder: '例: 起きる', maxlength: 40 });
        const tone = h('select', { class: 'inp', id: 'hk-atone' }, h('option', { value: '' }, '標準（' + TONES[st.tone] + '）'), Object.keys(TONES).map(k => h('option', { value: k, selected: k === init.tone }, TONES[k])));
        const snz = h('select', { class: 'inp', id: 'hk-asnooze' }, h('option', { value: '' }, '標準（' + st.snooze + ' 分）'), [1, 3, 5, 10, 15, 30].map(n => h('option', { value: n, selected: n === init.snooze }, n + ' 分')));
        const row = (t, ...els) => h('div', { class: 'hk-f' }, h('span', null, t), h('div', { class: 'hk-fv' }, ...els));
        paint();
        const body = h('div', { class: 'hk-form' }, row('時刻', time), row('繰り返し', h('div', { class: 'hk-days' }, dayBtns), h('div', { class: 'hk-quick' }, quick('1 回だけ', []), quick('平日', [1, 2, 3, 4, 5]), quick('土日', [0, 6]), quick('毎日', [0, 1, 2, 3, 4, 5, 6])), desc),
          row('名前', label), row('音', tone, h('button', { class: 'btn small', type: 'button', onclick: () => preview(tone.value || st.tone, st.vol) }, OS.icon('play', 14), '試す')), row('スヌーズ', snz));
        const r = await ui.modal({ title: a ? 'アラームを編集' : 'アラームを追加', width: 420, body: body, onOpen: () => time.focus(),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: a ? '保存' : '追加', primary: true, value: () => {
            const m = /^(\d{1,2}):(\d{2})/.exec(time.value); if (!m) { time.focus(); return ui.KEEP; }
            return { h: +m[1], m: +m[2], days: [...days], label: label.value.trim(), tone: tone.value || null, snooze: snz.value ? +snz.value : null, on: true };
          } }] });
        clearTimeout(previewT); if (!rings.size) soundOff();
        if (!r) return;
        try { if (a) C.updateAlarm(a.id, r); else C.addAlarm(r); const n = nextOf(Object.assign({ on: true }, r)); if (n) ui.toast(fmtHM(r.h, r.m) + ' のアラームは、' + untilText(n - Date.now()) + 'で鳴ります'); } catch (e) { err(e); }
      }

      // ===== タイマー
      function pTimer() {
        const st = load();
        const num = (id, max, ph) => h('input', { class: 'inp hk-num', type: 'number', min: 0, max: max, id: id, placeholder: ph, inputmode: 'numeric' });
        const iH = num('hk-th', 99, '0'), iM = num('hk-tm', 59, '0'), iS = num('hk-ts', 59, '0');
        const iL = h('input', { class: 'inp', id: 'hk-tlabel', placeholder: '名前（例: カップ麺）', maxlength: 40 });
        const start = sec => { try { C.addTimer(sec, iL.value.trim()); iL.value = ''; } catch (e) { err(e); } };
        const PRE = [[60, '1 分'], [180, '3 分'], [300, '5 分'], [600, '10 分'], [900, '15 分'], [1500, '25 分'], [1800, '30 分'], [3600, '1 時間']];
        page.append(h('form', { class: 'hk-tform', onsubmit: e => { e.preventDefault(); start((+iH.value || 0) * 3600 + (+iM.value || 0) * 60 + (+iS.value || 0)); } },
          h('div', { class: 'hk-pre' }, PRE.map(p => h('button', { class: 'btn small', type: 'button', onclick: () => start(p[0]) }, p[1]))),
          h('div', { class: 'hk-custom' }, iH, h('span', null, '時間'), iM, h('span', null, '分'), iS, h('span', null, '秒'), iL,
            h('button', { class: 'btn primary', type: 'submit', id: 'hk-tstart' }, OS.icon('play', 14), '開始'))));
        const list = h('div', { class: 'hk-list hk-timers' }), cards = [];
        if (!st.timers.length) list.append(h('p', { class: 'hk-empty' }, 'タイマーはありません。上のボタンか、時間を入れて「開始」を押してください。いくつでも同時に動かせます。'));
        const R = 34, CIRC = 2 * Math.PI * R;
        st.timers.forEach(t => {
          const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          [['cx', 40], ['cy', 40], ['r', R], ['class', 'hk-arc'], ['stroke-dasharray', CIRC.toFixed(1)]].forEach(x => arc.setAttribute(x[0], x[1]));
          const ring = h('div', { class: 'hk-tring', html: '<svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="' + R + '" class="hk-track"/></svg>' });
          ring.firstChild.append(arc);
          const left = h('span', { class: 'hk-tleft' }), sub = h('span', { class: 'hk-tsub' });
          const card = h('div', { class: 'hk-tm' + (t.done ? ' done' : t.run ? ' run' : ''), 'data-id': t.id }, ring,
            h('div', { class: 'hk-tinfo' }, left, h('b', null, t.label || fmtDur(t.dur) + ' のタイマー'), sub),
            h('div', { class: 'hk-tbtns' },
              h('button', { class: 'btn small' + (t.run ? '' : ' primary'), type: 'button', onclick: () => t.run ? C.pauseTimer(t.id) : C.resumeTimer(t.id) }, t.run ? '一時停止' : t.done ? 'もう一度' : '再開'),
              h('button', { class: 'btn small', type: 'button', disabled: !t.run && !t.done && t.left === t.dur, onclick: () => C.resetTimer(t.id) }, 'リセット'),
              h('button', { class: 'tbtn', type: 'button', title: '削除', 'aria-label': '削除', onclick: () => C.removeTimer(t.id) }, OS.icon('x', 16))));
          list.append(card); cards.push({ t: t, arc: arc, left: left, sub: sub });
        });
        page.append(list);
        return () => cards.forEach(c => {
          const l = timerLeft(c.t);
          c.left.textContent = fmtDur(l);
          c.arc.setAttribute('stroke-dashoffset', (CIRC * (1 - l / c.t.dur)).toFixed(1));
          c.sub.textContent = c.t.done ? '終わりました' : c.t.run ? new Date(c.t.end).toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' }) + ' に終わります' : '一時停止中';
        });
      }

      // ===== ストップウォッチ
      function pStop() {
        const st = load(), s = st.sw;
        const disp = h('div', { class: 'hk-swt', id: 'hk-swt', role: 'timer' }), lapNow = h('div', { class: 'hk-swlap' });
        page.append(disp, lapNow, h('div', { class: 'hk-swbtns' },
          h('button', { class: 'hk-round ' + (s.run || s.acc ? '' : 'dim'), type: 'button', id: 'hk-swlap', disabled: !s.run && !s.acc, onclick: () => { if (s.run) C.swLap(); else C.swReset(); schedule(); } }, s.run || !s.acc ? 'ラップ' : 'リセット'),
          h('button', { class: 'hk-round ' + (s.run ? 'stop' : 'go'), type: 'button', id: 'hk-swgo', onclick: () => { C.swToggle(); } }, s.run ? 'ストップ' : s.acc ? '再開' : 'スタート')));
        const laps = s.laps.map((t, i) => t - (i ? s.laps[i - 1] : 0));
        const best = laps.length > 1 ? Math.min(...laps) : -1, worst = laps.length > 1 ? Math.max(...laps) : -1;
        if (laps.length) page.append(h('div', { class: 'hk-list' }, h('table', { class: 'tbl hk-laps' },
          h('thead', null, h('tr', null, h('th', null, 'ラップ'), h('th', { class: 'num' }, 'タイム'), h('th', { class: 'num' }, '合計'))),
          h('tbody', null, laps.map((d, i) => ({ d: d, i: i })).reverse().map(x => h('tr', { class: x.d === best ? 'best' : x.d === worst ? 'worst' : '' },
            h('td', null, 'ラップ ' + (x.i + 1)), h('td', { class: 'num' }, fmtDur(x.d, true)), h('td', { class: 'num' }, fmtDur(s.laps[x.i], true))))))));
        else page.append(h('p', { class: 'hk-empty' }, s.run ? '「ラップ」で区間のタイムを記録します。' : 'hClock を閉じても、ストップウォッチは動き続けます。'));
        return () => {
          const e = swElapsed(s); disp.textContent = fmtDur(e, true);
          lapNow.textContent = s.laps.length ? 'ラップ ' + (s.laps.length + 1) + '  ' + fmtDur(e - s.laps[s.laps.length - 1], true) : '';
        };
      }

      // ===== 世界時計
      function pWorld() {
        const st = load();
        const face = h('div', { class: 'hk-face', html: '<svg viewBox="0 0 200 200" width="170" height="170"><circle cx="100" cy="100" r="94" class="hk-dial"/>' +
          Array.from({ length: 60 }, (_, i) => { const a = i * 6 * Math.PI / 180, r1 = i % 5 ? 86 : 80; return '<line x1="' + (100 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (100 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (100 + Math.sin(a) * 90).toFixed(1) + '" y2="' + (100 - Math.cos(a) * 90).toFixed(1) + '" class="' + (i % 5 ? 'hk-tk' : 'hk-tk5') + '"/>'; }).join('') +
          [12, 3, 6, 9].map((n, i) => '<text x="' + [100, 168, 100, 32][i] + '" y="' + [36, 106, 176, 106][i] + '" class="hk-num-t">' + n + '</text>').join('') +
          '<line id="hk-hh" x1="100" y1="100" x2="100" y2="52" class="hk-hh"/><line id="hk-mh" x1="100" y1="100" x2="100" y2="30" class="hk-mh"/><line id="hk-sh" x1="100" y1="112" x2="100" y2="24" class="hk-sh"/><circle cx="100" cy="100" r="4" class="hk-pin"/></svg>' });
        const big = h('div', { class: 'hk-wbig' }), date = h('div', { class: 'hk-wdate' });
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'ローカル';
        page.append(h('div', { class: 'hk-whead' }, face, h('div', null, big, date, h('small', { class: 'hk-wtz' }, 'この端末: ' + localTz))));
        page.append(h('div', { class: 'hk-bar' }, h('b', null, '都市'), h('button', { class: 'btn', type: 'button', id: 'hk-add-zone', onclick: zoneDlg }, OS.icon('plus', 16), '都市を追加')));
        const list = h('div', { class: 'hk-list' }), rows = [];
        if (!st.zones.length) list.append(h('p', { class: 'hk-empty' }, '「都市を追加」で、ほかの国や地域の時刻を並べて見られます。'));
        st.zones.forEach((z, i) => {
          const tm = h('span', { class: 'hk-ztime' }), sub = h('span', { class: 'hk-zsub' });
          list.append(h('div', { class: 'hk-zone' },
            h('div', { class: 'hk-zname' }, h('b', null, z.name), sub), tm,
            h('div', { class: 'hk-zbtns' },
              h('button', { class: 'tbtn', type: 'button', title: '上へ', 'aria-label': '上へ', disabled: i === 0, onclick: () => C.moveZone(i, -1) }, OS.icon('up', 14)),
              h('button', { class: 'tbtn', type: 'button', title: '削除', 'aria-label': '削除', onclick: () => C.removeZone(i) }, OS.icon('x', 14)))));
          rows.push({ z: z, tm: tm, sub: sub });
        });
        page.append(list);
        const hh = face.querySelector('#hk-hh'), mh = face.querySelector('#hk-mh'), sh = face.querySelector('#hk-sh');
        return () => {
          const now = new Date(), t = now.getTime(), sec = now.getSeconds() + now.getMilliseconds() / 1000, min = now.getMinutes() + sec / 60;
          hh.setAttribute('transform', 'rotate(' + ((now.getHours() % 12 + min / 60) * 30).toFixed(2) + ' 100 100)');
          mh.setAttribute('transform', 'rotate(' + (min * 6).toFixed(2) + ' 100 100)');
          sh.setAttribute('transform', 'rotate(' + (Math.floor(sec) * 6) + ' 100 100)');
          big.textContent = now.toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
          date.textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
          const myOff = -now.getTimezoneOffset();
          rows.forEach(r => {
            try {
              const p = zoneParts(r.z.tz, t), off = zoneOffset(r.z.tz, t), diff = off - myOff;
              r.tm.textContent = p.hour + ':' + z2(p.minute);
              const local = new Date(now.getFullYear(), now.getMonth(), now.getDate()), there = new Date(p.year, p.month - 1, p.day), dd = Math.round((there - local) / 864e5);
              const dh = Math.trunc(diff / 60), dm = Math.abs(diff % 60);
              r.sub.textContent = (dd === 0 ? '今日' : dd > 0 ? '明日' : '昨日') + '、' + (diff === 0 ? '同じ時刻' : (diff > 0 ? '+' : '−') + Math.abs(dh) + ' 時間' + (dm ? ' ' + dm + ' 分' : '')) + (p.hour >= 6 && p.hour < 18 ? ' ☀' : ' ☾');
            } catch (e) { r.tm.textContent = '--:--'; r.sub.textContent = r.z.tz + ' は使えません'; }
          });
        };
      }
      async function zoneDlg() {
        const sel = h('select', { class: 'inp', id: 'hk-city' }, CITIES.map(g => h('optgroup', { label: g[0] }, g[1].map(c => h('option', { value: c[1] + '|' + c[0] }, c[0])))));
        let all = []; try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { /* 古いブラウザー */ }
        const dl = h('datalist', { id: 'hk-tzlist' }, all.map(z => h('option', { value: z })));
        const tz = h('input', { class: 'inp', id: 'hk-tz', list: 'hk-tzlist', placeholder: '例: Europe/Vienna', spellcheck: 'false' });
        const nm = h('input', { class: 'inp', id: 'hk-tzname', placeholder: '表示する名前（省略可）', maxlength: 30 });
        const e2 = h('p', { class: 'cr-prev bad' });
        const r = await ui.modal({ title: '都市を追加', width: 400, body: h('div', { class: 'hk-form' },
          h('div', { class: 'hk-f' }, h('span', null, '都市'), h('div', { class: 'hk-fv' }, sel)),
          h('small', null, '一覧にないときは、タイムゾーンの名前（IANA）で指定できます:'),
          h('div', { class: 'hk-f' }, h('span', null, 'タイムゾーン'), h('div', { class: 'hk-fv' }, tz, dl)),
          h('div', { class: 'hk-f' }, h('span', null, '名前'), h('div', { class: 'hk-fv' }, nm)), e2),
          buttons: [{ label: 'キャンセル', cancel: true, value: null }, { label: '追加', primary: true, value: () => {
            const v = tz.value.trim() ? [tz.value.trim(), nm.value.trim()] : sel.value.split('|').concat([]).slice(0, 2);
            const name = tz.value.trim() ? v[1] : (nm.value.trim() || v[1]);
            try { new Intl.DateTimeFormat('ja-JP', { timeZone: v[0] }); } catch (e) { e2.textContent = v[0] + ': そのようなタイムゾーンはありません'; return ui.KEEP; }
            return { tz: v[0], name: name };
          } }] });
        if (r) { try { C.addZone(r.tz, r.name); } catch (e) { err(e); } }
      }

      const off = C.on(() => { if (!win.closed) render(); });
      win.onDispose = () => { off(); clearInterval(loop); };
      win.onHibernate = () => ({ tab: tab }); // 中身は ~/.config/hclock.json にあるので、どのタブかだけ
      render();
      return win;
    }
  });
})();
