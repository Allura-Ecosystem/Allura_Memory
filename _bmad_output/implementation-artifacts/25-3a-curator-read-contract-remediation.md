# Story 25.3a — Curator Read Contract and Workspace Authority Remediation

**Status:** Done — merged PR #122 with final Pike/Fowler/Knuth verdicts and current-SHA CI evidence 2026-08-27.
**Owner:** Brooks + Woz + Knuth + Pike + Fowler
**Depends on:** 25.2a, 25.2b, 24.12
**Blocks:** 25.3b and REQ-MOD-001..003. The Epic 26 Correct Course removed the dashboard registry from the headless Bumblebee scanner critical path.

## Outcome

The authenticated curator read boundary derives tenant, workspace, principal, and role server-side; reads proposals, scoped evidence, and immutable governance receipts only through restricted workspace transactions. Browser-controlled tenant/workspace selectors and direct module-owned data routes are rejected.

## Acceptance Criteria

- [x] `/api/curator/proposals` derives effective tenant/workspace from authenticated server authority; it accepts no browser-authoritative `group_id` or `workspace_id` selector.
- [x] Every proposal/evidence/receipt read uses `withWorkspaceTransaction` and scope predicates consistent with the effective-tenant seam.
- [x] Forged, mismatched, missing, and cross-workspace selectors fail closed without returning data.
- [x] The read model uses scoped evidence and immutable governance receipts; legacy event metadata is not treated as the authoritative decision receipt source.
- [x] `/dashboard/curator` is prepared as the only future registry host boundary; direct Bumblebee routing/module-owned direct storage access is prohibited by regression tests until registry composition is implemented.
- [x] Tests cover server-derived authority, tenant/workspace isolation, forged-principal/selector rejection (including duplicate scope selectors), and no direct data-access regression.
- [x] Typecheck, focused tests, independent Pike/Fowler/Knuth review, PR CI, and source reconciliation pass.

## Completion Notes — 2026-08-27

- agent: Brooks + Woz + Knuth + Pike + Fowler
- date: 2026-08-27
- files changed: `src/app/api/curator/proposals/route.ts`, `src/lib/curator/operator-read-service.ts`, curator/Bumblebee boundary tests, this story, and authoritative sprint status; `src/lib/bumblebee/queries.ts` and the direct Bumblebee route were removed.
- commands/evidence: focused tests 55/55 exit 0; `bun run typecheck` exit 0; `bun run test:unit` 2,152 passed / 160 skipped exit 0; current-SHA hosted CI passed; PR #122 merged.
- remaining gaps: none for Story 25.3a; generic module-registry acceptance remains owned by Story 25.3b and is not an Epic 26 scanner-ingestion dependency.

- Merged as PR #122, `bff4f8456b4a7deea56f12e18847788409967742`, verified on `origin/main`.
- Pike final PASS; Fowler final PASS; Knuth GO.
- Current PR SHA remote CI passed, including the Epic 24 Evidence Live PostgreSQL lane.
- Allura Brain merge receipt read back: `ee8cfe36-0329-4fd0-830c-222e42e45941`.

## Evidence

- API and server-authority tests.
- Fresh PostgreSQL/RLS tenant-isolation evidence where database behavior is changed.
- Static-boundary tests for curator shell and module access.
- Pike/Fowler/Knuth review findings and final verdict.
- Final remediation evidence: duplicate `group_id`/`workspace_id` selectors fail closed before a transaction; the shared `src/lib/curator/operator-read-service.ts` owns operator storage reads, while `src/lib/bumblebee/queries.ts` is absent and guarded by a regression test. Focused unit tests passed (55/55 across curator route, module, and surfaces); `bun run typecheck` passed; `bun run test:unit` passed (2152 passed, 160 skipped). Independent review, current-SHA PR CI, merge, and source reconciliation passed through PR #122.

## Rollback

Revert the curator read-contract slice. No module registry or module registration is enabled by this story.
