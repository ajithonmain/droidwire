# Droidwire 1.4.0 - release description (draft, NOT PUBLISHED)

Paste into the GitHub release. The file table at the bottom must be filled from the final artifacts' `SHA256SUMS` at publication: builds are not bit-for-bit reproducible, so every build has its own hashes.

---

## Droidwire 1.4.0 - self-contained build, USB and Wi-Fi

Browse, transfer and edit the files on an Android phone from a Mac, over **USB debugging (ADB)** or **Wi-Fi (wireless debugging)**. Free, MIT licensed, no account, no sign-up, nothing collected.

**Nothing else to install.** adb (built from the Android Open Source Project) and the video-thumbnail helper are inside the app: no Homebrew, no Android SDK, no ffmpeg, nothing on the phone.

### What was tested
USB and Wi-Fi were tested on real hardware with the 1.4.0 release configuration (the app code has not changed since; later commits touched only the install and build scripts, CI and documentation): **Google Pixel 4a, Android 13, Apple Silicon Mac, macOS 26** - transfers with checksums, conflicts, cancel, queue, previews, folder zips, unplugging the cable mid-transfer, pairing by QR code, Wi-Fi-only transfers and reconnecting after a Wi-Fi drop. Details: `docs/HARDWARE-CHECKLIST.md`.

### Before you start (on the phone)
- **USB:** turn on Developer options (tap *Build number* 7 times), then **USB debugging**; plug in, and tap **Allow** on the "Allow USB debugging?" prompt (tick *Always allow*).
- **Wi-Fi (Android 11+):** phone and Mac on the same network; Settings > Developer options > **Wireless debugging** on; pair once with **Pair device with QR code** (scan the code Droidwire shows). macOS may ask Droidwire for **Local Network** access: allow it.

### This build is not signed
It is not signed with an Apple Developer ID and not notarized, so macOS Gatekeeper blocks a downloaded copy the first time, usually with "Droidwire is damaged and can't be opened". Click **Cancel** (not "Move to Trash"), drag Droidwire to Applications, then run once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Droidwire.app
```

Droidwire never clears this flag for you. If you would rather not run an unsigned app, build it from source and read the code first (README).

### Known limitations
- **Apple Silicon only.** Intel Macs are not supported or tested. Built for macOS 12 and later, but only **macOS 26** has been run; older versions are untested.
- **Tested on one phone.** Other phones and Android versions are untested.
- **Wi-Fi:** pairing by 6-digit code and reconnecting after you quit and reopen the app are not verified (use the Connect field). Within a session a dropped phone is reconnected automatically - but Android sometimes switches **Wireless debugging** off by itself when Wi-Fi drops (it did once in testing); turn it on again on the phone and Droidwire reconnects.
- **MTP is deferred**: not in this release. It is shown as such in the connection picker; use USB or Wi-Fi.
- Pause/resume restarts a download from the start; very large folders list slowly; WebM/MKV/AVI videos show a generic icon.

### Updating from 1.3.0
1.3.0 should be considered superseded: its bundled libraries required macOS 26 and it shipped no adb.

### Files
| File | Size | SHA-256 |
|---|---|---|
| `Droidwire-1.4.0-arm64.dmg` | (fill at publication) | (from SHA256SUMS of the published build) |
| `Droidwire-1.4.0-arm64-mac.zip` | (fill at publication) | (from SHA256SUMS of the published build) |

Third-party components and their licences are listed in the app (**Droidwire > Licenses**) and in `docs/third-party-inventory.md`.
