#!/usr/bin/env bash
# Fails the build if a migration creates a PostgreSQL view without a
# security_invoker guarantee anywhere in docker/postgres-init/.
#
# Why this exists: PostgreSQL views default to security_invoker = false,
# meaning the view body runs with the (often BYPASSRLS) OWNER's privileges,
# not the querying role's -- silently bypassing FORCE ROW LEVEL SECURITY on
# any RLS-protected table the view selects from. This is the exact CRITICAL
# defect class closed by migration 51 (docker/postgres-init/51-view-security-
# invoker-hardening.sql) for brooks_* and skill_usage_summary, and avoided
# from the start by migration 50 (bumblebee_current_*) via an inline
# `WITH (security_invoker = true)` clause on every CREATE VIEW.
#
# A view is considered covered if EITHER:
#   1. Its own CREATE VIEW / CREATE OR REPLACE VIEW statement includes
#      `security_invoker` inline (migration 50's pattern), or
#   2. Some migration in this directory later runs
#      `ALTER VIEW <name> SET (security_invoker = true)` (migration 51's
#      pattern -- the correct forward-only fix for a view that predates this
#      guard).
#
# This intentionally does not require ordering between (1) and (2) within a
# single PR; it only requires that the coverage exists somewhere in the
# shipped migration set by the time CI runs.
set -uo pipefail

MIGRATIONS_DIR="docker/postgres-init"

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "view-security-invoker-guard: no ${MIGRATIONS_DIR} directory -- skipping"
  exit 0
fi

# Comment-stripped concatenation of every migration, built once and reused
# for every check below. SQL line comments (`-- ...`) are stripped so prose
# mentioning "CREATE VIEW" or "ALTER VIEW ... security_invoker" (e.g. this
# guard's own migration-51 rationale comments) is never mistaken for a real
# statement in either direction -- neither a false positive on view-name
# detection nor a false negative on coverage.
sql_only=$(for f in "${MIGRATIONS_DIR}"/*.sql; do sed -E 's/--.*$//' "${f}"; done)
# Flattened to a single line (newlines -> spaces) so a bounded-window regex
# can match a WITH (security_invoker = true) clause that wraps onto the line
# after the view name, without needing NUL-separated `grep -z` output.
sql_flat=$(echo "${sql_only}" | tr '\n' ' ')

# Every view name introduced by a CREATE VIEW / CREATE OR REPLACE VIEW
# statement, deduplicated, in order of first appearance.
mapfile -t view_names < <(
  echo "${sql_only}" \
    | grep -oE 'CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?VIEW[[:space:]]+[A-Za-z0-9_."]+' \
    | sed -E 's/CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?VIEW[[:space:]]+//' \
    | tr -d '"' \
    | sort -u
)

if [[ ${#view_names[@]} -eq 0 ]]; then
  echo "view-security-invoker-guard: no views found -- OK"
  exit 0
fi

status=0
for view in "${view_names[@]}"; do
  # Coverage 1: the view's own CREATE statement declares security_invoker
  # inline (migration 50's pattern). Matches across a possible line break
  # between the view name and the WITH clause via a bounded window.
  inline_hit=$(echo "${sql_flat}" | grep -oP "CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+${view}\b[^;]{0,200}security_invoker" || true)

  # Coverage 2: a forward ALTER VIEW sets security_invoker for this view,
  # anywhere in the migration set (migration 51's grandfather-fix pattern).
  alter_hit=$(echo "${sql_only}" | grep -E "ALTER\s+VIEW\s+${view}\b.*security_invoker" || true)

  if [[ -z "${inline_hit}" && -z "${alter_hit}" ]]; then
    echo "  FAIL: view '${view}' has no security_invoker coverage" \
      "(neither an inline WITH (security_invoker = true) clause nor a" \
      "later ALTER VIEW ... SET (security_invoker = true))"
    status=1
  fi
done

if [[ ${status} -ne 0 ]]; then
  echo ""
  echo "view-security-invoker-guard: FAIL"
  echo "Every view over an RLS-protected table must run under the querying"
  echo "role's own permissions, not the (often BYPASSRLS) view owner's. Add"
  echo "either:"
  echo "  CREATE VIEW my_view WITH (security_invoker = true) AS ..."
  echo "or, for a view that predates this guard:"
  echo "  ALTER VIEW my_view SET (security_invoker = true);"
  exit 1
fi

echo "view-security-invoker-guard: OK (${#view_names[@]} view(s) checked)"
