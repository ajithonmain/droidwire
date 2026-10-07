#!/bin/bash
# Builds Droidwire's native toolchain from pinned, checksum-verified sources:
#
#   adb             from AOSP source (Apache-2.0) via the android-tools CMake build
#   libusb, libmtp  LGPL-2.1+, shared libraries (so users can substitute them)
#   zstd lz4 brotli pcre2 abseil protobuf   static, linked into adb only
#
# Everything is compiled here with an explicit macOS deployment target and
# architecture, into an isolated prefix (native/.out/prefix). Nothing is taken
# from Homebrew or the developer's machine at runtime; Homebrew is only
# *optional* for installing the build tools (cmake, ninja, pkg-config).
#
#   bash native/build.sh            build everything (about 15-25 min on Apple Silicon)
#   bash native/build.sh --clean    remove native/.out first
#
# Build tools required: Xcode command line tools, cmake >= 3.22, ninja,
# pkg-config, curl, shasum, tar, bzip2, make, python3.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=versions.env
source "$HERE/versions.env"

OUT="${NATIVE_OUT:-$HERE/.out}"
CACHE="$HERE/.cache"
PREFIX="$OUT/prefix"
SRC="$OUT/src"
BUILD="$OUT/build"
JOBS="$(sysctl -n hw.ncpu)"

if [ "${1:-}" = "--clean" ]; then rm -rf "$OUT"; fi
mkdir -p "$CACHE" "$PREFIX" "$SRC" "$BUILD"

fail() { echo "error: $*" >&2; exit 1; }
log()  { printf '\n==> %s\n' "$*"; }

[ "$(uname -s)" = "Darwin" ] || fail "macOS only"
for tool in cmake ninja pkg-config curl shasum tar make python3 clang; do
  command -v "$tool" >/dev/null 2>&1 || fail "missing build tool '$tool' (brew install cmake ninja pkgconf)"
done

# One deployment target and architecture for everything we compile. This is
# what makes "supports macOS $DEPLOYMENT_TARGET" true: Homebrew's own bottles
# target the OS they were built on (macOS 15-26), which would silently raise
# the app's real minimum.
export MACOSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET"
ARCH="${NATIVE_ARCH:-arm64}"
# -ffile-prefix-map keeps this machine's absolute paths out of the binaries
COMMON_FLAGS="-arch $ARCH -mmacosx-version-min=$DEPLOYMENT_TARGET -O2 -fPIC -ffile-prefix-map=$OUT=/native-build -ffile-prefix-map=$HERE=/droidwire/native"
export CFLAGS="$COMMON_FLAGS" CXXFLAGS="$COMMON_FLAGS" LDFLAGS="-arch $ARCH -mmacosx-version-min=$DEPLOYMENT_TARGET"
# Resolve libraries from our prefix only: pkg-config must not see Homebrew
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig:$PREFIX/share/pkgconfig"
export PKG_CONFIG_PATH=""
export PATH="$PREFIX/bin:$PATH"
CMAKE_COMMON=(
  -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$PREFIX"
  -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_OSX_ARCHITECTURES="$ARCH"
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" -DCMAKE_POSITION_INDEPENDENT_CODE=ON
  -DCMAKE_IGNORE_PREFIX_PATH="/opt/homebrew;/usr/local;/opt/local"
  -DCMAKE_FIND_FRAMEWORK=NEVER -DCMAKE_FIND_APPBUNDLE=NEVER
)

# fetch <name> <url> <sha256>  -> extracts into $SRC/<name>
fetch() {
  local name="$1" url="$2" want="$3"
  local file="$CACHE/$name-$(basename "$url")"
  [ -f "$file" ] || { log "downloading $name"; curl -fL --retry 3 -o "$file" "$url" || fail "download failed: $url"; }
  local got; got="$(shasum -a 256 "$file" | cut -d' ' -f1)"
  [ "$got" = "$want" ] || { rm -f "$file"; fail "$name: checksum mismatch (got $got, pinned $want)"; }
  rm -rf "$SRC/$name"; mkdir -p "$SRC/$name"
  tar -xf "$file" -C "$SRC/$name" --strip-components=1
}

stamp() { [ -f "$PREFIX/.built-$1-$2" ]; }
done_stamp() { touch "$PREFIX/.built-$1-$2"; }

cmake_pkg() { # <name> <version> <srcsubdir> [extra cmake args...]
  local name="$1" ver="$2" sub="$3"; shift 3
  stamp "$name" "$ver" && { echo "$name $ver already built"; return; }
  log "building $name $ver"
  cmake -S "$SRC/$name/$sub" -B "$BUILD/$name" "${CMAKE_COMMON[@]}" "$@"
  cmake --build "$BUILD/$name" -j "$JOBS"
  cmake --install "$BUILD/$name"
  done_stamp "$name" "$ver"
}

# --- libusb (LGPL-2.1+, shared) -------------------------------------------------------
fetch libusb "$LIBUSB_URL" "$LIBUSB_SHA256"
if ! stamp libusb "$LIBUSB_VERSION"; then
  log "building libusb $LIBUSB_VERSION"
  ( cd "$SRC/libusb" && ./configure --prefix="$PREFIX" --enable-shared --disable-static >/dev/null && make -j "$JOBS" >/dev/null && make install >/dev/null )
  done_stamp libusb "$LIBUSB_VERSION"
fi

# --- libmtp (LGPL-2.1+, shared) ---------------------------------------------------------
fetch libmtp "$LIBMTP_URL" "$LIBMTP_SHA256"
if ! stamp libmtp "$LIBMTP_VERSION"; then
  log "building libmtp $LIBMTP_VERSION"
  ( cd "$SRC/libmtp" && ./configure --prefix="$PREFIX" --enable-shared --disable-static --disable-mtpz \
      --disable-doxygen --disable-rpath >/dev/null && make -j "$JOBS" >/dev/null && make install >/dev/null )
  done_stamp libmtp "$LIBMTP_VERSION"
fi

# --- static libraries linked into adb ----------------------------------------------------
fetch zstd "$ZSTD_URL" "$ZSTD_SHA256"
cmake_pkg zstd "$ZSTD_VERSION" build/cmake -DZSTD_BUILD_SHARED=OFF -DZSTD_BUILD_STATIC=ON \
  -DZSTD_BUILD_PROGRAMS=OFF -DZSTD_BUILD_TESTS=OFF -DZSTD_BUILD_CONTRIB=OFF

fetch lz4 "$LZ4_URL" "$LZ4_SHA256"
cmake_pkg lz4 "$LZ4_VERSION" build/cmake -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON \
  -DLZ4_BUILD_CLI=OFF -DLZ4_BUILD_LEGACY_LZ4C=OFF

fetch brotli "$BROTLI_URL" "$BROTLI_SHA256"
cmake_pkg brotli "$BROTLI_VERSION" . -DBUILD_SHARED_LIBS=OFF -DBROTLI_DISABLE_TESTS=ON -DBROTLI_BUNDLED_MODE=OFF

fetch pcre2 "$PCRE2_URL" "$PCRE2_SHA256"
cmake_pkg pcre2 "$PCRE2_VERSION" . -DBUILD_SHARED_LIBS=OFF -DPCRE2_BUILD_PCRE2GREP=OFF \
  -DPCRE2_BUILD_TESTS=OFF -DPCRE2_SUPPORT_JIT=ON

fetch abseil "$ABSEIL_URL" "$ABSEIL_SHA256"
cmake_pkg abseil "$ABSEIL_VERSION" . -DBUILD_SHARED_LIBS=OFF -DABSL_PROPAGATE_CXX_STD=ON \
  -DCMAKE_CXX_STANDARD=17 -DABSL_BUILD_TESTING=OFF -DABSL_ENABLE_INSTALL=ON

fetch protobuf "$PROTOBUF_URL" "$PROTOBUF_SHA256"
cmake_pkg protobuf "$PROTOBUF_VERSION" . -Dprotobuf_BUILD_TESTS=OFF -Dprotobuf_BUILD_SHARED_LIBS=OFF \
  -Dprotobuf_ABSL_PROVIDER=package -Dprotobuf_BUILD_PROTOC_BINARIES=ON -Dprotobuf_INSTALL=ON \
  -DCMAKE_CXX_STANDARD=17

fetch googletest "$GOOGLETEST_URL" "$GOOGLETEST_SHA256"
if ! stamp googletest "$GOOGLETEST_VERSION"; then
  # Only the FRIEND_TEST header is needed to compile adb; the test framework itself is not built or shipped
  mkdir -p "$PREFIX/include/gtest"
  cp "$SRC/googletest/googletest/include/gtest/gtest_prod.h" "$PREFIX/include/gtest/"
  done_stamp googletest "$GOOGLETEST_VERSION"
fi

# --- adb (Apache-2.0, built from AOSP source) -----------------------------------------------
fetch android-tools "$ANDROID_TOOLS_URL" "$ANDROID_TOOLS_SHA256"
if ! stamp adb "$ANDROID_TOOLS_VERSION"; then
  log "building adb (android-tools $ANDROID_TOOLS_VERSION, AOSP platform-tools-$ANDROID_TOOLS_VERSION)"
  cmake -S "$SRC/android-tools" -B "$BUILD/android-tools" "${CMAKE_COMMON[@]}" \
    -DANDROID_TOOLS_PATCH_VENDOR=OFF -DANDROID_TOOLS_USE_BUNDLED_FMT=ON
  cmake --build "$BUILD/android-tools" --target adb -j "$JOBS"
  mkdir -p "$PREFIX/bin"
  cp -f "$BUILD/android-tools/vendor/adb" "$PREFIX/bin/adb"
  strip -x "$PREFIX/bin/adb"
  done_stamp adb "$ANDROID_TOOLS_VERSION"
fi

# Provenance + license material that ships with the app
mkdir -p "$PREFIX/licenses"
cp -f "$SRC/android-tools/LICENSE" "$PREFIX/licenses/android-tools-LICENSE.txt"
for d in adb core libbase boringssl fmtlib; do
  for f in LICENSE NOTICE COPYING; do
    [ -f "$SRC/android-tools/vendor/$d/$f" ] && cp -f "$SRC/android-tools/vendor/$d/$f" "$PREFIX/licenses/aosp-$d-$f.txt" || true
  done
done
# Per-package license files (zstd is dual BSD/GPLv2: we ship and rely on the BSD text only)
license_files() {
  case "$1" in
    libusb|libmtp) echo "COPYING" ;;
    zstd)          echo "LICENSE" ;;
    pcre2)         echo "LICENCE.md" ;;
    *)             echo "LICENSE" ;;
  esac
}
for p in libusb libmtp zstd lz4 brotli pcre2 abseil protobuf googletest; do
  for f in $(license_files "$p"); do
    [ -f "$SRC/$p/$f" ] || fail "license file $p/$f not found in the source tree"
    cp -f "$SRC/$p/$f" "$PREFIX/licenses/$p-$f.txt"
  done
done
cp -f "$HERE/versions.env" "$PREFIX/licenses/native-versions.env"

bash "$HERE/thumb/build.sh"

log "done: $PREFIX"
bash "$HERE/verify.sh" "$PREFIX"
bash "$HERE/verify.sh" "$OUT/thumb"
