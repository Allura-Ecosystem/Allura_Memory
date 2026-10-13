#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_root"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required (normally from .env.local)}"
postgres_host="${POSTGRES_HOST:-127.0.0.1}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_user="${POSTGRES_USER:-allura}"
browser_db="allura_graph_browser_$$"
artifact_dir="/tmp/allura-epic31-browser-$$"
dashboard_port="$((31000 + $$ % 1000))"
dashboard_pid=""

case "$browser_db" in
  allura_graph_browser_[0-9]*) ;;
  *) printf 'Refusing unsafe browser database name: %s\n' "$browser_db" >&2; exit 64 ;;
esac

cleanup() {
  if [[ -n "$dashboard_pid" ]]; then
    kill "$dashboard_pid" >/dev/null 2>&1 || true
    wait "$dashboard_pid" >/dev/null 2>&1 || true
  fi
  PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists \
    --host "$postgres_host" --port "$postgres_port" --username "$postgres_user" \
    "$browser_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for command in createdb curl dropdb psql bun; do
  command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command" >&2; exit 69; }
done

PGPASSWORD="$POSTGRES_PASSWORD" createdb \
  --host "$postgres_host" --port "$postgres_port" --username "$postgres_user" \
  "$browser_db"

export POSTGRES_HOST="$postgres_host"
export POSTGRES_PORT="$postgres_port"
export POSTGRES_USER="$postgres_user"
export POSTGRES_DB="$browser_db"
export POSTGRES_APP_USER="${POSTGRES_APP_USER:-allura_app}"
export POSTGRES_APP_PASSWORD="${POSTGRES_APP_PASSWORD:-change-me-in-production}"

if ! bash scripts/ci/run-live-db-tests.sh \
  --migrate-only \
  --artifact-dir="$artifact_dir/live-db" >/dev/null; then
  tail -n 100 "$artifact_dir/live-db/migration.log" >&2 || true
  exit 70
fi

PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --host "$postgres_host" --port "$postgres_port" --username "$postgres_user" \
  --dbname "$browser_db" \
  --file scripts/epic31/seed-knowledge-map-browser.sql

export ALLURA_DASHBOARD_PORT="$dashboard_port"
export ALLURA_DEV_AUTH_ENABLED="true"
export ALLURA_DEMO_DEV_AUTH_FORCE="true"
export ALLURA_DEV_AUTH_GROUP_ID="allura-epic31-browser"
export ALLURA_DEV_AUTH_WORKSPACE_ID="epic31-browser-workspace"
export ALLURA_DEV_AUTH_USER_ID="epic31-browser-evidence"
export ALLURA_DEV_AUTH_EMAIL="epic31-browser-evidence@allura.local"
export ALLURA_DEV_AUTH_ROLE="viewer"
export ALLURA_GRAPH_V2_ENABLED="true"
export ALLURA_GRAPH_CONTINUATION_SECRET="epic31-browser-continuation-secret-material-v1"

bun run dev >"$artifact_dir/dashboard.log" 2>&1 &
dashboard_pid=$!
dashboard_ready=false
for _attempt in $(seq 1 60); do
  if ! kill -0 "$dashboard_pid" 2>/dev/null; then
    printf 'Dashboard exited before becoming ready.\n' >&2
    tail -n 100 "$artifact_dir/dashboard.log" >&2 || true
    exit 70
  fi
  if curl --fail --silent --show-error "http://127.0.0.1:${dashboard_port}/dashboard/graph" >/dev/null; then
    dashboard_ready=true
    break
  fi
  sleep 1
done
if [[ "$dashboard_ready" != "true" ]]; then
  printf 'Dashboard did not become ready within 60 polling attempts.\n' >&2
  tail -n 100 "$artifact_dir/dashboard.log" >&2 || true
  exit 70
fi

bun playwright test --config=playwright.config.ts tests/playwright/knowledge-map.spec.ts
bun scripts/epic31/verify-knowledge-map.cjs \
  --url="http://127.0.0.1:${dashboard_port}/dashboard/graph" \
  --output="$artifact_dir/evidence"

printf 'Knowledge Map browser evidence: %s/evidence/receipt.json\n' "$artifact_dir"
