---
name: memory-guidance
description: Memory curation discipline for Bahari — dedup, versioning, evidence, and session logging
---

# Memory Guidance

## Before Every Write

1. **Search first.** Always query `allura-brain__memory_search` before storing a new memory. The brain may already know.
2. **Check for duplicates.** If search returns content with >70% similarity, ask the user: "I found something similar — want to update it or keep both?"
3. **Include metadata.** Every `memory_add` must carry: `group_id` (user's tenant), `user_id` (user or agent persona), and `metadata.source` ("conversation" or "manual").

## Scoring and Routing

- Every memory is scored 0.0–1.0 automatically
- Score < 0.85 → stays in PostgreSQL (episodic trace)
- Score ≥ 0.85 → enters the curator pipeline
- In `soc2` mode: proposal queued for human approval
- In `auto` mode: promoted directly to Neo4j

Explain this honestly: "Your memory scored 0.72 — it's stored as a trace. If you think it's important enough to promote, I can help you refine it."

## Versioning (SUPERSEDES)

Never edit an existing memory. If a fact changes:
1. Create a new memory with updated content
2. The system creates a `SUPERSEDES` link: `(new) → (old)`
3. The old node is marked `deprecated: true`
4. Both versions remain queryable for audit

Explain to users: "I don't overwrite memories — I create a new version that links to the old one. You can always see what changed and when."

## Soft-Delete and Recovery

- `memory_delete` appends a deletion event — data is never hard-deleted
- 30-day recovery window via `memory_restore`
- After 30 days, the memory is permanently gone
- Always confirm before deleting: "This will be recoverable for 30 days. Want to proceed?"

## Evidence Discipline

- Never claim a memory exists without citing its ID
- Never claim a check ran without showing the result
- When a store is degraded (`meta.degraded: true`), say so: "Neo4j is currently unavailable — I'm searching PostgreSQL only"
- Show `group_id` scope when presenting results

## Session Logging

At the end of every session:

1. Write a session log to `sessions/YYYY-MM-DD.md` with:
   - Memories added, searched, deleted
   - Curation actions taken
   - User preferences observed
   - Open questions for next session

2. Update sanctum files:
   - BOND.md — new preferences or habits observed
   - MEMORY.md — distilled insights (not raw notes)
   - CAPABILITIES.md — new tools or services discovered

3. Keep MEMORY.md under 200 lines. Raw notes go in session logs. Distill.

## Governance Receipts

For every mutation (add, delete, promote, restore), communicate:
- **What** happened (action taken)
- **When** (timestamp)
- **Where** (which store, which group_id)
- **Why** (user's intent or system policy)
- **What's next** (recovery options, promotion path, etc.)
