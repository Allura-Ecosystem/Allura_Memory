# Epic 19 — RuVector Graph Cutover Execution (Team RAM)

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Goal:** Execute the remaining work to flip `GRAPH_BACKEND` from `PostgreSQL (graph_memories)` to `ruvector` (Path A — PG tables, ship now) and spike Path B (ruvnet Rust crate, upstreamable engine) in parallel.

**Stories (to be refined after Epic 18 completes):**

- **19.1** Live-DB E2E — run 10-point acceptance gate against Docker Postgres with `GRAPH_BACKEND=ruvector`
- **19.2** Dual-read validation — read from both backends, diff results for one release cycle
- **19.3** Flip default in `factory.ts` (`getGraphBackend()` → `ruvector`) once E2E + dual-read are green
- **19.4** Path B spike — build `ruvector-crate-adapter.ts` behind `GRAPH_BACKEND=ruvector-crate`
- **19.5** Upstream gaps to ruvnet/RuVector (G1 immutable mode, G2 text index, G3 tenant scoping)

**Exit gate:**
- `GRAPH_BACKEND=ruvector` is the default in production
- PostgreSQL (graph_memories) is read-only fallback for one release
- Live-DB E2E passes with RuVector backend
- Path B adapter exists behind flag with three-way parity test green
