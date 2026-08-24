# Story P-2.3 — Connection Health and Retry — Degraded State Handling

**Status:** Planned
**Owner:** Woz + Bellard
**Depends on:** P-2.1
**Blocks:** —

## Outcome

When Allura Brain is down, the connector detects it, retries with backoff, and surfaces a degraded state to the subagent instead of hanging or crashing.

## Acceptance Criteria

- [ ] Brain-down is detected within a configurable timeout.
- [ ] Retry uses exponential backoff with a maximum retry count.
- [ ] After max retries, the connector returns a typed degraded-state response.
- [ ] The subagent receives a clear message: "Allura Brain unavailable — proceeding without memory."
- [ ] Degraded state is logged for observability.

## Evidence

- Brain-down detection tests.
- Retry backoff tests.
- Degraded state response tests.

## Rollback

Connector hangs or crashes when Brain is down. Subagents fail silently.