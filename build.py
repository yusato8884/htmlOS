#!/usr/bin/env python3
"""src/ 以下を1枚の index.html（インストールメディア兼ブートローダ）にまとめる。"""
import pathlib, subprocess, sys

VERSION = '3.0.2'
root = pathlib.Path(__file__).parent
# ビルド番号: このリポジトリのコミット数 + 1（次のコミットに入る番号）
try:
    BUILD = str(int(subprocess.run(['git', 'rev-list', '--count', 'HEAD'], cwd=root, capture_output=True, text=True, check=True).stdout.strip()) + 1)
except Exception:
    BUILD = '0'
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
html = html.replace('<!--SYSFILES-->', '\n'.join(blocks)).replace('__VERSION__', VERSION).replace('__BUILD__', BUILD)
out = root / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html), 'chars,', len(blocks), 'system files, build', BUILD)
