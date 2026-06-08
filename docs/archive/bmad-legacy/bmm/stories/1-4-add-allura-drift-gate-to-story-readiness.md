# Story 1.4: Add Allura Drift Gate to Story Readiness

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As Brooks,
I want every story to run an Allura Brain drift check before Ready and before Done,
So that prior decisions, blockers, and source-of-truth rules catch contradictions before implementation claims are made.

## Traceability

Epic 1 -> FR18, FR20 -> readiness checklist + drift report template -> targeted docs/YAML validation.

## Acceptance Criteria

- [x] Readiness gate searches Allura Brain using `group_id=allura-system` for `{story title} blockers decisions outcomes`.
- [x] Gate compares memory results against Notion board state, code, schemas, canonical docs, and the BMAD plan.
- [x] Mismatches are classified as `critical`, `major`, or `minor` drift.
- [x] `critical` drift blocks work until resolved or explicitly deferred by Brooks and the relevant owner.
- [x] Allura Brain is treated as audit/context, not proof of Done.

## Allura Drift Gate

- Story: `1-4-add-allura-drift-gate-to-story-readiness — Add Allura Drift Gate to Story Readiness`
- Brain query: `Story 1.4 Allura Drift Gate story readiness blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `prop-session-13i`: Notion contract authoritative for gates.
  - `prop-session-issue7`: `allura-*` group IDs enforced on legacy tools.
  - `prop-arch-dual-layer`: PostgreSQL episodic + Neo4j semantic; no direct agent Neo4j writes.
  - `mem-3401d9be65b381ae`: every DB read/write requires `group_id` filter.
  - `mem-3401d9be65b3819c`: HITL promotion, append-only traces, `SUPERSEDES` versioning.
  - `mem-33e1d9be65b38174`: Notion is source of truth for planning/status/approval.
- Compared against:
  - Notion Work Board: unavailable in this runtime; local status remains reconciliation-only.
  - Code/schemas/docs/BMAD plan: `_bmad/bmm/planning/epics.md`, `_bmad/bmm/stories/sprint-status.yaml`, `_bmad/bmm/stories/story-lifecycle-gate.md`, `docs/allura/DATA-DICTIONARY.md`, `json-schema/event.schema.json`, `json-schema/canonical_proposals.schema.json`.
- Drift classification: `none` for Story 1.4 readiness; existing Story 1.1 major schema/documentation drift remains a recorded follow-up and does not block this documentation-only gate story.
- Disposition: proceed to review after validation.
- Owner: Brooks; Woz for edits; Pike/Fowler for review.
- Validation commands:
  - `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text())"`
  - `git diff --check -- "_bmad/bmm/stories/sprint-status.yaml" "_bmad/bmm/stories/story-lifecycle-gate.md" "_bmad/bmm/stories/1-4-add-allura-drift-gate-to-story-readiness.md" "_bmad/bmm/planning/epics.md"`

## Implementation Notes

- Added a readiness drift checklist to `_bmad/bmm/stories/story-lifecycle-gate.md`.
- Added a reusable drift report template to `_bmad/bmm/stories/story-lifecycle-gate.md`.
- Updated `_bmad/bmm/stories/sprint-status.yaml` with Story 1.4 drift evidence and planned validation/review placeholders.

## Changed Files

- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/story-lifecycle-gate.md`
- `_bmad/bmm/stories/1-4-add-allura-drift-gate-to-story-readiness.md`

## Evidence

- Validation: YAML parse and targeted `git diff --check` passed.
- Review: Pike reported no blocking findings. Fowler reported no blocking findings and one minor template mirroring issue; template now includes explicit board traceability.
- Brain outcome memory: `a435cc6a-f71d-465f-a2d9-966f5be7f967`.
- Board traceability: Notion board update pending; no Notion tool available in this runtime.
