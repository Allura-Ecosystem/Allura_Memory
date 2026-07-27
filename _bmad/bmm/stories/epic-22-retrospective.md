# Epic 22 Retrospective — Enterprise Readiness: Multi-Tenant Hardening

**Date:** 2026-07-27
**Epic:** 22 — Enterprise Readiness — Multi-Tenant Hardening
**Status:** Complete
**Owner:** Brooks (dispatched via Hermes delegate_task as Knuth, Woz, Hightower, Fowler, Bellard, Pike)

## What Went Well

1. **Tenant registry table was clean.** The `tenants` table with CHECK constraint on `group_id` format is the right enforcement layer. Seeding 4 tenants (system, faithmeats, difference-driven, coding) at migration time means the system works out of the box.

2. **Tenant onboarding API followed existing patterns.** The `requireRole(request, "admin")` pattern from existing API routes made RBAC trivial. The dynamic SET clause builder in PATCH is reusable for any table with configurable columns.

3. **Startup validation fails closed correctly.** The `validateTenantAtStartup` function checks both existence and `active` status. The `bootstrapMemoryServer` integration ensures validation runs after DB warmup but before tool registration — the right order.

4. **Tenant-scoped curator config is elegant.** The `parseTenantConfig` function with fallback-to-defaults for each field individually is the right design. A tenant can override just `promotion_threshold` and inherit defaults for everything else. The mode adjustment (conservative +0.10, aggressive -0.10) is a simple but effective tuning mechanism.

5. **Docker MCP profile export/import worked on first try.** `docker mcp profile export` and `docker mcp profile import` are well-designed commands. The exported YAML files are self-contained with all server configs, tools, and secrets metadata.

6. **Cross-tenant audit engine is thorough.** 5 synthetic tenants × 10 memories each × 100 queries per pair = 2000 total queries. The cleanup-in-finally pattern ensures synthetic data is removed even on failure.

## What Didn't Go Well

1. **Cross-tenant audit engine has a redundant function.** `runCrossTenantAudit` and `runCrossTenantAuditWithCleanup` have duplicated logic. The first function has an unreachable `throw new Error("unreachable")` because the finally block always runs. The second function uses a module-level `_lastCleanupSucceeded` variable to track cleanup status — not ideal but functional.

2. **Sprint status updates were not done by subagents.** Individual story files were updated but sprint-status.yaml was left at `ready-for-dev` for all epic_20 and epic_22 stories. Parent had to manually update.

3. **Docker MCP profiles are large YAML files.** The openclaw profile is 394 lines, faithmeats is 1378 lines. These are auto-generated and shouldn't be hand-edited, but they bloat the repo. Consider .gitignoring them and documenting the export command instead.

4. **No story 22.5 test file.** Profile export/import is a documentation story — the "test" is the export commands running successfully and the README being accurate. No unit test needed, but this should be explicitly noted.

## Lessons Learned

- **Per-tenant config with JSONB is the right PostgreSQL pattern.** It's schema-flexible, queryable, and doesn't require migrations for new config fields. The `parseTenantConfig` function validates each field independently with fallback to defaults.
- **Mode adjustments for promotion thresholds are a good UX.** Rather than asking tenants to pick a raw number, they pick a mode (conservative/balanced/aggressive) and the system adjusts. This is more intuitive for non-technical tenant admins.
- **Cross-tenant audit should be run regularly.** The endpoint is admin-only and creates/cleans up synthetic data. It should be scheduled (like the drift audit from Epic 21) to run daily or weekly.
- **Cleanup-in-finally is the right pattern for audit engines.** Even if the audit crashes, synthetic tenants and memories are removed. The module-level variable for tracking cleanup status is a pragmatic workaround.

## What Shipped

- `src/lib/config/tenant-existence.ts` — tenant existence check (Story 22.1)
- `src/app/api/tenants/route.ts` — POST + GET /api/tenants (Story 22.2)
- `src/app/api/tenants/[group_id]/route.ts` — GET + PATCH /api/tenants/:group_id (Story 22.2)
- `src/__tests__/tenants-api.test.ts` — 336 lines, 12 tests (Story 22.2)
- `src/lib/config/tenant-validator.ts` — startup validation (Story 22.3)
- `src/__tests__/tenant-startup-validation.test.ts` — 200 lines, 10 tests (Story 22.3)
- `src/lib/config/tenant-config.ts` — 193 lines, per-tenant curator config (Story 22.4)
- `src/__tests__/tenant-config.test.ts` — 270+ lines, 25+ tests (Story 22.4)
- `_bmad/bmm/planning/profiles/` — 4 exported Docker MCP profiles + README.md (Story 22.5)
- `src/lib/audit/cross-tenant-test.ts` — audit engine (Story 22.6)
- `src/app/api/audit/cross-tenant/route.ts` — admin-only GET endpoint (Story 22.6)
- `src/__tests__/cross-tenant-audit.test.ts` — 260+ lines, 8 tests (Story 22.6)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-27 | Retrospective written | Gilliam |