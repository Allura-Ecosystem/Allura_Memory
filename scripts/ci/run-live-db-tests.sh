#!/usr/bin/env bash
set -Eeuo pipefail

artifact_dir="artifacts/ci/${GITHUB_SHA:-local}/live-db"
mode="test"

for arg in "$@"; do
  case "$arg" in
    --artifact-dir=*) artifact_dir="${arg#*=}" ;;
    --migrate-only) mode="migrate-only" ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 64 ;;
  esac
done

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
export POSTGRES_APP_USER POSTGRES_APP_PASSWORD
postgres_host="${POSTGRES_HOST:-127.0.0.1}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_db="${POSTGRES_DB:-memory}"
postgres_user="${POSTGRES_USER:-allura}"
migration_log="${artifact_dir}/migration.log"
test_report="${artifact_dir}/live-db-tests.json"
server_version_report="${artifact_dir}/postgres-server-version.txt"
gateway_log="${artifact_dir}/gateway.log"
historical_upgrade_report="${artifact_dir}/historical-upgrade-tests.json"
gateway_port="${ALLURA_MCP_HTTP_PORT:-5888}"
gateway_token_secret="${ALLURA_MCP_TOKEN_SECRET:-sdk-gateway-e2e-secret-key-0001}"
historical_upgrade_db="allura_historical_upgrade_$$"
gateway_pid=""

cleanup() {
  if [[ -n "$gateway_pid" ]]; then
    kill "$gateway_pid" 2>/dev/null || true
    wait "$gateway_pid" 2>/dev/null || true
  fi
  PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --host "$postgres_host" --port "$postgres_port" --dbname postgres --username "$postgres_user" \
    --command "DROP DATABASE IF EXISTS \"$historical_upgrade_db\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$artifact_dir"
exec > >(tee "$migration_log") 2>&1

for command in psql pg_isready find sort bun curl; do
  command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command"; exit 69; }
done

ready=false
for _attempt in $(seq 1 60); do
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_isready \
    --host "$postgres_host" --port "$postgres_port" \
    --dbname "$postgres_db" --username "$postgres_user" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != "true" ]]; then
  printf 'PostgreSQL did not become ready within 60 polling attempts.\n'
  exit 70
fi

psql_args=(
  --no-psqlrc
  --set ON_ERROR_STOP=1
  --host "$postgres_host"
  --port "$postgres_port"
  --dbname "$postgres_db"
  --username "$postgres_user"
)

# Record the authoritative server version from the live connection. The psql
# client version is deliberately not used as runtime evidence.
PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" \
  --tuples-only --no-align \
  --command 'SHOW server_version;' >"$server_version_report"
if [[ ! -s "$server_version_report" ]]; then
  printf 'PostgreSQL server did not return a version.\n'
  exit 66
fi

PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" \
  --command 'CREATE EXTENSION IF NOT EXISTS vector;'

mapfile -d '' migration_files < <(
  find docker/postgres-init -maxdepth 1 -type f -name '*.sql' -print0 | LC_ALL=C sort -z
)

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  printf 'No PostgreSQL migration files found.\n'
  exit 66
fi

printf 'Applying %s migrations in LC_ALL=C filename order.\n' "${#migration_files[@]}"
for migration in "${migration_files[@]}"; do
  printf 'Applying: %s\n' "$(basename "$migration")"
  PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" --file "$migration"
done

# Ensure the restricted application role uses the password the test harness expects.
PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" \
  --command "ALTER ROLE allura_app WITH PASSWORD '$POSTGRES_APP_PASSWORD';"

PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" \
  --tuples-only --no-align \
  --command "SELECT extname || ':' || extversion FROM pg_extension WHERE extname = 'vector';"

if [[ "$mode" == "migrate-only" ]]; then
  printf 'Migration-only validation completed.\n'
  exit 0
fi

# Historical upgrades cannot be proven against the fresh-install database,
# which has already applied 056. Create a second disposable empty database and
# let the dedicated test stage the exact committed 055 state before applying
# the forward-only 056 migration. This sub-gate is mandatory in every live run.
PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --host "$postgres_host" --port "$postgres_port" --dbname postgres --username "$postgres_user" \
  --command "CREATE DATABASE \"$historical_upgrade_db\";"

RUN_HISTORICAL_UPGRADE_E2E=true \
POSTGRES_DB="$historical_upgrade_db" \
POSTGRES_APP_PASSWORD="$POSTGRES_APP_PASSWORD" bun vitest run \
  --config vitest.config.live-db.ts \
  src/__tests__/bumblebee-historical-upgrade.e2e.test.ts \
  --reporter=json \
  --outputFile="$historical_upgrade_report"

PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --host "$postgres_host" --port "$postgres_port" --dbname postgres --username "$postgres_user" \
  --command "DROP DATABASE \"$historical_upgrade_db\" WITH (FORCE);"

ALLURA_MCP_HTTP_PORT="$gateway_port" \
ALLURA_MCP_TOKEN_SECRET="$gateway_token_secret" \
  bun run mcp:http >"$gateway_log" 2>&1 &
gateway_pid=$!

gateway_ready=false
for _attempt in $(seq 1 90); do
  if ! kill -0 "$gateway_pid" 2>/dev/null; then
    printf 'MCP gateway exited before becoming ready.\n' >&2
    tail -n 100 "$gateway_log" >&2 || true
    exit 70
  fi
  if curl --fail --silent --show-error "http://127.0.0.1:${gateway_port}/ready" >/dev/null; then
    gateway_ready=true
    break
  fi
  sleep 1
done

if [[ "$gateway_ready" != "true" ]]; then
  printf 'MCP gateway did not become ready within 90 polling attempts.\n' >&2
  tail -n 100 "$gateway_log" >&2 || true
  exit 70
fi

RUN_E2E_TESTS=true \
ALLURA_MCP_HTTP_URL="http://127.0.0.1:${gateway_port}" \
ALLURA_MCP_TOKEN_SECRET="$gateway_token_secret" \
POSTGRES_APP_PASSWORD="$POSTGRES_APP_PASSWORD" bun vitest run \
  --config vitest.config.live-db.ts \
  --reporter=json \
  --outputFile="$test_report"
