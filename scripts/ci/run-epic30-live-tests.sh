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
RUN_E2E_TESTS=true ALLURA_EPIC30_HTTP_PROOF=enabled bun vitest run --config vitest.config.epic30-live.ts "$@"
