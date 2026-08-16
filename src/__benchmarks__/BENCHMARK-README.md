# Allura Memory — Benchmark Harness

A **black-box** benchmark suite that drives the live Allura Brain MCP gateway
(Streamable HTTP, default `http://localhost:5888/mcp`) exactly as a real agent
would, and scores five dimensions of memory-engine quality.

It imports **no server internals** — every number comes from a real
`tools/call` over the wire. That keeps the results honest and makes the harness
a genuine acceptance gate rather than a unit test in disguise.

> Distinct from `src/__tests__/retrieval-benchmark.test.ts`, which measures
> retrieval quality against **mocked** stores in the unit lane. This harness
> measures the **live stack**.

---

## Quick start

```bash
# 1. Bring up the Brain stack (PostgreSQL + RuVector + MCP gateway)
bun run brain:up
bun run brain:status        # confirm healthy

# 2. Run every benchmark
bun run benchmark

# 3. Run a subset
bun src/__benchmarks__/run.ts --only=retrieval-quality,latency-profile

# 4. Machine-readable output + per-step detail
bun src/__benchmarks__/run.ts --json=bench-results.json --verbose

# 5. CI baseline: require every benchmark to execute, but only record numerical
#    threshold outcomes until Story 24.6 defines the regression policy
bun run benchmark -- --ci-baseline --require-gateway
```

The pure metric math (Precision@K, Recall@K, MRR, percentiles) is covered by a
fast unit test that needs **no** live stack:

```bash
bun vitest run src/__benchmarks__/lib/metrics.test.ts
```

---

## What it measures

| # | Benchmark id | Measures | Key metrics | Pass bar |
|---|--------------|----------|-------------|----------|
| 1 | `retrieval-quality` | Federated `memory_search` relevance | Precision@5, Recall@5, MRR | P@5 ≥ 0.85 · R@5 ≥ 0.70 · MRR ≥ 0.75 |
| 2 | `curation-accuracy` | Curator scoring vs. ground truth | False-positive rate, false-negative rate, accuracy | FP ≤ 0.20 · FN ≤ 0.30 |
| 3 | `governance-integrity` | Isolation, injection, gates, invariants | Cross-namespace leaks, malicious-input reject rate, gate enforcement, live invariants | leaks = 0 · reject = 100% · gate blocked · all 6 invariants pass |
| 4 | `latency-profile` | Hot-path round-trip latency | search & add P50/P95/P99 | P95 ≤ 2500 ms |
| 5 | `audit-completeness` | Lifecycle traceability | Lifecycle stages traced, retrievability | all 3 trace stages present |

### 1. Retrieval quality (`retrieval-quality`)

Seeds a 10-document labeled corpus (three topic clusters) with run-scoped marker
tokens, then runs a ground-truth query set through `memory_search`
(`status: "all"` to include episodic stores). Relevance is judged by the marker
embedded in each returned result, so scoring is independent of the id scheme and
works across the episodic/semantic split.

- **Precision@5** — fraction of the top-5 hits that are relevant.
- **Recall@5** — fraction of known-relevant docs that appear in the top-5.
- **MRR** — mean reciprocal rank of the first relevant hit.

### 2. Curation accuracy (`curation-accuracy`)

Sends labeled examples through `memory_add` and reads the curator `score`. A
score clearing the promotion threshold (`0.85`) is treated as "system would
promote". Compared to the ground-truth label:

- **False positive** = noise the curator would promote (lower is better).
- **False negative** = durable knowledge it would drop (lower is better).

### 3. Governance integrity (`governance-integrity`)

Four sub-checks of the compliance invariants:

- **A. Cross-namespace isolation** — a secret written to tenant A must not
  surface in a search scoped to tenant B (`leaks` must be 0).
- **B. Bad-data injection** — malformed/non-compliant `group_id`s (legacy
  `roninclaw-*`, wrong case, underscores, missing prefix, SQL payloads) must all
  be rejected.
- **C. Live invariant check** — `audit_invariant_check` reports all six
  governance invariants holding against real data.
- **D. Gate enforcement** — `governance_check_gate` **blocks** an action that
  sets `bypass_hitl` / `via_docker_exec`.

### 4. Latency profile (`latency-profile`)

Warms up, then times `memory_search` and `memory_add` round trips at the fetch
boundary (what a real client sees), reporting mean/P50/P95/P99. Iterations per
operation are configurable with `--iters` (default 20).

### 5. Audit completeness (`audit-completeness`)

Walks one memory through its full lifecycle under a run-unique `agent_id` and
proves every stage left a queryable, append-only trace:

1. `memory_add` → a `memory_add` event,
2. `governance_check_gate` → a `governance_gate_checked` event,
3. `audit_agent_activity` aggregates both,
4. `memory_search` retrieves the memory (closes the add→search loop).

---

## CLI reference

```
bun src/__benchmarks__/run.ts [flags]

--only=<ids>        Comma-separated benchmark ids (default: all)
--group=<id>        Seed tenant; must match ^allura-[a-z0-9-]+$
                    (default: a run-specific allura-bench-*-loadtest tenant)
--iters=N           Iterations per operation in the latency profile (default: 20)
--json=<path>       Write the full machine-readable report to <path>
--require-gateway   Exit non-zero when the gateway is unreachable or a benchmark skips
--ci-baseline       Require complete execution but record, rather than enforce, numerical thresholds
--verbose, -v       Per-step detail in the report
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | The selected policy passed; CI baseline may still record numerical threshold misses |
| `1` | A runner or benchmark execution error occurred, or a locally enforced threshold failed |
| `2` | Gateway unreachable (preflight failed) |
| `3` | A required benchmark skipped |

CI gates on runner integrity and complete execution with `--ci-baseline`. The
`--json` report still carries every metric with its threshold and pass flag for
honest trend tracking. Story 24.6 owns numerical regression enforcement.

---

## Governance & data hygiene

- The default seed tenant is run-specific under **`allura-bench-*-loadtest`**. The `-loadtest`
  suffix makes `memory_add` store writes **directly as episodic**, skipping the
  HITL proposal queue (see `memory_add` in `src/mcp/canonical-tools.ts`). The
  harness therefore **never pollutes the curator queue**.
- All seeded content carries a `[[BENCH:<runId>:<key>]]` marker so reruns never
  collide and fixtures are easy to identify/clean.
- Writes honour the `group_id` invariant (`^allura-[a-z0-9-]+$`); the harness
  refuses a `--group` that doesn't match.
- The suite is **read-mostly** on production tenants: invariant and gate checks
  run against `allura-system` but only call read-only / append-only tools.

### Cleaning up seeded events

PostgreSQL events are append-only by invariant, so benchmark seed events persist
under the load-test groups. To purge them, drop the load-test `group_id`s
through your normal DB-maintenance path (MCP_DOCKER tools) — never `docker exec`.
They are inert: load-test groups are excluded from the curator pipeline.

---

## Configuration

| Env var | Purpose | Default |
|---------|---------|---------|
| `BENCHMARK_BRAIN_URL` | Gateway URL override (highest priority) | — |
| `ALLURA_BRAIN_URL` | Gateway URL (shared with `brain-client`) | — |
| _(neither set)_ | Falls back to | `http://localhost:5888/mcp` |

---

## Layout

```
src/__benchmarks__/
├── BENCHMARK-README.md          # this file
├── run.ts                       # entrypoint (bun run benchmark)
├── benchmarks/
│   ├── retrieval-quality.ts     # 1. P@K, R@K, MRR
│   ├── curation-accuracy.ts     # 2. FP/FN rates
│   ├── governance-integrity.ts  # 3. isolation, injection, gates, invariants
│   ├── latency-profile.ts       # 4. P50/P95/P99
│   └── audit-completeness.ts    # 5. lifecycle trace
└── lib/
    ├── client.ts                # standalone MCP Streamable-HTTP client
    ├── dataset.ts               # labeled corpus + queries + curation labels
    ├── metrics.ts               # pure IR-metric + percentile math
    ├── metrics.test.ts          # unit test for the math (no live stack)
    ├── metric-builder.ts        # Metric construction + threshold eval
    ├── report.ts                # console + JSON reporting
    ├── seed.ts                  # seeding + marker-based retrieval helpers
    └── types.ts                 # shared types
```

## Adding a benchmark

1. Create `benchmarks/<id>.ts` exporting
   `run(ctx: BenchmarkContext): Promise<BenchmarkResult>`.
2. Build metrics with `gated(...)` / `info(...)` and derive status with
   `statusFromMetrics(...)`.
3. Register it in the `registry` array in `run.ts`.
4. Keep it black-box: drive tools via `ctx.client`, never import server code.
