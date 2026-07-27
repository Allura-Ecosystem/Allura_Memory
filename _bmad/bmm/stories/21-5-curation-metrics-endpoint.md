# Story 21.5 — Curation Metrics Endpoint

**Status:** ready-for-dev
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 21

## User Story

As an agent or human checking brain health, I need a single API endpoint that returns curation status, so that I can verify the brain is self-curating without running multiple queries.

## Context

- The watchdog creates proposals, the content-aware curator promotes them, the drift audit checks quality
- No single endpoint summarizes all of this
- Current health endpoints: `/api/health/ready`, `/api/health/live`, `/api/health/metrics`
- No `/api/curator/metrics` endpoint exists

## Acceptance Criteria

- [ ] AC-1: `GET /api/curator/metrics` returns a JSON object with: `pending_proposals` (count), `oldest_proposal_age_hours`, `auto_promotion_rate_24h` (percentage), `rejection_rate_24h` (percentage), `drift_audit_status` (pass/fail/unknown), `watchdog_health` (running/stopped)
- [ ] AC-2: The endpoint requires `group_id` query parameter — returns metrics scoped to that tenant only
- [ ] AC-3: The endpoint is read-only — no side effects
- [ ] AC-4: Response time < 500ms (aggregated queries, not heavy computation)
- [ ] AC-5: Unit tests verify: correct metrics calculated, group_id enforced, empty tenant returns zeros

## Tasks

1. Create `src/app/api/curator/metrics/route.ts`
2. Query `canonical_proposals` for pending count and age
3. Query events for promotion/rejection rates in last 24h
4. Check watchdog health (last heartbeat event)
5. Check drift audit status (last audit event)
6. Create `src/__tests__/curator-metrics.test.ts`
7. Run `bun run typecheck && bun test`

## File List

- `src/app/api/curator/metrics/route.ts` (NEW)
- `src/__tests__/curator-metrics.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |