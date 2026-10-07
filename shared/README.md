# @droidwire/shared

TypeScript types shared by the Electron main process, the preload script and the React renderer. No runtime code and no constants.

- `types.ts` - data shapes: `FileNode`, `StorageInfo`, `TransferProgress`, `DeviceContext`, `PreviewResult`, `UpdateCheckResult`, `AppSettings`, device-tool types, `ConnectionStatus`. Re-exports `api.ts`.
- `api.ts` - `DroidwireAPI`, the complete typed surface exposed to the renderer as `window.droidwire`. The preload script implements it and the renderer consumes it, so a change to one side fails type-checking on the other.

Imported as `@droidwire/shared` (a path alias to `shared/types.ts` in the desktop tsconfig files and `electron.vite.config.ts`).
