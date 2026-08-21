#!/usr/bin/env bash
# Fails the build if identifiers retired by the src/kernel -> src/control-plane
# rename (2026-08-20) reappear in live code, config, or CI.
#
# Why this exists: the rename spanned four conventions — control-plane, controlPlane,
# control_plane, and "control plane" — and a grep matching only one form misclassified
# eight of the rename's own files as unrelated work. A rename of this blast radius
# partially regresses on the first merge conflict from a branch cut before it, and the
# resulting split-brain fails silently. This gate makes that failure loud.
#
# Deliberately NOT forbidden (documented back-compat, see PR #71):
#   - permission_tier "kernel"      : signed-claims value, aliased during a deprecation window
#   - MEMORY_BYPASS_KERNEL          : read as a deprecated fallback with a warning
#   - kernel_rule                   : retained in event.schema.json; events are append-only
set -uo pipefail

FORBIDDEN=("src/kernel/" "RUVIX_KERNEL_SECRET")
# Historical records legitimately cite the old names; never rewrite history.
EXCLUDES=(":(exclude)docs/archive/**" ":(exclude).github/scripts/retired-identifier-guard.sh")

status=0
for pattern in "${FORBIDDEN[@]}"; do
  echo "==> checking for retired identifier: ${pattern}"
  if hits=$(git grep -n -F "${pattern}" -- . "${EXCLUDES[@]}" 2>/dev/null); then
    echo "${hits}"
    echo "    FAIL: '${pattern}' was retired by the control-plane rename."
    status=1
  else
    echo "    ok — no live references"
  fi
done

if [[ ${status} -ne 0 ]]; then
  echo ""
  echo "Retired identifiers reappeared. Use the control-plane names:"
  echo "  src/kernel/          -> src/control-plane/"
  echo "  RUVIX_KERNEL_SECRET  -> RUVIX_CONTROL_PLANE_SECRET"
  exit 1
fi
echo "retired-identifier-guard: OK"
