---
description: "Ralph Loop command mode — bounded iterations in plan, build, or plan-work"
allowed-tools: ["Read", "Bash", "Glob", "Grep", "Edit", "Write", "mcp__MCP_DOCKER__*"]
---

You are now operating in **Ralph Loop mode** — a bounded execution loop where each task is run through explicit iterations with stop criteria and completion checks.

## Mode: `$ARGUMENTS`

Parse the arguments. Default mode is **build**.

- `plan` — Planning mode: gap analysis, generate/update `ralph/IMPLEMENTATION_PLAN.md`, NO implementation
- `build` (default) — Building mode: pick most important task from plan, implement, test, commit
- `plan-work <description>` — Scoped planning: same as plan but limited to the described scope
- `status` — Show current Ralph status (run `ralph --status` via Bash)

## Protocol

### If Mode is `plan`

1. Read `ralph/PROMPT_plan.md` — follow all instructions in that file exactly
2. Study `ralph/specs/*` to understand requirements
3. Study `ralph/IMPLEMENTATION_PLAN.md` if it exists
4. Study `src/lib/*` for shared utilities
5. Compare specs against existing code (DO NOT assume missing — search first)
6. Create or update `ralph/IMPLEMENTATION_PLAN.md` with prioritized tasks
7. Do NOT implement anything

### If Mode is `build`

1. Read `ralph/PROMPT_build.md` — follow all instructions in that file exactly
2. Read `ralph/IMPLEMENTATION_PLAN.md`
3. Read `ralph/specs/*` for requirements context
4. Pick the **most important** unfinished task from the plan
5. Before changing anything, search the codebase (don't assume not implemented)
6. Implement the task completely — no stubs, no placeholders
7. Run validation: `bun run typecheck && bun test`
8. If validations pass: update `ralph/IMPLEMENTATION_PLAN.md` and emit a completion marker when done
9. If tests fail: fix and retry

### If Mode is `plan-work`

1. Read `ralph/PROMPT_plan_work.md`
2. Same as `plan` mode but scope ALL analysis to the work description provided
3. Do NOT expand scope beyond what was described

### If Mode is `status`

1. Run `ralph --status` via Bash to show current loop status
2. Read `ralph/IMPLEMENTATION_PLAN.md` and summarize progress

## ContextScout + Skill Gate (MANDATORY)

Ralph MUST NOT execute any build task unless this gate passes:

```json
{
  "context_loaded": true,
  "context_files": [],
  "brain_memories_checked": true,
  "required_skills": [],
  "skills_loaded": [],
  "validation_commands": []
}
```

**Failure conditions — Ralph MUST refuse:**
- No Scout context loaded (steps ①+② not completed)
- Missing required skill (step ③ not resolved)
- Stale context without acknowledgment
- Missing validation command (step ⑤ not identified)

**On gate failure:** Ralph reports which gate failed and stops. Do not proceed.

## Allura Rules (NON-NEGOTIABLE)

These rules apply in ALL modes:

1. **bun only** — never npm, npx, or node directly
2. **Postgres append-only** — INSERT only, never UPDATE/DELETE on events table
3. **group_id required** — every DB operation must include group_id with allura-* format
4. **Kernel routing** — trace writes go through RuVixKernel.syscall('trace')
5. **Neo4j versioning** — use SUPERSEDES, never edit existing nodes
6. **HITL required** — never autonomously promote to Neo4j without curator flow
7. **MCP_DOCKER tools only** — never docker exec for database operations
8. **Scout-first** — no implementation without Scout context loaded first

## Key Principles

- **One task per invocation by default** — run one bounded task cycle and stop unless loop iterations are explicitly allowed
- **Don't assume missing** — search the codebase first
- **Update the plan** — keep `ralph/IMPLEMENTATION_PLAN.md` current after every action
- **Capture the why** — documentation should explain reasoning, not just what
- **No stubs** — implement completely or don't implement at all
- **Keep AGENTS.md brief** — operational only, progress goes in IMPLEMENTATION_PLAN.md

## For Headless Multi-Iteration Runs

This command runs one bounded cycle. For bounded multi-iteration loops, use:

```bash
ulw-loop                         # build mode, bounded by default
ulw-loop --max-iterations 20     # build mode, max 20
ulw-loop --mode plan            # plan mode
ulw-loop --mode plan --max-iterations 5  # plan mode, max 5
```
