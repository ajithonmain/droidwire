# Baseline before beta preparation

Recorded from the code at commit `be08f90` (branch `main`) before the `open_source_works` changes. These are preparation notes for the maintainer; delete this folder before publishing if you prefer.

## Versions
- `package.json` (root) 1.1.0, `desktop/package.json` 1.2.1, landing page structured data `1.2.0-beta`, `shared` 1.0.0.
- `app.getVersion()` returns Electron's version when the app runs unpackaged, so About and the manual update dialog showed the wrong version in development; only the silent check used a workaround.
- Update check: any tag different from the running version counted as "newer".

## Commands
- Dev `cd desktop && npm run dev`; build `npm run build`; package `npm run dist` (build + `scripts/bundle-native.sh` + electron-builder); smoke `node driver.mjs` (hard-coded to one developer's home directory).
- No test, typecheck or CI scripts. `tsc -p tsconfig.node.json` failed (TS6307 composite file list, a mis-typed `usb.on`); root `tsconfig` referenced a non-existent `./android`; root workspaces listed `android`.

## Native dependencies and architecture
- `luck-node-mtp` 1.0.0 (N-API, ISC) needs libmtp + libusb at build time; root `postinstall` ran `patch-package` then a rebuild hard-coded to `/opt/homebrew`. The package's own `install` step (`node-gyp-build`) fails on a clean Apple Silicon Mac, so a fresh `npm ci` failed (reproduced).
- Built addon, libmtp and libusb are arm64; adb from Homebrew is universal. Only Apple Silicon was built or tested. Min macOS 12.
- `usb` 3.0.0 (prebuilt N-API). Electron 42.5.0 (pinned in `build.electronVersion`).
- `adb` lookup: bundled, `/opt/homebrew`, `/usr/local`, then PATH. `ffmpeg`: `/opt/homebrew`, `/usr/local`, `/usr/bin` (optional).
- `app.asar` was about 1.5 GB: the default file set swept in `desktop/release` and other folders.

## Existing tests
None. The Playwright driver launched the app and printed the page text; it asserted nothing.

## Network requests (before)
1. `POST firestore.googleapis.com/.../beta_signups?key=...` - email, timestamp, app version (on registration; retried on every launch until it succeeded).
2. `GET firestore.googleapis.com/.../messages?key=...` - remote announcements, every launch.
3. `GET api.github.com/repos/ajithonmain/droidwire-releases/releases/latest` - every launch and on demand.
4. Loopback `127.0.0.1:<random>` HTTP range server (video thumbnails).
5. Wireless ADB traffic to the phone (user-initiated).

## Locally persisted data (userData `~/Library/Application Support/@droidwire/desktop/`)
`settings.json` (download folder), `bookmarks.json`, `transfer-history.json`, `dismissedMessages.json`, `beta-signup.json` (email), Chromium profile data. Logs `~/Library/Logs/@droidwire/desktop/main.log`. Temp: `droidwire-preview`, `droidwire-vthumbs`, `droidwire-edit`, `droidwire-drag`, `droidwire-zip-*`.

## Defects that affected a public beta (all addressed on this branch; see CHANGELOG)
Unquoted zip command; text preview contract mismatch; MTP "move" was a rename; upload promise never settled on failure; queued work used whatever device was active at execution; preview/edit/thumbnail collisions across devices; naive version compare; `settings.json` overwritten by the download-dir setter; unvalidated persistence key used as a file name; arbitrary local file read/delete IPC; unauthenticated range server keyed by path; MTP worker restart race and hang-before-ready; sends to destroyed windows; 15 s timeout applied to edit-session pushes; ADB folder zip silently depended on a `zip` binary most phones lack.
