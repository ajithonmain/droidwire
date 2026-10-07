#!/bin/bash
# Verifies the native toolchain output (or a staged resources directory).
#
#   bash native/verify.sh [dir]        dir defaults to native/.out/prefix
#
# Checks, for every Mach-O found: architecture, minimum macOS version not above
# the pinned deployment target, and that dynamic dependencies are only system
# libraries or other bundled libraries (no Homebrew / build-machine paths).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=versions.env
source "$HERE/versions.env"
DIR="${1:-$HERE/.out/prefix}"
EXPECT_ARCH="${NATIVE_ARCH:-arm64}"
ok=1
bad() { echo "FAIL: $*" >&2; ok=0; }

[ -d "$DIR" ] || { echo "no such directory: $DIR" >&2; exit 1; }

version_gt() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" != "$2" ]; } # $1 > $2

check_macho() {
  local f="$1"
  local archs; archs="$(lipo -archs "$f" 2>/dev/null)" || return 0
  [ "$archs" = "$EXPECT_ARCH" ] || bad "$f: architectures [$archs], expected [$EXPECT_ARCH]"
  local minos; minos="$(otool -l "$f" | awk '/LC_BUILD_VERSION/{b=1} b&&/minos/{print $2; exit}')"
  if [ -n "$minos" ] && version_gt "$minos" "$DEPLOYMENT_TARGET"; then
    bad "$f: minimum macOS $minos is above the supported floor $DEPLOYMENT_TARGET"
  fi
  # dynamic dependencies (first line is the file itself)
  while read -r dep; do
    case "$dep" in
      /usr/lib/*|/System/Library/*) ;;                                  # system
      @loader_path/*|@executable_path/*|@rpath/*) ;;                    # relocatable, bundled
      "$DIR"/*) ;;                                                      # inside the build prefix (rewritten at staging)
      *) bad "$f: depends on '$dep' (not a system or bundled library)" ;;
    esac
  done < <(otool -L "$f" | tail -n +2 | awk '{print $1}')
  echo "  ok  $(basename "$f")  [$archs]  minos ${minos:-n/a}"
}

echo "Checking Mach-O files in $DIR"
count=0
while IFS= read -r f; do
  if file -b "$f" | grep -q "Mach-O"; then check_macho "$f"; count=$((count+1)); fi
done < <(find "$DIR" -type f \( -perm -u+x -o -name '*.dylib' -o -name '*.node' \) -not -path '*/licenses/*' -not -name '*.sh' -not -name '*.py' 2>/dev/null)
[ "$count" -gt 0 ] || bad "no Mach-O binaries found"

if [ -x "$DIR/bin/adb" ]; then
  v="$("$DIR/bin/adb" version 2>&1 | head -1)" || bad "adb does not run"
  echo "  adb: $v"
fi
[ "$ok" = 1 ] && echo "native verification passed" || { echo "native verification FAILED" >&2; exit 1; }
