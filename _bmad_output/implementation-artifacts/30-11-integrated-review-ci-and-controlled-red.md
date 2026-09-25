> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.11 — Integrated Review, CI, and Controlled Red

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Pike / Fowler / Knuth / Hightower  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R11  
**Dependencies:** 30.4 through 30.10

## User Story
As a release owner, I want independent integrated proof so that a privacy regression cannot silently reach a protected branch.

## Acceptance Criteria
- Freeze the candidate SHA; independent security, maintainability, accessibility, migration and deployment reviews have no unresolved BLOCK/HIGH.
- Cover every controlled-red family in the epic, including unknown surfaces, bypass, leakage, prompt injection, revocation and audit failure.
- In an isolated candidate, deliberately introduce a privacy regression and prove required CI fails and merge is blocked; remove it and verify exact-SHA green checks.
- No production data, protected-branch bypass or unapproved publication. At most two remediation cycles per finding, then halt.

## Required Evidence / Definition of Done
Real check/run IDs, frozen SHAs, review verdicts, clean regression removal, local DB/browser/accessibility results and read-back receipts. A screenshot or fabricated CI output is not evidence; epic publication gates apply.

## Current Preparation State

2026-09-25 final local candidate: exact committed HEAD `398e419f7e3bdc652164f6bb4bb0c1ac535757c7` passes typecheck, the 38-file no-cache hermetic lane with 375 tests and 3 intentional skips, and the full 198-file unit lane with 2,937 tests and 165 skips. The controlled-red runner detected disclosure `acf0f3fa6fd712344f684a160972c72ac0a4d8bec4fd304637613ed4de057d7c`, receipt `ee91126c2c648b404a3b0dc71136e05577e57b3ff936b323cbae88551a40f537`, revocation `91c4c7a2acbb0910fc442ed9998dc2f066033de860cfb416082f3305a950270c`, unknown-surface `63a603a1decac5f455232f38a4369b6d81331d9e7d2f1bf050d6cf2ca619e2c9`, and prompt-injection `e943a7ee022d99e188371217559ed2efa39b8beabd88fbf6427a98d33203d485` mutations, then verified cleanup and canonical state. A fresh authenticated read-only GitHub query at 2026-09-25T16:03:34Z confirms remote `main` remains `1934d211c239310d498794ec0c5dbaa532faeeb8`, local divergence is 98 ahead/1 behind, the dedicated Epic 30 workflow is absent from the remote default branch, and required contexts remain `typecheck`, `test-unit`, `test-e2e`, `MCP Runtime Health Tests`, and `Epic 24 Evidence / Aggregate`. Hosted exact-SHA CI, Epic 30 merge blocking and independent human reviews therefore remain open.

2026-09-25 exact-HEAD rerun: commit `f8934c9de2a171649b4f4eff529a65a95c7035ee` passed the 37-file hermetic lane with typecheck, 355 tests and 3 intentional skips, and the full unit lane with 2,917 tests and 165 skips across 197 files. The controlled-red runner detected all five mutations and restored canonical state: disclosure `acf0f3fa6fd712344f684a160972c72ac0a4d8bec4fd304637613ed4de057d7c`, receipt `e060da9b022809a268c225d04c6477938e9806171d95b8dce7f09c5f6583ae8d`, revocation `91c4c7a2acbb0910fc442ed9998dc2f066033de860cfb416082f3305a950270c`, unknown surface `63a603a1decac5f455232f38a4369b6d81331d9e7d2f1bf050d6cf2ca619e2c9`, and prompt injection `e943a7ee022d99e188371217559ed2efa39b8beabd88fbf6427a98d33203d485`. Independent review of migrations 073/074 and their adapters found no remaining BLOCK/HIGH/MEDIUM issue after exact-workspace RLS, provenance and helper-ownership repairs. Hosted exact-SHA CI, required branch checks, live PostgreSQL and human review remain open.

2026-09-25 hosted-state read-back: authenticated GitHub inspection found local `main` at `390d14e4039279322f58630719997cec4dbe064d`, 82 commits ahead and one aggregate commit behind `origin/main`. The Epic 30 workflow is not present on the remote default branch, has no verified hosted run, and is not a required branch-protection context. Current required contexts are `typecheck`, `test-unit`, `test-e2e`, `MCP Runtime Health Tests`, and `Epic 24 Evidence / Aggregate`. The remote-only 266-file aggregate commit overlaps 14 locally changed paths and reintroduces the legacy `_bmad/bmm` planning/story tree, so it was not merged into the normalized Epic 30 candidate. Exact machine-readable evidence is in [the hosted-state receipt](./evidence/epic30-hosted-state-2026-09-25.json). This confirms that hosted exact-SHA CI and merge-blocking gates remain open; it does not satisfy them.

2026-09-25: the controlled-red runner archives exact committed HEAD into a path-bounded disposable `/tmp` copy and proves the typecheck/hermetic baseline. Exact-HEAD `f244031f` detected five independent mutations with exact witnesses: row-disclosure bypass (`4c8ccd3912c49167cb161b3e1efe6a12e14545437617c0b68df6e4e032da9250`), receipt-acknowledgement bypass (`e060da9b022809a268c225d04c6477938e9806171d95b8dce7f09c5f6583ae8d`), final-authority-reread bypass (`f49cfa310b6a416358d80d6e014fda78c6bf7791ade951cbbceb33cd50c63495`), permitting the unsupported bot surface (`63a603a1decac5f455232f38a4369b6d81331d9e7d2f1bf050d6cf2ca619e2c9`), and expanding Ask context from prompt-like links (`e943a7ee022d99e188371217559ed2efa39b8beabd88fbf6427a98d33203d485`). Cleanup succeeded and canonical HEAD/status were unchanged. The exact Epic 30 gate passes typecheck with 311 tests and 3 intentional skips across 33 files. This satisfies the identified local controlled-red families only; hosted exact-SHA CI, required branch checks, merge blocking, live database evidence, independent human reviews and Story 30.11 acceptance remain open.

2026-09-22: the Epic 30 workflow now runs on every pull request and has a separate exact-inventory hermetic authorization/UI job (typecheck plus 108 tests across 10 files) alongside the confined PostgreSQL/HTTP job. A contract test checks the trigger, both jobs, scripts and fail-on-empty inventory. The local hermetic command passed. No hosted run, protected-branch required-check setting, frozen-SHA evidence, controlled-red test, or independent review has been verified; this story remains backlog.

A disposable live test now deliberately revokes the per-run receipt writer's INSERT privilege, checks that `/dashboard` returns only the generic unavailable state with no fixture IDs, titles or bodies and no new receipt, and restores the privilege in `finally`. This test is authored and typechecked, not executed locally; hosted CI and controlled-red/branch-protection evidence are still absent.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No implementation, CI, controlled-red or independent review executed.
