#!/usr/bin/env bash
#
# install-token-gateway.sh — install/refresh the Caddy per-coworker token
# gateway that sits in front of the mcpo bridge (loopback :8001) and validates
# per-coworker Bearer tokens before forwarding to mcpo.
#
# Idempotent: safe to re-run. Validates the rendered Caddyfile before writing
# it (Pike #1 — validate-before-reload atomic swap). On validation failure the
# live config is left untouched.
#
# Usage:
#   bash scripts/openwebui-bridge/install-token-gateway.sh
#
# Prerequisites:
#   - caddy v2.5+ on PATH, /usr/local/bin, or ~/.local/bin
#   - allura-mcpo-bridge.service already installed (install-openwebui-bridge.sh)
#   - systemd --user (loginctl linger enabled by this script)
#
# After install, mint coworker tokens with:
#   bash scripts/openwebui-bridge/mint-coworker-token.sh <user_id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CADDY_TEMPLATE="${SCRIPT_DIR}/allura-mcpo-gateway.Caddyfile.template"
SERVICE_TEMPLATE="${SCRIPT_DIR}/allura-mcpo-gateway.service.template"

CONFIG_DIR="${HOME}/.config/allura"
LOG_DIR="${HOME}/.local/share/allura/logs"
UNIT_DIR="${HOME}/.config/systemd/user"

LIVE_CONFIG="${CONFIG_DIR}/allura-mcpo-gateway.Caddyfile"
TOKEN_FILE="${CONFIG_DIR}/coworker-tokens"
UNIT_FILE="${UNIT_DIR}/allura-mcpo-gateway.service"
SERVICE_NAME="allura-mcpo-gateway.service"

echo "=== Allura Caddy token gateway installer ==="

# --- Detect caddy -----------------------------------------------------------
detect_caddy() {
    local candidates
    candidates=("caddy" "/usr/local/bin/caddy" "${HOME}/.local/bin/caddy")
    local c
    for c in "${candidates[@]}"; do
        if command -v "${c}" >/dev/null 2>&1; then
            command -v "${c}"
            return 0
        fi
    done
    return 1
}

CADDY_BIN=""
CADDY_BIN="$(detect_caddy 2>/dev/null || true)"

if [[ -z "${CADDY_BIN}" ]]; then
    echo "FAIL: 'caddy' not found. Install options:" >&2
    echo "  Static binary (recommended): https://caddyserver.com/download" >&2
    echo "  Apt (Debian/Ubuntu): https://caddyserver.com/docs/install#debian-ubuntu-raspbian" >&2
    echo "  Place binary at ~/.local/bin/caddy, then re-run this script." >&2
    echo "  Minimum required: v2.5+ (v2.7+ recommended for log filter module)." >&2
    exit 1
fi
echo "  caddy:      ${CADDY_BIN}"

# Version check (warn if <2.7, abort if <2.5)
CADDY_VERSION=""
CADDY_VERSION="$("${CADDY_BIN}" version 2>/dev/null | awk '{print $1}' | tr -d 'v' || true)"
echo "  version:    v${CADDY_VERSION}"
CADDY_MINOR=""
CADDY_MINOR="$(echo "${CADDY_VERSION}" | awk -F. '{print ($1 * 100) + $2}' 2>/dev/null || echo 0)"
if [[ "${CADDY_MINOR}" -lt 205 ]]; then
    echo "ERROR: Caddy v2.5+ required (found v${CADDY_VERSION}). Aborting." >&2
    exit 1
elif [[ "${CADDY_MINOR}" -lt 207 ]]; then
    echo "  WARN: Caddy v2.7+ recommended. Log filter module (Authorization" \
         "redaction) may be unavailable in v${CADDY_VERSION}."
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "FAIL: systemctl not available. This installer targets systemd --user." >&2
    exit 1
fi

# --- Directories & token file -----------------------------------------------
mkdir -p "${CONFIG_DIR}" "${UNIT_DIR}" "${LOG_DIR}"

if [[ ! -f "${TOKEN_FILE}" ]]; then
    touch "${TOKEN_FILE}"
fi
chmod 600 "${TOKEN_FILE}"
echo "  token file: ${TOKEN_FILE} (mode 600)"

# --- render_caddyfile (Pike #1: validate-before-reload atomic swap) ----------
# Reads SOURCE Caddyfile (template or live with preserved markers), replaces
# the COWORKER_TOKENS region with entries from TOKENS file, validates with
# 'caddy validate', then atomically mv → DEST. On validation failure, aborts
# and leaves any existing DEST file untouched.
render_caddyfile() {
    local source="$1"
    local dest="$2"
    local tokens="$3"

    local tmpfile
    tmpfile="$(mktemp "${dest}.tmp.XXXXXXXX")"

    # Build map entries (HEX=user_id → Caddy map literal)
    local map_lines=""
    while IFS= read -r line; do
        [[ -z "${line}" || "${line}" == "#"* ]] && continue
        local hex uid
        hex="${line%%=*}"
        uid="${line#*=}"
        [[ -n "${hex}" && -n "${uid}" ]] || continue
        map_lines="${map_lines}        \"Bearer ${hex}\" \"${uid}\"\n"
    done < "${tokens}"

    # Splice tokens into the COWORKER_TOKENS region via awk
    awk -v map_lines="${map_lines}" '
        /# >>> COWORKER_TOKENS >>>/ {
            print
            in_block = 1
            printf "%s", map_lines
            next
        }
        /# <<< COWORKER_TOKENS <<</ {
            in_block = 0
        }
        !in_block { print }
    ' "${source}" > "${tmpfile}"

    # Validate before committing (Pike #1)
    local validate_out
    if ! validate_out="$("${CADDY_BIN}" validate --config "${tmpfile}" \
            --adapter caddyfile 2>&1)"; then
        rm -f "${tmpfile}"
        echo "ERROR: Caddy config validation failed — live config unchanged." >&2
        printf '%s\n' "${validate_out}" >&2
        return 1
    fi

    # Atomic swap
    mv "${tmpfile}" "${dest}"
    chmod 600 "${dest}"
    echo "  config:     ${dest} (validated, mode 600)"
}

render_caddyfile "${CADDY_TEMPLATE}" "${LIVE_CONFIG}" "${TOKEN_FILE}"

# --- Render and install systemd unit ----------------------------------------
sed "s|__CADDY_BIN__|${CADDY_BIN}|g" "${SERVICE_TEMPLATE}" > "${UNIT_FILE}"
echo "  unit:       ${UNIT_FILE}"

# --- Enable linger -----------------------------------------------------------
if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || true
    echo "  linger:     $(loginctl show-user "$(id -un)" -p Linger 2>/dev/null \
        | cut -d= -f2 || echo 'unknown')"
fi

# --- Enable & start service -------------------------------------------------
systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}"
echo "  service:    enabled + started"
sleep 2

# --- Verify -----------------------------------------------------------------
echo ""
echo "=== verify ==="

# No Bearer token → must be 401 (gate enforced)
CODE_NOAUTH=""
CODE_NOAUTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 \
    "http://127.0.0.1:8000/docs" 2>/dev/null || echo 000)"
echo "  GET /docs (no auth)    -> HTTP ${CODE_NOAUTH}"
if [[ "${CODE_NOAUTH}" != "401" ]]; then
    echo "ERROR: expected 401 from unauthenticated request, got ${CODE_NOAUTH}." >&2
    echo "  Check: journalctl --user -u ${SERVICE_NAME} -n 50 --no-pager" >&2
    exit 1
fi

# With first token (if any tokens are registered)
FIRST_TOKEN=""
FIRST_TOKEN="$(grep -v '^#' "${TOKEN_FILE}" 2>/dev/null \
    | grep -v '^$' | head -1 | cut -d= -f1 || true)"
if [[ -n "${FIRST_TOKEN}" ]]; then
    CODE_AUTH=""
    CODE_AUTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 \
        -H "Authorization: Bearer ${FIRST_TOKEN}" \
        "http://127.0.0.1:8000/docs" 2>/dev/null || echo 000)"
    echo "  GET /docs (with token) -> HTTP ${CODE_AUTH}"
    if [[ "${CODE_AUTH}" != "200" ]]; then
        echo "  WARN: authenticated /docs returned ${CODE_AUTH} (expected 200)." >&2
    fi
else
    echo "  (no tokens yet — skipping authenticated probe)"
fi

echo ""
echo "Gateway is up. Register coworkers:"
echo "  MCP URL:       http://192.168.1.12:8000"
echo "  Mint token:    bash scripts/openwebui-bridge/mint-coworker-token.sh <user_id>"
echo "  List tokens:   bash scripts/openwebui-bridge/mint-coworker-token.sh --list"
echo ""
echo "Useful commands:"
echo "  journalctl --user -u ${SERVICE_NAME} -f"
echo "  systemctl --user status ${SERVICE_NAME}"
echo "  ${CADDY_BIN} reload --address localhost:2020"
