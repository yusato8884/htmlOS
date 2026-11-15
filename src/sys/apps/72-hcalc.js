/* hCalc — 電卓（10進・16進・2進、ビット演算つき）
   式は JavaScript の書き方です: 0xFF & 0b1010、2 ** 10、(3 + 4) * 5 など */
(function () {
  const OS = window.OS, h = OS.h;
  const KEYS = [
    ['AC', 'ac'], ['⌫', 'bs'], ['(', '('], [')', ')'], ['%', '%'], ['÷', '/'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['A', 'A'], ['B', 'B'], ['×', '*'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['C', 'C'], ['D', 'D'], ['−', '-'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['E', 'E'], ['F', 'F'], ['+', '+'],
    ['0', '0'], ['.', '.'], ['0x', '0x'], ['0b', '0b'], ['xʸ', '**'], ['=', 'eq'],
    ['AND', '&'], ['OR', '|'], ['XOR', '^'], ['NOT', '~'], ['<<', '<<'], ['>>', '>>']
  ];
  const TITLES = { '0x': '16進数の先頭に付ける（例: 0xFF）', '0b': '2進数の先頭に付ける（例: 0b1010）', '**': 'べき乗（2 ** 10 = 1024）', '%': '割った余り', '^': 'ビットごとの排他的論理和', '~': 'ビット反転' };
  function calc(expr) {
    if (!/^[\s0-9a-fA-FxXoO.+\-*\/%&|^~<>()]+$/.test(expr)) throw new Error('使えない文字が入っています');
    const v = new Function('"use strict";return (' + expr + '\n)')();
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('計算できません（0で割った、など）');
    return v;
  }
  OS.registerApp({
    id: 'hcalc', name: 'hCalc', icon: 'calc', color: '#2190a4', desc: '電卓',
    launch() {
      const win = OS.htui.open({ title: 'hCalc', icon: 'calc', w: 330, h: 500, app: 'hcalc' });
      const expr = h('input', { class: 'inp hc-expr', id: 'hc-expr-' + win.pid, spellcheck: 'false', autocomplete: 'off', placeholder: '式を入力', 'aria-label': '式' });
      const res = h('div', { class: 'hc-res', role: 'status' }, '0'), alt = h('dl', { class: 'hc-alt' }), hist = h('div', { class: 'hc-hist' });
      const keys = h('div', { class: 'hc-keys' });
      function show(v) {
        res.classList.remove('err');
        res.textContent = String(parseFloat(v.toPrecision(12)));
        alt.textContent = '';
        if (Number.isInteger(v) && Math.abs(v) <= 0xFFFFFFFF) {
          const u = v < 0 ? v >>> 0 : v;
          alt.append(h('dt', null, 'HEX'), h('dd', null, '0x' + u.toString(16).toUpperCase()),
            h('dt', null, 'BIN'), h('dd', null, '0b' + (u.toString(2).replace(/\B(?=(.{4})+$)/g, ' '))),
            h('dt', null, 'OCT'), h('dd', null, '0o' + u.toString(8)));
        }
      }
      function run() {
        const e = expr.value.trim(); if (!e) return;
        try {
          const v = calc(e); show(v);
          const b = h('button', { type: 'button', title: 'この式をもう一度使う', onclick: () => { expr.value = e; expr.focus(); } }, e + ' = ' + res.textContent);
          hist.prepend(b); while (hist.children.length > 8) hist.lastChild.remove();
        } catch (ex) { res.classList.add('err'); res.textContent = ex instanceof SyntaxError ? '式が正しくありません' : ex.message.includes('not defined') ? '16進数は 0x を付けてください' : ex.message; alt.textContent = ''; }
      }
      function insert(t) {
        const a = expr.selectionStart == null ? expr.value.length : expr.selectionStart, b = expr.selectionEnd == null ? a : expr.selectionEnd;
        expr.setRangeText(t, a, b, 'end'); expr.focus();
      }
      KEYS.forEach(k => keys.append(h('button', { class: 'hc-key' + (k[1] === 'eq' ? ' eq' : /^[0-9A-F.]$/.test(k[1]) ? '' : ' op'), type: 'button', title: TITLES[k[1]] || null, onclick: () => {
        if (k[1] === 'ac') { expr.value = ''; res.textContent = '0'; res.classList.remove('err'); alt.textContent = ''; expr.focus(); }
        else if (k[1] === 'bs') { const a = expr.selectionStart, b = expr.selectionEnd; if (a !== b) expr.setRangeText('', a, b, 'end'); else if (a > 0) expr.setRangeText('', a - 1, a, 'end'); expr.focus(); }
        else if (k[1] === 'eq') run();
        else insert(k[1]);
      } }, k[0])));
      expr.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(); } });
      win.body.append(h('div', { class: 'hc' }, expr, res, alt, keys, hist));
      win.onFocus = () => expr.focus();
      expr.focus();
      return win;
    }
  });
})();
