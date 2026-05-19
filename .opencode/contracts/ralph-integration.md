# Ralph Loop Integration Contract

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.

This contract defines how Open Ralph Wiggum integrates with the Allura harness for autonomous task execution.

---

## 1. Integration Overview

**Ralph Wiggum** is an autonomous agentic loop tool that wraps AI coding agents in a self-correcting iteration cycle. It complements (not replaces) the Brooksian surgical team.

### Role in Surgical Team

| Agent / Tool | Role | When to Use |
|--------------|------|-------------|
| **Brooks (Architect)** | System design, ADRs, decisions | Architecture work |
| **Jobs (Conductor)** | Todo orchestration | Task coordination |
| **Woz (Implementer)** | Deep implementation | Complex features |
| **Ralph tool** | Autonomous iteration harness | Clear criteria, NIGHT_BUILD |

**Ralph is a toolsmith's harness** — it runs the loop, doesn't design the architecture.

---

## 2. When to Use Ralph

### ✅ Use Ralph When:
- Task has clear completion criteria (tests pass, typecheck clean)
- Requirements are well-defined (JSON feature list or PRD)
- Autonomous execution is appropriate (NIGHT_BUILD mode)
- Human judgment is NOT required mid-task
- Task has automatic verification (linters, tests, type checking)

### ❌ Do NOT Use Ralph When:
- Architecture decisions are needed (use brooks-architect)
- Requirements are ambiguous (use DAY_BUILD with approval gates)
- Human judgment is required (use approval gates)
- Task requires creative design decisions
- Success criteria are unclear

---

## 3. Integration with Harness Modes

### DAY_BUILD Mode

**Rule**: Do NOT use Ralph in DAY_BUILD mode.

**Reason**: DAY_BUILD requires approval gates for every decision. Ralph is designed for autonomous execution.

**Alternative**: Use standard OpenCode workflow with ContextScout → Jobs → Brooks + Teams routing → Approval → Implementation.

### NIGHT_BUILD Mode

**Rule**: Ralph is the preferred execution method for NIGHT_BUILD.

**Reason**: NIGHT_BUILD is designed for autonomous execution with clear criteria.

**Workflow**:
```
1. Brooks reviews architecture (ADR created)
2. TaskManager breaks down epic into stories
3. Ralph executes each story autonomously
4. Brooks reviews results, logs completion
```

---

## 4. Routing Policy

### Updated Routing Table

| Task Type | Primary Agent | Fallback | Condition |
|-----------|---------------|-----------|-----------|
| Discovery | ContextScout | None | Always |
| Intent/Scope | Jobs | None | Always |
| Architecture | Brooks | None | Always |
| Implementation (DAY) | Woz | Fowler | With approval gates |
| Implementation (NIGHT) | **Ralph tool** | Woz | Autonomous |
| Refactor | Fowler | Woz | If clear criteria |
| Performance | Bellard | Carmack | Only if perf constraint |
| Validation | Pike + Fowler | Ralph tool | If automated tests |

### Fallback Logic

```
function selectExecutionMethod(mode, taskType, criteriaClarity):
    if mode == DAY_BUILD:
        return "approval-gates"  # Never use Ralph
    
    if mode == NIGHT_BUILD:
        if criteriaClarity == "high":
            return "ralph"  # Autonomous execution tool
        else:
            return "approval-gates"  # Fall back to approval
    
    return "approval-gates"  # Default to safe mode
```

---

## 5. PRD Format for Ralph

### Recommended: JSON Feature List

Based on Anthropic's research, JSON format reduces the chance of agents modifying test definitions.

**File**: `ralph/features.json`

```json
{
  "features": [
    {
      "category": "functional",
      "description": "Record Raw Execution Traces — Schema + Kernel Routing",
      "steps": [
        "Add evidence_ref and confidence columns to events table",
        "Wire trace writes through RuVixKernel.syscall('trace')",
        "Wire TraceMiddleware into agent execution paths",
        "Run bun run typecheck — zero errors",
        "Run bun test — all 42 tests pass"
      ],
      "passes": false
    }
  ]
}
```

### Prompt Template

```
Read ralph/features.json. Work through each feature one at a time.
After verifying a feature works end-to-end, update its "passes" field to true.
Do NOT modify the description or steps - only change the passes boolean.
Output <promise>COMPLETE</promise> when all features pass.
```

---

## 6. Allura-Specific Rules (NON-NEGOTIABLE)

When using Ralph with Allura, these rules MUST be enforced:

1. **bun only** — never npm, npx, or node directly
2. **Postgres is append-only** — INSERT only, never UPDATE/DELETE on events table
3. **group_id required** — every DB operation must include group_id with allura-* format
4. **Kernel routing** — trace writes go through RuVixKernel.syscall('trace'), not direct inserts
5. **Neo4j versioning** — use SUPERSEDES relationships, never edit existing nodes
6. **HITL** — never autonomously promote to Neo4j without going through curator flow
7. **MCP_DOCKER tools only** — never docker exec for database operations

These rules should be included in the prompt file passed to Ralph.

---

## 7. Monitoring and Control

### Status Dashboard

From another terminal while Ralph is running:

```bash
ralph --status
```

Shows:
- Active loop info (iteration, elapsed time, prompt)
- Pending context
- Current tasks
- Iteration history (last 5)
- Struggle indicators

### Mid-Loop Context Injection

Guide a struggling agent without stopping the loop:

```bash
ralph --add-context "The bug is in trace-logger.ts — check syscall routing"
```

Context is automatically consumed after one iteration.

### Stopping the Loop

- `Ctrl+C` — Graceful stop
- `ralph --clear-context` — Clear pending context

---

## 8. Quality Gates

Before marking a task complete, Ralph MUST verify:

1. **TypeScript**: `bun run typecheck` passes with zero errors
2. **Tests**: `bun test` passes (all tests green)
3. **Acceptance Criteria**: All ACs verified
4. **Documentation**: Updated if interfaces changed

---

## 9. Example Workflows

### Epic Completion (NIGHT_BUILD)

```bash
# 1. Brooks creates architecture
brooks-architect "Design Epic 1 architecture"

# 2. TaskManager breaks down
task-manager "Break Epic 1 into stories"

# 3. Ralph executes autonomously
ralph "Read ralph/features.json. Work through each feature. Update passes to true when verified. Output <promise>COMPLETE</promise> when all pass." \
  --tasks \
  --max-iterations 50 \
  --agent claude-code

# 4. Monitor from another terminal
ralph --status

# 5. Inject hints if struggling
ralph --add-context "Check trace-logger.ts for syscall routing"
```

### Single Story (NIGHT_BUILD)

```bash
ralph "Implement Story 1.1 from ralph/prd.json. All acceptance criteria must pass. Output <promise>COMPLETE</promise> when done." \
  --max-iterations 30 \
  --agent claude-code \
  --model claude-sonnet-4
```

---

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| Loop never terminates | Check prompt includes `<promise>COMPLETE</promise>` |
| Agent modifies test definitions | Use JSON feature list format |
| Agent loops on question | Use `--no-questions` or answer interactively |
| Plugin conflicts (OpenCode) | Use `--no-plugins` |
| Model not found | Set model in opencode.json or use `--model` |
| Struggle detected | Use `--add-context` to inject hints |

---

## 11. See Also

- [Open Ralph Wiggum GitHub](https://github.com/Th0rgal/open-ralph-wiggum)
- [Harness Contract v1](./harness-v1.md)
- [Brooksian Surgical Team](../.claude/rules/agent-routing.md)
- [Agent Metadata](../config/agent-metadata.json)
