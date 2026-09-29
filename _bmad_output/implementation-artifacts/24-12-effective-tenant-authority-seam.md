# Story 24.12 — Effective-Tenant Authority Seam

**Status:** Done
**Owner:** Woz + Pike + Fowler
**Depends on:** 24.2 (authenticated principal context)
**Blocks:** 25.3 (curator read contract), later workspace-scoped reads

## Outcome

A single `resolveApiTenant` seam reconciles the duplicate tenant-resolution helpers
(`getGroupIdFromAuth` in `api-auth.ts` and `resolveWebApprovalTenant` in
`web-principal.ts`) into one authority path. It returns a discriminated 400/401/403/ok
result, never a protected-route `allura-system` fallback, and never trusts a request
selector as authority.

## Context

- `getGroupIdFromAuth` currently returns `fallbackGroupId ?? "allura-system"` for
  protected routes — a hard-coded tenant fallback the browser cannot assert.
- `resolveWebApprovalTenant` throws on mismatch but does not express 400/401/403.
- Route handlers need one seam that maps malformed selector → 400, missing identity → 401,
  foreign tenant → 403, matching/absent selector → authenticated tenant.

## Acceptance Criteria

- [x] Malformed request selector → 400 INVALID_GROUP_ID.
- [x] Missing authenticated identity → 401.
- [x] Valid selector for a different tenant → 403 TENANT_MISMATCH.
- [x] Matching or absent selector → authenticated active tenant (ok).
- [x] No protected-route `allura-system` fallback.
- [x] `getGroupIdFromAuth` and `resolveWebApprovalTenant` reconcile to the single seam.
- [x] No application route is migrated in this diff.

## Non-Goals

- No route migration.
- No change to approval mutation semantics (Story 24.4 remains the atomic gate).

## Evidence

- Context7 was quota/format-blocked and OAuth-based in the Docker MCP gateway; the
  contract was derived from installed `node_modules/next` types, existing `route.ts`
  handlers/tests, and the repository auth contract. See Option-A decision note.

## Rollback

Keep the prior helpers; do not wire `resolveApiTenant` into callers. The seam is additive.
