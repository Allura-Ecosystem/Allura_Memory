#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[codex-setup] workspace: $ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "[codex-setup] ERROR: bun is required for this repo." >&2
  echo "[codex-setup] Install Bun, then rerun the Codex local environment setup." >&2
  exit 1
fi

echo "[codex-setup] bun: $(bun --version)"

if [[ ! -d node_modules ]]; then
  echo "[codex-setup] installing dependencies with bun install --frozen-lockfile"
  bun install --frozen-lockfile
else
  echo "[codex-setup] node_modules already present"
fi

echo "[codex-setup] validating Codex governance gate"
bun run validate:codex-gate

echo "[codex-setup] running typecheck"
bun run typecheck

echo "[codex-setup] ready"
