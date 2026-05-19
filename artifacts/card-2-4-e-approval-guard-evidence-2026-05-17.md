# CARD-2.4-E Approval Guard Evidence

Date: 2026-05-17  
Scope: B09 / CARD-2.4-E targeted role/SoD/audit tests and promotion guard proof  
Reviewer mode: Brooks-led Pike/Fowler-style local review; no real Pike or Fowler runtime agent was spawned.

## Objective

Prove that knowledge promotion cannot write to Neo4j unless a canonical approval audit event already exists for the proposal and tenant.

## Findings

| Finding | Severity | Status | Evidence |
| --- | --- | --- | --- |
| `requireApprovalBeforePromotion` was tested but not integrated into real promotion flows. | High | Fixed | `processApprovedInsights` and `promoteSingleInsight` now call `requireApprovalBeforePromotion` before `promoteToNeo4j`. |
| `POST /api/curator/approve` wrote to Neo4j before logging a canonical approval audit event. | High | Fixed | The route now calls `logApprovalEvent` before `createInsight`. |
| `scripts/batch-approve-proposals.ts` wrote to Neo4j before logging a canonical approval audit event. | High | Fixed | The script now calls `logApprovalEvent` before `createInsight`. |
| E2E gate AC-05 checked legacy `proposal_approved` instead of canonical `memory_promotion_approved`. | Medium | Fixed | `scripts/e2e-validation-gate.ts` now writes and checks `memory_promotion_approved`. |

## Code Evidence

- `src/lib/memory/knowledge-promotion.ts` imports `requireApprovalBeforePromotion`.
- `processApprovedInsights` calls `requireApprovalBeforePromotion(item.proposal_id, item.group_id)` before `promoteToNeo4j`.
- `promoteSingleInsight` calls `requireApprovalBeforePromotion(item.proposal_id, item.group_id)` before `promoteToNeo4j`.
- `src/app/api/curator/approve/route.ts` calls `logApprovalEvent` before `createInsight`.
- `scripts/batch-approve-proposals.ts` calls `logApprovalEvent` before `createInsight`.
- `src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts` statically verifies guard order.

## Validation

```bash
bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts
```

Result: 21 pass, 0 fail.

```bash
bun run typecheck
```

Result: pass.

## RuVix Receipt

- mutate: added canonical approval guards before Neo4j promotion writes and restored missing `docs/goal.md`.
- attest: this artifact, local diffs, test output, typecheck output, and Allura Brain receipt.
- verify: focused Bun tests and TypeScript typecheck passed.
- isolate: `group_id = allura-system`; repo-local files only.
- sandbox: no destructive commands; no board status mutation.
- audit: Allura Brain memories `f46103ff-acb6-4f7e-9051-00dacea5eec5` and `cf5a8816-aaa2-4a52-a77c-bb72d357a51c`.
- Notion: evidence attached to CARD-2.4-E as comment `3631d9be-65b3-817c-8101-001d266fa32e`.

## Remaining Gate

B09 is not fully closed until Pike/Fowler review is either completed by real runtime agents or formally accepted by Brooks as a local static-review substitute.
