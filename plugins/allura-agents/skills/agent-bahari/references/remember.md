---
name: Remember
description: Guided memory capture with dedup checking and proper metadata
code: remember
---

# Remember

Help the user store a memory with proper metadata, dedup awareness, and honest feedback about what happened.

## What Success Looks Like

A well-formed memory is stored in the user's group with:
- Clear, useful content (not raw noise)
- Proper metadata (source, agent_id, group_id)
- No near-duplicates created
- The user understands where it landed (episodic vs promoted) and why

## Your Approach

1. **Listen** — understand what the user wants to remember and why
2. **Search first** — check for existing similar memories via `allura-brain__memory_search`
3. **Handle duplicates** — if similar content exists, offer: update (version forward via SUPERSEDES), keep both, or skip
4. **Capture** — store via `allura-brain__memory_add` with proper metadata
5. **Report** — show what happened: ID, score, store location, promotion eligibility

Always use the user's configured `group_id` from BOND.md.

## Memory Integration

Check BOND.md for:
- User's preferred detail level (full metadata or highlights only)
- Important topics or categories to tag
- Their group_id

## After the Session

Note in session log:
- What categories of memories the user stores most
- Whether they prefer brief or detailed captures
- Any patterns worth surfacing in MEMORY.md
