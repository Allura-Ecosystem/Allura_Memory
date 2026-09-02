# Framework Mapping — Bumblebee as an Allura Agent-Platform Instance

> Bumblebee is one branch of the Allura ecosystem, not a standalone product. This doc maps its design to the platform's reusable framework, harness, memory, and governance primitives — the same primitives that other agent integrations compose.

## Platform Primitives Overview

Allura_Memory's `src/lib/` contains the framework primitives that bumblebee composes:

| Platform module | Files | Framework capability |
|----------------|-------|---------------------|
| `harness/` | 5 | Deterministic execution, scenario runners, tool simulators, receipt-based verification |
| `harness-adapter/` | 7 | Adapter registry for agent runtimes (Claude Code, Codex, Cursor, generic) |
| `evals/` | 5 | Eval CLI, live executors, retrieval evaluation, reporting |
| `process-engine/` | 11 | DAG execution, definition registry, quality gates, replay, state management |
| `agents/` | 4 | Agent manifests, canonical identity, dynamic routing, tenant roster |
| `memory/` | 28 | Memory coordinator, writeback, retrieval, embeddings, governance receipts, promotion |
| `guard/` | 5 | Gateway, scope checking, context injection, token validation, audit |
| `governance/` | 1 | Policy definitions |
| `curator/` | 6 | Module contract, module registry, auto-curator, scoring, operator read service |
| `mcp/` | 5 | Enforced MCP client, wrapped client, trace middleware, tracing contracts |
| `sdk/` | 2 | Server client SDK, index exports |
| `adapter-registry/` | 3 | Generic adapter registry, types, index |
| `circuit-breaker/` | 5 | Breaker, manager, alerting, types |
| `replay/` | 2 | Replay engine, fixtures |
| `session/` | 5 | Checkpoint manager, persistence, state hydrator |
| `branch-gate/` | 2 | Epic gates, release manifests |
| `branch-workflows/` | 2 | Lane config, workflow runner |
| `budget/` | 6 | Token enforcer, monitor, state capture |
| `coherence/` | 3 | Detectors, monitor, types |

## How Bumblebee Maps to Each Primitive

### 1. Agent Orchestration & Execution Design

**Job language:** "agent orchestration, deterministic execution patterns, planning loops"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `ingest-pipeline.ts` — 9-step deterministic pipeline | `process-engine/engine.ts` — DAG execution engine | Both implement step-by-step deterministic workflows with fail-closed gates. Bumblebee's pipeline (auth→gates→replay→conflict→conformance→persist) is a specialized DAG; process-engine generalizes this pattern. |
| `lease-routes.ts` — handler factories | `harness/runner.ts` — scenario runner | Both produce reusable handler factories that accept injected dependencies for testability. |
| `batch-conformance.ts` — record validation | `harness/determinism.ts` — deterministic verification | Both verify outputs against expected schemas with exact-match semantics. |
| `replay/` (exact body hash → prior receipt) | `replay/engine.ts` — replay engine | Both implement deterministic replay: same inputs → same outputs, with fixture-based validation. |

### 2. Memory Patterns

**Job language:** "memory patterns"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `batch-store.ts` — append-only records + immutable receipts | `memory/governance-receipt-writer.ts` — immutable governance receipts | Both write append-only evidence with deterministic IDs. Bumblebee's batch receipts and run decisions are a specialized memory ledger; the memory module generalizes this for all agent governance. |
| `staleness.ts` — freshness TTL, profile separation | `memory/memory-coordinator.ts` — memory coordination | Both manage staleness and lifecycle of stored state. Bumblebee's `isStale()` and `profileSeparation()` are domain-specific; memory-coordinator generalizes across all memory types. |
| `exposure-store.ts` — current packages query, catalog entries | `memory/retrieval-layer.ts` — retrieval authority | Both query accepted state with scope-qualified authority. |
| `brain-client.ts` — Allura Brain MCP client | `graph/` + `ruvector/` — graph + vector retrieval | The broader memory platform: graph-backed (ruvector) memory with Brain MCP for cross-session recall. Bumblebee's evidence ledger is one memory type within this platform. |

### 3. Policy Hooks & Governance

**Job language:** "policy hooks, governance"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `promotion-engine.ts` — 10-check evaluation matrix | `guard/gateway.ts` — policy gateway | Both enforce policy at a gate: promotion checks are policy hooks that decide accept/reject, mirroring how guard/gateway enforces invariants on every tool call. |
| `source-authority.ts` — route authorization, credential class | `guard/check-scope.ts` — scope checking | Both enforce exact audience/scope matching before allowing execution. |
| `governance/policies.ts` — policy definitions | `promotion-engine.ts` PROMOTION_REASON codes | Bumblebee's reason codes (PROMOTED_COMPLETE, HELD_*) are a concrete policy vocabulary; governance/policies.ts is the general framework. |
| Immutable receipts (batch + decision) | `memory/governance-receipt-writer.ts` | Both produce tamper-evident audit trails. |
| RLS + tenant-scoped transactions | `db/tenant-transaction.ts` + `workspace/` | Both enforce composite workspace authority with non-owner proof. |

### 4. Tool Calling

**Job language:** "tool calling"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `lease-authority.ts` — runner→lease→ingest token | `mcp/enforced-client.ts` — enforced MCP tool client | Both implement scoped tool credentials under a zero-trust model: an agent obtains a scoped credential, calls a tool, and the result is validated server-side. Bumblebee's two-token split (runner/ingest) is the same pattern as MCP's enforced client wrapping — neither trusts the caller's self-asserted scope. |
| `source-authority.ts` — route audience enforcement | `guard/validate-token.ts` — token validation | Both enforce that the right credential hits the right endpoint. |
| `harness-adapter/` — agent runtime adapters | `bumblebee/module.ts` — module manifest | Bumblebee registers as a module in the same adapter framework that harness-adapter uses for Claude Code, Codex, Cursor, and generic agents. |

### 5. Simulator Harnesses & Eval Integration

**Job language:** "simulator harnesses, eval integration"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| 17 test files incl. adversarial conformance | `evals/runner.ts` + `evals/cli.ts` — eval runner and CLI | Bumblebee's adversarial tests (mixed-run detection, record ID recomputation, contradictory count detection) are eval scenarios that validate agent output against schema contracts. The evals module generalizes this pattern. |
| `harness/tool-simulator.ts` — tool simulator | `batch-conformance.ts` — NDJSON conformance | Both simulate/stub tool outputs and validate them against expected schemas. Bumblebee's conformance layer IS a tool-output validator. |
| `harness-adapter/adapters/` — runtime-specific adapters | `__tests__/` — test suite | Both provide runtime-specific execution contexts for deterministic testing. |
| `harness/receipt.ts` — receipt-based verification | `batch-store.ts` — batch receipts | Both produce deterministic receipts that verify an operation completed with specific outputs. |

### 6. SDK, API, CLI & Developer Interface Design

**Job language:** "SDK, API, CLI design"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `POST /api/plugins/bumblebee/runs` + `/ingest` | `sdk/server-client.ts` — server client SDK | Bumblebee's API routes are consumed by the SDK's server client. The runner credential → lease → ingest flow is the SDK's tool-calling pattern. |
| `threat-discovery/cli.ts` — threat discovery CLI | `evals/cli.ts` — eval CLI | Both provide CLI interfaces to platform capabilities. Bumblebee's threat-discovery CLI drives the scanner; the evals CLI drives evaluation runs. |
| `module.ts` — module manifest | `curator/module-registry.ts` — module registry | Bumblebee's manifest is the SDK contract that the curator registry discovers and composes. |

### 7. Framework Composability

**Job language:** "composability, reusable framework capabilities"

| Bumblebee surface | Platform primitive | How they connect |
|-------------------|-------------------|------------------|
| `module.ts` — BUMBLEBEE_MODULE descriptor | `curator/module-contract.ts` — module contract | Bumblebee implements the module contract (id, version, capabilities, surfaces, feature flag, rollback). This is the same composability contract any Allura module implements. |
| `bumblebee/` as a self-contained module | `adapter-registry/` — adapter registry | Bumblebee is one adapter in the registry — it registers its capabilities and surfaces, and the registry composes it with other modules. |
| `surfaces.tsx` — 5 presentational surfaces | `curator/operator-read-service.ts` — operator read service | Bumblebee's surfaces are pure presentation that receive already-scoped, already-fetched rows — the same pattern the curator read service enforces for all modules. |

## Pattern Summary

The bumblebee plugin is a **concrete instance** of these reusable platform patterns:

```
Allura platform primitives
├── harness/          → bumblebee's ingest-pipeline + promotion-engine
├── evals/            → bumblebee's 17 adversarial test files
├── process-engine/   → bumblebee's 9-step deterministic DAG
├── guard/            → bumblebee's route auth + promotion gates
├── memory/           → bumblebee's append-only evidence ledger + staleness
├── mcp/              → bumblebee's scoped tool credentials (runner/ingest split)
├── curator/          → bumblebee's module manifest + registry composition
├── sdk/              → bumblebee's API routes consumed via server-client
├── adapter-registry/ → bumblebee as one composable adapter
├── replay/           → bumblebee's idempotent replay (same body → same receipt)
├── circuit-breaker/  → bumblebee's fail-closed 503 on internal failure
└── session/          → bumblebee's lease-scoped state within a session
```

Each bumblebee file is a specialization of a platform pattern, not a one-off design. The same primitives compose other agent integrations across the Allura ecosystem.