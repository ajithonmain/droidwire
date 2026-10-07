#!/bin/bash
# Stage native binaries into resources/ so electron-builder can ship them.
#
# The packaged app must not depend on Homebrew (or anything else) being
# installed on the user's machine, so libmtp + libusb are copied next to the
# .node addon and every install name is rewritten to @loader_path.
# install_name_tool invalidates code signatures, so each patched Mach-O is
# re-signed ad-hoc (required on arm64 even for unsigned apps).
#
# Requirements on the BUILD machine:
#   * the addon built:      npm run rebuild:mtp   (needs libmtp + libusb, see README)
#   * an adb binary, unless BUNDLE_ADB=0:
#                           brew install android-platform-tools, the Android SDK
#                           platform-tools, or ADB_BIN=/path/to/adb
#
# BUNDLE_ADB=0 stages no adb. Google's platform-tools binaries are distributed
# under the Android SDK License, which restricts redistribution (see
# docs/LICENSING.md), so public release builds omit it: the app then uses an
# adb installed on the user's Mac (Homebrew, Android SDK, or DROIDWIRE_ADB).
# Not bundled: ffmpeg (video thumbnails are an optional extra; the app looks for
# an installed ffmpeg and falls back to a generic icon).
set -euo pipefail
cd "$(dirname "$0")/.."

RES=resources
NODE_SRC=../node_modules/luck-node-mtp/build/Release/luck-node-mtp.node
HOST_ARCH=$(uname -m)

fail() { echo "error: $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "packaging is only supported on macOS"
[ -f "$NODE_SRC" ] || fail "$NODE_SRC is missing - build it first with: npm run rebuild:mtp (from the repo root; needs 'brew install libmtp libusb')"

# Discover the exact library paths the addon was linked against instead of
# assuming a Homebrew prefix.
LIBMTP_SRC=$(otool -L "$NODE_SRC" | awk '/libmtp/ {print $1; exit}')
[ -n "$LIBMTP_SRC" ] && [ -f "$LIBMTP_SRC" ] || fail "libmtp dylib not found at '${LIBMTP_SRC:-?}' (addon links it, but it is not on disk)"
LIBUSB_SRC=$(otool -L "$LIBMTP_SRC" | awk '/libusb/ {print $1; exit}')
[ -n "$LIBUSB_SRC" ] && [ -f "$LIBUSB_SRC" ] || fail "libusb dylib not found at '${LIBUSB_SRC:-?}' (libmtp links it, but it is not on disk)"

# Locate adb: explicit override, PATH, then the usual Android SDK locations.
find_adb() {
  if [ -n "${ADB_BIN:-}" ]; then echo "$ADB_BIN"; return; fi
  if command -v adb >/dev/null 2>&1; then command -v adb; return; fi
  for dir in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk"; do
    [ -n "$dir" ] && [ -x "$dir/platform-tools/adb" ] && { echo "$dir/platform-tools/adb"; return; }
  done
}
BUNDLE_ADB=${BUNDLE_ADB:-1}
if [ "$BUNDLE_ADB" = "1" ]; then
  ADB_FOUND=$(find_adb || true)
  [ -n "$ADB_FOUND" ] || fail "adb not found - install it (brew install android-platform-tools), set ADB_BIN, install the Android SDK platform-tools, or build with BUNDLE_ADB=0"
  ADB_SRC=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$ADB_FOUND")
  [ -f "$ADB_SRC" ] || fail "adb resolved to '$ADB_SRC', which is not a file"
fi

cp -f "$NODE_SRC" "$RES/luck-node-mtp.node"
cp -f "$LIBMTP_SRC" "$RES/libmtp.9.dylib"
cp -f "$LIBUSB_SRC" "$RES/libusb-1.0.0.dylib"
if [ "$BUNDLE_ADB" = "1" ]; then cp -f "$ADB_SRC" "$RES/adb"; else rm -f "$RES/adb"; fi
chmod u+w "$RES"/luck-node-mtp.node "$RES"/*.dylib
[ "$BUNDLE_ADB" = "1" ] && chmod +x "$RES/adb"

install_name_tool -change "$LIBMTP_SRC" @loader_path/libmtp.9.dylib "$RES/luck-node-mtp.node"
install_name_tool -id @loader_path/libmtp.9.dylib "$RES/libmtp.9.dylib"
install_name_tool -change "$LIBUSB_SRC" @loader_path/libusb-1.0.0.dylib "$RES/libmtp.9.dylib"
install_name_tool -id @loader_path/libusb-1.0.0.dylib "$RES/libusb-1.0.0.dylib"

codesign -f -s - "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib"

# The staged files must be relocatable: nothing may still point into a
# package manager prefix, or the app would only run on this machine.
for f in "$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib"; do
  if otool -L "$f" | tail -n +2 | grep -Eq '/(opt/homebrew|usr/local|opt/local)/'; then
    otool -L "$f" >&2
    fail "$f still links against a package-manager path; it would not run on another Mac"
  fi
  codesign --verify "$f" || fail "$f failed signature verification after patching"
done

# Architecture sanity: warn (do not fail) if anything does not match this Mac.
# The .dmg is built for the host architecture, so a mismatch means a broken app.
ARCH_FILES=("$RES/luck-node-mtp.node" "$RES/libmtp.9.dylib" "$RES/libusb-1.0.0.dylib")
[ "$BUNDLE_ADB" = "1" ] && ARCH_FILES+=("$RES/adb")
for f in "${ARCH_FILES[@]}"; do
  archs=$(lipo -archs "$f" 2>/dev/null || echo unknown)
  case " $archs " in
    *" $HOST_ARCH "*|*" arm64e "*) ;;
    *) echo "warning: $f has architectures [$archs] but this Mac is $HOST_ARCH" >&2 ;;
  esac
done

echo "staged into $RES/ (host arch: $HOST_ARCH):"
for f in luck-node-mtp.node libmtp.9.dylib libusb-1.0.0.dylib; do
  printf '  %-24s %s\n' "$f" "$(lipo -archs "$RES/$f" 2>/dev/null || echo unknown)"
done
if [ "$BUNDLE_ADB" = "1" ]; then echo "adb source: $ADB_SRC"; else echo "adb: not bundled (BUNDLE_ADB=0)"; fi
