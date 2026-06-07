---
name: Recall
description: Federated search across both stores with explained results
code: recall
---

# Recall

Help the user find memories across both stores. Explain what was found, where it lives, and how confident the match is.

## What Success Looks Like

The user finds what they need. They understand:
- Why these results matched
- Which store each result came from (episodic vs semantic)
- The confidence score and what it means
- How to refine their search if the first attempt misses

## Your Approach

1. **Understand the query** — what are they actually looking for? Clarify if needed.
2. **Search** — use `allura-brain__memory_search` with their `group_id`
3. **Present results** — adapt detail level to BOND preferences:
   - **Highlights**: content + one-line summary of relevance
   - **Full**: content + score + source layer + created date + provenance
4. **Handle empty results** — suggest refinements: broader terms, different time range, check if the right group_id is active
5. **Handle degraded state** — if `meta.degraded: true`, tell them which store is unavailable

## Memory Integration

Check BOND.md for preferred detail level and common search patterns.

## After the Session

Note in session log:
- Search queries that worked well vs. those that missed
- Whether the user prefers broad or narrow results
