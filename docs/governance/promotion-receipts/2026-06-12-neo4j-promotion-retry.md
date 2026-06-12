# Promotion Receipt — 2026-06-12 (Neo4j Unblock + 6 Receipts)

**Date:** 2026-06-12
**Operator:** sabir-hitl-2026-06-12-retry (Brooks orchestrating)
**Branch:** fix/neo4j-bolt-scheme-and-promotion
**Group:** allura-system

---

## What this receipt covers

Two coupled problems from the 2026-06-12 close ledger, both closed in this session:

1. **Last-session blocker: Bolt driver hang.** `scripts/approve-proposals-by-id.ts` was
   proven on dry-run (gate passed 6/6) but `--execute` hung indefinitely.
2. **Carry-forward #1: 6 phase-0 / boot-v2 memories awaiting promotion.** The ledger
   named "6/6 dry-run; execute blocked" — those 6 needed to land.

Both close together because the *same* root cause fixed #1 and unblocked #2.

---

## Root cause (Iron Law — no fix without root cause)

`.env` line 15 was:

```diff
-NEO4J_URI=neo4j://localhost:7687
+NEO4J_URI=bolt://localhost:7687
```

**Why this matters.** The `neo4j-driver` library distinguishes two URI schemes:

- `bolt://` — direct bolt protocol, single-instance server.
- `neo4j://` — driver-routing scheme, expects server-side cluster routing (Neo4j 4.x+).

Against a single-instance Neo4j on port 7687, `neo4j://` makes the driver attempt
routing-table resolution and **hangs without an error** until a manual timeout.

**Evidence that this is the root cause** (not a guess):

| URI | Handshake | Result |
| --- | --- | --- |
| `neo4j://localhost:7687` | ∞ hang | timeout / driver close |
| `bolt://localhost:7687` | **468ms** | `RETURN 1` → `1`, clean close |

**Why this is drift, not a one-off.** Every default in the codebase already used
`bolt://`:

- `src/mcp/canonical-tools/connection.ts:64` — `process.env.NEO4J_URI || "bolt://localhost:7687"`
- `src/lib/neo4j/connection.ts:81` — same
- `src/app/api/health/metrics/route.ts:158` — same
- 9 test files use `bolt://` as their canonical URI
- `src/team-ram/mcp-skill-executor.test.ts` asserts `bolt://` end-to-end

The `.env` (and `.env.example`) were the lone outliers. This is the **same shape**
as Criterion 1's `.env` PG drift — local env file drifting from the codebase's
canonical defaults.

---

## Fix

Two commits on `fix/neo4j-bolt-scheme-and-promotion`:

| Commit | Hash | Subject |
| --- | --- | --- |
| 1 | `79c51551` | `chore(env): fix NEO4J_URI scheme in .env.example (neo4j:// → bolt://)` |
| 2 | `2bbb0665` | `chore(curator): add per-id HITL approval script (scripts/approve-proposals-by-id.ts)` |

Commit 1 fixes `.env.example` (the canonical source for new clones). The local
`.env` fix is gitignored by design (secrets/dev drift) but is mirrored in this
receipt so the fix is durable in human memory.

---

## Promotion execution — 6 receipts

Command run (live, on main, against the new env):

```bash
bun scripts/approve-proposals-by-id.ts \
  --decided-by=sabir-hitl-2026-06-12-retry --execute \
  ddc8907e 83150d4d a6b3e791 5f4e322f 8aeb51a6 d0790259
```

Output (truncated):

```
[Per-ID] Executed: 6 approved, 0 failed, 0 not found
```

### Receipts

| Proposal ID | Score | Tier | Memory (Insight) ID | Created insight_id |
| --- | --- | --- | --- | --- |
| `ddc8907e-6e63-4956-8d2a-6b4b48ccdc44` | 1.00 | mainstream | bmad-loop iteration 1 receipt | `6ccd1e92-eddb-475f-b101-3dca56954b22` |
| `83150d4d-aadd-4448-b288-4bc8889c3dda` | 0.85 | mainstream | Phase 0 "done" = release-approved (8 criteria) | `3ac933a4-620e-40fa-b4b3-e17206065052` |
| `a6b3e791-bf14-46e4-bfee-fbcf36490c8a` | 1.00 | mainstream | BOOT-PROTOCOL-V2 PROOF RUN | `6ce83081-90c3-44c2-be1c-2661cd70a148` |
| `5f4e322f-1e55-40b2-819d-59d6dc722e1b` | 0.85 | mainstream | SESSION_END (boot v2 live) | `dd946026-58da-4b38-97f6-810cee93e728` |
| `8aeb51a6-79d9-4f0a-a9d8-1891f4da1c8a` | 0.85 | mainstream | SESSION CLOSE 2026-06-12 (this ledger) | `9a4813ad-f2b7-4f5b-a176-3483946ddcd5` |
| `d0790259-15e2-4796-9bb4-f569a26fcbaa` | 0.85 | mainstream | CONSOLIDATION — hydration gap (promotion stall) | `e1659038-eb56-443f-b9a5-07fcf40a7652` |

### PostgreSQL verification

```
canonical_proposals: 6/6 status=approved, decided_by=sabir-hitl-2026-06-12-retry
events:               6/6 proposal_approved appended, append-only
```

### Neo4j verification (live query)

```
MATCH (i:Insight) WHERE i.created_by = 'sabir-hitl-2026-06-12-retry'
RETURN i.insight_id, i.confidence, i.source_type, i.topic_key
→ 6 nodes
→ all source_type=promotion
→ all topic_key=curator.mainstream
→ confidence matches proposal score (1.0 or 0.85)
→ trace_ref backlinked into metadata
```

---

## Drift observed (carry-forward, non-blocking)

`createInsight` stored the `metadata` payload as a **JSON STRING** on the
`Insight` node, not a real Cypher map. Round-trips fine, but any query that
indexes into a metadata field (e.g. `MATCH ... i.metadata.proposal_id`) crashes
with `Neo.ClientError.Statement.TypeError: Expected ... to be of type MAP, but
was of type STRING NOT NULL`.

**Fix surface:** `src/lib/neo4j/queries/insert-insight.ts` — pass `metadata` as
a real object/Map, not `JSON.stringify(...)`. Should be a 1-line diff and a
test assertion in `insert-insight.test.ts`. **Not in scope for this commit.**

---

## Carry-forward from this session

1. **Criterion 1 — `.env` PG drift + E2E host run** (carried forward from prior session).
2. **insert-insight metadata as MAP, not JSON string** (discovered during this promotion).
3. **`src/middleware.ts` is DELETED** on `main`; `src/proxy.ts` is its probable
   replacement. Confirm before any commit. Do not lose this deletion in a
   cleanup pass.
4. **The 6-from-12 ambiguity**: today's 12 pending proposals are a coherent batch,
   but the ledger only authorized 6. The remaining 6 are still pending and need
   an explicit HITL decision before any next promotion run.

---

## What closes the ledger

| Item | Status |
| --- | --- |
| Last-session blocker (Bolt hang) | ✅ closed (468ms handshake, 6/6 execute) |
| 6 phase-0 / boot-v2 receipts | ✅ landed in PG + Neo4j |
| `.env.example` drift fix | ✅ committed `79c51551` |
| Per-ID approval script in git | ✅ committed `2bbb0665` |
| Brain outcome log | ✅ mem `cb1f7cc7` (allura-system) |

**This receipt IS the third commit. No code changed; the receipt's job is to make
the promotion evidence durable in git, not in memory.**
