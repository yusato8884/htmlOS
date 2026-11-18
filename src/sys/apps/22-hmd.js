/* hMark — Markdown エディター（id: hmd）
   左にコード（Markdown）、右にプレビュー。表示は「コード」「分割」「プレビュー」から選べる。
   Markdown の変換はこのファイルの中の小さな変換器で行う（外部のライブラリは使わない）。
   安全のため、本文に書いた HTML タグはそのまま文字として表示する。 */
(function () {
  const OS = window.OS, h = OS.h, path = OS.path, ui = OS.ui;

  // ---------- Markdown → HTML
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const slug = t => t.toLowerCase().replace(/<[^>]*>/g, '').replace(/&\w+;/g, '').trim().replace(/[\s]+/g, '-').replace(/[^\w぀-ヿ㐀-鿿ｦ-ﾟ-]/g, '');
  const safeHref = u => /^(https?:|mailto:|#|\/|\.{0,2}\/|[\w%~぀-鿿][^:]*$)/i.test(unesc(u)) ? u : '#';

  function inline(t, ctx) {
    const keep = [];
    const K = html => { keep.push(html); return '\u0002' + (keep.length - 1) + '\u0002'; };
    // コード（`...`）とバックスラッシュでの打ち消しは、ほかの書き方より先に取り出しておく
    t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, b, c) => K('<code>' + esc(c.replace(/^ (.*) $/, '$1')) + '</code>'));
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!~|<>])/g, (m, c) => K(esc(c)));
    t = esc(t);
    t = t.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (m, alt, src, title) => K('<img src="' + esc(ctx.src(unesc(src))) + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + '>'));
    t = t.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (m, txt, href, title) => K('<a href="' + safeHref(href) + '"' + (title ? ' title="' + title + '"' : '') + '>') + txt + K('</a>'));
    t = t.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g, (m, u) => K('<a href="' + u + '">' + u + '</a>'));
    t = t.replace(/(^|[\s(])(https?:\/\/[^\s<\u0002]+[^\s<.,:;!?)\u0002])/g, (m, pre, u) => pre + K('<a href="' + u + '">' + u + '</a>'));
    t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
    t = t.replace(/\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, '<em>$1</em>');
    t = t.replace(/(^|[^\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>');
    t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    t = t.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
    t = t.replace(/(?: {2,}|\\)\n/g, '<br>\n');
    for (let i = 0; i < 3 && /\u0002/.test(t); i++) t = t.replace(/\u0002(\d+)\u0002/g, (m, n) => keep[n]);
    return t;
  }

  const RE = {
    fence: /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/,
    head: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
    hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
    quote: /^ {0,3}> ?/,
    list: /^( *)([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/,
    tsep: /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/,
    code: /^( {4}|\t)/
  };
  const indentOf = l => l.match(/^ */)[0].length;
  const cells = l => { let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map(c => c.trim()); };
  const startsBlock = (l, next) => RE.fence.test(l) || RE.head.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.list.test(l) && !!l.match(RE.list)[4].trim() || (l.includes('|') && next != null && RE.tsep.test(next) && next.includes('-'));

  function blocks(lines, ctx, tight) {
    const out = []; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(RE.fence))) {
        const fence = m[1], lang = m[2], body = []; i++;
        while (i < lines.length && !(lines[i].trim().startsWith(fence[0].repeat(fence.length)) && !lines[i].trim().replace(new RegExp('^\\' + fence[0] + '+'), '').trim())) body.push(lines[i++]);
        i++;
        out.push('<pre><code' + (lang ? ' class="lang-' + esc(lang) + '"' : '') + '>' + esc(body.join('\n')) + '</code></pre>');
        continue;
      }
      if ((m = l.match(RE.head))) {
        const txt = inline(m[2] || '', ctx), id = slug(txt);
        out.push('<h' + m[1].length + (id ? ' id="' + esc(ctx.uid(id)) + '"' : '') + '>' + txt + '</h' + m[1].length + '>'); i++; continue;
      }
      if (RE.hr.test(l)) { out.push('<hr>'); i++; continue; }
      if (RE.code.test(l)) {
        const body = [];
        while (i < lines.length && (RE.code.test(lines[i]) || !lines[i].trim())) body.push(lines[i++].replace(RE.code, ''));
        while (body.length && !body[body.length - 1].trim()) body.pop();
        out.push('<pre><code>' + esc(body.join('\n')) + '</code></pre>'); continue;
      }
      if (RE.quote.test(l)) {
        const body = [];
        while (i < lines.length && lines[i].trim() && (RE.quote.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))) body.push(lines[i++].replace(RE.quote, ''));
        out.push('<blockquote>' + blocks(body, ctx) + '</blockquote>'); continue;
      }
      if ((m = l.match(RE.list)) && m[4].trim()) {
        const ordered = /\d/.test(m[2]), base = m[1].length, items = []; let loose = false, cur = null, ci = 0;
        while (i < lines.length) {
          const x = lines[i], lm = x.match(RE.list);
          if (lm && indentOf(x) <= base + 1 && /\d/.test(lm[2]) === ordered && (lm[4].trim() || cur)) {
            cur = [lm[4]]; ci = lm[1].length + lm[2].length + Math.min(4, lm[3].length || 1); items.push(cur); i++; continue;
          }
          if (!x.trim()) {
            let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && (indentOf(lines[j]) >= ci || (RE.list.test(lines[j]) && indentOf(lines[j]) <= base + 1 && /\d/.test(lines[j].match(RE.list)[2]) === ordered))) {
              if (indentOf(lines[j]) < ci) loose = true; else cur.push('');
              i = j; continue;
            }
            break;
          }
          if (indentOf(x) >= ci) { cur.push(x.slice(ci)); i++; continue; }
          if (!startsBlock(x, lines[i + 1]) && cur[cur.length - 1] !== '') { cur.push(x.trim()); i++; continue; }
          break;
        }
        const start = ordered ? parseInt(m[2], 10) : 1;
        out.push((ordered ? '<ol' + (start !== 1 ? ' start="' + start + '"' : '') + '>' : '<ul>') + items.map(it => {
          let task = null; const tm = it[0].match(/^\[([ xX])\][ \t]+/);
          if (tm) { task = tm[1] !== ' '; it[0] = it[0].slice(tm[0].length); }
          const inner = blocks(it, ctx, !loose && !it.includes(''));
          return '<li' + (task !== null ? ' class="task"' : '') + '>' + (task !== null ? '<input type="checkbox" disabled' + (task ? ' checked' : '') + '> ' : '') + inner + '</li>';
        }).join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      if (l.includes('|') && i + 1 < lines.length && RE.tsep.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = cells(l), al = cells(lines[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
        const td = (tag, c, k) => '<' + tag + (al[k] ? ' style="text-align:' + al[k] + '"' : '') + '>' + inline(c.replace(/\\\|/g, '|'), ctx) + '</' + tag + '>';
        let html = '<table><thead><tr>' + head.map((c, k) => td('th', c, k)).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { const r = cells(lines[i++]); html += '<tr>' + head.map((x, k) => td('td', r[k] || '', k)).join('') + '</tr>'; }
        out.push(html + '</tbody></table>'); continue;
      }
      // 段落（次の行が === / --- なら見出し）
      const para = [l.trim()]; i++;
      let setext = 0;
      while (i < lines.length && lines[i].trim()) {
        if (/^ {0,3}=+\s*$/.test(lines[i])) { setext = 1; i++; break; }
        if (/^ {0,3}-+\s*$/.test(lines[i])) { setext = 2; i++; break; }
        if (startsBlock(lines[i], lines[i + 1])) break;
        para.push(lines[i].replace(/^\s+/, '')); i++;
      }
      const txt = inline(para.join('\n').replace(/[ \t]+$/, ''), ctx);
      if (setext) { const id = slug(txt); out.push('<h' + setext + (id ? ' id="' + esc(ctx.uid(id)) + '"' : '') + '>' + txt + '</h' + setext + '>'); }
      else out.push(tight ? txt : '<p>' + txt + '</p>');
    }
    return out.join('\n');
  }
  // src(パス) は画像の場所を data: URL などに直す関数
  function render(md, src) {
    const ids = {};
    const ctx = { src: src || (u => u), uid: id => { if (!ids[id]) { ids[id] = 1; return id; } return id + '-' + (ids[id]++); } };
    return blocks(String(md).replace(/\r\n?/g, '\n').split('\n'), ctx);
  }
  OS.markdown = render; // ほかのアプリや jsh からも使えるように

  const SAMPLE = [
    '# hMark へようこそ',
    '',
    '左に **Markdown** を書くと、右にすぐ*プレビュー*が出ます。',
    '上のボタンで太字・見出し・リストなどを入れられます（Ctrl+B / Ctrl+I / Ctrl+K も使えます）。',
    '',
    '## できること',
    '',
    '- 見出し・段落・**太字**・*斜体*・~~取り消し線~~・==マーカー==',
    '- リスト（入れ子もできます）',
    '  1. 番号つき',
    '  2. Enter で次の項目が自動で入ります',
    '- [x] チェックリスト',
    '- [ ] 表・引用・コード',
    '',
    '> 引用はこのように表示されます。',
    '',
    '| 書き方 | 意味 |',
    '|:--|:--:|',
    '| `**太字**` | **太字** |',
    '| `[リンク](https://ja.wikipedia.org/)` | [リンク](https://ja.wikipedia.org/) |',
    '',
    '```js',
    'echo("こんにちは、htmlOS");',
    '```',
    '',
    '画像は `![説明](~/Pictures/htmlos.svg)` のように、htmlOS の中のファイルも表示できます。',
    '',
    '![htmlOS](~/Pictures/htmlos.svg)',
    ''
  ].join('\n');

  OS.registerApp({
    id: 'hmd', name: 'hMark', icon: 'markdown', color: '#3a6ea5', desc: 'Markdown エディター（コード＋プレビュー）',
    launch(arg) {
      const fsx = OS.htui.fs, home = OS.users.home(OS.htui.user);
      let file = null, dirty = false, view = 'split', timer = 0;
      const win = OS.htui.open({ title: 'hMark', icon: 'markdown', w: 920, h: 580, app: 'hmd' });
      const ta = h('textarea', { class: 'md-src', spellcheck: 'false', id: 'md-src-' + win.pid, 'aria-label': 'Markdown' });
      const pv = h('article', { class: 'md-view', id: 'md-view-' + win.pid, 'aria-label': 'プレビュー', tabindex: '0' });
      const panes = h('div', { class: 'md-panes split' }, h('div', { class: 'md-pane md-code' }, ta), h('div', { class: 'md-pane md-prev' }, pv));
      const stInfo = h('span', { class: 'grow' }), stPos = h('span'), stCount = h('span');
      const tb = (icon, label, fn, title) => h('button', { class: 'tbtn', type: 'button', title: title || label, 'aria-label': title || label, onclick: fn }, icon ? OS.icon(icon, 16) : null, label);
      const fmt = (label, title, fn, style) => h('button', { class: 'tbtn md-fmt', type: 'button', title: title, 'aria-label': title, style: style || null, onmousedown: e => e.preventDefault(), onclick: () => { fn(); ta.focus(); } }, label);
      const views = { code: 'コード', split: '分割', preview: 'プレビュー' };
      const viewBtns = {};
      const seg = h('span', { class: 'md-seg', role: 'group', 'aria-label': '表示' }, Object.keys(views).map(v => (viewBtns[v] = h('button', { class: 'tbtn', type: 'button', 'aria-pressed': 'false', onclick: () => setView(v) }, views[v]))));
      win.body.append(
        h('div', { class: 'toolbar' }, tb('file', '新規', newDoc), tb('folder', '開く', openDlg), tb('save', '保存', save), tb(null, '別名で保存', saveAs),
          h('span', { class: 'sep' }), tb('html', 'HTML に書き出す', exportHtml, 'プレビューの内容を .html ファイルとして保存'), h('span', { class: 'grow' }), seg),
        h('div', { class: 'toolbar md-fmtbar' },
          fmt('B', '太字（Ctrl+B）', () => wrap('**', '**', '太字'), 'font-weight:700'),
          fmt('I', '斜体（Ctrl+I）', () => wrap('*', '*', '斜体'), 'font-style:italic'),
          fmt('S', '取り消し線', () => wrap('~~', '~~', '取り消し'), 'text-decoration:line-through'),
          fmt('H1', '見出し 1', () => linePrefix('# ', /^#{1,6} /)), fmt('H2', '見出し 2', () => linePrefix('## ', /^#{1,6} /)), fmt('H3', '見出し 3', () => linePrefix('### ', /^#{1,6} /)),
          h('span', { class: 'sep' }),
          fmt('• リスト', '箇条書き', () => linePrefix('- ', /^(?:[-*+]|\d+\.) (?:\[[ xX]\] )?/)), fmt('1. 番号', '番号つきリスト', () => linePrefix(n => (n + 1) + '. ', /^(?:[-*+]|\d+\.) (?:\[[ xX]\] )?/)),
          fmt('☑ チェック', 'チェックリスト', () => linePrefix('- [ ] ', /^(?:[-*+]|\d+\.) (?:\[[ xX]\] )?/)), fmt('❝ 引用', '引用', () => linePrefix('> ', /^> /)),
          h('span', { class: 'sep' }),
          fmt('</> コード', 'コード（行の中は `、複数行はブロック）', code), fmt('🔗 リンク', 'リンク（Ctrl+K）', link), fmt('🖼 画像', 'htmlOS の中の画像を入れる', image),
          fmt('▦ 表', '表を入れる', table), fmt('― 線', '区切り線', () => insertBlock('---'))),
        panes, h('div', { class: 'statusbar' }, stInfo, stCount, stPos));

      // ---- 表示
      function setView(v) {
        view = v; panes.className = 'md-panes ' + v;
        Object.keys(viewBtns).forEach(k => { viewBtns[k].classList.toggle('on', k === v); viewBtns[k].setAttribute('aria-pressed', String(k === v)); });
        if (v !== 'code') update();
        if (v !== 'preview') ta.focus();
      }
      const imgSrc = u => {
        if (/^(https?:|data:)/i.test(u)) return u;
        const p = path.norm(decodeURIComponent(u.replace(/[?#].*$/, '')), file ? path.dir(file) : home + '/Documents', home);
        try { return fsx.dataURL(p); } catch (e) { return ''; }
      };
      function update() {
        clearTimeout(timer); timer = 0;
        if (view === 'code') return;
        const st = pv.scrollTop;
        pv.innerHTML = render(ta.value, imgSrc) || '<p class="md-empty">ここにプレビューが出ます</p>';
        pv.scrollTop = st;
      }
      const later = () => { clearTimeout(timer); timer = setTimeout(update, 120); };
      function refresh() {
        const before = ta.value.slice(0, ta.selectionStart).split('\n');
        stPos.textContent = '行 ' + before.length + '、列 ' + (before[before.length - 1].length + 1);
        stCount.textContent = [...ta.value].length + ' 文字';
        stInfo.textContent = (file || '無題') + (dirty ? ' ・ 未保存' : '');
        win.setTitle((dirty ? '● ' : '') + (file ? path.base(file) : '無題') + ' — hMark');
      }
      const setDirty = d => { dirty = d; refresh(); };

      // ---- スクロールの同期（動かしている側に、もう片方を合わせる）
      let driver = null, driverT = 0;
      const sync = (from, to) => () => {
        if (driver && driver !== from) return;
        driver = from; clearTimeout(driverT); driverT = setTimeout(() => { driver = null; }, 120);
        const max = from.scrollHeight - from.clientHeight, r = max > 0 ? from.scrollTop / max : 0;
        to.scrollTop = r * (to.scrollHeight - to.clientHeight);
      };
      ta.addEventListener('scroll', sync(ta, pv));
      pv.addEventListener('scroll', sync(pv, ta));

      // ---- 書き方を入れる
      function edit(start, end, text, selA, selB) {
        ta.focus(); ta.setSelectionRange(start, end);
        // execCommand を使うと、元に戻す（Ctrl+Z）が効く。使えないブラウザでは setRangeText
        if (!document.execCommand || !document.execCommand('insertText', false, text)) ta.setRangeText(text, start, end, 'end');
        if (selA != null) ta.setSelectionRange(selA, selB == null ? selA : selB);
        setDirty(true); later();
      }
      function wrap(a, b, ph) {
        const s = ta.selectionStart, e = ta.selectionEnd, t = ta.value.slice(s, e);
        if (t && ta.value.slice(s - a.length, s) === a && ta.value.slice(e, e + b.length) === b) { edit(s - a.length, e + b.length, t, s - a.length, e - a.length); return; } // もう一度押すと外す
        const body = t || ph;
        edit(s, e, a + body + b, s + a.length, s + a.length + body.length);
      }
      function lineRange() {
        const v = ta.value, s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        let e = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), ta.selectionStart));
        if (e < 0) e = v.length;
        return [s, e];
      }
      // 選んでいる行の先頭に付ける（全部の行に付いていれば外す）。pre は文字か、行番号から文字を作る関数
      function linePrefix(pre, strip) {
        const [s, e] = lineRange(), ls = ta.value.slice(s, e).split('\n');
        const mk = n => typeof pre === 'function' ? pre(n) : pre;
        const all = ls.every((l, n) => !l.trim() || l.startsWith(mk(n)));
        const res = ls.map((l, n) => { if (!l.trim() && ls.length > 1) return l; const bare = l.replace(strip, ''); return all ? bare : mk(n) + bare; }).join('\n');
        edit(s, e, res, s + res.length);
      }
      function insertBlock(text, selFrom, selLen) {
        const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
        const before = s > 0 && v[s - 1] !== '\n' ? '\n\n' : s > 1 && v[s - 2] !== '\n' ? '\n' : '';
        const after = v[e] === '\n' ? (v[e + 1] === '\n' ? '' : '\n') : '\n\n';
        const at = s + before.length;
        edit(s, e, before + text + after, selFrom != null ? at + selFrom : at + text.length, selFrom != null ? at + selFrom + (selLen || 0) : null);
      }
      function code() {
        const t = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (t.includes('\n') || !t && /^\s*$/.test(ta.value.slice(...lineRange()))) insertBlock('```\n' + (t || 'コード') + '\n```', 4, (t || 'コード').length);
        else wrap('`', '`', 'コード');
      }
      async function link() {
        const s = ta.selectionStart, e = ta.selectionEnd, t = ta.value.slice(s, e) || 'リンクの文字';
        const u = await ui.prompt('リンク先の URL（または htmlOS の中のパス）', 'https://', { title: 'リンクを入れる' });
        if (!u) { ta.focus(); return; }
        edit(s, e, '[' + t + '](' + u.replace(/ /g, '%20') + ')', s + 1, s + 1 + t.length);
      }
      async function image() {
        const p = await ui.pickFile({ mode: 'open', dir: home + '/Pictures', kinds: ['image'], title: '画像を選ぶ' });
        if (!p) { ta.focus(); return; }
        let rel = p;
        if (file && p.startsWith(path.dir(file) + '/')) rel = p.slice(path.dir(file).length + 1);
        else if (p.startsWith(home + '/')) rel = '~' + p.slice(home.length);
        const s = ta.selectionStart, alt = path.base(p).replace(/\.[^.]+$/, '');
        edit(s, ta.selectionEnd, '![' + alt + '](' + rel.replace(/ /g, '%20') + ')', s + 2, s + 2 + alt.length);
      }
      function table() { insertBlock('| 見出し1 | 見出し2 | 見出し3 |\n|---|---|---|\n| セル | セル | セル |\n| セル | セル | セル |', 2, 4); }

      // Enter でリストを続ける。中身のない項目で Enter を押すとリストを終わる
      ta.addEventListener('keydown', e => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const [s, en] = lineRange(), ls = ta.value.slice(s, en).split('\n');
          if (ta.selectionStart === ta.selectionEnd && !e.shiftKey && !/^\s*([-*+]|\d+\.)\s/.test(ls[0])) { edit(ta.selectionStart, ta.selectionEnd, '  '); return; }
          const res = ls.map(l => e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n');
          edit(s, en, res, s, s + res.length); return;
        }
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.shiftKey || e.ctrlKey || e.metaKey) return;
        const v = ta.value, s = ta.selectionStart; if (s !== ta.selectionEnd) return;
        const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
        const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/) || line.match(/^(\s*)(>)(\s?)/);
        if (!m) return;
        e.preventDefault();
        if (line.trim() === m[0].trim()) { edit(ls, s, ''); return; } // 空の項目 → リストを終わる
        let next = m[0];
        if (m[3]) next = m[1] + (Number(m[3]) + 1) + m[4] + m[5];
        else if (m[6]) next = m[1] + m[2] + m[5] + '[ ] ';
        edit(s, s, '\n' + next);
      });
      ta.addEventListener('input', () => { setDirty(true); later(); });
      ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, refresh));
      win.el.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); if (e.shiftKey) saveAs(); else save(); }
        else if (k === 'o') { e.preventDefault(); openDlg(); }
        else if (k === 'b' && e.target === ta) { e.preventDefault(); wrap('**', '**', '太字'); }
        else if (k === 'i' && e.target === ta) { e.preventDefault(); wrap('*', '*', '斜体'); }
        else if (k === 'k' && e.target === ta) { e.preventDefault(); link(); }
      });

      // プレビューのリンク: ページ内（#）はスクロール、http は hBrowser、htmlOS の中のファイルは関連付けられたアプリで開く
      pv.addEventListener('click', async e => {
        const a = e.target.closest('a'); if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) { const t = href.length > 1 && pv.querySelector('[id="' + CSS.escape(decodeURIComponent(href.slice(1))) + '"]'); if (t) pv.scrollTop = t.offsetTop - 8; return; }
        if (/^https?:/i.test(href)) { try { OS.launch('hbrowser', href); } catch (ex) { ui.alert(ex.message); } return; }
        if (/^mailto:/i.test(href)) { ui.toast(href.slice(7)); return; }
        const p = path.norm(decodeURIComponent(href.replace(/[?#].*$/, '')), file ? path.dir(file) : home, home);
        try {
          if (!fsx.exists(p)) throw new Error(p + ': そのようなファイルはありません');
          if (path.ext(p) === 'md') { if (await discardOk()) load(p); }
          else if (fsx.isDir(p)) OS.launch('hfile', p); else OS.openFile(p);
        } catch (ex) { ui.alert(ex.message); }
      });

      // 狭いウィンドウ（スマートフォンなど）では、分割を上下に並べる
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => panes.classList.toggle('narrow', panes.clientWidth < 620)); ro.observe(panes); win.onDispose = () => { ro.disconnect(); clearTimeout(timer); }; }

      // ---- ファイル
      async function discardOk() {
        if (!dirty) return true;
        const r = await ui.modal({ title: '変更を保存しますか?', body: h('p', { class: 'modal-msg' }, (file ? path.base(file) : '無題') + ' への変更が保存されていません。'),
          buttons: [{ label: 'キャンセル', cancel: true, value: 'cancel' }, { label: '保存しない', danger: true, value: 'discard' }, { label: '保存', primary: true, value: 'save' }] });
        if (r === 'save') return save();
        return r === 'discard';
      }
      function load(p) {
        try {
          const s = fsx.stat(p);
          if (s && s.t === 'f' && s.b) throw new Error(path.base(p) + ' はバイナリファイルなので hMark では開けません');
          ta.value = fsx.read(p); file = p; ta.setSelectionRange(0, 0); ta.scrollTop = 0; pv.scrollTop = 0; setDirty(false); update();
        } catch (e) { ui.alert(e.message); }
      }
      async function newDoc() { if (await discardOk()) { ta.value = ''; file = null; setDirty(false); update(); ta.focus(); } }
      async function openDlg() {
        if (!(await discardOk())) return;
        const p = await ui.pickFile({ mode: 'open', dir: file ? path.dir(file) : home + '/Documents', title: 'Markdown を開く' });
        if (p) load(p);
      }
      async function write(p) {
        try { fsx.write(p, ta.value); file = p; setDirty(false); return true; }
        catch (e) {
          if (/許可がありません/.test(e.message) && (await ui.asRoot(p + ' を保存します。'))) {
            try { OS.fs.write(p, ta.value, { owner: 'root' }); file = p; setDirty(false); ui.toast('root として保存しました'); return true; }
            catch (e2) { ui.alert('保存できませんでした。\n' + e2.message); return false; }
          }
          if (!/許可がありません/.test(e.message)) ui.alert('保存できませんでした。\n' + e.message);
          return false;
        }
      }
      async function save() { return file ? write(file) : saveAs(); }
      async function saveAs() {
        const p = await ui.pickFile({ mode: 'save', allowRoot: true, dir: file ? path.dir(file) : home + '/Documents', name: file ? path.base(file) : '無題.md' });
        if (!p) return false;
        if (p !== file && fsx.exists(p) && !(await ui.confirm(path.base(p) + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return false;
        return write(p);
      }
      async function exportHtml() {
        const body = render(ta.value, imgSrc), t = (body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
        const title = t ? t.replace(/<[^>]*>/g, '') : file ? path.base(file).replace(/\.md$/i, '') : '無題';
        const html = '<!DOCTYPE html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(unesc(title)) + '</title>\n<style>' + EXPORT_CSS + '</style></head>\n<body><article class="md-view">\n' + body + '\n</article></body></html>\n';
        const p = await ui.pickFile({ mode: 'save', dir: file ? path.dir(file) : home + '/Documents', name: (file ? path.base(file).replace(/\.md$/i, '') : '無題') + '.html', title: 'HTML に書き出す' });
        if (!p) return;
        if (fsx.exists(p) && !(await ui.confirm(path.base(p) + ' はすでにあります。上書きしますか?', { ok: '上書き', danger: true }))) return;
        try { fsx.write(p, html); ui.toast(path.base(p) + ' に書き出しました（hBrowser で開けます）'); } catch (e) { ui.alert('書き出せませんでした。\n' + e.message); }
      }

      win.onClose = discardOk;
      win.onFocus = () => { if (view !== 'preview') ta.focus(); };
      if (typeof arg === 'string' && arg) {
        if (fsx.exists(arg)) load(arg); else { file = arg; setDirty(false); }
      } else { ta.value = SAMPLE; setDirty(false); }
      setView(OS.uiMode === 'phone' ? 'code' : 'split');
      refresh();
      return win;
    }
  });
  // 書き出す HTML に入れるスタイル（プレビューと同じ見た目）
  const EXPORT_CSS = 'body{margin:0;background:#fff;color:#24262b;font:16px/1.75 system-ui,-apple-system,"Segoe UI","Noto Sans JP","Hiragino Sans",sans-serif}' +
    '.md-view{max-width:46em;margin:0 auto;padding:2em 1.2em}.md-view h1,.md-view h2{border-bottom:1px solid #d8d9de;padding-bottom:.25em}' +
    '.md-view code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f0f1f4;border-radius:4px;padding:.1em .35em;font-size:.9em}' +
    '.md-view pre{background:#1d2027;color:#e4e6eb;padding:12px 14px;border-radius:8px;overflow:auto}.md-view pre code{background:none;padding:0;color:inherit}' +
    '.md-view blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #3a6ea5;background:#f3f6fa;color:#4a4f5a}' +
    '.md-view table{border-collapse:collapse}.md-view th,.md-view td{border:1px solid #d8d9de;padding:5px 10px}.md-view th{background:#f3f4f6}' +
    '.md-view img{max-width:100%}.md-view li.task{list-style:none;margin-left:-1.3em}.md-view mark{background:#fff1a8}.md-view hr{border:0;border-top:2px solid #e3e4e8}a{color:#1c63c4}';
})();
