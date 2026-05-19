# Install And Deploy Review

> [!NOTE]
> **AI-Assisted Documentation**
> This review was drafted with AI assistance. Treat it as a Phase 6 release
> gate checklist until a human owner attaches a fresh deploy transcript.

Current status: **FRESH DEPLOY NOT VERIFIED**.

This document records the install and deployment evidence required before
Allura Memory can be called release-ready. It does not claim a fresh deploy was
run.

## Source Compose Path

The recommended deployment path is source checkout plus Docker Compose:

```bash
bash scripts/validate-env.sh
docker compose --env-file .env --env-file .env.local build --no-cache
docker compose --env-file .env --env-file .env.local up -d
docker compose ps
curl -f http://localhost:3100/api/health/live
```

Use both env files for Compose operations that need secrets during YAML
substitution. The root `docker-compose.yml` says `.env.local` is not read for
interpolation unless the command includes:

```bash
docker compose --env-file .env --env-file .env.local
```

## Environment Gate

Before deploy, run:

```bash
bash scripts/validate-env.sh
```

The validator checks these required local values:

- `POSTGRES_PASSWORD`
- `NEO4J_PASSWORD`
- `OLLAMA_API_KEY`
- `RUVIX_KERNEL_SECRET`

The validator is an input check only. It does not prove the deployed services
started, passed health checks, or reached the dashboard.

### Local Check — 2026-05-17

Command:

```bash
bash scripts/validate-env.sh
```

Result: **failed before deploy**.

Failures reported:

- `NEO4J_PASSWORD` missing
- `OLLAMA_API_KEY` missing
- `RUVIX_KERNEL_SECRET` too short

The validator also had a shell `set -e` counter bug that stopped reporting
after the first missing value. That bug is fixed in `scripts/validate-env.sh`
and covered by `src/__tests__/install-deploy-review.test.ts`.

Do not run fresh deploy validation until these environment prerequisites are
corrected.

## Health Evidence Required

A release-ready deploy transcript must include:

- `bash scripts/validate-env.sh`
- `docker compose --env-file .env --env-file .env.local build --no-cache`
- `docker compose --env-file .env --env-file .env.local up -d`
- `docker compose ps`
- `curl -f http://localhost:3100/api/health/live`
- Any MCP gateway health checks required by the release owner.

## GHCR Status

GHCR images are published from CI, but standalone pull-deploy is **not yet
verified**. The release path remains source Compose until a separate GHCR
pull-deploy transcript exists.

## Rollback

If a fresh deploy fails, preserve logs first, then return to the last known good
source Compose state:

```bash
docker compose --env-file .env --env-file .env.local logs --tail=200 web mcp http-gateway
docker compose --env-file .env --env-file .env.local up -d web mcp http-gateway
docker compose ps
curl -f http://localhost:3100/api/health/live
```

If rollback does not restore health, do not mark Phase 6 complete. Attach the
failed transcript to Notion and keep the release gate open.

## Release Decision

Phase 6 install/deploy review is `PARTIAL`: commands and evidence expectations
are documented, the local environment prerequisite check currently fails, and a
fresh deploy transcript is still required before final release.
