# Manual hardware verification checklist

Automated tests use fake devices; they cannot prove behaviour on a real phone. Work through the sections that apply and record the result with the phone model, Android version, Droidwire version and connection mode. Use disposable files - several steps delete, move or overwrite.

**Test files to create on the phone** (in `/sdcard/DroidwireTest/`): `plain.txt`; `with space.txt`; `it's a "quote".txt`; `semi;colon & amp $(x) `backtick`.txt`; `unicode-éü-日本.txt`; a folder named `My 'Photos'; test` containing a few files and a subfolder; a ~1 GB file; an `.apk`; a `.heic` or `.pdf`; a short `.mp3` and `.mp4`; an empty file.

## Recorded runs: 2026-10-07 to 2026-10-09 (one phone)

| | |
|---|---|
| Phone | Google Pixel 4a, Android 13 (API 33). **One** phone only. |
| Mac | Apple Silicon, macOS 26.6.2. Intel and macOS 12-25 not tested. |
| App | Droidwire 1.4.0, unsigned (ad-hoc sealed) build, run from the unpacked `desktop/release/mac-arm64/Droidwire.app` with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, a throwaway profile, offline. |
| Artifacts that were hardware-tested (a local build of the release configuration: **no MTP**). **These are not the files published on GitHub**; the published 1.4.0 files are the GitHub-built ones listed in the release notes, which were not run against a phone | `Droidwire-1.4.0-arm64.dmg` 123,919,810 bytes, sha256 `8bb38de0ac8dd21d5b711dd8bdc4ca2a0f032d536840e5e65440c1fbf4699868`; `Droidwire-1.4.0-arm64-mac.zip` 119,055,554 bytes, sha256 `3006b312d451c15d15d549d30bca4667913a8530ca4cd947f688879ed6ff3594`. **All earlier hashes (in older notes or reports) are superseded** - they belonged to builds that contained the MTP addon. |
| Harnesses | `desktop/driver-hw.mjs` (real main-process handlers, 50 checks, `--mode adb\|mtp`), `driver-hw-ui.mjs` (real renderer, `--mode adb\|mtp`), `driver-hw-extra.mjs` (>1 GB, previews), `driver-hw-unplug.mjs` (physical cable pull), `driver-hw-wifi.mjs` (Wi-Fi pairing, Wi-Fi-only transfers, drop/reconnect), `driver-hw-mtp-cancel.mjs` (MTP cancel/recovery). Hashes are computed outside the app (`shasum` on the Mac, `sha256sum` on the phone through the bundled adb). All work stayed in `Download/Droidwire-Test-<id>/` and uniquely named files created by the tests; they were removed afterwards. |

### Published-file runs (2026-10-09)

The GitHub-built files published as 1.4.0 and 1.4.1 were each extracted from their DMG (SHA256SUMS verified after download) and run with a minimal PATH, a throwaway profile and no network, against the same Pixel 4a (Android 13) and a Mac on macOS 26, using fixtures generated for the run in a dedicated phone folder (removed afterwards).

**First pass (superseded by the second pass below).** `driver-hw.mjs`: 50 of 50 on both versions. `driver-hw-ui.mjs`: 34 passed and 15 failed, identically on 1.4.0 and 1.4.1. These 15 failures were test-setup problems, not application defects (see the second pass); the first pass should not be read as a product failure.

**Second pass, published 1.4.1 only (diagnosis of the 15).** The 15 failures, their causes and retests:

| # | Check | Observed | Cause | Class | Retest |
|---|---|---|---|---|---|
| 1-3 | F: queue 6 downloads; cancel queued/active; pause/resume | rows `q1.bin`, `c1.bin`, `p1.bin` never appeared | Section F makes its 200 MB files from `big2.bin` in the folder the IPC harness (`driver-hw.mjs`) leaves behind under the **same `--stamp`**. I had deleted that folder and used different stamps, so the files were never created and the UI sat in a folder that did not exist | missing fixture / run-order error | pass (max 3 concurrent, others Queued, hashes match; queued and active cancel; pause then resume restarts and completes) |
| 4 | I: close window during a download | `c1.bin` row not found | same as 1-3 (cascade) | missing fixture | pass (app survives, `activate` reopens a window, no `.part`, no stray adb) |
| 5 | I: quit during a download | first "test premise: a pull should be running" (same cause); once fixed, "leftover processes" listed the shell that launched the script | `pgrep -f` matched the launching shell, whose command line names the app and adb | missing fixture, then harness defect (fixed: only processes executed from the app bundle count) | pass |
| 6 | R: rename to a name with a double quote | `victim.txt` row not found | cascade from the earlier failure: the app was left in a non-existent folder | harness cascade | pass; the app shows "Android does not allow \" in file names..." and the original file survives |
| 7-10 | P: upload doc.pdf, tone.mp3, tone.m4a, photo.heic | "path argument must be of type string, received null" | the preview fixtures (`--extra <dir>`) were not supplied | missing fixture | pass with generated fixtures (PDF written by hand, MP3/M4A by ffmpeg, HEIC by `sips`) |
| 11-14 | P: preview panels for those four files | file rows not found | consequence of 7-10 | missing fixture | pass; screenshots inspected (PDF renders its text, HEIC renders a 1200x1200 image, both audio files get a player) |
| 15 | K: upload to the storage root and download back | "uploaded file not found; breadcrumb 0 items" | two harness faults: it ran inside the combined run after the app had navigated into a test folder (its premise is a fresh launch at the root), and it dropped the file before the phone had been detected | harness defect (fixed: waits for the connected phone; only runs when requested alone with `--section k`) | pass standalone |

Harness changes (no assertion was weakened): `driver-hw-ui.mjs` runs the quit-during-download section last (it ends the app, so the sections after it died with "page closed"), seeds its own payloads, filters leftover-process detection to the app bundle, waits for the phone in section K and runs K only on request; `driver-hw-wifi.mjs` uses the toolbar "Add device" menu when a USB phone is already connected (the setup screen it expected is not shown then).

**Results on the published 1.4.1 files:** `driver-hw.mjs` 50 of 50; `driver-hw-ui.mjs` full run 48 passed (sections A-H, R, P, I) and 1 failed, the K check, which fails in a full run because its premise (a fresh launch at the storage root) is violated there; K standalone 1 of 1. K was then changed to run only when requested alone. **Final harness run (2026-10-09, same Pixel 4a, published 1.4.1 DMG re-downloaded and verified against SHA256SUMS, fresh phone folder):** `driver-hw.mjs` 50 of 50; `driver-hw-ui.mjs` complete run as one command 48 passed, 0 failed (sections A-H, R, P, I); Section K standalone from a fresh launch 1 of 1; `driver-hw-wifi.mjs` 16 of 16 (QR pairing through the app, USB cable removed so only the wireless device remained, 32 MB and 300 MB round trips at 6-9 MB/s, folder zip, cancel of an active upload and download, Wi-Fi switched off and on: failure detected, automatic reconnect). **No application defect was found.** The published 1.4.0 files were not re-run on the second pass; their first-pass results were identical to 1.4.1, so the same diagnosis applies by inspection only.

Everything above this section describes earlier local builds; this section is the only hardware evidence for published files, and the second pass supersedes the first.

### Connection modes

| Mode | Status in 1.4.0 | Evidence on the hardware-tested build (not the published files; see above) |
|---|---|---|
| **USB (ADB)** | **Supported. Verified** | IPC suite 50/50; UI suites 38/38 (startup, browse, upload/download, conflicts, file operations, previews, cancel/queue/pause, menu bar, Open & Edit, filename validation) and 9/9 (window close and quit mid-transfer); the larger runs on earlier builds (below) still apply: the changes since only removed MTP and touched MTP-only code. |
| **Wi-Fi (wireless ADB)** | **Supported. Verified, with the limits below** | 16/16 on the final artifact (phone already paired, connected with the app's Connect call, USB cable pulled, Wi-Fi switched off and on by hand, automatic reconnect). An earlier run of the same artifact scored 15/16: the reconnect did not happen because **Android had switched Wireless debugging off by itself** after the Wi-Fi drop (the phone still answered ping but announced no `_adb-tls-connect` service); once it is on again Droidwire reconnects. QR pairing 16/16 on a previous build. |
| **MTP** | **Not shipped (deferred)** | The release contains no MTP addon, libmtp or worker (checked in the app, the `.zip` and the `.dmg`); the picker shows MTP as deferred and the main process refuses it. Earlier partial evidence for the MTP *code* is kept below as history. |

### USB (ADB) - passed

Startup and phone detection; device name, battery, storage; browse and navigate; upload (Copy and Move - the local file is deleted only after success) and download with byte-exact hashes (32 MB binary, empty, text, PNG, MP4); awkward names (spaces, apostrophes, Unicode, `;`, `&`, `$()`, backticks) literal with no command executed; conflict choices Replace / Keep Both / Cancel for upload, download, paste and menu-bar drops (Cancel changed nothing); rename, new folder, copy, cut-move, delete; text, image, PDF, MP3/M4A and HEIC previews **rendered in the UI and inspected** (PDF shows its text, MP3 a working player, HEIC the image; M4A only checked for an audio element); video poster frame from the bundled AVFoundation helper with no ffmpeg; folder ZIP of `My 'Photos'; test` (no leftovers); Open & Edit save-back (`.command` refused); menu bar upload and conflict prompt; queue of 6 x 200 MB downloads (never more than 3 active, all hashes correct); cancel of an active and a queued download, an active 300 MB upload and an active folder ZIP (no partial files); pause then resume restarts from zero as documented; failures with clear messages; closing the window or quitting mid-transfer leaves no processes or `.part` files; a **1.29 GB** upload and download with matching hashes (about 34 MB/s); a download started from the storage root (where the browser lands after a reconnect) with the destination taken from the app's current path.

**Physical unplug/replug (really pulled the cable, four uploads running or queued, one a Move upload):** every transfer ended in a clear error within about a second; the UI showed "No device"; the local Move source was kept; no adb processes remained; the app reconnected about one second after the cable returned without a restart and browsing worked; a fresh upload then verified by hash. After a reconnect the browser resets to the storage root, so the next transfer targets the root.

### Wi-Fi (wireless ADB) - 16/16 passed, twice (second time on the final artifact)

QR pairing through Droidwire's own screen (events waiting, pairing, connecting, connected); the paired device is an `ip:port` entry with no `usb:` field; with the USB cable pulled adb listed only that device, and these were hash-verified over Wi-Fi: 32 MB, 300 MB (about 8 MB/s, versus about 34 MB/s over USB), awkward-name files, a video, a folder ZIP; cancel of an active 300 MB upload and download (terminal state, no partial files, a fresh transfer worked afterwards); a real Wi-Fi drop (switched off on the phone) was detected, the UI left "Connected", a transfer failed cleanly; and when Wi-Fi returned the app reconnected on its own.

**Fixed because of this run:** the bundled adb has no mDNS support, so the QR flow never saw the phone ("pairing circles forever") and a dropped phone was never reconnected. Discovery now uses macOS `dns-sd`; reconnect is limited to phones connected to in the same session and requires the same hardware serial as well as the IP.

**Unverified:** pairing by 6-digit code (manual entry); reconnect after an app restart (not implemented: use the Connect field); macOS Local Network permission prompt on a clean Mac; two phones. **Observed:** Android may turn Wireless debugging off by itself when Wi-Fi drops; Droidwire cannot reconnect until it is turned on again.

### MTP - history only (the MTP code is not part of the release)

Passed on the phone (48/50 on a rebuilt package): detection, browse, upload and download with matching hashes, awkward names, rename, copy, real moves between folders, folder ZIP, missing-file / bad-destination / bad-path errors, a cancelled upload and a cancelled download that recovered, and recovery from a failed operation (bug fixed: a stale session blocked every later call). Expected and documented: no battery or storage figures, no video thumbnails over MTP.

**Failed on hardware:** cancelling an active **download** was not honoured within 8 seconds, the worker was force-killed and the phone's MTP session stayed dead until the cable was replugged (it happened again in a later run). Cause (probable, not proven): libmtp winds a cancelled download down slowly. Mitigation shipped: the grace period is now 120 s and replaces the quiet timer for a cancelled call; the UI shows **Cancelling…** until the phone has really let go; a force-stop marks the session stuck and new MTP operations are refused with replug instructions. **Not re-tested on hardware.** MTP is therefore not shipped in 1.4.0.

**Unverified:** that the 120 s grace works on a real phone; folder-ZIP cancel; repeated cancel rounds; the MTP UI conflict dialogs (Replace / Keep Both / Cancel); Android filename validation over MTP (unit-tested, not on hardware). The MTP UI harness previously could not find the connection picker; it now classifies HARNESS vs TRANSPORT failures (the missing button was never shown to be a phone problem).

### Not verified (needs other hardware or credentials)

Two phones at once and device switching with queued work (automated binding tests only); Intel; macOS 12-25 runtime; Developer ID signing, notarization and hardened-runtime behaviour (including the MTP worker); other phones and Android versions; a real camera video; thousands-of-items folder listings; APK install, device tools, storage analyzer.

## Clean-Mac install (do this first, on the packaged `.dmg`)

- [ ] On a Mac without Homebrew or Android tools (or a fresh user account with `PATH` stripped), install from the `.dmg` and open the app (clearing quarantine if the build is unsigned). No installer, dependency prompt or sign-up appears.
- [ ] Help > Copy Diagnostics reports `adb ... [bundled]`, `mtp: available`, and a native thumbnail helper.
- [ ] A phone that has not authorized the Mac shows "Your phone has not authorized this Mac yet" with the tap-Allow instruction; after allowing, it connects without restarting the app.
- [x] Toggle View > Toggle Menu Bar Panel (or click the tray icon) and upload a file from the menu bar panel.
- [ ] Video thumbnails appear for phone-camera MP4/MOV files with no ffmpeg installed. (Verified only with a small synthetic H.264 MP4; a real camera clip is untested.)

## All modes

- [x] Fresh profile: app opens straight to the connection picker with no sign-up screen and no personal-data prompt. (with a phone attached the app goes straight to the device)
- [x] Browse into every test folder; names with spaces, quotes, `;`, `&`, `$()`, backticks and non-Latin characters list correctly and open.
- [x] Download each awkward file name; the file on the Mac has identical content (compare checksums) and the right name.
- [x] Upload each awkward name from Finder (drag) and via the picker; compare checksums on the phone side or by downloading back.
- [x] Download a folder as .zip (the `My 'Photos'; test` folder). Open the zip: it has the folder as its top-level entry, with the subfolder and files intact. Confirm no `.droidwire-zip-*` file remains in `/sdcard/` and no `droidwire-zip-*` directory remains in the Mac's temp dir.
- [x] Preview: text file shows its first lines; `.json`/`.sh` as text; image, audio and HEIC/PDF thumbnail render; the empty file shows the generic icon. (text, PNG, MP4 poster verified; empty-file icon, audio, HEIC/PDF not)
- [x] Conflicts: download and upload a file that already exists - Replace, Keep both, Cancel, and "apply to all" each behave; Cancel changes nothing.
- [x] Copy, then paste into another folder; paste into the same folder (keeps both with a numbered name).
- [x] Cut and paste into another folder (file and folder); drag a file onto a sidebar folder/tab. The item **moves** (is gone from the source). Repeat with a name that collides: Replace overwrites, Keep both lands as `name (1)`.
- [x] Rename a file and a folder (including to a name with a quote). (quote-containing names are refused by Android itself; now explained)
- [x] Cancel a large download mid-way; the transfer shows cancelled, no partial file or `.part-*` file remains, an existing file of the same name is untouched. Repeat for a large upload and for a folder zip.
- [x] Queue 6+ downloads; at most three run at once; pause/resume a download; reorder queued ones. (queue, cancel, pause/resume verified; reorder not)
- [ ] Upload with **Move** (not Copy): the local file is deleted only after the push succeeds; unplug the phone mid-upload and confirm the local file is **kept** and the batch finishes (no spinner forever).
- [x] Open & Edit a text file: change and save in the Mac app, confirm the new content reaches the phone; a file named `x.command` is refused.
- [ ] Unplug the cable mid-transfer and mid-listing: the UI shows disconnected, the transfer shows an error, nothing crashes; replug and the device returns without restarting the app.
- [x] Quit during a transfer: no `adb` or `Droidwire ... mtp-worker` processes remain (`pgrep -fl adb`, `pgrep -fl mtp-worker`).
- [ ] Help > Show Logs in Finder opens `main.log`; it has no stack traces from the steps above.

## USB (ADB)

- [ ] Phone with USB debugging off: setup guide appears; after enabling and accepting the RSA prompt the phone connects.
- [ ] Device tools: info, battery, apps list, APK export, storage analyzer; install an APK from the file browser.
- [ ] Folder sizes appear in list view; video poster frames appear if `ffmpeg` is installed.
- [ ] Phone *without* an on-device `zip` (most phones): folder zip still works via the fallback.

## Wi-Fi (wireless ADB, Android 11+)

- [ ] Pair with the 6-digit code; connect with IP:port; pairing with a wrong code reports an error.
- [ ] Pair via QR code; cancel the dialog mid-way - no pairing loop keeps running.
- [ ] Turn Wi-Fi off on the phone mid-transfer: error shown, reconnect works.
- [ ] Same phone over USB and Wi-Fi: appears once; ejecting a Wi-Fi device disconnects it.

## MTP

- [ ] With the phone in File Transfer mode and Android File Transfer / OpenMTP closed, the device connects; with the phone locked or in charge-only mode a clear message appears.
- [ ] List a folder with thousands of items (slow but completes); cancel a download - the next operation reconnects cleanly.
- [ ] Move a file between two folders (direct), a folder between folders, and a file with a colliding name (Keep both and Replace). Check for leftover `.droidwire-*` objects on the phone afterwards. If the phone refuses, the message explains moving may be unsupported and nothing is lost.
- [ ] Replace an existing file by upload: if you kill the cable mid-upload the original is still there.
- [ ] Upload into the storage root; create a folder in the root.

## Multiple devices and switching

- [ ] Two phones connected (ADB): switch the active phone while downloads and uploads are queued or running. Every transfer completes against the phone it was started for (verify file contents/destination), and the browser resets to the new phone's root.
- [ ] Open a preview or Open & Edit on phone A, switch to B, open the same path: each shows its own content and edit sessions sync to their own phone.
- [ ] Start an ADB download, switch to MTP mode, and confirm the ADB download still finishes from the ADB phone.
- [ ] Eject one phone of two: the other stays usable.
