# Beta release preparation - report

Branch `open_source_works`. Nothing has been pushed, published, released or changed in any live service.

## Validation (run on the final tree)

**Automated, passing**
- `npm run typecheck` (renderer + main/preload/tests): clean.
- `npm test`: 80 tests, 80 pass (shell quoting round-tripped through `/bin/sh`, zip orchestration incl. cancel/failure cleanup, MTP move/replace/serialisation/abort with a fake device, ADB serial scoping and abort via a fake `adb`, MTP worker lifecycle races, loopback range server security, preview contract, version comparison, IPC/persistence/path/URL validation, upload settle registry, device-bound context resolution).
- `npm run build`: passes. `electron-builder --dir` produced a launching `Droidwire.app` (`app.asar` under 1 MB; the packaged app started and logged `packaged=true`).
- `npm --prefix desktop run smoke`: passes offline - first launch opens the connection picker with no sign-up, bridge exposes no removed APIs, IPC rejects traversal/legacy keys, navigation and `window.open` blocked, no outbound connections. With `--allow-update-check` the only host contacted is `api.github.com`.
- Clean-clone check: `node scripts/bootstrap.mjs` in a fresh clone installed, applied the patch, built the MTP addon, and `npm run verify` passed there. A plain `npm ci` in a fresh clone failed before this work.

**Observed locally (no phone)**: the first-run screen renders (connection picker, no registration gate); screenshot taken by the smoke driver.

**Hardware: not tested.** No phone was connected during this work. Nothing about real USB ADB, wireless ADB or MTP behaviour was verified here, including every fix above that touches transfers, MTP move, folder zip and device switching. Use `docs/HARDWARE-CHECKLIST.md`.

**Unverified**: the CI workflow itself (never run on GitHub); the smoke job on a GitHub macOS runner; Intel Macs; the signed/notarized path; wireless QR pairing and MTP after the refactor; ffmpeg thumbnails after the stream-server change; whether Chromium honours `connect-src 'none'` for every renderer path (the smoke test saw no breakage, but only first-run UI was exercised); renderer behaviour of the queue/pause/retry code beyond type checking.

## Remaining release blockers
1. ~~License not chosen~~ - resolved: MIT, `LICENSE` added and propagated.
2. **Bundled `adb` redistribution**: Google's platform-tools binary is under the Android SDK License, which forbids redistribution. Mitigated: release builds omit it (`dist:release`); resolve properly before bundling it again.
3. **luck-node-mtp has no copyright notice** to retain (ISC); obtain upstream's before distributing binaries.
4. **No hardware re-verification** of the changed transfer/MTP/zip/device-switch paths.
5. **Retire the Firebase collection** and decide what to do with collected emails (owner task below).
6. Git history contains the maintainer's author email (`git log --format=%ae` shows one address); git commit emails become public with the history.

## Decisions needed from the owner
1. ~~Project license~~ - decided: MIT.
2. Releases location: the app, site and menu use `ajithonmain/droidwire-releases`; the README clones `ajithonmain/droidwire` and electron-builder's `publish` points at `droidwire`. Choose one repo for releases and update `desktop/src/main/app-info.ts` (and `build.publish`).
3. adb strategy (permission / build from AOSP / do not bundle).
4. Whether background update checks should be on by default (currently on, with a menu toggle).
5. Whether to keep the name "Droidwire" given the "Droid" trademark and Google's "X for Android" naming guidance.
6. Enable GitHub private vulnerability reporting (SECURITY.md assumes it may be enabled and falls back to the site contact form; no email address was invented).
7. Whether to delete or keep `docs/release-prep/` in the public repo.

## Separate owner task: retire the existing Firebase service
Not touched by this work. The old app wrote emails to Firestore collection `beta_signups` in project `droidwire-3c7f0` and read world-readable `messages`, using the project's web API key.
- The web API key (a Firebase client key, present in the source and in git history) is **public client configuration, not a privileged credential**. No privileged credentials (service-account keys, tokens, private keys) were found in tracked files or history; scans were by pattern and nothing sensitive was printed.
- Whether the Firestore rules are secure was **not verified** - comments and memory notes say `beta_signups` is create-only and `messages` world-readable, but only the rules in the Firebase console prove it. Old builds (<= 1.2.1) in the wild will keep trying to POST until the project is changed.
- Suggested steps (owner, in the console): export or delete collected emails per your privacy promise ("removed on request"); then lock Firestore rules to deny all, and/or disable the API key or delete the project; consider publishing a final tombstone `messages` entry before locking; consider rotating/restricting the key.
- The landing page and README no longer promise or describe email collection; the legacy `beta-signup.json` on testers' Macs is documented for self-removal.

## Pre-publication checklist
- [x] Choose a license (MIT); `LICENSE`, package.json, README, site, notices, About text synced
- [ ] Resolve adb redistribution; add luck-node-mtp copyright; run a transitive license scan
- [ ] Run `docs/HARDWARE-CHECKLIST.md` on at least one phone per mode
- [ ] Decide the releases repository and update `app-info.ts` / `build.publish`
- [ ] Review `git log` authorship and history for anything private (author email); consider a fresh-history export if desired (do not rewrite without deciding)
- [ ] Retire Firebase (above)
- [ ] Enable GitHub private vulnerability reporting; confirm `SECURITY.md` wording
- [ ] Push the branch, open a PR, let CI run; fix CI if the macOS runner needs adjustments
- [ ] Mirror `site/` to the `droidwire-site` repo (manual copy; no automation exists) after the site edits
- [ ] Build the release locally (`npm run dist`), test the `.dmg` on a clean user account, publish to the releases repo with notes copied from `CHANGELOG.md`
- [ ] Only then change repository visibility to public
