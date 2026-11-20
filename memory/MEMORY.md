# htmlOS
- Project name: htmlOS. Single-file browser OS (index_NN.html in /mnt/project-files). Latest: 6.1.0 build 57 (index_48). Storage since 6.1: HDD2 IndexedDB (10GB cap), HDD0 LocalStorage retired → [[htmlos-storage]].
- Repo: github.com/yusato8884/htmlOS (GitHub Pages: yusato8884.github.io/htmlOS). User wants every release pushed there. Repo layout: src/ files merged by build.py into index.html served by Pages.
- Release method (user chose, 4.0): push directly to main and add a vX.Y.Z tag. GitHub Release pages can't be created from here; user can create from the tag.
- User writes in Japanese; reply politely in Japanese (no casual speech).
- Naming: htmlOS codenames = star names (3.2 Sirius, 4.0 Vega, 5.0 Altair, 6.0 Deneb). Rendering engine = HTUi SDK, codenames = planet names (SDK 2 Jupiter, 3.0 Venus). Desktop environment "HTUi" (separate from SDK) codenames = cat breeds (HTUi 2 MaineCoon in 5.2, HTUi 3 Ragdoll in 6.0).
- HTUi 2: Dock replaces taskbar (left default / bottom / right), top panel kept; other environments unchanged; pin/unpin icons in all environments (user confirmed). HTUi 3: app menu at panel left, Launchpad-style all apps, calendar, user switching; virtual desktops in all environments.
- Philosophy (user): browser is just the "spinal cord" providing KVM+storage; pack everything an OS has into htmlOS itself. 5.0 = init/service manager (systemctl), processes (ps/kill), logging (hjournal). 5.1 = permissions/sudo/IPC (done). 5.3 = power management. Later candidates: cron, device mgmt, Web Worker processes, /proc /dev.
- hBrowser proxies: allorigins (520), corsproxy.io (API key required), codetabs (522) were down as of 2026-11-19. Proxy order decided at boot by proxyrank.service (user asked for a boot-time service).
