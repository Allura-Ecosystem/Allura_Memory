# Story 25.4 — Evidence-First Proposal Queue

**Status:** Planned / read-only implementation eligible after 25.2–25.3
**Owner:** Woz + Pike
**Depends on:** 25.2, 25.3
**Blocks:** 25.5

## Outcome

A reviewer can inspect tenant-scoped proposals and provenance without confusion between missing data, failed data, and unauthorized access.

## Acceptance Criteria

- [ ] Queue rows show summary, score/tier, requester, age, trace reference, evidence availability, and status.
- [ ] Proposal detail exposes governed evidence/provenance, policy context, and read-only receipt/history when present.
- [ ] Evidence missing is explicit and blocks approval eligibility; network failure is never rendered as an empty queue.
- [ ] Viewer role is read-only; curator/admin action affordances reflect server-provided `allowedActions` but do not mutate before 25.5.
- [ ] Primary labels and instructions are understandable at about a sixth-grade reading level; technical identifiers and policy terms use progressive disclosure.
- [ ] Major desktop queue/detail and context/inspector splits use a 38.2% / 61.8% golden-ratio target, then stack in reading order on smaller screens.
- [ ] A Memory Map shows source → learning → review → shared-knowledge lineage with labeled connections and an equivalent text description; it is explicitly illustrative until backed by real governed relationships.
- [ ] Queue and detail views support keyboard navigation, named controls, loading skeletons, and error recovery.
- [ ] API response freshness and degraded status are visible near the affected data.

## Evidence

- Component tests for every state.
- Route tests for read-only role behavior and missing provenance.
- Browser test that verifies evidence is visible before action affordance.

## Rollback

Disable queue route or keep read-only; no promotion data changes are made.
