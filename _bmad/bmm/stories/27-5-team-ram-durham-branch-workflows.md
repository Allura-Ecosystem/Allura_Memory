# Story 27.5 — Team RAM and Durham Branch Workflows

**Status:** implemented, unit-verified (RED→GREEN), not committed — see
`docs/archive/allura/evidence/epic-27/story-27.5-workflows.md`
**Owner:** Brooks + Pike + Durham Munari/Rand
**Depends on:** 27.3
**Blocks:** 27.6

## Outcome

Operate Team RAM branch workflows (one branch per story/agent/review lane with sole-writer
ownership) and Durham concept branches (conservative, expressive, and crop-resilient, each
with reference, prompt, token, asset, accessibility, and provenance manifests), with
Munari/Rand review of branch evidence and only an approved diff becoming a proposal — adding
no broad new agent framework and no duplicate workflow-status ledger.

## User Story

As Team RAM or Durham, I need governed branch workflows for parallel experiments and
concept development so that each lane and concept is isolated, evidenced, and promotable
only through curator review.

## Acceptance Criteria

- [x] Team RAM: one branch per story/agent/review lane with sole-writer ownership.
- [x] Durham: conservative, expressive, and crop-resilient concept branches, each carrying
      reference, prompt, token, asset, accessibility, and provenance manifests.
- [x] Munari/Rand review branch evidence; only an approved diff becomes a curator proposal
      (via the 27.3 adapter).
- [x] No broad new agent framework is added and no duplicate workflow-status ledger is
      created (workflow status stays in Allura's existing ledgers).
- [x] Degraded, expired, rejected, quarantined, and rolled-back states remain explicit in
      these real lanes.

## Dependencies

- 27.3 (proposal adapter for promotion from these lanes).
- 27.2 (mechanics the lanes run on).

## Rollback

Workflow-only story: revert lane configuration and branch metadata; canonical memory is
untouched.
