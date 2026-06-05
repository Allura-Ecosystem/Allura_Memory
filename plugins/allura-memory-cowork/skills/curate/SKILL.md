---
name: curate
description: >
  Curate and promote Allura Brain memories through the HITL approval pipeline.
  Use when the user asks to "promote a memory", "review pending memories",
  "approve memory", "reject memory", "curator queue", "what's pending review",
  "promote to knowledge graph", "move to Neo4j", or any request related to
  the curator approval workflow. Also triggers on "curate", "promotion pipeline",
  "pending proposals", or "review queue".
metadata:
  version: "0.1.0"
---

# Curate

Manage the human-in-the-loop (HITL) promotion pipeline that moves memories from episodic traces (PostgreSQL) to canonical knowledge (Neo4j).

## How the pipeline works

```
memory_add → auto-score → [high score?] → curator queue → human review → promote to Neo4j
                            ↓ no
                         stays as episodic trace (still searchable)
```

Memories are scored at write time. High-scoring memories are automatically queued as curator proposals. A human must approve before anything is promoted to the semantic layer (Neo4j). This is the core governance guarantee.

## Operations

### 1. Promote a memory (`memory_promote`)

Call `mcp__allura-brain__memory_promote` to request promotion of an episodic memory to the semantic layer.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `memory_id` | string | Yes | ID of the episodic memory |
| `group_id` | string | Yes | Must match `^allura-[a-z0-9-]+$` |

This does NOT immediately promote — it creates a proposal in the curator queue. The user (or a curator) must then approve it.

**Error cases:**
- Memory not found → inform user
- Memory already canonical → inform user it's already in Neo4j
- Memory already pending → inform user it's already in the review queue

### 2. Review the curator queue

Search for pending proposals using `mcp__allura-brain__memory_search` with metadata filters for proposal status, or use `mcp__allura-brain__memory_list` filtered to pending items.

Present each pending proposal with:
- Memory content summary
- Curator score
- When it was queued
- Source agent and context

### 3. Approve or reject

Approval and rejection flow through the Allura Brain governance layer. After reviewing a pending proposal:

- **To approve:** Confirm with the user, then call the appropriate approval endpoint. This promotes the memory to Neo4j with a `SUPERSEDES` chain if updating existing knowledge.
- **To reject:** Confirm with the user, provide a reason, then call the rejection endpoint. The memory stays as an episodic trace.

## Neo4j versioning

When a memory is promoted and it updates existing knowledge:

```
(v2:Insight)-[:SUPERSEDES]->(v1:Insight:deprecated)
```

New versions supersede old ones. Old nodes are marked `:deprecated` but never deleted. This preserves the full knowledge evolution history.

## Workflow for reviewing

1. List pending proposals from the curator queue
2. For each proposal, show: content, score, source, timestamp
3. Ask the user for their decision (approve/reject) on each
4. Execute the decision and confirm the outcome
5. For approvals: report that the memory is now in the semantic layer
6. For rejections: confirm the memory remains episodic

## Invariants

- HITL is required — agents cannot autonomously promote to Neo4j
- Every promotion MUST include `group_id`
- Neo4j versioning via `SUPERSEDES` — never edit existing nodes
- Rejected memories stay searchable as episodic traces
- The curator queue is the single gateway to canonical knowledge
