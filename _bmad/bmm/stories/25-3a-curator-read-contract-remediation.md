# Story 25.3a — Curator Read Contract and Workspace Authority Remediation

**Status:** In Progress
**Owner:** Brooks + Woz + Knuth + Pike + Fowler
**Depends on:** 25.2a, 25.2b, 24.12
**Blocks:** 25.3b, REQ-MOD-001..003, Story 26.7 AC-2

## Outcome

The authenticated curator read boundary derives tenant, workspace, principal, and role server-side; reads proposals, scoped evidence, and immutable governance receipts only through restricted workspace transactions. Browser-controlled tenant/workspace selectors and direct module-owned data routes are rejected.

## Acceptance Criteria

- [x] `/api/curator/proposals` derives effective tenant/workspace from authenticated server authority; it accepts no browser-authoritative `group_id` or `workspace_id` selector.
- [x] Every proposal/evidence/receipt read uses `withWorkspaceTransaction` and scope predicates consistent with the effective-tenant seam.
- [x] Forged, mismatched, missing, and cross-workspace selectors fail closed without returning data.
- [x] The read model uses scoped evidence and immutable governance receipts; legacy event metadata is not treated as the authoritative decision receipt source.
- [x] `/dashboard/curator` is prepared as the only future registry host boundary; direct Bumblebee routing/module-owned direct storage access is prohibited by regression tests until registry composition is implemented.
- [x] Tests cover server-derived authority, tenant/workspace isolation, forged-principal/selector rejection, and no direct data-access regression.
- [ ] Typecheck, focused tests, independent Pike/Fowler/Knuth review, PR CI, and source reconciliation pass.

## Evidence

- API and server-authority tests.
- Fresh PostgreSQL/RLS tenant-isolation evidence where database behavior is changed.
- Static-boundary tests for curator shell and module access.
- Pike/Fowler/Knuth review findings and final verdict.
- Local implementation evidence (2026-08-27): `bun run typecheck` passed; `bun run test:unit` passed (2,150 passed, 160 skipped); focused curator-route and effective-tenant seam tests passed (15 assertions). Independent review, PR CI, and source reconciliation remain pending.

## Rollback

Revert the curator read-contract slice. No module registry or module registration is enabled by this story.
