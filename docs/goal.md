# Allura Memory Goal, PRD, and Phase Roadmap

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, Notion board state, and team consensus.

## Phase 0 Status: **CLOSED** ✅

Phase 0 was **officially closed on 2026-05-18** by Captain approval.

All 12 Phase 0 items are resolved:
- **DONE**: 2.1 Token Audit, CARD-2.4-E, B/C L3 validation, Memory Explorer live-data,
  3100 target, Owner map, D-lane rollback
- **WAIVED**: /allura review gate, 6420→3334 reachability, B04 cash tracker (out of scope)
- **DEFERRED**: Cost ledger (Phase 3), Board config (Phase 1 — now unblocked)

**Phase 1 is now UNBLOCKED.**

## Overall Goal

Finish Allura Memory as a governed, stable AI memory operating system before starting new board or product expansion work.

Allura Memory is not just a dashboard and not just a database. It is the governed memory layer for AI agents: raw traces land in PostgreSQL, reviewed knowledge is promoted into Neo4j, Notion carries board truth, and Team RAM routes work through evidence-backed review gates.

The product goal is simple:

```text
Allura should let an operator answer:
1. What does the Brain know?
2. Why does it believe that?
3. Who approved it?
4. What changed, and can we prove it?
```

## Product Brief

### Problem

AI agents forget between sessions, and ungoverned memory becomes a black box. Without a stable memory substrate, agents repeat work, lose decisions, invent state, or promote unreviewed claims as truth.

### Product Promise

Allura Memory gives AI agents persistent, inspectable, accountable memory.

It succeeds when:

- Agents can retrieve the right project context without guessing.
- Humans can inspect every important memory, decision, and promotion.
- Raw traces stay separate from curated truth.
- Notion, GitHub, repo docs, and Allura Brain receipts agree.
- New boards can be added later without hardcoding private business workflows.

### Users

| User | Need |
| --- | --- |
| Captain / owner | Clear project state, decisions, and proof of Done |
| Agent operator | Safe memory recall, review queues, rollback paths |
| Team RAM agent | Fast context hydration and role-specific routing |
| Developer | Stable APIs, tests, contracts, and board configs |
| Future board owner | Configurable boards with no private data in repo |

### Non-Goals

- Do not start Phase 1 board-config work before Phase 0 is closed or formally waived.
- Do not treat Allura Brain raw memory as proof of Done.
- Do not ship private board data in the public repo.
- Do not let AI decide compliance, finance, or owner policy without explicit human approval.
- Do not replace `3100` until cutover gates pass.

## Source Of Truth Model

| Layer | Authority | Purpose |
| --- | --- | --- |
| Notion Work Board | Canonical status | What is Ready, In Progress, Review, or Done |
| GitHub PRs/checks | Code proof | What changed and whether CI accepted it |
| Repo docs | Stable canon | Architecture, decisions, requirements, runbooks |
| Allura Brain | Audit memory | Searchable traces, lessons, and receipts |
| RuVix | Governance | Intent, evidence, validation, isolation, audit |
| Team RAM | Operating crew | Scout, Jobs, Brooks, Woz, Pike, Fowler, specialists |

## AI Guidelines

All AI-assisted work in this repo must follow these rules:

- State intent before changing code, docs, config, memory, or board state.
- Hydrate context before important action.
- Prefer source documents, code, tests, and board state over memory recall.
- Use Allura Brain with explicit `group_id: allura-system` when memory tools are available.
- Never claim a tool, check, agent, or validation ran unless it actually ran.
- Include AI-assisted disclosure blocks in AI-shaped documentation.
- Defer to code, schemas, and team consensus when docs conflict.
- Do not create private or customer-specific board content in public docs.
- Keep humans in the loop for owner decisions, compliance decisions, and scope calls.

## Team RAM Operating Model

Team RAM is the thinking and review crew. Codex/OpenCode/Claude are the hands.

Default routing for one card:

```text
Jobs -> Brooks -> Scout -> Woz -> Pike/Fowler -> Ralph/validation -> Allura log
```

Default routing for finishing epics is defined in
`_bmad/FINISH-ALL-EPICS-WORKFLOW.md`. That workflow is the canonical
Scout-first Kanban lane for moving from current review debt through the
remaining epics without opening new work too early.

Role responsibilities:

| Role | Responsibility |
| --- | --- |
| Jobs | Clarifies intent, scope, acceptance criteria |
| Brooks | Owns architecture, boundaries, route, conceptual integrity |
| Scout | Hydrates repo, board, runtime, and memory context |
| Woz | Builds working code and tests |
| Pike | Reviews interface shape and simplicity |
| Fowler | Reviews maintainability and reversible change |
| Ralph | Runs loop validation after implementation and review evidence |
| Knuth | Owns data contracts, schemas, migrations |
| Hightower | Owns infrastructure, deployability, observability |
| Bellard | Owns diagnostics and correctness under weird failure |
| Carmack | Owns performance and hot paths |

## RuVix Done Standard

Every closure claim needs:

- `mutate`: What changed, and why.
- `attest`: What evidence proves the claim.
- `verify`: What validation ran.
- `isolate`: What project, tenant, branch, or worktree boundary was used.
- `sandbox`: What unsafe path was avoided.
- `audit`: Where the outcome was logged.

## Phase 0 Goal: Foundation Lock

### Outcome

All current memory-system blockers are either closed with evidence or explicitly waived. Notion, GitHub, repo ledger, and Allura Brain agree enough to start Phase 1 without carrying hidden Phase 0 debt.

### Phase 0 Exit Criteria

- All blocker rows are `DONE`, `DEFERRED`, or `WAIVED` with evidence.
- Notion finish plan is reconciled with merged PRs and comments.
- `blocking_list.md` reflects current truth.
- Allura Brain has receipts for major decisions and closures.
- `/allura` has direct validation plus Ralph pass or formal Ralph runtime waiver.
- Cash tracker is either in scope with a canonical source or explicitly out of scope.
- Phase 1 start is approved after closure.

### Phase 0 Checklist

| Item | Status | Closure Rule |
| --- | --- | --- |
| Auth/typecheck blocker | Done | PR #27 merged and evidence attached |
| 2.1 Token Audit | Done | PR #28 merged and evidence attached |
| `/allura` direct review gate | Waived | PR #29 merged; direct evidence green; Ralph runtime waiver `artifacts/allura-ralph-runtime-waiver-2026-05-17.md` |
| Memory Explorer live data | Done | PR #30 merged and evidence attached |
| CARD-2.4-E approval audit guard | Done | PR #31 merged and evidence attached |
| Local ledger reconciliation | Done | PR #32 merged |
| `3100` owner decision | Done | PR #33 merged |
| Cash tracker | WAIVED | Canonical placeholder/source contract exists at Notion `35d1d9be-65b3-810e-b080-eddc7e036aee`; B04 is explicitly out of scope for Phase 0 (`artifacts/b04-cash-tracker-decision-record-2026-05-17.md`). No Phase 0 source claims are required here. |
| B/C L3 validation | Done | Commit `e75cab8962d6fbfeb31234292f6c863c46109e23` records consolidated B1-B7/C1-C2 L3 evidence sweep |
| D-lane rollback/supersession | Done | Commit `fbb9cee10d9f65a105a8dbb8e8290e7d731eebf2` reverted invalid D-lane cutover artifacts |
| `6420 -> 3334` reachability | Waived | Direct reachability/browser evidence attached; Ralph runtime waiver `artifacts/allura-ralph-runtime-waiver-2026-05-17.md` |
| Cost ledger | Deferred | `artifacts/cost-ledger-deferral-2026-05-17.md` |
| Owner map | Done | Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f` assigns Sabir Asheed as accountable owner for all lanes and records Captain acknowledgment; `OWNERS.yaml` reconciled |
| Finish-plan reconciliation | Done | `docs/plans/phase0-evidence-index.md`; Notion finish-plan body synced to the current GO/B04-waived route; Notion comments `3631d9be-65b3-8145-9b87-001d2d156b76`, `3631d9be-65b3-819c-b947-001d9b31fa6d`; Brain receipts `19c092e1-9be2-4e4d-b3fc-e2f5687400ee`, `081a206b-0266-45d6-8aff-c5aa564e8e26` |
| Completion audit | Done | `artifacts/docs-goal-completion-audit-2026-05-17.md` (initial), `artifacts/docs-goal-completion-audit-b04-waiver-2026-05-17.md` (current), final closeout `artifacts/phase0-final-closeout-2026-05-17.md` |
| Final Phase 0 closeout | Done | Notion closeout comment `3631d9be-65b3-8159-ae59-001dac2bfc28`, Brain receipt `557aa421-e261-444f-88c4-85f4d9d07a77`, artifact `artifacts/phase0-final-closeout-2026-05-17.md` |

## Phase 1 Goal: Board Config System

### Outcome

Build a generic board engine so new boards are config-driven, validated, and safe to share.

### PRD Requirements

| Requirement | Description |
| --- | --- |
| Generic board engine | Shared renderer and data model for configured boards |
| Dynamic route | `/boards/[boardId]` loads board config by ID |
| Zod validation | Invalid board configs fail safely and loudly |
| Sanitized examples | Public examples contain no private business data |
| Private configs | Personal board configs are gitignored |
| Source declarations | Every board declares source of truth and write policy |
| Degraded states | Boards show blocked/degraded/empty states honestly |
| Tests | Config validation and route loading are covered |
| Docs | Adding a new board is documented step by step |

### Phase 1 Checklist

- Create board config schema. Evidence: `src/lib/boards/schema.ts`.
- Create board registry loader. Evidence: `src/lib/boards/registry.ts`.
- Add sanitized example board configs. Evidence: `src/lib/boards/examples.ts`.
- Add gitignored personal board config path. Evidence: `.gitignore` includes `board-configs/private/`.
- Create `/boards/[boardId]`. Evidence: `src/app/(main)/boards/[boardId]/page.tsx`.
- Preserve current `/allura` behavior. Evidence: no `/allura` route mutation in board-config slice; `/allura` remains separate.
- Add config validation tests. Evidence: `src/lib/boards/__tests__/board-config.test.ts`, `src/lib/boards/__tests__/board-registry.test.ts`.
- Add route loading tests. Evidence: `src/lib/boards/__tests__/board-route.test.ts`, `src/app/(main)/boards/[boardId]/page.test.tsx`.
- Add docs for adding a board. Evidence: `docs/boards.md`, `docs/boards/phase1-board-config.md`.
- Add evidence to Notion and Allura Brain. Evidence: Notion `3631d9be-65b3-81fd-b577-ed650a7137da`; Brain `a2850ddf-4651-410e-bb35-1408ae521f61`.

## Phase 2 Goal: Mission Control Multi-Board Cockpit

### Outcome

Mission Control becomes a clean cockpit for memory, work, agents, telemetry, and resources.

### Checklist

- Add board switcher. Evidence: `src/app/(main)/boards/page.tsx`, `src/app/(main)/boards/[boardId]/page.tsx`.
- Add board status model. Evidence: `src/lib/boards/presentation.ts`.
- Add source-of-truth badges. Evidence: board list/detail pages show source labels and visibility.
- Add degraded-state UI. Evidence: derived status model and section status rendering.
- Add blocked-state UI. Evidence: derived status model and section status rendering.
- Add board evidence panels. Evidence: `buildBoardEvidencePanels()` and board detail page.
- Add adapter declaration per board. Status: `PARTIAL`; board configs include adapter field, full Mission Control adapter declaration still tracked in Phase 4.
- Add no-fabricated-data checks. Status: `PARTIAL`; `board-presentation.test.ts` checks public examples for private-path leakage, full live-data audit still required.
- Validate desktop and mobile layouts. Status: `DONE-FOR-BOARD-ROUTES`; route smoke and desktop/mobile screenshot evidence recorded for `/boards`, `/boards/memory-ops`, and `/boards/agent-readiness`.
- Record screenshot evidence. Evidence: `artifacts/board-screenshot-evidence-2026-05-17.md` and `artifacts/boards-screenshots-2026-05-17/`; Notion `3631d9be-65b3-8167-af39-fe1e8e0a074c`; Brain `7ab42d42-78d3-4a34-95b6-be7f8089d490`.

## Phase 3 Goal: Governance And Audit Hardening

### Outcome

Every important action has owner, evidence, source, status, and rollback or supersession path.

### Checklist

- Standardize evidence comments. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.
- Standardize Brain receipt format. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.
- Standardize waiver format. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.
- Activate or formally defer cost ledger. Evidence: `artifacts/cost-ledger-deferral-2026-05-17.md`.
- Complete owner map. Evidence: `OWNERS.yaml`; Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f`.
- Normalize decision log format. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.
- Normalize rollback/supersession records. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.
- Add governance tests where practical. Evidence: `src/__tests__/governance-audit-standards.test.ts`.
- Document review gates. Evidence: `docs/allura/GOVERNANCE-AUDIT-STANDARDS.md`.

## Phase 4 Goal: Dashboard Cutover Readiness

### Outcome

The Mission Control development surface can safely replace the current Docker dashboard on `3100`.

### Canonical Ports

| Port | Meaning |
| --- | --- |
| `6420` | Visual/reference memory dashboard |
| `3334` | Mission Control development integration target |
| `3100` | Current Docker dashboard and future dashboard UI cutover target |

### Cutover Checklist

- Route parity complete. Status: `PASS`; evidence in `artifacts/mission-control-route-parity-2026-05-17.md`; Notion `3631d9be-65b3-81c0-a052-dc5c4cb458ad`; Brain `6c947189-0ee4-4ff8-9b05-d6c52b5d6552`.
- Visual parity complete. Status: `PENDING`; screenshot evidence still required.
- Source-of-truth parity complete. Status: `PARTIAL`; board routes now show source badges/panels, full Mission Control route parity still required.
- Adapter declarations complete. Status: `PENDING`; gate tracked in `docs/allura/SOLUTION-ARCHITECTURE.md` and `docs/allura/RISKS-AND-DECISIONS.md`.
- No fabricated live data. Status: `PENDING`; audit still required before `3100` cutover.
- Authenticated validation complete. Status: `PENDING`; auth smoke still required.
- Unauthenticated validation complete. Status: `PENDING`; public route smoke still required.
- Smoke tests complete. Status: `PARTIAL`; board route smoke recorded, full cutover smoke still required.
- Runtime health checks complete. Status: `PARTIAL`; liveness passed, readiness is unhealthy because MCP is false, bounded readiness times out, and container health output is still required. Evidence: `artifacts/runtime-health-partial-2026-05-17.md`; Notion `3631d9be-65b3-8133-b63d-d40473f4f32c`; Brain `d9bbabb7-676a-4eb7-959b-942d07103c5e`.
- Rollback command documented. Status: `DOCUMENTED`; see `docs/allura/SOLUTION-ARCHITECTURE.md` and `docs/allura/RISKS-AND-DECISIONS.md`.
- Captain approval recorded. Status: `PENDING`; required before replacing `3100`.

## Phase 5 Goal: Domain Boards

### Outcome

Add real domain boards as governed configs, not custom one-off dashboards.

### Candidate Boards

| Board | Status | Notes |
| --- | --- | --- |
| Memory Board | Current | Finish and stabilize first |
| Faith Meats Operations | Deferred | HACCP and operations evidence board |
| Lending Compliance | Deferred | Mortgage rules, evidence, decisions, audit trail |

### Checklist

- Confirm owner and source of truth for each board. Status: `PENDING` for deferred domain boards; governance contract in `docs/allura/DOMAIN-BOARD-GOVERNANCE.md`.
- Create private config first. Status: `PENDING`; required path is `board-configs/private/`.
- Create sanitized public example if needed. Status: `DEFERRED`; no public domain example until private source owner approves sanitization.
- Define evidence expectations. Status: `DOCUMENTED`; see `docs/allura/DOMAIN-BOARD-GOVERNANCE.md`.
- Define write policy. Status: `DOCUMENTED`; see `docs/allura/DOMAIN-BOARD-GOVERNANCE.md`.
- Define degraded behavior. Status: `DOCUMENTED`; see `docs/allura/DOMAIN-BOARD-GOVERNANCE.md`.
- Add tests. Status: `PARTIAL`; see `src/__tests__/domain-board-governance.test.ts`.
- Attach Notion evidence. Status: `PENDING`; required before activating any domain board.

## Phase 6 Goal: Release And Stewardship

### Outcome

Allura Memory is stable enough for ongoing maintenance, external review, and future iteration.

### Checklist

- Update README and product docs. Status: `PARTIAL`; release gate tracked in `docs/allura/RELEASE-STEWARDSHIP.md`.
- Review security and privacy docs. Status: `PARTIAL`; release gate tracked in `docs/allura/RELEASE-STEWARDSHIP.md`.
- Review install and deployment docs. Status: `PARTIAL`; `docs/allura/INSTALL-DEPLOY-REVIEW.md` documents the source Compose path and evidence requirements, local env prerequisite check currently fails, with Notion `3631d9be-65b3-8126-9d29-c75729329afa` / `3631d9be-65b3-81e0-b267-e734aca5b379` and Brain `0591f7f3-cbfc-4fa1-805a-4740de3658ae` / `0cf75be3-d3c7-4e53-bde7-dccb4aa2992c`; fresh deploy evidence is still required.
- Confirm sample data is safe. Status: `PARTIAL`; board sanitization tests and focused release safety scan exist, full external sample/secret scan still required.
- Confirm no secrets or private board data are tracked. Status: `PARTIAL`; private board path is gitignored and focused public-surface scan exists, full repository secret scan still required.
- Confirm CI is green. Status: `PARTIAL`; `artifacts/local-ci-partial-evidence-2026-05-17.md` records local green typecheck/lint/unit/curator/integration/focused/MCP-build lanes with Notion `3631d9be-65b3-8189-a83a-dd5756cce43e` and Brain `6a329870-61f2-4808-a54e-92f2ab7e7967`, and `artifacts/board-screenshot-evidence-2026-05-17.md` records board-route browser screenshot evidence. GitHub checks, Next production build, E2E, and full release browser validation are still required.
- Run final Team RAM retrospective. Status: `PENDING`; required after remaining gates close.
- Log final release receipt to Allura Brain. Status: `PENDING`; only valid after release gates pass.

## Immediate Next Actions

1. Continue Phase 4 cutover gates: route parity, visual parity, source-of-truth parity, auth validation, smoke tests, runtime health, tested rollback, and Captain approval.
2. Keep Phase 5 domain boards deferred until owner/source approval and private configs exist.
3. Finish Phase 6 release gates only after CI, security/privacy, install/deploy, sample/secret scan, and retrospective evidence exist.

## Finish-All-Epics Execution Order

After Phase 0 is closed or formally waived, use
`_bmad/FINISH-ALL-EPICS-WORKFLOW.md` for the remaining epic sequence:

1. Finish current review debt.
2. Finish Epic 2 Frontend Tightening.
3. Finish E1 Host Stability.
4. Finish E2 Dashboard Quality.
5. Finish E3/E4 Hardening Deploy.
6. Finish E4 Kernel Completion.
7. Finish E5 Infrastructure Polish.

No epic is complete until every story is `Done`, evidence is attached, and the
epic retrospective is complete.

## Related Canon

- `_bmad/FINISH-ALL-EPICS-WORKFLOW.md`
- `docs/allura/BLUEPRINT.md`
- `docs/allura/SOLUTION-ARCHITECTURE.md`
- `docs/allura/DESIGN-MEMORY-SYSTEM.md`
- `docs/allura/DESIGN-ALLURA.md`
- `docs/allura/TEAM-RAM-BMAD-INTEGRATION.md`
- `docs/allura/RUVIX-GOVERNANCE-RULES.md`
- `docs/allura/RISKS-AND-DECISIONS.md`
- `blocking_list.md`
