---
name: htmlos-history-7x
description: htmlOS 7.x (Polaris) implementation notes — cron/screenshot/hDroid, nano/SDK 4/HTUi 4, procfs/devfs and hMicroPy
metadata:
  type: project
---

7.0 (b0d7e95): cron in init.js (`OS.cron`, cron.service, /var/spool/cron/<user>), jsh `crontab`, app src/sys/apps/71-hcron.js. Screenshot = `htui.screenshot()` (DOM→SVG foreignObject→canvas, animations off) to ~/Pictures/Screenshots, Alt+Shift+5 / jsh `screenshot`. hDroid session 'droid' at end of shells.js (.ad-* CSS). Tests: scratchpad test53/53b/53c/53d.
7.1.0 (build 63, index_54): /sys/nano.js (OS.registerCommand nano; in kernel core list after jsh.js) uses tty.screen() which SDK 4 extended (alt/F-keys/click/resize/paste, size(), fixed()). SDK 4 Mars in htui.js: ZONES l3 c3 r3 l23 r23, htui.snapLayouts (hover max btn), htui.snapAssist, prefs.glass/.snapAssist, htui.search (Alt+Space) + htui.searchProviders, shell.deskItems hook in deskMenu. HTUi 4 Bengal = session 'htui' at top of shells.js (.ht4-*, floating dock prefs.dockHide smart/always/off, control center, notification center, widgets prefs.widgets .bw-*); HTUi 3 moved to session id 'htui3'. Tests: Playwright, click "htmlOS を試す" for Live then wait sessionId==='htui' (scratchpad t1/t2/t4/t5).
7.2.0 (build 65, index_56, 2026-11-24): /sys/procfs.js (core list after raid.js) mounts virtual stores via OS.mountStore at /proc and /dev (store get() builds node JSON on read; keys(prefix) returns direct children only; set/del throw EROFS unless node has write). Device nodes carry x:'c'|'b' (ls shows c/b). OS.dev: usb(info) vendor table, attach(port,io)/detach → /dev/ttyACMn|ttyUSBn; udevd.service. jsh sets OS.procSelf + proc.cwd/environ/tty; xxd, head -c. App 81-hmicropy.js (raw REPL; test with scratchpad fakeserial.js + t2/t3).

Related: [[htmlos-structure]], [[htmlos-storage]]
7.2.2 (build 66, index_57, pushed to main a98ab72 on 2026-11-24 via branch claude/project-thread-e1rwyb / PR #1): /sys/fb.js framebuffer (OS.fb, /dev/fb0 32bpp BGRX 640x360, overlay .fb-ov; jsh fbset/fbtest/fbi/fbgrab; /proc/fb via OS.dev.proc; vstore node cache via key()). Transparent cursor where none set (boot.html base rule + splash/poweroff in cursor.js). BOOT.exitFull on poweroff/hibernate (BOOT.offScreen blocks goFull except .pw-btn). OS.sound.left() + deferred hold(); shutdown waits for sound end. User asked to call it 7.2.2 (7.2.1 skipped).
