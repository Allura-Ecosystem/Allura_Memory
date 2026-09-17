> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

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

## Historical Evidence — before repository consolidation
No implementation, CI, controlled-red or independent review executed.