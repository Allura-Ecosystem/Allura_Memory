# Story 25.3 — Curator Read Contract and Tenant Hardening

**Status:** Blocked
**Owner:** Troy + Knuth + Pike
**Depends on:** 25.1, 25.2a, 25.2b, 24.11
**Blocks:** 25.4–25.7

## Outcome

A governed read API derives tenant/workspace scope from the authenticated principal and returns typed proposal, evidence, metric, error, and freshness data to the browser.

## Acceptance Criteria

- [ ] The service derives `group_id` and workspace scope from the authenticated principal; compatibility query values can narrow a list only when they match, otherwise return `403`.
- [ ] Missing identity returns `401`; insufficient role returns `403`; malformed status/pagination returns `400`; unknown proposal returns `404`.
- [ ] Proposals and metrics perform both route-level and service-level authorization.
- [ ] `ReviewItem`, `EvidenceSummary`, `ReviewState`, `ApiError`, `DecisionReceipt`, `RetrievalPlan`, `SubgraphQuery`, and `SubgraphResponse` are shared typed contracts.
- [ ] Subgraph traversal resolves an authorized relational anchor before semantic expansion, enforces deterministic ordering and signed opaque continuation, and returns evidence-bound nodes/edges with explicit complete/partial/empty/denied/degraded state.
- [ ] Existing graph/read endpoints that accept caller authority scope, use raw unscoped pool access, or synthesize unevidenced event graphs are not reused as the product contract.
- [ ] Response metadata explicitly exposes source, tenant, freshness, and degraded state.
- [ ] Metrics do not label all approvals as auto-promotions.
- [ ] Tests cover missing identity, viewer/curator/admin role behavior, forged tenant, malformed inputs, pagination, and unavailable dependency.

## Evidence

- RED/GREEN tests for each access boundary.
- Live PostgreSQL tenant-forgery test.
- Contract-validation output and route response fixtures.

## Rollback

The curator route remains unavailable; CLI/MCP reads remain canonical.
