# Phase 0 Readiness Correction Progress

**Date:** 2026-06-12
**Status:** In progress
**Trigger:** `ALLURA-BABYSITTER-HERMES-AION-AUDIT-2026-06-12.md`

## Objective

Replace the false implementation-ready signal with an evidence-based plan that
reopens failed contracts, materializes immediate stories, and sequences the
missing governed AI office capabilities.

## Phases

- [x] Confirm canonical repository and audit evidence.
- [x] Compare Epic 11, Epic 12, individual stories, and sprint status.
- [x] Draft the sprint change proposal.
- [x] Define the corrected Epic 13-17 delivery sequence.
- [x] Materialize immediate Phase 0 stories.
- [x] Reconcile local sprint status.
- [x] Update canonical run/workspace contracts and decision record.
- [x] Validate artifacts and publish the superseding readiness verdict.

## Evidence Baseline

- TypeScript passed during the product audit.
- Process-engine tests: 41 passed, 0 failed.
- Dashboard/auth focus: 46 passed, 2 failed.
- Failing contracts:
  - dashboard route parity;
  - permission mutation returns `401` where the contract expects `403`.
- `ProcessEngine.resume()` records approval but does not execute remaining
  steps.
- Dashboard runtime was not running; current visual/product approval is absent.
- Epic 11 master plan lists six stories while nine individual story files exist.
- Epic 12 is marked done despite having no individual story files.

## Guardrails

- No product code changes in this correction pass.
- Existing user worktree changes remain untouched.
- PostgreSQL owns operational project/work/run state.
- Allura Brain remains the governed memory and evidence layer.
- Neo4j remains semantic/relationship projection, not the Kanban database.
- Allura is the visible product identity; AionUi is framework attribution only.

## Work Board

- Audit spike completed:
  `https://app.notion.com/p/37d1d9be65b381e0a7cff4d7f93f973e`
- Phase 0 epic created:
  `https://app.notion.com/p/37d1d9be65b381739711d424db2d3e20`
- Four P0 child stories created for route/auth, live operational truth, true
  checkpoint continuation, and runtime proof.

## Validation

- Sprint-status YAML parsed successfully.
- Epic 11/12 reopen assertions passed.
- Epic 13-17 registration assertions passed.
- Decision/risk identifiers contain no duplicate detailed AD headings.
- AD-41 and RK-30 are present.
- Planning artifacts are present and non-empty.
- `git diff --check` passed.

## Final Verdict

Phase 0 correction is ready to begin. Broad work-plane, workspace, and desktop
development remains blocked until the Phase 0 exit gate passes.
