#!/usr/bin/env bash
# FR-5: Backup Script — Allura Memory System
# Usage: bash scripts/backup.sh [OUTPUT_DIR]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUTPUT_DIR="${1:-${ROOT_DIR}/backups/drill-${TIMESTAMP}}"
CONTAINER_PG="${POSTGRES_CONTAINER:-knowledge-postgres}"
PG_USER="${POSTGRES_USER:-ronin4life}"
PG_DB="${POSTGRES_DB:-memory}"

mkdir -p "${OUTPUT_DIR}"

echo "=== Allura Memory Backup Drill ==="
echo "  Output: ${OUTPUT_DIR}"
echo "  Time:   ${TIMESTAMP}"
echo ""

# ── 1. PostgreSQL Backup (episodic + semantic + RuVector, one database) ─────────────────────────────────────────────
echo "Backing up PostgreSQL..."
START_PG=$(date +%s)
docker exec "${CONTAINER_PG}" pg_dump -U "${PG_USER}" --format=custom "${PG_DB}" > "${OUTPUT_DIR}/postgres.dump"
END_PG=$(date +%s)
PG_SIZE=$(stat --printf="%s" "${OUTPUT_DIR}/postgres.dump" 2>/dev/null || stat -f%z "${OUTPUT_DIR}/postgres.dump")
echo "  ✓ PostgreSQL: $((${PG_SIZE}/1024/1024)) MB ($((${END_PG}-${START_PG}))s)"

# ── 2. Config Backup ────────────────────────────────────────────────────
echo "Backing up config..."
cp "${ROOT_DIR}/docker-compose.yml" "${OUTPUT_DIR}/"
cp "${ROOT_DIR}/.env" "${OUTPUT_DIR}/env.base"
cp "${ROOT_DIR}/.env.local" "${OUTPUT_DIR}/env.local" 2>/dev/null || true
echo "  ✓ Config files copied"

# ── 3. Pre-backup PG Counts (for verification) ───────────────────────────
echo "Capturing pre-backup counts for verification..."
docker exec "${CONTAINER_PG}" psql -U "${PG_USER}" -d "${PG_DB}" -c "
SELECT 'allura_memories' AS t, COUNT(*) AS total, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted FROM allura_memories
UNION ALL SELECT 'events', COUNT(*), NULL, NULL FROM events
UNION ALL SELECT 'graph_memories', COUNT(*), COUNT(*) FILTER (WHERE deprecated = false AND deleted_at IS NULL), COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) FROM graph_memories
UNION ALL SELECT 'graph_supersedes', COUNT(*), NULL, NULL FROM graph_supersedes
UNION ALL SELECT 'canonical_proposals', COUNT(*), NULL, NULL FROM canonical_proposals;
" > "${OUTPUT_DIR}/pg-counts.txt" 2>/dev/null
echo "  ✓ Pre-backup counts captured"

TOTAL_END=$(date +%s)
echo ""
echo "=== Backup Complete ==="
echo "  Directory: ${OUTPUT_DIR}"
echo "  Files:"
ls -lah "${OUTPUT_DIR}/"