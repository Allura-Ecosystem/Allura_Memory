---
name: task-creator
description: "Create structured tasks with Allura Brain integration. Generates task files with proper metadata and links to memory."
allowed-tools: ["Write", "Read", "mcp__MCP_DOCKER__*"]
---

# Task Creator — Structured Task Generation

Create tasks with proper structure, metadata, and memory integration.

## When to Use

- Creating new tasks from requirements
- Breaking down epics into stories
- Generating task files for sprint planning
- Linking tasks to memory insights

## Task Structure

Every task created by `task-creator` follows this structure:

```markdown
---
task_id: TASK-XXX
title: "Task Title"
status: pending
priority: high | medium | low
assignee: agent-name
created: 2026-04-09
epic: EPIC-XXX
memory_links:
  - insight_id: INS-XXX
  - event_id: EVT-XXX
labels: [label1, label2]
---

# Task: Title

## Description
Clear description of what needs to be done.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes
Implementation details, constraints, invariants.

## Memory Context
Links to relevant insights from Allura Brain.

## Dependencies
- TASK-XXX (blocked by)
- TASK-YYY (blocks)
```

## Task Creation Protocol

### Phase 1: Gather Context

```javascript
// Search Allura Brain for related insights
allura-brain__memory_search({ query: "<task topic>", group_id: "allura-<project>" })

// Find related tasks
Grep({ pattern: "TASK-", path: "docs/archive/planning-artifacts/" })
```

### Phase 2: Generate Task ID

```javascript
// Get next task ID
const lastTask = await Grep({ pattern: "TASK-\\d+", path: "docs/archive/" })
const nextId = parseInt(lastTask.match(/\d+/)[0]) + 1
const taskId = `TASK-${String(nextId).padStart(3, '0')}`
```

### Phase 3: Create Task File

```javascript
// Write task file
Write({
  path: `docs/archive/planning-artifacts/tasks/${taskId}.md`,
  content: taskContent
})
```

### Phase 4: Link to Memory

```javascript
// Record the task as an episodic trace in Allura Brain (PostgreSQL + RuVector)
allura-brain__memory_add({
  group_id: "allura-<project>",
  content: `${taskId} created`,
  metadata: {
    entity_type: "task",
    task_id: taskId,
    created_at: new Date().toISOString(),
    status: "pending",
    priority,
    linked_to: insightId
  }
})
```

## Task Types

| Type | Prefix | Description |
|------|--------|-------------|
| Feature | FEAT-XXX | New functionality |
| Bug | BUG-XXX | Defect fix |
| Refactor | REF-XXX | Code improvement |
| Docs | DOC-XXX | Documentation |
| Test | TEST-XXX | Testing |
| Infra | INF-XXX | Infrastructure |

## Example Usage

```
User: "Create a task for adding OAuth2 authentication"

task-creator creates:
- TASK-042: Add OAuth2 authentication
- Links to memory insights about auth patterns
- Sets priority based on epic priority
- Assigns to Woz (implementation)
```

---

**Invoke with:** `task-creator <task description>`