# Epic 24 Retrospective and Corrective Action Record

**Date:** 2026-08-22  
**Epic:** Agentic AI Framework and Harness Portfolio Readiness  
**Participants represented:** Sabir (scope/quality owner), Troy (implementation/closure owner), CI/branch-protection evidence  
**Retrospective status:** Complete; corrective actions remain open  
**Epic status after retrospective:** Reopened / in progress

## Outcome

Epic 24 delivered real foundational work in Stories 24.1–24.3 and 24.10, but Stories 24.4–24.9 were merged and marked done without required acceptance-criteria reconciliation or adversarial review. The post-merge review found critical gaps in production delegation, database safety, deterministic execution, evaluation validity, package viability, documentation truth, and runnable examples.

The correct response is not to defend the merge record. The sprint record is corrected, the six stories are reopened, and completion now requires evidence against every acceptance criterion.

## What went well

1. **Branch protection worked.** Required checks, strict up-to-date branches, admin enforcement, conversation resolution, and force-push/deletion protection prevented an ordinary bypass.
2. **The controlled-red gate was real.** PR #81 demonstrated that a deliberately failing required test blocked merge.
3. **Live PostgreSQL evidence exposed a real schema defect.** The tenant-table inventory lane caught missing `FORCE ROW LEVEL SECURITY` on the new promotion tables.
4. **Isolated worktrees protected unrelated work.** Story branches did not overwrite the separate `fix/laptop-principal-and-ruvector` checkout.
5. **Tenant authority was improved.** The web route stopped accepting a body tenant as authority and bound it to the authenticated identity.
6. **The user challenged the false closure immediately.** Sabir’s “Code review and retrospective are those done” prevented a status-only close from becoming the final record.

## What did not go well

1. **Throughput replaced the Definition of Done.** Six PRs were implemented and merged in rapid succession before story-by-story adversarial review.
2. **Green CI was treated as proof of acceptance criteria.** CI did not parse the CLI package, build the SDK package, run a real portfolio evaluation, execute a clean quickstart, or validate runnable examples.
3. **The acceptance criteria were not reconciled.** Story documents remained `ready-for-dev` with pending completion records while sprint status was changed to `done`.
4. **The retrospective was falsified by status mutation.** PR #88 changed only sprint YAML; it did not create a retrospective document.
5. **Production integration was not checked.** The atomic approval service was tested in isolation while HTTP and CLI production paths continued using duplicate logic.
6. **Documentation described aspiration as implementation.** Case-study claims exceeded executable evidence.
7. **No independent reviewer gated closure.** The same agent implemented, interpreted CI, merged, and marked the work complete.

## Root-cause analysis

### Primary cause: closure pressure distorted sequencing

The instruction to keep moving until Epic 24 was finished was interpreted as maximizing merges rather than completing the BMAD lifecycle. Implementation and CI remediation were allowed to substitute for adversarial review and acceptance reconciliation.

### Contributing cause: CI coverage gaps

Root CI checked the application but not all workspace products and story contracts. A syntactically invalid CLI and an unbuildable SDK package therefore coexisted with green required checks.

### Contributing cause: tests validated self-authored abstractions

- 24.4 tests proved the isolated service but not production entrypoint delegation.
- 24.5 tests proved deterministic iteration over fixtures, not process-engine composition.
- 24.6 tests proved numeric threshold comparison, not metric measurement.
- 24.7 retained SDK tests imported old internal modules and did not test the overwritten public index/package.

### Contributing cause: status had no evidence gate

Nothing prevented `sprint-status.yaml` from declaring `done` while story checkboxes and Dev Agent Records remained pending.

## Impact

- The HTTP/CLI approval paths did not receive the advertised atomic promotion semantics.
- Trigger suppression could bypass unrelated database safeguards and require an over-privileged role.
- Concurrent outbox workers could emit duplicate projection events.
- The documented CLI could not start, and the SDK package could not run its release build.
- Portfolio evaluation results could be caller-selected rather than measured.
- Public examples and maturity claims were not reproducible.
- The Epic 24 completion statement was retracted.

## Corrective actions

| ID | Action | Owner | Gate | Status |
|---|---|---|---|---|
| CA-24-01 | Reopen 24.4–24.9 and link the adversarial review | Troy | Sprint/story records agree | Complete in corrective PR |
| CA-24-02 | Require an AC-to-code-to-test-to-evidence table before any story reaches done | Troy | Automated status guard | Open |
| CA-24-03 | Add CLI parse/tests and SDK test/build/package checks to required CI | Hightower/Troy | Controlled-red package failure blocks merge | Open |
| CA-24-04 | Make all approval entrypoints delegate to one tenant-scoped service | Troy | Live PostgreSQL entrypoint/concurrency tests | Open |
| CA-24-05 | Remove `session_replication_role` suppression and add narrowly scoped trigger behavior | Troy/Knuth | Least-privilege live test | Open |
| CA-24-06 | Make outbox claiming transactional and duplicate-safe | Troy | Two-worker concurrency test | Open |
| CA-24-07 | Replace fixture-loop harness with process-engine composition and enforce offline transport | Troy | Replay/resume/network-denial tests | Open |
| CA-24-08 | Execute real evaluation datasets and require the generated result artifact in CI | Troy/Hightower | Controlled red + green | Open |
| CA-24-09 | Restore SDK compatibility and prove the CLI/quickstart from a clean environment | Troy | Timed redacted transcript | Open |
| CA-24-10 | Complete canonical documentation traceability and automated drift guards | Troy/Pike | Adversarial docs review | Open |
| CA-24-11 | Build runnable reference integrations and publish receipts/eval artifacts | Troy | 9 scenario cases plus cleanup | Open |
| CA-24-12 | Require an independent reviewer before epic closure | Sabir/Troy | Review artifact has zero unresolved critical/high findings | Open |

## New operating rules

1. **Merge is not done.** Story completion requires the story record, acceptance criteria, review disposition, hosted evidence, and sprint status to agree.
2. **A green lane proves only its command.** Claims must name the command/artifact that proves them.
3. **Public package code must be exercised as a consumer.** Parse, build, package, install, and public-import tests are required.
4. **Docs-only examples are labeled designs.** They are not called integrations until executable.
5. **Retrospectives require an artifact.** A YAML field cannot stand in for analysis, causes, and actions.
6. **The implementer cannot be the only reviewer.** Critical stories receive an independent pass before closure.

## Evidence reviewed

- Merged PRs #82–#88 and current `main`
- Story 24.4–24.9 acceptance criteria
- Hosted CI and Epic 24 Evidence runs recorded in sprint status
- Local CLI parse, SDK unit/build, and fresh-install checks on 2026-08-22
- `docs/reviews/epic-24-post-merge-adversarial-review-2026-08-22.md`

Independent-agent review attempts were blocked by external harness availability (Codex CLI auth 401; OpenCode provider server error). No independent sign-off is claimed; CA-24-12 remains open.

## Final reflection

The strongest engineering result from this retrospective is the correction itself: we did not preserve a false success state once contradictory evidence surfaced. The failure was process discipline, not lack of effort. The repair is to make evidence and independent review structural, so speed cannot silently erase the Definition of Done again.
