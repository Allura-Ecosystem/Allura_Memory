# Cost Ledger Deferral

Date: 2026-05-17  
Scope: Phase 0 cost ledger activation  
Authority: Brooks Phase 0 scope control

## Decision

Cost ledger activation is deferred out of Phase 0.

## Reason

Phase 0 is a foundation-lock lane. The remaining Phase 0 risk is evidence and
scope closure, not token/model cost instrumentation. Adding cost ledger
instrumentation now would expand implementation scope after the finish plan
explicitly blocked new work until Phase 0 closes.

## Evidence

- `docs/goal.md` requires cost ledger to be activated or formally deferred.
- `docs/plans/allura-memory-finish-plan.md` identifies cost ledger as a
  remaining build gap, not a prerequisite for memory safety.
- No current repo-local implementation evidence for an active token/model cost
  ledger was found during the 2026-05-17 reconciliation pass.

## Follow-Up

Track cost ledger activation in Phase 3 Governance And Audit Hardening, where
the roadmap already includes:

```text
Activate or formally defer cost ledger.
```

## Limits

This deferral does not waive audit logging, Brain receipts, Notion evidence, or
RuVix receipts for Phase 0 closure work.
