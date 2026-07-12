# Droidwire

Wired Android to Mac file transfer via USB tethering + HTTP. No MTP. No WiFi. Cable in, transfer starts.

```
Android (HTTP server) ──USB tethering──▶ Mac (Electron client)
                        192.168.x.x network
```

## Packages

| Package | Description |
|---------|-------------|
| `android/` | React Native app - runs HTTP server on device |
| `desktop/` | Electron + React Mac client - file browser + transfer UI |
| `shared/` | Shared TypeScript types and API constants |

## Dev Setup

```bash
npm install

# Android
cd android && npm install
npx react-native run-android

# Desktop
cd desktop && npm install
npm run dev
npm run electron
```

## Architecture

- Android serves files over HTTP on port `8765` via USB tethering IP (`192.168.42.x` / `192.168.43.x`)
- Mac client auto-detects the device by scanning those subnets on launch
- All transfers streamed in 1MB chunks - no full-file memory loading
