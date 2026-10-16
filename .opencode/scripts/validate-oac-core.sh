#!/bin/bash
# validate-oac-core.sh — Verify the active Team RAM startup and bounded workflow

set -euo pipefail

PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m✗ $1\033[0m"; FAIL=$((FAIL+1)); }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPENCODE="$REPO/.opencode"

echo "=========================================="
echo " Team RAM Startup + Bounded Workflow Validation"
echo "=========================================="
echo ""

check_file() {
  local path="$1"
  if [ -s "$path" ]; then
    green "$path exists"
  else
    red "$path missing or empty"
  fi
}

check_contains() {
  local path="$1"
  local needle="$2"
  local label="$3"
  if rg -q -- "$needle" "$path" 2>/dev/null; then
    green "$label"
  else
    red "$label"
  fi
}

echo "--- Core harness files ---"
check_file "$OPENCODE/AI-GUIDELINES.md"
check_file "$REPO/opencode.json"
check_file "$OPENCODE/command/ultra.md"
check_file "$OPENCODE/STARTUP.md"
check_file "$OPENCODE/command/goal.md"
check_file "$REPO/tooling/agent-sync/models.map.json"

echo ""
echo "--- Flat Team RAM agents ---"
for f in \
  "$OPENCODE/agent/core/brooks.md" \
  "$OPENCODE/agent/core/jobs.md" \
  "$OPENCODE/agent/subagents/core/scout.md" \
  "$OPENCODE/agent/subagents/code/woz.md" \
  "$OPENCODE/agent/subagents/code/bellard.md" \
  "$OPENCODE/agent/subagents/code/carmack.md" \
  "$OPENCODE/agent/subagents/review/pike.md" \
  "$OPENCODE/agent/subagents/review/fowler.md" \
  "$OPENCODE/agent/subagents/infrastructure/knuth.md" \
  "$OPENCODE/agent/subagents/infrastructure/hightower.md"; do
  check_file "$f"
done

echo ""
echo "--- Active bounded workflow ---"
check_file "$OPENCODE/contracts/ralph-integration.md"
check_file "$REPO/scripts/agents/ralph-loop.ts"
check_contains "$OPENCODE/command/goal.md" --max-iterations\ 1 'goal execution has an explicit iteration bound'
check_contains "$OPENCODE/command/ultra.md" --max-iterations\ 1 'Ultra declares an explicit iteration bound'
check_contains "$OPENCODE/command/ultra.md" '^4\. Hydrate local context and search Allura Brain before editing$' 'Ultra requires Scout hydration'
check_contains "$OPENCODE/command/ultra.md" '^5\. Resolve required skills before implementation$' 'Ultra resolves skills'
check_contains "$OPENCODE/command/ultra.md" '^7\. Validate with the lightest meaningful checks$' 'Ultra requires validation'
if rg -q 'user_id: "brooks-architect"|agent_id: "brooks-architect"' "$OPENCODE/command/goal.md"; then
  red 'goal asserts an unverified persona identity'
else
  green 'goal does not assert a persona identity'
fi
if rg -q '\.opencode/ralph/|/ulw-loop' "$OPENCODE/command/ultra.md"; then
  red 'Ultra references retired runtime files or commands'
else
  green 'Ultra uses current workflow references'
fi

echo ""
echo "--- Generated routing and adapters ---"
if bun "$REPO/tooling/agent-sync/sync-agents.mjs" --check; then
  green 'canonical agents, runtime adapters, Claude mirrors, and configs agree'
else
  red 'generated agent/model/config drift'
fi

echo ""
echo "--- JSON sanity ---"
if python3 -c "import json; json.load(open('$REPO/opencode.json'))"; then
  green "opencode.json parses"
else
  red "opencode.json invalid"
fi

echo ""
echo "=========================================="
echo " RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -eq 0 ]; then
  exit 0
fi

exit 1
