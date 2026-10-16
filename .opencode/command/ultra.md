---
description: "Ultra work-until-done — bounded Team RAM execution until validation passes"
allowed-tools: ["Read", "Bash", "Glob", "Grep", "Edit", "Write", "mcp__MCP_DOCKER__*"]
---

# Ultra Work-Until-Done (`ultra`)

`ultra` coordinates bounded work using the current `/goal` lifecycle.

## Mode: `$ARGUMENTS`

Default mode is **work**.

- `work` — plan, implement, validate, repeat until done or blocked
- `plan` — analyze scope and update the loop plan only
- `status` — summarize current loop status, blockers, and next action

## Protocol

### If Mode is `work`

1. Read `.opencode/AI-GUIDELINES.md`
2. Read `.opencode/STARTUP.md`
3. Read `.opencode/command/goal.md` and the approved task's completion criteria
4. Hydrate local context and search Allura Brain before editing
5. Resolve required skills before implementation
6. Implement the smallest valid slice
7. Validate with the lightest meaningful checks
8. For an approved active goal, use `/goal run [goal-id]` for one iteration
   (`--max-iterations 1`). Recheck validation after each iteration; stop when done,
   blocked, or the user-specified iteration/time/token budget is reached. Require
   an explicit finite bound before continuing; never start an unbounded loop.

### If Mode is `plan`

1. Read `.opencode/STARTUP.md` and `.opencode/command/goal.md`
2. Review current repo state and identify the next bounded slice
3. Update the loop plan only
4. Do not implement

### If Mode is `status`

1. Summarize the current plan, blockers, and validation state
2. Report whether the loop is safe to continue

## Loop Rules

- Scout-first is mandatory.
- Validation happens before declaring done.
- Stop on destructive risk, secret risk, or an unclear irreversible change.
- Keep changes minimal and reversible.
- `ultra` has no final governance authority; it executes work only.
