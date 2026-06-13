#!/usr/bin/env bash
#
# first-run-setup.sh — idempotent preflight for a fresh Allura deploy.
#
# docker-compose.yml declares its network and data volumes as `external: true`,
# which means Docker will NOT create them automatically. On a clean machine the
# first `docker compose up` fails with:
#     network knowledge-network declared as external, but could not be found
# This script creates those externals (if absent) and then runs env validation,
# so `docker compose up -d` can succeed on the very first run.
#
# Safe to re-run: every create is guarded by an inspect, so existing resources
# are left untouched and no data volume is ever recreated or wiped.
#
# Source of truth: the `volumes:` and `networks:` blocks at the bottom of
# docker-compose.yml. Keep the names below in sync with that file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# External Docker resources required by docker-compose.yml.
NETWORK_NAME="knowledge-network"
VOLUME_NAMES=(
    "memory_postgres_data"  # compose alias: postgres_data
    "neo4j_data"
    "neo4j_logs"
)

echo "Allura First-Run Setup"
echo "Provisioning external Docker resources declared in docker-compose.yml"
echo ""

# --- Preconditions --------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
    echo "FAIL: docker is not installed or not on PATH"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "FAIL: docker daemon is not reachable (is Docker running?)"
    exit 1
fi

# --- Network (idempotent) -------------------------------------------------
echo "Network:"
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "  EXISTS: $NETWORK_NAME"
else
    docker network create "$NETWORK_NAME" >/dev/null
    echo "  CREATED: $NETWORK_NAME"
fi
echo ""

# --- Volumes (idempotent — never recreated, so data is preserved) ---------
echo "Volumes:"
for vol in "${VOLUME_NAMES[@]}"; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then
        echo "  EXISTS: $vol"
    else
        docker volume create "$vol" >/dev/null
        echo "  CREATED: $vol"
    fi
done
echo ""

# --- Environment validation (delegates to the canonical validator) --------
echo "Validating environment..."
if bash "$SCRIPT_DIR/validate-env.sh"; then
    :
else
    echo ""
    echo "FAIL: environment validation failed — fix the variables above before deploying"
    exit 1
fi

echo ""
echo "PASS: external resources ready and environment valid."
echo "Next:"
echo "  docker compose --env-file .env --env-file .env.local build --no-cache"
echo "  docker compose --env-file .env --env-file .env.local up -d"
