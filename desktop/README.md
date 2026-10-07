# @droidwire/desktop

The Droidwire macOS app: Electron (electron-vite) + React 18 + TypeScript (strict) + Tailwind. See the [root README](../README.md) for what the app does, installation and the architecture overview; this file covers working in this package.

## Layout

| Path | Role |
|---|---|
| `src/main/` | Main process: app lifecycle, windows, IPC handlers (`ipc/`), ADB and MTP transports, native-worker supervision |
| `src/main/lib/` | Pure helpers with no Electron dependency (shell quoting, parsing, validation, versions). Fully unit-tested |
| `src/preload/index.ts` | `contextBridge` bridge. Implements `DroidwireAPI` from `shared/api.ts` |
| `src/renderer/` | React UI (`components/`, `hooks/`, `lib/`) |
| `resources/` | `mtp-worker.cjs`, `THIRD-PARTY-NOTICES.md`, icon. `adb`, `*.dylib` and `*.node` are staged here by `scripts/bundle-native.sh` and are git-ignored |
| `test/` | Unit tests (`node --test`, TypeScript run directly by Node >= 22.18) |
| `driver.mjs` | Headless smoke test of the built app (Playwright) |
| `scripts/bundle-native.sh` | Stages the pinned native toolchain output (adb, libusb, libmtp, thumbnail helper) and the MTP addon into `resources/` |
| `scripts/dist.mjs`, `after-pack.cjs` | Packaging with explicit signing mode; ad-hoc seal for unsigned builds |
| `scripts/check-package.mjs` | Fails the build on missing/unrunnable bundled components |
| `../native/` | Pinned-source build of adb, libusb, libmtp and the AVFoundation thumbnail helper |

## Commands

```bash
npm run dev         # electron-vite dev server with hot reload
npm run build       # production build into out/
npm run typecheck   # renderer + main/preload/tests
npm test            # unit tests
npm run verify      # typecheck, tests, build
npm run smoke       # run after `build`: launches the app offline with a temp profile
npm run dist        # build + stage native binaries + electron-builder -> release/
```

Install dependencies from the repository root with `node scripts/bootstrap.mjs`. The `dev`/`electron`/`smoke` scripts deliberately use `env -u ELECTRON_RUN_AS_NODE`; do not remove it.

## Conventions

- Relative imports in `src/main` include the `.ts` extension so tests can load modules directly under Node. Vite and `tsc` accept this.
- Keep `src/main/lib` and the cores (`mtp-transport-core`, `zip-folder`, `stream-server`, `mtp-worker-host`) free of Electron imports; inject effects instead. That is what makes them testable without a phone.
- Syntax must stay erasable (no enums, namespaces or constructor parameter properties in main-process code); `erasableSyntaxOnly` enforces it.
- New IPC handlers validate every argument and take an optional trailing `DeviceContext`; add the method to `shared/api.ts` first.
