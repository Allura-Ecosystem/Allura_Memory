# Story 26.1 — Boundary, Ownership, and Threat-Source Trust Contract

**Status:** Done — documentation contract merged `6e7e9efd` ("docs: define Bumblebee V1 trust contract")
**Owner:** Brooks + Jobs + Knuth
**Depends on:** Epic 24 scope/audit foundations
**Blocks:** 26.2, 26.3, 26.4, 26.5, 26.6, 26.7

## Outcome

Establish the trust boundary, evidence schema, source allowlist, retention rules, roles, Bumblebee naming boundary, and V1 authority contract before any ingestion or matching work begins.

## Acceptance Criteria

- [x] Advisory provenance schema is defined: source, publication time, fetch time, trust state, freshness rules, and retention policy.
- [x] Evidence schema is defined for supply-chain threats: affected artifact, match type, confidence, severity, and supporting indicators.
- [x] Source allowlist is defined with verification rules for each advisory feed.
- [x] Trust/freshness rules are defined: stale feed handling, degraded state, and fail-closed behavior.
- [x] Retention policy is defined for advisories, alerts, and evidence.
- [x] Roles are defined: who can add sources, who can review alerts, who can approve mitigation drafts.
- [x] V1 authority is defined and testable: verified evidence may create an alert and simulated mitigation proposal; it cannot activate enforcement or change a worker schedule.
- [x] The three intake lanes are defined with source ownership and freshness expectations: approved internal events, allowlisted scheduled advisory polling, and inventory reconciliation.
- [x] Bumblebee naming boundary is reconciled: Guard and Threat Watch have unambiguous contracts.
- [x] No ingestion, scanning, or policy mutation is authorized by this story.

## Implementation Status — 2026-08-27

This story was always documentation-only by design (see Rollback below), and its deliverable — the trust/authority contract — merged 2026-08-26 as `6e7e9efd`, one commit before 26.2/26.3 were built. The story file's checkboxes were simply never updated to reflect it, which read as "26.2/26.3 shipped ahead of their declared dependency." They did not: 26.1's docs landed first. Verified this session against the actual diff: `docs/allura/DESIGN-ALLURA.md` (V1 authority/role table, AD-57), `docs/allura/DATA-DICTIONARY.md` (`ThreatAdvisoryEvidence`, `ThreatExposureAlert`, `SimulatedMitigationProposal` schemas), `docs/allura/RISKS-AND-DECISIONS.md` (AD-57), `docs/allura/REQUIREMENTS-MATRIX.md` (REQ-BMB-001–007), `docs/allura/SOLUTION-ARCHITECTURE.md` (Bumblebee topology), and the epic planning doc (V1 Authority Contract section). No code, route, or migration is part of this commit, consistent with AC-10 and the Rollback note.

## Evidence

- Trust contract document with schema definitions: `docs/allura/DATA-DICTIONARY.md#planned-story-261-bumblebee-threat-intelligence-contracts`.
- Source allowlist with verification rules: `docs/allura/DESIGN-ALLURA.md` (Planned Bumblebee V1 trust and authority contract section).
- Roles and retention policy: `docs/allura/DESIGN-ALLURA.md` authority table; `retention_disposition` field in `ThreatAdvisoryEvidence`.
- Bumblebee naming boundary reconciliation: Guard (inventory reconciliation) vs. Threat Watch (advisory intake/correlation), same section.
- V1 authority and intake-lane contract: `docs/allura/RISKS-AND-DECISIONS.md` AD-57; `docs/allura/REQUIREMENTS-MATRIX.md` REQ-BMB-001–007.

## Completion Notes

- agent: Brooks (documentation/verification pass; contract authored by Brooks + Jobs + Knuth, commit `6e7e9efd`)
- date: 2026-08-27
- files changed: `docs/allura/{BLUEPRINT,DATA-DICTIONARY,DESIGN-ALLURA,REQUIREMENTS-MATRIX,RISKS-AND-DECISIONS,SOLUTION-ARCHITECTURE}.md`, `_bmad/bmm/planning/epic-26-bumblebee-supply-chain-threat-intelligence.md` (all merged 2026-08-26 as `6e7e9efd`); this session only corrected the stale story-file status/checkboxes.
- evidence: `git show --stat 6e7e9efd` confirms zero `src/` files touched — documentation-only, matching AC-10 and the Rollback note; `bun run typecheck` exit 0 on current tree.
- remaining gaps: none for this story's own (documentation-contract) scope. Two items are explicitly deferred to later stories, not this one: a populated allowlist of actual advisory feed URLs (26.4 configures real sources) and a fully elaborated standalone retention-schedule document (the `retention_disposition` field defines the mechanism; specific durations are a security-owner policy call, not a schema question).

## Rollback

Documentation-only: revert the contract commit. No runtime behavior changes.
