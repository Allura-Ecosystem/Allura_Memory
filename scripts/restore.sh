#!/usr/bin/env bash
# FR-5: Restore Script — Allura Memory System
# Usage: bash scripts/restore.sh <BACKUP_DIR> [--verify-only]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/restore.sh <BACKUP_DIR> [--verify-only]"
  exit 1
fi

BACKUP_DIR="$1"
VERIFY_ONLY="${2:-}"

CONTAINER_PG="${POSTGRES_CONTAINER:-knowledge-postgres}"
PG_USER="${POSTGRES_USER:-ronin4life}"
PG_DB="${POSTGRES_DB:-memory}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "ERROR: Backup directory not found: ${BACKUP_DIR}"
  exit 1
fi

echo "=== Allura Memory Restore Drill ==="
echo "  Source: ${BACKUP_DIR}"
echo "  Mode:   ${VERIFY_ONLY:-LIVE}"
echo ""

RESTORE_START=$(date +%s)

# ── 1. PostgreSQL Restore ───────────────────────────────────────────────
if [ -f "${BACKUP_DIR}/postgres.dump" ]; then
  echo "Restoring PostgreSQL..."
  START_PG=$(date +%s)
  
  if [ "${VERIFY_ONLY}" != "--verify-only" ]; then
    # Drop and recreate the database from the custom-format dump
    docker exec "${CONTAINER_PG}" psql -U "${PG_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${PG_DB}_restore;" 2>/dev/null || true
    docker exec "${CONTAINER_PG}" psql -U "${PG_USER}" -d postgres -c "CREATE DATABASE ${PG_DB}_restore;" 2>/dev/null
    
    # Restore from custom-format dump
    docker exec -i "${CONTAINER_PG}" pg_restore -U "${PG_USER}" -d "${PG_DB}_restore" --no-owner --no-privileges < "${BACKUP_DIR}/postgres.dump" 2>/dev/null || true
    
    # Get restored counts
    docker exec "${CONTAINER_PG}" psql -U "${PG_USER}" -d "${PG_DB}_restore" -c "
      SELECT 'allura_memories' AS t, COUNT(*) AS total, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted FROM allura_memories
      UNION ALL SELECT 'events', COUNT(*), NULL, NULL FROM events
      UNION ALL SELECT 'graph_memories', COUNT(*), COUNT(*) FILTER (WHERE deprecated = false AND deleted_at IS NULL), COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) FROM graph_memories
      UNION ALL SELECT 'graph_supersedes', COUNT(*), NULL, NULL FROM graph_supersedes
      UNION ALL SELECT 'canonical_proposals', COUNT(*), NULL, NULL FROM canonical_proposals;
    " > "${BACKUP_DIR}/pg-restore-counts.txt" 2>/dev/null || true
    
    # Drop the restore database
    docker exec "${CONTAINER_PG}" psql -U "${PG_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${PG_DB}_restore;" 2>/dev/null || true
  else
    echo "  (verify-only: skipping restore, checking dump integrity)"
  fi
  
  # Verify dump file is readable
  docker exec -i "${CONTAINER_PG}" pg_restore --list < "${BACKUP_DIR}/postgres.dump" > "${BACKUP_DIR}/pg-restore-list.txt" 2>/dev/null \
    && echo "  ✓ PostgreSQL dump is valid and readable" \
    || echo "  ✗ PostgreSQL dump verification failed"
  
  END_PG=$(date +%s)
  echo "  PostgreSQL restore check: $((${END_PG}-${START_PG}))s"
else
  echo "  ⚠ No postgres.dump found in ${BACKUP_DIR}"
fi

# ── 2. Compare Counts ───────────────────────────────────────────────────
echo ""
echo "=== Count Comparison ==="
if [ -f "${BACKUP_DIR}/pg-counts.txt" ]; then
  echo "Pre-backup PG counts:"
  cat "${BACKUP_DIR}/pg-counts.txt"
  echo ""
fi

if [ -f "${BACKUP_DIR}/pg-restore-counts.txt" ]; then
  echo "Post-restore PG counts:"
  cat "${BACKUP_DIR}/pg-restore-counts.txt"
  echo ""
fi

RESTORE_END=$(date +%s)
RTO_SECONDS=$((${RESTORE_END}-${RESTORE_START}))
echo ""
echo "=== Restore Drill Complete ==="
echo "  RTO (drill time): ${RTO_SECONDS} seconds"
echo "  RTO target: < 600 seconds (10 minutes)"
if [ ${RTO_SECONDS} -lt 600 ]; then
  echo "  ✓ RTO WITHIN TARGET"
else
  echo "  ✗ RTO EXCEEDS TARGET"
fi