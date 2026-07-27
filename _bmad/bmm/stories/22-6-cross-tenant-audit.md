# Story 22.6 — Cross-Tenant Audit Endpoint

**Status:** ready-for-dev
**Owner:** Brooks → Bellard + Pike
**group_id:** allura-system
**Epic:** 22

## User Story

As the Allura security lead, I need an automated cross-tenant audit endpoint, so that I have evidence that zero tenant leakage occurs across all registered tenants.

## Context

- The kernel enforces `group_id` on every read/write via CHECK constraint and syscall validation
- The completion spec (§C) requires: "Cross-tenant read/search/update/delete/promote attempts fail. Verified by: adversarial matrix with ≥5 synthetic tenants and ≥100 seeded memories per tenant."
- No automated audit endpoint exists today
- This is the evidence gate for multi-tenant safety

## Acceptance Criteria

- [ ] AC-1: `GET /api/audit/cross-tenant` (admin-only) runs an automated cross-tenant leakage test
- [ ] AC-2: The test creates 5 synthetic tenants with 10 memories each, then runs 100 random queries per tenant pair attempting cross-tenant reads
- [ ] AC-3: All cross-tenant queries must return empty results — any non-empty result is a CRITICAL failure
- [ ] AC-4: The response includes: `{ tenants_tested, queries_per_pair, total_queries, leaks_found, status }`
- [ ] AC-5: If any leak is found, the endpoint returns 500 with details and writes an ALERT to Allura Brain
- [ ] AC-6: The test cleans up synthetic tenants and memories after running (idempotent)
- [ ] AC-7: Unit tests verify: no leaks on clean run, synthetic data is cleaned up, auth required

## Tasks

1. Create `src/app/api/audit/cross-tenant/route.ts`
2. Create `src/lib/audit/cross-tenant-test.ts` — the test engine
3. Create synthetic tenants via `POST /api/tenants` (from Story 22.2)
4. Seed memories via `memory_add` with synthetic group_ids
5. Run cross-tenant queries via `memory_search`
6. Clean up synthetic data
7. Create `src/__tests__/cross-tenant-audit.test.ts`
8. Run `bun run typecheck && bun test`

## File List

- `src/app/api/audit/cross-tenant/route.ts` (NEW)
- `src/lib/audit/cross-tenant-test.ts` (NEW)
- `src/__tests__/cross-tenant-audit.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |