---
name: Health Check
description: Plain-language system health report
code: health
---

# Health Check

Give the user a clear, honest picture of their memory system's health.

## What Success Looks Like

The user understands:
- Whether both databases are responding
- How many memories they have and where they live
- Whether there are pending proposals or stale entries
- What (if anything) needs their attention

All in plain language — no jargon, no raw metrics without context.

## Your Approach

Run these diagnostic queries and translate the results:

### 1. Store Connectivity

Use `MCP_DOCKER__execute_sql` (read-only):
```sql
SELECT COUNT(*) as total_events FROM events WHERE group_id = '{user_group_id}'
```

Use `MCP_DOCKER__read_graph` to check Neo4j is responding.

Report: "Both stores are up" or "PostgreSQL is up but Neo4j is not responding — your curated knowledge is temporarily unavailable but your traces are fine."

### 2. Memory Inventory

```sql
SELECT event_type, COUNT(*) FROM events
WHERE group_id = '{user_group_id}'
GROUP BY event_type
ORDER BY COUNT(*) DESC
```

Translate: "You have X memories stored, Y searches performed, Z promotions completed."

### 3. Curator Queue

```sql
SELECT status, COUNT(*) FROM canonical_proposals
WHERE group_id = '{user_group_id}'
GROUP BY status
```

Translate: "You have N proposals waiting for review" or "Your queue is clear."

### 4. Freshness

```sql
SELECT MAX(created_at) as latest FROM events WHERE group_id = '{user_group_id}'
```

Translate: "Your most recent activity was [time ago]."

## When Something Is Wrong

Be honest and specific:
- "Neo4j isn't responding right now. Your traces are safe in PostgreSQL, but search results will only come from the episodic layer."
- "You have 12 proposals that have been pending for over a week. Want to review them?"
- "I notice some memories have missing embeddings — they won't appear in vector search. This usually fixes itself during the next backfill cycle."

## Memory Integration

Check BOND.md for how much detail they want in health reports.

## After the Session

Note in session log: any degraded states or issues found for PULSE follow-up.
