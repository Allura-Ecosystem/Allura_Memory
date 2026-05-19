# Team RAM BMAD Integration

This document maps the live Team RAM agents into the BMAD planning and execution model.

The source of truth for live agent definitions remains:

```text
.opencode/agent/
```

BMAD consumes this file as the planning roster and workflow bridge. It does not replace the OpenCode agent definitions.

## Operating Model

```text
Intent -> Architecture -> Scout -> Skills -> Build -> Review -> Memory Log
```

Plain English:

- Jobs clarifies what the work is really trying to accomplish.
- Brooks protects architecture and decides the shape of the work.
- Scout loads repository context and Allura Brain memory.
- Woz builds the implementation.
- Pike, Fowler, Knuth, Hightower, Bellard, or Carmack review when their specialty applies.
- Allura Brain stores the result as governed memory.

## Kanban Team Workflow

The Kanban board is the operating surface for Team RAM + BMAD story execution.
The Notion `Work Board` / `Allura stories Work Items` board is the human/team
source of truth for story state. Local sprint-status files are support and
reconciliation artifacts; they must not replace the board.

Default story flow:

```text
Backlog -> Ready -> In Progress -> Review -> Done
```

Epic flow:

```text
Plan epic -> finish every story -> code review gates pass -> retrospective -> next epic
```

Finish-all-epics order:

```text
current review debt -> Epic 2 Frontend Tightening -> E1 Host Stability ->
E2 Dashboard Quality -> E3/E4 Hardening Deploy -> E4 Kernel Completion ->
E5 Infrastructure Polish
```

The canonical finish-all-epics workflow is
`_bmad/FINISH-ALL-EPICS-WORKFLOW.md`.

Scout is the first real background/recon agent for every epic or story batch. If
Scout is unavailable or not spawned, the runtime must say
`Scout-style hydration only` and continue with the safest available local
hydration path.

### Story Lifecycle

1. **Scout Intake** — Scout produces a read-only report covering the board,
   repo, Allura Brain memory, evidence, blockers, validation commands, and
   risks.
2. **Epic Intake** — Jobs and Brooks confirm the epic goal, story list,
   acceptance criteria, and board mapping. Stories without clear acceptance
   criteria stay in `Backlog`.
3. **Story Ready Gate** — Move one story at a time to `Ready`. Required before
   `Ready`: clear acceptance criteria, owner, reviewers, validation command,
   and evidence expectation.
4. **Dev Story** — Move the selected card to `In Progress`. Woz runs
   `bmad-dev-story` for that one story only. Scope stays limited to that card
   unless Brooks explicitly approves a contract dependency.
5. **Code Review** — Move the card to `Review`. Pike reviews interface/API
   simplicity. Fowler reviews maintainability and refactor safety. Blocking
   findings send the card back to `In Progress`.
6. **Done Gate** — Move the card to `Done` only when tests pass, acceptance
   criteria are met, review blockers are resolved, and evidence is attached or
   logged. Scout/Brooks log important outcomes to Allura Brain with
   `group_id: allura-system`.
7. **Epic Retrospective** — When every story in the epic is `Done`, run
   `bmad-retrospective`. Capture lessons, process fixes, missed risks, and
   next-epic preparation. Do not run an epic retrospective while stories remain
   in `In Progress` or `Review` unless explicitly marked as a partial retro.

### Story 2.4 Route

Start with `CARD-2.4-E — Add targeted role/SoD/audit tests`.

- Owner: Woz
- Reviewers: Pike and Fowler
- First acceptance target: approval-audit tests pass under Bun without
  `vi.mocked`
- Next cards after green tests: `CARD-2.4-A`, `CARD-2.4-C`, then `CARD-2.4-D`

### Board/Workflow Mapping

| Board State | Team RAM Owner | BMAD Workflow |
| --- | --- | --- |
| Backlog | Jobs + Brooks | Epic/story shaping |
| Ready | Jobs + Brooks + Scout | `bmad-sprint-status` reconciliation |
| In Progress | Woz | `bmad-dev-story` |
| Review | Pike + Fowler | `bmad-code-review` |
| Done | Brooks + Scout | Evidence log + memory write |
| Epic complete | Brooks + team | `bmad-retrospective` |

## Required Gates

| Gate | Owner | Required Output |
| --- | --- | --- |
| Scout Intake Gate | Scout | Read-only Scout Report before story/epic routing |
| Intent Gate | Jobs | Objective, scope, acceptance criteria |
| Architecture Gate | Brooks | Plan, contracts, invariants, routing |
| Context Gate | Scout | Scout Report with local context and memory context |
| Skill Gate | Scout + Brooks | Required skills identified before build |
| Build Gate | Woz | Working change or implementation packet |
| Review Gate | Pike/Fowler/specialist | Interface, refactor, data, infra, or performance review |
| Memory Gate | Scout/Brooks/Woz | Outcome logged to Allura Brain when tools are available |

## Team Roster

| BMAD Role | Team RAM Agent | Live Definition | Primary Skills |
| --- | --- | --- | --- |
| Product / Intent | Jobs | `.opencode/agent/core/jobs.md` | `allura-memory-skill`, `task-management` |
| Architect / Orchestrator | Brooks | `.opencode/agent/core/brooks.md` | `party-mode`, `mcp-harness`, `skill-creator`, `allura-memory-skill` |
| Context Scout | Scout | `.opencode/agent/subagents/core/scout.md` | `allura-memory-skill`, `multi-search`, `context7`, `mcp-docker` |
| Builder | Woz | `.opencode/agent/subagents/code/woz.md` | `frontend-craft`, `task-management`, `varlock`, `code-review` |
| Interface Reviewer | Pike | `.opencode/agent/subagents/review/pike.md` | `code-review`, `allura-memory-skill` |
| Refactor Reviewer | Fowler | `.opencode/agent/subagents/review/fowler.md` | `code-review`, `allura-memory-skill` |
| Data Architect | Knuth | `.opencode/agent/subagents/infrastructure/knuth.md` | `postgres-best-practices`, `allura-memory-skill` |
| Infrastructure | Hightower | `.opencode/agent/subagents/infrastructure/hightower.md` | `mcp-docker`, `mcp-harness`, `varlock` |
| Diagnostics | Bellard | `.opencode/agent/subagents/code/bellard.md` | `systematic-debugging-memory`, `allura-memory-skill` |
| Performance | Carmack | `.opencode/agent/subagents/code/carmack.md` | `systematic-debugging-memory`, `allura-memory-skill` |

## BMAD Artifact Mapping

| Artifact Type | Owner | Target Location |
| --- | --- | --- |
| Product brief | Jobs + Brooks | `_bmad-output/planning-artifacts/product-brief.md` |
| PRD | Jobs + Brooks | `_bmad-output/planning-artifacts/prd.md` |
| Architecture | Brooks | `_bmad-output/planning-artifacts/architecture.md` |
| Epics | Brooks + Woz | `_bmad-output/implementation-artifacts/epics.md` |
| Stories | Woz + Scout | `_bmad-output/implementation-artifacts/stories.md` |
| Risks / decisions | Brooks + Fowler | `_bmad-output/planning-artifacts/risks-and-decisions.md` |
| Data dictionary | Knuth | `_bmad-output/planning-artifacts/data-dictionary.md` |
| Design docs | Pike + Woz | `_bmad-output/planning-artifacts/design.md` |

## Skill Rules

All agents use `allura-memory-skill` for governed memory work.

Use `bmad-agent-builder` when creating, rebuilding, or analyzing Team RAM agent skills.

Use `team-ram-cowork` when Codex/OpenCode/Claude needs to explain or operate the roleplay-based co-work model.

Use `bmad-module-builder` later if Team RAM should ship as a portable BMAD module.

## Allura Rules

Allura Brain is the memory layer. It is not a replacement for repository context or docs.

Default memory tenant:

```text
group_id: allura-system
```

Raw task outcomes are logged first. Durable project truth is promoted only through governance.
