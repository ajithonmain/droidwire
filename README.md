# Droidwire

Browse, transfer and edit the files on an Android phone from a Mac. Droidwire is an Electron app for macOS that talks to the phone over **USB ADB**, **wireless ADB** or **MTP**. Nothing is installed on the phone, and files only travel over the cable or your local network - there is no cloud service, account or sign-up.

> **Status: beta.** Builds are unsigned, and the maintainer has verified behaviour on a small number of phones (see [Verified devices](#verified-devices)). Keep backups of anything irreplaceable before large transfers or deletes.
>
> **License:** [MIT](LICENSE). Release binaries also contain third-party components under their own licenses; see [docs/LICENSING.md](docs/LICENSING.md) and the in-app notices.

## Connection modes

| Mode | How it connects | Good for | Trade-offs |
|---|---|---|---|
| **USB (ADB)** | `adb` over the USB cable | Everything. Fastest, most complete | Needs Developer options and **USB debugging** on, and the on-phone RSA prompt accepted once |
| **Wi-Fi (wireless ADB)** | `adb pair` / `adb connect` over the local network (Android 11+) | Cable-free use; pairing by 6-digit code or QR code | Same network required; slower than USB; needs **Wireless debugging** on |
| **MTP** | libmtp, the protocol used by "File Transfer" USB mode | Phones where you cannot or will not enable USB debugging | Fallback: no APK install, no device tools, no storage figures, no folder sizes; one device at a time; some operations (such as moving between folders) depend on the phone supporting them |

## Features

Implemented in the code today (see [CHANGELOG.md](CHANGELOG.md)):

- **Browsing:** sidebar bookmarks, breadcrumbs, multiple tabs, list and grid views, sorting, type filters, in-folder filter and recursive search, folder sizes (ADB)
- **Downloads:** queue with up to three concurrent transfers, per-file progress and speed, pause/resume, reorder, cancel, history, completion notification, configurable download folder (default `~/Downloads/Droidwire/`), conflict dialog (replace / keep both / cancel)
- **Folder download as a .zip:** zipped on the phone when it has `zip`, otherwise pulled and zipped on the Mac
- **Uploads:** drag files from Finder onto the window or the menu bar panel, or use the file picker; copy or move; conflict dialog
- **File management:** rename, delete (always confirmed), new folder, copy, cut/paste and drag to move between folders
- **Preview:** images (HEIC/HEIF/TIFF converted with macOS `sips`), PDF first-page thumbnail (Quick Look), audio, the start of text files, video poster frames (needs `ffmpeg`, see below)
- **Open and edit:** open a file in its Mac app; saves are pushed back to the phone automatically
- **Drag-out:** drag files from Droidwire into Finder or another app
- **Device tools (ADB):** battery, device and storage details, installed-app list with APK export, folder-level storage analyzer, APK install from the file browser
- **Multiple phones:** device switcher and per-device eject; every queued operation stays bound to the phone it was started for
- **Menu bar mode:** a small drop target for quick uploads to the phone's `Download` folder

## Platforms and verified devices

- **Mac:** macOS 12 (Monterey) or later. Built and exercised on **Apple Silicon (arm64)**. Intel Macs are expected to work from a source build but are **unverified**; no Intel build is produced or tested.
- **Android:** 8.0 or later for ADB; MTP depends on the phone.
- **Windows, Linux, iOS:** not supported and not planned.

### Verified devices

Hardware testing is manual and limited. According to the maintainer's notes, USB ADB and QR wireless pairing were exercised on a **Pixel 10 Pro**, MTP operations on a Pixel (model not recorded), and device tools on a **Pixel 4a**. Nothing else has been verified. Please report what works and what does not - see [CONTRIBUTING.md](CONTRIBUTING.md#hardware-testing-and-bug-reports). Changes made while preparing the beta release (device-bound operations, MTP move, folder zip, previews) are covered by automated tests with fake devices but have **not yet been re-tested on a phone**; the manual checklist is in [docs/HARDWARE-CHECKLIST.md](docs/HARDWARE-CHECKLIST.md).

## Installing a release build

**adb is not bundled** in release builds (Google's platform-tools license restricts redistribution). For USB and Wi-Fi modes install it once: `brew install android-platform-tools` (or install the Android SDK platform-tools). MTP mode does not need adb. Without adb, USB and Wi-Fi connections will simply never find a device.

Release builds are **not signed or notarized** (that needs an Apple Developer account). macOS will refuse to open a downloaded copy, usually with *"Droidwire is damaged and can't be opened"* - that is Gatekeeper's response to any unsigned, quarantined app.

1. Download the `.dmg` from the [GitHub Releases page](https://github.com/ajithonmain/droidwire/releases) and drag **Droidwire** into **Applications**.
2. Open it once and click **Cancel** on the alert (do not choose "Move to Trash").
3. In Terminal, remove the quarantine flag from this one app:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Droidwire.app
   ```

4. Open Droidwire again. You only do this once per download.

Prefer not to run unsigned binaries? Build from source below and inspect the code first.

## Building from source

Prerequisites (macOS):

- Node.js **22.18 or newer** (24 LTS recommended) and npm
- Xcode command line tools (`xcode-select --install`)
- For MTP support: `brew install libmtp libusb`
- For `npm run dist`: an `adb` binary (`brew install android-platform-tools`, the Android SDK platform-tools, or `ADB_BIN=/path/to/adb`); not needed for `dist:release`

```bash
git clone https://github.com/ajithonmain/droidwire.git
cd droidwire
node scripts/bootstrap.mjs      # installs dependencies; builds the MTP addon if libmtp is found
npm run verify                  # typecheck + unit tests + production build
npm run desktop:dev             # run the app with hot reload
```

Why `bootstrap` instead of `npm install`? The MTP dependency compiles a native addon during install, and that fails unless the compiler can find Homebrew's libmtp. `bootstrap` finds it for you. Without libmtp it installs everything else and skips the addon: the app then works over ADB and wireless ADB and reports MTP as unavailable. To add MTP later: `brew install libmtp libusb && npm run rebuild:mtp`.

Other commands (from the repository root; each forwards to `desktop/`):

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` for the renderer and for main/preload/tests |
| `npm test` | Unit tests (Node's built-in runner; no phone needed) |
| `npm run verify` | typecheck, tests and the production build |
| `npm --prefix desktop run smoke` | Launches the built app headless with a throwaway profile, offline, and checks the first-run UI and security boundary |
| `npm --prefix desktop run dist` | Build, stage native binaries (including adb) and package an unsigned `.dmg` and `.zip` into `desktop/release/` |
| `npm --prefix desktop run dist:release` | Same, without bundling adb (what public releases use) |

The dev scripts run Electron with `env -u ELECTRON_RUN_AS_NODE`. That is required: if the variable is set (some tools and terminals set it), Electron starts as plain Node and the app does not open. Do not remove it.

### Packaging notes

`npm run dist` copies the MTP addon, libmtp, libusb and (unless `BUNDLE_ADB=0`) `adb` into the app so it runs without Homebrew installed on the user's Mac. `npm --prefix desktop run dist:release` is the public-release variant: it omits `adb`. The staging script rewrites library paths to be relocatable, re-signs them ad-hoc, and fails if anything still points into `/opt/homebrew` or `/usr/local`. `ffmpeg` is **not** bundled: video thumbnails appear only when `ffmpeg` is installed (`brew install ffmpeg`); otherwise videos show a generic icon. The build targets the architecture of the Mac that runs it.

**Redistribution caveat:** the MIT license covers Droidwire's source, not the binaries staged into a build. The `adb` taken from Google's platform-tools is covered by the Android SDK License Agreement, which restricts redistribution. Public release builds therefore omit it (`dist:release`); see [docs/LICENSING.md](docs/LICENSING.md).

## Architecture

```
desktop/                 Electron + React client (the whole product)
  src/main/              Main process - owns every adb/MTP call and all file access
    index.ts             App lifecycle, logging, shutdown
    windows.ts menu.ts   Windows, tray, application menu, renderer security policy
    ipc/                 One module per area: files, transfers, preview, device-tools, wireless, app
    device-manager.ts    Picks the transport for a DeviceContext; enumerates devices
    active-device.ts     The UI's current selection + resolveContext()
    adb-transport.ts     adb: every call is scoped with `-s <serial>`
    mtp-transport-core.ts  MTP over a worker; serialises the single libmtp session
    mtp-worker-host.ts   Worker process lifecycle (startup, timeout, exit, restart)
    zip-folder.ts        Folder-to-zip orchestration (testable, effects injected)
    stream-server.ts     Hardened loopback range server for video thumbnails
    lib/                 Pure, unit-tested helpers (quoting, parsing, validation, versions)
  src/preload/           contextBridge: exposes the typed `window.droidwire` and nothing else
  src/renderer/          React UI
  resources/             mtp-worker.cjs, notices, icon (native binaries are staged here at build time)
  test/                  Unit tests;   driver.mjs  headless smoke test
shared/                  Types only, including the `DroidwireAPI` contract used by main, preload and renderer
patches/                 Local patch to luck-node-mtp (storage-root handling, crash on busy device)
scripts/                 bootstrap / MTP addon build
site/                    Landing page
```

Key design rules:

- **The renderer never touches Node, adb or the filesystem.** `contextIsolation` is on, `nodeIntegration` off, the renderer is sandboxed, and it only sees the typed bridge in `shared/api.ts`. Navigation away from the app page and child windows are blocked.
- **Operations carry their device.** Every request that acts on a phone can carry a `DeviceContext { transport, serial }` captured when the work was queued. Transports hold no "current device", so switching phone or connection mode cannot redirect queued downloads, uploads, zips, previews or edit syncs.
- **Remote paths are hostile input.** Anything placed in an `adb shell` command goes through `shQuote()`; local file names are reduced to a single safe component; IPC arguments are validated.
- **MTP runs in a separate process.** libmtp/libusb crash Electron's main process on macOS; the worker is isolated, supervised, and restarted, and MTP operations are serialised because libmtp holds one open device.

## Network use and privacy

- **File data** only moves between your Mac and your phone, over USB or your local network. There is no server, cloud or relay.
- **No accounts, registration, analytics, telemetry or crash reporting.** The app never asks for personal information.
- **Update check (the only outbound request the app makes by itself):** on launch Droidwire sends one unauthenticated `GET https://api.github.com/repos/<releases repo>/releases/latest` with a generic `User-Agent: Droidwire`, to compare the latest release tag with its own version. GitHub sees your IP address, as with any web request. Nothing is downloaded or installed; if a newer version exists you are pointed at the GitHub release page. Turn this off with **Droidwire menu > Check for Updates Automatically**; you can still check by hand via **Check for Updates...**. The repository queried is set in `desktop/src/main/app-info.ts`.
- **Local network:** wireless ADB talks to the phone's IP address; the video-thumbnail helper listens on `127.0.0.1` only, with per-stream tokens.
- **Opening links:** only `https://github.com/...` links are ever opened in your browser.

### Data stored on your Mac

| Location | Contents |
|---|---|
| `~/Library/Application Support/@droidwire/desktop/settings.json` | Download folder, update-check preference |
| `.../bookmarks.json`, `transfer-history.json`, `dismissedMessages.json` | Bookmarks, the last 100 transfers (file names and paths), dismissed update notices |
| `~/Library/Logs/@droidwire/desktop/main.log` | Diagnostic log; can contain file names and paths from your phone. Never sent anywhere. Open via **Help > Show Logs in Finder** |
| `~/Downloads/Droidwire/` (or your chosen folder) | Files you download |
| Temp folders `droidwire-*` under the system temp dir | Previews, drag-out copies and edit-in-place copies; stale ones are removed at start |
| `.../beta-signup.json` | **Legacy.** Early beta builds stored the email address entered at sign-up here. Current builds neither read nor write it and do not delete it; remove it yourself if present |

Earlier beta builds (up to 1.2.1) asked for an email address and sent it, with the app version, to a Firestore database operated by the maintainer. That feature has been removed from the code. Records already collected are a separate matter for the project owner; see [CHANGELOG.md](CHANGELOG.md).

## Known limitations

- Release builds need adb installed separately for USB/Wi-Fi modes; there is no in-app hint yet when it is missing.
- Unsigned builds; Intel Macs and most phone models unverified.
- MTP: one device at a time, no storage capacity, folder sizes, battery or APK tools; moving between folders relies on the phone supporting `MoveObject` and fails with an explanation otherwise; cancelling a transfer restarts the MTP worker; large folder listings are slow (libmtp lists object by object).
- Wireless ADB needs Android 11+ and a network that allows device-to-device traffic.
- Video thumbnails need an installed `ffmpeg`.
- Text previews show only the start of a file; images and audio above 25 MB are not previewed.
- Pause/resume restarts a download from the beginning (adb cannot resume); uploads can be cancelled but not paused once running.
- Folder zip on a phone without `zip` downloads the whole tree first and needs temporary disk space on the Mac.
- Renderer hook logic (queue behaviour, upload settling) is covered by type checking and a unit-tested helper, not by UI tests.

## Roadmap

Realistic next steps, in rough priority order. None are promises.

1. Hardware validation of the beta-prep changes on more phones and Android versions; publish a device matrix.
2. Signed and notarized builds (needs an Apple Developer account), then in-app update installation.
3. Resumable downloads where the transport allows it; richer queue controls.
4. A tested Intel build.
5. A redistributable `adb` (built from AOSP source or with permission) so release builds work with no extra install, and a first-run hint when adb is missing.
6. UI-level automated tests for the renderer.

## Contributing, security, license

- [CONTRIBUTING.md](CONTRIBUTING.md) - setup, verification, conventions, hardware bug reports
- [SECURITY.md](SECURITY.md) - reporting vulnerabilities privately
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE) (MIT) and [docs/LICENSING.md](docs/LICENSING.md) - dependency and binary inventory

"Android" is a trademark of Google LLC. The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License. Droidwire is an independent project and is not affiliated with or endorsed by Google.
