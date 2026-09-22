# Droidwire

Android ↔ Mac file transfer over USB via ADB. No MTP. No app install on Android.
Enable USB Debugging, plug in the cable, transfer starts.

```
Mac Electron app
  └── bundles/locates adb binary
        └── adb over USB ──► Android filesystem
              adb pull            = download
              adb push            = upload
              adb shell ls -la    = browse
```

> **History:** v0 used a React Native HTTP server on the phone over USB tethering.
> Scrapped in favor of ADB (same model as MacDroid): full USB bandwidth, zero
> Android-side install, no tethering setup. The `android/` folder was removed —
> that architecture will not return.

## Why

Most Android-to-Mac transfer tools rely on MTP (slow, flaky mounting) or
cloud sync (privacy, bandwidth). Droidwire uses `adb`, which is already on
every Android developer's machine and ships with full USB throughput,
directory listing, and file operations for free — no protocol to reimplement.

## Features

- Auto-detects Android device over USB (vendor ID match) with live connection polling
- File browser: sidebar bookmarks, breadcrumb navigation, tabs, search
- Download files/folders to a configurable local directory (default `~/Downloads/Droidwire/`)
- Upload via drag-and-drop onto the app window
- Folder download as a zip pull
- Image and file preview, rename, delete, create folder, copy
- APK install, on-device screenshot capture
- Real-time transfer speed and per-file progress, with cancel support
- Dark, minimal UI

## Requirements

- macOS 12.0 (Monterey) or later
- Android 8.0+ with a usable `adb`
- USB cable
- Developer Options + USB Debugging enabled on the Android device (accept the
  RSA fingerprint prompt on first connect)

## Install

Signed/notarized builds are pending an Apple Developer account. Until then,
build locally:

```bash
git clone https://github.com/ajithonmain/droidwire.git
cd droidwire
npm install

cd desktop
npm run dev      # electron-vite dev, launches Electron with HMR
```

To produce an unsigned `.dmg` for personal use:

```bash
cd desktop
npm run dist      # electron-vite build + electron-builder → release/*.dmg
```

Note: dev/electron scripts run with `env -u ELECTRON_RUN_AS_NODE` — this is
required for Electron to launch correctly and must not be removed.

## Usage

1. Launch Droidwire on the Mac.
2. Connect the Android device via USB.
3. Accept the "Allow USB debugging" dialog on the phone if prompted.
4. Browse, download, upload, or manage files once the device shows as connected.

## Monorepo structure

```
droidwire/
├── desktop/              # Electron + React Mac client (the entire product)
│   ├── src/
│   │   ├── main/         # Electron main process — owns all adb calls
│   │   ├── renderer/     # React UI (components/, hooks/, lib/)
│   │   └── preload/      # contextBridge → window.droidwire
│   └── driver.mjs        # Playwright harness: launch app headless, screenshot
├── shared/                # Shared TypeScript types only (no constants)
│   └── types.ts           # FileNode, StorageInfo, TransferProgress, ConnectionStatus
└── site/                  # Landing page
```

## Tech stack

- Electron (electron-vite) + React 18 + TypeScript, strict mode
- TailwindCSS — no UI framework, custom components only
- `usb` package for Android vendor ID detection
- `playwright-core` for the self-test driver
- `electron-builder` for `.dmg` packaging

## Architecture

All `adb` calls live in the Electron main process. The renderer never touches
Node or `adb` directly — it goes through `window.droidwire`, exposed via
`contextBridge` in the preload script.

- `adbBin()` locates the bundled `adb`, falling back to a Homebrew or system
  install
- `adb()` wraps `execFile` with a 15s timeout per invocation
- An ADB concurrency limiter caps at 6 concurrent processes to avoid `EAGAIN`
  on large folder operations (adb also serializes some operations
  device-side, so more concurrency does not mean more throughput)
- `parseLsLa()` parses `adb shell ls -la` output into `FileNode[]`, staying
  defensive since output varies across Android versions/OEMs (toybox vs
  busybox) and filenames with spaces are common
- Pull progress is polled from destination file size every 250ms
- Push progress is parsed from the `[ XX%]` markers in `adb` stderr
- Remote filesystem root for user content is `/sdcard/`
  (`/storage/emulated/0/`)

Full IPC surface, error-handling behavior, and design tokens are documented
in [CLAUDE.md](CLAUDE.md).

## Roadmap

1. Multiple devices — switcher when 2+ phones are connected, all adb calls serial-scoped
2. Open & edit round-trip — open a file in its Mac app, auto-push back to phone on save
3. Menu bar mode — quick transfers without the full window
4. Device tools — battery/storage detail, app list, APK export
5. Transfer queue upgrades — pause/resume, reorder, completion notifications
6. Storage analyzer — treemap of device storage
7. Wireless ADB pairing (Android 11+)
8. Auto-update via `electron-updater`
9. MTP fallback for macOS Ventura+ when `adb` is unavailable

Signed/notarized distribution and Mac App Store submission are deferred until
an Apple Developer account is available.

## Out of scope

- Windows client
- Cloud sync
- iOS support
- Android-side app

## License

Private project. Not currently open source.
