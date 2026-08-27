# Story 26.4 — Scheduled Discovery and Alert Routing

**Status:** Planned — unblocked; security-owner approval recorded, no implementation exists yet
**Owner:** Hightower + Woz
**Depends on:** 26.3 (done)
**Blocks:** 26.7

## Outcome

A governed worker operates the scheduled advisory-polling and reconciliation lanes, routes alerts to the right tenants/workspaces, and maintains alert lifecycle, freshness, and health evidence. Internal security events remain a separately observable event-driven lane.

## Acceptance Criteria

- [ ] Governed worker schedule is configured with security-owner approval.
- [ ] Polling cadence, checkpoints, retry behavior, and source freshness expectations are security-owner-configured and auditable; the worker cannot alter its own schedule.
- [ ] Alert lifecycle is defined: new, acknowledged, mitigated, resolved, stale.
- [ ] Freshness/degraded states are visible — stale alerts are marked, not silently retained.
- [ ] Alert routing is deduplicated and tenant-scoped.
- [ ] Scheduler health is monitored with audit evidence.
- [ ] A newly matched high-severity exposure creates one deduplicated alert and a reviewable mitigation draft; it does not activate enforcement.
- [ ] Scheduler execution can create alerts and simulated proposals only; package blocks, CI changes, containment, and policy activation remain denied without a separate approval receipt.
- [ ] Disabling the scheduler leaves the dashboard shell, core API/MCP controls, and other modules operational.

## Evidence

- Scheduler configuration with security-owner approval record.
- Alert lifecycle state machine tests.
- Freshness/degraded state tests.
- Scheduler health and audit evidence.

## Implementation Status — 2026-08-27

The external blocker for this story was the security-owner approval, not code. That
approval is now recorded: `docs/governance/2026-08-27-story-26-4-security-owner-approval.md`,
approved by Sabir Asheed (ronin704) on 2026-08-27, covering advisory source allowlist
(GitHub Security Advisories, OSV.dev, npm audit API), 6-hour polling cadence,
stale/degraded thresholds (12h/36h), and indefinite retention.

**No AC box is checked** — the approval covers only the *configuration decision* AC-1
and AC-2 require; none of the worker, alert lifecycle, routing, or health-monitoring
code exists yet. This story is unblocked and ready for implementation, not started.

## Rollback

Disable the scheduler. Alerts already created remain; no new alerts are generated.
