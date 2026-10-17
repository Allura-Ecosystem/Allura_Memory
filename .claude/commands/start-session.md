---
description: "Session initialization - run at the start of every session to load memory and verify system health"
allowed-tools:
  [
    "Bash",
    "mcp__MCP_DOCKER__mcp-find",
    "mcp__MCP_DOCKER__mcp-config-set",
    "mcp__MCP_DOCKER__mcp-add",
    "mcp__MCP_DOCKER__notion-fetch",
  ]
---

# Session Start Protocol

Run at the start of every session. Verifies infrastructure, hydrates context from memory, and prepares tools.

## Step 1: Health Check

Use MCP tools to verify the memory systems are reachable — never `docker exec`:

```javascript
// Verify Postgres is responsive
mcp__MCP_DOCKER__mcp - exec({ name: "query_database", arguments: { query: "SELECT 1" } })
```

Report status. If it fails, warn the user before continuing.

## Step 2: Memory Hydration

Search for memories relevant to the current task or recent sessions:

```javascript
// Search by current topic
allura-brain__memory_search({ query: "<user's topic or last session keywords>", group_id: "allura-system" })

// List recent memories for the project scope
allura-brain__memory_list({ group_id: "allura-system" })
```

Report: memories found, key insights, any critical blockers from last session.

## Step 3: Brain Hydration

Search Allura Brain for current context and recent activity:

```javascript
// Search Brain for recent session context
mcp__MCP_DOCKER__execute_sql({
  sql_query: `SELECT event_type, agent_id, metadata, created_at
    FROM events WHERE group_id = 'allura-system'
    ORDER BY created_at DESC LIMIT 20`,
})

// Search for architecture insights
allura-brain__memory_search({ query: "recent decisions blockers architecture", group_id: "allura-system" })
```

Report: memories found, key insights, any critical blockers from last session.

## Step 4: Log Session Start

```javascript
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "<agent_id>",
  content: "Session started " + new Date().toISOString(),
  metadata: { event_type: "session_start" },
})
```

## Never Do This

- Skip memory search at session start
- Use raw SQL directly against memory tables (use MCP memory tools instead)
- Proceed if Postgres is down without warning the user
