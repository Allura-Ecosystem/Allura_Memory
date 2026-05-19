# docs/goal.md Systematic Debugging Note

Date: 2026-05-17
Project: allura-memory
Agent: brooks-architect
Group ID: allura-system

## Issue

The active `docs/goal.md` goal kept receiving continuation prompts after the
completion audit had already reached a stable NO-GO state.

Superseded status: B04 is now recorded as out of scope for Phase 0 as of
2026-05-17, and this artifact is retained for historical context only.

## Phase 0: Memory Hydration

Allura Brain searches were run for:

- `debug docs/goal.md repeated completion loop B04 cash tracker update_goal autonomy limit`
- `Root Cause B04 cash tracker Phase 0 NO-GO repeated audit loop Captain source-owner decision`
- `pattern completion audit blocked external human decision update_goal should not be called`

Result:

- No directly reusable approved memory was found for this exact loop.
- Related memory reinforced the standing governance pattern: human approval is
  required before promotion/activation; do not auto-approve.

## Phase 1: Root Cause

Root cause:

The system is not blocked by missing local evidence anymore. It is blocked by
an external Captain/source-owner decision for B04 cash tracker scope.

The repeated work happened because:

- `docs/goal.md` correctly remains incomplete while B04 is `OPEN`.
- Developer continuation prompts kept asking for the next concrete action.
- The only remaining true closure action is not available to Codex without a
  human/source-owner decision.
- Codex kept finding smaller evidence-synchronization tasks instead of stopping
  at the external dependency.

## Confirmed State

- `docs/goal.md` says Phase 0 is NO-GO.
- `blocking_list.md` has `B04 | OPEN`.
- `docs/plans/phase0-evidence-index.md` has `B04 | OPEN`.
- `docs/plans/allura-memory-finish-plan.md` has
  `P0-09 / Cash tracker | OPEN`.
- `artifacts/phase0-final-closeout-template-2026-05-17.md` says it is not valid
  while B04 remains open.

## Hypothesis

If the remaining blocker is marked as an external human decision and the
autonomy limit is explicit in `docs/goal.md`, then further autonomous closure
attempts should stop until the Captain/source-owner decision arrives.

## Test Result

`docs/goal.md` now includes an explicit autonomy limit:

- Do not perform more Phase 0 closeout attempts, Phase 1 start work, or
  `update_goal` completion until the B04 Captain/source-owner decision is
  recorded.
- Additional audits may update evidence receipts, but they cannot close B04
  without that decision.

## Required Human Input

Choose one:

1. Populate or link the actual canonical cash tracker source in Notion.
2. Explicitly mark cash tracker out of scope for Allura Memory Phase 0.

Until then, `update_goal` must not be called.

## Persistence

- Allura Brain receipt:
  `d8eb3ee5-f4f7-4c6b-886e-c3149fc64ff8`
