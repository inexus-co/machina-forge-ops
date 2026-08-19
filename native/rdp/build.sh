#!/usr/bin/env bash
#
# Build the RDP helper for this machine.
#
# Development only: it links against whatever FreeRDP is installed here. Producing the copy that
# ships inside the app — with its libraries alongside it and their install names rewritten — is
# `bundle.sh`.
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


case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux)  platform=linux ;;
  *)      echo "unsupported platform: $(uname -s)" >&2; exit 1 ;;
esac
out="$here/bin/$platform-$(node_arch)"
mkdir -p "$out"

# Where FreeRDP is. Homebrew on macOS, pkg-config or the usual prefixes elsewhere.
if [ -n "${FREERDP_PREFIX:-}" ]; then
  prefix="$FREERDP_PREFIX"
elif command -v brew >/dev/null 2>&1 && brew --prefix freerdp >/dev/null 2>&1; then
  prefix="$(brew --prefix freerdp)"
elif [ -d /usr/include/freerdp3 ]; then
  prefix=/usr
else
  echo "FreeRDP 3 was not found. Set FREERDP_PREFIX." >&2
  exit 1
fi

echo "FreeRDP: $prefix"
cc -O2 -Wall -o "$out/machina-rdp" "$here/main.c" \
  -I"$prefix/include/freerdp3" -I"$prefix/include/winpr3" \
  -L"$prefix/lib" -lfreerdp3 -lfreerdp-client3 -lwinpr3

echo "→ $out/machina-rdp"
