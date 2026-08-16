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
postgres_host="${POSTGRES_HOST:-127.0.0.1}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_db="${POSTGRES_DB:-memory}"
postgres_user="${POSTGRES_USER:-allura}"
migration_log="${artifact_dir}/migration.log"
test_report="${artifact_dir}/live-db-tests.json"
server_version_report="${artifact_dir}/postgres-server-version.txt"

mkdir -p "$artifact_dir"
exec > >(tee "$migration_log") 2>&1

for command in psql pg_isready find sort bun; do
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

PGPASSWORD="$POSTGRES_PASSWORD" psql "${psql_args[@]}" \
  --tuples-only --no-align \
  --command "SELECT extname || ':' || extversion FROM pg_extension WHERE extname = 'vector';"

if [[ "$mode" == "migrate-only" ]]; then
  printf 'Migration-only validation completed.\n'
  exit 0
fi

RUN_E2E_TESTS=true bun vitest run \
  --config vitest.config.live-db.ts \
  --reporter=json \
  --outputFile="$test_report"
