#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POSTGRES_DIR="${ROOT_DIR}/backups/postgres"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-knowledge-postgres}"

echo "Memory Storage Audit"
echo "===================="
echo "Root: ${ROOT_DIR}"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker: NOT AVAILABLE"
  echo "- live container and volume verification cannot run"
elif ! docker info >/dev/null 2>&1; then
  echo "Docker: UNREACHABLE"
  echo "- docker daemon is not reachable"
  echo "- live container and volume verification cannot run"
else
  echo "Docker: AVAILABLE"
  echo "Running containers:"
  docker ps --format '  - {{.Names}} ({{.Status}})'
  echo

  echo "Expected memory containers:"
  if docker ps --format '{{.Names}}' | grep -Fx "${POSTGRES_CONTAINER}" >/dev/null 2>&1; then
    echo "  - ${POSTGRES_CONTAINER}: running"
  else
    echo "  - ${POSTGRES_CONTAINER}: missing"
  fi
  echo

  echo "Named volumes (memory_*):"
  docker volume ls --format '  - {{.Name}}' | grep '^  - memory_' || echo "  - none found"
fi

echo
echo "Backup artifact directories:"
mkdir -p "${POSTGRES_DIR}"
echo "  - ${POSTGRES_DIR}"

latest_postgres="$(ls -1 "${POSTGRES_DIR}" 2>/dev/null | sort | tail -n 1 || true)"

echo
echo "Latest backup artifacts:"
if [ -n "${latest_postgres}" ]; then
  echo "  - PostgreSQL: ${latest_postgres}"
else
  echo "  - PostgreSQL: none"
fi
