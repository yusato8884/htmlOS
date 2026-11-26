#!/usr/bin/env python3
"""src/ 以下を1枚の index.html（インストールメディア兼ブートローダ）にまとめる。"""
import pathlib, sys

VERSION = '7.3.1'
# コードネーム: htmlOS は恒星の名前（3.2 = Sirius、4.0 = Vega）。描画エンジン HTUi SDK は惑星の名前（/sys/htui.js の htui.sdk）
CODENAME = 'Polaris'
# ビルド番号: リリースごとに 1 つずつ増やす（3.1.0 = 22、3.2.0 = 23〜24、4.0.0 = 25、4.0.1 = 26、4.1.0 = 27）。
# 3.1・3.2 はこのリポジトリの外で配ったので、コミット数ではなくここに書く
BUILD = '68'
root = pathlib.Path(__file__).parent
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
out = root / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'chars,', len(blocks), 'system files, build', BUILD)
