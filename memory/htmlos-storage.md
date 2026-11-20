---
name: htmlos-storage
description: htmlOS drives since 6.1.0 — HDD2 IndexedDB (system drive, 10GB cap), HDD1 PC folder, HDD0 LocalStorage retired with migration
metadata:
  type: project
  modified: 2026-11-20T04:14:16.164Z
---

htmlOS 6.1.0 (build 57, index_48, commit 3c0724a, 2026-11-20). The user asked for this:
- **HDD2** = IndexedDB db `htmlos-hdd2`, object store `kv`, same keys as before ('f:/path' → node JSON, 'meta', ...). boot.html `HDD2.open()` loads everything into a Map (sync get/set), writes back in batched transactions (`flush()`, `pending()`, `errors`, `onerror`, `stored()`). Flags: `idb: true`.
- **Capacity:** max 10GB (user's request) = `min(10GB, navigator.storage.estimate().quota)`. If a write would go over, `set` throws 'HDD2 の容量が足りません…' (the user asked for an error message). Async QuotaExceeded goes to a kernel notify. `persist()` is requested on install and migration.
- **HDD0** (LocalStorage) can no longer be installed to or booted from. BIOS nvram stays in LocalStorage 'bios'. `boot` is 'hdd2' or 'hdd1'; old 'hdd0' maps to 'hdd2'.
- **Migration:** if `BOOT.lsHasOS()`, `main()` sets `BOOT.offerMigrate` once per page load. htmlOS i (Welcome) then shows a modal plus a banner. `BOOT.migrateHdd0({erase})` copies the keys, verifies them, updates /sys if the media is newer, then sets boot to hdd2.
- **Boot:** `start()` loads HDD2 before `post()`, and `warmBoot` reuses it. If IndexedDB is unavailable, a RAM store is used (`hdd2.failed`), and install is only possible to HDD1.
- **Kernel:** `fs.usage()` for HDD2 returns `{disk:true, idb:true, drive:'HDD2'}`. `OS.storeLabel()` returns 'HDD2（IndexedDB）'.
- **Theme song:** `fetchSong` stores the song locally when `OS.store.disk || OS.store.idb`.
- **Test:** scratchpad `test48.js` (fresh HDD2 install, quota error, migration from index_47).

Related: [[htmlos-structure]], [[htmlos-history-5x]], [[htmlos-release]]
