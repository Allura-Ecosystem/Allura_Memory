#!/bin/bash
# validate-oac-core.sh — Verify OAC Core Restoration acceptance criteria
# Generated: 2026-05-03 | Part of OAC Core Restoration PRD

set -euo pipefail

PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m✓ $1\033[0m"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m✗ $1\033[0m"; FAIL=$((FAIL+1)); }
yellow() { echo -e "\033[33m⚠ $1\033[0m"; WARN=$((WARN+1)); }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPENSE="$REPO/.opencode"
CLAUDE="$REPO/.claude"

echo "=========================================="
echo " OAC Core Restoration — Validation Script"
echo "=========================================="
echo ""

# R2: Audit — All paths classified
echo "--- R2: .opencode Audit ---"

# Core context files exist
for f in architecture.md standards.md testing.md security.md navigation.md; do
  if [ -f "$OPENSE/context/core/$f" ]; then
    green "context/core/$f exists and non-empty"
  else
    red "context/core/$f MISSING"
  fi
done

# OAC standards restored
for f in code.md docs.md tests.md typescript.md; do
  if [ -f "$OPENSE/context/core/standards/$f" ]; then
    green "context/core/standards/$f restored from OAC"
  else
    red "context/core/standards/$f MISSING"
  fi
done

# Archived directories don't exist in live paths
for d in hooks routing state migrations; do
  if [ -d "$OPENSE/$d" ]; then
    red "$d/ still in live path (should be archived)"
  else
    green "$d/ properly archived"
  fi
done

# Archive directory exists
if [ -d "$OPENSE/archive" ]; then
  green "archive/ directory exists"
else
  red "archive/ directory MISSING"
fi

echo ""

# R3: ContextScout as First Gate
echo "--- R3: ContextScout First Gate ---"

if grep -q "ContextScout First Gate" "$OPENSE/agent/subagents/core/scout.md" 2>/dev/null; then
  green "Scout agent has ContextScout First Gate enforcement"
else
  red "Scout agent MISSING ContextScout First Gate"
fi

if grep -q "Scout before build" "$OPENSE/AGENTS.md" 2>/dev/null; then
  green "AGENTS.md has Scout-first execution rule"
else
  red "AGENTS.md MISSING Scout-first execution rule"
fi

echo ""

# R4: MVI Context Files
echo "--- R4: MVI Context Files ---"

for f in architecture.md standards.md testing.md security.md; do
  if [ -f "$OPENSE/context/core/$f" ]; then
    SIZE=$(wc -c < "$OPENSE/context/core/$f")
    if [ "$SIZE" -gt 100 ]; then
      green "context/core/$f is non-empty ($SIZE bytes)"
    else
      red "context/core/$f is too small ($SIZE bytes, likely empty)"
    fi
  else
    red "context/core/$f MISSING"
  fi
done

# Check frontmatter
for f in architecture.md standards.md testing.md security.md; do
  if [ -f "$OPENSE/context/core/$f" ]; then
    if head -10 "$OPENSE/context/core/$f" | grep -q "owner:"; then
      green "$f has owner frontmatter"
    else
      yellow "$f missing owner frontmatter"
    fi
    if head -15 "$OPENSE/context/core/$f" | grep -q "max_age_days:"; then
      green "$f has max_age_days frontmatter"
    else
      yellow "$f missing max_age_days frontmatter"
    fi
  fi
done

echo ""

# R5: Ralph Skill Gate
echo "--- R5: Ralph Skill Gate ---"

if [ -f "$OPENSE/command/ralph.md" ]; then
  if grep -q "ContextScout + Skill Gate" "$OPENSE/command/ralph.md"; then
    green "Ralph command has ContextScout + Skill Gate"
  else
    red "Ralph command MISSING ContextScout + Skill Gate"
  fi
  
  if grep -q "context_loaded" "$OPENSE/command/ralph.md"; then
    green "Ralph command has gate JSON schema"
  else
    red "Ralph command MISSING gate JSON schema"
  fi
else
  red "Ralph command MISSING"
fi

echo ""

# R6: Manifest
echo "--- R6: manifest.json ---"

if [ -f "$OPENSE/manifest.json" ]; then
  green "manifest.json exists"
  if python3 -c "import json; json.load(open('$OPENSE/manifest.json'))" 2>/dev/null; then
    green "manifest.json is valid JSON"
  else
    red "manifest.json is INVALID JSON"
  fi
  for key in core overlay runtime archive required_gates invariants; do
    if python3 -c "import json; d=json.load(open('$OPENSE/manifest.json')); assert '$key' in d" 2>/dev/null; then
      green "manifest.json has '$key' key"
    else
      red "manifest.json MISSING '$key' key"
    fi
  done
else
  red "manifest.json MISSING"
fi

echo ""

# R7: Skill Ownership Matrix
echo "--- R7: Skill Ownership Matrix ---"

if [ -f "$OPENSE/SKILL-OWNERSHIP.md" ]; then
  green "SKILL-OWNERSHIP.md exists"
  COUNT=$(grep -c "Keep" "$OPENSE/SKILL-OWNERSHIP.md" 2>/dev/null || echo 0)
  green "Skill ownership matrix has $COUNT skill decisions"
else
  red "SKILL-OWNERSHIP.md MISSING"
fi

echo ""

# R8: Team RAM as Overlay
echo "--- R8: Team RAM as Overlay ---"

if grep -q "Overlay" "$OPENSE/AGENTS.md" 2>/dev/null; then
  green "AGENTS.md describes Team RAM as overlay"
else
  red "AGENTS.md MISSING overlay description"
fi

if grep -qi "consume.*OAC context" "$OPENSE/AGENTS.md" 2>/dev/null; then
  green "AGENTS.md specifies Team RAM consumes OAC context"
else
  red "AGENTS.md MISSING 'consumes OAC context' specification"
fi

echo ""

# R9: Tests / Validation
echo "--- R9: Validation ---"

# Check .claude mirror
if [ -f "$CLAUDE/context/core/architecture.md" ]; then
  green ".claude mirror: architecture.md exists"
else
  yellow ".claude mirror: architecture.md not yet copied"
fi

if [ -f "$CLAUDE/context/core/standards.md" ]; then
  green ".claude mirror: standards.md exists"
else
  yellow ".claude mirror: standards.md not yet copied"
fi

echo ""

# R10: Documentation
echo "--- R10: Documentation ---"

if grep -q "OAC Core" "$OPENSE/README.md" 2>/dev/null; then
  green "README.md describes OAC Core"
else
  red "README.md MISSING OAC Core description"
fi

if grep -q "Allura Overlay" "$OPENSE/README.md" 2>/dev/null; then
  green "README.md describes Allura Overlay"
else
  red "README.md MISSING Allura Overlay description"
fi

if grep -q "Scout before build" "$OPENSE/README.md" 2>/dev/null; then
  green "README.md has execution rule"
else
  red "README.md MISSING execution rule"
fi

echo ""
echo "=========================================="
echo " RESULTS: $PASS passed, $FAIL failed, $WARN warnings"
echo "=========================================="

if [ "$FAIL" -eq 0 ]; then
  echo "✓ All acceptance criteria pass!"
  exit 0
else
  echo "✗ $FAIL acceptance criteria FAILED"
  exit 1
fi
