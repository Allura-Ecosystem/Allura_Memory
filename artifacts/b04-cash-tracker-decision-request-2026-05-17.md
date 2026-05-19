# B04 Cash Tracker Decision Request

Date: 2026-05-17
Project: allura-memory
Agent: brooks-architect
Group ID: allura-system

## Decision Needed

B04 is the only remaining Phase 0 blocker in `docs/goal.md`.

Captain/source owner must choose one valid closure path:

1. **In scope:** populate or link the actual canonical cash tracker source in
   Notion.
2. **Out of scope:** explicitly mark cash tracker out of scope for Phase 0.

## Current Evidence

- Canonical placeholder/source contract:
  `35d1d9be-65b3-810e-b080-eddc7e036aee`
- Related Notion work item:
  `35d1d9be-65b3-81cc-bbf8-cf73b7c81d5a`
- Current source state:
  `SOURCE MISSING / NOT YET POPULATED IN NOTION`
- No-claims source evidence:
  `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md`
- Completion audit:
  `artifacts/docs-goal-completion-audit-2026-05-17.md`
- Notion comment-thread verification:
  B04 work item, cash tracker source contract, and finish plan comments were
  checked; no hidden Captain/source-owner decision was found. Brain receipt:
  `3f09163c-c897-4c5b-9d80-e8d3a03d5db7`.
- Updated decision packet was re-attached to the B04 Notion work item:
  `3631d9be-65b3-81a1-aa19-001d372cfe83`.
- Updated decision packet was mirrored to the Notion finish plan:
  `3631d9be-65b3-8101-9f91-001dc63ea001`.
- Finish-plan mirror event was logged to Allura Brain:
  `47b9b616-ffcc-4cd8-a9ab-404e774881de`.

## Recommended Closure If Cash Tracker Is Not Needed For Phase 0

Use this exact decision language:

```text
Captain decision: Cash tracker is out of scope for Allura Memory Phase 0.
The canonical placeholder/source contract remains the future source location,
but Phase 0 may close because current source evidence verifies no product
surface fabricates cash tracker values while the source is missing.
Phase 1 may not introduce cash tracker claims until the real source is
populated or linked in Notion.
```

## Closure Steps After Decision

If the decision is **out of scope**:

1. Mark B04 `WAIVED` or `DEFERRED` in `blocking_list.md`.
2. Update `docs/goal.md` cash tracker row.
3. Update `docs/plans/phase0-evidence-index.md`.
4. Update `docs/plans/allura-memory-finish-plan.md`.
5. Add decision comment to the B04 Notion work item and finish plan.
6. Add Allura Brain receipt.
7. Record final Phase 0 closeout in Notion and Allura Brain.

If the decision is **in scope**:

1. Populate or link the actual cash tracker source in Notion.
2. Update the B04 Notion work item from `Blocked`.
3. Verify dashboard/work-board surfaces still avoid fabricated financial data.
4. Update the same repo ledgers and Brain receipts.
5. Record final Phase 0 closeout.

## Current Verdict

NO-GO until one of the two closure paths is chosen by Captain/source owner.

## Audit Receipts

- B04 Notion work item comment: `3631d9be-65b3-810f-b079-001db1fbc5ad`
- Cash tracker source-contract Notion comment:
  `3631d9be-65b3-8126-b8eb-001d518455ae`
- Finish-plan Notion comment: `3631d9be-65b3-8173-80cc-001d43715a67`
- Allura Brain receipt: `aaab1b53-6d1c-4f55-9ff1-85a7bd1a568d`
- Comment-thread verification Brain receipt:
  `3f09163c-c897-4c5b-9d80-e8d3a03d5db7`
- B04 decision-packet update Notion comment:
  `3631d9be-65b3-81a1-aa19-001d372cfe83`
- Finish-plan mirror comment:
  `3631d9be-65b3-8101-9f91-001dc63ea001`
- Finish-plan mirror Brain receipt:
  `47b9b616-ffcc-4cd8-a9ab-404e774881de`
