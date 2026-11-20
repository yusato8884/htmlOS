---
name: htmlos-naming
description: htmlOS version codename rules (stars for htmlOS, planets for HTUi SDK) and current names as of index_16
metadata:
  type: project
  modified: 2026-11-18T02:56:08.259Z
---

User's naming rules (2026-11-18):
- htmlOS codenames are star names. 3.x series; index_16 = htmlOS 3.2 Sirius (MEDIA_VERSION 3.2.0, build 23, MEDIA_CODENAME in bootloader, saved in meta.codename).
- The rendering engine (/sys/htui.js) is called "HTUi SDK"; its codenames are planet names. index_16 = HTUi SDK 2 (Jupiter) (`OS.htui.sdk`).

- index_17 = htmlOS 4.0 Vega (MEDIA_VERSION 4.0.0, build 25), HTUi SDK 3.0 (Venus).

**How to apply:** when bumping a version, ask or pick the next star/planet name and update MEDIA_CODENAME / htui.sdk. See [[htmlos-structure]].

- htmlOS 5.0 = Altair (user chose 2026-11-18). 5.0 adds hinit (PID 1, services/hctl), OS.proc (ps/kill), OS.journal (hjournal).
- The standard desktop environment "HTUi" (session id 'htui', not the SDK) has its own version line with cat-breed codenames: HTUi 2 = MaineCoon (htmlOS 5.2, user confirmed 2026-11-19). HTUi 2 replaces the panel taskbar with a Dock (left default / bottom / right); other DEs keep their bars.
- htmlOS 6.0 = Deneb, HTUi 3 = Ragdoll (user chose 2026-11-19, index_38).
- htmlOS 7.0 = Polaris (user chose 2026-11-20); 7.0 constellation wallpaper = Ursa Minor/Polaris. Android-like DE "hDroid（Android 風）" (session id droid, shells.js, released in 7.0.0).
