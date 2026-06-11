#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Allura Governance Hook: Sprint Status Verification
# ═══════════════════════════════════════════════════════════════════════════════
#
# Runs after every git commit. Checks if story-related files were committed
# without updating sprint-status.yaml. Outputs a warning that Claude Code
# surfaces to the agent.
#
# Enforcement level: WARN (does not block commit, but flags the gap)
# To make it blocking: change exit 0 to exit 1 at the bottom
#
# Install: Add to .claude/settings.json hooks section
# ═══════════════════════════════════════════════════════════════════════════════

SPRINT_STATUS="docs/archive/bmad-legacy/bmm/stories/sprint-status.yaml"

# Get files changed in the last commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Check if any story-related code was committed
HAS_STORY_CODE=false
HAS_SPRINT_UPDATE=false

# Patterns that indicate story implementation work
STORY_PATTERNS=(
  "src/app/dashboard/"
  "src/components/dashboard/"
  "src/lib/auth/"
  "src/lib/security/"
  "src/middleware.ts"
  "src/store/"
  "src/app/api/"
  "next.config"
)

for file in $CHANGED_FILES; do
  # Check if sprint-status was updated
  if echo "$file" | grep -q "sprint-status.yaml"; then
    HAS_SPRINT_UPDATE=true
  fi

  # Check if any story-related files were changed
  for pattern in "${STORY_PATTERNS[@]}"; do
    if echo "$file" | grep -q "$pattern"; then
      HAS_STORY_CODE=true
      break
    fi
  done
done

# If story code was committed without sprint-status update, warn
if [ "$HAS_STORY_CODE" = true ] && [ "$HAS_SPRINT_UPDATE" = false ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  GOVERNANCE WARNING: sprint-status.yaml not updated"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo "  Story-related code was committed but sprint-status.yaml"
  echo "  was not included. If this commit ships a story, update:"
  echo ""
  echo "    $SPRINT_STATUS"
  echo ""
  echo "  Mark completed stories as 'done' and update last_updated."
  echo ""
  echo "  Rule: BROOKS-TRACKING.md + Epic 11 Retro Action Item"
  echo "════════════════════════════════════════════════════════════"
  echo ""
fi

exit 0
