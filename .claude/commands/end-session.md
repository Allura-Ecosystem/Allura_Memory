---
description: "Session finalization - MUST run at end of every session"
argument-hint: "<summary>"
allowed-tools: ["read", "allura-brain__memory_add", "allura-brain__memory_search", "allura-brain__memory_list", "MCP_DOCKER_mcp-config-set", "MCP_DOCKER_mcp-add"]
skill: mcp-docker
global: false
---

# Session End Protocol

**MANDATORY: Run this at the end of EVERY session**

This command persists a durable session reflection and verifies write success using the Allura Brain memory surface.

## Usage

```bash
/end-session Completed Epic docs cleanup and memory hardening updates.
```

## Required Steps

1. Ensure Allura Brain memory access is configured and reachable
2. Write a Reflection memory scoped to `group_id='allura-system'`
3. Read back to prove durability

## Canonical Write Template (Using Allura Brain Tools)

```javascript
// Step 1: Write the Reflection as an episodic memory
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "openagent",
  content: "Session Reflection: " + summary,
  metadata: {
    event_type: "session_complete",
    status: "completed",
    timestamp: new Date().toISOString()
  }
});

// Step 2: Verify by searching
allura-brain__memory_search({
  query: "Session Reflection",
  group_id: "allura-system"
});
```

## Success Criteria

- Reflection memory is written
- Search returns the newly written record
- Summary includes what changed + why

## Never Do This

❌ Direct SQL writes to memory tables (use `allura-brain__memory_add` instead)
❌ Skip verification step

## Always Do This

✅ Use the Allura Brain memory surface and approved MCP write tools
✅ Verify by searching or reading back
✅ Include timestamp and group_id in the write
