# Droidwire 1.4.0 - self-contained build, USB and Wi-Fi (beta, unsigned)

This is a **beta prerelease**. It is built for **Apple Silicon Macs only** and is **not signed or notarized**.

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
- **Hardware testing:** USB and Wi-Fi were tested on **one phone, a Google Pixel 4a running Android 13, with an Apple Silicon Mac on macOS 26**: transfers with checksums, conflicts, cancel, queue, previews, folder zips, unplugging the cable mid-transfer, pairing by QR code, Wi-Fi-only transfers and reconnecting after a Wi-Fi drop. Details: `docs/HARDWARE-CHECKLIST.md`.
- **The files attached to this release were not run against a phone.** The hardware runs used a local build of the same release configuration. Afterwards the app's runtime code was not changed; later commits touched the install and build scripts, CI and documentation. The attached files were then built by GitHub Actions and passed, without a phone: the typecheck, unit tests, the package checks (architecture, minimum macOS 12.0, library paths, no MTP component), the check of the finished DMG and ZIP against the checked app, and an offline smoke test of the packaged app.
- **Not verified:** macOS versions older than 26, Intel Macs, any phone other than the Pixel 4a or Android version other than 13, installation on a clean Mac, and signing or notarization (the build is unsigned; the signing pipeline has never been run with real credentials). Wi-Fi pairing by 6-digit code and reconnecting after an app restart are also unverified (use the Connect field).

## Known limitations
- **Apple Silicon only.** The app is built for macOS 12 and later, but only macOS 26 has been run.
- **Wi-Fi:** within a session a dropped phone is reconnected automatically, but **Android sometimes switches Wireless debugging off by itself when Wi-Fi drops** (it did once in testing). Turn it on again on the phone and Droidwire reconnects.
- Pause/resume restarts a download from the start; very large folders list slowly; WebM/MKV/AVI videos show a generic icon.
- **Update check:** this build asks GitHub for the repository's latest *stable* release, so it will not announce a newer prerelease. Watch the releases page.

## Updating from 1.3.0
1.3.0 is superseded: its bundled libraries required macOS 26 and it shipped no adb.

## Files and provenance
The attached files are the unmodified output of GitHub Actions run [37894461207](https://github.com/ajithonmain/droidwire/actions/runs/37894461207) (workflow "Release build", manual dispatch), built from commit **`03b674e60f21e42841427807de8fbe79c7c9a026`**. They were not rebuilt or altered afterwards; the artifact's digest recorded by GitHub (`sha256:91781f5132764fb268c7f6e8e5d1b0e8b2041ca76f6c84afa90ceb9916ffb7c9`) matched the download, and `SHA256SUMS` verifies.

The tag `v1.4.0` points at a later commit that differs from the build commit only in documentation and in the release-build workflow (which no longer reacts to tags). The application source is identical.

| File | Size | SHA-256 |
|---|---|---|
| `Droidwire-1.4.0-arm64.dmg` | 123,912,257 bytes | `34aafad956aac8ddc9d3156f3fcfdde16a08ea1212f21b85291cab95d8cb953f` |
| `Droidwire-1.4.0-arm64-mac.zip` | 119,053,417 bytes | `e2e30c5b5c3e0ecc0707bbffda86f21e8e825f1aefa5a84773e5a7dca4e84a83` |

Check a download with `shasum -a 256 -c SHA256SUMS` in the folder that holds the files. Third-party components and their licences are listed in the app (**Droidwire > Licenses**) and in `docs/third-party-inventory.md`.
