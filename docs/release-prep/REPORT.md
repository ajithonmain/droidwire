# Release candidate 1.4.0 - report

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
| `Droidwire-1.4.0-arm64.dmg` | 118.3 MB | 114.4 MB | +3.9 MB |
| `Droidwire-1.4.0-arm64-mac.zip` | 113.7 MB | 110.0 MB | +3.7 MB |

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

**No phone was available** (`adb devices` with the bundled adb listed nothing; no Android device on USB). None of `docs/HARDWARE-CHECKLIST.md` was run, so these are **unverified on hardware**: USB ADB connect/authorize, wireless pairing, MTP session; uploads/downloads incl. spaces/quotes/Unicode names; conflict choices; folder ZIPs; cancellation and unplug/replug; device switching with queued work; Open & Edit sync; previews from a phone; menu-bar transfers. No results were invented. The checklist now begins with a clean-Mac install section for the packaged `.dmg`.

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
