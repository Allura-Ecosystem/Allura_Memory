#!/usr/bin/env bash
# docs-backend-residue-guard.sh — Story 24.8 AC-9
#
# Fails the build when ACTIVE canonical docs or runtime descriptions still
# reference retired graph backends (Neo4j) as if they were current.
#
# Why this exists: the Neo4j sunset (Epic 23, 2026-07-17) removed the graph
# backend from the runtime, but active docs continued to describe "Neo4j
# semantic promotion", "GRAPH_BACKEND=neo4j fallback", and "promotes to Neo4j"
# as current behavior. A reader following those docs would look for a store
# that no longer exists. This gate makes that drift loud.
#
# Deliberately NOT forbidden (historical records legitimately cite the old
# names; never rewrite history):
#   - docs/archive/**            : archived history, preserved verbatim
#   - RISKS-AND-DECISIONS.md     : decision log; past decisions name Neo4j
#   - AD-49 / AD-50 / RK-32 refs : decision identifiers, not active claims
#   - "Neo4j sunset" / "sunset"  : statements that the backend was removed
#
# The guard scans ACTIVE docs (docs/allura, docs/enterprise, docs/portfolio,
# README.md) and runtime description surfaces (.opencode, .claude, .agents)
# for Neo4j identifiers used as CURRENT state. It allows only:
#   - explicit sunset/removal statements
#   - historical/decision-log context
#   - archived paths
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS=0

# Active surfaces that must describe only the current PostgreSQL/RuVector
# architecture. Historical records live under docs/archive/** and are excluded.
ACTIVE_DOCS=(
  "$ROOT/docs/allura"
  "$ROOT/docs/enterprise"
  "$ROOT/docs/portfolio"
  "$ROOT/README.md"
)
# Runtime description surfaces — scanned for residue in markdown/config only.
# Kept narrow so the guard stays fast; deep scans belong to the canonical guard.
RUNTIME_SURFACES=(
  "$ROOT/.opencode/agent"
  "$ROOT/.claude/agents"
  "$ROOT/.agents"
)

# Identifiers that signal a retired backend described as current.
# "sunset" and "removed" are allowed (they state the retirement).
FORBIDDEN_PATTERNS=(
  "GRAPH_BACKEND=neo4j"
  "GRAPH_BACKEND = neo4j"
  "Neo4j semantic promotion"
  "promotes to Neo4j"
  "promote to Neo4j"
  "stored in Neo4j"
  "Neo4j as fallback"
  "Neo4j fallback"
  "Neo4j driver"
  "Neo4j Community"
  "Neo4j node"
  "Neo4j relationship"
  "Neo4j data"
  "Neo4j unavailable"
  "Neo4j errors"
  "Neo4j backend"
  "Neo4j store"
  "Neo4j graph"
)

# Lines that state the retirement are allowed even when they mention Neo4j.
ALLOWED_CONTEXT=(
  "sunset"
  "removed"
  "retired"
  "deprecated"
  "no longer"
  "was sunset"
  "has been removed"
  "historical"
  "archive"
  "AD-49"
  "AD-50"
  "RK-32"
  "decision"
  "cutover"
  "migration"
  "replace"
  "replacing"
  "replaced"
  "replaces"
  "replicate"
  "replicates"
  "AD-29"
)

# Decision-log files legitimately record past decisions that name Neo4j.
# They are historical records, not active architecture claims.
is_decision_log() {
  local file="$1"
  case "$file" in
    *RISKS-AND-DECISIONS.md) return 0 ;;
    *) return 1 ;;
  esac
}

is_allowed_context() {
  local line="$1"
  for ctx in "${ALLOWED_CONTEXT[@]}"; do
    if grep -Eiq "$ctx" <<<"$line"; then
      return 0
    fi
  done
  return 1
}

scan_file() {
  local file="$1"
  local rel="${file#"$ROOT"/}"
  if is_decision_log "$file"; then
    return 0
  fi
  # Single-pass grep: one alternation over the whole file instead of a
  # nested per-line × per-pattern loop (which took minutes on vendored trees).
  local combined
  combined=$(printf '%s\n' "${FORBIDDEN_PATTERNS[@]}" | paste -sd'|' -)
  local line_no=0
  while IFS= read -r line; do
    line_no=$((line_no + 1))
    if grep -Eiq "$combined" <<<"$line"; then
      if ! is_allowed_context "$line"; then
        echo "ERROR: $rel:$line_no — retired backend described as current"
        echo "       Line: $line"
        echo "       Neo4j was sunset in Epic 23 (2026-07-17). Update to the PostgreSQL/RuVector architecture."
        STATUS=1
      fi
    fi
  done <"$file"
}

echo "docs-backend-residue-guard: checking active docs + runtime surfaces for retired backend residue"

for dir in "${ACTIVE_DOCS[@]}"; do
  if [[ -d "$dir" ]]; then
    while IFS= read -r file; do
      scan_file "$file"
    done < <(find "$dir" -name '*.md' -print | sort)
  elif [[ -f "$dir" ]]; then
    scan_file "$dir"
  fi
done

for dir in "${RUNTIME_SURFACES[@]}"; do
  if [[ -d "$dir" ]]; then
    # Only scan TRACKED files. .agents/ is gitignored vendored content
    # (1065 generated skill files); scanning it makes this guard take
    # minutes in CI. git ls-files keeps the scan to authored surfaces.
    while IFS= read -r file; do
      case "$file" in
        *.md|*.json|*.toml|*.yaml|*.yml) scan_file "$file" ;;
      esac
    done < <(git -C "$ROOT" ls-files "$dir" | sort)
  fi
done

# ── Internal link + evidence resolution check (Story 24.8 AC-9) ─────────────
# Fails when an ACTIVE doc links to a missing internal markdown file, or when
# a capability-matrix evidence link does not resolve. Relative links only;
# http(s) links and anchors are out of scope for this guard.
check_links() {
  local file="$1"
  local rel="${file#"$ROOT"/}"
  local dir
  dir="$(dirname "$file")"
  local target
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    # Skip anchors, http(s), mailto, and code spans
    case "$target" in
      \#*|http://*|https://*|mailto:*|*'`'*) continue ;;
    esac
    # Skip regex-looking targets (e.g. `[a-z0-9-]*[a-z0-9]` inside code spans)
    case "$target" in
      *'['*|*']'*|*'*'*) continue ;;
    esac
    # Strip any anchor fragment
    local path="${target%%#*}"
    [[ -z "$path" ]] && continue
    if [[ ! -e "$dir/$path" ]]; then
      echo "ERROR: $rel — broken internal link: $target"
      STATUS=1
    fi
  done < <(grep -oE '\]\([^)]+\)' "$file" | sed -E 's/^\]\(//; s/\)$//')
}

for dir in "${ACTIVE_DOCS[@]}"; do
  if [[ -d "$dir" ]]; then
    while IFS= read -r file; do
      check_links "$file"
    done < <(find "$dir" -name '*.md' -print | sort)
  elif [[ -f "$dir" ]]; then
    check_links "$dir"
  fi
done

if [[ "$STATUS" -ne 0 ]]; then
  echo "docs-backend-residue-guard: FAILED — active docs describe a retired backend as current, or contain broken internal links"
  exit "$STATUS"
fi

echo "docs-backend-residue-guard: OK — no retired backend residue in active surfaces; all internal links resolve"
