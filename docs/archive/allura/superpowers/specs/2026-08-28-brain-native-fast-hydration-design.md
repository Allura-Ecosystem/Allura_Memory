# Brain-Native Fast Hydration Design

> **Status:** Proposed — implementation requires separate approval after spec review.
> **Owner:** Brooks / Allura Team RAM
> **Tenant:** `allura-system`

## Objective

Reduce session boot latency and prompt tokens without weakening freshness, tenant
isolation, evidence rules, or HITL governance. The hot path should consume one
bounded Brain snapshot. Scout remains available for exceptions, but is removed
from the mandatory path for every boot.

## Decision

Adopt a **Brain-native boot snapshot** with explicit freshness metadata and
source precedence:

1. Approved semantic insight for durable doctrine.
2. Current filtered episodic evidence for active state and recent blockers.
3. Local repository context for implementation state and file-level truth.

The snapshot is a read contract, not a new store of truth. It must identify its
sources, timestamps, degraded state, and tenant. It must never silently convert
stale semantic data into current project status.

## Hot-Path Flow

```text
Session boot
  ├─ request bounded boot snapshot from Allura Brain
  ├─ check health, freshness, tenant, and contract version
  ├─ continue with compact context envelope when valid
  └─ escalate to Scout only when stale, conflicting, degraded, or task-specific
```

The snapshot should be assembled server-side from the existing governed memory
and audit surfaces. It should not require direct PostgreSQL, RuVector, or Neo4j
access from the agent.

## Snapshot Contract

Required fields:

- `contract_version`
- `group_id`
- `generated_at`
- `semantic`: approved insight summary, newest source timestamp, retrieval status
- `episodic`: bounded active work/blocker/decision summary, newest event timestamp
- `local_context`: files or repository revision used for implementation truth
- `degraded`: boolean plus reason when applicable
- `requires_scout`: boolean plus escalation reason
- `source_precedence`: explicit ordering used for conflicts

The default response is deliberately small: active work, blockers, durable
decisions, freshness, and next safe action. Raw event bodies and broad history
remain opt-in.

## Scout Role

Scout is retained as a **cold-path verifier and recon specialist**:

- required for stale or conflicting snapshots;
- required for new implementation or architecture work needing local context;
- required when Brain health, indexing, or tenant checks fail;
- not invoked for an otherwise valid, fresh boot snapshot.

This preserves the ContextScout gate for work that needs repository discovery
while removing repeated full-context hydration from routine startup.

## Freshness and Fallback

Graph health and semantic retrieval freshness are separate dimensions.

- Healthy graph + old result: semantic retrieval is stale/incomplete.
- Recent episodic + stale semantic: episodic governs current status; semantic
  remains durable doctrine only.
- Brain unavailable: fail closed for governed claims and expose the unavailable
  state; do not present local files as canonical memory.
- Conflicting sources: preserve both, mark the conflict, and set
  `requires_scout=true`.

Caching is permitted only for versioned summaries with explicit TTL and
invalidation. A cache hit must still expose its generation timestamp and may
not suppress a required health or freshness check.

## Accuracy and Governance Invariants

- Every operation carries `group_id` matching the Allura namespace contract.
- PostgreSQL traces remain append-only.
- Semantic knowledge changes use versioning and `SUPERSEDES` lineage.
- Promotion is proposed through the curator pipeline and requires HITL approval.
- Boot events are filtered; unfiltered event dumps are prohibited.
- No healthy, current, canonical, or done claim is emitted without evidence.
- The snapshot cannot grant authority or bypass RuVix policy gates.

## Failure Handling

The snapshot reader returns a typed degraded result rather than guessing. The
caller may continue only with clearly labeled evidence and must escalate when
the task requires current or canonical knowledge that is unavailable. A stale
snapshot is not automatically refreshed by repeatedly issuing broad searches;
that behavior would recreate the token and latency problem.

## Validation Plan

Before implementation is considered complete, measure:

- p50 and p95 boot latency;
- prompt tokens consumed by the hydration envelope;
- freshness age for semantic and episodic sources;
- recall of known active blockers and durable decisions;
- stale/conflict/degraded escalation correctness;
- tenant isolation and append-only behavior;
- immediate public `memory_get` and `memory_search` round-trip after approved
  promotion.

Candidate commands include the existing group-id, graph adapter, typecheck,
route, and dashboard contract tests, plus a new focused hydration contract
suite and a retrieval-drift regression test.

## Documentation Impact

This decision affects `RISKS-AND-DECISIONS.md` with a new AD entry, and likely
requires synchronized updates to `SOLUTION-ARCHITECTURE.md`, `DESIGN-ALLURA.md`,
`REQUIREMENTS-MATRIX.md`, and `DATA-DICTIONARY.md` if the snapshot becomes a
public MCP/API contract. `BLUEPRINT.md` needs an update only if the boot
behavior becomes a stated product capability.

## Alternatives Rejected

- **Scout on every boot:** accurate but repeats expensive context loading and
  creates avoidable token and latency cost.
- **Local-file cache as authority:** fast but contradicts Brain governance and
  risks stale or divergent state.
- **Blind semantic cache:** fast but can make stale June-era retrieval appear
  current.
- **Direct database reads from agents:** lower protocol overhead but violates
  the MCP/API and RuVix boundaries.
