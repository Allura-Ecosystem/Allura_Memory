# Finish All Epics: Scout-First Kanban Workflow

This is the canonical Team RAM + BMAD workflow for finishing all remaining
Allura Memory epics.

## Summary

Finish existing work in progress first, then move through the backlog by
priority. Do not open a new epic until the current review and in-progress lanes
are clean unless Brooks explicitly approves an exception.

Execution order:

1. Finish current review debt.
2. Finish Epic 2 Frontend Tightening.
3. Finish E1 Host Stability.
4. Finish E2 Dashboard Quality.
5. Finish E3/E4 Hardening Deploy.
6. Finish E4 Kernel Completion.
7. Finish E5 Infrastructure Polish.

## Operating Rules

- Scout is the first real background/recon agent for every epic or story batch.
- If a real Scout agent is not spawned, say `Scout-style hydration only`.
- Notion Kanban is the source of truth for status.
- Allura Brain is memory and audit, not proof of Done.
- Allura is the navigator: Notion Kanban is the map, Allura Brain is the ship
  log, RuVix is governance, Team RAM is the crew, skills are playbooks, and
  evidence proves Done.
- BMAD drives story lifecycle: `bmad-sprint-status`, `bmad-dev-story`,
  `bmad-code-review`, and `bmad-retrospective`.
- No epic is complete until every story is `Done` and the epic retrospective is
  complete.
- The navigator workflow lives in `_bmad/ALLURA-NAVIGATOR-WORKFLOW.md`.

## Team RAM Gates

1. Scout produces a read-only report covering board, repo, memory, evidence,
   blockers, validation commands, and risk.
2. Jobs confirms objective, scope, acceptance criteria, owner, reviewers,
   validation command, and evidence expectation.
3. Brooks approves architecture, contracts, dependencies, and route.
4. Move the selected card to `Ready`, then `In Progress`.
5. Woz implements one selected card with `bmad-dev-story`.
6. Run targeted tests before `Review`.
7. Pike and Fowler review with `bmad-code-review`. When Fowler is `failed`,
   substitute static maintainability analysis (line counts, token use,
   cascade-failure audit, component boundaries) and document gate-equivalence
   in the evidence artifact. Brooks must confirm the substitute before
   proceeding to step 8.
8. `Ralph Loop` (`open-ralph-wiggum` skill) executes only after implementation
   and review evidence exists. `Ralph Loop` is a bounded execution mode, not a
   reviewer. The removed ralph agent persona does not participate in this step.
9. Move the card to `Done` only when tests, acceptance criteria, review, and
   evidence pass.
10. Brooks and Scout log important outcomes to Allura Brain with
    `group_id: allura-system`.

## Daily Navigator Startup

Every project session starts with:

1. Board state from the Notion Work Board.
2. Allura Brain search with `group_id: allura-system`.
3. Repo/worktree status and current runtime state.
4. Current blocker and active review/development lane.
5. Brooks route: next card, required skills, validation path, and evidence
   expectation.

## Epic Lanes

### Current Review Debt

Close the Mission Control MVP review lane before opening new backlog epics.

Use `bmad-code-review`, `frontend-design`, `allura-design`, Browser/Hyper
Browser, Notion, and Allura Brain.

Done when every Mission Control story is `Done`, source-of-truth policy is
verified, the Work Board preserves Notion as source of truth, telemetry and
provenance panels do not fabricate data, evidence exists, and the retrospective
is logged.

### Epic 2: Frontend Tightening

Finish Story 2.4 first, including `CARD-2.4-E`, then reconcile stories 2.1-2.8
against Notion before continuing.

Use `bmad-sprint-status`, `bmad-dev-story`, `bmad-code-review`,
`frontend-craft`, `frontend-design`, `allura-design`, Browser/Hyper Browser,
and Context7 when current React/Next/graph documentation is needed.

Done when all Epic 2 stories are `Done`, targeted frontend/auth/audit/graph
tests pass, browser smoke checks pass, and the Epic 2 retrospective is complete.

### E1: Host Stability

Stop host/container instability before deeper deploy or kernel work.

Use Scout, Hightower, Bellard, `mcp-docker`, `mcp-harness`,
`systematic-debugging`, `bmad-dev-story`, and `bmad-code-review`.

Done when the crash source is identified or bounded, containers survive the
agreed stability window, crash/log evidence is captured, recovery is documented,
and the retrospective is complete.

### E2: Dashboard Quality

Close dashboard quality and accessibility gaps.

Use Scout, Jobs, Brooks, Woz, Pike/Fowler, `frontend-design`,
`frontend-craft`, `allura-design`, Browser/Hyper Browser, and Context7 when
docs are needed.

Done when five quality gaps are closed, accessibility passes, promote action is
visible and usable, the theme switcher is accessible, and the retrospective is
complete.

### E3/E4: Hardening Deploy

Deploy hardening changes safely and monitor stability.

Use Scout, Hightower, Bellard, `Ralph Loop`, `mcp-docker`, `mcp-harness`,
`bun-security`, `bmad-check-implementation-readiness`, `bmad-dev-story`, and
`bmad-code-review`.

Done when hardening items are deployed to production containers, monitoring
confirms stability, typecheck and tests pass, deployment evidence is attached,
and the retrospective is complete.

### E4: Kernel Completion

Complete remaining RuVix/kernel syscall and tightening work.

Use Scout, Brooks, Knuth, Bellard, Pike, `systematic-debugging`,
`bun-security`, `bmad-dev-story`, and `bmad-code-review`.

Done when remaining syscalls are implemented and tested, audit trail exists,
TODO placeholders are replaced or explicitly deferred, kernel behavior is
validated, and the retrospective is complete.

### E5: Infrastructure Polish

Complete persistence, observability, pagination, sync, and tracing polish.

Use Scout, Hightower, Knuth, Bellard, `mcp-docker`, `mcp-harness`,
`systematic-debugging`, `bmad-dev-story`, and `bmad-code-review`.

Done when session persistence works, monitoring writes to the expected store,
pagination is implemented where needed, Phase 3 sync is complete or explicitly
deferred, POL-004 tracing is verified, and the final retrospective is complete.

## Validation Plan

- Story level: run the targeted tests for the touched area.
- Frontend stories: run browser smoke checks and accessibility checks when
  relevant.
- Infra stories: run MCP Docker/container health checks.
- Security/auth stories: run `bun-security`, permission tests, and audit tests.
- Epic level: run `bmad-sprint-status` and confirm every epic story is `Done`
  before `bmad-retrospective`.
- Project finish: run final sprint status, targeted regression tests, and final
  Team RAM retrospective.
