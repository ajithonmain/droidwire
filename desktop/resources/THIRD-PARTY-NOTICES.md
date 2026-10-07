# Droidwire - Third-Party Notices

Droidwire is (c) 2026 Ajith M Jose. The license that applies to Droidwire's own
code is stated in the project repository.

Droidwire uses the following third-party and open-source software.

## Runtime & bundled binaries

- **Electron** - MIT License - https://github.com/electron/electron
  (Chromium's own third-party notices ship with Electron in LICENSES.chromium.html)
- **Android Debug Bridge (adb)** - part of the Android Open Source Project
  (AOSP) platform-tools - Apache License 2.0 - https://source.android.com
- **libmtp** - LGPL-2.1 or later - https://github.com/libmtp/libmtp
- **libusb** - LGPL-2.1 or later - https://github.com/libusb/libusb
- **luck-node-mtp** - ISC License - https://github.com/lucksoft-yungui/luck-node-mtp
  (Droidwire applies a small local patch to it)

Droidwire dynamically links libmtp and libusb (both LGPL-2.1 or later). Per the
LGPL, you may obtain, modify, and relink your own build of these libraries
against Droidwire; their original source is available at the links above.

## Application dependencies

- **React / React DOM** - MIT - https://react.dev
- **qrcode** - MIT - https://github.com/soldair/node-qrcode
- **usb (node)** - MIT - https://github.com/node-usb/node-usb

## Development tooling (not shipped in the app)

TypeScript and Playwright (Apache-2.0); Vite, electron-vite, electron-builder,
TailwindCSS, PostCSS, patch-package and related build tooling (MIT).

## Artwork and trademarks

The Android robot is reproduced or modified from work created and shared by
Google and used according to terms described in the Creative Commons 3.0
Attribution License (https://creativecommons.org/licenses/by/3.0/).

Android is a trademark of Google LLC. Droidwire is an independent project and
is not affiliated with or endorsed by Google.

---

This file lists direct and major dependencies for attribution purposes;
it is not an exhaustive transitive-dependency audit. Full license texts
are available in each project's own repository at the links above.
