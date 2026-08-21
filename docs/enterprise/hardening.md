# Allura Hardening Guide

## PostgreSQL Hardening

### Row-Level Security
- RLS is enabled and forced on 37 tenant-scoped tables
- Application role (`allura_app`) has least-privilege DML
- `allura_breakglass` role permits documented break-glass mutation
- Events table denies UPDATE/DELETE for application role

### Connection Security
- PostgreSQL binds to `0.0.0.0:5432` inside Docker network only
- External access requires Cloudflare tunnel with triple auth

## MCP Gateway Hardening

### Token Authentication
- HMAC-based per-caller tokens when `ALLURA_MCP_TOKEN_SECRET` is set
- Static tokens are ignored in HMAC mode
- Tokens are hashed (SHA-256) and never stored in plaintext

### DevAuth Safety
- `ALLURA_DEV_AUTH_ENABLED=true` in `.env` is a P0 deployment hazard
- Production must force DevAuth false at code level
- The web-surface hole in `isDevAuthActive()` must be patched

## Key Rotation

### MCP Token Rotation
1. Generate new token with `scripts/mint-mcp-token.ts`
2. Insert hash into `mcp_tokens` table
3. Update Hermes config with new token
4. Restart Hermes gateway
5. Verify with `curl` initialize request
6. Disable old token in `mcp_tokens`

### PostgreSQL Password Rotation
1. Change password in `.env` and Docker compose
2. `docker compose up -d --force-recreate knowledge-postgres`
3. Update all MCP config references

## Backup and Recovery

### PostgreSQL Backup
```bash
docker exec knowledge-postgres pg_dump -U ronin4life memory > backup-$(date +%Y%m%d).sql
```

### Restore
```bash
docker exec -i knowledge-postgres psql -U ronin4life memory < backup-YYYYMMDD.sql
```

## Retention and Deletion

- Episodic memories: no automatic deletion (append-only)
- Soft-deleted memories: 30-day recovery window
- Audit events: permanent (immutable)
- Canonical memories: soft-delete only, never hard-delete

## Break-Glass Procedure

1. Document the reason and approver
2. Connect as `allura_breakglass` role
3. Perform the mutation
4. Log to events table with `event_type: 'break_glass_mutation'`
5. Notify security team within 24 hours