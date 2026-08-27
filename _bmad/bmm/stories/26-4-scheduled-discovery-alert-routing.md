# Story 26.4 — Scheduled Discovery and Alert Routing

**Status:** In Progress — safe partial slice (Slice A); external advisory ingestion (Slice B) remains open
**Owner:** Hightower + Woz
**Depends on:** 26.3 (done)
**Blocks:** 26.7

## Outcome

A governed worker operates the scheduled advisory-polling and reconciliation lanes, routes alerts to the right tenants/workspaces, and maintains alert lifecycle, freshness, and health evidence. Internal security events remain a separately observable event-driven lane.

## Acceptance Criteria

- [ ] Governed worker schedule is configured with security-owner approval.
- [ ] Polling cadence, checkpoints, retry behavior, and source freshness expectations are security-owner-configured and auditable; the worker cannot alter its own schedule.
- [x] Alert lifecycle is defined: new, acknowledged, mitigated, resolved, stale.
- [x] Freshness/degraded states are visible — stale alerts are marked, not silently retained.
- [x] Alert routing is deduplicated and tenant-scoped.
- [ ] Scheduler health is monitored with audit evidence.
- [x] A newly matched high-severity exposure creates one deduplicated alert and a reviewable mitigation draft; it does not activate enforcement.
- [x] Scheduler execution can create alerts and simulated proposals only; package blocks, CI changes, containment, and policy activation remain denied without a separate approval receipt.
- [ ] Disabling the scheduler leaves the dashboard shell, core API/MCP controls, and other modules operational.

## Implementation Status — 2026-08-27

**Slice A implemented (this session):** given `ThreatAdvisory` objects (already Story
26.1/26.3-typed), the worker matches them against inventory (reusing Story 26.3's
in-memory `ExposureMatcher` unmodified), persists deduplicated tenant-scoped alerts
with a real, restricted-column lifecycle, and generates a simulated mitigation draft
(reusing Story 26.5's `DraftGenerator` unmodified) for new high/critical-severity
alerts. AC-3, AC-4, AC-5, AC-7, AC-8 are met and verified.

**AC-1/AC-2 status:** the security-owner approval is recorded
(`docs/governance/2026-08-27-story-26-4-security-owner-approval.md`), but "worker
schedule is configured" means an actual running scheduled job, which does not exist
yet — that depends on Slice B below.

**Slice B — deliberately not built this session:** actually fetching advisories from
the approved external sources (GitHub Security Advisories, OSV.dev, npm audit API) and
running the worker on the approved 6-hour cadence via a real scheduler (systemd timer,
matching the pattern in Stories 21.1-21.3). This is new security surface --
network calls to third-party services, untrusted response parsing, API auth/rate
limits -- with nothing like it anywhere in this codebase yet. It needs its own scoped
review, not to be built silently as part of Slice A. AC-1, AC-2, AC-6, AC-9 depend on
it and remain unchecked; AC-6's audit-evidence *mechanism* (heartbeat + BLOCKER events)
is built and tested, but "scheduler health monitored" over time needs a real running
schedule to monitor.

**A pre-existing bug found and NOT fixed here (out of this story's scope):** Story
26.4's `threat_alerts` migration needed a restricted-column UPDATE trigger, and the
closest precedent -- `pattern_proposals`' trigger, migration 31 -- uses
`jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))`. `jsonb - jsonb` is not a valid
PostgreSQL operator (confirmed directly: `ERROR: operator does not exist: jsonb -
jsonb`). This means migration 31's trigger would throw on any real UPDATE, and
`/api/genesis/proposals/approve` and `/reject` (`src/app/api/genesis/proposals/{approve,reject}/route.ts`)
both route through it via `pgUpdatePatternProposal` (`src/control-plane/target-resolver.ts`).
This module's own trigger (`app.guard_threat_alert_lifecycle_update`) uses explicit
per-column `IS DISTINCT FROM` comparisons instead and was verified working. The
pattern_proposals bug is flagged here for separate remediation, not fixed in this PR.

## Evidence

- Security-owner approval record: `docs/governance/2026-08-27-story-26-4-security-owner-approval.md`.
- Alert lifecycle state machine: `docker/postgres-init/42-threat-alerts.sql` (CHECK constraint + restricted-update trigger), `src/lib/threat-discovery/worker.ts` (`markAlertStale`).
- Freshness/degraded state tests: `src/lib/threat-discovery/__tests__/worker.test.ts` ("transitions a non-resolved alert to stale", "never overwrites a resolved alert").
- Dedup/tenant-scoping tests: same file ("does not create a duplicate row...", "processes the same exposure across two advisories into exactly one alert", "does not leak alerts across tenants").
- Alert + draft composition test: same file ("creates one alert and a simulated draft for a high-severity match (AC-7)", "does not generate a draft for a low-severity match").
- Scheduler health mechanism (not yet running on a schedule): `runDiscoveryCycle`'s `THREAT_DISCOVERY_HEARTBEAT` / `BLOCKER` event emission, tested in "counts a per-advisory match failure without aborting the whole cycle".
- Migration 42 validated against a disposable PostgreSQL 16 container (destroyed after): RLS tenant isolation, dedup UNIQUE constraint, restricted-column UPDATE trigger, and DELETE rejection all independently confirmed with real INSERT/UPDATE/DELETE statements, not just schema inspection.

## Completion Notes

- agent: Brooks
- date: 2026-08-27
- files changed: `docker/postgres-init/42-threat-alerts.sql` (new), `src/lib/threat-discovery/{schemas,types,worker}.ts` (new), `src/lib/threat-discovery/__tests__/worker.test.ts` (new, 10 tests), `src/lib/db/tenant-table-inventory.ts`, `vitest.config.unit.ts` (also registered Story 26.2/26.3's tests, previously missing from the CI unit lane -- found while wiring this story's own tests in), `docs/allura/DATA-DICTIONARY.md`, `docs/allura/REQUIREMENTS-MATRIX.md`
- evidence: `bun vitest run src/lib/threat-discovery` -> 10/10 passed, exit 0; `bun run test:unit` -> 1972/1972 passed (was 1930; +42 from wiring in 26.2/26.3/26.4), exit 0; `bun run typecheck` -> exit 0; migration 42 functionally verified against a disposable PostgreSQL 16 container
- remaining gaps: AC-1, AC-2, AC-6 (fully), AC-9 all depend on Slice B (real external advisory ingestion + a running scheduler), explicitly out of this session's scope. The pattern_proposals `jsonb - jsonb` bug is flagged, not fixed, here.

## Rollback

Disable the scheduler. Alerts already created remain; no new alerts are generated.
