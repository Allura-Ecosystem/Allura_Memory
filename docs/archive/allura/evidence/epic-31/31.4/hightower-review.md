# GRAPH-35 Hightower production-safety review (superseded)

> Historical review of candidate `d069b972cdae797748af7b7bf6f15d4740a5ac13`. The final exact-candidate verdict is [`hightower-review-final.md`](hightower-review-final.md).

**Reviewer:** Hightower infrastructure and deployment gate on the Codex desktop runtime  
**Final verdict:** APPROVE  
**Candidate:** `d069b972cdae797748af7b7bf6f15d4740a5ac13`  
**Tree:** `6a4a003a3b2f3f89d6b7d1c96dd79232235c697d`  
**Parent:** `2522907eae9fb342a84148fa4ac83816af57ed6f`  
**Reviewed:** 2026-10-12 EDT

Hightower's initial review requested changes for unbounded recursive database work, focus failures that hid a valid cached overview, and handled failures with no operational event or correlation. The first repaired candidate added a deterministic per-frontier expansion ceiling, transaction-local five-second PostgreSQL statement timeout, direct error/degraded overview recovery, and correlated Sentry plus sanitized structured failure events. Hightower then found that keyset-filtering a truncated first-hop frontier could make second-hop relationships permanently unreachable.

The final candidate fails closed before issuing that lossy depth-two continuation. When a page would truncate while its boundary is still depth one, the repository raises an explicit complexity failure; the service returns the sanitized observable `UNAVAILABLE` contract. Safe depth-two continuations reconstruct their complete bounded first hop and resume only same-depth edges. Unit proof uses 401 distinct first-hop neighbors, and live PostgreSQL proof exercises a 1,000-edge high-degree focus under the timeout.

## Final disposition

- Recursive work has a deterministic request-lookahead ceiling and transaction-local timeout.
- High-complexity depth-two graphs intentionally fail closed rather than claim an incomplete traversal.
- Focus error/degraded states retain direct **Back to overview** access.
- Handled failures emit correlated Sentry and sanitized structured events plus `X-Request-Id`; secret-bearing exception text is not logged.
- Server-derived authority, restricted-role read-only transactions, tenant/workspace isolation, continuation binding, and non-leaking responses remain intact.

## Final verification

- Exact commit/tree identity and working-runtime bytes matched.
- Focused tests: 75/75 passed.
- TypeScript and candidate-range whitespace checks passed.
- Durable live lane separately records 52/52 suites, 154 passed, 3 skipped, including the high-degree fail-closed proof.

Residual limitation: sufficiently complex depth-two graphs deliberately return `UNAVAILABLE`; operators receive a correlated event, and the cached overview remains usable. This is a safety boundary, not a scale claim or deployment proof.
