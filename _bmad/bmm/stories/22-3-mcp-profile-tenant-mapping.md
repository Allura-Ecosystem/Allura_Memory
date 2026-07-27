# Story 22.3 — Wire MCP Profile ↔ Tenant Mapping

**Status:** ready-for-dev
**Owner:** Brooks → Woz + Hightower
**group_id:** allura-system
**Epic:** 22

## User Story

As the Allura architect, I need the MCP server to validate `DEFAULT_GROUP_ID` against the tenants table at startup, so that an unregistered tenant fails closed instead of silently creating memories in an unregistered namespace.

## Context

- Docker MCP profiles set `DEFAULT_GROUP_ID` env var per profile
- The Allura Brain MCP server reads this env var at startup (`src/mcp/canonical-tools/connection.ts`)
- No validation exists today — any `^allura-` group_id is accepted
- The tenants table (Story 22.1) is the source of truth

## Acceptance Criteria

- [ ] AC-1: At MCP server startup, `DEFAULT_GROUP_ID` is validated against the `tenants` table
- [ ] AC-2: If the tenant doesn't exist in the table, the server fails closed with a clear error: "DEFAULT_GROUP_ID '{value}' is not a registered tenant. Run POST /api/tenants to register."
- [ ] AC-3: If the tenant exists but `active=false`, the server fails closed with: "Tenant '{value}' is inactive."
- [ ] AC-4: The validation runs after database connection is established but before MCP tool registration
- [ ] AC-5: A warning is logged if `DEFAULT_GROUP_ID` env var is not set (falls back to `allura-system` with a warning, not a crash)
- [ ] AC-6: Integration test verifies: valid tenant starts successfully, invalid tenant fails closed, inactive tenant fails closed

## Tasks

1. Read `src/mcp/startup.ts` to understand the startup sequence
2. Add tenant validation function in `src/lib/config/tenant-validator.ts`
3. Call it during startup after PG connection is ready
4. Create `src/__tests__/tenant-startup-validation.test.ts`
5. Run `bun run typecheck && bun test`

## File List

- `src/lib/config/tenant-validator.ts` (NEW)
- `src/mcp/startup.ts` (MODIFY — call validator)
- `src/__tests__/tenant-startup-validation.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |