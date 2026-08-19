#!/usr/bin/env bash
#
# Make the helper self-contained.
#
# `build.sh` links against whatever FreeRDP is installed on this machine, which is fine for
# development and useless for shipping: the operator installs nothing, so every library the
# helper needs has to travel with it. This copies them in and rewrites the install names to
# `@loader_path`, so the binary looks beside itself instead of at a path that only exists here.
#
# The result is `bin/<platform>-<arch>/` — the binary, a `lib/` next to it, and nothing outside
# the app.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The directory is named the way the application looks for it.
#
# Node calls x86_64 "x64" and aarch64 "arm64"; `uname -m` does not. On Apple Silicon the two
# agree and nobody noticed, and on a Linux box the helper would be built into a directory the
# application never looks in.
node_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x64 ;;
    aarch64|arm64) echo arm64 ;;
    *) uname -m ;;
  esac
}

out="$here/bin/darwin-$(node_arch)"
helper="$out/machina-rdp"

[ "$(uname -s)" = "Darwin" ] || { echo "bundle.sh is for macOS." >&2; exit 1; }

# Always from a fresh link. This script rewrites the binary's install names, so running it on
# its own output leaves a helper pointing at `@loader_path` for libraries that are not there yet
# — and the next run then finds nothing to copy and calls it a success.
"$here/build.sh"

rm -rf "$out/lib"
mkdir -p "$out/lib"

# Anything under a package manager's prefix travels; /usr/lib and /System are part of macOS.
is_ours() { case "$1" in /opt/homebrew/*|/usr/local/*|@rpath/*) return 0 ;; *) return 1 ;; esac; }

# Resolve @rpath against the prefixes we know, since the helper's own rpath is not ours to keep.
resolve() {
  case "$1" in
    @rpath/*) for p in /opt/homebrew/lib /usr/local/lib; do
                [ -f "$p/${1#@rpath/}" ] && { echo "$p/${1#@rpath/}"; return; }
              done; return 1 ;;
    *) echo "$1" ;;
  esac
}

# Breadth-first over the dependency graph: a library's own dependencies must come too.
pending=$(otool -L "$helper" | tail -n +2 | awk '{print $1}')
seen=""
while [ -n "$pending" ]; do
  next=""
  for dep in $pending; do
    is_ours "$dep" || continue
    real=$(resolve "$dep") || continue
    name=$(basename "$real")
    case " $seen " in *" $name "*) continue ;; esac
    seen="$seen $name"
    cp -f "$real" "$out/lib/$name"
    chmod u+w "$out/lib/$name"
    next="$next $(otool -L "$real" | tail -n +2 | awk '{print $1}')"
  done
  pending="$next"
done

# Point everything at `@loader_path`. The helper looks in `lib/`; a library looks beside itself.
retarget() {
  local file="$1" prefix="$2"
  for dep in $(otool -L "$file" | tail -n +2 | awk '{print $1}'); do
    is_ours "$dep" || continue
    install_name_tool -change "$dep" "$prefix/$(basename "$dep")" "$file" 2>/dev/null || true
  done
}

retarget "$helper" "@loader_path/lib"
for lib in "$out/lib"/*.dylib; do
  install_name_tool -id "@loader_path/$(basename "$lib")" "$lib" 2>/dev/null || true
  retarget "$lib" "@loader_path"
done

# Signatures break when install names change; ad-hoc re-signing is what makes them loadable again.
codesign --force --sign - "$helper" 2>/dev/null || true
for lib in "$out/lib"/*.dylib; do codesign --force --sign - "$lib" 2>/dev/null || true; done

count=$(ls -1 "$out/lib" | wc -l | tr -d ' ')
size=$(du -shL "$out" | awk '{print $1}')
echo "-> ${out}  (${count} libraries, ${size} in total)"

remaining=$(otool -L "$helper" | tail -n +2 | awk '{print $1}' | grep -E "^/opt/homebrew|^/usr/local|^@rpath" || true)
if [ -n "$remaining" ]; then
  echo "still pointing outside:" >&2
  echo "$remaining" >&2
  exit 1
fi
echo "Nothing points outside."
