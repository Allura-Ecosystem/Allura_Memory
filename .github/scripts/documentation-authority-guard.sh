#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CANONICAL="$ROOT/.opencode/skills/ai-guidelines/SKILL.md"
STATUS=0

echo "documentation-authority-guard: checking sole policy authority"

if [[ ! -f "$CANONICAL" ]]; then
  echo "ERROR: missing canonical authority: .opencode/skills/ai-guidelines/SKILL.md"
  STATUS=1
fi

if ! grep -q '^name: ai-guidelines$' "$CANONICAL" 2>/dev/null; then
  echo "ERROR: canonical authority is not a valid ai-guidelines skill"
  STATUS=1
fi

if [[ -e "$ROOT/guidelines/AI-GUIDELINES.md" ]]; then
  echo "ERROR: competing live guideline exists: guidelines/AI-GUIDELINES.md"
  STATUS=1
fi

COMPATIBILITY_FILES=(
  ".opencode/rules/AI-GUIDELINES.md"
  ".opencode/AI-GUIDELINES.md"
  ".opencode/guidelines/AI-GUIDELINES.md"
  ".opencode/context/development/principles/AI-GUIDELINES.md"
  ".claude/rules/AI-GUIDELINES.md"
)

for rel in "${COMPATIBILITY_FILES[@]}"; do
  file="$ROOT/$rel"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing compatibility pointer: $rel"
    STATUS=1
    continue
  fi
  if ! grep -Eqi 'non-normative|compatibility gate' "$file"; then
    echo "ERROR: compatibility file does not declare itself non-normative: $rel"
    STATUS=1
  fi
  if ! grep -q 'skills/ai-guidelines/SKILL.md' "$file"; then
    echo "ERROR: compatibility file does not point to the canonical authority: $rel"
    STATUS=1
  fi
done

if [[ "$STATUS" -ne 0 ]]; then
  echo "documentation-authority-guard: FAILED"
  exit "$STATUS"
fi

echo "documentation-authority-guard: OK"
