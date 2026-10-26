# Epic 24 — Agentic AI Framework and Harness Portfolio Readiness

> [!NOTE]
> **Historical contract plus active forward plan.** Original 24.1–24.10, 24.11a, and 24.12 and their dated evidence are retained. Stories 24.13–24.15 are new **PLANNED requirements** authorized for this reconstruction; they are not historical work, implementation approval, live status, or acceptance.

## Outcome

Provide a reproducible, governed memory and deterministic execution harness whose claims can be verified from exact-revision evidence. Preserve historical acceptance/open items while assigning current technical preparation to one original-numbered owner per DEV draft.

## Historical story register

| Story | Original contract | Historical evidence / current limit |
|---|---|---|
| 24.1 | CI and Evidence Baseline | Source-local historical implementation record; current CI/release acceptance unverified. |
| 24.2 | Authenticated Principal Context | Dated evidence only; current identity/runtime proof required. |
| 24.3 | Database-Enforced Tenant Isolation and Immutable Ledger | Dated restricted-role/RLS intent; no current live-DB acceptance from this rewrite. |
| 24.4 | Atomic Human-Governed Promotion | 2026-08 review/retro evidence with overclaim concerns; current exact-version behavior remains open. |
| 24.5 | Deterministic Scenario Harness | Dated acceptance with explicit `assertions`, `initial_state`, and cleanup evidence conflict. |
| 24.6 | Evaluation and Regression Gates | Dated acceptance; current human-reviewed datasets, thresholds, isolation, timeout, and CI evidence unverified. |
| 24.7 | SDK, CLI, and Ten-Minute Developer Path | `accepted-with-open-items`; clean-machine/cold-cache claim unverified. |
| 24.8 | Enterprise Documentation Truth Pack | Dated acceptance; current canonical consistency must be rechecked. |
| 24.9 | Reference Integrations and Portfolio Demonstration | Dated acceptance with initial-state/cleanup open items; no current clean-checkout demo. |
| 24.10 | CI Gate Integrity and Branch Protection | **Conflicted:** top-level `done`, unchecked ACs, later `pending`; current GitHub evidence required. |
| 24.11a | Fail-Closed Web Authority and Manifest as Single Source | Dated story-level evidence; current route inventory/enforcement unverified. |
| 24.12 | Effective-Tenant Authority Seam | Additive seam historically recorded; story migrated no application route, so caller adoption remains open. |

The 2026-08-29 retrospective recorded `accepted-with-open-items`, historical test/scenario/build counts, and a human decision that twelve stories were done. It also retained contradictory/reopened language and open obligations. Both facts remain evidence; neither is present operational truth.

## New planned stories

| Story | Planned outcome | Primary supporting DEV acceptance draft | Decision/authority boundary |
|---|---|---|---|
| 24.13 | **Retry-safe capture:** one server-bound operation identity/digest yields one durable event/receipt/index intent; same replay returns the original outcome, changed payload conflicts, ambiguous commit stays unknown pending reconciliation. | [DEV-03](../../../_bmad-output/implementation-artifacts/stories/DEV-03.md) | **PLANNED;** blocked on AD-65 and normal API/schema approval. |
| 24.14 | **Immutable corrections:** authorized correction creates one immutable successor/current semantic head while preserving prior content, edges, and same-scope lineage. | [DEV-05A](../../../_bmad-output/implementation-artifacts/stories/DEV-05A.md) | **PLANNED;** blocked on AD-67; DOC-03 restore and DOC-05 duplicate handling remain outside this story. |
| 24.15 | **Optional remote projection:** independently authorized projection reports delivery separately; `synced` requires destination read-back and immutable decision receipts never mutate. | [DEV-06](../../../_bmad-output/implementation-artifacts/stories/DEV-06.md) | **PLANNED and optional;** only if no source/ownership collision exists; DOC-07 specification is approved, but AD-68 delivery details, transfer authority, destination, and runtime evidence remain open. |

## Primary DEV ownership crosswalk

| Numbered owner | Supporting draft | Use |
|---|---|---|
| 24.10 | [DEV-02 — Reproducible authoritative CI](../../../_bmad-output/implementation-artifacts/stories/DEV-02.md) | Current acceptance detail for pinned runtime/install, real lint, separate typecheck, nonzero discovery, exact-head CI. |
| 24.13 | [DEV-03](../../../_bmad-output/implementation-artifacts/stories/DEV-03.md) | Retry-safe capture. |
| 24.3 | [DEV-04 — Workspace-authorized vector seam](../../../_bmad-output/implementation-artifacts/stories/DEV-04.md) | Extend original isolation contract through vector/lexical/current/history paths; AD-66 and deployed role/RLS evidence gated. |
| 24.14 | [DEV-05A](../../../_bmad-output/implementation-artifacts/stories/DEV-05A.md) | Immutable correction/current head. |
| 24.4 | [DEV-05B — Bind approval to reviewed proposal version](../../../_bmad-output/implementation-artifacts/stories/DEV-05B.md) | DOC-06 is approved specification; PR 181 is open, so implementation/merge/runtime acceptance is not claimed. |
| 24.15 | [DEV-06](../../../_bmad-output/implementation-artifacts/stories/DEV-06.md) | Optional projection. |
| 24.6 | [DEV-08 — Labeled retrieval baseline](../../../_bmad-output/implementation-artifacts/stories/DEV-08.md) | Human-reviewed fixtures, mode-separated metrics, isolation/timeout/fallback; labels/baseline/budgets remain gated. |
| 24.7 | [DEV-09 — Consumer compatibility and capability claims](../../../_bmad-output/implementation-artifacts/stories/DEV-09.md) | Packed consumers and truthful capability table. **Repository-retirement gates are separate** and require exact target authorization/recovery/integration; this story does not authorize cleanup. |

DEV-00/01/07/10 have primary ownership in 13.5/13.1/13.2/16.3 respectively. Linking these drafts avoids duplicating their detailed acceptance text.

## Current remaining work and next actions

1. **Truth/preservation first:** complete 13.5 and 13.1 inventory so useful source-local work is reconciled before any cleanup or compatibility decision.
2. **CI:** resolve 24.10 conflict with live required-context inventory and exact-head evidence; run pinned install, real lint, separate typecheck, and nonzero required tests.
3. **Scope:** accept AD-66 and prove 24.3 with restricted-role/RLS, pooled isolation, vector/lexical denial, current/history filtering, and zero foreign-scope results.
4. **Reviewed version:** carry DOC-06 through 24.4 implementation, final-diff review, merge, stale-review no-write, committed replay receipt, and live acceptance. PR 181 being open is evidence, not closure.
5. **Capture/correction:** decide AD-65/67; implement 24.13/24.14 only afterward; prove atomic rollback, concurrency, one current head, preserved history, and ambiguity handling.
6. **Evaluation/consumers:** establish human label/budget authority for 24.6; prove packed ESM/CJS/types/CLI compatibility and evidence-class capability claims for 24.7.
7. **Projection only if selected:** collision-check source ownership, name destination/transfer authority, then implement 24.15 with destination read-back and separate projection status. Core governed memory correctness does not silently depend on enabling projection.
8. **Independent acceptance:** bind test counts, outputs, review, and deployed evidence to final bytes/revision; planning approval or historical counts are insufficient.

## Exit gates

- Missing/forged/revoked authority fails closed; database and retrieval paths preserve tenant/workspace isolation.
- Capture replay/conflict/unknown semantics and exact-version independent-human review are executable and atomic.
- Corrections preserve immutable lineage and one current same-scope head.
- CI and evaluation evidence are reproducible and nonzero; SDK/CLI consumers remain compatible.
- If projection is enabled, destination read-back proves delivery without rewriting decision receipts.
- Retirement/cleanup, production rollout, and release remain separately authorized gates.

## Evidence sources

- `.opencode/work-items/implementation-artifacts/24-*.md`
- `.opencode/work-items/implementation-artifacts/epic-24-retro-2026-08-29.md`
- `docs/retrospectives/epic-24-retrospective-2026-08-22.md`
- Supporting DEV drafts linked above

No application, schema, migration, configuration, status, Brain, Notion, commit, push, deployment, cleanup, or release is authorized by this plan.