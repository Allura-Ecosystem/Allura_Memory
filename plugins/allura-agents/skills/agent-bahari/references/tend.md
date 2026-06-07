---
name: Tend
description: PULSE autonomous hygiene — 7 checks inherited from Troy
code: tend
---

# Tend (PULSE)

Background hygiene for your owner's memory space. Run these checks autonomously during `--headless` mode. Discover issues — never auto-fix.

## What Success Looks Like

A structured hygiene report is produced showing:
- What was checked
- What was found
- Severity of each finding
- Recommended action (for the user to approve)
- Evidence (memory IDs, counts, queries used)

Nothing is mutated without explicit user approval.

## The Seven Checks

Run in priority order. Use `MCP_DOCKER__execute_sql` (read-only) and `allura-brain__memory_search` for discovery.

### 1. Duplicates (MEDIUM)

Find memory groups with near-identical content within the same `group_id`.

```sql
SELECT id, LEFT(metadata->>'content', 100) as preview, created_at
FROM events
WHERE group_id = '{user_group_id}'
  AND event_type = 'memory_add'
ORDER BY created_at DESC
LIMIT 50
```

Compare content similarity. Flag groups with >70% overlap.

**Recommendation:** "Found 3 memories about the same topic. Want to merge them (keeping the most recent, superseding the rest)?"

### 2. Stale Facts (LOW)

Memories not recalled (no `memory_search` hit) in 30+ days.

**Recommendation:** "These memories haven't been used in a while. Want to review them — keep, archive, or forget?"

### 3. Bad Group IDs (HIGH)

Memories with `group_id` that doesn't match `^allura-[a-z0-9-]+$`.

**Recommendation:** "Found memories with invalid namespace. These need manual correction."

### 4. Missing Embeddings (HIGH)

Episodic memories without vector embeddings — they won't appear in semantic search.

```sql
SELECT COUNT(*) FROM events
WHERE group_id = '{user_group_id}'
  AND event_type = 'memory_add'
  AND (metadata->>'embedding' IS NULL OR metadata->>'embedding' = '')
```

**Recommendation:** "X memories are missing embeddings. They'll be picked up in the next backfill cycle, or you can trigger one manually."

### 5. Legacy Schema (MEDIUM)

References to deprecated columns or field names in metadata.

**Recommendation:** "Found memories using old field names. These still work but should be migrated."

### 6. Retention Candidates (LOW)

Memories older than the retention policy window that haven't been accessed.

**Recommendation:** "These memories are candidates for archival. Review before any action."

### 7. Promotion Candidates (MEDIUM)

High-confidence memories (score ≥ 0.85) still sitting in the episodic layer — never promoted.

```sql
SELECT id, metadata->>'content' as content, metadata->>'score' as score
FROM events
WHERE group_id = '{user_group_id}'
  AND event_type = 'memory_add'
  AND (metadata->>'score')::float >= 0.85
ORDER BY created_at DESC
LIMIT 20
```

Cross-reference with `canonical_proposals` to find memories that were never proposed.

**Recommendation:** "These memories scored high but were never promoted. Want to queue them for review?"

## Report Format

```
Hygiene Report — {date}
Group: {user_group_id}

[HIGH] Missing Embeddings: 5 memories without vectors
[MEDIUM] Duplicates: 2 content groups with near-identical entries
[MEDIUM] Promotion Candidates: 8 high-score memories still episodic
[LOW] Stale Facts: 3 memories unused for 30+ days

Recommendations ready for your review.
```

## Rules

- **Read-only** — never mutate without user approval
- **Evidence-first** — cite memory IDs and query results
- **Stagger checks** — don't run all 7 at once in a single PULSE cycle; prioritize HIGH severity
- **Write findings** — log hygiene results to Brain via `allura-brain__memory_add` with metadata `{ source: "conversation", agent_id: "bahari-curator" }`
- **Escalate HIGH** — if HIGH severity findings exist, flag them prominently for next interactive session
