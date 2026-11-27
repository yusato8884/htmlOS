#!/usr/bin/env python3
"""htmlOS Nightly（試験版）を作る: src/ を結合して nightly/index.html にする（GitHub Pages の /nightly/ で配る）。

- バージョンは 0.0.0n のように末尾に n を付ける（安定版の 7.x とは別の番号）
- htmlOS Shell（IWA、nightly/iwa/）の中からだけ起動する（URL に ?iwa-shell=1 があるときだけ）。
  普通のタブで開くと、安定版と同じ yusato8884.github.io の保存場所を使ってしまい、安定版の htmlOS を
  Nightly で上書きするおそれがあるため。IWA の Controlled Frame は保存場所（partition）が別なので安全
- 安定版の build.py・index.html には手を入れない
"""
import pathlib, sys

VERSION = '0.0.0n'
CODENAME = 'Nightly'
BUILD = '1'  # Nightly だけの通し番号（安定版のビルド番号とは別）

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
blocks = []
for f in sorted((src / 'sys').rglob('*')):
    if not f.is_file():
        continue
    text = f.read_text(encoding='utf-8')
    if '</script' in text.lower():
        sys.exit(f'{f}: "</script" を含めることはできません')
    vpath = '/sys/' + f.relative_to(src / 'sys').as_posix()
    blocks.append(f'<script type="text/x-htmlos" data-path="{vpath}">\n{text}</script>')
html = (src / 'boot.html').read_text(encoding='utf-8')
html = html.replace('<!--SYSFILES-->', '\n'.join(blocks)).replace('__VERSION__', VERSION).replace('__BUILD__', BUILD).replace('__CODENAME__', CODENAME)

# /nightly/ から見たテーマソングの場所（安定版は media/、Nightly は ../media/）
song = "new URL('media/htmlOS.mp3', location.href)"
if html.count(song) != 1:
    sys.exit('テーマソングの場所が見つかりません（htui.js の songURL を確認）')
html = html.replace(song, "new URL('../media/htmlOS.mp3', location.href)")

# htmlOS Shell の外では起動しない。<plaintext> を書き出すと、そのあとの HTML（ブートローダー）はただの文字として扱われ、実行されない
guard = """<script>
if (!/[?&]iwa-shell=1(&|$)/.test(location.search)) {
  document.write('<div style="position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#fff;color:#241f31;font:15px/1.8 system-ui,sans-serif"><div style="max-width:560px;margin:12vh auto;padding:0 20px">'
    + '<h1 style="font-size:22px">htmlOS Nightly ' + '__V__' + '（試験版）</h1>'
    + '<p>この版は <b>htmlOS Shell</b>（Isolated Web App）の中で動かすためのものです。普通のタブでは起動しません。</p>'
    + '<p>普通のタブで開くと、いつもの htmlOS と同じ保存場所を使ってしまい、いつもの htmlOS を壊すおそれがあるためです。</p>'
    + '<p><a href="../" style="color:#1c71d8">いつもの htmlOS を開く</a></p></div></div><plaintext style="display:none">');
}
</script>
""".replace('__V__', VERSION)
# 最初の <body> がページ本体のもの（あとのものはアプリのコードの中の文字列）
if html.find('<body>') < 0 or html.find('<body>') > html.find('<script type="text/x-htmlos"'):
    sys.exit('<body> が見つかりません')
html = html.replace('<body>', '<body>\n' + guard, 1)
html = html.replace('<title>', '<title>[Nightly] ', 1)

out = root / 'nightly' / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'chars,', len(blocks), 'system files, Nightly', VERSION, 'build', BUILD)
