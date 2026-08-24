# Governed Development Loop

> **Status:** Decided for Epic 25 planning and implementation readiness.
> **Scope:** The Allura Curator Review Console and reusable governed-review primitives.

## Purpose

This loop prevents an operator surface from becoming a static dashboard, a browser-to-database bypass, or an AI-generated UI with no verifiable behavior. It converts one approved story at a time into a small, testable, reversible vertical slice.

## The Loop

```text
1. Hydrate
   Read canonical docs, active story, current source, and prior evidence.
       ↓
2. Specify
   Freeze a typed contract, acceptance criteria, state matrix, and test cases.
       ↓
3. Red
   Add the smallest failing unit, route, or live-DB test for one behavior.
       ↓
4. Green
   Implement the smallest server-owned/API-first change that satisfies it.
       ↓
5. Inspect
   Verify real UI states, role behavior, tenant isolation, and accessibility.
       ↓
6. Review
   Pike checks interface simplicity; Fowler checks maintainability; Brooks checks architecture.
       ↓
7. Evidence
   Capture command output, commit-bound test results, and applicable receipts.
       ↓
8. Learn
   Record a short outcome: what changed, what was denied, what remains blocked.
       ↓
Next bounded story
```

## Definition of Ready

A story may start only when all conditions are true:

- [ ] It has one named owner and a bounded outcome.
- [ ] The user-visible workflow and non-goals are written down.
- [ ] The source API/service/data owner is identified; UI is not allowed to query PostgreSQL directly.
- [ ] The required authenticated principal, tenant derivation, role policy, and forbidden behavior are specified.
- [ ] The state matrix includes loading, empty, forbidden, error, stale, degraded, conflict, and completed states where relevant.
- [ ] The response/request contract is typed and linked from `DATA-DICTIONARY.md`.
- [ ] The targeted test command and evidence artifact are named.
- [ ] Any dependency on Epic 24 is explicit.
- [ ] The change has a rollback path.

## Definition of Done

A story is not Done because a page renders. It is Done only when:

- [ ] The acceptance criteria pass against real code and, when required, a live PostgreSQL database.
- [ ] A browser cannot forge tenant scope or use an action unavailable to its server-derived role.
- [ ] Network/dependency failure is visibly distinct from an empty or successful state.
- [ ] Every mutation returns a server-issued receipt or a truthful error/conflict result.
- [ ] UI controls are keyboard reachable; dialogs are named and manage focus; errors are announced.
- [ ] Route-smoke tests prove every rendered navigation destination exists.
- [ ] Map, detail, assistant, SDK, API, MCP, and CLI surfaces share one typed scope/retrieval contract when the story exposes them; no surface can introduce a second authority path.
- [ ] Any graph budget or 3D claim is backed by seeded query/payload/browser measurements and an accessible 2D/text fallback.
- [ ] Typecheck, lint, targeted tests, and relevant integration/live-DB tests are green.
- [ ] Pike, Fowler, and Brooks review findings are resolved or explicitly deferred.
- [ ] The canonical documentation and requirements matrix are updated in the same change.

## Review Ownership

| Gate | Owner | Decision |
|---|---|---|
| Scope and acceptance criteria | Jobs | Is this the smallest valuable slice? |
| Contract and trust boundary | Brooks | Is the browser outside the authority boundary? |
| Data transaction and isolation | Knuth | Is the write atomic and tenant-safe? |
| Interface and accessibility | Pike | Is the operator action clear, sparse, and usable? |
| Maintainability | Fowler | Is the change incremental, reversible, and non-duplicative? |
| Harness/evidence | Bellard + Hightower | Does the evidence prove the behavior in the intended environment? |

## Non-Negotiable Rules

1. **Evidence before action.** A reviewer can inspect provenance before a privileged decision.
2. **Server authority.** Identity, tenant, role, policy, transition, and receipt come from the governed server path.
3. **Truthful states.** Unknown, stale, degraded, denied, and conflict are product states, never hidden implementation details.
4. **No invented data.** No fake health, fake metrics, placeholder approvals, or optimistic decision completion.
5. **One workflow first.** Memory proposal review is the first adapter. New domains reuse the primitive only after it works.
6. **No broad dashboard restoration.** Initial route: `/dashboard/curator`; all other destinations are future until backed by a real route and route-smoke test.
7. **PostgreSQL-only truth.** Neo4j is sunset under AD-50. Historical references may remain only as marked migration history.

8. **Relational facts before semantic expansion.** Tenant/workspace scope, memberships, proposal/evidence/receipt state, actor identity, explicit IDs, and time filters resolve through governed PostgreSQL queries first. Semantic retrieval may widen or rank the already-authorized candidate set; it may not manufacture authority, bypass a relational filter, or stand in for a factual lookup.

## Evidence Bundle

Each completed story creates an evidence directory under:

```text
docs/archive/allura/evidence/epic-25/<story-key>/
```

Minimum contents:

- `acceptance.md` — criterion-to-test mapping and outcome;
- `commands.txt` — exact commands and exit codes;
- `route-smoke.json` — navigation/route result when the story renders UI;
- `review.md` — Pike/Fowler/Brooks verdicts;
- `live-db.md` — required for data/auth/mutation stories;
- `rollback.md` — rollback decision and CLI/MCP-only fallback.

## References

- `RISKS-AND-DECISIONS.md` — AD-46, AD-50, AD-57
- `DESIGN-ALLURA.md` — Curator Review Console contract
- `DATA-DICTIONARY.md` — typed review, evidence, and receipt contracts
- `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`
