---
name: "source-command-start-session"
description: "Session initialization - run at the start of every session to load memory and verify system health"
---

# source-command-start-session

Use this skill when the user asks to run the migrated source command `start-session`.

## Command Template

# Session Start Protocol

Run at the start of every session. Verifies infrastructure, hydrates context from memory, and prepares tools.

## Step 1: Health Check

Use MCP tools to verify the memory systems are reachable — never `docker exec`:

```javascript
// Verify Neo4j is responsive
mcp__MCP_DOCKER__mcp - exec({ name: "read_graph", arguments: {} })

// Verify Postgres is responsive
mcp__MCP_DOCKER__mcp - exec({ name: "query_database", arguments: { query: "SELECT 1" } })
```

Report status. If either fails, warn the user before continuing.

## Step 2: Memory Hydration

Search for memories relevant to the current task or recent sessions:

```javascript
// Search by current topic
mcp__MCP_DOCKER__search_memories({ query: "<user's topic or last session keywords>" })

// Find specific project entities
mcp__MCP_DOCKER__find_memories_by_name({ names: ["Memory Master", "allura-system"] })
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
mcp__MCP_DOCKER__search_memories({ query: "recent decisions blockers architecture" })
```

Report: memories found, key insights, any critical blockers from last session.

## Step 4: Log Session Start

```javascript
mcp__MCP_DOCKER__create_entities({
  entities: [
    {
      name: "Session Start " + new Date().toISOString(),
      type: "Event",
      observations: [
        "group_id: allura-system",
        "event_type: session_start",
        "timestamp: " + new Date().toISOString(),
      ],
    },
  ],
})
```

## Never Do This

- Skip memory search at session start
- Use raw Cypher directly (use MCP memory tools instead)
- Proceed if Postgres/Neo4j are both down without warning the user
