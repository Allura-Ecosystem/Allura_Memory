# Story 26.1 — Boundary, Ownership, and Threat-Source Trust Contract

**Status:** Planned
**Owner:** Brooks + Jobs + Knuth
**Depends on:** Epic 24 scope/audit foundations
**Blocks:** 26.2, 26.3, 26.4, 26.5, 26.6, 26.7

## Outcome

Establish the trust boundary, evidence schema, source allowlist, retention rules, roles, and the Bumblebee naming boundary before any ingestion or matching work begins.

## Acceptance Criteria

- [ ] Advisory provenance schema is defined: source, publication time, fetch time, trust state, freshness rules, and retention policy.
- [ ] Evidence schema is defined for supply-chain threats: affected artifact, match type, confidence, severity, and supporting indicators.
- [ ] Source allowlist is defined with verification rules for each advisory feed.
- [ ] Trust/freshness rules are defined: stale feed handling, degraded state, and fail-closed behavior.
- [ ] Retention policy is defined for advisories, alerts, and evidence.
- [ ] Roles are defined: who can add sources, who can review alerts, who can approve mitigation drafts.
- [ ] Bumblebee naming boundary is reconciled: Guard and Threat Watch have unambiguous contracts.
- [ ] No ingestion, scanning, or policy mutation is authorized by this story.

## Evidence

- Trust contract document with schema definitions.
- Source allowlist with verification rules.
- Roles and retention policy document.
- Bumblebee naming boundary reconciliation.

## Rollback

Documentation-only: revert the contract commit. No runtime behavior changes.