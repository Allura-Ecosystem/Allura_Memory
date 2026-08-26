# Story 26.5 — Governed Mitigation Policy Drafts

**Status:** In Progress — safe partial slice; canonical approval/receipt integration remains open
**Owner:** Brooks + Knuth + Woz
**Depends on:** 26.3, Epic 24 mutation-boundary remediation
**Blocks:** 26.6, 26.7

## Outcome

A verified exposure maps to a versioned mitigation template, producing a reviewable simulated policy draft with dry-run results, scope explanation, rollback evidence, and an approval-required receipt.

## Acceptance Criteria

- [ ] Verified exposure maps to a versioned mitigation template.
- [ ] Policy draft is reviewable — not active policy.
- [ ] Template parameters are derived from verified exposure evidence; untrusted advisory text cannot introduce an executable instruction or broaden the proposed scope.
- [ ] Dry-run result shows what would happen without executing.
- [ ] Scope explanation is included: what systems, packages, or workflows are affected.
- [ ] Approval-required receipt is generated: actor, action, rationale, policy reference, evidence references, timestamp.
- [ ] Policy activation, enforcement changes, schedule changes, and external response actions use the canonical Allura approval and receipt path.
- [ ] A policy draft is not active policy — activation requires explicit approval.
- [ ] Draft generation does not execute package blocks, CI changes, containment, or connector actions.

## Implementation Status — 2026-08-26

- **Safe partial slice implemented and independently re-reviewed PASS:** deterministic in-memory draft generation, strict typed template parameters, non-empty evidence references, tenant/workspace equality checks, dry-run/scope/rollback text, and a local simulation record that cannot approve or activate a policy.
- **Completed AC intent:** 1–5, 8–9.
- **Open / not represented as complete:** AC 6–7 require a canonical, durable governed mutation workflow with an authenticated principal, an approval reference, immutable `GovernanceReceipt`, and read-back. The local `MitigationDraftRecord` is deliberately not a receipt or approval.
- **Verification:** Team RAM/Pike final PASS; unit lane 99 files / 1,924 tests passed (160 skipped), focused mitigation suite 18/18, full typecheck passed.

## Evidence

- Mitigation template library.
- Policy draft generation tests.
- Dry-run result tests.
- Receipt schema validation.

## Rollback

Policy drafts are read-only proposals. Disabling draft generation does not affect active policy.
