# Story 26.3 — Exposure Matcher and Current-Threat Packs

**Status:** Planned
**Owner:** Woz + Knuth + Bellard
**Depends on:** 26.1, 26.2
**Blocks:** 26.4, 26.5

## Outcome

Match current threat advisories against the supply-chain inventory and produce deduplicated, evidence-backed exposure alerts.

## Acceptance Criteria

- [ ] Matching is exact: package, version, hash, publisher, workflow reference, and indicators.
- [ ] Fixtures cover: compromised dependencies, malicious install hooks, workflow/action drift, credential-exposure indicators, and AI tool/plugin compromise.
- [ ] Alerts are deduplicated — one alert per unique exposure, not one per advisory match.
- [ ] Each alert identifies: source, publication and fetch time, trust state, affected tenant/workspace, matched artifact, and supporting evidence.
- [ ] A malicious or stale feed cannot activate a policy, execute code, or cross tenant boundaries.
- [ ] Matching is read-only — no mutations, no policy activation.

## Evidence

- Matching engine tests with all fixture categories.
- Deduplication tests.
- Tenant isolation tests.
- Stale/malicious feed fail-closed tests.

## Rollback

Disable the matcher. The inventory remains available; no alerts are generated.