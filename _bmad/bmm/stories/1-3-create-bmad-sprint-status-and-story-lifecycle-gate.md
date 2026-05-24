# Story 1.3: Create BMAD Sprint Status and Story Lifecycle Gate

Status: done

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this story file were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, JSON schemas, canonical docs in `docs/allura/`, Notion board state, and team consensus.

## Story

As a Team RAM operator,
I want BMAD sprint status and lifecycle gates generated from the approved epic/story plan,
so that work moves through Backlog -> Ready -> In Progress -> Review -> Done with evidence and validation instead of ad hoc progress claims.

## Acceptance Criteria

1. `_bmad/bmm/stories/sprint-status.yaml` exists with entries for each approved epic, story, and retrospective.
2. Each story uses legal BMAD states only: `backlog`, `ready-for-dev`, `in-progress`, `review`, or `done`.
3. The file states Notion Work Board is canonical and local sprint status is reconciliation support only.
4. No story may move to `done` unless implementation evidence, review evidence, validation evidence, and board/Brain traceability exist.
5. Every status update includes an Allura drift gate note or link.

## Tasks / Subtasks

- [x] Task 1: Generate all-epics sprint status (AC: 1, 2, 3)
- [x] Task 2: Document lifecycle gates and Done requirements (AC: 3, 4, 5)
- [x] Task 3: Validate sprint status YAML and artifact formatting (AC: 1, 2)

## Dev Notes

- Sprint status file: `_bmad/bmm/stories/sprint-status.yaml`.
- Lifecycle gate document: `_bmad/bmm/stories/story-lifecycle-gate.md`.
- Notion Work Board remains canonical for human/team state. This file is local reconciliation support.
- Allura Brain is audit/context; evidence proves Done.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.5 via Codex runtime under Brooks orchestration

### Debug Log References

- No debugging session was required; this was a BMAD workflow artifact slice.

### Completion Notes List

- Generated all-epics sprint status covering Epics 1-5, every story, and every retrospective.
- Documented legal status values and lifecycle gates.
- Added `canonical_tracking_system: Notion Work Board` to make source-of-truth explicit while retaining BMAD `tracking_system: file-system` compatibility.
- Validation evidence: YAML parse passed and targeted `git diff --check` passed.
- Added `status_evidence` map to `sprint-status.yaml` so local Done/status updates carry drift, validation, review, Brain memory, and Notion-pending evidence notes.
- Pike/Fowler review initially blocked Done status because evidence links were missing; this story now records the Brain memory ID and Notion-unavailable caveat.
- Added drift-gate placeholder notes for all backlog/optional future stories and retrospectives so every local status entry has a drift-gate note before future movement.

### File List

- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/story-lifecycle-gate.md`
- `_bmad/bmm/stories/1-3-create-bmad-sprint-status-and-story-lifecycle-gate.md`

### Change Log

- 2026-05-24: Created sprint tracking and story lifecycle gate; moved Story 1.3 to done after validation.
