# Droidwire — Third-Party Notices

Droidwire is proprietary software. © 2026 Ajith M Jose. All rights reserved.
Free to use during the public beta period.

Droidwire uses the following third-party and open-source software.

## Runtime & bundled binaries

- **Electron** — MIT License — https://github.com/electron/electron
- **Android Debug Bridge (adb)** — part of the Android Open Source Project
  (AOSP) platform-tools — Apache License 2.0 — https://source.android.com
- **libmtp** — LGPL-2.1 — https://github.com/libmtp/libmtp
- **libusb** — LGPL-2.1 — https://github.com/libusb/libusb
- **luck-node-mtp** — ISC License — https://github.com/lucksoft-yungui/luck-node-mtp

Droidwire dynamically links libmtp and libusb (both LGPL-2.1). Per the
LGPL, you may obtain, modify, and relink your own build of these libraries
against Droidwire; their original source is available at the links above.

## Application dependencies

- **React / React DOM** — MIT — https://react.dev
- **qrcode** — MIT — https://github.com/soldair/node-qrcode
- **path-browserify** — MIT
- **usb (node)** — MIT — https://github.com/node-usb/node-usb
- **electron-builder** — MIT — https://www.electron.build

## Development tooling (not shipped in the app)

TypeScript, Vite, electron-vite, TailwindCSS, Playwright, and related
build tooling — various MIT-family open-source licenses.

---

This file lists direct and major dependencies for attribution purposes;
it is not an exhaustive transitive-dependency audit. Full license texts
are available in each project's own repository at the links above.
