# Install & Deploy Review

> **FRESH DEPLOY NOT VERIFIED**
> This document does not claim a fresh deploy was performed in the current session.
> A fresh deploy transcript is still required before this review is considered complete.

## Status

standalone pull-deploy is **not yet** verified. The GHCR pull-deploy path has not been validated end-to-end. Do not promote it as a verified deployment path until a fresh deploy transcript is recorded here.

## Canonical Deploy Procedure

Run in order:

```bash
bash scripts/validate-env.sh
docker compose --env-file .env --env-file .env.local build --no-cache
docker compose --env-file .env --env-file .env.local up -d
docker compose ps
curl -f http://localhost:3100/api/health/live
```

## Environment Validation

The `bash scripts/validate-env.sh` script must pass before any deploy. It validates:
- All required env vars are present
- No critical vars are missing

## Notes

- `docker compose ps` confirms all containers are running
- `curl -f http://localhost:3100/api/health/live` confirms the dashboard is serving
- Rollback: `docker compose --env-file .env --env-file .env.local down && git checkout <prev-sha> && docker compose --env-file .env --env-file .env.local up -d`
