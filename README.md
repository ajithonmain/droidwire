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

**Connection**
- Auto-detects Android device over USB (vendor ID match), with live status polling every 2s
- Device info, battery level, and storage usage on connect
- Graceful handling of disconnect/replug and unauthorized-device state, with an
  in-app guide for enabling USB Debugging

**File browsing**
- Sidebar bookmarks, breadcrumb navigation, multiple tabs, search
- Grid view with type-aware icons and thumbnails
- Drag-to-reorder and native macOS drag-out (`adb:start-drag`) to Finder or another app

**Transfers**
- Download: single files, or whole folders zipped on-device and pulled as one archive
- Upload: drag files/folders from Finder onto the window; conflict resolution modal
  when a destination file already exists
- Configurable download directory (default `~/Downloads/Droidwire/`)
- Real-time speed (MB/s) and per-file progress, backed by two different progress
  sources: destination file-size polling for downloads, stderr percentage parsing
  for uploads
- Cancel any in-flight transfer — kills the underlying `adb` child process cleanly,
  no orphaned processes

**File management**
- Preview (images render inline; video gets a generated poster frame via `ffmpeg`;
  other types fall back to a Quick Look thumbnail via `qlmanage`)
- Rename, delete, create folder, copy, find
- APK install straight from the file browser
- On-device screenshot capture, pulled directly to the Mac

**UI**
- Dark, minimal theme with a small, deliberate design system (see [Design
  system](#design-system))
- Context menus, keyboard-friendly modals, per-transfer progress panel

## Security

- **No network exposure.** Everything runs over the USB `adb` transport — no HTTP
  server, no open socket, no port bound on the LAN. This was the reason v0's
  USB-tethering-plus-HTTP-server design was scrapped: it put an unauthenticated
  server on a network interface for no benefit over `adb`, which already ships an
  authenticated, encrypted USB transport.
- **No ambient Node/OS access in the renderer.** Electron's `contextBridge` exposes
  only a fixed, typed set of methods (`window.droidwire`) to the UI. The renderer
  process cannot `require()` Node modules, spawn processes, or touch the filesystem
  directly — every operation is proxied through an IPC channel handled in the main
  process.
- **No shell interpolation.** All `adb` invocations use `execFile`/`spawn` with an
  argv array, never a concatenated shell string — so there is no shell to inject
  into. The one place a path is embedded inside an `adb shell` command string
  (e.g. `dd if=<path> ...`), it is passed through a POSIX single-quote escaper
  (`squote()` in `adb-transport.ts`) that neutralizes embedded quotes, so a
  filename like `'; rm -rf /sdcard'` is treated as literal text, not shell syntax.
- **Explicit device authorization.** The Android side requires the user to accept
  the RSA host-fingerprint dialog on first connect — Droidwire cannot read or
  write anything until that's approved on-device, and a rejected/unauthorized
  device is surfaced in the UI rather than silently retried.
- **Bounded resource usage.** Every `adb` call has a 15s timeout; a concurrency
  limiter caps parallel `adb` processes at 6 to prevent resource exhaustion
  (`EAGAIN`) on large folder operations.
- **No cloud, no telemetry.** Files never leave the USB cable. There is no
  backend, no analytics SDK, no account system.

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

## Design system

| Token | Value |
|---|---|
| background | `#0A0A0A` |
| surface | `#141414` |
| border | `#1E1E1E` |
| accent | `#00D84A` |
| accent-dim | `#00D84A20` |
| text-primary | `#F5F5F5` |
| text-muted | `#6B6B6B` |
| success | `#00D84A` |
| error | `#FF4444` |
| warning | `#FF9500` |

Typography: Inter, falling back to SF Pro. Border radius: 8px components, 12px
cards, 4px inputs. Spacing on a 4px base grid.

## Why this project is worth a look

Droidwire is a small, complete product, not a demo. A few things worth pointing
to if you're evaluating the code:

- **Process boundary discipline.** The Electron main/renderer/preload split is
  enforced everywhere — every filesystem and `adb` operation is main-process-only,
  reached through a typed `contextBridge` surface, never `nodeIntegration`.
- **Defensive parsing against real-world variance.** `adb shell ls -la` output
  differs across Android versions and OEMs (toybox vs busybox coreutils,
  different column spacing, filenames with embedded spaces). The parser
  (`parseLsLa()`) is written against that variance rather than a single reference
  device.
- **Correct process lifecycle management.** Transfers are cancellable mid-flight
  with no orphaned `adb` processes; a semaphore-style concurrency limiter (not an
  unbounded `Promise.all`) caps parallel `adb` invocations to what the transport
  can actually sustain.
- **Two independently-implemented progress mechanisms**, chosen because `adb
  pull` and `adb push` expose progress differently: destination file-size
  polling for downloads, stderr percentage parsing for uploads. Neither piggybacks
  on the other's implementation — each was solved for what the tool actually gives you.
- **Security modeled around the actual transport**, not bolted on: the whole
  architecture pivot from v0 (HTTP server over USB tethering) to v1 (raw `adb`)
  was driven by removing an unauthenticated network listener, not by a feature
  request.
- **TypeScript strict end-to-end**, with a genuinely shared types package
  (`shared/types.ts`) consumed by both the main and renderer processes — not
  duplicated interfaces drifting apart.
- **A real self-test harness** (`driver.mjs`) that launches the built app
  headless via Playwright and screenshots it, used to verify UI changes without
  a human driving the app manually.

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
