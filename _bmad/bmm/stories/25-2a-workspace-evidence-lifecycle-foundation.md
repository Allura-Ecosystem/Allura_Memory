# Story 25.2a — Workspace Scope and Evidence Lifecycle Foundation

**Status:** Planned / dependency-blocked
**Owner:** Troy + Knuth + Brooks
**Depends on:** 24.2 authenticated principal context; 24.3 tenant isolation; 25.1 scope/product truth
**Blocks:** 25.3, 25.4, 25.5, 25.6, 25.7

## Outcome

Make workspace scope, evidence requests, and review receipts durable application concepts before a browser queue claims to show workspace-governed review.

## Verified Current-State Facts

- Legacy events and proposals remain intentionally unscoped; no default workspace backfill is permitted.
- Workspace-governed watchdog events and canonical proposals persist `workspace_id` and use composite tenant/workspace integrity.
- Request-evidence is currently an append-only event projection over a `pending` proposal, not a queryable evidence-request lifecycle.
- Decision events are durable append-only audit records, but the operator contract lacks a frozen workspace/policy/evidence-version receipt projection.

## Dependency Re-evaluation (added by Story 25.1, AC-8)

**Date:** 2026-08-23. **Status: NOT advanced.** 25.2a stays `dependency-blocked`.

The `**Depends on:**` header is left unchanged. It is the historical dependency edge, and
`_bmad/bmm/stories/sprint-status.yaml` and the epic planning doc must continue to agree
with it (`bun run epic25:drift`). Blocker *state* is restated here instead.

| Declared blocker | State after Story 25.1 | Still blocking? |
|---|---|---|
| 24.2 authenticated principal context | Done (per `sprint-status.yaml` epic_24) | No |
| 24.3 tenant isolation | Done (per `sprint-status.yaml` epic_24) | No |
| 25.1 scope and product truth | Repository/Notion reconciliation is written and contract-tested; `bun run epic25:drift` exits 0 | **Partially** |

**What 25.1 now proves.** The planning doc mirrors the verified Notion decision: Notion is
canonical for scope, acceptance criteria, and decisions; the repository is versioned
implementation/test/commit evidence. The focused drift fixtures and the documentation-loop
contract test cover the repository evidence mirror. This clears the earlier drift-gate
reconciliation condition without rewriting the builder's historical red handoff.

**Remaining blockers on 25.2a's Done transition, restated explicitly:**

1. The declared Epic 24 authority prerequisites for 25.2 retrieval work
   (see the epic planning doc "Cross-epic prerequisites" table).
2. AD-57 is recorded but **Proposed, with no captured rationale**. If 25.2a's Done
   contract depends on AD-57 being ratified scope authority, it is not yet.
3. Independent review remains required; this re-evaluation does not advance 25.2a to Done.

## Acceptance Criteria

- [ ] A written migration plan identifies every persisted record that must carry `workspace_id`: proposal, event/evidence reference, retained/promoted knowledge, receipt projection, and outbox item.
- [ ] New governed write paths persist a non-null workspace boundary, derive it from the authenticated principal/token context, and never trust a browser-provided workspace as authority.
- [ ] `workspaces` has composite `(group_id, workspace_id)` uniqueness; token and first-slice record foreign keys bind both values. Existing rows use a reviewed migration map or remain unavailable to workspace-scoped reads—no default workspace backfill is invented.
- [ ] Scoped transactions set standardized transaction-local group, workspace, and principal settings. Workspace-owned RLS `USING` and `WITH CHECK` policies enforce both group and workspace; the first-slice app role cannot fall back to an owner/migration role.
- [ ] `evidence_requests`, immutable `governance_receipts`, and versioned `semantic_projections` are durable scoped records, not free-form event metadata. Projection jobs use deterministic idempotency keys and do not reuse promotion-specific outbox semantics unchanged.
- [ ] Read/retrieval queries first resolve structured relational facts and hard filters—authenticated tenant/workspace, membership/role, proposal status, evidence-request state, trace/receipt identity, actor, time range, and explicit entity IDs—before semantic candidate expansion. Semantic/vector retrieval may widen or rank candidates but may not override a relational boundary or substitute for a factual lookup.
- [ ] Each relational entity family that needs semantic discovery has a deterministic, versioned **SemanticProjection** builder that assembles its meaningful header/detail relationship into governed Markdown before embedding. For a proposal this includes scope, proposal header, linked trace/event evidence, evidence-request state, decision/receipt state where present, and redaction classification—not a bare `canonical_proposals` row.
- [ ] Projection generation is source-driven and idempotent: it records source table/row references, projection version, content hash, generation time, redaction policy, and embedding model/version. The relational records remain authoritative; embeddings are a derived index that can be rebuilt or deleted without changing source facts.
- [ ] Proposal status stays intentionally distinct from evidence-request state; the queue can distinguish reviewable pending, evidence requested, evidence satisfied/reopened, approved, and rejected without inferring from presentation text.
- [ ] Receipt projection includes proposal version, workspace ID, server-issued actor/role, action, nonblank rationale, policy reference/version, immutable evidence references, timestamp, memory ID where applicable, and truthful outbox/sync state.
- [ ] Cross-tenant, cross-workspace, legacy-unscoped, malformed-scope, evidence-request, and receipt-version tests are specified; live-DB proofs are required before Done.
- [ ] `DATA-DICTIONARY.md`, `REQUIREMENTS-MATRIX.md`, and migration/rollback evidence are updated.

## Non-Goals

- No browser route, dashboard shell, or decision button.
- No approval mutation release; Story 24.4 remains the atomic-promotion gate.
- No destructive rewrite or deletion of legacy data without explicit backup approval.

## Evidence

Store the migration plan, schema checks, query plans, live-DB isolation cases, receipt samples, and rollback proof under:

```text
docs/archive/allura/evidence/epic-25/25.2a/
```
