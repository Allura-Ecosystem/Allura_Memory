#!/usr/bin/env bash
set -Eeuo pipefail

artifact_dir="artifacts/ci/${GITHUB_SHA:-local}/benchmark"
for arg in "$@"; do
  case "$arg" in
    --artifact-dir=*) artifact_dir="${arg#*=}" ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 64 ;;
  esac
done

mkdir -p "$artifact_dir"
gateway_log="${artifact_dir}/gateway.log"
benchmark_report="${artifact_dir}/benchmark-results.json"
gateway_port="${ALLURA_MCP_HTTP_PORT:-6477}"
benchmark_auth_env="$(mktemp)"

bash scripts/ci/run-live-db-tests.sh \
  --migrate-only \
  --artifact-dir="${artifact_dir}/database"

bun run scripts/ci/provision-benchmark-auth.ts --env-file="$benchmark_auth_env"
source "$benchmark_auth_env"
export BENCHMARK_AUTH_TOKEN

ALLURA_MCP_HTTP_PORT="$gateway_port" bun run mcp:http >"$gateway_log" 2>&1 &
gateway_pid=$!
cleanup() {
  kill "$gateway_pid" 2>/dev/null || true
  wait "$gateway_pid" 2>/dev/null || true
  rm -f "$benchmark_auth_env"
}
trap cleanup EXIT

ready=false
for _attempt in $(seq 1 90); do
  if ! kill -0 "$gateway_pid" 2>/dev/null; then
    printf 'MCP gateway exited before becoming ready.\n' >&2
    tail -n 100 "$gateway_log" >&2 || true
    exit 70
  fi
  if curl --fail --silent --show-error "http://127.0.0.1:${gateway_port}/ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != "true" ]]; then
  printf 'MCP gateway did not become ready within 90 polling attempts.\n' >&2
  tail -n 100 "$gateway_log" >&2 || true
  exit 70
fi

BENCHMARK_BRAIN_URL="http://127.0.0.1:${gateway_port}/mcp" \
  bun run benchmark -- --ci-baseline --require-gateway --json="$benchmark_report"
