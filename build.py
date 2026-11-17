#!/usr/bin/env python3
"""src/ 以下を1枚の index.html（インストールメディア兼ブートローダ）にまとめる。"""
import pathlib, sys

VERSION = '2.2.0'
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
html = html.replace('<!--SYSFILES-->', '\n'.join(blocks)).replace('__VERSION__', VERSION)
out = root / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'chars,', len(blocks), 'system files')
