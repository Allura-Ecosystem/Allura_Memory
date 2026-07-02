#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
GATEWAY_READY_URL="http://127.0.0.1:5888/ready"

SERVICES=(postgres neo4j mcp)

# External resources declared in docker-compose.yml as `external: true`.
# These names MUST match the compose `name:` fields exactly — see the
# WHY-external comment block in docker-compose.yml. On THIS machine they already
# exist (the live stack binds them); pre-creating them is a no-op that preserves
# data. On a FRESH machine they do not exist, so `compose up` fails before any
# container starts — bootstrap_external_resources() fixes that (G1 + G2).
EXTERNAL_NETWORK="knowledge-network"
EXTERNAL_VOLUMES=(memory_postgres_data neo4j_data neo4j_logs)

# --env-file args (G4): the stack needs BOTH .env (base) and .env.local (secrets)
# for YAML ${VAR} substitution. Passing them here means every `compose` call is
# correct — no more relying on the caller to remember the double --env-file flag.
# Built once so it is applied uniformly to up/ps/logs/restart.
ENV_ARGS=()
if [[ -f "$REPO_ROOT/.env" ]]; then
  ENV_ARGS+=(--env-file "$REPO_ROOT/.env")
fi
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  ENV_ARGS+=(--env-file "$REPO_ROOT/.env.local")
fi

compose() {
  docker compose -f "$COMPOSE_FILE" "${ENV_ARGS[@]}" "$@"
}

# Idempotently pre-create the external network + volumes BEFORE `compose up`.
# Guarded by `inspect`: an existing resource is left untouched (data preserved),
# a missing one is created. Safe to re-run; never destroys data. Fixes G1 (network)
# and G2 (volumes) for fresh machines without changing how the live stack binds.
bootstrap_external_resources() {
  echo "==> Ensuring external network '${EXTERNAL_NETWORK}' exists"
  if docker network inspect "${EXTERNAL_NETWORK}" >/dev/null 2>&1; then
    echo "    network '${EXTERNAL_NETWORK}' already exists — skipping"
  else
    docker network create "${EXTERNAL_NETWORK}" >/dev/null
    echo "    network '${EXTERNAL_NETWORK}' created"
  fi

  local vol
  for vol in "${EXTERNAL_VOLUMES[@]}"; do
    echo "==> Ensuring external volume '${vol}' exists"
    if docker volume inspect "${vol}" >/dev/null 2>&1; then
      echo "    volume '${vol}' already exists — skipping (data preserved)"
    else
      docker volume create "${vol}" >/dev/null
      echo "    volume '${vol}' created"
    fi
  done
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ docker is not installed or not on PATH"
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "❌ docker daemon is not reachable"
    exit 1
  fi
}

service_container_id() {
  local service="$1"
  compose ps -q "$service" | tr -d '\n'
}

container_health() {
  local service="$1"
  local container
  container="$(service_container_id "$service")"

  if [[ -z "$container" ]] || ! docker inspect "$container" >/dev/null 2>&1; then
    printf 'missing\n'
    return
  fi

  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container"
}

gateway_ready() {
  wget -qO- "$GATEWAY_READY_URL" >/dev/null 2>&1
}

print_status() {
  require_docker

  echo "Allura Brain stack status"
  echo "Repo: $REPO_ROOT"
  echo

  local service
  for service in "${SERVICES[@]}"; do
    printf '%-14s %s\n' "$service" "$(container_health "$service")"
  done

  echo
  if gateway_ready; then
    echo "gateway_ready   yes ($GATEWAY_READY_URL)"
  else
    echo "gateway_ready   no  ($GATEWAY_READY_URL)"
  fi
}

wait_ready() {
  require_docker

  local timeout="${1:-120}"
  local deadline=$((SECONDS + timeout))

  while (( SECONDS < deadline )); do
    local mcp_state
    mcp_state="$(container_health mcp)"

    if [[ "$mcp_state" == *"healthy"* ]] && gateway_ready; then
      echo "✅ Allura Brain is ready"
      return 0
    fi

    sleep 3
  done

  echo "❌ Timed out waiting for Allura Brain readiness"
  print_status
  return 1
}

cmd_up() {
  require_docker
  bootstrap_external_resources
  compose up -d
  wait_ready 120
}

cmd_down() {
  require_docker
  compose down
}

cmd_restart() {
  require_docker
  compose restart postgres neo4j mcp
  wait_ready 120
}

cmd_recover() {
  require_docker
  bootstrap_external_resources
  compose up -d

  if wait_ready 90; then
    return 0
  fi

  echo "↻ Restarting MCP runtime for recovery"
  compose restart mcp
  wait_ready 120
}

cmd_logs() {
  require_docker
  compose logs --tail 100 mcp
}

show_help() {
  cat <<'HELP'
Allura Brain stack controller

Usage: bash scripts/brain-stack.sh <command>

Commands:
  status              Show container and gateway readiness
  up                  Start the stack and wait for readiness
  down                Stop the stack
  restart             Restart the main stack services and wait
  recover             Start if needed, then recover MCP runtime if unready
  wait-ready [secs]   Wait for readiness (default 120s)
  logs                Show recent MCP runtime logs
  install-user-service Install the user systemd boot service
  help                Show this message
HELP
}

case "${1:-help}" in
  status)
    print_status
    ;;
  up)
    cmd_up
    ;;
  down)
    cmd_down
    ;;
  restart)
    cmd_restart
    ;;
  recover)
    cmd_recover
    ;;
  wait-ready)
    wait_ready "${2:-120}"
    ;;
  logs)
    cmd_logs
    ;;
  install-user-service)
    bash "$SCRIPT_DIR/install-allura-boot-service.sh" --user
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo "Unknown command: $1"
    echo
    show_help
    exit 1
    ;;
esac
