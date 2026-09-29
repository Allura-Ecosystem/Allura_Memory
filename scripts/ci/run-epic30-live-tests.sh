#!/usr/bin/env bash
set -Eeuo pipefail
# Credentials must be injected explicitly. Never search local files or fall back.
for key in POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_APP_USER POSTGRES_APP_PASSWORD; do
  if [[ -z "${!key:-}" ]]; then printf 'Epic30 live prerequisite missing: %s\n' "$key" >&2; exit 64; fi
done
if [[ "$POSTGRES_HOST" != 127.0.0.1 || "$POSTGRES_PORT" != 5444 || "$POSTGRES_APP_USER" != allura_app || "${NODE_ENV:-}" == production ]]; then
  printf 'Epic30 live requires nonproduction loopback 5444 and allura_app.\n' >&2
  exit 64
fi
if [[ -d .epic30-process-lock ]]; then
  printf 'Epic30 worktree already owns a process; use an isolated checkout for live HTTP proof.\n' >&2
  exit 64
fi
# The live inventory includes a delegation-credential proof that mints and
# revokes a real mcp_tokens row, so the lane needs a token secret. Generate a
# throwaway one per run when the caller has not supplied one: without this the
# lane fails in every clean environment, including hosted CI, which sets no
# such variable. Never reuse a production secret here; the value is per-run and
# is not persisted.
token_secret="${ALLURA_MCP_TOKEN_SECRET:-$(bun -e 'process.stdout.write(crypto.randomUUID().replaceAll("-",""))')}"

# Pin a single pooled connection so the delegation proof's reused-connection
# claim is guaranteed by configuration rather than by incidental sequential
# scheduling.
POSTGRES_POOL_MAX="${POSTGRES_POOL_MAX:-1}" \
ALLURA_MCP_TOKEN_SECRET="$token_secret" \
RUN_E2E_TESTS=true ALLURA_EPIC30_HTTP_PROOF=enabled bun vitest run --config vitest.config.epic30-live.ts "$@"
