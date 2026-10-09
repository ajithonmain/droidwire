# Release candidate 1.4.0 - report

> **Read section 13 first.** Sections 1-12 were written while the build still shipped the MTP addon and libmtp. 1.4.0 now ships **without MTP** (USB/ADB and Wi-Fi only); section 13 states what is distributed, the final artifact hashes and the remaining blockers. Where the sections disagree, section 13 wins.

Nothing here was pushed, published or released, and no live service was changed. The version in the working tree is 1.4.0; the published release is still v1.3.0.

## Baseline claims, re-checked before relying on them

| Claim | Finding |
|---|---|
| Public repo, 1.3.0, MIT, arm64 .dmg/.zip, unsigned | True. |
| "MTP libraries already bundled" | Bundled, **but wrong**: the Homebrew libmtp/libusb in v1.3.0 were built for **macOS 26** (`minos 26.0`) while the app claimed macOS 12. On macOS 12-25 the MTP component may not load. Fixed here by compiling them for 12.0. |
| ADB omitted | True (v1.3.0 bundled none). Now bundled. |
| Typecheck, tests, build, smoke, clean-clone verify passed | They passed locally. **Remote CI was red**: run 37590682973 on `main` failed in `npm ci` (node-gyp 9.4.1 needs Python `distutils`, absent from Python 3.12+ on the runner). Fixed locally (node-gyp 12); **not yet confirmed on GitHub** because nothing was pushed. |
| Hardware verification outstanding | True; still outstanding. |

## 1. What is now bundled (and what is not)

Inventory of every external executable/library the app uses:

| Item | Before | Now |
|---|---|---|
| `adb` | not shipped; needed Homebrew/SDK | **shipped**, built from AOSP source (Apache-2.0), arm64, minos 12.0 |
| libusb, libmtp | shipped, built for macOS 26 | shipped, built from pinned source for macOS 12.0 |
| MTP addon + worker | shipped; N-API (ABI-stable across Node/Electron) | rebuilt against our libmtp, patch applied and verified in the binary, loaded from Resources only |
| Video thumbnails | needed Homebrew ffmpeg | **native** AVFoundation helper `droidwire-thumb` (new, MIT, arm64, minos 12.0); ffmpeg is an optional user-installed fallback only (not bundled) |
| macOS system tools: `sips` (HEIC/TIFF), `qlmanage` (PDF), `zip` (folder archives), `killall` (ptpcamerad) | system | unchanged; all are in macOS itself (`/usr/bin`), checked by the smoke test |
| Electron LICENSE, Chromium notices | not shipped (a licensing gap) | shipped |

**Users need no separate desktop software.** The only desktop step left is Gatekeeper's, because the build is unsigned (see section 5).

## 2. ADB distribution - decision and provenance

- Google's prebuilt platform-tools are under the Android SDK License; section 3.4 forbids redistributing the SDK or any part of it (developer.android.com/studio/terms, quoted verbatim in `docs/LICENSING.md`). Not bundled.
- AOSP's adb source is Apache-2.0 (source.android.com/docs/setup/about/licenses). **Chosen route: build from AOSP source** via the Apache-2.0 android-tools CMake build, tarball `37.0.0` (SHA-256 `2725d09f...46be0e`, matches GitHub's published digest), with every dependency (zstd, LZ4, Brotli, PCRE2, Abseil, Protobuf, libusb, libmtp, googletest header) pinned by URL and SHA-256 in `native/versions.env`. The build refuses on any checksum mismatch.
- No permission or restrictive terms were accepted on the owner's behalf. Other apps bundling adb was not treated as evidence of permission.
- The built binary reports `Android Debug Bridge version 1.0.41 / Version 37.0.0-android-tools`; arm64; deployment target 12.0; dynamic deps: system libs plus libusb only (rewritten to `@loader_path`); no build-machine paths (`-ffile-prefix-map`); statically contains BoringSSL, {fmt}, zstd, LZ4, Brotli, PCRE2, Abseil, Protobuf, whose licenses ship in `THIRD-PARTY-LICENSES.txt`.
- Reproducibility: a **fresh clone** rebuilt the whole toolchain from the pinned downloads (about 20 min), passed `native/verify.sh`, and produced an adb of identical size that runs. The binaries are **not bit-for-bit identical** between the two builds (embedded UUIDs/paths/signatures), i.e. functionally reproducible, not byte-reproducible.
- Discovery: the app prefers the bundled adb (order: `DROIDWIRE_ADB` override, bundled, SDK, Homebrew, PATH). The packaged-app smoke test launches with `PATH=/usr/bin:/bin:/usr/sbin:/sbin` and asserts adb resolves to `Contents/Resources/adb`, runs, and reports its version. (A Homebrew adb happens to exist on this Mac; the test proves the bundled one is the one chosen, not that no other exists.)
- Residual: this adb has not talked to a real phone. It is the same upstream code as Google's, but that is an inference, not a test.

## 3. Video previews

Native macOS AVFoundation covers H.264/HEVC in MP4/MOV/3GP, reading over the same loopback range-request path (verified with a moov-at-end file and range logging in `test/thumb-helper.test.ts`). It cannot decode WebM, MKV or AVI (verified: exit 3 and a clear message), which fall back to an installed ffmpeg if present, otherwise a generic icon. Documented in the README, site and CHANGELOG. No ffmpeg is bundled, so there is no GPL/LGPL ffmpeg obligation.

## 4. Installation flow

- DMG: Droidwire.app + Applications link + branded background (verified by mounting).
- No installer, no dependency prompts, no sign-up; first launch goes to the connection picker.
- In-app guidance per mode (USB debugging, Wireless debugging pairing, MTP File transfer), a specific message for a phone that is *unauthorized* or *offline*, and an explicit error when the bundled adb or MTP component cannot start (MTP is greyed out with the reason). Verified in the UI with fake adb states in the packaged-app smoke test.
- Unavoidable phone-side steps stay on the phone (USB debugging + Allow; Wireless debugging pairing; File transfer). The app explains them; it cannot skip them.

## 5. Signing and notarization

Studied Apple's "Notarizing macOS software before distribution": Developer ID Application certificate, hardened runtime, secure timestamp, `notarytool`, stapling. Implemented and documented (`docs/RELEASING.md`): hardened-runtime entitlements (`desktop/build/entitlements.mac.plist`; library validation intentionally left on, since every Mach-O is signed with the same identity), `scripts/dist.mjs` (decides and *prints* the signing mode from the environment, passes credentials only through env vars, `--require-signed` gate), `check-package.mjs --require-signed`, and `.github/workflows/release-build.yml` (secrets-driven, draft release only).

**Not executed:** no Developer ID identity or Apple credentials exist on this machine (`security find-identity` found none), so signing, notarization, stapling and the hardened-runtime behaviour of the MTP worker were **not exercised**. The shipped candidate is **unsigned** (ad-hoc sealed so macOS will run it); Gatekeeper still blocks a downloaded copy until the quarantine flag is cleared, and Droidwire never clears it. This is stated in the README, site and release notes.

Owner actions: obtain a Developer ID Application certificate + App Store Connect API key (or app-specific password), provide them as env vars / repository secrets, run `npm --prefix desktop run dist -- --require-signed`, expect to iterate once on credentials.

## 6. Packaging hardening

`scripts/check-package.mjs` runs after every `dist` and fails on: missing required resources (adb, libusb, libmtp, addon, worker, thumbnail helper, notices, license texts, Electron/Chromium notices, asar); any Mach-O not arm64 or requiring macOS > 12.0 (21 files checked); staged binaries depending on non-system libraries that are not present, or embedding `/Users/`, `/opt/homebrew`, `/private/tmp`; an unpatched addon; native code or unexpected folders in `app.asar` (now 811 KB); `LSMinimumSystemVersion` != 12.0; invalid signatures. It caught three real problems during this work (build-machine paths in the addon's symbol table, an invalid bundle seal after repackaging, and missing Electron/Chromium notices). Large tools live in `Contents/Resources`, not in the asar. Intel: not built, not tested, not advertised.

| Artifact | Size | v1.3.0 | Change |
|---|---|---|---|
| `Droidwire-1.4.0-arm64.dmg` (early candidate, superseded: see section 13) | 118.3 MB | 114.4 MB | +3.9 MB |
| `Droidwire-1.4.0-arm64-mac.zip` (early candidate, superseded) | 113.7 MB | 110.0 MB | +3.7 MB |

Where the growth comes from: adb 7.1 MB uncompressed, Chromium's required notices file 20 MB uncompressed (it compresses well), everything else under 1 MB. Artifacts: `desktop/release/Droidwire-1.4.0-arm64.dmg` and `...-mac.zip` (arm64, version 1.4.0).

## 7. Licensing

Added: luck-node-mtp attribution (upstream publishes **no license file**, only `"license": "ISC"` and author "lucksoft"; the notice credits "Copyright (c) lucksoft" with no year and says so - residual risk and a drafted, **unposted** upstream request are in `docs/LICENSING.md` and `docs/release-prep/upstream-luck-node-mtp-issue.md`); Electron/Chromium notices; Apache-2.0 and static-dependency notices for adb; LGPL replaceability and source offers for libusb/libmtp; generated `THIRD-PARTY-LICENSES.txt` and `docs/third-party-inventory.md` for the exact artifacts. Full dependency scan with pinned `license-checker-rseidelsohn` 5.0.1: 600 packages, nothing incompatible and nothing unusual in the shipped set; the odd licenses (CC-BY, WTFPL, public-domain) are development tooling only. MIT for Droidwire is unchanged and not implied for the bundled components.

## 8. Validation

**Automated, passing (this tree):** typecheck clean; 105 of 105 unit tests, 0 skipped (adds renderer queue tests, setup-guidance tests, real AVFoundation helper tests); production build; `check-package` on the produced app; native `verify.sh`; license inventory generation.

**Clean-clone:** a fresh clone installed with a Python that lacks `distutils` (the CI failure mode), built the MTP addon, ran `verify` (105/105), and rebuilt the entire native toolchain from pinned sources.

**Packaged app, minimal environment** (`node desktop/driver.mjs --app ...`, `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, throwaway profile, offline): main window and menu bar window launch; bundled adb starts and reports 1.0.41 (source `bundled`); the MTP worker loads the addon *from Resources* with its bundled libusb/libmtp (a real dlopen, not a file-exists check); the thumbnail helper makes a poster frame; first launch needs no email/account; zero outbound connections (recorded); no registration file; the Licenses dialog lists the bundled components; "phone not authorized" and "adb cannot start" produce actionable messages.

**Not green yet:** remote CI (last run failed; fix not pushed).

**Unverified / not possible here:** everything that needs a phone (below); GitHub Actions workflows `ci.yml` and `release-build.yml` (YAML parses; never run); signing/notarization; hardened-runtime behaviour; Intel; macOS 12-25 runtime (built for 12.0 and statically verified, but only macOS 26 was available to run on); bit-for-bit reproducibility.

## 9. Hardware verification

Superseded by the real-phone run recorded in section 11 (2026-10-07, one Pixel 4a, USB/ADB only). The earlier statement "no phone was available" no longer holds for USB/ADB; it still holds for MTP, wireless ADB, multi-phone use and physical unplug/replug.

## 10. Distribution messaging and owner handoffs

- README, CONTRIBUTING, `docs/LICENSING.md`, `docs/RELEASING.md`, `native/README.md`, CHANGELOG (1.4.0, unreleased) and `site/index.html` match the final bundle: no separate-install instructions; Apple Silicon + macOS 12+; unsigned status; phone-side steps; verified-device coverage (Pixel 10 Pro / Pixel 4a from earlier builds, none for this build); limitations; update-check network use.
- Prepared, **not published**: `docs/release-prep/announcement-droidwire-releases.md` (final notice for the old repo); `docs/release-prep/site-mirror.patch` (staged in a local clone of `droidwire-site` outside this repo, one commit, not pushed; apply with `git am`); `docs/release-prep/firebase-retirement-plan.md`.
- Naming ("Droidwire" contains "Droid"): flagged for the owner in `docs/LICENSING.md`; no legal conclusion is drawn.
- `docs/release-prep/`: keep `REPORT.md`, `firebase-retirement-plan.md`, `announcement-droidwire-releases.md`, `upstream-luck-node-mtp-issue.md`, `site-mirror.patch` until acted on; `BASELINE.md` is historical and disposable. Branches `open_source_works` and the two `worktree-agent-*` have **zero commits that are not in `main`**: safe for the owner to delete (`open_source_works` also exists on GitHub). Nothing was deleted.

## Remaining owner actions
1. Push, let CI run, and confirm the node-gyp fix on GitHub (run 37590682973 was red).
2. Run `docs/HARDWARE-CHECKLIST.md` on at least one phone per mode with the `.dmg`.
3. Provide Apple Developer ID credentials to sign and notarize, or ship unsigned with the documented step.
4. Publish 1.4.0 (`docs/RELEASING.md`) and mark **v1.3.0 as superseded** (its MTP libraries require macOS 26 and it has no adb). Post the old-repo announcement; apply the site patch.
5. Firebase retirement (plan above). 6. Decide on the upstream luck-node-mtp request. 7. Naming review. 8. Delete disposable branches/docs if desired.

## 11. Real-hardware validation (2026-10-07 to 2026-10-09)

**Device and build.** Google Pixel 4a, Android 13; Apple Silicon Mac, macOS 26.6.2. App 1.4.0 run from the unpacked `desktop/release/mac-arm64/Droidwire.app` with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, a throwaway profile, offline. Diagnostics reported the bundled adb 1.0.41 (37.0.0-android-tools), the MTP addon loaded from Resources and the native thumbnail helper. Serial numbers are not recorded. All work stayed in uniquely named `Download/Droidwire-Test-*` folders plus a few uniquely named files; everything was removed. Detailed per-scenario results: `docs/HARDWARE-CHECKLIST.md` ("Recorded runs").

**Final artifacts: superseded.** The hashes that were listed here belonged to a build that still contained the MTP addon; the current ones are in section 13.

`check-package` passed (21 Mach-O files, arm64, minos 12.0; adb links only system libraries plus `@loader_path/libusb`; ad-hoc sealed, no Developer ID).

**Automated checks on this tree:** typecheck clean; **133/133 unit tests**; production build; packaged smoke test passed offline (no outbound connections; with the update check on, only `api.github.com`); `check-package`. On the final artifact against the phone: IPC suite 50/50, UI cancel/queue/pause 7/7 and filename validation 5/5, Wi-Fi suite 16/16.

**Bugs found on hardware and fixed (all with regression tests)**
1. Names Android refuses (`"*:<>?\|`) failed silently or with raw adb output - now explained (ADB and MTP).
2. After any failed MTP operation every later one failed ("interface held by another process" - by Droidwire's own worker) - the stale session is released first.
3. The bundled adb has no mDNS support, so **QR pairing could never finish** and **a dropped Wi-Fi phone never came back** - discovery now uses macOS `dns-sd`; session-scoped auto-reconnect that requires the same hardware serial.
4. MTP cancel killed the worker mid-transfer, which wedged the phone until replugged - cancellation now asks libmtp to stop cleanly first (upload verified on hardware).
5. Cancelling reported "Cancelled" while native work could still be running - now "Cancelling…" until it has really stopped; new MTP work is refused (with replug instructions) while a cancel drains or after a forced stop.

**Still failing on hardware:** cancelling an active MTP **download** was not honoured within 8 s and the force-kill left the phone's MTP session dead until a replug (reproduced twice). The grace period was raised to 120 s and the UI/health handling above was added, but **this was not re-tested on a phone** (the phone was not in a healthy File Transfer session when the final build was ready). MTP is therefore shipped as **experimental**.

**dns-sd implementation review.** Discovery timeout: each `dns-sd` child is killed after 2.5 s (browse) or 2 s (lookup/address), at most about 7 s per scan; a scan looks up at most 8 instances (a noisy or hostile network cannot trigger unbounded lookups). Cancellation: QR pairing stop and window close abort the in-flight scan and kill its children; app quit kills every `dns-sd` and ends reconnect. Child cleanup: all children are tracked and killed on timeout, abort and quit (tests: timeout kill, abort starts no process, cap). Device identity: the instance name `adb-<serial>-<suffix>` must match the hardware serial read over the connection that was made on purpose, and the IP must match; a different phone with a known phone's old IP, or a serial that merely starts the same, is not reconnected (tests). **Reconnect cannot select another phone:** it only ever runs `adb connect` to such a matched service. Separately, the existing device-list rule (when the active phone disappears the first remaining phone becomes active, and a phone present over USB hides its own Wi-Fi entry) is unchanged; transfers stay bound to the phone they were queued for, and the badge always shows the active phone's model. Reconnect memory lasts for the session only.

**Remote CI (read-only, `gh run list`):** the only run is **37590682973 on `main`, failed** (commit 9c164c5, v1.3.0) in "Install dependencies": node-gyp 9.4.1 cannot configure `luck-node-mtp` on the runner (Python without `distutils`). The fix (node-gyp 12) exists only in the local, unpushed commits, so **CI is red and the fix is unconfirmed**; `ci.yml` and `release-build.yml` have never run on this tree.

**Native addon licence (`luck-node-mtp`) - does it block shipping the addon? Yes, as an unresolved owner decision; it does not block the rest of the release.** The package ships no LICENSE file and no copyright holder/year; the only licence statement is `"license": "ISC"` plus `"author": "lucksoft"` in `package.json`. Droidwire redistributes a **patched, recompiled** copy. ISC requires the copyright notice and permission text to accompany copies, which cannot be satisfied verbatim, and the grant rests on one metadata field. Labelling MTP "experimental" changes nothing about distribution obligations. A clean dependency scan only reports the field. The package also vendors an LGPL `libmtp.h` and ships x64/Windows prebuilt binaries that Droidwire does not use. Options for the owner: (a) get a LICENSE file from upstream (draft request in `docs/release-prep/upstream-luck-node-mtp-issue.md`, not posted); (b) accept the documented risk knowingly; (c) ship without the addon - the app already handles that: MTP is disabled in the picker with "Not available in this install", and USB and Wi-Fi do not use it; (d) replace the addon with an in-house libmtp binding. USB and Wi-Fi are unaffected by the choice.

## 12. Release-readiness report for the build that still shipped MTP (superseded by section 13)

**Verified supported features (USB/ADB and Wi-Fi, Pixel 4a, Android 13, Apple Silicon, macOS 26)**
- USB ADB: detection, browse, upload/download with hashes, rename/mkdir/copy/move/delete, conflicts, previews (text, image, PDF, audio, HEIC, native video poster frame), folder ZIP, Open & Edit, menu bar, queue/cancel/pause, a 1.29 GB transfer, physical unplug/replug recovery, window-close and quit mid-transfer cleanup, hostile filenames inert.
- Wi-Fi ADB: QR pairing in the app, transfers with the cable out (hashes, 300 MB, ZIP, cancel), Wi-Fi drop detected, automatic reconnect to the same phone.
- Self-contained install: no Homebrew/adb/ffmpeg needed (packaged app, minimal PATH); offline start makes no network connections; update check contacts only `api.github.com`.

**Experimental (shipped, labelled)**
- MTP: partial hardware evidence (48/50) but download-cancel recovery failed and is unverified after the mitigation; several UI cases untested. Do not advertise it as supported.

**Unverified**
- Wi-Fi: pairing by 6-digit code, reconnect after an app restart (not implemented), the Local Network permission prompt on a clean Mac.
- MTP: the 120 s grace on hardware, folder-ZIP cancel, repeated cancels, UI conflict dialogs, filename validation on hardware.
- Two phones / device switching with queued work (unit tests only); Intel; macOS 12-25 runtime; other phones and Android versions; real camera video; folders with thousands of items; APK install and device tools; Developer ID signing, notarization and hardened-runtime behaviour (including the MTP worker); clean-Mac install via the DMG on a Mac without Homebrew.

**Publication blockers**
1. `luck-node-mtp` licence (above): decide (a)-(d) before shipping the addon.
2. Remote CI is red; push the fixes and confirm the workflows pass on GitHub.
3. Unsigned build: users must clear Gatekeeper quarantine themselves (documented); signing and notarization need an Apple Developer ID and have not been run.
4. Owner actions from the earlier list that are still open: publish 1.4.0 and mark v1.3.0 superseded, post the old-repo notice, Firebase retirement, naming review. (None done here.)

**Optional follow-up**
- Re-test MTP cancel recovery on a phone in a healthy File Transfer session; if it recovers reliably, consider promoting it to "limited"; if not, disable it by default.
- Implement persistent Wi-Fi reconnect across app restarts (remember by hardware serial) and test manual pairing-code entry.
- Test on a second phone, an Intel Mac, macOS 12-25; a real camera video; thousands-of-items folders.
- Replace or upstream the MTP addon; native Mach-O reproducibility; auto-update once signing exists.

**Which modes can honestly be advertised:** USB (ADB) and Wi-Fi (wireless ADB, Android 11+) for Apple Silicon Macs on macOS 26 with a Pixel 4a-class phone, with the Gatekeeper step; MTP only as experimental with its limitation stated. Do not claim Intel, older macOS, other phones, or signed/notarized installation.

## 13. Final release candidate: USB and Wi-Fi only, no MTP (2026-10-10)

**Decision.** 1.4.0 ships without MTP. The `luck-node-mtp` licence question (section 11) and the unreliable MTP download-cancel recovery are removed from the release instead of being shipped under a label. The MTP code stays in the repository; `npm --prefix desktop run dist:with-mtp` (`DROIDWIRE_BUNDLE_MTP=1`) builds a variant that includes it for development, and that variant is not a release configuration.

**What ships (verified in the app, the `.zip` and the `.dmg`):** Droidwire (MIT), Electron/Chromium, adb built from AOSP source (Apache-2.0, with its statically linked libraries), **libusb** (LGPL, separate dylib, used by adb), the AVFoundation thumbnail helper, and the JavaScript the app bundles. **Not in the app or archives:** the `luck-node-mtp` addon, `libmtp`, `mtp-worker.cjs`, or any notice for them. `Resources/` holds exactly: `adb`, `libusb-1.0.0.dylib`, `droidwire-thumb`, `app.asar` (+ unpacked `@node-usb`), the notices (`THIRD-PARTY-NOTICES.md`, `THIRD-PARTY-LICENSES.txt`, `ELECTRON-LICENSE.txt`, `LICENSES.chromium.html`), `MTP-NOT-INCLUDED.txt`, and Electron's own files. Installation, build and launch need no addon: `luck-node-mtp` is in no `package.json` (it was a dev dependency whose install script failed to link on a clean Apple Silicon Mac, so a plain `npm ci` failed; reproduced and fixed), `npm ci` compiles nothing native, `native/build.sh` builds libmtp only with `DROIDWIRE_BUILD_LIBMTP=1`, and CI uses plain `npm ci`. MTP development is opt-in: `node scripts/bootstrap.mjs --with-mtp`. `files` also excludes the addon explicitly. The MTP patch file had accumulated build artifacts (about 2,400 lines of `build/` output with local paths); it is trimmed back to the single `src/luck_mtp.cc` change and verified to apply to a pristine `luck-node-mtp@1.0.0`.

**How MTP is presented.** The connection picker shows MTP as **Deferred**, disabled, "Not included in this release. Use USB (ADB) or Wi-Fi." The main process refuses MTP too (`transportFor('mtp')` and the connection-type handler), no MTP worker is ever started (smoke test asserts this), Help > Copy Diagnostics says "mtp: not included in this release".

**Guards added.** `check-package.mjs` (release configuration) fails if any file named `luck-node-mtp*`, `libmtp*` or `mtp-worker*` exists anywhere in the bundle, if any Mach-O references libmtp, if the notices list an MTP component, or if the marker is missing; with `--with-mtp` it demands the opposite plus the licence notices. `check-archives.mjs` opens the finished `.zip` and mounts the `.dmg` and checks the same names and that their `Resources` equal the checked app. Negative test: an app copy with an addon dropped in fails the check.

**Final artifacts (supersede every earlier size and hash)**

| Artifact | Size | sha256 |
|---|---|---|
| `desktop/release/Droidwire-1.4.0-arm64.dmg` | 123,919,810 B (118.2 MiB) | `8bb38de0ac8dd21d5b711dd8bdc4ca2a0f032d536840e5e65440c1fbf4699868` |
| `desktop/release/Droidwire-1.4.0-arm64-mac.zip` | 119,055,554 B (113.5 MiB) | `3006b312d451c15d15d549d30bca4667913a8530ca4cd947f688879ed6ff3594` |

No source file is newer than these artifacts. Ad-hoc sealed, no Developer ID.

**Checks on the final artifact.** Typecheck clean; **141/141 unit tests**; production build; `check-package` (19 Mach-O files, arm64, minos 12.0); `check-archives`; packaged smoke test offline (no outbound connections; with the update check on, only `api.github.com`). On the Pixel 4a, Android 13, Apple Silicon, macOS 26: **USB** IPC suite 50/50, UI suites 38/38 and 9/9; **Wi-Fi** 16/16 (USB pulled; hashes, 300 MB, ZIP, cancels, Wi-Fi drop, automatic reconnect) plus one earlier run of the same artifact at 15/16 where the reconnect could not happen because Android had switched Wireless debugging off after the drop (phone reachable by ping, no `_adb-tls-connect` service). Removing MTP changed nothing for either supported mode: those suites ran against the no-MTP build.

**Remote CI (confirmed on GitHub, ajithonmain/droidwire, 2026-10-09):**
- Run 37590682973 (v1.3.0 tree): failed in "Install dependencies" (node-gyp compiling `luck-node-mtp`).
- Run 37893214140 (`118dfa6`): reported success but its smoke step had actually failed (the step was `continue-on-error`): the dev-mode driver still demanded that the MTP addon load. Not counted as green.
- Run 37893447036 (`712d5cc`, CI): success, smoke test genuinely passed (`mtp UNAVAILABLE` reported coherently with no addon). `continue-on-error` removed from both smoke steps.
- Release-build 37893619191 (`712d5cc`, manual dispatch): failed in packaging, a real defect: `node_modules/electron/dist` is not populated by `npm ci` (Electron 42), so the Electron/Chromium license files were missing and the package check refused to continue. Fixed in `03b674e` (`dist.mjs` fetches the distribution); a local checkout had hidden this.
- CI 37894460404 and Release-build 37894461207 (`03b674e`): both success, including package checks, archive checks and the packaged-app smoke test. The dispatch builds and uploads workflow artifacts only; the draft-release step is skipped unless a `v*` tag is pushed. No tag, release or deployment was created.

**Artifact provenance (macOS arm64, UNSIGNED / ad-hoc; Gatekeeper still blocks a downloaded copy):**

| Build | DMG SHA-256 | ZIP SHA-256 |
|---|---|---|
| GitHub Actions run 37894461207 (`03b674e`), artifact `droidwire-macos-arm64` | `34aafad956aac8ddc9d3156f3fcfdde16a08ea1212f21b85291cab95d8cb953f` (123,912,257 bytes) | `e2e30c5b5c3e0ecc0707bbffda86f21e8e825f1aefa5a84773e5a7dca4e84a83` (119,053,417 bytes) |
| Local `npm --prefix desktop run dist` (clean `out/`) | `4e7f204698064604632b648769d4bd23077efb417e8f52aadbc11365fab9dc6f` (123,918,553 bytes) | `b32ba8916816618804edde54dff7ea52ca300647d74252dd994d031edadea969` (119,053,882 bytes) |

The builds are not bit-for-bit reproducible (the bundled adb and libusb differ between toolchains; timestamps and image layout differ), so the hashes differ. Each was independently checked: GitHub's `SHA256SUMS` verifies; the app, ZIP and DMG contain only `adb`, `libusb-1.0.0.dylib`, `droidwire-thumb`, `app.asar` (+ unpacked `@node-usb`), the notices, `MTP-NOT-INCLUDED.txt` and Electron's own files; no `luck-node-mtp`, libmtp or `mtp-worker.cjs` anywhere; `adb` is arm64 and links `@loader_path/libusb-1.0.0.dylib`; ad-hoc signature, `LSMinimumSystemVersion` 12.0; the `app.asar` file lists of both builds are identical. An earlier local build had 12 stray debug scripts (`out/diag*.js`, `out/test.js`) inside `app.asar` from a stale, git-ignored `desktop/out/`; the package check does not catch unexpected asar entries, so build from a clean `out/`. The published files must come from one build's own `SHA256SUMS`; the release notes table is left blank until then.

**Remaining publication steps (owner):** push; confirm CI and the release-build workflow on GitHub; review `docs/release-prep/RELEASE-NOTES-1.4.0.md`; decide whether to sign and notarize now (needs an Apple Developer ID; otherwise ship unsigned with the documented `xattr` step); publish v1.4.0 and mark v1.3.0 superseded; the old-repo notice and site update (site files are your uncommitted work and were not touched); Firebase retirement; naming review; disposable branches. Nothing was committed, pushed or published.

**Remaining unverified / limitations (do not claim):** Intel; macOS 12-25 runtime; other phones and Android versions; two phones at once; Wi-Fi pairing by 6-digit code; Wi-Fi reconnect after an app restart (not implemented); the Local Network prompt on a clean Mac; a real camera video; thousands-of-items folders; signing, notarization and hardened-runtime behaviour; a clean-Mac install via the DMG without Homebrew. **MTP: deferred.** To bring it back: resolve the addon licence (upstream LICENSE or an in-house libmtp binding) and make cancelling a download recover reliably on hardware.
