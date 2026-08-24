# Story A-1.2 — Hook Governance — Preflight Validation

**Status:** Planned
**Owner:** Brooks + Fowler
**Depends on:** A-1.1
**Blocks:** —

## Outcome

Governance preflight runs before agent dispatch and blocks on failure — no agent executes without passing the governance gate.

## Acceptance Criteria

- [ ] `governance-preflight.py` runs before every agent dispatch.
- [ ] Preflight checks: group_id present, required skills loaded, validation command defined.
- [ ] Preflight blocks dispatch on failure with a clear error message.
- [ ] Preflight is tested with passing and failing conditions.
- [ ] Preflight does not add more than 100ms to dispatch latency.

## Evidence

- Preflight passing condition tests.
- Preflight blocking condition tests.
- Latency benchmark.

## Rollback

Agents dispatch without preflight. Governance violations are possible.