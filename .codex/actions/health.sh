#!/usr/bin/env bash
set -euo pipefail

PORT="${ALLURA_DASHBOARD_PORT:-3334}"
URL="http://localhost:${PORT}/api/health/live"

echo "[codex-action] checking $URL"
curl -fsS "$URL"
echo
