# Framework Map

This document maps Allura Memory to the framework concepts it implements:
agent orchestration, memory patterns, policy hooks, tool calling, planning
loops, simulator harnesses, deterministic execution, evaluation, and
developer interfaces (SDK / API / CLI). Each section names the code paths so
an engineer can verify the capability directly.

## Architecture at a glance

```text
Agent (any runtime)
  → SDK / CLI / MCP gateway (authenticated Streamable HTTP or stdio)
    → control plane (proof-of-intent → policy evaluation → syscall dispatch)
      → process engine (DAG execution, checkpoints, replay)
      → governed memory (episodic ledger → curator promotion → semantic layer)
      → harness (deterministic scenarios, receipts, tool simulators, evals)
        → PostgreSQL 16 (RLS-enforced, append-only evidence, pgvector)
```

## Orchestration and deterministic execution

- `src/lib/process-engine/engine.ts` — `ProcessEngine`: DAG execution with
  step lifecycle events (`process_step_started` / `completed` / `failed`),
  checkpoint continuation, and acceptance gates.
- `src/lib/process-engine/dag.ts` — process definitions and dependency graph.
- `src/lib/process-engine/definition-registry.ts` — step registry and
  composition.
- `src/lib/process-engine/replay.ts` — event-sourced replay of recorded runs.
- `src/lib/process-engine/checkpoint-continuation.integration.test.ts` —
  checkpoint/restart proof.
- `src/lib/harness/determinism.ts` — determinism primitives used by the
  scenario harness.

## Memory patterns

Two governed layers over one PostgreSQL engine (no dual-database split):

- Episodic ledger — append-only `events` / `traces` tables; every agent write
  is an immutable audit record (`docker/postgres-init/00-traces.sql`,
  `01-sync-tables.sql`).
- Semantic layer — `graph_memories` / `graph_supersedes` tables with
  `SUPERSEDES` lineage, promoted only through curator approval
  (`docker/postgres-init/40-workspace-subgraph-forward-upgrade.sql`).
- Retrieval — hybrid semantic + full-text search with approved-only and
  degraded modes (`src/lib/memory/`, pgvector embeddings).
- Branchable working memory — copy-on-write agent branches with governed
  promotion back into canon; no second memory authority
  (`src/lib/branch/`, `src/lib/branch-workflows/`, migrations
  `53`–`57`).
- Workspace isolation — `group_id` / `workspace_id` scoping with forced RLS
  on 37+ tenant tables (`docker/postgres-init/39-*.sql` through `59-*.sql`).

## Policy hooks and tool calling

- Control plane — 12 syscalls; every mutation requires proof-of-intent then
  policy evaluation before dispatch
  (`src/control-plane/syscalls.ts`, `src/control-plane/proof.ts`,
  `src/control-plane/policy.ts`).
- Policy engine — actor identification (POL-004), project manifest
  (POL-009), approval-required kinds, budget and tier checks
  (`src/control-plane/policy.ts`).
- Server-verified authorization evidence — short-lived, HMAC-signed,
  tenant-bound, one-time (JTI-consumed) tokens are the only path to certain
  writes; PostgreSQL enforces consumption atomically
  (`src/control-plane/genesis-policy-evidence.ts`,
  `docker/postgres-init/58-genesis-evidence-replay-ledger.sql`,
  `59-genesis-server-verified-authority.sql`).
- MCP tool boundary — authenticated Streamable HTTP gateway with
  principal-derived authorization, scope checks, and fail-closed dispatch
  (`src/mcp/canonical-http-gateway.ts`,
  `src/mcp/http-tool-catalog.ts`).
- Governed lane tools — `governed_lane_open` / `governed_lane_snapshot` /
  `governed_lane_review` as durable, tenant-scoped tool calls
  (`src/mcp/governed-lane-tools.ts`).
- Target resolver — parameterized syscall dispatch to PostgreSQL targets
  with append-only and lifecycle rules per table
  (`src/control-plane/target-resolver.ts`).

## Simulator harness and evaluation

- Scenario runner — fixture-backed deterministic scenarios with engine event
  recording (`src/lib/harness/runner.ts`, `scenario.ts`,
  `tool-simulator.ts`).
- Tool simulator — simulated tool responses for hermetic runs
  (`src/lib/harness/tool-simulator.ts`).
- Receipts — per-run receipts capture inputs, events, and outputs; replay
  compares receipts byte-for-byte for determinism proof
  (`src/lib/harness/receipt.ts`).
- Evaluation runner — eval suites over scenario runs
  (`src/lib/evals/`, `evals/`).
- Retention/expiry and promotion decisions — the Bumblebee plugin models a
  full ingest → lease → batch → decision (promoted/held) → exposure
  pipeline with provenance-bound evidence
  (`src/lib/bumblebee/`, migrations `46`–`56`).

## Developer interfaces

- SDK — typed clients for memory, harness (scenario run/replay/eval), and
  governed lanes over the authenticated MCP transport; shipped as ESM +
  CJS + NodeNext declarations, verified by packed-tarball clean-consumer
  tests (`packages/sdk/src/`, `packages/sdk/test/dist-consumer.test.ts`).
- CLI — `allura run <scenario>` and `allura replay <scenario> <receipt>`
  drive the harness from the terminal (`packages/cli/src/index.ts`).
- API — canonical HTTP gateway exposes health, readiness, audit, and tool
  endpoints (`src/mcp/canonical-http-gateway.ts`).

## Governance and scale

- 59 forward-only migrations, each with RLS/least-privilege grants and
  schema-version records (`docker/postgres-init/`).
- Historical-upgrade proof — CI applies the exact committed prior schema
  (pinned commit), seeds legacy state, applies current migrations, and
  asserts reconciliation (`src/__tests__/bumblebee-historical-upgrade.e2e.test.ts`).
- Immutable receipts — server-issued promotion and governance receipts with
  hash-bound evidence (`docker/postgres-init/41-*.sql`, `45-*.sql`,
  `53-*.sql`).
- Evidence lanes — CI aggregates unit, build, live-PostgreSQL, benchmark,
  and evaluation artifacts into a schema-checked manifest
  (`.github/workflows/epic-24-evidence.yml`, `docs/portfolio/evidence-schema.json`).

## Where to start reading

1. `README.md` — product narrative and core model.
2. `docs/allura/SOLUTION-ARCHITECTURE.md` — canonical architecture.
3. `src/control-plane/syscalls.ts` — the enforcement boundary.
4. `packages/sdk/src/client.ts` — the developer surface.
5. `docs/portfolio/principal-engineer-case-study.md` — engineering case study.