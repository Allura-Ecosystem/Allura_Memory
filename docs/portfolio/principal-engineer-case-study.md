# Allura — Principal Engineer Case Study

## Market Category

Allura is an **AI / agent control plane** (Forrester, Dec 2025): infrastructure
that inventories, governs, orchestrates, and assures heterogeneous agents
across vendors and domains — enforcing policy, capturing audit evidence, and
maintaining control even when agents misbehave. It sits **outside** the agent
runtime. Memory is one governed subsystem inside that plane, not the whole
product. Closest analogues: Guild.ai, Raksha AI, Microsoft Foundry Control
Plane, Lyzr, Fiddler, RuntimeAI. Differentiators: self-hosted and
PostgreSQL-only (no vendor lock-in), RLS tenant isolation, HITL-gated
promotion, and SHA-bound reproducible evidence.

## Problem Framing

Addressing gap in AI agent infrastructure: agents generate vast amounts of
operational data, but most is lost between sessions, and ungoverned agents
cannot be trusted with regulated or high-liability operations. Allura is a
**governed control plane** that (1) inventories agent operations, (2) enforces
policy and HITL gates, (3) promotes distillable knowledge through a
human-approved semantic ledger, and (4) emits reproducible, SHA-bound evidence
for audit. The human-in-the-loop promotion gate balances automation speed with
human accountability.

## Standards

- **PostgreSQL-only architecture**: no proprietary graph database dependency;
  semantic layer runs on RuVector/pgvector behind the `IGraphAdapter` seam
  (AD-49, cutover 2026-07-12)
- **HITL governance**: 25 policies across 5 families enforce tenant isolation,
  audit immutability, promotion gates, and evaluation thresholds
- **Atomic promotion**: one PostgreSQL transaction for canonical memory,
  proposal transition, audit event, and projection outbox
- **SHA-bound evidence**: every CI run produces an immutable, commit-bound
  evidence manifest (see [evidence-index.md](evidence-index.md))

## Rejected Alternatives

1. **Neo4j as semantic store** — replaced: migrated FROM Neo4j to RuVector in
   Epic 19 (2026-07-17) to remove RAM cost on 4GB laptops and vendor lock-in.
   PostgreSQL pgvector provides equivalent HNSW + BM25 search. Neo4j was
   fully removed in Epic 23 (2026-07-17); no fallback remains.
2. **Auto-promotion without HITL** — rejected because regulated credit
   decisions (ECOA adverse action, HMDA reporting, TRID disclosure timing)
   carry legal liability and must always be human-approved.
3. **Token-level tenant isolation** — rejected for small teams; group_id
   server-side enforcement with forced RLS is sufficient and simpler.
4. **Cloud/SaaS control plane** — rejected in favor of self-hosted,
   air-gappable, Kubernetes-free on-prem deployment with no vendor lock-in.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| PostgreSQL-only | Lower cost, simpler ops, but no native graph traversal |
| HITL promotion | Slower knowledge promotion, but accountable |
| Single MCP token | Simpler auth, but no per-tenant token isolation |
| Scenario harness (not live models) | Deterministic but doesn't test model behavior |

## Failure Modes

- **Budget exhaustion**: circuit breaker halts memory operations
- **RLS misconfiguration**: tenant data leak (mitigated by E2E tests)
- **Trigger + service conflict**: duplicate audit events (mitigated by trigger suppression)
- **Idempotency key collision**: replay returns wrong result (mitigated by unique constraint)

## Migration Strategy

Allura migrated from Neo4j to PostgreSQL-only in Epic 19 (2026-07-17).
The migration exported 4,235 nodes and 2,206 relationships to PostgreSQL
`graph_memories` and `graph_supersedes` tables. The process was:
1. Dual-read validation (Story 19.2)
2. Flip default to ruvector (Story 19.3)
3. Neo4j sunset (Epic 23)

The semantic/graph layer now runs entirely on RuVector/pgvector
(`GRAPH_BACKEND=ruvector` is the production default). No Neo4j dependency
remains in the active path.

## Developer Experience

- `allura init` → `allura up` → `allura doctor` → `allura run`
- One-command evaluation: `allura eval`
- Deterministic replay: `allura replay scenario.json receipt.json`
- No external credentials needed for simulation mode

## Measured Evidence

- 1,785 unit tests passing
- 150 E2E tests passing against live PostgreSQL
- 17 scenario harness tests passing
- 8 evaluation gate tests passing
- Branch protection enforced on main
- Controlled-red PR proved the gate blocks merges