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
- **Electron** 42.5.0 and Chromium - MIT and many other licenses; Chromium's
  notices ship inside the app as LICENSES.chromium.html (in its Resources folder),
  with Electron's own license as ELECTRON-LICENSE.txt.

libusb is shipped as a separate shared library (Resources folder). Per the LGPL
you may replace it with your own build of the same library; its source and the
exact build recipe (native/build.sh, pinned in native/versions.env) are in the
Droidwire repository.

MTP support is not part of this release: the MTP addon and libmtp are not
included in the app. (A build made with DROIDWIRE_BUNDLE_MTP=1 would also contain
libmtp 1.1.22, LGPL-2.1 or later, and the luck-node-mtp addon, whose licence
notice must then be added here - the package check refuses such a build until
this file lists them.)

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

