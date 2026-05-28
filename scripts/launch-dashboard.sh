#!/bin/bash
# Allura Dashboard Launcher
set -euo pipefail

cd "$(dirname "$0")/.."

export ALLURA_DASHBOARD_PORT="${ALLURA_DASHBOARD_PORT:-3100}"

echo "Starting Allura Dashboard compose service on port ${ALLURA_DASHBOARD_PORT}"
echo "URL: http://localhost:${ALLURA_DASHBOARD_PORT}/dashboard"
echo ""

docker compose --env-file .env --env-file .env.local up -d web
