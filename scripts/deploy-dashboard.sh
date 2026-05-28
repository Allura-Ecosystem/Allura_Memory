#!/bin/bash
# Deploy Allura Dashboard to Docker

set -euo pipefail

echo "Deploying Allura Dashboard through the canonical Docker Compose stack..."

# Navigate to project root
cd "$(dirname "$0")/.."

export ALLURA_DASHBOARD_PORT="${ALLURA_DASHBOARD_PORT:-3100}"

docker compose --env-file .env --env-file .env.local build web
docker compose --env-file .env --env-file .env.local up -d web

echo "Allura Dashboard deployed."
echo ""
echo "Access: http://localhost:${ALLURA_DASHBOARD_PORT}"
echo ""
echo "Test connection:"
echo "  curl http://localhost:${ALLURA_DASHBOARD_PORT}/api/health/live"
