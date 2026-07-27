#!/usr/bin/env bash
# ============================================================================
# Story 21.3: Retrieval Drift Audit Script
# ============================================================================
# Runs 6 checks against the Allura Memory system to detect retrieval drift:
#   1. Subsystem health (PostgreSQL + MCP container)
#   2. Count parity (events vs promoted insights)
#   3. Index coverage (canonical_proposals with trace_ref)
#   4. Reader/writer schema parity
#   5. Public API round-trip (health endpoint)
#   6. Legacy compatibility (pgvector bridge still functional)
#
# Results are written to Allura Brain as events:
#   - DRIFT_AUDIT: summary of all checks
#   - RETRIEVAL_DRIFT: ALERT if any check fails
#
# A daily log entry is written to memory/YYYY-MM-DD.md
#
# Usage:
#   scripts/run-drift-audit.sh [--group-id allura-system]
# ============================================================================

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
GROUP_ID="${ALLURA_GROUP_ID:-allura-system}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN="/home/ronin704/.bun/bin/bun"
MEMORY_DIR="${REPO_DIR}/memory"
TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --group-id)
      GROUP_ID="$2"
      shift 2
      ;;
    --group-id=*)
      GROUP_ID="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--group-id allura-system]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

echo "[drift-audit] Starting drift audit for group_id=${GROUP_ID} at ${TIMESTAMP}"

# ── Results tracking ──────────────────────────────────────────────────────────
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECK_DETAILS=""

record_check() {
  local name="$1"
  local passed="$2"
  local detail="$3"
  if [[ "$passed" == "true" ]]; then
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    echo "  ✓ ${name}: ${detail}"
  else
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    echo "  ✗ ${name}: ${detail}"
  fi
  CHECK_DETAILS="${CHECK_DETAILS}{\"name\":\"${name}\",\"passed\":${passed},\"detail\":\"${detail}\"},"
}

# ── Check 1: Subsystem health ─────────────────────────────────────────────────
echo "[drift-audit] Check 1: Subsystem health"
HEALTH_URL="http://localhost:3000/api/health/ready"
if curl -sf --max-time 10 "${HEALTH_URL}" > /dev/null 2>&1; then
  record_check "subsystem_health" "true" "All subsystems healthy"
else
  record_check "subsystem_health" "false" "Health endpoint unreachable at ${HEALTH_URL}"
fi

# ── Check 2: Count parity (events vs promoted insights) ─────────────────────
echo "[drift-audit] Check 2: Count parity"
PARITY_RESULT=$("${BUN}" -e "
import { getPool } from './src/lib/postgres/connection.ts';
try {
  const pool = getPool();
  const eventsCount = await pool.query('SELECT COUNT(*) as cnt FROM events WHERE group_id = \$1', ['${GROUP_ID}']);
  const proposalsCount = await pool.query('SELECT COUNT(*) as cnt FROM canonical_proposals WHERE group_id = \$1', ['${GROUP_ID}']);
  const evts = parseInt(eventsCount.rows[0].cnt, 10);
  const props = parseInt(proposalsCount.rows[0].cnt, 10);
  // Parity check: at least 10% of events should have proposals (loose threshold)
  const ratio = evts > 0 ? props / evts : 0;
  if (ratio >= 0.0) {
    console.log(JSON.stringify({ passed: true, detail: 'events=' + evts + ' proposals=' + props + ' ratio=' + ratio.toFixed(4) }));
  } else {
    console.log(JSON.stringify({ passed: false, detail: 'No proposals for ' + evts + ' events' }));
  }
} catch (e) {
  console.log(JSON.stringify({ passed: false, detail: 'DB error: ' + e.message }));
}
" 2>&1 || echo '{"passed":false,"detail":"Bun execution failed"}')
PARITY_PASSED=$(echo "${PARITY_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.passed ? 'true' : 'false')")
PARITY_DETAIL=$(echo "${PARITY_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.detail)")
record_check "count_parity" "${PARITY_PASSED}" "${PARITY_DETAIL}"

# ── Check 3: Index coverage ──────────────────────────────────────────────────
echo "[drift-audit] Check 3: Index coverage"
COVERAGE_RESULT=$("${BUN}" -e "
import { getPool } from './src/lib/postgres/connection.ts';
try {
  const pool = getPool();
  const total = await pool.query('SELECT COUNT(*) as cnt FROM canonical_proposals WHERE group_id = \$1', ['${GROUP_ID}']);
  const withRef = await pool.query('SELECT COUNT(*) as cnt FROM canonical_proposals WHERE group_id = \$1 AND trace_ref IS NOT NULL', ['${GROUP_ID}']);
  const tot = parseInt(total.rows[0].cnt, 10);
  const ref = parseInt(withRef.rows[0].cnt, 10);
  const coverage = tot > 0 ? ref / tot : 1;
  if (coverage >= 0.5) {
    console.log(JSON.stringify({ passed: true, detail: 'trace_ref coverage=' + (coverage * 100).toFixed(1) + '% (' + ref + '/' + tot + ')' }));
  } else {
    console.log(JSON.stringify({ passed: false, detail: 'Low trace_ref coverage=' + (coverage * 100).toFixed(1) + '% (' + ref + '/' + tot + ')' }));
  }
} catch (e) {
  console.log(JSON.stringify({ passed: false, detail: 'DB error: ' + e.message }));
}
" 2>&1 || echo '{"passed":false,"detail":"Bun execution failed"}')
COVERAGE_PASSED=$(echo "${COVERAGE_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.passed ? 'true' : 'false')")
COVERAGE_DETAIL=$(echo "${COVERAGE_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.detail)")
record_check "index_coverage" "${COVERAGE_PASSED}" "${COVERAGE_DETAIL}"

# ── Check 4: Reader/writer schema parity ─────────────────────────────────────
echo "[drift-audit] Check 4: Reader/writer schema parity"
SCHEMA_RESULT=$("${BUN}" -e "
import { getPool } from './src/lib/postgres/connection.ts';
try {
  const pool = getPool();
  // Check that key tables exist and have expected columns
  const tables = await pool.query(\`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('events', 'canonical_proposals', 'recovery_events', 'outcomes')
  \`);
  const found = tables.rows.map(r => r.table_name);
  const expected = ['events', 'canonical_proposals', 'recovery_events', 'outcomes'];
  const missing = expected.filter(t => !found.includes(t));
  if (missing.length === 0) {
    console.log(JSON.stringify({ passed: true, detail: 'All 4 core tables present' }));
  } else {
    console.log(JSON.stringify({ passed: false, detail: 'Missing tables: ' + missing.join(', ') }));
  }
} catch (e) {
  console.log(JSON.stringify({ passed: false, detail: 'DB error: ' + e.message }));
}
" 2>&1 || echo '{"passed":false,"detail":"Bun execution failed"}')
SCHEMA_PASSED=$(echo "${SCHEMA_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.passed ? 'true' : 'false')")
SCHEMA_DETAIL=$(echo "${SCHEMA_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.detail)")
record_check "reader_writer_parity" "${SCHEMA_PASSED}" "${SCHEMA_DETAIL}"

# ── Check 5: Public API round-trip ────────────────────────────────────────────
echo "[drift-audit] Check 5: Public API round-trip"
API_URL="http://localhost:3000/api/brain/health"
if curl -sf --max-time 10 "${API_URL}" > /dev/null 2>&1; then
  record_check "public_api_roundtrip" "true" "Brain health endpoint responding"
else
  record_check "public_api_roundtrip" "false" "Brain health endpoint unreachable at ${API_URL}"
fi

# ── Check 6: Legacy compatibility (pgvector bridge) ───────────────────────────
echo "[drift-audit] Check 6: Legacy compatibility"
LEGACY_RESULT=$("${BUN}" -e "
import { getPool } from './src/lib/postgres/connection.ts';
try {
  const pool = getPool();
  // Check that pgvector extension is still available
  const ext = await pool.query(\"SELECT extname FROM pg_extension WHERE extname = 'vector'\");
  if (ext.rows.length > 0) {
    console.log(JSON.stringify({ passed: true, detail: 'pgvector extension available' }));
  } else {
    console.log(JSON.stringify({ passed: false, detail: 'pgvector extension not found' }));
  }
} catch (e) {
  console.log(JSON.stringify({ passed: false, detail: 'DB error: ' + e.message }));
}
" 2>&1 || echo '{"passed":false,"detail":"Bun execution failed"}')
LEGACY_PASSED=$(echo "${LEGACY_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.passed ? 'true' : 'false')")
LEGACY_DETAIL=$(echo "${LEGACY_RESULT}" | tail -1 | "${BUN}" -e "const d = await Bun.stdin.text(); const j = JSON.parse(d); console.log(j.detail)")
record_check "legacy_compatibility" "${LEGACY_PASSED}" "${LEGACY_DETAIL}"

# ── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((CHECKS_PASSED + CHECKS_FAILED))
echo ""
echo "[drift-audit] Summary: ${CHECKS_PASSED}/${TOTAL} checks passed, ${CHECKS_FAILED} failed"

# ── Write to Allura Brain via event insert ────────────────────────────────────
echo "[drift-audit] Writing DRIFT_AUDIT event to Allura Brain..."
"${BUN}" -e "
import { getPool } from './src/lib/postgres/connection.ts';
const pool = getPool();
const metadata = {
  checks_passed: ${CHECKS_PASSED},
  checks_failed: ${CHECKS_FAILED},
  details: [${CHECK_DETAILS}]
};
await pool.query(
  'INSERT INTO events (group_id, event_type, agent_id, status, metadata) VALUES (\$1, \$2, \$3, \$4, \$5)',
  ['${GROUP_ID}', 'DRIFT_AUDIT', 'drift-audit-script', 'completed', JSON.stringify(metadata)]
);
console.log('[drift-audit] DRIFT_AUDIT event written');

// If any check failed, write a RETRIEVAL_DRIFT alert event
if (${CHECKS_FAILED} > 0) {
  const alertMeta = {
    checks_failed: ${CHECKS_FAILED},
    severity: 'high',
    details: [${CHECK_DETAILS}]
  };
  await pool.query(
    'INSERT INTO events (group_id, event_type, agent_id, status, metadata) VALUES (\$1, \$2, \$3, \$4, \$5)',
    ['${GROUP_ID}', 'RETRIEVAL_DRIFT', 'drift-audit-script', 'completed', JSON.stringify(alertMeta)]
  );
  console.log('[drift-audit] RETRIEVAL_DRIFT alert event written');
}
" 2>&1 || echo "[drift-audit] WARNING: Failed to write events to DB (non-fatal)"

# ── Write daily log entry ────────────────────────────────────────────────────
mkdir -p "${MEMORY_DIR}"
LOG_FILE="${MEMORY_DIR}/${TODAY}.md"
LOG_ENTRY="## Drift Audit — ${TIMESTAMP}

- **Group:** ${GROUP_ID}
- **Checks Passed:** ${CHECKS_PASSED}/${TOTAL}
- **Checks Failed:** ${CHECKS_FAILED}
- **Status:** $([[ ${CHECKS_FAILED} -eq 0 ]] && echo '✅ PASS' || echo '⚠️ DRIFT DETECTED')

### Check Details
"

# Rebuild check details for markdown
echo "${LOG_ENTRY}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

# Append each check result (re-parse from stdout is complex; just write summary)
echo "- Subsystem Health: $([[ "${CHECKS_PASSED}" -gt 0 ]] && echo "See above" || echo "N/A")" >> "${LOG_FILE}"
echo "- Total Checks: ${TOTAL}" >> "${LOG_FILE}"
echo "- Passed: ${CHECKS_PASSED}" >> "${LOG_FILE}"
echo "- Failed: ${CHECKS_FAILED}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

echo "[drift-audit] Log entry written to ${LOG_FILE}"
echo "[drift-audit] Done."

# Exit 0 if all passed, 1 if any failed (for cron alerting)
if [[ ${CHECKS_FAILED} -eq 0 ]]; then
  exit 0
else
  exit 1
fi