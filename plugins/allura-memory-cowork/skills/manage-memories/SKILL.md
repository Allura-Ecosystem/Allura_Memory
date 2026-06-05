---
name: manage-memories
description: >
  Manage the lifecycle of Allura Brain memories. Use when the user asks to
  "list my memories", "show recent memories", "update a memory", "delete memory",
  "restore deleted memory", "export memories", "what memories have been deleted",
  "edit memory", "change memory", or any request to view, modify, or manage
  existing memories. Also triggers on "memory list", "memory export",
  "memory restore", "undelete memory", or "show deleted memories".
metadata:
  version: "0.1.0"
---

# Manage Memories

Full lifecycle management for Allura Brain memories: list, update, delete, restore, export, and view deleted.

## Operations

### 1. List memories (`memory_list`)

Call `mcp__allura-brain__memory_list` to show the user's memories.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | No | Filter by user |
| `group_id` | string | Yes | Must match `^allura-[a-z0-9-]+$` |
| `limit` | number | No | Default 20, max 100 |
| `offset` | number | No | For pagination |

Present results as a scannable list: content preview, creation date, and status (episodic/promoted).

### 2. Update memory (`memory_update`)

Call `mcp__allura-brain__memory_update`. This is append-only versioning — the original is preserved and a new version is created with a `SUPERSEDES` relationship.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `memory_id` | string | Yes | ID of memory to update |
| `content` | string | Yes | New content (replaces old via versioning) |
| `group_id` | string | Yes | Must match pattern |

The original memory is never mutated. A new version is created that supersedes it. This preserves the full audit trail.

### 3. Delete memory (`memory_delete`)

Call `mcp__allura-brain__memory_delete`. This is a soft delete with a 30-day recovery window.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `memory_id` | string | Yes | ID of memory to delete |
| `group_id` | string | Yes | Must match pattern |

Confirm with the user before deleting. Mention the 30-day recovery window.

### 4. Restore deleted memory (`memory_restore`)

Call `mcp__allura-brain__memory_restore` to recover a soft-deleted memory within the 30-day window.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `memory_id` | string | Yes | ID of deleted memory |
| `group_id` | string | Yes | Must match pattern |

If the recovery window has expired, inform the user that restoration is no longer possible.

### 5. Export memories (`memory_export`)

Call `mcp__allura-brain__memory_export` to batch export.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string | Yes | Must match pattern |
| `format` | string | No | Export format (default: JSON) |
| `filter` | object | No | Filter criteria (user_id, date range, tags) |

### 6. List deleted memories (`memory_list_deleted`)

Call `mcp__allura-brain__memory_list` with deleted filter (or the dedicated list_deleted tool if available) to show memories in the soft-delete queue.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `group_id` | string | Yes | Must match pattern |
| `limit` | number | No | Default 20 |

Show each deleted memory with its deletion date and remaining recovery time.

## Invariants

- Every operation MUST include `group_id` — pattern `^allura-[a-z0-9-]+$`
- Updates create new versions via `SUPERSEDES` — never mutate the original
- Deletes are soft — 30-day recovery window
- PostgreSQL traces are append-only — the audit trail is preserved
- Always confirm destructive operations (delete) with the user before proceeding
