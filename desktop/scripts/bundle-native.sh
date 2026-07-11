#!/bin/bash
# Stage native binaries into resources/ so electron-builder can ship them.
# The packaged app must not depend on homebrew being installed on the
# tester's machine, so libmtp + libusb are copied next to the .node addon
# and every install name is rewritten to @loader_path. install_name_tool
# invalidates code signatures, so each patched Mach-O is re-signed ad-hoc
# (required on arm64 even for unsigned apps).
set -euo pipefail
cd "$(dirname "$0")/.."

RES=resources
NODE_SRC=../node_modules/luck-node-mtp/build/Release/luck-node-mtp.node

[ -f "$NODE_SRC" ] || { echo "error: $NODE_SRC missing — run npm install at repo root first" >&2; exit 1; }

# Discover the exact homebrew paths the addon was linked against rather
# than hardcoding a brew prefix.
LIBMTP_SRC=$(otool -L "$NODE_SRC" | awk '/libmtp/ {print $1; exit}')
[ -f "$LIBMTP_SRC" ] || { echo "error: libmtp dylib not found at $LIBMTP_SRC" >&2; exit 1; }
LIBUSB_SRC=$(otool -L "$LIBMTP_SRC" | awk '/libusb/ {print $1; exit}')
[ -f "$LIBUSB_SRC" ] || { echo "error: libusb dylib not found at $LIBUSB_SRC" >&2; exit 1; }

cp -f "$NODE_SRC" "$RES/luck-node-mtp.node"
cp -f "$LIBMTP_SRC" "$RES/libmtp.9.dylib"
cp -f "$LIBUSB_SRC" "$RES/libusb-1.0.0.dylib"
chmod u+w "$RES"/luck-node-mtp.node "$RES"/*.dylib

install_name_tool -change "$LIBMTP_SRC" @loader_path/libmtp.9.dylib "$RES/luck-node-mtp.node"
install_name_tool -id @loader_path/libmtp.9.dylib "$RES/libmtp.9.dylib"
install_name_tool -change "$LIBUSB_SRC" @loader_path/libusb-1.0.0.dylib "$RES/libmtp.9.dylib"
install_name_tool -id @loader_path/libusb-1.0.0.dylib "$RES/libusb-1.0.0.dylib"

codesign -f -s - "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib"

# adb: standalone universal binary (links only system frameworks), copied
# as-is. adbBin() in adb-transport.ts already prefers resourcesPath/adb.
ADB_SRC=$(readlink -f "$(command -v adb)" 2>/dev/null || true)
[ -f "$ADB_SRC" ] || { echo "error: adb not found on PATH — brew install android-platform-tools" >&2; exit 1; }
cp -f "$ADB_SRC" "$RES/adb"
chmod +x "$RES/adb"

echo "staged into $RES/:"
otool -L "$RES/luck-node-mtp.node" | sed -n '2,4p'
echo "adb: $(lipo -archs "$RES/adb" 2>/dev/null || echo unknown)"
