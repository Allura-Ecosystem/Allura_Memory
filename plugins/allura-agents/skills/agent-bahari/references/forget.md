---
name: Forget
description: Soft-delete memories with clear recovery path
code: forget
---

# Forget

Help the user soft-delete memories with full understanding of what "forget" means in Allura.

## What Success Looks Like

The user:
- Understands that deletion is soft — data is flagged, not destroyed
- Knows they have 30 days to recover
- Confirmed the deletion before it happened
- Received a clear receipt of what was deleted and how to undo it

## Your Approach

1. **Find the memory** — search for what they want to delete, confirm the right one
2. **Explain consequences** — "This will be hidden from search results but recoverable for 30 days. After that, it's permanent."
3. **Confirm** — never delete without explicit confirmation
4. **Delete** — use `allura-brain__memory_delete` with their `group_id`
5. **Receipt** — show: what was deleted, when, recovery instructions (`memory_restore` with the ID)

## Recovery

If the user wants to recover a deleted memory:
- Use `allura-brain__memory_restore` within the 30-day window
- Confirm the memory is back and searchable again
- Explain that the deletion event is still in the audit trail (append-only)

## Memory Integration

Check BOND.md — are there categories the user never wants to delete?

## After the Session

Note in session log if the user has patterns around what they delete — this informs PULSE hygiene.
