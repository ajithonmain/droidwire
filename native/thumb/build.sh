#!/bin/bash
# Compiles the AVFoundation poster-frame helper (Swift, macOS system frameworks only).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/../versions.env"
OUT="${NATIVE_OUT:-$HERE/../.out}/thumb"
ARCH="${NATIVE_ARCH:-arm64}"
mkdir -p "$OUT"
command -v swiftc >/dev/null || { echo "error: swiftc not found (install Xcode command line tools)" >&2; exit 1; }
swiftc -O -target "$ARCH-apple-macos$DEPLOYMENT_TARGET" -o "$OUT/droidwire-thumb" "$HERE/droidwire-thumb.swift"
codesign -f -s - "$OUT/droidwire-thumb"
echo "built $OUT/droidwire-thumb"
