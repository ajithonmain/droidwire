# Native toolchain

Everything native that Droidwire ships is built here from pinned, checksum-verified source. Nothing is taken from Homebrew, the Android SDK or the PATH at packaging or run time.

```bash
bash native/build.sh        # about 15-25 minutes on Apple Silicon, cached afterwards
bash native/verify.sh       # re-check architectures, minimum macOS, dependencies
```

Build tools needed (not shipped): Xcode command line tools, `cmake`, `ninja`, `pkg-config`, `python3` (`brew install cmake ninja pkgconf` is the easy way). Output goes to `native/.out/` (git-ignored); downloads are cached in `native/.cache/`.

## What is built

| Output | Source | License | Notes |
|---|---|---|---|
| `adb` | AOSP `platform-tools-37.0.0`, via the [android-tools](https://github.com/nmeum/android-tools) CMake build | Apache-2.0 | zstd, LZ4, Brotli, PCRE2, Abseil, Protobuf, BoringSSL and {fmt} are statically linked. libusb is the only non-system dynamic dependency |
| `libusb-1.0.0.dylib` | libusb 1.0.29 | LGPL-2.1+ | shared, replaceable |
| `libmtp.9.dylib` | libmtp 1.1.22 | LGPL-2.1+ | shared, replaceable; `--disable-mtpz` |
| `droidwire-thumb` | `native/thumb/droidwire-thumb.swift` | MIT (Droidwire) | AVFoundation poster frames; system frameworks only |

`luck-node-mtp.node` (the MTP addon) is compiled by `desktop/scripts/bundle-native.sh` against this libmtp, with the repository's patch applied.

## Why adb is built from source

Google's prebuilt `platform-tools` binaries are distributed under the Android SDK License Agreement, whose section 3.4 says you may not "copy ..., modify, adapt, redistribute" the SDK or any part of it (https://developer.android.com/studio/terms). The adb **source** in AOSP is Apache-2.0 (https://source.android.com/docs/setup/about/licenses), which does permit redistribution of a binary built from it with the license and notices. Droidwire therefore builds adb itself and ships Apache-2.0 notices rather than redistributing Google's binary. The result reports `Android Debug Bridge version 1.0.41` / `Version 37.0.0-android-tools` and speaks the same protocol, so it interoperates with other adb servers and with every phone.

Provenance: the `android-tools-37.0.0.tar.xz` release tarball (SHA-256 recorded in `versions.env`, matching GitHub's published digest) vendors the AOSP sources at the `platform-tools-37.0.0` tags together with android-tools' patches. We do not modify them further.

## Pinned inputs

`versions.env` holds every version, URL and SHA-256. The build refuses to continue on a mismatch. To upgrade a component, change the entry, download the file, check it against the upstream project's published checksum or signature where one exists (noted in the file), and record the new hash.

## Why everything is compiled here

`DEPLOYMENT_TARGET` (12.0, matching Electron 42's own minimum) and the architecture are passed to every compiler and linker invocation. Homebrew's libraries target the macOS version of the machine that built the bottle (macOS 15-26); bundling them silently raised the app's real minimum far above what the app claimed. `native/verify.sh` and `desktop/scripts/check-package.mjs` fail the build if any Mach-O requires a newer macOS than the floor, has the wrong architecture, links a non-system library that is not shipped, or embeds a build-machine path.

## Intel

Only Apple Silicon (arm64) is built and verified. `NATIVE_ARCH=x86_64` is accepted by the scripts but nothing in the pipeline has been run or tested for Intel, and no Intel build is published.
