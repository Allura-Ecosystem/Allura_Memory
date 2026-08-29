# Allura — Interview Talking Points

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.

## One-line positioning

Allura is a self-hosted, governed AI/agent control plane: it inventories agent
operations, enforces policy and human-in-the-loop gates, promotes distillable
knowledge through a human-approved semantic ledger, and emits reproducible,
SHA-bound evidence for audit.

## The problem

Agents generate vast operational data, but most is lost between sessions, and
ungoverned agents cannot be trusted with regulated or high-liability
operations. mem0's autonomous scoring produces a 97.8% junk rate after 32 days
in production (GitHub issue #4573); Harvard research shows indiscriminate
memory storage performs worse than no memory at all.

## The answer

- **Schema-level tenant isolation** — `group_id` CHECK constraint, forced RLS,
  37 tenant-scoped tables; no application-layer bypass is possible.
- **Append-only episodic ledger** — every write is an immutable audit record;
  no UPDATE or DELETE on the `events` table, ever.
- **Human-gated promotion** — no insight becomes active knowledge without
  curator approval (or an explicitly configured policy-controlled flow).
- **Versioned semantic store** — `graph_memories` rows are immutable; changes
  create new rows linked by SUPERSEDES.
- **SHA-bound evidence** — every CI run produces an immutable, commit-bound
  evidence manifest; every portfolio claim resolves to a current artifact.

## Measured evidence (all reproducible)

- **Retrieval quality:** P@5 0.867, R@5 0.933, MRR 0.833 (2026-05-01 benchmark).
- **Cross-tenant isolation:** 100% — zero leaks across all test scenarios.
- **Deterministic harness:** 3 committed scenarios (success, policy denial,
  checkpoint recovery) replay byte-identical.
- **Portfolio evaluation:** 9 offline lanes (retrieval relevance, approved-only
  recall, policy blocking, cross-tenant, promotion correctness, audit
  completeness, deterministic replay, tool contracts, latency) all pass in CI.
- **Branch suites:** 97/97; full unit lane 2474+ passed; typecheck clean.

## Architecture decisions worth defending

1. **PostgreSQL-only** (AD-50) — Neo4j sunset 2026-07-17; pgvector/RuVector
   provides equivalent HNSW + BM25 without the per-person Community license
   limit or a second store to keep consistent.
2. **API/MCP-first** — the engine is usable without a browser; the Memory
   Command Center is an optional governed operator surface, never a bypass.
3. **Fail-closed web authority** — one route-scope manifest is the single
   source of route authority; unmatched paths are denied, not served.
4. **Evidence-gated orchestration** — runs are auditable, resumable records;
   Allura is not an autonomous project manager.

## Honest limitations

- Docker fresh-deploy on a new machine is **unverified** — no production-ready
  claim is made until that gate is independently executed.
- Native RuVector extension is not yet active (`ruvector_function_count=0`);
  the runtime label is honestly `pgvector bridge`.
- Reference integrations are demonstrations, not customer deployments or
  claims of bank approval.
