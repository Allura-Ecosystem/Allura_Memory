#!/bin/bash
# Dashboard Resurrection Guard
# Fails CI if old dashboard imports/strings/directories are introduced
# Created: 2026-05-21 by Troy Curator
# Source: memory/2026-05-20.md kill list + hard constraints

set -e

ERRORS=0

echo "🔍 Running dashboard resurrection guard..."

# ── Forbidden directories ──────────────────────────────────────

if [ -d "src/components/dashboard" ]; then
  echo "❌ Forbidden directory exists: src/components/dashboard/"
  ERRORS=1
fi

# ── Forbidden imports ──────────────────────────────────────────

if grep -r "@/components/dashboard" src/app/\(main\)/dashboard/ 2>/dev/null; then
  echo "❌ Forbidden import: @/components/dashboard"
  ERRORS=1
fi

# ── Forbidden strings ──────────────────────────────────────────

FORBIDDEN_STRINGS=(
  "Allura Memory"
  "agency-card"
  "metric-card"
  "lettermark-AL.png"
  "Dashboard — Allura Memory"
)

for term in "${FORBIDDEN_STRINGS[@]}"; do
  if grep -r "$term" src/app/\(main\)/dashboard/ 2>/dev/null; then
    echo "❌ Forbidden string: $term"
    ERRORS=1
  fi
done

# ── Forbidden sidebar/top-nav patterns ─────────────────────────

if grep -r "app-sidebar\|top-nav-bar" src/app/\(main\)/dashboard/ 2>/dev/null; then
  echo "❌ Forbidden component import: app-sidebar or top-nav-bar"
  ERRORS=1
fi

# ── Old dashboard shell patterns ─────────────────────────────────

if grep -r "WORK.*TOOLS.*SYSTEM\|Decisions.*Projects.*Team.*Records" src/app/\(main\)/dashboard/ 2>/dev/null; then
  echo "❌ Old dashboard sidebar structure detected"
  ERRORS=1
fi

# ── Result ───────────────────────────────────────────────────────

if [ $ERRORS -eq 1 ]; then
  echo ""
  echo "🚫 Dashboard guard FAILED. Old dashboard artifacts detected."
  echo "   See memory/2026-05-20.md for the kill list and visual direction."
  exit 1
fi

echo "✅ Dashboard guard passed — no resurrection artifacts found."
