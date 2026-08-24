# Story M-1.5 — Allura Brain Integration

**Status:** Planned
**Owner:** Brooks + Knuth + Woz
**Depends on:** M-1.2
**Blocks:** M-1.6

## Outcome

Mortagate flows `group_id`, evidence, and receipts through Allura Brain MCP/API — no direct database access, no self-asserted authority.

## Acceptance Criteria

- [ ] `group_id` is derived from the authenticated Allura principal, not self-asserted.
- [ ] Evidence is stored and retrieved through Allura Brain `memory_search` and `memory_add`.
- [ ] Receipts are issued through the Allura atomic decision path.
- [ ] No direct PostgreSQL or Neo4j access in Mortagate code.
- [ ] Cross-tenant access is denied and logged.
- [ ] Brain-unavailable degrades gracefully — no hanging or crashing.

## Evidence

- Brain integration tests.
- Cross-tenant denial tests.
- Degraded state tests.

## Rollback

Mortagate uses direct database access. Tenant isolation is not enforced. Security regression.