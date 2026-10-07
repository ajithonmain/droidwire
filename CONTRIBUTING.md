# Contributing to Droidwire

Thanks for helping. Droidwire is a macOS Electron app that manages Android files over USB ADB, wireless ADB and MTP. Read the [README](README.md) architecture section first.

## Setup

Requirements: macOS 12+, Node.js 22.18+ (24 LTS recommended), Xcode command line tools. For MTP work also `brew install libmtp libusb`; for packaging also an `adb` binary.

```bash
git clone https://github.com/ajithonmain/droidwire.git
cd droidwire
node scripts/bootstrap.mjs   # see README for why this replaces plain `npm install`
npm run verify
npm run desktop:dev
```

If you are developing without libmtp, the app still runs; MTP reports itself unavailable. Always launch Electron through the npm scripts - they unset `ELECTRON_RUN_AS_NODE`, which breaks the app when set.

## Verifying a change

Run these before opening a pull request:

```bash
npm run verify                          # typecheck + unit tests + production build
npm --prefix desktop run smoke          # optional: headless launch, no network
```

CI runs `verify` (and a best-effort smoke test) on a macOS runner. **CI has no phone attached**, so it proves nothing about real USB, wireless or MTP transfers. Anything that touches transport, transfer, move/rename, zip or preview behaviour should also be tried on hardware; say in the PR which phone and connection mode you used, or that you could not.

## Conventions

- TypeScript strict, no `any`. Match the surrounding code's naming, comment density and idiom.
- **Renderer** code never imports Node or Electron. All device and file access goes through `window.droidwire`; add the method to `shared/api.ts`, implement it in `src/preload/index.ts`, and handle it in `src/main/ipc/`.
- **Every IPC argument is untrusted**: validate it (see `src/main/lib/ipc-validate.ts`, `paths.ts`).
- **Remote paths and names are hostile input.** Anything placed in an `adb shell` command must go through `shQuote()`. Local destination names go through `safeFileName()` / `joinInside()`.
- **Carry the device.** Work that is queued or long-running must carry the `DeviceContext` captured when it was requested. Never read "the active device" mid-operation.
- Local paths with `path.join`; remote (device) paths are POSIX strings.
- Keep Electron imports out of `src/main/lib` and the testable cores; inject effects. Add a unit test for each bug you fix and each new pure helper.
- No emojis in code or comments. Icons are inline SVG.
- Commit messages: Conventional Commits style (`fix(desktop): ...`).

## Hardware testing and bug reports

A useful hardware bug report includes:

1. Droidwire version (Droidwire menu > About) and macOS version/chip.
2. **Connection mode** (USB, Wi-Fi, MTP) and the phone model and Android version.
3. Exact steps, including file or folder names with spaces, quotes or non-Latin characters if relevant.
4. What you expected and what happened.
5. The relevant lines from the log (**Help > Show Logs in Finder**, `main.log`). The log can contain file names and paths from your phone - redact anything private.

The manual verification checklist for ADB, wireless ADB and MTP (disconnects, switching devices, conflicts, cancellation, awkward file names) is in [docs/HARDWARE-CHECKLIST.md](docs/HARDWARE-CHECKLIST.md). Reports saying "worked on X" are as valuable as failures; they feed the verified-device list.

## Scope

Out of scope by design: Windows/Linux clients, cloud sync, iOS, an Android-side app, and any account or registration system.

## Licensing of contributions

Droidwire is licensed under the [MIT License](LICENSE). By submitting a contribution you agree that it is licensed under the same terms, and that you have the right to submit it. Do not contribute code you do not have the right to relicense under MIT.
