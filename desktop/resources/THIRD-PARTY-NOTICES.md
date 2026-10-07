# Droidwire - Third-Party Notices

Droidwire is (c) 2026 Ajith M Jose and is released under the MIT License (see the
LICENSE file in the project repository: https://github.com/ajithonmain/droidwire).

Droidwire ships third-party software under its own licenses. This summary comes
first; the full license texts of everything bundled follow it below.

## Bundled programs and libraries

- **Android Debug Bridge (adb)** - built from the Android Open Source Project
  source (platform-tools 37.0.0) with the android-tools build system -
  Apache License 2.0. Droidwire does not redistribute Google's prebuilt SDK
  platform-tools binaries. adb statically includes BoringSSL, {fmt}, zstd, LZ4,
  Brotli, PCRE2, Abseil and Protocol Buffers (licenses below).
  https://source.android.com - https://github.com/nmeum/android-tools
- **libusb** 1.0.29 - LGPL-2.1 or later - https://github.com/libusb/libusb
- **libmtp** 1.1.22 - LGPL-2.1 or later - https://github.com/libmtp/libmtp
- **luck-node-mtp** 1.0.0 (MTP addon, with a small local patch) - declared ISC
  License - https://github.com/lucksoft-yungui/luck-node-mtp
- **Electron** 42.5.0 and Chromium - MIT and many other licenses; Chromium's
  notices ship inside the app as LICENSES.chromium.html (in its Resources folder),
  with Electron's own license as ELECTRON-LICENSE.txt.

libusb and libmtp are shipped as separate shared libraries (Resources folder).
Per the LGPL you may replace them with your own build of the same libraries;
their source and the exact build recipe (native/build.sh, pinned in
native/versions.env) are in the Droidwire repository.

## JavaScript packages in the app

React, React DOM, qrcode (MIT), usb (MIT) and their dependencies. See the
full list and texts below.

## Artwork and trademarks

The Android robot is reproduced or modified from work created and shared by
Google and used according to terms described in the Creative Commons 3.0
Attribution License (https://creativecommons.org/licenses/by/3.0/).

Android is a trademark of Google LLC. Droidwire is an independent project and
is not affiliated with or endorsed by Google.

---

Development-only tooling (TypeScript, Vite, electron-builder, test tools, ...)
is not part of the app and is not listed here.

