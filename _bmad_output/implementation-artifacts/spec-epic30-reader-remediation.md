---
title: Epic 30 synthetic reader remediation
type: bugfix
created: 2026-09-17
status: completed-local
baseline_commit: f6c94f6aa450de8883a2558a40186b5473467fdb
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="user-authorized autonomous development of the reviewed local slice">

## Intent

**Problem:** The existing synthetic reader candidate has ten independently identified correctness and verification issues. The fixture works on desktop, but comparison breaks narrow layout and keyboard continuity; lifecycle interruption can leak owned resources; a nullable constraint accepts malformed department data; ordinary dashboard routing regressed; routine CI cannot exercise the confined suite.

**Approach:** Repair the current reader's delivery path and regression checks without adding deferred Epic 30 features. Restore the pre-candidate governed overview outside explicit local mode. Preserve server-derived scope, loopback confinement and the retained demo. The user requested autonomous development after receiving the review; routine implementation choices and checkpoint progression are authorized, not human acceptance or publication.

## Boundaries & Constraints

**Always:** One writer. Preserve dirty documentation, sprint tracking, next-env.d.ts, stashes and frozen review. Use project-local BMAD, Bun, existing dependencies and tests. Keep all resource cleanup restricted to resources owned by the invocation. Keep private ownership and department membership checks unchanged except strengthening malformed-data rejection. Record tests actually executed and distinguish local tests from hosted CI. User-approved autonomous development permits routine spec/code/review progression.

**Ask First:** Production or credential/provider/runtime configuration changes, actual publication, design acceptance, human-study completion, canonical promotion. If existing approved test credentials are unavailable, record the live-execution limit; do not discover credentials or use a privileged fallback.

**Never:** Restart/reseed/stop the retained demo, touch frozen review code, weaken local endpoint constraints, silently skip registered security tests, change Epic/story acceptance status, commit/push/merge, or add tabs/search/Ask/messaging as part of these defect repairs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Narrow comparison | 320/640px, pane open | One-column reflow without overflow | Preserve readable content |
| Keyboard close | Close control focused | Focus returns to comparison opener | Safe fallback if opener vanished |
| Tree navigation | Noninitial document selected | Main title/content changes, private selection can restore | No scope widening |
| Invalid department | Department visibility with null/blank ID | Database rejects row | Restricted reads still deny malformed data |
| Startup interrupted | Signal during provisioning/start/readiness | Cancel safely and clean partial owned resources | No unrelated process/database cleanup |
| Cleanup failure | Server stop rejects | Still close pools and attempt owned DB cleanup | Preserve/report failures without secrets |
| Stop receipt race | Poll during final receipt update | Reader sees complete old/new receipt | Atomic replacement and safe permissions |
| Ordinary dashboard | Production/local mode disabled | Existing governed overview | Do not invoke synthetic reader |
| Explicit local failure | Local mode enabled, read fails | Non-disclosing unavailable state | No fallback to production data |
| Routine CI | Generic live DB at 5432, Epic30 at 5444 | Each suite has explicit maintained compatible lane; HTTP proof runs | Missing prerequisites fail visibly |

</frozen-after-approval>

## Code Map

- `src/components/dashboard/my-work-workspace.tsx` / `.module.css`: active selection, comparison opener/close, narrow grid span; direct tests in adjacent `__tests__`.
- `src/app/dashboard/page.tsx`: explicit local branch; baseline `1934d211c239310d498794ec0c5dbaa532faeeb8` contains original DashboardShell/getOverview integration. Existing guard/read-service are reuse points.
- `docker/postgres-init/71-digital-brain-read-foundation.sql`: CHECK at lines35–39; current unpublished synthetic candidate. `src/__tests__/digital-brain-read-isolation.e2e.test.ts` and migration-contract tests verify scope.
- `scripts/epic30/demo.ts`, `owned-process.ts`, `synthetic-database.ts`: process ownership, cancellation windows, pools, receipt lifecycle. `tests/scripts/epic30-*` and live suite provide existing harnesses.
- `.github/workflows/epic-30-evidence.yml`, `scripts/ci/run-epic30-live-tests.sh`, `vitest.config.epic30-live.ts`, `package.json`: dedicated confined 5444 lane/command without weakening the generic 5432 inventory or exporting test payloads.
- Read-only findings/evidence: `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/`.

## Tasks & Acceptance

**Execution:**
- [x] Workspace component/style/tests: fix narrow reflow, focus return and navigation regression coverage.
- [x] Dashboard page/tests: preserve previous ordinary route and keep explicit local failure closed.
- [x] Migration and relevant tests: reject null department IDs without altering existing running DB.
- [x] Demo lifecycle/helpers/tests: cancellation from acquisition, independent cleanup, atomic receipts and concrete regression coverage.
- [x] Test configs/CI/README/package scripts: maintained dedicated 5444+HTTP proof path; preserve generic 5432 lane.
- [x] Validate focused tests, typecheck and non-database browser behavior; record live/hosted verification limitations.

**Acceptance Criteria:**
- Given the reviewed candidate, when the matrix scenarios run, then repaired behavior is observable at actual consumers and tests fail under corresponding regressions.
- Given explicit local mode, when authority/read verification fails, then no static or ordinary production data is substituted.
- Given the retained demo, when repairs and tests execute, then its owned process/database are not stopped or reseeded.
- Given a candidate awaiting independent review, when tests pass, then neither Epic30 nor its stories are labeled accepted or Done.

## Spec Change Log

- 2026-09-17: Initial repair scope follows explicit user instruction for autonomous development; normal BMAD confirmation checkpoints proceed under that authority. Human gates remain explicit.

## Verification

- Focused Epic 30 command: 78 tests across 9 files, no failures.
- `bun run typecheck`: PASS.
- Maintained live/HTTP command: missing prerequisites fail visibly with exit 64; actual live execution remains pending approved injected credentials.
- Headless Chromium ordinary-route check: HTTP 200, synthetic workspace absent, truthful degraded state and zero page errors. Live synthetic 320/640/1440 proof remains pending with the database lane.
- `git diff --check`, 13-story backlog check and 77 relative document links: PASS. The repository-wide story guard still reports older Epic 18–28 evidence debt unrelated to this repair.
