#!/usr/bin/env bash
#
# install-cloudflared-tunnel.sh — publish the Allura Brain MCP gateway through a
# Cloudflare named tunnel on your own zone (faithmeats.org), not Anthropic infra.
#
# Topology produced:
#   Cloudflare edge (mcp.faithmeats.org / HTTPS)
#     -> cloudflared named tunnel (this laptop, no inbound port opened)
#       -> Caddy token gateway (localhost:8000) — per-coworker Bearer auth
#         -> mcpo bridge (localhost:8001) -> Allura Brain MCP (localhost:5888)
#
# RUN THIS ON THE LAPTOP that runs the Allura Brain + Caddy gateway. It does NOT
# expose anything on the desktop. The named tunnel makes only OUTBOUND
# connections to Cloudflare, so no router/firewall ports are opened.
#
# Idempotent: re-running reuses an existing tunnel of the same name and re-renders
# config/service. Cloudflare login + tunnel creation are one-time and interactive.
#
# Usage:
#   ./install-cloudflared-tunnel.sh                 # defaults below
#   TUNNEL_NAME=allura-mcp HOSTNAME=mcp.faithmeats.org ./install-cloudflared-tunnel.sh
#   ./install-cloudflared-tunnel.sh --dry-run       # render only, no DNS/service
#
set -euo pipefail

# --- Configuration (override via env) ---------------------------------------
TUNNEL_NAME="${TUNNEL_NAME:-allura-mcp}"
HOSTNAME_FQDN="${HOSTNAME:-mcp.faithmeats.org}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/allura}"
CF_DIR="${CF_DIR:-$HOME/.cloudflared}"
SYSTEMD_USER_DIR="${SYSTEMD_USER_DIR:-$HOME/.config/systemd/user}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_TEMPLATE="$SCRIPT_DIR/allura-cloudflared-config.yml.template"
SERVICE_TEMPLATE="$SCRIPT_DIR/allura-cloudflared.service.template"

log()  { printf '\033[0;36m[cloudflared]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[cloudflared] WARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[cloudflared] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------
[[ -f "$CONFIG_TEMPLATE" ]]  || die "Missing template: $CONFIG_TEMPLATE"
[[ -f "$SERVICE_TEMPLATE" ]] || die "Missing template: $SERVICE_TEMPLATE"

CLOUDFLARED_BIN="$(command -v cloudflared || true)"
[[ -n "$CLOUDFLARED_BIN" ]] || die "cloudflared not found. Install it first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
log "Using cloudflared: $CLOUDFLARED_BIN"

mkdir -p "$CONFIG_DIR" "$SYSTEMD_USER_DIR"

# --- Step 1: ensure logged in (zone authorization cert) ---------------------
# `cloudflared tunnel login` opens a browser and writes ~/.cloudflared/cert.pem,
# scoped to the zone you select (faithmeats.org). One-time per machine.
if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  warn "No Cloudflare origin cert found at $CF_DIR/cert.pem"
  warn "Run this once (opens a browser; pick the faithmeats.org zone):"
  warn "    cloudflared tunnel login"
  die  "Re-run this script after login completes."
fi
log "Origin cert present: $CF_DIR/cert.pem"

# --- Step 2: create (or reuse) the named tunnel -----------------------------
# `tunnel list` output columns: ID  NAME  CREATED  CONNECTIONS
TUNNEL_ID="$("$CLOUDFLARED_BIN" tunnel list --output json 2>/dev/null \
  | grep -B2 "\"name\": *\"$TUNNEL_NAME\"" \
  | grep '"id"' | head -1 | sed -E 's/.*"id": *"([^"]+)".*/\1/' || true)"

if [[ -z "$TUNNEL_ID" ]]; then
  log "Creating tunnel '$TUNNEL_NAME'..."
  "$CLOUDFLARED_BIN" tunnel create "$TUNNEL_NAME"
  TUNNEL_ID="$("$CLOUDFLARED_BIN" tunnel list --output json 2>/dev/null \
    | grep -B2 "\"name\": *\"$TUNNEL_NAME\"" \
    | grep '"id"' | head -1 | sed -E 's/.*"id": *"([^"]+)".*/\1/' || true)"
  [[ -n "$TUNNEL_ID" ]] || die "Tunnel created but ID not resolvable from 'tunnel list'."
else
  log "Reusing existing tunnel '$TUNNEL_NAME'"
fi
log "Tunnel ID: $TUNNEL_ID"

CREDENTIALS_FILE="$CF_DIR/$TUNNEL_ID.json"
[[ -f "$CREDENTIALS_FILE" ]] || die "Credentials file not found: $CREDENTIALS_FILE (re-run 'cloudflared tunnel create $TUNNEL_NAME')"

# --- Step 3: render the ingress config --------------------------------------
RENDERED_CONFIG="$CONFIG_DIR/allura-cloudflared-config.yml"
sed -e "s#__TUNNEL_ID__#${TUNNEL_ID}#g" \
    -e "s#__CREDENTIALS_FILE__#${CREDENTIALS_FILE}#g" \
    -e "s#__HOSTNAME__#${HOSTNAME_FQDN}#g" \
    -e "s#__GATEWAY_URL__#${GATEWAY_URL}#g" \
    "$CONFIG_TEMPLATE" > "$RENDERED_CONFIG"
log "Rendered config: $RENDERED_CONFIG"
"$CLOUDFLARED_BIN" tunnel ingress validate --config "$RENDERED_CONFIG" \
  && log "Ingress config validated."

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "--dry-run: skipping DNS route + service install."
  log "Config is ready at $RENDERED_CONFIG"
  exit 0
fi

# --- Step 4: route DNS (CNAME mcp.faithmeats.org -> tunnel) ------------------
# Idempotent: cloudflared errors if the record exists pointing elsewhere; it is
# a no-op if it already points at this tunnel.
log "Routing DNS: $HOSTNAME_FQDN -> $TUNNEL_NAME"
if ! "$CLOUDFLARED_BIN" tunnel route dns "$TUNNEL_NAME" "$HOSTNAME_FQDN"; then
  warn "DNS route command returned non-zero. If the record already exists and"
  warn "points at this tunnel, that is fine. Otherwise fix the record in the"
  warn "Cloudflare dashboard (delete the stale $HOSTNAME_FQDN record) and re-run."
fi

# --- Step 5: render + install the systemd --user service --------------------
RENDERED_SERVICE="$SYSTEMD_USER_DIR/allura-cloudflared.service"
sed -e "s#__CLOUDFLARED_BIN__#${CLOUDFLARED_BIN}#g" \
    "$SERVICE_TEMPLATE" > "$RENDERED_SERVICE"
log "Rendered service: $RENDERED_SERVICE"

systemctl --user daemon-reload
systemctl --user enable --now allura-cloudflared.service
log "Service enabled and started."

# --- Step 6: report ---------------------------------------------------------
sleep 2
systemctl --user --no-pager status allura-cloudflared.service | head -12 || true
cat <<EOF

[cloudflared] Done.
  Tunnel:   $TUNNEL_NAME ($TUNNEL_ID)
  Public:   https://$HOSTNAME_FQDN  ->  $GATEWAY_URL
  Config:   $RENDERED_CONFIG
  Service:  systemctl --user status allura-cloudflared.service
  Logs:     journalctl --user -u allura-cloudflared.service -f

Verify (from anywhere). Without a valid coworker Bearer token the Caddy gateway
must return 401 — that proves auth is enforced end to end:
  curl -i https://$HOSTNAME_FQDN/openapi.json
  curl -i -H "Authorization: Bearer <coworker-token>" https://$HOSTNAME_FQDN/openapi.json
EOF
