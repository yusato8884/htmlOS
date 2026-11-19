---
name: htmlos-history-4x
description: htmlOS 4.1.1–4.2.1 decisions (touch, no pointer lock, warm reboot, HDD1, sound effects)
metadata:
  type: project
---

index_19 = 4.1.1 (touch bypass of virtual cursor; autoMode = touch when primary pointer coarse, re-evaluated on matchMedia change/resize). index_20 = 4.1.2 (build 29): user decided (2026-11-18) to REMOVE Pointer Lock and the virtual cursor entirely — custom cursors only via CSS `cursor`, right-click via native `contextmenu`; Keyboard Lock (fullscreen on mouse click) stays. Don't reintroduce pointer lock. index_21 = 4.1.3 (build 30): touch mode → fullscreen on touch (pointerup, `BOOT.goFull`); user wants NO htmlOS-side keyboard-lock notices (kbNotice removed). index_22 = 4.1.4 (build 31): reboot/power-on/BIOS F10 use `BOOT.warmBoot()` (no page reload, keeps fullscreen): bootloader tracks listeners on window/document/non-Node targets + observers after first boot(), sweeps timers/rAF, restores body/head children & attrs, reruns post(). Never reintroduce location.reload for reboot. Cursor vars also on :root (:has per DE). 4.1.5 (index_23, build 32): warmBoot resets store=realStore=lsStore, hddReady=false so HDD1 is re-opened exactly like a page load. 4.2.0 (index_24, build 33): OS.sound in kernel.js (Web Audio synth, AudioContext kept on BOOT.audio across warm boots; prefs: /etc/config.json sound + per-user htui prefs.sound), Settings page 'sound', jsh sound/bell. 4.2.1 (index_25, build 34): user wanted more 重厚感 but not too heavy → added sub-octave triangle, detuned layer, short convolver reverb; levels checked via OfflineAudioContext (test22.js).

See [[htmlos-structure]].

## 3.x–4.0 (moved from htmlos-structure)
index_15 (v3.1.0 build 22, saved at /mnt/project-files/index_15.html) added:
- hMark Markdown editor (/sys/apps/22-hmd.js, `OS.markdown`), .md opens there.
- hMines game (/sys/apps/73-hmines.js).
- HDD1 = File System Access API folder: driver `BOOT.hdd` in bootloader; kernel `OS.hdd` mounts at /mnt/hdd1 via a routing store; installer can install to HDD1; BIOS Boot Device hdd0/hdd1 kept in LocalStorage `htmlos:bios`; handle in IndexedDB `htmlos/handles/hdd1`. Permission must be re-granted after reload (button on boot screen / hFile / `mount hdd1`).
- jsh: pipes already existed in v14; v15 added grep -i/-v/-n/-c, cat stdin, sed, xargs, `<` input, `&& || ;` chaining, mount/umount.

index_16 (3.2 Sirius) added: HDD1 disk quota (.htmlos.json `q`, set in installer and htmlOS i 回復), update dialog in htmlOS i when media build > installed build (skip per build via key `skipupdate`), child windows in htui.open (`parent`, `dialog`) and ui.modal opens as a child of the owning window. See [[htmlos-naming]].

index_17 = htmlOS 4.0 Vega (build 25; also in GitHub repo as src/ + index.html) added: HTUi SDK 3.0 Venus (custom form-control/scrollbar CSS at end of style.css, `OS.htui.WebView` used by hBrowser, caption buttons `htui.open({buttons})`/`win.addButton`, class `.win-cbtn`), 6 wallpapers, jsh .jsh scripts (`runScript`, `$1 $@ $# $? $(..)`, `cmd()`, `source`, ~/bin lookup), `OS.registerCommand` (pkg can register commands/sessions), HTUi Studio /sys/apps/24-hstudio.js (`OS.studio`, CLI `hstudio`, projects in ~/Projects, CSS prefix hx-).

