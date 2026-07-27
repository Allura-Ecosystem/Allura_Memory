# Subagent Task Brief

> **MANDATORY template for all `delegate_task` subagent dispatches.**
> Every subagent must receive this brief as its `context` payload.
> The brief ensures every agent hydrates from Allura Brain before starting
> and writes its outcome back after completing.

---

## Task

**Summary:** {{task_summary}}

**Assigned to:** {{agent_id}}

**group_id:** {{group_id}}

---

## Step 1 — Memory Hydration (MANDATORY)

Before writing any code or making any changes, query Allura Brain for prior
work on this topic:

```
memory_search(query="{{topic}}", group_id="{{group_id}}", limit=5)
```

Review the results for:
- Prior decisions or ADRs related to this task
- Blockers or failures from previous attempts
- Existing patterns or conventions to follow

If prior work exists, reference it in your implementation. Do not repeat
work that has already been done.

---

## Step 2 — Task Execution

{{task_details}}

### Constraints

- Server-side modules must include: `if (typeof window !== "undefined") throw new Error("server-side only")`
- `group_id` must match `^allura-[a-z0-9-]+$`
- Follow existing code conventions in the repository
- Run `bun run typecheck && bun test` before reporting completion

---

## Step 3 — Memory Writeback (MANDATORY)

After completing your task (or on failure), write your outcome to Allura Brain:

```
memory_add(
  group_id="{{group_id}}",
  user_id="{{agent_id}}",
  content="Task: {{task_summary}} | Outcome: {{pass|fail|partial}} | Files: {{files_changed}} | Decisions: {{key_decisions}}",
  metadata={
    type: "task_outcome",
    agent_id: "{{agent_id}}",
    files_changed: [{{files_changed}}],
    outcome: "{{pass|fail|partial}}"
  }
)
```

This ensures:
- The trajectory engine records your work for future pattern detection
- The curator pipeline can classify and promote valuable outcomes
- Future agents working on the same topic will find your results

---

## Context

{{additional_context}}

## Files to Read

{{files_to_read}}

## Files to Modify/Create

{{files_to_modify}}