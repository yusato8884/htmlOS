---
name: htmlos-structure
description: How the user's single-file htmlOS (index_NN.html) is organized and what was added in index_15 (2026-11-17)
metadata:
  type: project
  modified: 2026-11-17T23:40:44.595Z
---

htmlOS is one HTML file (~9200 lines in index_15). Each OS file lives in a `<script type="text/x-htmlos" data-path="/sys/...">` block; the inline bootloader at the end (BIOS/POST/boot menu, `BOOT.*`, `MEDIA_VERSION`/`MEDIA_BUILD`) copies them into a key-value store (`f:<path>` → JSON node `{t,c,m,o,b}`) and evals /sys/kernel.js.
Apps register via `OS.registerApp` in /sys/apps/NN-name.js; jsh commands via `def(...)` in /sys/jsh.js. Comments/UI text are Japanese.

(3.x–4.0 details: see [[htmlos-history-4x]])
index_18 = htmlOS 4.1.0 (build 27, codename still Vega, HTUi SDK 3.0.1): switch fix, hdm pwForm Enter via keydown/keyup + busy guard, hTic-tac-toe /sys/apps/75-htictactoe.js, hReversi 77-hreversi.js. Note: build.py orders sys files by name, so insert new app blocks in sorted order (or take build.py's output as index_NN).

4.1.x–4.2.x details: see [[htmlos-history-4x]].

Test with Playwright over http://localhost (OPFS handle stands in for showDirectoryPicker). See [[htmlos-user-prefs]].

5.x–6.x release details: see [[htmlos-history-5x]].

Wallpapers (6.0.3, index_41, 83243e2): built-ins written to /usr/share/backgrounds/<ver dir e.g. 6.0-Deneb>/<file>.svg on htui.start when /usr/share/backgrounds/.version != OS.version; SVG <title> = display name; prefs.wallpaper = file path (old numeric index still works); Settings groups by folder, newest first (user asked: classify by version, store as files).
Hibernate (6.0.4, index_42, 377c5f9; user: real hibernate = dump RAM, no save prompts): htui.hibernateImage() -> /var/lib/hibernate.json v2 {last, users:{name:{sid,cur,wins}}} incl. parked users; win.onHibernate()/launch({resume}) (Terminal implements), else generic textarea/input/select capture; resume(user) on login consumes that user.
6.0.5 (index_43, 73230f5): onHibernate/resume also in hPaint (canvas PNG), hCalc, hFile, hBrowser, hPlayer, hMines, hTic-tac-toe, hReversi. New apps with non-field state should implement it too.
Audio (6.0.6, index_44, 20fd2bb): OS.sound uses one shared sfx bus per AudioContext (sfxBus), voices disconnected after LEN, MAX_VOICES 8; reverb(c,key) separate for sfx/bgm; watchdog resumes suspended ctx and OS.sound.reset() recreates stalled ctx (max 3/5min); soundd uses OS.sound.hold(). BGM schedules ahead via tick() on audio clock. Never create per-play nodes left connected to destination.
Theme song (6.0.7, ab2024b): media/htmlOS.mp3 in repo (Suno music, lyrics by Claude Sonnet 5.5); installMusic() writes /usr/share/music/htmlOS/{htmlOS.mp3 (bin node whose content is the URL), lyrics.txt, README.txt}; ~/Music/htmlOS symlink once (prefs.musicLinked); hPlayer shows sibling lyrics.
