# CARD-2.4-E Static Review Substitute

Date: 2026-05-17  
Scope: B09 / CARD-2.4-E approval audit guard  
Authority: Brooks-approved static review substitute. No real Pike or Fowler runtime agent was spawned.

## Review Target

- `src/lib/memory/knowledge-promotion.ts`
- `src/app/api/curator/approve/route.ts`
- `scripts/batch-approve-proposals.ts`
- `scripts/e2e-validation-gate.ts`
- `src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `artifacts/card-2-4-e-approval-guard-evidence-2026-05-17.md`

## Pike Lens: Interface And Simplicity

Result: pass with noted residual legacy warnings.

- The promotion contract is now explicit: graph writes require a matching `memory_promotion_approved` event for `proposal_id` and `group_id`.
- The guard is centralized in `requireApprovalBeforePromotion`, avoiding duplicated SQL checks at each promotion call site.
- `ApprovalQueueItem.proposal_id` makes the canonical proposal identity explicit instead of overloading Notion page ID or trace ID.
- Approval entrypoints now call `logApprovalEvent` before `createInsight`, so the runtime order matches the governance invariant.
- Static policy tests assert guard order and approval-entrypoint order, reducing regression risk.

Residual interface risk:

- `POST /api/curator/approve` still emits legacy `proposal_approved`/`proposal_rejected` events for compatibility. This is acceptable because the canonical approval event is now added before graph writes.

## Fowler Lens: Maintainability And Reversibility

Result: pass with no blocking maintainability findings.

- Change is small and reversible: it adds guard calls, preserves existing legacy events, and does not rewrite the promotion model.
- Tests are focused and cheap: `approval-audit.test.ts` verifies behavior; `hitl-promotion-lock-policy.test.ts` verifies integration order.
- No broad refactor was introduced.
- The E2E gate was updated to validate the canonical event name instead of maintaining stale evidence.

Residual maintainability risk:

- ESLint reports pre-existing warnings in `src/app/api/curator/approve/route.ts` (`DEFAULT_GROUP_ID`, two `any` casts) and script ignore warnings for `scripts/*.ts`. These are not introduced by the B09 guard fix and do not block this card.

## Validation

```bash
bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts
```

Result: 21 pass, 0 fail.

```bash
bun run typecheck
```

Result: pass.

```bash
bunx eslint src/lib/memory/knowledge-promotion.ts src/lib/memory/__tests__/hitl-promotion-lock-policy.test.ts src/app/api/curator/approve/route.ts scripts/batch-approve-proposals.ts scripts/e2e-validation-gate.ts
```

Result: 0 errors, 5 warnings. Remaining warnings are pre-existing route warnings and script ignore warnings.

## Decision

Brooks accepts this as the static-review substitute for B09. CARD-2.4-E has enough local evidence to close in the repo ledger.

This does not close Phase 0. Other blockers remain open.
