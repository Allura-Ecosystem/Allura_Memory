#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export ALLURA_DASHBOARD_PORT="${ALLURA_DASHBOARD_PORT:-3334}"

echo "[codex-action] starting Allura dashboard on http://localhost:${ALLURA_DASHBOARD_PORT}"
exec bun run dev
