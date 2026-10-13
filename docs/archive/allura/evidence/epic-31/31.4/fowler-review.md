# GRAPH-34 Fowler maintainability review (superseded)

> Historical review of candidate `d069b972cdae797748af7b7bf6f15d4740a5ac13`. The final exact-candidate verdict is [`fowler-review-final.md`](fowler-review-final.md).

**Reviewer:** Fowler maintainability gate on the Codex desktop runtime  
**Final verdict:** APPROVE  
**Candidate:** `d069b972cdae797748af7b7bf6f15d4740a5ac13`  
**Tree:** `6a4a003a3b2f3f89d6b7d1c96dd79232235c697d`  
**Parent:** `2522907eae9fb342a84148fa4ac83816af57ed6f`  
**Reviewed:** 2026-10-12 EDT

Fowler's first review requested changes for continuation retries that lost their request purpose, duplicated request state, broad token-scan exclusions, and low-priority document-global focus selectors. The repaired candidate preserves `{ query, purpose }`, proves cumulative continuation retry, pins legacy token exclusions to exact SHA-256 fingerprints, and adds explicit focus/overview restoration.

The first re-review then found one high-severity focus recovery edge case: filtering out the selected node or receiving a non-graph focus response could leave a focused label with no selected node and no direct overview exit. The final candidate renders **Back to overview** whenever a saved overview exists and restores the requested selected node after a successful focus retry. Regression tests cover both transitions.

The final exact-candidate review also covered the bounded database repair. Recursive expansion uses the request lookahead ceiling, depth-two truncation fails closed before a continuation can lose an unreturned first-hop frontier, and a transaction-local five-second PostgreSQL timeout applies before authority and graph queries. The service exposes only a narrow injected `onUnavailable` seam; the route owns correlated, sanitized operational reporting.

## Final verification

- Focused repository, service, browser-client, workspace, route-authority, and transport tests: 83/83 passed against an archive of the exact candidate.
- Cold `tsc --noEmit --incremental false`: passed.
- ESLint over all nine changed source/test files in the final backend delta: passed.
- Token compliance: 3/3 passed; both fingerprint-bound exclusions matched exact candidate bytes.
- Candidate-range `git diff --check`: passed.
- Candidate commit and tree identities matched independently.
- No critical, high, or medium GRAPH-34 maintainability findings remain.

## Non-blocking debt

The recursive repository SQL repeats the canonical relationship-normalization expression in boundary filtering and ordering as well as its shared definition; extracting an alias-aware SQL-expression helper would reduce future drift. The cached-overview escape has a direct persistent-error transition test, while the equivalent degraded-focus path is established by source inspection through the shared implementation. Both are low-severity follow-up opportunities.

Fowler did not execute or substitute for the separate browser, live-database, full-regression, production-build, or human-acceptance gates. Allura Brain lookup for `allura-system` was denied by actor/group policy, so the exact local candidate and repository evidence were used.
