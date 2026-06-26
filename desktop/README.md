# @droidwire/desktop

Electron + React Mac client for browsing and transferring files from an Android device over USB tethering.

## Behavior

- Auto-detects Android at `192.168.42.x:8765` and `192.168.43.x:8765` on launch
- File browser: folder tree left, file grid right
- Downloads to `~/Downloads/Droidwire/`
- Drag-drop upload to current path
- Real-time progress per file + overall speed (MB/s) + ETA
- Auto-reconnect every 3s on connection loss

## Structure

```
src/
  main/      # Electron main process (file I/O, IPC handlers)
  renderer/  # React UI (file browser, transfer panel)
  preload/   # contextBridge IPC definitions
```

## Run

```bash
npm install
npm run dev       # Vite dev server
npm run electron  # Launch Electron

npm run dist      # Build .dmg
```
