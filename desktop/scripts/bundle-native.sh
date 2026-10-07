#!/bin/bash
# Stage the native components into desktop/resources/ so electron-builder can
# ship them inside the app:
#
#   adb                  built from AOSP source        (native/build.sh)
#   libusb, libmtp       LGPL shared libraries         (native/build.sh)
#   luck-node-mtp.node   MTP addon, built against them (this script)
#   droidwire-thumb      AVFoundation video thumbnails (native/thumb)
#   licenses             texts + provenance for the above
#
# Nothing is taken from Homebrew or the PATH: the inputs are the outputs of
# `bash native/build.sh`, which compiles pinned sources for a fixed macOS
# deployment target. Library install names are rewritten to @loader_path so the
# app is relocatable, and each Mach-O is re-signed ad-hoc (required on arm64;
# electron-builder replaces these with the Developer ID signature when signing).
set -euo pipefail
cd "$(dirname "$0")/.."          # desktop/
ROOT="$(cd .. && pwd)"
RES=resources
OUT="${NATIVE_OUT:-$ROOT/native/.out}"
PREFIX="${NATIVE_PREFIX:-$OUT/prefix}"
THUMB="$OUT/thumb/droidwire-thumb"
# shellcheck source=../../native/versions.env
source "$ROOT/native/versions.env"

fail() { echo "error: $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "packaging is only supported on macOS"
for f in bin/adb lib/libusb-1.0.0.dylib lib/libmtp.9.dylib; do
  [ -f "$PREFIX/$f" ] || fail "$PREFIX/$f is missing - build the native toolchain first: bash native/build.sh"
done
[ -f "$THUMB" ] || fail "$THUMB is missing - run: bash native/build.sh (or native/thumb/build.sh)"

# The addon must link the libmtp we built, with the same deployment target.
# (Rebuilt every time: it takes seconds and guarantees there is no stale link.)
LIBMTP_PREFIX="$PREFIX" MACOSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" node "$ROOT/scripts/rebuild-mtp.mjs"
NODE_SRC="$ROOT/node_modules/luck-node-mtp/build/Release/luck-node-mtp.node"
[ -f "$NODE_SRC" ] || fail "$NODE_SRC missing after rebuild"

LIBMTP_SRC=$(otool -L "$NODE_SRC" | awk '/libmtp/ {print $1; exit}')
LIBUSB_FROM_MTP=$(otool -L "$PREFIX/lib/libmtp.9.dylib" | awk '/libusb/ {print $1; exit}')
LIBUSB_FROM_ADB=$(otool -L "$PREFIX/bin/adb" | awk '/libusb/ {print $1; exit}')
[ -n "$LIBMTP_SRC" ] && [ -n "$LIBUSB_FROM_MTP" ] && [ -n "$LIBUSB_FROM_ADB" ] || fail "could not read library install names"

cp -f "$NODE_SRC"                       "$RES/luck-node-mtp.node"
cp -f "$PREFIX/lib/libmtp.9.dylib"      "$RES/libmtp.9.dylib"
cp -f "$PREFIX/lib/libusb-1.0.0.dylib"  "$RES/libusb-1.0.0.dylib"
cp -f "$PREFIX/bin/adb"                 "$RES/adb"
cp -f "$THUMB"                          "$RES/droidwire-thumb"
chmod u+w "$RES"/luck-node-mtp.node "$RES"/*.dylib "$RES"/adb "$RES"/droidwire-thumb
chmod +x "$RES/adb" "$RES/droidwire-thumb"

# Drop debug/local symbols: they carry this machine's absolute object-file paths
strip -S -x "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib" "$RES/droidwire-thumb" 2>/dev/null || true

install_name_tool -change "$LIBMTP_SRC"       @loader_path/libmtp.9.dylib      "$RES/luck-node-mtp.node"
install_name_tool -id     @loader_path/libmtp.9.dylib                          "$RES/libmtp.9.dylib"
install_name_tool -change "$LIBUSB_FROM_MTP"  @loader_path/libusb-1.0.0.dylib  "$RES/libmtp.9.dylib"
install_name_tool -id     @loader_path/libusb-1.0.0.dylib                      "$RES/libusb-1.0.0.dylib"
install_name_tool -change "$LIBUSB_FROM_ADB"  @loader_path/libusb-1.0.0.dylib  "$RES/adb"

codesign -f -s - "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib" "$RES/adb" "$RES/droidwire-thumb"

# Licenses and provenance that travel with the binaries
node "$ROOT/scripts/license-inventory.mjs" --native-licenses "$PREFIX/licenses"

# Staged files must be relocatable, correctly typed and signed
bash "$ROOT/native/verify.sh" "$RES"
for f in luck-node-mtp.node libmtp.9.dylib libusb-1.0.0.dylib adb droidwire-thumb; do
  codesign --verify "$RES/$f" || fail "$f failed signature verification after patching"
done
# Prove the staged adb actually runs from where it will live
"$RES/adb" version | head -1

echo "staged into $RES/ (target macOS $DEPLOYMENT_TARGET, arm64)"
