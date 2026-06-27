#!/usr/bin/env bash
#
# install-openwebui-bridge.sh — install/refresh the Allura mcpo OpenAPI bridge
# as a persistent systemd --user service.
#
# The bridge runs `mcpo` (https://github.com/open-webui/mcpo), an MCP->OpenAPI
# proxy, so an OpenWebUI instance on the LAN can call the canonical Allura MCP
# (Streamable HTTP at MCP_URL) as plain REST tools. This is the OpenWebUI access
# path used while we cannot run Claude Desktop (no Linux build).
#
# Idempotent: safe to re-run. Generates an API key on first run and reuses it
# after. Enables linger so the service survives logout/reboot.
#
# Usage:
#   bash scripts/openwebui-bridge/install-openwebui-bridge.sh
#
# Env overrides:
#   MCP_URL     upstream MCP endpoint   (default: http://127.0.0.1:5888/mcp)
#   BRIDGE_HOST bind address            (default: 127.0.0.1)
#   BRIDGE_PORT bind port               (default: 8001)
#   MCPO_API_KEY  reuse an explicit key (default: existing key or generated)
#
# SECURITY NOTE: mcpo now binds loopback only (127.0.0.1:8001). The LAN entry
# point is the Caddy per-coworker token gateway on :8000 (install-token-gateway.sh),
# which validates per-coworker Bearer tokens and forwards to mcpo with the single
# internal key. The hardened path (Caddy gateway + per-coworker tokens) is tracked
# in docs/archive/allura/stories/6-1-faithmeats-openwebui-onboarding.md (AC6-AC8).

set -euo pipefail

MCP_URL="${MCP_URL:-http://127.0.0.1:5888/mcp}"
BRIDGE_HOST="${BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${BRIDGE_PORT:-8001}"

SERVICE_NAME="allura-mcpo-bridge.service"
CONFIG_DIR="${HOME}/.config/allura"
ENV_FILE="${CONFIG_DIR}/mcpo.env"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_FILE="${UNIT_DIR}/${SERVICE_NAME}"

echo "=== Allura OpenWebUI bridge installer ==="

# --- Preconditions --------------------------------------------------------
UVX_BIN="$(command -v uvx || true)"
if [ -z "${UVX_BIN}" ]; then
  echo "FAIL: 'uvx' not found on PATH. Install uv (https://docs.astral.sh/uv/) first." >&2
  exit 1
fi
echo "  uvx:        ${UVX_BIN}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "FAIL: systemctl not available (this installer targets systemd --user)." >&2
  exit 1
fi

# --- API key (generate once, then reuse) ----------------------------------
mkdir -p "${CONFIG_DIR}" "${UNIT_DIR}"
if [ -n "${MCPO_API_KEY:-}" ]; then
  KEY="${MCPO_API_KEY}"
elif [ -f "${ENV_FILE}" ] && grep -q '^MCPO_API_KEY=' "${ENV_FILE}"; then
  KEY="$(grep '^MCPO_API_KEY=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
  echo "  api key:    reused from ${ENV_FILE}"
else
  KEY="$(openssl rand -hex 24)"
  echo "  api key:    generated (new)"
fi
printf 'MCPO_API_KEY=%s\n' "${KEY}" > "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
echo "  env file:   ${ENV_FILE} (mode 600)"

# --- Render the unit from the template -------------------------------------
cat > "${UNIT_FILE}" <<UNIT
[Unit]
Description=Allura mcpo OpenAPI bridge (Brain MCP -> OpenAPI for OpenWebUI)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=%h/.config/allura/mcpo.env
ExecStart=${UVX_BIN} mcpo --host ${BRIDGE_HOST} --port ${BRIDGE_PORT} --api-key \${MCPO_API_KEY} --server-type streamable_http -- ${MCP_URL}
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=120
StartLimitBurst=10

[Install]
WantedBy=default.target
UNIT
echo "  unit:       ${UNIT_FILE}"

# --- Enable linger so it runs without an active login ----------------------
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || true
  echo "  linger:     $(loginctl show-user "$(id -un)" -p Linger 2>/dev/null | cut -d= -f2)"
fi

# --- (Re)start the service -------------------------------------------------
systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}"
sleep 4

echo ""
systemctl --user --no-pager --lines=0 status "${SERVICE_NAME}" | head -4 || true

# --- Verify ----------------------------------------------------------------
echo ""
echo "=== verify ==="
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://127.0.0.1:${BRIDGE_PORT}/docs" || echo 000)"
echo "  GET /docs -> HTTP ${CODE}"
if [ "${CODE}" = "200" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo ""
  echo "Bridge is up. Register it in OpenWebUI (Settings -> Tools -> Manage Tool Servers):"
  echo "  URL:     http://${LAN_IP:-<this-host-lan-ip>}:${BRIDGE_PORT}"
  echo "  API Key: ${KEY}"
else
  echo "  WARN: bridge not answering yet. Check: journalctl --user -u ${SERVICE_NAME} -n 50 --no-pager"
  exit 1
fi
