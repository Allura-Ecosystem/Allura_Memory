#!/bin/bash
# validate-oac-core.sh — Verify current flat Team RAM + Ultra harness assets

set -euo pipefail

PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m✗ $1\033[0m"; FAIL=$((FAIL+1)); }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPENCODE="$REPO/.opencode"

echo "=========================================="
echo " Flat Team RAM + Ultra Validation"
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
  if grep -q "$needle" "$path" 2>/dev/null; then
    green "$label"
  else
    red "$label"
  fi
}

echo "--- Core harness files ---"
check_file "$OPENCODE/AI-GUIDELINES.md"
check_file "$REPO/opencode.json"
check_file "$OPENCODE/command/ultra.md"
check_file "$OPENCODE/command/ulw.md"
check_file "$OPENCODE/command/ralph.md"
check_file "$OPENCODE/command/quick-commands.md"

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
echo "--- Ultra loop artifacts ---"
check_file "$OPENCODE/ralph/PROMPT_ultra.md"
check_file "$OPENCODE/ralph/loop-runner.md"
check_contains "$OPENCODE/command/quick-commands.md" '/ultra' 'quick-commands includes /ultra'
check_contains "$OPENCODE/command/quick-commands.md" '/ulw-loop' 'quick-commands includes /ulw-loop'

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
