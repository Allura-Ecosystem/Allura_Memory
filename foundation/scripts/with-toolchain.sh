#!/bin/sh
# Keep the project's pinned tools process-local; never replace global Node/Bun.
set -eu
TOOLCHAIN_ROOT=${ALLURA_TOOLCHAIN_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/allura-toolchain}
# Resolve before changing cwd so relative overrides cannot fall back to global tools.
TOOLCHAIN_ROOT=$(CDPATH= cd -- "$TOOLCHAIN_ROOT" 2>/dev/null && pwd -P) || {
  printf '%s\n' 'Missing pinned toolchain directory; no command was executed.' >&2
  exit 1
}
BUN_DIR=$TOOLCHAIN_ROOT/bun-linux-x64-baseline
NODE_DIR=$TOOLCHAIN_ROOT/node-v24.19.0-linux-x64/bin
if [ ! -x "$BUN_DIR/bun" ] || [ ! -x "$NODE_DIR/node" ]; then
  printf '%s\n' 'Missing pinned toolchain: Bun 1.3.14 and Node 24.19.0.' 'Install the declared tools or set ALLURA_TOOLCHAIN_ROOT to their parent directory.' >&2
  exit 1
fi
PATH=$BUN_DIR:$NODE_DIR:$PATH
export PATH
if [ "$(bun --version)" != '1.3.14' ] || [ "$(node --version)" != 'v24.19.0' ]; then
  printf '%s\n' 'Pinned toolchain validation failed; no command was executed.' >&2
  exit 1
fi
FOUNDATION=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$FOUNDATION"
if [ "$#" -eq 0 ]; then
  set -- bun run check:toolchain
fi
exec "$@"
