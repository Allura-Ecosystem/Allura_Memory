# Story M-1.2 — Define Co-Work Plugin Contract

**Status:** Planned
**Owner:** Brooks + Jobs + Pike
**Depends on:** M-1.1
**Blocks:** M-1.4, M-1.5

## Outcome

The Mortgage Approval Gate co-work plugin contract is documented and approved: `intake → evidence/OCR → policy evaluation → human review → immutable receipt`.

## Acceptance Criteria

- [ ] Contract defines the five-stage workflow with typed inputs and outputs for each stage.
- [ ] Intake: source identity, workspace, classification, document/OCR state.
- [ ] Evidence: governed evidence/provenance, freshness, degraded state.
- [ ] Policy: server-derived scope, no client self-assertion.
- [ ] Review: human rationale required, server validation authoritative.
- [ ] Receipt: actor, action, rationale, policy, evidence, timestamp, sync state.
- [ ] Contract is reviewed and approved by Brooks and Jobs.
- [ ] No Salesforce dependency in the contract.

## Evidence

- Contract document with typed schemas.
- Brooks + Jobs approval.

## Rollback

Contract is documentation-only. Revert the doc. No runtime behavior changes.