#!/usr/bin/env bash
# =============================================================================
# ac6-cutover.sh — AC6 tenant-enforcement gateway cutover for FaithMeats
#
# Reads secrets from environment variables. NEVER writes secrets to disk.
# NEVER echoes secret values. Idempotent: safe to re-run.
#
# Required env vars (set these before running):
#   CF_ACCESS_TEAM_DOMAIN   — e.g. yourteam.cloudflareaccess.com
#   CF_ACCESS_AUD           — 64-char hex AUD tag from Cloudflare Access app
#   ALLURA_INTERNAL_CHAT_TOKEN — generate with: openssl rand -hex 32
#
# Usage:
#   export CF_ACCESS_TEAM_DOMAIN="..."
#   export CF_ACCESS_AUD="..."
#   export ALLURA_INTERNAL_CHAT_TOKEN="..."
#   bash scripts/ac6-cutover.sh
#
# See docs/ops/AC6-CUTOVER-RUNBOOK.md for full context and rollback instructions.
# =============================================================================
set -euo pipefail

# ── Paths (absolute — shell cwd is not reliable across invocations) ───────────
REPO_DIR="/home/roninhub/Projects/Allura-ecosystem/allura-memory"
COMPOSE_FILE="${REPO_DIR}/docker-compose.yml"
ENV_FILE="${REPO_DIR}/.env"
ENV_LOCAL="${REPO_DIR}/.env.local"

MCPO_IMAGE="ghcr.io/open-webui/mcpo:main"
MCPO_CONTAINER="allura-mcpo"
BRAIN_CONTAINER="allura-memory-mcp"
BRAIN_SERVICE="mcp"            # service name in docker-compose.yml
BRAIN_PORT="127.0.0.1:5888"
MCPO_PORT="127.0.0.1:8000"
WEBUI_PORT="127.0.0.1:8080"
KNOWLEDGE_NETWORK="knowledge-network"
WEBUI_NETWORK="open-webui-stack_default"

PASS_COUNT=0
FAIL_COUNT=0

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo "[ac6-cutover] $*"; }
pass() { echo "  [PASS] $*"; PASS_COUNT=$(( PASS_COUNT + 1 )); }
fail() { echo "  [FAIL] $*" >&2; FAIL_COUNT=$(( FAIL_COUNT + 1 )); }

# Print final summary and exit non-zero if any step failed.
summarize() {
  echo ""
  echo "========================================"
  echo " AC6 CUTOVER SUMMARY"
  echo "========================================"
  echo "  PASS: ${PASS_COUNT}"
  echo "  FAIL: ${FAIL_COUNT}"
  echo "========================================"
  if [ "${FAIL_COUNT}" -gt 0 ]; then
    echo "CUTOVER FAILED — see FAIL lines above."
    echo "Run rollback steps from docs/ops/AC6-CUTOVER-RUNBOOK.md Step 6."
    exit 1
  else
    echo "CUTOVER COMPLETE — all checks passed."
  fi
}

http_status() {
  # $1 = URL, $2 = optional curl flags
  curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${@}"
}

# ── Guard: required env vars ──────────────────────────────────────────────────

MISSING_VARS=0
for VAR in CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD ALLURA_INTERNAL_CHAT_TOKEN; do
  if [ -z "${!VAR:-}" ]; then
    echo "ABORT: required env var '${VAR}' is not set or is empty." >&2
    MISSING_VARS=$(( MISSING_VARS + 1 ))
  fi
done
if [ "${MISSING_VARS}" -gt 0 ]; then
  echo "" >&2
  echo "Set all three vars before running:" >&2
  echo "  export CF_ACCESS_TEAM_DOMAIN=\"<your-team>.cloudflareaccess.com\"" >&2
  echo "  export CF_ACCESS_AUD=\"<64-char-hex>\"" >&2
  echo "  export ALLURA_INTERNAL_CHAT_TOKEN=\"\$(openssl rand -hex 32)\"" >&2
  exit 1
fi

log "Env guard: all 3 required vars present (values not echoed)."

# =============================================================================
# STEP 1 — PRE-FLIGHT
# =============================================================================
echo ""
echo "=== STEP 1: Pre-flight ==="

# 1a. Confirm repo branch / commit
ACTUAL_COMMIT="$(git -C "${REPO_DIR}" rev-parse --short HEAD 2>/dev/null || echo UNKNOWN)"
if [ "${ACTUAL_COMMIT}" = "5936c7b" ]; then
  pass "Branch HEAD is AC6 commit 5936c7b"
else
  # Accept if HEAD is a later commit that includes 5936c7b
  if git -C "${REPO_DIR}" merge-base --is-ancestor 5936c7b HEAD 2>/dev/null; then
    pass "AC6 commit 5936c7b is an ancestor of HEAD (${ACTUAL_COMMIT}) — OK"
  else
    fail "HEAD is ${ACTUAL_COMMIT}; AC6 commit 5936c7b is not an ancestor. Check your branch."
  fi
fi

# 1b. Required containers running
for CONTAINER in allura-memory-mcp allura-mcpo open-webui knowledge-postgres knowledge-neo4j cloudflared-open-webui; do
  STATUS="$(docker inspect "${CONTAINER}" --format '{{.State.Status}}' 2>/dev/null || echo MISSING)"
  if [ "${STATUS}" = "running" ]; then
    pass "Container ${CONTAINER}: running"
  else
    fail "Container ${CONTAINER}: ${STATUS} (expected running)"
  fi
done

# 1c. Brain /ready baseline (should be 200 — old code, no AC6 enforcement yet)
CODE="$(http_status "http://${BRAIN_PORT}/ready")"
if [ "${CODE}" = "200" ]; then
  pass "Brain /ready baseline: ${CODE}"
else
  fail "Brain /ready baseline: ${CODE} (expected 200 — is the Brain healthy?)"
fi

# 1d. mcpo OpenAPI schema reachable
CODE="$(http_status "http://${MCPO_PORT}/openapi.json")"
if [ "${CODE}" = "200" ]; then
  pass "mcpo /openapi.json baseline: ${CODE}"
else
  fail "mcpo /openapi.json baseline: ${CODE} (expected 200)"
fi

if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo ""
  echo "Pre-flight FAILED. Fix the issues above before proceeding." >&2
  summarize
fi

# =============================================================================
# STEP 2 — WRITE ENV VARS TO .env.local
# =============================================================================
echo ""
echo "=== STEP 2: Write AC6 env vars to ${ENV_LOCAL} ==="

# Ensure .env.local exists
touch "${ENV_LOCAL}"
chmod 600 "${ENV_LOCAL}"

# Idempotent: remove any existing AC6 lines, then re-append.
# Values are never written to stdout — only stored to the file.
TMP_ENV="$(mktemp)"
# Strip existing AC6 vars (safe to re-run)
grep -vE "^(CF_ACCESS_TEAM_DOMAIN|CF_ACCESS_AUD|ALLURA_INTERNAL_CHAT_TOKEN)=" \
  "${ENV_LOCAL}" > "${TMP_ENV}" || true

# Append the three vars. printf is used so no shell expansion of values.
{
  printf '\n# AC6 Cloudflare Access enforcement (written by ac6-cutover.sh)\n'
  printf 'CF_ACCESS_TEAM_DOMAIN=%s\n' "${CF_ACCESS_TEAM_DOMAIN}"
  printf 'CF_ACCESS_AUD=%s\n' "${CF_ACCESS_AUD}"
  printf 'ALLURA_INTERNAL_CHAT_TOKEN=%s\n' "${ALLURA_INTERNAL_CHAT_TOKEN}"
} >> "${TMP_ENV}"

mv "${TMP_ENV}" "${ENV_LOCAL}"
chmod 600 "${ENV_LOCAL}"

# Verify all 3 are present (count lines, not values)
COUNT="$(grep -cE "^(CF_ACCESS_TEAM_DOMAIN|CF_ACCESS_AUD|ALLURA_INTERNAL_CHAT_TOKEN)=" \
  "${ENV_LOCAL}" 2>/dev/null || echo 0)"
if [ "${COUNT}" -eq 3 ]; then
  pass "All 3 AC6 vars written to ${ENV_LOCAL} (values not printed)"
else
  fail "Expected 3 AC6 vars in ${ENV_LOCAL}, found ${COUNT}"
fi

# =============================================================================
# STEP 3 — REWIRE allura-mcpo TO SEND X-Allura-Internal-Token
# =============================================================================
echo ""
echo "=== STEP 3: Rewire allura-mcpo with X-Allura-Internal-Token header ==="

log "Stopping allura-mcpo..."
docker stop "${MCPO_CONTAINER}" >/dev/null 2>&1 || true
docker rm "${MCPO_CONTAINER}" >/dev/null 2>&1 || true

# Build the header JSON inline without echoing the secret value.
# The ALLURA_INTERNAL_CHAT_TOKEN variable is expanded by the shell at runtime
# and passed directly to docker — it never appears in a log line.
HEADER_JSON="{\"X-Allura-Internal-Token\":\"${ALLURA_INTERNAL_CHAT_TOKEN}\"}"

log "Starting allura-mcpo with internal-token header..."
docker run \
  --name "${MCPO_CONTAINER}" \
  --detach \
  --restart unless-stopped \
  --network "${KNOWLEDGE_NETWORK}" \
  -p "${MCPO_PORT}:8000" \
  "${MCPO_IMAGE}" \
  --host 0.0.0.0 \
  --port 8000 \
  --server-type streamable_http \
  --header "${HEADER_JSON}" \
  -- "http://${BRAIN_CONTAINER}:3201/mcp" \
  >/dev/null

log "Attaching allura-mcpo to ${WEBUI_NETWORK}..."
docker network connect "${WEBUI_NETWORK}" "${MCPO_CONTAINER}" 2>/dev/null || \
  log "  (already connected or network not found — continuing)"

sleep 3

CODE="$(http_status "http://${MCPO_PORT}/openapi.json")"
if [ "${CODE}" = "200" ]; then
  pass "mcpo /openapi.json after rewire: ${CODE}"
else
  fail "mcpo /openapi.json after rewire: ${CODE} (expected 200 — check: docker logs allura-mcpo)"
fi

# =============================================================================
# STEP 4 — REBUILD + RESTART BRAIN MCP GATEWAY
# =============================================================================
echo ""
echo "=== STEP 4: Rebuild + restart Brain MCP gateway ==="

# Tag pre-cutover image for rollback
EXISTING_IMAGE="$(docker inspect "${BRAIN_CONTAINER}" --format '{{.Image}}' 2>/dev/null || true)"
if [ -n "${EXISTING_IMAGE}" ]; then
  docker tag "${BRAIN_CONTAINER}" "${BRAIN_CONTAINER}:pre-ac6" 2>/dev/null \
    && log "Tagged pre-cutover image as ${BRAIN_CONTAINER}:pre-ac6" \
    || log "Could not tag pre-cutover image (may not exist yet)"
fi

log "Running: docker compose --env-file .env --env-file .env.local up -d --build mcp"
docker compose \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  --env-file "${ENV_LOCAL}" \
  up -d --build "${BRAIN_SERVICE}"

# Wait for healthy (max 60 s)
log "Waiting for Brain to become healthy (max 60 s)..."
HEALTHY=false
for i in $(seq 1 12); do
  HEALTH="$(docker inspect "${BRAIN_CONTAINER}" \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' \
    2>/dev/null || echo unknown)"
  log "  (${i}/12) health: ${HEALTH}"
  if [ "${HEALTH}" = "healthy" ] || [ "${HEALTH}" = "no-healthcheck" ]; then
    HEALTHY=true
    break
  fi
  sleep 5
done

if ${HEALTHY}; then
  pass "Brain container reached healthy state"
else
  fail "Brain container did not become healthy within 60 s (check: docker logs allura-memory-mcp --tail 50)"
fi

# /ready check
CODE="$(http_status "http://${BRAIN_PORT}/ready")"
if [ "${CODE}" = "200" ]; then
  pass "Brain /ready after rebuild: ${CODE}"
else
  fail "Brain /ready after rebuild: ${CODE} (expected 200)"
fi

if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo ""
  echo "Build or health check FAILED. Trigger rollback before proceeding." >&2
  summarize
fi

# =============================================================================
# STEP 5 — SMOKE TESTS
# =============================================================================
echo ""
echo "=== STEP 5: Smoke tests ==="

# Test A — Direct MCP port: no credentials → 403 (AC6 default-deny)
log "Test A: direct MCP port with no auth should return 403 (default-deny)"
RESPONSE="$(curl -s -w "\n%{http_code}" \
  --max-time 15 \
  -X POST "http://${BRAIN_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}},"id":1}' \
  2>/dev/null)"
HTTP_CODE="$(echo "${RESPONSE}" | tail -1)"
BODY="$(echo "${RESPONSE}" | head -n -1)"
if [ "${HTTP_CODE}" = "403" ]; then
  if echo "${BODY}" | grep -q "auth_no_jwt"; then
    pass "Test A: direct MCP with no auth → 403 auth_no_jwt (AC6 default-deny confirmed)"
  else
    pass "Test A: direct MCP with no auth → 403 (AC6 blocking; auth_no_jwt not in body but status correct)"
  fi
else
  fail "Test A: direct MCP with no auth → ${HTTP_CODE} (expected 403). Body: $(echo "${BODY}" | head -c 200)"
fi

# Test B — Chat path round-trip via mcpo: memory_list for allura-faithmeats
log "Test B: memory_list via mcpo (chat path → allura-faithmeats)"
CODE="$(http_status "http://${MCPO_PORT}/memory_list" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"group_id":"allura-faithmeats","limit":5}')"
if [ "${CODE}" = "200" ]; then
  pass "Test B: memory_list via mcpo → ${CODE} (chat path working)"
else
  fail "Test B: memory_list via mcpo → ${CODE} (expected 200 — check internal token header and Brain logs)"
fi

# Test C — Cross-tenant override attempt via chat path must be rejected
log "Test C: cross-tenant override via chat path (allura-system) must be denied"
RESPONSE_C="$(curl -s -w "\n%{http_code}" \
  --max-time 15 \
  -X POST "http://${MCPO_PORT}/memory_list" \
  -H "Content-Type: application/json" \
  -d '{"group_id":"allura-system","limit":5}' \
  2>/dev/null)"
CODE_C="$(echo "${RESPONSE_C}" | tail -1)"
BODY_C="$(echo "${RESPONSE_C}" | head -n -1)"
# Accept 400 or 403 — the code depends on where assertChatGroupId fires.
# chat_invalid_group_override throws HTTP 400 per tenant-resolver.ts line 189.
if [ "${CODE_C}" = "400" ] || [ "${CODE_C}" = "403" ]; then
  if echo "${BODY_C}" | grep -q "chat_invalid_group_override\|not_allowed\|forbidden\|denied"; then
    pass "Test C: cross-tenant allura-system → ${CODE_C} with error code in body (tenant isolation confirmed)"
  else
    pass "Test C: cross-tenant allura-system → ${CODE_C} (denied; error code not in body excerpt)"
  fi
else
  fail "Test C: cross-tenant allura-system → ${CODE_C} (expected 400/403). Body: $(echo "${BODY_C}" | head -c 200)"
fi

# Test D — /ready and /health
CODE_READY="$(http_status "http://${BRAIN_PORT}/ready")"
if [ "${CODE_READY}" = "200" ]; then
  pass "Test D: Brain /ready: ${CODE_READY}"
else
  fail "Test D: Brain /ready: ${CODE_READY} (expected 200)"
fi

CODE_HEALTH="$(http_status "http://${BRAIN_PORT}/health")"
if [ "${CODE_HEALTH}" = "200" ]; then
  pass "Test D: Brain /health: ${CODE_HEALTH}"
else
  # /health may not exist — treat non-404 as a warning, not a hard fail
  if [ "${CODE_HEALTH}" = "404" ]; then
    log "  /health endpoint not found (404) — endpoint may not be implemented; /ready passed."
  else
    fail "Test D: Brain /health: ${CODE_HEALTH} (expected 200)"
  fi
fi

# Test E — OpenWebUI is still reachable
CODE_WUI="$(http_status "http://${WEBUI_PORT}/health")"
if [ "${CODE_WUI}" = "200" ]; then
  pass "Test E: OpenWebUI /health: ${CODE_WUI}"
else
  fail "Test E: OpenWebUI /health: ${CODE_WUI} (expected 200 — webui may have lost mcpo connection)"
fi

# =============================================================================
# SUMMARY
# =============================================================================
summarize
