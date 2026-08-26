# Story 26.6 — Containment Connectors and Response Receipts

**Status:** Planned
**Owner:** Hightower + Brooks + Knuth
**Depends on:** 26.5, role-model reconciliation
**Blocks:** 26.7

## Outcome

Feature-flagged, propose-only connectors for approved response systems with explicit authorization for token revocation, workspace locks, and endpoint actions.

## Acceptance Criteria

- [ ] Connectors are feature-flagged and independently disableable.
- [ ] Connectors are propose-only — they cannot execute actions without explicit authorization.
- [ ] Explicit authorization is required for: token revocation, workspace locks, endpoint actions.
- [ ] Token revocation, workspace locking, and connector actions are denied without the required role, policy, approval, and receipt.
- [ ] Every action produces an immutable receipt with actor, action, rationale, policy reference, authorization chain, and timestamp.
- [ ] Role-model reconciliation is complete before response authorization is exposed.

## Evidence

- Connector manifest with feature flags.
- Authorization gate tests.
- Receipt schema validation.
- Role-model reconciliation evidence.

## Rollback

Disable connectors. Policy drafts and alerts remain; no response actions can be initiated.