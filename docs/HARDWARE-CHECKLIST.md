# Manual hardware verification checklist

Automated tests use fake devices; they cannot prove behaviour on a real phone. Work through the sections that apply and record the result with the phone model, Android version, Droidwire version and connection mode. Use disposable files - several steps delete, move or overwrite.

**Test files to create on the phone** (in `/sdcard/DroidwireTest/`): `plain.txt`; `with space.txt`; `it's a "quote".txt`; `semi;colon & amp $(x) `backtick`.txt`; `unicode-éü-日本.txt`; a folder named `My 'Photos'; test` containing a few files and a subfolder; a ~1 GB file; an `.apk`; a `.heic` or `.pdf`; a short `.mp3` and `.mp4`; an empty file.

## Clean-Mac install (do this first, on the packaged `.dmg`)

- [ ] On a Mac without Homebrew or Android tools (or a fresh user account with `PATH` stripped), install from the `.dmg` and open the app (clearing quarantine if the build is unsigned). No installer, dependency prompt or sign-up appears.
- [ ] Help > Copy Diagnostics reports `adb ... [bundled]`, `mtp: available`, and a native thumbnail helper.
- [ ] A phone that has not authorized the Mac shows "Your phone has not authorized this Mac yet" with the tap-Allow instruction; after allowing, it connects without restarting the app.
- [ ] Toggle View > Toggle Menu Bar Panel (or click the tray icon) and upload a file from the menu bar panel.
- [ ] Video thumbnails appear for phone-camera MP4/MOV files with no ffmpeg installed.

## All modes

- [ ] Fresh profile: app opens straight to the connection picker with no sign-up screen and no personal-data prompt.
- [ ] Browse into every test folder; names with spaces, quotes, `;`, `&`, `$()`, backticks and non-Latin characters list correctly and open.
- [ ] Download each awkward file name; the file on the Mac has identical content (compare checksums) and the right name.
- [ ] Upload each awkward name from Finder (drag) and via the picker; compare checksums on the phone side or by downloading back.
- [ ] Download a folder as .zip (the `My 'Photos'; test` folder). Open the zip: it has the folder as its top-level entry, with the subfolder and files intact. Confirm no `.droidwire-zip-*` file remains in `/sdcard/` and no `droidwire-zip-*` directory remains in the Mac's temp dir.
- [ ] Preview: text file shows its first lines; `.json`/`.sh` as text; image, audio and HEIC/PDF thumbnail render; the empty file shows the generic icon.
- [ ] Conflicts: download and upload a file that already exists - Replace, Keep both, Cancel, and "apply to all" each behave; Cancel changes nothing.
- [ ] Copy, then paste into another folder; paste into the same folder (keeps both with a numbered name).
- [ ] Cut and paste into another folder (file and folder); drag a file onto a sidebar folder/tab. The item **moves** (is gone from the source). Repeat with a name that collides: Replace overwrites, Keep both lands as `name (1)`.
- [ ] Rename a file and a folder (including to a name with a quote).
- [ ] Cancel a large download mid-way; the transfer shows cancelled, no partial file or `.part-*` file remains, an existing file of the same name is untouched. Repeat for a large upload and for a folder zip.
- [ ] Queue 6+ downloads; at most three run at once; pause/resume a download; reorder queued ones.
- [ ] Upload with **Move** (not Copy): the local file is deleted only after the push succeeds; unplug the phone mid-upload and confirm the local file is **kept** and the batch finishes (no spinner forever).
- [ ] Open & Edit a text file: change and save in the Mac app, confirm the new content reaches the phone; a file named `x.command` is refused.
- [ ] Unplug the cable mid-transfer and mid-listing: the UI shows disconnected, the transfer shows an error, nothing crashes; replug and the device returns without restarting the app.
- [ ] Quit during a transfer: no `adb` or `Droidwire ... mtp-worker` processes remain (`pgrep -fl adb`, `pgrep -fl mtp-worker`).
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
