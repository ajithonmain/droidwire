# Changelog

Compiled from the repository's git history and the changes made for the open-source beta. Dates are commit dates. Versions are those set in `desktop/package.json`; the repository does not record which versions were published as releases beyond the `v1.0.0-beta` tag.

## 1.4.0 - 2026-10-09 (beta prerelease, unsigned)

The self-contained build. Download, open, connect a phone: no Homebrew, no separate adb, no ffmpeg. **USB (ADB) and Wi-Fi (wireless ADB) are the supported modes. MTP is deferred and is not part of this release**: the MTP addon (`luck-node-mtp`), its worker and libmtp are not in the app or the archives.

### Added
- **Bundled adb, built from AOSP source** (platform-tools 37.0.0, Apache-2.0) instead of requiring a separate install, with pinned, checksum-verified sources and a reproducible build (`native/`). Google's prebuilt platform-tools are not redistributed (Android SDK License, section 3.4).
- **Native video thumbnails** with macOS AVFoundation (a small bundled helper that reads the video over the same range-request path as before). ffmpeg is no longer needed; an installed ffmpeg is used only as a fallback for WebM/MKV/AVI.
- **Setup guidance in the app**: mode-specific phone steps (USB debugging, Wireless debugging pairing, a phone that is connected but *unauthorized* or *offline* is now named with the exact next step; a clear message if the bundled adb cannot start. Help > Copy Diagnostics for bug reports; diagnostics are also logged at startup.
- View > Toggle Menu Bar Panel.
- **Package checks** (`desktop/scripts/check-package.mjs`) that fail a build for missing components, wrong architecture, a macOS requirement above 12.0, unresolved or Homebrew library paths, embedded build-machine paths, or an oversized `app.asar`. In the release configuration they also fail the build if **any MTP component** (addon, libmtp, worker) or MTP licence notice is present, and `check-archives.mjs` repeats that for the finished `.dmg` and `.zip`.
- **Signing and notarization pipeline** (hardened runtime, entitlements, `notarytool` via electron-builder, `--require-signed` gate, release workflow). It has not been run with real credentials: the app is still unsigned.
- Packaged-app smoke test (`node desktop/driver.mjs --app ...`) run with a minimal environment, covering the bundled adb version, MTP being reported as not included (and refused by the main process), the thumbnail helper, the menu bar window and the failure messages.
- Renderer queue logic extracted into `lib/transferQueue.ts` with tests for concurrency limits, device-bound restarts, pause/resume/retry, cancellation and upload promise settling.
- `docs/RELEASING.md`, `native/README.md`, `docs/third-party-inventory.md`, shipped `THIRD-PARTY-LICENSES.txt`, `ELECTRON-LICENSE.txt` and `LICENSES.chromium.html`.

### Fixed
- **The advertised "macOS 12+" was not true for 1.3.0**: the bundled libmtp and libusb were Homebrew bottles built for macOS 26. All native code that ships is now compiled for macOS 12.0 and verified (libmtp no longer ships at all).
- A fresh `npm ci` failed on CI (node-gyp 9 cannot run under Python 3.12+); node-gyp is now a current dev dependency, and the MTP patch is applied on every addon build.
- Electron's LICENSE and Chromium notices were not shipped in the app; they are now.
- Setup guide showed ADB-only instructions in MTP and Wi-Fi modes.
- **QR pairing never finished** and **a dropped Wi-Fi phone never came back**: the bundled adb has no mDNS support, which both rely on. Discovery now uses macOS `dns-sd` (bounded timeouts, cancellable, children killed on quit, at most 8 lookups per scan). Within a session a dropped phone is reconnected automatically, only if it is the same phone (IP **and** hardware serial); after an app restart use the Connect field. macOS may ask for Local Network permission.
- **MTP: one failed operation broke every later one** ("Could not open MTP session ... interface held by another process" - held by Droidwire's own worker): the stale libmtp session is now released before reconnecting.
- Names Android refuses over MTP (`\"*:<>?|`) now say why, as they already did over ADB.
- **Names Android refuses** (`"`, `*`, `:`, `<`, `>`, `?`, `\`, `|`): found on a real phone (Pixel 4a, Android 13). Renaming or creating such a name closed the dialog with no message, and a refused upload showed raw adb output. The error now names the character and the file, appears as a toast for rename, new folder and paste, and no longer carries Electron's "Error invoking remote method" prefix.

### Changed
- **MTP is not shipped.** The release build (the default `npm --prefix desktop run dist`) contains no `luck-node-mtp` addon, no libmtp and no MTP worker, and installation, build and launch do not need them. The connection picker shows MTP as **Deferred** and recommends USB or Wi-Fi, and the main process refuses MTP even if asked. Reasons: the addon's licence is unresolved (no LICENSE file upstream) and cancelling an MTP download left the test phone unresponsive until it was replugged. The MTP code stays in the repository: `npm --prefix desktop run dist:with-mtp` builds a variant that includes it (development only; the package check then requires the licence notices). The items below that mention MTP describe that code.
- **Cancelling shows the truth.** A running transfer now shows "Cancelling…" until the native work has really stopped (it is only "Cancelled" afterwards); the slot stays occupied and the transfers panel explains that MTP can take up to two minutes. A transfer that finishes before the cancel took effect is shown as done.
- MTP cancel: Droidwire first asks libmtp to stop the transfer cleanly (a small addition to the `luck-node-mtp` patch) instead of killing the worker, which on a real Pixel 4a left the phone's MTP session dead until the cable was replugged. The kill is only a last resort after 120 seconds. After a forced stop, new MTP operations are refused with instructions (unplug, replug, choose File transfer, Rescan) instead of being pushed into a session that cannot answer. Verified on hardware for uploads; **a cancelled download still wedged the phone in testing before this change and has not been re-tested**.
- Public release builds include adb (1.3.0 omitted it); `dist:release` and `BUNDLE_ADB` are gone.
- Notices describe exactly what ships: the release carries no `luck-node-mtp` or libmtp notice because it contains neither (see docs/LICENSING.md).

## 1.3.0 - 2026-10-07

First open-source release (MIT). Public release builds no longer bundle `adb`; install it with `brew install android-platform-tools` for USB and Wi-Fi modes. Updates are announced from this repository's GitHub Releases.

### Removed
- First-launch **email registration** and everything behind it: the sign-up screen, the `beta:*` IPC channels, the Firestore requests, the startup retry, the embedded Firebase configuration, and the remote "in-app messages" feature. The app now opens straight into the normal UI and collects no personal information. Update information comes from GitHub releases only.
- The app no longer reads or writes `beta-signup.json`. A file left by an earlier beta build stays where it is (`~/Library/Application Support/@droidwire/desktop/`) and can be deleted by the user.
- Unused code and configuration: the `android` workspace entry and script, `electron-updater` and `path-browserify` dependencies, a stale `vite.config.ts`.

### Fixed
- **Folder .zip downloads** put remote folder names into a shell command without quoting; names with spaces, quotes or shell metacharacters could break the command or run unintended commands on the phone. Names are now quoted, each operation uses its own temporary archive, and the archive and local scratch files are removed on failure and cancellation. Phones without an on-device `zip` now fall back to pulling the tree and zipping on the Mac.
- **Text previews** never displayed: the renderer expected a `file://` path while the main process returned a data URL. Previews now use a typed `PreviewResult` (images/audio as data URLs, text as decoded text, first 64 KiB).
- **MTP cut/paste and drag-to-move** only renamed the object instead of moving it between folders. Moves now use MTP `MoveObject`, with name-change and replace handled safely and a clear message when the phone cannot do it.
- **Uploads could hang forever**: a failed, cancelled or dismissed upload left its completion promise unresolved, stalling batches (including "move after upload"). Every upload now settles.
- **Queued work could run against the wrong phone** after switching device or connection mode. Device and transport are captured when work is queued and carried through execution, progress polling and cancellation; transports no longer keep a hidden "current device".
- **Edit sessions, previews and video thumbnails could collide** when two phones expose the same path; they are now keyed by device identity (previews use a private temp directory per request).
- **Update check** treated any different version as newer. Versions are now compared as semantic versions; an older or equal release never prompts. The product version is read from one place and is the same in development and packaged builds (About and update messages previously showed Electron's version in dev).
- MTP: a transfer whose upload failed could previously delete the existing destination file first; uploads that replace now complete before the old file is removed. Concurrent operations on different MTP devices can no longer interleave on the single libmtp session.
- A video-thumbnail request served the active device's file regardless of which device the request was for.
- A failed or cancelled download no longer leaves a partial file or destroys an existing file of the same name: downloads go to a temporary name and are renamed on success.
- Audio previews were blocked by the page's Content Security Policy.

### Security
- All IPC arguments are validated; persistence keys come from an allowlist (the key used to build file names could previously traverse directories); `delete-local-file` only deletes files that were just uploaded by the user's "move" choice; `read-local-file` removed; APK install requires an `.apk` file.
- Download, preview, drag and edit file names are reduced to a single safe path component; destination paths are checked to stay inside their directory.
- Renderer cannot navigate away from the app page or open windows; web permission requests are denied; external links are limited to `https://github.com`; a strict Content-Security-Policy replaces the stale tethering-era one.
- Video-thumbnail loopback server: unguessable per-stream tokens bound to one device and path, Host header check, GET only, range validation, connections closed on quit; ffmpeg is restricted to `http,tcp` input.
- Executable file types (`.command`, `.app`, `.sh`, ...) are not opened automatically by Open & Edit.
- MTP worker supervision: startup timeout, failure on exit-before-ready, and a late exit from a killed worker can no longer reject calls of its replacement; the worker exits with its parent.
- Deleting or moving a storage root is refused; `adb`/`ffmpeg` lookup order is explicit; child processes (transfers, range server, QR pairing, MTP worker) are shut down on quit; messages to closed windows no longer throw.

### Changed
- Main process split into modules (`ipc/`, transports, `lib/`) with one implementation each of device listing, `ls` parsing, MIME mapping and shell quoting (previously duplicated across files).
- Update checks are configurable (Droidwire menu > Check for Updates Automatically) and documented. `DROIDWIRE_OFFLINE=1` disables them for tests.
- Wireless ADB inputs are validated; the folder `adb:find` escapes glob characters.
- Build: a plain `npm ci` works on a clean Mac and compiles nothing native (the `luck-node-mtp` addon is no longer a dependency in any `package.json`; it failed to link on a clean Apple Silicon Mac without libmtp). `native:build` no longer compiles libmtp unless `DROIDWIRE_BUILD_LIBMTP=1`. MTP development is opt-in via `node scripts/bootstrap.mjs --with-mtp`; `rebuild:mtp` detects the libmtp prefix instead of assuming `/opt/homebrew`; `bundle-native.sh` verifies relocatability and architecture; the packaged `app.asar` shrank from about 1.5 GB to under 1 MB by shipping only compiled output.
- Playwright smoke driver derives paths from its own location and runs against a throwaway profile.

### Added
- MIT `LICENSE` and `license` fields in the package manifests.
- Unit tests (`npm test`), `npm run typecheck`, `npm run verify`, GitHub Actions CI, issue and pull-request templates, CONTRIBUTING, SECURITY, hardware checklist, licensing inventory.

## 1.2.1 - 2026-07-12
- Version bump. Site: install-guide accuracy fixes, mobile navigation fixes, social preview image.

## 1.1.1 - 2026-07-12 (changes up to the 1.2.1 bump)
- Beta email registration, in-app messages and update banner (since removed, see above).
- Licenses shown in-app; menubar popup activates the app when opening the main window.

## 1.1.0 - 2026-07-12
- Real logo in-app, menu overhaul, honest landing-page copy.

## 1.0.0-beta - 2026-07-11 (tag `v1.0.0-beta`)
- Self-contained beta packaging (bundled adb, libmtp, libusb), landing page, branded DMG, app icon.
- MTP transport fallback.

## Before 1.0 - 2026-06-26 to 2026-07-11
- 2026-06-26: initial monorepo scaffold and file-browser UI.
- 2026-07-02: pivot to ADB (the earlier Android-side HTTP server design was removed), native drag-out, thumbnails, conflict dialogs, multi-device switching and eject, open-and-edit round trip, device tools, menu bar mode, wireless ADB with QR pairing.
