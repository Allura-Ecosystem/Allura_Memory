# Story 22.1 — Create Tenant Registry Table

**Status:** done
**Owner:** Brooks → Knuth
**group_id:** allura-system
**Epic:** 22

## User Story

As the Allura data architect, I need a `tenants` table in PostgreSQL that registers every tenant namespace, so that the system has a source of truth for which tenants exist, who owns them, and what their configuration is.

## Context

- `group_id` is enforced by CHECK constraint `^allura-[a-z0-9-]+$` on every table
- No registry table exists — tenants are implicit (any group_id that matches the pattern is accepted)
- Docker MCP profiles created: faithmeats, difference-driven, coding, openclaw
- Need a migration that creates the table and seeds existing tenants

## Acceptance Criteria

- [x] AC-1: Migration `docker/postgres-init/33-tenant-registry.sql` creates `tenants` table
- [x] AC-2: Columns: `group_id` (PK, TEXT, CHECK `^allura-`), `name` (TEXT), `description` (TEXT), `owner_agent_id` (TEXT), `config` (JSONB, default `{}`), `active` (BOOLEAN, default TRUE), `created_at` (TIMESTAMPTZ, default NOW())
- [x] AC-3: Seeds existing tenants: `allura-system`, `allura-faithmeats`, `allura-difference-driven`, `allura-coding`
- [x] AC-4: The control plane target resolver (`src/control-plane/target-resolver.ts`) is updated to validate `group_id` exists in `tenants` table on writes — fail closed if tenant not registered
- [x] AC-5: Migration is idempotent — safe to run on existing databases
- [x] AC-6: Unit tests verify: table exists, seed data correct, unregistered group_id rejected

## Tasks

1. Create `docker/postgres-init/33-tenant-registry.sql`
2. Update `src/control-plane/target-resolver.ts` to validate tenant existence
3. Create `src/__tests__/tenant-registry.test.ts`
4. Run migration against dev database
5. Run `bun run typecheck && bun test`

## File List

- `docker/postgres-init/33-tenant-registry.sql` (NEW)
- `src/control-plane/target-resolver.ts` (MODIFY — tenant validation)
- `src/__tests__/tenant-registry.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |
| 2026-07-27 | Implemented: migration 33-tenant-registry.sql, tenant-existence.ts, target-resolver tenant validation, 15/15 tests pass | Knuth |