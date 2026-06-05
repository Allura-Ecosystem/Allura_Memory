---
name: remember
description: >
  Store a new memory in Allura Brain. Use when the user asks to
  "remember this", "store this", "save to memory", "log this decision",
  "add to brain", "note that", "record this", or any request to persist
  knowledge, decisions, insights, or context for future recall. Also
  triggers on "memory add", "store in allura", or "save this for later".
metadata:
  version: "0.1.0"
---

# Remember

Store new memories in Allura Brain via `mcp__allura-brain__memory_add`. Memories are scored at write time and routed through the curator pipeline.

## How memory_add works

1. Content is stored as an episodic trace in PostgreSQL (append-only)
2. The curator scorer evaluates the memory and assigns a confidence score
3. High-scoring memories (>= threshold) are queued for curator review
4. Below-threshold memories remain as episodic traces, still searchable

## Parameters

**Required:**

| Param | Type | Notes |
|-------|------|-------|
| `content` | string | The memory content — be specific and self-contained |
| `group_id` | string | Must match `^allura-[a-z0-9-]+$`. Default: `allura-system` |

**Optional:**

| Param | Type | Notes |
|-------|------|-------|
| `user_id` | string | Who created this memory |
| `agent_id` | string | Which agent stored it (e.g. `brooks`, `woz`) |
| `metadata` | object | Arbitrary key-value pairs for context |

## Writing good memories

Extract the essential information from the user's request and store it as a clear, self-contained statement. Apply the Minimal Viable Information (MVI) principle:

- **Core concept** in 1–3 sentences
- **Key details** as structured metadata when applicable
- **Source context** — where this came from (conversation, document, decision)

**Good memory content:**
> "Architecture decision: RuVector is the primary backend for episodic retrieval. Hybrid search uses vector ANN + BM25 RRF fusion. Decided 2026-04-28."

**Bad memory content:**
> "We talked about search stuff and decided to use the new thing."

## Metadata conventions

When storing memories, include relevant metadata:

```json
{
  "source": "conversation",
  "category": "architecture-decision",
  "confidence": "high",
  "tags": ["search", "ruvector", "hybrid"]
}
```

Common categories: `architecture-decision`, `blocker`, `insight`, `requirement`, `session-note`, `learning`, `pattern`.

## Workflow

1. Parse what the user wants to remember
2. Extract and refine the content — make it self-contained and specific
3. Determine appropriate metadata (category, tags, source)
4. Call `memory_add` with `group_id: "allura-system"` (or user-specified group)
5. Confirm storage and report the memory ID and curator score
6. If the score is high enough for promotion, mention it's been queued for review

## Invariants

- Every write MUST include `group_id` — pattern `^allura-[a-z0-9-]+$`
- PostgreSQL traces are append-only — never update or delete raw traces
- Memories are scored automatically; high scores queue for HITL review
- The user does NOT need to take action for scoring — it happens at write time
