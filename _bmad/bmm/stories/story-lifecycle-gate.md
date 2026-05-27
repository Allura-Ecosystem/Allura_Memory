# BMAD Story Lifecycle Gate

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, JSON schemas, canonical docs in `docs/allura/`, Notion board state, and team consensus.

## Purpose

This gate defines the local BMAD story lifecycle used by the Ultra all-epics loop. It supports the Notion Work Board; it does not replace it.

## Source of Truth

| Surface | Role |
| --- | --- |
| Notion Work Board / Allura stories Work Items | Human/team source of truth for status, owner, approval, and evidence |
| `_bmad/bmm/stories/sprint-status.yaml` | Local reconciliation and automation support |
| Allura Brain | Memory/audit context, not proof of Done |
| Validation output / review notes / artifacts | Evidence proving Done |

## Legal States

| State | Meaning | Required Gate |
| --- | --- | --- |
| `backlog` | Story exists in epic plan only | Acceptance criteria present in `_bmad/bmm/planning/epics.md` |
| `ready-for-dev` | Story file exists and context is loaded | Scout context, Brain search, required skills, validation commands |
| `in-progress` | Woz/Team RAM is actively implementing | Brooks route approval and smallest bounded slice selected |
| `review` | Implementation and validation evidence exist | Targeted validation passed or blocker output captured |
| `done` | Story passed review and evidence gates | Implementation evidence, review evidence, validation evidence, board/Brain traceability |

## Required Gate Object

```json
{
  "context_loaded": true,
  "brain_memories_checked": true,
  "required_skills": [],
  "skills_loaded": [],
  "validation_commands": []
}
```

## Story Ready Gate

Before a story moves from `backlog` to `ready-for-dev`:

1. Scout loads local context and identifies relevant files.
2. Allura Brain is searched with `group_id=allura-system` for `{story title} blockers decisions outcomes`.
3. Required skills are listed.
4. Validation commands are named.
5. Any critical drift is resolved or explicitly deferred by Brooks and the relevant owner.

### Readiness Drift Checklist

Every story readiness decision records the following local reconciliation fields before status moves out of `backlog`:

| Field | Required content |
| --- | --- |
| `story_id` | Stable story key from `_bmad/bmm/planning/epics.md` |
| `brain_query` | Exact Allura Brain query: `{story title} blockers decisions outcomes` |
| `group_id` | `allura-system` unless the story explicitly defines another valid `allura-*` tenant |
| `memory_results_used` | IDs or concise summaries of relevant memories consulted |
| `comparison_targets` | Notion board state, code, schemas, canonical docs, BMAD plan, and relevant source docs |
| `drift_classification` | `none`, `minor`, `major`, or `critical` |
| `disposition` | `proceed`, `defer-with-owner`, or `block` |
| `owner` | Brooks plus the relevant implementation/review owner |
| `validation_commands` | Commands expected to prove the story's slice |
| `board_traceability` | Notion board receipt, or explicit `pending: no Notion tool available` caveat |

`critical` drift means a contradiction that could invalidate tenant scope, source-of-truth authority, HITL promotion, append-only audit behavior, review evidence, validation evidence, or dashboard truthfulness. It blocks work until resolved or explicitly deferred by Brooks and the relevant owner.

`major` drift is a documented mismatch that does not make the current slice unsafe but must become a follow-up before related implementation depends on it.

`minor` drift is a naming, enum, copy, or documentation mismatch that should be recorded but does not block the slice.

## Drift Report Template

```markdown
### Allura Drift Gate

- Story: `{story_id} — {story_title}`
- Brain query: `{story_title} blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `{memory_id_or_summary}`
- Compared against:
  - Notion Work Board: `{receipt or unavailable caveat}`
  - Code/schemas/docs/BMAD plan: `{files checked}`
- Drift classification: `{none|minor|major|critical}`
- Drift notes: `{mismatches or none}`
- Disposition: `{proceed|defer-with-owner|block}`
- Owner: `{Brooks + relevant owner}`
- Validation commands: `{commands}`
- Board traceability: `{Notion receipt or pending: no Notion tool available}`
```

## Story Done Gate

A story may move to `done` only when all apply:

1. Acceptance criteria are satisfied or explicitly deferred.
2. Validation passed, or exact blocker output is attached.
3. Pike/Fowler review or documented gate-equivalent review has no blocking findings.
4. Changed files are listed in the story record.
5. Allura Brain outcome memory is written with `group_id=allura-system`.
6. Notion board update is completed when the Notion tool is available; otherwise the story records that local status is reconciliation-only and Notion remains pending.

For local BMAD reconciliation, Done evidence is recorded under `status_evidence` in `_bmad/bmm/stories/sprint-status.yaml` with at least: `drift_gate`, `validation`, `review`, `brain_memory_id`, and `board_traceability`.

## Ready-for-Review Evidence Packet Gate

A story may move from `in-progress` to `review` only when the ready-for-review packet contains:

1. Story ID, title, owner, and current local status.
2. Acceptance criteria checklist with each item marked satisfied, deferred, or blocked.
3. Changed files list.
4. Implementation summary describing the smallest bounded slice completed.
5. Validation commands and exact command output, or explicit `no output` when the command prints nothing.
6. Allura Drift Gate report from readiness or updated before Review.
7. Known residual risks and explicit follow-ups.
8. Notion board receipt, or an explicit `pending: no Notion tool available` caveat.

Reviewers then return findings as `blocking` or `nonblocking`. Blocking findings keep the story in `review` or move it back to `in-progress`; nonblocking findings become follow-ups or are fixed within the same slice if low risk.

## Validation Evidence Packet Gate

Validation failures remain blockers, not warnings. A validation packet records:

| Field | Required content |
| --- | --- |
| `commands` | Exact commands run, in order |
| `result` | `passed`, `failed`, or `blocked` |
| `exact_output` | Exact output, or explicit `no output` when the command prints nothing |
| `scope` | Why these commands are sufficient for the story slice |
| `unrun_commands` | Any expected commands not run and why |
| `root_cause` | Required for failures before another fix attempt |
| `artifacts` | Screenshots, logs, reports, or file paths when applicable |

If a required tool/runtime is unavailable, the story records exact command/output and proposed recovery. The story cannot be marked `done` unless Brooks explicitly accepts a documented deferral with owner and follow-up.

## Done Evidence Packet Gate

A story may move from `review` to `done` only when the done packet adds:

1. Pike/Fowler review notes or documented gate-equivalent review notes.
2. Disposition for every blocking and nonblocking finding.
3. Allura Brain outcome receipt ID; `pending` is not valid for Done.
4. Final `status_evidence` update in `_bmad/bmm/stories/sprint-status.yaml`.
5. Notion board receipt, or explicit `pending: no Notion tool available` caveat when this runtime cannot update Notion.

## Allura Drift Gate

For every status update:

1. Search Allura Brain using `group_id=allura-system` for `{story title} blockers decisions outcomes`.
2. Compare results against code, schemas, canonical docs, BMAD plan, and board state.
3. Classify drift as `critical`, `major`, or `minor`.
4. Critical drift blocks work unless Brooks and the relevant owner explicitly defer it.

## Stop Conditions

Stop or keep the story out of `done` when any condition is present:

- destructive-risk
- secret-risk
- unclear irreversible action
- missing validation command
- validation failure without root cause
- review veto
- critical drift not deferred
- evidence gap that prevents Done
