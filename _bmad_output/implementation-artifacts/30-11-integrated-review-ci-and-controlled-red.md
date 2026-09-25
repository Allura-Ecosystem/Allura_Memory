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

2026-09-25: commit `d8bef374` adds a local controlled-red runner that archives the exact committed HEAD into a path-bounded disposable `/tmp` copy, proves the typecheck/hermetic baseline, deliberately bypasses both row-disclosure filters only in that copy, and requires the exact authorization assertion `denies a removed tenant member even with active department authority` to fail. The observed run passed its baseline, detected mutation hash `4c8ccd3912c49167cb161b3e1efe6a12e14545437617c0b68df6e4e032da9250`, observed the expected red witness, cleaned up, and verified canonical HEAD/status unchanged. A unified sentinel test also covers forged Brain/memory selectors, sanitized failures, authorized success, and raw exception exclusion from protected-route console/telemetry boundaries. The exact Epic 30 gate passes typecheck with 293 tests and 3 intentional skips across 31 files; the full unit lane passes 2,855 tests with 165 skips across 191 files. Independent AI review found no remaining local BLOCK/HIGH/MEDIUM/LOW issue after the runner was tightened to require the exact failing assertion. This is local single-mutation evidence only: the other controlled-red families, hosted exact-SHA CI, required branch checks, merge blocking, live database evidence, independent human reviews and Story 30.11 acceptance remain open.

2026-09-22: the Epic 30 workflow now runs on every pull request and has a separate exact-inventory hermetic authorization/UI job (typecheck plus 108 tests across 10 files) alongside the confined PostgreSQL/HTTP job. A contract test checks the trigger, both jobs, scripts and fail-on-empty inventory. The local hermetic command passed. No hosted run, protected-branch required-check setting, frozen-SHA evidence, controlled-red test, or independent review has been verified; this story remains backlog.

A disposable live test now deliberately revokes the per-run receipt writer's INSERT privilege, checks that `/dashboard` returns only the generic unavailable state with no fixture IDs, titles or bodies and no new receipt, and restores the privilege in `finally`. This test is authored and typechecked, not executed locally; hosted CI and controlled-red/branch-protection evidence are still absent.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No implementation, CI, controlled-red or independent review executed.
