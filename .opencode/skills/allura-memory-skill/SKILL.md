---
name: allura-memory-skill
description: Retrieve scoped Allura Brain context and append verified episodic outcomes through the authenticated MCP tools. Human curators own semantic promotion.
---

# Allura Memory Skill

> [!NOTE]
> **AI-Assisted Documentation** — reconciled against the current project authority contract; full human document review remains pending.

## Authority and storage

For this repository use `group_id: allura-system` on every operation and
`include_global: false` on supported searches. A valid `allura-*` name is not an
access grant. The authenticated transport owns persisted identity: omit `user_id`
unless the live schema requires it and the authenticated principal is verified.
Never substitute a persona. Omit agent attribution unless the verified workspace
accepts it. Do not change tenant, endpoint or credentials after denial.

PostgreSQL owns append-only events and audit traces, immutable semantic versions
and `graph_supersedes` lineage. RuVector/pgvector retrieval capabilities require
separate deployment evidence. The retired Neo4j selector is rejected; no fallback
is authorized. Human approval through `curator:approve` is required for promotion;
writing an outcome does not authorize promotion, correction, restore or export.

## Retrieve, work, attest

1. Discover the actual host tools and their input schemas. Use the permitted
   MCP_DOCKER route for Brain database operations. Tool names below are conceptual
   operations, not promises that a particular alias exists.
2. Search before substantive planning with a focused topic plus decisions,
   blockers and outcomes; normally limit 5. If the discovered schema supports
   `status: all`, use it when episodic history is needed. Approved-only results
   exclude unpromoted traces; an empty result does not prove no history exists.
3. Reconcile retrieved evidence with current source revision, scope and owner
   decisions. Reuse only fresh context matching the same objective and authority.
4. After verified substantive work and within authorized write scope, append one
   concise outcome: result, source revision/files, validation, decisions and risk.
   Do not log startup chatter, temporary reasoning or duplicate progress.
5. Verify persistence as described below. Never approve or promote the outcome.

Illustrative argument shapes, valid only when the discovered schema accepts them:

```javascript
memory_search({
  group_id: "allura-system",
  query: "<topic> decisions blockers outcomes",
  include_global: false,
  status: "all",
  limit: 5
})
memory_add({
  group_id: "allura-system",
  content: "OUTCOME: <result; revision; validation; remaining risk>",
  metadata: { source: "conversation" }
})
```

Do not invent `confidence`, `story_id`, `review_type` or an idempotency argument.
Put task details in content unless the live schema explicitly accepts them.

## Write verification and failure handling

Use one task-scoped idempotency key through a verified server-supported field or
transport mechanism for the original write and every retry. A marker in content
alone is not server-enforced idempotency. If the exposed tool cannot satisfy the
project's key/read-back contract, do not issue an unverifiable write; retain a
sanitized task evidence receipt outside `docs/allura/` and report the unmet gate.
This is work evidence, not a substitute memory bank.

Claim success only after read-back confirms destination, executing principal,
record ID, expected content marker/digest and receipt. Timeout or ambiguous output
means pending/unknown; resume the same request where possible and never retry with
a new key. A successful connection or discovered tool does not prove a read/write.
Report tool-not-found, denied, empty, degraded and pending results separately.
Continue independent local work where permitted; stop only the operations whose
correctness or authority depends on missing evidence. Do not describe a timeout
as disconnection or silently reroute a write.

Corrections to episodic history are new traces citing the earlier record.
Semantic changes use human-reviewed immutable versions and lineage, never direct
SQL or graph mutation. Unexpected storage/promotion behavior requires inspection,
not a claim of approval. Preserve all project write holds and transfer boundaries.

## Governing references

- [AI guidelines](../../../guidelines/AI-GUIDELINES.md)
- [Architecture](../../../docs/allura/SOLUTION-ARCHITECTURE.md)
- [Data dictionary](../../../docs/allura/DATA-DICTIONARY.md)
- [Open decisions](../../../docs/allura/RISKS-AND-DECISIONS.md)
