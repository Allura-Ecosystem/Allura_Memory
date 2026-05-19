#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "[codex-action] running Mission Control targeted tests"
candidate_tests=(
  src/lib/adapter-registry/__tests__/registry.test.ts
  src/lib/adapter-registry/__tests__/pike-review.test.ts
  src/lib/adapter-registry/__tests__/malformed-registry.test.ts
  src/lib/adapter-registry/__tests__/story0-fr-12-13-14.test.ts
  src/lib/story2-safe-route.test.ts
  src/__tests__/dashboard-schemas.test.ts
  src/lib/dashboard/__tests__/allura-route.test.ts
  src/lib/dashboard/__tests__/mission-control-review-blockers.test.ts
  src/__tests__/health-metrics.test.ts
)

tests=()
for test_file in "${candidate_tests[@]}"; do
  if [[ -f "$test_file" ]]; then
    tests+=("$test_file")
  fi
done

if [[ ${#tests[@]} -eq 0 ]]; then
  echo "[mission-tests] no Mission Control test files found" >&2
  exit 1
fi

exec bun test "${tests[@]}"
