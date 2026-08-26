# Story 26.5 — Governed Mitigation Policy Drafts

**Status:** Planned
**Owner:** Brooks + Knuth + Woz
**Depends on:** 26.3, Epic 24 mutation-boundary remediation
**Blocks:** 26.6, 26.7

## Outcome

A verified exposure maps to a versioned mitigation template, producing a reviewable policy draft with dry-run results, scope explanation, and an approval-required receipt.

## Acceptance Criteria

- [ ] Verified exposure maps to a versioned mitigation template.
- [ ] Policy draft is reviewable — not active policy.
- [ ] Dry-run result shows what would happen without executing.
- [ ] Scope explanation is included: what systems, packages, or workflows are affected.
- [ ] Approval-required receipt is generated: actor, action, rationale, policy reference, evidence references, timestamp.
- [ ] Policy activation, enforcement changes, schedule changes, and external response actions use the canonical Allura approval and receipt path.
- [ ] A policy draft is not active policy — activation requires explicit approval.

## Evidence

- Mitigation template library.
- Policy draft generation tests.
- Dry-run result tests.
- Receipt schema validation.

## Rollback

Policy drafts are read-only proposals. Disabling draft generation does not affect active policy.