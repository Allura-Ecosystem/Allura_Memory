# Story 1.5: Define Review and Validation Evidence Packets

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As a reviewer,
I want every story to declare implementation, review, validation, and board/Brain evidence expectations,
So that Done means evidence-backed completion rather than team optimism.

## Traceability

Epic 1 -> FR20 -> evidence packet checklist -> targeted docs/YAML validation.

## Acceptance Criteria

- [x] Evidence packet includes changed files, exact validation command output, review notes before Done, Notion/board status, and Allura Brain outcome receipt before Done.
- [x] Pike/Fowler or documented gate-equivalent review is required before Done.
- [x] Validation failures remain blockers, not warnings.
- [x] Required tool/runtime unavailability records exact command/output and proposed recovery.

## Allura Drift Gate

- Story: `1-5-define-review-and-validation-evidence-packets — Define Review and Validation Evidence Packets`
- Brain query: `Story 1.5 review validation evidence packets blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-33e1d9be65b38174`: Notion is source of truth for planning/status/approval.
  - `prop-va-drift-fixes`: prior VA work tracked drift findings and fixes.
  - `mem-mcp-docker-valid`: runtime/tool validation should be evidenced.
  - `mem-33e1d9be65b3819a`: external/tooling skills require review discipline.
- Compared against:
  - Notion Work Board: unavailable in this runtime; local status remains reconciliation-only.
  - Code/schemas/docs/BMAD plan: `_bmad/bmm/planning/epics.md`, `_bmad/bmm/stories/sprint-status.yaml`, `_bmad/bmm/stories/story-lifecycle-gate.md`, `_bmad/bmm/stories/review-validation-evidence-packet.md`.
- Drift classification: `none` for this documentation-only evidence packet story.
- Disposition: proceed to review after validation.
- Owner: Brooks; Woz for edits; Pike/Fowler for review.
- Validation commands:
  - `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text())"`
  - `git diff --check -- "_bmad/bmm/stories/sprint-status.yaml" "_bmad/bmm/stories/story-lifecycle-gate.md" "_bmad/bmm/stories/review-validation-evidence-packet.md" "_bmad/bmm/stories/1-5-define-review-and-validation-evidence-packets.md" "_bmad/bmm/planning/epics.md"`

## Implementation Notes

- Added Review Evidence Packet Gate and Validation Evidence Packet Gate to `_bmad/bmm/stories/story-lifecycle-gate.md`.
- Added reusable packet checklist/template in `_bmad/bmm/stories/review-validation-evidence-packet.md`.
- Updated `_bmad/bmm/stories/sprint-status.yaml` with Story 1.5 drift evidence and planned validation/review placeholders.

## Changed Files

- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/story-lifecycle-gate.md`
- `_bmad/bmm/stories/review-validation-evidence-packet.md`
- `_bmad/bmm/stories/1-5-define-review-and-validation-evidence-packets.md`

## Evidence

- Validation:
  - `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text())"` — passed; exact output: `no output`.
  - `git diff --check -- "_bmad/bmm/stories/sprint-status.yaml" "_bmad/bmm/stories/story-lifecycle-gate.md" "_bmad/bmm/stories/review-validation-evidence-packet.md" "_bmad/bmm/stories/1-5-define-review-and-validation-evidence-packets.md" "_bmad/bmm/planning/epics.md"` — passed; exact output: `no output`.
- Review: Pike/Fowler initially found blockers around exact validation output, Brain outcome receipt, and circular review requirements; fixes resolved all blockers on re-review.
- Brain outcome memory: `a245b248-f82b-4af0-8e0a-f52b7f8e9258`.
- Board traceability: Notion board update pending; no Notion tool available in this runtime.
