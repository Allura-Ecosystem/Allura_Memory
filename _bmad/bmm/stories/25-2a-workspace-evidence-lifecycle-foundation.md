# Story 25.2a — Workspace Scope and Evidence Lifecycle Foundation

**Status:** Done — final Knuth/Pike/Fowler approval 2026-08-26
**Owner:** Troy + Knuth + Brooks
**Depends on:** 24.2 authenticated principal context; 24.3 tenant isolation; 25.1 scope/product truth
**Blocks:** 25.2–25.6

## Outcome

Make workspace scope, evidence requests, and review receipts durable application concepts before a browser queue claims to show workspace-governed review.

## Verified Current-State Facts

- Legacy events and proposals remain intentionally unscoped; no default workspace backfill is permitted.
- Workspace-governed watchdog events and canonical proposals persist `workspace_id` and use composite tenant/workspace integrity.
- Request-evidence now writes a queryable workspace-scoped lifecycle row while proposal status remains `pending`; an append-only event remains audit evidence, not lifecycle authority.
- Decisions now issue immutable workspace/policy/evidence-version receipts; approval additionally binds promoted memory and canonical workspace outbox truth in one app-role transaction.

## Dependency Re-evaluation (added by Story 25.1, AC-8)

**Date:** 2026-08-26. **Status: Done; final Knuth/Pike/Fowler approval.**

The declared dependencies 24.2, 24.3, and 25.1 are Done. The dependency hold is removed.

2026-08-26 remediation tick (disposable PostgreSQL `allura-252a-disposable` @ 127.0.0.1:55432 only): strict TDD found the live lane was RED at **40/43** — (1) Migration 40 composite FK `allura_memories_group_workspace_fkey` broke the pre-existing Story 24.3 `database-tenant-isolation.e2e.test.ts` (no `workspaces` row seeded), and (2) the workspace rollback test asserted a stale 6-table `workspace_scope_restrictive_policy` list while migration 39/40 creates it on 8 tables. Both test fixtures were aligned to the governed schema invariants; fresh `allura_tick_green` disposable DB live lane is now **GREEN 43/43**, focused unit 30/30, typecheck 0.

Three review cycles exposed a split architecture between workspace-scoped services and legacy tenant-only lifecycle/fallback paths. The user chose the fail-closed architecture: retire direct writer fallback and unsupported tenant-only adapter lifecycle methods rather than continue piecemeal migration. Rollback now refuses every current workspace-scoped graph family, including structural edges. Final evidence is retirement-focused **25/25**, full unit **1,905**, disposable PostgreSQL **59/59** with zero pending, typecheck/lint/build, and drift gates green. Final frozen candidate `d54e4f8a81e90d9ed9a6a5761c613ec0d6ac51f5835a7cdc7cdb6c5a95d72c33` received independent Knuth/Pike/Fowler **APPROVE**. See `25-2a-code-review.md`.

| Declared dependency | Current state | Still blocking? |
| --- | --- | --- |
| 24.2 authenticated principal context | Done | No |
| 24.3 tenant isolation | Done | No |
| 25.1 scope and product truth | Done | No |

No Story 25.2a blocker remains. Story 25.3 may enter its own dependency and readiness gate.

The canonical Notion card and this mainline story evidence are reconciled at Done; the retired local Epic 25 drift pack is not restored.

## Acceptance Criteria

- [x] A written migration plan identifies every persisted record that must carry `workspace_id`: proposal, event/evidence reference, retained/promoted knowledge, receipt projection, and outbox item.
- [x] New governed write paths persist a non-null workspace boundary, derive it from the authenticated principal/token context, and never trust a browser-provided workspace as authority.
- [x] `workspaces` has composite `(group_id, workspace_id)` uniqueness; token and first-slice record foreign keys bind both values. Existing rows use a reviewed migration map or remain unavailable to workspace-scoped reads—no default workspace backfill is invented.
- [x] Scoped transactions set standardized transaction-local group, workspace, and principal settings. Workspace-owned RLS `USING` and `WITH CHECK` policies enforce both group and workspace; the first-slice app role cannot fall back to an owner/migration role.
- [x] `evidence_requests`, immutable `governance_receipts`, and versioned `semantic_projections` are durable scoped records, not free-form event metadata. Projection jobs use deterministic idempotency keys and do not reuse promotion-specific outbox semantics unchanged.
- [x] Read/retrieval queries first resolve structured relational facts and hard filters—authenticated tenant/workspace, membership/role, proposal status, evidence-request state, trace/receipt identity, actor, time range, and explicit entity IDs—before semantic candidate expansion. Semantic/vector retrieval may widen or rank candidates but may not override a relational boundary or substitute for a factual lookup.
- [x] Each relational entity family that needs semantic discovery has a deterministic, versioned **SemanticProjection** builder that assembles its meaningful header/detail relationship into governed Markdown before embedding. For a proposal this includes scope, proposal header, linked trace/event evidence, evidence-request state, decision/receipt state where present, and redaction classification—not a bare `canonical_proposals` row.
- [x] Projection generation is source-driven and idempotent: it records source table/row references, projection version, content hash, generation time, redaction policy, and embedding model/version. The relational records remain authoritative; embeddings are a derived index that can be rebuilt or deleted without changing source facts.
- [x] Proposal status stays intentionally distinct from evidence-request state; the queue can distinguish reviewable pending, evidence requested, evidence satisfied/reopened, approved, and rejected without inferring from presentation text.
- [x] Receipt projection includes proposal version, workspace ID, server-issued actor/role, action, nonblank rationale, policy reference/version, immutable evidence references, timestamp, memory ID where applicable, and truthful outbox/sync state.
- [x] Cross-tenant, cross-workspace, legacy-unscoped, malformed-scope, evidence-request, and receipt-version tests are specified; live-DB proofs are required before Done.
- [x] `DATA-DICTIONARY.md`, `REQUIREMENTS-MATRIX.md`, and migration/rollback evidence are updated.

## Non-Goals

- No browser route, dashboard shell, or decision button.
- No approval mutation release; Story 24.4 remains the atomic-promotion gate.
- No destructive rewrite or deletion of legacy data without explicit backup approval.

## Code Review Remediation Boundary

- `/api/curator/proposals` remains at its pre-25.2a base behavior. Story 25.2a does not expand that route's read surface; Story 25.3 owns server-derived workspace authorization and receipt-read hardening for the route.

## Evidence

Store the migration plan, schema checks, query plans, live-DB isolation cases, receipt samples, and rollback proof under:

```text
docs/archive/allura/evidence/epic-25/25.2a/
```

Final sole-writer remediation evidence is recorded in `migration-rollback-evidence.md`,
with the concrete owning upgrade sequence in `record-family-migration-plan.md` and the
deterministic frozen-candidate recipe/hash in `frozen-diff-hash.md`. The story remains
**Done** after final independent Knuth/Pike/Fowler approval.

## Dev Agent Record

- **Agent:** Woz implementation role, executed by the Hermes sole-writer session
- **Date:** 2026-08-26
- **Files changed:** 88-file final frozen candidate; exact inventory and deterministic recipe in `docs/archive/allura/evidence/epic-25/25.2a/frozen-diff-hash.md`
- **Commands:** exit code 0 for every evidence command below
  - `bun vitest run src/lib/memory/writer.test.ts src/lib/graph-adapter/__tests__/ruvector-workspace-authority.test.ts` — exit 0, 25/25
  - `bun run test:unit` — exit 0, 1,905 passed, 160 declared skips
  - `bash scripts/ci/run-live-db-tests.sh --artifact-dir=artifacts/ci/local/25.2a-retired-fallback-green` — exit 0, 59/59, zero pending
  - `bun run typecheck` and `bun run lint` — exit 0
  - `bun run build` — exit 0, 53 pages
  - `bun run epic25:drift` and `bun run test:epic25:drift` — exit 0, 8/8/8 aligned and 10/10
  - `git diff --check` — exit 0
- **Review evidence:** `_bmad/bmm/stories/25-2a-code-review.md`; final Knuth/Pike/Fowler APPROVE receipts recorded there
- **Remaining gaps:** none within Story 25.2a; Story 25.3 owns the next read-contract gate, and the Epic 25 retrospective remains blocked until all stories are Done
