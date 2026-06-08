# Story 3.4: Validate Provenance Drift Against Schema Baseline

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As Knuth,
I want provenance fields checked against the Data Dictionary and runtime schemas,
So that UI provenance does not drift from stored evidence semantics.

## Traceability

Epic 3 -> FR3, FR25 -> provenance drift report -> `bun test src/lib/memory/provenance-drift.test.ts src/lib/memory/api-schemas.test.ts src/__tests__/dashboard-schemas.test.ts`

## Acceptance Criteria

- [x] Given provenance fields are displayed or exported, when the drift check runs, then displayed field names map to DATA-DICTIONARY entries or explicitly documented derived labels.
- [x] Any missing required provenance field is logged as `critical` or `major` drift.
- [x] Allura Brain memory is used to catch prior decisions about provenance/copy/export behavior.
- [x] The drift check remains read-only and does not approve, reject, promote, deprecate, export-mutate, or write to PostgreSQL/Neo4j.
- [x] Targeted schema/dashboard validation passes with exact evidence recorded.

## Allura Drift Gate

- Story: `3-4-validate-provenance-drift-against-schema-baseline — Validate Provenance Drift Against Schema Baseline`
- Brain query: `Story 3.4 validate provenance drift against schema baseline blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-3401d9be65b381ae`: every DB read/write must include `group_id`; non-`allura-*` scope is deprecated/blocked.
  - `mem-33e1d9be65b38174`: Notion remains the planning/source-of-truth surface; local story files are reconciliation artifacts.
  - Prior local story outcome `4487d5e2-7397-468a-9f00-9a12ec367400`: Story 3.3 preserved provenance on copy/export and kept the surface read-only.
- Compared against:
  - `_bmad/bmm/planning/epics.md` Story 3.4 and Epic 3 done condition.
  - `docs/allura/DATA-DICTIONARY.md` Data Dictionary field definitions for `events`, `canonical_proposals`, Neo4j `Memory`, `AuditEvent`, and Retrieval Gateway `MemoryResult`.
  - `src/lib/memory/provenance-export.ts` exported provenance labels.
  - `src/lib/memory/api-schemas.ts` runtime memory schemas.
  - `src/__tests__/dashboard-schemas.test.ts` dashboard schema baseline.
- Drift classification: `minor` — the Story 3.3 provenance export labels existed, but there was no executable baseline proving each operator-facing label maps to Data Dictionary fields or an explicitly documented derived label.
- Disposition: fixed in this story with a read-only provenance drift baseline and tests.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for provenance export labels against the Data Dictionary baseline.
  - [x] Prove every displayed/exported label must map to a Data Dictionary field or derived-label explanation.
  - [x] Prove missing tenant scope is `critical` drift.
  - [x] Prove required baseline labels remain explicit for review evidence.
- [x] Implement a small read-only provenance drift baseline helper in `src/lib/memory/`.
- [x] Export the canonical provenance export label list from the read-only export formatter.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence.
- [x] Resolve Ralph iteration 3 schema-review blocker requiring `group_id` and `user_id` provenance on memory detail/list/export output items.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 3.4.
- Previous story learning: Story 3.3 added provenance-preserving copy/export and removed mutation affordances from the read-side memory detail surface. Keep this story read-only.
- Citable baseline: `docs/allura/DATA-DICTIONARY.md` defines `events.group_id`, `events.agent_id`, `events.created_at`, `canonical_proposals.status`, `canonical_proposals.decided_by`, `canonical_proposals.witness_hash`, Neo4j `Memory` fields, `AuditEvent` fields, and Retrieval Gateway `MemoryResult` fields.
- Missing `Tenant scope` is `critical` drift because tenant isolation is a P0 boundary.
- Missing other required provenance proof fields such as memory ID, content, source, timestamp, status, and evidence is `major` drift.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED missing drift baseline module, GREEN minimal read-only label mapping helper, REFACTOR only while tests remain green.

### Debug Log

- 2026-05-24: Story file was missing while sprint status listed Story 3.4 as backlog; story was created from Epic 3.4 after Story 3.1-3.3 local Done evidence was verified.
- 2026-05-24: Drift gate searched Brain with `group_id=allura-system`; no blocker found, but source-of-truth and group-scope reminders were applied.
- 2026-05-24: RED test failed on missing `@/lib/memory/provenance-drift` module before implementation.
- 2026-05-24: Knuth subagent returned empty output in this runtime; Brooks performed gate-equivalent data/schema review from source, Data Dictionary mappings, and validation evidence.
- 2026-05-24: Ralph iteration 3 Pike re-review found a major blocker: `MemoryItemSchema` allowed missing `group_id` and `user_id` despite `docs/allura/DATA-DICTIONARY.md` Retrieval Gateway `MemoryResult` requiring both fields. Fixed by requiring tenant/user provenance on shared memory output items and adding list/detail/export regression tests.

### Completion Notes

- Added `PROVENANCE_EXPORT_LABELS` as the canonical read-only list of labels emitted by provenance exports.
- Added `validateProvenanceDriftAgainstBaseline` with Data Dictionary references and derived-label explanations for each provenance export label.
- Missing required labels are reported as `major` drift, except missing tenant scope, which is `critical` drift.
- No approval, promotion, deletion, restore, edit, direct PostgreSQL mutation, or Neo4j mutation behavior was added.
- Validation evidence:
  - RED: `bun test src/lib/memory/provenance-drift.test.ts` failed with `Cannot find module '@/lib/memory/provenance-drift'` before implementation.
  - GREEN targeted: `bun test src/lib/memory/provenance-drift.test.ts` passed with `3 pass`, `0 fail`, `7 expect() calls`.
  - Combined targeted: `bun test src/lib/memory/provenance-drift.test.ts src/lib/memory/api-schemas.test.ts src/__tests__/dashboard-schemas.test.ts` passed with `97 pass`, `0 fail`, `120 expect() calls`.
  - `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
  - YAML parse passed.
  - Targeted `git diff --check` produced no output.
- Ralph iteration 3 blocker-fix validation evidence:
  - After requiring `group_id` and `user_id`, existing `validateOutputArray` valid-item coverage failed with `Expected: 0 Received: 2`, proving the schema gate caught missing tenant/user provenance.
  - Final targeted validation: `bun test src/lib/memory/api-schemas.test.ts src/lib/memory/provenance-drift.test.ts src/__tests__/dashboard-schemas.test.ts && bun run typecheck` passed with `100 pass`, `0 fail`, `123 expect() calls`; typecheck ran `$ tsc --noEmit` with no TypeScript output.
- Review evidence: Pike initially reported no blocking findings for the original baseline, then Ralph iteration 3 Pike re-review blocked on optional tenant/user provenance. Fowler reported no blocking findings. Final Pike re-review reported no blocking findings after the schema fix. Knuth subagent returned empty output; Brooks completed a gate-equivalent data/schema review against the Data Dictionary and targeted tests.
- Brain outcome memory: `c18fe757-d683-4fa0-91a6-e6570acfc627`.
- Ralph iteration 3 closure memory: `a5c5fbef-cbe2-4286-9d43-fd83ff4bc571`.
- Notion Work Board update: pending; no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/3-4-validate-provenance-drift-against-schema-baseline.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/memory/provenance-export.ts`
- `src/lib/memory/provenance-drift.ts`
- `src/lib/memory/provenance-drift.test.ts`
- `src/lib/memory/api-schemas.ts`
- `src/lib/memory/api-schemas.test.ts`

## Change Log

- 2026-05-24: Created and completed Story 3.4 with a read-only provenance drift baseline, targeted tests, validation, and review evidence.
- 2026-05-24: Ralph iteration 3 resolved memory output schema drift by requiring `group_id` and `user_id` and adding regression coverage for missing tenant/user provenance.
- Brain outcome memory: `c18fe757-d683-4fa0-91a6-e6570acfc627`.
- Ralph iteration 3 closure memory: `a5c5fbef-cbe2-4286-9d43-fd83ff4bc571`.
