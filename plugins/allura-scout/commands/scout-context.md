# scout-context

Create a compact context packet before planning, building, reviewing, or handing off work.

## Prompt

```text
Create an Allura Scout ContextPacket for this task.

Goal:
{user_goal}

Rules:
- Read-only by default.
- Search relevant Allura memory first when available.
- Inspect only likely files.
- Do not dump entire files or long logs.
- Keep the packet under the target token budget.
- Recommend the next route.

Return:
- goal
- summary
- relevant files with reasons
- relevant memories with reasons
- decisions
- risks
- token budget
- recommended route
```

## Success Criteria

- Packet is small enough for the next agent to use directly.
- Every included item has a reason.
- Stale or untrusted context is flagged.
- No implementation is performed.
