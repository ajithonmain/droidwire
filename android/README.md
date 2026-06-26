# @droidwire/android

React Native app that runs an HTTP file server on the Android device over USB tethering.

## Behavior

- Starts HTTP server on port `8765` at launch
- Displays server status and USB tethering IP
- Requests `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`
- Serves from `/storage/emulated/0/`
- Keeps screen awake while server is running
- Shows live transfer progress

## Structure

```
src/
  server/    # HTTP server setup, route handlers
  screens/   # React Native screens (status, permissions)
  utils/     # File system helpers via react-native-fs
```

## Run

```bash
npm install
npx react-native run-android
```
