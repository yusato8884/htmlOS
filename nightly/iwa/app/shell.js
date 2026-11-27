/* htmlOS Shell Nightly 0.0.0n — htmlOS を動かす外枠（Isolated Web App）
   ・1 枚目の Controlled Frame（partition: persist:htmlos-nightly）に htmlOS Nightly（GitHub Pages の /nightly/）を表示する
   ・htmlOS の hBrowser がページを開くと、そのウインドウの位置に 2 枚目以降の Controlled Frame（partition: persist:htmlos-web）を重ねる
   やり取り（htmlOS 側は /sys/iwa.js）
   ・htmlOS → 外枠: 印（\u0001htmlos-iwa:）を付けた console.log。consolemessage イベントで受け取る
   ・外枠 → htmlOS: executeScript で document に「htmlos-iwa」イベントを送る（detail は JSON の文字列）
   IWA では innerHTML などが使えない（Trusted Types）ので、要素は全部 createElement で作る */
'use strict';
const SHELL_VERSION = '0.0.0n';
const DEFAULT_URL = 'https://yusato8884.github.io/htmlOS/nightly/';
const MARK = '\u0001htmlos-iwa:';
const KEY_URL = 'htmlos-shell:url';

const stage = document.getElementById('stage');
const el = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => { if (c != null) e.append(c); });
  return e;
};
const originOf = u => { try { return new URL(u).origin; } catch (e) { return ''; } };
const getUrl = () => { try { return localStorage.getItem(KEY_URL) || DEFAULT_URL; } catch (e) { return DEFAULT_URL; } };
const withShellParam = u => { const x = new URL(u); x.searchParams.set('iwa-shell', '1'); return x.href; };
const firstResult = r => Array.isArray(r) ? r[0] : r;

if (!('HTMLControlledFrameElement' in window)) {
  stage.append(el('div', { class: 'panel' }, el('div', { class: 'card' },
    el('h1', { text: 'Controlled Frame が使えません' }),
    el('p', { text: 'この環境では Controlled Frame（Isolated Web App 専用の機能）が使えないため、htmlOS Shell は動きません。ChromeOS の Chrome で、Isolated Web App として入れてください。' }))));
  throw new Error('Controlled Frame がありません');
}

// ---------- htmlOS（1 枚目）
let osUrl = getUrl(), osCommitted = '', osReady = false;
const os = document.createElement('controlledframe');
os.className = 'os';
os.setAttribute('partition', 'persist:htmlos-nightly');
stage.append(os);

function toOS(msg) {
  const code = 'document.dispatchEvent(new CustomEvent("htmlos-iwa", { detail: ' + JSON.stringify(JSON.stringify(msg)) + ' }));';
  return os.executeScript({ code: code }).catch(e => console.warn('htmlOS に送れませんでした', e));
}
// 印の付いたログは、いま表示している htmlOS（設定した URL と同じ場所）から来たものだけ受け取る
os.addEventListener('consolemessage', e => {
  const m = e.message || (e.detail && e.detail.message) || '';
  if (typeof m !== 'string' || !m.startsWith(MARK)) return;
  if (originOf(osCommitted) !== originOf(osUrl)) return;
  let msg; try { msg = JSON.parse(m.slice(MARK.length)); } catch (x) { return; }
  handle(msg);
});
os.addEventListener('loadcommit', e => {
  if (e.isTopLevel === false) return;
  const before = osCommitted.split('#')[0];
  osCommitted = e.url || os.src || '';
  if (osCommitted.split('#')[0] !== before) { osReady = false; closeAll(); }
});
os.addEventListener('loadabort', e => {
  if (e.isTopLevel === false || e.reason === 'ERR_ABORTED') return;
  showSettings('htmlOS を読み込めませんでした（' + (e.reason || e.code || '不明') + '）。インターネットのつながりと URL を確かめてください。');
});
os.addEventListener('permissionrequest', e => allowSome(e, ['fullscreen', 'download']));
os.addEventListener('dialog', handleDialog);
os.addEventListener('newwindow', e => { // htmlOS の中のリンクで新しいウインドウ: 重ねるページとして開かずに、そのまま捨てる（htmlOS 自身は hBrowser を使う）
  try { if (e.window && e.window.discard) e.window.discard(); } catch (x) { /* 無視 */ }
});

function loadOS() { osReady = false; closeAll(); os.src = withShellParam(osUrl); }

// ---------- 重ねるページ（2 枚目以降）
const views = new Map();
function createView(id) {
  const f = document.createElement('controlledframe');
  f.className = 'view'; f.hidden = true;
  f.setAttribute('partition', 'persist:htmlos-web');
  stage.append(f);
  const v = { id: id, f: f, url: '' };
  const state = s => toOS(Object.assign({ type: 'view.state', id: id }, s));
  f.addEventListener('loadstart', e => { if (e.isTopLevel !== false) state({ loading: true }); });
  f.addEventListener('loadcommit', e => { if (e.isTopLevel === false) return; v.url = e.url || f.src; state({ url: v.url, loading: true }); });
  f.addEventListener('loadstop', async () => {
    const s = { url: v.url || f.src, loading: false, title: '' };
    try { s.title = String(firstResult(await f.executeScript({ code: 'document.title' })) || ''); } catch (e) { /* タイトルなし */ }
    try { s.canBack = await f.canGoBack(); s.canForward = await f.canGoForward(); } catch (e) { /* 無視 */ }
    state(s);
  });
  f.addEventListener('loadabort', e => { if (e.isTopLevel === false || e.reason === 'ERR_ABORTED') return; state({ loading: false, error: e.reason || String(e.code || '不明') }); });
  f.addEventListener('newwindow', e => {
    const url = e.targetUrl;
    try { if (e.window && e.window.discard) e.window.discard(); } catch (x) { /* 無視 */ }
    if (url && /^https?:/i.test(url)) toOS({ type: 'view.newwindow', id: id, url: url });
  });
  f.addEventListener('permissionrequest', e => allowSome(e, ['fullscreen', 'download']));
  f.addEventListener('dialog', handleDialog);
  views.set(id, v);
  return v;
}
function place(v, r) {
  if (!r) return;
  const ok = r.visible && r.w >= 8 && r.h >= 8;
  v.f.hidden = !ok;
  if (!ok) return;
  Object.assign(v.f.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function nav(v, m) {
  if (m.action === 'load') {
    if (!/^https?:\/\//i.test(m.url || '')) return;
    if (v.f.src === m.url) v.f.reload(); else v.f.src = m.url;
  } else if (m.action === 'back') v.f.back();
  else if (m.action === 'forward') v.f.forward();
  else if (m.action === 'reload') v.f.reload();
  else if (m.action === 'stop') v.f.stop();
}
function closeView(id) { const v = views.get(id); if (!v) return; v.f.remove(); views.delete(id); }
function closeAll() { [...views.keys()].forEach(closeView); }

// ---------- htmlOS から届いたもの
async function handle(m) {
  switch (m.type) {
    case 'ready':
      osReady = true;
      toOS({ type: 'hello', shell: 'htmlOS Shell', version: SHELL_VERSION, features: ['view'] });
      break;
    case 'view.open': case 'view.nav': {
      const v = views.get(m.id) || createView(m.id);
      if (m.rect) place(v, m.rect);
      nav(v, m);
      break;
    }
    case 'view.update': { const v = views.get(m.id); if (v) place(v, m.rect); break; }
    case 'view.close': closeView(m.id); break;
    case 'view.closeAll': closeAll(); break;
    case 'view.html': {
      const v = views.get(m.id);
      try {
        if (!v) throw new Error('ページがありません');
        const html = firstResult(await v.f.executeScript({ code: '"<!DOCTYPE html>\\n" + document.documentElement.outerHTML' }));
        toOS({ type: 'result', req: m.req, value: String(html || '') });
      } catch (e) { toOS({ type: 'result', req: m.req, error: e.message }); }
      break;
    }
    case 'shell.settings': showSettings(''); break;
  }
}

// ---------- 許可とダイアログ
function allowSome(e, ok) {
  try { const r = e.request; if (ok.includes(e.permission)) r.allow(); else r.deny(); } catch (x) { /* 無視 */ }
}
function handleDialog(e) {
  const d = e.dialog, t = e.messageType, msg = e.messageText || '';
  try {
    if (t === 'alert') { alert(msg); d.ok(); }
    else if (t === 'confirm') { if (confirm(msg)) d.ok(); else d.cancel(); }
    else if (t === 'prompt') { const r = prompt(msg, e.defaultPromptText || ''); if (r == null) d.cancel(); else d.ok(r); }
  } catch (x) { /* 無視 */ }
}

// ---------- 設定（htmlOS の URL）
const input = el('input', { type: 'url', spellcheck: 'false', 'aria-label': 'htmlOS の URL' });
const msgBox = el('p', { class: 'msg' });
const panel = el('div', { class: 'panel', hidden: true }, el('div', { class: 'card', role: 'dialog', 'aria-label': 'htmlOS Shell の設定' },
  el('h1', { text: 'htmlOS Shell Nightly' }),
  el('p', { class: 'ver', text: 'バージョン ' + SHELL_VERSION + '（試験版）' }),
  msgBox,
  el('label', { text: '開く htmlOS の URL' }), input,
  el('small', { text: 'ふだんは ' + DEFAULT_URL + ' のままで使います。自分の PC で動かしている htmlOS を試すときは http://localhost:8000/nightly/ などにします。' }),
  el('div', { class: 'btns' },
    el('button', { type: 'button', text: '既定に戻す', onclick: () => { input.value = DEFAULT_URL; } }),
    el('button', { type: 'button', text: '閉じる', onclick: () => { panel.hidden = true; } }),
    el('button', { type: 'button', class: 'primary', text: '保存して読み込み直す', onclick: () => {
      let u = input.value.trim() || DEFAULT_URL;
      try { u = new URL(u).href; } catch (e) { msgBox.textContent = 'URL の形が正しくありません'; return; }
      try { localStorage.setItem(KEY_URL, u); } catch (e) { /* 保存できなくても今回は使う */ }
      osUrl = u; panel.hidden = true; loadOS();
    } }))));
document.body.append(panel);
function showSettings(message) { msgBox.textContent = message || ''; input.value = osUrl; panel.hidden = false; input.focus(); }

// htmlOS から返事がないとき（URL が違う・Nightly でない htmlOS など）は設定を出す
setTimeout(() => { if (!osReady && panel.hidden) showSettings('htmlOS から返事がありません。htmlOS Nightly（/nightly/）の URL になっているか確かめてください。'); }, 25000);

loadOS();
