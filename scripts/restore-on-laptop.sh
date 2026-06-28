#!/usr/bin/env bash
# restore-on-laptop.sh — NEW machine side of the Allura Memory laptop migration.
# Recreates the external network + 3 volumes, restores their data, drops the
# secret env files into the repo, verifies integrity, and brings the Brain up.
#
# Prereqs on the new laptop: Docker, Bun, this repo cloned, Ollama reachable.
#
# Usage (run from the repo root):
#   ./scripts/restore-on-laptop.sh /media/ronin704/<USB-LABEL>
#   ./scripts/restore-on-laptop.sh /path/to/allura-migration-bundle
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"
VOLUMES=(memory_postgres_data neo4j_data neo4j_logs)
NETWORK="knowledge-network"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$SRC" ] || die "pass the bundle dir, e.g. ./scripts/restore-on-laptop.sh /media/ronin704/USB"
[ -d "$SRC" ] || die "bundle dir not found: $SRC"
command -v docker >/dev/null || die "docker not found on PATH"

# --- 0. Verify checksums BEFORE restoring -----------------------------------
if [ -f "$SRC/MANIFEST.sha256" ]; then
  say "Verifying bundle integrity"
  ( cd "$SRC" && sha256sum -c MANIFEST.sha256 ) || die "checksum mismatch — bundle is corrupt, re-copy from source"
else
  echo "  WARN  no MANIFEST.sha256 in bundle — skipping integrity check"
fi

# --- 1. Recreate external network + volumes (idempotent) --------------------
say "Creating external network + volumes (must exist BEFORE first compose up)"
docker network create "$NETWORK" 2>/dev/null && echo "  created network $NETWORK" || echo "  network $NETWORK already exists"
for V in "${VOLUMES[@]}"; do
  docker volume create "$V" >/dev/null && echo "  volume  $V ready"
done

# --- 2. Restore volume data --------------------------------------------------
say "Restoring volume data"
for V in "${VOLUMES[@]}"; do
  [ -f "$SRC/$V.tar.gz" ] || die "missing $SRC/$V.tar.gz"
  echo "  untar  $V"
  docker run --rm -v "$V":/data -v "$SRC":/backup alpine \
    sh -c "cd /data && tar xzf /backup/$V.tar.gz"
done

# --- 3. Drop secret env files into the repo root ----------------------------
say "Installing secret env files into repo root"
for F in .env .env.local; do
  if [ -f "$SRC/$F" ]; then
    cp "$SRC/$F" "$REPO_ROOT/$F"
    chmod 600 "$REPO_ROOT/$F"
    echo "  installed  $F (mode 600)"
  else
    echo "  WARN  $F not in bundle — you'll need to create it manually"
  fi
done

# --- 4. bun install + bring the Brain up ------------------------------------
if command -v bun >/dev/null; then
  say "bun install"
  ( cd "$REPO_ROOT" && bun install )
  say "Starting the Brain"
  ( cd "$REPO_ROOT" && bun run brain:up ) || die "brain:up failed — check docker + env"
  sleep 5
  ( cd "$REPO_ROOT" && bun run brain:status ) || true
else
  echo "  WARN  bun not found — install Bun, then run: bun install && bun run brain:up"
fi

# --- 5. Readiness probe ------------------------------------------------------
say "Gateway readiness"
if curl -fsS http://127.0.0.1:5888/ready >/dev/null 2>&1; then
  echo "  READY  http://127.0.0.1:5888/ready"
else
  echo "  NOT READY yet — give it ~20s and retry: curl http://127.0.0.1:5888/ready"
fi

cat <<'POST'

==> RESTORE COMPLETE — two manual follow-ups remain:

  1) OLLAMA / OPEN WEBUI EMBEDDINGS
     Allura embeds via Ollama. Make sure the model is pulled and the URL matches
     this laptop:
       ollama pull qwen3-embedding:8b
     If Ollama runs INSIDE a Docker network (e.g. via Open WebUI), set in .env:
       RUVECTOR_EMBEDDING_BASE_URL=http://host.docker.internal:11434
     For a host-native Ollama, http://localhost:11434 is correct (already set).

  2) CLERK AUTH (only when going to production)
     Paste real keys into .env.local and flip dev auth off in .env:
       NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
       CLERK_SECRET_KEY=sk_live_...
       ALLURA_DEV_AUTH_ENABLED=false   # in .env
     See docs/archive/allura/LAPTOP-MIGRATION-AND-CLERK.md (Part B).

  Acceptance: a memory_search returns your existing memories (data restored,
  not empty), and `bun run typecheck` passes.
POST
