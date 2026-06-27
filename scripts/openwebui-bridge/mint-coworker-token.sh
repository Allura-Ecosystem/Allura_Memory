#!/usr/bin/env bash
#
# mint-coworker-token.sh — mint, revoke, rotate, or list per-coworker tokens
# for the Allura Caddy token gateway.
#
# SECURITY (interim): coworker user_id is self-reported in the tool payload;
# group_id (org=allura-faithmeats) is the only hard tenant boundary per ADR-001.
# Per-user payload binding is deferred to the hardened gateway.
# See story 6-1 AC6-AC7.
#
# All mutating operations (mint/revoke/rotate) are flock-guarded on a lock
# file to prevent concurrent token-file corruption (Pike #2). Each render
# validates the resulting Caddyfile with 'caddy validate' and performs an
# atomic mv swap before reload; on validation failure the live config is left
# untouched (Pike #1).
#
# Usage:
#   mint-coworker-token.sh <user_id>           # mint a new Bearer token
#   mint-coworker-token.sh --revoke <user_id>  # revoke all tokens for user
#   mint-coworker-token.sh --rotate <user_id>  # revoke + mint one new token
#   mint-coworker-token.sh --list              # list coworker user_ids only
#
# user_id constraints: [a-zA-Z0-9_-]

set -euo pipefail

CONFIG_DIR="${HOME}/.config/allura"
TOKEN_FILE="${CONFIG_DIR}/coworker-tokens"
LOCK_FILE="${CONFIG_DIR}/.coworker-tokens.lock"
LIVE_CONFIG="${CONFIG_DIR}/allura-mcpo-gateway.Caddyfile"
GATEWAY_SERVICE="allura-mcpo-gateway.service"
CADDY_ADMIN_ADDR="localhost:2020"

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

# --- Input validation -------------------------------------------------------
validate_user_id() {
    local uid="$1"
    if [[ ! "${uid}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "ERROR: Invalid user_id '${uid}'. Allowed characters: [a-zA-Z0-9_-]" >&2
        return 1
    fi
}

# --- Token generation -------------------------------------------------------
gen_token() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        # /dev/urandom fallback
        local raw
        raw="$(od -A n -t x1 -N 32 /dev/urandom | tr -d ' \n')"
        echo "${raw}"
    fi
}

# --- Shared render + validate + atomic-swap + reload (Pike #1) --------------
# Re-renders the live Caddyfile by replacing the COWORKER_TOKENS region with
# current entries from the token file. Validates with 'caddy validate' before
# atomically replacing the live file. On failure, aborts — live file untouched.
render_and_reload() {
    if [[ -z "${CADDY_BIN}" ]]; then
        echo "ERROR: caddy binary not found — cannot validate config." >&2
        echo "  Install caddy and ensure it is on PATH or at ~/.local/bin/caddy." >&2
        return 1
    fi
    if [[ ! -f "${LIVE_CONFIG}" ]]; then
        echo "ERROR: live Caddyfile not found at ${LIVE_CONFIG}." >&2
        echo "  Run install-token-gateway.sh first to initialise the gateway." >&2
        return 1
    fi

    local tmpfile
    tmpfile="$(mktemp "${LIVE_CONFIG}.tmp.XXXXXXXX")"

    # Build map entries from current token file
    local map_lines=""
    if [[ -f "${TOKEN_FILE}" ]]; then
        while IFS= read -r line; do
            [[ -z "${line}" || "${line}" == "#"* ]] && continue
            local hex uid
            hex="${line%%=*}"
            uid="${line#*=}"
            [[ -n "${hex}" && -n "${uid}" ]] || continue
            map_lines="${map_lines}        \"Bearer ${hex}\" \"${uid}\"\n"
        done < "${TOKEN_FILE}"
    fi

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
    ' "${LIVE_CONFIG}" > "${tmpfile}"

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
    mv "${tmpfile}" "${LIVE_CONFIG}"
    chmod 600 "${LIVE_CONFIG}"

    # Reload caddy (prefer admin API; fall back to systemctl)
    if systemctl --user is-active --quiet "${GATEWAY_SERVICE}" 2>/dev/null; then
        if "${CADDY_BIN}" reload --address "${CADDY_ADMIN_ADDR}" \
                --config "${LIVE_CONFIG}" --adapter caddyfile >/dev/null 2>&1; then
            echo "  caddy: reloaded via admin API"
        else
            systemctl --user reload "${GATEWAY_SERVICE}" 2>/dev/null || true
            echo "  caddy: reloaded via systemctl"
        fi
    fi
}

# --- Mint subcommand ---------------------------------------------------------
do_mint() {
    local uid="$1"
    validate_user_id "${uid}"

    local new_token
    new_token="$(gen_token)"
    printf '%s=%s\n' "${new_token}" "${uid}" >> "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"

    render_and_reload

    echo ""
    echo "  +------------------------------------------------------------------+"
    echo "  | Coworker:  ${uid}"
    echo "  | MCP URL:   http://192.168.1.12:8000"
    printf  "  | Bearer:    %s\n" "${new_token}"
    echo "  | OpenWebUI: Settings -> Tools -> Manage Tool Servers"
    echo "  |            URL: http://192.168.1.12:8000"
    echo "  |            Key: (Bearer value above)"
    echo "  | Send over a secure channel. Token is not recoverable."
    printf  "  | Revoke with: %s --revoke %s\n" "$0" "${uid}"
    echo "  +------------------------------------------------------------------+"
}

# --- Revoke subcommand -------------------------------------------------------
do_revoke() {
    local uid="$1"
    validate_user_id "${uid}"

    local count_before
    count_before="$(grep -c "=${uid}$" "${TOKEN_FILE}" 2>/dev/null || true)"
    if [[ "${count_before}" -eq 0 ]]; then
        echo "No tokens found for '${uid}'. Nothing to revoke."
        return 0
    fi

    local tmptoken
    tmptoken="$(mktemp "${TOKEN_FILE}.tmp.XXXXXXXX")"
    grep -v "=${uid}$" "${TOKEN_FILE}" > "${tmptoken}" || true
    mv "${tmptoken}" "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"

    echo "  revoked: ${count_before} token(s) for '${uid}'"
    render_and_reload
    echo "  done: '${uid}' access removed."
}

# --- Rotate subcommand (Pike #7) --------------------------------------------
do_rotate() {
    local uid="$1"
    validate_user_id "${uid}"

    # Revoke existing tokens for this user
    local tmptoken
    tmptoken="$(mktemp "${TOKEN_FILE}.tmp.XXXXXXXX")"
    grep -v "=${uid}$" "${TOKEN_FILE}" > "${tmptoken}" || true
    mv "${tmptoken}" "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"

    # Mint one new token atomically (same flock context)
    local new_token
    new_token="$(gen_token)"
    printf '%s=%s\n' "${new_token}" "${uid}" >> "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"

    render_and_reload

    echo ""
    echo "  +------------------------------------------------------------------+"
    echo "  | Token rotated for: ${uid}"
    echo "  | MCP URL:   http://192.168.1.12:8000"
    printf  "  | Bearer:    %s\n" "${new_token}"
    echo "  | OpenWebUI: update your tool server with the new Bearer above."
    echo "  | Old token(s) revoked. Send new token over a secure channel."
    printf  "  | Revoke with: %s --revoke %s\n" "$0" "${uid}"
    echo "  +------------------------------------------------------------------+"
}

# --- List subcommand --------------------------------------------------------
do_list() {
    echo "Registered coworkers:"
    if [[ ! -f "${TOKEN_FILE}" ]] || ! grep -qv '^#' "${TOKEN_FILE}" 2>/dev/null; then
        echo "  (none)"
        return 0
    fi
    # Print user_id only — never print token values
    grep -v '^#' "${TOKEN_FILE}" | grep -v '^$' \
        | cut -d= -f2 | sort -u \
        | while IFS= read -r uid; do
            echo "  ${uid}"
          done
}

# --- Ensure dirs & token file -----------------------------------------------
mkdir -p "${CONFIG_DIR}"
touch "${TOKEN_FILE}"
chmod 600 "${TOKEN_FILE}"

# --- flock guard (Pike #2) --------------------------------------------------
# Open lock file and acquire before any mutating operation. The fd stays open
# for the lifetime of the script; flock releases when the process exits.
exec {LOCK_FD}>"${LOCK_FILE}"

# --- Dispatch ---------------------------------------------------------------
cmd="${1:-}"
case "${cmd}" in

    --list)
        do_list
        ;;

    --revoke)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 --revoke <user_id>" >&2
            exit 1
        fi
        flock -x "${LOCK_FD}"
        do_revoke "${2}"
        ;;

    --rotate)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 --rotate <user_id>" >&2
            exit 1
        fi
        flock -x "${LOCK_FD}"
        do_rotate "${2}"
        ;;

    "")
        echo "Usage:" >&2
        echo "  $0 <user_id>           # mint a new Bearer token" >&2
        echo "  $0 --revoke <user_id>  # revoke all tokens for user" >&2
        echo "  $0 --rotate <user_id>  # revoke + mint one new token" >&2
        echo "  $0 --list              # list registered coworkers (no token values)" >&2
        exit 1
        ;;

    --*)
        echo "ERROR: Unknown option '${cmd}'" >&2
        echo "  Run '$0' with no arguments to see usage." >&2
        exit 1
        ;;

    *)
        # Bare argument: treat as user_id to mint
        flock -x "${LOCK_FD}"
        do_mint "${cmd}"
        ;;

esac
