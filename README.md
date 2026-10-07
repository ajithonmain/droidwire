# Droidwire

Browse, transfer and edit the files on an Android phone from a Mac. Droidwire is an Electron app for macOS that talks to the phone over **USB ADB**, **wireless ADB** or **MTP**. Nothing is installed on the phone, and files only travel over the cable or your local network - there is no cloud service, account or sign-up.

> **Status: beta.** Release builds are self-contained (nothing to install first) but **not yet signed or notarized**, and behaviour has been verified on only a few phones (see [Verified devices](#verified-devices)). Keep backups of anything irreplaceable before large transfers or deletes.
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
- **Preview:** images (HEIC/HEIF/TIFF converted with macOS `sips`), PDF first-page thumbnail (Quick Look), audio, the start of text files, and video poster frames (macOS AVFoundation: H.264/HEVC in MP4/MOV/3GP; WebM/MKV/AVI get a generic icon unless you happen to have `ffmpeg` installed)
- **Open and edit:** open a file in its Mac app; saves are pushed back to the phone automatically
- **Drag-out:** drag files from Droidwire into Finder or another app
- **Device tools (ADB):** battery, device and storage details, installed-app list with APK export, folder-level storage analyzer, APK install from the file browser
- **Multiple phones:** device switcher and per-device eject; every queued operation stays bound to the phone it was started for
- **Menu bar mode:** a small drop target for quick uploads to the phone's `Download` folder

## Platforms and verified devices

- **Mac:** Apple Silicon (arm64) with **macOS 12 (Monterey) or later**. Every executable and library in the app is compiled for macOS 12.0 and checked at packaging time. **Intel Macs are not supported**: no Intel build is produced and none has been tested.
- **Android:** 8.0 or later for ADB; MTP depends on the phone.
- **Windows, Linux, iOS:** not supported and not planned.

### Verified devices

Hardware testing is manual and limited. According to the maintainer's notes, USB ADB and QR wireless pairing were exercised on a **Pixel 10 Pro**, MTP operations on a Pixel (model not recorded), and device tools on a **Pixel 4a**. Nothing else has been verified. **The current build, with its bundled adb and rebuilt MTP libraries, has not yet been tested on a phone** - only with automated tests and a packaged-app smoke test that uses fake devices. The manual checklist is [docs/HARDWARE-CHECKLIST.md](docs/HARDWARE-CHECKLIST.md); please report what works and what does not ([CONTRIBUTING.md](CONTRIBUTING.md#hardware-testing-and-bug-reports)).

## Installing a release build

Everything Droidwire needs is inside the app: **adb, the MTP libraries and the video-thumbnail helper are bundled.** You do not need Homebrew, the Android SDK or any other download, and there is nothing to install on the phone. (Until the app is signed, macOS also makes you run one Terminal command to open it - see Signing status below.)

1. Download the `.dmg` from the [GitHub Releases page](https://github.com/ajithonmain/droidwire/releases), open it, and drag **Droidwire** onto **Applications**.
2. Open Droidwire. Choose how to connect (USB, Wi-Fi or MTP); the app tells you the phone-side steps.

**Signing status: not signed or notarized yet** (that needs an Apple Developer ID; the pipeline is ready, see [docs/RELEASING.md](docs/RELEASING.md)). Until it is, macOS Gatekeeper blocks a downloaded copy on first launch, usually with *"Droidwire is damaged and can't be opened"*. This is macOS's response to any unsigned, quarantined app. To open it anyway you must clear the quarantine flag yourself, once:

```bash
xattr -dr com.apple.quarantine /Applications/Droidwire.app
```

(Click **Cancel** on the alert first, not "Move to Trash". Droidwire never removes this flag for you.) Prefer not to run an unsigned app? Build from source below and read the code first.

### On the phone (Android requires these; no desktop app can skip them)

- **USB (ADB):** enable Developer options (tap Build number 7 times), turn on **USB debugging**, plug in the cable and tap **Allow** on the "Allow USB debugging?" prompt (tick "Always allow from this computer"). Droidwire shows which step is outstanding, including a phone that is connected but not yet authorized.
- **Wi-Fi (wireless ADB, Android 11+):** turn on **Wireless debugging** and pair once, with a QR code or a 6-digit code, from Droidwire's pairing dialog.
- **MTP:** unlock the phone and choose **File transfer** in the USB notification.

## Building from source

Prerequisites (macOS, Apple Silicon): Node.js **22.18 or newer** (24 LTS recommended) and npm; the Xcode command line tools (`xcode-select --install`); and, **only to build the app yourself**, `cmake`, `ninja` and `pkg-config` (for example `brew install cmake ninja pkgconf`). Running a downloaded release needs none of this.

```bash
git clone https://github.com/ajithonmain/droidwire.git
cd droidwire
node scripts/bootstrap.mjs      # installs JavaScript dependencies
npm run native:build            # adb (from AOSP source), libusb, libmtp, thumbnail helper: ~20 min, cached
npm run verify                  # typecheck + unit tests + production build
npm run desktop:dev             # run the app with hot reload
npm --prefix desktop run dist   # package an unsigned .dmg/.zip into desktop/release/
```

For day-to-day development you can skip `native:build`: in a development checkout the app falls back to an `adb` on your PATH, Homebrew or the Android SDK (or `DROIDWIRE_ADB=/path/to/adb`). `bootstrap` finds Homebrew's libmtp if present and builds the MTP addon against it; without libmtp it installs everything else and MTP reports itself unavailable.

Other commands (from the repository root; each forwards to `desktop/`):

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` for the renderer and for main/preload/tests |
| `npm test` | Unit tests (Node's built-in runner; no phone needed) |
| `npm run verify` | typecheck, tests and the production build |
| `npm run native:build` | Build the bundled native components from pinned sources (`native/README.md`) |
| `npm --prefix desktop run smoke` | Launch the built app headless, offline, with a throwaway profile |
| `node desktop/driver.mjs --app <Droidwire.app>` | Same checks against a **packaged** app in a minimal environment (no Homebrew on PATH) |
| `npm --prefix desktop run dist` | Stage native components, package, then run `check-package` |
| `npm run license:inventory` / `license:scan` | Regenerate the shipped-license inventory / scan the whole dependency tree |

The dev scripts run Electron with `env -u ELECTRON_RUN_AS_NODE`. That is required: if the variable is set (some tools and terminals set it), Electron starts as plain Node and the app does not open. Do not remove it.

### Packaging notes

`npm --prefix desktop run dist` stages the MTP addon, libmtp, libusb, `adb` and the thumbnail helper into the app (rewriting library paths to `@loader_path`), builds the `.dmg` and `.zip`, and then runs `scripts/check-package.mjs`, which **fails the build** if a required file is missing, any Mach-O has the wrong architecture or needs a newer macOS than 12.0, a staged binary depends on a library that will not exist on a user's Mac or embeds a build-machine path, the MTP addon lacks the repository patch, or `app.asar` contains native code or grows unexpectedly. Signing and notarization are described in [docs/RELEASING.md](docs/RELEASING.md).

**Why adb is built from source:** Google's prebuilt platform-tools are distributed under the Android SDK License, which forbids redistribution. Droidwire builds adb from AOSP's Apache-2.0 source and ships the notices. Details and provenance: [docs/LICENSING.md](docs/LICENSING.md), [native/README.md](native/README.md).

## Architecture

```
desktop/                 Electron + React client (the whole product)
  src/main/              Main process - owns every adb/MTP call and all file access
    index.ts             App lifecycle, logging, shutdown
    windows.ts menu.ts   Windows, tray, application menu, renderer security policy
    ipc/                 One module per area: files, transfers, preview, device-tools, wireless, app
    device-manager.ts    Picks the transport for a DeviceContext; enumerates devices
    diagnostics.ts       Self-check of the install (adb, MTP addon, thumbnails)
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
native/                  Pinned-source build of adb, libusb, libmtp and the AVFoundation thumbnail helper
scripts/                 bootstrap, MTP addon build, license inventory
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

- **Not signed or notarized:** first launch of a downloaded copy needs the `xattr` step above. Apple Silicon only; Intel Macs unsupported.
- **Not yet tested on a phone in its current form** (bundled adb, rebuilt libraries); most phone models have never been tested at all.
- MTP: one device at a time; no storage capacity, folder sizes, battery or APK tools; moving between folders relies on the phone supporting `MoveObject` and fails with an explanation otherwise; cancelling a transfer restarts the MTP worker; large folder listings are slow (libmtp lists object by object).
- Wireless ADB needs Android 11+ and a network that allows device-to-device traffic.
- If another adb server is already running on the Mac (for example from Android Studio) and speaks a different adb protocol version, the first client to connect restarts it. The bundled adb uses the current protocol (version 41), the same as current Google platform-tools.
- Video thumbnails come from macOS AVFoundation (H.264/HEVC in MP4/MOV/3GP). WebM, MKV and AVI show a generic icon unless an `ffmpeg` is installed (optional; not bundled).
- Text previews show only the start of a file; images and audio above 25 MB are not previewed.
- Pause/resume restarts a download from the beginning (adb cannot resume); uploads can be cancelled but not paused once running.
- Folder zip on a phone without `zip` downloads the whole tree first and needs temporary disk space on the Mac.
- Real USB, wireless ADB and MTP behaviour cannot be exercised in CI; see the hardware checklist.

## Roadmap

Realistic next steps, in rough priority order. None are promises.

1. Hardware validation of this build on more phones and Android versions; publish a device matrix.
2. Signed and notarized builds (the pipeline exists; it needs an Apple Developer ID), then in-app update installation.
3. Resumable downloads where the transport allows it; richer queue controls.
4. A tested Intel build.
5. Upstream or replace the unmaintained MTP addon (see [docs/LICENSING.md](docs/LICENSING.md)).
6. UI-level automated tests for the renderer (queue logic is already unit-tested).

## Contributing, security, license

- [CONTRIBUTING.md](CONTRIBUTING.md) - setup, verification, conventions, hardware bug reports
- [SECURITY.md](SECURITY.md) - reporting vulnerabilities privately
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE) (MIT) and [docs/LICENSING.md](docs/LICENSING.md) - dependency and binary inventory

"Android" is a trademark of Google LLC. The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License. Droidwire is an independent project and is not affiliated with or endorsed by Google.
