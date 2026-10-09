#!/bin/bash
# Stage the native components into desktop/resources/ so electron-builder can
# ship them inside the app:
#
#   adb                  built from AOSP source        (native/build.sh)
#   libusb               LGPL shared library, used by adb (native/build.sh)
#   droidwire-thumb      AVFoundation video thumbnails (native/thumb)
#   licenses             texts + provenance for the above
#
# The release configuration does NOT stage MTP: no luck-node-mtp addon, no libmtp. They are staged (and the
# addon rebuilt against our libmtp) only with DROIDWIRE_BUNDLE_MTP=1, which is not the release configuration:
#   luck-node-mtp.node   MTP addon, built against libmtp  (this script, opt-in)
#   libmtp               LGPL shared library              (native/build.sh, opt-in)
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

BUNDLE_MTP="${DROIDWIRE_BUNDLE_MTP:-0}"

fail() { echo "error: $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "packaging is only supported on macOS"
REQUIRED_FROM_PREFIX="bin/adb lib/libusb-1.0.0.dylib"
[ "$BUNDLE_MTP" = "1" ] && REQUIRED_FROM_PREFIX="$REQUIRED_FROM_PREFIX lib/libmtp.9.dylib"
for f in $REQUIRED_FROM_PREFIX; do
  [ -f "$PREFIX/$f" ] || fail "$PREFIX/$f is missing - build the native toolchain first: bash native/build.sh (MTP builds: DROIDWIRE_BUILD_LIBMTP=1 bash native/build.sh)"
done
[ -f "$THUMB" ] || fail "$THUMB is missing - run: bash native/build.sh (or native/thumb/build.sh)"

LIBUSB_FROM_ADB=$(otool -L "$PREFIX/bin/adb" | awk '/libusb/ {print $1; exit}')
[ -n "$LIBUSB_FROM_ADB" ] || fail "could not read adb's libusb install name"

cp -f "$PREFIX/lib/libusb-1.0.0.dylib"  "$RES/libusb-1.0.0.dylib"
cp -f "$PREFIX/bin/adb"                 "$RES/adb"
cp -f "$THUMB"                          "$RES/droidwire-thumb"
STAGED="libusb-1.0.0.dylib adb droidwire-thumb"

if [ "$BUNDLE_MTP" = "1" ]; then
  # The addon must link the libmtp we built, with the same deployment target.
  # (Rebuilt every time: it takes seconds and guarantees there is no stale link.)
  LIBMTP_PREFIX="$PREFIX" MACOSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" node "$ROOT/scripts/rebuild-mtp.mjs"
  NODE_SRC="$ROOT/node_modules/luck-node-mtp/build/Release/luck-node-mtp.node"
  [ -f "$NODE_SRC" ] || fail "$NODE_SRC missing after rebuild"
  LIBMTP_SRC=$(otool -L "$NODE_SRC" | awk '/libmtp/ {print $1; exit}')
  LIBUSB_FROM_MTP=$(otool -L "$PREFIX/lib/libmtp.9.dylib" | awk '/libusb/ {print $1; exit}')
  [ -n "$LIBMTP_SRC" ] && [ -n "$LIBUSB_FROM_MTP" ] || fail "could not read libmtp install names"
  cp -f "$NODE_SRC"                  "$RES/luck-node-mtp.node"
  cp -f "$PREFIX/lib/libmtp.9.dylib" "$RES/libmtp.9.dylib"
  STAGED="$STAGED luck-node-mtp.node libmtp.9.dylib"
else
  # Release configuration: make sure no MTP binary from an earlier MTP build is left lying in the staging folder
  rm -f "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib"
fi

for f in $STAGED; do chmod u+w "$RES/$f"; done
chmod +x "$RES/adb" "$RES/droidwire-thumb"

# Drop debug/local symbols: they carry this machine's absolute object-file paths
for f in $STAGED; do strip -S -x "$RES/$f" 2>/dev/null || true; done

install_name_tool -id     @loader_path/libusb-1.0.0.dylib                      "$RES/libusb-1.0.0.dylib"
install_name_tool -change "$LIBUSB_FROM_ADB"  @loader_path/libusb-1.0.0.dylib  "$RES/adb"
if [ "$BUNDLE_MTP" = "1" ]; then
  install_name_tool -change "$LIBMTP_SRC"       @loader_path/libmtp.9.dylib      "$RES/luck-node-mtp.node"
  install_name_tool -id     @loader_path/libmtp.9.dylib                          "$RES/libmtp.9.dylib"
  install_name_tool -change "$LIBUSB_FROM_MTP"  @loader_path/libusb-1.0.0.dylib  "$RES/libmtp.9.dylib"
fi

for f in $STAGED; do codesign -f -s - "$RES/$f"; done

# Licenses and provenance that travel with the binaries
DROIDWIRE_BUNDLE_MTP="$BUNDLE_MTP" node "$ROOT/scripts/license-inventory.mjs" --native-licenses "$PREFIX/licenses"

# Staged files must be relocatable, correctly typed and signed
bash "$ROOT/native/verify.sh" "$RES"
for f in $STAGED; do
  codesign --verify "$RES/$f" || fail "$f failed signature verification after patching"
done
# Prove the staged adb actually runs from where it will live
"$RES/adb" version | head -1

echo "staged into $RES/ (target macOS $DEPLOYMENT_TARGET, arm64; MTP: $([ "$BUNDLE_MTP" = "1" ] && echo included || echo "not included - release configuration"))"
