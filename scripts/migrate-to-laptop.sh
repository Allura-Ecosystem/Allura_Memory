#!/usr/bin/env bash
# migrate-to-laptop.sh — OLD machine side of the Allura Memory laptop migration.
# Cold-backs up the 3 Docker volumes + carries the 2 secret env files onto a
# flash drive (or any target dir), with checksums for integrity verification.
#
# Usage:
#   ./scripts/migrate-to-laptop.sh /media/ronin704/<USB-LABEL>
#   ./scripts/migrate-to-laptop.sh                 # defaults to ./allura-migration-bundle
#
# Safe to re-run. Quiesces ONLY the knowledge stack (PG/Neo4j/MCP) for a
# consistent snapshot, then brings it back up. Other containers are untouched.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$REPO_ROOT/allura-migration-bundle}"
VOLUMES=(memory_postgres_data neo4j_data neo4j_logs)
NETWORK="knowledge-network"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found on PATH"

say "Target bundle dir: $TARGET"
mkdir -p "$TARGET"

# --- 0. Pre-flight: confirm volumes exist -----------------------------------
say "Checking source volumes exist"
for V in "${VOLUMES[@]}"; do
  docker volume inspect "$V" >/dev/null 2>&1 || die "volume '$V' not found — nothing to back up"
  echo "  ok  $V"
done

# --- 1. Quiesce the knowledge stack for a consistent snapshot ---------------
say "Stopping knowledge stack for a consistent cold backup"
RESTART=0
if docker compose -f "$REPO_ROOT/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
  ( cd "$REPO_ROOT" && docker compose stop ) || true
  RESTART=1
else
  # Fall back to stopping the known containers by name if compose isn't tracking them
  docker stop knowledge-postgres knowledge-neo4j allura-memory-mcp >/dev/null 2>&1 && RESTART=1 || true
fi

# --- 2. Cold-tar each volume into the target --------------------------------
say "Backing up volumes (cold)"
for V in "${VOLUMES[@]}"; do
  echo "  tar  $V -> $TARGET/$V.tar.gz"
  docker run --rm -v "$V":/data:ro -v "$TARGET":/backup alpine \
    tar czf "/backup/$V.tar.gz" -C /data .
done

# --- 3. Carry the two secret env files (NOT in git) -------------------------
say "Copying secret env files (.env, .env.local)"
for F in .env .env.local; do
  if [ -f "$REPO_ROOT/$F" ]; then
    cp "$REPO_ROOT/$F" "$TARGET/$F"
    chmod 600 "$TARGET/$F"
    echo "  copied  $F (mode 600)"
  else
    echo "  WARN  $F not present in repo root — skipping"
  fi
done

# --- 4. Copy the restore script so the new laptop is self-sufficient --------
if [ -f "$REPO_ROOT/scripts/restore-on-laptop.sh" ]; then
  cp "$REPO_ROOT/scripts/restore-on-laptop.sh" "$TARGET/restore-on-laptop.sh"
  chmod +x "$TARGET/restore-on-laptop.sh"
  echo "  copied  restore-on-laptop.sh"
fi

# --- 5. Checksums + manifest ------------------------------------------------
say "Writing checksum manifest"
( cd "$TARGET" && sha256sum ./*.tar.gz .env .env.local 2>/dev/null > MANIFEST.sha256 || true )
{
  echo "Allura Memory migration bundle"
  echo "created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source host: $(hostname)"
  echo "volumes: ${VOLUMES[*]}"
  echo "network: $NETWORK"
} > "$TARGET/MANIFEST.txt"

# --- 6. Bring the stack back up ---------------------------------------------
if [ "$RESTART" = "1" ]; then
  say "Restarting knowledge stack"
  ( cd "$REPO_ROOT" && docker compose start ) 2>/dev/null \
    || docker start knowledge-postgres knowledge-neo4j allura-memory-mcp >/dev/null 2>&1 || true
fi

say "DONE — bundle ready at: $TARGET"
echo "Contents:"
ls -lh "$TARGET"
echo
echo "Next: safely eject the drive, then on the NEW laptop run:"
echo "  ./restore-on-laptop.sh  <path-to-this-bundle>"
