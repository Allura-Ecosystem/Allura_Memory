# Epic 25 Team RAM implementation handoff

**Status:** Planning handoff only. No production implementation is authorized until the listed gates pass.
**Architecture chair:** Brooks
**Scope owner:** Jobs
**Implementation continuity:** Troy + Woz
**Compiled from:** Scout, Brooks, Jobs, Knuth, Pike, Fowler, Bellard, and Hightower reviews.

## One user job

> Help a curator see what the team knows about one item, where it came from, and what still needs review.

The first real slice is not a general dashboard, chat workbench, queue manager, or 3D demo.

```text
/dashboard/curator
→ server-authorized focused 2D Knowledge Map
→ selected-item detail and sources
→ one read-only cited question
```

## Frozen architecture

```text
Browser / SDK / MCP / CLI
  → authenticated adapter derives tenant + workspace + role + policy
  → SubgraphQueryService / RetrievalPlanner / GovernedAssistant
  → relational facts, evidence, receipt, redaction service
  → optional derived SemanticProjection expansion
  → PostgreSQL authority plane and append-only audit/outbox
```

- PostgreSQL relational facts and authorization resolve first.
- Semantic projections are versioned, rebuildable ranking material only.
- 2D is the first required map renderer.
- 3D is optional, feature-flagged, and consumes the identical focused-subgraph response.
- The assistant is selected-item-scoped and read-only.

## Delivery order

| Phase | Owner | Output | Exit gate |
|---|---|---|---|
| 25.1 truth reset | Jobs + Brooks | route/doc/Neo4j-drift reconciliation | scope and canonical docs agree |
| 25.2a durable foundation | Knuth + Troy/Woz | workspace scope, evidence lifecycle, receipt/projection records | live DB migration, rollback, RLS A/B isolation |
| 25.2 read core | Knuth + Troy/Woz | `ResolvedScope`, `RetrievalPlan`, `SubgraphQuery/Response` | forged-scope, cursor, relational-first tests |
| 25.3 2D route | Woz + Pike | bounded 2D map, text relationship list, source-first detail | route/ARIA/state/budget proof |
| 25.3b modular dashboard | Brooks + Woz + Pike + Fowler + Bellard | stable shell, server module registry, shared components, Mortgage Gate first module | schema/integrity/capability/disable/rollback proof; no arbitrary code |
| 25.4 evidence detail | Woz + Pike | scoped proposal/evidence/receipt links | state-matrix and freshness proof |
| 25.4a assistant parity | Woz + Bellard | one read-only cited question across REST/SDK/MCP/CLI | golden fixture parity and CLI repair |
| 25.4b portable skills/identity | Troy/Woz + Pike + Bellard + Hightower | one canonical Mortgage Approval Gate skill with Cowork/Claude Code/Codex adapters and Entra mapping | package/auth/identity/denial/parity/disable proof; does not fork authority |
| 25.3a optional 3D | Pike + Bellard + Hightower | opt-in exploration renderer | browser/device/a11y/rollback proof |
| 25.5 decisions | Knuth + Woz | normal governed mutations | 24.4 atomic-promotion remediation |
| 25.5a mortgage gate demo | Jobs + Brooks + Troy/Woz + Pike + Bellard + Hightower | intake → evidence/OCR → policy → human review → receipt across three hosts | sanitized fixtures, parity, Entra RBAC, denial, receipt verification; no Salesforce |
| 25.6 release gate | Bellard + Hightower + Pike + Fowler | security, accessibility, observability, demo | evidence bundle and rollback rehearsal |

## Contract rules

### Scope

All adapters may express intent and anchor IDs. Only the server derives:

```text
group_id
workspace_id
principal_id
roles
policy_version
```

Caller headers, query strings, bodies, SDK parameters, MCP arguments, and CLI flags cannot select authority scope.

### Focused map

The initial `SubgraphResponse` is bounded:

```text
max_nodes: 200
max_edges: 400
max_depth: 2
```

Those are product safety caps, not scale claims. Any truncation returns an aggregate/continuation and a visible reason. Continuations are opaque, signed, expiring, scope/query/policy-bound, and snapshot-bound. Offset traversal is forbidden.

Every returned node and edge has an evidence reference or a versioned derived-source rule. `complete`, `partial`, `empty`, `denied`, and `degraded` remain distinct.

### Assistant

The first prompt is:

```text
Ask about this item
```

The assistant returns:

```text
answer
citations
RetrievalPlan
allowed-action hints
complete | partial | degraded | denied state
```

It cannot approve, reject, promote, write memory, choose scope, call connectors, mint receipts, override policy, call raw storage, or conceal missing/stale/degraded evidence.

## Required live-DB and harness fixtures

- `scope-matrix-v1` — same IDs across tenant/workspace boundaries.
- `focused-18-v1` — gold parity fixture with 18 nodes/31 edges and evidence per node/edge.
- `budget-200-400-v1` — exact map cap payload.
- `dense-1000-v1` — server aggregates/continuation, no eager workspace dump.
- `large-10k-v1` — server-side search/aggregation only, never browser full graph.
- `evidence-state-v1` — complete/stale/unknown/missing/redacted/inaccessible/derived/projection-failure states.
- `cursor-v1` — stable traversal, tie ordering, snapshot cutoff, adversarial token cases.
- `assistant-golden-v1` — same answer/citations/plan/state across REST, SDK, MCP, and CLI.
- `cancel-v1` — abort before/during query, semantic expansion, render, and navigation.

## Required operational gates

1. Verified restorable backup and restore drill before migration.
2. Additive ordered migration; reviewed legacy workspace mapping; no invented default workspace.
3. Restricted `allura_app` role and forced workspace-aware RLS prove scope A cannot see/write scope B.
4. Feature flags default closed:
   - `workspace_scope_enforced`
   - `subgraph_v1_read_enabled`
   - `curator_map_2d_enabled`
   - `dashboard_modules_enabled`
   - `mortgage_approval_gate_enabled`
   - `semantic_projection_enabled`
   - `assistant_cited_readonly_enabled`
   - `copilot_cowork_enabled`
   - `claude_code_adapter_enabled`
   - `codex_adapter_enabled`
   - `connector_readonly_enabled`
   - `explorer_3d_enabled`
5. Projection lag, subgraph budget, assistant state/citation failures, scope denials, and cursor failures are observable.
6. Flag disable returns a truthful degraded/unavailable experience; it never bypasses RLS or serves invented/cached unauthorized data.

## Explicit nonclaims

Do not claim:

```text
whole-workspace graph
infinite graph
real-time graph
real-time whole-workspace 3D
WebGL scale or accessibility
production latency/SLO
complete knowledge coverage
assistant factual correctness beyond cited sources
cross-surface parity before fixtures pass
```

## Source debt to remove when safely superseded

- Caller-selected graph group/workspace scope.
- Raw-pool unscoped graph reads.
- Unordered graph caps and synthetic event-graph fallback.
- CLI-shell/vector-first retrieval and `include_global: true` default.
- Legacy Neo4j configuration/types/docs/routes.
- Browser-specific scope/filtering and duplicate graph/assistant types.
- CLI parse defect before parity is claimed.

## Validation commands

```bash
bun run typecheck
bun run test:unit
bun run test:curator
bun run test:integration
bun run test:live-db
bun run test:mcp
bun run test:e2e
bun run validate:e2e
bun run ruvector:readiness
bun run ci:evidence
bun run factory:validate
```

The final evidence bundle adds live-db, subgraph-contract, map-2d, and optional map-3d lanes under `artifacts/ci/<sha>/`.

## Brain note

All Team RAM lanes attempted required Brain hydration but no `mcp__allura_brain__*` tool was exposed in their runtime. No Brain result or completion trace is claimed by this handoff.
