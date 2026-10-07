# Licensing inventory

**Status: the project is licensed under the MIT License** (see `LICENSE`, (c) 2026 Ajith M Jose; chosen by the owner). This document is the supporting inventory; it is not legal advice.

## 1. Project license

MIT covers Droidwire's own source code. It does not relicense anything else: bundled binaries and dependencies keep their own licenses (sections 2-4). MIT is compatible with every component used here (MIT, ISC, BSD, Apache-2.0, and LGPL-2.1-or-later libraries used as dynamically linked libraries). The license appears in: `LICENSE`, the `license` field of the root, `desktop` and `shared` `package.json` files, `README.md`, `CONTRIBUTING.md`, `site/index.html`, `desktop/resources/THIRD-PARTY-NOTICES.md` and the About panel text.

Remaining licensing work that MIT does not resolve: the `adb` redistribution question and the missing `luck-node-mtp` copyright notice (below), full license texts in the notices file, and a transitive-dependency license scan.

## 2. Direct dependencies (versions as installed)

Shipped inside the app (`app.asar`): `usb` 3.0.0 (MIT) with `@node-usb/usb-darwin-arm64` (MIT) and `@types/w3c-web-usb` (MIT, types only). The renderer's `react` 18.3.1, `react-dom` 18.3.1 (MIT) and `qrcode` 1.5.4 (MIT) are compiled into the renderer bundle.

Build and test tooling, not shipped: `electron` 42.5.0 (MIT), `electron-builder` 25.1.8 (MIT), `electron-vite` 5.0.0 (MIT), `vite` 6.4.3 (MIT), `@vitejs/plugin-react` (MIT), `tailwindcss` 3.4.19 (MIT), `postcss` (MIT), `autoprefixer` (MIT), `typescript` 5.9.3 (**Apache-2.0**), `playwright-core` 1.61.1 (**Apache-2.0**), `patch-package` (MIT), `@types/*` (MIT).

Native addon: `luck-node-mtp` 1.0.0 - **ISC** per its `package.json`. Its npm package contains **no license file or copyright line**, which ISC requires you to retain. Obtain the upstream copyright notice (https://github.com/lucksoft-yungui/luck-node-mtp) and add it to the notices; if upstream has none, contact the author. Its transitive build dependencies `node-addon-api` 1.7.2 (MIT), `node-gyp-build` 4.8.4 (MIT) and `shelljs` 0.8.5 (BSD-3-Clause) are not shipped. The repository also carries a local patch, `patches/luck-node-mtp+1.0.0.patch`, a modification of that ISC code; ISC permits this provided the notice is kept.

Transitive dependencies were not individually audited. Run a license scan (for example `npx license-checker --production`) before the first public release.

## 3. Bundled binaries and native libraries (release builds only)

These are copied into the packaged app by `desktop/scripts/bundle-native.sh`; they are **not** in the git repository (`desktop/resources/{adb,*.dylib,*.node}` are git-ignored).

| Component | License | Obligation / issue |
|---|---|---|
| Electron / Chromium (the runtime) | MIT, plus Chromium's many third-party licenses | Electron ships `LICENSE` and `LICENSES.chromium.html` inside the framework; keep them in the packaged app |
| libmtp | LGPL-2.1-or-later | Dynamic link retained; provide license text and a pointer to source (https://github.com/libmtp/libmtp) so users can relink |
| libusb | LGPL-2.1-or-later | As above (https://github.com/libusb/libusb) |
| `adb` (Google platform-tools) | Apache-2.0 source, but the downloaded **platform-tools binaries are distributed under the Android SDK License Agreement** | **Redistribution problem.** Section 3.4 of the agreement (https://developer.android.com/studio/terms) says you may not "copy ..., modify, adapt, redistribute" the SDK or any part of it. The `adb` staged from Homebrew's `android-platform-tools` cask is Google's binary. Options: (a) obtain written permission, (b) build `adb` from AOSP source (Apache-2.0, includes statically linked third-party libraries whose notices must then be shipped), or (c) stop bundling `adb` and require users to install platform-tools (the app already finds Homebrew, SDK and `DROIDWIRE_ADB` locations). **Do not publish a binary release that bundles Google's adb until this is resolved.** |
| `ffmpeg` | Not bundled | Optional, user-installed; nothing to ship |

The repository's source, without those binaries, does not redistribute any of them.

## 4. Artwork, fonts and assets

- **Logo / app icon / DMG art / `site/og-image.png`**: the mark is derived from the Android robot ("bugdroid"). Google permits reproduction and modification under **Creative Commons Attribution 3.0**, which requires the attribution line *"The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License."* (https://developer.android.com/distribute/marketing-tools/brand-guidelines). That line is now in the README, the notices and the landing page. The guidelines also forbid claiming trademark rights in the robot or derivatives, require the line "Android is a trademark of Google LLC" wherever the name is used, and say app names should read "X for Android", not "Android X".
- **Name**: "Droidwire" contains "Droid", which is a registered trademark in some jurisdictions. This is a legal question for the owner, not something this inventory can settle; consider a clearance check before wider promotion.
- **Fonts**: none are bundled or fetched. The UI names Inter then falls back to system fonts.
- **Icons in the UI**: inline SVG written for this project; no icon library.
- `desktop/resources/icon.png`, `logo.png`, `site/logo.png`, `desktop/src/renderer/assets/logo.png`: all the same mark at different sizes; no personal information is embedded in any tracked image (checked visually).

## 5. Existing notices

`desktop/resources/THIRD-PARTY-NOTICES.md` (shown in-app under Droidwire > Licenses and copied into the app bundle) used to say "Droidwire is proprietary software"; it now states the MIT license and carries the Android-robot attribution. It still lacks the luck-node-mtp copyright line, full LGPL/MIT/Apache texts, and source offers beyond links.
