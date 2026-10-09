# Droidwire 1.4.1 - update check finds beta releases (beta, unsigned)

This is a **beta prerelease**. It is built for **Apple Silicon Macs only** and is **not signed or notarized**.

**What changed from 1.4.0:** beta releases can now be discovered by the update checker. 1.4.0 asked GitHub for `/releases/latest`, which never returns prereleases, so a beta published as a prerelease was invisible. 1.4.1 reads the release list (first page, 30 releases), ignores drafts and tags that are not valid semver, picks the **highest version** (not the most recently created release), offers it only if it is strictly newer than the running version, and opens that release's page when you click Download. Nothing else in the app changed: same bundled AOSP-built adb and libraries, USB (ADB) and Wi-Fi, no MTP, Apple Silicon only, unsigned, no email registration, no Firebase.

**This does not fix 1.4.0 or 1.3.0.** Installed copies of those versions keep asking `/releases/latest` (which still returns 1.3.0), so they will not announce this release. If you run 1.4.0 or 1.3.0, download 1.4.1 from this page.

Browse, transfer and edit the files on an Android phone from a Mac, over **USB debugging (ADB)** or **Wi-Fi (wireless debugging)**. Free, MIT licensed, no account, no sign-up, nothing collected.

**Nothing else to install on the Mac.** adb (built from the Android Open Source Project) and the video-thumbnail helper are inside the app: no Homebrew, no Android SDK, no ffmpeg. Nothing is installed on the phone.

**Supported connection modes: USB (ADB) and Wi-Fi (wireless ADB).** **MTP is deferred**: it is not part of this release and is absent from the app (no MTP addon, no libmtp, no MTP worker). The connection picker shows MTP as deferred and recommends USB or Wi-Fi.

## Before you start (on the phone)
- **USB:** turn on Developer options (tap *Build number* 7 times), then **USB debugging**. Plug in, and tap **Allow** on the "Allow USB debugging?" prompt (tick *Always allow from this computer*). Droidwire tells you if the phone is connected but not yet authorized.
- **Wi-Fi (Android 11+):** phone and Mac on the same network; Settings > Developer options > **Wireless debugging** on; pair once with **Pair device with QR code** (scan the code Droidwire shows). macOS may ask Droidwire for **Local Network** access: allow it.

## First launch: this build is not signed
It is not signed with an Apple Developer ID and not notarized, so macOS Gatekeeper blocks a downloaded copy the first time, usually with "Droidwire is damaged and can't be opened". Click **Cancel** (not "Move to Trash"), drag Droidwire to Applications, then run once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Droidwire.app
```

Droidwire never clears this flag for you. If you would rather not run an unsigned app, build it from source and read the code first (README).

## What was verified, and what was not
- **GitHub Actions**, on commit `f5d027858e83085eeccb4432ce5bf2fe97870c45`: CI (typecheck, 148 unit tests, production build, offline smoke) and the manual Release build workflow passed. The Release build also ran the package checks (architecture, minimum macOS 12.0, library paths, no MTP addon, libmtp or worker, no unexpected files under `out/` in app.asar), the check of the finished DMG and ZIP against the checked app, and an offline smoke test of the packaged app.
- **Re-checked on the downloaded files** (not the CI log): SHA256SUMS, the artifact digest GitHub records for the run, DMG and ZIP contents identical, no MTP component, offline smoke test of the app extracted from the DMG with a minimal PATH and a throwaway profile (no outbound connections).
- **Hardware (published files):** the attached GitHub-built 1.4.1 app (extracted from the DMG after `SHA256SUMS` verified it; minimal PATH, throwaway profile, offline) was run against one Google Pixel 4a (Android 13) from an Apple Silicon Mac on macOS 26, using fixtures generated for the run in a dedicated phone folder (removed afterwards) and hashes computed outside the app.
  - **USB, IPC level** (`desktop/driver-hw.mjs`): 50 of 50 checks passed: upload and download hashes for 11 files including awkward names, folder zip, previews, rename/copy/move, cancelling active uploads, downloads and folder zips, no stray adb processes. The published 1.4.0 files passed 50 of 50 as well.
  - **USB, UI level** (`desktop/driver-hw-ui.mjs`, final harness, one command, all sections): 48 passed, 0 failed. This includes the queue/cancel/pause rows, close and quit during a download, the double-quote rename, and the PDF, audio and HEIC previews. **Section K** (upload to the storage root and download back, fresh launch at the root, run separately with `--section k`): 1 of 1 passed.
  - An earlier first pass of the UI harness reported 34 passed and 15 failed on both 1.4.0 and 1.4.1. Those 15 were test-setup problems (missing fixtures, a run-order error, a process-matching bug, a premise violation), not application defects; the diagnosis is in `docs/HARDWARE-CHECKLIST.md`. The first pass is superseded by the results above.
  - **Wi-Fi** (`desktop/driver-hw-wifi.mjs`, QR pairing through the app, USB cable removed so only the wireless device remained): 16 of 16 on the published 1.4.1 files, recorded earlier on 2026-10-09 (32 MB and 300 MB round trips, folder zip, cancels, Wi-Fi switched off and on with automatic reconnect). It was not re-run in the final pass because pairing needs a person at the phone.
  - **Not covered by this evidence:** the published 1.4.0 files were not re-run on the UI or Wi-Fi harnesses; this evidence is for 1.4.1 only.
- **Earlier hardware testing (1.4.0 release configuration, local build):** one Google Pixel 4a, Android 13, Apple Silicon Mac on macOS 26: USB and Wi-Fi transfers with checksums, conflicts, cancel, previews, folder zips, unplug mid-transfer, QR pairing and Wi-Fi reconnect. The runtime code is unchanged except the update check. Details: `docs/HARDWARE-CHECKLIST.md`.
- **Not verified:** macOS versions older than 26, Intel Macs, any phone other than the Pixel 4a or Android version other than 13, installation on a clean Mac, and signing or notarization (the build is unsigned; the signing pipeline has never run with real credentials).

## Known limitations
- **Apple Silicon only.** Built for macOS 12 and later, but only macOS 26 has been run.
- **Unsigned and not notarized**, so the first-launch step above is required.
- **Wi-Fi:** Android sometimes switches Wireless debugging off by itself when Wi-Fi drops; turn it on again and Droidwire reconnects. Pairing by 6-digit code and reconnecting after an app restart are unverified (use the Connect field).
- Pause/resume restarts a download from the start; very large folders list slowly; WebM/MKV/AVI videos show a generic icon.
- **Update check reads only the 30 most recently created releases.** That is deliberate and documented; it can hide old releases, never offer one.
- MTP is deferred and not part of this release.

## Files and provenance
The attached files are the unmodified output of GitHub Actions run [37912254192](https://github.com/ajithonmain/droidwire/actions/runs/37912254192) (workflow "Release build", manual dispatch), built from commit **`f5d027858e83085eeccb4432ce5bf2fe97870c45`**. They were not rebuilt or altered afterwards; the artifact digest GitHub records (`sha256:52b88c4410b724ffddba29119990d732d36cc993b6c8279af708e8036a57cc7c`) matched the download, and `SHA256SUMS` verifies. The tag `v1.4.1` points at a later commit that differs from the build commit only in documentation.

| File | Size | SHA-256 |
|---|---|---|
| `Droidwire-1.4.1-arm64.dmg` | 123,918,412 bytes | `9bb45f66a5ab0a0ba9d517a9dc82687c0951a074518220290fc0615809aa5389` |
| `Droidwire-1.4.1-arm64-mac.zip` | 119,053,698 bytes | `664733d2b2e119b4f2ef66c89e53c0281708abeabaa6c2db3871e70836a5d47e` |

Check a download with `shasum -a 256 -c SHA256SUMS` in the folder that holds the files. Third-party components and their licences are listed in the app (**Droidwire > Licenses**) and in `docs/third-party-inventory.md`.
