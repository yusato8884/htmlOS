---
name: htmlos-release
description: Where htmlOS releases go — GitHub repo yusato8884/htmlOS served on GitHub Pages; release there every time (from 2026-11-18)
metadata:
  type: project
  modified: 2026-11-18T03:44:24.934Z
---

User asked (2026-11-18): release every new htmlOS version to the GitHub repo **yusato8884/htmlOS** (GitHub Pages: https://yusato8884.github.io/htmlOS). Also still save index_NN.html in /mnt/project-files.

**Why:** the Pages site is the public place people run htmlOS.
**How to apply:** after building index_NN, attach the repo with add_repo, check which file Pages serves, and publish there. Push method decided 2026-11-18: push directly to main and tag vX.Y.Z (this session cannot create GitHub Release pages; user can make one from the tag). Repo layout: src/sys/** + src/boot.html (placeholders <!--SYSFILES-->, __VERSION__, __BUILD__) built by build.py into index.html, which Pages serves. build.py now has fixed VERSION/CODENAME/BUILD constants (bump BUILD each release). Split index_NN into src/ with a script (blocks joined by \n; boot.html placeholders __VERSION__/__BUILD__/__CODENAME__) and verify `python3 build.py` output is byte-identical. Pushing tags is blocked by this environment's git proxy (main push works); github.io is not reachable from the container. See [[htmlos-structure]], [[htmlos-naming]].
Before each release, run SCANOSS (pip install scanoss==1.54.3; `scanoss-py scan <repo> --all-extensions`); api.osskb.org is allowed in the Default environment since 2026-11-18. 4.0.0 scan: 29 files, 0 matches. README states the scan result.
Split helper: scratchpad split.py (index_NN.html → repo src/ + build.py VERSION/BUILD/CODENAME). Fixes after a release bump the patch version and build (4.0.1 = build 26, index_17 overwritten).

Memory mirror: user asked (2026-11-19) for memory files in the repo at memory/ (commit 5dc61d4). When memory files change, copy them to /home/user/htmlos/memory/ and push with the next commit.
SCANOSS writes bad_request-*.txt dumps into the repo root on failed requests; they are gitignored since 6.2.0 — never commit them.
