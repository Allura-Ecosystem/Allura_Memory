#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DOCS_DIR="$ROOT/docs/allura"

if [[ ! -d "$DOCS_DIR" ]]; then
  echo "docs-allura-canonical-guard: missing docs/allura directory"
  exit 1
fi

status=0

is_allowed_file() {
  local rel="$1"
  case "$rel" in
    BLUEPRINT.md) return 0 ;;
    SOLUTION-ARCHITECTURE.md) return 0 ;;
    REQUIREMENTS-MATRIX.md) return 0 ;;
    RISKS-AND-DECISIONS.md) return 0 ;;
    DATA-DICTIONARY.md) return 0 ;;
    DESIGN-*.md) return 0 ;;
    index.md) return 0 ;;
    *) return 1 ;;
  esac
}

echo "docs-allura-canonical-guard: checking docs/allura canonical surface"

while IFS= read -r path; do
  rel="${path#"$DOCS_DIR/"}"
  if [[ "$rel" == */* ]]; then
    top="${rel%%/*}"
    echo "ERROR: docs/allura contains nested non-canonical path: $rel"
    echo "       Move execution artifacts to _bmad/ or docs/archive/allura/."
    status=1
    continue
  fi

  if ! is_allowed_file "$rel"; then
    echo "ERROR: non-canonical docs/allura file: $rel"
    echo "       Allowed: BLUEPRINT.md, SOLUTION-ARCHITECTURE.md, DESIGN-*.md, REQUIREMENTS-MATRIX.md, RISKS-AND-DECISIONS.md, DATA-DICTIONARY.md, index.md."
    echo "       Move PRDs, epics, reports, gates, benchmarks, and runbooks to _bmad/ or docs/archive/allura/."
    status=1
  fi
done < <(find "$DOCS_DIR" -mindepth 1 -type f | sort)

while IFS= read -r dir; do
  rel="${dir#"$DOCS_DIR/"}"
  echo "ERROR: docs/allura contains nested directory: $rel/"
  echo "       Canonical architecture docs must be direct files only."
  status=1
done < <(find "$DOCS_DIR" -mindepth 1 -type d | sort)

if [[ "$status" -ne 0 ]]; then
  echo "docs-allura-canonical-guard: FAILED"
  exit "$status"
fi

echo "docs-allura-canonical-guard: OK"
