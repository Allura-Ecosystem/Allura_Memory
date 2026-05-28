#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS=0

echo "runtime-adapter-surface-guard: checking runtime adapter surfaces"

if [[ ! -d "$ROOT/.opencode/agent" ]]; then
  echo "ERROR: missing canonical .opencode/agent directory"
  STATUS=1
fi

if [[ ! -f "$ROOT/.opencode/guidelines/HOOKS.md" ]]; then
  echo "ERROR: missing .opencode/guidelines/HOOKS.md canonical hook policy"
  STATUS=1
fi

check_adapter_hooks() {
  local dir="$1"
  local label="$2"
  [[ -d "$dir" ]] || return 0

  while IFS= read -r path; do
    rel="${path#"$ROOT/"}"
    echo "WARN: $label contains hook-like adapter file: $rel"
    echo "      Ensure it mirrors .opencode/guidelines/HOOKS.md and does not introduce new authority."
  done < <(find "$dir" -iname '*hook*' -print | sort)
}

check_conflict_language() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if grep -Eiq 'source of truth|canonical|authoritative' "$file"; then
    rel="${file#"$ROOT/"}"
    echo "NOTICE: adapter file contains authority language: $rel"
    echo "        Confirm it says .opencode is canonical and adapter surfaces are mirrors/bridges."
  fi
}

check_adapter_hooks "$ROOT/.claude" ".claude"
check_adapter_hooks "$ROOT/.codex" ".codex"
check_adapter_hooks "$ROOT/.agents" ".agents"

check_conflict_language "$ROOT/.claude/AGENTS.md"
check_conflict_language "$ROOT/.codex/config.toml"
check_conflict_language "$ROOT/.agents/TEAM-RAM-RUNTIME.md"

if [[ "$STATUS" -ne 0 ]]; then
  echo "runtime-adapter-surface-guard: FAILED"
  exit "$STATUS"
fi

echo "runtime-adapter-surface-guard: OK"
