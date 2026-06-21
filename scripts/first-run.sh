#!/usr/bin/env bash
# =============================================================================
# scripts/first-run.sh — idempotent clean-machine bootstrap for Allura Brain
# =============================================================================
# The base docker-compose.yml declares its volumes and network as
# `external: true` (see docker-compose.yml :250-272). On a fresh machine those
# resources do not exist yet, so `docker compose up` fails on the first run with
# errors like:
#     network knowledge-network declared as external, but could not be found
#     volume memory_postgres_data declared as external, but could not be found
#
# This script pre-creates those external resources, then brings the stack up
# with the documented --env-file invocation. It is SAFE TO RE-RUN: every
# `docker ... create` is guarded so an already-existing resource is a no-op.
#
# Usage:
#   bash scripts/first-run.sh            # brings up the Brain stack (postgres, neo4j, mcp)
#
# This script NEVER destroys data. It only CREATES network/volumes and runs
# `up -d`. It does not call `down`, `rm`, `prune`, or any `-v` teardown.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# ---- Pre-flight: docker must be available ----------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' (v2) is required." >&2
  exit 1
fi

# ---- Env files (the compose invocation needs both) -------------------------
ENV_ARGS=(--env-file .env)
if [[ -f .env ]]; then
  echo "==> Using base env file: .env"
else
  echo "ERROR: .env not found. Copy .env.example to .env first." >&2
  exit 1
fi
if [[ -f .env.local ]]; then
  ENV_ARGS+=(--env-file .env.local)
  echo "==> Using local secret overrides: .env.local"
else
  echo "WARN: .env.local not found — proceeding with .env only." >&2
fi

# ---- Step 1: create the external network (idempotent) ----------------------
NETWORK="knowledge-network"
echo "==> Ensuring docker network '${NETWORK}' exists"
if docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  echo "    network '${NETWORK}' already exists — skipping"
else
  docker network create "${NETWORK}"
  echo "    network '${NETWORK}' created"
fi

# ---- Step 2: create the external volumes (idempotent) ----------------------
# Names MUST match docker-compose.yml volume `name:` fields exactly:
#   postgres_data -> memory_postgres_data, neo4j_data, neo4j_logs
for VOL in memory_postgres_data neo4j_data neo4j_logs; do
  echo "==> Ensuring docker volume '${VOL}' exists"
  if docker volume inspect "${VOL}" >/dev/null 2>&1; then
    echo "    volume '${VOL}' already exists — skipping (data preserved)"
  else
    docker volume create "${VOL}"
    echo "    volume '${VOL}' created"
  fi
done

# ---- Step 3: bring the stack up --------------------------------------------
# Base stack only (postgres, neo4j, neo4j-init, mcp). The web dashboard was
# sunset 2026-06-20 (decision trace 279eaff2); the human surface is now the
# curator CLI + Allura Brain MCP tools. --remove-orphans clears the old
# dashboard container if it is still running from a previous boot.
COMPOSE_FILES=(-f docker-compose.yml)

echo "==> Starting Brain stack: docker compose ${COMPOSE_FILES[*]} ${ENV_ARGS[*]} up -d --remove-orphans"
docker compose "${COMPOSE_FILES[@]}" "${ENV_ARGS[@]}" up -d --remove-orphans

# ---- Step 4: report ---------------------------------------------------------
echo "==> Stack status:"
docker compose "${COMPOSE_FILES[@]}" "${ENV_ARGS[@]}" ps

echo ""
echo "Done. Verify the Brain stack once containers are healthy:"
echo "    bun run brain:status"
echo "    Allura Brain MCP listens on http://localhost:5888/mcp"
