# Story 25.2a — Findings-Only Code Review

**Implementation commit:** `87126856` (base), remediated in the working tree on `feat/epic-25-bmad-closure`.

**Verdict:** **APPROVE** (final architecture-bound review, 2026-08-26)

**Independent reviewers:** Knuth **APPROVE**, Pike **APPROVE**, Fowler **APPROVE** for frozen candidate `d54e4f8a81e90d9ed9a6a5761c613ec0d6ac51f5835a7cdc7cdb6c5a95d72c33`.

## Original blocking findings (2026-08-25)

| Severity | Finding | Evidence |
| --- | --- | --- |
| Critical | `getPool()` silently defaults normal consumers to owner credentials, bypassing configured app-role RLS. | `src/lib/postgres/connection.ts:62-75,86-99` |
| High | No deterministic relational-first proposal `SemanticProjection` builder, independently recorded content hash, canonicalized sources, production writer, or source-driven test exists. | `docker/postgres-init/39-workspace-subgraph-foundation.sql:340-365`; Story AC 54-56 |
| High | Operative request-evidence behavior still emits event metadata rather than writing the durable `evidence_requests` lifecycle. | `src/lib/memory/approval-audit.ts:121-139`; migration 39:261-286 |
| High | Receipt INSERT accepts caller-supplied actor, role, proposal version, evidence, timestamp, and outbox state; no governed writer proves server-issued truth. | migration 39:288-314,391-430 |
| High | Receipt schema does not require proposal/version/evidence identity and has no proposal FK or receipt-version proof. | migration 39:288-314; Story AC 58-59 |
| High | Auto-curator deduplication reads retained memories by tenant only, allowing workspace B memory to influence workspace A. | `src/lib/curator/auto-curator.ts:354-388` |
| High | Migration 39 rewrites every existing events/proposals policy without preserving heterogeneous predicates; rollback is not reproducible. | migration 39:152-161,249-258; rollback evidence:38-40 |
| High | Migration inventory omits retained/promoted knowledge and promotion/outbox workspace treatment. | Story AC 49; migrations 38/39 |
| High | Published `ReviewItem` contract collapses evidence-request lifecycle into proposal status. | `docs/allura/DATA-DICTIONARY.md:1024-1039`; Story AC 57 |
| Medium | Watchdog conflates `memory:promote` capability with dedicated curator/reviewer authorization. | `src/app/api/curator/watchdog/route.ts:24-34,67-77` |
| Medium | Live tests default disposable app-role credentials and construct a local pool rather than exercising managed `getAppPool()`. | package script; live runner; workspace authority test |
| Medium | Commit broadens the data dictionary into later queue/map/assistant/module/demo/decision contracts. | `docs/allura/DATA-DICTIONARY.md:1020-1219` |

## 2026-08-26 remediation tick (fresh real evidence)

Strict TDD, disposable PostgreSQL (`allura-252a-disposable` @ 127.0.0.1:55432) only.

**RED → GREEN counts:**
- **RED (observed failing before fix):** live lane returned **40/43** (3 failures):
  1. `database-tenant-isolation.e2e.test.ts` ×2 — Migration 40 composite FK `allura_memories_group_workspace_fkey` rejected the pre-existing Story 24.3 test's memory inserts (no `workspaces` row seeded). Cross-story regression introduced by the remediation migration.
  2. `workspace-subgraph-authority.e2e.test.ts` ×1 — hardcoded 6-table `workspace_scope_restrictive_policy` assertion stale; live migration 39/40 creates the policy on 8 tables.
- **Fixes (test-alignment to governed schema invariants, no production code change):**
  - `database-tenant-isolation.e2e.test.ts` now seeds `workspaces` rows before `allura_memories` inserts.
  - `workspace-subgraph-authority.e2e.test.ts` restrictive-policy list extended to 8 tables.
- **GREEN (fresh `allura_tick_green` disposable DB):** live lane **43/43**; focused unit lane 30/30; `bun run typecheck` exit 0; `git diff --check` clean.

## Independent re-review verdicts (2026-08-26)

- **Pike — APPROVE.** All 11 prior findings remediated; verified against live disposable DB, code, evidence. Focus areas hold; `/api/curator/proposals` read surface unchanged; proposal status distinct from evidence-request state. Low-severity doc note (stale frozen-diff hash) addressed 2026-08-26.
- **Fowler — APPROVE.** Migration 39/40 safety verified: RESTRICTIVE policies AND with (never replace) heterogeneous policies; no destructive legacy rewrite; no invented default-workspace backfill; legacy rows quarantined not rewritten. Rollback evidence reproducible; receipt/evidence writers governed and idempotent; migration inventory complete.
- **Knuth — REQUEST CHANGES (blocking).** HIGH: `src/lib/memory/knowledge-promotion.ts` exported write functions (`promoteToPostgreSQL (graph_memories)`, `processApprovedInsights`, `linkInsightToAgent`) write to Migration-40-owned workspace-scoped `graph_memories`/`graph_supersedes` via owner-backed `getPool()` (aliasing `getOwnerPool()`) without `workspace_id`/`workspace_scope_state`. Migration 40 makes those tables default `workspace_scope_state='workspace_scoped'` and adds `workspace_id IS NOT NULL`; Knuth verified the exact insert fails `graph_memories_workspace_scope_state_check`. Consequence: the library promotion write path is broken by this story's migration AND reaches the owner role on RLS-forced tables → latent owner-role tenant/workspace-isolation fallback via exported library surface. Not wired to any route/worker/cron today (latent) but within the promotion family Migration 40 claims to own. Minor notes: permissive `tenant_isolation_policy TO PUBLIC` on `promotion_outbox`/`promotion_idempotency` (latent grouping-only gate); Migration 39 not `BEGIN/COMMIT`-wrapped.

## Required before Done

The direct knowledge-promotion finding was remediated, but the first frozen review correctly found the same authority defect class in adjacent operative surfaces. Do NOT mark Done until the remediated candidate receives fresh Knuth/Pike/Fowler approval.

## First frozen review and remediation (2026-08-26)

- **Fowler — APPROVE** frozen candidate `eb1c31f0054913bbfd2746374f1ac1dfc61634e5744bcb4df7b61b86780f27e9`.
- **Knuth — REQUEST CHANGES:** operative `RuVectorGraphAdapter.createMemory`/`supersedesMemory` remained owner/tenant-only and omitted workspace fields.
- **Pike — REQUEST CHANGES:** proposal query/workflow interfaces remained workspace-unscoped; `linkInsightToAgent` remained owner-backed and group-only; live Notion handoff was stale.

Strict TDD remediation now requires group/workspace/principal through the adapter and promotion workflow contracts, uses `withWorkspaceTransaction` for RuVector creates/supersession and agent linking, workspace-qualifies proposal reads and graph predicates, and updates the live Notion card. Fresh evidence: focused **57/57**, full unit **1,904 passed**, disposable PostgreSQL **45/45** with zero pending, typecheck/lint/build (53 pages), Epic 25 drift 8/8/8 and 10/10 drift tests, and `git diff --check` all pass. Fresh independent re-review is pending.

## Second frozen review and remediation (2026-08-26)

- **Pike — APPROVE** frozen candidate `74ffa81dfadb606bc92e2aa3d3692999d34ae4f0ecca486f271d880f8047653b`.
- **Knuth — REQUEST CHANGES:** `graph_structural_edges` did not durably persist workspace scope and remained same-tenant cross-workspace readable.
- **Fowler — REQUEST CHANGES:** graph read interfaces advertised optional workspace/principal despite runtime rejection; writer search could not satisfy the contract; the dedicated adapter live suite was excluded and stale.

Remediation adds workspace columns, quarantine semantics, composite workspace FK, validated constraints, FORCE RLS, restrictive workspace policy, app-role grants, and symmetric rollback for `graph_structural_edges`. Graph get/search/list contracts and writer search now require explicit workspace/principal. The dedicated adapter E2E suite is part of the canonical live lane and carries real workspace scope. Strict RED was **52/59** with the expected missing edge columns and six stale adapter calls; GREEN is **59/59**, zero pending. Final focused set is **89/89**; full unit remains **1,904 passed**; typecheck/lint/build/drift/diff gates pass. Final independent review is pending.

## Architecture decision after third review (2026-08-26)

The third review remained REQUEST CHANGES because tenant-only adapter lifecycle methods and the direct writer fallback conflicted with the workspace authority model, and rollback did not refuse current graph-family rows. Per the rule-of-three architecture gate, the user selected: **retire the legacy fallback and make unsupported tenant-only lifecycle methods fail closed**.

- `MEMORY_BYPASS_KERNEL`, `MEMORY_BYPASS_CONTROL_PLANE=true`, and `memoryWithAdapter()` now refuse with a stable retirement error; the control plane is the only writer entry point.
- `checkDuplicate`, soft-delete/restore, count/canonical/version/export/deprecated lookup, and `linkMemoryContext` refuse before touching the pool; deterministic unit and live tests prove no direct query/connect occurs.
- Migration 40 recovery refuses when workspace-scoped `graph_memories`, `graph_supersedes`, `graph_structural_nodes`, or `graph_structural_edges` rows exist. A disposable edge-only recovery test proves the edge and scope columns remain intact after refusal.
- Final evidence: focused retirement **25/25**, full unit **1,905 passed**, disposable PostgreSQL **59/59** with zero pending, typecheck/lint/build (53 pages), drift 8/8/8 + 10/10, and diff check pass. Final independent review is pending.

## Final approval

Knuth, Pike, and Fowler independently reproduced the final 88-file hash and approved the user-selected fail-closed retirement architecture with no blocking findings. Brain receipts: Knuth `3085168a-8a51-4986-9c4a-7d6a90266a26`, Pike `94522b85-294b-47f7-baaa-f3269e0756f4`, Fowler `9ce29ba9-94c4-4d34-bff9-65bdeaedc9f7`.
